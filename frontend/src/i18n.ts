/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';
import zh from './locales/zh.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';
import vi from './locales/vi.json';

// ── 插件独立多语言 (动态加载) ──
const pluginLocaleFiles = import.meta.glob('./pages/Plugins/*/locales/*.json', { eager: true });

// 工具函数：将大驼峰目录名转为 snake_case (例如 AssetManager -> asset_manager)
const toSnakeCase = (str: string) => str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`).replace(/^_/, '');

/** 动态收集插件 namespace 注册表 */
export const pluginLocales: Record<string, Record<string, any>> = {};

Object.keys(pluginLocaleFiles).forEach((path) => {
  // path 类似于 "./pages/Plugins/AssetManager/locales/zh.json"
  const parts = path.split('/');
  if (parts.length >= 5) {
    const pluginDir = parts[3]; // "AssetManager"
    const langFile = parts[5];  // "zh.json"
    const lang = langFile.replace('.json', ''); // "zh"
    const ns = toSnakeCase(pluginDir);
    
    if (!pluginLocales[ns]) {
      pluginLocales[ns] = {};
    }
    // @ts-ignore
    pluginLocales[ns][lang] = pluginLocaleFiles[path].default || pluginLocaleFiles[path];
  }
});

// 构建 resources：将插件 locale 按 namespace 注入到每个语言下
const pluginNs = Object.keys(pluginLocales);
const resources: Record<string, Record<string, any>> = {
  en: { translation: en },
  zh: { translation: zh },
  ja: { translation: ja },
  ko: { translation: ko },
  vi: { translation: vi },
};

for (const ns of pluginNs) {
  for (const lng of Object.keys(pluginLocales[ns])) {
    if (!resources[lng]) resources[lng] = {};
    resources[lng][ns] = pluginLocales[ns][lng];
  }
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    ns: ['translation', ...pluginNs],
    defaultNS: 'translation',
    fallbackLng: 'zh',
    lng: localStorage.getItem('i18nextLng') || 'zh', // Force zh as default if not set
    interpolation: {
      escapeValue: false, // react already safes from xss
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
  });

export default i18n;
