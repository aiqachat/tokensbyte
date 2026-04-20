use axum::{
    extract::{Query, State, Extension},
    Json,
};
use std::sync::Arc;
use crate::AppState;
use crate::auth;
use crate::models::{RequestLog, LogQuery, LogListResponse};
use crate::error::{AppResult};

pub async fn list_logs(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Query(query): Query<LogQuery>,
) -> AppResult<Json<LogListResponse>> {
    let page = query.page.unwrap_or(1);
    let per_page = query.per_page.unwrap_or(20);
    let offset = (page - 1) * per_page;

    let mut sql = "SELECT l.*, \
        c.group_aid as channel_group_aid, c.name as channel_name, \
        COALESCE(u.nickname, u.username) as user_nickname, \
        u.user_group, \
        t.name as token_name \
        FROM logs l \
        LEFT JOIN channels c ON l.channel_id = c.id \
        LEFT JOIN users u ON l.user_id = u.id \
        LEFT JOIN api_tokens t ON l.token_id = t.id \
        WHERE 1=1".to_string();
    let mut binds: Vec<String> = Vec::new();

    if claims.role != "admin" {
        sql.push_str(" AND l.user_id = ?");
        binds.push(claims.sub.clone());
    } else if let Some(ref user_id) = query.user_id {
        sql.push_str(" AND l.user_id = ?");
        binds.push(user_id.clone());
    }

    if let Some(ref model) = query.model {
        sql.push_str(" AND l.model LIKE ?");
        binds.push(format!("%{}%", model));
    }

    if let Some(channel_id) = query.channel_id {
        sql.push_str(" AND l.channel_id = ?");
        binds.push(channel_id.to_string());
    }

    let count_sql = if let Some(from_idx) = sql.find("FROM logs") {
        format!("SELECT COUNT(*) {}", &sql[from_idx..])
    } else {
        sql.replace("SELECT l.*", "SELECT COUNT(*)")
    };
    let count_query_str = state.db.format_query(&count_sql);
    let mut count_q = sqlx::query_scalar::<_, i64>(&count_query_str);
    for val in &binds {
        count_q = count_q.bind(val);
    }
    let total = count_q.fetch_one(&state.db.pool).await?;

    sql.push_str(&format!(" ORDER BY l.created_at DESC LIMIT {} OFFSET {}", per_page, offset));
    let logs_query_str = state.db.format_query(&sql);
    let mut logs_q = sqlx::query_as::<_, RequestLog>(&logs_query_str);
    for val in &binds {
        logs_q = logs_q.bind(val);
    }
    let logs = logs_q.fetch_all(&state.db.pool).await?;

    Ok(Json(LogListResponse { data: logs, total }))
}
