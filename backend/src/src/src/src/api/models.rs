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
    let forward_rule_ids = req.forward_rule_ids.map(|v| serde_json::to_string(&v).unwrap_or_else(|_| "[]".to_string()));
    
    let pre_deduction = req.pre_deduction.unwrap_or(0.0);
    // 可选：如果此处有关联的 billing_rule 检查也可以做，目前统一允许设置
    
    let is_active = req.is_active.unwrap_or(1);
    let enable_log_content = req.enable_log_content.unwrap_or(0);

    let id_i32 = sqlx::query(
        &state.db.format_query(r#"INSERT INTO models (name, model_id, provider_id, type_id, group_ratios, forward_rule_ids, billing_rule_id, pre_deduction, is_active, enable_log_content)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           RETURNING id"#)
    )
    .bind(&req.name)
    .bind(&req.model_id)
    .bind(req.provider_id)
    .bind(req.type_id)
    .bind(&group_ratios)
    .bind(forward_rule_ids)
    .bind(req.billing_rule_id)
    .bind(pre_deduction)
    .bind(is_active)
    .bind(enable_log_content)
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
    if let Some(pd) = req.pre_deduction {
        // Here we could enforce billing_type == "tokens" logic, but since billing_type is now in billing_rules,
        // we'll rely on the frontend to send pre_deduction = 0.0, or we could fetch the rule and check.
        // For strictness, if the frontend implements it, this is fine. If not, we can check here.
        sqlx::query(&state.db.format_query("UPDATE models SET pre_deduction = ? WHERE id = ?")).bind(pd).bind(id).execute(&state.db.pool).await?;
    }
    if let Some(rules) = &req.forward_rule_ids {
        let rules_str = serde_json::to_string(rules).unwrap_or_else(|_| "[]".to_string());
        sqlx::query(&state.db.format_query("UPDATE models SET forward_rule_ids = ? WHERE id = ?")).bind(&rules_str).bind(id).execute(&state.db.pool).await?;
    }
    if let Some(active) = req.is_active {
        sqlx::query(&state.db.format_query("UPDATE models SET is_active = ? WHERE id = ?")).bind(active).bind(id).execute(&state.db.pool).await?;
    }
    if let Some(elc) = req.enable_log_content {
        sqlx::query(&state.db.format_query("UPDATE models SET enable_log_content = ? WHERE id = ?")).bind(elc).bind(id).execute(&state.db.pool).await?;
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
