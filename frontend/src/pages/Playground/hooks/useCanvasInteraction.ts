/**
 * 画布交互 Hook（高性能版）
 * 
 * 核心优化：所有拖拽操作（画布平移、节点拖拽）使用 useRef 存储中间值，
 * 通过 requestAnimationFrame 批量更新 DOM，仅在 mouseup 时提交最终状态到 React。
 * 
 * 这样每次 mousemove 不再触发 React re-render，实现 60fps 流畅拖拽。
 */
import { useCallback, useRef } from 'react';
import { useCanvas } from '../context/PlaygroundContext';
import type { CanvasTransform } from '../types';
import type { CanvasParticlesHandle } from '../components/CanvasParticles';

/**
 * 模块级共享拖拽状态
 */
const sharedNodeDrag = {
  nodeId: null as string | null,
  offsetX: 0,
  offsetY: 0,
};

export const useCanvasInteraction = (particlesRef?: React.RefObject<CanvasParticlesHandle>) => {
  const {
    canvasTransform, setCanvasTransform,
    activeTool, isSpaceDown,
    setIsDraggingCanvas,
    setDraggingNodeId,
    nodes, setNodes,
    maxZIndex, setMaxZIndex,
    canvasRef,
  } = useCanvas();

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
        const transformLayer = canvasRef.current?.firstElementChild as HTMLElement | null;
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
        const transformLayer = canvasRef.current?.firstElementChild as HTMLElement | null;
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
    }
  }, [activeTool, isSpaceDown, setIsDraggingCanvas]);

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
        const transformLayer = canvasRef.current?.firstElementChild as HTMLElement | null;
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
          // 找到正在拖拽的节点 DOM 元素并直接更新位置
          const nodeEl = canvasRef.current?.querySelector(`[data-node-id="${nd.nodeId}"]`) as HTMLElement | null;
          if (nodeEl) {
            nodeEl.style.left = `${newNodeX}px`;
            nodeEl.style.top = `${newNodeY}px`;
          }
        });
      }
    }
  }, [canvasRef]);

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

    if (nd.nodeId) {
      // 提交最终节点位置到 React state
      const rect = canvasRef.current?.getBoundingClientRect();
      const nodeEl = canvasRef.current?.querySelector(`[data-node-id="${nd.nodeId}"]`) as HTMLElement | null;
      if (nodeEl && rect) {
        const finalX = parseFloat(nodeEl.style.left);
        const finalY = parseFloat(nodeEl.style.top);
        const draggedId = nd.nodeId;
        setNodes(prev => prev.map(n =>
          n.id === draggedId ? { ...n, x: finalX, y: finalY } : n
        ));
      }
      nd.nodeId = null;
      setDraggingNodeId(null);
    }

    cancelAnimationFrame(rafRef.current);
  }, [canvasRef, setCanvasTransform, setIsDraggingCanvas, setNodes, setDraggingNodeId]);

  /** 节点鼠标按下（启动节点拖拽并置顶） */
  const handleNodeMouseDown = useCallback((e: React.MouseEvent, nodeId: string, nodeX: number, nodeY: number) => {
    if (activeTool === 'pointer') {
      e.stopPropagation();
      setDraggingNodeId(nodeId);
      const newZ = maxZIndex + 1;
      setMaxZIndex(newZ);
      setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, zIndex: newZ } : n));
      const ct = transformRef.current;
      const startX = (e.clientX - ct.x) / ct.scale;
      const startY = (e.clientY - ct.y) / ct.scale;
      sharedNodeDrag.nodeId = nodeId;
      sharedNodeDrag.offsetX = startX - nodeX;
      sharedNodeDrag.offsetY = startY - nodeY;
    }
  }, [activeTool, maxZIndex, setDraggingNodeId, setMaxZIndex, setNodes]);

  /** 移除节点 */
  const removeNode = useCallback((id: string) => {
    setNodes(prev => prev.map(n => {
      if (n.id === id && n.status === 'completed') {
        return { ...n, isHidden: true };
      }
      return n;
    }).filter(n => !(n.id === id && n.status !== 'completed')));
  }, [setNodes]);

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
    removeNode,
    resetView,
    zoomIn,
    zoomOut,
    zoomTo100,
    zoomToFit,
    zoomToSelection,
  };
};
