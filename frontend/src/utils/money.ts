/** 站点内部金额精度：统一保留 6 位小数（四舍五入）。支付通道对外法币金额仍用 2 位。 */
export const MONEY_DECIMAL_PLACES = 6;

/** 格式化为固定 6 位小数字符串 */
export function formatMoney(n: number | null | undefined): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return (0).toFixed(MONEY_DECIMAL_PLACES);
  return v.toFixed(MONEY_DECIMAL_PLACES);
}

/** 绝对值金额展示（不带符号） */
export function formatMoneyAbs(n: number | null | undefined): string {
  return formatMoney(Math.abs(Number(n) || 0));
}

/** Ant Design InputNumber / Statistic 的 precision */
export const MONEY_INPUT_PRECISION = MONEY_DECIMAL_PLACES;

/** 金额输入校验：最多 6 位小数，允许负数 */
export const MONEY_AMOUNT_PATTERN = /^-?\d+(\.\d{1,6})?$/;
