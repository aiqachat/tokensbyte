pub mod router;
pub mod stream;

use axum::{
    extract::{State, Extension, Path},
    Json,
    response::IntoResponse,
};
use std::sync::Arc;
use crate::AppState;
use crate::models::{ApiToken, Channel};
use crate::providers::{ChatRequest, get_provider};
use crate::error::{AppError, AppResult};

pub async fn chat_completions(
    State(state): State<Arc<AppState>>,
    Extension(token): Extension<ApiToken>,
    Json(mut request): Json<ChatRequest>,
) -> AppResult<impl IntoResponse> {
    // 1. Validate model access
    if !token.is_model_allowed(&request.model) {
        return Err(AppError::Forbidden(format!("Model {} not allowed for this token", request.model)));
    }

    // 2. Select channel (Routing & Load Balancing)
    let channel = router::select_channel(&state, &request.model).await?;

    // 3. Get provider implementation
    let provider = get_provider(&channel.provider_type);

    // 4. Handle Streaming vs Non-Streaming
    if request.stream.unwrap_or(false) {
        let response = provider.chat_completions_stream(&state.http_client, &channel, &request).await?;
        Ok(stream::handle_chat_stream(state, token, channel, request.model, response).await.into_response())
    } else {
        let response = provider.chat_completions(&state.http_client, &channel, &request).await?;
        
        // 5. Billing with Custom Model Rates & Group Multipliers
        let prompt_tokens = response.usage.as_ref().map(|u| u.prompt_tokens).unwrap_or(0);
        let completion_tokens = response.usage.as_ref().map(|u| u.completion_tokens).unwrap_or(0);
        
        let user: crate::models::User = sqlx::query_as("SELECT * FROM users WHERE id = ?")
            .bind(&token.user_id)
            .fetch_one(&state.db.pool)
            .await?;

        // Fetch model config from DB
        let db_model: Option<crate::models::Model> = sqlx::query_as("SELECT * FROM models WHERE model_id = ? AND is_active = 1")
            .bind(&request.model)
            .fetch_optional(&state.db.pool)
            .await?;

        let quota_used = match db_model {
            Some(m) => {
                let multiplier = m.get_multiplier_for_group(&user.user_group);
                match m.billing_type.as_str() {
                    "requests" => m.fixed_rate * multiplier,
                    "duration" => {
                        // Assuming latency_ms is recorded or passed. 
                        // For non-streaming, we can use the time elapsed if we had a start time.
                        // For now, let's use a default or look for latency in the future implementation.
                        0.0 // Placeholder for duration billing
                    },
                    _ => { // default: tokens
                        ((prompt_tokens as f64 * m.prompt_rate + completion_tokens as f64 * m.completion_rate) / 1000.0) * multiplier
                    }
                }
            },
            None => {
                // Fallback to default pricing if model not managed
                let total_tokens = prompt_tokens + completion_tokens;
                let mut multiplier = 1.0;
                if user.user_group == "vip" {
                    multiplier = 0.8;
                } else if user.user_group == "partner" {
                    multiplier = 0.5;
                }
                (total_tokens as f64 / 1000.0) * multiplier
            }
        };
        
        sqlx::query(
            "UPDATE api_tokens SET quota_used = quota_used + ?, updated_at = datetime('now') WHERE id = ?"
        )
        .bind(quota_used)
        .bind(token.id)
        .execute(&state.db.pool)
        .await?;


        // 6. Record Log
        sqlx::query(
            r#"INSERT INTO logs (user_id, channel_id, token_id, model, prompt_tokens, completion_tokens, cost, status_code, endpoint)
               VALUES (?, ?, ?, ?, ?, ?, ?, 200, '/v1/chat/completions')"#
        )
        .bind(&token.user_id)
        .bind(channel.id)
        .bind(token.id)
        .bind(&request.model)
        .bind(prompt_tokens)
        .bind(completion_tokens)
        .bind(quota_used)
        .execute(&state.db.pool)
        .await?;


        Ok(Json(response).into_response())
    }
}
