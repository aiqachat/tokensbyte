import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { message } from 'antd';
import { 
  Mail, 
  Phone, 
  Lock, 
  Eye, 
  EyeOff, 
  Loader2, 
  KeyRound 
} from 'lucide-react';
import request from '../../utils/request';
import { useTranslation } from 'react-i18next';
import useSettingsStore from '../../store/settings';
import AuthLayout from '../../layouts/AuthLayout';
import type { AuthMethodOption } from '../../layouts/AuthLayout';

/** 发送成功后的倒计时（秒） */
const CODE_COOLDOWN_SUCCESS = 60;
/** 发送失败后的短冷却，防止连点刷错误弹窗（秒） */
const CODE_COOLDOWN_ERROR = 3;

const ForgotPassword: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { settings } = useSettingsStore();

  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [countdown, setCountdown] = useState(0);
  /** 同步锁：React state 更新前就能挡住连点 */
  const sendingCodeRef = useRef(false);
  /** 冷却截止时间戳：避免 finally 解锁与 countdown state 提交之间的竞态 */
  const cooldownUntilRef = useRef(0);

  // 表单状态值
  const [targetVal, setTargetVal] = useState('');
  const [codeVal, setCodeVal] = useState('');
  const [passwordVal, setPasswordVal] = useState('');
  const [confirmVal, setConfirmVal] = useState('');
  const [activeTab, setActiveTab] = useState('');

  // 密码眼睛状态
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // 错误提示
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [shakeKey, setShakeKey] = useState(0);

  const login = settings?.login;
  
  const recoveryTabs: { key: string; label: string; icon: React.ReactNode; placeholder: string }[] = [];
  if (login?.enable_email_login || (!login?.enable_email_login && !login?.enable_mobile_login)) {
    recoveryTabs.push({ 
      key: 'email', 
      label: t('auth.email_recovery'), 
      icon: <Mail className="w-3.5 h-3.5" />, 
      placeholder: t('auth.email_placeholder') 
    });
  }
  if (login?.enable_mobile_login) {
    recoveryTabs.push({ 
      key: 'mobile', 
      label: t('auth.mobile_recovery'), 
      icon: <Phone className="w-3.5 h-3.5" />, 
      placeholder: t('auth.mobile_placeholder') 
    });
  }

  useEffect(() => {
    if (settings && !settings.registration.enable_password_recovery) {
       message.warning(t('auth.registration_disabled'));
       navigate('/login');
    }
    if (recoveryTabs.length > 0 && !activeTab) {
       setActiveTab(recoveryTabs[0].key);
    }
  }, [settings, navigate, t]);

  useEffect(() => {
    setTargetVal('');
    setCodeVal('');
    setPasswordVal('');
    setConfirmVal('');
    // 不重置 countdown：切换找回方式不能绕过冷却
    setErrors({});
  }, [activeTab]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const startCooldown = (seconds: number) => {
    cooldownUntilRef.current = Date.now() + seconds * 1000;
    setCountdown(seconds);
  };

  const isBlocked = () =>
    sendingCodeRef.current || Date.now() < cooldownUntilRef.current || countdown > 0;

  const currentTab = recoveryTabs.find(tab => tab.key === activeTab) || recoveryTabs[0];

  // 发送验证码逻辑（同步锁 + 成功/失败冷却，防连点刷弹窗）
  const onSendCode = async () => {
    if (isBlocked()) return;
    if (!targetVal.trim()) {
      setErrors(prev => ({ ...prev, target: currentTab.key === 'email' ? t('auth.email_required') : t('auth.mobile_required') }));
      setShakeKey(k => k + 1);
      return;
    }
    if (currentTab.key === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetVal.trim())) {
      setErrors(prev => ({ ...prev, target: t('auth.email_invalid') }));
      setShakeKey(k => k + 1);
      return;
    }

    sendingCodeRef.current = true;
    setSendingCode(true);
    setErrors(prev => ({ ...prev, target: '' }));
    try {
      if (currentTab.key === 'email') {
        await request.post('/auth/send-code', { email: targetVal.trim(), purpose: 'reset_password' }, { skipErrorHandler: true } as any);
      } else {
        await request.post('/auth/send-sms-code', { mobile: targetVal.trim(), purpose: 'reset_password' }, { skipErrorHandler: true } as any);
      }
      message.success(t('auth.code_sent'));
      startCooldown(CODE_COOLDOWN_SUCCESS);
    } catch (error: any) {
      message.error(error.response?.data?.error?.message || t('common.error'));
      startCooldown(CODE_COOLDOWN_ERROR);
    } finally {
      sendingCodeRef.current = false;
      setSendingCode(false);
    }
  };

  const handleTabChange = (key: string) => {
    setActiveTab(key);
  };

  // 重置密码提交逻辑
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    // 行内校验
    const tempErrors: Record<string, string> = {};
    if (!targetVal.trim()) {
      tempErrors.target = currentTab.key === 'email' ? t('auth.email_required') : t('auth.mobile_required');
    } else if (currentTab.key === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetVal.trim())) {
      tempErrors.target = t('auth.email_invalid');
    }
    if (!codeVal.trim()) {
      tempErrors.code = t('auth.code_required');
    }
    if (!passwordVal) {
      tempErrors.password = t('auth.new_password_required');
    }
    if (!confirmVal) {
      tempErrors.confirm = t('auth.confirm_password_required');
    } else if (passwordVal !== confirmVal) {
      tempErrors.confirm = t('auth.passwords_not_match');
    }

    if (Object.keys(tempErrors).length > 0) {
      setErrors(tempErrors);
      setShakeKey(k => k + 1); // 触发抖动
      return;
    }
    setErrors({});
    setLoading(true);

    try {
      const payload: any = {
        code: codeVal.trim(),
        new_password: passwordVal,
      };
      if (currentTab.key === 'email') {
        payload.email = targetVal.trim();
      } else {
        payload.mobile = targetVal.trim();
      }
      await request.post('/auth/reset-password', payload, { skipErrorHandler: true } as any);
      message.success(t('auth.reset_password_success'));
      navigate('/login');
    } catch (error: any) {
      message.error(error.response?.data?.error?.message || t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  const layoutMethods: AuthMethodOption[] = recoveryTabs.map(tab => ({ key: tab.key, label: tab.label, icon: tab.icon }));

  const bottomLinks = (
    <Link to="/login" className="!text-zinc-900 dark:!text-zinc-100 hover:underline transition-colors font-medium text-xs">
      {t('auth.back_to_login')}
    </Link>
  );

  return (
    <AuthLayout
      title={t('auth.reset_password_title')}
      subtitle={t('auth.reset_password_subtitle')}
      loading={!settings}
      methodsLabel={t('auth.recovery_method')}
      methods={recoveryTabs.length > 1 ? layoutMethods : undefined}
      activeMethod={activeTab}
      onMethodChange={handleTabChange}
      bottomLinks={bottomLinks}
    >
      {activeTab && (
        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* 选项切换（在有多个找回方式时） */}
          {recoveryTabs.length > 1 && (
            <div className="grid w-full grid-cols-2 gap-1 p-1 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200/50 dark:border-zinc-800/40 rounded-lg text-xs font-medium text-zinc-500 select-none">
              {recoveryTabs.map(tab => {
                const isSelected = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => handleTabChange(tab.key)}
                    className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md transition-all duration-200 cursor-pointer
                      ${isSelected 
                        ? 'bg-background text-zinc-900 dark:text-zinc-100 shadow-xs border border-zinc-200/50 dark:border-zinc-800/60 font-semibold' 
                        : 'hover:text-zinc-800 dark:hover:text-zinc-200'
                      }`}
                  >
                    {tab.icon}
                    <span>{tab.label.replace('找回', '')}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* 账号（邮箱/手机）输入字段 */}
          <div className="space-y-1.5 text-left">
            <label className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
              {currentTab.label}
            </label>
            <input
              type={currentTab.key === 'email' ? 'email' : 'tel'}
              placeholder={currentTab.placeholder}
              value={targetVal}
              onChange={(e) => {
                setTargetVal(e.target.value);
                if (errors.target) setErrors(prev => ({ ...prev, target: '' }));
              }}
              className={`flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs transition-all duration-200 placeholder:text-zinc-400/70 dark:placeholder:text-zinc-600/70 focus-visible:outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50
                ${errors.target ? 'border-destructive focus-visible:ring-destructive focus-visible:border-destructive' : 'border-zinc-200 dark:border-zinc-800 focus-visible:border-zinc-950 dark:focus-visible:border-zinc-300 focus-visible:ring-zinc-950/10 dark:focus-visible:ring-zinc-300/10'}`}
            />
            {errors.target && (
              <p key={`fp-t-${shakeKey}`} className="text-[11px] font-medium text-destructive animate-shake">{errors.target}</p>
            )}
          </div>

          {/* 验证码输入字段 */}
          <div className="space-y-1.5 text-left">
            <label className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
              {t('auth.code_placeholder')}
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder={t('auth.code_placeholder')}
                value={codeVal}
                onChange={(e) => {
                  setCodeVal(e.target.value);
                  if (errors.code) setErrors(prev => ({ ...prev, code: '' }));
                }}
                className={`flex h-9 w-full rounded-md border bg-transparent pl-3 pr-24 py-1 text-sm shadow-xs transition-all duration-200 placeholder:text-zinc-400/70 dark:placeholder:text-zinc-600/70 focus-visible:outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50
                  ${errors.code ? 'border-destructive focus-visible:ring-destructive focus-visible:border-destructive' : 'border-zinc-200 dark:border-zinc-800 focus-visible:border-zinc-950 dark:focus-visible:border-zinc-300 focus-visible:ring-zinc-950/10 dark:focus-visible:ring-zinc-300/10'}`}
              />
              <button
                type="button"
                disabled={countdown > 0 || sendingCode || !targetVal.trim()}
                onClick={onSendCode}
                className={`absolute right-1.5 top-1 h-7 px-2.5 rounded text-[11px] font-semibold border transition-all duration-200 flex items-center justify-center disabled:cursor-not-allowed disabled:opacity-50 disabled:pointer-events-none
                  ${targetVal.trim() && countdown === 0 && !sendingCode
                    ? 'bg-zinc-100 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-50 hover:bg-zinc-200 dark:hover:bg-zinc-800 cursor-pointer' 
                    : 'bg-transparent border-transparent text-zinc-400 dark:text-zinc-600'
                  }`}
              >
                {sendingCode ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : countdown > 0 ? (
                  `${countdown}s`
                ) : (
                  t('auth.send_code')
                )}
              </button>
            </div>
            {errors.code && (
              <p key={`fp-c-${shakeKey}`} className="text-[11px] font-medium text-destructive animate-shake">{errors.code}</p>
            )}
          </div>

          {/* 新密码输入字段 */}
          <div className="space-y-1.5 text-left">
            <label className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
              {t('auth.new_password_placeholder')}
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder={t('auth.new_password_placeholder')}
                value={passwordVal}
                onChange={(e) => {
                  setPasswordVal(e.target.value);
                  if (errors.password) setErrors(prev => ({ ...prev, password: '' }));
                }}
                className={`flex h-9 w-full rounded-md border bg-transparent pl-3 pr-10 py-1 text-sm shadow-xs transition-all duration-200 placeholder:text-zinc-400/70 dark:placeholder:text-zinc-600/70 focus-visible:outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50
                  ${errors.password ? 'border-destructive focus-visible:ring-destructive focus-visible:border-destructive' : 'border-zinc-200 dark:border-zinc-800 focus-visible:border-zinc-950 dark:focus-visible:border-zinc-300 focus-visible:ring-zinc-950/10 dark:focus-visible:ring-zinc-300/10'}`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-1.5 top-1.5 w-6.5 h-6.5 rounded flex items-center justify-center text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-all cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.password && (
              <p key={`fp-p-${shakeKey}`} className="text-[11px] font-medium text-destructive animate-shake">{errors.password}</p>
            )}
          </div>

          {/* 确认新密码输入字段 */}
          <div className="space-y-1.5 text-left">
            <label className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
              {t('auth.confirm_password_placeholder')}
            </label>
            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder={t('auth.confirm_password_placeholder')}
                value={confirmVal}
                onChange={(e) => {
                  setConfirmVal(e.target.value);
                  if (errors.confirm) setErrors(prev => ({ ...prev, confirm: '' }));
                }}
                className={`flex h-9 w-full rounded-md border bg-transparent pl-3 pr-10 py-1 text-sm shadow-xs transition-all duration-200 placeholder:text-zinc-400/70 dark:placeholder:text-zinc-600/70 focus-visible:outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50
                  ${errors.confirm ? 'border-destructive focus-visible:ring-destructive focus-visible:border-destructive' : 'border-zinc-200 dark:border-zinc-800 focus-visible:border-zinc-950 dark:focus-visible:border-zinc-300 focus-visible:ring-zinc-950/10 dark:focus-visible:ring-zinc-300/10'}`}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-1.5 top-1.5 w-6.5 h-6.5 rounded flex items-center justify-center text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-all cursor-pointer"
              >
                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.confirm && (
              <p key={`fp-cp-${shakeKey}`} className="text-[11px] font-medium text-destructive animate-shake">{errors.confirm}</p>
            )}
          </div>

          {/* 极致黑白灰反转重置密码按钮 */}
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center rounded-md text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-1 disabled:pointer-events-none disabled:opacity-50 bg-zinc-900 text-zinc-50 hover:bg-zinc-900/90 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-50/90 shadow-sm h-9 px-4 py-2 w-full cursor-pointer"
          >
            {loading && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {t('auth.reset_password_btn')}
          </button>

        </form>
      )}
    </AuthLayout>
  );
};

export default ForgotPassword;
