use std::sync::Arc;
use crate::AppState;
use crate::models::{ApiToken, Channel};
use crate::error::{AppResult};
use crate::providers::StreamChunk;
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
) -> impl IntoResponse {
    let (tx, rx) = mpsc::channel(100);
    let mut upstream_stream = response.bytes_stream();
    
    // Spawn a worker to process the stream
    tokio::spawn(async move {
        let mut total_prompt_tokens = prompt_tokens;
        let mut total_completion_tokens = 0;
        let mut buffer = String::new();
        
        // Use a provider-specific parser (mocked for now, will implement properly)
        let provider_type = channel.provider_type.clone();
        
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
                        if let Some(transformed) = transform_sse_line(&provider_type, line, &model) {
                            // Extract content length for rough token count if not provided
                            if provider_type != "openai" {
                                // Simple heuristic: 1 token approx 4 chars
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
        
        if let Err(e) = record_usage(&state, &token, &channel, &model, total_prompt_tokens, total_completion_tokens, cost).await {
            tracing::error!("Failed to record usage for stream: {:?}", e);
        }
    });

    let stream = tokio_stream::wrappers::ReceiverStream::new(rx);

    Response::builder()
        .header("Content-Type", "text/event-stream")
        .header("Cache-Control", "no-cache")
        .header("Connection", "keep-alive")
        .body(axum::body::Body::from_stream(stream))
        .unwrap()
}

fn transform_sse_line(provider: &str, line: &str, model: &str) -> Option<String> {
    if !line.starts_with("data: ") { return None; }
    let data = &line[6..];
    if data == "[DONE]" { return None; }

    match provider {
        "anthropic" => transform_anthropic(data, model),
        "google" => transform_gemini(data, model),
        _ => Some(data.to_string()), // Default OpenAI compatible
    }
}

fn transform_anthropic(data: &str, model: &str) -> Option<String> {
    // Anthropic SSE formats: content_block_delta, message_stop, etc.
    let v: serde_json::Value = serde_json::from_str(data).ok()?;
    let event_type = v.get("type")?.as_str()?;
    
    if event_type == "content_block_delta" {
        let text = v.get("delta")?.get("text")?.as_str()?;
        let chunk = create_openai_chunk(text, model);
        return serde_json::to_string(&chunk).ok();
    }
    
    None
}

fn transform_gemini(data: &str, model: &str) -> Option<String> {
    // Gemini SSE format is typically just the candidate JSON
    let v: serde_json::Value = serde_json::from_str(data).ok()?;
    let text = v.get("candidates")?
        .get(0)?
        .get("content")?
        .get("parts")?
        .get(0)?
        .get("text")?
        .as_str()?;
        
    let chunk = create_openai_chunk(text, model);
    serde_json::to_string(&chunk).ok()
}

fn create_openai_chunk(text: &str, model: &str) -> StreamChunk {
    use crate::providers::{Choice, Message};
    StreamChunk {
        id: uuid::Uuid::new_v4().to_string(),
        object: "chat.completion.chunk".to_string(),
        created: chrono::Utc::now().timestamp(),
        model: model.to_string(),
        choices: vec![Choice {
            index: 0,
            message: None,
            delta: Some(Message {
                role: "assistant".to_string(),
                content: Some(serde_json::Value::String(text.to_string())),
                name: None,
                tool_calls: None,
                tool_call_id: None,
                extra: Default::default(),
            }),
            finish_reason: None,
        }],
        usage: None,
    }
}

async fn record_usage(state: &Arc<AppState>, token: &ApiToken, channel: &Channel, model: &str, prompt: i32, completion: i32, cost: f64) -> AppResult<()> {
    let mut tx = state.db.pool.begin().await?;

    sqlx::query(&state.db.format_query("UPDATE api_tokens SET quota_used = quota_used + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"))
        .bind(cost).bind(token.id).execute(&mut *tx).await?;

    sqlx::query(&state.db.format_query("UPDATE users SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"))
        .bind(cost).bind(&token.user_id).execute(&mut *tx).await?;

    sqlx::query(&state.db.format_query(r#"INSERT INTO logs (user_id, channel_id, token_id, model, prompt_tokens, completion_tokens, cost, status_code, endpoint)
                   VALUES (?, ?, ?, ?, ?, ?, ?, 200, '/v1/chat/completions')"#))
        .bind(&token.user_id).bind(channel.id).bind(token.id).bind(model).bind(prompt).bind(completion).bind(cost)
        .execute(&mut *tx).await?;
    
    tx.commit().await?;
    Ok(())
}
