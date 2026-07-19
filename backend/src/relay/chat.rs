// ── 聊天 & Responses API 处理 ──────────────────────────────────
// 统一管理 Chat Completions 和 Responses API 的请求处理逻辑

use super::{forward, proxy, router, stream, usage_extractor};
use crate::error::{AppError, AppResult};
use crate::models::ApiToken;
use crate::AppState;
use axum::{
    extract::{Extension, OriginalUri, State},
    response::{IntoResponse, Response},
    Json,
};
use std::sync::Arc;

// ── Chat Completions (/v1/chat/completions) ──────────────────

pub async fn chat_completions(
    State(state): State<Arc<AppState>>,
    Extension(token): Extension<ApiToken>,
    OriginalUri(uri): OriginalUri,
    Json(body): Json<serde_json::Value>,
) -> AppResult<Response> {
    let raw_path = uri.path();
    let request_content_str = serde_json::to_string(&body).unwrap_or_default();
    let model = body["model"]
        .as_str()
        .ok_or_else(|| AppError::BadRequest("Missing required parameter: model".to_string()))?;
    let is_stream = body["stream"].as_bool().unwrap_or(false);

    let ctx = proxy::get_user_context(&state, &token.user_id).await?;

    let original_model = model;
    let ep_tag: Option<String> = None;

    let resolved_ep_models: Option<Vec<String>> = None;

    let model_list = vec![model.to_string()];

    // 【一条日志原则】循环重试场景下复用同一条日志记录，避免产生多条
    let mut ha = crate::relay::ha::HaAttempt::begin(&state, token.high_availability).await;

    for (retry_idx, current_model) in model_list.iter().enumerate() {
        let model = current_model.as_str();
        ha.reset_attempts();

        // 1. Token 模型权限校验（渠道选择前快速拦截；EP 已在循环外检查过）
        if resolved_ep_models.is_none() {
            if let Err(e) = proxy::check_model_permission(
                &state,
                &token,
                model,
                "/v1/chat/completions",
                Some("聊天"),
            )
            .await
            {
                ha.on_access_err(e);
                continue;
            }
        }

        let mut model_success = false;
        let mut final_response = None;

        while ha.cont() {
            let start_time = std::time::Instant::now();

            // 2. 选择渠道
            let channel = match proxy::select_channel_for_model(
                &state,
                &token,
                model,
                &ctx.user_group,
                &ctx.level_id,
                raw_path,
                &ha.exclude_aids,
                !ha.had_upstream,
                Some("聊天"),
            )
            .await
            {
                Ok(c) => c,
                Err(e) => {
                    ha.on_select_err(e);
                    break;
                }
            };

            // 3. 预扣费检查（带 channel 精确匹配同名模型的预扣费金额；EP/非EP 统一调用，同时获取 Model 供下游复用）
            let (pre_deduction, db_model, resolved_cat) = match proxy::check_access(
                &state,
                &token,
                model,
                &ctx,
                Some("聊天"),
                Some(&channel),
            )
            .await
            {
                Ok(v) => v,
                Err(e) => {
                    ha.on_access_err(e);
                    break; // 余额不足等，跳出 while 尝试下一个模型
                }
            };

            // 模型表别名映射：渠道无映射时回落到 db_model.model_id_alias
            let (resolved_model, mapping_source) =
                router::resolve_model(&channel, model, db_model.as_ref());

            // 4. 解析转发规则（复用 db_model 避免重查 models 表）
            let resolved = match forward::resolve_forward_rule(
                &state,
                model,
                &resolved_cat,
                raw_path,
                Some(&channel),
                db_model.as_ref(),
            )
            .await
            {
                Some(r) => r,
                None => {
                    if forward::model_has_forward_rules(&state, model).await {
                        // 业务侧错误，不可 HA 续试（continue 不 bump 会空转）
                        ha.on_access_err(AppError::BadRequest(format!(
                            "模型 '{}' 不支持当前接口，请检查模型对应的转发规则",
                            model
                        )));
                        break;
                    }
                    forward::infer_forward_from_base_url(
                        &channel.base_url,
                        &resolved_cat,
                        db_model.as_ref(),
                    )
                }
            };

            let target_type = resolved.target_type.clone();
            // 转发规则路径含 streamGenerateContent 时上游始终返回 SSE，强制走流式路径
            let is_stream = is_stream || resolved.upstream_path.contains("streamGenerateContent");
            let mut db_rule =
                proxy::get_model_billing_rule(&state, model, Some(&channel), db_model.as_ref())
                    .await;
            let upstream_body: serde_json::Value = forward::transform_request_body(
                &resolved,
                &resolved_model,
                &body,
                "聊天",
                db_rule.as_ref(),
                Some(&state.http_client),
            )
            .await;
            let url = forward::build_upstream_url(
                &channel.base_url,
                &resolved,
                &resolved_model,
                &channel.api_key,
            );
            let auth_headers = forward::build_auth_headers(&resolved, &channel.api_key);

            tracing::info!("[Chat] retry_idx={}, model={}, target_type={}, auth_type={}, url={}, channel_id={}, channel_key={}",
                retry_idx, model, target_type, resolved.auth_type, url, channel.id,
                if channel.api_key.len() > 12 { format!("{}***{}", &channel.api_key[..8], &channel.api_key[channel.api_key.len()-4..]) } else { "***".to_string() });

            let resolved_upstream_path =
                resolved.upstream_path.replace("${model}", &resolved_model);
            let masked_url = forward::mask_key_in_string(&url, &channel.api_key);
            let ep = format!("{}|{}", raw_path, masked_url);
            // pending_log_id 将在后续与网络请求一起并发执行
            if is_stream {
                let mut stream_body = upstream_body.clone();
                // Gemini 流式通过 URL 切换为 :streamGenerateContent?alt=sse 实现，请求体不接受 stream 字段
                if target_type != "gemini" {
                    stream_body["stream"] = serde_json::json!(true);
                }
                let mut final_upstream_path = resolved_upstream_path.clone();
                let stream_url = if target_type == "gemini" {
                    final_upstream_path = final_upstream_path
                        .replace(":generateContent", ":streamGenerateContent")
                        + "?alt=sse";
                    let mut final_url =
                        super::url_utils::join_url(&channel.base_url, &final_upstream_path);
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

                let final_upstream_path =
                    forward::mask_key_in_string(&stream_url, &channel.api_key);

                let stream_builder = state
                    .http_client
                    .post(&stream_url)
                    .header("Content-Type", "application/json");
                let stream_builder = auth_headers
                    .into_iter()
                    .fold(stream_builder, |b, (k, v)| b.header(k, v));

                let pending_log_future = async {
                    if ha.pending_log_id.is_none() {
                        proxy::record_pending_log(proxy::PendingLog {
                            state: &state,
                            user_id: &token.user_id,
                            token_id: token.id,
                            model: model,
                            endpoint: &ep,
                            is_stream: 1,
                            request_content: Some(&request_content_str),
                            upstream_url: Some(&url),
                            channel: &channel,
                            billing_model_hint: None,
                            plugin_tag: None,
                            category: Some("聊天"),
                            db_model: db_model.as_ref(),
                            forward_eid: Some(&resolved.eid),
                            requested_log_id: None,
                        })
                        .await
                    } else {
                        ha.pending_log_id
                    }
                };

                let send_future = stream_builder.json(&stream_body).send();
                let (log_res, resp_res) = tokio::join!(pending_log_future, send_future);
                ha.pending_log_id = log_res;

                let resp = match resp_res {
                    Ok(r) => r,
                    Err(e) => {
                        let err_msg = e.to_string();
                        let latency_ms = start_time.elapsed().as_millis() as u32;
                        tracing::warn!("[Chat] stream connect error: {}", err_msg);
                        if chat_upstream_fail(
                            &state,
                            &token,
                            &channel,
                            model,
                            &ep,
                            502,
                            &err_msg,
                            latency_ms,
                            1,
                            &request_content_str,
                            None,
                            &upstream_body.to_string(),
                            ep_tag.clone(),
                            ha.pending_log_id,
                            db_model.clone(),
                            ha.failover_on,
                            &mut ha.exclude_aids,
                            &mut ha.first_fail,
                            &mut ha.last_err,
                            &mut ha.had_upstream,
                            Some(&url),
                        )
                        .await
                        {
                            ha.bump();
                            continue;
                        }
                        break;
                    }
                };

                if !resp.status().is_success() {
                    let status = resp.status().as_u16();
                    let err = resp.text().await.unwrap_or_default();
                    let display_err = proxy::upstream_error_text(status, &err);
                    let latency_ms = start_time.elapsed().as_millis() as u32;
                    tracing::warn!("[Chat] stream upstream error {}: {}", status, display_err);
                    if chat_upstream_fail(
                        &state,
                        &token,
                        &channel,
                        model,
                        &ep,
                        status,
                        &display_err,
                        latency_ms,
                        1,
                        &request_content_str,
                        Some(err),
                        &upstream_body.to_string(),
                        ep_tag.clone(),
                        ha.pending_log_id,
                        db_model.clone(),
                        ha.failover_on,
                        &mut ha.exclude_aids,
                        &mut ha.first_fail,
                        &mut ha.last_err,
                        &mut ha.had_upstream,
                        Some(&url),
                    )
                    .await
                    {
                        ha.bump();
                        continue;
                    }
                    break;
                }

                let prompt_tokens = estimate_prompt_tokens(&body);
                let pre_deduct_gift = proxy::pre_deduct_or_intercept(
                    &state,
                    &token,
                    &channel,
                    model,
                    pre_deduction,
                    &ep,
                    start_time,
                    1,
                    &request_content_str,
                    &upstream_body.to_string(),
                    ep_tag.clone(),
                    ha.pending_log_id,
                    db_model.as_ref(),
                    &ctx.role,
                    Some("聊天"),
                )
                .await?;

                let s_ep = ep_tag.as_ref().map(|_| original_model.to_string());
                final_response = Some(
                    stream::handle_chat_stream(
                        state.clone(),
                        token.clone(),
                        channel.clone(),
                        model.to_string(),
                        resp,
                        ctx.discount,
                        ctx.model_discounts.clone(),
                        prompt_tokens,
                        request_content_str.clone(),
                        start_time,
                        target_type,
                        final_upstream_path,
                        Some(upstream_body.to_string()),
                        pre_deduction,
                        pre_deduct_gift,
                        raw_path.to_string(),
                        s_ep,
                        ha.pending_log_id,
                        db_model,
                        db_rule,
                    )
                    .await
                    .into_response(),
                );
                model_success = true;
                break;
            } else {
                let builder = state
                    .http_client
                    .post(&url)
                    .header("Content-Type", "application/json");
                let builder = auth_headers
                    .into_iter()
                    .fold(builder, |b, (k, v)| b.header(k, v));

                let pending_log_future = async {
                    if ha.pending_log_id.is_none() {
                        proxy::record_pending_log(proxy::PendingLog {
                            state: &state,
                            user_id: &token.user_id,
                            token_id: token.id,
                            model: model,
                            endpoint: &ep,
                            is_stream: 0,
                            request_content: Some(&request_content_str),
                            upstream_url: Some(&url),
                            channel: &channel,
                            billing_model_hint: None,
                            plugin_tag: None,
                            category: Some("聊天"),
                            db_model: db_model.as_ref(),
                            forward_eid: Some(&resolved.eid),
                            requested_log_id: None,
                        })
                        .await
                    } else {
                        ha.pending_log_id
                    }
                };

                let send_future = builder.json(&upstream_body).send();
                let (log_res, resp_res) = tokio::join!(pending_log_future, send_future);
                ha.pending_log_id = log_res;

                let resp = match resp_res {
                    Ok(r) => r,
                    Err(e) => {
                        let err_msg = e.to_string();
                        let latency_ms = start_time.elapsed().as_millis() as u32;
                        tracing::warn!("[Chat] connect error: {}", err_msg);
                        if chat_upstream_fail(
                            &state,
                            &token,
                            &channel,
                            model,
                            &ep,
                            502,
                            &err_msg,
                            latency_ms,
                            0,
                            &request_content_str,
                            None,
                            &upstream_body.to_string(),
                            ep_tag.clone(),
                            ha.pending_log_id,
                            db_model.clone(),
                            ha.failover_on,
                            &mut ha.exclude_aids,
                            &mut ha.first_fail,
                            &mut ha.last_err,
                            &mut ha.had_upstream,
                            Some(&url),
                        )
                        .await
                        {
                            ha.bump();
                            continue;
                        }
                        break;
                    }
                };

                let status = resp.status().as_u16();
                if !resp.status().is_success() {
                    let err = resp.text().await.unwrap_or_default();
                    let display_err = proxy::upstream_error_text(status, &err);
                    let latency_ms = start_time.elapsed().as_millis() as u32;
                    tracing::warn!("[Chat] upstream error {}: {}", status, display_err);
                    if chat_upstream_fail(
                        &state,
                        &token,
                        &channel,
                        model,
                        &ep,
                        status,
                        &display_err,
                        latency_ms,
                        0,
                        &request_content_str,
                        Some(err),
                        &upstream_body.to_string(),
                        ep_tag.clone(),
                        ha.pending_log_id,
                        db_model.clone(),
                        ha.failover_on,
                        &mut ha.exclude_aids,
                        &mut ha.first_fail,
                        &mut ha.last_err,
                        &mut ha.had_upstream,
                        Some(&url),
                    )
                    .await
                    {
                        ha.bump();
                        continue;
                    }
                    break;
                }

                let content_type = resp
                    .headers()
                    .get("content-type")
                    .and_then(|v| v.to_str().ok())
                    .unwrap_or("");
                if content_type.contains("text/event-stream")
                    || content_type.contains("application/x-ndjson")
                {
                    let prompt_tokens = estimate_prompt_tokens(&body);
                    let final_upstream_path = resolved_upstream_path.clone();
                    let pre_deduct_gift = proxy::pre_deduct_or_intercept(
                        &state,
                        &token,
                        &channel,
                        model,
                        pre_deduction,
                        &ep,
                        start_time,
                        1,
                        &request_content_str,
                        &upstream_body.to_string(),
                        ep_tag.clone(),
                        ha.pending_log_id,
                        db_model.as_ref(),
                        &ctx.role,
                        Some("聊天"),
                    )
                    .await?;
                    let s_ep = ep_tag.as_ref().map(|_| original_model.to_string());
                    final_response = Some(
                        stream::handle_chat_stream(
                            state.clone(),
                            token.clone(),
                            channel.clone(),
                            model.to_string(),
                            resp,
                            ctx.discount,
                            ctx.model_discounts.clone(),
                            prompt_tokens,
                            request_content_str.clone(),
                            start_time,
                            target_type,
                            final_upstream_path,
                            Some(upstream_body.to_string()),
                            pre_deduction,
                            pre_deduct_gift,
                            raw_path.to_string(),
                            s_ep,
                            ha.pending_log_id,
                            db_model,
                            db_rule,
                        )
                        .await
                        .into_response(),
                    );
                    model_success = true;
                    break;
                }

                let data = resp.bytes().await.unwrap_or_default();
                let mut response_content_str = String::from_utf8_lossy(&data).to_string();

                // 上游 body 级错误检测（HTTP 200 但业务失败，在预扣费之前拦截）
                let (converted, post_err) = forward::check_upstream_post_error(
                    &target_type,
                    &response_content_str,
                    resolved_cat.as_str(),
                    false,
                );
                response_content_str = converted;
                if let Some(_err_response) = post_err {
                    let latency_ms = start_time.elapsed().as_millis() as u32;
                    let err_text = proxy::extract_error_message(&response_content_str);
                    let err_status = proxy::infer_error_status_code_from_str(&response_content_str);
                    tracing::warn!("[Chat] upstream body error: {}", err_text);
                    if chat_upstream_fail(
                        &state,
                        &token,
                        &channel,
                        model,
                        &ep,
                        err_status,
                        &err_text,
                        latency_ms,
                        0,
                        &request_content_str,
                        Some(response_content_str),
                        &upstream_body.to_string(),
                        ep_tag.clone(),
                        ha.pending_log_id,
                        db_model.clone(),
                        ha.failover_on,
                        &mut ha.exclude_aids,
                        &mut ha.first_fail,
                        &mut ha.last_err,
                        &mut ha.had_upstream,
                        Some(&url),
                    )
                    .await
                    {
                        ha.bump();
                        continue;
                    }
                    break;
                }

                let usage_tokens = usage_extractor::parse_usage(&response_content_str);
                let prompt_tokens = usage_tokens.prompt;
                let completion_tokens = usage_tokens.completion;
                let cached_tokens = usage_tokens.cached;

                let mut features = usage_extractor::extract_request_features(&body);
                features.cache_creation = if usage_tokens.cache_creation > 0 {
                    Some(usage_tokens.cache_creation)
                } else {
                    None
                };

                let pre_deduct_gift = proxy::pre_deduct_or_intercept(
                    &state,
                    &token,
                    &channel,
                    model,
                    pre_deduction,
                    &ep,
                    start_time,
                    0,
                    &request_content_str,
                    &upstream_body.to_string(),
                    ep_tag.clone(),
                    ha.pending_log_id,
                    db_model.as_ref(),
                    &ctx.role,
                    Some("聊天"),
                )
                .await?;

                let (quota_used, mut detail) = super::calculate_relay_cost(
                    &state,
                    db_model.as_ref(),
                    db_rule.as_mut(),
                    &channel,
                    ctx.discount,
                    &ctx.model_discounts,
                    &usage_tokens,
                    &features,
                    mapping_source.as_deref(),
                    &model,
                    &resolved_model,
                )
                .await;
                if let Some(ref et) = ep_tag {
                    detail.push_str(&format!(" | {}", et));
                }

                let latency_ms = start_time.elapsed().as_millis() as u32;

                // 【连接保护】计费放入独立 task，客户端断开后仍完成
                let (s, t, ch, m, e, rc, rsc, uc) = (
                    state.clone(),
                    token.clone(),
                    channel.clone(),
                    model.to_string(),
                    ep.clone(),
                    request_content_str.clone(),
                    response_content_str.clone(),
                    upstream_body.to_string(),
                );
                let dm = db_model.clone();
                let pending_log_id = ha.pending_log_id;
                tokio::spawn(async move {
                    proxy::record_and_bill_inner(proxy::BillRecord {
                        state: &s,
                        token: &t,
                        channel: &ch,
                        model: &m,
                        prompt_tokens: prompt_tokens,
                        completion_tokens: completion_tokens,
                        cached_tokens: cached_tokens,
                        cost: quota_used,
                        pre_deducted: pre_deduction,
                        pre_deduct_gift: pre_deduct_gift,
                        status_code: 200,
                        endpoint: &e,
                        error_msg: None,
                        latency_ms: latency_ms,
                        is_stream: 0,
                        request_content: Some(rc),
                        response_content: Some(rsc),
                        upstream_req_content: Some(uc),
                        billing_detail: Some(detail),
                        hint_category: Some("聊天"),
                        pending_log_id: pending_log_id,
                        billing_model_hint: None,
                        plugin_tag: None,
                        db_model: dm.as_ref(),
                    })
                    .await;
                });

                let final_body = if raw_path.ends_with("/messages") {
                    response_content_str.clone()
                } else {
                    transform_chat_response(&response_content_str, &target_type, model)
                };

                final_response = Some(
                    Response::builder()
                        .header("Content-Type", "application/json")
                        .body(axum::body::Body::from(final_body))
                        .unwrap(),
                );
                model_success = true;
                break;
            } // end if is_stream
        } // end while ha.cont()

        if model_success {
            return Ok(final_response.unwrap());
        }
    }

    Err(ha.finish())
}

// ── Responses API (/v1/responses, /api/v3/responses) ─────────
// 直接透传请求体到上游，不做格式转换，复用聊天类别的计费和日志体系

pub async fn responses_create(
    State(state): State<Arc<AppState>>,
    Extension(token): Extension<ApiToken>,
    OriginalUri(uri): OriginalUri,
    Json(body): Json<serde_json::Value>,
) -> AppResult<Response> {
    let raw_path = uri.path();
    let request_content_str = serde_json::to_string(&body).unwrap_or_default();
    let model = body["model"]
        .as_str()
        .ok_or_else(|| AppError::BadRequest("Missing required parameter: model".to_string()))?;
    let is_stream = body["stream"].as_bool().unwrap_or(false);

    let ctx = proxy::get_user_context(&state, &token.user_id).await?;
    proxy::check_model_permission(&state, &token, model, "/v1/responses", Some("聊天")).await?;
    let mut ha = crate::relay::ha::HaAttempt::begin(&state, token.high_availability).await;

    while ha.cont() {
        let start_time = std::time::Instant::now();
        let channel = match proxy::select_channel_for_model(
            &state,
            &token,
            model,
            &ctx.user_group,
            &ctx.level_id,
            raw_path,
            &ha.exclude_aids,
            !ha.had_upstream,
            Some("聊天"),
        )
        .await
        {
            Ok(c) => c,
            Err(e) => {
                ha.on_select_err(e);
                break;
            }
        };
        let (pre_deduction, db_model, resolved_cat) =
            match proxy::check_access(&state, &token, model, &ctx, Some("聊天"), Some(&channel))
                .await
            {
                Ok(v) => v,
                Err(e) => {
                    ha.on_access_err(e);
                    break;
                }
            };
        let (resolved_model, mapping_source) =
            router::resolve_model(&channel, model, db_model.as_ref());

        // 解析转发规则：复用聊天类别，兜底使用 /v1/responses 路径
        let resolved = match forward::resolve_forward_rule(
            &state,
            model,
            &resolved_cat,
            raw_path,
            Some(&channel),
            db_model.as_ref(),
        )
        .await
        {
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

        let mut db_rule =
            proxy::get_model_billing_rule(&state, model, Some(&channel), db_model.as_ref()).await;

        // 构建上游请求体：仅替换 model 字段，其余透传
        let mut upstream_body = body.clone();
        upstream_body["model"] = serde_json::json!(resolved_model);

        let url = forward::build_upstream_url(
            &channel.base_url,
            &resolved,
            &resolved_model,
            &channel.api_key,
        );
        let auth_headers = forward::build_auth_headers(&resolved, &channel.api_key);

        tracing::info!(
            "[Responses] model={}, resolved={}, url={}",
            model,
            resolved_model,
            url
        );

        let resolved_upstream_path = resolved.upstream_path.replace("${model}", &resolved_model);
        let ep = format!("{}|{}", raw_path, resolved_upstream_path);

        // 【连接保护】将请求发送+响应处理+预扣费+计费放入独立 task，客户端断开后仍能完成
        let model = model.to_string();
        let mapping_source = mapping_source.map(|s| s.to_string());
        let mut features = usage_extractor::extract_request_features(&body);
        let upstream_body_str = upstream_body.to_string();
        let role = ctx.role.clone();
        let discount = ctx.discount;
        let model_discounts = ctx.model_discounts.clone();
        let raw_path = raw_path.to_string();
        let pending_log_id = ha.pending_log_id;
        let (result_tx, result_rx) =
            tokio::sync::oneshot::channel::<(Option<i64>, Result<Response, AppError>)>();

        let state_c = state.clone();
        let token_c = token.clone();
        let request_content_str_c = request_content_str.clone();
        let channel_c = channel.clone();
        let model_c = model.clone();
        let url_c = url.clone();
        let ep_c = ep.clone();
        let resolved_eid_c = resolved.eid.clone();
        let db_model_c = db_model.clone();

        tokio::spawn(async move {
            let state = state_c;
            let token = token_c;
            let request_content_str = request_content_str_c;
            let channel = channel_c;
            let model = model_c;
            let url = url_c;
            let ep = ep_c;
            let resolved_eid = resolved_eid_c;
            let db_model = db_model_c;
            let mut pending_log_id = pending_log_id;

            let (pending_log_id, result): (Option<i64>, Result<Response, AppError>) = async {
                let pending_log_future = async {
                    if pending_log_id.is_none() {
                        proxy::record_pending_log(proxy::PendingLog {
                            state: &state,
                            user_id: &token.user_id,
                            token_id: token.id,
                            model: &model,
                            endpoint: &ep,
                            is_stream: if is_stream { 1 } else { 0 },
                            request_content: Some(&request_content_str),
                            upstream_url: Some(&url),
                            channel: &channel,
                            billing_model_hint: None,
                            plugin_tag: None,
                            category: Some("聊天"),
                            db_model: db_model.as_ref(),
                            forward_eid: Some(&resolved_eid),
                            requested_log_id: None,
                        })
                        .await
                    } else {
                        pending_log_id
                    }
                };

                // 统一构建请求（流式/非流式共用 builder，仅请求体不同）
                let mut req_body = upstream_body;
                if is_stream {
                    req_body["stream"] = serde_json::json!(true);
                }

                let builder = state
                    .http_client
                    .post(&url)
                    .header("Content-Type", "application/json");
                let builder = auth_headers
                    .into_iter()
                    .fold(builder, |b, (k, v)| b.header(k, v));
                let send_future = builder.json(&req_body).send();

                let (log_res, resp_res) = tokio::join!(pending_log_future, send_future);
                pending_log_id = log_res;

                let resp = match resp_res {
                    Ok(r) => r,
                    Err(e) => {
                        let err_msg = e.to_string();
                        let latency_ms = start_time.elapsed().as_millis() as u32;
                        proxy::record_and_bill_inner(proxy::BillRecord {
                            state: &state,
                            token: &token,
                            channel: &channel,
                            model: &model,
                            prompt_tokens: 0,
                            completion_tokens: 0,
                            cached_tokens: 0,
                            cost: 0.0,
                            pre_deducted: 0.0,
                            pre_deduct_gift: 0.0,
                            status_code: 502,
                            endpoint: &ep,
                            error_msg: Some(&err_msg),
                            latency_ms: latency_ms,
                            is_stream: if is_stream { 1 } else { 0 },
                            request_content: Some(request_content_str.clone()),
                            response_content: Some(err_msg.clone()),
                            upstream_req_content: Some(upstream_body_str.clone()),
                            billing_detail: None,
                            hint_category: Some("聊天"),
                            pending_log_id: pending_log_id,
                            billing_model_hint: None,
                            plugin_tag: None,
                            db_model: db_model.as_ref(),
                        })
                        .await;
                        return (pending_log_id, Err(proxy::upstream_fail(502, &err_msg)));
                    }
                };

                if !resp.status().is_success() {
                    let status = resp.status().as_u16();
                    let err = resp.text().await.unwrap_or_default();
                    let display_err = proxy::upstream_error_text(status, &err);
                    let latency_ms = start_time.elapsed().as_millis() as u32;
                    proxy::record_and_bill_inner(proxy::BillRecord {
                        state: &state,
                        token: &token,
                        channel: &channel,
                        model: &model,
                        prompt_tokens: 0,
                        completion_tokens: 0,
                        cached_tokens: 0,
                        cost: 0.0,
                        pre_deducted: 0.0,
                        pre_deduct_gift: 0.0,
                        status_code: status,
                        endpoint: &ep,
                        error_msg: Some(&display_err),
                        latency_ms: latency_ms,
                        is_stream: if is_stream { 1 } else { 0 },
                        request_content: Some(request_content_str.clone()),
                        response_content: Some(err),
                        upstream_req_content: Some(upstream_body_str.clone()),
                        billing_detail: None,
                        hint_category: Some("聊天"),
                        pending_log_id: pending_log_id,
                        billing_model_hint: None,
                        plugin_tag: None,
                        db_model: db_model.as_ref(),
                    })
                    .await;
                    return (
                        pending_log_id,
                        Err(proxy::upstream_fail(status, &display_err)),
                    );
                }

                // 判断是否为流式响应（请求流式 或 上游实际返回 SSE）
                let content_type = resp
                    .headers()
                    .get("content-type")
                    .and_then(|v| v.to_str().ok())
                    .unwrap_or("");
                let actual_stream = is_stream || content_type.contains("text/event-stream");

                if actual_stream {
                    // 流式路径：预扣费后交给 handle_responses_stream（内部有独立 worker 处理流+计费）
                    let pre_deduct_gift = proxy::pre_deduct_or_intercept(
                        &state,
                        &token,
                        &channel,
                        &model,
                        pre_deduction,
                        &ep,
                        start_time,
                        1,
                        &request_content_str,
                        &upstream_body_str,
                        None,
                        pending_log_id,
                        db_model.as_ref(),
                        &role,
                        Some("聊天"),
                    )
                    .await;
                    let pre_deduct_gift = match pre_deduct_gift {
                        Ok(v) => v,
                        Err(e) => return (pending_log_id, Err(e)),
                    };

                    (
                        pending_log_id,
                        Ok(stream::handle_responses_stream(
                            state.clone(),
                            token,
                            channel,
                            model.clone(),
                            resp,
                            discount,
                            model_discounts.clone(),
                            request_content_str,
                            start_time,
                            resolved_upstream_path,
                            Some(upstream_body_str),
                            pre_deduction,
                            pre_deduct_gift,
                            raw_path,
                            pending_log_id,
                            db_model,
                            db_rule,
                        )
                        .await
                        .into_response()),
                    )
                } else {
                    // 非流式：直接透传响应，提取 usage 计费
                    let data = resp.bytes().await.unwrap_or_default();
                    let mut response_content_str = String::from_utf8_lossy(&data).to_string();

                    // 上游 body 级错误检测（HTTP 200 但业务失败，在预扣费之前拦截）
                    let (converted, post_err) = forward::check_upstream_post_error(
                        &resolved.target_type,
                        &response_content_str,
                        resolved_cat.as_str(),
                        false,
                    );
                    response_content_str = converted;
                    if let Some(err_response) = post_err {
                        let latency_ms = start_time.elapsed().as_millis() as u32;
                        let err_text = proxy::extract_error_message(&response_content_str);
                        let err_status =
                            proxy::infer_error_status_code_from_str(&response_content_str);
                        proxy::record_and_bill_inner(proxy::BillRecord {
                            state: &state,
                            token: &token,
                            channel: &channel,
                            model: &model,
                            prompt_tokens: 0,
                            completion_tokens: 0,
                            cached_tokens: 0,
                            cost: 0.0,
                            pre_deducted: 0.0,
                            pre_deduct_gift: 0.0,
                            status_code: err_status,
                            endpoint: &ep,
                            error_msg: Some(&err_text),
                            latency_ms: latency_ms,
                            is_stream: 0,
                            request_content: Some(request_content_str.clone()),
                            response_content: Some(response_content_str),
                            upstream_req_content: Some(upstream_body_str.clone()),
                            billing_detail: None,
                            hint_category: Some("聊天"),
                            pending_log_id: pending_log_id,
                            billing_model_hint: None,
                            plugin_tag: None,
                            db_model: db_model.as_ref(),
                        })
                        .await;
                        return (
                            pending_log_id,
                            Err(proxy::upstream_fail(err_status, &err_response)),
                        );
                    }

                    let usage_tokens = usage_extractor::parse_usage(&response_content_str);
                    let prompt_tokens = usage_tokens.prompt;
                    let completion_tokens = usage_tokens.completion;
                    let cached_tokens = usage_tokens.cached;

                    let pre_deduct_gift = proxy::pre_deduct_or_intercept(
                        &state,
                        &token,
                        &channel,
                        &model,
                        pre_deduction,
                        &ep,
                        start_time,
                        0,
                        &request_content_str,
                        &upstream_body_str,
                        None,
                        pending_log_id,
                        db_model.as_ref(),
                        &role,
                        Some("聊天"),
                    )
                    .await;
                    let pre_deduct_gift = match pre_deduct_gift {
                        Ok(v) => v,
                        Err(e) => return (pending_log_id, Err(e)),
                    };

                    if usage_tokens.web_search > 0 {
                        features.web_search = Some(usage_tokens.web_search);
                    }

                    let (quota_used, detail) = crate::relay::calculate_relay_cost(
                        &state,
                        db_model.as_ref(),
                        db_rule.as_mut(),
                        &channel,
                        discount,
                        &model_discounts,
                        &usage_tokens,
                        &features,
                        mapping_source.as_deref(),
                        &model,
                        &resolved_model,
                    )
                    .await;

                    let latency_ms = start_time.elapsed().as_millis() as u32;

                    proxy::record_and_bill_inner(proxy::BillRecord {
                        state: &state,
                        token: &token,
                        channel: &channel,
                        model: &model,
                        prompt_tokens: prompt_tokens,
                        completion_tokens: completion_tokens,
                        cached_tokens: cached_tokens,
                        cost: quota_used,
                        pre_deducted: pre_deduction,
                        pre_deduct_gift: pre_deduct_gift,
                        status_code: 200,
                        endpoint: &ep,
                        error_msg: None,
                        latency_ms: latency_ms,
                        is_stream: 0,
                        request_content: Some(request_content_str),
                        response_content: Some(response_content_str.clone()),
                        upstream_req_content: Some(upstream_body_str),
                        billing_detail: Some(detail),
                        hint_category: Some("聊天"),
                        pending_log_id: pending_log_id,
                        billing_model_hint: None,
                        plugin_tag: None,
                        db_model: db_model.as_ref(),
                    })
                    .await;

                    // Responses API 直接透传上游响应，不做格式转换
                    (
                        pending_log_id,
                        Ok(Response::builder()
                            .header("Content-Type", "application/json")
                            .body(axum::body::Body::from(response_content_str))
                            .unwrap()),
                    )
                }
            }
            .await;
            let _ = result_tx.send((pending_log_id, result));
        });

        match result_rx.await {
            Ok((returned_log_id, result)) => {
                ha.pending_log_id = returned_log_id;
                match result {
                    Ok(resp) => return Ok(resp),
                    Err(e) => {
                        if ha
                            .on_spawn_result_err(&state, &channel, e, Some(&url))
                            .await
                        {
                            ha.bump();
                            continue;
                        }
                        break;
                    }
                }
            }
            Err(_) => {
                ha.last_err = AppError::Internal("请求处理任务异常终止".into());
                break;
            }
        }
    } // end while

    Err(ha.finish())
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
                let content = v
                    .get("content")
                    .and_then(|c| c.as_array())
                    .and_then(|arr| {
                        arr.iter()
                            .filter(|c| c.get("type").and_then(|t| t.as_str()) == Some("text"))
                            .map(|c| c.get("text").and_then(|t| t.as_str()).unwrap_or(""))
                            .next()
                    })
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
                let content = v
                    .get("candidates")
                    .and_then(|c| c.get(0))
                    .and_then(|c| c.get("content"))
                    .and_then(|c| c.get("parts"))
                    .and_then(|p| p.get(0))
                    .and_then(|p| p.get("text"))
                    .and_then(|t| t.as_str())
                    .unwrap_or("");
                let finish = v
                    .get("candidates")
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

// ── 辅助提炼函数（精简冗余、解耦核心流程） ──────────────────────────

/// 聊天上游失败：仅首次落库（全失败保留子渠 1）；成功路径另写成功子渠 yid，不受此快照影响
async fn chat_upstream_fail(
    state: &Arc<AppState>,
    token: &ApiToken,
    channel: &crate::models::Channel,
    model: &str,
    ep: &str,
    status: u16,
    display_err: &str,
    latency_ms: u32,
    is_stream: i32,
    request_content_str: &str,
    response_content_str: Option<String>,
    upstream_body_str: &str,
    ep_tag: Option<String>,
    pending_log_id: Option<i64>,
    db_model: Option<crate::models::Model>,
    failover_on: bool,
    exclude_aids: &mut Vec<String>,
    first_fail: &mut Option<crate::relay::ha::FirstUpstreamFail>,
    last_err: &mut AppError,
    had_upstream: &mut bool,
    upstream_url: Option<&str>,
) -> bool {
    *had_upstream = true;
    let masked_url =
        upstream_url.map(|u| crate::relay::forward::mask_key_in_string(u, &channel.api_key));
    let is_first =
        crate::relay::ha::remember_first(first_fail, channel, status, display_err, masked_url);
    if is_first {
        *last_err = proxy::upstream_fail(status, display_err);
    }
    let failing_over = crate::relay::ha::try_failover(
        state,
        failover_on,
        channel.group_aid.as_deref(),
        status,
        display_err,
        exclude_aids,
    );
    if is_first {
        record_failed_billing(
            state,
            token,
            channel,
            model,
            ep,
            status,
            display_err,
            latency_ms,
            is_stream,
            request_content_str,
            response_content_str,
            upstream_body_str,
            ep_tag,
            pending_log_id,
            db_model,
            if failing_over {
                None
            } else {
                channel.group_aid.clone()
            },
            failing_over,
        )
        .await;
    }
    failing_over
}

/// 上游错误记账。`sync=true` 时等待写库完成（HA failover 续试前必须同步，避免与下一轮争用同一 pending_log_id）。
async fn record_failed_billing(
    state: &Arc<AppState>,
    token: &ApiToken,
    channel: &crate::models::Channel,
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
    group_aid: Option<String>,
    sync: bool,
) {
    if let Some(aid) = &group_aid {
        // 400/422/403 为用户侧错误，不熔断
        if !matches!(status_code, 400 | 403 | 422) {
            proxy::trigger_ha_meltdown(state, aid, status_code, error_message);
        }
    }

    if sync {
        proxy::record_and_bill_inner(proxy::BillRecord {
            state: state,
            token: token,
            channel: channel,
            model: model,
            prompt_tokens: 0,
            completion_tokens: 0,
            cached_tokens: 0,
            cost: 0.0,
            pre_deducted: 0.0,
            pre_deduct_gift: 0.0,
            status_code: status_code,
            endpoint: ep,
            error_msg: Some(error_message),
            latency_ms: latency_ms,
            is_stream: is_stream,
            request_content: Some(request_content_str.to_string()),
            response_content: response_content_str,
            upstream_req_content: Some(upstream_body_str.to_string()),
            billing_detail: ep_tag,
            hint_category: Some("聊天"),
            pending_log_id: pending_log_id,
            billing_model_hint: None,
            plugin_tag: None,
            db_model: db_model.as_ref(),
        })
        .await;
        return;
    }

    let s = state.clone();
    let t = token.clone();
    let ch = channel.clone();
    let m = model.to_string();
    let e = ep.to_string();
    let em = error_message.to_string();
    let rc = request_content_str.to_string();
    let uc = upstream_body_str.to_string();
    tokio::spawn(async move {
        proxy::record_and_bill_inner(proxy::BillRecord {
            state: &s,
            token: &t,
            channel: &ch,
            model: &m,
            prompt_tokens: 0,
            completion_tokens: 0,
            cached_tokens: 0,
            cost: 0.0,
            pre_deducted: 0.0,
            pre_deduct_gift: 0.0,
            status_code: status_code,
            endpoint: &e,
            error_msg: Some(&em),
            latency_ms: latency_ms,
            is_stream: is_stream,
            request_content: Some(rc.clone()),
            response_content: response_content_str,
            upstream_req_content: Some(uc),
            billing_detail: ep_tag,
            hint_category: Some("聊天"),
            pending_log_id: pending_log_id,
            billing_model_hint: None,
            plugin_tag: None,
            db_model: db_model.as_ref(),
        })
        .await;
    });
}
