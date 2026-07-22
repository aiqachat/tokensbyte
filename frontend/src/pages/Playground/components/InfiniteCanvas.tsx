/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 无限画布容器
 * 负责粒子背景、变换层、鼠标事件代理
 * 
 * 性能关键：使用原生 addEventListener({ passive: false }) 挂载 wheel 事件
 * React 的 onWheel 是 passive 的，preventDefault() 不生效，
 * 导致 Mac 触控板的双指缩放会触发浏览器原生页面缩放。
 */
import React, { useEffect } from 'react';
import { Typography, Spin, Tooltip } from 'antd';
import toast from './PlaygroundToast';
import { CompassOutlined } from '@ant-design/icons';
import { useCanvas } from '../context/PlaygroundContext';
import { usePlayground } from '../context/PlaygroundContext';
import { useCanvasInteraction } from '../hooks/useCanvasInteraction';
import CanvasNode from './nodes/CanvasNode';
import { ResizeHandle } from './nodes/ResizeHandle';
import CanvasParticles from './CanvasParticles';
import type { CanvasParticlesHandle } from './CanvasParticles';
import { useThemeStore } from '../../../store/theme';

const VideoIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/></svg>
);
const ImageIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
);
const SparklesIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
);
const BotIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>
);
const ZapIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
);
const EyeIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0z"/><circle cx="12" cy="12" r="3"/></svg>
);

const { Title, Text } = Typography;

interface InfiniteCanvasProps {
  isMobile?: boolean;
}

/** 智能计算父子节点间最美连线的起终点坐标 */
const getLinkLineCoords = (parent: any, child: any, handleId?: string) => {
  const pX = parent.x;
  const pY = parent.y;
  const pW = parent.taskData?.node_type === 'prompt' ? (parent.width || 280) : (parent.width || 320);
  const pH = parent.taskData?.node_type === 'prompt' ? (parent.height || 180) : (parent.height || 320);

  const cX = child.x;
  const cY = child.y;
  const cW = child.width || 280;
  const cH = child.height || 200;

  if (handleId && child.taskData?.node_type === 'ai_video') {
    const isSeedance2 = child.taskData?.scheme_id === 'seedance2.0' || String(child.taskData?.model).toLowerCase().includes('seedance');
    let list: string[] = [];
    if (isSeedance2) {
      list = ['Prompt'];
      
      const highestImg = [1,2,3,4,5,6,7,8,9].reverse().find(i => child.inputConnections?.[`Reference Images ${i}`]) || 0;
      const manualImg = child.taskData?.manualSocketCounts?.['Reference Images'] || 1;
      const imgCount = Math.min(9, Math.max(manualImg, highestImg + 1));
      for(let i = 1; i <= imgCount; i++) list.push(`Reference Images ${i}`);
      
      const highestVid = [1,2,3].reverse().find(i => child.inputConnections?.[`Reference Videos ${i}`]) || 0;
      const manualVid = child.taskData?.manualSocketCounts?.['Reference Videos'] || 1;
      const vidCount = Math.min(3, Math.max(manualVid, highestVid + 1));
      for(let i = 1; i <= vidCount; i++) list.push(`Reference Videos ${i}`);

      const highestAud = [1,2,3].reverse().find(i => child.inputConnections?.[`Reference Audio ${i}`]) || 0;
      const manualAud = child.taskData?.manualSocketCounts?.['Reference Audio'] || 1;
      const audCount = Math.min(3, Math.max(manualAud, highestAud + 1));
      for(let i = 1; i <= audCount; i++) list.push(`Reference Audio ${i}`);
    } else {
      list = ['Prompt', 'Negative Prompt'];
    }
    
    let socketIndex = list.indexOf(handleId);
    if (socketIndex === -1) socketIndex = 0;
    
    const x2 = cX - 15;
    const y2 = cY + 34 + socketIndex * 26;
    let x1 = pX + pW;
    let y1 = pY + pH / 2;
    if (parent.taskData?.node_type === 'ai_image' || parent.taskData?.node_type === 'ai_video') {
      x1 = pX + pW + 15;
      y1 = pY + 31;
    } else if (parent.taskData?.node_type === 'preview') {
      x1 = pX + pW + 15;
      y1 = pY + 29;
    } else if (parent.taskData?.node_type === 'prompt') {
      x1 = pX + pW + 15;
      y1 = pY + 29;
    }
    if (cX + cW < pX) x1 = pX;
    return { x1, y1, x2, y2 };
  }

  // 针对提示词节点 -> AI图片/视频节点的特殊插口对齐
  if (parent.taskData?.node_type === 'prompt' && (child.taskData?.node_type === 'ai_image' || child.taskData?.node_type === 'ai_video')) {
    const x2 = cX - 15;
    const y2 = cY + 31;
    let x1 = pX + pW + 15;
    let y1 = pY + 29;
    // 如果子在父左侧，起点自适应从父左侧发出
    if (cX + cW < pX) {
      x1 = pX;
    }
    return { x1, y1, x2, y2 };
  }

  // 针对非提示词节点 -> AI图片节点的 Reference image 插座对齐
  if (child.taskData?.node_type === 'ai_image' && parent.taskData?.node_type !== 'prompt') {
    const x2 = cX - 15;
    const y2 = cY + 65; // 第二个插座居中位置
    let x1 = pX + pW;
    let y1 = pY + pH / 2;
    // 如果父是 AI图片 / AI视频生成节点，起点对齐到右侧 Output 插口中心
    if (parent.taskData?.node_type === 'ai_image' || parent.taskData?.node_type === 'ai_video') {
      x1 = pX + pW + 15;
      y1 = pY + 31;
    } else if (parent.taskData?.node_type === 'preview') {
      x1 = pX + pW + 15;
      y1 = pY + 29;
    }
    // 如果子在父左侧，起点自适应从父左侧发出
    if (cX + cW < pX) {
      x1 = pX;
    }
    return { x1, y1, x2, y2 };
  }

  // 针对任何节点 -> 预览节点的特殊插口对齐 (连接到预览节点的 Input 插口)
  if (child.taskData?.node_type === 'preview') {
    const x2 = cX - 15;
    const y2 = cY + (child.height || 240) / 2;
    let x1 = pX + pW;
    let y1 = pY + pH / 2;
    // 如果父是 AI图片 / AI视频生成节点，起点对齐到右侧 Output 插口中心
    if (parent.taskData?.node_type === 'ai_image' || parent.taskData?.node_type === 'ai_video') {
      x1 = pX + pW + 15;
      y1 = pY + 31;
    } else if (parent.taskData?.node_type === 'preview') {
      x1 = pX + pW + 15;
      y1 = pY + 29;
    } else if (parent.taskData?.node_type === 'prompt') {
      x1 = pX + pW + 15;
      y1 = pY + 29;
    }
    // 如果子在父左侧，起点自适应从父左侧发出
    if (cX + cW < pX) {
      x1 = pX;
    }
    return { x1, y1, x2, y2 };
  }

  // 默认：从父节点右侧到子节点左侧
  let x1 = pX + pW;
  let y1 = pY + pH / 2;
  if (parent.taskData?.node_type === 'ai_image' || parent.taskData?.node_type === 'ai_video') {
    x1 = pX + pW + 15;
    y1 = pY + 31;
  } else if (parent.taskData?.node_type === 'preview') {
    x1 = pX + pW + 15;
    y1 = pY + 29;
  } else if (parent.taskData?.node_type === 'prompt') {
    x1 = pX + pW + 15;
    y1 = pY + 29;
  }
  let x2 = cX;
  let y2 = cY + cH / 2;

  // 判断子节点相对父节点的四象限位置以自适应调整锚点
  const hasSideSocket = ['prompt', 'ai_image', 'ai_video', 'preview'].includes(parent.taskData?.node_type || '');
  if (cX + cW < pX) {
    // 子在父左侧
    x1 = hasSideSocket ? x1 : pX;
    x2 = cX + cW;
  } else if (cY + cH < pY) {
    // 子在父上方
    if (!hasSideSocket) {
      x1 = pX + pW / 2;
      y1 = pY;
    }
    x2 = cX + cW / 2;
    y2 = cY + cH;
  } else if (pY + pH < cY) {
    // 子在父下方
    if (!hasSideSocket) {
      x1 = pX + pW / 2;
      y1 = pY + pH;
    }
    x2 = cX + cW / 2;
    y2 = cY;
  }

  return { x1, y1, x2, y2 };
};

const InfiniteCanvas: React.FC<InfiniteCanvasProps> = React.memo(({ isMobile = false }) => {
  const {
    canvasTransform, canvasRef,
    activeTool, isSpaceDown, isDraggingCanvas,
    nodes, setSelectedNodeId,
    selectedNodeIds, setSelectedNodeIds,
    draggingNodeId,
    maxZIndex, setMaxZIndex,
    connectingSourceId, setConnectingSourceId,
    connectingMousePos, setConnectingMousePos,
    setNodes,
  } = useCanvas();
  const { loading, currentModel, setIsGenLogVisible, isGenLogPinned, saveCanvasState, advancedNodesConfig, autoDisplayAssetDetails, autoDisplayModelSelector, openModelSelectorForNode } = usePlayground();
  const { themeMode } = useThemeStore();
  const _isLight = themeMode === 'light';
  const particlesRef = React.useRef<CanvasParticlesHandle>(null);
  const mobileContainerRef = React.useRef<HTMLDivElement>(null);

  const [contextMenuPos, setContextMenuPos] = React.useState<{ clientX: number; clientY: number; canvasX: number; canvasY: number } | null>(null);

  React.useEffect(() => {
    const handleCloseMenu = () => {
      setContextMenuPos(null);
    };
    window.addEventListener('click', handleCloseMenu);
    return () => window.removeEventListener('click', handleCloseMenu);
  }, []);

  const handleContextMenu = (e: React.MouseEvent) => {
    if (!advancedNodesConfig?.enabled) return;

    // 防止右键点击节点、工具栏或其它功能卡片时也触发画布的自定义右键菜单
    const target = e.target as HTMLElement;
    const nodeEl = target.closest('[data-node-id]');
    if (nodeEl) {
      const nodeId = nodeEl.getAttribute('data-node-id');
      const foundNode = nodes.find(n => n.id === nodeId);
      if (!foundNode || foundNode.type !== 'section') {
        return;
      }
    }

    if (
      target.closest('.group-bounding-box') ||
      target.closest('.section-preview-box') ||
      target.closest('.marquee-box')
    ) {
      return;
    }

    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      const canvasX = (e.clientX - rect.left - canvasTransform.x) / canvasTransform.scale;
      const canvasY = (e.clientY - rect.top - canvasTransform.y) / canvasTransform.scale;
      setContextMenuPos({
        clientX: e.clientX,
        clientY: e.clientY,
        canvasX,
        canvasY
      });
    }
  };

  const handleAddStandaloneNode = (
    type: 'preview' | 'volc_enhance' | 'prompt' | 'ai_video' | 'ai_image' | 'agent',
    canvasX: number,
    canvasY: number
  ) => {
    if (type === 'volc_enhance') {
      const volcLimit = advancedNodesConfig?.volc_enhance_limit ?? 10;
      const previewLimit = advancedNodesConfig?.preview_limit ?? 10;
      const volcCount = nodes.filter(n => n.taskData?.node_type === 'volc_enhance').length;
      const previewCount = nodes.filter(n => n.taskData?.node_type === 'preview').length;
      if (volcCount >= volcLimit) {
        toast.warning(`该项目已达火山引擎画质增强节点上限 (最多${volcLimit}个)`);
        return;
      }
      if (previewCount >= previewLimit) {
        toast.warning(`该项目已达预览节点上限 (最多${previewLimit}个)，无法创建画质增强节点`);
        return;
      }
    } else {
      let limit = 10;
      switch (type) {
        case 'preview': limit = advancedNodesConfig?.preview_limit ?? 10; break;
        case 'prompt': limit = advancedNodesConfig?.prompt_limit ?? 10; break;
        case 'ai_video': limit = advancedNodesConfig?.ai_video_limit ?? 10; break;
        case 'ai_image': limit = advancedNodesConfig?.ai_image_limit ?? 10; break;
        case 'agent': limit = advancedNodesConfig?.agent_limit ?? 10; break;
      }
      const sameTypeCount = nodes.filter(n => n.taskData?.node_type === type).length;
      if (sameTypeCount >= limit) {
        const typeLabels: Record<string, string> = {
          preview: '预览',
          prompt: '提示词',
          ai_video: 'AI视频',
          ai_image: 'AI图片',
          agent: 'Agent智能体'
        };
        toast.warning(`该项目已达${typeLabels[type] || type}节点上限 (最多${limit}个)`);
        return;
      }
    }

    const newZIndex = maxZIndex + 1;
    setMaxZIndex(newZIndex);

    const newNodesToPush: any[] = [];

    if (type === 'preview') {
      const newNode = {
        id: `node-${Date.now()}`,
        type: 'image',
        status: 'completed',
        resultData: { content: '[预览节点] 尚未关联素材' },
        x: canvasX,
        y: canvasY,
        width: 280,
        height: 200,
        zIndex: newZIndex,
        taskData: {
          node_type: 'preview'
        }
      };
      newNodesToPush.push(newNode);
    } else if (type === 'volc_enhance') {
      const volcNodeId = `node-${Date.now()}`;
      const volcNode = {
        id: volcNodeId,
        type: 'video',
        status: 'completed',
        resultData: { content: { video_url: '' } },
        x: canvasX,
        y: canvasY,
        width: 280,
        height: 240,
        zIndex: newZIndex,
        taskData: {
          node_type: 'volc_enhance',
          model: '火山画质增强 - 标准版',
          scene: 'AI 生成 (AIGC)',
          resolution: '保持原分辨率',
          fps: '保持原帧率'
        }
      };
      newNodesToPush.push(volcNode);

      const previewNodeId = `node-${Date.now() + 1}`;
      const previewNode = {
        id: previewNodeId,
        type: 'video',
        status: 'completed',
        resultData: { content: `[预览节点] 关联至素材: ${volcNodeId}` },
        x: canvasX + 280 + 40,
        y: canvasY,
        width: 280,
        height: 200,
        zIndex: newZIndex + 1,
        parentId: volcNodeId,
        taskData: {
          node_type: 'preview'
        }
      };
      newNodesToPush.push(previewNode);
    } else if (type === 'prompt') {
      const promptNode = {
        id: `node-${Date.now()}`,
        type: 'text',
        status: 'completed',
        resultData: { content: '' },
        x: canvasX,
        y: canvasY,
        width: 280,
        height: 180,
        zIndex: newZIndex,
        taskData: {
          node_type: 'prompt',
          prompt: '',
        }
      };
      newNodesToPush.push(promptNode);
    } else if (type === 'ai_video') {
      const videoNode = {
        id: `node-${Date.now()}`,
        type: 'video',
        status: 'completed',
        resultData: { content: { video_url: '' } },
        x: canvasX,
        y: canvasY,
        width: 480,
        height: 340,
        zIndex: newZIndex,
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
      const imageNode = {
        id: `node-${Date.now()}`,
        type: 'image',
        status: 'completed',
        resultData: { content: { image_url: '' } },
        x: canvasX,
        y: canvasY,
        width: 480,
        height: 340,
        zIndex: newZIndex,
        taskData: {
          node_type: 'ai_image',
          model: '',
          aspect_ratio: '16:9 宽屏宽幅',
          prompt: '',
        }
      };
      newNodesToPush.push(imageNode);
    } else if (type === 'agent') {
      const agentNode = {
        id: `node-${Date.now()}`,
        type: 'text',
        status: 'completed',
        resultData: { content: '' },
        x: canvasX,
        y: canvasY,
        width: 280,
        height: 250,
        zIndex: newZIndex,
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
    toast.success('节点已创建');
  };

  const [hoveredLinkId, setHoveredLinkId] = React.useState<string | null>(null);
  const [hoveredButtonLinkId, setHoveredButtonLinkId] = React.useState<string | null>(null);
  const hoverTimeoutRef = React.useRef<any>(null);

  const handleMouseEnterLink = React.useCallback((linkId: string) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setHoveredLinkId(linkId);
  }, []);

  const handleMouseLeaveLink = React.useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredLinkId(null);
    }, 200);
  }, []);

  React.useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  // 自动平滑滚动到最新内容
  useEffect(() => {
    if (isMobile && mobileContainerRef.current) {
      const container = mobileContainerRef.current;
      setTimeout(() => {
        container.scrollTo({
          top: container.scrollHeight,
          behavior: 'smooth'
        });
      }, 150);
    }
  }, [nodes, isMobile]);

  // 保持粒子背景与画布变换同步（解决按钮放大缩小不跟随问题）
  useEffect(() => {
    if (particlesRef.current) {
      particlesRef.current.updateTransform(canvasTransform.x, canvasTransform.y, canvasTransform.scale);
    }
  }, [canvasTransform]);

  const {
    handleWheel, handleCanvasMouseDown,
    handleCanvasMouseMove, handleCanvasMouseUp,
    handleNodeMouseDown, handleResizeStart, removeNode,
  } = useCanvasInteraction(particlesRef); // 将 particlesRef 传给 hook

  // 点击画布空白区域时取消节点选中并关闭面板
  const handleCanvasMouseDownWithDeselect = (e: React.MouseEvent) => {
    // 如果点击的不是节点区域，则取消选中
    // 如果点击的不是节点区域，且不是用选框工具拖拽，则取消选中
    const target = e.target as HTMLElement;
    if (!target.closest('[data-node-id]') && activeTool !== 'marquee') {
      if (!isGenLogPinned) {
        setSelectedNodeId(null);
        setSelectedNodeIds([]);
        setIsGenLogVisible(false);
      }
    }
    handleCanvasMouseDown(e);
  };

  // 全局 document 级 wheel 拦截（非 passive）
  // Mac 触控板双指缩放 = ctrlKey + wheel，必须在 document 级别 preventDefault 才能阻止浏览器原生缩放
  useEffect(() => {
    const nativeWheelHandler = (e: WheelEvent) => {
      const el = canvasRef.current;
      // 在 Playground 页面内，拦截缩放相关的修饰键 + 滚轮（防止触发浏览器缩放或前进后退）
      if (e.ctrlKey || e.altKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
      }

      // 判断事件目标是否在画布容器内
      if (el && el.contains(e.target as Node)) {
        e.preventDefault();
        handleWheel(e as any);
      }
    };

    document.addEventListener('wheel', nativeWheelHandler, { passive: false });
    return () => document.removeEventListener('wheel', nativeWheelHandler);
  }, [canvasRef, handleWheel]);

  // 切换工具时隐藏区块随动预览框
  useEffect(() => {
    if (activeTool !== 'section') {
      const previewEl = canvasRef.current?.querySelector('.section-preview-box') as HTMLElement | null;
      if (previewEl) {
        previewEl.style.display = 'none';
      }
    }
  }, [activeTool, canvasRef]);

  // 监听键盘 Backspace 和 Delete 键以删除选中节点
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInputActive = activeEl && (
        activeEl.tagName === 'INPUT' || 
        activeEl.tagName === 'TEXTAREA' || 
        activeEl.getAttribute('contenteditable') === 'true'
      );
      if (isInputActive) return;

      if ((e.key === 'Backspace' || e.key === 'Delete') && selectedNodeIds.length > 0) {
        e.preventDefault();
        removeNode(selectedNodeIds);
        setSelectedNodeIds([]);
        setSelectedNodeId(null);
        toast.success(`已删除 ${selectedNodeIds.length} 个节点`);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedNodeIds, removeNode, setSelectedNodeIds, setSelectedNodeId]);

  // --- 节点连接器拖拽连接逻辑 ---
  useEffect(() => {
    if (!connectingSourceId) return;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        // 转换屏幕坐标至画布坐标系
        const mouseX = (e.clientX - rect.left - canvasTransform.x) / canvasTransform.scale;
        const mouseY = (e.clientY - rect.top - canvasTransform.y) / canvasTransform.scale;
        setConnectingMousePos({ x: mouseX, y: mouseY });
      }
    };

    const handleGlobalMouseUp = async (e: MouseEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        // 使用 elementFromPoint 获取抬起鼠标时下方的 DOM 元素
        const targetElement = document.elementFromPoint(e.clientX, e.clientY);
        const targetNodeEl = targetElement?.closest('[data-node-id]');
        const targetNodeId = targetNodeEl?.getAttribute('data-node-id');
        const targetHandleEl = targetElement?.closest('[data-handle-id]');
        const targetHandleId = targetHandleEl?.getAttribute('data-handle-id');

        if (targetNodeId && targetNodeId !== connectingSourceId && targetNodeId !== 'group') {
          const targetNode = nodes.find(n => n.id === targetNodeId);
          const sourceNode = nodes.find(n => n.id === connectingSourceId);

          if (targetNode && sourceNode) {
            // 检查当前 parentId 是否有效（对应的父节点存在且未隐藏）
            const hasActiveParent = targetNode.parentId && (() => {
              const p = nodes.find(n => n.id === targetNode.parentId);
              return p && !p.isHidden;
            })();

            // 校验：目标必须为未绑定有效父节点的高级子节点
            const isTargetAvailableAdvanced =
              ['preview', 'volc_enhance', 'prompt', 'ai_video', 'ai_image', 'agent'].includes(targetNode.taskData?.node_type || '');

            if (isTargetAvailableAdvanced) {
              if (targetNode.taskData?.node_type === 'volc_enhance' && sourceNode.type === 'image') {
                toast.warning('火山画质增强仅支持视频素材！');
              } else {
                const isSeedance2Multi = (targetNode.taskData?.scheme_id === 'seedance2.0' || String(targetNode.taskData?.model).toLowerCase().includes('seedance')) && targetNode.taskData?.node_type === 'ai_video';
                if (!targetHandleId && hasActiveParent && !isSeedance2Multi) {
                  toast.warning('只能连接到没有父节点的高级处理节点！(或连接到指定插孔)');
                } else {
                  let connectionFailedReason = '';
                  const updatedNodes = nodes.map(n => {
                    if (n.id === targetNodeId) {
                      let updated = { ...n };
                      if (targetHandleId) {
                        updated.inputConnections = { ...(updated.inputConnections || {}), [targetHandleId]: connectingSourceId };
                        // 如果之前没有主父节点，顺带设置一下以保证树结构不断裂
                        if (!updated.parentId) {
                          updated.parentId = connectingSourceId;
                        }
                        // 同步更新 manualSocketCounts，保证刷新后插座可见
                        const prefix = targetHandleId.replace(/\s\d+$/, '');
                        const countMatch = targetHandleId.match(/\d+$/);
                        if (countMatch) {
                          const countNum = parseInt(countMatch[0], 10);
                          const currentCounts = updated.taskData?.manualSocketCounts || {};
                          updated.taskData = {
                            ...(updated.taskData || {}),
                            manualSocketCounts: {
                              ...currentCounts,
                              [prefix]: Math.max(currentCounts[prefix] || 1, countNum)
                            }
                          };
                        }
                      } else {
                        const isSeedance2 = updated.taskData?.scheme_id === 'seedance2.0' || String(updated.taskData?.model).toLowerCase().includes('seedance');
                        if (isSeedance2 && updated.taskData?.node_type === 'ai_video') {
                          let mediaType = sourceNode.type;
                          if (sourceNode.taskData?.node_type === 'preview') {
                            const findSrc = (currId: string | undefined): any => {
                              if (!currId) return null;
                              const p = nodes.find(n => n.id === currId);
                              if (!p || p.isHidden) return null;
                              if (p.type === 'video' || p.type === 'image' || p.type === 'audio') return p;
                              return findSrc(p.parentId);
                            };
                            const realSrc = findSrc(sourceNode.parentId);
                            if (realSrc) mediaType = realSrc.type;
                          }

                          if (mediaType === 'video') {
                            let slot = null;
                            for (let i = 1; i <= 3; i++) {
                              if (!updated.inputConnections?.[`Reference Videos ${i}`]) {
                                slot = `Reference Videos ${i}`;
                                break;
                              }
                            }
                            if (slot) {
                              updated.inputConnections = { ...(updated.inputConnections || {}), [slot]: connectingSourceId };
                              if (!updated.parentId) updated.parentId = connectingSourceId;
                              // 同步更新 manualSocketCounts
                              const prefix = slot.replace(/\s\d+$/, '');
                              const countNum = parseInt(slot.match(/\d+$/)?.[0] || '1', 10);
                              const currentCounts = updated.taskData?.manualSocketCounts || {};
                              updated.taskData = {
                                ...(updated.taskData || {}),
                                manualSocketCounts: {
                                  ...currentCounts,
                                  [prefix]: Math.max(currentCounts[prefix] || 1, countNum)
                                }
                              };
                            } else {
                              connectionFailedReason = 'Reference Videos 数量限制已满 (最多3个)！';
                            }
                          } else if (mediaType === 'audio') {
                            let slot = null;
                            for (let i = 1; i <= 3; i++) {
                              if (!updated.inputConnections?.[`Reference Audio ${i}`]) {
                                slot = `Reference Audio ${i}`;
                                break;
                              }
                            }
                            if (slot) {
                              updated.inputConnections = { ...(updated.inputConnections || {}), [slot]: connectingSourceId };
                              if (!updated.parentId) updated.parentId = connectingSourceId;
                              // 同步更新 manualSocketCounts
                              const prefix = slot.replace(/\s\d+$/, '');
                              const countNum = parseInt(slot.match(/\d+$/)?.[0] || '1', 10);
                              const currentCounts = updated.taskData?.manualSocketCounts || {};
                              updated.taskData = {
                                ...(updated.taskData || {}),
                                manualSocketCounts: {
                                  ...currentCounts,
                                  [prefix]: Math.max(currentCounts[prefix] || 1, countNum)
                                }
                              };
                            } else {
                              connectionFailedReason = 'Reference Audio 数量限制已满 (最多3个)！';
                            }
                          } else if (mediaType === 'image') {
                            let slot = null;
                            for (let i = 1; i <= 9; i++) {
                              if (!updated.inputConnections?.[`Reference Images ${i}`]) {
                                slot = `Reference Images ${i}`;
                                break;
                              }
                            }
                            if (slot) {
                              updated.inputConnections = { ...(updated.inputConnections || {}), [slot]: connectingSourceId };
                              if (!updated.parentId) updated.parentId = connectingSourceId;
                              // 同步更新 manualSocketCounts
                              const prefix = slot.replace(/\s\d+$/, '');
                              const countNum = parseInt(slot.match(/\d+$/)?.[0] || '1', 10);
                              const currentCounts = updated.taskData?.manualSocketCounts || {};
                              updated.taskData = {
                                ...(updated.taskData || {}),
                                manualSocketCounts: {
                                  ...currentCounts,
                                  [prefix]: Math.max(currentCounts[prefix] || 1, countNum)
                                }
                              };
                            } else {
                              connectionFailedReason = 'Reference Images 数量限制已满 (最多9个)！';
                            }
                          } else {
                            updated.parentId = connectingSourceId;
                          }
                        } else {
                          updated.parentId = connectingSourceId;
                        }
                      }
                      return updated;
                    }
                    return n;
                  });
                  setNodes(updatedNodes);
                  await saveCanvasState(updatedNodes);
                  toast.success('节点连接成功！');
                }
              }
            } else {
              toast.warning('只能连接到高级处理节点！');
            }
          }
        }
      }

      // 重置连接拖拽状态
      setConnectingSourceId(null);
      setConnectingMousePos(null);
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [connectingSourceId, canvasTransform, nodes, setNodes, saveCanvasState, setConnectingMousePos, setConnectingSourceId, canvasRef]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (isMobile) {
    return (
      <div
        ref={mobileContainerRef}
        style={{
          position: 'absolute',
          inset: 0,
          overflowY: 'auto',
          background: _isLight ? '#ffffff' : '#131314',
          padding: '80px 16px 240px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {nodes.filter(node => !node.isHidden).length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 1,
            minHeight: '60vh',
            textAlign: 'center',
            padding: '0 24px',
            color: _isLight ? '#3c4043' : '#e8eaed',
          }}>
            <div style={{
              width: 64,
              height: 64,
              borderRadius: '20px',
              background: _isLight ? 'linear-gradient(135deg, #e8f0fe, #d2e3fc)' : 'linear-gradient(135deg, #2d3038, #1a233a)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 24,
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            }}>
              <CompassOutlined style={{ fontSize: 32, color: '#1677ff' }} />
            </div>
            <h1 style={{
              fontSize: 24,
              fontWeight: 600,
              letterSpacing: '1px',
              margin: '0 0 12px 0',
              background: 'linear-gradient(135deg, #1677ff, #87d068)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              {currentModel ? currentModel.name : 'AI 智能多模态工坊'}
            </h1>
            <p style={{
              fontSize: 14,
              color: _isLight ? '#5f6368' : '#9aa0a6',
              maxWidth: 280,
              lineHeight: 1.6,
              margin: 0,
              fontWeight: 300,
            }}>
              {currentModel
                ? '在下方输入你的创意灵感，生成的精彩内容将以瀑布流形式流转呈现。'
                : '请先在下方点击“选择模型”或配置各项参数，开启你的首个创作吧！'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
            {nodes.filter(node => !node.isHidden).map(node => (
              <div key={node.id} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                
                {/* 1. 用户提示词气泡 */}
                {node.taskData?.prompt && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #a8c7fa, #7cacf8)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 11,
                        color: '#04285b',
                        fontWeight: 'bold',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
                      }}>
                        U
                      </div>
                      <span style={{ color: _isLight ? '#5f6368' : '#9aa0a6', fontSize: 12, fontWeight: 500 }}>
                        我
                      </span>
                    </div>
                    <div style={{
                      padding: '12px 16px',
                      borderRadius: '4px 16px 16px 16px',
                      background: _isLight ? '#f0f4f9' : '#1e1f20',
                      border: _isLight ? '1px solid rgba(0,0,0,0.04)' : '1px solid rgba(255,255,255,0.04)',
                      color: _isLight ? '#1f2937' : '#e3e3e3',
                      fontSize: 14,
                      lineHeight: 1.5,
                      maxWidth: '90%',
                      alignSelf: 'flex-start',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                      wordBreak: 'break-word',
                    }}>
                      {node.taskData.prompt}
                    </div>
                  </div>
                )}

                {/* 2. AI 成果卡片 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', paddingLeft: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, #a8fab4, #7cf8a1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 10,
                      color: '#045b1d',
                      fontWeight: 'bold',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
                    }}>
                      AI
                    </div>
                    <span style={{ color: '#1677ff', fontSize: 12, fontWeight: 500 }}>
                      {node.taskData?.model_name || currentModel?.name || 'AI 模型'}
                    </span>
                  </div>
                  <div style={{ width: '100%', maxWidth: '100%', overflow: 'visible' }}>
                    <CanvasNode
                      node={node}
                      isSelected={selectedNodeIds.includes(node.id)}
                      isDragging={false}
                      activeTool={activeTool}
                      onMouseDown={() => {}}
                      onRemove={removeNode}
                      onSelect={(id) => {
                        setSelectedNodeId(id);
                        const targetNode = nodes.find(n => n.id === id);
                        if (targetNode?.taskData?.node_type || targetNode?.type === 'section') {
                          setIsGenLogVisible(false);
                          if (
                            (targetNode?.taskData?.node_type === 'ai_video' || targetNode?.taskData?.node_type === 'ai_image') &&
                            !targetNode?.taskData?.modelMid
                          ) {
                            if (autoDisplayModelSelector) {
                              openModelSelectorForNode(id);
                            }
                          }
                        } else {
                          if (autoDisplayAssetDetails) {
                            setIsGenLogVisible(true);
                          }
                        }
                      }}
                      onResizeStart={handleResizeStart}
                      isMobile={true}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      ref={canvasRef}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={(e) => {
        e.preventDefault();
        try {
          const dataStr = e.dataTransfer.getData('application/json');
          if (!dataStr) return;
          const data = JSON.parse(dataStr);
          if (data.type === 'resource' && data.resource) {
            const instanceLimit = advancedNodesConfig?.instance_limit ?? 50;
            const instanceCount = nodes.filter(n => n.isInstance).length;
            if (instanceCount >= instanceLimit) {
              toast.warning(`该项目已达基础素材实例上限 (最多${instanceLimit}个)`);
              return;
            }

            const rect = canvasRef.current?.getBoundingClientRect();
            if (rect) {
              const canvasX = (e.clientX - rect.left - canvasTransform.x) / canvasTransform.scale;
              const canvasY = (e.clientY - rect.top - canvasTransform.y) / canvasTransform.scale;
              
              const newZIndex = maxZIndex + 1;
              setMaxZIndex(newZIndex);
              
              const res = data.resource;
              const newNode = {
                ...res,
                id: `asset-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                x: canvasX,
                y: canvasY,
                zIndex: newZIndex,
                isHidden: false,
                parentId: undefined,
                isInstance: true,
              };
              
              setNodes((prev: any) => {
                const next = [...prev, newNode];
                saveCanvasState(next);
                return next;
              });
              toast.success('已添加素材到画布');
            }
          }
        } catch (err) {
          console.error('Drop error:', err);
        }
      }}
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        cursor: activeTool === 'hand' || isSpaceDown ? (isDraggingCanvas ? 'grabbing' : 'grab') : (activeTool === 'section' ? 'crosshair' : 'default'),
        background: _isLight ? '#ffffff' : '#131314',
      }}
      onMouseDown={handleCanvasMouseDownWithDeselect}
      onMouseMove={handleCanvasMouseMove}
      onMouseUp={handleCanvasMouseUp}
      onContextMenu={handleContextMenu}
      onMouseLeave={() => {
        handleCanvasMouseUp();
        const previewEl = canvasRef.current?.querySelector('.section-preview-box') as HTMLElement | null;
        if (previewEl) {
          previewEl.style.display = 'none';
        }
      }}
    >
      {/* 动态粒子背景层 */}
      <CanvasParticles ref={particlesRef} />

      {/* 变换层 */}
      <div className="transform-layer" style={{
        position: 'absolute',
        transformOrigin: '0 0',
        transform: `translate(${canvasTransform.x}px, ${canvasTransform.y}px) scale(${canvasTransform.scale})`
      }}>
        {[
          ...nodes.filter(node => node.type === 'section' && !node.isHidden),
          ...nodes.filter(node => node.type !== 'section' && !node.isHidden)
        ].map(node => (
          <CanvasNode
            key={node.id}
            node={node}
            isSelected={selectedNodeIds.includes(node.id)}
            isDragging={draggingNodeId === node.id || (selectedNodeIds.includes(node.id) && selectedNodeIds.length > 1 && activeTool === 'pointer' && draggingNodeId === null /* wait, draggingNodeId is not set for group drag? we can just rely on useCanvasInteraction updating DOM */)}
            activeTool={activeTool}
            hideResizeHandles={selectedNodeIds.length > 1}
            onMouseDown={handleNodeMouseDown}
            onRemove={removeNode}
            onSelect={(id, e) => {
              const isMultiSelect = e ? (e.ctrlKey || e.metaKey) : false;
              if (isMultiSelect) {
                // 多选模式下由 handleNodeMouseDown 直接控制选中状态，在此拦截 click 时的退化
                return;
              }
              // 如果当前是多选状态，不因为简单的 onClick 就退化为单选
              if (selectedNodeIds.length <= 1) {
                setSelectedNodeId(id);
                setSelectedNodeIds([id]);
                const targetNode = nodes.find(n => n.id === id);
                if (targetNode?.taskData?.node_type || targetNode?.type === 'section') {
                  setIsGenLogVisible(false);
                  if (
                    (targetNode?.taskData?.node_type === 'ai_video' || targetNode?.taskData?.node_type === 'ai_image') &&
                    !targetNode?.taskData?.modelMid
                  ) {
                    if (autoDisplayModelSelector) {
                      openModelSelectorForNode(id);
                    }
                  }
                } else {
                  if (autoDisplayAssetDetails) {
                    setIsGenLogVisible(true);
                  }
                }
              }
            }}
            onResizeStart={handleResizeStart}
          />
        ))}

        {/* 动态绘制父子高级节点的连接线 */}
        {(() => {
          const allLinks: { parentId: string, childId: string, handleId?: string }[] = [];
          nodes.forEach(node => {
            if (node.isHidden || node.type === 'section') return;
            
            // Collect primary parent connection
            const parentValues = node.inputConnections ? Object.values(node.inputConnections) : [];
            if (node.parentId && !parentValues.includes(node.parentId)) {
              allLinks.push({ parentId: node.parentId, childId: node.id });
            }
            
            // Collect dynamic socket connections
            if (node.inputConnections) {
              Object.entries(node.inputConnections).forEach(([hId, pId]) => {
                allLinks.push({ parentId: pId, childId: node.id, handleId: hId });
              });
            }
          });

          if (allLinks.length === 0 && !(connectingSourceId && connectingMousePos)) return null;

          return (
            <>
              <svg
                style={{
                  position: 'absolute',
                  left: -10000,
                  top: -10000,
                  width: 30000,
                  height: 30000,
                  pointerEvents: 'none',
                  overflow: 'visible',
                  zIndex: 9,
                }}
              >
                {allLinks.map(({ parentId, childId, handleId }, index) => {
                  const parent = nodes.find(n => n.id === parentId);
                  const child = nodes.find(n => n.id === childId);
                  if (!parent || parent.isHidden || !child) return null;

                  const rawCoords = getLinkLineCoords(parent, child, handleId);
                  
                  // 由于 SVG 偏移了 left: -10000, top: -10000, 内部坐标需要在此基础上位移以获得正确对齐
                  const x1 = rawCoords.x1 + 10000;
                  const y1 = rawCoords.y1 + 10000;
                  const x2 = rawCoords.x2 + 10000;
                  const y2 = rawCoords.y2 + 10000;

                  // 绘制优雅的贝塞尔曲线
                  const isHorizontal = Math.abs(x2 - x1) > Math.abs(y2 - y1);
                  let pathData = '';
                  if (isHorizontal) {
                    const ctrlX = (x1 + x2) / 2;
                    pathData = `M ${x1} ${y1} C ${ctrlX} ${y1}, ${ctrlX} ${y2}, ${x2} ${y2}`;
                  } else {
                    const ctrlY = (y1 + y2) / 2;
                    pathData = `M ${x1} ${y1} C ${x1} ${ctrlY}, ${x2} ${ctrlY}, ${x2} ${y2}`;
                  }

                  let lineColor = _isLight ? '#cbd5e1' : '#ffffff';
                  if (handleId) {
                    if (handleId.includes('Prompt')) lineColor = '#38bdf8';
                    else if (handleId.includes('Start') || handleId.includes('End') || handleId.includes('Last') || handleId.includes('Reference Images')) lineColor = '#fbbf24';
                    else if (handleId.includes('Reference Videos')) lineColor = '#4ade80';
                    else if (handleId.includes('Reference Audio')) lineColor = '#f472b6';
                  } else {
                    const isPromptLink = parent.taskData?.node_type === 'prompt' && (child.taskData?.node_type === 'ai_image' || child.taskData?.node_type === 'ai_video');
                    const isPreviewLink = child.taskData?.node_type === 'preview';
                    const isRefImageLink = child.taskData?.node_type === 'ai_image' && parent.taskData?.node_type !== 'prompt';
                    
                    if (isPromptLink) {
                      lineColor = '#38bdf8';
                    } else if (parent.taskData?.node_type === 'preview') {
                      const getPreviewMediaType = (node: any, nodesList: any[]) => {
                        const findSrc = (curr: any): any => {
                          if (!curr) return null;
                          const p = curr.parentId ? nodesList.find(n => n.id === curr.parentId) : null;
                          if (!p || p.isHidden) return null;
                          if (p.taskData?.node_type === 'volc_enhance') return p;
                          if (p.type === 'video' || p.type === 'image' || p.type === 'audio') return p;
                          if (p.taskData?.node_type === 'preview') return findSrc(p);
                          return p;
                        };
                        const pNode = node.parentId ? nodesList.find(n => n.id === node.parentId) : null;
                        const sNode = pNode && !pNode.isHidden ? (findSrc(node) || pNode) : null;
                        return sNode ? sNode.type : 'image';
                      };
                      const mediaType = getPreviewMediaType(parent, nodes);
                      lineColor = mediaType === 'video' ? '#4ade80' : mediaType === 'audio' ? '#f472b6' : '#f59e0b';
                    } else if (isPreviewLink) {
                      lineColor = '#10b981';
                    } else if (isRefImageLink) {
                      lineColor = '#f59e0b';
                    } else {
                      lineColor = _isLight ? '#cbd5e1' : '#ffffff';
                    }
                  }

                  const lineOpacity = 0.95;
                  const linkId = `${parent.id}-${child.id}-${handleId || 'default'}`;

                  return (
                    <g key={`link-${linkId}-${index}`} style={{ opacity: lineOpacity }}>
                      {/* 视觉导线 */}
                      <path
                        data-link-id={linkId}
                        data-parent-id={parent.id}
                        data-child-id={child.id}
                        data-handle-id={handleId}
                        d={pathData}
                        fill="none"
                        stroke={lineColor}
                        strokeWidth="1.5"
                      />
                      {/* 宽的感应曲线，用于鼠标悬浮响应 */}
                      <path
                        data-link-id={linkId}
                        data-parent-id={parent.id}
                        data-child-id={child.id}
                        data-handle-id={handleId}
                        d={pathData}
                        fill="none"
                        stroke={lineColor}
                        strokeWidth="12"
                        strokeOpacity="0"
                        style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
                        onMouseEnter={() => handleMouseEnterLink(linkId)}
                        onMouseLeave={handleMouseLeaveLink}
                      />
                    </g>
                  );
                })}

                {/* 动态绘制拖动中的连接虚线 */}
                {connectingSourceId && connectingMousePos && (() => {
                  const sourceNode = nodes.find(n => n.id === connectingSourceId);
                  if (!sourceNode) return null;

                  const pX = sourceNode.x;
                  const pY = sourceNode.y;
                  const pW = sourceNode.taskData?.node_type === 'prompt' ? (sourceNode.width || 280) : (sourceNode.width || 320);
                  const pH = sourceNode.taskData?.node_type === 'prompt' ? (sourceNode.height || 180) : (sourceNode.height || 200);

                  let x1 = pX + pW + 10000;
                  let y1 = pY + pH / 2 + 10000;
                  if (sourceNode.taskData?.node_type === 'ai_image' || sourceNode.taskData?.node_type === 'ai_video') {
                    x1 = pX + pW + 15 + 10000;
                    y1 = pY + 31 + 10000;
                  } else if (sourceNode.taskData?.node_type === 'preview') {
                    x1 = pX + pW + 15 + 10000;
                    y1 = pY + 29 + 10000;
                  } else if (sourceNode.taskData?.node_type === 'prompt') {
                    x1 = pX + pW + 15 + 10000;
                    y1 = pY + 29 + 10000;
                  }

                  const x2 = connectingMousePos.x + 10000;
                  const y2 = connectingMousePos.y + 10000;

                  let dragLineColor = _isLight ? '#cbd5e1' : '#ffffff';
                  if (sourceNode.taskData?.node_type === 'prompt') dragLineColor = '#38bdf8';
                  else if (sourceNode.taskData?.node_type === 'ai_image') dragLineColor = '#f59e0b';
                  else if (sourceNode.taskData?.node_type === 'ai_video') dragLineColor = '#4ade80';
                  else if (sourceNode.type === 'audio') dragLineColor = '#f472b6';
                  else if (sourceNode.taskData?.node_type === 'preview') {
                    const getPreviewMediaType = (node: any, nodesList: any[]) => {
                      const findSrc = (curr: any): any => {
                        if (!curr) return null;
                        const p = curr.parentId ? nodesList.find(n => n.id === curr.parentId) : null;
                        if (!p || p.isHidden) return null;
                        if (p.taskData?.node_type === 'volc_enhance') return p;
                        if (p.type === 'video' || p.type === 'image' || p.type === 'audio') return p;
                        if (p.taskData?.node_type === 'preview') return findSrc(p);
                        return p;
                      };
                      const pNode = node.parentId ? nodesList.find(n => n.id === node.parentId) : null;
                      const sNode = pNode && !pNode.isHidden ? (findSrc(node) || pNode) : null;
                      return sNode ? sNode.type : 'image';
                    };
                    const mediaType = getPreviewMediaType(sourceNode, nodes);
                    dragLineColor = mediaType === 'video' ? '#4ade80' : mediaType === 'audio' ? '#f472b6' : '#f59e0b';
                  }

                  const isHorizontal = Math.abs(x2 - x1) > Math.abs(y2 - y1);
                  let pathData = '';
                  if (isHorizontal) {
                    const ctrlX = (x1 + x2) / 2;
                    pathData = `M ${x1} ${y1} C ${ctrlX} ${y1}, ${ctrlX} ${y2}, ${x2} ${y2}`;
                  } else {
                    const ctrlY = (y1 + y2) / 2;
                    pathData = `M ${x1} ${y1} C ${x1} ${ctrlY}, ${x2} ${ctrlY}, ${x2} ${y2}`;
                  }

                  return (
                    <g>
                      <path
                        d={pathData}
                        fill="none"
                        stroke={dragLineColor}
                        strokeWidth="1.5"
                        strokeDasharray="5 3"
                      />
                      <circle cx={x2} cy={y2} r="4" fill={dragLineColor} />
                    </g>
                  );
                })()}
              </svg>

              {/* 连线断开按钮层 */}
              {allLinks.map(({ parentId, childId, handleId }, index) => {
                const parent = nodes.find(n => n.id === parentId);
                const child = nodes.find(n => n.id === childId);
                if (!parent || parent.isHidden || !child) return null;

                const rawCoords = getLinkLineCoords(parent, child, handleId);
                const midX = (rawCoords.x1 + rawCoords.x2) / 2;
                const midY = (rawCoords.y1 + rawCoords.y2) / 2;
                const linkId = `${parent.id}-${child.id}-${handleId || 'default'}`;
                const isHovered = hoveredLinkId === linkId;
                const isButtonHovered = hoveredButtonLinkId === linkId;

                return (
                  <Tooltip title="断开连接" key={`disconnect-${linkId}-${index}`}>
                    <div
                      data-disconnect-id={linkId}
                      onClick={async (e) => {
                        e.stopPropagation();
                        const updatedNodes = nodes.map(n => {
                          if (n.id === child.id) {
                            let updated = { ...n };
                            if (handleId && updated.inputConnections) {
                              const newConns = { ...updated.inputConnections };
                              const disconnectedParentId = newConns[handleId];
                              delete newConns[handleId];
                              updated.inputConnections = newConns;
                              if (updated.parentId === disconnectedParentId) {
                                const hasOtherConnsToParent = Object.values(newConns).some(pid => pid === disconnectedParentId);
                                if (!hasOtherConnsToParent) {
                                  updated.parentId = undefined;
                                }
                              }
                            } else {
                              updated.parentId = undefined;
                            }
                            return updated;
                          }
                          return n;
                        });
                        setNodes(updatedNodes);
                        await saveCanvasState(updatedNodes);
                      }}
                      onMouseEnter={() => {
                        handleMouseEnterLink(linkId);
                        setHoveredButtonLinkId(linkId);
                      }}
                      onMouseLeave={() => {
                        handleMouseLeaveLink();
                        setHoveredButtonLinkId(null);
                      }}
                      style={{
                        position: 'absolute',
                        left: midX - 10,
                        top: midY - 10,
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        background: isButtonHovered ? '#ff7875' : '#ff4d4f',
                        border: '1px solid #fff',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        fontSize: 10,
                        fontWeight: 'bold',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                        zIndex: 2000,
                        transition: 'all 0.15s, opacity 0.2s',
                        pointerEvents: isHovered ? 'auto' : 'none',
                        opacity: isHovered ? 1 : 0,
                        transform: isButtonHovered ? 'scale(1.15)' : (isHovered ? 'scale(1)' : 'scale(0.8)'),
                      }}
                    >
                      ✕
                    </div>
                  </Tooltip>
                );
              })}
            </>
          );
        })()}

        {/* 组包围盒（多选时显示） */}
        {selectedNodeIds.length > 1 && (() => {
          const groupNodes = nodes.filter(n => selectedNodeIds.includes(n.id) && !n.isHidden);
          if (groupNodes.length === 0) return null;
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          groupNodes.forEach(n => {
            minX = Math.min(minX, n.x);
            minY = Math.min(minY, n.y);
            maxX = Math.max(maxX, n.x + n.width);
            maxY = Math.max(maxY, n.y + n.height);
          });
          const width = maxX - minX;
          const height = maxY - minY;
          return (
            <div
              className="group-bounding-box"
              data-node-id="group"
              style={{
                position: 'absolute',
                left: minX,
                top: minY,
                width,
                height,
                border: '1px dashed #1677ff',
                background: 'rgba(22, 119, 255, 0.05)',
                pointerEvents: 'none',
                zIndex: maxZIndex + 2,
              }}
            >
              {activeTool === 'pointer' && (
                <div 
                  style={{ pointerEvents: 'auto', width: '100%', height: '100%', position: 'relative', cursor: 'move' }}
                  onMouseDown={(e) => handleNodeMouseDown(e, 'group', minX, minY)}
                >
                  <ResizeHandle direction="nw" onMouseDown={(e) => handleResizeStart(e, 'group', 'nw')} />
                  <ResizeHandle direction="n" onMouseDown={(e) => handleResizeStart(e, 'group', 'n')} />
                  <ResizeHandle direction="ne" onMouseDown={(e) => handleResizeStart(e, 'group', 'ne')} />
                  <ResizeHandle direction="e" onMouseDown={(e) => handleResizeStart(e, 'group', 'e')} />
                  <ResizeHandle direction="se" onMouseDown={(e) => handleResizeStart(e, 'group', 'se')} />
                  <ResizeHandle direction="s" onMouseDown={(e) => handleResizeStart(e, 'group', 's')} />
                  <ResizeHandle direction="sw" onMouseDown={(e) => handleResizeStart(e, 'group', 'sw')} />
                  <ResizeHandle direction="w" onMouseDown={(e) => handleResizeStart(e, 'group', 'w')} />
                </div>
              )}
            </div>
          );
        })()}

        {/* 空画布引导 */}
        {nodes.filter(node => !node.isHidden).length === 0 && (
          <div style={{
            position: 'absolute', left: 0, top: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            width: window.innerWidth, height: window.innerHeight,
            pointerEvents: 'none', opacity: 0.8
          }}>
            <CompassOutlined style={{ fontSize: 64, color: _isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.03)', marginBottom: 24 }} />
            <Title level={1} style={{ color: _isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.15)', letterSpacing: '2px', margin: '0 0 16px 0', fontWeight: 600 }}>
              {currentModel ? currentModel.name : '无限创作空间'}
            </Title>
            <Text style={{ color: _isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.15)', fontSize: 16, maxWidth: 440, textAlign: 'center', lineHeight: 1.6, fontWeight: 300 }}>
              {currentModel
                ? '拖滑视图，无限蔓延。你可以在这里将所有的创意编织流转成多模态宇宙。'
                : '请在侧边栏选择模型体验，生成的内容将汇聚在无限画布中。'}
            </Text>
          </div>
        )}

        {/* 新建区块的随动预览框 */}
        {activeTool === 'section' && (
          <div
            className="section-preview-box"
            style={{
              position: 'absolute',
              display: 'none',
              width: 400,
              height: 300,
              border: '2px dashed #1677ff',
              background: _isLight ? 'rgba(22, 119, 255, 0.03)' : 'rgba(22, 119, 255, 0.06)',
              borderRadius: '0 8px 8px 8px',
              pointerEvents: 'none',
              zIndex: 10,
            }}
          >
            {/* Header Tab of Section Preview */}
            <div
              style={{
                position: 'absolute',
                top: -28,
                left: 0,
                height: 28,
                padding: '0 12px',
                background: '#1677ff',
                color: '#ffffff',
                borderTopLeftRadius: 6,
                borderTopRightRadius: 6,
                border: '1px solid #1677ff',
                borderBottom: 'none',
                fontSize: 12,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                userSelect: 'none',
              }}
            >
              新建区块
            </div>
          </div>
        )}
      </div>

      {/* 选框层：独立于 transform-layer，坐标系为外层容器 */}
      <div 
        className="marquee-box"
        style={{
          position: 'absolute',
          display: 'none',
          background: 'rgba(22, 119, 255, 0.2)',
          border: '1px solid #1677ff',
          pointerEvents: 'none',
          zIndex: 9999,
        }} 
      />

      {/* 画布自定义右键菜单 */}
      {contextMenuPos && (
        <div
          style={{
            position: 'fixed',
            left: contextMenuPos.clientX,
            top: contextMenuPos.clientY,
            zIndex: 9999,
            minWidth: 160,
            background: _isLight ? 'rgba(255, 255, 255, 0.85)' : 'rgba(20, 20, 22, 0.85)',
            backdropFilter: 'blur(30px) saturate(180%)',
            WebkitBackdropFilter: 'blur(30px) saturate(180%)',
            borderRadius: 16,
            border: _isLight ? '1px solid rgba(0, 0, 0, 0.08)' : '1px solid rgba(255, 255, 255, 0.08)',
            boxShadow: _isLight ? '0 10px 40px -10px rgba(0,0,0,0.1)' : '0 15px 50px -12px rgba(0,0,0,0.5)',
            padding: 6,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            animation: 'zoomMenuFadeIn 0.12s ease-out'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{
            padding: '4px 8px 6px 8px',
            fontSize: 11,
            fontWeight: 500,
            color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)',
            borderBottom: _isLight ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(255,255,255,0.06)',
            marginBottom: 4,
            userSelect: 'none'
          }}>
            新建高级节点
          </div>

          {/* AI 视频 */}
          {advancedNodesConfig?.ai_video_enabled !== false && (
            <div
              className={`pg-context-menu-item ${_isLight ? 'light' : 'dark'}`}
              onClick={() => {
                handleAddStandaloneNode('ai_video', contextMenuPos.canvasX, contextMenuPos.canvasY);
                setContextMenuPos(null);
              }}
            >
              <VideoIcon />
              <span>AI 视频生成</span>
            </div>
          )}

          {/* AI 图片 */}
          {advancedNodesConfig?.ai_image_enabled !== false && (
            <div
              className={`pg-context-menu-item ${_isLight ? 'light' : 'dark'}`}
              onClick={() => {
                handleAddStandaloneNode('ai_image', contextMenuPos.canvasX, contextMenuPos.canvasY);
                setContextMenuPos(null);
              }}
            >
              <ImageIcon />
              <span>AI 图像生成</span>
            </div>
          )}

          {/* 提示词优化 */}
          {advancedNodesConfig?.prompt_enabled !== false && (
            <div
              className={`pg-context-menu-item ${_isLight ? 'light' : 'dark'}`}
              onClick={() => {
                handleAddStandaloneNode('prompt', contextMenuPos.canvasX, contextMenuPos.canvasY);
                setContextMenuPos(null);
              }}
            >
              <SparklesIcon />
              <span>提示词优化</span>
            </div>
          )}

          {/* 智能 Agent */}
          {!!advancedNodesConfig?.agent_enabled && (
            <div
              className={`pg-context-menu-item ${_isLight ? 'light' : 'dark'}`}
              onClick={() => {
                handleAddStandaloneNode('agent', contextMenuPos.canvasX, contextMenuPos.canvasY);
                setContextMenuPos(null);
              }}
            >
              <BotIcon />
              <span>智能 Agent</span>
            </div>
          )}

          {/* 火山画质增强 */}
          {!!advancedNodesConfig?.volc_enhance_enabled && !!advancedNodesConfig?.volc_enhance_plugin_active && (
            <div
              className={`pg-context-menu-item ${_isLight ? 'light' : 'dark'}`}
              onClick={() => {
                handleAddStandaloneNode('volc_enhance', contextMenuPos.canvasX, contextMenuPos.canvasY);
                setContextMenuPos(null);
              }}
            >
              <ZapIcon />
              <span>火山画质增强</span>
            </div>
          )}

          {/* 预览节点 */}
          {advancedNodesConfig?.preview_enabled !== false && (
            <div
              className={`pg-context-menu-item ${_isLight ? 'light' : 'dark'}`}
              onClick={() => {
                handleAddStandaloneNode('preview', contextMenuPos.canvasX, contextMenuPos.canvasY);
                setContextMenuPos(null);
              }}
            >
              <EyeIcon />
              <span>预览节点</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

InfiniteCanvas.displayName = 'InfiniteCanvas';
export default InfiniteCanvas;
