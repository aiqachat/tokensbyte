/**
 * Playground 主组件 — 项目画布工作台
 * 通过 URL 参数 projectId 确定当前项目
 */
import React from 'react';
import { ConfigProvider, theme } from 'antd';
import { useParams, Navigate } from 'react-router-dom';
import { PlaygroundProvider } from './context/PlaygroundContext';
import InfiniteCanvas from './components/InfiniteCanvas';
import FloatingHeader from './components/FloatingHeader';
import FloatingToolbar from './components/FloatingToolbar';
import PromptInput from './components/PromptInput';
import SettingsWidget from './components/SettingsWidget';
import ModelDrawer from './components/ModelDrawer';
import TokenModal from './components/TokenModal';
import ZoomIndicator from './components/ZoomIndicator';
import './Playground.css';

/** 内部布局层，在 Provider 内部消费 Context */
const PlaygroundLayout: React.FC = () => {
  return (
    <div style={{ height: '100vh', width: '100vw', overflow: 'hidden', background: '#090A0B', position: 'relative' }}>
      {/* 全屏画布视口 */}
      <div style={{ width: '100vw', height: '100vh', position: 'absolute', inset: 0, overflow: 'hidden' }}>
        <InfiniteCanvas />
        <PromptInput />
        <FloatingToolbar />
      </div>

      {/* 悬浮 UI 层 */}
      <FloatingHeader />
      <ZoomIndicator />
      <SettingsWidget />

      {/* 弹出层 */}
      <ModelDrawer />
      <TokenModal />
    </div>
  );
};

/** 根组件：从 URL 获取 projectId → 提供主题 + 状态 */
const Playground: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();

  // 无 projectId 时回退到项目列表
  if (!projectId) return <Navigate to="/playground" replace />;

  const numericProjectId = parseInt(projectId, 10);
  if (isNaN(numericProjectId)) return <Navigate to="/playground" replace />;

  return (
    <ConfigProvider theme={{
      algorithm: theme.darkAlgorithm,
      token: {
        colorPrimary: '#A2C1FF',
        borderRadius: 12,
        colorBgContainer: '#1E1F22',
        colorBorder: 'rgba(255,255,255,0.08)'
      }
    }}>
      <PlaygroundProvider projectId={numericProjectId}>
        <PlaygroundLayout />
      </PlaygroundProvider>
    </ConfigProvider>
  );
};

export default Playground;
