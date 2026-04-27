use std::sync::Arc;
use crate::AppState;
use crate::models::{ApiToken, Channel};

use axum::response::{IntoResponse, Response};
use futures::{StreamExt};
use reqwest::Response as ReqwestResponse;
use tokio::sync::mpsc;

/// Handle chat completions stream with transformation and billing
pub async fn handle_chat_stream(
    state: Arc<AppState>,
    token: ApiToken,
    channel: Channel,
    model: String,
    response: ReqwestResponse,
    discount: f64,
    prompt_tokens: i32,
    request_content_str: String,
    start_time: std::time::Instant,
    target_type: String,
    upstream_path: String,
    upstream_req_content: Option<String>,
    pre_deducted: f64,
) -> impl IntoResponse {
    let (tx, rx) = mpsc::channel(100);
    let mut upstream_stream = response.bytes_stream();
    
    // Spawn a worker to process the stream
    tokio::spawn(async move {
        let mut total_prompt_tokens = prompt_tokens;
        let mut total_completion_tokens = 0;
        let mut total_cached_tokens = 0;
        let mut buffer = String::new();
        let mut raw_response_text = String::new();
        
        let target_type = target_type.clone();
        
        while let Some(chunk_result) = upstream_stream.next().await {
            match chunk_result {
                Ok(bytes) => {
                    let chunk_str = String::from_utf8_lossy(&bytes);
                    buffer.push_str(&chunk_str);
                    
                    // Simple line-based SSE parsing
                    while let Some(index) = buffer.find('\n') {
                        let line = buffer.drain(..index + 1).collect::<String>();
                        let line = line.trim();
                        
                        if line.is_empty() { continue; }
                        raw_response_text.push_str(line);
                        raw_response_text.push('\n');
                        
                        // Transform and count
                        if let Some(transformed) = crate::relay::forward::transform_sse_line(&target_type, line, &model) {
                            // Extract content length for rough token count if not provided
                            if target_type != "openai" && target_type != "volcengine_chat" && target_type != "volcengine" {
                                total_completion_tokens += 1; 
                            }
                            
                            if tx.send(Ok::<_, axum::Error>(format!("data: {}\n\n", transformed))).await.is_err() {
                                break;
                            }
                        }
                    }
                }
                Err(_) => break,
            }
        }
        
        // Finalize billing
        let _ = tx.send(Ok("data: [DONE]\n\n".to_string())).await;
        
        // 以响应中返回的真实 token 为准进行计费核算
        if !raw_response_text.is_empty() {
            let actual_usage = crate::relay::usage_extractor::parse_usage(&raw_response_text);
            if actual_usage.prompt > 0 || actual_usage.completion > 0 {
                total_prompt_tokens = actual_usage.prompt;
                total_completion_tokens = actual_usage.completion;
                total_cached_tokens = actual_usage.cached;
            }
        }
        
        // 避免出现空计费
        if total_prompt_tokens == 0 && total_completion_tokens == 0 {
            total_completion_tokens = 1; // 至少为 1 以防异常
        }
        
        let db_model: Option<crate::models::Model> = sqlx::query_as(&state.db.format_query("SELECT * FROM models WHERE model_id = ? AND is_active = 1"))
            .bind(&model)
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

        let req_json = serde_json::from_str::<serde_json::Value>(&request_content_str).unwrap_or(serde_json::json!({}));
        let features = crate::relay::usage_extractor::extract_request_features(&req_json);
        let (final_discount, discount_source) = crate::relay::proxy::resolve_discount(db_model.as_ref(), discount);
        let (cost, mut detail) = crate::relay::compute_cost(db_model.as_ref(), db_rule.as_ref(), total_prompt_tokens, total_completion_tokens, total_cached_tokens, final_discount, &features);
        detail.push_str(&format!(" | {}", discount_source));
        let resolved_model = channel.resolve_model(&model);
        if model != resolved_model {
            detail.push_str(&format!(" | 模型映射: {} ➞ {}", model, resolved_model));
        }
        
        let latency_ms = start_time.elapsed().as_millis() as u32;
        let ep = format!("/v1/chat/completions|{}", upstream_path);
        crate::relay::proxy::record_and_bill_with_prededuction(
            &state, &token, channel.id, &model, total_prompt_tokens, total_completion_tokens, total_cached_tokens,
            cost, pre_deducted, 200, &ep, None, latency_ms, 1,
            Some(request_content_str), Some(raw_response_text), upstream_req_content, Some(detail)
        ).await;
    });

    let stream = tokio_stream::wrappers::ReceiverStream::new(rx);

    Response::builder()
        .header("Content-Type", "text/event-stream")
        .header("Cache-Control", "no-cache")
        .header("Connection", "keep-alive")
        .body(axum::body::Body::from_stream(stream))
        .unwrap()
}

// SSE 转换函数已迁移至 forward.rs 模块统一维护



pub async fn handle_image_stream(
    state: Arc<AppState>,
    token: ApiToken,
    channel: Channel,
    model: String,
    response: ReqwestResponse,
    discount: f64,
    request_content_str: String,
    start_time: std::time::Instant,
    upstream_path: String,
    upstream_req_content: Option<String>,
    pre_deducted: f64,
) -> impl IntoResponse {
    let (tx, rx) = mpsc::channel(100);
    let mut upstream_stream = response.bytes_stream();
    
    // Spawn a worker to process the stream
    tokio::spawn(async move {
        let mut total_prompt_tokens = 0;
        let mut total_completion_tokens = 0;
        let mut buffer = String::new();
        let mut full_response_text = String::new();
        
        while let Some(chunk_result) = upstream_stream.next().await {
            match chunk_result {
                Ok(bytes) => {
                    let chunk_str = String::from_utf8_lossy(&bytes);
                    buffer.push_str(&chunk_str);
                    full_response_text.push_str(&chunk_str);
                    
                    if tx.send(Ok::<_, axum::Error>(bytes.clone())).await.is_err() {
                        break;
                    }
                    
                    // Parse usage from lines
                    while let Some(index) = buffer.find('\n') {
                        let line = buffer.drain(..index + 1).collect::<String>();
                        let line = line.trim();
                        if line.starts_with("data: ") && line != "data: [DONE]" {
                            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&line[6..]) {
                                if let Some(usage) = json.get("usage") {
                                    if let Some(prompt) = usage.get("prompt_tokens").and_then(|v| v.as_i64()) {
                                        total_prompt_tokens = prompt as i32;
                                    }
                                    if let Some(comp) = usage.get("completion_tokens").or_else(|| usage.get("output_tokens")).or_else(|| usage.get("total_tokens")).and_then(|v| v.as_i64()) {
                                        total_completion_tokens = comp as i32;
                                    }
                                }
                            }
                        }
                    }
                }
                Err(_) => break,
            }
        }
        
        // Fallback: 如果 SSE 解析未获取到 token（如火山图片返回普通 JSON），从完整响应体中提取
        if total_prompt_tokens == 0 && total_completion_tokens == 0 && !full_response_text.is_empty() {
            let fallback = crate::relay::usage_extractor::parse_usage(&full_response_text);
            total_prompt_tokens = fallback.prompt;
            total_completion_tokens = fallback.completion;
            tracing::info!("[Image Stream Fallback] model={}, prompt={}, completion={}", model, total_prompt_tokens, total_completion_tokens);
        }

        let db_model: Option<crate::models::Model> = sqlx::query_as(&state.db.format_query("SELECT * FROM models WHERE model_id = ? AND is_active = 1"))
            .bind(&model)
            .fetch_optional(&state.db.pool)
            .await.unwrap_or(None);

        let db_rule: Option<crate::models::BillingRule> = if let Some(ref m) = db_model {
            if let Some(rule_id) = m.billing_rule_id {
                sqlx::query_as(&state.db.format_query("SELECT * FROM billing_rules WHERE id = ? AND is_active = 1"))
                    .bind(rule_id)
                    .fetch_optional(&state.db.pool)
                    .await
                    .unwrap_or(None)
            } else { None }
        } else { None };

        let req_json = serde_json::from_str::<serde_json::Value>(&request_content_str).unwrap_or(serde_json::json!({}));
        let mut features = crate::relay::usage_extractor::extract_request_features(&req_json);
        // 流式完成后，从完整响应中提取实际图片数量（按张计费的最终依据）
        if let Some(resp_count) = crate::relay::usage_extractor::count_response_images(&full_response_text) {
            features.image_count = Some(resp_count);
        }
        let (final_discount, discount_source) = crate::relay::proxy::resolve_discount(db_model.as_ref(), discount);
        let (cost, mut detail) = crate::relay::compute_cost(db_model.as_ref(), db_rule.as_ref(), total_prompt_tokens, total_completion_tokens, 0, final_discount, &features);
        detail.push_str(&format!(" | {}", discount_source));
        let resolved_model = channel.resolve_model(&model);
        if model != resolved_model {
            detail.push_str(&format!(" | 模型映射: {} ➞ {}", model, resolved_model));
        }
        
        let latency_ms = start_time.elapsed().as_millis() as u32;
        let ep = format!("/v1/images/generations|{}", upstream_path);
        crate::relay::proxy::record_and_bill_with_prededuction(
            &state, &token, channel.id, &model, total_prompt_tokens, total_completion_tokens, 0,
            cost, pre_deducted, 200, &ep, None, latency_ms, 1,
            Some(request_content_str), Some(full_response_text), upstream_req_content, Some(detail)
        ).await;
    });

    let stream = tokio_stream::wrappers::ReceiverStream::new(rx);

    Response::builder()
        .header("Content-Type", "text/event-stream")
        .header("Cache-Control", "no-cache")
        .header("Connection", "keep-alive")
        .body(axum::body::Body::from_stream(stream))
        .unwrap()
}

pub async fn handle_native_stream(
    state: Arc<AppState>,
    token: ApiToken,
    channel: Channel,
    model: String,
    response: ReqwestResponse,
    discount: f64,
    request_content_str: String,
    start_time: std::time::Instant,
    upstream_path: String,
    upstream_req_content: Option<String>,
    pre_deducted: f64,
) -> impl IntoResponse {
    let (tx, rx) = mpsc::channel(100);
    let mut upstream_stream = response.bytes_stream();
    
    // Spawn a worker to process the stream
    tokio::spawn(async move {
        let mut full_response_text = String::new();
        
        while let Some(chunk_result) = upstream_stream.next().await {
            match chunk_result {
                Ok(bytes) => {
                    let chunk_str = String::from_utf8_lossy(&bytes);
                    full_response_text.push_str(&chunk_str);
                    
                    if tx.send(Ok::<_, axum::Error>(bytes)).await.is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
        
        let latency_ms = start_time.elapsed().as_millis() as u32;
        
        let mut prompt_tokens = 0;
        let mut completion_tokens = 0;
        
        // Very basic attempt to parse usageMetadata if it's JSON array or SSE JSON
        let last_bracket = full_response_text.rfind('}');
        if let Some(pos) = last_bracket {
            let possible_json_start = full_response_text[..pos+1].rfind('{');
            if let Some(start) = possible_json_start {
                let candidate = &full_response_text[start..pos+1];
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(candidate) {
                    if let Some(usage) = json.get("usageMetadata") {
                        prompt_tokens = usage.get("promptTokenCount").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                        completion_tokens = usage.get("candidatesTokenCount").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                    }
                }
            }
        }

        // Just blindly try to parse full text if it's small JSON? No, it's a stream, might be concatenated JSONs.
        // Or we can use the estimate if 0.
        if prompt_tokens == 0 && completion_tokens == 0 {
             // 先尝试从完整响应精确提取
             let fallback = crate::relay::usage_extractor::parse_usage(&full_response_text);
             prompt_tokens = fallback.prompt;
             completion_tokens = fallback.completion;
        }
        // 仍为 0 则估算
        if prompt_tokens == 0 && completion_tokens == 0 {
             let req_json = serde_json::from_str::<serde_json::Value>(&request_content_str).unwrap_or(serde_json::json!({}));
             prompt_tokens = crate::relay::estimate_prompt_tokens(&req_json);
             completion_tokens = (full_response_text.len() as f64 / 4.0).ceil() as i32;
        }

        let db_model: Option<crate::models::Model> = sqlx::query_as(&state.db.format_query("SELECT * FROM models WHERE model_id = ? AND is_active = 1"))
            .bind(&model)
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

        let req_json = serde_json::from_str::<serde_json::Value>(&request_content_str).unwrap_or(serde_json::json!({}));
        let mut features = crate::relay::usage_extractor::extract_request_features(&req_json);
        // 流式完成后，从完整响应中提取实际图片数量（Gemini 生图场景）
        if let Some(resp_count) = crate::relay::usage_extractor::count_response_images(&full_response_text) {
            features.image_count = Some(resp_count);
        }
        let (final_discount, discount_source) = crate::relay::proxy::resolve_discount(db_model.as_ref(), discount);
        let (cost, mut detail) = crate::relay::compute_cost(db_model.as_ref(), db_rule.as_ref(), prompt_tokens, completion_tokens, 0, final_discount, &features);
        detail.push_str(&format!(" | {}", discount_source));
        let resolved_model = channel.resolve_model(&model);
        if model != resolved_model {
            detail.push_str(&format!(" | 模型映射: {} ➞ {}", model, resolved_model));
        }
        
        let ep = format!("{}|{}", upstream_path, upstream_path);
        crate::relay::proxy::record_and_bill_with_prededuction(
            &state, &token, channel.id, &model, prompt_tokens, completion_tokens, 0,
            cost, pre_deducted, 200, &ep, None, latency_ms, 1,
            Some(request_content_str), Some(full_response_text), upstream_req_content, Some(detail)
        ).await;
    });

    let stream = tokio_stream::wrappers::ReceiverStream::new(rx);

    Response::builder()
        .header("Content-Type", "text/event-stream")
        .header("Cache-Control", "no-cache")
        .header("Connection", "keep-alive")
        .body(axum::body::Body::from_stream(stream))
        .unwrap()
}
