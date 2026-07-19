use crate::error::AppResult;
use crate::models::{ClassificationRequest, ClassificationsResponse, ModelProvider, ModelType};
use crate::AppState;
use axum::{
    extract::{Path, State},
    Json,
};
use std::sync::Arc;

// --- Providers ---

pub async fn list_providers(
    State(state): State<Arc<AppState>>,
) -> AppResult<Json<Vec<ModelProvider>>> {
    let providers = sqlx::query_as(
        &state
            .db
            .format_query("SELECT * FROM model_providers ORDER BY sort_order DESC, id ASC"),
    )
    .fetch_all(&state.db.pool)
    .await?;
    Ok(Json(providers))
}

pub async fn create_provider(
    State(state): State<Arc<AppState>>,
    Json(mut req): Json<ClassificationRequest>,
) -> AppResult<Json<ModelProvider>> {
    req.name = req.name.trim().to_string();
    if req.name.is_empty() {
        return Err(crate::error::AppError::BadRequest(
            "名称不能为空".to_string(),
        ));
    }

    // Check for duplicate name
    let exists: Option<i64> = sqlx::query_scalar(
        &state
            .db
            .format_query("SELECT id FROM model_providers WHERE name = ?"),
    )
    .bind(&req.name)
    .fetch_optional(&state.db.pool)
    .await?;

    if exists.is_some() {
        return Err(crate::error::AppError::Conflict(
            "服务商名称已存在".to_string(),
        ));
    }

    let name_en = req.name_en.unwrap_or_default().trim().to_string();
    let provider = sqlx::query_as(
        &state.db.format_query("INSERT INTO model_providers (name, name_en, sort_order, is_active, remark, logo) VALUES (?, ?, ?, ?, ?, ?) RETURNING *")
    )
    .bind(&req.name)
    .bind(name_en)
    .bind(req.sort_order)
    .bind(req.is_active)
    .bind(&req.remark)
    .bind(&req.logo)
    .fetch_one(&state.db.pool)
    .await?;
    crate::api::plugins::notify_marketplace_data_changed(&state).await;
    Ok(Json(provider))
}

pub async fn update_provider(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(mut req): Json<ClassificationRequest>,
) -> AppResult<Json<ModelProvider>> {
    req.name = req.name.trim().to_string();
    if req.name.is_empty() {
        return Err(crate::error::AppError::BadRequest(
            "名称不能为空".to_string(),
        ));
    }

    // Check for duplicate name (excluding itself)
    let exists: Option<i64> = sqlx::query_scalar(
        &state
            .db
            .format_query("SELECT id FROM model_providers WHERE name = ? AND id != ?"),
    )
    .bind(&req.name)
    .bind(id)
    .fetch_optional(&state.db.pool)
    .await?;

    if exists.is_some() {
        return Err(crate::error::AppError::Conflict(
            "服务商名称与其他记录重复".to_string(),
        ));
    }

    let name_en = req.name_en.unwrap_or_default().trim().to_string();
    let provider = sqlx::query_as(
        &state.db.format_query("UPDATE model_providers SET name = ?, name_en = ?, sort_order = ?, is_active = ?, remark = ?, logo = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING *")
    )
    .bind(&req.name)
    .bind(name_en)
    .bind(req.sort_order)
    .bind(req.is_active)
    .bind(&req.remark)
    .bind(&req.logo)
    .bind(id)
    .fetch_one(&state.db.pool)
    .await?;
    crate::api::plugins::notify_marketplace_data_changed(&state).await;
    Ok(Json(provider))
}

pub async fn delete_provider(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> AppResult<Json<serde_json::Value>> {
    let _is_sys: i32 = sqlx::query_scalar(
        &state
            .db
            .format_query("SELECT is_system FROM model_providers WHERE id = ?"),
    )
    .bind(id)
    .fetch_one(&state.db.pool)
    .await
    .unwrap_or(0);

    // NULL out references in models table
    sqlx::query(
        &state
            .db
            .format_query("UPDATE models SET provider_id = NULL WHERE provider_id = ?"),
    )
    .bind(id)
    .execute(&state.db.pool)
    .await?;

    sqlx::query(
        &state
            .db
            .format_query("DELETE FROM model_providers WHERE id = ?"),
    )
    .bind(id)
    .execute(&state.db.pool)
    .await?;
    crate::api::plugins::notify_marketplace_data_changed(&state).await;
    Ok(Json(serde_json::json!({ "success": true })))
}

// --- API Providers ---

pub async fn list_api_providers(
    State(state): State<Arc<AppState>>,
) -> AppResult<Json<Vec<ModelProvider>>> {
    let providers = sqlx::query_as(
        &state
            .db
            .format_query("SELECT * FROM model_api_providers ORDER BY sort_order DESC, id ASC"),
    )
    .fetch_all(&state.db.pool)
    .await?;
    Ok(Json(providers))
}

pub async fn create_api_provider(
    State(state): State<Arc<AppState>>,
    Json(mut req): Json<ClassificationRequest>,
) -> AppResult<Json<ModelProvider>> {
    req.name = req.name.trim().to_string();
    if req.name.is_empty() {
        return Err(crate::error::AppError::BadRequest(
            "名称不能为空".to_string(),
        ));
    }

    let exists: Option<i64> = sqlx::query_scalar(
        &state
            .db
            .format_query("SELECT id FROM model_api_providers WHERE name = ?"),
    )
    .bind(&req.name)
    .fetch_optional(&state.db.pool)
    .await?;
    if exists.is_some() {
        return Err(crate::error::AppError::Conflict(
            "API服务商名称已存在".to_string(),
        ));
    }

    let name_en = req.name_en.unwrap_or_default().trim().to_string();
    let provider = sqlx::query_as(&state.db.format_query("INSERT INTO model_api_providers (name, name_en, sort_order, is_active, remark, logo) VALUES (?, ?, ?, ?, ?, ?) RETURNING *"))
        .bind(&req.name).bind(name_en).bind(req.sort_order).bind(req.is_active).bind(&req.remark).bind(&req.logo)
        .fetch_one(&state.db.pool).await?;
    crate::api::plugins::notify_marketplace_data_changed(&state).await;
    Ok(Json(provider))
}

pub async fn update_api_provider(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(mut req): Json<ClassificationRequest>,
) -> AppResult<Json<ModelProvider>> {
    req.name = req.name.trim().to_string();
    if req.name.is_empty() {
        return Err(crate::error::AppError::BadRequest(
            "名称不能为空".to_string(),
        ));
    }

    let exists: Option<i64> = sqlx::query_scalar(
        &state
            .db
            .format_query("SELECT id FROM model_api_providers WHERE name = ? AND id != ?"),
    )
    .bind(&req.name)
    .bind(id)
    .fetch_optional(&state.db.pool)
    .await?;
    if exists.is_some() {
        return Err(crate::error::AppError::Conflict(
            "API服务商名称与其他记录重复".to_string(),
        ));
    }

    let name_en = req.name_en.unwrap_or_default().trim().to_string();
    let provider = sqlx::query_as(&state.db.format_query("UPDATE model_api_providers SET name = ?, name_en = ?, sort_order = ?, is_active = ?, remark = ?, logo = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING *"))
        .bind(&req.name).bind(name_en).bind(req.sort_order).bind(req.is_active).bind(&req.remark).bind(&req.logo).bind(id)
        .fetch_one(&state.db.pool).await?;
    crate::api::plugins::notify_marketplace_data_changed(&state).await;
    Ok(Json(provider))
}

pub async fn delete_api_provider(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> AppResult<Json<serde_json::Value>> {
    sqlx::query(
        &state
            .db
            .format_query("UPDATE models SET api_provider_id = NULL WHERE api_provider_id = ?"),
    )
    .bind(id)
    .execute(&state.db.pool)
    .await?;
    sqlx::query(
        &state
            .db
            .format_query("DELETE FROM model_api_providers WHERE id = ?"),
    )
    .bind(id)
    .execute(&state.db.pool)
    .await?;
    crate::api::plugins::notify_marketplace_data_changed(&state).await;
    Ok(Json(serde_json::json!({ "success": true })))
}

// --- Types ---

pub async fn list_types(State(state): State<Arc<AppState>>) -> AppResult<Json<Vec<ModelType>>> {
    let types = sqlx::query_as(
        &state
            .db
            .format_query("SELECT * FROM model_types ORDER BY sort_order DESC, id ASC"),
    )
    .fetch_all(&state.db.pool)
    .await?;
    Ok(Json(types))
}

pub async fn create_type(
    State(state): State<Arc<AppState>>,
    Json(mut req): Json<ClassificationRequest>,
) -> AppResult<Json<ModelType>> {
    req.name = req.name.trim().to_string();
    if req.name.is_empty() {
        return Err(crate::error::AppError::BadRequest(
            "名称不能为空".to_string(),
        ));
    }

    // Check for duplicate name
    let exists: Option<i64> = sqlx::query_scalar(
        &state
            .db
            .format_query("SELECT id FROM model_types WHERE name = ?"),
    )
    .bind(&req.name)
    .fetch_optional(&state.db.pool)
    .await?;

    if exists.is_some() {
        return Err(crate::error::AppError::Conflict(
            "类型名称已存在".to_string(),
        ));
    }

    let name_en = req.name_en.unwrap_or_default().trim().to_string();
    let model_type = sqlx::query_as(
        &state.db.format_query("INSERT INTO model_types (name, name_en, sort_order, is_active, logo) VALUES (?, ?, ?, ?, ?) RETURNING *")
    )
    .bind(&req.name)
    .bind(name_en)
    .bind(req.sort_order)
    .bind(req.is_active)
    .bind(&req.logo)
    .fetch_one(&state.db.pool)
    .await?;
    crate::api::plugins::notify_marketplace_data_changed(&state).await;
    Ok(Json(model_type))
}

pub async fn update_type(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(mut req): Json<ClassificationRequest>,
) -> AppResult<Json<ModelType>> {
    req.name = req.name.trim().to_string();
    if req.name.is_empty() {
        return Err(crate::error::AppError::BadRequest(
            "名称不能为空".to_string(),
        ));
    }

    // Check for duplicate name (excluding itself)
    let exists: Option<i64> = sqlx::query_scalar(
        &state
            .db
            .format_query("SELECT id FROM model_types WHERE name = ? AND id != ?"),
    )
    .bind(&req.name)
    .bind(id)
    .fetch_optional(&state.db.pool)
    .await?;

    if exists.is_some() {
        return Err(crate::error::AppError::Conflict(
            "类型名称与其他记录重复".to_string(),
        ));
    }

    let name_en = req.name_en.unwrap_or_default().trim().to_string();
    let model_type = sqlx::query_as(
        &state.db.format_query("UPDATE model_types SET name = ?, name_en = ?, sort_order = ?, is_active = ?, logo = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING *")
    )
    .bind(&req.name)
    .bind(name_en)
    .bind(req.sort_order)
    .bind(req.is_active)
    .bind(&req.logo)
    .bind(id)
    .fetch_one(&state.db.pool)
    .await?;
    crate::api::plugins::notify_marketplace_data_changed(&state).await;
    Ok(Json(model_type))
}

pub async fn delete_type(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> AppResult<Json<serde_json::Value>> {
    let _is_sys: i32 = sqlx::query_scalar(
        &state
            .db
            .format_query("SELECT is_system FROM model_types WHERE id = ?"),
    )
    .bind(id)
    .fetch_one(&state.db.pool)
    .await
    .unwrap_or(0);

    // NULL out references in models table
    sqlx::query(
        &state
            .db
            .format_query("UPDATE models SET type_id = NULL WHERE type_id = ?"),
    )
    .bind(id)
    .execute(&state.db.pool)
    .await?;

    sqlx::query(
        &state
            .db
            .format_query("DELETE FROM model_types WHERE id = ?"),
    )
    .bind(id)
    .execute(&state.db.pool)
    .await?;
    crate::api::plugins::notify_marketplace_data_changed(&state).await;
    Ok(Json(serde_json::json!({ "success": true })))
}

#[derive(Debug, serde::Deserialize)]
pub struct StatsQuery {
    pub provider_id: Option<i64>,
    pub api_provider_id: Option<i64>,
    pub type_id: Option<i64>,
    pub search: Option<String>,
}

/// 分类统计接口 — 每个维度的 count 基于"排除自身、保留其他维度"的交叉筛选
/// 例如选中 api_provider_id=1 后：
///   - 官方服务商 count = 满足 api_provider_id=1 + type_id(如有) 的模型数
///   - API服务商 count = 满足 provider_id(如有) + type_id(如有) 的模型数（排除自身）
///   - 类型 count = 满足 api_provider_id=1 + provider_id(如有) 的模型数
pub async fn get_classifications_stats(
    State(state): State<Arc<AppState>>,
    axum::extract::Query(query): axum::extract::Query<StatsQuery>,
) -> AppResult<Json<ClassificationsResponse>> {
    // ── 官方服务商 count（交叉: api_provider_id + type_id + search） ──
    let mut p_sql = r#"SELECT p.id, p.name, p.name_en, p.logo, p.is_system, COUNT(m.id) as count 
           FROM model_providers p 
           LEFT JOIN models m ON p.id = m.provider_id"#
        .to_string();

    let mut p_conds = vec![];
    if query.api_provider_id.is_some() {
        p_conds.push("m.api_provider_id = ?");
    }
    if query.type_id.is_some() {
        p_conds.push("m.type_id = ?");
    }
    if query.search.is_some() {
        p_conds.push("(m.name ILIKE ? OR m.model_id ILIKE ? OR m.mid = ?)");
    }
    if !p_conds.is_empty() {
        p_sql.push_str(" AND ");
        p_sql.push_str(&p_conds.join(" AND "));
    }
    p_sql.push_str(" WHERE p.is_active = 1 GROUP BY p.id, p.name, p.name_en, p.logo, p.is_system ORDER BY p.sort_order DESC, p.id ASC");

    let formatted_p_sql = state.db.format_query(&p_sql);
    let mut pq = sqlx::query_as::<_, crate::models::ClassificationCount>(&formatted_p_sql);
    if let Some(apid) = query.api_provider_id {
        pq = pq.bind(apid);
    }
    if let Some(tid) = query.type_id {
        pq = pq.bind(tid);
    }
    if let Some(ref kw) = query.search {
        let like = format!("%{}%", kw);
        pq = pq.bind(like.clone()).bind(like).bind(kw);
    }
    let providers = pq.fetch_all(&state.db.pool).await?;

    // ── API 服务商 count（交叉: provider_id + type_id + search） ──
    let mut ap_sql = r#"SELECT p.id, p.name, p.name_en, p.logo, p.is_system, COUNT(m.id) as count 
           FROM model_api_providers p 
           LEFT JOIN models m ON p.id = m.api_provider_id"#
        .to_string();

    let mut ap_conds = vec![];
    if query.provider_id.is_some() {
        ap_conds.push("m.provider_id = ?");
    }
    if query.type_id.is_some() {
        ap_conds.push("m.type_id = ?");
    }
    if query.search.is_some() {
        ap_conds.push("(m.name ILIKE ? OR m.model_id ILIKE ? OR m.mid = ?)");
    }
    if !ap_conds.is_empty() {
        ap_sql.push_str(" AND ");
        ap_sql.push_str(&ap_conds.join(" AND "));
    }
    ap_sql.push_str(" WHERE p.is_active = 1 GROUP BY p.id, p.name, p.name_en, p.logo, p.is_system ORDER BY p.sort_order DESC, p.id ASC");

    let formatted_ap_sql = state.db.format_query(&ap_sql);
    let mut apq = sqlx::query_as::<_, crate::models::ClassificationCount>(&formatted_ap_sql);
    if let Some(pid) = query.provider_id {
        apq = apq.bind(pid);
    }
    if let Some(tid) = query.type_id {
        apq = apq.bind(tid);
    }
    if let Some(ref kw) = query.search {
        let like = format!("%{}%", kw);
        apq = apq.bind(like.clone()).bind(like).bind(kw);
    }
    let api_providers = apq.fetch_all(&state.db.pool).await?;

    // ── 类型 count（交叉: provider_id + api_provider_id + search） ──
    let mut t_sql = r#"SELECT t.id, t.name, t.name_en, t.logo, t.is_system, COUNT(m.id) as count 
           FROM model_types t 
           LEFT JOIN models m ON t.id = m.type_id"#
        .to_string();

    let mut t_conds = vec![];
    if query.provider_id.is_some() {
        t_conds.push("m.provider_id = ?");
    }
    if query.api_provider_id.is_some() {
        t_conds.push("m.api_provider_id = ?");
    }
    if query.search.is_some() {
        t_conds.push("(m.name ILIKE ? OR m.model_id ILIKE ? OR m.mid = ?)");
    }
    if !t_conds.is_empty() {
        t_sql.push_str(" AND ");
        t_sql.push_str(&t_conds.join(" AND "));
    }
    t_sql.push_str(" WHERE t.is_active = 1 GROUP BY t.id, t.name, t.name_en, t.logo, t.is_system ORDER BY t.sort_order DESC, t.id ASC");

    let formatted_t_sql = state.db.format_query(&t_sql);
    let mut tq = sqlx::query_as::<_, crate::models::ClassificationCount>(&formatted_t_sql);
    if let Some(pid) = query.provider_id {
        tq = tq.bind(pid);
    }
    if let Some(apid) = query.api_provider_id {
        tq = tq.bind(apid);
    }
    if let Some(ref kw) = query.search {
        let like = format!("%{}%", kw);
        tq = tq.bind(like.clone()).bind(like).bind(kw);
    }
    let types = tq.fetch_all(&state.db.pool).await?;

    Ok(Json(ClassificationsResponse {
        providers,
        api_providers,
        types,
    }))
}
