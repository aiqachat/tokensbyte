use axum::{
    extract::{State, Path},
    Json,
};
use std::sync::Arc;
use serde_json::json;

use crate::{
    AppState,
    models::{Announcement, CreateAnnouncementReq, UpdateAnnouncementReq},
    error::AppError,
};

pub async fn list_admin_announcements(
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, AppError> {
    let announcements: Vec<Announcement> = sqlx::query_as(
        &state.db.format_query("SELECT * FROM announcements ORDER BY id DESC")
    )
    .fetch_all(&state.db.pool)
    .await?;

    Ok(Json(json!({
        "success": true,
        "data": announcements
    })))
}

pub async fn get_public_announcements(
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, AppError> {
    let announcements: Vec<Announcement> = sqlx::query_as(
        &state.db.format_query("SELECT * FROM announcements WHERE is_active = 1 ORDER BY is_pinned DESC, id DESC LIMIT 10")
    )
    .fetch_all(&state.db.pool)
    .await?;

    Ok(Json(json!({
        "success": true,
        "data": announcements
    })))
}

pub async fn create_announcement(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<CreateAnnouncementReq>,
) -> Result<Json<serde_json::Value>, AppError> {
    let now = chrono::Local::now().to_rfc3339();
    
    let announcement: Announcement = sqlx::query_as(
        &state.db.format_query(
            "INSERT INTO announcements (title, content, is_pinned, is_active, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?) RETURNING *"
        )
    )
    .bind(&payload.title)
    .bind(&payload.content)
    .bind(payload.is_pinned)
    .bind(payload.is_active)
    .bind(&now)
    .bind(&now)
    .fetch_one(&state.db.pool)
    .await?;

    Ok(Json(json!({
        "success": true,
        "message": "公告创建成功",
        "data": announcement
    })))
}

pub async fn update_announcement(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
    Json(payload): Json<UpdateAnnouncementReq>,
) -> Result<Json<serde_json::Value>, AppError> {
    let current: Announcement = sqlx::query_as(
        &state.db.format_query("SELECT * FROM announcements WHERE id = ?")
    )
    .bind(id)
    .fetch_optional(&state.db.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("公告不存在".to_string()))?;

    let title = payload.title.unwrap_or(current.title);
    let content = payload.content.unwrap_or(current.content);
    let is_pinned = payload.is_pinned.unwrap_or(current.is_pinned);
    let is_active = payload.is_active.unwrap_or(current.is_active);
    let now = chrono::Local::now().to_rfc3339();

    let updated: Announcement = sqlx::query_as(
        &state.db.format_query(
            "UPDATE announcements SET title = ?, content = ?, is_pinned = ?, is_active = ?, updated_at = ? WHERE id = ? RETURNING *"
        )
    )
    .bind(&title)
    .bind(&content)
    .bind(is_pinned)
    .bind(is_active)
    .bind(&now)
    .bind(id)
    .fetch_one(&state.db.pool)
    .await?;

    Ok(Json(json!({
        "success": true,
        "message": "公告更新成功",
        "data": updated
    })))
}

pub async fn delete_announcement(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
) -> Result<Json<serde_json::Value>, AppError> {
    sqlx::query(&state.db.format_query("DELETE FROM announcements WHERE id = ?"))
        .bind(id)
        .execute(&state.db.pool)
        .await?;

    Ok(Json(json!({
        "success": true,
        "message": "公告删除成功"
    })))
}
