import React, { useState, useEffect } from 'react';
import { Card, Form, Input, Button, Typography, Space, message, ConfigProvider, theme, Divider, Tooltip } from 'antd';
import { UserOutlined, LockOutlined, RocketOutlined, MobileOutlined, MailOutlined, WechatOutlined, GoogleOutlined } from '@ant-design/icons';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import axios, { AxiosError } from 'axios';
import { useTranslation } from 'react-i18next';
import useAuthStore from '../../store/auth';
import useSettingsStore from '../../store/settings';
import type { User } from '../../types';

const { Title, Text } = Typography;

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

  const renderIconBtn = (key: string, icon: React.ReactNode, label: string, onClick: () => void, brandColor?: string) => {
    const isActive = activeTab === key;
    return (
      <Tooltip key={key} title={label}>
        <Button
          shape="circle"
          size="large"
          icon={icon}
          onClick={onClick}
          style={{
            background: isActive ? (brandColor || '#1677ff') : 'transparent',
            borderColor: isActive ? (brandColor || '#1677ff') : (brandColor || '#303030'),
            color: isActive ? '#fff' : (brandColor || '#8c8c8c'),
            transition: 'all 0.3s'
          }}
        />
      </Tooltip>
    );
  };

  return (
    <ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#000', backgroundImage: 'radial-gradient(circle at 50% 50%, #1677ff22 0%, #000 100%)',
      }}>
        <Card style={{
          width: 'min(420px, 92vw)', borderRadius: 16, background: '#141414',
          border: '1px solid #303030', boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)'
        }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <Space direction="vertical" size={4}>
              {siteLogo ? (
                <img src={siteLogo} alt="logo" style={{ width: 48, height: 48, objectFit: 'contain' }} />
              ) : (
                <RocketOutlined style={{ fontSize: 48, color: '#1677ff' }} />
              )}
              <Title level={2} style={{ margin: 0 }}>{loginTitle}</Title>
              <Text type="secondary">{loginSubtitle}</Text>
            </Space>
          </div>

          <Form name="login" size="large" onFinish={onFinish} autoComplete="off">
            <Form.Item name="username" rules={[{ required: true, message: currentTab?.placeholder }]}>
              <Input prefix={currentTab?.icon || <UserOutlined />} placeholder={currentTab?.placeholder || t('login.username_or_email')} />
            </Form.Item>
            <Form.Item name="password" rules={[{ required: true, message: t('login.password') }]}>
              <Input.Password prefix={<LockOutlined />} placeholder={t('login.password')} />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" block loading={loading}>{t('login.sign_in')}</Button>
            </Form.Item>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: -12 }}>
              <Link to="/register">{t('auth.register_link')}</Link>
              <Link to="/forgot-password">{t('auth.forgot_password_link')}</Link>
            </div>
          </Form>

          <Divider style={{ margin: '24px 0 16px', color: '#666', fontSize: 12 }}>登录方式</Divider>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
            {loginTabs.map(tab => renderIconBtn(tab.key, tab.icon, tab.label, () => setActiveTab(tab.key)))}
            {login?.enable_wechat_login && renderIconBtn('wechat', <WechatOutlined />, '微信登录', () => handleOAuth('wechat'), '#07c160')}
            {login?.enable_google_login && renderIconBtn('google', <GoogleOutlined />, '谷歌登录', () => handleOAuth('google'), '#4285f4')}
          </div>
        </Card>
      </div>
    </ConfigProvider>
  );
};

export default Login;
