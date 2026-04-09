use axum::{
    extract::{State, Extension},
    Json,
};
use std::sync::Arc;
use crate::AppState;
use crate::models::{User, ProfileUpdateRequest, WalletStats, RechargeRecord};
use crate::error::{AppError, AppResult};
use crate::auth;

pub async fn get_profile(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<User>> {
    let user: User = sqlx::query_as("SELECT * FROM users WHERE id = ?")
        .bind(&claims.sub)
        .fetch_optional(&state.db.pool)
        .await?
        .ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

    Ok(Json(user))
}

pub async fn update_profile(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Json(request): Json<ProfileUpdateRequest>,
) -> AppResult<Json<User>> {
    let mut user: User = sqlx::query_as("SELECT * FROM users WHERE id = ?")
        .bind(&claims.sub)
        .fetch_optional(&state.db.pool)
        .await?
        .ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

    if let Some(nickname) = request.nickname { user.nickname = Some(nickname); }
    if let Some(email) = request.email { user.email = email; }
    if let Some(mobile) = request.mobile { user.mobile = Some(mobile); }
    if let Some(wechat_id) = request.wechat_id { user.wechat_id = Some(wechat_id); }
    
    if let Some(password) = request.password {
        if !password.is_empty() {
            user.password_hash = auth::hash_password(&password)?;
        }
    }

    sqlx::query(
        r#"UPDATE users SET email = ?, password_hash = ?, nickname = ?, mobile = ?, 
           wechat_id = ?, updated_at = datetime('now')
           WHERE id = ?"#
    )
    .bind(&user.email)
    .bind(&user.password_hash)
    .bind(&user.nickname)
    .bind(&user.mobile)
    .bind(&user.wechat_id)
    .bind(&user.id)
    .execute(&state.db.pool)
    .await?;

    Ok(Json(user))
}

pub async fn get_wallet_stats(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<WalletStats>> {
    let user_id = &claims.sub;
    
    // 1. Get current balance
    let balance: f64 = sqlx::query_scalar("SELECT balance FROM users WHERE id = ?")
        .bind(user_id)
        .fetch_one(&state.db.pool)
        .await?;
        
    // 2. Calculate consumption and call counts from logs
    let stats: (f64, i64, i64) = sqlx::query_as(
        r#"SELECT 
            COALESCE(SUM(cost), 0.0) as total_consumption,
            COUNT(*) as total_calls,
            SUM(CASE WHEN status_code = 200 THEN 1 ELSE 0 END) as success_calls
           FROM logs WHERE user_id = ?"#
    )
    .bind(user_id)
    .fetch_one(&state.db.pool)
    .await?;

    Ok(Json(WalletStats {
        balance,
        total_consumption: stats.0,
        total_calls: stats.1,
        success_calls: stats.2,
    }))
}

pub async fn list_recharge_records(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<Vec<RechargeRecord>>> {
    let records: Vec<RechargeRecord> = sqlx::query_as(
        "SELECT * FROM recharge_records WHERE user_id = ? ORDER BY created_at DESC"
    )
    .bind(&claims.sub)
    .fetch_all(&state.db.pool)
    .await?;

    Ok(Json(records))
}
