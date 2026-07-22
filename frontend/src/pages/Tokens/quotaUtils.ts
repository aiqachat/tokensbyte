/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import type { ApiToken } from '../../types';
import { getLocalPeriodKeys } from '../../utils/quotaPeriod';

dayjs.extend(utc);
dayjs.extend(timezone);

export function hasPeriodicLimits(token: Pick<ApiToken, 'daily_quota_limit' | 'weekly_quota_limit' | 'monthly_quota_limit'>) {
  return token.daily_quota_limit >= 0 || token.weekly_quota_limit >= 0 || token.monthly_quota_limit >= 0;
}

/** 优先用后端按用户 timedisplay 填充的当期已用；缺省时按传入时区本地推算 */
export function getPeriodicUsed(token: ApiToken, tz = 'Asia/Shanghai') {
  const keys = getLocalPeriodKeys(tz);
  return {
    dailyUsed:
      token.current_daily_quota_used ??
      (token.last_reset_day === keys.nowDay ? token.daily_quota_used : 0),
    weeklyUsed:
      token.current_weekly_quota_used ??
      (token.last_reset_week === keys.nowWeek ? token.weekly_quota_used : 0),
    monthlyUsed:
      token.current_monthly_quota_used ??
      (token.last_reset_month === keys.nowMonth ? token.monthly_quota_used : 0),
  };
}

function formatDuration(diffMs: number) {
  const days = Math.floor(diffMs / (24 * 3600 * 1000));
  const hours = Math.floor((diffMs % (24 * 3600 * 1000)) / (3600 * 1000));
  const minutes = Math.floor((diffMs % (3600 * 1000)) / (60 * 1000));
  if (days > 0) return `${days}天 ${hours}小时`;
  return `${hours}小时 ${minutes}分钟`;
}

/** 周期重置倒计时：日/月按自然日切；周按周日 00:00（对齐后端 `%Y-%U`） */
export function getQuotaRefreshText(type: 'day' | 'week' | 'month', tz = 'Asia/Shanghai') {
  const nowTime = dayjs().tz(tz);
  if (type === 'day') {
    const next = nowTime.add(1, 'day').startOf('day');
    return formatDuration(next.diff(nowTime));
  }
  if (type === 'week') {
    const dow = nowTime.day(); // 0 = Sunday
    const daysToSunday = dow === 0 ? 7 : 7 - dow;
    const nextSunday = nowTime.add(daysToSunday, 'day').startOf('day');
    return formatDuration(nextSunday.diff(nowTime));
  }
  const nextMonth = nowTime.add(1, 'month').startOf('month');
  return formatDuration(nextMonth.diff(nowTime));
}
