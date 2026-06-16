import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Card, Typography, Tag, Tabs, Descriptions, Table, Alert, Divider, theme, Grid,
  Layout, Menu, Button, Space, Popover, List, Tooltip, Dropdown, Badge, message
} from 'antd';
import {
  RocketOutlined, CodeOutlined, InfoCircleOutlined, ApiOutlined,
  ThunderboltOutlined, CloudServerOutlined, PlayCircleOutlined,
  GoogleOutlined, RobotOutlined, ExclamationCircleOutlined,
  MenuUnfoldOutlined, MenuFoldOutlined, ArrowLeftOutlined, CopyOutlined,
  ScheduleOutlined, BellOutlined, SunOutlined, MoonOutlined, GlobalOutlined,
  ShopOutlined
} from '@ant-design/icons';
import request from '../../utils/request';
import { useThemeStore } from '../../store/theme';
import useSettingsStore from '../../store/settings';
import useAuthStore from '../../store/auth';
import UserAvatarMenu from '../../components/UserAvatarMenu';

const { Title, Text, Paragraph } = Typography;
const { Header, Sider, Content } = Layout;
const { useBreakpoint } = Grid;

interface Announcement {
  id: number;
  title: string;
  content: string;
  is_pinned: number;
  created_at: string;
}

const RelayAPI: React.FC = () => {
  const screens = useBreakpoint();
  const navigate = useNavigate();
  const { token: themeToken } = theme.useToken();
  const { t: _t, i18n } = useTranslation();
  const { themeMode, toggleTheme } = useThemeStore();
  const { settings } = useSettingsStore();
  const { user } = useAuthStore();

  const [selectedMenuKey, setSelectedMenuKey] = useState<string>('endpoints');
  const [collapsed, setCollapsed] = useState(false);
  const [announcementsDrawerVisible, setAnnouncementsDrawerVisible] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);



  const isEn = i18n.language === 'en';
  const enableThemeToggle = settings?.site?.enable_theme_toggle !== false;
  const enableMultilingual = settings?.site?.enable_multilingual !== false;
  const siteName = settings?.site?.name || 'TokensByte';
  const siteLogo = settings?.site?.logo || '';
  const siteTitle = settings?.site?.title || '';
  const agreement = settings?.agreement || null;

  useEffect(() => {
    document.title = isEn ? `API Tutorial - ${siteTitle}` : `API教程 - ${siteTitle}`;
  }, [isEn, siteTitle]);

  useEffect(() => {
    const fetchAnnouncements = async () => {
      try {
        const response = await (request.get('/announcements/public') as any);
        if (response.data) {
          setAnnouncements(response.data);
        }
      } catch (error) {
        console.error('Failed to fetch announcements:', error);
      }
    };
    fetchAnnouncements();
  }, []);

  const isLocal = window.location.hostname === 'localhost' || /^(127\.|192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(window.location.hostname);
  const baseUrl = isLocal
    ? `${window.location.protocol}//${window.location.hostname}:3000`
    : `${window.location.protocol}//${window.location.hostname}`;

  const endpoints = [
    { label: isEn ? 'OpenAI Chat' : 'OpenAI 聊天', path: '/v1/chat/completions', method: 'POST', type: 'openai' },
    { label: isEn ? 'OpenAI Responses' : 'OpenAI 响应 (Responses)', path: '/v1/responses', method: 'POST', type: 'openai' },
    { label: isEn ? 'OpenAI Image' : 'OpenAI 图片', path: '/v1/images/generations', method: 'POST', type: 'openai' },
    { label: isEn ? 'OpenAI Image Edit' : 'OpenAI 图像编辑', path: '/v1/images/edits', method: 'POST', type: 'openai' },
    { label: isEn ? 'OpenAI Video (Submit)' : 'OpenAI 视频 (提交)', path: '/v1/video/generations', method: 'POST', type: 'openai' },
    { label: isEn ? 'OpenAI Video (Query)' : 'OpenAI 视频 (查询)', path: '/v1/video/generations/{task_id}', method: 'GET', type: 'openai' },
    { label: isEn ? 'Image/Video Async Status (Query)' : '图片异步状态 (兼容查询)', path: '/v1/tasks/{task_id}', method: 'GET', type: 'openai' },
    { label: isEn ? 'OpenAI Speech' : 'OpenAI 语音合成', path: '/v1/audio/speech', method: 'POST', type: 'openai' },
    { label: isEn ? 'Google Native (Non-stream)' : 'Google 原生 (非流式)', path: '/v1beta/models/{model}:generateContent', method: 'POST', type: 'google' },
    { label: isEn ? 'Google Native (Stream)' : 'Google 原生 (流式)', path: '/v1beta/models/{model}:streamGenerateContent', method: 'POST', type: 'google' },
    { label: isEn ? 'Anthropic Chat (Native)' : 'Anthropic 聊天 (原生)', path: '/v1/messages', method: 'POST', type: 'anthropic' },
    { label: isEn ? 'Volcengine Chat' : '火山方舟聊天', path: '/api/v3/chat/completions', method: 'POST', type: 'volcengine' },
    { label: isEn ? 'Volcengine Responses' : '火山方舟响应 (Responses)', path: '/api/v3/responses', method: 'POST', type: 'volcengine' },
    { label: isEn ? 'Volcengine Image' : '火山方舟生图', path: '/api/v3/images/generations', method: 'POST', type: 'volcengine' },
    { label: isEn ? 'Volcengine Video (Submit)' : '火山方舟视频 (提交)', path: '/api/v3/contents/generations/tasks', method: 'POST', type: 'volcengine' },
    { label: isEn ? 'Volcengine Video (Query)' : '火山方舟视频 (查询)', path: '/api/v3/contents/generations/tasks/{task_id}', method: 'GET', type: 'volcengine' },
    { label: isEn ? 'Volcengine Video (Cancel)' : '火山方舟视频 (取消)', path: '/api/v3/contents/generations/tasks/{task_id}', method: 'DELETE', type: 'volcengine' },
    { label: isEn ? 'Volcengine Task List' : '火山方舟任务列表', path: '/api/v3/contents/generations/tasks', method: 'GET', type: 'volcengine' },
    { label: isEn ? 'Volcengine TTS (SSE)' : '火山方舟语音合成 (SSE)', path: '/api/v3/tts/unidirectional/sse', method: 'POST', type: 'volcengine' },
    { label: isEn ? 'Volcengine TTS (Chunked)' : '火山方舟语音合成 (Chunked)', path: '/api/v3/tts/unidirectional', method: 'POST', type: 'volcengine' },
    { label: isEn ? 'DashScope Video (Submit)' : '阿里百炼视频 (提交)', path: '/api/v1/services/aigc/video-generation/video-synthesis', method: 'POST', type: 'dashscope' },
    { label: isEn ? 'DashScope Video (Query)' : '阿里百炼视频 (查询)', path: '/api/v1/tasks/{task_id}', method: 'GET', type: 'dashscope' },
    { label: isEn ? 'DashScope Image (Submit)' : '阿里百炼图片 (提交)', path: '/api/v1/services/aigc/multimodal-generation/generation', method: 'POST', type: 'dashscope' },
    { label: isEn ? 'DashScope Text Embedding' : '阿里百炼文本向量', path: '/compatible-mode/v1/embeddings', method: 'POST', type: 'dashscope' },
    { label: isEn ? 'DashScope Rerank (Compatible)' : '阿里百炼排序 (兼容模式)', path: '/compatible-api/v1/reranks', method: 'POST', type: 'dashscope' },
    { label: isEn ? 'DashScope Rerank (Native)' : '阿里百炼排序 (原生模式)', path: '/api/v1/services/rerank/text-rerank/text-rerank', method: 'POST', type: 'dashscope' },
    { label: isEn ? 'Kling Text2Video (Submit)' : '可灵文生视频 (提交)', path: '/v1/videos/text2video', method: 'POST', type: 'kling' },
    { label: isEn ? 'Kling Image2Video (Submit)' : '可灵图生视频 (提交)', path: '/v1/videos/image2video', method: 'POST', type: 'kling' },
    { label: isEn ? 'Kling Multi-Image2Video (Submit)' : '可灵多图生视频 (提交)', path: '/v1/videos/multi-image2video', method: 'POST', type: 'kling' },
    { label: isEn ? 'Kling Omni Video (Submit)' : '可灵 Omni 视频 (提交)', path: '/v1/videos/omni-video', method: 'POST', type: 'kling' },
    { label: isEn ? 'Kling Video (Query)' : '可灵视频 (查询)', path: '/v1/videos/{endpoint}/{task_id}', method: 'GET', type: 'kling' },
    { label: isEn ? 'Kling Image (Submit)' : '可灵图片 (提交)', path: '/v1/images/generations', method: 'POST', type: 'kling' },
    { label: isEn ? 'Kling Multi-Image2Image (Submit)' : '可灵多图生图 (提交)', path: '/v1/images/multi-image2image', method: 'POST', type: 'kling' },
    { label: isEn ? 'Kling Omni Image (Submit)' : '可灵 Omni 图片 (提交)', path: '/v1/images/omni-image', method: 'POST', type: 'kling' },
    { label: isEn ? 'Kling Image (Query)' : '可灵图片 (查询)', path: '/v1/images/{endpoint}/{task_id}', method: 'GET', type: 'kling' },
    { label: isEn ? 'Token Balance Inquiry' : '令牌余额查询', path: '/v1/balance', method: 'GET', type: 'openai' },
    { label: isEn ? 'User Balance Inquiry' : '用户余额查询', path: '/v1/user/balance', method: 'GET', type: 'openai' },
    { label: isEn ? 'Model List' : '模型列表', path: '/v1/models', method: 'GET', type: 'openai' },
    { label: isEn ? 'Volcengine Model List' : '火山方舟模型列表', path: '/api/v3/models', method: 'GET', type: 'volcengine' },
  ];

  const errorCodes = [
    { code: 400, desc: isEn ? 'Bad Request — Missing fields or invalid format' : 'Bad Request — 请求参数错误（如必需字段缺失、格式不合法）' },
    { code: 401, desc: isEn ? 'Unauthorized — API Key invalid, expired, or missing' : 'Unauthorized — API Key 无效、已过期或未提供' },
    { code: 403, desc: isEn ? 'Forbidden — Insufficient balance / token permissions / model access' : 'Forbidden — 余额不足 / 令牌权限不足 / 模型无权访问' },
    { code: 404, desc: isEn ? 'Not Found — The requested path does not exist, or no available channel' : 'Not Found — 请求的路径不存在，或当前模型无可用渠道' },
    { code: 429, desc: isEn ? 'Too Many Requests — Concurrency limit or token rate limit reached' : 'Too Many Requests — 触发并发限制或令牌请求速率上限' },
    { code: 500, desc: isEn ? 'Internal Server Error — Gateway error, please try again or contact admin' : 'Internal Server Error — 网关内部异常，请稍后重试或联系管理员' },
    { code: 502, desc: isEn ? 'Bad Gateway — Upstream service failed (channel unreachable or exhausted)' : 'Bad Gateway — 上游服务请求失败（渠道不可达或已耗尽）' },
  ];

  const isLight = themeMode === 'light';
  const c = {
    bg: isLight ? '#f4f5f7' : '#0a0a0c',
    siderBg: isLight ? '#ffffff' : '#121214',
    cardBg: isLight ? '#ffffff' : '#121214',
    cardBorder: isLight ? '#eaeaea' : '#222225',
    cardHoverBg: isLight ? '#fafafa' : '#18181b',
    text1: isLight ? '#1f2937' : 'rgba(255,255,255,0.95)',
    text2: isLight ? '#4b5563' : 'rgba(255,255,255,0.75)',
    text3: isLight ? '#6b7280' : 'rgba(255,255,255,0.5)',
    shadow: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(0,0,0,0.4)',
  };

  const codeStyle: React.CSSProperties = {
    background: isLight ? '#f4f5f7' : '#18181b',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    border: `1px solid ${c.cardBorder}`
  };

  const EndpointText = ({ method, path, style, label }: { method: string, path: string, style?: React.CSSProperties, label?: React.ReactNode }) => {
    const cleanPath = path.trim();
    const rawUrl = `${baseUrl}${cleanPath.startsWith('/') ? cleanPath : '/' + cleanPath}`;
    const fullUrl = rawUrl.replace(/([^:]\/)\/+/g, '$1');

    return (
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12, gap: 12, flexWrap: 'wrap', ...style }}>
        <Tag color={method === 'POST' ? 'green' : method === 'DELETE' ? 'red' : method === 'PUT' ? 'orange' : 'blue'} style={{ width: 70, textAlign: 'center', margin: 0 }}>{method}</Tag>
        {label && <Text type="secondary" style={{ minWidth: 180 }}>{label}</Text>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: isLight ? '#f4f5f7' : '#18181b', padding: '2px 8px', borderRadius: 4, border: `1px solid ${c.cardBorder}` }}>
          <Text style={{ fontFamily: 'monospace', fontSize: 13, margin: 0 }}>{fullUrl}</Text>
          <Tooltip title={isEn ? "Copy URL" : "复制链接"}>
            <Button
              type="text"
              icon={<CopyOutlined style={{ color: '#1677ff' }} />}
              size="small"
              style={{ width: 22, height: 22, minWidth: 22, padding: 0 }}
              onClick={() => {
                navigator.clipboard.writeText(fullUrl);
                message.success(isEn ? "Copied!" : "已复制！");
              }}
            />
          </Tooltip>
        </div>
      </div>
    );
  };


  const menuItems = [
    { key: 'endpoints', label: isEn ? 'Endpoints Overview' : '开放端点', icon: <ApiOutlined style={{ fontSize: 16 }} /> },
    { key: 'openai', label: isEn ? 'OpenAI Protocol' : 'OpenAI 协议', icon: <CodeOutlined style={{ fontSize: 16 }} /> },
    { key: 'volcengine', label: isEn ? 'Volcengine Native' : '火山原生协议', icon: <ThunderboltOutlined style={{ fontSize: 16 }} /> },
    { key: 'dashscope', label: isEn ? 'DashScope Native' : '阿里原生协议', icon: <CloudServerOutlined style={{ fontSize: 16 }} /> },
    { key: 'kling', label: isEn ? 'Kling Native' : '可灵原生协议', icon: <PlayCircleOutlined style={{ fontSize: 16 }} /> },
    { key: 'google', label: isEn ? 'Google Native' : 'Google 原生协议', icon: <GoogleOutlined style={{ fontSize: 16 }} /> },
    { key: 'anthropic', label: isEn ? 'Anthropic Native' : 'Anthropic 原生', icon: <RobotOutlined style={{ fontSize: 16 }} /> },
    { key: 'errors', label: isEn ? 'Error Codes' : '错误码', icon: <ExclamationCircleOutlined style={{ fontSize: 16 }} /> },
  ];

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
    localStorage.setItem('i18nextLng', lng);
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
        padding: '16px 20px',
        borderBottom: `1px solid ${c.cardBorder}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between'
      }}>
        <span style={{ color: c.text1, fontSize: 16, fontWeight: 500 }}>{_t('header.notifications', '通知')}</span>
      </div>
      <div style={{ maxHeight: 480, overflowY: 'auto', padding: announcements.length > 0 ? '16px' : '60px 20px' }}>
        {announcements.length > 0 ? (
          <List
            itemLayout="vertical"
            dataSource={announcements}
            split={false}
            renderItem={(item) => (
              <div style={{ background: isLight ? '#f9fafb' : 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 16, marginBottom: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    {item.is_pinned === 1 && (
                      <div style={{ background: 'rgba(22, 119, 255, 0.1)', color: '#1677ff', fontSize: 12, padding: '2px 6px', borderRadius: 4 }}>
                        {_t('common.pinned', '置顶')}
                      </div>
                    )}
                    <div style={{ color: c.text1, fontSize: 15, fontWeight: 500 }}>{item.title}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: c.text3, fontSize: 12 }}>
                    <ScheduleOutlined />
                    {new Date(item.created_at).toLocaleString()}
                  </div>
                </div>
                <div dangerouslySetInnerHTML={{ __html: item.content }} style={{ color: c.text2, fontSize: 13, lineHeight: 1.6 }} />
              </div>
            )}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <BellOutlined style={{ fontSize: 64, color: isLight ? '#e5e7eb' : 'rgba(255,255,255,0.1)', marginBottom: 24 }} />
            <div style={{ color: c.text1, fontSize: 15, fontWeight: 500, marginBottom: 8 }}>{_t('header.no_notifications', '没有通知')}</div>
          </div>
        )}
      </div>
    </div>
  );

  // 渲染端点列表过滤器
  const [endpointFilterType, setEndpointFilterType] = useState<string>('all');
  const filteredEndpoints = useMemo(() => {
    if (endpointFilterType === 'all') return endpoints;
    return endpoints.filter(e => e.type === endpointFilterType);
  }, [endpointFilterType, endpoints]);

  return (
    <Layout style={{ height: '100vh', overflow: 'hidden', background: c.bg }}>
      {/* 左侧侧边栏 */}
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        breakpoint="lg"
        onBreakpoint={(broken) => {
          if (broken) setCollapsed(true);
        }}
        width={240}
        collapsedWidth={screens.xs ? 0 : 80}
        style={{
          background: c.siderBg,
          borderRight: `1px solid ${c.cardBorder}`,
          zIndex: 100,
          boxShadow: `2px 0 8px ${c.shadow}`,
          position: screens.xs ? 'fixed' : 'relative',
          height: '100%',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Logo 与站点名 */}
          <div
            style={{
              height: 56,
              display: 'flex',
              alignItems: 'center',
              padding: '0 20px',
              borderBottom: `1px solid ${c.cardBorder}`,
              cursor: 'pointer'
            }}
            onClick={() => navigate('/dashboard')}
          >
            {siteLogo ? (
              <img src={siteLogo} alt="logo" style={{ width: 28, height: 28, objectFit: 'contain', marginRight: collapsed ? 0 : 12 }} />
            ) : (
              <RocketOutlined style={{ fontSize: 24, color: '#1677ff', marginRight: collapsed ? 0 : 12 }} />
            )}
            {!collapsed && (
              <span style={{ color: c.text1, fontWeight: 700, fontSize: 16, letterSpacing: 0.5 }}>
                {siteName}
              </span>
            )}
          </div>

          {/* 菜单列表 */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 8px' }}>
            <Menu
              mode="inline"
              selectedKeys={[selectedMenuKey]}
              onClick={({ key }) => {
                setSelectedMenuKey(key);
                if (screens.xs) setCollapsed(true);
              }}
              style={{ border: 'none', background: 'transparent' }}
              items={menuItems.map(item => ({
                key: item.key,
                icon: item.icon,
                label: collapsed ? null : item.label,
              }))}
            />
          </div>
        </div>
      </Sider>

      {/* 右侧主体布局 */}
      <Layout>
        {/* 顶部 Header */}
        <Header
          style={{
            background: c.siderBg,
            height: 56,
            lineHeight: '56px',
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: `1px solid ${c.cardBorder}`,
            boxShadow: `0 1px 4px ${c.shadow}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              style={{ fontSize: 16, color: c.text1 }}
            />
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
                    <path d="M12 2L19.5 6.2L12 10.5L4.5 6.2Z" fill={isLight ? '#757575' : '#9e9e9e'} />
                    <path d="M3.5 7.8L11 12V21L3.5 16.8Z" fill={isLight ? '#b0b0b0' : '#555555'} />
                    <path d="M13 12L20.5 7.8V16.8L13 21Z" fill={isLight ? '#757575' : '#9e9e9e'} />
                  </svg>
                }
                style={{ color: c.text1, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40 }}
                onClick={() => window.open('/models', '_blank')}
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
              <Tooltip title={isEn ? 'Notifications' : '通知'} placement="bottom">
                <Badge count={announcements.length} overflowCount={99} offset={[-4, 4]} className="header-badge">
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
                  />
                </Badge>
              </Tooltip>
            </Popover>

            <UserAvatarMenu isUserEnd={true} agreement={agreement} />
          </Space>
        </Header>

        {/* 详细内容区 */}
        <Content style={{ padding: '24px', overflowY: 'auto', background: c.bg }}>
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>

            {/* 1. 开放端点 (endpoints) */}
            {selectedMenuKey === 'endpoints' && (
              <Space direction="vertical" size={24} style={{ width: '100%' }}>
                <Alert
                  message={isEn ? "Unified Authentication & Intelligent Dispatching System" : "统一认证与智能调度计费系统"}
                  description={isEn
                    ? "This gateway is compatible with native protocols from OpenAI, Google Gemini, Volcengine, Anthropic, Kling AI, etc. By using the Token issued to you, channel dispatching, protocol conversion, logging and billing are all automatically and intelligently handled by the platform."
                    : "本网关兼容 OpenAI、Google Gemini、火山方舟、Anthropic、可灵 AI 等多家厂商原生协议。只需使用您颁发的请求令牌（Token），渠道自动调度、协议自动转换、日志计费等均由平台全权智能处理。"}
                  type="info"
                  showIcon
                  style={{ borderRadius: 8 }}
                />

                <Card variant="borderless" style={{ background: c.cardBg, borderColor: c.cardBorder }} title={<><InfoCircleOutlined /> {isEn ? 'Base URL & Authentication' : '基础地址与鉴权方式'}</>}>
                  <Paragraph>
                    <Text strong>Base URL: </Text>
                    <Text code copyable>{baseUrl}</Text>
                  </Paragraph>
                  <Divider style={{ margin: '12px 0' }} />
                  <Paragraph style={{ marginBottom: 0 }}>
                    <Text strong>{isEn ? 'Authentication Method (For all requests):' : '鉴权方式 (适用于所有请求):'}</Text>
                    <ul style={{ marginTop: 8 }}>
                      <li><Text code>Authorization: Bearer sk-xxx</Text> {isEn ? '(Recommended standard, applicable to all protocols)' : '（通用推荐标准，适用于所有协议）'}</li>
                      <li>{isEn ? 'Google Compatible:' : 'Google 兼容透传:'} <Text code>X-Goog-Api-Key: sk-xxx</Text> {isEn ? 'or appended in URL' : '或 URL 尾部'} <Text code>?key=sk-xxx</Text></li>
                    </ul>
                  </Paragraph>
                </Card>

                <Card
                  variant="borderless"
                  style={{ background: c.cardBg, borderColor: c.cardBorder }}
                  title={<><CodeOutlined /> {isEn ? 'Available Endpoints Overview' : '开放端点一览'}</>}
                >
                  <Tabs
                    activeKey={endpointFilterType}
                    onChange={setEndpointFilterType}
                    items={[
                      { key: 'all', label: isEn ? 'All' : '全部端点' },
                      { key: 'openai', label: isEn ? 'OpenAI compatible' : 'OpenAI 协议' },
                      { key: 'volcengine', label: isEn ? 'Volcengine native' : '火山原生' },
                      { key: 'dashscope', label: isEn ? 'DashScope native' : '阿里原生' },
                      { key: 'kling', label: isEn ? 'Kling native' : '可灵原生' },
                      { key: 'google', label: isEn ? 'Google Native' : 'Google 原生' },
                      { key: 'anthropic', label: isEn ? 'Anthropic Native' : 'Anthropic 原生' },
                    ]}
                    style={{ marginBottom: 16 }}
                  />
                  <div style={{ maxHeight: 600, overflowY: 'auto' }}>
                    {filteredEndpoints.map((item) => (
                      <EndpointText key={item.path + item.method} method={item.method} path={item.path} label={item.label} />
                    ))}
                  </div>
                </Card>
              </Space>
            )}

            {/* 2. OpenAI 协议 (openai) */}
            {selectedMenuKey === 'openai' && (
              <Card variant="borderless" style={{ background: c.cardBg, borderColor: c.cardBorder }} title={<><CodeOutlined /> {isEn ? 'OpenAI Protocol Guide' : 'OpenAI 协议指南'}</>}>
                <Tabs
                  defaultActiveKey="openai-chat"
                  items={[
                    {
                      key: 'openai-chat',
                      label: isEn ? 'Chat Completions' : '聊天与响应',
                      children: (
                        <div style={{ marginTop: 16 }}>
                          <Title level={5}>{isEn ? 'Chat Completions' : '聊天接口 (Chat Completions)'}</Title>
                          <EndpointText method="POST" path="/v1/chat/completions" label={isEn ? 'Chat completions' : '聊天（OpenAI 兼容格式）'} />
                          <Descriptions column={1} bordered size="small" style={{ marginBottom: 16 }}>
                            <Descriptions.Item label={isEn ? "model (Required)" : "model (必填)"}>
                              {isEn ? 'Target model name, e.g. "gpt-4o", "gemini-2.0-flash", "claude-sonnet-4-20250514"' : '目标模型名称，如 "gpt-4o"、"gemini-2.0-flash"、"claude-sonnet-4-20250514"'}
                            </Descriptions.Item>
                            <Descriptions.Item label={isEn ? "messages (Required)" : "messages (必填)"}>
                              {isEn ? 'Message array [{"role": "system"|"user"|"assistant", "content": "..."}]' : '消息数组 [{"role": "system"|"user"|"assistant", "content": "..."}]'}
                            </Descriptions.Item>
                            <Descriptions.Item label={isEn ? "stream (Optional)" : "stream (选填)"}>
                              {isEn ? 'true/false — Enable SSE streaming response (default: false)' : 'true/false — 启用后以 SSE 流式逐字返回（默认 false）'}
                            </Descriptions.Item>
                            <Descriptions.Item label={isEn ? "temperature (Optional)" : "temperature (选填)"}>
                              {isEn ? 'Sampling temperature 0~2, larger values make the output more random (default: 1)' : '采样温度 0~2，值越大输出越随机（默认 1）'}
                            </Descriptions.Item>
                            <Descriptions.Item label={isEn ? "top_p (Optional)" : "top_p (选填)"}>
                              {isEn ? 'Nucleus sampling threshold 0~1 (default: 1)' : '核采样概率阈值 0~1（默认 1）'}
                            </Descriptions.Item>
                            <Descriptions.Item label={isEn ? "max_tokens (Optional)" : "max_tokens (选填)"}>
                              {isEn ? 'Maximum tokens to generate (default is determined by model)' : '最大生成 Token 数量（默认由模型决定）'}
                            </Descriptions.Item>
                            <Descriptions.Item label={isEn ? "tools (Optional)" : "tools (选填)"}>
                              {isEn ? 'List of tools/functions the model may call' : '模型可调用的工具（如函数调用 Function Calling）列表'}
                            </Descriptions.Item>
                            <Descriptions.Item label={isEn ? "tool_choice (Optional)" : "tool_choice (选填)"}>
                              {isEn ? 'Controls which tool is called by the model' : '控制模型是否/如何调用工具（如 "auto", "none" 等）'}
                            </Descriptions.Item>
                            <Descriptions.Item label={isEn ? "response_format (Optional)" : "response_format (选填)"}>
                              {isEn ? 'Specifies the response format, e.g. { "type": "json_object" }' : '指定响应格式，例如强制返回 JSON：{ "type": "json_object" }'}
                            </Descriptions.Item>
                            <Descriptions.Item label={isEn ? "presence_penalty (Optional)" : "presence_penalty (选填)"}>
                              {isEn ? 'Number between -2.0 and 2.0 to penalize new tokens based on whether they appear in the text so far' : '存在惩罚 (-2.0 ~ 2.0)，基于新 Token 是否已出现进行惩罚'}
                            </Descriptions.Item>
                            <Descriptions.Item label={isEn ? "frequency_penalty (Optional)" : "frequency_penalty (选填)"}>
                              {isEn ? 'Number between -2.0 and 2.0 to penalize new tokens based on their existing frequency' : '频率惩罚 (-2.0 ~ 2.0)，基于新 Token 在文本中的现有频率进行惩罚'}
                            </Descriptions.Item>
                            <Descriptions.Item label={isEn ? "stop (Optional)" : "stop (选填)"}>
                              {isEn ? 'Up to 4 sequences where the API will stop generating' : '停止词，最高支持 4 个字符串组，遇到即停止生成'}
                            </Descriptions.Item>
                            <Descriptions.Item label={isEn ? "logprobs (Optional)" : "logprobs (选填)"}>
                              {isEn ? 'Whether to return log probabilities of the output tokens (true/false)' : '是否返回输出 token 的对数概率 (true/false)'}
                            </Descriptions.Item>
                            <Descriptions.Item label={isEn ? "top_logprobs (Optional)" : "top_logprobs (选填)"}>
                              {isEn ? 'Number of most likely tokens to return at each token position' : '每个位置返回最可能 token 的数量（必须搭配 logprobs=true）'}
                            </Descriptions.Item>
                          </Descriptions>
                          <Alert
                            message={isEn ? "Protocol Conversion" : "协议自动转换"}
                            description={isEn
                              ? "Whether the upstream is OpenAI / Gemini / Anthropic / Volcengine, the gateway will automatically convert the request format and normalize the response. You only need to use the standard OpenAI format."
                              : "协议自动转换：无论上游实际是 OpenAI / Gemini / Anthropic / 火山方舟，网关均会自动完成请求体格式转换与响应体标准化归一，调用方始终使用 OpenAI 格式即可。"}
                            type="info"
                            showIcon
                            style={{ marginBottom: 24, borderRadius: 8 }}
                          />

                          <Title level={5}>{isEn ? 'JSON Response Example (Non-streaming)' : 'JSON 响应示例（非流式）'}</Title>
                          <pre style={{ background: isLight ? '#f4f5f7' : '#18181b', color: c.text2, padding: 12, borderRadius: 6, fontSize: 12, overflow: 'auto', border: `1px solid ${c.cardBorder}`, marginBottom: 24 }}>{`{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "created": 1677652288,
  "model": "gpt-4o",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "你好！我是您的AI助理，有什么可以帮您的？"
    },
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 9,
    "completion_tokens": 12,
    "total_tokens": 21
  }
}`}</pre>

                          <Divider />
                          <Title level={5}>{isEn ? 'Responses API' : '响应接口 (Responses)'}</Title>
                          <EndpointText method="POST" path="/v1/responses" label={isEn ? 'Responses API' : '响应接口 (Responses)'} />
                          <Paragraph type="secondary" style={{ marginBottom: 16 }}>
                            {isEn
                              ? "The Responses API is used to interact with models using OpenAI Response format. It passes the raw request payload directly to the upstream model without structure modification."
                              : "响应接口（Responses）可以直接向底层模型发送官方原生的 Response Payload，网关将透传至上游通道，同时复用已有的额度计费和日志系统。"}
                          </Paragraph>
                          <Descriptions column={1} bordered size="small" style={{ marginBottom: 24 }}>
                            <Descriptions.Item label={isEn ? "model (Required)" : "model (必填)"}>
                              {isEn ? 'The model name, e.g. "gpt-4o", "doubao-pro"' : '目标模型名称，如 "gpt-4o"、"doubao-pro"'}
                            </Descriptions.Item>
                            <Descriptions.Item label={isEn ? "input (Required)" : "input (必填)"}>
                              {isEn ? 'The input content, can be string or object array.' : '输入内容，可以是文本字符串，也可以是包含消息对象的数组。'}
                            </Descriptions.Item>
                            <Descriptions.Item label={isEn ? "stream (Optional)" : "stream (选填)"}>
                              {isEn ? 'true/false — Enable SSE streaming response (default: false)' : 'true/false — 是否以 SSE 流式输出返回（默认 false）'}
                            </Descriptions.Item>
                          </Descriptions>
                        </div>
                      )
                    },
                    {
                      key: 'openai-image',
                      label: isEn ? 'Image Generation' : '图像生成',
                      children: (
                        <div style={{ marginTop: 16 }}>
                          <Alert
                            message={isEn ? "Image Generation API Compatibility" : "生图接口兼容与自动转译"}
                            description={isEn
                              ? "Fully compatible with OpenAI standard image generation. Upstream channels like Dall-E, Gemini, Volcengine, Tencent VOD AIGC, and Jimeng AI are automatically routed, converted, and billed."
                              : "完美兼容 OpenAI 标准生图接口。后端自动适配与路由 Dall-E、Gemini、火山方舟、腾讯云 VOD AIGC、即梦 AI 等多方生图通道，并实现自动按张扣费结算。"}
                            type="info"
                            showIcon
                            style={{ marginBottom: 16, borderRadius: 8 }}
                          />
                          <Title level={5}>{isEn ? 'Image Generations' : '图像接口 (Image Generations)'}</Title>
                          <EndpointText method="POST" path="/v1/images/generations" label={isEn ? 'Image Generations' : '图片生成'} />
                          <EndpointText method="GET" path="/v1/tasks/{task_id}?model=xxx" label={isEn ? 'Query async image results' : '轮询异步图片结果（兼容上游异步生图模型，如可灵等）'} />
                          <EndpointText method="POST" path="/v1/images/edits" label={isEn ? 'OpenAI Image Edits (Image + Mask/Prompt)' : 'OpenAI 图像编辑（参考底图 + 蒙版遮罩 + 提示词引导修改）'} />

                          <Descriptions column={1} bordered size="small" style={{ marginBottom: 16 }}>
                            <Descriptions.Item label={isEn ? "model (Required)" : "model (必填)"}>
                              {isEn ? 'Model name, e.g. "dall-e-3", "gemini-2.0-flash", "seedream-5.0-lite"' : '模型名称，如 "dall-e-3"、"gemini-2.0-flash"、"seedream-5.0-lite"'}
                            </Descriptions.Item>
                            <Descriptions.Item label={isEn ? "prompt (Required)" : "prompt (必填)"}>
                              {isEn ? 'Text prompt for image generation' : '图像生成的提示词描述文本'}
                            </Descriptions.Item>
                            <Descriptions.Item label={isEn ? "n (Optional)" : "n (选填)"}>
                              <Text>{isEn ? 'Number of images to generate (default: 1). Auto-converted by gateway to upstream parameters:' : '生成图片数量（默认 1）。网关自动转换为上游厂商原生参数：'}</Text>
                              <ul style={{ marginTop: 4, marginBottom: 0, paddingLeft: 20 }}>
                                <li><Text type="secondary">{isEn ? 'Volcengine: auto sets sequential_image_generation: "auto" + max_images = n when n > 1' : '火山方舟：n > 1 时自动设置 sequential_image_generation: "auto" + sequential_image_generation_options.max_images = n'}</Text></li>
                                <li><Text type="secondary">{isEn ? 'Google Gemini: auto converted to generationConfig.candidateCount = n' : 'Google Gemini：自动转为 generationConfig.candidateCount = n'}</Text></li>
                                <li><Text type="secondary">{isEn ? 'DashScope (Ali): n passed through directly' : '阿里百炼 (DashScope)：n 保持原样'}</Text></li>
                              </ul>
                            </Descriptions.Item>
                            <Descriptions.Item label={isEn ? "watermark (Optional)" : "watermark (选填)"}>
                              {isEn ? 'true/false — Add watermark (supported by Volcengine/DashScope)' : 'true/false — 是否在图片上添加水印标识（火山/阿里模型均支持）'}
                            </Descriptions.Item>
                            <Descriptions.Item label={isEn ? "size (Optional)" : "size (选填)"}>
                              {isEn ? 'Resolution (e.g. "1024x1024"). DashScope maps to 1024*1024; Gemini maps to imageSize' : '图片分辨率（例："1024x1024"）。阿里模型自动转为 1024*1024；Gemini 自动转为 imageSize'}
                            </Descriptions.Item>
                            <Descriptions.Item label={isEn ? "ratio (Optional)" : "ratio (选填)"}>
                              {isEn ? 'Aspect ratio (e.g. "16:9", "1:1"). Gemini maps to aspectRatio' : '图片宽高比（例："16:9"、"1:1"）。Gemini 自动转为 aspectRatio'}
                            </Descriptions.Item>
                            <Descriptions.Item label={isEn ? "image (Optional)" : "image (选填)"}>
                              {isEn ? 'Reference image URL (OpenAI extension). DashScope maps it to input.messages for image-to-image.' : '参考图 URL (OpenAI 协议扩展)。阿里百炼等模型自动将其封装进 input.messages 用于图生图或参考生图模式。'}
                            </Descriptions.Item>
                            <Descriptions.Item label={isEn ? "image_urls (Optional)" : "image_urls (选填)"}>
                              <Text>{isEn ? 'Array of reference image URLs — behaves the same as "image". Supports multiple URLs.' : '参考图 URL 数组 — 效果与 image 相同，用于兼容其他 OpenAI 平台的参数命名。支持传入多张图片 URL。'}</Text>
                              <br />
                              <Text type="secondary">{isEn ? 'Example:' : '示例：'}<Text code>{`["https://example.com/a.png", "https://example.com/b.png"]`}</Text></Text>
                            </Descriptions.Item>
                            <Descriptions.Item label={isEn ? "prompt_extend (Optional)" : "prompt_extend (选填)"}>
                              {isEn ? 'true/false — DashScope specific: whether to enable prompt rewriting (default: false)' : 'true/false — 阿里百炼特有：是否启用提示词智能改写（默认 false）'}
                            </Descriptions.Item>
                            <Descriptions.Item label={isEn ? "stream (Optional)" : "stream (选填)"}>
                              {isEn ? 'true/false — Supported by Gemini: gateway parses SSE stream to extract images' : 'true/false — 部分原生支持流式的模型（如 Gemini）可启用，网关自动解析 SSE 流提取图像'}
                            </Descriptions.Item>
                            <Descriptions.Item label={isEn ? "web_search (Optional)" : "web_search (选填)"}>
                              {isEn ? 'true/false — Web search (same conversion as Chat Completions)' : 'true/false — 联网搜索，转换规则同聊天接口'}
                            </Descriptions.Item>
                            <Descriptions.Item label={isEn ? "Other parameters" : "其他透传参数"}>
                              <Text type="secondary">{isEn ? 'Passed directly to upstream:' : '以下参数原封不动透传至上游：'}</Text>
                              <ul style={{ marginTop: 4, marginBottom: 0, paddingLeft: 20 }}>
                                <li><Text code>quality</Text>: {isEn ? 'Image quality level ("standard", "hd")' : '图片质量级别（例："standard", "hd"）'}</li>
                                <li><Text code>style</Text>: {isEn ? 'Art style ("vivid", "natural")' : '艺术渲染风格（例："vivid", "natural"）'}</li>
                                <li><Text code>response_format</Text>: {isEn ? 'Response format ("url", "b64_json")' : '返回格式（例："url", "b64_json"）'}</li>
                                <li>{isEn ? 'As well as any official extension parameters like seed...' : '以及任何上游厂商官方定义的扩展参数 (如阿里 seed) …'}</li>
                              </ul>
                            </Descriptions.Item>
                          </Descriptions>

                          <Title level={5}>{isEn ? 'JSON Response Example' : 'JSON 响应示例（直接返回 URL）'}</Title>
                          <pre style={{ background: isLight ? '#f4f5f7' : '#18181b', color: c.text2, padding: 12, borderRadius: 6, fontSize: 12, overflow: 'auto', border: `1px solid ${c.cardBorder}`, marginBottom: 16 }}>{`{
  "created": 1677652288,
  "data": [
    {
      "url": "https://example.com/generated_image_1.png"
    }
  ]
}`}</pre>

                          <Title level={5}>{isEn ? 'Async Task Submission Response' : '异步任务提交成功响应（针对部分需轮询的图片模型通道）'}</Title>
                          <pre style={{ background: isLight ? '#f4f5f7' : '#18181b', color: c.text2, padding: 12, borderRadius: 6, fontSize: 12, overflow: 'auto', border: `1px solid ${c.cardBorder}` }}>{`{
  "id": "task_abc123xyz789",
  "task_id": "task_abc123xyz789",
  "status": "pending"
}`}</pre>
                        </div>
                      )
                    },
                    {
                      key: 'openai-video',
                      label: isEn ? 'Video Generation' : '视频生成',
                      children: (
                        <div style={{ marginTop: 16 }}>
                          <Alert
                            message={isEn ? "Video Generation API Compatibility" : "视频生成接口兼容与自动转译"}
                            description={isEn
                              ? "Fully compatible with OpenAI standard video generation. Upstream channels like Volcengine, Kling AI, DashScope, Tencent VOD AIGC, Jimeng AI, and Bytefor are automatically routed, converted, and billed."
                              : "完美兼容 OpenAI 标准视频生成接口。后端自动适配与路由火山方舟、可灵 AI、阿里百炼、腾讯云 VOD AIGC、即梦 AI、Bytefor 等视频通道，自动处理异步任务提交与轮询结算。"}
                            type="info"
                            showIcon
                            style={{ marginBottom: 16, borderRadius: 8 }}
                          />
                          <Title level={5}>{isEn ? 'Video Generations' : '视频接口 (Video Generations)'}</Title>
                          <EndpointText method="POST" path="/v1/video/generations" label={isEn ? 'Submit async task' : '提交异步任务'} />
                          <EndpointText method="GET" path="/v1/video/generations/{task_id}?model=xxx" label={isEn ? 'Query task result (model parameter optional, also supports /v1/tasks/{task_id})' : '轮询查询结果（model 参数选填，兼容 /v1/tasks/{task_id}）'} />

                          <Descriptions column={1} bordered size="small" title={<Text strong style={{ fontSize: 13 }}>{isEn ? 'Core Parameters' : '核心参数'}</Text>} style={{ marginBottom: 24 }}>
                            <Descriptions.Item label={isEn ? "model (Required)" : "model (必填)"}>
                              {isEn ? 'Video model name, e.g. "doubao-seedance-2-0", "kling-v3-omni", "wanx-v1", "jimeng_video", "bytefor_video"' : '视频生成模型名称，如 "doubao-seedance-2-0" (火山方舟), "kling-v3-omni" (可灵), "wanx-v1" (阿里百炼万相视频), "jimeng_video" (即梦视频), "bytefor_video"'}
                            </Descriptions.Item>
                            <Descriptions.Item label={isEn ? "prompt (Required)" : "prompt (必填)"}>
                              {isEn ? 'Text prompt describing the video' : '视频生成的提示词描述文本'}
                            </Descriptions.Item>
                            <Descriptions.Item label={isEn ? "images (Optional)" : "images (选填)"}>
                              <Text>{isEn ? 'Reference images array supporting two formats:' : '参考图片数组，支持两种格式：'}</Text>
                              <ul style={{ marginTop: 4, marginBottom: 4, paddingLeft: 20 }}>
                                <li><Text type="secondary">{isEn ? 'Simple Mode:' : '简单模式：'}</Text> <Text code>["url1", "url2"]</Text>
                                  <Text type="secondary"> {isEn ? '— Auto-inferred role by count (1=first_frame, 2=first & last frame, 3+=reference)' : '— 系统按数量自动推断 role（1张=首帧，2张=首尾帧，3+张=参考图）'}</Text></li>
                                <li><Text type="secondary">{isEn ? 'Precise Mode:' : '精确模式：'}</Text> <Text code>[{'{"url": "...", "role": "first_frame"}'}]</Text>
                                  <Text type="secondary"> {isEn ? '— Explicitly specify role for each image' : '— 显式指定每张图的 role'}</Text></li>
                              </ul>
                              <Text type="secondary">{isEn ? 'role values: first_frame | last_frame | reference_image' : 'role 可选值：first_frame（首帧）| last_frame（尾帧）| reference_image（参考图）'}</Text>
                            </Descriptions.Item>
                            <Descriptions.Item label={isEn ? "image_urls (Optional)" : "image_urls (选填)"}>
                              <Text>{isEn ? 'Array of reference image URLs — behaves the same as "images". Supports multiple URLs.' : '参考图 URL 数组 — 效果与 images 相同，用于兼容部分客户端/OpenAI生态。支持传入多张图片 URL。'}</Text>
                            </Descriptions.Item>
                            <Descriptions.Item label={isEn ? "videos (Optional)" : "videos (选填)"}>
                              {isEn ? 'Reference videos array, same format as images' : '参考视频数组，格式同 images'}
                              <br />
                              <Text type="secondary">{isEn ? 'role values: reference_video (default)' : 'role 可选值：reference_video（默认值）'}</Text>
                            </Descriptions.Item>
                            <Descriptions.Item label={isEn ? "audios (Optional)" : "audios (选填)"}>
                              {isEn ? 'Reference audios array, same format as images' : '参考音频数组，格式同 images'}
                              <br />
                              <Text type="secondary">{isEn ? 'role values: reference_audio (default)' : 'role 可选值：reference_audio（默认值）'}</Text>
                            </Descriptions.Item>
                          </Descriptions>

                          <Descriptions column={2} bordered size="small" title={<Text strong style={{ fontSize: 13 }}>{isEn ? 'Video Control Parameters (Optional)' : '视频控制参数（全部选填，按需传入）'}</Text>} style={{ marginBottom: 24 }}>
                            <Descriptions.Item label={<Text code>resolution</Text>}>{isEn ? 'Resolution: 480p, 720p, 1080p (Kling 720p/480p maps to std, 1080p to pro, 4k to 4k)' : '分辨率：480p, 720p, 1080p（默认 720p。注：可灵模型 720p/480p 自动映射为 std，1080p 映射为 pro，4k 映射为 4k）'}</Descriptions.Item>
                            <Descriptions.Item label={<Text code>ratio</Text>}>{isEn ? 'Aspect ratio: 16:9, 4:3, 1:1, etc.' : '宽高比：16:9, 4:3, 1:1 等'}</Descriptions.Item>
                            <Descriptions.Item label={<Text code>duration</Text>}>{isEn ? 'Duration (seconds), e.g. 5, 10' : '视频时长（秒），如 5, 10'}</Descriptions.Item>
                            <Descriptions.Item label={<Text code>fps</Text>}>{isEn ? 'Frame rate' : '帧率'}</Descriptions.Item>
                            <Descriptions.Item label={<Text code>seed</Text>}>{isEn ? 'Random seed' : '随机种子（可复现结果）'}</Descriptions.Item>
                            <Descriptions.Item label={<Text code>generate_audio</Text>}>{isEn ? 'Whether to generate audio (true/false)' : '是否生成音频 (true/false)'}</Descriptions.Item>
                            <Descriptions.Item label={<Text code>return_last_frame</Text>}>{isEn ? 'Whether to return the last frame (true/false)' : '是否返回末帧 (true/false)'}</Descriptions.Item>
                            <Descriptions.Item label={<Text code>watermark</Text>}>{isEn ? 'Whether to add watermark (true/false)' : '是否添加水印 (true/false)'}</Descriptions.Item>
                            <Descriptions.Item label={<Text code>service_tier</Text>}>{isEn ? 'Service tier: "flex" (half-price offline) or "default" (online)' : '服务等级，如 flex (离线减半) 或 default (在线)'}</Descriptions.Item>
                            <Descriptions.Item label={<Text code>stream</Text>}>{isEn ? 'Whether to stream response (true/false)' : '是否流式返回 (true/false)'}</Descriptions.Item>
                            <Descriptions.Item label={<Text code>web_search</Text>}>{isEn ? 'Whether to enable web search (true/false)' : 'true/false — 是否启用联网搜索（转换规则同聊天）'}</Descriptions.Item>
                          </Descriptions>

                          <Title level={5}>{isEn ? 'Task Submit Response' : '视频任务提交成功响应'}</Title>
                          <pre style={{ background: isLight ? '#f4f5f7' : '#18181b', color: c.text2, padding: 12, borderRadius: 6, fontSize: 12, overflow: 'auto', border: `1px solid ${c.cardBorder}`, marginBottom: 16 }}>{`{
  "id": "video_task_12345678",
  "task_id": "video_task_12345678",
  "status": "pending",
  "code": 200,
  "message": "Task submitted successfully"
}`}</pre>

                          <Title level={5}>{isEn ? 'Task Query Complete Response' : '异步视频任务查询完成响应'}</Title>
                          <pre style={{ background: isLight ? '#f4f5f7' : '#18181b', color: c.text2, padding: 12, borderRadius: 6, fontSize: 12, overflow: 'auto', border: `1px solid ${c.cardBorder}` }}>{`{
  "id": "video_task_12345678",
  "task_id": "video_task_12345678",
  "status": "completed",
  "data": [
    {
      "url": "https://example.com/output_video.mp4"
    }
  ]
}`}</pre>
                        </div>
                      )
                    },
                    {
                      key: 'openai-tts',
                      label: isEn ? 'Text-to-Speech (TTS)' : '语音合成',
                      children: (
                        <div style={{ marginTop: 16 }}>
                          <Title level={5}>{isEn ? 'Speech Synthesis (TTS)' : '语音合成接口 (Text-to-Speech)'}</Title>
                          <EndpointText method="POST" path="/v1/audio/speech" label={isEn ? 'OpenAI compatible speech synthesis' : 'OpenAI 兼容语音合成（返回二进制音频流）'} />

                          <Descriptions column={1} bordered size="small" style={{ marginBottom: 16 }}>
                            <Descriptions.Item label={isEn ? "model (Required)" : "model (必填)"}>
                              {isEn ? 'TTS model name, e.g. "seed-tts-2.0", "tts-1"' : '语音合成模型名称，如 "seed-tts-2.0"（火山方舟）、"tts-1"（OpenAI）'}
                            </Descriptions.Item>
                            <Descriptions.Item label={isEn ? "input (Required)" : "input (必填)"}>
                              {isEn ? 'Text content to synthesize into speech' : '待合成为语音的文本内容'}
                            </Descriptions.Item>
                            <Descriptions.Item label={isEn ? "voice (Required)" : "voice (必填)"}>
                              {isEn ? 'Voice ID. For Volcengine use speaker ID like "zh_female_vv_uranus_bigtts"' : '音色标识。火山方舟填 speaker ID，如 "zh_female_vv_uranus_bigtts"'}
                            </Descriptions.Item>
                            <Descriptions.Item label={isEn ? "response_format (Optional)" : "response_format (选填)"}>
                              {isEn ? 'Audio format: mp3 (default), opus, aac, flac, wav, pcm' : '音频格式：mp3（默认）、opus、aac、flac、wav、pcm'}
                            </Descriptions.Item>
                            <Descriptions.Item label={isEn ? "speed (Optional)" : "speed (选填)"}>
                              {isEn ? 'Speed ratio 0.25~4.0 (default: 1.0)' : '语速倍率 0.25~4.0（默认 1.0）'}
                            </Descriptions.Item>
                          </Descriptions>
                          <Alert
                            message={isEn ? "Protocol Auto-Conversion" : "协议自动转换"}
                            description={isEn
                              ? "When the upstream is Volcengine TTS, the gateway automatically converts the OpenAI format request into Volcengine TTS V3 format, decodes the Base64 SSE response, and returns standard binary audio stream."
                              : "当上游为火山方舟 TTS 时，网关自动将 OpenAI 格式请求转换为火山 TTS V3 格式，解码 Base64 SSE 响应后返回 standard 二进制音频流。用量按上游返回的 text_words 计费，保证与官方一致。"}
                            type="info"
                            showIcon
                            style={{ borderRadius: 8 }}
                          />
                        </div>
                      )
                    },
                    {
                      key: 'openai-info',
                      label: isEn ? 'Inquiries' : '余额与模型',
                      children: (
                        <div style={{ marginTop: 16 }}>
                          <Title level={5}>{isEn ? 'Balance & Model List' : '余额及模型列表'}</Title>
                          <EndpointText method="GET" path="/v1/balance" label={isEn ? 'Query token balance' : '查询当前令牌的可用额度'} />
                          <EndpointText method="GET" path="/v1/user/balance" label={isEn ? 'Query overall user balance' : '查询令牌所属用户的账户总余额'} />
                          <EndpointText method="GET" path="/v1/models" label={isEn ? 'List enabled models' : '获取在模型广场启用的可用模型列表'} />


                          <Descriptions column={1} bordered size="small" title={<Text strong style={{ fontSize: 13 }}>{isEn ? 'Inquiry Fields' : '查询字段说明'}</Text>} style={{ marginBottom: 24, marginTop: 16 }}>
                            <Descriptions.Item label={isEn ? "Authentication" : "鉴权方式"}><Text code>Authorization: Bearer sk-xxx</Text></Descriptions.Item>
                            <Descriptions.Item label="remain_balance">{isEn ? 'Remaining balance' : '剩余可用额度（当无限配额时返回 -1）'}</Descriptions.Item>
                            <Descriptions.Item label="used_balance">{isEn ? 'Used balance' : '已使用额度'}</Descriptions.Item>
                            <Descriptions.Item label="unlimited_quota">{isEn ? 'true means unlimited' : 'true 表示该令牌/用户不受额度限制，可无限使用'}</Descriptions.Item>
                          </Descriptions>

                          <Title level={5}>{isEn ? 'Model List JSON Response' : '模型列表 JSON 响应示例'}</Title>
                          <pre style={{ background: isLight ? '#f4f5f7' : '#18181b', color: c.text2, padding: 12, borderRadius: 6, fontSize: 12, overflow: 'auto', border: `1px solid ${c.cardBorder}` }}>{`{
  "object": "list",
  "data": [
    {
      "id": "gpt-4o",
      "object": "model",
      "created": 1719441600,
      "owned_by": "OpenAI"
    }
  ]
}`}</pre>
                        </div>
                      )
                    }
                  ]}
                />
              </Card>
            )}

            {/* 3. 火山原生协议 (volcengine) */}
            {selectedMenuKey === 'volcengine' && (
              <Card variant="borderless" style={{ background: c.cardBg, borderColor: c.cardBorder }} title={<><ThunderboltOutlined /> {isEn ? 'Volcengine Native API' : '火山方舟原生接口'}</>}>
                <Tabs
                  defaultActiveKey="volc-chat"
                  items={[
                    {
                      key: 'volc-chat',
                      label: isEn ? 'Chat & Responses' : '聊天与响应',
                      children: (
                        <div style={{ marginTop: 16 }}>
                          <EndpointText method="POST" path="/api/v3/chat/completions" label={isEn ? 'Chat (OpenAI compatible format)' : '聊天（OpenAI 兼容格式）'} />
                          <EndpointText method="POST" path="/api/v3/responses" label={isEn ? 'Responses API (Native format)' : '响应接口（火山方舟原生格式）'} />

                          <Paragraph>{isEn ? 'Fully compatible with OpenAI / Volcengine native parameters, system automatically maps and handles billing.' : '请求体完全兼容 OpenAI 格式或火山方舟官方原生参数，网关接收后直接通往上游通道，并自动计费结算。'}</Paragraph>
                          <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>{isEn ? 'Official docs: ' : '官方文档：'}<a href="https://www.volcengine.com/docs/82379/1298454" target="_blank" rel="noreferrer">Volcengine Chat API</a></Text>
                          <Text type="secondary" style={{ display: 'block', marginTop: 4 }}>{isEn ? 'Official docs: ' : '官方文档：'}<a href="https://www.volcengine.com/docs/82379/1569618" target="_blank" rel="noreferrer">Volcengine Responses API</a></Text>
                        </div>
                      )
                    },
                    {
                      key: 'volc-image',
                      label: isEn ? 'Image Generation' : '图片生成',
                      children: (
                        <div style={{ marginTop: 16 }}>
                          <EndpointText method="POST" path="/api/v3/images/generations" label={isEn ? 'Image Generations' : '图片生成'} />

                          <Paragraph>{isEn ? 'Fully compatible with OpenAI native parameters, system automatically maps and handles billing.' : '请求体完全兼容 OpenAI 格式参数，网关接收后直接通往上游通道，并自动计费结算。'}</Paragraph>
                          <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>{isEn ? 'Official docs: ' : '官方文档：'}<a href="https://www.volcengine.com/docs/82379/1541523" target="_blank" rel="noreferrer">Volcengine Image API</a></Text>
                        </div>
                      )
                    },
                    {
                      key: 'volc-video',
                      label: isEn ? 'Video Generation' : '视频任务',
                      children: (
                        <div style={{ marginTop: 16 }}>
                          <EndpointText method="POST" path="/api/v3/contents/generations/tasks" label={isEn ? 'Video/Multimodal task submit' : '视频/多模态任务提交'} />
                          <EndpointText method="GET" path="/api/v3/contents/generations/tasks/{task_id}" label={isEn ? 'Async task status query' : '异步任务状态查询'} />
                          <EndpointText method="DELETE" path="/api/v3/contents/generations/tasks/{task_id}" label={isEn ? 'Cancel task' : '取消/删除视频任务'} />
                          <EndpointText method="GET" path="/api/v3/contents/generations/tasks" label={isEn ? 'Query video task list' : '查询视频任务列表'} />

                          <Text type="secondary" style={{ display: 'block', marginTop: 16 }}>{isEn ? 'Official docs: ' : '官方文档：'}<a href="https://www.volcengine.com/docs/82379/1520757" target="_blank" rel="noreferrer">Volcengine Video API</a></Text>
                        </div>
                      )
                    },
                    {
                      key: 'volc-tts',
                      label: isEn ? 'Speech Synthesis (TTS)' : '语音合成 (TTS)',
                      children: (
                        <div style={{ marginTop: 16 }}>
                          <EndpointText method="POST" path="/api/v3/tts/unidirectional/sse" label={isEn ? 'Speech synthesis (SSE stream)' : '语音合成（SSE 事件流）'} />
                          <EndpointText method="POST" path="/api/v3/tts/unidirectional" label={isEn ? 'Speech synthesis (HTTP Chunked)' : '语音合成（HTTP Chunked）'} />

                          <Paragraph>
                            {isEn ? 'Both return Base64-encoded audio data in JSON. Usage is billed by upstream text_words.' : '两种协议响应体均为 JSON 包裹的 Base64 音频数据，用量按上游 text_words 计费。'}
                          </Paragraph>
                          <Alert
                            message={isEn ? "TTS Native Headers & Routing" : "语音合成原生鉴权与路由"}
                            description={isEn ? 'TTS uses official X-Api-Key: sk-xxx header for authentication. Gateway supports passing model name in X-Api-Resource-Id header or directly inside request body model field.' : '语音合成接口请使用火山官方原生请求头 X-Api-Key: sk-xxx 进行鉴权。模型 ID 可通过 X-Api-Resource-Id 请求头指定（直通官方接入点），也可通过请求体中的 model 字段定位，均会被网关智能重写路由。'}
                            type="info"
                            showIcon
                            style={{ margin: '16px 0' }}
                          />
                          <Text type="secondary">{isEn ? 'Official docs: ' : '官方文档：'}<a href="https://www.volcengine.com/docs/6561/1598757?lang=zh" target="_blank" rel="noreferrer">Volcengine TTS V3</a></Text>
                        </div>
                      )
                    },
                    {
                      key: 'volc-models',
                      label: isEn ? 'Model List' : '模型列表',
                      children: (
                        <div style={{ marginTop: 16 }}>
                          <EndpointText method="GET" path="/api/v3/models" label={isEn ? 'List available models' : '获取可用模型列表'} />

                          <Paragraph>{isEn ? 'Returns official Volcengine compatible model list.' : '返回火山方舟官方兼容的模型列表。'}</Paragraph>
                        </div>
                      )
                    }
                  ]}
                />
                <Divider style={{ margin: '16px 0' }} />
                <Descriptions column={1} bordered size="small" title={<Text strong style={{ fontSize: 13 }}>{isEn ? 'Authentication & Headers' : '鉴权方式与请求头'}</Text>}>
                  <Descriptions.Item label={isEn ? "Authentication" : "鉴权说明"}>
                    {isEn
                      ? 'Except for TTS (which uses X-Api-Key), all other interfaces (Chat, Image, Video, Models) use Authorization: Bearer sk-xxx'
                      : '除语音合成接口（使用 X-Api-Key）外，聊天、响应、图片、视频、模型列表等其它所有接口均统一使用标准 Authorization: Bearer sk-xxx 请求头进行安全鉴权。'}
                  </Descriptions.Item>
                </Descriptions>
              </Card>
            )}

            {/* 4. 阿里原生协议 (dashscope) */}
            {selectedMenuKey === 'dashscope' && (
              <Card variant="borderless" style={{ background: c.cardBg, borderColor: c.cardBorder }} title={<><CloudServerOutlined /> {isEn ? 'DashScope (Ali) Native API' : '阿里百炼 (DashScope) 原生接口'}</>}>
                <Tabs
                  defaultActiveKey="ali-media"
                  items={[
                    {
                      key: 'ali-video',
                      label: isEn ? 'Video Generation' : '视频任务',
                      children: (
                        <div style={{ marginTop: 16 }}>
                          <EndpointText method="POST" path="/api/v1/services/aigc/video-generation/video-synthesis" label={isEn ? 'Video Submit' : '万相视频任务提交'} />
                          <EndpointText method="GET" path="/api/v1/tasks/{task_id}" label={isEn ? 'Query Async Task' : '异步任务状态查询'} />

                          <Descriptions column={1} bordered size="small" style={{ marginTop: 16 }}>
                            <Descriptions.Item label={isEn ? "Video Submit" : "视频任务提交"}>
                              {isEn
                                ? 'Supports official nesting format like {"input": {"prompt": "..."}, "parameters": {"resolution": "720P"}}.'
                                : '支持官方嵌套格式，形如 {"input": {"prompt": "..."}, "parameters": {"resolution": "720P"}}。网关自动拦截注入 X-DashScope-Async 请求头并进行异步结算。'}
                            </Descriptions.Item>
                            <Descriptions.Item label={isEn ? "Async Polling" : "异步任务轮询"}>
                              {isEn
                                ? 'Use task_id returned from submit response. Gateway auto-checks status and processes deduction upon completion.'
                                : '使用原生 task_id 进行 GET 轮询。网关自动维护任务状态（succeeded/failed），并在任务成功时提取用量完成扣费。'}
                            </Descriptions.Item>
                          </Descriptions>
                          <Text type="secondary" style={{ display: 'block', marginTop: 16 }}>{isEn ? 'Official docs: ' : '官方文档：'}<a href="https://help.aliyun.com/zh/model-studio/happyhorse-text-to-video-api-reference" target="_blank" rel="noreferrer">DashScope Video API</a></Text>
                        </div>
                      )
                    },
                    {
                      key: 'ali-image',
                      label: isEn ? 'Image Generation' : '图片生成',
                      children: (
                        <div style={{ marginTop: 16 }}>
                          <EndpointText method="POST" path="/api/v1/services/aigc/multimodal-generation/generation" label={isEn ? 'Image Submit' : '万相生图任务提交'} />
                          <EndpointText method="GET" path="/api/v1/tasks/{task_id}" label={isEn ? 'Query Async Task' : '异步任务状态查询'} />

                          <Descriptions column={1} bordered size="small" style={{ marginTop: 16 }}>
                            <Descriptions.Item label={isEn ? "Image Generation" : "图像任务提交"}>
                              {isEn
                                ? 'Supports official nesting format like {"model": "wanx-v1", "input": {"prompt": "..."}, "parameters": {"size": "1024*1024"}}.'
                                : '完全兼容阿里百炼官方 input 与 parameters 嵌套格式。支持传入 seed、size 等厂商控制参数。'}
                            </Descriptions.Item>
                            <Descriptions.Item label={isEn ? "Async Polling" : "异步任务轮询"}>
                              {isEn
                                ? 'Use task_id returned from submit response. Gateway auto-checks status and processes deduction upon completion.'
                                : '使用原生 task_id 进行 GET 轮询。网关自动维护任务状态（succeeded/failed），并在任务成功时提取用量完成扣费。'}
                            </Descriptions.Item>
                          </Descriptions>
                          <Text type="secondary" style={{ display: 'block', marginTop: 16 }}>{isEn ? 'Official docs: ' : '官方文档：'}<a href="https://help.aliyun.com/zh/model-studio/qwen-image-api" target="_blank" rel="noreferrer">DashScope Image API</a></Text>
                        </div>
                      )
                    },
                    {
                      key: 'ali-embed',
                      label: isEn ? 'Embeddings & Rerank' : '向量与重排',
                      children: (
                        <div style={{ marginTop: 16 }}>
                          <EndpointText method="POST" path="/compatible-mode/v1/embeddings" label={isEn ? 'Embeddings' : '文本向量化（OpenAI兼容）'} />
                          <EndpointText method="POST" path="/compatible-api/v1/reranks" label={isEn ? 'Rerank (Compatible)' : '文档重排序（兼容模式，如 qwen3-rerank）'} />
                          <EndpointText method="POST" path="/api/v1/services/rerank/text-rerank/text-rerank" label={isEn ? 'Rerank (Native)' : '文档重排序（原生模式，如 gte-rerank-v2）'} />


                          <Descriptions column={1} bordered size="small" style={{ marginTop: 16, marginBottom: 16 }}>
                            <Descriptions.Item label={isEn ? "Text Embedding" : "文本向量接口"}>
                              {isEn
                                ? 'Convert text into vector representations. Billed by response usage.prompt_tokens.'
                                : '支持 text-embedding-v4 / text-embedding-v3 等模型，按 tokens 计费。输入格式与 OpenAI Embeddings 协议一致。'}
                            </Descriptions.Item>
                            <Descriptions.Item label={isEn ? "Document Rerank" : "重排序接口"}>
                              {isEn
                                ? 'Rerank documents by relevance. qwen3-rerank uses compatible mode path; gte-rerank-v2 uses native mode path.'
                                : '支持 qwen3-rerank（走兼容路径 /compatible-api/v1/reranks）和 gte-rerank-v2（走原生路径 /api/v1/services/rerank/text-rerank/text-rerank），按总 tokens 计费。'}
                            </Descriptions.Item>
                          </Descriptions>


                          <Text type="secondary" style={{ display: 'block', marginTop: 16 }}>{isEn ? 'Official docs: ' : '官方文档：'}<a href="https://help.aliyun.com/zh/dashscope/developer-reference/text-embedding-api-details" target="_blank" rel="noreferrer">DashScope Embeddings</a></Text>
                          <Text type="secondary" style={{ display: 'block', marginTop: 16 }}>{isEn ? 'Official docs: ' : '官方文档：'}<a href="https://help.aliyun.com/zh/model-studio/text-rerank-api" target="_blank" rel="noreferrer">DashScope Rerank API</a></Text>
                        </div>
                      )
                    }
                  ]}
                />
                <Divider style={{ margin: '16px 0' }} />
                <Descriptions column={1} bordered size="small" title={<Text strong style={{ fontSize: 13 }}>{isEn ? 'Authentication' : '鉴权说明'}</Text>}>
                  <Descriptions.Item label={isEn ? "Authentication" : "鉴权方式"}>
                    {isEn
                      ? 'Unified Authentication: Authorization: Bearer sk-xxx'
                      : '所有接口统一使用标准 Authorization: Bearer sk-xxx 请求头进行安全鉴权。'}
                  </Descriptions.Item>
                </Descriptions>
              </Card>
            )}

            {/* 5. 可灵原生协议 (kling) */}
            {selectedMenuKey === 'kling' && (
              <Card variant="borderless" style={{ background: c.cardBg, borderColor: c.cardBorder }} title={<><PlayCircleOutlined /> {isEn ? 'Kling AI Native Protocol' : '可灵 AI 原生协议'}</>}>
                <Tabs
                  defaultActiveKey="kling-video"
                  items={[
                    {
                      key: 'kling-video',
                      label: isEn ? 'Video Generation' : '视频接口',
                      children: (
                        <div style={{ marginTop: 16 }}>
                          <Alert
                            message={isEn ? "Kling Mode & Resolution Mapping" : "可灵分辨率与调用模式映射说明"}
                            description={isEn
                              ? "The resolution parameter mapped: \"720p\" / \"480p\" -> mode: \"std\", \"1080p\" -> mode: \"pro\", \"4k\" -> mode: \"4k\"."
                              : "使用 OpenAI 兼容格式 (/v1/video/generations) 传入 resolution 时：720p/480p 自动映射为 mode: \"std\"，1080p 映射为 mode: \"pro\"，4k 映射为 mode: \"4k\"。"}
                            type="info"
                            showIcon
                            style={{ marginBottom: 16 }}
                          />
                          <EndpointText method="POST" path="/v1/videos/text2video" label={isEn ? 'Text to Video' : '文生视频提交'} />
                          <EndpointText method="POST" path="/v1/videos/image2video" label={isEn ? 'Image to Video' : '图生视频提交'} />
                          <EndpointText method="POST" path="/v1/videos/multi-image2video" label={isEn ? 'Multi-image' : '多图参考生视频'} />
                          <EndpointText method="POST" path="/v1/videos/omni-video" label={isEn ? 'Omni Video' : 'Omni 视频参考生视频'} />
                          <EndpointText method="GET" path="/v1/videos/{endpoint}/{task_id}" label={isEn ? 'Query Task' : '视频任务状态查询'} />

                          <Text type="secondary" style={{ display: 'block', marginTop: 16 }}>{isEn ? 'Official docs: ' : '官方文档：'}<a href="https://klingai.com/document-api/apiReference/model/OmniVideo" target="_blank" rel="noreferrer">Kling Video API</a></Text>
                        </div>
                      )
                    },
                    {
                      key: 'kling-image',
                      label: isEn ? 'Image Generation' : '图片接口',
                      children: (
                        <div style={{ marginTop: 16 }}>
                          <EndpointText method="POST" path="/v1/images/generations" label={isEn ? 'Standard' : '标准生图提交'} />
                          <EndpointText method="POST" path="/v1/images/multi-image2image" label={isEn ? 'Multi-image' : '多图参考生图'} />
                          <EndpointText method="POST" path="/v1/images/omni-image" label={isEn ? 'Omni Image' : 'Omni 智能生图'} />
                          <EndpointText method="GET" path="/v1/images/{endpoint}/{task_id}" label={isEn ? 'Query Task' : '图片任务状态查询'} />

                          <Text type="secondary" style={{ display: 'block', marginTop: 16 }}>{isEn ? 'Official docs: ' : '官方文档：'}<a href="https://klingai.com/document-api/apiReference/model/OmniImage" target="_blank" rel="noreferrer">Kling Image API</a></Text>
                        </div>
                      )
                    }
                  ]}
                />
              </Card>
            )}

            {/* 6. Google 原生协议 (google) */}
            {selectedMenuKey === 'google' && (
              <Card variant="borderless" style={{ background: c.cardBg, borderColor: c.cardBorder }} title={<><GoogleOutlined /> {isEn ? 'Google Gemini Native API' : 'Google Gemini 原生接口'}</>}>
                <Paragraph type="secondary">{isEn ? 'Send native Gemini Payload, the gateway handles authentication replacement, billing audit, and optimal routing.' : '发送原生 Gemini Payload，网关自动完成鉴权替换、计费审计并路由到最优渠道节点。'}</Paragraph>
                <EndpointText method="POST" path="/v1beta/models/{model}:generateContent" label={isEn ? 'Non-stream' : '非流式'} />
                <EndpointText method="POST" path="/v1beta/models/{model}:streamGenerateContent" label={isEn ? 'Streaming (SSE)' : '流式（SSE）'} />

                <Descriptions column={1} bordered size="small">
                  <Descriptions.Item label={isEn ? "model (in Path)" : "model (路径)"}>{isEn ? 'Embedded in the model path, e.g. gemini-2.0-flash' : 'Gemini 模型名嵌入路径中，如 gemini-2.0-flash'}</Descriptions.Item>
                  <Descriptions.Item label={isEn ? "contents (Required)" : "contents (必填)"}>{isEn ? 'Gemini native contents array: [{"role":"user","parts":[{"text":"..."}]}]' : 'Gemini 原生 contents 数组：[{"role":"user","parts":[{"text":"..."}]}]'}</Descriptions.Item>
                  <Descriptions.Item label={isEn ? "systemInstruction (Optional)" : "systemInstruction (选填)"}>{isEn ? 'System instruction: {"parts":[{"text":"You are a helpful assistant"}]}' : '系统指令：{"parts":[{"text":"You are a helpful assistant"}]}'}</Descriptions.Item>
                  <Descriptions.Item label={isEn ? "generationConfig (Optional)" : "generationConfig (选填)"}>{isEn ? 'Generation config object: temperature, topP, maxOutputTokens, responseMimeType, etc.' : '生成配置对象：temperature、topP、maxOutputTokens、responseMimeType 等'}</Descriptions.Item>
                  <Descriptions.Item label={isEn ? "Authentication" : "鉴权说明"}>{isEn ? 'Supports Bearer sk-xxx, X-Goog-Api-Key: sk-xxx, or URL suffix ?key=sk-xxx (choose one)' : '支持 Authorization: Bearer sk-xxx、X-Goog-Api-Key: sk-xxx、或 URL 参数 ?key=sk-xxx，三选一'}</Descriptions.Item>
                </Descriptions>
                <Text type="secondary" style={{ display: 'block', marginTop: 16 }}>{isEn ? 'Official docs: ' : '官方文档：'}<a href="https://ai.google.dev/api" target="_blank" rel="noreferrer">Google Gemini API</a></Text>
              </Card>
            )}

            {/* 7. Anthropic 原生 (anthropic) */}
            {selectedMenuKey === 'anthropic' && (
              <Card variant="borderless" style={{ background: c.cardBg, borderColor: c.cardBorder }} title={<><RobotOutlined /> {isEn ? 'Anthropic Native API' : 'Anthropic 原生接口'}</>}>
                <Paragraph type="secondary">{isEn ? 'Call Claude models with official Anthropic paths. Gateway supports full passthrough of request/response formats, including SSE streaming.' : '使用 Anthropic 官方路径调用 Claude 系列模型，网关支持完全透传原生请求与响应格式，包含 SSE 数据流。'}</Paragraph>
                <EndpointText method="POST" path="/v1/messages" label={isEn ? 'Chat (Anthropic Native Messages API)' : '聊天（Anthropic 原生 Messages API）'} />

                <Descriptions column={1} bordered size="small">
                  <Descriptions.Item label={isEn ? "Payload Info" : "请求体说明"}>{isEn ? 'Fully compatible with official Messages API structure. Supports advanced features like native tool use.' : '完全兼容 Anthropic 官方定义的 Messages API 结构，支持原生工具调用等高级特性。'}</Descriptions.Item>
                  <Descriptions.Item label={isEn ? "Authentication" : "鉴权说明"}>{isEn ? 'Supports standard Authorization: Bearer sk-xxx or native x-api-key: sk-xxx' : '支持标准 Authorization: Bearer sk-xxx 或原生 x-api-key: sk-xxx'}</Descriptions.Item>
                </Descriptions>
                <Text type="secondary" style={{ display: 'block', marginTop: 16 }}>{isEn ? 'Official docs: ' : '官方文档：'}<a href="https://platform.claude.com/docs/en/api/messages/create" target="_blank" rel="noreferrer">Anthropic Claude API</a></Text>
              </Card>
            )}

            {/* 8. 错误码说明 (errors) */}
            {selectedMenuKey === 'errors' && (
              <Card variant="borderless" style={{ background: c.cardBg, borderColor: c.cardBorder }} title={<><ExclamationCircleOutlined /> {isEn ? 'Error Codes' : '错误码'}</>}>
                <Table
                  dataSource={errorCodes}
                  rowKey="code"
                  pagination={false}
                  size="small"
                  columns={[
                    { title: isEn ? 'HTTP Status Code' : 'HTTP 状态码', dataIndex: 'code', width: 150, render: (val: number) => <Tag color={val >= 500 ? 'red' : 'warning'}>{val}</Tag> },
                    { title: isEn ? 'Description' : '问题描述', dataIndex: 'desc' }
                  ]}
                  style={{ marginBottom: 24 }}
                />
                <Alert
                  message={isEn ? "Error Diagnostics" : "错误排查机制"}
                  description={isEn
                    ? "When the upstream returns a non-success state, the gateway includes the raw error payload inside the response body for troubleshooting. Failed requests are recorded in usage logs for admin review."
                    : "当上游返回非成功状态时，网关会在响应体中包含上游原始错误信息以便排查。同时所有失败请求均会被完整记录至使用日志，管理员可在后台查看详细的请求/响应内容。"}
                  type="warning"
                  showIcon
                  style={{ borderRadius: 8 }}
                />
              </Card>
            )}

          </div>
        </Content>
      </Layout>

      {/* Overlay for mobile sidebar */}
      {screens.xs && !collapsed && (
        <div
          onClick={() => setCollapsed(true)}
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.45)',
            zIndex: 99
          }}
        />
      )}
    </Layout>
  );
};

export default RelayAPI;
