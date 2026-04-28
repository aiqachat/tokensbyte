import { create } from 'zustand';
import type { User } from '../types';


interface AuthState {
  user: User | null;
  token: string | null;
  isLoggedIn: boolean;
  setUser: (user: User | null, useSession?: boolean) => void;
  setToken: (token: string | null, useSession?: boolean) => void;
  logout: () => void;
}

const useAuthStore = create<AuthState>((set) => ({
  user: JSON.parse(sessionStorage.getItem('user') || localStorage.getItem('user') || 'null'),
  token: sessionStorage.getItem('token') || localStorage.getItem('token'),
  isLoggedIn: !!(sessionStorage.getItem('token') || localStorage.getItem('token')),
  setUser: (user, useSession = false) => {
    if (user) {
      if (useSession) {
        sessionStorage.setItem('user', JSON.stringify(user));
      } else {
        localStorage.setItem('user', JSON.stringify(user));
        sessionStorage.removeItem('user');
      }
    } else {
      localStorage.removeItem('user');
      sessionStorage.removeItem('user');
    }
    set({ user });
  },
  setToken: (token, useSession = false) => {
    if (token) {
      if (useSession) {
        sessionStorage.setItem('token', token);
      } else {
        localStorage.setItem('token', token);
        sessionStorage.removeItem('token');
      }
    } else {
      localStorage.removeItem('token');
      sessionStorage.removeItem('token');
    }
    set({ token, isLoggedIn: !!token });
  },
  logout: () => {
    if (sessionStorage.getItem('token')) {
      // 代理登录状态下，退出只清除 session，保留 admin 的 local 状态
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('user');
      const fallbackToken = localStorage.getItem('token');
      const fallbackUser = JSON.parse(localStorage.getItem('user') || 'null');
      set({ user: fallbackUser, token: fallbackToken, isLoggedIn: !!fallbackToken });
    } else {
      // 正常退出登录
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('user');
      set({ user: null, token: null, isLoggedIn: false });
    }
  },
}));

export default useAuthStore;
