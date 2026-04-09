import React, { useState, useEffect } from 'react';
import request from '../utils/request';
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
  SettingOutlined,
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
  const [siteName, setSiteName] = useState(isUserEnd ? 'TokensByte' : t('common.admin_title'));


  useEffect(() => {
    fetchGlobalSettings();
  }, []);

  const fetchGlobalSettings = async () => {
    try {
      const response = await (request.get('/settings') as any);
      const { site } = response;
      if (site.title) {
        document.title = site.title;
      }
      if (site.name && isUserEnd) {
        setSiteName(site.name);
      }
    } catch (error) {
      console.error('Failed to fetch global settings:', error);
    }
  };

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

  const menuItems: MenuProps['items'] = [
    {
      key: isUserEnd ? '/' : '/admin0755/dashboard',
      icon: <DashboardOutlined style={{ fontSize: '18px' }} />,
      label: <Link to={isUserEnd ? '/' : '/admin0755/dashboard'}>{t('menu.dashboard')}</Link>,
    },
    {
      key: isUserEnd ? '/tokens' : '/admin0755/tokens',
      icon: <KeyOutlined style={{ fontSize: '18px' }} />,
      label: <Link to={isUserEnd ? '/tokens' : '/admin0755/tokens'}>{t('menu.tokens')}</Link>,
    },
    {
      key: isUserEnd ? '/logs' : '/admin0755/logs',
      icon: <BarsOutlined style={{ fontSize: '18px' }} />,
      label: <Link to={isUserEnd ? '/logs' : '/admin0755/logs'}>{t('menu.logs')}</Link>,
    },
  ];

  if (!isUserEnd && user?.role === 'admin') {
    menuItems.push(
      {
        key: '/admin0755/channels',
        icon: <ControlOutlined style={{ fontSize: '18px' }} />,
        label: <Link to="/admin0755/channels">{t('menu.channels')}</Link>,
      },
      {
        key: '/admin0755/models',
        icon: <AppstoreOutlined style={{ fontSize: '18px' }} />,
        label: <Link to="/admin0755/models">{t('menu.models')}</Link>,
      },
      {
        key: '/admin0755/redemptions',
        icon: <GiftOutlined style={{ fontSize: '18px' }} />,
        label: <Link to="/admin0755/redemptions">{t('menu.redemptions')}</Link>,
      },
      {
        key: 'user-management-group',
        icon: <TeamOutlined style={{ fontSize: '18px' }} />,
        label: t('menu.users'),
        children: [
          {
            key: '/admin0755/users',
            label: <Link to="/admin0755/users">{t('menu.user_list')}</Link>,
          },
          {
            key: '/admin0755/user-levels',
            label: <Link to="/admin0755/user-levels">{t('menu.user_levels')}</Link>,
          }
        ]
      },
      {
        key: 'settings-group',
        icon: <SettingOutlined style={{ fontSize: '18px' }} />,
        label: t('menu.settings'),
        children: [
          {
            key: '/admin0755/settings?tab=1',
            label: <Link to="/admin0755/settings">{t('menu.basic_settings')}</Link>,
          },
          {
            key: '/admin0755/settings?tab=2',
            label: <Link to="/admin0755/settings">{t('menu.currency_settings')}</Link>,
          }
        ]
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
        components: {
          Layout: {
            siderBg: '#141414',
          },
          Menu: {
            itemHeight: 50,
            iconSize: 20,
            itemMarginInline: 12,
          }
        }
      }}
    >
      <Layout style={{ minHeight: '100vh' }}>
        <Sider 
          trigger={null} 
          collapsible 
          collapsed={collapsed} 
          theme="dark" 
          width={240}
          style={{ 
            boxShadow: '2px 0 8px 0 rgba(29,35,41,.05)',
            zIndex: 10,
          }}
        >
          <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <Title level={4} style={{ color: '#fff', margin: 0, overflow: 'hidden', whiteSpace: 'nowrap' }}>
              {collapsed ? 'TB' : siteName}
            </Title>

          </div>
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[location.pathname]}
            items={menuItems}
            style={{ border: 'none', background: 'transparent', marginTop: 8 }}
          />
        </Sider>
        <Layout>
          <Header style={{ padding: 0, background: '#141414', display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 24, boxShadow: '0 1px 4px rgba(0,21,41,.08)' }}>
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
