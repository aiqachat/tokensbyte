//! GET /v1/models & GET /api/v3/models
//! 返回系统模型列表，数据源为模型广场已启用的模型。
//! 响应格式兼容 OpenAI 标准（火山方舟 /api/v3/models 格式与 OpenAI 一致）。

use axum::{extract::{State, Extension}, Json};
use serde_json::json;
use std::sync::Arc;
use crate::{AppState, error::AppResult};
use crate::models::ApiToken;

/// GET /v1/models | /api/v3/models — 获取可用模型列表
pub async fn list_models(
    State(state): State<Arc<AppState>>,
    Extension(_token): Extension<ApiToken>,
) -> AppResult<Json<serde_json::Value>> {
    // 首先读取模型广场配置，复用 whitelist/blacklist 逻辑筛选可见模型
    let is_mp_enabled: bool = sqlx::query_scalar::<_, i64>(
        &state.db.format_query("SELECT is_enabled FROM plugins WHERE name = 'model_marketplace'")
    ).fetch_optional(&state.db.pool).await.unwrap_or(None) == Some(1);

    let configs = if is_mp_enabled {
        crate::api::plugins::load_plugin_configs_pub(&state, "model_marketplace").await.unwrap_or_default()
    } else {
        std::collections::HashMap::new()
    };
    let display_mode = configs.get("mp_display_mode").map(|s| s.as_str()).unwrap_or("blacklist");
    let is_blacklist = display_mode == "blacklist";

    // 优化：如果为白名单模式且没有任何配置开启的模型，直接跳过数据库查询
    let has_enabled_models = is_blacklist || configs.iter().any(|(k, v)| {
        k.starts_with("mp_model_id_") && serde_json::from_str::<serde_json::Value>(v)
            .map(|json| json.get("enabled").and_then(|e| e.as_bool()) == Some(true))
            .unwrap_or(false)
    });
    if !has_enabled_models {
        return Ok(Json(json!({
            "object": "list",
            "data": []
        })));
    }

    // 查询已启用的模型及其分类信息
    let models: Vec<crate::models::Model> = sqlx::query_as(
        &state.db.format_query("SELECT * FROM models WHERE is_active = 1 ORDER BY id ASC")
    ).fetch_all(&state.db.pool).await?;

    let providers: Vec<crate::models::ModelProvider> = sqlx::query_as(
        &state.db.format_query("SELECT * FROM model_providers WHERE is_active = 1")
    ).fetch_all(&state.db.pool).await?;

    // 读取模型广场配置，复用 whitelist/blacklist 逻辑筛选可见模型


    let mut data: Vec<serde_json::Value> = Vec::new();

    for m in &models {
        // 模型广场可见性判断（与 get_marketplace_public 逻辑一致）
        let config_key = format!("mp_model_id_{}", m.id);
        let model_conf: serde_json::Value = configs.get(&config_key)
            .and_then(|s| serde_json::from_str(s).ok())
            .unwrap_or(json!({}));
        let is_enabled = model_conf.get("enabled")
            .and_then(|v| v.as_bool())
            .unwrap_or(is_blacklist); // 白名单模式默认隐藏，黑名单模式默认展示
        if !is_enabled { continue; }

        // 解析 owned_by（取 provider 名称，兜底 "system"）
        let owned_by = m.provider_id
            .and_then(|pid| providers.iter().find(|p| p.id == pid))
            .map(|p| p.name_en.as_str())
            .filter(|s| !s.is_empty())
            .or_else(|| m.provider_id
                .and_then(|pid| providers.iter().find(|p| p.id == pid))
                .map(|p| p.name.as_str()))
            .unwrap_or("system");

        // 将 created_at 字符串解析为 Unix 时间戳（秒）
        let created = parse_timestamp(&m.created_at);

        data.push(json!({
            "id": m.model_id,
            "object": "model",
            "created": created,
            "owned_by": owned_by,
        }));
    }

    // 按 model_id 去重（同一 model_id 可能因不同定价方案存在多条记录）
    let mut seen = std::collections::HashSet::new();
    data.retain(|item| {
        let id = item["id"].as_str().unwrap_or("").to_string();
        seen.insert(id)
    });

    Ok(Json(json!({
        "object": "list",
        "data": data,
    })))
}

/// 将数据库时间字符串解析为 Unix 时间戳（秒）
/// 支持多种格式，解析失败时返回 0
fn parse_timestamp(s: &str) -> i64 {
    // 尝试 ISO 8601 / PostgreSQL 默认格式
    if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S%.f") {
        return dt.and_utc().timestamp();
    }
    if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S%.f") {
        return dt.and_utc().timestamp();
    }
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(s) {
        return dt.timestamp();
    }
    0
}
