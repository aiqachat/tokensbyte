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
  PictureOutlined,
  ExperimentOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';

import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Dropdown, Modal, message, Popover, Avatar, Divider } from 'antd';
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
  const { user, logout, setUser, isLoggedIn } = useAuthStore();
  const [siteName, setSiteName] = useState(isUserEnd ? 'TokensByte' : t('common.admin_title'));
  const [siteLogo, setSiteLogo] = useState<string>('');
  const [activePlugins, setActivePlugins] = useState<any[]>([]);
  const [enableMultilingual, setEnableMultilingual] = useState(true);


  useEffect(() => {
    fetchActivePlugins();
    fetchGlobalSettings();
    if (isLoggedIn) {
      fetchCurrentUser();
    }
  }, [isLoggedIn]);

  const fetchCurrentUser = async () => {
    try {
      const resp: any = await request.get('/user/profile');
      if (resp && resp.id) {
        setUser(resp);
      }
    } catch (error) {
      console.error('Failed to fetch user info', error);
    }
  };
  
  const fetchActivePlugins = async () => {
    try {
      const response = await (request.get('/plugins/active') as any);
      if (response.active_plugins) {
        setActivePlugins(response.active_plugins);
      }
    } catch (error) {
      console.error('Failed to fetch active plugins', error);
    }
  };

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
      if (site.logo) {
        setSiteLogo(site.logo);
      }
      if (site.enable_multilingual !== undefined) {
        setEnableMultilingual(site.enable_multilingual);
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

  const showSystemAbout = () => {
    navigate('/admin0755/about');
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

  // 2. Relay API
  menuItems.push({
    key: isUserEnd ? '/relay-api' : '/admin0755/relay-api',
    icon: <RocketOutlined style={{ fontSize: '18px' }} />,
    label: <Link to={isUserEnd ? '/relay-api' : '/admin0755/relay-api'}>{t('menu.relay_api')}</Link>,
  });

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
    label: <Link to={isUserEnd ? '/logs' : '/admin0755/logs'}>{t('menu.usage_logs')}</Link>,
  });

  // 5. Task Logs
  menuItems.push({
    key: isUserEnd ? '/task-logs' : '/admin0755/task-logs',
    icon: <ScheduleOutlined style={{ fontSize: '18px' }} />,
    label: <Link to={isUserEnd ? '/task-logs' : '/admin0755/task-logs'}>{t('menu.task_logs')}</Link>,
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

  // 插件菜单：检查用户等级是否在插件允许范围内
  const isPluginVisibleForUser = (pluginName: string) => {
    const plugin = activePlugins.find((p: any) => p.name === pluginName);
    if (!plugin) return false;
    if (plugin.allowed_levels === 'all') return true;
    if (!isUserEnd) return true; // 管理员端始终显示
    const userGroup = user?.user_group || 'default';
    return plugin.allowed_levels.split(',').includes(userGroup);
  };




  if (isUserEnd) {
    // 插件菜单：素材资产管理
    if (isPluginVisibleForUser('asset_manager')) {
      menuItems.push({
        key: '/assets',
        icon: <PictureOutlined style={{ fontSize: '18px' }} />,
        label: <Link to="/assets">{t('menu.assets')}</Link>,
      });
    }

    // 插件菜单：团队营销管理
    if (isPluginVisibleForUser('team_marketing')) {
      menuItems.push({
        key: '/advanced-marketing',
        icon: <TeamOutlined style={{ fontSize: '18px' }} />,
        label: <Link to="/advanced-marketing">{t('menu.advanced_marketing')}</Link>,
      });
    }

    // 插件菜单：模型体验中心
    if (isPluginVisibleForUser('playground')) {
      menuItems.push({
        key: '/playground',
        icon: <ExperimentOutlined style={{ fontSize: '18px' }} />,
        label: <Link to="/playground" target="_blank">{t('menu.playground')}</Link>,
      });
    }

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
      const channelChildren = [
        {
          key: '/admin0755/channels',
          label: <Link to="/admin0755/channels">{t('menu.channel_groups', '模型渠道分组')}</Link>,
        },
        {
          key: '/admin0755/channel-configs',
          label: <Link to="/admin0755/channel-configs">{t('menu.channel_configs', '模型渠道配置')}</Link>,
        },
      ];
      if (hasPermission('upstreams') || isSuperAdmin) {
        channelChildren.push({
          key: '/admin0755/upstreams',
          label: <Link to="/admin0755/upstreams">{t('menu.upstreams', '上游管理')}</Link>,
        });
      }
      menuItems.push({
        key: 'channels-management-group',
        icon: <ControlOutlined style={{ fontSize: '18px' }} />,
        label: t('menu.channels'),
        children: channelChildren
      });
    }

    if (hasPermission('models') || isSuperAdmin) {
      const modelChildren = [];

      if (hasPermission('models')) {
        modelChildren.push(
          {
            key: '/admin0755/models',
            label: <Link to="/admin0755/models">{t('menu.model_list')}</Link>,
          },
          {
            key: '/admin0755/forward-rules',
            label: <Link to="/admin0755/forward-rules">{t('menu.forward_rules')}</Link>,
          },
          {
            key: '/admin0755/billing-rules',
            label: <Link to="/admin0755/billing-rules">{t('menu.billing_rules')}</Link>,
          }
        );
      }

      if (modelChildren.length > 0) {
        menuItems.push({
          key: 'models-management-group',
          icon: <AppstoreOutlined style={{ fontSize: '18px' }} />,
          label: t('menu.admin_routing'),
          children: modelChildren
        });
      }
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
          label: <Link to="/admin0755/admin-groups">{t('menu.admin_groups')}</Link>,
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
            key: '/admin0755/payment-settings',
            label: <Link to="/admin0755/payment-settings">{t('menu.payment_settings')}</Link>,
          },
          {
            key: '/admin0755/message-notification',
            label: <Link to="/admin0755/message-notification">{t('menu.message_notification')}</Link>,
          },
          {
            key: '/admin0755/oauth-settings',
            label: <Link to="/admin0755/oauth-settings">{t('menu.oauth_settings')}</Link>,
          },
          {
            key: '/admin0755/settings?tab=database',
            label: <Link to="/admin0755/settings?tab=database">{t('menu.database_settings')}</Link>,
          }
        ]
      });
    }

    if (isSuperAdmin || hasPermission('plugins')) {
      menuItems.push({
        key: '/admin0755/plugins',
        icon: <AppstoreOutlined style={{ fontSize: '18px' }} />,
        label: <Link to="/admin0755/plugins">{t('menu.plugins')}</Link>,
      });
    }
  }


  const userInitial = user?.nickname?.charAt(0)?.toUpperCase() || user?.username?.charAt(0)?.toUpperCase() || '?';
  const displayName = user?.nickname || user?.username || 'User';

  const profileContent = (
    <div style={{ width: 300, padding: '12px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ marginTop: 8, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16, width: '100%', padding: '0 8px' }}>
        <Avatar 
          size={56} 
          style={{ backgroundColor: '#1677ff', color: '#fff', fontSize: 24, flexShrink: 0 }}
        >
          {userInitial}
        </Avatar>
        <div style={{ overflow: 'hidden', flex: 1 }}>
          <div style={{ fontWeight: 500, fontSize: 16, color: '#e5e5e5', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayName}</span>
            {user?.level_name && (
              <span style={{ 
                fontSize: 11, padding: '0 6px', background: 'rgba(22, 119, 255, 0.15)', 
                color: '#1677ff', borderRadius: 4, fontWeight: 'normal', flexShrink: 0,
                border: '1px solid rgba(22, 119, 255, 0.3)', lineHeight: '18px',
                userSelect: 'none'
              }}>
                {user.level_name}
              </span>
            )}
          </div>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>
            用户 UID:{user?.uid || '-'}
          </div>
        </div>
      </div>

      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {isUserEnd && (
          <Button 
            type="default"
            style={{ 
              height: 48, borderRadius: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.1)', color: '#e5e5e5', fontSize: 15,
              transition: 'all 0.2s'
            }}
            className="hover-bright-btn"
            icon={<WalletOutlined style={{ fontSize: 18 }} />}
            onClick={() => { navigate('/wallet'); }}
          >
            {t('menu.wallet', '我的钱包')}
          </Button>
        )}
        
        <Button 
          type="default"
          style={{ 
            height: 48, borderRadius: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.1)', color: '#e5e5e5', fontSize: 15,
            transition: 'all 0.2s'
          }}
          className="hover-bright-btn"
          icon={<UserOutlined style={{ fontSize: 18 }} />}
          onClick={() => { navigate('/profile'); }}
        >
          {t('menu.profile', '个人中心')}
        </Button>

        <Button 
          type="default"
          style={{ 
            height: 48, borderRadius: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.1)', color: '#e5e5e5', fontSize: 15,
            transition: 'all 0.2s'
          }}
          className="hover-bright-btn"
          icon={<LogoutOutlined style={{ fontSize: 18 }} />}
          onClick={handleLogout}
        >
          {t('common.logout', '退出账号')}
        </Button>
      </div>

      <div style={{ marginTop: 24, display: 'flex', justifyContent: 'center', gap: 24, width: '100%' }}>
        <Button type="link" style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, padding: 0 }}>隐私政策</Button>
        <span style={{ color: 'rgba(255,255,255,0.2)' }}>•</span>
        <Button type="link" style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, padding: 0 }}>服务条款</Button>
      </div>
    </div>
  );

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
      <style>
        {`
          .hover-bright-btn:hover {
            background: rgba(255,255,255,0.1) !important;
            border-color: rgba(255,255,255,0.2) !important;
            color: #fff !important;
          }
          .header-avatar-btn:hover {
            background: rgba(255,255,255,0.08);
          }
          
          /* 弹窗居中放大动画 */
          .popover-center-scale-enter,
          .popover-center-scale-appear {
            opacity: 0;
            transform: scale(0.82);
            transform-origin: 50% 50% !important;
          }
          .popover-center-scale-enter-active,
          .popover-center-scale-appear-active {
            opacity: 1;
            transform: scale(1);
            transition: all 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
            transform-origin: 50% 50% !important;
          }
          .popover-center-scale-leave {
            opacity: 1;
            transform: scale(1);
            transform-origin: 50% 50% !important;
          }
          .popover-center-scale-leave-active {
            opacity: 0;
            transform: scale(0.88);
            transition: all 0.2s cubic-bezier(0.4, 0, 1, 1);
            transform-origin: 50% 50% !important;
          }
          .custom-premium-popover {
            transform-origin: 50% 50% !important;
          }
        `}
      </style>
      <Layout style={{ height: '100vh', overflow: 'hidden' }}>
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
            height: '100%',
            left: 0,
            top: 0,
            bottom: 0,
            overflow: 'hidden',
          }}
          className="custom-sider"
        >
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              {siteLogo ? (
                (collapsed && !screens.xs) ? (
                  <img src={siteLogo} alt="logo" style={{ width: 32, height: 32, objectFit: 'contain' }} />
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <img src={siteLogo} alt="logo" style={{ width: 28, height: 28, objectFit: 'contain' }} />
                    <Title level={4} style={{ color: '#fff', margin: 0, overflow: 'hidden', whiteSpace: 'nowrap' }}>
                      {siteName}
                    </Title>
                  </div>
                )
              ) : (
                <Title level={4} style={{ color: '#fff', margin: 0, overflow: 'hidden', whiteSpace: 'nowrap' }}>
                  {(collapsed && !screens.xs) ? 'TB' : siteName}
                </Title>
              )}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
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
                  selectedKeys={[location.pathname + location.search]}
                  defaultOpenKeys={menuItems
                    .filter((item: any) => item?.children?.some((child: any) => child.key === location.pathname + location.search))
                    .map((item: any) => item.key)}
                  items={menuItems}
                  style={{ border: 'none', background: 'transparent', marginTop: 8 }}
                  onClick={() => {
                    if (screens.xs) setCollapsed(true);
                  }}
                />
              </ConfigProvider>
            </div>
            {!isUserEnd && (
              <div style={{ padding: '16px 8px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'center' }}>
                <Button 
                  type="text" 
                  icon={<InfoCircleOutlined style={{ fontSize: '18px' }} />} 
                  style={{ color: 'rgba(255,255,255,0.65)', width: '100%', display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start' }}
                  onClick={showSystemAbout}
                  title={t('menu.system_about')}
                >
                  {(!collapsed) && <span style={{ marginLeft: 8 }}>{t('menu.system_about')}</span>}
                </Button>
              </div>
            )}
          </div>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 8 }}>
                  {siteLogo && <img src={siteLogo} alt="logo" style={{ width: 24, height: 24, objectFit: 'contain' }} />}
                  <Title level={5} style={{ color: '#fff', margin: 0 }}>
                    {siteName}
                  </Title>
                </div>
              )}
            </div>
            
            <Space size={screens.xs ? "small" : "middle"}>
              {enableMultilingual && (
                <Dropdown menu={{ items: langItems }} placement="bottomRight">
                  <Button type="text" icon={<GlobalOutlined />} style={{ color: '#fff' }}>
                    {!screens.xs && (i18n.language === 'zh' ? '中文' : 'EN')}
                  </Button>
                </Dropdown>
              )}
              
              <Popover 
                content={profileContent} 
                trigger="click" 
                placement="bottomRight"
                overlayClassName="custom-premium-popover"
                forceRender
                destroyTooltipOnHide={false}
                overlayInnerStyle={{ 
                  padding: 0, 
                  borderRadius: 20, 
                  background: 'rgba(30, 30, 30, 0.45)',
                  backdropFilter: 'blur(30px) saturate(200%)',
                  WebkitBackdropFilter: 'blur(30px) saturate(200%)',
                  border: '1px solid rgba(255,255,255,0.15)', 
                  boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.1), 0 24px 48px rgba(0,0,0,0.6)',
                  transform: 'translateZ(0)',
                }}
                arrow={false}
              >
                <div 
                  className="header-avatar-btn"
                  style={{ 
                    display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '4px', 
                    borderRadius: 20, transition: 'background 0.2s',
                    border: '2px solid transparent'
                  }} 
                >
                  <Avatar size={34} style={{ backgroundColor: '#1677ff', color: '#fff', fontSize: 16 }}>
                    {userInitial}
                  </Avatar>
                </div>
              </Popover>
            </Space>

          </Header>
          <Content style={{ 
            margin: screens.xs ? '8px' : '12px', 
            padding: screens.xs ? 12 : 16, 
            minHeight: 280, 
            background: '#000', 
            borderRadius: 8, 
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
