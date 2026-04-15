use axum::{
    extract::{Multipart, State, Query, Path},
    routing::{get, post},
    Json, Router,
};
use std::sync::Arc;
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
        .route("/admin/{id}/tags", get(get_asset_tags).put(update_asset_tags))
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

    // 检查 TOS 配置是否存在
    let tos_config = crate::api::plugins::get_tos_config(&state, "asset_manager").await;
    if tos_config.is_none() {
        return Err(AppError::BadRequest("素材上传功能需要先配置对象存储，请管理员在「站点插件 → 素材资产管理 → 存储配置」中完成配置".to_string()));
    }
    let tos_config = tos_config.unwrap();

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

    let mut category = String::from("未分类");
    let mut target_user_id = String::new();
    let mut file_data: Option<axum::body::Bytes> = None;

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

            file_data = Some(field.bytes().await.map_err(|_| AppError::BadRequest("Failed to read file".to_string()))?);
        } else if name == "category" {
            category = field.text().await.unwrap_or_else(|_| "未分类".to_string());
        } else if name == "target_user_id" {
            target_user_id = field.text().await.unwrap_or_default();
        }
    }

    if let Some(data) = file_data {
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
            let object_key = tos_config.full_key(&safe_filename);

            let final_user_id = if user.role == "admin" && !target_user_id.trim().is_empty() {
                target_user_id.clone()
            } else {
                user.id.clone()
            };

            let tags_str = format!("userid={}&assetid={}&category={}", 
                urlencoding::encode(&final_user_id), 
                urlencoding::encode(&file_id),
                urlencoding::encode(&category)
            );

            // 上传到 TOS
            file_url = crate::services::tos::upload_file(
                &tos_config,
                &object_key,
                data.to_vec(),
                &mime_type,
                Some(&tags_str),
            ).await.map_err(|e| {
                tracing::error!("TOS upload failed: {}", e);
                AppError::Internal(format!("文件上传失败: {}", e))
            })?;
        }

    if file_url.is_empty() {
        return Err(AppError::BadRequest("No file provided".to_string()));
    }

    let final_user_id = if user.role == "admin" && !target_user_id.trim().is_empty() {
        target_user_id.clone()
    } else {
        user.id.clone()
    };

    let asset_id_uuid = file_url.split('/').last().unwrap_or("").split('.').next().unwrap_or("").to_string();

    let asset: PluginAsset = sqlx::query_as(&state.db.format_query(r#"
        INSERT INTO plugin_assets (user_id, asset_type, source, status, file_name, file_url, mime_type, size, category, asset_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING *
        "#))
    .bind(&final_user_id)
    .bind(&asset_type)
    .bind(&source)
    .bind(&status)
    .bind(&original_name)
    .bind(&file_url)
    .bind(&mime_type)
    .bind(size)
    .bind(&category)
    .bind(&asset_id_uuid)
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

#[derive(Deserialize)]
pub struct UpdateTagsRequest {
    pub category: String,
    pub userid: String,
}

async fn get_asset_tags(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    axum::extract::Extension(claims): axum::extract::Extension<crate::auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    let user: crate::models::User = sqlx::query_as(&state.db.format_query("SELECT * FROM users WHERE id = ?"))
        .bind(&claims.sub)
        .fetch_optional(&state.db.pool)
        .await?
        .ok_or_else(|| crate::error::AppError::Unauthorized)?;
    if user.role != "admin" {
        return Err(AppError::Unauthorized);
    }

    let asset: PluginAsset = sqlx::query_as(&state.db.format_query("SELECT * FROM plugin_assets WHERE id = ?"))
        .bind(id)
        .fetch_optional(&state.db.pool)
        .await?
        .ok_or_else(|| AppError::BadRequest("Asset not found".to_string()))?;

    let tos_config = crate::api::plugins::get_tos_config(&state, "asset_manager").await
        .ok_or_else(|| AppError::BadRequest("TOS未配置".to_string()))?;

    // Extract object_key from file_url
    let mut parts = asset.file_url.split('/');
    let object_key = parts.last().unwrap_or(asset.file_name.as_str());
    // Safe fallback to full_key in case file_url includes prefix
    let object_key_str = tos_config.full_key(object_key);

    match crate::services::tos::get_object_tags(&tos_config, &object_key_str).await {
        Ok(tags) => Ok(Json(json!({ "tags": tags }))),
        Err(e) => {
            tracing::error!("Failed to get object tags: {}", e);
            Ok(Json(json!({ "tags": {} })))
        }
    }
}

async fn update_asset_tags(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    axum::extract::Extension(claims): axum::extract::Extension<crate::auth::Claims>,
    Json(payload): Json<UpdateTagsRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let user: crate::models::User = sqlx::query_as(&state.db.format_query("SELECT * FROM users WHERE id = ?"))
        .bind(&claims.sub)
        .fetch_optional(&state.db.pool)
        .await?
        .ok_or_else(|| crate::error::AppError::Unauthorized)?;
    if user.role != "admin" {
        return Err(AppError::Unauthorized);
    }

    let asset: PluginAsset = sqlx::query_as(&state.db.format_query("SELECT * FROM plugin_assets WHERE id = ?"))
        .bind(id)
        .fetch_optional(&state.db.pool)
        .await?
        .ok_or_else(|| AppError::BadRequest("Asset not found".to_string()))?;

    let tos_config = crate::api::plugins::get_tos_config(&state, "asset_manager").await
        .ok_or_else(|| AppError::BadRequest("TOS未配置".to_string()))?;

    let mut parts = asset.file_url.split('/');
    let object_key = parts.last().unwrap_or(asset.file_name.as_str());
    let object_key_str = tos_config.full_key(object_key);

    let mut tags = std::collections::HashMap::new();
    tags.insert("userid".to_string(), payload.userid.clone());
    let current_asset_id = asset.asset_id.unwrap_or_else(|| {
        asset.file_url.split('/').last().unwrap_or("").split('.').next().unwrap_or("").to_string()
    });
    tags.insert("assetid".to_string(), current_asset_id.clone());
    tags.insert("category".to_string(), payload.category.clone());

    crate::services::tos::update_object_tags(&tos_config, &object_key_str, tags).await
        .map_err(|e| AppError::Internal(format!("更新TOS标签失败: {}", e)))?;

    // Also update Database
    sqlx::query(&state.db.format_query("UPDATE plugin_assets SET category = ?, user_id = ?, asset_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"))
        .bind(&payload.category)
        .bind(&payload.userid)
        .bind(&current_asset_id)
        .bind(id)
        .execute(&state.db.pool)
        .await?;

    Ok(Json(json!({ "message": "标签已更新" })))
}
