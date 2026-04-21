/**
 * 左侧浮动工具胶囊栏
 * 指针/抓手/画笔/重置视图等工具按钮
 */
import React from 'react';
import { Button, Tooltip } from 'antd';
import {
  EditOutlined, PictureOutlined, BgColorsOutlined,
  StarOutlined, FullscreenExitOutlined
} from '@ant-design/icons';
import { useCanvas } from '../context/PlaygroundContext';
import { useCanvasInteraction } from '../hooks/useCanvasInteraction';

const FloatingToolbar: React.FC = React.memo(() => {
  const { activeTool, setActiveTool } = useCanvas();
  const { resetView } = useCanvasInteraction();

  return (
    <div style={{
      position: 'absolute', left: 24, top: '50%', transform: 'translateY(-50%)',
      display: 'flex', flexDirection: 'column', gap: 12,
      background: 'rgba(20,21,23,0.85)', backdropFilter: 'blur(12px)',
      padding: '12px 8px', borderRadius: 30,
      border: '1px solid rgba(255,255,255,0.05)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)', zIndex: 1000
    }}>
      <Tooltip title="指针工具 (V)" placement="right">
        <Button
          shape="circle"
          type={activeTool === 'pointer' ? 'primary' : 'text'}
          onClick={() => setActiveTool('pointer')}
          icon={
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/>
            </svg>
          }
          style={{
            width: 40, height: 40,
            background: activeTool === 'pointer' ? '#A2C1FF' : 'transparent',
            color: activeTool === 'pointer' ? '#000' : 'rgba(255,255,255,0.6)',
          }}
        />
      </Tooltip>

      <Tooltip title="选框工具 (M) - 即将开放" placement="right">
        <Button shape="circle" type="text"
          icon={
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            </svg>
          }
          style={{ width: 40, height: 40, color: 'rgba(255,255,255,0.3)', cursor: 'not-allowed' }}
        />
      </Tooltip>

      <Tooltip title="画笔编辑 (P) - 即将开放" placement="right">
        <Button shape="circle" type="text" icon={<EditOutlined />}
          style={{ width: 40, height: 40, color: 'rgba(255,255,255,0.3)', cursor: 'not-allowed' }}
        />
      </Tooltip>

      <Tooltip title="抓手工具 (Space)" placement="right">
        <Button
          shape="circle"
          type={activeTool === 'hand' ? 'primary' : 'text'}
          onClick={() => setActiveTool('hand')}
          icon={
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0a2 2 0 0 0-2 2v0a2 2 0 0 0-2 2v10a4 4 0 0 1-8 0V7a2 2 0 0 0-4 0v11a8 8 0 0 0 16 0V11z" />
            </svg>
          }
          style={{
            width: 40, height: 40,
            background: activeTool === 'hand' ? '#A2C1FF' : 'transparent',
            color: activeTool === 'hand' ? '#000' : 'rgba(255,255,255,0.6)',
          }}
        />
      </Tooltip>

      <Tooltip title="插入外部图像 - 即将开放" placement="right">
        <Button shape="circle" type="text" icon={<PictureOutlined />}
          style={{ width: 40, height: 40, color: 'rgba(255,255,255,0.3)', cursor: 'not-allowed' }}
        />
      </Tooltip>

      <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '4px 8px' }} />

      <Tooltip title="节点调色板 - 即将开放" placement="right">
        <Button shape="circle" type="text" icon={<BgColorsOutlined />}
          style={{ width: 40, height: 40, color: 'rgba(255,255,255,0.3)', cursor: 'not-allowed' }}
        />
      </Tooltip>
      <Tooltip title="素材收藏夹 - 即将开放" placement="right">
        <Button shape="circle" type="text" icon={<StarOutlined />}
          style={{ width: 40, height: 40, color: 'rgba(255,255,255,0.3)', cursor: 'not-allowed' }}
        />
      </Tooltip>

      <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '4px 8px' }} />

      <Tooltip title="重置当前视图坐标" placement="right">
        <Button
          shape="circle" type="text"
          onClick={resetView}
          icon={<FullscreenExitOutlined />}
          style={{ width: 40, height: 40, color: 'rgba(255,255,255,0.6)' }}
        />
      </Tooltip>
    </div>
  );
});

FloatingToolbar.displayName = 'FloatingToolbar';
export default FloatingToolbar;
