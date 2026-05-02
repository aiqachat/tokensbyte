/**
 * 底部悬浮提示词输入框（重新设计）
 * 参考现代 AI Agent 输入框设计：
 * - 上层：干净的文本输入区域
 * - 下层：功能芯片栏（模型选择、API 密钥、附加功能按钮）+ 运行按钮
 */
import React, { useState, useRef, useCallback } from 'react';
import { Input, Tooltip, message, Dropdown, Modal, Switch } from 'antd';
import type { MenuProps } from 'antd';
import {
  KeyOutlined, PlayCircleOutlined, AppstoreOutlined,
  LinkOutlined, PlusOutlined, AudioOutlined,
  CloseOutlined, ThunderboltOutlined,
  PaperClipOutlined, PictureOutlined, VideoCameraOutlined,
  CloudOutlined, UploadOutlined, GlobalOutlined,
} from '@ant-design/icons';
import { usePlayground } from '../context/PlaygroundContext';
import { useGeneration } from '../hooks/useGeneration';
import { getCategoryLabel } from '../constants';
import AssetPickerModal from './AssetPickerModal';
import ImageEditorModal from './ImageEditorModal';
import VideoEditorModal from './VideoEditorModal';
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
    attachedAssets, setAttachedAssets,
    paramValues, setParamValues,
  } = usePlayground();
  const { handleGenerate } = useGeneration();
  const [isFocused, setIsFocused] = useState(false);
  const [isAssetPickerOpen, setIsAssetPickerOpen] = useState(false);
  const [isImageEditorOpen, setIsImageEditorOpen] = useState(false);
  const [isVideoPreviewOpen, setIsVideoPreviewOpen] = useState(false);
  const [editingAssetIndex, setEditingAssetIndex] = useState<number | null>(null);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /** 语音输入 - 聚焦输入框并提示使用系统听写 */
  const handleVoiceInput = useCallback(() => {
    // 聚焦到输入框，让系统听写可以直接输入
    const textarea = document.querySelector('.prompt-textarea textarea') as HTMLTextAreaElement;
    if (textarea) {
      textarea.focus();
    }

    const isMacOS = /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    if (isMacOS) {
      message.info({
        content: '请按两次 Fn 键或点击键盘上的 🎙️ 键启动系统听写',
        duration: 4,
      });
    } else {
      message.info({
        content: '请按 Win + H 启动系统语音输入',
        duration: 4,
      });
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    if (attachedAssets.length + files.length > 10) {
      message.error('最多只能附加 10 个附件');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const newAssets = files.map(file => {
      if (file.size > 10 * 1024 * 1024) {
        message.error(`${file.name} 大小超过 10MB，已跳过`);
        return null;
      }
      const url = URL.createObjectURL(file);
      const isVideo = file.type.startsWith('video');
      const isAudio = file.type.startsWith('audio');
      const assetType = isVideo ? 'video' : isAudio ? 'audio' : 'image';
      const mockAsset = {
        id: Date.now() + Math.random(),
        file_name: file.name,
        asset_type: assetType,
        size: file.size,
        file_url: url
      };
      return { asset: mockAsset as any, fullUrl: url, file };
    }).filter(Boolean) as { asset: any; fullUrl: string; file?: File }[];

    setAttachedAssets(prev => [...prev, ...newAssets]);
    if (newAssets.length > 0) {
      message.success(`已成功附加 ${newAssets.length} 个文件`);
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

  const removeAsset = (index: number) => {
    setAttachedAssets(prev => prev.filter((_, i) => i !== index));
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
        border: `1px solid ${isFocused ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255,255,255,0.08)'}`,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: isFocused
          ? '0 24px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255, 255, 255, 0.08)'
          : '0 24px 60px rgba(0,0,0,0.5)',
        zIndex: 1000,
        transition: 'border-color 0.3s ease, box-shadow 0.3s ease',
      }}
      onWheel={(e) => e.stopPropagation()}
    >
      {/* 已附加的素材预览列表 */}
      {attachedAssets.length > 0 && (
        <div 
          className="prompt-assets-scroll"
          onWheel={(e) => {
            if (e.deltaY !== 0) {
              e.currentTarget.scrollLeft += e.deltaY;
            }
          }}
          style={{
            padding: '12px 16px 8px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            overflowX: 'auto',
          }}
        >
          {attachedAssets.map((assetItem, index) => (
            <div key={assetItem.asset.id} style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 64,
              height: 64,
              borderRadius: 10,
              overflow: 'hidden',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
              flexShrink: 0,
              background: 'rgba(0,0,0,0.2)',
            }}>
              {/* 缩略图渲染逻辑 */}
              {(() => {
                const ext = assetItem.asset.file_name.split('.').pop()?.toLowerCase() || '';
                const isVideo = assetItem.asset.asset_type === 'video' || ['mp4','mov','webm','avi','mkv'].includes(ext);
                const isAudio = assetItem.asset.asset_type === 'audio' || ['mp3','wav','aac','flac','ogg','m4a'].includes(ext);
                if (isAudio) {
                  return (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <AudioOutlined style={{ fontSize: 24, color: '#1677ff' }} />
                    </div>
                  );
                }
                if (isVideo) {
                  return (
                    <div 
                      onClick={() => {
                        setEditingAssetIndex(index);
                        setIsVideoPreviewOpen(true);
                      }}
                      style={{ width: '100%', height: '100%', position: 'relative', cursor: 'pointer' }}
                      title="点击预览视频"
                    >
                      <video src={assetItem.fullUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted preload="metadata" />
                      <div style={{ position: 'absolute', bottom: 4, left: 4, background: 'rgba(0,0,0,0.5)', padding: '2px 4px', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <VideoCameraOutlined style={{ fontSize: 10, color: '#fff' }} />
                      </div>
                      <div className="hover-edit-overlay" style={{
                        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', 
                        display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.2s'
                      }}>
                        <PlayCircleOutlined style={{ fontSize: 20, color: '#fff' }} />
                      </div>
                    </div>
                  );
                }
                return (
                  <div 
                    onClick={() => {
                      setEditingAssetIndex(index);
                      setIsImageEditorOpen(true);
                    }}
                    style={{ width: '100%', height: '100%', cursor: 'pointer', position: 'relative' }}
                    title="点击放大并编辑图片"
                  >
                    <img
                      src={assetItem.fullUrl}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    <div className="hover-edit-overlay" style={{
                      position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', 
                      display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.2s'
                    }}>
                      <PictureOutlined style={{ fontSize: 16, color: '#fff' }} />
                    </div>
                  </div>
                );
              })()}
              {/* 删除按钮 */}
              <div
                onClick={() => removeAsset(index)}
                style={{
                  position: 'absolute', top: 4, right: 4, width: 18, height: 18, borderRadius: '50%',
                  background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                  transition: 'all 0.2s', color: '#fff', zIndex: 10,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,77,79,0.9)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.5)'; }}
              >
                <CloseOutlined style={{ fontSize: 9 }} />
              </div>
            </div>
          ))}
          <style>{`
            .hover-edit-overlay:hover { opacity: 1 !important; }
          `}</style>
        </div>
      )}

      {/* 输入区域 */}
      <TextArea
        className="prompt-textarea"
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
          padding: attachedAssets.length > 0 ? '8px 20px 8px 20px' : '18px 20px 8px 20px',
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
          {/* API 密钥芯片（置于最前） */}
          <Tooltip title={tokenName ? '点击更换 API 密钥' : '请选择 API 密钥'}>
            <div
              onClick={() => setIsTokenModalVisible(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: tokenName ? 'auto' : 30,
                height: 30,
                padding: tokenName ? '0 10px' : 0,
                background: tokenName ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 8,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                color: tokenName ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.65)',
                fontSize: 13,
                fontWeight: 500,
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = tokenName ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.06)';
              }}
            >
              {!tokenName ? (
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.65)' }}>
                  <svg width="14" height="14" viewBox="0 0 1024 1024" fill="currentColor">
                    <path d="M854.6 288.6L539.2 604c-11.3 11.3-29.6 11.3-40.9 0L426 531.7c-11.3-11.3-29.6-11.3-40.9 0L247.9 668.9 224 816c-1.8 11-11.3 19.3-22.4 19.6L128 840c-13.3.4-24-10.4-24-24v-73.6c0-11 8.6-20.5 19.6-22.4l147.1-23.9 137.2-137.2c-11.3-11.3-11.3-29.6 0-40.9l72.3-72.3c11.3-11.3 11.3-29.6 0-40.9L164.8 139.4c-6.2-6.2-6.2-16.4 0-22.6l22.6-22.6c6.2-6.2 16.4-6.2 22.6 0l717.1 717.1c6.2 6.2 6.2 16.4 0 22.6l-22.6 22.6c-6.2 6.2-16.4 6.2-22.6 0L590.2 584.8l264.4-264.4c11.3-11.3 29.6-11.3 40.9 0l72.3 72.3c6.2 6.2 16.4 6.2 22.6 0l22.6-22.6c6.2-6.2 6.2-16.4 0-22.6L877.2 288.6c-6.2-6.2-16.4-6.2-22.6 0zM754 130c-84.5 0-153 68.5-153 153s68.5 153 153 153 153-68.5 153-153-68.5-153-153-153zm0 238c-46.9 0-85-38.1-85-85s38.1-85 85-85 85 38.1 85 85-38.1 85-85 85z" />
                    <path d="M754 215c-37.5 0-68 30.5-68 68s30.5 68 68 68 68-30.5 68-68-30.5-68-68-68z" />
                  </svg>
                  <div style={{ position: 'absolute', width: 18, height: 1.5, background: 'currentColor', transform: 'rotate(-45deg)' }} />
                </div>
              ) : (
                <span>{tokenName}</span>
              )}
            </div>
          </Tooltip>

          {/* 模型快捷切换按钮 */}
          <Tooltip title="切换模型">
            <div
              onClick={() => setIsModelDrawerVisible(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                height: 30,
                padding: '0 10px',
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: 8,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                color: '#fff',
                fontSize: 13,
                fontWeight: 500,
                whiteSpace: 'nowrap',
                maxWidth: 180,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.18)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.35)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {currentModel?.name || '选择模型'}
              </span>
            </div>
          </Tooltip>

          {/* 联网搜索开关 */}
          {currentModel?.params?.some((p: any) => p.key === 'web_search') && (
            <Tooltip title="开启后允许模型使用联网搜索能力">
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  height: 30,
                  padding: '0 10px',
                  background: paramValues.web_search ? 'rgba(82, 196, 26, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                  border: `1px solid ${paramValues.web_search ? 'rgba(82, 196, 26, 0.3)' : 'rgba(255, 255, 255, 0.1)'}`,
                  borderRadius: 8,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  color: paramValues.web_search ? '#52c41a' : 'rgba(255, 255, 255, 0.45)',
                  fontSize: 13,
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                }}
                onClick={() => setParamValues(prev => ({ ...prev, web_search: !prev.web_search }))}
              >
                <GlobalOutlined style={{ fontSize: 13 }} />
                <span>联网搜索</span>
              </div>
            </Tooltip>
          )}

          {/* 分隔符 */}
          <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.06)', margin: '0 2px', flexShrink: 0 }} />

          {/* 语音输入按钮 */}
          <Tooltip title="语音输入">
            <div
              onClick={handleVoiceInput}
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

          <Dropdown
            menu={{ items: dropdownItems, onClick: handleMenuClick }}
            trigger={['click']}
            placement="topLeft"
            onOpenChange={setIsAddMenuOpen}
          >
            <Tooltip title="添加图片/视频/音频" placement="bottom" open={isAddMenuOpen ? false : undefined}>
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
                  color: attachedAssets.length > 0 ? '#1677ff' : 'rgba(255,255,255,0.3)',
                  background: attachedAssets.length > 0 ? 'rgba(22,119,255,0.1)' : 'transparent',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = attachedAssets.length > 0 ? 'rgba(22,119,255,0.18)' : 'rgba(255,255,255,0.06)';
                  e.currentTarget.style.color = attachedAssets.length > 0 ? '#1677ff' : 'rgba(255,255,255,0.6)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = attachedAssets.length > 0 ? 'rgba(22,119,255,0.1)' : 'transparent';
                  e.currentTarget.style.color = attachedAssets.length > 0 ? '#1677ff' : 'rgba(255,255,255,0.3)';
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
            gap: 8,
            padding: '6px 16px',
            borderRadius: 14,
            cursor: currentModel && prompt.trim() && !generating ? 'pointer' : 'not-allowed',
            transition: 'all 0.2s ease',
            background: currentModel && prompt.trim() && !generating
              ? 'rgba(255, 255, 255, 0.15)'
              : 'transparent',
            border: currentModel && prompt.trim() && !generating
              ? '1px solid transparent'
              : '1px solid rgba(255, 255, 255, 0.08)',
            color: currentModel && prompt.trim() && !generating
              ? '#fff'
              : 'rgba(255, 255, 255, 0.25)',
            fontSize: 15,
            fontWeight: 500,
            whiteSpace: 'nowrap',
            userSelect: 'none',
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            if (currentModel && prompt.trim() && !generating) {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.22)';
            }
          }}
          onMouseLeave={(e) => {
            if (currentModel && prompt.trim() && !generating) {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
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
              <span>Run</span>
              <span style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 15,
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                fontWeight: 400,
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
        @keyframes voicePulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255,77,79,0.3); }
          50% { box-shadow: 0 0 0 6px rgba(255,77,79,0); }
        }
      `}</style>

      {/* 资产库选择弹窗 */}
      <AssetPickerModal
        open={isAssetPickerOpen}
        onClose={() => setIsAssetPickerOpen(false)}
        onSelect={(items) => {
          setAttachedAssets(prev => {
            const newTotal = prev.length + items.length;
            if (newTotal > 10) {
              message.error(`最多只能附加 10 个附件，已截断超出部分`);
              const allowed = 10 - prev.length;
              const toAdd = items.slice(0, Math.max(0, allowed));
              return [...prev, ...toAdd];
            }
            return [...prev, ...items];
          });
          message.success(`已附加 ${items.length} 个素材`);
        }}
      />

      {/* 图片放大预览与编辑弹窗 */}
      {editingAssetIndex !== null && attachedAssets[editingAssetIndex]?.asset.asset_type === 'image' && (
        <ImageEditorModal
          open={isImageEditorOpen}
          imageUrl={attachedAssets[editingAssetIndex].fullUrl}
          onCancel={() => {
            setIsImageEditorOpen(false);
            setEditingAssetIndex(null);
          }}
          onSave={(newUrl, file) => {
            const index = editingAssetIndex;
            setAttachedAssets(prev => {
              const updated = [...prev];
              updated[index] = {
                ...updated[index],
                asset: {
                  ...updated[index].asset,
                  file_name: file.name,
                  size: file.size,
                  file_url: newUrl,
                },
                fullUrl: newUrl,
                file: file
              };
              return updated;
            });
            setIsImageEditorOpen(false);
            setEditingAssetIndex(null);
            message.success('图片编辑已保存');
          }}
        />
      )}

      {/* 视频编辑弹窗 */}
      {editingAssetIndex !== null && (attachedAssets[editingAssetIndex]?.asset.asset_type === 'video' || attachedAssets[editingAssetIndex]?.asset.file_name?.match(/\.(mp4|mov|webm|avi|mkv)$/i)) && (
        <VideoEditorModal
          open={isVideoPreviewOpen}
          videoUrl={attachedAssets[editingAssetIndex].fullUrl}
          onCancel={() => {
            setIsVideoPreviewOpen(false);
            setEditingAssetIndex(null);
          }}
          onSave={(newUrl, file) => {
            const index = editingAssetIndex;
            setAttachedAssets(prev => {
              const updated = [...prev];
              updated[index] = {
                ...updated[index],
                asset: {
                  ...updated[index].asset,
                  file_name: file.name,
                  size: file.size,
                  file_url: newUrl,
                },
                fullUrl: newUrl,
                file: file,
              };
              return updated;
            });
            setIsVideoPreviewOpen(false);
            setEditingAssetIndex(null);
            message.success('视频编辑已保存');
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
        multiple
      />
    </div>
  );
});

PromptInput.displayName = 'PromptInput';
export default PromptInput;
