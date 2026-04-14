//! Relay: POST /v1/video/generations & GET /v1/video/generations/{task_id}
//! OpenAI-compatible video generation task endpoints.

use axum::{extract::{State, Extension, Path, Query}, response::Response, Json};
use std::sync::Arc;
use std::collections::HashMap;
use crate::{AppState, error::{AppError, AppResult}};
use crate::models::ApiToken;
use super::proxy;

/// POST /v1/video/generations — Submit a video generation task
pub async fn video_generations(
    State(state): State<Arc<AppState>>,
    Extension(token): Extension<ApiToken>,
    Json(body): Json<serde_json::Value>,
) -> AppResult<Response> {
    let model = body["model"].as_str().unwrap_or("video-gen");
    let ctx = proxy::get_user_context(&state, &token.user_id).await?;
    proxy::check_access(&token, model, ctx.balance)?;
    let (channel, resolved_model) = proxy::select_channel_for_model(&state, model, &ctx.user_group).await?;

    let url = format!("{}/v1/video/generations", channel.base_url.trim_end_matches('/'));
    let mut fwd = body.clone();
    fwd["model"] = serde_json::json!(resolved_model);

    let resp = state.http_client.post(&url)
        .header("Authorization", format!("Bearer {}", channel.api_key))
        .json(&fwd)
        .send().await?;

    let status = resp.status().as_u16();
    if !resp.status().is_success() {
        let err = resp.text().await?;
        proxy::record_and_bill(&state, &token, channel.id, model, 0.0, status, "/v1/video/generations", Some(&err)).await;
        return Err(AppError::UpstreamError(err));
    }

    let cost = proxy::get_model_cost(&state, model, ctx.discount).await;
    proxy::record_and_bill(&state, &token, channel.id, model, cost, 200, "/v1/video/generations", None).await;

    let data = resp.bytes().await?;
    Ok(Response::builder()
        .header("Content-Type", "application/json")
        .body(axum::body::Body::from(data))
        .unwrap())
}

/// GET /v1/video/generations/{task_id}?model=xxx — Query task status
pub async fn video_generations_status(
    State(state): State<Arc<AppState>>,
    Extension(token): Extension<ApiToken>,
    Path(task_id): Path<String>,
    Query(params): Query<HashMap<String, String>>,
) -> AppResult<Response> {
    let model = params.get("model").map(|s| s.as_str()).unwrap_or("video-gen");
    let ctx = proxy::get_user_context(&state, &token.user_id).await?;
    let (channel, _) = proxy::select_channel_for_model(&state, model, &ctx.user_group).await?;

    let url = format!("{}/v1/video/generations/{}", channel.base_url.trim_end_matches('/'), task_id);
    let resp = state.http_client.get(&url)
        .header("Authorization", format!("Bearer {}", channel.api_key))
        .send().await?;

    if !resp.status().is_success() {
        let err = resp.text().await?;
        return Err(AppError::UpstreamError(err));
    }

    let data = resp.bytes().await?;
    Ok(Response::builder()
        .header("Content-Type", "application/json")
        .body(axum::body::Body::from(data))
        .unwrap())
}
