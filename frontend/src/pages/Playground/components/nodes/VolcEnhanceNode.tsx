/**
 * 火山画质增强 / 字幕擦除节点组件
 * 从 CanvasNode.tsx 提取 — 保留全部功能
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import toast from '../PlaygroundToast';
import { LoadingOutlined } from '@ant-design/icons';
import axios from 'axios';
import type { AdvancedNodeProps } from './shared/types';
import NodeShell from './shared/NodeShell';
import {
  selectStyle,
  codeBlockStyle,
  sectionLabelStyle,
  secondaryColor,
  formColStyle,
  formRowStyle,
  formLabelStyle,
  primaryButtonStyle,
  handleButtonMouseEnter,
  handleButtonMouseLeave,
  dashedButtonStyle,
  handleDashedButtonMouseEnter,
  handleDashedButtonMouseLeave,
  helpTextStyle,
  handleInputFocus,
  handleInputBlur
} from './shared/nodeStyles';
import { getResultDisplayUrl } from '../../utils/resultExtractor';

const VolcEnhanceNode: React.FC<AdvancedNodeProps> = ({
  node, nodes, isLight,
  updateNodeTaskData, onRemove,
  setNodes, saveCanvasState, selectedTokenKey,
}) => {
  // ── 节点本地状态 ──
  const [isExpanded, setIsExpanded] = useState((node.height || 240) > 240);
  const [enhanceProcessing, setEnhanceProcessing] = useState(false);
  const [curlText, setCurlText] = useState('');
  const curlEditedRef = useRef(false);
  const prevParamKeyRef = useRef('');

  // ── 模型 / 标题派生 ──
  const modelName = node.taskData?.model || '火山画质增强 - 标准版';
  const isStandardEnhance = modelName === '火山画质增强 - 标准版';
  const isSubtitleEraser = modelName.includes('字幕擦除');
  const isEnhance = !isSubtitleEraser;
  const nodeTitle = isSubtitleEraser ? '火山字幕擦除' : '火山画质增强';
  const nodeIcon = isSubtitleEraser ? '🧹' : '🚀';

  // ── 动态生成火山增强/字幕擦除的请求 payload ──
  const getRequestPayload = () => {
    // 递归查找输入源头
    const findSourceNode = (currNodeId: string | undefined): any => {
      if (!currNodeId) return null;
      const parent = nodes.find(n => n.id === currNodeId);
      if (!parent || parent.isHidden) return null;
      const url = getResultDisplayUrl(parent.type, parent.resultData);
      if (url) return parent;
      return findSourceNode(parent.parentId);
    };

    const sourceNode = findSourceNode(node.parentId);
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

    const modelMap: Record<string, string> = {
      '火山画质增强 - 标准版': 'volc_video_enhance_standard',
      '火山画质增强 - 专业版': 'volc_video_enhance_professional',
      '火山画质增强 - 极速版': 'volc_video_enhance_fast',
      '火山画质增强 - 大模型版': 'volc_video_enhance_generative',
      '火山字幕擦除 - 标准版': 'volc_video_subtitle_erase',
      '火山字幕擦除 - 精细版': 'volc_video_subtitle_erase_pro',
    };
    const modelId = modelMap[modelName] || 'volc_video_enhance_standard';

    // 构建符合火山 MediaKit API 的请求体
    const body: Record<string, any> = {
      model: modelId,
      video_url: sourceUrl || '',
    };

    if (!isSubtitleEraser) {
      // 场景类型（只有标准版才有场景类型）
      if (isStandardEnhance) {
        const rawScene = node.taskData?.scene || 'AI 生成 (AIGC)';
        const sceneMap: Record<string, string> = {
          'AI 生成 (AIGC)': 'aigc',
          '用户原创 (UGC)': 'ugc',
          '短剧': 'short_series',
          '老片修复': 'old_film',
          '通用': 'common',
        };
        body.scene = sceneMap[rawScene] || 'aigc';
      }

      // 目标分辨率
      const rawResolution = node.taskData?.resolution || '保持原分辨率';
      if (rawResolution !== '保持原分辨率') {
        const resolutionMap: Record<string, string> = {
          '540p': '540p',
          '720p': '720p',
          '1080p': '1080p',
          '2K': '2k',
          '4K': '4k',
        };
        body.resolution = resolutionMap[rawResolution] || rawResolution.toLowerCase();
      }

      // 目标帧率（多增加 120fps 支持）
      const rawFps = node.taskData?.fps || '保持原帧率';
      if (rawFps !== '保持原帧率') {
        const fpsMap: Record<string, number> = {
          '24fps': 24,
          '30fps': 30,
          '60fps': 60,
          '120fps': 120,
        };
        body.fps = fpsMap[rawFps] || parseInt(rawFps) || undefined;
      }
    }

    return body;
  };

  // 根据 payload 生成 curl 命令字符串
  const generateCurlCommand = useCallback(() => {
    const payload = getRequestPayload();
    const tokenDisplay = selectedTokenKey || '<YOUR_API_KEY>';
    return `curl -X POST '${window.location.origin}/v1/video/generations' \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer ${tokenDisplay}' \\
  -d '${JSON.stringify(payload, null, 2)}'`;
  }, [node.taskData?.model, node.taskData?.scene, node.taskData?.resolution, node.taskData?.fps, node.taskData?.erasure_mode, node.taskData?.detection_range, node.parentId, nodes, selectedTokenKey]);

  // 从 curl 文本中解析出 URL、Token、Body
  const parseCurlCommand = useCallback((curl: string) => {
    // 提取 URL
    const urlMatch = curl.match(/curl\s+-X\s+POST\s+'([^']+)'/);
    const url = urlMatch?.[1] || '';
    // 提取 path (去掉 origin)
    let path = url;
    try {
      const u = new URL(url);
      path = u.pathname + u.search;
    } catch { /* keep as-is */ }
    // 提取 Authorization Bearer Token
    const authMatch = curl.match(/-H\s+'Authorization:\s*Bearer\s+([^']+)'/);
    const token = authMatch?.[1] || '';
    // 提取 -d 后面的 JSON body
    let body: Record<string, any> = {};
    const bodyStart = curl.indexOf("-d '");
    if (bodyStart !== -1) {
      const jsonStart = bodyStart + 4;
      const jsonEnd = curl.lastIndexOf("'");
      if (jsonEnd > jsonStart) {
        try { body = JSON.parse(curl.substring(jsonStart, jsonEnd)); } catch { }
      }
    }
    return { path, token, body };
  }, []);

  // 自动重新生成 curl 命令（参数变化时）
  useEffect(() => {
    // 用下拉参数拼接指纹，只有这些值真正变化时才重新生成
    const paramKey = `${node.taskData?.model}|${node.taskData?.scene}|${node.taskData?.resolution}|${node.taskData?.fps}|${node.taskData?.erasure_mode}|${node.taskData?.detection_range}|${node.parentId}|${selectedTokenKey}`;

    if (prevParamKeyRef.current !== paramKey) {
      // 下拉参数真正变化了，重置手动编辑标记并重新生成
      prevParamKeyRef.current = paramKey;
      curlEditedRef.current = false;
      setCurlText(generateCurlCommand());
    }
  });

  // 自愈机制：如果画质增强节点的状态为"处理中"，但其子预览节点已经完成或失败，自动同步状态
  useEffect(() => {
    if (node.taskData?.enhance_status !== 'processing') return;

    const previewNode = nodes.find(n => n.parentId === node.id && n.taskData?.node_type === 'preview');
    if (!previewNode) return;

    if (previewNode.status === 'completed') {
      setNodes((prev: any) => prev.map((n: any) => n.id === node.id ? {
        ...n,
        taskData: { ...(n.taskData || {}), enhance_status: 'completed' }
      } : n));
    } else if (previewNode.status === 'error') {
      setNodes((prev: any) => prev.map((n: any) => n.id === node.id ? {
        ...n,
        taskData: { ...(n.taskData || {}), enhance_status: 'failed' }
      } : n));
    }
  }, [node.id, node.taskData?.enhance_status, nodes, setNodes]);

  // 展开 / 收起切换
  const toggleExpand = () => {
    const nextExpanded = !isExpanded;
    setIsExpanded(nextExpanded);
    const targetHeight = nextExpanded ? 600 : 240;
    setNodes((prev: any) => {
      const next = prev.map((n: any) => {
        if (n.id === node.id) {
          return { ...n, height: targetHeight };
        }
        return n;
      });
      saveCanvasState(next);
      return next;
    });
  };

  // 提交处理
  const handleSubmit = async () => {
    // 从 curl 文本解析请求参数（以 curl 编辑内容为准）
    const parsed = parseCurlCommand(curlText || generateCurlCommand());
    const { path: reqPath, token: reqToken, body: payload } = parsed;

    if (!payload.video_url) {
      toast.warning('请先连接输入源视频节点');
      return;
    }
    const effectiveToken = reqToken && reqToken !== '<YOUR_API_KEY>' ? reqToken : selectedTokenKey;
    if (!effectiveToken) {
      toast.warning('请先选择 API 密钥');
      return;
    }

    const sysLogId = 'tsk_' + crypto.randomUUID().replace(/-/g, '').toLowerCase().substring(0, 26);
    setEnhanceProcessing(true);

    // 自动展开详细数据面板
    setIsExpanded(true);
    const targetHeight = 600;

    // 将控制面板标记为处理中，同时将子 preview 节点标记为 loading 以供自动恢复与轮询机制完美复用
    let initialUpdatedNodes: any[] = [];
    setNodes((prev: any) => {
      const updated = prev.map((n: any) => {
        if (n.id === node.id) {
          return {
            ...n,
            height: targetHeight,
            taskData: {
              ...(n.taskData || {}),
              enhance_status: 'processing',
              sys_log_id: sysLogId,
              token_key: effectiveToken
            }
          };
        }
        if (n.parentId === node.id && n.taskData?.node_type === 'preview') {
          return {
            ...n,
            status: 'loading',
            type: 'video',
            taskData: {
              ...(n.taskData || {}),
              model_id: payload.model,
              sys_log_id: sysLogId,
              token_key: effectiveToken
            }
          };
        }
        return n;
      });
      initialUpdatedNodes = updated;
      return updated;
    });
    saveCanvasState(initialUpdatedNodes);


    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Playground': '1',
        'X-Log-Id': sysLogId,
        'Authorization': `Bearer ${effectiveToken}`,
      };

      // 使用 curl 中解析出的端点路径和请求体
      const endpoint = reqPath || '/v1/video/generations';
      const res = await axios.post(endpoint, payload, { headers }).then(r => r.data);

      const taskId = res?.id || res?.task_id;
      if (taskId) {
        // 异步任务：更新节点状态并启动轮询
        const pollEndpoint = `/v1/tasks/${taskId}`;

        // 写入真实任务 ID 和轮询端点
        let asyncUpdatedNodes: any[] = [];
        setNodes((prev: any) => {
          const updated = prev.map((n: any) => {
            if (n.id === node.id) {
              return {
                ...n,
                height: targetHeight,
                taskData: {
                  ...(n.taskData || {}),
                  enhance_status: 'processing',
                  task_id: taskId,
                  poll_endpoint: pollEndpoint,
                  token_key: effectiveToken,
                  submit_response: {
                    success: true,
                    task_id: taskId,
                    status: 'pending'
                  },
                  sys_log_id: sysLogId,
                }
              };
            }
            if (n.parentId === node.id && n.taskData?.node_type === 'preview') {
              return {
                ...n,
                taskData: {
                  ...(n.taskData || {}),
                  task_id: taskId,
                  poll_endpoint: pollEndpoint,
                  token_key: effectiveToken,
                  model_id: payload.model,
                  sys_log_id: sysLogId,
                }
              };
            }
            return n;
          });
          asyncUpdatedNodes = updated;
          return updated;
        });
        saveCanvasState(asyncUpdatedNodes);

        // 注意：不在此处手动 setTaskPollingNodes，而是让 useGeneration.ts 中的
        // 自动恢复 useEffect 检测到 preview 节点的 status='loading' + task_id 后
        // 自动启动 pollTaskStatus（该 effect 会同时注册 + 启动轮询，避免竞态）

        toast.success('已提交火山引擎 MediaKit 处理任务');
      } else {
        // 同步任务（不太可能，但兜底处理）
        let syncUpdatedNodes: any[] = [];
        setNodes((prev: any) => {
          const updated = prev.map((n: any) => n.id === node.id ? {
            ...n,
            height: targetHeight,
            taskData: { ...(n.taskData || {}), enhance_status: 'completed', sys_log_id: sysLogId }
          } : n);
          syncUpdatedNodes = updated;
          return updated;
        });
        saveCanvasState(syncUpdatedNodes);
        toast.success('处理完成');
      }
    } catch (err: any) {
      console.error('火山画质增强请求失败:', err);
      const errMsg = err?.response?.data?.error?.message || err?.response?.data?.message || err?.response?.data?.error_message || err?.message || '请求失败';
      toast.error(`处理失败: ${errMsg}`);
      let errorUpdatedNodes: any[] = [];
      setNodes((prev: any) => {
        const updated = prev.map((n: any) => n.id === node.id ? {
          ...n,
          taskData: {
            ...(n.taskData || {}),
            enhance_status: 'failed',
            submit_response: err?.response?.data || {
              success: false,
              status: 'failed',
              error_message: errMsg
            },
            sys_log_id: sysLogId
          }
        } : n);
        errorUpdatedNodes = updated;
        return updated;
      });
      saveCanvasState(errorUpdatedNodes);
    } finally {
      setEnhanceProcessing(false);
    }
  };

  const isProcessing = enhanceProcessing || node.taskData?.enhance_status === 'processing';

  return (
    <NodeShell
      icon={nodeIcon}
      title={nodeTitle}
      badge="MediaKit"
      badgeColor="#1677ff"
      onClose={() => onRemove(node.id)}
      isLight={isLight}
      style={{ justifyContent: isExpanded ? 'flex-start' : 'center' }}
    >
      <div style={{ fontSize: 12, color: secondaryColor(isLight) }}>
        输入源: <span style={{ fontFamily: 'monospace' }}>{node.parentId}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
        {/* 模型选择 */}
        <div style={formColStyle(isLight)}>
          <span style={formLabelStyle(isLight)}>选择模型:</span>
          <select
            value={modelName}
            onChange={(e) => {
              const nextModel = e.target.value;
              const isNextEnhance = !nextModel.includes('字幕擦除');
              const defaultFields = isNextEnhance ? {
                model: nextModel,
                scene: nextModel === '火山画质增强 - 标准版' ? (node.taskData?.scene || 'AI 生成 (AIGC)') : undefined,
                resolution: node.taskData?.resolution || '保持原分辨率',
                fps: node.taskData?.fps || '保持原帧率',
              } : {
                model: nextModel,
              };
              updateNodeTaskData(defaultFields);
            }}
            style={{ ...selectStyle(isLight), width: '100%' }}
          >
            <option value="火山画质增强 - 标准版">火山画质增强 - 标准版</option>
            <option value="火山画质增强 - 专业版">火山画质增强 - 专业版</option>
            <option value="火山画质增强 - 极速版">火山画质增强 - 极速版</option>
            <option value="火山画质增强 - 大模型版">火山画质增强 - 大模型版</option>
            <option value="火山字幕擦除 - 标准版">火山字幕擦除 - 标准版</option>
            <option value="火山字幕擦除 - 精细版">火山字幕擦除 - 精细版</option>
          </select>
        </div>

        {/* 增强模式专属参数 vs 字幕擦除说明 */}
        {isEnhance ? (
          <>
            {isStandardEnhance && (
              <div style={formRowStyle(isLight)}>
                <span style={formLabelStyle(isLight)}>场景类型:</span>
                <select
                  value={node.taskData?.scene || 'AI 生成 (AIGC)'}
                  onChange={(e) => updateNodeTaskData({ scene: e.target.value })}
                  style={{ ...selectStyle(isLight), width: '130px' }}
                >
                  <option value="AI 生成 (AIGC)">AI 生成 (AIGC)</option>
                  <option value="用户原创 (UGC)">用户原创 (UGC)</option>
                  <option value="短剧">短剧</option>
                  <option value="老片修复">老片修复</option>
                  <option value="通用">通用</option>
                </select>
              </div>
            )}
            <div style={formRowStyle(isLight)}>
              <span style={formLabelStyle(isLight)}>目标分辨率:</span>
              <select
                value={node.taskData?.resolution || '保持原分辨率'}
                onChange={(e) => updateNodeTaskData({ resolution: e.target.value })}
                style={{ ...selectStyle(isLight), width: '130px' }}
              >
                <option value="保持原分辨率">保持原分辨率</option>
                <option value="540p">540p</option>
                <option value="720p">720p</option>
                <option value="1080p">1080p</option>
                <option value="2K">2K</option>
                <option value="4K">4K</option>
              </select>
            </div>
            <div style={formRowStyle(isLight)}>
              <span style={formLabelStyle(isLight)}>目标帧率:</span>
              <select
                value={node.taskData?.fps || '保持原帧率'}
                onChange={(e) => updateNodeTaskData({ fps: e.target.value })}
                style={{ ...selectStyle(isLight), width: '130px' }}
              >
                <option value="保持原帧率">保持原帧率</option>
                <option value="24fps">24fps</option>
                <option value="30fps">30fps</option>
                <option value="60fps">60fps</option>
                <option value="120fps">120fps</option>
              </select>
            </div>
          </>
        ) : (
          <div style={helpTextStyle(isLight)}>
            <div style={{ marginBottom: 4 }}>
              {modelName.includes('精细') ? (
                <span>✨ <span style={{ color: 'rgba(255,255,255,0.6)' }}>精细化版</span> — 采用大模型技术，擦除效果更精细，适合高质量要求场景</span>
              ) : (
                <span>⚡ <span style={{ color: 'rgba(255,255,255,0.6)' }}>标准版</span> — 速度更快，适合批量处理场景</span>
              )}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.3)' }}>
              接口: {modelName.includes('精细') ? 'erase-video-subtitle-pro' : 'erase-video-subtitle'}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>
              参数: 仅需提供 video_url，无额外配置项
            </div>
          </div>
        )}

        {/* 提交按钮 */}
        <button
          disabled={isProcessing}
          onClick={handleSubmit}
          style={{
            ...primaryButtonStyle(isLight),
            background: isProcessing ? '#555' : '#1677ff',
            cursor: isProcessing ? 'not-allowed' : 'pointer',
            marginTop: 4,
            opacity: isProcessing ? 0.7 : 1,
          }}
          onMouseEnter={(e) => handleButtonMouseEnter(e, isProcessing)}
          onMouseLeave={(e) => handleButtonMouseLeave(e, isProcessing)}
        >
          {isProcessing ? '⏳ 处理中...' :
            node.taskData?.enhance_status === 'failed' ? '❌ 重新处理' : '立即处理'}
        </button>

        {/* 展开 / 收起按钮 */}
        <button
          onClick={toggleExpand}
          style={dashedButtonStyle(isLight)}
          onMouseEnter={(e) => handleDashedButtonMouseEnter(e, isLight)}
          onMouseLeave={(e) => handleDashedButtonMouseLeave(e, isLight)}
        >
          {isExpanded ? '收起详细数据 ▲' : '展开详细数据 ▼'}
        </button>

        {/* 展开面板 */}
        {isExpanded && (() => {
          // 获取子 preview 节点状态
          const previewChild = nodes.find((n: any) => n.parentId === node.id && n.taskData?.node_type === 'preview');
          const submitResponse = node.taskData?.submit_response;
          // 优先使用 poll_response（原始轮询响应，与后端日志一致），
          // 兜底使用 preview 子节点的 resultData
          const finalResultData = node.taskData?.poll_response || previewChild?.resultData;
          const previewStatus = previewChild?.status;

          const _codeBlockStyle = codeBlockStyle(isLight);
          const _sectionLabelStyle = sectionLabelStyle(isLight);

          return (
            <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, minHeight: 0, overflowY: 'auto' }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {/* 日志 ID (sys_log_id) */}
              {node.taskData?.sys_log_id && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 8px',
                  borderRadius: 4,
                  background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.05)',
                  border: isLight ? '1px solid rgba(0,0,0,0.05)' : '1px solid rgba(255,255,255,0.08)'
                }}>
                  <span style={{ fontSize: 12, color: secondaryColor(isLight) }}>日志 ID:</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, fontFamily: 'monospace', color: isLight ? '#1f1f1f' : '#e3e3e3', fontWeight: 500 }}>{node.taskData.sys_log_id}</span>
                    <span
                      style={{ cursor: 'pointer', color: '#1677ff', fontSize: 11 }}
                      onClick={() => {
                        navigator.clipboard.writeText(node.taskData.sys_log_id);
                        toast.success('日志 ID 已复制');
                      }}
                    >
                      复制
                    </span>
                  </div>
                </div>
              )}

              {/* ① 请求命令 (bash curl) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={_sectionLabelStyle}>
                  <span>📤 请求命令 (bash curl)</span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <span
                      style={{ cursor: 'pointer', color: 'rgba(255,255,255,0.35)' }}
                      onClick={() => {
                        curlEditedRef.current = false;
                        setCurlText(generateCurlCommand());
                        toast.success('已重置为默认命令');
                      }}
                    >
                      重置
                    </span>
                    <span
                      style={{ cursor: 'pointer', color: '#1677ff' }}
                      onClick={() => {
                        navigator.clipboard.writeText(curlText);
                        toast.success('curl 命令已复制到剪贴板');
                      }}
                    >
                      复制
                    </span>
                  </div>
                </div>
                <textarea
                  value={curlText}
                  onChange={(e) => { setCurlText(e.target.value); curlEditedRef.current = true; }}
                  style={{
                    ..._codeBlockStyle,
                    resize: 'vertical' as const,
                    minHeight: '60px',
                    maxHeight: '120px',
                  }}
                  onFocus={handleInputFocus}
                  onBlur={(e) => handleInputBlur(e, isLight)}
                />
              </div>

              {/* ② 提交响应结果 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={_sectionLabelStyle}>
                  <span>📥 提交响应结果 {submitResponse ? (node.taskData?.task_id ? <span style={{ color: '#52c41a', marginLeft: 4 }}>✓ 已获取 task_id</span> : <span style={{ color: '#faad14', marginLeft: 4 }}>⚠ 无 task_id</span>) : <span style={{ color: 'rgba(255,255,255,0.25)', marginLeft: 4 }}>等待提交...</span>}</span>
                  {submitResponse && (
                    <span
                      style={{ cursor: 'pointer', color: '#1677ff' }}
                      onClick={() => {
                        navigator.clipboard.writeText(JSON.stringify(submitResponse, null, 2));
                        toast.success('提交响应结果已复制');
                      }}
                    >
                      复制
                    </span>
                  )}
                </div>
                <div style={_codeBlockStyle}>
                  {submitResponse ? JSON.stringify(submitResponse, null, 2) : '尚未发起请求'}
                </div>
              </div>

              {/* ③ 最终返回数据 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={_sectionLabelStyle}>
                  <span>🎬 最终返回数据 {
                    previewStatus === 'completed' ? <span style={{ color: '#52c41a', marginLeft: 4 }}>✓ 已完成</span> :
                      previewStatus === 'loading' ? <span style={{ color: '#1677ff', marginLeft: 4 }}><LoadingOutlined style={{ marginRight: 2 }} />轮询中...</span> :
                        previewStatus === 'error' ? <span style={{ color: '#ff4d4f', marginLeft: 4 }}>✕ 失败</span> :
                          <span style={{ color: 'rgba(255,255,255,0.25)', marginLeft: 4 }}>等待处理...</span>
                  }</span>
                  {finalResultData && (
                    <span
                      style={{ cursor: 'pointer', color: '#1677ff' }}
                      onClick={() => {
                        navigator.clipboard.writeText(JSON.stringify(finalResultData, null, 2));
                        toast.success('最终数据已复制');
                      }}
                    >
                      复制
                    </span>
                  )}
                </div>
                <div style={{ ..._codeBlockStyle, maxHeight: '140px' }}>
                  {finalResultData ? JSON.stringify(finalResultData, null, 2) : (
                    node.taskData?.enhance_status === 'processing' ? '任务处理中，等待轮询结果...' : '尚未开始处理'
                  )}
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </NodeShell>
  );
};

export default React.memo(VolcEnhanceNode);
