/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import React, { useState, useEffect } from 'react';
import { Switch, message, Spin } from 'antd';
import { 
  Image, 
  Users, 
  Beaker, 
  Cloud, 
  Store, 
  LayoutGrid, 
  Network, 
  Home, 
  BookOpen, 
  Zap, 
  MonitorPlay,
  Settings,
  RefreshCw,
  Globe,
  Share2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import request from '../../utils/request';
import type { Plugin } from '../../types';
import { pluginLocales } from '../../i18n';
import useSettingsStore from '../../store/settings';
import { useTranslation } from 'react-i18next';
import useAuthStore from '../../store/auth';

/** 语言代码 → 显示名称 */
const langNames: Record<string, string> = {
  zh: '中文',
  en: 'English',
  ja: '日本語',
  ko: '한국어',
  fr: 'Français',
  de: 'Deutsch',
  es: 'Español',
  pt: 'Português',
};

// ── 插件图标映射 ──
const pluginIcons: Record<string, React.ReactNode> = {
  asset_manager: <Image className="w-3.5 h-3.5" />,
  asset_manager_intl: <Image className="w-3.5 h-3.5" />,
  team_marketing: <Users className="w-3.5 h-3.5" />,
  playground: <Beaker className="w-3.5 h-3.5" />,
  model_marketplace: <Store className="w-3.5 h-3.5" />,
  site_icons: <LayoutGrid className="w-3.5 h-3.5" />,

  site_portal: <Home className="w-3.5 h-3.5" />,
  docs_api: <BookOpen className="w-3.5 h-3.5" />,
  happyhorse_router: <Zap className="w-3.5 h-3.5" />,
  volcengine_ark_monitor: <MonitorPlay className="w-3.5 h-3.5" />,
  upstream_asset_relay: <Share2 className="w-3.5 h-3.5" />,
};

// 系统增强插件使用不同的图标/徽章颜色样式，适配 shadcn ui 风格
const categoryStyles: Record<string, {
  iconContainer: string;
  badge: string;
  cardBorder: string;
}> = {
  user: {
    iconContainer: 'bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 border border-blue-150/40 dark:border-blue-900/30',
    badge: 'bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 border border-blue-100/30 dark:border-blue-900/20',
    cardBorder: 'hover:border-blue-400/50 dark:hover:border-blue-500/30',
  },
  system: {
    iconContainer: 'bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 border border-amber-150/40 dark:border-amber-900/30',
    badge: 'bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 border border-amber-100/30 dark:border-amber-900/20',
    cardBorder: 'hover:border-amber-400/50 dark:hover:border-amber-500/30',
  },
  system_builtin: {
    iconContainer: 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border border-emerald-150/40 dark:border-emerald-900/30',
    badge: 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border border-emerald-100/30 dark:border-emerald-900/20',
    cardBorder: 'hover:border-emerald-400/50 dark:hover:border-emerald-500/30',
  }
};

const categoryLabels: Record<string, { title: string; icon: React.ReactNode }> = {
  user: { title: '用户增强插件', icon: <LayoutGrid className="w-3 h-3 mr-1" /> },
  system: { title: '系统增强插件', icon: <Zap className="w-3 h-3 mr-1" /> },
  system_builtin: { title: '系统内置', icon: <Globe className="w-3 h-3 mr-1" /> }
};

const PluginsList: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { settings } = useSettingsStore();
  const adminPath = settings?.site?.admin_path || 'admin1688';
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchPlugins();
  }, []);

  const fetchPlugins = async () => {
    try {
      setLoading(true);
      const res = await (request.get('/plugins', { skipErrorHandler: true } as any) as any);
      if (res.plugins) setPlugins(res.plugins);
    } catch (error: any) {
      console.log('未开启插件模块或获取列表失败:', error);
      setPlugins([]);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (checked: boolean, plugin: Plugin, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await request.post(`/plugins/${plugin.name}/toggle`, { is_enabled: checked ? 1 : 0 });
      message.success(checked ? '插件已开启' : '插件已关闭');
      fetchPlugins();
    } catch (error) {
      message.error('操作失败');
    }
  };

  const isSuperAdmin = user?.role === 'admin' && !user?.admin_group_id;
  const hasGlobalPluginPerm = isSuperAdmin || user?.permissions?.includes('plugins');

  const hasPluginPerm = (pluginName: string) => {
    if (hasGlobalPluginPerm) return true;
    return user?.permissions?.includes(`plugin:${pluginName}`);
  };

  const visiblePlugins = plugins.filter(p => hasPluginPerm(p.name));

  const groupedPlugins: Record<string, Plugin[]> = {};
  visiblePlugins.forEach((p) => {
    const cat = p.category || 'user';
    if (!groupedPlugins[cat]) groupedPlugins[cat] = [];
    groupedPlugins[cat].push(p);
  });

  const categoryOrder = ['user', 'system', 'system_builtin'];

  const renderPluginCard = (plugin: Plugin) => {
    const isEnabled = plugin.is_enabled === 1;
    const cat = plugin.category || 'user';
    const style = categoryStyles[cat] || categoryStyles.user;
    const allowed = plugin.allowed_levels || 'all';

    return (
      <div
        key={plugin.id}
        onClick={() => navigate(`/${adminPath}/plugins/${plugin.name}/config`)}
        className={`group relative flex flex-col justify-between p-3 bg-zinc-50/70 dark:bg-zinc-900/50 text-card-foreground rounded-lg border border-border cursor-pointer shadow-xs transition-all duration-200 hover:shadow-sm hover:bg-zinc-100/60 dark:hover:bg-zinc-900 ${style.cardBorder}`}
      >
        <div>
          {/* 头部信息 */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className={`w-[30px] h-[30px] rounded-md flex items-center justify-center shrink-0 ${style.iconContainer} transition-transform duration-255 group-hover:scale-105`}>
                {pluginIcons[plugin.name] || <LayoutGrid className="w-3.5 h-3.5" />}
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-[11.5px] text-foreground leading-tight truncate">
                  {t(`${plugin.name}:title`, plugin.title)}
                </h3>
                <span className="text-[9px] text-muted-foreground/80 font-mono block mt-0.5 truncate">
                  {plugin.name}
                </span>
              </div>
            </div>
            
            {/* 开关 */}
            <div onClick={(e) => e.stopPropagation()} className="flex items-center shrink-0">
              <Switch
                size="small"
                checked={isEnabled}
                onChange={(checked, e) => handleToggle(checked, plugin, e as any)}
              />
            </div>
          </div>

          {/* 插件描述 */}
          <p className="text-[10.5px] text-muted-foreground line-clamp-2 mt-1.5 leading-relaxed min-h-[30px]">
            {t(`${plugin.name}:subtitle`, plugin.description || '暂无描述')}
          </p>
        </div>

        {/* 底部信息 & 配置按钮 */}
        <div className="mt-2.5 pt-2 border-t border-border flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 min-w-0">
              <span className="text-[9.5px] text-muted-foreground shrink-0">开放:</span>
              <div className="flex items-center gap-1 overflow-hidden truncate">
                {allowed === 'all' ? (
                  <span className={`px-1 py-0.5 text-[8.5px] font-medium rounded ${style.badge}`}>
                    {(cat === 'system' || cat === 'system_builtin') ? '全管理员' : '全等级'}
                  </span>
                ) : (
                  allowed.split(',').slice(0, 2).map(lv => (
                    <span 
                      key={lv} 
                      className="px-1 py-0.5 text-[8.5px] font-medium bg-muted text-muted-foreground border border-border rounded truncate"
                    >
                      {lv}
                    </span>
                  ))
                )}
              </div>
            </div>

            {/* 配置按钮 */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/${adminPath}/plugins/${plugin.name}/config`);
              }}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-border text-[9.5px] font-medium text-muted-foreground hover:text-foreground bg-muted/30 hover:bg-muted transition-colors cursor-pointer"
            >
              <Settings className="w-2.5 h-2.5" />
              配置
            </button>
          </div>

          {/* 支持语言 */}
          {pluginLocales[plugin.name] && (
            <div className="flex items-center gap-1 pt-1 border-t border-dashed border-border/80">
              <Globe className="w-2.5 h-2.5 text-muted-foreground/80 shrink-0" />
              <span className="text-[9.5px] text-muted-foreground shrink-0">语言:</span>
              <div className="flex flex-wrap gap-1">
                {Object.keys(pluginLocales[plugin.name]).map(lng => (
                  <span 
                    key={lng} 
                    className="px-1 py-0.5 text-[8px] font-medium bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border border-emerald-100/50 dark:border-emerald-900/20 rounded"
                  >
                    {langNames[lng] || lng}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3.5 -mt-3">
      {/* 页头 */}
      <div className="flex items-center justify-between pb-2 mb-3 border-b border-border">
        <div className="flex flex-col gap-0.5">
          <div className="text-[13px] font-bold text-foreground leading-tight">站点插件</div>
          <div className="text-[10.5px] text-muted-foreground leading-normal">管理和配置本站启用的功能及系统扩展插件</div>
        </div>
        <button 
          onClick={fetchPlugins} 
          disabled={loading}
          className="flex items-center gap-1 h-[26px] px-2.5 rounded text-[10px] font-medium border border-border bg-card hover:bg-accent text-foreground transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-2.5 h-2.5 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      {loading && plugins.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2">
          <Spin size="small" />
          <span className="text-[11px] text-muted-foreground">正在加载插件列表...</span>
        </div>
      ) : plugins.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mb-2">
            <LayoutGrid className="w-6 h-6 text-muted-foreground/50" />
          </div>
          <p className="text-[13px] font-medium text-foreground">暂无可用插件</p>
          <p className="text-[11px] text-muted-foreground max-w-[250px]">
            当前系统尚未安装或开启任何功能扩展插件
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {categoryOrder
            .filter((cat) => groupedPlugins[cat]?.length)
            .map((cat) => {
              const label = categoryLabels[cat] || categoryLabels.user;
              return (
                <div key={cat} className="space-y-2.5">
                  <div className="flex items-center">
                    <div className={`flex items-center text-[11px] font-semibold uppercase tracking-wider ${
                      cat === 'system' 
                        ? 'text-amber-600 dark:text-amber-400' 
                        : cat === 'system_builtin' 
                        ? 'text-emerald-600 dark:text-emerald-400' 
                        : 'text-zinc-500 dark:text-zinc-400'
                    }`}>
                      {label.icon}
                      {label.title}
                      <span className="ml-1 text-[9px] text-muted-foreground lowercase font-normal">
                        ({groupedPlugins[cat].length})
                      </span>
                    </div>
                    <div className="ml-2.5 flex-1 h-[1px] bg-border" />
                  </div>
                  <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
                    {groupedPlugins[cat].map(renderPluginCard)}
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
};

export default PluginsList;
