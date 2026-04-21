/**
 * 画布节点外壳组件
 * 负责标题栏、拖拽手柄、状态指示、关闭按钮
 * 内容区域根据 node.type 委托给具体的 Content 组件
 */
import React from 'react';
import { Typography, Tooltip } from 'antd';
import {
  VideoCameraOutlined, PictureOutlined, FileTextOutlined,
  CloseOutlined, LoadingOutlined
} from '@ant-design/icons';
import type { CanvasNode as CanvasNodeType } from '../../types';
import { useCanvas } from '../../context/PlaygroundContext';
import { useCanvasInteraction } from '../../hooks/useCanvasInteraction';
import VideoNodeContent from './VideoNodeContent';
import ImageNodeContent from './ImageNodeContent';
import TextNodeContent from './TextNodeContent';

const { Text } = Typography;

interface Props {
  node: CanvasNodeType;
}

const CanvasNode: React.FC<Props> = React.memo(({ node }) => {
  const { draggingNodeId, activeTool } = useCanvas();
  const { handleNodeMouseDown, removeNode } = useCanvasInteraction();

  const isDragging = draggingNodeId === node.id;

  const typeIcon = node.type === 'video'
    ? <VideoCameraOutlined />
    : node.type === 'image'
    ? <PictureOutlined />
    : <FileTextOutlined />;

  const typeLabel = node.type === 'video' ? 'AI 视频' : node.type === 'image' ? 'AI 图像' : '文本生成';

  return (
    <div
      style={{
        position: 'absolute',
        left: node.x,
        top: node.y,
        width: node.width,
        height: node.height,
        zIndex: node.zIndex,
        background: '#1A1B1E',
        borderRadius: 16,
        border: `1px solid ${isDragging ? '#A2C1FF' : 'rgba(255,255,255,0.08)'}`,
        boxShadow: isDragging ? '0 8px 32px rgba(162,193,255,0.2)' : '0 4px 20px rgba(0,0,0,0.4)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: isDragging ? 'none' : 'box-shadow 0.2s',
        cursor: activeTool === 'pointer' ? 'grab' : 'default'
      }}
      onMouseDown={(e) => handleNodeMouseDown(e, node.id, node.x, node.y)}
    >
      {/* 标题栏 */}
      <div
        style={{
          padding: '8px 12px', background: 'rgba(0,0,0,0.25)',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          fontSize: 12, color: 'rgba(255,255,255,0.6)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          cursor: 'inherit', backdropFilter: 'blur(4px)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {typeIcon}
          <span style={{ fontWeight: 500 }}>{typeLabel}</span>
        </div>
        <Tooltip title="移除节点">
          <CloseOutlined
            style={{ padding: 4, cursor: 'pointer', opacity: 0.6, transition: 'opacity 0.2s' }}
            onClick={(e) => { e.stopPropagation(); removeNode(node.id); }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.6')}
          />
        </Tooltip>
      </div>

      {/* 内容区域 */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
        {node.status === 'loading' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <LoadingOutlined style={{ fontSize: 32, color: '#A2C1FF' }} />
            <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>
              {node.taskData?.task_id ? '生成中...' : '排队中...'}
            </Text>
          </div>
        )}
        {node.status === 'error' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 16 }}>
            <Text style={{ color: '#ff4d4f', fontSize: 14 }}>生成失败</Text>
            <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, textAlign: 'center' }}>
              {node.resultData?.message}
            </Text>
          </div>
        )}
        {node.status === 'completed' && node.type === 'video' && (
          <VideoNodeContent resultData={node.resultData} />
        )}
        {node.status === 'completed' && node.type === 'image' && (
          <ImageNodeContent resultData={node.resultData} />
        )}
        {node.status === 'completed' && node.type === 'text' && (
          <TextNodeContent resultData={node.resultData} />
        )}
      </div>
    </div>
  );
});

CanvasNode.displayName = 'CanvasNode';
export default CanvasNode;
