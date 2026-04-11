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

    let formatted_sql = state.db.format_query(&sql);
    let mut q = sqlx::query_as::<_, Model>(&formatted_sql);
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
    
    let formatted_count_sql = state.db.format_query(&count_sql);
    let mut cq = sqlx::query_scalar::<_, i64>(&formatted_count_sql);
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
    let exists: Option<i32> = sqlx::query_scalar(&state.db.format_query("SELECT id FROM models WHERE name = ? OR model_id = ?"))
        .bind(&req.name)
        .bind(&req.model_id)
        .fetch_optional(&state.db.pool)
        .await?;
    
    if exists.is_some() {
        return Err(crate::error::AppError::Conflict("已有相同模型或者 id".to_string()));
    }

    let group_ratios = serde_json::to_string(&req.group_ratios.unwrap_or_default()).unwrap_or_else(|_| "{}".to_string());
    let billing_unit = req.billing_unit.unwrap_or_else(|| "1k".to_string());
    let forward_rule_ids = req.forward_rule_ids.map(|v| serde_json::to_string(&v).unwrap_or_else(|_| "[]".to_string()));
    
    let id_i32 = sqlx::query(
        &state.db.format_query(r#"INSERT INTO models (name, model_id, provider_id, type_id, billing_type, prompt_rate, completion_rate, fixed_rate, duration_rate, group_ratios, billing_rule, billing_unit, pricing_tiers, forward_rule_ids, billing_rule_id, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
           RETURNING id"#)
    )
    .bind(&req.name)
    .bind(&req.model_id)
    .bind(req.provider_id)
    .bind(req.type_id)
    .bind("tokens") // legacy dummy value
    .bind(0.0) // legacy dummy value
    .bind(0.0) // legacy dummy value
    .bind(0.0) // legacy dummy value
    .bind(0.0) // legacy dummy value
    .bind(&group_ratios)
    .bind("standard") // legacy dummy value
    .bind(&billing_unit)
    .bind("[]") // legacy dummy value
    .bind(forward_rule_ids)
    .bind(req.billing_rule_id)
    .fetch_one(&state.db.pool)
    .await?
    .get::<i32, _>("id");

    let model = sqlx::query_as(&state.db.format_query("SELECT * FROM models WHERE id = ?"))
        .bind(id_i32)
        .fetch_one(&state.db.pool)
        .await?;

    Ok(Json(model))
}

pub async fn update_model(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
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
        let exists: Option<i32> = sqlx::query_scalar(&state.db.format_query("SELECT id FROM models WHERE (name = ? OR model_id = ?) AND id != ?"))
            .bind(name)
            .bind(mid)
            .bind(id)
            .fetch_optional(&state.db.pool)
            .await?;
        if exists.is_some() {
            return Err(crate::error::AppError::Conflict("已有相同模型或者 id".to_string()));
        }
    } else if let Some(name) = &req.name {
        let exists: Option<i32> = sqlx::query_scalar(&state.db.format_query("SELECT id FROM models WHERE name = ? AND id != ?"))
            .bind(name)
            .bind(id)
            .fetch_optional(&state.db.pool)
            .await?;
        if exists.is_some() {
            return Err(crate::error::AppError::Conflict("已有相同模型或者 id".to_string()));
        }
    } else if let Some(mid) = &req.model_id {
        let exists: Option<i32> = sqlx::query_scalar(&state.db.format_query("SELECT id FROM models WHERE model_id = ? AND id != ?"))
            .bind(mid)
            .bind(id)
            .fetch_optional(&state.db.pool)
            .await?;
        if exists.is_some() {
            return Err(crate::error::AppError::Conflict("已有相同模型或者 id".to_string()));
        }
    }

    if let Some(name) = &req.name {
        sqlx::query(&state.db.format_query("UPDATE models SET name = ? WHERE id = ?")).bind(name).bind(id).execute(&state.db.pool).await?;
    }
    if let Some(model_id) = &req.model_id {
        sqlx::query(&state.db.format_query("UPDATE models SET model_id = ? WHERE id = ?")).bind(model_id).bind(id).execute(&state.db.pool).await?;
    }
    if let Some(pid) = req.provider_id {
        sqlx::query(&state.db.format_query("UPDATE models SET provider_id = ? WHERE id = ?")).bind(pid).bind(id).execute(&state.db.pool).await?;
    }
    if let Some(tid) = req.type_id {
        sqlx::query(&state.db.format_query("UPDATE models SET type_id = ? WHERE id = ?")).bind(tid).bind(id).execute(&state.db.pool).await?;
    }
    if let Some(rule_id) = req.billing_rule_id {
        sqlx::query(&state.db.format_query("UPDATE models SET billing_rule_id = ? WHERE id = ?")).bind(rule_id).bind(id).execute(&state.db.pool).await?;
    }
    if let Some(rules) = &req.forward_rule_ids {
        let rules_str = serde_json::to_string(rules).unwrap_or_else(|_| "[]".to_string());
        sqlx::query(&state.db.format_query("UPDATE models SET forward_rule_ids = ? WHERE id = ?")).bind(&rules_str).bind(id).execute(&state.db.pool).await?;
    }
    if let Some(active) = req.is_active {
        sqlx::query(&state.db.format_query("UPDATE models SET is_active = ? WHERE id = ?")).bind(active).bind(id).execute(&state.db.pool).await?;
    }

    sqlx::query(&state.db.format_query("UPDATE models SET updated_at = CURRENT_TIMESTAMP WHERE id = ?")).bind(id).execute(&state.db.pool).await?;

    let model = sqlx::query_as(&state.db.format_query("SELECT * FROM models WHERE id = ?"))
        .bind(id)
        .fetch_one(&state.db.pool)
        .await?;

    Ok(Json(model))
}

pub async fn delete_model(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
) -> AppResult<Json<serde_json::Value>> {
    sqlx::query(&state.db.format_query("DELETE FROM models WHERE id = ?"))
        .bind(id)
        .execute(&state.db.pool)
        .await?;

    Ok(Json(serde_json::json!({ "success": true })))
}
