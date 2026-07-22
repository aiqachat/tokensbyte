/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 画布交互 Hook（高性能版）
 * 
 * 核心优化：所有拖拽操作（画布平移、节点拖拽、节点缩放）使用 useRef 存储中间值，
 * 通过 requestAnimationFrame 批量更新 DOM，仅在 mouseup 时提交最终状态到 React。
 * 
 * 这样每次 mousemove 不再触发 React re-render，实现 60fps 流畅拖拽。
 */
import { useCallback, useRef, useEffect } from 'react';
import toast from '../components/PlaygroundToast';
import { useCanvas, usePlayground } from '../context/PlaygroundContext';
import type { CanvasTransform, CanvasNode } from '../types';
import type { CanvasParticlesHandle } from '../components/CanvasParticles';
import type { ResizeDirection } from '../components/nodes/ResizeHandle';

/**
 * 重新计算所有 Section 节点的子节点包含关系 (中心点碰撞检测)
 */
const recalculateSectionChildren = (allNodes: CanvasNode[]): CanvasNode[] => {
  const sections = allNodes.filter(n => n.type === 'section' && !n.isHidden);
  const aiNodes = allNodes.filter(n => n.type !== 'section' && !n.isHidden);

  const nodeToSectionMap = new Map<string, string>();
  const sortedSections = [...sections].sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0));

  aiNodes.forEach(node => {
    const nodeW = node.width || 320;
    const nodeH = node.height || 240;
    const centerX = node.x + nodeW / 2;
    const centerY = node.y + nodeH / 2;

    for (const section of sortedSections) {
      const secW = section.width || 400;
      const secH = section.height || 300;
      if (
        centerX >= section.x &&
        centerX <= section.x + secW &&
        centerY >= section.y &&
        centerY <= section.y + secH
      ) {
        nodeToSectionMap.set(node.id, section.id);
        break;
      }
    }
  });

  return allNodes.map(n => {
    if (n.type === 'section') {
      const childIds: string[] = [];
      nodeToSectionMap.forEach((secId, nodeId) => {
        if (secId === n.id) {
          childIds.push(nodeId);
        }
      });
      return { ...n, childrenNodeIds: childIds };
    }
    return n;
  });
};

/**
 * 模块级共享拖拽状态
 */
const sharedNodeDrag = {
  nodeId: null as string | null,
  offsetX: 0,
  offsetY: 0,
  groupNodes: [] as { id: string, offsetX: number, offsetY: number }[],
};

/** 节点缩放最小尺寸 */
const MIN_NODE_WIDTH = 120;
const MIN_NODE_HEIGHT = 80;

/** 提示词节点最大尺寸 */
const MAX_PROMPT_WIDTH = 480;
const MAX_PROMPT_HEIGHT = 360;

/** 模块级共享缩放状态 */
const sharedResizeDrag = {
  nodeId: null as string | null,
  direction: '' as ResizeDirection | '',
  startMouseX: 0,
  startMouseY: 0,
  startNodeX: 0,
  startNodeY: 0,
  startNodeW: 0,
  startNodeH: 0,
  groupStartNodes: [] as {id: string, x: number, y: number, w: number, h: number}[],
};

export const useCanvasInteraction = (particlesRef?: React.RefObject<CanvasParticlesHandle> | React.MutableRefObject<CanvasParticlesHandle | null>) => {
  const {
    canvasTransform, setCanvasTransform,
    activeTool, isSpaceDown,
    setIsDraggingCanvas,
    setDraggingNodeId,
    nodes, setNodes,
    maxZIndex, setMaxZIndex,
    canvasRef,
    selectedNodeIds, setSelectedNodeIds,
    setSelectedNodeId,
    setActiveTool,
  } = useCanvas();

  const { saveCanvasState } = usePlayground();

  // --- Ref-based 拖拽中间状态（不触发 React 渲染） ---
  const canvasDragRef = useRef({
    isDragging: false,
    startX: 0, startY: 0,
    startTransformX: 0, startTransformY: 0,
  });
  const rafRef = useRef<number>(0);
  const wheelTimeoutRef = useRef<number | null>(null);
  // 缓存最新的 canvasTransform，在闭包中使用
  const transformRef = useRef<CanvasTransform>(canvasTransform);
  transformRef.current = canvasTransform;

  const nodesRef = useRef(nodes);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  const updateConnectionLines = useCallback((nodeId: string) => {
    if (!canvasRef.current) return;
    const paths = canvasRef.current.querySelectorAll(
      `path[data-parent-id="${nodeId}"], path[data-child-id="${nodeId}"]`
    );
    if (paths.length === 0) return;

    const processedLinks = new Set<string>();

    const getNodeCurrentPos = (id: string, stateNode: any) => {
      const el = canvasRef.current?.querySelector(`[data-node-id="${id}"]`) as HTMLElement | null;
      const isPrompt = stateNode.taskData?.node_type === 'prompt';
      const defaultW = isPrompt ? 280 : 320;
      const defaultH = isPrompt ? 180 : 200;
      if (el) {
        const leftVal = parseFloat(el.style.left || '');
        const topVal = parseFloat(el.style.top || '');
        const widthVal = parseFloat(el.style.width || '');
        const heightVal = parseFloat(el.style.height || '');
        return {
          x: isNaN(leftVal) ? stateNode.x : leftVal,
          y: isNaN(topVal) ? stateNode.y : topVal,
          width: isNaN(widthVal) ? (stateNode.width || defaultW) : widthVal,
          height: isNaN(heightVal) ? (stateNode.height || defaultH) : heightVal,
        };
      }
      return {
        x: stateNode.x,
        y: stateNode.y,
        width: stateNode.width || defaultW,
        height: stateNode.height || defaultH,
      };
    };

    paths.forEach(p => {
      const parentId = p.getAttribute('data-parent-id');
      const childId = p.getAttribute('data-child-id');
      const handleId = p.getAttribute('data-handle-id') || undefined;
      if (!parentId || !childId) return;
      const linkKey = `${parentId}-${childId}-${handleId || 'default'}`;
      if (processedLinks.has(linkKey)) return;
      processedLinks.add(linkKey);

      const parentNode = nodesRef.current.find(n => n.id === parentId);
      const childNode = nodesRef.current.find(n => n.id === childId);
      if (!parentNode || !childNode) return;

      const parentPos = getNodeCurrentPos(parentId, parentNode);
      const childPos = getNodeCurrentPos(childId, childNode);

      const pX = parentPos.x;
      const pY = parentPos.y;
      const pW = parentPos.width;
      const pH = parentPos.height;

      const cX = childPos.x;
      const cY = childPos.y;
      const cW = childPos.width;
      const cH = childPos.height;

      const parentType = parentNode.taskData?.node_type;
      const childType = childNode.taskData?.node_type;

      let x1 = pX + pW;
      let y1 = pY + pH / 2;
      if (parentType === 'ai_image' || parentType === 'ai_video') {
        x1 = pX + pW + 15;
        y1 = pY + 31;
      } else if (parentType === 'preview') {
        x1 = pX + pW + 15;
        y1 = pY + 29;
      } else if (parentType === 'prompt') {
        x1 = pX + pW + 15;
        y1 = pY + 29;
      }

      let x2 = cX;
      let y2 = cY + cH / 2;

      const hasSideSocket = ['prompt', 'ai_image', 'ai_video', 'preview'].includes(parentType || '');

      if (handleId && childType === 'ai_video') {
        const isSeedance2 = childNode.taskData?.scheme_id === 'seedance2.0' || String(childNode.taskData?.model).toLowerCase().includes('seedance');
        let list: string[] = [];
        if (isSeedance2) {
          list = ['Prompt'];
          const highestImg = [1,2,3,4,5,6,7,8,9].reverse().find(i => childNode.inputConnections?.[`Reference Images ${i}`]) || 0;
          const manualImg = childNode.taskData?.manualSocketCounts?.['Reference Images'] || 1;
          const imgCount = Math.min(9, Math.max(manualImg, highestImg + 1));
          for(let i = 1; i <= imgCount; i++) list.push(`Reference Images ${i}`);
          
          const highestVid = [1,2,3].reverse().find(i => childNode.inputConnections?.[`Reference Videos ${i}`]) || 0;
          const manualVid = childNode.taskData?.manualSocketCounts?.['Reference Videos'] || 1;
          const vidCount = Math.min(3, Math.max(manualVid, highestVid + 1));
          for(let i = 1; i <= vidCount; i++) list.push(`Reference Videos ${i}`);

          const highestAud = [1,2,3].reverse().find(i => childNode.inputConnections?.[`Reference Audio ${i}`]) || 0;
          const manualAud = childNode.taskData?.manualSocketCounts?.['Reference Audio'] || 1;
          const audCount = Math.min(3, Math.max(manualAud, highestAud + 1));
          for(let i = 1; i <= audCount; i++) list.push(`Reference Audio ${i}`);
        } else {
          list = ['Prompt', 'Negative Prompt'];
        }
        let socketIndex = list.indexOf(handleId);
        if (socketIndex === -1) socketIndex = 0;
        
        x2 = cX - 15;
        y2 = cY + 34 + socketIndex * 26;
        if (cX + cW < pX) x1 = hasSideSocket ? x1 : pX;
      } else if (parentType === 'prompt' && (childType === 'ai_image' || childType === 'ai_video')) {
        x2 = cX - 15;
        y2 = cY + 31;
        if (cX + cW < pX) {
          x1 = hasSideSocket ? x1 : pX;
        }
      } else if (childType === 'ai_image' && parentType !== 'prompt') {
        x2 = cX - 15;
        y2 = cY + 65; // Reference image socket center
        if (cX + cW < pX) {
          x1 = hasSideSocket ? x1 : pX;
        }
      } else if (childType === 'preview') {
        x2 = cX - 15;
        y2 = cY + (childPos.height || 240) / 2;
        if (cX + cW < pX) {
          x1 = hasSideSocket ? x1 : pX;
        }
      } else {
        if (cX + cW < pX) {
          x1 = hasSideSocket ? x1 : pX;
          x2 = cX + cW;
        } else if (cY + cH < pY) {
          if (!hasSideSocket) {
            x1 = pX + pW / 2;
            y1 = pY;
          }
          x2 = cX + cW / 2;
          y2 = cY + cH;
        } else if (pY + pH < cY) {
          if (!hasSideSocket) {
            x1 = pX + pW / 2;
            y1 = pY + pH;
          }
          x2 = cX + cW / 2;
          y2 = cY;
        }
      }

      const visualX1 = x1 + 10000;
      const visualY1 = y1 + 10000;
      const visualX2 = x2 + 10000;
      const visualY2 = y2 + 10000;

      const isHorizontal = Math.abs(visualX2 - visualX1) > Math.abs(visualY2 - visualY1);
      let pathData = '';
      if (isHorizontal) {
        const ctrlX = (visualX1 + visualX2) / 2;
        pathData = `M ${visualX1} ${visualY1} C ${ctrlX} ${visualY1}, ${ctrlX} ${visualY2}, ${visualX2} ${visualY2}`;
      } else {
        const ctrlY = (visualY1 + visualY2) / 2;
        pathData = `M ${visualX1} ${visualY1} C ${visualX1} ${ctrlY}, ${visualX2} ${ctrlY}, ${visualX2} ${visualY2}`;
      }

      const currentLinkPaths = canvasRef.current?.querySelectorAll(`path[data-link-id="${linkKey}"]`);
      currentLinkPaths?.forEach(path => {
        path.setAttribute('d', pathData);
      });

      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;
      const btn = canvasRef.current?.querySelector(`[data-disconnect-id="${linkKey}"]`) as HTMLElement | null;
      if (btn) {
        btn.style.left = `${midX - 10}px`;
        btn.style.top = `${midY - 10}px`;
      }
    });
  }, [canvasRef]);

  const marqueeDragRef = useRef({
    isDragging: false,
    startX: 0, startY: 0,
    currentX: 0, currentY: 0,
  });

  /** 滚轮缩放与平移（兼容原生 WheelEvent 和 React.WheelEvent） */
  const handleWheel = useCallback((e: WheelEvent | React.WheelEvent) => {
    const ct = transformRef.current;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    // e.ctrlKey 表示触控板捏合 (Pinch) 或按住 Ctrl 滚轮
    // e.metaKey (Mac ⌘) 和 e.altKey 也常用于缩放
    if (e.ctrlKey || e.metaKey || e.altKey) {
      // 放大 / 缩小：使用指数级缩放以获得平滑体验
      let delta = 'deltaY' in e ? e.deltaY : 0;
      
      // 抹平不同输入设备的差异
      if ('deltaMode' in e && e.deltaMode === 1) { // Line mode
        delta *= 20;
      }
      
      // 针对 Mac 触控板 Pinch 手势（ctrlKey 为 true）大幅优化灵敏度
      // Pinch 的 delta 物理感更强，需要更灵敏的反馈
      const sensitivity = e.ctrlKey ? 0.04 : 0.01;
      const zoomFactor = Math.pow(1.1, -delta * sensitivity);
      let newScale = ct.scale * zoomFactor;
      
      // 限制缩放范围：0.05x 到 5x
      newScale = Math.min(Math.max(0.05, newScale), 5);
      
      if (newScale === ct.scale) return;

      // 计算鼠标相对于画布的位置
      const pointerX = e.clientX - rect.left;
      const pointerY = e.clientY - rect.top;
      
      // 以鼠标位置为中心计算新的平移量
      const ratio = newScale / ct.scale;
      const newX = pointerX - (pointerX - ct.x) * ratio;
      const newY = pointerY - (pointerY - ct.y) * ratio;
      
      // 性能优化：直接更新 DOM
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const transformLayer = canvasRef.current?.querySelector('.transform-layer') as HTMLElement | null;
        if (transformLayer) {
          transformLayer.style.transform = `translate(${newX}px, ${newY}px) scale(${newScale})`;
        }
        if (canvasRef.current) {
          // 更新网格背景
          canvasRef.current.style.backgroundPosition = `${newX}px ${newY}px`;
        }
        // 同步更新粒子背景
        if (particlesRef?.current) {
          particlesRef.current.updateTransform(newX, newY, newScale);
        }
      });

      // 更新引用缓存，保证后续事件能读到最新值
      transformRef.current = { x: newX, y: newY, scale: newScale };

      // 防抖同步到 React State
      if (wheelTimeoutRef.current) window.clearTimeout(wheelTimeoutRef.current);
      wheelTimeoutRef.current = window.setTimeout(() => {
        setCanvasTransform({ x: transformRef.current.x, y: transformRef.current.y, scale: transformRef.current.scale });
      }, 100);
    } else {
      // 平移 (双指滑动 或 普通滚轮)
      // Mac 触控板的双指滑动 delta 已经非常丝滑，直接 1:1 映射
      const newX = ct.x - e.deltaX;
      const newY = ct.y - e.deltaY;
      
      // 使用 RAF 立即更新 DOM
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const transformLayer = canvasRef.current?.querySelector('.transform-layer') as HTMLElement | null;
        if (transformLayer) {
          transformLayer.style.transform = `translate(${newX}px, ${newY}px) scale(${ct.scale})`;
        }
        if (canvasRef.current) {
          canvasRef.current.style.backgroundPosition = `${newX}px ${newY}px`;
        }
        // 同步更新粒子背景
        if (particlesRef?.current) {
          particlesRef.current.updateTransform(newX, newY, ct.scale);
        }
      });
      
      transformRef.current = { ...ct, x: newX, y: newY };
      
      // 防抖同步到 React State
      if (wheelTimeoutRef.current) window.clearTimeout(wheelTimeoutRef.current);
      wheelTimeoutRef.current = window.setTimeout(() => {
        setCanvasTransform({ x: transformRef.current.x, y: transformRef.current.y, scale: transformRef.current.scale });
      }, 100);
    }
  }, [canvasRef, setCanvasTransform, particlesRef]);

  /** 画布鼠标按下 */
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    // 允许通过手形工具、空格键或鼠标中键(button 1)进行平移
    if (activeTool === 'hand' || isSpaceDown || e.button === 1) {
      canvasDragRef.current = {
        isDragging: true,
        startX: e.clientX,
        startY: e.clientY,
        startTransformX: transformRef.current.x,
        startTransformY: transformRef.current.y,
      };
      setIsDraggingCanvas(true);
      
      // 如果是中键，防止触发浏览器默认行为（如自动滚动）
      if (e.button === 1) {
        e.preventDefault();
      }
    } else if ((activeTool === 'marquee' || activeTool === 'pointer' || activeTool === 'section') && !isSpaceDown && e.button !== 1) {
      e.preventDefault();
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        marqueeDragRef.current = {
          isDragging: true,
          startX: e.clientX - rect.left,
          startY: e.clientY - rect.top,
          currentX: e.clientX - rect.left,
          currentY: e.clientY - rect.top,
        };
        if (!e.shiftKey) {
          setSelectedNodeIds([]);
          setSelectedNodeId(null);
        }
        
        cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
          const marqueeEl = canvasRef.current?.querySelector('.marquee-box') as HTMLElement | null;
          if (marqueeEl) {
            marqueeEl.style.display = 'block';
            marqueeEl.style.left = `${marqueeDragRef.current.startX}px`;
            marqueeEl.style.top = `${marqueeDragRef.current.startY}px`;
            marqueeEl.style.width = `0px`;
            marqueeEl.style.height = `0px`;
          }
        });
      }
    }
  }, [activeTool, isSpaceDown, setIsDraggingCanvas, setSelectedNodeIds, setSelectedNodeId, canvasRef]);

  /** 画布鼠标移动 — 全部通过 RAF + 直接 DOM 更新 */
  const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    const cd = canvasDragRef.current;
    const nd = sharedNodeDrag;

    if (cd.isDragging) {
      // 画布平移：直接计算新位置，通过 RAF 更新 transform 层 DOM
      const newX = cd.startTransformX + (e.clientX - cd.startX);
      const newY = cd.startTransformY + (e.clientY - cd.startY);

      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        // 直接操作画布内的 transform 层 DOM
        const transformLayer = canvasRef.current?.querySelector('.transform-layer') as HTMLElement | null;
        if (transformLayer) {
          transformLayer.style.transform = `translate(${newX}px, ${newY}px) scale(${transformRef.current.scale})`;
        }
        // 更新网格背景位置
        if (canvasRef.current) {
          canvasRef.current.style.backgroundPosition = `${newX}px ${newY}px`;
        }
        // 同步更新粒子背景
        if (particlesRef?.current) {
          particlesRef.current.updateTransform(newX, newY, transformRef.current.scale);
        }
      });

      // 缓存最新位置供 mouseup 使用
      transformRef.current = { ...transformRef.current, x: newX, y: newY };

    } else if (marqueeDragRef.current.isDragging) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        marqueeDragRef.current.currentX = e.clientX - rect.left;
        marqueeDragRef.current.currentY = e.clientY - rect.top;
        const { startX, startY, currentX, currentY } = marqueeDragRef.current;

        if (activeTool === 'section') {
          const ct = transformRef.current;
          const startX_canvas = (startX - ct.x) / ct.scale;
          const startY_canvas = (startY - ct.y) / ct.scale;
          const currentX_canvas = (marqueeDragRef.current.currentX - ct.x) / ct.scale;
          const currentY_canvas = (marqueeDragRef.current.currentY - ct.y) / ct.scale;

          const x = Math.min(startX_canvas, currentX_canvas);
          const y = Math.min(startY_canvas, currentY_canvas);
          const w = Math.abs(currentX_canvas - startX_canvas);
          const h = Math.abs(currentY_canvas - startY_canvas);

          cancelAnimationFrame(rafRef.current);
          rafRef.current = requestAnimationFrame(() => {
            const previewEl = canvasRef.current?.querySelector('.section-preview-box') as HTMLElement | null;
            if (previewEl) {
              previewEl.style.left = `${x}px`;
              previewEl.style.top = `${y}px`;
              previewEl.style.width = `${w}px`;
              previewEl.style.height = `${h}px`;
              previewEl.style.display = 'block';
            }
          });
        } else {
          const x = Math.min(startX, currentX);
          const y = Math.min(startY, currentY);
          const w = Math.abs(currentX - startX);
          const h = Math.abs(currentY - startY);

          cancelAnimationFrame(rafRef.current);
          rafRef.current = requestAnimationFrame(() => {
            const marqueeEl = canvasRef.current?.querySelector('.marquee-box') as HTMLElement | null;
            if (marqueeEl) {
              marqueeEl.style.display = 'block';
              marqueeEl.style.left = `${x}px`;
              marqueeEl.style.top = `${y}px`;
              marqueeEl.style.width = `${w}px`;
              marqueeEl.style.height = `${h}px`;
            }
          });
        }
      }
    } else if (sharedResizeDrag.nodeId) {
      // 节点缩放：直接操作节点 DOM 的 width/height/left/top
      const rd = sharedResizeDrag;
      const ct = transformRef.current;
      const deltaX = (e.clientX - rd.startMouseX) / ct.scale;
      const deltaY = (e.clientY - rd.startMouseY) / ct.scale;

      let newX = rd.startNodeX;
      let newY = rd.startNodeY;
      let newW = rd.startNodeW;
      let newH = rd.startNodeH;

      // 根据方向计算新的尺寸和位置
      const minW = rd.nodeId === 'group' ? 20 : MIN_NODE_WIDTH;
      const minH = rd.nodeId === 'group' ? 20 : MIN_NODE_HEIGHT;

      const targetNode = rd.nodeId !== 'group' ? nodes.find(n => n.id === rd.nodeId) : null;
      const isPrompt = targetNode?.taskData?.node_type === 'prompt';

      if (rd.direction.includes('e')) {
        const val = rd.startNodeW + deltaX;
        newW = Math.max(minW, isPrompt ? Math.min(val, MAX_PROMPT_WIDTH) : val);
      }
      if (rd.direction.includes('s')) {
        const val = rd.startNodeH + deltaY;
        newH = Math.max(minH, isPrompt ? Math.min(val, MAX_PROMPT_HEIGHT) : val);
      }
      if (rd.direction.includes('w')) {
        let dw = Math.min(deltaX, rd.startNodeW - minW);
        if (isPrompt) {
          dw = Math.max(dw, -(MAX_PROMPT_WIDTH - rd.startNodeW));
        }
        newW = rd.startNodeW - dw;
        newX = rd.startNodeX + dw;
      }
      if (rd.direction.includes('n')) {
        let dh = Math.min(deltaY, rd.startNodeH - minH);
        if (isPrompt) {
          dh = Math.max(dh, -(MAX_PROMPT_HEIGHT - rd.startNodeH));
        }
        newH = rd.startNodeH - dh;
        newY = rd.startNodeY + dh;
      }

      if (rd.nodeId !== 'group') {
        const targetNode = nodes.find(n => n.id === rd.nodeId);
        // 对素材节点强制锁定等比例缩放
        if (targetNode && (targetNode.type === 'image' || targetNode.type === 'video')) {
          const aspectRatio = rd.startNodeW / rd.startNodeH;
          
          if (rd.direction === 'e' || rd.direction === 'w') {
            newH = newW / aspectRatio;
          } else if (rd.direction === 'n' || rd.direction === 's') {
            newW = newH * aspectRatio;
          } else {
            const scaleW = newW / rd.startNodeW;
            const scaleH = newH / rd.startNodeH;
            if (Math.abs(scaleW - 1) > Math.abs(scaleH - 1)) {
              newH = newW / aspectRatio;
            } else {
              newW = newH * aspectRatio;
            }
          }
          
          // 若影响了 x 或 y，需要根据最终确定的宽高重新计算位置
          if (rd.direction.includes('w')) {
            newX = rd.startNodeX + rd.startNodeW - newW;
          }
          if (rd.direction.includes('n')) {
            newY = rd.startNodeY + rd.startNodeH - newH;
          }
        }
      }

      const scaleX = rd.startNodeW > 0 ? newW / rd.startNodeW : 1;
      const scaleY = rd.startNodeH > 0 ? newH / rd.startNodeH : 1;

      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        if (rd.nodeId === 'group') {
          const groupEl = canvasRef.current?.querySelector('.group-bounding-box') as HTMLElement | null;
          if (groupEl) {
            groupEl.style.left = `${newX}px`;
            groupEl.style.top = `${newY}px`;
            groupEl.style.width = `${newW}px`;
            groupEl.style.height = `${newH}px`;
          }
          rd.groupStartNodes.forEach(gn => {
            const nodeEl = canvasRef.current?.querySelector(`[data-node-id="${gn.id}"]`) as HTMLElement | null;
            if (nodeEl) {
              const nx = newX + (gn.x - rd.startNodeX) * scaleX;
              const ny = newY + (gn.y - rd.startNodeY) * scaleY;
              const nw = gn.w * scaleX;
              const nh = gn.h * scaleY;
              nodeEl.style.left = `${nx}px`;
              nodeEl.style.top = `${ny}px`;
              nodeEl.style.width = `${nw}px`;
              nodeEl.style.height = `${nh}px`;
            }
            updateConnectionLines(gn.id);
          });
        } else {
          const nodeEl = canvasRef.current?.querySelector(`[data-node-id="${rd.nodeId}"]`) as HTMLElement | null;
          if (nodeEl) {
            nodeEl.style.left = `${newX}px`;
            nodeEl.style.top = `${newY}px`;
            nodeEl.style.width = `${newW}px`;
            nodeEl.style.height = `${newH}px`;
          }
          if (rd.nodeId) updateConnectionLines(rd.nodeId);
        }
      });
    } else if (nd.groupNodes.length > 0) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const ct = transformRef.current;
        const pointerX = (e.clientX - rect.left - ct.x) / ct.scale;
        const pointerY = (e.clientY - rect.top - ct.y) / ct.scale;

        cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
          nd.groupNodes.forEach(g => {
            const nodeEl = canvasRef.current?.querySelector(`[data-node-id="${g.id}"]`) as HTMLElement | null;
            if (nodeEl) {
              nodeEl.style.left = `${pointerX - g.offsetX}px`;
              nodeEl.style.top = `${pointerY - g.offsetY}px`;
            }
            updateConnectionLines(g.id);
          });
        });
      }
    } else if (nd.nodeId) {
      // 节点拖拽：直接操作节点 DOM
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const ct = transformRef.current;
        const pointerX = (e.clientX - rect.left - ct.x) / ct.scale;
        const pointerY = (e.clientY - rect.top - ct.y) / ct.scale;
        const newNodeX = pointerX - nd.offsetX;
        const newNodeY = pointerY - nd.offsetY;

        cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
          const nodeEl = canvasRef.current?.querySelector(`[data-node-id="${nd.nodeId}"]`) as HTMLElement | null;
          if (nodeEl) {
            nodeEl.style.left = `${newNodeX}px`;
            nodeEl.style.top = `${newNodeY}px`;
          }
          if (nd.nodeId) updateConnectionLines(nd.nodeId);
        });
      }
    } else {
      // 没有任何拖拽发生，普通鼠标移动且为 section 工具时更新随动预览
      if (activeTool === 'section') {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
          const ct = transformRef.current;
          const mouseX = (e.clientX - rect.left - ct.x) / ct.scale;
          const mouseY = (e.clientY - rect.top - ct.y) / ct.scale;
          const x = mouseX - 200;
          const y = mouseY - 150;

          cancelAnimationFrame(rafRef.current);
          rafRef.current = requestAnimationFrame(() => {
            const previewEl = canvasRef.current?.querySelector('.section-preview-box') as HTMLElement | null;
            if (previewEl) {
              previewEl.style.left = `${x}px`;
              previewEl.style.top = `${y}px`;
              previewEl.style.width = '400px';
              previewEl.style.height = '300px';
              previewEl.style.display = 'block';
            }
          });
        }
      }
    }
  }, [canvasRef, activeTool]);

  /** 鼠标松开 — 将最终位置一次性提交到 React state */
  const handleCanvasMouseUp = useCallback(() => {
    const cd = canvasDragRef.current;
    const nd = sharedNodeDrag;

    if (cd.isDragging) {
      // 提交最终画布位置到 React state
      setCanvasTransform({
        x: transformRef.current.x,
        y: transformRef.current.y,
        scale: transformRef.current.scale,
      });
      cd.isDragging = false;
      setIsDraggingCanvas(false);
    }

    if (marqueeDragRef.current.isDragging) {
      marqueeDragRef.current.isDragging = false;
      
      const { startX, startY, currentX, currentY } = marqueeDragRef.current;
      const x = Math.min(startX, currentX);
      const y = Math.min(startY, currentY);
      const w = Math.abs(currentX - startX);
      const h = Math.abs(currentY - startY);

      // 隐藏选框
      const marqueeEl = canvasRef.current?.querySelector('.marquee-box') as HTMLElement | null;
      if (marqueeEl) {
        marqueeEl.style.display = 'none';
      }

      if (activeTool === 'section') {
        const currentSections = nodes.filter(n => n.type === 'section' && !n.isHidden);
        if (currentSections.length >= 10) {
          toast.warning('该项目已达区块节点上限 (最多10个)');
          setActiveTool('pointer');
          // 隐藏随动预览框
          const previewEl = canvasRef.current?.querySelector('.section-preview-box') as HTMLElement | null;
          if (previewEl) {
            previewEl.style.display = 'none';
          }
          return;
        }

        const ct = transformRef.current;
        const clickX = (x - ct.x) / ct.scale;
        const clickY = (y - ct.y) / ct.scale;

        let finalW = w / ct.scale;
        let finalH = h / ct.scale;
        let finalX = clickX;
        let finalY = clickY;

        // 如果拖动距离小于 20px，我们视为单纯的“点击”操作，直接生成 400x300 默认大小的区块
        if (w < 20 || h < 20) {
          finalW = 400;
          finalH = 300;
          finalX = clickX - 200;
          finalY = clickY - 150;
        }

        const newSection: CanvasNode = {
          id: `section-${Date.now()}`,
          type: 'section',
          status: 'completed',
          title: `Section ${nodes.filter(n => n.type === 'section').length + 1}`,
          x: finalX,
          y: finalY,
          width: finalW,
          height: finalH,
          zIndex: maxZIndex + 1,
          taskData: {},
          resultData: null,
          childrenNodeIds: []
        };

        setNodes(prev => {
          const next = recalculateSectionChildren([...prev, newSection]);
          saveCanvasState(next);
          return next;
        });

        setMaxZIndex(maxZIndex + 1);
        setActiveTool('pointer');

        // 隐藏随动预览框
        const previewEl = canvasRef.current?.querySelector('.section-preview-box') as HTMLElement | null;
        if (previewEl) {
          previewEl.style.display = 'none';
        }
        return;
      }

      // 计算碰撞
      if (w > 5 && h > 5) {
        const ct = transformRef.current;
        // 将选框坐标转换为画布内容坐标
        const contentBox = {
          x: (x - ct.x) / ct.scale,
          y: (y - ct.y) / ct.scale,
          w: w / ct.scale,
          h: h / ct.scale,
        };

        const newSelectedIds: string[] = [];
        nodes.forEach(n => {
          if (n.isHidden) return;
          // 矩形相交检测
          if (
            n.x < contentBox.x + contentBox.w &&
            n.x + n.width > contentBox.x &&
            n.y < contentBox.y + contentBox.h &&
            n.y + n.height > contentBox.y
          ) {
            newSelectedIds.push(n.id);
          }
        });

        // 取旧的选择 + 新选择 (为了支持 shift 多选可以未来扩展)
        setSelectedNodeIds(prev => {
          // 如果没有按 shift, 就是 newSelectedIds
          // 这里简化处理，直接覆盖
          return newSelectedIds;
        });
        if (newSelectedIds.length === 1) {
          setSelectedNodeId(newSelectedIds[0]);
        } else {
          setSelectedNodeId(null); // 多选时隐藏详情面板
        }
        
        // 如果成功选中了内容，自动切换回指针工具，方便后续拖拽和缩放
        if (newSelectedIds.length > 0) {
          setActiveTool('pointer');
        }
      }
    }

    if (sharedResizeDrag.nodeId) {
      // 提交最终缩放结果到 React state
      const rd = sharedResizeDrag;
      if (rd.nodeId === 'group') {
        setNodes(prev => {
          const next = prev.map(n => {
            const g = rd.groupStartNodes.find(gn => gn.id === n.id);
            if (g) {
              const nodeEl = canvasRef.current?.querySelector(`[data-node-id="${n.id}"]`) as HTMLElement | null;
              if (nodeEl) {
                return { 
                  ...n, 
                  x: parseFloat(nodeEl.style.left), 
                  y: parseFloat(nodeEl.style.top),
                  width: parseFloat(nodeEl.style.width),
                  height: parseFloat(nodeEl.style.height),
                };
              }
            }
            return n;
          });
          const withRecalc = recalculateSectionChildren(next);
          saveCanvasState(withRecalc);
          return withRecalc;
        });
      } else {
        const nodeEl = canvasRef.current?.querySelector(`[data-node-id="${rd.nodeId}"]`) as HTMLElement | null;
        if (nodeEl) {
          const finalX = parseFloat(nodeEl.style.left);
          const finalY = parseFloat(nodeEl.style.top);
          const finalW = parseFloat(nodeEl.style.width);
          const finalH = parseFloat(nodeEl.style.height);
          const resizedId = rd.nodeId;
          setNodes(prev => {
            const next = prev.map(n =>
              n.id === resizedId ? { ...n, x: finalX, y: finalY, width: finalW, height: finalH } : n
            );
            const withRecalc = recalculateSectionChildren(next);
            saveCanvasState(withRecalc);
            return withRecalc;
          });
        }
      }
      rd.nodeId = null;
      rd.direction = '';
    }

    if (nd.groupNodes.length > 0) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        setNodes(prev => {
          const next = prev.map(n => {
            const g = nd.groupNodes.find(gn => gn.id === n.id);
            if (g) {
              const nodeEl = canvasRef.current?.querySelector(`[data-node-id="${n.id}"]`) as HTMLElement | null;
              if (nodeEl) {
                return { ...n, x: parseFloat(nodeEl.style.left), y: parseFloat(nodeEl.style.top) };
              }
            }
            return n;
          });
          const withRecalc = recalculateSectionChildren(next);
          saveCanvasState(withRecalc);
          return withRecalc;
        });
      }
      nd.groupNodes = [];
      setDraggingNodeId(null);
    }

    if (nd.nodeId) {
      // 提交最终节点位置到 React state
      const rect = canvasRef.current?.getBoundingClientRect();
      const nodeEl = canvasRef.current?.querySelector(`[data-node-id="${nd.nodeId}"]`) as HTMLElement | null;
      if (nodeEl && rect) {
        const finalX = parseFloat(nodeEl.style.left);
        const finalY = parseFloat(nodeEl.style.top);
        const draggedId = nd.nodeId;
        setNodes(prev => {
          const next = prev.map(n =>
            n.id === draggedId ? { ...n, x: finalX, y: finalY } : n
          );
          const withRecalc = recalculateSectionChildren(next);
          saveCanvasState(withRecalc);
          return withRecalc;
        });
      }
      nd.nodeId = null;
      setDraggingNodeId(null);
    }

    cancelAnimationFrame(rafRef.current);
  }, [canvasRef, setCanvasTransform, setIsDraggingCanvas, setNodes, setDraggingNodeId, setActiveTool, setSelectedNodeIds, setSelectedNodeId, nodes, maxZIndex, saveCanvasState, activeTool]);

  /** 节点鼠标按下（启动节点拖拽并置顶） */
  const handleNodeMouseDown = useCallback((e: React.MouseEvent, nodeId: string, nodeX: number, nodeY: number) => {
    if (activeTool === 'pointer') {
      e.stopPropagation();
      setDraggingNodeId(nodeId);

      const ct = transformRef.current;
      const startX = (e.clientX - ct.x) / ct.scale;
      const startY = (e.clientY - ct.y) / ct.scale;

      const targetNode = nodes.find(n => n.id === nodeId);
      const isSection = targetNode?.type === 'section';

      if (isSection) {
        const newZ = maxZIndex + 1;
        setMaxZIndex(newZ);
        setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, zIndex: newZ } : n));

        const childIds = targetNode.childrenNodeIds || [];
        const dragGroupIds = [nodeId, ...childIds];
        sharedNodeDrag.groupNodes = dragGroupIds.map(id => {
          const n = nodes.find(n => n.id === id);
          return {
            id,
            offsetX: startX - (n?.x || 0),
            offsetY: startY - (n?.y || 0)
          };
        });
        sharedNodeDrag.nodeId = null;
      } else if (nodeId === 'group' || (selectedNodeIds.includes(nodeId) && selectedNodeIds.length > 1)) {
        // Dragging a group
        let minX = Infinity, minY = Infinity;
        selectedNodeIds.forEach(id => {
          const n = nodes.find(node => node.id === id);
          if (n) {
            minX = Math.min(minX, n.x);
            minY = Math.min(minY, n.y);
          }
        });

        const dragGroup = selectedNodeIds.map(id => {
          const n = nodes.find(n => n.id === id);
          return {
            id,
            offsetX: startX - (n?.x || 0),
            offsetY: startY - (n?.y || 0)
          };
        });

        // Add the group box itself so it moves with the selection during drag
        if (minX !== Infinity && minY !== Infinity) {
          dragGroup.push({
            id: 'group',
            offsetX: startX - minX,
            offsetY: startY - minY
          });
        }

        sharedNodeDrag.groupNodes = dragGroup;
        sharedNodeDrag.nodeId = null;
      } else {
        // Dragging a single node (or multi-selecting via ctrl/meta key)
        const newZ = maxZIndex + 1;
        setMaxZIndex(newZ);
        setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, zIndex: newZ } : n));

        const isMultiSelect = e.ctrlKey || e.metaKey;

        if (isMultiSelect) {
          const isSelected = selectedNodeIds.includes(nodeId);
          const nextSelectedIds = isSelected 
            ? selectedNodeIds.filter(id => id !== nodeId)
            : [...selectedNodeIds, nodeId];

          if (nextSelectedIds.length > 1) {
            // 如果多选后有多个，按拖拽组处理
            let minX = Infinity, minY = Infinity;
            nextSelectedIds.forEach(id => {
              const n = nodes.find(node => node.id === id);
              if (n) {
                minX = Math.min(minX, n.x);
                minY = Math.min(minY, n.y);
              }
            });

            const dragGroup = nextSelectedIds.map(id => {
              const n = nodes.find(node => node.id === id);
              return {
                id,
                offsetX: startX - (n?.x || 0),
                offsetY: startY - (n?.y || 0)
              };
            });

            if (minX !== Infinity && minY !== Infinity) {
              dragGroup.push({
                id: 'group',
                offsetX: startX - minX,
                offsetY: startY - minY
              });
            }

            sharedNodeDrag.groupNodes = dragGroup;
            sharedNodeDrag.nodeId = null;
          } else {
            // 如果多选后只剩 1 个或没有，按单节点处理
            sharedNodeDrag.nodeId = nextSelectedIds[0] || null;
            sharedNodeDrag.offsetX = startX - nodeX;
            sharedNodeDrag.offsetY = startY - nodeY;
            sharedNodeDrag.groupNodes = [];
          }

          setSelectedNodeIds(nextSelectedIds);
          if (nextSelectedIds.length === 1) {
            setSelectedNodeId(nextSelectedIds[0]);
          } else {
            setSelectedNodeId(null);
          }
        } else {
          // 默认单选模式
          sharedNodeDrag.nodeId = nodeId;
          sharedNodeDrag.offsetX = startX - nodeX;
          sharedNodeDrag.offsetY = startY - nodeY;
          sharedNodeDrag.groupNodes = [];

          // If clicking a new single node, select it
          if (!selectedNodeIds.includes(nodeId) || selectedNodeIds.length > 1) {
            setSelectedNodeIds([nodeId]);
            setSelectedNodeId(nodeId);
          }
        }
      }
    }
  }, [activeTool, maxZIndex, setDraggingNodeId, setMaxZIndex, setNodes, selectedNodeIds, nodes, setSelectedNodeIds, setSelectedNodeId]);

  /** 开始缩放节点 */
  const handleResizeStart = useCallback((e: React.MouseEvent, nodeId: string, direction: ResizeDirection) => {
    e.stopPropagation();
    e.preventDefault();
    sharedResizeDrag.direction = direction;
    sharedResizeDrag.startMouseX = e.clientX;
    sharedResizeDrag.startMouseY = e.clientY;

    if (nodeId === 'group') {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      const groupNodes = nodes.filter(n => selectedNodeIds.includes(n.id) && !n.isHidden);
      if (groupNodes.length === 0) return;
      groupNodes.forEach(n => {
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x + n.width);
        maxY = Math.max(maxY, n.y + n.height);
      });
      sharedResizeDrag.nodeId = 'group';
      sharedResizeDrag.startNodeX = minX;
      sharedResizeDrag.startNodeY = minY;
      sharedResizeDrag.startNodeW = maxX - minX;
      sharedResizeDrag.startNodeH = maxY - minY;
      sharedResizeDrag.groupStartNodes = groupNodes.map(n => ({ id: n.id, x: n.x, y: n.y, w: n.width, h: n.height }));
    } else {
      const targetNode = nodes.find(n => n.id === nodeId);
      if (!targetNode) return;
      sharedResizeDrag.nodeId = nodeId;
      sharedResizeDrag.startNodeX = targetNode.x;
      sharedResizeDrag.startNodeY = targetNode.y;
      sharedResizeDrag.startNodeW = targetNode.width;
      sharedResizeDrag.startNodeH = targetNode.height;
      sharedResizeDrag.groupStartNodes = [];
    }
  }, [nodes, selectedNodeIds]);

  /** 移除节点 */
  const removeNode = useCallback((idOrIds: string | string[]) => {
    const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
    if (ids.length === 0) return;

    setNodes(prev => {
      const filtered = prev.filter(n => {
        // 如果是高级节点（预览节点或画质增强节点），直接删除（滤除）
        if (ids.includes(n.id) && (n.taskData?.node_type === 'preview' || n.taskData?.node_type === 'volc_enhance')) {
          return false;
        }
        return true;
      }).map(n => {
        if (ids.includes(n.id) && n.status === 'completed') {
          return { ...n, isHidden: true };
        }
        return n;
      }).filter(n => !(ids.includes(n.id) && n.status !== 'completed'));

      // 清理子节点的 parentId 如果其父节点被移除了（删除或隐藏）
      const nextNodes = filtered.map(n => {
        if (n.parentId && (ids.includes(n.parentId) || !filtered.some(parent => parent.id === n.parentId && !parent.isHidden))) {
          return { ...n, parentId: undefined };
        }
        return n;
      });

      const withRecalc = recalculateSectionChildren(nextNodes);
      saveCanvasState(withRecalc);
      return withRecalc;
    });
  }, [setNodes, saveCanvasState]);

  /** 重置视图 */
  const resetView = useCallback(() => {
    setCanvasTransform({ x: 0, y: 0, scale: 1 });
  }, [setCanvasTransform]);

  /** 放大 — 以视口中心为锚点 */
  const zoomIn = useCallback(() => {
    const ct = transformRef.current;
    const newScale = Math.min(ct.scale * 1.25, 3);
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const ratio = newScale / ct.scale;
      setCanvasTransform({ x: cx - (cx - ct.x) * ratio, y: cy - (cy - ct.y) * ratio, scale: newScale });
    } else {
      setCanvasTransform({ ...ct, scale: newScale });
    }
  }, [canvasRef, setCanvasTransform]);

  /** 缩小 — 以视口中心为锚点 */
  const zoomOut = useCallback(() => {
    const ct = transformRef.current;
    const newScale = Math.max(ct.scale / 1.25, 0.1);
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const ratio = newScale / ct.scale;
      setCanvasTransform({ x: cx - (cx - ct.x) * ratio, y: cy - (cy - ct.y) * ratio, scale: newScale });
    } else {
      setCanvasTransform({ ...ct, scale: newScale });
    }
  }, [canvasRef, setCanvasTransform]);

  /** 缩放到 100% — 以视口中心为锚点 */
  const zoomTo100 = useCallback(() => {
    const ct = transformRef.current;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const ratio = 1 / ct.scale;
      setCanvasTransform({ x: cx - (cx - ct.x) * ratio, y: cy - (cy - ct.y) * ratio, scale: 1 });
    } else {
      setCanvasTransform({ x: 0, y: 0, scale: 1 });
    }
  }, [canvasRef, setCanvasTransform]);

  /** 缩放到适合所有节点 */
  const zoomToFit = useCallback(() => {
    const currentNodes = nodes;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || currentNodes.length === 0) {
      // 无节点时重置视图
      setCanvasTransform({ x: 0, y: 0, scale: 1 });
      return;
    }
    const padding = 80;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of currentNodes) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.width);
      maxY = Math.max(maxY, n.y + n.height);
    }
    const contentW = maxX - minX;
    const contentH = maxY - minY;
    const viewW = rect.width - padding * 2;
    const viewH = rect.height - padding * 2;
    const newScale = Math.min(Math.max(Math.min(viewW / contentW, viewH / contentH), 0.1), 3);
    const newX = (rect.width - contentW * newScale) / 2 - minX * newScale;
    const newY = (rect.height - contentH * newScale) / 2 - minY * newScale;
    setCanvasTransform({ x: newX, y: newY, scale: newScale });
  }, [nodes, canvasRef, setCanvasTransform]);

  /** 缩放到选中节点（当前等同 zoomToFit，未来可扩展选中逻辑） */
  const zoomToSelection = useCallback(() => {
    zoomToFit();
  }, [zoomToFit]);

  return {
    handleWheel,
    handleCanvasMouseDown,
    handleCanvasMouseMove,
    handleCanvasMouseUp,
    handleNodeMouseDown,
    handleResizeStart,
    removeNode,
    resetView,
    zoomIn,
    zoomOut,
    zoomTo100,
    zoomToFit,
    zoomToSelection,
  };
};
