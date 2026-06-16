/**
 * Playground 主组件 — 项目画布工作台
 * 通过 URL 参数 projectId 确定当前项目
 */
import React from 'react';
import { useThemeStore } from "../../store/theme";
import { ConfigProvider, theme, Tooltip } from 'antd';
import { useParams, Navigate } from 'react-router-dom';
import { PlaygroundProvider, usePlayground, useCanvas } from './context/PlaygroundContext';
import InfiniteCanvas from './components/InfiniteCanvas';
import ChatPanel from './components/ChatPanel';
import FloatingHeader from './components/FloatingHeader';
import FloatingToolbar from './components/FloatingToolbar';
import PromptInput from './components/PromptInput';
import SettingsWidget from './components/SettingsWidget';
import ResourceManagerWidget from './components/ResourceManagerWidget';
import GenerationLogWidget from './components/GenerationLogWidget';
import ModelDrawer from './components/ModelDrawer';
import TokenModal from './components/TokenModal';
import ZoomIndicator from './components/ZoomIndicator';
import { ControlOutlined } from '@ant-design/icons';
import './Playground.css';

/**
 * 内部布局层 — 在 Provider 内部消费 Context
 *
 * 层级架构（参见 .gemini/skills/playground_architecture.skill）：
 *   Layer 1: 无限画布层 (Canvas Layer)   — 跟随画布变换缩放
 *   Layer 2: 页面控制层 (UI Control Layer) — 固定位置，不跟随缩放
 *   Layer 3: 弹出层 (Overlay Layer)       — Modal / Drawer
 */
const PlaygroundLayout: React.FC = () => {
  const { themeMode } = useThemeStore();
  const _isLight = themeMode === 'light';
  const { currentModel, isSettingsWidgetVisible, setIsSettingsWidgetVisible, isModelDrawerVisible, setIsModelDrawerVisible, isGenLogVisible, setIsGenLogVisible } = usePlayground();
  const { setSelectedNodeId } = useCanvas();

  const [isMobile, setIsMobile] = React.useState(window.innerWidth <= 768);
  React.useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  React.useEffect(() => {
    if (isMobile) {
      setIsSettingsWidgetVisible(false);
    }
  }, [isMobile, setIsSettingsWidgetVisible]);

  // 聊天类模型使用对话面板，其他类型使用无限画布
  const isChatMode = currentModel?.scheme_type === 'chat';

  return (
    <div className="playground-root" style={{ display: 'flex', height: '100dvh', width: '100vw', overflow: 'hidden', background: _isLight ? '#ffffff' : '#1E1E20', position: 'fixed', inset: 0 }}>
      
      {/* ═══════════ 内容挤压层 ═══════════ */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', transition: 'all 0.3s cubic-bezier(0.2, 0, 0, 1)' }}>
        {isChatMode ? (
          <ChatPanel />
        ) : (
          <InfiniteCanvas isMobile={isMobile} />
        )}
        {!isMobile && <FloatingToolbar />}
        <PromptInput />
        <FloatingHeader />
        {!isChatMode && !isMobile && <ZoomIndicator />}
        <ResourceManagerWidget />
        <GenerationLogWidget />

        {/* 顶部悬浮切换按钮 (固定在内容区右上角) */}
        <Tooltip title={(!currentModel) ? '选择模型' : '模型属性配置'} placement="left">
          <div
            onClick={() => {
              if (!currentModel) {
                setIsModelDrawerVisible(true);
              } else {
                setIsSettingsWidgetVisible(!isSettingsWidgetVisible);
              }
            }}
            style={{
              position: 'absolute',
              top: isMobile ? 12 : 24,
              right: isMobile ? 12 : 24,
              width: isMobile ? 40 : 48,
              height: isMobile ? 40 : 48,
              borderRadius: isMobile ? 12 : 16,
              background: _isLight ? '#fff' : '#1e1f20',
              border: _isLight ? '2px solid #f0f0f0' : '2px solid #333',
              boxShadow: _isLight ? '0 2px 8px rgba(0,0,0,0.04)' : '0 2px 8px rgba(0,0,0,0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              zIndex: 1000,
              color: _isLight ? '#5f6368' : '#9aa0a6',
              opacity: (!isSettingsWidgetVisible && !isModelDrawerVisible) ? 1 : 0,
              pointerEvents: (!isSettingsWidgetVisible && !isModelDrawerVisible) ? 'auto' : 'none',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = _isLight ? '#f4f5f7' : '#2a2b2d';
              e.currentTarget.style.color = _isLight ? '#202124' : '#e8eaed';
              e.currentTarget.style.borderColor = _isLight ? '#e0e0e0' : '#444';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = _isLight ? '#fff' : '#1e1f20';
              e.currentTarget.style.color = _isLight ? '#5f6368' : '#9aa0a6';
              e.currentTarget.style.borderColor = _isLight ? '#f0f0f0' : '#333';
            }}
          >
            <ControlOutlined style={{ fontSize: isMobile ? 20 : 24, fontWeight: 'bold' }} />
          </div>
        </Tooltip>
      </div>

      {/* ═══════════ 右侧边栏层 ═══════════ */}
      <SettingsWidget />

      {/* 点击外部关闭 ModelDrawer 的透明遮罩层 */}
      <div 
        onClick={() => setIsModelDrawerVisible(false)}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'transparent',
          zIndex: 2100,
          opacity: isModelDrawerVisible && isMobile ? 1 : 0,
          pointerEvents: isModelDrawerVisible && isMobile ? 'auto' : 'none',
          transition: 'all 0.3s ease',
        }}
      />
      <ModelDrawer />

      {/* 移动端参数面板遮罩 (当 SettingsWidget 在移动端打开时显示) */}
      <div 
        onClick={() => setIsSettingsWidgetVisible(false)}
        style={{
          position: 'absolute',
          inset: 0,
          background: _isLight ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)',
          backdropFilter: 'blur(4px)',
          zIndex: 2098,
          opacity: (isMobile && isSettingsWidgetVisible) ? 1 : 0,
          pointerEvents: (isMobile && isSettingsWidgetVisible) ? 'auto' : 'none',
          transition: 'all 0.3s ease',
        }}
      />

      {/* 移动端项目创作记录遮罩 (当 GenerationLogWidget 在移动端打开时显示) */}
      <div 
        onClick={() => {
          setIsGenLogVisible(false);
          setSelectedNodeId(null);
        }}
        style={{
          position: 'absolute',
          inset: 0,
          background: _isLight ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)',
          backdropFilter: 'blur(4px)',
          zIndex: 999,
          opacity: (isMobile && isGenLogVisible) ? 1 : 0,
          pointerEvents: (isMobile && isGenLogVisible) ? 'auto' : 'none',
          transition: 'all 0.3s ease',
        }}
      />

      {/* ═══════════ 弹出层 ═══════════ */}
      <TokenModal />
    </div>
  );
};

/** 根组件：从 URL 获取 projectId → 提供主题 + 状态 */
const Playground: React.FC = () => {
  const { themeMode } = useThemeStore();
  const { projectId } = useParams<{ projectId: string }>();

  // 无 projectId 时回退到项目列表
  if (!projectId) return <Navigate to="/playground" replace />;

  const numericProjectId = parseInt(projectId, 10);
  if (isNaN(numericProjectId)) return <Navigate to="/playground" replace />;

  return (
    <ConfigProvider theme={{
      algorithm: themeMode === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
      token: {
        colorPrimary: themeMode === 'dark' ? '#fff' : '#1677ff',
        borderRadius: 12,
        colorBgContainer: themeMode === 'dark' ? '#1E1F22' : '#fff',
        colorBorder: themeMode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)'
      }
    }}>
      <PlaygroundProvider projectId={numericProjectId}>
        <PlaygroundLayout />
      </PlaygroundProvider>
    </ConfigProvider>
  );
};

export default Playground;
