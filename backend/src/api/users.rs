use axum::{
    extract::{Path, State},
    Json,
};
use std::sync::Arc;
use crate::AppState;
use crate::models::{User, CreateUserRequest, UpdateUserRequest, UserListResponse, RechargeRequest};
use crate::error::{AppError, AppResult};
use crate::auth;

pub async fn list_users(
    State(state): State<Arc<AppState>>,
) -> AppResult<Json<UserListResponse>> {
    let users: Vec<User> = sqlx::query_as("SELECT * FROM users ORDER BY created_at DESC")
        .fetch_all(&state.db.pool)
        .await?;

    let total = users.len() as i64;
    Ok(Json(UserListResponse { data: users, total }))
}

pub async fn create_user(
    State(state): State<Arc<AppState>>,
    Json(request): Json<CreateUserRequest>,
) -> AppResult<Json<User>> {
    let exists: i64 = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM users WHERE username = ? OR email = ?)"
    )
    .bind(&request.username)
    .bind(&request.email)
    .fetch_one(&state.db.pool)
    .await?;

    if exists != 0 {
        return Err(AppError::Conflict("User already exists".to_string()));
    }

    let password_hash = auth::hash_password(&request.password)?;
    let user_id = uuid::Uuid::new_v4().to_string();
    let uid = state.db.generate_unique_uid().await.map_err(AppError::from)?;

    sqlx::query(
        r#"INSERT INTO users (id, uid, username, email, password_hash, role, balance, is_active)
           VALUES (?, ?, ?, ?, ?, 'user', 0.0, 1)"#
    )
    .bind(&user_id)
    .bind(&uid)
    .bind(&request.username)
    .bind(&request.email)
    .bind(&password_hash)
    .execute(&state.db.pool)
    .await?;

    let user: User = sqlx::query_as("SELECT * FROM users WHERE id = ?")
        .bind(&user_id)
        .fetch_one(&state.db.pool)
        .await?;

    Ok(Json(user))
}

pub async fn update_user(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(request): Json<UpdateUserRequest>,
) -> AppResult<Json<User>> {
    let mut user: User = sqlx::query_as("SELECT * FROM users WHERE id = ?")
        .bind(&id)
        .fetch_optional(&state.db.pool)
        .await?
        .ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

    let old_balance = user.balance;

    if let Some(username) = request.username { user.username = username; }
    if let Some(email) = request.email { user.email = email; }
    if let Some(password) = request.password { user.password_hash = auth::hash_password(&password)?; }
    if let Some(nickname) = request.nickname { user.nickname = Some(nickname); }
    if let Some(mobile) = request.mobile { user.mobile = Some(mobile); }
    if let Some(wechat_id) = request.wechat_id { user.wechat_id = Some(wechat_id); }
    if let Some(role) = request.role { user.role = role; }
    if let Some(balance) = request.balance { user.balance = balance; }
    if let Some(user_group) = request.user_group { user.user_group = user_group; }
    if let Some(is_active) = request.is_active { user.is_active = is_active; }

    let mut tx = state.db.pool.begin().await?;

    sqlx::query(
        r#"UPDATE users SET username = ?, email = ?, password_hash = ?, 
           nickname = ?, mobile = ?, wechat_id = ?,
           role = ?, balance = ?, user_group = ?, is_active = ?, updated_at = datetime('now')
           WHERE id = ?"#
    )
    .bind(&user.username)
    .bind(&user.email)
    .bind(&user.password_hash)
    .bind(&user.nickname)
    .bind(&user.mobile)
    .bind(&user.wechat_id)
    .bind(&user.role)
    .bind(user.balance)
    .bind(&user.user_group)
    .bind(user.is_active)
    .bind(&id)
    .execute(&mut *tx)
    .await?;

    if user.balance > old_balance {
        let diff = user.balance - old_balance;
        sqlx::query(
            "INSERT INTO recharge_records (user_id, amount, recharge_type, remark) VALUES (?, ?, 'manual', ?)"
        )
        .bind(&id)
        .bind(diff)
        .bind("Administrator Adjustment")
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    Ok(Json(user))
}

pub async fn delete_user(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    // Prevent self-deletion if needed (optional)
    sqlx::query("DELETE FROM users WHERE id = ?").bind(id).execute(&state.db.pool).await?;

    Ok(Json(serde_json::json!({ "success": true })))
}
pub async fn recharge_user(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(request): Json<RechargeRequest>,
) -> AppResult<Json<User>> {
    let mut tx = state.db.pool.begin().await?;

    let user: User = sqlx::query_as("SELECT * FROM users WHERE id = ?")
        .bind(&id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

    let new_balance = user.balance + request.amount;
    let remark = request.remark.unwrap_or_else(|| "Administrator Adjustment".to_string());

    sqlx::query("UPDATE users SET balance = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(new_balance)
        .bind(&id)
        .execute(&mut *tx)
        .await?;

    sqlx::query("INSERT INTO recharge_records (user_id, amount, recharge_type, remark) VALUES (?, ?, 'manual', ?)")
        .bind(&id)
        .bind(request.amount)
        .bind(&remark)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

    let updated_user: User = sqlx::query_as("SELECT * FROM users WHERE id = ?")
        .bind(&id)
        .fetch_one(&state.db.pool)
        .await?;

    Ok(Json(updated_user))
}
