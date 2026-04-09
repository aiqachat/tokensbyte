import React, { useState, useEffect } from 'react';
import { Form, Input, Button, Typography, Space, message, ConfigProvider, theme, Card } from 'antd';
import { SafetyCertificateOutlined, UnlockOutlined, SecurityScanOutlined } from '@ant-design/icons';


import { useNavigate } from 'react-router-dom';
import axios, { AxiosError } from 'axios';
import useAuthStore from '../../store/auth';
import type { User } from '../../types';


const { Title, Text } = Typography;

interface LoginResponse {
  token: string;
  user: User;
}

const AdminLogin: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [glitch, setGlitch] = useState(false);

  const navigate = useNavigate();
  const { setToken, setUser } = useAuthStore();

  useEffect(() => {
    const interval = setInterval(() => {
      setGlitch(true);
      setTimeout(() => setGlitch(false), 200);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const onFinish = async (values: unknown) => {
    setLoading(true);
    try {
      const response = await axios.post<LoginResponse>('/api/v1/auth/login', values);
      const { token, user } = response.data;
      
      if (user.role !== 'admin') {
        message.error('ACCESS DENIED: INSUFFICIENT PRIVILEGES');
        return;
      }

      setToken(token);
      setUser(user);
      message.success('AUTHENTICATION SUCCESSFUL. WELCOME, OPERATOR.');
      navigate('/admin0755/dashboard');
    } catch (error) {
      console.error(error);
      const axiosError = error as AxiosError<{ error: { message: string } }>;
      message.error(axiosError.response?.data?.error?.message || 'CRITICAL FAILURE: AUTH_TIMEOUT');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
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
          bodyStyle={{ padding: '40px' }}
        >
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
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
              <Title level={3} style={{ margin: 0, color: '#00ff41', letterSpacing: '4px', textShadow: '0 0 10px #00ff41' }}>
                ADMIN_SYS_ACCESS
              </Title>
              <Text style={{ color: '#00ff41', fontSize: '10px', opacity: 0.8 }}>
                V.0.7.5.5 // SECURE_ESTABLISHMENT // {new Date().toISOString()}
              </Text>
            </Space>
          </div>

          <Form
            name="admin_auth"
            size="large"
            onFinish={onFinish}
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
