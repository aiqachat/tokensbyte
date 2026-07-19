//! 套餐购买到期：以用户 timedisplay 自然日截止，再换算为 UTC 落库

use chrono::{DateTime, Duration, NaiveTime, TimeZone, Utc};

use super::core::parse_timedisplay;

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct PackageExpiryInput {
    /// 购买时刻（UTC）
    pub purchased_at_utc: DateTime<Utc>,
    /// 购买天数 N（自然日口径，按 timedisplay）
    pub days: i64,
    /// 用户显示时区（IANA）
    pub timedisplay: String,
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct PackageExpiryResult {
    /// 写入数据库的 UTC 到期时刻
    pub expires_at_utc: DateTime<Utc>,
    /// DB TEXT 友好格式（UTC 朴素字符串）
    pub expires_at_utc_naive: String,
    /// 用户本地截止日历日 YYYY-MM-DD
    pub local_end_date: String,
    /// 用户本地截止墙钟时间（含时区）
    pub local_end_display: String,
}

/// 购买 N 天套餐：
/// 1. 将购买 UTC 时刻映射到用户 timedisplay 的本地日历日；
/// 2. 到期日 = 本地购买日 + (N - 1) 天的 23:59:59（买 1 天即当日当地结束）；
/// 3. 将该本地截止时刻转换回 UTC 写入 DB。
///
/// 例：UTC+8 用户 2026-07-18 10:00 买 1 天 → 本地 2026-07-18 23:59:59 → UTC 2026-07-18 15:59:59
#[allow(dead_code)]
pub fn compute_package_expires_at_utc(input: &PackageExpiryInput) -> PackageExpiryResult {
    let days = input.days.max(1);
    let tz = parse_timedisplay(&input.timedisplay);
    let local_purchase = input.purchased_at_utc.with_timezone(&tz);
    let local_start_date = local_purchase.date_naive();
    let local_end_date = local_start_date + Duration::days(days - 1);

    let local_end_naive =
        local_end_date.and_time(NaiveTime::from_hms_opt(23, 59, 59).expect("valid hms"));
    let local_end = match tz.from_local_datetime(&local_end_naive) {
        chrono::LocalResult::Single(dt) | chrono::LocalResult::Ambiguous(_, dt) => dt,
        chrono::LocalResult::None => {
            // DST 间隙：回退到该日 UTC 映射的安全时刻
            Utc.from_utc_datetime(&local_end_naive).with_timezone(&tz)
        }
    };

    let expires_at_utc = local_end.with_timezone(&Utc);
    PackageExpiryResult {
        expires_at_utc,
        expires_at_utc_naive: expires_at_utc.format("%Y-%m-%d %H:%M:%S").to_string(),
        local_end_date: local_end_date.format("%Y-%m-%d").to_string(),
        local_end_display: local_end.format("%Y-%m-%d %H:%M:%S %z").to_string(),
    }
}

/// 便捷入口：当前 UTC + 天数 + timedisplay 名称。
#[allow(dead_code)]
pub fn compute_package_expires_now(days: i64, timedisplay: &str) -> PackageExpiryResult {
    compute_package_expires_at_utc(&PackageExpiryInput {
        purchased_at_utc: Utc::now(),
        days,
        timedisplay: timedisplay.to_string(),
    })
}

/// 判断给定 UTC 时刻是否已超过套餐到期（存库值为 UTC）。
#[allow(dead_code)]
pub fn is_package_expired(expires_at_utc: DateTime<Utc>, now_utc: DateTime<Utc>) -> bool {
    now_utc > expires_at_utc
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn one_day_package_ends_local_midnight_minus_one_sec() {
        // 购买：2026-07-18 02:00:00 UTC = 2026-07-18 10:00 Asia/Shanghai
        let purchased = Utc.with_ymd_and_hms(2026, 7, 18, 2, 0, 0).unwrap();
        let r = compute_package_expires_at_utc(&PackageExpiryInput {
            purchased_at_utc: purchased,
            days: 1,
            timedisplay: "Asia/Shanghai".into(),
        });
        // 本地 2026-07-18 23:59:59+08 = UTC 2026-07-18 15:59:59
        assert_eq!(r.local_end_date, "2026-07-18");
        assert_eq!(
            r.expires_at_utc,
            Utc.with_ymd_and_hms(2026, 7, 18, 15, 59, 59).unwrap()
        );
    }

    #[test]
    fn seven_day_package_spans_local_calendar() {
        let purchased = Utc.with_ymd_and_hms(2026, 7, 18, 2, 0, 0).unwrap();
        let r = compute_package_expires_at_utc(&PackageExpiryInput {
            purchased_at_utc: purchased,
            days: 7,
            timedisplay: "Asia/Shanghai".into(),
        });
        assert_eq!(r.local_end_date, "2026-07-24");
        assert_eq!(
            r.expires_at_utc,
            Utc.with_ymd_and_hms(2026, 7, 24, 15, 59, 59).unwrap()
        );
    }

    #[test]
    fn utc_user_ends_same_utc_day() {
        let purchased = Utc.with_ymd_and_hms(2026, 7, 18, 10, 0, 0).unwrap();
        let r = compute_package_expires_at_utc(&PackageExpiryInput {
            purchased_at_utc: purchased,
            days: 1,
            timedisplay: "UTC".into(),
        });
        assert_eq!(
            r.expires_at_utc,
            Utc.with_ymd_and_hms(2026, 7, 18, 23, 59, 59).unwrap()
        );
    }
}
