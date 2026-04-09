use axum::{
    extract::State,
    Json,
};
use std::sync::Arc;
use crate::AppState;
use crate::models::{LoginRequest, LoginResponse, CreateUserRequest, User};
use crate::error::{AppError, AppResult};
use crate::auth;

pub async fn login(
    State(state): State<Arc<AppState>>,
    Json(request): Json<LoginRequest>,
) -> AppResult<Json<LoginResponse>> {
    // 1. Fetch user from database
    let user: User = sqlx::query_as(
        "SELECT * FROM users WHERE username = ?"
    )
    .bind(&request.username)
    .fetch_optional(&state.db.pool)
    .await?
    .ok_or(AppError::Unauthorized)?;

    // 2. Verify password
    if !auth::verify_password(&request.password, &user.password_hash)? {
        return Err(AppError::Unauthorized);
    }

    if !user.is_active {
        return Err(AppError::Forbidden("Account disabled".to_string()));
    }

    // 3. Create JWT token
    let token = auth::create_token(&user.id, &user.username, &user.role, &state.config.jwt_secret)?;

    Ok(Json(LoginResponse { token, user }))
}

pub async fn register(
    State(state): State<Arc<AppState>>,
    Json(request): Json<CreateUserRequest>,
) -> AppResult<Json<LoginResponse>> {
    if !state.config.register_enabled {
        return Err(AppError::Forbidden("Registration is disabled".to_string()));
    }

    // 1. Check if user already exists
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

    // 2. Hash password and insert
    let password_hash = auth::hash_password(&request.password)?;
    let user_id = uuid::Uuid::new_v4().to_string();
    let uid = state.db.generate_unique_uid().await.map_err(AppError::from)?;

    sqlx::query(
        r#"INSERT INTO users (id, uid, username, email, password_hash, role, balance, is_active)
           VALUES (?, ?, ?, ?, ?, 'user', ?, 1)"#
    )
    .bind(&user_id)
    .bind(&uid)
    .bind(&request.username)
    .bind(&request.email)
    .bind(&password_hash)
    .bind(state.config.default_user_quota)
    .execute(&state.db.pool)
    .await?;

    // 3. Auto-login after registration
    let user: User = sqlx::query_as("SELECT * FROM users WHERE id = ?")
        .bind(&user_id)
        .fetch_one(&state.db.pool)
        .await?;

    let token = auth::create_token(&user.id, &user.username, &user.role, &state.config.jwt_secret)?;

    Ok(Json(LoginResponse { token, user }))
}
