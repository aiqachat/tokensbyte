use axum::{
    extract::{Query, State, Extension},
    Json,
    response::{IntoResponse, Response},
};
use axum::http::{header, StatusCode};
use std::sync::Arc;
use crate::AppState;
use crate::auth;
use crate::models::{RequestLog, LogQuery, LogListResponse};
use crate::error::{AppResult, AppError};

/// 构建使用日志的公共 WHERE 子句与绑定参数
fn build_log_where(claims: &auth::Claims, query: &LogQuery) -> (String, Vec<String>) {
    let mut sql = " WHERE 1=1".to_string();
    let mut binds: Vec<String> = Vec::new();

    if claims.role != "admin" {
        sql.push_str(" AND l.user_id = ?");
        binds.push(claims.sub.clone());
    } else if let Some(ref user_id) = query.user_id {
        if user_id == "unknown" {
            sql.push_str(" AND (l.user_id = 'unknown' OR l.user_id IS NULL OR l.user_id = '')");
        } else {
            sql.push_str(" AND l.user_id = ?");
            binds.push(user_id.clone());
        }
    }

    if let Some(ref uid) = query.uid {
        sql.push_str(" AND u.uid = ?");
        binds.push(uid.clone());
    }

    if let Some(ref model) = query.model {
        sql.push_str(" AND l.model LIKE ?");
        binds.push(format!("%{}%", model));
    }

    if let Some(channel_id) = query.channel_id {
        sql.push_str(" AND l.channel_id = CAST(? AS BIGINT)");
        binds.push(channel_id.to_string());
    }

    if let Some(ref status) = query.status {
        if status == "success" {
            sql.push_str(" AND l.status_code >= 200 AND l.status_code < 400");
        } else if status == "fail" {
            sql.push_str(" AND (l.status_code >= 400 OR l.status_code < 200)");
        }
    }

    if let Some(ref s) = query.start_date {
        sql.push_str(" AND l.created_at::timestamptz >= ?::timestamptz");
        let start_str = if s.contains('T') { s.clone() } else { format!("{} 00:00:00+08:00", s) };
        binds.push(start_str);
    }
    if let Some(ref e) = query.end_date {
        sql.push_str(" AND l.created_at::timestamptz <= ?::timestamptz");
        let end_str = if e.contains('T') { e.clone() } else { format!("{} 23:59:59+08:00", e) };
        binds.push(end_str);
    }

    (sql, binds)
}

pub async fn list_logs(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Query(query): Query<LogQuery>,
) -> AppResult<Json<LogListResponse>> {
    let page = query.page.unwrap_or(1);
    let per_page = query.per_page.unwrap_or(20);
    let offset = (page - 1) * per_page;

    let (where_clause, binds) = build_log_where(&claims, &query);

    let base_select = "SELECT l.*, \
        c.group_aid as channel_group_aid, c.name as channel_name, \
        COALESCE(u.nickname, u.username) as user_nickname, \
        u.user_group, \
        ul.name as user_level_name, \
        u.uid as user_uid, \
        t.name as token_name, \
        t.kid as token_kid \
        FROM logs l \
        LEFT JOIN channels c ON l.channel_id = c.id \
        LEFT JOIN users u ON l.user_id = u.id \
        LEFT JOIN user_levels ul ON u.user_group = ul.group_key \
        LEFT JOIN api_tokens t ON l.token_id = t.id";

    let full_sql = format!("{}{}", base_select, where_clause);

    let count_sql = if let Some(from_idx) = full_sql.find("FROM logs") {
        format!("SELECT COUNT(*) {}", &full_sql[from_idx..])
    } else {
        full_sql.replace("SELECT l.*", "SELECT COUNT(*)")
    };
    let count_query_str = state.db.format_query(&count_sql);
    let mut count_q = sqlx::query_scalar::<_, i64>(&count_query_str);
    for val in &binds {
        count_q = count_q.bind(val);
    }
    let total = count_q.fetch_one(&state.db.pool).await?;

    let data_sql = format!("{} ORDER BY l.created_at DESC LIMIT {} OFFSET {}", full_sql, per_page, offset);
    let logs_query_str = state.db.format_query(&data_sql);
    let mut logs_q = sqlx::query_as::<_, RequestLog>(&logs_query_str);
    for val in &binds {
        logs_q = logs_q.bind(val);
    }
    let mut logs = logs_q.fetch_all(&state.db.pool).await?;

    // 检查当前登录用户的日志详情查看权限
    let mut allow_details = true;
    if claims.role != "admin" {
        let perm: Option<i32> = sqlx::query_scalar(
            &state.db.format_query("SELECT ul.allow_view_log_details FROM users u LEFT JOIN user_levels ul ON u.user_group = ul.group_key WHERE u.id = ?")
        )
        .bind(&claims.sub)
        .fetch_optional(&state.db.pool)
        .await?
        .flatten();
        allow_details = perm.unwrap_or(1) == 1;
    }

    if claims.role != "admin" {
        for log in &mut logs {
            if !allow_details {
                log.request_content = None;
                log.response_content = None;
                log.upstream_req_content = None;
            }
            if let Some(ref upstream) = log.upstream_url {
                if let Some(scheme_end) = upstream.find("://") {
                    let scheme = &upstream[0..scheme_end];
                    let rest = &upstream[scheme_end + 3..];
                    if let Some(slash_idx) = rest.find('/') {
                        log.upstream_url = Some(format!("{}://***{}", scheme, &rest[slash_idx..]));
                    } else {
                        log.upstream_url = Some(format!("{}://***", scheme));
                    }
                } else {
                    log.upstream_url = Some("***".to_string());
                }
            }
        }
    }

    Ok(Json(LogListResponse { data: logs, total, allow_details }))
}

/// 导出使用日志 CSV（仅超管可用，上限 100,000 条）
const EXPORT_LIMIT: i64 = 100_000;

pub async fn export_logs(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Query(query): Query<LogQuery>,
) -> Result<Response, AppError> {
    if claims.role != "admin" {
        return Err(AppError::Forbidden("仅超级管理员可导出数据".to_string()));
    }

    let (where_clause, binds) = build_log_where(&claims, &query);

    // 先查总数，超出上限则提示
    let count_sql = state.db.format_query(&format!(
        "SELECT COUNT(*) FROM logs l \
         LEFT JOIN channels c ON l.channel_id = c.id \
         LEFT JOIN users u ON l.user_id = u.id \
         LEFT JOIN user_levels ul ON u.user_group = ul.group_key \
         LEFT JOIN api_tokens t ON l.token_id = t.id{}",
        where_clause
    ));
    let mut cq = sqlx::query_scalar::<_, i64>(&count_sql);
    for v in &binds { cq = cq.bind(v); }
    let total = cq.fetch_one(&state.db.pool).await?;

    if total > EXPORT_LIMIT {
        return Ok((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "error": format!("当前筛选条件下共 {} 条数据，超出单次导出上限 {} 条，请缩小时间范围或增加筛选条件后重试", total, EXPORT_LIMIT)
            })),
        ).into_response());
    }

    let data_sql = state.db.format_query(&format!(
        "SELECT l.id, l.user_id, l.model, l.prompt_tokens, l.completion_tokens, l.cached_tokens, \
         l.cost, l.latency_ms, l.status_code, l.endpoint, l.is_stream, \
         l.billing_detail, l.created_at, \
         c.name as channel_name, \
         COALESCE(u.nickname, u.username) as user_nickname, \
         COALESCE(u.uid, '') as user_uid \
         FROM logs l \
         LEFT JOIN channels c ON l.channel_id = c.id \
         LEFT JOIN users u ON l.user_id = u.id \
         {} ORDER BY l.created_at DESC LIMIT {}",
        where_clause, EXPORT_LIMIT
    ));

    // 16 列元组（sqlx FromRow 上限）
    let rows: Vec<(i64, String, String, i32, i32, i32, f64, i32, i32, String, Option<i32>, Option<String>, String, Option<String>, Option<String>, String)> = {
        let mut q = sqlx::query_as(&data_sql);
        for v in &binds { q = q.bind(v); }
        q.fetch_all(&state.db.pool).await?
    };

    // CSV BOM + Header
    let mut csv = String::from("\u{FEFF}ID,用户ID,用户昵称,UID,模型,输入Tokens,输出Tokens,缓存Tokens,费用,耗时(ms),状态码,类型,渠道,计费明细,请求路径,时间\n");
    for r in &rows {
        let stream_label = match r.10 { Some(1) => "流", _ => "非流" };
        let formatted_time = format_db_time(&r.12);
        csv.push_str(&format!(
            "{},{},\"{}\",\"{}\",\"{}\",{},{},{},{:.6},{},{},{},\"{}\",\"{}\",\"{}\",\"{}\"\n",
            r.0, r.1,
            r.14.as_deref().unwrap_or("-").replace('"', "\"\""),
            r.15,
            r.2.replace('"', "\"\""),
            r.3, r.4, r.5, r.6, r.7, r.8,
            stream_label,
            r.13.as_deref().unwrap_or("-").replace('"', "\"\""),
            r.11.as_deref().unwrap_or("").replace('"', "\"\""),
            r.9.replace('"', "\"\""),
            formatted_time,
        ));
    }

    let filename = format!("usage_logs_{}.csv", chrono::Local::now().format("%Y%m%d_%H%M%S"));
    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "text/csv; charset=utf-8")
        .header(header::CONTENT_DISPOSITION, format!("attachment; filename=\"{}\"", filename))
        .body(axum::body::Body::from(csv))
        .unwrap())
}

/// 将数据库存储的时间字符串格式化为可读的北京时间
/// 输入: "2026-05-08 08:05:56.328607+00" 或类似格式
/// 输出: "2026-05-08 16:05:56"
pub fn format_db_time(raw: &str) -> String {
    use chrono::{DateTime, FixedOffset, Utc};
    // 尝试解析为带时区的时间
    if let Ok(dt) = DateTime::parse_from_str(raw.trim(), "%Y-%m-%d %H:%M:%S%.f%#z") {
        let shanghai = FixedOffset::east_opt(8 * 3600).unwrap();
        return dt.with_timezone(&shanghai).format("%Y-%m-%d %H:%M:%S").to_string();
    }
    // 尝试 RFC3339 / ISO8601
    if let Ok(dt) = raw.trim().parse::<DateTime<Utc>>() {
        let shanghai = FixedOffset::east_opt(8 * 3600).unwrap();
        return dt.with_timezone(&shanghai).format("%Y-%m-%d %H:%M:%S").to_string();
    }
    // 无法解析则截断微秒和时区部分返回原始值
    raw.split('.').next().unwrap_or(raw).to_string()
}
