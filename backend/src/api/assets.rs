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
    models::{PluginAsset, AssetAuditRequest},
    AppState,
};
use serde::Deserialize;

use axum::extract::DefaultBodyLimit;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/upload", post(upload_asset))
        .route("/admin/list", get(admin_list_assets))
        .route("/admin/audit/{id}", post(audit_asset))
        .route("/admin/{id}/tags", get(get_asset_tags).put(update_asset_tags))
        .route("/admin/delete/{id}", post(delete_asset))
        .route("/admin/reorder", post(reorder_assets))
        .route("/user/list", get(user_list_assets))
        .route("/user/storage-info", get(user_storage_info))
        .route("/user/preset-categories", get(user_preset_categories))
        .route("/user/{id}/edit", put(user_edit_asset))
        .route("/user/init-real-person-verify", post(init_real_person_verify))
        .route("/user/complete-real-person-verify", post(complete_real_person_verify))
        .route("/user/upload-virtual-portrait", post(upload_virtual_portrait))
        .route("/user/submit-review/{id}", post(submit_virtual_portrait_review))
        .route("/user/asset-status/{id}", get(check_asset_status))
        .route("/user/groups", get(user_list_groups).post(user_create_group))
        .layer(DefaultBodyLimit::disable())
}

#[derive(Deserialize)]
pub struct AssetQuery {
    pub status: Option<String>,
    pub source: Option<String>,
    pub category: Option<String>,
}

#[derive(Deserialize)]
pub struct UserAssetQuery {
    pub source: Option<String>,
    pub category: Option<String>,
    pub asset_type: Option<String>,
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
    let mut remark = String::new();
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
        } else if name == "remark" {
            remark = field.text().await.unwrap_or_default();
        }
    }

    if let Some(data) = file_data {
            size = data.len() as i64;
            
            // Limit size: Image 10MB, Video 50MB
            if asset_type == "image" && size > 10 * 1024 * 1024 {
                return Err(AppError::BadRequest("图片文件过大，不能超过 10MB！".to_string()));
            }
            if asset_type == "video" && size > 50 * 1024 * 1024 {
                return Err(AppError::BadRequest("视频文件过大，不能超过 50MB！".to_string()));
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
        INSERT INTO plugin_assets (user_id, asset_type, source, status, file_name, file_url, mime_type, size, category, asset_id, remark)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    .bind(&remark)
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
    if let Some(ref cat) = query.category {
        let escaped_cat = cat.replace("'", "''");
        sql.push_str(&format!(" AND (category = '{escaped_cat}' OR category LIKE '{escaped_cat}/%')"));
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

    let admin_count: i64 = sqlx::query_scalar(
        &state.db.format_query("SELECT COUNT(*) FROM plugin_assets WHERE source = 'builtin'")
    )
    .fetch_one(&state.db.pool)
    .await
    .unwrap_or(0);

    // 构建 user_id -> uid/username 映射
    let user_ids: Vec<String> = assets.iter().map(|a| a.user_id.clone()).collect::<std::collections::HashSet<_>>().into_iter().collect();
    let mut uid_map = serde_json::Map::new();
    for uid_chunk in user_ids.chunks(50) {
        let placeholders = uid_chunk.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = state.db.format_query(&format!("SELECT id, uid, username FROM users WHERE id IN ({})", placeholders));
        let mut q = sqlx::query_as::<_, (String, String, String)>(&sql);
        for id in uid_chunk {
            q = q.bind(id);
        }
        if let Ok(rows) = q.fetch_all(&state.db.pool).await {
            for (id, uid, username) in rows {
                uid_map.insert(id, json!({"uid": uid, "username": username}));
            }
        }
    }

    Ok(Json(json!({
        "assets": assets,
        "admin_storage": {
            "used_bytes": admin_used.unwrap_or(0),
            "used_mb": format!("{:.1}", admin_used.unwrap_or(0) as f64 / 1024.0 / 1024.0),
            "folder": "000000",
            "file_count": admin_count,
        },
        "uid_map": serde_json::Value::Object(uid_map)
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
        let owner_info: Option<(String, String)> = sqlx::query_as(&state.db.format_query("SELECT uid, role FROM users WHERE id = ?"))
            .bind(&asset.user_id)
            .fetch_optional(&state.db.pool)
            .await
            .unwrap_or(None);
        let (owner_uid, owner_role) = owner_info.unwrap_or_else(|| ("000000".to_string(), "admin".to_string()));
        let folder_name = if owner_role == "admin" { "000000".to_string() } else { owner_uid };

        // 从 file_url 解析出 object_key，必须带上目标文件夹
        let object_key = {
            let filename = asset.file_url.split('/').last().unwrap_or("");
            tos_config.full_key(&format!("{}/{}", folder_name, filename))
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
    Query(query): Query<UserAssetQuery>,
) -> AppResult<Json<serde_json::Value>> {

    let user: crate::models::User = sqlx::query_as(&state.db.format_query("SELECT u.*, ul.name as level_name FROM users u LEFT JOIN user_levels ul ON u.user_group = ul.group_key WHERE u.id = ?"))
        .bind(&claims.sub)
        .fetch_optional(&state.db.pool)
        .await?
        .ok_or_else(|| crate::error::AppError::Unauthorized)?;

    // Build dynamic SQL based on query filters
    let source_filter = query.source.as_deref().unwrap_or("");
    
    let base_sql = if source_filter == "builtin" {
        // 预设素材：只看 builtin + approved（由管理员上传）
        "SELECT a.* FROM plugin_assets a JOIN users u ON a.user_id = u.id WHERE a.source = 'builtin' AND a.status = 'approved' AND u.role = 'admin'".to_string()
    } else if source_filter == "user" {
        // 我的素材：只看用户自己上传的
        format!("SELECT a.* FROM plugin_assets a WHERE a.user_id = '{}' AND a.source = 'user'", claims.sub.replace("'", "''"))
    } else {
        // 默认：用户自己的 + 已审核的预设素材
        format!("SELECT a.* FROM plugin_assets a JOIN users u ON a.user_id = u.id WHERE a.user_id = '{}' OR (a.source = 'builtin' AND a.status = 'approved' AND u.role = 'admin')", claims.sub.replace("'", "''"))
    };

    let mut sql = base_sql;

    // 分类过滤
    if let Some(ref cat) = query.category {
        if cat == "__other__" {
            // 其他素材：非图片、非视频类型，且分类不是"我的人像"
            sql.push_str(" AND a.asset_type NOT IN ('image', 'video') AND (a.category IS NULL OR a.category != '我的人像')");
        } else {
            sql.push_str(&format!(" AND (a.category = '{cat}' OR a.category LIKE '{cat}/%')", cat = cat.replace("'", "''")));
        }
    } else {
        // 如果没有指定 category，默认排除 "我的人像"（因为它现在是独立的一级菜单）
        sql.push_str(" AND (a.category IS NULL OR a.category != '我的人像')");
    }

    // 素材类型过滤
    if let Some(ref at) = query.asset_type {
        sql.push_str(&format!(" AND a.asset_type = '{}'", at.replace("'", "''")));
    }

    sql.push_str(" ORDER BY a.sort_order ASC, a.id DESC");

    let assets: Vec<PluginAsset> = sqlx::query_as(&state.db.format_query(&sql))
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

/// 获取预设素材的分类列表（去重），供用户端分类导航使用
async fn user_preset_categories(
    State(state): State<Arc<AppState>>,
    axum::extract::Extension(claims): axum::extract::Extension<crate::auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    // 验证用户身份
    let _user: crate::models::User = sqlx::query_as(&state.db.format_query("SELECT u.*, ul.name as level_name FROM users u LEFT JOIN user_levels ul ON u.user_group = ul.group_key WHERE u.id = ?"))
        .bind(&claims.sub)
        .fetch_optional(&state.db.pool)
        .await?
        .ok_or_else(|| crate::error::AppError::Unauthorized)?;

    // 获取所有已审核的预设素材的去重分类
    let categories: Vec<String> = sqlx::query_scalar(
        &state.db.format_query(
            "SELECT DISTINCT category FROM plugin_assets WHERE source = 'builtin' AND status = 'approved' AND category IS NOT NULL AND category != '' ORDER BY category"
        )
    )
    .fetch_all(&state.db.pool)
    .await?;

    Ok(Json(json!({
        "categories": categories
    })))
}

/// 用户存储信息：从 TOS 实际读取文件夹内容，返回文件列表和空间使用量
async fn user_storage_info(
    State(state): State<Arc<AppState>>,
    axum::extract::Extension(claims): axum::extract::Extension<crate::auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    let user: crate::models::User = sqlx::query_as(&state.db.format_query(
        "SELECT u.*, ul.name as level_name FROM users u LEFT JOIN user_levels ul ON u.user_group = ul.group_key WHERE u.id = ?"
    ))
    .bind(&claims.sub)
    .fetch_optional(&state.db.pool)
    .await?
    .ok_or_else(|| crate::error::AppError::Unauthorized)?;

    let tos_config = crate::api::plugins::get_tos_config(&state, "asset_manager").await;
    if tos_config.is_none() {
        return Ok(Json(json!({
            "folder": "",
            "files": [],
            "total_size": 0,
            "total_size_mb": "0.0",
            "quota_mb": 100,
            "is_admin": user.role == "admin",
            "error": "TOS 存储未配置"
        })));
    }
    let tos_config = tos_config.unwrap();

    // 管理员文件夹 = 000000，普通用户文件夹 = uid
    let folder_name = if user.role == "admin" {
        "000000".to_string()
    } else {
        user.uid.clone()
    };

    // 从 TOS 实际列出文件夹内容
    let (tos_files, total_size) = crate::services::tos::list_folder(&tos_config, &folder_name)
        .await
        .unwrap_or_else(|e| {
            tracing::warn!("TOS list_folder 失败: {}", e);
            (vec![], 0)
        });

    // 获取配额（管理员无限制，普通用户按等级）
    let quota_mb: i64 = if user.role == "admin" {
        0 // 0 表示无限制
    } else {
        let quota_key = format!("quota_{}", user.user_group);
        sqlx::query_scalar::<sqlx::Any, Option<String>>(
            &state.db.format_query("SELECT config_value FROM plugin_configs WHERE plugin_name = 'asset_manager' AND config_key = ?")
        )
        .bind(&quota_key)
        .fetch_optional(&state.db.pool)
        .await?
        .flatten()
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(100)
    };

    // 将 TOS 文件列表转为简洁格式
    let files: Vec<serde_json::Value> = tos_files.iter().map(|f| {
        // 提取文件名（去掉前缀路径）
        let filename = f.key.rsplit('/').next().unwrap_or(&f.key).to_string();
        json!({
            "key": f.key,
            "filename": filename,
            "size": f.size,
            "size_display": if f.size < 1024 {
                format!("{} B", f.size)
            } else if f.size < 1024 * 1024 {
                format!("{:.1} KB", f.size as f64 / 1024.0)
            } else {
                format!("{:.2} MB", f.size as f64 / 1024.0 / 1024.0)
            },
            "last_modified": f.last_modified,
        })
    }).collect();

    let used_mb = total_size as f64 / 1024.0 / 1024.0;

    let vp_count: i64 = sqlx::query_scalar(&state.db.format_query(
        "SELECT COUNT(*) FROM plugin_assets WHERE user_id = ? AND category = '虚拟人像'"
    ))
    .bind(&claims.sub)
    .fetch_one(&state.db.pool)
    .await
    .unwrap_or(0);

    Ok(Json(json!({
        "folder": folder_name,
        "files": files,
        "file_count": files.len(),
        "total_size": total_size,
        "total_size_mb": format!("{:.1}", used_mb),
        "quota_mb": quota_mb,
        "remain_mb": if quota_mb > 0 { format!("{:.1}", quota_mb as f64 - used_mb) } else { "无限制".to_string() },
        "is_admin": user.role == "admin",
        "virtual_portrait_count": vp_count,
        "virtual_portrait_quota": 30, // 默认 30 个分组
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

    let owner_info: Option<(String, String)> = sqlx::query_as(&state.db.format_query("SELECT uid, role FROM users WHERE id = ?"))
        .bind(&asset.user_id)
        .fetch_optional(&state.db.pool)
        .await
        .unwrap_or(None);
    let (owner_uid, owner_role) = owner_info.unwrap_or_else(|| ("000000".to_string(), "admin".to_string()));
    let folder_name = if owner_role == "admin" { "000000".to_string() } else { owner_uid };

    let filename = asset.file_url.split('/').last().unwrap_or(asset.file_name.as_str());
    let object_key_str = tos_config.full_key(&format!("{}/{}", folder_name, filename));

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

#[derive(Deserialize)]
pub struct UserEditAssetRequest {
    pub file_name: Option<String>,
    pub category: Option<String>,
}

async fn user_edit_asset(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    axum::extract::Extension(claims): axum::extract::Extension<crate::auth::Claims>,
    Json(payload): Json<UserEditAssetRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let asset: PluginAsset = sqlx::query_as(&state.db.format_query("SELECT * FROM plugin_assets WHERE id = ? AND user_id = ?"))
        .bind(id)
        .bind(&claims.sub)
        .fetch_optional(&state.db.pool)
        .await?
        .ok_or_else(|| AppError::BadRequest("Asset not found or unauthorized".to_string()))?;

    let new_file_name = payload.file_name.unwrap_or(asset.file_name.clone());
    let new_category = payload.category.unwrap_or(asset.category.unwrap_or_default());

    sqlx::query(&state.db.format_query("UPDATE plugin_assets SET file_name = ?, category = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"))
        .bind(&new_file_name)
        .bind(&new_category)
        .bind(id)
        .execute(&state.db.pool)
        .await?;

    Ok(Json(json!({ "message": "Asset updated successfully" })))
}

// ========== 真人人像 & 虚拟人像 (火山引擎) ==========

#[derive(Deserialize)]
pub struct CompleteVerifyRequest {
    pub byted_token: String,
}

/// 用户：发起真人核验 (H5)
async fn init_real_person_verify(
    State(state): State<Arc<AppState>>,
    axum::extract::Extension(claims): axum::extract::Extension<crate::auth::Claims>,
    Json(payload): Json<serde_json::Value>,
) -> AppResult<Json<serde_json::Value>> {
    let volc_config = crate::api::plugins::get_volc_config(&state, "asset_manager").await
        .ok_or_else(|| AppError::BadRequest("实人认证功能未配置，请联系管理员".to_string()))?;

    let callback_url = payload.get("callback_url")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::BadRequest("缺少 callback_url".to_string()))?;

    let client = crate::services::volcengine::VolcClient::new(volc_config.clone())
        .with_logger(state.db.clone(), claims.sub.clone());
    
    let req = crate::services::volcengine::CreateVisualValidateSessionRequest {
        app_id: volc_config.app_id.clone(),
        callback_url: callback_url.to_string(),
        token_valid_time: 3600,
    };

    let res: crate::services::volcengine::CreateVisualValidateSessionResponse = client.call_api(
        "visual", "cn-north-1", "CreateVisualValidateSession", "2022-03-25", req
    ).await.map_err(|e| AppError::Internal(format!("发起认证失败: {}", e)))?;

    if let Some(result) = res.result {
        Ok(Json(json!({
            "h5_link": result.h5_link,
            "byted_token": result.byted_token
        })))
    } else {
        let err_msg = res.metadata.error.map(|e| e.message).unwrap_or_else(|| "未知错误".to_string());
        Err(AppError::Internal(format!("火山引擎接口错误: {}", err_msg)))
    }
}

/// 用户：完成真人核验并同步资产
async fn complete_real_person_verify(
    State(state): State<Arc<AppState>>,
    axum::extract::Extension(claims): axum::extract::Extension<crate::auth::Claims>,
    Json(payload): Json<CompleteVerifyRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let volc_config = crate::api::plugins::get_volc_config(&state, "asset_manager").await
        .ok_or_else(|| AppError::BadRequest("实人认证功能未配置".to_string()))?;

    let client = crate::services::volcengine::VolcClient::new(volc_config.clone())
        .with_logger(state.db.clone(), claims.sub.clone());

    // 1. 获取核验结果
    let res: crate::services::volcengine::GetVisualValidateResultResponse = client.call_api(
        "visual", "cn-north-1", "GetVisualValidateResult", "2022-03-25",
        crate::services::volcengine::GetVisualValidateResultRequest {
            app_id: volc_config.app_id.clone(),
            byted_token: payload.byted_token.clone(),
        }
    ).await.map_err(|e| AppError::Internal(format!("获取认证结果失败: {}", e)))?;

    let result = res.result.ok_or_else(|| AppError::BadRequest("认证未完成或已过期".to_string()))?;
    if result.status != 0 {
        return Err(AppError::BadRequest("实人认证未通过".to_string()));
    }

    // 2. 认证通过，写入本地数据库
    let asset_id = format!("real_{}_{}", claims.sub, uuid::Uuid::new_v4().simple());

    sqlx::query(&state.db.format_query(
        "INSERT INTO plugin_assets (user_id, asset_type, source, status, file_name, file_url, category, asset_id) 
         VALUES (?, 'image', 'user', 'approved', ?, ?, '真人人像', ?)"
    ))
    .bind(&claims.sub)
    .bind("真人认证人像")
    .bind("") // 真人认证暂无 URL，火山侧管理
    .bind(&asset_id)
    .execute(&state.db.pool).await?;

    Ok(Json(json!({ "message": "认证成功", "asset_id": asset_id })))
}

/// 用户：上传虚拟人像（阶段一：仅上传至 TOS 存储，不调用火山引擎）
async fn upload_virtual_portrait(
    State(state): State<Arc<AppState>>,
    axum::extract::Extension(claims): axum::extract::Extension<crate::auth::Claims>,
    mut multipart: Multipart,
) -> AppResult<Json<serde_json::Value>> {
    // 检查 TOS 存储配置
    let tos_config = crate::api::plugins::get_tos_config(&state, "asset_manager").await
        .ok_or_else(|| AppError::BadRequest("存储未配置，请联系管理员".to_string()))?;

    let user: crate::models::User = sqlx::query_as(&state.db.format_query(
        "SELECT u.*, ul.name as level_name FROM users u LEFT JOIN user_levels ul ON u.user_group = ul.group_key WHERE u.id = ?"
    ))
    .bind(&claims.sub)
    .fetch_optional(&state.db.pool)
    .await?
    .ok_or_else(|| AppError::Unauthorized)?;

    let mut file_data: Option<axum::body::Bytes> = None;
    let mut file_name = String::new();
    let mut mime_type = String::new();
    let mut group_id = String::new();

    while let Some(field) = multipart.next_field().await.map_err(|e| AppError::BadRequest(e.to_string()))? {
        let name = field.name().unwrap_or_default().to_string();
        if name == "file" {
            file_name = field.file_name().unwrap_or("virtual_portrait.jpg").to_string();
            mime_type = field.content_type().unwrap_or("image/jpeg").to_string();
            file_data = Some(field.bytes().await.map_err(|e| AppError::BadRequest(e.to_string()))?);
        } else if name == "group_id" {
            group_id = field.text().await.unwrap_or_default();
        }
    }

    if group_id.is_empty() {
        return Err(AppError::BadRequest("未指定素材组合 (group_id)".to_string()));
    }

    let data = file_data.ok_or_else(|| AppError::BadRequest("未检测到文件".to_string()))?;
    let size = data.len() as i64;

    if size > 30 * 1024 * 1024 {
        return Err(AppError::BadRequest("图片不能超过 30MB".to_string()));
    }

    // 上传到 TOS
    let ext = std::path::Path::new(&file_name)
        .extension()
        .and_then(std::ffi::OsStr::to_str)
        .unwrap_or("jpg");
    let file_id = uuid::Uuid::new_v4().to_string();
    let safe_filename = format!("{}.{}", file_id, ext);
    let folder_name = user.uid.clone();
    let object_key = tos_config.full_key(&format!("{}/{}", folder_name, safe_filename));

    let file_url = crate::services::tos::upload_file(
        &tos_config,
        &object_key,
        data.to_vec(),
        &mime_type,
        None,
    ).await.map_err(|e| {
        tracing::error!("TOS upload failed: {}", e);
        AppError::Internal(format!("文件上传失败: {}", e))
    })?;

    // 写入数据库，状态为 uploaded（待提交审核）
    let asset: PluginAsset = sqlx::query_as(&state.db.format_query(
        "INSERT INTO plugin_assets (user_id, asset_type, source, status, file_name, file_url, mime_type, size, category, group_id)
         VALUES (?, 'image', 'user', 'uploaded', ?, ?, ?, ?, '虚拟人像', ?)
         RETURNING *"
    ))
    .bind(&claims.sub)
    .bind(&file_name)
    .bind(&file_url)
    .bind(&mime_type)
    .bind(size)
    .bind(&group_id)
    .fetch_one(&state.db.pool).await?;

    Ok(Json(json!({ "message": "上传成功，请提交审核", "asset": asset })))
}

/// 用户：提交虚拟人像审核（阶段二：调用火山引擎 CreateAsset）
async fn submit_virtual_portrait_review(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    axum::extract::Extension(claims): axum::extract::Extension<crate::auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    let volc_config = crate::api::plugins::get_volc_config(&state, "asset_manager").await
        .ok_or_else(|| AppError::BadRequest("审核配置未完成，请联系管理员".to_string()))?;

    // 查找素材，确认归属当前用户且状态为 uploaded
    let asset: PluginAsset = sqlx::query_as(&state.db.format_query(
        "SELECT * FROM plugin_assets WHERE id = ? AND user_id = ? AND status = 'uploaded'"
    ))
    .bind(id)
    .bind(&claims.sub)
    .fetch_optional(&state.db.pool)
    .await?
    .ok_or_else(|| AppError::BadRequest("素材不存在或已提交".to_string()))?;

    // 获取 TOS 配置，构建公网 URL
    let tos_config = crate::api::plugins::get_tos_config(&state, "asset_manager").await
        .ok_or_else(|| AppError::BadRequest("存储未配置".to_string()))?;

    let user: crate::models::User = sqlx::query_as(&state.db.format_query(
        "SELECT u.*, ul.name as level_name FROM users u LEFT JOIN user_levels ul ON u.user_group = ul.group_key WHERE u.id = ?"
    ))
    .bind(&claims.sub)
    .fetch_optional(&state.db.pool)
    .await?
    .ok_or_else(|| AppError::Unauthorized)?;

    // 构建公网可访问的 URL（使用 tos_custom_domain）
    let folder_name = user.uid.clone();
    let filename = asset.file_url.split('/').last().unwrap_or("");
    let object_key = tos_config.full_key(&format!("{}/{}", folder_name, filename));
    
    let public_url = if !tos_config.custom_domain.is_empty() {
        let domain = tos_config.custom_domain.trim_end_matches('/');
        format!("https://{}/{}", domain, object_key)
    } else {
        format!("https://{}.{}/{}", tos_config.bucket, tos_config.endpoint, object_key)
    };

    let client = crate::services::volcengine::VolcClient::new(volc_config.clone())
        .with_logger(state.db.clone(), claims.sub.clone());

    // 1. 获取并检查 group_id
    let group_id = asset.group_id.clone().ok_or_else(|| AppError::BadRequest("该素材未绑定任何组合，无法提交".to_string()))?;

    // 2. 调用 CreateAsset
    let create_req = crate::services::volcengine::CreateAssetRequest {
        group_id: group_id.clone(),
        url: public_url.clone(),
        asset_type: "Image".to_string(),
        name: Some(asset.file_name.clone()),
        project_name: Some("default".to_string()),
    };

    let asset_res: crate::services::volcengine::CreateAssetResponse = client.call_api(
        "ark", "cn-beijing", "CreateAsset", "2024-01-01", create_req
    ).await.map_err(|e| AppError::Internal(format!("提交审核失败: {}", e)))?;

    let volc_asset_id = asset_res.id;

    // 3. 更新数据库：状态改为 processing，写入 asset_id
    sqlx::query(&state.db.format_query(
        "UPDATE plugin_assets SET status = 'processing', asset_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ))
    .bind(&volc_asset_id)
    .bind(id)
    .execute(&state.db.pool).await?;

    Ok(Json(json!({ "message": "已提交审核", "asset_id": volc_asset_id })))
}

#[derive(Deserialize)]
pub struct CreateGroupRequest {
    pub name: String,
    pub description: String,
}

/// 用户：获取自己的素材组合列表
async fn user_list_groups(
    State(state): State<Arc<AppState>>,
    axum::extract::Extension(claims): axum::extract::Extension<crate::auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    let groups: Vec<crate::models::PluginAssetGroup> = sqlx::query_as(&state.db.format_query(
        "SELECT * FROM plugin_asset_groups WHERE user_id = ? ORDER BY id DESC"
    ))
    .bind(&claims.sub)
    .fetch_all(&state.db.pool)
    .await?;

    Ok(Json(json!({ "groups": groups })))
}

/// 用户：新建素材组合 (调用方舟API)
async fn user_create_group(
    State(state): State<Arc<AppState>>,
    axum::extract::Extension(claims): axum::extract::Extension<crate::auth::Claims>,
    Json(payload): Json<CreateGroupRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let count: i64 = sqlx::query_scalar(&state.db.format_query(
        "SELECT COUNT(*) FROM plugin_asset_groups WHERE user_id = ?"
    ))
    .bind(&claims.sub)
    .fetch_one(&state.db.pool)
    .await
    .unwrap_or(0);

    let quota = 30; // 默认 30
    if count >= quota {
        return Err(AppError::BadRequest(format!("最多只能创建 {} 个素材组合", quota)));
    }

    let volc_config = crate::api::plugins::get_volc_config(&state, "asset_manager").await
        .ok_or_else(|| AppError::BadRequest("API配置未完成".to_string()))?;
    let client = crate::services::volcengine::VolcClient::new(volc_config.clone())
        .with_logger(state.db.clone(), claims.sub.clone());

    let create_group_req = crate::services::volcengine::CreateAssetGroupRequest {
        name: payload.name.clone(),
        description: payload.description.clone(),
        group_type: Some("AIGC".to_string()),
        project_name: Some("default".to_string()),
    };

    let group_res: crate::services::volcengine::CreateAssetGroupResponse = client.call_api(
        "ark", "cn-beijing", "CreateAssetGroup", "2024-01-01", create_group_req
    ).await.map_err(|e| AppError::Internal(format!("创建方舟组合失败: {}", e)))?;

    let group_id = group_res.id;

    let group: crate::models::PluginAssetGroup = sqlx::query_as(&state.db.format_query(
        "INSERT INTO plugin_asset_groups (user_id, group_id, name, description)
         VALUES (?, ?, ?, ?)
         RETURNING *"
    ))
    .bind(&claims.sub)
    .bind(&group_id)
    .bind(&payload.name)
    .bind(&payload.description)
    .fetch_one(&state.db.pool)
    .await?;

    Ok(Json(json!({ "message": "创建成功", "group": group })))
}

/// 用户：查询虚拟人像审核状态（轮询方舟 GetAsset）
async fn check_asset_status(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    axum::extract::Extension(claims): axum::extract::Extension<crate::auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    let asset: PluginAsset = sqlx::query_as(&state.db.format_query(
        "SELECT * FROM plugin_assets WHERE id = ? AND user_id = ?"
    ))
    .bind(id)
    .bind(&claims.sub)
    .fetch_optional(&state.db.pool)
    .await?
    .ok_or_else(|| AppError::BadRequest("素材不存在".to_string()))?;

    // 如果不是 processing 状态，直接返回当前数据库状态
    if asset.status != "processing" {
        return Ok(Json(json!({ "status": asset.status })));
    }

    // processing 状态：调用方舟 GetAsset 查询实际状态
    let volc_config = crate::api::plugins::get_volc_config(&state, "asset_manager").await;
    let asset_id_val = asset.asset_id.unwrap_or_default();

    if let Some(vc) = volc_config {
        if !asset_id_val.is_empty() {
            let client = crate::services::volcengine::VolcClient::new(vc)
                .with_logger(state.db.clone(), claims.sub.clone());
            let get_req = crate::services::volcengine::GetAssetRequest {
                id: asset_id_val.clone(),
                project_name: Some("default".to_string()),
            };

            match client.call_api::<_, crate::services::volcengine::GetAssetResponse>(
                "ark", "cn-beijing", "GetAsset", "2024-01-01", get_req
            ).await {
                Ok(res) => {
                    match res.status.as_str() {
                        "Active" => {
                            sqlx::query(&state.db.format_query(
                                "UPDATE plugin_assets SET status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
                            ))
                            .bind(id)
                            .execute(&state.db.pool).await?;
                            return Ok(Json(json!({ "status": "approved" })));
                        }
                        "Failed" => {
                            sqlx::query(&state.db.format_query(
                                "UPDATE plugin_assets SET status = 'rejected', reject_reason = '素材审核未通过', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
                            ))
                            .bind(id)
                            .execute(&state.db.pool).await?;
                            return Ok(Json(json!({ "status": "rejected", "reason": "素材审核未通过" })));
                        }
                        _ => {
                            // Processing or other, keep polling
                            return Ok(Json(json!({ "status": "processing" })));
                        }
                    }
                }
                Err(e) => {
                    tracing::warn!("查询方舟素材资产状态失败: {}", e);
                }
            }
        }
    }

    Ok(Json(json!({ "status": "processing" })))
}


