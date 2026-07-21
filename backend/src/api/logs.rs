use crate::api::date_helper;
use crate::auth;
use crate::error::{AppError, AppResult};
use crate::models::{LogDetailContent, LogListResponse, LogQuery, RequestLog};
use crate::relay::cascade::{cascade_sanitize_for_user, cascade_scrub_plugin_tag_for_user};
use crate::AppState;
use axum::extract::Path;
use axum::http::{header, StatusCode};
use axum::{
    extract::{Extension, Query, State},
    response::{IntoResponse, Response},
    Json,
};
use std::sync::Arc;

/// 与部分索引 `idx_logs_vision_created_at_new` 谓词对齐（数组成员勿随意改动）。
pub(crate) const SQL_VISION_ACTION_FILTER: &str =
    " AND l.action_type = ANY(ARRAY['图片','视频','视频增强','视觉模型','视觉'])";

/// WHERE 只引用 `logs l`；跨表条件用 EXISTS，COUNT/stats 无需 JOIN。
fn build_log_where(
    claims: &auth::Claims,
    query: &LogQuery,
    allowed_target_user: bool,
) -> (String, Vec<String>) {
    let mut sql = " WHERE 1=1".to_string();
    let mut binds: Vec<String> = Vec::new();

    if claims.role != "admin" && !allowed_target_user {
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
        // 等价于原 LEFT JOIN users + u.uid = ?
        sql.push_str(" AND EXISTS (SELECT 1 FROM users xu WHERE xu.id = l.user_id AND xu.uid = ?)");
        binds.push(uid.clone());
    }

    if let Some(ref model) = query.model {
        sql.push_str(" AND l.model LIKE ?");
        let escaped = model.replace('%', "\\%").replace('_', "\\_");
        binds.push(format!("%{}%", escaped));
    }

    if let Some(channel_id) = query.channel_id {
        sql.push_str(" AND l.channel_id = CAST(? AS BIGINT)");
        binds.push(channel_id.to_string());
    }

    if let Some(ref aid) = query.channel_group_aid {
        // 等价于原 LEFT JOIN channels + c.group_aid = ?
        sql.push_str(
            " AND EXISTS (SELECT 1 FROM channels xc WHERE xc.id = l.channel_id AND xc.group_aid = ?)",
        );
        binds.push(aid.clone());
    }

    if let Some(ref status) = query.status {
        if status == "success" {
            sql.push_str(" AND l.status_code >= 200 AND l.status_code < 400");
        } else if status == "fail" {
            sql.push_str(" AND (l.status_code >= 400 OR l.status_code < 200)");
        }
    }

    if let Some(ref s) = query.start_date {
        push_created_at_bound(&mut sql, &mut binds, s, false);
    }
    if let Some(ref e) = query.end_date {
        push_created_at_bound(&mut sql, &mut binds, e, true);
    }

    if let Some(ref ep) = query.router_ep {
        sql.push_str(" AND (l.billing_detail LIKE ? OR l.model = ?)");
        binds.push(format!("%智能路由: {}%", ep));
        binds.push(ep.clone());
    }

    if let Some(ref action_type) = query.action_type {
        if !action_type.is_empty() {
            if action_type == "视觉模型" || action_type == "vision" || action_type == "视觉" {
                sql.push_str(SQL_VISION_ACTION_FILTER);
            } else {
                sql.push_str(" AND l.action_type = ?");
                binds.push(action_type.clone());
            }
        }
    }

    if let Some(ref log_id) = query.log_id {
        if !log_id.is_empty() {
            sql.push_str(" AND l.log_id = ?");
            binds.push(log_id.clone());
        }
    }

    if let Some(ref token_kid) = query.token_kid {
        if !token_kid.is_empty() {
            // 等价于原 LEFT JOIN api_tokens + t.kid = ?
            sql.push_str(
                " AND EXISTS (SELECT 1 FROM api_tokens xt WHERE xt.id = l.token_id AND xt.kid = ?)",
            );
            binds.push(token_kid.clone());
        }
    }

    if let Some(ref task_id) = query.task_id {
        if !task_id.is_empty() {
            sql.push_str(" AND l.task_id = ?");
            binds.push(task_id.clone());
        }
    }

    if let Some(ref keyword) = query.search_keyword {
        if !keyword.is_empty() {
            sql.push_str(" AND (l.log_id = ? OR l.task_id = ?)");
            binds.push(keyword.clone());
            binds.push(keyword.clone());
        }
    }

    (sql, binds)
}

/// 按 timestamptz 列做范围过滤：半开区间，纯日期按默认 timedisplay 展开。
pub(crate) fn push_created_at_bound(
    sql: &mut String,
    binds: &mut Vec<String>,
    raw: &str,
    is_end: bool,
) {
    date_helper::push_timestamptz_bound_default(sql, binds, "l.created_at", raw, is_end);
}

const LOGS_LIST_JOINS: &str = " LEFT JOIN channels c ON l.channel_id = c.id \
      LEFT JOIN channel_configs cc ON l.channel_config_id = cc.id \
      LEFT JOIN users u ON l.user_id = u.id \
      LEFT JOIN user_levels ul ON u.user_group = ul.group_key \
      LEFT JOIN api_tokens t ON l.token_id = t.id";

const LOGS_EXPORT_JOINS: &str = " LEFT JOIN channels c ON l.channel_id = c.id \
         LEFT JOIN channel_configs cc ON l.channel_config_id = cc.id \
         LEFT JOIN users u ON l.user_id = u.id";

/// 任务列表结算态：失败 / 冻结中 / 是否有计费明细（替代传 billing_detail 全文）。
pub(crate) const SQL_BILLING_SETTLE_FLAGS: &str = "\
COALESCE(l.billing_detail LIKE '%失败%', false) AS billing_failed, \
COALESCE(l.billing_detail LIKE '%冻结%', false) AS billing_frozen, \
(l.billing_detail IS NOT NULL AND btrim(l.billing_detail) <> '') AS billing_present";

/// 列表不选大 TEXT（依赖 RequestLog 上 `#[sqlx(default)]` → None）；展开走 get_log_detail。
/// 计费：布尔标记 + regexp 抽出用量数字，避免传输 billing_detail 全文。
const LOGS_LIST_SELECT: &str = "SELECT l.id, l.log_id, l.user_id, l.channel_id, l.token_id, l.model, \
         l.prompt_tokens, l.completion_tokens, l.cached_tokens, l.cost, l.latency_ms, \
         l.status_code, l.endpoint, l.error_message, l.upstream_url, \
         l.is_stream, \
         COALESCE(l.billing_detail LIKE '%退回%', false) AS billing_refunded, \
         COALESCE(l.billing_detail LIKE '%失败%', false) AS billing_failed, \
         COALESCE((regexp_match(COALESCE(l.billing_detail, ''), '(\\d+)创建@'))[1]::int, 0) AS billing_cache_creation, \
         COALESCE((regexp_match(COALESCE(l.billing_detail, ''), '(\\d+)读取@'))[1]::int, 0) AS billing_cache_read, \
         COALESCE((regexp_match(COALESCE(l.billing_detail, ''), '联网搜索:\\s*([\\d.]+)次'))[1]::float8, 0) AS billing_web_search, \
         l.billing_pid, l.forward_eid, l.pre_deduct_gift, l.plugin_tag, \
         l.action_type, l.is_completed, l.channel_config_id, l.task_id, l.created_at, \
         c.group_aid AS channel_group_aid, c.name AS channel_name, c.provider_type AS channel_provider_type, \
         cc.name AS sub_channel_name, cc.yid AS yid, \
         COALESCE(u.nickname, u.username) AS user_nickname, \
         u.user_group, ul.name AS user_level_name, u.uid AS user_uid, \
         t.name AS token_name, t.kid AS token_kid";

fn append_default_stats_window(where_clause: &str, binds: &[String]) -> (String, Vec<String>) {
    let mut sql = where_clause.to_string();
    let mut sb = binds.to_vec();
    let thirty_days_ago = (chrono::Utc::now() - chrono::Duration::days(30))
        .format("%Y-%m-%d")
        .to_string();
    push_created_at_bound(&mut sql, &mut sb, &thirty_days_ago, false);
    (sql, sb)
}

pub(crate) async fn lookup_user_id(
    db: &crate::db::Database,
    key: &str,
) -> Result<Option<String>, sqlx::Error> {
    sqlx::query_scalar(
        &db.format_query("SELECT id FROM users WHERE uid = ? OR id = ? OR username = ?"),
    )
    .bind(key)
    .bind(key)
    .bind(key)
    .fetch_optional(&db.pool)
    .await
}

/// 解析用户标识；找不到时用占位，使后续 WHERE 安全返回空集
pub(crate) async fn resolve_user_filter(
    db: &crate::db::Database,
    key: &str,
) -> Result<String, sqlx::Error> {
    Ok(lookup_user_id(db, key)
        .await?
        .unwrap_or_else(|| "NOT_FOUND_USER".to_string()))
}

pub(crate) async fn fetch_logs_count(
    db: &crate::db::Database,
    where_clause: &str,
    binds: &[String],
) -> Result<i64, sqlx::Error> {
    let sql = db.format_query(&format!("SELECT COUNT(*) FROM logs l{}", where_clause));
    let mut q = sqlx::query_scalar::<_, i64>(&sql);
    for v in binds {
        q = q.bind(v);
    }
    q.fetch_one(&db.pool).await
}

/// COUNT + 汇总一次扫描（条件相同时替代并行两次全表聚合）
async fn fetch_logs_count_and_stats(
    db: &crate::db::Database,
    where_clause: &str,
    binds: &[String],
) -> Result<(i64, f64, i64, i64, f64), sqlx::Error> {
    let sql = db.format_query(&format!(
        "SELECT COUNT(*)::bigint, \
         COALESCE(SUM(l.cost), 0.0), \
         COUNT(CASE WHEN l.status_code >= 200 AND l.status_code < 400 THEN 1 END), \
         COUNT(CASE WHEN l.status_code >= 400 OR l.status_code < 200 THEN 1 END), \
         COALESCE(SUM(l.pre_deduct_gift), 0.0) \
         FROM logs l{}",
        where_clause
    ));
    let mut q = sqlx::query_as::<_, (i64, f64, i64, i64, f64)>(&sql);
    for v in binds {
        q = q.bind(v);
    }
    q.fetch_one(&db.pool).await
}

async fn fetch_logs_stats(
    db: &crate::db::Database,
    where_clause: &str,
    binds: &[String],
) -> (f64, i64, i64, f64) {
    match fetch_logs_count_and_stats(db, where_clause, binds).await {
        Ok((_, cost, ok, fail, gift)) => (cost, ok, fail, gift),
        Err(_) => (0.0, 0, 0, 0.0),
    }
}

async fn fetch_logs_list_rows(
    db: &crate::db::Database,
    data_sql: &str,
    binds: &[String],
) -> Result<Vec<RequestLog>, sqlx::Error> {
    let mut q = sqlx::query_as::<_, RequestLog>(data_sql);
    for v in binds {
        q = q.bind(v);
    }
    q.fetch_all(&db.pool).await
}

pub async fn list_logs(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Query(query): Query<LogQuery>,
) -> AppResult<Json<LogListResponse>> {
    let page = query.page.unwrap_or(1).max(1);
    let per_page = query.per_page.unwrap_or(20).min(100);
    let offset = (page - 1) * per_page;

    let mut q = query.clone();
    let mut allowed_target_user = false;

    if claims.role == "admin" {
        allowed_target_user = true;
        if let Some(ref user_id) = q.user_id {
            if user_id != "unknown" {
                q.user_id = Some(resolve_user_filter(&state.db, user_id).await?);
            }
        }
    } else if let Some(ref target_user_id) = q.user_id {
        let my_uid: Option<String> =
            sqlx::query_scalar(&state.db.format_query("SELECT uid FROM users WHERE id = ?"))
                .bind(&claims.sub)
                .fetch_optional(&state.db.pool)
                .await?;
        let my_uid = my_uid.unwrap_or_default();

        if let Some(target_uuid) = lookup_user_id(&state.db, target_user_id).await? {
            let is_referral: bool = sqlx::query_scalar(
                &state.db.format_query(
                    "SELECT EXISTS(SELECT 1 FROM users WHERE id = ? AND (referred_by = ? OR referred_by = ?))",
                ),
            )
            .bind(&target_uuid)
            .bind(&claims.sub)
            .bind(&my_uid)
            .fetch_one(&state.db.pool)
            .await?;

            if is_referral {
                allowed_target_user = true;
                q.user_id = Some(target_uuid);
            } else {
                q.user_id = None;
            }
        } else {
            q.user_id = None;
        }
    }

    let (where_clause, binds) = build_log_where(&claims, &q, allowed_target_user);

    // 无 start_date 时汇总默认近 30 天，避免全历史扫描
    let stats_owned = if query.start_date.is_none() {
        Some(append_default_stats_window(&where_clause, &binds))
    } else {
        None
    };
    let (stats_where, stats_binds) = match &stats_owned {
        Some((w, b)) => (w.as_str(), b.as_slice()),
        None => (where_clause.as_str(), binds.as_slice()),
    };

    let data_sql = state.db.format_query(&deferred_join_page_sql(
        LOGS_LIST_SELECT,
        LOGS_LIST_JOINS,
        &where_clause,
        per_page,
        offset,
    ));
    let binds_data = binds.clone();
    let db = state.db.clone();
    let stats_where_owned = stats_where.to_string();
    let stats_binds_owned = stats_binds.to_vec();

    // 有显式日期时 COUNT 与汇总 WHERE 相同 → 合并为一次扫描；无日期时汇总仍限近 30 天，与分页 total 分离
    let (total, mut logs, total_cost, success_count, fail_count, total_gift_cost) =
        if stats_owned.is_none() {
            let (agg_res, logs_res) = tokio::join!(
                fetch_logs_count_and_stats(&state.db, &where_clause, &binds),
                fetch_logs_list_rows(&db, &data_sql, &binds_data),
            );
            let (total, total_cost, success_count, fail_count, total_gift_cost) = agg_res?;
            (
                total,
                logs_res?,
                total_cost,
                success_count,
                fail_count,
                total_gift_cost,
            )
        } else {
            let (total_res, logs_res, stats) = tokio::join!(
                fetch_logs_count(&state.db, &where_clause, &binds),
                fetch_logs_list_rows(&db, &data_sql, &binds_data),
                fetch_logs_stats(&state.db, &stats_where_owned, &stats_binds_owned),
            );
            let (total_cost, success_count, fail_count, total_gift_cost) = stats;
            (
                total_res?,
                logs_res?,
                total_cost,
                success_count,
                fail_count,
                total_gift_cost,
            )
        };

    let mut allow_details = true;
    if claims.role != "admin" {
        let perm: Option<i32> = sqlx::query_scalar(
            &state.db.format_query(
                "SELECT ul.allow_view_log_details FROM users u LEFT JOIN user_levels ul ON u.user_group = ul.group_key WHERE u.id = ?",
            ),
        )
        .bind(&claims.sub)
        .fetch_optional(&state.db.pool)
        .await?
        .flatten();
        allow_details = perm.unwrap_or(1) == 1;

        for log in &mut logs {
            log.channel_id = None;
            log.channel_group_aid = None;
            log.channel_name = None;
            log.sub_channel_name = None;
            // 列表大字段已为 NULL；stage 体脱敏在 get_log_detail；此处清进行中 cascade 密钥
            cascade_scrub_plugin_tag_for_user(&mut log.plugin_tag);
            if let Some(ref err) = log.error_message {
                log.error_message = Some(crate::relay::proxy::sanitize_error_message(err));
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

    let total_system_cost = total_cost - total_gift_cost;

    Ok(Json(LogListResponse {
        data: logs,
        total,
        allow_details,
        total_cost,
        success_count,
        fail_count,
        total_system_cost: Some(total_system_cost),
        total_gift_cost: Some(total_gift_cost),
    }))
}

/// 按需拉取单条日志的请求/响应大字段（列表接口已剥离）
pub async fn get_log_detail(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Path(id): Path<i64>,
) -> AppResult<Json<LogDetailContent>> {
    #[derive(sqlx::FromRow)]
    struct DetailRow {
        user_id: String,
        status_code: i32,
        request_content: Option<String>,
        response_content: Option<String>,
        post_response: Option<String>,
        upstream_req_content: Option<String>,
        billing_detail: Option<String>,
        plugin_tag: Option<String>,
    }

    let row: Option<DetailRow> = sqlx::query_as(&state.db.format_query(
        "SELECT user_id, status_code, request_content, response_content, post_response, \
             upstream_req_content, billing_detail, plugin_tag \
             FROM logs WHERE id = ?",
    ))
    .bind(id)
    .fetch_optional(&state.db.pool)
    .await?;

    let row = match row {
        Some(r) => r,
        None => return Err(AppError::BadRequest("日志记录不存在".to_string())),
    };

    if claims.role != "admin" && row.user_id != claims.sub {
        let my_uid: Option<String> =
            sqlx::query_scalar(&state.db.format_query("SELECT uid FROM users WHERE id = ?"))
                .bind(&claims.sub)
                .fetch_optional(&state.db.pool)
                .await?;
        let my_uid = my_uid.unwrap_or_default();
        let is_referral: bool = sqlx::query_scalar(
            &state.db.format_query(
                "SELECT EXISTS(SELECT 1 FROM users WHERE id = ? AND (referred_by = ? OR referred_by = ?))",
            ),
        )
        .bind(&row.user_id)
        .bind(&claims.sub)
        .bind(&my_uid)
        .fetch_one(&state.db.pool)
        .await?;
        if !is_referral {
            return Err(AppError::Forbidden("无权查看此日志详情".to_string()));
        }
    }

    let mut allow_details = true;
    if claims.role != "admin" {
        let perm: Option<i32> = sqlx::query_scalar(
            &state.db.format_query(
                "SELECT ul.allow_view_log_details FROM users u LEFT JOIN user_levels ul ON u.user_group = ul.group_key WHERE u.id = ?",
            ),
        )
        .bind(&claims.sub)
        .fetch_optional(&state.db.pool)
        .await?
        .flatten();
        allow_details = perm.unwrap_or(1) == 1;
    }

    if !allow_details {
        return Ok(Json(LogDetailContent {
            id,
            request_content: None,
            response_content: None,
            post_response: None,
            upstream_req_content: None,
            billing_detail: None,
        }));
    }

    let mut detail = LogDetailContent {
        id,
        request_content: row.request_content,
        response_content: row.response_content,
        post_response: row.post_response,
        upstream_req_content: row.upstream_req_content,
        billing_detail: row.billing_detail,
    };

    if claims.role != "admin" {
        // 与列表策略一致：隐藏级联 stage1/stage2 内部结构
        cascade_sanitize_for_user(
            &mut detail.upstream_req_content,
            &mut detail.response_content,
            &mut detail.post_response,
            row.plugin_tag.as_deref(),
        );
        if row.status_code != 200 {
            if let Some(ref resp) = detail.response_content {
                detail.response_content = Some(crate::relay::proxy::sanitize_error_message(resp));
            }
        }
    }

    Ok(Json(detail))
}

const EXPORT_LIMIT: i64 = 100_000;

pub async fn export_logs(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Query(query): Query<LogQuery>,
) -> Result<Response, AppError> {
    if claims.role != "admin" {
        return Err(AppError::Forbidden("仅超级管理员可导出数据".to_string()));
    }

    let mut q = query.clone();
    if let Some(ref user_id) = q.user_id {
        if user_id != "unknown" {
            q.user_id = Some(resolve_user_filter(&state.db, user_id).await?);
        }
    }

    let (where_clause, binds) = build_log_where(&claims, &q, true);
    let total = fetch_logs_count(&state.db, &where_clause, &binds).await?;

    if total > EXPORT_LIMIT {
        return Ok((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "error": format!("当前筛选条件下共 {} 条数据，超出单次导出上限 {} 条，请缩小时间范围或增加筛选条件后重试", total, EXPORT_LIMIT)
            })),
        )
            .into_response());
    }

    let data_sql = state.db.format_query(&format!(
        "SELECT l.id, COALESCE(l.log_id, '') as log_id, l.user_id, l.model, l.prompt_tokens, l.completion_tokens, l.cached_tokens, \
         l.cost, l.latency_ms, l.status_code, l.endpoint, l.is_stream, \
         l.billing_detail, l.created_at, \
         c.name as channel_name, \
         COALESCE(u.nickname, u.username) as user_nickname, \
         COALESCE(u.uid, '') as user_uid, \
         cc.name as sub_channel_name, \
         COALESCE(l.task_id, '') as task_id \
         FROM logs l{} \
         {} ORDER BY l.created_at DESC LIMIT {}",
        LOGS_EXPORT_JOINS, where_clause, EXPORT_LIMIT
    ));

    use sqlx::Row;
    let raw_rows = {
        let mut q = sqlx::query(&data_sql);
        for v in &binds {
            q = q.bind(v);
        }
        q.fetch_all(&state.db.pool).await?
    };

    let mut csv = String::from("\u{FEFF}日志ID,任务ID,ID,用户ID,用户昵称,UID,模型,输入Tokens,输出Tokens,缓存Tokens,费用,耗时(ms),状态码,类型,渠道,上游子渠道,计费明细,请求路径,时间\n");
    for row in &raw_rows {
        let id: i64 = row.get(0);
        let log_id: String = row.get(1);
        let user_id: String = row.get(2);
        let model: String = row.get(3);
        let prompt_tokens: i32 = row.get(4);
        let completion_tokens: i32 = row.get(5);
        let cached_tokens: i32 = row.get(6);
        let cost: f64 = row.get(7);
        let latency_ms: i32 = row.get(8);
        let status_code: i32 = row.get(9);
        let endpoint: String = row.get(10);
        let is_stream: Option<i32> = row.get(11);
        let billing_detail: Option<String> = row.get(12);
        let created_at: crate::time_system::DbTs = row.get(13);
        let channel_name: Option<String> = row.get(14);
        let user_nickname: Option<String> = row.get(15);
        let user_uid: String = row.get(16);
        let sub_channel_name: Option<String> = row.get(17);
        let task_id: String = row.get(18);
        let stream_label = match is_stream {
            Some(1) => "流",
            _ => "非流",
        };
        let formatted_time = format_db_time(&created_at);
        csv.push_str(&format!(
            "\"{}\",\"{}\",{},\"{}\",\"{}\",\"{}\",\"{}\",{},{},{},{:.6},{},{},{},\"{}\",\"{}\",\"{}\",\"{}\",\"{}\"\n",
            log_id,
            task_id,
            id,
            user_id,
            user_nickname.as_deref().unwrap_or("-").replace('"', "\"\""),
            user_uid,
            model.replace('"', "\"\""),
            prompt_tokens,
            completion_tokens,
            cached_tokens,
            cost,
            latency_ms,
            status_code,
            stream_label,
            channel_name.as_deref().unwrap_or("-").replace('"', "\"\""),
            sub_channel_name.as_deref().unwrap_or("-").replace('"', "\"\""),
            billing_detail.as_deref().unwrap_or("").replace('"', "\"\""),
            endpoint.replace('"', "\"\""),
            formatted_time,
        ));
    }

    let filename = format!(
        "usage_logs_{}.csv",
        chrono::Local::now().format("%Y%m%d_%H%M%S")
    );
    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "text/csv; charset=utf-8")
        .header(
            header::CONTENT_DISPOSITION,
            format!("attachment; filename=\"{}\"", filename),
        )
        .body(axum::body::Body::from(csv))
        .unwrap())
}

/// 深翻页：先取 id 再回表 JOIN（排序仅 `created_at DESC`，以走时间索引有序扫描）。
pub(crate) fn deferred_join_page_sql(
    select_sql: &str,
    joins: &str,
    where_clause: &str,
    per_page: i64,
    offset: i64,
) -> String {
    format!(
        "{select_sql} FROM (
            SELECT l.id FROM logs l{where_clause}
            ORDER BY l.created_at DESC
            LIMIT {per_page} OFFSET {offset}
         ) page
         INNER JOIN logs l ON l.id = page.id
         {joins}
         ORDER BY l.created_at DESC"
    )
}

/// 将数据库存储的时间字符串格式化为可读的北京时间
pub fn format_db_time(raw: &str) -> String {
    use chrono::{DateTime, FixedOffset, Utc};
    let raw = raw.trim();
    if let Ok(dt) = DateTime::parse_from_rfc3339(raw) {
        let shanghai = FixedOffset::east_opt(8 * 3600).unwrap();
        return dt
            .with_timezone(&shanghai)
            .format("%Y-%m-%d %H:%M:%S")
            .to_string();
    }
    if let Ok(dt) = DateTime::parse_from_str(raw, "%Y-%m-%d %H:%M:%S%.f%#z") {
        let shanghai = FixedOffset::east_opt(8 * 3600).unwrap();
        return dt
            .with_timezone(&shanghai)
            .format("%Y-%m-%d %H:%M:%S")
            .to_string();
    }
    if let Ok(dt) = raw.parse::<DateTime<Utc>>() {
        let shanghai = FixedOffset::east_opt(8 * 3600).unwrap();
        return dt
            .with_timezone(&shanghai)
            .format("%Y-%m-%d %H:%M:%S")
            .to_string();
    }
    raw.split('.').next().unwrap_or(raw).to_string()
}
