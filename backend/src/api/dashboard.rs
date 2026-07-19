use crate::auth;
use crate::error::AppResult;
use crate::models::{DashboardStats, ModelStat, RequestLog};
use crate::AppState;
use axum::{
    extract::{Extension, State},
    http::HeaderMap,
    Json,
};
use std::sync::Arc;

#[derive(Debug, serde::Deserialize, Clone)]
pub struct DashboardParams {
    pub start_date: Option<String>,
    pub end_date: Option<String>,
}

pub async fn get_stats(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    axum::extract::Query(params): axum::extract::Query<DashboardParams>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<DashboardStats>> {
    let is_admin = claims.role == "admin";
    let user_id = &claims.sub;

    let header_tz = headers
        .get("x-timezone")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let tz =
        crate::api::date_helper::resolve_user_timezone(&state.db, is_admin, user_id, header_tz)
            .await?;

    let cache_key = if is_admin {
        format!(
            "admin_global_{}_{:?}_{:?}",
            tz.name(),
            params.start_date,
            params.end_date
        )
    } else {
        format!(
            "user_{}_{}_{:?}_{:?}",
            user_id,
            tz.name(),
            params.start_date,
            params.end_date
        )
    };

    // Stale-While-Revalidate (SWR) 缓存验证机制：用户打开控制台秒级无感载入
    if let Some(entry) = state.dashboard_cache.get(&cache_key) {
        let elapsed = entry.timestamp.elapsed();
        if elapsed < std::time::Duration::from_secs(180) {
            return Ok(Json(entry.stats.clone()));
        } else {
            // 缓存已过期，释放读锁，尝试通过写锁抢占“重算令牌”以防止并发击穿
            drop(entry);

            if let Some(mut write_entry) = state.dashboard_cache.get_mut(&cache_key) {
                if write_entry.timestamp.elapsed() >= std::time::Duration::from_secs(180) {
                    // 更新时间戳，延长生命周期防止并发请求重复触发后台计算
                    write_entry.timestamp = std::time::Instant::now();

                    let state_clone = state.clone();
                    let cache_key_clone = cache_key.clone();
                    let params_clone = params.clone();
                    let user_id_clone = user_id.to_string();
                    let is_admin_clone = is_admin;
                    let tz_clone = tz.clone();

                    tokio::spawn(async move {
                        match calculate_dashboard_stats(
                            state_clone.clone(),
                            is_admin_clone,
                            &user_id_clone,
                            params_clone,
                            tz_clone,
                        )
                        .await
                        {
                            Ok(new_stats) => {
                                state_clone.dashboard_cache.insert(
                                    cache_key_clone.clone(),
                                    crate::DashboardCacheEntry {
                                        stats: new_stats,
                                        timestamp: std::time::Instant::now(),
                                    },
                                );
                                tracing::info!(
                                    "✅ [SWR] 后台异步更新控制台仪表盘缓存成功: {}",
                                    cache_key_clone
                                );
                            }
                            Err(e) => {
                                tracing::error!(
                                    "❌ [SWR] 后台异步更新控制台仪表盘缓存失败: {:?}, key: {}",
                                    e,
                                    cache_key_clone
                                );
                            }
                        }
                    });
                }
            }

            // 立即返回缓存中的旧数据，完全消灭等待数据库查询的卡顿
            if let Some(entry) = state.dashboard_cache.get(&cache_key) {
                return Ok(Json(entry.stats.clone()));
            }
        }
    }

    // 缓存首次加载时触发同步计算
    let stats = calculate_dashboard_stats(state.clone(), is_admin, user_id, params, tz).await?;
    state.dashboard_cache.insert(
        cache_key,
        crate::DashboardCacheEntry {
            stats: stats.clone(),
            timestamp: std::time::Instant::now(),
        },
    );

    Ok(Json(stats))
}

async fn query_aggregated_data_helper(
    state: &Arc<AppState>,
    is_admin: bool,
    user_id: &str,
    slices: &crate::api::date_helper::QueryTimeSlice,
) -> AppResult<(i64, i64, f64, i64)> {
    let mut total_requests = 0i64;
    let mut total_tokens = 0i64;
    let mut total_cost = 0.0f64;
    let mut active_tokens = 0i64;

    // A. 历史归档天段统计
    if slices.has_history_days {
        let (reqs, tokens, cost): (Option<i64>, Option<i64>, Option<f64>) = if is_admin {
            let sql = format!("SELECT CAST(SUM(total_requests) AS BIGINT), CAST(SUM(total_tokens) AS BIGINT), SUM(total_cost) FROM usage_daily_stats WHERE {}", slices.history_cond("stat_date"));
            sqlx::query_as(&state.db.format_query(&sql))
                .bind(slices.hist_start_date)
                .bind(slices.hist_end_date)
                .fetch_one(&state.db.pool)
                .await?
        } else {
            let sql = format!("SELECT CAST(SUM(total_requests) AS BIGINT), CAST(SUM(total_tokens) AS BIGINT), SUM(total_cost) FROM usage_daily_stats WHERE user_id = ? AND {}", slices.history_cond("stat_date"));
            sqlx::query_as(&state.db.format_query(&sql))
                .bind(user_id)
                .bind(slices.hist_start_date)
                .bind(slices.hist_end_date)
                .fetch_one(&state.db.pool)
                .await?
        };
        total_requests += reqs.unwrap_or(0);
        total_tokens += tokens.unwrap_or(0);
        total_cost += cost.unwrap_or(0.0);

        let active_toks: Option<i64> = if is_admin {
            let sql = format!("SELECT COUNT(DISTINCT token_id) FROM usage_daily_stats WHERE {} AND token_id != -1", slices.history_cond("stat_date"));
            sqlx::query_scalar(&state.db.format_query(&sql))
                .bind(slices.hist_start_date)
                .bind(slices.hist_end_date)
                .fetch_one(&state.db.pool)
                .await?
        } else {
            let sql = format!("SELECT COUNT(DISTINCT token_id) FROM usage_daily_stats WHERE user_id = ? AND {} AND token_id != -1", slices.history_cond("stat_date"));
            sqlx::query_scalar(&state.db.format_query(&sql))
                .bind(user_id)
                .bind(slices.hist_start_date)
                .bind(slices.hist_end_date)
                .fetch_one(&state.db.pool)
                .await?
        };
        active_tokens = active_tokens.max(active_toks.unwrap_or(0));
    }

    // B. 实时及碎片段统计
    for r_slice in slices.realtime_slices() {
        let (reqs, tokens, cost): (i64, Option<i64>, Option<f64>) = if is_admin {
            let sql = format!("SELECT COUNT(*), SUM(prompt_tokens + completion_tokens), SUM(cost) FROM logs WHERE {}", r_slice.sql_cond("created_at"));
            sqlx::query_as(&state.db.format_query(&sql))
                .bind(&r_slice.start)
                .bind(&r_slice.end)
                .fetch_one(&state.db.pool)
                .await?
        } else {
            let sql = format!("SELECT COUNT(*), SUM(prompt_tokens + completion_tokens), SUM(cost) FROM logs WHERE user_id = ? AND {}", r_slice.sql_cond("created_at"));
            sqlx::query_as(&state.db.format_query(&sql))
                .bind(user_id)
                .bind(&r_slice.start)
                .bind(&r_slice.end)
                .fetch_one(&state.db.pool)
                .await?
        };
        total_requests += reqs;
        total_tokens += tokens.unwrap_or(0);
        total_cost += cost.unwrap_or(0.0);

        let active_toks: i64 = if is_admin {
            let sql = format!(
                "SELECT COUNT(DISTINCT token_id) FROM logs WHERE {} AND token_id IS NOT NULL",
                r_slice.sql_cond("created_at")
            );
            sqlx::query_scalar(&state.db.format_query(&sql))
                .bind(&r_slice.start)
                .bind(&r_slice.end)
                .fetch_one(&state.db.pool)
                .await?
        } else {
            let sql = format!("SELECT COUNT(DISTINCT token_id) FROM logs WHERE user_id = ? AND {} AND token_id IS NOT NULL", r_slice.sql_cond("created_at"));
            sqlx::query_scalar(&state.db.format_query(&sql))
                .bind(user_id)
                .bind(&r_slice.start)
                .bind(&r_slice.end)
                .fetch_one(&state.db.pool)
                .await?
        };
        active_tokens = active_tokens.max(active_toks);
    }

    Ok((total_requests, total_tokens, total_cost, active_tokens))
}

/// 采用 Lambda 增量聚合架构（历史汇总表 + 今日日志表分段合并）的高性能控制台统计函数
async fn calculate_dashboard_stats(
    state: Arc<AppState>,
    is_admin: bool,
    user_id: &str,
    params: DashboardParams,
    tz: chrono_tz::Tz,
) -> AppResult<DashboardStats> {
    use chrono::{Duration, NaiveDate};

    let bounds = crate::api::date_helper::get_timezone_time_bounds(tz);
    let today_date = bounds.today;
    let today_str = today_date.format("%Y-%m-%d").to_string();

    let start_naive = crate::api::date_helper::parse_to_naive_date(
        params.start_date.as_deref(),
        NaiveDate::from_ymd_opt(1970, 1, 1).unwrap(),
        tz,
    );

    let end_naive = crate::api::date_helper::parse_to_naive_date(
        params.end_date.as_deref(),
        NaiveDate::from_ymd_opt(9999, 12, 31).unwrap(),
        tz,
    );

    let yesterday_date = bounds.yesterday;

    // 1. 基础指标计算 (Total Stats)
    let slices = crate::api::date_helper::calculate_query_slices(
        params.start_date.as_deref().or(Some("1970-01-01")),
        params.end_date.as_deref(),
        tz,
    );
    let (total_requests, total_tokens, total_cost, _) =
        query_aggregated_data_helper(&state, is_admin, user_id, &slices).await?;

    // 基础关系表总数（如用户、渠道、API令牌等）
    let total_users: i64 = if is_admin {
        sqlx::query_scalar::<_, i64>(&state.db.format_query("SELECT COUNT(*) FROM users"))
            .fetch_one(&state.db.pool)
            .await?
    } else {
        1
    };

    let total_channels: i64 = if is_admin {
        sqlx::query_scalar::<_, i64>(&state.db.format_query("SELECT COUNT(*) FROM channels"))
            .fetch_one(&state.db.pool)
            .await?
    } else {
        0
    };

    let total_api_tokens: i64 = if is_admin {
        sqlx::query_scalar::<_, i64>(&state.db.format_query("SELECT COUNT(*) FROM api_tokens"))
            .fetch_one(&state.db.pool)
            .await?
    } else {
        sqlx::query_scalar::<_, i64>(
            &state
                .db
                .format_query("SELECT COUNT(*) FROM api_tokens WHERE user_id = ?"),
        )
        .bind(user_id)
        .fetch_one(&state.db.pool)
        .await?
    };

    // 2. 今日数据与昨日数据 (Today vs Yesterday)
    // 今日数据
    let today_slices =
        crate::api::date_helper::calculate_query_slices(Some(&today_str), Some(&today_str), tz);
    let (today_requests, today_tokens, today_cost, today_active_tokens) =
        query_aggregated_data_helper(&state, is_admin, user_id, &today_slices).await?;

    // 昨日数据
    let yesterday_str = yesterday_date.format("%Y-%m-%d").to_string();
    let yesterday_slices = crate::api::date_helper::calculate_query_slices(
        Some(&yesterday_str),
        Some(&yesterday_str),
        tz,
    );
    let (yesterday_requests, yesterday_tokens, yesterday_cost, yesterday_active_tokens) =
        query_aggregated_data_helper(&state, is_admin, user_id, &yesterday_slices).await?;

    let mut date_where = String::new();
    let mut recent_binds = Vec::new();

    if let Some(ref s) = params.start_date {
        let (start_str, _b_start) = crate::api::date_helper::parse_and_get_bounds(s, false);
        date_where.push_str(" AND l.created_at >= ?::timestamptz");
        recent_binds.push(start_str);
    }
    if let Some(ref e) = params.end_date {
        let (end_str, _b_end) = crate::api::date_helper::parse_and_get_bounds(e, true);
        date_where.push_str(" AND l.created_at <= ?::timestamptz");
        recent_binds.push(end_str);
    }

    // 最近活动：关联用户表填充昵称/UID，便于管理端区分调用方
    let recent_logs: Vec<RequestLog> = if is_admin {
        let sql = format!(
            "SELECT l.*, COALESCE(u.nickname, u.username) AS user_nickname, u.uid AS user_uid \
             FROM logs l LEFT JOIN users u ON l.user_id = u.id \
             WHERE 1=1{} ORDER BY l.created_at DESC LIMIT 10",
            date_where
        );
        let formatted_sql = state.db.format_query(&sql);
        let mut q = sqlx::query_as::<_, RequestLog>(&formatted_sql);
        for bind_val in &recent_binds {
            q = q.bind(bind_val);
        }
        q.fetch_all(&state.db.pool).await?
    } else {
        let sql = format!(
            "SELECT l.*, COALESCE(u.nickname, u.username) AS user_nickname, u.uid AS user_uid \
             FROM logs l LEFT JOIN users u ON l.user_id = u.id \
             WHERE l.user_id = ?{} ORDER BY l.created_at DESC LIMIT 10",
            date_where
        );
        let formatted_sql = state.db.format_query(&sql);
        let mut q = sqlx::query_as::<_, RequestLog>(&formatted_sql).bind(user_id);
        for bind_val in &recent_binds {
            q = q.bind(bind_val);
        }
        q.fetch_all(&state.db.pool).await?
    };

    // 4. 各模型统计分析 (Model Stats)
    let user_filter = if is_admin { None } else { Some(user_id) };
    let model_map =
        crate::relay::usage_stats::query_model_stats_by_slices(&state.db, user_filter, &slices)
            .await?;

    // 转换并对模型进行排序 (按总花费降序，总请求数降序)
    let mut top_models_all: Vec<(String, f64, i64, i64)> = model_map
        .into_iter()
        .map(|(m, (cnt, c, t))| (m, c, t, cnt))
        .collect();
    top_models_all.sort_by(|a, b| {
        b.1.partial_cmp(&a.1)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| b.3.cmp(&a.3))
    });

    let top_10_models: Vec<(String, f64, i64, i64)> = top_models_all.into_iter().take(10).collect();

    // 4.3 模型明细近几日：锚定筛选区间末日（不超过今天），向内取最多 3 个自然日
    // 无筛选（全部）时退回日历近 3 天，与区间排行口径对齐
    let detail_days = crate::api::date_helper::model_detail_days(
        if params.start_date.is_some() {
            Some(start_naive)
        } else {
            None
        },
        if params.end_date.is_some() {
            Some(end_naive)
        } else {
            None
        },
        today_date,
    );

    let mut day_stats_list: Vec<(String, std::collections::HashMap<String, (i64, f64, i64)>)> =
        Vec::with_capacity(detail_days.len());
    for day in &detail_days {
        let date_str = day.format("%Y-%m-%d").to_string();
        let day_slices =
            crate::api::date_helper::calculate_query_slices(Some(&date_str), Some(&date_str), tz);
        let day_stats = crate::relay::usage_stats::query_model_stats_by_slices(
            &state.db,
            user_filter,
            &day_slices,
        )
        .await?;
        day_stats_list.push((date_str, day_stats));
    }

    let mut model_stats = Vec::new();
    for (m_name, m_cost, m_tokens, m_count) in top_10_models {
        let mut last_three_days = Vec::new();
        for (target_date, day_stats) in &day_stats_list {
            let found = day_stats.get(m_name.as_str());
            last_three_days.push(crate::models::DashboardModelDailyStatInfo {
                date: target_date.clone(),
                count: found.map(|f| f.0).unwrap_or(0),
                total_cost: found.map(|f| f.1).unwrap_or(0.0),
            });
        }
        model_stats.push(ModelStat {
            model: m_name,
            count: m_count,
            total_tokens: Some(m_tokens),
            total_cost: Some(m_cost),
            last_three_days,
        });
    }

    // 5. 每日统计趋势 (Daily Trends)：默认最近 30 天，或根据用户传入的自定义日期范围进行裁剪
    let trend_start_date = if params.start_date.is_some() {
        start_naive
    } else {
        today_date - Duration::days(29)
    };

    let trend_end_date = if params.end_date.is_some() {
        end_naive.min(today_date)
    } else {
        today_date
    };

    #[derive(Debug, sqlx::FromRow)]
    struct TrendHistRaw {
        pub date: String,
        pub requests: i64,
        pub cost: f64,
    }

    let mut trends_map: std::collections::HashMap<String, (i64, f64)> =
        std::collections::HashMap::new();

    // 5.1 历史统计趋势
    let hist_trends: Vec<TrendHistRaw> = if trend_start_date <= yesterday_date {
        let actual_hist_end = yesterday_date.min(trend_end_date);
        if is_admin {
            sqlx::query_as(&state.db.format_query(
                "SELECT stat_date::text as date, CAST(SUM(total_requests) AS BIGINT) as requests, SUM(total_cost) as cost \
                 FROM usage_daily_stats WHERE stat_date >= ? AND stat_date <= ? GROUP BY stat_date ORDER BY stat_date ASC"
            ))
            .bind(trend_start_date)
            .bind(actual_hist_end)
            .fetch_all(&state.db.pool)
            .await
            .unwrap_or_default()
        } else {
            sqlx::query_as(&state.db.format_query(
                "SELECT stat_date::text as date, CAST(SUM(total_requests) AS BIGINT) as requests, SUM(total_cost) as cost \
                 FROM usage_daily_stats WHERE user_id = ? AND stat_date >= ? AND stat_date <= ? GROUP BY stat_date ORDER BY stat_date ASC"
            ))
            .bind(user_id)
            .bind(trend_start_date)
            .bind(actual_hist_end)
            .fetch_all(&state.db.pool)
            .await
            .unwrap_or_default()
        }
    } else {
        vec![]
    };

    for row in hist_trends {
        trends_map.insert(row.date, (row.requests, row.cost));
    }

    // 5.2 今日趋势（仅当结束日期范围包含今天时才合入今日实时数据）
    if trend_end_date >= today_date {
        let (today_trend_reqs, today_trend_cost) = (today_requests, today_cost);
        trends_map.insert(today_str.clone(), (today_trend_reqs, today_trend_cost));
    }

    // 生成顺序完整、无断档的趋势数组
    let mut daily_trends = Vec::new();
    let mut d_iter = trend_start_date;
    while d_iter <= trend_end_date {
        let d_str = d_iter.format("%Y-%m-%d").to_string();
        let val = trends_map.get(&d_str).cloned().unwrap_or((0, 0.0));
        daily_trends.push(crate::models::DashboardDailyTrend {
            date: d_str,
            requests: val.0,
            cost: val.1,
        });
        d_iter += Duration::days(1);
    }

    let stats = DashboardStats {
        total_requests,
        total_tokens,
        total_cost,
        total_users,
        total_channels,
        total_api_tokens,
        today_requests,
        today_tokens,
        today_cost,
        today_active_tokens,
        yesterday_requests,
        yesterday_tokens,
        yesterday_cost,
        yesterday_active_tokens,
        recent_logs,
        model_stats,
        daily_trends,
    };

    Ok(stats)
}

#[derive(Debug, serde::Serialize, sqlx::FromRow)]

pub struct ModelStat30d {
    pub model: String,
    pub count: i64,
    pub total_tokens: i64,
    pub total_cost: f64,
}

#[derive(Debug, serde::Serialize, sqlx::FromRow)]
pub struct ModelDailyStat {
    pub date: String,
    pub model: String,
    pub count: i64,
    pub total_cost: f64,
}

#[derive(Debug, serde::Serialize)]
pub struct ModelTrend30dResponse {
    pub top_models: Vec<ModelStat30d>,
    pub daily_data: Vec<ModelDailyStat>,
}

pub async fn get_model_stats_30d(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<ModelTrend30dResponse>> {
    let is_admin = claims.role == "admin";
    let user_id = &claims.sub;

    let header_tz = headers
        .get("x-timezone")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let tz =
        crate::api::date_helper::resolve_user_timezone(&state.db, is_admin, user_id, header_tz)
            .await?;

    let bounds = crate::api::date_helper::get_timezone_time_bounds(tz);
    let today_date = bounds.today;
    let yesterday_date = bounds.yesterday;
    let trend_start_date = today_date - chrono::Duration::days(30);
    let today_start_ts = bounds.today_start_ts;

    #[derive(Debug, sqlx::FromRow)]
    struct ModelRaw30d {
        model: String,
        count: Option<i64>,
        total_tokens: Option<i64>,
        total_cost: Option<f64>,
    }

    // 1. 获取历史汇总数据
    let hist_stats: Vec<ModelRaw30d> = if is_admin {
        sqlx::query_as(&state.db.format_query(
            "
            SELECT 
                model,
                CAST(SUM(total_requests) AS BIGINT) as count,
                CAST(SUM(total_tokens) AS BIGINT) as total_tokens,
                SUM(total_cost) as total_cost
            FROM usage_daily_stats
            WHERE stat_date >= ? AND stat_date <= ?
            GROUP BY model
        ",
        ))
        .bind(trend_start_date)
        .bind(yesterday_date)
        .fetch_all(&state.db.pool)
        .await
        .unwrap_or_default()
    } else {
        sqlx::query_as(&state.db.format_query(
            "
            SELECT 
                model,
                CAST(SUM(total_requests) AS BIGINT) as count,
                CAST(SUM(total_tokens) AS BIGINT) as total_tokens,
                SUM(total_cost) as total_cost
            FROM usage_daily_stats
            WHERE user_id = ? AND stat_date >= ? AND stat_date <= ?
            GROUP BY model
        ",
        ))
        .bind(user_id)
        .bind(trend_start_date)
        .bind(yesterday_date)
        .fetch_all(&state.db.pool)
        .await
        .unwrap_or_default()
    };

    // 2. 获取今日实时数据
    let today_stats: Vec<ModelRaw30d> = if is_admin {
        sqlx::query_as(&state.db.format_query(
            "
            SELECT 
                model,
                COUNT(*) as count,
                COALESCE(SUM(prompt_tokens + completion_tokens), 0) as total_tokens,
                COALESCE(SUM(cost), 0.0) as total_cost
            FROM logs
            WHERE created_at >= ?::timestamptz
            GROUP BY model
        ",
        ))
        .bind(&today_start_ts)
        .fetch_all(&state.db.pool)
        .await
        .unwrap_or_default()
    } else {
        sqlx::query_as(&state.db.format_query(
            "
            SELECT 
                model,
                COUNT(*) as count,
                COALESCE(SUM(prompt_tokens + completion_tokens), 0) as total_tokens,
                COALESCE(SUM(cost), 0.0) as total_cost
            FROM logs
            WHERE user_id = ? AND created_at >= ?::timestamptz
            GROUP BY model
        ",
        ))
        .bind(user_id)
        .bind(&today_start_ts)
        .fetch_all(&state.db.pool)
        .await
        .unwrap_or_default()
    };

    // 3. 内存合并并排序得到 top 10
    let mut merge_map: std::collections::HashMap<String, ModelStat30d> =
        std::collections::HashMap::new();
    for row in hist_stats {
        let entry = merge_map
            .entry(row.model.clone())
            .or_insert_with(|| ModelStat30d {
                model: row.model.clone(),
                count: 0,
                total_tokens: 0,
                total_cost: 0.0,
            });
        entry.count += row.count.unwrap_or(0);
        entry.total_tokens += row.total_tokens.unwrap_or(0);
        entry.total_cost += row.total_cost.unwrap_or(0.0);
    }
    for row in today_stats {
        let entry = merge_map
            .entry(row.model.clone())
            .or_insert_with(|| ModelStat30d {
                model: row.model.clone(),
                count: 0,
                total_tokens: 0,
                total_cost: 0.0,
            });
        entry.count += row.count.unwrap_or(0);
        entry.total_tokens += row.total_tokens.unwrap_or(0);
        entry.total_cost += row.total_cost.unwrap_or(0.0);
    }

    let mut all_models: Vec<ModelStat30d> = merge_map.into_values().collect();
    all_models.sort_by(|a, b| {
        b.total_cost
            .partial_cmp(&a.total_cost)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| b.count.cmp(&a.count))
    });

    let top_models: Vec<ModelStat30d> = all_models.into_iter().take(10).collect();
    let top_model_names: std::collections::HashSet<String> =
        top_models.iter().map(|s| s.model.clone()).collect();

    // 4. 提取 top 10 模型的每日趋势
    #[derive(Debug, sqlx::FromRow)]
    struct ModelDailyRaw {
        date: String,
        model: String,
        count: Option<i64>,
        total_cost: Option<f64>,
    }

    let mut daily_data = Vec::new();

    if !top_model_names.is_empty() {
        let top_model_names_vec: Vec<String> = top_model_names.iter().cloned().collect();

        let hist_daily: Vec<ModelDailyRaw> = if is_admin {
            sqlx::query_as(&state.db.format_query(
                "
                SELECT 
                    stat_date::text as date,
                    model,
                    CAST(SUM(total_requests) AS BIGINT) as count,
                    SUM(total_cost) as total_cost
                FROM usage_daily_stats
                WHERE stat_date >= ? AND stat_date <= ? AND model = ANY(?)
                GROUP BY stat_date, model
            ",
            ))
            .bind(trend_start_date)
            .bind(yesterday_date)
            .bind(&top_model_names_vec)
            .fetch_all(&state.db.pool)
            .await
            .unwrap_or_default()
        } else {
            sqlx::query_as(&state.db.format_query(
                "
                SELECT 
                    stat_date::text as date,
                    model,
                    CAST(SUM(total_requests) AS BIGINT) as count,
                    SUM(total_cost) as total_cost
                FROM usage_daily_stats
                WHERE user_id = ? AND stat_date >= ? AND stat_date <= ? AND model = ANY(?)
                GROUP BY stat_date, model
            ",
            ))
            .bind(user_id)
            .bind(trend_start_date)
            .bind(yesterday_date)
            .bind(&top_model_names_vec)
            .fetch_all(&state.db.pool)
            .await
            .unwrap_or_default()
        };

        for row in hist_daily {
            daily_data.push(ModelDailyStat {
                date: row.date,
                model: row.model,
                count: row.count.unwrap_or(0),
                total_cost: row.total_cost.unwrap_or(0.0),
            });
        }

        let today_daily_raw: Vec<ModelDailyRaw> = if is_admin {
            sqlx::query_as(&state.db.format_query(
                "
                SELECT 
                    model,
                    COUNT(*) as count,
                    COALESCE(SUM(cost), 0.0) as total_cost
                FROM logs
                WHERE created_at >= ?::timestamptz AND model = ANY(?)
                GROUP BY model
            ",
            ))
            .bind(&today_start_ts)
            .bind(&top_model_names_vec)
            .fetch_all(&state.db.pool)
            .await
            .unwrap_or_default()
        } else {
            sqlx::query_as(&state.db.format_query(
                "
                SELECT 
                    model,
                    COUNT(*) as count,
                    COALESCE(SUM(cost), 0.0) as total_cost
                FROM logs
                WHERE user_id = ? AND created_at >= ?::timestamptz AND model = ANY(?)
                GROUP BY model
            ",
            ))
            .bind(user_id)
            .bind(&today_start_ts)
            .bind(&top_model_names_vec)
            .fetch_all(&state.db.pool)
            .await
            .unwrap_or_default()
        };

        let today_date_str = today_date.format("%Y-%m-%d").to_string();
        for row in today_daily_raw {
            daily_data.push(ModelDailyStat {
                date: today_date_str.clone(),
                model: row.model,
                count: row.count.unwrap_or(0),
                total_cost: row.total_cost.unwrap_or(0.0),
            });
        }
    }

    Ok(Json(ModelTrend30dResponse {
        top_models,
        daily_data,
    }))
}
