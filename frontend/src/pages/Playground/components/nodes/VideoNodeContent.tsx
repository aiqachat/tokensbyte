/**
 * 视频类型节点内容
 */
import React from 'react';
import { Typography } from 'antd';

const { Text } = Typography;

interface Props {
  resultData: any;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const getFullUrl = (url: string) => {
  if (!url) return '';
  if (!url.startsWith('http') && !url.startsWith('/')) return `https://${url}`;
  if (url.startsWith('/')) return `${API_BASE_URL}${url}`;
  return url;
};

const VideoNodeContent: React.FC<Props> = React.memo(({ resultData }) => {
  const rawUrl = resultData?.content?.video_url || resultData?.final_result?.video_url || resultData?.video_url;
  const videoUrl = getFullUrl(rawUrl);
  return videoUrl
    ? (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
          <video src={videoUrl} controls loop style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          {/* 透明拖拽层，覆盖除了底部 controls (约 50px) 外的区域 */}
          <div style={{ position: 'absolute', inset: '0 0 50px 0', cursor: 'inherit' }} />
        </div>
      )
    : <Text style={{ color: '#ff4d4f' }}>无效的视频 URL</Text>;
});

VideoNodeContent.displayName = 'VideoNodeContent';
export default VideoNodeContent;
