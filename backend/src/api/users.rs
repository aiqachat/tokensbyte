use axum::{
    extract::{Path, State},
    Json,
};
use std::sync::Arc;
use crate::AppState;
use crate::models::{User, CreateUserRequest, UpdateUserRequest, UserListResponse};
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
    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM users WHERE username = ? OR email = ?)"
    )
    .bind(&request.username)
    .bind(&request.email)
    .fetch_one(&state.db.pool)
    .await?;

    if exists {
        return Err(AppError::Conflict("User already exists".to_string()));
    }

    let password_hash = auth::hash_password(&request.password)?;
    let user_id = uuid::Uuid::new_v4().to_string();

    sqlx::query(
        r#"INSERT INTO users (id, username, email, password_hash, role, balance, is_active)
           VALUES (?, ?, ?, ?, 'user', 0.0, 1)"#
    )
    .bind(&user_id)
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

    if let Some(username) = request.username { user.username = username; }
    if let Some(email) = request.email { user.email = email; }
    if let Some(password) = request.password { user.password_hash = auth::hash_password(&password)?; }
    if let Some(role) = request.role { user.role = role; }
    if let Some(balance) = request.balance { user.balance = balance; }
    if let Some(is_active) = request.is_active { user.is_active = is_active; }

    sqlx::query(
        r#"UPDATE users SET username = ?, email = ?, password_hash = ?, role = ?, 
           balance = ?, is_active = ?, updated_at = datetime('now')
           WHERE id = ?"#
    )
    .bind(&user.username)
    .bind(&user.email)
    .bind(&user.password_hash)
    .bind(&user.role)
    .bind(user.balance)
    .bind(user.is_active)
    .bind(&id)
    .execute(&state.db.pool)
    .await?;

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
