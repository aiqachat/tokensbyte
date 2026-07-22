/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import { create } from 'zustand';
import type { AllSettings } from '../types';
import request from '../utils/request';
import { useThemeStore } from './theme';

interface SettingsState {
  settings: AllSettings | null;
  /** 拉取公开设置（去重保护：已有数据时跳过请求，force=true 强制刷新） */
  fetchSettings: (force?: boolean) => Promise<void>;
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
  if (site.title) {
    document.title = site.title;
    localStorage.setItem('tokensbyte_site_title', site.title);
  }
  if (site.admin_path) {
    localStorage.setItem('tokensbyte_admin_path', site.admin_path);
  }
  updateFavicon(site.favicon);
  updateMeta('keywords', site.keywords);
  updateMeta('description', site.description);
  applyThemeSettings(site);
};

// 页面加载时立即使用缓存的站点标题，避免闪烁
const cachedTitle = localStorage.getItem('tokensbyte_site_title');
if (cachedTitle) document.title = cachedTitle;

// 防止并发请求的锁
let _fetchingPromise: Promise<void> | null = null;

const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: null,
  fetchSettings: async (force = false) => {
    // 去重：已有数据且非强制刷新时跳过
    if (!force && get().settings) return;
    // 防并发：如果正在请求中，复用同一个 Promise
    if (_fetchingPromise) return _fetchingPromise;
    _fetchingPromise = (async () => {
      try {
        const response = await (request.get('/settings') as any);
        set({ settings: response });
        applySiteSettings(response.site);
      } catch (error) {
        console.error('Failed to fetch settings:', error);
      } finally {
        _fetchingPromise = null;
      }
    })();
    return _fetchingPromise;
  },
  updateStoreSettings: (settings) => {
    set({ settings });
    applySiteSettings(settings.site);
  },
}));

export default useSettingsStore;

