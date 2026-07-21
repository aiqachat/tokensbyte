use chrono::{DateTime, Duration, NaiveDate, NaiveDateTime, TimeZone, Utc};

fn local_day_start(day: NaiveDate, tz: chrono_tz::Tz) -> DateTime<Utc> {
    let ndt = day.and_hms_opt(0, 0, 0).unwrap_or_else(|| {
        NaiveDate::from_ymd_opt(1970, 1, 1)
            .unwrap()
            .and_hms_opt(0, 0, 0)
            .unwrap()
    });
    match tz.from_local_datetime(&ndt).latest() {
        Some(dt) => dt.with_timezone(&Utc),
        None => DateTime::<Utc>::from_naive_utc_and_offset(ndt, Utc),
    }
}

fn format_timestamptz_bind(dt: DateTime<Utc>) -> String {
    dt.format("%Y-%m-%d %H:%M:%S%.3f%:z").to_string()
}

/// 无偏移本地墙钟（按 timedisplay 解释）
const NAIVE_LOCAL_DT_FORMATS: &[&str] = &[
    "%Y-%m-%dT%H:%M:%S%.f",
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%dT%H:%M",
    "%Y-%m-%d %H:%M:%S%.f",
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%d %H:%M",
];

fn parse_absolute_datetime(s: &str) -> Option<DateTime<Utc>> {
    if let Ok(dt) = DateTime::parse_from_rfc3339(s) {
        return Some(dt.with_timezone(&Utc));
    }
    let formats = [
        "%Y-%m-%d %H:%M:%S%.f%z",
        "%Y-%m-%d %H:%M:%S%z",
        "%Y-%m-%dT%H:%M:%S%.f%z",
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%d %H:%M:%S%.f%:z",
        "%Y-%m-%d %H:%M:%S%:z",
    ];
    for fmt in &formats {
        if let Ok(dt) = DateTime::parse_from_str(s, fmt) {
            return Some(dt.with_timezone(&Utc));
        }
    }
    None
}

fn naive_local_to_utc(ndt: NaiveDateTime, tz: chrono_tz::Tz) -> DateTime<Utc> {
    match ndt.and_local_timezone(tz).latest() {
        Some(dt) => dt.with_timezone(&Utc),
        None => DateTime::<Utc>::from_naive_utc_and_offset(ndt, Utc),
    }
}

/// 解析单侧边界为 UTC 绝对时刻。
/// `is_end=true` 时返回**半开上界**（不含）：纯日期为次日 00:00；带时刻的闭区间末日则 +1ms。
pub fn parse_instant_bound(raw_date: &str, is_end: bool, tz: chrono_tz::Tz) -> DateTime<Utc> {
    let s = raw_date.trim();
    if let Some(dt) = parse_absolute_datetime(s) {
        return if is_end {
            dt + Duration::milliseconds(1)
        } else {
            dt
        };
    }

    // 无偏移时刻：按 timedisplay 解释（含 `YYYY-MM-DD HH:mm:ss` 与 ISO 无 Z）
    for fmt in NAIVE_LOCAL_DT_FORMATS {
        if let Ok(ndt) = NaiveDateTime::parse_from_str(s, fmt) {
            let utc = naive_local_to_utc(ndt, tz);
            return if is_end {
                utc + Duration::milliseconds(1)
            } else {
                utc
            };
        }
    }

    // 纯日期 YYYY-MM-DD
    if s.len() >= 10 {
        if let Ok(day) = NaiveDate::parse_from_str(&s[..10], "%Y-%m-%d") {
            // 仅当整段（或截到空白前）就是日期时，才按日历日半开；避免误吃 "2026-07-15 junk"
            let date_token = s.split(['T', ' ']).next().unwrap_or(s);
            if date_token.len() == 10 {
                return if is_end {
                    local_day_start(day + Duration::days(1), tz)
                } else {
                    local_day_start(day, tz)
                };
            }
        }
    }

    let fallback = Utc::now().date_naive();
    if is_end {
        local_day_start(fallback + Duration::days(1), tz)
    } else {
        local_day_start(fallback, tz)
    }
}

/// 半开边界 → 可绑定的 timestamptz 文本（起点含 / 终点 exclusive）。
pub fn parse_timestamptz_bind(raw_date: &str, is_end: bool, tz: chrono_tz::Tz) -> String {
    format_timestamptz_bind(parse_instant_bound(raw_date, is_end, tz))
}

pub fn default_timedisplay_tz() -> chrono_tz::Tz {
    crate::time_system::parse_timedisplay(crate::time_system::DEFAULT_TIMEDISPLAY)
}

/// 半开谓词（无前导 AND）：`(field >=| < ?::timestamptz, bind)`。
pub fn timestamptz_bound_pred(
    field: &str,
    raw: &str,
    is_end: bool,
    tz: chrono_tz::Tz,
) -> (String, String) {
    let precise = parse_timestamptz_bind(raw, is_end, tz);
    let pred = if is_end {
        format!("{field} < ?::timestamptz")
    } else {
        format!("{field} >= ?::timestamptz")
    };
    (pred, precise)
}

/// `AND field >=| < ?::timestamptz`（终点半开）。
pub fn push_timestamptz_bound(
    sql: &mut String,
    binds: &mut Vec<String>,
    field: &str,
    raw: &str,
    is_end: bool,
    tz: chrono_tz::Tz,
) {
    let (pred, precise) = timestamptz_bound_pred(field, raw, is_end, tz);
    sql.push_str(" AND ");
    sql.push_str(&pred);
    binds.push(precise);
}

/// 使用默认 timedisplay 的半开边界推送（日志/财务等无请求时区上下文时）。
pub fn push_timestamptz_bound_default(
    sql: &mut String,
    binds: &mut Vec<String>,
    field: &str,
    raw: &str,
    is_end: bool,
) {
    push_timestamptz_bound(sql, binds, field, raw, is_end, default_timedisplay_tz());
}

/// 使用默认 timedisplay 的半开谓词。
pub fn timestamptz_bound_pred_default(field: &str, raw: &str, is_end: bool) -> (String, String) {
    timestamptz_bound_pred(field, raw, is_end, default_timedisplay_tz())
}

/// 将可选日期字符串安全解析为 NaiveDate（ISO/带偏移 → timedisplay 当地日；纯日期原样）。
pub fn parse_to_naive_date(
    raw_date: Option<&str>,
    default_date: NaiveDate,
    tz: chrono_tz::Tz,
) -> NaiveDate {
    raw_date
        .and_then(|s| {
            let s = s.trim();
            if let Some(dt) = parse_absolute_datetime(s) {
                return Some(dt.with_timezone(&tz).date_naive());
            }
            for fmt in NAIVE_LOCAL_DT_FORMATS {
                if let Ok(ndt) = NaiveDateTime::parse_from_str(s, fmt) {
                    return Some(naive_local_to_utc(ndt, tz).with_timezone(&tz).date_naive());
                }
            }
            if s.len() >= 10 {
                let date_token = s.split(['T', ' ']).next().unwrap_or(s);
                if date_token.len() == 10 {
                    if let Ok(naive_date) = NaiveDate::parse_from_str(date_token, "%Y-%m-%d") {
                        return Some(naive_date);
                    }
                }
            }
            None
        })
        .unwrap_or(default_date)
}

/// 时区时间范围边界结构体，便于多维度复用与对齐
pub struct TimeBounds {
    pub today: chrono::NaiveDate,
    pub yesterday: chrono::NaiveDate,
    pub today_start_ts: String,
}

/// 根据特定时区获取今日、昨日、今日零点包含时区的绝对时间戳字符串
pub fn get_timezone_time_bounds(tz: chrono_tz::Tz) -> TimeBounds {
    let now = chrono::Utc::now().with_timezone(&tz);
    let today = now.date_naive();
    let yesterday = today - chrono::Duration::days(1);
    let offset = now.format("%z").to_string();
    let today_start_ts = format!("{} 00:00:00{}", today.format("%Y-%m-%d"), offset);
    TimeBounds {
        today,
        yesterday,
        today_start_ts,
    }
}

/// 统一解析 timedisplay：请求头覆盖 > 用户 `users.timezone` > 站点默认。
/// `timesystem` 始终为 UTC，本函数只返回表现层/计费自然日时区。
pub async fn resolve_user_timezone(
    db: &crate::db::Database,
    _is_admin: bool,
    user_id: &str,
    header_tz: &str,
) -> Result<chrono_tz::Tz, sqlx::Error> {
    let site_settings_val: Option<String> = sqlx::query_scalar(
        &db.format_query("SELECT value FROM settings WHERE key = 'site_settings'"),
    )
    .fetch_optional(&db.pool)
    .await?;

    let default_site_tz = site_settings_val
        .and_then(|v| serde_json::from_str::<crate::models::SiteSettings>(&v).ok())
        .map(|s| s.default_timezone)
        .unwrap_or_else(|| crate::time_system::DEFAULT_TIMEDISPLAY.to_string());

    let user_tz: Option<String> = if user_id.is_empty() {
        None
    } else {
        sqlx::query_scalar::<_, String>(&db.format_query("SELECT timezone FROM users WHERE id = ?"))
            .bind(user_id)
            .fetch_optional(&db.pool)
            .await?
    };

    let header = if header_tz.trim().is_empty() {
        None
    } else {
        Some(header_tz)
    };

    Ok(crate::time_system::resolve_timedisplay(
        header,
        user_tz.as_deref(),
        Some(default_site_tz.as_str()),
    ))
}

/// 按 user_id 解析 timedisplay IANA 名（无请求头时供网关计费使用）
pub async fn resolve_user_timedisplay_name(
    db: &crate::db::Database,
    user_id: &str,
    site_default: &str,
) -> String {
    let user_tz: Option<String> = sqlx::query_scalar::<_, String>(
        &db.format_query("SELECT timezone FROM users WHERE id = ?"),
    )
    .bind(user_id)
    .fetch_optional(&db.pool)
    .await
    .ok()
    .flatten();
    crate::time_system::resolve_timedisplay(None, user_tz.as_deref(), Some(site_default))
        .name()
        .to_string()
}

#[derive(Debug, Clone)]
pub struct QueryTimeSlice {
    // 历史归档天段 (直接查汇总表)
    pub has_history_days: bool,
    pub hist_start_date: Option<NaiveDate>,
    pub hist_end_date: Option<NaiveDate>,

    // 今日实时段 (直接查 logs 表今日数据)
    pub has_today: bool,
    pub today_start_ts: Option<String>,
    pub today_end_ts: Option<String>,

    // 首部未满一天的碎片时间段 (查 logs 实时表做时间戳补偿)
    pub has_head_slice: bool,
    pub head_start_ts: Option<String>,
    pub head_end_ts: Option<String>,

    // 尾部未满一天的碎片时间段 (查 logs 实时表做时间戳补偿)
    pub has_tail_slice: bool,
    pub tail_start_ts: Option<String>,
    pub tail_end_ts: Option<String>,
}

#[derive(Debug, Clone)]
pub struct RealtimeSlice {
    pub start: String,
    pub end: String,
    pub is_inclusive_end: bool, // true 表示 <=, false 表示 <
}

impl QueryTimeSlice {
    pub fn realtime_slices(&self) -> Vec<RealtimeSlice> {
        let mut list = Vec::new();
        if self.has_today {
            list.push(RealtimeSlice {
                start: self.today_start_ts.clone().unwrap(),
                end: self.today_end_ts.clone().unwrap(),
                is_inclusive_end: true,
            });
        }
        if self.has_head_slice {
            list.push(RealtimeSlice {
                start: self.head_start_ts.clone().unwrap(),
                end: self.head_end_ts.clone().unwrap(),
                is_inclusive_end: false,
            });
        }
        if self.has_tail_slice {
            list.push(RealtimeSlice {
                start: self.tail_start_ts.clone().unwrap(),
                end: self.tail_end_ts.clone().unwrap(),
                is_inclusive_end: true,
            });
        }
        list
    }

    /// 自动生成历史归档表检索的时间范围 SQL 条件片段
    /// 示例：stat_date >= ? AND stat_date <= ?
    pub fn history_cond(&self, field_name: &str) -> String {
        format!("{} >= ? AND {} <= ?", field_name, field_name)
    }
}

impl RealtimeSlice {
    /// Logs 实时区间：`created_at >= ?::timestamptz AND created_at {<=|<} ?::timestamptz`。
    /// 新热路径优先用 `push_timestamptz_bound`（终点半开 `<`）；本方法保留切片兼容。
    pub fn sql_cond(&self, field_name: &str) -> String {
        let op = if self.is_inclusive_end { "<=" } else { "<" };
        format!(
            "{field} >= ?::timestamptz AND {field} {op} ?::timestamptz",
            field = field_name,
            op = op
        )
    }
}

/// 根据用户传入的日期范围和目标 timedisplay，切分历史归档天与实时 logs 段。
/// 日切边界一律按参数 `tz`（不再硬编码 Asia/Shanghai）。
pub fn calculate_query_slices(
    start_date_str: Option<&str>,
    end_date_str: Option<&str>,
    tz: chrono_tz::Tz,
) -> QueryTimeSlice {
    use chrono::Utc;

    let tz_now = Utc::now().with_timezone(&tz);
    let tz_today = tz_now.date_naive();

    let start_naive = parse_to_naive_date(start_date_str, tz_today - Duration::days(29), tz);
    let query_start_dt = resolve_local_dt(tz, start_naive, 0, 0, 0, 0);
    let end_naive = parse_to_naive_date(end_date_str, tz_today, tz);
    let query_end_dt = resolve_local_dt(tz, end_naive, 23, 59, 59, 999);

    // 归档/实时分界：timedisplay 下「今日」零点
    let today_start = resolve_local_dt(tz, tz_today, 0, 0, 0, 0);

    let mut slice = QueryTimeSlice {
        has_history_days: false,
        hist_start_date: None,
        hist_end_date: None,
        has_today: false,
        today_start_ts: None,
        today_end_ts: None,
        has_head_slice: false,
        head_start_ts: None,
        head_end_ts: None,
        has_tail_slice: false,
        tail_start_ts: None,
        tail_end_ts: None,
    };

    // 今日实时段：∩ [today_start, +∞)
    if query_end_dt >= today_start {
        slice.has_today = true;
        let t_start = if query_start_dt >= today_start {
            query_start_dt
        } else {
            today_start
        };
        slice.today_start_ts = Some(fmt_ts(t_start));
        slice.today_end_ts = Some(fmt_ts(query_end_dt));
    }

    // 历史段：∩ (-∞, today_start)
    if query_start_dt < today_start {
        let hist_abs_start = query_start_dt;
        let hist_abs_end = if query_end_dt < today_start {
            query_end_dt
        } else {
            today_start - Duration::microseconds(1)
        };

        if hist_abs_start <= hist_abs_end {
            let start_day = hist_abs_start.date_naive();
            let start_day_start = resolve_local_dt(tz, start_day, 0, 0, 0, 0);
            let full_start = if hist_abs_start <= start_day_start {
                start_day
            } else {
                start_day + Duration::days(1)
            };

            let end_day = hist_abs_end.date_naive();
            let end_day_end = resolve_local_dt(tz, end_day, 23, 59, 59, 999);
            let full_end = if hist_abs_end >= end_day_end {
                end_day
            } else {
                end_day - Duration::days(1)
            };

            if full_start <= full_end {
                slice.has_history_days = true;
                slice.hist_start_date = Some(full_start);
                slice.hist_end_date = Some(full_end);

                let full_start_start = resolve_local_dt(tz, full_start, 0, 0, 0, 0);
                if hist_abs_start < full_start_start {
                    slice.has_head_slice = true;
                    slice.head_start_ts = Some(fmt_ts(hist_abs_start));
                    slice.head_end_ts = Some(fmt_ts(full_start_start));
                }

                let full_end_end = resolve_local_dt(tz, full_end, 23, 59, 59, 999);
                if hist_abs_end > full_end_end {
                    slice.has_tail_slice = true;
                    let limit_start = full_end_end + Duration::microseconds(1);
                    slice.tail_start_ts = Some(fmt_ts(limit_start));
                    slice.tail_end_ts = Some(fmt_ts(hist_abs_end));
                }
            } else {
                slice.has_head_slice = true;
                slice.head_start_ts = Some(fmt_ts(hist_abs_start));
                slice.head_end_ts = Some(fmt_ts(hist_abs_end));
            }
        }
    }

    slice
}

fn resolve_local_dt(
    tz: chrono_tz::Tz,
    day: NaiveDate,
    h: u32,
    mi: u32,
    s: u32,
    milli: u32,
) -> chrono::DateTime<chrono_tz::Tz> {
    use chrono::{TimeZone, Utc};
    let naive = if milli == 0 {
        day.and_hms_opt(h, mi, s).unwrap()
    } else {
        day.and_hms_milli_opt(h, mi, s, milli).unwrap()
    };
    match tz.from_local_datetime(&naive) {
        chrono::LocalResult::Single(dt) | chrono::LocalResult::Ambiguous(_, dt) => dt,
        chrono::LocalResult::None => Utc.from_utc_datetime(&naive).with_timezone(&tz),
    }
}

fn fmt_ts(dt: chrono::DateTime<chrono_tz::Tz>) -> String {
    dt.format("%Y-%m-%d %H:%M:%S%.3f%z").to_string()
}

/// 将 IANA 时区名过滤为可安全嵌入 SQL `AT TIME ZONE '...'` 的字符串。
pub fn sql_safe_tz_name(tz: chrono_tz::Tz) -> String {
    tz.name()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '/' | '_' | '+' | '-'))
        .collect()
}

/// `TO_CHAR(expr AT TIME ZONE 'tz', 'YYYY-MM-DD')` 日桶表达式。
pub fn sql_date_bucket(ts_expr: &str, tz: chrono_tz::Tz) -> String {
    format!(
        "TO_CHAR({} AT TIME ZONE '{}', 'YYYY-MM-DD')",
        ts_expr,
        sql_safe_tz_name(tz)
    )
}

/// 仪表盘模型明细「近几日」日期列表：锚定区间末日（≤ today），向内最多取 3 天。
/// `start`/`end` 均为 None 时表示「全部」，退回日历近 3 天。
pub fn model_detail_days(
    start: Option<NaiveDate>,
    end: Option<NaiveDate>,
    today: NaiveDate,
) -> Vec<NaiveDate> {
    let range_end = end.map(|d| d.min(today)).unwrap_or(today);
    let range_start = start.unwrap_or_else(|| today - Duration::days(2));

    let mut days = Vec::new();
    let mut cursor = range_end;
    for _ in 0..3 {
        if cursor < range_start {
            break;
        }
        days.push(cursor);
        cursor -= Duration::days(1);
    }
    days.reverse();
    days
}
