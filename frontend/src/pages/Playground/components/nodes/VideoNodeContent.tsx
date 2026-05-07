/**
 * 视频类型节点内容
 * 默认状态下透明拖拽层覆盖视频，保证与图片节点一致的拖拽体验。
 * 双击节点可激活视频播放控件进行播放操作。
 */
import React, { useRef } from 'react';
import { Typography } from 'antd';

const { Text } = Typography;

import { useCanvas } from '../../context/PlaygroundContext';

interface Props {
  resultData: any;
  node: any;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const getFullUrl = (url: string) => {
  if (!url) return '';
  if (url.startsWith('blob:') || url.startsWith('data:')) return url;
  if (!url.startsWith('http') && !url.startsWith('/')) return `https://${url}`;
  if (url.startsWith('/')) return `${API_BASE_URL}${url}`;
  return url;
};

const VideoNodeContent: React.FC<Props> = React.memo(({ resultData, node }) => {
  const { setNodes } = useCanvas();
  const videoRef = useRef<HTMLVideoElement>(null);
  const dragStart = useRef({ x: 0, y: 0 });

  const rawUrl = resultData?.content?.video_url || resultData?.final_result?.video_url || resultData?.video_url;
  const videoUrl = getFullUrl(rawUrl);

  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
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
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
          <video
            ref={videoRef}
            src={videoUrl}
            controls
            loop
            disablePictureInPicture
            controlsList="nopictureinpicture"
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
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
            onClick={(e) => {
              const dx = Math.abs(e.clientX - dragStart.current.x);
              const dy = Math.abs(e.clientY - dragStart.current.y);
              // 如果偏移量极小，认为是点击而不是拖拽
              if (dx < 5 && dy < 5) {
                if (videoRef.current) {
                  if (videoRef.current.paused) {
                    videoRef.current.play();
                  } else {
                    videoRef.current.pause();
                  }
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
