import React, { useState, useEffect } from 'react';
import { Form, Input, Button, Card, Typography, Space, message } from 'antd';
import { MailOutlined, LockOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useNavigate, Link } from 'react-router-dom';
import request from '../../utils/request';
import useSettingsStore from '../../store/settings';

const { Title, Text } = Typography;

const ForgotPassword: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { settings } = useSettingsStore();
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [form] = Form.useForm();

  useEffect(() => {
    // If settings are loaded and password recovery is disabled, redirect
    if (settings && !settings.registration.enable_password_recovery) {
       message.warning(t('auth.registration_disabled'));
       navigate('/login');
    }
  }, [settings, navigate, t]);

  useEffect(() => {
    let timer: any;
    if (countdown > 0) {
      timer = setInterval(() => setCountdown(c => c - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [countdown]);

  if (!settings) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Card bordered={false} style={{ width: 400, borderRadius: 16, textAlign: 'center' }}>
          <Text type="secondary">{t('common.loading')}</Text>
        </Card>
      </div>
    );
  }

  const onSendCode = async () => {
    const email = form.getFieldValue('email');
    if (!email) {
      message.error(t('auth.email_required'));
      return;
    }

    setSendingCode(true);
    try {
      await request.post('/auth/send-code', { email, purpose: 'reset_password' });
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
      await request.post('/auth/reset-password', {
        email: values.email,
        code: values.code,
        new_password: values.password,
      });
      message.success(t('auth.reset_password_success'));
      navigate('/login');
    } catch (error: any) {
      message.error(error.response?.data?.error?.message || t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
      padding: '20px'
    }}>
      <Card bordered={false} style={{ width: 400, borderRadius: 16, boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Title level={2} style={{ marginBottom: 8, color: '#1a1a1a' }}>{t('auth.reset_password_title')}</Title>
          <Text type="secondary">{t('auth.reset_password_subtitle')}</Text>
        </div>

        <Form
          form={form}
          onFinish={onFinish}
          layout="vertical"
        >
          <Form.Item
            name="email"
            rules={[{ required: true, type: 'email', message: t('auth.email_required') }]}
          >
            <Input prefix={<MailOutlined />} placeholder={t('auth.email_placeholder')} size="large" />
          </Form.Item>

          <Form.Item
            name="code"
            rules={[{ required: true, message: t('auth.code_required') }]}
          >
            <Space.Compact style={{ width: '100%' }}>
              <Input 
                prefix={<SafetyCertificateOutlined />} 
                placeholder={t('auth.code_placeholder')} 
                size="large" 
              />
              <Button 
                onClick={onSendCode} 
                disabled={countdown > 0} 
                loading={sendingCode}
                size="large"
                style={{ width: 140 }}
              >
                {countdown > 0 ? `${countdown}s` : t('auth.send_code')}
              </Button>
            </Space.Compact>
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: t('auth.new_password_required') }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder={t('auth.new_password_placeholder')} size="large" />
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
            <Input.Password prefix={<LockOutlined />} placeholder={t('auth.confirm_password_placeholder')} size="large" />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block size="large" style={{ borderRadius: 8, height: 48 }}>
              {t('auth.reset_password_btn')}
            </Button>
          </Form.Item>

          <div style={{ textAlign: 'center' }}>
            <Link to="/login">{t('auth.back_to_login')}</Link>
          </div>
        </Form>
      </Card>
    </div>
  );
};

export default ForgotPassword;
