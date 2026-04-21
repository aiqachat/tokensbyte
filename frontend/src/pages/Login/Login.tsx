import React, { useState, useEffect } from 'react';
import { Form, Input, Button, message } from 'antd';
import { UserOutlined, LockOutlined, MobileOutlined, MailOutlined, WechatOutlined, GoogleOutlined } from '@ant-design/icons';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import request from '../../utils/request';
import { useTranslation } from 'react-i18next';
import useAuthStore from '../../store/auth';
import useSettingsStore from '../../store/settings';
import type { User } from '../../types';
import AuthLayout from '../../layouts/AuthLayout';
import type { AuthMethodOption } from '../../layouts/AuthLayout';
import WechatQR from '../../components/WechatQR';

interface LoginResponse { token: string; user: User; }

const Login: React.FC = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('username');
  const navigate = useNavigate();
  const { setToken, setUser } = useAuthStore();
  const { settings, fetchSettings } = useSettingsStore();
  const [searchParams] = useSearchParams();

  useEffect(() => { if (!settings) fetchSettings(); }, []);

  // OAuth 回调：URL 中带 token 参数时自动登录
  useEffect(() => {
    const token = searchParams.get('token');
    if (token) {
      setToken(token);
      request.get('/user/profile')
        .then((res: any) => { setUser(res); navigate('/'); })
        .catch(() => navigate('/'));
    }
  }, [searchParams, setToken, setUser, navigate]);

  const loginTitle = settings?.site?.login_title || settings?.site?.name || 'TokensByte';
  const loginSubtitle = settings?.site?.login_subtitle || 'Next-gen LLM API Gateway';
  const login = settings?.login;
  const reg = settings?.registration;

  const onFinish = async (values: any) => {
    if (loading) return;
    setLoading(true);
    message.destroy();
    try {
      const res = await (request.post('/auth/login', { ...values, login_type: activeTab }) as any);
      setToken(res.token); setUser(res.user);
      message.success(t('login.welcome') + ', ' + (res.user.nickname || res.user.username));
      navigate('/');
    } catch (error) {
      console.error(error);
    } finally {
      setTimeout(() => setLoading(false), 800);
    }
  };

  const loginTabs: { key: string; label: string; icon: React.ReactNode; placeholder: string }[] = [];
  if (!login || reg?.enable_username_registration || login.enable_username_login)
    loginTabs.push({ key: 'username', label: t('login.username_login'), icon: <UserOutlined />, placeholder: t('login.username_or_email') });
  if (login?.enable_mobile_login)
    loginTabs.push({ key: 'mobile', label: t('login.mobile_login'), icon: <MobileOutlined />, placeholder: t('auth.mobile_placeholder') });
  if (login?.enable_email_login)
    loginTabs.push({ key: 'email', label: t('login.email_login'), icon: <MailOutlined />, placeholder: t('auth.email_placeholder') });

  const currentTab = loginTabs.find(t => t.key === activeTab) || loginTabs[0];

  const layoutMethods: AuthMethodOption[] = loginTabs.map(tab => ({ key: tab.key, label: tab.label, icon: tab.icon }));
  if (login?.enable_wechat_login)
    layoutMethods.push({ key: 'wechat', label: t('login.wechat_login'), icon: <WechatOutlined /> });
  if (login?.enable_google_login)
    layoutMethods.push({ key: 'google', label: t('login.google_login'), icon: <GoogleOutlined />, onClick: () => { window.location.href = '/api/v1/auth/oauth/google'; } });

  const wechatAppId = settings?.wechat_oauth?.app_id || '';
  const wechatRedirectUri = `${window.location.origin}/api/v1/auth/oauth/wechat/callback`;
  // state 每次切换到微信 tab 时固定前缀+随机串，确保每次扫码有新 state
  const [wechatState] = useState(() => `wechat_${Math.random().toString(36).slice(2)}`);

  const bottomLinks = (
    <>
      <Link to="/register" style={{ color: '#8c8c8c' }}>{t('auth.register_link')}</Link>
      <span style={{ color: '#444' }}>|</span>
      <Link to="/forgot-password" style={{ color: '#8c8c8c' }}>{t('auth.forgot_password_link')}</Link>
    </>
  );

  return (
    <AuthLayout
      title={loginTitle}
      subtitle={loginSubtitle}
      logo={settings?.site?.logo}
      loading={!settings}
      methodsLabel={t('login.title')}
      methods={layoutMethods}
      activeMethod={activeTab}
      onMethodChange={setActiveTab}
      bottomLinks={bottomLinks}
    >
      {activeTab === 'wechat' ? (
        <div style={{ textAlign: 'center', padding: '12px 0' }}>
          <WechatQR appId={wechatAppId} redirectUri={wechatRedirectUri} state={wechatState} />
        </div>
      ) : (
        <Form name="login" size="large" onFinish={onFinish} autoComplete="off">
          <Form.Item name="username" rules={[{ required: true, message: currentTab?.placeholder }]}>
            <Input prefix={currentTab?.icon || <UserOutlined />} placeholder={currentTab?.placeholder || t('login.username_or_email')} />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: t('login.password') }]}>
            <Input.Password prefix={<LockOutlined />} placeholder={t('login.password')} />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" block loading={loading}>{t('login.sign_in')}</Button>
          </Form.Item>
        </Form>
      )}
    </AuthLayout>
  );
};

export default Login;
