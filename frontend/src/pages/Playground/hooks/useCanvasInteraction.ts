/**
 * 画布交互 Hook
 * 封装画布平移/缩放、节点拖拽、悬浮面板拖拽的所有鼠标事件逻辑
 */
import { useCallback } from 'react';
import { useCanvas } from '../context/PlaygroundContext';

export const useCanvasInteraction = () => {
  const {
    canvasTransform, setCanvasTransform,
    activeTool, isSpaceDown,
    isDraggingCanvas, setIsDraggingCanvas,
    dragStartPos, setDragStartPos,
    dragStartTransform, setDragStartTransform,
    draggingNodeId, setDraggingNodeId,
    nodeDragOffset, setNodeDragOffset,
    nodes, setNodes,
    maxZIndex, setMaxZIndex,
    canvasRef,
    isSettingsDragging, setIsSettingsDragging,
    settingsWidgetPos, setSettingsWidgetPos,
  } = useCanvas();

  /** 滚轮缩放（以鼠标指针为中心） */
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = -e.deltaY * 0.001;
    const newScale = Math.min(Math.max(0.1, canvasTransform.scale + zoomFactor), 5);
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      const pointerX = e.clientX - rect.left;
      const pointerY = e.clientY - rect.top;
      const ratio = newScale / canvasTransform.scale;
      const newX = pointerX - (pointerX - canvasTransform.x) * ratio;
      const newY = pointerY - (pointerY - canvasTransform.y) * ratio;
      setCanvasTransform({ x: newX, y: newY, scale: newScale });
    }
  }, [canvasTransform, canvasRef, setCanvasTransform]);

  /** 画布鼠标按下（启动平移） */
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (activeTool === 'hand' || isSpaceDown) {
      setIsDraggingCanvas(true);
      setDragStartPos({ x: e.clientX, y: e.clientY });
      setDragStartTransform({ x: canvasTransform.x, y: canvasTransform.y });
    }
  }, [activeTool, isSpaceDown, canvasTransform, setIsDraggingCanvas, setDragStartPos, setDragStartTransform]);

  /** 画布鼠标移动（处理平移、节点拖拽、面板拖拽） */
  const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    if (isSettingsDragging) {
      setSettingsWidgetPos(prev => ({
        x: prev.x + (e.clientX - dragStartPos.x),
        y: prev.y + (e.clientY - dragStartPos.y)
      }));
      setDragStartPos({ x: e.clientX, y: e.clientY });
    } else if (isDraggingCanvas) {
      setCanvasTransform({
        ...canvasTransform,
        x: dragStartTransform.x + (e.clientX - dragStartPos.x),
        y: dragStartTransform.y + (e.clientY - dragStartPos.y)
      });
    } else if (draggingNodeId) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const pointerX = (e.clientX - rect.left - canvasTransform.x) / canvasTransform.scale;
        const pointerY = (e.clientY - rect.top - canvasTransform.y) / canvasTransform.scale;
        setNodes(prev => prev.map(n =>
          n.id === draggingNodeId
            ? { ...n, x: pointerX - nodeDragOffset.x, y: pointerY - nodeDragOffset.y }
            : n
        ));
      }
    }
  }, [
    isSettingsDragging, isDraggingCanvas, draggingNodeId,
    canvasTransform, dragStartPos, dragStartTransform, nodeDragOffset,
    canvasRef, setCanvasTransform, setNodes, setSettingsWidgetPos, setDragStartPos
  ]);

  /** 鼠标松开（清除所有拖拽状态） */
  const handleCanvasMouseUp = useCallback(() => {
    setIsDraggingCanvas(false);
    setDraggingNodeId(null);
    setIsSettingsDragging(false);
  }, [setIsDraggingCanvas, setDraggingNodeId, setIsSettingsDragging]);

  /** 节点鼠标按下（启动节点拖拽并置顶） */
  const handleNodeMouseDown = useCallback((e: React.MouseEvent, nodeId: string, nodeX: number, nodeY: number) => {
    if (activeTool === 'pointer') {
      e.stopPropagation();
      setDraggingNodeId(nodeId);
      const newZ = maxZIndex + 1;
      setMaxZIndex(newZ);
      setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, zIndex: newZ } : n));
      const startX = (e.clientX - canvasTransform.x) / canvasTransform.scale;
      const startY = (e.clientY - canvasTransform.y) / canvasTransform.scale;
      setNodeDragOffset({ x: startX - nodeX, y: startY - nodeY });
    }
  }, [activeTool, maxZIndex, canvasTransform, setDraggingNodeId, setMaxZIndex, setNodes, setNodeDragOffset]);

  /** 移除节点 */
  const removeNode = useCallback((id: string) => {
    setNodes(prev => prev.filter(n => n.id !== id));
  }, [setNodes]);

  /** 重置视图 */
  const resetView = useCallback(() => {
    setCanvasTransform({ x: 0, y: 0, scale: 1 });
  }, [setCanvasTransform]);

  return {
    handleWheel,
    handleCanvasMouseDown,
    handleCanvasMouseMove,
    handleCanvasMouseUp,
    handleNodeMouseDown,
    removeNode,
    resetView,
  };
};
