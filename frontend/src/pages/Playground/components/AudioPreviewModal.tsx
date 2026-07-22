/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import React from 'react';
import { Modal } from 'antd';
import { AudioOutlined } from '@ant-design/icons';
import { getSharedModalStyles } from '../utils/modalStyles';

interface AudioPreviewModalProps {
  open: boolean;
  audioUrl: string;
  fileName?: string;
  onCancel: () => void;
}

const AudioPreviewModal: React.FC<AudioPreviewModalProps> = ({ open, audioUrl, fileName, onCancel }) => {
  return (
    <Modal
      zIndex={3000}
      open={open}
      onCancel={onCancel}
      footer={null}
      width={420}
      centered
      destroyOnClose
      title={null}
      closable={false}
      {...getSharedModalStyles(false)}
      styles={{
        ...getSharedModalStyles(false).styles,
        body: { padding: '24px 20px', background: 'transparent' },
      }}
    >
      <div 
        style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
        onMouseDown={(e) => e.stopPropagation()} // 阻止拖拽和点击事件传导到 Playground 画布
      >
        {/* 顶部标题与关闭 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#fff', fontSize: 15, fontWeight: 500 }}>
            <AudioOutlined style={{ color: '#1677ff' }} />
            <span>音频预览</span>
          </div>
          <div 
            onClick={onCancel}
            style={{ 
              color: 'rgba(255,255,255,0.45)', 
              fontSize: 13, 
              cursor: 'pointer', 
              padding: '2px 8px',
              borderRadius: 4,
              background: 'rgba(255,255,255,0.06)',
              transition: 'all 0.2s',
              userSelect: 'none'
            }}
            onMouseEnter={e => e.currentTarget.style.color = '#fff'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.45)'}
          >
            关闭
          </div>
        </div>

        {/* 音频文件名 */}
        <div style={{ 
          color: 'rgba(255,255,255,0.85)', 
          fontSize: 13, 
          overflow: 'hidden', 
          textOverflow: 'ellipsis', 
          whiteSpace: 'nowrap',
          padding: '0 2px'
        }}>
          {fileName || '未命名音频'}
        </div>

        {/* 原生音频播放器 - 极简低耦合 */}
        <audio
          src={audioUrl}
          controls
          autoPlay
          style={{ width: '100%', outline: 'none' }}
        />
      </div>
    </Modal>
  );
};

export default AudioPreviewModal;
