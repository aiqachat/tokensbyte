import React, { useState, useEffect } from 'react';
import { Form, Input, Button, Typography, message } from 'antd';
import { UserOutlined, LockOutlined, MailOutlined, MobileOutlined, SafetyOutlined } from '@ant-design/icons';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import request from '../../utils/request';
import { useTranslation } from 'react-i18next';
import useAuthStore from '../../store/auth';
import useSettingsStore from '../../store/settings';
import AuthLayout from '../../layouts/AuthLayout';
import type { AuthMethodOption } from '../../layouts/AuthLayout';

const { Text } = Typography;

const Register: React.FC = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const navigate = useNavigate();
  const { setToken, setUser } = useAuthStore();
  const { settings, fetchSettings } = useSettingsStore();
  const [searchParams] = useSearchParams();
  const aff = searchParams.get('aff') || '';
  const team = searchParams.get('team') || '';

  useEffect(() => { if (!settings) fetchSettings(); }, []);
  useEffect(() => {
    if (countdown > 0) { const t = setTimeout(() => setCountdown(c => c - 1), 1000); return () => clearTimeout(t); }
  }, [countdown]);

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
          navigate('/');
        } catch (e: any) {
          message.error(e?.response?.data?.error?.message || '加入团队失败');
          navigate('/');
        }
      })();
    }
  }, [token, team]);

  const reg = settings?.registration;
  const login = settings?.login;
  const siteLogo = settings?.site?.logo;

  const regTabs: { key: string; label: string; icon: React.ReactNode }[] = [];
  if (reg?.enable_username_registration) regTabs.push({ key: 'username', label: t('auth.username_reg'), icon: <UserOutlined /> });
  if (reg?.enable_mobile_registration) regTabs.push({ key: 'mobile', label: t('auth.mobile_reg'), icon: <MobileOutlined /> });
  if (reg?.enable_email_registration) regTabs.push({ key: 'email', label: t('auth.email_reg'), icon: <MailOutlined /> });

  const [activeTab, setActiveTab] = useState('');
  useEffect(() => { if (regTabs.length > 0 && !activeTab) setActiveTab(regTabs[0].key); }, [reg]);

  const noRegistration = regTabs.length === 0;

  const sendEmailCode = async (email: string) => {
    if (countdown > 0) return;
    try {
      await request.post('/auth/send-code', { email, purpose: 'register' }, { skipErrorHandler: true } as any);
      message.success(t('auth.code_sent'));
      setCountdown(60);
    } catch (e: any) {
      message.error(e?.response?.data?.error?.message || t('common.error'));
    }
  };

  const sendSmsCode = async (mobile: string) => {
    if (countdown > 0) return;
    try {
      await request.post('/auth/send-sms-code', { mobile, purpose: 'register' }, { skipErrorHandler: true } as any);
      message.success(t('auth.sms_code_sent'));
      setCountdown(60);
    } catch (e: any) {
      message.error(e?.response?.data?.error?.message || t('common.error'));
    }
  };

  const onFinishUsername = async (values: any) => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await (request.post('/auth/register', { ...values, aff, team: team || undefined }, { skipErrorHandler: true } as any) as any);
      setToken(res.token); setUser(res.user);
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
      const res = await (request.post('/auth/register-email', { email: values.email, code: values.code, password: values.password, aff, team: team || undefined }, { skipErrorHandler: true } as any) as any);
      setToken(res.token); setUser(res.user);
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
      const res = await (request.post('/auth/register-mobile', { mobile: values.mobile, code: values.code, password: values.password, aff, team: team || undefined }, { skipErrorHandler: true } as any) as any);
      setToken(res.token); setUser(res.user);
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
      <Form.Item name="mobile" rules={[{ required: true, message: t('auth.mobile_required') }]}>
        <Input prefix={<MobileOutlined />} placeholder={t('auth.mobile_placeholder')} />
      </Form.Item>
      <Form.Item name="code" rules={[{ required: true, message: t('auth.code_required') }]}>
        <Input prefix={<SafetyOutlined />} placeholder={t('auth.code_placeholder')}
          suffix={<Button type="link" size="small" disabled={countdown > 0}
            onClick={() => { const e = document.querySelector<HTMLInputElement>('input[id="reg_mobile_mobile"]'); if (e?.value) sendSmsCode(e.value); else message.warning(t('auth.mobile_required')); }}>
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

  const layoutMethods: AuthMethodOption[] = regTabs.map(tab => ({ key: tab.key, label: tab.label, icon: tab.icon }));

  const bottomLinks = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Text type="secondary">{t('auth.have_account')}</Text>
      <Link to="/login" style={{ color: '#1677ff' }}>{t('auth.login_link')}</Link>
    </div>
  );

  return (
    <AuthLayout
      title={t('auth.register_title')}
      subtitle={t('auth.register_subtitle')}
      logo={siteLogo}
      loading={!settings}
      methodsLabel={t('auth.register_method')}
      methods={layoutMethods}
      activeMethod={activeTab}
      onMethodChange={setActiveTab}
      bottomLinks={bottomLinks}
    >
      {noRegistration ? (
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <Text type="secondary">{t('auth.registration_disabled')}</Text>
        </div>
      ) : (
        <div style={{ marginTop: 8 }}>
          {tabContent[activeTab]}
        </div>
      )}
    </AuthLayout>
  );
};

export default Register;
