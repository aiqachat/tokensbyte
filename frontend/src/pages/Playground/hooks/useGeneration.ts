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

export const useGeneration = () => {
  const { canvasTransform, setCanvasTransform, nodes, setNodes, maxZIndex, setMaxZIndex } = useCanvas();
  const {
    currentModel, prompt, paramValues,
    selectedTokenKey, generating, setGenerating,
    taskPollingNodes, setTaskPollingNodes, currentProjectId,
    attachedAssets, setAttachedAssets, models, apiTokens,
    storageStats,
  } = usePlayground();

  // 保持 currentProjectId 的最新引用（避免闭包过期问题）
  const projectIdRef = useRef(currentProjectId);
  projectIdRef.current = currentProjectId;

  /** 自动持久化生成结果到 TOS */
  const persistAsset = useCallback(async (node: CanvasNode, resultData: any, modelInfo: any) => {
    const pid = projectIdRef.current;
    if (!pid) return;
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
        const isUrl = rawUrl && (rawUrl.startsWith('http://') || rawUrl.startsWith('https://') || rawUrl.startsWith('/'));
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

      if (!sourceUrl && !base64Data) return;

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
            taskData: {
              ...n.taskData,
              file_size: res.file_size
            }
          };
          if (updatedNode.type === 'image') {
            updatedNode.resultData = { data: [{ url: res.file_url }] };
          } else if (updatedNode.type === 'video') {
            updatedNode.resultData = { content: { video_url: res.file_url } };
          }
          return updatedNode;
        }));
      }
      return res;
    } catch (e) {
      console.warn('资源持久化失败，不影响本次生成', e);
      return null;
    }
  }, [setNodes]);

  /** 发送生成请求 */
  const handleGenerate = useCallback(async () => {
    if (generating) return;
    if (!currentModel || !prompt.trim()) return;

    if (!selectedTokenKey) {
      message.warning({
        content: '生成不成功：请先在下方选择一个令牌 (Token)',
        duration: 4,
        key: 'no-token-selected',
      });
      return;
    }

    // 前置校验：检查当前选中密钥的额度是否已用尽
    if (selectedTokenKey) {
      const currentToken = apiTokens.find((t: any) => t.token_key === selectedTokenKey);
      if (currentToken && currentToken.quota_limit >= 0 && currentToken.quota_used >= currentToken.quota_limit) {
        message.warning({
          content: '当前密钥额度已用尽，请更换密钥或前往密钥管理页面充值额度',
          duration: 4,
          key: 'quota-exceeded',
        });
        return;
      }
    }

    const maxAssets = storageStats?.max_assets || 10;
    if (nodes.length >= maxAssets) {
      message.warning({
        content: `当前项目创作素材内容已达到 ${maxAssets} 个上限，请先清理部分素材再创作。`,
        duration: 4,
        key: 'max-assets-exceeded',
      });
      return;
    }

    setGenerating(true);

    const newNodeId = Date.now().toString() + Math.random().toString(36).substring(2, 6);
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
        prompt: prompt.trim(),
        model_name: currentModel.name,
        model_id: currentModel.model_id,
        attached_urls: attachedAssets.map(a => a.fullUrl),
        created_at: new Date().toISOString(),
      },
      resultData: null,
      x: targetX,
      y: targetY,
      width: 480,
      height: 320,
      zIndex: newZIndex
    };

    setNodes(prev => [...prev, initialNode]);

    // 自动平移画布，让新节点居中可见
    const nodeCenterX = targetX + initialNode.width / 2;
    const nodeCenterY = targetY + initialNode.height / 2;
    setCanvasTransform(prev => ({
      ...prev,
      x: -nodeCenterX * prev.scale + window.innerWidth / 2,
      y: -nodeCenterY * prev.scale + window.innerHeight / 2,
    }));

    try {
      // 1. 预处理：将本地附件上传到永久存储，确保日志记录的是永久 URL 而非临时的 blob
      const uploadedAssets = await Promise.all(attachedAssets.map(async (item) => {
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

      // 准备 taskData (包含永久 URL)
      const finalAttachedUrls = uploadedAssets.map(a => a.fullUrl);
      setNodes(prev => prev.map(n => n.id === newNodeId ? {
        ...n,
        taskData: {
          ...n.taskData,
          attached_url: finalAttachedUrls[0] || '',
          attached_urls: finalAttachedUrls,
        }
      } : n));

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

        if (currentModel.endpoint || true) { // Default to full multi-modal payload format for all video endpoints
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
          body.image = finalImageUrls.length > 1 ? finalImageUrls : finalImageUrls[0];
          // image_urls: 数组格式，兼容其他 OpenAI 平台
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

      // 检测异步任务响应：视频端点 或 图片端点返回了 task_id
      const isVideoEndpoint = endpoint.includes('video') || endpoint.includes('contents/generations');
      const asyncTaskId = res?.task_id || res?.data?.task_id || res?.output?.task_id || res?.id || (Array.isArray(res?.data) && res.data[0]?.task_id);

      const isAsyncTask = asyncTaskId && (
        isVideoEndpoint
        || res?.task_id
        || res?.data?.task_id
        || res?.output?.task_id
        || (Array.isArray(res?.data) && res.data[0]?.task_id)
      );

      if (isAsyncTask) {
        const taskId = asyncTaskId;
        // 为异步任务自动构造统一的 OpenAI 轮询端点
        const pollEndpoint = `/v1/tasks/${taskId}`;
        setNodes(prev => prev.map(n => n.id === newNodeId ? { ...n, taskData: { ...(n.taskData || {}), task_id: taskId, poll_endpoint: pollEndpoint, ...res } } : n));
        setTaskPollingNodes(prev => [...prev, newNodeId]);
        pollTaskStatus(newNodeId, taskId, currentModel.model_id, pollEndpoint);
        setGenerating(false); // 解除全局生成锁，允许用户继续点击 Run 并行生成
      } else {
        // 归一化 Gemini 原生响应为 data[] 格式，方便后续统一处理多图裂变和持久化
        let normalizedRes = res;
        if (!normalizedRes.data && normalizedRes.candidates) {
          const images: any[] = [];
          for (const candidate of normalizedRes.candidates) {
            const parts = candidate?.content?.parts;
            if (parts) {
              for (const part of parts) {
                const inline = part.inlineData || part.inline_data;
                if (inline?.data) {
                  const mime = inline.mimeType || inline.mime_type || 'image/png';
                  images.push({ url: `data:${mime};base64,${inline.data}`, b64_json: inline.data });
                }
              }
            }
          }
          if (images.length > 0) {
            normalizedRes = { ...normalizedRes, data: images };
          }
        }

        let completedNodesToPersist: CanvasNode[] = [];
        setNodes(prev => {
          let updated = [...prev];
          const mainNodeIndex = updated.findIndex(n => n.id === newNodeId);
          if (mainNodeIndex >= 0) {
            updated[mainNodeIndex] = { ...updated[mainNodeIndex], status: 'completed' as const, resultData: normalizedRes };

            // 如果返回了多张图 (如 Seedream n>1)，裂变出额外的节点
            if (normalizedRes.data && Array.isArray(normalizedRes.data) && normalizedRes.data.length > 1) {
              const extraNodes = normalizedRes.data.slice(1).map((imgObj: any, idx: number) => {
                return {
                  ...updated[mainNodeIndex],
                  id: `${newNodeId}-ext-${idx}`,
                  x: updated[mainNodeIndex].x + (updated[mainNodeIndex].width + 5) * (idx + 1),
                  y: updated[mainNodeIndex].y,
                  zIndex: updated[mainNodeIndex].zIndex + idx + 1,
                  resultData: { ...normalizedRes, data: [imgObj] }
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
        setGenerating(false);
      }
    } catch (e: any) {
      const errMsg = e?.response?.data?.error?.message || e?.message || '生成失败';
      message.error(errMsg);
      setNodes(prev => prev.map(n => n.id === newNodeId ? { ...n, status: 'error', resultData: { message: errMsg } } : n));
      setGenerating(false);
    }
  }, [currentModel, prompt, paramValues, selectedTokenKey, canvasTransform, maxZIndex, setNodes, setMaxZIndex, setGenerating, generating, setTaskPollingNodes, attachedAssets, apiTokens, nodes.length, storageStats]);

  /** 轮询异步任务状态（视频/图片） */
  const pollTaskStatus = useCallback((nodeId: string, taskId: string, modelId: string, pollEndpointTemplate?: string) => {
    let attempts = 0;
    const maxAttempts = 120;

    const buildPollUrl = () => {
      if (pollEndpointTemplate && !pollEndpointTemplate.includes('{task_id}')) return pollEndpointTemplate;
      if (pollEndpointTemplate) return pollEndpointTemplate.replace('{task_id}', taskId);
      return `/v1/video/generations/${taskId}?model=${modelId}`;
    };

    const poll = async () => {
      if (attempts >= maxAttempts) {
        setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, status: 'error', resultData: { message: '生成超时，请稍后在日志中查看结果' } } : n));
        setTaskPollingNodes(prev => prev.filter(id => id !== nodeId));
        return;
      }
      attempts++;

      try {
        const headers: Record<string, string> = {};
        if (selectedTokenKey) {
          headers['Authorization'] = `Bearer ${selectedTokenKey}`;
        } else {
          const token = localStorage.getItem('token');
          if (token) headers['Authorization'] = `Bearer ${token}`;
        }

        const res = await axios.get(buildPollUrl(), { headers }).then(r => r.data);

        // 兼容多种异步响应格式的状态字段:
        // 火山: { status: 'succeeded' }, GPT: { data: { status: 'completed' } }
        // 可灵: { data: { task_status: 'succeed' } }, 阿里云: { output: { task_status: 'SUCCEEDED' } }
        const rawStatus = res?.status || res?.data?.status || res?.data?.task_status
          || res?.output?.task_status || res?.final_result?.status
          || (Array.isArray(res?.data) && res.data[0]?.status) || '';
        const taskStatus = String(rawStatus).toLowerCase();
        const isCompleted = ['succeeded', 'completed', 'success', 'succeed'].includes(taskStatus);

        if (isCompleted) {
          // 标准化结果：统一转为 ImageNodeContent / VideoNodeContent 可识别的格式
          let normalizedResult = res;
          const taskResult = res?.data?.result || res?.data?.task_result || res?.result;
          if (taskResult?.images && Array.isArray(taskResult.images)) {
            const imageUrls = taskResult.images.flatMap((img: any) => Array.isArray(img.url) ? img.url : [img.url]).filter(Boolean);
            if (imageUrls.length > 0) {
              normalizedResult = { ...res, data: imageUrls.map((u: string) => ({ url: u })) };
            }
          } else if (taskResult?.videos && Array.isArray(taskResult.videos)) {
            const videoUrl = taskResult.videos[0]?.url;
            if (videoUrl) {
              normalizedResult = { ...res, content: { video_url: videoUrl } };
            }
          }
          let completedNodesToPersist: CanvasNode[] = [];
          setNodes(prev => {
            let updated = [...prev];
            const mainNodeIndex = updated.findIndex(n => n.id === nodeId);
            if (mainNodeIndex >= 0) {
              updated[mainNodeIndex] = { ...updated[mainNodeIndex], status: 'completed' as const, resultData: normalizedResult };

              // 如果返回了多张图，裂变出额外的节点
              if (normalizedResult.data && Array.isArray(normalizedResult.data) && normalizedResult.data.length > 1) {
                const extraNodes = normalizedResult.data.slice(1).map((imgObj: any, idx: number) => {
                  return {
                    ...updated[mainNodeIndex],
                    id: `${nodeId}-ext-${idx}`,
                    x: updated[mainNodeIndex].x + (updated[mainNodeIndex].width + 5) * (idx + 1),
                    y: updated[mainNodeIndex].y,
                    zIndex: updated[mainNodeIndex].zIndex + idx + 1,
                    resultData: { ...normalizedResult, data: [imgObj] }
                  };
                });
                updated.push(...extraNodes);
              }
            }
            completedNodesToPersist = updated.filter(n => n.id === nodeId || n.id.startsWith(`${nodeId}-ext-`));
            return updated;
          });

          for (const node of completedNodesToPersist) {
            persistAsset(node, node.resultData, currentModel);
          }

          setTaskPollingNodes(prev => prev.filter(id => id !== nodeId));
          return;
        } else if (['failed', 'fail', 'error'].includes(taskStatus)) {
          setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, status: 'error', resultData: { message: res?.error?.message || '生成失败', ...res } } : n));
          setTaskPollingNodes(prev => prev.filter(id => id !== nodeId));
          return;
        }
        setTimeout(poll, 5000);
      } catch {
        setTimeout(poll, 5000);
      }
    };

    setTimeout(poll, 3000);
  }, [selectedTokenKey, setNodes, setTaskPollingNodes, setGenerating, currentModel, persistAsset]);

  // 自动恢复对处在 loading 状态但尚未轮询的节点进行轮询
  useEffect(() => {
    nodes.forEach(n => {
      if (n.status === 'loading' && n.taskData?.task_id && !taskPollingNodes.includes(n.id)) {
        const m = models.find(mod => mod.model_id === n.taskData?.model_id);
        if (m) {
          setTaskPollingNodes(prev => [...prev, n.id]);
          pollTaskStatus(n.id, n.taskData.task_id, m.model_id, `/v1/tasks/${n.taskData.task_id}`);
        }
      }
    });
  }, [nodes, models, taskPollingNodes, setTaskPollingNodes, pollTaskStatus]);

  return { handleGenerate };
};
