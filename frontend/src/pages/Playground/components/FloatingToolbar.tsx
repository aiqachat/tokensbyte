/**
 * 左侧浮动工具胶囊栏
 * 指针/抓手/画笔/重置视图等工具按钮
 */
import React, { useRef } from 'react';
import { Button, Tooltip, message } from 'antd';
import {
  EditOutlined, PictureOutlined, BgColorsOutlined,
  StarFilled, StarOutlined
} from '@ant-design/icons';
import { useCanvas, usePlayground } from '../context/PlaygroundContext';
import { useThemeStore } from '../../../store/theme';

const FloatingToolbar: React.FC = React.memo(() => {
  const { 
    activeTool, setActiveTool, canvasTransform, setCanvasTransform, 
    nodes, setNodes, maxZIndex, setMaxZIndex, setSettingsWidgetPos, setResourceWidgetPos 
  } = useCanvas();
  const { 
    isResourceWidgetVisible, setIsResourceWidgetVisible,
    isSettingsWidgetVisible, setIsSettingsWidgetVisible
  } = usePlayground();
  const { themeMode } = useThemeStore();
  const _isLight = themeMode === 'light';

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
      taskData: { 
        prompt: file.name,
        file_size: file.size,
        file_format: file.type || file.name.split('.').pop()?.toUpperCase() || '未知',
        created_at: new Date().toISOString()
      },
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

  const handleRearrange = () => {
    if (nodes.length === 0) {
      message.info('当前没有素材可排版');
      return;
    }
    const TARGET_HEIGHT = 320;
    const GAP = 5;
    const COLS = Math.max(3, Math.ceil(Math.sqrt(nodes.length)));
    
    let currentX = 0;
    let currentY = 0;
    let maxRowWidth = 0;

    // 先按生成时间顺序排序，保证排版顺序绝对稳定（忽略 zIndex 带来的顺序干扰）
    const getOrder = (n: any) => {
      if (n.taskData?.created_at) return new Date(n.taskData.created_at).getTime();
      if (n.id.startsWith('asset-')) return parseInt(n.id.replace('asset-', '')) || 0;
      if (n.id.startsWith('local-asset-')) return parseInt(n.id.split('-')[2]) || 0;
      return parseInt(n.id.substring(0, 13)) || 0;
    };
    const sortedNodes = [...nodes].sort((a, b) => getOrder(a) - getOrder(b));

    const rebuiltNodes = sortedNodes.map((node: any, idx: number) => {
      const origW = node.width || 480;
      const origH = node.height || 320;
      const targetWidth = (origW / origH) * TARGET_HEIGHT;
      
      if (idx > 0 && idx % COLS === 0) {
        currentX = 0;
        currentY += TARGET_HEIGHT + GAP;
      }
      
      const newNode = {
        ...node,
        x: currentX, y: currentY,
        width: targetWidth, height: TARGET_HEIGHT,
      };
      
      currentX += targetWidth + GAP;
      if (currentX > maxRowWidth) {
        maxRowWidth = currentX;
      }
      
      return newNode;
    });

    setNodes(rebuiltNodes);
      
    // 计算边界框并居中缩放
    const totalWidth = maxRowWidth > 0 ? maxRowWidth - GAP : 0;
    const totalHeight = currentY + TARGET_HEIGHT;
    
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // 留出 20% 的边距
    const scaleX = (viewportWidth * 0.8) / (totalWidth || 1);
    const scaleY = (viewportHeight * 0.8) / (totalHeight || 1);
    const targetScale = Math.min(1, scaleX, scaleY);
    
    const translateX = (viewportWidth - totalWidth * targetScale) / 2;
    const translateY = (viewportHeight - totalHeight * targetScale) / 2;
    
    setCanvasTransform({ x: translateX, y: translateY, scale: targetScale });
    message.success('排版已重置');
  };

  return (
    <div style={{
      position: 'absolute', right: 24, top: '50%', transform: 'translateY(-50%)',
      display: 'flex', flexDirection: 'column', gap: 8,
      background: _isLight ? 'rgba(255,255,255,0.85)' : '#1e1f20', backdropFilter: 'blur(12px)',
      padding: '10px 6px', borderRadius: 32,
      border: _isLight ? '1px solid rgba(0,0,0,0.1)' : '1px solid #444746',
      boxShadow: _isLight ? '0 4px 12px rgba(0,0,0,0.08)' : '0 4px 6px rgba(0,0,0,0.3)', zIndex: 1000
    }} onWheel={(e) => e.stopPropagation()}>
      <Tooltip title="指针工具 (V)" placement="left">
        <Button
          shape="circle"
          type={activeTool === 'pointer' ? 'primary' : 'text'}
          onClick={() => setActiveTool('pointer')}
          icon={
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4l7.07 16.97 2.51-7.39 7.39-2.51L4 4z"/>
            </svg>
          }
          style={{
            width: 32, height: 32, minWidth: 32,
            background: activeTool === 'pointer' ? (_isLight ? 'rgba(22,119,255,0.1)' : 'rgba(168,199,250,0.12)') : 'transparent',
            color: activeTool === 'pointer' ? (_isLight ? '#1677ff' : '#A8C7FA') : (_isLight ? '#333' : '#E3E3E3'),
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
        />
      </Tooltip>

      <Tooltip title="选框工具 (M) - 即将开放" placement="left">
        <Button shape="circle" type="text"
          icon={
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 9V5a1 1 0 0 1 1-1h4 M15 4h4a1 1 0 0 1 1 1v4 M4 15v4a1 1 0 0 0 1 1h4 M16 20h-2 M20 16v-2 M17 17h6 M20 14v6" />
            </svg>
          }
          style={{ width: 32, height: 32, minWidth: 32, color: _isLight ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.8)', cursor: 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        />
      </Tooltip>

      <Tooltip title="画笔编辑 (P) - 即将开放" placement="left">
        <Button shape="circle" type="text" icon={<EditOutlined style={{ fontSize: 16 }} />}
          style={{ width: 32, height: 32, minWidth: 32, color: _isLight ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.8)', cursor: 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
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
            background: activeTool === 'hand' ? (_isLight ? 'rgba(22,119,255,0.1)' : 'rgba(168,199,250,0.12)') : 'transparent',
            color: activeTool === 'hand' ? (_isLight ? '#1677ff' : '#A8C7FA') : (_isLight ? '#333' : '#E3E3E3'),
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
        />
      </Tooltip>

      <Tooltip title="插入图片/视频/声音" placement="left">
        <Button shape="circle" type="text" icon={<PictureOutlined style={{ fontSize: 16 }} />}
          onClick={() => fileInputRef.current?.click()}
          style={{ width: 32, height: 32, minWidth: 32, color: _isLight ? '#333' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        />
      </Tooltip>

      <div style={{ height: 1, background: _isLight ? 'rgba(0,0,0,0.1)' : '#444746', margin: '4px 6px' }} />

      <Tooltip title="一键重排素材" placement="left">
        <Button shape="circle" type="text"
          onClick={handleRearrange}
          icon={
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7"></rect>
              <rect x="14" y="3" width="7" height="7"></rect>
              <rect x="14" y="14" width="7" height="7"></rect>
              <rect x="3" y="14" width="7" height="7"></rect>
            </svg>
          }
          style={{ width: 32, height: 32, minWidth: 32, color: _isLight ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        />
      </Tooltip>
      <Tooltip title="模型选择器" placement="left">
        <Button
          shape="circle"
          type={isSettingsWidgetVisible ? 'primary' : 'text'}
          onClick={() => {
            if (!isSettingsWidgetVisible) {
              setSettingsWidgetPos({ x: window.innerWidth - 440, y: 32 });
            }
            setIsSettingsWidgetVisible(!isSettingsWidgetVisible);
          }}
          icon={isSettingsWidgetVisible ? <StarFilled style={{ fontSize: 16 }} /> : <StarOutlined style={{ fontSize: 16 }} />}
          style={{
            width: 32, height: 32, minWidth: 32,
            background: isSettingsWidgetVisible ? (_isLight ? 'rgba(22,119,255,0.1)' : 'rgba(168,199,250,0.12)') : 'transparent',
            color: isSettingsWidgetVisible ? (_isLight ? '#1677ff' : '#A8C7FA') : (_isLight ? '#333' : '#E3E3E3'),
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
        />
      </Tooltip>
      <Tooltip title="资源管理器" placement="left">
        <Button
          shape="circle"
          type={isResourceWidgetVisible ? 'primary' : 'text'}
          onClick={() => {
            if (!isResourceWidgetVisible) {
              setResourceWidgetPos({ x: window.innerWidth - 400, y: 120 });
            }
            setIsResourceWidgetVisible(!isResourceWidgetVisible);
          }}
          icon={
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
          }
          style={{
            width: 32, height: 32, minWidth: 32,
            background: isResourceWidgetVisible ? (_isLight ? 'rgba(22,119,255,0.1)' : 'rgba(168,199,250,0.12)') : 'transparent',
            color: isResourceWidgetVisible ? (_isLight ? '#1677ff' : '#A8C7FA') : (_isLight ? '#333' : '#E3E3E3'),
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
