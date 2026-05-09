use axum::{
    extract::{Path, State},
    Json,
};
use std::sync::Arc;
use crate::AppState;
use crate::error::AppResult;
use crate::models::{
    ModelProvider, ModelType, ClassificationRequest, ClassificationsResponse
};

// --- Providers ---

pub async fn list_providers(
    State(state): State<Arc<AppState>>,
) -> AppResult<Json<Vec<ModelProvider>>> {
    let providers = sqlx::query_as(&state.db.format_query("SELECT * FROM model_providers ORDER BY sort_order ASC, id ASC"))
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
        return Err(crate::error::AppError::BadRequest("名称不能为空".to_string()));
    }

    // Check for duplicate name
    let exists: Option<i64> = sqlx::query_scalar(&state.db.format_query("SELECT id FROM model_providers WHERE name = ?"))
        .bind(&req.name)
        .fetch_optional(&state.db.pool)
        .await?;
    
    if exists.is_some() {
        return Err(crate::error::AppError::Conflict("服务商名称已存在".to_string()));
    }

    let provider = sqlx::query_as(
        &state.db.format_query("INSERT INTO model_providers (name, sort_order, is_active, remark, logo) VALUES (?, ?, ?, ?, ?) RETURNING *")
    )
    .bind(&req.name)
    .bind(req.sort_order)
    .bind(req.is_active)
    .bind(&req.remark)
    .bind(&req.logo)
    .fetch_one(&state.db.pool)
    .await?;
    Ok(Json(provider))
}

pub async fn update_provider(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(mut req): Json<ClassificationRequest>,
) -> AppResult<Json<ModelProvider>> {
    req.name = req.name.trim().to_string();
    if req.name.is_empty() {
        return Err(crate::error::AppError::BadRequest("名称不能为空".to_string()));
    }

    // Check for duplicate name (excluding itself)
    let exists: Option<i64> = sqlx::query_scalar(&state.db.format_query("SELECT id FROM model_providers WHERE name = ? AND id != ?"))
        .bind(&req.name)
        .bind(id)
        .fetch_optional(&state.db.pool)
        .await?;
    
    if exists.is_some() {
        return Err(crate::error::AppError::Conflict("服务商名称与其他记录重复".to_string()));
    }

    let provider = sqlx::query_as(
        &state.db.format_query("UPDATE model_providers SET name = ?, sort_order = ?, is_active = ?, remark = ?, logo = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING *")
    )
    .bind(&req.name)
    .bind(req.sort_order)
    .bind(req.is_active)
    .bind(&req.remark)
    .bind(&req.logo)
    .bind(id)
    .fetch_one(&state.db.pool)
    .await?;
    Ok(Json(provider))
}

pub async fn delete_provider(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> AppResult<Json<serde_json::Value>> {
    let is_sys: i32 = sqlx::query_scalar(&state.db.format_query("SELECT is_system FROM model_providers WHERE id = ?"))
        .bind(id)
        .fetch_one(&state.db.pool)
        .await
        .unwrap_or(0);
    if is_sys == 1 {
        return Err(crate::error::AppError::BadRequest("系统内置预设，禁止删除".to_string()));
    }

    // NULL out references in models table
    sqlx::query(&state.db.format_query("UPDATE models SET provider_id = NULL WHERE provider_id = ?"))
        .bind(id)
        .execute(&state.db.pool)
        .await?;
        
    sqlx::query(&state.db.format_query("DELETE FROM model_providers WHERE id = ?"))
        .bind(id)
        .execute(&state.db.pool)
        .await?;
    Ok(Json(serde_json::json!({ "success": true })))
}

// --- Types ---

pub async fn list_types(
    State(state): State<Arc<AppState>>,
) -> AppResult<Json<Vec<ModelType>>> {
    let types = sqlx::query_as(&state.db.format_query("SELECT * FROM model_types ORDER BY sort_order ASC, id ASC"))
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
        return Err(crate::error::AppError::BadRequest("名称不能为空".to_string()));
    }

    // Check for duplicate name
    let exists: Option<i64> = sqlx::query_scalar(&state.db.format_query("SELECT id FROM model_types WHERE name = ?"))
        .bind(&req.name)
        .fetch_optional(&state.db.pool)
        .await?;
    
    if exists.is_some() {
        return Err(crate::error::AppError::Conflict("类型名称已存在".to_string()));
    }

    let model_type = sqlx::query_as(
        &state.db.format_query("INSERT INTO model_types (name, sort_order, is_active, logo) VALUES (?, ?, ?, ?) RETURNING *")
    )
    .bind(&req.name)
    .bind(req.sort_order)
    .bind(req.is_active)
    .bind(&req.logo)
    .fetch_one(&state.db.pool)
    .await?;
    Ok(Json(model_type))
}

pub async fn update_type(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(mut req): Json<ClassificationRequest>,
) -> AppResult<Json<ModelType>> {
    req.name = req.name.trim().to_string();
    if req.name.is_empty() {
        return Err(crate::error::AppError::BadRequest("名称不能为空".to_string()));
    }

    // Check for duplicate name (excluding itself)
    let exists: Option<i64> = sqlx::query_scalar(&state.db.format_query("SELECT id FROM model_types WHERE name = ? AND id != ?"))
        .bind(&req.name)
        .bind(id)
        .fetch_optional(&state.db.pool)
        .await?;
    
    if exists.is_some() {
        return Err(crate::error::AppError::Conflict("类型名称与其他记录重复".to_string()));
    }

    let model_type = sqlx::query_as(
        &state.db.format_query("UPDATE model_types SET name = ?, sort_order = ?, is_active = ?, logo = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING *")
    )
    .bind(&req.name)
    .bind(req.sort_order)
    .bind(req.is_active)
    .bind(&req.logo)
    .bind(id)
    .fetch_one(&state.db.pool)
    .await?;
    Ok(Json(model_type))
}

pub async fn delete_type(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> AppResult<Json<serde_json::Value>> {
    let is_sys: i32 = sqlx::query_scalar(&state.db.format_query("SELECT is_system FROM model_types WHERE id = ?"))
        .bind(id)
        .fetch_one(&state.db.pool)
        .await
        .unwrap_or(0);
    if is_sys == 1 {
        return Err(crate::error::AppError::BadRequest("系统内置预设，禁止删除".to_string()));
    }

    // NULL out references in models table
    sqlx::query(&state.db.format_query("UPDATE models SET type_id = NULL WHERE type_id = ?"))
        .bind(id)
        .execute(&state.db.pool)
        .await?;

    sqlx::query(&state.db.format_query("DELETE FROM model_types WHERE id = ?"))
        .bind(id)
        .execute(&state.db.pool)
        .await?;
    Ok(Json(serde_json::json!({ "success": true })))
}

#[derive(Debug, serde::Deserialize)]
pub struct StatsQuery {
    pub provider_id: Option<i64>,
    pub type_id: Option<i64>,
    pub search: Option<String>,
}

pub async fn get_classifications_stats(
    State(state): State<Arc<AppState>>,
    axum::extract::Query(query): axum::extract::Query<StatsQuery>,
) -> AppResult<Json<ClassificationsResponse>> {
    // Get providers with model counts
    let mut p_sql = r#"SELECT p.id, p.name, p.is_system, COUNT(m.id) as count 
           FROM model_providers p 
           LEFT JOIN models m ON p.id = m.provider_id"#.to_string();
    
    let mut p_conds = vec![];
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
    p_sql.push_str(" WHERE p.is_active = 1 GROUP BY p.id, p.name ORDER BY p.sort_order ASC, p.id ASC");

    let formatted_p_sql = state.db.format_query(&p_sql);
    let mut pq = sqlx::query_as::<_, crate::models::ClassificationCount>(&formatted_p_sql);
    if let Some(tid) = query.type_id {
        pq = pq.bind(tid);
    }
    if let Some(ref kw) = query.search {
        let like = format!("%{}%", kw);
        pq = pq.bind(like.clone()).bind(like).bind(kw);
    }
    let providers = pq.fetch_all(&state.db.pool).await?;

    // Get types with model counts
    let mut t_sql = r#"SELECT t.id, t.name, t.is_system, COUNT(m.id) as count 
           FROM model_types t 
           LEFT JOIN models m ON t.id = m.type_id"#.to_string();
    
    let mut t_conds = vec![];
    if query.provider_id.is_some() {
        t_conds.push("m.provider_id = ?");
    }
    if query.search.is_some() {
        t_conds.push("(m.name ILIKE ? OR m.model_id ILIKE ? OR m.mid = ?)");
    }
    if !t_conds.is_empty() {
        t_sql.push_str(" AND ");
        t_sql.push_str(&t_conds.join(" AND "));
    }
    t_sql.push_str(" WHERE t.is_active = 1 GROUP BY t.id, t.name ORDER BY t.sort_order ASC, t.id ASC");

    let formatted_t_sql = state.db.format_query(&t_sql);
    let mut tq = sqlx::query_as::<_, crate::models::ClassificationCount>(&formatted_t_sql);
    if let Some(pid) = query.provider_id {
        tq = tq.bind(pid);
    }
    if let Some(ref kw) = query.search {
        let like = format!("%{}%", kw);
        tq = tq.bind(like.clone()).bind(like).bind(kw);
    }
    let types = tq.fetch_all(&state.db.pool).await?;

    Ok(Json(ClassificationsResponse { providers, types }))
}
