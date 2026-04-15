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
        .route("/{name}/test-connection", post(test_tos_connection))
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

    Ok(Json(json!({
        "tos_access_key": configs.get("tos_access_key").cloned().unwrap_or_default(),
        "tos_secret_key_masked": masked_sk,
        "tos_endpoint": configs.get("tos_endpoint").cloned().unwrap_or_default(),
        "tos_region": configs.get("tos_region").cloned().unwrap_or_default(),
        "tos_bucket": configs.get("tos_bucket").cloned().unwrap_or_default(),
        "tos_path_prefix": configs.get("tos_path_prefix").cloned().unwrap_or_default(),
        "tos_custom_domain": configs.get("tos_custom_domain").cloned().unwrap_or_default(),
        "is_configured": !configs.get("tos_access_key").cloned().unwrap_or_default().is_empty(),
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

/// 公开辅助：加载插件的 TOS 配置（供 assets 模块调用）
pub async fn get_tos_config(state: &AppState, plugin_name: &str) -> Option<TosConfig> {
    let configs = load_plugin_configs(state, plugin_name).await.ok()?;
    TosConfig::from_map(&configs)
}
