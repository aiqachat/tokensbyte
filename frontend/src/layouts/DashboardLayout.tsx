import React, { useState } from 'react';
import { Layout, Menu, Button, Space, Typography, ConfigProvider, theme } from 'antd';
import {
  DashboardOutlined,
  ControlOutlined,
  KeyOutlined,
  BarsOutlined,
  GiftOutlined,
  TeamOutlined,
  MenuUnfoldOutlined,
  MenuFoldOutlined,
  GlobalOutlined,
  LogoutOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';

import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import useAuthStore from '../store/auth';

const { Header, Sider, Content } = Layout;
const { Title } = Typography;

interface DashboardLayoutProps {
  isUserEnd?: boolean;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ isUserEnd = false }) => {
  const { t, i18n } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();


  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
    localStorage.setItem('i18nextLng', lng);
  };

  const langItems: MenuProps['items'] = [
    {
      key: 'zh',
      label: '简体中文',
      onClick: () => changeLanguage('zh'),
    },
    {
      key: 'en',
      label: 'English',
      onClick: () => changeLanguage('en'),
    },
  ];

  const menuItems = [
    {
      key: isUserEnd ? '/' : '/admin0755/dashboard',
      icon: <DashboardOutlined />,
      label: <Link to={isUserEnd ? '/' : '/admin0755/dashboard'}>{t('menu.dashboard')}</Link>,
    },
    {
      key: isUserEnd ? '/tokens' : '/admin0755/tokens',
      icon: <KeyOutlined />,
      label: <Link to={isUserEnd ? '/tokens' : '/admin0755/tokens'}>{t('menu.tokens')}</Link>,
    },
    {
      key: isUserEnd ? '/logs' : '/admin0755/logs',
      icon: <BarsOutlined />,
      label: <Link to={isUserEnd ? '/logs' : '/admin0755/logs'}>{t('menu.logs')}</Link>,
    },
  ];

  if (!isUserEnd && user?.role === 'admin') {
    menuItems.push(
      {
        key: '/admin0755/channels',
        icon: <ControlOutlined />,
        label: <Link to="/admin0755/channels">{t('menu.channels')}</Link>,
      },
      {
        key: '/admin0755/models',
        icon: <AppstoreOutlined />,
        label: <Link to="/admin0755/models">{t('menu.models')}</Link>,
      },
      {
        key: '/admin0755/redemptions',
        icon: <GiftOutlined />,
        label: <Link to="/admin0755/redemptions">{t('menu.redemptions')}</Link>,
      },
      {
        key: '/admin0755/users',
        icon: <TeamOutlined />,
        label: <Link to="/admin0755/users">{t('menu.users')}</Link>,
      }
    );
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
              {collapsed ? 'TB' : (isUserEnd ? 'TokensByte' : t('common.admin_title'))}
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
              <Dropdown menu={{ items: langItems }} placement="bottomRight">
                <Button type="text" icon={<GlobalOutlined />} style={{ color: '#fff' }}>
                  {i18n.language === 'zh' ? '中文' : 'EN'}
                </Button>
              </Dropdown>
              <span style={{ color: '#fff' }}>
                <Title level={5} style={{ margin: 0, color: '#fff' }}>{user?.username} ({user?.role})</Title>
              </span>
              <Button type="primary" danger icon={<LogoutOutlined />} onClick={handleLogout}>
                {t('common.logout')}
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
