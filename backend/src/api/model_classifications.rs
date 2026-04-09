use axum::{
    extract::{Path, State},
    Json,
};
use std::sync::Arc;
use crate::AppState;
use crate::error::AppResult;
use crate::models::{
    ModelProvider, ModelType, ClassificationRequest, 
    ClassificationCount, ClassificationsResponse
};

// --- Providers ---

pub async fn list_providers(
    State(state): State<Arc<AppState>>,
) -> AppResult<Json<Vec<ModelProvider>>> {
    let providers = sqlx::query_as("SELECT * FROM model_providers ORDER BY sort_order ASC, id ASC")
        .fetch_all(&state.db.pool)
        .await?;
    Ok(Json(providers))
}

pub async fn create_provider(
    State(state): State<Arc<AppState>>,
    Json(mut req): Json<ClassificationRequest>,
) -> AppResult<Json<ModelProvider>> {
    req.name = req.name.trim().to_string();
    if req.name.is_empty() {
        return Err(crate::error::AppError::BadRequest("名称不能为空".to_string()));
    }

    // Check for duplicate name
    let exists: Option<i32> = sqlx::query_scalar("SELECT id FROM model_providers WHERE name = ?")
        .bind(&req.name)
        .fetch_optional(&state.db.pool)
        .await?;
    
    if exists.is_some() {
        return Err(crate::error::AppError::Conflict("服务商名称已存在".to_string()));
    }

    let provider = sqlx::query_as(
        "INSERT INTO model_providers (name, sort_order, is_active) VALUES (?, ?, ?) RETURNING *"
    )
    .bind(&req.name)
    .bind(req.sort_order)
    .bind(req.is_active)
    .fetch_one(&state.db.pool)
    .await?;
    Ok(Json(provider))
}

pub async fn update_provider(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
    Json(mut req): Json<ClassificationRequest>,
) -> AppResult<Json<ModelProvider>> {
    req.name = req.name.trim().to_string();
    if req.name.is_empty() {
        return Err(crate::error::AppError::BadRequest("名称不能为空".to_string()));
    }

    // Check for duplicate name (excluding itself)
    let exists: Option<i32> = sqlx::query_scalar("SELECT id FROM model_providers WHERE name = ? AND id != ?")
        .bind(&req.name)
        .bind(id)
        .fetch_optional(&state.db.pool)
        .await?;
    
    if exists.is_some() {
        return Err(crate::error::AppError::Conflict("服务商名称与其他记录重复".to_string()));
    }

    let provider = sqlx::query_as(
        "UPDATE model_providers SET name = ?, sort_order = ?, is_active = ?, updated_at = datetime('now') WHERE id = ? RETURNING *"
    )
    .bind(&req.name)
    .bind(req.sort_order)
    .bind(req.is_active)
    .bind(id)
    .fetch_one(&state.db.pool)
    .await?;
    Ok(Json(provider))
}

pub async fn delete_provider(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
) -> AppResult<Json<serde_json::Value>> {
    // NULL out references in models table
    sqlx::query("UPDATE models SET provider_id = NULL WHERE provider_id = ?")
        .bind(id)
        .execute(&state.db.pool)
        .await?;
        
    sqlx::query("DELETE FROM model_providers WHERE id = ?")
        .bind(id)
        .execute(&state.db.pool)
        .await?;
    Ok(Json(serde_json::json!({ "success": true })))
}

// --- Types ---

pub async fn list_types(
    State(state): State<Arc<AppState>>,
) -> AppResult<Json<Vec<ModelType>>> {
    let types = sqlx::query_as("SELECT * FROM model_types ORDER BY sort_order ASC, id ASC")
        .fetch_all(&state.db.pool)
        .await?;
    Ok(Json(types))
}

pub async fn create_type(
    State(state): State<Arc<AppState>>,
    Json(mut req): Json<ClassificationRequest>,
) -> AppResult<Json<ModelType>> {
    req.name = req.name.trim().to_string();
    if req.name.is_empty() {
        return Err(crate::error::AppError::BadRequest("名称不能为空".to_string()));
    }

    // Check for duplicate name
    let exists: Option<i32> = sqlx::query_scalar("SELECT id FROM model_types WHERE name = ?")
        .bind(&req.name)
        .fetch_optional(&state.db.pool)
        .await?;
    
    if exists.is_some() {
        return Err(crate::error::AppError::Conflict("类型名称已存在".to_string()));
    }

    let model_type = sqlx::query_as(
        "INSERT INTO model_types (name, sort_order, is_active) VALUES (?, ?, ?) RETURNING *"
    )
    .bind(&req.name)
    .bind(req.sort_order)
    .bind(req.is_active)
    .fetch_one(&state.db.pool)
    .await?;
    Ok(Json(model_type))
}

pub async fn update_type(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
    Json(mut req): Json<ClassificationRequest>,
) -> AppResult<Json<ModelType>> {
    req.name = req.name.trim().to_string();
    if req.name.is_empty() {
        return Err(crate::error::AppError::BadRequest("名称不能为空".to_string()));
    }

    // Check for duplicate name (excluding itself)
    let exists: Option<i32> = sqlx::query_scalar("SELECT id FROM model_types WHERE name = ? AND id != ?")
        .bind(&req.name)
        .bind(id)
        .fetch_optional(&state.db.pool)
        .await?;
    
    if exists.is_some() {
        return Err(crate::error::AppError::Conflict("类型名称与其他记录重复".to_string()));
    }

    let model_type = sqlx::query_as(
        "UPDATE model_types SET name = ?, sort_order = ?, is_active = ?, updated_at = datetime('now') WHERE id = ? RETURNING *"
    )
    .bind(&req.name)
    .bind(req.sort_order)
    .bind(req.is_active)
    .bind(id)
    .fetch_one(&state.db.pool)
    .await?;
    Ok(Json(model_type))
}

pub async fn delete_type(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
) -> AppResult<Json<serde_json::Value>> {
    // NULL out references in models table
    sqlx::query("UPDATE models SET type_id = NULL WHERE type_id = ?")
        .bind(id)
        .execute(&state.db.pool)
        .await?;

    sqlx::query("DELETE FROM model_types WHERE id = ?")
        .bind(id)
        .execute(&state.db.pool)
        .await?;
    Ok(Json(serde_json::json!({ "success": true })))
}

// --- Combined metadata with counts ---

pub async fn get_classifications_stats(
    State(state): State<Arc<AppState>>,
) -> AppResult<Json<ClassificationsResponse>> {
    // Get providers with model counts
    let providers = sqlx::query_as(
        r#"SELECT p.id, p.name, COUNT(m.id) as count 
           FROM model_providers p 
           LEFT JOIN models m ON p.id = m.provider_id 
           WHERE p.is_active = 1
           GROUP BY p.id 
           ORDER BY p.sort_order ASC, p.id ASC"#
    )
    .fetch_all(&state.db.pool)
    .await?;

    // Get types with model counts
    let types = sqlx::query_as(
        r#"SELECT t.id, t.name, COUNT(m.id) as count 
           FROM model_types t 
           LEFT JOIN models m ON t.id = m.type_id 
           WHERE t.is_active = 1
           GROUP BY t.id 
           ORDER BY t.sort_order ASC, t.id ASC"#
    )
    .fetch_all(&state.db.pool)
    .await?;

    Ok(Json(ClassificationsResponse { providers, types }))
}
