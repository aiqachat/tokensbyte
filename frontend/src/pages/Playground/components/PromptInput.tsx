/**
 * 底部悬浮提示词输入框（重新设计）
 * 参考现代 AI Agent 输入框设计：
 * - 上层：干净的文本输入区域
 * - 下层：功能芯片栏（模型选择、API 密钥、附加功能按钮）+ 运行按钮
 */
import React, { useState, useRef } from 'react';
import { Input, Tooltip, message, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import {
  KeyOutlined, PlayCircleOutlined, AppstoreOutlined,
  LinkOutlined, PlusOutlined, AudioOutlined,
  CloseOutlined, ThunderboltOutlined,
  PaperClipOutlined, PictureOutlined, VideoCameraOutlined,
  CloudOutlined, UploadOutlined,
} from '@ant-design/icons';
import { usePlayground } from '../context/PlaygroundContext';
import { useGeneration } from '../hooks/useGeneration';
import { getCategoryLabel } from '../constants';
import AssetPickerModal from './AssetPickerModal';
import ImageEditorModal from './ImageEditorModal';
import type { PluginAsset } from '../../../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const { TextArea } = Input;

/** 检测是否为 Mac 系统 */
const isMac = (): boolean => {
  if (typeof navigator !== 'undefined') {
    return /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  }
  return false;
};

const PromptInput: React.FC = React.memo(() => {
  const {
    prompt, setPrompt,
    currentModel, activeCategory,
    selectedTokenKey, apiTokens,
    generating,
    setIsTokenModalVisible,
    setIsModelDrawerVisible,
    attachedAsset, setAttachedAsset,
  } = usePlayground();
  const { handleGenerate } = useGeneration();
  const [isFocused, setIsFocused] = useState(false);
  const [isAssetPickerOpen, setIsAssetPickerOpen] = useState(false);
  const [isImageEditorOpen, setIsImageEditorOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        message.error('文件大小不能超过 10MB');
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
      const url = URL.createObjectURL(file);
      const isVideo = file.type.startsWith('video');
      const isAudio = file.type.startsWith('audio');
      const assetType = isVideo ? 'video' : isAudio ? 'audio' : 'image';
      const mockAsset = {
        id: Date.now(),
        file_name: file.name,
        asset_type: assetType,
        size: file.size,
        file_url: url
      };
      setAttachedAsset({ asset: mockAsset as any, fullUrl: url, file });
      message.success(`已附加本地文件: ${file.name}`);
    }
    if (e.target) {
      e.target.value = '';
    }
  };

  const handleMenuClick: MenuProps['onClick'] = (e) => {
    if (e.key === 'asset-library') {
      setIsAssetPickerOpen(true);
    } else if (e.key === 'local-upload') {
      fileInputRef.current?.click();
    }
  };

  const dropdownItems: MenuProps['items'] = [
    {
      key: 'asset-library',
      label: '从资产库选择',
      icon: <CloudOutlined />,
    },
    {
      key: 'local-upload',
      label: '本地上传文件',
      icon: <UploadOutlined />,
    },
  ];

  const modSymbol = isMac() ? '⌘' : 'Ctrl';
  const tokenName = selectedTokenKey
    ? (apiTokens.find(t => t.token_key === selectedTokenKey)?.name || 'Token')
    : null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    // ⌘+Enter 或 Ctrl+Enter 快捷发送
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (currentModel && prompt.trim() && !generating) {
        handleGenerate();
      }
    }
  };

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'calc(100% - 48px)',
        maxWidth: 720,
        background: 'rgba(22, 23, 26, 0.92)',
        backdropFilter: 'blur(20px)',
        borderRadius: 20,
        border: `1px solid ${isFocused ? 'rgba(162, 193, 255, 0.25)' : 'rgba(255,255,255,0.08)'}`,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: isFocused
          ? '0 24px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(162, 193, 255, 0.08)'
          : '0 24px 60px rgba(0,0,0,0.5)',
        zIndex: 1000,
        transition: 'border-color 0.3s ease, box-shadow 0.3s ease',
      }}
      onWheel={(e) => e.stopPropagation()}
    >
      {/* 已附加的素材预览 */}
      {attachedAsset && (
        <div style={{
          padding: '12px 16px 0 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <div style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 64,
            height: 64,
            borderRadius: 8,
            overflow: 'hidden',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            flexShrink: 0,
            background: 'rgba(0,0,0,0.2)',
          }}>
            {/* 缩略图 */}
            {(() => {
              const ext = attachedAsset.asset.file_name.split('.').pop()?.toLowerCase() || '';
              const isVideo = attachedAsset.asset.asset_type === 'video' || ['mp4','mov','webm','avi','mkv'].includes(ext);
              const isAudio = attachedAsset.asset.asset_type === 'audio' || ['mp3','wav','aac','flac','ogg','m4a'].includes(ext);
              if (isAudio) {
                return (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <AudioOutlined style={{ fontSize: 24, color: '#1677ff' }} />
                  </div>
                );
              }
              if (isVideo) {
                return (
                  <div style={{ width: '100%', height: '100%', position: 'relative' }}>
                    <video src={attachedAsset.fullUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted preload="metadata" />
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)' }}>
                      <VideoCameraOutlined style={{ fontSize: 20, color: '#fff' }} />
                    </div>
                  </div>
                );
              }
              return (
                <div 
                  onClick={() => setIsImageEditorOpen(true)}
                  style={{ width: '100%', height: '100%', cursor: 'pointer', position: 'relative' }}
                  title="点击放大并编辑图片"
                >
                  <img
                    src={attachedAsset.fullUrl}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  <div className="hover-edit-overlay" style={{
                    position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', 
                    display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.2s'
                  }}>
                    <PictureOutlined style={{ fontSize: 16, color: '#fff' }} />
                  </div>
                  <style>{`
                    .hover-edit-overlay:hover { opacity: 1 !important; }
                  `}</style>
                </div>
              );
            })()}
            {/* 关闭按钮 */}
            <div
              onClick={() => setAttachedAsset(null)}
              style={{
                position: 'absolute',
                top: 4,
                right: 4,
                width: 20,
                height: 20,
                borderRadius: '50%',
                background: 'rgba(0,0,0,0.5)',
                backdropFilter: 'blur(4px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s',
                color: '#fff',
                zIndex: 10,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,77,79,0.9)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.5)'; }}
            >
              <CloseOutlined style={{ fontSize: 10 }} />
            </div>
          </div>
        </div>
      )}

      {/* 输入区域 */}
      <TextArea
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        placeholder={
          currentModel
            ? `Start typing a prompt to create ${getCategoryLabel(activeCategory)}...`
            : '请先在右侧面板选择一个模型...'
        }
        autoSize={{ minRows: 2, maxRows: 8 }}
        bordered={false}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        style={{
          color: '#E8EAED',
          resize: 'none',
          padding: attachedAsset ? '8px 20px 8px 20px' : '18px 20px 8px 20px',
          fontSize: 15,
          lineHeight: '1.6',
          background: 'transparent',
          letterSpacing: '0.2px',
        }}
        onKeyDown={handleKeyDown}
      />

      {/* 底部工具栏 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 12px 12px 12px',
          gap: 8,
        }}
      >
        {/* 左侧功能芯片区 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
          {/* 模型快捷切换按钮 */}
          <Tooltip title="切换模型">
            <div
              onClick={() => setIsModelDrawerVisible(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '5px 12px',
                background: 'rgba(162, 193, 255, 0.1)',
                border: '1px solid rgba(162, 193, 255, 0.2)',
                borderRadius: 8,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                color: '#A2C1FF',
                fontSize: 13,
                fontWeight: 500,
                whiteSpace: 'nowrap',
                maxWidth: 180,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(162, 193, 255, 0.18)';
                e.currentTarget.style.borderColor = 'rgba(162, 193, 255, 0.35)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(162, 193, 255, 0.1)';
                e.currentTarget.style.borderColor = 'rgba(162, 193, 255, 0.2)';
              }}
            >
              <AppstoreOutlined style={{ fontSize: 13, flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {currentModel?.name || '选择模型'}
              </span>
            </div>
          </Tooltip>

          {/* API 密钥芯片 */}
          <Tooltip title={tokenName ? '点击更换 API 密钥' : '请选择 API 密钥'}>
            <div
              onClick={() => setIsTokenModalVisible(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '5px 10px',
                background: tokenName
                  ? 'rgba(255,255,255,0.05)'
                  : 'rgba(255, 77, 79, 0.08)',
                border: `1px solid ${tokenName ? 'rgba(255,255,255,0.1)' : 'rgba(255, 77, 79, 0.25)'}`,
                borderRadius: 8,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                color: tokenName ? 'rgba(255,255,255,0.65)' : '#ff4d4f',
                fontSize: 13,
                fontWeight: 400,
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = tokenName
                  ? 'rgba(255,255,255,0.1)'
                  : 'rgba(255, 77, 79, 0.14)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = tokenName
                  ? 'rgba(255,255,255,0.05)'
                  : 'rgba(255, 77, 79, 0.08)';
              }}
            >
              <KeyOutlined style={{ fontSize: 12, flexShrink: 0 }} />
              <span>{tokenName || '未选密钥'}</span>
              {tokenName && (
                <CloseOutlined
                  style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginLeft: 2 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsTokenModalVisible(true);
                  }}
                />
              )}
            </div>
          </Tooltip>

          {/* 分隔符 */}
          <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.06)', margin: '0 2px', flexShrink: 0 }} />

          {/* 附加功能占位按钮 */}
          <Tooltip title="语音输入 — 即将开放">
            <div
              onClick={() => message.info('语音输入功能即将开放')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 30,
                height: 30,
                borderRadius: 8,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                color: 'rgba(255,255,255,0.3)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                e.currentTarget.style.color = 'rgba(255,255,255,0.6)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'rgba(255,255,255,0.3)';
              }}
            >
              <AudioOutlined style={{ fontSize: 14 }} />
            </div>
          </Tooltip>

          <Dropdown menu={{ items: dropdownItems, onClick: handleMenuClick }} trigger={['click']} placement="topLeft">
            <Tooltip title="添加附件">
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  color: attachedAsset ? '#1677ff' : 'rgba(255,255,255,0.3)',
                  background: attachedAsset ? 'rgba(22,119,255,0.1)' : 'transparent',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = attachedAsset ? 'rgba(22,119,255,0.18)' : 'rgba(255,255,255,0.06)';
                  e.currentTarget.style.color = attachedAsset ? '#1677ff' : 'rgba(255,255,255,0.6)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = attachedAsset ? 'rgba(22,119,255,0.1)' : 'transparent';
                  e.currentTarget.style.color = attachedAsset ? '#1677ff' : 'rgba(255,255,255,0.3)';
                }}
              >
                <PlusOutlined style={{ fontSize: 14 }} />
              </div>
            </Tooltip>
          </Dropdown>
        </div>

        {/* 右侧运行按钮 */}
        <div
          onClick={() => {
            if (currentModel && prompt.trim() && !generating) {
              handleGenerate();
            }
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 16px',
            borderRadius: 10,
            cursor: currentModel && prompt.trim() && !generating ? 'pointer' : 'not-allowed',
            transition: 'all 0.25s ease',
            background: currentModel && prompt.trim() && !generating
              ? 'linear-gradient(135deg, rgba(102,126,234,0.9) 0%, rgba(118,75,162,0.9) 100%)'
              : 'rgba(255,255,255,0.04)',
            color: currentModel && prompt.trim() && !generating
              ? '#fff'
              : 'rgba(255,255,255,0.25)',
            fontSize: 13,
            fontWeight: 500,
            letterSpacing: '0.3px',
            boxShadow: currentModel && prompt.trim() && !generating
              ? '0 4px 12px rgba(102,126,234,0.3)'
              : 'none',
            whiteSpace: 'nowrap',
            userSelect: 'none',
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            if (currentModel && prompt.trim() && !generating) {
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(102,126,234,0.45)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            if (currentModel && prompt.trim() && !generating) {
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(102,126,234,0.3)';
            }
          }}
        >
          {generating ? (
            <>
              <ThunderboltOutlined style={{ fontSize: 14, animation: 'pulse 1s infinite' }} />
              <span>生成中...</span>
            </>
          ) : (
            <>
              <PlayCircleOutlined style={{ fontSize: 14 }} />
              <span>Run</span>
              <span style={{
                fontSize: 12,
                opacity: 0.65,
                marginLeft: 2,
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
              }}>
                {modSymbol} ↵
              </span>
            </>
          )}
        </div>
      </div>

      {/* 生成中脉冲动画 */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>

      {/* 资产库选择弹窗 */}
      <AssetPickerModal
        open={isAssetPickerOpen}
        onClose={() => setIsAssetPickerOpen(false)}
        onSelect={(asset, fullUrl) => {
          setAttachedAsset({ asset, fullUrl });
          message.success(`已附加素材: ${asset.file_name}`);
        }}
      />

      {/* 图片放大预览与编辑弹窗 */}
      {attachedAsset && attachedAsset.asset.asset_type === 'image' && (
        <ImageEditorModal
          open={isImageEditorOpen}
          imageUrl={attachedAsset.fullUrl}
          onCancel={() => setIsImageEditorOpen(false)}
          onSave={(newUrl, file) => {
            const mockAsset = {
              ...attachedAsset.asset,
              file_name: file.name,
              size: file.size,
              file_url: newUrl,
            };
            setAttachedAsset({ asset: mockAsset, fullUrl: newUrl, file });
            setIsImageEditorOpen(false);
            message.success('图片编辑已保存');
          }}
        />
      )}

      {/* 隐藏的本地文件上传 */}
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

PromptInput.displayName = 'PromptInput';
export default PromptInput;
