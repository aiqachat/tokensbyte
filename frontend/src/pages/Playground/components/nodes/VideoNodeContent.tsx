/**
 * 视频类型节点内容
 */
import React from 'react';
import { Typography } from 'antd';

const { Text } = Typography;

interface Props {
  resultData: any;
}

const VideoNodeContent: React.FC<Props> = React.memo(({ resultData }) => {
  const videoUrl = resultData?.content?.video_url || resultData?.final_result?.video_url || resultData?.video_url;
  return videoUrl
    ? <video src={videoUrl} controls loop style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
    : <Text style={{ color: '#ff4d4f' }}>无效的视频 URL</Text>;
});

VideoNodeContent.displayName = 'VideoNodeContent';
export default VideoNodeContent;
