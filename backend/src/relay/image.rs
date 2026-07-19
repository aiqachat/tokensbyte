//! Relay: POST /v1/images/generations
//! OpenAI-compatible image generation endpoint with forward-rule-driven protocol adaptation.

use super::{forward, proxy, router};
use crate::models::ApiToken;
use crate::{
    error::{AppError, AppResult},
    AppState,
};
use axum::{
    extract::{Extension, State},
    response::{IntoResponse, Response},
};
use std::sync::Arc;

/// 从 multipart/form-data 请求中解析字段为 JSON 对象。
/// - text 字段：尝试解析为 JSON 原始值（数值/布尔/null），失败则作为字符串
/// - file 字段（image/mask 等）：读取字节 → base64 编码 → `data:{mime};base64,{data}` 格式
async fn parse_multipart_to_json(
    state: Arc<AppState>,
    parts: axum::http::request::Parts,
    body: axum::body::Body,
) -> Result<serde_json::Value, AppError> {
    use axum::extract::FromRequest;
    use base64::Engine;
    let request = axum::http::Request::from_parts(parts, body);
    let mut multipart = axum::extract::Multipart::from_request(request, &state)
        .await
        .map_err(|e| AppError::BadRequest(format!("Failed to parse multipart: {}", e)))?;
    let mut map = serde_json::Map::new();
    while let Some(field) = multipart.next_field().await.unwrap_or(None) {
        let name = field.name().unwrap_or("").to_string();
        if name.is_empty() {
            continue;
        }
        let is_file = field.file_name().is_some();
        if is_file {
            // 文件字段：转为 base64 data URI，与 collect_image_urls 兼容
            let mime = field
                .content_type()
                .unwrap_or("application/octet-stream")
                .to_string();
            let data = field.bytes().await.map_err(|e| {
                AppError::BadRequest(format!("Failed to read file field '{}': {}", name, e))
            })?;

            // 尝试读取为 UTF-8 字符串以判定是否已是 Base64 或 Data URI，避免发生二次编码
            let data_uri = std::str::from_utf8(&data)
                .ok()
                .map(|s| s.trim())
                .and_then(|s| {
                    if s.starts_with("data:") && s.contains(";base64,") {
                        Some(s.to_string())
                    } else if !s.is_empty()
                        && s.chars().all(|c| {
                            c.is_ascii_alphanumeric()
                                || c == '+'
                                || c == '/'
                                || c == '='
                                || c.is_ascii_whitespace()
                        })
                        && base64::engine::general_purpose::STANDARD.decode(s).is_ok()
                    {
                        Some(format!("data:{};base64,{}", mime, s))
                    } else {
                        None
                    }
                })
                .unwrap_or_else(|| {
                    let b64 = base64::engine::general_purpose::STANDARD.encode(&data);
                    format!("data:{};base64,{}", mime, b64)
                });

            // 支持多文件同名字段（如多个 image[]）：已有同名字段时合并为数组
            if let Some(existing) = map.remove(&name) {
                let mut arr = match existing {
                    serde_json::Value::Array(a) => a,
                    v => vec![v],
                };
                arr.push(serde_json::Value::String(data_uri));
                map.insert(name, serde_json::Value::Array(arr));
            } else {
                map.insert(name, serde_json::Value::String(data_uri));
            }
        } else {
            // text 字段：尝试解析为 JSON 原始值（数值/布尔/null），失败则保留字符串
            let text = field.text().await.map_err(|e| {
                AppError::BadRequest(format!("Failed to read field '{}': {}", name, e))
            })?;
            let value = serde_json::from_str::<serde_json::Value>(&text)
                .unwrap_or(serde_json::Value::String(text));
            // 支持同名文本字段合并为数组（与文件字段合并行为一致，确保多图等场景完整保留）
            if let Some(existing) = map.remove(&name) {
                let mut arr = match existing {
                    serde_json::Value::Array(a) => a,
                    v => vec![v],
                };
                arr.push(value);
                map.insert(name, serde_json::Value::Array(arr));
            } else {
                map.insert(name, value);
            }
        }
    }
    Ok(serde_json::Value::Object(map))
}

pub async fn image_generations(
    State(state): State<Arc<AppState>>,
    Extension(token): Extension<ApiToken>,
    axum::extract::OriginalUri(uri): axum::extract::OriginalUri,
    request: axum::http::Request<axum::body::Body>,
) -> AppResult<Response> {
    let raw_path = uri.path();
    // 归一化：可灵原生图片路径统一到 /v1/images/generations（匹配转发规则）
    let request_path = if raw_path.contains("omni-image")
        || raw_path.contains("multi-image2image")
        || raw_path.contains("edits")
    {
        "/v1/images/generations"
    } else {
        raw_path
    };

    // 根据 Content-Type 统一解析请求体为 JSON（兼容 application/json 和 multipart/form-data）
    let x_log_id = request
        .headers()
        .get("x-log-id")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    let is_multipart = request
        .headers()
        .get(axum::http::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|ct| ct.contains("multipart/form-data"))
        .unwrap_or(false);
    let body: serde_json::Value = if is_multipart {
        let (parts, body) = request.into_parts();
        parse_multipart_to_json(state.clone(), parts, body).await?
    } else {
        let bytes = axum::body::to_bytes(request.into_body(), 50 * 1024 * 1024)
            .await
            .map_err(|e| AppError::BadRequest(format!("Failed to read request body: {}", e)))?;
        serde_json::from_slice(&bytes)
            .map_err(|e| AppError::BadRequest(format!("Invalid JSON: {}", e)))?
    };

    let request_content_str = serde_json::to_string(&body).unwrap_or_default();
    let model = body["model"]
        .as_str()
        .or_else(|| body["model_name"].as_str())
        .ok_or_else(|| AppError::BadRequest("Missing required parameter: model".to_string()))?;
    // 1. Token 模型权限校验（渠道选择前快速拦截）
    proxy::check_model_permission(&state, &token, model, request_path, Some("图片")).await?;

    let ctx = proxy::get_user_context(&state, &token.user_id).await?;

    // 2. 渠道选择 + HA failover（仅插件开且令牌 HA 开才切换）
    let mut ha = crate::relay::ha::HaAttempt::begin(&state, token.high_availability).await;

    while ha.cont() {
        let start_time = std::time::Instant::now();
        let channel = match proxy::select_channel_for_model(
            &state,
            &token,
            model,
            &ctx.user_group,
            &ctx.level_id,
            request_path,
            &ha.exclude_aids,
            !ha.had_upstream,
            Some("图片"),
        )
        .await
        {
            Ok(c) => c,
            Err(e) => {
                // 已有上游错误则保留上游文案；否则 e 已按 log_miss 落库（No available channels）
                ha.on_select_err(e);
                break;
            }
        };

        // 3. 预扣费检查（带 channel 精确匹配同名模型的预扣费金额，同时获取 Model 供下游复用）
        // 余额不足等不可 failover，必须 break（不可 ? 直接退出 HA 环，以免跳过 finish_err）
        let (pre_deduction, db_model, resolved_cat) =
            match proxy::check_access(&state, &token, model, &ctx, Some("图片"), Some(&channel))
                .await
            {
                Ok(v) => v,
                Err(e) => {
                    ha.on_access_err(e);
                    break;
                }
            };

        // 模型表别名映射：渠道无映射时回落到 db_model.model_id_alias
        let (resolved_model, mapping_source) =
            router::resolve_model(&channel, model, db_model.as_ref());

        let is_stream = body["stream"].as_bool().unwrap_or(false);

        // 解析转发规则（复用 db_model 避免重查 models 表）
        let mut resolved = match forward::resolve_forward_rule(
            &state,
            model,
            &resolved_cat,
            request_path,
            Some(&channel),
            db_model.as_ref(),
        )
        .await
        {
            Some(r) => r,
            None => {
                if forward::model_has_forward_rules(&state, model).await {
                    return Err(AppError::BadRequest(format!(
                        "模型 '{}' 不支持当前接口，请检查模型对应的转发规则",
                        model
                    )));
                }
                forward::infer_forward_from_base_url(
                    &channel.base_url,
                    &resolved_cat,
                    db_model.as_ref(),
                )
            }
        };
        // 根据渠道 base_url 修正 target_type（如 APIMart 需从 "openai" 覆盖为 "apimart"）
        forward::refine_target_type(&mut resolved, &channel.base_url);

        // 如果转发规则类型为 gpt, openai 或 apimart，上游路径直接与用户请求路径保持一致
        if resolved.target_type == "gpt"
            || resolved.target_type == "openai"
            || resolved.target_type == "apimart"
        {
            resolved.upstream_path = raw_path.to_string();
        }

        // 查询计费规则（供 spawn 内计费阶段使用）
        let mut db_rule =
            proxy::get_model_billing_rule(&state, model, Some(&channel), db_model.as_ref()).await;

        // 【一条日志原则】在耗时的参数转换（含图片下载转 base64）之前预记录日志，用户立即可见"处理中"状态
        let ep = format!(
            "{}|{}",
            raw_path,
            resolved.upstream_path.replace("${model}", &resolved_model)
        );
        let initial_url = forward::build_upstream_url(
            &channel.base_url,
            &resolved,
            &resolved_model,
            &channel.api_key,
        );
        if ha.pending_log_id.is_none() {
            ha.pending_log_id = proxy::record_pending_log(proxy::PendingLog {
                state: &state,
                user_id: &token.user_id,
                token_id: token.id,
                model: model,
                endpoint: &ep,
                is_stream: if is_stream { 1 } else { 0 },
                request_content: Some(&request_content_str),
                upstream_url: Some(&initial_url),
                channel: &channel,
                billing_model_hint: None,
                plugin_tag: None,
                category: Some(resolved_cat.as_str()),
                db_model: db_model.as_ref(),
                forward_eid: Some(&resolved.eid),
                requested_log_id: x_log_id.as_deref(),
            })
            .await;
        }

        // 【连接保护】将参数转换（含图片下载）+上游请求+处理+计费放入独立 task，客户端断开后仍能完成
        let model = model.to_string();
        let raw_path = raw_path.to_string();
        let pending_log_id = ha.pending_log_id;
        let (result_tx, result_rx) = tokio::sync::oneshot::channel::<Result<Response, AppError>>();
        let state_c = state.clone();
        let token_c = token.clone();
        let channel_c = channel.clone();
        let model_c = model.clone();
        let request_content_str_c = request_content_str.clone();
        let body_c = body.clone();
        let ctx_role_c = ctx.role.clone();
        let ctx_model_discounts_c = ctx.model_discounts.clone();
        let ctx_discount_c = ctx.discount;

        tokio::spawn(async move {
            let state = state_c;
            let token = token_c;
            let channel = channel_c;
            let model = model_c;
            let request_content_str = request_content_str_c;
            let body = body_c;
            let ctx_role = ctx_role_c;
            let ctx_model_discounts = ctx_model_discounts_c;
            let ctx_discount = ctx_discount_c;
            let result: Result<Response, AppError> = async {
                // 参数转换（含图片并发下载转 base64，耗时操作）
                let mut upstream_body: serde_json::Value = forward::transform_request_body(&resolved, &resolved_model, &body, &resolved_cat, db_rule.as_ref(), Some(&state.http_client)).await;
                // 可灵动态路径：根据请求体内容调整实际端点（generations/multi-image2image）
                forward::resolve_kling_dynamic_path(&mut resolved, &upstream_body);
                let url = forward::build_upstream_url(&channel.base_url, &resolved, &resolved_model, &channel.api_key);
                // 动态路径可能变更（可灵/GPT），重建 ep 确保计费日志 endpoint 准确
                let ep = format!("{}|{}", raw_path, resolved.upstream_path.replace("${model}", &resolved_model));
                // 实际发起前打一条脱敏上游地址（证明图片入口 → 厂商官方路由）
                tracing::info!(
                    "[Image→Upstream] entry={}, target_type={}, upstream_url={}",
                    raw_path,
                    resolved.target_type,
                    forward::mask_key_in_string(&url, &channel.api_key)
                );

                // 构建并发送上游请求
                // multipart 转发条件：客户端发来 multipart 或 GPT 图片有图片输入（edits 端点要求 multipart/form-data）
                let use_multipart = is_multipart
                    || (resolved.target_type == "gpt" && forward::has_image_inputs(&body));
                let builder = if use_multipart {
                    let auth_headers = forward::build_auth_headers(&resolved, &channel.api_key);
                    let mut b = state.http_client.post(&url);
                    for (k, v) in &auth_headers {
                        b = b.header(k, v);
                    }
                    let form = forward::build_edits_multipart(Some(&state.http_client), &upstream_body).await;
                    b.multipart(form)
                } else {
                    let b = state.http_client.post(&url)
                        .header("Content-Type", "application/json");
                    forward::apply_request_auth(b, &resolved, &channel.api_key, &mut upstream_body, &channel.base_url)
                };
                let upstream_resp = match builder.send().await {
                    Ok(resp) => resp,
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
                            is_stream: 0,
                            request_content: Some(request_content_str.clone()),
                            response_content: Some(err_msg.clone()),
                            upstream_req_content: Some(upstream_body.to_string()),
                            billing_detail: None,
                            hint_category: Some(resolved_cat.as_str()),
                            pending_log_id: pending_log_id,
                            billing_model_hint: None,
                            plugin_tag: None,
                            db_model: db_model.as_ref(),
                        }).await;
                        return Err(proxy::upstream_fail(502, &err_msg));
                    }
                };

                let status = upstream_resp.status().as_u16();
                if !upstream_resp.status().is_success() {
                    let err = upstream_resp.text().await.unwrap_or_default();
                    let display_err = proxy::upstream_error_text(status, &err);
                    let latency_ms = start_time.elapsed().as_millis() as u32;
                    tracing::info!("image post提交失败  {}", display_err);
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
                        is_stream: 0,
                        request_content: Some(request_content_str.clone()),
                        response_content: Some(err),
                        upstream_req_content: Some(upstream_body.to_string()),
                        billing_detail: None,
                        hint_category: Some(resolved_cat.as_str()),
                        pending_log_id: pending_log_id,
                        billing_model_hint: None,
                        plugin_tag: None,
                        db_model: db_model.as_ref(),
                    }).await;
                    return Err(proxy::upstream_fail(status, &display_err));
                }
                let model = &model;

                // 流式判定（读 header 不消费 body）
                let is_upstream_stream = upstream_resp.headers()
                    .get("content-type")
                    .and_then(|v| v.to_str().ok())
                    .map(|s| s.contains("text/event-stream"))
                    .unwrap_or(false);

                if is_stream || is_upstream_stream {
                    // 流式响应：无法预读 body，先预扣费再交给流处理器
                    let pre_deduct_gift = proxy::pre_deduct_or_intercept(
                        &state, &token, &channel, model, pre_deduction, &ep,
                        start_time, 0, &request_content_str, &upstream_body.to_string(),
                        None, pending_log_id, db_model.as_ref(), &ctx_role, Some(resolved_cat.as_str()),
                    ).await?;

                    tracing::info!("[Image] model={}, path=STREAM (is_stream={}, is_upstream_stream={})", model, is_stream, is_upstream_stream);
                    Ok(crate::relay::stream::handle_image_stream(
                        state, token, channel, model.to_string(), upstream_resp,
                        ctx_discount, ctx_model_discounts.clone(), request_content_str, start_time,
                        resolved.upstream_path.replace("${model}", &resolved_model),
                        Some(upstream_body.to_string()),
                        pre_deduction,
                        pre_deduct_gift,
                        raw_path.to_string(),
                        None,
                        pending_log_id,
                        db_model,
                        db_rule,
                    ).await.into_response())
                } else {
                    // 非流式：先读 body → 检测业务级错误 → 通过后才预扣费
                    let data = upstream_resp.bytes().await.unwrap_or_default();
                    let mut response_content_str = String::from_utf8_lossy(&data).to_string();

                    // 上游 body 级错误检测（腾讯云/即梦等 HTTP 200 但业务失败，在预扣费之前拦截）
                    let (converted, post_err) = forward::check_upstream_post_error(
                        &resolved.target_type, &response_content_str, resolved_cat.as_str(),
                        crate::relay::response_formatter::is_openai_compatible_path(&raw_path) && body.get("model_name").is_none()
                    );
                    response_content_str = converted;
                    if let Some(err_response) = post_err {
                        let latency_ms = start_time.elapsed().as_millis() as u32;
                        let err_text = proxy::extract_error_message(&response_content_str);
                        let err_status = proxy::infer_error_status_code_from_str(&response_content_str);
                        proxy::record_and_bill_inner(proxy::BillRecord {
                            state: &state,
                            token: &token,
                            channel: &channel,
                            model: model,
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
                            request_content: Some(request_content_str),
                            response_content: Some(response_content_str),
                            upstream_req_content: Some(upstream_body.to_string()),
                            billing_detail: Some("请求失败".to_string()),
                            hint_category: Some(resolved_cat.as_str()),
                            pending_log_id: pending_log_id,
                            billing_model_hint: None,
                            plugin_tag: None,
                            db_model: db_model.as_ref(),
                        }).await;
                        // 返回 Err 以进入外环 HA failover（不可用 Ok(400) 伪装成功）
                        return Err(proxy::upstream_fail(err_status, &err_response));
                    }

                    let pre_deduct_gift = proxy::pre_deduct_or_intercept(
                        &state, &token, &channel, model, pre_deduction, &ep,
                        start_time, 0, &request_content_str, &upstream_body.to_string(),
                        None, pending_log_id, db_model.as_ref(), &ctx_role, Some(resolved_cat.as_str()),
                    ).await?;

                    let resp_json: serde_json::Value = serde_json::from_str(&response_content_str).unwrap_or(serde_json::json!({}));

                    // 异步任务判定：直接提取 task_id，非空即有异步任务（省去 has_task_id 的二次遍历）
                    let task_id_str = crate::relay::response_formatter::find_id(&resp_json);
                    let has_task_id = !task_id_str.is_empty();

                    // 异步任务路由策略（图片）：
                    // OpenAI 兼容模式（请求体含 model 参数）：
                    //   1. 无 poll_path + 有 task_id → 同步轮询到终态再返回
                    //   2. 有 poll_path + 有 task_id → 走异步冻结通道
                    //   3. 无 task_id → 直接同步返回
                    // 官方模式（请求体含 model_name，如可灵等）：保持原有行为不变
                    let mut is_async = false;
                    let is_openai_compat = body.get("model_name").is_none();

                    if is_openai_compat {
                        if has_task_id && resolved.poll_path.is_none() {
                            // OpenAI 兼容 + 无 poll_path：同步轮询直到获取终态
                            // task_id 已在上方通过 find_id 提取，直接复用
                            let tid = &task_id_str;
                            tracing::info!("[Image] model={}, path=SYNC_POLL, target_type={}, task_id={}", model, resolved.target_type, tid);

                            // 轮询上下文：即梦等厂商需要原始请求内容来组装 req_json（如 return_url）
                            let upstream_body_str = serde_json::to_string(&upstream_body).unwrap_or_default();
                            let jimeng_ctx = if resolved.target_type.starts_with("jimeng_") {
                                Some((upstream_body_str.as_str(), request_content_str.as_str()))
                            } else { None };

                            match super::task::poll_task_result(
                                &state.http_client, &channel, &resolved, tid, &resolved_model, &resolved_cat, 1800, jimeng_ctx,
                            ).await {
                                Some((success_body, status)) if status == "succeeded" => {
                                    tracing::info!("[Image SYNC_POLL] model={}, task_id={}, status=succeeded, resp_len={}",
                                        model, tid, success_body.len());
                                    response_content_str = success_body;
                                }
                                Some((fail_body, _)) => {
                                    let poll_json: serde_json::Value = serde_json::from_str(&fail_body).unwrap_or(serde_json::json!({}));
                                    let err_msg = crate::relay::response_formatter::extract_error_message(&poll_json);
                                    tracing::warn!("[Image SYNC_POLL] model={}, task_id={}, status=failed, error={}", model, tid, err_msg);
                                    let latency_ms = start_time.elapsed().as_millis() as u32;
                                    let billing_detail = if pre_deduction > 0.0 {
                                        "同步轮询任务失败，预扣费已退回".to_string()
                                    } else {
                                        "同步轮询任务失败".to_string()
                                    };
                                    let status_code = proxy::infer_error_status_code(&poll_json);
                                    proxy::record_and_bill_inner(proxy::BillRecord {
                                        state: &state,
                                        token: &token,
                                        channel: &channel,
                                        model: model,
                                        prompt_tokens: 0,
                                        completion_tokens: 0,
                                        cached_tokens: 0,
                                        cost: 0.0,
                                        pre_deducted: pre_deduction,
                                        pre_deduct_gift: pre_deduct_gift,
                                        status_code: status_code,
                                        endpoint: &ep,
                                        error_msg: Some(&err_msg),
                                        latency_ms: latency_ms,
                                        is_stream: 0,
                                        request_content: Some(request_content_str),
                                        response_content: Some(fail_body),
                                        upstream_req_content: Some(upstream_body.to_string()),
                                        billing_detail: Some(billing_detail),
                                        hint_category: Some(resolved_cat.as_str()),
                                        pending_log_id: pending_log_id,
                                        billing_model_hint: None,
                                        plugin_tag: None,
                                        db_model: db_model.as_ref(),
                                    }).await;
                                    return Err(proxy::upstream_fail(status_code, &err_msg));
                                }
                                None => {
                                    tracing::warn!("[Image SYNC_POLL] model={}, task_id={}, status=timeout", model, tid);
                                    let err_msg = format!("任务处理超时，请稍后查询结果，任务ID: {}", tid);
                                    let latency_ms = start_time.elapsed().as_millis() as u32;
                                    let billing_detail = if pre_deduction > 0.0 {
                                        "同步轮询超时，预扣费已退回".to_string()
                                    } else {
                                        "同步轮询超时".to_string()
                                    };
                                    let status_code = proxy::infer_error_status_code_from_str(&err_msg);
                                    proxy::record_and_bill_inner(proxy::BillRecord {
                                        state: &state,
                                        token: &token,
                                        channel: &channel,
                                        model: model,
                                        prompt_tokens: 0,
                                        completion_tokens: 0,
                                        cached_tokens: 0,
                                        cost: 0.0,
                                        pre_deducted: pre_deduction,
                                        pre_deduct_gift: pre_deduct_gift,
                                        status_code: status_code,
                                        endpoint: &ep,
                                        error_msg: Some(&err_msg),
                                        latency_ms: latency_ms,
                                        is_stream: 0,
                                        request_content: Some(request_content_str),
                                        response_content: Some(response_content_str),
                                        upstream_req_content: Some(upstream_body.to_string()),
                                        billing_detail: Some(billing_detail),
                                        hint_category: Some(resolved_cat.as_str()),
                                        pending_log_id: pending_log_id,
                                        billing_model_hint: None,
                                        plugin_tag: None,
                                        db_model: db_model.as_ref(),
                                    }).await;
                                    return Err(proxy::upstream_fail(status_code, &err_msg));
                                }
                            }
                        } else if has_task_id && resolved.poll_path.is_some() {
                            // OpenAI 兼容 + 有 poll_path + 有 task_id → 异步冻结
                            is_async = true;
                        }
                        // OpenAI 兼容 + 无 task_id → is_async 保持 false，直接同步返回
                    } else if has_task_id {
                        // 官方模式（model_name）：保持原有行为，有 task_id 就走异步冻结
                        is_async = true;
                    }

                    let latency_ms = start_time.elapsed().as_millis() as u32;

                    // 渠道 TOS 存储：在日志记录之前对原始响应做 URL/base64 替换，确保日志中的地址与最终返回一致
                    let rf = body.get("response_format").and_then(|v| v.as_str());
                    let response_content_str = if let Some(days) = channel.tos_storage() {
                        super::tos_persist::persist_response_resources(
                            &state, &response_content_str, channel.id, days, rf, Some("image"),
                        ).await
                    } else {
                        response_content_str
                    };

                    if is_async {
                        tracing::info!("[Image] model={}, path=ASYNC_SUBMIT, pre_deduction={}", model, pre_deduction);
                        let billing_detail = if pre_deduction > 0.0 {
                            "异步任务预扣费冻结".to_string()
                        } else {
                            "异步任务处理中(冻结)".to_string()
                        };
                        proxy::record_and_bill_inner(proxy::BillRecord {
                            state: &state,
                            token: &token,
                            channel: &channel,
                            model: model,
                            prompt_tokens: 0,
                            completion_tokens: 0,
                            cached_tokens: 0,
                            cost: pre_deduction,
                            pre_deducted: pre_deduction,
                            pre_deduct_gift: pre_deduct_gift,
                            status_code: 200,
                            endpoint: &ep,
                            error_msg: None,
                            latency_ms: latency_ms,
                            is_stream: 0,
                            request_content: Some(request_content_str),
                            response_content: Some(response_content_str.clone()),
                            upstream_req_content: Some(upstream_body.to_string()),
                            billing_detail: Some(billing_detail),
                            hint_category: Some(resolved_cat.as_str()),
                            pending_log_id: pending_log_id,
                            billing_model_hint: None,
                            plugin_tag: None,
                            db_model: db_model.as_ref(),
                        }).await;

                        // 即梦异步任务：将轮询关键参数写入 plugin_tag，确保 enable_log=0 时后续轮询仍能正确组装请求
                        // （req_key 和用户参数不受上下文记录开关影响，plugin_tag 独立于 enable_log）
                        if resolved.target_type.starts_with("jimeng_") {
                            if let Some(log_id) = pending_log_id {
                                let req_key = upstream_body.get("req_key").and_then(|v| v.as_str()).unwrap_or(model);
                                let response_format = body.get("response_format").and_then(|v| v.as_str()).unwrap_or("url");
                                let watermark = body.get("watermark").and_then(|v| v.as_bool()).unwrap_or(false);
                                let poll_ctx = serde_json::json!({
                                    "jimeng_poll": { "req_key": req_key, "response_format": response_format, "watermark": watermark }
                                });
                                let _ = sqlx::query(&state.db.format_query(
                                    "UPDATE logs SET plugin_tag = ? WHERE id = ?"
                                )).bind(poll_ctx.to_string()).bind(log_id).execute(&state.db.pool).await;
                            }
                        }
                    } else {
                        // 同步成功路径：无有效图片 → 记失败不扣费，Err 触发 HA
                        let resp_image_count = crate::relay::usage_extractor::count_response_images(&response_content_str);
                        if resp_image_count.unwrap_or(0) <= 0 {
                            let err_msg = "上游返回空响应或无有效图片";
                            tracing::warn!("[Image SYNC] model={}, empty/no-image response, len={}, images={:?}",
                                model, response_content_str.len(), resp_image_count);
                            let billing_detail = if pre_deduction > 0.0 {
                                "同步空响应，预扣费已退回".to_string()
                            } else {
                                "同步空响应".to_string()
                            };
                            proxy::record_and_bill_inner(proxy::BillRecord {
                                state: &state,
                                token: &token,
                                channel: &channel,
                                model: model,
                                prompt_tokens: 0,
                                completion_tokens: 0,
                                cached_tokens: 0,
                                cost: 0.0,
                                pre_deducted: pre_deduction,
                                pre_deduct_gift: pre_deduct_gift,
                                status_code: 502,
                                endpoint: &ep,
                                error_msg: Some(err_msg),
                                latency_ms: latency_ms,
                                is_stream: 0,
                                request_content: Some(request_content_str),
                                response_content: Some(response_content_str),
                                upstream_req_content: Some(upstream_body.to_string()),
                                billing_detail: Some(billing_detail),
                                hint_category: Some(resolved_cat.as_str()),
                                pending_log_id: pending_log_id,
                                billing_model_hint: None,
                                plugin_tag: None,
                                db_model: db_model.as_ref(),
                            }).await;
                            return Err(proxy::upstream_fail(502, err_msg));
                        }

                        let usage_tokens = crate::relay::usage_extractor::parse_usage(&response_content_str);
                        let p_tokens = usage_tokens.prompt;
                        let c_tokens = usage_tokens.completion;

                        tracing::info!("[Image] model={}, path=SYNC, prompt={}, completion={}, total={}", model, p_tokens, c_tokens, usage_tokens.total);

                        let mut features = crate::relay::usage_extractor::extract_request_features(&body);
                        // 优化与精简：合并转发阶段上游请求体中的计费特征（保障同步与异步结算的一致性，防范分辨率等特征丢失）
                        let upstream_features = crate::relay::usage_extractor::extract_request_features(&upstream_body);
                        features.merge(upstream_features);

                        // 从响应中提取最新计费特征（如火山图片的 input_images 和 data.0.size）
                        if let Ok(resp_json) = serde_json::from_str::<serde_json::Value>(&response_content_str) {
                            let resp_features = crate::relay::usage_extractor::extract_request_features(&resp_json);
                            features.merge(resp_features);
                        }

                        // 用响应中的实际图片数量覆盖请求体的 n 值（按张计费的最终依据）
                        if let Some(resp_count) = resp_image_count {
                            features.image_count = Some(resp_count);
                        }
                        tracing::info!("[Image SYNC] model={}, tokens={}+{}={}, images={:?}, latency={}ms",
                            model, p_tokens, c_tokens, usage_tokens.total, resp_image_count, latency_ms);
                        let (c, d) = crate::relay::calculate_relay_cost(
                            &state,
                            db_model.as_ref(),
                            db_rule.as_mut(),
                            &channel,
                            ctx_discount,
                            &ctx_model_discounts,
                            &usage_tokens,
                            &features,
                            mapping_source.as_deref(),
                            &model,
                            &resolved_model,
                        ).await;

                        proxy::record_and_bill_inner(proxy::BillRecord {
                            state: &state,
                            token: &token,
                            channel: &channel,
                            model: model,
                            prompt_tokens: p_tokens,
                            completion_tokens: c_tokens,
                            cached_tokens: 0,
                            cost: c,
                            pre_deducted: pre_deduction,
                            pre_deduct_gift: pre_deduct_gift,
                            status_code: 200,
                            endpoint: &ep,
                            error_msg: None,
                            latency_ms: latency_ms,
                            is_stream: 0,
                            request_content: Some(request_content_str),
                            response_content: Some(response_content_str.clone()),
                            upstream_req_content: Some(upstream_body.to_string()),
                            billing_detail: Some(d),
                            hint_category: Some(resolved_cat.as_str()),
                            pending_log_id: pending_log_id,
                            billing_model_hint: None,
                            plugin_tag: None,
                            db_model: db_model.as_ref(),
                        }).await;

                        // record_and_bill_inner 内部 find_id 无法提取，需补写 task_id 到日志，比如即梦模型就是这样
                        if !task_id_str.is_empty() {
                            if let Some(log_id) = pending_log_id {
                                let _ = sqlx::query(&state.db.format_query("UPDATE logs SET task_id = ? WHERE id = ? AND (task_id IS NULL OR task_id = '')"))
                                    .bind(&task_id_str).bind(log_id)
                                    .execute(&state.db.pool).await;
                            }
                        }
                    }

                    let mut sys_log_id: Option<String> = None;
                    if task_id_str.is_empty() {
                        if let Some(id) = pending_log_id {
                            sys_log_id = sqlx::query_scalar(&state.db.format_query("SELECT log_id FROM logs WHERE id = ?"))
                                .bind(id)
                                .fetch_optional(&state.db.pool)
                                .await
                                .unwrap_or(None);
                        }
                    }

                    // 可灵原生请求含 model_name 参数，响应直接透传；其他走 apply_format 统一转换
                    let final_response_str = if body.get("model_name").is_some() {
                        response_content_str
                    } else {
                        let fallback_id = if task_id_str.is_empty() { sys_log_id.as_deref() } else { Some(task_id_str.as_str()) };
                        crate::relay::response_formatter::apply_format(
                            &state.db.pool, &raw_path, &resolved_cat, &response_content_str, is_async, fallback_id
                        ).await
                    };

                    // 双向响应格式统一对齐
                    let final_response_str = super::tos_persist::align_response_format(
                        &state, &final_response_str, rf
                    ).await;

                    Ok(Response::builder()
                        .header("Content-Type", "application/json")
                        .body(axum::body::Body::from(final_response_str))
                        .unwrap())
                }

            }.await; // async block end
            let _ = result_tx.send(result);
        }); // tokio::spawn end

        // 等待 spawned task 结果；若 handler 被 drop（客户端断开），task 继续运行
        match result_rx.await {
            Ok(result) => match result {
                Ok(resp) => return Ok(resp),
                Err(e) => {
                    if ha
                        .on_spawn_result_err(&state, &channel, e, Some(&initial_url))
                        .await
                    {
                        ha.bump();
                        continue;
                    }
                    break;
                }
            },
            Err(_) => {
                ha.last_err = AppError::Internal("请求处理任务异常终止".into());
                break;
            }
        }
    } // end while

    Err(ha.finish())
}
