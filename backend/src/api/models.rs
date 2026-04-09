use axum::{
    extract::{Path, State},
    Json,
};
use sqlx::Row;
use std::sync::Arc;

use crate::AppState;
use crate::error::AppResult;
use crate::models::{Model, CreateModelRequest, UpdateModelRequest, ModelListResponse};

#[derive(Debug, serde::Deserialize)]
pub struct ModelQuery {
    pub provider_id: Option<i32>,
    pub type_id: Option<i32>,
}

pub async fn list_models(
    State(state): State<Arc<AppState>>,
    axum::extract::Query(query): axum::extract::Query<ModelQuery>,
) -> AppResult<Json<ModelListResponse>> {
    let mut sql = "SELECT * FROM models WHERE 1=1".to_string();
    if query.provider_id.is_some() {
        sql.push_str(" AND provider_id = ?");
    }
    if query.type_id.is_some() {
        sql.push_str(" AND type_id = ?");
    }
    sql.push_str(" ORDER BY id DESC");

    let mut q = sqlx::query_as::<_, Model>(&sql);
    if let Some(pid) = query.provider_id {
        q = q.bind(pid);
    }
    if let Some(tid) = query.type_id {
        q = q.bind(tid);
    }

    let models = q.fetch_all(&state.db.pool).await?;
    
    // Total count for the filtered list
    let mut count_sql = "SELECT COUNT(*) FROM models WHERE 1=1".to_string();
    if query.provider_id.is_some() {
        count_sql.push_str(" AND provider_id = ?");
    }
    if query.type_id.is_some() {
        count_sql.push_str(" AND type_id = ?");
    }
    
    let mut cq = sqlx::query_scalar::<_, i64>(&count_sql);
    if let Some(pid) = query.provider_id {
        cq = cq.bind(pid);
    }
    if let Some(tid) = query.type_id {
        cq = cq.bind(tid);
    }
    
    let total = cq.fetch_one(&state.db.pool).await?;

    Ok(Json(ModelListResponse { data: models, total }))
}

pub async fn create_model(
    State(state): State<Arc<AppState>>,
    Json(mut req): Json<CreateModelRequest>,
) -> AppResult<Json<Model>> {
    req.name = req.name.trim().to_string();
    req.model_id = req.model_id.trim().to_string();

    if req.name.is_empty() || req.model_id.is_empty() {
        return Err(crate::error::AppError::BadRequest("名称和模型 ID 不能为空".to_string()));
    }

    // Check for duplicate name or model_id
    let exists: Option<i64> = sqlx::query_scalar("SELECT id FROM models WHERE name = ? OR model_id = ?")
        .bind(&req.name)
        .bind(&req.model_id)
        .fetch_optional(&state.db.pool)
        .await?;
    
    if exists.is_some() {
        return Err(crate::error::AppError::Conflict("已有相同模型或者 id".to_string()));
    }

    let group_ratios = serde_json::to_string(&req.group_ratios.unwrap_or_default()).unwrap_or_else(|_| "{}".to_string());
    let billing_rule = req.billing_rule.unwrap_or_else(|| "standard".to_string());
    let billing_unit = req.billing_unit.unwrap_or_else(|| "1k".to_string());
    let pricing_tiers = serde_json::to_string(&req.pricing_tiers.unwrap_or_default()).unwrap_or_else(|_| "[]".to_string());
    
    let id = sqlx::query(
        r#"INSERT INTO models (name, model_id, provider_id, type_id, billing_type, prompt_rate, completion_rate, fixed_rate, duration_rate, group_ratios, billing_rule, billing_unit, pricing_tiers, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
           RETURNING id"#
    )
    .bind(&req.name)
    .bind(&req.model_id)
    .bind(req.provider_id)
    .bind(req.type_id)
    .bind(&req.billing_type)
    .bind(req.prompt_rate)
    .bind(req.completion_rate)
    .bind(req.fixed_rate)
    .bind(req.duration_rate)
    .bind(&group_ratios)
    .bind(&billing_rule)
    .bind(&billing_unit)
    .bind(&pricing_tiers)
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
    Json(mut req): Json<UpdateModelRequest>,
) -> AppResult<Json<Model>> {
    // Basic trimming if fields are provided
    if let Some(name) = &mut req.name {
        *name = name.trim().to_string();
        if name.is_empty() {
            return Err(crate::error::AppError::BadRequest("名称不能为空".to_string()));
        }
    }
    if let Some(model_id) = &mut req.model_id {
        *model_id = model_id.trim().to_string();
        if model_id.is_empty() {
            return Err(crate::error::AppError::BadRequest("模型 ID 不能为空".to_string()));
        }
    }

    // Check for duplicate name or model_id (collision with OTHER models)
    if let (Some(name), Some(mid)) = (&req.name, &req.model_id) {
        let exists: Option<i64> = sqlx::query_scalar("SELECT id FROM models WHERE (name = ? OR model_id = ?) AND id != ?")
            .bind(name)
            .bind(mid)
            .bind(id)
            .fetch_optional(&state.db.pool)
            .await?;
        if exists.is_some() {
            return Err(crate::error::AppError::Conflict("已有相同模型或者 id".to_string()));
        }
    } else if let Some(name) = &req.name {
        let exists: Option<i64> = sqlx::query_scalar("SELECT id FROM models WHERE name = ? AND id != ?")
            .bind(name)
            .bind(id)
            .fetch_optional(&state.db.pool)
            .await?;
        if exists.is_some() {
            return Err(crate::error::AppError::Conflict("已有相同模型或者 id".to_string()));
        }
    } else if let Some(mid) = &req.model_id {
        let exists: Option<i64> = sqlx::query_scalar("SELECT id FROM models WHERE model_id = ? AND id != ?")
            .bind(mid)
            .bind(id)
            .fetch_optional(&state.db.pool)
            .await?;
        if exists.is_some() {
            return Err(crate::error::AppError::Conflict("已有相同模型或者 id".to_string()));
        }
    }

    if let Some(name) = &req.name {
        sqlx::query("UPDATE models SET name = ? WHERE id = ?").bind(name).bind(id).execute(&state.db.pool).await?;
    }
    if let Some(model_id) = &req.model_id {
        sqlx::query("UPDATE models SET model_id = ? WHERE id = ?").bind(model_id).bind(id).execute(&state.db.pool).await?;
    }
    if let Some(pid) = req.provider_id {
        sqlx::query("UPDATE models SET provider_id = ? WHERE id = ?").bind(pid).bind(id).execute(&state.db.pool).await?;
    }
    if let Some(tid) = req.type_id {
        sqlx::query("UPDATE models SET type_id = ? WHERE id = ?").bind(tid).bind(id).execute(&state.db.pool).await?;
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
    if let Some(rule) = &req.billing_rule {
        sqlx::query("UPDATE models SET billing_rule = ? WHERE id = ?").bind(rule).bind(id).execute(&state.db.pool).await?;
    }
    if let Some(unit) = &req.billing_unit {
        sqlx::query("UPDATE models SET billing_unit = ? WHERE id = ?").bind(unit).bind(id).execute(&state.db.pool).await?;
    }
    if let Some(tiers) = &req.pricing_tiers {
        let tiers_str = serde_json::to_string(tiers).unwrap_or_else(|_| "[]".to_string());
        sqlx::query("UPDATE models SET pricing_tiers = ? WHERE id = ?").bind(&tiers_str).bind(id).execute(&state.db.pool).await?;
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
