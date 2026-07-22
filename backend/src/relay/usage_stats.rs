/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

use crate::error::AppResult;
use crate::AppState;
use chrono::{DateTime, NaiveDate, Utc};
use chrono_tz::Tz;
use std::sync::Arc;

/// 归档表 `stat_date` 使用**站点默认 timedisplay** 分桶（全站统一日历）。
async fn archive_timezone(state: &Arc<AppState>) -> Tz {
    let (tz_name, _) = crate::relay::get_cached_config(state).await;
    crate::time_system::parse_timedisplay(&tz_name)
}

/// 本地日历日半开区间 `[start, end)`（end = 次日零点）。
fn local_day_range_rfc3339(day: NaiveDate, tz: Tz) -> (String, String) {
    let b = crate::time_system::period::local_calendar_day_bounds(day, tz.name());
    (b.start_rfc3339, b.end_rfc3339)
}

/// 日聚合 upsert 模板（`?` 占位）。按日批次调用，避免周扫放大。
fn stats_upsert_sql_template(tz_sql: &str) -> String {
    format!(
        "INSERT INTO usage_daily_stats (
            stat_date, user_id, model, token_id, channel_id, action_type,
            total_requests, total_tokens, total_cost, total_pre_deduct_gift, success_count, fail_count
        )
        SELECT
            CAST(created_at AT TIME ZONE '{tz}' AS DATE),
            user_id,
            model,
            COALESCE(token_id, -1),
            COALESCE(channel_id, -1),
            COALESCE(action_type, ''),
            COUNT(*),
            SUM(prompt_tokens + completion_tokens),
            SUM(cost),
            SUM(pre_deduct_gift),
            COUNT(*) FILTER (WHERE status_code >= 200 AND status_code < 400),
            COUNT(*) FILTER (WHERE status_code < 200 OR status_code >= 400)
        FROM logs
        WHERE created_at >= ?::timestamptz AND created_at < ?::timestamptz
        GROUP BY 1, 2, 3, 4, 5, 6
        ON CONFLICT (stat_date, user_id, model, token_id, channel_id, action_type)
        DO UPDATE SET
            total_requests = EXCLUDED.total_requests,
            total_tokens = EXCLUDED.total_tokens,
            total_cost = EXCLUDED.total_cost,
            total_pre_deduct_gift = EXCLUDED.total_pre_deduct_gift,
            success_count = EXCLUDED.success_count,
            fail_count = EXCLUDED.fail_count",
        tz = tz_sql
    )
}

/// 按本地自然日推进；失败即中止；日间短暂让出连接池。
async fn perform_batch_sync(
    state: &Arc<AppState>,
    start: NaiveDate,
    end: NaiveDate,
    task_name: &str,
) -> AppResult<()> {
    use chrono::Duration;

    if start >= end {
        tracing::info!(
            "[{}] 落地表数据已是最新，无需同步。范围: {:?} 至 {:?}",
            task_name,
            start,
            end
        );
        return Ok(());
    }

    let archive_tz = archive_timezone(state).await;
    let sql = state.db.format_query(&stats_upsert_sql_template(
        &crate::api::date_helper::sql_safe_tz_name(archive_tz),
    ));

    tracing::info!(
        "[{}] 开始按日分批数据同步: {:?} 至 {:?} (archive_tz={})",
        task_name,
        start,
        end,
        archive_tz.name()
    );

    let mut current_day = start;
    while current_day < end {
        let (start_str, end_str) = local_day_range_rfc3339(current_day, archive_tz);
        match sqlx::query(&sql)
            .bind(&start_str)
            .bind(&end_str)
            .execute(&state.db.pool)
            .await
        {
            Ok(done) => {
                tracing::info!(
                    "[{}] 同步 {} 成功，落地行数: {}",
                    task_name,
                    current_day,
                    done.rows_affected()
                );
            }
            Err(e) => {
                tracing::error!("[{}] 同步 {} 失败: {:?}", task_name, current_day, e);
                return Err(e.into());
            }
        }

        current_day += Duration::days(1);
        if current_day < end {
            tokio::time::sleep(std::time::Duration::from_millis(80)).await;
        }
    }

    tracing::info!("[{}] 数据同步任务顺利执行完毕。", task_name);
    Ok(())
}

static LAST_SYNC_DATE: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);

/// 定时增量更新最近 3 天（站点 timedisplay 本地日切后首小时）
pub async fn sync_daily_stats(state: &Arc<AppState>) -> AppResult<()> {
    use chrono::{Datelike, Duration, Timelike};

    let archive_tz = archive_timezone(state).await;
    let local_now = chrono::Utc::now().with_timezone(&archive_tz);
    if local_now.hour() != 0 {
        return Ok(());
    }

    let today_date_num = (local_now.year() as u32) * 10000
        + (local_now.month() as u32) * 100
        + (local_now.day() as u32);
    if LAST_SYNC_DATE.load(std::sync::atomic::Ordering::Relaxed) == today_date_num {
        return Ok(());
    }

    let today = local_now.date_naive();
    let three_days_ago = today - Duration::days(3);
    tracing::info!(
        "[CronDailyStats] 凌晨增量同步启动: {} → {} (tz={})",
        three_days_ago,
        today,
        archive_tz.name()
    );

    match perform_batch_sync(state, three_days_ago, today, "CronDailyStats").await {
        Ok(()) => {
            tracing::info!("[CronDailyStats] 凌晨增量同步成功完成");
            LAST_SYNC_DATE.store(today_date_num, std::sync::atomic::Ordering::Relaxed);
        }
        Err(e) => tracing::error!("[CronDailyStats] 凌晨增量同步失败: {:?}", e),
    }
    Ok(())
}

/// 启动时后台回填（自动推断起点，按日推进）
pub async fn backfill_usage_daily_stats_on_startup(state: &Arc<AppState>) -> AppResult<()> {
    use chrono::Duration;

    let archive_tz = archive_timezone(state).await;
    let today_date = chrono::Utc::now().with_timezone(&archive_tz).date_naive();
    let yesterday_date = today_date - Duration::days(1);

    let max_date_val: Option<NaiveDate> = sqlx::query_scalar(
        &state
            .db
            .format_query("SELECT MAX(stat_date) FROM usage_daily_stats"),
    )
    .fetch_one(&state.db.pool)
    .await
    .unwrap_or(None);

    let start_date = match max_date_val {
        Some(max_d) if max_d >= yesterday_date => {
            tracing::info!(
                "[BackfillDailyStats] 落地表数据已是最新 (最大日期: {:?})，跳过回填。",
                max_d
            );
            return Ok(());
        }
        Some(max_d) => max_d - Duration::days(1),
        None => {
            let min_created_at: Option<DateTime<Utc>> =
                sqlx::query_scalar(&state.db.format_query("SELECT MIN(created_at) FROM logs"))
                    .fetch_one(&state.db.pool)
                    .await
                    .unwrap_or(None);
            match min_created_at {
                Some(min_ts) => min_ts.with_timezone(&archive_tz).date_naive(),
                None => {
                    tracing::info!("[BackfillDailyStats] logs 表中无任何日志，无需回填。");
                    return Ok(());
                }
            }
        }
    };

    perform_batch_sync(state, start_date, today_date, "StartupBackfill").await
}

/// 超级管理员手动校准入口
pub async fn manual_sync_usage_stats(
    state: &Arc<AppState>,
    start_date: Option<String>,
    end_date: Option<String>,
) -> AppResult<()> {
    use chrono::Duration;

    let archive_tz = archive_timezone(state).await;
    let local_now = chrono::Utc::now().with_timezone(&archive_tz);
    let start = crate::api::date_helper::parse_to_naive_date(
        start_date.as_deref(),
        (local_now - Duration::days(30)).date_naive(),
        archive_tz,
    );
    let end = crate::api::date_helper::parse_to_naive_date(
        end_date.as_deref(),
        local_now.date_naive(),
        archive_tz,
    );

    // 含终止日当天 → 半开上界为 end+1 零点
    perform_batch_sync(state, start, end + Duration::days(1), "AdminManualSync").await
}

/// 按时间切片汇总模型消耗（历史归档表 + logs 实时段）
pub async fn query_model_stats_by_slices(
    db: &crate::db::Database,
    user_id_filter: Option<&str>,
    slices: &crate::api::date_helper::QueryTimeSlice,
) -> AppResult<std::collections::HashMap<String, (i64, f64, i64)>> {
    let mut model_map = std::collections::HashMap::new();

    if slices.has_history_days {
        #[derive(sqlx::FromRow)]
        struct ModelHistRow {
            model: String,
            cost: Option<f64>,
            tokens: Option<i64>,
            count: Option<i64>,
        }

        let mut sql = String::from(
            "SELECT model, SUM(total_cost) as cost, CAST(SUM(total_tokens) AS BIGINT) as tokens, \
             CAST(SUM(total_requests) AS BIGINT) as count FROM usage_daily_stats WHERE ",
        );
        let mut binds = Vec::new();
        if let Some(uid) = user_id_filter {
            sql.push_str("user_id = ? AND ");
            binds.push(uid.to_string());
        }
        sql.push_str(&slices.history_cond("stat_date"));
        sql.push_str(" GROUP BY model");

        let formatted_sql = db.format_query(&sql);
        let mut q = sqlx::query_as::<_, ModelHistRow>(&formatted_sql);
        for bind_val in &binds {
            q = q.bind(bind_val);
        }
        let hist_rows = q
            .bind(slices.hist_start_date)
            .bind(slices.hist_end_date)
            .fetch_all(&db.pool)
            .await?;
        for row in hist_rows {
            let entry = model_map.entry(row.model).or_insert((0i64, 0.0f64, 0i64));
            entry.0 += row.count.unwrap_or(0);
            entry.1 += row.cost.unwrap_or(0.0);
            entry.2 += row.tokens.unwrap_or(0);
        }
    }

    #[derive(sqlx::FromRow)]
    struct ModelTodayRow {
        model: String,
        cost: Option<f64>,
        tokens: Option<i64>,
        count: i64,
    }

    for r_slice in slices.realtime_slices() {
        let mut sql = String::from(
            "SELECT model, SUM(cost) as cost, SUM(prompt_tokens + completion_tokens) as tokens, \
             COUNT(*) as count FROM logs WHERE ",
        );
        let mut binds = Vec::new();
        if let Some(uid) = user_id_filter {
            sql.push_str("user_id = ? AND ");
            binds.push(uid.to_string());
        }
        sql.push_str(&r_slice.sql_cond("created_at"));
        sql.push_str(" GROUP BY model");

        let formatted_sql = db.format_query(&sql);
        let mut q = sqlx::query_as::<_, ModelTodayRow>(&formatted_sql);
        for bind_val in &binds {
            q = q.bind(bind_val);
        }
        let rows = q
            .bind(&r_slice.start)
            .bind(&r_slice.end)
            .fetch_all(&db.pool)
            .await?;
        for row in rows {
            let entry = model_map.entry(row.model).or_insert((0i64, 0.0f64, 0i64));
            entry.0 += row.count;
            entry.1 += row.cost.unwrap_or(0.0);
            entry.2 += row.tokens.unwrap_or(0);
        }
    }

    Ok(model_map)
}
