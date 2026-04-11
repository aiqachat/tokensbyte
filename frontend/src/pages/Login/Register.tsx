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
      message.error(error.response?.data?.error || t('common.error'));
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
      message.error(error.response?.data?.error || t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  if (!settings) return null;

  const glassStyle: React.CSSProperties = {
    background: 'rgba(255, 255, 255, 0.7)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderRadius: '24px',
    border: '1px solid rgba(255, 255, 255, 0.3)',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.15)',
    padding: '40px 32px',
    width: '100%',
    maxWidth: '440px',
  };

  const containerStyle: React.CSSProperties = {
    minHeight: '100vh',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    padding: '24px',
    position: 'relative',
    overflow: 'hidden'
  };

  const decorationStyle: React.CSSProperties = {
    position: 'absolute',
    width: '600px',
    height: '600px',
    background: 'radial-gradient(circle, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0) 70%)',
    borderRadius: '50%',
    top: '-200px',
    right: '-200px',
    zIndex: 0
  };

  return (
    <div style={containerStyle}>
      <div style={decorationStyle} />
      <div style={{ ...decorationStyle, top: 'auto', bottom: '-200px', right: 'auto', left: '-200px' }} />
      
      <div style={glassStyle}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ 
            display: 'inline-flex', 
            padding: '12px', 
            borderRadius: '16px', 
            background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
            marginBottom: 20,
            boxShadow: '0 10px 15px -3px rgba(99, 102, 241, 0.4)'
          }}>
            <UserOutlined style={{ fontSize: 32, color: '#fff' }} />
          </div>
          <Title level={2} style={{ margin: '0 0 8px', fontSize: 28, fontWeight: 700, color: '#111827' }}>
            {t('auth.register_title')}
          </Title>
          <Text style={{ color: '#4b5563', fontSize: 16 }}>
            {t('auth.register_subtitle')}
          </Text>
        </div>

        <ConfigProvider
          theme={{
            token: {
              borderRadius: 12,
              colorPrimary: '#6366f1',
            },
            components: {
              Input: {
                activeShadow: '0 0 0 2px rgba(99, 102, 241, 0.1)',
                paddingBlock: 12,
              },
              Button: {
                controlHeight: 48,
                fontWeight: 600,
              },
              Tabs: {
                itemSelectedColor: '#6366f1',
                inkBarColor: '#6366f1',
                itemHoverColor: '#4f46e5',
                titleFontSize: 16,
              }
            }
          }}
        >
          <Form
            form={form}
            onFinish={onFinish}
            layout="vertical"
            requiredMark={false}
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
                    prefix={<UserOutlined style={{ color: '#9ca3af', marginRight: 8 }} />} 
                    placeholder={t('auth.username_placeholder')} 
                  />
                </Form.Item>
                <Form.Item
                  name="email"
                  rules={[{ type: 'email', message: t('auth.email_invalid') }]}
                >
                  <Input 
                    prefix={<MailOutlined style={{ color: '#9ca3af', marginRight: 8 }} />} 
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
                    prefix={<MailOutlined style={{ color: '#9ca3af', marginRight: 8 }} />} 
                    placeholder={t('auth.email_placeholder')} 
                  />
                </Form.Item>
                <Form.Item
                  name="code"
                  rules={[{ required: true, message: t('auth.code_required') }]}
                >
                  <div style={{ display: 'flex', gap: 12 }}>
                    <Input 
                      prefix={<SafetyCertificateOutlined style={{ color: '#9ca3af', marginRight: 8 }} />} 
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
                prefix={<LockOutlined style={{ color: '#9ca3af', marginRight: 8 }} />} 
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
                prefix={<LockOutlined style={{ color: '#9ca3af', marginRight: 8 }} />} 
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
                    background: 'rgba(99, 102, 241, 0.05)',
                    border: '1px dashed rgba(99, 102, 241, 0.3)',
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
              <Text style={{ color: '#6b7280' }}>
                {t('auth.have_account')} {' '}
                <Link to="/login" style={{ color: '#6366f1', fontWeight: 600 }}>
                  {t('auth.login_link')}
                </Link>
              </Text>
            </div>
          </Form>
        </ConfigProvider>
      </div>
    </div>
  );
};

export default Register;
