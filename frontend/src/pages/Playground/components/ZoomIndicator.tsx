/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 右下角缩放比例指示器 + 缩放控制弹窗 & 页面风格/模式设置齿轮按钮
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useCanvas, usePlayground } from '../context/PlaygroundContext';
import { useCanvasInteraction } from '../hooks/useCanvasInteraction';
import { useThemeStore } from '../../../store/theme';
import { Modal, Table, Input } from 'antd';
import toast from './PlaygroundToast';
import { getSharedModalStyles } from '../utils/modalStyles';


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

const SunIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
);
const LaptopIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}><path d="M20 16V8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8"/><rect width="20" height="4" x="2" y="16" rx="1"/></svg>
);
const MoonIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
);
const NormalIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M3 9h18" /><path d="M9 21V9" /></svg>
);
const NodeIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}><line x1="6" x2="6" y1="3" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" /></svg>
);
const AgentIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}><rect x="3" y="11" width="18" height="10" rx="2" /><circle cx="12" cy="5" r="2" /><path d="M12 7v4" /><line x1="8" y1="16" x2="8" y2="16" /><line x1="16" y1="16" x2="16" y2="16" /></svg>
);
const ArrowUpRightIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}><path d="M7 7h10v10"/><path d="M7 17 17 7"/></svg>
);
const FileTextIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>
);
const HelpCircleIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>
);
const CheckIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
);
const GiftIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 4.8 0 0 1 12 8a4.8 4.8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5Z"/></svg>
);
const MessageSquareIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
);


const ZoomIndicator: React.FC = React.memo(() => {
  const { canvasTransform, undo, redo, canUndo, canRedo } = useCanvas();
  const { zoomIn, zoomOut, zoomTo100, zoomToFit, zoomToSelection } = useCanvasInteraction();
  const { pageMode, setPageMode, advancedNodesConfig, autoDisplayAssetDetails, setAutoDisplayAssetDetails, autoDisplayModelSelector, setAutoDisplayModelSelector } = usePlayground();
  const { themePreference, setThemePreference, themeMode } = useThemeStore();

  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const settingsContainerRef = useRef<HTMLDivElement>(null);

  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isWhatsNewOpen, setIsWhatsNewOpen] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);

  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const percent = Math.round(canvasTransform.scale * 100);
  const _isLight = themeMode === 'light';

  const bg = _isLight ? 'rgba(255,255,255,0.75)' : 'rgba(20,20,22,0.8)';
  const border = _isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.08)';
  const shadow = _isLight 
    ? '0 10px 40px -10px rgba(0,0,0,0.1)' 
    : '0 15px 50px -12px rgba(0,0,0,0.5)';
  const textColor = _isLight ? '#09090b' : '#f4f4f5';
  const textMuted = _isLight ? '#71717a' : '#a1a1aa';
  const hoverBg = _isLight ? '#f4f4f5' : '#27272a';
  const dividerBg = _isLight ? '#e4e4e7' : '#27272a';



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
    if (!open && !settingsOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (open && containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
      if (settingsOpen && settingsContainerRef.current && !settingsContainerRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, settingsOpen]);

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

  if (isMobile) return null;

  return (
    <div
      style={{
        position: 'absolute',
        left: 24,
        bottom: 24,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
      onWheel={(e) => e.stopPropagation()}
    >
      {/* 齿轮设置按钮 */}
      <div ref={settingsContainerRef} style={{ position: 'relative' }}>
        {/* 设置菜单 */}
        {settingsOpen && (
          <div
            style={{
              position: 'absolute',
              bottom: 40,
              left: 0,
              minWidth: 220,
              background: bg,
              backdropFilter: 'blur(30px) saturate(180%)',
              WebkitBackdropFilter: 'blur(30px) saturate(180%)',
              borderRadius: 20,
              border: border,
              boxShadow: shadow,
              padding: '8px',
              animation: 'zoomMenuFadeIn 0.15s ease-out',
              display: 'flex',
              flexDirection: 'column',
              zIndex: 1001,
            }}
          >
            {/* Section 1: Links */}
            <div
              onClick={() => { window.open('/docs', '_blank'); setSettingsOpen(false); }}
              className="pg-settings-menu-item"
            >
              <span>文档</span>
            </div>
            <div
              onClick={() => { setIsShortcutsOpen(true); setSettingsOpen(false); }}
              className="pg-settings-menu-item"
            >
              <span>快捷键</span>
              <HelpCircleIcon />
            </div>
            <div
              onClick={() => { window.open('/legal/privacy', '_blank'); setSettingsOpen(false); }}
              className="pg-settings-menu-item"
            >
              <span>隐私权声明</span>
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: dividerBg, margin: '2px 0' }} />

            {/* Section 2: Theme Preference */}
            <div
              onClick={() => setThemePreference('light')}
              className="pg-settings-menu-item"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <SunIcon />
                <span>浅色</span>
              </div>
              {themePreference === 'light' && <CheckIcon />}
            </div>
            <div
              onClick={() => setThemePreference('system')}
              className="pg-settings-menu-item"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <LaptopIcon />
                <span>系统</span>
              </div>
              {themePreference === 'system' && <CheckIcon />}
            </div>
            <div
              onClick={() => setThemePreference('dark')}
              className="pg-settings-menu-item"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <MoonIcon />
                <span>深色</span>
              </div>
              {themePreference === 'dark' && <CheckIcon />}
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: dividerBg, margin: '2px 0' }} />

            {/* Section 3: Page Mode */}
            <div
              onClick={() => setPageMode('normal')}
              className="pg-settings-menu-item"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <NormalIcon />
                <span>正常模式</span>
              </div>
              {pageMode === 'normal' && <CheckIcon />}
            </div>
            <div
              onClick={() => setPageMode('node')}
              className="pg-settings-menu-item"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <NodeIcon />
                <span>节点模式</span>
              </div>
              {pageMode === 'node' && <CheckIcon />}
            </div>


            {/* Divider */}
            <div style={{ height: 1, background: dividerBg, margin: '2px 0' }} />

            {/* 素材详细自动显示 */}
            <div
              onClick={() => setAutoDisplayAssetDetails(prev => !prev)}
              className="pg-settings-menu-item"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileTextIcon />
                <span>素材详细自动显示</span>
              </div>
              {autoDisplayAssetDetails && <CheckIcon />}
            </div>

            {/* 模型选择自动显示 */}
            <div
              onClick={() => setAutoDisplayModelSelector(prev => !prev)}
              className="pg-settings-menu-item"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileTextIcon />
                <span>模型选择自动显示</span>
              </div>
              {autoDisplayModelSelector && <CheckIcon />}
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: dividerBg, margin: '2px 0' }} />

            {/* Section 4: What's New & Feedback */}
            <div
              onClick={() => { setIsWhatsNewOpen(true); setSettingsOpen(false); }}
              className="pg-settings-menu-item"
            >
              <span>新变化</span>
              <GiftIcon />
            </div>
            <div
              onClick={() => { setIsFeedbackOpen(true); setSettingsOpen(false); }}
              className="pg-settings-menu-item"
            >
              <span>发送反馈</span>
              <MessageSquareIcon />
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: dividerBg, margin: '2px 0' }} />

            {/* Section 5: Footer disclaimer */}
            <div
              style={{
                padding: '6px 8px',
                fontSize: 11,
                color: textMuted,
                textAlign: 'left',
                lineHeight: '14px',
                userSelect: 'none',
              }}
            >
              可能会出错，请检查其输出结果。
            </div>
          </div>
        )}

        <div
          onClick={() => {
            setSettingsOpen(prev => !prev);
            setOpen(false);
          }}
          title="页面设置"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            background: settingsOpen ? (_isLight ? 'rgba(240,241,243,0.95)' : 'rgba(30, 32, 36, 0.95)') : (_isLight ? 'rgba(255,255,255,0.85)' : 'rgba(20, 21, 23, 0.85)'),
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            borderRadius: 14,
            border: `1px solid ${settingsOpen ? (_isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)') : (_isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)')}`,
            boxShadow: _isLight ? '0 4px 16px rgba(0,0,0,0.08)' : '0 4px 16px rgba(0,0,0,0.4)',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            color: settingsOpen ? (_isLight ? '#000' : '#fff') : (_isLight ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.7)'),
            userSelect: 'none',
          }}
          onMouseEnter={(e) => {
            if (!settingsOpen) {
              e.currentTarget.style.background = _isLight ? 'rgba(240,241,243,0.95)' : 'rgba(30, 32, 36, 0.95)';
              e.currentTarget.style.borderColor = _isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)';
              e.currentTarget.style.color = _isLight ? '#000' : '#fff';
            }
          }}
          onMouseLeave={(e) => {
            if (!settingsOpen) {
              e.currentTarget.style.background = _isLight ? 'rgba(255,255,255,0.85)' : 'rgba(20, 21, 23, 0.85)';
              e.currentTarget.style.borderColor = _isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)';
              e.currentTarget.style.color = _isLight ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.7)';
            }
          }}
        >
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
        </div>
      </div>

      {/* 撤销 / 重做 按钮组 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: 28,
          background: bg,
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderRadius: 14,
          border: border,
          boxShadow: _isLight ? '0 4px 16px rgba(0,0,0,0.08)' : '0 4px 16px rgba(0,0,0,0.4)',
          padding: '0 4px',
          userSelect: 'none',
        }}
      >
        <button
          onClick={undo}
          disabled={!canUndo}
          title={`撤销 (${modKey}+Z)`}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 24,
            height: 20,
            borderRadius: 10,
            border: 'none',
            background: 'transparent',
            color: canUndo ? textColor : (_isLight ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.3)'),
            cursor: canUndo ? 'pointer' : 'not-allowed',
            transition: 'all 0.2s ease',
            outline: 'none',
          }}
          onMouseEnter={(e) => {
            if (canUndo) {
              e.currentTarget.style.background = _isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.08)';
            }
          }}
          onMouseLeave={(e) => {
            if (canUndo) {
              e.currentTarget.style.background = 'transparent';
            }
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7v6h6" />
            <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
          </svg>
        </button>

        <div style={{ width: 1, height: 12, background: dividerBg, margin: '0 2px' }} />

        <button
          onClick={redo}
          disabled={!canRedo}
          title={`重做 (${modKey}+Shift+Z)`}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 24,
            height: 20,
            borderRadius: 10,
            border: 'none',
            background: 'transparent',
            color: canRedo ? textColor : (_isLight ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.3)'),
            cursor: canRedo ? 'pointer' : 'not-allowed',
            transition: 'all 0.2s ease',
            outline: 'none',
          }}
          onMouseEnter={(e) => {
            if (canRedo) {
              e.currentTarget.style.background = _isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.08)';
            }
          }}
          onMouseLeave={(e) => {
            if (canRedo) {
              e.currentTarget.style.background = 'transparent';
            }
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 7v6h-6" />
            <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7" />
          </svg>
        </button>
      </div>

      {/* 缩放百分比按钮 */}
      <div ref={containerRef} style={{ position: 'relative' }}>
        {/* 弹窗菜单 */}
        {open && (
          <div
            style={{
              position: 'absolute',
              bottom: 40,
              left: 0,
              minWidth: 220,
              background: bg,
              backdropFilter: 'blur(30px) saturate(180%)',
              WebkitBackdropFilter: 'blur(30px) saturate(180%)',
              borderRadius: 20,
              border: border,
              boxShadow: shadow,
              padding: '8px',
              animation: 'zoomMenuFadeIn 0.15s ease-out',
              display: 'flex',
              flexDirection: 'column',
              zIndex: 1001,
            }}
          >
            {menuItems.map((item, idx) => (
              <React.Fragment key={idx}>
                <div
                  onClick={() => handleItemClick(item.action)}
                  className="pg-settings-menu-item"
                >
                  <span>{item.label}</span>
                  <span style={{
                    color: textMuted,
                    fontSize: 12,
                    fontWeight: 400,
                    letterSpacing: '0.5px',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                    marginLeft: 24,
                    whiteSpace: 'nowrap',
                  }}>
                    {item.shortcut}
                  </span>
                </div>
                {item.dividerAfter && (
                  <div style={{
                    height: 1,
                    background: dividerBg,
                    margin: '2px 0',
                  }} />
                )}
              </React.Fragment>
            ))}
          </div>
        )}

        <div
          onClick={() => {
            setOpen(prev => !prev);
            setSettingsOpen(false);
          }}
          title="缩放控制"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 40,
            height: 28,
            padding: '0 6px',
            background: open ? (_isLight ? 'rgba(240,241,243,0.95)' : 'rgba(30, 32, 36, 0.95)') : (_isLight ? 'rgba(255,255,255,0.85)' : 'rgba(20, 21, 23, 0.85)'),
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            borderRadius: 14,
            border: `1px solid ${open ? (_isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)') : (_isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)')}`,
            boxShadow: _isLight ? '0 4px 16px rgba(0,0,0,0.08)' : '0 4px 16px rgba(0,0,0,0.4)',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            color: open ? (_isLight ? '#000' : '#fff') : (_isLight ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.7)'),
            fontSize: 14,
            fontWeight: 500,
            letterSpacing: '0.5px',
            userSelect: 'none',
          }}
          onMouseEnter={(e) => {
            if (!open) {
              e.currentTarget.style.background = _isLight ? 'rgba(240,241,243,0.95)' : 'rgba(30, 32, 36, 0.95)';
              e.currentTarget.style.borderColor = _isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)';
              e.currentTarget.style.color = _isLight ? '#000' : '#fff';
            }
          }}
          onMouseLeave={(e) => {
            if (!open) {
              e.currentTarget.style.background = _isLight ? 'rgba(255,255,255,0.85)' : 'rgba(20, 21, 23, 0.85)';
              e.currentTarget.style.borderColor = _isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)';
              e.currentTarget.style.color = _isLight ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.7)';
            }
          }}
        >
          {percent}%
        </div>
      </div>

      {/* 快捷键弹窗 */}
      <Modal
        title="快捷键"
        open={isShortcutsOpen}
        onCancel={() => setIsShortcutsOpen(false)}
        footer={null}
        width={420}
        {...getSharedModalStyles(_isLight)}
      >
        <Table
          dataSource={[
            { key: 'undo', action: '撤销', shortcut: `${modKey} Z` },
            { key: 'redo', action: '重做', shortcut: `${modKey} Shift Z / ${modKey} Y` },
            { key: '1', action: '放大', shortcut: `${modKey} +` },
            { key: '2', action: '缩小', shortcut: `${modKey} -` },
            { key: '3', action: '缩放到 100%', shortcut: `${shiftKey} 0` },
            { key: '4', action: '缩放适应画布', shortcut: `${shiftKey} 1` },
            { key: '5', action: '缩放到选区', shortcut: `${shiftKey} 2` },
            { key: '6', action: '平移画布', shortcut: 'Space + 鼠标拖拽 或 鼠标中键拖拽' },
            { key: 'multiselect', action: '多选节点', shortcut: `${modKey} + 鼠标点击` },
          ]}
          columns={[
            { title: '功能', dataIndex: 'action', key: 'action' },
            { 
              title: '快捷键', 
              dataIndex: 'shortcut', 
              key: 'shortcut',
              render: (text) => <code style={{ background: _isLight ? '#f4f4f5' : '#27272a', padding: '2px 6px', borderRadius: 4, fontSize: 12, color: textColor }}>{text}</code>
            },
          ]}
          pagination={false}
          size="small"
        />
      </Modal>

      {/* 新变化弹窗 */}
      <Modal
        title="新变化"
        open={isWhatsNewOpen}
        onCancel={() => setIsWhatsNewOpen(false)}
        footer={null}
        width={460}
        {...getSharedModalStyles(_isLight)}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <h4 style={{ fontWeight: 600, fontSize: 14, color: textColor, margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#10b981' }}></span>
              火山画质增强功能上线
            </h4>
            <p style={{ fontSize: 13, color: textMuted, margin: 0, paddingLeft: 14 }}>
              创作中心正式上线火山画质增强节点，可大幅提升视频素材的分辨率、帧率及画质细节。
            </p>
          </div>
          <div>
            <h4 style={{ fontWeight: 600, fontSize: 14, color: textColor, margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#10b981' }}></span>
              连接线智能重新绑定
            </h4>
            <p style={{ fontSize: 13, color: textMuted, margin: 0, paddingLeft: 14 }}>
              当节点断开与其父层级节点的连接时，你现在可以直接拖拽连接线重新将其绑定到新的父节点上，操作更为人性化。
            </p>
          </div>
          <div>
            <h4 style={{ fontWeight: 600, fontSize: 14, color: textColor, margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#10b981' }}></span>
              全新设计的偏好设置
            </h4>
            <p style={{ fontSize: 13, color: textMuted, margin: 0, paddingLeft: 14 }}>
              采用精致的 Shadcn UI 风格重构了设置菜单，能够更直观地选择和切换主题风格与页面模式。
            </p>
          </div>
        </div>
      </Modal>

      {/* 发送反馈弹窗 */}
      <Modal
        title="发送反馈"
        open={isFeedbackOpen}
        onCancel={() => {
          setIsFeedbackOpen(false);
          setFeedbackText('');
        }}
        onOk={async () => {
          if (!feedbackText.trim()) {
            toast.warning('请输入您的反馈内容');
            return;
          }
          setSubmittingFeedback(true);
          await new Promise((resolve) => setTimeout(resolve, 800));
          setSubmittingFeedback(false);
          toast.success('反馈提交成功！非常感谢您的支持。');
          setIsFeedbackOpen(false);
          setFeedbackText('');
        }}
        confirmLoading={submittingFeedback}
        okText="提交"
        cancelText="取消"
        {...getSharedModalStyles(_isLight)}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 13, color: textMuted }}>
            欢迎在此输入您的反馈或遇到的问题，我们将认真对待每一条建议：
          </div>
          <Input.TextArea
            rows={4}
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            placeholder="请输入您的反馈..."
            maxLength={300}
          />
        </div>
      </Modal>
      
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
        .pg-settings-menu-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 4px 8px;
          border-radius: 6px;
          cursor: pointer;
          color: ${textColor};
          font-size: 13px;
          font-weight: 400;
          line-height: 18px;
          transition: background 0.12s ease;
          user-select: none;
          background: transparent;
        }
        .pg-settings-menu-item:hover {
          background: ${hoverBg};
        }
      `}</style>
    </div>
  );
});

ZoomIndicator.displayName = 'ZoomIndicator';
export default ZoomIndicator;
