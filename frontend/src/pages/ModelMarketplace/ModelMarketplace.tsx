/**
 * 模型广场 - 用户端独立全屏页面
 * 参考 NeuralGrid 设计风格：深色主题 + 左侧筛选 + 模型卡片网格
 */
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ConfigProvider, theme, Input, Checkbox, Avatar, Dropdown, Spin, Empty, Tooltip, Popover, Button, Layout, Grid, Space, Result, Descriptions, Tag, Breadcrumb } from 'antd';
import {
  SearchOutlined, ArrowLeftOutlined, AppstoreOutlined,
  MessageOutlined, PictureOutlined, VideoCameraOutlined,
  AudioOutlined, CodeOutlined, ApiOutlined, ShopOutlined,
  FilterOutlined, SortAscendingOutlined, MenuOutlined, CloseOutlined,
  DashboardOutlined, WalletOutlined, LogoutOutlined, MenuUnfoldOutlined, MenuFoldOutlined,
  LockOutlined, InfoCircleOutlined, UnorderedListOutlined
} from '@ant-design/icons';

const { Header, Sider, Content } = Layout;
const { useBreakpoint } = Grid;
import request from '../../utils/request';
import { useThemeStore } from '../../store/theme';
import useSettingsStore from '../../store/settings';
import useAuthStore from '../../store/auth';
import UserAvatarMenu from '../../components/UserAvatarMenu';
import { SunOutlined, MoonOutlined } from '@ant-design/icons';

interface MarketplaceModel {
  id: number;
  mid: string;
  name: string;
  model_id: string;
  provider_id: number;
  provider_name: string;
  provider_logo?: string;
  type_id: number;
  type_name: string;
  type_logo?: string;
  logo?: string;
  sort_order: number;
  description: string;
  billing: any;
  created_at: string;
}

interface FilterItem {
  id: number;
  name: string;
  logo?: string;
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
    case 'tokens': return '按Token计费';
    case 'requests': return '固定费用';
    case 'duration': return '按时长计费';
    case 'tiered': return '阶梯计费';
    default: return billing.billing_type;
  }
};

const ModelMarketplace: React.FC = () => {
  const { themeMode, toggleTheme } = useThemeStore();
  const { settings } = useSettingsStore();
  const enableThemeToggle = settings?.site?.enable_theme_toggle !== false;
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [siteName, setSiteName] = useState<string>('TokensByte');
  const [currencySymbol, setCurrencySymbol] = useState<string>('¥');
  const [siteLogo, setSiteLogo] = useState<string>('');
  const [agreement, setAgreement] = useState<any>(null);

  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [models, setModels] = useState<MarketplaceModel[]>([]);
  const [providers, setProviders] = useState<FilterItem[]>([]);
  const [types, setTypes] = useState<FilterItem[]>([]);
  const [total, setTotal] = useState(0);

  // 筛选状态
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedType, setSelectedType] = useState<number | null>(null);
  const [selectedProviders, setSelectedProviders] = useState<number[]>([]);
  const [sortBy, setSortBy] = useState<'popular' | 'name' | 'newest'>('popular');
  const [selectedModel, setSelectedModel] = useState<MarketplaceModel | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [collapsed, setCollapsed] = useState(false);
  const screens = useBreakpoint();

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
      if (settingsRes?.currency?.currency_symbol) {
        setCurrencySymbol(settingsRes.currency.currency_symbol);
      }
      if (settingsRes?.agreement) {
        setAgreement(settingsRes.agreement);
      }

      const res = await (request.get('/marketplace/public') as Promise<any>);
      if (res) {
        setModels(res.models || []);
        setProviders(res.providers || []);
        setTypes(res.types || []);
        setTotal(res.total || 0);
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
    bg: isLight ? '#f0f4f9' : '#000',
    siderBg: isLight ? '#ffffff' : '#141414',
    cardBg: isLight ? '#ffffff' : '#141414',
    cardBorder: isLight ? '#e5e7eb' : '#303030',
    cardHoverBg: isLight ? '#f9fafb' : '#1f1f1f',
    panelBg: isLight ? '#f3f4f6' : '#1f1f1f',
    text1: isLight ? '#1f2937' : 'rgba(255,255,255,0.88)',
    text2: isLight ? '#4b5563' : 'rgba(255,255,255,0.65)',
    text3: isLight ? '#9ca3af' : 'rgba(255,255,255,0.45)',
    textMuted: isLight ? '#d1d5db' : 'rgba(255,255,255,0.25)',
    searchBg: isLight ? '#f3f4f6' : '#1f1f1f',
    searchBorder: isLight ? '#d1d5db' : '#303030',
    focusBorder: isLight ? '#1677ff' : '#1677ff',
    hoverBg: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.08)',
    sidebarText: isLight ? '#4b5563' : 'rgba(255,255,255,0.65)',
    scrollThumb: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)',
    sortBorder: isLight ? '#d1d5db' : '#303030',
    link: isLight ? '#1677ff' : '#1677ff',
    codeBg: isLight ? '#f3f4f6' : '#1f1f1f',
    codeText: isLight ? '#374151' : 'rgba(255,255,255,0.65)',
    detailBg: isLight ? '#ffffff' : '#141414',
    shadow: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(0,0,0,0.3)',
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        .mp-search .ant-input-affix-wrapper { background: ${c.searchBg} !important; border: 1px solid ${c.searchBorder} !important; border-radius: 8px !important; height: 40px; font-size: 14px; }
        .mp-search .ant-input-affix-wrapper:hover, .mp-search .ant-input-affix-wrapper:focus-within { border-color: ${c.focusBorder} !important; }
        .mp-search .ant-input { background: transparent !important; color: ${c.text2} !important; }
        .mp-card { border: 1px solid ${c.cardBorder}; border-radius: 10px; padding: 20px; cursor: pointer; transition: all 0.2s; background: ${c.cardBg}; position: relative; }
        .mp-card:hover { border-color: ${c.sortBorder}; background: ${c.cardHoverBg}; transform: translateY(-1px); box-shadow: 0 4px 12px ${c.shadow}; }
        .mp-card-icon { width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; }
        .mp-sidebar-content { padding: 24px 20px; overflow-y: auto; height: 100%; }
        .mp-sidebar-content::-webkit-scrollbar { width: 4px; }
        .mp-sidebar-content::-webkit-scrollbar-thumb { background: ${c.scrollThumb}; border-radius: 4px; }
        .mp-sidebar-title { font-size: 11px; font-weight: 600; color: ${c.text3}; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; }
        .mp-sidebar-item { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 8px; cursor: pointer; transition: all 0.12s; font-size: 14px; color: ${c.sidebarText}; margin-bottom: 2px; }
        .mp-sidebar-item:hover { background: ${c.hoverBg}; color: ${c.text1}; }
        .mp-sidebar-item.active { background: #1677ff !important; color: #fff !important; }
        .mp-sidebar-item.active .mp-sidebar-count { color: rgba(255,255,255,0.85); }
        .mp-sidebar-count { margin-left: auto; font-size: 12px; color: ${c.textMuted}; font-weight: 500; }
        .mp-sidebar-divider { height: 1px; background: ${c.cardBorder}; margin: 20px 0; }
      `}</style>
      
      <Layout style={{ height: '100vh', overflow: 'hidden' }}>
        <Sider
          trigger={null}
          collapsible
          collapsed={collapsed}
          theme={isLight ? undefined : 'dark'}
          width={200}
          breakpoint="lg"
          collapsedWidth={screens.xs ? 0 : 80}
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
            }} onClick={() => navigate('/')}>
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
                  <ShopOutlined style={{ fontSize: 20, color: '#1677ff', marginRight: collapsed && !screens.xs ? 0 : 10 }} />
                  {!(collapsed && !screens.xs) && <span style={{ color: c.text1, fontSize: '18px', fontWeight: 600 }}>{siteName || 'TokensByte'}</span>}
                </>
              )}
            </div>
            
            {/* Sidebar Content (Filters) */}
            {/* Sidebar Content (Filters) */}
            <div className="mp-sidebar-content" style={{ padding: collapsed && !screens.xs ? '12px 0' : '24px 20px', transition: 'all 0.2s' }}>
              {!(collapsed && !screens.xs) && <div className="mp-sidebar-title" style={{ padding: '0 12px' }}>浏览</div>}
              <Tooltip title={collapsed && !screens.xs ? "全部模型" : ""} placement="right">
                <div
                  className={`mp-sidebar-item ${selectedType === null ? 'active' : ''}`}
                  onClick={() => { setSelectedType(null); setSelectedModel(null); }}
                  style={{ justifyContent: collapsed && !screens.xs ? 'center' : 'flex-start', padding: collapsed && !screens.xs ? '12px 0' : '8px 12px' }}
                >
                  <AppstoreOutlined style={{ fontSize: 18 }} />
                  {!(collapsed && !screens.xs) && (
                    <>
                      全部模型
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
                onClick={() => setCollapsed(!collapsed)}
                style={{ fontSize: '16px', width: screens.xs ? 48 : 56, height: screens.xs ? 48 : 56, color: c.text1 }}
              />
              {screens.xs && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 8 }} onClick={() => navigate('/')}>
                  {siteLogo && <img src={siteLogo} alt="logo" style={{ width: 24, height: 24, objectFit: 'contain' }} />}
                  <span style={{ color: c.text1, fontSize: '16px', fontWeight: 600 }}>{siteName}</span>
                </div>
              )}
            </div>
            
            <Space size={screens.xs ? "small" : "middle"}>
              {enableThemeToggle && (
                <Tooltip title={isLight ? '切换暗色模式' : '切换亮色模式'} placement="bottom">
                  <Button type="text" shape="circle" onClick={toggleTheme}
                    icon={isLight ? <MoonOutlined style={{ fontSize: 18 }} /> : <SunOutlined style={{ fontSize: 18 }} />}
                    style={{ color: c.text1, width: 42, height: 42 }}
                  />
                </Tooltip>
              )}
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
                  title={<span style={{ color: c.text1 }}>无权访问模型广场</span>}
                  subTitle={<span style={{ color: c.text3 }}>您当前的用户等级暂无权限浏览模型广场，请联系管理员或升级等级。</span>}
                  extra={
                    <Button type="primary" onClick={() => navigate('/')}>返回控制面板</Button>
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
                    style={{ color: c.text3, fontSize: 16 }}
                  >
                    返回列表
                  </Button>
                  <Breadcrumb
                    items={[
                      { title: <span style={{ color: c.text3, cursor: 'pointer' }} onClick={() => setSelectedModel(null)}>模型广场</span> },
                      { title: <span style={{ color: c.text1 }}>{selectedModel.name}</span> },
                    ]}
                  />
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 32, alignItems: 'flex-start' }}>
                  {/* 左侧详情 */}
                  <div style={{ flex: '1 1 500px', background: isLight ? '#fff' : 'rgba(255,255,255,0.02)', border: `1px solid ${c.cardBorder}`, borderRadius: 16, padding: screens.xs ? '20px' : '40px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 32 }}>
                      <div style={{ width: 64, height: 64, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, overflow: 'hidden' }}>
                        {selectedModel.logo ? (
                          <img src={`/assets/icons/lobe/${selectedModel.logo}.svg`} alt="" style={{ width: 48, height: 48, objectFit: 'contain' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        ) : selectedModel.provider_logo ? (
                          <img src={`/assets/icons/lobe/${selectedModel.provider_logo}.svg`} alt="" style={{ width: 48, height: 48, objectFit: 'contain' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        ) : (
                          <span style={{ color: '#1677ff' }}>{getTypeIcon(selectedModel.type_name)}</span>
                        )}
                      </div>
                      <div>
                        <h1 style={{ margin: 0, fontSize: screens.xs ? 24 : 32, fontWeight: 700, color: c.text1 }}>{selectedModel.name}</h1>
                        <div style={{ fontSize: 15, color: c.text3, marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                          {selectedModel.provider_logo && (
                            <img src={`/assets/icons/lobe/${selectedModel.provider_logo}.svg`} alt="" style={{ width: 16, height: 16, objectFit: 'contain' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                          )}
                          {selectedModel.provider_name}
                          <span style={{ width: 4, height: 4, borderRadius: '50%', background: c.textMuted }} />
                          <code style={{ background: c.codeBg, padding: '2px 8px', borderRadius: 4, fontSize: 13, color: c.codeText }}>{selectedModel.model_id}</code>
                        </div>
                      </div>
                    </div>

                    <div style={{ marginBottom: 40 }}>
                      <h3 style={{ fontSize: 16, fontWeight: 600, color: c.text1, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <InfoCircleOutlined style={{ color: '#1677ff' }} /> 模型简介
                      </h3>
                      <div style={{ fontSize: 16, color: c.text2, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                        {selectedModel.description || '该模型暂无详细描述信息。作为行业领先的 AI 模型，它能够提供高质量的生成结果。'}
                      </div>
                    </div>

                    <Descriptions
                      column={screens.xs ? 1 : 2}
                      bordered
                      size="middle"
                      labelStyle={{ background: isLight ? '#f9fafb' : 'rgba(255,255,255,0.02)', color: c.text3, width: 120 }}
                      contentStyle={{ background: 'transparent', color: c.text1 }}
                      style={{ border: `1px solid ${c.cardBorder}`, borderRadius: 8, overflow: 'hidden' }}
                    >
                      <Descriptions.Item label="能力分类">
                        <Tag color="blue" bordered={false} style={{ borderRadius: 6, background: 'rgba(22, 119, 255, 0.15)', color: '#1677ff' }}>{selectedModel.type_name}</Tag>
                      </Descriptions.Item>
                      <Descriptions.Item label="运营商">
                        {selectedModel.provider_name}
                      </Descriptions.Item>
                      <Descriptions.Item label="计费标准">
                        {selectedModel.billing ? (
                          <Tag color="cyan" bordered={false} style={{ borderRadius: 6, background: 'rgba(54, 207, 201, 0.15)', color: '#36cfc9' }}>{getBillingLabel(selectedModel.billing)}</Tag>
                        ) : (
                          <span style={{ color: c.textMuted }}>暂未定价</span>
                        )}
                      </Descriptions.Item>
                      <Descriptions.Item label="更新时间">
                        {selectedModel.created_at ? new Date(selectedModel.created_at).toLocaleDateString('zh-CN') : '-'}
                      </Descriptions.Item>
                    </Descriptions>


                  </div>

                  {/* 右侧价格卡片 */}
                  <div style={{ width: screens.xs ? '100%' : 340, flexShrink: 0 }}>
                    
                    
                    <div style={{ background: c.detailBg, border: `1px solid ${c.cardBorder}`, borderRadius: 16, padding: '20px' }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: c.text1, marginBottom: 12 }}>关于该模型</div>
                      <div style={{ fontSize: 13, color: c.text3, lineHeight: 1.6 }}>
                        该模型目前已在全平台上线。您可以直接在 API 调用或控制面板中使用。如果您有大规模调用需求，请联系客服获取专属优惠。
                      </div>
                    </div>
                    
                    {selectedModel.billing && selectedModel.billing.billing_rule && (
                      <div style={{ background: c.detailBg, border: `1px solid ${c.cardBorder}`, borderRadius: 16, padding: '20px', marginTop: 24 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: c.text1, marginBottom: 12 }}>计费规则说明</div>
                        <div 
                          className="quill-content"
                          dangerouslySetInnerHTML={{ __html: selectedModel.billing.billing_rule }}
                          style={{ fontSize: 13, color: c.text3, lineHeight: 1.6, overflowWrap: 'break-word', wordBreak: 'break-all' }} 
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ background: c.cardBg, border: `1px solid ${c.cardBorder}`, borderRadius: 16, padding: '24px', marginTop: 40 }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: c.text1, marginBottom: 16 }}>详细计费规则</div>
                  
                  {selectedModel.billing ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {/* 计费类型说明 */}
                      <div style={{ padding: '12px 16px', background: c.panelBg, borderRadius: 12 }}>
                        <div style={{ fontSize: 13, color: c.text3, marginBottom: 4 }}>计费模式</div>
                        <div style={{ fontSize: 15, color: c.text1, fontWeight: 500 }}>
                          {getBillingLabel(selectedModel.billing)}
                          {selectedModel.billing.name && ` - ${selectedModel.billing.name}`}
                        </div>
                      </div>

                      {/* 基础费率 */}
                      {selectedModel.billing.billing_type === 'tokens' && (
                        <div style={{ padding: '16px', background: c.panelBg, borderRadius: 12 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <span style={{ color: c.text2, fontSize: 14 }}>输入 (Prompt)</span>
                            <span style={{ color: c.text1, fontSize: 18, fontWeight: 600 }}>{currencySymbol}{selectedModel.billing.prompt_rate ?? '-'} <small style={{ fontSize: 12, fontWeight: 400, opacity: 0.8 }}>/ 1M tokens</small></span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: c.text2, fontSize: 14 }}>输出 (Completion)</span>
                            <span style={{ color: c.text1, fontSize: 18, fontWeight: 600 }}>{currencySymbol}{selectedModel.billing.completion_rate ?? '-'} <small style={{ fontSize: 12, fontWeight: 400, opacity: 0.8 }}>/ 1M tokens</small></span>
                          </div>
                        </div>
                      )}

                      {selectedModel.billing.billing_type === 'requests' && (
                        <div style={{ padding: '16px', background: c.panelBg, borderRadius: 12 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: c.text2, fontSize: 14 }}>单次调用费用</span>
                            <span style={{ color: c.text1, fontSize: 18, fontWeight: 600 }}>{currencySymbol}{selectedModel.billing.fixed_rate ?? '-'} <small style={{ fontSize: 12, fontWeight: 400, opacity: 0.8 }}>/ 次</small></span>
                          </div>
                        </div>
                      )}

                      {selectedModel.billing.billing_type === 'duration' && (
                        <div style={{ padding: '16px', background: c.panelBg, borderRadius: 12 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: c.text2, fontSize: 14 }}>按时长计费</span>
                            <span style={{ color: c.text1, fontSize: 18, fontWeight: 600 }}>{currencySymbol}{selectedModel.billing.duration_rate ?? '-'} <small style={{ fontSize: 12, fontWeight: 400, opacity: 0.8 }}>/ 秒</small></span>
                          </div>
                        </div>
                      )}

                      {/* 阶梯计费 */}
                      {selectedModel.billing.pricing_tiers && (() => {
                        try {
                          const tiers = JSON.parse(selectedModel.billing.pricing_tiers);
                          if (Array.isArray(tiers) && tiers.length > 0) {
                            return (
                              <div style={{ padding: '16px', background: c.panelBg, borderRadius: 12 }}>
                                <div style={{ fontSize: 13, color: c.text3, marginBottom: 12 }}>上下文阶梯费率</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                  {tiers.map((t: any, i: number) => (
                                    <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingBottom: i < tiers.length - 1 ? 10 : 0, borderBottom: i < tiers.length - 1 ? `1px dashed ${c.sortBorder}` : 'none' }}>
                                      <span style={{ color: c.text1, fontSize: 13, fontWeight: 500 }}>&le; {t.max_prompt_tokens >= 1000 ? t.max_prompt_tokens / 1000 + 'k' : t.max_prompt_tokens} Tokens</span>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: c.text2 }}>
                                        <span>输入: {currencySymbol}{t.prompt_rate} <small>/ 1M</small></span>
                                        <span>输出: {currencySymbol}{t.completion_rate} <small>/ 1M</small></span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          }
                        } catch(e) {}
                        return null;
                      })()}
                    </div>
                  ) : (
                    <div style={{ color: c.text3, fontSize: 15 }}>暂未配置计费规则，该模型当前可能为免费使用或不可用。</div>
                  )}
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
                            width: 36, height: 36, borderRadius: 8,
                            border: `1px solid ${viewMode === 'list' ? '#1677ff' : c.sortBorder}`,
                            background: viewMode === 'list' ? (isLight ? '#eff6ff' : 'rgba(22,119,255,0.15)') : 'transparent',
                            color: viewMode === 'list' ? '#1677ff' : c.text3,
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
                            width: 36, height: 36, borderRadius: 8,
                            border: `1px solid ${viewMode === 'grid' ? '#1677ff' : c.sortBorder}`,
                            background: viewMode === 'grid' ? (isLight ? '#eff6ff' : 'rgba(22,119,255,0.15)') : 'transparent',
                            color: viewMode === 'grid' ? '#1677ff' : c.text3,
                            cursor: 'pointer', fontSize: 16, transition: 'all 0.2s',
                          }}
                        >
                          <AppstoreOutlined />
                        </button>
                      </Tooltip>
                    </div>
                    <Dropdown
                      menu={{
                        items: [
                          { key: 'popular', label: '最受欢迎' },
                          { key: 'newest', label: '最新上架' },
                          { key: 'name', label: '名称 A-Z' },
                        ],
                        onClick: ({ key }) => setSortBy(key as any)
                      }}
                      placement="bottomRight"
                    >
                      <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: `1px solid ${c.sortBorder}`, background: 'transparent', color: c.text3, fontSize: 13, cursor: 'pointer' }}>
                        <SortAscendingOutlined />
                        {sortBy === 'popular' ? '最受欢迎' : sortBy === 'newest' ? '最新上架' : '名称排序'}
                      </button>
                    </Dropdown>
                  </div>

                  {/* 供应商横向筛选标签 */}
                  {providers.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, color: c.text3, fontWeight: 500, marginRight: 4, whiteSpace: 'nowrap' }}>供应商</span>
                      {providers.map(p => {
                        const isActive = selectedProviders.includes(p.id);
                        return (
                          <button
                            key={p.id}
                            onClick={() => handleProviderToggle(p.id)}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 6,
                              padding: '4px 12px', borderRadius: 20, fontSize: 13,
                              border: `1px solid ${isActive ? '#1677ff' : c.sortBorder}`,
                              background: isActive ? (isLight ? '#eff6ff' : 'rgba(22,119,255,0.12)') : 'transparent',
                              color: isActive ? '#1677ff' : c.text2,
                              cursor: 'pointer', transition: 'all 0.2s', fontWeight: isActive ? 500 : 400,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {p.logo && (
                              <img src={`/assets/icons/lobe/${p.logo}.svg`} alt="" style={{ width: 14, height: 14, objectFit: 'contain', filter: isLight ? 'none' : 'brightness(0.9)' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
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
                    <div className="mp-grid" style={{
                      display: viewMode === 'grid' ? 'grid' : 'flex',
                      ...(viewMode === 'grid'
                        ? { gridTemplateColumns: screens.xs ? '1fr' : 'repeat(4, 1fr)', gap: 16 }
                        : { flexDirection: 'column' as const, gap: 12 }
                      ),
                    }}>
                      {filteredModels.map(model => (
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
                            borderRadius: viewMode === 'grid' ? 12 : 8,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: viewMode === 'grid' ? 'flex-start' : 'center', gap: 12, marginBottom: 8 }}>
                            <div className="mp-card-icon" style={{ 
                              overflow: 'hidden',
                              width: viewMode === 'grid' ? 32 : 20,
                              height: viewMode === 'grid' ? 32 : 20,
                              borderRadius: viewMode === 'grid' ? 8 : 4,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0
                            }}>
                              {model.logo ? (
                                <img src={`/assets/icons/lobe/${model.logo}.svg`} alt="" style={{ width: viewMode === 'grid' ? 28 : 14, height: viewMode === 'grid' ? 28 : 14, objectFit: 'contain' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                              ) : model.provider_logo ? (
                                <img src={`/assets/icons/lobe/${model.provider_logo}.svg`} alt="" style={{ width: viewMode === 'grid' ? 28 : 14, height: viewMode === 'grid' ? 28 : 14, objectFit: 'contain' }} onError={e => { (e.target as HTMLImageElement).replaceWith(document.createTextNode('')); }} />
                              ) : (
                                <span style={{ fontSize: viewMode === 'grid' ? 20 : 12 }}>{getTypeIcon(model.type_name)}</span>
                              )}
                            </div>
                            
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                              <h3 style={{ 
                                margin: 0, 
                                fontSize: viewMode === 'grid' ? 14 : 16, 
                                fontWeight: 500, 
                                color: c.text1, 
                                overflow: 'hidden', 
                                textOverflow: 'ellipsis', 
                                whiteSpace: viewMode === 'grid' ? 'normal' : 'nowrap',
                                fontFamily: "'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'Liberation Mono', 'Courier New', monospace",
                                letterSpacing: '-0.3px',
                                lineHeight: 1.4,
                                ...(viewMode === 'grid' ? { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const } : {}),
                              }}>
                                {model.provider_name}/{model.model_id}
                              </h3>
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

                          <div style={{ 
                            fontSize: viewMode === 'grid' ? 12 : 13, 
                            color: c.text3, 
                            display: 'flex', 
                            alignItems: 'center', 
                            flexWrap: 'wrap',
                            gap: viewMode === 'grid' ? '0 6px' : '0 8px',
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
                                  {model.billing.billing_type === 'tokens' ? '按Token计费' :
                                   model.billing.billing_type === 'requests' ? '按次计费' :
                                   model.billing.billing_type === 'duration' ? '按时长计费' : '按Token计费'}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
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
