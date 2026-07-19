/**
 * 🎨 AI 图片生成节点
 * 从 CanvasNode.tsx 提取的独立组件，按 Kling 3.0 风格进行了全新设计重构
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import toast from '../PlaygroundToast';
import { usePlayground, useCanvas } from '../../context/PlaygroundContext';
import { LoadingOutlined, SettingOutlined } from '@ant-design/icons';
import { Dropdown, Switch } from 'antd';
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

const AiImageNode: React.FC<AdvancedNodeProps> = ({
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
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isNodeHovered, setIsNodeHovered] = useState(false);
  const showLeftSockets = isNodeHovered || (connectingSourceId && connectingSourceId !== node.id);

  const tokenName = selectedTokenKey
    ? (apiTokens || []).find(t => t.token_key === selectedTokenKey)?.name || 'Token'
    : '关联 API 密钥';

  const modelName = node.taskData?.modelName || node.taskData?.model || '选择图片大模型';
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

  // 2. 递归寻找输入源图片 (用于图生图)
  const findSourceImageNode = useCallback((currNodeId: string | undefined): any => {
    if (!currNodeId) return null;
    const parent = (nodes || []).find(n => n.id === currNodeId);
    if (!parent || parent.isHidden) return null;
    const url = getResultDisplayUrl(parent.type, parent.resultData);
    if (url && (parent.type === 'image' || parent.taskData?.node_type === 'ai_image')) return parent;
    return findSourceImageNode(parent.parentId);
  }, [nodes]);

  const sourceNode = findSourceImageNode(node.parentId);

  const hasPromptConnection = !!(parentPromptNode || siblingPromptNode);
  const hasSourceImage = !!sourceNode;
  const hasChildConnection = useMemo(() => {
    return (nodes || []).some(n => n.parentId === node.id && !n.isHidden);
  }, [nodes, node.id]);

  // 3. 构建参数 payload
  const getRequestPayload = () => {
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
      model: modelObj?.model_id || node.taskData?.model || 'sdxl',
      prompt: effectivePrompt.trim(),
    };

    if (displayParams.length > 0) {
      displayParams.forEach((p: any) => {
        const val = node.taskData?.[p.key] ?? node.taskData?.[p.key === 'aspect_ratio' ? 'aspectRatio' : ''] ?? p.default;
        payload[p.key] = val;
      });
    }

    if (sourceUrl) {
      payload.image_urls = [sourceUrl];
    }

    return payload;
  };

  // 4. 立即生成请求处理
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
    const endpoint = hasReferenceImage ? '/v1/images/edits' : '/v1/images/generations';

    const sysLogId = 'tsk_' + generateUUID().replace(/-/g, '').toLowerCase().substring(0, 26);
    setEnhanceProcessing(true);

    // 更新当前节点状态为 processing/loading
    setNodes((prev) => {
      const updated = prev.map(n => {
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
              model_id: modelObj?.model_id || node.taskData?.model || 'sdxl',
              attached_urls: sourceUrl ? [sourceUrl] : []
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

      const res: any = await axios.post(endpoint, payload, { headers }).then(r => r.data);

      const taskId = res?.id || res?.task_id;
      const isAsyncTask = taskId && (
        res?.status === 'pending' ||
        res?.status === 'in_progress'
      );

      if (isAsyncTask) {
        const pollEndpoint = `/v1/tasks/${taskId}`;
        setNodes((prev) => {
          const updated = prev.map(n => {
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
        toast.success('已提交 AI 图片生成任务（异步处理中）');
      } else {
        // 同步直接完成
        setNodes((prev) => {
          const updated = prev.map(n => {
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
        toast.success('AI 图片生成成功');
      }
    } catch (err: any) {
      console.error('AI 图片生成失败', err);
      const errMsg = err?.response?.data?.error?.message || err?.response?.data?.message || err?.message || '生成失败，请重试';
      setNodes((prev) => {
        const updated = prev.map(n => {
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

  const handleEnhancePrompt = () => {
    const currentPrompt = node.taskData?.prompt || '';
    if (!currentPrompt.trim()) {
      toast.info('请先输入提示词再优化');
      return;
    }
    updateNodeTaskData({ prompt: currentPrompt.trim() + ', photorealistic, 8k resolution, highly detailed, masterpiece' });
    toast.success('已使用智能魔法优化提示词！');
  };

  const isGenerating = enhanceProcessing || node.taskData?.enhance_status === 'processing';


  const resultUrl = node.resultData ? getResultDisplayUrl('image', node.resultData) : '';

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
        {/* 左上角外面：图片图标 + 节点标题 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, color: '#fff' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <circle cx="8.5" cy="8.5" r="1.5"></circle>
            <polyline points="21 15 16 10 5 21"></polyline>
          </svg>
          <span>Image {node.id.split('-').pop()?.slice(-3) || '1'}</span>
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
        left: -130,
        top: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        pointerEvents: (showLeftSockets || hasPromptConnection || hasSourceImage) ? 'auto' : 'none',
        opacity: (showLeftSockets || hasPromptConnection || hasSourceImage) ? 1 : 0,
        transition: 'opacity 0.2s ease-in-out',
        zIndex: 10,
      }}>
        {/* Prompt */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, width: 120 }}>
          <span style={{
            fontSize: 11,
            fontWeight: 500,
            color: '#38bdf8',
            opacity: showLeftSockets ? 1 : 0,
            transition: 'opacity 0.2s ease-in-out',
          }}>
            Prompt <span style={{ color: '#38bdf8' }}>*</span>
          </span>
          <div style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            border: '2px solid #38bdf8',
            background: hasPromptConnection ? '#38bdf8' : '#1b1b1f',
            boxShadow: hasPromptConnection ? '0 0 8px #38bdf8' : 'none',
            opacity: (showLeftSockets || hasPromptConnection) ? 1 : 0,
            transition: 'opacity 0.2s ease-in-out',
          }} />
        </div>

        {/* Reference Image */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, width: 120 }}>
          <span style={{
            fontSize: 11,
            fontWeight: 500,
            color: '#f59e0b',
            opacity: showLeftSockets ? 1 : 0,
            transition: 'opacity 0.2s ease-in-out',
          }}>
            Reference Image
          </span>
          <div style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            border: '2px solid #f59e0b',
            background: sourceNode ? '#f59e0b' : '#1b1b1f',
            boxShadow: sourceNode ? '0 0 8px #f59e0b' : 'none',
            opacity: (showLeftSockets || hasSourceImage) ? 1 : 0,
            transition: 'opacity 0.2s ease-in-out',
          }} />
        </div>
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
        {/* Image Output */}
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
              border: '2px solid #f59e0b',
              background: resultUrl ? '#f59e0b' : '#1b1b1f',
              boxShadow: resultUrl ? '0 0 8px #f59e0b' : 'none',
              opacity: (isNodeHovered || !!resultUrl || hasChildConnection) ? 1 : 0,
              transition: 'all 0.2s ease-in-out',
              cursor: 'crosshair'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.5)';
              e.currentTarget.style.boxShadow = '0 0 12px #f59e0b';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = resultUrl ? '0 0 8px #f59e0b' : 'none';
            }}
          />
          <span style={{
            fontSize: 11,
            fontWeight: 500,
            color: '#f59e0b',
            opacity: isNodeHovered ? 1 : 0,
            transition: 'opacity 0.2s ease-in-out',
          }}>
            Image
          </span>
        </div>
      </div>

      {/* 3. 中间图片预览/占位区 */}
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
          <img
            src={resultUrl}
            alt="Generated Media"
            draggable={false}
            onDragStart={(e) => e.preventDefault()}
            style={{ width: '100%', height: '100%', objectFit: 'contain', cursor: 'inherit' }}
          />
        ) : isGenerating ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: 'rgba(255, 255, 255, 0.35)' }}>
            <LoadingOutlined style={{ fontSize: 22, color: '#1677ff' }} />
            <span style={{ fontSize: 12, fontWeight: 500 }}>Generating media...</span>
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
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <circle cx="8.5" cy="8.5" r="1.5"></circle>
              <polyline points="21 15 16 10 5 21"></polyline>
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

AiImageNode.displayName = 'AiImageNode';
export default React.memo(AiImageNode);
