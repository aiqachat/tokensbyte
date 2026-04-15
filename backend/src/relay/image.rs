//! Relay: POST /v1/images/generations
//! OpenAI-compatible image generation endpoint with forward-rule-driven protocol adaptation.

use axum::{extract::{State, Extension}, response::{Response, IntoResponse}, Json};
use std::sync::Arc;
use crate::{AppState, error::{AppError, AppResult}};
use crate::models::ApiToken;
use super::{proxy, forward};

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

    // 解析转发规则，未绑定规则时根据域名智能推断
    let resolved = forward::resolve_forward_rule(&state, model, "图片", "/v1/images/generations")
        .await
        .unwrap_or_else(|| forward::infer_forward_from_base_url(&channel.base_url, "图片"));

    let upstream_body = forward::transform_request_body(&resolved, &resolved_model, &body, "图片");
    let url = forward::build_upstream_url(&channel.base_url, &resolved, &resolved_model, &channel.api_key);
    let auth_headers = forward::build_auth_headers(&resolved, &channel.api_key);

    tracing::info!("[Image] model={}, target_type={}, url={}", model, resolved.target_type, url);

    // 构建并发送上游请求
    let mut builder = state.http_client.post(&url)
        .header("Content-Type", "application/json");
    for (k, v) in &auth_headers {
        builder = builder.header(k, v);
    }
    let upstream_resp = builder.json(&upstream_body).send().await?;

    let status = upstream_resp.status().as_u16();
    if !upstream_resp.status().is_success() {
        let err = upstream_resp.text().await?;
        let latency_ms = start_time.elapsed().as_millis() as u32;
        let ep = format!("/v1/images/generations|{}", resolved.upstream_path.replace("${model}", &resolved_model));
        proxy::record_and_bill(&state, &token, channel.id, model, 0, 0, 0.0, status,
            &ep, Some(&err), latency_ms, if is_stream {1} else {0},
            Some(request_content_str.clone()), None, Some(upstream_body.to_string())).await;
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
            ctx.discount, request_content_str, start_time,
            resolved.upstream_path.replace("${model}", &resolved_model),
            Some(upstream_body.to_string())
        ).await.into_response())
    } else {
        let data = upstream_resp.bytes().await?;
        let response_content_str = String::from_utf8_lossy(&data).to_string();
        let mut p_tokens = 0;
        let mut c_tokens = 0;
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&response_content_str) {
            if let Some(usage) = json.get("usage") {
                p_tokens = usage.get("prompt_tokens").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                c_tokens = usage.get("completion_tokens")
                    .or_else(|| usage.get("output_tokens"))
                    .or_else(|| usage.get("total_tokens"))
                    .and_then(|v| v.as_i64()).unwrap_or(0) as i32;
            }
        }

        let latency_ms = start_time.elapsed().as_millis() as u32;
        let ep = format!("/v1/images/generations|{}", resolved.upstream_path.replace("${model}", &resolved_model));
        proxy::record_and_bill(&state, &token, channel.id, model, p_tokens, c_tokens, cost, 200,
            &ep, None, latency_ms, 0,
            Some(request_content_str), Some(response_content_str), Some(upstream_body.to_string())).await;

        Ok(Response::builder()
            .header("Content-Type", "application/json")
            .body(axum::body::Body::from(data))
            .unwrap())
    }
}
