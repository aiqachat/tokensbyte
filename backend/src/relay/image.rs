//! Relay: POST /v1/images/generations
//! OpenAI-compatible image generation endpoint with forward-rule-driven protocol adaptation.

use axum::{extract::{State, Extension}, response::{Response, IntoResponse}};
use std::sync::Arc;
use crate::{AppState, error::{AppError, AppResult}};
use crate::models::ApiToken;
use super::{proxy, forward, router};

/// 从 multipart/form-data 请求中解析字段为 JSON 对象。
/// - text 字段：尝试解析为 JSON 原始值（数值/布尔/null），失败则作为字符串
/// - file 字段（image/mask 等）：读取字节 → base64 编码 → `data:{mime};base64,{data}` 格式
async fn parse_multipart_to_json(
    state: Arc<AppState>,
    parts: axum::http::request::Parts,
    body: axum::body::Body,
) -> Result<serde_json::Value, AppError> {
    use base64::Engine;
    use axum::extract::FromRequest;
    let request = axum::http::Request::from_parts(parts, body);
    let mut multipart = axum::extract::Multipart::from_request(request, &state)
        .await
        .map_err(|e| AppError::BadRequest(format!("Failed to parse multipart: {}", e)))?;
    let mut map = serde_json::Map::new();
    while let Some(field) = multipart.next_field().await.unwrap_or(None) {
        let name = field.name().unwrap_or("").to_string();
        if name.is_empty() { continue; }
        let is_file = field.file_name().is_some();
        if is_file {
            // 文件字段：转为 base64 data URI，与 collect_image_urls 兼容
            let mime = field.content_type().unwrap_or("application/octet-stream").to_string();
            let data = field.bytes().await
                .map_err(|e| AppError::BadRequest(format!("Failed to read file field '{}': {}", name, e)))?;
            let b64 = base64::engine::general_purpose::STANDARD.encode(&data);
            let data_uri = format!("data:{};base64,{}", mime, b64);
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
            let text = field.text().await
                .map_err(|e| AppError::BadRequest(format!("Failed to read field '{}': {}", name, e)))?;
            let value = serde_json::from_str::<serde_json::Value>(&text)
                .unwrap_or(serde_json::Value::String(text));
            map.insert(name, value);
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
    let request_path = if raw_path.contains("omni-image") || raw_path.contains("multi-image2image") || raw_path.contains("edits") {
        "/v1/images/generations"
    } else {
        raw_path
    };
    let start_time = std::time::Instant::now();

    // 根据 Content-Type 统一解析请求体为 JSON（兼容 application/json 和 multipart/form-data）
    let x_log_id = request.headers().get("x-log-id").and_then(|v| v.to_str().ok()).map(|s| s.to_string());
    let is_multipart = request.headers()
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
    let model = body["model"].as_str()
        .or_else(|| body["model_name"].as_str())
        .ok_or_else(|| AppError::BadRequest(
            "Missing required parameter: model".to_string()
        ))?;
    // 1. Token 模型权限校验（渠道选择前快速拦截）
    proxy::check_model_permission(&state, &token, model, request_path).await?;

    let ctx = proxy::get_user_context(&state, &token.user_id).await?;

    // 2. 渠道选择
    let channel = proxy::select_channel_for_model(&state, &token, model, &ctx.user_group, &ctx.level_id, request_path).await?;

    // 3. 预扣费检查（带 channel 精确匹配同名模型的预扣费金额，同时获取 Model 供下游复用）
    let (pre_deduction, db_model) = proxy::check_access(&state, &token, model, &ctx, Some("图片"), Some(&channel)).await?;

    // 模型表别名映射：渠道无映射时回落到 db_model.model_id_alias
    let (resolved_model, mapping_source) = router::resolve_model(&channel, model, db_model.as_ref());

    let is_stream = body["stream"].as_bool().unwrap_or(false);
    
    // 解析转发规则（复用 db_model 避免重查 models 表）
    let mut resolved = match forward::resolve_forward_rule(&state, model, "图片", request_path, Some(&channel), db_model.as_ref()).await {
        Some(r) => r,
        None => {
            if forward::model_has_forward_rules(&state, model).await {
                return Err(AppError::BadRequest(format!(
                    "模型 '{}' 不支持当前接口，请检查模型对应的转发规则", model
                )));
            }
            forward::infer_forward_from_base_url(&channel.base_url, "图片")
        }
    };
    // 根据渠道 base_url 修正 target_type（如 APIMart 需从 "openai" 覆盖为 "apimart"）
    forward::refine_target_type(&mut resolved, &channel.base_url);

    // 查询计费规则（供 spawn 内计费阶段使用）
    let db_rule = proxy::get_model_billing_rule(&state, model, Some(&channel), db_model.as_ref()).await;

    // 【一条日志原则】在耗时的参数转换（含图片下载转 base64）之前预记录日志，用户立即可见"处理中"状态
    let ep = format!("{}|{}", raw_path, resolved.upstream_path.replace("${model}", &resolved_model));
    let initial_url = forward::build_upstream_url(&channel.base_url, &resolved, &resolved_model, &channel.api_key);
    tracing::info!("[Image] model={}, target_type={}, url={}", model, resolved.target_type, initial_url);
    let pending_log_id = proxy::record_pending_log(
        &state, &token.user_id, channel.id, token.id, model, &ep,
        if is_stream { 1 } else { 0 },
        Some(&request_content_str),
        Some(&initial_url), Some(&channel),
        None, None,
        Some("图片"),
        db_model.as_ref(),
        Some(&resolved.eid),
        x_log_id.as_deref(),
    ).await;

    // 【连接保护】将参数转换（含图片下载）+上游请求+处理+计费放入独立 task，客户端断开后仍能完成
    let model = model.to_string();
    let raw_path = raw_path.to_string();
    let (result_tx, result_rx) = tokio::sync::oneshot::channel::<Result<Response, AppError>>();
    tokio::spawn(async move {
        let result: Result<Response, AppError> = async {
            // 参数转换（含图片并发下载转 base64，耗时操作）
            let mut upstream_body: serde_json::Value = forward::transform_request_body(&resolved, &resolved_model, &body, "图片", db_rule.as_ref(), Some(&state.http_client)).await;
            // 可灵动态路径：根据请求体内容调整实际端点（generations/multi-image2image）
            forward::resolve_kling_dynamic_path(&mut resolved, &upstream_body);
            // GPT 官方图片动态路径：根据请求体是否含参考图选择 generations 或 edits 端点
            forward::resolve_gpt_image_path(&mut resolved, &body);
            let url = forward::build_upstream_url(&channel.base_url, &resolved, &resolved_model, &channel.api_key);
            // 动态路径可能变更（可灵/GPT），重建 ep 确保计费日志 endpoint 准确
            let ep = format!("{}|{}", raw_path, resolved.upstream_path.replace("${model}", &resolved_model));

            // 构建并发送上游请求（统一鉴权 + JSON 请求体）
            let builder = state.http_client.post(&url)
                .header("Content-Type", "application/json");
            let builder = forward::apply_request_auth(builder, &resolved, &channel.api_key, &mut upstream_body, &channel.base_url);
            let upstream_resp = match builder.send().await {
                Ok(resp) => resp,
                Err(e) => {
                    let err_msg = e.to_string();
                    let latency_ms = start_time.elapsed().as_millis() as u32;
                    proxy::record_and_bill_inner(
                        &state, &token, channel.id, &model, 0, 0, 0, 0.0, 0.0, 0.0, 502,
                        &ep, Some(&err_msg), latency_ms, 0,
                        Some(request_content_str.clone()), Some(err_msg.clone()), Some(upstream_body.to_string()),
                        None, Some("图片"), pending_log_id, None, None, db_model.as_ref()
                    ).await;
                    return Err(AppError::UpstreamError(proxy::sanitize_error_message(&err_msg)));
                }
            };

            let status = upstream_resp.status().as_u16();
            if !upstream_resp.status().is_success() {
                let err = upstream_resp.text().await.unwrap_or_default();
                let display_err = if err.trim().is_empty() { format!("Upstream HTTP error {}", status) } else { err.clone() };
                let latency_ms = start_time.elapsed().as_millis() as u32;
                tracing::info!("image post提交失败  {}", display_err);
                proxy::record_and_bill_inner(
                    &state, &token, channel.id, &model, 0, 0, 0, 0.0, 0.0, 0.0, status,
                    &ep, Some(&display_err), latency_ms, 0,
                    Some(request_content_str.clone()), Some(err), Some(upstream_body.to_string()),
                    None, Some("图片"), pending_log_id, None, None, db_model.as_ref()
                ).await;
                return Err(AppError::UpstreamError(proxy::sanitize_error_message(&display_err)));
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
                let pre_deduct_gift = if pre_deduction > 0.0 && ctx.role != "admin" {
                    match proxy::pre_deduct(&state, &token.user_id, pre_deduction).await {
                        Ok(split) => split.gift,
                        Err(e) => {
                            let err_msg = match e {
                                sqlx::Error::RowNotFound => "余额不足".to_string(),
                                _ => format!("预扣费失败: {:?}", e),
                            };
                            tracing::error!("Pre deduction failed for {}: {:?}", token.user_id, e);
                            let latency_ms = start_time.elapsed().as_millis() as u32;
                            proxy::record_and_bill_inner(
                                &state, &token, channel.id, model, 0, 0, 0, 0.0, 0.0, 0.0, 403,
                                &ep, Some(&err_msg), latency_ms, 0,
                                Some(request_content_str.clone()), Some(err_msg.clone()), Some(upstream_body.to_string()),
                                None, Some("图片"), pending_log_id, None, None, db_model.as_ref()
                            ).await;
                            return Err(if matches!(e, sqlx::Error::RowNotFound) {
                                AppError::Forbidden("余额不足".to_string())
                            } else {
                                AppError::Internal(err_msg)
                            });
                        }
                    }
                } else { 0.0 };

                tracing::info!("[Image] model={}, path=STREAM (is_stream={}, is_upstream_stream={})", model, is_stream, is_upstream_stream);
                Ok(crate::relay::stream::handle_image_stream(
                    state, token, channel, model.to_string(), upstream_resp,
                    ctx.discount, ctx.model_discounts.clone(), request_content_str, start_time,
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
                    &resolved.target_type, &response_content_str, "image.generation"
                );
                response_content_str = converted;
                if let Some(err_response) = post_err {
                    let latency_ms = start_time.elapsed().as_millis() as u32;
                    let err_text = proxy::extract_error_message(&response_content_str);
                    let err_status = proxy::infer_error_status_code(&err_text);
                    proxy::record_and_bill_inner(&state, &token, channel.id, model, 0, 0, 0, 0.0, 0.0,
                        0.0, err_status, &ep, None, latency_ms, 0,
                        Some(request_content_str), Some(response_content_str), Some(upstream_body.to_string()),
                        Some("请求失败".to_string()), Some("图片"), pending_log_id, None, None, db_model.as_ref()).await;
                    return Ok(Response::builder().status(400)
                        .header("Content-Type", "application/json")
                        .body(axum::body::Body::from(err_response)).unwrap());
                }

                let pre_deduct_gift = if pre_deduction > 0.0 && ctx.role != "admin" {
                    match proxy::pre_deduct(&state, &token.user_id, pre_deduction).await {
                        Ok(split) => split.gift,
                        Err(e) => {
                            let err_msg = match e {
                                sqlx::Error::RowNotFound => "余额不足".to_string(),
                                _ => format!("预扣费失败: {:?}", e),
                            };
                            tracing::error!("Pre deduction failed for {}: {:?}", token.user_id, e);
                            let latency_ms = start_time.elapsed().as_millis() as u32;
                            proxy::record_and_bill_inner(
                                &state, &token, channel.id, model, 0, 0, 0, 0.0, 0.0, 0.0, 403,
                                &ep, Some(&err_msg), latency_ms, 0,
                                Some(request_content_str.clone()), Some(err_msg.clone()), Some(upstream_body.to_string()),
                                None, Some("图片"), pending_log_id, None, None, db_model.as_ref()
                            ).await;
                            return Err(if matches!(e, sqlx::Error::RowNotFound) {
                                AppError::Forbidden("余额不足".to_string())
                            } else {
                                AppError::Internal(err_msg)
                            });
                        }
                    }
                } else { 0.0 };

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
                            &state.http_client, &channel, &resolved, tid, &resolved_model, "图片", 900, jimeng_ctx,
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
                                let status_code = proxy::infer_error_status_code(&err_msg);
                                proxy::record_and_bill_inner(&state, &token, channel.id, model, 0, 0, 0, 0.0, pre_deduction,
                                    pre_deduct_gift, status_code, &ep, Some(&err_msg), latency_ms, 0,
                                    Some(request_content_str), Some(fail_body), Some(upstream_body.to_string()),
                                    Some(billing_detail), Some("图片"), pending_log_id, None, None, db_model.as_ref()).await;
                                return Err(AppError::UpstreamError(proxy::sanitize_error_message(&err_msg)));
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
                                let status_code = proxy::infer_error_status_code(&err_msg);
                                proxy::record_and_bill_inner(&state, &token, channel.id, model, 0, 0, 0, 0.0, pre_deduction,
                                    pre_deduct_gift, status_code, &ep, Some(&err_msg), latency_ms, 0,
                                    Some(request_content_str), Some(response_content_str), Some(upstream_body.to_string()),
                                    Some(billing_detail), Some("图片"), pending_log_id, None, None, db_model.as_ref()).await;
                                return Err(AppError::UpstreamError(proxy::sanitize_error_message(&err_msg)));
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
                    proxy::record_and_bill_inner(&state, &token, channel.id, model, 0, 0, 0, pre_deduction, pre_deduction,
                        pre_deduct_gift, 200,
                        &ep, None, latency_ms, 0,
                        Some(request_content_str), Some(response_content_str.clone()), Some(upstream_body.to_string()), Some(billing_detail), Some("图片"), pending_log_id, None, None, db_model.as_ref()).await;
                } else {
                    let usage_tokens = crate::relay::usage_extractor::parse_usage(&response_content_str);
                    let p_tokens = usage_tokens.prompt;
                    let c_tokens = usage_tokens.completion;

                    tracing::info!("[Image] model={}, path=SYNC, prompt={}, completion={}, total={}", model, p_tokens, c_tokens, usage_tokens.total);

                    let mut features = crate::relay::usage_extractor::extract_request_features(&body);
                    // 用响应中的实际图片数量覆盖请求体的 n 值（按张计费的最终依据）
                    let resp_image_count = crate::relay::usage_extractor::count_response_images(&response_content_str);
                    if let Some(resp_count) = resp_image_count {
                        features.image_count = Some(resp_count);
                    }
                    tracing::info!("[Image SYNC] model={}, tokens={}+{}={}, images={:?}, latency={}ms",
                        model, p_tokens, c_tokens, usage_tokens.total, resp_image_count, latency_ms);
                    // 折扣策略: MIN(用户模型折扣, 全站折扣, 等级折扣), 受折扣限价约束
                    let umd = db_model.as_ref().and_then(|m| proxy::parse_user_model_discount(&ctx.model_discounts, &m.mid));
                    let (final_discount, discount_source) = proxy::resolve_discount(db_model.as_ref(), ctx.discount, umd);

                    let is_ha_plugin_enabled = crate::api::plugins::is_plugin_enabled(&state, "high_availability_channel").await;
                    let applied_discount = if is_ha_plugin_enabled {
                        final_discount * channel.rate
                    } else {
                        final_discount
                    };

                    let (c, mut d) = crate::relay::compute_cost(db_model.as_ref(), db_rule.as_ref(), &usage_tokens, applied_discount, &features);
                    d.push_str(&format!(" | {}", discount_source));
                    if is_ha_plugin_enabled && channel.rate != 1.0 {
                        d.push_str(&format!(" | 渠道倍率: {}x", channel.rate));
                    }
                    if let Some(src) = mapping_source {
                        d.push_str(&format!(" | {}: {} ➞ {}", src, model, resolved_model));
                    }

                    proxy::record_and_bill_inner(&state, &token, channel.id, model, p_tokens, c_tokens, 0, c, pre_deduction,
                        pre_deduct_gift, 200,
                        &ep, None, latency_ms, 0,
                        Some(request_content_str), Some(response_content_str.clone()), Some(upstream_body.to_string()), Some(d), Some("图片"), pending_log_id, None, None, db_model.as_ref()).await;

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
                        &state.db.pool, &raw_path, "图片", &response_content_str, is_async, fallback_id
                    ).await
                };

                // b64_json 模式：将 OpenAI data[].url 下载转为 base64 返回
                let final_response_str = if rf == Some("b64_json") {
                    super::tos_persist::convert_openai_urls_to_b64(&state, &final_response_str).await
                } else {
                    final_response_str
                };

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
        Ok(result) => result,
        Err(_) => Err(AppError::Internal("请求处理任务异常终止".into())),
    }
}
