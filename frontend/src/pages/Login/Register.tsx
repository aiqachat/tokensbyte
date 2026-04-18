import React, { useState, useEffect } from 'react';
import { Form, Input, Button, Card, Typography, Space, Tabs, message, Tag, ConfigProvider, theme } from 'antd';
import { 
  UserOutlined, 
  LockOutlined, 
  MailOutlined, 
  SafetyCertificateOutlined,
  CheckCircleFilled,
  ArrowRightOutlined 
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import request from '../../utils/request';
import useSettingsStore from '../../store/settings';

const { Title, Text } = Typography;

const Register: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { settings } = useSettingsStore();
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [form] = Form.useForm();
  const [activeTab, setActiveTab] = useState<'username' | 'email'>('username');

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const aff = params.get('aff');
    if (aff) {
      form.setFieldsValue({ aff });
    }
  }, [location, form]);

  useEffect(() => {
    if (settings) {
      if (!settings.registration.enable_username_registration && !settings.registration.enable_email_registration) {
        message.warning(t('auth.registration_disabled'));
        navigate('/login');
      } else if (!settings.registration.enable_username_registration && settings.registration.enable_email_registration) {
        setActiveTab('email');
      }
    }
  }, [settings, navigate, t]);

  useEffect(() => {
    let timer: any;
    if (countdown > 0) {
      timer = setInterval(() => setCountdown(c => c - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [countdown]);

  const onSendCode = async () => {
    try {
      const email = await form.validateFields(['email']);
      setSendingCode(true);
      await request.post('/auth/send-code', { email: email.email, purpose: 'register' });
      message.success(t('auth.code_sent'));
      setCountdown(60);
    } catch (error: any) {
      if (error.errorFields) return;
      message.error(error.response?.data?.error?.message || t('common.error'));
    } finally {
      setSendingCode(false);
    }
  };

  const onFinish = async (values: any) => {
    setLoading(true);
    try {
      if (activeTab === 'email') {
        await request.post('/auth/register-email', {
          email: values.email,
          code: values.code,
          password: values.password,
          aff: values.aff,
        });
      } else {
        await request.post('/auth/register', {
          username: values.username,
          email: values.email || '',
          password: values.password,
          aff: values.aff,
        });
      }
      message.success(t('auth.register_success'));
      navigate('/login');
    } catch (error: any) {
      const rawMsg = error.response?.data?.error?.message || '';
      const errorMap: Record<string, string> = {
        'User already exists': '该用户名已被注册',
        'Email already exists': '该邮箱已被注册',
        'Invalid verification code': '验证码错误或已过期',
        'Username registration is disabled': '用户名注册已关闭',
        'Email registration is disabled': '邮箱注册已关闭',
      };
      message.error(errorMap[rawMsg] || rawMsg || t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  if (!settings) return null;

  return (
    <ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
      <div style={{
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#000',
      backgroundImage: 'radial-gradient(circle at 50% 50%, #1677ff22 0%, #000 100%)',
    }}>
      <Card style={{ 
        width: 'min(400px, 92vw)', 
        borderRadius: 16, 
        background: '#141414', 
        border: '1px solid #303030',
        boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Space direction="vertical">
            <UserOutlined style={{ fontSize: 48, color: '#1677ff' }} />
            <Title level={2} style={{ margin: 0 }}>TokensByte</Title>
            <Text type="secondary">{t('auth.register_title')}</Text>
          </Space>
        </div>

        <Form
          form={form}
          onFinish={onFinish}
          layout="vertical"
          size="large"
        >
            {(settings.registration.enable_username_registration && settings.registration.enable_email_registration) && (
              <Tabs
                activeKey={activeTab}
                onChange={(key) => setActiveTab(key as any)}
                centered
                style={{ marginBottom: 24 }}
                items={[
                  { key: 'username', label: t('auth.username_reg') },
                  { key: 'email', label: t('auth.email_reg') },
                ]}
              />
            )}

            {activeTab === 'username' ? (
              <>
                <Form.Item
                  name="username"
                  rules={[{ required: true, message: t('auth.username_required') }]}
                >
                  <Input 
                    prefix={<UserOutlined />} 
                    placeholder={t('auth.username_placeholder')} 
                  />
                </Form.Item>
                <Form.Item
                  name="email"
                  rules={[{ type: 'email', message: t('auth.email_invalid') }]}
                >
                  <Input 
                    prefix={<MailOutlined />} 
                    placeholder={t('auth.email_optional')} 
                  />
                </Form.Item>
              </>
            ) : (
              <>
                <Form.Item
                  name="email"
                  rules={[{ required: true, type: 'email', message: t('auth.email_required') }]}
                >
                  <Input 
                    prefix={<MailOutlined />} 
                    placeholder={t('auth.email_placeholder')} 
                  />
                </Form.Item>
                <Form.Item
                  name="code"
                  rules={[{ required: true, message: t('auth.code_required') }]}
                >
                  <div style={{ display: 'flex', gap: 12 }}>
                    <Input 
                      prefix={<SafetyCertificateOutlined />} 
                      placeholder={t('auth.code_placeholder')} 
                    />
                    <Button 
                      onClick={onSendCode} 
                      disabled={countdown > 0} 
                      loading={sendingCode}
                      style={{ minWidth: 120 }}
                    >
                      {countdown > 0 ? `${countdown}s` : t('auth.send_code')}
                    </Button>
                  </div>
                </Form.Item>
              </>
            )}

            <Form.Item
              name="password"
              rules={[{ required: true, message: t('auth.password_required') }, { min: 6, message: '密码至少 6 位' }]}
            >
              <Input.Password 
                prefix={<LockOutlined />} 
                placeholder={t('auth.password_placeholder')} 
              />
            </Form.Item>

            <Form.Item
              name="confirm"
              dependencies={['password']}
              rules={[
                { required: true, message: t('auth.confirm_password_required') },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('password') === value) return Promise.resolve();
                    return Promise.reject(new Error(t('auth.passwords_not_match')));
                  },
                }),
              ]}
            >
              <Input.Password 
                prefix={<LockOutlined />} 
                placeholder={t('auth.confirm_password_placeholder')} 
              />
            </Form.Item>

            <Form.Item name="aff" noStyle>
              {({ getFieldValue }) => {
                const aff = getFieldValue('aff');
                return aff ? (
                  <div style={{ 
                    marginBottom: 24, 
                    padding: '12px', 
                    borderRadius: '12px', 
                    background: 'rgba(22, 119, 255, 0.05)',
                    border: '1px dashed rgba(22, 119, 255, 0.3)',
                    textAlign: 'center'
                  }}>
                    <Tag color="cyan" icon={<CheckCircleFilled />} style={{ border: 'none', background: 'transparent', fontSize: 13 }}>
                      您由用户 {aff} 邀请
                    </Tag>
                  </div>
                ) : null;
              }}
            </Form.Item>
            <Form.Item name="aff" hidden>
              <Input />
            </Form.Item>

            <Form.Item style={{ marginBottom: 24 }}>
              <Button 
                type="primary" 
                htmlType="submit" 
                loading={loading} 
                block 
                icon={<ArrowRightOutlined />}
              >
                {t('auth.register_btn')}
              </Button>
            </Form.Item>

            <div style={{ textAlign: 'center' }}>
              <Text type="secondary">
                {t('auth.have_account')} {' '}
                <Link to="/login" style={{ color: '#1677ff', fontWeight: 600 }}>
                  {t('auth.login_link')}
                </Link>
              </Text>
            </div>
        </Form>
      </Card>
      </div>
    </ConfigProvider>
  );
};

export default Register;
