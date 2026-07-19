import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { message, Spin, Typography } from 'antd';
import { useThemeStore } from '../../store/theme';
const { Title, Text } = Typography;
import { useTranslation } from 'react-i18next';
import {
  Bell,
  Mail,
  Monitor,
  Phone,
  BellOff,
  Settings,
  Wallet,
} from 'lucide-react';
import request from '../../utils/request';
import useSettingsStore from '../../store/settings';
import useAuthStore from '../../store/auth';
import {
  parseNotificationPreferences,
  type NotificationPreferences,
} from '../../utils/notificationPrefs';
import AppSwitch from '../../components/AppSwitch';

/** 停止操作后合并写入的等待时间 */
const SAVE_DEBOUNCE_MS = 550;
/** 「已保存」提示自动消退 */
const SAVED_HINT_MS = 1800;

type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

const NotificationSubscription: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const { settings } = useSettingsStore();
  const { user, setUser } = useAuthStore();
  const { themeMode } = useThemeStore();
  const isLight = themeMode === 'light';
  const subText = isLight ? '#71717a' : '#a1a1aa';
  const mainText = isLight ? '#09090b' : '#fafafa';
  const cardBg = isLight ? '#fff' : '#141414';
  const cardBorder = isLight ? '1px solid #e8e8e8' : '1px solid #303030';
  const listBorder = isLight ? '1px solid #f0f0f0' : '1px solid #303030';

  const defaultThreshold = settings?.notification?.low_balance_threshold ?? 100.0;

  const [preferences, setPreferences] = useState<NotificationPreferences>(
    parseNotificationPreferences(null, defaultThreshold),
  );
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');

  const preferencesRef = useRef(preferences);
  const userRef = useRef(user);
  const debounceTimerRef = useRef<number | null>(null);
  const savedHintTimerRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);
  const dirtyRef = useRef(false);
  const mountedRef = useRef(true);

  const isZh = i18n.language === 'zh';

  useEffect(() => {
    preferencesRef.current = preferences;
  }, [preferences]);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (debounceTimerRef.current != null) window.clearTimeout(debounceTimerRef.current);
      if (savedHintTimerRef.current != null) window.clearTimeout(savedHintTimerRef.current);
    };
  }, []);

  const fetchProfile = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const resp = await (request.get('/user/profile') as any);
      if (!mountedRef.current) return;
      setUser(resp);
      const next = parseNotificationPreferences(resp.notification_preferences, defaultThreshold);
      setPreferences(next);
      preferencesRef.current = next;
    } catch (error) {
      console.error('Failed to fetch profile:', error);
      if (!opts?.silent) {
        message.error(t('common.fetch_failed', '获取信息失败'));
      }
    } finally {
      if (!opts?.silent && mountedRef.current) setLoading(false);
    }
  }, [defaultThreshold, setUser, t]);

  useEffect(() => {
    void fetchProfile();
    // 仅首屏拉取；避免 settings 异步到位时冲掉用户正在编辑的本地状态
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markSavedQuietly = useCallback(() => {
    if (!mountedRef.current) return;
    setSaveStatus('saved');
    if (savedHintTimerRef.current != null) window.clearTimeout(savedHintTimerRef.current);
    savedHintTimerRef.current = window.setTimeout(() => {
      if (mountedRef.current) setSaveStatus('idle');
    }, SAVED_HINT_MS);
  }, []);

  const flushSave = useCallback(async () => {
    if (inFlightRef.current) {
      dirtyRef.current = true;
      return;
    }

    inFlightRef.current = true;
    dirtyRef.current = false;
    if (mountedRef.current) setSaveStatus('saving');

    const snapshot = preferencesRef.current;
    const prefsString = JSON.stringify(snapshot);
    let shouldRetry = false;

    try {
      const updated = await (request.put('/user/profile', { notification_preferences: prefsString }) as any);
      if (!mountedRef.current) return;

      if (updated) {
        setUser(updated);
      } else if (userRef.current) {
        setUser({ ...userRef.current, notification_preferences: prefsString });
      }

      if (dirtyRef.current) {
        shouldRetry = true;
      } else {
        markSavedQuietly();
      }
    } catch (error) {
      console.error('Failed to save preferences:', error);
      if (mountedRef.current) {
        setSaveStatus('error');
        message.error(t('profile.edit_failed', '修改失败'));
        await fetchProfile({ silent: true });
        if (mountedRef.current) setSaveStatus('idle');
      }
    } finally {
      inFlightRef.current = false;
    }

    if (shouldRetry && mountedRef.current) {
      await flushSave();
    }
  }, [fetchProfile, markSavedQuietly, setUser, t]);

  const scheduleSave = useCallback(() => {
    dirtyRef.current = true;
    if (mountedRef.current) setSaveStatus((s) => (s === 'saving' ? s : 'pending'));
    if (debounceTimerRef.current != null) window.clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = window.setTimeout(() => {
      debounceTimerRef.current = null;
      void flushSave();
    }, SAVE_DEBOUNCE_MS);
  }, [flushSave]);

  /** 乐观更新本地偏好，并防抖合并写库 */
  const updatePreference = useCallback(
    (key: keyof NotificationPreferences, value: boolean | number) => {
      setPreferences((prev) => {
        const next = { ...prev, [key]: value };
        preferencesRef.current = next;
        return next;
      });
      scheduleSave();
    },
    [scheduleSave],
  );

  const handleToggle = (key: 'email_notification' | 'sms_notification', currentValue: boolean) => {
    if (key === 'email_notification' && !hasRealEmail) {
      message.warning(isZh ? '请先绑定邮箱账号' : 'Please bind email address first');
      return;
    }
    if (key === 'sms_notification' && !hasRealMobile) {
      message.warning(isZh ? '请先绑定手机账号' : 'Please bind phone number first');
      return;
    }
    updatePreference(key, !currentValue);
  };

  const handleSubscribeDevice = async () => {
    if (!('Notification' in window)) {
      message.error(isZh ? '当前浏览器不支持推送通知' : 'Push notifications are not supported in this browser');
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        message.success(isZh ? '设备订阅成功！' : 'Device subscribed successfully!');
        updatePreference('push_notification', true);
      } else {
        message.warning(
          isZh
            ? '您已拒绝浏览器通知权限，请在浏览器设置中开启'
            : 'Notification permission denied. Please enable in browser settings.',
        );
        if (preferencesRef.current.push_notification) {
          updatePreference('push_notification', false);
        }
      }
    } catch (error) {
      console.error('Push subscription failed:', error);
      message.error(isZh ? '订阅失败' : 'Subscription failed');
    }
  };

  const saveStatusLabel =
    saveStatus === 'pending' || saveStatus === 'saving'
      ? isZh
        ? '保存中…'
        : 'Saving…'
      : saveStatus === 'saved'
        ? isZh
          ? '已保存'
          : 'Saved'
        : saveStatus === 'error'
          ? isZh
            ? '保存失败'
            : 'Save failed'
          : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spin size="large" />
      </div>
    );
  }

  const siteEnabled = settings?.notification?.site_notification_enabled;
  const smsAvailable = settings?.notification?.sms_balance_notification;
  const emailAvailable = settings?.notification?.email_balance_notification;
  const webAvailable = settings?.notification?.web_notification_enabled !== false;
  const pushAvailable = settings?.notification?.push_notification_enabled !== false;
  const dndAvailable = settings?.notification?.do_not_disturb_enabled !== false;

  const hasRealEmail = !!user?.email && !user.email.endsWith('@tokensbyte.local');
  const hasRealMobile = !!user?.mobile;

  if (!siteEnabled) {
    return (
      <div className="max-w-[1200px] mx-auto pt-3 pb-6 md:pt-4 md:pb-10 px-0">
        <div className="bg-white dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 rounded-lg p-8 text-center shadow-sm">
          <p className="text-zinc-500 dark:text-zinc-400">
            {isZh ? '管理员尚未开启通知功能。' : 'Notification services are currently disabled by the administrator.'}
          </p>
        </div>
      </div>
    );
  }

  const channelDisabled = dndAvailable && preferences.do_not_disturb;

  return (
    <div className="max-w-[1200px] mx-auto pt-3 pb-6 md:pt-4 md:pb-10 px-0">
      <div style={{ marginBottom: 32 }}>
        <div className="flex items-baseline gap-3 flex-wrap">
          <Title level={2} style={{ margin: 0, fontWeight: 700, color: mainText, letterSpacing: '-0.025em' }}>
            {t('menu.notifications', '通知订阅')}
          </Title>
          {saveStatusLabel && (
            <span
              className={`text-xs font-medium transition-opacity duration-200 ${
                saveStatus === 'error'
                  ? 'text-red-500'
                  : saveStatus === 'saved'
                    ? 'text-emerald-600 dark:text-emerald-500'
                    : 'text-zinc-400 dark:text-zinc-500'
              }`}
              aria-live="polite"
            >
              {saveStatusLabel}
            </span>
          )}
        </div>
        <Text style={{ color: subText, fontSize: 15, marginTop: 4, display: 'block' }}>
          {isZh
            ? '管理您的个人通知订阅偏好设置。'
            : 'Manage your personal notification subscription preferences.'}
        </Text>
      </div>

      <div
        style={{
          background: cardBg,
          border: cardBorder,
          borderRadius: 8,
          overflow: 'visible',
          boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        }}
      >
        {/* 勿扰模式 — 置顶，开启后屏蔽全部提示 */}
        {dndAvailable && (
        <div
          className="flex flex-col sm:flex-row sm:items-center justify-between py-2.5 px-4 gap-3 hover:bg-zinc-100/30 dark:hover:bg-zinc-800/30 transition-all duration-200"
          style={{ borderBottom: listBorder }}
        >
          <div className="flex items-start gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-full border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 text-zinc-700 dark:text-zinc-300">
              <BellOff className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[14px] font-semibold text-zinc-900 dark:text-zinc-100 leading-normal m-0">
                {isZh ? '勿扰模式' : 'Do Not Disturb'}
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-normal">
                {isZh
                  ? '开启后将屏蔽全部消息提示（站内、邮件、短信、推送）。'
                  : 'When enabled, all message alerts are suppressed (web, email, SMS, push).'}
              </p>
            </div>
          </div>
          <div className="flex items-center self-end sm:self-center">
            <AppSwitch
              checked={preferences.do_not_disturb}
              onChange={(val) => updatePreference('do_not_disturb', val)}
            />
          </div>
        </div>
        )}

        {/* Web */}
        {webAvailable && (
        <div
          className="flex flex-col sm:flex-row sm:items-center justify-between py-2.5 px-4 gap-3 hover:bg-zinc-100/30 dark:hover:bg-zinc-800/30 transition-all duration-200"
          style={{ borderBottom: listBorder }}
        >
          <div className="flex items-start gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-full border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 text-zinc-700 dark:text-zinc-300">
              <Bell className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[14px] font-semibold text-zinc-900 dark:text-zinc-100 leading-normal m-0">Web</div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-normal">
                {isZh ? '在系统控制台面板中接收通知。' : 'Receive notifications in the dashboard.'}
              </p>
            </div>
          </div>
          <div className="flex items-center self-end sm:self-center">
            <AppSwitch
              checked={preferences.web_notification}
              disabled={channelDisabled}
              onChange={(val) => updatePreference('web_notification', val)}
            />
          </div>
        </div>
        )}

        {/* Email */}
        {emailAvailable && (
          <div
            className="flex flex-col sm:flex-row sm:items-center justify-between py-2.5 px-4 gap-3 hover:bg-zinc-100/30 dark:hover:bg-zinc-800/30 transition-all duration-200"
            style={{ borderBottom: listBorder }}
          >
            <div className="flex items-start gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-full border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 text-zinc-700 dark:text-zinc-300">
                <Mail className="h-4 w-4" />
              </div>
              <div>
                <div className="text-[14px] font-semibold text-zinc-900 dark:text-zinc-100 leading-normal m-0">Email</div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-normal">
                  {hasRealEmail ? user?.email : (isZh ? '未绑定邮箱地址。' : 'No email address.')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-center">
              <button
                onClick={() => navigate('/profile')}
                className="p-1 rounded-md border border-zinc-200 dark:border-zinc-800 text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors cursor-pointer"
                title={isZh ? '去绑定/换绑邮箱' : 'Manage Email'}
              >
                <Settings className="h-3.5 w-3.5" />
              </button>
              <AppSwitch
                checked={preferences.email_notification}
                disabled={!hasRealEmail || channelDisabled}
                onChange={() => handleToggle('email_notification', preferences.email_notification)}
              />
            </div>
          </div>
        )}

        {/* Push */}
        {pushAvailable && (
        <div
          className="flex flex-col sm:flex-row sm:items-center justify-between py-2.5 px-4 gap-3 hover:bg-zinc-100/30 dark:hover:bg-zinc-800/30 transition-all duration-200"
          style={{ borderBottom: listBorder }}
        >
          <div className="flex items-start gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-full border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 text-zinc-700 dark:text-zinc-300">
              <Monitor className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <div className="text-[14px] font-semibold text-zinc-900 dark:text-zinc-100 leading-normal m-0">Push</div>
                <span
                  onClick={channelDisabled ? undefined : handleSubscribeDevice}
                  className={`bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 text-[9px] px-1 py-0.5 rounded font-semibold select-none transition-all ${
                    channelDisabled
                      ? 'opacity-40 cursor-not-allowed'
                      : 'cursor-pointer hover:bg-amber-500/20 active:scale-95'
                  }`}
                >
                  {isZh ? '订阅此设备' : 'Subscribe Device'}
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-normal">
                {isZh ? '在桌面设备或移动端接收系统推送通知。' : 'Receive notifications on desktop or mobile.'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-center">
            <button
              onClick={channelDisabled ? undefined : handleSubscribeDevice}
              disabled={channelDisabled}
              className="p-1 rounded-md border border-zinc-200 dark:border-zinc-800 text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              title={isZh ? '订阅此设备' : 'Subscribe Device'}
            >
              <Settings className="h-3.5 w-3.5" />
            </button>
            <AppSwitch
              checked={preferences.push_notification}
              disabled={channelDisabled}
              onChange={(val) => {
                if (val) {
                  handleSubscribeDevice();
                } else {
                  updatePreference('push_notification', false);
                }
              }}
            />
          </div>
        </div>
        )}

        {/* SMS */}
        {smsAvailable && (
          <div
            className="flex flex-col sm:flex-row sm:items-center justify-between py-2.5 px-4 gap-3 hover:bg-zinc-100/30 dark:hover:bg-zinc-800/30 transition-all duration-200"
            style={{ borderBottom: listBorder }}
          >
            <div className="flex items-start gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-full border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 text-zinc-700 dark:text-zinc-300">
                <Phone className="h-4 w-4" />
              </div>
              <div>
                <div className="text-[14px] font-semibold text-zinc-900 dark:text-zinc-100 leading-normal m-0">SMS</div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-normal">
                  {hasRealMobile ? user?.mobile : (isZh ? '未绑定手机号码。' : 'No phone number.')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-center">
              <button
                onClick={() => navigate('/profile')}
                className="p-1 rounded-md border border-zinc-200 dark:border-zinc-800 text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors cursor-pointer"
                title={isZh ? '去绑定/换绑手机' : 'Manage Phone'}
              >
                <Settings className="h-3.5 w-3.5" />
              </button>
              <AppSwitch
                checked={preferences.sms_notification}
                disabled={!hasRealMobile || channelDisabled}
                onChange={() => handleToggle('sms_notification', preferences.sms_notification)}
              />
            </div>
          </div>
        )}

        {/* Low Balance Threshold */}
        {(smsAvailable || emailAvailable) && (
          <div
            className="flex flex-col sm:flex-row sm:items-center justify-between py-2.5 px-4 gap-3 hover:bg-zinc-100/30 dark:hover:bg-zinc-800/30 transition-all duration-200"
          >
            <div className="flex items-start gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-full border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 text-zinc-700 dark:text-zinc-300">
                <Wallet className="h-4 w-4" />
              </div>
              <div>
                <div className="text-[14px] font-semibold text-zinc-900 dark:text-zinc-100 leading-normal m-0">
                  {isZh ? '余额提醒阈值' : 'Low Balance Threshold'}
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-normal">
                  {isZh
                    ? `低于此数值时发送提醒（默认: ${defaultThreshold}）。`
                    : `Alert when balance drops below (default: ${defaultThreshold}).`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-center">
              <input
                type="number"
                min="0"
                step="0.1"
                disabled={channelDisabled}
                className="w-20 px-2 py-0.5 text-xs rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-400/50 dark:focus:ring-zinc-500/50 transition-colors disabled:opacity-40"
                value={preferences.low_balance_threshold}
                onChange={(e) => {
                  const val = parseFloat(e.target.value) || 0;
                  setPreferences((prev) => {
                    const next = { ...prev, low_balance_threshold: val };
                    preferencesRef.current = next;
                    return next;
                  });
                  scheduleSave();
                }}
              />
            </div>
          </div>
        )}
      </div>

      {channelDisabled && (
        <div className="mt-4 p-4 bg-zinc-500/10 border border-zinc-500/20 rounded-lg dark:bg-zinc-100/5 dark:border-zinc-100/15">
          <p className="text-xs text-zinc-700 dark:text-zinc-300 m-0 leading-relaxed">
            {isZh
              ? '勿扰模式已开启：站内通知、邮件、短信与浏览器推送均不会提示。'
              : 'Do Not Disturb is on: web, email, SMS and browser push alerts are all suppressed.'}
          </p>
        </div>
      )}

      {((smsAvailable && !hasRealMobile) || (emailAvailable && !hasRealEmail)) && (
        <div className="mt-4 p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <p className="text-xs text-amber-700 dark:text-amber-400 m-0 leading-relaxed">
            {isZh
              ? '提示：部分通知开关被禁用，是因为您尚未在“基本信息”绑定对应的手机号或邮箱。您可以点击对应行的齿轮按钮去绑定。'
              : 'Tip: Some notification switches are disabled because you have not bound the corresponding phone number or email in "Profile". Click the gear button on the row to bind.'}
          </p>
        </div>
      )}
    </div>
  );
};

export default NotificationSubscription;
