/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

//! Relay: 通用透传处理器
//! 处理 Embedding（向量）和 Rerank（排序）模型请求。
//! 请求体直接透传，仅替换 model 字段；响应直接返回上游 JSON。
//! 遵循与 audio.rs 一致的 7 步流水线模式。

use super::{forward, proxy, router, usage_extractor};
use crate::models::ApiToken;
use crate::{
    error::{AppError, AppResult},
    AppState,
};
use axum::{
    extract::{Extension, OriginalUri, State},
    response::Response,
    Json,
};
use std::sync::Arc;

// ── 类别推断 ────────────────────────────────────────────────────

/// 本 handler 仅服务向量/排序两类
fn infer_category(path: &str) -> &'static str {
    if path.contains("rerank") {
        "排序"
    } else {
        "向量"
    }
}

// ── 主处理函数 ──────────────────────────────────────────────────

/// 通用透传处理器 — Embedding / Rerank
pub async fn generic_relay(
    State(state): State<Arc<AppState>>,
    Extension(token): Extension<ApiToken>,
    OriginalUri(uri): OriginalUri,
    Json(body): Json<serde_json::Value>,
) -> AppResult<Response> {
    let raw_path = uri.path();
    let entry_path = raw_path.to_string();
    let category = infer_category(raw_path);
    let request_content_str = serde_json::to_string(&body).unwrap_or_default();

    let model = body["model"]
        .as_str()
        .ok_or_else(|| AppError::BadRequest("Missing required parameter: model".to_string()))?;

    // ── 1. Token 模型权限校验（渠道选择前快速拦截） ──
    proxy::check_model_permission(&state, &token, model, &entry_path, Some(category)).await?;

    // ── 2. 用户上下文 ──
    let ctx = proxy::get_user_context(&state, &token.user_id).await?;

    // ── 3. 渠道选择 + HA failover ──
    let mut ha = crate::relay::ha::HaAttempt::begin(&state, token.high_availability).await;

    while ha.cont() {
        let start_time = std::time::Instant::now();
        let channel = match proxy::select_channel_for_model(
            &state,
            &token,
            model,
            &ctx.user_group,
            &ctx.level_id,
            &entry_path,
            &ha.exclude_aids,
            !ha.had_upstream,
            Some(category),
        )
        .await
        {
            Ok(c) => c,
            Err(e) => {
                ha.on_select_err(e);
                break;
            }
        };

        // ── 4. 预扣费检查 ──
        let (pre_deduction, db_model, resolved_cat) =
            match proxy::check_access(&state, &token, model, &ctx, Some(category), Some(&channel))
                .await
            {
                Ok(v) => v,
                Err(e) => {
                    ha.on_access_err(e);
                    break;
                }
            };

        // ── 5. 转发规则解析 ──
        let mut resolved = match forward::resolve_forward_rule(
            &state,
            model,
            &resolved_cat,
            &entry_path,
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
        forward::refine_target_type(&mut resolved, &channel.base_url);

        // 模型映射：渠道内部映射 + 模型表别名映射
        let (final_resolved_model, mapping_source) =
            router::resolve_model(&channel, model, db_model.as_ref());

        // 查询计费规则（供计费阶段使用）
        let mut db_rule =
            proxy::get_model_billing_rule(&state, model, Some(&channel), db_model.as_ref()).await;

        // ── 6. 请求体透传（仅替换 model 字段） ──
        let mut upstream_body = body.clone();
        upstream_body["model"] = serde_json::json!(&final_resolved_model);

        let url = forward::build_upstream_url(
            &channel.base_url,
            &resolved,
            &final_resolved_model,
            &channel.api_key,
        );

        // 【一条日志原则】请求前预记录日志
        let ep = format!(
            "{}|{}",
            raw_path,
            resolved
                .upstream_path
                .replace("${model}", &final_resolved_model)
        );

        tracing::info!(
            "[Generic] model={}, category={}, target_type={}, url={}",
            model,
            category,
            resolved.target_type,
            url
        );

        if ha.pending_log_id.is_none() {
            ha.pending_log_id = proxy::record_pending_log(proxy::PendingLog {
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
                category: Some(resolved_cat.as_str()),
                db_model: db_model.as_ref(),
                forward_eid: Some(&resolved.eid),
                requested_log_id: None,
            })
            .await;
        }

        // ── 7. 上游请求 → 响应处理 → 计费结算 ──
        // 【连接保护】将上游请求+预扣费+日志记录放入独立 task，客户端断开后仍能完成
        let model = model.to_string();
        let pending_log_id = ha.pending_log_id;
        let (result_tx, result_rx) = tokio::sync::oneshot::channel::<Result<Response, AppError>>();
        let state_c = state.clone();
        let token_c = token.clone();
        let channel_c = channel.clone();
        let model_c = model.clone();
        let request_content_str_c = request_content_str.clone();
        let ctx_role_c = ctx.role.clone();
        let ctx_model_discounts_c = ctx.model_discounts.clone();
        let url_c = url.clone();

        tokio::spawn(async move {
            let state = state_c;
            let token = token_c;
            let channel = channel_c;
            let model = model_c;
            let request_content_str = request_content_str_c;
            let ctx_role = ctx_role_c;
            let ctx_model_discounts = ctx_model_discounts_c;
            let url = url_c;
            let result: Result<Response, AppError> = async {
                // 执行预扣费（管理员跳过）
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
                    &upstream_body.to_string(),
                    None,
                    pending_log_id,
                    db_model.as_ref(),
                    &ctx_role,
                    Some(resolved_cat.as_str()),
                )
                .await?;

                // 构建并发送上游请求（统一鉴权 + 设置请求体）
                let builder = state
                    .http_client
                    .post(&url)
                    .header("Content-Type", "application/json");
                let builder = forward::apply_request_auth(
                    builder,
                    &resolved,
                    &channel.api_key,
                    &mut upstream_body,
                    &channel.base_url,
                );
                let resp = match builder.send().await {
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
                            pre_deducted: pre_deduction,
                            pre_deduct_gift: pre_deduct_gift,
                            status_code: 502,
                            endpoint: &ep,
                            error_msg: Some(&err_msg),
                            latency_ms: latency_ms,
                            is_stream: 0,
                            request_content: Some(request_content_str.clone()),
                            response_content: Some(err_msg.clone()),
                            upstream_req_content: Some(upstream_body.to_string()),
                            billing_detail: None,
                            hint_category: Some(category),
                            pending_log_id: pending_log_id,
                            billing_model_hint: None,
                            plugin_tag: None,
                            db_model: db_model.as_ref(),
                        })
                        .await;
                        return Err(proxy::upstream_fail(502, &err_msg));
                    }
                };

                let status = resp.status().as_u16();
                if !resp.status().is_success() {
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
                        pre_deducted: pre_deduction,
                        pre_deduct_gift: pre_deduct_gift,
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
                    })
                    .await;
                    return Err(proxy::upstream_fail(status, &display_err));
                }

                // 读取响应体文本
                let mut resp_text = resp.text().await.unwrap_or_default();

                // 上游 body 级错误检测（HTTP 200 但业务失败，在预扣费之前拦截）
                let (converted, post_err) = forward::check_upstream_post_error(
                    &resolved.target_type,
                    &resp_text,
                    resolved_cat.as_str(),
                    false,
                );
                resp_text = converted;
                if let Some(err_response) = post_err {
                    let latency_ms = start_time.elapsed().as_millis() as u32;
                    let err_text = proxy::extract_error_message(&resp_text);
                    let err_status = proxy::infer_error_status_code_from_str(&resp_text);
                    proxy::record_and_bill_inner(proxy::BillRecord {
                        state: &state,
                        token: &token,
                        channel: &channel,
                        model: &model,
                        prompt_tokens: 0,
                        completion_tokens: 0,
                        cached_tokens: 0,
                        cost: 0.0,
                        pre_deducted: pre_deduction,
                        pre_deduct_gift: pre_deduct_gift,
                        status_code: err_status,
                        endpoint: &ep,
                        error_msg: Some(&err_text),
                        latency_ms: latency_ms,
                        is_stream: 0,
                        request_content: Some(request_content_str.clone()),
                        response_content: Some(resp_text.clone()),
                        upstream_req_content: Some(upstream_body.to_string()),
                        billing_detail: None,
                        hint_category: Some(resolved_cat.as_str()),
                        pending_log_id: pending_log_id,
                        billing_model_hint: None,
                        plugin_tag: None,
                        db_model: db_model.as_ref(),
                    })
                    .await;
                    return Err(proxy::upstream_fail(err_status, &err_response));
                }

                // 提取 usage tokens
                let mut usage = usage_extractor::parse_usage(&resp_text);
                // 关键修正：部分 rerank 模型（如阿里 qwen3-vl-rerank）返回的 total_tokens 大于 input_tokens，
                // 或部分模型仅返回 total_tokens。为确保以 total_tokens 作为总消耗准确计费，
                // 当 total 大于 prompt、completion 与 image_tokens 之和时，将差额统一补入 prompt 用量中。
                if usage.total > 0
                    && usage.total > usage.prompt + usage.completion + usage.image_tokens
                {
                    usage.prompt = usage.total - usage.completion - usage.image_tokens;
                }

                // ── 计费结算 ──
                let latency_ms = start_time.elapsed().as_millis() as u32;
                let features = usage_extractor::ExtractedFeatures::default();

                let (cost, billing_detail) = crate::relay::calculate_relay_cost(
                    &state,
                    db_model.as_ref(),
                    db_rule.as_mut(),
                    &channel,
                    ctx.discount,
                    &ctx_model_discounts,
                    &usage,
                    &features,
                    mapping_source,
                    &model,
                    &final_resolved_model,
                )
                .await;

                proxy::record_and_bill_inner(proxy::BillRecord {
                    state: &state,
                    token: &token,
                    channel: &channel,
                    model: &model,
                    prompt_tokens: usage.prompt,
                    completion_tokens: usage.completion,
                    cached_tokens: usage.cached,
                    cost: cost,
                    pre_deducted: pre_deduction,
                    pre_deduct_gift: pre_deduct_gift,
                    status_code: 200,
                    endpoint: &ep,
                    error_msg: None,
                    latency_ms: latency_ms,
                    is_stream: 0,
                    request_content: Some(request_content_str),
                    response_content: Some(resp_text.clone()),
                    upstream_req_content: Some(upstream_body.to_string()),
                    billing_detail: Some(billing_detail),
                    hint_category: Some(resolved_cat.as_str()),
                    pending_log_id: pending_log_id,
                    billing_model_hint: None,
                    plugin_tag: None,
                    db_model: db_model.as_ref(),
                })
                .await;

                // 直接透传上游 JSON 响应
                let resp_body = Response::builder()
                    .header("Content-Type", "application/json")
                    .body(axum::body::Body::from(resp_text))
                    .unwrap();

                Ok(resp_body)
            }
            .await;
            let _ = result_tx.send(result);
        });

        match result_rx.await {
            Ok(result) => match result {
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
            },
            Err(_) => {
                ha.last_err = AppError::Internal("请求处理任务异常终止".into());
                break;
            }
        }
    } // end while

    Err(ha.finish())
}
