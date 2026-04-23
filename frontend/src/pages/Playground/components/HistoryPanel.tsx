/**
 * 历史记录面板（左侧工具栏）
 * 支持在屏幕上自由拖动
 * 包含项目列表、搜索等功能
 */
import React, { useState, useRef, useEffect } from 'react';
import { Input, Typography } from 'antd';
import {
  SearchOutlined, AppstoreOutlined, TeamOutlined,
  DesktopOutlined, VideoCameraOutlined, PictureOutlined,
} from '@ant-design/icons';
import { usePlayground, useCanvas } from '../context/PlaygroundContext';

const { Text } = Typography;

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const getFullUrl = (url: string) => {
  if (!url) return '';
  if (!url.startsWith('http') && !url.startsWith('/')) return `https://${url}`;
  if (url.startsWith('/')) return `${API_BASE_URL}${url}`;
  return url;
};

// 模拟数据
const HISTORY_DATA: { group: string; items: { id: number | string; title: string; date: string; icon: string; type?: 'image' | 'video' | 'text' }[] }[] = [
  {
    group: '昨天',
    items: [
      { id: 1, title: 'Multimedia Asset Management Hub', date: 'Apr 22, 2026', icon: '/vite.svg' },
    ]
  },
  {
    group: '过去 30 天',
    items: [
      { id: 2, title: 'UI优化设计', date: 'Apr 13, 2026', icon: '/vite.svg' },
      { id: 3, title: 'AI 图像创作平台', date: 'Apr 6, 2026', icon: '/vite.svg' },
      { id: 4, title: 'Beautified AI Creative Platform', date: 'Apr 6, 2026', icon: '/vite.svg' },
      { id: 5, title: 'Glassmorphism API Marketplace Dashboard', date: 'Mar 27, 2026', icon: '/vite.svg' },
      { id: 6, title: 'Savings Calculator', date: 'Mar 27, 2026', icon: '/vite.svg' },
    ]
  }
];

const HistoryPanel: React.FC = () => {
  const [position, setPosition] = useState({ x: 24, y: 80 });
  const [activeTab, setActiveTab] = useState<'my' | 'shared'>('my');
  const panelRef = useRef<HTMLDivElement>(null);

  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const initialPos = useRef({ x: 0, y: 0 });

  const handlePointerDown = (e: React.PointerEvent) => {
    // 忽略内部输入框等元素的拖拽
    if ((e.target as HTMLElement).tagName.toLowerCase() === 'input') return;
    
    isDragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY };
    initialPos.current = { x: position.x, y: position.y };
    
    if (panelRef.current) {
      panelRef.current.style.transition = 'none';
      panelRef.current.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    
    let newX = initialPos.current.x + dx;
    let newY = initialPos.current.y + dy;
    
    // 简单的边界限制
    newX = Math.max(0, Math.min(newX, window.innerWidth - 300));
    newY = Math.max(0, Math.min(newY, window.innerHeight - 100));

    setPosition({ x: newX, y: newY });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    if (panelRef.current) {
      panelRef.current.releasePointerCapture(e.pointerId);
    }
  };

  const { nodes } = useCanvas();

  // 从当前画布节点提取生成历史
  const sessionHistory = nodes
    .filter(n => n.status === 'completed' && (n.type === 'image' || n.type === 'video'))
    .reverse() // 最新的在前面
    .map(n => {
      let url = '';
      if (n.type === 'image') {
        const raw = n.resultData?.data?.[0] || n.resultData?.content?.image_url;
        url = typeof raw === 'string' ? raw : raw?.url || raw?.b64_json;
      } else {
        url = n.resultData?.content?.video_url || n.resultData?.final_result?.video_url || n.resultData?.video_url;
      }
      const isBase64 = url && url.length > 200;
      const finalUrl = isBase64 ? (url.startsWith('data:') ? url : `data:image/png;base64,${url}`) : getFullUrl(url);

      return {
        id: n.id,
        title: n.taskData?.prompt || (n.type === 'image' ? 'AI 图像生成' : 'AI 视频生成'),
        date: '刚才',
        icon: finalUrl,
        type: n.type
      };
    });

  const displayData = sessionHistory.length > 0 
    ? [{ group: '今天 (当前会话)', items: sessionHistory }, ...HISTORY_DATA]
    : HISTORY_DATA;

  return (
    <div
      ref={panelRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
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
        cursor: isDragging.current ? 'grabbing' : 'grab',
        userSelect: 'none',
      }}
    >
      {/* 顶部 Tabs 区域 */}
      <div style={{ padding: '20px 20px 16px', display: 'flex', gap: 10, flexShrink: 0 }}>
        <div 
          onClick={(e) => { e.stopPropagation(); setActiveTab('my'); }}
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
          onClick={(e) => { e.stopPropagation(); setActiveTab('shared'); }}
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
      </div>

      {/* 搜索框 */}
      <div style={{ padding: '0 20px 16px', flexShrink: 0 }}>
        <Input 
          prefix={<SearchOutlined style={{ color: 'rgba(255,255,255,0.3)', fontSize: 16 }} />}
          placeholder="搜索项目"
          variant="borderless"
          onPointerDown={(e) => e.stopPropagation()} // 阻止拖拽
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

      {/* 列表区域 (可滚动) */}
      <div 
        className="hide-scrollbar"
        onPointerDown={(e) => e.stopPropagation()} // 内部内容滑动时不触发面板整体拖拽，如果有需要的话
        style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px', cursor: 'default' }}
      >
        {displayData.map((group, idx) => (
          <div key={idx} style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.85)', marginBottom: 12 }}>
              {group.group}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {group.items.map(item => (
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
                    position: 'relative'
                  }}>
                    {item.icon && item.icon !== '/vite.svg' ? (
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
                      {item.type === 'video' ? <VideoCameraOutlined /> : item.type === 'image' ? <PictureOutlined /> : <DesktopOutlined />}
                      <span>{item.date}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <style>{`
        .hide-scrollbar::-webkit-scrollbar {
          width: 0px;
          background: transparent;
        }
      `}</style>
    </div>
  );
};

export default HistoryPanel;
