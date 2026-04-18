import { create } from 'zustand';
import type { AllSettings } from '../types';
import request from '../utils/request';

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

const useSettingsStore = create<SettingsState>((set) => ({
  settings: null,
  fetchSettings: async () => {
    try {
      const response = await (request.get('/settings') as any);
      set({ settings: response });
      
      // Update document title if site name exists
      if (response.site?.title) {
        document.title = response.site.title;
      }
      // Update favicon
      updateFavicon(response.site?.favicon);
    } catch (error) {
      console.error('Failed to fetch settings:', error);
    }
  },
  updateStoreSettings: (settings) => {
    set({ settings });
    if (settings.site?.title) {
      document.title = settings.site.title;
    }
    updateFavicon(settings.site?.favicon);
  },
}));

export default useSettingsStore;

