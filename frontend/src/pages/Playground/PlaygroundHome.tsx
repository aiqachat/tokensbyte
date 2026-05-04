/**
 * 体验中心 - 项目列表首页 (Stitch Style)
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ConfigProvider, theme, Input, Tooltip, message, Popover, Avatar, Button, Modal, App } from 'antd';
import {
  SearchOutlined, PlusOutlined, DeleteOutlined, EditOutlined,
  AppstoreOutlined, TeamOutlined, AudioOutlined, ArrowUpOutlined,
  ThunderboltOutlined, FileTextOutlined, MobileOutlined, DesktopOutlined, RocketOutlined,
  DashboardOutlined, WalletOutlined, LogoutOutlined, SunOutlined, MoonOutlined, CheckOutlined,
  ExclamationCircleOutlined, ReloadOutlined
} from '@ant-design/icons';
import request from '../../utils/request';
import { useThemeStore } from '../../store/theme';
import useAuthStore from '../../store/auth';
import UserAvatarMenu from '../../components/UserAvatarMenu';
import CanvasParticles from './components/CanvasParticles';

interface ProjectItem {
  id: number;
  uid: string;
  name: string;
  description: string;
  cover_url: string;
  canvas_data: string;
  created_at: string;
  updated_at: string;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const getFullUrl = (url: string) => {
  if (!url) return '';
  if (!url.startsWith('http') && !url.startsWith('/')) return `https://${url}`;
  if (url.startsWith('/')) return `${API_BASE_URL}${url}`;
  return url;
};

const formatDateGroup = (dateStr: string): string => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 3) return '最近';
  if (diffDays <= 7) return '过去 7 天';
  if (diffDays <= 30) return '过去 30 天';
  if (date.getFullYear() === now.getFullYear()) return '今年';
  return '更早';
};

const PlaygroundHome: React.FC = () => {
  const { themeMode } = useThemeStore();
  const navigate = useNavigate();
  const { modal, message: appMessage } = App.useApp();
  const { user, logout } = useAuthStore();
  const [siteName, setSiteName] = useState<string>('TokensByte');
  const [siteLogo, setSiteLogo] = useState<string>('');
  const [agreement, setAgreement] = useState<any>(null);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [storageStats, setStorageStats] = useState<any>(null);
  const [selectedProject, setSelectedProject] = useState<ProjectItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [newPrompt, setNewPrompt] = useState('');
  const [activeTab, setActiveTab] = useState<'my' | 'shared'>('my');
  const [themePref, setThemePref] = useState<'light' | 'dark' | 'system'>('system');
  const [platform, setPlatform] = useState<'app' | 'web'>('app');
  const isCreatingRef = useRef(false);
  const { setTheme } = useThemeStore();
  const [storageReady, setStorageReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [initPhase, setInitPhase] = useState<string>('正在检查存储配置...');
  const [initializing, setInitializing] = useState(true);
  const [rightEditingName, setRightEditingName] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    try {
      // 获取站点基础设置
      try {
        const settingsRes = await (request.get('/settings') as any);
        if (settingsRes?.site) {
          if (settingsRes.site.name) setSiteName(settingsRes.site.name);
          if (settingsRes.site.logo) setSiteLogo(settingsRes.site.logo);
        }
        if (settingsRes?.agreement) {
          setAgreement(settingsRes.agreement);
        }
      } catch (e) {
        console.error('获取站点配置失败', e);
      }

      try {
        const statsRes = await request.get('/playground/storage-stats') as any;
        setStorageStats(statsRes);
      } catch (e) {
        console.error('获取存储统计失败', e);
      }

      setInitPhase('正在加载项目...');
      const res = await request.get('/playground/projects') as any;
      let list: ProjectItem[] = res?.projects || [];
      if (list.length === 0 && !isCreatingRef.current) {
        isCreatingRef.current = true;
        try {
          setInitPhase('正在创建第一个项目...');
          const createRes = await request.post('/playground/projects', { name: '未命名项目' }) as any;
          if (createRes?.id) {
            const freshRes = await request.get('/playground/projects') as any;
            list = freshRes?.projects || [];
          }
        } finally {
          isCreatingRef.current = false;
        }
      }
      setProjects(list);
      setSelectedProject(prev => {
        if (!prev && list.length > 0) return list[0];
        if (prev && !list.find(p => p.id === prev.id)) return list[0] || null;
        return prev;
      });
      setInitPhase('准备就绪');
    } catch (e) {
      console.error('加载项目列表失败', e);
    } finally {
      setLoading(false);
      setTimeout(() => setInitializing(false), 400);
    }
  }, []);

  // 初始化存储：检查 TOS 配置并创建用户文件夹
  const initStorage = useCallback(async () => {
    try {
      setStorageError(null);
      setInitializing(true);
      setInitPhase('正在初始化存储空间...');
      await request.post('/playground/init-storage', {});
      setStorageReady(true);
      // 存储就绪后加载项目
      loadProjects();
    } catch (e: any) {
      const errMsg = e?.response?.data?.message || e?.message || '存储初始化失败';
      setStorageError(errMsg);
      setStorageReady(false);
      setLoading(false);
      setInitializing(false);
    }
  }, [loadProjects]);

  useEffect(() => {
    document.title = 'AI 创作中心';
    initStorage();
  }, [initStorage]);

  const handleCreateProject = useCallback(async (promptText?: string) => {
    try {
      const res = await request.post('/playground/projects', { name: promptText ? '新对话项目' : '未命名项目' }) as any;
      if (res?.id) {
        // 如果有提示词，可以考虑通过 state 传递给画布页面，目前直接跳转
        navigate(`/playground/${res.id}`);
      }
    } catch {
      appMessage.error('创建项目失败');
    }
  }, [navigate]);

  const handleOpenProject = useCallback((projectId: number) => {
    navigate(`/playground/${projectId}`);
  }, [navigate]);

  const handleDeleteProject = useCallback((e: React.MouseEvent, projectId: number) => {
    e.stopPropagation();
    
    if (projects.length <= 1) {
      appMessage.info('由于这是您的最后一个项目，建议直接编辑或重命名使用。');
      return;
    }

    modal.confirm({
      title: <span style={{ color: '#E3E3E3' }}>确认删除此项目？</span>,
      content: <span style={{ color: 'rgba(255,77,79,0.8)' }}>警告：此操作为物理删除，删除后该项目下的所有内容和数据将永久丢失，无法恢复！</span>,
      wrapClassName: 'dark-confirm-modal',
      className: 'dark-confirm-modal',
      okText: '确定删除',
      okType: 'danger',
      cancelText: '取消',
      centered: true,
      async onOk() {
        try {
          await request.delete(`/playground/projects/${projectId}`);
          appMessage.success('项目已删除');
          await loadProjects();
        } catch {
          appMessage.error('删除失败');
        }
      },
    });
  }, [loadProjects, projects.length]);

  const handleRename = useCallback(async (projectId: number) => {
    if (!editingName.trim()) { setEditingId(null); return; }
    try {
      await request.put(`/playground/projects/${projectId}`, { name: editingName.trim() });
      await loadProjects();
      setEditingId(null);
    } catch {
      appMessage.error('重命名失败');
    }
  }, [editingName, loadProjects]);

  const groupedProjects = (() => {
    const filtered = projects.filter(p =>
      !searchKeyword || p.name.toLowerCase().includes(searchKeyword.toLowerCase())
    );
    const groups: Record<string, ProjectItem[]> = {};
    for (const p of filtered) {
      const g = formatDateGroup(p.updated_at);
      if (!groups[g]) groups[g] = [];
      groups[g].push(p);
    }
    return Object.entries(groups).map(([group, items]) => ({ group, items }));
  })();

  const suggestions = [
    "A browse tab for a mobile app for roma...",
    "A daily check-in page for a menstrual c...",
    "Mobile friendly home page for a bakery..."
  ];

  return (
    <ConfigProvider theme={{
      
      token: { fontFamily: "'Inter', 'PingFang SC', sans-serif" }
    }}>
      <div style={{
        height: '100vh', width: '100vw', display: 'flex',
        background: '#1E1E20',
        color: themeMode === 'light' ? '#1f2937' : '#fff',
        overflow: 'hidden',
        position: 'relative',
      }}>
        <CanvasParticles />

        <style>{`
          @keyframes pgSpin {
            to { transform: rotate(360deg); }
          }
          @keyframes pgFadeIn {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes pgShimmer {
            0% { background-position: -200px 0; }
            100% { background-position: 200px 0; }
          }
          @keyframes pgPulse {
            0%, 100% { opacity: 0.4; }
            50% { opacity: 0.15; }
          }
          
          /* 强制覆盖 Modal.confirm 的深色样式 */
          .dark-confirm-modal .ant-modal-content,
          .dark-confirm-modal.ant-modal-content,
          .ant-modal-wrap.dark-confirm-modal .ant-modal-content {
            background: #1e1f20 !important;
            border: 1px solid #444746 !important;
            border-radius: 16px !important;
            box-shadow: 0 4px 12px rgba(0,0,0,0.5) !important;
          }
          .dark-confirm-modal .ant-modal-confirm-title { color: #e3e3e3 !important; }
          .dark-confirm-modal .ant-modal-confirm-content { color: #c4c7c5 !important; }
          .dark-confirm-modal .ant-btn-default {
            background: transparent !important;
            border: 1px solid #444746 !important;
            color: #e3e3e3 !important;
            border-radius: 8px !important;
            outline: none !important;
            box-shadow: none !important;
          }
          .dark-confirm-modal .ant-btn-default:hover {
            background: rgba(255,255,255,0.08) !important;
            border-color: #8ab4f8 !important;
            color: #8ab4f8 !important;
          }
          .dark-confirm-modal .ant-btn-primary.ant-btn-dangerous {
            background: rgba(255, 77, 79, 0.15) !important;
            border: 1px solid rgba(255, 77, 79, 0.3) !important;
            color: #ff4d4f !important;
            border-radius: 8px !important;
            outline: none !important;
            box-shadow: none !important;
          }
          .dark-confirm-modal .ant-btn-primary.ant-btn-dangerous:hover {
            background: rgba(255, 77, 79, 0.25) !important;
            border-color: rgba(255, 77, 79, 0.5) !important;
          }
          .dark-confirm-modal .ant-modal-confirm-btns {
            margin-top: 24px !important;
          }
        `}</style>

        {/* ===== 存储未配置错误遮罩 ===== */}
        {storageError && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(12px)',
          }}>
            <div style={{
              background: 'rgba(30, 30, 34, 0.95)',
              border: '1px solid rgba(255, 77, 79, 0.3)',
              borderRadius: 24,
              padding: '48px 40px',
              maxWidth: 460,
              textAlign: 'center',
              boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
            }}>
              <ExclamationCircleOutlined style={{ fontSize: 48, color: '#ff4d4f', marginBottom: 20 }} />
              <h2 style={{ color: '#fff', fontSize: 20, fontWeight: 600, margin: '0 0 12px' }}>创作中心暂不可用</h2>
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, lineHeight: 1.8, margin: '0 0 8px' }}>
                请正确配置系统存储（火山引擎 TOS 对象存储）后再使用创作中心。
              </p>
              <p style={{ color: 'rgba(255,77,79,0.8)', fontSize: 13, lineHeight: 1.6, margin: '0 0 28px', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                {storageError}
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <div
                  onClick={() => navigate('/')}
                  style={{
                    padding: '8px 24px', borderRadius: 12, cursor: 'pointer',
                    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                    color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: 500,
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                >
                  返回首页
                </div>
                <div
                  onClick={() => initStorage()}
                  style={{
                    padding: '8px 24px', borderRadius: 12, cursor: 'pointer',
                    background: 'rgba(22,119,255,0.15)', border: '1px solid rgba(22,119,255,0.3)',
                    color: '#1677ff', fontSize: 14, fontWeight: 500,
                    display: 'flex', alignItems: 'center', gap: 6,
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(22,119,255,0.25)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(22,119,255,0.15)'}
                >
                  <ReloadOutlined />
                  重试
                </div>
              </div>
            </div>
          </div>
        )}
        <div style={{
          width: 320,
          margin: '16px 0 16px 16px',
          borderRadius: 24,
          background: themeMode === 'dark' ? 'rgba(24, 24, 27, 0.65)' : 'rgba(255, 255, 255, 0.65)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: themeMode === 'dark' ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(0,0,0,0.15)',
          boxShadow: themeMode === 'dark' ? '0 8px 32px rgba(0,0,0,0.2)' : '0 8px 32px rgba(0,0,0,0.05)',
          display: 'flex', flexDirection: 'column',
          zIndex: 10,
        }}>
          {/* Logo 区 */}
          <div style={{ padding: '24px 24px 16px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => navigate('/')}>
            <span style={{ color: themeMode === 'dark' ? '#fff' : '#000', fontSize: '24px', fontWeight: 600, letterSpacing: '-0.5px' }}>{siteName || 'Stitch'}</span>
            <span style={{ fontSize: 10, border: themeMode === 'dark' ? '1px solid rgba(255,255,255,0.4)' : '1px solid rgba(0,0,0,0.4)', color: themeMode === 'dark' ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.8)', padding: '2px 6px', borderRadius: 10, letterSpacing: '0.5px' }}>BETA</span>
          </div>

          {/* 顶部按钮区 */}
          <div style={{ padding: '0 24px 16px', display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{
              display: 'flex', background: themeMode === 'dark' ? '#18181b' : 'rgba(0,0,0,0.04)', borderRadius: 24, flex: 1, padding: 4,
              border: themeMode === 'dark' ? '1px solid #27272a' : '1px solid rgba(0,0,0,0.05)'
            }}>
              <div
                onClick={() => setActiveTab('my')}
                style={{
                  flex: 1, padding: '8px 0', borderRadius: 20, fontSize: 13, fontWeight: 500,
                  cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  background: activeTab === 'my' ? (themeMode === 'dark' ? '#3f3f46' : '#fff') : 'transparent',
                  color: activeTab === 'my' ? (themeMode === 'dark' ? '#fff' : '#000') : (themeMode === 'dark' ? '#a1a1aa' : '#666'),
                  boxShadow: activeTab === 'my' && themeMode === 'light' ? '0 2px 8px rgba(0,0,0,0.08)' : 'none'
                }}
              >
                <AppstoreOutlined /> 我的项目
              </div>
              <div
                onClick={() => setActiveTab('shared')}
                style={{
                  flex: 1, padding: '8px 0', borderRadius: 20, fontSize: 13, fontWeight: 500,
                  cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  background: activeTab === 'shared' ? (themeMode === 'dark' ? '#3f3f46' : '#fff') : 'transparent',
                  color: activeTab === 'shared' ? (themeMode === 'dark' ? '#fff' : '#000') : (themeMode === 'dark' ? '#a1a1aa' : '#666'),
                  boxShadow: activeTab === 'shared' && themeMode === 'light' ? '0 2px 8px rgba(0,0,0,0.08)' : 'none'
                }}
              >
                <TeamOutlined /> 与我共享
              </div>
            </div>
          </div>

          {/* 搜索 */}
          <div style={{ padding: '0 24px 20px', display: 'flex', gap: 10 }}>
            <Input
              prefix={<SearchOutlined style={{ color: themeMode === 'dark' ? '#a1a1aa' : '#999', marginRight: 6 }} />}
              placeholder="搜索项目"
              variant="borderless"
              value={searchKeyword}
              onChange={e => setSearchKeyword(e.target.value)}
              style={{
                background: themeMode === 'dark' ? '#27272a' : 'rgba(0,0,0,0.04)', borderRadius: 20,
                height: 40, fontSize: 14, color: themeMode === 'dark' ? '#fff' : '#000',
                flex: 1
              }}
            />
            <Tooltip title="新建项目">
              <div
                onClick={() => handleCreateProject()}
                style={{
                  width: 40, height: 40, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: themeMode === 'dark' ? '#27272a' : 'rgba(0,0,0,0.04)',
                  color: themeMode === 'dark' ? '#fff' : '#000', cursor: 'pointer', transition: 'all 0.2s', flexShrink: 0
                }}
                onMouseEnter={e => e.currentTarget.style.background = themeMode === 'dark' ? '#3f3f46' : 'rgba(0,0,0,0.08)'}
                onMouseLeave={e => e.currentTarget.style.background = themeMode === 'dark' ? '#27272a' : 'rgba(0,0,0,0.04)'}
              >
                <PlusOutlined style={{ fontSize: 16 }} />
              </div>
            </Tooltip>
          </div>

          {/* 项目列表 */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 20px' }} className="pg-scroll">
            {groupedProjects.map((group, idx) => (
              <div key={idx} style={{ marginBottom: 24 }}>
                <div style={{
                  fontSize: 16, fontWeight: 500, color: themeMode === 'dark' ? '#e4e4e7' : '#333',
                  padding: '0 8px', marginBottom: 12,
                }}>
                  {group.group}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {group.items.map(project => (
                  <div
                    key={project.id}
                    onClick={() => {
                      if (editingId !== project.id) {
                        setSelectedProject(project);
                      }
                    }}
                    onMouseEnter={() => setHoveredId(project.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '8px', borderRadius: 12, cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      background: selectedProject?.id === project.id
                        ? (themeMode === 'dark' ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.12)')
                        : hoveredId === project.id ? (themeMode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)') : 'transparent',
                    }}
                  >
                    {/* 小缩略图 */}
                    <div
                      onClick={(e) => { e.stopPropagation(); handleOpenProject(project.id); }}
                      style={{
                      width: 40, height: 40, borderRadius: 6, flexShrink: 0,
                      background: themeMode === 'dark' ? '#18181b' : 'rgba(0,0,0,0.04)', 
                      border: themeMode === 'dark' ? '1px solid #27272a' : '1px solid rgba(0,0,0,0.08)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      overflow: 'hidden',
                      cursor: 'pointer'
                    }}>
                      {project.cover_url ? (
                        /\.(mp4|webm|mov)(\?|$)/i.test(project.cover_url) ? (
                          <video src={getFullUrl(project.cover_url)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted loop playsInline />
                        ) : (
                          <img src={getFullUrl(project.cover_url)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                        )
                      ) : (
                        <div style={{ 
                          width: '100%', height: '100%', 
                          background: themeMode === 'dark' ? '#232326' : '#f4f4f5',
                          display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                          <FileTextOutlined style={{ color: themeMode === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)', fontSize: 16 }} />
                        </div>
                      )}
                    </div>

                    {/* 信息 */}
                    <div style={{ flex: 1, minWidth: 0, height: 40, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 }}>
                      {editingId === project.id ? (
                        <Input
                          size="small" value={editingName} autoFocus
                          onChange={e => setEditingName(e.target.value)}
                          onPressEnter={() => handleRename(project.id)}
                          onBlur={() => handleRename(project.id)}
                          onClick={e => e.stopPropagation()}
                          style={{
                            background: '#131314', border: '1px solid rgba(255,255,255,0.2)',
                            color: '#fff', borderRadius: 6, height: 26, fontSize: 13,
                          }}
                        />
                      ) : (
                        <>
                          <div
                            onClick={(e) => { e.stopPropagation(); handleOpenProject(project.id); }}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 6,
                              overflow: 'hidden', whiteSpace: 'nowrap',
                              lineHeight: '20px',
                            }}
                          >
                            <span style={{
                              fontSize: 14, fontWeight: 600, color: themeMode === 'dark' ? '#e4e4e7' : '#111',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                              {project.name}
                            </span>
                            <span style={{ fontSize: 11, color: themeMode === 'dark' ? '#71717a' : '#999', fontFamily: 'monospace', flexShrink: 0 }}>
                              ID:{project.id}
                            </span>
                          </div>

                          <div style={{ fontSize: 12, color: themeMode === 'dark' ? '#a1a1aa' : '#666', lineHeight: '18px', display: 'flex', alignItems: 'center', gap: 12 }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <DesktopOutlined /> 
                              {new Date(project.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                    
                    {/* 删除按钮 */}
                    {hoveredId === project.id && editingId !== project.id && (
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0, paddingLeft: 8 }}>
                        <Tooltip title="删除项目">
                          <div
                            onClick={(e) => handleDeleteProject(e, project.id)}
                            style={{
                              width: 32, height: 32, borderRadius: 8,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: themeMode === 'dark' ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.4)',
                              cursor: 'pointer', transition: 'all 0.2s',
                            }}
                            onMouseEnter={(e: any) => { e.currentTarget.style.background = themeMode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)'; e.currentTarget.style.color = themeMode === 'dark' ? '#fff' : '#000'; }}
                            onMouseLeave={(e: any) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = themeMode === 'dark' ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.4)'; }}
                          >
                            <DeleteOutlined style={{ fontSize: 14 }} />
                          </div>
                        </Tooltip>
                      </div>
                    )}
                  </div>
                  ))}
                </div>
              </div>
            ))}

            {/* 加载中骨架屏 */}
            {initializing && projects.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {[1, 2, 3].map(i => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '10px', borderRadius: 12,
                    animation: 'pgPulse 1.5s ease-in-out infinite',
                    animationDelay: `${i * 0.15}s`,
                  }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 6, flexShrink: 0,
                      background: 'rgba(255,255,255,0.06)',
                    }} />
                    <div style={{ flex: 1 }}>
                      <div style={{
                        height: 14, borderRadius: 4, marginBottom: 8,
                        width: `${70 + i * 8}%`,
                        background: 'rgba(255,255,255,0.06)',
                      }} />
                      <div style={{
                        height: 10, borderRadius: 4,
                        width: '50%',
                        background: 'rgba(255,255,255,0.04)',
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!loading && !initializing && projects.length === 0 && (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: 'rgba(255,255,255,0.3)' }}>
                <div style={{ fontSize: 14 }}>暂无项目</div>
              </div>
            )}
          </div>

          {/* 存储配额与项目配额使用情况 */}
          {storageStats && (
            <div style={{
              padding: '16px 24px',
              borderTop: themeMode === 'dark' ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)',
              display: 'flex', flexDirection: 'column', gap: 14
            }}>
              {/* 项目数量进度 */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: themeMode === 'dark' ? '#a1a1aa' : '#666', marginBottom: 6 }}>
                  <span>可创建项目数</span>
                  <span><strong style={{color: themeMode === 'dark' ? '#e4e4e7' : '#333'}}>{storageStats.project_count}</strong> / {storageStats.max_projects}</span>
                </div>
                <div style={{ width: '100%', height: 4, background: themeMode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ 
                    height: '100%', 
                    width: `${Math.min(100, (storageStats.project_count / (storageStats.max_projects || 1)) * 100)}%`,
                    background: (storageStats.project_count >= storageStats.max_projects) ? '#ff4d4f' : (themeMode === 'dark' ? '#fff' : '#333'),
                    borderRadius: 2,
                    transition: 'width 0.3s ease'
                  }} />
                </div>
              </div>
              
              {/* 空间使用量进度 */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: themeMode === 'dark' ? '#a1a1aa' : '#666', marginBottom: 6 }}>
                  <span>空间大小限制</span>
                  <span><strong style={{color: themeMode === 'dark' ? '#e4e4e7' : '#333'}}>{(storageStats.total_size_mb || 0).toFixed(1)}</strong> / {storageStats.quota_mb} MB</span>
                </div>
                <div style={{ width: '100%', height: 4, background: themeMode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ 
                    height: '100%', 
                    width: `${Math.min(100, storageStats.usage_percent || 0)}%`,
                    background: (storageStats.usage_percent || 0) > 90 ? '#ff4d4f' : (themeMode === 'dark' ? '#fff' : '#333'),
                    borderRadius: 2,
                    transition: 'width 0.3s ease'
                  }} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ===== 右侧主区域：预览 或 Stitch Welcome Screen ===== */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          position: 'relative', padding: '0 40px', zIndex: 1
        }}>
          {/* 右上角头像区 */}
          <div style={{ position: 'absolute', top: 24, right: 40, display: 'flex', alignItems: 'center', gap: 16 }}>
            {user && (
              <UserAvatarMenu isUserEnd={true} agreement={agreement} />
            )}
          </div>
          {initializing && !storageError ? (
            /* 加载中状态 */
            <div style={{ textAlign: 'center', animation: 'pgFadeIn 0.4s ease' }}>
              <div style={{
                width: 48, height: 48, borderRadius: '50%',
                border: '3px solid rgba(255,255,255,0.06)',
                borderTopColor: 'rgba(22,119,255,0.7)',
                animation: 'pgSpin 0.8s linear infinite',
                margin: '0 auto 24px',
              }} />
              <div key={initPhase} style={{
                fontSize: 15, fontWeight: 500, color: 'rgba(255,255,255,0.5)',
                animation: 'pgFadeIn 0.3s ease',
                letterSpacing: '0.3px',
              }}>
                {initPhase}
              </div>
            </div>
          ) : selectedProject ? (
            /* 选中项目 → 预览卡片 */
            <div style={{ textAlign: 'center', maxWidth: 500 }}>
              {/* 封面预览 */}
              <div
                onClick={() => handleOpenProject(selectedProject.id)}
                style={{
                  width: 320, height: 200, borderRadius: 20, margin: '0 auto 32px',
                  background: themeMode === 'dark' ? '#232326' : '#f4f4f5',
                  border: themeMode === 'dark' ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden', cursor: 'pointer',
                  transition: 'all 0.3s',
                  boxShadow: themeMode === 'dark' ? '0 20px 60px rgba(0,0,0,0.3)' : '0 20px 60px rgba(0,0,0,0.05)',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'scale(1.02)';
                  e.currentTarget.style.boxShadow = themeMode === 'dark' ? '0 24px 64px rgba(0,0,0,0.4)' : '0 24px 64px rgba(0,0,0,0.1)';
                  e.currentTarget.style.borderColor = themeMode === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = themeMode === 'dark' ? '0 20px 60px rgba(0,0,0,0.3)' : '0 20px 60px rgba(0,0,0,0.05)';
                  e.currentTarget.style.borderColor = themeMode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
                }}
              >
                {selectedProject.cover_url ? (
                  /\.(mp4|webm|mov)(\?|$)/i.test(selectedProject.cover_url) ? (
                    <video src={getFullUrl(selectedProject.cover_url)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted loop />
                  ) : (
                    <img src={getFullUrl(selectedProject.cover_url)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                  )
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, color: themeMode === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)' }}>
                    <AppstoreOutlined style={{ fontSize: 48 }} />
                    <span style={{ fontSize: 14 }}>暂无封面</span>
                  </div>
                )}
              </div>

              {rightEditingName !== null ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, margin: '0 0 4px' }}>
                  <Input
                    value={rightEditingName}
                    onChange={e => setRightEditingName(e.target.value)}
                    onPressEnter={async () => {
                      if (rightEditingName.trim() && selectedProject) {
                        try {
                          await request.put(`/playground/projects/${selectedProject.id}`, { name: rightEditingName.trim() });
                          await loadProjects();
                          setSelectedProject(prev => prev ? { ...prev, name: rightEditingName.trim() } : prev);
                        } catch { message.error('重命名失败'); }
                      }
                      setRightEditingName(null);
                    }}
                    onBlur={async () => {
                      if (rightEditingName.trim() && selectedProject) {
                        try {
                          await request.put(`/playground/projects/${selectedProject.id}`, { name: rightEditingName.trim() });
                          await loadProjects();
                          setSelectedProject(prev => prev ? { ...prev, name: rightEditingName.trim() } : prev);
                        } catch { message.error('重命名失败'); }
                      }
                      setRightEditingName(null);
                    }}
                    autoFocus
                    style={{
                      fontSize: 22, fontWeight: 700, textAlign: 'center',
                      background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.2)',
                      color: '#fff', borderRadius: 10, height: 42, maxWidth: 320,
                    }}
                  />
                </div>
              ) : (
                <h2 style={{ fontSize: 24, fontWeight: 700, color: themeMode === 'light' ? '#1f2937' : '#fff', margin: '0 0 4px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                  {selectedProject.name}
                  <EditOutlined
                    onClick={() => setRightEditingName(selectedProject.name)}
                    style={{
                      fontSize: 16, color: themeMode === 'dark' ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)',
                      cursor: 'pointer', transition: 'color 0.2s',
                    }}
                    onMouseEnter={(e: any) => e.currentTarget.style.color = themeMode === 'dark' ? '#fff' : '#000'}
                    onMouseLeave={(e: any) => e.currentTarget.style.color = themeMode === 'dark' ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'}
                  />
                </h2>
              )}
              <div style={{ fontSize: 12, color: themeMode === 'dark' ? '#71717a' : '#999', fontFamily: 'monospace', marginBottom: 8 }}>
                项目 ID: {selectedProject.id}
              </div>

              <p style={{ fontSize: 14, color: themeMode === 'dark' ? '#a1a1aa' : '#666', margin: '0 0 32px' }}>
                创建于 {new Date(selectedProject.created_at).toLocaleDateString('zh-CN')}
                {' · '}
                最近更新 {new Date(selectedProject.updated_at).toLocaleDateString('zh-CN')}
              </p>

              <div
                onClick={() => handleOpenProject(selectedProject.id)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 10,
                  padding: '10px 28px', borderRadius: 12,
                  background: themeMode === 'dark' ? '#f4f4f5' : '#18181b',
                  color: themeMode === 'dark' ? '#18181b' : '#fff', 
                  fontSize: 15, fontWeight: 500,
                  cursor: 'pointer', transition: 'all 0.2s ease',
                  boxShadow: themeMode === 'dark' ? '0 4px 12px rgba(255,255,255,0.05)' : '0 4px 12px rgba(0,0,0,0.1)',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.opacity = '0.9';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.opacity = '1';
                }}
              >
                <RocketOutlined />
                进入工作台
              </div>
            </div>
          ) : null}

          {/* 右下角：主题切换按钮 */}
          <div style={{ position: 'absolute', bottom: 24, right: 40, zIndex: 50 }}>
            <Popover
              placement="topRight"
              trigger="click"
              overlayInnerStyle={{ padding: 8, background: '#232326', border: '1px solid #3f3f46', borderRadius: 16 }}
              arrow={false}
              content={
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, width: 140 }}>
                  <div
                    onClick={() => { setThemePref('light'); setTheme('light'); }}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
                      background: themePref === 'light' ? 'rgba(255,255,255,0.06)' : 'transparent',
                      color: themePref === 'light' ? '#fff' : '#e4e4e7', transition: 'all 0.2s',
                    }}
                    onMouseEnter={e => { if (themePref !== 'light') e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                    onMouseLeave={e => { if (themePref !== 'light') e.currentTarget.style.background = 'transparent'; }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <SunOutlined style={{ fontSize: 15 }} />
                      <span style={{ fontSize: 14 }}>浅色</span>
                    </div>
                    {themePref === 'light' && <CheckOutlined style={{ fontSize: 13 }} />}
                  </div>
                  
                  <div
                    onClick={() => {
                      setThemePref('system');
                      const isSysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                      setTheme(isSysDark ? 'dark' : 'light');
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
                      background: themePref === 'system' ? 'rgba(255,255,255,0.06)' : 'transparent',
                      color: themePref === 'system' ? '#fff' : '#e4e4e7', transition: 'all 0.2s',
                    }}
                    onMouseEnter={e => { if (themePref !== 'system') e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                    onMouseLeave={e => { if (themePref !== 'system') e.currentTarget.style.background = 'transparent'; }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <DesktopOutlined style={{ fontSize: 15 }} />
                      <span style={{ fontSize: 14 }}>系统</span>
                    </div>
                    {themePref === 'system' && <CheckOutlined style={{ fontSize: 13 }} />}
                  </div>

                  <div
                    onClick={() => { setThemePref('dark'); setTheme('dark'); }}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
                      background: themePref === 'dark' ? 'rgba(255,255,255,0.06)' : 'transparent',
                      color: themePref === 'dark' ? '#fff' : '#e4e4e7', transition: 'all 0.2s',
                    }}
                    onMouseEnter={e => { if (themePref !== 'dark') e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                    onMouseLeave={e => { if (themePref !== 'dark') e.currentTarget.style.background = 'transparent'; }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <MoonOutlined style={{ fontSize: 15 }} />
                      <span style={{ fontSize: 14 }}>深色</span>
                    </div>
                    {themePref === 'dark' && <CheckOutlined style={{ fontSize: 13 }} />}
                  </div>
                </div>
              }
            >
              <div
                style={{
                  width: 38, height: 38, borderRadius: '50%',
                  background: 'rgba(255,255,255,0.15)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  backdropFilter: 'blur(10px)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
              >
                {themePref === 'light' ? <SunOutlined style={{ fontSize: 16 }} /> : themePref === 'dark' ? <MoonOutlined style={{ fontSize: 16 }} /> : <DesktopOutlined style={{ fontSize: 16 }} />}
              </div>
            </Popover>
          </div>
        </div>

        <style>{`
          .pg-scroll::-webkit-scrollbar { width: 4px; }
          .pg-scroll::-webkit-scrollbar-track { background: transparent; }
          .pg-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
          .pg-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
          .ant-input-textarea-focus { box-shadow: none !important; }
        `}</style>
      </div>
    </ConfigProvider>
  );
};

export default PlaygroundHome;
