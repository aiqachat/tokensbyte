import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { message } from 'antd';
import { 
  User, 
  Mail, 
  Phone, 
  Lock, 
  Eye, 
  EyeOff, 
  Loader2, 
  ShieldAlert,
  KeyRound
} from 'lucide-react';
import request from '../../utils/request';
import { useTranslation } from 'react-i18next';
import useAuthStore from '../../store/auth';
import useSettingsStore from '../../store/settings';
import AuthLayout from '../../layouts/AuthLayout';
import type { AuthMethodOption } from '../../layouts/AuthLayout';
import { WechatOutlined } from '@ant-design/icons';
import WechatQR from '../../components/WechatQR';
import GoogleIcon from '../../components/GoogleIcon';

/** 发送成功后的倒计时（秒） */
const CODE_COOLDOWN_SUCCESS = 60;
/** 发送失败后的短冷却，防止连点刷错误弹窗（秒） */
const CODE_COOLDOWN_ERROR = 3;

const Register: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [sendingCode, setSendingCode] = useState(false);
  const sendingCodeRef = useRef(false);
  const cooldownUntilRef = useRef(0);
  const [activeTab, setActiveTab] = useState('');
  
  // 密码显示状态
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // 表单状态值
  const [usernameVal, setUsernameVal] = useState('');
  const [passwordVal, setPasswordVal] = useState('');
  const [confirmPasswordVal, setConfirmPasswordVal] = useState('');
  const [emailVal, setEmailVal] = useState('');
  const [mobileVal, setMobileVal] = useState('');
  const [codeVal, setCodeVal] = useState('');

  // 校验错误状态
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [shakeKey, setShakeKey] = useState(0);
  const [agreed, setAgreed] = useState(false);
  const [wechatState, setWechatState] = useState('');

  const navigate = useNavigate();
  const { setToken, setUser } = useAuthStore();
  const { settings, fetchSettings } = useSettingsStore();
  const [searchParams] = useSearchParams();
  
  const getStoredValue = (key: string): string => {
    const stored = localStorage.getItem(key);
    if (stored) {
      try {
        const data = JSON.parse(stored);
        if (Date.now() <= data.expiry) return data.value;
        localStorage.removeItem(key);
      } catch { /* ignore */ }
    }
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${key}=([^;]*)`));
    if (match) return decodeURIComponent(match[1]);
    return '';
  };

  const aff = searchParams.get('aff') || getStoredValue('tokensbyte_affiliate_code');
  const team = searchParams.get('team') || getStoredValue('tokensbyte_team_invite');

  useEffect(() => { 
    if (!settings) fetchSettings(); 
  }, []);

  const getAgreementUrl = (type: 'tos' | 'privacy') => {
    const agreement = settings?.agreement;
    if (!agreement) return '#';
    const isZh = i18n.language.startsWith('zh');
    if (type === 'tos') {
      const mode = isZh ? agreement.tos_mode : agreement.tos_mode_en;
      if (mode === 'link') {
        return isZh ? agreement.tos_link : (agreement.tos_link_en || agreement.tos_link);
      }
      return '/legal/terms';
    } else {
      const mode = isZh ? agreement.privacy_mode : agreement.privacy_mode_en;
      if (mode === 'link') {
        return isZh ? agreement.privacy_link : (agreement.privacy_link_en || agreement.privacy_link);
      }
      return '/legal/privacy';
    }
  };

  useEffect(() => {
    if (countdown > 0) { 
      const timer = setTimeout(() => setCountdown(c => c - 1), 1000); 
      return () => clearTimeout(timer); 
    }
  }, [countdown]);

  const startCooldown = (seconds: number) => {
    cooldownUntilRef.current = Date.now() + seconds * 1000;
    setCountdown(seconds);
  };

  const isBlocked = () =>
    sendingCodeRef.current || Date.now() < cooldownUntilRef.current || countdown > 0;

  // 已登录用户点击团队邀请链接时自动加入团队
  const { token } = useAuthStore();
  useEffect(() => {
    if (token && team) {
      (async () => {
        try {
          const res = await (request.post('/team-marketing/join', { invite_code: team }) as any);
          if (res.status === 'joined') {
            message.success('成功加入团队！');
          } else if (res.status === 'already_member') {
            message.info('您已是该团队成员');
          } else if (res.status === 'already_leader') {
            message.info('您已是该团队负责人');
          }
          navigate('/dashboard');
        } catch (e: any) {
          message.error(e?.response?.data?.error?.message || '加入团队失败');
          navigate('/dashboard');
        }
      })();
    }
  }, [token, team]);

  const reg = settings?.registration;
  const siteLogo = settings?.site?.logo;

  const regTabs: { key: string; label: string; icon: React.ReactNode }[] = [];
  if (reg?.enable_username_registration) {
    regTabs.push({ key: 'username', label: t('auth.username_reg'), icon: <User className="w-3.5 h-3.5" /> });
  }
  if (reg?.enable_mobile_registration) {
    regTabs.push({ key: 'mobile', label: t('auth.mobile_reg'), icon: <Phone className="w-3.5 h-3.5" /> });
  }
  if (reg?.enable_email_registration) {
    regTabs.push({ key: 'email', label: t('auth.email_reg'), icon: <Mail className="w-3.5 h-3.5" /> });
  }

  // 默认 Tab 设置
  useEffect(() => {
    if (regTabs.length > 0 && !activeTab) {
      setActiveTab(regTabs[0].key);
    }
  }, [reg]);

  const noRegistration = regTabs.length === 0;

  // 发送邮箱验证码
  const sendEmailCode = async () => {
    if (isBlocked()) return;
    if (!emailVal.trim()) {
      setErrors(prev => ({ ...prev, email: t('auth.email_required') }));
      setShakeKey(k => k + 1);
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailVal.trim())) {
      setErrors(prev => ({ ...prev, email: t('auth.email_invalid') }));
      setShakeKey(k => k + 1);
      return;
    }

    sendingCodeRef.current = true;
    setSendingCode(true);
    try {
      await request.post('/auth/send-code', { email: emailVal.trim(), purpose: 'register' }, { skipErrorHandler: true } as any);
      message.success(t('auth.code_sent'));
      startCooldown(CODE_COOLDOWN_SUCCESS);
    } catch (e: any) {
      message.error(e?.response?.data?.error?.message || t('common.error'));
      startCooldown(CODE_COOLDOWN_ERROR);
    } finally {
      sendingCodeRef.current = false;
      setSendingCode(false);
    }
  };

  // 发送手机验证码
  const sendSmsCode = async () => {
    if (isBlocked()) return;
    if (!mobileVal.trim()) {
      setErrors(prev => ({ ...prev, mobile: t('auth.mobile_required') }));
      setShakeKey(k => k + 1);
      return;
    }

    sendingCodeRef.current = true;
    setSendingCode(true);
    try {
      await request.post('/auth/send-sms-code', { mobile: mobileVal.trim(), purpose: 'register' }, { skipErrorHandler: true } as any);
      message.success(t('auth.sms_code_sent'));
      startCooldown(CODE_COOLDOWN_SUCCESS);
    } catch (e: any) {
      message.error(e?.response?.data?.error?.message || t('common.error'));
      startCooldown(CODE_COOLDOWN_ERROR);
    } finally {
      sendingCodeRef.current = false;
      setSendingCode(false);
    }
  };

  const handleTabChange = (key: string) => {
    setActiveTab(key);
    setErrors({});
    setShowPassword(false);
    setShowConfirmPassword(false);
    setAgreed(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    // 前端表单校验
    const tempErrors: Record<string, string> = {};
    if (activeTab === 'username') {
      if (!usernameVal.trim()) tempErrors.username = t('auth.username_required');
      else if (usernameVal.trim().length > 48) tempErrors.username = t('auth.username_max_length');
      if (!passwordVal) tempErrors.password = t('auth.password_required');
      if (!confirmPasswordVal) tempErrors.confirm_password = t('auth.confirm_password_required');
      else if (passwordVal !== confirmPasswordVal) tempErrors.confirm_password = t('auth.passwords_not_match');
    } else if (activeTab === 'email') {
      if (!emailVal.trim()) tempErrors.email = t('auth.email_required');
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal.trim())) tempErrors.email = t('auth.email_invalid');
      if (!codeVal.trim()) tempErrors.code = t('auth.code_required');
      if (!passwordVal) tempErrors.password = t('auth.password_required');
      if (!confirmPasswordVal) tempErrors.confirm_password = t('auth.confirm_password_required');
      else if (passwordVal !== confirmPasswordVal) tempErrors.confirm_password = t('auth.passwords_not_match');
    } else if (activeTab === 'mobile') {
      if (!mobileVal.trim()) tempErrors.mobile = t('auth.mobile_required');
      if (!codeVal.trim()) tempErrors.code = t('auth.code_required');
      if (!passwordVal) tempErrors.password = t('auth.password_required');
      if (!confirmPasswordVal) tempErrors.confirm_password = t('auth.confirm_password_required');
      else if (passwordVal !== confirmPasswordVal) tempErrors.confirm_password = t('auth.passwords_not_match');
    }

    const needTos = settings?.agreement?.tos_enabled !== false;
    const needPrivacy = settings?.agreement?.privacy_enabled !== false;
    if ((needTos || needPrivacy) && !agreed) {
      tempErrors.agree = i18n.language.startsWith('zh') ? '您必须阅读并同意协议才能继续' : 'You must agree to the agreement to continue';
    }

    if (Object.keys(tempErrors).length > 0) {
      setErrors(tempErrors);
      setShakeKey(k => k + 1); // 触发抖动
      return;
    }
    setErrors({});
    setLoading(true);

    try {
      let res: any;
      const commonPayload = { password: passwordVal, aff, team: team || undefined };
      
      if (activeTab === 'username') {
        res = await request.post('/auth/register', { username: usernameVal.trim(), ...commonPayload }, { skipErrorHandler: true } as any);
      } else if (activeTab === 'email') {
        res = await request.post('/auth/register-email', { email: emailVal.trim(), code: codeVal.trim(), ...commonPayload }, { skipErrorHandler: true } as any);
      } else if (activeTab === 'mobile') {
        res = await request.post('/auth/register-mobile', { mobile: mobileVal.trim(), code: codeVal.trim(), ...commonPayload }, { skipErrorHandler: true } as any);
      }

      setToken(res.token); 
      setUser(res.user);
      message.success(t('auth.register_success')); 
      navigate('/dashboard');
    } catch (e: any) {
      message.error(e?.response?.data?.error?.message || t('common.error'));
    } finally { 
      setTimeout(() => setLoading(false), 800); 
    }
  };

  const showWechat = settings?.login?.enable_wechat_login;
  const showGoogle = settings?.login?.enable_google_login;

  const wechatAppId = settings?.wechat_oauth_app_id || '';
  const wechatRedirectUri = `${window.location.origin}/api/v1/auth/oauth/wechat/callback` + 
    (aff || team ? `?${new URLSearchParams({ ...(aff ? { aff } : {}), ...(team ? { team } : {}) }).toString()}` : '');

  useEffect(() => {
    if (!showWechat) return;
    let cancelled = false;
    request
      .get('/auth/oauth/state', { params: { provider: 'wechat' }, skipErrorHandler: true } as any)
      .then((res: any) => {
        if (!cancelled && res?.state) setWechatState(res.state);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [showWechat]);

  const handleGoogleLogin = () => {
    const params = new URLSearchParams();
    if (aff) params.set('aff', aff);
    if (team) params.set('team', team);
    const qs = params.toString();
    window.location.href = `/api/v1/auth/oauth/google${qs ? `?${qs}` : ''}`;
  };

  const layoutMethods: AuthMethodOption[] = [];
  if (showWechat) {
    layoutMethods.push({ 
      key: 'wechat', 
      label: '微信扫码注册', 
      icon: <WechatOutlined style={{ fontSize: '18px', color: '#07C160' }} /> 
    });
  }
  if (showGoogle) {
    layoutMethods.push({ 
      key: 'google', 
      label: 'Google 注册', 
      icon: <GoogleIcon className="w-4 h-4" />,
      onClick: handleGoogleLogin
    });
  }
  // 将所有的表单通道以图标形式追加入 layoutMethods
  regTabs.forEach(tab => {
    const isActive = tab.key === activeTab;
    layoutMethods.push({
      key: tab.key,
      label: tab.label,
      icon: React.cloneElement(tab.icon as React.ReactElement<any>, { 
        className: `w-4.5 h-4.5 transition-colors ${
          isActive 
            ? 'text-zinc-900 dark:text-zinc-50 font-semibold' 
            : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
        }` 
      }),
      onClick: () => handleTabChange(tab.key)
    });
  });

  const bottomLinks = (
    <div className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
      <span>{t('auth.have_account')}</span>
      <Link to="/login" className="!text-zinc-900 dark:!text-zinc-100 hover:underline font-medium transition-colors">
        {t('auth.login_link')}
      </Link>
    </div>
  );

  return (
    <AuthLayout
      title={t('auth.register_title')}
      logo={siteLogo}
      loading={!settings}
      methodsLabel={t('auth.register_method')}
      methods={layoutMethods.length > 0 ? layoutMethods : undefined}
      activeMethod={activeTab}
      onMethodChange={handleTabChange}
      bottomLinks={bottomLinks}
    >
      {activeTab === 'wechat' ? (
        <div className="flex flex-col items-center justify-center p-2 bg-background border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xs mt-2">
          {wechatState ? (
            <WechatQR appId={wechatAppId} redirectUri={wechatRedirectUri} state={wechatState} />
          ) : (
            <div className="py-10 text-zinc-500 text-sm">加载中...</div>
          )}
          <button 
            type="button" 
            onClick={() => handleTabChange(regTabs[0]?.key || 'username')}
            className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 mt-2 transition-colors cursor-pointer"
          >
            {i18n.language.startsWith('zh') ? '返回注册方式' : 'Back to registration'}
          </button>
        </div>
      ) : noRegistration ? (
        <div className="flex flex-col items-center justify-center py-6 text-center space-y-2 text-zinc-500">
          <ShieldAlert className="w-10 h-10 text-zinc-400 dark:text-zinc-600" />
          <p className="text-sm font-medium">{t('auth.registration_disabled')}</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">

          {/* 1. 用户名注册输入字段 */}
          {activeTab === 'username' && (
            <div className="space-y-1.5 text-left">
              <label className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
                {t('login.username')}
              </label>
              <input
                type="text"
                placeholder={t('auth.username_placeholder')}
                maxLength={48}
                value={usernameVal}
                onChange={(e) => {
                  setUsernameVal(e.target.value);
                  if (errors.username) setErrors(prev => ({ ...prev, username: '' }));
                }}
                className={`flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs transition-all duration-200 placeholder:text-zinc-400/70 dark:placeholder:text-zinc-600/70 focus-visible:outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50
                  ${errors.username ? 'border-destructive focus-visible:ring-destructive focus-visible:border-destructive' : 'border-zinc-200 dark:border-zinc-800 focus-visible:border-zinc-950 dark:focus-visible:border-zinc-300 focus-visible:ring-zinc-950/10 dark:focus-visible:ring-zinc-300/10'}`}
              />
              {errors.username && (
                <p key={`reg-u-${shakeKey}`} className="text-[11px] font-medium text-destructive animate-shake">{errors.username}</p>
              )}
            </div>
          )}

          {/* 2. 邮箱注册输入字段 */}
          {activeTab === 'email' && (
            <>
              <div className="space-y-1.5 text-left">
                <label className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
                  {t('users.email')}
                </label>
                <input
                  type="email"
                  placeholder={t('auth.email_placeholder')}
                  value={emailVal}
                  onChange={(e) => {
                    setEmailVal(e.target.value);
                    if (errors.email) setErrors(prev => ({ ...prev, email: '' }));
                  }}
                  className={`flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs transition-all duration-200 placeholder:text-zinc-400/70 dark:placeholder:text-zinc-600/70 focus-visible:outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50
                    ${errors.email ? 'border-destructive focus-visible:ring-destructive focus-visible:border-destructive' : 'border-zinc-200 dark:border-zinc-800 focus-visible:border-zinc-950 dark:focus-visible:border-zinc-300 focus-visible:ring-zinc-950/10 dark:focus-visible:ring-zinc-300/10'}`}
                />
                {errors.email && (
                  <p key={`reg-e-${shakeKey}`} className="text-[11px] font-medium text-destructive animate-shake">{errors.email}</p>
                )}
              </div>

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
                    disabled={countdown > 0 || sendingCode || !emailVal.trim()}
                    onClick={sendEmailCode}
                    className={`absolute right-1.5 top-1 h-7 px-2.5 rounded text-[11px] font-semibold border transition-all duration-200 flex items-center justify-center disabled:cursor-not-allowed disabled:opacity-50 disabled:pointer-events-none
                      ${emailVal.trim() && countdown === 0 && !sendingCode
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
                  <p key={`reg-ec-${shakeKey}`} className="text-[11px] font-medium text-destructive animate-shake">{errors.code}</p>
                )}
              </div>
            </>
          )}

          {/* 3. 手机号注册输入字段 */}
          {activeTab === 'mobile' && (
            <>
              <div className="space-y-1.5 text-left">
                <label className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
                  {t('auth.mobile_reg').replace('注册', '')}
                </label>
                <input
                  type="tel"
                  placeholder={t('auth.mobile_placeholder')}
                  value={mobileVal}
                  onChange={(e) => {
                    setMobileVal(e.target.value);
                    if (errors.mobile) setErrors(prev => ({ ...prev, mobile: '' }));
                  }}
                  className={`flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs transition-all duration-200 placeholder:text-zinc-400/70 dark:placeholder:text-zinc-600/70 focus-visible:outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50
                    ${errors.mobile ? 'border-destructive focus-visible:ring-destructive focus-visible:border-destructive' : 'border-zinc-200 dark:border-zinc-800 focus-visible:border-zinc-950 dark:focus-visible:border-zinc-300 focus-visible:ring-zinc-950/10 dark:focus-visible:ring-zinc-300/10'}`}
                />
                {errors.mobile && (
                  <p key={`reg-m-${shakeKey}`} className="text-[11px] font-medium text-destructive animate-shake">{errors.mobile}</p>
                )}
              </div>

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
                    disabled={countdown > 0 || sendingCode || !mobileVal.trim()}
                    onClick={sendSmsCode}
                    className={`absolute right-1.5 top-1 h-7 px-2.5 rounded text-[11px] font-semibold border transition-all duration-200 flex items-center justify-center disabled:cursor-not-allowed disabled:opacity-50 disabled:pointer-events-none
                      ${mobileVal.trim() && countdown === 0 && !sendingCode
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
                  <p key={`reg-mc-${shakeKey}`} className="text-[11px] font-medium text-destructive animate-shake">{errors.code}</p>
                )}
              </div>
            </>
          )}

          {/* 4. 密码输入字段 */}
          <div className="space-y-1.5 text-left">
            <label className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
              {t('auth.password_placeholder')}
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder={t('auth.password_placeholder')}
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
              <p key={`reg-p-${shakeKey}`} className="text-[11px] font-medium text-destructive animate-shake">{errors.password}</p>
            )}
          </div>

          {/* 5. 确认密码输入字段 */}
          <div className="space-y-1.5 text-left">
            <label className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
              {t('auth.confirm_password_placeholder')}
            </label>
            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder={t('auth.confirm_password_placeholder')}
                value={confirmPasswordVal}
                onChange={(e) => {
                  setConfirmPasswordVal(e.target.value);
                  if (errors.confirm_password) setErrors(prev => ({ ...prev, confirm_password: '' }));
                }}
                className={`flex h-9 w-full rounded-md border bg-transparent pl-3 pr-10 py-1 text-sm shadow-xs transition-all duration-200 placeholder:text-zinc-400/70 dark:placeholder:text-zinc-600/70 focus-visible:outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50
                  ${errors.confirm_password ? 'border-destructive focus-visible:ring-destructive focus-visible:border-destructive' : 'border-zinc-200 dark:border-zinc-800 focus-visible:border-zinc-950 dark:focus-visible:border-zinc-300 focus-visible:ring-zinc-950/10 dark:focus-visible:ring-zinc-300/10'}`}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-1.5 top-1.5 w-6.5 h-6.5 rounded flex items-center justify-center text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-all cursor-pointer"
              >
                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.confirm_password && (
              <p key={`reg-cp-${shakeKey}`} className="text-[11px] font-medium text-destructive animate-shake">{errors.confirm_password}</p>
            )}
          </div>

          {/* 注册同意协议勾选框 */}
          {((settings?.agreement?.tos_enabled !== false) || (settings?.agreement?.privacy_enabled !== false)) && (
            <div className="space-y-1 text-left">
              <label className="flex items-start gap-2 text-[12px] text-zinc-500 dark:text-zinc-400 select-none cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => {
                    setAgreed(e.target.checked);
                    if (errors.agree) setErrors(prev => ({ ...prev, agree: '' }));
                  }}
                  className="mt-0.5 h-3.5 w-3.5 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900/10 dark:border-zinc-800 dark:bg-zinc-900 dark:focus:ring-zinc-300/10 cursor-pointer"
                />
                <span className="leading-snug">
                  {i18n.language.startsWith('zh') ? '我已阅读并同意我们的' : 'I have read and agree to our '}
                  {settings?.agreement?.tos_enabled !== false && (
                    <a href={getAgreementUrl('tos')} target="_blank" rel="noopener noreferrer" className="!text-zinc-700 dark:!text-zinc-300 hover:!text-zinc-950 dark:hover:!text-zinc-50 hover:underline font-semibold transition-colors">
                      {i18n.language.startsWith('zh') ? '《服务条款》' : 'Terms of Service'}
                    </a>
                  )}
                  {settings?.agreement?.tos_enabled !== false && settings?.agreement?.privacy_enabled !== false && (
                    <span> {i18n.language.startsWith('zh') ? '和' : 'and'} </span>
                  )}
                  {settings?.agreement?.privacy_enabled !== false && (
                    <a href={getAgreementUrl('privacy')} target="_blank" rel="noopener noreferrer" className="!text-zinc-700 dark:!text-zinc-300 hover:!text-zinc-950 dark:hover:!text-zinc-50 hover:underline font-semibold transition-colors">
                      {i18n.language.startsWith('zh') ? '《隐私协议》' : 'Privacy Policy'}
                    </a>
                  )}
                </span>
              </label>
              {errors.agree && (
                <p key={`reg-ag-${shakeKey}`} className="text-[11px] font-medium text-destructive animate-shake pl-5.5">{errors.agree}</p>
              )}
            </div>
          )}

          {/* 极致黑白灰反转注册按钮 */}
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center rounded-md text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-1 disabled:pointer-events-none disabled:opacity-50 bg-zinc-900 text-zinc-50 hover:bg-zinc-900/90 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-50/90 shadow-sm h-9 px-4 py-2 w-full cursor-pointer"
          >
            {loading && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {t('auth.register_btn')}
          </button>

        </form>
      )}
    </AuthLayout>
  );
};

export default Register;
