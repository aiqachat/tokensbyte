/**
 * 无限画布容器
 * 负责粒子背景、变换层、鼠标事件代理
 * 
 * 性能关键：使用原生 addEventListener({ passive: false }) 挂载 wheel 事件
 * React 的 onWheel 是 passive 的，preventDefault() 不生效，
 * 导致 Mac 触控板的双指缩放会触发浏览器原生页面缩放。
 */
import React, { useEffect } from 'react';
import { Typography, Spin } from 'antd';
import { CompassOutlined } from '@ant-design/icons';
import { useCanvas } from '../context/PlaygroundContext';
import { usePlayground } from '../context/PlaygroundContext';
import { useCanvasInteraction } from '../hooks/useCanvasInteraction';
import CanvasNode, { ResizeHandle } from './nodes/CanvasNode';
import CanvasParticles from './CanvasParticles';
import type { CanvasParticlesHandle } from './CanvasParticles';
import { useThemeStore } from '../../../store/theme';

const { Title, Text } = Typography;

interface InfiniteCanvasProps {
  isMobile?: boolean;
}

const InfiniteCanvas: React.FC<InfiniteCanvasProps> = React.memo(({ isMobile = false }) => {
  const {
    canvasTransform, canvasRef,
    activeTool, isSpaceDown, isDraggingCanvas,
    nodes, setSelectedNodeId,
    selectedNodeIds, setSelectedNodeIds,
    draggingNodeId,
    maxZIndex,
  } = useCanvas();
  const { loading, currentModel, setIsGenLogVisible } = usePlayground();
  const { themeMode } = useThemeStore();
  const _isLight = themeMode === 'light';
  const particlesRef = React.useRef<CanvasParticlesHandle>(null);
  const mobileContainerRef = React.useRef<HTMLDivElement>(null);

  // 自动平滑滚动到最新内容
  useEffect(() => {
    if (isMobile && mobileContainerRef.current) {
      const container = mobileContainerRef.current;
      setTimeout(() => {
        container.scrollTo({
          top: container.scrollHeight,
          behavior: 'smooth'
        });
      }, 150);
    }
  }, [nodes, isMobile]);

  const {
    handleWheel, handleCanvasMouseDown,
    handleCanvasMouseMove, handleCanvasMouseUp,
    handleNodeMouseDown, handleResizeStart, removeNode,
  } = useCanvasInteraction(particlesRef); // 将 particlesRef 传给 hook

  // 点击画布空白区域时取消节点选中
  const handleCanvasMouseDownWithDeselect = (e: React.MouseEvent) => {
    // 如果点击的不是节点区域，则取消选中
    // 如果点击的不是节点区域，且不是用选框工具拖拽，则取消选中
    const target = e.target as HTMLElement;
    if (!target.closest('[data-node-id]') && activeTool !== 'marquee') {
      setSelectedNodeId(null);
      setSelectedNodeIds([]);
    }
    handleCanvasMouseDown(e);
  };

  // 全局 document 级 wheel 拦截（非 passive）
  // Mac 触控板双指缩放 = ctrlKey + wheel，必须在 document 级别 preventDefault 才能阻止浏览器原生缩放
  useEffect(() => {
    const nativeWheelHandler = (e: WheelEvent) => {
      const el = canvasRef.current;
      // 在 Playground 页面内，拦截缩放相关的修饰键 + 滚轮（防止触发浏览器缩放或前进后退）
      if (e.ctrlKey || e.altKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
      }

      // 判断事件目标是否在画布容器内
      if (el && el.contains(e.target as Node)) {
        e.preventDefault();
        handleWheel(e as any);
      }
    };

    document.addEventListener('wheel', nativeWheelHandler, { passive: false });
    return () => document.removeEventListener('wheel', nativeWheelHandler);
  }, [canvasRef, handleWheel]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (isMobile) {
    return (
      <div
        ref={mobileContainerRef}
        style={{
          position: 'absolute',
          inset: 0,
          overflowY: 'auto',
          background: _isLight ? '#ffffff' : '#131314',
          padding: '80px 16px 240px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {nodes.filter(node => !node.isHidden).length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 1,
            minHeight: '60vh',
            textAlign: 'center',
            padding: '0 24px',
            color: _isLight ? '#3c4043' : '#e8eaed',
          }}>
            <div style={{
              width: 64,
              height: 64,
              borderRadius: '20px',
              background: _isLight ? 'linear-gradient(135deg, #e8f0fe, #d2e3fc)' : 'linear-gradient(135deg, #2d3038, #1a233a)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 24,
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            }}>
              <CompassOutlined style={{ fontSize: 32, color: '#1677ff' }} />
            </div>
            <h1 style={{
              fontSize: 24,
              fontWeight: 600,
              letterSpacing: '1px',
              margin: '0 0 12px 0',
              background: 'linear-gradient(135deg, #1677ff, #87d068)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              {currentModel ? currentModel.name : 'AI 智能多模态工坊'}
            </h1>
            <p style={{
              fontSize: 14,
              color: _isLight ? '#5f6368' : '#9aa0a6',
              maxWidth: 280,
              lineHeight: 1.6,
              margin: 0,
              fontWeight: 300,
            }}>
              {currentModel
                ? '在下方输入你的创意灵感，生成的精彩内容将以瀑布流形式流转呈现。'
                : '请先在下方点击“选择模型”或配置各项参数，开启你的首个创作吧！'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
            {nodes.filter(node => !node.isHidden).map(node => (
              <div key={node.id} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                
                {/* 1. 用户提示词气泡 */}
                {node.taskData?.prompt && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #a8c7fa, #7cacf8)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 11,
                        color: '#04285b',
                        fontWeight: 'bold',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
                      }}>
                        U
                      </div>
                      <span style={{ color: _isLight ? '#5f6368' : '#9aa0a6', fontSize: 12, fontWeight: 500 }}>
                        我
                      </span>
                    </div>
                    <div style={{
                      padding: '12px 16px',
                      borderRadius: '4px 16px 16px 16px',
                      background: _isLight ? '#f0f4f9' : '#1e1f20',
                      border: _isLight ? '1px solid rgba(0,0,0,0.04)' : '1px solid rgba(255,255,255,0.04)',
                      color: _isLight ? '#1f2937' : '#e3e3e3',
                      fontSize: 14,
                      lineHeight: 1.5,
                      maxWidth: '90%',
                      alignSelf: 'flex-start',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                      wordBreak: 'break-word',
                    }}>
                      {node.taskData.prompt}
                    </div>
                  </div>
                )}

                {/* 2. AI 成果卡片 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', paddingLeft: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, #a8fab4, #7cf8a1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 10,
                      color: '#045b1d',
                      fontWeight: 'bold',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
                    }}>
                      AI
                    </div>
                    <span style={{ color: '#1677ff', fontSize: 12, fontWeight: 500 }}>
                      {node.taskData?.model_name || currentModel?.name || 'AI 模型'}
                    </span>
                  </div>
                  <div style={{ width: '100%', maxWidth: '100%', overflow: 'visible' }}>
                    <CanvasNode
                      node={node}
                      isSelected={selectedNodeIds.includes(node.id)}
                      isDragging={false}
                      activeTool={activeTool}
                      onMouseDown={() => {}}
                      onRemove={removeNode}
                      onSelect={(id) => {
                        setSelectedNodeId(id);
                        setIsGenLogVisible(true);
                      }}
                      onResizeStart={handleResizeStart}
                      isMobile={true}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        cursor: activeTool === 'hand' || isSpaceDown ? (isDraggingCanvas ? 'grabbing' : 'grab') : 'default',
        background: _isLight ? '#ffffff' : '#131314',
      }}
      onMouseDown={handleCanvasMouseDownWithDeselect}
      onMouseMove={handleCanvasMouseMove}
      onMouseUp={handleCanvasMouseUp}
      onMouseLeave={handleCanvasMouseUp}
    >
      {/* 动态粒子背景层 */}
      <CanvasParticles ref={particlesRef} />

      {/* 变换层 */}
      <div className="transform-layer" style={{
        position: 'absolute',
        transformOrigin: '0 0',
        transform: `translate(${canvasTransform.x}px, ${canvasTransform.y}px) scale(${canvasTransform.scale})`
      }}>
        {nodes.filter(node => !node.isHidden).map(node => (
          <CanvasNode
            key={node.id}
            node={node}
            isSelected={selectedNodeIds.includes(node.id)}
            isDragging={draggingNodeId === node.id || (selectedNodeIds.includes(node.id) && selectedNodeIds.length > 1 && activeTool === 'pointer' && draggingNodeId === null /* wait, draggingNodeId is not set for group drag? we can just rely on useCanvasInteraction updating DOM */)}
            activeTool={activeTool}
            hideResizeHandles={selectedNodeIds.length > 1}
            onMouseDown={handleNodeMouseDown}
            onRemove={removeNode}
            onSelect={(id) => {
              // 如果当前是多选状态，不因为简单的 onClick 就退化为单选
              if (selectedNodeIds.length <= 1) {
                setSelectedNodeId(id);
                setSelectedNodeIds([id]);
                setIsGenLogVisible(true);
              }
            }}
            onResizeStart={handleResizeStart}
          />
        ))}

        {/* 组包围盒（多选时显示） */}
        {selectedNodeIds.length > 1 && (() => {
          const groupNodes = nodes.filter(n => selectedNodeIds.includes(n.id) && !n.isHidden);
          if (groupNodes.length === 0) return null;
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          groupNodes.forEach(n => {
            minX = Math.min(minX, n.x);
            minY = Math.min(minY, n.y);
            maxX = Math.max(maxX, n.x + n.width);
            maxY = Math.max(maxY, n.y + n.height);
          });
          const width = maxX - minX;
          const height = maxY - minY;
          return (
            <div
              className="group-bounding-box"
              data-node-id="group"
              style={{
                position: 'absolute',
                left: minX,
                top: minY,
                width,
                height,
                border: '1px dashed #1677ff',
                background: 'rgba(22, 119, 255, 0.05)',
                pointerEvents: 'none',
                zIndex: maxZIndex + 2,
              }}
            >
              {activeTool === 'pointer' && (
                <div style={{ pointerEvents: 'auto', width: '100%', height: '100%', position: 'relative' }}>
                  <ResizeHandle direction="nw" onMouseDown={(e) => handleResizeStart(e, 'group', 'nw')} />
                  <ResizeHandle direction="n" onMouseDown={(e) => handleResizeStart(e, 'group', 'n')} />
                  <ResizeHandle direction="ne" onMouseDown={(e) => handleResizeStart(e, 'group', 'ne')} />
                  <ResizeHandle direction="e" onMouseDown={(e) => handleResizeStart(e, 'group', 'e')} />
                  <ResizeHandle direction="se" onMouseDown={(e) => handleResizeStart(e, 'group', 'se')} />
                  <ResizeHandle direction="s" onMouseDown={(e) => handleResizeStart(e, 'group', 's')} />
                  <ResizeHandle direction="sw" onMouseDown={(e) => handleResizeStart(e, 'group', 'sw')} />
                  <ResizeHandle direction="w" onMouseDown={(e) => handleResizeStart(e, 'group', 'w')} />
                </div>
              )}
            </div>
          );
        })()}

        {/* 空画布引导 */}
        {nodes.filter(node => !node.isHidden).length === 0 && (
          <div style={{
            position: 'absolute', left: 0, top: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            width: window.innerWidth, height: window.innerHeight,
            pointerEvents: 'none', opacity: 0.8
          }}>
            <CompassOutlined style={{ fontSize: 64, color: _isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.03)', marginBottom: 24 }} />
            <Title level={1} style={{ color: _isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.15)', letterSpacing: '2px', margin: '0 0 16px 0', fontWeight: 600 }}>
              {currentModel ? currentModel.name : '无限创作空间'}
            </Title>
            <Text style={{ color: _isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.15)', fontSize: 16, maxWidth: 440, textAlign: 'center', lineHeight: 1.6, fontWeight: 300 }}>
              {currentModel
                ? '拖滑视图，无限蔓延。你可以在这里将所有的创意编织流转成多模态宇宙。'
                : '请在侧边栏选择模型体验，生成的内容将汇聚在无限画布中。'}
            </Text>
          </div>
        )}
      </div>

      {/* 选框层：独立于 transform-layer，坐标系为外层容器 */}
      <div 
        className="marquee-box"
        style={{
          position: 'absolute',
          display: 'none',
          background: 'rgba(22, 119, 255, 0.2)',
          border: '1px solid #1677ff',
          pointerEvents: 'none',
          zIndex: 9999,
        }} 
      />
    </div>
  );
});

InfiniteCanvas.displayName = 'InfiniteCanvas';
export default InfiniteCanvas;
