use axum::{
    extract::{Path, State, Extension},
    routing::{get, put},
    Json, Router,
};
use std::sync::Arc;
use serde::{Deserialize, Serialize};
use serde_json::json;
use crate::{
    error::{AppResult, AppError},
    AppState,
    auth,
};

// ── 数据模型 ──

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow, Clone)]
pub struct RouterFlowGroup {
    pub id: i64,
    pub user_id: String,
    pub name: String,
    pub description: Option<String>,
    pub route_rule: String,       // price / speed / stability
    pub model_ids: String,        // JSON array of model mid
    pub endpoint_id: String,      // ep-tokensbyteXXXX unique inference endpoint
    pub is_active: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateGroupRequest {
    pub name: String,
    pub description: Option<String>,
    pub route_rule: Option<String>,
    pub model_ids: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateGroupRequest {
    pub name: Option<String>,
    pub description: Option<String>,
    pub route_rule: Option<String>,
    pub model_ids: Option<Vec<String>>,
    pub is_active: Option<i64>,
}

// ── 路由配置 ──

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/groups", get(list_groups).post(create_group))
        .route("/groups/{id}", put(update_group).delete(delete_group))
        .route("/available-models", get(list_available_models))
        .route("/channel-groups", get(list_channel_groups))
        .route("/rules", get(list_rules))
}

// ── 路由规则定义 ──

/// 返回系统内置路由规则列表
async fn list_rules() -> AppResult<Json<serde_json::Value>> {
    let rules = vec![
        json!({
            "id": "price",
            "name": "价格优先",
            "name_en": "Price Priority",
            "icon": "💰",
            "description": "每次请求优先调用定价最低的模型渠道。如果同一模型同时存在按次计费和按 Token 计费渠道，优先调用按次计费渠道以控制成本。当最低价渠道不可用时自动切换到次低价渠道。",
            "description_en": "Routes to the cheapest model channel. Prefers per-call billing over per-token when both exist. Falls back to next cheapest on failure.",
            "features": [
                "自动选择最低价渠道",
                "按次计费优先于按 Token 计费",
                "故障自动降级到次低价渠道",
                "支持渠道额度耗尽自动切换"
            ]
        }),
        json!({
            "id": "speed",
            "name": "速度优先",
            "name_en": "Speed Priority",
            "icon": "⚡",
            "description": "基于历史响应延迟数据智能调度，优先选择平均响应速度最快的渠道。系统持续追踪每个渠道的 P50/P95 延迟指标，超时渠道自动降权。新加入的渠道将获得一定的探测权重以评估其性能。",
            "description_en": "Routes based on historical latency data. Picks the channel with lowest average response time. Tracks P50/P95 metrics, auto-deprioritizes slow channels.",
            "features": [
                "基于历史延迟智能调度",
                "持续追踪响应时间指标",
                "超时渠道自动降权",
                "新渠道自动探测评估",
                "高并发时自动负载均衡"
            ]
        }),
        json!({
            "id": "stability",
            "name": "稳定优先",
            "name_en": "Stability Priority",
            "icon": "🛡️",
            "description": "优先调用价格较高、服务稳定性更强的渠道（价格越高通常代表越可靠的服务）。根据渠道优先级和健康状态进行加权调度，错误率高的渠道自动隔离冷却。适合对可用性要求极高的生产环境。",
            "description_en": "Prefers higher-priced, more reliable channels. Uses priority-weighted scheduling with health checks. Isolates error-prone channels automatically.",
            "features": [
                "价格越高优先级越高（稳定性指标）",
                "基于渠道优先级加权调度",
                "错误率过高自动隔离冷却",
                "健康检查与故障自愈",
                "渠道恢复后自动重新纳入调度"
            ]
        }),
    ];

    Ok(Json(json!({ "rules": rules })))
}

// ── 渠道分组列表 ──

/// 用户：获取当前用户等级可见的渠道分组列表
async fn list_channel_groups(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    // 通过 JOIN 获取 user_group 和 level_id
    let user_row: Option<(String, Option<i64>)> = sqlx::query_as(
        &state.db.format_query(
            "SELECT u.user_group, ul.id FROM users u \
             LEFT JOIN user_levels ul ON u.user_group = ul.group_key \
             WHERE u.id = ?"
        )
    )
    .bind(&claims.sub)
    .fetch_optional(&state.db.pool)
    .await?;

    let (user_group, level_id) = user_row.unwrap_or(("default".to_string(), None));
    let level_id_str = level_id.map(|l| l.to_string()).unwrap_or_default();

    // 查询所有启用的渠道，按 group_aid 分组
    let channels: Vec<(i64, String, Option<String>, String, String, String)> = sqlx::query_as(
        &state.db.format_query(
            "SELECT id, name, group_aid, models, user_groups, exclude_user_groups \
             FROM channels WHERE status = 1 ORDER BY sort_order DESC, priority DESC"
        )
    )
    .fetch_all(&state.db.pool)
    .await?;

    // 按 group_aid 聚合，同时过滤用户等级
    let mut groups: std::collections::BTreeMap<String, Vec<serde_json::Value>> = std::collections::BTreeMap::new();
    let mut group_names: std::collections::BTreeMap<String, String> = std::collections::BTreeMap::new();

    for (_id, name, group_aid, models_json, user_groups_json, exclude_groups_json) in &channels {
        // 检查用户等级是否匹配
        let ug: Vec<String> = serde_json::from_str(user_groups_json).unwrap_or_default();
        let eg: Vec<String> = serde_json::from_str(exclude_groups_json).unwrap_or_default();

        let allowed = ug.is_empty()
            || ug.contains(&user_group)
            || ug.contains(&level_id_str);
        let excluded = eg.contains(&user_group) || eg.contains(&level_id_str);

        if !allowed || excluded {
            continue;
        }

        let aid = group_aid.clone().unwrap_or_default();
        let key = if aid.is_empty() { format!("_no_group_{}", _id) } else { aid.clone() };

        group_names.entry(key.clone()).or_insert_with(|| name.clone());

        // 解析模型 mids
        let mids: Vec<String> = serde_json::from_str(models_json).unwrap_or_default();
        for mid in &mids {
            let entry = groups.entry(key.clone()).or_default();
            // 避免重复
            if !entry.iter().any(|v| v.get("mid").and_then(|m| m.as_str()) == Some(mid)) {
                entry.push(json!({ "mid": mid }));
            }
        }
    }

    // 为每个模型 mid 查名称
    let mut result = Vec::new();
    for (group_key, model_entries) in &groups {
        let mut enriched_models = Vec::new();
        for entry in model_entries {
            let mid = entry["mid"].as_str().unwrap_or_default();
            let row: Option<(String, String, Option<String>, Option<i64>)> = sqlx::query_as(
                &state.db.format_query(
                    "SELECT name, model_id, logo, billing_rule_id FROM models WHERE mid = ? AND is_active = 1"
                )
            )
            .bind(mid)
            .fetch_optional(&state.db.pool)
            .await
            .unwrap_or(None);

            if let Some((name, model_id, logo, billing_rule_id)) = row {
                let billing_type = if let Some(br_id) = billing_rule_id {
                    let bt: Option<String> = sqlx::query_scalar(
                        &state.db.format_query("SELECT billing_type FROM billing_rules WHERE id = ?")
                    )
                    .bind(br_id)
                    .fetch_optional(&state.db.pool)
                    .await
                    .unwrap_or(None);
                    bt.unwrap_or_else(|| "tokens".to_string())
                } else {
                    "tokens".to_string()
                };

                enriched_models.push(json!({
                    "mid": mid,
                    "name": name,
                    "model_id": model_id,
                    "logo": logo,
                    "billing_type": billing_type,
                }));
            }
        }

        if !enriched_models.is_empty() {
            result.push(json!({
                "group_aid": group_key,
                "group_name": group_names.get(group_key).cloned().unwrap_or_default(),
                "models": enriched_models,
            }));
        }
    }

    Ok(Json(json!({ "channel_groups": result })))
}

// ── 可用模型列表 (flat, 兼容) ──

/// 用户：获取当前用户等级下可用的模型列表
async fn list_available_models(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    // 通过 JOIN 获取 user_group 和 level_id
    let user_row: Option<(String, Option<i64>)> = sqlx::query_as(
        &state.db.format_query(
            "SELECT u.user_group, ul.id FROM users u \
             LEFT JOIN user_levels ul ON u.user_group = ul.group_key \
             WHERE u.id = ?"
        )
    )
    .bind(&claims.sub)
    .fetch_optional(&state.db.pool)
    .await?;

    let (user_group, level_id) = user_row.unwrap_or(("default".to_string(), None));
    let level_id_str = level_id.map(|l| l.to_string()).unwrap_or_default();

    // 查询所有激活的模型
    let models: Vec<(i64, String, String, String, Option<i64>, Option<String>, Option<String>)> = sqlx::query_as(
        &state.db.format_query(
            "SELECT m.id, m.mid, m.name, m.model_id, m.billing_rule_id, m.logo, m.description \
             FROM models m WHERE m.is_active = 1 ORDER BY m.name ASC"
        )
    )
    .fetch_all(&state.db.pool)
    .await?;

    // 查询哪些 mid 的模型有可用渠道（匹配用户等级）
    let mut available_models = Vec::new();
    for (id, mid, name, model_id, billing_rule_id, logo, description) in &models {
        let count: i64 = sqlx::query_scalar(
            &state.db.format_query(
                &format!(
                    "SELECT COUNT(*) FROM channels WHERE status = 1 \
                     AND (models LIKE '%\"{}%' OR models LIKE '%\"{}%' OR models = '[]') \
                     AND (user_groups LIKE ? OR user_groups LIKE ? OR user_groups = '[]')",
                    mid, model_id
                )
            )
        )
        .bind(format!("%\"{}%", user_group))
        .bind(format!("%\"{}%", level_id_str))
        .fetch_one(&state.db.pool)
        .await
        .unwrap_or(0);

        if count > 0 {
            let billing_type = if let Some(br_id) = billing_rule_id {
                let bt: Option<String> = sqlx::query_scalar(
                    &state.db.format_query("SELECT billing_type FROM billing_rules WHERE id = ?")
                )
                .bind(br_id)
                .fetch_optional(&state.db.pool)
                .await
                .unwrap_or(None);
                bt.unwrap_or_else(|| "tokens".to_string())
            } else {
                "tokens".to_string()
            };

            available_models.push(json!({
                "id": id,
                "mid": mid,
                "name": name,
                "model_id": model_id,
                "billing_type": billing_type,
                "channel_count": count,
                "logo": logo,
                "description": description,
            }));
        }
    }

    Ok(Json(json!({ "models": available_models })))
}

// ── CRUD 路由组 ──

/// 用户：列出自己的路由组
async fn list_groups(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    let groups: Vec<RouterFlowGroup> = sqlx::query_as(
        &state.db.format_query("SELECT * FROM router_flow_groups WHERE user_id = ? ORDER BY created_at DESC")
    )
    .bind(&claims.sub)
    .fetch_all(&state.db.pool)
    .await?;

    let mut result = Vec::new();
    for g in &groups {
        let model_mids: Vec<String> = serde_json::from_str(&g.model_ids).unwrap_or_default();
        let mut model_details = Vec::new();

        for mid in &model_mids {
            let row: Option<(String, String, Option<String>)> = sqlx::query_as(
                &state.db.format_query("SELECT name, model_id, logo FROM models WHERE mid = ? AND is_active = 1")
            )
            .bind(mid)
            .fetch_optional(&state.db.pool)
            .await
            .unwrap_or(None);

            if let Some((name, model_id, logo)) = row {
                model_details.push(json!({
                    "mid": mid,
                    "name": name,
                    "model_id": model_id,
                    "logo": logo,
                }));
            } else {
                model_details.push(json!({
                    "mid": mid,
                    "name": format!("未知模型 ({})", mid),
                    "model_id": "",
                    "logo": null,
                }));
            }
        }

        result.push(json!({
            "id": g.id,
            "name": g.name,
            "description": g.description,
            "route_rule": g.route_rule,
            "model_ids": model_mids,
            "model_details": model_details,
            "endpoint_id": g.endpoint_id,
            "is_active": g.is_active,
            "created_at": g.created_at,
            "updated_at": g.updated_at,
        }));
    }

    Ok(Json(json!({ "groups": result })))
}

/// 用户：创建路由组
async fn create_group(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Json(payload): Json<CreateGroupRequest>,
) -> AppResult<Json<serde_json::Value>> {
    if payload.name.trim().is_empty() {
        return Err(AppError::BadRequest("路由组名称不能为空".to_string()));
    }

    if payload.model_ids.len() < 2 {
        return Err(AppError::BadRequest("路由组至少需要绑定 2 个模型".to_string()));
    }

    let rule = payload.route_rule.as_deref().unwrap_or("price");
    if !["price", "speed", "stability"].contains(&rule) {
        return Err(AppError::BadRequest("无效的路由策略".to_string()));
    }

    let model_ids_json = serde_json::to_string(&payload.model_ids).unwrap_or("[]".to_string());

    // 生成唯一推理节点 ID: ep-tokensbyte + 8位随机字母数字
    let endpoint_id = loop {
        use rand::Rng;
        let suffix: String = (0..8)
            .map(|_| {
                let idx = rand::thread_rng().gen_range(0..36u32);
                if idx < 10 { (b'0' + idx as u8) as char } else { (b'a' + (idx - 10) as u8) as char }
            })
            .collect();
        let ep = format!("ep-tokensbyte{}", suffix);
        let exists: i64 = sqlx::query_scalar(
            &state.db.format_query("SELECT COUNT(*) FROM router_flow_groups WHERE endpoint_id = ?")
        ).bind(&ep).fetch_one(&state.db.pool).await.unwrap_or(0);
        if exists == 0 { break ep; }
    };

    let id: i64 = sqlx::query_scalar(
        &state.db.format_query(
            "INSERT INTO router_flow_groups (user_id, name, description, route_rule, model_ids, endpoint_id) \
             VALUES (?, ?, ?, ?, ?, ?) RETURNING id"
        )
    )
    .bind(&claims.sub)
    .bind(payload.name.trim())
    .bind(payload.description.as_deref().unwrap_or(""))
    .bind(rule)
    .bind(&model_ids_json)
    .bind(&endpoint_id)
    .fetch_one(&state.db.pool)
    .await?;

    Ok(Json(json!({ "message": "路由组创建成功", "id": id, "endpoint_id": endpoint_id })))
}

/// 用户：更新路由组
async fn update_group(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Extension(claims): Extension<auth::Claims>,
    Json(payload): Json<UpdateGroupRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let owner: Option<String> = sqlx::query_scalar(
        &state.db.format_query("SELECT user_id FROM router_flow_groups WHERE id = ?")
    )
    .bind(id)
    .fetch_optional(&state.db.pool)
    .await?;

    match owner {
        Some(uid) if uid == claims.sub => {}
        Some(_) => return Err(AppError::Unauthorized),
        None => return Err(AppError::NotFound("路由组不存在".to_string())),
    }

    if let Some(ref name) = payload.name {
        sqlx::query(&state.db.format_query("UPDATE router_flow_groups SET name = ?, updated_at = now()::text WHERE id = ?"))
            .bind(name.trim())
            .bind(id)
            .execute(&state.db.pool)
            .await?;
    }

    if let Some(ref desc) = payload.description {
        sqlx::query(&state.db.format_query("UPDATE router_flow_groups SET description = ?, updated_at = now()::text WHERE id = ?"))
            .bind(desc)
            .bind(id)
            .execute(&state.db.pool)
            .await?;
    }

    if let Some(ref rule) = payload.route_rule {
        if !["price", "speed", "stability"].contains(&rule.as_str()) {
            return Err(AppError::BadRequest("无效的路由策略".to_string()));
        }
        sqlx::query(&state.db.format_query("UPDATE router_flow_groups SET route_rule = ?, updated_at = now()::text WHERE id = ?"))
            .bind(rule)
            .bind(id)
            .execute(&state.db.pool)
            .await?;
    }

    if let Some(ref mids) = payload.model_ids {
        if mids.len() < 2 {
            return Err(AppError::BadRequest("路由组至少需要绑定 2 个模型".to_string()));
        }
        let json_str = serde_json::to_string(mids).unwrap_or("[]".to_string());
        sqlx::query(&state.db.format_query("UPDATE router_flow_groups SET model_ids = ?, updated_at = now()::text WHERE id = ?"))
            .bind(&json_str)
            .bind(id)
            .execute(&state.db.pool)
            .await?;
    }

    if let Some(active) = payload.is_active {
        sqlx::query(&state.db.format_query("UPDATE router_flow_groups SET is_active = ?, updated_at = now()::text WHERE id = ?"))
            .bind(active)
            .bind(id)
            .execute(&state.db.pool)
            .await?;
    }

    Ok(Json(json!({ "message": "路由组更新成功" })))
}

/// 用户：删除路由组
async fn delete_group(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    let owner: Option<String> = sqlx::query_scalar(
        &state.db.format_query("SELECT user_id FROM router_flow_groups WHERE id = ?")
    )
    .bind(id)
    .fetch_optional(&state.db.pool)
    .await?;

    match owner {
        Some(uid) if uid == claims.sub => {}
        Some(_) => return Err(AppError::Unauthorized),
        None => return Err(AppError::NotFound("路由组不存在".to_string())),
    }

    sqlx::query(&state.db.format_query("DELETE FROM router_flow_groups WHERE id = ?"))
        .bind(id)
        .execute(&state.db.pool)
        .await?;

    Ok(Json(json!({ "message": "路由组已删除" })))
}
