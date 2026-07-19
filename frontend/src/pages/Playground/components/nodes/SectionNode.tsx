import React, { useState, useMemo, useEffect } from 'react';
import { Input, Tooltip, Popover } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import { useCanvas, usePlayground } from '../../context/PlaygroundContext';
import { useThemeStore } from '../../../../store/theme';
import { ResizeHandle } from './ResizeHandle';
import type { ResizeDirection } from './ResizeHandle';
import type { CanvasNode } from '../../types';

interface SectionNodeProps {
  node: CanvasNode;
  isSelected: boolean;
  isDragging: boolean;
  activeTool: string;
  onMouseDown: (e: React.MouseEvent, id: string, x: number, y: number) => void;
  onRemove: (id: string) => void;
  onSelect: (id: string, e?: React.MouseEvent) => void;
  onResizeStart?: (e: React.MouseEvent, nodeId: string, direction: ResizeDirection) => void;
  isMobile?: boolean;
}

const COLOR_PRESETS = [
  { key: 'gray', label: '默认灰', color: '#71717a', bgLight: 'rgba(113,113,122,0.02)', bgDark: 'rgba(113,113,122,0.04)', borderLight: 'rgba(0,0,0,0.15)', borderDark: 'rgba(255,255,255,0.15)' },
  { key: 'blue', label: '天蓝色', color: '#1677ff', bgLight: 'rgba(22,119,255,0.025)', bgDark: 'rgba(22,119,255,0.05)', borderLight: 'rgba(22,119,255,0.3)', borderDark: 'rgba(22,119,255,0.5)' },
  { key: 'purple', label: '薰衣草', color: '#9333ea', bgLight: 'rgba(147,51,234,0.025)', bgDark: 'rgba(147,51,234,0.05)', borderLight: 'rgba(147,51,234,0.3)', borderDark: 'rgba(147,51,234,0.5)' },
  { key: 'green', label: '薄荷绿', color: '#10b981', bgLight: 'rgba(16,185,129,0.025)', bgDark: 'rgba(16,185,129,0.05)', borderLight: 'rgba(16,185,129,0.3)', borderDark: 'rgba(16,185,129,0.5)' },
  { key: 'orange', label: '珊瑚橙', color: '#f97316', bgLight: 'rgba(249,115,22,0.025)', bgDark: 'rgba(249,115,22,0.05)', borderLight: 'rgba(249,115,22,0.3)', borderDark: 'rgba(249,115,22,0.5)' },
  { key: 'pink', label: '玫瑰粉', color: '#ec4899', bgLight: 'rgba(236,72,153,0.025)', bgDark: 'rgba(236,72,153,0.05)', borderLight: 'rgba(236,72,153,0.3)', borderDark: 'rgba(236,72,153,0.5)' },
];

const SectionNode: React.FC<SectionNodeProps> = React.memo(({
  node, isSelected, isDragging, activeTool,
  onMouseDown, onRemove, onSelect, onResizeStart,
  isMobile = false
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [title, setTitle] = useState(node.title || 'Section');

  // Bug fix: 当外部 node.title 变化时（如撤销/重做），同步更新本地 state
  useEffect(() => {
    setTitle(node.title || 'Section');
  }, [node.title]);

  const { setNodes } = useCanvas();
  const { saveCanvasState } = usePlayground();
  const { themeMode } = useThemeStore();
  const _isLight = themeMode === 'light';

  const presetKey = node.backgroundColor || 'gray';
  const currentPreset = useMemo(() => {
    return COLOR_PRESETS.find(p => p.key === presetKey) || COLOR_PRESETS[0];
  }, [presetKey]);

  const handleSelectColor = (colorKey: string) => {
    setNodes(prev => {
      const next = prev.map(n => n.id === node.id ? { ...n, backgroundColor: colorKey } : n);
      saveCanvasState(next);
      return next;
    });
  };

  const handleFinishRename = () => {
    setIsRenaming(false);
    const trimmedTitle = title.slice(0, 24).trim();
    // Bug fix: 如果用户清空了标题，恢复为原标题或默认值
    if (!trimmedTitle) {
      setTitle(node.title || 'Section');
      return;
    }
    if (trimmedTitle === node.title) return;
    setNodes(prev => {
      const next = prev.map(n => n.id === node.id ? { ...n, title: trimmedTitle } : n);
      saveCanvasState(next);
      return next;
    });
  };

  const handleResizeMouseDown = (e: React.MouseEvent, dir: ResizeDirection) => {
    if (onResizeStart) {
      onResizeStart(e, node.id, dir);
    }
  };

  // Header tab style matching Figma
  const headerBgColor = isSelected
    ? currentPreset.color
    : _isLight ? '#f4f4f5' : '#27272a';
  const headerTextColor = isSelected
    ? '#ffffff'
    : _isLight ? '#1f2937' : '#e4e4e7';
  const headerBorderColor = isSelected
    ? currentPreset.color
    : _isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)';

  const colorPickerContent = (
    <div style={{ display: 'flex', gap: 6, padding: '4px 2px', userSelect: 'none' }}>
      {COLOR_PRESETS.map(p => (
        <Tooltip key={p.key} title={p.label}>
          <div
            onClick={() => handleSelectColor(p.key)}
            style={{
              width: 16,
              height: 16,
              borderRadius: '50%',
              backgroundColor: p.color,
              cursor: 'pointer',
              border: presetKey === p.key ? '2px solid #fff' : 'none',
              boxShadow: presetKey === p.key ? '0 0 0 2px ' + p.color : '0 1px 4px rgba(0,0,0,0.15)',
              transform: presetKey === p.key ? 'scale(1.1)' : 'none',
              transition: 'transform 0.1s',
            }}
          />
        </Tooltip>
      ))}
    </div>
  );

  // Section body 拖拽处理：允许从 body 空白区域拖拽 Section
  const handleBodyMouseDown = (e: React.MouseEvent) => {
    if (activeTool === 'pointer' && !isRenaming) {
      // 只在直接点击 body 时响应（非子节点冒泡）
      if ((e.target as HTMLElement).dataset.sectionBody === node.id) {
        onSelect(node.id, e);
        onMouseDown(e, node.id, node.x, node.y);
      }
    }
  };

  return (
    <div
      data-node-id={node.id}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        position: isMobile ? 'relative' : 'absolute',
        left: isMobile ? undefined : node.x,
        top: isMobile ? undefined : node.y,
        width: isMobile ? '100%' : node.width,
        height: isMobile ? undefined : node.height,
        aspectRatio: isMobile ? `${node.width || 400}/${node.height || 300}` : undefined,
        // Section z-index: 保持在 AI 节点之下，但 Section 之间保持相对顺序
        zIndex: isMobile ? undefined : Math.min(node.zIndex || 1, 9),
        pointerEvents: 'none', // 外层容器透传事件
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Figma-like Header Title Tab */}
      <div
        onMouseDown={(e) => {
          if (activeTool === 'pointer' && !isRenaming) {
            onSelect(node.id, e);
            onMouseDown(e, node.id, node.x, node.y);
          }
        }}
        style={{
          position: 'absolute',
          top: -28,
          left: 0,
          height: 28,
          padding: '0 12px',
          background: headerBgColor,
          color: headerTextColor,
          borderTopLeftRadius: 6,
          borderTopRightRadius: 6,
          border: `1px solid ${headerBorderColor}`,
          borderBottom: 'none',
          fontSize: 12,
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          cursor: isMobile ? 'pointer' : (activeTool === 'pointer' ? (isDragging ? 'grabbing' : 'grab') : 'default'),
          pointerEvents: 'auto', // Enable pointer events for header tab dragging
          userSelect: 'none',
          boxShadow: isSelected ? '0 -4px 12px rgba(22,119,255,0.1)' : 'none',
        }}
      >
        {isRenaming ? (
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, 24))}
            maxLength={24}
            onBlur={handleFinishRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleFinishRename();
              if (e.key === 'Escape') {
                setTitle(node.title || 'Section');
                setIsRenaming(false);
              }
            }}
            autoFocus
            size="small"
            style={{
              width: 100,
              height: 20,
              fontSize: 11,
              padding: '0 4px',
              background: _isLight ? '#fff' : '#1f1f23',
              color: _isLight ? '#000' : '#fff',
              border: '1px solid #1677ff',
            }}
          />
        ) : (
          <span
            onDoubleClick={(e) => {
              e.stopPropagation();
              setIsRenaming(true);
            }}
            style={{ display: 'inline-block', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {node.title || 'Section'}
          </span>
        )}

        {(isHovered || isSelected) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, pointerEvents: 'auto' }}>
            <Popover
              content={colorPickerContent}
              trigger="click"
              placement="bottom"
              overlayStyle={{ zIndex: 3100 }}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  padding: '3px',
                  borderRadius: '50%',
                  background: isSelected ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.06)',
                  color: headerTextColor,
                  transition: 'background 0.2s, color 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = isSelected ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.12)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = isSelected ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.06)';
                }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 14.7255 3.09032 17.1962 4.85857 19C5.35249 19.5 5.25992 20.3541 4.7823 20.8317L4.70711 20.9069C4.31658 21.2974 3.68342 21.2974 3.29289 20.9069C1.8842 19.4982 1 17.5492 1 15.3957C1 14.0772 1.35338 12.8412 1.9723 11.7686" />
                  <circle cx="7.5" cy="10.5" r="1.5" fill="currentColor" />
                  <circle cx="11.5" cy="7.5" r="1.5" fill="currentColor" />
                  <circle cx="16.5" cy="9.5" r="1.5" fill="currentColor" />
                  <circle cx="15.5" cy="14.5" r="1.5" fill="currentColor" />
                </svg>
              </div>
            </Popover>

            <Tooltip title="移除区块" placement="top">
              <CloseOutlined
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(node.id);
                }}
                style={{
                  fontSize: 8,
                  cursor: 'pointer',
                  padding: '4px',
                  borderRadius: '50%',
                  background: isSelected ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.06)',
                  color: headerTextColor,
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#ff4d4f';
                  e.currentTarget.style.color = '#fff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = isSelected ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.06)';
                  e.currentTarget.style.color = headerTextColor;
                }}
              />
            </Tooltip>
          </div>
        )}
      </div>

      {/* Section Background Body Box — 可拖拽区域 */}
      <div
        data-section-body={node.id}
        onMouseDown={handleBodyMouseDown}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: '100%',
          height: '100%',
          borderRadius: '0 8px 8px 8px',
          border: `${isSelected ? '2px' : '1px'} solid ${isSelected ? currentPreset.color : (_isLight ? currentPreset.borderLight : currentPreset.borderDark)}`,
          background: isSelected
            ? (_isLight ? currentPreset.bgLight.replace('0.025', '0.05') : currentPreset.bgDark.replace('0.05', '0.08'))
            : (_isLight ? currentPreset.bgLight : currentPreset.bgDark),
          backdropFilter: 'blur(1px)',
          boxShadow: isSelected ? `0 8px 24px ${currentPreset.color}20` : 'none',
          transition: isDragging ? 'none' : 'border-color 0.2s, background 0.2s',
          pointerEvents: 'auto', // 允许从 body 空白区域拖拽 Section
          cursor: isMobile ? 'default' : (activeTool === 'pointer' ? (isDragging ? 'grabbing' : 'grab') : 'default'),
        }}
      />

      {/* Selection Resize Handles */}
      {isSelected && !isMobile && activeTool === 'pointer' && (
        <div style={{ pointerEvents: 'auto' }}>
          <ResizeHandle direction="nw" onMouseDown={handleResizeMouseDown} />
          <ResizeHandle direction="n" onMouseDown={handleResizeMouseDown} />
          <ResizeHandle direction="ne" onMouseDown={handleResizeMouseDown} />
          <ResizeHandle direction="e" onMouseDown={handleResizeMouseDown} />
          <ResizeHandle direction="se" onMouseDown={handleResizeMouseDown} />
          <ResizeHandle direction="s" onMouseDown={handleResizeMouseDown} />
          <ResizeHandle direction="sw" onMouseDown={handleResizeMouseDown} />
          <ResizeHandle direction="w" onMouseDown={handleResizeMouseDown} />
        </div>
      )}
    </div>
  );
});

SectionNode.displayName = 'SectionNode';
export default SectionNode;
