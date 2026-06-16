/**
 * 画布粒子背景
 * 
 * 高性能实现：纯 HTML5 Canvas 绘制 + requestAnimationFrame
 * - 鼠标附近的网格点会变亮并放大
 * - 拖尾效果：光点亮度平滑衰减回暗色
 * - 完全不触发 React 渲染，独立动画循环
 * - 任意缩放级别下始终布满整个浏览器视口
 */
import React, { useRef, useEffect, useCallback } from 'react';
import { useThemeStore } from '../../../store/theme';

interface Props {
  /** 画布偏移量 */
  offsetX: number;
  offsetY: number;
  /** 缩放比例 */
  scale: number;
}

/** 网格间距（基础像素） */
const GRID_GAP = 6;
/** 鼠标影响半径（像素） */
const INFLUENCE_RADIUS = 90;
/** 粒子基础亮度 */
const BASE_ALPHA = 0.20;
/** 粒子高亮亮度 */
const HIGHLIGHT_ALPHA = 0.40;
/** 高亮衰减速度 */
const DECAY_RATE = 0.93;
/** 粒子基础半径 */
const BASE_RADIUS = 0.9;
/** 粒子高亮半径 */
const HIGHLIGHT_RADIUS = 1.6;
/** 最小绘制间距（像素），低于此值则跳步绘制 */
const MIN_DRAW_GAP = 6;
/** 最大绘制间距（像素），高于此值仍正常绘制 */
const MAX_DRAW_GAP = 200;

export interface CanvasParticlesHandle {
  updateTransform: (x: number, y: number, scale: number) => void;
}

const CanvasParticles = React.forwardRef<CanvasParticlesHandle, {}>((_, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -9999, y: -9999 });
  const particleBrightnessRef = useRef<Map<string, number>>(new Map());
  const rafRef = useRef<number>(0);
  const sizeRef = useRef({ w: 0, h: 0 });

  // 使用 ref 存储变换，以实现高性能非 React 更新
  const transformRef = useRef({ x: 0, y: 0, scale: 1 });

  // 暴露给外部的更新接口
  React.useImperativeHandle(ref, () => ({
    updateTransform: (x, y, scale) => {
      transformRef.current = { x, y, scale };
    }
  }));

  const handleMouseMove = useCallback((e: MouseEvent) => {
    mouseRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseLeave = useCallback(() => {
    mouseRef.current = { x: -9999, y: -9999 };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    window.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', handleMouseLeave);

    const updateSize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sizeRef.current = { w, h };
    };
    updateSize();
    window.addEventListener('resize', updateSize);

    const brightnessMap = particleBrightnessRef.current;

    const draw = () => {
      const { w, h } = sizeRef.current;
      const mouse = mouseRef.current;
      const { x: offsetX, y: offsetY, scale } = transformRef.current;

      ctx.clearRect(0, 0, w, h);

      // 计算屏幕上的网格间距
      let gap = GRID_GAP * scale;
      let step = 1;
      if (gap < 12) {
        step = Math.ceil(12 / gap);
        gap = gap * step;
      }

      const ox = ((offsetX % gap) + gap) % gap;
      const oy = ((offsetY % gap) + gap) % gap;
      
      const themeMode = useThemeStore.getState().themeMode;
      const isLight = themeMode === 'light';

      // 1. 批量绘制背景静态点 (极致性能)
      ctx.fillStyle = isLight ? `rgba(0, 0, 0, ${BASE_ALPHA * 0.4})` : `rgba(255, 255, 255, ${BASE_ALPHA})`;
      const radius = BASE_RADIUS * Math.min(Math.max(scale, 0.5), 1.2);

      ctx.beginPath();
      for (let sx = ox - gap; sx <= w + gap; sx += gap) {
        for (let sy = oy - gap; sy <= h + gap; sy += gap) {
          // 使用圆形绘制小点，效果更柔和
          ctx.moveTo(sx + radius, sy);
          ctx.arc(sx, sy, radius, 0, Math.PI * 2);
        }
      }
      ctx.fill();

      // 2. 局部交互高亮 (仅计算鼠标附近的粒子)
      if (mouse.x > -1000) {
        // 空间裁剪：只遍历鼠标半径内的网格点
        const searchRadius = INFLUENCE_RADIUS;
        const gridXStart = Math.floor((mouse.x - searchRadius - ox) / gap) * gap + ox;
        const gridXEnd = Math.ceil((mouse.x + searchRadius - ox) / gap) * gap + ox;
        const gridYStart = Math.floor((mouse.y - searchRadius - oy) / gap) * gap + oy;
        const gridYEnd = Math.ceil((mouse.y + searchRadius - oy) / gap) * gap + oy;

        for (let sx = gridXStart; sx <= gridXEnd; sx += gap) {
          if (sx < -gap || sx > w + gap) continue;
          for (let sy = gridYStart; sy <= gridYEnd; sy += gap) {
            if (sy < -gap || sy > h + gap) continue;

            const dx = sx - mouse.x;
            const dy = sy - mouse.y;
            const distSq = dx * dx + dy * dy;
            const radSq = searchRadius * searchRadius;

            if (distSq < radSq) {
              const dist = Math.sqrt(distSq);
              const proximity = 1 - (dist / searchRadius);
              // 使用 smoothstep 平滑过渡，消除边缘突变感
              const brightness = proximity * proximity * (3 - 2 * proximity);

              const alpha = BASE_ALPHA + brightness * (HIGHLIGHT_ALPHA - BASE_ALPHA);
              
              // 平滑插值半径，避免刚进入影响范围时发生半径突跳
              const targetHighlightRadius = HIGHLIGHT_RADIUS * Math.min(Math.max(scale, 0.5), 1.2);
              const hRadius = radius + brightness * (targetHighlightRadius - radius);

              let r, g, b;
              if (isLight) {
                r = Math.round(100 - brightness * 50);
                g = Math.round(100 - brightness * 50);
                b = Math.round(100 - brightness * 50);
              } else {
                r = Math.round(162 + brightness * 40);
                g = Math.round(193 + brightness * 30);
                b = 255;
              }

              ctx.beginPath();
              ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${isLight ? alpha * 0.5 : alpha})`;
              ctx.arc(sx, sy, hRadius, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', updateSize);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [handleMouseMove, handleMouseLeave]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  );
});

CanvasParticles.displayName = 'CanvasParticles';
export default CanvasParticles;
