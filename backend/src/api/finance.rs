use axum::{
    extract::{Query, State},
    Json,
};
use std::sync::Arc;
use crate::AppState;
use crate::error::AppResult;
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct FinanceQuery {
    pub page: Option<i64>,
    pub per_page: Option<i64>,
    pub user_id: Option<String>,
    pub recharge_type: Option<String>,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub status: Option<String>,
    pub payment_method: Option<String>,
}

// ========== 充值记录（recharge_records）==========

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
    pub total_amount: f64,
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
    let mut binds: Vec<String> = Vec::new();

    if let Some(ref search) = query.user_id {
        where_clause.push_str(" AND (rr.user_id = ? OR u.uid = ? OR u.username LIKE ?)");
        binds.push(search.clone());
        binds.push(search.clone());
        binds.push(format!("%{}%", search));
    }

    if let Some(ref r_type) = query.recharge_type {
        where_clause.push_str(" AND rr.recharge_type = ?");
        binds.push(r_type.clone());
    }

    if let Some(ref start) = query.start_time {
        where_clause.push_str(" AND rr.created_at >= ?");
        binds.push(start.clone());
    }

    if let Some(ref end) = query.end_time {
        where_clause.push_str(" AND rr.created_at <= ?");
        binds.push(end.clone());
    }

    sql.push_str(&where_clause);

    let count_sql = format!("SELECT COUNT(*) FROM recharge_records rr JOIN users u ON rr.user_id = u.id{}", where_clause);
    let count_query_str = state.db.format_query(&count_sql);
    let mut count_q = sqlx::query_scalar::<_, i64>(&count_query_str);
    for val in &binds {
        count_q = count_q.bind(val);
    }
    let total = count_q.fetch_one(&state.db.pool).await.map_err(|e| {
        tracing::error!("Finance recharges count error: {:?}", e);
        e
    })?;

    sql.push_str(&format!(" ORDER BY rr.created_at DESC LIMIT {} OFFSET {}", per_page, offset));
    let formatted_data_sql = state.db.format_query(&sql);
    let mut data_q = sqlx::query_as::<_, FinanceRechargeRecord>(&formatted_data_sql);
    for val in &binds {
        data_q = data_q.bind(val);
    }
    let data = data_q.fetch_all(&state.db.pool).await.map_err(|e| {
        tracing::error!("Finance recharges data error: {:?}", e);
        e
    })?;

    let total_amount_sql = format!("SELECT COALESCE(SUM(rr.amount), 0.0) FROM recharge_records rr JOIN users u ON rr.user_id = u.id{}", where_clause);
    let total_amount_query_str = state.db.format_query(&total_amount_sql);
    let mut amount_q = sqlx::query_scalar::<_, f64>(&total_amount_query_str);
    for val in &binds {
        amount_q = amount_q.bind(val);
    }
    let total_amount = amount_q.fetch_one(&state.db.pool).await.unwrap_or(0.0);

    Ok(Json(FinanceRechargeResponse { data, total, total_amount }))
}

// ========== 支付订单（orders 表）==========

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct FinanceOrderRecord {
    pub id: i64,
    pub out_trade_no: String,
    pub user_id: String,
    pub username: String,
    pub uid: String,
    pub payment_method: String,
    pub amount: f64,
    pub status: String,
    pub trade_no: Option<String>,
    pub created_at: String,
    pub paid_at: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct FinanceOrderResponse {
    pub data: Vec<FinanceOrderRecord>,
    pub total: i64,
    pub total_amount: f64,
}

pub async fn list_orders(
    State(state): State<Arc<AppState>>,
    Query(query): Query<FinanceQuery>,
) -> AppResult<Json<FinanceOrderResponse>> {
    let page = query.page.unwrap_or(1);
    let per_page = query.per_page.unwrap_or(20);
    let offset = (page - 1) * per_page;

    let mut sql = "SELECT o.*, u.username, u.uid FROM orders o JOIN users u ON o.user_id = u.id".to_string();
    let mut where_clause = " WHERE 1=1".to_string();
    let mut binds: Vec<String> = Vec::new();

    if let Some(ref search) = query.user_id {
        where_clause.push_str(" AND (o.user_id = ? OR u.uid = ? OR u.username LIKE ?)");
        binds.push(search.clone());
        binds.push(search.clone());
        binds.push(format!("%{}%", search));
    }

    if let Some(ref status) = query.status {
        where_clause.push_str(" AND o.status = ?");
        binds.push(status.clone());
    }

    if let Some(ref method) = query.payment_method {
        where_clause.push_str(" AND o.payment_method = ?");
        binds.push(method.clone());
    }

    if let Some(ref start) = query.start_time {
        where_clause.push_str(" AND o.created_at >= ?");
        binds.push(start.clone());
    }

    if let Some(ref end) = query.end_time {
        where_clause.push_str(" AND o.created_at <= ?");
        binds.push(end.clone());
    }

    sql.push_str(&where_clause);

    let count_sql = format!("SELECT COUNT(*) FROM orders o JOIN users u ON o.user_id = u.id{}", where_clause);
    let count_query_str = state.db.format_query(&count_sql);
    let mut count_q = sqlx::query_scalar::<_, i64>(&count_query_str);
    for val in &binds {
        count_q = count_q.bind(val);
    }
    let total = count_q.fetch_one(&state.db.pool).await.map_err(|e| {
        tracing::error!("Finance orders count error: {:?}", e);
        e
    })?;

    sql.push_str(&format!(" ORDER BY o.created_at DESC LIMIT {} OFFSET {}", per_page, offset));
    let formatted_data_sql = state.db.format_query(&sql);
    let mut data_q = sqlx::query_as::<_, FinanceOrderRecord>(&formatted_data_sql);
    for val in &binds {
        data_q = data_q.bind(val);
    }
    let data = data_q.fetch_all(&state.db.pool).await.map_err(|e| {
        tracing::error!("Finance orders data error: {:?}", e);
        e
    })?;

    let total_amount_sql = format!("SELECT COALESCE(SUM(o.amount), 0.0) FROM orders o JOIN users u ON o.user_id = u.id{} AND o.status = 'paid'", where_clause);
    let total_amount_query_str = state.db.format_query(&total_amount_sql);
    let mut amount_q = sqlx::query_scalar::<_, f64>(&total_amount_query_str);
    for val in &binds {
        amount_q = amount_q.bind(val);
    }
    let total_amount = amount_q.fetch_one(&state.db.pool).await.unwrap_or(0.0);

    Ok(Json(FinanceOrderResponse { data, total, total_amount }))
}

pub async fn list_recharge_types(
    State(state): State<Arc<AppState>>,
) -> AppResult<Json<Vec<String>>> {
    let types: Vec<String> = sqlx::query_scalar(&state.db.format_query("SELECT DISTINCT recharge_type FROM recharge_records WHERE recharge_type IS NOT NULL"))
        .fetch_all(&state.db.pool)
        .await?;

    Ok(Json(types))
}
