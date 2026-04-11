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
    let is_admin = claims.role == "admin";
    let user_id = &claims.sub;

    // 1. Basic Stats
    let total_requests: i64 = if is_admin {
        sqlx::query_scalar::<_, i64>(&state.db.format_query("SELECT COUNT(*) FROM logs"))
            .fetch_one(&state.db.pool).await?
    } else {
        sqlx::query_scalar::<_, i64>(&state.db.format_query("SELECT COUNT(*) FROM logs WHERE user_id = ?"))
            .bind(user_id)
            .fetch_one(&state.db.pool).await?
    };

    let total_tokens: i64 = if is_admin {
        sqlx::query_scalar::<_, Option<i64>>(&state.db.format_query("SELECT CAST(SUM(prompt_tokens + completion_tokens) AS BIGINT) FROM logs"))
            .fetch_one(&state.db.pool).await?.unwrap_or(0)
    } else {
        sqlx::query_scalar::<_, Option<i64>>(&state.db.format_query("SELECT CAST(SUM(prompt_tokens + completion_tokens) AS BIGINT) FROM logs WHERE user_id = ?"))
            .bind(user_id)
            .fetch_one(&state.db.pool).await?.unwrap_or(0)
    };

    let total_cost: f64 = if is_admin {
        sqlx::query_scalar::<_, Option<f64>>(&state.db.format_query("SELECT SUM(cost) FROM logs"))
            .fetch_one(&state.db.pool).await?.unwrap_or(0.0)
    } else {
        sqlx::query_scalar::<_, Option<f64>>(&state.db.format_query("SELECT SUM(cost) FROM logs WHERE user_id = ?"))
            .bind(user_id)
            .fetch_one(&state.db.pool).await?.unwrap_or(0.0)
    };

    let total_users: i64 = if is_admin {
        sqlx::query_scalar::<_, i64>(&state.db.format_query("SELECT COUNT(*) FROM users")).fetch_one(&state.db.pool).await?
    } else { 1 };

    let total_channels: i64 = if is_admin {
        sqlx::query_scalar::<_, i64>(&state.db.format_query("SELECT COUNT(*) FROM channels")).fetch_one(&state.db.pool).await?
    } else { 0 };

    let active_tokens: i64 = sqlx::query_scalar::<_, i64>(&state.db.format_query("SELECT COUNT(*) FROM api_tokens WHERE user_id = ? AND is_active = 1"))
        .bind(user_id)
        .fetch_one(&state.db.pool)
        .await?;

    // 2. Today's Stats (Using enhanced format_query for date('now') -> CURRENT_DATE)
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let today_requests: i64 = if is_admin {
        sqlx::query_scalar::<_, i64>(&state.db.format_query("SELECT COUNT(*) FROM logs WHERE created_at::date >= ?::date"))
            .bind(&today)
            .fetch_one(&state.db.pool).await?
    } else {
        sqlx::query_scalar::<_, i64>(&state.db.format_query("SELECT COUNT(*) FROM logs WHERE user_id = ? AND created_at::date >= ?::date"))
            .bind(user_id)
            .bind(&today)
            .fetch_one(&state.db.pool).await?
    };
        
    let today_cost: f64 = if is_admin {
        sqlx::query_scalar::<_, Option<f64>>(&state.db.format_query("SELECT SUM(cost) FROM logs WHERE created_at::date >= ?::date"))
            .bind(&today)
            .fetch_one(&state.db.pool).await?.unwrap_or(0.0)
    } else {
        sqlx::query_scalar::<_, Option<f64>>(&state.db.format_query("SELECT SUM(cost) FROM logs WHERE user_id = ? AND created_at::date >= ?::date"))
            .bind(user_id)
            .bind(&today)
            .fetch_one(&state.db.pool).await?.unwrap_or(0.0)
    };

    // 3. Lists
    let recent_logs: Vec<RequestLog> = if is_admin {
        sqlx::query_as(&state.db.format_query("SELECT * FROM logs ORDER BY created_at DESC LIMIT 5"))
            .fetch_all(&state.db.pool).await?
    } else {
        sqlx::query_as(&state.db.format_query("SELECT * FROM logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 5"))
            .bind(user_id)
            .fetch_all(&state.db.pool).await?
    };

    let model_stats: Vec<ModelStat> = if is_admin {
        sqlx::query_as(&state.db.format_query("SELECT model, COUNT(*) as count, SUM(prompt_tokens + completion_tokens) as total_tokens, SUM(cost) as total_cost FROM logs GROUP BY model ORDER BY count DESC LIMIT 10"))
            .fetch_all(&state.db.pool).await?
    } else {
        sqlx::query_as(&state.db.format_query("SELECT model, COUNT(*) as count, SUM(prompt_tokens + completion_tokens) as total_tokens, SUM(cost) as total_cost FROM logs WHERE user_id = ? GROUP BY model ORDER BY count DESC LIMIT 10"))
            .bind(user_id)
            .fetch_all(&state.db.pool).await?
    };

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
