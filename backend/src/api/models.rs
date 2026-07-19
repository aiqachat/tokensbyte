use axum::{
    extract::{Path, State},
    Json,
};
use rand::Rng;
use sqlx::Row;
use std::sync::Arc;

use crate::error::AppResult;
use crate::models::{CreateModelRequest, Model, ModelListResponse, UpdateModelRequest};
use crate::AppState;

#[derive(Debug, serde::Deserialize)]
pub struct ModelQuery {
    pub provider_id: Option<i64>,
    pub api_provider_id: Option<i64>,
    pub type_id: Option<i64>,
    pub page_size: Option<i64>,
    pub search: Option<String>, // 支持按 name / model_id / mid 搜索
}

pub async fn list_models(
    State(state): State<Arc<AppState>>,
    axum::extract::Query(query): axum::extract::Query<ModelQuery>,
) -> AppResult<Json<ModelListResponse>> {
    let mut sql = "SELECT * FROM models WHERE 1=1".to_string();
    if query.provider_id.is_some() {
        sql.push_str(" AND provider_id = ?");
    }
    if query.api_provider_id.is_some() {
        sql.push_str(" AND api_provider_id = ?");
    }
    if query.type_id.is_some() {
        sql.push_str(" AND type_id = ?");
    }
    if query.search.is_some() {
        sql.push_str(" AND (name ILIKE ? OR model_id ILIKE ? OR mid = ?)");
    }
    sql.push_str(" ORDER BY id DESC");
    if let Some(ps) = query.page_size {
        sql.push_str(&format!(" LIMIT {}", ps));
    }

    let formatted_sql = state.db.format_query(&sql);
    let mut q = sqlx::query_as::<_, Model>(&formatted_sql);
    if let Some(pid) = query.provider_id {
        q = q.bind(pid);
    }
    if let Some(apid) = query.api_provider_id {
        q = q.bind(apid);
    }
    if let Some(tid) = query.type_id {
        q = q.bind(tid);
    }
    if let Some(ref kw) = query.search {
        let like = format!("%{}%", kw);
        q = q.bind(like.clone()).bind(like).bind(kw);
    }

    let models = q.fetch_all(&state.db.pool).await?;

    // Total count for the filtered list
    let mut count_sql = "SELECT COUNT(*) FROM models WHERE 1=1".to_string();
    if query.provider_id.is_some() {
        count_sql.push_str(" AND provider_id = ?");
    }
    if query.api_provider_id.is_some() {
        count_sql.push_str(" AND api_provider_id = ?");
    }
    if query.type_id.is_some() {
        count_sql.push_str(" AND type_id = ?");
    }
    if query.search.is_some() {
        count_sql.push_str(" AND (name ILIKE ? OR model_id ILIKE ? OR mid = ?)");
    }

    let formatted_count_sql = state.db.format_query(&count_sql);
    let mut cq = sqlx::query_scalar::<_, i64>(&formatted_count_sql);
    if let Some(pid) = query.provider_id {
        cq = cq.bind(pid);
    }
    if let Some(apid) = query.api_provider_id {
        cq = cq.bind(apid);
    }
    if let Some(tid) = query.type_id {
        cq = cq.bind(tid);
    }
    if let Some(ref kw) = query.search {
        let like = format!("%{}%", kw);
        cq = cq.bind(like.clone()).bind(like).bind(kw);
    }

    let total = cq.fetch_one(&state.db.pool).await?;

    Ok(Json(ModelListResponse {
        data: models,
        total,
    }))
}

pub async fn create_model(
    State(state): State<Arc<AppState>>,
    Json(mut req): Json<CreateModelRequest>,
) -> AppResult<Json<Model>> {
    req.name = req.name.trim().to_string();
    req.model_id = req.model_id.trim().to_string();

    if req.name.is_empty() || req.model_id.is_empty() {
        return Err(crate::error::AppError::BadRequest(
            "名称和模型 ID 不能为空".to_string(),
        ));
    }

    // mid 是唯一标识，允许 name 和 model_id 重复（不同 mid 可对应相同 model_id，用于差异化计费）

    // 自动生成唯一 6 位 mid，固定以 "30" 开头
    let mid = loop {
        let candidate: String = {
            let n: u32 = rand::thread_rng().gen_range(300000..=309999);
            n.to_string()
        };
        let taken: Option<i64> =
            sqlx::query_scalar(&state.db.format_query("SELECT id FROM models WHERE mid = ?"))
                .bind(&candidate)
                .fetch_optional(&state.db.pool)
                .await?;
        if taken.is_none() {
            break candidate;
        }
    };

    let group_ratios = serde_json::to_string(&req.group_ratios.unwrap_or_default())
        .unwrap_or_else(|_| "{}".to_string());
    // 过滤掉不存在或已禁用的规则 ID，防止脏数据入库
    let forward_rule_ids: Option<String> = if let Some(ids) = req.forward_rule_ids {
        let mut valid: Vec<i64> = Vec::new();
        for rid in &ids {
            let exists: bool = sqlx::query_scalar(&state.db.format_query(
                "SELECT EXISTS(SELECT 1 FROM forward_rules WHERE id = ? AND is_active = 1)",
            ))
            .bind(rid)
            .fetch_one(&state.db.pool)
            .await
            .unwrap_or(false);
            if exists {
                valid.push(*rid);
            }
        }
        Some(serde_json::to_string(&valid).unwrap_or_else(|_| "[]".to_string()))
    } else {
        None
    };

    let pre_deduction = req.pre_deduction.unwrap_or(0.0);
    let site_discount = req.site_discount.unwrap_or(1.0);
    let site_discount_enabled = req.site_discount_enabled.unwrap_or(0);
    let global_discount = req.global_discount.unwrap_or(1.0);
    let global_discount_enabled = req.global_discount_enabled.unwrap_or(0);

    let original_id = req.original_id.unwrap_or_default();
    let model_id_alias = req.model_id_alias.unwrap_or_default();

    let is_active = req.is_active.unwrap_or(1);
    let enable_log_content = req.enable_log_content.unwrap_or(0);

    let new_id = sqlx::query(
        &state.db.format_query(r#"INSERT INTO models (mid, name, model_id, original_id, model_id_alias, provider_id, api_provider_id, type_id, group_ratios, forward_rule_ids, billing_rule_id, pre_deduction, site_discount, site_discount_enabled, global_discount, global_discount_enabled, is_active, enable_log_content, logo, remark, description, feature_attributes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           RETURNING id"#)
    )
    .bind(&mid)
    .bind(&req.name)
    .bind(&req.model_id)
    .bind(&original_id)
    .bind(&model_id_alias)
    .bind(req.provider_id)
    .bind(req.api_provider_id)
    .bind(req.type_id)
    .bind(&group_ratios)
    .bind(forward_rule_ids)
    .bind(req.billing_rule_id)
    .bind(pre_deduction)
    .bind(site_discount)
    .bind(site_discount_enabled)
    .bind(global_discount)
    .bind(global_discount_enabled)
    .bind(is_active)
    .bind(enable_log_content)
    .bind(&req.logo)
    .bind(&req.remark)
    .bind(&req.description)
    .bind(&req.feature_attributes)
    .fetch_one(&state.db.pool)
    .await?
    .get::<i64, _>("id");

    let model = sqlx::query_as(&state.db.format_query("SELECT * FROM models WHERE id = ?"))
        .bind(new_id)
        .fetch_one(&state.db.pool)
        .await?;

    crate::api::plugins::notify_marketplace_data_changed(&state).await;

    Ok(Json(model))
}

pub async fn update_model(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(mut req): Json<UpdateModelRequest>,
) -> AppResult<Json<Model>> {
    // Basic trimming if fields are provided
    if let Some(name) = &mut req.name {
        *name = name.trim().to_string();
        if name.is_empty() {
            return Err(crate::error::AppError::BadRequest(
                "名称不能为空".to_string(),
            ));
        }
    }
    if let Some(model_id) = &mut req.model_id {
        *model_id = model_id.trim().to_string();
        if model_id.is_empty() {
            return Err(crate::error::AppError::BadRequest(
                "模型 ID 不能为空".to_string(),
            ));
        }
    }

    // mid 是唯一标识，允许 name 和 model_id 重复（不同 mid 可对应相同 model_id，用于差异化计费）

    // 若当前模型 mid 为空，自动生成一个 30 开头的唯一 6 位 mid
    let current_mid: Option<String> =
        sqlx::query_scalar(&state.db.format_query("SELECT mid FROM models WHERE id = ?"))
            .bind(id)
            .fetch_optional(&state.db.pool)
            .await?;
    if current_mid.as_deref().unwrap_or("").is_empty() {
        let new_mid = loop {
            let candidate: String = {
                let n: u32 = rand::thread_rng().gen_range(300000..=309999);
                n.to_string()
            };
            let taken: Option<i64> = sqlx::query_scalar(
                &state
                    .db
                    .format_query("SELECT id FROM models WHERE mid = ? AND id != ?"),
            )
            .bind(&candidate)
            .bind(id)
            .fetch_optional(&state.db.pool)
            .await?;
            if taken.is_none() {
                break candidate;
            }
        };
        sqlx::query(
            &state
                .db
                .format_query("UPDATE models SET mid = ? WHERE id = ?"),
        )
        .bind(&new_mid)
        .bind(id)
        .execute(&state.db.pool)
        .await?;
    }

    if let Some(name) = &req.name {
        sqlx::query(
            &state
                .db
                .format_query("UPDATE models SET name = ? WHERE id = ?"),
        )
        .bind(name)
        .bind(id)
        .execute(&state.db.pool)
        .await?;
    }
    if let Some(model_id) = &req.model_id {
        sqlx::query(
            &state
                .db
                .format_query("UPDATE models SET model_id = ? WHERE id = ?"),
        )
        .bind(model_id)
        .bind(id)
        .execute(&state.db.pool)
        .await?;
    }
    if let Some(original_id) = &req.original_id {
        sqlx::query(
            &state
                .db
                .format_query("UPDATE models SET original_id = ? WHERE id = ?"),
        )
        .bind(original_id)
        .bind(id)
        .execute(&state.db.pool)
        .await?;
    }
    if let Some(model_id_alias) = &req.model_id_alias {
        sqlx::query(
            &state
                .db
                .format_query("UPDATE models SET model_id_alias = ? WHERE id = ?"),
        )
        .bind(model_id_alias)
        .bind(id)
        .execute(&state.db.pool)
        .await?;
    }
    if let Some(pid) = req.provider_id {
        sqlx::query(
            &state
                .db
                .format_query("UPDATE models SET provider_id = ? WHERE id = ?"),
        )
        .bind(pid)
        .bind(id)
        .execute(&state.db.pool)
        .await?;
    }
    if let Some(apid) = req.api_provider_id {
        sqlx::query(
            &state
                .db
                .format_query("UPDATE models SET api_provider_id = ? WHERE id = ?"),
        )
        .bind(apid)
        .bind(id)
        .execute(&state.db.pool)
        .await?;
    }
    if let Some(tid) = req.type_id {
        sqlx::query(
            &state
                .db
                .format_query("UPDATE models SET type_id = ? WHERE id = ?"),
        )
        .bind(tid)
        .bind(id)
        .execute(&state.db.pool)
        .await?;
    }
    if let Some(ref gr) = req.group_ratios {
        let gr_str = serde_json::to_string(gr).unwrap_or_else(|_| "{}".to_string());
        sqlx::query(
            &state
                .db
                .format_query("UPDATE models SET group_ratios = ? WHERE id = ?"),
        )
        .bind(&gr_str)
        .bind(id)
        .execute(&state.db.pool)
        .await?;
    }
    if let Some(rule_id) = req.billing_rule_id {
        sqlx::query(
            &state
                .db
                .format_query("UPDATE models SET billing_rule_id = ? WHERE id = ?"),
        )
        .bind(rule_id)
        .bind(id)
        .execute(&state.db.pool)
        .await?;
    }
    if let Some(pd) = req.pre_deduction {
        // Here we could enforce billing_type == "tokens" logic, but since billing_type is now in billing_rules,
        // we'll rely on the frontend to send pre_deduction = 0.0, or we could fetch the rule and check.
        // For strictness, if the frontend implements it, this is fine. If not, we can check here.
        sqlx::query(
            &state
                .db
                .format_query("UPDATE models SET pre_deduction = ? WHERE id = ?"),
        )
        .bind(pd)
        .bind(id)
        .execute(&state.db.pool)
        .await?;
    }
    if let Some(rules) = &req.forward_rule_ids {
        // 过滤掉不存在或已禁用的规则 ID，防止脏数据入库
        let mut valid_ids: Vec<i64> = Vec::new();
        for rid in rules {
            let exists: bool = sqlx::query_scalar(&state.db.format_query(
                "SELECT EXISTS(SELECT 1 FROM forward_rules WHERE id = ? AND is_active = 1)",
            ))
            .bind(rid)
            .fetch_one(&state.db.pool)
            .await
            .unwrap_or(false);
            if exists {
                valid_ids.push(*rid);
            }
        }
        let rules_str = serde_json::to_string(&valid_ids).unwrap_or_else(|_| "[]".to_string());
        sqlx::query(
            &state
                .db
                .format_query("UPDATE models SET forward_rule_ids = ? WHERE id = ?"),
        )
        .bind(&rules_str)
        .bind(id)
        .execute(&state.db.pool)
        .await?;
    }
    if let Some(active) = req.is_active {
        sqlx::query(
            &state
                .db
                .format_query("UPDATE models SET is_active = ? WHERE id = ?"),
        )
        .bind(active)
        .bind(id)
        .execute(&state.db.pool)
        .await?;
    }
    if let Some(elc) = req.enable_log_content {
        sqlx::query(
            &state
                .db
                .format_query("UPDATE models SET enable_log_content = ? WHERE id = ?"),
        )
        .bind(elc)
        .bind(id)
        .execute(&state.db.pool)
        .await?;
    }
    if let Some(sd) = req.site_discount {
        sqlx::query(
            &state
                .db
                .format_query("UPDATE models SET site_discount = ? WHERE id = ?"),
        )
        .bind(sd)
        .bind(id)
        .execute(&state.db.pool)
        .await?;
    }
    if let Some(sde) = req.site_discount_enabled {
        sqlx::query(
            &state
                .db
                .format_query("UPDATE models SET site_discount_enabled = ? WHERE id = ?"),
        )
        .bind(sde)
        .bind(id)
        .execute(&state.db.pool)
        .await?;
    }
    if let Some(gd) = req.global_discount {
        sqlx::query(
            &state
                .db
                .format_query("UPDATE models SET global_discount = ? WHERE id = ?"),
        )
        .bind(gd)
        .bind(id)
        .execute(&state.db.pool)
        .await?;
    }
    if let Some(gde) = req.global_discount_enabled {
        sqlx::query(
            &state
                .db
                .format_query("UPDATE models SET global_discount_enabled = ? WHERE id = ?"),
        )
        .bind(gde)
        .bind(id)
        .execute(&state.db.pool)
        .await?;
    }
    if let Some(ref logo) = req.logo {
        sqlx::query(
            &state
                .db
                .format_query("UPDATE models SET logo = ? WHERE id = ?"),
        )
        .bind(logo)
        .bind(id)
        .execute(&state.db.pool)
        .await?;
    }
    if let Some(ref remark) = req.remark {
        sqlx::query(
            &state
                .db
                .format_query("UPDATE models SET remark = ? WHERE id = ?"),
        )
        .bind(remark)
        .bind(id)
        .execute(&state.db.pool)
        .await?;
    }
    if let Some(ref description) = req.description {
        sqlx::query(
            &state
                .db
                .format_query("UPDATE models SET description = ? WHERE id = ?"),
        )
        .bind(description)
        .bind(id)
        .execute(&state.db.pool)
        .await?;
    }
    if let Some(ref feature_attributes) = req.feature_attributes {
        sqlx::query(
            &state
                .db
                .format_query("UPDATE models SET feature_attributes = ? WHERE id = ?"),
        )
        .bind(feature_attributes)
        .bind(id)
        .execute(&state.db.pool)
        .await?;
    }

    sqlx::query(
        &state
            .db
            .format_query("UPDATE models SET updated_at = CURRENT_TIMESTAMP WHERE id = ?"),
    )
    .bind(id)
    .execute(&state.db.pool)
    .await?;

    let model = sqlx::query_as(&state.db.format_query("SELECT * FROM models WHERE id = ?"))
        .bind(id)
        .fetch_one(&state.db.pool)
        .await?;

    crate::api::plugins::notify_marketplace_data_changed(&state).await;

    Ok(Json(model))
}

pub async fn delete_model(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> AppResult<Json<serde_json::Value>> {
    // ── 预置模型防删守卫 ──
    #[cfg(feature = "plugin_volcengine_enhance")]
    {
        const PROTECTED_MIDS: &[&str] =
            &["vve-sd", "vve-pf", "vve-ft", "vve-gt", "vvs-er", "vvs-ep"];
        let mid: Option<String> =
            sqlx::query_scalar(&state.db.format_query("SELECT mid FROM models WHERE id = ?"))
                .bind(id)
                .fetch_optional(&state.db.pool)
                .await?;
        if let Some(ref m) = mid {
            if PROTECTED_MIDS.contains(&m.as_str()) {
                return Err(crate::error::AppError::BadRequest(
                    "火山引擎画质增强插件的预置模型不可删除，如需停用请在插件管理页面关闭该模型。"
                        .to_string(),
                ));
            }
        }
    }

    sqlx::query(&state.db.format_query("DELETE FROM models WHERE id = ?"))
        .bind(id)
        .execute(&state.db.pool)
        .await?;

    crate::api::plugins::notify_marketplace_data_changed(&state).await;

    Ok(Json(serde_json::json!({ "success": true })))
}
