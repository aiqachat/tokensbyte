use axum::{
    extract::{Multipart, State, Query, Path},
    routing::{get, post, put},
    Json, Router,
};
use std::sync::Arc;
use serde_json::json;
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
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
        .route("/admin/delete/{id}", post(delete_asset))
        .route("/admin/reorder", post(reorder_assets))
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
    let mut target_asset_id = String::new();
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
        } else if name == "target_asset_id" {
            target_asset_id = field.text().await.unwrap_or_default();
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
                
            let file_id = if !target_asset_id.trim().is_empty() {
                target_asset_id.clone()
            } else {
                uuid::Uuid::new_v4().to_string()
            };
            let safe_filename = format!("{}.{}", file_id, ext);
            
            // 管理员上传：path_prefix/000000/文件名
            // 普通用户上传：path_prefix/用户UID/文件名，按 UID 隔离存储
            let folder_name = if user.role == "admin" {
                "000000".to_string()
            } else {
                user.uid.clone()
            };
            let object_key = tos_config.full_key(&format!("{}/{}", folder_name, safe_filename));

            // 普通用户上传前检查存储配额
            if user.role != "admin" {
                let used_bytes: Option<i64> = sqlx::query_scalar(
                    &state.db.format_query("SELECT COALESCE(SUM(size), 0) FROM plugin_assets WHERE user_id = ? AND source = 'user'")
                )
                .bind(&user.id)
                .fetch_one(&state.db.pool)
                .await?;

                // 从 plugin_configs 获取该用户等级的配额（单位 MB，默认 100）
                let quota_key = format!("quota_{}", user.user_group);
                let quota_mb: i64 = sqlx::query_scalar::<sqlx::Any, Option<String>>(
                    &state.db.format_query("SELECT config_value FROM plugin_configs WHERE plugin_name = 'asset_manager' AND config_key = ?")
                )
                .bind(&quota_key)
                .fetch_optional(&state.db.pool)
                .await?
                .flatten()
                .and_then(|v| v.parse::<i64>().ok())
                .unwrap_or(100);

                let quota_bytes = quota_mb * 1024 * 1024;
                let current_used = used_bytes.unwrap_or(0);
                if current_used + size > quota_bytes {
                    let used_mb = current_used as f64 / 1024.0 / 1024.0;
                    return Err(AppError::BadRequest(format!(
                        "存储空间不足，当前已使用 {:.1}MB / {}MB 上限",
                        used_mb, quota_mb
                    )));
                }
            }

            let final_user_id = if user.role == "admin" {
                target_user_id.clone()
            } else {
                user.id.clone()
            };

            let encoded_category = URL_SAFE_NO_PAD.encode(&category);
            let tags_str = format!("userid={}&assetid={}&category={}", 
                urlencoding::encode(&final_user_id), 
                urlencoding::encode(&file_id),
                urlencoding::encode(&encoded_category)
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

    let final_asset_id = if !target_asset_id.trim().is_empty() {
        target_asset_id.clone()
    } else {
        "000000".to_string()
    };

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
    .bind(&final_asset_id)
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
    sql.push_str(" ORDER BY sort_order ASC, id DESC");

    let assets: Vec<PluginAsset> = sqlx::query_as(&state.db.format_query(&sql))
        .fetch_all(&state.db.pool)
        .await?;

    // 管理员（source=builtin）的存储使用量
    let admin_used: Option<i64> = sqlx::query_scalar(
        &state.db.format_query("SELECT COALESCE(SUM(size), 0) FROM plugin_assets WHERE source = 'builtin'")
    )
    .fetch_one(&state.db.pool)
    .await?;

    Ok(Json(json!({
        "assets": assets,
        "admin_storage": {
            "used_bytes": admin_used.unwrap_or(0),
            "used_mb": format!("{:.1}", admin_used.unwrap_or(0) as f64 / 1024.0 / 1024.0),
            "folder": "000000",
        }
    })))
}

async fn delete_asset(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    axum::extract::Extension(claims): axum::extract::Extension<crate::auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {

    let user: crate::models::User = sqlx::query_as(&state.db.format_query("SELECT u.*, ul.name as level_name FROM users u LEFT JOIN user_levels ul ON u.user_group = ul.group_key WHERE u.id = ?"))
        .bind(&claims.sub)
        .fetch_optional(&state.db.pool)
        .await?
        .ok_or_else(|| crate::error::AppError::Unauthorized)?;
    if user.role != "admin" {
        return Err(AppError::Unauthorized);
    }

    // 先查出素材记录
    let asset: PluginAsset = sqlx::query_as(&state.db.format_query("SELECT * FROM plugin_assets WHERE id = ?"))
        .bind(id)
        .fetch_optional(&state.db.pool)
        .await?
        .ok_or_else(|| AppError::BadRequest("素材不存在".to_string()))?;

    // 尝试从 TOS 删除文件
    let mut tos_deleted = false;
    if let Some(tos_config) = crate::api::plugins::get_tos_config(&state, "asset_manager").await {
        // 从 file_url 解析出 object_key
        let object_key = {
            let filename = asset.file_url.split('/').last().unwrap_or("");
            tos_config.full_key(filename)
        };

        match crate::services::tos::delete_file(&tos_config, &object_key).await {
            Ok(()) => {
                tracing::info!("TOS 文件已删除: {}", object_key);
                tos_deleted = true;
            }
            Err(e) => {
                tracing::warn!("TOS 文件删除失败(可能无写权限): {} - {}", object_key, e);
            }
        }
    }

    // 删除数据库记录
    sqlx::query(&state.db.format_query("DELETE FROM plugin_assets WHERE id = ?"))
        .bind(id)
        .execute(&state.db.pool)
        .await?;

    let msg = if tos_deleted {
        "素材已删除（数据库 + TOS 文件）"
    } else {
        "素材数据库记录已删除（TOS 文件删除失败或未配置，请手动处理）"
    };

    Ok(Json(json!({ "message": msg, "tos_deleted": tos_deleted })))
}

#[derive(Deserialize)]
pub struct ReorderRequest {
    pub ids: Vec<i64>,
}

async fn reorder_assets(
    State(state): State<Arc<AppState>>,
    axum::extract::Extension(claims): axum::extract::Extension<crate::auth::Claims>,
    Json(payload): Json<ReorderRequest>,
) -> AppResult<Json<serde_json::Value>> {

    let user: crate::models::User = sqlx::query_as(&state.db.format_query("SELECT u.*, ul.name as level_name FROM users u LEFT JOIN user_levels ul ON u.user_group = ul.group_key WHERE u.id = ?"))
        .bind(&claims.sub)
        .fetch_optional(&state.db.pool)
        .await?
        .ok_or_else(|| crate::error::AppError::Unauthorized)?;
    if user.role != "admin" {
        return Err(AppError::Unauthorized);
    }

    for (index, id) in payload.ids.iter().enumerate() {
        sqlx::query(&state.db.format_query("UPDATE plugin_assets SET sort_order = ? WHERE id = ?"))
            .bind(index as i64)
            .bind(id)
            .execute(&state.db.pool)
            .await?;
    }

    Ok(Json(json!({ "message": "排序已更新" })))
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
        // User sees their own assets + approved builtin assets that are owned by admins
    let assets: Vec<PluginAsset> = sqlx::query_as(&state.db.format_query(
        "SELECT a.* FROM plugin_assets a 
         JOIN users u ON a.user_id = u.id
         WHERE a.user_id = ? OR (a.source = 'builtin' AND a.status = 'approved' AND u.role = 'admin') 
         ORDER BY a.id DESC"
    ))
        .bind(&user.id)
        .fetch_all(&state.db.pool)
        .await?;

    // 计算用户已用空间（仅计算用户自己上传的）
    let used_bytes: Option<i64> = sqlx::query_scalar(
        &state.db.format_query("SELECT COALESCE(SUM(size), 0) FROM plugin_assets WHERE user_id = ? AND source = 'user'")
    )
    .bind(&user.id)
    .fetch_one(&state.db.pool)
    .await?;

    // 获取配额
    let quota_key = format!("quota_{}", user.user_group);
    let quota_mb: i64 = sqlx::query_scalar::<sqlx::Any, Option<String>>(
        &state.db.format_query("SELECT config_value FROM plugin_configs WHERE plugin_name = 'asset_manager' AND config_key = ?")
    )
    .bind(&quota_key)
    .fetch_optional(&state.db.pool)
    .await?
    .flatten()
    .and_then(|v| v.parse::<i64>().ok())
    .unwrap_or(100);

    let used = used_bytes.unwrap_or(0);

    Ok(Json(json!({
        "assets": assets,
        "storage": {
            "used_bytes": used,
            "quota_mb": quota_mb,
            "quota_bytes": quota_mb * 1024 * 1024,
            "used_mb": format!("{:.1}", used as f64 / 1024.0 / 1024.0),
        }
    })))
}

#[derive(Deserialize)]
pub struct UpdateTagsRequest {
    pub category: String,
    pub userid: String,
    pub assetid: Option<String>,
    pub file_name: Option<String>,
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

    // Avoid using TOS SDK `get_object_tagging` since it panics if tags are missing in the XML response.
    // The DB contains the strictly synchronized truth.
    let mut tags = std::collections::HashMap::new();
    tags.insert("category".to_string(), asset.category.clone().unwrap_or_else(|| "未分类".to_string()));
    tags.insert("userid".to_string(), asset.user_id.clone());
    
    if let Some(aid) = &asset.asset_id {
        tags.insert("assetid".to_string(), aid.clone());
    }

    Ok(Json(json!({ "tags": tags })))
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

    let final_user_id = if user.role == "admin" && !payload.userid.trim().is_empty() {
        payload.userid.clone()
    } else {
        user.id.clone()
    };
    
    let mut tags = std::collections::HashMap::new();
    tags.insert("category".to_string(), URL_SAFE_NO_PAD.encode(&payload.category));
    tags.insert("userid".to_string(), final_user_id.clone());
    
    let payload_assetid = payload.assetid.clone().unwrap_or_default();
    let current_asset_id = if !payload_assetid.trim().is_empty() {
        payload_assetid
    } else {
        asset.asset_id.unwrap_or_else(|| {
            asset.file_url.split('/').last().unwrap_or("").split('.').next().unwrap_or("").to_string()
        })
    };
    tags.insert("assetid".to_string(), current_asset_id.clone());

    crate::services::tos::update_object_tags(&tos_config, &object_key_str, tags).await
        .map_err(|e| AppError::Internal(format!("更新TOS标签失败: {}", e)))?;

    // Also update Database
    let new_file_name = payload.file_name.unwrap_or(asset.file_name.clone());
    sqlx::query(&state.db.format_query("UPDATE plugin_assets SET category = ?, user_id = ?, asset_id = ?, file_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"))
        .bind(&payload.category)
        .bind(&final_user_id)
        .bind(&current_asset_id)
        .bind(&new_file_name)
        .bind(id)
        .execute(&state.db.pool)
        .await?;

    Ok(Json(json!({ "message": "标签和文件名已更新" })))
}
