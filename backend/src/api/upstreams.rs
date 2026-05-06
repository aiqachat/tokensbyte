use axum::{
    extract::{Path, State},
    Json,
};
use std::sync::Arc;
use crate::AppState;
use crate::error::{AppError, AppResult};
use crate::models::{Upstream, UpstreamRequest};
use crate::providers::volcengine_billing;

pub async fn list_upstreams(
    State(state): State<Arc<AppState>>,
) -> AppResult<Json<Vec<Upstream>>> {
    let upstreams = sqlx::query_as(&state.db.format_query("SELECT * FROM upstreams ORDER BY sort_order ASC, id ASC"))
        .fetch_all(&state.db.pool)
        .await?;
    Ok(Json(upstreams))
}

pub async fn create_upstream(
    State(state): State<Arc<AppState>>,
    Json(mut req): Json<UpstreamRequest>,
) -> AppResult<Json<Upstream>> {
    req.name = req.name.trim().to_string();
    if req.name.is_empty() {
        return Err(crate::error::AppError::BadRequest("名称不能为空".to_string()));
    }

    // Check for duplicate name
    let exists: Option<i64> = sqlx::query_scalar(&state.db.format_query("SELECT id FROM upstreams WHERE name = ?"))
        .bind(&req.name)
        .fetch_optional(&state.db.pool)
        .await?;
    
    if exists.is_some() {
        return Err(crate::error::AppError::Conflict("上游名称已存在".to_string()));
    }

    let upstream = sqlx::query_as(
        &state.db.format_query("INSERT INTO upstreams (name, upstream_type, sort_order, is_active, remark, config) VALUES (?, ?, ?, ?, ?, ?) RETURNING *")
    )
    .bind(&req.name)
    .bind(&req.upstream_type)
    .bind(req.sort_order)
    .bind(req.is_active)
    .bind(&req.remark)
    .bind(&req.config)
    .fetch_one(&state.db.pool)
    .await?;
    Ok(Json(upstream))
}

pub async fn update_upstream(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(mut req): Json<UpstreamRequest>,
) -> AppResult<Json<Upstream>> {
    req.name = req.name.trim().to_string();
    if req.name.is_empty() {
        return Err(crate::error::AppError::BadRequest("名称不能为空".to_string()));
    }

    // Check for duplicate name
    let exists: Option<i64> = sqlx::query_scalar(&state.db.format_query("SELECT id FROM upstreams WHERE name = ? AND id != ?"))
        .bind(&req.name)
        .bind(id)
        .fetch_optional(&state.db.pool)
        .await?;
    
    if exists.is_some() {
        return Err(crate::error::AppError::Conflict("上游名称已存在".to_string()));
    }

    let upstream = sqlx::query_as(
        &state.db.format_query("UPDATE upstreams SET name = ?, upstream_type = ?, sort_order = ?, is_active = ?, remark = ?, config = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING *")
    )
    .bind(&req.name)
    .bind(&req.upstream_type)
    .bind(req.sort_order)
    .bind(req.is_active)
    .bind(&req.remark)
    .bind(&req.config)
    .bind(id)
    .fetch_one(&state.db.pool)
    .await?;
    Ok(Json(upstream))
}

pub async fn delete_upstream(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> AppResult<Json<serde_json::Value>> {
    sqlx::query(&state.db.format_query("DELETE FROM upstreams WHERE id = ?"))
        .bind(id)
        .execute(&state.db.pool)
        .await?;
    Ok(Json(serde_json::json!({ "success": true })))
}

pub async fn get_upstream_balance(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> AppResult<Json<serde_json::Value>> {
    let upstream: Upstream = sqlx::query_as(
        &state.db.format_query("SELECT * FROM upstreams WHERE id = ?")
    )
    .bind(id)
    .fetch_one(&state.db.pool)
    .await?;

    if upstream.upstream_type == "火山官方" {
        if let Some(config_str) = upstream.config {
            if let Ok(config) = serde_json::from_str::<serde_json::Value>(&config_str) {
                if let (Some(ak), Some(sk)) = (
                    config.get("api_key").and_then(|v| v.as_str()),
                    config.get("api_secret").and_then(|v| v.as_str()),
                ) {
                    let balance = volcengine_billing::query_balance(ak, sk).await
                        .map_err(|e| AppError::Internal(e.to_string()))?;
                    return Ok(Json(serde_json::json!({
                        "balance": balance
                    })));
                } else {
                    return Err(AppError::Internal("AK/SK is missing in config".into()));
                }
            }
        }
        return Err(AppError::Internal("Volcengine config is missing".into()));
    }

    // Fallback for types that don't support it yet
    Ok(Json(serde_json::json!({
        "balance": 0.0,
        "message": "Balance query not supported for this upstream type yet"
    })))
}
