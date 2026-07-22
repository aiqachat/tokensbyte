/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 🎬 AI 视频生成节点
 * 从 CanvasNode.tsx 提取的独立组件
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import toast from '../PlaygroundToast';
import NodeShell from './shared/NodeShell';
import { usePlayground, useCanvas } from '../../context/PlaygroundContext';
import { LoadingOutlined, SettingOutlined, PictureOutlined } from '@ant-design/icons';
import { Switch, Dropdown } from 'antd';
import axios from 'axios';
import { getResultDisplayUrl } from '../../utils/resultExtractor';
import {
  selectStyle,
  formColStyle,
  formRowStyle,
  formLabelStyle,
  primaryButtonStyle,
  handleButtonMouseEnter,
  handleButtonMouseLeave,
  textareaStyle,
  handleInputFocus,
  handleInputBlur
} from './shared/nodeStyles';
import type { AdvancedNodeProps } from './shared/types';

// 安全的 UUID 生成器，兼容 HTTP 等非安全上下文
const generateUUID = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

const AiVideoNode: React.FC<AdvancedNodeProps> = ({
  node,
  nodes,
  isLight,
  onRemove,
  updateNodeTaskData,
  setNodes,
  saveCanvasState,
  selectedTokenKey,
}) => {
  const { openModelSelectorForNode, models, apiTokens, setSelectedTokenKey, setIsTokenModalVisible, setParamValues } = usePlayground();
  const { connectingSourceId, setConnectingSourceId, setConnectingMousePos, canvasRef, canvasTransform } = useCanvas();
  const [enhanceProcessing, setEnhanceProcessing] = useState(false);
  const [showPromptInput, setShowPromptInput] = useState(false);
  const [isNodeHovered, setIsNodeHovered] = useState(false);

  const tokenName = selectedTokenKey
    ? (apiTokens || []).find(t => t.token_key === selectedTokenKey)?.name || 'Token'
    : '关联 API 密钥';

  const modelName = node.taskData?.modelName || node.taskData?.model || '点击选择视频大模型';
  const modelObj = (models || []).find(m => m.mid === node.taskData?.modelMid || m.name === node.taskData?.model || m.model_id === node.taskData?.model);

  const displayParams = useMemo(() => {
    if (!modelObj?.params || !Array.isArray(modelObj.params)) return [];
    return modelObj.params.filter((p: any) => 
      p.key !== 'prompt' && 
      p.key !== 'negative_prompt' && 
      p.key !== 'negativePrompt' &&
      p.type !== 'textarea'
    );
  }, [modelObj]);

  // 1. 自动寻找父级/同级关联的 Prompt 节点
  const parentPromptNode = useMemo(() => {
    if (!node.parentId) return null;
    return (nodes || []).find(n => n.id === node.parentId && n.taskData?.node_type === 'prompt' && !n.isHidden);
  }, [nodes, node.parentId]);

  const siblingPromptNode = useMemo(() => {
    if (!node.parentId) return null;
    return (nodes || []).find(n => n.parentId === node.parentId && n.taskData?.node_type === 'prompt' && !n.isHidden);
  }, [nodes, node.parentId]);

  const effectivePrompt = node.taskData?.prompt || parentPromptNode?.taskData?.prompt || siblingPromptNode?.taskData?.prompt || '';

  // 2. 递归寻找输入源媒体节点 (用于图生视频、视频生视频)
  const findSourceMediaNode = useCallback((currNodeId: string | undefined): any => {
    if (!currNodeId) return null;
    const parent = (nodes || []).find(n => n.id === currNodeId);
    if (!parent || parent.isHidden) return null;
    const url = getResultDisplayUrl(parent.type, parent.resultData);
    if (url && ((parent.type as string) === 'image' || (parent.type as string) === 'ai_image' || parent.type === 'video' || parent.type === 'audio')) return parent;
    return findSourceMediaNode(parent.parentId);
  }, [nodes]);

  const sourceNode = findSourceMediaNode(node.parentId);

  const hasPromptConnection = !!(parentPromptNode || siblingPromptNode);
  const hasSourceMedia = !!sourceNode;
  const hasNegativePrompt = !!node.taskData?.negative_prompt;
  const hasChildConnection = useMemo(() => {
    return (nodes || []).some(n => n.parentId === node.id && !n.isHidden);
  }, [nodes, node.id]);

  // 4. 构建参数 payload
  const getRequestPayload = () => {
    const getSocketUrls = (prefix: string, max: number) => {
      const urls: string[] = [];
      for (let i = 1; i <= max; i++) {
        const connectedId = node.inputConnections?.[`${prefix} ${i}`];
        if (connectedId) {
          const resolvedNode = findSourceMediaNode(connectedId);
          if (resolvedNode) {
            const url = getResultDisplayUrl(resolvedNode.type, resolvedNode.resultData);
            if (url) {
              if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
                urls.push(url);
              } else {
                urls.push(`${window.location.origin}${url.startsWith('/') ? '' : '/'}${url}`);
              }
            }
          }
        }
      }
      return urls;
    };

    let sourceUrl = '';
    if (sourceNode) {
      const displayUrl = getResultDisplayUrl(sourceNode.type, sourceNode.resultData);
      if (displayUrl) {
        if (displayUrl.startsWith('http://') || displayUrl.startsWith('https://') || displayUrl.startsWith('data:')) {
          sourceUrl = displayUrl;
        } else {
          sourceUrl = `${window.location.origin}${displayUrl.startsWith('/') ? '' : '/'}${displayUrl}`;
        }
      }
    }

    const payload: Record<string, any> = {
      model: modelObj?.model_id || node.taskData?.model || 'kling',
      prompt: effectivePrompt.trim(),
    };

    if (displayParams.length > 0) {
      displayParams.forEach((p: any) => {
        const val = node.taskData?.[p.key] ?? node.taskData?.[p.key === 'aspect_ratio' ? 'aspectRatio' : ''] ?? p.default;
        payload[p.key] = val;
      });
    }

    const isSeedance2 = modelObj?.scheme_id === 'seedance2.0'
      || node.taskData?.scheme_id === 'seedance2.0'
      || (!modelObj && String(node.taskData?.model || '').toLowerCase().includes('seedance'));
    if (isSeedance2) {
      const imgUrls = getSocketUrls('Reference Images', 9);
      const vidUrls = getSocketUrls('Reference Videos', 3);
      const audUrls = getSocketUrls('Reference Audio', 3);

      payload.image_urls = imgUrls;
      payload.video_urls = vidUrls;
      payload.audio_urls = audUrls;
      if (node.taskData?.image_role) {
        payload.image_role = node.taskData.image_role;
      }
    } else {
      if (sourceUrl) {
        if (sourceNode?.type === 'video') {
          payload.video_urls = [sourceUrl];
        } else {
          payload.image_urls = [sourceUrl];
        }
      }
    }

    return payload;
  };

  // 5. 立即生成请求处理
  const handleSubmit = async () => {
    if (enhanceProcessing || node.taskData?.enhance_status === 'processing') return;

    if (!node.taskData?.model && !modelObj) {
      toast.warning('请先选择生成大模型！');
      return;
    }

    if (!effectivePrompt.trim()) {
      toast.warning('请输入提示词，或者在父节点下创建一个提示词节点！');
      return;
    }

    const effectiveToken = selectedTokenKey;
    if (!effectiveToken) {
      toast.warning('请先选择 API 密钥');
      return;
    }

    const payload = getRequestPayload();
    const hasReferenceImage = !!payload.image_urls && payload.image_urls.length > 0;
    const sourceUrl = hasReferenceImage ? payload.image_urls[0] : '';

    const sysLogId = 'tsk_' + generateUUID().replace(/-/g, '').toLowerCase().substring(0, 26);
    setEnhanceProcessing(true);

    // 更新当前节点状态为 processing/loading
    setNodes((prev: any) => {
      const updated = prev.map((n: any) => {
        if (n.id === node.id) {
          return {
            ...n,
            status: 'loading' as const,
            resultData: null,
            taskData: {
              ...(n.taskData || {}),
              enhance_status: 'processing',
              sys_log_id: sysLogId,
              token_key: effectiveToken,
              model_id: modelObj?.model_id || node.taskData?.model || 'kling',
              attached_urls: payload.image_urls && payload.image_urls.length > 0
                ? payload.image_urls 
                : (sourceUrl ? [sourceUrl] : [])
            }
          };
        }
        return n;
      });
      saveCanvasState(updated);
      return updated;
    });

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Playground': '1',
        'X-Log-Id': sysLogId,
        'Authorization': `Bearer ${effectiveToken}`,
      };

      const endpoint = '/v1/video/generations'; // 视频生成接口

      const res: any = await axios.post(endpoint, payload, { headers }).then(r => r.data);

      const taskId = res?.id || res?.task_id;
      const isAsyncTask = taskId && (
        res?.status === 'pending' ||
        res?.status === 'in_progress'
      );

      if (isAsyncTask) {
        const pollEndpoint = `/v1/tasks/${taskId}`;
        setNodes((prev: any) => {
          const updated = prev.map((n: any) => {
            if (n.id === node.id) {
              return {
                ...n,
                taskData: {
                  ...(n.taskData || {}),
                  task_id: taskId,
                  poll_endpoint: pollEndpoint,
                  submit_response: res
                }
              };
            }
            return n;
          });
          saveCanvasState(updated);
          return updated;
        });
        toast.success('已提交 AI 视频生成任务（异步处理中）');
      } else {
        // 同步直接完成
        setNodes((prev: any) => {
          const updated = prev.map((n: any) => {
            if (n.id === node.id) {
              return {
                ...n,
                status: 'completed' as const,
                resultData: res,
                taskData: {
                  ...(n.taskData || {}),
                  enhance_status: 'completed',
                  is_sync_completed: true,
                }
              };
            }
            return n;
          });
          saveCanvasState(updated);
          return updated;
        });
        toast.success('AI 视频生成成功');
      }
    } catch (err: any) {
      console.error('AI 视频生成失败', err);
      const errMsg = err?.response?.data?.error?.message || err?.response?.data?.message || err?.message || '生成失败，请重试';
      setNodes((prev: any) => {
        const updated = prev.map((n: any) => {
          if (n.id === node.id) {
            return {
              ...n,
              status: 'error' as const,
              resultData: { message: errMsg },
              taskData: {
                ...(n.taskData || {}),
                enhance_status: 'failed',
              }
            };
          }
          return n;
        });
        saveCanvasState(updated);
        return updated;
      });
      toast.error(`生成失败: ${errMsg}`);
    } finally {
      setEnhanceProcessing(false);
    }
  };

  const isGenerating = enhanceProcessing || node.taskData?.enhance_status === 'processing';
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  const resultUrl = node.resultData ? getResultDisplayUrl('video', node.resultData) : '';

  const isSeedance2 = modelObj?.scheme_id === 'seedance2.0'
    || node.taskData?.scheme_id === 'seedance2.0'
    || (!modelObj && String(node.taskData?.model || '').toLowerCase().includes('seedance'));

  const getVisibleSockets = (prefix: string, max: number) => {
    let highestConnected = 0;
    for (let i = 1; i <= max; i++) {
      if (node.inputConnections?.[`${prefix} ${i}`]) {
        highestConnected = Math.max(highestConnected, i);
      }
    }
    const manualCount = node.taskData?.manualSocketCounts?.[prefix] || 1;
    return Math.min(max, Math.max(manualCount, highestConnected + 1));
  };

  const handleAddSocket = (prefix: string, max: number) => {
    const currentCounts = node.taskData?.manualSocketCounts || {};
    const currentCount = getVisibleSockets(prefix, max);
    if (currentCount >= max) return;
    
    const newCounts = { ...currentCounts, [prefix]: currentCount + 1 };
    
    setNodes(prevNodes => {
      const updated = prevNodes.map(n => {
        if (n.id === node.id) {
          return {
            ...n,
            taskData: {
              ...(n.taskData || {}),
              manualSocketCounts: newCounts
            }
          };
        }
        return n;
      });
      saveCanvasState(updated);
      return updated;
    });
  };

  const renderSocket = (label: string, color: string, isConnected: boolean = false, showAsterisk: boolean = false, onAdd?: () => void) => (
    <div key={label} data-handle-id={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, width: 140, height: 20, boxSizing: 'border-box' }}>
      {onAdd && (
        <span 
          onClick={(e) => { e.stopPropagation(); onAdd(); }}
          style={{ 
            cursor: 'pointer', 
            fontSize: 14,
            fontWeight: 'bold',
            color: 'rgba(255,255,255,0.4)', 
            padding: '0 4px',
            opacity: isNodeHovered ? 1 : 0,
            transition: 'opacity 0.2s, color 0.2s',
            userSelect: 'none'
          }}
          onMouseEnter={(e) => e.currentTarget.style.color = '#fff'}
          onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.4)'}
          title="增加插座"
        >
          +
        </span>
      )}
      <span style={{
        fontSize: 11,
        fontWeight: 500,
        color: color,
        opacity: isNodeHovered ? 1 : 0,
        transition: 'opacity 0.2s ease-in-out',
        whiteSpace: 'nowrap',
      }}>
        {label} {showAsterisk && <span style={{ color: color }}>*</span>}
      </span>
      <div style={{
        width: 10,
        height: 10,
        borderRadius: '50%',
        border: `2px solid ${color}`,
        background: isConnected ? color : '#1b1b1f',
        boxShadow: isConnected ? `0 0 8px ${color}` : 'none',
        opacity: (isNodeHovered || isConnected) ? 1 : 0,
        transition: 'opacity 0.2s ease-in-out',
        flexShrink: 0,
        boxSizing: 'border-box',
      }} />
    </div>
  );

  return (
    <div
      onMouseEnter={() => setIsNodeHovered(true)}
      onMouseLeave={() => setIsNodeHovered(false)}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        padding: '0 0 14px 0',
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        color: '#fff',
        overflow: 'visible',
      }}
    >
      {/* 节点外面顶部的标题和模型名称 */}
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
        {/* 左上角外面：视频图标 + 节点标题 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, color: '#fff' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="23 7 16 12 23 17 23 7"></polygon>
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
          </svg>
          <span>Video {node.id.split('-').pop()?.slice(-3) || '1'}</span>
        </div>
        
        {/* 右上角外面：大模型名称 */}
        <div style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.45)' }}>
          {modelName}
        </div>
      </div>

      {/* 1. 外部绝对定位插孔 Handles */}
      {/* 左侧插孔 */}
      <div style={{
        position: 'absolute',
        left: -150,
        top: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        pointerEvents: (isNodeHovered || hasPromptConnection || hasSourceMedia || hasNegativePrompt || (connectingSourceId && connectingSourceId !== node.id)) ? 'auto' : 'none',
        opacity: (isNodeHovered || hasPromptConnection || hasSourceMedia || hasNegativePrompt || (connectingSourceId && connectingSourceId !== node.id)) ? 1 : 0,
        transition: 'opacity 0.2s ease-in-out',
        zIndex: 10,
      }}>
        {isSeedance2 ? (
          <>
            {renderSocket('Prompt', '#38bdf8', !!node.inputConnections?.['Prompt'] || hasPromptConnection, true)}
            
            {Array.from({ length: getVisibleSockets('Reference Images', 9) }).map((_, i) => {
              const label = `Reference Images ${i + 1}`;
              const isLast = i === getVisibleSockets('Reference Images', 9) - 1;
              const canAdd = isLast && (i + 1) < 9;
              return renderSocket(label, '#fbbf24', !!node.inputConnections?.[label], false, canAdd ? () => handleAddSocket('Reference Images', 9) : undefined);
            })}

            {Array.from({ length: getVisibleSockets('Reference Videos', 3) }).map((_, i) => {
              const label = `Reference Videos ${i + 1}`;
              const isLast = i === getVisibleSockets('Reference Videos', 3) - 1;
              const canAdd = isLast && (i + 1) < 3;
              return renderSocket(label, '#4ade80', !!node.inputConnections?.[label], false, canAdd ? () => handleAddSocket('Reference Videos', 3) : undefined);
            })}

            {Array.from({ length: getVisibleSockets('Reference Audio', 3) }).map((_, i) => {
              const label = `Reference Audio ${i + 1}`;
              const isLast = i === getVisibleSockets('Reference Audio', 3) - 1;
              const canAdd = isLast && (i + 1) < 3;
              return renderSocket(label, '#f472b6', !!node.inputConnections?.[label], false, canAdd ? () => handleAddSocket('Reference Audio', 3) : undefined);
            })}
          </>
        ) : (
          <>
            {renderSocket('Prompt', '#38bdf8', !!node.inputConnections?.['Prompt'] || hasPromptConnection, true)}
            {renderSocket('Negative Prompt', '#38bdf8', !!node.inputConnections?.['Negative Prompt'] || hasNegativePrompt)}
          </>
        )}
      </div>

      {/* 右侧插孔 */}
      <div style={{
        position: 'absolute',
        right: -75,
        top: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        pointerEvents: (isNodeHovered || !!resultUrl || hasChildConnection) ? 'auto' : 'none',
        opacity: (isNodeHovered || !!resultUrl || hasChildConnection) ? 1 : 0,
        transition: 'opacity 0.2s ease-in-out',
        zIndex: 10,
      }}>
        {/* Video Output */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: 65 }}>
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
              border: '2px solid #4ade80',
              background: resultUrl ? '#4ade80' : '#1b1b1f',
              boxShadow: resultUrl ? '0 0 8px #4ade80' : 'none',
              opacity: (isNodeHovered || !!resultUrl || hasChildConnection) ? 1 : 0,
              transition: 'all 0.2s ease-in-out',
              cursor: 'crosshair'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.5)';
              e.currentTarget.style.boxShadow = '0 0 12px #4ade80';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = resultUrl ? '0 0 8px #4ade80' : 'none';
            }}
          />
          <span style={{
            fontSize: 11,
            fontWeight: 500,
            color: '#4ade80',
            opacity: isNodeHovered ? 1 : 0,
            transition: 'opacity 0.2s ease-in-out',
          }}>
            Video
          </span>
        </div>
      </div>

      {/* 3. 中间视频预览/占位区 */}
      <div style={{
        width: '100%',
        background: '#121214',
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
        borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        position: 'relative',
        height: 240,
      }}>
        {resultUrl ? (
          <video
            src={resultUrl}
            controls
            autoPlay
            loop
            muted
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            onMouseDown={(e) => e.stopPropagation()}
          />
        ) : isGenerating ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: 'rgba(255, 255, 255, 0.35)' }}>
            <LoadingOutlined style={{ fontSize: 22, color: '#1677ff' }} />
            <span style={{ fontSize: 12, fontWeight: 500 }}>Generating video...</span>
          </div>
        ) : node.status === 'error' ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: '#ef4444', padding: '0 20px', textAlign: 'center' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}>
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="15" y1="9" x2="9" y2="15"></line>
              <line x1="9" y1="9" x2="15" y2="15"></line>
            </svg>
            <span style={{ fontSize: 12, fontWeight: 500 }}>{node.resultData?.message || '生成失败，请重试'}</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: 'rgba(255, 255, 255, 0.35)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}>
              <polygon points="23 7 16 12 23 17 23 7"></polygon>
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
            </svg>
            <span style={{ fontSize: 12, fontWeight: 500 }}>Results will appear here.</span>
          </div>
        )}
      </div>

      {/* 4. 底部控制区（含提示词、控制条和高级设置） */}
      <div style={{
        width: '100%',
        padding: '12px 18px 0',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}>
        {/* 4. 提示词输入区域 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <textarea
          value={node.taskData?.prompt || ''}
          onChange={(e) => updateNodeTaskData({ prompt: e.target.value })}
          placeholder="Write your prompt.."
          disabled={isGenerating || !!parentPromptNode || !!siblingPromptNode}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            resize: 'none',
            color: '#fff',
            fontSize: 13,
            outline: 'none',
            padding: 0,
            minHeight: 40,
            maxHeight: 80,
            lineHeight: 1.4,
          }}
        />
        {(parentPromptNode || siblingPromptNode) && (
          <div style={{ fontSize: 10, color: '#38bdf8', opacity: 0.8 }}>
            ✓ 已连接到外部提示词节点
          </div>
        )}
      </div>

      {/* 5. 底部工具控制条 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 10 }}>
        {/* 左侧：API 密钥与模型选择器 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* API 密钥选择 */}
          <div
            onClick={() => setIsTokenModalVisible(true)}
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: selectedTokenKey ? '#10b981' : 'rgba(255,255,255,0.4)',
              background: selectedTokenKey ? 'rgba(16, 185, 129, 0.06)' : 'rgba(255,255,255,0.04)',
              padding: '3px 8px',
              borderRadius: 6,
              border: selectedTokenKey ? '1px solid rgba(16, 185, 129, 0.15)' : '1px solid rgba(255,255,255,0.08)',
              cursor: 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = selectedTokenKey ? '#10b981' : '#fff';
              e.currentTarget.style.background = selectedTokenKey ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255,255,255,0.08)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = selectedTokenKey ? '#10b981' : 'rgba(255,255,255,0.4)';
              e.currentTarget.style.background = selectedTokenKey ? 'rgba(16, 185, 129, 0.06)' : 'rgba(255,255,255,0.04)';
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}>
              <path d="M7 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8z" />
              <circle cx="7" cy="12" r="1.5" fill="currentColor" stroke="none" />
              <path d="M11 12h11v4h-3v-2h-2v2h-3v-4" />
            </svg>
            <span style={{ maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {tokenName}
            </span>
          </div>

          {/* 模型选择器 */}
          <div
            onClick={() => !isGenerating && openModelSelectorForNode(node.id)}
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: 'rgba(255,255,255,0.5)',
              background: 'rgba(255,255,255,0.04)',
              padding: '3px 8px',
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.08)',
              cursor: 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
          >
            {modelName}
          </div>

          {/* 新增的图片用途选择器 (仅当有来源媒体且为图片时显示) */}
          {hasSourceMedia && sourceNode?.type === 'image' && (
            <Dropdown
              menu={{
                items: [
                  { key: 'auto', label: '自动' },
                  { key: 'start_frame', label: '首帧' },
                  { key: 'start_end_frame', label: '首尾帧' },
                  { key: 'reference_image', label: '参考图' },
                ],
                onClick: (e) => {
                  setNodes(prev => {
                    const updated = prev.map(n => {
                      if (n.id === node.id) {
                        return { ...n, taskData: { ...(n.taskData || {}), image_role: e.key } };
                      }
                      return n;
                    });
                    saveCanvasState(updated);
                    return updated;
                  });
                }
              }}
              trigger={['click']}
            >
              <div 
                onClick={(e) => e.stopPropagation()}
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: 'rgba(255,255,255,0.5)',
                  background: 'rgba(255,255,255,0.04)',
                  padding: '3px 8px',
                  borderRadius: 6,
                  border: '1px solid rgba(255,255,255,0.08)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
              >
                <PictureOutlined style={{ fontSize: 12 }} />
                <span>
                  {{
                    'auto': '自动',
                    'start_frame': '首帧',
                    'start_end_frame': '首尾帧',
                    'reference_image': '参考图'
                  }[node.taskData?.image_role as string || 'auto']}
                </span>
              </div>
            </Dropdown>
          )}
        </div>

        {/* 右侧：优化与生成按钮 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>

          {/* 立即生成 (上箭头按钮) */}
          <div
            onClick={handleSubmit}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: isGenerating ? 'rgba(255,255,255,0.1)' : '#fff',
              color: isGenerating ? 'rgba(255,255,255,0.4)' : '#000',
              cursor: isGenerating ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {isGenerating ? (
              <LoadingOutlined style={{ fontSize: 12 }} />
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="19" x2="12" y2="5"></line>
                <polyline points="5 12 12 5 19 12"></polyline>
              </svg>
            )}
          </div>
        </div>
      </div>

      {/* 6. 高级微调参数设置 */}
      {node.taskData?.model && displayParams.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8, marginTop: 4 }}>
          <div
            onClick={() => setShowAdvanced(!showAdvanced)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 11,
              color: 'rgba(255,255,255,0.4)',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <SettingOutlined style={{ fontSize: 10 }} />
              <span>高级参数设置 (Advanced Options)</span>
            </div>
            <span style={{
              display: 'inline-block',
              transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              transform: showAdvanced ? 'rotate(180deg)' : 'rotate(0deg)',
            }}>▼</span>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateRows: showAdvanced ? '1fr' : '0fr',
            transition: 'grid-template-rows 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            overflow: 'hidden'
          }}>
            <div style={{ minHeight: 0 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6, paddingBottom: 4 }}>
                {displayParams.map((p: any) => {
                  const rawVal = node.taskData?.[p.key] ?? node.taskData?.[p.key === 'aspect_ratio' ? 'aspectRatio' : ''] ?? p.default;

                  const handleChange = (val: any) => {
                    const patch: Record<string, any> = { [p.key]: val };
                    if (p.key === 'aspect_ratio') {
                      patch.aspectRatio = val;
                    }
                    setParamValues((prev: any) => ({ ...prev, ...patch }));
                    updateNodeTaskData(patch);
                  };

                  return (
                    <div key={p.key} style={{ ...formRowStyle(isLight), justifyContent: 'space-between', padding: '2px 0', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>{p.name || p.key}:</span>
                      {p.type === 'select' || p.type === 'radio' ? (
                        <select
                          value={String(rawVal)}
                          onChange={(e) => handleChange(e.target.value)}
                          style={{ ...selectStyle(isLight), maxWidth: '140px', padding: '2px 4px', background: '#2c2d30', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 11 }}
                          disabled={isGenerating}
                        >
                          {p.options?.map((opt: any) => (
                            <option key={String(opt)} value={String(opt)}>
                              {String(opt)}
                            </option>
                          ))}
                        </select>
                      ) : p.type === 'switch' ? (
                        <input
                          type="checkbox"
                          checked={!!rawVal}
                          onChange={(e) => handleChange(e.target.checked)}
                          style={{ cursor: 'pointer' }}
                          disabled={isGenerating}
                        />
                      ) : p.type === 'number' ? (
                        <input
                          type="number"
                          value={rawVal !== undefined ? Number(rawVal) : ''}
                          min={p.min ?? undefined}
                          max={p.max ?? undefined}
                          step={p.step ?? 1}
                          onChange={(e) => handleChange(Number(e.target.value))}
                          style={{
                            background: '#2c2d30',
                            border: '1px solid rgba(255,255,255,0.12)',
                            color: '#fff',
                            fontSize: '11px',
                            borderRadius: '4px',
                            padding: '2px 4px',
                            width: '60px',
                            outline: 'none',
                          }}
                          disabled={isGenerating}
                        />
                      ) : (
                        <input
                          type="text"
                          value={String(rawVal ?? '')}
                          onChange={(e) => handleChange(e.target.value)}
                          style={{
                            background: '#2c2d30',
                            border: '1px solid rgba(255,255,255,0.12)',
                            color: '#fff',
                            fontSize: '11px',
                            borderRadius: '4px',
                            padding: '2px 4px',
                            width: '100px',
                            outline: 'none',
                          }}
                          disabled={isGenerating}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

AiVideoNode.displayName = 'AiVideoNode';
export default React.memo(AiVideoNode);
