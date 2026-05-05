/**
 * 视频类型节点内容
 * 包含原生的视频播放控件
 */
import React from 'react';
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
            src={videoUrl}
            controls
            loop
            disablePictureInPicture
            controlsList="nopictureinpicture"
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            onLoadedMetadata={handleLoadedMetadata}
          />
        </div>
      )
    : <Text style={{ color: '#ff4d4f' }}>无效的视频 URL</Text>;
});

VideoNodeContent.displayName = 'VideoNodeContent';
export default VideoNodeContent;
