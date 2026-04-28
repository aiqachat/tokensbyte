import re

with open("backend/src/api/volcengine_pool.rs", "r") as f:
    content = f.read()

# 1. list_pools
list_pools_old = """        let account_ids: Vec<i64> = sqlx::query_scalar(
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
        }));"""

list_pools_new = """        let accounts: Vec<VolcenginePoolAccountMapping> = sqlx::query_as(
            &state.db.format_query("SELECT * FROM volcengine_pool_account_mapping WHERE pool_id = ?"),
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
            "model_id": pool.model_id,
            "total_accounts": total_accounts,
            "active_accounts": active_accounts,
            "accounts": accounts,
            "created_at": pool.created_at,
            "updated_at": pool.updated_at,
        }));"""
content = content.replace(list_pools_old, list_pools_new)

# 2. create_pool
create_pool_old = """    let pool: VolcenginePool = sqlx::query_as(&state.db.format_query(
        "INSERT INTO volcengine_pools (name, pool_type, strategy, remark) \\
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
    }"""

create_pool_new = """    let pool: VolcenginePool = sqlx::query_as(&state.db.format_query(
        "INSERT INTO volcengine_pools (name, pool_type, strategy, remark, model_id) \\
         VALUES (?, ?, ?, ?, ?) RETURNING *",
    ))
    .bind(&req.name)
    .bind(req.pool_type.as_deref().unwrap_or("chat"))
    .bind(req.strategy.as_deref().unwrap_or("random"))
    .bind(&req.remark)
    .bind(req.model_id.as_deref().unwrap_or(""))
    .fetch_one(&mut *tx)
    .await?;

    if let Some(accounts) = req.accounts {
        for acc in accounts {
            sqlx::query(&state.db.format_query(
                "INSERT INTO volcengine_pool_account_mapping (pool_id, account_id, status, quota_unit, daily_reset_hour, daily_reset_minute, period_start, period_end, daily_quota, hourly_quota, period_quota, priority) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            ))
            .bind(pool.id)
            .bind(acc.account_id)
            .bind(acc.status.as_deref().unwrap_or("active"))
            .bind(acc.quota_unit.as_deref().unwrap_or("tokens"))
            .bind(acc.daily_reset_hour.unwrap_or(0))
            .bind(acc.daily_reset_minute.unwrap_or(0))
            .bind(acc.period_start.as_deref().unwrap_or(""))
            .bind(acc.period_end.as_deref().unwrap_or(""))
            .bind(acc.daily_quota.unwrap_or(0.0))
            .bind(acc.hourly_quota.unwrap_or(0.0))
            .bind(acc.period_quota.unwrap_or(0.0))
            .bind(acc.priority.unwrap_or(0))
            .execute(&mut *tx)
            .await?;
        }
    }"""
content = content.replace(create_pool_old, create_pool_new)

# 3. update_pool
update_pool_old = """    if let Some(name) = req.name { pool.name = name; }
    if let Some(pool_type) = req.pool_type { pool.pool_type = pool_type; }
    if let Some(strategy) = req.strategy { pool.strategy = strategy; }
    if let Some(a) = req.is_active { pool.is_active = a; }
    if let Some(r) = req.remark { pool.remark = Some(r); }

    sqlx::query(&state.db.format_query(
        "UPDATE volcengine_pools SET name = ?, pool_type = ?, strategy = ?, \\
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
    }"""

update_pool_new = """    if let Some(name) = req.name { pool.name = name; }
    if let Some(pool_type) = req.pool_type { pool.pool_type = pool_type; }
    if let Some(strategy) = req.strategy { pool.strategy = strategy; }
    if let Some(a) = req.is_active { pool.is_active = a; }
    if let Some(r) = req.remark { pool.remark = Some(r); }
    if let Some(mid) = req.model_id { pool.model_id = mid; }

    sqlx::query(&state.db.format_query(
        "UPDATE volcengine_pools SET name = ?, pool_type = ?, strategy = ?, \\
         is_active = ?, remark = ?, model_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ))
    .bind(&pool.name)
    .bind(&pool.pool_type)
    .bind(&pool.strategy)
    .bind(pool.is_active)
    .bind(&pool.remark)
    .bind(&pool.model_id)
    .bind(id)
    .execute(&mut *tx)
    .await?;

    if let Some(accounts) = req.accounts {
        // 先删除旧映射
        sqlx::query(&state.db.format_query("DELETE FROM volcengine_pool_account_mapping WHERE pool_id = ?"))
            .bind(id)
            .execute(&mut *tx)
            .await?;
        
        // 插入新映射
        for acc in accounts {
            sqlx::query(&state.db.format_query(
                "INSERT INTO volcengine_pool_account_mapping (pool_id, account_id, status, quota_unit, daily_reset_hour, daily_reset_minute, period_start, period_end, daily_quota, hourly_quota, period_quota, priority) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            ))
            .bind(id)
            .bind(acc.account_id)
            .bind(acc.status.as_deref().unwrap_or("active"))
            .bind(acc.quota_unit.as_deref().unwrap_or("tokens"))
            .bind(acc.daily_reset_hour.unwrap_or(0))
            .bind(acc.daily_reset_minute.unwrap_or(0))
            .bind(acc.period_start.as_deref().unwrap_or(""))
            .bind(acc.period_end.as_deref().unwrap_or(""))
            .bind(acc.daily_quota.unwrap_or(0.0))
            .bind(acc.hourly_quota.unwrap_or(0.0))
            .bind(acc.period_quota.unwrap_or(0.0))
            .bind(acc.priority.unwrap_or(0))
            .execute(&mut *tx)
            .await?;
        }
    }"""
content = content.replace(update_pool_old, update_pool_new)

# 4. create_account
create_account_old = """    let account: VolcenginePoolAccount = sqlx::query_as(&state.db.format_query(
        "INSERT INTO volcengine_pool_accounts (name, base_url, api_key, models, quota_unit, daily_reset_hour, daily_reset_minute, period_start, period_end, daily_quota, hourly_quota, period_quota, priority) \\
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
    .await?;"""

create_account_new = """    let account: VolcenginePoolAccount = sqlx::query_as(&state.db.format_query(
        "INSERT INTO volcengine_pool_accounts (name, base_url, api_key) \\
         VALUES (?, ?, ?) RETURNING *",
    ))
    .bind(&req.name)
    .bind(req.base_url.as_deref().unwrap_or("https://ark.cn-beijing.volces.com/api/v3"))
    .bind(&req.api_key)
    .fetch_one(&state.db.pool)
    .await?;"""
content = content.replace(create_account_old, create_account_new)

# 5. update_account
update_account_old = """    if let Some(name) = req.name { account.name = name; }
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
        "UPDATE volcengine_pool_accounts SET name = ?, base_url = ?, api_key = ?, models = ?, status = ?, \\
         quota_unit = ?, daily_reset_hour = ?, daily_reset_minute = ?, period_start = ?, period_end = ?, \\
         daily_quota = ?, hourly_quota = ?, period_quota = ?, priority = ?, \\
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
    .await?;"""

update_account_new = """    if let Some(name) = req.name { account.name = name; }
    if let Some(url) = req.base_url { account.base_url = url; }
    if let Some(key) = req.api_key { account.api_key = key; }
    if let Some(status) = req.status { account.status = status; }

    sqlx::query(&state.db.format_query(
        "UPDATE volcengine_pool_accounts SET name = ?, base_url = ?, api_key = ?, status = ?, \\
         updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ))
    .bind(&account.name)
    .bind(&account.base_url)
    .bind(&account.api_key)
    .bind(&account.status)
    .bind(id)
    .execute(&state.db.pool)
    .await?;"""
content = content.replace(update_account_old, update_account_new)

# 6. reset_account_quota
reset_old = """    sqlx::query(&state.db.format_query(
        "UPDATE volcengine_pool_accounts SET daily_used = 0, hourly_used = 0, period_used = 0, \\
         status = 'active', last_error = NULL, last_error_at = NULL, \\
         updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ))"""

reset_new = """    // 重置账号自身状态
    sqlx::query(&state.db.format_query(
        "UPDATE volcengine_pool_accounts SET status = 'active', last_error = NULL, last_error_at = NULL, \\
         updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ))
    .bind(id)
    .execute(&state.db.pool)
    .await?;

    // 重置该账号在所有卡池的配额
    sqlx::query(&state.db.format_query(
        "UPDATE volcengine_pool_account_mapping SET daily_used = 0, hourly_used = 0, period_used = 0, \\
         status = 'active' WHERE account_id = ?",
    ))"""
content = content.replace(reset_old, reset_new)

with open("backend/src/api/volcengine_pool.rs", "w") as f:
    f.write(content)

