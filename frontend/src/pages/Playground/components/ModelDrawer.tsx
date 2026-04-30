/**
 * 模型全景选择器抽屉
 */
import React, { useRef, useCallback, useEffect } from 'react';
import { Input, Tag, Tooltip } from 'antd';
import { CloseOutlined, SearchOutlined, DollarOutlined, AppstoreOutlined } from '@ant-design/icons';
import { usePlayground, useCanvas } from '../context/PlaygroundContext';
import { getCategoryIcon } from '../constants';

const ModelDrawer: React.FC = React.memo(() => {
  const {
    isModelDrawerVisible, setIsModelDrawerVisible,
    searchModelKeyword, setSearchModelKeyword,
    modelsInCategory, selectedMid, activeCategory,
    handleSelectModel,
  } = usePlayground();
  const { modelWidgetPos, setModelWidgetPos } = useCanvas();

  // 高性能拖拽：全部通过 ref + DOM 操作，零 React re-render
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const posRef = useRef({ x: modelWidgetPos.x, y: modelWidgetPos.y });

  useEffect(() => {
    if (!isDraggingRef.current) {
      posRef.current = { x: modelWidgetPos.x, y: modelWidgetPos.y };
    }
  }, [modelWidgetPos]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('input, button, .ant-tooltip-open, .close-btn')) return;
    
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

      containerRef.current.style.left = `${posRef.current.x}px`;
      containerRef.current.style.top = `${posRef.current.y}px`;
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      if (containerRef.current) {
        containerRef.current.style.cursor = 'grab';
      }
      setModelWidgetPos({ x: posRef.current.x, y: posRef.current.y });
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [setModelWidgetPos]);

  if (!isModelDrawerVisible) return null;

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        left: modelWidgetPos.x,
        top: modelWidgetPos.y,
        width: 440,
        background: 'rgba(18, 19, 21, 0.85)',
        borderRadius: 24,
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
        backdropFilter: 'blur(24px)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        zIndex: 1000,
        height: Math.min(640, window.innerHeight - modelWidgetPos.y - 24)
      }}
      onWheel={(e) => e.stopPropagation()}
    >
      {/* 拖拽标题栏 */}
      <div
        onMouseDown={handleMouseDown}
        style={{
          padding: '0 24px', height: 64, minHeight: 64,
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          cursor: 'grab',
          background: 'rgba(255,255,255,0.02)',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <AppstoreOutlined style={{ color: '#fff', fontSize: 16 }} />
          <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: 500 }}>模型选择器</span>
        </div>
        <Tooltip title="关闭">
          <div
            className="close-btn"
            style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'rgba(255,255,255,0.5)' }}
            onClick={() => setIsModelDrawerVisible(false)}
            onMouseEnter={(e) => e.currentTarget.style.color = '#fff'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.5)'}
          >
            <CloseOutlined />
          </div>
        </Tooltip>
      </div>

      <div style={{ padding: '16px 20px 8px 20px' }}>
        <Input
          size="large"
          prefix={<SearchOutlined style={{ color: 'rgba(255,255,255,0.4)', paddingRight: 8 }} />}
          placeholder="搜索体验模型..."
          value={searchModelKeyword}
          onChange={e => setSearchModelKeyword(e.target.value)}
          style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 12 }}
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 20px 20px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {modelsInCategory.length === 0 ? (
          <div style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: '60px 0' }}>该类别下暂无可体验的模型。</div>
        ) : (
          modelsInCategory.map(model => (
            <div
              key={model.mid}
              onClick={() => handleSelectModel(model.mid)}
              style={{
                background: selectedMid === model.mid ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.02)',
                padding: '16px 20px', borderRadius: 16,
                border: selectedMid === model.mid ? '1px solid rgba(255,255,255,0.4)' : '1px solid rgba(255,255,255,0.05)',
                cursor: 'pointer', display: 'flex', gap: 16, transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                if (selectedMid !== model.mid) e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
              }}
              onMouseLeave={(e) => {
                if (selectedMid !== model.mid) e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
              }}
            >
              <div style={{ fontSize: 28, padding: '4px 8px 4px 0', opacity: 0.9, color: '#fff' }}>
                {getCategoryIcon(activeCategory, true)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flex: 1, flexWrap: 'wrap' }}>
                    <div style={{ color: '#E8eaed', fontSize: 16, fontWeight: 500, wordBreak: 'break-word', lineHeight: 1.4 }}>{model.name}</div>
                  </div>
                </div>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 4 }}>ID: {model.model_id}</div>
                {model.scheme_name && (
                  <div style={{ marginTop: 8 }}>
                    <Tag color="blue" style={{ borderRadius: 12, fontSize: 11, background: 'rgba(22,119,255,0.1)', border: 'none' }}>{model.scheme_name}</Tag>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
                  <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, display: 'flex', alignItems: 'center' }}>
                    <DollarOutlined style={{ marginRight: 6 }} />
                    按量计费
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
});

ModelDrawer.displayName = 'ModelDrawer';
export default ModelDrawer;
