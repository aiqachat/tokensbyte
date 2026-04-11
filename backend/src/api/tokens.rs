use axum::{
    extract::{Path, State, Extension},
    Json,
};
use std::sync::Arc;
use crate::AppState;
use crate::auth;
use crate::models::{ApiToken, CreateTokenRequest, UpdateTokenRequest, TokenListResponse};
use crate::error::{AppError, AppResult};

pub async fn list_tokens(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<TokenListResponse>> {
    let tokens: Vec<ApiToken> = sqlx::query_as(
        "SELECT * FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC"
    )
    .bind(&claims.sub)
    .fetch_all(&state.db.pool)
    .await?;

    let total = tokens.len() as i64;
    Ok(Json(TokenListResponse { data: tokens, total }))
}

pub async fn list_all_tokens(
    State(state): State<Arc<AppState>>,
) -> AppResult<Json<TokenListResponse>> {
    let tokens: Vec<ApiToken> = sqlx::query_as(
        "SELECT * FROM api_tokens ORDER BY created_at DESC"
    )
    .fetch_all(&state.db.pool)
    .await?;

    let total = tokens.len() as i64;
    Ok(Json(TokenListResponse { data: tokens, total }))
}

pub async fn create_token(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Json(request): Json<CreateTokenRequest>,
) -> AppResult<Json<ApiToken>> {
    let token_key = auth::generate_api_key();
    let models_json = serde_json::to_string(&request.allowed_models.unwrap_or_default()).unwrap_or_else(|_| "[]".to_string());

    let res = sqlx::query(
        r#"INSERT INTO api_tokens (user_id, token_key, name, quota_limit, allowed_models, allowed_ips, expires_at, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1)"#
    )
    .bind(&claims.sub)
    .bind(&token_key)
    .bind(request.name.unwrap_or_else(|| "default".to_string()))
    .bind(request.quota_limit.unwrap_or(-1.0))
    .bind(&models_json)
    .bind(request.allowed_ips.unwrap_or_default())
    .bind(&request.expires_at)
    .execute(&state.db.pool)
    .await?;

    let last_id = res.last_insert_id().unwrap_or(0);
    let token: ApiToken = sqlx::query_as("SELECT * FROM api_tokens WHERE id = ?")
        .bind(last_id)
        .fetch_one(&state.db.pool)
        .await?;

    Ok(Json(token))
}

pub async fn update_token(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Path(id): Path<i64>,
    Json(request): Json<UpdateTokenRequest>,
) -> AppResult<Json<ApiToken>> {
    // Verify ownership or admin
    let mut token: ApiToken = sqlx::query_as("SELECT * FROM api_tokens WHERE id = ?")
        .bind(id)
        .fetch_optional(&state.db.pool)
        .await?
        .ok_or_else(|| AppError::NotFound("Token not found".to_string()))?;

    if token.user_id != claims.sub && claims.role != "admin" {
        return Err(AppError::Forbidden("Unauthorized access to token".to_string()));
    }

    if let Some(name) = request.name { token.name = name; }
    if let Some(quota_limit) = request.quota_limit { token.quota_limit = quota_limit; }
    if let Some(models) = request.allowed_models { token.allowed_models = serde_json::to_string(&models).unwrap_or_else(|_| "[]".to_string()); }
    if let Some(ips) = request.allowed_ips { token.allowed_ips = ips; }
    if let Some(expires) = request.expires_at { token.expires_at = Some(expires); }
    if let Some(active) = request.is_active { token.is_active = active; }

    sqlx::query(
        r#"UPDATE api_tokens SET name = ?, quota_limit = ?, allowed_models = ?, allowed_ips = ?, 
           expires_at = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?"#
    )
    .bind(&token.name)
    .bind(token.quota_limit)
    .bind(&token.allowed_models)
    .bind(&token.allowed_ips)
    .bind(&token.expires_at)
    .bind(token.is_active)
    .bind(id)
    .execute(&state.db.pool)
    .await?;

    Ok(Json(token))
}

pub async fn delete_token(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Path(id): Path<i64>,
) -> AppResult<Json<serde_json::Value>> {
    // Check ownership
    let token_user_id: String = sqlx::query_scalar("SELECT user_id FROM api_tokens WHERE id = ?")
        .bind(id)
        .fetch_optional(&state.db.pool)
        .await?
        .ok_or_else(|| AppError::NotFound("Token not found".to_string()))?;

    if token_user_id != claims.sub && claims.role != "admin" {
        return Err(AppError::Forbidden("Unauthorized access".to_string()));
    }

    sqlx::query("DELETE FROM api_tokens WHERE id = ?").bind(id).execute(&state.db.pool).await?;

    Ok(Json(serde_json::json!({ "success": true })))
}
