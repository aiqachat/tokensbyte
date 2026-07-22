/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type ThemePreference = 'light' | 'dark' | 'system';
export type ThemeMode = 'light' | 'dark';

interface ThemeState {
  themePreference: ThemePreference;
  themeMode: ThemeMode;
  setThemePreference: (pref: ThemePreference) => void;
  toggleTheme: () => void;
  setTheme: (mode: ThemeMode) => void;
}

const getSystemTheme = (): ThemeMode => {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'dark'; // 默认回退到深色
};

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      themePreference: 'dark',
      themeMode: 'dark',
      setThemePreference: (pref) => {
        const mode = pref === 'system' ? getSystemTheme() : pref;
        set({ themePreference: pref, themeMode: mode });
      },
      toggleTheme: () => {
        const nextMode = get().themeMode === 'light' ? 'dark' : 'light';
        set({ themePreference: nextMode, themeMode: nextMode });
      },
      setTheme: (mode) => set({ themePreference: mode, themeMode: mode }),
    }),
    {
      name: 'tokensbyte-theme-storage',
      onRehydrateStorage: () => (state) => {
        if (state && state.themePreference === 'system') {
          state.themeMode = getSystemTheme();
        }
      }
    }
  )
);
