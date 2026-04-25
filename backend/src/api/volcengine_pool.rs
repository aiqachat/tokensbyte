//! 火山引擎卡池管理 API
//!
//! 提供卡池 CRUD、账号管理、连通性测试和调度日志查询接口。

use axum::{
    extract::{Path, State, Extension, Query},
    routing::{get, post, put},
    Json, Router,
};
use std::sync::Arc;
use serde::Deserialize;
use serde_json::json;
use crate::{
    error::{AppResult, AppError},
    models::volcengine_pool::*,
    AppState,
    auth,
};

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        // 卡池 CRUD
        .route("/pools", get(list_pools).post(create_pool))
        .route("/pools/{id}", put(update_pool).delete(delete_pool))
        // 账号管理
        .route("/accounts", get(list_accounts).post(create_account))
        .route("/accounts/{id}", put(update_account).delete(delete_account))
        .route("/accounts/{id}/test", post(test_account))
        .route("/accounts/{id}/reset", post(reset_account_quota))
        // 调度日志
        .route("/logs", get(list_pool_logs))
}

// ── 管理员权限检查 ─────────────────────────────────────────────

async fn require_admin(state: &Arc<AppState>, claims: &auth::Claims) -> AppResult<()> {
    let role: String = sqlx::query_scalar(&state.db.format_query("SELECT role FROM users WHERE id = ?"))
        .bind(&claims.sub)
        .fetch_one(&state.db.pool)
        .await?;
    if role != "admin" {
        return Err(AppError::Unauthorized);
    }
    Ok(())
}

// ══════════════════════════════════════════════════════════════
//  卡池 CRUD
// ══════════════════════════════════════════════════════════════

/// 列出所有卡池（含账号统计）
async fn list_pools(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&state, &claims).await?;

    let pools: Vec<VolcenginePool> = sqlx::query_as(
        &state.db.format_query("SELECT * FROM volcengine_pools ORDER BY id ASC"),
    )
    .fetch_all(&state.db.pool)
    .await?;

    // 统计每个卡池的账号数和在线数
    let mut pool_data = Vec::new();
    for pool in &pools {
        let total_accounts: i64 = sqlx::query_scalar(
            &state.db.format_query("SELECT COUNT(*) FROM volcengine_pool_account_mapping WHERE pool_id = ?"),
        )
        .bind(pool.id)
        .fetch_one(&state.db.pool)
        .await
        .unwrap_or(0);

        let active_accounts: i64 = sqlx::query_scalar(
            &state.db.format_query("SELECT COUNT(*) FROM volcengine_pool_account_mapping m JOIN volcengine_pool_accounts a ON m.account_id = a.id WHERE m.pool_id = ? AND a.status = 'active'"),
        )
        .bind(pool.id)
        .fetch_one(&state.db.pool)
        .await
        .unwrap_or(0);

        let account_ids: Vec<i64> = sqlx::query_scalar(
            &state.db.format_query("SELECT account_id FROM volcengine_pool_account_mapping WHERE pool_id = ?"),
        )
        .bind(pool.id)
        .fetch_all(&state.db.pool)
        .await
        .unwrap_or_default();

        pool_data.push(json!({
            "id": pool.id,
            "name": pool.name,
            "pool_type": pool.pool_type,
            "strategy": pool.strategy,
            "is_active": pool.is_active,
            "remark": pool.remark,
            "total_accounts": total_accounts,
            "active_accounts": active_accounts,
            "account_ids": account_ids,
            "created_at": pool.created_at,
            "updated_at": pool.updated_at,
        }));
    }

    Ok(Json(json!({ "pools": pool_data })))
}

/// 创建卡池
async fn create_pool(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Json(req): Json<CreatePoolRequest>,
) -> AppResult<Json<VolcenginePool>> {
    require_admin(&state, &claims).await?;

    let mut tx = state.db.pool.begin().await?;

    let pool: VolcenginePool = sqlx::query_as(&state.db.format_query(
        "INSERT INTO volcengine_pools (name, pool_type, strategy, remark) \
         VALUES (?, ?, ?, ?) RETURNING *",
    ))
    .bind(&req.name)
    .bind(req.pool_type.as_deref().unwrap_or("chat"))
    .bind(req.strategy.as_deref().unwrap_or("random"))
    .bind(&req.remark)
    .fetch_one(&mut *tx)
    .await?;

    if let Some(account_ids) = req.account_ids {
        for account_id in account_ids {
            sqlx::query(&state.db.format_query(
                "INSERT INTO volcengine_pool_account_mapping (pool_id, account_id) VALUES (?, ?)",
            ))
            .bind(pool.id)
            .bind(account_id)
            .execute(&mut *tx)
            .await?;
        }
    }

    tx.commit().await?;

    Ok(Json(pool))
}

/// 更新卡池
async fn update_pool(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Path(id): Path<i64>,
    Json(req): Json<UpdatePoolRequest>,
) -> AppResult<Json<VolcenginePool>> {
    require_admin(&state, &claims).await?;

    let mut tx = state.db.pool.begin().await?;

    let mut pool: VolcenginePool = sqlx::query_as(
        &state.db.format_query("SELECT * FROM volcengine_pools WHERE id = ?"),
    )
    .bind(id)
    .fetch_one(&mut *tx)
    .await?;

    if let Some(name) = req.name { pool.name = name; }
    if let Some(pool_type) = req.pool_type { pool.pool_type = pool_type; }
    if let Some(strategy) = req.strategy { pool.strategy = strategy; }
    if let Some(a) = req.is_active { pool.is_active = a; }
    if let Some(r) = req.remark { pool.remark = Some(r); }

    sqlx::query(&state.db.format_query(
        "UPDATE volcengine_pools SET name = ?, pool_type = ?, strategy = ?, \
         is_active = ?, remark = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ))
    .bind(&pool.name)
    .bind(&pool.pool_type)
    .bind(&pool.strategy)
    .bind(pool.is_active)
    .bind(&pool.remark)
    .bind(id)
    .execute(&mut *tx)
    .await?;

    if let Some(account_ids) = req.account_ids {
        // 先删除旧映射
        sqlx::query(&state.db.format_query("DELETE FROM volcengine_pool_account_mapping WHERE pool_id = ?"))
            .bind(id)
            .execute(&mut *tx)
            .await?;
        
        // 插入新映射
        for account_id in account_ids {
            sqlx::query(&state.db.format_query(
                "INSERT INTO volcengine_pool_account_mapping (pool_id, account_id) VALUES (?, ?)",
            ))
            .bind(id)
            .bind(account_id)
            .execute(&mut *tx)
            .await?;
        }
    }

    tx.commit().await?;

    Ok(Json(pool))
}

/// 删除卡池（级联删除所有账号）
async fn delete_pool(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Path(id): Path<i64>,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&state, &claims).await?;

    // 检查是否有渠道在使用此卡池
    let using_count: i64 = sqlx::query_scalar(
        &state.db.format_query("SELECT COUNT(*) FROM channels WHERE pool_id = ?"),
    )
    .bind(id)
    .fetch_one(&state.db.pool)
    .await
    .unwrap_or(0);

    if using_count > 0 {
        return Err(AppError::BadRequest(format!(
            "该卡池正在被 {} 个渠道使用，请先解除关联再删除",
            using_count
        )));
    }

    sqlx::query(&state.db.format_query("DELETE FROM volcengine_pools WHERE id = ?"))
        .bind(id)
        .execute(&state.db.pool)
        .await?;

    Ok(Json(json!({ "success": true })))
}

// ══════════════════════════════════════════════════════════════
//  账号管理
// ══════════════════════════════════════════════════════════════

/// 列出所有账号（API Key 脱敏）
async fn list_accounts(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&state, &claims).await?;

    let accounts: Vec<VolcenginePoolAccount> = sqlx::query_as(
        &state.db.format_query("SELECT * FROM volcengine_pool_accounts ORDER BY priority DESC, id ASC"),
    )
    .fetch_all(&state.db.pool)
    .await?;

    let safe: Vec<PoolAccountSafe> = accounts.iter().map(|a| a.to_safe()).collect();

    Ok(Json(json!({ "accounts": safe })))
}

/// 添加账号
async fn create_account(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Json(req): Json<CreatePoolAccountRequest>,
) -> AppResult<Json<PoolAccountSafe>> {
    require_admin(&state, &claims).await?;

    let account: VolcenginePoolAccount = sqlx::query_as(&state.db.format_query(
        "INSERT INTO volcengine_pool_accounts (name, base_url, api_key, models, quota_unit, daily_reset_hour, daily_reset_minute, period_start, period_end, daily_quota, hourly_quota, period_quota, priority) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *",
    ))
    .bind(&req.name)
    .bind(req.base_url.as_deref().unwrap_or("https://ark.cn-beijing.volces.com/api/v3"))
    .bind(&req.api_key)
    .bind(req.models.as_deref().unwrap_or(""))
    .bind(req.quota_unit.as_deref().unwrap_or("tokens"))
    .bind(req.daily_reset_hour.unwrap_or(0))
    .bind(req.daily_reset_minute.unwrap_or(0))
    .bind(req.period_start.as_deref().unwrap_or(""))
    .bind(req.period_end.as_deref().unwrap_or(""))
    .bind(req.daily_quota.unwrap_or(0.0))
    .bind(req.hourly_quota.unwrap_or(0.0))
    .bind(req.period_quota.unwrap_or(0.0))
    .bind(req.priority.unwrap_or(0))
    .fetch_one(&state.db.pool)
    .await?;

    Ok(Json(account.to_safe()))
}

/// 编辑账号
async fn update_account(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Path(id): Path<i64>,
    Json(req): Json<UpdatePoolAccountRequest>,
) -> AppResult<Json<PoolAccountSafe>> {
    require_admin(&state, &claims).await?;

    let mut account: VolcenginePoolAccount = sqlx::query_as(
        &state.db.format_query("SELECT * FROM volcengine_pool_accounts WHERE id = ?"),
    )
    .bind(id)
    .fetch_one(&state.db.pool)
    .await?;

    if let Some(name) = req.name { account.name = name; }
    if let Some(url) = req.base_url { account.base_url = url; }
    if let Some(key) = req.api_key { account.api_key = key; }
    if let Some(models) = req.models { account.models = models; }
    if let Some(status) = req.status { account.status = status; }
    if let Some(quota_unit) = req.quota_unit { account.quota_unit = quota_unit; }
    if let Some(h) = req.daily_reset_hour { account.daily_reset_hour = h; }
    if let Some(m) = req.daily_reset_minute { account.daily_reset_minute = m; }
    if let Some(s) = req.period_start { account.period_start = s; }
    if let Some(e) = req.period_end { account.period_end = e; }
    if let Some(dq) = req.daily_quota { account.daily_quota = dq; }
    if let Some(hq) = req.hourly_quota { account.hourly_quota = hq; }
    if let Some(pq) = req.period_quota { account.period_quota = pq; }
    if let Some(p) = req.priority { account.priority = p; }

    sqlx::query(&state.db.format_query(
        "UPDATE volcengine_pool_accounts SET name = ?, base_url = ?, api_key = ?, models = ?, status = ?, \
         quota_unit = ?, daily_reset_hour = ?, daily_reset_minute = ?, period_start = ?, period_end = ?, \
         daily_quota = ?, hourly_quota = ?, period_quota = ?, priority = ?, \
         updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ))
    .bind(&account.name)
    .bind(&account.base_url)
    .bind(&account.api_key)
    .bind(&account.models)
    .bind(&account.status)
    .bind(&account.quota_unit)
    .bind(account.daily_reset_hour)
    .bind(account.daily_reset_minute)
    .bind(&account.period_start)
    .bind(&account.period_end)
    .bind(account.daily_quota)
    .bind(account.hourly_quota)
    .bind(account.period_quota)
    .bind(account.priority)
    .bind(id)
    .execute(&state.db.pool)
    .await?;

    Ok(Json(account.to_safe()))
}

/// 删除账号
async fn delete_account(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Path(id): Path<i64>,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&state, &claims).await?;

    sqlx::query(&state.db.format_query("DELETE FROM volcengine_pool_accounts WHERE id = ?"))
        .bind(id)
        .execute(&state.db.pool)
        .await?;

    Ok(Json(json!({ "success": true })))
}

/// 测试账号连通性：发送一个轻量级请求验证 API Key 是否有效
async fn test_account(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Path(id): Path<i64>,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&state, &claims).await?;

    let account: VolcenginePoolAccount = sqlx::query_as(
        &state.db.format_query("SELECT * FROM volcengine_pool_accounts WHERE id = ?"),
    )
    .bind(id)
    .fetch_one(&state.db.pool)
    .await?;

    // 发送一个最小化的聊天请求到火山方舟
    let start = std::time::Instant::now();
    let client = reqwest::Client::new();
    let test_body = json!({
        "model": "doubao-1-5-lite-32k-250115",
        "messages": [{"role": "user", "content": "hi"}],
        "max_tokens": 1,
    });

    let resp = client
        .post("https://ark.cn-beijing.volces.com/api/v3/chat/completions")
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", account.api_key))
        .json(&test_body)
        .send()
        .await;

    let latency_ms = start.elapsed().as_millis() as u32;

    match resp {
        Ok(r) => {
            let status = r.status();
            let body = r.text().await.unwrap_or_default();
            if status.is_success() {
                Ok(Json(json!({
                    "success": true,
                    "latency_ms": latency_ms,
                    "message": "连接成功",
                })))
            } else {
                Ok(Json(json!({
                    "success": false,
                    "latency_ms": latency_ms,
                    "status_code": status.as_u16(),
                    "message": body.chars().take(500).collect::<String>(),
                })))
            }
        }
        Err(e) => Ok(Json(json!({
            "success": false,
            "latency_ms": latency_ms,
            "message": format!("连接失败: {}", e),
        }))),
    }
}

/// 手动重置账号配额
async fn reset_account_quota(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Path(id): Path<i64>,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&state, &claims).await?;

    sqlx::query(&state.db.format_query(
        "UPDATE volcengine_pool_accounts SET daily_used = 0, hourly_used = 0, period_used = 0, \
         status = 'active', last_error = NULL, last_error_at = NULL, \
         updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ))
    .bind(id)
    .execute(&state.db.pool)
    .await?;

    Ok(Json(json!({ "success": true, "message": "配额已重置，状态恢复为 active" })))
}

// ══════════════════════════════════════════════════════════════
//  调度日志
// ══════════════════════════════════════════════════════════════

#[derive(Deserialize)]
pub struct LogsQuery {
    pub pool_id: Option<i64>,
    pub account_id: Option<i64>,
    pub status: Option<String>,
    pub page: Option<i64>,
    pub page_size: Option<i64>,
}

/// 查看调度日志
async fn list_pool_logs(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Query(query): Query<LogsQuery>,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&state, &claims).await?;

    let page = query.page.unwrap_or(1).max(1);
    let page_size = query.page_size.unwrap_or(20).min(100);
    let offset = (page - 1) * page_size;

    // 构建动态 WHERE 条件
    let mut conditions = Vec::new();
    let mut bind_values: Vec<String> = Vec::new();

    if let Some(pid) = query.pool_id {
        conditions.push(format!("pool_id = {}", pid));
    }
    if let Some(aid) = query.account_id {
        conditions.push(format!("account_id = {}", aid));
    }
    if let Some(ref s) = query.status {
        conditions.push("status = ?".to_string());
        bind_values.push(s.clone());
    }

    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };

    // 总数
    let count_sql = format!("SELECT COUNT(*) FROM volcengine_pool_logs {}", where_clause);
    let count_sql_formatted = state.db.format_query(&count_sql);
    let mut count_q = sqlx::query_scalar::<_, i64>(&count_sql_formatted);
    for v in &bind_values {
        count_q = count_q.bind(v);
    }
    let total: i64 = count_q.fetch_one(&state.db.pool).await.unwrap_or(0);

    // 数据
    let data_sql = format!(
        "SELECT * FROM volcengine_pool_logs {} ORDER BY id DESC LIMIT {} OFFSET {}",
        where_clause, page_size, offset
    );
    let data_sql_formatted = state.db.format_query(&data_sql);
    let mut data_q = sqlx::query_as::<_, VolcenginePoolLog>(&data_sql_formatted);
    for v in &bind_values {
        data_q = data_q.bind(v);
    }
    let logs: Vec<VolcenginePoolLog> = data_q.fetch_all(&state.db.pool).await.unwrap_or_default();

    Ok(Json(json!({
        "logs": logs,
        "total": total,
        "page": page,
        "page_size": page_size,
    })))
}
