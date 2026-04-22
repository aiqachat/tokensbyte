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
/** 高亮衰减速度 */
const DECAY_RATE = 0.93;
/** 粒子基础半径 */
const BASE_RADIUS = 0.8;
/** 粒子高亮半径 */
const HIGHLIGHT_RADIUS = 2.2;
/** 最小绘制间距（像素），低于此值则跳步绘制 */
const MIN_DRAW_GAP = 6;
/** 最大绘制间距（像素），高于此值仍正常绘制 */
const MAX_DRAW_GAP = 200;

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
      ctx.clearRect(0, 0, w, h);

      // 计算屏幕上的网格间距
      let gap = GRID_GAP * scale;

      // 缩放很小时：跳步绘制（每 N 个点画一个）保证覆盖且不卡
      let step = 1;
      if (gap < MIN_DRAW_GAP) {
        step = Math.ceil(MIN_DRAW_GAP / gap);
        gap = gap * step;
      }

      // 使用模运算确保网格始终无缝铺满整个视口
      // offsetMod 是第一个可见点的屏幕坐标（始终在 [0, gap) 范围内）
      const ox = ((offsetX % gap) + gap) % gap;
      const oy = ((offsetY % gap) + gap) % gap;

      // 从视口左上角之外一个 gap 开始，到右下角之外一个 gap 结束
      for (let screenX = ox - gap; screenX <= w + gap; screenX += gap) {
        for (let screenY = oy - gap; screenY <= h + gap; screenY += gap) {
          // 与鼠标的距离
          const dx = screenX - mouse.x;
          const dy = screenY - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          // 用屏幕坐标的整数网格作为 key
          const col = Math.round((screenX - ox) / gap);
          const row = Math.round((screenY - oy) / gap);
          const key = `${col},${row}`;

          const prevBrightness = brightnessMap.get(key) || 0;

          let targetBrightness = 0;
          if (dist < INFLUENCE_RADIUS) {
            const proximity = 1 - (dist / INFLUENCE_RADIUS);
            targetBrightness = proximity * proximity;
          }

          let brightness = Math.max(targetBrightness, prevBrightness * DECAY_RATE);
          if (brightness < 0.005) brightness = 0;
          brightnessMap.set(key, brightness);

          const alpha = BASE_ALPHA + brightness * (HIGHLIGHT_ALPHA - BASE_ALPHA);
          const radius = BASE_RADIUS + brightness * (HIGHLIGHT_RADIUS - BASE_RADIUS);

          ctx.beginPath();
          ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);

          if (brightness > 0.01) {
            const r = Math.round(162 + brightness * 40);
            const g = Math.round(193 + brightness * 30);
            ctx.fillStyle = `rgba(${r}, ${g}, 255, ${alpha})`;
          } else {
            ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
          }
          ctx.fill();
        }
      }

      // 定期清理过期的亮度缓存（避免内存泄漏）
      if (brightnessMap.size > 8000) {
        const entries = Array.from(brightnessMap.entries());
        for (const [k, v] of entries) {
          if (v < 0.005) brightnessMap.delete(k);
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
