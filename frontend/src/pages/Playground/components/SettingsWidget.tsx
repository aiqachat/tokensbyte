/**
 * 悬浮参数设置面板 (可拖拽、可折叠)
 * 
 * 性能关键：拖拽期间完全绕过 React 状态系统，直接操作 DOM
 * 仅在 mouseup 时提交最终位置到 Context state
 */
import React, { useRef, useCallback, useEffect } from 'react';
import { Typography, Button, Tooltip, message } from 'antd';
import { AppstoreOutlined, CloseOutlined, DownOutlined } from '@ant-design/icons';
import { useCanvas } from '../context/PlaygroundContext';
import { usePlayground } from '../context/PlaygroundContext';
import { getCategoryIcon } from '../constants';
import ParamControl from './ParamControl';

const { Text } = Typography;

const SettingsWidget: React.FC = React.memo(() => {
  const { settingsWidgetPos, setSettingsWidgetPos } = useCanvas();
  const {
    isSettingsCollapsed, setIsSettingsCollapsed,
    isSettingsWidgetVisible, setIsSettingsWidgetVisible,
    categories, activeCategory, handleCategoryChange,
    currentModel, setIsModelDrawerVisible,
  } = usePlayground();

  // --- 高性能拖拽：全部通过 ref + DOM 操作，零 React re-render ---
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const posRef = useRef({ x: settingsWidgetPos.x, y: settingsWidgetPos.y });

  // 同步 state 变化到 ref（仅在非拖拽时）
  useEffect(() => {
    if (!isDraggingRef.current) {
      posRef.current = { x: settingsWidgetPos.x, y: settingsWidgetPos.y };
    }
  }, [settingsWidgetPos]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // 忽略来自按钮等交互元素的事件
    if ((e.target as HTMLElement).closest('button, .ant-tooltip-open, .close-btn')) return;
    
    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    
    if (containerRef.current) {
      containerRef.current.style.transition = 'none';
      containerRef.current.style.cursor = 'grabbing';
    }

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isDraggingRef.current || !containerRef.current) return;
      
      const dx = ev.clientX - dragStartRef.current.x;
      const dy = ev.clientY - dragStartRef.current.y;
      dragStartRef.current = { x: ev.clientX, y: ev.clientY };
      
      posRef.current.x += dx;
      posRef.current.y += dy;

      // 直接操作 DOM，完全不触发 React 渲染
      containerRef.current.style.left = `${posRef.current.x}px`;
      containerRef.current.style.top = `${posRef.current.y}px`;
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      if (containerRef.current) {
        containerRef.current.style.cursor = 'grab';
      }
      // 仅在松手时一次性提交到 React state
      setSettingsWidgetPos({ x: posRef.current.x, y: posRef.current.y });
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    // 挂载到 document 级别，确保鼠标移出元素也能继续跟踪
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [setSettingsWidgetPos]);

  if (!isSettingsWidgetVisible) return null;

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        left: settingsWidgetPos.x,
        top: settingsWidgetPos.y,
        width: 360,
        background: '#1e1f20',
        borderRadius: 24,
        border: '1px solid #444746',
        boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
        backdropFilter: 'blur(24px)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        zIndex: 1000,
        transition: 'height 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        height: isSettingsCollapsed ? 48 : Math.min(800, window.innerHeight - settingsWidgetPos.y - 24)
      }}
      onWheel={(e) => e.stopPropagation()}
    >
      {/* 拖拽标题栏 */}
      <div
        onMouseDown={handleMouseDown}
        onDoubleClick={() => setIsSettingsCollapsed(!isSettingsCollapsed)}
        style={{
          padding: '0 24px', height: 48, minHeight: 48,
          borderBottom: isSettingsCollapsed ? 'none' : '1px solid #444746',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          cursor: 'grab',
          background: 'rgba(255,255,255,0.02)',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <AppstoreOutlined style={{ color: '#fff', fontSize: 16 }} />
          <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: 500, userSelect: 'none' }}>模型选择器</Text>
        </div>
        <Tooltip title="关闭">
          <div
            className="close-btn"
            style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'rgba(255,255,255,0.5)' }}
            onClick={() => setIsSettingsWidgetVisible(false)}
            onMouseEnter={(e) => e.currentTarget.style.color = '#fff'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.5)'}
          >
            <CloseOutlined />
          </div>
        </Tooltip>
      </div>

      {/* 可折叠内容区域 */}
      <div style={{
        flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column',
        padding: '20px 24px', gap: 16,
        opacity: isSettingsCollapsed ? 0 : 1,
        transition: 'opacity 0.3s ease',
        pointerEvents: isSettingsCollapsed ? 'none' : 'auto'
      }}>
        {/* 类别切换器 */}
        <div style={{ display: 'flex', gap: 4, background: 'rgba(0,0,0,0.3)', padding: 4, borderRadius: 16 }}>
          {categories.map(cat => {
            const isActive = activeCategory === cat;
            return (
              <div
                key={cat}
                onClick={() => handleCategoryChange(cat)}
                style={{
                  flex: 1, textAlign: 'center', padding: '8px 0', borderRadius: 12, cursor: 'pointer',
                  background: isActive ? 'rgba(168,199,250,0.12)' : 'transparent',
                  color: isActive ? '#A8C7FA' : 'rgba(255,255,255,0.6)',
                  fontSize: 13, fontWeight: 500, transition: 'all 0.2s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                }}
              >
                {getCategoryIcon(cat, isActive)}
              </div>
            );
          })}
        </div>

        {/* 模型选择卡片 */}
        <div>
          <div
            onClick={() => setIsModelDrawerVisible(true)}
            className="studio-model-card"
            style={{
              background: '#202124', borderRadius: 16, padding: '16px',
              border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer',
              transition: 'all 0.2s ease', position: 'relative'
            }}
          >
            <div style={{ color: '#E8eaed', fontSize: 17, fontWeight: 500, marginBottom: 8, paddingRight: 24 }}>
              {currentModel?.name || '选择模型...'}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {currentModel?.scheme_name
                ? `${currentModel.scheme_name} · ${currentModel.model_id}`
                : '选择适合的生成模型来处理你的工作流需求。'}
            </div>
            <div style={{ position: 'absolute', right: 16, top: 16, color: 'rgba(255,255,255,0.4)' }}><DownOutlined /></div>
          </div>
        </div>

        {/* 动态参数面板 */}
        {currentModel?.params && currentModel.params.length > 0 && (
          currentModel.params.map(param => <ParamControl key={param.key} param={param} />)
        )}

        {currentModel && (!currentModel.params || currentModel.params.length === 0) && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>该模型未绑定体验方案，无可配置参数</Text>
          </div>
        )}

        {!currentModel && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>请先选择一个模型</Text>
          </div>
        )}
      </div>
    </div>
  );
});

SettingsWidget.displayName = 'SettingsWidget';
export default SettingsWidget;
