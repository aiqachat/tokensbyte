use axum::{
    extract::{Path, State, Extension},
    routing::{get, post, delete},
    Json, Router,
};
use std::sync::Arc;
use serde_json::json;
use sha2::Digest;
use crate::{
    error::{AppResult, AppError},
    AppState,
    auth,
    services::tos,
    api::plugins::{get_tos_config, load_plugin_configs_pub},
};
use serde::Deserialize;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/projects", get(list_projects).post(create_project))
        .route("/projects/{id}", get(get_project).put(update_project).delete(delete_project))
        .route("/projects/{id}/save-canvas", post(save_canvas))
        .route("/assets/persist", post(persist_asset))
        .route("/assets/{id}", delete(delete_asset))
        .route("/storage-stats", get(storage_stats))
}

// ========== 项目 CRUD ==========

/// 获取当前用户的项目列表
async fn list_projects(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    let projects: Vec<(i32, String, String, String, String, String, i32, String, String)> = sqlx::query_as(
        &state.db.format_query(
            "SELECT id, uid, name, description, cover_url, canvas_data, is_deleted, created_at, updated_at \
             FROM playground_projects WHERE user_id = ? AND is_deleted = 0 ORDER BY updated_at DESC"
        )
    )
    .bind(&claims.sub)
    .fetch_all(&state.db.pool)
    .await?;

    let list: Vec<serde_json::Value> = projects.iter().map(|p| {
        // 获取项目的资源数量（快速统计）
        json!({
            "id": p.0,
            "uid": p.1,
            "name": p.2,
            "description": p.3,
            "cover_url": p.4,
            "canvas_data": p.5,
            "is_deleted": p.6,
            "created_at": p.7,
            "updated_at": p.8,
        })
    }).collect();

    Ok(Json(json!({ "projects": list })))
}

/// 创建新项目
#[derive(Deserialize)]
struct CreateProjectRequest {
    name: Option<String>,
    description: Option<String>,
}

async fn create_project(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Json(payload): Json<CreateProjectRequest>,
) -> AppResult<Json<serde_json::Value>> {
    // 获取用户 UID
    let uid: String = sqlx::query_scalar(&state.db.format_query("SELECT uid FROM users WHERE id = ?"))
        .bind(&claims.sub)
        .fetch_one(&state.db.pool)
        .await?;

    let name = payload.name.unwrap_or_else(|| "未命名项目".to_string());
    let desc = payload.description.unwrap_or_default();

    // 生成 project_id = UID尾部3位 + 5位随机数
    let uid_suffix = if uid.len() >= 3 {
        uid[uid.len() - 3..].to_string()
    } else {
        format!("{:0>3}", uid)
    };

    let mut new_id: i32 = 0;
    for i in 0..50 {
        let ts = chrono::Utc::now().timestamp_micros() as u64;
        // 增加些许伪随机扰动避免同一微秒重复
        let random_part = ((ts + i * 137) % 90000) + 10000; 
        let id_str = format!("{}{}", uid_suffix, random_part);
        if let Ok(id_val) = id_str.parse::<i32>() {
            // 查询是否已存在（涵盖了已被软删除的旧项目）
            let exists: i64 = sqlx::query_scalar(&state.db.format_query(
                "SELECT COUNT(*) FROM playground_projects WHERE id = ?"
            ))
            .bind(id_val)
            .fetch_one(&state.db.pool)
            .await?;

            if exists == 0 {
                new_id = id_val;
                break;
            }
        }
    }

    if new_id == 0 {
        return Err(AppError::Internal("生成唯一项目ID失败，请稍后重试".to_string()));
    }

    sqlx::query(
        &state.db.format_query(
            "INSERT INTO playground_projects (id, user_id, uid, name, description) VALUES (?, ?, ?, ?, ?)"
        )
    )
    .bind(new_id)
    .bind(&claims.sub)
    .bind(&uid)
    .bind(&name)
    .bind(&desc)
    .execute(&state.db.pool)
    .await?;

    Ok(Json(json!({
        "id": new_id,
        "uid": uid,
        "name": name,
        "description": desc,
        "message": "项目创建成功"
    })))
}

/// 获取单个项目详情（含资源列表）
async fn get_project(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    let project: (i32, String, String, String, String, String, String, String) = sqlx::query_as(
        &state.db.format_query(
            "SELECT id, uid, name, description, cover_url, canvas_data, created_at, updated_at \
             FROM playground_projects WHERE id = ? AND user_id = ? AND is_deleted = 0"
        )
    )
    .bind(id)
    .bind(&claims.sub)
    .fetch_optional(&state.db.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;

    // 获取该项目的资源列表
    let assets: Vec<(i32, String, String, i64, String, String, String, String, String, String, f64, i32, i32, String)> = sqlx::query_as(
        &state.db.format_query(
            "SELECT id, asset_type, file_name, file_size, file_url, thumbnail_url, prompt, model_id, model_name, \
             canvas_node_data, duration_seconds, width, height, created_at \
             FROM playground_assets WHERE project_id = ? AND user_id = ? AND is_deleted = 0 ORDER BY id DESC"
        )
    )
    .bind(id)
    .bind(&claims.sub)
    .fetch_all(&state.db.pool)
    .await?;

    let asset_list: Vec<serde_json::Value> = assets.iter().map(|a| {
        json!({
            "id": a.0,
            "asset_type": a.1,
            "file_name": a.2,
            "file_size": a.3,
            "file_url": a.4,
            "thumbnail_url": a.5,
            "prompt": a.6,
            "model_id": a.7,
            "model_name": a.8,
            "canvas_node_data": a.9,
            "duration_seconds": a.10,
            "width": a.11,
            "height": a.12,
            "created_at": a.13,
        })
    }).collect();

    Ok(Json(json!({
        "project": {
            "id": project.0,
            "uid": project.1,
            "name": project.2,
            "description": project.3,
            "cover_url": project.4,
            "canvas_data": project.5,
            "created_at": project.6,
            "updated_at": project.7,
        },
        "assets": asset_list,
    })))
}

/// 更新项目
#[derive(Deserialize)]
struct UpdateProjectRequest {
    name: Option<String>,
    description: Option<String>,
}

async fn update_project(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
    Extension(claims): Extension<auth::Claims>,
    Json(payload): Json<UpdateProjectRequest>,
) -> AppResult<Json<serde_json::Value>> {
    // 验证归属
    let count: i64 = sqlx::query_scalar(
        &state.db.format_query("SELECT COUNT(*) FROM playground_projects WHERE id = ? AND user_id = ? AND is_deleted = 0")
    )
    .bind(id)
    .bind(&claims.sub)
    .fetch_one(&state.db.pool)
    .await?;

    if count == 0 {
        return Err(AppError::NotFound("项目不存在".to_string()));
    }

    if let Some(name) = &payload.name {
        sqlx::query(&state.db.format_query("UPDATE playground_projects SET name = ?, updated_at = now()::text WHERE id = ?"))
            .bind(name)
            .bind(id)
            .execute(&state.db.pool)
            .await?;
    }

    if let Some(desc) = &payload.description {
        sqlx::query(&state.db.format_query("UPDATE playground_projects SET description = ?, updated_at = now()::text WHERE id = ?"))
            .bind(desc)
            .bind(id)
            .execute(&state.db.pool)
            .await?;
    }

    Ok(Json(json!({ "message": "项目更新成功" })))
}

/// 软删除项目
async fn delete_project(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    let result = sqlx::query(
        &state.db.format_query("UPDATE playground_projects SET is_deleted = 1, updated_at = now()::text WHERE id = ? AND user_id = ?")
    )
    .bind(id)
    .bind(&claims.sub)
    .execute(&state.db.pool)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("项目不存在".to_string()));
    }

    // 同时软删除项目下的所有资源
    sqlx::query(&state.db.format_query("UPDATE playground_assets SET is_deleted = 1 WHERE project_id = ? AND user_id = ?"))
        .bind(id)
        .bind(&claims.sub)
        .execute(&state.db.pool)
        .await?;

    Ok(Json(json!({ "message": "项目已删除" })))
}

/// 保存画布状态
#[derive(Deserialize)]
struct SaveCanvasRequest {
    canvas_data: String,
}

async fn save_canvas(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
    Extension(claims): Extension<auth::Claims>,
    Json(payload): Json<SaveCanvasRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let result = sqlx::query(
        &state.db.format_query("UPDATE playground_projects SET canvas_data = ?, updated_at = now()::text WHERE id = ? AND user_id = ? AND is_deleted = 0")
    )
    .bind(&payload.canvas_data)
    .bind(id)
    .bind(&claims.sub)
    .execute(&state.db.pool)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("项目不存在".to_string()));
    }

    Ok(Json(json!({ "message": "画布状态已保存" })))
}

// ========== 资源持久化 ==========

#[derive(Deserialize)]
struct PersistAssetRequest {
    project_id: i32,
    asset_type: String,       // image | video | text
    source_url: Option<String>, // 远程 URL（图片/视频的结果 URL）
    base64_data: Option<String>, // Base64 数据（部分模型直接返回 base64）
    prompt: Option<String>,
    model_id: Option<String>,
    model_name: Option<String>,
    generation_params: Option<serde_json::Value>,
    canvas_node_data: Option<serde_json::Value>,
}

/// 核心接口：持久化生成的资源到 TOS
async fn persist_asset(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Json(payload): Json<PersistAssetRequest>,
) -> AppResult<Json<serde_json::Value>> {
    // 验证项目归属
    let project: Option<(i32, String)> = sqlx::query_as(
        &state.db.format_query("SELECT id, uid FROM playground_projects WHERE id = ? AND user_id = ? AND is_deleted = 0")
    )
    .bind(payload.project_id)
    .bind(&claims.sub)
    .fetch_optional(&state.db.pool)
    .await?;

    let (project_id, uid) = project.ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;

    // 获取 Playground 的 TOS 配置
    let tos_config = get_tos_config(&state, "playground").await
        .ok_or_else(|| AppError::BadRequest("Playground 存储未配置，请联系管理员".to_string()))?;

    // 获取文件数据
    let (file_data, file_ext) = if let Some(ref b64) = payload.base64_data {
        // Base64 数据
        let data = base64_decode(b64)
            .map_err(|e| AppError::BadRequest(format!("Base64 解码失败: {}", e)))?;
        let ext = if payload.asset_type == "video" { "mp4" } else { "png" };
        (data, ext.to_string())
    } else if let Some(ref url) = payload.source_url {
        // 从远程 URL 下载
        let data = download_remote_file(url).await
            .map_err(|e| AppError::BadRequest(format!("下载远程文件失败: {}", e)))?;
        let ext = guess_extension(url, &payload.asset_type);
        (data, ext)
    } else {
        return Err(AppError::BadRequest("必须提供 source_url 或 base64_data".to_string()));
    };

    let file_size = file_data.len() as i64;

    // 生成 TOS object key
    let timestamp = chrono::Utc::now().timestamp();
    let hash = &format!("{:x}", sha2::Sha256::digest(&file_data))[..8];
    let type_folder = match payload.asset_type.as_str() {
        "video" => "videos",
        "image" => "images",
        "audio" => "audio",
        _ => "text",
    };
    let file_name = format!("{}_{}.{}", timestamp, hash, file_ext);
    // 强制把 project_id 补全为 8 位数（以还原丢失的 0 前缀）
    let relative_path = format!("{}/{:08}/{}/{}", uid, project_id, type_folder, file_name);
    let object_key = tos_config.full_key(&relative_path);

    // 上传到 TOS
    let content_type = match payload.asset_type.as_str() {
        "video" => "video/mp4",
        "image" => if file_ext == "png" { "image/png" } else { "image/jpeg" },
        "audio" => "audio/mpeg",
        _ => "application/json",
    };

    let file_url = tos::upload_file(&tos_config, &object_key, file_data, content_type, None).await
        .map_err(|e| AppError::Internal(format!("TOS 上传失败: {}", e)))?;

    // 写入数据库
    let gen_params_str = payload.generation_params
        .as_ref()
        .map(|v| v.to_string())
        .unwrap_or_else(|| "{}".to_string());

    let node_data_str = payload.canvas_node_data
        .as_ref()
        .map(|v| v.to_string())
        .unwrap_or_else(|| "{}".to_string());

    let asset_id: i32 = sqlx::query_scalar(
        &state.db.format_query(
            "INSERT INTO playground_assets \
             (project_id, user_id, uid, asset_type, file_name, file_size, file_url, tos_object_key, \
              prompt, model_id, model_name, generation_params, canvas_node_data) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id"
        )
    )
    .bind(project_id)
    .bind(&claims.sub)
    .bind(&uid)
    .bind(&payload.asset_type)
    .bind(&file_name)
    .bind(file_size)
    .bind(&file_url)
    .bind(&object_key)
    .bind(payload.prompt.as_deref().unwrap_or(""))
    .bind(payload.model_id.as_deref().unwrap_or(""))
    .bind(payload.model_name.as_deref().unwrap_or(""))
    .bind(&gen_params_str)
    .bind(&node_data_str)
    .fetch_one(&state.db.pool)
    .await?;

    // 更新项目封面和更新时间
    if payload.asset_type == "image" || payload.asset_type == "video" {
        sqlx::query(&state.db.format_query(
            "UPDATE playground_projects SET cover_url = ?, updated_at = now()::text WHERE id = ?"
        ))
        .bind(&file_url)
        .bind(project_id)
        .execute(&state.db.pool)
        .await?;
    }

    Ok(Json(json!({
        "id": asset_id,
        "file_url": file_url,
        "tos_object_key": object_key,
        "file_name": file_name,
        "file_size": file_size,
    })))
}

/// 删除单个资源
async fn delete_asset(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    // 查询资源信息
    let asset: Option<(i32, String)> = sqlx::query_as(
        &state.db.format_query("SELECT id, tos_object_key FROM playground_assets WHERE id = ? AND user_id = ? AND is_deleted = 0")
    )
    .bind(id)
    .bind(&claims.sub)
    .fetch_optional(&state.db.pool)
    .await?;

    let (_asset_id, tos_key) = asset.ok_or_else(|| AppError::NotFound("资源不存在".to_string()))?;

    // 软删除
    sqlx::query(&state.db.format_query("UPDATE playground_assets SET is_deleted = 1 WHERE id = ?"))
        .bind(id)
        .execute(&state.db.pool)
        .await?;

    // 尝试从 TOS 删除（异步，失败不影响返回）
    if !tos_key.is_empty() {
        if let Some(tos_config) = get_tos_config(&state, "playground").await {
            let _ = tos::delete_file(&tos_config, &tos_key).await;
        }
    }

    Ok(Json(json!({ "message": "资源已删除" })))
}

/// 获取用户存储用量统计
async fn storage_stats(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    let total_size: i64 = sqlx::query_scalar(
        &state.db.format_query("SELECT COALESCE(SUM(file_size), 0) FROM playground_assets WHERE user_id = ? AND is_deleted = 0")
    )
    .bind(&claims.sub)
    .fetch_one(&state.db.pool)
    .await
    .unwrap_or(0);

    let total_count: i64 = sqlx::query_scalar(
        &state.db.format_query("SELECT COUNT(*) FROM playground_assets WHERE user_id = ? AND is_deleted = 0")
    )
    .bind(&claims.sub)
    .fetch_one(&state.db.pool)
    .await
    .unwrap_or(0);

    let project_count: i64 = sqlx::query_scalar(
        &state.db.format_query("SELECT COUNT(*) FROM playground_projects WHERE user_id = ? AND is_deleted = 0")
    )
    .bind(&claims.sub)
    .fetch_one(&state.db.pool)
    .await
    .unwrap_or(0);

    // 获取用户的存储配额（从 plugin_configs 查询）
    let configs = load_plugin_configs_pub(&state, "playground").await.unwrap_or_default();
    let user_group: String = sqlx::query_scalar(&state.db.format_query("SELECT user_group FROM users WHERE id = ?"))
        .bind(&claims.sub)
        .fetch_one(&state.db.pool)
        .await
        .unwrap_or_else(|_| "default".to_string());

    let quota_key = format!("pg_quota_{}", user_group);
    let quota_mb: i64 = configs.get(&quota_key)
        .or_else(|| configs.get("pg_default_quota"))
        .and_then(|v| v.parse().ok())
        .unwrap_or(500); // 默认 500MB

    Ok(Json(json!({
        "total_size_bytes": total_size,
        "total_size_mb": (total_size as f64) / 1024.0 / 1024.0,
        "total_count": total_count,
        "project_count": project_count,
        "quota_mb": quota_mb,
        "usage_percent": if quota_mb > 0 {
            ((total_size as f64) / (quota_mb as f64 * 1024.0 * 1024.0) * 100.0).min(100.0)
        } else {
            0.0
        },
    })))
}

// ========== 辅助函数 ==========

fn base64_decode(input: &str) -> Result<Vec<u8>, String> {
    use base64::Engine;
    // 去掉可能的 data:xxx;base64, 前缀
    let data = if let Some(pos) = input.find(",") {
        &input[pos + 1..]
    } else {
        input
    };
    base64::engine::general_purpose::STANDARD
        .decode(data)
        .map_err(|e| format!("Base64 解码失败: {}", e))
}

async fn download_remote_file(url: &str) -> Result<Vec<u8>, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120)) // 视频可能很大
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

    let resp = client.get(url)
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }

    let bytes = resp.bytes().await.map_err(|e| format!("读取数据失败: {}", e))?;
    Ok(bytes.to_vec())
}

fn guess_extension(url: &str, asset_type: &str) -> String {
    // 尝试从 URL 推断扩展名
    let path = url.split('?').next().unwrap_or(url);
    if let Some(ext) = path.rsplit('.').next() {
        let ext_lower = ext.to_lowercase();
        if ["png", "jpg", "jpeg", "webp", "gif", "mp4", "webm", "mov", "mp3", "wav"].contains(&ext_lower.as_str()) {
            return ext_lower;
        }
    }
    // 按类型回退
    match asset_type {
        "video" => "mp4".to_string(),
        "image" => "png".to_string(),
        "audio" => "mp3".to_string(),
        _ => "json".to_string(),
    }
}
