use axum::{
    extract::{Path, State},
    Json,
};
use sqlx::Row;
use std::sync::Arc;

use crate::AppState;
use crate::error::AppResult;
use crate::models::{Model, CreateModelRequest, UpdateModelRequest, ModelListResponse};

pub async fn list_models(
    State(state): State<Arc<AppState>>,
) -> AppResult<Json<ModelListResponse>> {
    let models: Vec<Model> = sqlx::query_as("SELECT * FROM models ORDER BY id DESC")
        .fetch_all(&state.db.pool)
        .await?;
    
    let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM models")
        .fetch_one(&state.db.pool)
        .await?;

    Ok(Json(ModelListResponse { data: models, total }))
}

pub async fn create_model(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateModelRequest>,
) -> AppResult<Json<Model>> {
    let group_ratios = serde_json::to_string(&req.group_ratios.unwrap_or_default()).unwrap_or_else(|_| "{}".to_string());
    
    let id = sqlx::query(
        r#"INSERT INTO models (name, model_id, billing_type, prompt_rate, completion_rate, fixed_rate, duration_rate, group_ratios, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
           RETURNING id"#
    )
    .bind(&req.name)
    .bind(&req.model_id)
    .bind(&req.billing_type)
    .bind(req.prompt_rate)
    .bind(req.completion_rate)
    .bind(req.fixed_rate)
    .bind(req.duration_rate)
    .bind(&group_ratios)
    .fetch_one(&state.db.pool)
    .await?
    .get::<i64, _>("id");

    let model = sqlx::query_as("SELECT * FROM models WHERE id = ?")
        .bind(id)
        .fetch_one(&state.db.pool)
        .await?;

    Ok(Json(model))
}

pub async fn update_model(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(req): Json<UpdateModelRequest>,
) -> AppResult<Json<Model>> {
    if let Some(name) = &req.name {
        sqlx::query("UPDATE models SET name = ? WHERE id = ?").bind(name).bind(id).execute(&state.db.pool).await?;
    }
    if let Some(model_id) = &req.model_id {
        sqlx::query("UPDATE models SET model_id = ? WHERE id = ?").bind(model_id).bind(id).execute(&state.db.pool).await?;
    }
    if let Some(bt) = &req.billing_type {
        sqlx::query("UPDATE models SET billing_type = ? WHERE id = ?").bind(bt).bind(id).execute(&state.db.pool).await?;
    }
    if let Some(pr) = req.prompt_rate {
        sqlx::query("UPDATE models SET prompt_rate = ? WHERE id = ?").bind(pr).bind(id).execute(&state.db.pool).await?;
    }
    if let Some(cr) = req.completion_rate {
        sqlx::query("UPDATE models SET completion_rate = ? WHERE id = ?").bind(cr).bind(id).execute(&state.db.pool).await?;
    }
    if let Some(fr) = req.fixed_rate {
        sqlx::query("UPDATE models SET fixed_rate = ? WHERE id = ?").bind(fr).bind(id).execute(&state.db.pool).await?;
    }
    if let Some(dr) = req.duration_rate {
        sqlx::query("UPDATE models SET duration_rate = ? WHERE id = ?").bind(dr).bind(id).execute(&state.db.pool).await?;
    }
    if let Some(gr) = &req.group_ratios {
        let gr_str = serde_json::to_string(gr).unwrap_or_else(|_| "{}".to_string());
        sqlx::query("UPDATE models SET group_ratios = ? WHERE id = ?").bind(&gr_str).bind(id).execute(&state.db.pool).await?;
    }
    if let Some(active) = req.is_active {
        sqlx::query("UPDATE models SET is_active = ? WHERE id = ?").bind(active).bind(id).execute(&state.db.pool).await?;
    }

    sqlx::query("UPDATE models SET updated_at = datetime('now') WHERE id = ?").bind(id).execute(&state.db.pool).await?;

    let model = sqlx::query_as("SELECT * FROM models WHERE id = ?")
        .bind(id)
        .fetch_one(&state.db.pool)
        .await?;

    Ok(Json(model))
}

pub async fn delete_model(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> AppResult<Json<serde_json::Value>> {
    sqlx::query("DELETE FROM models WHERE id = ?")
        .bind(id)
        .execute(&state.db.pool)
        .await?;

    Ok(Json(serde_json::json!({ "success": true })))
}
