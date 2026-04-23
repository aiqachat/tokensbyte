use axum::{
    extract::{Path, State},
    Json,
};
use sqlx::Row;
use std::sync::Arc;
use crate::AppState;
use crate::error::AppResult;
use crate::models::{UserLevel, CreateUserLevelRequest, UpdateUserLevelRequest, UserLevelListResponse};

pub async fn list_user_levels(
    State(state): State<Arc<AppState>>,
) -> AppResult<Json<UserLevelListResponse>> {
    let levels: Vec<UserLevel> = sqlx::query_as(&state.db.format_query("SELECT * FROM user_levels ORDER BY discount DESC"))
        .fetch_all(&state.db.pool)
        .await?;
    
    let total: i64 = sqlx::query_scalar(&state.db.format_query("SELECT COUNT(*) FROM user_levels"))
        .fetch_one(&state.db.pool)
        .await?;

    Ok(Json(UserLevelListResponse { data: levels, total }))
}

pub async fn create_user_level(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateUserLevelRequest>,
) -> AppResult<Json<UserLevel>> {
    // 如果设为默认，先清除其他默认
    if req.is_default.unwrap_or(0) == 1 {
        sqlx::query(&state.db.format_query("UPDATE user_levels SET is_default = 0 WHERE is_default = 1")).execute(&state.db.pool).await?;
    }

    let id = sqlx::query(
        &state.db.format_query(r#"INSERT INTO user_levels (name, group_key, discount, commission_ratio, invite_reward_inviter, invite_reward_invitee, daily_invite_limit, marketing_enabled, is_default, max_token_count, description)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           RETURNING id"#)
    )
    .bind(&req.name)
    .bind(&req.group_key)
    .bind(req.discount)
    .bind(req.commission_ratio.unwrap_or(0.0))
    .bind(req.invite_reward_inviter.unwrap_or(0.0))
    .bind(req.invite_reward_invitee.unwrap_or(0.0))
    .bind(req.daily_invite_limit.unwrap_or(10))
    .bind(req.marketing_enabled.unwrap_or(0))
    .bind(req.is_default.unwrap_or(0))
    .bind(req.max_token_count.unwrap_or(10))
    .bind(req.description.unwrap_or_default())
    .fetch_one(&state.db.pool)
    .await?
    .get::<i64, _>("id");

    let level = sqlx::query_as(&state.db.format_query("SELECT * FROM user_levels WHERE id = ?"))
        .bind(id)
        .fetch_one(&state.db.pool)
        .await?;

    Ok(Json(level))
}

pub async fn update_user_level(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(req): Json<UpdateUserLevelRequest>,
) -> AppResult<Json<UserLevel>> {
    if let Some(name) = &req.name {
        sqlx::query(&state.db.format_query("UPDATE user_levels SET name = ? WHERE id = ?")).bind(name).bind(id).execute(&state.db.pool).await?;
    }
    if let Some(group_key) = &req.group_key {
        sqlx::query(&state.db.format_query("UPDATE user_levels SET group_key = ? WHERE id = ?")).bind(group_key).bind(id).execute(&state.db.pool).await?;
    }
    if let Some(discount) = req.discount {
        sqlx::query(&state.db.format_query("UPDATE user_levels SET discount = ? WHERE id = ?")).bind(discount).bind(id).execute(&state.db.pool).await?;
    }
    if let Some(description) = &req.description {
        sqlx::query(&state.db.format_query("UPDATE user_levels SET description = ? WHERE id = ?")).bind(description).bind(id).execute(&state.db.pool).await?;
    }
    if let Some(commission_ratio) = req.commission_ratio {
        sqlx::query(&state.db.format_query("UPDATE user_levels SET commission_ratio = ? WHERE id = ?")).bind(commission_ratio).bind(id).execute(&state.db.pool).await?;
    }
    if let Some(invite_reward_inviter) = req.invite_reward_inviter {
        sqlx::query(&state.db.format_query("UPDATE user_levels SET invite_reward_inviter = ? WHERE id = ?")).bind(invite_reward_inviter).bind(id).execute(&state.db.pool).await?;
    }
    if let Some(invite_reward_invitee) = req.invite_reward_invitee {
        sqlx::query(&state.db.format_query("UPDATE user_levels SET invite_reward_invitee = ? WHERE id = ?")).bind(invite_reward_invitee).bind(id).execute(&state.db.pool).await?;
    }
    if let Some(daily_invite_limit) = req.daily_invite_limit {
        sqlx::query(&state.db.format_query("UPDATE user_levels SET daily_invite_limit = ? WHERE id = ?")).bind(daily_invite_limit).bind(id).execute(&state.db.pool).await?;
    }
    if let Some(marketing_enabled) = req.marketing_enabled {
        sqlx::query(&state.db.format_query("UPDATE user_levels SET marketing_enabled = ? WHERE id = ?")).bind(marketing_enabled).bind(id).execute(&state.db.pool).await?;
    }
    if let Some(is_default) = req.is_default {
        if is_default == 1 {
            // 先清除所有默认
            sqlx::query(&state.db.format_query("UPDATE user_levels SET is_default = 0 WHERE is_default = 1")).execute(&state.db.pool).await?;
        }
        sqlx::query(&state.db.format_query("UPDATE user_levels SET is_default = ? WHERE id = ?")).bind(is_default).bind(id).execute(&state.db.pool).await?;
    }
    if let Some(max_token_count) = req.max_token_count {
        sqlx::query(&state.db.format_query("UPDATE user_levels SET max_token_count = ? WHERE id = ?")).bind(max_token_count).bind(id).execute(&state.db.pool).await?;
    }

    sqlx::query(&state.db.format_query("UPDATE user_levels SET updated_at = CURRENT_TIMESTAMP WHERE id = ?")).bind(id).execute(&state.db.pool).await?;

    let level = sqlx::query_as(&state.db.format_query("SELECT * FROM user_levels WHERE id = ?"))
        .bind(id)
        .fetch_one(&state.db.pool)
        .await?;

    Ok(Json(level))
}

pub async fn delete_user_level(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> AppResult<Json<serde_json::Value>> {
    // Prevent deleting the default level
    let group_key: String = sqlx::query_scalar(&state.db.format_query("SELECT group_key FROM user_levels WHERE id = ?"))
        .bind(id)
        .fetch_one(&state.db.pool)
        .await?;

    if group_key == "default" {
        return Err(crate::error::AppError::BadRequest("Cannot delete default user level".to_string()));
    }

    sqlx::query(&state.db.format_query("DELETE FROM user_levels WHERE id = ?"))
        .bind(id)
        .execute(&state.db.pool)
        .await?;

    Ok(Json(serde_json::json!({ "success": true })))
}
