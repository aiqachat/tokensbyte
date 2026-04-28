import re

with open("backend/src/services/volcengine_pool.rs", "r") as f:
    content = f.read()

struct_def = """
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, sqlx::FromRow)]
pub struct AccountWithMapping {
    pub id: i64,
    pub name: String,
    pub base_url: String,
    pub api_key: String,
    pub account_status: String,
    pub last_error: Option<String>,
    pub last_error_at: Option<String>,
    pub pool_id: i64,
    pub account_id: i64,
    pub status: String,
    pub quota_unit: String,
    pub daily_reset_hour: i32,
    pub daily_reset_minute: i32,
    pub period_start: String,
    pub period_end: String,
    pub daily_quota: f64,
    pub hourly_quota: f64,
    pub period_quota: f64,
    pub daily_used: f64,
    pub hourly_used: f64,
    pub period_used: f64,
    pub last_daily_reset: String,
    pub last_hourly_reset: String,
    pub last_period_reset: String,
    pub priority: i32,
}
"""

content = content.replace("use std::sync::Arc;", "use std::sync::Arc;" + struct_def)
content = content.replace("Option<VolcenginePoolAccount>", "Option<VolcenginePoolAccount>")

# select_account body
sel_old = """    // 2. 获取所有账号
    let mut accounts: Vec<VolcenginePoolAccount> = sqlx::query_as(
        &state.db.format_query("SELECT a.* FROM volcengine_pool_accounts a JOIN volcengine_pool_account_mapping m ON a.id = m.account_id WHERE m.pool_id = ? ORDER BY a.priority DESC"),
    )
    .bind(pool_id)
    .fetch_all(&state.db.pool)
    .await
    .unwrap_or_default();

    if accounts.is_empty() {
        tracing::warn!("[卡池] 卡池 '{}' (id={}) 没有任何账号", pool.name, pool.id);
        return None;
    }

    // 3. 检查并重置配额 (现在重置规则在账号自己身上)
    check_and_reset_quotas(state, &mut accounts).await;

    // 4. 过滤可用账号（状态正常、配额充足、且支持请求的模型）
    let available: Vec<&VolcenginePoolAccount> = accounts
        .iter()
        .filter(|a| is_account_available(a, model_id))
        .collect();"""

sel_new = """    // 2. 获取所有账号及映射关系
    let mut accounts: Vec<AccountWithMapping> = sqlx::query_as(
        &state.db.format_query("SELECT a.id, a.name, a.base_url, a.api_key, a.status as account_status, a.last_error, a.last_error_at, m.pool_id, m.account_id, m.status, m.quota_unit, m.daily_reset_hour, m.daily_reset_minute, m.period_start, m.period_end, m.daily_quota, m.hourly_quota, m.period_quota, m.daily_used, m.hourly_used, m.period_used, m.last_daily_reset, m.last_hourly_reset, m.last_period_reset, m.priority FROM volcengine_pool_accounts a JOIN volcengine_pool_account_mapping m ON a.id = m.account_id WHERE m.pool_id = ? ORDER BY m.priority DESC"),
    )
    .bind(pool_id)
    .fetch_all(&state.db.pool)
    .await
    .unwrap_or_default();

    if accounts.is_empty() {
        tracing::warn!("[卡池] 卡池 '{}' (id={}) 没有任何账号", pool.name, pool.id);
        return None;
    }

    // 3. 检查并重置配额
    check_and_reset_quotas(state, &mut accounts).await;

    // 4. 过滤可用账号（状态正常、配额充足）
    let available: Vec<&AccountWithMapping> = accounts
        .iter()
        .filter(|a| is_account_available(a, model_id))
        .collect();"""
content = content.replace(sel_old, sel_new)

# mapping the return back to VolcenginePoolAccount or just return the mapped fields.
# But wait, VolcenginePoolAccount is used elsewhere... Let's just create a VolcenginePoolAccount out of it.
ret_old = """    if let Some(account) = selected {
        tracing::info!(
            "[卡池] 选中账号: '{}' (id={}) | 卡池: '{}' | 策略: {}",
            account.name, account.id, pool.name, pool.strategy
        );
        Some(account.clone())
    } else {
        None
    }"""
ret_new = """    if let Some(account) = selected {
        tracing::info!(
            "[卡池] 选中账号: '{}' (id={}) | 卡池: '{}' | 策略: {}",
            account.name, account.id, pool.name, pool.strategy
        );
        Some(VolcenginePoolAccount {
            id: account.id,
            name: account.name.clone(),
            base_url: account.base_url.clone(),
            api_key: account.api_key.clone(),
            status: account.account_status.clone(),
            last_error: account.last_error.clone(),
            last_error_at: account.last_error_at.clone(),
            created_at: "".into(),
            updated_at: "".into(),
        })
    } else {
        None
    }"""
content = content.replace(ret_old, ret_new)

# is_account_available
is_avail_old = """fn is_account_available(account: &VolcenginePoolAccount, model_id: &str) -> bool {
    // 状态非 active 一律不可用
    if account.status != "active" {
        return false;
    }

    // 模型过滤：如果账号配置了 models，必须包含请求的 model_id
    if !account.models.is_empty() {
        let supported: Vec<&str> = account.models.split(',').map(|s| s.trim()).collect();
        if !supported.contains(&model_id) {
            return false;
        }
    }"""
is_avail_new = """fn is_account_available(account: &AccountWithMapping, model_id: &str) -> bool {
    // 账号自身状态或映射状态非 active 一律不可用
    if account.account_status != "active" || account.status != "active" {
        return false;
    }"""
content = content.replace(is_avail_old, is_avail_new)

# check_and_reset_quotas signature
check_reset_old = """async fn check_and_reset_quotas(
    state: &Arc<AppState>,
    accounts: &mut Vec<VolcenginePoolAccount>,
) {"""
check_reset_new = """async fn check_and_reset_quotas(
    state: &Arc<AppState>,
    accounts: &mut Vec<AccountWithMapping>,
) {"""
content = content.replace(check_reset_old, check_reset_new)

# check_and_reset_quotas sql
sql_old = """            sqlx::query(&state.db.format_query(
                "UPDATE volcengine_pool_accounts SET daily_used = ?, hourly_used = ?, period_used = ?, \\
                 last_daily_reset = ?, last_hourly_reset = ?, last_period_reset = ?, \\
                 status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            ))
            .bind(account.daily_used)
            .bind(account.hourly_used)
            .bind(account.period_used)
            .bind(&account.last_daily_reset)
            .bind(&account.last_hourly_reset)
            .bind(&account.last_period_reset)
            .bind(status_val)
            .bind(account.id)"""
sql_new = """            sqlx::query(&state.db.format_query(
                "UPDATE volcengine_pool_account_mapping SET daily_used = ?, hourly_used = ?, period_used = ?, \\
                 last_daily_reset = ?, last_hourly_reset = ?, last_period_reset = ?, \\
                 status = ? WHERE pool_id = ? AND account_id = ?",
            ))
            .bind(account.daily_used)
            .bind(account.hourly_used)
            .bind(account.period_used)
            .bind(&account.last_daily_reset)
            .bind(&account.last_hourly_reset)
            .bind(&account.last_period_reset)
            .bind(status_val)
            .bind(account.pool_id)
            .bind(account.account_id)"""
content = content.replace(sql_old, sql_new)

# record_usage
rec_old = """    // 更新使用量
    sqlx::query(&state.db.format_query(
        "UPDATE volcengine_pool_accounts SET \\
         daily_used = daily_used + ?, hourly_used = hourly_used + ?, period_used = period_used + ?, \\
         updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ))
    .bind(usage_amount)
    .bind(usage_amount)
    .bind(usage_amount)
    .bind(account_id)
    .execute(&state.db.pool)
    .await
    .ok();

    // 检查是否超出配额，标记 exhausted
    let account: Option<VolcenginePoolAccount> = sqlx::query_as(
        &state.db.format_query("SELECT * FROM volcengine_pool_accounts WHERE id = ?"),
    )
    .bind(account_id)
    .fetch_optional(&state.db.pool)
    .await
    .unwrap_or(None);"""

rec_new = """    // 更新使用量
    sqlx::query(&state.db.format_query(
        "UPDATE volcengine_pool_account_mapping SET \\
         daily_used = daily_used + ?, hourly_used = hourly_used + ?, period_used = period_used + ? \\
         WHERE pool_id = ? AND account_id = ?",
    ))
    .bind(usage_amount)
    .bind(usage_amount)
    .bind(usage_amount)
    .bind(pool_id)
    .bind(account_id)
    .execute(&state.db.pool)
    .await
    .ok();

    // 检查是否超出配额，标记 exhausted
    let account: Option<AccountWithMapping> = sqlx::query_as(
        &state.db.format_query("SELECT a.id, a.name, a.base_url, a.api_key, a.status as account_status, a.last_error, a.last_error_at, m.pool_id, m.account_id, m.status, m.quota_unit, m.daily_reset_hour, m.daily_reset_minute, m.period_start, m.period_end, m.daily_quota, m.hourly_quota, m.period_quota, m.daily_used, m.hourly_used, m.period_used, m.last_daily_reset, m.last_hourly_reset, m.last_period_reset, m.priority FROM volcengine_pool_accounts a JOIN volcengine_pool_account_mapping m ON a.id = m.account_id WHERE m.pool_id = ? AND m.account_id = ?"),
    )
    .bind(pool_id)
    .bind(account_id)
    .fetch_optional(&state.db.pool)
    .await
    .unwrap_or(None);"""
content = content.replace(rec_old, rec_new)

# mark exhausted
ex_old = """            sqlx::query(&state.db.format_query(
                "UPDATE volcengine_pool_accounts SET status = 'exhausted', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            ))
            .bind(account_id)"""
ex_new = """            sqlx::query(&state.db.format_query(
                "UPDATE volcengine_pool_account_mapping SET status = 'exhausted' WHERE pool_id = ? AND account_id = ?",
            ))
            .bind(pool_id)
            .bind(account_id)"""
content = content.replace(ex_old, ex_new)

with open("backend/src/services/volcengine_pool.rs", "w") as f:
    f.write(content)
