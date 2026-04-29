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
import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { Typography, Tooltip, Tag, message } from 'antd';
import {
  CloseOutlined, PictureOutlined,
  VideoCameraOutlined, CheckCircleOutlined, LoadingOutlined,
  CloseCircleOutlined, FileTextOutlined,
  ScissorOutlined, EditOutlined, ReloadOutlined,
  DownloadOutlined, DeleteOutlined,
} from '@ant-design/icons';
import { MessageCircle } from 'lucide-react';
import { useCanvas, usePlayground } from '../context/PlaygroundContext';
import ImageEditorModal from './ImageEditorModal';

const { Text } = Typography;

const GenerationLogWidget: React.FC = React.memo(() => {
  const { nodes, setNodes, selectedNodeId, setSelectedNodeId } = useCanvas();
  const {
    isGenLogVisible, setIsGenLogVisible,
    setPrompt, setAttachedAssets,
  } = usePlayground();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorImageUrl, setEditorImageUrl] = useState('');
  const [mediaInfo, setMediaInfo] = useState<{ fileSize?: string; width?: number; height?: number; duration?: number } | null>(null);

  // 找到当前选中的节点
  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return nodes.find(n => n.id === selectedNodeId) || null;
  }, [nodes, selectedNodeId]);

  /** 获取节点的结果URL */
  const getResultUrl = useCallback((node: any): string => {
    if (!node?.resultData) return '';
    if (node.type === 'image') {
      const imgData = node.resultData?.data?.[0] || node.resultData?.content?.image_url;
      return typeof imgData === 'string' ? imgData : imgData?.url || '';
    }
    if (node.type === 'video') {
      return node.resultData?.content?.video_url
        || node.resultData?.final_result?.video_url
        || node.resultData?.video_url
        || '';
    }
    return '';
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
    message.success('已加入提示词附件');
  }, [selectedNode, getResultUrl, setAttachedAssets]);

  /** 图片编辑 */
  const handleEditImage = useCallback(() => {
    if (!selectedNode) return;
    const url = getResultUrl(selectedNode);
    if (!url) {
      message.warning('暂无可编辑的图片');
      return;
    }
    setEditorImageUrl(url);
    setEditorOpen(true);
  }, [selectedNode, getResultUrl]);

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
        file_name: file.name || `edited_${Date.now()}.jpg`,
        asset_type: 'image',
        file_url: newUrl,
      },
      fullUrl: newUrl,
      file,
    }]);
    setEditorOpen(false);
    message.success('编辑完成，已加入素材');
  }, [selectedNode, setNodes, setAttachedAssets]);

  /** 重新生成 - 将原提示词填入 prompt */
  const handleRegenerate = useCallback(() => {
    if (!selectedNode?.taskData?.prompt) return;
    setPrompt(selectedNode.taskData.prompt);
    message.info('提示词已填入，请点击生成');
  }, [selectedNode, setPrompt]);

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

  /** 删除节点 */
  const handleDelete = useCallback(() => {
    if (!selectedNode) return;
    setNodes(prev => prev.filter(n => n.id !== selectedNode.id));
    setSelectedNodeId(null);
    setIsGenLogVisible(false);
    message.success('已删除');
  }, [selectedNode, setNodes, setSelectedNodeId, setIsGenLogVisible]);

  if (!isGenLogVisible || !selectedNode) return null;

  const statusInfo = () => {
    if (selectedNode.status === 'completed') return { icon: <CheckCircleOutlined style={{ color: '#52c41a' }} />, label: '生成完成', color: '#52c41a' };
    if (selectedNode.status === 'loading') return { icon: <LoadingOutlined style={{ color: '#fff' }} />, label: '正在生成...', color: '#fff' };
    return { icon: <CloseCircleOutlined style={{ color: '#ff4d4f' }} />, label: '生成失败', color: '#ff4d4f' };
  };

  const status = statusInfo();

  const typeLabel = selectedNode.type === 'video' ? 'AI 视频' : selectedNode.type === 'image' ? 'AI 图像' : '文本生成';
  const typeIcon = selectedNode.type === 'video'
    ? <VideoCameraOutlined style={{ fontSize: 16, color: '#fff' }} />
    : selectedNode.type === 'image'
    ? <PictureOutlined style={{ fontSize: 16, color: '#fff' }} />
    : <FileTextOutlined style={{ fontSize: 16, color: '#fff' }} />;

  const handleClose = () => {
    setIsGenLogVisible(false);
    setSelectedNodeId(null);
  };

  const isCompleted = selectedNode.status === 'completed';
  const isImage = selectedNode.type === 'image';
  const hasResult = !!getResultUrl(selectedNode);

  // 操作按钮定义
  const actionButtons = [
    { key: 'add', icon: <ScissorOutlined />, label: '加入提示词', onClick: handleAddToCreate, disabled: !isCompleted || !hasResult },
    { key: 'edit', icon: <EditOutlined />, label: '图片编辑', onClick: handleEditImage, disabled: !isCompleted || !isImage || !hasResult },
    { key: 'regen', icon: <ReloadOutlined />, label: '重新生成', onClick: handleRegenerate, disabled: !selectedNode.taskData?.prompt },
    { key: 'download', icon: <DownloadOutlined />, label: '下载', onClick: handleDownload, disabled: !isCompleted || !hasResult },
    { key: 'delete', icon: <DeleteOutlined />, label: '删除', onClick: handleDelete, disabled: false, danger: true },
  ];

  return (
    <>
    <div
      style={{
        position: 'absolute',
        left: 24,
        top: 80,
        width: 380,
        background: 'rgba(18, 19, 21, 0.92)',
        borderRadius: 24,
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
        backdropFilter: 'blur(24px)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        zIndex: 1000,
        maxHeight: 'calc(100vh - 140px)',
      }}
      onWheel={(e) => e.stopPropagation()}
    >
      {/* 标题栏 */}
      <div style={{
        padding: '0 24px', height: 56, minHeight: 56,
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: 'rgba(255,255,255,0.02)',
        userSelect: 'none',
      }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <MessageCircle size={16} style={{ color: '#fff' }} />
          <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: 500 }}>创作日志</Text>
        </div>
        <Tooltip title="关闭">
          <div
            style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'rgba(255,255,255,0.5)' }}
            onClick={handleClose}
            onMouseEnter={(e) => e.currentTarget.style.color = '#fff'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.5)'}
          >
            <CloseOutlined />
          </div>
        </Tooltip>
      </div>

      {/* 内容区域 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>

        {/* 提示词区块 */}
        <div style={{
          background: 'rgba(0,0,0,0.3)', borderRadius: 14, padding: '14px 16px',
          marginBottom: 12,
        }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 16, lineHeight: '22px', flexShrink: 0 }}>🎨</span>
            <Text style={{
              color: 'rgba(255,255,255,0.8)', fontSize: 14, lineHeight: '22px',
              wordBreak: 'break-word',
            }}>
              {selectedNode.taskData?.prompt || '无提示词'}
            </Text>
          </div>
        </div>

        {/* 生成结果预览 */}
        {(() => {
          const resultUrl = getResultUrl(selectedNode);
          if (selectedNode.status === 'loading') {
            return (
              <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 56, height: 56, borderRadius: 10, background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <LoadingOutlined style={{ fontSize: 18, color: '#fff' }} />
                </div>
                <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>正在生成中...</Text>
              </div>
            );
          }
          if (isCompleted && resultUrl) {
            return (
              <div style={{ marginBottom: 12 }}>
                {selectedNode.type === 'video' ? (
                  <video
                    src={resultUrl}
                    style={{ width: 56, height: 56, borderRadius: 10, objectFit: 'cover', background: '#000', border: '1px solid rgba(255,255,255,0.1)' }}
                    muted preload="metadata"
                  />
                ) : (
                  <img
                    src={resultUrl}
                    alt="生成结果"
                    style={{ width: 56, height: 56, borderRadius: 10, objectFit: 'cover', background: '#000', border: '1px solid rgba(255,255,255,0.1)' }}
                  />
                )}
              </div>
            );
          }
          return null;
        })()}

        {/* 操作按钮行 */}
        <div style={{
          display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap',
        }}>
          {actionButtons.map(btn => (
            <Tooltip key={btn.key} title={btn.disabled ? (btn.key === 'edit' ? '仅图片可编辑' : '') : ''}>
              <div
                onClick={btn.disabled ? undefined : btn.onClick}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '6px 10px',
                  borderRadius: 8,
                  fontSize: 12,
                  cursor: btn.disabled ? 'not-allowed' : 'pointer',
                  background: btn.danger ? 'rgba(255,77,79,0.08)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${btn.danger ? 'rgba(255,77,79,0.15)' : 'rgba(255,255,255,0.06)'}`,
                  color: btn.disabled
                    ? 'rgba(255,255,255,0.2)'
                    : btn.danger
                    ? '#ff4d4f'
                    : 'rgba(255,255,255,0.65)',
                  transition: 'all 0.2s',
                  userSelect: 'none',
                }}
                onMouseEnter={(e) => {
                  if (btn.disabled) return;
                  e.currentTarget.style.background = btn.danger ? 'rgba(255,77,79,0.15)' : 'rgba(255,255,255,0.1)';
                  e.currentTarget.style.color = btn.danger ? '#ff7875' : '#fff';
                }}
                onMouseLeave={(e) => {
                  if (btn.disabled) return;
                  e.currentTarget.style.background = btn.danger ? 'rgba(255,77,79,0.08)' : 'rgba(255,255,255,0.04)';
                  e.currentTarget.style.color = btn.danger ? '#ff4d4f' : 'rgba(255,255,255,0.65)';
                }}
              >
                {btn.icon}
                <span>{btn.label}</span>
              </div>
            </Tooltip>
          ))}
        </div>

        {/* 参考素材区块 */}
        {(selectedNode.taskData?.attached_urls?.length > 0 || selectedNode.taskData?.attached_url) && (
          <div style={{
            background: 'rgba(0,0,0,0.2)', borderRadius: 12, padding: '12px 14px',
            marginBottom: 16,
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 10 }}>参考素材</Text>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {selectedNode.taskData?.attached_urls ? (
                selectedNode.taskData.attached_urls.map((url: string, i: number) => {
                  const isVideoUrl = url.match(/\.(mp4|mov|webm|avi|mkv)$/i) || selectedNode.type === 'video' && i === 0 && url.includes('video');
                  if (isVideoUrl) {
                    return (
                      <video
                        key={i}
                        src={url}
                        style={{
                          width: 56, height: 56, borderRadius: 10, objectFit: 'cover',
                          border: '1px solid rgba(255,255,255,0.1)', background: '#000'
                        }}
                        muted
                        preload="metadata"
                      />
                    );
                  }
                  return (
                    <img
                      key={i}
                      src={url}
                      alt={`参考素材 ${i + 1}`}
                      style={{
                        width: 56, height: 56, borderRadius: 10, objectFit: 'cover',
                        border: '1px solid rgba(255,255,255,0.1)',
                      }}
                    />
                  );
                })
              ) : (
                (() => {
                  const singleUrl = selectedNode.taskData.attached_url;
                  const isVideoUrl = singleUrl.match(/\.(mp4|mov|webm|avi|mkv)$/i) || selectedNode.type === 'video' && singleUrl.includes('video');
                  if (isVideoUrl) {
                    return (
                      <video
                        src={singleUrl}
                        style={{
                          width: 56, height: 56, borderRadius: 10, objectFit: 'cover',
                          border: '1px solid rgba(255,255,255,0.1)', background: '#000'
                        }}
                        muted
                        preload="metadata"
                      />
                    );
                  }
                  return (
                    <img
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
            <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 10, display: 'block' }}>
              已作为生成模型的输入参考
            </Text>
          </div>
        )}

        {/* 模型信息卡 */}
        <div style={{
          background: 'rgba(255,255,255,0.03)', borderRadius: 14, padding: '14px 16px',
          border: '1px solid rgba(255,255,255,0.06)',
          marginBottom: 16,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {typeIcon}
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 500 }}>{typeLabel}</Text>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {status.icon}
              <Text style={{ color: status.color, fontSize: 12, fontWeight: 500 }}>{status.label}</Text>
            </div>
          </div>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '0 0 10px 0' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>模型</Text>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 500 }}>
                {selectedNode.taskData?.model_name || '未知'}
              </Text>
            </div>
            {selectedNode.taskData?.model_id && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>Model ID</Text>
                <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, fontFamily: 'monospace' }}>
                  {selectedNode.taskData.model_id}
                </Text>
              </div>
            )}
            {selectedNode.taskData?.created_at && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>创建时间</Text>
                <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
                  {new Date(selectedNode.taskData.created_at).toLocaleString('zh-CN', { hour12: false })}
                </Text>
              </div>
            )}
            {/* 文件详细信息 */}
            {mediaInfo && (
              <>
                {mediaInfo.width && mediaInfo.height && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>分辨率</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
                      {mediaInfo.width} × {mediaInfo.height}
                    </Text>
                  </div>
                )}
                {mediaInfo.fileSize && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>文件大小</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
                      {mediaInfo.fileSize}
                    </Text>
                  </div>
                )}
                {mediaInfo.duration != null && mediaInfo.duration > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>视频时长</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
                      {mediaInfo.duration < 60
                        ? `${mediaInfo.duration.toFixed(1)} 秒`
                        : `${Math.floor(mediaInfo.duration / 60)}:${String(Math.round(mediaInfo.duration % 60)).padStart(2, '0')}`
                      }
                    </Text>
                  </div>
                )}
              </>
            )}
          </div>
        </div>


        {/* 生成尾帧区块 */}
        {(() => {
          const lastFrameUrl = selectedNode.resultData?.last_frame_url || selectedNode.resultData?.final_result?.last_frame_url || selectedNode.resultData?.content?.last_frame_url;
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
      </div>
    </div>

    {/* 图片编辑弹窗 */}
    <ImageEditorModal
      open={editorOpen}
      imageUrl={editorImageUrl}
      onCancel={() => setEditorOpen(false)}
      onSave={handleEditorSave}
    />
    </>
  );
});

GenerationLogWidget.displayName = 'GenerationLogWidget';
export default GenerationLogWidget;

