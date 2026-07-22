/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

export interface NotificationPreferences {
  web_notification: boolean;
  email_notification: boolean;
  push_notification: boolean;
  sms_notification: boolean;
  low_balance_threshold: number;
  /** 勿扰模式：开启后屏蔽全部消息提示 */
  do_not_disturb: boolean;
}

/** 站点侧通知能力开关（管理后台配置） */
export interface SiteNotificationFlags {
  web_notification_enabled?: boolean;
  push_notification_enabled?: boolean;
  do_not_disturb_enabled?: boolean;
}

const DEFAULTS: NotificationPreferences = {
  web_notification: true,
  email_notification: false,
  push_notification: false,
  sms_notification: false,
  low_balance_threshold: 100.0,
  do_not_disturb: false,
};

/** 解析用户 notification_preferences JSON（兼容旧 mute_preference） */
export function parseNotificationPreferences(
  raw?: string | null,
  defaultThreshold = 100.0,
): NotificationPreferences {
  if (!raw) {
    return { ...DEFAULTS, low_balance_threshold: defaultThreshold };
  }
  try {
    const prefs = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const muteAll = prefs.mute_preference === 'all';
    return {
      web_notification: prefs.web_notification ?? true,
      email_notification: prefs.email_notification ?? false,
      push_notification: prefs.push_notification ?? false,
      sms_notification: prefs.sms_notification ?? false,
      low_balance_threshold: prefs.low_balance_threshold ?? defaultThreshold,
      do_not_disturb: prefs.do_not_disturb ?? muteAll,
    };
  } catch {
    return { ...DEFAULTS, low_balance_threshold: defaultThreshold };
  }
}

function isDndActive(prefs: NotificationPreferences, site?: SiteNotificationFlags | null): boolean {
  // 管理端关闭勿扰能力时，不生效用户勿扰
  if (site?.do_not_disturb_enabled === false) return false;
  return prefs.do_not_disturb;
}

/** 是否在控制台展示站内通知（铃铛 / Banner） */
export function shouldShowWebNotifications(
  prefs: NotificationPreferences,
  site?: SiteNotificationFlags | null,
): boolean {
  if (site?.web_notification_enabled === false) return false;
  return !isDndActive(prefs, site) && prefs.web_notification;
}

/** 是否允许浏览器 Push 提示 */
function shouldShowBrowserPush(
  prefs: NotificationPreferences,
  site?: SiteNotificationFlags | null,
): boolean {
  if (site?.push_notification_enabled === false) return false;
  return !isDndActive(prefs, site) && prefs.push_notification;
}

/** 有新公告时尝试弹出系统通知（需已授权） */
export function maybeShowBrowserPush(
  title: string,
  body: string,
  prefs: NotificationPreferences,
  site?: SiteNotificationFlags | null,
) {
  if (!shouldShowBrowserPush(prefs, site)) return;
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, silent: false });
  } catch {
    // ignore
  }
}
