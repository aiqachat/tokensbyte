//! Relay: POST /v1/images/generations
//! OpenAI-compatible image generation endpoint with automatic protocol conversion.

use axum::{extract::{State, Extension}, response::{Response, IntoResponse}, Json};
use std::sync::Arc;
use crate::{AppState, error::{AppError, AppResult}};
use crate::models::ApiToken;
use super::proxy;
use super::url_utils::join_url;

pub async fn image_generations(
    State(state): State<Arc<AppState>>,
    Extension(token): Extension<ApiToken>,
    Json(body): Json<serde_json::Value>,
) -> AppResult<Response> {
    let start_time = std::time::Instant::now();
    let request_content_str = serde_json::to_string(&body).unwrap_or_default();
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
            "{}?key={}",
            join_url(&channel.base_url, &format!("/v1beta/models/{}:{}", resolved_model, action)),
            channel.api_key
        );
        let gemini_body = serde_json::json!({
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]}
        });
        state.http_client.post(&url).json(&gemini_body).send().await?
    }
    // Volcengine channels: transform to contents/generations format
    else if channel.provider_type == "volcengine" {
        let prompt = body["prompt"].as_str().unwrap_or("Generate an image");
        let url = join_url(&channel.base_url, "/api/v3/contents/generations/tasks");
        let volc_body = serde_json::json!({
            "model": resolved_model,
            "content": [{"type": "text", "text": prompt}],
            "ratio": "1:1",
            "watermark": false
        });
        state.http_client.post(&url)
            .header("Authorization", format!("Bearer {}", channel.api_key))
            .json(&volc_body)
            .send().await?
    }
    // Other channels: passthrough OpenAI format
    else {
        let url = join_url(&channel.base_url, "/v1/images/generations");
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
        let latency_ms = start_time.elapsed().as_millis() as u32;
        let endpoint = if channel.provider_type == "volcengine" { "/v1/images/generations|/api/v3/contents/generations/tasks" } else { "/v1/images/generations" };
        proxy::record_and_bill(&state, &token, channel.id, model, 0, 0, 0.0, status, endpoint, Some(&err), latency_ms, if is_stream {1} else {0}, Some(request_content_str.clone()), None).await;
        return Err(AppError::UpstreamError(err));
    }

    let cost = proxy::get_model_cost(&state, model, ctx.discount).await;
    
    let is_upstream_stream = upstream_resp.headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.contains("text/event-stream"))
        .unwrap_or(false);

    if is_stream || is_upstream_stream {
        Ok(crate::relay::stream::handle_image_stream(
            state, token, channel, model.to_string(), upstream_resp, 
            ctx.discount, request_content_str, start_time
        ).await.into_response())
    } else {
        let data = upstream_resp.bytes().await?;
        let response_content_str = String::from_utf8_lossy(&data).to_string();
        let mut p_tokens = 0;
        let mut c_tokens = 0;
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&response_content_str) {
            if let Some(usage) = json.get("usage") {
                p_tokens = usage.get("prompt_tokens").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                c_tokens = usage.get("completion_tokens").or_else(|| usage.get("output_tokens")).or_else(|| usage.get("total_tokens")).and_then(|v| v.as_i64()).unwrap_or(0) as i32;
            }
        }
        
        let latency_ms = start_time.elapsed().as_millis() as u32;
        let endpoint = if channel.provider_type == "volcengine" { "/v1/images/generations|/api/v3/contents/generations/tasks" } else { "/v1/images/generations" };
        proxy::record_and_bill(&state, &token, channel.id, model, p_tokens, c_tokens, cost, 200, endpoint, None, latency_ms, 0, Some(request_content_str.clone()), Some(response_content_str)).await;
        Ok(Response::builder()
            .header("Content-Type", "application/json")
            .body(axum::body::Body::from(data))
            .unwrap())
    }
}
