/**
 * 右下角缩放比例指示器 + 缩放控制弹窗
 * 点击百分比按钮弹出缩放控制菜单，支持快捷键操作
 * Mac/Win 平台自动切换快捷键提示
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useCanvas } from '../context/PlaygroundContext';
import { useCanvasInteraction } from '../hooks/useCanvasInteraction';

/** 检测是否为 Mac 系统 */
const isMac = (): boolean => {
  if (typeof navigator !== 'undefined') {
    return /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  }
  return false;
};

/** 根据平台返回修饰键符号 */
const getModKey = (): string => isMac() ? '⌘' : 'Ctrl';
const getShiftKey = (): string => isMac() ? '⇧' : 'Shift';

interface ZoomMenuItem {
  label: string;
  shortcut: string;
  action: () => void;
  dividerAfter?: boolean;
}

const ZoomIndicator: React.FC = React.memo(() => {
  const { canvasTransform } = useCanvas();
  const { zoomIn, zoomOut, zoomTo100, zoomToFit, zoomToSelection } = useCanvasInteraction();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const percent = Math.round(canvasTransform.scale * 100);

  const modKey = getModKey();
  const shiftKey = getShiftKey();

  const menuItems: ZoomMenuItem[] = [
    { label: '放大', shortcut: `${modKey} +`, action: zoomIn },
    { label: '缩小', shortcut: `${modKey} -`, action: zoomOut, dividerAfter: true },
    { label: '缩放到 100%', shortcut: `${shiftKey} 0`, action: zoomTo100 },
    { label: '缩放适应画布', shortcut: `${shiftKey} 1`, action: zoomToFit },
    { label: '缩放到选区', shortcut: `${shiftKey} 2`, action: zoomToSelection },
  ];

  /** 点击外部关闭弹窗 */
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  /** 全局快捷键监听 */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 忽略输入框中的按键
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      const isMacOS = isMac();
      const mod = isMacOS ? e.metaKey : e.ctrlKey;

      // ⌘+ / Ctrl+= — 放大
      if (mod && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        zoomIn();
        return;
      }
      // ⌘- / Ctrl+- — 缩小
      if (mod && e.key === '-') {
        e.preventDefault();
        zoomOut();
        return;
      }
      // Shift+0 — 缩放到 100%
      if (e.shiftKey && !mod && e.key === ')') {
        // Shift+0 在 Mac/Win 上产生的 key 是 ')'
        e.preventDefault();
        zoomTo100();
        return;
      }
      if (e.shiftKey && !mod && e.code === 'Digit0') {
        e.preventDefault();
        zoomTo100();
        return;
      }
      // Shift+1 — 缩放适应画布
      if (e.shiftKey && !mod && (e.key === '!' || e.code === 'Digit1')) {
        e.preventDefault();
        zoomToFit();
        return;
      }
      // Shift+2 — 缩放到选区
      if (e.shiftKey && !mod && (e.key === '@' || e.code === 'Digit2')) {
        e.preventDefault();
        zoomToSelection();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [zoomIn, zoomOut, zoomTo100, zoomToFit, zoomToSelection]);

  const handleItemClick = useCallback((action: () => void) => {
    action();
    setOpen(false);
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ position: 'absolute', right: 24, bottom: 24, zIndex: 1000 }}
      onWheel={(e) => e.stopPropagation()}
    >
      {/* 弹窗菜单 */}
      {open && (
        <div
          style={{
            position: 'absolute',
            bottom: 52,
            right: 0,
            minWidth: 240,
            background: 'rgba(28, 30, 34, 0.96)',
            backdropFilter: 'blur(20px)',
            borderRadius: 12,
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 12px 40px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.03)',
            padding: '6px 0',
            animation: 'zoomMenuFadeIn 0.18s ease-out',
          }}
        >
          {menuItems.map((item, idx) => (
            <React.Fragment key={idx}>
              <div
                onClick={() => handleItemClick(item.action)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 16px',
                  cursor: 'pointer',
                  color: 'rgba(255,255,255,0.85)',
                  fontSize: 14,
                  fontWeight: 400,
                  lineHeight: '20px',
                  transition: 'background 0.12s ease',
                  borderRadius: 0,
                  margin: '0 4px',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.07)';
                  e.currentTarget.style.borderRadius = '6px';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.borderRadius = '0';
                }}
              >
                <span>{item.label}</span>
                <span style={{
                  color: 'rgba(255,255,255,0.35)',
                  fontSize: 13,
                  fontWeight: 400,
                  letterSpacing: '0.5px',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                  marginLeft: 32,
                  whiteSpace: 'nowrap',
                }}>
                  {item.shortcut}
                </span>
              </div>
              {item.dividerAfter && (
                <div style={{
                  height: 1,
                  background: 'rgba(255,255,255,0.06)',
                  margin: '4px 12px',
                }} />
              )}
            </React.Fragment>
          ))}
        </div>
      )}

      {/* 缩放百分比按钮 */}
      <div
        onClick={() => setOpen(prev => !prev)}
        title="缩放控制"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: 72,
          height: 40,
          padding: '0 16px',
          background: open ? 'rgba(30, 32, 36, 0.95)' : 'rgba(20, 21, 23, 0.85)',
          backdropFilter: 'blur(12px)',
          borderRadius: 20,
          border: `1px solid ${open ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.08)'}`,
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          color: open ? '#fff' : 'rgba(255,255,255,0.7)',
          fontSize: 14,
          fontWeight: 500,
          letterSpacing: '0.5px',
          userSelect: 'none',
        }}
        onMouseEnter={(e) => {
          if (!open) {
            e.currentTarget.style.background = 'rgba(30, 32, 36, 0.95)';
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
            e.currentTarget.style.color = '#fff';
          }
        }}
        onMouseLeave={(e) => {
          if (!open) {
            e.currentTarget.style.background = 'rgba(20, 21, 23, 0.85)';
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
            e.currentTarget.style.color = 'rgba(255,255,255,0.7)';
          }
        }}
      >
        {percent}%
      </div>

      {/* CSS 动画 */}
      <style>{`
        @keyframes zoomMenuFadeIn {
          from {
            opacity: 0;
            transform: translateY(8px) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  );
});

ZoomIndicator.displayName = 'ZoomIndicator';
export default ZoomIndicator;
