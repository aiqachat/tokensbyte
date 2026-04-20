import React, { useState, useEffect } from 'react';
import { Card, Form, Input, Button, Typography, Space, message, ConfigProvider, theme, Divider, Tooltip } from 'antd';
import { UserOutlined, LockOutlined, MailOutlined, MobileOutlined, SafetyOutlined, RocketOutlined, WechatOutlined, GoogleOutlined } from '@ant-design/icons';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import axios, { AxiosError } from 'axios';
import { useTranslation } from 'react-i18next';
import useAuthStore from '../../store/auth';
import useSettingsStore from '../../store/settings';

const { Title, Text } = Typography;

const Register: React.FC = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const navigate = useNavigate();
  const { setToken, setUser } = useAuthStore();
  const { settings, fetchSettings } = useSettingsStore();
  const [searchParams] = useSearchParams();
  const aff = searchParams.get('aff') || '';

  useEffect(() => { if (!settings) fetchSettings(); }, []);
  useEffect(() => {
    if (countdown > 0) { const t = setTimeout(() => setCountdown(c => c - 1), 1000); return () => clearTimeout(t); }
  }, [countdown]);

  const reg = settings?.registration;
  const login = settings?.login;
  const siteLogo = settings?.site?.logo;

  const regTabs: { key: string; label: string; icon: React.ReactNode }[] = [];
  if (reg?.enable_username_registration) regTabs.push({ key: 'username', label: t('auth.username_reg'), icon: <UserOutlined /> });
  if (reg?.enable_mobile_registration) regTabs.push({ key: 'mobile', label: '手机号注册', icon: <MobileOutlined /> });
  if (reg?.enable_email_registration) regTabs.push({ key: 'email', label: t('auth.email_reg'), icon: <MailOutlined /> });

  const [activeTab, setActiveTab] = useState('');
  useEffect(() => { if (regTabs.length > 0 && !activeTab) setActiveTab(regTabs[0].key); }, [reg]);

  const noRegistration = regTabs.length === 0;

  const sendEmailCode = async (email: string) => {
    if (countdown > 0) return;
    try {
      await axios.post('/api/v1/auth/send-code', { email, purpose: 'register' });
      message.success(t('auth.code_sent'));
      setCountdown(60);
    } catch (e: any) {
      message.error(e?.response?.data?.error?.message || '发送失败');
    }
  };

  const sendSmsCode = async (mobile: string) => {
    if (countdown > 0) return;
    try {
      await axios.post('/api/v1/auth/send-sms-code', { mobile, purpose: 'register' });
      message.success('验证码已发送');
      setCountdown(60);
    } catch (e: any) {
      message.error(e?.response?.data?.error?.message || '发送失败');
    }
  };

  const onFinishUsername = async (values: any) => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await axios.post('/api/v1/auth/register', { ...values, aff });
      setToken(res.data.token); setUser(res.data.user);
      message.success(t('auth.register_success')); navigate('/');
    } catch (e: any) {
      message.error(e?.response?.data?.error?.message || t('common.error'));
    } finally { setTimeout(() => setLoading(false), 800); }
  };

  const onFinishEmail = async (values: any) => {
    if (loading) return;
    if (values.password !== values.confirm_password) { message.error(t('auth.passwords_not_match')); return; }
    setLoading(true);
    try {
      const res = await axios.post('/api/v1/auth/register-email', { email: values.email, code: values.code, password: values.password, aff });
      setToken(res.data.token); setUser(res.data.user);
      message.success(t('auth.register_success')); navigate('/');
    } catch (e: any) {
      message.error(e?.response?.data?.error?.message || t('common.error'));
    } finally { setTimeout(() => setLoading(false), 800); }
  };

  const onFinishMobile = async (values: any) => {
    if (loading) return;
    if (values.password !== values.confirm_password) { message.error(t('auth.passwords_not_match')); return; }
    setLoading(true);
    try {
      const res = await axios.post('/api/v1/auth/register-mobile', { mobile: values.mobile, code: values.code, password: values.password, aff });
      setToken(res.data.token); setUser(res.data.user);
      message.success(t('auth.register_success')); navigate('/');
    } catch (e: any) {
      message.error(e?.response?.data?.error?.message || t('common.error'));
    } finally { setTimeout(() => setLoading(false), 800); }
  };

  const usernameForm = (
    <Form name="reg_username" size="large" onFinish={onFinishUsername} autoComplete="off">
      <Form.Item name="username" rules={[{ required: true, message: t('auth.username_required') }]}>
        <Input prefix={<UserOutlined />} placeholder={t('auth.username_placeholder')} />
      </Form.Item>
      <Form.Item name="email"><Input prefix={<MailOutlined />} placeholder={t('auth.email_optional')} /></Form.Item>
      <Form.Item name="password" rules={[{ required: true, message: t('auth.password_required') }]}>
        <Input.Password prefix={<LockOutlined />} placeholder={t('auth.password_placeholder')} />
      </Form.Item>
      <Form.Item name="confirm_password" rules={[{ required: true, message: t('auth.confirm_password_required') }]}>
        <Input.Password prefix={<LockOutlined />} placeholder={t('auth.confirm_password_placeholder')} />
      </Form.Item>
      <Form.Item><Button type="primary" htmlType="submit" block loading={loading}>{t('auth.register_btn')}</Button></Form.Item>
    </Form>
  );

  const emailForm = (
    <Form name="reg_email" size="large" onFinish={onFinishEmail} autoComplete="off">
      <Form.Item name="email" rules={[{ required: true, message: t('auth.email_required') }, { type: 'email', message: t('auth.email_invalid') }]}>
        <Input prefix={<MailOutlined />} placeholder={t('auth.email_placeholder')} />
      </Form.Item>
      <Form.Item name="code" rules={[{ required: true, message: t('auth.code_required') }]}>
        <Input prefix={<SafetyOutlined />} placeholder={t('auth.code_placeholder')}
          suffix={<Button type="link" size="small" disabled={countdown > 0}
            onClick={() => { const e = document.querySelector<HTMLInputElement>('input[id="reg_email_email"]'); if (e?.value) sendEmailCode(e.value); else message.warning(t('auth.email_required')); }}>
            {countdown > 0 ? `${countdown}s` : t('auth.send_code')}
          </Button>} />
      </Form.Item>
      <Form.Item name="password" rules={[{ required: true, message: t('auth.password_required') }]}>
        <Input.Password prefix={<LockOutlined />} placeholder={t('auth.password_placeholder')} />
      </Form.Item>
      <Form.Item name="confirm_password" rules={[{ required: true, message: t('auth.confirm_password_required') }]}>
        <Input.Password prefix={<LockOutlined />} placeholder={t('auth.confirm_password_placeholder')} />
      </Form.Item>
      <Form.Item><Button type="primary" htmlType="submit" block loading={loading}>{t('auth.register_btn')}</Button></Form.Item>
    </Form>
  );

  const mobileForm = (
    <Form name="reg_mobile" size="large" onFinish={onFinishMobile} autoComplete="off">
      <Form.Item name="mobile" rules={[{ required: true, message: '请输入手机号' }]}>
        <Input prefix={<MobileOutlined />} placeholder="手机号" />
      </Form.Item>
      <Form.Item name="code" rules={[{ required: true, message: t('auth.code_required') }]}>
        <Input prefix={<SafetyOutlined />} placeholder={t('auth.code_placeholder')}
          suffix={<Button type="link" size="small" disabled={countdown > 0}
            onClick={() => { const e = document.querySelector<HTMLInputElement>('input[id="reg_mobile_mobile"]'); if (e?.value) sendSmsCode(e.value); else message.warning('请输入手机号'); }}>
            {countdown > 0 ? `${countdown}s` : t('auth.send_code')}
          </Button>} />
      </Form.Item>
      <Form.Item name="password" rules={[{ required: true, message: t('auth.password_required') }]}>
        <Input.Password prefix={<LockOutlined />} placeholder={t('auth.password_placeholder')} />
      </Form.Item>
      <Form.Item name="confirm_password" rules={[{ required: true, message: t('auth.confirm_password_required') }]}>
        <Input.Password prefix={<LockOutlined />} placeholder={t('auth.confirm_password_placeholder')} />
      </Form.Item>
      <Form.Item><Button type="primary" htmlType="submit" block loading={loading}>{t('auth.register_btn')}</Button></Form.Item>
    </Form>
  );

  const tabContent: Record<string, React.ReactNode> = { username: usernameForm, email: emailForm, mobile: mobileForm };

  const handleOAuth = (type: 'wechat' | 'google') => {
    window.location.href = `/api/v1/auth/oauth/${type}`;
  };

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
              <Title level={3} style={{ margin: 0 }}>{t('auth.register_title')}</Title>
              <Text type="secondary">{t('auth.register_subtitle')}</Text>
            </Space>
          </div>

          {noRegistration ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <Text type="secondary">{t('auth.registration_disabled')}</Text>
            </div>
          ) : (
            <>
              {tabContent[activeTab]}
            </>
          )}

          <div style={{ textAlign: 'center', marginTop: 8 }}>
            <Text type="secondary">{t('auth.have_account')}</Text>{' '}
            <Link to="/login">{t('auth.login_link')}</Link>
          </div>

          <Divider style={{ margin: '24px 0 16px', color: '#666', fontSize: 12 }}>注册方式</Divider>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
            {regTabs.map(tab => renderIconBtn(tab.key, tab.icon, tab.label, () => setActiveTab(tab.key)))}
          </div>
        </Card>
      </div>
    </ConfigProvider>
  );
};

export default Register;
