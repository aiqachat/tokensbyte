/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 左侧浮动工具胶囊栏
 * 指针/抓手/画笔/重置视图等工具按钮
 */
import React, { useRef } from 'react';
import { Button, Tooltip, Modal, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import toast from './PlaygroundToast';
import { getSharedModalStyles } from '../utils/modalStyles';
import {
  EditOutlined, PictureOutlined, BgColorsOutlined,
  StarFilled, StarOutlined, DeleteOutlined, CloseOutlined,
  PlusOutlined
} from '@ant-design/icons';
import { useCanvas, usePlayground } from '../context/PlaygroundContext';
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
const WorkflowIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.9 }}><path d="M3 3h6v6H3z"/><path d="M15 3h6v6h-6z"/><path d="M15 15h6v6h-6z"/><path d="M9 6h6"/><path d="M6 9v12"/><path d="M6 21h9"/></svg>
);

const FloatingToolbar: React.FC = React.memo(() => {
  const { 
    activeTool, setActiveTool, canvasTransform, setCanvasTransform, 
    nodes, setNodes, maxZIndex, setMaxZIndex, setSettingsWidgetPos, setResourceWidgetPos,
    handleRearrange
  } = useCanvas();
  const { 
    isResourceWidgetVisible, setIsResourceWidgetVisible,
    isSettingsWidgetVisible, setIsSettingsWidgetVisible,
    currentModel, saveCanvasState,
    pageMode, advancedNodesConfig
  } = usePlayground();
  const { themeMode } = useThemeStore();
  
  const isNodeMode = pageMode === 'node';
  const tooltipPlacement = isNodeMode ? 'top' : 'left';
  const _isLight = themeMode === 'light';

  const handleAddStandaloneNode = (
    type: 'preview' | 'volc_enhance' | 'prompt' | 'ai_video' | 'ai_image' | 'agent'
  ) => {
    if (type === 'volc_enhance') {
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

    // Calculate center of screen in canvas coordinates
    const rect = document.body.getBoundingClientRect();
    const viewCenterX = rect.width / 2;
    const viewCenterY = rect.height / 2;
    const canvasX = (viewCenterX - canvasTransform.x) / canvasTransform.scale - 140;
    const canvasY = (viewCenterY - canvasTransform.y) / canvasTransform.scale - 100;

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
        width: 280,
        height: 250,
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
        width: 280,
        height: 250,
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
    toast.success('节点已成功添加到画布中央');
  };

  const addNodeMenuItems: MenuProps['items'] = [
    {
      key: 'title',
      label: <span style={{ fontSize: 11, color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)', fontWeight: 500 }}>选择创建高级节点</span>,
      disabled: true,
    },
    advancedNodesConfig?.ai_video_enabled !== false ? {
      key: 'ai_video',
      label: 'AI 视频生成',
      icon: <VideoIcon />,
    } : null,
    advancedNodesConfig?.ai_image_enabled !== false ? {
      key: 'ai_image',
      label: 'AI 图像生成',
      icon: <ImageIcon />,
    } : null,
    advancedNodesConfig?.prompt_enabled !== false ? {
      key: 'prompt',
      label: '提示词优化',
      icon: <SparklesIcon />,
    } : null,
    advancedNodesConfig?.agent_enabled ? {
      key: 'agent',
      label: '智能 Agent',
      icon: <BotIcon />,
    } : null,
    advancedNodesConfig?.volc_enhance_enabled && advancedNodesConfig?.volc_enhance_plugin_active ? {
      key: 'volc_enhance',
      label: '火山画质增强',
      icon: <ZapIcon />,
    } : null,
    advancedNodesConfig?.preview_enabled !== false ? {
      key: 'preview',
      label: '预览节点',
      icon: <EyeIcon />,
    } : null,
  ].filter(Boolean) as MenuProps['items'];

  const quickWorkflowMenuItems: MenuProps['items'] = [
    {
      key: 'title',
      label: <span style={{ fontSize: 11, color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)', fontWeight: 500 }}>选择快速创建工作流</span>,
      disabled: true,
    },
    {
      key: 'ai_video_flow',
      label: 'AI 视频生成工作流',
      icon: <VideoIcon />,
    },
    {
      key: 'ai_image_flow',
      label: 'AI 图片生成工作流',
      icon: <ImageIcon />,
    }
  ];

  const handleCreateWorkflow = (flowType: 'ai_video_flow' | 'ai_image_flow') => {
    const isVideo = flowType === 'ai_video_flow';

    // 检查节点上限限制
    const promptCount = nodes.filter(n => n.taskData?.node_type === 'prompt').length;
    const generatorCount = nodes.filter(n => n.taskData?.node_type === (isVideo ? 'ai_video' : 'ai_image')).length;
    const previewCount = nodes.filter(n => n.taskData?.node_type === 'preview').length;
    const sectionCount = nodes.filter(n => n.type === 'section').length;

    if (sectionCount >= 10) {
      toast.warning('该项目已达区块节点上限 (最多10个)');
      return;
    }
    if (promptCount >= 10) {
      toast.warning('该项目已达提示词节点上限 (最多10个)');
      return;
    }
    if (generatorCount >= 10) {
      toast.warning(`该项目已达${isVideo ? 'AI视频' : 'AI图片'}节点上限 (最多10个)`);
      return;
    }
    if (previewCount >= 10) {
      toast.warning('该项目已达预览节点上限 (最多10个)');
      return;
    }

    let newZ = maxZIndex + 1;
    
    // 计算视口中央坐标
    const rect = document.body.getBoundingClientRect();
    const viewCenterX = rect.width / 2;
    const viewCenterY = rect.height / 2;
    const canvasCenterX = (viewCenterX - canvasTransform.x) / canvasTransform.scale;
    const canvasCenterY = (viewCenterY - canvasTransform.y) / canvasTransform.scale;

    // 区块（Section）的尺寸与坐标
    const sectionW = 980;
    const sectionH = 340;
    const sectionX = canvasCenterX - sectionW / 2;
    const sectionY = canvasCenterY - sectionH / 2;

    // 碰撞检测与寻找空白区域位置
    const collides = (rA: { x: number, y: number, w: number, h: number }, rB: { x: number, y: number, w: number, h: number }) => {
      return (
        rA.x < rB.x + rB.w &&
        rA.x + rA.w > rB.x &&
        rA.y < rB.y + rB.h &&
        rA.y + rA.h > rB.y
      );
    };

    const hasCollision = (rx: number, ry: number) => {
      const rectA = { x: rx, y: ry, w: sectionW, h: sectionH };
      return nodes.some(n => {
        if (n.isHidden) return false;
        const nw = n.width || 320;
        const nh = n.height || 240;
        return collides(rectA, { x: n.x, y: n.y, w: nw, h: nh });
      });
    };

    let finalSectionX = sectionX;
    let finalSectionY = sectionY;

    if (hasCollision(finalSectionX, finalSectionY)) {
      // 搜寻步长：水平 1040 (Section 宽度 980 + 60 间隔)，垂直 400 (Section 高度 340 + 60 间隔)
      const stepX = 1040;
      const stepY = 400;
      let found = false;

      // 圈数螺旋检索 (层数从 1 到 10)
      for (let layer = 1; layer <= 10; layer++) {
        // 遍历八个方向
        const directions = [
          { dx: 1, dy: 0 },
          { dx: 0, dy: 1 },
          { dx: -1, dy: 0 },
          { dx: 0, dy: -1 },
          { dx: 1, dy: 1 },
          { dx: -1, dy: 1 },
          { dx: 1, dy: -1 },
          { dx: -1, dy: -1 }
        ];

        for (const dir of directions) {
          const testX = sectionX + dir.dx * layer * stepX;
          const testY = sectionY + dir.dy * layer * stepY;
          if (!hasCollision(testX, testY)) {
            finalSectionX = testX;
            finalSectionY = testY;
            found = true;
            break;
          }
        }
        if (found) break;
      }
    }

    const sectionId = `section-${Date.now()}`;
    const promptId = `node-${Date.now()}`;
    const generatorId = `node-${Date.now() + 1}`;
    const previewId = `node-${Date.now() + 2}`;

    // 1. 创建区块节点
    const sectionNode = {
      id: sectionId,
      type: 'section',
      status: 'completed',
      title: isVideo ? 'AI 视频生成工作流' : 'AI 图片生成工作流',
      x: finalSectionX,
      y: finalSectionY,
      width: sectionW,
      height: sectionH,
      zIndex: newZ,
      taskData: {},
      resultData: null,
      childrenNodeIds: [promptId, generatorId, previewId]
    };
    newZ++;

    // 2. 创建提示词节点
    const promptNode = {
      id: promptId,
      type: 'text',
      status: 'completed',
      resultData: { content: '' },
      x: finalSectionX + 30,
      y: finalSectionY + 60,
      width: 280,
      height: 180,
      zIndex: newZ,
      taskData: {
        node_type: 'prompt',
        prompt: '',
      }
    };
    newZ++;

    // 3. 创建生成器节点
    const generatorNode = isVideo ? {
      id: generatorId,
      type: 'video',
      status: 'completed',
      resultData: { content: { video_url: '' } },
      x: finalSectionX + 30 + 280 + 40,
      y: finalSectionY + 60,
      width: 280,
      height: 250,
      zIndex: newZ,
      parentId: promptId,
      taskData: {
        node_type: 'ai_video',
        model: '',
        duration: '5秒',
        motion: '中 (推荐)',
        prompt: '',
      }
    } : {
      id: generatorId,
      type: 'image',
      status: 'completed',
      resultData: { content: { image_url: '' } },
      x: finalSectionX + 30 + 280 + 40,
      y: finalSectionY + 60,
      width: 280,
      height: 250,
      zIndex: newZ,
      parentId: promptId,
      taskData: {
        node_type: 'ai_image',
        model: '',
        aspect_ratio: '16:9 宽屏宽幅',
        prompt: '',
      }
    };
    newZ++;

    // 4. 创建预览节点 (并关联生成器节点作为 parentId)
    const previewNode = {
      id: previewId,
      type: isVideo ? 'video' : 'image',
      status: 'completed',
      resultData: { content: `[预览节点] 关联至素材: ${generatorId}` },
      x: finalSectionX + 30 + 280 + 40 + 280 + 40,
      y: finalSectionY + 60,
      width: 280,
      height: 200,
      zIndex: newZ,
      parentId: generatorId,
      taskData: {
        node_type: 'preview'
      }
    };
    newZ++;

    setMaxZIndex(newZ);

    setNodes((prev: any) => {
      const next = [...prev, sectionNode, promptNode, generatorNode, previewNode];
      saveCanvasState(next);
      return next;
    });

    toast.success(`${isVideo ? 'AI视频' : 'AI图片'}工作流已快速部署至画布中央`);
  };

  const isChatMode = currentModel?.scheme_type === 'chat';

  const [isMobile, setIsMobile] = React.useState(window.innerWidth <= 768);
  const [isClearConfirmOpen, setIsClearConfirmOpen] = React.useState(false);
  React.useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInputActive = activeEl && (
        activeEl.tagName === 'INPUT' || 
        activeEl.tagName === 'TEXTAREA' || 
        activeEl.getAttribute('contenteditable') === 'true'
      );
      if (isInputActive) return;
      if (isChatMode) return;

      if (e.key.toLowerCase() === 'v') {
        setActiveTool('pointer');
      } else if (e.key.toLowerCase() === 'm') {
        setActiveTool('marquee');
      } else if (e.key.toLowerCase() === 's') {
        setActiveTool('section');
      } else if (e.key.toLowerCase() === 'h') {
        setActiveTool('hand');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isChatMode, setActiveTool]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 50 * 1024 * 1024) {
      toast.error(`${file.name} 大小超过 50MB，已跳过`);
      e.target.value = '';
      return;
    }

    const url = URL.createObjectURL(file);
    const isVideo = file.type.startsWith('video');
    const isAudio = file.type.startsWith('audio');
    const assetType = isVideo ? 'video' : isAudio ? 'audio' : 'image';

    // Calculate center of screen in canvas coordinates
    const rect = document.body.getBoundingClientRect();
    const viewCenterX = rect.width / 2;
    const viewCenterY = rect.height / 2;
    const nodeX = (viewCenterX - canvasTransform.x) / canvasTransform.scale;
    const nodeY = (viewCenterY - canvasTransform.y) / canvasTransform.scale;

    const newZIndex = maxZIndex + 1;
    setMaxZIndex(newZIndex);

    const newNode: any = {
      id: `local-asset-${Date.now()}-${Math.random()}`,
      type: assetType,
      status: 'completed',
      taskData: { 
        prompt: file.name,
        file_size: file.size,
        file_format: file.type || file.name.split('.').pop()?.toUpperCase() || '未知',
        created_at: new Date().toISOString()
      },
      resultData: assetType === 'image' 
        ? { data: [{ url }] } 
        : { content: { video_url: url } }, // works for both video and audio node content rendering
      x: nodeX - 160,
      y: nodeY - (assetType === 'audio' ? 40 : 160),
      width: 320,
      height: assetType === 'audio' ? 80 : 320,
      zIndex: newZIndex
    };

    setNodes(prev => [...prev, newNode]);
    toast.success('已插入本地素材');

    if (e.target) {
      e.target.value = '';
    }
  };

  const handleRearrangeClick = () => {
    handleRearrange();
  };

  const handleClearCanvas = () => {
    if (nodes.length === 0) {
      toast.info('当前画布已经是空的');
      return;
    }
    setIsClearConfirmOpen(true);
  };

  const executeClearCanvas = async () => {
    try {
      const nextNodes = nodes.filter(n => {
        // 区块节点直接物理删除
        if (n.type === 'section') {
          return false;
        }
        // 高级节点（预览、画质增强、提示词、AI视频、AI图片、智能体等）直接物理删除
        if (
          n.taskData?.node_type === 'preview' ||
          n.taskData?.node_type === 'volc_enhance' ||
          n.taskData?.node_type === 'prompt' ||
          n.taskData?.node_type === 'ai_video' ||
          n.taskData?.node_type === 'ai_image' ||
          n.taskData?.node_type === 'agent'
        ) {
          return false;
        }
        // 未完成的节点直接物理删除
        if (n.status !== 'completed') {
          return false;
        }
        return true;
      }).map(n => {
        // 素材节点设置为隐藏
        return { ...n, isHidden: true };
      });

      setNodes(nextNodes);
      await saveCanvasState(nextNodes);
      setIsClearConfirmOpen(false);
    } catch (e) {
      toast.error('清屏失败');
    }
  };

  return (
    <div style={{
      position: 'absolute',
      ...(isNodeMode
        ? { bottom: 24, left: '50%', transform: 'translateX(-50%)', top: 'auto', right: 'auto' }
        : { right: isMobile ? 12 : 24, top: '50%', transform: 'translateY(-50%)', bottom: 'auto', left: 'auto' }
      ),
      display: 'flex',
      flexDirection: isNodeMode ? 'row' : 'column',
      gap: isMobile ? 4 : 8,
      background: _isLight ? 'rgba(255,255,255,0.85)' : '#1e1f20', backdropFilter: 'blur(12px)',
      padding: isNodeMode ? '6px 10px' : (isMobile ? '8px 4px' : '10px 6px'),
      borderRadius: 32,
      border: _isLight ? '1px solid rgba(0,0,0,0.1)' : '1px solid #444746',
      boxShadow: _isLight ? '0 4px 12px rgba(0,0,0,0.08)' : '0 4px 6px rgba(0,0,0,0.3)',
      zIndex: 1000,
      transition: 'all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)'
    }} onWheel={(e) => e.stopPropagation()}>
      <Tooltip title="指针工具 (V)" placement={tooltipPlacement}>
        <Button
          shape="circle"
          type="text"
          onClick={() => setActiveTool('pointer')}
          disabled={isChatMode}
          icon={
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4l7.07 16.97 2.51-7.39 7.39-2.51L4 4z"/>
            </svg>
          }
          style={{
            width: isMobile ? 28 : 32, height: isMobile ? 28 : 32, minWidth: isMobile ? 28 : 32,
            background: activeTool === 'pointer' && !isChatMode ? (_isLight ? '#1f2937' : '#f3f4f6') : 'transparent',
            color: isChatMode ? (_isLight ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)') : (activeTool === 'pointer' ? (_isLight ? '#fff' : '#1f2937') : (_isLight ? '#333' : '#E3E3E3')),
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
        />
      </Tooltip>

      <Tooltip title="资源管理器" placement={tooltipPlacement}>
        <Button
          shape="circle"
          type="text"
          onClick={(e) => {
            if (!isResourceWidgetVisible) {
              const rect = e.currentTarget.getBoundingClientRect();
              const savedWidth = localStorage.getItem('pg-resource-widget-width');
              const widgetWidth = savedWidth ? parseInt(savedWidth, 10) : 320;
              const savedHeight = localStorage.getItem('pg-resource-widget-height');
              const widgetHeight = savedHeight ? parseInt(savedHeight, 10) : 600;

              // Calculate x to dock exactly to the left/top of the button
              const x = isNodeMode 
                ? Math.max(20, rect.left + rect.width / 2 - widgetWidth / 2)
                : Math.max(20, rect.left - widgetWidth - 8);
              const y = isNodeMode
                ? Math.max(20, rect.top - widgetHeight - 8)
                : Math.max(20, Math.min(window.innerHeight - widgetHeight - 20, rect.top + rect.height / 2 - widgetHeight / 2));
              
              setResourceWidgetPos({ x, y });
            }
            setIsResourceWidgetVisible(!isResourceWidgetVisible);
          }}
          icon={
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
          }
          style={{
            width: isMobile ? 28 : 32, height: isMobile ? 28 : 32, minWidth: isMobile ? 28 : 32,
            background: isResourceWidgetVisible ? (_isLight ? '#1f2937' : '#f3f4f6') : 'transparent',
            color: isResourceWidgetVisible ? (_isLight ? '#fff' : '#1f2937') : (_isLight ? '#333' : '#E3E3E3'),
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
        />
      </Tooltip>

      <Tooltip title="插入图片/视频/声音" placement={tooltipPlacement}>
        <Button shape="circle" type="text" icon={<PictureOutlined style={{ fontSize: 16 }} />}
          onClick={() => fileInputRef.current?.click()}
          disabled={isChatMode}
          style={{ 
            width: isMobile ? 28 : 32, height: isMobile ? 28 : 32, minWidth: isMobile ? 28 : 32, 
            color: isChatMode ? (_isLight ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)') : (_isLight ? '#333' : '#fff'), 
            display: 'flex', alignItems: 'center', justifyContent: 'center' 
          }}
        />
      </Tooltip>

      <Tooltip title="区块工具 (S)" placement={tooltipPlacement}>
        <Button shape="circle" type="text" 
          icon={
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18" />
            </svg>
          }
          onClick={() => setActiveTool('section')}
          disabled={isChatMode}
          style={{ 
            width: isMobile ? 28 : 32, height: isMobile ? 28 : 32, minWidth: isMobile ? 28 : 32, 
            background: activeTool === 'section' && !isChatMode ? (_isLight ? '#1f2937' : '#f3f4f6') : 'transparent',
            color: isChatMode ? (_isLight ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)') : (activeTool === 'section' ? (_isLight ? '#fff' : '#1f2937') : (_isLight ? '#333' : '#E3E3E3')), 
            display: 'flex', alignItems: 'center', justifyContent: 'center' 
          }}
        />
      </Tooltip>

      <Tooltip title="抓手工具 (H)" placement={tooltipPlacement}>
        <Button
          shape="circle"
          type="text"
          onClick={() => setActiveTool('hand')}
          disabled={isChatMode}
          icon={
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0" />
              <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2" />
              <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8" />
              <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
            </svg>
          }
          style={{
            width: isMobile ? 28 : 32, height: isMobile ? 28 : 32, minWidth: isMobile ? 28 : 32,
            background: activeTool === 'hand' && !isChatMode ? (_isLight ? '#1f2937' : '#f3f4f6') : 'transparent',
            color: isChatMode ? (_isLight ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)') : (activeTool === 'hand' ? (_isLight ? '#fff' : '#1f2937') : (_isLight ? '#333' : '#E3E3E3')),
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
        />
      </Tooltip>


      {isNodeMode ? (
        <div style={{ width: 1, height: 20, background: _isLight ? 'rgba(0,0,0,0.1)' : '#444746', margin: '0 8px', alignSelf: 'center' }} />
      ) : (
        <div style={{ height: 1, background: _isLight ? 'rgba(0,0,0,0.1)' : '#444746', margin: isMobile ? '2px 4px' : '4px 6px' }} />
      )}

      {isNodeMode && advancedNodesConfig?.enabled && (
        <>
          {/* 新建高级节点 */}
          <Dropdown
            menu={{ items: addNodeMenuItems, onClick: ({ key }) => handleAddStandaloneNode(key as any) }}
            trigger={['click']}
            placement="top"
            overlayClassName={`shadcn-dropdown ${_isLight ? 'light' : 'dark'}`}
          >
            <Tooltip title="新建高级节点" placement="top">
              <Button
                shape="circle"
                type="text"
                icon={<PlusOutlined style={{ fontSize: 16 }} />}
                style={{
                  width: isMobile ? 28 : 32,
                  height: isMobile ? 28 : 32,
                  minWidth: isMobile ? 28 : 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: _isLight ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.8)',
                  background: 'transparent',
                  alignSelf: 'center',
                  margin: '0 4px',
                  cursor: 'pointer',
                  border: 'none',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = _isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)';
                  e.currentTarget.style.color = _isLight ? '#000000' : '#ffffff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = _isLight ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.8)';
                }}
              />
            </Tooltip>
          </Dropdown>

          {/* 快速创建工作流 */}
          <Dropdown
            menu={{ items: quickWorkflowMenuItems, onClick: ({ key }) => handleCreateWorkflow(key as any) }}
            trigger={['click']}
            placement="top"
            overlayClassName={`shadcn-dropdown ${_isLight ? 'light' : 'dark'}`}
          >
            <Tooltip title="快速创建工作流" placement="top">
              <Button
                shape="circle"
                type="text"
                icon={<WorkflowIcon />}
                style={{
                  width: isMobile ? 28 : 32,
                  height: isMobile ? 28 : 32,
                  minWidth: isMobile ? 28 : 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: _isLight ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.8)',
                  background: 'transparent',
                  alignSelf: 'center',
                  margin: '0 4px',
                  cursor: 'pointer',
                  border: 'none',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = _isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)';
                  e.currentTarget.style.color = _isLight ? '#000000' : '#ffffff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = _isLight ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.8)';
                }}
              />
            </Tooltip>
          </Dropdown>

          <div style={{ width: 1, height: 20, background: _isLight ? 'rgba(0,0,0,0.1)' : '#444746', margin: '0 8px', alignSelf: 'center' }} />
        </>
      )}

      <Tooltip title="一键重排素材" placement={tooltipPlacement}>
        <Button shape="circle" type="text"
          onClick={handleRearrangeClick}
          disabled={isChatMode}
          icon={
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7"></rect>
              <rect x="14" y="3" width="7" height="7"></rect>
              <rect x="14" y="14" width="7" height="7"></rect>
              <rect x="3" y="14" width="7" height="7"></rect>
            </svg>
          }
          style={{ 
            width: isMobile ? 28 : 32, height: isMobile ? 28 : 32, minWidth: isMobile ? 28 : 32, 
            color: isChatMode ? (_isLight ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)') : (_isLight ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.8)'), 
            display: 'flex', alignItems: 'center', justifyContent: 'center' 
          }}
        />
      </Tooltip>


      <Tooltip title="一键清屏" placement={tooltipPlacement}>
        <Button shape="circle" type="text"
          onClick={handleClearCanvas}
          disabled={isChatMode}
          icon={<DeleteOutlined style={{ fontSize: 16 }} />}
          style={{ 
            width: isMobile ? 28 : 32, height: isMobile ? 28 : 32, minWidth: isMobile ? 28 : 32, 
            color: isChatMode ? (_isLight ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)') : (_isLight ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.8)'), 
            display: 'flex', alignItems: 'center', justifyContent: 'center' 
          }}
        />
      </Tooltip>


      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        onChange={handleFileChange}
        accept="image/*,video/*,audio/*"
      />

      <Modal
        open={isClearConfirmOpen}
        onCancel={() => setIsClearConfirmOpen(false)}
        footer={null}
        title={null}
        width={isMobile ? '85%' : 350}
        {...getSharedModalStyles(_isLight)}
        styles={{
          ...getSharedModalStyles(_isLight).styles,
          body: { padding: 0 }
        }}
        closeIcon={<CloseOutlined style={{ color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)' }} />}
      >
        <div style={{ padding: isMobile ? '20px 32px 16px 16px' : '24px 36px 20px 20px' }}>
          <h2 style={{ fontSize: 16, margin: '0 0 8px', color: _isLight ? '#1f2937' : '#E8EAED', fontWeight: 600 }}>确认清屏？</h2>
          <div style={{ color: _isLight ? '#4b5563' : '#c7c7c7', fontSize: 13, lineHeight: '1.5', marginBottom: 18 }}>
            已生成的素材节点将隐藏，可在资源管理器中恢复显示；高级节点及未完成节点将被直接物理删除。
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <Button
              onClick={() => setIsClearConfirmOpen(false)}
              style={{
                background: _isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.08)',
                color: _isLight ? '#555' : '#E8EAED',
                border: 'none',
                borderRadius: 6,
                fontWeight: 500,
                padding: '2px 14px',
                height: 28,
                fontSize: 12
              }}
            >
              取消
            </Button>
            <Button
              onClick={executeClearCanvas}
              style={{
                background: '#ff4d4f',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                fontWeight: 500,
                padding: '2px 14px',
                height: 28,
                fontSize: 12
              }}
            >
              确认清屏
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
});

FloatingToolbar.displayName = 'FloatingToolbar';
export default FloatingToolbar;
