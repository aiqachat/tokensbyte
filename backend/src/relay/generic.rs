//! Relay: 通用透传处理器
//! 处理 Embedding（向量）和 Rerank（排序）模型请求。
//! 请求体直接透传，仅替换 model 字段；响应直接返回上游 JSON。
//! 遵循与 audio.rs 一致的 7 步流水线模式。

use axum::{extract::{State, Extension, OriginalUri}, response::Response, Json};
use std::sync::Arc;
use crate::{AppState, error::{AppError, AppResult}};
use crate::models::ApiToken;
use super::{proxy, forward, router, usage_extractor};

// ── 类别推断 ────────────────────────────────────────────────────

/// 根据请求路径推断模型类别（向量/排序）
fn infer_category(path: &str) -> &'static str {
    if path.contains("embeddings") {
        "向量"
    } else if path.contains("rerank") {
        "排序"
    } else {
        "向量" // 默认兜底
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
    let start_time = std::time::Instant::now();
    let raw_path = uri.path();
    let entry_path = raw_path.to_string();
    let category = infer_category(raw_path);
    let request_content_str = serde_json::to_string(&body).unwrap_or_default();

    let model = body["model"].as_str().ok_or_else(|| {
        AppError::BadRequest("Missing required parameter: model".to_string())
    })?;

    // ── 1. Token 模型权限校验（渠道选择前快速拦截） ──
    proxy::check_model_permission(&state, &token, model, &entry_path).await?;

    // ── 2. 用户上下文 ──
    let ctx = proxy::get_user_context(&state, &token.user_id).await?;

    // ── 3. 渠道选择 ──
    let channel = proxy::select_channel_for_model(&state, &token, model, &ctx.user_group, &ctx.level_id, &entry_path).await?;

    // ── 4. 预扣费检查 ──
    let (pre_deduction, db_model) = proxy::check_access(&state, &token, model, &ctx, Some(category), Some(&channel)).await?;

    // ── 5. 转发规则解析 ──
    let mut resolved = match forward::resolve_forward_rule(&state, model, category, &entry_path, Some(&channel), db_model.as_ref()).await {
        Some(r) => r,
        None => {
            if forward::model_has_forward_rules(&state, model).await {
                return Err(AppError::BadRequest(format!(
                    "模型 '{}' 不支持当前接口，请检查模型对应的转发规则", model
                )));
            }
            forward::infer_forward_from_base_url(&channel.base_url, category)
        }
    };
    forward::refine_target_type(&mut resolved, &channel.base_url);

    // 模型映射：渠道内部映射 + 模型表别名映射
    let (final_resolved_model, mapping_source) = router::resolve_model(&channel, model, db_model.as_ref());

    // 查询计费规则（供计费阶段使用）
    let db_rule = proxy::get_model_billing_rule(&state, model, Some(&channel), db_model.as_ref()).await;

    // ── 6. 请求体透传（仅替换 model 字段） ──
    let mut upstream_body = body.clone();
    upstream_body["model"] = serde_json::json!(&final_resolved_model);

    let url = forward::build_upstream_url(&channel.base_url, &resolved, &final_resolved_model, &channel.api_key);

    // 【一条日志原则】请求前预记录日志
    let ep = format!("{}|{}", raw_path, resolved.upstream_path.replace("${model}", &final_resolved_model));
    let mapping_detail: Option<String> = mapping_source.map(|src| format!("{}: {} ➞ {}", src, model, final_resolved_model));

    tracing::info!("[Generic] model={}, category={}, target_type={}, url={}", model, category, resolved.target_type, url);

    let pending_log_id = proxy::record_pending_log(
        &state, &token.user_id, channel.id, token.id, model, &ep,
        0, Some(&request_content_str),
        Some(&url), Some(&channel),
        None, None,
        Some(category),
        db_model.as_ref(),
        Some(&resolved.eid),
        None,
    ).await;

    // ── 7. 上游请求 → 响应处理 → 计费结算 ──
    // 【连接保护】将上游请求+预扣费+日志记录放入独立 task，客户端断开后仍能完成
    let model = model.to_string();
    let (result_tx, result_rx) = tokio::sync::oneshot::channel::<Result<Response, AppError>>();

    tokio::spawn(async move {
        let result: Result<Response, AppError> = async {
            // 执行预扣费（管理员跳过）
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
                            &state, &token, channel.id, &model, 0, 0, 0, 0.0, 0.0, 0.0, 403,
                            &ep, Some(&err_msg), latency_ms, 0,
                            Some(request_content_str.clone()), Some(err_msg.clone()), Some(upstream_body.to_string()),
                            None, Some(category), pending_log_id, None, None, db_model.as_ref()
                        ).await;
                        return Err(if matches!(e, sqlx::Error::RowNotFound) {
                            AppError::Forbidden("余额不足".to_string())
                        } else {
                            AppError::Internal(err_msg)
                        });
                    }
                }
            } else { 0.0 };

            // 构建并发送上游请求（统一鉴权 + 设置请求体）
            let builder = state.http_client.post(&url)
                .header("Content-Type", "application/json");
            let builder = forward::apply_request_auth(builder, &resolved, &channel.api_key, &mut upstream_body, &channel.base_url);
            let resp = match builder.send().await {
                Ok(resp) => resp,
                Err(e) => {
                    let err_msg = e.to_string();
                    let latency_ms = start_time.elapsed().as_millis() as u32;
                    proxy::record_and_bill_inner(
                        &state, &token, channel.id, &model, 0, 0, 0, 0.0, pre_deduction, pre_deduct_gift, 502,
                        &ep, Some(&err_msg), latency_ms, 0,
                        Some(request_content_str.clone()), Some(err_msg.clone()), Some(upstream_body.to_string()),
                        None, Some(category), pending_log_id, None, None, db_model.as_ref()
                    ).await;
                    return Err(AppError::UpstreamError(proxy::sanitize_error_message(&err_msg)));
                }
            };

            let status = resp.status().as_u16();
            if !resp.status().is_success() {
                let err = resp.text().await.unwrap_or_default();
                let display_err = if err.trim().is_empty() { format!("Upstream HTTP error {}", status) } else { err.clone() };
                let latency_ms = start_time.elapsed().as_millis() as u32;
                proxy::record_and_bill_inner(
                    &state, &token, channel.id, &model, 0, 0, 0, 0.0, pre_deduction, pre_deduct_gift, status,
                    &ep, Some(&display_err), latency_ms, 0,
                    Some(request_content_str.clone()), Some(err), Some(upstream_body.to_string()),
                    None, Some(category), pending_log_id, None, None, db_model.as_ref()
                ).await;
                return Err(AppError::UpstreamError(proxy::sanitize_error_message(&display_err)));
            }

            // 读取响应体文本
            let resp_text = resp.text().await.unwrap_or_default();

            // 提取 usage tokens
            let mut usage = usage_extractor::parse_usage(&resp_text);
            // 关键修正：部分 rerank 模型（如阿里 qwen3-vl-rerank）返回的 total_tokens 大于 input_tokens，
            // 或部分模型仅返回 total_tokens。为确保以 total_tokens 作为总消耗准确计费，
            // 当 total 大于 prompt、completion 与 image_tokens 之和时，将差额统一补入 prompt 用量中。
            if usage.total > 0 && usage.total > usage.prompt + usage.completion + usage.image_tokens {
                usage.prompt = usage.total - usage.completion - usage.image_tokens;
            }

            // ── 计费结算 ──
            let latency_ms = start_time.elapsed().as_millis() as u32;
            let features = usage_extractor::ExtractedFeatures::default();

            // 折扣策略: MIN(用户模型折扣, 全站折扣, 等级折扣), 受折扣限价约束
            let umd = db_model.as_ref().and_then(|m| proxy::parse_user_model_discount(&ctx.model_discounts, &m.mid));
            let (final_discount, discount_source) = proxy::resolve_discount(db_model.as_ref(), ctx.discount, umd);

            let is_ha_plugin_enabled = crate::api::plugins::is_plugin_enabled(&state, "high_availability_channel").await;
            let applied_discount = if is_ha_plugin_enabled {
                final_discount * channel.rate
            } else {
                final_discount
            };

            let (cost, mut billing_detail) = crate::relay::compute_cost(db_model.as_ref(), db_rule.as_ref(), &usage, applied_discount, &features);
            billing_detail.push_str(&format!(" | {}", discount_source));
            if is_ha_plugin_enabled && channel.rate != 1.0 {
                billing_detail.push_str(&format!(" | 渠道倍率: {}x", channel.rate));
            }
            if let Some(ref md) = mapping_detail {
                billing_detail.push_str(&format!(" | {}", md));
            }

            proxy::record_and_bill_inner(
                &state, &token, channel.id, &model, usage.prompt, usage.completion, usage.cached, cost, pre_deduction,
                pre_deduct_gift, 200,
                &ep, None, latency_ms, 0,
                Some(request_content_str), Some(resp_text.clone()), Some(upstream_body.to_string()),
                Some(billing_detail), Some(category), pending_log_id, None, None, db_model.as_ref()
            ).await;

            // 直接透传上游 JSON 响应
            let resp_body = Response::builder()
                .header("Content-Type", "application/json")
                .body(axum::body::Body::from(resp_text))
                .unwrap();

            Ok(resp_body)
        }.await;
        let _ = result_tx.send(result);
    });

    match result_rx.await {
        Ok(result) => result,
        Err(_) => Err(AppError::Internal("请求处理任务异常终止".into())),
    }
}
