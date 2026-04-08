import React, { useState } from 'react';
import { Card, Form, Input, Button, Typography, Space, message } from 'antd';
import { UserOutlined, LockOutlined, RocketOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import axios, { AxiosError } from 'axios';
import useAuthStore from '../../store/auth';
import type { User } from '../../types';

const { Title, Text } = Typography;

interface LoginResponse {
  token: string;
  user: User;
}

const Login: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { setToken, setUser } = useAuthStore();

  const onFinish = async (values: unknown) => {
    setLoading(true);
    try {
      const response = await axios.post<LoginResponse>('/api/v1/auth/login', values);
      const { token, user } = response.data;
      setToken(token);
      setUser(user);
      message.success('Welcome back, ' + user.username);
      navigate('/dashboard');
    } catch (error) {
      console.error(error);
      const axiosError = error as AxiosError<{ error: { message: string } }>;
      message.error(axiosError.response?.data?.error?.message || 'Login failed');
    } finally {
      setLoading(false);
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
      <Card style={{ width: 400, borderRadius: 16, background: '#141414', border: '1px solid #303030' }}>
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
            rules={[{ required: true, message: 'Please input your username!' }]}
          >
            <Input prefix={<UserOutlined />} placeholder="Username" />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: 'Please input your password!' }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="Password" />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading}>
              Sign In
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default Login;
