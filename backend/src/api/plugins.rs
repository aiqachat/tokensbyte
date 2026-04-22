use axum::{
    extract::{Path, State, Extension},
    routing::{get, post},
    Json, Router,
};
use std::sync::Arc;
use std::collections::HashMap;
use serde_json::json;
use crate::{
    error::{AppResult, AppError},
    models::Plugin,
    AppState,
    auth,
    services::tos::{self, TosConfig},
};
use serde::Deserialize;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/", get(list_plugins))
        .route("/{name}/toggle", post(toggle_plugin))
        .route("/{name}/config", post(update_plugin_config))
        .route("/{name}/storage-config", get(get_storage_config).post(save_storage_config))
        .route("/{name}/moderation-config", get(get_moderation_config).post(save_moderation_config))
        .route("/{name}/playground-config", get(get_playground_config).post(save_playground_config))
        .route("/{name}/playground-schemes", get(get_playground_schemes).post(save_playground_schemes))
        .route("/{name}/playground-public-config", get(get_playground_public_config))
        .route("/{name}/test-connection", post(test_tos_connection))
        .route("/{name}/api-logs", get(get_plugin_api_logs))
}

/// 管理员：获取所有插件列表
async fn list_plugins(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    let role: String = sqlx::query_scalar(&state.db.format_query("SELECT role FROM users WHERE id = ?"))
        .bind(&claims.sub)
        .fetch_one(&state.db.pool)
        .await?;
    if role != "admin" {
        return Err(AppError::Unauthorized);
    }

    let plugins: Vec<Plugin> = sqlx::query_as(&state.db.format_query("SELECT * FROM plugins ORDER BY id ASC"))
        .fetch_all(&state.db.pool)
        .await?;
    Ok(Json(json!({ "plugins": plugins })))
}

/// 公开接口：无需认证即可获取活跃插件列表（供前端菜单渲染）
pub async fn get_active_plugins_public(
    State(state): State<Arc<AppState>>,
) -> AppResult<Json<serde_json::Value>> {
    let plugins: Vec<Plugin> = sqlx::query_as(&state.db.format_query("SELECT * FROM plugins WHERE is_enabled = 1"))
        .fetch_all(&state.db.pool)
        .await?;
    Ok(Json(json!({ "active_plugins": plugins })))
}

#[derive(Deserialize)]
pub struct ToggleRequest {
    pub is_enabled: i64,
}

/// 管理员：开关插件
async fn toggle_plugin(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    Extension(claims): Extension<auth::Claims>,
    Json(payload): Json<ToggleRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let role: String = sqlx::query_scalar(&state.db.format_query("SELECT role FROM users WHERE id = ?"))
        .bind(&claims.sub)
        .fetch_one(&state.db.pool)
        .await?;
    if role != "admin" {
        return Err(AppError::Unauthorized);
    }

    sqlx::query(&state.db.format_query("UPDATE plugins SET is_enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE name = ?"))
        .bind(payload.is_enabled)
        .bind(&name)
        .execute(&state.db.pool)
        .await?;

    Ok(Json(json!({ "message": "ok" })))
}

#[derive(Deserialize)]
pub struct ConfigRequest {
    pub allowed_levels: String,
    pub level_quotas: Option<HashMap<String, i64>>, // 每个等级的存储配额(MB)
}

/// 管理员：配置插件的开放等级
async fn update_plugin_config(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    Extension(claims): Extension<auth::Claims>,
    Json(payload): Json<ConfigRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let role: String = sqlx::query_scalar(&state.db.format_query("SELECT role FROM users WHERE id = ?"))
        .bind(&claims.sub)
        .fetch_one(&state.db.pool)
        .await?;
    if role != "admin" {
        return Err(AppError::Unauthorized);
    }

    sqlx::query(&state.db.format_query("UPDATE plugins SET allowed_levels = ?, updated_at = CURRENT_TIMESTAMP WHERE name = ?"))
        .bind(&payload.allowed_levels)
        .bind(&name)
        .execute(&state.db.pool)
        .await?;

    // 保存每个等级的存储配额
    if let Some(quotas) = &payload.level_quotas {
        for (level_key, quota_mb) in quotas {
            let config_key = format!("quota_{}", level_key);
            upsert_config(&state, &name, &config_key, &quota_mb.to_string()).await?;
        }
    }

    Ok(Json(json!({ "message": "ok" })))
}

// ========== 存储配置 ==========

/// 辅助：从 DB 加载插件的所有 config
async fn load_plugin_configs(state: &AppState, plugin_name: &str) -> Result<HashMap<String, String>, sqlx::Error> {
    let rows: Vec<(String, String)> = sqlx::query_as(
        &state.db.format_query("SELECT config_key, config_value FROM plugin_configs WHERE plugin_name = ?")
    )
    .bind(plugin_name)
    .fetch_all(&state.db.pool)
    .await?;

    Ok(rows.into_iter().collect())
}

/// 辅助：保存 config（upsert）
async fn upsert_config(state: &AppState, plugin_name: &str, key: &str, value: &str) -> Result<(), sqlx::Error> {
    // 先尝试 UPDATE
    let result = sqlx::query(
        &state.db.format_query("UPDATE plugin_configs SET config_value = ?, updated_at = CURRENT_TIMESTAMP WHERE plugin_name = ? AND config_key = ?")
    )
    .bind(value)
    .bind(plugin_name)
    .bind(key)
    .execute(&state.db.pool)
    .await?;

    if result.rows_affected() == 0 {
        sqlx::query(
            &state.db.format_query("INSERT INTO plugin_configs (plugin_name, config_key, config_value) VALUES (?, ?, ?)")
        )
        .bind(plugin_name)
        .bind(key)
        .bind(value)
        .execute(&state.db.pool)
        .await?;
    }
    Ok(())
}

/// 管理员：获取存储配置（secret_key 脱敏）
async fn get_storage_config(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    let role: String = sqlx::query_scalar(&state.db.format_query("SELECT role FROM users WHERE id = ?"))
        .bind(&claims.sub)
        .fetch_one(&state.db.pool)
        .await?;
    if role != "admin" {
        return Err(AppError::Unauthorized);
    }

    let configs = load_plugin_configs(&state, &name).await?;

    // secret_key 脱敏
    let sk = configs.get("tos_secret_key").cloned().unwrap_or_default();
    let masked_sk = if sk.len() > 6 {
        format!("{}****{}", &sk[..3], &sk[sk.len()-3..])
    } else if !sk.is_empty() {
        "******".to_string()
    } else {
        String::new()
    };

    // 提取等级配额 (quota_xxx -> { xxx: value })
    let mut level_quotas = serde_json::Map::new();
    for (k, v) in &configs {
        if let Some(level_key) = k.strip_prefix("quota_") {
            let mb: i64 = v.parse().unwrap_or(100);
            level_quotas.insert(level_key.to_string(), serde_json::Value::Number(mb.into()));
        }
    }

    Ok(Json(json!({
        "tos_access_key": configs.get("tos_access_key").cloned().unwrap_or_default(),
        "tos_secret_key_masked": masked_sk,
        "tos_endpoint": configs.get("tos_endpoint").cloned().unwrap_or_default(),
        "tos_region": configs.get("tos_region").cloned().unwrap_or_default(),
        "tos_bucket": configs.get("tos_bucket").cloned().unwrap_or_default(),
        "tos_path_prefix": configs.get("tos_path_prefix").cloned().unwrap_or_default(),
        "tos_custom_domain": configs.get("tos_custom_domain").cloned().unwrap_or_default(),
        "is_configured": !configs.get("tos_access_key").cloned().unwrap_or_default().is_empty(),
        "level_quotas": level_quotas,
    })))
}

#[derive(Deserialize)]
pub struct StorageConfigRequest {
    pub tos_access_key: String,
    pub tos_secret_key: Option<String>, // 如果为空表示不修改
    pub tos_endpoint: String,
    pub tos_region: String,
    pub tos_bucket: String,
    pub tos_path_prefix: Option<String>,
    pub tos_custom_domain: Option<String>,
}

/// 管理员：保存存储配置
async fn save_storage_config(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    Extension(claims): Extension<auth::Claims>,
    Json(payload): Json<StorageConfigRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let role: String = sqlx::query_scalar(&state.db.format_query("SELECT role FROM users WHERE id = ?"))
        .bind(&claims.sub)
        .fetch_one(&state.db.pool)
        .await?;
    if role != "admin" {
        return Err(AppError::Unauthorized);
    }

    upsert_config(&state, &name, "tos_access_key", &payload.tos_access_key).await?;
    upsert_config(&state, &name, "tos_endpoint", &payload.tos_endpoint).await?;
    upsert_config(&state, &name, "tos_region", &payload.tos_region).await?;
    upsert_config(&state, &name, "tos_bucket", &payload.tos_bucket).await?;
    upsert_config(&state, &name, "tos_path_prefix", payload.tos_path_prefix.as_deref().unwrap_or("")).await?;
    upsert_config(&state, &name, "tos_custom_domain", payload.tos_custom_domain.as_deref().unwrap_or("")).await?;

    // secret_key 只在有值时更新
    if let Some(ref sk) = payload.tos_secret_key {
        if !sk.is_empty() && !sk.contains("****") {
            upsert_config(&state, &name, "tos_secret_key", sk).await?;
        }
    }

    Ok(Json(json!({ "message": "存储配置已保存" })))
}

/// 管理员：测试 TOS 连接
async fn test_tos_connection(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    let role: String = sqlx::query_scalar(&state.db.format_query("SELECT role FROM users WHERE id = ?"))
        .bind(&claims.sub)
        .fetch_one(&state.db.pool)
        .await?;
    if role != "admin" {
        return Err(AppError::Unauthorized);
    }

    let configs = load_plugin_configs(&state, &name).await?;
    let tos_config = TosConfig::from_map(&configs)
        .ok_or_else(|| AppError::BadRequest("TOS 配置不完整，请先保存配置".to_string()))?;

    match tos::test_connection(&tos_config).await {
        Ok(msg) => Ok(Json(json!({ "success": true, "message": msg }))),
        Err(msg) => Ok(Json(json!({ "success": false, "message": msg }))),
    }
}

// ========== 审核配置 (火山引擎) ==========

#[derive(Deserialize)]
pub struct ModerationConfigRequest {
    pub volc_access_key: String,
    pub volc_secret_key: Option<String>,
    pub volc_app_id: Option<String>,
    pub volc_project_name: Option<String>,
}

/// 管理员：获取审核配置
async fn get_moderation_config(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    let role: String = sqlx::query_scalar(&state.db.format_query("SELECT role FROM users WHERE id = ?"))
        .bind(&claims.sub)
        .fetch_one(&state.db.pool)
        .await?;
    if role != "admin" {
        return Err(AppError::Unauthorized);
    }

    let configs = load_plugin_configs(&state, &name).await?;

    // secret_key 脱敏
    let sk = configs.get("volc_secret_key").cloned().unwrap_or_default();
    let masked_sk = if sk.len() > 6 {
        format!("{}****{}", &sk[..3], &sk[sk.len()-3..])
    } else if !sk.is_empty() {
        "******".to_string()
    } else {
        String::new()
    };

    Ok(Json(json!({
        "volc_access_key": configs.get("volc_access_key").cloned().unwrap_or_default(),
        "volc_secret_key_masked": masked_sk,
        "volc_app_id": configs.get("volc_app_id").cloned().unwrap_or_default(),
        "volc_project_name": configs.get("volc_project_name").cloned().unwrap_or_else(|| "default".to_string()),
        "is_configured": !configs.get("volc_access_key").cloned().unwrap_or_default().is_empty(),
    })))
}

/// 管理员：保存审核配置
async fn save_moderation_config(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    Extension(claims): Extension<auth::Claims>,
    Json(payload): Json<ModerationConfigRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let role: String = sqlx::query_scalar(&state.db.format_query("SELECT role FROM users WHERE id = ?"))
        .bind(&claims.sub)
        .fetch_one(&state.db.pool)
        .await?;
    if role != "admin" {
        return Err(AppError::Unauthorized);
    }

    upsert_config(&state, &name, "volc_access_key", &payload.volc_access_key).await?;
    if let Some(ref app_id) = payload.volc_app_id {
        if !app_id.is_empty() {
            upsert_config(&state, &name, "volc_app_id", app_id).await?;
        }
    }

    // secret_key 只在有值时更新
    if let Some(ref sk) = payload.volc_secret_key {
        if !sk.is_empty() && !sk.contains("****") {
            upsert_config(&state, &name, "volc_secret_key", sk).await?;
        }
    }

    // project_name
    if let Some(ref pn) = payload.volc_project_name {
        let pn_val = if pn.trim().is_empty() { "default" } else { pn.trim() };
        upsert_config(&state, &name, "volc_project_name", pn_val).await?;
    }

    Ok(Json(json!({ "message": "审核配置已保存" })))
}

/// 公开辅助：加载插件的 Volcengine 配置（供 assets 模块调用）
pub async fn get_volc_config(state: &AppState, plugin_name: &str) -> Option<crate::services::volcengine::VolcConfig> {
    let configs = load_plugin_configs(state, plugin_name).await.ok()?;
    crate::services::volcengine::VolcConfig::from_map(&configs)
}

pub async fn get_tos_config(state: &AppState, plugin_name: &str) -> Option<TosConfig> {
    let configs = load_plugin_configs(state, plugin_name).await.ok()?;
    TosConfig::from_map(&configs)
}

#[derive(serde::Serialize, sqlx::FromRow)]
pub struct PluginApiLog {
    pub id: i32,
    pub user_id: String,
    pub plugin_name: String,
    pub api_endpoint: String,
    pub request_payload: Option<String>,
    pub response_payload: Option<String>,
    pub status_code: Option<i32>,
    pub created_at: String,
}

#[derive(serde::Deserialize)]
pub struct LogQuery {
    pub page: Option<i64>,
    pub page_size: Option<i64>,
}

/// 管理员：获取插件 API 日志
async fn get_plugin_api_logs(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    axum::extract::Query(query): axum::extract::Query<LogQuery>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    let role: String = sqlx::query_scalar(&state.db.format_query("SELECT role FROM users WHERE id = ?"))
        .bind(&claims.sub)
        .fetch_optional(&state.db.pool)
        .await?
        .unwrap_or_default();
    if role != "admin" {
        return Err(AppError::Unauthorized);
    }

    let page = query.page.unwrap_or(1).max(1);
    let page_size = query.page_size.unwrap_or(20).clamp(1, 100);
    let offset = (page - 1) * page_size;

    let total: i64 = sqlx::query_scalar(&state.db.format_query(
        "SELECT COUNT(*) FROM plugin_api_logs WHERE plugin_name = ?"
    ))
    .bind(&name)
    .fetch_one(&state.db.pool)
    .await?;

    let logs: Vec<PluginApiLog> = sqlx::query_as(&state.db.format_query(
        "SELECT * FROM plugin_api_logs WHERE plugin_name = ? ORDER BY id DESC LIMIT ? OFFSET ?"
    ))
    .bind(&name)
    .bind(page_size)
    .bind(offset)
    .fetch_all(&state.db.pool)
    .await?;

    Ok(Json(json!({
        "logs": logs,
        "total": total,
        "page": page,
        "page_size": page_size
    })))
}

// ========== 体验中心配置 (Playground) ==========

/// 系统内置体验方案默认种子（仅当 DB 中无自定义方案时用作初始化）
fn get_default_schemes() -> Vec<serde_json::Value> {
    vec![
        json!({
            "id": "seedance2.0",
            "name": "Seedance 2.0 标准方案",
            "type": "video",
            "is_system": true,
            "description": "支持多种分辨率和时长，适合高品质视频生成",
            "params": [
                {"key": "ratio", "label": "画面比例", "type": "radio", "options": ["21:9","16:9","4:3","1:1","3:4","9:16","adaptive"], "default": "16:9"},
                {"key": "duration", "label": "视频时长", "type": "select", "options": [-1,5,10], "default": 5, "unit": "秒", "hint": "-1 表示由模型智能选择"},
                {"key": "seed", "label": "随机种子", "type": "number", "default": -1, "min": -1, "max": 4294967295_i64, "hint": "-1 表示随机"},
                {"key": "resolution", "label": "输出分辨率", "type": "select", "options": ["480p","720p","1080p"], "default": "720p"},
                {"key": "generate_audio", "label": "生成音频", "type": "switch", "default": true},
                {"key": "camera_fixed", "label": "固定摄像头", "type": "switch", "default": false},
                {"key": "return_last_frame", "label": "返回尾帧图像", "type": "switch", "default": false},
                {"key": "watermark", "label": "水印", "type": "switch", "default": false}
            ]
        }),
        json!({
            "id": "seedance2.0fast",
            "name": "Seedance 2.0 快速方案",
            "type": "video",
            "is_system": true,
            "description": "快速生成，参数精简，适合快速预览",
            "params": [
                {"key": "ratio", "label": "画面比例", "type": "radio", "options": ["21:9","16:9","4:3","1:1","3:4","9:16","adaptive"], "default": "16:9"},
                {"key": "duration", "label": "视频时长", "type": "select", "options": [-1,5,10], "default": 5, "unit": "秒", "hint": "-1 表示由模型智能选择"},
                {"key": "seed", "label": "随机种子", "type": "number", "default": -1, "min": -1, "max": 4294967295_i64, "hint": "-1 表示随机"},
                {"key": "resolution", "label": "输出分辨率", "type": "select", "options": ["480p","720p"], "default": "720p"},
                {"key": "generate_audio", "label": "生成音频", "type": "switch", "default": true},
                {"key": "camera_fixed", "label": "固定摄像头", "type": "switch", "default": false},
                {"key": "return_last_frame", "label": "返回尾帧图像", "type": "switch", "default": false},
                {"key": "watermark", "label": "水印", "type": "switch", "default": false}
            ]
        }),
        json!({
            "id": "seedream",
            "name": "Seedream 图片生成方案",
            "type": "image",
            "is_system": true,
            "description": "支持多种尺寸和比例的高质量 AI 图片生成，适用于 doubao-seedream 系列模型",
            "params": [
                {"key": "ratio", "label": "画面比例", "type": "radio", "options": ["1:1","16:9","9:16","4:3","3:4","3:2","2:3"], "default": "1:1"},
                {"key": "size", "label": "图片尺寸", "type": "select", "options": ["512x512","1024x1024","1280x720","720x1280","1024x768","768x1024"], "default": "1024x1024"},
                {"key": "n", "label": "生成数量", "type": "select", "options": [1,2,4], "default": 1, "unit": "张"},
                {"key": "guidance_scale", "label": "引导强度", "type": "select", "options": [3,5,7,9,12], "default": 7},
                {"key": "watermark", "label": "水印", "type": "switch", "default": false}
            ]
        }),
        json!({
            "id": "seedance1.5pro",
            "name": "Seedance 1.5 Pro 方案",
            "type": "video",
            "is_system": true,
            "endpoint": "/api/v3/contents/generations/tasks",
            "poll_endpoint": "/api/v3/contents/generations/tasks/{task_id}",
            "description": "支持文生视频和图生视频，可生成音频，适用于 doubao-seedance-1-0-pro 系列模型",
            "params": [
                {"key": "ratio", "label": "画面比例", "type": "radio", "options": ["21:9","16:9","4:3","1:1","3:4","9:16","adaptive"], "default": "16:9"},
                {"key": "duration", "label": "视频时长", "type": "select", "options": [-1,5,10], "default": 5, "unit": "秒", "hint": "-1 表示由模型智能选择"},
                {"key": "seed", "label": "随机种子", "type": "number", "default": -1, "min": -1, "max": 4294967295_i64, "hint": "-1 表示随机"},
                {"key": "generate_audio", "label": "生成音频", "type": "switch", "default": true},
                {"key": "camera_fixed", "label": "固定摄像头", "type": "switch", "default": false},
                {"key": "return_last_frame", "label": "返回尾帧图像", "type": "switch", "default": false},
                {"key": "image_url", "label": "参考图片 URL", "type": "input", "default": "", "placeholder": "可选，填入图片链接可实现图生视频"},
                {"key": "watermark", "label": "水印", "type": "switch", "default": false}
            ]
        }),
    ]
}

/// 从 DB 加载方案列表（优先使用 DB 存储，DB 为空时 fallback 到内置默认）
async fn load_schemes_from_db(state: &AppState, plugin_name: &str) -> Vec<serde_json::Value> {
    let configs = load_plugin_configs(state, plugin_name).await.unwrap_or_default();
    if let Some(schemes_str) = configs.get("pg_schemes") {
        if let Ok(schemes) = serde_json::from_str::<Vec<serde_json::Value>>(schemes_str) {
            if !schemes.is_empty() {
                return schemes;
            }
        }
    }
    // DB 中没有或解析失败，返回内置默认
    get_default_schemes()
}

/// 每个模型的体验配置（启用状态 + 绑定方案）
#[derive(Deserialize)]
pub struct PlaygroundModelConfig {
    pub id: i32,
    pub mid: String,
    pub enabled: bool,
    pub scheme_id: Option<String>,
}

#[derive(Deserialize)]
pub struct PlaygroundConfigRequest {
    pub models: Vec<PlaygroundModelConfig>,
}

/// 管理员：获取体验中心配置（返回全部模型 + 每个模型的启用/方案信息）
async fn get_playground_config(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    let role: String = sqlx::query_scalar(&state.db.format_query("SELECT role FROM users WHERE id = ?"))
        .bind(&claims.sub)
        .fetch_one(&state.db.pool)
        .await?;
    if role != "admin" {
        return Err(AppError::Unauthorized);
    }

    let configs = load_plugin_configs(&state, &name).await?;

    // 查出全部模型及其 type 信息
    let models: Vec<crate::models::Model> = sqlx::query_as(
        &state.db.format_query("SELECT * FROM models ORDER BY id DESC")
    ).fetch_all(&state.db.pool).await?;

    let types: Vec<crate::models::ModelType> = sqlx::query_as(
        &state.db.format_query("SELECT * FROM model_types ORDER BY sort_order ASC")
    ).fetch_all(&state.db.pool).await?;

    // 为每个模型附加启用和方案配置
    let mut model_list = Vec::new();
    for m in &models {
        let new_key = format!("pg_model_id_{}", m.id);
        let old_key = format!("pg_model_{}", m.mid);
        let model_conf: serde_json::Value = configs.get(&new_key)
            .or_else(|| configs.get(&old_key))
            .and_then(|s| serde_json::from_str(s).ok())
            .unwrap_or(json!({"enabled": false, "scheme_id": null}));

        let type_name = m.type_id
            .and_then(|tid| types.iter().find(|t| t.id == tid))
            .map(|t| t.name.clone())
            .unwrap_or_default();

        model_list.push(json!({
            "id": m.id,
            "mid": m.mid,
            "name": m.name,
            "model_id": m.model_id,
            "type_id": m.type_id,
            "type_name": type_name,
            "is_active": m.is_active,
            "pg_enabled": model_conf.get("enabled").and_then(|v| v.as_bool()).unwrap_or(false),
            "pg_scheme_id": model_conf.get("scheme_id").and_then(|v| v.as_str()).unwrap_or(""),
        }));
    }

    Ok(Json(json!({
        "models": model_list,
        "schemes": load_schemes_from_db(&state, &name).await,
    })))
}

/// 管理员：保存体验中心配置（按模型逐个保存启用状态和方案绑定）
async fn save_playground_config(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    Extension(claims): Extension<auth::Claims>,
    Json(payload): Json<PlaygroundConfigRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let role: String = sqlx::query_scalar(&state.db.format_query("SELECT role FROM users WHERE id = ?"))
        .bind(&claims.sub)
        .fetch_one(&state.db.pool)
        .await?;
    if role != "admin" {
        return Err(AppError::Unauthorized);
    }

    for mc in &payload.models {
        let config_key = format!("pg_model_id_{}", mc.id);
        let val = json!({
            "enabled": mc.enabled,
            "scheme_id": mc.scheme_id,
        });
        upsert_config(&state, &name, &config_key, &val.to_string()).await?;
    }

    Ok(Json(json!({ "message": "体验中心配置已保存" })))
}

/// 管理员：获取体验方案列表（从 DB 加载，含内置 + 自定义）
async fn get_playground_schemes(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    let _ = claims;
    let schemes = load_schemes_from_db(&state, &name).await;
    Ok(Json(json!({ "schemes": schemes, "defaults": get_default_schemes() })))
}

/// 管理员：保存体验方案列表（全量覆盖）
async fn save_playground_schemes(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    Extension(claims): Extension<auth::Claims>,
    Json(payload): Json<serde_json::Value>,
) -> AppResult<Json<serde_json::Value>> {
    let role: String = sqlx::query_scalar(&state.db.format_query("SELECT role FROM users WHERE id = ?"))
        .bind(&claims.sub)
        .fetch_one(&state.db.pool)
        .await?;
    if role != "admin" {
        return Err(AppError::Unauthorized);
    }

    let schemes = payload.get("schemes")
        .ok_or_else(|| AppError::BadRequest("缺少 schemes 字段".to_string()))?;
    
    let schemes_str = serde_json::to_string(schemes)
        .map_err(|_| AppError::BadRequest("方案数据序列化失败".to_string()))?;
    
    upsert_config(&state, &name, "pg_schemes", &schemes_str).await?;

    Ok(Json(json!({ "message": "体验方案已保存" })))
}

/// 公开：获取体验中心配置供前端用户使用
/// 返回已启用的模型列表 + 各模型绑定的方案参数
async fn get_playground_public_config(
    State(state): State<Arc<AppState>>,
) -> AppResult<Json<serde_json::Value>> {
    let configs = load_plugin_configs(&state, "playground").await?;
    let schemes = load_schemes_from_db(&state, "playground").await;

    // 查出全部模型及其 type 信息
    let models: Vec<crate::models::Model> = sqlx::query_as(
        &state.db.format_query("SELECT * FROM models WHERE is_active = 1 ORDER BY id DESC")
    ).fetch_all(&state.db.pool).await?;

    let types: Vec<crate::models::ModelType> = sqlx::query_as(
        &state.db.format_query("SELECT * FROM model_types ORDER BY sort_order ASC")
    ).fetch_all(&state.db.pool).await?;

    let mut enabled_models = Vec::new();
    for m in &models {
        let new_key = format!("pg_model_id_{}", m.id);
        let old_key = format!("pg_model_{}", m.mid);
        let model_conf: serde_json::Value = configs.get(&new_key)
            .or_else(|| configs.get(&old_key))
            .and_then(|s| serde_json::from_str(s).ok())
            .unwrap_or(json!({"enabled": false, "scheme_id": null}));

        let is_enabled = model_conf.get("enabled").and_then(|v| v.as_bool()).unwrap_or(false);
        if !is_enabled { continue; }

        let scheme_id = model_conf.get("scheme_id").and_then(|v| v.as_str()).unwrap_or("");
        let mut scheme = schemes.iter().find(|s| s.get("id").and_then(|v| v.as_str()) == Some(scheme_id));

        let type_name = m.type_id
            .and_then(|tid| types.iter().find(|t| t.id == tid))
            .map(|t| t.name.clone())
            .unwrap_or_default();

        // 如果未绑定方案或方案不存在，按模型类型自动匹配第一个同类方案
        if scheme.is_none() && !type_name.is_empty() {
            let type_key = if type_name.contains("视频") { "video" }
                else if type_name.contains("图片") { "image" }
                else if type_name.contains("聊天") { "chat" }
                else { "" };
            if !type_key.is_empty() {
                scheme = schemes.iter().find(|s| s.get("type").and_then(|v| v.as_str()) == Some(type_key));
            }
        }

        let scheme_type = scheme.and_then(|s| s.get("type")).and_then(|v| v.as_str()).unwrap_or("");

        enabled_models.push(json!({
            "mid": m.mid,
            "name": m.name,
            "model_id": m.model_id,
            "type_name": type_name,
            "scheme_id": scheme_id,
            "scheme_name": scheme.and_then(|s| s.get("name")).and_then(|v| v.as_str()).unwrap_or(""),
            "scheme_type": scheme_type,
            "endpoint": scheme.and_then(|s| s.get("endpoint")).and_then(|v| v.as_str()).unwrap_or(""),
            "poll_endpoint": scheme.and_then(|s| s.get("poll_endpoint")).and_then(|v| v.as_str()).unwrap_or(""),
            "params": scheme.and_then(|s| s.get("params")).cloned().unwrap_or(json!([])),
        }));
    }

    Ok(Json(json!({
        "models": enabled_models,
    })))
}
