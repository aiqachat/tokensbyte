use crate::models::{ApiToken, BillingRule, Channel, Model};
use crate::AppState;
use std::sync::Arc;

use axum::response::{IntoResponse, Response};
use futures::StreamExt;
use reqwest::Response as ReqwestResponse;
use tokio::sync::mpsc;

/// 流结束后统一结算：resolve_model → calculate_relay_cost → 可选 detail_extra → record_and_bill_inner
async fn settle_after_stream(
    state: &Arc<AppState>,
    token: &ApiToken,
    channel: &Channel,
    model: &str,
    db_model: Option<&Model>,
    db_rule: &mut Option<BillingRule>,
    discount: f64,
    model_discounts: &Option<String>,
    usage: &crate::relay::usage_extractor::UsageTokens,
    features: &crate::relay::usage_extractor::ExtractedFeatures,
    detail_extra: Option<String>,
    start_time: std::time::Instant,
    entry_endpoint: &str,
    upstream_path: &str,
    pre_deducted: f64,
    pre_deduct_gift: f64,
    request_content: String,
    response_content: String,
    upstream_req_content: Option<String>,
    hint_category: Option<&str>,
    pending_log_id: Option<i64>,
) {
    let (resolved_model, mapping_source) =
        crate::relay::router::resolve_model(channel, model, db_model);
    let (cost, mut detail) = crate::relay::calculate_relay_cost(
        state,
        db_model,
        db_rule.as_mut(),
        channel,
        discount,
        model_discounts,
        usage,
        features,
        mapping_source,
        model,
        &resolved_model,
    )
    .await;
    if let Some(extra) = detail_extra {
        detail.push_str(&extra);
    }
    let latency_ms = start_time.elapsed().as_millis() as u32;
    let ep = format!("{}|{}", entry_endpoint, upstream_path);
    crate::relay::proxy::record_and_bill_inner(crate::relay::proxy::BillRecord {
        state,
        token,
        channel,
        model,
        prompt_tokens: usage.prompt,
        completion_tokens: usage.completion,
        cached_tokens: usage.cached,
        cost,
        pre_deducted,
        pre_deduct_gift,
        status_code: 200,
        endpoint: &ep,
        error_msg: None,
        latency_ms,
        is_stream: 1,
        request_content: Some(request_content),
        response_content: Some(response_content),
        upstream_req_content,
        billing_detail: Some(detail),
        hint_category,
        pending_log_id,
        billing_model_hint: None,
        plugin_tag: None,
        db_model,
    })
    .await;
}

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
    mut db_rule: Option<BillingRule>,
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
                        if tx
                            .send(Ok::<_, axum::Error>(chunk_str.to_string()))
                            .await
                            .is_err()
                        {
                            break;
                        }
                    } else {
                        buffer.push_str(&chunk_str);
                        while let Some(index) = buffer.find('\n') {
                            let line = buffer.drain(..index + 1).collect::<String>();
                            let line = line.trim();
                            if line.is_empty() {
                                continue;
                            }
                            if let Some(transformed) = crate::relay::forward::transform_sse_line(
                                &target_type,
                                line,
                                &model,
                            ) {
                                if target_type != "openai"
                                    && target_type != "volcengine_chat"
                                    && target_type != "volcengine"
                                {
                                    total_completion_tokens += 1;
                                }
                                if tx
                                    .send(Ok::<_, axum::Error>(format!(
                                        "data: {}\n\n",
                                        transformed
                                    )))
                                    .await
                                    .is_err()
                                {
                                    break;
                                }
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

        let req_json = serde_json::from_str::<serde_json::Value>(&request_content_str)
            .unwrap_or(serde_json::json!({}));
        let mut features = crate::relay::usage_extractor::extract_request_features(&req_json);
        features.cache_creation = if total_cache_creation > 0 {
            Some(total_cache_creation)
        } else {
            None
        };
        // 折扣策略: MIN(用户模型折扣, 全站折扣, 等级折扣), 受折扣限价约束
        let cost_usage = crate::relay::usage_extractor::UsageTokens {
            prompt: total_prompt_tokens,
            completion: total_completion_tokens,
            total: total_total_tokens,
            cached: total_cached_tokens,
            cache_creation: total_cache_creation,
            audio_tokens: total_audio_tokens,
            audio_cached_tokens: total_audio_cached_tokens,
            image_tokens: total_image_tokens,
            web_search: 0,
        };
        settle_after_stream(
            &state,
            &token,
            &channel,
            &model,
            db_model.as_ref(),
            &mut db_rule,
            discount,
            &model_discounts,
            &cost_usage,
            &features,
            smart_router_ep
                .as_ref()
                .map(|ep| format!(" | 智能路由: {}", ep)),
            start_time,
            &entry_endpoint,
            &upstream_path,
            pre_deducted,
            pre_deduct_gift,
            request_content_str,
            raw_response_text,
            upstream_req_content,
            Some("聊天"),
            pending_log_id,
        )
        .await;
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
    mut db_rule: Option<BillingRule>,
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
                    if tx
                        .send(Ok::<_, axum::Error>(chunk_str.to_string()))
                        .await
                        .is_err()
                    {
                        break;
                    }
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
        let mut actual_usage = crate::relay::usage_extractor::UsageTokens {
            prompt: 0,
            completion: 0,
            total: 0,
            cached: 0,
            cache_creation: 0,
            audio_tokens: 0,
            audio_cached_tokens: 0,
            image_tokens: 0,
            web_search: 0,
        };
        if !raw_response_text.is_empty() {
            actual_usage = crate::relay::usage_extractor::parse_usage(&raw_response_text);
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

        let req_json = serde_json::from_str::<serde_json::Value>(&request_content_str)
            .unwrap_or(serde_json::json!({}));
        let mut features = crate::relay::usage_extractor::extract_request_features(&req_json);
        if actual_usage.web_search > 0 {
            features.web_search = Some(actual_usage.web_search);
        }
        let cost_usage = crate::relay::usage_extractor::UsageTokens {
            prompt: total_prompt_tokens,
            completion: total_completion_tokens,
            total: total_total_tokens,
            cached: total_cached_tokens,
            cache_creation: 0,
            audio_tokens: total_audio_tokens,
            audio_cached_tokens: total_audio_cached_tokens,
            image_tokens: total_image_tokens,
            web_search: actual_usage.web_search,
        };
        settle_after_stream(
            &state,
            &token,
            &channel,
            &model,
            db_model.as_ref(),
            &mut db_rule,
            discount,
            &model_discounts,
            &cost_usage,
            &features,
            None,
            start_time,
            &entry_endpoint,
            &upstream_path,
            pre_deducted,
            pre_deduct_gift,
            request_content_str,
            raw_response_text,
            upstream_req_content,
            Some("聊天"),
            pending_log_id,
        )
        .await;
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
    mut db_rule: Option<BillingRule>,
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
                    if tx.send(Ok::<_, axum::Error>(bytes.clone())).await.is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }

        // 流结束后统一提取 token 用量（与 handle_chat_stream 一致，复用 parse_usage 完整能力）
        let usage = crate::relay::usage_extractor::parse_usage(&full_response_text);

        let req_json = serde_json::from_str::<serde_json::Value>(&request_content_str)
            .unwrap_or(serde_json::json!({}));
        let mut features = crate::relay::usage_extractor::extract_request_features(&req_json);
        // 流式完成后，从完整响应中提取实际图片数量（按张计费的最终依据）
        if let Some(resp_count) =
            crate::relay::usage_extractor::count_response_images(&full_response_text)
        {
            features.image_count = Some(resp_count);
        }
        features.cache_creation = if usage.cache_creation > 0 {
            Some(usage.cache_creation)
        } else {
            None
        };
        settle_after_stream(
            &state,
            &token,
            &channel,
            &model,
            db_model.as_ref(),
            &mut db_rule,
            discount,
            &model_discounts,
            &usage,
            &features,
            smart_router_ep
                .as_ref()
                .map(|ep| format!(" | 智能路由: {}", ep)),
            start_time,
            &entry_endpoint,
            &upstream_path,
            pre_deducted,
            pre_deduct_gift,
            request_content_str,
            full_response_text,
            upstream_req_content,
            Some("图片"),
            pending_log_id,
        )
        .await;
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
/// hint_category: 调用方解析后的类别（Gemini 原生可为图片/聊天）
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
    mut db_rule: Option<BillingRule>,
    hint_category: String,
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

        // 统一从完整响应文本提取 token 用量（复用 parse_usage 完整能力，覆盖 OpenAI/Gemini/Anthropic 等所有格式）
        let fallback = crate::relay::usage_extractor::parse_usage(&full_response_text);
        let mut prompt_tokens = fallback.prompt;
        let mut completion_tokens = fallback.completion;
        let cache_creation_tokens = fallback.cache_creation;

        // 仍为 0 则估算（兜底：上游未返回任何可识别的 usage 结构）
        if prompt_tokens == 0 && completion_tokens == 0 {
            let req_json = serde_json::from_str::<serde_json::Value>(&request_content_str)
                .unwrap_or(serde_json::json!({}));
            prompt_tokens = crate::relay::chat::estimate_prompt_tokens(&req_json);
            completion_tokens = (full_response_text.len() as f64 / 4.0).ceil() as i32;
        }

        let req_json = serde_json::from_str::<serde_json::Value>(&request_content_str)
            .unwrap_or(serde_json::json!({}));
        let mut features = crate::relay::usage_extractor::extract_request_features(&req_json);

        // 上游体与入口体不同时才合并特征（原生透传二者相同，避免重复解析）
        if let Some(ref uc_str) = upstream_req_content {
            if uc_str != &request_content_str {
                if let Ok(uc_json) = serde_json::from_str::<serde_json::Value>(uc_str) {
                    features.merge(crate::relay::usage_extractor::extract_request_features(
                        &uc_json,
                    ));
                }
            }
        }

        // 流式完成后，从完整响应中提取实际图片数量（Gemini 生图场景）
        if let Some(resp_count) =
            crate::relay::usage_extractor::count_response_images(&full_response_text)
        {
            features.image_count = Some(resp_count);
        }
        features.cache_creation = if cache_creation_tokens > 0 {
            Some(cache_creation_tokens)
        } else {
            None
        };
        let cost_usage = crate::relay::usage_extractor::UsageTokens {
            prompt: prompt_tokens,
            completion: completion_tokens,
            ..fallback
        };
        settle_after_stream(
            &state,
            &token,
            &channel,
            &model,
            db_model.as_ref(),
            &mut db_rule,
            discount,
            &model_discounts,
            &cost_usage,
            &features,
            smart_router_ep
                .as_ref()
                .map(|ep| format!(" | 智能路由: {}", ep)),
            start_time,
            &entry_endpoint,
            &upstream_path,
            pre_deducted,
            pre_deduct_gift,
            request_content_str,
            full_response_text,
            upstream_req_content,
            Some(hint_category.as_str()),
            pending_log_id,
        )
        .await;
    });

    let stream = tokio_stream::wrappers::ReceiverStream::new(rx);

    Response::builder()
        .header("Content-Type", "text/event-stream")
        .header("Cache-Control", "no-cache")
        .header("Connection", "keep-alive")
        .body(axum::body::Body::from_stream(stream))
        .unwrap()
}
