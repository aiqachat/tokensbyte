/**
 * 无限画布容器
 * 负责网格背景、变换层、鼠标事件代理
 */
import React from 'react';
import { Typography, Spin } from 'antd';
import { CompassOutlined } from '@ant-design/icons';
import { useCanvas } from '../context/PlaygroundContext';
import { usePlayground } from '../context/PlaygroundContext';
import { useCanvasInteraction } from '../hooks/useCanvasInteraction';
import CanvasNode from './nodes/CanvasNode';

const { Title, Text } = Typography;

const InfiniteCanvas: React.FC = React.memo(() => {
  const {
    canvasTransform, canvasRef,
    activeTool, isSpaceDown, isDraggingCanvas,
    nodes,
  } = useCanvas();
  const { loading, currentModel } = usePlayground();
  const {
    handleWheel, handleCanvasMouseDown,
    handleCanvasMouseMove, handleCanvasMouseUp,
  } = useCanvasInteraction();

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <Spin size="large" />
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
        backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px)',
        backgroundSize: `${20 * canvasTransform.scale}px ${20 * canvasTransform.scale}px`,
        backgroundPosition: `${canvasTransform.x}px ${canvasTransform.y}px`
      }}
      onWheel={handleWheel}
      onMouseDown={handleCanvasMouseDown}
      onMouseMove={handleCanvasMouseMove}
      onMouseUp={handleCanvasMouseUp}
      onMouseLeave={handleCanvasMouseUp}
    >
      {/* 变换层 */}
      <div style={{
        position: 'absolute',
        transformOrigin: '0 0',
        transform: `translate(${canvasTransform.x}px, ${canvasTransform.y}px) scale(${canvasTransform.scale})`
      }}>
        {nodes.map(node => <CanvasNode key={node.id} node={node} />)}

        {/* 空画布引导 */}
        {nodes.length === 0 && (
          <div style={{
            position: 'absolute', left: 0, top: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            width: window.innerWidth, height: window.innerHeight,
            pointerEvents: 'none', opacity: 0.8
          }}>
            <CompassOutlined style={{ fontSize: 64, color: 'rgba(255,255,255,0.03)', marginBottom: 24 }} />
            <Title level={1} style={{ color: 'rgba(255,255,255,0.15)', letterSpacing: '2px', margin: '0 0 16px 0', fontWeight: 600 }}>
              {currentModel ? currentModel.name : '无限创作空间'}
            </Title>
            <Text style={{ color: 'rgba(255,255,255,0.15)', fontSize: 16, maxWidth: 440, textAlign: 'center', lineHeight: 1.6, fontWeight: 300 }}>
              {currentModel
                ? '拖滑视图，无限蔓延。你可以在这里将所有的创意编织流转成多模态宇宙。'
                : '请在侧边栏选择模型体验，生成的内容将汇聚在无限画布中。'}
            </Text>
          </div>
        )}
      </div>
    </div>
  );
});

InfiniteCanvas.displayName = 'InfiniteCanvas';
export default InfiniteCanvas;
