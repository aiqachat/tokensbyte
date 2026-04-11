import React, { useState } from 'react';
import { Card, Form, Input, Button, Typography, Space, message } from 'antd';
import { UserOutlined, LockOutlined, RocketOutlined } from '@ant-design/icons';
import { useNavigate, Link } from 'react-router-dom';
import axios, { AxiosError } from 'axios';
import { useTranslation } from 'react-i18next';
import useAuthStore from '../../store/auth';
import type { User } from '../../types';

const { Title, Text } = Typography;

interface LoginResponse {
  token: string;
  user: User;
}

const Login: React.FC = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { setToken, setUser } = useAuthStore();

  const onFinish = async (values: unknown) => {
    if (loading) return;
    setLoading(true);
    message.destroy();
    try {
      const response = await axios.post<LoginResponse>('/api/v1/auth/login', values);
      const { token, user } = response.data;
      setToken(token);
      setUser(user);
      message.success(t('login.welcome') + ', ' + user.username);
      navigate('/');
    } catch (error) {
      console.error(error);
      const axiosError = error as AxiosError<{ error: { message: string } }>;
      message.error(axiosError.response?.data?.error?.message || t('common.error'));
    } finally {
      setTimeout(() => setLoading(false), 800);
    }
  };


  return (
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
            <RocketOutlined style={{ fontSize: 48, color: '#1677ff' }} />
            <Title level={2} style={{ margin: 0 }}>TokensByte</Title>
            <Text type="secondary">Next-gen LLM API Gateway</Text>
          </Space>
        </div>
        <Form
          name="login"
          size="large"
          onFinish={onFinish}
          autoComplete="off"
        >
          <Form.Item
            name="username"
            rules={[{ required: true, message: t('login.username_or_email') }]}
          >
            <Input prefix={<UserOutlined />} placeholder={t('login.username_or_email')} />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: t('login.password') }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder={t('login.password')} />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading}>
              {t('login.sign_in')}
            </Button>
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: -12 }}>
            <Link to="/register">{t('auth.register_link')}</Link>
            <Link to="/forgot-password">{t('auth.forgot_password_link')}</Link>
          </div>

        </Form>
      </Card>
    </div>
  );
};

export default Login;
