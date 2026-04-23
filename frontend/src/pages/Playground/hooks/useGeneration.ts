/**
 * 生成与轮询 Hook
 * 封装 API 调用、节点创建、异步轮询逻辑
 */
import { useCallback, useRef } from 'react';
import { message } from 'antd';
import axios from 'axios';
import type { CanvasNode } from '../types';
import { useCanvas } from '../context/PlaygroundContext';
import { usePlayground } from '../context/PlaygroundContext';

export const useGeneration = () => {
  const { canvasTransform, nodes, setNodes, maxZIndex, setMaxZIndex } = useCanvas();
  const {
    currentModel, prompt, paramValues,
    selectedTokenKey, generating, setGenerating,
    setTaskPollingNodes, currentProjectId,
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
        const imageData = resultData?.data?.[0] || resultData?.content?.image_url;
        const rawUrl = typeof imageData === 'string' ? imageData : imageData?.url || imageData?.b64_json;
        const isUrl = rawUrl && (rawUrl.startsWith('http://') || rawUrl.startsWith('https://') || rawUrl.startsWith('/'));
        if (isUrl) {
          sourceUrl = rawUrl;
        } else if (rawUrl && rawUrl.length > 100) {
          base64Data = rawUrl;
        } else if (rawUrl) {
          sourceUrl = rawUrl;
        }
      } else if (assetType === 'video') {
        sourceUrl = resultData?.content?.video_url || resultData?.final_result?.video_url || resultData?.video_url || '';
      }

      if (!sourceUrl && !base64Data) return;

      const { default: requestUtil } = await import('../../../utils/request');
      await requestUtil.post('/playground/assets/persist', {
        project_id: pid,
        asset_type: assetType,
        source_url: sourceUrl || undefined,
        base64_data: base64Data || undefined,
        prompt: node.taskData?.prompt || '',
        model_id: modelInfo?.model_id || '',
        model_name: modelInfo?.name || '',
        generation_params: node.taskData || {},
        canvas_node_data: { x: node.x, y: node.y, width: node.width, height: node.height },
      });
    } catch (e) {
      console.warn('资源持久化失败，不影响本次生成', e);
    }
  }, []);

  /** 发送生成请求 */
  const handleGenerate = useCallback(async () => {
    if (!currentModel || !prompt.trim()) return;
    if (!selectedTokenKey) {
      message.warning('请先选择一个 API 密钥');
      return;
    }

    setGenerating(true);

    const newNodeId = Date.now().toString();
    const centerX = -canvasTransform.x / canvasTransform.scale + window.innerWidth / 2 - 250;
    const centerY = -canvasTransform.y / canvasTransform.scale + window.innerHeight / 2 - 200;
    const offsetX = (Math.random() - 0.5) * 100;
    const offsetY = (Math.random() - 0.5) * 100;

    const newZIndex = maxZIndex + 1;
    setMaxZIndex(newZIndex);

    const initialNode: CanvasNode = {
      id: newNodeId,
      type: currentModel.type_name.includes('视频') || currentModel.scheme_type === 'video' ? 'video'
        : currentModel.type_name.includes('图片') || currentModel.scheme_type === 'image' ? 'image'
        : 'text',
      status: 'loading',
      taskData: { prompt: prompt.trim() },
      resultData: null,
      x: centerX + offsetX,
      y: centerY + offsetY,
      width: 480,
      height: 320,
      zIndex: newZIndex
    };

    setNodes(prev => [...prev, initialNode]);

    try {
      const schemeType = currentModel.scheme_type || '';
      const body: any = {
        model: currentModel.model_id,
        prompt: prompt.trim(),
        ...paramValues,
      };

      let endpoint = '';
      if (schemeType === 'video' || currentModel.type_name.includes('视频')) {
        endpoint = currentModel.endpoint || '/v1/video/generations';

        if (currentModel.endpoint) {
          const contentArr: any[] = [{ type: 'text', text: prompt.trim() }];
          const imageUrl = paramValues.image_url;
          if (imageUrl && String(imageUrl).trim()) {
            contentArr.push({ type: 'image_url', image_url: { url: String(imageUrl).trim() } });
          }
          body.content = contentArr;
          delete body.prompt;
        } else {
          const imageUrl = paramValues.image_url;
          if (imageUrl && String(imageUrl).trim()) {
            body.content = [
              { type: 'text', text: prompt.trim() },
              { type: 'image_url', image_url: { url: String(imageUrl).trim() } }
            ];
            delete body.prompt;
          }
        }
        delete body.image_url;
      } else if (schemeType === 'image' || currentModel.type_name.includes('图片')) {
        endpoint = '/v1/images/generations';
      } else {
        endpoint = '/v1/chat/completions';
        body.messages = [{ role: 'user', content: prompt.trim() }];
        delete body.prompt;
      }

      const res = await axios.post(endpoint, body, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${selectedTokenKey}`
        }
      }).then(r => r.data);

      const isVideoEndpoint = endpoint.includes('video') || endpoint.includes('contents/generations');
      if (isVideoEndpoint && (res?.id || res?.data?.task_id)) {
        const taskId = res?.id || res?.data?.task_id;
        setNodes(prev => prev.map(n => n.id === newNodeId ? { ...n, taskData: { ...(n.taskData || {}), task_id: taskId, ...res } } : n));
        setTaskPollingNodes(prev => [...prev, newNodeId]);
        pollTaskStatus(newNodeId, taskId, currentModel.model_id, currentModel.poll_endpoint);
      } else {
        setNodes(prev => {
          const updated = prev.map(n => n.id === newNodeId ? { ...n, status: 'completed' as const, resultData: res } : n);
          const completedNode = updated.find(n => n.id === newNodeId);
          if (completedNode) persistAsset(completedNode, res, currentModel);
          return updated;
        });
        setGenerating(false);
      }
    } catch (e: any) {
      const errMsg = e?.response?.data?.error?.message || e?.message || '生成失败';
      message.error(errMsg);
      setNodes(prev => prev.map(n => n.id === newNodeId ? { ...n, status: 'error', resultData: { message: errMsg } } : n));
      setGenerating(false);
    }
  }, [currentModel, prompt, paramValues, selectedTokenKey, canvasTransform, maxZIndex, setNodes, setMaxZIndex, setGenerating, setTaskPollingNodes]);

  /** 轮询视频任务状态 */
  const pollTaskStatus = useCallback((nodeId: string, taskId: string, modelId: string, pollEndpointTemplate?: string) => {
    let attempts = 0;
    const maxAttempts = 120;

    const buildPollUrl = () => {
      if (pollEndpointTemplate) return pollEndpointTemplate.replace('{task_id}', taskId);
      return `/v1/video/generations/${taskId}?model=${modelId}`;
    };

    const poll = async () => {
      if (attempts >= maxAttempts) {
        setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, status: 'error', resultData: { message: '生成超时，请稍后在日志中查看结果' } } : n));
        setTaskPollingNodes(prev => prev.filter(id => id !== nodeId));
        setGenerating(false);
        return;
      }
      attempts++;

      try {
        const res = await axios.get(buildPollUrl(), {
          headers: { 'Authorization': `Bearer ${selectedTokenKey}` }
        }).then(r => r.data);

        const status = res?.status || res?.final_result?.status || '';

        if (status === 'succeeded') {
          setNodes(prev => {
            const updated = prev.map(n => n.id === nodeId ? { ...n, status: 'completed' as const, resultData: res } : n);
            const completedNode = updated.find(n => n.id === nodeId);
            if (completedNode) persistAsset(completedNode, res, currentModel);
            return updated;
          });
          setTaskPollingNodes(prev => prev.filter(id => id !== nodeId));
          setGenerating(false);
          return;
        } else if (status === 'failed') {
          setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, status: 'error', resultData: { message: res?.error?.message || '生成失败', ...res } } : n));
          setTaskPollingNodes(prev => prev.filter(id => id !== nodeId));
          setGenerating(false);
          return;
        }
        setTimeout(poll, 5000);
      } catch {
        setTimeout(poll, 5000);
      }
    };

    setTimeout(poll, 3000);
  }, [selectedTokenKey, setNodes, setTaskPollingNodes, setGenerating]);

  return { handleGenerate };
};
