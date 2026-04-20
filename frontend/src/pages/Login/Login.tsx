import React, { useState, useEffect } from 'react';
import { Form, Input, Button, message } from 'antd';
import { UserOutlined, LockOutlined, MobileOutlined, MailOutlined, WechatOutlined, GoogleOutlined } from '@ant-design/icons';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import axios, { AxiosError } from 'axios';
import { useTranslation } from 'react-i18next';
import useAuthStore from '../../store/auth';
import useSettingsStore from '../../store/settings';
import type { User } from '../../types';
import AuthLayout from '../../layouts/AuthLayout';
import type { AuthMethodOption } from '../../layouts/AuthLayout';

interface LoginResponse { token: string; user: User; }

const Login: React.FC = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
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
      try {
        axios.get('/api/v1/user/profile', { headers: { Authorization: `Bearer ${token}` } })
          .then(res => { setUser(res.data); navigate('/'); })
          .catch(() => navigate('/'));
      } catch { navigate('/'); }
    }
  }, [searchParams]);

  const loginTitle = settings?.site?.login_title || settings?.site?.name || 'TokensByte';
  const loginSubtitle = settings?.site?.login_subtitle || 'Next-gen LLM API Gateway';
  const siteLogo = settings?.site?.logo;
  const login = settings?.login;

  const onFinish = async (values: any) => {
    if (loading) return;
    setLoading(true);
    message.destroy();
    try {
      const payload = { ...values, login_type: activeTab };
      const response = await axios.post<LoginResponse>('/api/v1/auth/login', payload);
      const { token, user } = response.data;
      setToken(token);
      setUser(user);
      message.success(t('login.welcome') + ', ' + (user.nickname || user.username));
      navigate('/');
    } catch (error) {
      const axiosError = error as AxiosError<{ error: { message: string } }>;
      message.error(axiosError.response?.data?.error?.message || t('common.error'));
    } finally {
      setTimeout(() => setLoading(false), 800);
    }
  };

  const handleOAuth = (type: 'wechat' | 'google') => {
    window.location.href = `/api/v1/auth/oauth/${type}`;
  };

  const loginTabs: { key: string; label: string; icon: React.ReactNode; placeholder: string }[] = [];
  if (!login || login.enable_username_login) {
    loginTabs.push({ key: 'username', label: '账号登录', icon: <UserOutlined />, placeholder: t('login.username_or_email') });
  }
  if (login?.enable_mobile_login) {
    loginTabs.push({ key: 'mobile', label: '手机号登录', icon: <MobileOutlined />, placeholder: '手机号' });
  }
  if (login?.enable_email_login) {
    loginTabs.push({ key: 'email', label: '邮箱登录', icon: <MailOutlined />, placeholder: '邮箱地址' });
  }

  const [activeTab, setActiveTab] = useState(loginTabs[0]?.key || 'username');
  const currentTab = loginTabs.find(t => t.key === activeTab) || loginTabs[0];

  const layoutMethods: AuthMethodOption[] = loginTabs.map(tab => ({ key: tab.key, label: tab.label, icon: tab.icon }));
  if (login?.enable_wechat_login) layoutMethods.push({ key: 'wechat', label: '微信登录', icon: <WechatOutlined />, onClick: () => handleOAuth('wechat') });
  if (login?.enable_google_login) layoutMethods.push({ key: 'google', label: '谷歌登录', icon: <GoogleOutlined />, onClick: () => handleOAuth('google') });

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
      logo={siteLogo}
      methodsLabel="登录方式"
      methods={layoutMethods}
      activeMethod={activeTab}
      onMethodChange={setActiveTab}
      bottomLinks={bottomLinks}
    >
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
    </AuthLayout>
  );
};

export default Login;
