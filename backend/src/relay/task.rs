//! Relay: 通用异步任务轮询网关 + 后台定时轮询器
//! 统一处理视频、图片等带有 task_id 的异步模型轮询和计费结算。
//!
//! 路由入口：
//!   - GET /v1/video/generations/{task_id} — 标准 OpenAI 视频轮询地址（主要入口）
//!   - GET /v1/tasks/{task_id}            — 兼容 apimart 等图片模型的异步轮询地址
//!   两者均执行本文件的 task_status 函数，逻辑完全一致。
//!
//! 后台定时器每 2 分钟自动检查未完成计费的异步任务，确保计费正确落地。

use super::cascade::{
    apply_cascade_res_mul_to_stage1, cascade_combine_stages, cascade_ensure_standard_480p_video,
    cascade_json_str, cascade_s1_with_s2_url, cascade_s2_client_processing,
    cascade_scrub_plugin_tag_for_user, cascade_stage2_poll_target, cascade_stage_num,
    CascadeS2InflightGuard, CascadeS2SubmitOutcome,
};
use super::url_utils::join_url;
use super::{forward, proxy};
use crate::models::ApiToken;
use crate::{
    error::{AppError, AppResult},
    AppState,
};
use axum::{
    extract::{Extension, OriginalUri, Path, Query, State},
    response::Response,
};
use std::collections::HashMap;
use std::sync::Arc;

/// 异步任务轮询 / 后台同步共用的日志快照。
/// 用 `FromRow` 替代元组，不受 sqlx 元组 ≤16 列限制；后续加字段只改本结构 + SELECT。
#[derive(Debug, Clone, sqlx::FromRow)]
struct TaskRelayLogRow {
    id: i64,
    channel_id: i64,
    model: String,
    response_content: String,
    request_content: String,
    endpoint: String,
    action_type: String,
    plugin_tag: String,
    upstream_req_content: String,
    post_response: String,
    is_completed: i16,
    status_code: i32,
    cost: f64,
    pre_deduct_gift: f64,
    channel_config_id: Option<i32>,
    task_id: String,
    user_id: String,
    #[sqlx(default)]
    token_id: Option<i64>,
}

/// 与 [`TaskRelayLogRow`] 字段一一对应（COALESCE + AS 保证命名映射与空串语义）
const TASK_RELAY_LOG_COLS: &str = "\
id, channel_id, model, \
COALESCE(response_content, '') AS response_content, \
COALESCE(request_content, '') AS request_content, \
COALESCE(endpoint, '') AS endpoint, \
COALESCE(action_type, '') AS action_type, \
COALESCE(plugin_tag, '') AS plugin_tag, \
COALESCE(upstream_req_content, '') AS upstream_req_content, \
COALESCE(post_response, '') AS post_response, \
is_completed, status_code, cost, pre_deduct_gift, channel_config_id, \
COALESCE(task_id, '') AS task_id, \
user_id, token_id";

#[inline]
fn format_task_relay_sql(state: &AppState, where_clause: &str) -> String {
    state.db.format_query(&format!(
        "SELECT {TASK_RELAY_LOG_COLS} FROM logs WHERE {where_clause}"
    ))
}

#[inline]
async fn load_task_relay_log_by_task_id(
    state: &AppState,
    task_id: &str,
) -> Option<TaskRelayLogRow> {
    sqlx::query_as::<_, TaskRelayLogRow>(&format_task_relay_sql(
        state,
        "task_id = ? ORDER BY id DESC LIMIT 1",
    ))
    .bind(task_id)
    .fetch_optional(&state.db.pool)
    .await
    .ok()
    .flatten()
}

#[inline]
async fn load_task_relay_log_by_id(
    state: &AppState,
    log_id: i64,
) -> anyhow::Result<Option<TaskRelayLogRow>> {
    Ok(
        sqlx::query_as::<_, TaskRelayLogRow>(&format_task_relay_sql(state, "id = ?"))
            .bind(log_id)
            .fetch_optional(&state.db.pool)
            .await?,
    )
}

/// 从 logs.plugin_tag 解析插件实际模型（用于轮询时模型替换）
fn resolve_plugin_model(plugin_tag: &str) -> Option<String> {
    if !plugin_tag.contains("happyhorse") {
        return None;
    }
    let tag: serde_json::Value = serde_json::from_str(plugin_tag).ok()?;
    tag["actual_model"].as_str().map(|s| s.to_string())
}

/// 强制 JSON 响应的 id 为用户侧 task_id（级联对外契约）
fn force_json_task_id(s: &mut String, task_id: &str) {
    if let Ok(mut v) = serde_json::from_str::<serde_json::Value>(s) {
        if let Some(obj) = v.as_object_mut() {
            obj.insert("id".to_string(), serde_json::json!(task_id));
            *s = serde_json::to_string(&v).unwrap_or_else(|_| s.clone());
        }
    }
}

/// 构造即梦轮询上下文：优先使用日志中的原始请求内容，enable_log=0 时从 plugin_tag.jimeng_poll 恢复
fn build_jimeng_poll_ctx<'a>(
    target_type: &str,
    log_upstream_req: &'a str,
    log_request_content: &'a str,
    plugin_tag: &str,
    fallback_buf: &'a mut Option<String>,
) -> Option<(&'a str, &'a str)> {
    if !target_type.starts_with("jimeng_") {
        return None;
    }
    let req: &str = if log_request_content.is_empty() {
        *fallback_buf = serde_json::from_str::<serde_json::Value>(plugin_tag)
            .ok()
            .and_then(|pt| pt.get("jimeng_poll").map(|jp| jp.to_string()));
        fallback_buf.as_deref().unwrap_or("")
    } else {
        log_request_content
    };
    let upstream = if log_upstream_req.is_empty() {
        ""
    } else {
        log_upstream_req
    };
    Some((upstream, req))
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
    if let Some(cat) = super::proxy::action_type_from_path(endpoint) {
        return cat.to_string();
    }
    sqlx::query_scalar(&db.format_query(
        "SELECT COALESCE(t.name, '') FROM models m \
             LEFT JOIN model_types t ON m.type_id = t.id \
             WHERE m.model_id = ? ORDER BY m.id LIMIT 1",
    ))
    .bind(model)
    .fetch_optional(pool)
    .await
    .unwrap_or(None)
    .unwrap_or_default()
}

/// 类别到默认入口路径的映射
fn category_to_entry_path(category: &str) -> &'static str {
    match category {
        "视频" | "视频增强" => "/v1/video/generations",
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
    let mut model_name = params
        .get("model")
        .map(|s| s.as_str())
        .unwrap_or("")
        .to_string();

    // 从日志中查找原始渠道信息（含 action_type 用于精准类别推断，is_completed 用于快速返回判断）
    let log_row = load_task_relay_log_by_task_id(&state, &task_id).await;

    let (
        db_log_id,
        log_channel_id,
        model_name_db,
        log_response_content,
        log_request_content,
        log_endpoint,
        log_action_type,
        log_plugin_tag,
        log_upstream_req,
        log_post_response,
        log_is_completed,
        log_status_code,
        log_cost,
        log_pre_deduct_gift,
        log_cfg_id,
    ) = match log_row {
        Some(r) => (
            Some(r.id),
            r.channel_id,
            r.model,
            r.response_content,
            r.request_content,
            r.endpoint,
            r.action_type,
            r.plugin_tag,
            r.upstream_req_content,
            r.post_response,
            r.is_completed,
            r.status_code,
            r.cost,
            r.pre_deduct_gift,
            r.channel_config_id,
        ),
        None => (
            None,
            0,
            String::new(),
            String::new(),
            String::new(),
            String::new(),
            String::new(),
            String::new(),
            String::new(),
            String::new(),
            0i16,
            200i32,
            0.0,
            0.0,
            None,
        ),
    };
    // 日志表的 model 优先（保证数据一致性），仅日志为空时使用请求参数的 model
    if !model_name_db.is_empty() {
        model_name = model_name_db;
    }
    let log_response_content: Option<String> = if log_response_content.is_empty() {
        None
    } else {
        Some(log_response_content)
    };

    // 💡 已完成任务快速返回（前置优化：非级联场景无需查询渠道/规则，直接返回缓存）
    if log_is_completed == 1 {
        if let Some(ref content) = log_response_content {
            let cached_json: serde_json::Value =
                serde_json::from_str(content).unwrap_or(serde_json::json!({}));
            if cached_json.is_object() && !cached_json.as_object().map_or(true, |m| m.is_empty()) {
                // 通过 response_content 结构判断是否为级联（有 stage1+stage2 = 级联）
                let is_cascade_resp =
                    cached_json.get("stage1").is_some() && cached_json.get("stage2").is_some();
                let final_response_str = if is_cascade_resp && log_status_code == 200 {
                    // 级联成功已完成：按级联规则替换 URL 后返回 stage1 格式
                    let s1_json = cached_json
                        .get("stage1")
                        .cloned()
                        .unwrap_or(serde_json::json!({}));
                    let s2_json = cached_json
                        .get("stage2")
                        .cloned()
                        .unwrap_or(serde_json::json!({}));
                    let new_stage1 = cascade_s1_with_s2_url(&s1_json, &s2_json, &log_plugin_tag);
                    let category = infer_category(
                        &state.db.pool,
                        &state.db,
                        &log_action_type,
                        &log_endpoint,
                        &model_name,
                    )
                    .await;
                    let mut formatted = crate::relay::response_formatter::apply_format(
                        &state.db.pool,
                        raw_path,
                        &category,
                        &new_stage1.to_string(),
                        false,
                        Some(&task_id),
                    )
                    .await;
                    force_json_task_id(&mut formatted, &task_id);
                    formatted
                } else if is_cascade_resp {
                    // 级联失败已完成：只返回 stage1，避免暴露 stage2 增强原始体
                    let s1_body = cached_json
                        .get("stage1")
                        .map(|v| v.to_string())
                        .unwrap_or_else(|| {
                            serde_json::json!({
                                "error": { "message": "cascade enhance failed", "type": "api_error" }
                            })
                            .to_string()
                        });
                    let category = infer_category(
                        &state.db.pool,
                        &state.db,
                        &log_action_type,
                        &log_endpoint,
                        &model_name,
                    )
                    .await;
                    let mut formatted = crate::relay::response_formatter::apply_format(
                        &state.db.pool,
                        raw_path,
                        &category,
                        &s1_body,
                        false,
                        Some(&task_id),
                    )
                    .await;
                    force_json_task_id(&mut formatted, &task_id);
                    formatted
                } else {
                    // 非级联已完成：直接格式化返回
                    let category = infer_category(
                        &state.db.pool,
                        &state.db,
                        &log_action_type,
                        &log_endpoint,
                        &model_name,
                    )
                    .await;
                    let formatted = crate::relay::response_formatter::apply_format(
                        &state.db.pool,
                        raw_path,
                        &category,
                        content,
                        false,
                        Some(&task_id),
                    )
                    .await;
                    // 图片模型双向格式对齐
                    if category.contains("图片") {
                        let rf = serde_json::from_str::<serde_json::Value>(&log_request_content)
                            .ok()
                            .and_then(|v| {
                                v.get("response_format")
                                    .and_then(|f| f.as_str())
                                    .map(|s| s.to_string())
                            });
                        super::tos_persist::align_response_format(&state, &formatted, rf.as_deref())
                            .await
                    } else {
                        formatted
                    }
                };
                tracing::info!(
                    "[Task Poll] task_id={}, is_completed=1, 直接返回缓存响应, status_code={}",
                    task_id,
                    log_status_code
                );
                return Ok(Response::builder()
                    .header("Content-Type", "application/json")
                    .body(axum::body::Body::from(final_response_str))
                    .unwrap());
            }
        }
        // is_completed=1 但 response_content 无效，降级到上游轮询
        tracing::warn!(
            "[Task Poll] task_id={}, is_completed=1 但 response_content 无效，降级轮询上游",
            task_id
        );
    }

    if model_name.is_empty() {
        return Err(AppError::BadRequest(
            "Missing model parameter and cannot infer from task_id".to_string(),
        ));
    }

    // Plugin: happyhorse_router — 从 plugin_tag 解析实际模型
    if let Some(actual) = resolve_plugin_model(&log_plugin_tag) {
        tracing::info!("[小马] 轮询模型替换: {} → {}", model_name, actual);
        model_name = actual;
    }

    // 与选渠同源水合（channel_config_id 还原 HA 子配）；无日志时 channel_id=0 → None
    let channel = super::router::fetch_channel(&state, log_channel_id, log_cfg_id)
        .await
        .ok_or_else(|| {
            AppError::BadRequest("任务对应的渠道不存在或已被删除，无法查询任务状态".to_string())
        })?;

    let category = infer_category(
        &state.db.pool,
        &state.db,
        &log_action_type,
        &log_endpoint,
        &model_name,
    )
    .await;
    let default_entry = category_to_entry_path(&category);

    // 一次性查询模型数据，供转发规则解析和计费结算共同复用（避免两次 models 表查询）
    let cat_hint = if category.is_empty() {
        None
    } else {
        Some(category.as_str())
    };
    let db_model =
        super::proxy::find_active_model_exact(&state, &model_name, cat_hint, Some(&channel)).await;

    // 根据渠道绑定的转发规则解析实际物理路径（复用已查询的 model）
    let resolved = match forward::resolve_forward_rule(
        &state,
        &model_name,
        &category,
        default_entry,
        Some(&channel),
        db_model.as_ref(),
    )
    .await
    {
        Some(r) => r,
        None => forward::infer_forward_from_base_url(&channel.base_url, &category, None),
    };

    // 级联阶段判定：cascade_stage: 0=非级联, 1=阶段一, 2=阶段二
    let post_resp_json: serde_json::Value = if resolved.is_cascade {
        serde_json::from_str(&log_post_response).unwrap_or(serde_json::json!({}))
    } else {
        serde_json::json!({})
    };
    let cascade_stage: u8 = cascade_stage_num(resolved.is_cascade, &post_resp_json);

    // 💡 级联阶段二：替换轮询目标（独立增强渠道 + stage2 任务ID），其余复用 send_poll_request
    let cascade_ctx: Option<(
        Option<crate::models::Channel>,
        String,
        super::forward::ResolvedForward,
        String,
    )> = if cascade_stage == 2 {
        let stage2_val = &post_resp_json["stage2"];
        let s2_id = super::response_formatter::find_id(stage2_val);
        if s2_id.is_empty() {
            // stage2 存的就是上游原始响应（提交失败时），直接通过 apply_format 返回
            let err_raw = if stage2_val.is_string() {
                stage2_val.as_str().unwrap_or("").to_string()
            } else {
                stage2_val.to_string()
            };
            let final_err = crate::relay::response_formatter::apply_format(
                &state.db.pool,
                raw_path,
                &category,
                &err_raw,
                false,
                None,
            )
            .await;
            return Ok(Response::builder()
                .status(400)
                .header("Content-Type", "application/json")
                .body(axum::body::Body::from(final_err))
                .unwrap());
        }

        // 从 plugin_tag.cascade 反序列化预先缓存的增强渠道信息
        let (ch, res, final_model) =
            cascade_stage2_poll_target(&channel, &resolved, &log_plugin_tag, &s2_id);
        Some((Some(ch), s2_id, res, final_model))
    } else {
        None
    };

    let (poll_channel, poll_resolved, poll_task_id, poll_model): (
        &crate::models::Channel,
        std::borrow::Cow<'_, super::forward::ResolvedForward>,
        &str,
        &str,
    ) = if let Some((ref ch_opt, ref s2_id, ref s2_resolved, ref fm)) = cascade_ctx {
        (
            ch_opt.as_ref().unwrap_or(&channel),
            std::borrow::Cow::Borrowed(s2_resolved),
            s2_id.as_str(),
            fm.as_str(),
        )
    } else {
        (
            &channel,
            std::borrow::Cow::Borrowed(&resolved),
            &task_id,
            &model_name,
        )
    };

    let is_tencent = resolved.target_type.starts_with("tencent_vod");

    // 构造轮询上下文（即梦等需要额外参数的厂商，enable_log=0 时从 plugin_tag 恢复）
    let mut jimeng_fb = None;
    let jimeng_ctx = build_jimeng_poll_ctx(
        &resolved.target_type,
        &log_upstream_req,
        &log_request_content,
        &log_plugin_tag,
        &mut jimeng_fb,
    );
    let (url, get_resp_str) = send_poll_request(
        &state.http_client,
        poll_channel,
        &poll_resolved,
        poll_task_id,
        poll_model,
        jimeng_ctx,
    )
    .await
    .map_err(|e| AppError::UpstreamError(e))?;
    // 与自动轮询一致：腾讯云每次轮询都落原始响应，便于对照终态结算字段
    if is_tencent {
        log_tencent_poll_raw("Task Poll", &task_id, &get_resp_str);
    }
    let resp_json: serde_json::Value =
        serde_json::from_str(&get_resp_str).unwrap_or(serde_json::json!({}));

    // 提前解析任务状态，决定是否需要 TOS 替换
    let raw_status = super::response_formatter::extract_raw_status(&resp_json);
    let task_status = normalize_task_status(&raw_status);
    tracing::info!(
        "[Task Poll] task_id={}, model={}, category={}, status={}, cascade_stage={}, resp_len={}",
        task_id,
        model_name,
        category,
        task_status,
        cascade_stage,
        get_resp_str.len()
    );

    // 💡 级联阶段一特殊处理：succeeded 触发阶段二提交, failed/pending 继续走主流程
    if cascade_stage == 1 {
        if task_status == "succeeded" {
            let base_video_url = super::response_formatter::find_urls(&resp_json)
                .into_iter()
                .next()
                .unwrap_or_default();
            tracing::info!("[Cascade S1] 底座成功，触发阶段二 task_id={}", task_id);
            if let Some(log_id) = db_log_id {
                match cascade_stage2_submit(
                    &state,
                    &token.user_id,
                    Some(token.id),
                    &task_id,
                    log_id,
                    &log_post_response,
                    &log_request_content,
                    &log_upstream_req,
                    log_cost,
                    log_pre_deduct_gift,
                    &channel,
                    &base_video_url,
                    &log_plugin_tag,
                    &get_resp_str,
                )
                .await
                {
                    Ok(
                        CascadeS2SubmitOutcome::Submitted(_) | CascadeS2SubmitOutcome::InProgress,
                    ) => {
                        // 内存中仍是原始 POST ack（DB 已写为 {stage1,stage2}）；不可再取 .stage1（旧结构无此键 → {}）
                        let stage1_ack =
                            serde_json::from_str::<serde_json::Value>(&log_post_response)
                                .unwrap_or(serde_json::json!({}));
                        let final_resp = cascade_s2_client_processing(
                            &state.db.pool,
                            raw_path,
                            &category,
                            &stage1_ack,
                            &task_id,
                        )
                        .await;
                        return Ok(Response::builder()
                            .header("Content-Type", "application/json")
                            .body(axum::body::Body::from(final_resp))
                            .unwrap());
                    }
                    Err(e) => return Err(AppError::UpstreamError(e)),
                }
            }
        }
        // pending/failed → 继续走主流程（计费/退款条件不满足会自动跳过）
    }

    // 腾讯云：统一转为 OpenAI 格式；非腾讯：保持原始格式
    let store_body = if is_tencent {
        super::response_formatter::format_openai(&category, &get_resp_str, false, Some(&task_id))
    } else {
        get_resp_str.clone()
    };

    let rf = serde_json::from_str::<serde_json::Value>(&log_request_content)
        .ok()
        .and_then(|v| {
            v.get("response_format")
                .and_then(|f| f.as_str())
                .map(|s| s.to_string())
        });
    let rf_ref = rf.as_deref();

    // 渠道 TOS 存储：仅在非级联阶段一 且 任务成功时执行
    let store_body = if task_status == "succeeded" && cascade_stage != 1 {
        if let Some(days) = channel.tos_storage() {
            let fallback_type = if category.contains("视频") {
                "video"
            } else {
                "image"
            };
            super::tos_persist::persist_response_resources(
                &state,
                &store_body,
                channel.id,
                days,
                rf_ref,
                Some(fallback_type),
            )
            .await
        } else {
            store_body
        }
    } else {
        store_body
    };

    // 级联阶段二：提取 stage1 数据用于 combined body 构建和返回格式化
    let mut s1_json: serde_json::Value = if cascade_stage == 2 {
        if let Some(ref content) = log_response_content {
            let parsed: serde_json::Value =
                serde_json::from_str(content).unwrap_or(serde_json::json!({}));
            parsed.get("stage1").cloned().unwrap_or(parsed)
        } else {
            serde_json::json!({})
        }
    } else {
        serde_json::json!({})
    };

    // 阶段二成功：stage1 usage × res_mul
    if cascade_stage == 2 && task_status == "succeeded" {
        apply_cascade_res_mul_to_stage1(&mut s1_json, &resolved.res_mul, &log_plugin_tag);
    }

    let store_body = if cascade_stage == 2 && task_status == "succeeded" {
        cascade_combine_stages(&s1_json, &store_body)
    } else {
        store_body
    };

    if let Some(log_id) = db_log_id {
        // 清理级联 plugin_tag 中的敏感信息
        if task_status == "succeeded" || task_status == "failed" {
            let mut tag = Some(log_plugin_tag.clone());
            if cascade_scrub_plugin_tag_for_user(&mut tag) {
                if let Some(updated_tag) = tag {
                    let _ = sqlx::query(
                        &state
                            .db
                            .format_query("UPDATE logs SET plugin_tag = ? WHERE id = ?"),
                    )
                    .bind(&updated_tag)
                    .bind(log_id)
                    .execute(&state.db.pool)
                    .await;
                }
            }
        }

        if task_status == "succeeded" {
            // 先结算再落库：避免结算失败重试时对已写入的倍率 usage 再次 × res_mul
            settle_success(
                &state,
                log_id,
                &model_name,
                &store_body,
                &resp_json,
                &url,
                &category,
                &channel,
                cascade_stage,
                &log_plugin_tag,
                db_model.as_ref(),
                &resolved.res_mul,
            )
            .await;
            let _ = sqlx::query(&state.db.format_query(
                "UPDATE logs SET response_content = ?, error_message = NULL WHERE id = ?",
            ))
            .bind(&store_body)
            .bind(log_id)
            .execute(&state.db.pool)
            .await;
            tracing::info!(
                "[Task Billing] log_id={}, model={}, cascade_stage={}, url={}",
                log_id,
                model_name,
                cascade_stage,
                url
            );
        } else if task_status == "failed" {
            let err_text = proxy::extract_error_message(&store_body);
            if cascade_stage == 2 {
                tracing::warn!(
                    "[Cascade S2] 画质增强失败: log_id={}, err={}",
                    log_id,
                    err_text
                );
                let updated = serde_json::json!({
                    "stage1": post_resp_json["stage1"],
                    "stage2": &err_text
                })
                .to_string();
                let resp_content = cascade_combine_stages(&s1_json, &store_body);
                let _ = sqlx::query(&state.db.format_query("UPDATE logs SET response_content = ?, error_message = ?, post_response = ? WHERE id = ?"))
                    .bind(&resp_content).bind(&err_text).bind(&updated).bind(log_id)
                    .execute(&state.db.pool).await;
            } else {
                let _ = sqlx::query(&state.db.format_query(
                    "UPDATE logs SET response_content = ?, error_message = ? WHERE id = ?",
                ))
                .bind(&store_body)
                .bind(&err_text)
                .bind(log_id)
                .execute(&state.db.pool)
                .await;
            }
            let status_code = proxy::infer_error_status_code_from_str(&store_body);
            settle_failure(&state, log_id, &url, status_code, cascade_stage).await;
            tracing::info!(
                "[Task Refund] log_id={}, model={}, cascade_stage={}, url={}, status={}",
                log_id,
                model_name,
                cascade_stage,
                url,
                status_code
            );
        } else {
            let db_store_body = if cascade_stage == 2 {
                cascade_combine_stages(&s1_json, &store_body)
            } else {
                store_body.clone()
            };
            let _ = sqlx::query(
                &state
                    .db
                    .format_query("UPDATE logs SET response_content = ? WHERE id = ?"),
            )
            .bind(&db_store_body)
            .bind(log_id)
            .execute(&state.db.pool)
            .await;
        }
    }

    // 返回格式化：
    // - 级联 S2 成功：S1 骨架 + S2 产物 URL
    // - 级联 S2 进行中：阶段一 POST 处理中形态（禁止 S2 原始响应 / S1 成功产物）
    // - 其余：腾讯已是 OpenAI；其它走 apply_format
    let mut final_response_str = if cascade_stage == 2 && task_status == "succeeded" {
        let resp_json: serde_json::Value =
            serde_json::from_str(&store_body).unwrap_or(serde_json::json!({}));
        let s1_json = resp_json
            .get("stage1")
            .cloned()
            .unwrap_or(serde_json::json!({}));
        let s2_json = resp_json
            .get("stage2")
            .cloned()
            .unwrap_or(serde_json::json!({}));
        let new_stage1 = cascade_s1_with_s2_url(&s1_json, &s2_json, &log_plugin_tag);
        crate::relay::response_formatter::apply_format(
            &state.db.pool,
            raw_path,
            &category,
            &new_stage1.to_string(),
            false,
            Some(&task_id),
        )
        .await
    } else if cascade_stage == 2 && task_status == "failed" {
        // 不向客户端返回 S2 增强原始失败体
        let err_text = proxy::extract_error_message(&store_body);
        let fail_body = serde_json::json!({
            "error": { "message": err_text, "type": "api_error" }
        })
        .to_string();
        crate::relay::response_formatter::apply_format(
            &state.db.pool,
            raw_path,
            &category,
            &fail_body,
            false,
            Some(&task_id),
        )
        .await
    } else if cascade_stage == 2 {
        let stage1_ack = post_resp_json
            .get("stage1")
            .cloned()
            .unwrap_or(serde_json::json!({}));
        cascade_s2_client_processing(&state.db.pool, raw_path, &category, &stage1_ack, &task_id)
            .await
    } else if is_tencent {
        store_body
    } else {
        crate::relay::response_formatter::apply_format(
            &state.db.pool,
            raw_path,
            &category,
            &store_body,
            false,
            Some(&task_id),
        )
        .await
    };

    // 级联阶段二终态：确保对外 id 仍是用户轮询的原始 task_id（进行中路径已在 helper 内写入）
    if cascade_stage == 2 && (task_status == "succeeded" || task_status == "failed") {
        force_json_task_id(&mut final_response_str, &task_id);
    }

    // 仅对图片模型进行双向格式对齐，视频模型只返回 URL，跳过以避免大 JSON 反序列化开销
    let final_response_str = if category.contains("图片") {
        super::tos_persist::align_response_format(&state, &final_response_str, rf_ref).await
    } else {
        final_response_str
    };

    Ok(Response::builder()
        .header("Content-Type", "application/json")
        .body(axum::body::Body::from(final_response_str))
        .unwrap())
}

// ── 后台定时轮询器 ──────────────────────────────────────────────

/// 启动后台轮询定时任务（支持优雅关闭：收到 shutdown 信号后完成当前轮询再退出）
pub fn start(
    state: Arc<AppState>,
    mut shutdown: tokio::sync::watch::Receiver<bool>,
) -> tokio::task::JoinHandle<()> {
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
    // 提示：测试渠道日志（不扣费）在 INSERT 及迁移中已全部将 is_completed 置为 1，
    // 因此这里无需在 SQL 中对 billing_detail 进行低效的 LIKE '%冻结%' 模糊过滤，
    // 仅通过 is_completed = 0 即可极其高效地命中部分索引，完全排除所有测试日志。
    let rows: Vec<(i64, i64, String, Option<String>, String)> =
        sqlx::query_as(&state.db.format_query(
            "SELECT id, channel_id, model, error_message, COALESCE(task_id, '') FROM logs \
             WHERE is_completed = 0 \
             AND status_code = 200 \
             AND created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours' \
             ORDER BY id DESC LIMIT 50",
        ))
        .fetch_all(&state.db.pool)
        .await?;

    if rows.is_empty() {
        return Ok(());
    }
    tracing::info!("[TaskPoller] 发现 {} 条待轮询任务", rows.len());

    for (log_id, _, model, error_message, db_task_id) in rows {
        // 解析已有的失败次数（格式：[POLL_FAIL:N] 错误内容）
        let prev_fail_count = error_message
            .as_deref()
            .and_then(|m| m.strip_prefix("[POLL_FAIL:"))
            .and_then(|m| m.split(']').next())
            .and_then(|n| n.parse::<u32>().ok())
            .unwrap_or(0);

        // 已达失败上限，跳过（理论上不应出现，因为第 4 次已执行退款终结）
        if prev_fail_count >= 4 {
            continue;
        }

        // task_id 直接从日志表获取，无需从 response_content 解析
        if db_task_id.is_empty() {
            tracing::warn!(
                "[TaskPoller] log_id={}, model={} 日志中无 task_id",
                log_id,
                model
            );
            continue;
        }

        tracing::info!(
            "[TaskPoller] 开始轮询 log_id={}, model={}, task_id={}",
            log_id,
            model,
            db_task_id
        );
        if let Err(e) = sync_single_task(state, log_id).await {
            let fail_count = prev_fail_count + 1;
            let err_msg = e.to_string();
            tracing::warn!(
                "[TaskPoller] log_id={} 自动轮询失败 ({}/4): {}",
                log_id,
                fail_count,
                err_msg
            );

            if fail_count >= 4 {
                // 超过 4 次失败，记录真实错误原因并执行退款终结
                let _ = sqlx::query(
                    &state
                        .db
                        .format_query("UPDATE logs SET error_message = ? WHERE id = ?"),
                )
                .bind(&format!("[POLL_FAIL:{}] {}", fail_count, err_msg))
                .bind(log_id)
                .execute(&state.db.pool)
                .await;

                let poll_url = format!("auto_poll_fail:{}", err_msg);
                let status_code = proxy::infer_error_status_code_from_str(&err_msg);
                settle_failure(state, log_id, &poll_url, status_code, 0).await;
                tracing::error!(
                    "[TaskPoller] log_id={} 连续 {} 次轮询失败，已终止并退款: {}, 推断状态码: {}",
                    log_id,
                    fail_count,
                    err_msg,
                    status_code
                );
            } else {
                // 更新失败次数和最近错误原因，下次轮询时继续尝试
                let _ = sqlx::query(
                    &state
                        .db
                        .format_query("UPDATE logs SET error_message = ? WHERE id = ?"),
                )
                .bind(&format!("[POLL_FAIL:{}] {}", fail_count, err_msg))
                .bind(log_id)
                .execute(&state.db.pool)
                .await;
            }
        }
    }

    Ok(())
}

// ── sync_single_task ────────────────────────────────────────────

/// 执行单条任务的同步轮询（支持手动或定时调用，含完整级联支持）
pub async fn sync_single_task(state: &Arc<AppState>, log_id: i64) -> anyhow::Result<String> {
    let TaskRelayLogRow {
        channel_id,
        model: mut model_name,
        endpoint,
        action_type,
        plugin_tag,
        upstream_req_content: log_upstream_req,
        request_content: log_request_content,
        task_id,
        post_response: log_post_response,
        response_content: log_resp_content,
        is_completed,
        user_id,
        token_id,
        cost: log_cost,
        pre_deduct_gift: log_pre_deduct_gift,
        channel_config_id: log_cfg_id,
        ..
    } = load_task_relay_log_by_id(state, log_id)
        .await?
        .ok_or_else(|| anyhow::anyhow!("任务记录不存在"))?;

    // 已完成任务无需再轮询
    if is_completed == 1 {
        return Ok("任务已完成，无需轮询".to_string());
    }

    // Plugin: happyhorse_router — 若 plugin_tag 包含 happyhorse，则用实际模型替换 model_name 用于转发规则/计费
    if let Some(actual) = resolve_plugin_model(&plugin_tag) {
        tracing::info!("[小马轮询] 模型替换: {} → {}", model_name, actual);
        model_name = actual;
    }

    // task_id 直接从日志表获取，无需从 response_content 解析
    if task_id.is_empty() {
        return Err(anyhow::anyhow!("该记录无 task_id，可能不是异步任务"));
    }

    let channel = super::router::fetch_channel(state, channel_id, log_cfg_id)
        .await
        .ok_or_else(|| anyhow::anyhow!("渠道不存在或已被删除"))?;

    let category = infer_category(
        &state.db.pool,
        &state.db,
        &action_type,
        &endpoint,
        &model_name,
    )
    .await;
    let entry_path = category_to_entry_path(&category);

    // 一次性查询模型数据，供转发规则解析和计费结算共同复用（避免两次 models 表查询）
    let cat_hint = if category.is_empty() {
        None
    } else {
        Some(category.as_str())
    };
    let db_model =
        super::proxy::find_active_model_exact(state, &model_name, cat_hint, Some(&channel)).await;

    // 根据渠道绑定的转发规则解析实际物理路径（复用已查询的 model）
    let resolved = forward::resolve_forward_rule(
        state,
        &model_name,
        &category,
        entry_path,
        Some(&channel),
        db_model.as_ref(),
    )
    .await
    .unwrap_or_else(|| forward::infer_forward_from_base_url(&channel.base_url, &category, None));

    // 💡 级联阶段判定（与 task_status 保持一致）
    let post_resp_json: serde_json::Value = if resolved.is_cascade {
        serde_json::from_str(&log_post_response).unwrap_or(serde_json::json!({}))
    } else {
        serde_json::json!({})
    };
    let cascade_stage: u8 = cascade_stage_num(resolved.is_cascade, &post_resp_json);

    // 💡 级联阶段二：替换轮询目标（增强渠道 + stage2 任务ID）
    let cascade_ctx: Option<(
        Option<crate::models::Channel>,
        String,
        super::forward::ResolvedForward,
        String,
    )> = if cascade_stage == 2 {
        let stage2_val = &post_resp_json["stage2"];
        let s2_id = super::response_formatter::find_id(stage2_val);
        if s2_id.is_empty() {
            // stage2 提交失败，直接退款终结
            settle_failure(
                state,
                log_id,
                "级联阶段二提交失败，无有效任务ID",
                500,
                cascade_stage,
            )
            .await;
            return Ok("级联阶段二失败: 无有效任务ID".to_string());
        }
        // 从 plugin_tag.cascade 反序列化增强渠道信息
        let (ch, res, final_model) =
            cascade_stage2_poll_target(&channel, &resolved, &plugin_tag, &s2_id);
        Some((Some(ch), s2_id, res, final_model))
    } else {
        None
    };

    // 选择轮询目标：级联阶段二用增强渠道，其余用原始渠道
    let (poll_channel, poll_resolved, poll_task_id, poll_model) =
        if let Some((ref ch_opt, ref s2_id, ref s2_resolved, ref fm)) = cascade_ctx {
            (
                ch_opt.as_ref().unwrap_or(&channel),
                std::borrow::Cow::Borrowed(s2_resolved),
                s2_id.as_str(),
                fm.as_str(),
            )
        } else {
            (
                &channel,
                std::borrow::Cow::Borrowed(&resolved),
                task_id.as_str(),
                model_name.as_str(),
            )
        };

    // 构造即梦轮询上下文（enable_log=0 时从 plugin_tag 恢复轮询参数）
    let mut jimeng_fb = None;
    let jimeng_ctx = build_jimeng_poll_ctx(
        &resolved.target_type,
        &log_upstream_req,
        &log_request_content,
        &plugin_tag,
        &mut jimeng_fb,
    );
    let (url, body) = match send_poll_request(
        &state.http_client,
        poll_channel,
        &poll_resolved,
        poll_task_id,
        poll_model,
        jimeng_ctx,
    )
    .await
    {
        Ok(r) => r,
        Err(e) => {
            // 区分错误类型：上游明确返回 HTTP 错误码 → 终态失败；网络超时 → 继续重试
            if e.starts_with("渠道返回错误状态码") {
                let _ = sqlx::query(&state.db.format_query(
                    "UPDATE logs SET error_message = ?, response_content = ? WHERE id = ?",
                ))
                .bind(&e)
                .bind(&e)
                .bind(log_id)
                .execute(&state.db.pool)
                .await;
                let status_code = proxy::infer_error_status_code_from_str(&e);
                settle_failure(
                    state,
                    log_id,
                    &format!("poll_upstream_error:{}", e),
                    status_code,
                    cascade_stage,
                )
                .await;
                return Ok(format!("任务终态失败（上游错误）: {}", e));
            }
            return Err(anyhow::anyhow!("{}", e));
        }
    };

    let is_tencent = resolved.target_type.starts_with("tencent_vod");
    if is_tencent {
        log_tencent_poll_raw("TaskPoller", &task_id, &body);
    }
    let resp_json: serde_json::Value = serde_json::from_str(&body).unwrap_or(serde_json::json!({}));

    let raw_status = super::response_formatter::extract_raw_status(&resp_json);
    let task_status = normalize_task_status(&raw_status);

    // 💡 级联阶段一：succeeded 触发阶段二提交
    if cascade_stage == 1 && task_status == "succeeded" {
        let base_video_url = super::response_formatter::find_urls(&resp_json)
            .into_iter()
            .next()
            .unwrap_or_default();
        tracing::info!("[Cascade S1 BG] 底座成功，触发阶段二 task_id={}", task_id);
        match cascade_stage2_submit(
            state,
            &user_id,
            token_id,
            &task_id,
            log_id,
            &log_post_response,
            &log_request_content,
            &log_upstream_req,
            log_cost,
            log_pre_deduct_gift,
            &channel,
            &base_video_url,
            &plugin_tag,
            &body,
        )
        .await
        {
            Ok(CascadeS2SubmitOutcome::Submitted(stage2_id)) => {
                return Ok(format!("级联阶段二已提交，stage2_id={}", stage2_id));
            }
            Ok(CascadeS2SubmitOutcome::InProgress) => {
                return Ok("级联阶段二提交中（并发互斥）".to_string());
            }
            Err(e) => return Err(anyhow::anyhow!("{}", e)),
        }
    }

    if task_status != "succeeded" && task_status != "failed" {
        return Ok(format!("当前状态: {}", task_status));
    }

    // 腾讯云：构造 OpenAI 格式响应（复用 response_formatter 统一逻辑）
    let final_body = if is_tencent {
        let category_str = if category.contains("视频") {
            "视频"
        } else {
            "图片"
        };
        super::response_formatter::format_openai(&category_str, &body, false, Some(&task_id))
    } else {
        body.clone()
    };

    // 级联阶段二：提取 stage1 数据用于 combined body 构建
    let mut s1_json: serde_json::Value = if cascade_stage == 2 && !log_resp_content.is_empty() {
        let parsed: serde_json::Value =
            serde_json::from_str(&log_resp_content).unwrap_or(serde_json::json!({}));
        parsed.get("stage1").cloned().unwrap_or(parsed)
    } else {
        serde_json::json!({})
    };

    // 阶段二成功：stage1 usage × res_mul
    if cascade_stage == 2 && task_status == "succeeded" {
        apply_cascade_res_mul_to_stage1(&mut s1_json, &resolved.res_mul, &plugin_tag);
    }

    let final_body = if task_status == "succeeded" {
        let rf = serde_json::from_str::<serde_json::Value>(&log_request_content)
            .ok()
            .and_then(|v| {
                v.get("response_format")
                    .and_then(|f| f.as_str())
                    .map(|s| s.to_string())
            });
        let rf_ref = rf.as_deref();

        // TOS 存储（级联阶段一已在上方 return，此处不会执行到）
        let body_after_tos = if let Some(days) = channel.tos_storage() {
            let fallback_type = if category.contains("视频") {
                "video"
            } else {
                "image"
            };
            super::tos_persist::persist_response_resources(
                state,
                &final_body,
                channel.id,
                days,
                rf_ref,
                Some(fallback_type),
            )
            .await
        } else {
            final_body
        };

        // 图片模型双向格式对齐
        let aligned = if category.contains("图片") {
            super::tos_persist::align_response_format(state, &body_after_tos, rf_ref).await
        } else {
            body_after_tos
        };

        // 级联阶段二成功：包装 combined body
        if cascade_stage == 2 {
            cascade_combine_stages(&s1_json, &aligned)
        } else {
            aligned
        }
    } else {
        // 级联阶段二失败：更新 post_response.stage2 为错误文本
        if cascade_stage == 2 {
            let err_text = proxy::extract_error_message(&final_body);
            tracing::warn!(
                "[Cascade S2 BG] 画质增强失败: log_id={}, err={}",
                log_id,
                err_text
            );
            let updated = serde_json::json!({
                "stage1": post_resp_json["stage1"],
                "stage2": &err_text
            })
            .to_string();
            let resp_content = cascade_combine_stages(&s1_json, &final_body);
            let _ = sqlx::query(&state.db.format_query("UPDATE logs SET response_content = ?, error_message = ?, post_response = ? WHERE id = ?"))
                .bind(&resp_content).bind(&err_text).bind(&updated).bind(log_id)
                .execute(&state.db.pool).await;
        }
        final_body
    };

    // 失败路径：更新日志；成功路径延后到结算之后再写 response_content（防级联 usage 二次倍率）
    let inferred_status: u16 = if task_status == "succeeded" {
        200
    } else {
        let err_text = proxy::extract_error_message(&final_body);
        let status = proxy::infer_error_status_code_from_str(&final_body);
        if cascade_stage != 2 {
            let _ = sqlx::query(&state.db.format_query(
                "UPDATE logs SET response_content = ?, error_message = ? WHERE id = ?",
            ))
            .bind(&final_body)
            .bind(&err_text)
            .bind(log_id)
            .execute(&state.db.pool)
            .await;
        }
        status
    };

    // 清理级联 plugin_tag 中的敏感信息
    if task_status == "succeeded" || task_status == "failed" {
        let mut tag = Some(plugin_tag.clone());
        if cascade_scrub_plugin_tag_for_user(&mut tag) {
            if let Some(updated_tag) = tag {
                let _ = sqlx::query(
                    &state
                        .db
                        .format_query("UPDATE logs SET plugin_tag = ? WHERE id = ?"),
                )
                .bind(&updated_tag)
                .bind(log_id)
                .execute(&state.db.pool)
                .await;
            }
        }
    }

    if task_status == "succeeded" {
        settle_success(
            state,
            log_id,
            &model_name,
            &final_body,
            &resp_json,
            &url,
            &category,
            &channel,
            cascade_stage,
            &plugin_tag,
            db_model.as_ref(),
            &resolved.res_mul,
        )
        .await;
        let _ = sqlx::query(&state.db.format_query(
            "UPDATE logs SET response_content = ?, error_message = NULL WHERE id = ?",
        ))
        .bind(&final_body)
        .bind(log_id)
        .execute(&state.db.pool)
        .await;
        Ok("任务已成功落地并计费".to_string())
    } else {
        settle_failure(state, log_id, &url, inferred_status, cascade_stage).await;
        Ok("任务已失败，预扣费已退回".to_string())
    }
}

// ── 结算辅助函数 ────────────────────────────────────────────────

/// 任务成功：提取 token、计费、余额结算
/// cascade_stage: 级联阶段（0=非级联, 1=阶段一, 2=阶段二）
/// log_plugin_tag: 日志 plugin_tag，级联阶段二从 cascade.input_duration 获取预缓存的输入视频时长
/// res_mul: 级联分辨率倍率（stage2：有 tokens 则已乘入用量，否则乘费用）
async fn settle_success(
    state: &AppState,
    log_id: i64,
    model_name: &str,
    body: &str,
    resp_json: &serde_json::Value,
    poll_url: &str,
    category: &str,
    channel: &crate::models::Channel,
    cascade_stage: u8,
    log_plugin_tag: &str,
    caller_model: Option<&crate::models::Model>,
    res_mul: &std::collections::HashMap<String, f64>,
) {
    // 级联阶段二用量取自 stage1（成功路径 usage 已 × res_mul）
    let usage_str: String;
    let usage = if cascade_stage == 2 {
        let parsed: serde_json::Value = serde_json::from_str(body).unwrap_or(serde_json::json!({}));
        let s1 = parsed.get("stage1").cloned().unwrap_or(parsed.clone());
        usage_str = s1.to_string();
        super::usage_extractor::parse_usage(&usage_str)
    } else {
        super::usage_extractor::parse_usage(body)
    };

    // 复用调用方已查询的 Model，避免重复查询 models 表
    let owned_model;
    let db_model: Option<&crate::models::Model> = if let Some(m) = caller_model {
        Some(m)
    } else {
        let cat_hint = if category.is_empty() {
            None
        } else {
            Some(category)
        };
        owned_model =
            super::proxy::find_active_model_exact(state, model_name, cat_hint, Some(channel)).await;
        owned_model.as_ref()
    };

    let mut db_rule =
        super::proxy::get_model_billing_rule(state, model_name, Some(&channel), db_model).await;

    // 获取原始预扣费、billing_detail、billing_features 及关联 ID（一次查询替代两次主键查询）
    let log_data: Option<(f64, f64, String, Option<i64>, Option<i64>, Option<String>, String)> = sqlx::query_as(
        &state.db.format_query("SELECT cost, pre_deduct_gift, user_id, token_id, channel_id, billing_detail, COALESCE(billing_features, '') FROM logs WHERE id = ?")
    ).bind(log_id).fetch_optional(&state.db.pool).await.unwrap_or(None);

    let (mut pre_deduction, mut pre_deduct_gift, uid, token_id, channel_id, b_detail, bf_str) =
        match log_data {
            Some(d) => d,
            None => (0.0, 0.0, "".to_string(), None, None, None, String::new()),
        };

    // 退款后重新成功：预扣费已退回用户，视为 0（全额从余额扣除）
    if b_detail.as_deref().map_or(false, |d| d.contains("退回")) {
        pre_deduction = 0.0;
        pre_deduct_gift = 0.0;
    }
    let user_id = if uid.is_empty() { None } else { Some(uid) };

    // 获取用户折扣和模型单独折扣
    let (user_discount, user_model_discounts): (f64, Option<String>) =
        if let Some(ref uid) = user_id {
            let row: Option<(String, Option<String>)> = sqlx::query_as(
                &state
                    .db
                    .format_query("SELECT user_group, model_discounts FROM users WHERE id = ?"),
            )
            .bind(uid)
            .fetch_optional(&state.db.pool)
            .await
            .unwrap_or(None);
            if let Some((group, md)) = row {
                let d = if group.is_empty() {
                    1.0
                } else {
                    sqlx::query_scalar::<_, f64>(
                        &state
                            .db
                            .format_query("SELECT discount FROM user_levels WHERE group_key = ?"),
                    )
                    .bind(&group)
                    .fetch_optional(&state.db.pool)
                    .await
                    .unwrap_or(None)
                    .unwrap_or(1.0)
                };
                (d, md)
            } else {
                (1.0, None)
            }
        } else {
            (1.0, None)
        };

    // 计费特征恢复：复用 build_poll_settlement_features 统一逻辑（内部已含 image_count 提取）
    let billing_features_str: Option<String> = if bf_str.is_empty() {
        None
    } else {
        Some(bf_str)
    };
    let mut features =
        build_poll_settlement_features(&billing_features_str, resp_json, body, category);

    // 级联阶段二：一次解析 plugin_tag，复用 cascade 节点（时长叠加 + 分辨率兜底，避免 clone）
    let plugin_tag_val = if cascade_stage == 2 {
        serde_json::from_str::<serde_json::Value>(log_plugin_tag).ok()
    } else {
        None
    };
    let cascade = plugin_tag_val.as_ref().and_then(|v| v.get("cascade"));
    if let Some(cascade) = cascade {
        let in_dur = cascade
            .get("input_duration")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0);
        if in_dur > 0.0 {
            if let Some(dur) = features.duration_seconds.as_mut() {
                *dur += in_dur;
            } else {
                features.duration_seconds = Some(in_dur);
            }
        }
    }

    // 映射记录
    let (resolved_model, mapping_source) =
        crate::relay::router::resolve_model(channel, model_name, db_model);

    let (mut cost, mut detail) = super::calculate_relay_cost(
        state,
        db_model,
        db_rule.as_mut(),
        channel,
        user_discount,
        &user_model_discounts,
        &usage,
        &features,
        mapping_source,
        model_name,
        &resolved_model,
    )
    .await;

    // 级联阶段二：有 P/C tokens 则倍率已在用量中；无则乘底座费用（分辨率优先用 cascade 原始目标）
    if cascade_stage == 2 {
        let has_tokens = usage.prompt > 0 || usage.completion > 0;
        if !has_tokens {
            let target_res = cascade
                .and_then(|c| c.get("resolution").and_then(|r| r.as_str()))
                .or(features.resolution.as_deref())
                .unwrap_or("720p");
            (cost, detail) = super::scale_cost_by_res_mul(cost, detail, res_mul, target_res);
        }
    }

    let final_uid = user_id.as_deref().unwrap_or("");
    let updated_bf = serde_json::to_string(&features).ok();
    execute_settlement_tx(
        state,
        log_id,
        final_uid,
        token_id,
        channel_id,
        usage.prompt,
        usage.completion,
        cost,
        pre_deduction,
        pre_deduct_gift,
        &detail,
        updated_bf.as_deref(),
    )
    .await;
    tracing::info!("[TaskPoller Billing] log_id={}, model={}, cost={:.6}, pre_deduction={:.6}, tokens={}+{}={}, images={:?}, url={}",
        log_id, model_name, cost, pre_deduction, usage.prompt, usage.completion, usage.total, features.image_count, poll_url);
}

/// 任务失败：按预扣费钱包来源精准退还
/// cascade_stage: 级联阶段（0=非级联, 2=阶段二）
async fn settle_failure(
    state: &AppState,
    log_id: i64,
    poll_url: &str,
    status_code: u16,
    cascade_stage: u8,
) {
    let log_data: Option<(f64, f64, String, Option<i64>, Option<i64>)> =
        sqlx::query_as(&state.db.format_query(
            "SELECT cost, pre_deduct_gift, user_id, token_id, channel_id FROM logs WHERE id = ?",
        ))
        .bind(log_id)
        .fetch_optional(&state.db.pool)
        .await
        .unwrap_or(None);

    let (pre_deduction, pre_deduct_gift, uid, token_id, channel_id) = match log_data {
        Some(d) => d,
        None => (0.0, 0.0, "".to_string(), None, None),
    };

    let detail = if cascade_stage == 2 {
        if pre_deduction > 0.0 {
            "画质增强失败，预扣费已退回"
        } else {
            "画质增强失败"
        }
    } else {
        if pre_deduction > 0.0 {
            "任务失败，预扣费已退回"
        } else {
            "任务失败，该请求无冻结费用"
        }
    };

    execute_refund_tx(
        state,
        log_id,
        &uid,
        token_id,
        channel_id,
        pre_deduction,
        pre_deduct_gift,
        detail,
        status_code,
    )
    .await;
    tracing::info!(
        "[TaskPoller Failure] log_id={}, cascade_stage={}, refunded={:.6}, url={}, status_code={}",
        log_id,
        cascade_stage,
        pre_deduction,
        poll_url,
        status_code
    );
}

// ── 公共结算工具函数 ────────────────────────────────────────────

/// 从提交响应 JSON 字符串中提取 task_id（复用 response_formatter::extract_async_task_id 统一搜索路径）
pub fn extract_task_id(response: &str) -> Option<String> {
    let v: serde_json::Value = serde_json::from_str(response).ok()?;
    let id = super::response_formatter::extract_async_task_id(&v);
    if id.is_empty() {
        None
    } else {
        Some(id)
    }
}

// ── 状态归一化 ──────────────────────────────────────────────────

/// 统一任务状态归一化：将各厂商返回的状态字符串映射为 succeeded / failed / 原值
pub(super) fn normalize_task_status(raw: &str) -> &str {
    let standard = super::response_formatter::parse_raw_status_to_standard(raw);
    match standard {
        "completed" => "succeeded",
        "failed" => "failed",
        "pending" => "pending",
        "in_progress" => "in_progress",
        _ => {
            if raw.is_empty() {
                "pending"
            } else {
                raw
            }
        }
    }
}

// ── 腾讯云转换函数 ──────────────────────────────────────────────

/// 腾讯云轮询原始响应日志（手动 / 自动 / 同步轮询共用，不影响业务路径）
fn log_tencent_poll_raw(source: &str, task_id: &str, body: &str) {
    tracing::info!(
        "[{}] 腾讯云原始响应 task_id={}, body={}",
        source,
        task_id,
        body
    );
}

/// 腾讯云 POST 响应统一转换：原始响应 → OpenAI 格式（复用 response_formatter::format_openai 统一逻辑）
/// 返回 (转换后的响应字符串, 是否为错误)
pub fn convert_tencent_post_response(raw_response: &str, category: &str) -> (String, bool) {
    let formatted = super::response_formatter::format_openai(category, raw_response, true, None);
    let is_error = formatted.contains("\"error\":");
    (formatted, is_error)
}

// ── 用户请求轮询共用的结算辅助函数 ──

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
    // 火山 MediaKit 终态 result（时长/分辨率/帧率）
    if let Some(result) = resp_json.get("result") {
        if let Some(duration) = result.get("duration").and_then(|v| v.as_f64()) {
            features.duration_seconds = Some(duration);
        }
        if let Some(res) = result.get("resolution").and_then(|v| v.as_str()) {
            features.resolution = Some(res.to_string());
        }
        if let Some(fps) = result.get("fps").and_then(|v| v.as_f64()) {
            features.fps = Some(fps);
        } else if let Some(fps) = result.get("fps").and_then(|v| v.as_i64()) {
            features.fps = Some(fps as f64);
        }
    }
    // 合并终态响应中新出现的特征（如火山图片 input_images / size）；不覆盖已有 resolution
    features.merge(super::usage_extractor::extract_request_features(resp_json));
    // 厂商终态覆盖放在 merge 之后，确保不被冲掉
    if let Some(d) = super::usage_extractor::extract_kling_video_duration(resp_json) {
        features.duration_seconds = Some(d);
    }
    let (tc_dur, tc_res) = super::usage_extractor::extract_tencent_vod_video_settlement(resp_json);
    if let Some(d) = tc_dur {
        features.duration_seconds = Some(d);
    }
    if let Some(r) = tc_res {
        features.resolution = Some(r);
    }
    if category.contains("视频") && features.duration_seconds.is_none() {
        features.duration_seconds = Some(5.0);
    }
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
    billing_features: Option<&str>, // 新增参数：更新后的计费特征快照JSON
) {
    let apply_balance = cost - pre_deduction;

    match state.db.pool.begin().await {
        Ok(mut tx) => {
            // 原子 CAS：仅当 billing_detail 含"冻结"（首次结算）或"退回"（退款后重新结算）时才更新，
            // 且排除用户已取消(499)的记录，防止取消后轮询到 succeeded 覆盖状态码
            // 同时将 status_code 恢复为 200（退款后重新成功场景需要从 400 恢复）
            // 使用 COALESCE(?, billing_features) 绑定，如传入 None 则不修改原有特征快照值
            let result = sqlx::query(&state.db.format_query(
                "UPDATE logs SET status_code = 200, prompt_tokens = ?, completion_tokens = ?, cached_tokens = 0, cost = ?, billing_detail = ?, billing_features = COALESCE(?, billing_features), error_message = NULL, is_completed = 1, latency_ms = CAST(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at)) * 1000 AS INTEGER) WHERE id = ? AND (billing_detail LIKE '%冻结%' OR billing_detail LIKE '%退回%') AND status_code != 499"
            )).bind(prompt_tokens).bind(completion_tokens).bind(cost).bind(detail).bind(billing_features).bind(log_id)
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
                    // 渠道/预设：站点时区；令牌：所属用户 timedisplay（与 proxy/中间件一致）
                    let (site_tz, _) = crate::relay::get_cached_config(state).await;
                    if let Some(tid) = token_id {
                        let user_td = crate::api::date_helper::resolve_user_timedisplay_name(
                            &state.db, user_id, &site_tz,
                        )
                        .await;
                        crate::relay::token_quota::apply_delta_with_memory(
                            state, &mut tx, tid, apply_balance, &user_td,
                        )
                        .await?;
                        sqlx::query(&state.db.format_query(
                            "UPDATE api_tokens SET last_used_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
                        ))
                        .bind(tid)
                        .execute(&mut *tx)
                        .await?;
                    }
                    if let Some(cid) = channel_id {
                        if apply_balance > 0.0 {
                            crate::relay::channel_quota::consume_channel(
                                &state.db, &mut tx, cid, apply_balance, &site_tz,
                            )
                            .await?;
                        } else {
                            crate::relay::channel_quota::refund_channel(
                                &state.db, &mut tx, cid, -apply_balance, &site_tz,
                            )
                            .await?;
                        }
                    }
                    // 从日志取上游预设 ID 以便同步累加/退回预设额度
                    let cfg_id: Option<i32> = sqlx::query_scalar(
                        &state.db.format_query("SELECT channel_config_id FROM logs WHERE id = ?")
                    )
                    .bind(log_id)
                    .fetch_optional(&mut *tx)
                    .await?
                    .flatten();
                    if let Some(cfg_id) = cfg_id {
                        if cfg_id > 0 {
                            if apply_balance > 0.0 {
                                crate::relay::channel_quota::consume_config(
                                    &state.db, &mut tx, cfg_id as i64, apply_balance, &site_tz,
                                )
                                .await?;
                            } else {
                                crate::relay::channel_quota::refund_config(
                                    &state.db, &mut tx, cfg_id as i64, -apply_balance, &site_tz,
                                )
                                .await?;
                            }
                        }
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
                    tracing::info!(
                        "[Settlement] log_id={}, cost={:.6}, applied={:.6}",
                        log_id,
                        cost,
                        apply_balance
                    );
                    // 异步任务结算成功：补记实时 TPM（该路径不经 record_and_bill_inner）
                    if let Some(tid) = token_id {
                        let live_total = (prompt_tokens.max(0) as u64)
                            .saturating_add(completion_tokens.max(0) as u64);
                        crate::middleware::live_metrics::record_tokens(user_id, tid, live_total);
                    }
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
                "UPDATE logs SET status_code = ?, cost = 0.0, pre_deduct_gift = 0.0, billing_detail = ?, is_completed = 1, latency_ms = CAST(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at)) * 1000 AS INTEGER) WHERE id = ? AND billing_detail LIKE '%冻结%' AND status_code != 499"
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
            let res: Result<(), sqlx::Error> =
                async {
                    if pre_deduction > 0.0 {
                        let balance_refund = pre_deduction - pre_deduct_gift;
                        sqlx::query(&state.db.format_query(
                        "UPDATE users SET balance = balance + ?, gift_balance = gift_balance + ?, \
                         updated_at = CURRENT_TIMESTAMP WHERE id = ?"
                    )).bind(balance_refund).bind(pre_deduct_gift).bind(user_id)
                    .execute(&mut *tx).await?;

                        let (site_tz, _) = crate::relay::get_cached_config(state).await;
                        if let Some(tid) = token_id {
                            let user_td = crate::api::date_helper::resolve_user_timedisplay_name(
                                &state.db, user_id, &site_tz,
                            )
                            .await;
                            crate::relay::token_quota::refund(
                                &state.db,
                                &mut tx,
                                tid,
                                pre_deduction,
                                &user_td,
                            )
                            .await?;
                            state
                                .quota_memory
                                .apply_refund_ensured(&state.db, tid, &user_td, pre_deduction)
                                .await;
                        }
                        if let Some(cid) = channel_id {
                            crate::relay::channel_quota::refund_channel(
                                &state.db,
                                &mut tx,
                                cid,
                                pre_deduction,
                                &site_tz,
                            )
                            .await?;
                        }
                        let cfg_id: Option<i32> = sqlx::query_scalar(
                            &state
                                .db
                                .format_query("SELECT channel_config_id FROM logs WHERE id = ?"),
                        )
                        .bind(log_id)
                        .fetch_optional(&mut *tx)
                        .await?
                        .flatten();
                        if let Some(cfg_id) = cfg_id {
                            if cfg_id > 0 {
                                crate::relay::channel_quota::refund_config(
                                    &state.db,
                                    &mut tx,
                                    cfg_id as i64,
                                    pre_deduction,
                                    &site_tz,
                                )
                                .await?;
                            }
                        }
                    }
                    Ok(())
                }
                .await;

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
    jimeng_ctx: Option<(&str, &str)>, // (upstream_req_content, request_content)
) -> Result<(String, String), String> {
    let is_tencent = resolved.target_type.starts_with("tencent_vod");
    let is_jimeng = resolved.target_type.starts_with("jimeng_");

    // 即梦AI：POST 轮询（req_key + task_id + 可选 req_json）
    if is_jimeng {
        let (ak, sk) = forward::parse_jimeng_key(&channel.api_key);
        // req_key 从 upstream_req_content 提取
        let (upstream_req_str, request_content_str) = jimeng_ctx.unwrap_or(("", ""));
        let jimeng_req_key = serde_json::from_str::<serde_json::Value>(upstream_req_str)
            .ok()
            .and_then(|v| {
                v.get("req_key")
                    .and_then(|r| r.as_str().map(|s| s.to_string()))
            })
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
                let return_url =
                    if let Some(rf) = req.get("response_format").and_then(|v| v.as_str()) {
                        rf != "b64_json" // b64_json 返回 base64，其他（url 等）返回 URL
                    } else {
                        true // 未指定时默认返回 URL
                    };
                assembled.insert("return_url".to_string(), serde_json::json!(return_url));
                if req
                    .get("watermark")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false)
                {
                    assembled.insert(
                        "logo_info".to_string(),
                        serde_json::json!({"add_logo": true}),
                    );
                }
                poll_body["req_json"] = serde_json::json!(serde_json::to_string(
                    &serde_json::json!(assembled)
                )
                .unwrap_or_default());
            }
        } else {
            // request_content 解析失败时仍兜底 return_url
            poll_body["req_json"] = serde_json::json!("{\"return_url\":true}");
        }
        let body_str = serde_json::to_string(&poll_body).unwrap_or_default();
        let headers = forward::build_jimeng_headers(
            ak,
            sk,
            "CVSync2AsyncGetResult",
            &body_str,
            &channel.base_url,
        );
        let poll_url = format!(
            "{}/?Action=CVSync2AsyncGetResult&Version=2022-08-31",
            channel.base_url.trim_end_matches('/')
        );
        tracing::info!("轮询 url={}", poll_url);
        let mut builder = http_client
            .post(&poll_url)
            .header("Content-Type", "application/json")
            .timeout(std::time::Duration::from_secs(30));
        for (k, v) in headers {
            builder = builder.header(k, v);
        }
        // 使用已签名的 body_str 发送，避免 .json() 重新序列化导致签名不匹配
        let resp = builder
            .body(body_str)
            .send()
            .await
            .map_err(|e| proxy::sanitize_error_message(&format!("请求渠道失败: {}", e)))?;
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
        custom_path
            .replace("${task_id}", task_id)
            .replace("${model}", model)
    } else if resolved.target_type.is_empty()
        || resolved.target_type == "openai"
        || resolved.target_type == "apimart"
    {
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
        let tc_headers =
            forward::build_tencent_vod_headers(ak, sk, "DescribeTaskDetail", &body_str);
        let mut builder = http_client
            .post(&url)
            .timeout(std::time::Duration::from_secs(30));
        for (k, v) in tc_headers {
            builder = builder.header(k, v);
        }
        // 使用已签名的 body_str 发送，避免 .json() 重新序列化导致签名不匹配
        builder.body(body_str).send().await
    } else {
        let auth = forward::build_auth_headers(resolved, &channel.api_key);
        let mut builder = http_client
            .get(&url)
            .timeout(std::time::Duration::from_secs(30));
        for (k, v) in auth {
            builder = builder.header(k, v);
        }
        builder.send().await
    };

    let resp = resp.map_err(|e| proxy::sanitize_error_message(&format!("请求渠道失败: {}", e)))?;
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
    jimeng_ctx: Option<(&str, &str)>, // 轮询上下文：(upstream_req_content, request_content)，即梦等厂商需要
) -> Option<(String, String)> {
    let is_tencent = resolved.target_type.starts_with("tencent_vod");
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(timeout_secs);
    let mut interval_secs: u64 = 2;
    let mut consecutive_errors: u32 = 0;
    let mut attempt: u32 = 0;

    tracing::info!(
        "[PollTask] 开始轮询 task_id={}, timeout={}s",
        task_id,
        timeout_secs
    );

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
                let resp_json: serde_json::Value =
                    serde_json::from_str(&body).unwrap_or(serde_json::json!({}));
                let raw_status = super::response_formatter::extract_raw_status(&resp_json);
                let task_status = normalize_task_status(&raw_status).to_string();

                tracing::info!(
                    "[PollTask] 轮询第 {} 次, task_id={}, status={}",
                    attempt,
                    task_id,
                    task_status
                );

                if task_status == "succeeded" || task_status == "failed" {
                    tracing::info!(
                        "[PollTask] 终态 task_id={}, status={}, body_len={}",
                        task_id,
                        task_status,
                        body.len()
                    );
                    let store_body = if is_tencent {
                        log_tencent_poll_raw("PollTask", task_id, &body);
                        super::response_formatter::format_openai(
                            &category,
                            &body,
                            false,
                            Some(task_id),
                        )
                    } else {
                        body
                    };
                    return Some((store_body, task_status));
                }
            }
            Err(e) => {
                consecutive_errors += 1;
                tracing::warn!(
                    "[PollTask] 轮询请求失败 ({}/3): {} (task_id={})",
                    consecutive_errors,
                    e,
                    task_id
                );
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

    tracing::warn!(
        "[PollTask] 轮询超时 task_id={}, 已尝试 {} 次",
        task_id,
        attempt
    );
    None
}

/// 级联阶段二提交核心：阶段一底座视频成功后，向画质增强服务提交超分任务。
/// 入口用进程内 DashMap 互斥（输家零查询）；结束 Drop 释放，不残留。
/// 手动轮询（task_status）和后台轮询（sync_single_task）共用此函数。
async fn cascade_stage2_submit(
    state: &Arc<AppState>,
    user_id: &str,
    token_id: Option<i64>,
    task_id: &str,
    db_log_id: i64,
    log_post_response: &str,
    log_request_content: &str,
    log_upstream_req: &str,
    pre_deduction: f64,
    pre_deduct_gift: f64,
    stage1_channel: &crate::models::Channel,
    base_video_url: &str,
    log_plugin_tag: &str,
    stage1_response: &str,
) -> Result<CascadeS2SubmitOutcome, String> {
    // 同 log 仅一人进入；_guard Drop 时 remove，成功/失败/早退/panic 均释放
    let Some(_guard) = CascadeS2InflightGuard::try_acquire(&state.cascade_s2_inflight, db_log_id)
    else {
        tracing::debug!("[Cascade S2] skip log_id={db_log_id}（并发互斥）");
        return Ok(CascadeS2SubmitOutcome::InProgress);
    };

    let post_resp: serde_json::Value =
        serde_json::from_str(log_post_response).unwrap_or(serde_json::json!({}));

    // 预先擦除 plugin_tag 中包含的 API 秘钥
    let mut updated_tag_opt: Option<String> = None;
    if !log_plugin_tag.is_empty() {
        if let Ok(mut pt) = serde_json::from_str::<serde_json::Value>(log_plugin_tag) {
            if let Some(cascade) = pt.get_mut("cascade").and_then(|v| v.as_object_mut()) {
                if cascade.remove("api_key").is_some() {
                    updated_tag_opt = Some(pt.to_string());
                }
            }
        }
    }
    let s1_json: serde_json::Value =
        serde_json::from_str(stage1_response).unwrap_or(serde_json::json!({}));

    // 错误退款 + DB更新 内部辅助闭包（减少重复 SQL 写入代码）
    let write_error = |state: &Arc<AppState>,
                       err_msg: &str,
                       post_resp_json: &serde_json::Value,
                       s1: &serde_json::Value,
                       s2_raw: &str,
                       tag: &Option<String>| {
        let state = state.clone();
        let err = err_msg.to_string();
        let updated = serde_json::json!({"stage1": post_resp_json, "stage2": s2_raw}).to_string();
        let s2_json: serde_json::Value =
            serde_json::from_str(s2_raw).unwrap_or(serde_json::json!(s2_raw));
        let resp_content = serde_json::json!({"stage1": s1, "stage2": s2_json}).to_string();
        let tag = tag.clone();
        let db_id = db_log_id;
        async move {
            let _ = sqlx::query(&state.db.format_query(
                "UPDATE logs SET post_response = ?, response_content = ?, error_message = ?, plugin_tag = COALESCE(?, plugin_tag) WHERE id = ?"
            )).bind(&updated).bind(&resp_content).bind(&err).bind(&tag).bind(db_id).execute(&state.db.pool).await;
        }
    };

    if base_video_url.is_empty() {
        let err_msg = "底座视频生成成功但未能获取到视频直链地址";
        execute_refund_tx(
            state,
            db_log_id,
            user_id,
            token_id,
            Some(stage1_channel.id),
            pre_deduction,
            pre_deduct_gift,
            err_msg,
            500,
        )
        .await;
        write_error(
            state,
            err_msg,
            &post_resp,
            &s1_json,
            err_msg,
            &updated_tag_opt,
        )
        .await;
        return Err(err_msg.to_string());
    }

    // 与轮询侧共用 cascade 解析（缺省与原先硬编码一致：volcengine_sign / enhance-video）
    let seed_resolved = forward::ResolvedForward {
        target_type: "volcengine_media_enhance".to_string(),
        upstream_path: "/api/v1/tools/enhance-video".to_string(),
        auth_type: "volcengine_sign".to_string(),
        ..Default::default()
    };
    let (enhance_ch, mut volc_resolved, final_model) =
        cascade_stage2_poll_target(stage1_channel, &seed_resolved, log_plugin_tag, task_id);
    // mid 缺省时仍带 Some("vve-sd")，供鉴权/路径使用（与历史提交逻辑一致）
    let volc_model_mid = volc_resolved
        .mid
        .get_or_insert_with(|| "vve-sd".to_string())
        .clone();

    // 阶段一响应 480p + 16:9/9:16：先裁成标准 480p 再超分（失败内部回退原底座）
    let base_video_url = cascade_ensure_standard_480p_video(
        &state.http_client,
        &enhance_ch,
        &volc_resolved,
        base_video_url,
        &s1_json,
    )
    .await;

    // 优先 cascade 已校验分辨率；无则回退请求体（旧日志兼容）
    let target_resolution = cascade_json_str(log_plugin_tag, "/cascade/resolution")
        .or_else(|| cascade_json_str(log_request_content, "/resolution"))
        .unwrap_or_else(|| "720p".into());
    let volc_url = forward::build_upstream_url(
        &enhance_ch.base_url,
        &volc_resolved,
        &final_model,
        &enhance_ch.api_key,
    );

    // 级联阶段二：仅走 vve-ft / vve-sd；tool_version 复用 MediaKit 映射（标准版需要）
    let mut volc_payload = serde_json::json!({"video_url": base_video_url, "resolution": target_resolution, "fps": 24, "bitrate_level": "high"});
    if let Some(tv) = forward::volc_enhance_tool_version(&volc_model_mid) {
        volc_payload["tool_version"] = serde_json::json!(tv);
    }
    // 阶段二提交：临时错误最多 5 次，间隔 2 分钟
    let max_attempts = 5u32;
    let retry_delay = std::time::Duration::from_secs(120);
    let mut attempt = 0u32;

    let (stage2_id, post_json) = loop {
        attempt += 1;
        let mut volc_body = volc_payload.clone();
        let builder = state
            .http_client
            .post(&volc_url)
            .header("Content-Type", "application/json");
        let builder = forward::apply_request_auth(
            builder,
            &volc_resolved,
            &enhance_ch.api_key,
            &mut volc_body,
            &enhance_ch.base_url,
        );

        let (should_retry, err_msg, err_status, raw_text) = match builder.send().await {
            Ok(resp) => {
                let status = resp.status().as_u16();
                let text = resp.text().await.unwrap_or_default();
                if status == 200 {
                    let post_json: serde_json::Value =
                        serde_json::from_str(&text).unwrap_or(serde_json::json!({}));
                    let stage2_id = super::response_formatter::find_id(&post_json);
                    if !stage2_id.is_empty() {
                        break (stage2_id, post_json);
                    }
                    (
                        false,
                        "火山增强提交成功但未能解析到超分任务 ID".to_string(),
                        500,
                        text,
                    )
                } else {
                    let err_text_raw = proxy::extract_error_message(&text);
                    let err_text = if err_text_raw.is_empty() {
                        format!("火山增强提交失败 HTTP {}", status)
                    } else {
                        err_text_raw
                    };
                    const RETRY_CODES: &[&str] = &[
                        "requestlimitexceeded",
                        "internalserviceerror",
                        "downloadfileerror",
                        "abilityprocessingerror",
                        "serviceinitializingerror",
                        "internalservicetimeout",
                    ];
                    let retry = matches!(status, 429 | 500 | 503 | 504)
                        || serde_json::from_str::<serde_json::Value>(&text)
                            .ok()
                            .and_then(|v| {
                                super::response_formatter::extract_error_code_from_value(&v)
                            })
                            .is_some_and(|code| {
                                let c = code.to_lowercase();
                                RETRY_CODES.iter().any(|&k| c.contains(k))
                            });
                    (retry, err_text, status, text)
                }
            }
            Err(e) => (
                true,
                proxy::sanitize_error_message(&format!("火山增强接口提交连接失败: {:?}", e)),
                502,
                String::new(),
            ),
        };

        if should_retry && attempt < max_attempts {
            tracing::warn!(
                "[Cascade S2 POST] 临时错误 {}/{}，休息 2 分钟后重试: {}",
                attempt,
                max_attempts,
                err_msg
            );
            tokio::time::sleep(retry_delay).await;
        } else {
            tracing::error!(
                "[Cascade S2 POST] 终态失败 ({}/{}): log_id={}, status={}, err={}",
                attempt,
                max_attempts,
                db_log_id,
                err_status,
                err_msg
            );
            execute_refund_tx(
                state,
                db_log_id,
                user_id,
                token_id,
                Some(stage1_channel.id),
                pre_deduction,
                pre_deduct_gift,
                &err_msg,
                err_status,
            )
            .await;
            write_error(
                state,
                &err_msg,
                &post_resp,
                &s1_json,
                &raw_text,
                &updated_tag_opt,
            )
            .await;
            return Err(err_msg);
        }
    };

    // 阶段二提交成功：重组 post_response 并暂存底座完整响应
    let updated = serde_json::json!({"stage1": post_resp, "stage2": post_json}).to_string();
    // 尊重 enable_log 开关：log_upstream_req 为空说明模型未开启上下文记录，阶段二出参也不写入
    let upstream_combined: Option<String> = if log_upstream_req.is_empty() {
        None
    } else {
        let s1_req: serde_json::Value =
            serde_json::from_str(log_upstream_req).unwrap_or(serde_json::json!({}));
        Some(serde_json::json!({"stage1": s1_req, "stage2": volc_payload}).to_string())
    };
    let _ = sqlx::query(&state.db.format_query("UPDATE logs SET post_response = ?, response_content = ?, upstream_req_content = COALESCE(?, upstream_req_content) WHERE id = ?"))
        .bind(&updated).bind(stage1_response).bind(&upstream_combined).bind(db_log_id).execute(&state.db.pool).await;

    tracing::info!(
        "[Cascade S2] submitted log_id={} stage1={} stage2={} mid={} res={} ch={}",
        db_log_id,
        task_id,
        stage2_id,
        volc_model_mid,
        target_resolution,
        enhance_ch.name
    );
    Ok(CascadeS2SubmitOutcome::Submitted(stage2_id))
}
