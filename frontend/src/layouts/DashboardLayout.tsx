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
  HistoryOutlined,
  ScheduleOutlined,
  RocketOutlined,
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
    if (isUserEnd) {
      navigate('/login');
    } else {
      navigate('/admin0755');
    }
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

  const menuItems: MenuProps['items'] = [];

  // 1. Dashboard
  menuItems.push({
    key: isUserEnd ? '/' : '/admin0755/dashboard',
    icon: <DashboardOutlined style={{ fontSize: '18px' }} />,
    label: <Link to={isUserEnd ? '/' : '/admin0755/dashboard'}>{t('menu.dashboard')}</Link>,
  });

  // 2. Relay API (Admin Only)
  if (!isUserEnd) {
    menuItems.push({
      key: '/admin0755/relay-api',
      icon: <RocketOutlined style={{ fontSize: '18px' }} />,
      label: <Link to="/admin0755/relay-api">中转网关</Link>,
    });
  }

  // 3. Tokens
  menuItems.push({
    key: isUserEnd ? '/tokens' : '/admin0755/tokens',
    icon: <KeyOutlined style={{ fontSize: '18px' }} />,
    label: <Link to={isUserEnd ? '/tokens' : '/admin0755/tokens'}>{t('menu.tokens')}</Link>,
  });

  // 4. Logs
  menuItems.push({
    key: isUserEnd ? '/logs' : '/admin0755/logs',
    icon: <HistoryOutlined style={{ fontSize: '18px' }} />,
    label: <Link to={isUserEnd ? '/logs' : '/admin0755/logs'}>{t('menu.usage_logs', '使用日志')}</Link>,
  });

  // 5. Task Logs
  menuItems.push({
    key: isUserEnd ? '/task-logs' : '/admin0755/task-logs',
    icon: <ScheduleOutlined style={{ fontSize: '18px' }} />,
    label: <Link to={isUserEnd ? '/task-logs' : '/admin0755/task-logs'}>{t('menu.task_logs', '任务日志')}</Link>,
  });

  const isSuperAdmin = !isUserEnd && user?.role === 'admin' && !user.admin_group_id;

  // For Admin login, initial menu items need to be filtered too if not super admin
  if (!isUserEnd && user?.role === 'admin' && !isSuperAdmin && user.permissions) {
     const filteredInitial = [];
     const getMenu = (path: string) => menuItems.find((m: any) => m?.key === path);
     
     if (user.permissions.includes('dashboard')) {
       const m = getMenu('/admin0755/dashboard');
       if (m) filteredInitial.push(m);
     }
     if (user.permissions.includes('relay_api')) {
       const m = getMenu('/admin0755/relay-api');
       if (m) filteredInitial.push(m);
     }
     if (user.permissions.includes('tokens')) {
       const m = getMenu('/admin0755/tokens');
       if (m) filteredInitial.push(m);
     }
     if (user.permissions.includes('logs')) {
       const m1 = getMenu('/admin0755/logs');
       const m2 = getMenu('/admin0755/task-logs');
       if (m1) filteredInitial.push(m1);
       if (m2) filteredInitial.push(m2);
     }
     
     // Reset menuItems to filtered version
     menuItems.length = 0;
     menuItems.push(...filteredInitial);
  }

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
    const hasPermission = (key: string) => {
      if (isSuperAdmin) return true; // 超级管理员直接放行所有菜单
      if (!user.permissions) return false;
      return user.permissions.includes(key);
    };

    if (hasPermission('dashboard')) {
      // dashboard is already at index 0, but we might want to consolidate menu items here
    }

    if (hasPermission('channels')) {
      menuItems.push({
        key: 'channels-management-group',
        icon: <ControlOutlined style={{ fontSize: '18px' }} />,
        label: t('menu.channels'),
        children: [
          {
            key: '/admin0755/channels',
            label: <Link to="/admin0755/channels">{t('menu.channel_groups', '模型渠道分组')}</Link>,
          },
          {
            key: '/admin0755/channel-configs',
            label: <Link to="/admin0755/channel-configs">{t('menu.channel_configs', '模型渠道配置')}</Link>,
          }
        ]
      });
    }

    if (hasPermission('upstreams') || isSuperAdmin) {
      menuItems.push({
        key: '/admin0755/upstreams',
        icon: <GlobalOutlined style={{ fontSize: '18px' }} />,
        label: <Link to="/admin0755/upstreams">上游管理</Link>,
      });
    }

    if (hasPermission('models')) {
      menuItems.push({
        key: 'models-management-group',
        icon: <AppstoreOutlined style={{ fontSize: '18px' }} />,
        label: t('menu.models', '大模型路由管理'),
        children: [
          {
            key: '/admin0755/models',
            label: <Link to="/admin0755/models">{t('menu.model_list', '模型列表')}</Link>,
          },
          {
            key: '/admin0755/forward-rules',
            label: <Link to="/admin0755/forward-rules">{t('menu.forward_rules', '转发规则')}</Link>,
          },
          {
            key: '/admin0755/billing-rules',
            label: <Link to="/admin0755/billing-rules">{t('menu.billing_rules', '计费配置')}</Link>,
          }
        ]
      });
    }

    if (hasPermission('marketing')) {
      menuItems.push({
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
      });
    }

    if (hasPermission('users')) {
      const userItems = [
        {
          key: '/admin0755/users',
          label: <Link to="/admin0755/users">{t('menu.user_list')}</Link>,
        },
        {
          key: '/admin0755/admins',
          label: <Link to="/admin0755/admins">{t('menu.admin_list')}</Link>,
        },
        {
          key: '/admin0755/user-levels',
          label: <Link to="/admin0755/user-levels">{t('menu.user_levels')}</Link>,
        }
      ];
      
      if (hasPermission('admin_groups')) {
        userItems.push({
          key: '/admin0755/admin-groups',
          label: <Link to="/admin0755/admin-groups">管理员分组</Link>,
        });
      }

      menuItems.push({
        key: 'user-management-group',
        icon: <TeamOutlined style={{ fontSize: '18px' }} />,
        label: t('menu.users'),
        children: userItems
      });
    }

    if (hasPermission('finance')) {
      menuItems.push({
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
      });
    }

    if (hasPermission('settings')) {
      menuItems.push({
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
          },
          {
            key: '/admin0755/settings?tab=registration',
            label: <Link to="/admin0755/settings?tab=registration">{t('settings.registration_title')}</Link>,
          },
          {
            key: '/admin0755/settings?tab=smtp',
            label: <Link to="/admin0755/settings?tab=smtp">{t('settings.smtp_title')}</Link>,
          },
          {
            key: '/admin0755/settings?tab=database',
            label: <Link to="/admin0755/settings?tab=database">数据库设置</Link>,
          }
        ]
      });
    }
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
          width={200}
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
          <ConfigProvider 
            theme={{ 
              components: { 
                Menu: { 
                  itemHeight: 36, // default is 40
                  itemMarginInline: 8, 
                  itemMarginBlock: 2, 
                } 
              } 
            }}
          >
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
          </ConfigProvider>
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
