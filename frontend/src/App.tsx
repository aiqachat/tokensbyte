import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login/Login';
import Register from './pages/Login/Register';
import ForgotPassword from './pages/Login/ForgotPassword';
import AdminLogin from './pages/AdminLogin/AdminLogin';
import LegalPage from './pages/Legal/LegalPage';
import DashboardLayout from './layouts/DashboardLayout';
import Dashboard from './pages/Dashboard/Dashboard';
import RelayAPI from './pages/RelayAPI/RelayAPI';
import Channels from './pages/Channels/Channels';
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
import PluginsList from './pages/Plugins/PluginsList';
import PluginConfig from './pages/Plugins/PluginConfig';
import UserAssets from './pages/UserAssets/UserAssets';
import AdvancedMarketing from './pages/AdvancedMarketing/AdvancedMarketing';
import Playground from './pages/Playground/Playground';
import PlaygroundHome from './pages/Playground/PlaygroundHome';

import Redemptions from './pages/Redemptions/Redemptions';
import Profile from './pages/Profile/Profile';
import Wallet from './pages/Wallet/Wallet';
import RechargeRecords from './pages/Finance/RechargeRecords';
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
import { useEffect } from 'react';

const PrivateRoute = ({ children, adminOnly = false, userOnly = false }: { children: React.ReactNode, adminOnly?: boolean, userOnly?: boolean }) => {
  const { token, user } = useAuthStore();
  if (!token) return <Navigate to="/login" />;
  if (adminOnly && user?.role !== 'admin') return <Navigate to="/" />;
  if (userOnly && user?.role === 'admin') return <Navigate to="/admin0755/dashboard" />;
  return <>{children}</>;
};

const App: React.FC = () => {
  const { fetchSettings } = useSettingsStore();

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  return (
    <Router>
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/admin0755" element={<AdminLogin />} />
        <Route path="/legal/:type" element={<LegalPage />} />

        {/* Playground Routes (Full Screen, Independent) */}
        <Route
          path="/playground"
          element={
            <PrivateRoute userOnly={true}>
              <PlaygroundHome />
            </PrivateRoute>
          }
        />
        <Route
          path="/playground/:projectId"
          element={
            <PrivateRoute userOnly={true}>
              <Playground />
            </PrivateRoute>
          }
        />

        {/* User End Routes (Default) */}
        <Route
          path="/"
          element={
            <PrivateRoute userOnly={true}>
              <DashboardLayout isUserEnd={true} />
            </PrivateRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="relay-api" element={<RelayAPI />} />
          <Route path="tokens" element={<Tokens />} />
          <Route path="logs" element={<Logs />} />
          <Route path="task-logs" element={<TaskLogs />} />

          <Route path="wallet" element={<Wallet />} />
          <Route path="assets" element={<UserAssets />} />
          <Route path="advanced-marketing" element={<AdvancedMarketing />} />
          <Route path="profile" element={<Profile />} />
        </Route>

        {/* System End Routes (/admin0755) */}
        <Route
          path="/admin0755"
          element={
            <PrivateRoute adminOnly={true}>
              <DashboardLayout isUserEnd={false} />
            </PrivateRoute>
          }
        >
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="relay-api" element={<RelayAPI />} />
          <Route path="upstreams" element={<Upstreams />} />
          <Route path="channel-configs" element={<ChannelConfigs />} />
          <Route path="channels" element={<Channels />} />
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
          <Route path="finance/orders" element={<OrderDetails />} />
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
    </Router>
  );
};

export default App;

