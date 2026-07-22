/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 资产库选择弹窗
 * 在 Playground 输入框中点击 "+" 时弹出，加载用户资产库
 * 支持分类切换、文件夹浏览、搜索、点击选中素材
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Modal, Spin, Segmented, Empty, Input } from 'antd';
import toast from './PlaygroundToast';
import { getSharedModalStyles } from '../utils/modalStyles';
import {
  FolderFilled, PictureOutlined, VideoCameraOutlined,
  AudioOutlined, ArrowLeftOutlined, SearchOutlined,
  CheckCircleFilled, CloudOutlined,
} from '@ant-design/icons';
import request from '../../../utils/request';
import type { PluginAsset } from '../../../types';
import { useThemeStore } from '../../../store/theme';
import { useTranslation } from 'react-i18next';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface AssetGroup {
  id: number;
  user_id: string;
  group_id: string;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

interface StorageInfo {
  folder: string;
  file_count: number;
  total_size_mb: string;
  quota_mb: number;
  remain_mb: string;
  is_admin: boolean;
}

interface AssetPickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (items: { asset: PluginAsset; fullUrl: string }[]) => void;
  pluginNs?: string;
}

const AssetPickerModal: React.FC<AssetPickerModalProps> = ({ open, onClose, onSelect, pluginNs = 'asset_manager' }) => {
  const { t } = useTranslation(pluginNs);
  const { themeMode } = useThemeStore();
  const _isLight = themeMode === 'light';

  const CATEGORY_TABS = [
    { key: 'my_virtual_portrait', label: t('assets.my_materials', '我的素材'), filter: { source: 'user', category: '虚拟人像' } },
    { key: 'preset_模版库', label: '模版库', filter: { source: 'builtin', category: '模版库' } },
    { key: 'preset_素材库', label: '素材库', filter: { source: 'builtin', category: '素材库' } },
    { key: 'preset_虚拟人像库', label: '虚拟人像库', filter: { source: 'builtin', category: '虚拟人像库' } },
  ];

  const MY_SUBCATS = [
    { key: 'virtual', label: '虚拟人像', filter: { category: '虚拟人像' } },
    { key: 'real', label: '真人人像', filter: { category: '真人人像' } },
  ];

  const [activeTab, setActiveTab] = useState('my_virtual_portrait');
  const [mySubcat, setMySubcat] = useState('virtual');
  const [assets, setAssets] = useState<PluginAsset[]>([]);
  const [groups, setGroups] = useState<AssetGroup[]>([]);
  const [currentGroup, setCurrentGroup] = useState<AssetGroup | null>(null);
  const [loading, setLoading] = useState(false);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedAssets, setSelectedAssets] = useState<PluginAsset[]>([]);

  // 获取存储信息
  useEffect(() => {
    if (!open) return;
    request.get('/assets/user/storage-info', { headers: { 'x-plugin-ns': pluginNs } })
      .then((res: any) => { if (res) setStorage(res); })
      .catch(() => {});
  }, [open, pluginNs]);

  // 获取素材组
  const fetchGroups = useCallback(async () => {
    try {
      const res = await (request.get('/assets/user/groups', { headers: { 'x-plugin-ns': pluginNs } }) as any);
      if (res.groups) setGroups(res.groups);
    } catch (e) {
      console.error(e);
    }
  }, [pluginNs]);

  // 获取素材列表
  const fetchAssets = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = {};

      if (activeTab === 'my_virtual_portrait') {
        params.source = 'user';
        const sub = MY_SUBCATS.find(s => s.key === mySubcat);
        if (sub) params.category = sub.filter.category;
      } else if (activeTab.startsWith('preset_')) {
        params.source = 'builtin';
        params.category = activeTab.replace('preset_', '');
      }

      const queryStr = new URLSearchParams(params).toString();
      const url = queryStr ? `/assets/user/list?${queryStr}` : '/assets/user/list';
      const res = await (request.get(url, { headers: { 'x-plugin-ns': pluginNs } }) as any);
      if (res.assets) setAssets(res.assets);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [activeTab, mySubcat, pluginNs]);

  useEffect(() => {
    if (!open) return;
    setSelectedAssets([]);
    setCurrentGroup(null);
    setSearchKeyword('');
    fetchAssets();
    if (activeTab === 'my_virtual_portrait' && mySubcat === 'virtual') {
      fetchGroups();
    }
  }, [open, activeTab, mySubcat, fetchAssets, fetchGroups]);

  // 过滤资产
  const filteredAssets = useMemo(() => {
    let list = assets;
    // 如果在文件夹内，只显示该文件夹的素材
    if (currentGroup) {
      list = list.filter(a => a.group_id === currentGroup.group_id);
    }
    // 搜索过滤
    if (searchKeyword.trim()) {
      const kw = searchKeyword.toLowerCase();
      list = list.filter(a => a.file_name.toLowerCase().includes(kw));
    }
    return list;
  }, [assets, currentGroup, searchKeyword]);

  // 计算各文件夹中的素材数量
  const groupAssetCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of assets) {
      if (a.group_id) counts[a.group_id] = (counts[a.group_id] || 0) + 1;
    }
    return counts;
  }, [assets]);

  const getFullUrl = (url: string) => {
    if (!url) return '';
    if (!url.startsWith('http') && !url.startsWith('/')) return `https://${url}`;
    if (url.startsWith('/')) return `${API_BASE_URL}${url}`;
    return url;
  };

  const handleConfirm = () => {
    if (selectedAssets.length === 0) {
      toast.warning('请先至少选择一个素材');
      return;
    }
    onSelect(selectedAssets.map(a => ({ asset: a, fullUrl: getFullUrl(a.file_url) })));
    onClose();
  };

  const toggleAsset = (asset: PluginAsset) => {
    setSelectedAssets(prev => {
      const exists = prev.find(a => a.id === asset.id);
      if (exists) return prev.filter(a => a.id !== asset.id);
      if (prev.length >= 10) {
        toast.warning('最多只能选择 10 个素材');
        return prev;
      }
      return [...prev, asset];
    });
  };

  // 存储空间
  const usedMB = storage ? parseFloat(storage.total_size_mb) : 0;
  const quotaMB = storage?.quota_mb ?? 100;
  const isAdmin = storage?.is_admin ?? false;
  const usagePercent = (!isAdmin && quotaMB > 0) ? Math.min(100, (usedMB / quotaMB) * 100) : 0;
  const progressColor = usagePercent > 90 ? '#ff4d4f' : usagePercent > 70 ? '#faad14' : '#52c41a';

  const renderAssetTypeIcon = (asset: PluginAsset) => {
    const ext = asset.file_name.split('.').pop()?.toLowerCase() || '';
    const videoExts = ['mp4', 'mov', 'webm', 'avi', 'mkv'];
    const audioExts = ['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a'];
    if (asset.asset_type === 'video' || videoExts.includes(ext)) return <VideoCameraOutlined style={{ fontSize: 12 }} />;
    if (asset.asset_type === 'audio' || audioExts.includes(ext)) return <AudioOutlined style={{ fontSize: 12 }} />;
    return <PictureOutlined style={{ fontSize: 12 }} />;
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={null}
      footer={null}
      width={760}
      centered
      destroyOnHidden
      {...getSharedModalStyles(_isLight)}
      styles={{
        ...getSharedModalStyles(_isLight).styles,
        body: { padding: 0, background: 'transparent', overflow: 'hidden' },
        header: { display: 'none' },
      }}
      closable={false}
      mask={{ closable: true }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '70vh', maxHeight: 640 }}>
        {/* 顶部标题栏 */}
        <div style={{
          padding: '20px 24px 16px',
          borderBottom: _isLight ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {currentGroup && (
              <div
                onClick={() => setCurrentGroup(null)}
                style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: _isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', transition: 'all 0.2s',
                  color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = _isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.12)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = _isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)'; }}
              >
                <ArrowLeftOutlined style={{ fontSize: 14 }} />
              </div>
            )}
            <span style={{ fontSize: 18, fontWeight: 600, color: _isLight ? '#1f2937' : '#fff' }}>
              {currentGroup ? currentGroup.name : t('assets.my_assets', '我的素材库')}
            </span>
          </div>

          {/* 存储信息 */}
          {storage && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '4px 14px',
              background: _isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)',
              borderRadius: 20,
              fontSize: 12,
              color: _isLight ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)',
            }}>
              <CloudOutlined style={{ color: '#1677ff', fontSize: 13 }} />
              <span style={{ color: progressColor, fontWeight: 500 }}>{usedMB.toFixed(1)} MB</span>
              {!isAdmin && (
                <>
                  <span>/</span>
                  <span>{quotaMB} MB</span>
                  <div style={{
                    width: 50, height: 4, background: _isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)',
                    borderRadius: 2, overflow: 'hidden',
                  }}>
                    <div style={{
                      height: '100%', width: `${usagePercent}%`,
                      background: progressColor, borderRadius: 2,
                      transition: 'width 0.5s ease',
                    }} />
                  </div>
                </>
              )}
              <span style={{ marginLeft: 4 }}>{storage.file_count} 文件</span>
            </div>
          )}
        </div>

        {/* 分类标签栏 */}
        <div style={{
          padding: '12px 24px',
          borderBottom: _isLight ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <Segmented
              options={CATEGORY_TABS.map(t => ({ label: t.label, value: t.key }))}
              value={activeTab}
              onChange={(val) => { setActiveTab(val as string); setCurrentGroup(null); }}
              size="middle"
            />
            {/* 搜索框 */}
            <Input
              prefix={<SearchOutlined style={{ color: _isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)' }} />}
              placeholder="搜索素材..."
              value={searchKeyword}
              onChange={e => setSearchKeyword(e.target.value)}
              allowClear
              style={{
                width: 200,
                background: _isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)',
                borderColor: _isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)',
                borderRadius: 8,
                color: _isLight ? '#000' : '#fff',
              }}
              onKeyDown={e => e.stopPropagation()}
            />
          </div>

          {/* 我的素材二级分类 */}
          {activeTab === 'my_virtual_portrait' && (
            <Segmented
              options={MY_SUBCATS.map(s => ({ label: s.label, value: s.key }))}
              value={mySubcat}
              onChange={(val) => { setMySubcat(val as string); setCurrentGroup(null); }}
              size="small"
            />
          )}
        </div>

        {/* 主要内容区 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
          <Spin spinning={loading}>
            {/* 文件夹列表 - 仅在 "我的素材 > 虚拟人像" 且未进入文件夹时显示 */}
            {activeTab === 'my_virtual_portrait' && mySubcat === 'virtual' && !currentGroup && (
              <div style={{ marginBottom: 20 }}>
                <div style={{
                  fontSize: 13, fontWeight: 500, color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)',
                  marginBottom: 10,
                }}>
                  素材资产文件夹列表
                  <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 400 }}>
                    （已创建 {groups.length} 个素材组）
                  </span>
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                  gap: 10,
                }}>
                  {groups.map(g => (
                    <div
                      key={g.group_id}
                      onClick={() => setCurrentGroup(g)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '14px 16px',
                        background: _isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.03)',
                        border: _isLight ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(255,255,255,0.06)',
                        borderRadius: 12,
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = _isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.07)';
                        e.currentTarget.style.borderColor = _isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.12)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = _isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.03)';
                        e.currentTarget.style.borderColor = _isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)';
                      }}
                    >
                      <FolderFilled style={{ fontSize: 28, color: '#5BB8F5' }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{
                          fontSize: 14, fontWeight: 500, color: _isLight ? '#1f2937' : '#fff',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>{g.name}</div>
                        <div style={{ fontSize: 12, color: _isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)' }}>
                          {groupAssetCounts[g.group_id] || 0} 项
                        </div>
                      </div>
                    </div>
                  ))}
                  {groups.length === 0 && !loading && (
                    <div style={{ gridColumn: '1 / -1', padding: '20px 0', textAlign: 'center', color: _isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)', fontSize: 13 }}>
                      暂无人物文件夹
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 素材网格 */}
            {(activeTab !== 'my_virtual_portrait' || mySubcat !== 'virtual' || currentGroup) && (
              filteredAssets.length === 0 && !loading ? (
                <Empty
                  description={<span style={{ color: _isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)' }}>暂无素材</span>}
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  style={{ marginTop: 60 }}
                />
              ) : (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                  gap: 10,
                }}>
                  {filteredAssets.map(asset => {
                    const fullUrl = getFullUrl(asset.file_url);
                    const isSelected = selectedAssets.some(a => a.id === asset.id);
                    const ext = asset.file_name.split('.').pop()?.toLowerCase() || '';
                    const isVideo = asset.asset_type === 'video' || ['mp4', 'mov', 'webm', 'avi', 'mkv'].includes(ext);
                    const isAudio = asset.asset_type === 'audio' || ['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a'].includes(ext);

                    return (
                      <div
                        key={asset.id}
                        onClick={() => toggleAsset(asset)}
                        style={{
                          position: 'relative',
                          borderRadius: 10,
                          overflow: 'hidden',
                          border: `2px solid ${isSelected ? '#1677ff' : (_isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)')}`,
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          background: isSelected ? 'rgba(22,119,255,0.08)' : (_isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)'),
                          aspectRatio: '1',
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.borderColor = _isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)';
                            e.currentTarget.style.background = _isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.borderColor = _isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)';
                            e.currentTarget.style.background = _isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)';
                          }
                        }}
                      >
                        {/* 预览内容 */}
                        {isAudio ? (
                          <div style={{
                            width: '100%', height: '100%',
                            display: 'flex', flexDirection: 'column',
                            alignItems: 'center', justifyContent: 'center',
                            background: 'rgba(0,0,0,0.2)',
                          }}>
                            <AudioOutlined style={{ fontSize: 32, color: 'rgba(255,255,255,0.3)' }} />
                          </div>
                        ) : isVideo ? (
                          <video
                            src={fullUrl}
                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                            muted
                            preload="metadata"
                          />
                        ) : (
                          <img
                            src={fullUrl}
                            alt={asset.file_name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                            loading="lazy"
                          />
                        )}

                        {/* 类型标签 */}
                        <div style={{
                          position: 'absolute', top: 6, left: 6,
                          padding: '2px 6px', borderRadius: 4,
                          background: 'rgba(0,0,0,0.6)',
                          backdropFilter: 'blur(4px)',
                          color: 'rgba(255,255,255,0.7)',
                          fontSize: 10, display: 'flex', alignItems: 'center', gap: 3,
                        }}>
                          {renderAssetTypeIcon(asset)}
                        </div>

                        {/* 选中标记 */}
                        {isSelected && (
                          <div style={{
                            position: 'absolute', top: 6, right: 6,
                            width: 22, height: 22, borderRadius: '50%',
                            background: '#1677ff',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: '0 2px 8px rgba(22,119,255,0.4)',
                          }}>
                            <CheckCircleFilled style={{ fontSize: 14, color: '#fff' }} />
                          </div>
                        )}

                        {/* 底部文件名 */}
                        <div style={{
                          position: 'absolute', bottom: 0, left: 0, right: 0,
                          padding: '16px 8px 6px',
                          background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
                          color: 'rgba(255,255,255,0.85)',
                          fontSize: 11, fontWeight: 400,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {asset.file_name}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            )}

            {/* 文件夹列表下方显示素材 (在文件夹外时) */}
            {activeTab === 'my_virtual_portrait' && mySubcat === 'virtual' && !currentGroup && filteredAssets.length > 0 && (
              <div>
                <div style={{
                  fontSize: 13, fontWeight: 500, color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)',
                  marginBottom: 10,
                }}>
                  所有虚拟人像素材
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                  gap: 10,
                }}>
                  {filteredAssets.map(asset => {
                    const fullUrl = getFullUrl(asset.file_url);
                    const isSelected = selectedAssets.some(a => a.id === asset.id);

                    return (
                      <div
                        key={asset.id}
                        onClick={() => toggleAsset(asset)}
                        style={{
                          position: 'relative',
                          borderRadius: 10, overflow: 'hidden',
                          border: `2px solid ${isSelected ? '#1677ff' : (_isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)')}`,
                          cursor: 'pointer', transition: 'all 0.2s ease',
                          background: isSelected ? 'rgba(22,119,255,0.08)' : (_isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)'),
                          aspectRatio: '1',
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) { e.currentTarget.style.borderColor = _isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)'; }
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) { e.currentTarget.style.borderColor = _isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'; }
                        }}
                      >
                        <img
                          src={fullUrl} alt={asset.file_name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                          loading="lazy"
                        />
                        {isSelected && (
                          <div style={{
                            position: 'absolute', top: 6, right: 6,
                            width: 22, height: 22, borderRadius: '50%',
                            background: '#1677ff',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <CheckCircleFilled style={{ fontSize: 14, color: '#fff' }} />
                          </div>
                        )}
                        <div style={{
                          position: 'absolute', bottom: 0, left: 0, right: 0,
                          padding: '16px 8px 6px',
                          background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
                          color: 'rgba(255,255,255,0.85)', fontSize: 11,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {asset.file_name}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Spin>
        </div>

        {/* 底部操作栏 */}
        <div style={{
          padding: '14px 24px',
          borderTop: _isLight ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0,
          background: _isLight ? 'rgba(0,0,0,0.02)' : 'rgba(0,0,0,0.15)',
        }}>
          <div style={{ fontSize: 13, color: _isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)' }}>
            {selectedAssets.length > 0 ? (
              <span>
                已选择: <span style={{ color: '#1677ff', fontWeight: 500 }}>{selectedAssets.length} 项</span>
              </span>
            ) : (
              <span>点击素材进行选择</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div
              onClick={onClose}
              style={{
                padding: '7px 20px', borderRadius: 8,
                background: _isLight ? '#fff' : 'rgba(255,255,255,0.06)',
                border: _isLight ? '1px solid #d9d9d9' : '1px solid rgba(255,255,255,0.1)',
                color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)',
                fontSize: 13, fontWeight: 500,
                cursor: 'pointer', transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = _isLight ? '#f5f5f5' : 'rgba(255,255,255,0.1)';
                if (_isLight) e.currentTarget.style.color = '#1677ff';
                if (_isLight) e.currentTarget.style.borderColor = '#1677ff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = _isLight ? '#fff' : 'rgba(255,255,255,0.06)';
                if (_isLight) e.currentTarget.style.color = 'rgba(0,0,0,0.65)';
                if (_isLight) e.currentTarget.style.borderColor = '#d9d9d9';
              }}
            >
              {t('common.cancel', '取消')}
            </div>
            <div
              onClick={handleConfirm}
              style={{
                padding: '7px 24px', borderRadius: 8,
                background: selectedAssets.length > 0
                  ? 'linear-gradient(135deg, #1677ff 0%, #36cfc9 100%)'
                  : (_isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)'),
                color: selectedAssets.length > 0 ? '#fff' : (_isLight ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)'),
                fontSize: 13, fontWeight: 500,
                cursor: selectedAssets.length > 0 ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s',
                boxShadow: selectedAssets.length > 0 ? '0 4px 12px rgba(22,119,255,0.3)' : 'none',
              }}
              onMouseEnter={(e) => {
                if (selectedAssets.length > 0) e.currentTarget.style.boxShadow = '0 6px 20px rgba(22,119,255,0.45)';
              }}
              onMouseLeave={(e) => {
                if (selectedAssets.length > 0) e.currentTarget.style.boxShadow = '0 4px 12px rgba(22,119,255,0.3)';
              }}
            >
              {t('common.ok', '确认选择')}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default AssetPickerModal;
