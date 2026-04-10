use axum::{
    extract::{Query, State},
    Json,
};
use std::sync::Arc;
use crate::AppState;
use crate::models::{RequestLog, RechargeRecord};
use crate::error::{AppResult};
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct FinanceQuery {
    pub page: Option<i64>,
    pub per_page: Option<i64>,
    pub user_id: Option<String>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct FinanceRechargeRecord {
    pub id: i64,
    pub user_id: String,
    pub username: String,
    pub uid: String,
    pub amount: f64,
    pub recharge_type: String,
    pub remark: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct FinanceRechargeResponse {
    pub data: Vec<FinanceRechargeRecord>,
    pub total: i64,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct FinanceOrderRecord {
    pub id: i64,
    pub user_id: String,
    pub username: String,
    pub uid: String,
    pub model: String,
    pub prompt_tokens: i32,
    pub completion_tokens: i32,
    pub cost: f64,
    pub status_code: i32,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct FinanceOrderResponse {
    pub data: Vec<FinanceOrderRecord>,
    pub total: i64,
}

pub async fn list_recharges(
    State(state): State<Arc<AppState>>,
    Query(query): Query<FinanceQuery>,
) -> AppResult<Json<FinanceRechargeResponse>> {
    let page = query.page.unwrap_or(1);
    let per_page = query.per_page.unwrap_or(20);
    let offset = (page - 1) * per_page;

    let mut sql = "SELECT rr.*, u.username, u.uid FROM recharge_records rr JOIN users u ON rr.user_id = u.id WHERE 1=1".to_string();
    if let Some(ref user_id) = query.user_id {
        sql.push_str(&format!(" AND (rr.user_id = '{}' OR u.uid = '{}' OR u.username LIKE '%{}%')", user_id, user_id, user_id));
    }
    
    let count_sql = sql.replace("SELECT rr.*, u.username, u.uid", "SELECT COUNT(*)");
    let total: i64 = sqlx::query_scalar(&count_sql).fetch_one(&state.db.pool).await?;

    sql.push_str(&format!(" ORDER BY rr.created_at DESC LIMIT {} OFFSET {}", per_page, offset));
    let data: Vec<FinanceRechargeRecord> = sqlx::query_as(&sql).fetch_all(&state.db.pool).await?;

    Ok(Json(FinanceRechargeResponse { data, total }))
}

pub async fn list_orders(
    State(state): State<Arc<AppState>>,
    Query(query): Query<FinanceQuery>,
) -> AppResult<Json<FinanceOrderResponse>> {
    let page = query.page.unwrap_or(1);
    let per_page = query.per_page.unwrap_or(20);
    let offset = (page - 1) * per_page;

    let mut sql = "SELECT l.*, u.username, u.uid FROM logs l JOIN users u ON l.user_id = u.id WHERE 1=1".to_string();
    if let Some(ref user_id) = query.user_id {
        sql.push_str(&format!(" AND (l.user_id = '{}' OR u.uid = '{}' OR u.username LIKE '%{}%')", user_id, user_id, user_id));
    }

    let count_sql = sql.replace("SELECT l.*, u.username, u.uid", "SELECT COUNT(*)");
    let total: i64 = sqlx::query_scalar(&count_sql).fetch_one(&state.db.pool).await?;

    sql.push_str(&format!(" ORDER BY l.created_at DESC LIMIT {} OFFSET {}", per_page, offset));
    let data: Vec<FinanceOrderRecord> = sqlx::query_as(&sql).fetch_all(&state.db.pool).await?;

    Ok(Json(FinanceOrderResponse { data, total }))
}
