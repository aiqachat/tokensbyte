//! Relay: 通用异步任务轮询网关 + 后台定时轮询器
//! 统一处理视频、图片等带有 task_id 的异步模型轮询和计费结算。
//!
//! 路由入口：
//!   - GET /v1/video/generations/{task_id} — 标准 OpenAI 视频轮询地址（主要入口）
//!   - GET /v1/tasks/{task_id}            — 兼容 apimart 等图片模型的异步轮询地址
//!   两者均执行本文件的 task_status 函数，逻辑完全一致。
//!
//! 后台定时器每 2 分钟自动检查未完成计费的异步任务，确保计费正确落地。

use axum::{extract::{State, Extension, Path, Query, OriginalUri}, response::Response};
use std::sync::Arc;
use std::collections::HashMap;
use crate::{AppState, error::{AppError, AppResult}};
use crate::models::ApiToken;
use super::{proxy, forward};
use super::url_utils::join_url;

/// 从 logs.plugin_tag 解析插件实际模型（用于轮询时模型替换）
fn resolve_plugin_model(plugin_tag: &str) -> Option<String> {
    if !plugin_tag.contains("happyhorse") { return None; }
    let tag: serde_json::Value = serde_json::from_str(plugin_tag).ok()?;
    tag["actual_model"].as_str().map(|s| s.to_string())
}

/// 类别推断：优先 action_type（POST 阶段精准写入），兜底 endpoint 推断，最后查 DB
async fn infer_category(
    pool: &sqlx::PgPool,
    db: &crate::db::Database,
    action_type: &str,
    endpoint: &str,
    model: &str,
) -> String {
    if !action_type.is_empty() {
        return action_type.to_string();
    }
    if endpoint.contains("/video/") || endpoint.contains("/videos/") || endpoint.contains("/v1/video") {
        return "视频".to_string();
    }
    if endpoint.contains("/image/") || endpoint.contains("/images/") || endpoint.contains("/v1/image") {
        return "图片".to_string();
    }
    sqlx::query_scalar(
        &db.format_query(
            "SELECT COALESCE(t.name, '') FROM models m \
             LEFT JOIN model_types t ON m.type_id = t.id \
             WHERE m.model_id = ? ORDER BY m.id LIMIT 1"
        )
    ).bind(model).fetch_optional(pool).await
        .unwrap_or(None).unwrap_or_default()
}

/// 类别到默认入口路径的映射
fn category_to_entry_path(category: &str) -> &'static str {
    match category {
        "视频" => "/v1/video/generations",
        "图片" => "/v1/images/generations",
        _ => "/v1/tasks",
    }
}

// ── GET /v1/video/generations/{task_id} | /v1/tasks/{task_id} ──

/// 通用异步任务状态查询（视频/图片/其他）
/// 标准调用地址: GET /v1/video/generations/{task_id}?model=xxx
/// 兼容地址:     GET /v1/tasks/{task_id}?model=xxx（apimart 图片异步查询）
pub async fn task_status(
    State(state): State<Arc<AppState>>,
    Extension(token): Extension<ApiToken>,
    OriginalUri(uri): OriginalUri,
    Path(task_id): Path<String>,
    Query(params): Query<HashMap<String, String>>,
) -> AppResult<Response> {
    let raw_path = uri.path();
    let mut model_name = params.get("model").map(|s| s.as_str()).unwrap_or("").to_string();
    let ctx = proxy::get_user_context(&state, &token.user_id).await?;

    // 从日志中查找原始渠道信息（含 action_type 用于精准类别推断）
    let log_query = state.db.format_query("SELECT id, channel_id, model, response_content, COALESCE(request_content, ''), billing_detail, COALESCE(endpoint, ''), COALESCE(billing_features, ''), COALESCE(action_type, ''), COALESCE(plugin_tag, ''), COALESCE(upstream_req_content, '') FROM logs WHERE task_id = ? ORDER BY id DESC LIMIT 1");
    let mut db_log_id: Option<i64> = None;

    let mut billing_features_str: Option<String> = None;
    let mut already_settled = false;  // 已成功结算（billing_detail 不含"冻结"且不含"退回"）
    let mut was_refunded = false;     // 已退款（billing_detail 含"退回"）
    let mut log_endpoint: Option<String> = None;
    let mut log_response_content: Option<String> = None;
    let mut log_action_type = String::new();
    let mut log_plugin_tag = String::new();
    let mut log_request_content = String::new();
    let mut log_upstream_req = String::new();
    let log_row: Option<(i64, i64, String, String, String, Option<String>, String, String, String, String, String)> = sqlx::query_as(&log_query)
        .bind(&task_id)
        .fetch_optional(&state.db.pool)
        .await
        .unwrap_or(None);

    let channel_opt: Option<crate::models::Channel> = if let Some((l_id, cid, m_name, resp_content, req_content, b_detail, ep, bf_str, at, pt, upstream_req)) = log_row {
        if !resp_content.is_empty() { log_response_content = Some(resp_content); }
        db_log_id = Some(l_id);
        // 日志表的 model 优先（保证数据一致性），仅日志为空时使用请求参数的 model
        if !m_name.is_empty() {
            model_name = m_name;
        }
        if !ep.is_empty() {
            log_endpoint = Some(ep);
        }
        if !at.is_empty() {
            log_action_type = at;
        }
        if !pt.is_empty() {
            log_plugin_tag = pt;
        }
        if !req_content.is_empty() {
            log_request_content = req_content;
        }
        if !upstream_req.is_empty() {
            log_upstream_req = upstream_req;
        }
        if let Some(ref detail) = b_detail {
            if !detail.is_empty() && !detail.contains("冻结") {
                if detail.contains("退回") {
                    // 已退款状态：后续若上游返回成功，应重新结算
                    was_refunded = true;
                } else {
                    // 已成功结算：不再重复扣费
                    already_settled = true;
                }
            }
        }

        if !bf_str.is_empty() { billing_features_str = Some(bf_str); }
        if let Ok(Some(mut ch)) = sqlx::query_as::<_, crate::models::Channel>(&state.db.format_query("SELECT * FROM channels WHERE id = ?"))
            .bind(cid)
            .fetch_optional(&state.db.pool)
            .await
        {
            if let Some(pid) = ch.preset_id {
                if let Ok(Some(preset)) = sqlx::query_as::<_, crate::models::ChannelConfig>(&state.db.format_query("SELECT * FROM channel_configs WHERE id = ?"))
                    .bind(pid)
                    .fetch_optional(&state.db.pool)
                    .await
                {
                    ch.base_url = preset.base_url;
                    ch.api_key = preset.api_key;
                }
            }
            Some(ch)
        } else {
            None
        }
    } else {
        None
    };

    if model_name.is_empty() {
        return Err(AppError::BadRequest("Missing model parameter and cannot infer from task_id".to_string()));
    }

    // Plugin: happyhorse_router — 从 plugin_tag 解析实际模型（复用已查询的 logs 数据，无需额外 DB 查询）
    let mut upstream_model_name = model_name.clone();
    let mut billing_model_name = model_name.clone();
    if let Some(actual) = resolve_plugin_model(&log_plugin_tag) {
        tracing::info!("[小马] 轮询模型替换: {} → {}", model_name, actual);
        upstream_model_name = actual.clone();
        billing_model_name = actual;
    }

    // 直接使用日志中记录的渠道，不重新走渠道选择（避免依赖用户分组，且不同渠道无法查询原任务）
    let channel = match channel_opt {
        Some(ch) => ch,
        None => return Err(AppError::BadRequest(
            "任务对应的渠道不存在或已被删除，无法查询任务状态".to_string()
        )),
    };

    let category = infer_category(
        &state.db.pool, &state.db, &log_action_type,
        log_endpoint.as_deref().unwrap_or(""), &upstream_model_name,
    ).await;
    let default_entry = category_to_entry_path(&category);

    // 解析转发规则决定查询路径（传入渠道确保同名模型精确匹配绑定的转发规则）
    let resolved = match forward::resolve_forward_rule(&state, &upstream_model_name, &category, default_entry, Some(&channel), None).await {
        Some(r) => r,
        None => forward::infer_forward_from_base_url(&channel.base_url, &category)
    };

    let is_tencent = resolved.target_type == "tencent_vod_video" || resolved.target_type == "tencent_vod_image";

    // 构造轮询上下文（即梦等需要额外参数的厂商）
    let jimeng_ctx = if resolved.target_type.starts_with("jimeng_") {
        Some((log_upstream_req.as_str(), log_request_content.as_str()))
    } else { None };
    let (url, get_resp_str) = send_poll_request(
        &state.http_client, &channel, &resolved, &task_id, &upstream_model_name, jimeng_ctx,
    ).await.map_err(|e| AppError::UpstreamError(e))?;
    let resp_json: serde_json::Value = serde_json::from_str(&get_resp_str).unwrap_or(serde_json::json!({}));

    // 提前解析任务状态，决定是否需要 TOS 替换
    let raw_status = extract_raw_status(&resp_json);
    let task_status = normalize_task_status(&raw_status);
    tracing::info!("[Task Poll] task_id={}, model={}, category={}, status={}, already_settled={}, was_refunded={}, resp_len={}",
        task_id, upstream_model_name, category, task_status, already_settled, was_refunded, get_resp_str.len());

    // 腾讯云：统一转为 OpenAI 格式；非腾讯：保持原始格式
    let store_body = if is_tencent {
        let object_type = if category == "视频" { "video.generation" } else { "image.generation" };
        convert_tencent_poll_to_store(&resp_json, &task_id, &get_resp_str, object_type)
    } else {
        get_resp_str.clone()
    };

    // 渠道 TOS 存储：仅在任务首次成功时执行（含退款后重新成功场景，避免重复上传）
    let store_body = if task_status == "succeeded" && !already_settled {
        if let Some(days) = channel.tos_storage() {
            let fallback_type = if category.contains("视频") { "video" } else { "image" };
            super::tos_persist::persist_response_resources(
                &state, &store_body, channel.id, days, None, Some(fallback_type),
            ).await
        } else {
            store_body
        }
    } else if already_settled {
        // 已结算：复用初始查询已获取的 response_content（已含 TOS URL），避免重复上传和重复查询
        log_response_content.take().unwrap_or(store_body)
    } else {
        store_body
    };

    if let Some(log_id) = db_log_id {
        // 仅在任务尚未成功结算时更新日志响应内容（成功时同步清空之前临时失败的 error_message）
        if !already_settled {
            if task_status == "succeeded" {
                let _ = sqlx::query(&state.db.format_query("UPDATE logs SET response_content = ?, error_message = NULL WHERE id = ?"))
                    .bind(&store_body)
                    .bind(log_id)
                    .execute(&state.db.pool).await;
            } else if task_status == "failed" {
                let err_text = proxy::extract_error_message(&store_body);
                let _ = sqlx::query(&state.db.format_query("UPDATE logs SET response_content = ?, error_message = ? WHERE id = ?"))
                    .bind(&store_body)
                    .bind(&err_text)
                    .bind(log_id)
                    .execute(&state.db.pool).await;
            } else {
                let _ = sqlx::query(&state.db.format_query("UPDATE logs SET response_content = ? WHERE id = ?"))
                    .bind(&store_body)
                    .bind(log_id)
                    .execute(&state.db.pool).await;
            }
        }

        // 任务完成时执行计费（使用 billing_model_name 进行计费）
        // 支持两种场景：
        //   1. 首次成功（冻结状态）→ 正常结算
        //   2. 退款后重新成功（之前轮询失败已退款，现在上游返回成功）→ 重新扣费
        if task_status == "succeeded" && !already_settled {
            let usage = crate::relay::usage_extractor::parse_usage(&store_body);

            let cat_hint = if category.is_empty() { None } else { Some(category.as_str()) };
            let db_model = proxy::find_active_model_exact(&state, &billing_model_name, cat_hint, Some(&channel)).await;

            let db_rule: Option<crate::models::BillingRule> = if let Some(ref m) = db_model {
                if let Some(rule_id) = m.billing_rule_id {
                    sqlx::query_as(&state.db.format_query("SELECT * FROM billing_rules WHERE id = ? AND is_active = 1"))
                        .bind(rule_id).fetch_optional(&state.db.pool).await.unwrap_or(None)
                } else { None }
            } else { None };

            let features = build_poll_settlement_features(
                &billing_features_str, &resp_json, &store_body, &category
            );

            // 折扣策略: MIN(用户模型折扣, 全站折扣, 等级折扣), 受折扣限价约束
            let umd = db_model.as_ref().and_then(|m| crate::relay::proxy::parse_user_model_discount(&ctx.model_discounts, &m.mid));
            let (final_discount, discount_source) = crate::relay::proxy::resolve_discount(db_model.as_ref(), ctx.discount, umd);
            let (cost, mut detail) = crate::relay::compute_cost(db_model.as_ref(), db_rule.as_ref(), &usage, final_discount, &features);
            detail.push_str(&format!(" | {}", discount_source));
            let (resolved_model, mapping_source) = crate::relay::router::resolve_model(&channel, &upstream_model_name, db_model.as_ref());
            if let Some(src) = mapping_source {
                detail.push_str(&format!(" | {}: {} ➞ {}", src, upstream_model_name, resolved_model));
            }

            // 退款后重新成功：预扣费已退回，视为 0（全额从余额扣除）
            // 首次成功（冻结状态）：正常从预扣费中抵扣
            let (pre_deduction, pre_deduct_gift): (f64, f64) = if was_refunded {
                detail.push_str(" | [退款后重新结算]");
                (0.0, 0.0)
            } else {
                sqlx::query_as(&state.db.format_query("SELECT cost, pre_deduct_gift FROM logs WHERE id = ?"))
                    .bind(log_id).fetch_one(&state.db.pool).await.unwrap_or((0.0, 0.0))
            };

            execute_settlement_tx(&state, log_id, &token.user_id, Some(token.id), Some(channel.id),
                usage.prompt, usage.completion, cost, pre_deduction, pre_deduct_gift, &detail).await;
            tracing::info!("[Task Billing] log_id={}, model={}, cost={:.6}, pre_deduction={:.6}, tokens={}+{}={}, images={:?}, url={}",
                log_id, billing_model_name, cost, pre_deduction, usage.prompt, usage.completion, usage.total, features.image_count, url);
        } else if task_status == "failed" && !already_settled && !was_refunded {
            let (pre_deduction, pre_deduct_gift): (f64, f64) = sqlx::query_as(&state.db.format_query("SELECT cost, pre_deduct_gift FROM logs WHERE id = ?"))
                .bind(log_id).fetch_one(&state.db.pool).await.unwrap_or((0.0, 0.0));
            let detail = if pre_deduction > 0.0 { "任务失败，预扣费已退回" } else { "任务失败，该请求无冻结费用" };

            let err_text = proxy::extract_error_message(&store_body);
            let status_code = proxy::infer_error_status_code(&err_text);

            execute_refund_tx(&state, log_id, &token.user_id, Some(token.id), Some(channel.id),
                pre_deduction, pre_deduct_gift, detail, status_code).await;
            tracing::info!("[Task Refund] log_id={}, model={}, refunded={:.6}, url={}, inferred_status={}", log_id, model_name, pre_deduction, url, status_code);
        }
    }

    // 返回格式化：腾讯云已是 OpenAI 格式，非腾讯走 apply_format
    let final_response_str = if is_tencent {
        store_body
    } else {
        crate::relay::response_formatter::apply_format(
            &state.db.pool, raw_path, &category, &store_body, false, Some(&task_id)
        ).await
    };

    Ok(Response::builder()
        .header("Content-Type", "application/json")
        .body(axum::body::Body::from(final_response_str))
        .unwrap())
}

// ── 后台定时轮询器 ──────────────────────────────────────────────

/// 启动后台轮询定时任务（支持优雅关闭：收到 shutdown 信号后完成当前轮询再退出）
pub fn start(state: Arc<AppState>, mut shutdown: tokio::sync::watch::Receiver<bool>) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        // 启动后等待 30 秒再开始第一次轮询，让系统初始化完毕
        tokio::select! {
            _ = tokio::time::sleep(std::time::Duration::from_secs(30)) => {},
            _ = shutdown.changed() => {
                tracing::info!("[TaskPoller] 初始化期间收到关闭信号，退出");
                return;
            }
        }
        loop {
            if let Err(e) = poll_pending_tasks(&state).await {
                tracing::error!("[TaskPoller] 轮询异常: {}", e);
            }
            tokio::select! {
                _ = tokio::time::sleep(std::time::Duration::from_secs(120)) => {},
                _ = shutdown.changed() => {
                    tracing::info!("[TaskPoller] 收到关闭信号，退出轮询");
                    return;
                }
            }
        }
    })
}

/// 查询所有未结算的异步任务日志并逐条轮询上游
/// 连续轮询失败超过 4 次的任务将被标记为失败并退还预扣费
async fn poll_pending_tasks(state: &Arc<AppState>) -> anyhow::Result<()> {
    // 通用条件：billing_detail 含"冻结"即为待结算异步任务
    // 不硬编码 endpoint，自动覆盖视频、图片等所有异步场景
    // task_id 直接从 logs 表获取（POST 阶段已写入），不再从 response_content 解析
    // （response_content 后期会被终态内容或 TOS URL 覆盖，不可靠）
    let rows: Vec<(i64, i64, String, Option<String>, String)> = sqlx::query_as(
        &state.db.format_query(
            "SELECT id, channel_id, model, error_message, COALESCE(task_id, '') FROM logs \
             WHERE billing_detail LIKE '%冻结%' \
             AND status_code = 200 \
             AND created_at::timestamptz > CURRENT_TIMESTAMP - INTERVAL '24 hours' \
             ORDER BY id DESC LIMIT 50"
        )
    )
    .fetch_all(&state.db.pool)
    .await?;

    if rows.is_empty() { return Ok(()); }
    tracing::info!("[TaskPoller] 发现 {} 条待轮询任务", rows.len());

    for (log_id, _, model, error_message, db_task_id) in rows {
        // 解析已有的失败次数（格式：[POLL_FAIL:N] 错误内容）
        let prev_fail_count = error_message.as_deref()
            .and_then(|m| m.strip_prefix("[POLL_FAIL:"))
            .and_then(|m| m.split(']').next())
            .and_then(|n| n.parse::<u32>().ok())
            .unwrap_or(0);

        // 已达失败上限，跳过（理论上不应出现，因为第 4 次已执行退款终结）
        if prev_fail_count >= 4 { continue; }

        // task_id 直接从日志表获取，无需从 response_content 解析
        if db_task_id.is_empty() {
            tracing::warn!("[TaskPoller] log_id={}, model={} 日志中无 task_id", log_id, model);
            continue;
        }

        tracing::info!("[TaskPoller] 开始轮询 log_id={}, model={}, task_id={}", log_id, model, db_task_id);
        if let Err(e) = sync_single_task(state, log_id).await {
            let fail_count = prev_fail_count + 1;
            let err_msg = e.to_string();
            tracing::warn!("[TaskPoller] log_id={} 自动轮询失败 ({}/4): {}", log_id, fail_count, err_msg);

            if fail_count >= 4 {
                // 超过 4 次失败，记录真实错误原因并执行退款终结
                let _ = sqlx::query(&state.db.format_query(
                    "UPDATE logs SET error_message = ? WHERE id = ?"
                ))
                .bind(&format!("[POLL_FAIL:{}] {}", fail_count, err_msg))
                .bind(log_id)
                .execute(&state.db.pool).await;

                let poll_url = format!("auto_poll_fail:{}", err_msg);
                let status_code = proxy::infer_error_status_code(&err_msg);
                settle_failure(state, log_id, &poll_url, status_code).await;
                tracing::error!("[TaskPoller] log_id={} 连续 {} 次轮询失败，已终止并退款: {}, 推断状态码: {}", log_id, fail_count, err_msg, status_code);
            } else {
                // 更新失败次数和最近错误原因，下次轮询时继续尝试
                let _ = sqlx::query(&state.db.format_query(
                    "UPDATE logs SET error_message = ? WHERE id = ?"
                ))
                .bind(&format!("[POLL_FAIL:{}] {}", fail_count, err_msg))
                .bind(log_id)
                .execute(&state.db.pool).await;
            }
        }
    }

    Ok(())
}

// ── sync_single_task ────────────────────────────────────────────

/// 执行单条任务的同步轮询（支持手动或定时调用）
pub async fn sync_single_task(state: &Arc<AppState>, log_id: i64) -> anyhow::Result<String> {
    // task_id 直接从 logs 表获取（POST 阶段已写入），不再从 response_content 解析
    let row: Option<(i64, String, String, String, String, String, String, String)> = sqlx::query_as(
        &state.db.format_query(
            "SELECT channel_id, model, COALESCE(endpoint, ''), COALESCE(action_type, ''), COALESCE(plugin_tag, ''), COALESCE(upstream_req_content, ''), COALESCE(request_content, ''), COALESCE(task_id, '') FROM logs WHERE id = ?"
        )
    ).bind(log_id).fetch_optional(&state.db.pool).await?;

    let (channel_id, mut model_name, endpoint, action_type, plugin_tag, log_upstream_req, log_request_content, task_id) = match row {
        Some(r) => r,
        None => return Err(anyhow::anyhow!("任务记录不存在")),
    };

    // Plugin: happyhorse_router — 若 plugin_tag 包含 happyhorse，则用实际模型替换 model_name 用于转发规则/计费
    if let Some(actual) = resolve_plugin_model(&plugin_tag) {
        tracing::info!("[小马轮询] 模型替换: {} → {}", model_name, actual);
        model_name = actual;
    }

    // task_id 直接从日志表获取，无需从 response_content 解析
    if task_id.is_empty() {
        return Err(anyhow::anyhow!("该记录无 task_id，可能不是异步任务"));
    }

    let channel = match fetch_channel(state, channel_id).await {
        Some(ch) => ch,
        None => return Err(anyhow::anyhow!("渠道不存在或已被删除")),
    };

    let category = infer_category(
        &state.db.pool, &state.db, &action_type, &endpoint, &model_name,
    ).await;
    let entry_path = category_to_entry_path(&category);
    let resolved = forward::resolve_forward_rule(state, &model_name, &category, entry_path, Some(&channel), None)
        .await
        .unwrap_or_else(|| forward::infer_forward_from_base_url(&channel.base_url, &category));

    let jimeng_ctx = if resolved.target_type.starts_with("jimeng_") {
        Some((log_upstream_req.as_str(), log_request_content.as_str()))
    } else { None };
    let (url, body) = match send_poll_request(&state.http_client, &channel, &resolved, &task_id, &model_name, jimeng_ctx).await {
        Ok(r) => r,
        Err(e) => {
            // 区分错误类型：上游明确返回 HTTP 错误码 → 终态失败（直接退款）；网络超时/连接失败 → 继续重试
            if e.starts_with("渠道返回错误状态码") {
                // 上游明确回复了错误（如 500+业务错误码），再轮询也不会恢复
                let _ = sqlx::query(&state.db.format_query(
                    "UPDATE logs SET error_message = ?, response_content = ? WHERE id = ?"
                )).bind(&e).bind(&e).bind(log_id).execute(&state.db.pool).await;
                let status_code = proxy::infer_error_status_code(&e);
                settle_failure(state, log_id, &format!("poll_upstream_error:{}", e), status_code).await;
                return Ok(format!("任务终态失败（上游错误）: {}", e));
            }
            return Err(anyhow::anyhow!("{}", e));
        }
    };

    let is_tencent = resolved.target_type.starts_with("tencent_vod");
    let resp_json: serde_json::Value = serde_json::from_str(&body).unwrap_or(serde_json::json!({}));

    // 腾讯云：完整响应记录 to tracing，方便开发者查看排查对照
    if is_tencent {
        tracing::info!("[TaskPoller] 腾讯云原始响应 task_id={}, body={}", task_id, body);
    }

    // 提取任务状态：调用统一的多厂商状态提取函数
    let raw_status = extract_raw_status(&resp_json);
    let task_status = normalize_task_status(&raw_status);

    if task_status != "succeeded" && task_status != "failed" {
        return Ok(format!("当前状态: {}", task_status));
    }

    // 腾讯云：构造 OpenAI 格式响应存 DB（成功提取 URL，失败携带错误信息）
    let final_body = if is_tencent {
        if task_status == "succeeded" {
            convert_tencent_to_openai(&resp_json, &task_id).unwrap_or_else(|| body.clone())
        } else {
            let object_type = if category.contains("视频") { "video.generation" } else { "image.generation" };
            let err_msg = extract_tencent_error_message(&resp_json)
                .unwrap_or_else(|| "generation failed".to_string());
            build_tencent_error_response(&task_id, object_type, &err_msg)
        }
    } else {
        body.clone()
    };

    let final_body = if task_status == "succeeded" {
        if let Some(days) = channel.tos_storage() {
            let fallback_type = if category.contains("视频") { "video" } else { "image" };
            super::tos_persist::persist_response_resources(state, &final_body, channel.id, days, None, Some(fallback_type)).await
        } else {
            final_body
        }
    } else {
        final_body
    };

    // 更新日志响应内容为最终结果（成功时同步清空之前临时失败的 error_message）
    let mut inferred_status = 400;
    if task_status == "succeeded" {
        let _ = sqlx::query(&state.db.format_query("UPDATE logs SET response_content = ?, error_message = NULL WHERE id = ?"))
            .bind(&final_body).bind(log_id).execute(&state.db.pool).await;
    } else {
        let err_text = proxy::extract_error_message(&final_body);
        inferred_status = proxy::infer_error_status_code(&err_text);
        let _ = sqlx::query(&state.db.format_query("UPDATE logs SET response_content = ?, error_message = ? WHERE id = ?"))
            .bind(&final_body).bind(&err_text).bind(log_id).execute(&state.db.pool).await;
    }

    if task_status == "succeeded" {
        let settle_body = &final_body;
        // 腾讯云：传原始 resp_json（含 Response.AigcVideoTask 路径）以便提取实际视频时长
        // 其他厂商：同样使用原始 resp_json
        settle_success(state, log_id, &model_name, settle_body, &resp_json, &url, &category, &channel).await;
        Ok("任务已成功落地并计费".to_string())
    } else {
        settle_failure(state, log_id, &url, inferred_status).await;
        Ok("任务已失败，预扣费已退回".to_string())
    }
}

// ── 结算辅助函数 ────────────────────────────────────────────────

/// 任务成功：提取 token、计费、余额结算
async fn settle_success(state: &AppState, log_id: i64, model_name: &str, body: &str, resp_json: &serde_json::Value, poll_url: &str, category: &str, channel: &crate::models::Channel) {
    let usage = super::usage_extractor::parse_usage(body);

    let cat_hint = if category.is_empty() { None } else { Some(category) };
    let db_model = super::proxy::find_active_model_exact(state, model_name, cat_hint, Some(channel)).await;

    let db_rule: Option<crate::models::BillingRule> = if let Some(ref m) = db_model {
        if let Some(rule_id) = m.billing_rule_id {
            sqlx::query_as(&state.db.format_query("SELECT * FROM billing_rules WHERE id = ? AND is_active = 1"))
                .bind(rule_id).fetch_optional(&state.db.pool).await.unwrap_or(None)
        } else { None }
    } else { None };

    // 获取原始预扣费、billing_detail 及关联 ID（用于结算和折扣查询）
    let log_data: Option<(f64, f64, String, Option<i64>, Option<i64>, Option<String>)> = sqlx::query_as(
        &state.db.format_query("SELECT cost, pre_deduct_gift, user_id, token_id, channel_id, billing_detail FROM logs WHERE id = ?")
    ).bind(log_id).fetch_optional(&state.db.pool).await.unwrap_or(None);

    let (mut pre_deduction, mut pre_deduct_gift, uid, token_id, channel_id, b_detail) = match log_data {
        Some(d) => d,
        None => (0.0, 0.0, "".to_string(), None, None, None),
    };

    // 退款后重新成功：预扣费已退回用户，视为 0（全额从余额扣除）
    if b_detail.as_deref().map_or(false, |d| d.contains("退回")) {
        pre_deduction = 0.0;
        pre_deduct_gift = 0.0;
    }
    let user_id = if uid.is_empty() { None } else { Some(uid) };

    // 获取用户折扣和模型单独折扣
    let (user_discount, user_model_discounts): (f64, Option<String>) = if let Some(ref uid) = user_id {
        let row: Option<(String, Option<String>)> = sqlx::query_as(
            &state.db.format_query("SELECT user_group, model_discounts FROM users WHERE id = ?")
        ).bind(uid).fetch_optional(&state.db.pool).await.unwrap_or(None);
        if let Some((group, md)) = row {
            let d = if group.is_empty() { 1.0 } else {
                sqlx::query_scalar::<_, f64>(
                    &state.db.format_query("SELECT discount FROM user_levels WHERE group_key = ?")
                ).bind(&group).fetch_optional(&state.db.pool).await.unwrap_or(None).unwrap_or(1.0)
            };
            (d, md)
        } else {
            (1.0, None)
        }
    } else { (1.0, None) };

    // 计费特征恢复：复用 build_poll_settlement_features 统一逻辑（内部已含 image_count 提取）
    let billing_features_str: Option<String> = sqlx::query_scalar::<_, String>(
        &state.db.format_query("SELECT COALESCE(billing_features, '') FROM logs WHERE id = ?")
    ).bind(log_id).fetch_optional(&state.db.pool).await
        .ok().flatten().filter(|s| !s.is_empty());
    let features = build_poll_settlement_features(
        &billing_features_str, resp_json, body, category,
    );

    // 折扣策略: MIN(用户模型折扣, 全站折扣, 等级折扣), 受折扣限价约束
    let umd = db_model.as_ref().and_then(|m| super::proxy::parse_user_model_discount(&user_model_discounts, &m.mid));
    let (final_discount, discount_source) = super::proxy::resolve_discount(db_model.as_ref(), user_discount, umd);

    let is_ha_plugin_enabled = crate::api::plugins::is_plugin_enabled(state, "high_availability_channel").await;
    let applied_discount = if is_ha_plugin_enabled {
        final_discount * channel.rate
    } else {
        final_discount
    };

    let (cost, mut detail) = super::compute_cost(db_model.as_ref(), db_rule.as_ref(), &usage, applied_discount, &features);
    detail.push_str(&format!(" | {}", discount_source));
    if is_ha_plugin_enabled && channel.rate != 1.0 {
        detail.push_str(&format!(" | 渠道倍率: {}x", channel.rate));
    }
    // 映射记录（与用户手动轮询 task_status 保持一致）
    let (resolved_model, mapping_source) = crate::relay::router::resolve_model(channel, model_name, db_model.as_ref());
    if let Some(src) = mapping_source {
        detail.push_str(&format!(" | {}: {} ➞ {}", src, model_name, resolved_model));
    }
    detail.push_str(" | [后台自动轮询结算]");

    let final_uid = user_id.as_deref().unwrap_or("");
    execute_settlement_tx(state, log_id, final_uid, token_id, channel_id,
        usage.prompt, usage.completion, cost, pre_deduction, pre_deduct_gift, &detail).await;
    tracing::info!("[TaskPoller Billing] log_id={}, model={}, cost={:.6}, pre_deduction={:.6}, tokens={}+{}={}, images={:?}, url={}",
        log_id, model_name, cost, pre_deduction, usage.prompt, usage.completion, usage.total, features.image_count, poll_url);
}

/// 任务失败：按预扣费钱包来源精准退还
async fn settle_failure(state: &AppState, log_id: i64, poll_url: &str, status_code: u16) {
    let log_data: Option<(f64, f64, String, Option<i64>, Option<i64>)> = sqlx::query_as(
        &state.db.format_query("SELECT cost, pre_deduct_gift, user_id, token_id, channel_id FROM logs WHERE id = ?")
    ).bind(log_id).fetch_optional(&state.db.pool).await.unwrap_or(None);

    let (pre_deduction, pre_deduct_gift, uid, token_id, channel_id) = match log_data {
        Some(d) => d,
        None => (0.0, 0.0, "".to_string(), None, None),
    };

    let detail = if pre_deduction > 0.0 {
        "任务失败，预扣费已退回 | [后台自动轮询]"
    } else {
        "任务失败，该请求无冻结费用 | [后台自动轮询]"
    };

    execute_refund_tx(state, log_id, &uid, token_id, channel_id, pre_deduction, pre_deduct_gift, detail, status_code).await;
    tracing::info!("[TaskPoller Failure] log_id={}, refunded={:.6}, url={}, status_code={}", log_id, pre_deduction, poll_url, status_code);
}

/// 获取渠道信息（含 preset 覆盖）
async fn fetch_channel(state: &AppState, channel_id: i64) -> Option<crate::models::Channel> {
    let mut ch: crate::models::Channel = sqlx::query_as(
        &state.db.format_query("SELECT * FROM channels WHERE id = ?")
    ).bind(channel_id).fetch_optional(&state.db.pool).await.ok()??;

    if let Some(pid) = ch.preset_id {
        if let Ok(Some(preset)) = sqlx::query_as::<_, crate::models::ChannelConfig>(
            &state.db.format_query("SELECT * FROM channel_configs WHERE id = ?")
        ).bind(pid).fetch_optional(&state.db.pool).await {
            ch.base_url = preset.base_url;
            ch.api_key = preset.api_key;
        }
    }
    Some(ch)
}

// ── 公共结算工具函数 ────────────────────────────────────────────

/// 从提交响应 JSON 字符串中提取 task_id（复用 response_formatter::find_id 统一搜索路径）
pub fn extract_task_id(response: &str) -> Option<String> {
    let v: serde_json::Value = serde_json::from_str(response).ok()?;
    let id = super::response_formatter::find_id(&v);
    if id.is_empty() { None } else { Some(id) }
}

// ── 状态归一化 ──────────────────────────────────────────────────

/// 统一任务状态归一化：将各厂商返回的状态字符串映射为 succeeded / failed / 原值
pub(super) fn normalize_task_status(raw: &str) -> &str {
    match raw.to_lowercase().as_str() {
        "completed" | "succeeded" | "succeed" | "success" | "finish" | "done" => "succeeded",
        "failed" | "canceled" | "cancelled" | "unknown" | "error" | "timeout" | "fail" | "abort" | "not_found" | "expired" => "failed",
        _ => if raw.is_empty() { "pending" } else { return raw; },
    }
}

/// 从响应 JSON 中提取原始状态字符串（兼容多种厂商响应结构）
/// 腾讯云特殊处理：Status="FINISH" 时需校验任务节点的 ErrCode，非 0 视为 FAILED
/// 即梦AI特殊处理：data.status="done" 时需检查外层 code，10000 为成功，否则失败
pub(super) fn extract_raw_status(json: &serde_json::Value) -> String {
    // 腾讯云 DescribeTaskDetail 特殊处理
    if let Some(resp) = json.get("Response") {
        if let Some(status) = resp.get("Status").and_then(|s| s.as_str()) {
            // FINISH 不等于成功，需检查任务节点内的 ErrCode
            if status.eq_ignore_ascii_case("FINISH") {
                if let Some(err_code) = find_tencent_task_field(resp, "ErrCode").and_then(|v| v.as_i64()) {
                    if err_code != 0 {
                        return "FAILED".to_string();
                    }
                }
            }
            return status.to_string();
        }
    }

    // 即梦AI特殊处理：data.status="done" 时需检查外层 code 判定成功或失败
    if let Some(status) = json.pointer("/data/status").and_then(|s| s.as_str()) {
        if status == "done" {
            // code == 10000 → 成功，其他 → 失败（错误信息为外层 message）
            let code = json.get("code").and_then(|c| c.as_i64()).unwrap_or(-1);
            return if code == 10000 { "done".to_string() } else { "FAILED".to_string() };
        }
    }

    json.get("status")
        .or_else(|| json.get("data").and_then(|d| d.get("status")))
        .or_else(|| json.get("data").and_then(|d| d.get("task_status")))
        .or_else(|| json.get("final_result").and_then(|fr| fr.get("status")))
        .or_else(|| json.get("output").and_then(|o| o.get("task_status")))
        .and_then(|s| s.as_str())
        .unwrap_or("")
        .to_string()
}

// ── 腾讯云转换函数 ──────────────────────────────────────────────

/// 提取腾讯云任务节点中的错误信息（ErrCode 非 0 时的 Message 字段）
pub(super) fn extract_tencent_error_message(json: &serde_json::Value) -> Option<String> {
    let resp = json.get("Response")?;
    let msg = find_tencent_task_field(resp, "Message")?.as_str()?;
    if msg.is_empty() { None } else { Some(msg.to_string()) }
}

/// 在 Response 下的腾讯云任务节点中查找指定字段
/// 扫描 AigcVideoTask / AigcImageTask / SceneAigcImageTask 等已知任务类型
fn find_tencent_task_field<'a>(response_obj: &'a serde_json::Value, field: &str) -> Option<&'a serde_json::Value> {
    const TASK_KEYS: &[&str] = &["AigcVideoTask", "AigcImageTask", "SceneAigcImageTask"];
    for key in TASK_KEYS {
        if let Some(task) = response_obj.get(*key) {
            if let Some(val) = task.get(field) {
                return Some(val);
            }
        }
    }
    // 兜底：按 TaskType 字段动态查找
    if let Some(task_type) = response_obj.get("TaskType").and_then(|t| t.as_str()) {
        if let Some(task) = response_obj.get(task_type) {
            return task.get(field);
        }
    }
    None
}

/// 腾讯云 DescribeTaskDetail 原始响应 → 简洁 OpenAI 格式。
/// 统一提取 Response.{TaskType}.Output.FileInfos 中的 FileUrl/Url。
/// 返回 None 表示无法识别的 TaskType，调用方应保留原始响应。
pub fn convert_tencent_to_openai(resp_json: &serde_json::Value, task_id: &str) -> Option<String> {
    let response_obj = resp_json.get("Response")?;
    let task_type = response_obj.get("TaskType")?.as_str()?;
    let now = chrono::Utc::now().timestamp();

    // 统一提取 URL 列表：路径 /{TaskType}/Output/FileInfos，字段 FileUrl / Url
    let path = format!("/{}/Output/FileInfos", task_type);
    let urls: Vec<String> = response_obj.pointer(&path)
        .and_then(|f| f.as_array())
        .map(|arr| {
            arr.iter().filter_map(|fi| {
                fi.get("FileUrl").and_then(|u| u.as_str())
                    .or_else(|| fi.get("Url").and_then(|u| u.as_str()))
                    .filter(|u| !u.is_empty())
                    .map(String::from)
            }).collect()
        })
        .unwrap_or_default();

    if task_type.contains("Video") {
        // 视频：取第一个 URL
        let url_val = urls.first()
            .map(|u| serde_json::json!(u))
            .unwrap_or(serde_json::json!(null));
        Some(serde_json::json!({
            "id": task_id,
            "object": "video.generation",
            "status": "completed",
            "created": now,
            "data": [{ "url": url_val }]
        }).to_string())
    } else {
        // 图片及其他：所有 URL
        let items: Vec<serde_json::Value> = urls.iter()
            .map(|u| serde_json::json!({ "url": u }))
            .collect();
        Some(serde_json::json!({
            "id": task_id,
            "object": "image.generation",
            "status": "completed",
            "created": now,
            "data": items
        }).to_string())
    }
}

/// 构建腾讯云非终态（处理中/排队等）的 OpenAI 标准格式响应
/// 将 task_id → id，补充 object/created 字段，status 使用标准化值
pub fn build_tencent_pending_response(task_id: &str, normalized_status: &str, object_type: &str) -> String {
    let now = chrono::Utc::now().timestamp_millis();
    serde_json::json!({
        "id": task_id,
        "object": object_type,
        "status": normalized_status,
        "created": now,
    }).to_string()
}

/// 构建腾讯云任务失败的 OpenAI 标准格式响应（含 error.message）
pub fn build_tencent_error_response(task_id: &str, object_type: &str, error_msg: &str) -> String {
    let now = chrono::Utc::now().timestamp_millis();
    serde_json::json!({
        "id": task_id,
        "object": object_type,
        "status": "failed",
        "created": now,
        "error": { "message": error_msg }
    }).to_string()
}

/// 检测腾讯云 API 级别错误（Response.Error），返回格式化错误信息
/// 与任务级别的 ErrCode 不同，这是请求参数错误等场景下直接返回的错误
fn extract_tencent_api_error(resp_json: &serde_json::Value) -> Option<String> {
    let err = resp_json.pointer("/Response/Error")?;
    let code = err.get("Code").and_then(|v| v.as_str()).unwrap_or("UnknownError");
    let message = err.get("Message").and_then(|v| v.as_str()).unwrap_or("Unknown error");
    Some(format!("{}: {}", code, message))
}

/// 腾讯云 POST 响应统一转换：原始响应 → OpenAI 格式
/// 返回 (转换后的响应字符串, 是否为错误)
/// - API 级错误（Response.Error）→ failed
/// - 任务级失败（ErrCode != 0）→ failed
/// - 任务成功 → succeeded（仅图片 POST 可能即时完成）
/// - 其他 → pending
pub fn convert_tencent_post_response(raw_response: &str, object_type: &str) -> (String, bool) {
    let resp_json: serde_json::Value = serde_json::from_str(raw_response).unwrap_or(serde_json::json!({}));
    // 优先检测 API 级别错误（Response.Error）
    if let Some(api_err) = extract_tencent_api_error(&resp_json) {
        return (build_tencent_error_response("", object_type, &api_err), true);
    }
    let task_id = resp_json.pointer("/Response/TaskId")
        .and_then(|v| v.as_str()).unwrap_or_default();
    let raw_status = extract_raw_status(&resp_json);
    let task_status = normalize_task_status(&raw_status);
    match task_status {
        "succeeded" => {
            let converted = convert_tencent_to_openai(&resp_json, task_id)
                .unwrap_or_else(|| raw_response.to_string());
            (converted, false)
        }
        "failed" => {
            let err_msg = extract_tencent_error_message(&resp_json)
                .unwrap_or_else(|| "generation failed".to_string());
            (build_tencent_error_response(task_id, object_type, &err_msg), true)
        }
        _ => (build_tencent_pending_response(task_id, &task_status, object_type), false),
    }
}

// ── 用户请求轮询共用的结算辅助函数 ────────────────────────────────

/// 腾讯云轮询响应统一转换：根据任务状态生成 OpenAI 格式的存储/返回内容
/// 供 video.rs 和本模块的用户请求轮询复用
pub(super) fn convert_tencent_poll_to_store(
    resp_json: &serde_json::Value,
    task_id: &str,
    raw_resp: &str,
    object_type: &str,
) -> String {
    let raw_status = extract_raw_status(resp_json);
    let task_status = normalize_task_status(&raw_status);
    if task_status == "succeeded" {
        convert_tencent_to_openai(resp_json, task_id).unwrap_or_else(|| raw_resp.to_string())
    } else if task_status == "failed" {
        let err_msg = extract_tencent_error_message(resp_json)
            .unwrap_or_else(|| "generation failed".to_string());
        build_tencent_error_response(task_id, object_type, &err_msg)
    } else {
        build_tencent_pending_response(task_id, &task_status, object_type)
    }
}

/// 构建异步任务终态结算所需的计费特征
/// billing_features 快照为优先（POST 阶段保存），然后叠加终态响应中的实际数据
pub(super) fn build_poll_settlement_features(
    billing_features_str: &Option<String>,
    resp_json: &serde_json::Value,
    store_body: &str,
    category: &str,
) -> super::usage_extractor::ExtractedFeatures {
    // 恢复 billing_features 快照
    let mut features = if let Some(ref bf_str) = billing_features_str {
        serde_json::from_str::<super::usage_extractor::ExtractedFeatures>(bf_str)
            .unwrap_or_default()
    } else {
        super::usage_extractor::ExtractedFeatures::default()
    };
    // 可灵视频实际时长覆盖
    if let Some(kling_dur) = super::usage_extractor::extract_kling_video_duration(resp_json) {
        features.duration_seconds = Some(kling_dur);
    }
    // 腾讯云 VOD 视频实际时长覆盖
    if let Some(tc_dur) = super::usage_extractor::extract_tencent_vod_video_duration(resp_json) {
        features.duration_seconds = Some(tc_dur);
    }
    // 视频模型 duration 兜底
    if category == "视频" && features.duration_seconds.is_none() {
        features.duration_seconds = Some(5.0);
    }
    // 终态图片数量覆盖
    if let Some(resp_count) = super::usage_extractor::count_response_images(store_body) {
        features.image_count = Some(resp_count);
    }
    features
}

// ── 成功结算事务 ────────────────────────────────────────────────

/// 成功结算事务：更新日志计费、用户余额差额、令牌配额、渠道配额
pub(super) async fn execute_settlement_tx(
    state: &crate::AppState,
    log_id: i64,
    user_id: &str,
    token_id: Option<i64>,
    channel_id: Option<i64>,
    prompt_tokens: i32,
    completion_tokens: i32,
    cost: f64,
    pre_deduction: f64,
    pre_deduct_gift: f64,
    detail: &str,
) {
    let apply_balance = cost - pre_deduction;

    match state.db.pool.begin().await {
        Ok(mut tx) => {
            // 原子 CAS：仅当 billing_detail 含"冻结"（首次结算）或"退回"（退款后重新结算）时才更新，
            // 且排除用户已取消(499)的记录，防止取消后轮询到 succeeded 覆盖状态码
            // 同时将 status_code 恢复为 200（退款后重新成功场景需要从 400 恢复）
            let result = sqlx::query(&state.db.format_query(
                "UPDATE logs SET status_code = 200, prompt_tokens = ?, completion_tokens = ?, cached_tokens = 0, cost = ?, billing_detail = ?, error_message = NULL, latency_ms = CAST(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at::timestamptz)) * 1000 AS INTEGER) WHERE id = ? AND (billing_detail LIKE '%冻结%' OR billing_detail LIKE '%退回%') AND status_code != 499"
            )).bind(prompt_tokens).bind(completion_tokens).bind(cost).bind(detail).bind(log_id)
            .execute(&mut *tx).await;

            let affected = match &result {
                Ok(r) => r.rows_affected(),
                Err(e) => {
                    tracing::error!("[Settlement] 更新日志错误，事务回滚: {:?}", e);
                    let _ = tx.rollback().await;
                    return;
                }
            };

            if affected == 0 {
                // 另一方已抢先结算，回滚事务避免重复扣费
                let _ = tx.rollback().await;
                tracing::info!("[Settlement] log_id={} 已被其他线程结算，跳过", log_id);
                return;
            }

            // 更新用户账户余额、令牌配额和渠道配额，任一步骤失败都会导致整个事务回滚，确保计费落地一致性
            let res: Result<(), sqlx::Error> = async {
                if apply_balance > 0.0 {
                    sqlx::query(&state.db.format_query(
                        "UPDATE users SET \
                         balance = CASE WHEN gift_balance >= ? THEN balance ELSE balance - (? - gift_balance) END, \
                         gift_used_quota = gift_used_quota + ? + CASE WHEN gift_balance >= ? THEN ? ELSE gift_balance END, \
                         gift_balance = CASE WHEN gift_balance >= ? THEN gift_balance - ? ELSE 0 END, \
                         used_quota = used_quota + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
                    ))
                    .bind(apply_balance).bind(apply_balance)
                    .bind(pre_deduct_gift).bind(apply_balance).bind(apply_balance)
                    .bind(apply_balance).bind(apply_balance)
                    .bind(cost)
                    .bind(user_id)
                    .execute(&mut *tx).await?;
                } else {
                    let refund = -apply_balance;
                    let gift_cost = cost.min(pre_deduct_gift);
                    let gift_refund = pre_deduct_gift - gift_cost;
                    let balance_refund = refund - gift_refund;
                    sqlx::query(&state.db.format_query(
                        "UPDATE users SET balance = balance + ?, gift_balance = gift_balance + ?, \
                         used_quota = used_quota + ?, gift_used_quota = gift_used_quota + ?, \
                         updated_at = CURRENT_TIMESTAMP WHERE id = ?"
                    )).bind(balance_refund).bind(gift_refund)
                    .bind(cost).bind(gift_cost).bind(user_id)
                    .execute(&mut *tx).await?;
                }

                if apply_balance != 0.0 {
                    if let Some(tid) = token_id {
                        let now_t = chrono::Local::now();
                        let now_day = now_t.format("%Y-%m-%d").to_string();
                        let now_week = now_t.format("%Y-%U").to_string();
                        let now_month = now_t.format("%Y-%m").to_string();
                        let now_str = now_t.format("%Y-%m-%d %H:%M:%S").to_string();
                        sqlx::query(&state.db.format_query(
                            "UPDATE api_tokens SET \
                             quota_used = quota_used + ?, \
                             daily_quota_used = CASE WHEN last_reset_day <> ? THEN ? ELSE daily_quota_used + ? END, \
                             weekly_quota_used = CASE WHEN last_reset_week <> ? THEN ? ELSE weekly_quota_used + ? END, \
                             monthly_quota_used = CASE WHEN last_reset_month <> ? THEN ? ELSE monthly_quota_used + ? END, \
                             last_reset_day = ?, \
                             last_reset_week = ?, \
                             last_reset_month = ?, \
                             last_used_at = ?, \
                             updated_at = CURRENT_TIMESTAMP \
                             WHERE id = ?"
                        ))
                        .bind(apply_balance)
                        .bind(&now_day).bind(apply_balance).bind(apply_balance)
                        .bind(&now_week).bind(apply_balance).bind(apply_balance)
                        .bind(&now_month).bind(apply_balance).bind(apply_balance)
                        .bind(&now_day)
                        .bind(&now_week)
                        .bind(&now_month)
                        .bind(&now_str)
                        .bind(tid)
                        .execute(&mut *tx).await?;
                    }
                    if let Some(cid) = channel_id {
                        sqlx::query(&state.db.format_query(
                            "UPDATE channels SET quota_used = quota_used + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
                        )).bind(apply_balance).bind(cid)
                        .execute(&mut *tx).await?;
                    }
                }
                Ok(())
            }.await;

            if let Err(e) = res {
                tracing::error!("[Settlement] 更新余额或配额失败，事务回滚: {:?}", e);
                let _ = tx.rollback().await;
            } else {
                if let Err(e) = tx.commit().await {
                    tracing::error!("[Settlement] 提交事务失败: {:?}", e);
                } else {
                    tracing::info!("[Settlement] log_id={}, cost={:.6}, applied={:.6}", log_id, cost, apply_balance);
                }
            }
        }
        Err(e) => {
            tracing::error!("[Settlement] 启动事务失败: {:?}", e);
        }
    }
}

// ── 失败退款事务 ────────────────────────────────────────

/// 失败退款事务：按预扣费钱包来源精准退还余额、令牌配额、渠道配额
pub(crate) async fn execute_refund_tx(
    state: &crate::AppState,
    log_id: i64,
    user_id: &str,
    token_id: Option<i64>,
    channel_id: Option<i64>,
    pre_deduction: f64,
    pre_deduct_gift: f64,
    detail: &str,
    status_code: u16,
) {
    match state.db.pool.begin().await {
        Ok(mut tx) => {
            // 原子 CAS：仅当 billing_detail 仍含"冻结"且未被用户取消(499)时才更新，防止并发双重退款
            let result = sqlx::query(&state.db.format_query(
                "UPDATE logs SET status_code = ?, cost = 0.0, pre_deduct_gift = 0.0, billing_detail = ?, latency_ms = CAST(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at::timestamptz)) * 1000 AS INTEGER) WHERE id = ? AND billing_detail LIKE '%冻结%' AND status_code != 499"
            )).bind(status_code as i32).bind(detail).bind(log_id)
            .execute(&mut *tx).await;

            let affected = match &result {
                Ok(r) => r.rows_affected(),
                Err(e) => {
                    tracing::error!("[Refund] 更新日志错误，事务回滚: {:?}", e);
                    let _ = tx.rollback().await;
                    return;
                }
            };

            if affected == 0 {
                let _ = tx.rollback().await;
                tracing::info!("[Refund] log_id={} 已被其他线程处理，跳过", log_id);
                return;
            }

            // 更新用户退款余额、令牌配额和渠道已用额度，任何异常都会触发事务安全回滚
            let res: Result<(), sqlx::Error> = async {
                if pre_deduction > 0.0 {
                    let balance_refund = pre_deduction - pre_deduct_gift;
                    sqlx::query(&state.db.format_query(
                        "UPDATE users SET balance = balance + ?, gift_balance = gift_balance + ?, \
                         updated_at = CURRENT_TIMESTAMP WHERE id = ?"
                    )).bind(balance_refund).bind(pre_deduct_gift).bind(user_id)
                    .execute(&mut *tx).await?;

                    if let Some(tid) = token_id {
                        let now_t = chrono::Local::now();
                        let now_day = now_t.format("%Y-%m-%d").to_string();
                        let now_week = now_t.format("%Y-%U").to_string();
                        let now_month = now_t.format("%Y-%m").to_string();

                        sqlx::query(&state.db.format_query(
                            "UPDATE api_tokens SET \
                             quota_used = quota_used - ?, \
                             daily_quota_used = CASE WHEN last_reset_day = ? THEN daily_quota_used - ? ELSE daily_quota_used END, \
                             weekly_quota_used = CASE WHEN last_reset_week = ? THEN weekly_quota_used - ? ELSE weekly_quota_used END, \
                             monthly_quota_used = CASE WHEN last_reset_month = ? THEN monthly_quota_used - ? ELSE monthly_quota_used END, \
                             updated_at = CURRENT_TIMESTAMP \
                             WHERE id = ?"
                        ))
                        .bind(pre_deduction)
                        .bind(&now_day).bind(pre_deduction)
                        .bind(&now_week).bind(pre_deduction)
                        .bind(&now_month).bind(pre_deduction)
                        .bind(tid)
                        .execute(&mut *tx).await?;
                    }
                    if let Some(cid) = channel_id {
                        sqlx::query(&state.db.format_query(
                            "UPDATE channels SET quota_used = quota_used - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
                        )).bind(pre_deduction).bind(cid)
                        .execute(&mut *tx).await?;
                    }
                }
                Ok(())
            }.await;

            if let Err(e) = res {
                tracing::error!("[Refund] 更新退款余额或配额失败，事务回滚: {:?}", e);
                let _ = tx.rollback().await;
            } else {
                if let Err(e) = tx.commit().await {
                    tracing::error!("[Refund] 提交事务失败: {:?}", e);
                } else {
                    tracing::info!("[Refund] log_id={}, refunded={:.6}", log_id, pre_deduction);
                }
            }
        }
        Err(e) => {
            tracing::error!("[Refund] 启动事务失败: {:?}", e);
        }
    }
}

// ── 轮询请求发送 ────────────────────────────────────────────────

/// 构建轮询 URL + 鉴权 + 发送单次请求（sync_single_task 和 poll_task_result 共用）。
/// 返回 (poll_url, response_body)。
/// jimeng_ctx: 即梦轮询所需的额外上下文（req_key, upstream_req_content, request_content）
async fn send_poll_request(
    http_client: &reqwest::Client,
    channel: &crate::models::Channel,
    resolved: &super::forward::ResolvedForward,
    task_id: &str,
    model: &str,
    jimeng_ctx: Option<(&str, &str)>,  // (upstream_req_content, request_content)
) -> Result<(String, String), String> {
    let is_tencent = resolved.target_type.starts_with("tencent_vod");
    let is_jimeng = resolved.target_type.starts_with("jimeng_");

    // 即梦AI：POST 轮询（req_key + task_id + 可选 req_json）
    if is_jimeng {
        let (ak, sk) = forward::parse_jimeng_key(&channel.api_key);
        // req_key 从 upstream_req_content 提取
        let (upstream_req_str, request_content_str) = jimeng_ctx.unwrap_or(("", ""));
        let jimeng_req_key = serde_json::from_str::<serde_json::Value>(upstream_req_str).ok()
            .and_then(|v| v.get("req_key").and_then(|r| r.as_str().map(|s| s.to_string())))
            .unwrap_or_else(|| model.to_string());
        let mut poll_body = serde_json::json!({
            "req_key": jimeng_req_key,
            "task_id": task_id
        });
        // req_json 组装：优先用户原始请求(request_content)中的 req_json > OpenAI 参数转换 + 兜底
        // 注意：火山引擎 CV API 要求 req_json 为 JSON 字符串格式，非嵌套对象
        if let Ok(req) = serde_json::from_str::<serde_json::Value>(request_content_str) {
            if let Some(rj) = req.get("req_json") {
                // 用户直接传入的 req_json：确保为字符串格式
                poll_body["req_json"] = if rj.is_string() {
                    rj.clone()
                } else {
                    serde_json::json!(serde_json::to_string(rj).unwrap_or_default())
                };
            } else {
                let mut assembled = serde_json::Map::new();
                // return_url：有 response_format 按参数定义，没有则兜底为 true
                let return_url = if let Some(rf) = req.get("response_format").and_then(|v| v.as_str()) {
                    rf != "b64_json"  // b64_json 返回 base64，其他（url 等）返回 URL
                } else {
                    true  // 未指定时默认返回 URL
                };
                assembled.insert("return_url".to_string(), serde_json::json!(return_url));
                if req.get("watermark").and_then(|v| v.as_bool()).unwrap_or(false) {
                    assembled.insert("logo_info".to_string(), serde_json::json!({"add_logo": true}));
                }
                poll_body["req_json"] = serde_json::json!(serde_json::to_string(&serde_json::json!(assembled)).unwrap_or_default());
            }
        } else {
            // request_content 解析失败时仍兜底 return_url
            poll_body["req_json"] = serde_json::json!("{\"return_url\":true}");
        }
        let body_str = serde_json::to_string(&poll_body).unwrap_or_default();
        let headers = forward::build_jimeng_headers(ak, sk, "CVSync2AsyncGetResult", &body_str, &channel.base_url);
        let poll_url = format!("{}/?Action=CVSync2AsyncGetResult&Version=2022-08-31",
            channel.base_url.trim_end_matches('/'));
        tracing::info!("轮询 url={}", poll_url);
        let mut builder = http_client.post(&poll_url)
            .header("Content-Type", "application/json")
            .timeout(std::time::Duration::from_secs(30));
        for (k, v) in headers { builder = builder.header(k, v); }
        // 使用已签名的 body_str 发送，避免 .json() 重新序列化导致签名不匹配
        let resp = builder.body(body_str).send().await
            .map_err(|e| format!("请求渠道失败: {}", e))?;
        if !resp.status().is_success() {
            let status = resp.status();
            let err_body = resp.text().await.unwrap_or_default();
            let detail = serde_json::from_str::<serde_json::Value>(&err_body)
                .map(|v| super::response_formatter::extract_error_message(&v))
                .unwrap_or_default();
            return Err(if detail.is_empty() || detail == "generation failed" {
                format!("渠道返回错误状态码: {}", status)
            } else {
                format!("渠道返回错误状态码: {} - {}", status, detail)
            });
        }
        let body = resp.text().await.unwrap_or_default();
        return Ok((poll_url, body));
    }

    let poll_path = if is_tencent {
        "/".to_string()
    } else if let Some(ref custom_path) = resolved.poll_path {
        custom_path.replace("${task_id}", task_id).replace("${model}", model)
    } else if resolved.target_type.is_empty() || resolved.target_type == "openai" || resolved.target_type == "apimart" {
        format!("/v1/tasks/{}", task_id)
    } else {
        let path = resolved.upstream_path.replace("${model}", model);
        format!("{}/{}", path.trim_end_matches('/'), task_id)
    };

    let url = if is_tencent {
        "https://vod.tencentcloudapi.com".to_string()
    } else {
        join_url(&channel.base_url, &poll_path)
    };
    tracing::info!("轮询 url={}", url);

    let resp = if is_tencent {
        let (ak, sk, sub_app_id) = forward::parse_tencent_vod_key(&channel.api_key);
        let tc_body = serde_json::json!({ "TaskId": task_id, "SubAppId": sub_app_id });
        let body_str = serde_json::to_string(&tc_body).unwrap_or_default();
        let tc_headers = forward::build_tencent_vod_headers(ak, sk, "DescribeTaskDetail", &body_str);
        let mut builder = http_client.post(&url).timeout(std::time::Duration::from_secs(30));
        for (k, v) in tc_headers { builder = builder.header(k, v); }
        // 使用已签名的 body_str 发送，避免 .json() 重新序列化导致签名不匹配
        builder.body(body_str).send().await
    } else {
        let auth = forward::build_auth_headers(resolved, &channel.api_key);
        let mut builder = http_client.get(&url).timeout(std::time::Duration::from_secs(30));
        for (k, v) in auth { builder = builder.header(k, v); }
        builder.send().await
    };

    let resp = resp.map_err(|e| format!("请求渠道失败: {}", e))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let err_body = resp.text().await.unwrap_or_default();
        let detail = serde_json::from_str::<serde_json::Value>(&err_body)
            .map(|v| super::response_formatter::extract_error_message(&v))
            .unwrap_or_default();
        return Err(if detail.is_empty() || detail == "generation failed" {
            format!("渠道返回错误状态码: {}", status)
        } else {
            format!("渠道返回错误状态码: {} - {}", status, detail)
        });
    }
    let body = resp.text().await.unwrap_or_default();
    Ok((url, body))
}

// ── 通用轮询 ────────────────────────────────────────────────────

/// 异步任务通用轮询（供测试模块等场景复用）。
/// 仅轮询上游获取终态响应，不执行计费结算。
/// 返回 Some((终态响应字符串, "succeeded"|"failed")) 或 None（超时/请求失败）。
///
/// 轮询策略：前 5 次 2s 间隔快速探测，之后递增至 5s 封顶以减少上游压力。
/// 单次请求失败不立即放弃，连续 3 次失败才终止。
pub async fn poll_task_result(
    http_client: &reqwest::Client,
    channel: &crate::models::Channel,
    resolved: &super::forward::ResolvedForward,
    task_id: &str,
    model: &str,
    category: &str,
    timeout_secs: u64,
    jimeng_ctx: Option<(&str, &str)>,  // 轮询上下文：(upstream_req_content, request_content)，即梦等厂商需要
) -> Option<(String, String)> {
    let is_tencent = resolved.target_type.starts_with("tencent_vod");
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(timeout_secs);
    let mut interval_secs: u64 = 2;
    let mut consecutive_errors: u32 = 0;
    let mut attempt: u32 = 0;

    tracing::info!("[PollTask] 开始轮询 task_id={}, timeout={}s", task_id, timeout_secs);

    loop {
        // 剩余时间不足以完成下一轮轮询则退出
        if tokio::time::Instant::now() + std::time::Duration::from_secs(interval_secs) > deadline {
            break;
        }

        tokio::time::sleep(std::time::Duration::from_secs(interval_secs)).await;
        attempt += 1;

        match send_poll_request(http_client, channel, resolved, task_id, model, jimeng_ctx).await {
            Ok((_url, body)) => {
                consecutive_errors = 0;
                let resp_json: serde_json::Value = serde_json::from_str(&body).unwrap_or(serde_json::json!({}));
                let raw_status = extract_raw_status(&resp_json);
                let task_status = normalize_task_status(&raw_status).to_string();

                tracing::info!("[PollTask] 轮询第 {} 次, task_id={}, status={}", attempt, task_id, task_status);

                if task_status == "succeeded" || task_status == "failed" {
                    tracing::info!("[PollTask] 终态 task_id={}, status={}, body_len={}", task_id, task_status, body.len());
                    let store_body = if is_tencent {
                        tracing::info!("[{}] 腾讯云原始响应: {}", category, resp_json);
                        let object_type = if category.contains("视频") { "video.generation" } else { "image.generation" };
                        convert_tencent_poll_to_store(&resp_json, task_id, &body, object_type)
                    } else {
                        body
                    };
                    return Some((store_body, task_status));
                }
            },
            Err(e) => {
                consecutive_errors += 1;
                tracing::warn!("[PollTask] 轮询请求失败 ({}/3): {} (task_id={})", consecutive_errors, e, task_id);
                if consecutive_errors >= 3 {
                    tracing::error!("[PollTask] 连续 3 次请求失败，放弃轮询 task_id={}", task_id);
                    return None;
                }
            }
        }

        // 轮询间隔递增：前 5 次 2s 快速探测，之后递增至 5s 封顶，减少上游压力
        interval_secs = match attempt {
            0..=4 => 2,
            5 => 3,
            6 => 4,
            _ => 5,
        };
    }

    tracing::warn!("[PollTask] 轮询超时 task_id={}, 已尝试 {} 次", task_id, attempt);
    None
}
