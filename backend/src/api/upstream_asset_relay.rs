/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

//! 上游素材中转插件 API
//!
//! GET/POST/PUT/DELETE /bindings
//! POST /bindings/{id}/generate-rule
//! GET /convert-logs

use crate::{
    auth,
    error::{AppError, AppResult},
    time_system::DbTs,
    AppState,
};
use axum::{
    extract::{Extension, Path, Query, State},
    routing::{get, post, put},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Arc;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/bindings", get(list_bindings).post(create_binding))
        .route("/bindings/{id}", put(update_binding).delete(delete_binding))
        .route("/bindings/{id}/generate-rule", post(generate_rule))
        .route("/convert-logs", get(list_convert_logs))
}

#[derive(Debug, Serialize, sqlx::FromRow)]
struct BindingRow {
    id: i64,
    name: String,
    channel_config_id: i64,
    asset_base_path: String,
    forward_rule_id: Option<i64>,
    group_id: Option<String>,
    is_active: i32,
    remark: Option<String>,
    created_at: DbTs,
    updated_at: DbTs,
    config_name: Option<String>,
    config_base_url: Option<String>,
    rule_name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CreateBindingReq {
    name: String,
    channel_config_id: i64,
    #[serde(default)]
    asset_base_path: String,
    #[serde(default)]
    group_id: Option<String>,
    #[serde(default)]
    remark: Option<String>,
    #[serde(default = "default_active")]
    is_active: i32,
}

fn default_active() -> i32 {
    1
}

#[derive(Debug, Deserialize)]
struct UpdateBindingReq {
    name: Option<String>,
    channel_config_id: Option<i64>,
    asset_base_path: Option<String>,
    group_id: Option<String>,
    remark: Option<String>,
    is_active: Option<i32>,
}

#[derive(Debug, Deserialize)]
struct LogQuery {
    #[serde(default = "default_page")]
    page: i64,
    #[serde(default = "default_page_size")]
    page_size: i64,
}

fn default_page() -> i64 {
    1
}
fn default_page_size() -> i64 {
    20
}

async fn require_admin(claims: &auth::Claims) -> AppResult<()> {
    if claims.role != "admin" {
        return Err(AppError::Forbidden("需要管理员权限".into()));
    }
    Ok(())
}

fn binding_select_sql(state: &AppState) -> String {
    state.db.format_query(
        "SELECT b.id, b.name, b.channel_config_id, b.asset_base_path, b.forward_rule_id, b.group_id, \
                b.is_active, b.remark, b.created_at, b.updated_at, \
                c.name AS config_name, c.base_url AS config_base_url, \
                r.name AS rule_name \
         FROM upstream_asset_bindings b \
         LEFT JOIN channel_configs c ON c.id = b.channel_config_id \
         LEFT JOIN forward_rules r ON r.id = b.forward_rule_id",
    )
}

async fn list_bindings(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&claims).await?;
    let sql = format!("{} ORDER BY b.id DESC", binding_select_sql(&state));
    let rows: Vec<BindingRow> = sqlx::query_as(&sql).fetch_all(&state.db.pool).await?;
    Ok(Json(json!({ "bindings": rows })))
}

async fn ensure_channel_config(state: &AppState, config_id: i64) -> AppResult<()> {
    let exists: Option<i64> = sqlx::query_scalar(
        &state
            .db
            .format_query("SELECT id FROM channel_configs WHERE id = ?"),
    )
    .bind(config_id)
    .fetch_optional(&state.db.pool)
    .await?;
    if exists.is_none() {
        return Err(AppError::BadRequest("上游渠道配置不存在".into()));
    }
    Ok(())
}

async fn create_binding(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Json(req): Json<CreateBindingReq>,
) -> AppResult<Json<BindingRow>> {
    require_admin(&claims).await?;
    let name = req.name.trim().to_string();
    if name.is_empty() {
        return Err(AppError::BadRequest("名称不能为空".into()));
    }
    ensure_channel_config(&state, req.channel_config_id).await?;

    let path = req.asset_base_path.trim().to_string();
    let id: i64 = sqlx::query_scalar(
        &state.db.format_query(
            "INSERT INTO upstream_asset_bindings (name, channel_config_id, asset_base_path, group_id, is_active, remark) \
             VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
        ),
    )
    .bind(&name)
    .bind(req.channel_config_id)
    .bind(&path)
    .bind(req.group_id.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(req.is_active)
    .bind(req.remark.as_deref())
    .fetch_one(&state.db.pool)
    .await?;

    Ok(Json(fetch_binding(&state, id).await?))
}

async fn fetch_binding(state: &AppState, id: i64) -> Result<BindingRow, sqlx::Error> {
    let sql = format!("{} WHERE b.id = ?", binding_select_sql(state));
    sqlx::query_as(&sql)
        .bind(id)
        .fetch_one(&state.db.pool)
        .await
}

async fn update_binding(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Path(id): Path<i64>,
    Json(req): Json<UpdateBindingReq>,
) -> AppResult<Json<BindingRow>> {
    require_admin(&claims).await?;
    let existing = fetch_binding(&state, id)
        .await
        .map_err(|_| AppError::NotFound("绑定不存在".into()))?;

    let name = req
        .name
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or(existing.name);
    let channel_config_id = req.channel_config_id.unwrap_or(existing.channel_config_id);
    if req.channel_config_id.is_some() {
        ensure_channel_config(&state, channel_config_id).await?;
    }
    let path = req
        .asset_base_path
        .map(|s| s.trim().to_string())
        .unwrap_or(existing.asset_base_path);
    let group_id = match req.group_id {
        Some(g) => {
            let t = g.trim().to_string();
            if t.is_empty() {
                None
            } else {
                Some(t)
            }
        }
        None => existing.group_id,
    };
    let remark = req.remark.or(existing.remark);
    let is_active = req.is_active.unwrap_or(existing.is_active);

    sqlx::query(&state.db.format_query(
        "UPDATE upstream_asset_bindings SET name=?, channel_config_id=?, asset_base_path=?, group_id=?, \
             remark=?, is_active=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
    ))
    .bind(&name)
    .bind(channel_config_id)
    .bind(&path)
    .bind(&group_id)
    .bind(&remark)
    .bind(is_active)
    .bind(id)
    .execute(&state.db.pool)
    .await?;

    Ok(Json(fetch_binding(&state, id).await?))
}

async fn delete_binding(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Path(id): Path<i64>,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&claims).await?;
    let r = sqlx::query(
        &state
            .db
            .format_query("DELETE FROM upstream_asset_bindings WHERE id = ?"),
    )
    .bind(id)
    .execute(&state.db.pool)
    .await?;
    if r.rows_affected() == 0 {
        return Err(AppError::NotFound("绑定不存在".into()));
    }
    // 不级联删除 forward_rules，避免误伤模型绑定
    Ok(Json(json!({ "ok": true })))
}

fn build_rule_config(binding_id: i64) -> String {
    json!({
        "mode": "transform",
        "target_type": "volcengine",
        "path_rewrite": {
            "old": "/v1/video/generations",
            "new": "/api/v3/contents/generations/tasks"
        },
        "auth_type": "bearer",
        "upstream_asset_convert": true,
        "upstream_asset_binding_id": binding_id
    })
    .to_string()
}

async fn generate_rule(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Path(id): Path<i64>,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&claims).await?;
    let binding = fetch_binding(&state, id)
        .await
        .map_err(|_| AppError::NotFound("绑定不存在".into()))?;

    if let Some(rid) = binding.forward_rule_id {
        let exists: Option<i64> = sqlx::query_scalar(
            &state
                .db
                .format_query("SELECT id FROM forward_rules WHERE id = ?"),
        )
        .bind(rid)
        .fetch_optional(&state.db.pool)
        .await?;
        if exists.is_some() {
            return Ok(Json(json!({
                "forward_rule_id": rid,
                "rule_name": binding.rule_name,
                "created": false,
                "binding": fetch_binding(&state, id).await?,
            })));
        }
    }

    let rule_name = format!("上游素材中转#{}", id);
    let config_json = build_rule_config(id);
    let description = format!(
        "由上游素材中转插件绑定#{} 自动生成（渠道: {}）",
        id,
        binding.config_name.as_deref().unwrap_or("-")
    );

    // 名称冲突时复用已有规则
    if let Some(existing_id) = sqlx::query_scalar::<_, i64>(
        &state
            .db
            .format_query("SELECT id FROM forward_rules WHERE name = ?"),
    )
    .bind(&rule_name)
    .fetch_optional(&state.db.pool)
    .await?
    {
        sqlx::query(
            &state.db.format_query(
                "UPDATE upstream_asset_bindings SET forward_rule_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            ),
        )
        .bind(existing_id)
        .bind(id)
        .execute(&state.db.pool)
        .await?;
        return Ok(Json(json!({
            "forward_rule_id": existing_id,
            "rule_name": rule_name,
            "created": false,
            "binding": fetch_binding(&state, id).await?,
        })));
    }

    use rand::Rng;
    let eid = format!("1{:04}", rand::thread_rng().gen_range(0..10000));

    let rule_id: i64 = sqlx::query_scalar(
        &state.db.format_query(
            "INSERT INTO forward_rules (name, rule_type, category, description, config_json, is_active, is_system, eid, sort_order) \
             VALUES (?, 'volcengine', '视频', ?, ?, 1, 0, ?, 0) RETURNING id",
        ),
    )
    .bind(&rule_name)
    .bind(&description)
    .bind(&config_json)
    .bind(&eid)
    .fetch_one(&state.db.pool)
    .await?;

    sqlx::query(
        &state.db.format_query(
            "UPDATE upstream_asset_bindings SET forward_rule_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        ),
    )
    .bind(rule_id)
    .bind(id)
    .execute(&state.db.pool)
    .await?;

    Ok(Json(json!({
        "forward_rule_id": rule_id,
        "rule_name": rule_name,
        "created": true,
        "config_json": serde_json::from_str::<serde_json::Value>(&config_json).unwrap_or(json!({})),
        "binding": fetch_binding(&state, id).await?,
    })))
}

#[derive(Debug, Serialize, sqlx::FromRow)]
struct LogRow {
    id: i64,
    user_id: String,
    plugin_name: String,
    api_endpoint: String,
    request_payload: Option<String>,
    response_payload: Option<String>,
    status_code: Option<i32>,
    source: String,
    created_at: DbTs,
}

async fn list_convert_logs(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Query(q): Query<LogQuery>,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&claims).await?;
    let page = q.page.max(1);
    let page_size = q.page_size.clamp(1, 100);
    let offset = (page - 1) * page_size;

    let total: i64 = sqlx::query_scalar(
        &state.db.format_query(
            "SELECT COUNT(*) FROM plugin_api_logs WHERE source = 'upstream_relay_convert' OR plugin_name LIKE 'uar:%'",
        ),
    )
    .fetch_one(&state.db.pool)
    .await
    .unwrap_or(0);

    let rows: Vec<LogRow> = sqlx::query_as(
        &state.db.format_query(
            "SELECT id, user_id, plugin_name, api_endpoint, request_payload, response_payload, status_code, source, created_at \
             FROM plugin_api_logs \
             WHERE source = 'upstream_relay_convert' OR plugin_name LIKE 'uar:%' \
             ORDER BY id DESC LIMIT ? OFFSET ?",
        ),
    )
    .bind(page_size)
    .bind(offset)
    .fetch_all(&state.db.pool)
    .await?;

    Ok(Json(
        json!({ "total": total, "page": page, "page_size": page_size, "logs": rows }),
    ))
}

#[cfg(test)]
mod tests {
    use super::build_rule_config;

    #[test]
    fn generated_config_has_no_asset_convert() {
        let s = build_rule_config(12);
        assert!(s.contains("\"upstream_asset_convert\":true"));
        assert!(s.contains("\"upstream_asset_binding_id\":12"));
        assert!(!s.contains("\"asset_convert\":true"));
        assert!(!s.contains("asset_convert_ns"));
    }
}
