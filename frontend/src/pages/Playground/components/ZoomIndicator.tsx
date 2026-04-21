/**
 * 右下角缩放比例指示器
 * 显示当前画布缩放百分比，点击可重置为 100%
 */
import React from 'react';
import { useCanvas } from '../context/PlaygroundContext';
import { useCanvasInteraction } from '../hooks/useCanvasInteraction';

const ZoomIndicator: React.FC = React.memo(() => {
  const { canvasTransform } = useCanvas();
  const { resetView } = useCanvasInteraction();

  const percent = Math.round(canvasTransform.scale * 100);

  return (
    <div
      onClick={resetView}
      title="点击重置为 100%"
      style={{
        position: 'absolute',
        right: 24,
        bottom: 24,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 72,
        height: 40,
        padding: '0 16px',
        background: 'rgba(20, 21, 23, 0.85)',
        backdropFilter: 'blur(12px)',
        borderRadius: 20,
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        color: 'rgba(255,255,255,0.7)',
        fontSize: 14,
        fontWeight: 500,
        letterSpacing: '0.5px',
        userSelect: 'none',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(30, 32, 36, 0.95)';
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
        e.currentTarget.style.color = '#fff';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgba(20, 21, 23, 0.85)';
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
        e.currentTarget.style.color = 'rgba(255,255,255,0.7)';
      }}
      onWheel={(e) => e.stopPropagation()}
    >
      {percent}%
    </div>
  );
});

ZoomIndicator.displayName = 'ZoomIndicator';
export default ZoomIndicator;
