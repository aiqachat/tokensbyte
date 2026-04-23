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

/**
 * 内部布局层 — 在 Provider 内部消费 Context
 *
 * 层级架构（参见 .gemini/skills/playground_architecture.skill）：
 *   Layer 1: 无限画布层 (Canvas Layer)   — 跟随画布变换缩放
 *   Layer 2: 页面控制层 (UI Control Layer) — 固定位置，不跟随缩放
 *   Layer 3: 弹出层 (Overlay Layer)       — Modal / Drawer
 */
const PlaygroundLayout: React.FC = () => {
  return (
    <div style={{ height: '100vh', width: '100vw', overflow: 'hidden', background: '#090A0B', position: 'relative' }}>

      {/* ═══════════ Layer 1: 无限画布层 (Canvas Layer) ═══════════ */}
      {/* 画布视口容器 — 包含画布 + 固定位置面板，保证鼠标事件冒泡链完整 */}
      <div style={{ width: '100vw', height: '100vh', position: 'absolute', inset: 0, overflow: 'hidden' }}>
        <InfiniteCanvas />        {/* 画布容器 + 变换层（内部节点跟随缩放） */}
        <PromptInput />           {/* 底部居中 — 提示词输入框 */}
        <FloatingToolbar />       {/* 左侧居中 — 编辑工具栏 */}
      </div>

      {/* ═══════════ Layer 2: 页面控制层 (UI Control Layer) ═══════════ */}
      <FloatingHeader />          {/* 左上角 — 返回按钮 (固定) */}
      <ZoomIndicator />           {/* 右下角 — 缩放控制 (固定) */}
      <SettingsWidget />          {/* 右上角 — 模型选择器 (可拖拽) */}

      {/* ═══════════ Layer 3: 弹出层 (Overlay Layer) ═══════════ */}
      <ModelDrawer />             {/* 模型全景选择器抽屉 */}
      <TokenModal />              {/* API 密钥选择弹窗 */}
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
