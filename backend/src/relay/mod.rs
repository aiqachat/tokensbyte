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

    // Fetch user info including balance, group, and discount first
    let user_info: (String, f64, f64) = sqlx::query_as(
        &state.db.format_query("SELECT u.user_group, u.balance, COALESCE(ul.discount, 1.0) as discount 
         FROM users u 
         LEFT JOIN user_levels ul ON u.user_group = ul.group_key 
         WHERE u.id = ?")
    )
    .bind(&token.user_id)
    .fetch_one(&state.db.pool)
    .await?;

    let (user_group, balance, discount) = user_info;

    // 2. Select channel (Routing & Load Balancing) with user group restrictions
    let channel = router::select_channel(&state, &request.model, &user_group).await?;

    // Check if user has enough balance (if not using pre-paid token quota)
    if token.quota_limit < 0.0 && balance <= 0.0 {
        return Err(AppError::Forbidden("Insufficient user balance".to_string()));
    }

    // 3. Get provider implementation
    let provider = crate::providers::get_provider(&channel.provider_type);

    // 4. Handle Streaming vs Non-Streaming
    if request.stream.unwrap_or(false) {
        let prompt_tokens = request.estimate_prompt_tokens();
        let response = provider.chat_completions_stream(&state.http_client, &channel, &request).await?;
        Ok(stream::handle_chat_stream(state, token, channel, request.model, response, discount, prompt_tokens).await.into_response())
    } else {
        let response = provider.chat_completions(&state.http_client, &channel, &request).await?;
        
        // 5. Billing with Custom Model Rates & User Level Discounts
        let prompt_tokens = response.usage.as_ref().map(|u| u.prompt_tokens).unwrap_or(0);
        let completion_tokens = response.usage.as_ref().map(|u| u.completion_tokens).unwrap_or(0);
        
        // Fetch model config from DB
        let db_model: Option<crate::models::Model> = sqlx::query_as(&state.db.format_query("SELECT * FROM models WHERE model_id = ? AND is_active = 1"))
            .bind(&request.model)
            .fetch_optional(&state.db.pool)
            .await?;

        let quota_used = match db_model {
            Some(m) => {
                match m.billing_type.as_str() {
                    "requests" => m.fixed_rate * discount,
                    "duration" => {
                        0.0 // Placeholder for duration billing
                    },
                    _ => { // default: tokens
                        let mut p_rate = m.prompt_rate;
                        let mut c_rate = m.completion_rate;

                        if m.billing_rule == "tiered" {
                            let tiers: Vec<crate::models::PricingTier> = serde_json::from_str(&m.pricing_tiers).unwrap_or_default();
                            // Sort tiers by max_tokens and find the first one that fits
                            let mut sorted_tiers = tiers;
                            sorted_tiers.sort_by_key(|t| t.max_tokens);
                            for tier in sorted_tiers {
                                if prompt_tokens <= tier.max_tokens {
                                    p_rate = tier.prompt_rate;
                                    c_rate = tier.completion_rate;
                                    break;
                                }
                            }
                        }

                        let divisor = 1_000_000.0;
                        ((prompt_tokens as f64 * p_rate + completion_tokens as f64 * c_rate) / divisor) * discount
                    }
                }
            },
            None => {
                // Fallback to default pricing ($1/1M tokens) if model not managed
                let total_tokens = prompt_tokens + completion_tokens;
                (total_tokens as f64 / 1_000_000.0) * discount
            }
        };
        
        // Use transaction to update both token quota and user balance
        let mut tx = state.db.pool.begin().await?;

        sqlx::query(
            &state.db.format_query("UPDATE api_tokens SET quota_used = quota_used + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        )
        .bind(quota_used)
        .bind(token.id)
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            &state.db.format_query("UPDATE users SET balance = balance - ?, used_quota = used_quota + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        )
        .bind(quota_used)
        .bind(quota_used)
        .bind(&token.user_id)
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;


        // 6. Record Log
        sqlx::query(
            &state.db.format_query(r#"INSERT INTO logs (user_id, channel_id, token_id, model, prompt_tokens, completion_tokens, cost, status_code, endpoint)
               VALUES (?, ?, ?, ?, ?, ?, ?, 200, '/v1/chat/completions')"#)
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
