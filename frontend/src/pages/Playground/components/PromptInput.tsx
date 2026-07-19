/**
 * 底部悬浮提示词输入框（重新设计）
 * 参考现代 AI Agent 输入框设计：
 * - 上层：干净的文本输入区域
 * - 下层：功能芯片栏（模型选择、API 密钥、附加功能按钮）+ 运行按钮
 */
import React, { useState, useRef, useCallback } from 'react';
import { Input, Tooltip, Dropdown, Modal, Switch, message } from 'antd';
import toast from './PlaygroundToast';
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
import AudioPreviewModal from './AudioPreviewModal';
import type { PluginAsset } from '../../../types';
import { useThemeStore } from '../../../store/theme';
import useAuthStore from '../../../store/auth';
import request from '../../../utils/request';
import { useTranslation } from 'react-i18next';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const { TextArea } = Input;

/** 检测是否为 Mac 系统 */
const isMac = (): boolean => {
  if (typeof navigator !== 'undefined') {
    return /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  }
  return false;
};

const PromptInput: React.FC<{ embedded?: boolean }> = React.memo(({ embedded }) => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [activePlugins, setActivePlugins] = useState<any[]>([]);
  const [assetPickerNs, setAssetPickerNs] = useState<string>('asset_manager');

  React.useEffect(() => {
    const fetchActivePlugins = async () => {
      try {
        const response: any = await request.get('/plugins/active');
        if (response && response.active_plugins) {
          setActivePlugins(response.active_plugins);
        }
      } catch (error) {
        console.error('Failed to fetch active plugins', error);
      }
    };
    fetchActivePlugins();
  }, []);

  const isPluginVisibleForUser = useCallback((pluginName: string) => {
    const plugin = activePlugins.find((p: any) => p.name === pluginName);
    if (!plugin) return false;
    
    // 如果插件后端配置了“不在提示词输入窗口显示”，则隐藏（针对素材资产管理相关插件）
    if (plugin.show_in_playground_prompt === false) return false;

    if (plugin.allowed_levels === 'all' || user?.role === 'admin') return true;
    const allowed = plugin.allowed_levels.split(',');
    const userGroup = user?.user_group || '';
    const levelId = user?.level_id != null ? String(user.level_id) : '';
    return allowed.includes(userGroup) || (levelId !== '' && allowed.includes(levelId));
  }, [activePlugins, user]);

  const showAssetLibrary = isPluginVisibleForUser('asset_manager');
  const showAssetLibraryIntl = isPluginVisibleForUser('asset_manager_intl');

  const {
    loading,
    prompt, setPrompt,
    currentModel, agentCurrentModel, setAgentCurrentModel, activeCategory,
    models, advancedNodesConfig,
    selectedTokenKey, apiTokens,
    generating,
    setIsTokenModalVisible,
    setIsModelDrawerVisible,
    isSettingsWidgetVisible, setIsSettingsWidgetVisible,
    attachedAssets, setAttachedAssets,
    paramValues, setParamValues,
    handleSelectModel,
    pageMode,
  } = usePlayground();
  const { handleGenerate, handleChatGenerate } = useGeneration();

  const effectiveModel = pageMode === 'agent' ? agentCurrentModel : currentModel;

  const handleSend = async () => {
    if (!effectiveModel || !prompt.trim() || generating) return;
    if (effectiveModel.scheme_type === 'chat') {
      const ok = await handleChatGenerate();
      if (ok) setPrompt('');
    } else {
      handleGenerate();
    }
  };

  const { themeMode } = useThemeStore();
  const _isLight = themeMode === 'light';
  const [isFocused, setIsFocused] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  React.useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const [isAssetPickerOpen, setIsAssetPickerOpen] = useState(false);
  const [isImageEditorOpen, setIsImageEditorOpen] = useState(false);
  const [isVideoPreviewOpen, setIsVideoPreviewOpen] = useState(false);
  const [isAudioPreviewOpen, setIsAudioPreviewOpen] = useState(false);
  const [editingAssetIndex, setEditingAssetIndex] = useState<number | null>(null);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false);
  const [draggedAssetIndex, setDraggedAssetIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // @mention 状态
  const [mentionOpen, setMentionOpen] = useState(false);
  const [chatMode, setChatMode] = useState<'auto' | 'basic'>('auto');
  const [mentionFilter, setMentionFilter] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionStartRef = useRef<number>(-1); // @ 符号在 prompt 中的位置

  /** 语音输入 - 聚焦输入框并提示使用系统听写 */
  const handleVoiceInput = useCallback(() => {
    // 聚焦到输入框，让系统听写可以直接输入
    const textarea = document.querySelector('textarea.prompt-textarea, .prompt-textarea textarea') as HTMLTextAreaElement;
    if (textarea) {
      textarea.focus();
    }

    const isMacOS = /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    if (isMacOS) {
      toast.info('请按两次 Fn 键或点击键盘上的 🎙️ 键启动系统听写', undefined, 4000);
    } else {
      toast.info('请按 Win + H 启动系统语音输入', undefined, 4000);
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    if (attachedAssets.length + files.length > 10) {
      toast.error('最多只能附加 10 个附件');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const newAssets = files.map(file => {
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name} 大小超过 10MB，已跳过`);
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
      toast.success(`已成功附加 ${newAssets.length} 个文件`);
    }

    if (e.target) {
      e.target.value = '';
    }
  };

  const handleMenuClick: MenuProps['onClick'] = (e) => {
    if (e.key === 'asset-library') {
      setAssetPickerNs('asset_manager');
      setIsAssetPickerOpen(true);
    } else if (e.key === 'asset-library-intl') {
      setAssetPickerNs('asset_manager_intl');
      setIsAssetPickerOpen(true);
    } else if (e.key === 'local-upload') {
      fileInputRef.current?.click();
    }
  };

  const removeAsset = (index: number) => {
    setAttachedAssets(prev => prev.filter((_, i) => i !== index));
  };

  const dropdownItems: MenuProps['items'] = React.useMemo(() => {
    const items: MenuProps['items'] = [];

    if (showAssetLibrary) {
      items.push({
        key: 'asset-library',
        label: t('assets.pick_from_assets', '从素材库选择'),
        icon: <CloudOutlined />,
      });
    }

    if (showAssetLibraryIntl) {
      items.push({
        key: 'asset-library-intl',
        label: '从资产库选择',
        icon: <CloudOutlined />,
      });
    }

    items.push({
      key: 'local-upload',
      label: '本地上传文件',
      icon: <UploadOutlined />,
    });

    return items;
  }, [showAssetLibrary, showAssetLibraryIntl, t]);

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
      const isVideo = assetItem.asset.asset_type === 'video' || ['mp4', 'mov', 'webm', 'avi', 'mkv'].includes(ext);
      const isAudio = assetItem.asset.asset_type === 'audio' || ['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a'].includes(ext);
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
    const textarea = document.querySelector('textarea.prompt-textarea, .prompt-textarea textarea') as HTMLTextAreaElement;
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
      const isVideo = assetItem.asset.asset_type === 'video' || ['mp4', 'mov', 'webm', 'avi', 'mkv'].includes(ext);
      const isAudio = assetItem.asset.asset_type === 'audio' || ['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a'].includes(ext);
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
    return a.asset.asset_type === 'video' || ['mp4', 'mov', 'webm', 'avi', 'mkv'].includes(ext) ||
      a.asset.asset_type === 'audio' || ['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a'].includes(ext);
  });
  const hasImage = attachedAssets.some(a => {
    const ext = a.asset.file_name?.split('.').pop()?.toLowerCase() || '';
    return a.asset.asset_type === 'image' || ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext);
  });
  const isVideoModel = effectiveModel?.scheme_type === 'video' || effectiveModel?.type_name?.includes('视频');

  // 使用 ref 追踪最新的 attachedAssets
  const attachedAssetsRef = useRef(attachedAssets);
  attachedAssetsRef.current = attachedAssets;

  // 监听 prompt 变化，跟踪 mention 过滤
  React.useEffect(() => {
    if (!mentionOpen) return;
    const start = mentionStartRef.current;
    if (start < 0) return;
    
    const textarea = document.querySelector('textarea.prompt-textarea, .prompt-textarea textarea') as HTMLTextAreaElement;
    const cursorPos = textarea ? textarea.selectionStart : start + 1;

    // 1. 如果光标移到了 @ 前面，关闭
    if (cursorPos < start) {
      setMentionOpen(false);
      return;
    }

    // 2. 如果文本状态已经更新，但 start 位置不是 @，说明 @ 被删除了，或者在 @ 前面插入了其他字符
    if (cursorPos > start && prompt.charAt(start) !== '@') {
      setMentionOpen(false);
      return;
    }

    // 3. 取 @ 到当前光标之间的文本作为过滤词
    // 使用 slice 防止 cursorPos <= start 时发生字符串反向截取
    const filterText = prompt.slice(start + 1, cursorPos);
    
    // 4. 如果过滤词中包含空格或换行，说明用户敲击了空格结束了输入
    if (cursorPos > start && (filterText.includes(' ') || filterText.includes('\n'))) {
      setMentionOpen(false);
      return;
    }
    
    setMentionFilter(filterText);
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

    // 聊天模式：Enter 直接发送，Shift+Enter 换行
    if (effectiveModel?.scheme_type === 'chat' && e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      if (effectiveModel && prompt.trim() && !generating) {
        handleSend();
      }
      return;
    }

    // 图片/视频模式：⌘+Enter 或 Ctrl+Enter 快捷发送
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (effectiveModel && prompt.trim() && !generating) {
        handleSend();
      }
    }
  };

  if (loading) {
    return (
      <div
        style={{
          position: embedded ? 'relative' : 'absolute',
          bottom: embedded ? 'auto' : (isMobile ? 'calc(12px + env(safe-area-inset-bottom, 0px))' : 24),
          left: embedded ? 'auto' : '50%',
          transform: embedded ? 'none' : 'translateX(-50%)',
          width: embedded ? '100%' : (isMobile ? 'calc(100% - 24px)' : 'calc(100% - 48px)'),
          maxWidth: embedded ? 'none' : 720,
          background: _isLight ? 'rgba(255,255,255,0.9)' : '#1e1f20',
          backdropFilter: 'blur(20px)',
          borderRadius: 24,
          border: _isLight ? '1px solid rgba(0,0,0,0.1)' : '1px solid #444746',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: _isLight ? '0 4px 12px rgba(0,0,0,0.06)' : '0 4px 6px rgba(0,0,0,0.3)',
          zIndex: 1000,
          padding: isMobile ? '16px 12px 10px 12px' : '24px 20px 12px 20px',
        }}
      >
        <div style={{ height: 20, background: _isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)', borderRadius: 10, width: '30%', marginBottom: 28, animation: 'promptPulse 1.5s infinite' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ height: 30, width: 100, background: _isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)', borderRadius: 8, animation: 'promptPulse 1.5s infinite' }} />
            <div style={{ height: 30, width: 140, background: _isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)', borderRadius: 8, animation: 'promptPulse 1.5s infinite' }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ height: 32, width: 32, background: _isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)', borderRadius: 10, animation: 'promptPulse 1.5s infinite' }} />
            <div style={{ height: 32, width: 32, background: _isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)', borderRadius: 10, animation: 'promptPulse 1.5s infinite' }} />
            <div style={{ height: 32, width: 80, background: _isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)', borderRadius: 14, animation: 'promptPulse 1.5s infinite' }} />
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
      style={
        embedded
          ? {
              background: _isLight ? '#ffffff' : '#09090b',
              borderRadius: 24,
              border: `1px solid ${isFocused ? (_isLight ? '#1677ff' : '#27272a') : (_isLight ? '#e4e4e7' : '#18181b')}`,
              boxShadow: isFocused ? (_isLight ? '0 4px 12px rgba(0,0,0,0.02), 0 0 0 1px #1677ff' : '0 4px 12px rgba(0,0,0,0.2), 0 0 0 1px #27272a') : 'none',
              display: 'flex',
              flexDirection: 'column',
              padding: '12px 14px 10px',
              gap: 8,
              transition: 'all 0.2s ease',
              width: '100%',
              position: 'relative',
            }
          : {
              position: 'absolute',
              bottom: (isMobile ? 'calc(12px + env(safe-area-inset-bottom, 0px))' : 24),
              left: '50%',
              transform: 'translateX(-50%)',
              width: (isMobile ? 'calc(100% - 24px)' : 'calc(100% - 48px)'),
              maxWidth: 720,
              background: _isLight ? 'rgba(255,255,255,0.9)' : '#1e1f20',
              backdropFilter: 'blur(20px)',
              borderRadius: 24,
              border: `1px solid ${isFocused ? (_isLight ? '#1677ff' : '#A8C7FA') : (_isLight ? 'rgba(0,0,0,0.1)' : '#444746')}`,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'visible',
              boxShadow: isFocused
                ? (_isLight ? '0 4px 12px rgba(0,0,0,0.06), 0 0 0 1px #1677ff' : '0 4px 6px rgba(0,0,0,0.3), 0 0 0 1px #A8C7FA')
                : (_isLight ? '0 4px 12px rgba(0,0,0,0.06)' : '0 4px 6px rgba(0,0,0,0.3)'),
              zIndex: 1000,
              transition: 'border-color 0.3s ease, box-shadow 0.3s ease',
            }
      }
    >
      {embedded ? (
        <>
          {/* 已附加的素材预览列表 */}
          {attachedAssets.length > 0 && (() => {
            const grouped: { type: string; label: string; items: { item: any; origIndex: number }[] }[] = [];
            const typeMap: Record<string, any> = {};

            attachedAssets.forEach((assetItem, index) => {
              const ext = assetItem.asset.file_name.split('.').pop()?.toLowerCase() || '';
              const isVideo = assetItem.asset.asset_type === 'video' || ['mp4', 'mov', 'webm', 'avi', 'mkv'].includes(ext);
              const isAudio = assetItem.asset.asset_type === 'audio' || ['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a'].includes(ext);
              const typeKey = isAudio ? 'audio' : isVideo ? 'video' : 'image';
              const typeLabel = isAudio ? '声音' : isVideo ? '视频' : '图';
              if (!typeMap[typeKey]) {
                typeMap[typeKey] = { type: typeKey, label: typeLabel, items: [] };
                grouped.push(typeMap[typeKey]);
              }
              typeMap[typeKey].items.push({ item: assetItem, origIndex: index });
            });

            return (
              <div style={{ padding: '0 0 4px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {grouped.map(group => (
                  <div
                    key={group.type}
                    className="prompt-assets-scroll"
                    onWheel={(e) => { if (e.deltaY !== 0) e.currentTarget.scrollLeft += e.deltaY; }}
                    style={{ display: 'flex', alignItems: 'flex-start', gap: 8, overflowX: 'auto' }}
                  >
                    {group.items.map((entry: any, idx: number) => (
                      <div
                        key={entry.item.asset.id}
                        style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0,
                          cursor: 'pointer'
                        }}
                      >
                        <div style={{
                          position: 'relative',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          width: 48, height: 48, borderRadius: 8, overflow: 'hidden',
                          border: _isLight ? '1px solid rgba(0,0,0,0.1)' : '1px solid rgba(255, 255, 255, 0.1)',
                          background: _isLight ? '#f4f4f5' : 'rgba(0,0,0,0.2)',
                        }}>
                          {(() => {
                            if (group.type === 'audio') {
                              return (
                                <div
                                  onClick={() => { setEditingAssetIndex(entry.origIndex); setIsAudioPreviewOpen(true); }}
                                  style={{ width: '100%', height: '100%', position: 'relative', cursor: 'pointer' }}
                                >
                                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <AudioOutlined style={{ fontSize: 18, color: '#1677ff' }} />
                                  </div>
                                </div>
                              );
                            }
                            if (group.type === 'video') {
                              return (
                                <div
                                  onClick={() => { setEditingAssetIndex(entry.origIndex); setIsVideoPreviewOpen(true); }}
                                  style={{ width: '100%', height: '100%', position: 'relative', cursor: 'pointer' }}
                                >
                                  <video src={entry.item.fullUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted preload="metadata" />
                                </div>
                              );
                            }
                            return (
                              <div
                                onClick={() => { setEditingAssetIndex(entry.origIndex); setIsImageEditorOpen(true); }}
                                style={{ width: '100%', height: '100%', cursor: 'pointer', position: 'relative' }}
                              >
                                <img src={entry.item.fullUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              </div>
                            );
                          })()}
                          <div
                            onClick={(e) => { e.stopPropagation(); removeAsset(entry.origIndex); }}
                            style={{
                              position: 'absolute', top: 2, right: 2, width: 14, height: 14, borderRadius: '50%',
                              background: 'rgba(0,0,0,0.5)', display: 'flex',
                              alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                              color: '#fff', zIndex: 10,
                            }}
                          >
                            <CloseOutlined style={{ fontSize: 6 }} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            );
          })()}

          {/* 输入区域 */}
          <div style={{ position: 'relative' }}>
            {renderRichPrompt && (
              <div
                className="prompt-rich-overlay"
                style={{
                  position: 'absolute',
                  top: 0, left: 0, right: 0, bottom: 0,
                  padding: 0,
                  fontSize: 14,
                  lineHeight: '1.6',
                  color: _isLight ? '#18181b' : '#f4f4f5',
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
              id="playground-prompt-input"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ask anything ..."
              autoSize={{ minRows: 2, maxRows: 6 }}
              bordered={false}
              onFocus={() => setIsFocused(true)}
              onBlur={() => {
                setIsFocused(false);
                setTimeout(() => setMentionOpen(false), 200);
              }}
              style={{
                color: renderRichPrompt ? 'transparent' : (_isLight ? '#18181b' : '#f4f4f5'),
                caretColor: _isLight ? '#18181b' : '#f4f4f5',
                padding: 0,
                fontSize: 14,
                lineHeight: '1.6',
                background: 'transparent',
                resize: 'none',
                position: 'relative',
                zIndex: 2,
                outline: 'none',
                border: 'none',
                boxShadow: 'none',
              }}
              onKeyDown={handleKeyDown}
            />

            {/* @mention 下拉面板 */}
            {mentionOpen && (() => {
              const allOptions = getMentionOptions();
              const filtered = allOptions.filter(o => !mentionFilter || o.label.includes(mentionFilter));
              const hasAssets = attachedAssets.length > 0;
              return (
                <div style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: 0,
                  marginBottom: 6,
                  background: _isLight ? '#ffffff' : '#18181b',
                  border: _isLight ? '1px solid #e4e4e7' : '1px solid #27272a',
                  borderRadius: 12,
                  padding: '6px 0',
                  minWidth: 180,
                  maxHeight: 200,
                  overflowY: 'auto',
                  zIndex: 2000,
                  boxShadow: '0 -4px 20px rgba(0,0,0,0.15)',
                }}>
                  <div style={{ 
                    padding: '4px 12px 6px', 
                    fontSize: 11, 
                    color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.4)', 
                    fontWeight: 500,
                  }}>
                    <span>{hasAssets ? '引用素材' : '提示'}</span>
                  </div>
                  {!hasAssets ? (
                    <div style={{ padding: '10px 12px', fontSize: 12, color: '#71717a', textAlign: 'center' }}>
                      当前没有素材可供选择
                    </div>
                  ) : filtered.length === 0 ? (
                    <div style={{ padding: '10px 12px', fontSize: 12, color: '#71717a', textAlign: 'center' }}>
                      没有匹配的素材
                    </div>
                  ) : (
                    filtered.map((opt, idx) => (
                      <div
                        key={opt.label}
                        onMouseDown={(e) => { e.preventDefault(); insertMention(opt.label); }}
                        onMouseEnter={() => setMentionIndex(idx)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '6px 12px', cursor: 'pointer',
                          fontSize: 12.5, color: idx === mentionIndex ? (_isLight ? '#000' : '#fff') : (_isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.7)'),
                          background: idx === mentionIndex ? (_isLight ? '#f4f4f5' : '#27272a') : 'transparent',
                        }}
                      >
                        <span style={{ fontWeight: 500 }}>@{opt.label}</span>
                      </div>
                    ))
                  )}
                </div>
              );
            })()}
          </div>

          {/* 底部工具栏 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
            {/* 左侧功能区 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {/* + 按钮 */}
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  background: _isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)',
                  cursor: 'pointer',
                  color: _isLight ? '#71717a' : '#a1a1aa',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = _isLight ? '#000' : '#fff'; e.currentTarget.style.background = _isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = _isLight ? '#71717a' : '#a1a1aa'; e.currentTarget.style.background = _isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)'; }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
              </div>

              {/* Auto Mode Pill */}
              <div
                onClick={() => setChatMode('auto')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '3px 8px',
                  borderRadius: 12,
                  background: chatMode === 'auto' ? (_isLight ? 'rgba(24, 144, 255, 0.08)' : '#27272a') : 'transparent',
                  border: chatMode === 'auto' ? (_isLight ? '1px solid rgba(24, 144, 255, 0.2)' : '1px solid #3f3f46') : '1px solid transparent',
                  cursor: 'pointer',
                  color: chatMode === 'auto' ? (_isLight ? '#1890ff' : '#f4f4f5') : (_isLight ? '#71717a' : '#71717a'),
                  fontSize: 12,
                  fontWeight: 500,
                  transition: 'all 0.15s',
                }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                </svg>
                <span>Auto</span>
              </div>

              {/* Basic Mode Pill */}
              <div
                onClick={() => setChatMode('basic')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '3px 8px',
                  borderRadius: 12,
                  background: chatMode === 'basic' ? (_isLight ? 'rgba(24, 144, 255, 0.08)' : '#27272a') : 'transparent',
                  border: chatMode === 'basic' ? (_isLight ? '1px solid rgba(24, 144, 255, 0.2)' : '1px solid #3f3f46') : '1px solid transparent',
                  cursor: 'pointer',
                  color: chatMode === 'basic' ? (_isLight ? '#1890ff' : '#f4f4f5') : (_isLight ? '#71717a' : '#71717a'),
                  fontSize: 12,
                  fontWeight: 500,
                  transition: 'all 0.15s',
                }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                  <line x1="12" y1="22.08" x2="12" y2="12"></line>
                </svg>
                <span>Basic</span>
              </div>

              {/* Mention Button (@) */}
              <div
                onClick={() => {
                  if (attachedAssets.length > 0) {
                    setPrompt(prev => prev + '@');
                    setMentionOpen(true);
                    setMentionFilter('');
                  } else {
                    message.info('当前没有素材可供引用，请先上传素材');
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  cursor: 'pointer',
                  color: _isLight ? '#71717a' : '#71717a',
                  transition: 'all 0.15s',
                  fontSize: 13,
                  fontWeight: 600,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = _isLight ? '#000' : '#fff'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = _isLight ? '#71717a' : '#71717a'; }}
              >
                @
              </div>
            </div>

            {/* 右侧功能区 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {/* Voice Button */}
              <div
                onClick={handleVoiceInput}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  cursor: 'pointer',
                  color: _isLight ? '#71717a' : '#a1a1aa',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = _isLight ? '#000' : '#fff'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = _isLight ? '#71717a' : '#a1a1aa'; }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                  <line x1="12" y1="19" x2="12" y2="23"></line>
                  <line x1="8" y1="23" x2="16" y2="23"></line>
                </svg>
              </div>

              {/* Send Button */}
              <div
                onClick={() => {
                  if (!prompt.trim() && attachedAssets.length === 0) return;
                  handleSend();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  background: (!prompt.trim() && attachedAssets.length === 0)
                    ? (_isLight ? 'rgba(0,0,0,0.03)' : '#18181b')
                    : (_isLight ? '#18181b' : '#ffffff'),
                  color: (!prompt.trim() && attachedAssets.length === 0)
                    ? (_isLight ? '#d4d4d8' : '#3f3f46')
                    : (_isLight ? '#ffffff' : '#09090b'),
                  cursor: (!prompt.trim() && attachedAssets.length === 0) ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="19" x2="12" y2="5"></line>
                  <polyline points="5 12 12 5 19 12"></polyline>
                </svg>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* AI 智能体模式顶部徽章 */}
      {pageMode === 'agent' && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 16px',
          borderBottom: _isLight ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(255,255,255,0.06)',
          background: _isLight ? 'rgba(24, 144, 255, 0.05)' : 'rgba(24, 144, 255, 0.08)',
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          fontSize: 12,
          fontWeight: 500,
          color: '#1890ff',
        }}>
          <span>🤖</span>
          <span>AI 智能体模式已启用 — 当前操作视频生成模式为：{
            advancedNodesConfig?.agent_video_mode === 'autonomous' ? '自主决策' :
            advancedNodesConfig?.agent_video_mode === 'interactive' ? '交互录屏' : '操作轨迹'
          }</span>
        </div>
      )}
      {/* 已附加的素材预览列表 */}
      {attachedAssets.length > 0 && (() => {
        // 按类型分组
        const grouped: { type: string; label: string; items: { item: typeof attachedAssets[0]; origIndex: number }[] }[] = [];
        const typeMap: Record<string, typeof grouped[0]> = {};

        attachedAssets.forEach((assetItem, index) => {
          const ext = assetItem.asset.file_name.split('.').pop()?.toLowerCase() || '';
          const isVideo = assetItem.asset.asset_type === 'video' || ['mp4', 'mov', 'webm', 'avi', 'mkv'].includes(ext);
          const isAudio = assetItem.asset.asset_type === 'audio' || ['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a'].includes(ext);
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
                  <div
                    key={entry.item.asset.id}
                    draggable
                    onDragStart={(e) => {
                      setDraggedAssetIndex(entry.origIndex);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (draggedAssetIndex === null || draggedAssetIndex === entry.origIndex) return;
                      // 仅允许互换位置
                      setAttachedAssets(prev => {
                        const newAssets = [...prev];
                        const temp = newAssets[draggedAssetIndex];
                        newAssets[draggedAssetIndex] = newAssets[entry.origIndex];
                        newAssets[entry.origIndex] = temp;
                        return newAssets;
                      });
                      setDraggedAssetIndex(null);
                    }}
                    onDragEnd={() => setDraggedAssetIndex(null)}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0,
                      opacity: draggedAssetIndex === entry.origIndex ? 0.4 : 1,
                      cursor: 'grab'
                    }}
                  >
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
                            <div
                              onClick={() => { setEditingAssetIndex(entry.origIndex); setIsAudioPreviewOpen(true); }}
                              style={{ width: '100%', height: '100%', position: 'relative', cursor: 'pointer' }}
                            >
                              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.03)' }}>
                                <AudioOutlined style={{ fontSize: 22, color: '#1677ff' }} />
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
              padding: attachedAssets.length > 0 
                ? (isMobile ? '6px 12px 6px 12px' : '8px 20px 8px 20px') 
                : (isMobile ? '12px 12px 6px 12px' : '18px 20px 8px 20px'),
              fontSize: isMobile ? 14 : 15,
              lineHeight: '1.6',
              letterSpacing: '0.2px',
              color: _isLight ? '#1f2937' : '#E8EAED',
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
          id="playground-prompt-input"
          value={prompt}
          onChange={(e) => {
            setPrompt(e.target.value);
          }}
          placeholder={
            pageMode === 'agent'
              ? `输入智能体指令，将以[${
                  advancedNodesConfig?.agent_video_mode === 'autonomous' ? '自主决策视频' :
                  advancedNodesConfig?.agent_video_mode === 'interactive' ? '交互录制视频' : '操作轨迹视频'
                }]模式生成智能体操作视频...`
              : (effectiveModel
                  ? (attachedAssets.length > 0
                      ? `输入提示词，使用 @ 引用素材...`
                      : `Start typing a prompt to create ${getCategoryLabel(activeCategory)}...`)
                  : '请先在右侧面板选择一个模型...')
          }
          autoSize={{ minRows: 2, maxRows: isMobile ? 6 : 8 }}
          bordered={false}
          onFocus={() => setIsFocused(true)}
          onBlur={(e) => {
            setIsFocused(false);
            setTimeout(() => setMentionOpen(false), 200);
          }}
          onScroll={(e) => {
            const target = e.target as HTMLTextAreaElement;
            const overlay = document.querySelector('.prompt-rich-overlay') as HTMLDivElement;
            if (overlay) {
              overlay.scrollTop = target.scrollTop;
            }
          }}
          style={{
            color: renderRichPrompt ? 'transparent' : (_isLight ? '#1f2937' : '#E8EAED'),
            caretColor: _isLight ? '#1f2937' : '#E8EAED',
            resize: 'none',
            padding: attachedAssets.length > 0 
              ? (isMobile ? '6px 12px 6px 12px' : '8px 20px 8px 20px') 
              : (isMobile ? '12px 12px 6px 12px' : '18px 20px 8px 20px'),
            fontSize: isMobile ? 14 : 15,
            lineHeight: '1.6',
            background: 'transparent',
            letterSpacing: '0.2px',
            position: 'relative',
            zIndex: 2,
            outline: 'none',
            border: 'none',
            boxShadow: 'none',
          }}
          onKeyDown={handleKeyDown}
        />
        <style>{`
          .prompt-textarea .ant-input {
            caret-color: ${_isLight ? '#1f2937' : '#E8EAED'} !important;
          }
          .prompt-textarea .ant-input::placeholder {
            color: ${_isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.3)'} !important;
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
              <div style={{ 
                padding: '4px 12px 6px', 
                fontSize: 11, 
                color: 'rgba(255,255,255,0.3)', 
                fontWeight: 500,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span>{hasAssets ? '引用素材' : '提示'}</span>
                <div 
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMentionOpen(false); }}
                  style={{
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 20,
                    height: 20,
                    borderRadius: 4,
                    marginRight: -4,
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#fff'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.3)'; }}
                >
                  <CloseOutlined style={{ fontSize: 10 }} />
                </div>
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
          padding: isMobile ? '4px 8px 8px 8px' : '8px 12px 12px 12px',
          gap: isMobile ? 6 : 8,
        }}
      >
        {/* 左侧功能芯片区 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 4 : 6, flexWrap: 'wrap', minWidth: 0 }}>
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
                background: tokenName ? (_isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.1)') : (_isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)'),
                border: _isLight ? '1px solid rgba(0,0,0,0.1)' : '1px solid rgba(255,255,255,0.15)',
                borderRadius: 8,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                color: tokenName ? (_isLight ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.85)') : (_isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.65)'),
                fontSize: 13,
                fontWeight: 500,
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = _isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = tokenName ? (_isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.1)') : (_isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)');
              }}
            >
              {!tokenName ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.65)' }}>
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
          {pageMode === 'agent' ? (
            <Dropdown
              trigger={['click']}
              menu={{
                items: (advancedNodesConfig?.agent_chat_models || []).map(mid => {
                  const m = models.find(x => x.mid === String(mid));
                  return m ? { key: String(m.mid), label: m.name } : null;
                }).filter(Boolean) as any[],
                onClick: (e) => {
                  const selected = models.find(x => String(x.mid) === e.key);
                  if (selected) setAgentCurrentModel(selected);
                }
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  height: 30,
                  padding: '0 10px',
                  background: _isLight ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.1)',
                  border: _isLight ? '1px solid rgba(0, 0, 0, 0.1)' : '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: 8,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  color: _isLight ? '#1f2937' : '#fff',
                  fontSize: 13,
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                  maxWidth: isMobile ? 120 : 180,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = _isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.18)';
                  e.currentTarget.style.borderColor = _isLight ? 'rgba(0, 0, 0, 0.2)' : 'rgba(255, 255, 255, 0.35)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = _isLight ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.1)';
                  e.currentTarget.style.borderColor = _isLight ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.2)';
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {effectiveModel?.name || '选择对话模型'}
                </span>
                <svg viewBox="64 64 896 896" focusable="false" data-icon="down" width="10px" height="10px" fill="currentColor" aria-hidden="true" style={{ marginLeft: 2, opacity: 0.6 }}><path d="M884 256h-75c-5.1 0-9.9 2.5-12.9 6.6L512 654.2 227.9 262.6c-3-4.1-7.8-6.6-12.9-6.6h-75c-6.5 0-10.3 7.4-6.5 12.7l352.6 486.1c12.8 17.6 39 17.6 51.7 0l352.6-486.1c3.9-5.3.1-12.7-6.4-12.7z"></path></svg>
              </div>
            </Dropdown>
          ) : (
            <Tooltip title={effectiveModel ? "模型属性配置" : "选择模型"}>
              <div
                onClick={() => {
                  if (!effectiveModel) {
                    setIsModelDrawerVisible(true);
                  } else if (!isSettingsWidgetVisible) {
                    setIsSettingsWidgetVisible(true);
                  }
                }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                height: 30,
                padding: '0 10px',
                background: _isLight ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.1)',
                border: _isLight ? '1px solid rgba(0, 0, 0, 0.1)' : '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: 8,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                color: _isLight ? '#1f2937' : '#fff',
                fontSize: 13,
                fontWeight: 500,
                whiteSpace: 'nowrap',
                maxWidth: isMobile ? 120 : 180,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = _isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.18)';
                e.currentTarget.style.borderColor = _isLight ? 'rgba(0, 0, 0, 0.2)' : 'rgba(255, 255, 255, 0.35)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = _isLight ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.borderColor = _isLight ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.2)';
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {effectiveModel?.name || '选择模型'}
              </span>
              {effectiveModel && (
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectModel('');
                    setIsSettingsWidgetVisible(false);
                    setIsModelDrawerVisible(true);
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginLeft: 2, padding: 2, borderRadius: '50%',
                    color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = _isLight ? '#000' : '#fff';
                    e.currentTarget.style.background = _isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)';
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <CloseOutlined style={{ fontSize: 10 }} />
                </div>
              )}
            </div>
          </Tooltip>
          )}

          {/* 联网搜索开关 */}
          {effectiveModel?.params?.some((p: any) => p.key === 'web_search') && (
            <Tooltip title="开启后允许模型使用联网搜索能力">
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  height: 30,
                  padding: '0 10px',
                  background: paramValues.web_search ? 'rgba(82, 196, 26, 0.15)' : (_isLight ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.05)'),
                  border: `1px solid ${paramValues.web_search ? 'rgba(82, 196, 26, 0.3)' : (_isLight ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.1)')}`,
                  borderRadius: 8,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  color: paramValues.web_search ? '#52c41a' : (_isLight ? 'rgba(0, 0, 0, 0.45)' : 'rgba(255, 255, 255, 0.45)'),
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
              onOpenChange={setIsRoleDropdownOpen}
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
              <Tooltip open={isRoleDropdownOpen ? false : undefined} title="指定图片的类型用途（受约束时自动锁定参考图）">
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    height: 30,
                    padding: '0 10px',
                    background: paramValues.image_role ? (_isLight ? 'rgba(22, 119, 255, 0.15)' : 'rgba(22, 119, 255, 0.15)') : (_isLight ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.05)'),
                    border: `1px solid ${paramValues.image_role ? (_isLight ? 'rgba(22, 119, 255, 0.3)' : 'rgba(22, 119, 255, 0.3)') : (_isLight ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.1)')}`,
                    borderRadius: 8,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    color: paramValues.image_role ? '#1677ff' : (_isLight ? 'rgba(0, 0, 0, 0.45)' : 'rgba(255, 255, 255, 0.45)'),
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

                      switch (effectiveRole) {
                        case 'first_frame': return '首帧';
                        case 'first_last_frame': return '首尾帧';
                        case 'reference_image': return '参考图';
                        default: return '自动';
                      }
                    })()}
                  </span>
                </div>
              </Tooltip>
            </Dropdown>
          )}

        </div>

        {/* 右侧操作区 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 8, flexShrink: 0 }}>
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
                background: _isLight ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.04)',
                border: _isLight ? '1px solid rgba(0, 0, 0, 0.08)' : '1px solid rgba(255, 255, 255, 0.08)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = _isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.15)';
                e.currentTarget.style.color = _isLight ? '#000' : '#fff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = _isLight ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.04)';
                e.currentTarget.style.color = _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)';
              }}
            >
              <AudioOutlined style={{ fontSize: 16 }} />
            </div>
          </Tooltip>

          {/* 添加按钮（聊天模式暂不可用） */}
          {/* 简单逻辑判断：聊天模式通常不直接支持复杂多素材的附件 */}
          {effectiveModel?.scheme_type !== 'chat' && (() => {
            const isOnlyLocalUpload = dropdownItems.length === 1 && dropdownItems[0]?.key === 'local-upload';

            const addButtonContent = (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  background: attachedAssets.length > 0 ? 'rgba(22,119,255,0.15)' : (_isLight ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.04)'),
                  border: attachedAssets.length > 0 ? '1px solid rgba(22,119,255,0.3)' : (_isLight ? '1px solid rgba(0, 0, 0, 0.08)' : '1px solid rgba(255, 255, 255, 0.08)'),
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  color: attachedAssets.length > 0 ? '#1677ff' : (_isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)'),
                  position: 'relative',
                  overflow: 'hidden',
                }}
                onClick={() => {
                  if (isOnlyLocalUpload && !isMobile) {
                    fileInputRef.current?.click();
                  }
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = attachedAssets.length > 0 ? 'rgba(22,119,255,0.25)' : (_isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.1)');
                  e.currentTarget.style.color = attachedAssets.length > 0 ? '#1677ff' : (_isLight ? '#000' : '#fff');
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = attachedAssets.length > 0 ? 'rgba(22,119,255,0.15)' : (_isLight ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.04)');
                  e.currentTarget.style.color = attachedAssets.length > 0 ? '#1677ff' : (_isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)');
                }}
              >
                <PlusCircleOutlined style={{ fontSize: 16 }} />
                {isOnlyLocalUpload && isMobile && (
                  <input
                    type="file"
                    onChange={(e) => {
                      e.stopPropagation();
                      handleFileChange(e);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    accept="image/*,video/*,audio/*"
                    multiple
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      opacity: 0,
                      cursor: 'pointer',
                      zIndex: 10,
                    }}
                  />
                )}
              </div>
            );

            if (isOnlyLocalUpload) {
              return (
                <Tooltip title="添加图片/视频/音频" placement="bottom">
                  {addButtonContent}
                </Tooltip>
              );
            }

            return (
              <Dropdown
                menu={{ items: dropdownItems, onClick: handleMenuClick }}
                trigger={['click']}
                placement="topLeft"
                onOpenChange={setIsAddMenuOpen}
              >
                <Tooltip title="添加图片/视频/音频" placement="bottom" open={isAddMenuOpen ? false : undefined}>
                  {addButtonContent}
                </Tooltip>
              </Dropdown>
            );
          })()}

          {/* 运行按钮 */}
          <div
            onClick={() => {
              if (effectiveModel && prompt.trim() && !generating) {
                handleSend();
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: isMobile ? 0 : 8,
              padding: isMobile ? 0 : '6px 16px',
              width: isMobile ? 32 : 'auto',
              height: isMobile ? 32 : 'auto',
              borderRadius: isMobile ? 10 : 14,
              cursor: currentModel && prompt.trim() && !generating ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s ease',
              background: currentModel && prompt.trim() && !generating
                ? (_isLight ? '#1677ff' : 'rgba(255, 255, 255, 0.15)')
                : 'transparent',
              border: currentModel && prompt.trim() && !generating
                ? '1px solid transparent'
                : (_isLight ? '1px solid rgba(0, 0, 0, 0.08)' : '1px solid rgba(255, 255, 255, 0.08)'),
              color: currentModel && prompt.trim() && !generating
                ? '#fff'
                : (_isLight ? 'rgba(0, 0, 0, 0.25)' : 'rgba(255, 255, 255, 0.25)'),
              fontSize: isMobile ? 13 : 15,
              fontWeight: 500,
              whiteSpace: 'nowrap',
              userSelect: 'none',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              if (currentModel && prompt.trim() && !generating) {
                e.currentTarget.style.background = _isLight ? '#4096ff' : 'rgba(255, 255, 255, 0.22)';
              }
            }}
            onMouseLeave={(e) => {
              if (currentModel && prompt.trim() && !generating) {
                e.currentTarget.style.background = _isLight ? '#1677ff' : 'rgba(255, 255, 255, 0.15)';
              }
            }}
          >
            {generating && (
              <>
                <ThunderboltOutlined style={{ fontSize: isMobile ? 15 : 14, animation: 'pulse 1s infinite' }} />
                {!isMobile && <span>生成中...</span>}
              </>
            )}
            {!generating && isMobile && (
              <ThunderboltOutlined style={{ fontSize: 15 }} />
            )}
            {!generating && !isMobile && (
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
        </>
      )}
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
        pluginNs={assetPickerNs}
        onSelect={(items) => {
          setAttachedAssets(prev => {
            const newTotal = prev.length + items.length;
            if (newTotal > 10) {
              toast.error(`最多只能附加 10 个附件，已截断超出部分`);
              const allowed = 10 - prev.length;
              const toAdd = items.slice(0, Math.max(0, allowed));
              return [...prev, ...toAdd];
            }
            return [...prev, ...items];
          });
          toast.success(`已附加 ${items.length} 个素材`);
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
            toast.success('图片编辑已保存');
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
            toast.success('视频编辑已保存');
          }}
        />
      )}

      {/* 音频预览弹窗 */}
      {editingAssetIndex !== null && (attachedAssets[editingAssetIndex]?.asset.asset_type === 'audio' || attachedAssets[editingAssetIndex]?.asset.file_name?.match(/\.(mp3|wav|aac|flac|ogg|m4a)$/i)) && (
        <AudioPreviewModal
          open={isAudioPreviewOpen}
          audioUrl={attachedAssets[editingAssetIndex].fullUrl}
          fileName={attachedAssets[editingAssetIndex].asset.file_name}
          onCancel={() => {
            setIsAudioPreviewOpen(false);
            setEditingAssetIndex(null);
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
