use crate::error::AppResult;
use crate::AppState;
use chrono::NaiveDate;
use chrono_tz::Tz;
use sqlx::postgres::PgQueryResult;
use std::sync::Arc;

/// 归档表 `stat_date` 使用**站点默认 timedisplay** 分桶（全站统一日历）。
/// 查询切片若用个人 timedisplay，在与站点时差窗口内历史段可能与归档日不完全对齐；
/// 财务/管理端聚合应优先站点时区。个人钱包「今日」实时段可用用户 timedisplay。
async fn archive_timezone(state: &Arc<AppState>) -> Tz {
    let (tz_name, _) = crate::relay::get_cached_config(state).await;
    crate::time_system::parse_timedisplay(&tz_name)
}

fn sql_safe_tz_name(tz: Tz) -> String {
    // IANA 名仅含安全字符，供嵌入 SQL AT TIME ZONE
    tz.name()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '/' | '_' | '+' | '-'))
        .collect()
}

fn local_day_start_ts(day: NaiveDate, tz: Tz) -> String {
    let bounds = crate::time_system::period::local_calendar_day_bounds(day, tz.name());
    bounds.start_rfc3339
}

// ── 核心辅助执行函数（统一处理 SQL 构造与数据库执行，消除冗余） ──

async fn execute_stats_upsert(
    state: &Arc<AppState>,
    start_str: &str,
    end_str: &str,
    archive_tz: Tz,
) -> Result<PgQueryResult, sqlx::Error> {
    let tz_sql = sql_safe_tz_name(archive_tz);
    let sql = state.db.format_query(&format!(
        "INSERT INTO usage_daily_stats (
            stat_date, user_id, model, token_id, channel_id, action_type,
            total_requests, total_tokens, total_cost, total_pre_deduct_gift, success_count, fail_count
        )
        SELECT 
            CAST({col} AT TIME ZONE '{tz}' AS DATE) as stat_date,
            user_id,
            model,
            COALESCE(token_id, -1) as token_id,
            COALESCE(channel_id, -1) as channel_id,
            COALESCE(action_type, '') as action_type,
            COUNT(*) as total_requests,
            SUM(prompt_tokens + completion_tokens) as total_tokens,
            SUM(cost) as total_cost,
            SUM(pre_deduct_gift) as total_pre_deduct_gift,
            COUNT(CASE WHEN status_code >= 200 AND status_code < 400 THEN 1 END) as success_count,
            COUNT(CASE WHEN status_code >= 400 OR status_code < 200 THEN 1 END) as fail_count
        FROM logs
        WHERE created_at >= ?::timestamptz AND created_at < ?::timestamptz
        GROUP BY CAST({col} AT TIME ZONE '{tz}' AS DATE), user_id, model, COALESCE(token_id, -1), COALESCE(channel_id, -1), COALESCE(action_type, '')
        ON CONFLICT (stat_date, user_id, model, token_id, channel_id, action_type)
        DO UPDATE SET
            total_requests = EXCLUDED.total_requests,
            total_tokens = EXCLUDED.total_tokens,
            total_cost = EXCLUDED.total_cost,
            total_pre_deduct_gift = EXCLUDED.total_pre_deduct_gift,
            success_count = EXCLUDED.success_count,
            fail_count = EXCLUDED.fail_count",
        col = "created_at",
        tz = tz_sql
    ));

    sqlx::query(&sql)
        .bind(start_str)
        .bind(end_str)
        .execute(&state.db.pool)
        .await
}

/// 统一的分批同步驱动器，承载失败熔断、并发睡眠释放等高可用安全机制
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
    tracing::info!(
        "[{}] 开始分批数据同步: {:?} 至 {:?} (archive_tz={})",
        task_name,
        start,
        end,
        archive_tz.name()
    );
    let mut current_batch_start = start;

    while current_batch_start < end {
        let current_batch_end = (current_batch_start + Duration::days(7)).min(end);
        let start_str = local_day_start_ts(current_batch_start, archive_tz);
        let end_str = local_day_start_ts(current_batch_end, archive_tz);

        tracing::info!(
            "[{}] 正在分批执行: {} 至 {} ...",
            task_name,
            start_str,
            end_str
        );

        match execute_stats_upsert(state, &start_str, &end_str, archive_tz).await {
            Ok(done) => {
                tracing::info!(
                    "[{}] 同步 {} 至 {} 成功，落地行数: {}",
                    task_name,
                    start_str,
                    end_str,
                    done.rows_affected()
                );
            }
            Err(e) => {
                tracing::error!(
                    "[{}] 同步 {} 至 {} 失败: {:?}",
                    task_name,
                    start_str,
                    end_str,
                    e
                );
                break;
            }
        }

        current_batch_start = current_batch_end;
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }

    tracing::info!("[{}] 数据同步任务顺利执行完毕。", task_name);
    Ok(())
}

// ── 外部暴露的公开 API ──

static LAST_SYNC_DATE: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);

/// 定时增量更新最近 3 天的历史统计数据（在站点 timedisplay 本地日切后 1 小时内运行）
pub async fn sync_daily_stats(state: &Arc<AppState>) -> AppResult<()> {
    use chrono::{Datelike, Duration, Timelike};

    let archive_tz = archive_timezone(state).await;
    let local_now = chrono::Utc::now().with_timezone(&archive_tz);
    let hour = local_now.hour();

    // 本地日切后首小时执行，避免白天重复扫大表
    if hour != 0 {
        return Ok(());
    }

    let today_date_num = (local_now.year() as u32) * 10000
        + (local_now.month() as u32) * 100
        + (local_now.day() as u32);
    let last_sync = LAST_SYNC_DATE.load(std::sync::atomic::Ordering::Relaxed);
    if last_sync == today_date_num {
        return Ok(());
    }

    let today = local_now.date_naive();
    let today_start = local_day_start_ts(today, archive_tz);
    let three_days_ago = today - Duration::days(3);
    let range_start = local_day_start_ts(three_days_ago, archive_tz);

    tracing::info!(
        "[CronDailyStats] 凌晨增量同步启动: {} → {} (tz={})",
        range_start,
        today_start,
        archive_tz.name()
    );

    if let Err(e) = execute_stats_upsert(state, &range_start, &today_start, archive_tz).await {
        tracing::error!("[CronDailyStats] 凌晨增量同步失败: {:?}", e);
    } else {
        tracing::info!("[CronDailyStats] 凌晨增量同步成功完成");
        LAST_SYNC_DATE.store(today_date_num, std::sync::atomic::Ordering::Relaxed);
    }

    Ok(())
}

/// 启动时在后台静默执行历史回填（自动推断日期起点，分批回填）
pub async fn backfill_usage_daily_stats_on_startup(state: &Arc<AppState>) -> AppResult<()> {
    use chrono::Duration;

    let archive_tz = archive_timezone(state).await;
    let local_now = chrono::Utc::now().with_timezone(&archive_tz);
    let today_date = local_now.date_naive();
    let yesterday_date = today_date - Duration::days(1);

    let max_date_val: Option<NaiveDate> = sqlx::query_scalar::<sqlx::Postgres, Option<NaiveDate>>(
        &state
            .db
            .format_query("SELECT MAX(stat_date) FROM usage_daily_stats"),
    )
    .fetch_one(&state.db.pool)
    .await
    .unwrap_or(None);

    if let Some(max_d) = max_date_val {
        if max_d >= yesterday_date {
            tracing::info!(
                "[BackfillDailyStats] 落地表数据已是最新 (最大日期: {:?})，跳过回填。",
                max_d
            );
            return Ok(());
        }
    }

    let start_date = if let Some(max_d) = max_date_val {
        max_d - Duration::days(1)
    } else {
        let min_created_at_str: Option<String> = sqlx::query_scalar::<sqlx::Postgres, Option<String>>(
            &state.db.format_query("SELECT MIN(created_at) FROM logs WHERE created_at IS NOT NULL AND created_at != ''")
        )
        .fetch_one(&state.db.pool)
        .await
        .unwrap_or(None);

        if let Some(min_str) = min_created_at_str {
            if min_str.len() >= 10 {
                NaiveDate::parse_from_str(&min_str[..10], "%Y-%m-%d")
                    .unwrap_or_else(|_| (local_now - Duration::days(30)).date_naive())
            } else {
                (local_now - Duration::days(30)).date_naive()
            }
        } else {
            tracing::info!("[BackfillDailyStats] logs 表中无任何日志，无需回填。");
            return Ok(());
        }
    };

    perform_batch_sync(state, start_date, today_date, "StartupBackfill").await
}

/// 超级管理员手动触发使用数据统计与校准的 API 调用入口
pub async fn manual_sync_usage_stats(
    state: &Arc<AppState>,
    start_date: Option<String>,
    end_date: Option<String>,
) -> AppResult<()> {
    use chrono::Duration;

    let archive_tz = archive_timezone(state).await;
    let local_now = chrono::Utc::now().with_timezone(&archive_tz);

    let start = if let Some(ref s) = start_date {
        NaiveDate::parse_from_str(s, "%Y-%m-%d")
            .unwrap_or_else(|_| (local_now - Duration::days(30)).date_naive())
    } else {
        (local_now - Duration::days(30)).date_naive()
    };

    let end = if let Some(ref e) = end_date {
        NaiveDate::parse_from_str(e, "%Y-%m-%d").unwrap_or_else(|_| local_now.date_naive())
    } else {
        local_now.date_naive()
    };

    // 手动校准包含终止日期当天（即到 end ＋ 1天零点）
    perform_batch_sync(state, start, end + Duration::days(1), "AdminManualSync").await
}

/// 根据时间段切片，从历史归档表与 logs 实时日志表中高效汇总各模型的消耗数据（支持指定 user_id 筛选）
pub async fn query_model_stats_by_slices(
    db: &crate::db::Database,
    user_id_filter: Option<&str>,
    slices: &crate::api::date_helper::QueryTimeSlice,
) -> AppResult<std::collections::HashMap<String, (i64, f64, i64)>> {
    let mut model_map = std::collections::HashMap::new();

    // 1. 历史段模型统计
    if slices.has_history_days {
        #[derive(sqlx::FromRow)]
        struct ModelHistRow {
            model: String,
            cost: Option<f64>,
            tokens: Option<i64>,
            count: Option<i64>,
        }

        let mut sql = "SELECT model, SUM(total_cost) as cost, CAST(SUM(total_tokens) AS BIGINT) as tokens, CAST(SUM(total_requests) AS BIGINT) as count FROM usage_daily_stats WHERE ".to_string();
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
        q = q.bind(slices.hist_start_date).bind(slices.hist_end_date);

        let hist_rows = q.fetch_all(&db.pool).await?;
        for row in hist_rows {
            let entry = model_map.entry(row.model).or_insert((0i64, 0.0f64, 0i64));
            entry.0 += row.count.unwrap_or(0);
            entry.1 += row.cost.unwrap_or(0.0);
            entry.2 += row.tokens.unwrap_or(0);
        }
    }

    // 2. 今日段/首部/尾部实时模型统计
    #[derive(sqlx::FromRow)]
    struct ModelTodayRow {
        model: String,
        cost: Option<f64>,
        tokens: Option<i64>,
        count: i64,
    }

    for r_slice in slices.realtime_slices() {
        let mut sql = "SELECT model, SUM(cost) as cost, SUM(prompt_tokens + completion_tokens) as tokens, COUNT(*) as count FROM logs WHERE ".to_string();
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
        q = q.bind(&r_slice.start).bind(&r_slice.end);

        let rows = q.fetch_all(&db.pool).await?;
        for row in rows {
            let entry = model_map.entry(row.model).or_insert((0i64, 0.0f64, 0i64));
            entry.0 += row.count;
            entry.1 += row.cost.unwrap_or(0.0);
            entry.2 += row.tokens.unwrap_or(0);
        }
    }

    Ok(model_map)
}
