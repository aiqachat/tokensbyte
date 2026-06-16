use std::sync::Arc;
use crate::AppState;
use crate::models::{ApiToken, BillingRule, Channel, Model};

use axum::response::{IntoResponse, Response};
use futures::{StreamExt};
use reqwest::Response as ReqwestResponse;
use tokio::sync::mpsc;

/// Handle chat completions stream with transformation and billing
/// pending_log_id: 预记录日志 ID，有值时 UPDATE 该行（一条日志原则）
pub async fn handle_chat_stream(
    state: Arc<AppState>,
    token: ApiToken,
    channel: Channel,
    model: String,
    response: ReqwestResponse,
    discount: f64,
    model_discounts: Option<String>,
    prompt_tokens: i32,
    request_content_str: String,
    start_time: std::time::Instant,
    target_type: String,
    upstream_path: String,
    upstream_req_content: Option<String>,
    pre_deducted: f64,
    pre_deduct_gift: f64,
    entry_endpoint: String,
    smart_router_ep: Option<String>,
    pending_log_id: Option<i64>,
    db_model: Option<Model>,
    db_rule: Option<BillingRule>,
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
        let passthrough = entry_endpoint.ends_with("/messages");
        
        while let Some(chunk_result) = upstream_stream.next().await {
            match chunk_result {
                Ok(bytes) => {
                    let chunk_str = String::from_utf8_lossy(&bytes);
                    raw_response_text.push_str(&chunk_str);

                    if passthrough {
                        // /v1/messages 入口：原样透传上游 SSE
                        if tx.send(Ok::<_, axum::Error>(chunk_str.to_string())).await.is_err() { break; }
                    } else {
                        buffer.push_str(&chunk_str);
                        while let Some(index) = buffer.find('\n') {
                            let line = buffer.drain(..index + 1).collect::<String>();
                            let line = line.trim();
                            if line.is_empty() { continue; }
                            if let Some(transformed) = crate::relay::forward::transform_sse_line(&target_type, line, &model) {
                                if target_type != "openai" && target_type != "volcengine_chat" && target_type != "volcengine" {
                                    total_completion_tokens += 1; 
                                }
                                if tx.send(Ok::<_, axum::Error>(format!("data: {}\n\n", transformed))).await.is_err() { break; }
                            }
                        }
                    }
                }
                Err(_) => break,
            }
        }
        
        if !passthrough {
            let _ = tx.send(Ok("data: [DONE]\n\n".to_string())).await;
        }
        
        // 以响应中返回的真实 token 为准进行计费核算
        let mut total_cache_creation = 0;
        let mut total_audio_tokens = 0;
        let mut total_audio_cached_tokens = 0;
        let mut total_image_tokens = 0;
        let mut total_total_tokens = 0;
        if !raw_response_text.is_empty() {
            let actual_usage = crate::relay::usage_extractor::parse_usage(&raw_response_text);
            if actual_usage.prompt > 0 || actual_usage.completion > 0 {
                total_prompt_tokens = actual_usage.prompt;
                total_completion_tokens = actual_usage.completion;
                total_cached_tokens = actual_usage.cached;
                total_cache_creation = actual_usage.cache_creation;
                total_audio_tokens = actual_usage.audio_tokens;
                total_audio_cached_tokens = actual_usage.audio_cached_tokens;
                total_image_tokens = actual_usage.image_tokens;
                total_total_tokens = actual_usage.total;
            }
        }
        
        // 避免出现空计费
        if total_prompt_tokens == 0 && total_completion_tokens == 0 {
            total_completion_tokens = 1; // 至少为 1 以防异常
        }

        let req_json = serde_json::from_str::<serde_json::Value>(&request_content_str).unwrap_or(serde_json::json!({}));
        let mut features = crate::relay::usage_extractor::extract_request_features(&req_json);
        features.cache_creation = if total_cache_creation > 0 { Some(total_cache_creation) } else { None };
        // 折扣策略: MIN(用户模型折扣, 全站折扣, 等级折扣), 受折扣限价约束
        let umd = db_model.as_ref().and_then(|m| crate::relay::proxy::parse_user_model_discount(&model_discounts, &m.mid));
        let (final_discount, discount_source) = crate::relay::proxy::resolve_discount(db_model.as_ref(), discount, umd);

        let is_ha_plugin_enabled = crate::api::plugins::is_plugin_enabled(&state, "high_availability_channel").await;
        let applied_discount = if is_ha_plugin_enabled {
            final_discount * channel.rate
        } else {
            final_discount
        };

        let cost_usage = crate::relay::usage_extractor::UsageTokens { prompt: total_prompt_tokens, completion: total_completion_tokens, total: total_total_tokens, cached: total_cached_tokens, cache_creation: total_cache_creation, audio_tokens: total_audio_tokens, audio_cached_tokens: total_audio_cached_tokens, image_tokens: total_image_tokens };
        let (cost, mut detail) = crate::relay::compute_cost(db_model.as_ref(), db_rule.as_ref(), &cost_usage, applied_discount, &features);
        detail.push_str(&format!(" | {}", discount_source));
        if is_ha_plugin_enabled && channel.rate != 1.0 {
            detail.push_str(&format!(" | 渠道倍率: {}x", channel.rate));
        }
        let (resolved_model, mapping_source) = crate::relay::router::resolve_model(&channel, &model, db_model.as_ref());
        if let Some(src) = mapping_source {
            detail.push_str(&format!(" | {}: {} ➞ {}", src, model, resolved_model));
        }
        if let Some(ep_name) = &smart_router_ep {
            detail.push_str(&format!(" | 智能路由: {}", ep_name));
        }
        
        let latency_ms = start_time.elapsed().as_millis() as u32;
        let ep = format!("{}|{}", entry_endpoint, upstream_path);
        // 【一条日志原则】有 pending_log_id 时 UPDATE 预记录行
        crate::relay::proxy::record_and_bill_inner(
            &state, &token, channel.id, &model, total_prompt_tokens, total_completion_tokens, total_cached_tokens,
            cost, pre_deducted, pre_deduct_gift, 200, &ep, None, latency_ms, 1,
            Some(request_content_str), Some(raw_response_text), upstream_req_content, Some(detail), Some("聊天"), pending_log_id, None, None, db_model.as_ref()
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

/// Responses API 流式处理：完全透传上游 SSE（event: + data: 格式），流结束后提取 usage 计费
/// pending_log_id: 预记录日志 ID，有值时 UPDATE 该行（一条日志原则）
pub async fn handle_responses_stream(
    state: Arc<AppState>,
    token: ApiToken,
    channel: Channel,
    model: String,
    response: ReqwestResponse,
    discount: f64,
    model_discounts: Option<String>,
    request_content_str: String,
    start_time: std::time::Instant,
    upstream_path: String,
    upstream_req_content: Option<String>,
    pre_deducted: f64,
    pre_deduct_gift: f64,
    entry_endpoint: String,
    pending_log_id: Option<i64>,
    db_model: Option<Model>,
    db_rule: Option<BillingRule>,
) -> impl IntoResponse {
    let (tx, rx) = mpsc::channel(100);
    let mut upstream_stream = response.bytes_stream();

    tokio::spawn(async move {
        let mut raw_response_text = String::new();

        // 完全透传上游 SSE（event: + data: 格式）
        while let Some(chunk_result) = upstream_stream.next().await {
            match chunk_result {
                Ok(bytes) => {
                    let chunk_str = String::from_utf8_lossy(&bytes);
                    raw_response_text.push_str(&chunk_str);
                    // 原样透传，不做任何转换
                    if tx.send(Ok::<_, axum::Error>(chunk_str.to_string())).await.is_err() { break; }
                }
                Err(_) => break,
            }
        }

        // 流结束后提取 usage 计费（parse_usage 已兼容 input_tokens/output_tokens）
        let mut total_prompt_tokens = 0;
        let mut total_completion_tokens = 0;
        let mut total_cached_tokens = 0;
        let mut total_audio_tokens = 0;
        let mut total_audio_cached_tokens = 0;
        let mut total_image_tokens = 0;
        let mut total_total_tokens = 0;
        if !raw_response_text.is_empty() {
            let actual_usage = crate::relay::usage_extractor::parse_usage(&raw_response_text);
            total_prompt_tokens = actual_usage.prompt;
            total_completion_tokens = actual_usage.completion;
            total_cached_tokens = actual_usage.cached;
            total_audio_tokens = actual_usage.audio_tokens;
            total_audio_cached_tokens = actual_usage.audio_cached_tokens;
            total_image_tokens = actual_usage.image_tokens;
            total_total_tokens = actual_usage.total;
        }

        // 避免空计费
        if total_prompt_tokens == 0 && total_completion_tokens == 0 {
            total_completion_tokens = 1;
        }

        let req_json = serde_json::from_str::<serde_json::Value>(&request_content_str).unwrap_or(serde_json::json!({}));
        let features = crate::relay::usage_extractor::extract_request_features(&req_json);
        // 折扣策略: MIN(用户模型折扣, 全站折扣, 等级折扣), 受折扣限价约束
        let umd = db_model.as_ref().and_then(|m| crate::relay::proxy::parse_user_model_discount(&model_discounts, &m.mid));
        let (final_discount, discount_source) = crate::relay::proxy::resolve_discount(db_model.as_ref(), discount, umd);

        let is_ha_plugin_enabled = crate::api::plugins::is_plugin_enabled(&state, "high_availability_channel").await;
        let applied_discount = if is_ha_plugin_enabled {
            final_discount * channel.rate
        } else {
            final_discount
        };

        let cost_usage = crate::relay::usage_extractor::UsageTokens { prompt: total_prompt_tokens, completion: total_completion_tokens, total: total_total_tokens, cached: total_cached_tokens, cache_creation: 0, audio_tokens: total_audio_tokens, audio_cached_tokens: total_audio_cached_tokens, image_tokens: total_image_tokens };
        let (cost, mut detail) = crate::relay::compute_cost(db_model.as_ref(), db_rule.as_ref(), &cost_usage, applied_discount, &features);
        detail.push_str(&format!(" | {}", discount_source));
        if is_ha_plugin_enabled && channel.rate != 1.0 {
            detail.push_str(&format!(" | 渠道倍率: {}x", channel.rate));
        }
        let (resolved_model, mapping_source) = crate::relay::router::resolve_model(&channel, &model, db_model.as_ref());
        if let Some(src) = mapping_source {
            detail.push_str(&format!(" | {}: {} ➞ {}", src, model, resolved_model));
        }

        let latency_ms = start_time.elapsed().as_millis() as u32;
        let ep = format!("{}|{}", entry_endpoint, upstream_path);
        // 【一条日志原则】有 pending_log_id 时 UPDATE 预记录行
        crate::relay::proxy::record_and_bill_inner(
            &state, &token, channel.id, &model, total_prompt_tokens, total_completion_tokens, total_cached_tokens,
            cost, pre_deducted, pre_deduct_gift, 200, &ep, None, latency_ms, 1,
            Some(request_content_str), Some(raw_response_text), upstream_req_content, Some(detail), Some("聊天"), pending_log_id, None, None, db_model.as_ref()
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



/// 图片流式处理
/// pending_log_id: 预记录日志 ID，有值时 UPDATE 该行（一条日志原则）
pub async fn handle_image_stream(
    state: Arc<AppState>,
    token: ApiToken,
    channel: Channel,
    model: String,
    response: ReqwestResponse,
    discount: f64,
    model_discounts: Option<String>,
    request_content_str: String,
    start_time: std::time::Instant,
    upstream_path: String,
    upstream_req_content: Option<String>,
    pre_deducted: f64,
    pre_deduct_gift: f64,
    entry_endpoint: String,
    smart_router_ep: Option<String>,
    pending_log_id: Option<i64>,
    db_model: Option<Model>,
    db_rule: Option<BillingRule>,
) -> impl IntoResponse {
    let (tx, rx) = mpsc::channel(100);
    let mut upstream_stream = response.bytes_stream();
    
    // Spawn a worker to process the stream
    tokio::spawn(async move {
        let mut full_response_text = String::new();
        
        while let Some(chunk_result) = upstream_stream.next().await {
            match chunk_result {
                Ok(bytes) => {
                    full_response_text.push_str(&String::from_utf8_lossy(&bytes));
                    if tx.send(Ok::<_, axum::Error>(bytes.clone())).await.is_err() { break; }
                }
                Err(_) => break,
            }
        }
        
        // 流结束后统一提取 token 用量（与 handle_chat_stream 一致，复用 parse_usage 完整能力）
        let usage = crate::relay::usage_extractor::parse_usage(&full_response_text);
        let total_prompt_tokens = usage.prompt;
        let total_completion_tokens = usage.completion;
        let total_cached_tokens = usage.cached;
        let total_cache_creation = usage.cache_creation;

        let req_json = serde_json::from_str::<serde_json::Value>(&request_content_str).unwrap_or(serde_json::json!({}));
        let mut features = crate::relay::usage_extractor::extract_request_features(&req_json);
        // 流式完成后，从完整响应中提取实际图片数量（按张计费的最终依据）
        if let Some(resp_count) = crate::relay::usage_extractor::count_response_images(&full_response_text) {
            features.image_count = Some(resp_count);
        }
        // 折扣策略: MIN(用户模型折扣, 全站折扣, 等级折扣), 受折扣限价约束
        let umd = db_model.as_ref().and_then(|m| crate::relay::proxy::parse_user_model_discount(&model_discounts, &m.mid));
        let (final_discount, discount_source) = crate::relay::proxy::resolve_discount(db_model.as_ref(), discount, umd);
        features.cache_creation = if total_cache_creation > 0 { Some(total_cache_creation) } else { None };

        let is_ha_plugin_enabled = crate::api::plugins::is_plugin_enabled(&state, "high_availability_channel").await;
        let applied_discount = if is_ha_plugin_enabled {
            final_discount * channel.rate
        } else {
            final_discount
        };

        let (cost, mut detail) = crate::relay::compute_cost(db_model.as_ref(), db_rule.as_ref(), &usage, applied_discount, &features);
        detail.push_str(&format!(" | {}", discount_source));
        if is_ha_plugin_enabled && channel.rate != 1.0 {
            detail.push_str(&format!(" | 渠道倍率: {}x", channel.rate));
        }
        let (resolved_model, mapping_source) = crate::relay::router::resolve_model(&channel, &model, db_model.as_ref());
        if let Some(src) = mapping_source {
            detail.push_str(&format!(" | {}: {} ➞ {}", src, model, resolved_model));
        }
        if let Some(ep_name) = &smart_router_ep {
            detail.push_str(&format!(" | 智能路由: {}", ep_name));
        }
        
        let latency_ms = start_time.elapsed().as_millis() as u32;
        let ep = format!("{}|{}", entry_endpoint, upstream_path);
        // 【一条日志原则】有 pending_log_id 时 UPDATE 预记录行
        crate::relay::proxy::record_and_bill_inner(
            &state, &token, channel.id, &model, total_prompt_tokens, total_completion_tokens, total_cached_tokens,
            cost, pre_deducted, pre_deduct_gift, 200, &ep, None, latency_ms, 1,
            Some(request_content_str), Some(full_response_text), upstream_req_content, Some(detail), Some("图片"), pending_log_id, None, None, db_model.as_ref()
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

/// 原生协议流式处理
/// pending_log_id: 预记录日志 ID，有值时 UPDATE 该行（一条日志原则）
pub async fn handle_native_stream(
    state: Arc<AppState>,
    token: ApiToken,
    channel: Channel,
    model: String,
    response: ReqwestResponse,
    discount: f64,
    model_discounts: Option<String>,
    request_content_str: String,
    start_time: std::time::Instant,
    upstream_path: String,
    upstream_req_content: Option<String>,
    pre_deducted: f64,
    pre_deduct_gift: f64,
    entry_endpoint: String,
    smart_router_ep: Option<String>,
    pending_log_id: Option<i64>,
    db_model: Option<Model>,
    db_rule: Option<BillingRule>,
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
        
        // 统一从完整响应文本提取 token 用量（复用 parse_usage 完整能力，覆盖 OpenAI/Gemini/Anthropic 等所有格式）
        let fallback = crate::relay::usage_extractor::parse_usage(&full_response_text);
        let mut prompt_tokens = fallback.prompt;
        let mut completion_tokens = fallback.completion;
        let cached_tokens = fallback.cached;
        let cache_creation_tokens = fallback.cache_creation;
        
        // 仍为 0 则估算（兜底：上游未返回任何可识别的 usage 结构）
        if prompt_tokens == 0 && completion_tokens == 0 {
             let req_json = serde_json::from_str::<serde_json::Value>(&request_content_str).unwrap_or(serde_json::json!({}));
             prompt_tokens = crate::relay::chat::estimate_prompt_tokens(&req_json);
             completion_tokens = (full_response_text.len() as f64 / 4.0).ceil() as i32;
        }

        let req_json = serde_json::from_str::<serde_json::Value>(&request_content_str).unwrap_or(serde_json::json!({}));
        let mut features = crate::relay::usage_extractor::extract_request_features(&req_json);
        // 流式完成后，从完整响应中提取实际图片数量（Gemini 生图场景）
        if let Some(resp_count) = crate::relay::usage_extractor::count_response_images(&full_response_text) {
            features.image_count = Some(resp_count);
        }
        // 折扣策略: MIN(用户模型折扣, 全站折扣, 等级折扣), 受折扣限价约束
        let umd = db_model.as_ref().and_then(|m| crate::relay::proxy::parse_user_model_discount(&model_discounts, &m.mid));
        let (final_discount, discount_source) = crate::relay::proxy::resolve_discount(db_model.as_ref(), discount, umd);
        features.cache_creation = if cache_creation_tokens > 0 { Some(cache_creation_tokens) } else { None };

        let is_ha_plugin_enabled = crate::api::plugins::is_plugin_enabled(&state, "high_availability_channel").await;
        let applied_discount = if is_ha_plugin_enabled {
            final_discount * channel.rate
        } else {
            final_discount
        };

        let cost_usage = crate::relay::usage_extractor::UsageTokens { prompt: prompt_tokens, completion: completion_tokens, ..fallback };
        let (cost, mut detail) = crate::relay::compute_cost(db_model.as_ref(), db_rule.as_ref(), &cost_usage, applied_discount, &features);
        detail.push_str(&format!(" | {}", discount_source));
        if is_ha_plugin_enabled && channel.rate != 1.0 {
            detail.push_str(&format!(" | 渠道倍率: {}x", channel.rate));
        }
        let (resolved_model, mapping_source) = crate::relay::router::resolve_model(&channel, &model, db_model.as_ref());
        if let Some(src) = mapping_source {
            detail.push_str(&format!(" | {}: {} ➞ {}", src, model, resolved_model));
        }
        if let Some(ep_name) = &smart_router_ep {
            detail.push_str(&format!(" | 智能路由: {}", ep_name));
        }
        
        let ep = format!("{}|{}", entry_endpoint, upstream_path);
        // 【一条日志原则】有 pending_log_id 时 UPDATE 预记录行
        crate::relay::proxy::record_and_bill_inner(
            &state, &token, channel.id, &model, prompt_tokens, completion_tokens, cached_tokens,
            cost, pre_deducted, pre_deduct_gift, 200, &ep, None, latency_ms, 1,
            Some(request_content_str), Some(full_response_text), upstream_req_content, Some(detail), None, pending_log_id, None, None, db_model.as_ref()
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
