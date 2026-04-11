import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login/Login';
import Register from './pages/Login/Register';
import ForgotPassword from './pages/Login/ForgotPassword';
import AdminLogin from './pages/AdminLogin/AdminLogin';
import DashboardLayout from './layouts/DashboardLayout';
import Dashboard from './pages/Dashboard/Dashboard';
import Channels from './pages/Channels/Channels';
import Models from './pages/Models/Models';
import ForwardRules from './pages/Models/ForwardRules';
import BillingRules from './pages/Models/BillingRules';
import Tokens from './pages/Tokens/Tokens';

import Users from './pages/Users/Users';
import UserLevels from './pages/Users/UserLevels';
import AdminGroups from './pages/Users/AdminGroups';
import Logs from './pages/Logs/Logs';
import TaskLogs from './pages/Logs/TaskLogs';
import Redemptions from './pages/Redemptions/Redemptions';
import Profile from './pages/Profile/Profile';
import Wallet from './pages/Wallet/Wallet';
import RechargeRecords from './pages/Finance/RechargeRecords';
import OrderDetails from './pages/Finance/OrderDetails';
import Settings from './pages/admin/Settings';
import RegistrationGifts from './pages/admin/Marketing/RegistrationGifts';
import useAuthStore from './store/auth';
import useSettingsStore from './store/settings';
import { useEffect } from 'react';

const PrivateRoute = ({ children, adminOnly = false }: { children: React.ReactNode, adminOnly?: boolean }) => {
  const { token, user } = useAuthStore();
  if (!token) return <Navigate to="/login" />;
  if (adminOnly && user?.role !== 'admin') return <Navigate to="/" />;
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

        {/* User End Routes (Default) */}
        <Route
          path="/"
          element={
            <PrivateRoute>
              <DashboardLayout isUserEnd={true} />
            </PrivateRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="tokens" element={<Tokens />} />
          <Route path="logs" element={<Logs />} />
          <Route path="task-logs" element={<TaskLogs />} />
          <Route path="wallet" element={<Wallet />} />
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
          <Route path="channels" element={<Channels />} />
          <Route path="models" element={<Models />} />
          <Route path="forward-rules" element={<ForwardRules />} />
          <Route path="billing-rules" element={<BillingRules />} />
          <Route path="tokens" element={<Tokens />} />

          <Route path="logs" element={<Logs />} />
          <Route path="task-logs" element={<TaskLogs />} />
          <Route path="redemptions" element={<Redemptions />} />
          <Route path="users" element={<Users />} />
          <Route path="admins" element={<Users />} />
          <Route path="user-levels" element={<UserLevels />} />
          <Route path="admin-groups" element={<AdminGroups />} />
          <Route path="finance/recharges" element={<RechargeRecords />} />
          <Route path="finance/orders" element={<OrderDetails />} />
          <Route path="settings" element={<Settings />} />
          <Route path="marketing/registration-gifts" element={<RegistrationGifts />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
};

export default App;

