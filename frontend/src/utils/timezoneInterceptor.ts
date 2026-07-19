import dayjs from 'dayjs';
import { resolveTimedisplay, shouldShowTimezoneSuffix } from './timedisplay';

const originalDayjsFormat = dayjs.prototype.format;
const originalToLocaleString = Date.prototype.toLocaleString;

/** 仅匹配 UI 展示格式，避免改写 dayjs/timezone、RangePicker 的 format→parse 内部串 */
const UI_DATETIME_RE = /^YYYY[-/]MM[-/]DD[ T]HH:mm(:ss)?$/;

function timezoneInfo() {
  return {
    tz: resolveTimedisplay(),
    showSuffix: shouldShowTimezoneSuffix(),
  };
}

function tzLabel(name?: string): string {
  let n = name || 'UTC';
  if (n.startsWith('GMT')) n = n.replace('GMT', 'UTC');
  return n === 'UTC' ? 'UTC+0' : n;
}

function formatParts(date: Date, timeZone: string, locales = 'en-US') {
  const fmt = new Intl.DateTimeFormat(locales, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone,
    timeZoneName: 'shortOffset',
  });
  return Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
}

function withTzSuffix(body: string, timeZoneName: string | undefined, showSuffix: boolean) {
  return showSuffix ? `${body} (${tzLabel(timeZoneName)})` : body;
}

(dayjs.prototype as any).format = function (template?: string): string {
  if (!this.isValid?.() || isNaN(this.toDate().getTime()) || !template || !UI_DATETIME_RE.test(template)) {
    return originalDayjsFormat.call(this, template);
  }
  try {
    const { tz, showSuffix } = timezoneInfo();
    const p = formatParts(this.toDate(), tz);
    const hour = p.hour === '24' ? '00' : p.hour;
    let body = template
      .replace('YYYY', p.year)
      .replace('MM', p.month)
      .replace('DD', p.day)
      .replace('HH', hour)
      .replace('mm', p.minute);
    if (template.endsWith(':ss')) body = body.replace('ss', p.second);
    return withTzSuffix(body, p.timeZoneName, showSuffix);
  } catch (e) {
    console.warn('Failed to format dayjs with timezone:', e);
    return originalDayjsFormat.call(this, template);
  }
};

Date.prototype.toLocaleString = function (this: Date, locales?: any, options?: any): string {
  if (!(this instanceof Date) || isNaN(this.getTime())) {
    return originalToLocaleString.call(this, locales, options);
  }
  if (options?.__interceptor_internal) {
    return originalToLocaleString.call(this, locales, options);
  }
  // 仅显式 year+hour 时装饰；默认/仅 timeZone 走原生（兼容 dayjs.tz、时区列表偏移解析）
  if (!options || options.year === undefined || options.hour === undefined) {
    return originalToLocaleString.call(this, locales, options);
  }
  try {
    const { tz, showSuffix } = timezoneInfo();
    const resolved = {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: tz,
      ...options,
      timeZoneName: 'shortOffset',
      __interceptor_internal: true,
    };
    const fmt = new Intl.DateTimeFormat(locales || 'zh-CN', resolved);
    const p = Object.fromEntries(fmt.formatToParts(this).map((x) => [x.type, x.value]));
    const hour = p.hour === '24' ? '00' : p.hour;
    // 调用方未要秒时不输出秒（与通知列表等 minute 截止的用法一致）
    const body =
      options.second !== undefined
        ? `${p.year}-${p.month}-${p.day} ${hour}:${p.minute}:${p.second}`
        : `${p.year}-${p.month}-${p.day} ${hour}:${p.minute}`;
    return withTzSuffix(body, p.timeZoneName, showSuffix);
  } catch (e) {
    console.warn('Failed to format Date toLocaleString with timezone:', e);
    return originalToLocaleString.call(this, locales, options);
  }
};
