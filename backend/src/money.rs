//! 站点内部账本金额精度约定：一律保留小数点后 6 位（四舍五入）。
//!
//! 适用范围：余额、赠送金、日志 cost、预扣/结算扣费、充值调账、额度用量等。
//! 不适用：支付通道对外金额（微信/支付宝等仍按对方要求保留分，即 2 位）。

/// 金额小数位数
pub const MONEY_DECIMAL_PLACES: u32 = 6;

/// 缩放因子：10^6
pub const MONEY_SCALE: f64 = 1_000_000.0;

/// 四舍五入到 6 位小数
#[inline]
pub fn round_money(v: f64) -> f64 {
    if !v.is_finite() {
        return 0.0;
    }
    (v * MONEY_SCALE).round() / MONEY_SCALE
}

#[cfg(test)]
mod tests {
    use super::round_money;

    #[test]
    fn rounds_to_six_decimals() {
        assert!((round_money(1.2345674) - 1.234567).abs() < 1e-12);
        assert!((round_money(1.2345675) - 1.234568).abs() < 1e-12);
        assert!((round_money(0.0000004) - 0.0).abs() < 1e-12);
        assert!((round_money(0.0000005) - 0.000001).abs() < 1e-12);
    }
}
