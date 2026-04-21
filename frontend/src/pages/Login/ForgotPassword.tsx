import React, { useState, useEffect } from 'react';
import { Form, Input, Button, Typography, message, ConfigProvider, theme } from 'antd';
import { MailOutlined, MobileOutlined, LockOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useNavigate, Link } from 'react-router-dom';
import request from '../../utils/request';
import useSettingsStore from '../../store/settings';
import AuthLayout from '../../layouts/AuthLayout';
import type { AuthMethodOption } from '../../layouts/AuthLayout';

const { Text } = Typography;

const ForgotPassword: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { settings } = useSettingsStore();
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [form] = Form.useForm();
  
  const login = settings?.login;
  
  const recoveryTabs: { key: string; label: string; icon: React.ReactNode; placeholder: string }[] = [];
  if (login?.enable_email_login || (!login?.enable_email_login && !login?.enable_mobile_login)) { // Default to email
    recoveryTabs.push({ key: 'email', label: t('auth.email_recovery'), icon: <MailOutlined />, placeholder: t('auth.email_placeholder') });
  }
  if (login?.enable_mobile_login) {
    recoveryTabs.push({ key: 'mobile', label: t('auth.mobile_recovery'), icon: <MobileOutlined />, placeholder: t('auth.mobile_placeholder') });
  }

  const [activeTab, setActiveTab] = useState('');

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
    form.resetFields(['target', 'code']);
    setCountdown(0);
  }, [activeTab]);

  useEffect(() => {
    let timer: any;
    if (countdown > 0) {
      timer = setInterval(() => setCountdown(c => c - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [countdown]);

  if (!settings) {
    return (
      <ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#000' }}>
          <Text type="secondary">{t('common.loading')}</Text>
        </div>
      </ConfigProvider>
    );
  }

  const currentTab = recoveryTabs.find(t => t.key === activeTab) || recoveryTabs[0];

  const onSendCode = async () => {
    const target = form.getFieldValue('target');
    if (!target) {
      message.error(currentTab.key === 'email' ? t('auth.email_required') : t('auth.mobile_required'));
      return;
    }

    setSendingCode(true);
    try {
      if (currentTab.key === 'email') {
        await request.post('/auth/send-code', { email: target, purpose: 'reset_password' });
      } else {
        await request.post('/auth/send-sms-code', { mobile: target, purpose: 'reset_password' });
      }
      message.success(t('auth.code_sent'));
      setCountdown(60);
    } catch (error: any) {
      message.error(error.response?.data?.error?.message || t('common.error'));
    } finally {
      setSendingCode(false);
    }
  };

  const onFinish = async (values: any) => {
    setLoading(true);
    try {
      const payload: any = {
        code: values.code,
        new_password: values.password,
      };
      if (currentTab.key === 'email') {
        payload.email = values.target;
      } else {
        payload.mobile = values.target;
      }
      await request.post('/auth/reset-password', payload);
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
    <Text type="secondary">
      <Link to="/login" style={{ color: '#1677ff' }}>{t('auth.back_to_login')}</Link>
    </Text>
  );

  return (
    <AuthLayout
      title={t('auth.reset_password_title')}
      subtitle={t('auth.reset_password_subtitle')}
      methodsLabel={t('auth.recovery_method')}
      methods={recoveryTabs.length > 1 ? layoutMethods : undefined}
      activeMethod={activeTab}
      onMethodChange={setActiveTab}
      bottomLinks={bottomLinks}
    >
      {activeTab && (
        <Form
          form={form}
          onFinish={onFinish}
          size="large"
        >
          <Form.Item
            name="target"
            rules={[
              { required: true, message: currentTab.key === 'email' ? t('auth.email_required') : t('auth.mobile_required') },
              currentTab.key === 'email' ? { type: 'email', message: t('auth.email_invalid') } : {}
            ]}
          >
            <Input prefix={currentTab.icon} placeholder={currentTab.placeholder} />
          </Form.Item>

          <Form.Item
            name="code"
            rules={[{ required: true, message: t('auth.code_required') }]}
          >
            <Input 
              prefix={<SafetyCertificateOutlined />} 
              placeholder={t('auth.code_placeholder')} 
              suffix={
                <Button type="link" size="small" disabled={countdown > 0} loading={sendingCode} onClick={onSendCode}>
                  {countdown > 0 ? `${countdown}s` : t('auth.send_code')}
                </Button>
              }
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: t('auth.new_password_required') }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder={t('auth.new_password_placeholder')} />
          </Form.Item>

          <Form.Item
            name="confirm"
            dependencies={['password']}
            rules={[
              { required: true, message: t('auth.confirm_password_required') },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error(t('auth.passwords_not_match')));
                },
              }),
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder={t('auth.confirm_password_placeholder')} />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" loading={loading} block>
              {t('auth.reset_password_btn')}
            </Button>
          </Form.Item>
        </Form>
      )}
    </AuthLayout>
  );
};

export default ForgotPassword;
