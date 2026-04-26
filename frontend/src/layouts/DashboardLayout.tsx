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
  BellOutlined,
  ShopOutlined,
} from '@ant-design/icons';

import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Dropdown, Modal, message, Popover, Avatar, Divider, Drawer, List, Badge, Tooltip } from 'antd';
import type { MenuProps } from 'antd';
import type { Announcement } from '../types';
import useAuthStore from '../store/auth';
import UserAvatarMenu from '../components/UserAvatarMenu';

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
  const [siteTitle, setSiteTitle] = useState<string>('');
  const [announcementsDrawerVisible, setAnnouncementsDrawerVisible] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activePlugins, setActivePlugins] = useState<any[]>([]);
  const [enableMultilingual, setEnableMultilingual] = useState(true);
  const [agreement, setAgreement] = useState<any>(null);


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
      const { site, agreement: agreementData } = response;
      if (site.title) {
        setSiteTitle(site.title);
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
      if (agreementData) {
        setAgreement(agreementData);
      }
    } catch (error) {
      console.error('Failed to fetch global settings:', error);
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

  useEffect(() => {
    const fetchAnnouncements = async () => {
      try {
        const response = await (request.get('/announcements/public') as any);
        if (response.data) {
          setAnnouncements(response.data);
          setUnreadCount(response.data.length);
        }
      } catch (error) {
        console.error('Failed to fetch announcements:', error);
      }
    };
    fetchAnnouncements();
  }, []);

  const menuItems: MenuProps['items'] = [];

  menuItems.push({
    key: isUserEnd ? '/' : '/admin0755/dashboard',
    icon: <DashboardOutlined style={{ fontSize: '18px' }} />,
    label: <Link to={isUserEnd ? '/' : '/admin0755/dashboard'}>{isUserEnd ? '控制面板' : t('menu.dashboard')}</Link>,
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
          },
          {
            key: '/admin0755/marketing/announcements',
            label: <Link to="/admin0755/marketing/announcements">站点公告</Link>,
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

  let pageName = '';
  const findName = (items: any[]): string | undefined => {
    for (const item of items) {
      if (!item) continue;
      if (item.key === location.pathname || item.key === location.pathname + location.search) {
        if (typeof item.label === 'string') return item.label;
        if (item.label?.props?.children) {
          if (typeof item.label.props.children === 'string') return item.label.props.children;
          if (Array.isArray(item.label.props.children)) return item.label.props.children.join('');
        }
      }
      if (item.children) {
        const found = findName(item.children);
        if (found) return found;
      }
    }
    return undefined;
  };
  
  pageName = findName(menuItems) || '';
  if (!pageName) {
    if (location.pathname === '/profile') pageName = t('menu.profile', '个人中心') as string;
    else if (location.pathname === '/wallet') pageName = t('menu.wallet', '我的钱包') as string;
    else if (location.pathname === '/assets') pageName = t('menu.assets', '素材资产管理') as string;
    else if (location.pathname === '/advanced-marketing') pageName = t('menu.advanced_marketing', '团队营销管理') as string;
    else if (location.pathname === '/playground') pageName = t('menu.playground', '模型体验中心') as string;
  }

  useEffect(() => {
    if (pageName && siteTitle) {
      document.title = `${pageName}-${siteTitle}`;
    } else if (siteTitle) {
      document.title = siteTitle;
    }
  }, [pageName, siteTitle]);


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
            <div style={{ height: screens.xs ? 48 : 56, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
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
            height: screens.xs ? 48 : 56,
            lineHeight: (screens.xs ? 48 : 56) + 'px',
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
                style={{ fontSize: '16px', width: screens.xs ? 48 : 56, height: screens.xs ? 48 : 56, color: '#fff' }}
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

              {isUserEnd && isPluginVisibleForUser('model_marketplace') && (
                <Tooltip title="模型广场">
                  <Button 
                    type="text" 
                    icon={<ShopOutlined />} 
                    style={{ color: '#fff', fontSize: '18px' }} 
                    onClick={() => window.open('/models', '_blank')}
                  />
                </Tooltip>
              )}

              <Badge count={unreadCount} overflowCount={99} offset={[-4, 4]}>
                <Button 
                  type="text" 
                  icon={<BellOutlined />} 
                  style={{ color: '#fff', fontSize: '18px' }} 
                  onClick={() => {
                    setAnnouncementsDrawerVisible(true);
                    setUnreadCount(0);
                  }}
                />
              </Badge>

              <UserAvatarMenu isUserEnd={isUserEnd} agreement={agreement} />
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

      <Drawer
        title={<span style={{ color: '#fff', fontSize: 18, fontWeight: 600, letterSpacing: '0.5px' }}>📌 最新公告</span>}
        placement="right"
        onClose={() => setAnnouncementsDrawerVisible(false)}
        open={announcementsDrawerVisible}
        width={screens.xs ? '100%' : 420}
        closeIcon={<span style={{ color: 'rgba(255,255,255,0.65)', fontSize: 16 }}>✕</span>}
        styles={{
          mask: {
            background: 'rgba(0,0,0,0.45)',
          },
          content: {
            background: 'rgba(30, 30, 30, 0.45)', // Make it more transparent
            backdropFilter: 'blur(40px) saturate(200%)',
            WebkitBackdropFilter: 'blur(40px) saturate(200%)',
            borderLeft: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '-10px 0 40px rgba(0,0,0,0.6)',
          },
          header: {
            background: 'transparent',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            padding: '20px 24px',
          },
          body: {
            padding: '24px 20px',
          }
        }}
      >
        <List
          itemLayout="vertical"
          dataSource={announcements}
          split={false}
          locale={{ emptyText: <div style={{ color: 'rgba(255,255,255,0.45)', padding: '40px 0', textAlign: 'center' }}>暂无公告信息</div> }}
          renderItem={(item) => (
              <div 
              key={item.id} 
              style={{ 
                background: 'rgba(255, 255, 255, 0.04)',
                borderRadius: 16,
                padding: '20px',
                marginBottom: 16,
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  {item.is_pinned === 1 && (
                    <div style={{ 
                      background: 'linear-gradient(135deg, #1677ff 0%, #36cfc9 100%)',
                      color: '#fff',
                      fontSize: 12,
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: 6,
                      marginTop: 2,
                      whiteSpace: 'nowrap'
                    }}>
                      置顶
                    </div>
                  )}
                  <div style={{ color: '#fff', fontSize: 16, fontWeight: 600, lineHeight: 1.5, letterSpacing: '0.3px' }}>
                    {item.title}
                  </div>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>
                  <ScheduleOutlined />
                  {new Date(item.created_at).toLocaleString(i18n.language === 'en' ? 'en-US' : 'zh-CN', {
                    year: 'numeric', month: '2-digit', day: '2-digit',
                    hour: '2-digit', minute: '2-digit'
                  })}
                </div>
              </div>
              
              <div 
                className="quill-content"
                dangerouslySetInnerHTML={{ __html: item.content }} 
                style={{ 
                  color: 'rgba(255,255,255,0.85)', 
                  fontSize: 14, 
                  lineHeight: 1.6,
                  background: 'transparent',
                  padding: '8px 0 0 0',
                  overflowWrap: 'break-word',
                  wordBreak: 'break-all'
                }}
              />
            </div>
          )}
        />
      </Drawer>
    </ConfigProvider>
  );
};

export default DashboardLayout;
