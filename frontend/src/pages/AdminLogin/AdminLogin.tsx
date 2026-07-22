/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import React, { useState, useEffect } from 'react';
import { Form, Input, Button, Typography, Space, message, ConfigProvider, Card } from 'antd';
import { SafetyCertificateOutlined, UnlockOutlined, SecurityScanOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios, { AxiosError } from 'axios';
import useAuthStore from '../../store/auth';
import type { User } from '../../types';

const { Title, Text } = Typography;

interface LoginResponse {
  token: string;
  user: User;
}

const AdminLogin: React.FC = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [glitch, setGlitch] = useState(false);
  const [isInitialized, setIsInitialized] = useState<boolean>(true);

  const navigate = useNavigate();
  const { token, user, setToken, setUser } = useAuthStore();

  // 检查系统是否有管理员初始化
  useEffect(() => {
    const checkInitStatus = async () => {
      try {
        const response = await axios.get<{ initialized: boolean }>('/api/v1/auth/admin/init-status');
        setIsInitialized(response.data.initialized);
      } catch (err) {
        console.error('Failed to check admin init status', err);
      }
    };
    checkInitStatus();
  }, []);

  // 如果管理员已登录，直接跳转到控制台页面
  useEffect(() => {
    if (token && user?.role === 'admin') {
      const adminPath = localStorage.getItem('tokensbyte_admin_path') || 'admin1688';
      navigate(`/${adminPath}/dashboard`, { replace: true });
    }
  }, [token, user, navigate]);

  useEffect(() => {
    const interval = setInterval(() => {
      setGlitch(true);
      setTimeout(() => setGlitch(false), 200);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // 正常管理员登录
  const onLoginFinish = async (values: unknown) => {
    setLoading(true);
    try {
      const response = await axios.post<LoginResponse>('/api/v1/auth/admin/login', values);
      const { token, user } = response.data;
      
      if (user.role !== 'admin') {
        message.error('ACCESS DENIED: INSUFFICIENT PRIVILEGES');
        return;
      }

      setToken(token);
      setUser(user);
      message.success(t('auth.admin_success') || 'AUTHENTICATION SUCCESSFUL. WELCOME, OPERATOR.');
      const adminPath = localStorage.getItem('tokensbyte_admin_path') || 'admin1688';
      navigate(`/${adminPath}/dashboard`);
    } catch (error) {
      console.error(error);
      const axiosError = error as AxiosError<{ error: { message: string } }>;
      message.error(axiosError.response?.data?.error?.message || 'CRITICAL FAILURE: AUTH_TIMEOUT');
    } finally {
      setLoading(false);
    }
  };

  // 首次初始化创建超级管理员
  const onInitFinish = async (values: any) => {
    if (values.password !== values.confirmPassword) {
      message.error('两次输入的密码不一致');
      return;
    }
    setLoading(true);
    try {
      const response = await axios.post<LoginResponse>('/api/v1/auth/admin/init', {
        username: values.username,
        password: values.password,
      });
      const { token, user } = response.data;
      setToken(token);
      setUser(user);
      message.success('超级管理员初始化成功！欢迎登录。');
      setIsInitialized(true);
      const adminPath = localStorage.getItem('tokensbyte_admin_path') || 'admin1688';
      navigate(`/${adminPath}/dashboard`);
    } catch (error) {
      console.error(error);
      const axiosError = error as AxiosError<{ error: { message: string } }>;
      message.error(axiosError.response?.data?.error?.message || '初始化失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#00ff41',
          colorBgContainer: '#0a0a0a',
          colorText: '#00ff41',
          colorBorder: '#00ff41',
          fontFamily: 'monospace',
        },
      }}
    >
      <div style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#000',
        overflow: 'hidden',
        position: 'relative',
        color: '#00ff41'
      }}>
        {/* Background Scanlines */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06))',
          backgroundSize: '100% 2px, 3px 100%',
          pointerEvents: 'none',
          zIndex: 1
        }} />

        <div style={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          top: 0,
          left: 0,
          opacity: 0.05,
          pointerEvents: 'none',
          backgroundImage: 'url("https://www.transparenttextures.com/patterns/carbon-fibre.png")',
          zIndex: 0
        }} />

        <Card 
          style={{ 
            width: 450, 
            borderRadius: 0, 
            backgroundColor: 'rgba(10, 10, 10, 0.9)', 
            border: '2px solid #00ff41',
            boxShadow: glitch ? '0 0 30px #00ff41, 5px 0 10px rgba(255,0,0,0.5), -5px 0 10px rgba(0,0,255,0.5)' : '0 0 20px #00ff41',
            zIndex: 2,
            transition: 'all 0.1s ease-in-out',
            transform: glitch ? 'translate(2px, -1px) scale(1.005)' : 'none'
          }}
          styles={{ body: { padding: '40px' } }}
        >
          <div style={{ textAlign: 'center', marginBottom: 30 }}>
            <Space direction="vertical" align="center">
              <div style={{ position: 'relative' }}>
                <SafetyCertificateOutlined style={{ fontSize: 64, color: '#00ff41', marginBottom: 16 }} />
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  background: 'linear-gradient(transparent, #00ff41, transparent)',
                  animation: 'scanner 2s linear infinite',
                  opacity: 0.3
                }} />
              </div>
              <Title level={3} style={{ margin: 0, color: '#00ff41', letterSpacing: '3px', textShadow: '0 0 10px #00ff41' }}>
                {isInitialized ? 'ADMIN_SYS_ACCESS' : 'INITIALIZE_SUPER_ADMIN'}
              </Title>
              <Text style={{ color: '#00ff41', fontSize: '11px', opacity: 0.85 }}>
                {isInitialized
                  ? `V.0.7.5.5 // SECURE_ESTABLISHMENT // ${new Date().toISOString().slice(0, 10)}`
                  : '[检测到系统未设置管理员，请创建首个超级管理员]'}
              </Text>
            </Space>
          </div>

          {isInitialized ? (
            /* 正常管理员登录表单 */
            <Form
              name="admin_auth"
              size="large"
              onFinish={onLoginFinish}
              autoComplete="off"
              layout="vertical"
            >
              <Form.Item
                name="username"
                rules={[{ required: true, message: 'IDENT_REQUIRED' }]}
              >
                <Input 
                  prefix={<SecurityScanOutlined style={{ color: '#00ff41' }} />} 
                  placeholder="OPERATOR_ID" 
                  style={{ borderRadius: 0, border: '1px solid #00ff41', color: '#00ff41' }}
                />
              </Form.Item>

              <Form.Item
                name="password"
                rules={[{ required: true, message: 'CRED_REQUIRED' }]}
              >
                <Input.Password 
                  prefix={<UnlockOutlined style={{ color: '#00ff41' }} />} 
                  placeholder="SECURITY_CODE" 
                  style={{ borderRadius: 0, border: '1px solid #00ff41', color: '#00ff41' }}
                />
              </Form.Item>

              <Form.Item style={{ marginTop: 20 }}>
                <Button 
                  type="primary" 
                  htmlType="submit" 
                  block 
                  loading={loading}
                  style={{ 
                    borderRadius: 0, 
                    backgroundColor: '#00ff41', 
                    color: '#000', 
                    fontWeight: 'bold',
                    boxShadow: '0 0 10px #00ff41',
                    border: 'none',
                    height: '50px'
                  }}
                >
                  INITIATE_SESSION
                </Button>
              </Form.Item>

              <div style={{ textAlign: 'center', fontSize: '10px', opacity: 0.5, marginTop: 20 }}>
                [ UNIFIED CONTROL PROTOCOL ACTIVATED ]
              </div>
            </Form>
          ) : (
            /* 首次初始化超级管理员表单 */
            <Form
              name="admin_init"
              size="large"
              onFinish={onInitFinish}
              autoComplete="off"
              layout="vertical"
            >
              <Form.Item
                name="username"
                rules={[{ required: true, message: '请输入管理员用户名' }]}
              >
                <Input 
                  prefix={<SecurityScanOutlined style={{ color: '#00ff41' }} />} 
                  placeholder="设置管理员用户名 (OPERATOR_ID)" 
                  style={{ borderRadius: 0, border: '1px solid #00ff41', color: '#00ff41' }}
                />
              </Form.Item>

              <Form.Item
                name="password"
                rules={[
                  { required: true, message: '请输入管理员密码' },
                  { min: 6, message: '密码长度至少为 6 位' }
                ]}
              >
                <Input.Password 
                  prefix={<UnlockOutlined style={{ color: '#00ff41' }} />} 
                  placeholder="设置管理员密码 (SECURITY_CODE)" 
                  style={{ borderRadius: 0, border: '1px solid #00ff41', color: '#00ff41' }}
                />
              </Form.Item>

              <Form.Item
                name="confirmPassword"
                dependencies={['password']}
                rules={[
                  { required: true, message: '请确认管理员密码' },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (!value || getFieldValue('password') === value) {
                        return Promise.resolve();
                      }
                      return Promise.reject(new Error('两次输入的密码不一致'));
                    },
                  }),
                ]}
              >
                <Input.Password 
                  prefix={<UnlockOutlined style={{ color: '#00ff41' }} />} 
                  placeholder="确认管理员密码 (CONFIRM_CODE)" 
                  style={{ borderRadius: 0, border: '1px solid #00ff41', color: '#00ff41' }}
                />
              </Form.Item>

              <Form.Item style={{ marginTop: 20 }}>
                <Button 
                  type="primary" 
                  htmlType="submit" 
                  block 
                  loading={loading}
                  style={{ 
                    borderRadius: 0, 
                    backgroundColor: '#00ff41', 
                    color: '#000', 
                    fontWeight: 'bold',
                    boxShadow: '0 0 10px #00ff41',
                    border: 'none',
                    height: '50px'
                  }}
                >
                  INITIALIZE_AND_LOGIN
                </Button>
              </Form.Item>

              <div style={{ textAlign: 'center', fontSize: '10px', opacity: 0.5, marginTop: 20 }}>
                [ SYSTEM INITIALIZATION PROTOCOL ACTIVATED ]
              </div>
            </Form>
          )}
        </Card>

        <style>
          {`
            @keyframes scanner {
              0% { top: -100%; }
              100% { top: 100%; }
            }
          `}
        </style>
      </div>
    </ConfigProvider>
  );
};

export default AdminLogin;
