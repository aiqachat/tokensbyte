/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import React, { useRef, useCallback, useEffect, useMemo, useState } from 'react';
import { Typography, Tooltip, Slider } from 'antd';
import { FolderOpenOutlined, CloseOutlined, PictureOutlined, VideoCameraOutlined, DownloadOutlined, CheckOutlined } from '@ant-design/icons';
import { useCanvas, usePlayground } from '../context/PlaygroundContext';
import { useThemeStore } from '../../../store/theme';
import { extractVideoUrl } from '../utils/resultExtractor';
import JSZip from 'jszip';
import { parseApiTimeAsUtc } from '../../../utils/timedisplay';

const { Text } = Typography;

const safeParseDate = (dateStr?: string | null): Date => {
  return parseApiTimeAsUtc(dateStr) ?? new Date(NaN);
};

// 缩放矢量图标以保障高级的视觉质感与高兼容性
const ZoomOutIcon: React.FC = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
    <circle cx="11" cy="11" r="8"></circle>
    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
    <line x1="8" y1="11" x2="14" y2="11"></line>
  </svg>
);

const ZoomInIcon: React.FC = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
    <circle cx="11" cy="11" r="8"></circle>
    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
    <line x1="11" y1="8" x2="11" y2="14"></line>
    <line x1="8" y1="11" x2="14" y2="11"></line>
  </svg>
);

// 从 URL 解析文件名与后缀，保证下载文件名具有可读性
const getFileNameFromUrl = (url: string, defaultName: string) => {
  if (!url) return defaultName;
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const filename = pathname.substring(pathname.lastIndexOf('/') + 1);
    if (filename && filename.includes('.')) {
      return decodeURIComponent(filename);
    }
  } catch (e) {
    // ignore
  }
  return defaultName;
};

// ============================================================
// 单个素材卡片预览组件 (集成加载防错、Shadcn 风格占位、多选框及一键下载)
// ============================================================
interface ResourcePreviewItemProps {
  res: any;
  themeMode: string;
  currentCols: number;
  onRestore: () => void;
  selectedIds: Set<string>;
  isSelectionMode: boolean;
  onToggleSelect: (id: string) => void;
}

const ResourcePreviewItem: React.FC<ResourcePreviewItemProps> = React.memo(({
  res,
  themeMode,
  currentCols,
  onRestore,
  selectedIds,
  isSelectionMode,
  onToggleSelect
}) => {
  const _isLight = themeMode === 'light';
  const [hasError, setHasError] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const isSelected = selectedIds.has(res.id);

  let imgUrl = '';
  let videoUrl = '';

  if (res.type === 'image') {
    imgUrl = typeof res.resultData?.data?.[0] === 'string'
      ? res.resultData?.data?.[0]
      : res.resultData?.data?.[0]?.url || '';
  } else if (res.type === 'video') {
    videoUrl = extractVideoUrl(res.resultData);
    imgUrl = res.resultData?.data?.[0]?.cover_url || '';
  }

  const renderContent = () => {
    // URL 不存在或加载失败时的优雅灰色占位
    if (hasError || (!imgUrl && !videoUrl)) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          background: _isLight ? '#f4f4f5' : '#18181b',
          color: _isLight ? '#a1a1aa' : '#71717a',
          gap: 6,
          userSelect: 'none'
        }}>
          {res.type === 'video' ? (
            <VideoCameraOutlined style={{ fontSize: currentCols >= 6 ? 16 : 20, opacity: 0.5 }} />
          ) : (
            <PictureOutlined style={{ fontSize: currentCols >= 6 ? 16 : 20, opacity: 0.5 }} />
          )}
          {currentCols <= 4 && (
            <span style={{ fontSize: 10, opacity: 0.5, letterSpacing: '0.05em' }}>加载失败</span>
          )}
        </div>
      );
    }

    if (res.type === 'video' && videoUrl) {
      return (
        <video
          src={videoUrl}
          poster={imgUrl}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          muted
          loop
          playsInline
          disablePictureInPicture
          onError={() => setHasError(true)}
          onMouseEnter={e => e.currentTarget.play()}
          onMouseLeave={e => {
            e.currentTarget.pause();
            e.currentTarget.currentTime = 0;
          }}
        />
      );
    }

    return (
      <img
        src={imgUrl}
        alt=""
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        onError={() => setHasError(true)}
      />
    );
  };

  // 单个资源的一键下载方法 (支持跨域 Blob 下载及 A 标签降级)
  const handleDownloadSingle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const downloadUrl = res.type === 'video' ? videoUrl : imgUrl;
    if (!downloadUrl) return;

    setIsDownloading(true);
    const defaultExt = res.type === 'video' ? 'mp4' : 'png';
    const finalFileName = getFileNameFromUrl(downloadUrl, `resource-${res.id}.${defaultExt}`);

    try {
      const response = await fetch(downloadUrl);
      if (!response.ok) throw new Error('Fetch failed');
      const blob = await response.blob();
      const tempUrl = window.URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = tempUrl;
      a.download = finalFileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(tempUrl);
    } catch (err) {
      console.warn('CORS限制或下载异常，采用新窗口打开降级方案', err);
      window.open(downloadUrl, '_blank');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleCardClick = () => {
    if (isSelectionMode) {
      onToggleSelect(res.id);
    } else {
      onRestore();
    }
  };

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleSelect(res.id);
  };

  // 控制多选框显隐：已勾选，或是处于多选勾选状态下，或者是鼠标悬浮其上
  const showCheckbox = isSelected || isSelectionMode || isHovered;
  // 控制一键下载图标显隐：鼠标悬浮其上，且当前非多选批量模式
  const showDownload = isHovered && !isSelectionMode && !isDownloading && (imgUrl || videoUrl) && !hasError;

  return (
    <div
      draggable={!isSelectionMode}
      onDragStart={(e) => {
        if (!isSelectionMode) {
          e.dataTransfer.effectAllowed = 'copy';
          e.dataTransfer.setData('application/json', JSON.stringify({ type: 'resource', resource: res }));
        }
      }}
      onClick={handleCardClick}
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '1',
        background: _isLight ? '#f4f4f5' : '#09090b',
        borderRadius: 8,
        overflow: 'hidden',
        border: isSelected
          ? (_isLight ? '1.5px solid #09090b' : '1.5px solid #fafafa')
          : (_isLight ? '1px solid #e4e4e7' : '1px solid #27272a'),
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
      onMouseEnter={(e) => {
        setIsHovered(true);
        if (!isSelected) {
          e.currentTarget.style.borderColor = _isLight ? '#a1a1aa' : '#3f3f46';
        }
        e.currentTarget.style.transform = 'scale(1.02)';
      }}
      onMouseLeave={(e) => {
        setIsHovered(false);
        if (!isSelected) {
          e.currentTarget.style.borderColor = _isLight ? '#e4e4e7' : '#27272a';
        }
        e.currentTarget.style.transform = 'none';
      }}
    >
      {renderContent()}

      {/* 左上角多选复选框 (Shadcn UI Checkbox 风格圆形选择钮) */}
      {showCheckbox && (
        <div
          onClick={handleCheckboxClick}
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            width: 18,
            height: 18,
            borderRadius: '50%',
            border: isSelected
              ? (_isLight ? '1px solid #09090b' : '1px solid #fafafa')
              : (_isLight ? '1px solid rgba(0,0,0,0.3)' : '1px solid rgba(255,255,255,0.4)'),
            background: isSelected
              ? (_isLight ? '#09090b' : '#fafafa')
              : 'rgba(0,0,0,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1012,
            transition: 'all 0.15s ease',
            backdropFilter: 'blur(4px)'
          }}
        >
          {isSelected && (
            <CheckOutlined style={{ fontSize: 9, color: _isLight ? '#fff' : '#09090b', fontWeight: 'bold' }} />
          )}
        </div>
      )}

      {/* 右上角单张一键下载按钮 (Shadcn icon button 风格) */}
      {showDownload && (
        <Tooltip title="下载此资源" mouseEnterDelay={0.5}>
          <div
            onClick={handleDownloadSingle}
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              width: 22,
              height: 22,
              borderRadius: 6,
              background: _isLight ? 'rgba(255,255,255,0.85)' : 'rgba(9,9,11,0.85)',
              border: _isLight ? '1px solid #e4e4e7' : '1px solid #27272a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: _isLight ? '#09090b' : '#fafafa',
              zIndex: 1012,
              transition: 'all 0.15s ease',
              backdropFilter: 'blur(4px)'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = _isLight ? '#09090b' : '#fafafa';
              e.currentTarget.style.color = _isLight ? '#ffffff' : '#09090b';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = _isLight ? 'rgba(255,255,255,0.85)' : 'rgba(9,9,11,0.85)';
              e.currentTarget.style.color = _isLight ? '#09090b' : '#fafafa';
            }}
          >
            <DownloadOutlined style={{ fontSize: 11 }} />
          </div>
        </Tooltip>
      )}

      {isDownloading && (
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontSize: 10,
          zIndex: 1013
        }}>
          下载中...
        </div>
      )}

      {/* 右下角类型标识 (Shadcn Badge 风格) */}
      <div style={{
        position: 'absolute',
        bottom: 6,
        right: 6,
        background: _isLight ? 'rgba(255,255,255,0.9)' : 'rgba(9,9,11,0.9)',
        border: _isLight ? '1px solid #e4e4e7' : '1px solid #27272a',
        borderRadius: 4,
        padding: '1px 5px',
        fontSize: 9,
        fontWeight: 500,
        color: _isLight ? '#09090b' : '#fafafa',
        backdropFilter: 'blur(4px)',
        userSelect: 'none',
        lineHeight: '1.2',
        pointerEvents: 'none'
      }}>
        {res.type === 'video' ? '视频' : '图片'}
      </div>

      {/* 隐藏状态覆盖层 (无背景模糊) */}
      {res.isHidden && (
        <div style={{
          position: 'absolute',
          inset: 0,
          background: _isLight ? 'rgba(255,255,255,0.5)' : 'rgba(9,9,11,0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.2s',
          pointerEvents: isSelectionMode ? 'none' : 'auto' // 批勾选状态下遮罩层不影响卡片直接点选
        }}>
          <Text style={{
            color: '#ffffff',
            fontSize: currentCols >= 6 ? 10 : 11,
            fontWeight: 500,
            background: 'rgba(0, 0, 0, 0.65)',
            border: 'none',
            padding: '3px 8px',
            borderRadius: 6,
            userSelect: 'none'
          }}>
            恢复
          </Text>
        </div>
      )}
    </div>
  );
});
ResourcePreviewItem.displayName = 'ResourcePreviewItem';


// ============================================================
// 主资源管理器面板组件
// ============================================================
const ResourceManagerWidget: React.FC = React.memo(() => {
  const { resourceWidgetPos, setResourceWidgetPos, nodes, setNodes, maxZIndex, setMaxZIndex, handleRearrange } = useCanvas();
  const { isResourceWidgetVisible, setIsResourceWidgetVisible } = usePlayground();
  const { themeMode } = useThemeStore();
  const _isLight = themeMode === 'light';

  // 1. 连续尺寸控制状态 (单位: 像素，默认 68px 大约在 320px 宽度下显示 4 列)
  const [cardSize, setCardSize] = useState<number>(() => {
    const saved = localStorage.getItem('pg-resource-widget-card-size');
    return saved ? parseInt(saved, 10) : 68;
  });

  // 2. 窗口尺寸状态维护 (支持记忆偏好)
  const [width, setWidth] = useState<number>(() => {
    const saved = localStorage.getItem('pg-resource-widget-width');
    return saved ? parseInt(saved, 10) : 320;
  });
  const [height, setHeight] = useState<number>(() => {
    const saved = localStorage.getItem('pg-resource-widget-height');
    return saved ? parseInt(saved, 10) : 600;
  });

  // 3. 批量选择与压缩打包下载状态
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isPacking, setIsPacking] = useState(false);
  const [packingProgress, setPackingProgress] = useState(0);

  // 根据当前面板宽度 width 与卡片尺寸 cardSize，动态计算当前列数 cols (两旁 padding 共 32px，卡片间距 gap 为 10px)
  const currentCols = useMemo(() => {
    const contentWidth = width - 32;
    return Math.max(1, Math.floor((contentWidth + 10) / (cardSize + 10)));
  }, [width, cardSize]);

  const handleRestoreNode = useCallback((id: string) => {
    const newZ = maxZIndex + 1;
    setMaxZIndex(newZ);
    setNodes(prev => prev.map(n => n.id === id ? { ...n, isHidden: false, zIndex: newZ } : n));
  }, [maxZIndex, setMaxZIndex, setNodes]);

  // 筛选出已生成的资源 (图片/视频)
  const resources = useMemo(() => {
    const getMs = (node: any) => {
      const dateStr = node.taskData?.created_at;
      if (dateStr) {
        const ms = safeParseDate(dateStr).getTime();
        if (!isNaN(ms)) return ms;
      }
      if (node.id) {
        if (node.id.startsWith('node-')) {
          const ts = parseInt(node.id.replace('node-', ''), 10);
          if (!isNaN(ts)) return ts;
        }
        if (node.id.startsWith('local-asset-')) {
          const parts = node.id.split('-');
          const ts = parseInt(parts[2], 10);
          if (!isNaN(ts)) return ts;
        }
        if (/^\d{13}/.test(node.id)) {
          const ts = parseInt(node.id.substring(0, 13), 10);
          if (!isNaN(ts)) return ts;
        }
      }
      return 0;
    };

    const getNumericId = (idStr: string) => {
      if (idStr.startsWith('asset-')) {
        return parseInt(idStr.replace('asset-', ''), 10) || 0;
      }
      if (idStr.startsWith('node-')) {
        return parseInt(idStr.replace('node-', ''), 10) || 0;
      }
      if (idStr.startsWith('local-asset-')) {
        const parts = idStr.split('-');
        return parseInt(parts[2], 10) || 0;
      }
      if (/^\d{13}/.test(idStr)) {
        return parseInt(idStr.substring(0, 13), 10) || 0;
      }
      return 0;
    };

    return nodes
      .filter(n => n.status === 'completed' && (n.type === 'image' || n.type === 'video') && !n.isInstance && !n.taskData?.is_instance)
      .sort((a, b) => {
        const ta = getMs(a);
        const tb = getMs(b);
        if (ta !== tb) {
          return tb - ta;
        }
        const numA = getNumericId(a.id);
        const numB = getNumericId(b.id);
        if (numA !== numB) {
          return numB - numA;
        }
        return b.id.localeCompare(a.id);
      });
  }, [nodes]);

  const hasHiddenResources = useMemo(() => {
    return resources.some(r => r.isHidden);
  }, [resources]);

  const handleRestoreAll = useCallback(() => {
    const hiddenResourceNodes = nodes.filter(n =>
      n.status === 'completed' &&
      (n.type === 'image' || n.type === 'video') &&
      n.isHidden &&
      !n.isInstance &&
      !n.taskData?.is_instance
    );

    if (hiddenResourceNodes.length === 0) return;

    const count = hiddenResourceNodes.length;
    const startZ = maxZIndex + 1;
    const newMaxZIndex = maxZIndex + count;
    setMaxZIndex(newMaxZIndex);

    const restoreMap = new Map<string, number>();
    hiddenResourceNodes.forEach((node, index) => {
      restoreMap.set(node.id, startZ + index);
    });

    const nextNodes = nodes.map(n => {
      if (restoreMap.has(n.id)) {
        return {
          ...n,
          isHidden: false,
          zIndex: restoreMap.get(n.id)!
        };
      }
      return n;
    });

    setNodes(nextNodes);
    handleRearrange(nextNodes);
  }, [nodes, maxZIndex, setMaxZIndex, setNodes, handleRearrange]);

  // 批量选择勾选回调
  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // 批量下载并用 jszip 打包压缩为 zip
  const handleDownloadZip = async () => {
    if (selectedIds.size === 0) return;
    setIsPacking(true);
    setPackingProgress(0);

    const selectedList = resources.filter(res => selectedIds.has(res.id));
    const zip = new JSZip();

    try {
      for (let i = 0; i < selectedList.length; i++) {
        const res = selectedList[i];
        setPackingProgress(i + 1);

        let url = '';
        if (res.type === 'image') {
          url = typeof res.resultData?.data?.[0] === 'string'
            ? res.resultData?.data?.[0]
            : res.resultData?.data?.[0]?.url || '';
        } else if (res.type === 'video') {
          url = extractVideoUrl(res.resultData);
        }

        if (!url) continue;

        try {
          const response = await fetch(url);
          if (!response.ok) throw new Error('Fetch failed');
          const blob = await response.blob();
          
          // 从 url 获取合适的名字，如获取不到则根据格式自命名
          const defaultExt = res.type === 'video' ? 'mp4' : 'png';
          const filename = getFileNameFromUrl(url, `resource-${res.id}.${defaultExt}`);
          
          zip.file(filename, blob);
        } catch (err) {
          console.warn(`读取单个资源失败，跳过打包: ${res.id}`, err);
        }
      }

      // 生成 zip 压缩包并自动下载
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const zipUrl = window.URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = zipUrl;
      a.download = `resources-${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(zipUrl);

      // 下载完毕后清除选中集
      setSelectedIds(new Set());
    } catch (error) {
      console.error('打包压缩 Zip 失败', error);
    } finally {
      setIsPacking(false);
    }
  };

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
    if ((e.target as HTMLElement).closest('button, .ant-tooltip-open, .close-btn, .ant-slider, .resize-handle')) return;

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

  // 尺寸拉伸控制逻辑 (8向)
  const resizeStartRef = useRef({ x: 0, y: 0, w: 0, h: 0, left: 0, top: 0 });

  const handleResizeMouseDown = useCallback((e: React.MouseEvent, direction: string) => {
    e.stopPropagation();
    e.preventDefault();
    isDraggingRef.current = false;

    resizeStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      w: containerRef.current?.offsetWidth || width,
      h: containerRef.current?.offsetHeight || height,
      left: posRef.current.x,
      top: posRef.current.y
    };

    const handleMouseMove = (ev: MouseEvent) => {
      const dx = ev.clientX - resizeStartRef.current.x;
      const dy = ev.clientY - resizeStartRef.current.y;

      let newWidth = resizeStartRef.current.w;
      let newHeight = resizeStartRef.current.h;
      let newLeft = resizeStartRef.current.left;
      let newTop = resizeStartRef.current.top;

      if (direction.includes('e')) {
        newWidth = Math.max(240, Math.min(1000, resizeStartRef.current.w + dx));
      }
      if (direction.includes('s')) {
        const maxHeightBound = window.innerHeight - 120;
        newHeight = Math.max(300, Math.min(maxHeightBound, resizeStartRef.current.h + dy));
      }
      if (direction.includes('w')) {
        const possibleWidth = resizeStartRef.current.w - dx;
        newWidth = Math.max(240, Math.min(1000, possibleWidth));
        if (possibleWidth >= 240 && possibleWidth <= 1000) {
          newLeft = resizeStartRef.current.left + dx;
        }
      }
      if (direction.includes('n')) {
        const possibleHeight = resizeStartRef.current.h - dy;
        const maxHeightBound = window.innerHeight - 120;
        newHeight = Math.max(300, Math.min(maxHeightBound, possibleHeight));
        if (possibleHeight >= 300 && possibleHeight <= maxHeightBound) {
          newTop = resizeStartRef.current.top + dy;
        }
      }

      setWidth(newWidth);
      setHeight(newHeight);

      if (containerRef.current) {
        containerRef.current.style.width = `${newWidth}px`;
        containerRef.current.style.height = `${newHeight}px`;
        containerRef.current.style.left = `${newLeft}px`;
        containerRef.current.style.top = `${newTop}px`;
      }
      posRef.current = { x: newLeft, y: newTop };
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);

      setResourceWidgetPos({ x: posRef.current.x, y: posRef.current.y });
      const finalW = containerRef.current?.offsetWidth || width;
      const finalH = containerRef.current?.offsetHeight || height;
      localStorage.setItem('pg-resource-widget-width', String(finalW));
      localStorage.setItem('pg-resource-widget-height', String(finalH));
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [width, height, setResourceWidgetPos]);

  const isSelectionMode = selectedIds.size > 0;

  if (!isResourceWidgetVisible) return null;

  // 8向拉伸边框的属性定义
  const resizeHandles = [
    { dir: 'n', cursor: 'ns-resize', style: { top: -4, left: 8, right: 8, height: 8 } },
    { dir: 's', cursor: 'ns-resize', style: { bottom: -4, left: 8, right: 8, height: 8 } },
    { dir: 'e', cursor: 'ew-resize', style: { right: -4, top: 8, bottom: 8, width: 8 } },
    { dir: 'w', cursor: 'ew-resize', style: { left: -4, top: 8, bottom: 8, width: 8 } },
    { dir: 'nw', cursor: 'nwse-resize', style: { left: -4, top: -4, width: 12, height: 12 } },
    { dir: 'ne', cursor: 'nesw-resize', style: { right: -4, top: -4, width: 12, height: 12 } },
    { dir: 'se', cursor: 'nwse-resize', style: { right: -4, bottom: -4, width: 12, height: 12 } },
    { dir: 'sw', cursor: 'nesw-resize', style: { left: -4, bottom: -4, width: 12, height: 12 } },
  ];

  return (
    <div
      ref={containerRef}
      className={`pg-resource-widget-${themeMode}`}
      style={{
        position: 'absolute',
        left: resourceWidgetPos.x,
        top: resourceWidgetPos.y,
        width: width,
        height: height,
        background: _isLight ? 'rgba(255,255,255,0.95)' : 'rgba(9,9,11,0.95)',
        borderRadius: 12,
        border: _isLight ? '1px solid #e4e4e7' : '1px solid #27272a',
        boxShadow: _isLight ? '0 10px 30px rgba(0,0,0,0.04)' : '0 10px 30px rgba(0,0,0,0.3)',
        backdropFilter: 'blur(16px)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        zIndex: 1000,
        maxHeight: 'calc(100vh - 120px)'
      }}
      onWheel={(e) => e.stopPropagation()}
    >
      {/* 局部全局注入：定制 Ant Design Slider 皮肤以符合黑白灰 Shadcn 风格 */}
      <style dangerouslySetInnerHTML={{ __html: `
        /* Ant Design Slider Shadcn Dark Override */
        .pg-resource-widget-dark .ant-slider .ant-slider-rail {
          background-color: #27272a !important;
        }
        .pg-resource-widget-dark .ant-slider .ant-slider-track {
          background-color: #fafafa !important;
        }
        .pg-resource-widget-dark .ant-slider .ant-slider-handle::after {
          background-color: #09090b !important;
          border-color: #27272a !important;
          box-shadow: none !important;
        }
        .pg-resource-widget-dark .ant-slider .ant-slider-handle:hover::after,
        .pg-resource-widget-dark .ant-slider .ant-slider-handle:focus::after {
          border-color: #fafafa !important;
          transform: scale(1.15);
        }

        /* Ant Design Slider Shadcn Light Override */
        .pg-resource-widget-light .ant-slider .ant-slider-rail {
          background-color: #e4e4e7 !important;
        }
        .pg-resource-widget-light .ant-slider .ant-slider-track {
          background-color: #09090b !important;
        }
        .pg-resource-widget-light .ant-slider .ant-slider-handle::after {
          background-color: #ffffff !important;
          border-color: #e4e4e7 !important;
          box-shadow: none !important;
        }
        .pg-resource-widget-light .ant-slider .ant-slider-handle:hover::after,
        .pg-resource-widget-light .ant-slider .ant-slider-handle:focus::after {
          border-color: #09090b !important;
          transform: scale(1.15);
        }

        /* 自定义滚动条样式，使其更精细 */
        .pg-resource-widget-scroll::-webkit-scrollbar {
          width: 5px;
          height: 5px;
        }
        .pg-resource-widget-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .pg-resource-widget-scroll::-webkit-scrollbar-thumb {
          background: rgba(120, 120, 120, 0.25);
          border-radius: 4px;
        }
        .pg-resource-widget-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(120, 120, 120, 0.45);
        }
      `}} />

      {/* 8方向调整尺寸拉手边框 */}
      {resizeHandles.map(h => (
        <div
          key={h.dir}
          className="resize-handle"
          onMouseDown={(e) => handleResizeMouseDown(e, h.dir)}
          style={{
            position: 'absolute',
            cursor: h.cursor,
            zIndex: 1010,
            ...h.style
          }}
        />
      ))}

      {/* 拖拽标题栏 (Shadcn Header 风格) */}
      <div
        onMouseDown={handleMouseDown}
        style={{
          padding: '0 20px', height: 48, minHeight: 48,
          borderBottom: _isLight ? '1px solid #e4e4e7' : '1px solid #27272a',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          cursor: 'grab',
          background: _isLight ? '#fafafa' : '#131315',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <FolderOpenOutlined style={{ color: _isLight ? '#09090b' : '#fafafa', fontSize: 15 }} />
          <Text style={{ color: _isLight ? '#09090b' : '#fafafa', fontSize: 13.5, fontWeight: 600 }}>资源管理器</Text>
          <button
            onClick={handleRestoreAll}
            disabled={!hasHiddenResources}
            style={{
              marginLeft: 12,
              padding: '0 10px',
              height: 26,
              fontSize: '11.5px',
              fontWeight: 500,
              borderRadius: '6px',
              border: _isLight ? '1px solid #e4e4e7' : '1px solid #27272a',
              background: !hasHiddenResources
                ? 'transparent'
                : (_isLight ? '#09090b' : '#fafafa'),
              color: !hasHiddenResources
                ? (_isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)')
                : (_isLight ? '#ffffff' : '#09090b'),
              cursor: !hasHiddenResources ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s ease',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              userSelect: 'none',
              outline: 'none',
              opacity: !hasHiddenResources ? 0.5 : 1
            }}
            onMouseEnter={(e) => {
              if (hasHiddenResources) {
                e.currentTarget.style.background = _isLight ? '#27272a' : '#e4e4e7';
                e.currentTarget.style.color = _isLight ? '#ffffff' : '#09090b';
              }
            }}
            onMouseLeave={(e) => {
              if (hasHiddenResources) {
                e.currentTarget.style.background = _isLight ? '#09090b' : '#fafafa';
                e.currentTarget.style.color = _isLight ? '#ffffff' : '#09090b';
              }
            }}
          >
            全部恢复
          </button>
        </div>
        <Tooltip title="关闭">
          <div
            className="close-btn"
            style={{
              width: 28, height: 28,
              borderRadius: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
              color: _isLight ? '#71717a' : '#a1a1aa',
              transition: 'all 0.2s',
            }}
            onClick={() => setIsResourceWidgetVisible(false)}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = _isLight ? '#f4f4f5' : '#27272a';
              e.currentTarget.style.color = _isLight ? '#09090b' : '#fafafa';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = _isLight ? '#71717a' : '#a1a1aa';
            }}
          >
            <CloseOutlined style={{ fontSize: 13 }} />
          </div>
        </Tooltip>
      </div>

      {/* 缩放控制栏 (Shadcn Tool栏 风格) */}
      <div style={{
        padding: '8px 20px',
        borderBottom: _isLight ? '1px solid #e4e4e7' : '1px solid #27272a',
        display: 'flex',
        alignItems: 'center',
        background: _isLight ? '#fafafa' : '#131315',
        gap: 12,
        userSelect: 'none'
      }}>
        <span style={{ fontSize: 12, color: _isLight ? '#71717a' : '#a1a1aa', whiteSpace: 'nowrap', fontWeight: 500 }}>
          缩放
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
          <ZoomOutIcon />
          <Slider
            min={48}
            max={240}
            step={1}
            value={cardSize}
            onChange={(val) => {
              setCardSize(val);
              localStorage.setItem('pg-resource-widget-card-size', String(val));
            }}
            tooltip={{
              formatter: (v) => `尺寸: ${v}px (当前排显示约 ${currentCols} 列)`
            }}
            style={{ flex: 1, margin: '0 8px' }}
          />
          <ZoomInIcon />
        </div>
        <span style={{ fontSize: 11, color: _isLight ? '#71717a' : '#a1a1aa', minWidth: 42, textAlign: 'right', fontWeight: 500, fontFamily: 'monospace' }}>
          {currentCols} 列
        </span>
      </div>

      {/* 内容区域：网格排列资源 (精细化定制滚动条) */}
      <div className="pg-scroll pg-resource-widget-scroll" style={{
        flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px'
      }}>
        {resources.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: _isLight ? '#71717a' : '#71717a', fontSize: 13 }}>
            暂无生成的资源
          </div>
        ) : (
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: `repeat(auto-fill, minmax(min(${cardSize}px, 100%), 1fr))`, 
            gap: 10 
          }}>
            {resources.map(res => (
              <ResourcePreviewItem
                key={res.id}
                res={res}
                themeMode={themeMode}
                currentCols={currentCols}
                onRestore={() => handleRestoreNode(res.id)}
                selectedIds={selectedIds}
                isSelectionMode={isSelectionMode}
                onToggleSelect={handleToggleSelect}
              />
            ))}
          </div>
        )}
      </div>

      {/* 底部批量管理浮动条 (Shadcn Action Bar 风格) */}
      {selectedIds.size > 0 && (
        <div style={{
          padding: '12px 20px',
          borderTop: _isLight ? '1px solid #e4e4e7' : '1px solid #27272a',
          background: _isLight ? '#fafafa' : '#131315',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          zIndex: 1020,
          userSelect: 'none'
        }}>
          <span style={{ fontSize: 12, color: _isLight ? '#71717a' : '#a1a1aa', fontWeight: 500 }}>
            已选择 <strong style={{ color: _isLight ? '#09090b' : '#fafafa', fontFamily: 'monospace' }}>{selectedIds.size}</strong> 个资源
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setSelectedIds(new Set())}
              disabled={isPacking}
              style={{
                padding: '0 10px',
                height: 26,
                fontSize: '11.5px',
                fontWeight: 500,
                borderRadius: '6px',
                border: _isLight ? '1px solid #e4e4e7' : '1px solid #27272a',
                background: 'transparent',
                color: _isLight ? '#71717a' : '#a1a1aa',
                cursor: isPacking ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                if (!isPacking) {
                  e.currentTarget.style.background = _isLight ? '#f4f4f5' : '#27272a';
                }
              }}
              onMouseLeave={(e) => {
                if (!isPacking) {
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              取消
            </button>
            <button
              onClick={handleDownloadZip}
              disabled={isPacking}
              style={{
                padding: '0 12px',
                height: 26,
                fontSize: '11.5px',
                fontWeight: 500,
                borderRadius: '6px',
                background: _isLight ? '#09090b' : '#fafafa',
                color: _isLight ? '#ffffff' : '#09090b',
                border: 'none',
                cursor: isPacking ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                transition: 'all 0.15s ease',
                opacity: isPacking ? 0.75 : 1
              }}
              onMouseEnter={(e) => {
                if (!isPacking) {
                  e.currentTarget.style.background = _isLight ? '#27272a' : '#e4e4e7';
                }
              }}
              onMouseLeave={(e) => {
                if (!isPacking) {
                  e.currentTarget.style.background = _isLight ? '#09090b' : '#fafafa';
                }
              }}
            >
              {isPacking ? `打包中 (${packingProgress}/${selectedIds.size})...` : '打包下载 (ZIP)'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

ResourceManagerWidget.displayName = 'ResourceManagerWidget';
export default ResourceManagerWidget;
