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
        &state.db.format_query("SELECT * FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC")
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
        &state.db.format_query("SELECT * FROM api_tokens ORDER BY created_at DESC")
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
    // 检查用户等级允许的最大密钥数量
    let current_count: i64 = sqlx::query_scalar(
        &state.db.format_query("SELECT COUNT(*) FROM api_tokens WHERE user_id = ?")
    )
    .bind(&claims.sub)
    .fetch_one(&state.db.pool)
    .await?;

    // 获取用户等级的密钥上限（默认10）
    let max_token_count: i64 = sqlx::query_scalar(
        &state.db.format_query(
            "SELECT COALESCE(ul.max_token_count, 10) FROM users u LEFT JOIN user_levels ul ON u.user_group = ul.group_key WHERE u.id = ?"
        )
    )
    .bind(&claims.sub)
    .fetch_optional(&state.db.pool)
    .await?
    .unwrap_or(10);

    if current_count >= max_token_count {
        return Err(AppError::BadRequest(format!(
            "已达到当前等级允许的最大密钥数量限制 ({})",
            max_token_count
        )));
    }

    let token_key = auth::generate_api_key();
    let models_json = serde_json::to_string(&request.allowed_models.unwrap_or_default()).unwrap_or_else(|_| "[]".to_string());

    let sql = r#"INSERT INTO api_tokens (user_id, token_key, name, quota_limit, allowed_models, allowed_ips, expires_at, is_active)
               VALUES (?, ?, ?, ?, ?, ?, ?, 1)"#;

    let last_id: i64 = if state.db.is_sqlite {
        let res = sqlx::query(&state.db.format_query(sql))
            .bind(&claims.sub)
            .bind(&token_key)
            .bind(request.name.unwrap_or_else(|| "default".to_string()))
            .bind(request.quota_limit.unwrap_or(-1.0))
            .bind(&models_json)
            .bind(request.allowed_ips.unwrap_or_default())
            .bind(&request.expires_at)
            .execute(&state.db.pool)
            .await?;
        res.last_insert_id().unwrap_or(0) as i64
    } else {
        let sql_pg = format!("{} RETURNING id", sql);
        sqlx::query_scalar::<_, i64>(&state.db.format_query(&sql_pg))
            .bind(&claims.sub)
            .bind(&token_key)
            .bind(request.name.unwrap_or_else(|| "default".to_string()))
            .bind(request.quota_limit.unwrap_or(-1.0))
            .bind(&models_json)
            .bind(request.allowed_ips.unwrap_or_default())
            .bind(&request.expires_at)
            .fetch_one(&state.db.pool)
            .await?
    };

    let token: ApiToken = sqlx::query_as(&state.db.format_query("SELECT * FROM api_tokens WHERE id = ?"))
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
    let mut token: ApiToken = sqlx::query_as(&state.db.format_query("SELECT * FROM api_tokens WHERE id = ?"))
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
        &state.db.format_query(r#"UPDATE api_tokens SET name = ?, quota_limit = ?, allowed_models = ?, allowed_ips = ?, 
           expires_at = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?"#)
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
    let token_user_id: String = sqlx::query_scalar(&state.db.format_query("SELECT user_id FROM api_tokens WHERE id = ?"))
        .bind(id)
        .fetch_optional(&state.db.pool)
        .await?
        .ok_or_else(|| AppError::NotFound("Token not found".to_string()))?;

    if token_user_id != claims.sub && claims.role != "admin" {
        return Err(AppError::Forbidden("Unauthorized access".to_string()));
    }

    sqlx::query(&state.db.format_query("DELETE FROM api_tokens WHERE id = ?")).bind(id).execute(&state.db.pool).await?;

    Ok(Json(serde_json::json!({ "success": true })))
}

#[derive(serde::Deserialize)]
pub struct RevealTokenRequest {
    pub password: String,
}

/// 验证用户密码后返回完整的 token_key
pub async fn reveal_token(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Path(id): Path<i64>,
    Json(request): Json<RevealTokenRequest>,
) -> AppResult<Json<serde_json::Value>> {
    // 查找 token 并验证所有权
    let token: ApiToken = sqlx::query_as(
        &state.db.format_query("SELECT * FROM api_tokens WHERE id = ?")
    )
    .bind(id)
    .fetch_optional(&state.db.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("Token not found".to_string()))?;

    if token.user_id != claims.sub && claims.role != "admin" {
        return Err(AppError::Forbidden("Unauthorized access to token".to_string()));
    }

    // 验证用户密码
    let password_hash: String = sqlx::query_scalar(
        &state.db.format_query("SELECT password_hash FROM users WHERE id = ?")
    )
    .bind(&claims.sub)
    .fetch_one(&state.db.pool)
    .await?;

    if !auth::verify_password(&request.password, &password_hash)? {
        return Err(AppError::AuthFailed("密码错误".to_string()));
    }

    Ok(Json(serde_json::json!({
        "token_key": token.token_key
    })))
}
