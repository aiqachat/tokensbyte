import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import request from './utils/request';
import Login from './pages/Login/Login';
import Register from './pages/Login/Register';
import ForgotPassword from './pages/Login/ForgotPassword';
import AdminLogin from './pages/AdminLogin/AdminLogin';
import LegalPage from './pages/Legal/LegalPage';
import DashboardLayout from './layouts/DashboardLayout';
import Dashboard from './pages/Dashboard/Dashboard';
import Channels from './pages/Channels/Channels';
import ModelChannelsDisplay from './pages/Channels/ModelChannelsDisplay';
import ChannelTest from './pages/Channels/ChannelTest';
import ChannelConfigs from './pages/Channels/ChannelConfigs';
import Models from './pages/Models/Models';
import ForwardRules from './pages/Models/ForwardRules';
import BillingRules from './pages/Models/BillingRules';
import Tokens from './pages/Tokens/Tokens';
import Upstreams from './pages/Upstreams/Upstreams';

import Users from './pages/Users/Users';
import UserLevels from './pages/Users/UserLevels';
import UserLevelEdit from './pages/Users/UserLevelEdit';
import AdminGroups from './pages/Users/AdminGroups';
import Logs from './pages/Logs/Logs';
import TaskLogs from './pages/Logs/TaskLogs';
import Playground from './pages/Playground/Playground';
import PlaygroundHome from './pages/Playground/PlaygroundHome';
import ModelMarketplace from './pages/ModelMarketplace/ModelMarketplace';
import {
  RelayAPI,
  PluginsList,
  PluginConfig,
  ArkUserDashboard,
  UserAssets,
  AdvancedMarketing,
} from './plugins-registry';
import Redemptions from './pages/Redemptions/Redemptions';
import Profile from './pages/Profile/Profile';
import NotificationSubscription from './pages/Profile/NotificationSubscription';
import Wallet from './pages/Wallet/Wallet';
import RechargeRecords from './pages/Finance/RechargeRecords';
import GiftRecords from './pages/Finance/GiftRecords';
import FinanceDataAnalysis from './pages/Finance/FinanceDataAnalysis';
import OrderDetails from './pages/Finance/OrderDetails';
import Settings from './pages/admin/Settings';
import PaymentSettings from './pages/admin/PaymentSettings';
import MessageNotification from './pages/admin/MessageNotification';
import OAuthSettings from './pages/admin/OAuthSettings';
import RegistrationGifts from './pages/admin/Marketing/RegistrationGifts';
import Announcements from './pages/admin/Marketing/Announcements';
import SystemAbout from './pages/admin/SystemAbout';
import useAuthStore from './store/auth';
import useSettingsStore from './store/settings';


const PrivateRoute = ({ children, adminOnly = false, userOnly = false }: { children: React.ReactNode, adminOnly?: boolean, userOnly?: boolean }) => {
  const { token, user } = useAuthStore();
  const adminPath = localStorage.getItem('tokensbyte_admin_path') || 'admin1688';
  if (!token) return <Navigate to="/login" />;
  if (adminOnly && user?.role !== 'admin') return <Navigate to="/dashboard" />;
  if (userOnly && user?.role === 'admin') return <Navigate to={`/${adminPath}/dashboard`} />;
  return <>{children}</>;
};

const PluginRoute = ({
  children,
  pluginName,
  allowGuest = false,
}: {
  children: React.ReactNode;
  pluginName: string;
  allowGuest?: boolean;
}) => {
  const [loading, setLoading] = React.useState(true);
  const [isActive, setIsActive] = React.useState(false);
  const { user } = useAuthStore();

  React.useEffect(() => {
    const checkPlugin = async () => {
      try {
        const response: any = await request.get('/plugins/active');
        const plugins: any[] = response?.active_plugins || [];
        const matched = plugins.find((p: any) => p.name === pluginName);
        if (!matched) {
          setIsActive(false);
          return;
        }
        if (allowGuest && matched.mp_allow_guest) {
          setIsActive(true);
          return;
        }
        if (!user) {
          setIsActive(false);
          return;
        }
        if (user?.role === 'admin' || matched.allowed_levels === 'all') {
          setIsActive(true);
          return;
        }
        const userGroup = user?.user_group || '';
        const levelId = user?.level_id != null ? String(user.level_id) : '';
        const levels = String(matched.allowed_levels || '').split(',');
        setIsActive(levels.includes(userGroup) || (levelId !== '' && levels.includes(levelId)));
      } catch (e) {
        setIsActive(false);
      } finally {
        setLoading(false);
      }
    };
    checkPlugin();
  }, [pluginName, user, allowGuest]);

  if (loading) return <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>加载中...</div>;
  if (!isActive) {
    if (!user) {
      return <Navigate to="/login" replace />;
    }
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
};

/**
 * UserEndRoute – 用户端根路由守卫
 * 当 site_portal 插件已启用时，访问精确的 '/' 路径会跳转到后端渲染的门户首页 '/home'。
 * 其他子路径（如 /tokens, /docs 等）仍需登录后才能访问。
 */
const UserEndRoute = () => {
  const { token, user } = useAuthStore();
  const location = useLocation();
  const isRootPath = location.pathname === '/';
  const [checking, setChecking] = useState(isRootPath);
  const [portalEnabled, setPortalEnabled] = useState(false);

  useEffect(() => {
    if (!isRootPath) { setChecking(false); return; }
    let cancelled = false;
    request.get('/plugins/active')
      .then((res: any) => {
        if (cancelled) return;
        const active: any[] = res?.active_plugins || [];
        setPortalEnabled(active.some((p: any) => p.name === 'site_portal'));
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setChecking(false); });
    return () => { cancelled = true; };
  }, [isRootPath]);

  // 精确 '/' 路径 & 门户已启用 → 跳转到后端渲染的门户首页
  if (isRootPath && !checking && portalEnabled) {
    window.location.href = '/home';
    return null;
  }
  // 精确 '/' 路径，仍在检测中 → 展示空白避免闪烁
  if (isRootPath && checking) return null;
  const adminPath = localStorage.getItem('tokensbyte_admin_path') || 'admin1688';
  // 非根路径或门户未启用 → 走常规鉴权逻辑
  if (!token) return <Navigate to="/login" />;
  if (user?.role === 'admin') return <Navigate to={`/${adminPath}/dashboard`} />;
  return <DashboardLayout isUserEnd={true} />;
};

const App: React.FC = () => {
  const { fetchSettings } = useSettingsStore();
  const adminPath = localStorage.getItem('tokensbyte_admin_path') || 'admin1688';
  const { i18n } = useTranslation();

  useEffect(() => {
    // Attempt to map zh to zh-CN for better semantics, otherwise use the exact i18n language
    document.documentElement.lang = i18n.language === 'zh' ? 'zh-CN' : (i18n.language || 'en');
  }, [i18n.language]);

  // ─── Affiliate & Team Tracking: 3-day persistent invite codes ───
  // Runs synchronously on EVERY render cycle so child components
  // (Register / Login) can read the stored value immediately.
  // Uses both localStorage AND cookie as dual-storage for maximum reliability.
  React.useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const aff = params.get('aff');
    const team = params.get('team');
    const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

    const persist = (key: string, value: string) => {
      const expiry = Date.now() + THREE_DAYS_MS;
      // localStorage
      localStorage.setItem(key, JSON.stringify({ value, expiry }));
      // cookie (HttpOnly=false so JS can read; path=/ so all routes see it)
      const expires = new Date(expiry).toUTCString();
      document.cookie = `${key}=${encodeURIComponent(value)}; path=/; expires=${expires}; SameSite=Lax`;
    };

    if (aff) persist('tokensbyte_affiliate_code', aff);
    if (team) persist('tokensbyte_team_invite', team);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  return (
    <Router>
      <React.Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: '#666' }}>Loading...</div>}>
        <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path={`/${adminPath}`} element={<AdminLogin />} />
        <Route path="/legal/:type" element={<LegalPage />} />

        <Route
          path="/playground"
          element={
            <PrivateRoute>
              <PluginRoute pluginName="playground">
                <PlaygroundHome />
              </PluginRoute>
            </PrivateRoute>
          }
        />
        <Route
          path="/playground/:projectId"
          element={
            <PrivateRoute>
              <PluginRoute pluginName="playground">
                <Playground />
              </PluginRoute>
            </PrivateRoute>
          }
        />

        {/* Model Marketplace Route (Full Screen, Independent) */}
        {/* Model Marketplace Route (Full Screen, Independent) */}
        <Route
          path="/models"
          element={
            <PluginRoute pluginName="model_marketplace" allowGuest={true}>
              <ModelMarketplace />
            </PluginRoute>
          }
        />

        {/* API Reference Route (Full Screen, Independent) */}
        <Route
          path="/docs"
          element={
            <PluginRoute pluginName="docs_api" allowGuest={true}>
              <RelayAPI />
            </PluginRoute>
          }
        />
        <Route
          path="/docs/:id"
          element={
            <PluginRoute pluginName="docs_api" allowGuest={true}>
              <RelayAPI />
            </PluginRoute>
          }
        />
        <Route
          path="/docs/:category/:id"
          element={
            <PluginRoute pluginName="docs_api" allowGuest={true}>
              <RelayAPI />
            </PluginRoute>
          }
        />

        {/* User End Routes (Default) */}
        <Route
          path="/"
          element={<UserEndRoute />}
        >
          {/* index 由 UserEndRoute 处理：门户启用 → /home，否则 → /login */}
          <Route index element={<Dashboard />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="tokens" element={<Tokens />} />
          <Route path="logs" element={<Logs />} />
          <Route path="task-logs" element={<TaskLogs />} />

          <Route path="wallet" element={<Wallet />} />
          <Route path="assets" element={<PluginRoute pluginName="asset_manager"><UserAssets key="asset_manager" pluginNs="asset_manager" /></PluginRoute>} />
          <Route path="assets-intl" element={<PluginRoute pluginName="asset_manager_intl"><UserAssets key="asset_manager_intl" pluginNs="asset_manager_intl" /></PluginRoute>} />
          <Route path="advanced-marketing" element={<PluginRoute pluginName="team_marketing"><AdvancedMarketing /></PluginRoute>} />

          <Route path="ark-video-monitor" element={<PluginRoute pluginName="volcengine_ark_monitor"><ArkUserDashboard /></PluginRoute>} />
          <Route path="profile" element={<Profile />} />
          <Route path="profile/notifications" element={<NotificationSubscription />} />
        </Route>

        {/* System End Routes */}
        <Route
          path={`/${adminPath}`}
          element={
            <PrivateRoute adminOnly={true}>
              <DashboardLayout isUserEnd={false} />
            </PrivateRoute>
          }
        >
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="docs" element={<RelayAPI />} />
          <Route path="docs/:id" element={<RelayAPI />} />
          <Route path="docs/:category/:id" element={<RelayAPI />} />
          <Route path="upstreams" element={<Upstreams />} />
          <Route path="channel-configs" element={<ChannelConfigs />} />
          <Route path="channels" element={<Channels />} />
          <Route path="channels/model-display" element={<ModelChannelsDisplay />} />
          <Route path="channels/test/:id" element={<ChannelTest />} />
          <Route path="models" element={<Models />} />
          <Route path="forward-rules" element={<ForwardRules />} />
          <Route path="billing-rules" element={<BillingRules />} />
          <Route path="tokens" element={<Tokens />} />

          <Route path="logs" element={<Logs />} />
          <Route path="task-logs" element={<TaskLogs />} />
          <Route path="plugins" element={<PluginsList />} />
          <Route path="plugins/:name/config" element={<PluginConfig />} />

          <Route path="redemptions" element={<Redemptions />} />
          <Route path="users" element={<Users />} />
          <Route path="admins" element={<Users />} />
          <Route path="user-levels" element={<UserLevels />} />
          <Route path="user-levels/:actionId" element={<UserLevelEdit />} />
          <Route path="admin-groups" element={<AdminGroups />} />
          <Route path="finance/recharges" element={<RechargeRecords />} />
          <Route path="finance/gifts" element={<GiftRecords />} />
          <Route path="finance/orders" element={<OrderDetails />} />
          <Route path="finance/analysis" element={<FinanceDataAnalysis />} />
          <Route path="settings" element={<Settings />} />
          <Route path="payment-settings" element={<PaymentSettings />} />
          <Route path="message-notification" element={<MessageNotification />} />
          <Route path="oauth-settings" element={<OAuthSettings />} />
          <Route path="marketing/registration-gifts" element={<RegistrationGifts />} />
          <Route path="marketing/announcements" element={<Announcements />} />
          <Route path="about" element={<SystemAbout />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </React.Suspense>
    </Router>
  );
};

export default App;

