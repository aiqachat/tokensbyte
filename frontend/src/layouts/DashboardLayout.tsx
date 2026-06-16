import React, { useState, useEffect, useRef } from 'react';
import request from '../utils/request';
import useSettingsStore from '../store/settings';
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
  FolderOpenOutlined,
  ExperimentOutlined,
  InfoCircleOutlined,
  BellOutlined,
  ShopOutlined,
  SunOutlined,
  MoonOutlined,
  ApartmentOutlined,
} from '@ant-design/icons';

import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Dropdown, Modal, message, Popover, Avatar, Divider, Drawer, List, Badge, Tooltip } from 'antd';
import type { MenuProps } from 'antd';
import type { Announcement } from '../types';
import useAuthStore from '../store/auth';
import { useThemeStore } from '../store/theme';
import UserAvatarMenu from '../components/UserAvatarMenu';

const { Header, Sider, Content } = Layout;
const { Title } = Typography;
const { useBreakpoint } = Grid;

interface DashboardLayoutProps {
  isUserEnd?: boolean;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ isUserEnd = false }) => {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const saved = localStorage.getItem('sidebar_collapsed');
      return saved !== null ? JSON.parse(saved) : false;
    } catch (e) {
      return false;
    }
  });

  const handleCollapsedChange = (val: boolean) => {
    setCollapsed(val);
    localStorage.setItem('sidebar_collapsed', JSON.stringify(val));
  };

  const screens = useBreakpoint();
  const [openKeys, setOpenKeys] = useState<string[]>([]);


  const { user, logout, setUser, isLoggedIn } = useAuthStore();
  const { themeMode, toggleTheme } = useThemeStore();
  // 复用 App.tsx 中已拉取的 settings store，不再独立调 /settings 接口
  const { settings } = useSettingsStore();
  const site = settings?.site;
  const siteName = isUserEnd ? (site?.name || 'TokensByte') : `${site?.name || 'TokensByte'}${t('common.admin_suffix', '管理后台')}`;
  const siteLogo = site?.logo || '';
  const siteTitle = site?.title || '';
  const enableMultilingual = site?.enable_multilingual !== false;
  const enableThemeToggle = site?.enable_theme_toggle !== false;
  const supportedLanguages = site?.supported_languages?.length ? site.supported_languages : ['zh', 'en'];
  const agreement = settings?.agreement || null;

  const [announcementsDrawerVisible, setAnnouncementsDrawerVisible] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activePlugins, setActivePlugins] = useState<any[]>([]);

  useEffect(() => {
    fetchActivePlugins();
    if (isLoggedIn) {
      fetchCurrentUser();
    }
  }, [isLoggedIn]);

  // 站点默认语言：仅在用户从未手动切换过语言时自动应用
  useEffect(() => {
    if (site?.default_language && !localStorage.getItem('i18nextLng')) {
      i18n.changeLanguage(site.default_language);
    }
  }, [site?.default_language]);

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


  const showSystemAbout = () => {
    navigate('/admin0755/about');
  };

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
    localStorage.setItem('i18nextLng', lng);
  };

  /** 语言代码 → 显示名称映射 */
  const langNameMap: Record<string, string> = {
    zh: '简体中文', en: 'English', ja: '日本語', ko: '한국어',
    fr: 'Français', de: 'Deutsch', es: 'Español', pt: 'Português',
    ru: 'Русский', ar: 'العربية',
  };

  const implementedLangs = i18n.options.resources ? Object.keys(i18n.options.resources) : ['zh', 'en'];

  const langItems: MenuProps['items'] = supportedLanguages
    .filter(lng => implementedLangs.includes(lng))
    .map(lng => ({
      key: lng,
      label: langNameMap[lng] || lng,
      onClick: () => changeLanguage(lng),
    }));

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

  // 插件菜单：检查用户等级是否在插件允许范围内
  const isPluginVisibleForUser = (pluginName: string) => {
    const plugin = activePlugins.find((p: any) => p.name === pluginName);
    if (!plugin) return false;
    if (plugin.allowed_levels === 'all') return true;
    if (!isUserEnd) return true; // 管理员端始终显示
    const allowed = plugin.allowed_levels.split(',');
    const userGroup = user?.user_group || '';
    const levelId = user?.level_id != null ? String(user.level_id) : '';
    return allowed.includes(userGroup) || (levelId !== '' && allowed.includes(levelId));
  };

  const menuItems: MenuProps['items'] = [];
  const isSuperAdmin = !isUserEnd && user?.role === 'admin' && !user.admin_group_id;

  const getMenuLabel = (item: any) => {
    const isEn = i18n.language === 'en';
    return isEn ? (item.label_en || item.label_zh) : (item.label_zh || item.label_en);
  };

  const getMenuIcon = (iconName: string) => {
    const iconStyle = { fontSize: '18px' };
    switch (iconName) {
      case 'DashboardOutlined': return <DashboardOutlined style={iconStyle} />;
      case 'ExperimentOutlined': return <ExperimentOutlined style={iconStyle} />;
      case 'RocketOutlined': return <RocketOutlined style={iconStyle} />;
      case 'KeyOutlined': return <KeyOutlined style={iconStyle} />;
      case 'HistoryOutlined': return <HistoryOutlined style={iconStyle} />;
      case 'ScheduleOutlined': return <ScheduleOutlined style={iconStyle} />;
      case 'PictureOutlined': return <PictureOutlined style={iconStyle} />;
      case 'FolderOpenOutlined': return <FolderOpenOutlined style={iconStyle} />;
      case 'TeamOutlined': return <TeamOutlined style={iconStyle} />;
      case 'ApartmentOutlined': return <ApartmentOutlined style={iconStyle} />;
      case 'WalletOutlined': return <WalletOutlined style={iconStyle} />;
      case 'UserOutlined': return <UserOutlined style={iconStyle} />;
      default: return <BarsOutlined style={iconStyle} />;
    }
  };

  const isMenuAllowedForUser = (item: any) => {
    if (!item.enabled) return false;
    if (item.allowed_levels === 'all') return true;
    
    const allowed = item.allowed_levels.split(',');
    const userGroup = user?.user_group || '';
    const levelId = user?.level_id != null ? String(user.level_id) : '';
    return allowed.includes(userGroup) || (levelId !== '' && allowed.includes(levelId));
  };

  if (isUserEnd) {
    if (settings) {
      const defaultItems = [
        { key: '/dashboard', label_zh: '系统概览', label_en: 'Dashboard', icon: 'DashboardOutlined', enabled: true, sort_order: 1, allowed_levels: 'all' },
        { key: '/playground', label_zh: '创作中心', label_en: 'Playground', icon: 'ExperimentOutlined', enabled: true, sort_order: 2, allowed_levels: 'all' },
        { key: '/tokens', label_zh: '令牌管理', label_en: 'Tokens', icon: 'KeyOutlined', enabled: true, sort_order: 4, allowed_levels: 'all' },
        { key: '/logs', label_zh: '使用日志', label_en: 'Logs', icon: 'HistoryOutlined', enabled: true, sort_order: 5, allowed_levels: 'all' },
        { key: '/task-logs', label_zh: '任务日志', label_en: 'Task Logs', icon: 'ScheduleOutlined', enabled: true, sort_order: 6, allowed_levels: 'all' },
        { key: '/assets', label_zh: '素材管理', label_en: 'Assets', icon: 'PictureOutlined', enabled: true, sort_order: 7, allowed_levels: 'all' },
        { key: '/assets-intl', label_zh: '资产管理', label_en: 'Assets Intl', icon: 'FolderOpenOutlined', enabled: true, sort_order: 8, allowed_levels: 'all' },
        { key: '/advanced-marketing', label_zh: '高级推广', label_en: 'Advanced Marketing', icon: 'TeamOutlined', enabled: true, sort_order: 9, allowed_levels: 'all' },
        { key: '/smart-router', label_zh: '智能路由', label_en: 'Smart Router', icon: 'ApartmentOutlined', enabled: true, sort_order: 10, allowed_levels: 'all' },
        { key: '/wallet', label_zh: '我的钱包', label_en: 'Wallet', icon: 'WalletOutlined', enabled: true, sort_order: 11, allowed_levels: 'all' },
        { key: '/profile', label_zh: '个人中心', label_en: 'Profile', icon: 'UserOutlined', enabled: true, sort_order: 12, allowed_levels: 'all' },
      ];

      const mergedItems = settings?.menu_config?.items?.length ? [...settings.menu_config.items] : [...defaultItems];

      defaultItems.forEach((defItem) => {
        if (!mergedItems.some((item: any) => item.key === defItem.key)) {
          mergedItems.push({
            ...defItem,
            sort_order: mergedItems.length + 1
          });
        }
      });

      const sortedConfigs = mergedItems.sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0));

      sortedConfigs.forEach((item: any) => {
        if (!isMenuAllowedForUser(item)) return;
        if (item.key === '/relay-api') return; // Completely hide API tutorial from left menu

        if (item.key === '/playground' && !isPluginVisibleForUser('playground')) return;
        if (item.key === '/assets' && !isPluginVisibleForUser('asset_manager')) return;
        if (item.key === '/assets-intl' && !isPluginVisibleForUser('asset_manager_intl')) return;
        if (item.key === '/advanced-marketing' && !isPluginVisibleForUser('team_marketing')) return;
        if (item.key === '/smart-router' && !isPluginVisibleForUser('router_flow')) return;

        let labelNode;
        if (item.key === '/playground') {
          const isImpersonating = !!sessionStorage.getItem('token');
          labelNode = isImpersonating ? (
            <a onClick={(e) => {
              e.preventDefault();
              const impToken = sessionStorage.getItem('token');
              window.open(`${window.location.origin}/login?token=${impToken}&impersonate=1&redirect=/playground`, '_blank');
            }}>{getMenuLabel(item)}</a>
          ) : (
            <Link to="/playground" target="_blank">{getMenuLabel(item)}</Link>
          );
        } else {
          labelNode = <Link to={item.key}>{getMenuLabel(item)}</Link>;
        }

        menuItems.push({
          key: item.key,
          icon: getMenuIcon(item.icon),
          label: labelNode,
        });
      });
    }
  } else {
    // Admin side menu construction
    const isSubAdmin = user?.role === 'admin' && !isSuperAdmin;
    const permissionsLoaded = !!user?.permissions;

    // Only render restricted core menus once permissions are loaded (or if super admin) to prevent flashing
    if (!isSubAdmin || permissionsLoaded) {
      if (!isSubAdmin || user?.permissions?.includes('dashboard')) {
        menuItems.push({
          key: '/admin0755/dashboard',
          icon: <DashboardOutlined style={{ fontSize: '18px' }} />,
          label: <Link to="/admin0755/dashboard">{t('menu.dashboard')}</Link>,
        });
      }

      // Hide API tutorial from left menu in Admin section as well (since it's moved to header)
      /* 
      if (!isSubAdmin || user?.permissions?.includes('relay_api')) {
        menuItems.push({
          key: '/admin0755/relay-api',
          icon: <RocketOutlined style={{ fontSize: '18px' }} />,
          label: <Link to="/admin0755/relay-api">{t('menu.relay_api')}</Link>,
        });
      }
      */

      if (!isSubAdmin || user?.permissions?.includes('tokens')) {
        menuItems.push({
          key: '/admin0755/tokens',
          icon: <KeyOutlined style={{ fontSize: '18px' }} />,
          label: <Link to="/admin0755/tokens">{t('menu.tokens')}</Link>,
        });
      }

      if (!isSubAdmin || user?.permissions?.includes('logs')) {
        menuItems.push({
          key: '/admin0755/logs',
          icon: <HistoryOutlined style={{ fontSize: '18px' }} />,
          label: <Link to="/admin0755/logs">{t('menu.usage_logs')}</Link>,
        });

        menuItems.push({
          key: '/admin0755/task-logs',
          icon: <ScheduleOutlined style={{ fontSize: '18px' }} />,
          label: <Link to="/admin0755/task-logs">{t('menu.task_logs')}</Link>,
        });
      }
    }
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
          label: <Link to="/admin0755/channel-configs">{t('menu.channel_configs', '上游渠道配置')}</Link>,
        },
      ];
      /*
      if (hasPermission('upstreams') || isSuperAdmin) {
        channelChildren.push({
          key: '/admin0755/upstreams',
          label: <Link to="/admin0755/upstreams">{t('menu.upstreams', '上游管理')}</Link>,
        });
      }
      */
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
            key: '/admin0755/billing-rules',
            label: <Link to="/admin0755/billing-rules">{t('menu.billing_rules')}</Link>,
          },
          {
            key: '/admin0755/forward-rules',
            label: <Link to="/admin0755/forward-rules">{t('menu.forward_rules')}</Link>,
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
            key: '/admin0755/finance/gifts',
            label: <Link to="/admin0755/finance/gifts">{t('menu.finance_gifts')}</Link>,
          },
          {
            key: '/admin0755/finance/orders',
            label: <Link to="/admin0755/finance/orders">{t('menu.finance_orders')}</Link>,
          },
          {
            key: '/admin0755/finance/analysis',
            label: <Link to="/admin0755/finance/analysis">{t('menu.finance_analysis', '财务数据分析')}</Link>,
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

    if ((isSuperAdmin || hasPermission('plugins')) && import.meta.env.VITE_ENABLE_PLUGINS === 'true') {
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

  const getActiveOpenKeys = () => {
    return menuItems
      .filter((item: any) => item?.children?.some((child: any) => child.key === location.pathname + location.search))
      .map((item: any) => item.key as string);
  };

  useEffect(() => {
    if (!collapsed) {
      setOpenKeys(getActiveOpenKeys());
    }
  }, [collapsed, location.pathname, location.search, activePlugins.length]);

  pageName = findName(menuItems) || '';
  if (!pageName) {
    if (location.pathname === '/profile') pageName = t('menu.profile', '个人中心') as string;
    else if (location.pathname === '/wallet') pageName = t('menu.wallet', '我的钱包') as string;
    else if (location.pathname === '/assets') pageName = t('menu.assets', '素材资产管理') as string;
    else if (location.pathname === '/assets-intl') pageName = t('menu.assets_intl', '资产管理') as string;
    else if (location.pathname === '/advanced-marketing') pageName = t('menu.advanced_marketing', '团队营销管理') as string;
    else if (location.pathname === '/smart-router') pageName = t('menu.smart_router', '智能路由') as string;
    else if (location.pathname === '/playground') pageName = t('menu.playground', '创作中心') as string;
  }

  useEffect(() => {
    if (pageName && siteTitle) {
      document.title = `${pageName}-${siteTitle}`;
    } else if (siteTitle) {
      document.title = siteTitle;
    }
  }, [pageName, siteTitle]);

  const isLight = themeMode === 'light';
  const borderBottom = isLight ? '1px solid #f0f0f0' : '1px solid rgba(255,255,255,0.08)';
  const cardBg = isLight ? '#f9fafb' : 'rgba(255, 255, 255, 0.04)';
  const cardHoverBg = isLight ? '#f3f4f6' : 'rgba(255, 255, 255, 0.08)';
  const titleColor = isLight ? '#1f2937' : '#fff';
  const timeColor = isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.4)';
  const contentColor = isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.7)';
  const emptyIconColor = isLight ? '#e5e7eb' : 'rgba(255,255,255,0.1)';
  const emptyTextColor = isLight ? '#6b7280' : '#e5e5e5';
  const emptySubtextColor = isLight ? '#9ca3af' : 'rgba(255,255,255,0.45)';

  const announcementContent = (
    <div style={{ width: 360, display: 'flex', flexDirection: 'column' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 20px', borderBottom
      }}>
        <span style={{ color: titleColor, fontSize: 16, fontWeight: 500 }}>{t('header.notifications', '通知')}</span>
      </div>

      <div style={{
        maxHeight: 480, overflowY: 'auto', padding: announcements.length > 0 ? '16px' : '60px 20px',
        display: 'flex', flexDirection: 'column',
      }}>
        {announcements.length > 0 ? (
          <List
            itemLayout="vertical"
            dataSource={announcements}
            split={false}
            renderItem={(item) => (
              <div
                key={item.id}
                style={{
                  background: cardBg,
                  borderRadius: 12,
                  padding: '16px',
                  marginBottom: 12,
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = cardHoverBg;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = cardBg;
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    {item.is_pinned === 1 && (
                      <div style={{
                        background: 'rgba(22, 119, 255, 0.1)', color: '#1677ff', fontSize: 12,
                        padding: '2px 6px', borderRadius: 4, marginTop: 2, whiteSpace: 'nowrap'
                      }}>
                        {t('common.pinned', '置顶')}
                      </div>
                    )}
                    <div style={{ color: titleColor, fontSize: 15, fontWeight: 500, lineHeight: 1.5 }}>
                      {item.title}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: timeColor, fontSize: 12 }}>
                    <ScheduleOutlined />
                    {new Date(item.created_at).toLocaleString(i18n.language === 'en' ? 'en-US' : 'zh-CN', {
                      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
                    })}
                  </div>
                </div>

                <div
                  className="quill-content"
                  dangerouslySetInnerHTML={{ __html: item.content }}
                  style={{
                    color: contentColor, fontSize: 13, lineHeight: 1.6,
                    background: 'transparent', padding: '0', overflowWrap: 'break-word', wordBreak: 'break-all'
                  }}
                />
              </div>
            )}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <BellOutlined style={{ fontSize: 64, color: emptyIconColor, marginBottom: 24 }} />
            <div style={{ color: emptyTextColor, fontSize: 15, fontWeight: 500, marginBottom: 8 }}>{t('header.no_notifications', '你的通知将出现在这里')}</div>
            <div style={{ color: emptySubtextColor, fontSize: 13, lineHeight: 1.6, maxWidth: 260 }}>
              {t('header.no_notifications_desc', '平台重要公告及更新内容将在这里展示，即可第一时间收到通知。')}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <ConfigProvider
      theme={{

        token: {
          colorPrimary: '#1677ff',
          borderRadius: 8,
        },
        components: {
          Layout: {
            /* siderBg handled by global */
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
          theme={themeMode}
          width={200}
          breakpoint="lg"
          collapsedWidth={screens.xs ? 0 : 68}
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
            <div style={{ height: screens.xs ? 48 : 56, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 8px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              {siteLogo ? (
                (collapsed && !screens.xs) ? (
                  <img src={siteLogo} alt="logo" style={{ width: 32, height: 32, objectFit: 'contain' }} />
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', justifyContent: 'center' }}>
                    <img src={siteLogo} alt="logo" style={{ width: 28, height: 28, objectFit: 'contain', flexShrink: 0 }} />
                    <div style={{ color: themeMode === 'light' ? '#1f2937' : '#fff', margin: 0, fontSize: siteName.length > 12 ? 14 : siteName.length > 8 ? 16 : 18, fontWeight: 700, lineHeight: 1.2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-all' }}>
                      {siteName}
                    </div>
                  </div>
                )
              ) : (
                <div style={{ color: themeMode === 'light' ? '#1f2937' : '#fff', margin: 0, fontSize: siteName.length > 12 ? 14 : siteName.length > 8 ? 16 : 18, fontWeight: 700, lineHeight: 1.2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-all', textAlign: 'center' }}>
                  {(collapsed && !screens.xs) ? 'TB' : siteName}
                </div>
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
                      itemHoverBg: themeMode === 'light' ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.08)',
                      itemSelectedBg: themeMode === 'light' ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 255, 255, 0.12)',
                      itemActiveBg: themeMode === 'light' ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.16)',
                      itemSelectedColor: themeMode === 'light' ? '#1f2937' : '#fff',
                      itemHoverColor: themeMode === 'light' ? '#1f2937' : '#fff',
                      itemColor: themeMode === 'light' ? '#4b5563' : 'rgba(255, 255, 255, 0.65)',
                    }
                  }
                }}
              >
                <Menu
                  theme={themeMode}
                  mode="inline"
                  selectedKeys={[location.pathname + location.search]}
                  openKeys={collapsed ? undefined : openKeys}
                  onOpenChange={(keys) => {
                    if (!collapsed) {
                      setOpenKeys(keys);
                    }
                  }}
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
                  style={{ color: themeMode === 'light' ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)', width: '100%', display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start' }}
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
            background: themeMode === 'light' ? '#ffffff' : '#141414',
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
                onClick={() => handleCollapsedChange(!collapsed)}
                style={{ fontSize: '16px', width: screens.xs ? 48 : 56, height: screens.xs ? 48 : 56, color: themeMode === 'light' ? '#1f2937' : '#fff' }}
              />
              {screens.xs && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 8 }}>
                  {siteLogo ? (
                    <img src={siteLogo} alt="logo" style={{ width: 24, height: 24, objectFit: 'contain' }} />
                  ) : (
                    <Title level={5} style={{ color: themeMode === 'light' ? '#1f2937' : '#fff', margin: 0 }}>
                      {siteName}
                    </Title>
                  )}
                </div>
              )}
            </div>

            <Space size={screens.xs ? 4 : 8} align="center">
              <style>{`
                .header-badge.ant-badge {
                  display: flex !important;
                  align-items: center;
                  justify-content: center;
                  height: 40px;
                }
              `}</style>
              {isPluginVisibleForUser('model_marketplace') && (
                <Tooltip title={t('menu.model_marketplace', '模型广场')} placement="bottom">
                  <Button
                    type="text"
                    icon={
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        style={{ verticalAlign: 'middle', transform: 'translateY(1.5px)' }}
                      >
                        <path d="M12 2L19.5 6.2L12 10.5L4.5 6.2Z" fill={themeMode === 'light' ? '#e0e0e0' : '#2e2e2e'} />
                        <path d="M3.5 7.8L11 12V21L3.5 16.8Z" fill={themeMode === 'light' ? '#b0b0b0' : '#555555'} />
                        <path d="M13 12L20.5 7.8V16.8L13 21Z" fill={themeMode === 'light' ? '#757575' : '#9e9e9e'} />
                      </svg>
                    }
                    style={{
                      color: themeMode === 'light' ? '#1f2937' : '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 14,
                      fontWeight: 500,
                      height: 40,
                      padding: '0 12px',
                    }}
                    onClick={() => window.open('/models', '_blank')}
                  >
                    <span style={{ display: 'inline-block', transform: 'translateY(1.5px)' }}>{t('menu.model_marketplace', 'Models')}</span>
                  </Button>
                </Tooltip>
              )}

              <Tooltip title={t('menu.relay_api', 'API教程')} placement="bottom">
                <Button
                  type="text"
                  icon={<RocketOutlined style={{ fontSize: '16px', verticalAlign: 'middle', transform: 'translateY(1.5px)' }} />}
                  style={{
                    color: themeMode === 'light' ? '#1f2937' : '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 14,
                    fontWeight: 500,
                    height: 40,
                    padding: '0 12px',
                  }}
                  onClick={() => window.open('/relay-api', '_blank')}
                >
                  <span style={{ display: 'inline-block', transform: 'translateY(1.5px)' }}>{t('menu.relay_api', 'API教程')}</span>
                </Button>
              </Tooltip>

              {(enableThemeToggle || !isUserEnd) && (
                <Tooltip title={themeMode === 'light' ? t('header.switch_dark_mode', '切换暗色模式') : t('header.switch_light_mode', '切换亮色模式')} placement="bottom" color={themeMode === 'light' ? '#fff' : '#2b2b2b'} overlayInnerStyle={{ color: themeMode === 'light' ? '#1f2937' : '#fff' }}>
                  <Button
                    type="text"
                    shape="circle"
                    onClick={toggleTheme}
                    icon={
                      themeMode === 'light'
                        ? (
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ verticalAlign: 'middle', transform: 'translateY(1.5px)' }}>
                            <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79Z" fill="#757575" />
                          </svg>
                        )
                        : (
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ verticalAlign: 'middle', transform: 'translateY(1.5px)' }}>
                            <circle cx="12" cy="12" r="6" fill="#555555" />
                            <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41" stroke="#9e9e9e" strokeWidth="2.2" strokeLinecap="round" />
                          </svg>
                        )
                    }
                    style={{ color: themeMode === 'light' ? '#1f2937' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40 }}
                  />
                </Tooltip>
              )}

              {enableMultilingual && (
                <Dropdown menu={{ items: langItems }} placement="bottomRight">
                  <Button
                    type="text"
                    shape="circle"
                    icon={
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ verticalAlign: 'middle', transform: 'translateY(1.5px)' }}>
                        <circle cx="12" cy="12" r="8.5" stroke={themeMode === 'light' ? '#757575' : '#9e9e9e'} strokeWidth="2" />
                        <path d="M3.5 12h17" stroke={themeMode === 'light' ? '#b0b0b0' : '#555555'} strokeWidth="2" strokeLinecap="round" />
                        <ellipse cx="12" cy="12" rx="3.5" ry="8.5" stroke={themeMode === 'light' ? '#b0b0b0' : '#555555'} strokeWidth="2" />
                      </svg>
                    }
                    style={{ color: themeMode === 'light' ? '#1f2937' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40 }}
                  />
                </Dropdown>
              )}

              <Popover
                content={announcementContent}
                trigger="click"
                placement="bottomRight"
                overlayClassName="custom-premium-popover"
                open={announcementsDrawerVisible}
                onOpenChange={setAnnouncementsDrawerVisible}
                overlayInnerStyle={{
                  padding: 0,
                  borderRadius: 20,
                  background: themeMode === 'light' ? 'rgba(255, 255, 255, 0.85)' : 'rgba(30, 30, 30, 0.45)',
                  backdropFilter: 'blur(30px) saturate(200%)',
                  WebkitBackdropFilter: 'blur(30px) saturate(200%)',
                  border: themeMode === 'light' ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.15)',
                  boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.1), 0 24px 48px rgba(0,0,0,0.6)',
                  transform: 'translateZ(0)',
                  overflow: 'hidden'
                }}
                arrow={false}
              >
                <Tooltip title={t('header.notifications', '通知')} placement="bottom" color={themeMode === 'light' ? '#fff' : '#2b2b2b'} overlayInnerStyle={{ color: themeMode === 'light' ? '#1f2937' : '#fff' }}>
                  <Badge count={unreadCount} overflowCount={99} offset={[-4, 4]} className="header-badge">
                    <Button
                      type="text"
                      shape="circle"
                      icon={
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                          style={{ verticalAlign: 'middle', transform: 'translateY(1.5px)' }}
                        >
                          <path d="M19 16.5v-6.5a7 7 0 00-14 0v6.5l-2 2h18l-2-2z" fill={themeMode === 'light' ? '#757575' : '#9e9e9e'} stroke={themeMode === 'light' ? '#757575' : '#9e9e9e'} strokeWidth="1.5" strokeLinejoin="round" />
                          <path d="M10 19.5a2 2 0 004 0" stroke={themeMode === 'light' ? '#b0b0b0' : '#555555'} strokeWidth="2.5" strokeLinecap="round" />
                        </svg>
                      }
                      style={{ color: themeMode === 'light' ? '#1f2937' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40 }}
                      onClick={() => {
                        setUnreadCount(0);
                      }}
                    />
                  </Badge>
                </Tooltip>
              </Popover>

              <UserAvatarMenu isUserEnd={isUserEnd} agreement={agreement} />
            </Space>

          </Header>
          <Content style={{
            margin: screens.xs ? '8px' : '12px',
            padding: screens.xs ? 12 : 16,
            minHeight: 280,
            background: themeMode === 'light' ? '#f0f4f9' : '#000',
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
