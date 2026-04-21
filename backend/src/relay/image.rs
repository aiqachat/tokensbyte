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
    let pre_deduction = proxy::check_access(&state, &token, model, ctx.balance).await?;
    let (channel, resolved_model) = proxy::select_channel_for_model(&state, &token, model, &ctx.user_group, "/v1/images/generations").await?;
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
        let display_err = if err.trim().is_empty() { format!("Upstream HTTP error {}", status) } else { err.clone() };
        let latency_ms = start_time.elapsed().as_millis() as u32;
        let ep = format!("/v1/images/generations|{}", resolved.upstream_path.replace("${model}", &resolved_model));
            proxy::record_and_bill(
                &state, &token, channel.id, model, 0, 0, 0.0, status,
                &ep, Some(&display_err), latency_ms, 0,
                Some(request_content_str.clone()), Some(err), Some(upstream_body.to_string()),
                None
            ).await;
        return Err(AppError::UpstreamError(display_err));
    }

    let db_model: Option<crate::models::Model> = sqlx::query_as(
        &state.db.format_query("SELECT * FROM models WHERE model_id = ? AND is_active = 1"),
    )
    .bind(model)
    .fetch_optional(&state.db.pool)
    .await
    .unwrap_or(None);

    let db_rule: Option<crate::models::BillingRule> = if let Some(ref m) = db_model {
        if let Some(rule_id) = m.billing_rule_id {
            sqlx::query_as(&state.db.format_query("SELECT * FROM billing_rules WHERE id = ? AND is_active = 1"))
                .bind(rule_id)
                .fetch_optional(&state.db.pool)
                .await
                .unwrap_or(None)
        } else { None }
    } else { None };

    if pre_deduction > 0.0 {
        if let Err(e) = proxy::pre_deduct(&state, &token.user_id, pre_deduction).await {
            tracing::error!("Pre deduction failed for {}: {:?}", token.user_id, e);
        }
    }

    let is_upstream_stream = upstream_resp.headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.contains("text/event-stream"))
        .unwrap_or(false);

    if is_stream || is_upstream_stream {
        tracing::info!("[Image] model={}, path=STREAM (is_stream={}, is_upstream_stream={})", model, is_stream, is_upstream_stream);
        Ok(crate::relay::stream::handle_image_stream(
            state, token, channel, model.to_string(), upstream_resp,
            ctx.discount, request_content_str, start_time,
            resolved.upstream_path.replace("${model}", &resolved_model),
            Some(upstream_body.to_string()),
            pre_deduction
        ).await.into_response())
    } else {
        let data = upstream_resp.bytes().await?;
        let response_content_str = String::from_utf8_lossy(&data).to_string();
        let usage_tokens = crate::relay::usage_extractor::parse_usage(&response_content_str);
        let p_tokens = usage_tokens.prompt;
        let c_tokens = usage_tokens.completion;

        tracing::info!("[Image] model={}, path=SYNC, prompt={}, completion={}, total={}", model, p_tokens, c_tokens, usage_tokens.total);

        let mut features = crate::relay::usage_extractor::extract_request_features(&body);
        // 用响应中的实际图片数量覆盖请求体的 n 值（按张计费的最终依据）
        if let Some(resp_count) = crate::relay::usage_extractor::count_response_images(&response_content_str) {
            features.image_count = Some(resp_count);
        }
        let (final_discount, discount_source) = proxy::resolve_discount(db_model.as_ref(), ctx.discount);
        let (cost, mut detail) = crate::relay::compute_cost(db_model.as_ref(), db_rule.as_ref(), p_tokens, c_tokens, final_discount, &features);
        detail.push_str(&format!(" | {}", discount_source));
        if model != resolved_model {
            detail.push_str(&format!(" | 模型映射: {} ➞ {}", model, resolved_model));
        }

        let latency_ms = start_time.elapsed().as_millis() as u32;
        let ep = format!("/v1/images/generations|{}", resolved.upstream_path.replace("${model}", &resolved_model));
        proxy::record_and_bill_with_prededuction(&state, &token, channel.id, model, p_tokens, c_tokens, cost, pre_deduction, 200,
            &ep, None, latency_ms, 0,
            Some(request_content_str), Some(response_content_str), Some(upstream_body.to_string()), Some(detail)).await;

        Ok(Response::builder()
            .header("Content-Type", "application/json")
            .body(axum::body::Body::from(data))
            .unwrap())
    }
}
