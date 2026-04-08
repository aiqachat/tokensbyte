import React, { useState } from 'react';
import { Layout, Menu, Button, Space, Typography, ConfigProvider, theme } from 'antd';
import {
  DashboardOutlined,
  CloudServerOutlined,
  KeyOutlined,
  HistoryOutlined,
  UserOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  GiftOutlined,
} from '@ant-design/icons';
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom';
import useAuthStore from '../store/auth';

const { Header, Sider, Content } = Layout;
const { Title } = Typography;

const DashboardLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const menuItems = [
    {
      key: '/dashboard',
      icon: <DashboardOutlined />,
      label: <Link to="/">Dashboard</Link>,
    },
    {
      key: '/channels',
      icon: <CloudServerOutlined />,
      label: <Link to="/channels">Channels</Link>,
    },
    {
      key: '/tokens',
      icon: <KeyOutlined />,
      label: <Link to="/tokens">Tokens</Link>,
    },
    {
      key: '/logs',
      icon: <HistoryOutlined />,
      label: <Link to="/logs">Logs</Link>,
    },
  ];

  if (user?.role === 'admin') {
    menuItems.push({
      key: '/redemptions',
      icon: <GiftOutlined />,
      label: <Link to="/redemptions">Redemptions</Link>,
    });
    menuItems.push({
      key: '/users',
      icon: <UserOutlined />,
      label: <Link to="/users">Users</Link>,
    });
  }

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#1677ff',
          borderRadius: 8,
        },
      }}
    >
      <Layout style={{ minHeight: '100vh' }}>
        <Sider trigger={null} collapsible collapsed={collapsed} theme="dark">
          <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px 0' }}>
            <Title level={4} style={{ color: '#fff', margin: 0, overflow: 'hidden', whiteSpace: 'nowrap' }}>
              {collapsed ? 'TB' : 'TokensByte'}
            </Title>
          </div>
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[location.pathname]}
            items={menuItems}
          />
        </Sider>
        <Layout>
          <Header style={{ padding: 0, background: '#141414', display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 24 }}>
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              style={{ fontSize: '16px', width: 64, height: 64, color: '#fff' }}
            />
            <Space size="large">
              <span style={{ color: '#fff' }}>
                <Title level={5} style={{ margin: 0, color: '#fff' }}>{user?.username} ({user?.role})</Title>
              </span>
              <Button type="primary" danger icon={<LogoutOutlined />} onClick={handleLogout}>
                Logout
              </Button>
            </Space>
          </Header>
          <Content style={{ margin: '24px 16px', padding: 24, minHeight: 280, background: '#000', borderRadius: 12, overflow: 'initial' }}>
            <Outlet />
          </Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
};

export default DashboardLayout;
