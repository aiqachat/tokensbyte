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
  CloudOutlined, UploadOutlined, GlobalOutlined, PlusCircleOutlined,
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
    loading,
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

  // @mention 状态
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionStartRef = useRef<number>(-1); // @ 符号在 prompt 中的位置

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

  // 构建 @mention 选项列表
  const getMentionOptions = useCallback(() => {
    const options: { label: string; icon: React.ReactNode; type: string; url: string }[] = [];
    const counts: Record<string, number> = { image: 0, video: 0, audio: 0 };
    attachedAssets.forEach((assetItem) => {
      const ext = assetItem.asset.file_name.split('.').pop()?.toLowerCase() || '';
      const isVideo = assetItem.asset.asset_type === 'video' || ['mp4','mov','webm','avi','mkv'].includes(ext);
      const isAudio = assetItem.asset.asset_type === 'audio' || ['mp3','wav','aac','flac','ogg','m4a'].includes(ext);
      const typeKey = isAudio ? 'audio' : isVideo ? 'video' : 'image';
      counts[typeKey]++;
      const label = typeKey === 'audio' ? `声音${counts[typeKey]}` : typeKey === 'video' ? `视频${counts[typeKey]}` : `图${counts[typeKey]}`;
      const icon = typeKey === 'audio' ? <AudioOutlined /> : typeKey === 'video' ? <VideoCameraOutlined /> : <PictureOutlined />;
      options.push({ label, icon, type: typeKey, url: assetItem.fullUrl });
    });
    return options;
  }, [attachedAssets]);

  // 选择 mention
  const insertMention = useCallback((label: string) => {
    const start = mentionStartRef.current;
    if (start < 0) return;
    const textarea = document.querySelector('.prompt-textarea textarea') as HTMLTextAreaElement;
    const before = prompt.substring(0, start);
    const afterCursor = prompt.substring(textarea?.selectionStart ?? prompt.length);
    // 插入 @标签 + \u200B + 空格 + \u3000(占位) + 空格 + \u200B
    // 前后加的普通空格用来产生视觉上的间距（防拥挤），底层文字流也会随之撑开
    const placeholder = '\u200B \u3000 \u200B';
    const newPrompt = `${before}@${label}${placeholder} ${afterCursor}`;
    setPrompt(newPrompt);
    setMentionOpen(false);
    setMentionFilter('');
    mentionStartRef.current = -1;
    // 恢复光标位置
    setTimeout(() => {
      if (textarea) {
        const pos = before.length + label.length + 1 + 5 + 1; // @ + label + placeholder(5) + space(1)
        textarea.selectionStart = pos;
        textarea.selectionEnd = pos;
        textarea.focus();
      }
    }, 0);
  }, [prompt, setPrompt]);

  // 构建素材标签 -> URL 映射，用于内联预览
  const assetMap = React.useMemo(() => {
    const map: Record<string, { url: string; type: string }> = {};
    const counts: Record<string, number> = { image: 0, video: 0, audio: 0 };
    attachedAssets.forEach((assetItem) => {
      const ext = assetItem.asset.file_name.split('.').pop()?.toLowerCase() || '';
      const isVideo = assetItem.asset.asset_type === 'video' || ['mp4','mov','webm','avi','mkv'].includes(ext);
      const isAudio = assetItem.asset.asset_type === 'audio' || ['mp3','wav','aac','flac','ogg','m4a'].includes(ext);
      const typeKey = isAudio ? 'audio' : isVideo ? 'video' : 'image';
      counts[typeKey]++;
      const label = typeKey === 'audio' ? `声音${counts[typeKey]}` : typeKey === 'video' ? `视频${counts[typeKey]}` : `图${counts[typeKey]}`;
      map[label] = { url: assetItem.fullUrl, type: typeKey };
    });
    return map;
  }, [attachedAssets]);

  // 渲染富文本提示词
  const renderRichPrompt = React.useMemo(() => {
    if (!prompt || Object.keys(assetMap).length === 0) return null;
    const labels = Object.keys(assetMap).map(l => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (labels.length === 0) return null;
    // 匹配 @标签 以及带左右空格的占位符
    const regex = new RegExp(`(@(?:${labels.join('|')}))(\u200B \u3000 \u200B)?`, 'g');
    const parts = prompt.split(regex);
    if (parts.length <= 1) return null;

    const result = [];
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part === undefined) continue;

      const match = part.match(/^@(.+)$/);
      if (match && assetMap[match[1]]) {
        const info = assetMap[match[1]];
        const hasPlaceholder = parts[i + 1] === '\u200B \u3000 \u200B';
        
        result.push(
          <span key={i} style={{ color: '#60a5fa', fontWeight: 500 }}>
            {part}
            {hasPlaceholder && (
              <span style={{ position: 'relative' }}>
                {'\u200B \u3000 \u200B'}
                <span className="mention-inline-thumb">
                  {info.type === 'image' ? (
                    <img src={info.url} alt="" />
                  ) : info.type === 'video' ? (
                    <video src={info.url} muted preload="metadata" disablePictureInPicture />
                  ) : (
                    <AudioOutlined style={{ fontSize: 10, color: '#faad14' }} />
                  )}
                </span>
              </span>
            )}
          </span>
        );
        
        if (hasPlaceholder) {
          i++; // 跳过占位符部分
        }
      } else {
        result.push(<span key={i}>{part}</span>);
      }
    }
    return result;
  }, [prompt, assetMap]);

  // 提取 prompt 中引用的素材列表（用于显示引用条）
  const referencedAssets = React.useMemo(() => {
    if (!prompt || Object.keys(assetMap).length === 0) return [];
    const labels = Object.keys(assetMap);
    const found: { label: string; url: string; type: string }[] = [];
    const seen = new Set<string>();
    labels.forEach(label => {
      if (prompt.includes(`@${label}`) && !seen.has(label)) {
        seen.add(label);
        found.push({ label, ...assetMap[label] });
      }
    });
    return found;
  }, [prompt, assetMap]);

  const hasVideoOrAudio = attachedAssets.some(a => {
    const ext = a.asset.file_name?.split('.').pop()?.toLowerCase() || '';
    return a.asset.asset_type === 'video' || ['mp4','mov','webm','avi','mkv'].includes(ext) ||
           a.asset.asset_type === 'audio' || ['mp3','wav','aac','flac','ogg','m4a'].includes(ext);
  });
  const hasImage = attachedAssets.some(a => {
    const ext = a.asset.file_name?.split('.').pop()?.toLowerCase() || '';
    return a.asset.asset_type === 'image' || ['jpg','jpeg','png','webp','gif'].includes(ext);
  });
  const isVideoModel = currentModel?.scheme_type === 'video' || currentModel?.type_name?.includes('视频');

  // 使用 ref 追踪最新的 attachedAssets
  const attachedAssetsRef = useRef(attachedAssets);
  attachedAssetsRef.current = attachedAssets;

  // 监听 prompt 变化，跟踪 mention 过滤
  React.useEffect(() => {
    if (!mentionOpen) return;
    const start = mentionStartRef.current;
    if (start < 0) return;
    // 取 @ 后面的文本作为过滤词
    const afterAt = prompt.substring(start + 1);
    const spaceIdx = afterAt.search(/[\s]/);
    const filter = spaceIdx >= 0 ? '' : afterAt;
    if (spaceIdx >= 0) {
      // 用户输入了空格，关闭 mention
      setMentionOpen(false);
      return;
    }
    setMentionFilter(filter);
  }, [prompt, mentionOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();

    // 检测 @ 键按下，立即打开 mention
    if (e.key === '@' || (e.key === '2' && e.shiftKey)) {
      // 记录 @ 在 prompt 中的位置（当前光标位置，@ 字符尚未插入）
      const target = e.target as HTMLTextAreaElement;
      mentionStartRef.current = target.selectionStart;
      setMentionFilter('');
      setMentionIndex(0);
      setMentionOpen(true);
      return;
    }

    // mention 下拉框激活时的键盘导航
    if (mentionOpen) {
      const allOptions = getMentionOptions();
      const options = allOptions.filter(o =>
        !mentionFilter || o.label.includes(mentionFilter)
      );
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex(prev => Math.min(prev + 1, (options.length || 1) - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(prev => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === 'Enter' && options.length > 0) {
        e.preventDefault();
        insertMention(options[mentionIndex]?.label || options[0].label);
        return;
      }
      if (e.key === 'Escape' || e.key === 'Backspace') {
        if (e.key === 'Escape') e.preventDefault();
        setMentionOpen(false);
        return;
      }
    }

    // ⌘+Enter 或 Ctrl+Enter 快捷发送
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (currentModel && prompt.trim() && !generating) {
        handleGenerate();
      }
    }
  };

  if (loading) {
    return (
      <div
        style={{
          position: 'absolute',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'calc(100% - 48px)',
          maxWidth: 720,
          background: '#1e1f20',
          backdropFilter: 'blur(20px)',
          borderRadius: 24,
          border: '1px solid #444746',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
          zIndex: 1000,
          padding: '24px 20px 12px 20px',
        }}
      >
        <div style={{ height: 20, background: 'rgba(255,255,255,0.04)', borderRadius: 10, width: '30%', marginBottom: 28, animation: 'promptPulse 1.5s infinite' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ height: 30, width: 100, background: 'rgba(255,255,255,0.04)', borderRadius: 8, animation: 'promptPulse 1.5s infinite' }} />
            <div style={{ height: 30, width: 140, background: 'rgba(255,255,255,0.04)', borderRadius: 8, animation: 'promptPulse 1.5s infinite' }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ height: 32, width: 32, background: 'rgba(255,255,255,0.04)', borderRadius: 10, animation: 'promptPulse 1.5s infinite' }} />
            <div style={{ height: 32, width: 32, background: 'rgba(255,255,255,0.04)', borderRadius: 10, animation: 'promptPulse 1.5s infinite' }} />
            <div style={{ height: 32, width: 80, background: 'rgba(255,255,255,0.04)', borderRadius: 14, animation: 'promptPulse 1.5s infinite' }} />
          </div>
        </div>
        <style>{`
          @keyframes promptPulse {
            0%, 100% { opacity: 0.6; }
            50% { opacity: 0.2; }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'calc(100% - 48px)',
        maxWidth: 720,
        background: '#1e1f20',
        backdropFilter: 'blur(20px)',
        borderRadius: 24,
        border: `1px solid ${isFocused ? '#A8C7FA' : '#444746'}`,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: isFocused
          ? '0 4px 6px rgba(0,0,0,0.3), 0 0 0 1px #A8C7FA'
          : '0 4px 6px rgba(0,0,0,0.3)',
        zIndex: 1000,
        transition: 'border-color 0.3s ease, box-shadow 0.3s ease',
      }}
      onWheel={(e) => e.stopPropagation()}
    >
      {/* 已附加的素材预览列表 */}
      {attachedAssets.length > 0 && (() => {
        // 按类型分组
        const grouped: { type: string; label: string; items: { item: typeof attachedAssets[0]; origIndex: number }[] }[] = [];
        const typeMap: Record<string, typeof grouped[0]> = {};

        attachedAssets.forEach((assetItem, index) => {
          const ext = assetItem.asset.file_name.split('.').pop()?.toLowerCase() || '';
          const isVideo = assetItem.asset.asset_type === 'video' || ['mp4','mov','webm','avi','mkv'].includes(ext);
          const isAudio = assetItem.asset.asset_type === 'audio' || ['mp3','wav','aac','flac','ogg','m4a'].includes(ext);
          const typeKey = isAudio ? 'audio' : isVideo ? 'video' : 'image';
          const typeLabel = isAudio ? '声音' : isVideo ? '视频' : '图';
          if (!typeMap[typeKey]) {
            typeMap[typeKey] = { type: typeKey, label: typeLabel, items: [] };
            grouped.push(typeMap[typeKey]);
          }
          typeMap[typeKey].items.push({ item: assetItem, origIndex: index });
        });

        return (
          <div style={{ padding: '12px 16px 4px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {grouped.map(group => (
              <div
                key={group.type}
                className="prompt-assets-scroll"
                onWheel={(e) => { if (e.deltaY !== 0) e.currentTarget.scrollLeft += e.deltaY; }}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 10, overflowX: 'auto' }}
              >
                {group.items.map((entry, idx) => (
                  <div key={entry.item.asset.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    <div style={{
                      position: 'relative',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: 56, height: 56, borderRadius: 10, overflow: 'hidden',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                      background: 'rgba(0,0,0,0.2)',
                    }}>
                      {(() => {
                        if (group.type === 'audio') {
                          return (
                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <AudioOutlined style={{ fontSize: 22, color: '#1677ff' }} />
                            </div>
                          );
                        }
                        if (group.type === 'video') {
                          return (
                            <div
                              onClick={() => { setEditingAssetIndex(entry.origIndex); setIsVideoPreviewOpen(true); }}
                              style={{ width: '100%', height: '100%', position: 'relative', cursor: 'pointer' }}
                            >
                              <video src={entry.item.fullUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted preload="metadata" disablePictureInPicture />
                              <div style={{ position: 'absolute', bottom: 3, left: 3, background: 'rgba(0,0,0,0.5)', padding: '1px 3px', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <VideoCameraOutlined style={{ fontSize: 9, color: '#fff' }} />
                              </div>
                              <div className="hover-edit-overlay" style={{
                                position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.2s'
                              }}>
                                <PlayCircleOutlined style={{ fontSize: 18, color: '#fff' }} />
                              </div>
                            </div>
                          );
                        }
                        return (
                          <div
                            onClick={() => { setEditingAssetIndex(entry.origIndex); setIsImageEditorOpen(true); }}
                            style={{ width: '100%', height: '100%', cursor: 'pointer', position: 'relative' }}
                          >
                            <img src={entry.item.fullUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            <div className="hover-edit-overlay" style={{
                              position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.2s'
                            }}>
                              <PictureOutlined style={{ fontSize: 14, color: '#fff' }} />
                            </div>
                          </div>
                        );
                      })()}
                      {/* 删除按钮 */}
                      <div
                        onClick={() => removeAsset(entry.origIndex)}
                        style={{
                          position: 'absolute', top: 3, right: 3, width: 16, height: 16, borderRadius: '50%',
                          background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex',
                          alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                          transition: 'all 0.2s', color: '#fff', zIndex: 10,
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,77,79,0.9)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.5)'; }}
                      >
                        <CloseOutlined style={{ fontSize: 8 }} />
                      </div>
                    </div>
                    <span style={{
                      fontSize: 10, color: 'rgba(255,255,255,0.4)',
                      lineHeight: 1, whiteSpace: 'nowrap',
                    }}>
                      {group.label}{idx + 1}
                    </span>
                  </div>
                ))}
              </div>
            ))}
            <style>{`
              .hover-edit-overlay:hover { opacity: 1 !important; }
            `}</style>
          </div>
        );
      })()}

      {/* 输入区域 */}
      <div style={{ position: 'relative' }}>
        {/* 富文本覆盖层 - 显示 @mention 内联缩略图 */}
        {renderRichPrompt && (
          <div
            className="prompt-rich-overlay"
            style={{
              position: 'absolute',
              top: 0, left: 0, right: 0, bottom: 0,
              padding: attachedAssets.length > 0 ? '8px 20px 8px 20px' : '18px 20px 8px 20px',
              fontSize: 15,
              lineHeight: '1.6',
              letterSpacing: '0.2px',
              color: '#E8EAED',
              pointerEvents: 'none',
              whiteSpace: 'pre-wrap',
              wordWrap: 'break-word',
              overflow: 'hidden',
              zIndex: 1,
            }}
          >
            {renderRichPrompt}
          </div>
        )}
        <TextArea
          className="prompt-textarea"
          value={prompt}
          onChange={(e) => {
            setPrompt(e.target.value);
          }}
          placeholder={
            currentModel
              ? attachedAssets.length > 0
                ? `输入提示词，使用 @ 引用素材...`
                : `Start typing a prompt to create ${getCategoryLabel(activeCategory)}...`
              : '请先在右侧面板选择一个模型...'
          }
          autoSize={{ minRows: 2, maxRows: 8 }}
          bordered={false}
          onFocus={() => setIsFocused(true)}
          onBlur={(e) => {
            setIsFocused(false);
            setTimeout(() => setMentionOpen(false), 200);
          }}
          style={{
            color: renderRichPrompt ? 'transparent' : '#E8EAED',
            caretColor: '#E8EAED',
            resize: 'none',
            padding: attachedAssets.length > 0 ? '8px 20px 8px 20px' : '18px 20px 8px 20px',
            fontSize: 15,
            lineHeight: '1.6',
            background: 'transparent',
            letterSpacing: '0.2px',
            position: 'relative',
            zIndex: 2,
          }}
          onKeyDown={handleKeyDown}
        />
        <style>{`
          .prompt-textarea .ant-input {
            caret-color: #E8EAED !important;
          }
          .mention-inline-thumb {
            position: absolute;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
            display: flex;
            align-items: center;
            justify-content: center;
            width: 17px;
            height: 17px;
            border-radius: 4px;
            overflow: hidden;
            border: 1px solid rgba(96,165,250,0.4);
            background: rgba(0,0,0,0.5);
            pointer-events: none;
            z-index: 10;
          }
          .mention-inline-thumb img,
          .mention-inline-thumb video {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
          }
        `}</style>

        {/* @mention 下拉面板 */}
        {mentionOpen && (() => {
          const allOptions = getMentionOptions();
          const filtered = allOptions.filter(o => !mentionFilter || o.label.includes(mentionFilter));
          const hasAssets = attachedAssets.length > 0;
          return (
            <div style={{
              position: 'absolute',
              bottom: '100%',
              left: 16,
              marginBottom: 6,
              background: 'rgba(30, 31, 35, 0.98)',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 12,
              padding: '6px 0',
              minWidth: 180,
              maxHeight: 280,
              overflowY: 'auto',
              zIndex: 2000,
              boxShadow: '0 -8px 32px rgba(0,0,0,0.5)',
            }}>
              <div style={{ padding: '4px 12px 6px', fontSize: 11, color: 'rgba(255,255,255,0.3)', fontWeight: 500 }}>
                {hasAssets ? '引用素材' : '提示'}
              </div>
              {!hasAssets ? (
                <div style={{
                  padding: '12px 14px', fontSize: 13,
                  color: 'rgba(255,255,255,0.4)', textAlign: 'center',
                }}>
                  当前没有素材可供选择，请先添加素材
                </div>
              ) : filtered.length === 0 ? (
                <div style={{
                  padding: '12px 14px', fontSize: 13,
                  color: 'rgba(255,255,255,0.4)', textAlign: 'center',
                }}>
                  没有匹配的素材
                </div>
              ) : (
                filtered.map((opt, idx) => (
                  <div
                    key={opt.label}
                    onMouseDown={(e) => { e.preventDefault(); insertMention(opt.label); }}
                    onMouseEnter={() => setMentionIndex(idx)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '6px 12px', cursor: 'pointer',
                      fontSize: 13, color: idx === mentionIndex ? '#fff' : 'rgba(255,255,255,0.7)',
                      background: idx === mentionIndex ? 'rgba(255,255,255,0.1)' : 'transparent',
                      transition: 'all 0.1s',
                    }}
                  >
                    <div style={{
                      width: 28, height: 28, borderRadius: 6, overflow: 'hidden', flexShrink: 0,
                      background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {opt.type === 'image' ? (
                        <img src={opt.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : opt.type === 'video' ? (
                        <video src={opt.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted preload="metadata" disablePictureInPicture />
                      ) : (
                        <AudioOutlined style={{ fontSize: 14, color: '#faad14' }} />
                      )}
                    </div>
                    <span style={{ fontWeight: 500 }}>@{opt.label}</span>
                  </div>
                ))
              )}
            </div>
          );
        })()}
      </div>
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
          <Tooltip title={tokenName ? '点击更换或取消 API 密钥' : '选择 API 密钥 (可选)'}>
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
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.65)' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M7 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8z" />
                    <circle cx="7" cy="12" r="1.5" fill="currentColor" stroke="none" />
                    <path d="M11 12h11v4h-3v-2h-2v2h-3v-4" />
                    <line x1="3" y1="3" x2="21" y2="21" strokeWidth="2" />
                  </svg>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}>
                    <path d="M7 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8z" />
                    <circle cx="7" cy="12" r="1.5" fill="currentColor" stroke="none" />
                    <path d="M11 12h11v4h-3v-2h-2v2h-3v-4" />
                  </svg>
                  <span>{tokenName}</span>
                </div>
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
            <Tooltip placement="bottom" title="开启后允许模型使用联网搜索能力">
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

          {/* 图片角色选择器 */}
          {isVideoModel && hasImage && (
            <Dropdown
              trigger={['click']}
              menu={{
                items: [
                  { key: 'auto', label: '自动' },
                  { key: 'first_frame', label: '首帧', disabled: hasVideoOrAudio },
                  { key: 'first_last_frame', label: '首尾帧', disabled: hasVideoOrAudio },
                  { key: 'reference_image', label: '参考图' },
                ],
                onClick: (e) => {
                  setParamValues(prev => ({ ...prev, image_role: e.key === 'auto' ? undefined : e.key }));
                }
              }}
            >
              <Tooltip placement="bottom" title="指定附加图片的类型用途（受约束时自动锁定参考图）">
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    height: 30,
                    padding: '0 10px',
                    background: paramValues.image_role ? 'rgba(22, 119, 255, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                    border: `1px solid ${paramValues.image_role ? 'rgba(22, 119, 255, 0.3)' : 'rgba(255, 255, 255, 0.1)'}`,
                    borderRadius: 8,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    color: paramValues.image_role ? '#1677ff' : 'rgba(255, 255, 255, 0.45)',
                    fontSize: 13,
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                  }}
                >
                  <PictureOutlined style={{ fontSize: 13 }} />
                  <span>
                    {(() => {
                      const effectiveRole = hasVideoOrAudio && paramValues.image_role !== 'reference_image' && paramValues.image_role !== undefined
                        ? 'reference_image' 
                        : paramValues.image_role;
                      
                      switch(effectiveRole) {
                        case 'first_frame': return '首帧';
                        case 'first_last_frame': return '首尾帧';
                        case 'reference_image': return '参考图';
                        default: return '图片(自动)';
                      }
                    })()}
                  </span>
                </div>
              </Tooltip>
            </Dropdown>
          )}

        </div>

        {/* 右侧操作区 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {/* 语音输入按钮 */}
          <Tooltip title="语音输入">
            <div
              onClick={handleVoiceInput}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 32,
                height: 32,
                borderRadius: 10,
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                color: 'rgba(255,255,255,0.65)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.color = '#fff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                e.currentTarget.style.color = 'rgba(255,255,255,0.65)';
              }}
            >
              <AudioOutlined style={{ fontSize: 16 }} />
            </div>
          </Tooltip>

          {/* 添加按钮 */}
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
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  background: attachedAssets.length > 0 ? 'rgba(22,119,255,0.15)' : 'rgba(255, 255, 255, 0.04)',
                  border: attachedAssets.length > 0 ? '1px solid rgba(22,119,255,0.3)' : '1px solid rgba(255, 255, 255, 0.08)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  color: attachedAssets.length > 0 ? '#1677ff' : 'rgba(255,255,255,0.65)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = attachedAssets.length > 0 ? 'rgba(22,119,255,0.25)' : 'rgba(255, 255, 255, 0.1)';
                  e.currentTarget.style.color = attachedAssets.length > 0 ? '#1677ff' : '#fff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = attachedAssets.length > 0 ? 'rgba(22,119,255,0.15)' : 'rgba(255, 255, 255, 0.04)';
                  e.currentTarget.style.color = attachedAssets.length > 0 ? '#1677ff' : 'rgba(255,255,255,0.65)';
                }}
              >
                <PlusCircleOutlined style={{ fontSize: 16 }} />
              </div>
            </Tooltip>
          </Dropdown>

          {/* 运行按钮 */}
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
