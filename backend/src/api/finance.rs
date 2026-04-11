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

    let mut sql = "SELECT rr.*, u.username, u.uid FROM recharge_records rr JOIN users u ON rr.user_id = u.id".to_string();
    let mut where_clause = " WHERE 1=1".to_string();
    let mut bind_val: Option<String> = None;

    if let Some(ref search) = query.user_id {
        where_clause.push_str(" AND (rr.user_id = ? OR u.uid = ? OR u.username LIKE ?)");
        bind_val = Some(search.clone());
    }
    
    sql.push_str(&where_clause);
    
    let count_sql = format!("SELECT COUNT(*) FROM recharge_records rr JOIN users u ON rr.user_id = u.id{}", where_clause);
    let count_query_str = state.db.format_query(&count_sql);
    let mut count_q = sqlx::query_scalar::<_, i64>(&count_query_str);
    if let Some(ref val) = bind_val {
        count_q = count_q.bind(val).bind(val).bind(format!("%{}%", val));
    }
    let total = count_q.fetch_one(&state.db.pool).await.map_err(|e| {
        eprintln!("Finance recharges count error: {:?}", e);
        e
    })?;

    sql.push_str(&format!(" ORDER BY rr.created_at DESC LIMIT {} OFFSET {}", per_page, offset));
    let formatted_data_sql = state.db.format_query(&sql);
    let mut data_q = sqlx::query_as::<_, FinanceRechargeRecord>(&formatted_data_sql);
    if let Some(ref val) = bind_val {
        data_q = data_q.bind(val).bind(val).bind(format!("%{}%", val));
    }
    let data = data_q.fetch_all(&state.db.pool).await.map_err(|e| {
        eprintln!("Finance recharges data error: {:?}", e);
        e
    })?;

    Ok(Json(FinanceRechargeResponse { data, total }))
}

pub async fn list_orders(
    State(state): State<Arc<AppState>>,
    Query(query): Query<FinanceQuery>,
) -> AppResult<Json<FinanceOrderResponse>> {
    let page = query.page.unwrap_or(1);
    let per_page = query.per_page.unwrap_or(20);
    let offset = (page - 1) * per_page;

    let mut sql = "SELECT l.*, u.username, u.uid FROM logs l JOIN users u ON l.user_id = u.id".to_string();
    let mut where_clause = " WHERE 1=1".to_string();
    let mut bind_val: Option<String> = None;

    if let Some(ref search) = query.user_id {
        where_clause.push_str(" AND (l.user_id = ? OR u.uid = ? OR u.username LIKE ?)");
        bind_val = Some(search.clone());
    }

    sql.push_str(&where_clause);
    let count_sql = format!("SELECT COUNT(*) FROM logs l JOIN users u ON l.user_id = u.id{}", where_clause);
    let count_query_str = state.db.format_query(&count_sql);
    let mut count_q = sqlx::query_scalar::<_, i64>(&count_query_str);
    if let Some(ref val) = bind_val {
        count_q = count_q.bind(val).bind(val).bind(format!("%{}%", val));
    }
    let total = count_q.fetch_one(&state.db.pool).await.map_err(|e| {
        eprintln!("Finance orders count error: {:?}", e);
        e
    })?;

    sql.push_str(&format!(" ORDER BY l.created_at DESC LIMIT {} OFFSET {}", per_page, offset));
    let formatted_data_sql = state.db.format_query(&sql);
    let mut data_q = sqlx::query_as::<_, FinanceOrderRecord>(&formatted_data_sql);
    if let Some(ref val) = bind_val {
        data_q = data_q.bind(val).bind(val).bind(format!("%{}%", val));
    }
    let data = data_q.fetch_all(&state.db.pool).await.map_err(|e| {
        eprintln!("Finance orders data error: {:?}", e);
        e
    })?;

    Ok(Json(FinanceOrderResponse { data, total }))
}
