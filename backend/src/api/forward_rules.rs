use axum::{
    extract::{Path, State},
    Json,
};
use std::sync::Arc;

use crate::AppState;
use crate::error::AppResult;
use crate::models::{ForwardRule, CreateRuleRequest, UpdateRuleRequest};

pub async fn list_rules(
    State(state): State<Arc<AppState>>,
) -> AppResult<Json<Vec<ForwardRule>>> {
    let rules = sqlx::query_as(&state.db.format_query("SELECT * FROM forward_rules ORDER BY id DESC"))
        .fetch_all(&state.db.pool)
        .await?;
    Ok(Json(rules))
}

pub async fn create_rule(
    State(state): State<Arc<AppState>>,
    Json(mut req): Json<CreateRuleRequest>,
) -> AppResult<Json<ForwardRule>> {
    req.name = req.name.trim().to_string();
    req.rule_type = req.rule_type.trim().to_string();

    if req.name.is_empty() || req.rule_type.is_empty() {
        return Err(crate::error::AppError::BadRequest("规则名和类型不能为空".to_string()));
    }

    let config_json = req.config_json.unwrap_or_else(|| "{}".to_string());
    
    let exists: Option<i32> = sqlx::query_scalar(&state.db.format_query("SELECT id FROM forward_rules WHERE name = ?"))
        .bind(&req.name)
        .fetch_optional(&state.db.pool)
        .await?;
    
    if exists.is_some() {
        return Err(crate::error::AppError::Conflict("规则名称已存在".to_string()));
    }

    let rule = sqlx::query_as(
        &state.db.format_query("INSERT INTO forward_rules (name, rule_type, description, config_json, is_active) VALUES (?, ?, ?, ?, ?) RETURNING *")
    )
    .bind(&req.name)
    .bind(&req.rule_type)
    .bind(&req.description)
    .bind(&config_json)
    .bind(req.is_active)
    .fetch_one(&state.db.pool)
    .await?;

    Ok(Json(rule))
}

pub async fn update_rule(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
    Json(mut req): Json<UpdateRuleRequest>,
) -> AppResult<Json<ForwardRule>> {
    // Basic trimming if fields are provided
    if let Some(name) = &mut req.name {
        *name = name.trim().to_string();
        if name.is_empty() {
            return Err(crate::error::AppError::BadRequest("规则名称不能为空".to_string()));
        }
    }

    if let Some(name) = &req.name {
        let exists: Option<i32> = sqlx::query_scalar(&state.db.format_query("SELECT id FROM forward_rules WHERE name = ? AND id != ?"))
            .bind(name)
            .bind(id)
            .fetch_optional(&state.db.pool)
            .await?;
        if exists.is_some() {
            return Err(crate::error::AppError::Conflict("规则名称已经被占用".to_string()));
        }
        sqlx::query(&state.db.format_query("UPDATE forward_rules SET name = ? WHERE id = ?")).bind(name).bind(id).execute(&state.db.pool).await?;
    }
    
    if let Some(rtype) = &req.rule_type {
        sqlx::query(&state.db.format_query("UPDATE forward_rules SET rule_type = ? WHERE id = ?")).bind(rtype).bind(id).execute(&state.db.pool).await?;
    }
    if let Some(config) = &req.config_json {
        sqlx::query(&state.db.format_query("UPDATE forward_rules SET config_json = ? WHERE id = ?")).bind(config).bind(id).execute(&state.db.pool).await?;
    }
    if let Some(desc) = &req.description {
        sqlx::query(&state.db.format_query("UPDATE forward_rules SET description = ? WHERE id = ?")).bind(desc).bind(id).execute(&state.db.pool).await?;
    }
    if let Some(active) = req.is_active {
        sqlx::query(&state.db.format_query("UPDATE forward_rules SET is_active = ? WHERE id = ?")).bind(active).bind(id).execute(&state.db.pool).await?;
    }

    sqlx::query(&state.db.format_query("UPDATE forward_rules SET updated_at = CURRENT_TIMESTAMP WHERE id = ?")).bind(id).execute(&state.db.pool).await?;

    let rule = sqlx::query_as(&state.db.format_query("SELECT * FROM forward_rules WHERE id = ?"))
        .bind(id)
        .fetch_one(&state.db.pool)
        .await?;

    Ok(Json(rule))
}

pub async fn delete_rule(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
) -> AppResult<Json<serde_json::Value>> {
    // Check if the rule is being used by any models by checking JSON structure 
    // Usually handled logically, here we let it vanish, models matching parsing will gracefully fall back
    sqlx::query(&state.db.format_query("DELETE FROM forward_rules WHERE id = ?"))
        .bind(id)
        .execute(&state.db.pool)
        .await?;

    Ok(Json(serde_json::json!({ "success": true })))
}
