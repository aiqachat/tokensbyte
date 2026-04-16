pub mod router;
pub mod stream;
pub mod proxy;
pub mod image;
pub mod video;
pub mod native;
pub mod url_utils;
pub mod forward;

use axum::{
    extract::{State, Extension, Path},
    Json,
    response::{Response, IntoResponse},
};
use std::sync::Arc;
use crate::AppState;
use crate::models::ApiToken;
use crate::error::{AppError, AppResult};

pub async fn chat_completions(
    State(state): State<Arc<AppState>>,
    Extension(token): Extension<ApiToken>,
    Json(body): Json<serde_json::Value>,
) -> AppResult<Response> {
    let start_time = std::time::Instant::now();
    let request_content_str = serde_json::to_string(&body).unwrap_or_default();
    let model = body["model"].as_str().unwrap_or("gpt-3.5-turbo");
    let is_stream = body["stream"].as_bool().unwrap_or(false);

    // 1. 验证模型访问权限
    if !token.is_model_allowed(model) {
        return Err(AppError::Forbidden(format!("Model {} not allowed for this token", model)));
    }

    // 2. 获取用户信息
    let ctx = proxy::get_user_context(&state, &token.user_id).await?;
    proxy::check_access(&token, model, ctx.balance)?;

    // 3. 选择渠道
    let (channel, resolved_model) = proxy::select_channel_for_model(&state, model, &ctx.user_group).await?;

    // 4. 解析转发规则，未绑定规则时根据域名智能推断
    let resolved = forward::resolve_forward_rule(&state, model, "聊天", "/v1/chat/completions")
        .await
        .unwrap_or_else(|| forward::infer_forward_from_base_url(&channel.base_url, "聊天"));

    let target_type = resolved.target_type.clone();
    let upstream_body = forward::transform_request_body(&resolved, &resolved_model, &body, "聊天");
    let url = forward::build_upstream_url(&channel.base_url, &resolved, &resolved_model, &channel.api_key);
    let auth_headers = forward::build_auth_headers(&resolved, &channel.api_key);

    tracing::info!("[Chat] model={}, target_type={}, url={}", model, target_type, url);

    // 5. 构建上游请求
    let mut builder = state.http_client.post(&url)
        .header("Content-Type", "application/json");
    for (k, v) in &auth_headers {
        builder = builder.header(k, v);
    }

    // 6. 流式 vs 非流式
    if is_stream {
        // 流式请求：确保 stream=true 在请求体中
        let mut stream_body = upstream_body.clone();
        stream_body["stream"] = serde_json::json!(true);
        // Gemini 流式需要特殊处理 URL
        let stream_url = if target_type == "gemini" {
            let stream_path = resolved.upstream_path
                .replace(":generateContent", ":streamGenerateContent")
                + "?alt=sse";
            let path_with_model = stream_path.replace("${model}", &resolved_model);
            if resolved.auth_type == "query_key" {
                format!("{}?key={}", url_utils::join_url(&channel.base_url, &path_with_model), channel.api_key)
            } else {
                url_utils::join_url(&channel.base_url, &path_with_model)
            }
        } else {
            url.clone()
        };

        let mut stream_builder = state.http_client.post(&stream_url)
            .header("Content-Type", "application/json");
        for (k, v) in &auth_headers {
            stream_builder = stream_builder.header(k, v);
        }
        let resp = stream_builder.json(&stream_body).send().await?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let err = resp.text().await?;
            let display_err = if err.trim().is_empty() { format!("Upstream HTTP error {}", status) } else { err.clone() };
            let latency_ms = start_time.elapsed().as_millis() as u32;
            let ep = format!("/v1/chat/completions|{}", resolved.upstream_path.replace("${model}", &resolved_model));
            proxy::record_and_bill(
                &state, &token, channel.id, model, 0, 0, 0.0, status,
                &ep, Some(&display_err), latency_ms, 1,
                Some(request_content_str.clone()), Some(err), Some(upstream_body.to_string())
            ).await;
            return Err(AppError::UpstreamError(display_err));
        }

        let prompt_tokens = estimate_prompt_tokens(&body);
        Ok(stream::handle_chat_stream(
            state, token, channel, model.to_string(), resp,
            ctx.discount, prompt_tokens, request_content_str, start_time, target_type,
            resolved.upstream_path.replace("${model}", &resolved_model),
            Some(upstream_body.to_string())
        ).await.into_response())
    } else {
        let resp = builder.json(&upstream_body).send().await?;
        let status = resp.status().as_u16();

        if !resp.status().is_success() {
            let err = resp.text().await?;
            let display_err = if err.trim().is_empty() { format!("Upstream HTTP error {}", status) } else { err.clone() };
            let latency_ms = start_time.elapsed().as_millis() as u32;
            let ep = format!("/v1/chat/completions|{}", resolved.upstream_path.replace("${model}", &resolved_model));
            proxy::record_and_bill(
                &state, &token, channel.id, model, 0, 0, 0.0, status,
                &ep, Some(&display_err), latency_ms, 0,
                Some(request_content_str.clone()), Some(err), Some(upstream_body.to_string())
            ).await;
            return Err(AppError::UpstreamError(display_err));
        }

        let data = resp.bytes().await?;
        let response_content_str = String::from_utf8_lossy(&data).to_string();

        // 解析 usage（兼容 OpenAI / Anthropic / Gemini 多种格式）
        let (prompt_tokens, completion_tokens) = parse_chat_usage(&response_content_str, &target_type);

        // 计费
        let db_model: Option<crate::models::Model> = sqlx::query_as(
            &state.db.format_query("SELECT * FROM models WHERE model_id = ? AND is_active = 1"),
        )
        .bind(model)
        .fetch_optional(&state.db.pool)
        .await?;

        let quota_used = compute_cost(db_model, prompt_tokens, completion_tokens, ctx.discount);
        let latency_ms = start_time.elapsed().as_millis() as u32;
        let ep = format!("/v1/chat/completions|{}", resolved.upstream_path.replace("${model}", &resolved_model));

        proxy::record_and_bill(
            &state, &token, channel.id, model, prompt_tokens, completion_tokens,
            quota_used, 200, &ep, None, latency_ms, 0,
            Some(request_content_str), Some(response_content_str.clone()), Some(upstream_body.to_string())
        ).await;

        // 如果上游不是 OpenAI 格式，将响应转换为 OpenAI 格式返回给用户
        let final_body = transform_chat_response(&response_content_str, &target_type, model);

        Ok(Response::builder()
            .header("Content-Type", "application/json")
            .body(axum::body::Body::from(final_body))
            .unwrap())
    }
}

// ── 辅助函数 ──────────────────────────────────────────────────

/// 粗略估算 prompt tokens
pub fn estimate_prompt_tokens(body: &serde_json::Value) -> i32 {
    let mut total_chars = 0;
    if let Some(messages) = body.get("messages").and_then(|m| m.as_array()) {
        for msg in messages {
            if let Some(s) = msg.get("content").and_then(|c| c.as_str()) {
                total_chars += s.len();
            }
        }
    }
    (total_chars as f64 / 4.0).ceil() as i32
}

/// 从响应体中解析 usage（兼容多种上游格式）
fn parse_chat_usage(response: &str, target_type: &str) -> (i32, i32) {
    let v: serde_json::Value = match serde_json::from_str(response) {
        Ok(v) => v,
        Err(_) => return (0, 0),
    };

    match target_type {
        "anthropic" => {
            let p = v.get("usage").and_then(|u| u.get("input_tokens")).and_then(|t| t.as_i64()).unwrap_or(0);
            let c = v.get("usage").and_then(|u| u.get("output_tokens")).and_then(|t| t.as_i64()).unwrap_or(0);
            (p as i32, c as i32)
        }
        "gemini" | "gemini_image" => {
            let u = v.get("usageMetadata");
            let p = u.and_then(|u| u.get("promptTokenCount")).and_then(|t| t.as_i64()).unwrap_or(0);
            let c = u.and_then(|u| u.get("candidatesTokenCount")).and_then(|t| t.as_i64()).unwrap_or(0);
            (p as i32, c as i32)
        }
        _ => {
            let u = v.get("usage");
            let p = u.and_then(|u| u.get("prompt_tokens")).and_then(|t| t.as_i64()).unwrap_or(0);
            let c = u.and_then(|u| u.get("completion_tokens")).and_then(|t| t.as_i64()).unwrap_or(0);
            (p as i32, c as i32)
        }
    }
}

/// 将上游非 OpenAI 格式响应转换为 OpenAI 格式
fn transform_chat_response(response: &str, target_type: &str, model: &str) -> String {
    match target_type {
        "anthropic" => {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(response) {
                let content = v.get("content")
                    .and_then(|c| c.as_array())
                    .and_then(|arr| arr.iter()
                        .filter(|c| c.get("type").and_then(|t| t.as_str()) == Some("text"))
                        .map(|c| c.get("text").and_then(|t| t.as_str()).unwrap_or(""))
                        .next())
                    .unwrap_or("");
                let (p, c) = parse_chat_usage(response, target_type);
                return serde_json::to_string(&serde_json::json!({
                    "id": v.get("id").and_then(|i| i.as_str()).unwrap_or(""),
                    "object": "chat.completion",
                    "created": chrono::Utc::now().timestamp(),
                    "model": model,
                    "choices": [{"index": 0, "message": {"role": "assistant", "content": content}, "finish_reason": "stop"}],
                    "usage": {"prompt_tokens": p, "completion_tokens": c, "total_tokens": p + c}
                })).unwrap_or_else(|_| response.to_string());
            }
            response.to_string()
        }
        "gemini" | "gemini_image" => {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(response) {
                let content = v.get("candidates")
                    .and_then(|c| c.get(0))
                    .and_then(|c| c.get("content"))
                    .and_then(|c| c.get("parts"))
                    .and_then(|p| p.get(0))
                    .and_then(|p| p.get("text"))
                    .and_then(|t| t.as_str())
                    .unwrap_or("");
                let finish = v.get("candidates")
                    .and_then(|c| c.get(0))
                    .and_then(|c| c.get("finishReason"))
                    .and_then(|f| f.as_str())
                    .unwrap_or("stop");
                let (p, c) = parse_chat_usage(response, target_type);
                return serde_json::to_string(&serde_json::json!({
                    "id": uuid::Uuid::new_v4().to_string(),
                    "object": "chat.completion",
                    "created": chrono::Utc::now().timestamp(),
                    "model": model,
                    "choices": [{"index": 0, "message": {"role": "assistant", "content": content}, "finish_reason": finish}],
                    "usage": {"prompt_tokens": p, "completion_tokens": c, "total_tokens": p + c}
                })).unwrap_or_else(|_| response.to_string());
            }
            response.to_string()
        }
        _ => response.to_string(), // OpenAI 格式直接返回
    }
}

/// 统一计费逻辑
pub fn compute_cost(db_model: Option<crate::models::Model>, prompt_tokens: i32, completion_tokens: i32, discount: f64) -> f64 {
    match db_model {
        Some(m) => match m.billing_type.as_str() {
            "requests" => m.fixed_rate * discount,
            "duration" => 0.0,
            _ => {
                let mut p_rate = m.prompt_rate;
                let mut c_rate = m.completion_rate;
                if m.billing_rule == "tiered" {
                    let mut tiers: Vec<crate::models::PricingTier> = serde_json::from_str(&m.pricing_tiers).unwrap_or_default();
                    tiers.sort_by_key(|t| t.max_tokens);
                    for tier in tiers {
                        if prompt_tokens <= tier.max_tokens {
                            p_rate = tier.prompt_rate;
                            c_rate = tier.completion_rate;
                            break;
                        }
                    }
                }
                ((prompt_tokens as f64 * p_rate + completion_tokens as f64 * c_rate) / 1_000_000.0) * discount
            }
        },
        None => {
            let total = prompt_tokens + completion_tokens;
            (total as f64 / 1_000_000.0) * discount
        }
    }
}
