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

