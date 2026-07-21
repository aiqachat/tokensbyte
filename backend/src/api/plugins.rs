use crate::time_system::DbTs;
use axum::{
    extract::{Extension, Path, State},
    routing::{get, post},
    Json, Router,
};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::RwLock;

/// 模型广场公开数据的内存缓存（TTL 60秒）
pub struct MarketplaceCache {
    data: Option<serde_json::Value>,
    updated_at: Instant,
}

impl MarketplaceCache {
    pub fn new() -> Self {
        Self {
            data: None,
            updated_at: Instant::now(),
        }
    }
    pub fn is_valid(&self) -> bool {
        self.data.is_some() && self.updated_at.elapsed().as_secs() < 60
    }
    pub fn invalidate(&mut self) {
        self.data = None;
    }
}

static MARKETPLACE_CACHE: std::sync::OnceLock<RwLock<MarketplaceCache>> =
    std::sync::OnceLock::new();

pub fn get_marketplace_cache() -> &'static RwLock<MarketplaceCache> {
    MARKETPLACE_CACHE.get_or_init(|| RwLock::new(MarketplaceCache::new()))
}
use crate::{
    auth,
    error::{AppError, AppResult},
    models::Plugin,
    services::tos::{self, TosConfig},
    AppState,
};
use serde::Deserialize;
use serde_json::json;

pub fn router() -> Router<Arc<AppState>> {
    let mut r = Router::new()
        .route("/", get(list_plugins))
        .route("/{name}/toggle", post(toggle_plugin))
        .route("/{name}/config", post(update_plugin_config))
        .route("/{name}/ha-config", get(get_ha_config).post(save_ha_config))
        .route(
            "/{name}/storage-config",
            get(get_storage_config).post(save_storage_config),
        )
        .route(
            "/{name}/moderation-config",
            get(get_moderation_config).post(save_moderation_config),
        )
        .route(
            "/{name}/playground-config",
            get(get_playground_config).post(save_playground_config),
        )
        .route(
            "/{name}/playground-schemes",
            get(get_playground_schemes).post(save_playground_schemes),
        )
        .route(
            "/{name}/playground-public-config",
            get(get_playground_public_config),
        )
        .route(
            "/{name}/marketplace-models",
            get(get_marketplace_models).post(save_marketplace_models),
        )
        .route("/{name}/test-connection", post(test_tos_connection))
        .route("/{name}/api-logs", get(get_plugin_api_logs));

    #[cfg(feature = "plugin_volcengine_enhance")]
    {
        r = r
            .route(
                "/{name}/volcengine-enhance-config",
                get(get_volcengine_enhance_config).post(save_volcengine_enhance_config),
            )
            .route(
                "/{name}/test-volcengine-connection",
                post(test_volcengine_connection),
            )
            .route("/{name}/enhance-logs", get(get_volcengine_enhance_logs));
    }

    r
}

/// 开源白名单：playground / docs_api / model_marketplace / site_portal / site_icons / high_availability_channel
/// 其余商业插件由 feature 门控；未知插件仅在商业版放行。
fn is_plugin_compiled(name: &str) -> bool {
    match name {
        "site_icons" => cfg!(feature = "plugin_site_icons"),
        "site_portal" => cfg!(feature = "plugin_site_portal"),
        "team_marketing" => cfg!(feature = "commercial_plugins"),
        "happyhorse_router" => cfg!(feature = "plugin_happyhorse"),
        "volcengine_ark_monitor" => cfg!(feature = "commercial_plugins"),
        "volcengine_enhance" => cfg!(feature = "plugin_volcengine_enhance"),
        "asset_manager" => cfg!(feature = "commercial_plugins"),
        "asset_manager_intl" => cfg!(feature = "commercial_plugins"),
        _ => true,
    }
}

/// 管理员：获取所有插件列表
async fn list_plugins(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    let role: String =
        sqlx::query_scalar(&state.db.format_query("SELECT role FROM users WHERE id = ?"))
            .bind(&claims.sub)
            .fetch_one(&state.db.pool)
            .await?;
    if role != "admin" {
        return Err(AppError::Forbidden("需要管理员权限".to_string()));
    }

    let mut plugins: Vec<Plugin> = sqlx::query_as(
        &state
            .db
            .format_query("SELECT * FROM plugins ORDER BY id ASC"),
    )
    .fetch_all(&state.db.pool)
    .await?;

    // 动态过滤掉当前未编译（被物理剥离）的插件
    plugins.retain(|p| is_plugin_compiled(&p.name));

    Ok(Json(json!({ "plugins": plugins })))
}

/// 公开接口：无需认证即可获取活跃插件列表（供前端菜单渲染）
pub async fn get_active_plugins_public(
    State(state): State<Arc<AppState>>,
) -> AppResult<Json<serde_json::Value>> {
    let mut plugins: Vec<Plugin> = sqlx::query_as(
        &state
            .db
            .format_query("SELECT * FROM plugins WHERE is_enabled = 1"),
    )
    .fetch_all(&state.db.pool)
    .await?;

    // 动态过滤掉当前未编译（被物理剥离）的插件
    plugins.retain(|p| is_plugin_compiled(&p.name));

    let mut enhanced_plugins = Vec::new();
    for plugin in plugins {
        let mut p_json = serde_json::to_value(&plugin).unwrap_or(serde_json::Value::Null);
        if plugin.name == "asset_manager" || plugin.name == "asset_manager_intl" {
            let config_val: Option<String> = sqlx::query_scalar(
                &state.db.format_query("SELECT config_value FROM plugin_configs WHERE plugin_name = ? AND config_key = 'show_in_playground_prompt'")
            )
            .bind(&plugin.name)
            .fetch_optional(&state.db.pool)
            .await?;
            let show = config_val.unwrap_or_else(|| "false".to_string()) == "true";
            if let Some(obj) = p_json.as_object_mut() {
                obj.insert("show_in_playground_prompt".to_string(), json!(show));
            }
        }
        if plugin.name == "model_marketplace" || plugin.name == "docs_api" {
            let config_val: Option<String> = sqlx::query_scalar(
                &state.db.format_query("SELECT config_value FROM plugin_configs WHERE plugin_name = ? AND config_key = 'mp_allow_guest'")
            )
            .bind(&plugin.name)
            .fetch_optional(&state.db.pool)
            .await?;
            let allow_guest = config_val.unwrap_or_else(|| "false".to_string()) == "true";
            if let Some(obj) = p_json.as_object_mut() {
                obj.insert("mp_allow_guest".to_string(), json!(allow_guest));
            }
        }
        enhanced_plugins.push(p_json);
    }

    Ok(Json(json!({ "active_plugins": enhanced_plugins })))
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
    let role: String =
        sqlx::query_scalar(&state.db.format_query("SELECT role FROM users WHERE id = ?"))
            .bind(&claims.sub)
            .fetch_one(&state.db.pool)
            .await?;
    if role != "admin" {
        return Err(AppError::Forbidden("需要管理员权限".to_string()));
    }

    sqlx::query(&state.db.format_query(
        "UPDATE plugins SET is_enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE name = ?",
    ))
    .bind(payload.is_enabled)
    .bind(&name)
    .execute(&state.db.pool)
    .await?;

    Ok(Json(json!({ "message": "ok" })))
}

#[derive(Deserialize)]
pub struct ConfigRequest {
    pub allowed_levels: Option<String>, // 可选：仅更新开放等级时传入
    pub level_quotas: Option<HashMap<String, i64>>, // 每个等级的存储配额(MB)
    pub default_quota: Option<i64>,     // 默认存储配额(MB)
    pub level_max_folders: Option<HashMap<String, i64>>, // 每个等级的文件夹数量上限
    pub default_max_folders: Option<i64>, // 默认文件夹数量上限
    pub level_max_files_per_folder: Option<HashMap<String, i64>>, // 每个等级的每文件夹文件上限
    pub default_max_files_per_folder: Option<i64>, // 默认每文件夹文件上限
    pub level_api_enabled: Option<HashMap<String, bool>>, // 每个等级的 API 接口开放状态
    pub default_api_enabled: Option<bool>, // 默认 API 接口开放状态
    pub api_access_mode: Option<String>, // level | user
    pub api_user_mode: Option<String>,  // include | exclude
    pub api_user_ids: Option<Vec<String>>, // 按用户设置时的用户 ID 列表
    pub level_max_projects: Option<HashMap<String, i64>>, // 每个等级的项目数量上限
    pub default_max_projects: Option<i64>, // 默认项目数量上限
    pub level_max_assets: Option<HashMap<String, i64>>, // 每个等级的素材数量上限
    pub default_max_assets: Option<i64>, // 默认素材数量上限
    pub show_in_playground_prompt: Option<bool>, // 体验中心提示词输入窗口加载显示
    pub docs_api_allow_guest: Option<bool>, // 文档API是否允许免登录访问
}

/// 判断用户是否允许调用素材 API（纯逻辑，便于单测）
/// - mode=level：按等级开关，缺省回落到 default_api_enabled（默认 false，需显式开启）
/// - mode=user：include=仅列表内可调用；exclude=列表外可调用
/// 注意：调用方须先校验插件 enabled + allowed_levels，本函数只做 API 细分闸
pub fn is_asset_api_enabled(
    configs: &HashMap<String, String>,
    user_id: &str,
    user_group: &str,
    level_id: Option<i64>,
) -> bool {
    let mode = configs
        .get("api_access_mode")
        .map(|s| s.as_str())
        .unwrap_or("level");

    if mode == "user" {
        let ids: Vec<String> = configs
            .get("api_user_ids")
            .and_then(|s| serde_json::from_str(s).ok())
            .unwrap_or_default();
        let in_list = ids.iter().any(|id| id == user_id);
        let exclude = configs
            .get("api_user_mode")
            .map(|s| s.as_str())
            .unwrap_or("include")
            == "exclude";
        return if exclude { !in_list } else { in_list };
    }

    let default_enabled = configs
        .get("api_enabled")
        .map(|v| v == "true")
        .unwrap_or(false);
    configs
        .get(&format!("api_enabled_{}", user_group))
        .or_else(|| level_id.and_then(|id| configs.get(&format!("api_enabled_{}", id))))
        .map(|v| v.as_str() == "true")
        .unwrap_or(default_enabled)
}

/// 管理员：配置插件的开放等级
async fn update_plugin_config(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    Extension(claims): Extension<auth::Claims>,
    Json(payload): Json<ConfigRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let role: String =
        sqlx::query_scalar(&state.db.format_query("SELECT role FROM users WHERE id = ?"))
            .bind(&claims.sub)
            .fetch_one(&state.db.pool)
            .await?;
    if role != "admin" {
        return Err(AppError::Forbidden("需要管理员权限".to_string()));
    }

    if let Some(ref allowed) = payload.allowed_levels {
        sqlx::query(&state.db.format_query(
            "UPDATE plugins SET allowed_levels = ?, updated_at = CURRENT_TIMESTAMP WHERE name = ?",
        ))
        .bind(allowed)
        .bind(&name)
        .execute(&state.db.pool)
        .await?;
    }

    // 保存每个等级的存储配额
    if let Some(quotas) = &payload.level_quotas {
        for (level_key, quota_mb) in quotas {
            let config_key = format!("quota_{}", level_key);
            upsert_config(&state, &name, &config_key, &quota_mb.to_string()).await?;
        }
    }

    // 保存默认存储配额
    if let Some(dq) = payload.default_quota {
        upsert_config(&state, &name, "default_quota", &dq.to_string()).await?;
    }

    // 保存每个等级的文件夹数量上限
    if let Some(ref level_mf) = payload.level_max_folders {
        for (level_key, val) in level_mf {
            let config_key = format!("max_folders_{}", level_key);
            upsert_config(&state, &name, &config_key, &val.to_string()).await?;
        }
    }

    // 保存默认文件夹数量上限
    if let Some(dmf) = payload.default_max_folders {
        upsert_config(&state, &name, "max_folders", &dmf.to_string()).await?;
    }

    // 保存每个等级的每文件夹文件上限
    if let Some(ref level_mfpf) = payload.level_max_files_per_folder {
        for (level_key, val) in level_mfpf {
            let config_key = format!("max_files_{}", level_key);
            upsert_config(&state, &name, &config_key, &val.to_string()).await?;
        }
    }

    // 保存默认每文件夹文件上限
    if let Some(dmfpf) = payload.default_max_files_per_folder {
        upsert_config(&state, &name, "max_files_per_folder", &dmfpf.to_string()).await?;
    }

    // 保存每个等级的 API 访问开关
    if let Some(ref level_api) = payload.level_api_enabled {
        for (level_key, val) in level_api {
            let config_key = format!("api_enabled_{}", level_key);
            upsert_config(
                &state,
                &name,
                &config_key,
                if *val { "true" } else { "false" },
            )
            .await?;
        }
    }

    // 保存默认 API 访问开关
    if let Some(dae) = payload.default_api_enabled {
        upsert_config(
            &state,
            &name,
            "api_enabled",
            if dae { "true" } else { "false" },
        )
        .await?;
    }

    // 保存 API 访问模式：按等级 / 按用户
    if let Some(ref mode) = payload.api_access_mode {
        let normalized = if mode == "user" { "user" } else { "level" };
        upsert_config(&state, &name, "api_access_mode", normalized).await?;
    }
    if let Some(ref user_mode) = payload.api_user_mode {
        let normalized = if user_mode == "exclude" {
            "exclude"
        } else {
            "include"
        };
        upsert_config(&state, &name, "api_user_mode", normalized).await?;
    }
    if let Some(ref user_ids) = payload.api_user_ids {
        let ids_json = serde_json::to_string(user_ids).unwrap_or_else(|_| "[]".to_string());
        upsert_config(&state, &name, "api_user_ids", &ids_json).await?;
    }

    // 保存每个等级的项目上限
    if let Some(ref level_mp) = payload.level_max_projects {
        for (level_key, val) in level_mp {
            let config_key = format!("max_projects_{}", level_key);
            upsert_config(&state, &name, &config_key, &val.to_string()).await?;
        }
    }

    if let Some(dmp) = payload.default_max_projects {
        upsert_config(&state, &name, "default_max_projects", &dmp.to_string()).await?;
    }

    // 保存每个等级的素材上限
    if let Some(ref level_ma) = payload.level_max_assets {
        for (level_key, val) in level_ma {
            let config_key = format!("max_assets_{}", level_key);
            upsert_config(&state, &name, &config_key, &val.to_string()).await?;
        }
    }

    if let Some(dma) = payload.default_max_assets {
        upsert_config(&state, &name, "default_max_assets", &dma.to_string()).await?;
    }

    if let Some(show) = payload.show_in_playground_prompt {
        upsert_config(
            &state,
            &name,
            "show_in_playground_prompt",
            if show { "true" } else { "false" },
        )
        .await?;
    }

    // 保存 docs_api 是否允许游客访问
    if let Some(allow_guest) = payload.docs_api_allow_guest {
        upsert_config(
            &state,
            &name,
            "mp_allow_guest",
            if allow_guest { "true" } else { "false" },
        )
        .await?;
    }

    Ok(Json(json!({ "message": "ok" })))
}

// ========== 存储配置 ==========

/// 辅助：从 DB 加载插件的所有 config
async fn load_plugin_configs(
    state: &AppState,
    plugin_name: &str,
) -> Result<HashMap<String, String>, sqlx::Error> {
    let rows: Vec<(String, String)> =
        sqlx::query_as(&state.db.format_query(
            "SELECT config_key, config_value FROM plugin_configs WHERE plugin_name = ?",
        ))
        .bind(plugin_name)
        .fetch_all(&state.db.pool)
        .await?;

    Ok(rows.into_iter().collect())
}

/// 公开版本：供其他模块调用
pub async fn load_plugin_configs_pub(
    state: &AppState,
    plugin_name: &str,
) -> Result<HashMap<String, String>, sqlx::Error> {
    load_plugin_configs(state, plugin_name).await
}

/// 辅助：保存 config（upsert）—— 改用数据库原生 ON CONFLICT DO UPDATE 确保原子性（修复 Issue 5）
pub async fn upsert_config(
    state: &AppState,
    plugin_name: &str,
    key: &str,
    value: &str,
) -> Result<(), sqlx::Error> {
    // PostgreSQL 使用 ON CONFLICT (plugin_name, config_key) DO UPDATE
    // SQLite 兑换成 INSERT OR REPLACE -- format_query 会处理占位符转换
    let sql = state.db.format_query(
        "INSERT INTO plugin_configs (plugin_name, config_key, config_value, updated_at) \
         VALUES (?, ?, ?, CURRENT_TIMESTAMP) \
         ON CONFLICT (plugin_name, config_key) DO UPDATE \
         SET config_value = EXCLUDED.config_value, updated_at = CURRENT_TIMESTAMP",
    );
    sqlx::query(&sql)
        .bind(plugin_name)
        .bind(key)
        .bind(value)
        .execute(&state.db.pool)
        .await?;
    Ok(())
}

/// 管理员：获取存储配置（secret_key 脱敏）
async fn get_storage_config(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    let role: String =
        sqlx::query_scalar(&state.db.format_query("SELECT role FROM users WHERE id = ?"))
            .bind(&claims.sub)
            .fetch_one(&state.db.pool)
            .await?;
    if role != "admin" {
        return Err(AppError::Forbidden("需要管理员权限".to_string()));
    }

    let configs = load_plugin_configs(&state, &name).await?;
    let global_config = crate::relay::tos_persist::load_system_tos_config(&state).await;

    // secret_key 脱敏
    let sk = configs.get("tos_secret_key").cloned().unwrap_or_default();
    let masked_sk = {
        let cc = sk.chars().count();
        if cc > 6 {
            let p: String = sk.chars().take(3).collect();
            let s: String = sk.chars().skip(cc - 3).collect();
            format!("{}****{}", p, s)
        } else if !sk.is_empty() {
            "******".to_string()
        } else {
            String::new()
        }
    };

    // 提取等级配额、限制和 API 开关
    let mut level_quotas = serde_json::Map::new();
    let mut level_max_folders = serde_json::Map::new();
    let mut level_max_files = serde_json::Map::new();
    let mut level_api_enabled = serde_json::Map::new();
    let mut level_max_projects = serde_json::Map::new();
    let mut level_max_assets = serde_json::Map::new();
    for (k, v) in &configs {
        if let Some(level_key) = k.strip_prefix("quota_") {
            let mb: i64 = v.parse().unwrap_or(100);
            level_quotas.insert(level_key.to_string(), serde_json::Value::Number(mb.into()));
        } else if let Some(level_key) = k.strip_prefix("max_folders_") {
            let val: i64 = v.parse().unwrap_or(20);
            level_max_folders.insert(level_key.to_string(), serde_json::Value::Number(val.into()));
        } else if let Some(level_key) = k.strip_prefix("max_files_") {
            let val: i64 = v.parse().unwrap_or(100);
            level_max_files.insert(level_key.to_string(), serde_json::Value::Number(val.into()));
        } else if let Some(level_key) = k.strip_prefix("api_enabled_") {
            let val = v == "true";
            level_api_enabled.insert(level_key.to_string(), serde_json::Value::Bool(val));
        } else if let Some(level_key) = k.strip_prefix("max_projects_") {
            let val: i64 = v.parse().unwrap_or(3);
            level_max_projects.insert(level_key.to_string(), serde_json::Value::Number(val.into()));
        } else if let Some(level_key) = k.strip_prefix("max_assets_") {
            let val: i64 = v.parse().unwrap_or(30);
            level_max_assets.insert(level_key.to_string(), serde_json::Value::Number(val.into()));
        }
    }

    // 提取全局默认配置
    let default_quota: i64 = configs
        .get("default_quota")
        .and_then(|v| v.parse().ok())
        .unwrap_or(100);
    let default_max_folders: i64 = configs
        .get("max_folders")
        .and_then(|v| v.parse().ok())
        .unwrap_or(20);
    let default_max_files_per_folder: i64 = configs
        .get("max_files_per_folder")
        .and_then(|v| v.parse().ok())
        .unwrap_or(100);
    let default_api_enabled: bool = configs
        .get("api_enabled")
        .map(|v| v == "true")
        .unwrap_or(false);
    let api_access_mode = configs
        .get("api_access_mode")
        .cloned()
        .unwrap_or_else(|| "level".to_string());
    let api_user_mode = configs
        .get("api_user_mode")
        .cloned()
        .unwrap_or_else(|| "include".to_string());
    let api_user_ids: Vec<String> = configs
        .get("api_user_ids")
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_default();
    let default_max_projects: i64 = configs
        .get("default_max_projects")
        .and_then(|v| v.parse().ok())
        .unwrap_or(3);
    let default_max_assets: i64 = configs
        .get("default_max_assets")
        .and_then(|v| v.parse().ok())
        .unwrap_or(30);
    let show_in_playground_prompt: bool = configs
        .get("show_in_playground_prompt")
        .map(|v| v == "true")
        .unwrap_or(false);
    let docs_api_allow_guest: bool = configs
        .get("mp_allow_guest")
        .map(|v| v == "true")
        .unwrap_or(false);

    // 解析已选用户的展示信息（uid/username/等级），便于管理端回显与开放状态提示
    let mut api_user_options: Vec<serde_json::Value> = Vec::new();
    if !api_user_ids.is_empty() {
        let placeholders = api_user_ids
            .iter()
            .map(|_| "?")
            .collect::<Vec<_>>()
            .join(",");
        let sql = state.db.format_query(&format!(
            "SELECT u.id, u.username, u.uid, u.user_group, ul.id, ul.name \
             FROM users u LEFT JOIN user_levels ul ON u.user_group = ul.group_key \
             WHERE u.id IN ({})",
            placeholders
        ));
        let mut q = sqlx::query_as::<
            _,
            (String, String, String, String, Option<i64>, Option<String>),
        >(&sql);
        for id in &api_user_ids {
            q = q.bind(id);
        }
        if let Ok(rows) = q.fetch_all(&state.db.pool).await {
            let mut map: HashMap<String, (String, String, String, Option<i64>, Option<String>)> =
                rows.into_iter()
                    .map(|(id, username, uid, user_group, level_id, level_name)| {
                        (id, (username, uid, user_group, level_id, level_name))
                    })
                    .collect();
            for id in &api_user_ids {
                if let Some((username, uid, user_group, level_id, level_name)) = map.remove(id) {
                    api_user_options.push(json!({
                        "user_id": id,
                        "username": username,
                        "uid": uid,
                        "user_group": user_group,
                        "level_id": level_id,
                        "level_name": level_name,
                    }));
                } else {
                    api_user_options.push(json!({
                        "user_id": id,
                        "username": id,
                        "uid": "",
                    }));
                }
            }
        }
    }

    Ok(Json(json!({
        "tos_access_key": configs.get("tos_access_key").cloned().unwrap_or_default(),
        "tos_secret_key": sk,
        "tos_secret_key_masked": masked_sk,
        "tos_endpoint": configs.get("tos_endpoint").cloned().unwrap_or_default(),
        "tos_region": configs.get("tos_region").cloned().unwrap_or_default(),
        "tos_bucket": configs.get("tos_bucket").cloned().unwrap_or_default(),
        "tos_path_prefix": configs.get("tos_path_prefix").cloned().unwrap_or_default(),
        "tos_custom_domain": configs.get("tos_custom_domain").cloned().unwrap_or_default(),
        "is_configured": !configs.get("tos_access_key").cloned().unwrap_or_default().is_empty() || global_config.is_some(),
        "global_configured": global_config.is_some(),
        "global_tos_bucket": global_config.as_ref().map(|c| c.bucket.clone()).unwrap_or_default(),
        "global_tos_endpoint": global_config.as_ref().map(|c| c.endpoint.clone()).unwrap_or_default(),
        "level_quotas": level_quotas,
        "default_quota": default_quota,
        "level_max_folders": level_max_folders,
        "default_max_folders": default_max_folders,
        "level_max_files_per_folder": level_max_files,
        "default_max_files_per_folder": default_max_files_per_folder,
        "level_api_enabled": level_api_enabled,
        "default_api_enabled": default_api_enabled,
        "api_access_mode": api_access_mode,
        "api_user_mode": api_user_mode,
        "api_user_ids": api_user_ids,
        "api_user_options": api_user_options,
        "level_max_projects": level_max_projects,
        "default_max_projects": default_max_projects,
        "level_max_assets": level_max_assets,
        "default_max_assets": default_max_assets,
        "show_in_playground_prompt": show_in_playground_prompt,
        "docs_api_allow_guest": docs_api_allow_guest,
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
    let role: String =
        sqlx::query_scalar(&state.db.format_query("SELECT role FROM users WHERE id = ?"))
            .bind(&claims.sub)
            .fetch_one(&state.db.pool)
            .await?;
    if role != "admin" {
        return Err(AppError::Forbidden("需要管理员权限".to_string()));
    }

    upsert_config(&state, &name, "tos_access_key", &payload.tos_access_key).await?;
    upsert_config(&state, &name, "tos_endpoint", &payload.tos_endpoint).await?;
    upsert_config(&state, &name, "tos_region", &payload.tos_region).await?;
    upsert_config(&state, &name, "tos_bucket", &payload.tos_bucket).await?;
    upsert_config(
        &state,
        &name,
        "tos_path_prefix",
        payload.tos_path_prefix.as_deref().unwrap_or(""),
    )
    .await?;
    upsert_config(
        &state,
        &name,
        "tos_custom_domain",
        payload.tos_custom_domain.as_deref().unwrap_or(""),
    )
    .await?;

    // secret_key 只在有值时更新
    if let Some(ref sk) = payload.tos_secret_key {
        if !sk.is_empty() && !sk.contains("****") {
            upsert_config(&state, &name, "tos_secret_key", sk).await?;
        }
    }

    Ok(Json(json!({ "message": "存储配置已保存" })))
}

#[derive(Deserialize)]
pub struct TestConnectionRequest {
    pub tos_access_key: Option<String>,
    pub tos_secret_key: Option<String>,
    pub tos_endpoint: Option<String>,
    pub tos_region: Option<String>,
    pub tos_bucket: Option<String>,
    pub tos_path_prefix: Option<String>,
    pub tos_custom_domain: Option<String>,
}

/// 管理员：测试 TOS 连接
async fn test_tos_connection(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    Extension(claims): Extension<auth::Claims>,
    Json(payload): Json<TestConnectionRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let role: String =
        sqlx::query_scalar(&state.db.format_query("SELECT role FROM users WHERE id = ?"))
            .bind(&claims.sub)
            .fetch_one(&state.db.pool)
            .await?;
    if role != "admin" {
        return Err(AppError::Forbidden("需要管理员权限".to_string()));
    }

    let mut configs = load_plugin_configs(&state, &name).await?;

    // 合并前端传入的临时字段进行测试
    if let Some(ak) = payload.tos_access_key {
        if !ak.is_empty() {
            configs.insert("tos_access_key".to_string(), ak);
        }
    }
    if let Some(sk) = payload.tos_secret_key {
        // 如果秘钥被修改了且不是掩码，则应用新秘钥进行测试
        if !sk.is_empty() && !sk.contains("****") {
            configs.insert("tos_secret_key".to_string(), sk);
        }
    }
    if let Some(ep) = payload.tos_endpoint {
        if !ep.is_empty() {
            configs.insert("tos_endpoint".to_string(), ep);
        }
    }
    if let Some(reg) = payload.tos_region {
        if !reg.is_empty() {
            configs.insert("tos_region".to_string(), reg);
        }
    }
    if let Some(bk) = payload.tos_bucket {
        if !bk.is_empty() {
            configs.insert("tos_bucket".to_string(), bk);
        }
    }
    if let Some(prefix) = payload.tos_path_prefix {
        configs.insert("tos_path_prefix".to_string(), prefix);
    }
    if let Some(domain) = payload.tos_custom_domain {
        configs.insert("tos_custom_domain".to_string(), domain);
    }

    let tos_config = if let Some(config) = TosConfig::from_map(&configs) {
        config
    } else {
        crate::relay::tos_persist::load_system_tos_config(&state)
            .await
            .ok_or_else(|| {
                AppError::BadRequest(
                    "系统存储配置未配置，请先在「站点设置 → 存储设置」中配置".to_string(),
                )
            })?
    };

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
    pub volc_group_id: Option<String>,
    pub volc_region: Option<String>,
    pub review_enabled: Option<bool>,
}

/// 管理员：获取审核配置
async fn get_moderation_config(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    let role: String =
        sqlx::query_scalar(&state.db.format_query("SELECT role FROM users WHERE id = ?"))
            .bind(&claims.sub)
            .fetch_one(&state.db.pool)
            .await?;
    if role != "admin" {
        return Err(AppError::Forbidden("需要管理员权限".to_string()));
    }

    let configs = load_plugin_configs(&state, &name).await?;

    let sk = configs.get("volc_secret_key").cloned().unwrap_or_default();
    let masked_sk = crate::models::channel::mask_secret(&sk);

    let review_enabled = configs
        .get("review_enabled")
        .map(|v| v == "true")
        .unwrap_or(false);

    let volc_region = configs
        .get("volc_region")
        .cloned()
        .unwrap_or_else(|| "cn-beijing".to_string());

    // 根据 region 生成审核请求基址（国内版 volcengineapi.com，国际版 byteplusapi.com）
    let is_international = volc_region.starts_with("ap-");
    let ark_api_host = if is_international {
        "open.byteplusapi.com"
    } else {
        "open.volcengineapi.com"
    };
    let review_api_url = format!(
        "https://{}/?Action=CreateAsset&Version=2024-01-01",
        ark_api_host
    );

    Ok(Json(json!({
        "volc_access_key": configs.get("volc_access_key").cloned().unwrap_or_default(),
        "volc_secret_key": sk,
        "volc_secret_key_masked": masked_sk,
        "volc_app_id": configs.get("volc_app_id").cloned().unwrap_or_default(),
        "volc_project_name": configs.get("volc_project_name").cloned().unwrap_or_else(|| "default".to_string()),
        "volc_group_id": configs.get("volc_group_id").cloned().unwrap_or_default(),
        "volc_region": volc_region,
        "review_api_url": review_api_url,
        "is_configured": !configs.get("volc_access_key").cloned().unwrap_or_default().is_empty(),
        "review_enabled": review_enabled,
    })))
}

/// 管理员：保存审核配置
async fn save_moderation_config(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    Extension(claims): Extension<auth::Claims>,
    Json(payload): Json<ModerationConfigRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let role: String =
        sqlx::query_scalar(&state.db.format_query("SELECT role FROM users WHERE id = ?"))
            .bind(&claims.sub)
            .fetch_one(&state.db.pool)
            .await?;
    if role != "admin" {
        return Err(AppError::Forbidden("需要管理员权限".to_string()));
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
        let pn_val = if pn.trim().is_empty() {
            "default"
        } else {
            pn.trim()
        };
        upsert_config(&state, &name, "volc_project_name", pn_val).await?;
    }

    // group_id
    if let Some(ref gid) = payload.volc_group_id {
        upsert_config(&state, &name, "volc_group_id", gid.trim()).await?;
    }

    // review_enabled 审核开关
    if let Some(re) = payload.review_enabled {
        upsert_config(
            &state,
            &name,
            "review_enabled",
            if re { "true" } else { "false" },
        )
        .await?;
    }

    // region
    if let Some(ref region) = payload.volc_region {
        let region_val = if region.trim().is_empty() {
            "cn-beijing"
        } else {
            region.trim()
        };
        upsert_config(&state, &name, "volc_region", region_val).await?;
    }

    Ok(Json(json!({ "message": "审核配置已保存" })))
}

#[derive(Debug, serde::Deserialize, serde::Serialize)]
struct HaConfigRequest {
    pub ha_max_retries: i64,
    pub ha_cooldown_429: i64,
    pub ha_cooldown_network: i64,
    pub ha_cooldown_auth: i64,
    pub ha_cooldown_404: i64,
    #[serde(default)]
    pub ha_meltdown_whitelist: Vec<String>,
}

async fn get_ha_config(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    let role: String =
        sqlx::query_scalar(&state.db.format_query("SELECT role FROM users WHERE id = ?"))
            .bind(&claims.sub)
            .fetch_one(&state.db.pool)
            .await?;
    if role != "admin" {
        return Err(AppError::Forbidden("需要管理员权限".to_string()));
    }

    let configs = load_plugin_configs(&state, &name).await?;
    let ha_max_retries = configs
        .get("ha_max_retries")
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(3);
    let ha_cooldown_429 = configs
        .get("ha_cooldown_429")
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(60);
    let ha_cooldown_network = configs
        .get("ha_cooldown_network")
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(300);
    let ha_cooldown_auth = configs
        .get("ha_cooldown_auth")
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(1800);
    let ha_cooldown_404 = configs
        .get("ha_cooldown_404")
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(3);
    let ha_meltdown_whitelist: Vec<String> = configs
        .get("ha_meltdown_whitelist")
        .and_then(|v| serde_json::from_str(v).ok())
        .unwrap_or_default();

    Ok(Json(json!({
        "ha_max_retries": ha_max_retries,
        "ha_cooldown_429": ha_cooldown_429,
        "ha_cooldown_network": ha_cooldown_network,
        "ha_cooldown_auth": ha_cooldown_auth,
        "ha_cooldown_404": ha_cooldown_404,
        "ha_meltdown_whitelist": ha_meltdown_whitelist,
    })))
}

async fn save_ha_config(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    Extension(claims): Extension<auth::Claims>,
    Json(payload): Json<HaConfigRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let role: String =
        sqlx::query_scalar(&state.db.format_query("SELECT role FROM users WHERE id = ?"))
            .bind(&claims.sub)
            .fetch_one(&state.db.pool)
            .await?;
    if role != "admin" {
        return Err(AppError::Forbidden("需要管理员权限".to_string()));
    }

    // Issue 6 修复：参数合法性校验
    if payload.ha_max_retries < 1 {
        return Err(AppError::BadRequest("最大备用切换次数至少为 1".to_string()));
    }
    if payload.ha_cooldown_429 < 0
        || payload.ha_cooldown_network < 0
        || payload.ha_cooldown_auth < 0
        || payload.ha_cooldown_404 < 0
    {
        return Err(AppError::BadRequest(
            "燔断冷却时间不能为负数，请输入 0 或更大的整数".to_string(),
        ));
    }

    upsert_config(
        &state,
        &name,
        "ha_max_retries",
        &payload.ha_max_retries.to_string(),
    )
    .await?;
    upsert_config(
        &state,
        &name,
        "ha_cooldown_429",
        &payload.ha_cooldown_429.to_string(),
    )
    .await?;
    upsert_config(
        &state,
        &name,
        "ha_cooldown_network",
        &payload.ha_cooldown_network.to_string(),
    )
    .await?;
    upsert_config(
        &state,
        &name,
        "ha_cooldown_auth",
        &payload.ha_cooldown_auth.to_string(),
    )
    .await?;
    upsert_config(
        &state,
        &name,
        "ha_cooldown_404",
        &payload.ha_cooldown_404.to_string(),
    )
    .await?;
    let whitelist_json =
        serde_json::to_string(&payload.ha_meltdown_whitelist).unwrap_or_else(|_| "[]".to_string());
    upsert_config(&state, &name, "ha_meltdown_whitelist", &whitelist_json).await?;

    // 重新加载配置，确保内存中及时生效
    state.load_ha_configs().await?;

    Ok(Json(json!({ "message": "高可用配置已保存并重载" })))
}

/// 公开辅助：加载插件的 Volcengine 配置（供 assets 模块调用）
pub async fn get_volc_config(
    state: &AppState,
    plugin_name: &str,
) -> Option<crate::services::volcengine::VolcConfig> {
    let configs = load_plugin_configs(state, plugin_name).await.ok()?;
    crate::services::volcengine::VolcConfig::from_map(&configs)
}

pub async fn get_tos_config(state: &AppState, plugin_name: &str) -> Option<TosConfig> {
    if let Ok(configs) = load_plugin_configs(state, plugin_name).await {
        if let Some(config) = TosConfig::from_map(&configs) {
            return Some(config);
        }
    }
    crate::relay::tos_persist::load_system_tos_config(state).await
}

pub async fn notify_marketplace_data_changed(state: &Arc<AppState>) {
    get_marketplace_cache().write().await.invalidate();

    #[cfg(feature = "plugin_site_portal")]
    {
        let state_clone = state.clone();
        tokio::spawn(async move {
            if let Err(e) =
                crate::api::site_portal::auto_generate_portal_models_static(&state_clone).await
            {
                tracing::error!("Failed to auto generate portal static models: {:?}", e);
            }
        });
    }
}

#[derive(serde::Serialize, sqlx::FromRow)]
pub struct PluginApiLog {
    pub id: i64,
    pub user_id: String,
    pub plugin_name: String,
    pub api_endpoint: String,
    pub request_payload: Option<String>,
    pub response_payload: Option<String>,
    pub status_code: Option<i32>,
    pub source: String,
    pub created_at: DbTs,
}

#[derive(serde::Deserialize)]
pub struct LogQuery {
    pub page: Option<i64>,
    pub page_size: Option<i64>,
    pub source: Option<String>,
    pub keyword: Option<String>,
}

/// 管理员：获取插件 API 日志
async fn get_plugin_api_logs(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    axum::extract::Query(query): axum::extract::Query<LogQuery>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    let role: String =
        sqlx::query_scalar(&state.db.format_query("SELECT role FROM users WHERE id = ?"))
            .bind(&claims.sub)
            .fetch_optional(&state.db.pool)
            .await?
            .unwrap_or_default();
    if role != "admin" {
        return Err(AppError::Forbidden("需要管理员权限".to_string()));
    }

    let page = query.page.unwrap_or(1).max(1);
    let page_size = query.page_size.unwrap_or(20).clamp(1, 100);
    let offset = (page - 1) * page_size;

    // 动态拼接过滤条件
    let mut where_clause = "WHERE plugin_name = $1".to_string();
    let mut param_idx = 2u32;

    let source_filter = query.source.as_deref().unwrap_or("").to_string();
    if !source_filter.is_empty() {
        where_clause.push_str(&format!(" AND source = ${}", param_idx));
        param_idx += 1;
    }

    let keyword = query.keyword.as_deref().unwrap_or("").to_string();
    if !keyword.is_empty() {
        where_clause.push_str(&format!(" AND (api_endpoint ILIKE ${p} OR user_id ILIKE ${p} OR EXISTS (SELECT 1 FROM users u WHERE u.id = plugin_api_logs.user_id AND u.uid ILIKE ${p}))", p = param_idx));
        param_idx += 1;
    }

    // 构造 count 查询
    let count_sql = format!("SELECT COUNT(*) FROM plugin_api_logs {}", where_clause);
    let mut count_q = sqlx::query_scalar::<_, i64>(&count_sql).bind(&name);
    if !source_filter.is_empty() {
        count_q = count_q.bind(&source_filter);
    }
    if !keyword.is_empty() {
        count_q = count_q.bind(format!("%{}%", keyword));
    }
    let total: i64 = count_q.fetch_one(&state.db.pool).await?;

    // 构造数据查询
    let data_sql = format!(
        "SELECT * FROM plugin_api_logs {} ORDER BY id DESC LIMIT ${} OFFSET ${}",
        where_clause,
        param_idx,
        param_idx + 1
    );
    let mut data_q = sqlx::query_as::<_, PluginApiLog>(&data_sql).bind(&name);
    if !source_filter.is_empty() {
        data_q = data_q.bind(&source_filter);
    }
    if !keyword.is_empty() {
        data_q = data_q.bind(format!("%{}%", keyword));
    }
    let logs: Vec<PluginApiLog> = data_q
        .bind(page_size)
        .bind(offset)
        .fetch_all(&state.db.pool)
        .await?;

    // 构建 user_id -> uid/username 映射
    let user_ids: Vec<String> = logs
        .iter()
        .map(|a| a.user_id.clone())
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .collect();
    let mut uid_map = serde_json::Map::new();
    for uid_chunk in user_ids.chunks(50) {
        let placeholders = uid_chunk.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = state.db.format_query(&format!(
            "SELECT id, uid, username FROM users WHERE id IN ({})",
            placeholders
        ));
        let mut q = sqlx::query_as::<_, (String, String, String)>(&sql);
        for id in uid_chunk {
            q = q.bind(id);
        }
        if let Ok(rows) = q.fetch_all(&state.db.pool).await {
            for (id, uid, username) in rows {
                uid_map.insert(id, serde_json::json!({"uid": uid, "username": username}));
            }
        }
    }

    Ok(Json(serde_json::json!({
        "logs": logs,
        "total": total,
        "page": page,
        "page_size": page_size,
        "uid_map": serde_json::Value::Object(uid_map)
    })))
}

// ========== 体验中心配置 (Playground) ==========

/// 系统内置体验方案默认种子（仅当 DB 中无自定义方案时用作初始化）
fn get_default_schemes() -> Vec<serde_json::Value> {
    vec![
        json!({
            "id": "seedance2.0",
            "name": "Seedance 2.0 方案",
            "type": "video",
            "is_system": true,
            "description": "支持多种分辨率和时长，适合高品质视频生成",
            "params": [
                {"key": "ratio", "label": "画面比例", "type": "radio", "data_type": "string", "options": ["21:9","16:9","4:3","1:1","3:4","9:16","adaptive"], "default": "16:9"},
                {"key": "resolution", "label": "输出分辨率", "type": "select", "data_type": "string", "options": ["480p","720p","1080p","4K"], "default": "1080p"},
                {"key": "duration", "label": "视频时长", "type": "slider", "data_type": "integer", "min": 1, "max": 15, "step": 1, "default": 5, "unit": "秒"},
                {"key": "watermark", "label": "水印", "type": "switch", "data_type": "boolean", "default": false},
                {"key": "return_last_frame", "label": "返回最后一帧", "type": "switch", "data_type": "boolean", "default": false},
                {"key": "generate_audio", "label": "生成音频", "type": "switch", "data_type": "boolean", "default": false},
                {"key": "web_search", "label": "联网搜索", "type": "switch", "data_type": "boolean", "default": false}
            ]
        }),
        json!({
            "id": "seedream_5_0",
            "name": "Seedream 5.0 图片生成方案",
            "type": "image",
            "is_system": true,
            "description": "高质量 AI 图片生成，支持 doubao-seedream-5.0-lite 模型",
            "params": [
                {"key": "size", "label": "图片尺寸", "type": "radio", "options": ["2048x2048", "3072x3072", "1728x2304", "2592x3456", "2304x1728", "3456x2592", "2848x1600", "4096x2304", "1600x2848", "2304x4096", "2496x1664", "3744x2496", "1664x2496", "2496x3744", "3136x1344", "4704x2016", "2K", "3K", "4K"], "default": "2048x2048"},
                {"key": "n", "label": "生成数量", "type": "select", "options": [1,2,4], "default": 1, "unit": "张"},
                {"key": "watermark", "label": "水印", "type": "switch", "default": false},
                {"key": "output_format", "label": "输出格式", "type": "select", "options": ["png","jpeg"], "default": "jpeg"},
                {"key": "web_search", "label": "联网搜索", "type": "switch", "default": false}
            ]
        }),
        json!({
            "id": "seedream_4_5",
            "name": "Seedream 4.5 图片生成方案",
            "type": "image",
            "is_system": true,
            "description": "高质量 AI 图片生成，支持 doubao-seedream-4.5 模型",
            "params": [
                {"key": "size", "label": "图片尺寸", "type": "radio", "options": ["2048x2048", "4096x4096", "2304x1728", "1728x2304", "3520x4704", "2304x1728", "4704x3520", "2848x1600", "5504x3040", "1600x2848", "3040x5504", "2496x1664", "4992x3328", "1664x2496", "3328x4992", "3136x1344", "6240x2656", "2K", "4K"], "default": "2048x2048"},
                {"key": "n", "label": "生成数量", "type": "select", "options": [1,2,4], "default": 1, "unit": "张"},
                {"key": "watermark", "label": "水印", "type": "switch", "default": false}
            ]
        }),
        json!({
            "id": "seedream_4_0",
            "name": "Seedream 4.0 图片生成方案",
            "type": "image",
            "is_system": true,
            "description": "高质量 AI 图片生成，支持 doubao-seedream-4.0 模型",
            "params": [
                {"key": "size", "label": "图片尺寸", "type": "radio", "options": ["1024x1024", "2048x2048", "4096x4096", "864x1152", "1728x2304", "3520x4704", "1152x864", "2304x1728", "4704x3520", "1312x736", "2848x1600", "5504x3040", "736x1312", "1600x2848", "3040x5504", "832x1248", "1664x2496", "3328x4992", "1248x832", "2496x1664", "4992x3328", "1568x672", "3136x1344", "6240x2656", "1K", "2K", "4K"], "default": "1024x1024"},
                {"key": "n", "label": "生成数量", "type": "select", "options": [1,2,4], "default": 1, "unit": "张"},
                {"key": "watermark", "label": "水印", "type": "switch", "default": false}
            ]
        }),
        json!({
            "id": "seedance1.5pro",
            "name": "Seedance 1.5 Pro 方案",
            "type": "video",
            "is_system": true,
            "description": "支持文生视频和图生视频，可生成音频，适用于 doubao-seedance-1-0-pro 系列模型",
            "params": [
                {"key": "ratio", "label": "画面比例", "type": "radio", "options": ["21:9","16:9","4:3","1:1","3:4","9:16","adaptive"], "default": "16:9"},
                {"key": "duration", "label": "视频时长", "type": "select", "options": [-1,5,10,12], "default": 5, "unit": "秒", "hint": "-1 表示由模型智能选择"},
                {"key": "resolution", "label": "输出分辨率", "type": "select", "options": ["480p","720p","1080p"], "default": "720p"},
                {"key": "seed", "label": "随机种子", "type": "number", "default": -1, "min": -1, "max": 4294967295_i64, "hint": "-1 表示随机"},
                {"key": "generate_audio", "label": "生成音频", "type": "switch", "default": true},
                {"key": "camera_fixed", "label": "固定摄像头", "type": "switch", "default": false},
                {"key": "return_last_frame", "label": "返回尾帧图像", "type": "switch", "default": false},
                {"key": "watermark", "label": "水印", "type": "switch", "default": false}
            ]
        }),
        json!({
            "id": "gpt_image_2",
            "name": "GPT Image 官方图片生成方案",
            "type": "image",
            "is_system": true,
            "description": "OpenAI 最新旗舰图像生成模型，支持任意分辨率（WIDTHxHEIGHT）最高达 4K、背景控制（background）、内容审核等级调整（moderation）等全新特性",
            "params": [
                {"key": "size", "label": "图片尺寸", "type": "radio", "options": ["auto", "1024x1024", "1536x1024", "1024x1536", "1536x864", "864x1536", "2560x1440", "1440x2560", "3840x2160", "2160x3840"], "default": "1024x1024", "hint": "支持自定义 WIDTHxHEIGHT 分辨率（如1536x864），宽高需为16的倍数且比例在1:3至3:1之间，最大支持4K"},
                {"key": "quality", "label": "图片质量", "type": "select", "options": ["auto", "low", "medium", "high"], "default": "auto", "hint": "auto为自适应，high为最高画质，low为低画质，medium为标准画质"},
                {"key": "output_format", "label": "输出格式", "type": "select", "options": ["png", "jpeg", "webp"], "default": "png"},
                {"key": "output_compression", "label": "输出压缩率", "type": "slider", "default": 100, "min": 0, "max": 100, "step": 1, "hint": "仅在选择 webp 或 jpeg 格式时生效，默认 100 表示无损或最高画质"},
                {"key": "background", "label": "背景控制", "type": "select", "options": ["auto", "opaque"], "default": "auto", "hint": "控制背景属性，auto为自适应，opaque为不透明"},
                {"key": "moderation", "label": "内容审核等级", "type": "select", "options": ["auto", "low"], "default": "auto", "hint": "设置为 low 可以降低内容审核过滤的限制度"},
                {"key": "n", "label": "生成数量", "type": "select", "options": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], "default": 1, "unit": "张"}
            ]
        }),
        json!({
            "id": "gemini_flash_image",
            "name": "Gemini 3.1 Flash 图片生成方案",
            "type": "image",
            "is_system": true,
            "description": "Google Gemini 原生多模态图像生成，支持文生图和图生图(最多14张参考图)，最高 4K 分辨率，支持极端宽高比和 Google 搜索增强",
            "params": [
                {"key": "size", "label": "画面比例", "type": "radio", "options": ["1:1","3:2","2:3","4:3","3:4","16:9","9:16","5:4","4:5","21:9","1:4","4:1","1:8","8:1"], "default": "1:1"},
                {"key": "resolution", "label": "输出分辨率", "type": "select", "options": ["1k","2k","4k"], "default": "1k"},
                {"key": "n", "label": "生成数量", "type": "select", "options": [1,2,3,4], "default": 1, "unit": "张"},
                {"key": "google_search", "label": "搜索增强", "type": "switch", "default": false, "description": "搜索网络文字信息辅助生成图片"},
                {"key": "google_image_search", "label": "图片搜索增强", "type": "switch", "default": false, "description": "搜索参考图片辅助生成，适合需要视觉参考的场景"}
            ]
        }),
        json!({
            "id": "dashscope_image",
            "name": "阿里云 (DashScope) 图片生成方案",
            "type": "image",
            "is_system": true,
            "description": "阿里云通义万相系列原生/代理通道配置，支持多尺寸、多样式图像生成及提示词扩写功能",
            "params": [
                {"key": "size", "label": "图片尺寸", "type": "radio", "options": ["1280*1280", "1104*1472", "1472*1104", "960*1696", "1696*960", "2048*2048"], "default": "1280*1280"},
                {"key": "n", "label": "生成数量", "type": "select", "options": [1,2,3,4], "default": 1, "unit": "张"},
                {"key": "watermark", "label": "水印", "type": "switch", "default": false},
                {"key": "prompt_extend", "label": "提示词扩写", "type": "switch", "default": false, "description": "由模型自动丰富提示词细节以获得更好的生成效果"},
            ]
        }),
        json!({
            "id": "dashscope_video",
            "name": "阿里云 (DashScope) 视频生成方案",
            "type": "video",
            "is_system": true,
            "description": "阿里云通义万相视频生成配置，支持多种画面尺寸，适用于视频生成模型",
            "params": [
                {"key": "ratio", "label": "画面尺寸", "type": "radio", "options": ["1:1", "16:9", "9:16", "4:3", "3:4"], "default": "1:1"},
                {"key": "resolution", "label": "输出分辨率", "type": "select", "options": ["720P","1080P"], "default": "720P"},
                {"key": "duration", "label": "视频时长", "type": "select", "options": [3, 5, 10, 15], "default": 5, "unit": "秒"},
                {"key": "prompt_extend", "label": "提示词扩写", "type": "switch", "default": false},
                {"key": "watermark", "label": "水印", "type": "switch", "default": false}
            ]
        }),
        json!({
            "id": "kling_image",
            "name": "可灵 (Kling) 图片生成方案",
            "type": "image",
            "is_system": true,
            "description": "快手可灵原生/代理图像生成配置，支持多比例及参考图",
            "params": [
                {"key": "ratio", "label": "画面比例", "type": "radio", "options": ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "21:9"], "default": "1:1"},
                {"key": "resolution", "label": "输出分辨率", "type": "select", "options": ["1k","2k","4k"], "default": "1k"},
                {"key": "n", "label": "生成数量", "type": "select", "options": [1,2,3,4,5,6,7,8,9], "default": 1, "unit": "张"},
            ]
        }),
        json!({
            "id": "kling_video",
            "name": "可灵 (Kling) 视频生成方案",
            "type": "video",
            "is_system": true,
            "description": "快手可灵原生/代理视频生成配置，支持文生视频与图生视频，包含多种模式、时长及音频控制",
            "params": [
                {"key": "ratio", "label": "画面比例", "type": "radio", "options": ["16:9","9:16","1:1"], "default": "16:9", "hint": "文生视频时生效"},
                {"key": "duration", "label": "视频时长", "type": "select", "options": [3, 5, 10, 15], "default": 5, "unit": "秒"},
                {"key": "mode", "label": "生成模式", "type": "select", "options": ["std", "pro", "4k"], "default": "std", "hint": "std:标准 pro:专业 4k:超高清 (不同模式计费可能不同)"},
                {"key": "sound", "label": "音频效果", "type": "select", "options": ["off", "on"], "default": "off", "description": "是否同时生成匹配画面的音频"},
            ]
        }),
        // ── 聊天对话方案 ──
        json!({
            "id": "chat_standard",
            "name": "标准对话方案",
            "type": "chat",
            "is_system": true,
            "description": "通用 AI 对话方案，支持温度、最大回复长度、流式输出等核心参数，适用于所有聊天类模型",
            "params": [
                {"key": "temperature", "label": "创意度", "type": "slider", "default": 0.7, "min": 0.0, "max": 2.0, "step": 0.1, "hint": "值越高回答越有创意，越低越精确"},
                {"key": "max_tokens", "label": "最大回复长度", "type": "select", "options": [256, 512, 1024, 2048, 4096, 8192], "default": 4096, "unit": "tokens"},
                {"key": "stream", "label": "流式输出", "type": "switch", "default": true, "hint": "逐字输出回答，提升体验"},
                {"key": "top_p", "label": "核采样", "type": "slider", "default": 1.0, "min": 0.0, "max": 1.0, "step": 0.05}
            ]
        }),
        json!({
            "id": "chat_creative",
            "name": "创意写作方案",
            "type": "chat",
            "is_system": true,
            "description": "适用于创意写作、故事生成等场景，预设较高创意度和更长回复",
            "params": [
                {"key": "temperature", "label": "创意度", "type": "slider", "default": 1.2, "min": 0.0, "max": 2.0, "step": 0.1},
                {"key": "max_tokens", "label": "最大回复长度", "type": "select", "options": [1024, 2048, 4096, 8192, 16384], "default": 8192, "unit": "tokens"},
                {"key": "stream", "label": "流式输出", "type": "switch", "default": true},
                {"key": "top_p", "label": "核采样", "type": "slider", "default": 0.95, "min": 0.0, "max": 1.0, "step": 0.05}
            ]
        }),
        json!({
            "id": "chat_precise",
            "name": "精准问答方案",
            "type": "chat",
            "is_system": true,
            "description": "适用于代码生成、数据分析、精确问答等场景，预设低创意度确保回答准确",
            "params": [
                {"key": "temperature", "label": "创意度", "type": "slider", "default": 0.1, "min": 0.0, "max": 2.0, "step": 0.1},
                {"key": "max_tokens", "label": "最大回复长度", "type": "select", "options": [256, 512, 1024, 2048, 4096], "default": 2048, "unit": "tokens"},
                {"key": "stream", "label": "流式输出", "type": "switch", "default": true},
                {"key": "top_p", "label": "核采样", "type": "slider", "default": 1.0, "min": 0.0, "max": 1.0, "step": 0.05}
            ]
        }),
        json!({
            "id": "tencent_image",
            "name": "腾讯云 (AIGC) 图片生成方案",
            "type": "image",
            "is_system": true,
            "description": "基于腾讯云点播/媒体处理 AIGC 图像生成服务，支持多模型和自定义输出配置 (AigcImageOutputConfig)",
            "params": [
                {"key": "size", "label": "画面比例", "type": "radio", "options": ["1024x1024", "2048x2048", "2304x1728", "2496x1664", "2560x1440", "3024x1296", "4096x4096", "4693x3520", "4992x3328", "5404x3040", "6197x2656"], "default": "1024x1024"},
                {"key": "force_single", "label": "强制单张生成", "type": "switch", "default": false, "hint": "强制生成单张图片"},
            ]
        }),
        json!({
            "id": "tencent_video",
            "name": "腾讯云 (AIGC) 视频生成方案",
            "type": "video",
            "is_system": true,
            "description": "基于腾讯云点播/媒体处理 AIGC 视频生成服务，支持可灵、Vidu等模型和自定义输出配置 (AigcVideoOutputConfig)",
            "params": [
                {"key": "ratio", "label": "画面比例", "type": "radio", "options": ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9"], "default": "1:1"},
                {"key": "duration", "label": "视频时长", "type": "select", "options": [5, 10], "default": 5, "unit": "秒", "hint": "生成视频的目标时长"},
                {"key": "seed", "label": "随机种子", "type": "number", "default": -1, "min": -1, "max": 4294967295_i64, "hint": "-1 表示随机"},
            ]
        }),
    ]
}

/// 从 DB 加载方案列表（优先使用 DB 存储，DB 为空时 fallback 到内置默认）
/// 同时自动合并新增的内置系统方案（is_system=true），确保新增种子方案无需手动操作即可出现
async fn load_schemes_from_db(state: &AppState, plugin_name: &str) -> Vec<serde_json::Value> {
    let configs = load_plugin_configs(state, plugin_name)
        .await
        .unwrap_or_default();
    if let Some(schemes_str) = configs.get("pg_schemes") {
        if let Ok(mut schemes) = serde_json::from_str::<Vec<serde_json::Value>>(schemes_str) {
            if !schemes.is_empty() {
                // 自动合并新增的内置方案，并清理已废弃的系统方案
                let defaults = get_default_schemes();
                let default_ids: std::collections::HashSet<String> = defaults
                    .iter()
                    .filter_map(|d| d.get("id").and_then(|v| v.as_str()).map(|s| s.to_string()))
                    .collect();

                // 移除在数据库中但已从代码默认配置中移除的系统方案
                schemes.retain(|s| {
                    if s.get("is_system")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false)
                    {
                        if let Some(id) = s.get("id").and_then(|v| v.as_str()) {
                            return default_ids.contains(id);
                        }
                    }
                    true
                });

                let existing_ids: std::collections::HashSet<String> = schemes
                    .iter()
                    .filter_map(|s| s.get("id").and_then(|v| v.as_str()).map(|s| s.to_string()))
                    .collect();
                for d in defaults {
                    if let Some(id) = d.get("id").and_then(|v| v.as_str()) {
                        if d.get("is_system")
                            .and_then(|v| v.as_bool())
                            .unwrap_or(false)
                        {
                            if !existing_ids.contains(id) {
                                schemes.push(d);
                            } else {
                                // 替换为最新的系统内置方案以同步参数配置
                                if let Some(pos) = schemes
                                    .iter()
                                    .position(|s| s.get("id").and_then(|v| v.as_str()) == Some(id))
                                {
                                    schemes[pos] = d;
                                }
                            }
                        }
                    }
                }
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
    pub id: i64,
    pub enabled: bool,
    pub scheme_id: Option<String>,
    pub param_overrides: Option<serde_json::Value>,
    pub sort_order: Option<i64>,
}

#[derive(serde::Deserialize, serde::Serialize, Clone)]
pub struct AdvancedNodesConfig {
    pub enabled: bool,
    pub preview_enabled: bool,
    pub volc_enhance_enabled: bool,
    pub prompt_enabled: bool,
    pub ai_video_enabled: bool,
    pub ai_image_enabled: bool,
    pub agent_enabled: bool,
    pub agent_mode_enabled: Option<bool>,
    pub agent_video_mode: Option<String>,
    pub agent_welcome_title: Option<String>,
    pub agent_welcome_desc: Option<String>,
    pub agent_preset_prompts: Option<serde_json::Value>,
    pub agent_system_prompt: Option<String>,
    pub agent_chat_models: Option<Vec<String>>,
    pub unified_limit_enabled: Option<bool>,
    pub unified_limit_value: Option<i64>,
    pub preview_limit: Option<i64>,
    pub prompt_limit: Option<i64>,
    pub ai_video_limit: Option<i64>,
    pub ai_image_limit: Option<i64>,
    pub agent_limit: Option<i64>,
    pub volc_enhance_limit: Option<i64>,
    pub instance_limit: Option<i64>,
}

#[derive(Deserialize)]
pub struct PlaygroundConfigRequest {
    pub models: Vec<PlaygroundModelConfig>,
    pub default_model_mids: Option<serde_json::Value>, // {"chat": "mid1", "image": "mid2", "video": "mid3"}
    pub advanced_nodes: Option<AdvancedNodesConfig>,
}

/// 管理员：获取体验中心配置（返回全部模型 + 每个模型的启用/方案信息）
async fn get_playground_config(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    let role: String =
        sqlx::query_scalar(&state.db.format_query("SELECT role FROM users WHERE id = ?"))
            .bind(&claims.sub)
            .fetch_one(&state.db.pool)
            .await?;
    if role != "admin" {
        return Err(AppError::Forbidden("需要管理员权限".to_string()));
    }

    let configs = load_plugin_configs(&state, &name).await?;

    // 查出全部模型及其 type 信息
    let models: Vec<crate::models::Model> = sqlx::query_as(
        &state
            .db
            .format_query("SELECT * FROM models ORDER BY id DESC"),
    )
    .fetch_all(&state.db.pool)
    .await?;

    let types: Vec<crate::models::ModelType> = sqlx::query_as(
        &state
            .db
            .format_query("SELECT * FROM model_types ORDER BY sort_order DESC, id ASC"),
    )
    .fetch_all(&state.db.pool)
    .await?;

    // 为每个模型附加启用和方案配置
    let mut model_list = Vec::new();
    for m in &models {
        let new_key = format!("pg_model_id_{}", m.id);
        let old_key = format!("pg_model_{}", m.mid);
        let model_conf: serde_json::Value = configs
            .get(&new_key)
            .or_else(|| configs.get(&old_key))
            .and_then(|s| serde_json::from_str(s).ok())
            .unwrap_or(json!({"enabled": false, "scheme_id": null}));

        let type_name = m
            .type_id
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
            "provider_id": m.provider_id,
            "api_provider_id": m.api_provider_id,
            "is_active": m.is_active,
            "global_discount": m.global_discount,
            "global_discount_enabled": m.global_discount_enabled,
            "pg_enabled": model_conf.get("enabled").and_then(|v| v.as_bool()).unwrap_or(false),
            "pg_scheme_id": model_conf.get("scheme_id").and_then(|v| v.as_str()).unwrap_or(""),
            "pg_param_overrides": model_conf.get("param_overrides").cloned().unwrap_or(serde_json::Value::Null),
            "pg_sort_order": model_conf.get("sort_order").and_then(|v| v.as_i64()).unwrap_or(0),
        }));
    }

    // 读取每个类型的默认模型
    let default_model_mids: serde_json::Value = configs
        .get("pg_default_model_mids")
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or(json!({}));

    let adv_nodes_enabled = configs
        .get("pg_advanced_nodes_enabled")
        .map(|s| s == "true")
        .unwrap_or(false);
    let adv_node_preview = configs
        .get("pg_advanced_node_preview_enabled")
        .map(|s| s == "true")
        .unwrap_or(true);
    let adv_node_volc = configs
        .get("pg_advanced_node_volc_enhance_enabled")
        .map(|s| s == "true")
        .unwrap_or(false);
    let adv_node_prompt = configs
        .get("pg_advanced_node_prompt_enabled")
        .map(|s| s == "true")
        .unwrap_or(true);
    let adv_node_ai_video = configs
        .get("pg_advanced_node_ai_video_enabled")
        .map(|s| s == "true")
        .unwrap_or(true);
    let adv_node_ai_image = configs
        .get("pg_advanced_node_ai_image_enabled")
        .map(|s| s == "true")
        .unwrap_or(true);
    let adv_node_agent = configs
        .get("pg_advanced_node_agent_enabled")
        .map(|s| s == "true")
        .unwrap_or(false);
    let agent_mode_enabled = configs
        .get("pg_agent_mode_enabled")
        .map(|s| s == "true")
        .unwrap_or(false);
    let agent_video_mode = configs
        .get("pg_agent_video_mode")
        .cloned()
        .unwrap_or_else(|| "track".to_string());
    let agent_welcome_title = configs.get("pg_agent_welcome_title").cloned();
    let agent_welcome_desc = configs.get("pg_agent_welcome_desc").cloned();
    let agent_preset_prompts: Option<serde_json::Value> = configs
        .get("pg_agent_preset_prompts")
        .and_then(|s| serde_json::from_str(s).ok());
    let agent_system_prompt = configs.get("pg_agent_system_prompt").cloned();
    let agent_chat_models: Option<Vec<String>> = configs
        .get("pg_agent_chat_models")
        .and_then(|s| serde_json::from_str(s).ok());
    let volc_enhance_plugin_active = is_plugin_enabled(&state, "volcengine_enhance").await;

    Ok(Json(json!({
        "models": model_list,
        "schemes": load_schemes_from_db(&state, &name).await,
        "default_model_mids": default_model_mids,
        "advanced_nodes": {
            "enabled": adv_nodes_enabled,
            "preview_enabled": adv_node_preview,
            "volc_enhance_enabled": adv_node_volc,
            "volc_enhance_plugin_active": volc_enhance_plugin_active,
            "prompt_enabled": adv_node_prompt,
            "ai_video_enabled": adv_node_ai_video,
            "ai_image_enabled": adv_node_ai_image,
            "agent_enabled": adv_node_agent,
            "agent_mode_enabled": agent_mode_enabled,
            "agent_video_mode": agent_video_mode,
            "agent_welcome_title": agent_welcome_title,
            "agent_welcome_desc": agent_welcome_desc,
            "agent_preset_prompts": agent_preset_prompts,
            "agent_system_prompt": agent_system_prompt,
            "agent_chat_models": agent_chat_models,
        }
    })))
}

/// 管理员：保存体验中心配置（按模型逐个保存启用状态和方案绑定）
async fn save_playground_config(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    Extension(claims): Extension<auth::Claims>,
    Json(payload): Json<PlaygroundConfigRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let role: String =
        sqlx::query_scalar(&state.db.format_query("SELECT role FROM users WHERE id = ?"))
            .bind(&claims.sub)
            .fetch_one(&state.db.pool)
            .await?;
    if role != "admin" {
        return Err(AppError::Forbidden("需要管理员权限".to_string()));
    }

    // 保存每个类型的默认模型
    if let Some(ref mids) = payload.default_model_mids {
        upsert_config(&state, &name, "pg_default_model_mids", &mids.to_string()).await?;
    }

    if let Some(ref adv) = payload.advanced_nodes {
        upsert_config(
            &state,
            &name,
            "pg_advanced_nodes_enabled",
            &adv.enabled.to_string(),
        )
        .await?;
        upsert_config(
            &state,
            &name,
            "pg_advanced_node_preview_enabled",
            &adv.preview_enabled.to_string(),
        )
        .await?;
        upsert_config(
            &state,
            &name,
            "pg_advanced_node_volc_enhance_enabled",
            &adv.volc_enhance_enabled.to_string(),
        )
        .await?;
        upsert_config(
            &state,
            &name,
            "pg_advanced_node_prompt_enabled",
            &adv.prompt_enabled.to_string(),
        )
        .await?;
        upsert_config(
            &state,
            &name,
            "pg_advanced_node_ai_video_enabled",
            &adv.ai_video_enabled.to_string(),
        )
        .await?;
        upsert_config(
            &state,
            &name,
            "pg_advanced_node_ai_image_enabled",
            &adv.ai_image_enabled.to_string(),
        )
        .await?;
        upsert_config(
            &state,
            &name,
            "pg_advanced_node_agent_enabled",
            &adv.agent_enabled.to_string(),
        )
        .await?;
        if let Some(ref val) = adv.agent_mode_enabled {
            upsert_config(&state, &name, "pg_agent_mode_enabled", &val.to_string()).await?;
        }
        if let Some(ref val) = adv.agent_video_mode {
            upsert_config(&state, &name, "pg_agent_video_mode", val).await?;
        }
        if let Some(ref val) = adv.agent_welcome_title {
            upsert_config(&state, &name, "pg_agent_welcome_title", val).await?;
        }
        if let Some(ref val) = adv.agent_welcome_desc {
            upsert_config(&state, &name, "pg_agent_welcome_desc", val).await?;
        }
        if let Some(ref val) = adv.agent_preset_prompts {
            upsert_config(&state, &name, "pg_agent_preset_prompts", &val.to_string()).await?;
        }
        if let Some(ref val) = adv.agent_system_prompt {
            upsert_config(&state, &name, "pg_agent_system_prompt", val).await?;
        }
        if let Some(ref val) = adv.agent_chat_models {
            upsert_config(
                &state,
                &name,
                "pg_agent_chat_models",
                &serde_json::to_string(val).unwrap_or_default(),
            )
            .await?;
        }
    }

    for mc in &payload.models {
        let config_key = format!("pg_model_id_{}", mc.id);
        let mut val = json!({
            "enabled": mc.enabled,
            "scheme_id": mc.scheme_id,
            "sort_order": mc.sort_order.unwrap_or(0),
        });
        // 仅在有覆写数据时才写入，保持数据精简
        if let Some(ref overrides) = mc.param_overrides {
            val["param_overrides"] = overrides.clone();
        }
        upsert_config(&state, &name, &config_key, &val.to_string()).await?;
    }

    Ok(Json(json!({ "message": "模型创作中心配置已保存" })))
}

/// 管理员：获取体验方案列表（从 DB 加载，含内置 + 自定义）
async fn get_playground_schemes(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    // Bug 3 修复：补冲缺失的管理员权限校验
    let role: String =
        sqlx::query_scalar(&state.db.format_query("SELECT role FROM users WHERE id = ?"))
            .bind(&claims.sub)
            .fetch_one(&state.db.pool)
            .await?;
    if role != "admin" {
        return Err(AppError::Forbidden("需要管理员权限".to_string()));
    }
    let schemes = load_schemes_from_db(&state, &name).await;
    Ok(Json(
        json!({ "schemes": schemes, "defaults": get_default_schemes() }),
    ))
}

/// 管理员：保存体验方案列表（全量覆盖）
async fn save_playground_schemes(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    Extension(claims): Extension<auth::Claims>,
    Json(payload): Json<serde_json::Value>,
) -> AppResult<Json<serde_json::Value>> {
    let role: String =
        sqlx::query_scalar(&state.db.format_query("SELECT role FROM users WHERE id = ?"))
            .bind(&claims.sub)
            .fetch_one(&state.db.pool)
            .await?;
    if role != "admin" {
        return Err(AppError::Forbidden("需要管理员权限".to_string()));
    }

    let schemes = payload
        .get("schemes")
        .ok_or_else(|| AppError::BadRequest("缺少 schemes 字段".to_string()))?;

    let schemes_str = serde_json::to_string(schemes)
        .map_err(|_| AppError::BadRequest("方案数据序列化失败".to_string()))?;

    upsert_config(&state, &name, "pg_schemes", &schemes_str).await?;

    Ok(Json(json!({ "message": "体验方案已保存" })))
}

/// 将模型级参数覆写（delta）与预设方案参数合并
/// overrides 格式: { "modify": {"key": {patch}}, "remove": ["key"], "add": [{param}] }
fn merge_param_overrides(
    base_params: serde_json::Value,
    overrides: Option<serde_json::Value>,
) -> serde_json::Value {
    let overrides = match overrides {
        Some(v) if v.is_object() => v,
        _ => return base_params,
    };
    let base_arr = match base_params.as_array() {
        Some(a) => a.clone(),
        None => return base_params,
    };

    // 收集需删除的 key
    let removes: std::collections::HashSet<String> = overrides
        .get("remove")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();

    // 收集需修改的 key -> patch
    let modifies: std::collections::HashMap<String, &serde_json::Value> = overrides
        .get("modify")
        .and_then(|v| v.as_object())
        .map(|obj| obj.iter().map(|(k, v)| (k.clone(), v)).collect())
        .unwrap_or_default();

    // 过滤 + 合并
    let mut result: Vec<serde_json::Value> = base_arr
        .into_iter()
        .filter(|p| {
            let key = p.get("key").and_then(|v| v.as_str()).unwrap_or("");
            !removes.contains(key)
        })
        .map(|mut p| {
            let key = p
                .get("key")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            if let Some(patch) = modifies.get(&key) {
                // 浅合并：patch 中的字段覆盖 base
                if let (Some(base_obj), Some(patch_obj)) = (p.as_object_mut(), patch.as_object()) {
                    for (k, v) in patch_obj {
                        base_obj.insert(k.clone(), v.clone());
                    }
                }
            }
            p
        })
        .collect();

    // 追加新增参数
    if let Some(adds) = overrides.get("add").and_then(|v| v.as_array()) {
        result.extend(adds.clone());
    }

    json!(result)
}

/// 公开：获取体验中心配置供前端用户使用
/// 返回已启用的模型列表 + 各模型绑定的方案参数
async fn get_playground_public_config(
    State(state): State<Arc<AppState>>,
) -> AppResult<Json<serde_json::Value>> {
    let configs = load_plugin_configs(&state, "playground").await?;

    let adv_nodes_enabled = configs
        .get("pg_advanced_nodes_enabled")
        .map(|s| s == "true")
        .unwrap_or(false);
    let adv_node_preview = configs
        .get("pg_advanced_node_preview_enabled")
        .map(|s| s == "true")
        .unwrap_or(true);
    let adv_node_volc = configs
        .get("pg_advanced_node_volc_enhance_enabled")
        .map(|s| s == "true")
        .unwrap_or(false);
    let adv_node_prompt = configs
        .get("pg_advanced_node_prompt_enabled")
        .map(|s| s == "true")
        .unwrap_or(true);
    let adv_node_ai_video = configs
        .get("pg_advanced_node_ai_video_enabled")
        .map(|s| s == "true")
        .unwrap_or(true);
    let adv_node_ai_image = configs
        .get("pg_advanced_node_ai_image_enabled")
        .map(|s| s == "true")
        .unwrap_or(true);
    let adv_node_agent = configs
        .get("pg_advanced_node_agent_enabled")
        .map(|s| s == "true")
        .unwrap_or(false);
    let agent_mode_enabled = configs
        .get("pg_agent_mode_enabled")
        .map(|s| s == "true")
        .unwrap_or(false);
    let agent_video_mode = configs
        .get("pg_agent_video_mode")
        .cloned()
        .unwrap_or_else(|| "track".to_string());
    let agent_welcome_title = configs.get("pg_agent_welcome_title").cloned();
    let agent_welcome_desc = configs.get("pg_agent_welcome_desc").cloned();
    let agent_preset_prompts: Option<serde_json::Value> = configs
        .get("pg_agent_preset_prompts")
        .and_then(|s| serde_json::from_str(s).ok());
    let agent_system_prompt = configs.get("pg_agent_system_prompt").cloned();
    let agent_chat_models: Option<Vec<String>> = configs
        .get("pg_agent_chat_models")
        .and_then(|s| serde_json::from_str(s).ok());
    let volc_enhance_plugin_active = is_plugin_enabled(&state, "volcengine_enhance").await;
    let schemes = load_schemes_from_db(&state, "playground").await;

    // 查出全部模型及其 type 信息
    let models: Vec<crate::models::Model> = sqlx::query_as(
        &state
            .db
            .format_query("SELECT * FROM models WHERE is_active = 1 ORDER BY id DESC"),
    )
    .fetch_all(&state.db.pool)
    .await?;

    let types: Vec<crate::models::ModelType> = sqlx::query_as(
        &state
            .db
            .format_query("SELECT * FROM model_types ORDER BY sort_order DESC, id ASC"),
    )
    .fetch_all(&state.db.pool)
    .await?;

    let billing_rules: Vec<crate::models::BillingRule> =
        sqlx::query_as(&state.db.format_query("SELECT * FROM billing_rules"))
            .fetch_all(&state.db.pool)
            .await?;

    let mut enabled_models = Vec::new();
    for m in &models {
        let new_key = format!("pg_model_id_{}", m.id);
        let old_key = format!("pg_model_{}", m.mid);
        let model_conf: serde_json::Value = configs
            .get(&new_key)
            .or_else(|| configs.get(&old_key))
            .and_then(|s| serde_json::from_str(s).ok())
            .unwrap_or(json!({"enabled": false, "scheme_id": null}));

        let is_enabled = model_conf
            .get("enabled")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        let is_agent_chat = agent_chat_models
            .as_ref()
            .map_or(false, |list| list.contains(&m.mid));
        if !is_enabled && !is_agent_chat {
            continue;
        }

        let sort_order = model_conf
            .get("sort_order")
            .and_then(|v| v.as_i64())
            .unwrap_or(0);

        let scheme_id = model_conf
            .get("scheme_id")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let mut scheme = schemes
            .iter()
            .find(|s| s.get("id").and_then(|v| v.as_str()) == Some(scheme_id));

        let type_name = m
            .type_id
            .and_then(|tid| types.iter().find(|t| t.id == tid))
            .map(|t| t.name.clone())
            .unwrap_or_default();

        // 如果未绑定方案或方案不存在，按模型类型自动匹配第一个同类方案
        if scheme.is_none() && !type_name.is_empty() {
            let type_key = if type_name.contains("视频") {
                "video"
            } else if type_name.contains("图片") {
                "image"
            } else if type_name.contains("聊天") {
                "chat"
            } else {
                ""
            };
            if !type_key.is_empty() {
                scheme = schemes
                    .iter()
                    .find(|s| s.get("type").and_then(|v| v.as_str()) == Some(type_key));
            }
        }

        let scheme_type = scheme
            .and_then(|s| s.get("type"))
            .and_then(|v| v.as_str())
            .unwrap_or("");

        let billing_info = m
            .billing_rule_id
            .and_then(|bid| billing_rules.iter().find(|b| b.id == bid))
            .map(|b| {
                json!({
                    "billing_type": b.billing_type,
                    "name": b.name,
                    "prompt_rate": b.prompt_rate,
                    "completion_rate": b.completion_rate,
                    "cached_rate": b.cached_rate,
                    "claude_cache_creation_rate": b.claude_cache_creation_rate,
                    "claude_cache_read_rate": b.claude_cache_read_rate,
                    "fixed_rate": b.fixed_rate,
                    "duration_rate": b.duration_rate,
                    "pricing_tiers": b.pricing_tiers,
                    "billing_rule": b.billing_rule,
                    "extended_config": b.extended_config,
                })
            })
            .unwrap_or(json!(null));

        enabled_models.push(json!({
            "id": m.id,
            "mid": m.mid,
            "name": m.name,
            "model_id": m.model_id,
            "description": m.description,
            "logo": m.logo,
            "type_name": type_name,
            "scheme_id": scheme_id,
            "scheme_name": scheme.and_then(|s| s.get("name")).and_then(|v| v.as_str()).unwrap_or(""),
            "scheme_type": scheme_type,
            "endpoint": scheme.and_then(|s| s.get("endpoint")).and_then(|v| v.as_str()).unwrap_or(""),
            "poll_endpoint": scheme.and_then(|s| s.get("poll_endpoint")).and_then(|v| v.as_str()).unwrap_or(""),
            "billing": billing_info,
            "sort_order": sort_order,
            "global_discount": m.global_discount,
            "global_discount_enabled": m.global_discount_enabled,
            "params": merge_param_overrides(
                scheme.and_then(|s| s.get("params")).cloned().unwrap_or(json!([])),
                model_conf.get("param_overrides").cloned(),
            ),
        }));
    }

    // 根据 sort_order 对已启用的模型进行降序排序
    enabled_models.sort_by(|a, b| {
        let sa = a.get("sort_order").and_then(|v| v.as_i64()).unwrap_or(0);
        let sb = b.get("sort_order").and_then(|v| v.as_i64()).unwrap_or(0);
        sb.cmp(&sa)
    });

    // 读取每个类型的默认模型
    let default_model_mids: serde_json::Value = configs
        .get("pg_default_model_mids")
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or(json!({}));

    Ok(Json(json!({
        "models": enabled_models,
        "default_model_mids": default_model_mids,
        "advanced_nodes": {
            "enabled": adv_nodes_enabled,
            "preview_enabled": adv_node_preview,
            "volc_enhance_enabled": adv_node_volc,
            "volc_enhance_plugin_active": volc_enhance_plugin_active,
            "prompt_enabled": adv_node_prompt,
            "ai_video_enabled": adv_node_ai_video,
            "ai_image_enabled": adv_node_ai_image,
            "agent_enabled": adv_node_agent,
            "agent_mode_enabled": agent_mode_enabled,
            "agent_video_mode": agent_video_mode,
            "agent_welcome_title": agent_welcome_title,
            "agent_welcome_desc": agent_welcome_desc,
            "agent_preset_prompts": agent_preset_prompts,
            "agent_system_prompt": agent_system_prompt,
            "agent_chat_models": agent_chat_models,
        }
    })))
}

// ========== 模型广场管理 (Model Marketplace) ==========

/// 管理员：获取模型广场配置（返回全部模型 + 每个模型的广场展示配置）
async fn get_marketplace_models(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    let role: String =
        sqlx::query_scalar(&state.db.format_query("SELECT role FROM users WHERE id = ?"))
            .bind(&claims.sub)
            .fetch_one(&state.db.pool)
            .await?;
    if role != "admin" {
        return Err(AppError::Forbidden("需要管理员权限".to_string()));
    }

    let configs = load_plugin_configs(&state, &name).await?;

    // 查出全部模型及其 provider/type 信息
    let models: Vec<crate::models::Model> = sqlx::query_as(
        &state
            .db
            .format_query("SELECT * FROM models ORDER BY id DESC"),
    )
    .fetch_all(&state.db.pool)
    .await?;

    let providers: Vec<crate::models::ModelProvider> = sqlx::query_as(
        &state
            .db
            .format_query("SELECT * FROM model_providers ORDER BY sort_order DESC, id ASC"),
    )
    .fetch_all(&state.db.pool)
    .await?;

    let types: Vec<crate::models::ModelType> = sqlx::query_as(
        &state
            .db
            .format_query("SELECT * FROM model_types ORDER BY sort_order DESC, id ASC"),
    )
    .fetch_all(&state.db.pool)
    .await?;

    // 读取展示模式: whitelist（默认隐藏，手动开启）或 blacklist（默认展示，手动排除）
    let display_mode = configs
        .get("mp_display_mode")
        .map(|s| s.as_str())
        .unwrap_or("blacklist");
    let is_blacklist = display_mode == "blacklist";
    let allow_guest = configs
        .get("mp_allow_guest")
        .map(|s| s == "true")
        .unwrap_or(false);

    let mut model_list = Vec::new();
    for m in &models {
        let config_key = format!("mp_model_id_{}", m.id);
        let model_conf: serde_json::Value = configs
            .get(&config_key)
            .and_then(|s| serde_json::from_str(s).ok())
            .unwrap_or(json!({"sort_order": 0, "description": ""}));

        // 在黑名单模式下，没有配置的模型默认展示 (enabled=true)
        let default_enabled = is_blacklist;
        let mp_enabled = model_conf
            .get("enabled")
            .and_then(|v| v.as_bool())
            .unwrap_or(default_enabled);

        let provider_name = m
            .provider_id
            .and_then(|pid| providers.iter().find(|p| p.id == pid))
            .map(|p| p.name.clone())
            .unwrap_or_default();

        let type_name = m
            .type_id
            .and_then(|tid| types.iter().find(|t| t.id == tid))
            .map(|t| t.name.clone())
            .unwrap_or_default();

        model_list.push(json!({
            "id": m.id,
            "mid": m.mid,
            "name": m.name,
            "model_id": m.model_id,
            "remark": m.remark,
            "provider_id": m.provider_id,
            "provider_name": provider_name,
            "type_id": m.type_id,
            "type_name": type_name,
            "is_active": m.is_active,
            "mp_enabled": mp_enabled,
            "mp_sort_order": model_conf.get("sort_order").and_then(|v| v.as_i64()).unwrap_or(0),
            "mp_description": model_conf.get("description").and_then(|v| v.as_str()).unwrap_or(""),
        }));
    }

    Ok(Json(json!({
        "models": model_list,
        "display_mode": display_mode,
        "allow_guest": allow_guest,
    })))
}

#[derive(Deserialize)]
pub struct MarketplaceModelConfig {
    pub id: i64,
    pub enabled: bool,
    pub sort_order: Option<i64>,
    pub description: Option<String>,
}

#[derive(Deserialize)]
pub struct MarketplaceConfigRequest {
    pub models: Vec<MarketplaceModelConfig>,
    pub display_mode: Option<String>, // "whitelist" or "blacklist"
    pub allow_guest: Option<bool>,
}

/// 管理员：保存模型广场配置
async fn save_marketplace_models(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    Extension(claims): Extension<auth::Claims>,
    Json(payload): Json<MarketplaceConfigRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let role: String =
        sqlx::query_scalar(&state.db.format_query("SELECT role FROM users WHERE id = ?"))
            .bind(&claims.sub)
            .fetch_one(&state.db.pool)
            .await?;
    if role != "admin" {
        return Err(AppError::Forbidden("需要管理员权限".to_string()));
    }

    // 保存展示模式
    if let Some(ref mode) = payload.display_mode {
        upsert_config(&state, &name, "mp_display_mode", mode).await?;
    }

    if let Some(allow_guest) = payload.allow_guest {
        upsert_config(
            &state,
            &name,
            "mp_allow_guest",
            if allow_guest { "true" } else { "false" },
        )
        .await?;
    }

    for mc in &payload.models {
        let config_key = format!("mp_model_id_{}", mc.id);
        let val = json!({
            "enabled": mc.enabled,
            "sort_order": mc.sort_order.unwrap_or(0),
            "description": mc.description.as_deref().unwrap_or(""),
        });
        upsert_config(&state, &name, &config_key, &val.to_string()).await?;
    }

    // 清除缓存，下次请求将重新构建
    get_marketplace_cache().write().await.invalidate();

    Ok(Json(json!({ "message": "模型广场配置已保存" })))
}

/// 公开接口：获取模型广场展示数据（若配置了允许游客访问则无需登录，否则需登录并校验用户等级权限）
pub async fn get_marketplace_public(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
) -> AppResult<Json<serde_json::Value>> {
    // 1. 检查插件是否启用
    let plugin: Option<Plugin> = sqlx::query_as(
        &state
            .db
            .format_query("SELECT * FROM plugins WHERE name = ? AND is_enabled = 1"),
    )
    .bind("model_marketplace")
    .fetch_optional(&state.db.pool)
    .await?;

    let plugin = match plugin {
        Some(p) => p,
        None => {
            return Ok(Json(json!({
                "enabled": false,
                "models": [],
                "providers": [],
                "types": [],
            })))
        }
    };

    // 加载配置，获取是否允许游客访问
    let configs = load_plugin_configs(&state, "model_marketplace").await?;
    let allow_guest = configs
        .get("mp_allow_guest")
        .map(|s| s == "true")
        .unwrap_or(false);

    // 2. 用户等级/游客权限校验
    if !allow_guest {
        // 如果不允许游客访问，则手动尝试解析 JWT 鉴权
        let mut claims = None;
        if let Some(auth_header) = headers
            .get(axum::http::header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
        {
            if let Some(token) = auth_header.strip_prefix("Bearer ") {
                if let Ok(c) = crate::auth::validate_token(token, &state.config.jwt_secret) {
                    // 验证用户是否仍存在且处于激活状态
                    let is_active: Result<Option<i64>, sqlx::Error> = sqlx::query_scalar(
                        &state
                            .db
                            .format_query("SELECT is_active FROM users WHERE id = ?"),
                    )
                    .bind(&c.sub)
                    .fetch_optional(&state.db.pool)
                    .await;
                    if let Ok(Some(active)) = is_active {
                        if active != 0 {
                            claims = Some(c);
                        }
                    }
                }
            }
        }

        let claims = match claims {
            Some(c) => c,
            None => return Err(AppError::Unauthorized), // 未登录或 Token 无效
        };

        if plugin.allowed_levels != "all" {
            let user_info: Option<(String, String, Option<i64>)> = sqlx::query_as(
                &state.db.format_query("SELECT u.role, u.user_group, ul.id as level_id FROM users u LEFT JOIN user_levels ul ON u.user_group = ul.group_key WHERE u.id = ?")
            )
            .bind(&claims.sub)
            .fetch_optional(&state.db.pool)
            .await?;

            let (role, user_group, user_level_id) =
                user_info.unwrap_or_else(|| ("user".to_string(), "default".to_string(), Some(0)));
            if role != "admin" {
                let allowed: Vec<&str> = plugin.allowed_levels.split(',').collect();
                let level_id_str = user_level_id.unwrap_or(0).to_string();

                if !allowed.contains(&user_group.as_str())
                    && !allowed.contains(&level_id_str.as_str())
                {
                    return Err(AppError::Forbidden(
                        "您当前的用户等级无权访问模型广场".to_string(),
                    ));
                }
            }
        }
    }

    // 3. 尝试从缓存读取
    {
        let cache = get_marketplace_cache().read().await;
        if cache.is_valid() {
            if let Some(ref data) = cache.data {
                return Ok(Json(data.clone()));
            }
        }
    }

    // 4. 缓存未命中，从数据库查询并构建
    let configs = load_plugin_configs(&state, "model_marketplace").await?;

    let models: Vec<crate::models::Model> = sqlx::query_as(
        &state
            .db
            .format_query("SELECT * FROM models WHERE is_active = 1 ORDER BY id DESC"),
    )
    .fetch_all(&state.db.pool)
    .await?;

    let providers: Vec<crate::models::ModelProvider> = sqlx::query_as(&state.db.format_query(
        "SELECT * FROM model_providers WHERE is_active = 1 ORDER BY sort_order DESC, id ASC",
    ))
    .fetch_all(&state.db.pool)
    .await?;

    let types: Vec<crate::models::ModelType> = sqlx::query_as(&state.db.format_query(
        "SELECT * FROM model_types WHERE is_active = 1 ORDER BY sort_order DESC, id ASC",
    ))
    .fetch_all(&state.db.pool)
    .await?;

    let billing_rules: Vec<crate::models::BillingRule> = sqlx::query_as(
        &state
            .db
            .format_query("SELECT * FROM billing_rules WHERE is_active = 1"),
    )
    .fetch_all(&state.db.pool)
    .await?;

    let ha_channels: Vec<(String, String)> = sqlx::query_as(
        &state.db.format_query("SELECT models, config FROM channels WHERE provider_type = 'high_availability_group' AND status = 1")
    ).fetch_all(&state.db.pool).await?;

    let channel_configs: Vec<crate::models::ChannelConfig> =
        sqlx::query_as(&state.db.format_query("SELECT * FROM channel_configs"))
            .fetch_all(&state.db.pool)
            .await?;

    let mut config_map = std::collections::HashMap::new();
    for cfg in channel_configs {
        config_map.insert(cfg.id, cfg);
    }

    let mut ha_model_subs: std::collections::HashMap<String, Vec<serde_json::Value>> =
        std::collections::HashMap::new();
    let mut ha_model_ids = std::collections::HashSet::new();

    for (models_str, config_str) in ha_channels {
        if let Ok(m_ids) = serde_json::from_str::<Vec<String>>(&models_str) {
            let mut subs = Vec::new();
            if let Ok(config_val) = serde_json::from_str::<serde_json::Value>(&config_str) {
                if let Some(sub_channel_ids) =
                    config_val.get("sub_channels").and_then(|v| v.as_array())
                {
                    for sid_val in sub_channel_ids {
                        if let Some(sid) = sid_val.as_i64() {
                            if let Some(cfg) = config_map.get(&sid) {
                                subs.push(json!({
                                    "name": cfg.name,
                                    "provider_type": cfg.provider_type,
                                    "rate": cfg.rate,
                                    "is_ha": true,
                                }));
                            }
                        }
                    }
                }
            }
            for m_id in m_ids {
                ha_model_ids.insert(m_id.clone());
                if !subs.is_empty() {
                    let entry = ha_model_subs.entry(m_id).or_insert_with(Vec::new);
                    // Avoid duplicates if multiple HA groups have the same model
                    for sub in &subs {
                        if !entry.contains(sub) {
                            entry.push(sub.clone());
                        }
                    }
                }
            }
        }
    }

    // 补充：获取普通渠道（非HA）及其倍率，用于在前台也展示其上游渠道倍率
    let normal_channels: Vec<(String, String, f64, Option<i64>, String)> = sqlx::query_as(
        &state.db.format_query("SELECT models, name, rate, preset_id, provider_type FROM channels WHERE provider_type != 'high_availability_group' AND status = 1")
    ).fetch_all(&state.db.pool).await?;

    for (models_str, name, rate, preset_id, provider_type) in normal_channels {
        if let Ok(m_ids) = serde_json::from_str::<Vec<String>>(&models_str) {
            let mut effective_name = name;
            let mut effective_rate = rate;
            let mut effective_provider_type = provider_type;
            // 如果存在分组 preset_id，则优先展示渠道分组名称和分组倍率
            if let Some(pid) = preset_id {
                if let Some(cfg) = config_map.get(&pid) {
                    effective_name = cfg.name.clone();
                    effective_rate = cfg.rate;
                    effective_provider_type = cfg.provider_type.clone();
                }
            }

            let sub = json!({
                "name": effective_name,
                "provider_type": effective_provider_type,
                "rate": effective_rate,
                "is_ha": false,
            });

            for m_id in m_ids {
                let entry = ha_model_subs.entry(m_id).or_insert_with(Vec::new);
                if !entry.contains(&sub) {
                    entry.push(sub.clone());
                }
            }
        }
    }

    // 读取展示模式
    let display_mode = configs
        .get("mp_display_mode")
        .map(|s| s.as_str())
        .unwrap_or("blacklist");
    let is_blacklist = display_mode == "blacklist";

    let mut marketplace_models: Vec<serde_json::Value> = Vec::new();
    for m in &models {
        let config_key = format!("mp_model_id_{}", m.id);
        let model_conf: serde_json::Value = configs
            .get(&config_key)
            .and_then(|s| serde_json::from_str(s).ok())
            .unwrap_or(json!({"sort_order": 0, "description": ""}));

        // 黑名单模式：没有配置的模型默认展示；白名单模式：没有配置的模型默认隐藏
        let default_enabled = is_blacklist;
        let is_enabled = model_conf
            .get("enabled")
            .and_then(|v| v.as_bool())
            .unwrap_or(default_enabled);
        if !is_enabled {
            continue;
        }

        let sort_order = model_conf
            .get("sort_order")
            .and_then(|v| v.as_i64())
            .unwrap_or(0);
        let description = model_conf
            .get("description")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        let provider_name = m
            .provider_id
            .and_then(|pid| providers.iter().find(|p| p.id == pid))
            .map(|p| p.name.clone())
            .unwrap_or_default();

        let type_name = m
            .type_id
            .and_then(|tid| types.iter().find(|t| t.id == tid))
            .map(|t| t.name.clone())
            .unwrap_or_default();

        let billing_info = m
            .billing_rule_id
            .and_then(|bid| billing_rules.iter().find(|b| b.id == bid))
            .map(|b| {
                json!({
                    "billing_type": b.billing_type,
                    "name": b.name,
                    "prompt_rate": b.prompt_rate,
                    "completion_rate": b.completion_rate,
                    "cached_rate": b.cached_rate,
                    "claude_cache_creation_rate": b.claude_cache_creation_rate,
                    "claude_cache_read_rate": b.claude_cache_read_rate,
                    "fixed_rate": b.fixed_rate,
                    "duration_rate": b.duration_rate,
                    "pricing_tiers": b.pricing_tiers,
                    "billing_rule": b.billing_rule,
                    "extended_config": b.extended_config,
                })
            })
            .unwrap_or(json!(null));

        let provider_logo = m
            .provider_id
            .and_then(|pid| providers.iter().find(|p| p.id == pid))
            .and_then(|p| p.logo.clone());

        let type_logo = m
            .type_id
            .and_then(|tid| types.iter().find(|t| t.id == tid))
            .and_then(|t| t.logo.clone());

        marketplace_models.push(json!({
            "id": m.id,
            "mid": m.mid,
            "name": m.name,
            "model_id": m.model_id,
            "provider_id": m.provider_id,
            "provider_name": provider_name,
            "provider_logo": provider_logo,
            "type_id": m.type_id,
            "type_name": type_name,
            "type_logo": type_logo,
            "logo": m.logo,
            "original_id": m.original_id,
            "sort_order": sort_order,
            "description": description,
            "model_description": m.description,
            "global_discount": m.global_discount,
            "global_discount_enabled": m.global_discount_enabled,
            "billing": billing_info,
            "has_ha": ha_model_ids.contains(&m.mid),
            "ha_subchannels": ha_model_subs.get(&m.mid).cloned().unwrap_or_default(),
            "created_at": m.created_at,
        }));
    }

    marketplace_models.sort_by(|a, b| {
        let sa = a.get("sort_order").and_then(|v| v.as_i64()).unwrap_or(0);
        let sb = b.get("sort_order").and_then(|v| v.as_i64()).unwrap_or(0);
        sb.cmp(&sa)
    });

    // 按 original_id 分组结合 type_id（如为空则用 model_id），每组保留所有变体
    let mut grouped_map: std::collections::HashMap<String, Vec<serde_json::Value>> =
        std::collections::HashMap::new();
    let mut grouped_order: Vec<String> = Vec::new();
    for m in &marketplace_models {
        let original_id = m
            .get("original_id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let model_id = m
            .get("model_id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let base_key = if !original_id.is_empty() {
            original_id
        } else {
            model_id.clone()
        };
        let type_id = m.get("type_id").and_then(|v| v.as_i64()).unwrap_or(0);
        let group_key = format!("{}::{}", base_key, type_id);

        if !grouped_map.contains_key(&group_key) {
            grouped_order.push(group_key.clone());
        }
        grouped_map.entry(group_key).or_default().push(m.clone());
    }
    let grouped_models: Vec<serde_json::Value> = grouped_order
        .into_iter()
        .filter_map(|group_key| {
            let variants = grouped_map.remove(&group_key)?;
            // 以 sort_order 最高的变体作为主展示
            let primary = &variants[0];
            let mut group = primary.clone();
            group["variant_count"] = json!(variants.len());
            group["variants"] = json!(variants);
            // 使用 base_key 作为 group 的 model_id 标识供前端展示
            let original_id = primary
                .get("original_id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let model_id = primary
                .get("model_id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let base_key = if !original_id.is_empty() {
                original_id
            } else {
                model_id
            };
            group["model_id"] = json!(base_key);

            Some(group)
        })
        .collect();

    let active_provider_ids: std::collections::HashSet<i64> = marketplace_models
        .iter()
        .filter_map(|m| m.get("provider_id").and_then(|v| v.as_i64()))
        .collect();
    let active_type_ids: std::collections::HashSet<i64> = marketplace_models
        .iter()
        .filter_map(|m| m.get("type_id").and_then(|v| v.as_i64()))
        .collect();

    let provider_list: Vec<serde_json::Value> = providers
        .iter()
        .filter(|p| active_provider_ids.contains(&p.id))
        .map(|p| json!({"id": p.id, "name": p.name, "logo": p.logo}))
        .collect();

    let type_list: Vec<serde_json::Value> = types
        .iter()
        .filter(|t| active_type_ids.contains(&t.id))
        .map(|t| json!({"id": t.id, "name": t.name, "logo": t.logo}))
        .collect();

    let result = json!({
        "enabled": true,
        "models": marketplace_models,
        "grouped_models": grouped_models,
        "providers": provider_list,
        "types": type_list,
        "total": marketplace_models.len(),
        "group_total": grouped_models.len(),
    });

    // 5. 写入缓存
    {
        let mut cache = get_marketplace_cache().write().await;
        cache.data = Some(result.clone());
        cache.updated_at = Instant::now();
    }

    Ok(Json(result))
}

pub async fn is_plugin_enabled(state: &crate::AppState, name: &str) -> bool {
    let enabled: Option<i64> = match sqlx::query_scalar(
        &state
            .db
            .format_query("SELECT is_enabled FROM plugins WHERE name = ?"),
    )
    .bind(name)
    .fetch_optional(&state.db.pool)
    .await
    {
        Ok(val) => val,
        Err(_) => None,
    };
    enabled.unwrap_or(0) == 1
}

// ── 火山画质增强插件配置 API 与连接自测试实现 ──

#[cfg(feature = "plugin_volcengine_enhance")]
#[derive(serde::Deserialize, serde::Serialize, Clone)]
pub struct VolcCredential {
    pub id: String,
    pub name: String,
    pub api_key: String,
    pub base_url: String,
}

#[cfg(feature = "plugin_volcengine_enhance")]
#[derive(serde::Deserialize)]
pub struct VolcEnhanceConfigRequest {
    pub keys: Option<Vec<VolcCredential>>,
    pub active_mids: Option<Vec<String>>,
}

#[cfg(feature = "plugin_volcengine_enhance")]
pub async fn get_volcengine_enhance_config(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<crate::auth::Claims>,
) -> crate::error::AppResult<Json<serde_json::Value>> {
    let role: String =
        sqlx::query_scalar(&state.db.format_query("SELECT role FROM users WHERE id = ?"))
            .bind(&claims.sub)
            .fetch_one(&state.db.pool)
            .await?;
    if role != "admin" {
        return Err(crate::error::AppError::Forbidden(
            "需要管理员权限".to_string(),
        ));
    }

    let configs = load_plugin_configs(&state, "volcengine_enhance")
        .await
        .unwrap_or_default();

    // 从 plugin_configs 中拉取多凭证列表 keys 字段并解析
    let keys_str = configs.get("keys").cloned().unwrap_or_default();
    let mut keys: Vec<VolcCredential> = if !keys_str.is_empty() {
        serde_json::from_str(&keys_str).unwrap_or_default()
    } else {
        Vec::new()
    };

    // 向上兼容：若 keys 为空，则从原有的单个 api_key 构建默认凭证
    if keys.is_empty() {
        if let Some(old_api_key) = configs.get("api_key") {
            if !old_api_key.trim().is_empty() {
                keys.push(VolcCredential {
                    id: "default".to_string(),
                    name: "默认凭证".to_string(),
                    api_key: old_api_key.clone(),
                    base_url: "https://mediakit.cn-beijing.volces.com".to_string(),
                });
            }
        }
    }

    let preset_mids = vec!["vve-sd", "vve-pf", "vve-ft", "vve-gt", "vvs-er", "vvs-ep"];
    let models_status: Vec<(String, i32)> = sqlx::query_as(
        &state
            .db
            .format_query("SELECT mid, is_active FROM models WHERE mid = ANY(?)"),
    )
    .bind(&preset_mids)
    .fetch_all(&state.db.pool)
    .await?;

    let active_mids: Vec<String> = models_status
        .into_iter()
        .filter(|(_, active)| *active == 1)
        .map(|(mid, _)| mid)
        .collect();

    Ok(Json(
        serde_json::json!({ "keys": keys, "active_mids": active_mids }),
    ))
}

#[cfg(feature = "plugin_volcengine_enhance")]
pub async fn save_volcengine_enhance_config(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<crate::auth::Claims>,
    Json(payload): Json<VolcEnhanceConfigRequest>,
) -> crate::error::AppResult<Json<serde_json::Value>> {
    let role: String =
        sqlx::query_scalar(&state.db.format_query("SELECT role FROM users WHERE id = ?"))
            .bind(&claims.sub)
            .fetch_one(&state.db.pool)
            .await?;
    if role != "admin" {
        return Err(crate::error::AppError::Forbidden(
            "需要管理员权限".to_string(),
        ));
    }

    // 仅在传入了 keys 时保存多凭证列表
    if let Some(ref keys) = payload.keys {
        let keys_json = serde_json::to_string(keys).unwrap_or_else(|_| "[]".to_string());
        upsert_config(&state, "volcengine_enhance", "keys", &keys_json).await?;

        // 向上兼容写入第一个 api_key
        if let Some(first_key) = keys.first() {
            upsert_config(&state, "volcengine_enhance", "api_key", &first_key.api_key).await?;
        } else {
            upsert_config(&state, "volcengine_enhance", "api_key", "").await?;
        }
    }

    // 仅在传入了 active_mids 时更新模型激活状态
    if let Some(active_mids) = payload.active_mids {
        let preset_mids = vec!["vve-sd", "vve-pf", "vve-ft", "vve-gt", "vvs-er", "vvs-ep"];
        let provider_id: Option<i64> = sqlx::query_scalar(&state.db.format_query(
            "SELECT id FROM model_api_providers WHERE name ILIKE '%火山%' OR name ILIKE '%volcengine%' LIMIT 1"
        )).fetch_optional(&state.db.pool).await?;

        // 一键重置火山引擎专属预置模型为未激活状态，并更新归属服务商（保障基础数据准确）
        sqlx::query(&state.db.format_query(
            "UPDATE models SET \
             api_provider_id = ?, \
             is_active = 0, \
             updated_at = CURRENT_TIMESTAMP \
             WHERE mid = ANY(?)",
        ))
        .bind(provider_id)
        .bind(&preset_mids)
        .execute(&state.db.pool)
        .await?;

        // 根据前端提交的激活列表，过滤出火山专属模型
        let active_mids_filtered: Vec<String> = active_mids
            .into_iter()
            .filter(|mid| preset_mids.contains(&mid.as_str()))
            .collect();

        // 校验要激活的模型是否已配置服务商、计费规则和转发规则，保证数据的严谨性
        if !active_mids_filtered.is_empty() {
            let incomplete_names: Vec<String> = sqlx::query_scalar(&state.db.format_query(
                "SELECT name FROM models \
                 WHERE mid = ANY(?) \
                 AND ( \
                     provider_id IS NULL \
                     OR billing_rule_id IS NULL \
                     OR forward_rule_ids IS NULL \
                     OR forward_rule_ids = '' \
                     OR forward_rule_ids = '[]' \
                 )",
            ))
            .bind(&active_mids_filtered)
            .fetch_all(&state.db.pool)
            .await?;

            if !incomplete_names.is_empty() {
                let err_msg = format!(
                    "模型「{}」尚未完善官方服务商、计费规则或转发规则，请先前往「模型管理」完善配置后，再在插件中激活！",
                    incomplete_names.join("、")
                );
                return Err(crate::error::AppError::BadRequest(err_msg));
            }

            sqlx::query(&state.db.format_query(
                "UPDATE models SET \
                 is_active = 1, \
                 updated_at = CURRENT_TIMESTAMP \
                 WHERE mid = ANY(?)",
            ))
            .bind(&active_mids_filtered)
            .execute(&state.db.pool)
            .await?;
        }
    }

    Ok(Json(
        serde_json::json!({ "message": "火山画质增强配置已更新" }),
    ))
}

#[cfg(feature = "plugin_volcengine_enhance")]
pub async fn test_volcengine_connection(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<crate::auth::Claims>,
    Json(payload): Json<serde_json::Value>,
) -> crate::error::AppResult<Json<serde_json::Value>> {
    let role: String =
        sqlx::query_scalar(&state.db.format_query("SELECT role FROM users WHERE id = ?"))
            .bind(&claims.sub)
            .fetch_one(&state.db.pool)
            .await?;
    if role != "admin" {
        return Err(crate::error::AppError::Forbidden(
            "需要管理员权限".to_string(),
        ));
    }

    let api_key = payload
        .get("api_key")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    let base_url = payload
        .get("base_url")
        .and_then(|v| v.as_str())
        .unwrap_or("https://mediakit.cn-beijing.volces.com");
    if api_key.is_empty() {
        return Err(crate::error::AppError::BadRequest(
            "API Key 不能为空".to_string(),
        ));
    }

    let client = reqwest::Client::new();
    let test_url = format!("{}/api/v1/tasks/ping-test", base_url.trim_end_matches('/'));
    let resp = client
        .get(&test_url)
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .await;

    match resp {
        Ok(r) => {
            if r.status() == 401 {
                Ok(Json(
                    serde_json::json!({ "success": false, "message": "上游返回 401 Unauthorized，请检查 API Key 是否有效" }),
                ))
            } else {
                Ok(Json(
                    serde_json::json!({ "success": true, "message": "通道连接成功" }),
                ))
            }
        }
        Err(e) => Ok(Json(
            serde_json::json!({ "success": false, "message": format!("连接上游网络失败: {}", e) }),
        )),
    }
}

#[cfg(feature = "plugin_volcengine_enhance")]
#[derive(Debug, serde::Deserialize)]
pub struct VolcLogQuery {
    pub page: Option<i64>,
    pub page_size: Option<i64>,
    pub keyword: Option<String>,
}

#[cfg(feature = "plugin_volcengine_enhance")]
#[derive(Debug, serde::Serialize, sqlx::FromRow)]
pub struct VolcEnhanceLog {
    pub id: i64,
    pub log_id: Option<String>,
    pub user_id: String,
    pub model: String,
    pub cost: f64,
    pub latency_ms: i32,
    pub status_code: i32,
    pub billing_detail: Option<String>,
    pub billing_features: Option<String>,
    pub created_at: DbTs,
    pub user_uid: Option<String>,
    pub user_nickname: Option<String>,
    pub channel_name: Option<String>,
    pub model_name: Option<String>,
    pub task_id: Option<String>,
    pub request_content: Option<String>,
    pub response_content: Option<String>,
    pub upstream_req_content: Option<String>,
    pub error_message: Option<String>,
}

#[cfg(feature = "plugin_volcengine_enhance")]
pub async fn get_volcengine_enhance_logs(
    State(state): State<Arc<AppState>>,
    axum::extract::Query(query): axum::extract::Query<VolcLogQuery>,
    Extension(claims): Extension<crate::auth::Claims>,
) -> crate::error::AppResult<Json<serde_json::Value>> {
    let role: String =
        sqlx::query_scalar(&state.db.format_query("SELECT role FROM users WHERE id = ?"))
            .bind(&claims.sub)
            .fetch_one(&state.db.pool)
            .await?;
    if role != "admin" {
        return Err(crate::error::AppError::Forbidden(
            "需要管理员权限".to_string(),
        ));
    }

    let page = query.page.unwrap_or(1).max(1);
    let page_size = query.page_size.unwrap_or(15).clamp(1, 100);
    let offset = (page - 1) * page_size;

    let keyword = query.keyword.as_deref().unwrap_or("").trim().to_string();
    let mut where_clause =
        "WHERE l.plugin_tag IN ('vve-sd', 'vve-pf', 'vve-ft', 'vve-gt', 'vvs-er', 'vvs-ep')"
            .to_string();

    if !keyword.is_empty() {
        where_clause.push_str(
            " AND (l.log_id LIKE ? OR l.model LIKE ? OR u.uid LIKE ? OR u.username LIKE ?)",
        );
    }

    let kw = if !keyword.is_empty() {
        Some(format!("%{}%", keyword))
    } else {
        None
    };

    let count_sql = state.db.format_query(&format!(
        "SELECT COUNT(*) FROM logs l \
         LEFT JOIN users u ON l.user_id = u.id \
         {}",
        where_clause
    ));
    let mut count_q = sqlx::query_scalar::<_, i64>(&count_sql);
    if let Some(ref val) = kw {
        count_q = count_q.bind(val).bind(val).bind(val).bind(val);
    }
    let total: i64 = count_q.fetch_one(&state.db.pool).await?;

    let data_sql = state.db.format_query(&format!(
        "SELECT \
            l.id, \
            l.log_id, \
            l.user_id, \
            l.model, \
            l.cost, \
            l.latency_ms, \
            l.status_code, \
            l.billing_detail, \
            l.billing_features, \
            l.created_at, \
            u.uid as user_uid, \
            u.username as user_nickname, \
            c.name as channel_name, \
            m.name as model_name, \
            l.task_id, \
            l.request_content, \
            l.response_content, \
            l.upstream_req_content, \
            l.error_message \
         FROM logs l \
         LEFT JOIN users u ON l.user_id = u.id \
         LEFT JOIN channels c ON l.channel_id = c.id \
         LEFT JOIN (SELECT DISTINCT ON (model_id) model_id, mid, name FROM models ORDER BY model_id) m ON l.model = m.model_id \
         {} \
         ORDER BY l.id DESC LIMIT ? OFFSET ?",
        where_clause
    ));

    let mut data_q = sqlx::query_as::<_, VolcEnhanceLog>(&data_sql);
    if let Some(ref val) = kw {
        data_q = data_q.bind(val).bind(val).bind(val).bind(val);
    }
    let logs: Vec<VolcEnhanceLog> = data_q
        .bind(page_size)
        .bind(offset)
        .fetch_all(&state.db.pool)
        .await?;

    Ok(Json(serde_json::json!({
        "logs": logs,
        "total": total,
        "page": page,
        "page_size": page_size,
    })))
}
