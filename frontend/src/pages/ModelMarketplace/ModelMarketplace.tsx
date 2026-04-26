/**
 * 模型广场 - 用户端独立全屏页面
 * 参考 NeuralGrid 设计风格：深色主题 + 左侧筛选 + 模型卡片网格
 */
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ConfigProvider, theme, Input, Checkbox, Avatar, Dropdown, Spin, Empty, Tooltip, Popover, Button, Layout, Grid, Space, Badge, Result } from 'antd';
import {
  SearchOutlined, ArrowLeftOutlined, AppstoreOutlined,
  MessageOutlined, PictureOutlined, VideoCameraOutlined,
  AudioOutlined, CodeOutlined, ApiOutlined, ShopOutlined,
  FilterOutlined, SortAscendingOutlined, MenuOutlined, CloseOutlined,
  DashboardOutlined, WalletOutlined, LogoutOutlined, MenuUnfoldOutlined, MenuFoldOutlined,
  GlobalOutlined, BellOutlined, LockOutlined
} from '@ant-design/icons';

const { Header, Sider, Content } = Layout;
const { useBreakpoint } = Grid;
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
  const [hoveredModelId, setHoveredModelId] = useState<number | null>(null);
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


  const profileContent = (
    <div style={{ minWidth: 260, padding: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Avatar size={48} style={{ backgroundColor: '#1677ff', cursor: 'pointer' }} onClick={() => navigate('/profile')}>
          {userInitial}
        </Avatar>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user?.username || '用户'}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
            UID: {user?.id}
          </div>
        </div>
      </div>
      <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '0 -16px 12px' }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Button type="text" block style={{ textAlign: 'left', color: 'rgba(255,255,255,0.85)', padding: '6px 12px', height: 'auto', display: 'flex', alignItems: 'center', gap: 8, borderRadius: 8 }} onClick={() => navigate('/')}>
          <DashboardOutlined /> 控制台
        </Button>
        <Button type="text" block style={{ textAlign: 'left', color: 'rgba(255,255,255,0.85)', padding: '6px 12px', height: 'auto', display: 'flex', alignItems: 'center', gap: 8, borderRadius: 8 }} onClick={() => navigate('/wallet')}>
          <WalletOutlined /> 我的钱包
        </Button>
        <Button type="text" block style={{ textAlign: 'left', color: '#ff4d4f', padding: '6px 12px', height: 'auto', display: 'flex', alignItems: 'center', gap: 8, borderRadius: 8, marginTop: 4 }} onClick={logout} className="logout-btn">
          <LogoutOutlined /> 退出登录
        </Button>
      </div>
    </div>
  );

  return (
    <ConfigProvider theme={{
      algorithm: theme.darkAlgorithm,
      token: { fontFamily: "'Inter', 'PingFang SC', -apple-system, sans-serif", colorPrimary: '#58a6ff' }
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        .mp-search .ant-input-affix-wrapper { background: #0d1117 !important; border: 1px solid #30363d !important; border-radius: 8px !important; height: 40px; font-size: 14px; }
        .mp-search .ant-input-affix-wrapper:hover, .mp-search .ant-input-affix-wrapper:focus-within { border-color: #58a6ff !important; }
        .mp-search .ant-input { background: transparent !important; color: #c9d1d9 !important; }
        
        .mp-card { border: 1px solid #21262d; border-radius: 10px; padding: 20px; cursor: pointer; transition: all 0.2s; background: #0d1117; position: relative; }
        .mp-card:hover { border-color: #30363d; background: #161b22; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
        .mp-card-icon { width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; }
        
        /* Sidebar styles */
        .mp-sidebar-content { padding: 24px 20px; overflow-y: auto; height: 100%; }
        .mp-sidebar-content::-webkit-scrollbar { width: 4px; }
        .mp-sidebar-content::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }
        .mp-sidebar-title { font-size: 11px; font-weight: 600; color: #8b949e; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; }
        .mp-sidebar-item { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 8px; cursor: pointer; transition: all 0.12s; font-size: 14px; color: #8b949e; margin-bottom: 2px; }
        .mp-sidebar-item:hover { background: rgba(255,255,255,0.04); color: #c9d1d9; }
        .mp-sidebar-item.active { background: rgba(88,166,255,0.1); color: #58a6ff; }
        .mp-sidebar-count { margin-left: auto; font-size: 12px; color: #484f58; font-weight: 500; }
        .mp-sidebar-divider { height: 1px; background: #21262d; margin: 20px 0; }
        .mp-provider-item { display: flex; align-items: center; gap: 8px; padding: 6px 0; cursor: pointer; font-size: 14px; color: #8b949e; transition: color 0.12s; }
        .mp-provider-item:hover { color: #c9d1d9; }
        
        .mp-nav-link { padding: 6px 12px; border-radius: 8px; font-size: 14px; font-weight: 500; color: #8b949e; cursor: pointer; transition: all 0.15s; text-decoration: none; white-space: nowrap; }
        .mp-nav-link:hover { color: #f0f6fc; background: rgba(255,255,255,0.04); }
        .mp-nav-link.active { color: #f0f6fc; position: relative; }
        .mp-nav-link.active::after { content: ''; position: absolute; bottom: -14px; left: 12px; right: 12px; height: 2px; background: #58a6ff; border-radius: 2px; }
      `}</style>
      
      <Layout style={{ height: '100vh', overflow: 'hidden' }}>
        <Sider
          trigger={null}
          collapsible
          collapsed={collapsed}
          theme="dark"
          width={200}
          breakpoint="lg"
          collapsedWidth={screens.xs ? 0 : 80}
          onBreakpoint={(broken) => {
            if (broken) setCollapsed(true);
          }}
          style={{
            boxShadow: '2px 0 8px 0 rgba(29,35,41,.05)',
            zIndex: 10,
            position: screens.xs ? 'fixed' : 'relative',
            height: '100%',
            left: 0,
            top: 0,
            bottom: 0,
            overflow: 'hidden',
          }}
          className="custom-sider"
        >
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Logo Area */}
            <div style={{ 
              height: screens.xs ? 48 : 56, 
              display: 'flex', alignItems: 'center', justifyContent: 'center', 
              padding: '16px 0', borderBottom: '1px solid rgba(255,255,255,0.05)',
              cursor: 'pointer'
            }} onClick={() => navigate('/')}>
              {siteLogo ? (
                (collapsed && !screens.xs) ? (
                  <img src={siteLogo} alt="logo" style={{ width: 28, height: 28, objectFit: 'contain' }} />
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <img src={siteLogo} alt="logo" style={{ width: 28, height: 28, objectFit: 'contain' }} />
                    <span style={{ color: '#fff', fontSize: '18px', fontWeight: 600 }}>{siteName}</span>
                  </div>
                )
              ) : (
                <>
                  <ShopOutlined style={{ fontSize: 20, color: '#58a6ff', marginRight: collapsed && !screens.xs ? 0 : 10 }} />
                  {!(collapsed && !screens.xs) && <span style={{ color: '#fff', fontSize: '18px', fontWeight: 600 }}>{siteName || 'TokensByte'}</span>}
                </>
              )}
            </div>
            
            {/* Sidebar Content (Filters) */}
            <div className="mp-sidebar-content" style={{ opacity: (collapsed && !screens.xs) ? 0 : 1, transition: 'opacity 0.2s', visibility: (collapsed && !screens.xs) ? 'hidden' : 'visible' }}>
              <div className="mp-sidebar-title">浏览</div>
              <div
                className={`mp-sidebar-item ${selectedType === null ? 'active' : ''}`}
                onClick={() => setSelectedType(null)}
              >
                <AppstoreOutlined /> 全部模型
                <span className="mp-sidebar-count">{total}</span>
              </div>
              {types.map(t => (
                <div
                  key={t.id}
                  className={`mp-sidebar-item ${selectedType === t.id ? 'active' : ''}`}
                  onClick={() => setSelectedType(t.id)}
                >
                  {getTypeIcon(t.name)} {t.name}
                  <span className="mp-sidebar-count">{typeCounts[t.id] || 0}</span>
                </div>
              ))}

              <div className="mp-sidebar-divider" />

              <div className="mp-sidebar-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                按供应商
                {selectedProviders.length > 0 && (
                  <button className="mp-clear-btn" onClick={() => setSelectedProviders([])}>
                    清除
                  </button>
                )}
              </div>
              {providers.map(p => (
                <div key={p.id} className="mp-provider-item" onClick={() => handleProviderToggle(p.id)}>
                  <Checkbox checked={selectedProviders.includes(p.id)} />
                  <span style={{ flex: 1 }}>{p.name}</span>
                  <span className="mp-sidebar-count">{providerCounts[p.id] || 0}</span>
                </div>
              ))}
            </div>
          </div>
        </Sider>

        <Layout style={{ marginLeft: (screens.xs || collapsed) ? 0 : 0 }}>
          <Header style={{
            padding: 0,
            background: '#141414',
            height: screens.xs ? 48 : 56,
            lineHeight: (screens.xs ? 48 : 56) + 'px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingRight: screens.xs ? 8 : 24,
            boxShadow: '0 1px 4px rgba(0,21,41,.08)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <Button
                type="text"
                icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                onClick={() => setCollapsed(!collapsed)}
                style={{ fontSize: '16px', width: screens.xs ? 48 : 56, height: screens.xs ? 48 : 56, color: '#fff' }}
              />
              {screens.xs && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 8 }} onClick={() => navigate('/')}>
                  {siteLogo && <img src={siteLogo} alt="logo" style={{ width: 24, height: 24, objectFit: 'contain' }} />}
                  <span style={{ color: '#fff', fontSize: '16px', fontWeight: 600 }}>{siteName}</span>
                </div>
              )}
            </div>
            
            <Space size={screens.xs ? "small" : "middle"}>
              <Dropdown menu={{ items: [] }} placement="bottomRight">
                <Button type="text" icon={<GlobalOutlined />} style={{ color: '#fff' }}>
                  {!screens.xs && '中文'}
                </Button>
              </Dropdown>

              <Badge count={0} overflowCount={99} offset={[-4, 4]}>
                <Button type="text" icon={<BellOutlined />} style={{ color: '#fff', fontSize: '18px' }} />
              </Badge>

              <Popover 
                content={profileContent} 
                trigger="click" 
                placement="bottomRight"
                overlayClassName="custom-premium-popover"
                forceRender
                overlayInnerStyle={{ 
                  padding: 0, 
                  borderRadius: 20, 
                  background: 'rgba(30, 30, 30, 0.45)',
                  backdropFilter: 'blur(30px) saturate(200%)',
                  WebkitBackdropFilter: 'blur(30px) saturate(200%)',
                  border: '1px solid rgba(255,255,255,0.15)', 
                  boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.1), 0 24px 48px rgba(0,0,0,0.6)',
                }}
                arrow={false}
              >
                <div style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '4px', borderRadius: 20 }}>
                  <Avatar size={34} style={{ backgroundColor: '#1677ff', color: '#fff', fontSize: 16 }}>
                    {userInitial}
                  </Avatar>
                </div>
              </Popover>
            </Space>
          </Header>
          
          <Content style={{ 
            margin: screens.xs ? '8px' : '12px', 
            padding: screens.xs ? '20px 16px' : '32px 40px',
            minHeight: 280, 
            background: '#000', 
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
                  icon={<LockOutlined style={{ color: '#8b949e' }} />}
                  title={<span style={{ color: '#f0f6fc' }}>无权访问模型广场</span>}
                  subTitle={<span style={{ color: '#8b949e' }}>您当前的用户等级暂无权限浏览模型广场，请联系管理员或升级等级。</span>}
                  extra={
                    <Button type="primary" onClick={() => navigate('/')}>返回控制台</Button>
                  }
                />
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 24 }}>
                  <h1 style={{ fontSize: screens.xs ? 24 : 32, fontWeight: 700, color: '#f0f6fc', display: 'flex', alignItems: 'center', gap: 12, margin: '0 0 8px 0' }}>
                    探索模型
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#8b949e', background: '#21262d', padding: '2px 10px', borderRadius: 12 }}>
                      {total}
                    </span>
                  </h1>
                  <p style={{ fontSize: 15, color: '#8b949e', margin: 0 }}>发现并测试最前沿的 AI 模型，集成到您的应用中</p>
                </div>

                <div className="mp-toolbar" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28, flexWrap: 'wrap' }}>
                  <div className="mp-search" style={{ flex: 1, minWidth: 200, maxWidth: screens.xs ? '100%' : 420 }}>
                    <Input
                      placeholder="搜索模型名称、ID或描述..."
                      prefix={<SearchOutlined style={{ color: '#8b949e', marginRight: 8 }} />}
                      value={searchKeyword}
                      onChange={e => setSearchKeyword(e.target.value)}
                      allowClear
                    />
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
                    <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid #30363d', background: 'transparent', color: '#8b949e', fontSize: 13, cursor: 'pointer', marginLeft: screens.xs ? 0 : 'auto' }}>
                      <SortAscendingOutlined />
                      {sortBy === 'popular' ? '最受欢迎' : sortBy === 'newest' ? '最新上架' : '名称排序'}
                    </button>
                  </Dropdown>
                </div>

                {filteredModels.length > 0 ? (
                  <div className="mp-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
                    {filteredModels.map(model => (
                      <div
                        key={model.id}
                        className="mp-card"
                        onMouseEnter={() => setHoveredModelId(model.id)}
                        onMouseLeave={() => setHoveredModelId(null)}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
                          <div className="mp-card-icon" style={{ background: 'rgba(88,166,255,0.1)', color: '#58a6ff' }}>
                            {getTypeIcon(model.type_name)}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#f0f6fc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {model.name}
                              </h3>
                              {model.sort_order > 900 && (
                                <Tooltip title="热门推荐">
                                  <span style={{ fontSize: 12 }}>🔥</span>
                                </Tooltip>
                              )}
                            </div>
                            <div style={{ fontSize: 13, color: '#8b949e', display: 'flex', alignItems: 'center', gap: 6 }}>
                              {model.provider_name}
                              <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#484f58' }} />
                              <span style={{ fontFamily: 'monospace' }}>{model.model_id}</span>
                            </div>
                          </div>
                        </div>

                        <div style={{ fontSize: 13, color: '#8b949e', lineHeight: 1.5, marginBottom: 16, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', height: 39 }}>
                          {model.description || '暂无描述'}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', color: '#8b949e', border: '1px solid #30363d' }}>
                            {model.type_name}
                          </span>
                          {model.billing && (
                            <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 12, background: 'rgba(88,166,255,0.1)', color: '#58a6ff', border: '1px solid rgba(88,166,255,0.2)' }}>
                              {getBillingLabel(model.billing)}
                            </span>
                          )}
                        </div>

                        <div style={{
                          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                          background: 'linear-gradient(to top, #161b22 0%, rgba(22,27,34,0) 100%)',
                          borderRadius: 10, opacity: hoveredModelId === model.id ? 1 : 0, transition: 'opacity 0.2s',
                          display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 20, pointerEvents: 'none'
                        }}>
                          <Button type="primary" style={{ width: '100%', background: '#58a6ff', pointerEvents: 'auto' }} onClick={(e) => { e.stopPropagation(); navigate('/playground'); }}>
                            去体验
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', color: '#484f58' }}>
                    <ShopOutlined style={{ fontSize: 48, marginBottom: 16, opacity: 0.5 }} />
                    <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 8, color: '#8b949e' }}>
                      {searchKeyword || selectedType !== null || selectedProviders.length > 0 ? '没有找到匹配的模型' : '暂无模型'}
                    </div>
                    <div style={{ fontSize: 14 }}>
                      {searchKeyword || selectedType !== null || selectedProviders.length > 0 ? '尝试调整筛选条件或搜索关键词' : '管理员尚未在模型广场中启用任何模型'}
                    </div>
                    {(searchKeyword || selectedType !== null || selectedProviders.length > 0) && (
                      <button onClick={clearFilters} style={{ marginTop: 16, fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 6, color: '#58a6ff', cursor: 'pointer', background: 'transparent', border: 'none' }}>
                        <FilterOutlined /> 清除所有筛选
                      </button>
                    )}
                  </div>
                )}
              </>
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
    </ConfigProvider>
  );
};

export default ModelMarketplace;
