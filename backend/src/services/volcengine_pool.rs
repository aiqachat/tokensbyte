//! 火山引擎卡池调度服务
//!
//! 核心职责：
//! 1. 根据调度策略（random/sequential）选择可用账号
//! 2. 检查并重置过期配额（每日/每小时/时段）
//! 3. 记录使用量和故障状态

use crate::AppState;
use crate::models::volcengine_pool::{VolcenginePool, VolcenginePoolAccount};
use chrono::{Local, Timelike, NaiveTime};
use rand::seq::SliceRandom;
use std::sync::Arc;

/// 从指定卡池中选择一个可用账号
///
/// 流程：
/// 1. 查询卡池配置
/// 2. 获取卡池下所有账号
/// 3. 检查并重置过期配额，disabled 账号在配额重置时自动恢复
/// 4. 过滤掉不可用的账号（disabled/exhausted/超配额）
/// 5. 按策略选择（random / sequential）
pub async fn select_account(
    state: &Arc<AppState>,
    pool_id: i64,
    model_id: &str,
) -> Option<VolcenginePoolAccount> {
    // 1. 查卡池配置
    let pool: VolcenginePool = sqlx::query_as(
        &state.db.format_query("SELECT * FROM volcengine_pools WHERE id = ? AND is_active = 1"),
    )
    .bind(pool_id)
    .fetch_optional(&state.db.pool)
    .await
    .ok()??;

    // 2. 获取所有账号
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
        .collect();

    if available.is_empty() {
        tracing::warn!(
            "[卡池] 卡池 '{}' (id={}) 无可用账号（共 {} 个，全部不可用）",
            pool.name, pool.id, accounts.len()
        );
        return None;
    }

    // 5. 按策略选择
    let selected = match pool.strategy.as_str() {
        "sequential" => {
            // 顺序轮转：按优先级取第一个可用
            available.first().copied()
        }
        _ => {
            // 随机分布（默认）
            let mut rng = rand::rngs::OsRng;
            available.choose(&mut rng).copied()
        }
    };

    if let Some(account) = selected {
        tracing::info!(
            "[卡池] 选中账号: '{}' (id={}) | 卡池: '{}' | 策略: {}",
            account.name, account.id, pool.name, pool.strategy
        );
        Some(account.clone())
    } else {
        None
    }
}

/// 判断账号是否可用
fn is_account_available(account: &VolcenginePoolAccount, model_id: &str) -> bool {
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
    }

    // 每日配额检查
    if account.daily_quota > 0.0 && account.daily_used >= account.daily_quota {
        return false;
    }

    // 每小时配额检查
    if account.hourly_quota > 0.0 && account.hourly_used >= account.hourly_quota {
        return false;
    }

    // 时段配额检查
    if account.period_quota > 0.0
        && !account.period_start.is_empty()
        && !account.period_end.is_empty()
    {
        if is_in_period(&account.period_start, &account.period_end) {
            if account.period_used >= account.period_quota {
                return false;
            }
        }
    }

    true
}

/// 判断当前时间是否在指定时段内
fn is_in_period(start: &str, end: &str) -> bool {
    let now = Local::now();
    let current = NaiveTime::from_hms_opt(now.hour(), now.minute(), 0);
    let start_time = NaiveTime::parse_from_str(start, "%H:%M").ok();
    let end_time = NaiveTime::parse_from_str(end, "%H:%M").ok();

    match (current, start_time, end_time) {
        (Some(c), Some(s), Some(e)) => {
            if s <= e {
                c >= s && c < e
            } else {
                // 跨午夜：如 22:00 ~ 06:00
                c >= s || c < e
            }
        }
        _ => false,
    }
}

/// 检查并重置过期配额
///
/// - 每日配额：到达账号设置的刷新时间后重置 daily_used，disabled 账号恢复为 active
/// - 每小时配额：自然整点重置 hourly_used
/// - 时段配额：时段开始时间重置 period_used
async fn check_and_reset_quotas(
    state: &Arc<AppState>,
    accounts: &mut Vec<VolcenginePoolAccount>,
) {
    let now = Local::now();
    let today = now.format("%Y-%m-%d").to_string();
    let current_hour = now.format("%Y-%m-%d-%H").to_string();

    for account in accounts.iter_mut() {
        let reset_hour = account.daily_reset_hour;
        let reset_minute = account.daily_reset_minute;

        // 计算当日的重置时间点标识符 (YYYY-MM-DD)
        let reset_date = if now.hour() as i32 > reset_hour
            || (now.hour() as i32 == reset_hour && now.minute() as i32 >= reset_minute)
        {
            today.clone()
        } else {
            (now - chrono::Duration::days(1))
                .format("%Y-%m-%d")
                .to_string()
        };

        let mut need_update = false;
        let mut status_restored = false;

        // 每日配额重置
        if account.last_daily_reset != reset_date {
            account.daily_used = 0.0;
            account.last_daily_reset = reset_date.clone();
            need_update = true;

            // 配额重置时，disabled/exhausted 状态自动恢复为 active
            if account.status == "disabled" || account.status == "exhausted" {
                account.status = "active".to_string();
                status_restored = true;
                tracing::info!(
                    "[卡池] 账号 '{}' (id={}) 每日配额重置，状态恢复为 active",
                    account.name, account.id
                );
            }
        }

        // 每小时配额重置
        if account.last_hourly_reset != current_hour {
            account.hourly_used = 0.0;
            account.last_hourly_reset = current_hour.clone();
            need_update = true;
        }

        // 时段配额重置
        if !account.period_start.is_empty() && !account.period_end.is_empty() {
            // 时段开始时间的标识符
            let period_reset_key = format!("{}-{}", today, account.period_start);
            if account.last_period_reset != period_reset_key && is_in_period(&account.period_start, &account.period_end) {
                account.period_used = 0.0;
                account.last_period_reset = period_reset_key;
                need_update = true;
            }
        }

        // 写入数据库
        if need_update {
            let status_val = if status_restored {
                "active"
            } else {
                &account.status
            };
            sqlx::query(&state.db.format_query(
                "UPDATE volcengine_pool_accounts SET daily_used = ?, hourly_used = ?, period_used = ?, \
                 last_daily_reset = ?, last_hourly_reset = ?, last_period_reset = ?, \
                 status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            ))
            .bind(account.daily_used)
            .bind(account.hourly_used)
            .bind(account.period_used)
            .bind(&account.last_daily_reset)
            .bind(&account.last_hourly_reset)
            .bind(&account.last_period_reset)
            .bind(status_val)
            .bind(account.id)
            .execute(&state.db.pool)
            .await
            .ok();
        }
    }
}

/// 记录账号使用量，超出配额后自动标记 exhausted
#[allow(dead_code)]
pub async fn record_usage(
    state: &Arc<AppState>,
    pool_id: i64,
    account_id: i64,
    account_name: &str,
    model_id: &str,
    channel_id: i64,
    usage_amount: f64,
    quota_unit: &str,
) {
    // 更新使用量
    sqlx::query(&state.db.format_query(
        "UPDATE volcengine_pool_accounts SET \
         daily_used = daily_used + ?, hourly_used = hourly_used + ?, period_used = period_used + ?, \
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
    .unwrap_or(None);

    if let Some(a) = account {
        let daily_exhausted = a.daily_quota > 0.0 && a.daily_used >= a.daily_quota;
        let hourly_exhausted = a.hourly_quota > 0.0 && a.hourly_used >= a.hourly_quota;
        let period_exhausted = a.period_quota > 0.0 && a.period_used >= a.period_quota;

        if daily_exhausted || hourly_exhausted || period_exhausted {
            sqlx::query(&state.db.format_query(
                "UPDATE volcengine_pool_accounts SET status = 'exhausted', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            ))
            .bind(account_id)
            .execute(&state.db.pool)
            .await
            .ok();
            tracing::info!(
                "[卡池] 账号 '{}' (id={}) 配额耗尽，标记为 exhausted",
                a.name, a.id
            );
        }
    }

    // 记录调度日志
    sqlx::query(&state.db.format_query(
        "INSERT INTO volcengine_pool_logs (pool_id, account_id, account_name, model_id, channel_id, usage_amount, quota_unit, status) \
         VALUES (?, ?, ?, ?, ?, ?, ?, 'success')",
    ))
    .bind(pool_id)
    .bind(account_id)
    .bind(account_name)
    .bind(model_id)
    .bind(channel_id)
    .bind(usage_amount)
    .bind(quota_unit)
    .execute(&state.db.pool)
    .await
    .ok();
}

/// 标记账号故障：当请求失败时调用
#[allow(dead_code)]
pub async fn mark_failed(
    state: &Arc<AppState>,
    pool_id: i64,
    account_id: i64,
    account_name: &str,
    model_id: &str,
    channel_id: i64,
    error: &str,
) {
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    sqlx::query(&state.db.format_query(
        "UPDATE volcengine_pool_accounts SET status = 'disabled', last_error = ?, last_error_at = ?, \
         updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ))
    .bind(error)
    .bind(&now)
    .bind(account_id)
    .execute(&state.db.pool)
    .await
    .ok();

    // 记录失败日志
    sqlx::query(&state.db.format_query(
        "INSERT INTO volcengine_pool_logs (pool_id, account_id, account_name, model_id, channel_id, usage_amount, quota_unit, status, error_message) \
         VALUES (?, ?, ?, ?, ?, 0, 'requests', 'failed', ?)",
    ))
    .bind(pool_id)
    .bind(account_id)
    .bind(account_name)
    .bind(model_id)
    .bind(channel_id)
    .bind(error)
    .execute(&state.db.pool)
    .await
    .ok();

    tracing::warn!(
        "[卡池] 账号 '{}' (id={}) 请求失败，标记为 disabled: {}",
        account_name, account_id, error
    );
}
