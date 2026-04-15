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
) -> impl IntoResponse {
    let (tx, rx) = mpsc::channel(100);
    let mut upstream_stream = response.bytes_stream();
    
    // Spawn a worker to process the stream
    tokio::spawn(async move {
        let mut total_prompt_tokens = prompt_tokens;
        let mut total_completion_tokens = 0;
        let mut buffer = String::new();
        let mut full_response_text = String::new();
        
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
                        
                        // Transform and count
                        if let Some(transformed) = crate::relay::forward::transform_sse_line(&target_type, line, &model) {
                            // Extract content length for rough token count if not provided
                            if target_type != "openai" {
                                total_completion_tokens += 1; 
                            }
                            
                            if tx.send(Ok::<_, axum::Error>(format!("data: {}\n\n", transformed))).await.is_err() {
                                break;
                            }
                            full_response_text.push_str(&transformed);
                            full_response_text.push('\n');
                        }
                    }
                }
                Err(_) => break,
            }
        }
        
        // Finalize billing
        let _ = tx.send(Ok("data: [DONE]\n\n".to_string())).await;
        
        let db_model: Option<crate::models::Model> = sqlx::query_as(&state.db.format_query("SELECT * FROM models WHERE model_id = ? AND is_active = 1"))
            .bind(&model)
            .fetch_optional(&state.db.pool)
            .await
            .unwrap_or(None);

        let cost = match db_model {
            Some(m) => {
                match m.billing_type.as_str() {
                    "requests" => m.fixed_rate * discount,
                    _ => { // tokens or duration
                        let mut p_rate = m.prompt_rate;
                        let mut c_rate = m.completion_rate;

                        if m.billing_rule == "tiered" {
                            let tiers: Vec<crate::models::PricingTier> = serde_json::from_str(&m.pricing_tiers).unwrap_or_default();
                            let mut sorted_tiers = tiers;
                            sorted_tiers.sort_by_key(|t| t.max_tokens);
                            for tier in sorted_tiers {
                                if total_prompt_tokens <= tier.max_tokens {
                                    p_rate = tier.prompt_rate;
                                    c_rate = tier.completion_rate;
                                    break;
                                }
                            }
                        }

                        let divisor = 1_000_000.0;
                        ((total_prompt_tokens as f64 * p_rate + total_completion_tokens as f64 * c_rate) / divisor) * discount
                    }
                }
            },
            None => {
                let total_tokens = total_prompt_tokens + total_completion_tokens;
                (total_tokens as f64 / 1_000_000.0) * discount
            }
        };
        
        let latency_ms = start_time.elapsed().as_millis() as u32;
        let ep = format!("/v1/chat/completions|{}", upstream_path);
        crate::relay::proxy::record_and_bill(
            &state, &token, channel.id, &model, total_prompt_tokens, total_completion_tokens,
            cost, 200, &ep, None, latency_ms, 1,
            Some(request_content_str), Some(full_response_text), upstream_req_content
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
        
        let db_model: Option<crate::models::Model> = sqlx::query_as(&state.db.format_query("SELECT * FROM models WHERE model_id = ? AND is_active = 1"))
            .bind(&model)
            .fetch_optional(&state.db.pool)
            .await.unwrap_or(None);

        let cost = match db_model {
            Some(m) => {
                match m.billing_type.as_str() {
                    "requests" => m.fixed_rate * discount,
                    "duration" => 0.0,
                    _ => {
                        let mut p_rate = m.prompt_rate;
                        let mut c_rate = m.completion_rate;

                        if m.billing_rule == "tiered" {
                            let tiers: Vec<crate::models::PricingTier> = serde_json::from_str(&m.pricing_tiers).unwrap_or_default();
                            let mut sorted_tiers = tiers;
                            sorted_tiers.sort_by_key(|t| t.max_tokens);
                            for tier in sorted_tiers {
                                if total_prompt_tokens <= tier.max_tokens {
                                    p_rate = tier.prompt_rate;
                                    c_rate = tier.completion_rate;
                                    break;
                                }
                            }
                        }

                        let divisor = 1_000_000.0;
                        ((total_prompt_tokens as f64 * p_rate + total_completion_tokens as f64 * c_rate) / divisor) * discount
                    }
                }
            },
            None => {
                let total_tokens = total_prompt_tokens + total_completion_tokens;
                (total_tokens as f64 / 1_000_000.0) * discount
            }
        };
        
        let latency_ms = start_time.elapsed().as_millis() as u32;
        let ep = format!("/v1/images/generations|{}", upstream_path);
        crate::relay::proxy::record_and_bill(
            &state, &token, channel.id, &model, total_prompt_tokens, total_completion_tokens,
            cost, 200, &ep, None, latency_ms, 1,
            Some(request_content_str), Some(full_response_text), upstream_req_content
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
             let req_json = serde_json::from_str::<serde_json::Value>(&request_content_str).unwrap_or(serde_json::json!({}));
             prompt_tokens = crate::relay::estimate_prompt_tokens(&req_json);
             completion_tokens = (full_response_text.len() as f64 / 4.0).ceil() as i32;
        }

        let db_model: Option<crate::models::Model> = sqlx::query_as(&state.db.format_query("SELECT * FROM models WHERE model_id = ? AND is_active = 1"))
            .bind(&model)
            .fetch_optional(&state.db.pool)
            .await
            .unwrap_or(None);

        let cost = crate::relay::compute_cost(db_model, prompt_tokens, completion_tokens, discount);
        
        let ep = format!("{}|{}", upstream_path, upstream_path);
        crate::relay::proxy::record_and_bill(
            &state, &token, channel.id, &model, prompt_tokens, completion_tokens,
            cost, 200, &ep, None, latency_ms, 1,
            Some(request_content_str), Some(full_response_text), upstream_req_content
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
