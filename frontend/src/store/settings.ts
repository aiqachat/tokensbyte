import { create } from 'zustand';
import type { AllSettings } from '../types';
import request from '../utils/request';
import { useThemeStore } from './theme';

interface SettingsState {
  settings: AllSettings | null;
  fetchSettings: () => Promise<void>;
  updateStoreSettings: (settings: AllSettings) => void;
}

const updateFavicon = (url?: string) => {
  const link = document.querySelector("link[rel*='icon']") as HTMLLinkElement
    || document.createElement('link');
  link.rel = 'icon';
  link.href = url || '/favicon.svg';
  if (!link.parentNode) {
    document.head.appendChild(link);
  }
};

const updateMeta = (name: string, content?: string) => {
  if (!content) return;
  let meta = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = name;
    document.head.appendChild(meta);
  }
  meta.content = content;
};

const applyThemeSettings = (site?: AllSettings['site']) => {
  if (!site) return;
  const themeStore = useThemeStore.getState();
  // 如果主题切换被禁用，强制使用默认主题
  if (site.enable_theme_toggle === false) {
    const defaultTheme = site.default_theme || 'dark';
    themeStore.setTheme(defaultTheme);
    return;
  }
  // 如果用户从未手动切换过主题（无 localStorage 记录），则使用站点默认主题
  const stored = localStorage.getItem('tokensbyte-theme-storage');
  if (!stored && site.default_theme) {
    themeStore.setTheme(site.default_theme);
  }
};

const applySiteSettings = (site?: AllSettings['site']) => {
  if (!site) return;
  if (site.title) document.title = site.title;
  updateFavicon(site.favicon);
  updateMeta('keywords', site.keywords);
  updateMeta('description', site.description);
  applyThemeSettings(site);
};

const useSettingsStore = create<SettingsState>((set) => ({
  settings: null,
  fetchSettings: async () => {
    try {
      const response = await (request.get('/settings') as any);
      set({ settings: response });
      applySiteSettings(response.site);
    } catch (error) {
      console.error('Failed to fetch settings:', error);
    }
  },
  updateStoreSettings: (settings) => {
    set({ settings });
    applySiteSettings(settings.site);
  },
}));

export default useSettingsStore;
