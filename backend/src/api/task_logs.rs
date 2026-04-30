use axum::{
    extract::{Query, State, Extension},
    Json,
};
use std::sync::Arc;
use crate::AppState;
use crate::auth;
use crate::models::{TaskLog, TaskLogQuery, TaskLogListResponse};
use crate::error::AppResult;
use crate::relay::task_poller::sync_single_task;

/// 任务日志列表 — 基于 logs 表构建任务视图
/// 管理员看全部，普通用户只看自己的
/// 仅返回成功(200)的记录，失败记录在使用日志中查看
pub async fn list_task_logs(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Query(query): Query<TaskLogQuery>,
) -> AppResult<Json<TaskLogListResponse>> {
    let page = query.page.unwrap_or(1);
    let per_page = query.per_page.unwrap_or(20).min(100);
    let offset = (page - 1) * per_page;

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
            "other" => where_clause.push_str(" AND l.action_type = '其它'"),
            _ => {}
        }
    }

    if let Some(ref m) = query.model {
        where_clause.push_str(" AND l.model LIKE ?");
        binds.push(format!("%{}%", m));
    }

    if let Some(ref s) = query.start_date {
        where_clause.push_str(" AND l.created_at::timestamptz >= ?::timestamptz");
        let start_str = if s.contains('T') { s.clone() } else { format!("{} 00:00:00", s) };
        binds.push(start_str);
    }
    if let Some(ref e) = query.end_date {
        where_clause.push_str(" AND l.created_at::timestamptz <= ?::timestamptz");
        let end_str = if e.contains('T') { e.clone() } else { format!("{} 23:59:59", e) };
        binds.push(end_str);
    }

    // 总数查询（无需 JOIN，仅依赖 logs 表条件）
    let count_sql = state.db.format_query(&format!(
        "SELECT COUNT(*) FROM logs l{}", where_clause
    ));
    let mut cq = sqlx::query_scalar::<_, i64>(&count_sql);
    for v in &binds { cq = cq.bind(v); }
    let total = cq.fetch_one(&state.db.pool).await?;

    // 数据查询
    let data_sql = state.db.format_query(&format!(
        "SELECT l.id, l.user_id, l.channel_id, l.model, l.endpoint, \
         l.prompt_tokens, l.completion_tokens, l.cached_tokens, l.cost, l.latency_ms, l.status_code, \
         l.error_message, l.request_content, l.response_content, l.billing_detail, \
         c.name AS channel_name, c.group_aid AS channel_group_aid, \
         COALESCE(u.nickname, u.username) AS user_nickname, \
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
        for log in &mut data {
            log.request_content = None;
            log.response_content = None;
        }
    }
    Ok(Json(TaskLogListResponse { data, total }))
}

/// 手动同步单个任务日志状态
pub async fn sync_task_log(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    axum::extract::Path(id): axum::extract::Path<i64>,
) -> AppResult<Json<serde_json::Value>> {
    // 权限校验：如果不是 admin，需要验证这条记录的 owner 是他自己
    if claims.role != "admin" {
        let owner_id: Option<String> = sqlx::query_scalar(&state.db.format_query("SELECT user_id FROM logs WHERE id = ?"))
            .bind(id)
            .fetch_optional(&state.db.pool)
            .await?;
        if owner_id.as_deref() != Some(claims.sub.as_str()) {
            return Err(crate::error::AppError::Forbidden("无权操作此记录".to_string()));
        }
    }

    match sync_single_task(&state, id).await {
        Ok(msg) => Ok(Json(serde_json::json!({ "message": msg }))),
        Err(e) => Err(crate::error::AppError::Internal(e.to_string())),
    }
}
