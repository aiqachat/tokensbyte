use axum::{
    extract::{Multipart, State, Query, Path},
    routing::{get, post},
    Json, Router,
};
use std::sync::Arc;
use std::path::PathBuf;
use tokio::fs;
use serde_json::json;
use crate::{
    error::{AppResult, AppError},
    models::{PluginAsset, User, AssetAuditRequest},
    AppState,
};
use serde::Deserialize;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/upload", post(upload_asset))
        .route("/admin/list", get(admin_list_assets))
        .route("/admin/audit/{id}", post(audit_asset))
        .route("/user/list", get(user_list_assets))
}

#[derive(Deserialize)]
pub struct AssetQuery {
    pub status: Option<String>,
    pub source: Option<String>,
}

async fn upload_asset(
    State(state): State<Arc<AppState>>,
    axum::extract::Extension(claims): axum::extract::Extension<crate::auth::Claims>,
    mut multipart: Multipart,
) -> AppResult<Json<serde_json::Value>> {

    let user: crate::models::User = sqlx::query_as(&state.db.format_query("SELECT u.*, ul.name as level_name FROM users u LEFT JOIN user_levels ul ON u.user_group = ul.group_key WHERE u.id = ?"))
        .bind(&claims.sub)
        .fetch_optional(&state.db.pool)
        .await?
        .ok_or_else(|| crate::error::AppError::Unauthorized)?;
        let mut file_url = String::new();
    let mut original_name = String::new();
    let mut asset_type = String::new();
    let mut mime_type = String::new();
    let mut size: i64 = 0;
    
    // Source depends on user role (builtin vs user)
    let source = if user.role == "admin" { "builtin" } else { "user" };
    // Status builtin is automatically approved
    let status = if source == "builtin" { "approved" } else { "pending" };

    let upload_dir = PathBuf::from("data/assets");
    if !upload_dir.exists() {
        fs::create_dir_all(&upload_dir).await.map_err(|e| {
            tracing::error!("Failed to create upload dir: {}", e);
            AppError::Internal("Failed to create directory".to_string())
        })?;
    }

    while let Some(field) = multipart.next_field().await.unwrap_or(None) {
        let name = field.name().unwrap_or("").to_string();
        
        if name == "file" {
            original_name = field.file_name().unwrap_or("unknown").to_string();
            let c_type = field.content_type().unwrap_or("").to_string();
            mime_type = c_type.clone();
            
            if mime_type.starts_with("image/") {
                asset_type = "image".to_string();
            } else if mime_type.starts_with("video/") {
                asset_type = "video".to_string();
            } else {
                return Err(AppError::BadRequest("Unsupported file type".to_string()));
            }

            let data = field.bytes().await.map_err(|_| AppError::BadRequest("Failed to read file".to_string()))?;
            size = data.len() as i64;
            
            // Limit size: Image 10MB, Video 50MB
            if asset_type == "image" && size > 10 * 1024 * 1024 {
                return Err(AppError::BadRequest("Image exceeds 10MB limit".to_string()));
            }
            if asset_type == "video" && size > 50 * 1024 * 1024 {
                return Err(AppError::BadRequest("Video exceeds 50MB limit".to_string()));
            }

            let ext = std::path::Path::new(&original_name)
                .extension()
                .and_then(std::ffi::OsStr::to_str)
                .unwrap_or("bin");
                
            let file_id = uuid::Uuid::new_v4().to_string();
            let safe_filename = format!("{}.{}", file_id, ext);
            let filepath = upload_dir.join(&safe_filename);
            
            fs::write(&filepath, data).await.map_err(|_| {
                AppError::Internal("Failed to save file".to_string())
            })?;
            
            file_url = format!("/assets/{}", safe_filename);
        }
    }

    if file_url.is_empty() {
        return Err(AppError::BadRequest("No file provided".to_string()));
    }

    let asset: PluginAsset = sqlx::query_as(&state.db.format_query(r#"
        INSERT INTO plugin_assets (user_id, asset_type, source, status, file_name, file_url, mime_type, size)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING *
        "#))
    .bind(&user.id)
    .bind(&asset_type)
    .bind(&source)
    .bind(&status)
    .bind(&original_name)
    .bind(&file_url)
    .bind(&mime_type)
    .bind(size)
    .fetch_one(&state.db.pool)
    .await?;

    Ok(Json(json!({ "asset": asset })))
}

async fn admin_list_assets(
    State(state): State<Arc<AppState>>,
    axum::extract::Extension(claims): axum::extract::Extension<crate::auth::Claims>,
    Query(query): Query<AssetQuery>,
) -> AppResult<Json<serde_json::Value>> {

    let user: crate::models::User = sqlx::query_as(&state.db.format_query("SELECT u.*, ul.name as level_name FROM users u LEFT JOIN user_levels ul ON u.user_group = ul.group_key WHERE u.id = ?"))
        .bind(&claims.sub)
        .fetch_optional(&state.db.pool)
        .await?
        .ok_or_else(|| crate::error::AppError::Unauthorized)?;
        if user.role != "admin" {
        return Err(AppError::Unauthorized);
    }
    
    let mut sql = "SELECT * FROM plugin_assets WHERE 1=1".to_string();
    if let Some(s) = query.status {
        sql.push_str(&format!(" AND status = '{}'", s.replace("'", "''")));
    }
    if let Some(s) = query.source {
        sql.push_str(&format!(" AND source = '{}'", s.replace("'", "''")));
    }
    sql.push_str(" ORDER BY id DESC");

    let assets: Vec<PluginAsset> = sqlx::query_as(&state.db.format_query(&sql))
        .fetch_all(&state.db.pool)
        .await?;
        
    Ok(Json(json!({ "assets": assets })))
}

async fn audit_asset(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    axum::extract::Extension(claims): axum::extract::Extension<crate::auth::Claims>,
    Json(payload): Json<AssetAuditRequest>,
) -> AppResult<Json<serde_json::Value>> {

    let user: crate::models::User = sqlx::query_as(&state.db.format_query("SELECT u.*, ul.name as level_name FROM users u LEFT JOIN user_levels ul ON u.user_group = ul.group_key WHERE u.id = ?"))
        .bind(&claims.sub)
        .fetch_optional(&state.db.pool)
        .await?
        .ok_or_else(|| crate::error::AppError::Unauthorized)?;
        if user.role != "admin" {
        return Err(AppError::Unauthorized);
    }
    
    let _ = sqlx::query(&state.db.format_query("UPDATE plugin_assets SET status = ?, reject_reason = ? WHERE id = ?"))
        .bind(&payload.status)
        .bind(payload.reject_reason)
        .bind(id)
        .execute(&state.db.pool)
        .await?;
        
    Ok(Json(json!({ "message": "Asset audited successfully" })))
}

async fn user_list_assets(
    State(state): State<Arc<AppState>>,
    axum::extract::Extension(claims): axum::extract::Extension<crate::auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {

    let user: crate::models::User = sqlx::query_as(&state.db.format_query("SELECT u.*, ul.name as level_name FROM users u LEFT JOIN user_levels ul ON u.user_group = ul.group_key WHERE u.id = ?"))
        .bind(&claims.sub)
        .fetch_optional(&state.db.pool)
        .await?
        .ok_or_else(|| crate::error::AppError::Unauthorized)?;
        // User sees their own assets + approved builtin assets
    let assets: Vec<PluginAsset> = sqlx::query_as(&state.db.format_query("SELECT * FROM plugin_assets WHERE user_id = ? OR (source = 'builtin' AND status = 'approved') ORDER BY id DESC"))
        .bind(&user.id)
        .fetch_all(&state.db.pool)
        .await?;
        
    Ok(Json(json!({ "assets": assets })))
}
