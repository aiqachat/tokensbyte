/**
 * 画布节点外壳组件
 * 无标题栏的简洁设计，整个节点可拖拽
 * 选中时显示缩放手柄，悬停时显示关闭按钮
 */
import React, { useState } from 'react';
import { Typography, Tooltip } from 'antd';
import {
  CloseOutlined, LoadingOutlined
} from '@ant-design/icons';
import type { CanvasNode as CanvasNodeType } from '../../types';
import VideoNodeContent from './VideoNodeContent';
import ImageNodeContent from './ImageNodeContent';
import TextNodeContent from './TextNodeContent';
import AudioNodeContent from './AudioNodeContent';

const { Text } = Typography;

/** 缩放手柄方向 */
export type ResizeDirection = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

/** 手柄光标映射 */
const RESIZE_CURSORS: Record<ResizeDirection, string> = {
  nw: 'nwse-resize', n: 'ns-resize', ne: 'nesw-resize', e: 'ew-resize',
  se: 'nwse-resize', s: 'ns-resize', sw: 'nesw-resize', w: 'ew-resize',
};

/** 单个缩放手柄 */
const ResizeHandle: React.FC<{
  direction: ResizeDirection;
  onMouseDown: (e: React.MouseEvent, dir: ResizeDirection) => void;
}> = ({ direction, onMouseDown }) => {
  const isCorner = ['nw', 'ne', 'se', 'sw'].includes(direction);
  const size = isCorner ? 10 : 8;

  const posStyle: React.CSSProperties = {};
  if (direction.includes('n')) { posStyle.top = -size / 2; }
  if (direction.includes('s')) { posStyle.bottom = -size / 2; }
  if (direction.includes('w')) { posStyle.left = -size / 2; }
  if (direction.includes('e')) { posStyle.right = -size / 2; }
  if (direction === 'n' || direction === 's') { posStyle.left = '50%'; posStyle.marginLeft = -size / 2; }
  if (direction === 'w' || direction === 'e') { posStyle.top = '50%'; posStyle.marginTop = -size / 2; }

  return (
    <div
      onMouseDown={(e) => { e.stopPropagation(); onMouseDown(e, direction); }}
      style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: '50%',
        background: '#fff',
        border: '2px solid #A2C1FF',
        cursor: RESIZE_CURSORS[direction],
        zIndex: 10,
        boxShadow: '0 0 4px rgba(0,0,0,0.3)',
        ...posStyle,
      }}
    />
  );
};

interface Props {
  node: CanvasNodeType;
  isSelected: boolean;
  isDragging: boolean;
  activeTool: string;
  onMouseDown: (e: React.MouseEvent, id: string, x: number, y: number) => void;
  onRemove: (id: string) => void;
  onSelect: (id: string) => void;
  onResizeStart?: (e: React.MouseEvent, nodeId: string, direction: ResizeDirection) => void;
}

const CanvasNode: React.FC<Props> = React.memo(({
  node, isSelected, isDragging, activeTool,
  onMouseDown, onRemove, onSelect, onResizeStart
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const handleResizeMouseDown = (e: React.MouseEvent, dir: ResizeDirection) => {
    if (onResizeStart) {
      onResizeStart(e, node.id, dir);
    }
  };

  return (
    <div
      data-node-id={node.id}
      onClick={() => onSelect(node.id)}
      onMouseDown={(e) => onMouseDown(e, node.id, node.x, node.y)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        position: 'absolute',
        left: node.x,
        top: node.y,
        width: node.width,
        height: node.height,
        zIndex: node.zIndex,
        background: '#1A1B1E',
        borderRadius: 12,
        border: `${isSelected ? '2px' : '1px'} solid ${isSelected ? '#A2C1FF' : isDragging ? 'rgba(162,193,255,0.5)' : 'rgba(255,255,255,0.08)'}`,
        boxShadow: isSelected
          ? '0 0 0 1px rgba(162,193,255,0.3), 0 8px 32px rgba(162,193,255,0.15)'
          : isDragging
          ? '0 8px 32px rgba(162,193,255,0.2)'
          : '0 4px 20px rgba(0,0,0,0.4)',
        overflow: isSelected ? 'visible' : 'hidden',
        transition: isDragging ? 'none' : 'box-shadow 0.2s, border-color 0.2s',
        cursor: activeTool === 'pointer' ? (isDragging ? 'grabbing' : 'grab') : 'default',
      }}
    >
      {/* 选中状态：缩放手柄 */}
      {isSelected && activeTool === 'pointer' && (
        <>
          <ResizeHandle direction="nw" onMouseDown={handleResizeMouseDown} />
          <ResizeHandle direction="n" onMouseDown={handleResizeMouseDown} />
          <ResizeHandle direction="ne" onMouseDown={handleResizeMouseDown} />
          <ResizeHandle direction="e" onMouseDown={handleResizeMouseDown} />
          <ResizeHandle direction="se" onMouseDown={handleResizeMouseDown} />
          <ResizeHandle direction="s" onMouseDown={handleResizeMouseDown} />
          <ResizeHandle direction="sw" onMouseDown={handleResizeMouseDown} />
          <ResizeHandle direction="w" onMouseDown={handleResizeMouseDown} />
        </>
      )}

      {/* 悬停时：右上角关闭按钮 */}
      {(isHovered || isSelected) && (
        <Tooltip title="移除节点">
          <div
            onClick={(e) => { e.stopPropagation(); onRemove(node.id); }}
            style={{
              position: 'absolute',
              top: -8,
              right: -8,
              width: 22,
              height: 22,
              borderRadius: '50%',
              background: 'rgba(30,31,35,0.95)',
              border: '1px solid rgba(255,255,255,0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              zIndex: 11,
              transition: 'all 0.15s',
              backdropFilter: 'blur(4px)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#ff4d4f';
              e.currentTarget.style.borderColor = '#ff4d4f';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(30,31,35,0.95)';
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
            }}
          >
            <CloseOutlined style={{ fontSize: 10, color: '#fff' }} />
          </div>
        </Tooltip>
      )}

      {/* 内容区域 — 占满整个节点 */}
      <div style={{
        width: '100%', height: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative', overflow: 'hidden', borderRadius: 11,
      }}>
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
        {node.status === 'completed' && node.type === 'audio' && (
          <AudioNodeContent resultData={node.resultData} />
        )}
      </div>
    </div>
  );
});

CanvasNode.displayName = 'CanvasNode';
export default CanvasNode;
