import React, { useState, useEffect } from 'react';
import request from '../utils/request';
import { Layout, Menu, Button, Space, Typography, ConfigProvider, theme, Grid } from 'antd';
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
  WalletOutlined,
  UserOutlined,
  NotificationOutlined,
} from '@ant-design/icons';

import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import useAuthStore from '../store/auth';

const { Header, Sider, Content } = Layout;
const { Title } = Typography;
const { useBreakpoint } = Grid;

interface DashboardLayoutProps {
  isUserEnd?: boolean;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ isUserEnd = false }) => {
  const { t, i18n } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  const screens = useBreakpoint();
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

  if (isUserEnd) {
    menuItems.push(
      {
        key: '/wallet',
        icon: <WalletOutlined style={{ fontSize: '18px' }} />,
        label: <Link to="/wallet">{t('menu.wallet')}</Link>,
      },
      {
        key: '/profile',
        icon: <UserOutlined style={{ fontSize: '18px' }} />,
        label: <Link to="/profile">{t('menu.profile')}</Link>,
      }
    );
  }

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
        key: 'marketing-management-group',
        icon: <NotificationOutlined style={{ fontSize: '18px' }} />,
        label: t('menu.marketing'),
        children: [
          {
            key: '/admin0755/redemptions',
            label: <Link to="/admin0755/redemptions">{t('menu.redemptions')}</Link>,
          },
          {
            key: '/admin0755/marketing/registration-gifts',
            label: <Link to="/admin0755/marketing/registration-gifts">{t('menu.registration_gifts')}</Link>,
          }
        ]
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
        key: 'finance-management-group',
        icon: <WalletOutlined style={{ fontSize: '18px' }} />,
        label: t('menu.finance'),
        children: [
          {
            key: '/admin0755/finance/recharges',
            label: <Link to="/admin0755/finance/recharges">{t('menu.finance_recharges')}</Link>,
          },
          {
            key: '/admin0755/finance/orders',
            label: <Link to="/admin0755/finance/orders">{t('menu.finance_orders')}</Link>,
          }
        ]
      },
      {
        key: 'settings-group',
        icon: <SettingOutlined style={{ fontSize: '18px' }} />,
        label: t('menu.settings'),
        children: [
          {
            key: '/admin0755/settings?tab=basic',
            label: <Link to="/admin0755/settings?tab=basic">{t('menu.basic_settings')}</Link>,
          },
          {
            key: '/admin0755/settings?tab=currency',
            label: <Link to="/admin0755/settings?tab=currency">{t('menu.currency_settings')}</Link>,
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
          breakpoint="lg"
          collapsedWidth={screens.xs ? 0 : 80}
          onBreakpoint={(broken) => {
            if (broken) setCollapsed(true);
          }}
          style={{ 
            boxShadow: '2px 0 8px 0 rgba(29,35,41,.05)',
            zIndex: 10,
            position: screens.xs ? 'fixed' : 'relative',
            height: '100vh',
            left: 0,
            top: 0,
            bottom: 0,
          }}
        >
          <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <Title level={4} style={{ color: '#fff', margin: 0, overflow: 'hidden', whiteSpace: 'nowrap' }}>
              {(collapsed && !screens.xs) ? 'TB' : siteName}
            </Title>

          </div>
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[location.pathname]}
            items={menuItems}
            style={{ border: 'none', background: 'transparent', marginTop: 8 }}
            onClick={() => {
              if (screens.xs) setCollapsed(true);
            }}
          />
        </Sider>
        <Layout style={{ marginLeft: (screens.xs || collapsed) ? 0 : 0 }}>
          <Header style={{ 
            padding: 0, 
            background: '#141414', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between', 
            paddingRight: screens.xs ? 8 : 24, 
            boxShadow: '0 1px 4px rgba(0,21,41,.08)' 
          }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <Button
                type="text"
                icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                onClick={() => setCollapsed(!collapsed)}
                style={{ fontSize: '16px', width: 64, height: 64, color: '#fff' }}
              />
              {screens.xs && (
                <Title level={5} style={{ color: '#fff', margin: 0, marginLeft: 8 }}>
                  {siteName}
                </Title>
              )}
            </div>
            
            <Space size={screens.xs ? "small" : "large"}>
              <Dropdown menu={{ items: langItems }} placement="bottomRight">
                <Button type="text" icon={<GlobalOutlined />} style={{ color: '#fff' }}>
                  {!screens.xs && (i18n.language === 'zh' ? '中文' : 'EN')}
                </Button>
              </Dropdown>
              {!screens.xs && (
                <span style={{ color: '#fff' }}>
                  <Title level={5} style={{ margin: 0, color: '#fff' }}>{user?.username}</Title>
                </span>
              )}
              <Button 
                type="primary" 
                danger 
                icon={<LogoutOutlined />} 
                onClick={handleLogout}
                size={screens.xs ? "middle" : "middle"}
              >
                {!screens.xs && t('common.logout')}
              </Button>
            </Space>

          </Header>
          <Content style={{ 
            margin: screens.xs ? '12px 8px' : '24px 16px', 
            padding: screens.xs ? 12 : 24, 
            minHeight: 280, 
            background: '#000', 
            borderRadius: 12, 
            overflow: 'auto' 
          }}>
            <Outlet />
          </Content>
          {screens.xs && !collapsed && (
            <div 
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0,0,0,0.5)',
                zIndex: 9,
              }}
              onClick={() => setCollapsed(true)}
            />
          )}
        </Layout>
      </Layout>
    </ConfigProvider>
  );
};

export default DashboardLayout;
