/**
 * 生成与轮询 Hook
 * 封装 API 调用、节点创建、异步轮询逻辑
 */
import { useCallback, useRef, useEffect } from 'react';
import { message } from 'antd';
import axios from 'axios';
import type { CanvasNode } from '../types';
import { useCanvas } from '../context/PlaygroundContext';
import { usePlayground } from '../context/PlaygroundContext';
import { extractImageUrl, extractVideoUrl } from '../utils/resultExtractor';

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


export const useGeneration = () => {
  const { canvasTransform, setCanvasTransform, nodes, setNodes, maxZIndex, setMaxZIndex } = useCanvas();
  const {
    currentModel, prompt, paramValues,
    selectedTokenKey, generating, setGenerating,
    taskPollingNodes, setTaskPollingNodes, currentProjectId,
    attachedAssets, setAttachedAssets, models, apiTokens,
    storageStats, saveCanvasState,
    chatMessages, setChatMessages, setStreamingContent,
    setIsTokenModalVisible,
  } = usePlayground();

  // 保持最新引用（避免闭包过期问题）
  const projectIdRef = useRef(currentProjectId);
  projectIdRef.current = currentProjectId;
  const saveCanvasRef = useRef(saveCanvasState);
  saveCanvasRef.current = saveCanvasState;
  const tokenKeyRef = useRef(selectedTokenKey);
  tokenKeyRef.current = selectedTokenKey;
  const currentModelRef = useRef(currentModel);
  currentModelRef.current = currentModel;

  // 轮询定时器管理：组件卸载时自动清除所有轮询
  const pollTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const unmountedRef = useRef(false);
  // 追踪当前正在进行首次请求的节点 ID（区分「在线生成中」和「中断恢复」）
  const activeRequestRef = useRef<Set<string>>(new Set());
  // 追踪当前正在执行持久化（persistAsset）的节点 ID，防止重复触发
  const persistRecoveringRef = useRef<Set<string>>(new Set());
  // 追踪当前会话中轮询耗尽的节点 ID，防止自动恢复 useEffect 立即重触发轮询
  const pollExhaustedRef = useRef<Set<string>>(new Set());
  // 追踪当前会话（页面正常挂载运行期间）新生成的节点 ID，避免触发 recovery 恢复接口
  const createdInCurrentSessionRef = useRef<Set<string>>(new Set());
  const isGeneratingRef = useRef(false);
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
    };
  }, []);

  /** 自动持久化生成结果到 TOS */
  const persistAsset = useCallback(async (node: CanvasNode, resultData: any, modelInfo: any) => {
    const pid = projectIdRef.current;
    if (!pid) return;
    // 防止重复持久化：节点 ID 已是 asset-{id} 格式说明已入库
    if (node.id.startsWith('asset-')) return;
    // 防止并发重复执行持久化
    if (persistRecoveringRef.current.has(node.id)) return;
    persistRecoveringRef.current.add(node.id);
    try {
      let sourceUrl = '';
      let base64Data = '';
      const assetType = node.type;

      if (assetType === 'image') {
        let rawUrl = extractImageUrl(resultData);
        // 去掉 data:...;base64, 前缀，只留纯 base64（持久化接口需要）
        if (rawUrl.startsWith('data:')) {
          const commaIdx = rawUrl.indexOf(',');
          if (commaIdx > 0) rawUrl = rawUrl.substring(commaIdx + 1);
        }
        const isUrl = rawUrl && (rawUrl.startsWith('http://') || rawUrl.startsWith('https://') || (rawUrl.startsWith('/') && rawUrl.length < 512));
        if (isUrl) {
          sourceUrl = rawUrl;
        } else if (rawUrl && rawUrl.length > 100) {
          base64Data = rawUrl;
        } else if (rawUrl) {
          sourceUrl = rawUrl;
        }
      } else if (assetType === 'video') {
        sourceUrl = extractVideoUrl(resultData);
      }

      if (!sourceUrl && !base64Data) {
        setNodes(prev => prev.map(n => {
          if (n.id !== node.id) return n;
          return {
            ...n,
            status: 'error' as const,
            resultData: resultData,
            taskData: {
              ...(n.taskData || {}),
              error_message: '模型未返回有效的媒体资源，生成中断。'
            }
          };
        }));
        setTimeout(() => saveCanvasRef.current?.(), 300);
        return;
      }

      const { default: requestUtil } = await import('../../../utils/request');
      const res = await requestUtil.post('/playground/assets/persist', {
        project_id: pid,
        asset_type: assetType,
        source_url: sourceUrl || undefined,
        base64_data: base64Data || undefined,
        prompt: node.taskData?.prompt || '',
        model_id: modelInfo?.model_id || '',
        model_name: modelInfo?.name || '',
        generation_params: node.taskData || {},
        canvas_node_data: { x: node.x, y: node.y, width: node.width, height: node.height },
      }) as any;

      // 更新节点为永久的 TOS URL，并将节点 ID 更新为稳定的 asset-{id} 格式
      // 以确保下次加载时能与 assets 表记录正确匹配
      if (res && res.file_url) {
        const stableId = `asset-${res.id}`;
        setNodes(prev => prev.map(n => {
          if (n.id !== node.id) return n;
          const updatedNode = {
            ...n,
            id: stableId,
            status: 'completed' as const, // 设置为已完成
            taskData: {
              ...n.taskData,
              file_size: res.file_size
            }
          };
          if (updatedNode.type === 'image') {
            updatedNode.resultData = { data: [{ url: res.file_url }] };
          } else if (updatedNode.type === 'video') {
            // 保留原始响应中的 last_frame_url（火山方舟视频尾帧）
            const lastFrame = n.resultData?.data?.[0]?.last_frame_url || n.resultData?.content?.last_frame_url;
            updatedNode.resultData = { content: { video_url: res.file_url, ...(lastFrame ? { last_frame_url: lastFrame } : {}) } };
          }
          return updatedNode;
        }));
        // 持久化成功后立即保存画布，确保 asset-{id} 和 TOS URL 写入 canvas_data
        // 防止用户退出时 React 状态未同步导致下次加载数据不一致
        setTimeout(() => saveCanvasRef.current?.(), 300);
      } else {
        // 接口没返回 file_url，降级处理为原始上游数据
        setNodes(prev => prev.map(n => {
          if (n.id !== node.id) return n;
          return {
            ...n,
            status: 'completed' as const,
            resultData: resultData
          };
        }));
        setTimeout(() => saveCanvasRef.current?.(), 300);
      }
      return res;
    } catch (e) {
      console.warn('资源持久化失败，降级显示上游原始地址', e);
      setNodes(prev => prev.map(n => {
        if (n.id !== node.id) return n;
        return {
          ...n,
          status: 'completed' as const,
          resultData: resultData
        };
      }));
      setTimeout(() => saveCanvasRef.current?.(), 300);
      return null;
    } finally {
      // 无论成功或失败都释放锁，确保自动恢复 useEffect 可重试该节点
      persistRecoveringRef.current.delete(node.id);
    }
  }, [setNodes]);

  /** 生成前统一前置校验（密钥、额度、素材上限、存储配额） */
  const validateBeforeGenerate = useCallback((): boolean => {
    if (!selectedTokenKey) {
      setIsTokenModalVisible(true);
      return false;
    }
    const currentToken = apiTokens.find((t: any) => t.token_key === selectedTokenKey);
    if (currentToken && currentToken.quota_limit >= 0 && currentToken.quota_used >= currentToken.quota_limit) {
      message.warning({ content: '当前密钥额度已用尽，请更换密钥或前往密钥管理页面充值额度', duration: 4, key: 'quota-exceeded' });
      return false;
    }
    const maxAssets = storageStats?.max_assets || 10;
    if (nodes.length >= maxAssets) {
      message.warning({ content: `当前项目创作素材内容已达到 ${maxAssets} 个上限，请先清理部分素材再创作。`, duration: 4, key: 'max-assets-exceeded' });
      return false;
    }
    if (storageStats && storageStats.quota_mb > 0 && storageStats.total_size_bytes >= storageStats.quota_mb * 1024 * 1024) {
      message.warning({ content: '您的创作中心存储空间已用完，请先清理部分历史素材或项目后再创作。', duration: 4, key: 'storage-quota-exceeded' });
      return false;
    }

    const runningTasks = nodes.filter(n => n.status === 'loading').length;
    if (runningTasks >= 5) {
      message.warning({ content: '当前项目同时生成的任务最多不能超过 5 个，请稍后再试。', duration: 4, key: 'max-running-exceeded' });
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
    // 1.5s 后自动解除锁定，允许用户继续异步并行生成，防止疯狂连击
    setTimeout(() => {
      isGeneratingRef.current = false;
      if (!unmountedRef.current) {
        setGenerating(false);
      }
    }, 1500);

    const newNodeId = Date.now().toString() + Math.random().toString(36).substring(2, 6);
    const sysLogId = 'tsk_' + crypto.randomUUID().replace(/-/g, '').toLowerCase().substring(0, 26);
    const centerX = -canvasTransform.x / canvasTransform.scale + window.innerWidth / 2 - 250;
    const centerY = -canvasTransform.y / canvasTransform.scale + window.innerHeight / 2 - 200;

    let targetX = centerX;
    let targetY = centerY;
    if (nodes.length > 0) {
      // 找到最右侧的节点或者最后一个节点，紧随其后排列
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
    // 标记该节点为「正在首次请求中」，recovery useEffect 不对其触发恢复
    activeRequestRef.current.add(newNodeId);
    // 标记为当前会话内创建的节点
    createdInCurrentSessionRef.current.add(newNodeId);

    // 自动平移画布，让新节点居中可见
    const nodeCenterX = targetX + initialNode.width / 2;
    const nodeCenterY = targetY + initialNode.height / 2;
    setCanvasTransform(prev => ({
      ...prev,
      x: -nodeCenterX * prev.scale + window.innerWidth / 2,
      y: -nodeCenterY * prev.scale + window.innerHeight / 2,
    }));

    // 立即同步保存画布状态，确保在关闭浏览器时此 loading 节点已被记录
    saveCanvasRef.current?.(updatedNodes);

    try {
      // 1. 预处理：将本地附件上传到永久存储，确保日志记录的是永久 URL 而非临时的 blob
      // 0. 自动将没有 file 句柄的 blob: 附件利用 fetch 转换为 File 实例，以便无缝复用底层的上传接口存入 TOS
      const preparedAssets = await Promise.all(attachedAssets.map(async (item) => {
        if (!item.file && item.fullUrl && item.fullUrl.startsWith('blob:')) {
          try {
            const blob = await fetch(item.fullUrl).then(r => r.blob());
            const ext = item.asset?.asset_type === 'video' ? 'mp4' : item.asset?.asset_type === 'audio' ? 'mp3' : 'png';
            const filename = item.asset?.file_name || `blob_${Date.now()}.${ext}`;
            const file = new File([blob], filename, { type: blob.type });
            return { ...item, file };
          } catch (e) {
            console.error('Failed to convert blob url to File object', e);
            return item;
          }
        }
        return item;
      }));

      const uploadedAssets = await Promise.all(preparedAssets.map(async (item) => {
        if (item.file) {
          const formData = new FormData();
          formData.append('file', item.file);
          if (currentProjectId) formData.append('project_id', currentProjectId.toString());

          try {
            const { default: requestUtil } = await import('../../../utils/request');
            const res = await requestUtil.post('/playground/assets/upload', formData, {
              headers: { 'Content-Type': 'multipart/form-data' }
            }) as any;

            if (res.url) {
              return { ...item, fullUrl: res.url, isUploaded: true };
            }
          } catch (e) {
            console.error('附件上传失败', e);
          }
        }
        return item;
      }));

      // 更新全局状态，这样如果生成失败，下次点 Run 也不用重新上传
      setAttachedAssets(uploadedAssets);

      // 校验是否有任何素材附件上传失败且无法回退处理（依然是 blob:）
      const hasFailedUpload = uploadedAssets.some(a => {
        // 图片且拥有 file 句柄，可正常回退为 Base64 编码传输，不视为失败
        const isImage = a.asset?.asset_type === 'image' || !a.asset?.asset_type;
        const isImageWithFile = isImage && a.file;
        if (isImageWithFile) return false;

        // 其它任何仍为 blob: 的素材均视为上传失败（音视频大文件、无 file 的本地临时资源等）
        return a.fullUrl?.startsWith('blob:');
      });
      if (hasFailedUpload) {
        throw new Error('素材文件上传失败，请检查网络并重试。');
      }

      // 准备 taskData (包含永久 URL)
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

      // 2. 收集用于 AI 接口的 URL（优先使用已上传的桶 URL）
      const resolvedAssetsForAI = await Promise.all(uploadedAssets.map(async (item) => {
        // 已成功上传到桶的附件，直接使用永久 URL（避免视频等大文件 base64 导致上游接口失败）
        if ((item as any).isUploaded && item.fullUrl) {
          return { url: item.fullUrl, type: item.asset.asset_type, options: item.options };
        }
        // 未上传成功的本地文件，回退为 base64（仅适用于小文件如图片）
        if (item.file) {
          const b64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = () => resolve(''); // 读取失败时以空字符串兜底，防止 Promise 永不 resolve
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
      };



      let endpoint = '';
      if (schemeType === 'video' || currentModel.type_name.includes('视频')) {
        endpoint = '/v1/video/generations';
        const imageAssets = resolvedAssetsForAI.filter(a => a.type === 'image');
        const videoAssets = resolvedAssetsForAI.filter(a => a.type === 'video');
        const audioAssets = resolvedAssetsForAI.filter(a => a.type === 'audio');

        { // 所有视频端点统一使用完整多模态 payload 格式
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
                imageUrls.push(a.url); // Let backend infer
              }
            });
          }

          // Fallback for single image param
          if (imageUrls.length === 0 && paramValues.image_url) {
            imageUrls.push(paramValues.image_url);
          }

          if (imageUrls.length > 0) body.images = imageUrls;
          if (videoUrls.length > 0) body.videos = videoUrls;
          if (audioUrls.length > 0) body.audios = audioUrls;
        }
        delete body.image_url;
      } else if (schemeType === 'image' || currentModel.type_name.includes('图片')) {
        endpoint = '/v1/images/generations';
        const allImageUrls = resolvedAssetsForAI.filter(a => a.type === 'image').map(a => a.url);
        const finalImageUrls = allImageUrls.length > 0 ? allImageUrls : (paramValues.image_url ? [paramValues.image_url] : []);

        if (finalImageUrls.length > 0) {
          // 统一使用 image_urls 数组格式传递参考图（后端各厂商均已内置 image_urls → 原生格式的转换逻辑）
          body.image_urls = finalImageUrls;
        }
        delete body.image_url;
      } else {
        endpoint = '/v1/chat/completions';
        const contentArr: any[] = [{ type: 'text', text: prompt.trim() }];
        // 对对话模型，支持多个图片输入
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
      } else {
        const token = localStorage.getItem('token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await axios.post(endpoint, body, {
        headers
      }).then(r => r.data);

      // OpenAI 异步任务检测：视频端点 或 返回了 pending/in_progress 状态
      const isVideoEndpoint = endpoint.includes('video') || endpoint.includes('contents/generations');
      const asyncTaskId = res?.id || res?.task_id;
      const isAsyncTask = asyncTaskId && (
        isVideoEndpoint
        || res?.status === 'pending'
        || res?.status === 'in_progress'
      );

      if (isAsyncTask) {
        const taskId = asyncTaskId;
        // 为异步任务自动构造统一的 OpenAI 轮询端点
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
            ...res
          }
        } : n);
        setNodes(finalNodes);
        setTaskPollingNodes(prev => [...prev, newNodeId]);
        saveCanvasRef.current?.(finalNodes);
        pollTaskStatus(newNodeId, taskId, currentModel.model_id, initialNode.type, pollEndpoint, selectedTokenKey);
      } else {
        // OpenAI 格式响应直接使用

        let completedNodesToPersist: CanvasNode[] = [];
        setNodes(prev => {
          let updated = [...prev];
          const mainNodeIndex = updated.findIndex(n => n.id === newNodeId);
          if (mainNodeIndex >= 0) {
            const origNode = updated[mainNodeIndex];
            updated[mainNodeIndex] = {
              ...origNode,
              status: 'loading', // 保持为 loading！
              resultData: res,   // 暂存原始数据供持久化使用
              taskData: {
                ...(origNode.taskData || {}),
                completed_at: Date.now(),
                task_id: res?.id || res?.task_id || origNode.taskData?.task_id,
                is_sync_completed: true,
                attached_url: finalAttachedUrls[0] || '',
                attached_urls: finalAttachedUrls,
              }
            };

            // 多图裂变占位（以 loading 呈现）
            if (res.data && Array.isArray(res.data) && res.data.length > 1) {
              const extraNodes = res.data.slice(1).map((imgObj: any, idx: number) => {
                return {
                  ...updated[mainNodeIndex],
                  id: `${newNodeId}-ext-${idx}`,
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

          completedNodesToPersist = updated.filter(n => n.id === newNodeId || n.id.startsWith(`${newNodeId}-ext-`));
          return updated;
        });

        for (const node of completedNodesToPersist) {
          persistAsset(node, node.resultData, currentModel);
        }
      }
    } catch (e: any) {
      // 如果是请求被取消、中止或因为页面卸载导致的错误，不应该将节点状态设置为错误，以保留 loading 状态供页面重进时自动恢复
      if (isUnloadingRef.current || isRequestAborted(e)) {
        console.warn('生成请求被中止或取消，保留 loading 状态以供恢复', e);
        return;
      }

      const errMsg = e?.response?.data?.error?.message || e?.response?.data?.message || e?.message || '生成失败';
      message.error(errMsg);
      setNodes(prev => {
        const errNodes: CanvasNode[] = prev.map(n => n.id === newNodeId ? { ...n, status: 'error' as const, resultData: { message: errMsg } } : n);
        saveCanvasRef.current?.(errNodes);
        return errNodes;
      });
    } finally {
      // 无论成功或失败，请求结束后从活跃集合中移除
      activeRequestRef.current.delete(newNodeId);
    }
  }, [currentModel, prompt, paramValues, canvasTransform, maxZIndex, setNodes, setMaxZIndex, setGenerating, generating, setTaskPollingNodes, attachedAssets, nodes.length, validateBeforeGenerate]);

  /** 轮询异步任务状态（视频/图片），tokenKey 绑定发起时使用的令牌 */
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
        setNodes(prev => prev.map(n => n.id === nodeId ? {
          ...n,
          // 保持 loading 状态，后端 cleanup_stale_playground_nodes 会扫描 loading 节点并自动恢复
          taskData: { ...(n.taskData || {}), poll_timeout: true }
        } : n));
        setTaskPollingNodes(prev => prev.filter(id => id !== nodeId));
        // 保存画布状态，确保 poll_timeout 标记持久化
        setTimeout(() => saveCanvasRef.current?.(), 300);
        return;
      }
      attempts++;

      try {
        // 优先使用任务绑定的 token，确保退出重进后轮询仍使用正确令牌
        const effectiveKey = tokenKey || tokenKeyRef.current;
        const headers: Record<string, string> = {
          'X-Playground': '1',
        };
        if (effectiveKey) {
          headers['Authorization'] = `Bearer ${effectiveKey}`;
        } else {
          const token = localStorage.getItem('token');
          if (token) headers['Authorization'] = `Bearer ${token}`;
        }

        const res = await axios.get(buildPollUrl(), { headers, timeout: 15000 }).then(r => r.data);
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
                status: 'loading', // 保持为 loading！
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
          return;
        } else if (['failed', 'fail', 'error'].includes(taskStatus)) {
          setNodes(prev => {
            const errNodes: CanvasNode[] = prev.map(n => n.id === nodeId ? { ...n, status: 'error' as const, resultData: { message: res?.error?.message || res?.message || '生成失败', ...res } } : n);
            saveCanvasRef.current?.(errNodes);
            return errNodes;
          });
          setTaskPollingNodes(prev => prev.filter(id => id !== nodeId));
          return;
        }
        schedulePoll(poll, 5000);
      } catch (e: any) {
        // 请求被取消或页面卸载 → 忽略，不计入错误
        if (isUnloadingRef.current || isRequestAborted(e)) return;

        consecutiveErrors++;
        const respData = e?.response?.data;
        const errMsg = respData?.error?.message || respData?.message || e?.message || '轮询请求异常';

        // 服务端明确返回失败状态 → 直接终止
        const respStatus = String(respData?.status || '').toLowerCase();
        if (['failed', 'fail', 'error'].includes(respStatus)) {
          setNodes(prev => {
            const errNodes: CanvasNode[] = prev.map(n => n.id === nodeId ? { ...n, status: 'error' as const, resultData: { message: errMsg } } : n);
            saveCanvasRef.current?.(errNodes);
            return errNodes;
          });
          setTaskPollingNodes(prev => prev.filter(id => id !== nodeId));
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
            setNodes(prev => prev.map(n => n.id === nodeId ? {
              ...n,
              taskData: { ...(n.taskData || {}), poll_exhausted: true }
            } : n));
            setTimeout(() => saveCanvasRef.current?.(), 300);
          } else {
            // 非网络类异常达到上限 → 标记为错误
            setNodes(prev => {
              const errNodes: CanvasNode[] = prev.map(n => n.id === nodeId ? { ...n, status: 'error' as const, resultData: { message: `连续${consecutiveErrors}次轮询异常: ${errMsg}` } } : n);
              saveCanvasRef.current?.(errNodes);
              return errNodes;
            });
          }
          setTaskPollingNodes(prev => prev.filter(id => id !== nodeId));
          return;
        }

        // 网络异常采用指数退避（5s→10s→15s...上限30s），减少无效请求
        const retryDelay = isNetErr ? Math.min(5000 + consecutiveErrors * 5000, 30000) : 5000;
        schedulePoll(poll, retryDelay);
      }
    };

    schedulePoll(poll, 3000);
  }, [setNodes, setTaskPollingNodes, persistAsset]);

  // 自动恢复对处在 loading 状态但尚未轮询的节点进行轮询
  useEffect(() => {
    nodes.forEach(n => {
      if (n.status === 'loading' && n.taskData?.task_id && !n.taskData?.is_sync_completed && !taskPollingNodes.includes(n.id) && !pollExhaustedRef.current.has(n.id)) {
        const m = models.find(mod => mod.model_id === n.taskData?.model_id);
        // 优先使用 models 列表中的 model_id，找不到时 fallback 使用节点自带的
        const modelId = m?.model_id || n.taskData?.model_id;
        if (modelId) {
          setTaskPollingNodes(prev => [...prev, n.id]);
          pollTaskStatus(n.id, n.taskData.task_id, modelId, n.type, `/v1/tasks/${n.taskData.task_id}`, n.taskData?.token_key);
        }
      }
    });
  }, [nodes, models, taskPollingNodes, setTaskPollingNodes, pollTaskStatus]);

  // 自动恢复有结果但仍处于 loading 状态的节点的持久化上传
  useEffect(() => {
    nodes.forEach(n => {
      if (n.status === 'loading' && n.resultData && n.taskData?.is_sync_completed && !persistRecoveringRef.current.has(n.id)) {
        const cm = currentModelRef.current;
        const modelId = n.taskData?.model_id;
        const modelForPersist = cm?.model_id === modelId ? cm : { model_id: modelId || '', name: n.taskData?.model_name || '' };
        persistAsset(n, n.resultData, modelForPersist);
      }
    });
  }, [nodes, persistAsset]);

  // 恢复无 task_id 的 loading 节点：通过专用恢复接口查询已完成的请求
  // 后端使用 tokio::spawn 保护，即使客户端断开也会完成处理并更新日志
  const recoveryPollingRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const isCreatedInSession = (id: string) => {
      if (createdInCurrentSessionRef.current.has(id)) return true;
      const baseId = id.split('-ext-')[0];
      return createdInCurrentSessionRef.current.has(baseId);
    };

    const pendingNodes = nodes.filter(
      n => n.status === 'loading' && !n.taskData?.task_id && !recoveryPollingRef.current.has(n.id)
        && !activeRequestRef.current.has(n.id) // 正在首次请求中的节点不触发恢复
        && !isCreatedInSession(n.id) // 过滤掉当前会话中新建的节点，不触发恢复
    );
    if (pendingNodes.length === 0) return;

    pendingNodes.forEach(n => {
      recoveryPollingRef.current.add(n.id);
      const createdAt = n.taskData?.created_at;
      const modelId = n.taskData?.model_id;
      if (!createdAt || !modelId) return;

      // 根据节点类型选择正确的 endpoint
      const recoverEndpoint = n.type === 'video' ? '/v1/video/generations' : '/v1/images/generations';

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
          const { default: requestUtil } = await import('../../../utils/request');
          const sysLogId = n.taskData?.sys_log_id;
          if (!sysLogId) return; // 无日志 ID 的旧节点不执行恢复（30分钟超时在项目加载时处理）

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
            // 异步任务：后端已提交成功，用 task_id 启动轮询
            const taskId = res.task_id;
            const pollEndpoint = `/v1/tasks/${taskId}`;
            setNodes(prev => prev.map(nd =>
              nd.id === n.id ? {
                ...nd,
                taskData: { ...(nd.taskData || {}), task_id: taskId, poll_endpoint: pollEndpoint }
              } : nd
            ));
            setTaskPollingNodes(prev => [...prev, n.id]);
            pollTaskStatus(n.id, taskId, modelId, n.type, pollEndpoint, n.taskData?.token_key);
            return;
          }

          if (status === 'completed' && res?.result_data) {
            const resultData = res.result_data;
            // 检查是否已有该节点的持久化记录（避免重复）
            const alreadyPersisted = nodes.some(nd => nd.id.startsWith('asset-') && nd.taskData?.model_id === modelId
              && nd.taskData?.created_at === createdAt);

            if (alreadyPersisted) {
              setNodes(prev => prev.map(nd =>
                nd.id === n.id ? { ...nd, status: 'completed' as const, resultData, taskData: { ...(nd.taskData || {}), completed_at: Date.now() } } : nd
              ));
            } else {
              // 暂存上游数据并继续保持 loading，交给 persistAsset 完成持久化后置为 completed
              const tempNode: CanvasNode = {
                ...n,
                status: 'loading',
                resultData,
                taskData: { ...(n.taskData || {}), completed_at: Date.now(), is_sync_completed: true }
              };
              setNodes(prev => prev.map(nd =>
                nd.id === n.id ? tempNode : nd
              ));
              const cm = currentModelRef.current;
              const modelForPersist = cm?.model_id ? cm : { model_id: modelId, name: n.taskData?.model_name || '' };
              persistAsset(tempNode, resultData, modelForPersist);
            }
          } else if (status === 'completed') {
            setNodes(prev => prev.map(nd =>
              nd.id === n.id ? { ...nd, status: 'completed' as const, resultData: { message: res?.message || '已完成' }, taskData: { ...(nd.taskData || {}), completed_at: Date.now() } } : nd
            ));
          } else if (status === 'failed') {
            setNodes(prev => prev.map(nd =>
              nd.id === n.id ? { ...nd, status: 'error', resultData: { message: res?.message || '生成失败' } } : nd
            ));
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

  /** 聊天模型流式生成，返回 true 表示请求已成功发出 */
  const handleChatGenerate = useCallback(async (): Promise<boolean> => {
    if (!currentModel || !prompt.trim()) return false;
    if (isGeneratingRef.current || generating) return false;
    if (!validateBeforeGenerate()) return false;

    isGeneratingRef.current = true;
    setGenerating(true);
    const userMsg = { role: 'user' as const, content: prompt.trim(), timestamp: Date.now() };
    setChatMessages(prev => [...prev, userMsg]);
    setStreamingContent('');

    try {
      // 0. 自动将没有 file 句柄的 blob: 附件利用 fetch 转换为 File 实例，以便无缝复用底层的上传接口存入 TOS
      const preparedAssets = await Promise.all(attachedAssets.map(async (item) => {
        if (!item.file && item.fullUrl && item.fullUrl.startsWith('blob:')) {
          try {
            const blob = await fetch(item.fullUrl).then(r => r.blob());
            const ext = item.asset?.asset_type === 'video' ? 'mp4' : item.asset?.asset_type === 'audio' ? 'mp3' : 'png';
            const filename = item.asset?.file_name || `blob_${Date.now()}.${ext}`;
            const file = new File([blob], filename, { type: blob.type });
            return { ...item, file };
          } catch (e) {
            console.error('Failed to convert blob url to File object in chat', e);
            return item;
          }
        }
        return item;
      }));

      // 预处理：将本地附件上传到 TOS，关联 project_id 计入项目消耗
      const uploadedAssets = await Promise.all(preparedAssets.map(async (item) => {
        if (item.file) {
          const formData = new FormData();
          formData.append('file', item.file);
          if (currentProjectId) formData.append('project_id', currentProjectId.toString());
          try {
            const { default: requestUtil } = await import('../../../utils/request');
            const res = await requestUtil.post('/playground/assets/upload', formData, {
              headers: { 'Content-Type': 'multipart/form-data' }
            }) as any;
            if (res.url) return { ...item, fullUrl: res.url, file: undefined, isUploaded: true };
          } catch (e) {
            console.error('附件上传失败', e);
          }
        }
        return item;
      }));
      setAttachedAssets(uploadedAssets);

      // 校验是否有任何素材附件上传失败（依然是 blob:）
      const hasFailedUpload = uploadedAssets.some(a => a.fullUrl?.startsWith('blob:'));
      if (hasFailedUpload) {
        throw new Error('素材文件上传失败，请检查网络并重试。');
      }

      let resolvedAssets = uploadedAssets;

      // 构造消息体：如有附件图片则构造 multimodal content
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
        model: currentModel.model_id,
        messages,
        stream: useStream,
      };
      // 合并方案参数
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
        // 流式 SSE — 用 fetch 原生 ReadableStream
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
        // 非流式 — 用 axios
        const res = await axios.post('/v1/chat/completions', body, { headers }).then(r => r.data);
        const content = res?.choices?.[0]?.message?.content || JSON.stringify(res);
        setChatMessages(prev => [...prev, { role: 'assistant', content, timestamp: Date.now() }]);
      }

      // 聊天完成后清空附件
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
