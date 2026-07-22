/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import React, { useState, useEffect } from 'react';
import { Tooltip, Dropdown } from 'antd';
import { GlobalOutlined, SunOutlined, MoonOutlined } from '@ant-design/icons';
import { Terminal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useThemeStore } from '../store/theme';
import useSettingsStore from '../store/settings';
import { GridStarsEffect } from '../components/GridStarsEffect';

export interface AuthMethodOption {
  key: string;
  label: string;
  icon: React.ReactNode;
  brandColor?: string;
  onClick?: () => void;
}

interface AuthLayoutProps {
  title: string;
  subtitle?: string;
  logo?: string | null;
  loading?: boolean;
  children: React.ReactNode;
  bottomLinks?: React.ReactNode;
  
  methodsLabel?: string;
  methods?: AuthMethodOption[];
  activeMethod?: string;
  onMethodChange?: (key: string) => void;
}

const AuthLayout: React.FC<AuthLayoutProps> = ({
  title,
  subtitle,
  logo,
  loading,
  children,
  bottomLinks,
  methodsLabel,
  methods,
  activeMethod,
  onMethodChange,
}) => {
  const { i18n, t } = useTranslation();
  const { themeMode, toggleTheme } = useThemeStore();
  const { settings } = useSettingsStore();

  // 乐观使用本地缓存的登录风格，彻底消除刷新时从默认 split 闪现到 classic 的突兀感
  const [loginStyle, setLoginStyle] = useState<'split' | 'classic'>(() => {
    return (localStorage.getItem('tokensbyte_login_style') as 'split' | 'classic') || 'split';
  });

  // 记录配置数据是否已完全就绪 (如果 settings 已经在内存里就绪则直接为 true 以防路由热跳转时发生多余的淡入延迟)
  const [isReady, setIsReady] = useState(() => !!settings);

  useEffect(() => {
    // 如果 settings 已成功加载，或者外部的 loading 状态已经结束 (不论网络请求成败)
    if (settings || loading === false) {
      setIsReady(true);
      if (settings?.site?.login_style) {
        setLoginStyle(settings.site.login_style as 'split' | 'classic');
        localStorage.setItem('tokensbyte_login_style', settings.site.login_style);
      }
    }
  }, [settings, loading]);
  
  const enableThemeToggle = settings?.site?.enable_theme_toggle !== false;
  const enableMultilingual = settings?.site?.enable_multilingual !== false;

  const langNameMap: Record<string, string> = {
    zh: '简体中文', en: 'English', ja: '日本語', ko: '한국어', vi: 'Tiếng Việt',
    fr: 'Français', de: 'Deutsch', es: 'Español', pt: 'Português',
    ru: 'Русский', ar: 'العربية',
  };

  const supportedLanguages = settings?.site?.supported_languages?.length ? settings.site.supported_languages : ['zh', 'en'];
  const implementedLangs = i18n.options.resources ? Object.keys(i18n.options.resources) : ['zh', 'en'];

  const langItems = supportedLanguages
    .filter(lng => implementedLangs.includes(lng))
    .map(lng => ({
      key: lng,
      label: langNameMap[lng] || lng,
      onClick: () => {
        i18n.changeLanguage(lng);
        localStorage.setItem('i18nextLng', lng);
      },
    }));

  const getLanguageLabel = () => {
    return langNameMap[i18n.language] || i18n.language.toUpperCase();
  };

  const renderIconBtn = (method: AuthMethodOption) => {
    const isActive = activeMethod === method.key;
    return (
      <Tooltip key={method.key} title={method.label}>
        <button
          type="button"
          onClick={method.onClick ? method.onClick : () => onMethodChange?.(method.key)}
          className={`flex items-center justify-center w-10 h-10 rounded-md border text-sm transition-all duration-200 cursor-pointer
            ${isActive 
              ? 'bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-50 shadow-inner' 
              : 'bg-background border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700 text-zinc-500 dark:text-zinc-400'
            }`}
        >
          <span className="text-base flex items-center justify-center">{method.icon}</span>
        </button>
      </Tooltip>
    );
  };

  // 根据语言选择左侧 Quote 名言 (优先从 settings 里拉取用户自定义的广告语)
  const getQuote = () => {
    if (settings?.site?.login_quote && settings.site.login_quote.trim() !== '') {
      return settings.site.login_quote;
    }
    if (i18n.language.startsWith('zh')) {
      return '“下一代大语言模型 API 统一网关，帮助团队实现大模型调用的敏捷控制与精细化管理。”';
    }
    return '"The next-generation LLM API gateway, empowering teams with agile control and granular management of large language models."';
  };

  return (
    <div className={`min-h-screen bg-background text-foreground relative overflow-hidden font-sans transition-opacity duration-300 ${
      isReady ? 'opacity-100' : 'opacity-0'
    } ${
      loginStyle === 'split' ? 'grid lg:grid-cols-2' : 'flex items-center justify-center'
    }`}>
      {/* 未就绪时的极致高雅骨架屏加载遮罩，遮挡加载过程中的一切突变 */}
      {!isReady && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-background z-50 transition-all duration-300">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      {/* 1. 左侧装饰栏（大屏显示） */}
      {loginStyle === 'split' && (
        <div className="relative hidden lg:flex flex-col justify-between p-10 text-white border-r border-zinc-800/30 shadcn-auth-grid select-none z-10">
          {/* 星星闪烁与流星轨迹背景效果 */}
          <GridStarsEffect />

          {/* 顶部 Logo 与系统名称 */}
          <div className="relative z-20 flex items-center gap-2.5 text-lg font-semibold tracking-tight">
            {logo ? (
              <img src={logo} alt="logo" className="w-7 h-7 object-contain rounded" />
            ) : (
              <div className="flex items-center justify-center w-7 h-7 rounded bg-primary text-primary-foreground">
                <Terminal className="w-4 h-4" />
              </div>
            )}
            <span>{settings?.site?.name || 'TokensByte'}</span>
          </div>

          {/* 底部名言引用 */}
          <div className="relative z-20 mt-auto max-w-md">
            <blockquote className="space-y-3">
              <p className="text-lg font-medium leading-relaxed text-zinc-100">
                {getQuote()}
              </p>
              <footer className="text-sm text-zinc-400 flex items-center gap-2">
                <span className="h-px w-4 bg-zinc-600 inline-block" />
                <span>{settings?.site?.name || 'TokensByte'} Team</span>
              </footer>
            </blockquote>
          </div>
        </div>
      )}

      {/* 2. 右侧表单栏 */}
      <div className="flex flex-col justify-center items-center p-6 md:p-10 min-h-screen relative z-10 w-full">
        
        {/* 右上角漂浮控制浮窗 */}
        <div className="absolute right-3 top-3 md:right-4 md:top-4 flex items-center gap-2 z-50">
          {enableThemeToggle && (
            <Tooltip title={themeMode === 'light' ? '切换暗色模式' : '切换亮色模式'} placement="bottom">
              <button 
                onClick={toggleTheme}
                className="w-9 h-9 rounded-md border border-zinc-200 dark:border-zinc-800 bg-background flex items-center justify-center text-muted-foreground hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors cursor-pointer"
              >
                {themeMode === 'light' ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79Z" fill="currentColor" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="6" fill="currentColor" />
                    <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                  </svg>
                )}
              </button>
            </Tooltip>
          )}
          {enableMultilingual && (
            <Dropdown menu={{ items: langItems }} placement="bottomRight">
              <button className="h-9 px-3 rounded-md border border-zinc-200 dark:border-zinc-800 bg-background flex items-center gap-2 text-sm text-muted-foreground hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors cursor-pointer">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="2" />
                  <path d="M3.5 12h17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <ellipse cx="12" cy="12" rx="3.5" ry="8.5" stroke="currentColor" strokeWidth="2" />
                </svg>
                <span>{getLanguageLabel()}</span>
              </button>
            </Dropdown>
          )}
        </div>

        {/* 移动端/小屏幕下的 Logo & 标题在一行展示 (位于卡片外部上方) */}
        <div className={`flex ${loginStyle === 'split' ? 'lg:hidden' : ''} items-center justify-center gap-2 mb-4 select-none`}>
          {logo ? (
            <img src={logo} alt="logo" className="w-8 h-8 object-contain rounded-lg shadow-xs" />
          ) : (
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary text-primary-foreground">
              <Terminal className="w-4 h-4" />
            </div>
          )}
          <span className="font-semibold tracking-tight text-base text-foreground">{settings?.site?.name || 'TokensByte'}</span>
        </div>

        {/* 表单容器卡片 */}
        <div className="w-full max-w-[380px] rounded-xl overflow-hidden bg-zinc-50/30 dark:bg-zinc-900/35 shadow-md flex flex-col">
          
          {/* 上部主表单及第三方登录区 */}
          <div className="pt-1.5 pb-5 px-5 md:pt-2 md:pb-6 md:px-7 space-y-2">

            {/* 标题 & 副标题 */}
            <div className="flex flex-col text-center select-none">
              <h1 className="!text-xl md:!text-2xl font-semibold tracking-tight text-foreground leading-none">
                {title}
              </h1>
              {subtitle && (
                <p className="text-xs text-muted-foreground leading-none mt-1">
                  {subtitle}
                </p>
              )}
            </div>

            {/* 表单核心区域 */}
            {loading ? (
              <div className="flex flex-col items-center justify-center py-10 space-y-3">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
              </div>
            ) : (
              <div className="space-y-2">
                
                {/* 表单主体 */}
                <div className="space-y-4">
                  {children}
                </div>

                {/* 第三方登录渠道 */}
                {methods && methods.length > 0 && (
                  <div className="space-y-4">
                    <div className="relative flex items-center justify-center select-none">
                      <span className="absolute w-full border-t border-border" />
                      <span className="relative bg-background px-3 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                        {methodsLabel || t('auth.switch_method')}
                      </span>
                    </div>
                    <div className="flex items-center justify-center gap-3">
                      {methods.map(renderIconBtn)}
                    </div>
                  </div>
                )}

              </div>
            )}
          </div>

          {/* 下部页脚/跳转链接区分割区 */}
          {bottomLinks && (
            <div className="px-6 py-4 bg-zinc-50 dark:bg-zinc-900 flex items-center justify-center text-xs select-none">
              {bottomLinks}
            </div>
          )}

        </div>

        {/* 页脚版权声明 (位于卡片外部下方) */}
        {settings?.site?.copyright && (
          <div className="text-center text-[11px] text-muted-foreground/50 select-none mt-4">
            {settings.site.copyright}
          </div>
        )}
      </div>
    </div>
  );
};

export default AuthLayout;
