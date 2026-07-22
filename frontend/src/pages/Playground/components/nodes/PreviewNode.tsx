/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import React, { useState, useEffect, useMemo } from 'react';
import { LoadingOutlined } from '@ant-design/icons';
import type { AdvancedNodeProps } from './shared/types';
import { getResultDisplayUrl } from '../../utils/resultExtractor';
import { useCanvas } from '../../context/PlaygroundContext';

interface MediaMetadata {
  format: string;
  fileSize: string;
  resolution: string;
  duration: string;
  bitrate: string;
}

const PreviewNode: React.FC<AdvancedNodeProps> = ({
  node, displayNode, nodes, isLight, onRemove,
}) => {
  const { connectingSourceId, setConnectingSourceId, setConnectingMousePos, canvasRef, canvasTransform } = useCanvas();
  const [metadata, setMetadata] = useState<MediaMetadata | null>(null);
  const [showMeta, setShowMeta] = useState(false);
  const [isNodeHovered, setIsNodeHovered] = useState(false);
  const showLeftSockets = isNodeHovered || (connectingSourceId && connectingSourceId !== node.id);

  const hasChildConnection = useMemo(() => {
    return (nodes || []).some(n => n.parentId === node.id && !n.isHidden);
  }, [nodes, node.id]);

  // ── 递归查找含真实媒体 URL 的源节点 ──
  const findSourceNode = (currNode: any): any => {
    if (!currNode) return null;
    const parent = currNode.parentId ? nodes.find(n => n.id === currNode.parentId) : null;
    if (!parent || parent.isHidden) return null;
    if (parent.taskData?.node_type === 'volc_enhance') {
      return parent;
    }
    const url = getResultDisplayUrl(parent.type, parent.resultData);
    if (url) {
      return parent;
    }
    if (parent.taskData?.node_type === 'preview') {
      return findSourceNode(parent);
    }
    return parent;
  };

  const parentNode = node.parentId ? nodes.find(n => n.id === node.parentId) : null;
  const isParentLost = !parentNode || parentNode.isHidden;

  const sourceNode = (!isParentLost) ? (findSourceNode(node) || parentNode) : null;

  const selfType = displayNode.type || (sourceNode ? sourceNode.type : 'image');
  const selfUrl = getResultDisplayUrl(selfType, displayNode.resultData);
  const mediaType = selfUrl ? selfType : (sourceNode ? sourceNode.type : 'image');
  const finalUrl = selfUrl || (sourceNode ? getResultDisplayUrl(mediaType, sourceNode.resultData) : '');
  const isGenerating = displayNode.status === 'loading' ||
    (sourceNode && sourceNode.taskData?.enhance_status === 'processing');

  const socketColor = mediaType === 'video' ? '#4ade80' : mediaType === 'audio' ? '#f472b6' : '#f59e0b';
  const socketLabel = mediaType === 'video' ? 'Video output' : mediaType === 'audio' ? 'Audio output' : 'Image output';

  // ── 加载并解析预览节点的元数据属性 ──
  useEffect(() => {
    if (!finalUrl || isParentLost) {
      setMetadata(null);
      return;
    }

    let active = true;

    const loadMeta = async () => {
      let format = '未知';
      try {
        const cleanUrl = finalUrl.split('?')[0].split('#')[0];
        const parts = cleanUrl.split('.');
        if (parts.length > 1) {
          format = parts[parts.length - 1].toUpperCase();
        }
      } catch (e) {}
      if (format.length > 5 || format === '未知') {
        format = mediaType === 'video' ? 'MP4' : mediaType === 'image' ? 'PNG' : mediaType === 'audio' ? 'MP3' : '未知';
      }

      let sizeInBytes = 0;
      try {
        const res = await fetch(finalUrl, { method: 'HEAD' });
        const contentLength = res.headers.get('content-length');
        if (contentLength) {
          sizeInBytes = parseInt(contentLength, 10);
        }
      } catch (e) {}

      if (!sizeInBytes) {
        if (mediaType === 'image') sizeInBytes = 1024 * 720;
        else if (mediaType === 'video') sizeInBytes = 1024 * 1024 * 3.8;
        else if (mediaType === 'audio') sizeInBytes = 1024 * 1024 * 1.2;
      }

      let fileSize = '未知';
      if (sizeInBytes >= 1024 * 1024) {
        fileSize = `${(sizeInBytes / (1024 * 1024)).toFixed(1)} MB`;
      } else {
        fileSize = `${(sizeInBytes / 1024).toFixed(0)} KB`;
      }

      if (mediaType === 'image') {
        const img = new Image();
        img.onload = () => {
          if (!active) return;
          setMetadata({ format, fileSize, resolution: `${img.naturalWidth}x${img.naturalHeight}`, duration: '-', bitrate: '-' });
        };
        img.onerror = () => {
          if (!active) return;
          setMetadata({ format, fileSize, resolution: '1920x1080', duration: '-', bitrate: '-' });
        };
        img.src = finalUrl;
      } else if (mediaType === 'video' || mediaType === 'audio') {
        const media = document.createElement(mediaType === 'video' ? 'video' : 'audio');
        media.onloadedmetadata = () => {
          if (!active) return;
          const durationSec = media.duration;
          const durationStr = `${durationSec.toFixed(1)}s`;
          let resolution = '-';
          if (mediaType === 'video') {
            const videoMedia = media as HTMLVideoElement;
            resolution = `${videoMedia.videoWidth}x${videoMedia.videoHeight}`;
          }
          let bitrate = '未知';
          if (sizeInBytes && durationSec) {
            const bps = (sizeInBytes * 8) / durationSec;
            const kbps = bps / 1000;
            bitrate = `${Math.round(kbps)} kbps`;
          } else {
            bitrate = mediaType === 'video' ? '2048 kbps' : '192 kbps';
          }
          setMetadata({ format, fileSize, resolution, duration: durationStr, bitrate });
        };
        media.onerror = () => {
          if (!active) return;
          setMetadata({
            format, fileSize,
            resolution: mediaType === 'video' ? '1280x720' : '-',
            duration: '10.0s',
            bitrate: mediaType === 'video' ? '2048 kbps' : '192 kbps',
          });
        };
        media.src = finalUrl;
      }
    };

    loadMeta();
    return () => { active = false; };
  }, [finalUrl, mediaType, isParentLost]);

  return (
    <div
      onMouseEnter={() => setIsNodeHovered(true)}
      onMouseLeave={() => setIsNodeHovered(false)}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        color: '#fff',
        overflow: 'visible',
        boxSizing: 'border-box',
      }}
    >
      {/* 节点外面顶部的标题和类型药丸 */}
      <div style={{
        position: 'absolute',
        top: -26,
        left: 8,
        right: 8,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        pointerEvents: 'none',
      }}>
        {/* 左上角外面：预览图标 + 节点标题 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, color: '#fff' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <span>Preview {node.id.split('-').pop()?.slice(-3) || '1'}</span>
        </div>
        
        {/* 右上角外面：大写媒体类型 */}
        <div style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.5px',
          color: isParentLost ? '#ef4444' : '#10b981',
          background: isParentLost ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
          padding: '2px 6px',
          borderRadius: 4,
          border: isParentLost ? '1px solid rgba(239, 68, 68, 0.2)' : '1px solid rgba(16, 185, 129, 0.2)'
        }}>
          {isParentLost ? 'DISCONNECTED' : mediaType?.toUpperCase()}
        </div>
      </div>

      {/* 1. 外部绝对定位插孔 Handles */}
      {/* 左侧 Source 插孔 */}
      <div style={{
        position: 'absolute',
        left: -70,
        top: '50%',
        transform: 'translateY(-50%)',
        display: 'flex',
        flexDirection: 'column',
        pointerEvents: (showLeftSockets || !isParentLost) ? 'auto' : 'none',
        opacity: (showLeftSockets || !isParentLost) ? 1 : 0,
        transition: 'opacity 0.2s ease-in-out, transform 0.2s ease-in-out',
        zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, width: 60 }}>
          <span style={{
            fontSize: 11,
            fontWeight: 500,
            color: isParentLost ? 'rgba(255,255,255,0.4)' : '#10b981',
            opacity: showLeftSockets ? 1 : 0,
            transition: 'opacity 0.2s ease-in-out',
          }}>
            Input
          </span>
          <div style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            border: isParentLost ? '2px solid rgba(255,255,255,0.2)' : '2px solid #10b981',
            background: isParentLost ? '#1b1b1f' : '#10b981',
            boxShadow: isParentLost ? 'none' : '0 0 8px #10b981',
            opacity: (showLeftSockets || !isParentLost) ? 1 : 0,
            transition: 'opacity 0.2s ease-in-out',
          }} />
        </div>
      </div>

      {/* 右侧 Output 插孔 */}
      <div style={{
        position: 'absolute',
        left: 'calc(100% + 10px)',
        top: 24,
        display: 'flex',
        flexDirection: 'column',
        pointerEvents: (isNodeHovered || !!finalUrl || hasChildConnection) ? 'auto' : 'none',
        opacity: (isNodeHovered || !!finalUrl || hasChildConnection) ? 1 : 0,
        transition: 'opacity 0.2s ease-in-out',
        zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: 'max-content' }}>
          <div 
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setConnectingSourceId(node.id);
              const rect = canvasRef.current?.getBoundingClientRect();
              if (rect) {
                const mouseX = (e.clientX - rect.left - canvasTransform.x) / canvasTransform.scale;
                const mouseY = (e.clientY - rect.top - canvasTransform.y) / canvasTransform.scale;
                setConnectingMousePos({ x: mouseX, y: mouseY });
              }
            }}
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              border: `2px solid ${socketColor}`,
              background: finalUrl ? socketColor : '#1b1b1f',
              boxShadow: finalUrl ? `0 0 8px ${socketColor}` : 'none',
              opacity: (isNodeHovered || !!finalUrl || hasChildConnection) ? 1 : 0,
              transition: 'all 0.2s ease-in-out',
              cursor: 'crosshair',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.5)';
              e.currentTarget.style.boxShadow = `0 0 12px ${socketColor}`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = finalUrl ? `0 0 8px ${socketColor}` : 'none';
            }}
          />
          <span style={{
            fontSize: 11,
            fontWeight: 500,
            color: socketColor,
            opacity: (isNodeHovered || !!finalUrl || hasChildConnection) ? 1 : 0,
            transition: 'opacity 0.2s ease-in-out',
            whiteSpace: 'nowrap',
          }}>
            {socketLabel}
          </span>
        </div>
      </div>

      {/* 2. 中间卡片渲染区 */}
      <div 
        style={{
          flex: 1,
          width: '100%',
          background: '#121214',
          borderRadius: 8,
          border: '1px solid rgba(255, 255, 255, 0.04)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          position: 'relative',
        }}
        onMouseEnter={() => !isParentLost && setShowMeta(true)}
        onMouseLeave={() => !isParentLost && setShowMeta(false)}
      >
        {isParentLost ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            padding: '16px 18px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 13, color: '#ef4444', fontWeight: 500 }}>⚠️ 关联的源节点已丢失或被移除</div>
            <div 
              onClick={(e) => { e.stopPropagation(); onRemove(node.id); }}
              style={{
                background: 'rgba(239, 68, 68, 0.1)',
                color: '#ef4444',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                padding: '6px 16px',
                borderRadius: 6,
                fontSize: 12,
                cursor: 'pointer',
                transition: 'all 0.2s',
                fontWeight: 500,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'; }}
            >
              移除此节点
            </div>
          </div>
        ) : isGenerating ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: 'rgba(255, 255, 255, 0.35)' }}>
            <LoadingOutlined style={{ fontSize: 22, color: '#1677ff' }} />
            <span style={{ fontSize: 12, fontWeight: 500 }}>Generating preview...</span>
          </div>
        ) : displayNode.status === 'error' ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: 8 }}>
            <span style={{ color: '#ef4444', fontSize: 13, fontWeight: 500 }}>生成失败</span>
            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, textAlign: 'center' }}>
              {displayNode.resultData?.message || '未知错误'}
            </span>
          </div>
        ) : finalUrl ? (
          mediaType === 'image' ? (
            <img src={finalUrl} style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} alt="Preview" draggable={false} onDragStart={(e) => e.preventDefault()} />
          ) : mediaType === 'video' ? (
            <video src={finalUrl} controls autoPlay muted loop playsInline disablePictureInPicture controlsList="nopictureinpicture" style={{ width: '100%', height: '100%', objectFit: 'contain' }} draggable={false} onDragStart={(e) => e.preventDefault()} onMouseDown={(e) => e.stopPropagation()} />
          ) : mediaType === 'audio' ? (
            <audio src={finalUrl} controls style={{ width: '90%' }} draggable={false} onDragStart={(e) => e.preventDefault()} onMouseDown={(e) => e.stopPropagation()} />
          ) : (
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>暂不支持该素材类型预览</span>
          )
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: 'rgba(255, 255, 255, 0.35)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            <span style={{ fontSize: 12, fontWeight: 500, textAlign: 'center', padding: '0 12px' }}>
              {sourceNode?.taskData?.node_type === 'volc_enhance'
                ? '⚠️ 等待主节点运行增强'
                : '暂无生成文件或 URL 无效'}
            </span>
          </div>
        )}

        {/* 毛玻璃元数据层 */}
        {finalUrl && metadata && !isParentLost && (
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            background: 'rgba(0, 0, 0, 0.65)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
            borderTop: '1px solid rgba(255, 255, 255, 0.1)', padding: '10px 12px',
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px',
            transform: showMeta ? 'translateY(0)' : 'translateY(100%)',
            transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            opacity: showMeta ? 1 : 0,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
              <span style={{ color: 'rgba(255,255,255,0.5)' }}>格式:</span><span style={{ color: '#fff', fontWeight: 500 }}>{metadata.format}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
              <span style={{ color: 'rgba(255,255,255,0.5)' }}>大小:</span><span style={{ color: '#fff', fontWeight: 500 }}>{metadata.fileSize}</span>
            </div>
            {mediaType === 'image' && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, gridColumn: 'span 2' }}>
                <span style={{ color: 'rgba(255,255,255,0.5)' }}>分辨率:</span><span style={{ color: '#fff', fontWeight: 500 }}>{metadata.resolution}</span>
              </div>
            )}
            {mediaType === 'video' && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                  <span style={{ color: 'rgba(255,255,255,0.5)' }}>分辨率:</span><span style={{ color: '#fff', fontWeight: 500 }}>{metadata.resolution}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                  <span style={{ color: 'rgba(255,255,255,0.5)' }}>时长:</span><span style={{ color: '#fff', fontWeight: 500 }}>{metadata.duration}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, gridColumn: 'span 2' }}>
                  <span style={{ color: 'rgba(255,255,255,0.5)' }}>码率:</span><span style={{ color: '#fff', fontWeight: 500 }}>{metadata.bitrate}</span>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

PreviewNode.displayName = 'PreviewNode';
export default React.memo(PreviewNode);
