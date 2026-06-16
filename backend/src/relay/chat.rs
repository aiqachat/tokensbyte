// ── 聊天 & Responses API 处理 ──────────────────────────────────
// 统一管理 Chat Completions 和 Responses API 的请求处理逻辑

use axum::{
    extract::{State, Extension, OriginalUri},
    Json,
    response::{Response, IntoResponse},
};
use std::sync::Arc;
use crate::AppState;
use crate::models::ApiToken;
use crate::error::{AppError, AppResult};
use super::{proxy, forward, router, stream, usage_extractor};

// ── Chat Completions (/v1/chat/completions) ──────────────────

pub async fn chat_completions(
    State(state): State<Arc<AppState>>,
    Extension(token): Extension<ApiToken>,
    OriginalUri(uri): OriginalUri,
    Json(body): Json<serde_json::Value>,
) -> AppResult<Response> {
    let start_time = std::time::Instant::now();
    let raw_path = uri.path();
    let request_content_str = serde_json::to_string(&body).unwrap_or_default();
    let model = body["model"].as_str()
        .ok_or_else(|| AppError::BadRequest(
            "Missing required parameter: model".to_string()
        ))?;
    let is_stream = body["stream"].as_bool().unwrap_or(false);

    let ctx = proxy::get_user_context(&state, &token.user_id).await?;

    let original_model = model;
    // 智能路由标记（提炼避免重复构建）
    let ep_tag = if model.starts_with("ep-tokensbyte") { Some(format!("智能路由: {}", model)) } else { None };

    // ── 智能路由 EP 节点拦截 ──
    // 如果 model 以 "ep-tokensbyte" 开头，说明用户请求的是智能路由推理节点
    // 先用原始 EP 名称校验令牌权限，再解析为实际模型
    let (resolved_ep_models, _ep_group_name) = if model.starts_with("ep-tokensbyte") {
        proxy::check_model_permission(&state, &token, model, "/v1/chat/completions").await?;
        match resolve_router_flow_endpoint(&state, &token.user_id, model).await {
            Ok((actual_models, group_name)) => {
                tracing::info!("[SmartRouter] EP {} -> models {:?} (group: {})", model, actual_models, group_name);
                (Some(actual_models), Some(group_name))
            }
            Err(e) => return Err(e),
        }
    } else {
        (None, None)
    };
    
    let model_list = resolved_ep_models.clone().unwrap_or_else(|| vec![model.to_string()]);
    let mut last_err = AppError::UpstreamError("No available models".into());

    // 【一条日志原则】循环重试场景下复用同一条日志记录，避免产生多条
    let mut pending_log_id: Option<i64> = None;

    for (retry_idx, current_model) in model_list.iter().enumerate() {
        let model = current_model.as_str();

        // 1. Token 模型权限校验（渠道选择前快速拦截；EP 已在循环外检查过）
        if resolved_ep_models.is_none() {
            if let Err(e) = proxy::check_model_permission(&state, &token, model, "/v1/chat/completions").await {
                last_err = e;
                continue;
            }
        }

        let mut failed_channel_aids: Vec<String> = Vec::new();
        let mut channel_retry_count = 0;
        
        let ha_config_retries = state.ha_max_retries.load(std::sync::atomic::Ordering::Relaxed);
        let is_ha_plugin_enabled = crate::api::plugins::is_plugin_enabled(&state, "high_availability_channel").await;
        let max_channel_retries = if is_ha_plugin_enabled && token.high_availability == 1 {
            ha_config_retries
        } else {
            1
        };

        loop {
            // 2. 选择渠道
            let channel = match proxy::select_channel_for_model_with_exclude(&state, &token, model, &ctx.user_group, &ctx.level_id, raw_path, &failed_channel_aids).await {
                Ok(c) => c,
                Err(e) => {
                    last_err = e;
                    break; // 没有更多渠道可用，跳出尝试下一个模型
                }
            };

            // 3. 预扣费检查（带 channel 精确匹配同名模型的预扣费金额；EP/非EP 统一调用，同时获取 Model 供下游复用）
            let (pre_deduction, db_model) = match proxy::check_access(&state, &token, model, &ctx, Some("聊天"), Some(&channel)).await {
                Ok(v) => v,
                Err(e) => {
                    last_err = e;
                    break; // 余额不足等用户端权限错误，直接跳出，不用重试其他渠道
                }
            };

            // 模型表别名映射：渠道无映射时回落到 db_model.model_id_alias
            let (resolved_model, mapping_source) = router::resolve_model(&channel, model, db_model.as_ref());

            // 4. 解析转发规则（复用 db_model 避免重查 models 表）
            let resolved = match forward::resolve_forward_rule(&state, model, "聊天", raw_path, Some(&channel), db_model.as_ref()).await {
                Some(r) => r,
                None => {
                    if forward::model_has_forward_rules(&state, model).await {
                        last_err = AppError::BadRequest(format!("模型 '{}' 不支持当前接口，请检查模型对应的转发规则", model));
                        break;
                    }
                    forward::infer_forward_from_base_url(&channel.base_url, "聊天")
                }
            };

            let target_type = resolved.target_type.clone();
            // 转发规则路径含 streamGenerateContent 时上游始终返回 SSE，强制走流式路径
            let is_stream = is_stream || resolved.upstream_path.contains("streamGenerateContent");
            let db_rule = proxy::get_model_billing_rule(&state, model, Some(&channel), db_model.as_ref()).await;
            let upstream_body: serde_json::Value = forward::transform_request_body(&resolved, &resolved_model, &body, "聊天", db_rule.as_ref(), Some(&state.http_client)).await;
            let url = forward::build_upstream_url(&channel.base_url, &resolved, &resolved_model, &channel.api_key);
            let auth_headers = forward::build_auth_headers(&resolved, &channel.api_key);

            tracing::info!("[Chat] retry_idx={}, model={}, target_type={}, url={}, channel_id={}", retry_idx, model, target_type, url, channel.id);

            let resolved_upstream_path = resolved.upstream_path.replace("${model}", &resolved_model);
            let ep = format!("{}|{}", raw_path, resolved_upstream_path);
            // 【一条日志原则】仅首次到达请求阶段时创建预记录，后续重试复用同一条日志
            if pending_log_id.is_none() {
                pending_log_id = proxy::record_pending_log(
                    &state, &token.user_id, channel.id, token.id, model, &ep,
                    if is_stream { 1 } else { 0 },
                    Some(&request_content_str),
                    Some(&url), Some(&channel),
                    None, None,
                    Some("聊天"),
                    db_model.as_ref(),
                    Some(&resolved.eid),
                    None,
                ).await;
            }

            if is_stream {
                let mut stream_body = upstream_body.clone();
                // Gemini 流式通过 URL 切换为 :streamGenerateContent?alt=sse 实现，请求体不接受 stream 字段
                if target_type != "gemini" {
                    stream_body["stream"] = serde_json::json!(true);
                }
                let mut final_upstream_path = resolved_upstream_path.clone();
                let stream_url = if target_type == "gemini" {
                    final_upstream_path = final_upstream_path.replace(":generateContent", ":streamGenerateContent") + "?alt=sse";
                    let mut final_url = super::url_utils::join_url(&channel.base_url, &final_upstream_path);
                    if resolved.auth_type == "query_key" {
                        if final_url.contains('?') { final_url = format!("{}&key={}", final_url, channel.api_key); } else { final_url = format!("{}?key={}", final_url, channel.api_key); }
                    }
                    final_url
                } else {
                    url.clone()
                };

                let mut stream_builder = state.http_client.post(&stream_url).header("Content-Type", "application/json");
                for (k, v) in &auth_headers {
                    stream_builder = stream_builder.header(k, v);
                }
                
                let resp = match stream_builder.json(&stream_body).send().await {
                    Ok(r) => r,
                    Err(e) => {
                        let err_msg = e.to_string();
                        let latency_ms = start_time.elapsed().as_millis() as u32;
                        
                        let aid = channel.group_aid.clone().unwrap_or_default();
                        if !aid.is_empty() {
                            failed_channel_aids.push(aid.clone());
                            if is_ha_plugin_enabled {
                                let cooldown_secs = state.ha_cooldown_network.load(std::sync::atomic::Ordering::Relaxed);
                                let blocked_until = std::time::Instant::now() + std::time::Duration::from_secs(cooldown_secs as u64);
                                state.failed_channels.insert(aid, blocked_until);
                            }
                        }
                        
                        channel_retry_count += 1;
                        let is_last_try = channel_retry_count >= max_channel_retries;

                        spawn_failed_billing(
                            &state, &token, channel.id, model, &ep, 502, &err_msg,
                            latency_ms, 1, &request_content_str, None, &upstream_body.to_string(),
                            ep_tag.clone(), if is_last_try { pending_log_id } else { None }, db_model.clone()
                        );
                        last_err = AppError::UpstreamError(proxy::sanitize_error_message(&err_msg));
                        tracing::warn!("[SmartRouter] stream req failed: {}, trying next...", err_msg);
                        if is_last_try { break; }
                        continue;
                    }
                };

                if !resp.status().is_success() {
                    let status = resp.status().as_u16();
                    // 允许客户端/用户错误（如 400, 422 敏感词）也进行重试切换以防误伤，但不做全局熔断
                    let should_retry = status >= 500 || status == 429 || status == 401 || status == 402 || status == 403 || status == 400 || status == 422;
                    
                    let err = resp.text().await.unwrap_or_default();
                    let display_err = if err.trim().is_empty() { format!("Upstream HTTP error {}", status) } else { err.clone() };
                    let latency_ms = start_time.elapsed().as_millis() as u32;
                    
                    let aid = channel.group_aid.clone().unwrap_or_default();
                    if !aid.is_empty() {
                        failed_channel_aids.push(aid.clone());
                        if is_ha_plugin_enabled {
                            // 只有系统级故障才拉黑该渠道
                            let is_system_err = status >= 500 || status == 429 || status == 401 || status == 402;
                            if is_system_err {
                                let cooldown_secs = match status {
                                    429 => state.ha_cooldown_429.load(std::sync::atomic::Ordering::Relaxed),
                                    401 | 402 => state.ha_cooldown_auth.load(std::sync::atomic::Ordering::Relaxed),
                                    _ => state.ha_cooldown_network.load(std::sync::atomic::Ordering::Relaxed),
                                };
                                let blocked_until = std::time::Instant::now() + std::time::Duration::from_secs(cooldown_secs as u64);
                                state.failed_channels.insert(aid, blocked_until);
                            }
                        }
                    }
                    
                    channel_retry_count += 1;
                    let is_last_try = !should_retry || channel_retry_count >= max_channel_retries;

                    spawn_failed_billing(
                        &state, &token, channel.id, model, &ep, status, &display_err,
                        latency_ms, 1, &request_content_str, Some(err), &upstream_body.to_string(),
                        ep_tag.clone(), if is_last_try { pending_log_id } else { None }, db_model.clone()
                    );
                    last_err = AppError::UpstreamError(display_err.clone());
                    tracing::warn!("[SmartRouter] stream status {}: {}, trying next...", status, display_err);
                    if is_last_try {
                        if !should_retry { return Err(last_err); }
                        break;
                    }
                    continue;
                }

                let prompt_tokens = estimate_prompt_tokens(&body);
                let pre_deduct_gift = pre_deduct_or_intercept(
                    &state, &token, channel.id, model, pre_deduction, &ep,
                    start_time, 1, &request_content_str, &upstream_body.to_string(),
                    ep_tag.clone(), pending_log_id, db_model.as_ref(), &ctx.role
                ).await?;

                let s_ep = ep_tag.as_ref().map(|_| original_model.to_string());
                return Ok(stream::handle_chat_stream(state.clone(), token, channel, model.to_string(), resp, ctx.discount, ctx.model_discounts.clone(), prompt_tokens, request_content_str, start_time, target_type, final_upstream_path, Some(upstream_body.to_string()), pre_deduction, pre_deduct_gift, raw_path.to_string(), s_ep, pending_log_id, db_model, db_rule).await.into_response());

            } else {
                let mut builder = state.http_client.post(&url).header("Content-Type", "application/json");
                for (k, v) in &auth_headers {
                    builder = builder.header(k, v);
                }
                let resp = match builder.json(&upstream_body).send().await {
                    Ok(r) => r,
                    Err(e) => {
                        let err_msg = e.to_string();
                        let latency_ms = start_time.elapsed().as_millis() as u32;
                        
                        let aid = channel.group_aid.clone().unwrap_or_default();
                        if !aid.is_empty() {
                            failed_channel_aids.push(aid.clone());
                            if is_ha_plugin_enabled {
                                let cooldown_secs = state.ha_cooldown_network.load(std::sync::atomic::Ordering::Relaxed);
                                let blocked_until = std::time::Instant::now() + std::time::Duration::from_secs(cooldown_secs as u64);
                                state.failed_channels.insert(aid, blocked_until);
                            }
                        }

                        channel_retry_count += 1;
                        let is_last_try = channel_retry_count >= max_channel_retries;

                        spawn_failed_billing(
                            &state, &token, channel.id, model, &ep, 502, &err_msg,
                            latency_ms, 0, &request_content_str, None, &upstream_body.to_string(),
                            ep_tag.clone(), if is_last_try { pending_log_id } else { None }, db_model.clone()
                        );
                        last_err = AppError::UpstreamError(proxy::sanitize_error_message(&err_msg));
                        tracing::warn!("[SmartRouter] req failed: {}, trying next...", err_msg);
                        if is_last_try { break; }
                        continue;
                    }
                };
                
                let status = resp.status().as_u16();
                if !resp.status().is_success() {
                    let should_retry = status >= 500 || status == 429 || status == 401 || status == 402 || status == 403 || status == 400 || status == 422;
                    
                    let err = resp.text().await.unwrap_or_default();
                    let display_err = if err.trim().is_empty() { format!("Upstream HTTP error {}", status) } else { err.clone() };
                    let latency_ms = start_time.elapsed().as_millis() as u32;
                    
                    let aid = channel.group_aid.clone().unwrap_or_default();
                    if !aid.is_empty() {
                        failed_channel_aids.push(aid.clone());
                        if is_ha_plugin_enabled {
                            let is_system_err = status >= 500 || status == 429 || status == 401 || status == 402;
                            if is_system_err {
                                let cooldown_secs = match status {
                                    429 => state.ha_cooldown_429.load(std::sync::atomic::Ordering::Relaxed),
                                    401 | 402 => state.ha_cooldown_auth.load(std::sync::atomic::Ordering::Relaxed),
                                    _ => state.ha_cooldown_network.load(std::sync::atomic::Ordering::Relaxed),
                                };
                                let blocked_until = std::time::Instant::now() + std::time::Duration::from_secs(cooldown_secs as u64);
                                state.failed_channels.insert(aid, blocked_until);
                            }
                        }
                    }

                    channel_retry_count += 1;
                    let is_last_try = !should_retry || channel_retry_count >= max_channel_retries;

                    spawn_failed_billing(
                        &state, &token, channel.id, model, &ep, status, &display_err,
                        latency_ms, 0, &request_content_str, Some(err), &upstream_body.to_string(),
                        ep_tag.clone(), if is_last_try { pending_log_id } else { None }, db_model.clone()
                    );
                    last_err = AppError::UpstreamError(display_err.clone());
                    tracing::warn!("[SmartRouter] status {}: {}, trying next...", status, display_err);
                    if is_last_try {
                        if !should_retry { return Err(last_err); }
                        break;
                    }
                    continue;
                }

                let content_type = resp.headers().get("content-type").and_then(|v| v.to_str().ok()).unwrap_or("");
                if content_type.contains("text/event-stream") || content_type.contains("application/x-ndjson") {
                    let prompt_tokens = estimate_prompt_tokens(&body);
                    let final_upstream_path = resolved_upstream_path.clone();
                    let pre_deduct_gift = pre_deduct_or_intercept(
                        &state, &token, channel.id, model, pre_deduction, &ep,
                        start_time, 1, &request_content_str, &upstream_body.to_string(),
                        ep_tag.clone(), pending_log_id, db_model.as_ref(), &ctx.role
                    ).await?;
                    let s_ep = ep_tag.as_ref().map(|_| original_model.to_string());
                    return Ok(stream::handle_chat_stream(state.clone(), token, channel, model.to_string(), resp, ctx.discount, ctx.model_discounts.clone(), prompt_tokens, request_content_str, start_time, target_type, final_upstream_path, Some(upstream_body.to_string()), pre_deduction, pre_deduct_gift, raw_path.to_string(), s_ep, pending_log_id, db_model, db_rule).await.into_response());
                }

                let data = resp.bytes().await.unwrap_or_default();
                let response_content_str = String::from_utf8_lossy(&data).to_string();

                let usage_tokens = usage_extractor::parse_usage(&response_content_str);
                let prompt_tokens = usage_tokens.prompt;
                let completion_tokens = usage_tokens.completion;
                let cached_tokens = usage_tokens.cached;

                let mut features = usage_extractor::extract_request_features(&body);
                features.cache_creation = if usage_tokens.cache_creation > 0 { Some(usage_tokens.cache_creation) } else { None };

                let pre_deduct_gift = pre_deduct_or_intercept(
                    &state, &token, channel.id, model, pre_deduction, &ep,
                    start_time, 0, &request_content_str, &upstream_body.to_string(),
                    ep_tag.clone(), pending_log_id, db_model.as_ref(), &ctx.role
                ).await?;

                // 折扣策略: MIN(用户模型折扣, 全站折扣, 等级折扣), 受折扣限价约束
                let umd = db_model.as_ref().and_then(|m| proxy::parse_user_model_discount(&ctx.model_discounts, &m.mid));
                let (final_discount, discount_source) = proxy::resolve_discount(db_model.as_ref(), ctx.discount, umd);

                let applied_discount = if is_ha_plugin_enabled {
                    final_discount * channel.rate
                } else {
                    final_discount
                };

                let (quota_used, mut detail) = super::compute_cost(db_model.as_ref(), db_rule.as_ref(), &usage_tokens, applied_discount, &features);
                detail.push_str(&format!(" | {}", discount_source));
                if is_ha_plugin_enabled && channel.rate != 1.0 {
                    detail.push_str(&format!(" | 渠道倍率: {}x", channel.rate));
                }
                if let Some(src) = mapping_source { detail.push_str(&format!(" | {}: {} ➞ {}", src, model, resolved_model)); }
                if let Some(ref et) = ep_tag { detail.push_str(&format!(" | {}", et)); }
                
                let latency_ms = start_time.elapsed().as_millis() as u32;

                // 【连接保护】计费放入独立 task，客户端断开后仍完成
                let (s, t, ch_id, m, e, rc, rsc, uc) = (state.clone(), token.clone(), channel.id, model.to_string(), ep.clone(), request_content_str, response_content_str.clone(), upstream_body.to_string());
                let dm = db_model.clone();
                tokio::spawn(async move { proxy::record_and_bill_inner(&s, &t, ch_id, &m, prompt_tokens, completion_tokens, cached_tokens, quota_used, pre_deduction, pre_deduct_gift, 200, &e, None, latency_ms, 0, Some(rc), Some(rsc), Some(uc), Some(detail), Some("聊天"), pending_log_id, None, None, dm.as_ref()).await; });

                let final_body = if raw_path.ends_with("/messages") { response_content_str.clone() } else { transform_chat_response(&response_content_str, &target_type, model) };

                return Ok(Response::builder().header("Content-Type", "application/json").body(axum::body::Body::from(final_body)).unwrap());
            }
        }
    }

    Err(last_err)
}

// ── Responses API (/v1/responses, /api/v3/responses) ─────────
// 直接透传请求体到上游，不做格式转换，复用聊天类别的计费和日志体系

pub async fn responses_create(
    State(state): State<Arc<AppState>>,
    Extension(token): Extension<ApiToken>,
    OriginalUri(uri): OriginalUri,
    Json(body): Json<serde_json::Value>,
) -> AppResult<Response> {
    let start_time = std::time::Instant::now();
    let raw_path = uri.path();
    let request_content_str = serde_json::to_string(&body).unwrap_or_default();
    let model = body["model"].as_str()
        .ok_or_else(|| AppError::BadRequest(
            "Missing required parameter: model".to_string()
        ))?;
    let is_stream = body["stream"].as_bool().unwrap_or(false);

    let ctx = proxy::get_user_context(&state, &token.user_id).await?;
    proxy::check_model_permission(&state, &token, model, "/v1/responses").await?;
    let channel = proxy::select_channel_for_model(&state, &token, model, &ctx.user_group, &ctx.level_id, raw_path).await?;
    let (pre_deduction, db_model) = proxy::check_access(&state, &token, model, &ctx, Some("聊天"), Some(&channel)).await?;
    let (resolved_model, mapping_source) = router::resolve_model(&channel, model, db_model.as_ref());

    // 解析转发规则：复用聊天类别，兜底使用 /v1/responses 路径
    let resolved = match forward::resolve_forward_rule(&state, model, "聊天", raw_path, Some(&channel), db_model.as_ref()).await {
        Some(r) => r,
        None => {
            let url_lower = channel.base_url.to_lowercase();
            if url_lower.contains("volces.com") || url_lower.contains("volcengine") {
                forward::make_forward("volcengine_chat", "/api/v3/responses", "bearer")
            } else {
                forward::default_openai_forward("/v1/responses")
            }
        }
    };

    let db_rule = proxy::get_model_billing_rule(&state, model, Some(&channel), db_model.as_ref()).await;

    // 构建上游请求体：仅替换 model 字段，其余透传
    let mut upstream_body = body.clone();
    upstream_body["model"] = serde_json::json!(resolved_model);

    let url = forward::build_upstream_url(&channel.base_url, &resolved, &resolved_model, &channel.api_key);
    let auth_headers = forward::build_auth_headers(&resolved, &channel.api_key);

    tracing::info!("[Responses] model={}, resolved={}, url={}", model, resolved_model, url);

    let resolved_upstream_path = resolved.upstream_path.replace("${model}", &resolved_model);
    let ep = format!("{}|{}", raw_path, resolved_upstream_path);
    let pending_log_id = proxy::record_pending_log(
        &state, &token.user_id, channel.id, token.id, model, &ep,
        if is_stream { 1 } else { 0 },
        Some(&request_content_str),
        Some(&url), Some(&channel),
        None, None,
        Some("聊天"),
        db_model.as_ref(),
        Some(&resolved.eid),
        None,
    ).await;

    // 【连接保护】将请求发送+响应处理+预扣费+计费放入独立 task，客户端断开后仍能完成
    let model = model.to_string();
    let mapping_source = mapping_source.map(|s| s.to_string());
    let features = usage_extractor::extract_request_features(&body);
    let upstream_body_str = upstream_body.to_string();
    let role = ctx.role.clone();
    let discount = ctx.discount;
    let model_discounts = ctx.model_discounts.clone();
    let raw_path = raw_path.to_string();
    let (result_tx, result_rx) = tokio::sync::oneshot::channel::<Result<Response, AppError>>();

    tokio::spawn(async move {
        let result: Result<Response, AppError> = async {
            // 统一构建请求（流式/非流式共用 builder，仅请求体不同）
            let mut req_body = upstream_body;
            if is_stream { req_body["stream"] = serde_json::json!(true); }

            let mut builder = state.http_client.post(&url).header("Content-Type", "application/json");
            for (k, v) in &auth_headers {
                builder = builder.header(k, v);
            }

            let resp = match builder.json(&req_body).send().await {
                Ok(r) => r,
                Err(e) => {
                    let err_msg = e.to_string();
                    let latency_ms = start_time.elapsed().as_millis() as u32;
                    proxy::record_and_bill_inner(
                        &state, &token, channel.id, &model, 0, 0, 0, 0.0, 0.0, 0.0, 502,
                        &ep, Some(&err_msg), latency_ms, if is_stream { 1 } else { 0 },
                        Some(request_content_str.clone()), Some(err_msg.clone()), Some(upstream_body_str.clone()),
                        None, Some("聊天"), pending_log_id, None, None, db_model.as_ref()
                    ).await;
                    return Err(AppError::UpstreamError(proxy::sanitize_error_message(&err_msg)));
                }
            };

            if !resp.status().is_success() {
                let status = resp.status().as_u16();
                let err = resp.text().await.unwrap_or_default();
                let display_err = if err.trim().is_empty() { format!("Upstream HTTP error {}", status) } else { err.clone() };
                let latency_ms = start_time.elapsed().as_millis() as u32;
                proxy::record_and_bill_inner(
                    &state, &token, channel.id, &model, 0, 0, 0, 0.0, 0.0, 0.0, status,
                    &ep, Some(&display_err), latency_ms, if is_stream { 1 } else { 0 },
                    Some(request_content_str.clone()), Some(err), Some(upstream_body_str.clone()),
                    None, Some("聊天"), pending_log_id, None, None, db_model.as_ref()
                ).await;
                return Err(AppError::UpstreamError(proxy::sanitize_error_message(&display_err)));
            }

            // 判断是否为流式响应（请求流式 或 上游实际返回 SSE）
            let content_type = resp.headers().get("content-type").and_then(|v| v.to_str().ok()).unwrap_or("");
            let actual_stream = is_stream || content_type.contains("text/event-stream");

            if actual_stream {
                // 流式路径：预扣费后交给 handle_responses_stream（内部有独立 worker 处理流+计费）
                let pre_deduct_gift = pre_deduct_or_intercept(
                    &state, &token, channel.id, &model, pre_deduction, &ep,
                    start_time, 1, &request_content_str, &upstream_body_str,
                    None, pending_log_id, db_model.as_ref(), &role
                ).await?;

                Ok(stream::handle_responses_stream(
                    state.clone(), token, channel, model.clone(), resp, discount, model_discounts.clone(),
                    request_content_str, start_time, resolved_upstream_path,
                    Some(upstream_body_str), pre_deduction, pre_deduct_gift, raw_path,
                    pending_log_id, db_model, db_rule,
                ).await.into_response())
            } else {
                // 非流式：直接透传响应，提取 usage 计费
                let data = resp.bytes().await.unwrap_or_default();
                let response_content_str = String::from_utf8_lossy(&data).to_string();

                let usage_tokens = usage_extractor::parse_usage(&response_content_str);
                let prompt_tokens = usage_tokens.prompt;
                let completion_tokens = usage_tokens.completion;
                let cached_tokens = usage_tokens.cached;

                let pre_deduct_gift = pre_deduct_or_intercept(
                    &state, &token, channel.id, &model, pre_deduction, &ep,
                    start_time, 0, &request_content_str, &upstream_body_str,
                    None, pending_log_id, db_model.as_ref(), &role
                ).await?;

                let umd = db_model.as_ref().and_then(|m| proxy::parse_user_model_discount(&model_discounts, &m.mid));
                let (final_discount, discount_source) = proxy::resolve_discount(db_model.as_ref(), discount, umd);

                let is_ha_plugin_enabled = crate::api::plugins::is_plugin_enabled(&state, "high_availability_channel").await;
                let applied_discount = if is_ha_plugin_enabled {
                    final_discount * channel.rate
                } else {
                    final_discount
                };

                let (quota_used, mut detail) = crate::relay::compute_cost(db_model.as_ref(), db_rule.as_ref(), &usage_tokens, applied_discount, &features);
                detail.push_str(&format!(" | {}", discount_source));
                if is_ha_plugin_enabled && channel.rate != 1.0 {
                    detail.push_str(&format!(" | 渠道倍率: {}x", channel.rate));
                }
                if let Some(ref src) = mapping_source { detail.push_str(&format!(" | {}: {} ➞ {}", src, model, resolved_model)); }

                let latency_ms = start_time.elapsed().as_millis() as u32;

                proxy::record_and_bill_inner(
                    &state, &token, channel.id, &model, prompt_tokens, completion_tokens, cached_tokens, quota_used, pre_deduction,
                    pre_deduct_gift, 200, &ep, None, latency_ms, 0,
                    Some(request_content_str), Some(response_content_str.clone()), Some(upstream_body_str),
                    Some(detail), Some("聊天"), pending_log_id, None, None, db_model.as_ref()
                ).await;

                // Responses API 直接透传上游响应，不做格式转换
                Ok(Response::builder().header("Content-Type", "application/json").body(axum::body::Body::from(response_content_str)).unwrap())
            }
        }.await;
        let _ = result_tx.send(result);
    });

    match result_rx.await {
        Ok(result) => result,
        Err(_) => Err(AppError::Internal("请求处理任务异常终止".into())),
    }
}

// ── 公共辅助函数 ──────────────────────────────────────────────

/// 粗略估算 prompt tokens（兼容 Chat 的 messages 和 Responses 的 input）
pub fn estimate_prompt_tokens(body: &serde_json::Value) -> i32 {
    let mut total_chars = 0;
    // Chat Completions: messages 数组
    if let Some(messages) = body.get("messages").and_then(|m| m.as_array()) {
        for msg in messages {
            if let Some(s) = msg.get("content").and_then(|c| c.as_str()) {
                total_chars += s.len();
            }
        }
    }
    // Responses API: input 字段（string 或 array）
    if let Some(input) = body.get("input") {
        if let Some(s) = input.as_str() {
            total_chars += s.len();
        } else if let Some(arr) = input.as_array() {
            for item in arr {
                if let Some(s) = item.get("text").and_then(|t| t.as_str()) {
                    total_chars += s.len();
                } else if let Some(s) = item.get("content").and_then(|c| c.as_str()) {
                    total_chars += s.len();
                }
            }
        }
    }
    // instructions 字段
    if let Some(s) = body.get("instructions").and_then(|i| i.as_str()) {
        total_chars += s.len();
    }
    (total_chars as f64 / 4.0).ceil() as i32
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
                let usage_tokens = usage_extractor::parse_usage(response);
                let mut usage = serde_json::json!({
                    "prompt_tokens": usage_tokens.prompt,
                    "completion_tokens": usage_tokens.completion,
                    "total_tokens": usage_tokens.total,
                    "cache_creation": v.get("usage").and_then(|c| c.get("cache_creation"))
                });
                // 映射 Anthropic 缓存字段到 OpenAI prompt_tokens_details
                if usage_tokens.cached > 0 || usage_tokens.cache_creation > 0 {
                    usage["prompt_tokens_details"] = serde_json::json!({
                        "cached_tokens": usage_tokens.cached,
                        "cache_creation_tokens": usage_tokens.cache_creation
                    });
                }
                return serde_json::to_string(&serde_json::json!({
                    "id": v.get("id").and_then(|i| i.as_str()).unwrap_or(""),
                    "object": "chat.completion",
                    "created": chrono::Utc::now().timestamp(),
                    "model": model,
                    "choices": [{"index": 0, "message": {"role": "assistant", "content": content}, "finish_reason": "stop"}],
                    "usage": usage
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
                let mut usage = serde_json::json!({
                    "prompt_tokens": usage_tokens.prompt,
                    "completion_tokens": usage_tokens.completion,
                    "total_tokens": usage_tokens.total,
                });
                if usage_tokens.cached > 0 {
                    usage["prompt_tokens_details"] = serde_json::json!({
                        "cached_tokens": usage_tokens.cached
                    });
                }
                return serde_json::to_string(&serde_json::json!({
                    "id": uuid::Uuid::new_v4().to_string(),
                    "object": "chat.completion",
                    "created": chrono::Utc::now().timestamp(),
                    "model": model,
                    "choices": [{"index": 0, "message": {"role": "assistant", "content": content}, "finish_reason": finish}],
                    "usage": usage
                })).unwrap_or_else(|_| response.to_string());
            }
            response.to_string()
        }
        _ => {
            // 兜底：检测上游是否返回了 Anthropic 原生格式（type:"message"），自动转为 OpenAI 格式
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(response) {
                if v.get("type").and_then(|t| t.as_str()) == Some("message") {
                    return transform_chat_response(response, "anthropic", model);
                }
            }
            response.to_string()
        }
    }
}

// ── 智能路由 EP 解析 ──────────────────────────────────────────

/// 根据 ep-tokensbyteXXXX 推理节点 ID 解析出实际要调用的模型 model_id。
/// 基于路由组的策略(price/speed/stability)选择合适的模型。
#[cfg(feature = "plugin_router_flow")]
async fn resolve_router_flow_endpoint(
    state: &Arc<AppState>,
    user_id: &str,
    endpoint_id: &str,
) -> AppResult<(Vec<String>, String)> {
    // 1. 查找路由组
    let group: crate::api::router_flow::RouterFlowGroup = sqlx::query_as(
        &state.db.format_query(
            "SELECT * FROM router_flow_groups WHERE endpoint_id = ? AND is_active = 1"
        )
    )
    .bind(endpoint_id)
    .fetch_optional(&state.db.pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("推理节点 {} 不存在或已停用", endpoint_id)))?;

    // 2. 验证所有者
    if group.user_id != user_id {
        return Err(AppError::Forbidden(format!("推理节点 {} 不属于当前用户", endpoint_id)));
    }

    // 3. 解析绑定的模型 mid 列表
    let mids: Vec<String> = serde_json::from_str(&group.model_ids).unwrap_or_default();
    if mids.is_empty() {
        return Err(AppError::BadRequest("路由组没有绑定任何模型".to_string()));
    }

    // 4. 批量查询绑定模型的 model_id（单条 SQL 替代 N+1 逐条查询）
    let placeholders: Vec<String> = (1..=mids.len()).map(|i| format!("${}", i)).collect();
    let sql = format!(
        "SELECT mid, model_id, billing_rule_id FROM models WHERE mid IN ({}) AND is_active = 1",
        placeholders.join(", ")
    );
    let mut query = sqlx::query_as::<_, (String, String, Option<i64>)>(&sql);
    for mid in &mids {
        query = query.bind(mid);
    }
    let rows: Vec<(String, String, Option<i64>)> = query.fetch_all(&state.db.pool).await.unwrap_or_default();
    // 按 mids 原始顺序排列候选模型（保持路由组配置顺序）
    let candidates: Vec<(String, String, Option<i64>)> = mids.iter()
        .filter_map(|mid| rows.iter().find(|r| r.0 == *mid).cloned())
        .collect();

    if candidates.is_empty() {
        return Err(AppError::NotFound("路由组中没有可用的活跃模型".to_string()));
    }

    // 5. 根据策略选择模型列表
    let selected_model_ids = match group.route_rule.as_str() {
        "price" => {
            // 价格优先：按次计费优先于按时长优先于按Token计费，同类型中选最便宜的，如果价格相同则随机负载均衡
            #[derive(PartialEq, Clone)]
            enum BType { Requests, Duration, Tokens }
            let type_score = |t: &BType| -> u8 { match t { BType::Requests => 1, BType::Duration => 2, BType::Tokens => 3 } };

            // 批量查询所有关联的计费规则（单条 SQL 替代 N+1 逐条查询）
            let rule_ids: Vec<i64> = candidates.iter().filter_map(|(_, _, br_id)| *br_id).collect();
            let rules: Vec<crate::models::BillingRule> = if !rule_ids.is_empty() {
                let ph: Vec<String> = (1..=rule_ids.len()).map(|i| format!("${}", i)).collect();
                let sql = format!("SELECT * FROM billing_rules WHERE id IN ({})", ph.join(", "));
                let mut q = sqlx::query_as::<_, crate::models::BillingRule>(&sql);
                for id in &rule_ids { q = q.bind(id); }
                q.fetch_all(&state.db.pool).await.unwrap_or_default()
            } else { vec![] };

            let mut items: Vec<(String, BType, f64)> = Vec::new();
            for (_mid, model_id, br_id) in &candidates {
                let rule = rules.iter().find(|r| Some(r.id) == *br_id);
                let (b_type, rate) = match rule {
                    Some(r) => match r.billing_type.as_str() {
                        "requests" => (BType::Requests, r.fixed_rate),
                        "duration" => (BType::Duration, r.duration_rate),
                        _ => (BType::Tokens, r.prompt_rate),
                    },
                    None => (BType::Tokens, 0.0001), // 默认低费率兜底
                };
                items.push((model_id.clone(), b_type, rate));
            }
            
            // 按 billing_type 优先级（按次 > 时长 > Token）升序，同类型按费率升序排序
            items.sort_by(|a, b| {
                let type_ord = type_score(&a.1).cmp(&type_score(&b.1));
                if type_ord == std::cmp::Ordering::Equal {
                    a.2.partial_cmp(&b.2).unwrap_or(std::cmp::Ordering::Equal)
                } else {
                    type_ord
                }
            });
            items.into_iter().map(|i| i.0).collect()
        }
        "speed" => {
            // 速度优先：单条聚合查询获取所有候选模型的平均延迟
            let model_ids: Vec<&str> = candidates.iter().map(|(_, mid, _)| mid.as_str()).collect();
            let ph: Vec<String> = (1..=model_ids.len()).map(|i| format!("${}", i)).collect();
            let sql = format!(
                "SELECT model, CAST(AVG(latency_ms) AS BIGINT) FROM logs WHERE model IN ({}) AND status_code = 200 AND created_at::timestamptz > CURRENT_TIMESTAMP - INTERVAL '1 hour' GROUP BY model",
                ph.join(", ")
            );
            let mut q = sqlx::query_as::<_, (String, i64)>(&sql);
            for mid in &model_ids { q = q.bind(mid); }
            let latency_rows: Vec<(String, i64)> = q.fetch_all(&state.db.pool).await.unwrap_or_default();
            let latencies: std::collections::HashMap<String, i64> = latency_rows.into_iter().collect();
            let mut items = candidates.clone();
            items.sort_by_key(|i| *latencies.get(&i.1).unwrap_or(&i64::MAX));
            items.into_iter().map(|i| i.1).collect()
        }
        "stability" => {
            // 稳定优先：单条聚合查询获取所有候选模型的错误率（最近1小时）
            let model_ids: Vec<&str> = candidates.iter().map(|(_, mid, _)| mid.as_str()).collect();
            let ph: Vec<String> = (1..=model_ids.len()).map(|i| format!("${}", i)).collect();
            let sql = format!(
                "SELECT model, COUNT(*), SUM(CASE WHEN status_code != 200 THEN 1 ELSE 0 END) FROM logs WHERE model IN ({}) AND created_at::timestamptz > CURRENT_TIMESTAMP - INTERVAL '1 hour' GROUP BY model",
                ph.join(", ")
            );
            let mut q = sqlx::query_as::<_, (String, i64, i64)>(&sql);
            for mid in &model_ids { q = q.bind(mid); }
            let stat_rows: Vec<(String, i64, i64)> = q.fetch_all(&state.db.pool).await.unwrap_or_default();
            let error_rates: std::collections::HashMap<String, f64> = stat_rows.into_iter()
                .map(|(m, total, errors)| (m, if total > 0 { errors as f64 / total as f64 } else { f64::MAX }))
                .collect();
            let mut items = candidates.clone();
            items.sort_by(|a, b| {
                let (ra, rb) = (error_rates.get(&a.1).unwrap_or(&f64::MAX), error_rates.get(&b.1).unwrap_or(&f64::MAX));
                ra.partial_cmp(rb).unwrap_or(std::cmp::Ordering::Equal)
            });
            items.into_iter().map(|i| i.1).collect()
        }
        _ => {
            // 未知策略，打乱返回
            use rand::seq::SliceRandom;
            let mut items = candidates.clone();
            items.shuffle(&mut rand::thread_rng());
            items.into_iter().map(|i| i.1).collect()
        }
    };

    Ok((selected_model_ids, group.name.clone()))
}

#[cfg(not(feature = "plugin_router_flow"))]
async fn resolve_router_flow_endpoint(
    _state: &Arc<AppState>,
    _user_id: &str,
    endpoint_id: &str,
) -> AppResult<(Vec<String>, String)> {
    Err(AppError::BadRequest(format!("智能路由插件未装载，无法解析推理节点 {}", endpoint_id)))
}

// ── 辅助提炼函数（精简冗余、解耦核心流程） ──────────────────────────

/// 预扣费并进行异常拦截处理（失败时安全记账并返回报错）
async fn pre_deduct_or_intercept(
    state: &Arc<AppState>,
    token: &ApiToken,
    channel_id: i64,
    model: &str,
    pre_deduction: f64,
    ep: &str,
    start_time: std::time::Instant,
    is_stream: i32,
    request_content_str: &str,
    upstream_body_str: &str,
    ep_tag: Option<String>,
    pending_log_id: Option<i64>,
    db_model: Option<&crate::models::Model>,
    role: &str,
) -> AppResult<f64> {
    if pre_deduction <= 0.0 || role == "admin" {
        return Ok(0.0);
    }
    match proxy::pre_deduct(state, &token.user_id, pre_deduction).await {
        Ok(split) => Ok(split.gift),
        Err(e) => {
            let err_msg = match e {
                sqlx::Error::RowNotFound => "余额不足".to_string(),
                _ => format!("预扣费失败: {:?}", e),
            };
            tracing::error!("Pre deduction failed for {}: {:?}", token.user_id, e);
            let latency_ms = start_time.elapsed().as_millis() as u32;
            proxy::record_and_bill_inner(
                state, token, channel_id, model, 0, 0, 0, 0.0, 0.0, 0.0, 403,
                ep, Some(&err_msg), latency_ms, is_stream,
                Some(request_content_str.to_string()), Some(err_msg.clone()), Some(upstream_body_str.to_string()),
                ep_tag, Some("聊天"), pending_log_id, None, None, db_model
            ).await;
            Err(if matches!(e, sqlx::Error::RowNotFound) {
                AppError::Forbidden("余额不足".to_string())
            } else {
                AppError::Internal(err_msg)
            })
        }
    }
}

/// 异步执行上游错误或非成功响应的失败记账
fn spawn_failed_billing(
    state: &Arc<AppState>,
    token: &ApiToken,
    channel_id: i64,
    model: &str,
    ep: &str,
    status_code: u16,
    error_message: &str,
    latency_ms: u32,
    is_stream: i32,
    request_content_str: &str,
    response_content_str: Option<String>,
    upstream_body_str: &str,
    ep_tag: Option<String>,
    pending_log_id: Option<i64>,
    db_model: Option<crate::models::Model>,
) {
    let s = state.clone();
    let t = token.clone();
    let ch_id = channel_id;
    let m = model.to_string();
    let e = ep.to_string();
    let em = error_message.to_string();
    let rc = request_content_str.to_string();
    let uc = upstream_body_str.to_string();
    let bd = ep_tag;
    let pl_id = pending_log_id;
    let dm = db_model;
    tokio::spawn(async move {
        proxy::record_and_bill_inner(
            &s, &t, ch_id, &m, 0, 0, 0, 0.0, 0.0, 0.0, status_code,
            &e, Some(&em), latency_ms, is_stream, Some(rc.clone()), response_content_str, Some(uc),
            bd, Some("聊天"), pl_id, None, None, dm.as_ref()
        ).await;
    });
}
