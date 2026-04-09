import React, { useState, useEffect } from 'react';
import { Form, Input, Button, Card, Typography, Space, Tabs, message } from 'antd';
import { UserOutlined, LockOutlined, MailOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useNavigate, Link } from 'react-router-dom';
import request from '../../utils/request';
import useSettingsStore from '../../store/settings';

const { Title, Text } = Typography;

const Register: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { settings } = useSettingsStore();
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [form] = Form.useForm();

  useEffect(() => {
    // If settings are loaded and all registration is disabled, redirect
    if (settings && !settings.registration.enable_username_registration && !settings.registration.enable_email_registration) {
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
      await request.post('/auth/send-code', { email, purpose: 'register' });
      message.success(t('auth.code_sent'));
      setCountdown(60);
    } catch (error: any) {
      message.error(error.response?.data?.error || t('common.error'));
    } finally {
      setSendingCode(false);
    }
  };

  const onFinish = async (values: any) => {
    setLoading(true);
    try {
      if (values.type === 'email') {
        await request.post('/auth/register-email', {
          email: values.email,
          code: values.code,
          password: values.password,
        });
      } else {
        await request.post('/auth/register', {
          username: values.username,
          email: values.email || '',
          password: values.password,
        });
      }
      message.success(t('auth.register_success'));
      navigate('/login');
    } catch (error: any) {
      message.error(error.response?.data?.error || t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  const items = [
    {
      key: 'username',
      label: t('auth.username_reg'),
      hidden: !settings.registration.enable_username_registration,
      children: (
        <Form.Item
          name="username"
          rules={[{ required: true, message: t('auth.username_required') }]}
        >
          <Input prefix={<UserOutlined />} placeholder={t('auth.username_placeholder')} size="large" />
        </Form.Item>
      ),
    },
    {
      key: 'email',
      label: t('auth.email_reg'),
      hidden: !settings.registration.enable_email_registration,
      children: (
        <>
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
        </>
      ),
    },
  ].filter(item => !item.hidden);

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
          <Title level={2} style={{ marginBottom: 8, color: '#1a1a1a' }}>{t('auth.register_title')}</Title>
          <Text type="secondary">{t('auth.register_subtitle')}</Text>
        </div>

        <Form
          form={form}
          onFinish={onFinish}
          initialValues={{ type: items[0]?.key }}
          layout="vertical"
        >
          {items.length > 1 && (
            <Form.Item name="type" noStyle>
              <Tabs 
                items={items} 
                centered 
                activeKey={form.getFieldValue('type')}
                onChange={(key) => form.setFieldValue('type', key)}
                style={{ marginBottom: 16 }}
              />
            </Form.Item>
          )}

          {items.length === 1 && (
             <div style={{ marginBottom: 24 }}>
                {items[0].children}
                <Form.Item name="type" initialValue={items[0].key} hidden>
                   <Input />
                </Form.Item>
             </div>
          )}

          <Form.Item dependencies={['type']} noStyle>
            {({ getFieldValue }) => {
                const type = getFieldValue('type');
                return type === 'username' ? (
                  <Form.Item
                    name="email"
                    rules={[{ type: 'email', message: t('auth.email_invalid') }]}
                  >
                    <Input prefix={<MailOutlined />} placeholder={t('auth.email_optional')} size="large" />
                  </Form.Item>
                ) : null;
            }}
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: t('auth.password_required') }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder={t('auth.password_placeholder')} size="large" />
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
              {t('auth.register_btn')}
            </Button>
          </Form.Item>

          <div style={{ textAlign: 'center' }}>
            <Text type="secondary">
              {t('auth.have_account')} <Link to="/login">{t('auth.login_link')}</Link>
            </Text>
          </div>
        </Form>
      </Card>
    </div>
  );
};

export default Register;
