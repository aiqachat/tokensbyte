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

    let mut sql = "SELECT * FROM logs WHERE 1=1".to_string();
    if claims.role != "admin" {
        sql.push_str(" AND user_id = '");
        sql.push_str(&claims.sub);
        sql.push_str("'");
    } else if let Some(ref user_id) = query.user_id {
        sql.push_str(" AND user_id = '");
        sql.push_str(user_id);
        sql.push_str("'");
    }

    if let Some(ref model) = query.model {
        sql.push_str(" AND model LIKE '%");
        sql.push_str(model);
        sql.push_str("%'");
    }

    if let Some(channel_id) = query.channel_id {
        sql.push_str(&format!(" AND channel_id = {}", channel_id));
    }

    sql.push_str(&format!(" ORDER BY created_at DESC LIMIT {} OFFSET {}", per_page, offset));

    let logs: Vec<RequestLog> = sqlx::query_as(&sql)
        .fetch_all(&state.db.pool)
        .await?;

    let count_sql = sql.replace("SELECT *", "SELECT COUNT(*)").split("ORDER BY").next().unwrap().to_string();
    let total: i64 = sqlx::query_scalar(&count_sql)
        .fetch_one(&state.db.pool)
        .await?;

    Ok(Json(LogListResponse { data: logs, total }))
}
