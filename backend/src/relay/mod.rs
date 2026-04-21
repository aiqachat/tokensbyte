pub mod router;
pub mod stream;
pub mod proxy;
pub mod image;
pub mod video;
pub mod native;
pub mod url_utils;
pub mod forward;
pub mod usage_extractor;

use axum::{
    extract::{State, Extension},
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



    // 2. 获取用户信息
    let ctx = proxy::get_user_context(&state, &token.user_id).await?;
    let pre_deduction = proxy::check_access(&state, &token, model, ctx.balance).await?;

    // 3. 选择渠道
    let (channel, resolved_model) = proxy::select_channel_for_model(&state, &token, model, &ctx.user_group, "/v1/chat/completions").await?;

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
        let mut final_upstream_path = resolved.upstream_path.replace("${model}", &resolved_model);
        let stream_url = if target_type == "gemini" {
            final_upstream_path = final_upstream_path
                .replace(":generateContent", ":streamGenerateContent")
                + "?alt=sse";
            let mut final_url = url_utils::join_url(&channel.base_url, &final_upstream_path);
            if resolved.auth_type == "query_key" {
                if final_url.contains('?') {
                    final_url = format!("{}&key={}", final_url, channel.api_key);
                } else {
                    final_url = format!("{}?key={}", final_url, channel.api_key);
                }
            }
            final_url
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
            let ep = format!("/v1/chat/completions|{}", final_upstream_path);
            proxy::record_and_bill(
                &state, &token, channel.id, model, 0, 0, 0.0, status,
                &ep, Some(&display_err), latency_ms, 1,
                Some(request_content_str.clone()), Some(err), Some(upstream_body.to_string()),
                None
            ).await;
            return Err(AppError::UpstreamError(display_err));
        }

        let prompt_tokens = estimate_prompt_tokens(&body);


        if pre_deduction > 0.0 {
            if let Err(e) = proxy::pre_deduct(&state, &token.user_id, pre_deduction).await {
                tracing::error!("Pre deduction failed for {}: {:?}", token.user_id, e);
            }
        }

        Ok(stream::handle_chat_stream(
            state, token, channel, model.to_string(), resp,
            ctx.discount, prompt_tokens, request_content_str, start_time, target_type,
            final_upstream_path,
            Some(upstream_body.to_string()),
            pre_deduction
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
                Some(request_content_str.clone()), Some(err), Some(upstream_body.to_string()),
                None
            ).await;
            return Err(AppError::UpstreamError(display_err));
        }

        let data = resp.bytes().await?;
        let response_content_str = String::from_utf8_lossy(&data).to_string();

        // 解析 usage（兼容多种格式）
        let usage_tokens = usage_extractor::parse_usage(&response_content_str);
        let prompt_tokens = usage_tokens.prompt;
        let completion_tokens = usage_tokens.completion;

        // 提取请求参数特征用于进阶计费
        let features = usage_extractor::extract_request_features(&body);

        // 计费: 联表查询 Model 及其关联的 BillingRule
        let db_model: Option<crate::models::Model> = sqlx::query_as(
            &state.db.format_query("SELECT * FROM models WHERE model_id = ? AND is_active = 1"),
        )
        .bind(model)
        .fetch_optional(&state.db.pool)
        .await?;

        let db_rule: Option<crate::models::BillingRule> = if let Some(ref m) = db_model {
            if let Some(rule_id) = m.billing_rule_id {
                sqlx::query_as(&state.db.format_query("SELECT * FROM billing_rules WHERE id = ? AND is_active = 1"))
                    .bind(rule_id)
                    .fetch_optional(&state.db.pool)
                    .await?
            } else { None }
        } else { None };

        let pre_deduction = db_model.as_ref().map(|m| m.pre_deduction).unwrap_or(0.0);
        if pre_deduction > 0.0 {
            let _ = proxy::pre_deduct(&state, &token.user_id, pre_deduction).await;
        }

        let (final_discount, discount_source) = proxy::resolve_discount(db_model.as_ref(), ctx.discount);

        let (quota_used, mut detail) = compute_cost(db_model.as_ref(), db_rule.as_ref(), prompt_tokens, completion_tokens, final_discount, &features);
        detail.push_str(&format!(" | {}", discount_source));
        if model != resolved_model {
            detail.push_str(&format!(" | 模型映射: {} ➞ {}", model, resolved_model));
        }
        let latency_ms = start_time.elapsed().as_millis() as u32;
        let ep = format!("/v1/chat/completions|{}", resolved.upstream_path.replace("${model}", &resolved_model));

        proxy::record_and_bill_with_prededuction(
            &state, &token, channel.id, model, prompt_tokens, completion_tokens,
            quota_used, pre_deduction, 200, &ep, None, latency_ms, 0,
            Some(request_content_str), Some(response_content_str.clone()), Some(upstream_body.to_string()),
            Some(detail)
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

// 我们已将 parse_chat_usage 移到了 usage_extractor.rs 中

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
                let usage_tokens = usage_extractor::parse_usage(response);
                return serde_json::to_string(&serde_json::json!({
                    "id": v.get("id").and_then(|i| i.as_str()).unwrap_or(""),
                    "object": "chat.completion",
                    "created": chrono::Utc::now().timestamp(),
                    "model": model,
                    "choices": [{"index": 0, "message": {"role": "assistant", "content": content}, "finish_reason": "stop"}],
                    "usage": {"prompt_tokens": usage_tokens.prompt, "completion_tokens": usage_tokens.completion, "total_tokens": usage_tokens.total}
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
                let usage_tokens = usage_extractor::parse_usage(response);
                return serde_json::to_string(&serde_json::json!({
                    "id": uuid::Uuid::new_v4().to_string(),
                    "object": "chat.completion",
                    "created": chrono::Utc::now().timestamp(),
                    "model": model,
                    "choices": [{"index": 0, "message": {"role": "assistant", "content": content}, "finish_reason": finish}],
                    "usage": {"prompt_tokens": usage_tokens.prompt, "completion_tokens": usage_tokens.completion, "total_tokens": usage_tokens.total}
                })).unwrap_or_else(|_| response.to_string());
            }
            response.to_string()
        }
        _ => response.to_string(), // OpenAI 格式直接返回
    }
}

/// 统一计费逻辑
pub fn compute_cost(
    _db_model: Option<&crate::models::Model>, 
    db_rule: Option<&crate::models::BillingRule>, 
    prompt_tokens: i32, 
    completion_tokens: i32, 
    discount: f64,
    features: &usage_extractor::ExtractedFeatures
) -> (f64, String) {
    let rule = match db_rule {
        Some(r) => r,
        None => {
            // 没有配置计费规则，走默认基础计费 1M 万字 = 1美金 等价
            let total = prompt_tokens + completion_tokens;
            let cost = (total as f64 / 1_000_000.0) * discount;
            return (cost, format!("无规则默认计费: {}总Tokens * 1/1M * {:.2}倍率", total, discount));
        }
    };

    // 供解析分辨率费率使用的辅助结构体
    #[derive(serde::Deserialize)]
    struct ResolutionTier {
        pub resolution: String,
        pub rate: f64,
        pub enabled: bool,
    }

    match rule.billing_type.as_str() {
        "requests" => {
            let mut rate = rule.fixed_rate;
            let mut count = 1.0;
            let mut detail_desc = "固定按次计费".to_string();

            if rule.billing_rule == "per_image" {
                // 按张计费：严格使用从响应提取的实际图片数量，不回落到 completion_tokens
                count = match features.image_count {
                    Some(c) if c > 0 => c as f64,
                    _ => {
                        tracing::warn!("[Billing] per_image 规则未获取到图片数量，默认按 1 张计费");
                        1.0
                    }
                };
                detail_desc = "按张返回计费".to_string();
            } else if rule.billing_rule == "image_resolution" {
                count = features.image_count.map(|c| c.max(1) as f64).unwrap_or(1.0);
                detail_desc = format!("分辨率匹配计费(默认单价: {})", rate);
                if let Some(res) = &features.resolution {
                    if let Ok(tiers) = serde_json::from_str::<Vec<ResolutionTier>>(&rule.pricing_tiers) {
                        for tier in tiers {
                            if tier.enabled && tier.resolution.eq_ignore_ascii_case(res) {
                                rate = tier.rate; 
                                detail_desc = format!("命中分辨率阶梯 {} 单价: {}", res, rate);
                                break;
                            }
                        }
                    }
                }
            }
            let cost = count * rate * discount;
            (cost, format!("{} -> ({}量 * {}单价 * {:.2}倍率)", detail_desc, count, rate, discount))
        },
        "duration" => {
            let dur = features.duration_seconds.unwrap_or(0.0);
            let mut rate = rule.duration_rate; 
            let mut detail_desc = "固定按秒时长计费".to_string();

            if rule.billing_rule == "video_resolution" {
                detail_desc = format!("视频分辨率阶梯找寻(默认单价: {})", rate);
                if let Some(res) = &features.resolution {
                    if let Ok(tiers) = serde_json::from_str::<Vec<ResolutionTier>>(&rule.pricing_tiers) {
                        for tier in tiers {
                            if tier.enabled && tier.resolution.eq_ignore_ascii_case(res) {
                                rate = tier.rate; 
                                detail_desc = format!("命中视频分辨率 {} 单价: {}", res, rate);
                                break;
                            }
                        }
                    }
                }
            }

            let cost = dur * rate * discount;
            (cost, format!("{} -> ({:.2}秒 * {}单价 * {:.2}倍率)", detail_desc, dur, rate, discount))
        },
        _ => {
            // tokens 计费
            let mut p_rate = rule.prompt_rate;
            let mut c_rate = rule.completion_rate;
            let mut is_overridden = false;
            let mut detail_desc = "标准 Tokens 计费".to_string();
            
            if rule.billing_rule == "seedance2.0" {
                if let Ok(ext) = serde_json::from_str::<serde_json::Value>(&rule.extended_config) {
                    if let Some(rates) = ext.get("resolution_rates") {
                        let res_key = features.resolution.as_deref().unwrap_or("720p").to_lowercase();
                        let tier = rates.get(&res_key).or_else(|| rates.get("720p"));
                        let (rate_field, video_label) = if features.has_video { ("with_video", "含视频") } else { ("without_video", "无视频") };
                        if let Some(rate) = tier.and_then(|t| t.get(rate_field)).and_then(|v| v.as_f64()) {
                            p_rate = rate; c_rate = rate; is_overridden = true;
                            detail_desc = format!("Seedance2.0({}|{}|单价:{})", res_key, video_label, rate);
                        }
                    }
                }
            } else if rule.billing_rule == "seedance1.5pro" {
                if let Ok(ext) = serde_json::from_str::<serde_json::Value>(&rule.extended_config) {
                    if features.has_audio {
                        if let Some(ar) = ext.get("audio_rate").and_then(|v| v.as_f64()) {
                            p_rate = ar; c_rate = ar; is_overridden = true;
                            detail_desc = format!("Seedance1.5Pro(含语音单价:{})", ar);
                        }
                    } else {
                        if let Some(br) = ext.get("base_rate").and_then(|v| v.as_f64()) {
                            p_rate = br; c_rate = br; is_overridden = true;
                            detail_desc = format!("Seedance1.5Pro(无语音单价:{})", br);
                        }
                    }
                }
            }

            if !is_overridden && rule.billing_rule == "tiered" {
                let mut tiers: Vec<crate::models::PricingTier> = serde_json::from_str(&rule.pricing_tiers).unwrap_or_default();
                // 确保按照 prompt 升序
                tiers.sort_by_key(|t| t.max_prompt_tokens);
                for tier in tiers {
                    if prompt_tokens <= tier.max_prompt_tokens {
                        // 如果存在 completion 限制，则优先遵循
                        if let Some(mc) = tier.max_completion_tokens {
                            if completion_tokens <= mc {
                                p_rate = tier.prompt_rate;
                                c_rate = tier.completion_rate;
                                detail_desc = format!("阶梯计费(命中规则<={}P|<={}C)", tier.max_prompt_tokens, mc);
                                break;
                            }
                        } else {
                            // 没有 completion 限制，直接采纳
                            p_rate = tier.prompt_rate;
                            c_rate = tier.completion_rate;
                            detail_desc = format!("阶梯计费(命中规则<={}P)", tier.max_prompt_tokens);
                            break;
                        }
                    }
                }
            }
            let cost = ((prompt_tokens as f64 * p_rate + completion_tokens as f64 * c_rate) / 1_000_000.0) * discount;
            (cost, format!("{} -> ({:.6}P*{} + {:.6}C*{})/1M * {:.2}倍率", detail_desc, prompt_tokens, p_rate, completion_tokens, c_rate, discount))
        }
    }
}
