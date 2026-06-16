/**
 * 创作日志面板 (Generation Log Widget)
 * 
 * 展示当前选中画布节点的创作详情：
 * - 使用的提示词
 * - 附带的参考素材
 * - 使用的模型名称
 * - 生成状态与类型
 * 
 * 点击画布上的节点时自动弹出，展示该节点的创作信息
 */
import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { Typography, Tooltip, Tag, message, Grid, Button, Modal, Popconfirm } from 'antd';
import {
  CloseOutlined, PictureOutlined, CopyOutlined,
  VideoCameraOutlined, CheckCircleOutlined, LoadingOutlined,
  CloseCircleOutlined, FileTextOutlined, ClockCircleOutlined,
  EditOutlined, ReloadOutlined,
  DownloadOutlined, DeleteOutlined, ArrowLeftOutlined,
} from '@ant-design/icons';
import { MessageCircle, MessageSquarePlus } from 'lucide-react';
import { useCanvas, usePlayground } from '../context/PlaygroundContext';
import ImageEditorModal from './ImageEditorModal';
import VideoEditorModal from './VideoEditorModal';
import { getResultDisplayUrl } from '../utils/resultExtractor';
import { useThemeStore } from '../../../store/theme';
import { ErrorBoundary } from './ErrorBoundary';
import request from '../../../utils/request';

const { Text } = Typography;

const formatRelativeTime = (dateStr?: string) => {
  if (!dateStr) return '刚刚';
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins <= 10) return '刚刚';
  if (diffMins < 30) return `${diffMins} 分钟前`;
  if (diffMins < 60) return '半小时前';

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} 小时前`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} 天前`;
};

const showLocalSuccessMessage = (e: React.MouseEvent | undefined, text: string, isLight: boolean) => {
  if (!e) return;
  const target = (e.target as HTMLElement).closest('.ant-popover-inner') || (e.target as HTMLElement).closest('button') || e.target as HTMLElement;
  const rect = target.getBoundingClientRect();
  const el = document.createElement('div');

  el.style.cssText = `
    position: fixed;
    left: ${rect.left + rect.width / 2}px;
    top: ${rect.top + rect.height / 2}px;
    transform: translate(-50%, -50%);
    background: ${isLight ? '#fff' : '#1e1f20'};
    padding: 8px 16px;
    border-radius: 8px;
    box-shadow: ${isLight ? '0 4px 12px rgba(0,0,0,0.15)' : '0 4px 12px rgba(0,0,0,0.4)'};
    border: ${isLight ? 'none' : '1px solid rgba(255,255,255,0.1)'};
    display: flex;
    align-items: center;
    gap: 8px;
    z-index: 99999;
    font-size: 14px;
    color: ${isLight ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.85)'};
    pointer-events: none;
    transition: opacity 0.2s, transform 0.2s;
  `;
  el.innerHTML = `<span style="color: #52c41a; display: flex; align-items: center;"><svg viewBox="64 64 896 896" focusable="false" data-icon="check-circle" width="16px" height="16px" fill="currentColor" aria-hidden="true"><path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm193.5 301.7l-210.6 292a31.8 31.8 31.8 0 01-51.7 0L318.5 484.9c-3.8-5.3 0-12.7 6.5-12.7h46.9c10.2 0 19.9 4.9 25.9 13.3l71.2 98.8 157.2-218c6-8.3 15.6-13.3 25.9-13.3H699c6.5 0 10.3 7.4 6.5 12.7z"></path></svg></span> ${text}`;
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translate(-50%, -50%) translateY(-10px)';
    setTimeout(() => el.remove(), 200);
  }, 1000);
};

const SafeImage = ({ src, alt, style, fallbackIcon }: any) => {
  const [error, setError] = useState(false);
  if (!src || error) {
    return (
      <div style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.05)' }}>
        {fallbackIcon || <PictureOutlined style={{ color: 'rgba(150,150,150,0.3)', fontSize: 20 }} />}
      </div>
    );
  }
  return <img src={src} alt={alt} style={style} onError={() => setError(true)} />;
};

const SafeVideo = ({ src, style, fallbackIcon }: any) => {
  const [error, setError] = useState(false);
  if (!src || error) {
    return (
      <div style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.05)' }}>
        {fallbackIcon || <VideoCameraOutlined style={{ color: 'rgba(150,150,150,0.3)', fontSize: 20 }} />}
      </div>
    );
  }
  return <video src={src} style={style} muted preload="metadata" disablePictureInPicture onError={() => setError(true)} />;
};

const RichPromptView = React.memo(({ node, isLight }: { node: any, isLight: boolean }) => {
  const isLocalAsset = node?.id?.startsWith('local-asset-');
  const rawPrompt = node?.taskData?.prompt || '';
  if (!rawPrompt) return <>{isLocalAsset ? '本地文件' : '无提示词'}</>;

  const rawUrls = node?.taskData?.attached_urls;
  const urls = Array.isArray(rawUrls) ? rawUrls : (typeof rawUrls === 'string' ? [rawUrls] : []);
  const singleUrl = node?.taskData?.attached_url;
  const allUrls = urls.length > 0 ? urls : (singleUrl && typeof singleUrl === 'string' ? [singleUrl] : []);

  if (allUrls.length === 0) return <>{rawPrompt}</>;

  const assetMap: Record<string, { url: string; type: string }> = {};
  const counts: Record<string, number> = { image: 0, video: 0, audio: 0 };

  allUrls.forEach((url: string) => {
    if (!url || typeof url !== 'string') return;
    const isVideo = url.match(/\.(mp4|mov|webm|avi|mkv)$/i) || node?.type === 'video';
    const isAudio = url.match(/\.(mp3|wav|aac|flac|ogg|m4a)$/i);
    const typeKey = isAudio ? 'audio' : isVideo ? 'video' : 'image';
    counts[typeKey]++;
    const label = typeKey === 'audio' ? `声音${counts[typeKey]}` : typeKey === 'video' ? `视频${counts[typeKey]}` : `图${counts[typeKey]}`;
    assetMap[label] = { url, type: typeKey };
  });

  const labels = Object.keys(assetMap).map(l => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (labels.length === 0) return <>{rawPrompt}</>;

  const regex = new RegExp(`(@(?:${labels.join('|')}))(?:\\u200B \\u3000 \\u200B)?`, 'g');
  const parts = rawPrompt.split(regex);
  if (parts.length <= 1) return <>{rawPrompt}</>;

  return (
    <>
      {parts.map((part: string, i: number) => {
        const match = part.match(/^@(.+)$/);
        if (match && assetMap[match[1]]) {
          const info = assetMap[match[1]];
          return (
            <span key={i} style={{
              color: isLight ? '#1677ff' : '#60a5fa',
              fontWeight: 500,
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: isLight ? 'rgba(22,119,255,0.08)' : 'rgba(96,165,250,0.1)',
              padding: '2px 6px', borderRadius: 6, margin: '0 4px',
              border: isLight ? '1px solid rgba(22,119,255,0.15)' : '1px solid rgba(96,165,250,0.2)',
              transform: 'translateY(-1px)'
            }}>
              <span style={{
                display: 'inline-block', width: 14, height: 14, borderRadius: 2, overflow: 'hidden',
                verticalAlign: 'middle', background: 'rgba(0,0,0,0.1)',
                border: '1px solid rgba(0,0,0,0.1)'
              }}>
                {info.type === 'image' ? (
                  <SafeImage src={info.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : info.type === 'video' ? (
                  <SafeVideo src={info.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 10, color: '#faad14' }}>♪</span>
                  </div>
                )}
              </span>
              {part}
            </span>
          );
        }
        return <span key={i} style={{ whiteSpace: 'pre-wrap' }}>{part}</span>;
      })}
    </>
  );
});

const { useBreakpoint } = Grid;

const GenerationLogWidget: React.FC = React.memo(() => {
  const screens = useBreakpoint();
  const isMobile = screens.md === false;
  const {
    nodes, setNodes,
    selectedNodeId, setSelectedNodeId, setSelectedNodeIds,
    canvasTransform, setCanvasTransform,
    canvasRef, maxZIndex, setMaxZIndex
  } = useCanvas();
  const {
    isGenLogVisible, setIsGenLogVisible,
    setPrompt, setAttachedAssets, storageStats,
    saveCanvasState, loadStorageStats
  } = usePlayground();
  const { themeMode } = useThemeStore();

  const saveCanvasRef = useRef(saveCanvasState);
  saveCanvasRef.current = saveCanvasState;
  const _isLight = themeMode === 'light';

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorImageUrl, setEditorImageUrl] = useState('');
  const [videoEditorOpen, setVideoEditorOpen] = useState(false);
  const [editorVideoUrl, setEditorVideoUrl] = useState('');
  const [mediaInfo, setMediaInfo] = useState<{ fileSize?: string; width?: number; height?: number; duration?: number } | null>(null);

  // 找到当前选中的节点
  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return nodes.find(n => n.id === selectedNodeId) || null;
  }, [nodes, selectedNodeId]);

  const handleLocateNode = useCallback(() => {
    if (!selectedNode || !canvasRef?.current) return;
    
    // 如果节点在画布上被隐藏，则恢复显示并置顶
    if (selectedNode.isHidden) {
      const newZ = maxZIndex + 1;
      setMaxZIndex(newZ);
      setNodes(prev => prev.map(n => n.id === selectedNode.id ? { ...n, isHidden: false, zIndex: newZ } : n));
    }
    
    const rect = canvasRef.current.getBoundingClientRect();
    const viewW = rect.width;
    const viewH = rect.height;
    const ct = canvasTransform;
    
    const nodeCX = selectedNode.x + selectedNode.width / 2;
    const nodeCY = selectedNode.y + selectedNode.height / 2;
    
    // 考虑左侧面板的宽度 (24px left + 320px width = 344px)
    const leftOffset = isMobile ? 0 : 360;
    const usableW = viewW - leftOffset;
    
    const newX = leftOffset + usableW / 2 - nodeCX * ct.scale;
    const newY = viewH / 2 - nodeCY * ct.scale;
    
    setCanvasTransform({ ...ct, x: newX, y: newY });
    setSelectedNodeIds([selectedNode.id]);
    
    if (isMobile) {
      setSelectedNodeId(null);
      setIsGenLogVisible(false);
    }
  }, [selectedNode, canvasRef, canvasTransform, setCanvasTransform, setSelectedNodeIds, isMobile, setSelectedNodeId, setIsGenLogVisible, maxZIndex, setMaxZIndex, setNodes]);

  /** 获取节点的结果URL */
  const getResultUrl = useCallback((node: any): string => {
    return getResultDisplayUrl(node?.type, node?.resultData);
  }, []);

  // 自动探测生成结果的文件元信息
  useEffect(() => {
    setMediaInfo(null);
    if (!selectedNode || selectedNode.status !== 'completed') return;
    const url = getResultUrl(selectedNode);
    if (!url) return;

    let cancelled = false;
    const info: { fileSize?: string; width?: number; height?: number; duration?: number } = {};

    // 获取文件大小 (尝试 HEAD，跨域失败则静默)
    const fetchSize = async () => {
      try {
        const res = await fetch(url, { method: 'HEAD' });
        const len = res.headers.get('content-length');
        if (len) {
          const bytes = parseInt(len, 10);
          if (bytes > 1024 * 1024) info.fileSize = (bytes / 1024 / 1024).toFixed(1) + ' MB';
          else if (bytes > 1024) info.fileSize = (bytes / 1024).toFixed(0) + ' KB';
          else info.fileSize = bytes + ' B';
        }
      } catch {
        // 跨域 HEAD 被拒绝，忽略
      }
    };

    const commit = () => { if (!cancelled) setMediaInfo({ ...info }); };

    if (selectedNode.type === 'image') {
      const img = new Image();
      img.onload = () => {
        info.width = img.naturalWidth;
        info.height = img.naturalHeight;
        fetchSize().finally(commit);
      };
      img.onerror = () => {
        // 图片加载失败，仍然尝试获取文件大小
        fetchSize().finally(commit);
      };
      img.src = url;
    } else if (selectedNode.type === 'video') {
      const vid = document.createElement('video');
      vid.preload = 'metadata';
      vid.onloadedmetadata = () => {
        info.width = vid.videoWidth;
        info.height = vid.videoHeight;
        info.duration = vid.duration;
        fetchSize().finally(commit);
      };
      vid.onerror = () => {
        fetchSize().finally(commit);
      };
      vid.src = url;
    } else {
      fetchSize().finally(commit);
    }

    return () => { cancelled = true; };
  }, [selectedNode?.id, selectedNode?.status, getResultUrl]);

  /** 加入制作 - 将结果作为附件加入 prompt 输入区 */
  const handleAddToCreate = useCallback(() => {
    if (!selectedNode) return;
    const url = getResultUrl(selectedNode);
    if (!url) {
      message.warning('暂无可用的结果资源');
      return;
    }
    const ext = selectedNode.type === 'video' ? 'mp4' : 'png';
    setAttachedAssets(prev => {
      if (prev.some(a => a.fullUrl === url)) {
        message.info('该资源已在附件中');
        return prev;
      }
      return [...prev, {
        asset: {
          id: Date.now() + Math.random(),
          file_name: `result_${Date.now()}.${ext}`,
          asset_type: selectedNode.type,
          file_url: url,
        },
        fullUrl: url,
      }];
    });

  }, [selectedNode, getResultUrl, setAttachedAssets]);

  /** 媒体预览与编辑 */
  const handleEditMedia = useCallback(() => {
    if (!selectedNode) return;
    const url = getResultUrl(selectedNode);
    if (!url) {
      message.warning('暂无可操作的媒体');
      return;
    }
    if (selectedNode.type === 'video') {
      setEditorVideoUrl(url);
      setVideoEditorOpen(true);
    } else {
      setEditorImageUrl(url);
      setEditorOpen(true);
    }
  }, [selectedNode, getResultUrl]);

  /** 生成视频 - 将图片作为参考素材加入提示词区，引导用户图生视频 */
  const handleGenerateVideo = useCallback(() => {
    if (!selectedNode) return;
    const url = getResultUrl(selectedNode);
    if (!url) {
      message.warning('暂无可用的图片');
      return;
    }
    setAttachedAssets(prev => {
      if (prev.some(a => a.fullUrl === url)) {
        message.info('该图片已在附件中，请选择视频模型并生成');
        return prev;
      }
      return [...prev, {
        asset: {
          id: Date.now() + Math.random(),
          file_name: `img2video_${Date.now()}.png`,
          asset_type: 'image',
          file_url: url,
        },
        fullUrl: url,
      }];
    });

  }, [selectedNode, getResultUrl, setAttachedAssets]);

  /** 编辑保存回调 */
  const handleEditorSave = useCallback((newUrl: string, file: File) => {
    if (!selectedNode) return;
    // 更新节点的 resultData
    setNodes(prev => prev.map(n => {
      if (n.id !== selectedNode.id) return n;
      return {
        ...n,
        resultData: { ...n.resultData, data: [{ url: newUrl }] },
      };
    }));
    // 也加入附件方便二次创作
    setAttachedAssets(prev => [...prev, {
      asset: {
        id: Date.now() + Math.random(),
        file_name: file.name || `edited_${Date.now()}.${selectedNode.type === 'video' ? 'mp4' : 'jpg'}`,
        asset_type: selectedNode.type,
        file_url: newUrl,
      },
      fullUrl: newUrl,
      file,
    }]);
    setEditorOpen(false);
    setVideoEditorOpen(false);
    message.success('编辑完成，已加入素材');
  }, [selectedNode, setNodes, setAttachedAssets]);

  /** 重新生成 - 将原提示词填入 prompt，并恢复附件素材 */
  const handleRegenerate = useCallback(() => {
    if (!selectedNode?.taskData) return;

    // 去掉可能包含的占位符（防止直接塞入纯文本框时显示空白字符，但因为目前输入框支持富文本，保留也可以。稳妥起见，直接塞进去）
    setPrompt(selectedNode.taskData.prompt || '');

    // 恢复附件
    const rawUrls = selectedNode.taskData.attached_urls;
    const attachedUrls = Array.isArray(rawUrls) ? rawUrls : (typeof rawUrls === 'string' ? [rawUrls] : []);
    const singleUrl = selectedNode.taskData.attached_url;
    const urlsToRestore = attachedUrls.length > 0 ? attachedUrls : (singleUrl && typeof singleUrl === 'string' ? [singleUrl] : []);

    if (urlsToRestore.length > 0) {
      const recoveredAssets = urlsToRestore.filter((u: any) => u && typeof u === 'string').map((url: string, index: number) => {
        const isVideo = url.match(/\.(mp4|mov|webm|avi|mkv)$/i) || selectedNode.type === 'video';
        const isAudio = url.match(/\.(mp3|wav|aac|flac|ogg|m4a)$/i);
        const typeKey = isAudio ? 'audio' : isVideo ? 'video' : 'image';
        return {
          asset: {
            id: `recovered_${Date.now()}_${index}`,
            file_name: `recovered_${index}.${isVideo ? 'mp4' : isAudio ? 'mp3' : 'png'}`,
            asset_type: typeKey,
            file_url: url,
          },
          fullUrl: url,
          isUploaded: true, // 历史记录的 url 都已经是上传好的
        };
      });
      setAttachedAssets(recoveredAssets);
    } else {
      setAttachedAssets([]);
    }


  }, [selectedNode, setPrompt, setAttachedAssets]);

  /** 下载 */
  const handleDownload = useCallback(async () => {
    if (!selectedNode) return;
    const url = getResultUrl(selectedNode);
    if (!url) {
      message.warning('暂无可下载的结果');
      return;
    }
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      const ext = selectedNode.type === 'video' ? 'mp4' : 'png';
      a.download = `creation_${Date.now()}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } catch {
      // fallback: 直接打开
      window.open(url, '_blank');
    }
  }, [selectedNode, getResultUrl]);

  /** 统一删除资源和节点并保存画布状态 */
  const performDeleteNode = useCallback(async (nodeToDelete: any, e?: React.MouseEvent) => {
    const isAsset = nodeToDelete.id?.startsWith('asset-');
    let dbAssetId: string | null = null;
    if (isAsset) {
      const match = nodeToDelete.id.match(/^asset-(\d+)$/);
      if (match) {
        dbAssetId = match[1];
      }
    }

    try {
      if (dbAssetId) {
        // 调用后端删除资产接口
        try {
          await request.delete(`/playground/assets/${dbAssetId}`);
        } catch (delErr: any) {
          const errMsg = delErr?.response?.data?.error?.message || delErr?.response?.data?.message || delErr?.message || '';
          if (delErr?.response?.status === 404 || errMsg.includes('不存在')) {
            // 资源在后端已经不存在，忽略该错误并继续在前端移除
            console.warn(`[Playground] Asset ${dbAssetId} already deleted on server.`);
          } else {
            // 其他错误则抛出，阻断删除流程
            throw delErr;
          }
        }
      }

      // 展现本地气泡提示（在节点被移除前获取坐标）
      if (e) {
        showLocalSuccessMessage(e, '已删除', _isLight);
      }

      // 更新本地节点列表
      const newNodes = nodes.filter(n => n.id !== nodeToDelete.id);
      setNodes(newNodes);

      if (selectedNodeId === nodeToDelete.id) {
        setSelectedNodeId(null);
      }

      // 立即调用保存画布，传入最新的 nodes 以避免 React state 批量更新导致的时序问题
      try {
        await saveCanvasRef.current?.(newNodes);
        await loadStorageStats();
      } catch (err) {
        console.error('保存画布状态或加载存储用量失败', err);
      }
    } catch (err: any) {
      const errMsg = err?.response?.data?.error?.message || err?.response?.data?.message || err?.message || '删除失败';
      message.error(`删除失败: ${errMsg}`);
    }
  }, [nodes, selectedNodeId, setSelectedNodeId, setNodes, loadStorageStats, _isLight]);

  /** 删除节点 */
  const handleDelete = useCallback((e?: React.MouseEvent) => {
    if (!selectedNode) return;
    performDeleteNode(selectedNode, e);
  }, [selectedNode, performDeleteNode]);

  const isLocalAsset = selectedNode?.id?.startsWith('local-asset-');

  // 富文本提示词解析（带素材缩略图）必须放在所有 early return 之前，以遵守 React Hooks 规则
  const renderRichLogPrompt = useMemo(() => {
    return <RichPromptView node={selectedNode} isLight={_isLight} />;
  }, [selectedNode, isLocalAsset, _isLight]);

  if (!isGenLogVisible) return null;

  const statusInfo = (node: any) => {
    const isLocal = node.id?.startsWith('local-asset-');
    if (node.status === 'completed') {
      if (isLocal) {
        return { icon: <CheckCircleOutlined style={{ color: '#52c41a' }} />, label: '加载完成', color: '#52c41a' };
      }
      let durationSecs = 0;
      if (node.taskData?.created_at) {
        const start = new Date(node.taskData.created_at).getTime();
        let end = start;
        if (node.taskData?.completed_at) {
          end = new Date(node.taskData.completed_at).getTime();
        } else if (node.resultData?.created) {
          end = typeof node.resultData.created === 'number' ? node.resultData.created * 1000 : new Date(node.resultData.created).getTime();
        }
        if (end > start) {
          durationSecs = Math.round((end - start) / 1000);
        }
      }
      return { icon: null, label: durationSecs > 0 ? `用时${durationSecs}秒` : '已完成', color: _isLight ? 'rgba(0,0,0,0.65)' : '#fff' };
    }
    if (node.status === 'loading') {
      if (node.taskData?.poll_timeout || node.taskData?.poll_exhausted) {
        return { icon: <ClockCircleOutlined style={{ color: '#faad14' }} />, label: '后台生成中...', color: '#faad14' };
      }
      return { icon: <LoadingOutlined style={{ color: '#fff' }} />, label: isLocal ? '正在加载...' : '正在生成...', color: '#fff' };
    }
    return { icon: <CloseCircleOutlined style={{ color: '#ff4d4f' }} />, label: isLocal ? '加载失败' : '生成失败', color: '#ff4d4f' };
  };

  const status = selectedNode ? statusInfo(selectedNode) : null;

  const typeLabel = isLocalAsset
    ? (selectedNode?.type === 'video' ? '本地视频' : selectedNode?.type === 'image' ? '本地图像' : '本地音频')
    : (selectedNode?.type === 'video' ? 'AI 视频' : selectedNode?.type === 'image' ? 'AI 图像' : '文本生成');
  const typeIcon = selectedNode?.type === 'video'
    ? <VideoCameraOutlined style={{ fontSize: 16, color: '#fff' }} />
    : selectedNode?.type === 'image'
      ? <PictureOutlined style={{ fontSize: 16, color: '#fff' }} />
      : <FileTextOutlined style={{ fontSize: 16, color: '#fff' }} />;

  const handleClose = () => {
    setIsGenLogVisible(false);
    setSelectedNodeId(null);
  };

  const isCompleted = selectedNode?.status === 'completed';
  const isImage = selectedNode?.type === 'image';
  const hasResult = selectedNode ? !!getResultUrl(selectedNode) : false;

  // 操作按钮定义
  const actionButtons = selectedNode ? [
    { key: 'add', icon: <MessageSquarePlus size={14} />, label: '加入提示词', onClick: handleAddToCreate, disabled: !isCompleted || !hasResult },
    { key: 'edit', icon: <EditOutlined />, label: '预览/编辑', onClick: handleEditMedia, disabled: !isCompleted || (selectedNode.type !== 'image' && selectedNode.type !== 'video') || !hasResult },
    {
      key: 'img2video',
      icon: <VideoCameraOutlined />,
      label: selectedNode.type === 'video' ? '延长视频' : '生成视频',
      onClick: selectedNode.type === 'video' ? () => message.info('延长视频功能开发中...') : handleGenerateVideo,
      disabled: !isCompleted || (selectedNode.type !== 'image' && selectedNode.type !== 'video') || !hasResult
    },
    { key: 'regen', icon: <ReloadOutlined />, label: '重新生成', onClick: handleRegenerate, disabled: !selectedNode.taskData?.prompt },
    { key: 'download', icon: <DownloadOutlined />, label: '下载', onClick: handleDownload, disabled: !isCompleted || !hasResult },
    { key: 'delete', icon: <DeleteOutlined />, label: '删除', onClick: handleDelete, disabled: false, danger: true },
  ] : [];

  const formatBytes = (bytes: number) => {
    if (bytes > 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    if (bytes > 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return bytes + ' B';
  };

  return (
    <ErrorBoundary>
      <div
        style={{
          position: 'absolute',
          left: isMobile ? 12 : 24,
          top: isMobile ? 72 : 80,
          width: isMobile ? 'calc(100vw - 24px)' : 320,
          height: isMobile ? 'calc(100vh - 240px)' : 'auto',
          background: _isLight ? 'rgba(255,255,255,0.9)' : '#1e1f20',
          borderRadius: 24,
          border: _isLight ? '1px solid rgba(0,0,0,0.1)' : '1px solid #444746',
          boxShadow: _isLight ? '0 4px 20px rgba(0,0,0,0.08)' : '0 4px 6px rgba(0,0,0,0.3)',
          backdropFilter: 'blur(24px)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          zIndex: 1000,
          maxHeight: isMobile ? 'calc(100vh - 240px)' : 'calc(100vh - 140px)',
        }}
        onWheel={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div style={{
          padding: '0 12px', height: 48, minHeight: 48,
          borderBottom: _isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid #444746',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: _isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)',
          userSelect: 'none',
        }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {selectedNode && (
              isMobile ? (
                <div
                  onClick={() => setSelectedNodeId(null)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 32, height: 32, borderRadius: 16, cursor: 'pointer',
                    color: _isLight ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.7)',
                    background: _isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.08)',
                    transition: 'all 0.2s',
                    marginLeft: -4, marginRight: 4
                  }}
                >
                  <ArrowLeftOutlined style={{ fontSize: 15 }} />
                </div>
              ) : (
                <Tooltip title="返回列表">
                  <div
                    onClick={() => setSelectedNodeId(null)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: 24, height: 24, borderRadius: 4, cursor: 'pointer',
                      color: _isLight ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.6)', transition: 'all 0.2s',
                      marginLeft: -4, marginRight: 2
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = _isLight ? '#000' : '#fff'; e.currentTarget.style.background = _isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = _isLight ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.6)'; e.currentTarget.style.background = 'transparent'; }}
                  >
                    <ArrowLeftOutlined style={{ fontSize: 13 }} />
                  </div>
                </Tooltip>
              )
            )}
            <MessageCircle size={16} style={{ color: _isLight ? '#333' : '#fff' }} />
            <Text style={{ color: _isLight ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: 500 }}>
              {selectedNode ? '素材详情' : `项目创作记录 (${nodes.length}/${storageStats?.max_assets || 10})`}
            </Text>
          </div>
          {isMobile ? (
            <div
              style={{
                width: 36,
                height: 36,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: _isLight ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.7)',
                borderRadius: 18,
                background: _isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.08)',
                transition: 'all 0.2s',
                marginRight: -4
              }}
              onClick={handleClose}
            >
              <CloseOutlined style={{ fontSize: 16 }} />
            </div>
          ) : (
            <Tooltip title="关闭">
              <div
                style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: _isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.5)', borderRadius: 4, transition: 'all 0.2s' }}
                onClick={handleClose}
                onMouseEnter={(e) => { e.currentTarget.style.color = _isLight ? '#000' : '#fff'; e.currentTarget.style.background = _isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = _isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.5)'; e.currentTarget.style.background = 'transparent'; }}
              >
                <CloseOutlined />
              </div>
            </Tooltip>
          )}
        </div>

        {/* 内容区域 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '16px' : '20px 5px' }}>

          {/* 如果没有选中节点，显示历史记录列表 */}
          {!selectedNode ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {nodes.length === 0 ? (
                <div style={{ textAlign: 'center', color: _isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)', padding: '40px 0', fontSize: 13 }}>
                  暂无创作记录
                </div>
              ) : (
                [...nodes].sort((a, b) => {
                  const ta = a.taskData?.created_at ? new Date(a.taskData.created_at).getTime() : 0;
                  const tb = b.taskData?.created_at ? new Date(b.taskData.created_at).getTime() : 0;
                  return tb - ta;
                }).map(node => {
                  const url = getResultUrl(node);
                  const sInfo = statusInfo(node);

                  let displayUrl = url;
                  const rawUrls = node.taskData?.attached_urls;
                  const safeUrls = Array.isArray(rawUrls) ? rawUrls : (typeof rawUrls === 'string' ? [rawUrls] : []);
                  const inputUrl = safeUrls[0] || node.taskData?.attached_url;
                  const isUsingInputAsFallback = !displayUrl && inputUrl && typeof inputUrl === 'string' && node.status !== 'error';
                  if (isUsingInputAsFallback) {
                    displayUrl = inputUrl;
                  }

                  // 确保有安全的回退样式
                  return (
                    <div
                      key={node.id}
                      onClick={() => setSelectedNodeId(node.id)}
                      style={{
                        display: 'flex', gap: 12, padding: 12, borderRadius: 12,
                        background: _isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)', border: _isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid #444746',
                        cursor: 'pointer', transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = _isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = _isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)'; }}
                    >
                      {/* 缩略图 */}
                      <div style={{
                        width: 48, height: 48, borderRadius: 8, flexShrink: 0,
                        background: _isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        overflow: 'hidden', border: _isLight ? '1px solid rgba(0,0,0,0.05)' : '1px solid rgba(255,255,255,0.08)',
                        position: 'relative'
                      }}>
                        {displayUrl ? (
                          node.type === 'video' ? (
                            <SafeVideo src={displayUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <SafeImage src={displayUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          )
                        ) : (
                          node.type === 'video' ? <VideoCameraOutlined style={{ color: _isLight ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.2)', fontSize: 20 }} /> :
                            node.type === 'image' ? <PictureOutlined style={{ color: _isLight ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.2)', fontSize: 20 }} /> :
                              <FileTextOutlined style={{ color: _isLight ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.2)', fontSize: 20 }} />
                        )}

                        {/* 悬浮加载遮罩 */}
                        {node.status === 'loading' && (
                          <div style={{
                            position: 'absolute', inset: 0,
                            background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                          }}>
                            <LoadingOutlined style={{ color: '#fff', fontSize: 16 }} />
                          </div>
                        )}
                      </div>
                      {/* 详情 */}
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4 }}>
                        <Text style={{ color: _isLight ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.85)', fontSize: 13, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <RichPromptView node={node} isLight={_isLight} />
                        </Text>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <Text style={{ color: _isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)', fontSize: 11 }}>
                            {node.taskData?.created_at ? formatRelativeTime(node.taskData.created_at) : '刚刚'}
                          </Text>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ fontSize: 10 }}>{sInfo.icon}</span>
                            <Text style={{ color: sInfo.color, fontSize: 11 }}>{sInfo.label}</Text>
                          </div>
                        </div>
                      </div>
                      {/* 删除按钮 */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          alignSelf: 'center',
                          flexShrink: 0,
                          marginLeft: 4,
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                      >
                        <Popconfirm
                          title="确定删除？"
                          onConfirm={async (e) => {
                            e?.stopPropagation();
                            await performDeleteNode(node, e);
                          }}
                          onCancel={(e) => e?.stopPropagation()}
                          okText="确定"
                          cancelText="取消"
                          okButtonProps={{ danger: true, size: 'small' }}
                          cancelButtonProps={{ size: 'small' }}
                        >
                          {isMobile ? (
                            <div
                              style={{
                                width: 32, height: 32, borderRadius: 8,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: _isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.6)',
                                cursor: 'pointer', transition: 'all 0.2s',
                              }}
                              onMouseEnter={(e: any) => { e.currentTarget.style.background = _isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = _isLight ? '#000' : '#fff'; }}
                              onMouseLeave={(e: any) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = _isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.6)'; }}
                            >
                              <DeleteOutlined style={{ fontSize: 15 }} />
                            </div>
                          ) : (
                            <Tooltip title="删除记录">
                              <div
                                style={{
                                  width: 28, height: 28, borderRadius: 6,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  color: _isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.6)',
                                  cursor: 'pointer', transition: 'all 0.2s',
                                }}
                                onMouseEnter={(e: any) => { e.currentTarget.style.background = _isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = _isLight ? '#000' : '#fff'; }}
                                onMouseLeave={(e: any) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = _isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.6)'; }}
                              >
                                <DeleteOutlined style={{ fontSize: 14 }} />
                              </div>
                            </Tooltip>
                          )}
                        </Popconfirm>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            <>
              {/* 提示词区块 */}
              <div style={{
                background: _isLight ? 'rgba(0,0,0,0.03)' : 'rgba(0,0,0,0.3)', borderRadius: 14, padding: '14px 16px',
                marginBottom: 12, position: 'relative',
              }}>
                <div style={{
                  color: _isLight ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.8)', fontSize: 14, lineHeight: '24px',
                  wordBreak: 'break-word', display: 'block',
                  paddingRight: selectedNode.taskData?.prompt ? 28 : 0,
                }}>
                  {renderRichLogPrompt}
                </div>
                {selectedNode.taskData?.prompt && (
                  isMobile ? (
                    <span
                      onClick={() => {
                        const text = selectedNode.taskData?.prompt || '';
                        if (!text) return;
                        try {
                          const textarea = document.createElement('textarea');
                          textarea.value = text;
                          textarea.style.position = 'fixed';
                          textarea.style.left = '-9999px';
                          document.body.appendChild(textarea);
                          textarea.select();
                          document.execCommand('copy');
                          document.body.removeChild(textarea);
                          message.success('提示词已复制');
                        } catch {
                          message.error('复制失败');
                        }
                      }}
                      style={{
                        position: 'absolute', top: 12, right: 12,
                        fontSize: 16, color: _isLight ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.6)',
                        cursor: 'pointer', transition: 'color 0.2s',
                        lineHeight: 1,
                        padding: 8,
                        borderRadius: 6,
                        background: _isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.05)'
                      }}
                    >
                      <CopyOutlined />
                    </span>
                  ) : (
                    <Tooltip title="复制提示词">
                      <span
                        onClick={() => {
                          const text = selectedNode.taskData?.prompt || '';
                          if (!text) return;
                          try {
                            const textarea = document.createElement('textarea');
                            textarea.value = text;
                            textarea.style.position = 'fixed';
                            textarea.style.left = '-9999px';
                            document.body.appendChild(textarea);
                            textarea.select();
                            document.execCommand('copy');
                            document.body.removeChild(textarea);
                            message.success('提示词已复制');
                          } catch {
                            message.error('复制失败');
                          }
                        }}
                        style={{
                          position: 'absolute', top: 12, right: 12,
                          fontSize: 14, color: _isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)',
                          cursor: 'pointer', transition: 'color 0.2s',
                          lineHeight: 1,
                        }}
                        onMouseEnter={(e: any) => e.currentTarget.style.color = _isLight ? '#000' : '#fff'}
                        onMouseLeave={(e: any) => e.currentTarget.style.color = _isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)'}
                      >
                        <CopyOutlined />
                      </span>
                    </Tooltip>
                  )
                )}
              </div>

              {/* 生成结果预览 */}
              {(() => {
                const resultUrl = getResultUrl(selectedNode);
                if (selectedNode.status === 'loading') {
                  return (
                    <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: isMobile ? '100%' : 56,
                        height: isMobile ? 'auto' : 56,
                        minHeight: isMobile ? 120 : 'auto',
                        maxHeight: isMobile ? '40vh' : 'none',
                        borderRadius: 10,
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                        {(selectedNode.taskData?.poll_timeout || selectedNode.taskData?.poll_exhausted)
                          ? <ClockCircleOutlined style={{ fontSize: 24, color: '#faad14' }} />
                          : <LoadingOutlined style={{ fontSize: 24, color: '#fff' }} />}
                      </div>
                      {!isMobile && <Text style={{ color: (selectedNode.taskData?.poll_timeout || selectedNode.taskData?.poll_exhausted) ? '#faad14' : 'rgba(255,255,255,0.4)', fontSize: 12 }}>
                        {(selectedNode.taskData?.poll_timeout || selectedNode.taskData?.poll_exhausted) ? '仍在生成中，完成后会自动显示' : '正在生成中...'}
                      </Text>}
                    </div>
                  );
                }
                if (isCompleted && resultUrl) {
                  return (
                    <div 
                      onClick={handleLocateNode}
                      style={{ 
                        marginBottom: 12, 
                        cursor: 'pointer',
                        position: 'relative'
                      }}
                      title={selectedNode.isHidden ? "点击恢复并定位到画布" : "点击在画布中定位此素材"}
                    >
                      {selectedNode.type === 'video' ? (
                        <video
                          src={resultUrl}
                          controls={isMobile}
                          autoPlay={isMobile}
                          loop={isMobile}
                          playsInline
                          style={{
                            width: isMobile ? '100%' : 56,
                            height: isMobile ? 'auto' : 56,
                            maxHeight: isMobile ? '40vh' : 'none',
                            borderRadius: 10,
                            objectFit: 'contain',
                            background: '#000',
                            border: '1px solid rgba(255,255,255,0.1)',
                            pointerEvents: isMobile ? 'auto' : 'none', // PC 上禁用视频自身事件以便触发 div 点击
                          }}
                          muted
                          preload="metadata"
                          disablePictureInPicture
                        />
                      ) : (
                        <img
                          src={resultUrl}
                          alt="生成结果"
                          style={{
                            width: isMobile ? '100%' : 56,
                            height: isMobile ? 'auto' : 56,
                            maxHeight: isMobile ? '40vh' : 'none',
                            borderRadius: 10,
                            objectFit: 'contain',
                            background: '#000',
                            border: '1px solid rgba(255,255,255,0.1)',
                          }}
                        />
                      )}
                      
                      {/* 隐藏状态覆盖层 */}
                      {selectedNode.isHidden && (
                        <div style={{ 
                          position: 'absolute', inset: 0, 
                          background: 'rgba(0,0,0,0.5)', 
                          display: 'flex', alignItems: 'center', justifyContent: 'center', 
                          borderRadius: 10, pointerEvents: 'none' 
                        }}>
                          <Text style={{ 
                            color: '#fff', fontSize: 13, 
                            background: 'rgba(255,255,255,0.2)', 
                            padding: '6px 14px', borderRadius: 16, 
                            backdropFilter: 'blur(4px)' 
                          }}>点击恢复到画布</Text>
                        </div>
                      )}
                    </div>
                  );
                }
                return null;
              })()}

              {/* 操作按钮行 */}
              <div style={{
                display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'nowrap', alignItems: 'center',
                justifyContent: 'center',
              }}>
                {actionButtons.map(btn => {
                  const buttonContent = (
                    <Tooltip
                      key={btn.key}
                      title={btn.disabled && btn.key === 'edit' ? '预览/编辑 (仅图片/视频可用)' : btn.label}
                      placement="top"
                      mouseEnterDelay={0.1}
                    >
                      <div
                        onClick={btn.disabled || btn.key === 'delete' ? undefined : btn.onClick}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          width: 36, height: 36,
                          borderRadius: '50%',
                          fontSize: 16,
                          cursor: btn.disabled ? 'not-allowed' : 'pointer',
                          background: btn.danger ? (_isLight ? 'rgba(255,77,79,0.1)' : 'rgba(255,77,79,0.08)') : (_isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)'),
                          border: `1px solid ${btn.danger ? 'rgba(255,77,79,0.15)' : (_isLight ? 'rgba(0,0,0,0.08)' : '#444746')}`,
                          color: btn.disabled
                            ? (_isLight ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.2)')
                            : btn.danger
                              ? '#ff4d4f'
                              : (_isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)'),
                          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                          userSelect: 'none',
                          flexShrink: 0,
                          boxShadow: _isLight ? '0 2px 4px rgba(0,0,0,0.02)' : '0 2px 6px rgba(0,0,0,0.05)',
                        }}
                        onMouseEnter={(e) => {
                          if (btn.disabled) return;
                          e.currentTarget.style.background = btn.danger ? 'rgba(255,77,79,0.15)' : (_isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)');
                          e.currentTarget.style.color = btn.danger ? '#ff7875' : (_isLight ? '#000' : '#fff');
                          e.currentTarget.style.transform = 'translateY(-2px)';
                          e.currentTarget.style.boxShadow = _isLight ? '0 4px 12px rgba(0,0,0,0.06)' : '0 4px 12px rgba(0,0,0,0.15)';
                        }}
                        onMouseLeave={(e) => {
                          if (btn.disabled) return;
                          e.currentTarget.style.background = btn.danger ? (_isLight ? 'rgba(255,77,79,0.1)' : 'rgba(255,77,79,0.08)') : (_isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)');
                          e.currentTarget.style.color = btn.danger ? '#ff4d4f' : (_isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)');
                          e.currentTarget.style.transform = 'translateY(0)';
                          e.currentTarget.style.boxShadow = _isLight ? '0 2px 4px rgba(0,0,0,0.02)' : '0 2px 6px rgba(0,0,0,0.05)';
                        }}
                      >
                        {btn.icon}
                      </div>
                    </Tooltip>
                  );

                  if (btn.key === 'delete' && !btn.disabled) {
                    return (
                      <Popconfirm
                        key={btn.key}
                        title="确定删除？"
                        onConfirm={async (e) => {
                          await btn.onClick(e);
                        }}
                        okText="确定"
                        cancelText="取消"
                        okButtonProps={{ danger: true, size: 'small' }}
                        cancelButtonProps={{ size: 'small' }}
                      >
                        {buttonContent}
                      </Popconfirm>
                    );
                  }
                  return buttonContent;
                })}
              </div>

              {/* 参考素材区块 */}
              {(selectedNode.taskData?.attached_urls?.length > 0 || selectedNode.taskData?.attached_url) && (
                <div style={{
                  background: _isLight ? 'rgba(0,0,0,0.03)' : 'rgba(0,0,0,0.2)', borderRadius: 12, padding: '12px 14px',
                  marginBottom: 16,
                  border: _isLight ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(255,255,255,0.06)',
                }}>
                  <Text style={{ color: _isLight ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 10 }}>参考素材</Text>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {Array.isArray(selectedNode.taskData?.attached_urls) && selectedNode.taskData.attached_urls.length > 0 ? (
                      selectedNode.taskData.attached_urls.map((url: string, i: number) => {
                        if (!url || typeof url !== 'string') return null;
                        const isVideoUrl = url.match(/\.(mp4|mov|webm|avi|mkv)$/i);
                        if (isVideoUrl) {
                          return (
                            <SafeVideo
                              key={i}
                              src={url}
                              style={{
                                width: 56, height: 56, borderRadius: 10, objectFit: 'cover',
                                border: _isLight ? '1px solid rgba(0,0,0,0.1)' : '1px solid rgba(255,255,255,0.1)', background: '#000'
                              }}
                            />
                          );
                        }
                        return (
                          <SafeImage
                            key={i}
                            src={url}
                            alt={`参考素材 ${i + 1}`}
                            style={{
                              width: 56, height: 56, borderRadius: 10, objectFit: 'cover',
                              border: _isLight ? '1px solid rgba(0,0,0,0.1)' : '1px solid rgba(255,255,255,0.1)',
                            }}
                          />
                        );
                      })
                    ) : (
                      (() => {
                        const singleUrl = selectedNode.taskData.attached_url;
                        if (!singleUrl || typeof singleUrl !== 'string') return null;
                        const isVideoUrl = singleUrl.match(/\.(mp4|mov|webm|avi|mkv)$/i);
                        if (isVideoUrl) {
                          return (
                            <SafeVideo
                              src={singleUrl}
                              style={{
                                width: 56, height: 56, borderRadius: 10, objectFit: 'cover',
                                border: _isLight ? '1px solid rgba(0,0,0,0.1)' : '1px solid rgba(255,255,255,0.1)', background: '#000'
                              }}
                            />
                          );
                        }
                        return (
                          <SafeImage
                            src={singleUrl}
                            alt="参考素材"
                            style={{
                              width: 56, height: 56, borderRadius: 10, objectFit: 'cover',
                              border: '1px solid rgba(255,255,255,0.1)',
                            }}
                          />
                        );
                      })()
                    )}
                  </div>
                  <Text style={{ color: _isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 10, display: 'block' }}>
                    已作为生成模型的输入参考
                  </Text>
                </div>
              )}

              {/* 模型信息卡 */}
              <div style={{
                background: _isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.03)', borderRadius: 14, padding: '14px 16px',
                border: _isLight ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(255,255,255,0.06)',
                marginBottom: 16,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {typeIcon}
                    <Text style={{ color: _isLight ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 500 }}>{typeLabel}</Text>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {status?.icon}
                    <Text style={{ color: status?.color, fontSize: 12, fontWeight: 500 }}>{status?.label}</Text>
                  </div>
                </div>
                <div style={{ height: 1, background: _isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)', margin: '0 0 10px 0' }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {!isLocalAsset && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Text style={{ color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.4)', fontSize: 12 }}>模型</Text>
                      <Text style={{ color: _isLight ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 500 }}>
                        {selectedNode.taskData?.model_name || '未知'}
                      </Text>
                    </div>
                  )}
                  {!isLocalAsset && selectedNode.taskData?.model_id && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Text style={{ color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.4)', fontSize: 12 }}>Model ID</Text>
                      <Text style={{ color: _isLight ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.5)', fontSize: 11, fontFamily: 'monospace' }}>
                        {selectedNode.taskData.model_id}
                      </Text>
                    </div>
                  )}
                  {!isLocalAsset && (selectedNode.taskData?.sys_log_id || selectedNode.taskData?.task_id || selectedNode.resultData?.id) && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Text style={{ color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.4)', fontSize: 12 }}>日志 ID</Text>
                      <Text style={{ color: _isLight ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.5)', fontSize: 11, fontFamily: 'monospace', userSelect: 'all' }}>
                        {selectedNode.taskData?.sys_log_id || selectedNode.taskData?.task_id || selectedNode.resultData?.id}
                      </Text>
                    </div>
                  )}
                  {selectedNode.taskData?.created_at && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Text style={{ color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.4)', fontSize: 12 }}>创建时间</Text>
                      <Text style={{ color: _isLight ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.5)', fontSize: 12 }}>
                        {new Date(selectedNode.taskData.created_at).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).replace(/\//g, '-')}
                      </Text>
                    </div>
                  )}
                  {/* 文件详细信息 */}
                  {((mediaInfo?.width && mediaInfo?.height) || (selectedNode.taskData?.width && selectedNode.taskData?.height)) && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Text style={{ color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.4)', fontSize: 12 }}>分辨率</Text>
                      <Text style={{ color: _isLight ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.5)', fontSize: 12 }}>
                        {mediaInfo?.width || selectedNode.taskData.width} × {mediaInfo?.height || selectedNode.taskData.height}
                      </Text>
                    </div>
                  )}
                  {selectedNode.taskData?.file_format && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Text style={{ color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.4)', fontSize: 12 }}>文件格式</Text>
                      <Text style={{ color: _isLight ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.5)', fontSize: 12, textTransform: 'uppercase' }}>
                        {selectedNode.taskData.file_format.split('/').pop()}
                      </Text>
                    </div>
                  )}
                  {(mediaInfo?.fileSize || selectedNode.taskData?.file_size) && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Text style={{ color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.4)', fontSize: 12 }}>文件大小</Text>
                      <Text style={{ color: _isLight ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.5)', fontSize: 12 }}>
                        {mediaInfo?.fileSize || (typeof selectedNode.taskData.file_size === 'number' ? formatBytes(selectedNode.taskData.file_size) : selectedNode.taskData.file_size)}
                      </Text>
                    </div>
                  )}
                  {mediaInfo?.duration != null && mediaInfo.duration > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Text style={{ color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.4)', fontSize: 12 }}>视频时长</Text>
                      <Text style={{ color: _isLight ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.5)', fontSize: 12 }}>
                        {mediaInfo.duration < 60
                          ? `${mediaInfo.duration.toFixed(1)} 秒`
                          : `${Math.floor(mediaInfo.duration / 60)}:${String(Math.round(mediaInfo.duration % 60)).padStart(2, '0')}`
                        }
                      </Text>
                    </div>
                  )}
                </div>
              </div>


              {/* 生成尾帧区块 */}
              {(() => {
                const lastFrameUrl = selectedNode.resultData?.content?.last_frame_url || selectedNode.resultData?.data?.[0]?.last_frame_url;
                if (!lastFrameUrl) return null;
                return (
                  <div style={{
                    background: 'rgba(0,0,0,0.2)', borderRadius: 12, padding: '12px 14px',
                    marginBottom: 16, border: '1px solid rgba(255,255,255,0.06)',
                  }}>
                    <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 10 }}>生成尾帧</Text>
                    <img
                      src={lastFrameUrl}
                      alt="生成尾帧"
                      style={{
                        width: '100%', borderRadius: 8, objectFit: 'contain',
                        background: '#000', border: '1px solid rgba(255,255,255,0.1)'
                      }}
                    />
                  </div>
                );
              })()}

              {/* 失败信息 */}
              {selectedNode.status === 'error' && selectedNode.resultData?.message && (
                <div style={{
                  background: 'rgba(255,77,79,0.08)', borderRadius: 12, padding: '12px 14px',
                  border: '1px solid rgba(255,77,79,0.2)',
                }}>
                  <Text style={{ color: '#ff4d4f', fontSize: 13 }}>
                    ❌ {selectedNode.resultData.message}
                  </Text>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* 图片编辑弹窗 */}
      <ImageEditorModal
        open={editorOpen}
        imageUrl={editorImageUrl}
        onCancel={() => setEditorOpen(false)}
        onSave={handleEditorSave}
      />

      {/* 视频预览/编辑弹窗 */}
      <VideoEditorModal
        open={videoEditorOpen}
        videoUrl={editorVideoUrl}
        onCancel={() => setVideoEditorOpen(false)}
        onSave={handleEditorSave}
      />
    </ErrorBoundary>
  );
});

GenerationLogWidget.displayName = 'GenerationLogWidget';
export default GenerationLogWidget;

