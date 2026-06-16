use axum::{
    extract::{Query, State},
    Json,
};
use std::sync::Arc;
use crate::AppState;
use crate::error::AppResult;
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;
use dashmap::DashMap;
use std::time::{Duration, Instant};

#[derive(Debug, Deserialize)]
pub struct FinanceQuery {
    pub page: Option<i64>,
    pub per_page: Option<i64>,
    pub user_id: Option<String>,
    pub recharge_type: Option<String>,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub status: Option<String>,
    pub payment_method: Option<String>,
    pub exclude_type: Option<String>,
    pub wallet_type: Option<String>,
}

// ========== 充值记录（recharge_records）==========

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct FinanceRechargeRecord {
    pub id: i64,
    pub user_id: String,
    pub username: String,
    pub uid: String,
    pub amount: f64,
    pub recharge_type: String,
    pub remark: Option<String>,
    #[sqlx(default)]
    pub operator: Option<String>,
    #[sqlx(default)]
    pub wallet_type: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct FinanceRechargeResponse {
    pub data: Vec<FinanceRechargeRecord>,
    pub total: i64,
    pub total_amount: f64,
}

pub async fn list_recharges(
    State(state): State<Arc<AppState>>,
    Query(query): Query<FinanceQuery>,
) -> AppResult<Json<FinanceRechargeResponse>> {
    let page = query.page.unwrap_or(1);
    let per_page = query.per_page.unwrap_or(20);
    let offset = (page - 1) * per_page;

    let mut sql = "SELECT rr.*, u.username, u.uid FROM recharge_records rr JOIN users u ON rr.user_id = u.id".to_string();
    let mut where_clause = " WHERE 1=1".to_string();
    let mut binds: Vec<String> = Vec::new();

    if let Some(ref search) = query.user_id {
        where_clause.push_str(" AND (rr.user_id = ? OR u.uid = ? OR u.username LIKE ?)");
        binds.push(search.clone());
        binds.push(search.clone());
        binds.push(format!("%{}%", search));
    }

    if let Some(ref r_type) = query.recharge_type {
        where_clause.push_str(" AND rr.recharge_type = ?");
        binds.push(r_type.clone());
    }

    if let Some(ref e_type) = query.exclude_type {
        where_clause.push_str(" AND rr.recharge_type != ?");
        binds.push(e_type.clone());
    }

    if let Some(ref w_type) = query.wallet_type {
        where_clause.push_str(" AND rr.wallet_type = ?");
        binds.push(w_type.clone());
    }

    if let Some(ref start) = query.start_time {
        where_clause.push_str(" AND rr.created_at >= ?");
        binds.push(start.clone());
    }

    if let Some(ref end) = query.end_time {
        where_clause.push_str(" AND rr.created_at <= ?");
        binds.push(end.clone());
    }

    sql.push_str(&where_clause);

    let count_sql = format!("SELECT COUNT(*) FROM recharge_records rr JOIN users u ON rr.user_id = u.id{}", where_clause);
    let count_query_str = state.db.format_query(&count_sql);
    let mut count_q = sqlx::query_scalar::<_, i64>(&count_query_str);
    for val in &binds {
        count_q = count_q.bind(val);
    }
    let total = count_q.fetch_one(&state.db.pool).await.map_err(|e| {
        tracing::error!("Finance recharges count error: {:?}", e);
        e
    })?;

    sql.push_str(&format!(" ORDER BY rr.created_at DESC LIMIT {} OFFSET {}", per_page, offset));
    let formatted_data_sql = state.db.format_query(&sql);
    let mut data_q = sqlx::query_as::<_, FinanceRechargeRecord>(&formatted_data_sql);
    for val in &binds {
        data_q = data_q.bind(val);
    }
    let data = data_q.fetch_all(&state.db.pool).await.map_err(|e| {
        tracing::error!("Finance recharges data error: {:?}", e);
        e
    })?;

    let total_amount_sql = format!("SELECT COALESCE(SUM(rr.amount), 0.0) FROM recharge_records rr JOIN users u ON rr.user_id = u.id{}", where_clause);
    let total_amount_query_str = state.db.format_query(&total_amount_sql);
    let mut amount_q = sqlx::query_scalar::<_, f64>(&total_amount_query_str);
    for val in &binds {
        amount_q = amount_q.bind(val);
    }
    let total_amount = amount_q.fetch_one(&state.db.pool).await.unwrap_or(0.0);

    Ok(Json(FinanceRechargeResponse { data, total, total_amount }))
}

// ========== 支付订单（orders 表）==========

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct FinanceOrderRecord {
    pub id: i64,
    pub out_trade_no: String,
    pub user_id: String,
    pub username: String,
    pub uid: String,
    pub payment_method: String,
    pub amount: f64,
    pub status: String,
    pub trade_no: Option<String>,
    pub created_at: String,
    pub paid_at: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct FinanceOrderResponse {
    pub data: Vec<FinanceOrderRecord>,
    pub total: i64,
    pub total_amount: f64,
}

pub async fn list_orders(
    State(state): State<Arc<AppState>>,
    Query(query): Query<FinanceQuery>,
) -> AppResult<Json<FinanceOrderResponse>> {
    let page = query.page.unwrap_or(1);
    let per_page = query.per_page.unwrap_or(20);
    let offset = (page - 1) * per_page;

    let mut sql = "SELECT o.*, u.username, u.uid FROM orders o JOIN users u ON o.user_id = u.id".to_string();
    let mut where_clause = " WHERE 1=1".to_string();
    let mut binds: Vec<String> = Vec::new();

    if let Some(ref search) = query.user_id {
        where_clause.push_str(" AND (o.user_id = ? OR u.uid = ? OR u.username LIKE ?)");
        binds.push(search.clone());
        binds.push(search.clone());
        binds.push(format!("%{}%", search));
    }

    if let Some(ref status) = query.status {
        where_clause.push_str(" AND o.status = ?");
        binds.push(status.clone());
    }

    if let Some(ref method) = query.payment_method {
        where_clause.push_str(" AND o.payment_method = ?");
        binds.push(method.clone());
    }

    if let Some(ref start) = query.start_time {
        where_clause.push_str(" AND o.created_at >= ?");
        binds.push(start.clone());
    }

    if let Some(ref end) = query.end_time {
        where_clause.push_str(" AND o.created_at <= ?");
        binds.push(end.clone());
    }

    sql.push_str(&where_clause);

    let count_sql = format!("SELECT COUNT(*) FROM orders o JOIN users u ON o.user_id = u.id{}", where_clause);
    let count_query_str = state.db.format_query(&count_sql);
    let mut count_q = sqlx::query_scalar::<_, i64>(&count_query_str);
    for val in &binds {
        count_q = count_q.bind(val);
    }
    let total = count_q.fetch_one(&state.db.pool).await.map_err(|e| {
        tracing::error!("Finance orders count error: {:?}", e);
        e
    })?;

    sql.push_str(&format!(" ORDER BY o.created_at DESC LIMIT {} OFFSET {}", per_page, offset));
    let formatted_data_sql = state.db.format_query(&sql);
    let mut data_q = sqlx::query_as::<_, FinanceOrderRecord>(&formatted_data_sql);
    for val in &binds {
        data_q = data_q.bind(val);
    }
    let data = data_q.fetch_all(&state.db.pool).await.map_err(|e| {
        tracing::error!("Finance orders data error: {:?}", e);
        e
    })?;

    let total_amount_sql = format!("SELECT COALESCE(SUM(o.amount), 0.0) FROM orders o JOIN users u ON o.user_id = u.id{} AND o.status = 'paid'", where_clause);
    let total_amount_query_str = state.db.format_query(&total_amount_sql);
    let mut amount_q = sqlx::query_scalar::<_, f64>(&total_amount_query_str);
    for val in &binds {
        amount_q = amount_q.bind(val);
    }
    let total_amount = amount_q.fetch_one(&state.db.pool).await.unwrap_or(0.0);

    Ok(Json(FinanceOrderResponse { data, total, total_amount }))
}

pub async fn list_recharge_types(
    State(state): State<Arc<AppState>>,
) -> AppResult<Json<Vec<String>>> {
    let types: Vec<String> = sqlx::query_scalar(&state.db.format_query("SELECT DISTINCT recharge_type FROM recharge_records WHERE recharge_type IS NOT NULL"))
        .fetch_all(&state.db.pool)
        .await?;

    Ok(Json(types))
}

// ========== 数据分析 ==========

#[derive(Debug, Deserialize)]
pub struct FinanceDataAnalysisQuery {
    pub start_date: Option<String>,
    pub end_date: Option<String>,
}

#[derive(Debug, Serialize, Clone, sqlx::FromRow)]
pub struct DailyStat {
    pub date: String,
    #[sqlx(default)]
    pub total_requests: i64,
    #[sqlx(default)]
    pub total_tokens: i64,
    #[sqlx(default)]
    pub total_cost: f64,
    #[sqlx(default)]
    pub active_tokens: i64,
    #[sqlx(default)]
    pub active_users: i64,
    #[sqlx(default)]
    pub new_users: i64,
    #[sqlx(default)]
    pub total_users: i64,
    #[sqlx(default)]
    pub system_recharge_total: f64,
    #[sqlx(default)]
    pub system_cost_total: f64,
    #[sqlx(default)]
    pub system_retained_total: f64,
    #[sqlx(default)]
    pub online_recharge: f64,
    #[sqlx(default)]
    pub system_cost: f64,
    #[sqlx(default)]
    pub daily_system_balance: f64,
    #[sqlx(default)]
    pub daily_gift_recharge: f64,
    #[sqlx(default)]
    pub daily_system_recharge: f64,
}

#[derive(Debug, Serialize, Clone, sqlx::FromRow)]
pub struct FinanceModelStat {
    pub model: String,
    pub count: i64,
    #[sqlx(default)]
    pub total_cost: f64,
}

#[derive(Debug, Serialize, Clone)]
pub struct FinanceModelDailyStatInfo {
    pub date: String,
    pub count: i64,
    pub total_cost: f64,
}

#[derive(Debug, Serialize, Clone)]
pub struct FinanceModelStatWithHistory {
    pub model: String,
    pub count: i64,
    pub total_cost: f64,
    pub last_three_days: Vec<FinanceModelDailyStatInfo>,
}

#[derive(Debug, Serialize, Clone)]
pub struct FinanceAnalysisResponse {
    pub daily_stats: Vec<DailyStat>,
    pub model_stats: Vec<FinanceModelStatWithHistory>,
}

static DAILY_STATS_CACHE: OnceLock<DashMap<String, (Instant, FinanceAnalysisResponse)>> = OnceLock::new();

fn get_daily_stats_cache() -> &'static DashMap<String, (Instant, FinanceAnalysisResponse)> {
    DAILY_STATS_CACHE.get_or_init(|| DashMap::new())
}

pub async fn get_daily_stats(
    State(state): State<Arc<AppState>>,
    Query(query): Query<FinanceDataAnalysisQuery>,
) -> AppResult<Json<FinanceAnalysisResponse>> {
    let cache_key = format!("{}_{}", query.start_date.as_deref().unwrap_or(""), query.end_date.as_deref().unwrap_or(""));
    
    // 检查缓存（60秒过期）
    if let Some(entry) = get_daily_stats_cache().get(&cache_key) {
        if entry.value().0.elapsed() < Duration::from_secs(60) {
            return Ok(Json(entry.value().1.clone()));
        }
    }

    let mut sql = "
        SELECT 
            TO_CHAR(DATE(created_at), 'YYYY-MM-DD') as date, 
            COUNT(*) as total_requests,
            COALESCE(CAST(SUM(prompt_tokens + completion_tokens) AS BIGINT), 0) as total_tokens,
            COALESCE(SUM(cost), 0.0) as total_cost,
            COALESCE(SUM(GREATEST(cost - pre_deduct_gift, 0.0)), 0.0) as system_cost,
            COUNT(DISTINCT token_id) as active_tokens,
            COUNT(DISTINCT user_id) as active_users
        FROM logs
        WHERE 1=1
    ".to_string();
    
    let mut binds: Vec<String> = Vec::new();

    if let Some(ref start) = query.start_date {
        sql.push_str(" AND created_at >= ?");
        binds.push(format!("{} 00:00:00", start));
    }

    if let Some(ref end) = query.end_date {
        sql.push_str(" AND created_at <= ?");
        binds.push(format!("{} 23:59:59", end));
    }

    sql.push_str(" GROUP BY DATE(created_at) ORDER BY DATE(created_at) ASC");

    let formatted_sql = state.db.format_query(&sql);
    let mut q = sqlx::query_as::<_, DailyStat>(&formatted_sql);
    for val in &binds {
        q = q.bind(val);
    }
    let daily_stats_raw = q.fetch_all(&state.db.pool).await.map_err(|e| {
        tracing::error!("Finance daily stats error: {:?}", e);
        e
    })?;

    // 第三步：获取起始时间前的平台总用户数（Base Users）
    let mut base_users_sql = "SELECT COUNT(*) FROM users".to_string();
    let mut base_binds = Vec::new();
    if let Some(ref start) = query.start_date {
        base_users_sql.push_str(" WHERE created_at < ?");
        base_binds.push(format!("{} 00:00:00", start));
    }
    let formatted_base = state.db.format_query(&base_users_sql);
    let mut base_q = sqlx::query_scalar::<_, i64>(&formatted_base);
    for val in &base_binds {
        base_q = base_q.bind(val);
    }
    let mut cumulative_users = base_q.fetch_one(&state.db.pool).await.unwrap_or(0);

    // 第四步：获取每天的新增用户数
    let mut new_users_sql = "
        SELECT TO_CHAR(DATE(created_at), 'YYYY-MM-DD') as date, COUNT(*) as new_users
        FROM users WHERE 1=1
    ".to_string();
    let mut new_users_binds = Vec::new();
    if let Some(ref start) = query.start_date {
        new_users_sql.push_str(" AND created_at >= ?");
        new_users_binds.push(format!("{} 00:00:00", start));
    }
    if let Some(ref end) = query.end_date {
        new_users_sql.push_str(" AND created_at <= ?");
        new_users_binds.push(format!("{} 23:59:59", end));
    }
    new_users_sql.push_str(" GROUP BY DATE(created_at)");

    #[derive(sqlx::FromRow)]
    struct NewUserStat { date: String, new_users: i64 }
    let formatted_nu = state.db.format_query(&new_users_sql);
    let mut nu_q = sqlx::query_as::<_, NewUserStat>(&formatted_nu);
    for val in &new_users_binds {
        nu_q = nu_q.bind(val);
    }
    let new_users_list = nu_q.fetch_all(&state.db.pool).await.unwrap_or_default();
    
    // 第五步：获取充值数据（基础充值 + 每日充值）
    let mut base_recharge_sql = "SELECT COALESCE(SUM(amount), 0.0) FROM recharge_records".to_string();
    let mut base_recharge_binds = Vec::new();
    if let Some(ref start) = query.start_date {
        base_recharge_sql.push_str(" WHERE created_at < ?");
        base_recharge_binds.push(format!("{} 00:00:00", start));
    }
    let formatted_base_recharge = state.db.format_query(&base_recharge_sql);
    let mut br_q = sqlx::query_scalar::<_, f64>(&formatted_base_recharge);
    for val in &base_recharge_binds { br_q = br_q.bind(val); }
    let mut cumulative_recharge = br_q.fetch_one(&state.db.pool).await.unwrap_or(0.0);

    let mut base_cost_sql = "SELECT COALESCE(SUM(cost), 0.0) FROM logs".to_string();
    let mut base_cost_binds = Vec::new();
    if let Some(ref start) = query.start_date {
        base_cost_sql.push_str(" WHERE created_at < ?");
        base_cost_binds.push(format!("{} 00:00:00", start));
    }
    let formatted_base_cost = state.db.format_query(&base_cost_sql);
    let mut bc_q = sqlx::query_scalar::<_, f64>(&formatted_base_cost);
    for val in &base_cost_binds { bc_q = bc_q.bind(val); }
    let mut cumulative_cost = bc_q.fetch_one(&state.db.pool).await.unwrap_or(0.0);

    let mut daily_wallet_recharge_sql = "
        SELECT 
            TO_CHAR(DATE(created_at), 'YYYY-MM-DD') as date, 
            CASE WHEN wallet_type = 'gift' THEN 'gift' ELSE 'system' END as wallet_group,
            COALESCE(SUM(amount), 0.0) as amount
        FROM recharge_records 
        WHERE (wallet_type = 'gift')
           OR (wallet_type = 'system' AND recharge_type = 'manual')
           OR (recharge_type IN ('wechat', 'alipay', 'stripe', 'bonuspay'))
    ".to_string();
    let mut daily_wallet_recharge_binds = Vec::new();
    if let Some(ref start) = query.start_date {
        daily_wallet_recharge_sql.push_str(" AND created_at >= ?");
        daily_wallet_recharge_binds.push(format!("{} 00:00:00", start));
    }
    if let Some(ref end) = query.end_date {
        daily_wallet_recharge_sql.push_str(" AND created_at <= ?");
        daily_wallet_recharge_binds.push(format!("{} 23:59:59", end));
    }
    daily_wallet_recharge_sql.push_str(" GROUP BY DATE(created_at), CASE WHEN wallet_type = 'gift' THEN 'gift' ELSE 'system' END");

    #[derive(sqlx::FromRow)]
    struct DailyWalletRechargeStat { date: String, wallet_group: String, amount: f64 }
    let formatted_dwr = state.db.format_query(&daily_wallet_recharge_sql);
    let mut dwr_q = sqlx::query_as::<_, DailyWalletRechargeStat>(&formatted_dwr);
    for val in &daily_wallet_recharge_binds { dwr_q = dwr_q.bind(val); }
    let daily_wallet_recharges = dwr_q.fetch_all(&state.db.pool).await.unwrap_or_default();

    let mut daily_sys_recharge_map = std::collections::HashMap::new();
    let mut daily_gift_recharge_map = std::collections::HashMap::new();
    for dwr in daily_wallet_recharges {
        if dwr.wallet_group == "gift" {
            daily_gift_recharge_map.insert(dwr.date.clone(), dwr.amount);
        } else {
            *daily_sys_recharge_map.entry(dwr.date.clone()).or_insert(0.0) += dwr.amount;
        }
    }

    let mut daily_recharge_sql = "
        SELECT 
            TO_CHAR(DATE(created_at), 'YYYY-MM-DD') as date, 
            COALESCE(SUM(amount), 0.0) as amount,
            COALESCE(SUM(CASE WHEN recharge_type IN ('wechat', 'alipay', 'stripe', 'bonuspay') THEN amount ELSE 0.0 END), 0.0) as online_amount
        FROM recharge_records WHERE 1=1
    ".to_string();
    let mut daily_recharge_binds = Vec::new();
    if let Some(ref start) = query.start_date {
        daily_recharge_sql.push_str(" AND created_at >= ?");
        daily_recharge_binds.push(format!("{} 00:00:00", start));
    }
    if let Some(ref end) = query.end_date {
        daily_recharge_sql.push_str(" AND created_at <= ?");
        daily_recharge_binds.push(format!("{} 23:59:59", end));
    }
    daily_recharge_sql.push_str(" GROUP BY DATE(created_at)");

    #[derive(sqlx::FromRow)]
    struct DailyRechargeStat { date: String, amount: f64, online_amount: f64 }
    let formatted_dr = state.db.format_query(&daily_recharge_sql);
    let mut dr_q = sqlx::query_as::<_, DailyRechargeStat>(&formatted_dr);
    for val in &daily_recharge_binds { dr_q = dr_q.bind(val); }
    let daily_recharges = dr_q.fetch_all(&state.db.pool).await.unwrap_or_default();
    
    // 合并数据
    let mut stats_map: std::collections::BTreeMap<String, DailyStat> = std::collections::BTreeMap::new();
    for stat in daily_stats_raw {
        stats_map.insert(stat.date.clone(), stat);
    }

    for nu_stat in new_users_list {
        let stat = stats_map.entry(nu_stat.date.clone()).or_insert_with(|| DailyStat {
            date: nu_stat.date,
            total_requests: 0,
            total_tokens: 0,
            total_cost: 0.0,
            active_tokens: 0,
            active_users: 0,
            new_users: 0,
            total_users: 0,
            system_recharge_total: 0.0,
            system_cost_total: 0.0,
            system_retained_total: 0.0,
            online_recharge: 0.0,
            system_cost: 0.0,
            daily_system_balance: 0.0,
            daily_gift_recharge: 0.0,
            daily_system_recharge: 0.0,
        });
        stat.new_users = nu_stat.new_users;
    }

    let mut daily_recharge_map = std::collections::HashMap::new();
    for dr in daily_recharges {
        daily_recharge_map.insert(dr.date.clone(), (dr.amount, dr.online_amount));
        stats_map.entry(dr.date.clone()).or_insert_with(|| DailyStat {
            date: dr.date,
            total_requests: 0,
            total_tokens: 0,
            total_cost: 0.0,
            active_tokens: 0,
            active_users: 0,
            new_users: 0,
            total_users: 0,
            system_recharge_total: 0.0,
            system_cost_total: 0.0,
            system_retained_total: 0.0,
            online_recharge: 0.0,
            system_cost: 0.0,
            daily_system_balance: 0.0,
            daily_gift_recharge: 0.0,
            daily_system_recharge: 0.0,
        });
    }

    let mut daily_stats: Vec<DailyStat> = stats_map.into_values().collect();
    for stat in daily_stats.iter_mut() {
        cumulative_users += stat.new_users;
        stat.total_users = cumulative_users;

        let (dr, online_dr) = daily_recharge_map.get(&stat.date).copied().unwrap_or((0.0, 0.0));
        cumulative_recharge += dr;
        cumulative_cost += stat.total_cost;

        stat.system_recharge_total = cumulative_recharge;
        stat.system_cost_total = cumulative_cost;
        stat.system_retained_total = cumulative_recharge - cumulative_cost;
        stat.online_recharge = online_dr;

        stat.daily_system_recharge = daily_sys_recharge_map.get(&stat.date).copied().unwrap_or(0.0);
        stat.daily_gift_recharge = daily_gift_recharge_map.get(&stat.date).copied().unwrap_or(0.0);
    }

    // 第二个查询：按模型汇总统计（不按日期分组）
    let mut model_sql = "
        SELECT 
            model,
            COUNT(*) as count,
            COALESCE(SUM(cost), 0.0) as total_cost
        FROM logs
        WHERE 1=1
    ".to_string();

    let mut model_binds: Vec<String> = Vec::new();
    if let Some(ref start) = query.start_date {
        model_sql.push_str(" AND created_at >= ?");
        model_binds.push(format!("{} 00:00:00", start));
    }
    if let Some(ref end) = query.end_date {
        model_sql.push_str(" AND created_at <= ?");
        model_binds.push(format!("{} 23:59:59", end));
    }
    model_sql.push_str(" GROUP BY model ORDER BY total_cost DESC LIMIT 10");

    let formatted_model_sql = state.db.format_query(&model_sql);
    let mut mq = sqlx::query_as::<_, FinanceModelStat>(&formatted_model_sql);
    for val in &model_binds {
        mq = mq.bind(val);
    }
    let model_stats = mq.fetch_all(&state.db.pool).await.unwrap_or_default();

    // 计算最近 3 天的单独数据
    let end_naive = query.end_date.as_deref()
        .and_then(|d| chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d").ok())
        .unwrap_or_else(|| chrono::Local::now().date_naive());
    
    let day_0 = end_naive;
    let day_1 = day_0.pred_opt().unwrap_or(day_0);
    let day_2 = day_1.pred_opt().unwrap_or(day_1);

    let date_str_0 = day_0.format("%Y-%m-%d").to_string();
    let date_str_1 = day_1.format("%Y-%m-%d").to_string();
    let date_str_2 = day_2.format("%Y-%m-%d").to_string();

    #[derive(Debug, Serialize, Clone, sqlx::FromRow)]
    struct FinanceModelDailyRaw {
        pub date: String,
        pub model: String,
        pub count: i64,
        pub total_cost: f64,
    }

    let history_sql = "
        SELECT 
            TO_CHAR(DATE(created_at), 'YYYY-MM-DD') as date, 
            model,
            COUNT(*) as count,
            COALESCE(SUM(cost), 0.0) as total_cost
        FROM logs
        WHERE created_at >= ? AND created_at <= ?
        GROUP BY DATE(created_at), model
    ".to_string();
    let formatted_history = state.db.format_query(&history_sql);
    let history_stats: Vec<FinanceModelDailyRaw> = sqlx::query_as::<_, FinanceModelDailyRaw>(&formatted_history)
        .bind(format!("{} 00:00:00", date_str_2))
        .bind(format!("{} 23:59:59", date_str_0))
        .fetch_all(&state.db.pool)
        .await
        .unwrap_or_default();

    let mut model_stats_with_history = Vec::new();
    for m in model_stats {
        let mut last_three_days = Vec::new();
        // 按照 chronological order: day_2 (T-2), day_1 (T-1), day_0 (T)
        for target_date in [date_str_2.clone(), date_str_1.clone(), date_str_0.clone()] {
            let found = history_stats.iter().find(|h| h.model == m.model && h.date == target_date);
            last_three_days.push(FinanceModelDailyStatInfo {
                date: target_date,
                count: found.map(|f| f.count).unwrap_or(0),
                total_cost: found.map(|f| f.total_cost).unwrap_or(0.0),
            });
        }
        
        model_stats_with_history.push(FinanceModelStatWithHistory {
            model: m.model,
            count: m.count,
            total_cost: m.total_cost,
            last_three_days,
        });
    }

    let response = FinanceAnalysisResponse {
        daily_stats,
        model_stats: model_stats_with_history,
    };

    // 写入缓存
    get_daily_stats_cache().insert(cache_key, (Instant::now(), response.clone()));

    Ok(Json(response))
}

#[derive(Debug, Deserialize)]
pub struct WalletStatsBatchRequest {
    pub user_ids: Vec<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
}

#[derive(Debug, Serialize, Default)]
pub struct WalletStatsResponseItem {
    pub recharge_amount: f64,
    pub gift_amount: f64,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
struct WalletStatsBatchRawRow {
    pub user_id: String,
    pub wallet_type: Option<String>,
    pub amount: f64,
}

pub async fn get_wallet_stats_batch(
    State(state): State<Arc<AppState>>,
    Json(req): Json<WalletStatsBatchRequest>,
) -> AppResult<Json<std::collections::HashMap<String, WalletStatsResponseItem>>> {
    if req.user_ids.is_empty() {
        return Ok(Json(std::collections::HashMap::new()));
    }

    let placeholders = req.user_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let mut sql = format!(
        "SELECT user_id, wallet_type, COALESCE(SUM(amount), 0.0) as amount \
         FROM recharge_records \
         WHERE user_id IN ({})",
        placeholders
    );
    let mut binds: Vec<String> = req.user_ids.clone();

    if let Some(ref start) = req.start_date {
        sql.push_str(" AND created_at >= ?");
        binds.push(start.clone());
    }
    if let Some(ref end) = req.end_date {
        sql.push_str(" AND created_at <= ?");
        binds.push(end.clone());
    }
    sql.push_str(" GROUP BY user_id, wallet_type");

    let formatted_sql = state.db.format_query(&sql);
    let mut query = sqlx::query_as::<_, WalletStatsBatchRawRow>(&formatted_sql);
    for bind in binds {
        query = query.bind(bind);
    }

    let rows = query.fetch_all(&state.db.pool).await?;

    let mut result: std::collections::HashMap<String, WalletStatsResponseItem> = std::collections::HashMap::new();
    for row in rows {
        let entry = result.entry(row.user_id.clone()).or_insert_with(WalletStatsResponseItem::default);
        if let Some(wt) = row.wallet_type {
            if wt == "system" {
                entry.recharge_amount += row.amount;
            } else if wt == "gift" {
                entry.gift_amount += row.amount;
            }
        }
    }

    Ok(Json(result))
}
