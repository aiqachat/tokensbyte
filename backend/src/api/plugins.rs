use axum::{
    extract::{Path, State, Extension},
    routing::{get, post},
    Json, Router,
};
use std::sync::Arc;
use serde_json::json;
use crate::{
    error::{AppResult, AppError},
    models::Plugin,
    AppState,
    auth,
};
use serde::Deserialize;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/", get(list_plugins))
        .route("/{name}/toggle", post(toggle_plugin))
        .route("/{name}/config", post(update_plugin_config))
}

/// 管理员：获取所有插件列表
async fn list_plugins(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    // 验证管理员身份
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

/// 公开：获取当前启用的插件（含 allowed_levels 信息）
async fn get_active_plugins(
    State(state): State<Arc<AppState>>,
) -> AppResult<Json<serde_json::Value>> {
    let plugins: Vec<Plugin> = sqlx::query_as(&state.db.format_query("SELECT * FROM plugins WHERE is_enabled = 1"))
        .fetch_all(&state.db.pool)
        .await?;
    Ok(Json(json!({ "active_plugins": plugins })))
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
    pub allowed_levels: String, // "all" 或逗号分隔的等级 key，如 "default,vip,svip"
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
