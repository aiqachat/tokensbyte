/**
 * 体验中心 - 项目列表首页 (Stitch Style)
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ConfigProvider, theme, Input, Tooltip, message, Popover, Avatar, Button } from 'antd';
import {
  SearchOutlined, PlusOutlined, DeleteOutlined, EditOutlined,
  AppstoreOutlined, TeamOutlined, AudioOutlined, ArrowUpOutlined,
  ThunderboltOutlined, FileTextOutlined, MobileOutlined, DesktopOutlined, RocketOutlined,
  DashboardOutlined, WalletOutlined, LogoutOutlined,
} from '@ant-design/icons';
import request from '../../utils/request';
import useAuthStore from '../../store/auth';

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
  if (diffDays === 0) return '今天';
  if (diffDays === 1) return '昨天';
  if (diffDays <= 30) return '过去 30 天';
  return '更早';
};

const PlaygroundHome: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [siteName, setSiteName] = useState<string>('TokensByte');
  const [siteLogo, setSiteLogo] = useState<string>('');
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [selectedProject, setSelectedProject] = useState<ProjectItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [newPrompt, setNewPrompt] = useState('');
  const [activeTab, setActiveTab] = useState<'my' | 'shared'>('my');
  const [platform, setPlatform] = useState<'app' | 'web'>('app');
  const isCreatingRef = useRef(false);

  const loadProjects = useCallback(async () => {
    try {
      // 获取站点基础设置
      try {
        const settingsRes = await (request.get('/settings') as any);
        if (settingsRes?.site) {
          if (settingsRes.site.name) setSiteName(settingsRes.site.name);
          if (settingsRes.site.logo) setSiteLogo(settingsRes.site.logo);
        }
      } catch (e) {
        console.error('获取站点配置失败', e);
      }

      const res = await request.get('/playground/projects') as any;
      let list: ProjectItem[] = res?.projects || [];
      if (list.length === 0 && !isCreatingRef.current) {
        isCreatingRef.current = true;
        try {
          // 自动创建一个默认的未命名项目
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
    } catch (e) {
      console.error('加载项目列表失败', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    document.title = 'AI 创作中心';
    loadProjects();
  }, [loadProjects]);

  const handleCreateProject = useCallback(async (promptText?: string) => {
    try {
      const res = await request.post('/playground/projects', { name: promptText ? '新对话项目' : '未命名项目' }) as any;
      if (res?.id) {
        // 如果有提示词，可以考虑通过 state 传递给画布页面，目前直接跳转
        navigate(`/playground/${res.id}`);
      }
    } catch {
      message.error('创建项目失败');
    }
  }, [navigate]);

  const handleOpenProject = useCallback((projectId: number) => {
    navigate(`/playground/${projectId}`);
  }, [navigate]);

  const handleDeleteProject = useCallback(async (e: React.MouseEvent, projectId: number) => {
    e.stopPropagation();
    try {
      await request.delete(`/playground/projects/${projectId}`);
      message.success('项目已删除');
      await loadProjects();
    } catch {
      message.error('删除失败');
    }
  }, [loadProjects]);

  const handleRename = useCallback(async (projectId: number) => {
    if (!editingName.trim()) { setEditingId(null); return; }
    try {
      await request.put(`/playground/projects/${projectId}`, { name: editingName.trim() });
      await loadProjects();
      setEditingId(null);
    } catch {
      message.error('重命名失败');
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
      algorithm: theme.darkAlgorithm,
      token: { fontFamily: "'Inter', 'PingFang SC', sans-serif" }
    }}>
      <div style={{
        height: '100vh', width: '100vw', display: 'flex',
        background: '#131314', // Very dark background like Stitch
        color: '#fff',
        overflow: 'hidden',
        backgroundImage: 'radial-gradient(rgba(255,255,255,0.03) 1px, transparent 1px)',
        backgroundSize: '24px 24px',
      }}>
        {/* ===== 左侧浮动面板：项目列表 ===== */}
        <div style={{
          width: 320,
          margin: '16px 0 16px 16px',
          borderRadius: 24,
          background: '#1e1f20', // Dark grey panel
          border: '1px solid rgba(255,255,255,0.05)',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
          zIndex: 10,
        }}>
          {/* Logo 区 */}
          <div style={{ padding: '24px 20px 0', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => navigate('/')}>
            {siteLogo && <img src={siteLogo} alt="logo" style={{ width: 28, height: 28, objectFit: 'contain' }} />}
            <span style={{ color: '#fff', fontSize: '18px', fontWeight: 600, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{siteName || 'TokensByte'}</span>
          </div>

          {/* 顶部按钮区 */}
          <div style={{ padding: '20px 20px 16px', display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{
              display: 'flex', background: 'transparent', borderRadius: 20, flex: 1,
              gap: 4
            }}>
              <div
                onClick={() => setActiveTab('my')}
                style={{
                  padding: '8px 16px', borderRadius: 20, fontSize: 14, fontWeight: 500,
                  cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 6,
                  background: activeTab === 'my' ? '#282a2c' : 'transparent',
                  color: activeTab === 'my' ? '#fff' : 'rgba(255,255,255,0.6)'
                }}
              >
                <AppstoreOutlined /> 我的项目
              </div>
              <div
                onClick={() => setActiveTab('shared')}
                style={{
                  padding: '8px 16px', borderRadius: 20, fontSize: 14, fontWeight: 500,
                  cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 6,
                  background: activeTab === 'shared' ? '#282a2c' : 'transparent',
                  color: activeTab === 'shared' ? '#fff' : 'rgba(255,255,255,0.6)'
                }}
              >
                <TeamOutlined /> 与我共享
              </div>
            </div>
            <Tooltip title="新建项目">
              <div
                onClick={() => handleCreateProject()}
                style={{
                  width: 40, height: 40, borderRadius: 14,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: '#0a2e6b', color: '#a8c7fa', // Stitch blue
                  cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#0d3b8a'}
                onMouseLeave={e => e.currentTarget.style.background = '#0a2e6b'}
              >
                <PlusOutlined style={{ fontSize: 18 }} />
              </div>
            </Tooltip>
          </div>

          {/* 搜索 */}
          <div style={{ padding: '0 20px 16px' }}>
            <Input
              prefix={<SearchOutlined style={{ color: 'rgba(255,255,255,0.4)', marginRight: 6 }} />}
              placeholder="搜索项目"
              variant="borderless"
              value={searchKeyword}
              onChange={e => setSearchKeyword(e.target.value)}
              style={{
                background: '#282a2c', borderRadius: 20,
                height: 40, fontSize: 14, color: '#fff',
              }}
            />
          </div>

          {/* 项目列表 */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 20px' }} className="pg-scroll">
            {groupedProjects.map((group, idx) => (
              <div key={idx} style={{ marginBottom: 24 }}>
                <div style={{
                  fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.5)',
                  padding: '0 12px', marginBottom: 8,
                }}>
                  {group.group}
                </div>
                {group.items.map(project => (
                  <div
                    key={project.id}
                    onClick={() => {
                      if (editingId !== project.id) {
                        setSelectedProject(project);
                      }
                    }}
                    onDoubleClick={() => handleOpenProject(project.id)}
                    onMouseEnter={() => setHoveredId(project.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '8px 12px', borderRadius: 12, cursor: 'pointer',
                      transition: 'all 0.15s',
                      background: selectedProject?.id === project.id
                        ? '#282a2c'
                        : hoveredId === project.id ? 'rgba(255,255,255,0.04)' : 'transparent',
                    }}
                  >
                    {/* 小缩略图 */}
                    <div style={{
                      width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                      background: '#131314',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      overflow: 'hidden',
                    }}>
                      {project.cover_url ? (
                        /\.(mp4|webm|mov)(\?|$)/i.test(project.cover_url) ? (
                          <video src={getFullUrl(project.cover_url)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted loop playsInline />
                        ) : (
                          <img src={getFullUrl(project.cover_url)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                        )
                      ) : (
                        <AppstoreOutlined style={{ fontSize: 16, color: 'rgba(255,255,255,0.2)' }} />
                      )}
                    </div>

                    {/* 信息 */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {editingId === project.id ? (
                        <Input
                          size="small" value={editingName} autoFocus
                          onChange={e => setEditingName(e.target.value)}
                          onPressEnter={() => handleRename(project.id)}
                          onBlur={() => handleRename(project.id)}
                          onClick={e => e.stopPropagation()}
                          style={{
                            background: '#131314', border: '1px solid #4a4a4a',
                            color: '#fff', borderRadius: 6, height: 26, fontSize: 13,
                          }}
                        />
                      ) : (
                        <>
                          <div style={{
                            fontSize: 14, fontWeight: 500, color: '#e3e3e3',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {project.name}
                          </div>
                          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                            ID: {project.id}
                          </div>
                        </>
                      )}
                    </div>

                    {/* 操作 (Hover显示或选中状态) */}
                    {(selectedProject?.id === project.id || hoveredId === project.id) && editingId !== project.id && (
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        <div
                          onClick={e => { e.stopPropagation(); setEditingId(project.id); setEditingName(project.name); }}
                          style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', transition: 'all 0.15s' }}
                          onMouseEnter={e => { e.currentTarget.style.color = '#fff'; }}
                          onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; }}
                        >
                          <EditOutlined style={{ fontSize: 14 }} />
                        </div>
                        <div
                          onClick={e => handleDeleteProject(e, project.id)}
                          style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,77,79,0.7)', cursor: 'pointer', transition: 'all 0.15s' }}
                          onMouseEnter={e => { e.currentTarget.style.color = '#ff4d4f'; }}
                          onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,77,79,0.7)'; }}
                        >
                          <DeleteOutlined style={{ fontSize: 14 }} />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}

            {!loading && projects.length === 0 && (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: 'rgba(255,255,255,0.3)' }}>
                <div style={{ fontSize: 14 }}>暂无项目</div>
              </div>
            )}
          </div>
        </div>

        {/* ===== 右侧主区域：预览 或 Stitch Welcome Screen ===== */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          position: 'relative', padding: '0 40px', zIndex: 1
        }}>
          {/* 右上角头像区 */}
          <div style={{ position: 'absolute', top: 24, right: 40, display: 'flex', alignItems: 'center', gap: 16 }}>
            {user && (
              <Popover
                content={
                  <div style={{ width: 300, padding: '12px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ marginTop: 8, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16, width: '100%', padding: '0 8px' }}>
                      <Avatar size={56} style={{ backgroundColor: '#1677ff', color: '#fff', fontSize: 24, flexShrink: 0, cursor: 'pointer' }} onClick={() => navigate('/profile')}>
                        {user.username?.charAt(0)?.toUpperCase()}
                      </Avatar>
                      <div style={{ overflow: 'hidden', flex: 1 }}>
                        <div style={{ fontWeight: 500, fontSize: 16, color: '#e5e5e5', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.nickname || user.username}</div>
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
                <Avatar size={40} style={{ cursor: 'pointer', background: '#1677ff', color: '#fff', fontWeight: 'bold', fontSize: 18, border: '2px solid rgba(255,255,255,0.1)' }}>
                  {user.username?.charAt(0)?.toUpperCase()}
                </Avatar>
              </Popover>
            )}
          </div>
          {selectedProject ? (
            /* 选中项目 → 预览卡片 */
            <div style={{ textAlign: 'center', maxWidth: 500 }}>
              {/* 封面预览 */}
              <div
                onClick={() => handleOpenProject(selectedProject.id)}
                style={{
                  width: 320, height: 200, borderRadius: 20, margin: '0 auto 32px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden', cursor: 'pointer',
                  transition: 'all 0.3s',
                  boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'scale(1.02)';
                  e.currentTarget.style.boxShadow = '0 24px 64px rgba(162,193,255,0.15)';
                  e.currentTarget.style.borderColor = 'rgba(162,193,255,0.25)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = '0 20px 60px rgba(0,0,0,0.3)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                }}
              >
                {selectedProject.cover_url ? (
                  /\.(mp4|webm|mov)(\?|$)/i.test(selectedProject.cover_url) ? (
                    <video src={getFullUrl(selectedProject.cover_url)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted loop />
                  ) : (
                    <img src={getFullUrl(selectedProject.cover_url)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                  )
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, color: 'rgba(255,255,255,0.15)' }}>
                    <AppstoreOutlined style={{ fontSize: 48 }} />
                    <span style={{ fontSize: 14 }}>暂无封面</span>
                  </div>
                )}
              </div>

              <h2 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: '0 0 8px' }}>
                {selectedProject.name}
              </h2>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', margin: '0 0 32px' }}>
                创建于 {new Date(selectedProject.created_at).toLocaleDateString('zh-CN')}
                {' · '}
                最近更新 {new Date(selectedProject.updated_at).toLocaleDateString('zh-CN')}
              </p>

              <div
                onClick={() => handleOpenProject(selectedProject.id)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 10,
                  padding: '12px 32px', borderRadius: 14,
                  background: 'linear-gradient(135deg, #A2C1FF 0%, #6C8EFF 100%)',
                  color: '#0a0b0d', fontSize: 15, fontWeight: 600,
                  cursor: 'pointer', transition: 'all 0.2s',
                  boxShadow: '0 8px 24px rgba(162,193,255,0.2)',
                }}
                onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
              >
                <RocketOutlined />
                进入工作台
              </div>
            </div>
          ) : null}
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
