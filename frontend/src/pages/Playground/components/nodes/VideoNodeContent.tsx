/**
 * 视频类型节点内容
 * 默认状态下透明拖拽层覆盖视频，保证与图片节点一致的拖拽体验。
 * 双击节点可激活视频播放控件进行播放操作。
 */
import React, { useRef, useState } from 'react';
import { Typography, Spin } from 'antd';

const { Text } = Typography;

import { useCanvas } from '../../context/PlaygroundContext';
import { getResultDisplayUrl } from '../../utils/resultExtractor';

interface Props {
  resultData: any;
  node: any;
}

const VideoNodeContent: React.FC<Props> = React.memo(({ resultData, node }) => {
  const { setNodes } = useCanvas();
  const videoRef = useRef<HTMLVideoElement>(null);
  const dragStart = useRef({ x: 0, y: 0 });
  const [isLoaded, setIsLoaded] = useState(false);

  const videoUrl = getResultDisplayUrl('video', resultData);

  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    setIsLoaded(true);
    const video = e.currentTarget;
    const videoW = video.videoWidth;
    const videoH = video.videoHeight;
    if (videoW && videoH && node && setNodes) {
      const aspectRatio = videoW / videoH;
      const currentAspectRatio = node.width / node.height;
      if (Math.abs(aspectRatio - currentAspectRatio) > 0.02) {
        const newWidth = node.height * aspectRatio;
        setNodes(prev => prev.map(n => n.id === node.id ? { ...n, width: newWidth } : n));
      }
    }
  };

  return videoUrl
    ? (
        <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {node.taskData?.agent_mode && (
            <div style={{
              position: 'absolute',
              top: 12,
              left: 12,
              background: 'rgba(22, 119, 255, 0.85)',
              color: '#fff',
              padding: '4px 10px',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 500,
              zIndex: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255,255,255,0.15)',
              pointerEvents: 'none',
              userSelect: 'none',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
            }}>
              <span>🤖</span>
              <span>AI智能体: {
                node.taskData?.agent_video_mode === 'autonomous' ? '自主决策' :
                node.taskData?.agent_video_mode === 'interactive' ? '交互录屏' : '操作轨迹'
              }</span>
            </div>
          )}
          {!isLoaded && (
            <div style={{ position: 'absolute', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 0 }}>
              <Spin size="small" />
            </div>
          )}
          <video
            ref={videoRef}
            src={videoUrl}
            controls
            loop
            disablePictureInPicture
            controlsList="nopictureinpicture"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              opacity: isLoaded ? 1 : 0,
              transition: 'opacity 0.3s ease',
            }}
            onLoadedMetadata={handleLoadedMetadata}
          />
          {/* 
            智能拖拽层：
            覆盖视频上半部分（避开底部 60px 的原生控制条）。
            既能捕获 mousedown 冒泡实现拖拽，又能通过点击实现快捷播放/暂停。
          */}
          <div
            onMouseDown={(e) => {
              dragStart.current = { x: e.clientX, y: e.clientY };
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (videoRef.current) {
                if (videoRef.current.paused) {
                  videoRef.current.play();
                } else {
                  videoRef.current.pause();
                }
              }
            }}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 60, // 为原生控件（如进度条、音量、全屏）留出足够的交互空间
              cursor: 'grab',
              zIndex: 1,
            }}
          />
        </div>
      )
    : <Text style={{ color: '#ff4d4f' }}>无效的视频 URL</Text>;
});

VideoNodeContent.displayName = 'VideoNodeContent';
export default VideoNodeContent;
