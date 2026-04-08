import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login/Login';
import DashboardLayout from './layouts/DashboardLayout';
import Dashboard from './pages/Dashboard/Dashboard';
import Channels from './pages/Channels/Channels';
import Tokens from './pages/Tokens/Tokens';
import Users from './pages/Users/Users';
import Logs from './pages/Logs/Logs';
import Redemptions from './pages/Redemptions/Redemptions';
import useAuthStore from './store/auth';


const PrivateRoute = ({ children }: { children: React.ReactNode }) => {
  const token = useAuthStore((state) => state.token);
  return token ? <>{children}</> : <Navigate to="/login" />;
};

const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { token, user } = useAuthStore();
  if (!token) return <Navigate to="/login" />;
  if (user?.role !== 'admin') return <Navigate to="/" />;
  return <>{children}</>;
};

const App: React.FC = () => {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <DashboardLayout />
            </PrivateRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="channels" element={<Channels />} />
          <Route path="tokens" element={<Tokens />} />
          <Route path="logs" element={<Logs />} />
          <Route path="redemptions" element={<AdminRoute><Redemptions /></AdminRoute>} />
          <Route
            path="users"
            element={
              <AdminRoute>
                <Users />
              </AdminRoute>
            }
          />
        </Route>
      </Routes>
    </Router>
  );
};

export default App;
