/**
 * 体验中心 - 项目列表首页 (Stitch Style)
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ConfigProvider, theme, Input, Tooltip, message, Dropdown } from 'antd';
import {
  SearchOutlined, PlusOutlined, DeleteOutlined, EditOutlined,
  AppstoreOutlined, TeamOutlined, AudioOutlined, ArrowUpOutlined,
  ThunderboltOutlined, FileTextOutlined, MobileOutlined, DesktopOutlined, RocketOutlined
} from '@ant-design/icons';
import request from '../../utils/request';

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

  const loadProjects = useCallback(async () => {
    try {
      const res = await request.get('/playground/projects') as any;
      const list: ProjectItem[] = res?.projects || [];
      setProjects(list);
      if (list.length > 0 && !selectedProject) {
        setSelectedProject(list[0]);
      }
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
                            <DesktopOutlined style={{ fontSize: 10 }} />
                            {new Date(project.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
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
          ) : (
            /* 无项目时显示 Stitch 对话框 */
            <div style={{ width: '100%', maxWidth: 760, position: 'relative', zIndex: 2 }}>
              <h1 style={{
                fontSize: 48, fontWeight: 400, color: '#fff', margin: '0 0 32px',
                fontFamily: "'Inter', sans-serif", letterSpacing: '-0.5px'
              }}>
                欢迎使用 创作中心...
              </h1>

              {/* 推荐提示词 Chips */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
                {suggestions.map((text, i) => (
                  <div
                    key={i}
                    onClick={() => setNewPrompt(text)}
                    style={{
                      padding: '8px 16px', borderRadius: 20, fontSize: 13, color: 'rgba(255,255,255,0.7)',
                      background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                      cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                  >
                    {text}
                  </div>
                ))}
              </div>

              {/* 大输入框 */}
              <div style={{
                background: '#1e1f20', borderRadius: 24, padding: '20px 20px 16px',
                border: '1px solid rgba(255,255,255,0.1)',
                boxShadow: '0 12px 40px rgba(0,0,0,0.3)',
                display: 'flex', flexDirection: 'column', gap: 16
              }}>
                <Input.TextArea
                  value={newPrompt}
                  onChange={e => setNewPrompt(e.target.value)}
                  placeholder="我们要设计什么样的原生移动应用？"
                  autoSize={{ minRows: 2, maxRows: 6 }}
                  variant="borderless"
                  style={{
                    fontSize: 16, color: '#fff', padding: 0, resize: 'none',
                    boxShadow: 'none', background: 'transparent'
                  }}
                  onPressEnter={e => {
                    if (!e.shiftKey) {
                      e.preventDefault();
                      if (newPrompt.trim()) handleCreateProject(newPrompt);
                    }
                  }}
                />
                
                {/* 输入框底部工具栏 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Tooltip title="添加附件">
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'rgba(255,255,255,0.6)', cursor: 'pointer', transition: 'all 0.2s'
                      }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <PlusOutlined style={{ fontSize: 16 }} />
                      </div>
                    </Tooltip>

                    <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: 20, padding: 4 }}>
                      <div
                        onClick={() => setPlatform('app')}
                        style={{
                          padding: '6px 12px', borderRadius: 16, fontSize: 13, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s',
                          background: platform === 'app' ? '#3d3f42' : 'transparent',
                          color: platform === 'app' ? '#fff' : 'rgba(255,255,255,0.6)'
                        }}
                      >
                        <MobileOutlined /> 应用
                      </div>
                      <div
                        onClick={() => setPlatform('web')}
                        style={{
                          padding: '6px 12px', borderRadius: 16, fontSize: 13, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s',
                          background: platform === 'web' ? '#3d3f42' : 'transparent',
                          color: platform === 'web' ? '#fff' : 'rgba(255,255,255,0.6)'
                        }}
                      >
                        <DesktopOutlined /> Web
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Tooltip title="智能重写">
                      <div style={{ color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}>
                        <ThunderboltOutlined style={{ fontSize: 18 }} />
                      </div>
                    </Tooltip>

                    <Dropdown menu={{ items: [{ key: '1', label: '3.0 Flash' }, { key: '2', label: '4.0 Pro' }] }} placement="topRight">
                      <div style={{
                        padding: '8px 12px', borderRadius: 16, background: 'rgba(255,255,255,0.08)',
                        color: '#fff', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
                      }}>
                        ✨ 3.0 Flash <span style={{ fontSize: 10, opacity: 0.5 }}>▼</span>
                      </div>
                    </Dropdown>

                    <Tooltip title="语音输入">
                      <div style={{ color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}>
                        <AudioOutlined style={{ fontSize: 18 }} />
                      </div>
                    </Tooltip>

                    <div
                      onClick={() => { if (newPrompt.trim()) handleCreateProject(newPrompt); }}
                      style={{
                        width: 36, height: 36, borderRadius: '50%', background: newPrompt.trim() ? '#fff' : 'rgba(255,255,255,0.1)',
                        color: newPrompt.trim() ? '#000' : 'rgba(255,255,255,0.4)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: newPrompt.trim() ? 'pointer' : 'not-allowed',
                        transition: 'all 0.2s'
                      }}
                    >
                      <ArrowUpOutlined style={{ fontSize: 16, fontWeight: 'bold' }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* 底部附带按钮 */}
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 32 }}>
                <div style={{
                  padding: '10px 20px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.7)', fontSize: 14,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.2s'
                }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'} onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}>
                  <FileTextOutlined /> Start with a DESIGN.md <span style={{ fontSize: 10, opacity: 0.5 }}>▼</span>
                </div>
              </div>
            </div>
          )}
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
