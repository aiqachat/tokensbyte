/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import React, { useEffect } from 'react';
import { ConfigProvider, theme, App } from 'antd';
import { useThemeStore } from '../store/theme';
import zhCN from 'antd/locale/zh_CN';
import enUS from 'antd/locale/en_US';
import jaJP from 'antd/locale/ja_JP';
import koKR from 'antd/locale/ko_KR';
import viVN from 'antd/locale/vi_VN';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import 'dayjs/locale/en';
import 'dayjs/locale/ja';
import 'dayjs/locale/ko';
import 'dayjs/locale/vi';
import { AppMessageBridge } from './AppMessageBridge';
import { getAntdComponentTokens, getAntdThemeTokens } from '../theme/tokens';

export const AppThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const { themeMode, themePreference, setThemePreference } = useThemeStore();
  const { i18n } = useTranslation();

  useEffect(() => {
    // 设置原生 DOM 的 data-theme，用于 CSS 变量切换
    document.body.setAttribute('data-theme', themeMode);
    document.documentElement.setAttribute('data-theme', themeMode);
  }, [themeMode]);

  // Synchronize dayjs locale with react-i18next language
  useEffect(() => {
    const lang = i18n.language || 'zh';
    if (lang.startsWith('zh')) {
      dayjs.locale('zh-cn');
    } else if (lang.startsWith('ja')) {
      dayjs.locale('ja');
    } else if (lang.startsWith('ko')) {
      dayjs.locale('ko');
    } else if (lang.startsWith('vi')) {
      dayjs.locale('vi');
    } else {
      dayjs.locale('en');
    }
  }, [i18n.language]);

  useEffect(() => {
    if (themePreference !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      setThemePreference('system');
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [themePreference, setThemePreference]);

  const mode = themeMode === 'light' ? 'light' : 'dark';
  const token = getAntdThemeTokens(mode);
  const components = getAntdComponentTokens(mode);

  const getAntdLocale = (lang: string) => {
    if (lang.startsWith('zh')) return zhCN;
    if (lang.startsWith('en')) return enUS;
    if (lang.startsWith('ja')) return jaJP;
    if (lang.startsWith('ko')) return koKR;
    if (lang.startsWith('vi')) return viVN;
    return zhCN;
  };

  const locale = getAntdLocale(i18n.language || 'zh');

  return (
    <ConfigProvider
      locale={locale}
      theme={{
        algorithm: mode === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token,
        components,
      }}
    >
      <App>
        <AppMessageBridge>
          {children}
        </AppMessageBridge>
      </App>
    </ConfigProvider>
  );
};
