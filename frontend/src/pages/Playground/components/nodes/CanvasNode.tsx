/**
 * 画布节点外壳组件
 * 无标题栏的简洁设计，整个节点可拖拽
 * 选中时显示缩放手柄，悬停时显示关闭按钮
 */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Typography, Tooltip, Popover, Dropdown, Modal, Button } from 'antd';
import toast from '../PlaygroundToast';

import {
  CloseOutlined, LoadingOutlined, PlusOutlined
} from '@ant-design/icons';
import { usePlayground, useCanvas } from '../../context/PlaygroundContext';
import { useThemeStore } from '../../../../store/theme';
import { formatApiDateTime } from '../../../../utils/timedisplay';

import type { CanvasNode as CanvasNodeType } from '../../types';
import VideoNodeContent from './VideoNodeContent';
import ImageNodeContent from './ImageNodeContent';
import TextNodeContent from './TextNodeContent';
import AudioNodeContent from './AudioNodeContent';
import PreviewNode from './PreviewNode';
import VolcEnhanceNode from './VolcEnhanceNode';
import PromptNode from './PromptNode';
import AiVideoNode from './AiVideoNode';
import AiImageNode from './AiImageNode';
import AgentNode from './AgentNode';
import SectionNode from './SectionNode';
import NodeToolbar from './shared/NodeToolbar';
import type { AdvancedNodeProps } from './shared/types';
import { getResultDisplayUrl } from '../../utils/resultExtractor';
import { getSharedModalStyles } from '../../utils/modalStyles';

const { Text } = Typography;
import { ResizeHandle } from './ResizeHandle';
import type { ResizeDirection } from './ResizeHandle';

interface Props {
  node: CanvasNodeType;
  isSelected: boolean;
  isDragging: boolean;
  activeTool: string;
  onMouseDown: (e: React.MouseEvent, id: string, x: number, y: number) => void;
  onRemove: (id: string) => void;
  onSelect: (id: string, e?: React.MouseEvent) => void;
  onResizeStart?: (e: React.MouseEvent, nodeId: string, direction: ResizeDirection) => void;
  isMobile?: boolean;
  hideResizeHandles?: boolean;
}

const CanvasNode: React.FC<Props> = React.memo(({
  node, isSelected, isDragging, activeTool,
  onMouseDown, onRemove, onSelect, onResizeStart,
  isMobile = false,
  hideResizeHandles = false
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isPropertyModalOpen, setIsPropertyModalOpen] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const { advancedNodesConfig, saveCanvasState, selectedTokenKey } = usePlayground();
  const { themeMode } = useThemeStore();
  const _isLight = themeMode === 'light';
  const {
    nodes, setNodes, maxZIndex, setMaxZIndex,
    setConnectingSourceId, setConnectingMousePos,
    canvasTransform, setCanvasTransform, canvasRef
  } = useCanvas();

  const nodeRef = useRef<HTMLDivElement>(null);

  // 解决拖动缩放产生的硬编码高度在 Re-render 后未被重置为 'auto' 的问题
  useEffect(() => {
    if (!nodeRef.current) return;
    const isAutoHeight = ['agent', 'ai_image', 'ai_video', 'volc_enhance'].includes(node.taskData?.node_type || '');
    if (isAutoHeight) {
      nodeRef.current.style.height = '';
    }
  });

  // 获取预览节点当前所预览的素材类型
  const getPreviewMediaType = (currNode: any): 'image' | 'video' | 'audio' => {
    if (!currNode) return 'image';
    const findSourceNodeLocal = (n: any): any => {
      if (!n) return null;
      const parent = n.parentId ? nodes.find(p => p.id === n.parentId) : null;
      if (!parent || parent.isHidden) return null;
      if (parent.taskData?.node_type === 'volc_enhance') {
        return parent;
      }
      const url = getResultDisplayUrl(parent.type, parent.resultData);
      if (url) {
        return parent;
      }
      if (parent.taskData?.node_type === 'preview') {
        return findSourceNodeLocal(parent);
      }
      return parent;
    };

    const parentNode = currNode.parentId ? nodes.find(n => n.id === currNode.parentId) : null;
    const sourceNode = (parentNode && !parentNode.isHidden) ? (findSourceNodeLocal(currNode) || parentNode) : null;

    const selfType = currNode.type || (sourceNode ? sourceNode.type : 'image');
    const selfUrl = getResultDisplayUrl(selfType, currNode.resultData);
    const mediaType = selfUrl ? selfType : (sourceNode ? sourceNode.type : 'image');
    return mediaType as 'image' | 'video' | 'audio';
  };

  // 递归查找含真实媒体 URL 的源节点（用于展示预览节点的最终媒体地址）
  const findPreviewSourceNode = (currNode: any): any => {
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
      return findPreviewSourceNode(parent);
    }
    return parent;
  };

  // 动态解析实例的展示节点
  const displayNode = useMemo(() => {
    if ((node.isInstance || node.taskData?.is_instance) && node.taskData?.source_node_id) {
      const source = nodes.find(n => n.id === node.taskData.source_node_id);
      if (source) {
        return {
          ...node,
          status: source.status,
          resultData: source.resultData,
          type: source.type,
          taskData: {
            ...node.taskData,
            ...source.taskData,
            is_instance: true,
            source_node_id: node.taskData.source_node_id,
          }
        };
      }
    }
    return node;
  }, [node, nodes]);

  const previewMediaUrl = useMemo(() => {
    if (node.taskData?.node_type !== 'preview') return '';
    const parentNode = node.parentId ? nodes.find(n => n.id === node.parentId) : null;
    if (!parentNode || parentNode.isHidden) return '';
    const sourceNode = findPreviewSourceNode(node) || parentNode;
    const selfType = displayNode.type || (sourceNode ? sourceNode.type : 'image');
    const selfUrl = getResultDisplayUrl(selfType, displayNode.resultData);
    const mediaType = selfUrl ? selfType : (sourceNode ? sourceNode.type : 'image');
    return selfUrl || (sourceNode ? getResultDisplayUrl(mediaType, sourceNode.resultData) : '');
  }, [node, nodes, displayNode]);

  const mediaUrl = useMemo(() => {
    if (node.taskData?.node_type === 'preview') {
      return previewMediaUrl;
    }
    return getResultDisplayUrl(displayNode.type, displayNode.resultData) || '';
  }, [node, previewMediaUrl, displayNode]);

  const absoluteMediaUrl = useMemo(() => {
    if (!mediaUrl) return '';
    if (mediaUrl.startsWith('http://') || mediaUrl.startsWith('https://') || mediaUrl.startsWith('data:')) {
      return mediaUrl;
    }
    return `${window.location.origin}${mediaUrl.startsWith('/') ? '' : '/'}${mediaUrl}`;
  }, [mediaUrl]);

  if (node.type === 'section') {
    return (
      <SectionNode
        node={node}
        isSelected={isSelected}
        isDragging={isDragging}
        activeTool={activeTool}
        onMouseDown={onMouseDown}
        onRemove={onRemove}
        onSelect={onSelect}
        onResizeStart={onResizeStart}
        isMobile={isMobile}
      />
    );
  }


  const updateNodeTaskData = (fields: Record<string, any>) => {
    setNodes((prev: any) => {
      const next = prev.map((n: any) => {
        if (n.id === node.id) {
          return {
            ...n,
            taskData: {
              ...(n.taskData || {}),
              ...fields
            }
          };
        }
        return n;
      });
      saveCanvasState(next);
      return next;
    });
  };

  const handleDownload = async () => {
    try {
      const url = getResultDisplayUrl(displayNode.type, displayNode.resultData);
      if (!url) {
        toast.warning('暂无可用素材下载');
        return;
      }
      const res = await fetch(url);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      const ext = displayNode.type === 'video' ? 'mp4' : (displayNode.type === 'audio' ? 'mp3' : 'png');
      a.download = `material-${displayNode.id}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
      toast.success('开始下载');
    } catch (e) {
      console.error(e);
      toast.error('下载失败，请尝试右键另存为');
    }
  };

  const handleZoomToFit = () => {
    if (!canvasRef.current || !setCanvasTransform) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const nodeW = displayNode.width || 320;
    const nodeH = displayNode.height || 240;
    
    // Calculate scale to fit within viewport with 100px padding
    const scaleX = (rect.width - 200) / nodeW;
    const scaleY = (rect.height - 200) / nodeH;
    let targetScale = Math.min(scaleX, scaleY, 1.5); // Max scale 1.5x
    if (targetScale < 0.1) targetScale = 0.1;

    const targetX = rect.width / 2 - (displayNode.x + nodeW / 2) * targetScale;
    const targetY = rect.height / 2 - (displayNode.y + nodeH / 2) * targetScale;

    setCanvasTransform({ x: targetX, y: targetY, scale: targetScale });
  };

  const handleAddAdvancedNode = (type: 'preview' | 'volc_enhance' | 'prompt' | 'ai_video' | 'ai_image' | 'agent') => {
    // 检查节点总数限制 (同样的可用节点类型最多创建 10 个)
    if (type === 'volc_enhance') {
      const isImagePreview = node.taskData?.node_type === 'preview'
        ? getPreviewMediaType(node) === 'image'
        : node.type === 'image';
      if (isImagePreview) {
        toast.warning('火山画质增强仅支持视频素材！');
        return;
      }
      const volcCount = nodes.filter(n => n.taskData?.node_type === 'volc_enhance').length;
      const previewCount = nodes.filter(n => n.taskData?.node_type === 'preview').length;
      if (volcCount >= 10) {
        toast.warning('该项目已达火山引擎画质增强节点上限 (最多10个)');
        return;
      }
      if (previewCount >= 10) {
        toast.warning('该项目已达预览节点上限 (最多10个)，无法创建画质增强节点');
        return;
      }
    } else {
      const sameTypeCount = nodes.filter(n => n.taskData?.node_type === type).length;
      if (sameTypeCount >= 10) {
        const typeLabels: Record<string, string> = {
          preview: '预览',
          prompt: '提示词',
          ai_video: 'AI视频',
          ai_image: 'AI图片',
          agent: 'Agent智能体'
        };
        toast.warning(`该项目已达${typeLabels[type] || type}节点上限 (最多10个)`);
        return;
      }
    }

    const newZIndex = maxZIndex + 1;
    setMaxZIndex(newZIndex);

    const parentX = node.x;
    const parentY = node.y;
    const parentW = node.width || 320;

    const newNodesToPush: any[] = [];

    // 防重合偏移计算：如果当前要放置的位置已经有节点（包括全局未隐藏的节点 and 这次同时要加入的新节点），就往右上角偏移 (30, -30) 像素
    const getNonConflictingPos = (baseX: number, baseY: number, currentAdded: any[] = []) => {
      let finalX = baseX;
      let finalY = baseY;
      const offsetStep = 30;
      const isPositionOccupied = (px: number, py: number) => {
        return nodes.some(n => !n.isHidden && Math.abs(n.x - px) < 5 && Math.abs(n.y - py) < 5)
          || currentAdded.some(n => Math.abs(n.x - px) < 5 && Math.abs(n.y - py) < 5);
      };
      while (isPositionOccupied(finalX, finalY)) {
        finalX += offsetStep;
        finalY -= offsetStep;
      }
      return { x: finalX, y: finalY };
    };

    if (type === 'preview') {
      const parentMediaType = node.taskData?.node_type === 'preview' ? getPreviewMediaType(node) : node.type;
      const newNodeType = parentMediaType === 'audio' ? 'audio' : parentMediaType === 'image' ? 'image' : 'video';
      const newHeight = parentMediaType === 'audio' ? 80 : 200;
      const newNodeId = `node-${Date.now()}`;
      const basePos = getNonConflictingPos(parentX + parentW + 40, parentY, newNodesToPush);
      const newNode = {
        id: newNodeId,
        type: newNodeType,
        status: 'completed',
        resultData: { content: `[预览节点] 关联至素材: ${node.id}` },
        x: basePos.x,
        y: basePos.y,
        width: 280,
        height: newHeight,
        zIndex: newZIndex,
        parentId: node.id,
        taskData: {
          node_type: 'preview'
        }
      };
      newNodesToPush.push(newNode);
    } else if (type === 'volc_enhance') {
      // 1. Create Volcano enhance node
      const volcNodeId = `node-${Date.now()}`;
      const volcBasePos = getNonConflictingPos(parentX + parentW + 40, parentY, newNodesToPush);
      const volcNode = {
        id: volcNodeId,
        type: 'video',
        status: 'completed',
        resultData: { content: { video_url: '' } },
        x: volcBasePos.x,
        y: volcBasePos.y,
        width: 280,
        height: 240,
        zIndex: newZIndex,
        parentId: node.id,
        taskData: {
          node_type: 'volc_enhance',
          model: '火山画质增强 - 标准版',
          scene: 'AI 生成 (AIGC)',
          resolution: '保持原分辨率',
          fps: '保持原帧率'
        }
      };
      newNodesToPush.push(volcNode);

      // 2. Create Preview node linked to Volcano enhance node
      const previewNodeId = `node-${Date.now() + 1}`;
      const parentMediaType = node.taskData?.node_type === 'preview' ? getPreviewMediaType(node) : node.type;
      const previewNodeType = parentMediaType === 'audio' ? 'audio' : parentMediaType === 'image' ? 'image' : 'video';
      const previewHeight = parentMediaType === 'audio' ? 80 : 200;
      const previewBasePos = getNonConflictingPos(volcBasePos.x + 280 + 40, volcBasePos.y, newNodesToPush);
      const previewNode = {
        id: previewNodeId,
        type: previewNodeType,
        status: 'completed',
        resultData: { content: `[预览节点] 关联至素材: ${volcNodeId}` },
        x: previewBasePos.x,
        y: previewBasePos.y,
        width: 280,
        height: previewHeight,
        zIndex: newZIndex + 1,
        parentId: volcNodeId,
        taskData: {
          node_type: 'preview'
        }
      };
      newNodesToPush.push(previewNode);
    } else if (type === 'prompt') {
      const promptNodeId = `node-${Date.now()}`;
      const basePos = getNonConflictingPos(parentX + parentW + 40, parentY, newNodesToPush);
      const promptNode = {
        id: promptNodeId,
        type: 'text',
        status: 'completed',
        resultData: { content: '' },
        x: basePos.x,
        y: basePos.y,
        width: 280,
        height: 180,
        zIndex: newZIndex,
        parentId: node.id,
        taskData: {
          node_type: 'prompt',
          prompt: '',
        }
      };
      newNodesToPush.push(promptNode);
    } else if (type === 'ai_video') {
      const videoNodeId = `node-${Date.now()}`;
      const basePos = getNonConflictingPos(parentX + parentW + 40, parentY, newNodesToPush);
      const videoNode = {
        id: videoNodeId,
        type: 'video',
        status: 'completed',
        resultData: { content: { video_url: '' } },
        x: basePos.x,
        y: basePos.y,
        width: 280,
        height: 250,
        zIndex: newZIndex,
        parentId: node.id,
        taskData: {
          node_type: 'ai_video',
          model: '',
          duration: '5秒',
          motion: '中 (推荐)',
          prompt: '',
        }
      };
      newNodesToPush.push(videoNode);
    } else if (type === 'ai_image') {
      const imageNodeId = `node-${Date.now()}`;
      const basePos = getNonConflictingPos(parentX + parentW + 40, parentY, newNodesToPush);
      const imageNode = {
        id: imageNodeId,
        type: 'image',
        status: 'completed',
        resultData: { content: { image_url: '' } },
        x: basePos.x,
        y: basePos.y,
        width: 280,
        height: 250,
        zIndex: newZIndex,
        parentId: node.id,
        taskData: {
          node_type: 'ai_image',
          model: '',
          aspect_ratio: '16:9 宽屏宽幅',
          prompt: '',
        }
      };
      newNodesToPush.push(imageNode);
    } else if (type === 'agent') {
      const agentNodeId = `node-${Date.now()}`;
      const basePos = getNonConflictingPos(parentX + parentW + 40, parentY, newNodesToPush);
      const agentNode = {
        id: agentNodeId,
        type: 'text',
        status: 'completed',
        resultData: { content: '' },
        x: basePos.x,
        y: basePos.y,
        width: 280,
        height: 250,
        zIndex: newZIndex,
        parentId: node.id,
        taskData: {
          node_type: 'agent',
          agent_name: '创意写作助手',
          temperature: 0.7,
          prompt: '',
        }
      };
      newNodesToPush.push(agentNode);
    }

    setNodes((prev: any) => {
      const next = [...prev, ...newNodesToPush];
      saveCanvasState(next);
      return next;
    });
    // 添加完高级节点后自动关闭弹窗
    setIsPopoverOpen(false);
    setIsDropdownOpen(false);
  };

  const handleCreateInstance = () => {
    const sourceNodeId = node.taskData?.source_node_id || node.id;
    const sameNodesCount = nodes.filter(n => (n.taskData?.source_node_id || n.id) === sourceNodeId).length;
    if (sameNodesCount >= 10) {
      toast.warning('同样的节点最多只能创建 10 个');
      return;
    }

    const newZIndex = maxZIndex + 1;
    setMaxZIndex(newZIndex);

    const parentX = node.x;
    const parentY = node.y;
    const parentW = node.width || 320;

    const clonedNodeId = `node-${Date.now()}`;
    const clonedNode = {
      ...JSON.parse(JSON.stringify(node)),
      id: clonedNodeId,
      x: parentX + parentW + 40,
      y: parentY,
      zIndex: newZIndex,
      isInstance: true,
      taskData: {
        ...(node.taskData || {}),
        is_instance: true,
        source_node_id: sourceNodeId,
      }
    };

    setNodes((prev: any) => {
      const next = [...prev, clonedNode];
      saveCanvasState(next);
      return next;
    });
    // 创建完实例后自动关闭弹窗
    setIsPopoverOpen(false);
    setIsDropdownOpen(false);
  };

  const renderAdvancedNodesMenu = () => {
    const previewEnabled = advancedNodesConfig?.preview_enabled !== false;
    const volcEnhanceEnabled = advancedNodesConfig?.volc_enhance_enabled;
    const volcEnhanceActive = advancedNodesConfig?.volc_enhance_plugin_active;
    const promptEnabled = advancedNodesConfig?.prompt_enabled !== false;
    const aiVideoEnabled = advancedNodesConfig?.ai_video_enabled !== false;
    const aiImageEnabled = advancedNodesConfig?.ai_image_enabled !== false;
    const agentEnabled = !!advancedNodesConfig?.agent_enabled;

    // 检查是否已经关联过同类高级节点
    const hasPreview = nodes.some(n => n.parentId === node.id && n.taskData?.node_type === 'preview' && !n.isHidden);
    const hasVolcEnhance = nodes.some(n => n.parentId === node.id && n.taskData?.node_type === 'volc_enhance' && !n.isHidden);
    const hasPrompt = nodes.some(n => n.parentId === node.id && n.taskData?.node_type === 'prompt' && !n.isHidden);
    const hasAiVideo = nodes.some(n => n.parentId === node.id && n.taskData?.node_type === 'ai_video' && !n.isHidden);
    const hasAiImage = nodes.some(n => n.parentId === node.id && n.taskData?.node_type === 'ai_image' && !n.isHidden);
    const hasAgent = nodes.some(n => n.parentId === node.id && n.taskData?.node_type === 'agent' && !n.isHidden);

    const hasAnyAdvancedNode = previewEnabled || volcEnhanceEnabled || promptEnabled || aiVideoEnabled || aiImageEnabled || agentEnabled;
    const isInstanceNode = !!(node.isInstance || node.taskData?.is_instance);
    const sourceNodeId = node.taskData?.source_node_id || node.id;
    const sameNodesCount = nodes.filter(n => (n.taskData?.source_node_id || n.id) === sourceNodeId).length;
    const isLimitReached = sameNodesCount >= 10;

    const previewCount = nodes.filter(n => n.taskData?.node_type === 'preview').length;
    const promptCount = nodes.filter(n => n.taskData?.node_type === 'prompt').length;
    const aiVideoCount = nodes.filter(n => n.taskData?.node_type === 'ai_video').length;
    const aiImageCount = nodes.filter(n => n.taskData?.node_type === 'ai_image').length;
    const agentCount = nodes.filter(n => n.taskData?.node_type === 'agent').length;
    const volcEnhanceCount = nodes.filter(n => n.taskData?.node_type === 'volc_enhance').length;

    const isPreviewLimit = previewCount >= 10;
    const isPromptLimit = promptCount >= 10;
    const isAiVideoLimit = aiVideoCount >= 10;
    const isAiImageLimit = aiImageCount >= 10;
    const isAgentLimit = agentCount >= 10;
    const isVolcEnhanceLimit = volcEnhanceCount >= 10 || previewCount >= 10;

    const isPreviewDisabled = isPreviewLimit;
    const isPromptDisabled = hasPrompt || isPromptLimit;
    const isAiVideoDisabled = hasAiVideo || isAiVideoLimit;
    const isAiImageDisabled = hasAiImage || isAiImageLimit;
    const isAgentDisabled = hasAgent || isAgentLimit;

    const isImagePreview = node.taskData?.node_type === 'preview'
      ? getPreviewMediaType(node) === 'image'
      : node.type === 'image';
    const isVolcEnhanceActive = !!volcEnhanceActive;
    const isVolcEnhanceDisabled = !isVolcEnhanceActive || isVolcEnhanceLimit || isImagePreview;
    const volcEnhanceTooltip = !isVolcEnhanceActive
      ? "站点尚未开启AI MediaKit火山引擎画质增加插件，无法使用"
      : (isImagePreview
        ? "火山画质增强仅支持视频素材"
        : (isVolcEnhanceLimit
          ? (volcEnhanceCount >= 10
            ? "该项目已达火山引擎画质增强节点上限 (最多10个)"
            : "该项目已达关联的预览节点上限 (最多10个)，无法创建火山画质增强")
          : ""));

    const _isLight = themeMode === 'light';

    // Theme-dependent styles
    const menuTitleColor = _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)';
    const menuBorderColor = _isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)';
    const itemTitleColor = _isLight ? '#09090b' : '#fff';
    const itemDescColor = _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)';
    const itemBgColor = _isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)';

    // Hover backgrounds
    const itemHoverBgColor = _isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)';
    const otherActionHoverBgColor = _isLight ? 'rgba(22,119,255,0.08)' : 'rgba(22,119,255,0.1)';

    return (
      <div style={{ padding: '4px', width: 220, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: menuTitleColor, padding: '0 4px 4px', borderBottom: '1px solid ' + menuBorderColor }}>
          可添加的高级节点
        </div>

        {previewEnabled && (
          <Tooltip title={isPreviewLimit ? "该项目已达预览节点上限 (最多10个)" : ""}>
            <div
              onClick={!isPreviewDisabled ? () => handleAddAdvancedNode('preview') : undefined}
              style={{
                display: 'flex',
                flexDirection: 'column',
                padding: '8px',
                borderRadius: 6,
                cursor: isPreviewDisabled ? 'not-allowed' : 'pointer',
                background: isPreviewDisabled ? 'transparent' : itemBgColor,
                opacity: isPreviewDisabled ? 0.4 : 1,
                transition: 'background 0.2s',
              }}
              onMouseEnter={(e) => {
                if (!isPreviewDisabled) e.currentTarget.style.background = itemHoverBgColor;
              }}
              onMouseLeave={(e) => {
                if (!isPreviewDisabled) e.currentTarget.style.background = itemBgColor;
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 500, color: itemTitleColor }}>预览节点</span>
              <span style={{ fontSize: 11, color: itemDescColor, marginTop: 2 }}>
                {isPreviewLimit ? '已达创建上限 (最多10个)' : '生成当前素材的快速预览'}
              </span>
            </div>
          </Tooltip>
        )}

        {promptEnabled && (
          <Tooltip title={hasPrompt ? "当前素材已关联了提示词节点" : (isPromptLimit ? "该项目已达提示词节点上限 (最多10个)" : "")}>
            <div
              onClick={!isPromptDisabled ? () => handleAddAdvancedNode('prompt') : undefined}
              style={{
                display: 'flex',
                flexDirection: 'column',
                padding: '8px',
                borderRadius: 6,
                cursor: isPromptDisabled ? 'not-allowed' : 'pointer',
                background: isPromptDisabled ? 'transparent' : itemBgColor,
                opacity: isPromptDisabled ? 0.4 : 1,
                transition: 'background 0.2s',
              }}
              onMouseEnter={(e) => {
                if (!isPromptDisabled) e.currentTarget.style.background = itemHoverBgColor;
              }}
              onMouseLeave={(e) => {
                if (!isPromptDisabled) e.currentTarget.style.background = itemBgColor;
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 500, color: itemTitleColor }}>提示词节点</span>
              <span style={{ fontSize: 11, color: itemDescColor, marginTop: 2 }}>
                {isPromptLimit && !hasPrompt ? '已达创建上限 (最多10个)' : '建立专用的文本提示词区域'}
              </span>
            </div>
          </Tooltip>
        )}

        {aiVideoEnabled && (
          <Tooltip title={hasAiVideo ? "当前素材已关联了AI视频节点" : (isAiVideoLimit ? "该项目已达AI视频节点上限 (最多10个)" : "")}>
            <div
              onClick={!isAiVideoDisabled ? () => handleAddAdvancedNode('ai_video') : undefined}
              style={{
                display: 'flex',
                flexDirection: 'column',
                padding: '8px',
                borderRadius: 6,
                cursor: isAiVideoDisabled ? 'not-allowed' : 'pointer',
                background: isAiVideoDisabled ? 'transparent' : itemBgColor,
                opacity: isAiVideoDisabled ? 0.4 : 1,
                transition: 'background 0.2s',
              }}
              onMouseEnter={(e) => {
                if (!isAiVideoDisabled) e.currentTarget.style.background = itemHoverBgColor;
              }}
              onMouseLeave={(e) => {
                if (!isAiVideoDisabled) e.currentTarget.style.background = itemBgColor;
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 500, color: itemTitleColor }}>AI视频节点</span>
              <span style={{ fontSize: 11, color: itemDescColor, marginTop: 2 }}>
                {isAiVideoLimit && !hasAiVideo ? '已达创建上限 (最多10个)' : '运行AI算法生成或编辑视频'}
              </span>
            </div>
          </Tooltip>
        )}

        {aiImageEnabled && (
          <Tooltip title={hasAiImage ? "当前素材已关联了AI图片节点" : (isAiImageLimit ? "该项目已达AI图片节点上限 (最多10个)" : "")}>
            <div
              onClick={!isAiImageDisabled ? () => handleAddAdvancedNode('ai_image') : undefined}
              style={{
                display: 'flex',
                flexDirection: 'column',
                padding: '8px',
                borderRadius: 6,
                cursor: isAiImageDisabled ? 'not-allowed' : 'pointer',
                background: isAiImageDisabled ? 'transparent' : itemBgColor,
                opacity: isAiImageDisabled ? 0.4 : 1,
                transition: 'background 0.2s',
              }}
              onMouseEnter={(e) => {
                if (!isAiImageDisabled) e.currentTarget.style.background = itemHoverBgColor;
              }}
              onMouseLeave={(e) => {
                if (!isAiImageDisabled) e.currentTarget.style.background = itemBgColor;
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 500, color: itemTitleColor }}>AI图片节点</span>
              <span style={{ fontSize: 11, color: itemDescColor, marginTop: 2 }}>
                {isAiImageLimit && !hasAiImage ? '已达创建上限 (最多10个)' : '运行AI算法生成或编辑图像'}
              </span>
            </div>
          </Tooltip>
        )}

        {agentEnabled && (
          <Tooltip title={hasAgent ? "当前素材已关联了Agent智能体节点" : (isAgentLimit ? "该项目已达Agent智能体节点上限 (最多10个)" : "")}>
            <div
              onClick={!isAgentDisabled ? () => handleAddAdvancedNode('agent') : undefined}
              style={{
                display: 'flex',
                flexDirection: 'column',
                padding: '8px',
                borderRadius: 6,
                cursor: isAgentDisabled ? 'not-allowed' : 'pointer',
                background: isAgentDisabled ? 'transparent' : itemBgColor,
                opacity: isAgentDisabled ? 0.4 : 1,
                transition: 'background 0.2s',
              }}
              onMouseEnter={(e) => {
                if (!isAgentDisabled) e.currentTarget.style.background = itemHoverBgColor;
              }}
              onMouseLeave={(e) => {
                if (!isAgentDisabled) e.currentTarget.style.background = itemBgColor;
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 500, color: itemTitleColor }}>Agent智能体</span>
              <span style={{ fontSize: 11, color: itemDescColor, marginTop: 2 }}>
                {isAgentLimit && !hasAgent ? '已达创建上限 (最多10个)' : '建立角色定制与智能对话响应'}
              </span>
            </div>
          </Tooltip>
        )}

        {volcEnhanceEnabled && (
          <Tooltip title={volcEnhanceTooltip}>
            <div
              onClick={!isVolcEnhanceDisabled ? () => handleAddAdvancedNode('volc_enhance') : undefined}
              style={{
                display: 'flex',
                flexDirection: 'column',
                padding: '8px',
                borderRadius: 6,
                cursor: !isVolcEnhanceDisabled ? 'pointer' : 'not-allowed',
                background: !isVolcEnhanceDisabled ? itemBgColor : 'transparent',
                opacity: !isVolcEnhanceDisabled ? 1 : 0.4,
                transition: 'background 0.2s',
              }}
              onMouseEnter={(e) => {
                if (!isVolcEnhanceDisabled) e.currentTarget.style.background = itemHoverBgColor;
              }}
              onMouseLeave={(e) => {
                if (!isVolcEnhanceDisabled) e.currentTarget.style.background = itemBgColor;
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 500, color: itemTitleColor }}>火山画质增强</span>
              <span style={{ fontSize: 11, color: itemDescColor, marginTop: 2 }}>
                {!isVolcEnhanceActive
                  ? '超分辨率修复及插帧提升画质'
                  : (isImagePreview
                    ? '仅支持视频素材'
                    : (isVolcEnhanceLimit ? '已达创建上限 (最多10个)' : '超分辨率修复及插帧提升画质'))}
              </span>
            </div>
          </Tooltip>
        )}

        {!hasAnyAdvancedNode && (
          <div style={{ padding: '8px', textAlign: 'center', fontSize: 12, color: itemDescColor }}>
            无可用的高级节点
          </div>
        )}

        <div style={{ borderTop: '1px solid ' + menuBorderColor, marginTop: 4, paddingTop: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: menuTitleColor, padding: '0 4px 4px', marginBottom: 6 }}>
            其他操作
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Tooltip title={isInstanceNode ? "实例节点无法再次创建实例" : (isLimitReached ? "同样的节点最多只能创建 10 个" : "")}>
              <div
                onClick={(isInstanceNode || isLimitReached) ? undefined : handleCreateInstance}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '8px',
                  borderRadius: 6,
                  cursor: (isInstanceNode || isLimitReached) ? 'not-allowed' : 'pointer',
                  background: itemBgColor,
                  transition: 'background 0.2s',
                  opacity: (isInstanceNode || isLimitReached) ? 0.45 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!isInstanceNode && !isLimitReached) {
                    e.currentTarget.style.background = otherActionHoverBgColor;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isInstanceNode && !isLimitReached) {
                    e.currentTarget.style.background = itemBgColor;
                  }
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 500, color: itemTitleColor }}>创建实例</span>
                <span style={{ fontSize: 11, color: itemDescColor, marginTop: 2 }}>
                  {isInstanceNode ? '当前节点已是实例节点' : (isLimitReached ? '已达创建上限 (最多10个)' : '复制并创建一个相同内容的节点')}
                </span>
              </div>
            </Tooltip>

            <div
              onClick={() => {
                setIsPropertyModalOpen(true);
                // 打开属性弹窗时自动关闭选择菜单
                setIsPopoverOpen(false);
                setIsDropdownOpen(false);
              }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                padding: '8px',
                borderRadius: 6,
                cursor: 'pointer',
                background: itemBgColor,
                transition: 'background 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = otherActionHoverBgColor;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = itemBgColor;
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 500, color: itemTitleColor }}>节点属性</span>
              <span style={{ fontSize: 11, color: itemDescColor, marginTop: 2 }}>
                查看详细属性与任务元数据
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const handleResizeMouseDown = (e: React.MouseEvent, dir: ResizeDirection) => {
    if (onResizeStart) {
      onResizeStart(e, node.id, dir);
    }
  };

  const isPreviewNode = node.taskData?.node_type === 'preview';
  const isMaterialNode = (node.type === 'image' || node.type === 'video') && !node.taskData?.node_type;

  const showContextMenu = !!advancedNodesConfig?.enabled && !isMobile && (isMaterialNode || isPreviewNode);

  // 构建传递给各高级节点组件的共享 Props
  const advancedNodeProps: AdvancedNodeProps = {
    node, displayNode, nodes, isLight: _isLight,
    updateNodeTaskData, onRemove, setNodes,
    saveCanvasState, selectedTokenKey,
    isSelected,
  };

  const renderNodeElement = () => (
    <div
      ref={nodeRef}
      data-node-id={node.id}
      onClick={(e) => onSelect(node.id, e)}
      onMouseDown={isMobile ? undefined : (e) => onMouseDown(e, node.id, node.x, node.y)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        position: isMobile ? 'relative' : 'absolute',
        left: isMobile ? undefined : node.x,
        top: isMobile ? undefined : node.y,
        width: isMobile ? '100%' : node.width,
        height: isMobile ? undefined : (['agent', 'ai_image', 'ai_video', 'volc_enhance'].includes(node.taskData?.node_type || '') ? 'auto' : (node.height || 180)),
        maxWidth: undefined,
        maxHeight: undefined,
        aspectRatio: isMobile ? `${node.width || 480}/${node.height || 320}` : undefined,
        zIndex: isMobile ? undefined : Math.max(node.zIndex || 10, 10),
        background: node.taskData?.node_type === 'prompt' ? 'transparent' : '#18181b',
        borderRadius: node.taskData?.node_type === 'prompt' ? 0 : 12,
        border: node.taskData?.node_type === 'prompt'
          ? 'none'
          : `${isSelected ? '1.5px' : '1px'} solid ${isSelected ? '#1677ff' : isDragging ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.08)'}`,
        boxShadow: node.taskData?.node_type === 'prompt'
          ? 'none'
          : isSelected
            ? '0 0 0 1px rgba(22,119,255,0.15), 0 8px 32px rgba(0, 0, 0, 0.5)'
            : isDragging
              ? '0 8px 32px rgba(255,255,255,0.2)'
              : '0 4px 20px rgba(0,0,0,0.5)',
        overflow: (isSelected || isHovered || ['ai_image', 'ai_video', 'prompt', 'preview'].includes(node.taskData?.node_type || '')) ? 'visible' : 'hidden',
        transition: isDragging ? 'none' : 'box-shadow 0.2s, border-color 0.2s',
        cursor: isMobile ? 'pointer' : (activeTool === 'pointer' ? (isDragging ? 'grabbing' : 'grab') : 'default'),
      }}
    >
      {/* 选中状态：悬浮工具栏 */}
      {isSelected && !isMobile && (
        <NodeToolbar
          onDuplicate={(node.isInstance || node.taskData?.is_instance) ? undefined : handleCreateInstance}
          onDownload={handleDownload}
          onZoomToFit={handleZoomToFit}
          onShowProperties={() => {
            setIsPropertyModalOpen(true);
            setIsPopoverOpen(false);
            setIsDropdownOpen(false);
          }}
          onRemove={() => onRemove(node.id)}
          canDownload={node.type === 'image' || node.type === 'video' || node.type === 'audio'}
        />
      )}

      {/* 选中状态：缩放手柄 */}
      {isSelected && !isMobile && !hideResizeHandles && activeTool === 'pointer' && (
        <>
          <ResizeHandle direction="nw" onMouseDown={handleResizeMouseDown} />
          <ResizeHandle direction="n" onMouseDown={handleResizeMouseDown} />
          <ResizeHandle direction="ne" onMouseDown={handleResizeMouseDown} />
          <ResizeHandle direction="e" onMouseDown={handleResizeMouseDown} />
          <ResizeHandle direction="se" onMouseDown={handleResizeMouseDown} />
          <ResizeHandle direction="s" onMouseDown={handleResizeMouseDown} />
          <ResizeHandle direction="sw" onMouseDown={handleResizeMouseDown} />
          <ResizeHandle direction="w" onMouseDown={handleResizeMouseDown} />
        </>
      )}

      {/* 悬停或选中时：右上角关闭按钮 (仅对非高级的普通素材节点渲染，高级节点通过 NodeShell 自带关闭按钮) */}
      {(isHovered || isSelected) && !node.taskData?.node_type && (
        <Tooltip title="移除节点">
          <div
            onClick={(e) => { e.stopPropagation(); onRemove(node.id); }}
            style={{
              position: 'absolute',
              top: -8,
              right: -8,
              width: 22,
              height: 22,
              borderRadius: '50%',
              background: 'rgba(30,31,35,0.95)',
              border: '1px solid rgba(255,255,255,0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              zIndex: 11,
              transition: 'all 0.15s',
              backdropFilter: 'blur(4px)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#ff4d4f';
              e.currentTarget.style.borderColor = '#ff4d4f';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(30,31,35,0.95)';
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
            }}
          >
            <CloseOutlined style={{ fontSize: 10, color: '#fff' }} />
          </div>
        </Tooltip>
      )}

      {/* 实例标签 (Shadcn style) */}
      {(node.isInstance || node.taskData?.is_instance) && (
        <div style={{
          position: 'absolute',
          top: 8,
          right: 8,
          backgroundColor: 'rgba(9, 9, 11, 0.75)',
          color: '#f4f4f5',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          padding: '2px 8px',
          borderRadius: '9999px',
          fontSize: '12px',
          fontWeight: 500,
          lineHeight: '1.2',
          zIndex: 10,
          pointerEvents: 'none',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.2), 0 1px 2px -1px rgba(0, 0, 0, 0.2)',
        }}>
          <span style={{
            display: 'inline-block',
            width: 4,
            height: 4,
            borderRadius: '50%',
            backgroundColor: '#1677ff',
          }} />
          <span>实例</span>
        </div>
      )}

      {/* 内容区域 — 占满整个节点 */}
      <div style={{
        width: '100%', height: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative', overflow: (node.taskData?.node_type === 'ai_image' || node.taskData?.node_type === 'ai_video' || node.taskData?.node_type === 'prompt' || node.taskData?.node_type === 'preview') ? 'visible' : 'hidden', borderRadius: node.taskData?.node_type === 'prompt' ? 0 : 12,
      }}>
        {displayNode.status === 'loading' && !['preview', 'ai_image', 'ai_video'].includes(node.taskData?.node_type || '') && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            {(displayNode.taskData?.poll_timeout || displayNode.taskData?.poll_exhausted) ? (
              /* 前端轮询已超时，但后端任务仍在处理中，定时任务会自动恢复 */
              <>
                <div style={{ fontSize: 28, opacity: 0.6 }}>⏳</div>
                <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, textAlign: 'center', lineHeight: '18px', padding: '0 16px' }}>
                  仍在生成中，完成后会自动显示
                </Text>
              </>
            ) : (
              <>
                <LoadingOutlined style={{ fontSize: 32, color: '#fff' }} />
                <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>
                  {displayNode.taskData?.task_id ? '生成中...' : '排队中...'}
                </Text>
              </>
            )}
          </div>
        )}
        {displayNode.status === 'error' && !['preview', 'ai_image', 'ai_video'].includes(node.taskData?.node_type || '') && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 16 }}>
            <Text style={{ color: '#ff4d4f', fontSize: 16 }}>生成失败</Text>
            <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, textAlign: 'center' }}>
              {displayNode.resultData?.message}
            </Text>
          </div>
        )}

        {/* 高级节点类型 → 分发到独立组件 */}
        {node.taskData?.node_type === 'preview' ? (
          <PreviewNode {...advancedNodeProps} />
        ) : node.taskData?.node_type === 'volc_enhance' ? (
          <VolcEnhanceNode {...advancedNodeProps} />
        ) : node.taskData?.node_type === 'prompt' ? (
          <PromptNode {...advancedNodeProps} />
        ) : node.taskData?.node_type === 'ai_video' ? (
          <AiVideoNode {...advancedNodeProps} />
        ) : node.taskData?.node_type === 'ai_image' ? (
          <AiImageNode {...advancedNodeProps} />
        ) : node.taskData?.node_type === 'agent' ? (
          <AgentNode {...advancedNodeProps} />
        ) : (
          <>
            {displayNode.status === 'completed' && displayNode.type === 'video' && (
              <VideoNodeContent resultData={displayNode.resultData} node={displayNode} />
            )}
            {displayNode.status === 'completed' && displayNode.type === 'image' && (
              <ImageNodeContent resultData={displayNode.resultData} node={displayNode} />
            )}
            {displayNode.status === 'completed' && displayNode.type === 'text' && (
              <TextNodeContent resultData={displayNode.resultData} />
            )}
            {displayNode.status === 'completed' && displayNode.type === 'audio' && (
              <AudioNodeContent resultData={displayNode.resultData} />
            )}
          </>
        )}
      </div>

      {/* 高级节点快捷增加把手 */}
      {advancedNodesConfig?.enabled && isSelected && !isMobile && (isMaterialNode || isPreviewNode) && (
        <Popover
          trigger="click"
          placement="right"
          open={isPopoverOpen}
          onOpenChange={setIsPopoverOpen}
          content={renderAdvancedNodesMenu()}
          overlayStyle={{ zIndex: 3000 }}
          overlayInnerStyle={{
            background: _isLight ? '#ffffff' : '#1f1f23',
            borderRadius: 16,
            border: _isLight ? '1px solid rgba(0,0,0,0.12)' : '1px solid rgba(255,255,255,0.12)',
            boxShadow: _isLight ? '0 10px 40px -10px rgba(0,0,0,0.15)' : '0 15px 50px -12px rgba(0,0,0,0.8)',
            padding: '8px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              right: -14,
              top: 'calc(50% - 18px)',
              transform: 'translateY(-50%)',
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: '#1677ff',
              color: '#fff',
              border: '2px solid #fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              zIndex: 1010,
              boxShadow: '0 4px 12px rgba(22,119,255,0.4)',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-50%) scale(1.1)';
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(22,119,255,0.6)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(-50%) scale(1)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(22,119,255,0.4)';
            }}
          >
            <PlusOutlined style={{ fontSize: 14, fontWeight: 'bold' }} />
          </div>
        </Popover>
      )}

      {/* 节点连接器小圆图标 */}
      {advancedNodesConfig?.enabled && isSelected && !isMobile && (
        <Tooltip title="拖动此连接器，松开连接到未绑定的预览或增强节点">
          <div
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setConnectingSourceId(node.id);
              // 初始化拖动虚线的鼠标画布坐标
              const rect = canvasRef.current?.getBoundingClientRect();
              if (rect) {
                const mouseX = (e.clientX - rect.left - canvasTransform.x) / canvasTransform.scale;
                const mouseY = (e.clientY - rect.top - canvasTransform.y) / canvasTransform.scale;
                setConnectingMousePos({ x: mouseX, y: mouseY });
              }
            }}
            style={{
              position: 'absolute',
              right: -10,
              top: (node.type === 'image' || node.type === 'video') ? 'calc(50% + 18px)' : '50%',
              transform: 'translateY(-50%)',
              width: 20,
              height: 20,
              borderRadius: '50%',
              background: '#fff',
              border: '2px solid #1677ff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'crosshair',
              zIndex: 1010,
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-50%) scale(1.15)';
              e.currentTarget.style.background = '#e6f7ff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(-50%) scale(1)';
              e.currentTarget.style.background = '#fff';
            }}
          >
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#1677ff' }} />
          </div>
        </Tooltip>
      )}
    </div>
  );

  const nodeContent = showContextMenu ? (
    <Dropdown
      trigger={['contextMenu']}
      open={isDropdownOpen}
      onOpenChange={setIsDropdownOpen}
      dropdownRender={() => (
        <div
          style={{
            background: _isLight ? '#ffffff' : '#1f1f23',
            borderRadius: 16,
            border: _isLight ? '1px solid rgba(0,0,0,0.12)' : '1px solid rgba(255,255,255,0.12)',
            boxShadow: _isLight ? '0 10px 40px -10px rgba(0,0,0,0.15)' : '0 15px 50px -12px rgba(0,0,0,0.8)',
            padding: '8px',
          }}
        >
          {renderAdvancedNodesMenu()}
        </div>
      )}
    >
      {renderNodeElement()}
    </Dropdown>
  ) : (
    renderNodeElement()
  );

  return (
    <>
      {nodeContent}
      <Modal
        title="节点详细属性"
        open={isPropertyModalOpen}
        onOk={() => setIsPropertyModalOpen(false)}
        onCancel={() => setIsPropertyModalOpen(false)}
        footer={[
          <Button key="ok" type="primary" onClick={() => setIsPropertyModalOpen(false)}>
            确定
          </Button>
        ]}
        width={450}
        {...getSharedModalStyles(_isLight)}
        styles={{
          ...getSharedModalStyles(_isLight).styles,
          body: { padding: '16px 4px' }
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', borderBottom: _isLight ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(255,255,255,0.06)', paddingBottom: 8 }}>
            <span style={{ width: 100, fontWeight: 600, color: _isLight ? '#555' : '#aaa' }}>节点 ID</span>
            <span style={{ flex: 1, fontFamily: 'monospace', wordBreak: 'break-all', userSelect: 'all', color: _isLight ? '#000' : '#fff' }}>{node.id}</span>
          </div>
          <div style={{ display: 'flex', borderBottom: _isLight ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(255,255,255,0.06)', paddingBottom: 8 }}>
            <span style={{ width: 100, fontWeight: 600, color: _isLight ? '#555' : '#aaa' }}>关联资源 ID</span>
            <span style={{ flex: 1, fontFamily: 'monospace', wordBreak: 'break-all', userSelect: 'all', color: _isLight ? '#000' : '#fff' }}>{node.taskData?.asset_id || node.taskData?.id || '无'}</span>
          </div>
          <div style={{ display: 'flex', borderBottom: _isLight ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(255,255,255,0.06)', paddingBottom: 8 }}>
            <span style={{ width: 100, fontWeight: 600, color: _isLight ? '#555' : '#aaa' }}>节点类型</span>
            <span style={{ flex: 1, color: _isLight ? '#000' : '#fff' }}>{node.type === 'image' ? '图片' : node.type === 'video' ? '视频' : node.type === 'audio' ? '音频' : node.type}</span>
          </div>
          <div style={{ display: 'flex', borderBottom: _isLight ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(255,255,255,0.06)', paddingBottom: 8 }}>
            <span style={{ width: 100, fontWeight: 600, color: _isLight ? '#555' : '#aaa' }}>任务类型</span>
            <span style={{ flex: 1, color: _isLight ? '#000' : '#fff' }}>{node.taskData?.node_type || '无'}</span>
          </div>
          <div style={{ display: 'flex', borderBottom: _isLight ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(255,255,255,0.06)', paddingBottom: 8 }}>
            <span style={{ width: 100, fontWeight: 600, color: _isLight ? '#555' : '#aaa' }}>创建时间</span>
            <span style={{ flex: 1, color: _isLight ? '#000' : '#fff' }}>{node.taskData?.created_at ? formatApiDateTime(node.taskData.created_at) : '无'}</span>
          </div>
          <div style={{ display: 'flex', borderBottom: _isLight ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(255,255,255,0.06)', paddingBottom: 8 }}>
            <span style={{ width: 100, fontWeight: 600, color: _isLight ? '#555' : '#aaa' }}>画布尺寸</span>
            <span style={{ flex: 1, color: _isLight ? '#000' : '#fff' }}>宽: {node.width || 320}px × 高: {node.height || 240}px</span>
          </div>
          {node.taskData?.file_size && (
            <div style={{ display: 'flex', borderBottom: _isLight ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(255,255,255,0.06)', paddingBottom: 8 }}>
              <span style={{ width: 100, fontWeight: 600, color: _isLight ? '#555' : '#aaa' }}>文件大小</span>
              <span style={{ flex: 1, color: _isLight ? '#000' : '#fff' }}>{(node.taskData.file_size / (1024 * 1024)).toFixed(2)} MB ({node.taskData.file_size} 字节)</span>
            </div>
          )}
          {node.taskData?.file_format && (
            <div style={{ display: 'flex', borderBottom: _isLight ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(255,255,255,0.06)', paddingBottom: 8 }}>
              <span style={{ width: 100, fontWeight: 600, color: _isLight ? '#555' : '#aaa' }}>文件格式</span>
              <span style={{ flex: 1, color: _isLight ? '#000' : '#fff' }}>{node.taskData.file_format}</span>
            </div>
          )}
          {absoluteMediaUrl && (
            <div style={{ display: 'flex', borderBottom: _isLight ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(255,255,255,0.06)', paddingBottom: 8 }}>
              <span style={{ width: 100, fontWeight: 600, color: _isLight ? '#555' : '#aaa' }}>资源网络地址</span>
              <span style={{ flex: 1, fontFamily: 'monospace', wordBreak: 'break-all', userSelect: 'all' }}>
                <a href={absoluteMediaUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#1677ff', textDecoration: 'underline' }}>
                  {absoluteMediaUrl}
                </a>
              </span>
            </div>
          )}
          {node.taskData?.prompt && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontWeight: 600, color: _isLight ? '#555' : '#aaa' }}>文本提示词 (Prompt)</span>
              <div style={{
                padding: 8,
                background: _isLight ? '#f4f4f5' : '#1e1e20',
                color: _isLight ? '#333' : '#e3e3e3',
                borderRadius: 6,
                fontSize: 12,
                wordBreak: 'break-all',
                userSelect: 'all',
                maxHeight: 100,
                overflowY: 'auto'
              }}>
                {node.taskData.prompt}
              </div>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
});

CanvasNode.displayName = 'CanvasNode';
export default CanvasNode;
