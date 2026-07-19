/**
 * 生成与轮询 Hook
 * 封装 API 调用、节点创建、异步轮询逻辑
 */
import { useCallback, useRef, useEffect } from 'react';
import toast from '../components/PlaygroundToast';
import axios from 'axios';
import requestUtil from '../../../utils/request';
import type { CanvasNode } from '../types';
import { useCanvas } from '../context/PlaygroundContext';
import { usePlayground } from '../context/PlaygroundContext';
import { extractImageUrl, extractVideoUrl } from '../utils/resultExtractor';
import { isMaterialQuotaNode } from '../utils/nodeHelpers';

/**
 * 前端直传 TOS 辅助函数
 * 流程：获取预签名 PUT URL → 浏览器直接 PUT 文件到 TOS（不经过服务器）→ 登记数据库
 * 失败时抛出错误，由调用方 catch 后回退到原有服务端中转接口
 *
 * @param projectId  项目 ID
 * @param file       要上传的文件（Blob 或 File）
 * @param assetType  资源类型：image | video | audio
 * @param contentType MIME 类型（用于推断扩展名及设置 PUT 请求头 Content-Type）
 * @param meta        业务元数据（prompt、model_id 等，可选）
 */
async function directUploadToTos(
  projectId: number | string,
  file: Blob | File,
  assetType: string,
  contentType: string,
  meta?: {
    fileHash?: string;
    prompt?: string;
    model_id?: string;
    model_name?: string;
    generation_params?: any;
    canvas_node_data?: any;
    file_name_hint?: string;
  },
  /** 静默错误（由调用方统一提示，避免全局 toast 刷屏） */
  silent = false,
): Promise<{ id: number; file_url: string; file_name: string; file_size: number; deduplicated?: boolean }> {
  const reqOpts = silent ? ({ skipErrorHandler: true } as any) : undefined;

  // 1. 获取文件扩展名
  const mimeToExt: Record<string, string> = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif',
    'video/mp4': 'mp4', 'video/webm': 'webm', 'audio/mpeg': 'mp3', 'audio/wav': 'wav',
    'application/octet-stream': 'bin',
  };
  let fileExt = mimeToExt[contentType] || 'bin';
  if (meta?.file_name_hint) {
    const hint = meta.file_name_hint.split('.').pop()?.toLowerCase();
    if (hint && hint.length <= 5) fileExt = hint;
  }

  // 2. 向后端申请预签名 PUT URL
  const presignRes = await requestUtil.post('/playground/assets/presign', {
    project_id: Number(projectId),
    asset_type: assetType,
    file_ext: fileExt,
    file_size: file.size,
  }, reqOpts) as any;

  const { upload_url, object_key, file_url, file_name } = presignRes;
  if (!upload_url || !object_key) throw new Error('presign 返回数据异常');

  // 3. 浏览器直接 PUT 文件到 TOS（注意：使用原生 fetch 而非 axios，避免 Authorization 拦截器干扰）
  const putResp = await fetch(upload_url, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': contentType },
  });
  if (!putResp.ok) {
    const errText = await putResp.text().catch(() => '');
    throw new Error(`TOS 直传失败 (${putResp.status}): ${errText}`);
  }

  // 4. 通知后端登记数据库
  const confirmRes = await requestUtil.post('/playground/assets/confirm', {
    project_id: Number(projectId),
    object_key,
    file_url,
    file_name,
    file_size: file.size,
    asset_type: assetType,
    file_hash: meta?.fileHash || '',
    prompt: meta?.prompt || '',
    model_id: meta?.model_id || '',
    model_name: meta?.model_name || '',
    generation_params: meta?.generation_params || {},
    canvas_node_data: meta?.canvas_node_data || {},
  }, reqOpts) as any;

  return {
    id: confirmRes.id,
    file_url: confirmRes.file_url || file_url,
    file_name: confirmRes.file_name || file_name,
    file_size: confirmRes.file_size ?? file.size,
    deduplicated: confirmRes.deduplicated,
  };
}

/** 提取请求错误文案 */
function extractRequestErrorMessage(err: any): string {
  return err?.response?.data?.error?.message
    || err?.response?.data?.message
    || err?.message
    || '';
}

/** 持久化业务错误（配额/上限等）不可靠重试，避免死循环刷 toast */
function isPersistPermanentError(err: any): boolean {
  const status = err?.response?.status;
  if (status === 400 || status === 403 || status === 413 || status === 422) return true;
  return /上限|配额|无权|未配置/.test(extractRequestErrorMessage(err));
}

/** 判断错误是否由于请求主动取消或中止导致 */
const isRequestAborted = (err: any): boolean => {
  return (
    axios.isCancel(err) ||
    err?.code === 'ERR_CANCELED' ||
    err?.code === 'ECONNABORTED' ||
    err?.message === 'Request aborted' ||
    err?.message === 'canceled' ||
    err?.name === 'CanceledError'
  );
};

/** 判断错误是否为客户端网络层异常（非服务端业务错误） */
const isNetworkError = (err: any): boolean => {
  if (!err) return false;
  const msg = (err.message || '').toLowerCase();
  return (
    err.code === 'ERR_NETWORK' ||
    msg.includes('network error') ||
    msg.includes('timeout') ||
    msg.includes('econnreset') ||
    msg.includes('econnrefused') ||
    msg.includes('enotfound')
  );
};

/** 创作附件上传到 references/（占容量、不占素材上限） */
async function prepareAndUploadAssets(attachedAssets: any[], currentProjectId: number | null): Promise<any[]> {
  // blob URL → File 对象
  const prepared = await Promise.all(attachedAssets.map(async (item) => {
    if (!item.file && item.fullUrl?.startsWith('blob:')) {
      try {
        const blob = await fetch(item.fullUrl).then(r => r.blob());
        const ext = item.asset?.asset_type === 'video' ? 'mp4' : item.asset?.asset_type === 'audio' ? 'mp3' : 'png';
        return { ...item, file: new File([blob], item.asset?.file_name || `blob_${Date.now()}.${ext}`, { type: blob.type }) };
      } catch (e) { console.error('blob→File 转换失败', e); }
    }
    return item;
  }));

  return Promise.all(prepared.map(async (item) => {
    if (!item.file || !currentProjectId) return item;
    try {
      const formData = new FormData();
      formData.append('file', item.file);
      formData.append('project_id', currentProjectId.toString());
      const res = await requestUtil.post('/playground/assets/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        skipErrorHandler: true,
      } as any) as any;
      if (res.url) return { ...item, fullUrl: res.url, file: undefined, isUploaded: true };
    } catch (e) { console.error('附件上传失败', e); }
    return item;
  }));
}

/**
 * 更新画布中指定节点为持久化完成状态（persistAsset 各分支共用）
 * @param prev       当前节点列表
 * @param nodeId     目标节点原临时 ID
 * @param patch      要合并到目标节点的字段
 * @param parentId   父节点 ID（用于同步更新 volc_enhance 状态）
 * @param resultData 生成结果（透传给父节点）
 * @param stableId   节点 ID 变更后的稳定 ID（如 asset-{n}），用于修正子节点的 parentId 和 inputConnections 引用
 */
function applyAssetNodeUpdate(
  prev: CanvasNode[],
  nodeId: string,
  patch: Partial<CanvasNode>,
  parentId?: string,
  resultData?: any,
  stableId?: string
): CanvasNode[] {
  return prev.map(n => {
    if (n.id === nodeId) return { ...n, ...patch };
    // 节点 ID 发生变更时，同步修正引用了旧 ID 的子节点
    if (stableId && (n.parentId === nodeId || (n.inputConnections && Object.values(n.inputConnections).includes(nodeId)))) {
      const updatedConns = n.inputConnections ? { ...n.inputConnections } : undefined;
      if (updatedConns) {
        Object.entries(updatedConns).forEach(([key, val]) => { if (val === nodeId) updatedConns[key] = stableId; });
      }
      return { ...n, parentId: n.parentId === nodeId ? stableId : n.parentId, inputConnections: updatedConns };
    }
    if (parentId && n.id === parentId && n.taskData?.node_type === 'volc_enhance') {
      return { ...n, taskData: { ...(n.taskData || {}), enhance_status: 'completed', poll_response: resultData } };
    }
    return n;
  });
}

/**
 * 模块级 Set：追踪当前会话中正在等待 API 响应的节点 ID
 * 页面刷新后自动清空，使恢复 useEffect 可以正常检测到孤儿节点
 */
const pendingSubmitNodeIds = new Set<string>();

/** 
 * 全局常驻任务轮询 Hook
 * 管理异步轮询任务、自动恢复以及资产持久化
 */
export const useGlobalTaskPolling = () => {
  const { nodes, setNodes } = useCanvas();
  const {
    currentModel,
    taskPollingNodes, setTaskPollingNodes, currentProjectId,
    models, saveCanvasState
  } = usePlayground();

  // 保持最新引用（避免闭包过期问题）
  const projectIdRef = useRef(currentProjectId);
  projectIdRef.current = currentProjectId;
  const saveCanvasRef = useRef(saveCanvasState);
  saveCanvasRef.current = saveCanvasState;
  const currentModelRef = useRef(currentModel);
  currentModelRef.current = currentModel;

  // 轮询定时器管理：组件卸载时自动清除所有轮询
  const pollTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const unmountedRef = useRef(false);
  // 追踪当前正在执行持久化（persistAsset）的节点 ID，防止重复触发
  const persistRecoveringRef = useRef<Set<string>>(new Set());
  // 追踪当前页面挂载期间实际正在执行轮询的节点 ID（规避 StrictMode double-mounting 造成的状态残留）
  const activePollingRef = useRef<Set<string>>(new Set());
  // 追踪当前会话中轮询耗尽的节点 ID，防止自动恢复 useEffect 立即重触发轮询
  const pollExhaustedRef = useRef<Set<string>>(new Set());
  const isUnloadingRef = useRef(false);

  useEffect(() => {
    unmountedRef.current = false;
    const handleBeforeUnload = () => {
      isUnloadingRef.current = true;
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      unmountedRef.current = true;
      window.removeEventListener('beforeunload', handleBeforeUnload);
      pollTimersRef.current.forEach(t => clearTimeout(t));
      pollTimersRef.current.clear();
      activePollingRef.current.clear();
    };
  }, []);

  /** 自动持久化生成结果到 TOS */
  const persistAsset = useCallback(async (node: CanvasNode, resultData: any, modelInfo: any) => {
    const pid = projectIdRef.current;
    if (!pid) return;
    // 防止重复持久化：节点 ID 已是 asset-{id} 格式说明已入库
    if (node.id.startsWith('asset-') || node.id.startsWith('local-asset-')) return;
    // 业务失败已标记：不再重试（防止上限类 400 死循环刷 toast）
    if (node.taskData?.persist_failed) return;
    // 防止并发重复执行持久化
    if (persistRecoveringRef.current.has(node.id)) return;
    persistRecoveringRef.current.add(node.id);

    /** 瞬时错误延迟释放锁，避免与自动恢复 effect 形成紧循环 */
    let releaseLock = true;
    /** 入库成功：合并最新 taskData 后切到稳定 asset-{id} */
    const commitPersisted = (res: { id: number; file_size: number; file_url: string }) => {
      const stableId = `asset-${res.id}`;
      let nextNodes: CanvasNode[] = [];
      setNodes(prev => {
        const cur = prev.find(n => n.id === node.id);
        nextNodes = applyAssetNodeUpdate(
          prev, node.id,
          { id: stableId, status: 'completed', taskData: { ...cur?.taskData, file_size: res.file_size, tos_url: res.file_url } },
          node.parentId, resultData, stableId,
        );
        return nextNodes;
      });
      saveCanvasRef.current?.(nextNodes);
    };

    try {
      let sourceUrl = '';
      let base64Data = '';
      const assetType = node.type;

      if (assetType === 'image') {
        let rawUrl = extractImageUrl(resultData);
        if (rawUrl.startsWith('data:')) {
          const commaIdx = rawUrl.indexOf(',');
          if (commaIdx > 0) rawUrl = rawUrl.substring(commaIdx + 1);
        }
        const isUrl = rawUrl && (rawUrl.startsWith('http://') || rawUrl.startsWith('https://') || (rawUrl.startsWith('/') && rawUrl.length < 512));
        if (isUrl) sourceUrl = rawUrl;
        else if (rawUrl && rawUrl.length > 100) base64Data = rawUrl;
        else if (rawUrl) sourceUrl = rawUrl;
      } else if (assetType === 'video') {
        sourceUrl = extractVideoUrl(resultData);
      }

      if (!sourceUrl && !base64Data) {
        setNodes(prev => prev.map(n => n.id !== node.id ? n : {
          ...n,
          status: 'error' as const,
          resultData,
          taskData: { ...(n.taskData || {}), error_message: '模型未返回有效的媒体资源，生成中断。' },
        }));
        setTimeout(() => saveCanvasRef.current?.(), 300);
        return;
      }

      const { token_key, ...generationParams } = node.taskData || {};
      const persistMeta = {
        prompt: node.taskData?.prompt || '',
        model_id: modelInfo?.model_id || '',
        model_name: modelInfo?.name || '',
        generation_params: generationParams,
        canvas_node_data: { x: node.x, y: node.y, width: node.width, height: node.height },
      };

      // base64：优先直传 TOS，失败回退服务端 persist
      if (base64Data) {
        try {
          const byteChars = atob(base64Data);
          const byteNums = new Uint8Array(byteChars.length);
          for (let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i);
          const res = await directUploadToTos(
            pid, new Blob([byteNums], { type: 'image/png' }), assetType, 'image/png', persistMeta, true,
          );
          if (res?.file_url) commitPersisted(res);
          return res;
        } catch (directErr) {
          if (isPersistPermanentError(directErr)) throw directErr;
          console.warn('[TOS直传] base64 直传失败，回退到服务端接口', directErr);
        }
      }

      const res = await requestUtil.post('/playground/assets/persist', {
        project_id: pid,
        asset_type: assetType,
        source_url: sourceUrl || undefined,
        base64_data: base64Data || undefined,
        ...persistMeta,
      }, { skipErrorHandler: true } as any) as any;

      if (res?.file_url) {
        commitPersisted(res);
      } else {
        let nextNodes: CanvasNode[] = [];
        setNodes(prev => {
          nextNodes = applyAssetNodeUpdate(prev, node.id, { status: 'completed', resultData }, node.parentId, resultData);
          return nextNodes;
        });
        saveCanvasRef.current?.(nextNodes);
      }
      return res;
    } catch (e) {
      const errMsg = extractRequestErrorMessage(e);
      const permanent = isPersistPermanentError(e);
      console.warn('资源持久化失败，降级显示上游原始地址', e);

      setNodes(prev => {
        const cur = prev.find(n => n.id === node.id);
        if (cur?.taskData?.persist_failed) return prev;
        const next = applyAssetNodeUpdate(prev, node.id, {
          status: 'completed' as const,
          resultData,
          taskData: {
            ...(cur?.taskData || {}),
            ...(permanent ? { persist_failed: true, persist_error: errMsg } : {}),
          },
        }, node.parentId, resultData);
        saveCanvasRef.current?.(next);
        return next;
      });

      if (permanent) {
        if (errMsg) toast.warning(errMsg, undefined, 5000);
      } else {
        releaseLock = false;
        const t = setTimeout(() => {
          pollTimersRef.current.delete(t);
          persistRecoveringRef.current.delete(node.id);
          if (!unmountedRef.current) persistAsset(node, resultData, modelInfo);
        }, 8000);
        pollTimersRef.current.add(t);
      }
      return null;
    } finally {
      if (releaseLock) persistRecoveringRef.current.delete(node.id);
    }
  }, [setNodes]);

  /** 轮询异步任务状态（视频/图片） */
  const pollTaskStatus = useCallback((nodeId: string, taskId: string, modelId: string, nodeType: string, pollEndpointTemplate?: string, tokenKey?: string) => {
    let attempts = 0;
    let consecutiveErrors = 0; // 连续异常计数
    // 根据节点类型区分轮询上限：视频模型生成时间较长，允许最多 60 分钟；图片/其他 15 分钟
    const maxAttempts = nodeType === 'video' ? 720 : 180; // 视频: 720×5s=60min, 图片: 180×5s=15min

    const buildPollUrl = () => {
      if (pollEndpointTemplate && !pollEndpointTemplate.includes('{task_id}')) return pollEndpointTemplate;
      if (pollEndpointTemplate) return pollEndpointTemplate.replace('{task_id}', taskId);
      return `/v1/video/generations/${taskId}?model=${modelId}`;
    };

    const schedulePoll = (fn: () => void, ms: number) => {
      const t = setTimeout(() => { pollTimersRef.current.delete(t); fn(); }, ms);
      pollTimersRef.current.add(t);
    };

    const poll = async () => {
      // 组件已卸载，停止轮询
      if (unmountedRef.current) return;

      if (attempts >= maxAttempts) {
        // 软超时：保持 loading 状态 + 添加 poll_timeout 标记，让后端定时任务能自动恢复
        // 不设为 error，避免后端任务实际成功但前端已标记失败且无法恢复的问题
        let timeoutNodes: CanvasNode[] = [];
        setNodes(prev => {
          const updated = prev.map(n => n.id === nodeId ? {
            ...n,
            // 保持 loading 状态，后端 cleanup_stale_playground_nodes 会扫描 loading 节点并自动恢复
            taskData: { ...(n.taskData || {}), poll_timeout: true }
          } : n);
          timeoutNodes = updated;
          return updated;
        });
        setTaskPollingNodes(prev => prev.filter(id => id !== nodeId));
        activePollingRef.current.delete(nodeId);
        // 保存画布状态，确保 poll_timeout 标记持久化
        saveCanvasRef.current?.(timeoutNodes);
        return;
      }
      attempts++;

      try {
        const headers: Record<string, string> = {
          'X-Playground': '1',
        };
        if (tokenKey) {
          headers['Authorization'] = `Bearer ${tokenKey}`;
        }

        const res: any = await requestUtil.get(buildPollUrl(), {
          headers,
          timeout: 15000,
          baseURL: '',
          skipErrorHandler: true,
        } as any);
        consecutiveErrors = 0; // 成功响应，重置连续异常计数

        // OpenAI 轮询状态检测
        const taskStatus = String(res?.status || '').toLowerCase();
        const isCompleted = ['succeeded', 'completed', 'success'].includes(taskStatus);

        if (isCompleted) {
          let completedNodesToPersist: CanvasNode[] = [];
          setNodes(prev => {
            let updated = [...prev];
            const mainNodeIndex = updated.findIndex(n => n.id === nodeId);
            if (mainNodeIndex >= 0) {
              const origNode = updated[mainNodeIndex];
              updated[mainNodeIndex] = {
                ...origNode,
                status: 'completed' as const, // 直接设为 completed 立刻显示！
                resultData: res,   // 暂存上游返回结果以供持久化使用
                taskData: {
                  ...(origNode.taskData || {}),
                  completed_at: Date.now(),
                  is_sync_completed: true
                }
              };

              // 多图裂变占位（以 loading 呈现）
              if (res.data && Array.isArray(res.data) && res.data.length > 1) {
                const extraNodes = res.data.slice(1).map((imgObj: any, idx: number) => {
                  return {
                    ...updated[mainNodeIndex],
                    id: `${nodeId}-ext-${idx}`,
                    status: 'loading' as const, // 裂变占位节点同样为 loading 状态
                    x: updated[mainNodeIndex].x + (updated[mainNodeIndex].width + 5) * (idx + 1),
                    y: updated[mainNodeIndex].y,
                    zIndex: updated[mainNodeIndex].zIndex + idx + 1,
                    resultData: { ...res, data: [imgObj] }, // 暂存单图原始数据
                    taskData: {
                      ...updated[mainNodeIndex].taskData,
                      created_at: new Date().toISOString(),
                      is_sync_completed: true
                    }
                  };
                });
                updated.push(...extraNodes);
              }
            }
            completedNodesToPersist = updated.filter(n => n.id === nodeId || n.id.startsWith(`${nodeId}-ext-`));
            return updated;
          });

          for (const node of completedNodesToPersist) {
            // 模型信息优先从 ref 获取当前模型，兜底从 taskData 恢复
            const cm = currentModelRef.current;
            const modelForPersist = cm?.model_id
              ? cm
              : { model_id: node.taskData?.model_id || '', name: node.taskData?.model_name || '' };
            persistAsset(node, node.resultData, modelForPersist);
          }

          setTaskPollingNodes(prev => prev.filter(id => id !== nodeId));
          activePollingRef.current.delete(nodeId);
          return;
        } else if (['failed', 'fail', 'error'].includes(taskStatus)) {
          setNodes(prev => {
            const origNode = prev.find(item => item.id === nodeId);
            const errNodes: CanvasNode[] = prev.map(n => {
              if (n.id === nodeId) {
                return { ...n, status: 'error' as const, resultData: { message: res?.error?.message || res?.message || res?.error_message || '生成失败', ...res } };
              }
              if (origNode && origNode.parentId && n.id === origNode.parentId && n.taskData?.node_type === 'volc_enhance') {
                return {
                  ...n,
                  taskData: {
                    ...(n.taskData || {}),
                    enhance_status: 'failed'
                  }
                };
              }
              return n;
            });
            saveCanvasRef.current?.(errNodes);
            return errNodes;
          });
          setTaskPollingNodes(prev => prev.filter(id => id !== nodeId));
          activePollingRef.current.delete(nodeId);
          return;
        }
        schedulePoll(poll, 5000);
      } catch (e: any) {
        // 请求被取消或页面卸载 → 忽略，不计入错误
        if (isUnloadingRef.current || isRequestAborted(e)) return;

        consecutiveErrors++;
        const respData = e?.response?.data;
        const errMsg = respData?.error?.message || respData?.message || respData?.error_message || e?.message || '轮询请求异常';

        // 服务端明确返回失败状态 → 直接终止
        const respStatus = String(respData?.status || '').toLowerCase();
        if (['failed', 'fail', 'error'].includes(respStatus)) {
          setNodes(prev => {
            const origNode = prev.find(item => item.id === nodeId);
            const errNodes: CanvasNode[] = prev.map(n => {
              if (n.id === nodeId) {
                return { ...n, status: 'error' as const, resultData: { message: errMsg } };
              }
              if (origNode && origNode.parentId && n.id === origNode.parentId && n.taskData?.node_type === 'volc_enhance') {
                return {
                  ...n,
                  taskData: {
                    ...(n.taskData || {}),
                    enhance_status: 'failed'
                  }
                };
              }
              return n;
            });
            saveCanvasRef.current?.(errNodes);
            return errNodes;
          });
          setTaskPollingNodes(prev => prev.filter(id => id !== nodeId));
          activePollingRef.current.delete(nodeId);
          return;
        }

        // 区分网络层异常与非网络异常，差异化容错
        const isNetErr = isNetworkError(e);
        // 网络异常：视频任务生成周期长(常超8分钟)，给予更高容错；非网络异常保持 3 次
        const maxErrors = isNetErr ? (nodeType === 'video' ? 10 : 6) : 3;

        if (consecutiveErrors >= maxErrors) {
          if (isNetErr) {
            // 网络异常达到上限 → 软失败：保持 loading + poll_exhausted 标记
            // 刷新页面后自动恢复 useEffect 会重新启动轮询
            pollExhaustedRef.current.add(nodeId);
            let exhaustedNodes: CanvasNode[] = [];
            setNodes(prev => {
              const updated = prev.map(n => n.id === nodeId ? {
                ...n,
                taskData: { ...(n.taskData || {}), poll_exhausted: true }
              } : n);
              exhaustedNodes = updated;
              return updated;
            });
            saveCanvasRef.current?.(exhaustedNodes);
          } else {
            // 非网络类异常达到上限 → 标记为错误
            setNodes(prev => {
              const origNode = prev.find(item => item.id === nodeId);
              const errNodes: CanvasNode[] = prev.map(n => {
                if (n.id === nodeId) {
                  return { ...n, status: 'error' as const, resultData: { message: `连续${consecutiveErrors}次轮询异常: ${errMsg}` } };
                }
                if (origNode && origNode.parentId && n.id === origNode.parentId && n.taskData?.node_type === 'volc_enhance') {
                  return {
                    ...n,
                    taskData: {
                      ...(n.taskData || {}),
                      enhance_status: 'failed'
                    }
                  };
                }
                return n;
              });
              saveCanvasRef.current?.(errNodes);
              return errNodes;
            });
          }
          setTaskPollingNodes(prev => prev.filter(id => id !== nodeId));
          activePollingRef.current.delete(nodeId);
          return;
        }

        // 网络异常采用指数退避（5s→10s→15s...上限30s），减少无效请求
        const retryDelay = isNetErr ? Math.min(5000 + consecutiveErrors * 5000, 30000) : 5000;
        schedulePoll(poll, retryDelay);
      }
    };

    // 对新建的或刚刚捕获的节点，立即执行第一次轮询检查，之后再以 5s 周期进行
    schedulePoll(poll, 100);
  }, [setNodes, setTaskPollingNodes, persistAsset]);

  // 自动恢复对处在 loading 状态但尚未轮询的节点进行轮询
  useEffect(() => {
    nodes.forEach(n => {
      if (n.status === 'loading' && n.taskData?.task_id && !n.taskData?.is_sync_completed && !activePollingRef.current.has(n.id) && !pollExhaustedRef.current.has(n.id)) {
        const m = models.find(mod => mod.model_id === n.taskData?.model_id);
        // 优先使用 models 列表中的 model_id，找不到时 fallback 使用节点自带的
        const modelId = m?.model_id || n.taskData?.model_id;
        if (modelId) {
          activePollingRef.current.add(n.id);
          if (!taskPollingNodes.includes(n.id)) {
            setTaskPollingNodes(prev => [...prev, n.id]);
          }
          const storedEndpoint = n.taskData?.poll_endpoint;
          pollTaskStatus(n.id, n.taskData.task_id, modelId, n.type, storedEndpoint || `/v1/tasks/${n.taskData.task_id}`, n.taskData?.token_key);
        }
      }
    });
  }, [nodes, models, taskPollingNodes, setTaskPollingNodes, pollTaskStatus]);

  // 自动恢复有结果但仍未入库的节点的持久化上传（跳过已永久失败 / 本地临时素材）
  useEffect(() => {
    nodes.forEach(n => {
      const needsPersist =
        (n.status === 'loading' || (n.status === 'completed' && !n.id.startsWith('asset-')))
        && !!n.resultData
        && !!n.taskData?.is_sync_completed
        && !n.taskData?.persist_failed
        && !n.id.startsWith('local-asset-')
        && !persistRecoveringRef.current.has(n.id);
      if (!needsPersist) return;
      const cm = currentModelRef.current;
      const modelId = n.taskData?.model_id;
      const modelForPersist = cm?.model_id === modelId ? cm : { model_id: modelId || '', name: n.taskData?.model_name || '' };
      persistAsset(n, n.resultData, modelForPersist);
    });
  }, [nodes, persistAsset]);

  // 恢复无 task_id 的 loading 节点：通过专用恢复接口查询已完成的请求
  const recoveryPollingRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const pendingNodes = nodes.filter(
      n => n.status === 'loading' && !n.taskData?.task_id && !pendingSubmitNodeIds.has(n.id) && !recoveryPollingRef.current.has(n.id)
    );
    if (pendingNodes.length === 0) return;

    pendingNodes.forEach(n => {
      recoveryPollingRef.current.add(n.id);
      const createdAt = n.taskData?.created_at;
      const modelId = n.taskData?.model_id;
      if (!createdAt || !modelId) return;

      const hasReferenceImage = n.type === 'image' && n.taskData?.attached_urls && n.taskData.attached_urls.length > 0;
      const recoverEndpoint = n.taskData?.endpoint || (
        n.type === 'video'
          ? '/v1/video/generations'
          : (hasReferenceImage ? '/v1/images/edits' : '/v1/images/generations')
      );

      let attempts = 0;
      const maxAttempts = 180;

      const checkRecovery = async () => {
        if (unmountedRef.current || attempts >= maxAttempts) {
          if (attempts >= maxAttempts) {
            setNodes(prev => prev.map(nd =>
              nd.id === n.id && nd.status === 'loading'
                ? { ...nd, status: 'error', resultData: { message: '生成任务超时，请重新生成' } }
                : nd
            ));
          }
          return;
        }
        attempts++;

        try {
          // 使用顶层静态导入的 requestUtil
          const sysLogId = n.taskData?.sys_log_id;
          if (!sysLogId) return;

          const res: any = await requestUtil.get('/playground/recover-by-log-id', {
            params: {
              log_id: sysLogId,
              endpoint: recoverEndpoint,
            }
          });

          const status = res?.status;

          if (status === 'processing') {
            const t = setTimeout(checkRecovery, 10_000);
            pollTimersRef.current.add(t);
            return;
          }

          if (status === 'async' && res?.task_id) {
            const taskId = res.task_id;
            const pollEndpoint = `/v1/tasks/${taskId}`;
            setNodes(prev => prev.map(nd => {
              if (nd.id === n.id) {
                return {
                  ...nd,
                  taskData: { ...(nd.taskData || {}), task_id: taskId, poll_endpoint: pollEndpoint }
                };
              }
              if (n.parentId && nd.id === n.parentId && nd.taskData?.node_type === 'volc_enhance') {
                return {
                  ...nd,
                  taskData: {
                    ...(nd.taskData || {}),
                    enhance_status: 'processing',
                    task_id: taskId,
                    poll_endpoint: pollEndpoint,
                    submit_response: {
                      success: true,
                      task_id: taskId,
                      status: 'pending'
                    }
                  }
                };
              }
              return nd;
            }));
            activePollingRef.current.add(n.id);
            if (!taskPollingNodes.includes(n.id)) {
              setTaskPollingNodes(prev => [...prev, n.id]);
            }
            pollTaskStatus(n.id, taskId, modelId, n.type, pollEndpoint, n.taskData?.token_key);
            return;
          }

          if (status === 'completed' && res?.result_data) {
            const resultData = res.result_data;
            const alreadyPersisted = nodes.some(nd => nd.id.startsWith('asset-') && nd.taskData?.model_id === modelId
              && nd.taskData?.created_at === createdAt);

            if (alreadyPersisted) {
              setNodes(prev => prev.map(nd => {
                if (nd.id === n.id) {
                  return { ...nd, status: 'completed' as const, resultData, taskData: { ...(nd.taskData || {}), completed_at: Date.now() } };
                }
                if (n.parentId && nd.id === n.parentId && nd.taskData?.node_type === 'volc_enhance') {
                  return {
                    ...nd,
                    taskData: {
                      ...(nd.taskData || {}),
                      enhance_status: 'completed',
                      poll_response: resultData
                    }
                  };
                }
                return nd;
              }));
            } else {
              const tempNode: CanvasNode = {
                ...n,
                status: 'completed' as const, // 直接设为 completed 立刻显示！
                resultData,
                taskData: { ...(n.taskData || {}), completed_at: Date.now(), is_sync_completed: true }
              };
              setNodes(prev => prev.map(nd => {
                if (nd.id === n.id) return tempNode;
                if (n.parentId && nd.id === n.parentId && nd.taskData?.node_type === 'volc_enhance') {
                  return {
                    ...nd,
                    taskData: {
                      ...(nd.taskData || {}),
                      enhance_status: 'completed',
                      poll_response: resultData
                    }
                  };
                }
                return nd;
              }));
              const cm = currentModelRef.current;
              const modelForPersist = cm?.model_id ? cm : { model_id: modelId, name: n.taskData?.model_name || '' };
              persistAsset(tempNode, resultData, modelForPersist);
            }
          } else if (status === 'completed') {
            setNodes(prev => prev.map(nd =>
              nd.id === n.id ? { ...nd, status: 'completed' as const, resultData: { message: res?.message || '已完成' }, taskData: { ...(nd.taskData || {}), completed_at: Date.now() } } : nd
            ));
          } else if (status === 'failed') {
            setNodes(prev => prev.map(nd => {
              if (nd.id === n.id) {
                return { ...nd, status: 'error', resultData: { message: res?.message || '生成失败' } };
              }
              if (n.parentId && nd.id === n.parentId && nd.taskData?.node_type === 'volc_enhance') {
                return {
                  ...nd,
                  taskData: {
                    ...(nd.taskData || {}),
                    enhance_status: 'failed'
                  }
                };
              }
              return nd;
            }));
          }
        } catch (e) {
          console.warn('[Recovery] 恢复查询失败，稍后重试', e);
          const t = setTimeout(checkRecovery, 10_000);
          pollTimersRef.current.add(t);
        }
      };

      const t = setTimeout(checkRecovery, 8_000);
      pollTimersRef.current.add(t);
    });
  }, [nodes, setNodes, persistAsset, setTaskPollingNodes, pollTaskStatus]);
};

/**
 * 主动生成与对话 Hook
 */
export const useGeneration = () => {
  const { canvasTransform, setCanvasTransform, nodes, setNodes, maxZIndex, setMaxZIndex } = useCanvas();
  const {
    currentModel, agentCurrentModel, prompt, paramValues,
    selectedTokenKey, generating, setGenerating,
    taskPollingNodes, setTaskPollingNodes, currentProjectId,
    attachedAssets, setAttachedAssets, models, apiTokens,
    storageStats, saveCanvasState,
    chatMessages, setChatMessages, streamingContent, setStreamingContent,
    setIsTokenModalVisible,
    pageMode, advancedNodesConfig,
  } = usePlayground();

  // 保持最新引用
  const projectIdRef = useRef(currentProjectId);
  projectIdRef.current = currentProjectId;
  const saveCanvasRef = useRef(saveCanvasState);
  saveCanvasRef.current = saveCanvasState;
  
  // 追踪请求状态
  const activeRequestRef = useRef<Set<string>>(new Set());
  const createdInCurrentSessionRef = useRef<Set<string>>(new Set());
  const isGeneratingRef = useRef(false);
  const isUnloadingRef = useRef(false);

  useEffect(() => {
    isUnloadingRef.current = false;
    const handleBeforeUnload = () => {
      isUnloadingRef.current = true;
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  /** 生成前统一前置校验 */
  const validateBeforeGenerate = useCallback((): boolean => {
    if (!selectedTokenKey) {
      setIsTokenModalVisible(true);
      return false;
    }
    const currentToken = apiTokens.find((t: any) => t.token_key === selectedTokenKey);
    if (currentToken && currentToken.quota_limit >= 0 && currentToken.quota_used >= currentToken.quota_limit) {
      toast.warning('当前密钥额度已用尽，请更换密钥或前往密钥管理页面充值额度', undefined, 4000);
      return false;
    }
    const maxAssets = storageStats?.max_assets || 10;
    const materialCount = nodes.filter(isMaterialQuotaNode).length;
    if (materialCount >= maxAssets) {
      toast.warning(`当前项目创作素材内容已达到 ${maxAssets} 个上限，请先清理部分素材再创作。`, undefined, 4000);
      return false;
    }
    if (storageStats && storageStats.quota_mb > 0 && storageStats.total_size_bytes >= storageStats.quota_mb * 1024 * 1024) {
      toast.warning('您的创作中心存储空间已用完，请先清理部分历史素材或项目后再创作。', undefined, 4000);
      return false;
    }

    const runningTasks = nodes.filter(n => n.status === 'loading').length;
    if (runningTasks >= 5) {
      toast.warning('当前项目同时生成的任务最多不能超过 5 个，请稍后再试。', undefined, 4000);
      return false;
    }

    return true;
  }, [selectedTokenKey, apiTokens, nodes, storageStats, setIsTokenModalVisible]);

  /** 发送生成请求 */
  const handleGenerate = useCallback(async () => {
    if (isGeneratingRef.current || generating) return;
    if (!currentModel || !prompt.trim()) return;
    if (!validateBeforeGenerate()) return;

    isGeneratingRef.current = true;
    setGenerating(true);
    setTimeout(() => {
      isGeneratingRef.current = false;
      setGenerating(false);
    }, 1500);

    const newNodeId = Date.now().toString() + Math.random().toString(36).substring(2, 6);
    const sysLogId = 'tsk_' + crypto.randomUUID().replace(/-/g, '').toLowerCase().substring(0, 26);
    const centerX = -canvasTransform.x / canvasTransform.scale + window.innerWidth / 2 - 250;
    const centerY = -canvasTransform.y / canvasTransform.scale + window.innerHeight / 2 - 200;

    let targetX = centerX;
    let targetY = centerY;
    if (nodes.length > 0) {
      const lastNode = nodes[nodes.length - 1];
      targetX = lastNode.x + (lastNode.width || 480) + 5;
      targetY = lastNode.y;
    }

    const newZIndex = maxZIndex + 1;
    setMaxZIndex(newZIndex);

    const initialNode: CanvasNode = {
      id: newNodeId,
      type: currentModel.type_name.includes('视频') || currentModel.scheme_type === 'video' ? 'video'
        : currentModel.type_name.includes('图片') || currentModel.scheme_type === 'image' ? 'image'
          : 'text',
      status: 'loading',
      taskData: {
        sys_log_id: sysLogId,
        prompt: prompt.trim(),
        model_name: currentModel.name,
        model_id: currentModel.model_id,
        attached_urls: attachedAssets.map(a => a.fullUrl || (a.file ? URL.createObjectURL(a.file) : '')).filter(Boolean),
        created_at: new Date().toISOString(),
        token_key: selectedTokenKey, // 持久化初始 API 密钥，以便中途刷新能够使用正确的 Token 恢复并轮询
        ...(pageMode === 'agent' ? {
          agent_mode: true,
          agent_video_mode: advancedNodesConfig?.agent_video_mode || 'track',
        } : {})
      },
      resultData: null,
      x: targetX,
      y: targetY,
      width: 480,
      height: 320,
      zIndex: newZIndex
    };

    const updatedNodes: CanvasNode[] = [...nodes, initialNode];
    setNodes(updatedNodes);

    if (pageMode === 'agent') {
      setChatMessages(prev => [
        ...prev,
        { role: 'user', content: prompt.trim(), timestamp: Date.now() },
        { role: 'assistant', content: '', timestamp: Date.now() + 1, nodeId: newNodeId }
      ]);
    }

    activeRequestRef.current.add(newNodeId);
    createdInCurrentSessionRef.current.add(newNodeId);
    pendingSubmitNodeIds.add(newNodeId);

    const nodeCenterX = targetX + initialNode.width / 2;
    const nodeCenterY = targetY + initialNode.height / 2;
    setCanvasTransform(prev => ({
      ...prev,
      x: -nodeCenterX * prev.scale + window.innerWidth / 2,
      y: -nodeCenterY * prev.scale + window.innerHeight / 2,
    }));

    saveCanvasRef.current?.(updatedNodes);

    try {
      const uploadedAssets = await prepareAndUploadAssets(attachedAssets, currentProjectId);

      setAttachedAssets(uploadedAssets);

      const hasFailedUpload = uploadedAssets.some(a => {
        const isImage = a.asset?.asset_type === 'image' || !a.asset?.asset_type;
        const isImageWithFile = isImage && a.file;
        if (isImageWithFile) return false;
        return a.fullUrl?.startsWith('blob:');
      });
      if (hasFailedUpload) {
        throw new Error('素材文件上传失败，请检查网络并重试。');
      }

      const finalAttachedUrls = uploadedAssets.map(a => a.fullUrl);
      const nodesWithUpload: CanvasNode[] = updatedNodes.map(n => n.id === newNodeId ? {
        ...n,
        taskData: {
          ...n.taskData,
          attached_url: finalAttachedUrls[0] || '',
          attached_urls: finalAttachedUrls,
        }
      } : n);
      setNodes(nodesWithUpload);
      if (uploadedAssets.some(a => a.file)) {
        saveCanvasRef.current?.(nodesWithUpload);
      }

      const resolvedAssetsForAI = await Promise.all(uploadedAssets.map(async (item) => {
        if ((item as any).isUploaded && item.fullUrl) {
          return { url: item.fullUrl, type: item.asset.asset_type, options: item.options };
        }
        if (item.file) {
          const b64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = () => resolve('');
            reader.readAsDataURL(item.file!);
          });
          return { url: b64, type: item.asset.asset_type, options: item.options };
        }
        return { url: item.fullUrl, type: item.asset.asset_type, options: item.options };
      }));

      const schemeType = currentModel.scheme_type || '';
      const body: any = {
        model: currentModel.model_id,
        prompt: prompt.trim(),
        ...paramValues,
        ...(pageMode === 'agent' ? {
          agent_mode: true,
          agent_video_mode: advancedNodesConfig?.agent_video_mode || 'track',
        } : {})
      };

      let endpoint = '';
      if (schemeType === 'video' || currentModel.type_name.includes('视频')) {
        endpoint = '/v1/video/generations';
        const imageAssets = resolvedAssetsForAI.filter(a => a.type === 'image');
        const videoAssets = resolvedAssetsForAI.filter(a => a.type === 'video');
        const audioAssets = resolvedAssetsForAI.filter(a => a.type === 'audio');

        {
          const videoUrls = videoAssets.map(a => a.url);
          const audioUrls = audioAssets.map(a => a.url);

          const hasVideoOrAudio = videoUrls.length > 0 || audioUrls.length > 0;
          const userRole = paramValues.image_role;
          const effectiveRole = hasVideoOrAudio && userRole !== 'reference_image' && userRole !== undefined
            ? 'reference_image'
            : userRole;
          delete body.image_role;

          const imageUrls: any[] = [];
          if (effectiveRole === 'first_last_frame') {
            if (imageAssets.length === 1) {
              imageUrls.push({ url: imageAssets[0].url, role: 'first_frame' });
              imageUrls.push({ url: imageAssets[0].url, role: 'last_frame' });
            } else if (imageAssets.length >= 2) {
              imageAssets.forEach((a, idx) => {
                if (idx === 0) {
                  imageUrls.push({ url: a.url, role: 'first_frame' });
                } else if (idx === imageAssets.length - 1) {
                  imageUrls.push({ url: a.url, role: 'last_frame' });
                } else {
                  imageUrls.push({ url: a.url, role: 'reference_image' });
                }
              });
            }
          } else {
            imageAssets.forEach(a => {
              if (effectiveRole) {
                imageUrls.push({ url: a.url, role: effectiveRole });
              } else {
                imageUrls.push(a.url);
              }
            });
          }

          if (imageUrls.length === 0 && paramValues.image_url) {
            imageUrls.push(paramValues.image_url);
          }

          if (imageUrls.length > 0) body.images = imageUrls;
          if (videoUrls.length > 0) body.videos = videoUrls;
          if (audioUrls.length > 0) body.audios = audioUrls;
        }
        delete body.image_url;
      } else if (schemeType === 'image' || currentModel.type_name.includes('图片')) {
        const allImageUrls = resolvedAssetsForAI.filter(a => a.type === 'image').map(a => a.url);
        const finalImageUrls = allImageUrls.length > 0 ? allImageUrls : (paramValues.image_url ? [paramValues.image_url] : []);

        if (finalImageUrls.length > 0) {
          endpoint = '/v1/images/edits';
          body.image_urls = finalImageUrls;
        } else {
          endpoint = '/v1/images/generations';
        }
        delete body.image_url;
      } else {
        endpoint = '/v1/chat/completions';
        const contentArr: any[] = [{ type: 'text', text: prompt.trim() }];
        resolvedAssetsForAI.filter(a => a.type === 'image').forEach(img => {
          contentArr.push({ type: 'image_url', image_url: { url: img.url } });
        });
        body.messages = [{ role: 'user', content: contentArr }];
        delete body.prompt;
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Playground': '1',
        'X-Log-Id': sysLogId,
      };
      if (selectedTokenKey) {
        headers['Authorization'] = `Bearer ${selectedTokenKey}`;
      }

      const res: any = await requestUtil.post(endpoint, body, {
        headers,
        baseURL: '',
        skipErrorHandler: true,
      } as any);

      const isVideoEndpoint = endpoint.includes('video') || endpoint.includes('contents/generations');
      const asyncTaskId = res?.id || res?.task_id;
      const isAsyncTask = asyncTaskId && (
        isVideoEndpoint
        || res?.status === 'pending'
        || res?.status === 'in_progress'
      );

      if (isAsyncTask) {
        const taskId = asyncTaskId;
        const pollEndpoint = `/v1/tasks/${taskId}`;
        const finalNodes: CanvasNode[] = nodesWithUpload.map(n => n.id === newNodeId ? {
          ...n,
          taskData: {
            ...(n.taskData || {}),
            task_id: taskId,
            poll_endpoint: pollEndpoint,
            token_key: selectedTokenKey,
            attached_url: finalAttachedUrls[0] || '',
            attached_urls: finalAttachedUrls,
            endpoint,
            ...res
          }
        } : n);
        setNodes(finalNodes);
        if (!taskPollingNodes.includes(newNodeId)) {
          setTaskPollingNodes(prev => [...prev, newNodeId]);
        }
        saveCanvasRef.current?.(finalNodes);
      } else {
        // 同步结果：标记 is_sync_completed，由自动恢复 effect 触发 persist
        setNodes(prev => {
          let updated = [...prev];
          const mainNodeIndex = updated.findIndex(n => n.id === newNodeId);
          if (mainNodeIndex < 0) return updated;
          const origNode = updated[mainNodeIndex];
          updated[mainNodeIndex] = {
            ...origNode,
            status: 'completed' as const,
            resultData: res,
            taskData: {
              ...(origNode.taskData || {}),
              completed_at: Date.now(),
              task_id: res?.id || res?.task_id || origNode.taskData?.task_id,
              is_sync_completed: true,
              attached_url: finalAttachedUrls[0] || '',
              attached_urls: finalAttachedUrls,
              endpoint,
            }
          };
          if (res.data && Array.isArray(res.data) && res.data.length > 1) {
            updated.push(...res.data.slice(1).map((imgObj: any, idx: number) => ({
              ...updated[mainNodeIndex],
              id: `${newNodeId}-ext-${idx}`,
              status: 'completed' as const,
              x: updated[mainNodeIndex].x + (updated[mainNodeIndex].width + 5) * (idx + 1),
              y: updated[mainNodeIndex].y,
              zIndex: updated[mainNodeIndex].zIndex + idx + 1,
              resultData: { ...res, data: [imgObj] },
              taskData: {
                ...updated[mainNodeIndex].taskData,
                created_at: new Date().toISOString(),
                is_sync_completed: true
              }
            })));
          }
          return updated;
        });
      }
    } catch (e: any) {
      if (isUnloadingRef.current || isRequestAborted(e)) {
        console.warn('生成请求被中止或取消，保留 loading 状态以供恢复', e);
        return;
      }

      const errMsg = e?.response?.data?.error?.message || e?.response?.data?.message || e?.message || '生成失败';
      toast.error(errMsg);
      setNodes(prev => {
        const errNodes: CanvasNode[] = prev.map(n => n.id === newNodeId ? { ...n, status: 'error' as const, resultData: { message: errMsg } } : n);
        saveCanvasRef.current?.(errNodes);
        return errNodes;
      });
    } finally {
      activeRequestRef.current.delete(newNodeId);
      pendingSubmitNodeIds.delete(newNodeId);
    }
  }, [currentModel, prompt, paramValues, canvasTransform, maxZIndex, setNodes, setMaxZIndex, setGenerating, generating, setTaskPollingNodes, attachedAssets, nodes.length, validateBeforeGenerate]);

  /** 聊天模型流式生成 */
  const handleChatGenerate = useCallback(async (): Promise<boolean> => {
    const effectiveModel = pageMode === 'agent' ? agentCurrentModel : currentModel;
    if (!effectiveModel || !prompt.trim()) return false;
    if (isGeneratingRef.current || generating) return false;
    if (!validateBeforeGenerate()) return false;

    isGeneratingRef.current = true;
    setGenerating(true);
    const userMsg = { role: 'user' as const, content: prompt.trim(), timestamp: Date.now() };
    setChatMessages(prev => [...prev, userMsg]);
    setStreamingContent('');

    try {
      const uploadedAssets = await prepareAndUploadAssets(attachedAssets, currentProjectId);

      setAttachedAssets(uploadedAssets);

      const hasFailedUpload = uploadedAssets.some(a => a.fullUrl?.startsWith('blob:'));
      if (hasFailedUpload) {
        throw new Error('素材文件上传失败，请检查网络并重试。');
      }

      let resolvedAssets = uploadedAssets;

      const userContent: any = resolvedAssets.length > 0
        ? [
          { type: 'text', text: prompt.trim() },
          ...resolvedAssets
            .filter(a => a.fullUrl)
            .map(a => ({ type: 'image_url', image_url: { url: a.fullUrl } })),
        ]
        : prompt.trim();

      const messages = [
        ...chatMessages.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: userContent },
      ];

      const useStream = paramValues.stream !== false;
      const body: any = {
        model: effectiveModel.model_id,
        messages,
        stream: useStream,
      };
      Object.entries(paramValues).forEach(([k, v]) => {
        if (['stream'].includes(k)) return;
        if (v !== undefined && v !== null && v !== '') body[k] = v;
      });

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${selectedTokenKey}`,
        'X-Playground': '1',
      };

      if (useStream) {
        const response = await fetch('/v1/chat/completions', {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(errText || `HTTP ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('ReadableStream 不可用');

        const decoder = new TextDecoder();
        let accumulated = '';
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                accumulated += delta;
                setStreamingContent(accumulated);
              }
            } catch { }
          }
        }

        setStreamingContent('');
        if (accumulated) {
          setChatMessages(prev => [...prev, { role: 'assistant', content: accumulated, timestamp: Date.now() }]);
        }
      } else {
        const res: any = await requestUtil.post('/v1/chat/completions', body, {
          headers,
          baseURL: '',
          skipErrorHandler: true,
        } as any);
        const content = res?.choices?.[0]?.message?.content || JSON.stringify(res);
        setChatMessages(prev => [...prev, { role: 'assistant', content, timestamp: Date.now() }]);
      }

      setAttachedAssets([]);

      return true;
    } catch (err: any) {
      const errMsg = err?.message || '请求失败';
      setChatMessages(prev => [...prev, { role: 'assistant', content: `⚠️ 错误: ${errMsg}`, timestamp: Date.now() }]);
      return false;
    } finally {
      isGeneratingRef.current = false;
      setGenerating(false);
      setStreamingContent('');
    }
  }, [currentModel, prompt, generating, paramValues, chatMessages, attachedAssets, setAttachedAssets, setChatMessages, setStreamingContent, setGenerating, validateBeforeGenerate]);

  return { handleGenerate, handleChatGenerate };
};
