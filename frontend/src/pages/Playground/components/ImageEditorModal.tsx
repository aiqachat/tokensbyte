import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Modal, Tooltip, Input, Button } from 'antd';
import {
  UndoOutlined,
  RedoOutlined,
  EditOutlined,
  ArrowRightOutlined,
  BorderOutlined,
  FontSizeOutlined,
  ClearOutlined,
  ExpandOutlined,
  CompressOutlined,
} from '@ant-design/icons';
import { Eraser, MousePointer2 } from 'lucide-react';

interface ImageEditorModalProps {
  open: boolean;
  imageUrl: string;
  onCancel: () => void;
  onSave: (newUrl: string, file: File) => void;
}

type Tool = 'pointer' | 'pen' | 'arrow' | 'rect' | 'text' | 'eraser';

interface TextAnnotation {
  id: string;
  text: string;
  canvasX: number;
  canvasY: number;
  color: string;
  scaleY: number;
}

const COLORS = ['#f5222d', '#52c41a', '#1677ff', '#faad14', '#eb2f96', '#ffffff', '#000000'];

const ImageEditorModal: React.FC<ImageEditorModalProps> = ({ open, imageUrl, onCancel, onSave }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [currentTool, setCurrentTool] = useState<Tool>('pointer');
  const [currentColor, setCurrentColor] = useState<string>('#f5222d');
  
  // History for Undo/Redo (stores data URLs of the drawing layer)
  const [history, setHistory] = useState<string[]>([]);
  const [historyStep, setHistoryStep] = useState<number>(-1);

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentPos, setCurrentPos] = useState({ x: 0, y: 0 });
  const [canvasSize, setCanvasSize] = useState({ width: 1, height: 1 });
  
  // Text annotations state (editable DOM overlays)
  const [texts, setTexts] = useState<TextAnnotation[]>([]);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [textInputVisible, setTextInputVisible] = useState(false);
  const [textPos, setTextPos] = useState({ x: 0, y: 0, canvasX: 0, canvasY: 0, scale: 1 });
  const [textValue, setTextValue] = useState('');
  const [viewMode, setViewMode] = useState<'fit' | '100'>('fit');

  // Snapshot before starting a shape (arrow/rect)
  const snapshotRef = useRef<ImageData | null>(null);

  // Initialize canvas when image loads
  const handleImageLoad = () => {
    if (!canvasRef.current || !imageRef.current) return;
    const canvas = canvasRef.current;
    const img = imageRef.current;
    
    // Set canvas internal resolution to match image natural resolution
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    setCanvasSize({ width: img.naturalWidth, height: img.naturalHeight });
    
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      // Save initial empty state
      saveHistoryState(canvas);
    }
  };

  const saveHistoryState = (canvas: HTMLCanvasElement) => {
    const dataUrl = canvas.toDataURL('image/png');
    setHistory(prev => {
      const newHistory = prev.slice(0, historyStep + 1);
      newHistory.push(dataUrl);
      return newHistory;
    });
    setHistoryStep(prev => prev + 1);
  };

  const restoreHistoryState = (index: number) => {
    if (!canvasRef.current || index < 0 || index >= history.length) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
    };
    img.src = history[index];
    setHistoryStep(index);
  };

  const handleUndo = () => {
    if (historyStep > 0) {
      restoreHistoryState(historyStep - 1);
    }
  };

  const handleRedo = () => {
    if (historyStep < history.length - 1) {
      restoreHistoryState(historyStep + 1);
    }
  };

  const handleClear = () => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      saveHistoryState(canvas);
    }
    setTexts([]); // Also clear all text annotations
  };

  const getCanvasCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return { x: 0, y: 0, scaleY: 1 };
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    
    let clientX = 0, clientY = 0;
    if ('changedTouches' in e && e.changedTouches.length > 0) {
      clientX = e.changedTouches[0].clientX;
      clientY = e.changedTouches[0].clientY;
    } else if ('touches' in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
      scaleY
    };
  };

  const drawArrow = (ctx: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number) => {
    const headlen = 20; // length of head in pixels
    const dx = toX - fromX;
    const dy = toY - fromY;
    const angle = Math.atan2(dy, dx);
    
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.lineTo(toX - headlen * Math.cos(angle - Math.PI / 6), toY - headlen * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headlen * Math.cos(angle + Math.PI / 6), toY - headlen * Math.sin(angle + Math.PI / 6));
    ctx.stroke();
  };

  const handlePointerDown = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (textInputVisible) return; // Don't draw while typing
    
    if (currentTool === 'text' || currentTool === 'pointer') {
      return; // Handled in handlePointerUp or ignored
    }

    const { x, y } = getCanvasCoordinates(e);

    setIsDrawing(true);
    setStartPos({ x, y });
    setCurrentPos({ x, y });

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      snapshotRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineWidth = currentTool === 'eraser' ? 30 : 6;
      ctx.strokeStyle = currentTool === 'eraser' ? 'rgba(0,0,0,1)' : currentColor;
      ctx.globalCompositeOperation = currentTool === 'eraser' ? 'destination-out' : 'source-over';
    }
  };

  const handlePointerMove = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !canvasRef.current || !snapshotRef.current) return;
    
    const { x, y } = getCanvasCoordinates(e);
    setCurrentPos({ x, y });
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (currentTool === 'pen' || currentTool === 'eraser') {
      ctx.lineTo(x, y);
      ctx.stroke();
    } else if (currentTool === 'arrow' || currentTool === 'rect') {
      // For shapes, restore snapshot and draw preview
      ctx.putImageData(snapshotRef.current, 0, 0);
      ctx.beginPath();
      ctx.lineWidth = 6;
      ctx.strokeStyle = currentColor;
      ctx.globalCompositeOperation = 'source-over';
      
      if (currentTool === 'rect') {
        ctx.strokeRect(startPos.x, startPos.y, x - startPos.x, y - startPos.y);
      } else if (currentTool === 'arrow') {
        drawArrow(ctx, startPos.x, startPos.y, x, y);
      }
    }
  };

  const handlePointerUp = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (currentTool === 'text') {
      if (textInputVisible) return;
      
      const { x, y, scaleY } = getCanvasCoordinates(e);
      let clientX = 0, clientY = 0;
      if ('changedTouches' in e && e.changedTouches.length > 0) {
        clientX = e.changedTouches[0].clientX;
        clientY = e.changedTouches[0].clientY;
      } else if ('touches' in e && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = (e as React.MouseEvent).clientX;
        clientY = (e as React.MouseEvent).clientY;
      }
      
      setTextPos({ x: clientX, y: clientY, canvasX: x, canvasY: y, scale: scaleY });
      setEditingTextId(null);
      setTextInputVisible(true);
      setTextValue('');
      return;
    }

    if (!isDrawing) return;
    setIsDrawing(false);
    
    if (canvasRef.current) {
      saveHistoryState(canvasRef.current);
    }
  };

  const handleEditExistingText = (t: TextAnnotation) => {
    setCurrentTool('text');
    setEditingTextId(t.id);
    setTextValue(t.text);
    setCurrentColor(t.color);
    setTextInputVisible(true);
  };

  const handleTextSubmit = () => {
    if (textValue.trim()) {
      if (editingTextId) {
        setTexts(prev => prev.map(t => t.id === editingTextId ? { ...t, text: textValue, color: currentColor } : t));
      } else {
        setTexts(prev => [...prev, {
          id: Date.now().toString(),
          text: textValue,
          canvasX: textPos.canvasX,
          canvasY: textPos.canvasY,
          color: currentColor,
          scaleY: textPos.scale
        }]);
      }
    } else {
      if (editingTextId) {
        setTexts(prev => prev.filter(t => t.id !== editingTextId));
      }
    }
    setTextInputVisible(false);
    setTextValue('');
    setEditingTextId(null);
  };

  const handleSave = () => {
    if (!canvasRef.current || !imageRef.current) return;
    const canvas = canvasRef.current;
    const img = imageRef.current;
    
    // Create a composite canvas to merge image and drawing
    const compositeCanvas = document.createElement('canvas');
    compositeCanvas.width = canvas.width;
    compositeCanvas.height = canvas.height;
    const ctx = compositeCanvas.getContext('2d');
    
    if (ctx) {
      // Draw original image
      ctx.drawImage(img, 0, 0, compositeCanvas.width, compositeCanvas.height);
      // Draw annotations on top
      ctx.drawImage(canvas, 0, 0);
      
      // Draw DOM text layers
      texts.forEach(t => {
        const fontSize = Math.max(12, Math.round(24 * t.scaleY));
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.fillStyle = t.color;
        ctx.textBaseline = 'middle';
        ctx.fillText(t.text, t.canvasX, t.canvasY);
      });
      const attemptSave = (quality: number) => {
        compositeCanvas.toBlob((blob) => {
          if (blob) {
            if (blob.size > 10 * 1024 * 1024 && quality > 0.3) {
              // If blob > 10MB, reduce quality and try again
              attemptSave(quality - 0.15);
            } else {
              const newUrl = URL.createObjectURL(blob);
              const file = new File([blob], 'edited_image.jpg', { type: 'image/jpeg' });
              onSave(newUrl, file);
            }
          }
        }, 'image/jpeg', quality);
      };
      
      attemptSave(0.85);
    }
  };

  // Prevent scroll while interacting with canvas
  useEffect(() => {
    const preventScroll = (e: TouchEvent) => {
      if (isDrawing) e.preventDefault();
    };
    document.addEventListener('touchmove', preventScroll, { passive: false });
    return () => document.removeEventListener('touchmove', preventScroll);
  }, [isDrawing]);

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      footer={null}
      closeIcon={null}
      width="100vw"
      style={{ top: 0, margin: 0, padding: 0, maxWidth: '100vw' }}
      styles={{
        body: { height: '100vh', padding: 0, position: 'relative', overflow: 'hidden', background: '#111111' },
        mask: { backdropFilter: 'blur(5px)' }
      }}
    >
      {/* Top Toolbar */}
      <div style={{
        position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 6, zIndex: 100,
        background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)',
        padding: '8px 12px', borderRadius: 30, border: '1px solid rgba(255,255,255,0.1)',
        alignItems: 'center',
      }}>
        <Tooltip title="撤销" placement="bottom">
          <div 
            onClick={handleUndo} 
            style={{ cursor: historyStep > 0 ? 'pointer' : 'not-allowed', color: historyStep > 0 ? '#fff' : 'rgba(255,255,255,0.3)', padding: '4px 8px' }}
          >
            <UndoOutlined />
          </div>
        </Tooltip>
        <Tooltip title="重做" placement="bottom">
          <div 
            onClick={handleRedo} 
            style={{ cursor: historyStep < history.length - 1 ? 'pointer' : 'not-allowed', color: historyStep < history.length - 1 ? '#fff' : 'rgba(255,255,255,0.3)', padding: '4px 8px' }}
          >
            <RedoOutlined />
          </div>
        </Tooltip>
        <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.15)', margin: '0 4px' }} />
        <Tooltip title="适应屏幕" placement="bottom">
          <div
            onClick={() => setViewMode('fit')}
            style={{
              padding: '4px 10px', borderRadius: 16, cursor: 'pointer',
              fontSize: 13, fontWeight: 500, transition: 'all 0.2s',
              display: 'flex', alignItems: 'center', gap: 4,
              background: viewMode === 'fit' ? 'rgba(255,255,255,0.2)' : 'transparent',
              color: viewMode === 'fit' ? '#fff' : 'rgba(255,255,255,0.5)',
            }}
          >
            <CompressOutlined style={{ fontSize: 14 }} />
            <span>适应</span>
          </div>
        </Tooltip>
        <Tooltip title="100% 原始尺寸" placement="bottom">
          <div
            onClick={() => setViewMode('100')}
            style={{
              padding: '4px 10px', borderRadius: 16, cursor: 'pointer',
              fontSize: 13, fontWeight: 500, transition: 'all 0.2s',
              display: 'flex', alignItems: 'center', gap: 4,
              background: viewMode === '100' ? 'rgba(255,255,255,0.2)' : 'transparent',
              color: viewMode === '100' ? '#fff' : 'rgba(255,255,255,0.5)',
            }}
          >
            <ExpandOutlined style={{ fontSize: 14 }} />
            <span>100%</span>
          </div>
        </Tooltip>
      </div>

      {/* Main Drawing Area */}
      <div 
        ref={containerRef}
        style={{
          position: 'absolute', inset: 80,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: viewMode === '100' ? 'auto' : 'hidden',
        }}
      >
        <div style={{
          position: 'relative',
          ...(viewMode === 'fit'
            ? { maxWidth: '100%', maxHeight: '100%', display: 'inline-block' }
            : { display: 'inline-block', flexShrink: 0 }
          ),
        }}>
          {/* Background Original Image */}
          <img
            ref={imageRef}
            src={imageUrl}
            alt="Original"
            onLoad={handleImageLoad}
            style={{
              display: 'block',
              userSelect: 'none', pointerEvents: 'none',
              ...(viewMode === 'fit'
                ? { maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain' }
                : { width: canvasSize.width, height: canvasSize.height }
              ),
            }}
          />
          {/* Transparent Drawing Canvas */}
          <canvas
            ref={canvasRef}
            onMouseDown={handlePointerDown}
            onMouseMove={handlePointerMove}
            onMouseUp={handlePointerUp}
            onMouseLeave={handlePointerUp}
            onTouchStart={handlePointerDown}
            onTouchMove={handlePointerMove}
            onTouchEnd={handlePointerUp}
            style={{
              position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
              cursor: currentTool === 'pointer' ? 'default' : currentTool === 'text' ? 'text' : 'crosshair',
              touchAction: 'none'
            }}
          />
          
          {/* Confirmed Text Annotations */}
          {texts.map(t => (
            <div
              key={t.id}
              onClick={(e) => { e.stopPropagation(); handleEditExistingText(t); }}
              style={{
                position: 'absolute',
                left: `${(t.canvasX / canvasSize.width) * 100}%`,
                top: `${(t.canvasY / canvasSize.height) * 100}%`,
                transform: 'translateY(-50%)',
                color: t.color,
                fontWeight: 'bold',
                fontSize: 24,
                cursor: 'text',
                userSelect: 'none',
                whiteSpace: 'nowrap',
                textShadow: '0 1px 3px rgba(0,0,0,0.5)',
                display: (textInputVisible && editingTextId === t.id) ? 'none' : 'block' // hide while editing
              }}
            >
              {t.text}
            </div>
          ))}

          {/* Active Text Input Overlay */}
          {textInputVisible && (
            <Input
              autoFocus
              value={textValue}
              onChange={e => setTextValue(e.target.value)}
              onPressEnter={handleTextSubmit}
              // Using a small delay on blur allows the click event to register if needed
              onBlur={() => setTimeout(handleTextSubmit, 100)}
              style={{
                position: 'absolute',
                left: editingTextId 
                  ? `${((texts.find(t=>t.id===editingTextId)?.canvasX || 0) / canvasSize.width) * 100}%` 
                  : `${(textPos.canvasX / canvasSize.width) * 100}%`,
                top: editingTextId 
                  ? `${((texts.find(t=>t.id===editingTextId)?.canvasY || 0) / canvasSize.height) * 100}%` 
                  : `${(textPos.canvasY / canvasSize.height) * 100}%`,
                transform: 'translateY(-50%)',
                width: 200,
                background: 'rgba(0,0,0,0.5)',
                color: currentColor,
                fontWeight: 'bold',
                fontSize: 24,
                border: `1px solid ${currentColor}`,
                zIndex: 110,
              }}
              placeholder="输入文字后回车..."
            />
          )}
        </div>
      </div>

      {/* Right Floating Toolbar Area */}
      <div style={{
        position: 'absolute', right: 24, top: '50%', transform: 'translateY(-50%)',
        display: 'flex', alignItems: 'center', gap: 12, zIndex: 100,
      }}>
        {/* Colors (pops out to the left when Pen, Arrow, Rect, Text is selected) */}
        {['pen', 'arrow', 'rect', 'text'].includes(currentTool) && (
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 8,
            background: 'rgba(40,40,40,0.9)', backdropFilter: 'blur(20px)',
            padding: '10px 8px', borderRadius: 30, border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
          }}>
            {COLORS.map(color => (
              <div
                key={color}
                onClick={() => setCurrentColor(color)}
                style={{
                  width: 20, height: 20, borderRadius: '50%', background: color,
                  cursor: 'pointer', 
                  border: currentColor === color ? '2px solid #8b5cf6' : '1px solid rgba(255,255,255,0.2)',
                  transform: currentColor === color ? 'scale(1.1)' : 'scale(1)', 
                  transition: 'all 0.2s',
                  boxShadow: currentColor === color ? '0 0 0 2px rgba(139,92,246,0.5)' : 'none'
                }}
              />
            ))}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
          {/* Main Toolbar */}
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 8,
            background: 'rgba(40,40,40,0.9)', backdropFilter: 'blur(20px)',
            padding: '12px 8px', borderRadius: 30, border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            alignItems: 'center'
          }}>
            <Tooltip title="选择/移动" placement="left">
              <div 
                onClick={() => setCurrentTool('pointer')}
                style={{ 
                  width: 32, height: 32, borderRadius: '50%', 
                  background: currentTool === 'pointer' ? '#fff' : 'transparent',
                  color: currentTool === 'pointer' ? '#000' : 'rgba(255,255,255,0.6)', 
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, transition: 'all 0.2s'
                }}
              ><MousePointer2 size={16} /></div>
            </Tooltip>
            <Tooltip title="画笔" placement="left">
              <div 
                onClick={() => setCurrentTool('pen')}
                style={{ 
                  width: 32, height: 32, borderRadius: '50%', 
                  background: currentTool === 'pen' ? '#fff' : 'transparent',
                  color: currentTool === 'pen' ? '#000' : 'rgba(255,255,255,0.6)', 
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, transition: 'all 0.2s'
                }}
              ><EditOutlined /></div>
            </Tooltip>
            <Tooltip title="箭头" placement="left">
              <div 
                onClick={() => setCurrentTool('arrow')}
                style={{ 
                  width: 32, height: 32, borderRadius: '50%', 
                  background: currentTool === 'arrow' ? '#fff' : 'transparent',
                  color: currentTool === 'arrow' ? '#000' : 'rgba(255,255,255,0.6)', 
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, transition: 'all 0.2s'
                }}
              ><ArrowRightOutlined /></div>
            </Tooltip>
            <Tooltip title="矩形" placement="left">
              <div 
                onClick={() => setCurrentTool('rect')}
                style={{ 
                  width: 32, height: 32, borderRadius: '50%', 
                  background: currentTool === 'rect' ? '#fff' : 'transparent',
                  color: currentTool === 'rect' ? '#000' : 'rgba(255,255,255,0.6)', 
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, transition: 'all 0.2s'
                }}
              ><BorderOutlined /></div>
            </Tooltip>
            <Tooltip title="文字" placement="left">
              <div 
                onClick={() => setCurrentTool('text')}
                style={{ 
                  width: 32, height: 32, borderRadius: '50%', 
                  background: currentTool === 'text' ? '#fff' : 'transparent',
                  color: currentTool === 'text' ? '#000' : 'rgba(255,255,255,0.6)', 
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, transition: 'all 0.2s'
                }}
              ><FontSizeOutlined /></div>
            </Tooltip>
            <Tooltip title="擦除线条" placement="left">
              <div 
                onClick={() => setCurrentTool('eraser')}
                style={{ 
                  width: 32, height: 32, borderRadius: '50%', 
                  background: currentTool === 'eraser' ? '#fff' : 'transparent',
                  color: currentTool === 'eraser' ? '#000' : 'rgba(255,255,255,0.6)', 
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, transition: 'all 0.2s'
                }}
              ><Eraser size={16} /></div>
            </Tooltip>
          </div>

          {/* Clear All Button (Standalone) */}
          <Tooltip title="清空全部" placement="left">
            <div 
              onClick={handleClear}
              style={{ 
                width: 44, height: 44, borderRadius: '50%', 
                background: 'rgba(40,40,40,0.9)', backdropFilter: 'blur(20px)',
                border: '1px solid rgba(255,255,255,0.1)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                color: '#ff4d4f', 
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, transition: 'all 0.2s'
              }}
            ><ClearOutlined /></div>
          </Tooltip>
        </div>
      </div>

      {/* Bottom Footer Actions */}
      <div style={{
        position: 'absolute', bottom: 30, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 16, zIndex: 100,
      }}>
        <Button 
          shape="round" 
          onClick={onCancel}
          style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', width: 100 }}
        >
          取消
        </Button>
        <Button 
          type="primary" 
          shape="round" 
          onClick={handleSave}
          style={{ width: 100, background: '#fff', color: '#000', fontWeight: 'bold' }}
        >
          保存
        </Button>
      </div>
    </Modal>
  );
};

export default ImageEditorModal;
