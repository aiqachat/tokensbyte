use axum::{
    extract::{State, Extension},
    Json,
};
use std::sync::Arc;
use crate::AppState;
use crate::auth;
use crate::models::{DashboardStats, ModelStat, RequestLog};
use crate::error::{AppResult};

pub async fn get_stats(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<DashboardStats>> {
    let mut stats_sql = "SELECT COUNT(*) FROM logs".to_string();
    let mut tokens_sql = "SELECT SUM(prompt_tokens + completion_tokens) FROM logs".to_string();
    let mut cost_sql = "SELECT SUM(cost) FROM logs".to_string();
    let mut recent_sql = "SELECT * FROM logs ORDER BY created_at DESC LIMIT 5".to_string();
    let mut model_sql = "SELECT model, COUNT(*) as count, SUM(prompt_tokens + completion_tokens) as total_tokens, SUM(cost) as total_cost FROM logs GROUP BY model ORDER BY count DESC LIMIT 10".to_string();

    if claims.role != "admin" {
        let where_clause = format!(" WHERE user_id = '{}'", claims.sub);
        stats_sql.push_str(&where_clause);
        tokens_sql.push_str(&where_clause);
        cost_sql.push_str(&where_clause);
        recent_sql = recent_sql.replace("ORDER BY", &format!("{} ORDER BY", where_clause));
        model_sql = model_sql.replace("GROUP BY", &format!("{} GROUP BY", where_clause));
    }

    let total_requests: i64 = sqlx::query_scalar::<_, i64>(&stats_sql).fetch_one(&state.db.pool).await?;
    let total_tokens: i64 = sqlx::query_scalar::<_, Option<i64>>(&tokens_sql).fetch_one(&state.db.pool).await?.unwrap_or(0);
    let total_cost: f64 = sqlx::query_scalar::<_, Option<f64>>(&cost_sql).fetch_one(&state.db.pool).await?.unwrap_or(0.0);


    
    let total_users: i64 = if claims.role == "admin" {
        sqlx::query_scalar("SELECT COUNT(*) FROM users").fetch_one(&state.db.pool).await?
    } else { 1 };

    let total_channels: i64 = if claims.role == "admin" {
        sqlx::query_scalar("SELECT COUNT(*) FROM channels").fetch_one(&state.db.pool).await?
    } else { 0 };

    let active_tokens: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM api_tokens WHERE user_id = ? AND is_active = 1")
        .bind(&claims.sub)
        .fetch_one(&state.db.pool)
        .await?;

    let today_requests: i64 = sqlx::query_scalar::<_, i64>(&format!("{}{} AND created_at >= date('now')", stats_sql, if stats_sql.contains("WHERE") { " AND" } else { " WHERE" }))
        .fetch_one(&state.db.pool).await?;
        
    let today_cost: f64 = sqlx::query_scalar::<_, Option<f64>>(&format!("{}{} AND created_at >= date('now')", cost_sql, if cost_sql.contains("WHERE") { " AND" } else { " WHERE" }))
        .fetch_one(&state.db.pool).await?.unwrap_or(0.0);



    let recent_logs: Vec<RequestLog> = sqlx::query_as(&recent_sql).fetch_all(&state.db.pool).await?;
    let model_stats: Vec<ModelStat> = sqlx::query_as(&model_sql).fetch_all(&state.db.pool).await?;

    Ok(Json(DashboardStats {
        total_requests,
        total_tokens,
        total_cost,
        total_users,
        total_channels,
        active_tokens,
        today_requests,
        today_cost,
        recent_logs,
        model_stats,
    }))
}
