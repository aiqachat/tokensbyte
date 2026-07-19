/**
 * 模型广场 - 用户端独立全屏页面
 * 参考 NeuralGrid 设计风格：深色主题 + 左侧筛选 + 模型卡片网格
 */
import React, { useState, useEffect, useMemo } from 'react';
import { getAnnouncementLabel } from '../../utils/announcement';
import {
  parseNotificationPreferences,
  shouldShowWebNotifications,
  maybeShowBrowserPush,
} from '../../utils/notificationPrefs';
import { Sidebar as SidebarIcon } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ConfigProvider, theme, Input, Checkbox, Avatar, Dropdown, Spin, Empty, Tooltip, Popover, Button, Layout, Grid, Space, Result, Descriptions, Tag, Breadcrumb, Badge, List, message, Pagination } from 'antd';
import {
  RocketOutlined, CompassOutlined, SearchOutlined, ArrowLeftOutlined, AppstoreOutlined,
  MessageOutlined, PictureOutlined, VideoCameraOutlined,
  AudioOutlined, CodeOutlined, ApiOutlined, ShopOutlined,
  FilterOutlined, SortAscendingOutlined, MenuOutlined, CloseOutlined,
  DashboardOutlined, WalletOutlined, LogoutOutlined, MenuUnfoldOutlined, MenuFoldOutlined,
  LockOutlined, InfoCircleOutlined, UnorderedListOutlined, GlobalOutlined, BellOutlined, ScheduleOutlined,
  CopyOutlined, DollarOutlined
} from '@ant-design/icons';

const { Header, Sider, Content } = Layout;
const { useBreakpoint } = Grid;
import request from '../../utils/request';
import { useThemeStore } from '../../store/theme';
import useSettingsStore from '../../store/settings';
import useAuthStore from '../../store/auth';
import UserAvatarMenu from '../../components/UserAvatarMenu';
import { SunOutlined, MoonOutlined } from '@ant-design/icons';

interface Announcement {
  id: number;
  title: string;
  content: string;
  is_pinned: number;
  created_at: string;
}

interface MarketplaceModel {
  id: number;
  mid: string;
  name: string;
  model_id: string;
  original_id?: string;
  provider_id: number;
  provider_name: string;
  provider_logo?: string;
  type_id: number;
  type_name: string;
  type_logo?: string;
  logo?: string;
  sort_order: number;
  description: string;
  global_discount?: number;
  global_discount_enabled?: number;
  billing: any;
  created_at: string;
  has_ha?: boolean;
  variant_count?: number;
  variants?: MarketplaceModel[];
}

interface FilterItem {
  id: number;
  name: string;
  logo?: string;
}

import { Image as ImageIcon, Video, AudioLines, MessageSquare, Cuboid, ListOrdered, Code, LayoutGrid, Sparkles } from 'lucide-react';

// 类型图标映射
const getTypeIcon = (typeName: string) => {
  const style = { width: '1em', height: '1em' };
  if (typeName.includes('视频增强') || typeName.includes('videoenhance') || typeName.includes('video-enhance') || typeName.includes('video_enhance')) return <Sparkles style={style} />;
  if (typeName.includes('聊天') || typeName.includes('对话') || typeName.includes('LLM')) return <MessageSquare style={style} />;
  if (typeName.includes('图片') || typeName.includes('图像')) return <ImageIcon style={style} />;
  if (typeName.includes('视频')) return <Video style={style} />;
  if (typeName.includes('音频') || typeName.includes('语音')) return <AudioLines style={style} />;
  if (typeName.includes('代码')) return <Code style={style} />;
  if (typeName.includes('嵌入') || typeName.includes('向量') || typeName.includes('Embedding') || typeName.includes('Vector')) return <Cuboid style={style} />;
  if (typeName.includes('排序') || typeName.includes('重排') || typeName.includes('Rerank')) return <ListOrdered style={style} />;
  return <LayoutGrid style={style} />;
};

// 智能兜底计费规则生成
const getFallbackBilling = (variant: any) => {
  if (variant.billing) return variant.billing;
  const mid = variant.mid || '';
  const typeName = variant.type_name || '';

  // 1. 火山引擎画质增强与字幕擦除预置模型兜底
  if (mid.startsWith('vve-') || mid.startsWith('vvs-')) {
    const isErase = mid.startsWith('vvs-');
    return {
      billing_type: 'duration',
      billing_rule: isErase ? 'per_second' : 'video_quality',
      fixed_rate: 0,
      duration_rate: 0,
      pricing_tiers: '[]',
      extended_config: '{}',
      name: isErase ? '火山字幕擦除默认规则' : '火山画质增强默认规则',
    };
  }

  // 2. 图像/生图/视频等其它模型按类型智能推断
  if (typeName.includes('图') || typeName.includes('画') || typeName.includes('Image') || typeName.includes('image')) {
    return {
      billing_type: 'requests',
      billing_rule: 'per_image',
      fixed_rate: 0,
      pricing_tiers: '[]',
      extended_config: '{}',
      name: '图片按张计费默认规则',
    };
  }

  if (typeName.includes('视频') || typeName.includes('Video') || typeName.includes('video')) {
    return {
      billing_type: 'duration',
      billing_rule: 'video_resolution',
      fixed_rate: 0,
      duration_rate: 0,
      pricing_tiers: '[]',
      extended_config: '{}',
      name: '视频按秒计费默认规则',
    };
  }

  // 3. 默认兜底为 tokens
  return {
    billing_type: 'tokens',
    billing_rule: 'standard',
    prompt_rate: 0,
    completion_rate: 0,
    pricing_tiers: '[]',
    extended_config: '{}',
    name: 'Tokens计费默认规则',
  };
};

// 计费类型中文
const getBillingLabel = (billing: any, tp: any) => {
  if (!billing) return null;
  switch (billing.billing_type) {
    case 'tokens': return tp('billing_tokens');
    case 'requests': return tp('billing_requests');
    case 'duration': return tp('billing_duration');
    case 'tiered': return tp('billing_tiered');
    default: return billing.billing_type;
  }
};

const LOBE_DEFAULT_ICON = '/assets/icons/lobe/default-model.svg';

const lobeIconSrc = (logo?: string | null, providerLogo?: string | null) =>
  logo ? `/assets/icons/lobe/${logo}.svg`
    : providerLogo ? `/assets/icons/lobe/${providerLogo}.svg`
      : LOBE_DEFAULT_ICON;

/** 图标加载失败时降级到默认图；默认图也失败则隐藏，避免裂图 */
const handleLobeIconError = (e: React.SyntheticEvent<HTMLImageElement>) => {
  const img = e.currentTarget;
  img.style.filter = 'none';
  if (!img.src.endsWith(LOBE_DEFAULT_ICON)) {
    img.src = LOBE_DEFAULT_ICON;
  } else {
    img.style.display = 'none';
  }
};

/** 所有变体均无绑定可用渠道时视为暂不可用 */
const isModelUnavailable = (model: any) =>
  (model?.variants || [model]).every(
    (v: any) => !Array.isArray(v?.ha_subchannels) || v.ha_subchannels.length === 0
  );

const getLogoFilter = (logoName: string | undefined, isLight: boolean) => {
  if (isLight) return 'none';
  if (!logoName) return 'none';
  const name = logoName.toLowerCase();
  if (name.includes('default')) return 'none';

  // 包含以下关键字的单色/黑色图标，在暗色模式下反色为白色显示
  const monochromeKeywords = [
    'openai', 'github', 'anthropic', 'groq', 'ollama',
    'moonshot', 'zeroone', 'openrouter', 'xai', 'grok',
    'hermes'
  ];

  if (monochromeKeywords.some(keyword => name.includes(keyword))) {
    return 'invert(1)';
  }
  return 'brightness(0.9)';
};

interface CopyModelIdButtonProps {
  modelId: string;
  isLight: boolean;
  c: any;
}

const CopyModelIdButton: React.FC<CopyModelIdButtonProps> = ({ modelId, isLight, c }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(modelId);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
    }, 1500);
  };

  return (
    <Tooltip title={copied ? "已复制!" : "复制模型ID"}>
      <Button
        type="text"
        size="small"
        icon={<CopyOutlined style={{ fontSize: 11 }} />}
        onClick={handleCopy}
        style={{
          color: c.text3,
          padding: 0,
          width: 18,
          height: 18,
          minWidth: 18,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 4
        }}
      />
    </Tooltip>
  );
};

const ModelMarketplace: React.FC = () => {
  const { t: _t, i18n } = useTranslation();
  const { t: tp } = useTranslation('model_marketplace');
  const { themeMode, toggleTheme } = useThemeStore();
  const { settings } = useSettingsStore();
  const enableThemeToggle = settings?.site?.enable_theme_toggle !== false;
  const enableMultilingual = settings?.site?.enable_multilingual !== false;
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [selectedCurrencyCode, setSelectedCurrencyCode] = useState<string>('');
  const [agreement, setAgreement] = useState<any>(settings?.agreement || null);

  const [announcementsDrawerVisible, setAnnouncementsDrawerVisible] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [models, setModels] = useState<MarketplaceModel[]>([]);
  const [groupedModels, setGroupedModels] = useState<MarketplaceModel[]>([]);
  const [providers, setProviders] = useState<FilterItem[]>([]);
  const [types, setTypes] = useState<FilterItem[]>([]);
  const [total, setTotal] = useState(0);

  // 筛选状态
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedType, setSelectedType] = useState<number | null>(null);
  const [selectedProviders, setSelectedProviders] = useState<number[]>([]);
  const [sortBy, setSortBy] = useState<'popular' | 'name' | 'newest'>('popular');
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedModel, _setSelectedModel] = useState<MarketplaceModel | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);

  const setSelectedModel = (model: MarketplaceModel | null) => {
    _setSelectedModel(model);
    if (model) {
      searchParams.set('model', model.id.toString());
      setSearchParams(searchParams);
    } else {
      searchParams.delete('model');
      setSearchParams(searchParams);
    }
  };

  useEffect(() => {
    const modelIdInUrl = searchParams.get('model');
    if (groupedModels.length > 0) {
      if (modelIdInUrl) {
        const found = groupedModels.find(m => m.model_id === modelIdInUrl || m.original_id === modelIdInUrl || m.id.toString() === modelIdInUrl);
        if (found && found.id !== selectedModel?.id) {
          _setSelectedModel(found);
        }
      } else if (selectedModel) {
        _setSelectedModel(null);
      }
    }
  }, [searchParams, groupedModels, selectedModel]);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid');
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const saved = localStorage.getItem('model_marketplace_sidebar_collapsed');
      return saved !== null ? JSON.parse(saved) : false;
    } catch (e) {
      return false;
    }
  });

  const handleCollapsedChange = (val: boolean) => {
    setCollapsed(val);
    localStorage.setItem('model_marketplace_sidebar_collapsed', JSON.stringify(val));
  };
  const screens = useBreakpoint();

  // 从 settings store 派生站点信息，不再独立调 /settings 接口
  const siteName = settings?.site?.name || 'TokensByte';
  const siteLogo = settings?.site?.logo || '';
  const currencySymbol = settings?.currency?.currency_symbol || '¥';
  const auxiliaryCurrencies = useMemo(() => {
    const list = settings?.currency?.auxiliary_currencies;
    return Array.isArray(list) ? list.filter(c => c.enabled) : [];
  }, [settings?.currency?.auxiliary_currencies]);

  useEffect(() => {
    if (settings?.agreement) setAgreement(settings.agreement);
  }, [settings?.agreement]);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (selectedModel) {
      document.title = `${selectedModel.original_id || selectedModel.name}-模型广场`;
    } else {
      document.title = `${siteName}-模型广场`;
    }
  }, [selectedModel, siteName]);

  useEffect(() => {
    const fetchAnnouncements = async () => {
      const prefs = parseNotificationPreferences(
        user?.notification_preferences,
        settings?.notification?.low_balance_threshold ?? 100.0,
      );
      if (!shouldShowWebNotifications(prefs, settings?.notification)) {
        setAnnouncements([]);
        setUnreadCount(0);
        return;
      }
      try {
        const response = await (request.get('/announcements/public') as any);
        if (response.data) {
          setAnnouncements(response.data);
          setUnreadCount(response.data.length);
          if (response.data.length > 0) {
            const first = response.data[0];
            const seenKey = `notif_push_seen_${first.id}`;
            if (!sessionStorage.getItem(seenKey)) {
              sessionStorage.setItem(seenKey, '1');
              const title = getAnnouncementLabel(first.title || '') || (i18n.language === 'zh' ? '新通知' : 'New notification');
              const body = getAnnouncementLabel(first.content || '').replace(/<[^>]+>/g, '').slice(0, 120);
              maybeShowBrowserPush(title, body, prefs, settings?.notification);
            }
          }
        }
      } catch (error) {
        console.error('Failed to fetch announcements:', error);
      }
    };
    fetchAnnouncements();
  }, [user?.notification_preferences, settings?.notification?.low_balance_threshold, i18n.language]);

  const fetchData = async () => {
    try {
      setLoading(true);

      const res = await (request.get('/marketplace/public') as Promise<any>);
      if (res) {
        setModels(res.models || []);
        setGroupedModels(res.grouped_models || res.models || []);
        setProviders(res.providers || []);
        setTypes(res.types || []);
        setTotal(res.group_total || res.total || 0);
      }
    } catch (e: any) {
      if (e?.response?.status === 403 || e?.status === 403) {
        setForbidden(true);
      } else {
        console.error('加载模型广场失败', e);
      }
    } finally {
      setLoading(false);
    }
  };

  // 过滤逻辑 - 基于分组后的模型列表
  const filteredModels = useMemo(() => {
    let result = [...groupedModels];

    // 类型筛选 - 检查组内任意变体匹配
    if (selectedType !== null) {
      result = result.filter(m => {
        if (m.type_id === selectedType) return true;
        return m.variants?.some(v => v.type_id === selectedType) || false;
      });
    }

    // 官方服务商筛选 - 检查组内任意变体匹配
    if (selectedProviders.length > 0) {
      result = result.filter(m => {
        if (selectedProviders.includes(m.provider_id)) return true;
        return m.variants?.some(v => selectedProviders.includes(v.provider_id)) || false;
      });
    }

    // 搜索
    if (searchKeyword) {
      const kw = searchKeyword.toLowerCase();
      result = result.filter(m =>
        m.name.toLowerCase().includes(kw) ||
        m.model_id.toLowerCase().includes(kw) ||
        (m.original_id && m.original_id.toLowerCase().includes(kw)) ||
        m.provider_name.toLowerCase().includes(kw) ||
        m.description?.toLowerCase()?.includes(kw) ||
        m.variants?.some(v =>
          v.name.toLowerCase().includes(kw) ||
          v.model_id.toLowerCase().includes(kw) ||
          (v.original_id && v.original_id.toLowerCase().includes(kw)) ||
          v.provider_name?.toLowerCase()?.includes(kw)
        ) || false
      );
    }

    // 排序
    if (sortBy === 'popular') {
      result.sort((a, b) => (b.sort_order || 0) - (a.sort_order || 0));
    } else if (sortBy === 'name') {
      result.sort((a, b) => (a.original_id || a.name).localeCompare(b.original_id || b.name));
    } else if (sortBy === 'newest') {
      result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    return result;
  }, [groupedModels, selectedType, selectedProviders, searchKeyword, sortBy]);

  const pagedModels = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredModels.slice(startIndex, startIndex + pageSize);
  }, [filteredModels, currentPage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedType, selectedProviders, searchKeyword, sortBy]);

  // 防御性校准：当过滤结果数或每页展示数变更导致总页数变小，且 currentPage 大于最大页数时，自动修正页码
  useEffect(() => {
    const maxPage = Math.ceil(filteredModels.length / pageSize);
    if (maxPage > 0 && currentPage > maxPage) {
      setCurrentPage(maxPage);
    }
  }, [filteredModels.length, pageSize, currentPage]);

  // 统计每个类型的数量（按分组计数）
  const typeCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    const src = selectedProviders.length > 0
      ? groupedModels.filter(m => selectedProviders.includes(m.provider_id) || m.variants?.some(v => selectedProviders.includes(v.provider_id)))
      : groupedModels;
    src.forEach(m => {
      if (m.type_id) counts[m.type_id] = (counts[m.type_id] || 0) + 1;
    });
    return counts;
  }, [groupedModels, selectedProviders]);

  // 统计每个官方服务商的数量（按分组计数）
  const providerCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    const src = selectedType !== null
      ? groupedModels.filter(m => m.type_id === selectedType || m.variants?.some(v => v.type_id === selectedType))
      : groupedModels;
    src.forEach(m => {
      // 统计该分组涉及的所有官方服务商
      const pids = new Set<number>();
      if (m.provider_id) pids.add(m.provider_id);
      m.variants?.forEach(v => { if (v.provider_id) pids.add(v.provider_id); });
      pids.forEach(pid => { counts[pid] = (counts[pid] || 0) + 1; });
    });
    return counts;
  }, [groupedModels, selectedType]);

  const handleProviderToggle = (id: number) => {
    setSelectedProviders(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
    setSelectedModel(null);
  };

  const activeFilters = (selectedType !== null ? 1 : 0) + (selectedProviders.length > 0 ? 1 : 0);

  const clearFilters = () => {
    setSelectedType(null);
    setSelectedProviders([]);
    setSearchKeyword('');
  };

  const isLight = themeMode === 'light';
  const c = {
    bg: isLight ? '#f0f4f9' : '#000000',
    siderBg: isLight ? '#f8f9fa' : '#141414',
    cardBg: isLight ? '#ffffff' : '#121214',
    cardBorder: isLight ? '#eaeaea' : '#222225',
    cardHoverBg: isLight ? '#fafafa' : '#18181b',
    panelBg: isLight ? '#f4f5f7' : '#18181b',
    text1: isLight ? '#1f2937' : 'rgba(255,255,255,0.95)',
    text2: isLight ? '#4b5563' : 'rgba(255,255,255,0.75)',
    text3: isLight ? '#6b7280' : 'rgba(255,255,255,0.5)',
    textMuted: isLight ? '#9ca3af' : 'rgba(255,255,255,0.25)',
    searchBg: isLight ? '#f4f5f7' : '#18181b',
    searchBorder: isLight ? '#d1d5db' : '#222225',
    focusBorder: isLight ? '#434343' : '#4f4f56',
    hoverBg: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.05)',
    sidebarText: isLight ? '#374151' : 'rgba(255,255,255,0.75)',
    scrollThumb: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)',
    sortBorder: isLight ? '#d1d5db' : '#222225',
    link: isLight ? '#1f2937' : 'rgba(255,255,255,0.95)',
    active: isLight ? '#000000' : '#ffffff',
    activeBg: isLight ? '#f4f5f7' : 'rgba(255,255,255,0.08)',
    activeBorder: isLight ? '#1f2937' : 'rgba(255,255,255,0.3)',
    codeBg: isLight ? '#f4f5f7' : '#18181b',
    codeText: isLight ? '#374151' : 'rgba(255,255,255,0.75)',
    detailBg: isLight ? '#ffffff' : '#121214',
    shadow: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(0,0,0,0.4)',
  };

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
    localStorage.setItem('i18nextLng', lng);
  };

  const formatPrice = (price: number | string | undefined | null, discountModel?: MarketplaceModel) => {
    if (price === undefined || price === null || price === '') return '-';
    const num = Number(price);

    const getRaw = (n: number) => {
      if (isNaN(n)) return String(price);

      const formatNumber = (val: number) => parseFloat(val.toFixed(6));

      if (selectedCurrencyCode === '') {
        return `${currencySymbol}${formatNumber(n)}`;
      }
      const curr = auxiliaryCurrencies.find(c => c.code === selectedCurrencyCode);
      if (curr) {
        return `${curr.symbol}${formatNumber(n * curr.exchange_rate)}`;
      }
      return `${currencySymbol}${formatNumber(n)}`;
    };

    const raw = getRaw(num);

    if (discountModel && discountModel.global_discount_enabled === 1 && discountModel.global_discount !== undefined && discountModel.global_discount > 0 && discountModel.global_discount < 1) {
      if (isNaN(num)) return raw;
      const discountedNum = num * discountModel.global_discount;
      const discountedRaw = getRaw(discountedNum);
      return (
        <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, whiteSpace: 'nowrap' }}>
          <span style={{ textDecoration: 'line-through', color: isLight ? '#9ca3af' : '#6b7280', fontSize: '0.75em', fontWeight: 400, opacity: 0.8 }}>{raw}</span>
          <span style={{ color: '#ff4d4f', fontWeight: 700 }}>{discountedRaw}</span>
        </span>
      );
    }
    return raw;
  };

  const renderPriceGridTable = (title: string, items: { label: string, price: number | undefined | null, unit: string }[], variant: any, discount?: number, discountLabel: string = '错峰折扣: ×', subRate: number = 1) => {
    const validItems = items.filter(item => item.price !== undefined && item.price !== null && Number(item.price) > 0);
    if (!validItems || validItems.length === 0) return null;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%', maxWidth: 560 }}>
        {title && <div style={{ fontSize: 11, fontWeight: 600, color: c.text2, marginBottom: 2 }}>{title}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', columnGap: 16, rowGap: 2 }}>
          {validItems.map((item, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', fontSize: 11, padding: '2px 0', gap: 6 }}>
              <span style={{ color: c.text3, whiteSpace: 'nowrap' }} title={item.label}>{item.label}:</span>
              <span style={{ color: c.text1, fontFamily: "'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', monospace", fontWeight: 600, flexShrink: 0 }}>
                {item.unit === '倍' ? `${Number(item.price).toFixed(2)}` : formatPrice(Number(item.price) * subRate, variant)}<span style={{ fontSize: 10, fontWeight: 400, marginLeft: 2, color: c.text3 }}>{item.unit}</span>
              </span>
            </div>
          ))}
        </div>
        {discount !== undefined && discount !== 1 && (
          <div style={{ fontSize: 11, color: c.text3, marginTop: 2 }}>{discountLabel}{discount}</div>
        )}
      </div>
    );
  };

  const renderCardPrice = (model: MarketplaceModel) => {
    const billing = model.billing || getFallbackBilling(model);
    if (!billing) return null;
    const { billing_type, prompt_rate, completion_rate, fixed_rate, duration_rate, billing_rule, extended_config, pricing_tiers } = billing;

    const ext = safeParseJson(extended_config);
    const tiers = safeParseJson(pricing_tiers, []);

    const priceStyle: React.CSSProperties = {
      fontSize: 12,
      fontWeight: 500,
      color: isLight ? '#1f2937' : 'rgba(255,255,255,0.9)',
      fontFamily: "'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', monospace",
      display: 'inline-flex',
      alignItems: 'center',
      flexWrap: 'wrap',
      justifyContent: 'flex-end',
      gap: 4
    };

    const freeBadge = (
      <span style={{
        fontSize: 11,
        fontWeight: 500,
        padding: '2px 8px',
        borderRadius: 4,
        background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)',
        color: isLight ? '#1f2937' : 'rgba(255,255,255,0.88)',
        border: `1px solid ${isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.15)'}`
      }}>
        免费
      </span>
    );

    let priceContent: React.ReactNode = null;

    const renderMinPrice = (rates: (number | undefined | null)[], unit: string) => {
      const activeRates = rates.map(r => Number(r)).filter(r => !isNaN(r) && r > 0);
      if (activeRates.length > 0) {
        return <>起价: <span style={{ fontWeight: 600 }}>{formatPrice(Math.min(...activeRates), model)}</span>{unit}</>;
      }
      return null;
    };

    if (billing_type === 'tokens') {
      // 1. tiered (阶梯计费)
      if ((billing_rule === 'tiered' || billing_rule === 'doubao_chat') && Array.isArray(tiers) && tiers.length > 0) {
        const firstTier = tiers[0];
        const pRate = firstTier.prompt_rate !== undefined && firstTier.prompt_rate !== null ? Number(firstTier.prompt_rate) : 0;
        const cRate = firstTier.completion_rate !== undefined && firstTier.completion_rate !== null ? Number(firstTier.completion_rate) : 0;
        priceContent = (
          <>
            {pRate > 0 && <span style={{ whiteSpace: 'nowrap' }}>输入: <span style={{ fontWeight: 600 }}>{formatPrice(pRate, model)}</span>/1M</span>}
            {pRate > 0 && cRate > 0 && <span style={{ margin: '0 4px', color: isLight ? '#d1d5db' : '#4b5563' }}>|</span>}
            {cRate > 0 && <span style={{ whiteSpace: 'nowrap' }}>输出: <span style={{ fontWeight: 600 }}>{formatPrice(cRate, model)}</span>/1M</span>}
          </>
        );
      }
      else if (billing_rule === 'gpt_billing') {
        const gptConfig = (ext && typeof ext.gpt_config === 'object' && ext.gpt_config !== null) ? ext.gpt_config : {};
        const items = [
          { key: 'input_text', label: '文P' },
          { key: 'input_image', label: '图P' },
          { key: 'output_image', label: '图C' },
          { key: 'cached_input_text', label: '文缓' },
          { key: 'cached_input_image', label: '图缓' },
        ];
        const enabledItems = items.filter(item => gptConfig[item.key]?.enabled);
        priceContent = (
          <Space size={4} wrap>
            {enabledItems.map((item, idx) => (
              <React.Fragment key={item.key}>
                {idx > 0 && <span style={{ color: isLight ? '#d1d5db' : '#4b5563' }}>|</span>}
                <span style={{ whiteSpace: 'nowrap' }}>
                  {item.label}: <span style={{ fontWeight: 600 }}>{formatPrice(gptConfig[item.key].rate, model)}</span>/1M
                </span>
              </React.Fragment>
            ))}
            {enabledItems.length === 0 && <span>GPT官方计费(未启用)</span>}
          </Space>
        );
      }
      else if (billing_rule === 'multimodal') {
        const pRate = prompt_rate !== undefined && prompt_rate !== null ? Number(prompt_rate) : 0;
        const imgRate = ext.image_prompt_rate !== undefined && ext.image_prompt_rate !== null ? Number(ext.image_prompt_rate) : 0;
        priceContent = (
          <>
            {pRate > 0 && <span style={{ whiteSpace: 'nowrap' }}>文P: <span style={{ fontWeight: 600 }}>{formatPrice(pRate, model)}</span>/1M</span>}
            {pRate > 0 && imgRate > 0 && <span style={{ margin: '0 4px', color: isLight ? '#d1d5db' : '#4b5563' }}>|</span>}
            {imgRate > 0 && <span style={{ whiteSpace: 'nowrap' }}>图P: <span style={{ fontWeight: 600 }}>{formatPrice(imgRate, model)}</span>/1M</span>}
          </>
        );
      }

      // 2. seedance2.0
      else if (billing_rule === 'seedance2.0' && ext.resolution_rates) {
        const rates = ext.resolution_rates || {};
        const values: number[] = [];
        Object.keys(rates).forEach(k => {
          values.push(rates[k]?.with_video, rates[k]?.without_video);
        });
        priceContent = renderMinPrice(values, '/1M');
      }

      // 3. seedance1.5pro
      else if (billing_rule === 'seedance1.5pro') {
        priceContent = renderMinPrice([ext.base_rate, ext.audio_rate], '/1M');
      }

      // 4. seedance1.0
      else if (billing_rule === 'seedance1.0') {
        priceContent = renderMinPrice([ext.online_rate, ext.offline_rate], '/1M');
      }

      // 5. volcengine
      else if (billing_rule === 'volcengine') {
        priceContent = renderMinPrice([ext.volc_base_rate, ext.volc_audio_rate, ext.volc_video_rate], '/1M');
      }

    } else if (billing_type === 'requests') {
      // 1. image_resolution resolution-based billing
      if (billing_rule === 'image_resolution' && Array.isArray(tiers) && tiers.length > 0) {
        priceContent = renderMinPrice(tiers.filter(t => t.enabled !== false).map(t => t.rate), '/张');
      }

      // 2. image_size_pixel pixel-resolution-based billing
      else if (billing_rule === 'image_size_pixel' && Array.isArray(tiers) && tiers.length > 0) {
        const rates: number[] = [];
        tiers.filter(t => t.enabled !== false).forEach(t => {
          rates.push(t.quality_pricing ? t.rate_low : t.rate);
        });
        priceContent = renderMinPrice(rates, '/张');
      }

      // 2.5. volc_seedream_pro (火山 Seedream Pro)
      else if (billing_rule === 'volc_seedream_pro' && Array.isArray(tiers) && tiers.length > 0) {
        const rates = tiers.filter(t => t.enabled !== false).map(t => Number(t.rate)).filter(r => !isNaN(r) && r > 0);
        priceContent = renderMinPrice(rates, '/张');
      }

      // 3. vidu_image billing
      else if (billing_rule === 'vidu_image') {
        const pt = ext.price_table || {};
        const disabledKeys: string[] = Array.isArray(ext.price_table_disabled) ? ext.price_table_disabled : [];
        const values = Object.entries(pt).filter(([k]) => !disabledKeys.includes(k)).map(([, v]) => v as number);
        priceContent = renderMinPrice(values, '/张');
      }

      // 4. characters 按字符计费（语音合成等）
      else if (billing_rule === 'characters') {
        const fRate = fixed_rate !== undefined && fixed_rate !== null ? Number(fixed_rate) : 0;
        if (fRate === 0) {
          return freeBadge;
        }
        priceContent = <><span style={{ fontWeight: 600 }}>{formatPrice(fRate, model)}</span>/万字符</>;
      }

    } else if (billing_type === 'duration') {
      // 1. video_resolution resolution-based duration billing
      if (billing_rule === 'video_resolution' && Array.isArray(tiers) && tiers.length > 0) {
        priceContent = renderMinPrice(tiers.filter(t => t.enabled !== false).map(t => t.rate), '/秒');
      }

      // 2. kling_video billing
      else if (billing_rule === 'kling_video') {
        const pt = ext.price_table || {};
        const disabledKeys: string[] = Array.isArray(ext.price_table_disabled) ? ext.price_table_disabled : [];
        const values = Object.entries(pt).filter(([k]) => !disabledKeys.includes(k)).map(([, v]) => v as number);
        priceContent = renderMinPrice(values, '/秒');
      }

      // 3. vidu_video & volc_enhance_cascade billing
      else if (billing_rule === 'vidu_video' || billing_rule === 'volc_enhance_cascade') {
        const pt = ext.price_table || {};
        const disabledKeys: string[] = Array.isArray(ext.price_table_disabled) ? ext.price_table_disabled : [];
        const values = Object.entries(pt).filter(([k]) => !disabledKeys.includes(k)).map(([, v]) => v as number);
        priceContent = renderMinPrice(values, '/秒');
      }

      // 4. video_quality billing
      else if (billing_rule === 'video_quality' && Array.isArray(tiers) && tiers.length > 0) {
        priceContent = renderMinPrice(tiers.filter(t => t.enabled !== false).map(t => t.rate), '/秒');
      }
    }

    // Fallback logic if priceContent is still null
    if (!priceContent) {
      if (billing_type === 'tokens') {
        const pRate = prompt_rate !== undefined && prompt_rate !== null ? Number(prompt_rate) : 0;
        const cRate = completion_rate !== undefined && completion_rate !== null ? Number(completion_rate) : 0;
        if (pRate === 0 && cRate === 0) {
          return freeBadge;
        }
        priceContent = (
          <>
            {pRate > 0 && <span style={{ whiteSpace: 'nowrap' }}>输入: <span style={{ fontWeight: 600 }}>{formatPrice(pRate, model)}</span>/1M</span>}
            {pRate > 0 && cRate > 0 && <span style={{ margin: '0 4px', color: isLight ? '#d1d5db' : '#4b5563' }}>|</span>}
            {cRate > 0 && <span style={{ whiteSpace: 'nowrap' }}>输出: <span style={{ fontWeight: 600 }}>{formatPrice(cRate, model)}</span>/1M</span>}
          </>
        );
      } else if (billing_type === 'requests') {
        const fRate = fixed_rate !== undefined && fixed_rate !== null ? Number(fixed_rate) : 0;
        if (fRate === 0) {
          return freeBadge;
        }
        const isImageRule = ['per_image', 'vidu_image', 'image_resolution', 'image_size_pixel', 'volc_seedream_pro'].includes(billing_rule || '') ||
          (billing_rule || '').includes('image') ||
          (model.type_name || '').includes('图片') ||
          (model.type_name || '').includes('图像') ||
          (model.type_name || '').includes('Image');
        const unit = isImageRule ? '/张' : '/次';
        priceContent = <><span style={{ fontWeight: 600 }}>{formatPrice(fRate, model)}</span>{unit}</>;
      } else if (billing_type === 'duration') {
        const dRate = duration_rate !== undefined && duration_rate !== null ? Number(duration_rate) : 0;
        if (dRate === 0) {
          return freeBadge;
        }
        priceContent = <><span style={{ fontWeight: 600 }}>{formatPrice(dRate, model)}</span>/秒</>;
      }
    }

    if (priceContent) {
      const showMultiplier = ext.enable_time_multipliers && Array.isArray(ext.time_multipliers) && ext.time_multipliers.length > 0;
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <span style={priceStyle}>
            {priceContent}
          </span>
          {showMultiplier && (
            <Tooltip title={
              <div style={{ padding: '4px 2px' }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>峰谷时段价格倍率已启用:</div>
                {ext.time_multipliers.map((tm: any, idx: number) => (
                  <div key={idx} style={{ fontSize: 11, display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                    <span>{tm.start} - {tm.end}</span>
                    <span style={{ color: Number(tm.multiplier) < 1 ? '#52c41a' : '#faad14', fontWeight: 600 }}>{Number(tm.multiplier).toFixed(2)}倍</span>
                  </div>
                ))}
              </div>
            }>
              <Tag color="orange" style={{ margin: '2px 0 0 0', padding: '0 4px', fontSize: 10, borderRadius: 4, height: 16, lineHeight: '14px', border: 'none' }}>峰谷优惠</Tag>
            </Tooltip>
          )}
        </div>
      );
    }
  };


  const renderUniversalPriceDetailsInner = (variant: any, subRate: number = 1) => {
    const billing = variant.billing || getFallbackBilling(variant);
    if (!billing) return <span style={{ color: c.text3, fontSize: 13 }}>Unconfigured</span>;

    const isTokens = billing.billing_type === 'tokens';
    const isRequests = billing.billing_type === 'requests';
    const isDuration = billing.billing_type === 'duration';
    const br = billing.billing_rule;

    const ext = safeParseJson(billing.extended_config);
    const tiers = safeParseJson(billing.pricing_tiers, []);

    const imgRefStr = ext.image_ref_multiplier && ext.image_ref_multiplier !== 1 ? ` (${tp('img2img', '图生图')}×${ext.image_ref_multiplier})` : '';

    // 1. 如果有阶梯定价
    if (tiers.length > 0) {
      // 如果是 tokens 相关的已知阶梯
      if (isTokens && (br === 'tiered' || br === 'doubao_chat')) {
        const hasFast = br === 'doubao_chat' && tiers.some((t: any) => t.fast_prompt_rate > 0 || t.fast_completion_rate > 0);
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tiers.map((tier: any, idx: number) => {
              const pLabel = tier.max_prompt_tokens ? `≤${tier.max_prompt_tokens}k` : '无限制';
              const cLabel = tier.max_completion_tokens ? `≤${tier.max_completion_tokens}k` : '无限制';
              let title = `阶梯 ${idx + 1}: 输入 ${pLabel}`;
              if (tier.max_completion_tokens) {
                title += ` | 输出 ${cLabel}`;
              }
              const items: any[] = [];
              items.push({ label: '文本输入', price: tier.prompt_rate, unit: '/ 1M' });
              items.push({ label: '文本输出', price: tier.completion_rate, unit: '/ 1M' });
              if (tier.audio_prompt_rate > 0) items.push({ label: '音频输入', price: tier.audio_prompt_rate, unit: '/ 1M' });
              if (tier.cached_rate > 0) items.push({ label: '命中缓存', price: tier.cached_rate, unit: '/ 1M' });
              if (tier.audio_cached_rate > 0) items.push({ label: '音频缓存', price: tier.audio_cached_rate, unit: '/ 1M' });
              if (hasFast) {
                if (tier.fast_prompt_rate > 0) items.push({ label: '低延迟 (快P)', price: tier.fast_prompt_rate || tier.prompt_rate, unit: '/ 1M' });
                if (tier.fast_completion_rate > 0) items.push({ label: '低延迟 (快C)', price: tier.fast_completion_rate || tier.completion_rate, unit: '/ 1M' });
                if (tier.fast_cached_rate > 0) items.push({ label: '低延迟 (快缓)', price: tier.fast_cached_rate, unit: '/ 1M' });
                if (tier.fast_audio_prompt_rate > 0) items.push({ label: '低延迟 (快音P)', price: tier.fast_audio_prompt_rate, unit: '/ 1M' });
                if (tier.fast_audio_cached_rate > 0) items.push({ label: '低延迟 (快音缓)', price: tier.fast_audio_cached_rate, unit: '/ 1M' });
              }
              return <div key={idx}>{renderPriceGridTable(title, items, variant, undefined, undefined, subRate)}</div>;
            })}
          </div>
        );
      }

      // 其它阶梯情况，如 image_resolution, image_size_pixel, video_resolution, video_quality 等
      const items: any[] = [];
      const unit = isDuration ? '/秒' : (isRequests ? '/张' : '/次');
      if (br === 'volc_seedream_pro') {
        const pRate = billing.prompt_rate !== undefined && billing.prompt_rate !== null ? Number(billing.prompt_rate) : 0;
        items.push({ label: '输入图额外 (第2张起)', price: pRate, unit: '/张' });
      }
      tiers.filter((tier: any) => tier.enabled !== false).forEach((tier: any) => {
        let label = '规格';
        if (tier.resolution && tier.fps_range) {
          label = `${tier.resolution} | ${tier.fps_range === '<=30' ? '≤30fps' : tier.fps_range === '>30' ? '>30fps' : tier.fps_range}`;
        } else if (tier.resolution) {
          label = tier.resolution;
        } else if (tier.size) {
          label = tier.size;
        } else if (tier.max_pixels_wan !== undefined) {
          label = `输出总像素 <= ${tier.max_pixels_wan}万`;
        }
        if (tier.quality_pricing) {
          items.push({ label: `${label} (低)`, price: tier.rate_low, unit });
          items.push({ label: `${label} (中)`, price: tier.rate_medium, unit });
          items.push({ label: `${label} (高)`, price: tier.rate_high, unit });
        } else {
          items.push({ label, price: tier.rate, unit });
        }
      });
      if (items.length > 0) {
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {renderPriceGridTable('', items, variant, undefined, undefined, subRate)}
            {imgRefStr && <div style={{ fontSize: 11, color: c.text3, marginTop: 2 }}>{imgRefStr}</div>}
          </div>
        );
      }
    }

    // 2. 如果有自定义价格表 (price_table 或 resolution_rates)
    const pt = ext.price_table || ext.resolution_rates;
    if (pt && typeof pt === 'object') {
      const disabledKeys: string[] = Array.isArray(ext.price_table_disabled) ? ext.price_table_disabled : [];
      const items: any[] = [];
      const unit = isDuration ? '/秒' : (variant.type_name?.includes('图') || isRequests ? '/张' : '/次');

      // 扁平化遍历 price_table 或 resolution_rates
      const traverseTable = (obj: any, prefix = '') => {
        Object.entries(obj).forEach(([key, val]) => {
          if (disabledKeys.includes(key)) return;
          const label = prefix ? `${prefix} | ${key}` : key;
          const friendlyLabel = translateBillingKey(label);
          if (typeof val === 'number') {
            items.push({ label: friendlyLabel, price: val, unit });
          } else if (val && typeof val === 'object') {
            const valAny = val as any;
            // 针对 resolution_rates 中 with_video / without_video 的特殊处理
            if (valAny.with_video !== undefined || valAny.without_video !== undefined) {
              if (valAny.with_video !== undefined) items.push({ label: `${friendlyLabel} (含视)`, price: valAny.with_video, unit: '/ 1M' });
              if (valAny.without_video !== undefined) items.push({ label: `${friendlyLabel} (无视)`, price: valAny.without_video, unit: '/ 1M' });
            } else {
              traverseTable(val, label);
            }
          }
        });
      };

      traverseTable(pt);
      const discount = br === 'vidu_video' ? ext.offpeak_discount : undefined;
      if (items.length > 0) {
        return renderPriceGridTable('', items, variant, discount, undefined, subRate);
      }
    }

    // 针对特定规则且无大表的特探 (seedance1.5pro, seedance1.0, volcengine)
    if (isTokens) {
      if (br === 'gpt_billing') {
        const gptConfig = (ext && typeof ext.gpt_config === 'object' && ext.gpt_config !== null) ? ext.gpt_config : {};
        const items: { label: string; price: number; unit: string }[] = [];
        const configKeys = [
          { key: 'input_text', label: '输入文本' },
          { key: 'input_image', label: '输入图片' },
          { key: 'output_image', label: '输出图片' },
          { key: 'cached_input_text', label: '输入文本缓存' },
          { key: 'cached_input_image', label: '输入图片缓存' },
        ];
        configKeys.forEach(item => {
          const cfg = gptConfig[item.key];
          if (cfg && cfg.enabled) {
            items.push({ label: item.label, price: cfg.rate, unit: '/ 1M' });
          }
        });
        return renderPriceGridTable('', items, variant, undefined, undefined, subRate);
      }
      if (br === 'multimodal') {
        const items = [
          { label: '文本输入', price: billing.prompt_rate, unit: '/ 1M' },
          { label: '文本输出', price: billing.completion_rate, unit: '/ 1M' },
          { label: '图片输入', price: ext.image_prompt_rate, unit: '/ 1M' }
        ];
        return renderPriceGridTable('', items, variant, undefined, undefined, subRate);
      }
      if (br === 'seedance1.5pro') {
        const items = [
          { label: '带语音', price: ext.audio_rate, unit: '/ 1M' },
          { label: '无语音', price: ext.base_rate, unit: '/ 1M' }
        ];
        return renderPriceGridTable('', items, variant, ext.offline_discount, '离线折扣: ×', subRate);
      }
      if (br === 'seedance1.0') {
        const items = [
          { label: '在线', price: ext.online_rate, unit: '/ 1M' },
          { label: '离线', price: ext.offline_rate, unit: '/ 1M' }
        ];
        return renderPriceGridTable('', items, variant, undefined, undefined, subRate);
      }
      if (br === 'volcengine') {
        const items = [];
        if (ext.volc_video_enabled) items.push({ label: '含视频', price: ext.volc_video_rate, unit: '/ 1M' });
        if (ext.volc_audio_enabled) items.push({ label: '含音频', price: ext.volc_audio_rate, unit: '/ 1M' });
        if (ext.volc_base_enabled) items.push({ label: '纯文本', price: ext.volc_base_rate, unit: '/ 1M' });
        return renderPriceGridTable('', items, variant, undefined, undefined, subRate);
      }
    }

    if (isDuration && br === 'kling_video') {
      const mm = ext.mode_multipliers || {};
      const sm = ext.sound_multipliers || {};
      const vm = ext.video_ref_multipliers || {};
      const items = [
        { label: '基准单价', price: billing.duration_rate, unit: '/秒' },
        { label: '标准模式 (std) 倍率', price: mm.std ?? 1.0, unit: '倍' },
        { label: '高品质模式 (pro) 倍率', price: mm.pro ?? 1.33, unit: '倍' },
        { label: '2K 分辨率模式 倍率', price: mm['2k'] ?? 1.5, unit: '倍' },
        { label: '4K 分辨率模式 倍率', price: mm['4k'] ?? 2.0, unit: '倍' },
        { label: '有声倍率 (on)', price: sm.on ?? 1.5, unit: '倍' },
        { label: '无声倍率 (off)', price: sm.off ?? 1.0, unit: '倍' },
        { label: '有参考视频倍率 (yes)', price: vm.yes ?? 1.5, unit: '倍' },
        { label: '无参考视频倍率 (no)', price: vm.no ?? 1.0, unit: '倍' }
      ];
      return renderPriceGridTable('可灵视频倍率计费明细', items, variant, undefined, undefined, subRate);
    }

    // 3. 兜底，展示所有的非零基础单价
    const items: any[] = [];
    const pRate = billing.prompt_rate ? Number(billing.prompt_rate) : 0;
    const cRate = billing.completion_rate ? Number(billing.completion_rate) : 0;
    const fRate = billing.fixed_rate ? Number(billing.fixed_rate) : 0;
    const dRate = billing.duration_rate ? Number(billing.duration_rate) : 0;
    const cacheVal = billing.cached_rate ? Number(billing.cached_rate) : 0;
    const ccCreate = billing.claude_cache_creation_rate ? Number(billing.claude_cache_creation_rate) : 0;
    const ccRead = billing.claude_cache_read_rate ? Number(billing.claude_cache_read_rate) : 0;

    if (pRate > 0 || cRate > 0) {
      items.push({ label: '基础输入', price: pRate, unit: '/ 1M' });
      items.push({ label: '基础输出', price: cRate, unit: '/ 1M' });
      if (cacheVal > 0) items.push({ label: '命中缓存', price: cacheVal, unit: '/ 1M' });
      if (ccCreate > 0) items.push({ label: '写入缓存', price: ccCreate, unit: '/ 1M' });
      if (ccRead > 0) items.push({ label: '读取缓存', price: ccRead, unit: '/ 1M' });
    } else if (fRate > 0) {
      const isImageRule = ['per_image', 'vidu_image', 'image_resolution', 'image_size_pixel', 'volc_seedream_pro'].includes(br || '') ||
        (br || '').includes('image') ||
        (variant.type_name || '').includes('图片') ||
        (variant.type_name || '').includes('图像') ||
        (variant.type_name || '').includes('Image');
      const unit = isImageRule ? '/张' : (br === 'characters' ? '/万字符' : '/次');
      items.push({ label: '固定费率', price: fRate, unit });
    } else if (dRate > 0) {
      items.push({ label: '时长费率', price: dRate, unit: '/秒' });
    }

    if (items.length > 0) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {renderPriceGridTable('', items, variant, undefined, undefined, subRate)}
          {imgRefStr && <div style={{ fontSize: 11, color: c.text3, marginTop: 2 }}>{imgRefStr}</div>}
        </div>
      );
    }

    // 啥费率都没有
    return (
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>免费</span>
      </div>
    );
  };

  const renderUniversalPriceDetails = (variant: any) => {
    const node = renderUniversalPriceDetailsInner(variant);
    const hasDiscount = variant.global_discount_enabled === 1 && variant.global_discount !== undefined && variant.global_discount > 0 && variant.global_discount < 1;
    const billing = variant.billing || getFallbackBilling(variant);
    const ext = safeParseJson(billing?.extended_config);
    const showMultipliers = ext?.enable_time_multipliers && Array.isArray(ext.time_multipliers) && ext.time_multipliers.length > 0;
    const upstreamChannels = (variant.ha_subchannels || []).filter((sub: any) => sub.is_ha || Number(sub.rate) !== 1);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {upstreamChannels.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 2 }}>
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
              background: isLight ? '#09090b' : '#fafafa',
              color: isLight ? '#fafafa' : '#09090b',
              display: 'inline-block', lineHeight: '16px'
            }}>
              默认定价
            </span>
          </div>
        )}
        {node}
        {hasDiscount && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              fontSize: 10, fontWeight: 600, lineHeight: '16px',
              padding: '0 6px', borderRadius: 4,
              background: 'linear-gradient(135deg, #ff4d4f 0%, #ff7875 100%)',
              color: '#fff',
              border: 'none',
              boxShadow: '0 1px 3px rgba(255,77,79,0.2)',
              display: 'inline-block'
            }}>
              {Number((variant.global_discount * 10).toFixed(1))}折
            </span>
          </div>
        )}
        {showMultipliers && (
          <div style={{
            marginTop: 8,
            padding: '10px 12px',
            background: isLight ? 'rgba(250,173,20,0.05)' : 'rgba(250,173,20,0.08)',
            borderRadius: 8,
            border: `1px dashed ${isLight ? 'rgba(250,173,20,0.3)' : 'rgba(250,173,20,0.4)'}`
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <span style={{
                fontSize: 10, fontWeight: 600, padding: '0 6px', borderRadius: 4,
                background: '#faad14', color: '#fff', display: 'inline-block', lineHeight: '16px'
              }}>
                峰谷时段倍率
              </span>
              <span style={{ fontSize: 11, color: c.text2, fontWeight: 500 }}>当前规则已开启时间段倍率折算</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {ext.time_multipliers.map((tm: any, idx: number) => (
                <div key={idx} style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', color: c.text2 }}>
                  <span>时段 {idx + 1}: <span style={{ fontFamily: 'monospace', fontWeight: 500 }}>{tm.start} ~ {tm.end}</span></span>
                  <span style={{ color: Number(tm.multiplier) < 1 ? '#52c41a' : '#faad14', fontWeight: 600 }}>{Number(tm.multiplier).toFixed(2)} 倍</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: c.text3, marginTop: 8, fontStyle: 'italic' }}>
              * 计费时间段将自适应站点系统设定的默认时区进行判定和折扣折算。
            </div>
          </div>
        )}
        {upstreamChannels.length > 0 && (
          <div style={{
            marginTop: showMultipliers ? 16 : 24,
            display: 'flex',
            flexDirection: 'column'
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {upstreamChannels.map((sub: any, idx: number) => {
                const subRate = Number(sub.rate) || 1;
                return (
                  <div key={idx} style={{ 
                    fontSize: 13, 
                    display: 'flex', 
                    flexDirection: 'column',
                    gap: 12,
                    paddingBottom: idx === upstreamChannels.length - 1 ? 0 : 16,
                    paddingTop: idx === 0 ? 0 : 16,
                    borderBottom: idx === upstreamChannels.length - 1 ? 'none' : `1px dashed ${isLight ? '#e4e4e7' : '#27272a'}`
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: isLight ? '#09090b' : '#fafafa', fontWeight: 600 }}>{sub.provider_type || sub.name}</span>
                        <span style={{ 
                          fontSize: 11, 
                          padding: '1px 6px', 
                          borderRadius: 4, 
                          background: isLight ? '#f4f4f5' : '#27272a',
                          color: isLight ? '#52525b' : '#a1a1aa',
                          border: `1px solid ${isLight ? '#e4e4e7' : '#3f3f46'}`
                        }}>
                          {subRate.toFixed(2)}x
                        </span>
                    </div>
                    <div style={{ background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)', padding: '10px 12px', borderRadius: 6 }}>
                      {renderUniversalPriceDetailsInner(variant, subRate)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

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
      onClick: () => changeLanguage(lng),
    }));



  const announcementContent = (
    <div style={{ width: 360, display: 'flex', flexDirection: 'column' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 20px', borderBottom: isLight ? '1px solid #f0f0f0' : '1px solid rgba(255,255,255,0.08)'
      }}>
        <span style={{ color: c.text1, fontSize: 16, fontWeight: 500 }}>{_t('header.notifications', '通知')}</span>
      </div>

      <div style={{
        maxHeight: 480, overflowY: 'auto', padding: announcements.length > 0 ? '16px' : '60px 20px',
        display: 'flex', flexDirection: 'column',
      }}>
        {announcements.length > 0 ? (
          <List
            itemLayout="vertical"
            dataSource={announcements}
            split={false}
            renderItem={(item) => (
              <div
                key={item.id}
                style={{
                  background: c.cardBg,
                  borderRadius: 12,
                  padding: '16px',
                  marginBottom: 12,
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = c.cardHoverBg;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = c.cardBg;
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    {item.is_pinned === 1 && (
                      <div style={{
                        background: 'rgba(22, 119, 255, 0.1)', color: '#1677ff', fontSize: 12,
                        padding: '2px 6px', borderRadius: 4, marginTop: 2, whiteSpace: 'nowrap',
                        flexShrink: 0
                      }}>
                        {_t('common.pinned', '置顶')}
                      </div>
                    )}
                    <div style={{ color: c.text1, fontSize: 15, fontWeight: 500, lineHeight: 1.5 }}>
                      {getAnnouncementLabel(item.title)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: c.text3, fontSize: 12 }}>
                    <ScheduleOutlined />
                    {new Date(item.created_at).toLocaleString(i18n.language === 'en' ? 'en-US' : (i18n.language === 'vi' ? 'vi-VN' : 'zh-CN'), {
                      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
                    })}
                  </div>
                </div>

                <div
                  className="quill-content"
                  dangerouslySetInnerHTML={{ __html: getAnnouncementLabel(item.content) }}
                  style={{
                    color: c.text2, fontSize: 13, lineHeight: 1.6,
                    background: 'transparent', padding: '0', overflowWrap: 'break-word', wordBreak: 'break-all'
                  }}
                />
              </div>
            )}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <BellOutlined style={{ fontSize: 64, color: isLight ? '#e5e7eb' : 'rgba(255,255,255,0.1)', marginBottom: 24 }} />
            <div style={{ color: isLight ? '#6b7280' : '#e5e5e5', fontSize: 15, fontWeight: 500, marginBottom: 8 }}>{_t('header.no_notifications', '你的通知将出现在这里')}</div>
            <div style={{ color: isLight ? '#9ca3af' : 'rgba(255,255,255,0.45)', fontSize: 13, lineHeight: 1.6, maxWidth: 260 }}>
              {_t('header.no_notifications_desc', '平台重要公告及更新内容将在这里展示，即可第一时间收到通知。')}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        .mp-search .ant-input-affix-wrapper { background: ${c.searchBg} !important; border: 1px solid ${c.searchBorder} !important; border-radius: 8px !important; height: 40px; font-size: 14px; }
        .mp-search .ant-input-affix-wrapper:hover, .mp-search .ant-input-affix-wrapper:focus-within { border-color: ${c.focusBorder} !important; }
        .mp-search .ant-input { background: transparent !important; color: ${c.text2} !important; }
        .mp-card { border: 1px solid ${c.cardBorder}; border-radius: 12px; padding: 20px; cursor: pointer; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); background: ${c.cardBg}; position: relative; }
        .mp-card:hover { border-color: ${isLight ? '#999999' : '#444448'} !important; background: ${c.cardHoverBg}; transform: translateY(-4px); box-shadow: 0 12px 30px ${c.shadow}; }
        .mp-card-icon { width: 36px; height: 36px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; }
        .mp-sidebar-content { padding: 8px 0; overflow-y: auto; height: 100%; }
        .mp-sidebar-content::-webkit-scrollbar { width: 4px; }
        .mp-sidebar-content::-webkit-scrollbar-thumb { background: ${c.scrollThumb}; border-radius: 4px; }
        .mp-sidebar-title { font-size: 11px; font-weight: 600; color: ${c.text3}; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; padding: 0 20px; }
        .mp-sidebar-item { display: flex; align-items: center; gap: 8px; height: 36px; padding: 0 12px; margin: 2px 8px; border-radius: 6px; cursor: pointer; transition: all 0.12s; font-size: 13.5px; color: ${isLight ? '#4b5563' : 'rgba(255, 255, 255, 0.65)'}; }
        .mp-sidebar-item:hover { background: ${isLight ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.08)'}; color: ${isLight ? '#1f2937' : '#ffffff'}; }
        .mp-sidebar-item.active { background: ${isLight ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 255, 255, 0.12)'} !important; color: ${isLight ? '#1f2937' : '#ffffff'} !important; font-weight: 500; }
        .mp-sidebar-item.active .mp-sidebar-count { color: ${isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.85)'}; }
        .mp-sidebar-count { margin-left: auto; font-size: 12px; color: ${c.textMuted}; font-weight: 500; }
        .mp-sidebar-divider { height: 1px; background: ${c.cardBorder}; margin: 20px 8px; }
        
        @media (max-width: 767px) {
          .responsive-table-wrapper { border: none !important; background: transparent !important; box-shadow: none !important; overflow: visible !important; }
          .responsive-table-wrapper > div { overflow-x: visible !important; }
          .responsive-table { min-width: 100% !important; display: block; }
          .responsive-table thead { display: none; }
          .responsive-table tbody { display: block; }
          .responsive-table tr { display: block; background: ${c.cardBg} !important; border: 1px solid ${c.cardBorder} !important; border-radius: 12px; margin-bottom: 16px; padding: 0; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
          .responsive-table tr:hover { transform: none !important; }
          .responsive-table td { display: block; padding: 16px !important; border-bottom: 1px solid ${isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'} !important; width: 100%; box-sizing: border-box; }
          .responsive-table td:last-child { border-bottom: none !important; }
          .responsive-table td::before { 
            content: attr(data-label); 
            display: block; 
            font-size: 11px; 
            font-weight: 600; 
            color: ${c.text3}; 
            margin-bottom: 8px; 
            text-transform: uppercase; 
          }
        }
      `}</style>

      <Layout style={{ height: '100vh', overflow: 'hidden' }}>
        <Sider
          trigger={null}
          collapsible
          collapsed={collapsed}
          theme={themeMode}
          width={240}
          breakpoint="lg"
          collapsedWidth={screens.xs ? 0 : 68}
          onBreakpoint={(broken) => {
            if (broken) setCollapsed(true);
          }}
          style={{
            boxShadow: 'none',
            borderRight: isLight ? '1px solid #e4e4e7' : '1px solid #1f1f23',
            zIndex: 10,
            position: screens.xs ? 'fixed' : 'relative',
            height: '100%',
            left: 0,
            top: 0,
            bottom: 0,
            overflow: 'hidden',
            background: c.siderBg,
          }}
          className="custom-sider"
        >
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Logo Area */}
            <div style={{
              height: screens.xs ? 48 : 56,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '0 8px',
              borderBottom: isLight ? '1px solid #e4e4e7' : '1px solid #1f1f23',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }} onClick={() => navigate('/dashboard')}>
              {siteLogo ? (
                (collapsed && !screens.xs) ? (
                  <img src={siteLogo} alt="logo" style={{ width: 32, height: 32, objectFit: 'contain' }} />
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', justifyContent: 'center' }}>
                    <img src={siteLogo} alt="logo" style={{ width: 28, height: 28, objectFit: 'contain', flexShrink: 0 }} />
                    <div style={{ color: isLight ? '#1f2937' : '#fff', margin: 0, fontSize: siteName.length > 12 ? 14 : siteName.length > 8 ? 16 : 18, fontWeight: 700, lineHeight: 1.2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-all' }}>
                      {siteName}
                    </div>
                  </div>
                )
              ) : (
                <div style={{ color: isLight ? '#1f2937' : '#fff', margin: 0, fontSize: siteName.length > 12 ? 14 : siteName.length > 8 ? 16 : 18, fontWeight: 700, lineHeight: 1.2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-all', textAlign: 'center' }}>
                  {(collapsed && !screens.xs) ? 'TB' : siteName}
                </div>
              )}
            </div>

            {/* Sidebar Content (Filters) */}
            <div className="mp-sidebar-content" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '8px 0', transition: 'all 0.2s' }}>
              <Tooltip title={collapsed && !screens.xs ? tp('all_models') : ""} placement="right">
                <div
                  className={`mp-sidebar-item ${selectedType === null ? 'active' : ''}`}
                  onClick={() => { setSelectedType(null); setSelectedModel(null); }}
                >
                  <AppstoreOutlined style={{ fontSize: 18 }} />
                  {!(collapsed && !screens.xs) && (
                    <>
                      {tp('all_models')}
                      <span className="mp-sidebar-count">{total}</span>
                    </>
                  )}
                </div>
              </Tooltip>
              {types.map(t => (
                <Tooltip key={t.id} title={collapsed && !screens.xs ? t.name : ""} placement="right">
                  <div
                    className={`mp-sidebar-item ${selectedType === t.id ? 'active' : ''}`}
                    onClick={() => { setSelectedType(t.id); setSelectedModel(null); }}
                  >
                    <span style={{ fontSize: 18, display: 'flex', alignItems: 'center' }}>{getTypeIcon(t.name)}</span>
                    {!(collapsed && !screens.xs) && (
                      <>
                        {t.name}
                        <span className="mp-sidebar-count">{typeCounts[t.id] || 0}</span>
                      </>
                    )}
                  </div>
                </Tooltip>
              ))}
            </div>
          </div>
        </Sider>

        <Layout style={{ marginLeft: (screens.xs || collapsed) ? 0 : 0 }}>
          <Header style={{
            padding: '0 12px',
            background: themeMode === 'light' ? '#ffffff' : '#000000',
            height: screens.xs ? 48 : 56,
            lineHeight: (screens.xs ? 48 : 56) + 'px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingRight: screens.xs ? 8 : 24,
            borderBottom: themeMode === 'light' ? '1px solid #e4e4e7' : '1px solid #1f1f23'
          }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <Button
                type="text"
                icon={<SidebarIcon size={16} />}
                onClick={() => handleCollapsedChange(!collapsed)}
                style={{
                  width: 32,
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: themeMode === 'light' ? '#71717a' : '#a1a1aa',
                  borderRadius: 6
                }}
              />
              {screens.xs && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 8 }} onClick={() => navigate('/dashboard')}>
                  {siteLogo && <img src={siteLogo} alt="logo" style={{ width: 24, height: 24, objectFit: 'contain' }} />}
                  <span style={{ color: c.text1, fontSize: '16px', fontWeight: 600 }}>{siteName}</span>
                </div>
              )}
            </div>

            <Space size={screens.xs ? "small" : "middle"} align="center">
              <style>{`
                .header-badge.ant-badge {
                  display: flex !important;
                  align-items: center;
                  justify-content: center;
                  height: 40px;
                }
              `}</style>
              <Tooltip title={_t('menu.model_marketplace', '模型广场')} placement="bottom">
                <Button
                  type="text"
                  href="/models"
                  icon={
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      style={{ verticalAlign: 'middle', transform: 'translateY(1.5px)' }}
                    >
                      <path d="M12 2L19.5 6.2L12 10.5L4.5 6.2Z" fill={isLight ? '#e0e0e0' : '#2e2e2e'} />
                      <path d="M3.5 7.8L11 12V21L3.5 16.8Z" fill={isLight ? '#b0b0b0' : '#555555'} />
                      <path d="M13 12L20.5 7.8V16.8L13 21Z" fill={isLight ? '#757575' : '#9e9e9e'} />
                    </svg>
                  }
                  style={{
                    color: isLight ? '#1f2937' : '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 14,
                    fontWeight: 500,
                    height: 40,
                    padding: '0 12px',
                  }}
                  onClick={(e) => {
                    if (!e.metaKey && !e.ctrlKey) {
                      e.preventDefault();
                      navigate('/models');
                    }
                  }}
                >
                  <span style={{ display: 'inline-block', transform: 'translateY(1.5px)' }}>{_t('menu.model_marketplace', '模型广场')}</span>
                </Button>
              </Tooltip>

              <Tooltip title={_t('menu.relay_api', 'API教程')} placement="bottom">
                <Button
                  type="text"
                  href="/docs"
                  icon={<RocketOutlined style={{ fontSize: '16px', verticalAlign: 'middle', transform: 'translateY(1.5px)' }} />}
                  style={{
                    color: isLight ? '#1f2937' : '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 14,
                    fontWeight: 500,
                    height: 40,
                    padding: '0 12px',
                  }}
                  onClick={(e) => {
                    if (!e.metaKey && !e.ctrlKey) {
                      e.preventDefault();
                      navigate('/docs');
                    }
                  }}
                >
                  <span style={{ display: 'inline-block', transform: 'translateY(1.5px)' }}>{_t('menu.relay_api', 'API教程')}</span>
                </Button>
              </Tooltip>

              {enableThemeToggle && (
                <Tooltip title={isLight ? '切换暗色模式' : '切换亮色模式'} placement="bottom">
                  <Button
                    type="text"
                    shape="circle"
                    onClick={toggleTheme}
                    icon={
                      isLight
                        ? (
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ verticalAlign: 'middle', transform: 'translateY(1.5px)' }}>
                            <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79Z" fill="#757575" />
                          </svg>
                        )
                        : (
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ verticalAlign: 'middle', transform: 'translateY(1.5px)' }}>
                            <circle cx="12" cy="12" r="6" fill="#555555" />
                            <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41" stroke="#9e9e9e" strokeWidth="2.2" strokeLinecap="round" />
                          </svg>
                        )
                    }
                    style={{ color: c.text1, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40 }}
                  />
                </Tooltip>
              )}

              {enableMultilingual && (
                <Dropdown menu={{ items: langItems }} placement="bottomRight">
                  <Button
                    type="text"
                    shape="circle"
                    icon={
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ verticalAlign: 'middle', transform: 'translateY(1.5px)' }}>
                        <circle cx="12" cy="12" r="8.5" stroke={isLight ? '#757575' : '#9e9e9e'} strokeWidth="2" />
                        <path d="M3.5 12h17" stroke={isLight ? '#b0b0b0' : '#555555'} strokeWidth="2" strokeLinecap="round" />
                        <ellipse cx="12" cy="12" rx="3.5" ry="8.5" stroke={isLight ? '#b0b0b0' : '#555555'} strokeWidth="2" />
                      </svg>
                    }
                    style={{ color: c.text1, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40 }}
                  />
                </Dropdown>
              )}

              <Popover
                content={announcementContent}
                trigger="click"
                placement="bottomRight"
                overlayClassName="custom-premium-popover"
                open={announcementsDrawerVisible}
                onOpenChange={setAnnouncementsDrawerVisible}
                styles={{ container: { padding: 0, background: 'transparent', boxShadow: 'none' } }}
                motion={{ motionName: '' }}
                arrow={false}
              >
                <Tooltip title={_t('header.notifications', '通知')} placement="bottom">
                  <Badge count={unreadCount} overflowCount={99} offset={[-4, 4]} className="header-badge">
                    <Button
                      type="text"
                      shape="circle"
                      icon={
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                          style={{ verticalAlign: 'middle', transform: 'translateY(1.5px)' }}
                        >
                          <path d="M19 16.5v-6.5a7 7 0 00-14 0v6.5l-2 2h18l-2-2z" fill={isLight ? '#757575' : '#9e9e9e'} stroke={isLight ? '#757575' : '#9e9e9e'} strokeWidth="1.5" strokeLinejoin="round" />
                          <path d="M10 19.5a2 2 0 004 0" stroke={isLight ? '#b0b0b0' : '#555555'} strokeWidth="2.5" strokeLinecap="round" />
                        </svg>
                      }
                      style={{ color: c.text1, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40 }}
                      onClick={() => {
                        setUnreadCount(0);
                      }}
                    />
                  </Badge>
                </Tooltip>
              </Popover>

              <UserAvatarMenu isUserEnd={true} agreement={agreement} />
            </Space>
          </Header>

          <Content style={{
            margin: screens.xs ? '8px' : '12px',
            padding: screens.xs ? '10px 8px' : '16px 20px',
            minHeight: 280,
            background: c.bg,
            borderRadius: 8,
            overflow: 'auto',
            position: 'relative'
          }}>
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: 400 }}>
                <Spin size="large" />
              </div>
            ) : forbidden ? (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: 400 }}>
                <Result
                  icon={<LockOutlined style={{ color: c.text3 }} />}
                  title={<span style={{ color: c.text1 }}>{tp('no_access')}</span>}
                  subTitle={<span style={{ color: c.text3 }}>您当前的用户等级暂无权限浏览模型广场，请联系管理员或升级等级。</span>}
                  extra={
                    <Button type="primary" onClick={() => navigate('/dashboard')}>返回{_t('menu.dashboard')}</Button>
                  }
                />
              </div>
            ) : selectedModel ? (
              <div style={{ animation: 'fadeIn 0.3s ease-in-out' }}>
                <style>{`
                  @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
                `}</style>
                <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 16 }}>
                  <Button
                    type="text"
                    icon={<ArrowLeftOutlined />}
                    onClick={() => setSelectedModel(null)}
                    style={{ color: c.text2, fontSize: 13, display: 'inline-flex', alignItems: 'center', borderRadius: 8, border: `1px solid ${c.cardBorder}`, padding: '4px 12px', height: 32, background: 'transparent' }}
                  >
                    返回列表
                  </Button>
                  <Breadcrumb
                    items={[
                      { title: <span style={{ color: c.text3, cursor: 'pointer' }} onClick={() => setSelectedModel(null)}>模型广场</span> },
                      { title: <span style={{ color: c.text1 }}>{selectedModel.original_id || selectedModel.name}</span> },
                    ]}
                  />
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
                  {/* 左侧详情 */}
                  <div style={{ flex: '1 1 500px', background: c.cardBg, border: `1px solid ${c.cardBorder}`, borderRadius: 12, padding: screens.xs ? '16px' : '24px', boxShadow: isLight ? '0 4px 20px rgba(0,0,0,0.02)' : '0 4px 24px rgba(0,0,0,0.3)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                      <div style={{ width: 64, height: 64, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, overflow: 'hidden', background: isLight ? '#f4f5f7' : '#18181b', border: `1px solid ${c.cardBorder}` }}>
                        <img 
                          src={lobeIconSrc(selectedModel.logo, selectedModel.provider_logo)} 
                          alt="" 
                          style={{ width: 48, height: 48, objectFit: 'contain', filter: getLogoFilter(selectedModel.logo || selectedModel.provider_logo || 'default-model', isLight) }} 
                          onError={handleLobeIconError} 
                        />
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <h1 style={{ margin: 0, fontSize: screens.xs ? 20 : 26, fontWeight: 700, color: c.text1 }}>{selectedModel.original_id || selectedModel.name}</h1>
                          {isModelUnavailable(selectedModel) && (
                              <span style={{
                                fontSize: 12, fontWeight: 500, lineHeight: '22px',
                                padding: '0 10px', borderRadius: 10,
                                background: 'rgba(255,77,79,0.1)',
                                color: '#ff4d4f',
                                border: `1px solid rgba(255,77,79,0.3)`
                              }}>
                                模型暂不可用
                              </span>
                          )}
                          {(selectedModel.variant_count || 0) > 1 && (
                            <span style={{
                              fontSize: 12, fontWeight: 500, lineHeight: '22px',
                              padding: '0 10px', borderRadius: 10,
                              background: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.1)',
                              color: isLight ? '#1f2937' : 'rgba(255,255,255,0.88)',
                              border: `1px solid ${isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.15)'}`
                            }}>
                              {selectedModel.variant_count} 种定价
                            </span>
                          )}
                          {(() => {
                            const validDiscounts = (selectedModel.variants || [selectedModel])
                              .filter(v => v.global_discount_enabled === 1 && v.global_discount !== undefined && v.global_discount > 0 && v.global_discount < 1)
                              .map(v => v.global_discount as number);
                            if (validDiscounts.length === 0) return null;
                            const minDiscount = Math.min(...validDiscounts);
                            return (
                              <span style={{
                                fontSize: 12, fontWeight: 600, lineHeight: '22px',
                                padding: '0 10px', borderRadius: 10,
                                background: 'linear-gradient(135deg, #ff4d4f 0%, #ff7875 100%)',
                                color: '#fff',
                                border: 'none',
                                boxShadow: '0 2px 4px rgba(255,77,79,0.2)'
                              }}>
                                {Number((minDiscount * 10).toFixed(1))}折
                              </span>
                            );
                          })()}
                        </div>
                        {/* 子标题：仅列出官方服务商，不再显示model_id */}
                        <div style={{ fontSize: 15, color: c.text3, marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          {(() => {
                            const variants = selectedModel.variants || [selectedModel];
                            const uniqueProviders = Array.from(new Set(variants.map(v => v.provider_name).filter(Boolean)));
                            return uniqueProviders.map((pn, i) => {
                              const v = variants.find(vv => vv.provider_name === pn);
                              return (
                                <span key={pn} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                  {i > 0 && <span style={{ width: 4, height: 4, borderRadius: '50%', background: c.textMuted, marginRight: 4 }} />}
                                  {v?.provider_logo && (
                                    <img src={`/assets/icons/lobe/${v.provider_logo}.svg`} alt="" style={{ width: 16, height: 16, objectFit: 'contain', filter: getLogoFilter(v.provider_logo, isLight) }} onError={handleLobeIconError} />
                                  )}
                                  {pn}
                                </span>
                              );
                            });
                          })()}
                        </div>
                      </div>
                    </div>

                    <div style={{ marginBottom: 24 }}>
                      <h3 style={{ fontSize: 15, fontWeight: 600, color: c.text1, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <InfoCircleOutlined style={{ color: c.text2 }} /> {tp('model_desc', '模型简介')}
                      </h3>
                      <div style={{ fontSize: 14, color: c.text2, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                        {(() => {
                          const modelDesc = (selectedModel as any).model_description
                            || (selectedModel.variants || []).map((v: any) => v.model_description).find(Boolean);
                          return modelDesc || tp('no_desc', '该模型暂无详细描述信息。');
                        })()}
                      </div>
                      <div style={{ marginTop: 24 }}>
                        <h3 style={{ fontSize: 15, fontWeight: 600, color: c.text1, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, marginTop: 0 }}>
                          <GlobalOutlined style={{ color: c.text2 }} /> {tp('about_model', '关于模型')}
                        </h3>
                        <div style={{ fontSize: 14, color: c.text3, lineHeight: 1.6 }}>
                          {tp('model_online_desc1', '该模型目前已在全平台上线。您可以直接在 API 调用或')}{_t('menu.dashboard')}{tp('model_online_desc2', '中使用。如果您有大规模调用需求，请联系客服获取专属优惠。')}
                        </div>
                      </div>
                    </div>

                    <Descriptions
                      column={screens.xs ? 1 : 2}
                      bordered
                      size="small"
                      labelStyle={{ background: isLight ? '#f9fafb' : 'rgba(255,255,255,0.01)', color: c.text3, width: 100, fontSize: 13 }}
                      contentStyle={{ background: 'transparent', color: c.text1, fontSize: 13 }}
                      style={{ border: `1px solid ${c.cardBorder}`, borderRadius: 12, overflow: 'hidden', marginBottom: 24 }}
                    >
                      <Descriptions.Item label={tp('category', '能力分类')}>
                        <Tag bordered={false} style={{ margin: 0, borderRadius: 6, padding: '2px 8px', background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.08)', color: c.text2, border: `1px solid ${c.cardBorder}` }}>{selectedModel.type_name}</Tag>
                      </Descriptions.Item>
                      <Descriptions.Item label={tp('provider', '官方服务商')}>
                        {(() => {
                          const variants = selectedModel.variants || [selectedModel];
                          const uniqueProviders = Array.from(new Set(variants.map(v => v.provider_name).filter(Boolean)));
                          return uniqueProviders.join('、') || '-';
                        })()}
                      </Descriptions.Item>
                      <Descriptions.Item label={tp('pricing_plan', '定价方案')}>
                        <Tag bordered={false} style={{ margin: 0, borderRadius: 6, padding: '2px 8px', background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.08)', color: c.text2, border: `1px solid ${c.cardBorder}` }}>
                          {selectedModel.variant_count || 1} {tp('kinds', '种')}
                        </Tag>
                      </Descriptions.Item>
                      <Descriptions.Item label={tp('updated_at', '更新时间')}>
                        {selectedModel.created_at ? new Date(selectedModel.created_at).toLocaleDateString('zh-CN') : '-'}
                      </Descriptions.Item>
                    </Descriptions>
                  </div>
                </div>

                {/* 各定价方案 (高级专业圆角表格风格) */}
                <div style={{ marginTop: 24 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 600, color: c.text1, margin: 0, display: 'flex', alignItems: 'center', gap: 8, letterSpacing: '-0.3px' }}>
                      {tp('pricing', 'Pricing')}
                    </h3>
                    {auxiliaryCurrencies.length > 0 && (
                      <Dropdown menu={{
                        items: [
                          { key: '', label: `${tp('default_currency', '默认货币')} (${currencySymbol})` },
                          ...auxiliaryCurrencies.map(curr => ({ key: curr.code, label: `${curr.code} (${curr.symbol})` }))
                        ],
                        onClick: ({ key }) => setSelectedCurrencyCode(key)
                      }}>
                        <Button size="small">
                          {(() => {
                            if (!selectedCurrencyCode) return `${tp('default_currency', '默认货币')} (${currencySymbol})`;
                            const curr = auxiliaryCurrencies.find(c => c.code === selectedCurrencyCode);
                            return curr ? `${curr.code} (${curr.symbol})` : tp('switch_currency', '切换货币显示');
                          })()}
                        </Button>
                      </Dropdown>
                    )}
                  </div>
                  <div className="responsive-table-wrapper" style={{
                    border: `1px solid ${c.cardBorder}`,
                    borderRadius: 12,
                    overflow: 'hidden',
                    background: c.cardBg,
                    boxShadow: isLight ? '0 4px 20px rgba(0,0,0,0.02)' : '0 4px 24px rgba(0,0,0,0.3)'
                  }}>
                    <div style={{ overflowX: 'auto' }}>
                      <table className="responsive-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 14, minWidth: 600 }}>
                        <thead>
                          <tr style={{ background: isLight ? '#fafafa' : 'rgba(255,255,255,0.01)', borderBottom: `1px solid ${c.cardBorder}` }}>
                            <th style={{ padding: '16px 24px', fontWeight: 600, color: c.text3, whiteSpace: 'nowrap', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{tp('provider_col', 'Provider')}</th>
                            <th style={{ padding: '16px 24px', fontWeight: 600, color: c.text3, whiteSpace: 'nowrap', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{tp('billing_type_col', 'Billing Type')}</th>
                            <th style={{ padding: '16px 24px', fontWeight: 600, color: c.text3, whiteSpace: 'nowrap', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{tp('price_details_col', '价格明细')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(selectedModel.variants || [selectedModel]).map((variant, vIdx) => {
                            const billing = variant.billing || getFallbackBilling(variant);
                            const isTokens = billing?.billing_type === 'tokens';
                            const isRequests = billing?.billing_type === 'requests';
                            const isDuration = billing?.billing_type === 'duration';
                            const br = billing?.billing_rule;

                            const ext = safeParseJson(billing?.extended_config);
                            const tiers = safeParseJson(billing?.pricing_tiers, []);

                            return (
                              <tr key={variant.id || vIdx} style={{
                                borderBottom: vIdx === (selectedModel.variants || [selectedModel]).length - 1 ? 'none' : `1px solid ${c.cardBorder}`,
                                transition: 'all 0.2s ease-in-out'
                              }} onMouseEnter={e => e.currentTarget.style.background = c.hoverBg} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                <td data-label={tp('provider_col', 'Provider')} style={{ padding: '12px 24px', verticalAlign: 'middle', minWidth: 240, maxWidth: 400 }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    <div style={{
                                      fontFamily: "'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', monospace",
                                      fontSize: 13,
                                      color: c.text1,
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      width: 'fit-content',
                                      gap: 6,
                                      whiteSpace: 'nowrap'
                                    }}>
                                      <span style={{ color: c.text3, fontSize: 12, marginRight: 2 }}>模型ID:</span>
                                      {variant.model_id}
                                      <CopyModelIdButton modelId={variant.model_id} isLight={isLight} c={c} />
                                      {variant.has_ha && <Tag color="purple" style={{ margin: 0, borderRadius: 4, fontSize: 10, border: 'none', lineHeight: '18px', height: 18, padding: '0 4px' }}>高可用</Tag>}
                                    </div>
                                    <div style={{ fontSize: 13, color: c.text2, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-all', marginLeft: 62 }}>
                                      {(variant as any).model_description || '暂无详细描述信息。'}
                                    </div>
                                  </div>
                                </td>
                                <td data-label={tp('billing_type_col', 'Billing Type')} style={{ padding: '12px 24px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                                  {billing ? (
                                    <Tag bordered={false} style={{ margin: 0, borderRadius: 6, padding: '4px 10px', background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.08)', color: c.text2, border: `1px solid ${c.cardBorder}`, fontWeight: 500, fontSize: 12 }}>
                                      {getBillingLabel(billing, tp)}
                                    </Tag>
                                  ) : <span style={{ color: c.text3, fontSize: 13 }}>Unconfigured</span>}
                                </td>
                                <td data-label={tp('price_details_col', '价格明细')} style={{ padding: '12px 24px', verticalAlign: 'middle', color: c.text1, whiteSpace: 'nowrap' }}>
                                  {renderUniversalPriceDetails(variant)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="mp-toolbar" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                  <div className="mp-search" style={{ flex: 1, minWidth: 200, maxWidth: screens.xs ? '100%' : 420 }}>
                    <Input
                      placeholder="搜索模型名称、ID或描述..."
                      prefix={<SearchOutlined style={{ color: c.text3, marginRight: 8 }} />}
                      value={searchKeyword}
                      onChange={e => setSearchKeyword(e.target.value)}
                      allowClear
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: screens.xs ? 0 : 'auto' }}>
                    <Tooltip title="列表布局" placement="top">
                      <button
                        onClick={() => setViewMode('list')}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          width: 36, height: 36, borderRadius: 5,
                          border: `1px solid ${viewMode === 'list' ? c.activeBorder : c.sortBorder}`,
                          background: viewMode === 'list' ? c.activeBg : 'transparent',
                          color: viewMode === 'list' ? c.active : c.text3,
                          cursor: 'pointer', fontSize: 16, transition: 'all 0.2s',
                        }}
                      >
                        <UnorderedListOutlined />
                      </button>
                    </Tooltip>
                    <Tooltip title="网格布局" placement="top">
                      <button
                        onClick={() => setViewMode('grid')}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          width: 36, height: 36, borderRadius: 5,
                          border: `1px solid ${viewMode === 'grid' ? c.activeBorder : c.sortBorder}`,
                          background: viewMode === 'grid' ? c.activeBg : 'transparent',
                          color: viewMode === 'grid' ? c.active : c.text3,
                          cursor: 'pointer', fontSize: 16, transition: 'all 0.2s',
                        }}
                      >
                        <AppstoreOutlined />
                      </button>
                    </Tooltip>
                  </div>
                  {auxiliaryCurrencies.length > 0 && (
                    <Dropdown
                      menu={{
                        items: [
                          { key: '', label: `${tp('default_currency', '默认货币')} (${currencySymbol})` },
                          ...auxiliaryCurrencies.map(curr => ({ key: curr.code, label: `${curr.code} (${curr.symbol})` }))
                        ],
                        onClick: ({ key }) => setSelectedCurrencyCode(key)
                      }}
                      placement="bottomRight"
                    >
                      <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 5, border: `1px solid ${c.sortBorder}`, background: 'transparent', color: c.text3, fontSize: 13, cursor: 'pointer' }}>
                        {(() => {
                          if (!selectedCurrencyCode) return `${tp('default_currency', '默认货币')} (${currencySymbol})`;
                          const curr = auxiliaryCurrencies.find(c => c.code === selectedCurrencyCode);
                          return curr ? `${curr.code} (${curr.symbol})` : tp('switch_currency', '切换货币显示');
                        })()}
                      </button>
                    </Dropdown>
                  )}
                  <Dropdown
                    menu={{
                      items: [
                        { key: 'popular', label: '推荐排序' },
                        { key: 'newest', label: '最新上架' },
                        { key: 'name', label: '名称 A-Z' },
                      ],
                      onClick: ({ key }) => setSortBy(key as any)
                    }}
                    placement="bottomRight"
                  >
                    <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 5, border: `1px solid ${c.sortBorder}`, background: 'transparent', color: c.text3, fontSize: 13, cursor: 'pointer' }}>
                      <SortAscendingOutlined />
                      {sortBy === 'popular' ? '推荐排序' : sortBy === 'newest' ? '最新上架' : '名称排序'}
                    </button>
                  </Dropdown>
                </div>

                {/* 官方服务商横向筛选标签 */}
                {providers.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, color: c.text3, fontWeight: 500, marginRight: 4, whiteSpace: 'nowrap' }}>官方服务商</span>
                    {providers.map(p => {
                      const isActive = selectedProviders.includes(p.id);
                      return (
                        <button
                          key={p.id}
                          onClick={() => handleProviderToggle(p.id)}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            padding: '4px 12px', borderRadius: 20, fontSize: 13,
                            border: `1px solid ${isActive ? c.activeBorder : c.sortBorder}`,
                            background: isActive ? c.activeBg : 'transparent',
                            color: isActive ? c.active : c.text2,
                            cursor: 'pointer', transition: 'all 0.2s', fontWeight: isActive ? 500 : 400,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {p.logo && (
                            <img 
                              src={`/assets/icons/lobe/${p.logo}.svg`} 
                              alt="" 
                              style={{ width: 14, height: 14, objectFit: 'contain', filter: getLogoFilter(p.logo, isLight) }} 
                              onError={handleLobeIconError} 
                            />
                          )}
                          {p.name}
                          <span style={{ fontSize: 11, opacity: 0.7 }}>{providerCounts[p.id] || 0}</span>
                        </button>
                      );
                    })}
                    {selectedProviders.length > 0 && (
                      <button
                        onClick={() => { setSelectedProviders([]); setSelectedModel(null); }}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 20, fontSize: 12, border: 'none', background: 'transparent', color: c.link, cursor: 'pointer' }}
                      >
                        <CloseOutlined style={{ fontSize: 10 }} /> 清除
                      </button>
                    )}
                  </div>
                )}

                {filteredModels.length > 0 ? (
                  <>
                    <div className="mp-grid" style={{
                      display: viewMode === 'grid' ? 'grid' : 'flex',
                      ...(viewMode === 'grid'
                        ? { gridTemplateColumns: screens.xs ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }
                        : { flexDirection: 'column' as const, gap: 12 }
                      ),
                    }}>
                      {pagedModels.map(model => {
                        const billing = model.billing || getFallbackBilling(model);
                        return (
                          <div
                            key={model.id}
                            className="mp-card"
                            onClick={() => setSelectedModel(model)}
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              position: 'relative',
                              padding: viewMode === 'grid' ? '12px 14px' : '16px 20px',
                              background: c.cardBg,
                              borderColor: c.cardBorder,
                              borderRadius: 12,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: viewMode === 'grid' ? 'flex-start' : 'center', gap: 12, marginBottom: viewMode === 'grid' ? 6 : 8 }}>
                              <div className="mp-card-icon" style={{
                                overflow: 'hidden',
                                width: viewMode === 'grid' ? 32 : 20,
                                height: viewMode === 'grid' ? 32 : 20,
                                borderRadius: viewMode === 'grid' ? 6 : 4,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0
                              }}>
                                <img 
                                  src={lobeIconSrc(model.logo, model.provider_logo)} 
                                  alt="" 
                                  style={{ width: viewMode === 'grid' ? 28 : 14, height: viewMode === 'grid' ? 28 : 14, objectFit: 'contain', filter: getLogoFilter(model.logo || model.provider_logo || 'default-model', isLight) }} 
                                  onError={handleLobeIconError} 
                                />
                              </div>

                              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                                  <Tooltip title={model.original_id || model.name} placement="topLeft">
                                    <h3 style={{
                                      margin: 0,
                                      fontSize: viewMode === 'grid' ? 14 : 16,
                                      fontWeight: 500,
                                      color: c.text1,
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                      flex: 1,
                                      minWidth: 0,
                                      fontFamily: "'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'Liberation Mono', 'Courier New', monospace",
                                      letterSpacing: '-0.3px',
                                      lineHeight: 1.4,
                                    }}>
                                      {model.original_id || model.name}
                                    </h3>
                                  </Tooltip>
                                  {isModelUnavailable(model) && (
                                    <span style={{
                                      fontSize: 11, fontWeight: 500, lineHeight: '18px',
                                      padding: '0 8px', borderRadius: 10, flexShrink: 0,
                                      background: 'rgba(255,77,79,0.1)',
                                      color: '#ff4d4f',
                                      border: '1px solid rgba(255,77,79,0.3)',
                                    }}>
                                      暂不可用
                                    </span>
                                  )}
                                  {viewMode !== 'grid' && (model.variant_count || 0) > 1 && (
                                    <span style={{
                                      fontSize: 11, fontWeight: 500, lineHeight: '18px',
                                      padding: '0 8px', borderRadius: 10, flexShrink: 0,
                                      background: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.1)',
                                      color: isLight ? '#1f2937' : 'rgba(255,255,255,0.88)',
                                      border: `1px solid ${isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.15)'}`,
                                    }}>
                                      {model.variant_count} 种定价
                                    </span>
                                  )}
                                  {viewMode !== 'grid' && (() => {
                                    const validDiscounts = (model.variants || [model])
                                      .filter(v => v.global_discount_enabled === 1 && v.global_discount !== undefined && v.global_discount > 0 && v.global_discount < 1)
                                      .map(v => v.global_discount as number);
                                    if (validDiscounts.length === 0) return null;
                                    const minDiscount = Math.min(...validDiscounts);
                                    return (
                                      <span style={{
                                        fontSize: 11, fontWeight: 600, lineHeight: '18px',
                                        padding: '0 8px', borderRadius: 10, flexShrink: 0,
                                        background: 'linear-gradient(135deg, #ff4d4f 0%, #ff7875 100%)',
                                        color: '#fff',
                                        border: 'none',
                                        boxShadow: '0 2px 4px rgba(255,77,79,0.2)'
                                      }}>
                                        {Number((minDiscount * 10).toFixed(1))}折
                                      </span>
                                    );
                                  })()}
                                </div>

                                {/* 子标题：有original_id时显示变体第一个model_id，否则显示model_id。如果是多定价模型组则不显示。 */}
                                {(!model.variant_count || model.variant_count <= 1) && (
                                  <div style={{
                                    marginTop: 4,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    maxWidth: '100%'
                                  }}>
                                    <span style={{
                                      fontSize: 11,
                                      color: c.text2,
                                      fontFamily: "'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', monospace",
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                      maxWidth: 'calc(100% - 22px)'
                                    }}>
                                      {model.original_id && model.variants?.length ? model.variants[0].model_id : model.model_id}
                                    </span>
                                    <CopyModelIdButton
                                      modelId={model.original_id && model.variants?.length ? model.variants[0].model_id : model.model_id}
                                      isLight={isLight}
                                      c={c}
                                    />
                                  </div>
                                )}
                              </div>
                            </div>

                            {viewMode === 'grid' && model.description && (
                              <div style={{
                                fontSize: 12, color: c.text3, lineHeight: 1.5, marginBottom: 6,
                                overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
                              }}>
                                {model.description}
                              </div>
                            )}

                            {/* 价格展示区 */}
                            {billing && (
                              <div style={{
                                marginBottom: viewMode === 'grid' ? 16 : 6,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'flex-end',
                              }}>
                                {renderCardPrice(model)}
                              </div>
                            )}

                            <div style={{
                              fontSize: viewMode === 'grid' ? 12 : 13,
                              color: c.text3,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              width: '100%',
                              gap: 12,
                              ...(viewMode === 'grid' ? { marginTop: 'auto' } : {}),
                            }}>
                              <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                flexWrap: 'wrap',
                                gap: viewMode === 'grid' ? 6 : 8,
                              }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                  {getTypeIcon(model.type_name)}
                                  {model.type_name}
                                </span>
                                {viewMode !== 'grid' && (
                                  <>
                                    <span style={{ color: c.textMuted }}>•</span>
                                    <span>Updated {new Date(model.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                  </>
                                )}

                                {model.sort_order > 900 && (
                                  <>
                                    <span style={{ color: c.textMuted }}>•</span>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                      <span style={{ color: '#e3b341' }}>⚡</span>
                                    </span>
                                  </>
                                )}

                                {billing && billing.billing_type && (
                                  <>
                                    <span style={{ color: c.textMuted }}>•</span>
                                    <span>
                                      {billing.billing_type === 'tokens' ? tp('billing_tokens') :
                                        billing.billing_type === 'requests' ? '按次计费' :
                                          billing.billing_type === 'duration' ? tp('billing_duration') : tp('billing_tokens')}
                                    </span>
                                  </>
                                )}
                              </div>

                              {viewMode === 'grid' && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                                  {(model.variant_count || 0) > 1 && (
                                    <span style={{
                                      fontSize: 11, fontWeight: 500, lineHeight: '18px',
                                      padding: '0 8px', borderRadius: 10,
                                      background: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.1)',
                                      color: isLight ? '#1f2937' : 'rgba(255,255,255,0.88)',
                                      border: `1px solid ${isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.15)'}`,
                                    }}>
                                      {model.variant_count} 种定价
                                    </span>
                                  )}
                                  {(() => {
                                    const validDiscounts = (model.variants || [model])
                                      .filter(v => v.global_discount_enabled === 1 && v.global_discount !== undefined && v.global_discount > 0 && v.global_discount < 1)
                                      .map(v => v.global_discount as number);
                                    if (validDiscounts.length === 0) return null;
                                    const minDiscount = Math.min(...validDiscounts);
                                    return (
                                      <span style={{
                                        fontSize: 11, fontWeight: 600, lineHeight: '18px',
                                        padding: '0 8px', borderRadius: 10,
                                        background: 'linear-gradient(135deg, #ff4d4f 0%, #ff7875 100%)',
                                        color: '#fff',
                                        border: 'none',
                                        boxShadow: '0 2px 4px rgba(255,77,79,0.2)'
                                      }}>
                                        {Number((minDiscount * 10).toFixed(1))}折
                                      </span>
                                    );
                                  })()}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24, padding: '0 8px' }}>
                      <Pagination
                        current={currentPage}
                        pageSize={pageSize}
                        total={filteredModels.length}
                        onChange={(page, size) => {
                          setCurrentPage(page);
                          setPageSize(size);
                        }}
                        showSizeChanger
                        pageSizeOptions={['10', '20', '30', '50', '100']}
                        showTotal={(total) => `共 ${total} 个模型`}
                        size={screens.xs ? 'small' : undefined}
                      />
                    </div>
                  </>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', color: c.textMuted }}>
                    <ShopOutlined style={{ fontSize: 48, marginBottom: 16, opacity: 0.5 }} />
                    <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 8, color: c.text3 }}>
                      {searchKeyword || selectedType !== null || selectedProviders.length > 0 ? '没有找到匹配的模型' : '暂无模型'}
                    </div>
                    <div style={{ fontSize: 14 }}>
                      {searchKeyword || selectedType !== null || selectedProviders.length > 0 ? '尝试调整筛选条件或搜索关键词' : '管理员尚未在模型广场中启用任何模型'}
                    </div>
                    {(searchKeyword || selectedType !== null || selectedProviders.length > 0) && (
                      <button onClick={clearFilters} style={{ marginTop: 16, fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 6, color: c.link, cursor: 'pointer', background: 'transparent', border: 'none' }}>
                        <FilterOutlined /> 清除所有筛选
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </Content>
          {screens.xs && !collapsed && (
            <div
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0,0,0,0.5)',
                zIndex: 9,
              }}
              onClick={() => setCollapsed(true)}
            />
          )}
        </Layout>
      </Layout>
    </>
  );
};

const translateBillingKey = (key: string): string => {
  const map: Record<string, string> = {
    "std": "标准",
    "pro": "专业",
    "fast": "极速",
    "standard": "标准",
    "ai": "大模型",
    "text": "文生",
    "image": "图生",
    "ref": "视频参考",
    "on": "有声",
    "off": "无声",
    "yes": "含视频",
    "no": "无视频",
    "img2img": "图生图",
    "ref_1_3": "1-3张参考",
    "ref_4_7": "4-7张参考"
  };
  const delimiter = key.includes(' | ') ? ' | ' : '|';
  return key.split(delimiter)
    .map(part => {
      const trimmed = part.trim().toLowerCase();
      return map[trimmed] || part.trim();
    })
    .join(delimiter);
};

const safeParseJson = (jsonStr: any, fallback: any = {}): any => {
  if (!jsonStr) return fallback;
  if (typeof jsonStr !== 'string') return jsonStr;
  try {
    return JSON.parse(jsonStr) || fallback;
  } catch {
    return fallback;
  }
};

export default ModelMarketplace;
