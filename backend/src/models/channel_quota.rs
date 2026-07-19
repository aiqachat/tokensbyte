//! 渠道分组 / 上游预设共用的日·周·月·总额度判定（-1 = 无限）

/// 周期内有效已用量：跨周期则视为 0
pub fn effective_period_used(used: f64, last_reset: &str, now_key: &str) -> f64 {
    if last_reset != now_key {
        0.0
    } else {
        used
    }
}

/// 是否仍有可用额度（总 / 日 / 周 / 月任一达标则不可用）
#[allow(clippy::too_many_arguments)]
pub fn has_available_quota(
    total_limit: f64,
    total_used: f64,
    daily_limit: f64,
    daily_used: f64,
    last_reset_day: &str,
    now_day: &str,
    weekly_limit: f64,
    weekly_used: f64,
    last_reset_week: &str,
    now_week: &str,
    monthly_limit: f64,
    monthly_used: f64,
    last_reset_month: &str,
    now_month: &str,
) -> bool {
    check_quota_limits(
        total_limit,
        total_used,
        daily_limit,
        daily_used,
        last_reset_day,
        now_day,
        weekly_limit,
        weekly_used,
        last_reset_week,
        now_week,
        monthly_limit,
        monthly_used,
        last_reset_month,
        now_month,
    )
    .is_ok()
}

/// 返回不可用原因；可用则 Ok(())
#[allow(clippy::too_many_arguments)]
pub fn check_quota_limits(
    total_limit: f64,
    total_used: f64,
    daily_limit: f64,
    daily_used: f64,
    last_reset_day: &str,
    now_day: &str,
    weekly_limit: f64,
    weekly_used: f64,
    last_reset_week: &str,
    now_week: &str,
    monthly_limit: f64,
    monthly_used: f64,
    last_reset_month: &str,
    now_month: &str,
) -> Result<(), String> {
    if total_limit >= 0.0 && total_used >= total_limit {
        return Err("总额度已耗尽".to_string());
    }
    if daily_limit >= 0.0 {
        let used = effective_period_used(daily_used, last_reset_day, now_day);
        if used >= daily_limit {
            return Err("今日额度已耗尽".to_string());
        }
    }
    if weekly_limit >= 0.0 {
        let used = effective_period_used(weekly_used, last_reset_week, now_week);
        if used >= weekly_limit {
            return Err("本周额度已耗尽".to_string());
        }
    }
    if monthly_limit >= 0.0 {
        let used = effective_period_used(monthly_used, last_reset_month, now_month);
        if used >= monthly_limit {
            return Err("本月额度已耗尽".to_string());
        }
    }
    Ok(())
}

/// 消费累加（跨日/周/月懒重置）
pub fn consume_quota_sql(table: &str) -> String {
    format!(
        "UPDATE {table} SET \
         quota_used = quota_used + ?, \
         daily_quota_used = CASE WHEN COALESCE(last_reset_day, '') <> ? THEN ? ELSE daily_quota_used + ? END, \
         weekly_quota_used = CASE WHEN COALESCE(last_reset_week, '') <> ? THEN ? ELSE weekly_quota_used + ? END, \
         monthly_quota_used = CASE WHEN COALESCE(last_reset_month, '') <> ? THEN ? ELSE monthly_quota_used + ? END, \
         last_reset_day = ?, \
         last_reset_week = ?, \
         last_reset_month = ?, \
         updated_at = CURRENT_TIMESTAMP \
         WHERE id = ?"
    )
}

/// 退款扣减（仅回退当前周期内已用量）
pub fn refund_quota_sql(table: &str) -> String {
    format!(
        "UPDATE {table} SET \
         quota_used = GREATEST(0, quota_used - ?), \
         daily_quota_used = CASE WHEN COALESCE(last_reset_day, '') = ? THEN GREATEST(0, daily_quota_used - ?) ELSE daily_quota_used END, \
         weekly_quota_used = CASE WHEN COALESCE(last_reset_week, '') = ? THEN GREATEST(0, weekly_quota_used - ?) ELSE weekly_quota_used END, \
         monthly_quota_used = CASE WHEN COALESCE(last_reset_month, '') = ? THEN GREATEST(0, monthly_quota_used - ?) ELSE monthly_quota_used END, \
         updated_at = CURRENT_TIMESTAMP \
         WHERE id = ?"
    )
}

/// 手动清零全部已用量
pub fn reset_quota_sql(table: &str) -> String {
    format!(
        "UPDATE {table} SET \
         quota_used = 0, \
         daily_quota_used = 0, \
         weekly_quota_used = 0, \
         monthly_quota_used = 0, \
         last_reset_day = '', \
         last_reset_week = '', \
         last_reset_month = '', \
         updated_at = CURRENT_TIMESTAMP \
         WHERE id = ?"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unlimited_when_all_neg1() {
        assert!(has_available_quota(
            -1.0,
            999.0,
            -1.0,
            999.0,
            "2026-01-01",
            "2026-07-17",
            -1.0,
            999.0,
            "2026-01",
            "2026-28",
            -1.0,
            999.0,
            "2026-01",
            "2026-07"
        ));
    }

    #[test]
    fn total_exhausted() {
        assert!(!has_available_quota(
            10.0,
            10.0,
            -1.0,
            0.0,
            "",
            "2026-07-17",
            -1.0,
            0.0,
            "",
            "2026-28",
            -1.0,
            0.0,
            "",
            "2026-07"
        ));
        assert!(check_quota_limits(
            10.0,
            10.0,
            -1.0,
            0.0,
            "",
            "2026-07-17",
            -1.0,
            0.0,
            "",
            "2026-28",
            -1.0,
            0.0,
            "",
            "2026-07"
        )
        .is_err());
    }

    #[test]
    fn daily_resets_across_days() {
        assert!(has_available_quota(
            -1.0,
            0.0,
            5.0,
            5.0,
            "2026-07-16",
            "2026-07-17",
            -1.0,
            0.0,
            "",
            "2026-28",
            -1.0,
            0.0,
            "",
            "2026-07"
        ));
        assert!(!has_available_quota(
            -1.0,
            0.0,
            5.0,
            5.0,
            "2026-07-17",
            "2026-07-17",
            -1.0,
            0.0,
            "",
            "2026-28",
            -1.0,
            0.0,
            "",
            "2026-07"
        ));
    }

    #[test]
    fn weekly_resets_across_weeks() {
        assert!(has_available_quota(
            -1.0,
            0.0,
            -1.0,
            0.0,
            "",
            "2026-07-17",
            50.0,
            50.0,
            "2026-27",
            "2026-28",
            -1.0,
            0.0,
            "",
            "2026-07"
        ));
        assert!(!has_available_quota(
            -1.0,
            0.0,
            -1.0,
            0.0,
            "",
            "2026-07-17",
            50.0,
            50.0,
            "2026-28",
            "2026-28",
            -1.0,
            0.0,
            "",
            "2026-07"
        ));
    }

    #[test]
    fn monthly_resets_across_months() {
        assert!(has_available_quota(
            -1.0,
            0.0,
            -1.0,
            0.0,
            "",
            "2026-07-17",
            -1.0,
            0.0,
            "",
            "2026-28",
            100.0,
            100.0,
            "2026-06",
            "2026-07"
        ));
        assert!(!has_available_quota(
            -1.0,
            0.0,
            -1.0,
            0.0,
            "",
            "2026-07-17",
            -1.0,
            0.0,
            "",
            "2026-28",
            100.0,
            100.0,
            "2026-07",
            "2026-07"
        ));
    }
}
