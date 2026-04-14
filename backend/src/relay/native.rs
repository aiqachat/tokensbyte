//! Relay: Native protocol passthrough for Google Gemini & Volcengine.
//! Provides direct-path endpoints that mirror the vendor's own API surface,
//! while still running through the gateway's auth / billing / logging pipeline.

use axum::{
    extract::{State, Extension, Path, Query, Request},
    middleware::Next,
    response::{Response, IntoResponse},
    Json,
};
use std::sync::Arc;
use std::collections::HashMap;
use crate::{AppState, error::{AppError, AppResult}};
use crate::models::ApiToken;
use super::proxy;

// ═══════════════════════════════════════════════════════════════
//  Middleware: Normalize Google auth formats → Authorization: Bearer
//  Supports:  Authorization: Bearer sk-xxx  (standard)
//             x-goog-api-key: sk-xxx        (Google header)
//             ?key=sk-xxx                    (Google query param)
// ═══════════════════════════════════════════════════════════════

pub async fn normalize_google_auth(mut request: Request, next: Next) -> Response {
    if request.headers().get("authorization").is_none() {
        // Try x-goog-api-key header
        if let Some(key) = request
            .headers()
            .get("x-goog-api-key")
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string())
        {
            if let Ok(val) = format!("Bearer {}", key).parse() {
                request.headers_mut().insert("authorization", val);
            }
        }
        // Try ?key= query parameter
        else if let Some(query) = request.uri().query() {
            for pair in query.split('&') {
                if let Some(key) = pair.strip_prefix("key=") {
                    if let Ok(val) = format!("Bearer {}", key).parse() {
                        request.headers_mut().insert("authorization", val);
                    }
                    break;
                }
            }
        }
    }
    next.run(request).await
}

// ═══════════════════════════════════════════════════════════════
//  Google Gemini Native:
//    POST /v1beta/models/{model}:generateContent
//    POST /v1beta/models/{model}:streamGenerateContent
// ═══════════════════════════════════════════════════════════════

pub async fn gemini_proxy(
    State(state): State<Arc<AppState>>,
    Extension(token): Extension<ApiToken>,
    Path(model_action): Path<String>,
    Query(query_params): Query<HashMap<String, String>>,
    body: axum::body::Bytes,
) -> AppResult<Response> {
    // model_action = "gemini-2.0-flash:generateContent"
    let (model, action) = model_action
        .split_once(':')
        .ok_or_else(|| AppError::BadRequest("Invalid path: expected {model}:{action}".into()))?;

    let ctx = proxy::get_user_context(&state, &token.user_id).await?;
    proxy::check_access(&token, model, ctx.balance)?;
    let (channel, resolved_model) = proxy::select_channel_for_model(&state, model, &ctx.user_group).await?;

    // Build upstream query: replace key with channel's real key, keep other params (e.g. alt=sse)
    let mut qs = format!("key={}", channel.api_key);
    for (k, v) in &query_params {
        if k != "key" {
            qs.push_str(&format!("&{}={}", k, v));
        }
    }
    let url = format!(
        "{}/v1beta/models/{}:{}?{}",
        channel.base_url.trim_end_matches('/'),
        resolved_model,
        action,
        qs
    );

    let resp = state.http_client
        .post(&url)
        .header("Content-Type", "application/json")
        .body(body.to_vec())
        .send()
        .await?;

    let status = resp.status().as_u16();
    let endpoint = format!("/v1beta/models/{}:{}", model, action);

    if !resp.status().is_success() {
        let err = resp.text().await?;
        proxy::record_and_bill(&state, &token, channel.id, model, 0.0, status, &endpoint, Some(&err)).await;
        return Err(AppError::UpstreamError(err));
    }

    let cost = proxy::get_model_cost(&state, model, ctx.discount).await;
    proxy::record_and_bill(&state, &token, channel.id, model, cost, 200, &endpoint, None).await;

    // Stream SSE for streamGenerateContent, otherwise buffer JSON
    if action.starts_with("streamGenerateContent") {
        Ok(Response::builder()
            .header("Content-Type", "text/event-stream")
            .header("Cache-Control", "no-cache")
            .body(axum::body::Body::from_stream(resp.bytes_stream()))
            .unwrap())
    } else {
        let data = resp.bytes().await?;
        Ok(Response::builder()
            .header("Content-Type", "application/json")
            .body(axum::body::Body::from(data))
            .unwrap())
    }
}

// ═══════════════════════════════════════════════════════════════
//  Volcengine Native:
//    POST /api/v3/contents/generations/tasks
//    GET  /api/v3/contents/generations/tasks/{task_id}
// ═══════════════════════════════════════════════════════════════

/// POST — Submit image/video generation task
pub async fn volcengine_submit(
    State(state): State<Arc<AppState>>,
    Extension(token): Extension<ApiToken>,
    Json(body): Json<serde_json::Value>,
) -> AppResult<Response> {
    let model = body["model"].as_str().unwrap_or("volcengine-gen");
    let ctx = proxy::get_user_context(&state, &token.user_id).await?;
    proxy::check_access(&token, model, ctx.balance)?;
    let (channel, resolved_model) = proxy::select_channel_for_model(&state, model, &ctx.user_group).await?;

    let url = format!("{}/api/v3/contents/generations/tasks", channel.base_url.trim_end_matches('/'));
    let mut fwd = body.clone();
    fwd["model"] = serde_json::json!(resolved_model);

    let resp = state.http_client
        .post(&url)
        .header("Authorization", format!("Bearer {}", channel.api_key))
        .json(&fwd)
        .send()
        .await?;

    let status = resp.status().as_u16();
    if !resp.status().is_success() {
        let err = resp.text().await?;
        proxy::record_and_bill(&state, &token, channel.id, model, 0.0, status, "/api/v3/contents/generations/tasks", Some(&err)).await;
        return Err(AppError::UpstreamError(err));
    }

    let cost = proxy::get_model_cost(&state, model, ctx.discount).await;
    proxy::record_and_bill(&state, &token, channel.id, model, cost, 200, "/api/v3/contents/generations/tasks", None).await;

    let data = resp.bytes().await?;
    Ok(Response::builder()
        .header("Content-Type", "application/json")
        .body(axum::body::Body::from(data))
        .unwrap())
}

/// GET — Query task status
pub async fn volcengine_status(
    State(state): State<Arc<AppState>>,
    Extension(token): Extension<ApiToken>,
    Path(task_id): Path<String>,
    Query(params): Query<HashMap<String, String>>,
) -> AppResult<Response> {
    let model = params.get("model").map(|s| s.as_str()).unwrap_or("volcengine-gen");
    let ctx = proxy::get_user_context(&state, &token.user_id).await?;
    let (channel, _) = proxy::select_channel_for_model(&state, model, &ctx.user_group).await?;

    let url = format!(
        "{}/api/v3/contents/generations/tasks/{}",
        channel.base_url.trim_end_matches('/'),
        task_id
    );
    let resp = state.http_client
        .get(&url)
        .header("Authorization", format!("Bearer {}", channel.api_key))
        .send()
        .await?;

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
