//! 按用户 timedisplay 计算自然日/周/月周期键与 UTC 查询边界

use chrono::{DateTime, Duration, NaiveTime, TimeZone, Utc};
use chrono_tz::Tz;

use super::core::parse_timedisplay;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PeriodKeys {
    pub day: String,   // YYYY-MM-DD（用户本地）
    pub week: String,  // YYYY-%U（周日为一周起点，与历史逻辑一致）
    pub month: String, // YYYY-MM
}

#[derive(Debug, Clone)]
pub struct LocalDayBounds {
    /// 该本地日 00:00:00 对应的 UTC
    pub start_utc: DateTime<Utc>,
    /// 下一本地日 00:00:00 对应的 UTC（半开区间上界）
    pub end_utc: DateTime<Utc>,
    /// 供 SQL TEXT/timestamptz 比较的起止字符串（RFC3339）
    pub start_rfc3339: String,
    /// 半开上界 RFC3339（与 `end_utc` 对应）
    pub end_rfc3339: String,
}

/// 以当前 UTC 时刻，按 timedisplay 产出日/周/月周期键。
pub fn local_period_keys(timedisplay: &str) -> PeriodKeys {
    local_period_keys_at(Utc::now(), timedisplay)
}

fn local_period_keys_at(now_utc: DateTime<Utc>, timedisplay: &str) -> PeriodKeys {
    let tz = parse_timedisplay(timedisplay);
    let local = now_utc.with_timezone(&tz);
    PeriodKeys {
        day: local.format("%Y-%m-%d").to_string(),
        week: local.format("%Y-%U").to_string(),
        month: local.format("%Y-%m").to_string(),
    }
}

/// 用户本地自然日 → UTC 半开区间 `[start, end)`，用于统计聚合与限额 hydration。
pub fn local_day_bounds_utc(now_utc: DateTime<Utc>, timedisplay: &str) -> LocalDayBounds {
    let tz = parse_timedisplay(timedisplay);
    local_day_bounds_for_tz(now_utc, tz)
}

fn local_day_bounds_for_tz(now_utc: DateTime<Utc>, tz: Tz) -> LocalDayBounds {
    let local = now_utc.with_timezone(&tz);
    let day = local.date_naive();
    let start_local = resolve_local(tz, day.and_time(NaiveTime::from_hms_opt(0, 0, 0).unwrap()));
    let next_day = day + Duration::days(1);
    let end_local = resolve_local(
        tz,
        next_day.and_time(NaiveTime::from_hms_opt(0, 0, 0).unwrap()),
    );
    let start_utc = start_local.with_timezone(&Utc);
    let end_utc = end_local.with_timezone(&Utc);
    LocalDayBounds {
        start_utc,
        end_utc,
        start_rfc3339: start_utc.to_rfc3339(),
        end_rfc3339: end_utc.to_rfc3339(),
    }
}

/// 指定本地日历日的 UTC 边界（用于按日期筛选任务列表/日志）。
pub fn local_calendar_day_bounds(
    local_day: chrono::NaiveDate,
    timedisplay: &str,
) -> LocalDayBounds {
    let tz = parse_timedisplay(timedisplay);
    let start_local = resolve_local(
        tz,
        local_day.and_time(NaiveTime::from_hms_opt(0, 0, 0).unwrap()),
    );
    let end_local = resolve_local(
        tz,
        (local_day + Duration::days(1)).and_time(NaiveTime::from_hms_opt(0, 0, 0).unwrap()),
    );
    let start_utc = start_local.with_timezone(&Utc);
    let end_utc = end_local.with_timezone(&Utc);
    LocalDayBounds {
        start_utc,
        end_utc,
        start_rfc3339: start_utc.to_rfc3339(),
        end_rfc3339: end_utc.to_rfc3339(),
    }
}

fn resolve_local(tz: Tz, naive: chrono::NaiveDateTime) -> DateTime<Tz> {
    match tz.from_local_datetime(&naive) {
        chrono::LocalResult::Single(dt) | chrono::LocalResult::Ambiguous(_, dt) => dt,
        chrono::LocalResult::None => Utc.from_utc_datetime(&naive).with_timezone(&tz),
    }
}
