import React, { useRef, useCallback, useEffect, useMemo } from 'react';
import { Typography, Tooltip } from 'antd';
import { FolderOpenOutlined, CloseOutlined } from '@ant-design/icons';
import { useCanvas, usePlayground } from '../context/PlaygroundContext';

const { Text } = Typography;

const ResourceManagerWidget: React.FC = React.memo(() => {
  const { resourceWidgetPos, setResourceWidgetPos, nodes, setNodes, maxZIndex, setMaxZIndex } = useCanvas();
  const { isResourceWidgetVisible, setIsResourceWidgetVisible } = usePlayground();

  const handleRestoreNode = useCallback((id: string) => {
    const newZ = maxZIndex + 1;
    setMaxZIndex(newZ);
    setNodes(prev => prev.map(n => n.id === id ? { ...n, isHidden: false, zIndex: newZ } : n));
  }, [maxZIndex, setMaxZIndex, setNodes]);

  // 筛选出已生成的资源 (图片/视频)
  const resources = useMemo(() => {
    return nodes
      .filter(n => n.status === 'completed' && (n.type === 'image' || n.type === 'video'))
      .sort((a, b) => b.zIndex - a.zIndex); // 最新生成的在前
  }, [nodes]);

  // 高性能拖拽：全部通过 ref + DOM 操作，零 React re-render
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const posRef = useRef({ x: resourceWidgetPos.x, y: resourceWidgetPos.y });

  useEffect(() => {
    if (!isDraggingRef.current) {
      posRef.current = { x: resourceWidgetPos.x, y: resourceWidgetPos.y };
    }
  }, [resourceWidgetPos]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
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

      containerRef.current.style.left = `${posRef.current.x}px`;
      containerRef.current.style.top = `${posRef.current.y}px`;
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      if (containerRef.current) {
        containerRef.current.style.cursor = 'grab';
      }
      setResourceWidgetPos({ x: posRef.current.x, y: posRef.current.y });
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [setResourceWidgetPos]);

  if (!isResourceWidgetVisible) return null;

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        left: resourceWidgetPos.x,
        top: resourceWidgetPos.y,
        width: 320,
        background: 'rgba(18, 19, 21, 0.85)',
        borderRadius: 24,
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
        backdropFilter: 'blur(24px)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        zIndex: 1000,
        height: Math.min(600, window.innerHeight - resourceWidgetPos.y - 24)
      }}
      onWheel={(e) => e.stopPropagation()}
    >
      {/* 拖拽标题栏 */}
      <div
        onMouseDown={handleMouseDown}
        style={{
          padding: '0 24px', height: 48, minHeight: 48,
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          cursor: 'grab',
          background: 'rgba(255,255,255,0.02)',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <FolderOpenOutlined style={{ color: '#fff', fontSize: 16 }} />
          <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: 500 }}>资源管理器</Text>
        </div>
        <Tooltip title="关闭">
          <div
            className="close-btn"
            style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'rgba(255,255,255,0.5)' }}
            onClick={() => setIsResourceWidgetVisible(false)}
            onMouseEnter={(e) => e.currentTarget.style.color = '#fff'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.5)'}
          >
            <CloseOutlined />
          </div>
        </Tooltip>
      </div>

      {/* 内容区域：网格排列资源 */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '16px',
        display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, alignContent: 'start'
      }}>
        {resources.length === 0 ? (
          <div style={{ gridColumn: 'span 2', textAlign: 'center', padding: '40px 0', color: 'rgba(255,255,255,0.3)' }}>
            暂无生成的资源
          </div>
        ) : (
          resources.map(res => {
            let imgUrl = '';
            let videoUrl = '';
            
            if (res.type === 'image') {
              imgUrl = typeof res.resultData?.data?.[0] === 'string' 
                ? res.resultData?.data?.[0] 
                : res.resultData?.data?.[0]?.url || res.resultData?.content?.image_url || '';
            } else if (res.type === 'video') {
              videoUrl = res.resultData?.content?.video_url || res.resultData?.final_result?.video_url || res.resultData?.video_url || '';
              imgUrl = res.resultData?.content?.cover_image_url || res.resultData?.final_result?.cover_image_url || ''; // fallback if available
            }

            return (
              <div 
                key={res.id} 
                onClick={() => handleRestoreNode(res.id)}
                style={{ 
                  aspectRatio: '1/1', background: '#000', borderRadius: 12, overflow: 'hidden', 
                  position: 'relative', border: '1px solid rgba(255,255,255,0.08)',
                  cursor: 'pointer'
                }}
              >
                {res.type === 'video' && videoUrl ? (
                  <video src={videoUrl} poster={imgUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted loop playsInline onMouseEnter={e => e.currentTarget.play()} onMouseLeave={e => e.currentTarget.pause()} />
                ) : (
                  <img src={imgUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                )}
                {/* 右下角类型标识 */}
                <div style={{ position: 'absolute', bottom: 6, right: 6, background: 'rgba(0,0,0,0.6)', borderRadius: 6, padding: '2px 6px', fontSize: 10, color: '#fff' }}>
                  {res.type === 'video' ? '视频' : '图片'}
                </div>
                {/* 隐藏状态覆盖层 */}
                {res.isHidden && (
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#fff', fontSize: 12, background: 'rgba(255,255,255,0.2)', padding: '4px 10px', borderRadius: 12, backdropFilter: 'blur(4px)' }}>点击恢复</Text>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
});

ResourceManagerWidget.displayName = 'ResourceManagerWidget';
export default ResourceManagerWidget;
