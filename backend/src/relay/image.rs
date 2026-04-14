//! Relay: POST /v1/images/generations
//! OpenAI-compatible image generation endpoint with automatic protocol conversion.

use axum::{extract::{State, Extension}, response::Response, Json};
use std::sync::Arc;
use crate::{AppState, error::{AppError, AppResult}};
use crate::models::ApiToken;
use super::proxy;

pub async fn image_generations(
    State(state): State<Arc<AppState>>,
    Extension(token): Extension<ApiToken>,
    Json(body): Json<serde_json::Value>,
) -> AppResult<Response> {
    let model = body["model"].as_str().unwrap_or("dall-e-3");
    let ctx = proxy::get_user_context(&state, &token.user_id).await?;
    proxy::check_access(&token, model, ctx.balance)?;
    let (channel, resolved_model) = proxy::select_channel_for_model(&state, model, &ctx.user_group).await?;
    let is_stream = body["stream"].as_bool().unwrap_or(false);

    // Google channels: transform to Gemini contents format
    let upstream_resp = if channel.provider_type == "google" {
        let prompt = body["prompt"].as_str().unwrap_or("Generate an image");
        let action = if is_stream { "streamGenerateContent" } else { "generateContent" };
        let url = format!(
            "{}/v1beta/models/{}:{}?key={}",
            channel.base_url.trim_end_matches('/'), resolved_model, action, channel.api_key
        );
        let gemini_body = serde_json::json!({
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]}
        });
        state.http_client.post(&url).json(&gemini_body).send().await?
    }
    // Other channels: passthrough OpenAI format
    else {
        let url = format!("{}/v1/images/generations", channel.base_url.trim_end_matches('/'));
        let mut fwd = body.clone();
        fwd["model"] = serde_json::json!(resolved_model);
        state.http_client.post(&url)
            .header("Authorization", format!("Bearer {}", channel.api_key))
            .json(&fwd)
            .send().await?
    };

    let status = upstream_resp.status().as_u16();
    if !upstream_resp.status().is_success() {
        let err = upstream_resp.text().await?;
        proxy::record_and_bill(&state, &token, channel.id, model, 0.0, status, "/v1/images/generations", Some(&err)).await;
        return Err(AppError::UpstreamError(err));
    }

    let cost = proxy::get_model_cost(&state, model, ctx.discount).await;
    proxy::record_and_bill(&state, &token, channel.id, model, cost, 200, "/v1/images/generations", None).await;

    // Stream response for Gemini stream mode; otherwise buffer JSON
    if is_stream && channel.provider_type == "google" {
        Ok(Response::builder()
            .header("Content-Type", "text/event-stream")
            .header("Cache-Control", "no-cache")
            .body(axum::body::Body::from_stream(upstream_resp.bytes_stream()))
            .unwrap())
    } else {
        let data = upstream_resp.bytes().await?;
        Ok(Response::builder()
            .header("Content-Type", "application/json")
            .body(axum::body::Body::from(data))
            .unwrap())
    }
}
