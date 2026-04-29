import React from 'react';
import { AudioOutlined } from '@ant-design/icons';

interface Props {
  resultData: any;
}

const AudioNodeContent: React.FC<Props> = React.memo(({ resultData }) => {
  const audioUrl = resultData?.content?.video_url || resultData?.content?.audio_url || resultData?.audio_url;

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, rgba(22, 23, 26, 0.9) 0%, rgba(30, 31, 35, 0.95) 100%)',
      padding: 16,
      gap: 16,
      boxSizing: 'border-box'
    }}>
      <div style={{
        width: 48,
        height: 48,
        borderRadius: '50%',
        background: 'rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '1px solid rgba(255, 255, 255, 0.2)'
      }}>
        <AudioOutlined style={{ fontSize: 24, color: '#fff' }} />
      </div>
      
      {audioUrl ? (
        <audio
          src={audioUrl}
          controls
          style={{ width: '100%', maxWidth: 300, outline: 'none' }}
          onMouseDown={(e) => e.stopPropagation()} // 防止点击进度条时触发节点拖拽
        />
      ) : (
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>音频地址无效</div>
      )}
    </div>
  );
});

AudioNodeContent.displayName = 'AudioNodeContent';
export default AudioNodeContent;
