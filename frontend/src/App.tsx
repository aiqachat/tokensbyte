import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login/Login';
import AdminLogin from './pages/AdminLogin/AdminLogin';
import DashboardLayout from './layouts/DashboardLayout';
import Dashboard from './pages/Dashboard/Dashboard';
import Channels from './pages/Channels/Channels';
import Models from './pages/Models/Models';
import Tokens from './pages/Tokens/Tokens';

import Users from './pages/Users/Users';
import UserLevels from './pages/Users/UserLevels';
import Logs from './pages/Logs/Logs';
import Redemptions from './pages/Redemptions/Redemptions';
import Settings from './pages/admin/Settings';
import useAuthStore from './store/auth';

const PrivateRoute = ({ children, adminOnly = false }: { children: React.ReactNode, adminOnly?: boolean }) => {
  const { token, user } = useAuthStore();
  if (!token) return <Navigate to="/login" />;
  if (adminOnly && user?.role !== 'admin') return <Navigate to="/" />;
  return <>{children}</>;
};

const App: React.FC = () => {
  return (
    <Router>
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<Login />} />
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
          <Route path="tokens" element={<Tokens />} />

          <Route path="logs" element={<Logs />} />
          <Route path="redemptions" element={<Redemptions />} />
          <Route path="users" element={<Users />} />
          <Route path="user-levels" element={<UserLevels />} />
          <Route path="settings" element={<Settings />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
};

export default App;

