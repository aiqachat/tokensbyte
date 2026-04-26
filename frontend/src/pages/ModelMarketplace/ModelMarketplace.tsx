/**
 * 模型广场 - 用户端独立全屏页面
 * 参考 NeuralGrid 设计风格：深色主题 + 左侧筛选 + 模型卡片网格
 */
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ConfigProvider, theme, Input, Checkbox, Avatar, Dropdown, Spin, Empty, Tooltip, Drawer, Popover, Button } from 'antd';
import {
  SearchOutlined, ArrowLeftOutlined, AppstoreOutlined,
  MessageOutlined, PictureOutlined, VideoCameraOutlined,
  AudioOutlined, CodeOutlined, ApiOutlined, ShopOutlined,
  FilterOutlined, SortAscendingOutlined, MenuOutlined, CloseOutlined,
  DashboardOutlined, WalletOutlined, LogoutOutlined,
} from '@ant-design/icons';
import request from '../../utils/request';
import useAuthStore from '../../store/auth';

interface MarketplaceModel {
  id: number;
  mid: string;
  name: string;
  model_id: string;
  provider_id: number;
  provider_name: string;
  type_id: number;
  type_name: string;
  sort_order: number;
  description: string;
  billing: any;
  created_at: string;
}

interface FilterItem {
  id: number;
  name: string;
}

// 类型图标映射
const getTypeIcon = (typeName: string) => {
  if (typeName.includes('聊天') || typeName.includes('对话') || typeName.includes('LLM')) return <MessageOutlined />;
  if (typeName.includes('图片') || typeName.includes('图像')) return <PictureOutlined />;
  if (typeName.includes('视频')) return <VideoCameraOutlined />;
  if (typeName.includes('音频') || typeName.includes('语音')) return <AudioOutlined />;
  if (typeName.includes('代码')) return <CodeOutlined />;
  if (typeName.includes('嵌入') || typeName.includes('Embedding')) return <ApiOutlined />;
  return <AppstoreOutlined />;
};

// 计费类型中文
const getBillingLabel = (billing: any) => {
  if (!billing) return null;
  switch (billing.billing_type) {
    case 'token': return '按 Token 计费';
    case 'fixed': return '固定费用';
    case 'duration': return '按时长计费';
    case 'tiered': return '阶梯计费';
    default: return billing.billing_type;
  }
};

const ModelMarketplace: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [siteName, setSiteName] = useState<string>('TokensByte');
  const [siteLogo, setSiteLogo] = useState<string>('');

  const [loading, setLoading] = useState(true);
  const [models, setModels] = useState<MarketplaceModel[]>([]);
  const [providers, setProviders] = useState<FilterItem[]>([]);
  const [types, setTypes] = useState<FilterItem[]>([]);
  const [total, setTotal] = useState(0);

  // 筛选状态
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedType, setSelectedType] = useState<number | null>(null);
  const [selectedProviders, setSelectedProviders] = useState<number[]>([]);
  const [sortBy, setSortBy] = useState<'popular' | 'name' | 'newest'>('popular');
  const [hoveredModelId, setHoveredModelId] = useState<number | null>(null);
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    document.title = '模型广场';
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      // 获取站点基础设置
      const settingsRes = await (request.get('/settings') as Promise<any>);
      if (settingsRes?.site) {
        if (settingsRes.site.name) setSiteName(settingsRes.site.name);
        if (settingsRes.site.logo) setSiteLogo(settingsRes.site.logo);
      }

      const res = await (request.get('/marketplace/public') as Promise<any>);
      if (res) {
        setModels(res.models || []);
        setProviders(res.providers || []);
        setTypes(res.types || []);
        setTotal(res.total || 0);
      }
    } catch (e) {
      console.error('加载模型广场失败', e);
    } finally {
      setLoading(false);
    }
  };

  // 过滤逻辑
  const filteredModels = useMemo(() => {
    let result = [...models];

    // 类型筛选
    if (selectedType !== null) {
      result = result.filter(m => m.type_id === selectedType);
    }

    // 供应商筛选
    if (selectedProviders.length > 0) {
      result = result.filter(m => selectedProviders.includes(m.provider_id));
    }

    // 搜索
    if (searchKeyword) {
      const kw = searchKeyword.toLowerCase();
      result = result.filter(m =>
        m.name.toLowerCase().includes(kw) ||
        m.model_id.toLowerCase().includes(kw) ||
        m.provider_name.toLowerCase().includes(kw) ||
        m.description?.toLowerCase()?.includes(kw)
      );
    }

    // 排序
    if (sortBy === 'name') {
      result.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'newest') {
      result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    // 'popular' 默认已按 sort_order 排序

    return result;
  }, [models, selectedType, selectedProviders, searchKeyword, sortBy]);

  // 统计每个类型的数量
  const typeCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    models.forEach(m => {
      if (m.type_id) counts[m.type_id] = (counts[m.type_id] || 0) + 1;
    });
    return counts;
  }, [models]);

  // 统计每个供应商的数量
  const providerCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    models.forEach(m => {
      if (m.provider_id) counts[m.provider_id] = (counts[m.provider_id] || 0) + 1;
    });
    return counts;
  }, [models]);

  const userInitial = user?.username?.charAt(0)?.toUpperCase() || '?';

  const handleProviderToggle = (id: number) => {
    setSelectedProviders(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const activeFilters = (selectedType !== null ? 1 : 0) + (selectedProviders.length > 0 ? 1 : 0);

  const clearFilters = () => {
    setSelectedType(null);
    setSelectedProviders([]);
    setSearchKeyword('');
  };

  return (
    <ConfigProvider theme={{
      algorithm: theme.darkAlgorithm,
      token: { fontFamily: "'Inter', 'PingFang SC', -apple-system, sans-serif", colorPrimary: '#58a6ff' }
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        
        .mp-page { height: 100vh; width: 100vw; display: flex; flex-direction: column; background: #0d1117; color: #c9d1d9; overflow: hidden; }
        
        /* 顶部导航 */
        .mp-nav { height: 56px; display: flex; align-items: center; justify-content: space-between; padding: 0 24px; border-bottom: 1px solid #21262d; background: #010409; flex-shrink: 0; z-index: 100; }
        .mp-nav-left { display: flex; align-items: center; gap: 24px; }
        .mp-nav-brand { display: flex; align-items: center; gap: 10px; font-size: 16px; font-weight: 700; color: #f0f6fc; cursor: pointer; }
        .mp-nav-links { display: flex; gap: 4px; }
        .mp-nav-link { padding: 6px 12px; border-radius: 8px; font-size: 14px; font-weight: 500; color: #8b949e; cursor: pointer; transition: all 0.15s; text-decoration: none; white-space: nowrap; }
        .mp-nav-link:hover { color: #f0f6fc; background: rgba(255,255,255,0.04); }
        .mp-nav-link.active { color: #f0f6fc; position: relative; }
        .mp-nav-link.active::after { content: ''; position: absolute; bottom: -14px; left: 12px; right: 12px; height: 2px; background: #58a6ff; border-radius: 2px; }
        .mp-nav-right { display: flex; align-items: center; gap: 12px; }
        
        /* 主体布局 */
        .mp-body { flex: 1; display: flex; overflow: hidden; }
        
        /* 侧栏 */
        .mp-sidebar { width: 240px; border-right: 1px solid #21262d; padding: 24px 20px; overflow-y: auto; flex-shrink: 0; }
        .mp-sidebar::-webkit-scrollbar { width: 4px; }
        .mp-sidebar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }
        .mp-sidebar-title { font-size: 11px; font-weight: 600; color: #8b949e; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; }
        .mp-sidebar-item { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 8px; cursor: pointer; transition: all 0.12s; font-size: 14px; color: #8b949e; margin-bottom: 2px; }
        .mp-sidebar-item:hover { background: rgba(255,255,255,0.04); color: #c9d1d9; }
        .mp-sidebar-item.active { background: rgba(88,166,255,0.1); color: #58a6ff; }
        .mp-sidebar-count { margin-left: auto; font-size: 12px; color: #484f58; font-weight: 500; }
        .mp-sidebar-divider { height: 1px; background: #21262d; margin: 20px 0; }
        .mp-provider-item { display: flex; align-items: center; gap: 8px; padding: 6px 0; cursor: pointer; font-size: 14px; color: #8b949e; transition: color 0.12s; }
        .mp-provider-item:hover { color: #c9d1d9; }
        .mp-clear-btn { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 6px; font-size: 12px; color: #58a6ff; cursor: pointer; transition: all 0.15s; background: transparent; border: none; }
        .mp-clear-btn:hover { background: rgba(88,166,255,0.1); }
        
        /* 主内容 */
        .mp-content { flex: 1; overflow-y: auto; padding: 32px 40px; }
        .mp-content::-webkit-scrollbar { width: 6px; }
        .mp-content::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }
        .mp-header { margin-bottom: 24px; }
        .mp-title { font-size: 32px; font-weight: 700; color: #f0f6fc; display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
        .mp-title-badge { font-size: 14px; font-weight: 600; color: #8b949e; background: #21262d; padding: 2px 10px; border-radius: 12px; }
        .mp-subtitle { font-size: 15px; color: #8b949e; line-height: 1.5; max-width: 600px; }
        
        /* 搜索工具栏 */
        .mp-toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 28px; }
        .mp-search { flex: 1; max-width: 420px; }
        .mp-search .ant-input-affix-wrapper { background: #0d1117 !important; border: 1px solid #30363d !important; border-radius: 8px !important; height: 40px; font-size: 14px; }
        .mp-search .ant-input-affix-wrapper:hover, .mp-search .ant-input-affix-wrapper:focus-within { border-color: #58a6ff !important; }
        .mp-search .ant-input { background: transparent !important; color: #c9d1d9 !important; }
        .mp-sort-btn { display: flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px; border: 1px solid #30363d; background: transparent; color: #8b949e; font-size: 13px; cursor: pointer; transition: all 0.15s; margin-left: auto; }
        .mp-sort-btn:hover { border-color: #484f58; color: #c9d1d9; }
        
        /* 模型卡片网格 */
        .mp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
        .mp-card { border: 1px solid #21262d; border-radius: 10px; padding: 20px; cursor: pointer; transition: all 0.2s; background: #0d1117; position: relative; }
        .mp-card:hover { border-color: #30363d; background: #161b22; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
        .mp-card-header { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 12px; }
        .mp-card-icon { width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; }
        .mp-card-title-area { flex: 1; min-width: 0; }
        .mp-card-provider { font-size: 12px; color: #8b949e; margin-bottom: 2px; }
        .mp-card-name { font-size: 15px; font-weight: 600; color: #f0f6fc; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .mp-card-desc { font-size: 13px; color: #8b949e; line-height: 1.5; margin-bottom: 14px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; min-height: 40px; }
        .mp-card-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .mp-card-tag { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 6px; font-size: 12px; font-weight: 500; }
        .mp-card-tag.type { background: rgba(88,166,255,0.1); color: #58a6ff; }
        .mp-card-tag.billing { background: rgba(63,185,80,0.1); color: #3fb950; }
        .mp-card-tag.model-id { background: rgba(139,148,158,0.1); color: #8b949e; font-family: 'SF Mono', 'Cascadia Code', monospace; font-size: 11px; }
        .mp-card-dot { width: 3px; height: 3px; border-radius: 50%; background: #30363d; }
        
        /* 空状态 */
        .mp-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 80px 20px; color: #484f58; }
        .mp-empty-icon { font-size: 48px; margin-bottom: 16px; opacity: 0.5; }
        .mp-empty-text { font-size: 16px; font-weight: 500; margin-bottom: 8px; color: #8b949e; }
        .mp-empty-hint { font-size: 14px; }

        /* 移动端筛选按钮 */
        .mp-filter-fab { display: none; position: fixed; bottom: 24px; right: 24px; z-index: 200; width: 52px; height: 52px; border-radius: 50%; background: linear-gradient(135deg, #58a6ff 0%, #388bfd 100%); color: #fff; border: none; font-size: 20px; cursor: pointer; box-shadow: 0 4px 16px rgba(88,166,255,0.4); transition: all 0.2s; align-items: center; justify-content: center; }
        .mp-filter-fab:active { transform: scale(0.95); }
        .mp-filter-badge { position: absolute; top: -4px; right: -4px; min-width: 18px; height: 18px; border-radius: 9px; background: #f85149; color: #fff; font-size: 11px; font-weight: 600; display: flex; align-items: center; justify-content: center; padding: 0 4px; }

        /* ===== 移动端响应式 ===== */
        @media (max-width: 767px) {
          .mp-nav { padding: 0 12px; height: 48px; }
          .mp-nav-brand span { display: none; }
          .mp-nav-links { gap: 0; }
          .mp-nav-link { padding: 4px 8px; font-size: 13px; }
          .mp-nav-link.active::after { bottom: -11px; }
          .mp-sidebar { display: none; }
          .mp-filter-fab { display: flex; }
          .mp-content { padding: 20px 16px; }
          .mp-title { font-size: 24px; gap: 8px; }
          .mp-title-badge { font-size: 12px; padding: 1px 8px; }
          .mp-subtitle { font-size: 13px; }
          .mp-toolbar { flex-direction: column; align-items: stretch; gap: 10px; margin-bottom: 20px; }
          .mp-search { max-width: 100%; }
          .mp-sort-btn { margin-left: 0; justify-content: center; }
          .mp-grid { grid-template-columns: 1fr; gap: 12px; }
          .mp-card { padding: 16px; }
          .mp-card:hover { transform: none; }
          .mp-card-name { font-size: 14px; }
          .mp-card-desc { font-size: 12px; min-height: 36px; margin-bottom: 10px; }
          .mp-card-tag { font-size: 11px; padding: 2px 6px; }
          .mp-empty { padding: 40px 16px; }
          .mp-empty-icon { font-size: 36px; }
        }

        /* 平板端 */
        @media (min-width: 768px) and (max-width: 1024px) {
          .mp-sidebar { width: 200px; padding: 16px 12px; }
          .mp-content { padding: 24px 24px; }
          .mp-grid { grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
        }

        /* 抽屉内侧栏样式 */
        .mp-drawer-sidebar .mp-sidebar-title { font-size: 12px; }
        .mp-drawer-sidebar .mp-sidebar-item { padding: 10px 14px; font-size: 15px; }
        .mp-drawer-sidebar .mp-provider-item { padding: 8px 0; font-size: 15px; }
      `}</style>

      <div className="mp-page">
        {/* 顶部导航 */}
        <div className="mp-nav">
          <div className="mp-nav-left">
            <div className="mp-nav-brand" onClick={() => navigate('/')}>
              {siteLogo ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <img src={siteLogo} alt="logo" style={{ width: 28, height: 28, objectFit: 'contain' }} />
                  <span style={{ color: '#fff', fontSize: '18px', fontWeight: 600 }}>
                    {siteName}
                  </span>
                </div>
              ) : (
                <>
                  <ShopOutlined style={{ fontSize: 20, color: '#58a6ff' }} />
                  <span style={{ color: '#fff', fontSize: '18px', fontWeight: 600 }}>{siteName || 'TokensByte'}</span>
                </>
              )}
            </div>
            <div className="mp-nav-links">
              <span className="mp-nav-link active">Models</span>
              <span className="mp-nav-link" onClick={() => navigate('/relay-api')}>API Docs</span>
              <span className="mp-nav-link" onClick={() => navigate('/playground')}>Playground</span>
              <span className="mp-nav-link" onClick={() => navigate('/wallet')}>Pricing</span>
            </div>
          </div>
          <div className="mp-nav-right">
            <Tooltip title="返回控制台">
              <div
                onClick={() => navigate('/')}
                style={{
                  width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#8b949e', cursor: 'pointer', transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = '#f0f6fc'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = '#8b949e'; e.currentTarget.style.background = 'transparent'; }}
              >
                <ArrowLeftOutlined style={{ fontSize: 16 }} />
              </div>
            </Tooltip>
            <Popover
              content={
                <div style={{ width: 300, padding: '12px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ marginTop: 8, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16, width: '100%', padding: '0 8px' }}>
                    <Avatar size={56} style={{ backgroundColor: '#1677ff', color: '#fff', fontSize: 24, flexShrink: 0, cursor: 'pointer' }} onClick={() => navigate('/profile')}>
                      {userInitial}
                    </Avatar>
                    <div style={{ overflow: 'hidden', flex: 1 }}>
                      <div style={{ fontWeight: 500, fontSize: 16, color: '#e5e5e5', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.nickname || user?.username}</div>
                      <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>用户 UID:{(user as any)?.uid || '-'}</div>
                    </div>
                  </div>
                  <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <Button type="default" style={{ height: 48, borderRadius: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.1)', color: '#e5e5e5', fontSize: 15 }} icon={<DashboardOutlined style={{ fontSize: 18 }} />} onClick={() => navigate('/')}>控制台</Button>
                    <Button type="default" style={{ height: 48, borderRadius: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.1)', color: '#e5e5e5', fontSize: 15 }} icon={<WalletOutlined style={{ fontSize: 18 }} />} onClick={() => navigate('/wallet')}>我的钱包</Button>
                    <Button type="default" style={{ height: 48, borderRadius: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.1)', color: '#e5e5e5', fontSize: 15 }} icon={<LogoutOutlined style={{ fontSize: 18 }} />} onClick={() => { logout(); navigate('/login'); }}>退出登录</Button>
                  </div>
                </div>
              }
              trigger="click"
              placement="bottomRight"
              arrow={false}
              overlayInnerStyle={{ padding: 0, borderRadius: 20, background: 'rgba(30, 30, 30, 0.45)', backdropFilter: 'blur(30px) saturate(200%)', WebkitBackdropFilter: 'blur(30px) saturate(200%)', border: '1px solid rgba(255,255,255,0.15)', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.1), 0 24px 48px rgba(0,0,0,0.6)' }}
            >
              <Avatar
                size={32}
                style={{
                  cursor: 'pointer',
                  background: '#1677ff',
                  color: '#fff', fontWeight: 600, fontSize: 14,
                  border: '2px solid rgba(255,255,255,0.1)',
                }}
              >
                {userInitial}
              </Avatar>
            </Popover>
          </div>
        </div>

        {/* 移动端浮动筛选按钮 */}
        <button className="mp-filter-fab" onClick={() => setSidebarVisible(true)}>
          <FilterOutlined />
          {activeFilters > 0 && <span className="mp-filter-badge">{activeFilters}</span>}
        </button>

        {/* 移动端侧栏抽屉 */}
        {isMobile && (
          <Drawer
            open={sidebarVisible}
            onClose={() => setSidebarVisible(false)}
            placement="bottom"
            height="70vh"
            styles={{ header: { background: '#161b22', borderBottom: '1px solid #21262d', color: '#f0f6fc' }, body: { background: '#0d1117', padding: '16px 20px' } }}
            title={<span style={{ color: '#f0f6fc' }}>筛选</span>}
            closeIcon={<CloseOutlined style={{ color: '#8b949e' }} />}
          >
            <div className="mp-drawer-sidebar">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div className="mp-sidebar-title">Modalities</div>
                {activeFilters > 0 && (
                  <button className="mp-clear-btn" onClick={() => { clearFilters(); setSidebarVisible(false); }}>
                    <FilterOutlined /> 清除筛选
                  </button>
                )}
              </div>
              <div className={`mp-sidebar-item ${selectedType === null ? 'active' : ''}`} onClick={() => { setSelectedType(null); setSidebarVisible(false); }}>
                <AppstoreOutlined style={{ fontSize: 16 }} /><span>全部模型</span><span className="mp-sidebar-count">{models.length}</span>
              </div>
              {types.map(t => (
                <div key={t.id} className={`mp-sidebar-item ${selectedType === t.id ? 'active' : ''}`} onClick={() => { setSelectedType(selectedType === t.id ? null : t.id); setSidebarVisible(false); }}>
                  {getTypeIcon(t.name)}<span>{t.name}</span><span className="mp-sidebar-count">{typeCounts[t.id] || 0}</span>
                </div>
              ))}
              <div className="mp-sidebar-divider" />
              <div className="mp-sidebar-title">Providers</div>
              {providers.map(p => (
                <div key={p.id} className="mp-provider-item" onClick={() => handleProviderToggle(p.id)}>
                  <Checkbox checked={selectedProviders.includes(p.id)} style={{ pointerEvents: 'none' }} />
                  <span style={{ flex: 1 }}>{p.name}</span>
                  <span className="mp-sidebar-count">{providerCounts[p.id] || 0}</span>
                </div>
              ))}
            </div>
          </Drawer>
        )}

        {/* 主体 */}
        <div className="mp-body">
          {/* 左侧筛选（桌面端） */}
          <div className="mp-sidebar">
            {/* 类型筛选 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div className="mp-sidebar-title">Modalities</div>
              {activeFilters > 0 && (
                <button className="mp-clear-btn" onClick={clearFilters}>
                  <FilterOutlined /> 清除筛选
                </button>
              )}
            </div>
            <div
              className={`mp-sidebar-item ${selectedType === null ? 'active' : ''}`}
              onClick={() => setSelectedType(null)}
            >
              <AppstoreOutlined style={{ fontSize: 16 }} />
              <span>全部模型</span>
              <span className="mp-sidebar-count">{models.length}</span>
            </div>
            {types.map(t => (
              <div
                key={t.id}
                className={`mp-sidebar-item ${selectedType === t.id ? 'active' : ''}`}
                onClick={() => setSelectedType(selectedType === t.id ? null : t.id)}
              >
                {getTypeIcon(t.name)}
                <span>{t.name}</span>
                <span className="mp-sidebar-count">{typeCounts[t.id] || 0}</span>
              </div>
            ))}

            <div className="mp-sidebar-divider" />

            {/* 供应商筛选 */}
            <div className="mp-sidebar-title">Providers</div>
            {providers.map(p => (
              <div key={p.id} className="mp-provider-item" onClick={() => handleProviderToggle(p.id)}>
                <Checkbox
                  checked={selectedProviders.includes(p.id)}
                  style={{ pointerEvents: 'none' }}
                />
                <span style={{ flex: 1 }}>{p.name}</span>
                <span className="mp-sidebar-count">{providerCounts[p.id] || 0}</span>
              </div>
            ))}
          </div>

          {/* 主内容区 */}
          <div className="mp-content">
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
                <Spin size="large" />
              </div>
            ) : (
              <>
                {/* 标题 */}
                <div className="mp-header">
                  <div className="mp-title">
                    Models
                    <span className="mp-title-badge">{filteredModels.length}</span>
                  </div>
                  <div className="mp-subtitle">
                    发现并集成强大的基础模型。按模态、供应商筛选，找到最适合你应用的模型。
                  </div>
                </div>

                {/* 搜索 + 排序工具栏 */}
                <div className="mp-toolbar">
                  <div className="mp-search">
                    <Input
                      prefix={<SearchOutlined style={{ color: '#484f58', fontSize: 16 }} />}
                      placeholder="Search within models..."
                      value={searchKeyword}
                      onChange={e => setSearchKeyword(e.target.value)}
                      allowClear
                    />
                  </div>
                  <Dropdown menu={{
                    items: [
                      { key: 'popular', label: '按热度', onClick: () => setSortBy('popular') },
                      { key: 'name', label: '按名称', onClick: () => setSortBy('name') },
                      { key: 'newest', label: '按最新', onClick: () => setSortBy('newest') },
                    ]
                  }} placement="bottomRight">
                    <div className="mp-sort-btn">
                      <SortAscendingOutlined />
                      Sort: {sortBy === 'popular' ? 'Popular' : sortBy === 'name' ? 'Name' : 'Newest'}
                    </div>
                  </Dropdown>
                </div>

                {/* 模型卡片网格 */}
                {filteredModels.length > 0 ? (
                  <div className="mp-grid">
                    {filteredModels.map(model => (
                      <div
                        key={model.id}
                        className="mp-card"
                        onMouseEnter={() => setHoveredModelId(model.id)}
                        onMouseLeave={() => setHoveredModelId(null)}
                      >
                        <div className="mp-card-header">
                          <div
                            className="mp-card-icon"
                            style={{
                              background: hoveredModelId === model.id
                                ? 'rgba(88,166,255,0.15)'
                                : 'rgba(88,166,255,0.08)',
                              color: '#58a6ff',
                              transition: 'all 0.2s',
                            }}
                          >
                            {getTypeIcon(model.type_name)}
                          </div>
                          <div className="mp-card-title-area">
                            <div className="mp-card-provider">{model.provider_name}</div>
                            <div className="mp-card-name">{model.name}</div>
                          </div>
                        </div>

                        <div className="mp-card-desc">
                          {model.description || `${model.provider_name} 提供的 ${model.type_name || ''}模型，模型标识：${model.model_id}`}
                        </div>

                        <div className="mp-card-meta">
                          {model.type_name && (
                            <span className="mp-card-tag type">
                              {getTypeIcon(model.type_name)}
                              {model.type_name}
                            </span>
                          )}
                          {model.billing && (
                            <>
                              <span className="mp-card-dot" />
                              <span className="mp-card-tag billing">
                                {getBillingLabel(model.billing)}
                              </span>
                            </>
                          )}
                          <span className="mp-card-dot" />
                          <span className="mp-card-tag model-id">{model.model_id}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mp-empty">
                    <ShopOutlined className="mp-empty-icon" />
                    <div className="mp-empty-text">
                      {searchKeyword || selectedType !== null || selectedProviders.length > 0
                        ? '没有找到匹配的模型'
                        : '暂无模型'}
                    </div>
                    <div className="mp-empty-hint">
                      {searchKeyword || selectedType !== null || selectedProviders.length > 0
                        ? '尝试调整筛选条件或搜索关键词'
                        : '管理员尚未在模型广场中启用任何模型'}
                    </div>
                    {(searchKeyword || selectedType !== null || selectedProviders.length > 0) && (
                      <button
                        className="mp-clear-btn"
                        onClick={clearFilters}
                        style={{ marginTop: 16, fontSize: 14 }}
                      >
                        <FilterOutlined /> 清除所有筛选
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </ConfigProvider>
  );
};

export default ModelMarketplace;
