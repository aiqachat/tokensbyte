/**
 * 画布粒子背景
 * 
 * 高性能实现：纯 HTML5 Canvas 绘制 + requestAnimationFrame
 * - 鼠标附近的网格点会变亮并放大
 * - 拖尾效果：光点亮度平滑衰减回暗色
 * - 完全不触发 React 渲染，独立动画循环
 */
import React, { useRef, useEffect, useCallback } from 'react';

interface Props {
  /** 画布偏移量 */
  offsetX: number;
  offsetY: number;
  /** 缩放比例 */
  scale: number;
}

/** 网格间距（基础像素） */
const GRID_GAP = 20;
/** 鼠标影响半径（像素） */
const INFLUENCE_RADIUS = 160;
/** 粒子基础亮度 */
const BASE_ALPHA = 0.08;
/** 粒子高亮亮度 */
const HIGHLIGHT_ALPHA = 0.55;
/** 高亮衰减速度（每帧乘以此系数） */
const DECAY_RATE = 0.93;
/** 粒子基础半径 */
const BASE_RADIUS = 0.8;
/** 粒子高亮半径 */
const HIGHLIGHT_RADIUS = 2.2;

const CanvasParticles: React.FC<Props> = React.memo(({ offsetX, offsetY, scale }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -9999, y: -9999 });
  const particleBrightnessRef = useRef<Map<string, number>>(new Map());
  const rafRef = useRef<number>(0);
  const sizeRef = useRef({ w: 0, h: 0 });

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

    // 监听鼠标
    window.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', handleMouseLeave);

    // 适配 DPI
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

    // 动画循环
    const brightnessMap = particleBrightnessRef.current;

    const draw = () => {
      const { w, h } = sizeRef.current;
      const mouse = mouseRef.current;

      ctx.clearRect(0, 0, w, h);

      const gap = GRID_GAP * scale;
      if (gap < 3) {
        // 缩放太小时不绘制粒子，避免性能浪费
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      // 计算可见网格范围（基于画布偏移和缩放）
      const startCol = Math.floor(-offsetX / gap) - 1;
      const endCol = Math.ceil((w - offsetX) / gap) + 1;
      const startRow = Math.floor(-offsetY / gap) - 1;
      const endRow = Math.ceil((h - offsetY) / gap) + 1;

      // 清理离屏粒子的亮度缓存
      if (brightnessMap.size > 5000) {
        brightnessMap.clear();
      }

      for (let col = startCol; col <= endCol; col++) {
        for (let row = startRow; row <= endRow; row++) {
          // 屏幕坐标
          const screenX = col * gap + (offsetX % gap);
          const screenY = row * gap + (offsetY % gap);

          // 与鼠标的距离
          const dx = screenX - mouse.x;
          const dy = screenY - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          const key = `${col},${row}`;
          const prevBrightness = brightnessMap.get(key) || 0;

          let targetBrightness = 0;
          if (dist < INFLUENCE_RADIUS) {
            // 距离越近亮度越高（二次衰减，中心更集中）
            const proximity = 1 - (dist / INFLUENCE_RADIUS);
            targetBrightness = proximity * proximity;
          }

          // 拖尾效果：当前亮度取 max(目标亮度, 上次亮度 * 衰减)
          let brightness = Math.max(targetBrightness, prevBrightness * DECAY_RATE);

          // 清理极暗粒子
          if (brightness < 0.005) brightness = 0;

          brightnessMap.set(key, brightness);

          // 计算最终渲染参数
          const alpha = BASE_ALPHA + brightness * (HIGHLIGHT_ALPHA - BASE_ALPHA);
          const radius = BASE_RADIUS + brightness * (HIGHLIGHT_RADIUS - BASE_RADIUS);

          // 绘制圆点
          ctx.beginPath();
          ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);
          
          if (brightness > 0.01) {
            // 高亮粒子带淡蓝色光晕
            const r = Math.round(162 + brightness * 40);
            const g = Math.round(193 + brightness * 30);
            const b = 255;
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
          } else {
            ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
          }
          ctx.fill();
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
  }, [offsetX, offsetY, scale, handleMouseMove, handleMouseLeave]);

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
