/**
 * 左侧浮动工具胶囊栏
 * 指针/抓手/画笔/重置视图等工具按钮
 */
import React, { useRef } from 'react';
import { Button, Tooltip, message } from 'antd';
import {
  EditOutlined, PictureOutlined, BgColorsOutlined,
  StarOutlined, AppstoreOutlined, FolderOpenOutlined
} from '@ant-design/icons';
import { useCanvas, usePlayground } from '../context/PlaygroundContext';

const FloatingToolbar: React.FC = React.memo(() => {
  const { activeTool, setActiveTool, canvasTransform, setNodes, maxZIndex, setMaxZIndex } = useCanvas();
  const { 
    isResourceWidgetVisible, setIsResourceWidgetVisible,
    isSettingsWidgetVisible, setIsSettingsWidgetVisible
  } = usePlayground();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 50 * 1024 * 1024) {
      message.error(`${file.name} 大小超过 50MB，已跳过`);
      e.target.value = '';
      return;
    }

    const url = URL.createObjectURL(file);
    const isVideo = file.type.startsWith('video');
    const isAudio = file.type.startsWith('audio');
    const assetType = isVideo ? 'video' : isAudio ? 'audio' : 'image';

    // Calculate center of screen in canvas coordinates
    const rect = document.body.getBoundingClientRect();
    const viewCenterX = rect.width / 2;
    const viewCenterY = rect.height / 2;
    const nodeX = (viewCenterX - canvasTransform.x) / canvasTransform.scale;
    const nodeY = (viewCenterY - canvasTransform.y) / canvasTransform.scale;

    const newZIndex = maxZIndex + 1;
    setMaxZIndex(newZIndex);

    const newNode: any = {
      id: `local-asset-${Date.now()}-${Math.random()}`,
      type: assetType,
      status: 'completed',
      taskData: { prompt: file.name },
      resultData: assetType === 'image' 
        ? { data: [{ url }] } 
        : { content: { video_url: url } }, // works for both video and audio node content rendering
      x: nodeX - 160,
      y: nodeY - (assetType === 'audio' ? 40 : 160),
      width: 320,
      height: assetType === 'audio' ? 80 : 320,
      zIndex: newZIndex
    };

    setNodes(prev => [...prev, newNode]);
    message.success('已插入本地素材');

    if (e.target) {
      e.target.value = '';
    }
  };

  return (
    <div style={{
      position: 'absolute', right: 24, top: '50%', transform: 'translateY(-50%)',
      display: 'flex', flexDirection: 'column', gap: 8,
      background: 'rgba(20,21,23,0.85)', backdropFilter: 'blur(12px)',
      padding: '10px 6px', borderRadius: 30,
      border: '1px solid rgba(255,255,255,0.05)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)', zIndex: 1000
    }} onWheel={(e) => e.stopPropagation()}>
      <Tooltip title="指针工具 (V)" placement="left">
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
            width: 32, height: 32, minWidth: 32,
            background: activeTool === 'pointer' ? '#A2C1FF' : 'transparent',
            color: activeTool === 'pointer' ? '#000' : 'rgba(255,255,255,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
        />
      </Tooltip>

      <Tooltip title="选框工具 (M) - 即将开放" placement="left">
        <Button shape="circle" type="text"
          icon={
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            </svg>
          }
          style={{ width: 32, height: 32, minWidth: 32, color: 'rgba(255,255,255,0.3)', cursor: 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        />
      </Tooltip>

      <Tooltip title="画笔编辑 (P) - 即将开放" placement="left">
        <Button shape="circle" type="text" icon={<EditOutlined style={{ fontSize: 16 }} />}
          style={{ width: 32, height: 32, minWidth: 32, color: 'rgba(255,255,255,0.3)', cursor: 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        />
      </Tooltip>

      <Tooltip title="抓手工具 (Space)" placement="left">
        <Button
          shape="circle"
          type={activeTool === 'hand' ? 'primary' : 'text'}
          onClick={() => setActiveTool('hand')}
          icon={
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0a2 2 0 0 0-2 2v0a2 2 0 0 0-2 2v10a4 4 0 0 1-8 0V7a2 2 0 0 0-4 0v11a8 8 0 0 0 16 0V11z" />
            </svg>
          }
          style={{
            width: 32, height: 32, minWidth: 32,
            background: activeTool === 'hand' ? '#A2C1FF' : 'transparent',
            color: activeTool === 'hand' ? '#000' : 'rgba(255,255,255,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
        />
      </Tooltip>

      <Tooltip title="插入图片/视频/声音" placement="left">
        <Button shape="circle" type="text" icon={<PictureOutlined style={{ fontSize: 16 }} />}
          onClick={() => fileInputRef.current?.click()}
          style={{ width: 32, height: 32, minWidth: 32, color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        />
      </Tooltip>

      <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '4px 6px' }} />

      <Tooltip title="节点调色板 - 即将开放" placement="left">
        <Button shape="circle" type="text" icon={<BgColorsOutlined style={{ fontSize: 16 }} />}
          style={{ width: 32, height: 32, minWidth: 32, color: 'rgba(255,255,255,0.3)', cursor: 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        />
      </Tooltip>
      <Tooltip title="模型选择器" placement="left">
        <Button
          shape="circle"
          type={isSettingsWidgetVisible ? 'primary' : 'text'}
          onClick={() => setIsSettingsWidgetVisible(!isSettingsWidgetVisible)}
          icon={<AppstoreOutlined style={{ fontSize: 16 }} />}
          style={{
            width: 32, height: 32, minWidth: 32,
            background: isSettingsWidgetVisible ? '#A2C1FF' : 'transparent',
            color: isSettingsWidgetVisible ? '#000' : 'rgba(255,255,255,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
        />
      </Tooltip>
      <Tooltip title="资源管理器" placement="left">
        <Button
          shape="circle"
          type={isResourceWidgetVisible ? 'primary' : 'text'}
          onClick={() => setIsResourceWidgetVisible(!isResourceWidgetVisible)}
          icon={<FolderOpenOutlined style={{ fontSize: 16 }} />}
          style={{
            width: 32, height: 32, minWidth: 32,
            background: isResourceWidgetVisible ? '#A2C1FF' : 'transparent',
            color: isResourceWidgetVisible ? '#000' : 'rgba(255,255,255,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
        />
      </Tooltip>

      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        onChange={handleFileChange}
        accept="image/*,video/*,audio/*"
      />
    </div>
  );
});

FloatingToolbar.displayName = 'FloatingToolbar';
export default FloatingToolbar;
