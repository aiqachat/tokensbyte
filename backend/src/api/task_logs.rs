/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

use crate::api::logs::{
    deferred_join_page_sql, fetch_logs_count, push_created_at_bound, resolve_user_filter,
    SQL_BILLING_SETTLE_FLAGS, SQL_VISION_ACTION_FILTER,
};
use crate::auth;
use crate::error::{AppError, AppResult};
use crate::models::{TaskLog, TaskLogListResponse, TaskLogQuery};
use crate::relay::task::sync_single_task;
use crate::time_system::DbTs;
use crate::AppState;
use axum::http::{header, StatusCode};
use axum::{
    extract::{Extension, Query, State},
    response::{IntoResponse, Response},
    Json,
};
use std::sync::Arc;

/// 构建任务日志公共 WHERE（仅 logs 列，COUNT 无需 JOIN）
fn build_task_log_where(claims: &auth::Claims, query: &TaskLogQuery) -> (String, Vec<String>) {
    let mut where_clause = " WHERE l.status_code = 200".to_string();
    let mut binds: Vec<String> = Vec::new();

    if claims.role != "admin" {
        where_clause.push_str(" AND l.user_id = ?");
        binds.push(claims.sub.clone());
    } else if let Some(ref uid) = query.user_id {
        where_clause.push_str(" AND l.user_id = ?");
        binds.push(uid.clone());
    }

    if let Some(ref at) = query.action_type {
        match at.as_str() {
            "chat" => where_clause.push_str(" AND l.action_type = '聊天'"),
            "image" => where_clause.push_str(" AND l.action_type = '图片'"),
            "video" => where_clause.push_str(" AND l.action_type = '视频'"),
            "vision" | "视觉模型" | "视觉" => where_clause.push_str(SQL_VISION_ACTION_FILTER),
            "other" => where_clause.push_str(" AND l.action_type = '其它'"),
            v if !v.is_empty() => {
                where_clause.push_str(" AND l.action_type = ?");
                binds.push(v.to_string());
            }
            _ => {}
        }
    }

    if let Some(ref m) = query.model {
        where_clause.push_str(" AND l.model LIKE ?");
        let escaped = m.replace('%', "\\%").replace('_', "\\_");
        binds.push(format!("%{}%", escaped));
    }

    if let Some(ref s) = query.start_date {
        push_created_at_bound(&mut where_clause, &mut binds, s, false);
    }
    if let Some(ref e) = query.end_date {
        push_created_at_bound(&mut where_clause, &mut binds, e, true);
    }

    if let Some(ref log_id) = query.log_id {
        if !log_id.is_empty() {
            where_clause.push_str(" AND l.log_id = ?");
            binds.push(log_id.clone());
        }
    }

    if let Some(ref task_id) = query.task_id {
        if !task_id.is_empty() {
            where_clause.push_str(" AND l.task_id = ?");
            binds.push(task_id.clone());
        }
    }

    if let Some(ref keyword) = query.search_keyword {
        if !keyword.is_empty() {
            where_clause.push_str(" AND (l.log_id = ? OR l.task_id = ?)");
            binds.push(keyword.clone());
            binds.push(keyword.clone());
        }
    }

    (where_clause, binds)
}

const TASK_LIST_JOINS: &str = " LEFT JOIN channels c ON l.channel_id = c.id \
         LEFT JOIN channel_configs cc ON l.channel_config_id = cc.id \
         LEFT JOIN users u ON l.user_id = u.id";

const TASK_EXPORT_JOINS: &str = " LEFT JOIN channels c ON l.channel_id = c.id \
         LEFT JOIN users u ON l.user_id = u.id";

/// 列表可预览类型（与前端预览按钮一致）；仅这些行读 response_content。
fn preview_urls_from_response(raw: &str) -> Vec<String> {
    let Ok(v) = serde_json::from_str::<serde_json::Value>(raw) else {
        return Vec::new();
    };
    // 级联 {stage1,stage2} 取产物 stage2，避免扫到 stage1 输入图
    let root = match (v.get("stage1"), v.get("stage2")) {
        (Some(_), Some(s2)) => s2,
        _ => &v,
    };
    // 只回传 http(s)：日志里 base64 已脱敏为占位符，data: 无预览价值且易撑爆分页
    crate::relay::response_formatter::find_urls(root)
        .into_iter()
        .filter(|u| u.starts_with("http://") || u.starts_with("https://"))
        .collect()
}

/// 任务日志列表 — 基于 logs 表；仅成功(200)；管理员看全部，普通用户只看自己的
pub async fn list_task_logs(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Query(query): Query<TaskLogQuery>,
) -> AppResult<Json<TaskLogListResponse>> {
    let page = query.page.unwrap_or(1).max(1);
    let per_page = query.per_page.unwrap_or(20).min(100);
    let offset = (page - 1) * per_page;

    let mut q = query.clone();
    if claims.role == "admin" {
        if let Some(ref uid) = q.user_id {
            q.user_id = Some(resolve_user_filter(&state.db, uid).await?);
        }
    }

    let (where_clause, binds) = build_task_log_where(&claims, &q);

    // allow_details 仅告知前端可否展开完整详情；媒体预览走下方 preview_urls，不依赖该开关
    let mut allow_details = true;
    if claims.role != "admin" {
        let perm: Option<i32> = sqlx::query_scalar(
            &state.db.format_query(
                "SELECT ul.allow_view_log_details FROM users u LEFT JOIN user_levels ul ON u.user_group = ul.group_key WHERE u.id = ?",
            ),
        )
        .bind(&claims.sub)
        .fetch_optional(&state.db.pool)
        .await?
        .flatten();
        allow_details = perm.unwrap_or(1) == 1;
    }

    // 仅媒体类读 response_content，内存抽 preview_urls 后丢弃大字段（一次查询、不回传正文）
    let data_sql = state.db.format_query(&deferred_join_page_sql(
        &format!(
            "SELECT l.id, l.log_id, l.user_id, l.channel_id, l.model, l.endpoint, \
             l.prompt_tokens, l.completion_tokens, l.cached_tokens, l.cost, l.latency_ms, l.status_code, \
             l.error_message, \
             CASE WHEN l.action_type IN ('图片','视频','视频增强') THEN l.response_content ELSE NULL END AS response_content, \
             {SQL_BILLING_SETTLE_FLAGS}, \
             c.name AS channel_name, c.group_aid AS channel_group_aid, c.provider_type AS channel_provider_type, \
             COALESCE(u.nickname, u.username) AS user_nickname, u.uid AS user_uid, \
             l.task_id, l.action_type, cc.yid AS yid, l.billing_pid, l.forward_eid, l.created_at"
        ),
        TASK_LIST_JOINS,
        &where_clause,
        per_page,
        offset,
    ));
    let binds_data = binds.clone();
    let db = state.db.clone();

    let (total_res, data_res) =
        tokio::join!(fetch_logs_count(&state.db, &where_clause, &binds), async {
            let mut dq = sqlx::query_as::<_, TaskLog>(&data_sql);
            for v in &binds_data {
                dq = dq.bind(v);
            }
            dq.fetch_all(&db.pool).await
        },);
    let total = total_res?;
    let mut data = data_res?;

    let is_admin = claims.role == "admin";
    for log in &mut data {
        if let Some(raw) = log.response_content.take() {
            log.preview_urls = preview_urls_from_response(&raw);
        }
        if !is_admin {
            if let Some(ref err) = log.error_message {
                log.error_message = Some(crate::relay::proxy::sanitize_error_message(err));
            }
            log.channel_id = None;
            log.channel_name = None;
            log.channel_group_aid = None;
        }
    }

    Ok(Json(TaskLogListResponse {
        data,
        total,
        allow_details,
    }))
}

/// 手动同步单个任务日志状态
pub async fn sync_task_log(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    axum::extract::Path(log_id): axum::extract::Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    let row: Option<(i64, String)> = sqlx::query_as(
        &state
            .db
            .format_query("SELECT id, user_id FROM logs WHERE log_id = ?"),
    )
    .bind(&log_id)
    .fetch_optional(&state.db.pool)
    .await?;
    let (id, owner_id) = match row {
        Some(r) => r,
        None => {
            return Err(crate::error::AppError::BadRequest(
                "日志记录不存在".to_string(),
            ))
        }
    };

    if claims.role != "admin" && owner_id != claims.sub {
        return Err(crate::error::AppError::Forbidden(
            "无权操作此记录".to_string(),
        ));
    }

    match sync_single_task(&state, id).await {
        Ok(msg) => Ok(Json(serde_json::json!({ "message": msg }))),
        Err(e) => Err(crate::error::AppError::UpstreamError(e.to_string())),
    }
}

const TASK_EXPORT_LIMIT: i64 = 100_000;

#[derive(sqlx::FromRow)]
struct ExportRow {
    id: i64,
    user_id: String,
    model: String,
    prompt_tokens: i32,
    completion_tokens: i32,
    cached_tokens: i32,
    cost: f64,
    latency_ms: i32,
    status_code: i32,
    action_type: Option<String>,
    task_id: Option<String>,
    billing_detail: Option<String>,
    created_at: DbTs,
    channel_name: Option<String>,
    channel_group_aid: Option<String>,
    #[allow(dead_code)]
    channel_provider_type: Option<String>,
    user_nickname: Option<String>,
    user_uid: Option<String>,
}

pub async fn export_task_logs(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Query(query): Query<TaskLogQuery>,
) -> Result<Response, AppError> {
    if claims.role != "admin" {
        return Err(AppError::Forbidden("仅超级管理员可导出数据".to_string()));
    }

    let mut q = query.clone();
    if let Some(ref uid) = q.user_id {
        q.user_id = Some(resolve_user_filter(&state.db, uid).await?);
    }

    let (where_clause, binds) = build_task_log_where(&claims, &q);
    let total = fetch_logs_count(&state.db, &where_clause, &binds).await?;

    if total > TASK_EXPORT_LIMIT {
        return Ok((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "error": format!("当前筛选条件下共 {} 条数据，超出单次导出上限 {} 条，请缩小时间范围或增加筛选条件后重试", total, TASK_EXPORT_LIMIT)
            })),
        )
            .into_response());
    }

    let data_sql = state.db.format_query(&format!(
        "SELECT l.id, l.user_id, l.model, l.prompt_tokens, l.completion_tokens, l.cached_tokens, \
         l.cost, l.latency_ms, l.status_code, l.action_type, l.task_id, \
         l.billing_detail, l.created_at, \
         c.name as channel_name, c.group_aid as channel_group_aid, c.provider_type as channel_provider_type, \
         COALESCE(u.nickname, u.username) as user_nickname, u.uid as user_uid \
         FROM logs l{TASK_EXPORT_JOINS} \
         {where_clause} ORDER BY l.created_at DESC LIMIT {TASK_EXPORT_LIMIT}"
    ));

    let rows: Vec<ExportRow> = {
        let mut q = sqlx::query_as(&data_sql);
        for v in &binds {
            q = q.bind(v);
        }
        q.fetch_all(&state.db.pool).await?
    };

    let mut csv = String::from("\u{FEFF}ID,用户ID,用户UID,用户昵称,模型,类型,任务ID,输入Tokens,输出Tokens,缓存Tokens,费用,耗时(ms),状态码,渠道,渠道AID,计费明细,时间\n");
    for r in &rows {
        let formatted_time = crate::api::logs::format_db_time(&r.created_at);
        csv.push_str(&format!(
            "{},{},\"{}\",\"{}\",\"{}\",\"{}\",\"{}\",{},{},{},{:.6},{},{},\"{}\",\"{}\",\"{}\",\"{}\"\n",
            r.id,
            r.user_id,
            r.user_uid.as_deref().unwrap_or("-"),
            r.user_nickname.as_deref().unwrap_or("-").replace('"', "\"\""),
            r.model.replace('"', "\"\""),
            r.action_type.as_deref().unwrap_or("-"),
            r.task_id.as_deref().unwrap_or("-"),
            r.prompt_tokens,
            r.completion_tokens,
            r.cached_tokens,
            r.cost,
            r.latency_ms,
            r.status_code,
            r.channel_name.as_deref().unwrap_or("-").replace('"', "\"\""),
            r.channel_group_aid.as_deref().unwrap_or("-"),
            r.billing_detail.as_deref().unwrap_or("").replace('"', "\"\""),
            formatted_time,
        ));
    }

    let filename = format!(
        "task_logs_{}.csv",
        chrono::Local::now().format("%Y%m%d_%H%M%S")
    );
    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "text/csv; charset=utf-8")
        .header(
            header::CONTENT_DISPOSITION,
            format!("attachment; filename=\"{}\"", filename),
        )
        .body(axum::body::Body::from(csv))
        .unwrap())
}

/// 取消火山方舟视频任务（管理端接口，JWT 鉴权）
pub async fn cancel_task_log(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    axum::extract::Path(log_id): axum::extract::Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    let row: Option<(i64, String, String, i64, Option<String>, String, Option<i32>)> = sqlx::query_as(
        &state.db.format_query(
            "SELECT id, user_id, COALESCE(task_id, ''), channel_id, billing_detail, COALESCE(upstream_url, ''), channel_config_id FROM logs WHERE log_id = ?"
        )
    ).bind(&log_id).fetch_optional(&state.db.pool).await?;

    let (id, user_id, task_id, channel_id, billing_detail, upstream_url, log_cfg_id) = match row {
        Some(r) => r,
        None => return Err(AppError::BadRequest("日志记录不存在".to_string())),
    };

    if claims.role != "admin" && user_id != claims.sub {
        return Err(AppError::Forbidden("无权操作此记录".to_string()));
    }

    if task_id.is_empty() {
        return Err(AppError::BadRequest(
            "此记录无关联任务ID，不支持取消操作".to_string(),
        ));
    }

    if !upstream_url.contains("contents/generations") {
        return Err(AppError::BadRequest(
            "仅火山方舟视频任务支持取消操作".to_string(),
        ));
    }

    let is_frozen = billing_detail
        .as_deref()
        .map_or(false, |d| d.contains("冻结"));
    if !is_frozen {
        return Err(AppError::BadRequest(
            "任务已完成或已取消，无法再次操作".to_string(),
        ));
    }

    let channel = crate::relay::router::fetch_channel(&state, channel_id, log_cfg_id)
        .await
        .ok_or_else(|| AppError::BadRequest("任务对应的渠道不存在或已被删除".to_string()))?;

    let url = crate::relay::url_utils::join_url(
        &channel.base_url,
        &format!("/api/v3/contents/generations/tasks/{}", task_id),
    );
    tracing::info!(
        "[CancelTaskLog] user={}, log_id={}, task_id={}, url={}",
        user_id,
        id,
        task_id,
        url
    );

    let resp = state
        .http_client
        .delete(&url)
        .header("Authorization", format!("Bearer {}", channel.api_key))
        .timeout(std::time::Duration::from_secs(15))
        .send()
        .await
        .map_err(|e| AppError::UpstreamError(format!("请求上游失败: {}", e)))?;

    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let err_body = resp.text().await.unwrap_or_default();
        tracing::warn!(
            "[CancelTaskLog] 上游返回错误 status={}, body={}",
            status,
            err_body
        );
        let detail = serde_json::from_str::<serde_json::Value>(&err_body)
            .ok()
            .and_then(|v| {
                v.pointer("/error/message")
                    .or(v.get("message"))
                    .and_then(|m| m.as_str())
                    .map(|s| s.to_string())
            })
            .unwrap_or_else(|| format!("上游返回错误状态码: {}", status));
        return Err(AppError::UpstreamError(detail));
    }

    let log_data: Option<(f64, f64, Option<i64>, Option<i64>)> =
        sqlx::query_as(&state.db.format_query(
            "SELECT cost, pre_deduct_gift, token_id, channel_id FROM logs WHERE id = ?",
        ))
        .bind(id)
        .fetch_optional(&state.db.pool)
        .await
        .unwrap_or(None);

    let (pre_deduction, pre_deduct_gift, token_id_opt, channel_id_opt) =
        log_data.unwrap_or((0.0, 0.0, None, None));
    crate::relay::task::execute_refund_tx(
        &state,
        id,
        &user_id,
        token_id_opt,
        channel_id_opt,
        pre_deduction,
        pre_deduct_gift,
        "用户主动取消任务，预扣费已退回",
        499,
    )
    .await;
    tracing::info!(
        "[CancelTaskLog] 任务已取消 log_id={}, refunded={:.6}",
        id,
        pre_deduction
    );

    Ok(Json(
        serde_json::json!({ "message": "任务已取消，预扣费已退回" }),
    ))
}
