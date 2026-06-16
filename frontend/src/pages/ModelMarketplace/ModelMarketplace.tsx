/**
 * 模型广场 - 用户端独立全屏页面
 * 参考 NeuralGrid 设计风格：深色主题 + 左侧筛选 + 模型卡片网格
 */
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ConfigProvider, theme, Input, Checkbox, Avatar, Dropdown, Spin, Empty, Tooltip, Popover, Button, Layout, Grid, Space, Result, Descriptions, Tag, Breadcrumb, Badge, List, message, Pagination } from 'antd';
import {
  RocketOutlined, SearchOutlined, ArrowLeftOutlined, AppstoreOutlined,
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
  variant_count?: number;
  variants?: MarketplaceModel[];
}

interface FilterItem {
  id: number;
  name: string;
  logo?: string;
}

import { Image as ImageIcon, Video, AudioLines, MessageSquare, Cuboid, ListOrdered, Code, LayoutGrid } from 'lucide-react';

// 类型图标映射
const getTypeIcon = (typeName: string) => {
  const style = { width: '1em', height: '1em' };
  if (typeName.includes('聊天') || typeName.includes('对话') || typeName.includes('LLM')) return <MessageSquare style={style} />;
  if (typeName.includes('图片') || typeName.includes('图像')) return <ImageIcon style={style} />;
  if (typeName.includes('视频')) return <Video style={style} />;
  if (typeName.includes('音频') || typeName.includes('语音')) return <AudioLines style={style} />;
  if (typeName.includes('代码')) return <Code style={style} />;
  if (typeName.includes('嵌入') || typeName.includes('向量') || typeName.includes('Embedding') || typeName.includes('Vector')) return <Cuboid style={style} />;
  if (typeName.includes('排序') || typeName.includes('重排') || typeName.includes('Rerank')) return <ListOrdered style={style} />;
  return <LayoutGrid style={style} />;
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

const getLogoFilter = (logoName: string | undefined, isLight: boolean) => {
  if (isLight) return 'none';
  if (!logoName) return 'none';
  const name = logoName.toLowerCase();

  // 包含以下关键字的单色/黑色图标，在暗色模式下反色为白色显示
  const monochromeKeywords = [
    'openai', 'github', 'anthropic', 'groq', 'ollama',
    'moonshot', 'zeroone', 'openrouter', 'xai', 'grok'
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
    return (settings?.currency?.auxiliary_currencies || []).filter((c: any) => c.enabled);
  }, [settings?.currency?.auxiliary_currencies]);

  useEffect(() => {
    if (settings?.agreement) setAgreement(settings.agreement);
  }, [settings?.agreement]);

  useEffect(() => {
    document.title = '模型广场';
    fetchData();
  }, []);

  useEffect(() => {
    const fetchAnnouncements = async () => {
      try {
        const response = await (request.get('/announcements/public') as any);
        if (response.data) {
          setAnnouncements(response.data);
          setUnreadCount(response.data.length);
        }
      } catch (error) {
        console.error('Failed to fetch announcements:', error);
      }
    };
    fetchAnnouncements();
  }, []);

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
    bg: isLight ? '#f4f5f7' : '#0a0a0c',
    siderBg: isLight ? '#ffffff' : '#121214',
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

      const formatNumber = (val: number) => parseFloat(val.toFixed(4));

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

  const renderPriceGridTable = (title: string, items: { label: string, price: number | undefined | null, unit: string }[], variant: any, discount?: number, discountLabel: string = '错峰折扣: ×') => {
    const validItems = items.filter(item => item.price !== undefined && item.price !== null && Number(item.price) > 0);
    if (!validItems || validItems.length === 0) return null;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%', maxWidth: 560 }}>
        {title && <div style={{ fontSize: 11, fontWeight: 600, color: c.text2, marginBottom: 2 }}>{title}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 }}>
          {validItems.map((item, idx) => (
            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)', border: `1px solid ${c.cardBorder}`, borderRadius: 6, padding: '4px 8px', fontSize: 11 }}>
              <span style={{ color: c.text3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginRight: 12 }} title={item.label}>{item.label}</span>
              <span style={{ color: c.text1, fontFamily: "'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', monospace", fontWeight: 600, flexShrink: 0 }}>
                {formatPrice(item.price, variant)}<span style={{ fontSize: 10, fontWeight: 400, marginLeft: 2, color: c.text3 }}>{item.unit}</span>
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
    if (!model.billing) return null;
    const { billing_type, prompt_rate, completion_rate, fixed_rate, duration_rate, billing_rule, extended_config, pricing_tiers } = model.billing;

    // Parse extended config
    let ext: any = {};
    if (extended_config) {
      try {
        ext = typeof extended_config === 'string' ? JSON.parse(extended_config) : extended_config;
      } catch (e) { }
    }

    // Parse pricing tiers
    let tiers: any[] = [];
    if (pricing_tiers) {
      try {
        tiers = typeof pricing_tiers === 'string' ? JSON.parse(pricing_tiers) : pricing_tiers;
      } catch (e) { }
    }

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

      // 3. vidu_video billing
      else if (billing_rule === 'vidu_video') {
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
        const isImageRule = ['per_image', 'vidu_image', 'image_resolution', 'image_size_pixel'].includes(billing_rule || '') || 
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
      return (
        <span style={priceStyle}>
          <DollarOutlined style={{ marginRight: 4, color: isLight ? '#4b5563' : 'rgba(255,255,255,0.75)', fontSize: 13 }} />
          {priceContent}
        </span>
      );
    }
    return null;
  };


  const langNameMap: Record<string, string> = {
    zh: '简体中文', en: 'English', ja: '日本語', ko: '한국어',
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
                        padding: '2px 6px', borderRadius: 4, marginTop: 2, whiteSpace: 'nowrap'
                      }}>
                        {_t('common.pinned', '置顶')}
                      </div>
                    )}
                    <div style={{ color: c.text1, fontSize: 15, fontWeight: 500, lineHeight: 1.5 }}>
                      {item.title}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: c.text3, fontSize: 12 }}>
                    <ScheduleOutlined />
                    {new Date(item.created_at).toLocaleString(i18n.language === 'en' ? 'en-US' : 'zh-CN', {
                      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
                    })}
                  </div>
                </div>

                <div
                  className="quill-content"
                  dangerouslySetInnerHTML={{ __html: item.content }}
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
        .mp-sidebar-content { padding: 24px 20px; overflow-y: auto; height: 100%; }
        .mp-sidebar-content::-webkit-scrollbar { width: 4px; }
        .mp-sidebar-content::-webkit-scrollbar-thumb { background: ${c.scrollThumb}; border-radius: 4px; }
        .mp-sidebar-title { font-size: 11px; font-weight: 600; color: ${c.text3}; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; }
        .mp-sidebar-item { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 8px; cursor: pointer; transition: all 0.12s; font-size: 14px; color: ${c.sidebarText}; margin-bottom: 2px; }
        .mp-sidebar-item:hover { background: ${c.hoverBg}; color: ${c.text1}; }
        .mp-sidebar-item.active { background: ${isLight ? '#eaeaea' : '#27272a'} !important; color: ${isLight ? '#000000' : '#ffffff'} !important; font-weight: 500; }
        .mp-sidebar-item.active .mp-sidebar-count { color: ${isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.85)'}; }
        .mp-sidebar-count { margin-left: auto; font-size: 12px; color: ${c.textMuted}; font-weight: 500; }
        .mp-sidebar-divider { height: 1px; background: ${c.cardBorder}; margin: 20px 0; }
        
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
          theme={isLight ? undefined : 'dark'}
          width={200}
          breakpoint="lg"
          collapsedWidth={screens.xs ? 0 : 68}
          onBreakpoint={(broken) => {
            if (broken) setCollapsed(true);
          }}
          style={{
            boxShadow: `1px 0 4px 0 ${c.shadow}`,
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
              display: 'flex', alignItems: 'center', justifyContent: collapsed && !screens.xs ? 'center' : 'flex-start',
              padding: collapsed && !screens.xs ? '16px 0' : '16px 20px',
              borderBottom: `1px solid ${c.cardBorder}`,
              cursor: 'pointer',
              transition: 'all 0.2s'
            }} onClick={() => navigate('/dashboard')}>
              {siteLogo ? (
                (collapsed && !screens.xs) ? (
                  <img src={siteLogo} alt="logo" style={{ width: 28, height: 28, objectFit: 'contain' }} />
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <img src={siteLogo} alt="logo" style={{ width: 28, height: 28, objectFit: 'contain' }} />
                    <span style={{ color: c.text1, fontSize: '18px', fontWeight: 600 }}>{siteName}</span>
                  </div>
                )
              ) : (
                <>
                  <ShopOutlined style={{ fontSize: 20, color: isLight ? '#6b7280' : '#1677ff', marginRight: collapsed && !screens.xs ? 0 : 10 }} />
                  {!(collapsed && !screens.xs) && <span style={{ color: c.text1, fontSize: '18px', fontWeight: 600 }}>{siteName || 'TokensByte'}</span>}
                </>
              )}
            </div>

            {/* Sidebar Content (Filters) */}
            {/* Sidebar Content (Filters) */}
            <div className="mp-sidebar-content" style={{ padding: collapsed && !screens.xs ? '12px 0' : '24px 20px', transition: 'all 0.2s' }}>
              {!(collapsed && !screens.xs) && <div className="mp-sidebar-title" style={{ padding: '0 12px' }}>{tp('browse')}</div>}
              <Tooltip title={collapsed && !screens.xs ? tp('all_models') : ""} placement="right">
                <div
                  className={`mp-sidebar-item ${selectedType === null ? 'active' : ''}`}
                  onClick={() => { setSelectedType(null); setSelectedModel(null); }}
                  style={{ justifyContent: collapsed && !screens.xs ? 'center' : 'flex-start', padding: collapsed && !screens.xs ? '12px 0' : '8px 12px' }}
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
                    style={{ justifyContent: collapsed && !screens.xs ? 'center' : 'flex-start', padding: collapsed && !screens.xs ? '12px 0' : '8px 12px' }}
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
            padding: 0,
            background: c.siderBg,
            height: screens.xs ? 48 : 56,
            lineHeight: (screens.xs ? 48 : 56) + 'px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingRight: screens.xs ? 8 : 24,
            boxShadow: `0 1px 4px ${c.shadow}`,
            borderBottom: `1px solid ${c.cardBorder}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <Button
                type="text"
                icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                onClick={() => handleCollapsedChange(!collapsed)}
                style={{ fontSize: '16px', width: screens.xs ? 48 : 56, height: screens.xs ? 48 : 56, color: c.text1 }}
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
              <Tooltip title={_t('menu.relay_api', 'API教程')} placement="bottom">
                <Button
                  type="text"
                  shape="circle"
                  icon={<RocketOutlined style={{ fontSize: 18, color: isLight ? '#757575' : '#9e9e9e', verticalAlign: 'middle', transform: 'translateY(1.5px)' }} />}
                  style={{ color: c.text1, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40 }}
                  onClick={() => window.open('/relay-api', '_blank')}
                />
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
                overlayInnerStyle={{
                  padding: 0,
                  borderRadius: 20,
                  background: isLight ? 'rgba(255, 255, 255, 0.85)' : 'rgba(30, 30, 30, 0.45)',
                  backdropFilter: 'blur(30px) saturate(200%)',
                  WebkitBackdropFilter: 'blur(30px) saturate(200%)',
                  border: isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.15)',
                  boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.1), 0 24px 48px rgba(0,0,0,0.6)',
                  transform: 'translateZ(0)',
                  overflow: 'hidden'
                }}
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
                        {selectedModel.logo ? (
                          <img src={`/assets/icons/lobe/${selectedModel.logo}.svg`} alt="" style={{ width: 48, height: 48, objectFit: 'contain', filter: getLogoFilter(selectedModel.logo, isLight) }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        ) : selectedModel.provider_logo ? (
                          <img src={`/assets/icons/lobe/${selectedModel.provider_logo}.svg`} alt="" style={{ width: 48, height: 48, objectFit: 'contain', filter: getLogoFilter(selectedModel.provider_logo, isLight) }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        ) : (
                          <span style={{ color: c.text2 }}>{getTypeIcon(selectedModel.type_name)}</span>
                        )}
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <h1 style={{ margin: 0, fontSize: screens.xs ? 20 : 26, fontWeight: 700, color: c.text1 }}>{selectedModel.original_id || selectedModel.name}</h1>
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
                                    <img src={`/assets/icons/lobe/${v.provider_logo}.svg`} alt="" style={{ width: 16, height: 16, objectFit: 'contain', filter: getLogoFilter(v.provider_logo, isLight) }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
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
                            const isTokens = variant.billing?.billing_type === 'tokens';
                            const isRequests = variant.billing?.billing_type === 'requests';
                            const isDuration = variant.billing?.billing_type === 'duration';
                            const br = variant.billing?.billing_rule;

                            let ext: any = {};
                            if (variant.billing?.extended_config) {
                              try { ext = typeof variant.billing.extended_config === 'string' ? JSON.parse(variant.billing.extended_config) : variant.billing.extended_config; } catch { }
                            }

                            let tiers: any[] = [];
                            if (variant.billing?.pricing_tiers) {
                              try { tiers = typeof variant.billing.pricing_tiers === 'string' ? JSON.parse(variant.billing.pricing_tiers) : variant.billing.pricing_tiers; } catch { }
                            }
                            if (!Array.isArray(tiers)) tiers = [];

                            return (
                              <tr key={variant.id || vIdx} style={{
                                borderBottom: vIdx === (selectedModel.variants || [selectedModel]).length - 1 ? 'none' : `1px solid ${c.cardBorder}`,
                                transition: 'all 0.2s ease-in-out'
                              }} onMouseEnter={e => e.currentTarget.style.background = c.hoverBg} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                <td data-label={tp('provider_col', 'Provider')} style={{ padding: '20px 24px', verticalAlign: 'middle', minWidth: 240 }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    <div style={{
                                      fontFamily: "'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', monospace",
                                      fontSize: 13,
                                      color: c.text1,
                                      background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.04)',
                                      padding: '4px 8px',
                                      borderRadius: 6,
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      width: 'fit-content',
                                      gap: 6,
                                      border: `1px solid ${c.cardBorder}`,
                                      whiteSpace: 'nowrap'
                                    }}>
                                      <span style={{ color: c.text3, fontSize: 12, marginRight: 2 }}>模型ID:</span>
                                      {variant.model_id}
                                      <CopyModelIdButton modelId={variant.model_id} isLight={isLight} c={c} />
                                    </div>
                                    <div style={{ fontSize: 13, color: c.text2, lineHeight: 1.5, whiteSpace: 'pre-wrap', marginLeft: 62 }}>
                                      {(variant as any).model_description || '暂无详细描述信息。'}
                                    </div>
                                  </div>
                                </td>
                                <td data-label={tp('billing_type_col', 'Billing Type')} style={{ padding: '20px 24px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                                  {variant.billing ? (
                                    <Tag bordered={false} style={{ margin: 0, borderRadius: 6, padding: '4px 10px', background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.08)', color: c.text2, border: `1px solid ${c.cardBorder}`, fontWeight: 500, fontSize: 12 }}>
                                      {getBillingLabel(variant.billing, tp)}
                                    </Tag>
                                  ) : <span style={{ color: c.text3, fontSize: 13 }}>Unconfigured</span>}
                                </td>
                                <td data-label={tp('price_details_col', '价格明细')} style={{ padding: '20px 24px', verticalAlign: 'middle', color: c.text1, whiteSpace: 'nowrap' }}>
                                  {isTokens ? (
                                    (() => {
                                      if (br === 'tiered' || br === 'doubao_chat') {
                                          if (tiers.length > 0) {
                                            const hasFast = br === 'doubao_chat' && tiers.some((t: any) => t.fast_prompt_rate > 0 || t.fast_completion_rate > 0);
                                            return (
                                              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
                                                  return <div key={idx}>{renderPriceGridTable(title, items, variant)}</div>;
                                                })}
                                              </div>
                                            );
                                          }
                                          return <span style={{ fontSize: 13, color: c.text3, fontWeight: 500 }}>阶梯定价 (暂无配置)</span>;
                                        }

                                      if (br === 'multimodal') {
                                        const items = [
                                          { label: '文本输入', price: variant.billing?.prompt_rate, unit: '/ 1M' },
                                          { label: '文本输出', price: variant.billing?.completion_rate, unit: '/ 1M' },
                                          { label: '图片输入', price: ext.image_prompt_rate, unit: '/ 1M' }
                                        ];
                                        return renderPriceGridTable('', items, variant);
                                      }

                                      if (br === 'seedance2.0') {
                                        const rates = ext.resolution_rates || {};
                                        const activeRes = Object.keys(rates).filter(k => ['480p', '720p', '1080p'].includes(k));
                                        if (activeRes.length === 0) return <span style={{ fontSize: 13, color: c.text3, fontWeight: 500 }}>无独立分辨率设置(自动兜底)</span>;
                                        const items: any[] = [];
                                        activeRes.forEach(r => {
                                          items.push({ label: `${r} (含视)`, price: rates[r].with_video, unit: '/ 1M' });
                                          items.push({ label: `${r} (无视)`, price: rates[r].without_video, unit: '/ 1M' });
                                        });
                                        return renderPriceGridTable('', items, variant);
                                      }

                                      if (br === 'seedance1.5pro') {
                                        const items = [
                                          { label: '带语音', price: ext.audio_rate, unit: '/ 1M' },
                                          { label: '无语音', price: ext.base_rate, unit: '/ 1M' }
                                        ];
                                        return renderPriceGridTable('', items, variant, ext.offline_discount, '离线折扣: ×');
                                      }

                                      if (br === 'seedance1.0') {
                                        const items = [
                                          { label: '在线', price: ext.online_rate, unit: '/ 1M' },
                                          { label: '离线', price: ext.offline_rate, unit: '/ 1M' }
                                        ];
                                        return renderPriceGridTable('', items, variant);
                                      }

                                      if (br === 'volcengine') {
                                        const items = [];
                                        if (ext.volc_video_enabled) items.push({ label: '含视频', price: ext.volc_video_rate, unit: '/ 1M' });
                                        if (ext.volc_audio_enabled) items.push({ label: '含音频', price: ext.volc_audio_rate, unit: '/ 1M' });
                                        if (ext.volc_base_enabled) items.push({ label: '纯文本', price: ext.volc_base_rate, unit: '/ 1M' });
                                        return renderPriceGridTable('', items, variant);
                                      }

                                      const cacheVal = variant.billing?.cached_rate;
                                      const ccCreate = (variant.billing as any)?.claude_cache_creation_rate;
                                      const ccRead = (variant.billing as any)?.claude_cache_read_rate;
                                      const items: any[] = [];
                                      items.push({ label: '基础输入', price: variant.billing?.prompt_rate, unit: '/ 1M' });
                                      items.push({ label: '基础输出', price: variant.billing?.completion_rate, unit: '/ 1M' });
                                      if (cacheVal > 0) items.push({ label: '命中缓存', price: cacheVal, unit: '/ 1M' });
                                      if (ccCreate > 0) items.push({ label: '写入缓存', price: ccCreate, unit: '/ 1M' });
                                      if (ccRead > 0) items.push({ label: '读取缓存', price: ccRead, unit: '/ 1M' });

                                      return renderPriceGridTable('', items, variant);
                                    })()
                                  ) : isRequests ? (
                                    (() => {
                                      const imgRefStr = ext.image_ref_multiplier && ext.image_ref_multiplier !== 1 ? ` (${tp('img2img', '图生图')}×${ext.image_ref_multiplier})` : '';

                                      return (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                          {(br === 'image_resolution' || br === 'image_size_pixel') ? (
                                            (() => {
                                              if (tiers.length > 0) {
                                                const items: any[] = [];
                                                tiers.filter(tier => tier.enabled !== false).forEach(tier => {
                                                  const label = tier.resolution || tier.size;
                                                  if (tier.quality_pricing) {
                                                    items.push({ label: `${label} (低)`, price: tier.rate_low, unit: '/张' });
                                                    items.push({ label: `${label} (中)`, price: tier.rate_medium, unit: '/张' });
                                                    items.push({ label: `${label} (高)`, price: tier.rate_high, unit: '/张' });
                                                  } else {
                                                    items.push({ label, price: tier.rate, unit: '/张' });
                                                  }
                                                });
                                                return (
                                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                    {renderPriceGridTable('', items, variant)}
                                                    {imgRefStr && <div style={{ fontSize: 11, color: c.text3, marginTop: 2 }}>{imgRefStr}</div>}
                                                  </div>
                                                );
                                              }
                                              return <span style={{ fontSize: 13, color: c.text3, fontWeight: 500 }}>{tp('resolution_billing_no_config', '按分辨率计费 (暂无配置)')}{imgRefStr}</span>;
                                            })()
                                          ) : variant.billing?.billing_rule === 'vidu_image' ? (
                                            (() => {
                                              const pt = ext.price_table || {};
                                              const disabledKeys: string[] = Array.isArray(ext.price_table_disabled) ? ext.price_table_disabled : [];
                                              const activeEntries = Object.entries(pt).filter(([k]) => !disabledKeys.includes(k));
                                              if (activeEntries.length > 0) {
                                                const items = activeEntries.map(([k, v]) => ({ label: k, price: v as number, unit: '/张' }));
                                                return renderPriceGridTable('按属性×分辨率查表:', items, variant);
                                              }
                                              return (
                                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                                                  <span style={{ fontSize: 16, fontWeight: 600, fontFamily: "'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', monospace" }}>{formatPrice(variant.billing?.fixed_rate ?? '-', variant)}</span>
                                                  <span style={{ fontSize: 12, color: c.text3, fontWeight: 500 }}>/ {tp('per_image', '张')}</span>
                                                </div>
                                              );
                                            })()
                                          ) : (
                                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                                              <span style={{ fontSize: 16, fontWeight: 600, fontFamily: "'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', monospace" }}>{formatPrice(variant.billing?.fixed_rate ?? '-', variant)}</span>
                                              <span style={{ fontSize: 12, color: c.text3, fontWeight: 500 }}>
                                                {variant.billing?.billing_rule === 'per_image' ? `/ ${tp('per_image', '张')}` : variant.billing?.billing_rule === 'characters' ? `/ 万字符` : `/ ${tp('per_request', '次')}`}
                                              </span>
                                              {imgRefStr && <span style={{ fontSize: 12, color: c.text3, marginLeft: 4 }}>{imgRefStr}</span>}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })()
                                  ) : isDuration ? (
                                    (() => {
                                      if (br === 'video_quality') {
                                         const activeTiers = tiers.filter(t => t.enabled !== false);
                                         if (activeTiers.length > 0) {
                                           const items = activeTiers.map(t => ({
                                             label: `${t.resolution} • ${t.fps_range === '<=30' ? '≤30fps' : t.fps_range === '>30' ? '>30fps' : t.fps_range}`,
                                             price: t.rate,
                                             unit: '/s'
                                           }));
                                           return renderPriceGridTable('', items, variant);
                                         }
                                         return <span style={{ fontSize: 13, color: c.text3, fontWeight: 500 }}>视频画质及帧率阶梯定价 (暂无配置)</span>;
                                       }

                                       if (br === 'video_resolution') {
                                         const activeTiers = tiers.filter(t => t.enabled !== false);
                                         if (activeTiers.length > 0) {
                                           const items = activeTiers.map(t => ({ label: t.resolution, price: t.rate, unit: '/s' }));
                                           return renderPriceGridTable('', items, variant);
                                         }
                                         return <span style={{ fontSize: 13, color: c.text3, fontWeight: 500 }}>视频分辨率阶梯定价 (暂无配置)</span>;
                                       }

                                      if (br === 'kling_video') {
                                        const pt = ext.price_table || {};
                                        const ptKeys = Object.keys(pt);
                                        if (ptKeys.length > 0) {
                                          const eMode = ext.enable_mode !== false;
                                          const eSound = ext.enable_sound !== false;
                                          const eVideo = ext.enable_video_ref === true;
                                          const disabledKeys: string[] = Array.isArray(ext.price_table_disabled) ? ext.price_table_disabled : [];
                                          const activeKeys = ptKeys.filter(key => {
                                            if (disabledKeys.includes(key)) return false;
                                            const parts = key.split('|');
                                            if (!eMode && parts[0] !== 'std') return false;
                                            if (!eSound && parts[1] !== 'off') return false;
                                            if (!eVideo && parts[2] !== 'no') return false;
                                            return true;
                                          });

                                          const modeMap: Record<string, string> = { std: '标准', pro: '高品质', '4k': '4K' };
                                          const soundMap: Record<string, string> = { on: '有声', off: '无声' };
                                          const videoMap: Record<string, string> = { yes: '带参考', no: '无参考' };

                                          if (activeKeys.length > 0) {
                                            const items = activeKeys.map(k => {
                                              const parts = k.split('|');
                                              const labels = [];
                                              if (eMode) labels.push(modeMap[parts[0]] || parts[0]);
                                              if (eSound) labels.push(soundMap[parts[1]] || parts[1]);
                                              if (eVideo) labels.push(videoMap[parts[2]] || parts[2]);
                                              return { label: labels.join(' • '), price: pt[k], unit: '/s' };
                                            });
                                            return renderPriceGridTable('可灵精确视频费率:', items, variant);
                                          }
                                          return <span style={{ fontSize: 13, color: c.text3, fontWeight: 500 }}>精确查表 (无有效条目)</span>;
                                        }
                                        const mm = ext.mode_multipliers || {};
                                        const sm = ext.sound_multipliers || {};
                                        const vm = ext.video_ref_multipliers || {};
                                        const eMode = ext.enable_mode !== false;
                                        const eSound = ext.enable_sound !== false;
                                        const eVideo = ext.enable_video_ref !== false;
                                        return (
                                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 200 }}>
                                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                                              <span style={{ fontSize: 12, color: c.text2 }}>基准:</span>
                                              <span style={{ fontSize: 15, fontWeight: 600, color: c.text1, fontFamily: "'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', monospace" }}>{formatPrice(variant.billing?.duration_rate ?? 0, variant)}</span>
                                              <span style={{ fontSize: 12, color: c.text3 }}>/s</span>
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11, color: c.text3, background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)', padding: '8px', borderRadius: 6, border: `1px solid ${c.cardBorder}` }}>
                                              {eMode && (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                                  <span style={{ color: c.text2 }}>模式倍率:</span>
                                                  <span style={{ fontFamily: "'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', monospace", paddingLeft: 4 }}>std×{mm.std ?? 1} | pro×{mm.pro ?? 1.33} | 4k×{mm['4k'] ?? 2}</span>
                                                </div>
                                              )}
                                              {eSound && (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                                  <span style={{ color: c.text2 }}>音频倍率:</span>
                                                  <span style={{ fontFamily: "'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', monospace", paddingLeft: 4 }}>无声×{sm.off ?? 1} | 有声×{sm.on ?? 1.5}</span>
                                                </div>
                                              )}
                                              {eVideo && (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                                  <span style={{ color: c.text2 }}>视频倍率:</span>
                                                  <span style={{ fontFamily: "'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', monospace", paddingLeft: 4 }}>无×{vm.no ?? 1} | 有×{vm.yes ?? 1.5}</span>
                                                </div>
                                              )}
                                              {!eMode && !eSound && !eVideo && <div style={{ textAlign: 'center', color: c.text3 }}>无附加倍率</div>}
                                            </div>
                                          </div>
                                        );
                                      }

                                      // vidu_video 查表明细
                                      if (br === 'vidu_video' && ext.price_table) {
                                        const pt = ext.price_table || {};
                                        const disabledKeys: string[] = Array.isArray(ext.price_table_disabled) ? ext.price_table_disabled : [];
                                        const activeEntries = Object.entries(pt).filter(([k]) => !disabledKeys.includes(k));
                                        if (activeEntries.length > 0) {
                                          const discount = ext.offpeak_discount;
                                          const items = activeEntries.map(([k, v]) => ({ label: k, price: v as number, unit: '/s' }));
                                          return renderPriceGridTable('按属性×分辨率查表:', items, variant, discount);
                                        }
                                      }

                                      return (
                                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                                          <span style={{ fontSize: 16, fontWeight: 600, fontFamily: "'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', monospace" }}>{formatPrice(variant.billing?.duration_rate ?? '-', variant)}</span>
                                          <span style={{ fontSize: 12, color: c.text3, fontWeight: 500 }}>/s</span>
                                        </div>
                                      );
                                    })()
                                  ) : <span style={{ color: c.text3 }}>-</span>}
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
                            <img src={`/assets/icons/lobe/${p.logo}.svg`} alt="" style={{ width: 14, height: 14, objectFit: 'contain', filter: getLogoFilter(p.logo, isLight) }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
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
                      {pagedModels.map(model => (
                      <div
                        key={model.id}
                        className="mp-card"
                        onClick={() => setSelectedModel(model)}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          position: 'relative',
                          padding: viewMode === 'grid' ? '20px' : '16px 20px',
                          background: c.cardBg,
                          borderColor: c.cardBorder,
                          borderRadius: 12,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: viewMode === 'grid' ? 'flex-start' : 'center', gap: 12, marginBottom: 8 }}>
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
                            {model.logo ? (
                              <img src={`/assets/icons/lobe/${model.logo}.svg`} alt="" style={{ width: viewMode === 'grid' ? 28 : 14, height: viewMode === 'grid' ? 28 : 14, objectFit: 'contain', filter: getLogoFilter(model.logo, isLight) }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            ) : model.provider_logo ? (
                              <img src={`/assets/icons/lobe/${model.provider_logo}.svg`} alt="" style={{ width: viewMode === 'grid' ? 28 : 14, height: viewMode === 'grid' ? 28 : 14, objectFit: 'contain', filter: getLogoFilter(model.provider_logo, isLight) }} onError={e => { (e.target as HTMLImageElement).replaceWith(document.createTextNode('')); }} />
                            ) : (
                              <span style={{ fontSize: viewMode === 'grid' ? 20 : 12 }}>{getTypeIcon(model.type_name)}</span>
                            )}
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
                              {(model.variant_count || 0) > 1 && (
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
                              {(() => {
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

                            {/* 子标题：有original_id时显示变体第一个model_id，否则显示model_id */}
                            <div style={{
                              marginTop: 4,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                              maxWidth: '100%'
                            }}>
                              <code style={{
                                background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.05)',
                                padding: '2px 6px',
                                borderRadius: 4,
                                fontSize: 11,
                                color: c.text2,
                                fontFamily: "'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', monospace",
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                maxWidth: 'calc(100% - 22px)',
                                border: `1px solid ${c.cardBorder}`
                              }}>
                                {model.original_id && model.variants?.length ? model.variants[0].model_id : model.model_id}
                              </code>
                              <CopyModelIdButton
                                modelId={model.original_id && model.variants?.length ? model.variants[0].model_id : model.model_id}
                                isLight={isLight}
                                c={c}
                              />
                            </div>
                          </div>
                        </div>

                        {viewMode === 'grid' && model.description && (
                          <div style={{
                            fontSize: 12, color: c.text3, lineHeight: 1.5, marginBottom: 10,
                            overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
                          }}>
                            {model.description}
                          </div>
                        )}

                        {/* 价格展示区 */}
                        {model.billing && (
                          <div style={{
                            marginBottom: 12,
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
                          flexWrap: 'wrap',
                          gap: viewMode === 'grid' ? 6 : 8,
                          ...(viewMode === 'grid' ? { marginTop: 'auto' } : {}),
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

                          {model.billing && model.billing.billing_type && (
                            <>
                              <span style={{ color: c.textMuted }}>•</span>
                              <span>
                                {model.billing.billing_type === 'tokens' ? tp('billing_tokens') :
                                  model.billing.billing_type === 'requests' ? '按次计费' :
                                    model.billing.billing_type === 'duration' ? tp('billing_duration') : tp('billing_tokens')}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
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

export default ModelMarketplace;
