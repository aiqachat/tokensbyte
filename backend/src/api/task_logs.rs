use axum::{
    extract::{Query, State, Extension},
    Json,
    response::{IntoResponse, Response},
};
use axum::http::{header, StatusCode};
use std::sync::Arc;
use crate::AppState;
use crate::auth;
use crate::models::{TaskLog, TaskLogQuery, TaskLogListResponse};
use crate::error::{AppResult, AppError};
use crate::relay::task::sync_single_task;

/// 构建任务日志公共 WHERE 子句与绑定参数
fn build_task_log_where(claims: &auth::Claims, query: &TaskLogQuery) -> (String, Vec<String>) {
    let mut where_clause = " WHERE l.status_code = 200".to_string();
    let mut binds: Vec<String> = Vec::new();

    // 权限控制
    if claims.role != "admin" {
        where_clause.push_str(" AND l.user_id = ?");
        binds.push(claims.sub.clone());
    } else if let Some(ref uid) = query.user_id {
        where_clause.push_str(" AND l.user_id = ?");
        binds.push(uid.clone());
    }

    // 按类型精准筛选（历史数据已通过 migration 自动清洗填充了 action_type）
    if let Some(ref at) = query.action_type {
        match at.as_str() {
            "chat" => where_clause.push_str(" AND l.action_type = '聊天'"),
            "image" => where_clause.push_str(" AND l.action_type = '图片'"),
            "video" => where_clause.push_str(" AND l.action_type = '视频'"),
            "vision" | "视觉模型" | "视觉" => where_clause.push_str(" AND (l.action_type = '图片' OR l.action_type = '视频' OR l.action_type = '视觉模型' OR l.action_type = '视觉')"),
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
        where_clause.push_str(" AND l.created_at::timestamptz >= ?::timestamptz");
        let start_str = if s.contains('T') { s.clone() } else { format!("{} 00:00:00+08:00", s) };
        binds.push(start_str);
    }
    if let Some(ref e) = query.end_date {
        where_clause.push_str(" AND l.created_at::timestamptz <= ?::timestamptz");
        let end_str = if e.contains('T') { e.clone() } else { format!("{} 23:59:59+08:00", e) };
        binds.push(end_str);
    }

    if let Some(ref log_id) = query.log_id {
        if !log_id.is_empty() {
            where_clause.push_str(" AND l.log_id = ?");
            binds.push(log_id.clone());
        }
    }

    (where_clause, binds)
}

/// 任务日志列表 — 基于 logs 表构建任务视图
/// 管理员看全部，普通用户只看自己的
/// 仅返回成功(200)的记录，失败记录在使用日志中查看
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
            let resolved: Option<String> = sqlx::query_scalar(&state.db.format_query("SELECT id FROM users WHERE uid = ? OR id = ? OR username = ?"))
                .bind(uid)
                .bind(uid)
                .bind(uid)
                .fetch_optional(&state.db.pool)
                .await?;
            if let Some(uuid) = resolved {
                q.user_id = Some(uuid);
            } else {
                q.user_id = Some("NOT_FOUND_USER".to_string());
            }
        }
    }

    let (where_clause, binds) = build_task_log_where(&claims, &q);

    // 总数查询（无需 JOIN，仅依赖 logs 表条件）
    let count_sql = state.db.format_query(&format!(
        "SELECT COUNT(*) FROM logs l{}", where_clause
    ));
    let mut cq = sqlx::query_scalar::<_, i64>(&count_sql);
    for v in &binds { cq = cq.bind(v); }
    let total = cq.fetch_one(&state.db.pool).await?;

    // 数据查询
    let data_sql = state.db.format_query(&format!(
        "SELECT l.id, l.log_id, l.user_id, l.channel_id, l.model, l.endpoint, \
         l.prompt_tokens, l.completion_tokens, l.cached_tokens, l.cost, l.latency_ms, l.status_code, \
         l.error_message, l.request_content, l.response_content, l.post_response, l.billing_detail, \
         c.name AS channel_name, c.group_aid AS channel_group_aid, \
         COALESCE(u.nickname, u.username) AS user_nickname, u.uid AS user_uid, \
         l.task_id, l.action_type, l.created_at \
         FROM logs l \
         LEFT JOIN channels c ON l.channel_id = c.id \
         LEFT JOIN users u ON l.user_id = u.id \
         {} ORDER BY l.created_at DESC LIMIT {} OFFSET {}",
        where_clause, per_page, offset
    ));
    let mut dq = sqlx::query_as::<_, TaskLog>(&data_sql);
    for v in &binds { dq = dq.bind(v); }
    let mut data = dq.fetch_all(&state.db.pool).await?;

    // 检查当前登录用户的日志详情查看权限
    let mut allow_details = true;
    if claims.role != "admin" {
        let perm: Option<i32> = sqlx::query_scalar(
            &state.db.format_query("SELECT ul.allow_view_log_details FROM users u LEFT JOIN user_levels ul ON u.user_group = ul.group_key WHERE u.id = ?")
        )
        .bind(&claims.sub)
        .fetch_optional(&state.db.pool)
        .await?
        .flatten();
        allow_details = perm.unwrap_or(1) == 1;
    }

    if !allow_details {
        if let Ok(re) = regex::Regex::new(r#"https?://[^"'\s\\]+"#) {
            for log in &mut data {
                let mut urls = Vec::new();
                let mut extract = |content: &Option<String>| {
                    if let Some(text) = content {
                        for cap in re.captures_iter(text) {
                            if let Some(m) = cap.get(0) {
                                urls.push(m.as_str().to_string());
                            }
                        }
                    }
                };
                extract(&log.response_content);

                log.request_content = None;
                log.post_response = None;
                log.billing_detail = None;

                if urls.is_empty() {
                    log.response_content = None;
                } else {
                    urls.sort();
                    urls.dedup();
                    log.response_content = Some(serde_json::to_string(&urls).unwrap_or_default());
                }
            }
        } else {
            for log in &mut data {
                log.request_content = None;
                log.response_content = None;
                log.post_response = None;
                log.billing_detail = None;
            }
        }
    }
    // 非管理员：错误信息脱敏，过滤上游域名等敏感信息，清空渠道标识
    if claims.role != "admin" {
        for log in &mut data {
            if let Some(ref err) = log.error_message {
                log.error_message = Some(crate::relay::proxy::sanitize_error_message(err));
            }
            log.channel_id = None;
            log.channel_name = None;
            log.channel_group_aid = None;
        }
    }
    Ok(Json(TaskLogListResponse { data, total, allow_details }))
}

/// 手动同步单个任务日志状态
pub async fn sync_task_log(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    axum::extract::Path(log_id): axum::extract::Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    // 通过 log_id 查找内部 id
    let row: Option<(i64, String)> = sqlx::query_as(&state.db.format_query("SELECT id, user_id FROM logs WHERE log_id = ?"))
        .bind(&log_id)
        .fetch_optional(&state.db.pool)
        .await?;
    let (id, owner_id) = match row {
        Some(r) => r,
        None => return Err(crate::error::AppError::BadRequest("日志记录不存在".to_string())),
    };

    // 权限校验：如果不是 admin，需要验证这条记录的 owner 是他自己
    if claims.role != "admin" && owner_id != claims.sub {
        return Err(crate::error::AppError::Forbidden("无权操作此记录".to_string()));
    }

    match sync_single_task(&state, id).await {
        Ok(msg) => Ok(Json(serde_json::json!({ "message": msg }))),
        Err(e) => Err(crate::error::AppError::UpstreamError(e.to_string())),
    }
}

/// 导出任务日志 CSV（仅超管可用，上限 100,000 条）
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
    created_at: String,
    channel_name: Option<String>,
    channel_group_aid: Option<String>,
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
        let resolved: Option<String> = sqlx::query_scalar(&state.db.format_query("SELECT id FROM users WHERE uid = ? OR id = ? OR username = ?"))
            .bind(uid)
            .bind(uid)
            .bind(uid)
            .fetch_optional(&state.db.pool)
            .await?;
        if let Some(uuid) = resolved {
            q.user_id = Some(uuid);
        } else {
            q.user_id = Some("NOT_FOUND_USER".to_string());
        }
    }

    let (where_clause, binds) = build_task_log_where(&claims, &q);

    // 先查总数
    let count_sql = state.db.format_query(&format!(
        "SELECT COUNT(*) FROM logs l{}", where_clause
    ));
    let mut cq = sqlx::query_scalar::<_, i64>(&count_sql);
    for v in &binds { cq = cq.bind(v); }
    let total = cq.fetch_one(&state.db.pool).await?;

    if total > TASK_EXPORT_LIMIT {
        return Ok((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "error": format!("当前筛选条件下共 {} 条数据，超出单次导出上限 {} 条，请缩小时间范围或增加筛选条件后重试", total, TASK_EXPORT_LIMIT)
            })),
        ).into_response());
    }

    let data_sql = state.db.format_query(&format!(
        "SELECT l.id, l.user_id, l.model, l.prompt_tokens, l.completion_tokens, l.cached_tokens, \
         l.cost, l.latency_ms, l.status_code, l.action_type, l.task_id, \
         l.billing_detail, l.created_at, \
         c.name as channel_name, c.group_aid as channel_group_aid, \
         COALESCE(u.nickname, u.username) as user_nickname, u.uid as user_uid \
         FROM logs l \
         LEFT JOIN channels c ON l.channel_id = c.id \
         LEFT JOIN users u ON l.user_id = u.id \
         {} ORDER BY l.created_at DESC LIMIT {}",
        where_clause, TASK_EXPORT_LIMIT
    ));

    let rows: Vec<ExportRow> = {
        let mut q = sqlx::query_as(&data_sql);
        for v in &binds { q = q.bind(v); }
        q.fetch_all(&state.db.pool).await?
    };

    let mut csv = String::from("\u{FEFF}ID,用户ID,用户UID,用户昵称,模型,类型,任务ID,输入Tokens,输出Tokens,缓存Tokens,费用,耗时(ms),状态码,渠道,渠道AID,计费明细,时间\n");
    for r in &rows {
        let formatted_time = crate::api::logs::format_db_time(&r.created_at);
        csv.push_str(&format!(
            "{},{},\"{}\",\"{}\",\"{}\",\"{}\",\"{}\",{},{},{},{:.6},{},{},\"{}\",\"{}\",\"{}\",\"{}\"\n",
            r.id, r.user_id,
            r.user_uid.as_deref().unwrap_or("-"),
            r.user_nickname.as_deref().unwrap_or("-").replace('"', "\"\""),
            r.model.replace('"', "\"\""),
            r.action_type.as_deref().unwrap_or("-"),
            r.task_id.as_deref().unwrap_or("-"),
            r.prompt_tokens, r.completion_tokens, r.cached_tokens, r.cost, r.latency_ms, r.status_code,
            r.channel_name.as_deref().unwrap_or("-").replace('"', "\"\""),
            r.channel_group_aid.as_deref().unwrap_or("-"),
            r.billing_detail.as_deref().unwrap_or("").replace('"', "\"\""),
            formatted_time,
        ));
    }

    let filename = format!("task_logs_{}.csv", chrono::Local::now().format("%Y%m%d_%H%M%S"));
    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "text/csv; charset=utf-8")
        .header(header::CONTENT_DISPOSITION, format!("attachment; filename=\"{}\"", filename))
        .body(axum::body::Body::from(csv))
        .unwrap())
}

/// 取消火山方舟视频任务（管理端接口，JWT 鉴权）
/// 通过日志 ID 查找对应的火山方舟视频任务，校验归属后转发 DELETE 到上游。
/// 成功后退还预扣费并更新日志。
pub async fn cancel_task_log(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    axum::extract::Path(log_id): axum::extract::Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    // 1. 通过 log_id 查找内部 id 和关键信息
    let row: Option<(i64, String, String, i64, Option<String>, String)> = sqlx::query_as(
        &state.db.format_query(
            "SELECT id, user_id, COALESCE(task_id, ''), channel_id, billing_detail, COALESCE(upstream_url, '') FROM logs WHERE log_id = ?"
        )
    ).bind(&log_id).fetch_optional(&state.db.pool).await?;

    let (id, user_id, task_id, channel_id, billing_detail, upstream_url) = match row {
        Some(r) => r,
        None => return Err(AppError::BadRequest("日志记录不存在".to_string())),
    };

    // 2. 权限校验：非 admin 用户需验证归属
    if claims.role != "admin" && user_id != claims.sub {
        return Err(AppError::Forbidden("无权操作此记录".to_string()));
    }

    // 3. 条件校验：必须有 task_id
    if task_id.is_empty() {
        return Err(AppError::BadRequest("此记录无关联任务ID，不支持取消操作".to_string()));
    }

    // 4. 条件校验：必须是火山方舟视频任务（upstream_url 含火山路径标识）
    if !upstream_url.contains("contents/generations") {
        return Err(AppError::BadRequest("仅火山方舟视频任务支持取消操作".to_string()));
    }

    // 5. 条件校验：任务必须仍在冻结中
    let is_frozen = billing_detail.as_deref().map_or(false, |d| d.contains("冻结"));
    if !is_frozen {
        return Err(AppError::BadRequest("任务已完成或已取消，无法再次操作".to_string()));
    }

    // 6. 获取渠道信息（含 preset 覆盖）
    let channel: crate::models::Channel = {
        let mut ch: crate::models::Channel = sqlx::query_as(
            &state.db.format_query("SELECT * FROM channels WHERE id = ?")
        ).bind(channel_id).fetch_optional(&state.db.pool).await?
            .ok_or_else(|| AppError::BadRequest("任务对应的渠道不存在或已被删除".to_string()))?;
        if let Some(pid) = ch.preset_id {
            if let Ok(Some(preset)) = sqlx::query_as::<_, crate::models::ChannelConfig>(
                &state.db.format_query("SELECT * FROM channel_configs WHERE id = ?")
            ).bind(pid).fetch_optional(&state.db.pool).await {
                ch.base_url = preset.base_url;
                ch.api_key = preset.api_key;
            }
        }
        ch
    };

    // 7. 构建并发送上游 DELETE 请求
    let url = crate::relay::url_utils::join_url(
        &channel.base_url,
        &format!("/api/v3/contents/generations/tasks/{}", task_id),
    );
    tracing::info!("[CancelTaskLog] user={}, log_id={}, task_id={}, url={}", user_id, id, task_id, url);

    let resp = state.http_client
        .delete(&url)
        .header("Authorization", format!("Bearer {}", channel.api_key))
        .timeout(std::time::Duration::from_secs(15))
        .send()
        .await
        .map_err(|e| AppError::UpstreamError(format!("请求上游失败: {}", e)))?;

    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let err_body = resp.text().await.unwrap_or_default();
        tracing::warn!("[CancelTaskLog] 上游返回错误 status={}, body={}", status, err_body);
        let detail = serde_json::from_str::<serde_json::Value>(&err_body)
            .ok()
            .and_then(|v| {
                v.pointer("/error/message").or(v.get("message"))
                    .and_then(|m| m.as_str()).map(|s| s.to_string())
            })
            .unwrap_or_else(|| format!("上游返回错误状态码: {}", status));
        return Err(AppError::UpstreamError(detail));
    }

    // 8. 取消成功，执行预扣费退还
    let log_data: Option<(f64, f64, Option<i64>, Option<i64>)> = sqlx::query_as(
        &state.db.format_query("SELECT cost, pre_deduct_gift, token_id, channel_id FROM logs WHERE id = ?")
    ).bind(id).fetch_optional(&state.db.pool).await.unwrap_or(None);

    let (pre_deduction, pre_deduct_gift, token_id_opt, channel_id_opt) = log_data.unwrap_or((0.0, 0.0, None, None));
    crate::relay::task::execute_refund_tx(
        &state, id, &user_id, token_id_opt, channel_id_opt,
        pre_deduction, pre_deduct_gift,
        "用户主动取消任务，预扣费已退回",
        499,
    ).await;
    tracing::info!("[CancelTaskLog] 任务已取消 log_id={}, refunded={:.6}", id, pre_deduction);

    Ok(Json(serde_json::json!({ "message": "任务已取消，预扣费已退回" })))
}
