/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

//! 令牌额度累加 / 退款（事务内调用，FOR UPDATE 防并发超用）
//! 热路径优先走内存拦截 + BillingPipeline 异步刷库；管道满时回退本模块同步 consume。

use crate::db::Database;
use crate::models::ApiToken;
use crate::AppState;
use sqlx::{Postgres, Transaction};

/// 在持锁前提下：当前未耗尽则允许整笔累加（最后一笔可略超）；已耗尽则返回 0。
pub fn allowed_consume_amount(
    token: &ApiToken,
    amount: f64,
    now_day: &str,
    now_week: &str,
    now_month: &str,
) -> f64 {
    if amount <= 0.0 {
        return 0.0;
    }
    if token
        .check_quota_limits(now_day, now_week, now_month)
        .is_err()
    {
        return 0.0;
    }
    amount
}

fn consume_sql() -> &'static str {
    "UPDATE api_tokens SET \
     quota_used = quota_used + ?, \
     daily_quota_used = CASE WHEN COALESCE(last_reset_day, '') <> ? THEN ? ELSE daily_quota_used + ? END, \
     weekly_quota_used = CASE WHEN COALESCE(last_reset_week, '') <> ? THEN ? ELSE weekly_quota_used + ? END, \
     monthly_quota_used = CASE WHEN COALESCE(last_reset_month, '') <> ? THEN ? ELSE monthly_quota_used + ? END, \
     last_reset_day = ?, \
     last_reset_week = ?, \
     last_reset_month = ?, \
     updated_at = CURRENT_TIMESTAMP \
     WHERE id = ?"
}

fn refund_sql() -> &'static str {
    "UPDATE api_tokens SET \
     quota_used = GREATEST(0, quota_used - ?), \
     daily_quota_used = CASE WHEN COALESCE(last_reset_day, '') = ? THEN GREATEST(0, daily_quota_used - ?) ELSE daily_quota_used END, \
     weekly_quota_used = CASE WHEN COALESCE(last_reset_week, '') = ? THEN GREATEST(0, weekly_quota_used - ?) ELSE weekly_quota_used END, \
     monthly_quota_used = CASE WHEN COALESCE(last_reset_month, '') = ? THEN GREATEST(0, monthly_quota_used - ?) ELSE monthly_quota_used END, \
     updated_at = CURRENT_TIMESTAMP \
     WHERE id = ?"
}

/// 异步优先切流：内存占用额度 → 投递 MPSC；失败则事务内同步落库（内存已占用，不再 apply_incr）。
pub async fn consume_async_or_sync(
    state: &AppState,
    tx: &mut Transaction<'_, Postgres>,
    token: &ApiToken,
    amount: f64,
    timedisplay: &str,
) -> Result<f64, sqlx::Error> {
    if amount <= 0.0 || token.id <= 0 {
        return Ok(0.0);
    }

    let limits = super::quota_memory::limits_from_token(token);
    let incr = match state
        .quota_memory
        .check_and_incr_quota(&state.db, token.id, amount, timedisplay, &limits)
        .await
    {
        Ok(v) => v,
        Err(e) => {
            tracing::warn!(
                "[TokenQuota] 内存限额拒绝 token_id={} amount={:.6}: {}",
                token.id,
                amount,
                e
            );
            return Ok(0.0);
        }
    };
    if incr.amount <= 0.0 {
        return Ok(0.0);
    }

    let event = super::billing_pipeline::ConsumeEvent {
        token_id: token.id,
        amount: incr.amount,
        day: incr.day.clone(),
        week: incr.week.clone(),
        month: incr.month.clone(),
    };
    if state.billing_ingress.try_enqueue(event) {
        return Ok(incr.amount);
    }

    tracing::warn!(
        "[TokenQuota] BillingPipeline 已满，回退同步落库 token_id={} amount={:.6}",
        token.id,
        incr.amount
    );
    // 内存已累加：同步只写 DB，使用消费时刻锁定的 keys
    consume_db_with_keys(
        &state.db,
        tx,
        token.id,
        incr.amount,
        &incr.day,
        &incr.week,
        &incr.month,
    )
    .await?;
    Ok(incr.amount)
}

/// 仅写 DB（不改内存）；使用调用方锁定的 period keys。
async fn consume_db_with_keys(
    db: &Database,
    tx: &mut Transaction<'_, Postgres>,
    token_id: i64,
    amount: f64,
    day: &str,
    week: &str,
    month: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(&db.format_query(consume_sql()))
        .bind(amount)
        .bind(day)
        .bind(amount)
        .bind(amount)
        .bind(week)
        .bind(amount)
        .bind(amount)
        .bind(month)
        .bind(amount)
        .bind(amount)
        .bind(day)
        .bind(week)
        .bind(month)
        .bind(token_id)
        .execute(&mut **tx)
        .await?;
    Ok(())
}

/// 仅写 DB（不改内存）；按当前时刻 tz 算 keys（同步路径兼容）。
async fn consume_db_only(
    db: &Database,
    tx: &mut Transaction<'_, Postgres>,
    token_id: i64,
    amount: f64,
    tz_name: &str,
) -> Result<(), sqlx::Error> {
    let (now_day, now_week, now_month) = crate::models::quota_period_keys(tz_name);
    consume_db_with_keys(db, tx, token_id, amount, &now_day, &now_week, &now_month).await
}

/// 消费令牌额度：行锁后校验，未耗尽则累加 `amount`，已耗尽则跳过（返回实际累加值）。
pub async fn consume(
    db: &Database,
    tx: &mut Transaction<'_, Postgres>,
    token_id: i64,
    amount: f64,
    tz_name: &str,
) -> Result<f64, sqlx::Error> {
    if amount <= 0.0 || token_id <= 0 {
        return Ok(0.0);
    }

    let token: ApiToken =
        sqlx::query_as(&db.format_query("SELECT * FROM api_tokens WHERE id = ? FOR UPDATE"))
            .bind(token_id)
            .fetch_one(&mut **tx)
            .await?;

    let (now_day, now_week, now_month) = crate::models::quota_period_keys(tz_name);
    let add = allowed_consume_amount(&token, amount, &now_day, &now_week, &now_month);
    if add <= 0.0 {
        tracing::warn!(
            "[TokenQuota] 跳过累加：令牌额度已耗尽 token_id={}, amount={:.6}",
            token_id,
            amount
        );
        return Ok(0.0);
    }

    consume_db_only(db, tx, token_id, add, tz_name).await?;
    Ok(add)
}

/// 退款：扣减总额与当前周期已用量（不低于 0）；调用方应同步 `quota_memory.apply_refund`。
pub async fn refund(
    db: &Database,
    tx: &mut Transaction<'_, Postgres>,
    token_id: i64,
    amount: f64,
    tz_name: &str,
) -> Result<(), sqlx::Error> {
    if amount <= 0.0 || token_id <= 0 {
        return Ok(());
    }
    let (now_day, now_week, now_month) = crate::models::quota_period_keys(tz_name);
    sqlx::query(&db.format_query(refund_sql()))
        .bind(amount)
        .bind(&now_day)
        .bind(amount)
        .bind(&now_week)
        .bind(amount)
        .bind(&now_month)
        .bind(amount)
        .bind(token_id)
        .execute(&mut **tx)
        .await?;
    Ok(())
}

/// 带内存镜像的结算差额（异步任务结算等低频路径）
pub async fn apply_delta_with_memory(
    state: &AppState,
    tx: &mut Transaction<'_, Postgres>,
    token_id: i64,
    delta: f64,
    tz_name: &str,
) -> Result<f64, sqlx::Error> {
    if delta > 0.0 {
        let added = consume(&state.db, tx, token_id, delta, tz_name).await?;
        if added > 0.0 {
            let day = crate::time_system::local_period_keys(tz_name).day;
            state.quota_memory.apply_incr(token_id, &day, added);
        }
        Ok(added)
    } else if delta < 0.0 {
        let amount = -delta;
        refund(&state.db, tx, token_id, amount, tz_name).await?;
        state
            .quota_memory
            .apply_refund_ensured(&state.db, token_id, tz_name, amount)
            .await;
        Ok(delta)
    } else {
        Ok(0.0)
    }
}
