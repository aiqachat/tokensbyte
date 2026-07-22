/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import dayjs, { type Dayjs } from 'dayjs';

type DayjsRange = [Dayjs, Dayjs] | [string, string] | null | undefined;

function asDayjs(v: Dayjs | string): Dayjs | null {
  const d = typeof v === 'string' ? dayjs(v) : v;
  return d?.isValid?.() ? d : null;
}

function rangeEnds(range: DayjsRange): [Dayjs, Dayjs] | null {
  const start = range?.[0] != null ? asDayjs(range[0]) : null;
  const end = range?.[1] != null ? asDayjs(range[1]) : null;
  return start && end ? [start, end] : null;
}

/** RangePicker → 绝对 ISO（日志/充值等半开 timestamptz 过滤）。 */
export function toDateRangeParams(
  range: DayjsRange,
): { start_date?: string; end_date?: string } {
  const ends = rangeEnds(range);
  if (!ends) return {};
  return {
    start_date: ends[0].startOf('day').toISOString(),
    end_date: ends[1].endOf('day').toISOString(),
  };
}

/** 单日 → 绝对 ISO；非法日期返回空串（调用方应先校验）。 */
export function toAbsoluteDateParam(d: Dayjs, endOfDay = false): string {
  const x = asDayjs(d);
  if (!x) return '';
  return (endOfDay ? x.endOf('day') : x.startOf('day')).toISOString();
}

/**
 * 日历日 YYYY-MM-DD：仪表盘/财务日统计/用量同步等走 `calculate_query_slices` /
 * `NaiveDate` 的接口。勿用绝对 ISO，避免浏览器时区与站点 timedisplay 不一致时错日。
 */
export function toCalendarDateRangeParams(
  range: DayjsRange,
): { start_date?: string; end_date?: string } {
  const ends = rangeEnds(range);
  if (!ends) return {};
  return {
    start_date: ends[0].format('YYYY-MM-DD'),
    end_date: ends[1].format('YYYY-MM-DD'),
  };
}

/** 单日日历 YYYY-MM-DD。 */
export function toCalendarDateParam(d: Dayjs): string {
  const x = asDayjs(d);
  return x ? x.format('YYYY-MM-DD') : '';
}

/** 财务列表等 → `start_time` / `end_time`（半开绝对时刻）。 */
export function toTimeRangeParams(
  range: DayjsRange,
): { start_time?: string; end_time?: string } {
  const { start_date, end_date } = toDateRangeParams(range);
  if (!start_date || !end_date) {
    return {};
  }
  return { start_time: start_date, end_time: end_date };
}
