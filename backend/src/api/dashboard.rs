use axum::{
    extract::{State, Extension},
    http::HeaderMap,
    Json,
};
use std::sync::Arc;
use crate::AppState;
use crate::auth;
use crate::models::{DashboardStats, ModelStat, RequestLog};
use crate::error::{AppResult};

pub async fn get_stats(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<DashboardStats>> {
    let is_admin = claims.role == "admin";
    let user_id = &claims.sub;

    let site_settings_val: Option<String> = sqlx::query_scalar(&state.db.format_query("SELECT value FROM settings WHERE key = 'site_settings'"))
        .fetch_optional(&state.db.pool)
        .await?;
    let default_site_tz = site_settings_val
        .and_then(|v| serde_json::from_str::<crate::models::SiteSettings>(&v).ok())
        .map(|s| s.default_timezone)
        .unwrap_or_else(|| "Asia/Shanghai".to_string());

    let tz: chrono_tz::Tz = if is_admin {
        default_site_tz.parse().unwrap_or(chrono_tz::Asia::Shanghai)
    } else {
        let user_tz_str: Option<String> = sqlx::query_scalar(&state.db.format_query("SELECT timezone FROM users WHERE id = ?"))
            .bind(user_id)
            .fetch_optional(&state.db.pool)
            .await?.flatten();
            
        let header_tz = headers.get("x-timezone").and_then(|v| v.to_str().ok()).unwrap_or("");
        
        user_tz_str
            .filter(|s| !s.trim().is_empty())
            .or_else(|| (!header_tz.is_empty()).then(|| header_tz.to_string()))
            .and_then(|s| s.parse().ok())
            .unwrap_or_else(|| default_site_tz.parse().unwrap_or(chrono_tz::Asia::Shanghai))
    };

    let cache_key = if is_admin { 
        format!("admin_global_{}", tz.name()) 
    } else { 
        format!("user_{}_{}", user_id, tz.name()) 
    };

    if let Some(entry) = state.dashboard_cache.get(&cache_key) {
        if entry.timestamp.elapsed() < std::time::Duration::from_secs(180) {
            return Ok(Json(entry.stats.clone()));
        }
    }

    // 1. Basic Stats
    let total_requests: i64 = if is_admin {
        sqlx::query_scalar::<_, i64>(&state.db.format_query("SELECT COUNT(*) FROM logs"))
            .fetch_one(&state.db.pool).await?
    } else {
        sqlx::query_scalar::<_, i64>(&state.db.format_query("SELECT COUNT(*) FROM logs WHERE user_id = ?"))
            .bind(user_id)
            .fetch_one(&state.db.pool).await?
    };

    let total_tokens: i64 = if is_admin {
        sqlx::query_scalar::<_, Option<i64>>(&state.db.format_query("SELECT CAST(SUM(prompt_tokens + completion_tokens) AS BIGINT) FROM logs"))
            .fetch_one(&state.db.pool).await?.unwrap_or(0)
    } else {
        sqlx::query_scalar::<_, Option<i64>>(&state.db.format_query("SELECT CAST(SUM(prompt_tokens + completion_tokens) AS BIGINT) FROM logs WHERE user_id = ?"))
            .bind(user_id)
            .fetch_one(&state.db.pool).await?.unwrap_or(0)
    };

    let total_cost: f64 = if is_admin {
        sqlx::query_scalar::<_, Option<f64>>(&state.db.format_query("SELECT SUM(cost) FROM logs"))
            .fetch_one(&state.db.pool).await?.unwrap_or(0.0)
    } else {
        sqlx::query_scalar::<_, Option<f64>>(&state.db.format_query("SELECT SUM(cost) FROM logs WHERE user_id = ?"))
            .bind(user_id)
            .fetch_one(&state.db.pool).await?.unwrap_or(0.0)
    };

    let total_users: i64 = if is_admin {
        sqlx::query_scalar::<_, i64>(&state.db.format_query("SELECT COUNT(*) FROM users")).fetch_one(&state.db.pool).await?
    } else { 1 };

    let total_channels: i64 = if is_admin {
        sqlx::query_scalar::<_, i64>(&state.db.format_query("SELECT COUNT(*) FROM channels")).fetch_one(&state.db.pool).await?
    } else { 0 };

    let total_api_tokens: i64 = if is_admin {
        sqlx::query_scalar::<_, i64>(&state.db.format_query("SELECT COUNT(*) FROM api_tokens")).fetch_one(&state.db.pool).await?
    } else {
        sqlx::query_scalar::<_, i64>(&state.db.format_query("SELECT COUNT(*) FROM api_tokens WHERE user_id = ?"))
            .bind(user_id)
            .fetch_one(&state.db.pool)
            .await?
    };

    // 2. Today's and Yesterday's Stats (Using precise UTC boundaries for the user's timezone)
    let now = chrono::Utc::now().with_timezone(&tz);
    let offset = now.format("%z").to_string();
    
    let today_str = now.format("%Y-%m-%d").to_string();
    let today_start = format!("{} 00:00:00{}", today_str, offset);
    
    let yesterday = now - chrono::Duration::days(1);
    let yesterday_str = yesterday.format("%Y-%m-%d").to_string();
    let yesterday_start = format!("{} 00:00:00{}", yesterday_str, offset);

    // Pre-filter string for B-Tree index (safe padding of 4 days backward to handle all timezone offsets)
    let safe_text_start = (now - chrono::Duration::days(4)).format("%Y-%m-%d").to_string();

    let today_requests: i64 = if is_admin {
        sqlx::query_scalar::<_, i64>(&state.db.format_query("SELECT COUNT(*) FROM logs WHERE created_at >= ? AND created_at::timestamptz >= ?::timestamptz"))
            .bind(&safe_text_start).bind(&today_start)
            .fetch_one(&state.db.pool).await?
    } else {
        sqlx::query_scalar::<_, i64>(&state.db.format_query("SELECT COUNT(*) FROM logs WHERE user_id = ? AND created_at >= ? AND created_at::timestamptz >= ?::timestamptz"))
            .bind(user_id)
            .bind(&safe_text_start).bind(&today_start)
            .fetch_one(&state.db.pool).await?
    };
        
    let today_cost: f64 = if is_admin {
        sqlx::query_scalar::<_, Option<f64>>(&state.db.format_query("SELECT SUM(cost) FROM logs WHERE created_at >= ? AND created_at::timestamptz >= ?::timestamptz"))
            .bind(&safe_text_start).bind(&today_start)
            .fetch_one(&state.db.pool).await?.unwrap_or(0.0)
    } else {
        sqlx::query_scalar::<_, Option<f64>>(&state.db.format_query("SELECT SUM(cost) FROM logs WHERE user_id = ? AND created_at >= ? AND created_at::timestamptz >= ?::timestamptz"))
            .bind(user_id)
            .bind(&safe_text_start).bind(&today_start)
            .fetch_one(&state.db.pool).await?.unwrap_or(0.0)
    };

    let today_tokens: i64 = if is_admin {
        sqlx::query_scalar::<_, Option<i64>>(&state.db.format_query("SELECT CAST(SUM(prompt_tokens + completion_tokens) AS BIGINT) FROM logs WHERE created_at >= ? AND created_at::timestamptz >= ?::timestamptz"))
            .bind(&safe_text_start).bind(&today_start)
            .fetch_one(&state.db.pool).await?.unwrap_or(0)
    } else {
        sqlx::query_scalar::<_, Option<i64>>(&state.db.format_query("SELECT CAST(SUM(prompt_tokens + completion_tokens) AS BIGINT) FROM logs WHERE user_id = ? AND created_at >= ? AND created_at::timestamptz >= ?::timestamptz"))
            .bind(user_id)
            .bind(&safe_text_start).bind(&today_start)
            .fetch_one(&state.db.pool).await?.unwrap_or(0)
    };

    let today_active_tokens: i64 = if is_admin {
        sqlx::query_scalar::<_, i64>(&state.db.format_query("SELECT COUNT(DISTINCT token_id) FROM logs WHERE created_at >= ? AND created_at::timestamptz >= ?::timestamptz AND token_id IS NOT NULL"))
            .bind(&safe_text_start).bind(&today_start)
            .fetch_one(&state.db.pool).await?
    } else {
        sqlx::query_scalar::<_, i64>(&state.db.format_query("SELECT COUNT(DISTINCT token_id) FROM logs WHERE user_id = ? AND created_at >= ? AND created_at::timestamptz >= ?::timestamptz AND token_id IS NOT NULL"))
            .bind(user_id)
            .bind(&safe_text_start).bind(&today_start)
            .fetch_one(&state.db.pool).await?
    };

    let yesterday_requests: i64 = if is_admin {
        sqlx::query_scalar::<_, i64>(&state.db.format_query("SELECT COUNT(*) FROM logs WHERE created_at >= ? AND created_at::timestamptz >= ?::timestamptz AND created_at::timestamptz < ?::timestamptz"))
            .bind(&safe_text_start).bind(&yesterday_start).bind(&today_start)
            .fetch_one(&state.db.pool).await?
    } else {
        sqlx::query_scalar::<_, i64>(&state.db.format_query("SELECT COUNT(*) FROM logs WHERE user_id = ? AND created_at >= ? AND created_at::timestamptz >= ?::timestamptz AND created_at::timestamptz < ?::timestamptz"))
            .bind(user_id)
            .bind(&safe_text_start).bind(&yesterday_start).bind(&today_start)
            .fetch_one(&state.db.pool).await?
    };
        
    let yesterday_cost: f64 = if is_admin {
        sqlx::query_scalar::<_, Option<f64>>(&state.db.format_query("SELECT SUM(cost) FROM logs WHERE created_at >= ? AND created_at::timestamptz >= ?::timestamptz AND created_at::timestamptz < ?::timestamptz"))
            .bind(&safe_text_start).bind(&yesterday_start).bind(&today_start)
            .fetch_one(&state.db.pool).await?.unwrap_or(0.0)
    } else {
        sqlx::query_scalar::<_, Option<f64>>(&state.db.format_query("SELECT SUM(cost) FROM logs WHERE user_id = ? AND created_at >= ? AND created_at::timestamptz >= ?::timestamptz AND created_at::timestamptz < ?::timestamptz"))
            .bind(user_id)
            .bind(&safe_text_start).bind(&yesterday_start).bind(&today_start)
            .fetch_one(&state.db.pool).await?.unwrap_or(0.0)
    };

    let yesterday_tokens: i64 = if is_admin {
        sqlx::query_scalar::<_, Option<i64>>(&state.db.format_query("SELECT CAST(SUM(prompt_tokens + completion_tokens) AS BIGINT) FROM logs WHERE created_at >= ? AND created_at::timestamptz >= ?::timestamptz AND created_at::timestamptz < ?::timestamptz"))
            .bind(&safe_text_start).bind(&yesterday_start).bind(&today_start)
            .fetch_one(&state.db.pool).await?.unwrap_or(0)
    } else {
        sqlx::query_scalar::<_, Option<i64>>(&state.db.format_query("SELECT CAST(SUM(prompt_tokens + completion_tokens) AS BIGINT) FROM logs WHERE user_id = ? AND created_at >= ? AND created_at::timestamptz >= ?::timestamptz AND created_at::timestamptz < ?::timestamptz"))
            .bind(user_id)
            .bind(&safe_text_start).bind(&yesterday_start).bind(&today_start)
            .fetch_one(&state.db.pool).await?.unwrap_or(0)
    };

    let yesterday_active_tokens: i64 = if is_admin {
        sqlx::query_scalar::<_, i64>(&state.db.format_query("SELECT COUNT(DISTINCT token_id) FROM logs WHERE created_at >= ? AND created_at::timestamptz >= ?::timestamptz AND created_at::timestamptz < ?::timestamptz AND token_id IS NOT NULL"))
            .bind(&safe_text_start).bind(&yesterday_start).bind(&today_start)
            .fetch_one(&state.db.pool).await?
    } else {
        sqlx::query_scalar::<_, i64>(&state.db.format_query("SELECT COUNT(DISTINCT token_id) FROM logs WHERE user_id = ? AND created_at >= ? AND created_at::timestamptz >= ?::timestamptz AND created_at::timestamptz < ?::timestamptz AND token_id IS NOT NULL"))
            .bind(user_id)
            .bind(&safe_text_start).bind(&yesterday_start).bind(&today_start)
            .fetch_one(&state.db.pool).await?
    };

    // 3. Lists
    let recent_logs: Vec<RequestLog> = if is_admin {
        sqlx::query_as(&state.db.format_query("SELECT * FROM logs ORDER BY created_at DESC LIMIT 10"))
            .fetch_all(&state.db.pool).await?
    } else {
        sqlx::query_as(&state.db.format_query("SELECT * FROM logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 10"))
            .bind(user_id)
            .fetch_all(&state.db.pool).await?
    };

    // Let's get chronological dates for last 3 days
    let end_naive = now.date_naive();
    let day_0 = end_naive;
    let day_1 = day_0.pred_opt().unwrap_or(day_0);
    let day_2 = day_1.pred_opt().unwrap_or(day_1);

    let date_str_0 = day_0.format("%Y-%m-%d").to_string();
    let date_str_1 = day_1.format("%Y-%m-%d").to_string();
    let date_str_2 = day_2.format("%Y-%m-%d").to_string();

    #[derive(Debug, sqlx::FromRow)]
    struct ModelStatQueryRow {
        pub model: String,
        pub today_cost: f64,
        pub today_tokens: i64,
        pub today_count: i64,
    }

    let model_stats_raw: Vec<ModelStatQueryRow> = if is_admin {
        sqlx::query_as(&state.db.format_query("
            SELECT 
                model,
                COALESCE(SUM(cost), 0.0) as today_cost,
                COALESCE(SUM(prompt_tokens + completion_tokens), 0) as today_tokens,
                COUNT(*) as today_count
            FROM logs
            GROUP BY model
            ORDER BY today_cost DESC, today_count DESC, COALESCE(SUM(cost), 0.0) DESC
            LIMIT 10
        "))
        .fetch_all(&state.db.pool).await?
    } else {
        sqlx::query_as(&state.db.format_query("
            SELECT 
                model,
                COALESCE(SUM(cost), 0.0) as today_cost,
                COALESCE(SUM(prompt_tokens + completion_tokens), 0) as today_tokens,
                COUNT(*) as today_count
            FROM logs
            WHERE user_id = ?
            GROUP BY model
            ORDER BY today_cost DESC, today_count DESC, COALESCE(SUM(cost), 0.0) DESC
            LIMIT 10
        "))
        .bind(user_id)
        .fetch_all(&state.db.pool).await?
    };

    #[derive(Debug, sqlx::FromRow)]
    struct DailyHistoryRaw {
        pub date: String,
        pub model: String,
        pub count: i64,
        pub total_cost: f64,
    }

    let tz_name = tz.name();
    let history_start = format!("{} 00:00:00{}", date_str_2, offset);
    let today_next = now + chrono::Duration::days(1);
    let history_end = format!("{} 00:00:00{}", today_next.format("%Y-%m-%d"), offset);

    let history_stats: Vec<DailyHistoryRaw> = if is_admin {
        sqlx::query_as(&state.db.format_query("
            SELECT 
                TO_CHAR(created_at::timestamptz AT TIME ZONE ?, 'YYYY-MM-DD') as date, 
                model,
                COUNT(*) as count,
                COALESCE(SUM(cost), 0.0) as total_cost
            FROM logs
            WHERE created_at >= ? AND created_at::timestamptz >= ?::timestamptz AND created_at::timestamptz < ?::timestamptz
            GROUP BY 1, 2
        "))
        .bind(tz_name)
        .bind(&safe_text_start).bind(&history_start).bind(&history_end)
        .fetch_all(&state.db.pool)
        .await
        .unwrap_or_else(|e| {
            tracing::error!("history_stats admin error: {:?}", e);
            vec![]
        })
    } else {
        sqlx::query_as(&state.db.format_query("
            SELECT 
                TO_CHAR(created_at::timestamptz AT TIME ZONE ?, 'YYYY-MM-DD') as date, 
                model,
                COUNT(*) as count,
                COALESCE(SUM(cost), 0.0) as total_cost
            FROM logs
            WHERE user_id = ? AND created_at >= ? AND created_at::timestamptz >= ?::timestamptz AND created_at::timestamptz < ?::timestamptz
            GROUP BY 1, 2
        "))
        .bind(tz_name)
        .bind(user_id)
        .bind(&safe_text_start).bind(&history_start).bind(&history_end)
        .fetch_all(&state.db.pool)
        .await
        .unwrap_or_else(|e| {
            tracing::error!("history_stats user error: {:?}", e);
            vec![]
        })
    };

    let mut model_stats = Vec::new();
    for m in model_stats_raw {
        let mut last_three_days = Vec::new();
        for target_date in [date_str_2.clone(), date_str_1.clone(), date_str_0.clone()] {
            let found = history_stats.iter().find(|h| h.model == m.model && h.date.as_str() == target_date.as_str());
            last_three_days.push(crate::models::DashboardModelDailyStatInfo {
                date: target_date,
                count: found.map(|f| f.count).unwrap_or(0),
                total_cost: found.map(|f| f.total_cost).unwrap_or(0.0),
            });
        }

        model_stats.push(ModelStat {
            model: m.model,
            count: m.today_count,
            total_tokens: Some(m.today_tokens),
            total_cost: Some(m.today_cost),
            last_three_days,
        });
    }

    let thirty_days_ago = (now - chrono::Duration::days(30)).format("%Y-%m-%d").to_string();
    let trend_start = format!("{} 00:00:00{}", thirty_days_ago, offset);
    let trend_safe_start = (now - chrono::Duration::days(34)).format("%Y-%m-%d").to_string();

    let daily_trends: Vec<crate::models::DashboardDailyTrend> = if is_admin {
        sqlx::query_as(&state.db.format_query("
            SELECT 
                TO_CHAR(created_at::timestamptz AT TIME ZONE ?, 'YYYY-MM-DD') as date, 
                COUNT(*) as requests,
                COALESCE(SUM(cost), 0.0) as cost
            FROM logs
            WHERE created_at >= ? AND created_at::timestamptz >= ?::timestamptz AND created_at::timestamptz < ?::timestamptz
            GROUP BY 1
            ORDER BY 1 ASC
        "))
        .bind(tz_name)
        .bind(&trend_safe_start).bind(&trend_start).bind(&history_end)
        .fetch_all(&state.db.pool)
        .await
        .unwrap_or_else(|e| {
            tracing::error!("daily_trends admin error: {:?}", e);
            vec![]
        })
    } else {
        sqlx::query_as(&state.db.format_query("
            SELECT 
                TO_CHAR(created_at::timestamptz AT TIME ZONE ?, 'YYYY-MM-DD') as date, 
                COUNT(*) as requests,
                COALESCE(SUM(cost), 0.0) as cost
            FROM logs
            WHERE user_id = ? AND created_at >= ? AND created_at::timestamptz >= ?::timestamptz AND created_at::timestamptz < ?::timestamptz
            GROUP BY 1
            ORDER BY 1 ASC
        "))
        .bind(tz_name)
        .bind(user_id)
        .bind(&trend_safe_start).bind(&trend_start).bind(&history_end)
        .fetch_all(&state.db.pool)
        .await
        .unwrap_or_else(|e| {
            tracing::error!("daily_trends user error: {:?}", e);
            vec![]
        })
    };

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

    state.dashboard_cache.insert(cache_key, crate::DashboardCacheEntry {
        stats: stats.clone(),
        timestamp: std::time::Instant::now(),
    });

    Ok(Json(stats))
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

    let site_settings_val: Option<String> = sqlx::query_scalar(&state.db.format_query("SELECT value FROM settings WHERE key = 'site_settings'"))
        .fetch_optional(&state.db.pool)
        .await?;
    let default_site_tz = site_settings_val
        .and_then(|v| serde_json::from_str::<crate::models::SiteSettings>(&v).ok())
        .map(|s| s.default_timezone)
        .unwrap_or_else(|| "Asia/Shanghai".to_string());

    let tz: chrono_tz::Tz = if is_admin {
        default_site_tz.parse().unwrap_or(chrono_tz::Asia::Shanghai)
    } else {
        let user_tz_str: Option<String> = sqlx::query_scalar(&state.db.format_query("SELECT timezone FROM users WHERE id = ?"))
            .bind(user_id)
            .fetch_optional(&state.db.pool)
            .await?.flatten();
            
        let header_tz = headers.get("x-timezone").and_then(|v| v.to_str().ok()).unwrap_or("");
        
        user_tz_str
            .filter(|s| !s.trim().is_empty())
            .or_else(|| (!header_tz.is_empty()).then(|| header_tz.to_string()))
            .and_then(|s| s.parse().ok())
            .unwrap_or_else(|| default_site_tz.parse().unwrap_or(chrono_tz::Asia::Shanghai))
    };

    let now = chrono::Utc::now().with_timezone(&tz);
    let offset = now.format("%z").to_string();
    
    let thirty_days_ago = (now - chrono::Duration::days(30)).format("%Y-%m-%d").to_string();
    let trend_start = format!("{} 00:00:00{}", thirty_days_ago, offset);
    let trend_safe_start = (now - chrono::Duration::days(34)).format("%Y-%m-%d").to_string();
    let today_next = now + chrono::Duration::days(1);
    let history_end = format!("{} 00:00:00{}", today_next.format("%Y-%m-%d"), offset);
    let tz_name = tz.name();

    let stats: Vec<ModelStat30d> = if is_admin {
        sqlx::query_as(&state.db.format_query("
            SELECT 
                model,
                COUNT(*) as count,
                COALESCE(SUM(prompt_tokens + completion_tokens), 0) as total_tokens,
                COALESCE(SUM(cost), 0.0) as total_cost
            FROM logs
            WHERE created_at >= ? AND created_at::timestamptz >= ?::timestamptz AND created_at::timestamptz < ?::timestamptz
            GROUP BY model
            ORDER BY total_cost DESC, count DESC
        "))
        .bind(&trend_safe_start).bind(&trend_start).bind(&history_end)
        .fetch_all(&state.db.pool)
        .await.unwrap_or_else(|e| {
            tracing::error!("top_models admin error: {:?}", e);
            vec![]
        })
    } else {
        sqlx::query_as(&state.db.format_query("
            SELECT 
                model,
                COUNT(*) as count,
                COALESCE(SUM(prompt_tokens + completion_tokens), 0) as total_tokens,
                COALESCE(SUM(cost), 0.0) as total_cost
            FROM logs
            WHERE user_id = ? AND created_at >= ? AND created_at::timestamptz >= ?::timestamptz AND created_at::timestamptz < ?::timestamptz
            GROUP BY model
            ORDER BY total_cost DESC, count DESC
        "))
        .bind(user_id)
        .bind(&trend_safe_start).bind(&trend_start).bind(&history_end)
        .fetch_all(&state.db.pool)
        .await.unwrap_or_else(|e| {
            tracing::error!("top_models user error: {:?}", e);
            vec![]
        })
    };

    let top_model_names: std::collections::HashSet<String> = stats.iter().take(10).map(|s| s.model.clone()).collect();
    let top_models: Vec<ModelStat30d> = stats.into_iter().take(10).collect();

    let daily_data_raw: Vec<ModelDailyStat> = if is_admin {
        sqlx::query_as(&state.db.format_query("
            SELECT 
                TO_CHAR(created_at::timestamptz AT TIME ZONE ?, 'YYYY-MM-DD') as date, 
                model,
                COUNT(*) as count,
                COALESCE(SUM(cost), 0.0) as total_cost
            FROM logs
            WHERE created_at >= ? AND created_at::timestamptz >= ?::timestamptz AND created_at::timestamptz < ?::timestamptz
            GROUP BY 1, 2
        "))
        .bind(tz_name)
        .bind(&trend_safe_start).bind(&trend_start).bind(&history_end)
        .fetch_all(&state.db.pool)
        .await.unwrap_or_else(|e| {
            tracing::error!("daily_data admin error: {:?}", e);
            vec![]
        })
    } else {
        sqlx::query_as(&state.db.format_query("
            SELECT 
                TO_CHAR(created_at::timestamptz AT TIME ZONE ?, 'YYYY-MM-DD') as date, 
                model,
                COUNT(*) as count,
                COALESCE(SUM(cost), 0.0) as total_cost
            FROM logs
            WHERE user_id = ? AND created_at >= ? AND created_at::timestamptz >= ?::timestamptz AND created_at::timestamptz < ?::timestamptz
            GROUP BY 1, 2
        "))
        .bind(tz_name)
        .bind(user_id)
        .bind(&trend_safe_start).bind(&trend_start).bind(&history_end)
        .fetch_all(&state.db.pool)
        .await.unwrap_or_else(|e| {
            tracing::error!("daily_data user error: {:?}", e);
            vec![]
        })
    };

    let daily_data: Vec<ModelDailyStat> = daily_data_raw.into_iter().filter(|d| top_model_names.contains(&d.model)).collect();

    Ok(Json(ModelTrend30dResponse {
        top_models,
        daily_data,
    }))
}

