import React, { useState, useEffect } from 'react';
import { Form, Input, Button, Card, Typography, Space, message, ConfigProvider, theme, Divider, Tooltip } from 'antd';
import { MailOutlined, MobileOutlined, LockOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
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
  
  const login = settings?.login;
  
  const recoveryTabs: { key: string; label: string; icon: React.ReactNode; placeholder: string }[] = [];
  if (login?.enable_email_login || (!login?.enable_email_login && !login?.enable_mobile_login)) { // Default to email
    recoveryTabs.push({ key: 'email', label: '邮箱找回', icon: <MailOutlined />, placeholder: t('auth.email_placeholder') });
  }
  if (login?.enable_mobile_login) {
    recoveryTabs.push({ key: 'mobile', label: '手机号找回', icon: <MobileOutlined />, placeholder: '手机号' });
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
      message.error(currentTab.key === 'email' ? t('auth.email_required') : '请输入手机号');
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
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#000',
      backgroundImage: 'radial-gradient(circle at 50% 50%, #1677ff22 0%, #000 100%)',
    }}>
      <Card style={{ 
        width: 'min(420px, 92vw)', 
        borderRadius: 16, 
        background: '#141414', 
        border: '1px solid #303030',
        boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Space direction="vertical">
            <LockOutlined style={{ fontSize: 48, color: '#1677ff' }} />
            <Title level={3} style={{ margin: 0 }}>{t('auth.reset_password_title')}</Title>
            <Text type="secondary">{t('auth.reset_password_subtitle')}</Text>
          </Space>
        </div>

        {activeTab && (
          <Form
            form={form}
            onFinish={onFinish}
            layout="vertical"
            size="large"
          >
            <Form.Item
              name="target"
              rules={[
                { required: true, message: currentTab.key === 'email' ? t('auth.email_required') : '请输入手机号' },
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

            <Form.Item>
              <Button type="primary" htmlType="submit" loading={loading} block>
                {t('auth.reset_password_btn')}
              </Button>
            </Form.Item>

            <div style={{ textAlign: 'center' }}>
              <Text type="secondary">
                <Link to="/login" style={{ color: '#1677ff' }}>{t('auth.back_to_login')}</Link>
              </Text>
            </div>
          </Form>
        )}

        {recoveryTabs.length > 1 && (
          <>
            <Divider style={{ margin: '24px 0 16px', color: '#666', fontSize: 12 }}>找回方式</Divider>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
              {recoveryTabs.map(tab => renderIconBtn(tab.key, tab.icon, tab.label, () => setActiveTab(tab.key)))}
            </div>
          </>
        )}
      </Card>
      </div>
    </ConfigProvider>
  );
};

export default ForgotPassword;
