/**
 * 历史记录面板（左侧工具栏）
 * 支持在屏幕上自由拖动（通过顶部 header 手柄）
 * 包含项目列表、搜索等功能
 * 数据来源：后端 /playground/projects API
 */
import React, { useState, useRef, useCallback } from 'react';
import { Input, Typography, Tooltip, message } from 'antd';
import {
  SearchOutlined, AppstoreOutlined, TeamOutlined,
  DesktopOutlined, VideoCameraOutlined, PictureOutlined,
  PlusOutlined, DeleteOutlined, EditOutlined,
} from '@ant-design/icons';
import { usePlayground, useCanvas } from '../context/PlaygroundContext';
import type { PlaygroundProject, PlaygroundAsset } from '../types';
import request from '../../../utils/request';

const { Text } = Typography;

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const getFullUrl = (url: string) => {
  if (!url) return '';
  if (!url.startsWith('http') && !url.startsWith('/')) return `https://${url}`;
  if (url.startsWith('/')) return `${API_BASE_URL}${url}`;
  return url;
};

/** 格式化时间分组 */
const formatDateGroup = (dateStr: string): string => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return '今天';
  if (diffDays === 1) return '昨天';
  if (diffDays <= 7) return '过去 7 天';
  if (diffDays <= 30) return '过去 30 天';
  return '更早';
};

const HistoryPanel: React.FC = () => {
  const [position, setPosition] = useState({ x: 24, y: 80 });
  const [activeTab, setActiveTab] = useState<'my' | 'shared'>('my');
  const [searchKeyword, setSearchKeyword] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);

  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const initialPos = useRef({ x: 0, y: 0 });

  const {
    projects, currentProjectId, setCurrentProjectId,
    loadProjects, createProject, saveCanvasState,
  } = usePlayground();

  const { nodes, setNodes } = useCanvas();

  // 项目资源缓存
  const [projectAssets, setProjectAssets] = useState<Record<number, PlaygroundAsset[]>>({});
  const [loadingProjectId, setLoadingProjectId] = useState<number | null>(null);
  // 编辑项目名
  const [editingProjectId, setEditingProjectId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');

  // ========== 拖拽逻辑（绑定在 header 手柄上）==========
  const handleDragStart = useCallback((e: React.PointerEvent) => {
    // 忽略按钮和输入框上的拖拽
    const tag = (e.target as HTMLElement).tagName.toLowerCase();
    if (tag === 'input' || tag === 'button') return;

    isDragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY };
    initialPos.current = { x: position.x, y: position.y };

    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  }, [position]);

  const handleDragMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;

    let newX = initialPos.current.x + dx;
    let newY = initialPos.current.y + dy;

    newX = Math.max(0, Math.min(newX, window.innerWidth - 300));
    newY = Math.max(0, Math.min(newY, window.innerHeight - 100));

    setPosition({ x: newX, y: newY });
  }, []);

  const handleDragEnd = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
  }, []);

  // 切换到指定项目
  const handleSelectProject = useCallback(async (projectId: number) => {
    if (projectId === currentProjectId) return;

    // 1. 先保存当前项目的画布状态
    await saveCanvasState();

    // 2. 切换项目
    setCurrentProjectId(projectId);
    setLoadingProjectId(projectId);

    // 3. 先清空画布（立即响应）
    setNodes([]);

    try {
      const res = await request.get(`/playground/projects/${projectId}`) as any;
      const assets: PlaygroundAsset[] = res?.assets || [];
      if (assets.length > 0) {
        setProjectAssets(prev => ({ ...prev, [projectId]: assets }));
      }

      let restored = false;

      // 构建 assets 的 URL 映射（用于回填 resultData，分组支持多节点）
      const assetUrlGroup = new Map<string, PlaygroundAsset[]>();
      for (const a of assets) {
        // 按 prompt 匹配（canvas 节点的 taskData.prompt 对应 asset.prompt）
        if (a.prompt) {
          if (!assetUrlGroup.has(a.prompt)) assetUrlGroup.set(a.prompt, []);
          assetUrlGroup.get(a.prompt)!.push(a);
        }
      }

      // 4. 尝试从 canvas_data 恢复画布
      if (res?.project?.canvas_data) {
        try {
          const canvasData = JSON.parse(res.project.canvas_data);
          if (canvasData?.nodes?.length > 0) {
            // 检查节点是否有完整的 resultData，缺失的从 assets 回填
            const fixedNodes = canvasData.nodes.map((n: any) => {
              if (n.status === 'completed' && !n.resultData) {
                // resultData 为空，尝试从 assets 回填
                const matches = assetUrlGroup.get(n.taskData?.prompt || '');
                if (matches && matches.length > 0) {
                  const matchedAsset = matches.shift();
                  return {
                    ...n,
                    resultData: matchedAsset!.asset_type === 'image'
                      ? { data: [{ url: matchedAsset!.file_url }] }
                      : { content: { video_url: matchedAsset!.file_url } },
                  };
                }
              }
              return n;
            });
            setNodes(fixedNodes);
            restored = true;
          }
        } catch {
          // 解析失败，继续往下走
        }
      }

      // 5. 如果没有 canvas_data 但有 assets，从 assets 重建画布节点
      if (!restored && assets.length > 0) {
        const rebuiltNodes = assets
          .filter(a => a.asset_type === 'image' || a.asset_type === 'video')
          .map((asset, idx) => {
            // 尝试从 canvas_node_data 恢复位置
            let pos = { x: 100 + (idx % 3) * 520, y: 100 + Math.floor(idx / 3) * 380 };
            try {
              const nd = JSON.parse(asset.canvas_node_data);
              if (nd?.x !== undefined) pos = { x: nd.x, y: nd.y };
            } catch {}

            return {
              id: `asset-${asset.id}`,
              type: asset.asset_type as 'image' | 'video' | 'text',
              status: 'completed' as const,
              taskData: { prompt: asset.prompt },
              resultData: asset.asset_type === 'image'
                ? { data: [{ url: asset.file_url }] }
                : { content: { video_url: asset.file_url } },
              x: pos.x,
              y: pos.y,
              width: asset.width || 480,
              height: asset.height || 320,
              zIndex: idx + 1,
            };
          });

        if (rebuiltNodes.length > 0) {
          setNodes(rebuiltNodes);
        }
      }
    } catch (e) {
      console.error('加载项目详情失败', e);
    } finally {
      setLoadingProjectId(null);
    }
  }, [currentProjectId, setCurrentProjectId, setNodes, saveCanvasState]);

  // 新建项目
  const handleCreateProject = useCallback(async () => {
    const id = await createProject();
    if (id) {
      setNodes([]);
      message.success('新项目已创建');
    }
  }, [createProject, setNodes]);

  // 删除项目
  const handleDeleteProject = useCallback(async (e: React.MouseEvent, projectId: number) => {
    e.stopPropagation();
    try {
      await request.delete(`/playground/projects/${projectId}`);
      message.success('项目已删除');
      await loadProjects();
      if (projectId === currentProjectId) {
        setCurrentProjectId(null);
        setNodes([]);
      }
    } catch {
      message.error('删除失败');
    }
  }, [loadProjects, currentProjectId, setCurrentProjectId, setNodes]);

  // 重命名项目
  const handleRenameProject = useCallback(async (projectId: number) => {
    if (!editingName.trim()) {
      setEditingProjectId(null);
      return;
    }
    try {
      await request.put(`/playground/projects/${projectId}`, { name: editingName.trim() });
      await loadProjects();
      setEditingProjectId(null);
    } catch {
      message.error('重命名失败');
    }
  }, [editingName, loadProjects]);

  // 从当前画布节点提取当前会话历史
  const sessionHistory = nodes
    .filter(n => n.status === 'completed' && (n.type === 'image' || n.type === 'video'))
    .reverse()
    .map(n => {
      let url = '';
      if (n.type === 'image') {
        const raw = n.resultData?.data?.[0] || n.resultData?.content?.image_url;
        url = typeof raw === 'string' ? raw : raw?.url || raw?.b64_json;
      } else {
        url = n.resultData?.content?.video_url || n.resultData?.final_result?.video_url || n.resultData?.video_url;
      }
      const isUrl = url && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/'));
      const isBase64 = !isUrl && url && url.length > 100;
      const finalUrl = isBase64 ? (url.startsWith('data:') ? url : `data:image/png;base64,${url}`) : getFullUrl(url);

      return {
        id: n.id,
        title: n.taskData?.prompt || (n.type === 'image' ? 'AI 图像生成' : 'AI 视频生成'),
        date: '刚才',
        icon: finalUrl,
        type: n.type
      };
    });

  // 按时间分组项目
  const groupedProjects = (() => {
    const filtered = projects.filter(p =>
      !searchKeyword || p.name.toLowerCase().includes(searchKeyword.toLowerCase())
    );

    const groups: Record<string, PlaygroundProject[]> = {};
    for (const p of filtered) {
      const group = formatDateGroup(p.updated_at);
      if (!groups[group]) groups[group] = [];
      groups[group].push(p);
    }

    return Object.entries(groups).map(([group, items]) => ({ group, items }));
  })();

  return (
    <div
      ref={panelRef}
      style={{
        position: 'absolute',
        left: position.x,
        top: position.y,
        width: 320,
        height: 'auto',
        maxHeight: 'calc(100vh - 180px)',
        background: 'rgba(26, 27, 30, 0.95)',
        backdropFilter: 'blur(20px)',
        borderRadius: 20,
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 100,
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* 拖拽手柄 — 只有这块区域可以拖动面板 */}
      <div
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
        style={{
          padding: '20px 20px 16px',
          display: 'flex', gap: 10, flexShrink: 0, alignItems: 'center',
          cursor: isDragging.current ? 'grabbing' : 'grab',
          touchAction: 'none',
        }}
      >
        <div 
          onClick={() => setActiveTab('my')}
          style={{
            flex: 1, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 8, borderRadius: 10, fontSize: 14, fontWeight: 500, cursor: 'pointer',
            background: activeTab === 'my' ? 'rgba(255,255,255,0.1)' : 'transparent',
            color: activeTab === 'my' ? '#fff' : 'rgba(255,255,255,0.45)',
            transition: 'all 0.2s'
          }}
        >
          <AppstoreOutlined />
          <span>我的项目</span>
        </div>
        <div 
          onClick={() => setActiveTab('shared')}
          style={{
            flex: 1, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 8, borderRadius: 10, fontSize: 14, fontWeight: 500, cursor: 'pointer',
            background: activeTab === 'shared' ? 'rgba(255,255,255,0.1)' : 'transparent',
            color: activeTab === 'shared' ? '#fff' : 'rgba(255,255,255,0.45)',
            transition: 'all 0.2s'
          }}
        >
          <TeamOutlined />
          <span>与我共享</span>
        </div>

        {/* 新建项目按钮 */}
        <Tooltip title="新建项目">
          <div
            onClick={handleCreateProject}
            style={{
              width: 36, height: 36, borderRadius: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(22,119,255,0.15)', color: '#1677ff',
              cursor: 'pointer', transition: 'all 0.2s', flexShrink: 0,
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(22,119,255,0.25)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(22,119,255,0.15)'}
          >
            <PlusOutlined style={{ fontSize: 16 }} />
          </div>
        </Tooltip>
      </div>

      {/* 搜索框 */}
      <div style={{ padding: '0 20px 16px', flexShrink: 0 }}>
        <Input 
          prefix={<SearchOutlined style={{ color: 'rgba(255,255,255,0.3)', fontSize: 16 }} />}
          placeholder="搜索项目"
          variant="borderless"
          value={searchKeyword}
          onChange={(e) => setSearchKeyword(e.target.value)}
          style={{
            background: 'rgba(255,255,255,0.05)',
            borderRadius: 12,
            height: 40,
            fontSize: 14,
            color: '#fff',
            paddingLeft: 12,
          }}
        />
      </div>

      {/* 列表区域 (可滚动，不触发面板拖拽) */}
      <div 
        className="hide-scrollbar"
        style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px', cursor: 'default' }}
      >
        {activeTab === 'my' ? (
          <>
            {/* 当前会话生成历史 */}
            {sessionHistory.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.85)', marginBottom: 12 }}>
                  当前会话
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {sessionHistory.map(item => (
                    <div 
                      key={item.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '8px', borderRadius: 12,
                        cursor: 'pointer', transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{
                        width: 44, height: 44, borderRadius: 10,
                        background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                      }}>
                        {item.icon ? (
                          item.type === 'video' ? (
                            <video src={item.icon} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <img src={item.icon} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                          )
                        ) : (
                          <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, rgba(22,119,255,0.1) 0%, rgba(22,119,255,0.02) 100%)' }} />
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 500, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.title}
                        </div>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {item.type === 'video' ? <VideoCameraOutlined /> : <PictureOutlined />}
                          <span>{item.date}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 项目列表 */}
            {groupedProjects.map((group, idx) => (
              <div key={idx} style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.85)', marginBottom: 12 }}>
                  {group.group}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {group.items.map(project => (
                    <div 
                      key={project.id}
                      onClick={() => handleSelectProject(project.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '10px 8px', borderRadius: 12,
                        cursor: 'pointer', transition: 'all 0.2s',
                        background: project.id === currentProjectId ? 'rgba(22,119,255,0.12)' : 'transparent',
                        border: project.id === currentProjectId ? '1px solid rgba(22,119,255,0.25)' : '1px solid transparent',
                      }}
                      onMouseEnter={(e) => {
                        if (project.id !== currentProjectId) e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                      }}
                      onMouseLeave={(e) => {
                        if (project.id !== currentProjectId) e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      {/* 封面缩略图 */}
                      <div style={{
                        width: 44, height: 44, borderRadius: 10,
                        background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                        flexShrink: 0,
                      }}>
                        {project.cover_url ? (
                          <img src={getFullUrl(project.cover_url)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                        ) : (
                          <AppstoreOutlined style={{ fontSize: 20, color: 'rgba(255,255,255,0.15)' }} />
                        )}
                      </div>

                      {/* 项目信息 */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {editingProjectId === project.id ? (
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            <Input
                              size="small"
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              onPressEnter={() => handleRenameProject(project.id)}
                              onBlur={() => handleRenameProject(project.id)}
                              onClick={(e) => e.stopPropagation()}
                              autoFocus
                              style={{
                                background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(22,119,255,0.4)',
                                color: '#fff', borderRadius: 6, height: 28, fontSize: 13,
                              }}
                            />
                          </div>
                        ) : (
                          <>
                            <div style={{ fontSize: 14, fontWeight: 500, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {project.name}
                            </div>
                            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 3 }}>
                              {new Date(project.updated_at).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                            </div>
                          </>
                        )}
                      </div>

                      {/* 操作按钮 */}
                      {project.id === currentProjectId && editingProjectId !== project.id && (
                        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                          <Tooltip title="重命名">
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingProjectId(project.id);
                                setEditingName(project.name);
                              }}
                              style={{
                                width: 26, height: 26, borderRadius: 6,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: 'rgba(255,255,255,0.4)', cursor: 'pointer',
                                transition: 'all 0.15s',
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#fff'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; }}
                            >
                              <EditOutlined style={{ fontSize: 12 }} />
                            </div>
                          </Tooltip>
                          <Tooltip title="删除项目">
                            <div
                              onClick={(e) => handleDeleteProject(e, project.id)}
                              style={{
                                width: 26, height: 26, borderRadius: 6,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: 'rgba(255,77,79,0.6)', cursor: 'pointer',
                                transition: 'all 0.15s',
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,77,79,0.08)'; e.currentTarget.style.color = '#ff4d4f'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,77,79,0.6)'; }}
                            >
                              <DeleteOutlined style={{ fontSize: 12 }} />
                            </div>
                          </Tooltip>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {projects.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(255,255,255,0.25)' }}>
                <AppstoreOutlined style={{ fontSize: 32, display: 'block', marginBottom: 12 }} />
                <div style={{ fontSize: 14 }}>暂无项目</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>点击右上角 + 创建新项目</div>
              </div>
            )}
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(255,255,255,0.25)' }}>
            <TeamOutlined style={{ fontSize: 32, display: 'block', marginBottom: 12 }} />
            <div style={{ fontSize: 14 }}>共享功能开发中</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>敬请期待</div>
          </div>
        )}
      </div>

      <style>{`
        .hide-scrollbar::-webkit-scrollbar {
          width: 0px;
          background: transparent;
        }
      `}
      </style>
    </div>
  );
};

export default HistoryPanel;
