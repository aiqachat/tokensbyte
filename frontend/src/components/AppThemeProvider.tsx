import React, { useEffect } from 'react';
import { ConfigProvider, theme, App } from 'antd';
import { useThemeStore } from '../store/theme';
import zhCN from 'antd/locale/zh_CN';
import enUS from 'antd/locale/en_US';
import { useTranslation } from 'react-i18next';

export const AppThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const { themeMode } = useThemeStore();
  const { i18n } = useTranslation();

  useEffect(() => {
    // 设置原生 DOM 的 data-theme，用于 CSS 变量切换
    document.body.setAttribute('data-theme', themeMode);
    document.documentElement.setAttribute('data-theme', themeMode);
  }, [themeMode]);

  // Google AI Studio 亮色极简风格映射
  const lightThemeTokens = {
    colorPrimary: '#1677ff',
    borderRadius: 8,
    colorBgLayout: '#f8f9fa',
    colorBgContainer: '#ffffff',
    colorBgElevated: '#ffffff',
    colorTextBase: '#1f2937',
    colorBorderSecondary: '#e5e7eb',
    colorBorder: '#d1d5db',
  };

  const darkThemeTokens = {
    colorPrimary: '#1677ff',
    borderRadius: 8,
    colorBgLayout: '#000000',
    colorBgContainer: '#141414',
    colorBgElevated: '#1f1f1f',
  };

  const locale = i18n.language === 'en' ? enUS : zhCN;

  return (
    <ConfigProvider
      locale={locale}
      theme={{
        algorithm: themeMode === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: themeMode === 'light' ? lightThemeTokens : darkThemeTokens,
        components: {
          Layout: {
            siderBg: themeMode === 'light' ? '#f8f9fa' : '#141414',
            headerBg: themeMode === 'light' ? '#ffffff' : '#141414',
            bodyBg: themeMode === 'light' ? '#f8f9fa' : '#000000',
          },
          Menu: {
            itemHeight: 50,
            iconSize: 20,
            itemMarginInline: 12,
            darkItemBg: '#141414',
          },
          Card: {
            colorBorderSecondary: themeMode === 'light' ? '#e5e7eb' : '#303030',
          },
          Radio: {
            // solid 模式选中文字
            buttonSolidCheckedColor: '#fff',
            buttonSolidCheckedBg: '#1677ff',
          },
        }
      }}
    >
      <App>
        {children}
      </App>
    </ConfigProvider>
  );
};
