use axum::{
    extract::{Path, State},
    Json,
};
use sqlx::Row;
use std::sync::Arc;

use crate::AppState;
use crate::error::AppResult;
use crate::models::{BillingRule, CreateBillingRuleRequest, UpdateBillingRuleRequest};

pub async fn list_rules(
    State(state): State<Arc<AppState>>,
) -> AppResult<Json<Vec<BillingRule>>> {
    let rules = sqlx::query_as(&state.db.format_query("SELECT * FROM billing_rules ORDER BY sort_order DESC, id DESC"))
        .fetch_all(&state.db.pool)
        .await?;
    Ok(Json(rules))
}

pub async fn create_rule(
    State(state): State<Arc<AppState>>,
    Json(mut req): Json<CreateBillingRuleRequest>,
) -> AppResult<Json<BillingRule>> {
    req.name = req.name.trim().to_string();

    if req.name.is_empty() {
        return Err(crate::error::AppError::BadRequest("规则名称不能为空".to_string()));
    }

    let pricing_tiers_str = serde_json::to_string(&req.pricing_tiers.unwrap_or_default()).unwrap_or_else(|_| "[]".to_string());
    let extended_config_str = serde_json::to_string(&req.extended_config.unwrap_or_default()).unwrap_or_else(|_| "{}".to_string());
    
    let exists: Option<i64> = sqlx::query_scalar(&state.db.format_query("SELECT id FROM billing_rules WHERE name = ?"))
        .bind(&req.name)
        .fetch_optional(&state.db.pool)
        .await?;
    
    if exists.is_some() {
        return Err(crate::error::AppError::Conflict("该费用规则名称已存在".to_string()));
    }

    let mut pid_val = req.pid.clone().unwrap_or_default();
    if pid_val.is_empty() {
        use rand::Rng;
        pid_val = format!("6{:04}", rand::thread_rng().gen_range(0..10000));
    }

    let id_i64 = sqlx::query(
        &state.db.format_query(r#"INSERT INTO billing_rules 
            (name, billing_type, prompt_rate, completion_rate, cached_rate, claude_cache_creation_rate, claude_cache_read_rate, fixed_rate, duration_rate, billing_rule, pricing_tiers, extended_config, is_active, pid, provider_id, type_id, pricing_type, sort_order) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id"#)
    )
    .bind(&req.name)
    .bind(&req.billing_type)
    .bind(req.prompt_rate)
    .bind(req.completion_rate)
    .bind(req.cached_rate)
    .bind(req.claude_cache_creation_rate)
    .bind(req.claude_cache_read_rate)
    .bind(req.fixed_rate)
    .bind(req.duration_rate)
    .bind(&req.billing_rule)
    .bind(&pricing_tiers_str)
    .bind(&extended_config_str)
    .bind(req.is_active)
    .bind(&pid_val)
    .bind(req.provider_id)
    .bind(req.type_id)
    .bind(&req.pricing_type)
    .bind(req.sort_order.unwrap_or(0))
    .fetch_one(&state.db.pool)
    .await?
    .get::<i64, _>("id");

    let rule = sqlx::query_as(&state.db.format_query("SELECT * FROM billing_rules WHERE id = ?"))
        .bind(id_i64)
        .fetch_one(&state.db.pool)
        .await?;

    crate::api::plugins::notify_marketplace_data_changed(&state).await;

    Ok(Json(rule))
}

pub async fn update_rule(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(mut req): Json<UpdateBillingRuleRequest>,
) -> AppResult<Json<BillingRule>> {
    if let Some(name) = &mut req.name {
        *name = name.trim().to_string();
        if name.is_empty() {
            return Err(crate::error::AppError::BadRequest("规则名称不能为空".to_string()));
        }
        let exists: Option<i64> = sqlx::query_scalar(&state.db.format_query("SELECT id FROM billing_rules WHERE name = ? AND id != ?"))
            .bind(&*name)
            .bind(id)
            .fetch_optional(&state.db.pool)
            .await?;
        if exists.is_some() {
            return Err(crate::error::AppError::Conflict("规则名称已经被占用".to_string()));
        }
        sqlx::query(&state.db.format_query("UPDATE billing_rules SET name = ? WHERE id = ?")).bind(&*name).bind(id).execute(&state.db.pool).await?;
    }
    
    if let Some(val) = &req.billing_type {
        sqlx::query(&state.db.format_query("UPDATE billing_rules SET billing_type = ? WHERE id = ?")).bind(val).bind(id).execute(&state.db.pool).await?;
    }
    if let Some(val) = req.prompt_rate {
        sqlx::query(&state.db.format_query("UPDATE billing_rules SET prompt_rate = ? WHERE id = ?")).bind(val).bind(id).execute(&state.db.pool).await?;
    }
    if let Some(val) = req.completion_rate {
        sqlx::query(&state.db.format_query("UPDATE billing_rules SET completion_rate = ? WHERE id = ?")).bind(val).bind(id).execute(&state.db.pool).await?;
    }
    if let Some(val) = req.cached_rate {
        sqlx::query(&state.db.format_query("UPDATE billing_rules SET cached_rate = ? WHERE id = ?")).bind(val).bind(id).execute(&state.db.pool).await?;
    }
    if let Some(val) = req.claude_cache_creation_rate {
        sqlx::query(&state.db.format_query("UPDATE billing_rules SET claude_cache_creation_rate = ? WHERE id = ?")).bind(val).bind(id).execute(&state.db.pool).await?;
    }
    if let Some(val) = req.claude_cache_read_rate {
        sqlx::query(&state.db.format_query("UPDATE billing_rules SET claude_cache_read_rate = ? WHERE id = ?")).bind(val).bind(id).execute(&state.db.pool).await?;
    }
    if let Some(val) = req.fixed_rate {
        sqlx::query(&state.db.format_query("UPDATE billing_rules SET fixed_rate = ? WHERE id = ?")).bind(val).bind(id).execute(&state.db.pool).await?;
    }
    if let Some(val) = req.duration_rate {
        sqlx::query(&state.db.format_query("UPDATE billing_rules SET duration_rate = ? WHERE id = ?")).bind(val).bind(id).execute(&state.db.pool).await?;
    }
    if let Some(val) = &req.billing_rule {
        sqlx::query(&state.db.format_query("UPDATE billing_rules SET billing_rule = ? WHERE id = ?")).bind(val).bind(id).execute(&state.db.pool).await?;
    }
    if let Some(val) = &req.pricing_tiers {
        let str_val = serde_json::to_string(val).unwrap_or_else(|_| "[]".to_string());
        sqlx::query(&state.db.format_query("UPDATE billing_rules SET pricing_tiers = ? WHERE id = ?")).bind(&str_val).bind(id).execute(&state.db.pool).await?;
    }
    if let Some(val) = &req.extended_config {
        let str_val = serde_json::to_string(val).unwrap_or_else(|_| "{}".to_string());
        sqlx::query(&state.db.format_query("UPDATE billing_rules SET extended_config = ? WHERE id = ?")).bind(&str_val).bind(id).execute(&state.db.pool).await?;
    }
    if let Some(active) = req.is_active {
        sqlx::query(&state.db.format_query("UPDATE billing_rules SET is_active = ? WHERE id = ?")).bind(active).bind(id).execute(&state.db.pool).await?;
    }
    if let Some(pid) = &req.pid {
        sqlx::query(&state.db.format_query("UPDATE billing_rules SET pid = ? WHERE id = ?")).bind(pid).bind(id).execute(&state.db.pool).await?;
    }
    if let Some(provider_id) = req.provider_id {
        sqlx::query(&state.db.format_query("UPDATE billing_rules SET provider_id = ? WHERE id = ?")).bind(provider_id).bind(id).execute(&state.db.pool).await?;
    }
    if let Some(type_id) = req.type_id {
        sqlx::query(&state.db.format_query("UPDATE billing_rules SET type_id = ? WHERE id = ?")).bind(type_id).bind(id).execute(&state.db.pool).await?;
    }
    if let Some(pricing_type) = &req.pricing_type {
        sqlx::query(&state.db.format_query("UPDATE billing_rules SET pricing_type = ? WHERE id = ?")).bind(pricing_type).bind(id).execute(&state.db.pool).await?;
    }
    if let Some(val) = req.sort_order {
        sqlx::query(&state.db.format_query("UPDATE billing_rules SET sort_order = ? WHERE id = ?")).bind(val).bind(id).execute(&state.db.pool).await?;
    }

    sqlx::query(&state.db.format_query("UPDATE billing_rules SET updated_at = CURRENT_TIMESTAMP WHERE id = ?")).bind(id).execute(&state.db.pool).await?;

    let rule = sqlx::query_as(&state.db.format_query("SELECT * FROM billing_rules WHERE id = ?"))
        .bind(id)
        .fetch_one(&state.db.pool)
        .await?;

    crate::api::plugins::notify_marketplace_data_changed(&state).await;

    Ok(Json(rule))
}

pub async fn delete_rule(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> AppResult<Json<serde_json::Value>> {
    let rule: Option<BillingRule> = sqlx::query_as(&state.db.format_query("SELECT * FROM billing_rules WHERE id = ?"))
        .bind(id)
        .fetch_optional(&state.db.pool)
        .await?;

    if let Some(r) = rule {
        if r.is_system == 1 {
            return Err(crate::error::AppError::Forbidden("系统内置计费规则不允许删除".to_string()));
        }
    }

    sqlx::query(&state.db.format_query("DELETE FROM billing_rules WHERE id = ?"))
        .bind(id)
        .execute(&state.db.pool)
        .await?;
    sqlx::query(&state.db.format_query("UPDATE models SET billing_rule_id = NULL WHERE billing_rule_id = ?"))
        .bind(id)
        .execute(&state.db.pool)
        .await?;

    crate::api::plugins::notify_marketplace_data_changed(&state).await;

    Ok(Json(serde_json::json!({ "success": true })))
}
