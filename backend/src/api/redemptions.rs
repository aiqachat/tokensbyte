use axum::{
    extract::{State, Extension, Path},
    Json,
};
use std::sync::Arc;
use crate::AppState;
use crate::auth;
use crate::models::{Redemption, CreateRedemptionRequest, RedemptionListResponse, RedeemRequest};

use crate::error::{AppResult, AppError};
use rand::{distributions::Alphanumeric, Rng};

/// Admin: List all redemption codes
pub async fn list_redemptions(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<RedemptionListResponse>> {
    if claims.role != "admin" {
        return Err(AppError::Forbidden("Admin only".to_string()));
    }

    let redemptions: Vec<Redemption> = sqlx::query_as("SELECT * FROM redemptions ORDER BY id DESC")
        .fetch_all(&state.db.pool)
        .await?;

    let total = redemptions.len() as i64;
    Ok(Json(RedemptionListResponse { data: redemptions, total }))
}

/// Admin: Bulk generate redemption codes
pub async fn generate_redemptions(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Json(request): Json<CreateRedemptionRequest>,
) -> AppResult<Json<serde_json::Value>> {
    if claims.role != "admin" {
        return Err(AppError::Forbidden("Admin only".to_string()));
    }

    if request.count <= 0 || request.count > 1000 {
        return Err(AppError::BadRequest("Count must be between 1 and 1000".to_string()));
    }

    let mut codes = Vec::new();
    for _ in 0..request.count {
        let code: String = rand::thread_rng()
            .sample_iter(&Alphanumeric)
            .take(32)
            .map(char::from)
            .collect();
        
        sqlx::query(
            "INSERT INTO redemptions (name, code, quota) VALUES (?, ?, ?)"
        )
        .bind(&request.name)
        .bind(&code)
        .bind(request.quota)
        .execute(&state.db.pool)
        .await?;
        
        codes.push(code);
    }

    Ok(Json(serde_json::json!({
        "success": true,
        "count": request.count,
        "codes": codes
    })))
}

/// Admin: Delete a redemption code
pub async fn delete_redemption(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Path(id): Path<i64>,
) -> AppResult<Json<serde_json::Value>> {
    if claims.role != "admin" {
        return Err(AppError::Forbidden("Admin only".to_string()));
    }

    sqlx::query("DELETE FROM redemptions WHERE id = ?")
        .bind(id)
        .execute(&state.db.pool)
        .await?;

    Ok(Json(serde_json::json!({ "success": true })))
}

/// User: Redeem a code to balance
pub async fn redeem_code(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Json(request): Json<RedeemRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let user_id = claims.sub;
    
    // Start transaction to ensure atomicity
    let mut tx = state.db.pool.begin().await?;

    // 1. Find and lock the code
    let redemption: Option<Redemption> = sqlx::query_as(
        "SELECT * FROM redemptions WHERE code = ? AND is_used = 0 LIMIT 1"
    )
    .bind(&request.code)
    .fetch_optional(&mut *tx)
    .await?;

    let redemption = match redemption {
        Some(r) => r,
        None => return Err(AppError::NotFound("Invalid or already used redemption code".to_string())),
    };

    // 2. Update user balance
    sqlx::query("UPDATE users SET balance = balance + ?, updated_at = datetime('now') WHERE id = ?")
        .bind(redemption.quota)
        .bind(&user_id)
        .execute(&mut *tx)
        .await?;

    // 3. Mark code as used
    sqlx::query("UPDATE redemptions SET is_used = 1, used_at = datetime('now'), used_by = ? WHERE id = ?")
        .bind(&user_id)
        .bind(redemption.id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

    Ok(Json(serde_json::json!({
        "success": true,
        "quota_added": redemption.quota
    })))
}
