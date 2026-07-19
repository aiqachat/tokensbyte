//! timesystem 核心：强制 UTC+0 运行基准与 timedisplay 解析

use chrono::{DateTime, Utc};
use chrono_tz::Tz;

/// 底层系统时区：全局固定 UTC，不可被站点/用户配置覆盖。
pub const TIMESYSTEM_TZ: &str = "UTC";

/// 默认显示时区（仅作 timedisplay 回退，绝不作为 timesystem）。
pub const DEFAULT_TIMEDISPLAY: &str = "Asia/Shanghai";

/// 进程级锁定：强制 `TZ=UTC`，保证 `chrono::Local` / 日志时间与 timesystem 一致。
/// 应在 `main` 最早阶段调用一次。
pub fn enforce_process_utc() {
    // SAFETY: 仅在进程启动早期、尚未创建其它依赖 TZ 的线程前调用。
    unsafe {
        std::env::set_var("TZ", TIMESYSTEM_TZ);
    }
    #[cfg(unix)]
    {
        // 部分 libc 会缓存时区；重新解析当前 TZ。
        extern "C" {
            fn tzset();
        }
        unsafe {
            tzset();
        }
    }
    tracing::info!(
        "[TimeSystem] timesystem locked to {} (UTC+0)",
        TIMESYSTEM_TZ
    );
}

/// 当前 UTC 时刻（唯一允许作为“现在”写入业务逻辑的时钟源）。
#[inline]
#[allow(dead_code)]
pub fn now_utc() -> DateTime<Utc> {
    Utc::now()
}

/// 格式化为 DB 友好的无偏移 UTC 朴素字符串：`YYYY-MM-DD HH:MM:SS`
#[inline]
#[allow(dead_code)]
pub fn format_utc_naive(dt: DateTime<Utc>) -> String {
    dt.format("%Y-%m-%d %H:%M:%S").to_string()
}

#[inline]
pub fn utc_naive_string() -> String {
    format_utc_naive(now_utc())
}

/// 当前 UTC，用于写入 `TIMESTAMPTZ` 列（`DbTs`）。
#[inline]
#[allow(dead_code)]
pub fn utc_db_ts() -> crate::time_system::DbTs {
    crate::time_system::DbTs::now()
}

/// 解析 IANA timedisplay；非法时回退默认显示时区。
pub fn parse_timedisplay(name: &str) -> Tz {
    let trimmed = name.trim();
    if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("local") {
        return DEFAULT_TIMEDISPLAY
            .parse()
            .unwrap_or(chrono_tz::Asia::Shanghai);
    }
    trimmed.parse::<Tz>().unwrap_or_else(|_| {
        tracing::warn!(
            "[TimeSystem] invalid timedisplay '{}', fallback {}",
            trimmed,
            DEFAULT_TIMEDISPLAY
        );
        DEFAULT_TIMEDISPLAY
            .parse()
            .unwrap_or(chrono_tz::Asia::Shanghai)
    })
}

/// timedisplay 优先级：请求头覆盖 > 用户个人时区 > 站点默认 > 内置默认。
pub fn resolve_timedisplay(
    header_tz: Option<&str>,
    user_tz: Option<&str>,
    site_default_tz: Option<&str>,
) -> Tz {
    if let Some(h) = header_tz.map(str::trim).filter(|s| !s.is_empty()) {
        return parse_timedisplay(h);
    }
    if let Some(u) = user_tz.map(str::trim).filter(|s| !s.is_empty()) {
        return parse_timedisplay(u);
    }
    if let Some(s) = site_default_tz.map(str::trim).filter(|s| !s.is_empty()) {
        return parse_timedisplay(s);
    }
    parse_timedisplay(DEFAULT_TIMEDISPLAY)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_prefers_header_then_user_then_site() {
        let tz = resolve_timedisplay(
            Some("America/New_York"),
            Some("Europe/London"),
            Some("Asia/Tokyo"),
        );
        assert_eq!(tz.name(), "America/New_York");

        let tz = resolve_timedisplay(None, Some("Europe/London"), Some("Asia/Tokyo"));
        assert_eq!(tz.name(), "Europe/London");

        let tz = resolve_timedisplay(None, None, Some("Asia/Tokyo"));
        assert_eq!(tz.name(), "Asia/Tokyo");
    }

    #[test]
    fn parse_invalid_falls_back() {
        assert_eq!(parse_timedisplay("Not/AZone").name(), DEFAULT_TIMEDISPLAY);
    }
}
