import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';
import zh from './locales/zh.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';

// ── 插件独立多语言 (每个插件在自己的代码目录下维护 locales/) ──
import assetManagerZh from './pages/Plugins/AssetManager/locales/zh.json';
import assetManagerEn from './pages/Plugins/AssetManager/locales/en.json';
import assetManagerJa from './pages/Plugins/AssetManager/locales/ja.json';
import assetManagerKo from './pages/Plugins/AssetManager/locales/ko.json';

import assetManagerIntlZh from './pages/Plugins/AssetManagerIntl/locales/zh.json';
import assetManagerIntlEn from './pages/Plugins/AssetManagerIntl/locales/en.json';
import assetManagerIntlJa from './pages/Plugins/AssetManagerIntl/locales/ja.json';
import assetManagerIntlKo from './pages/Plugins/AssetManagerIntl/locales/ko.json';

import teamMarketingZh from './pages/Plugins/TeamMarketing/locales/zh.json';
import teamMarketingEn from './pages/Plugins/TeamMarketing/locales/en.json';
import teamMarketingJa from './pages/Plugins/TeamMarketing/locales/ja.json';
import teamMarketingKo from './pages/Plugins/TeamMarketing/locales/ko.json';

import routerFlowZh from './pages/Plugins/RouterFlow/locales/zh.json';
import routerFlowEn from './pages/Plugins/RouterFlow/locales/en.json';
import routerFlowJa from './pages/Plugins/RouterFlow/locales/ja.json';
import routerFlowKo from './pages/Plugins/RouterFlow/locales/ko.json';

import modelMarketplaceZh from './pages/Plugins/ModelMarketplace/locales/zh.json';
import modelMarketplaceEn from './pages/Plugins/ModelMarketplace/locales/en.json';
import modelMarketplaceJa from './pages/Plugins/ModelMarketplace/locales/ja.json';
import modelMarketplaceKo from './pages/Plugins/ModelMarketplace/locales/ko.json';

import playgroundZh from './pages/Plugins/Playground/locales/zh.json';
import playgroundEn from './pages/Plugins/Playground/locales/en.json';
import playgroundJa from './pages/Plugins/Playground/locales/ja.json';
import playgroundKo from './pages/Plugins/Playground/locales/ko.json';

import sitePortalZh from './pages/Plugins/SitePortal/locales/zh.json';
import sitePortalEn from './pages/Plugins/SitePortal/locales/en.json';
import sitePortalJa from './pages/Plugins/SitePortal/locales/ja.json';
import sitePortalKo from './pages/Plugins/SitePortal/locales/ko.json';

/** 插件 namespace 注册表：key = namespace（即插件 plugin_name），value = { zh, en, ja, ko, ... } */
export const pluginLocales: Record<string, Record<string, any>> = {
  asset_manager:       { zh: assetManagerZh,      en: assetManagerEn,      ja: assetManagerJa,      ko: assetManagerKo },
  asset_manager_intl:  { zh: assetManagerIntlZh,  en: assetManagerIntlEn,  ja: assetManagerIntlJa,  ko: assetManagerIntlKo },
  team_marketing:      { zh: teamMarketingZh,     en: teamMarketingEn,     ja: teamMarketingJa,     ko: teamMarketingKo },
  router_flow:         { zh: routerFlowZh,        en: routerFlowEn,        ja: routerFlowJa,        ko: routerFlowKo },
  model_marketplace:   { zh: modelMarketplaceZh,  en: modelMarketplaceEn,  ja: modelMarketplaceJa,  ko: modelMarketplaceKo },
  playground:          { zh: playgroundZh,        en: playgroundEn,        ja: playgroundJa,        ko: playgroundKo },
  site_portal:         { zh: sitePortalZh,        en: sitePortalEn,        ja: sitePortalJa,        ko: sitePortalKo },
};

// 构建 resources：将插件 locale 按 namespace 注入到每个语言下
const pluginNs = Object.keys(pluginLocales);
const resources: Record<string, Record<string, any>> = {
  en: { translation: en },
  zh: { translation: zh },
  ja: { translation: ja },
  ko: { translation: ko },
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
