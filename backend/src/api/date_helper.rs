use chrono::{DateTime, Duration, NaiveDate};

/// 规范化日期字符串并计算保守的索引范围边界。
/// 无偏移的纯日期按 **timesystem UTC** 解释（`+00:00`）。
pub fn parse_and_get_bounds(raw_date: &str, is_end: bool) -> (String, String) {
    let normalized = if raw_date.contains('T') || raw_date.contains('+') || raw_date.ends_with('Z')
    {
        raw_date.to_string()
    } else if is_end {
        format!("{} 23:59:59+00:00", raw_date)
    } else {
        format!("{} 00:00:00+00:00", raw_date)
    };

    let mut bound = if is_end {
        "9999-12-31".to_string()
    } else {
        "1970-01-01".to_string()
    };

    if let Ok(dt) = DateTime::parse_from_rfc3339(&normalized) {
        if is_end {
            bound = (dt + Duration::days(2)).format("%Y-%m-%d").to_string();
        } else {
            bound = (dt - Duration::days(2)).format("%Y-%m-%d").to_string();
        }
    } else if normalized.len() >= 10 {
        if let Ok(naive_date) = NaiveDate::parse_from_str(&normalized[..10], "%Y-%m-%d") {
            if is_end {
                bound = (naive_date + Duration::days(2))
                    .format("%Y-%m-%d")
                    .to_string();
            } else {
                bound = (naive_date - Duration::days(2))
                    .format("%Y-%m-%d")
                    .to_string();
            }
        }
    }

    (normalized, bound)
}

/// 将可选的或普通的日期字符串（支持 YYYY-MM-DD 或 ISO-8601 等格式）安全解析为 NaiveDate
///
/// 具备时区感知能力：若为 ISO 格式或带空格的带时区时间戳，会自动转换为指定时区下的当地日历日期
pub fn parse_to_naive_date(
    raw_date: Option<&str>,
    default_date: NaiveDate,
    tz: chrono_tz::Tz,
) -> NaiveDate {
    use chrono::{DateTime, NaiveDateTime, Utc};
    raw_date
        .and_then(|s| {
            let s = s.trim();
            // 1. 优先尝试解析带时区的 rfc3339
            if let Ok(dt) = DateTime::parse_from_rfc3339(s) {
                return Some(dt.with_timezone(&tz).date_naive());
            }
            // 2. 尝试解析常见的带空格与时区偏移的格式 (支持毫秒和秒级)
            let formats = [
                "%Y-%m-%d %H:%M:%S%.f%z",
                "%Y-%m-%d %H:%M:%S%z",
                "%Y-%m-%dT%H:%M:%S%.f%z",
                "%Y-%m-%dT%H:%M:%S%z",
            ];
            for fmt in &formats {
                if let Ok(dt) = DateTime::parse_from_str(s, fmt) {
                    return Some(dt.with_timezone(&tz).date_naive());
                }
            }
            // 3. 尝试解析不带时区的 NaiveDateTime，并在此基准上赋予指定时区
            let naive_formats = [
                "%Y-%m-%d %H:%M:%S%.f",
                "%Y-%m-%d %H:%M:%S",
                "%Y-%m-%dT%H:%M:%S%.f",
                "%Y-%m-%dT%H:%M:%S",
            ];
            for fmt in &naive_formats {
                if let Ok(ndt) = NaiveDateTime::parse_from_str(s, fmt) {
                    return Some(
                        ndt.and_local_timezone(tz)
                            .latest()
                            .unwrap_or_else(|| {
                                // 发生夏令时跳跃时的安全后备
                                DateTime::<Utc>::from_naive_utc_and_offset(ndt, Utc)
                                    .with_timezone(&tz)
                            })
                            .date_naive(),
                    );
                }
            }
            // 4. 截取前 10 位尝试做 naive date 的基础匹配
            if s.len() >= 10 {
                if let Ok(naive_date) = NaiveDate::parse_from_str(&s[..10], "%Y-%m-%d") {
                    return Some(naive_date);
                }
            }
            None
        })
        .unwrap_or(default_date)
}

/// 获取指定 timedisplay 下的今日日期与今日零点时间戳（兼容旧名）。
#[deprecated(note = "use get_timezone_time_bounds")]
#[allow(dead_code)]
pub fn get_today_shanghai_bounds() -> (NaiveDate, String) {
    let b = get_timezone_time_bounds(chrono_tz::Asia::Shanghai);
    (b.today, b.today_start_ts)
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
    /// 自动生成 Logs 表实时检索的绝对时间范围 SQL 条件片段。
    /// 示例：`created_at >= ?::timestamptz AND created_at <= ?::timestamptz`
    /// （TIMESTAMPTZ 列不可与 TEXT 参数直接比较，必须显式 cast）
    pub fn sql_cond(&self, field_name: &str) -> String {
        let op = if self.is_inclusive_end { "<=" } else { "<" };
        // 列已为 TIMESTAMPTZ：参数必须显式 ::timestamptz，否则 PG 报 timestamptz >= text
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

/// 列已为 TIMESTAMPTZ 时直接返回字段名（保留函数名兼容旧调用）。
/// 历史 TEXT 列曾用 CASE 拼 `+00:00` 再 cast；迁移后不再需要。
pub fn sql_timezone_convert(field: &str) -> String {
    field.to_string()
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

#[cfg(test)]
mod model_detail_days_tests {
    use super::*;
    use chrono::NaiveDate;

    #[test]
    fn all_time_falls_back_to_last_three_calendar_days() {
        let today = NaiveDate::from_ymd_opt(2026, 7, 19).unwrap();
        let days = model_detail_days(None, None, today);
        assert_eq!(
            days,
            vec![
                NaiveDate::from_ymd_opt(2026, 7, 17).unwrap(),
                NaiveDate::from_ymd_opt(2026, 7, 18).unwrap(),
                NaiveDate::from_ymd_opt(2026, 7, 19).unwrap(),
            ]
        );
    }

    #[test]
    fn last_month_anchors_to_month_end() {
        let today = NaiveDate::from_ymd_opt(2026, 7, 19).unwrap();
        let start = NaiveDate::from_ymd_opt(2026, 6, 1).unwrap();
        let end = NaiveDate::from_ymd_opt(2026, 6, 30).unwrap();
        let days = model_detail_days(Some(start), Some(end), today);
        assert_eq!(
            days,
            vec![
                NaiveDate::from_ymd_opt(2026, 6, 28).unwrap(),
                NaiveDate::from_ymd_opt(2026, 6, 29).unwrap(),
                NaiveDate::from_ymd_opt(2026, 6, 30).unwrap(),
            ]
        );
    }

    #[test]
    fn single_day_range_returns_one_day() {
        let today = NaiveDate::from_ymd_opt(2026, 7, 19).unwrap();
        let day = NaiveDate::from_ymd_opt(2026, 7, 10).unwrap();
        let days = model_detail_days(Some(day), Some(day), today);
        assert_eq!(days, vec![day]);
    }
}
