import React, { useState, useEffect } from 'react';
import { Typography, Input, Switch, Button, Divider, Spin, App, Space, Tag, Alert, Modal } from 'antd';
import { SaveOutlined, EyeOutlined, ThunderboltOutlined, PlusOutlined, DeleteOutlined, LinkOutlined, CopyOutlined } from '@ant-design/icons';
import { LayoutDashboard, Tag as TagIcon, Code, FlaskConical, ShieldCheck, Globe, Landmark, PanelBottom } from 'lucide-react';
import request from '../../../utils/request';
import { useThemeStore } from '../../../store/theme';

const { Text, Title } = Typography;
const { TextArea } = Input;

type MenuKey = 'nav' | 'home' | 'col_models' | 'col_contact' | 'col_about' | 'static_gen' | 'other' | 'footer';

const PortalManager: React.FC = () => {
  const { themeMode } = useThemeStore();
  const _isLight = themeMode === 'light';
  const { message, modal } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeMenu, setActiveMenu] = useState<MenuKey>('nav');

  // Config states
  const [navConfig, setNavConfig] = useState<any>({});
  const [homeConfig, setHomeConfig] = useState<any>({});
  const [columnsConfig, setColumnsConfig] = useState<any>({});
  const [footerConfig, setFooterConfig] = useState<any>({});
  const [customScripts, setCustomScripts] = useState<any>({});
  const [seoConfig, setSeoConfig] = useState<any>({});
  const [generateLog, setGenerateLog] = useState<any[]>([]);
  const [generating, setGenerating] = useState(false);
  const [generatedLinks, setGeneratedLinks] = useState<{ label: string; path: string }[]>([]);

  useEffect(() => { fetchConfig(); }, []);

  const fetchConfig = async () => {
    try {
      setLoading(true);
      const res = await (request.get('/plugins/site-portal/portal-config') as Promise<any>);
      if (res.nav_config) setNavConfig(res.nav_config);
      if (res.home_config) setHomeConfig(res.home_config);
      if (res.columns_config) setColumnsConfig(res.columns_config);
      if (res.footer_config) setFooterConfig(res.footer_config);
      if (res.custom_scripts) setCustomScripts(res.custom_scripts);
      if (res.seo_config) setSeoConfig(res.seo_config);
      if (res.generate_log) setGenerateLog(res.generate_log);
    } catch (e) {
      message.error('加载门户配置失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (section: string, data: any) => {
    try {
      setSaving(true);
      await request.post('/plugins/site-portal/portal-config', { section, data });
      message.success('配置已保存');
    } catch (e) {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAllNav = async () => {
    try {
      setSaving(true);
      await request.post('/plugins/site-portal/portal-config', { section: 'nav', data: navConfig });
      await request.post('/plugins/site-portal/portal-config', { section: 'seo', data: seoConfig });
      message.success('导航与SEO配置已全部保存');
    } catch (e) {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleGenerate = async (scope: string, columns?: string[]) => {
    try {
      setGenerating(true);
      setGeneratedLinks([]);
      const res = await (request.post('/plugins/site-portal/generate', { scope, columns }) as Promise<any>);
      message.success(res.message || '生成完成');
      // 构建快捷链接
      if (res.generated_paths && Array.isArray(res.generated_paths)) {
        setGeneratedLinks(res.generated_paths);
      }
      fetchConfig();
    } catch (e) {
      message.error('生成失败');
    } finally {
      setGenerating(false);
    }
  };

  const handlePreview = (page = 'home') => {
    // 直接打开动态渲染路由，无需 blob
    const pathMap: Record<string, string> = {
      home: '/home',
      models: '/home/models',
      contact: '/home/contact',
      about: '/home/about',
    };
    const url = pathMap[page] || '/home';
    window.open(url, '_blank');
  };

  const cardStyle = {
    background: _isLight ? '#fff' : '#141414',
    borderRadius: 8,
    border: _isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.08)',
    padding: '20px',
    marginBottom: 16,
  };

  const labelStyle = { color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)', fontSize: 13, display: 'block' as const, marginBottom: 6 };

  // ─── Left Menu ───
  const menuItems: { key: string; icon?: React.ReactNode; label: string; isTitle?: boolean; isSub?: boolean }[] = [
    { key: 'nav', icon: <LayoutDashboard size={16} strokeWidth={1.5} />, label: '导航管理' },
    { key: 'footer', icon: <PanelBottom size={16} strokeWidth={1.5} />, label: '底部管理' },
    { key: 'home', icon: <Globe size={16} strokeWidth={1.5} />, label: '首页管理' },
    { key: 'col_title', icon: <TagIcon size={16} strokeWidth={1.5} />, label: '栏目管理', isTitle: true },
    { key: 'col_models', label: '模型数据', isSub: true },
    { key: 'col_contact', label: '联系我们', isSub: true },
    { key: 'col_about', label: '关于我们', isSub: true },
    { key: 'static_gen', icon: <Code size={16} strokeWidth={1.5} />, label: '静态生成' },
    { key: 'other', icon: <ShieldCheck size={16} strokeWidth={1.5} />, label: '其他配置' },
  ];

  // ─── Right Panel Content ───

  const renderNav = () => (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={5} style={{ margin: 0, color: _isLight ? '#1f2937' : '#fff' }}>导航管理</Title>
        <Space>
          <Button icon={<EyeOutlined />} onClick={() => handlePreview('home')}>预览</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSaveAllNav}>保存全部配置</Button>
        </Space>
      </div>
      <div style={cardStyle}>
        <Text style={labelStyle}>Logo 图片 URL（留空则只显示文字）</Text>
        <Input value={navConfig.logo_url || ''} onChange={e => setNavConfig({ ...navConfig, logo_url: e.target.value })} placeholder="https://cdn.example.com/logo.png" style={{ marginBottom: 12 }} />
        <Text style={labelStyle}>Logo 点击跳转链接</Text>
        <Input value={navConfig.logo_link || ''} onChange={e => setNavConfig({ ...navConfig, logo_link: e.target.value })} placeholder="例如：/home 或 https://..." style={{ marginBottom: 12 }} />
        <Text style={labelStyle}>Logo 文字</Text>
        <Input value={navConfig.logo_text || ''} onChange={e => setNavConfig({ ...navConfig, logo_text: e.target.value })} placeholder="TokensByte" style={{ marginBottom: 12 }} />
        <Divider style={{ borderColor: _isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)', margin: '14px 0' }} />
        <Text style={labelStyle}>登录按钮文字 / 链接</Text>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          <Input value={navConfig.cta_text || '登录'} onChange={e => setNavConfig({ ...navConfig, cta_text: e.target.value })} />
          <Input value={navConfig.cta_link || '/login'} onChange={e => setNavConfig({ ...navConfig, cta_link: e.target.value })} />
        </div>
        <Text style={labelStyle}>注册按钮文字 / 链接</Text>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Input value={navConfig.register_text || '注册'} onChange={e => setNavConfig({ ...navConfig, register_text: e.target.value })} />
          <Input value={navConfig.register_link || '/register'} onChange={e => setNavConfig({ ...navConfig, register_link: e.target.value })} />
        </div>
      </div>

      {/* 顶部导航菜单 */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <Text strong style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 14 }}>顶部导航菜单</Text>
          <Button size="small" icon={<PlusOutlined />} onClick={() => {
            const items = [...(navConfig.items || []), { label: '新栏目|New', path: '/home/new', enabled: true, key: `item_${Date.now()}` }];
            setNavConfig({ ...navConfig, items });
          }}>添加栏目</Button>
        </div>
        <div style={{ marginBottom: 16 }}>
          <Text type="secondary" style={{ fontSize: 13 }}>💡 提示：支持中英双语无缝切换，名称填写格式为 <Text code>中文|English</Text>（如 <Text code>帮助中心|Help Center</Text>）。</Text>
        </div>
        {(navConfig.items || []).map((item: any, idx: number) => (
          <div key={idx} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr 1.5fr auto', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <Switch
              size="small"
              checked={item.enabled !== false}
              onChange={v => {
                const items = [...navConfig.items];
                items[idx] = { ...item, enabled: v };
                setNavConfig({ ...navConfig, items });
              }}
            />
            <Input
              value={item.label}
              onChange={e => {
                const items = [...navConfig.items];
                items[idx] = { ...item, label: e.target.value };
                setNavConfig({ ...navConfig, items });
              }}
              placeholder="栏目名称 (如: 首页)"
            />
            <Input
              value={item.path}
              onChange={e => {
                const items = [...navConfig.items];
                items[idx] = { ...item, path: e.target.value };
                setNavConfig({ ...navConfig, items });
              }}
              placeholder="链接路径 (如: /home)"
            />
            <Input
              value={item.icon || ''}
              onChange={e => {
                const items = [...navConfig.items];
                items[idx] = { ...item, icon: e.target.value };
                setNavConfig({ ...navConfig, items });
              }}
              placeholder="图标 SVG (如: <svg>...</svg>)"
            />
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => {
                const items = navConfig.items.filter((_: any, i: number) => i !== idx);
                setNavConfig({ ...navConfig, items });
              }}
            />
          </div>
        ))}
        {(!navConfig.items || navConfig.items.length === 0) && (
          <Text style={{ color: _isLight ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)', fontSize: 13 }}>暂无导航菜单，点击添加</Text>
        )}
      </div>
      {/* SEO */}
      <div style={cardStyle}>
        <Text strong style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 14, display: 'block', marginBottom: 12 }}>SEO 元信息</Text>
        <Text style={labelStyle}>页面标题 (meta title)</Text>
        <Input value={seoConfig.meta_title || ''} onChange={e => setSeoConfig({ ...seoConfig, meta_title: e.target.value })} placeholder="站点标题" style={{ marginBottom: 8 }} />
        <Text style={labelStyle}>页面描述 (meta description)</Text>
        <Input value={seoConfig.meta_description || ''} onChange={e => setSeoConfig({ ...seoConfig, meta_description: e.target.value })} placeholder="站点描述" style={{ marginBottom: 8 }} />
        <Text style={labelStyle}>关键词 (meta keywords)</Text>
        <Input value={seoConfig.meta_keywords || ''} onChange={e => setSeoConfig({ ...seoConfig, meta_keywords: e.target.value })} placeholder="AI, API, 模型" />
      </div>
    </div>
  );

  const renderFooter = () => (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={5} style={{ margin: 0, color: _isLight ? '#1f2937' : '#fff' }}>底部管理</Title>
        <Space>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => handleSave('footer', footerConfig)}>保存</Button>
        </Space>
      </div>
      <div style={cardStyle}>
        <Text strong style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 14, display: 'block', marginBottom: 12 }}>Footer 配置</Text>
        <Text style={labelStyle}>版权信息</Text>
        <Input value={footerConfig.copyright || ''} onChange={e => setFooterConfig({ ...footerConfig, copyright: e.target.value })} placeholder="公司名称" style={{ marginBottom: 8 }} />
        <Text style={labelStyle}>备案号</Text>
        <Input value={footerConfig.icp_number || ''} onChange={e => setFooterConfig({ ...footerConfig, icp_number: e.target.value })} placeholder="京ICP备xxxxxxxx号" />
      </div>
    </div>
  );

  const renderHome = () => (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={5} style={{ margin: 0, color: _isLight ? '#1f2937' : '#fff' }}>首页管理</Title>
        <Space>
          <Button icon={<EyeOutlined />} onClick={() => handlePreview('home')}>预览首页</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => handleSave('home', homeConfig)}>保存</Button>
        </Space>
      </div>
      <div style={cardStyle}>
        <Text strong style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 14, display: 'block', marginBottom: 12 }}>Hero 区域</Text>
        <Text style={labelStyle}>主标题</Text>
        <Input value={homeConfig.hero_title || ''} onChange={e => setHomeConfig({ ...homeConfig, hero_title: e.target.value })} style={{ marginBottom: 8 }} />
        <Text style={labelStyle}>副标题</Text>
        <Input value={homeConfig.hero_subtitle || ''} onChange={e => setHomeConfig({ ...homeConfig, hero_subtitle: e.target.value })} style={{ marginBottom: 8 }} />
        <Text style={labelStyle}>背景图 URL</Text>
        <Input value={homeConfig.hero_bg_image || ''} onChange={e => setHomeConfig({ ...homeConfig, hero_bg_image: e.target.value })} placeholder="https://..." style={{ marginBottom: 8 }} />
        <Text style={labelStyle}>CTA 按钮文字 / 链接</Text>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <Input value={homeConfig.hero_cta_text || ''} onChange={e => setHomeConfig({ ...homeConfig, hero_cta_text: e.target.value })} placeholder="立即体验" />
          <Input value={homeConfig.hero_cta_link || ''} onChange={e => setHomeConfig({ ...homeConfig, hero_cta_link: e.target.value })} placeholder="/register" />
        </div>
        <Text style={labelStyle}>API Base URL (展示地址)</Text>
        <Input value={homeConfig.api_base_url || ''} onChange={e => setHomeConfig({ ...homeConfig, api_base_url: e.target.value })} placeholder="例如：https://api.tokensbyte.com/v1 (留空默认使用当前域名/v1)" style={{ marginBottom: 8 }} />
      </div>
      {/* Features */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <Text strong style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 14 }}>特性卡片</Text>
          <Button size="small" icon={<PlusOutlined />} onClick={() => {
            const features = [...(homeConfig.features || []), { icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14H4z"/></svg>', title: '新特性', description: '描述' }];
            setHomeConfig({ ...homeConfig, features });
          }}>添加</Button>
        </div>
        {(homeConfig.features || []).map((feat: any, idx: number) => (
          <div key={idx} style={{ display: 'grid', gridTemplateColumns: '60px 1fr 1fr auto', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <Input value={feat.icon} onChange={e => {
              const features = [...homeConfig.features];
              features[idx] = { ...feat, icon: e.target.value };
              setHomeConfig({ ...homeConfig, features });
            }} placeholder="图标" />
            <Input value={feat.title} onChange={e => {
              const features = [...homeConfig.features];
              features[idx] = { ...feat, title: e.target.value };
              setHomeConfig({ ...homeConfig, features });
            }} placeholder="标题" />
            <Input value={feat.description} onChange={e => {
              const features = [...homeConfig.features];
              features[idx] = { ...feat, description: e.target.value };
              setHomeConfig({ ...homeConfig, features });
            }} placeholder="描述" />
            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => {
              const features = homeConfig.features.filter((_: any, i: number) => i !== idx);
              setHomeConfig({ ...homeConfig, features });
            }} />
          </div>
        ))}
        {(!homeConfig.features || homeConfig.features.length === 0) && (
          <Text style={{ color: _isLight ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)', fontSize: 13 }}>暂无特性卡片，点击添加</Text>
        )}
      </div>

      {/* CTA Banner 区域 */}
      <div style={cardStyle}>
        <Text strong style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 14, display: 'block', marginBottom: 12 }}>CTA Banner 区域</Text>
        <Text style={labelStyle}>标题</Text>
        <Input value={homeConfig.cta_title || ''} onChange={e => setHomeConfig({ ...homeConfig, cta_title: e.target.value })} placeholder="例如：准备好开始构建了吗？" style={{ marginBottom: 8 }} />
        <Text style={labelStyle}>描述文本</Text>
        <TextArea rows={3} value={homeConfig.cta_description || ''} onChange={e => setHomeConfig({ ...homeConfig, cta_description: e.target.value })} placeholder="例如：只需 3 分钟即可获取 API 密钥..." style={{ marginBottom: 8 }} />
        <Text style={labelStyle}>主按钮文字 / 链接</Text>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <Input value={homeConfig.cta_primary_btn_text || ''} onChange={e => setHomeConfig({ ...homeConfig, cta_primary_btn_text: e.target.value })} placeholder="开始对话" />
          <Input value={homeConfig.cta_primary_btn_link || ''} onChange={e => setHomeConfig({ ...homeConfig, cta_primary_btn_link: e.target.value })} placeholder="/login" />
        </div>
        <Text style={labelStyle}>次按钮文字 / 链接</Text>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Input value={homeConfig.cta_secondary_btn_text || ''} onChange={e => setHomeConfig({ ...homeConfig, cta_secondary_btn_text: e.target.value })} placeholder="阅读文档" />
          <Input value={homeConfig.cta_secondary_btn_link || ''} onChange={e => setHomeConfig({ ...homeConfig, cta_secondary_btn_link: e.target.value })} placeholder="/docs" />
        </div>
      </div>
    </div>
  );

  const updateCol = (key: string, field: string, value: any) => {
    const cols = columnsConfig || {};
    const updated = { ...cols, [key]: { ...cols[key], [field]: value } };
    setColumnsConfig(updated);
  };
  const updateColContent = (key: string, field: string, value: any) => {
    const cols = columnsConfig || {};
    const content = { ...(cols[key]?.content || {}), [field]: value };
    updateCol(key, 'content', content);
  };

  const renderColSeo = (colKey: string) => {
    const cols = columnsConfig || {};
    return (
      <div style={{ marginTop: 16, paddingTop: 16, borderTop: _isLight ? '1px dashed rgba(0,0,0,0.06)' : '1px dashed rgba(255,255,255,0.06)' }}>
        <Text strong style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 13, display: 'block', marginBottom: 12 }}>独立 SEO 配置</Text>
        <Text style={labelStyle}>页面标题 (meta title)</Text>
        <Input value={cols[colKey]?.seo_title || ''} onChange={e => updateCol(colKey, 'seo_title', e.target.value)} placeholder="留空则使用导航配置的标题" style={{ marginBottom: 8 }} />
        <Text style={labelStyle}>页面描述 (meta description)</Text>
        <Input value={cols[colKey]?.seo_description || ''} onChange={e => updateCol(colKey, 'seo_description', e.target.value)} placeholder="留空则使用导航配置的描述" style={{ marginBottom: 8 }} />
        <Text style={labelStyle}>关键词 (meta keywords)</Text>
        <Input value={cols[colKey]?.seo_keywords || ''} onChange={e => updateCol(colKey, 'seo_keywords', e.target.value)} placeholder="留空则使用导航配置的关键词" />
      </div>
    );
  };

  const renderColModels = () => {
    const cols = columnsConfig || {};
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <Title level={5} style={{ margin: 0, color: _isLight ? '#1f2937' : '#fff' }}>模型数据</Title>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => handleSave('columns', columnsConfig)}>保存</Button>
        </div>
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Code size={20} strokeWidth={1.5} />
              <Text strong style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 14 }}>模型数据</Text>
              <Tag color={cols.models?.enabled !== false ? 'success' : 'default'} style={{ margin: 0 }}>{cols.models?.enabled !== false ? '已启用' : '已关闭'}</Tag>
            </div>
            <Space>
              <Button size="small" icon={<EyeOutlined />} onClick={() => handlePreview('models')}>预览</Button>
              <Switch size="small" checked={cols.models?.enabled !== false} onChange={v => updateCol('models', 'enabled', v)} />
            </Space>
          </div>
          <Text style={labelStyle}>中文标题</Text>
          <Input value={cols.models?.title || '模型数据'} onChange={e => updateCol('models', 'title', e.target.value)} style={{ marginBottom: 8 }} />
          <Text style={labelStyle}>英文路径（URL slug，如 models）</Text>
          <Input value={cols.models?.path || 'models'} onChange={e => updateCol('models', 'path', e.target.value)} addonBefore="/home/" placeholder="models" style={{ marginBottom: 8 }} />
          <Text style={{ ...labelStyle, marginTop: 4, color: _isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)', fontSize: 12 }}>
            数据自动从系统模型表拉取已启用的模型进行展示
          </Text>
          {renderColSeo('models')}
        </div>
      </div>
    );
  };

  const renderColContact = () => {
    const cols = columnsConfig || {};
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <Title level={5} style={{ margin: 0, color: _isLight ? '#1f2937' : '#fff' }}>联系我们</Title>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => handleSave('columns', columnsConfig)}>保存</Button>
        </div>
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Landmark size={20} strokeWidth={1.5} />
              <Text strong style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 14 }}>联系我们</Text>
              <Tag color={cols.contact?.enabled !== false ? 'success' : 'default'} style={{ margin: 0 }}>{cols.contact?.enabled !== false ? '已启用' : '已关闭'}</Tag>
            </div>
            <Space>
              <Button size="small" icon={<EyeOutlined />} onClick={() => handlePreview('contact')}>预览</Button>
              <Switch size="small" checked={cols.contact?.enabled !== false} onChange={v => updateCol('contact', 'enabled', v)} />
            </Space>
          </div>
          <Text style={labelStyle}>中文标题</Text>
          <Input value={cols.contact?.title || '联系我们'} onChange={e => updateCol('contact', 'title', e.target.value)} style={{ marginBottom: 8 }} />
          <Text style={labelStyle}>英文路径（URL slug，如 contact）</Text>
          <Input value={cols.contact?.path || 'contact'} onChange={e => updateCol('contact', 'path', e.target.value)} addonBefore="/home/" placeholder="contact" style={{ marginBottom: 8 }} />
          <Text style={labelStyle}>邮箱</Text>
          <Input value={cols.contact?.content?.email || ''} onChange={e => updateColContent('contact', 'email', e.target.value)} style={{ marginBottom: 8 }} />
          <Text style={labelStyle}>电话</Text>
          <Input value={cols.contact?.content?.phone || ''} onChange={e => updateColContent('contact', 'phone', e.target.value)} style={{ marginBottom: 8 }} />
          <Text style={labelStyle}>地址</Text>
          <Input value={cols.contact?.content?.address || ''} onChange={e => updateColContent('contact', 'address', e.target.value)} />
          {renderColSeo('contact')}
        </div>
      </div>
    );
  };

  const renderColAbout = () => {
    const cols = columnsConfig || {};
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <Title level={5} style={{ margin: 0, color: _isLight ? '#1f2937' : '#fff' }}>关于我们</Title>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => handleSave('columns', columnsConfig)}>保存</Button>
        </div>
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FlaskConical size={20} strokeWidth={1.5} />
              <Text strong style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 14 }}>关于我们</Text>
              <Tag color={cols.about?.enabled !== false ? 'success' : 'default'} style={{ margin: 0 }}>{cols.about?.enabled !== false ? '已启用' : '已关闭'}</Tag>
            </div>
            <Space>
              <Button size="small" icon={<EyeOutlined />} onClick={() => handlePreview('about')}>预览</Button>
              <Switch size="small" checked={cols.about?.enabled !== false} onChange={v => updateCol('about', 'enabled', v)} />
            </Space>
          </div>
          <Text style={labelStyle}>中文标题</Text>
          <Input value={cols.about?.title || '关于我们'} onChange={e => updateCol('about', 'title', e.target.value)} style={{ marginBottom: 8 }} />
          <Text style={labelStyle}>英文路径（URL slug，如 about）</Text>
          <Input value={cols.about?.path || 'about'} onChange={e => updateCol('about', 'path', e.target.value)} addonBefore="/home/" placeholder="about" style={{ marginBottom: 8 }} />
          <Text style={labelStyle}>内容（支持 HTML）</Text>
          <TextArea rows={8} value={cols.about?.content || ''} onChange={e => updateCol('about', 'content', e.target.value)} placeholder="<h2>关于我们</h2><p>...</p>" />
          {renderColSeo('about')}
        </div>
      </div>
    );
  };

  const handleCopyLink = (path: string) => {
    const fullUrl = `${window.location.origin}${path}`;
    navigator.clipboard.writeText(fullUrl).then(() => {
      message.success('链接已复制到剪贴板');
    }).catch(() => {
      message.error('复制失败');
    });
  };

  const renderStaticGen = () => (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={5} style={{ margin: 0, color: _isLight ? '#1f2937' : '#fff' }}>静态 HTML 生成</Title>
      </div>
      <Alert type="info" showIcon message="生成后的静态 HTML 文件将部署到 /portal 路径，便于搜索引擎抓取和 SEO/GEO 优化" style={{ marginBottom: 16 }} />

      <div style={cardStyle}>
        <Text strong style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 14, display: 'block', marginBottom: 16 }}>快捷操作</Text>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <Button icon={<ThunderboltOutlined />} loading={generating} onClick={() => handleGenerate('home')}>首页更新生成</Button>
          <Button icon={<ThunderboltOutlined />} loading={generating} onClick={() => handleGenerate('columns', ['models'])}>模型数据更新</Button>
          <Button icon={<ThunderboltOutlined />} loading={generating} onClick={() => handleGenerate('columns', ['contact'])}>联系我们更新</Button>
          <Button icon={<ThunderboltOutlined />} loading={generating} onClick={() => handleGenerate('columns', ['about'])}>关于我们更新</Button>
          <Button type="primary" icon={<ThunderboltOutlined />} loading={generating} onClick={() => handleGenerate('all')}>全站更新生成</Button>
        </div>
      </div>

      {/* 生成后的快捷链接 */}
      {generatedLinks.length > 0 && (
        <div style={{
          ...cardStyle,
          background: _isLight ? 'linear-gradient(135deg, #f0fdf4, #dcfce7)' : 'linear-gradient(135deg, #052e16, #064e3b)',
          border: _isLight ? '1px solid #86efac' : '1px solid #065f46',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <LinkOutlined style={{ color: '#22c55e', fontSize: 16 }} />
            <Text strong style={{ color: _isLight ? '#166534' : '#86efac', fontSize: 14 }}>生成完成 - 快捷访问链接</Text>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {generatedLinks.map((link, idx) => (
              <div key={idx} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 12px', borderRadius: 6,
                background: _isLight ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.2)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Tag color="green" style={{ margin: 0 }}>{link.label}</Tag>
                  <a
                    href={link.path}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#1677ff', fontSize: 13, textDecoration: 'none' }}
                  >
                    {window.location.origin}{link.path}
                  </a>
                </div>
                <Space size={4}>
                  <Button
                    type="text"
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => handleCopyLink(link.path)}
                    style={{ color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)' }}
                  />
                  <Button
                    type="link"
                    size="small"
                    icon={<EyeOutlined />}
                    onClick={() => window.open(link.path, '_blank')}
                  >
                    查看
                  </Button>
                </Space>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 生成日志 */}
      <div style={cardStyle}>
        <Text strong style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 14, display: 'block', marginBottom: 12 }}>最近生成记录</Text>
        {generateLog.length > 0 ? generateLog.slice(0, 10).map((log: any, idx: number) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: _isLight ? '1px solid rgba(0,0,0,0.04)' : '1px solid rgba(255,255,255,0.04)' }}>
            <Text style={{ color: _isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)', fontSize: 12, minWidth: 140 }}>{log.time}</Text>
            <Tag style={{ margin: 0 }}>{log.scope === 'all' ? '全站' : log.scope}</Tag>
            <Text style={{ color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)', fontSize: 13 }}>{(log.pages || []).join('、')}</Text>
          </div>
        )) : (
          <Text style={{ color: _isLight ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)', fontSize: 13 }}>暂无生成记录</Text>
        )}
      </div>
    </div>
  );

  const renderOther = () => (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={5} style={{ margin: 0, color: _isLight ? '#1f2937' : '#fff' }}>其他配置</Title>
        <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => handleSave('scripts', customScripts)}>保存</Button>
      </div>
      <div style={cardStyle}>
        <Text strong style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 14, display: 'block', marginBottom: 4 }}>客服代码</Text>
        <Text style={{ color: _isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)', fontSize: 12, display: 'block', marginBottom: 8 }}>
          输入的 JS 代码将自动加载到所有门户页面（注入到 &lt;/body&gt; 前）
        </Text>
        <TextArea rows={6} value={customScripts.customer_service || ''} onChange={e => setCustomScripts({ ...customScripts, customer_service: e.target.value })}
          placeholder={'<script>\n// 客服系统 JS 代码\n</script>'} style={{ fontFamily: 'monospace', fontSize: 12 }} />
      </div>
      <div style={cardStyle}>
        <Text strong style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 14, display: 'block', marginBottom: 4 }}>统计代码</Text>
        <Text style={{ color: _isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)', fontSize: 12, display: 'block', marginBottom: 8 }}>
          输入的 JS 代码将自动加载到所有门户页面（注入到 &lt;head&gt; 中）
        </Text>
        <TextArea rows={6} value={customScripts.analytics || ''} onChange={e => setCustomScripts({ ...customScripts, analytics: e.target.value })}
          placeholder={'<!-- Google Analytics -->\n<script async src="https://..."></script>'} style={{ fontFamily: 'monospace', fontSize: 12 }} />
      </div>
    </div>
  );

  if (loading) return <div style={{ textAlign: 'center', padding: 60 }}><Spin /></div>;

  const panels: Record<MenuKey, () => React.ReactNode> = {
    nav: renderNav,
    footer: renderFooter,
    home: renderHome,
    col_models: renderColModels,
    col_contact: renderColContact,
    col_about: renderColAbout,
    static_gen: renderStaticGen,
    other: renderOther,
  };

  return (
    <div style={{ display: 'flex', gap: 16, minHeight: 500 }}>
      {/* Left Sidebar */}
      <div style={{
        width: 180, flexShrink: 0,
        background: _isLight ? '#fff' : '#141414',
        border: _isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.08)',
        borderRadius: 8, padding: '8px 0', alignSelf: 'flex-start', position: 'sticky', top: 80,
      }}>
        {menuItems.map(item => {
          if (item.isTitle) {
            return (
              <div key={item.key} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 16px 4px 16px', fontSize: 12, fontWeight: 600,
                color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)',
              }}>
                {item.icon}
                {item.label}
              </div>
            );
          }
          return (
            <div
              key={item.key}
              onClick={() => setActiveMenu(item.key as MenuKey)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: `10px 16px 10px ${item.isSub ? '32px' : '16px'}`, cursor: 'pointer', fontSize: 13, fontWeight: 500,
                color: activeMenu === item.key ? '#1677ff' : (_isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)'),
                background: activeMenu === item.key ? (_isLight ? 'rgba(22,119,255,0.06)' : 'rgba(22,119,255,0.08)') : 'transparent',
                borderRight: activeMenu === item.key ? '2px solid #1677ff' : '2px solid transparent',
                transition: 'all 0.15s',
              }}
            >
              {item.icon}
              {item.label}
            </div>
          );
        })}
      </div>

      {/* Right Panel */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {panels[activeMenu]?.()}
      </div>
    </div>
  );
};

export default PortalManager;
