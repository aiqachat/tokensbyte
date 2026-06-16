import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Table, Button, Space, message, Card, Typography, Upload, Tag, Progress, Spin, Menu, Modal, Select, Form, Segmented, Input, Image, Divider, Dropdown, Checkbox } from 'antd';
import { useTranslation } from 'react-i18next';
import {
  UploadOutlined, CloudOutlined, FolderOutlined, FolderFilled, FileOutlined,
  PictureOutlined, VideoCameraOutlined, UserOutlined, AppstoreOutlined,
  StarOutlined, InboxOutlined, AudioOutlined, UserAddOutlined, EditOutlined,
  SendOutlined, LoadingOutlined, CheckCircleOutlined, CloseCircleOutlined,
  CheckCircleFilled, DownloadOutlined, DeleteOutlined, FilterOutlined, LoginOutlined
} from '@ant-design/icons';
import request from '../../utils/request';
import { useThemeStore } from '../../store/theme';
import type { PluginAsset } from '../../types';
import type { MenuProps } from 'antd';

const { Title, Text } = Typography;


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
  files: Array<{
    key: string;
    filename: string;
    size: number;
    size_display: string;
    last_modified: string;
  }>;
  file_count: number;
  total_size_mb: string;
  quota_mb: number;
  remain_mb: string;
  is_admin: boolean;
  virtual_portrait_count?: number;
  virtual_portrait_quota?: number;
  review_enabled?: boolean;
}

// 我的素材固定二级分类
const MY_ASSET_SUBCATEGORIES_BASE = [
  { key: 'my_virtual_portrait', labelKey: 'virtual_material_library', icon: <UserOutlined />, filter: { category: '虚拟人像' } },
];

const UserAssets: React.FC<{ pluginNs?: string }> = ({ pluginNs = 'asset_manager' }) => {
  const { t } = useTranslation(pluginNs);
  const { themeMode } = useThemeStore();
  const isLight = themeMode === 'light';
  // 主题适配变量
  const panelBg = isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)';
  const panelBorder = isLight ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(255,255,255,0.06)';
  const panelBorderStrong = isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.08)';
  const mainText = isLight ? '#1f2937' : '#fff';
  const subText = isLight ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.55)';
  const descText = isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)';
  const hintText = isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)';
  const dimText = isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)';
  const btnBg = isLight ? '#f0f0f0' : '#262626';
  const btnText = isLight ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.85)';
  const tagBg = isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)';
  const tagBorder = isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.1)';
  const tagText = isLight ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.75)';
  const actionBtnBg = isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.08)';
  const actionBtnBorder = isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)';
  const [assets, setAssets] = useState<PluginAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [storageLoading, setStorageLoading] = useState(false);

  // 分类状态
  const PRESET_CATEGORIES = [
    { key: '模版库', label: t('template_library'), children: [{ key: '参考生成', label: t('ref_generation') }, { key: '视频编辑', label: t('video_editing') }, { key: '时序补全', label: t('sequence_completion') }] },
    { key: '素材库', label: t('material_library'), children: [{ key: '视频', label: t('video') }, { key: '图片', label: t('image') }, { key: '音频', label: t('audio') }] },
    { key: '虚拟人像库', label: t('virtual_portrait_library'), children: [] }
  ];
  const MY_ASSET_SUBCATEGORIES = MY_ASSET_SUBCATEGORIES_BASE.map(s => ({ ...s, label: t(s.labelKey) }));
  const [selectedKey, setSelectedKey] = useState<string>(() => {
    return new URLSearchParams(window.location.search).get('tab') || 'my_virtual_portrait';
  });

  // 资源筛选器状态
  const [assetFilter, setAssetFilter] = useState<string>('all');

  // 上传弹窗
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadForm] = Form.useForm();
  const [fileList, setFileList] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadAssetType, setUploadAssetType] = useState<'image' | 'video' | 'audio'>('image');
  const [batchProgress, setBatchProgress] = useState<{ action: 'upload' | 'submit' | 'delete'; total: number; done: number; failed: number; active: boolean } | null>(null);

  // 组状态
  const [groups, setGroups] = useState<AssetGroup[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [currentGroup, setCurrentGroup] = useState<AssetGroup | null>(null);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [groupForm] = Form.useForm();

  // 编辑文件夹状态
  const [isEditGroupModalOpen, setIsEditGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<AssetGroup | null>(null);
  const [editGroupForm] = Form.useForm();
  const [savingGroup, setSavingGroup] = useState(false);

  // 选中状态 (右侧面板)
  interface SelectedRecord {
    type: 'group' | 'asset';
    data: any;
  }
  const [selectedRecord, setSelectedRecord] = useState<SelectedRecord | null>(null);
  const [mediaInfo, setMediaInfo] = useState<{ width?: number; height?: number; duration?: number } | null>(null);

  // 多选状态
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<number>>(new Set());

  // 同步当前选项和文件夹状态到 URL
  const [groupsLoaded, setGroupsLoaded] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let changed = false;
    
    if (params.get('tab') !== selectedKey) {
      params.set('tab', selectedKey);
      changed = true;
    }
    
    const currentGroupId = currentGroup ? currentGroup.group_id : null;
    if (params.get('group') !== currentGroupId) {
      if (currentGroupId) {
        params.set('group', currentGroupId);
        changed = true;
      } else if (groupsLoaded) {
        // 仅在 groups 已加载后才清除 group 参数，避免初始化时误删
        params.delete('group');
        changed = true;
      }
    }
    
    if (changed) {
      window.history.replaceState(null, '', '?' + params.toString());
    }
  }, [selectedKey, currentGroup, groupsLoaded]);
  // 当选中素材变化时，自动探测媒体元数据
  useEffect(() => {
    if (!selectedRecord || selectedRecord.type !== 'asset') {
      setMediaInfo(null);
      return;
    }
    const asset = selectedRecord.data as PluginAsset;
    let url = asset.file_url || '';
    if (!url.startsWith('http') && !url.startsWith('/')) url = `https://${url}`;
    else if (url.startsWith('/')) url = `${API_BASE_URL}${url}`;
    const ext = asset.file_name.split('.').pop()?.toLowerCase() || '';
    const imageExts = ['jpeg','jpg','png','webp','gif','bmp','tiff','heic','heif'];
    const videoExts = ['mp4','mov','webm','avi','mkv'];
    const audioExts = ['mp3','wav','aac','flac','ogg','m4a'];

    setMediaInfo(null);

    if (asset.asset_type === 'image' || imageExts.includes(ext)) {
      const img = new window.Image();
      img.onload = () => setMediaInfo({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => setMediaInfo(null);
      img.src = url;
    } else if (asset.asset_type === 'video' || videoExts.includes(ext)) {
      const vid = document.createElement('video');
      vid.preload = 'metadata';
      vid.onloadedmetadata = () => setMediaInfo({ width: vid.videoWidth, height: vid.videoHeight, duration: vid.duration });
      vid.onerror = () => setMediaInfo(null);
      vid.src = url;
    } else if (asset.asset_type === 'audio' || audioExts.includes(ext)) {
      const aud = document.createElement('audio');
      aud.preload = 'metadata';
      aud.onloadedmetadata = () => setMediaInfo({ duration: aud.duration });
      aud.onerror = () => setMediaInfo(null);
      aud.src = url;
    }
  }, [selectedRecord]);

  const fetchGroups = useCallback(async () => {
    try {
      setLoadingGroups(true);
      const res = await (request.get('/assets/user/groups', { headers: { 'x-plugin-ns': pluginNs } }) as any);
      if (res.groups) {
        setGroups(res.groups);
        const groupParam = new URLSearchParams(window.location.search).get('group');
        if (groupParam) {
          const found = res.groups.find((g: any) => g.group_id === groupParam);
          if (found) setCurrentGroup(found);
        }
      }
    } catch (e) {
      console.error(e);
      // 全局拦截器已统一弹出错误提示
    } finally {
      setLoadingGroups(false);
      setGroupsLoaded(true);
    }
  }, [pluginNs]);

  useEffect(() => {
    if (selectedKey === 'my_virtual_portrait') fetchGroups();
  }, [selectedKey, fetchGroups]);


  // 编辑弹窗
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<PluginAsset | null>(null);
  const [editForm] = Form.useForm();
  const [savingEdit, setSavingEdit] = useState(false);

  const handleEditAsset = async () => {
    try {
      const values = await editForm.validateFields();
      if (!editingAsset) return;
      setSavingEdit(true);
      await request.put(`/assets/user/${editingAsset.id}/edit`, {
        file_name: values.file_name,
        category: values.category
      }, { headers: { 'x-plugin-ns': pluginNs } });
      message.success(t('asset_update_success'));
      setIsEditModalOpen(false);
      fetchAssets();
    } catch (error) {
      console.error('更新素材失败', error);
      message.error(t('asset_update_failed'));
    } finally {
      setSavingEdit(false);
    }
  };

  // 根据当前选中分类构建 query 参数
  const buildQueryParams = useCallback(() => {
    const params: Record<string, string> = {};

    if (selectedKey.startsWith('preset_')) {
      params.source = 'builtin';
      let cat = selectedKey.replace('preset_', ''); // e.g., "模版库" or "模版库/视频编辑"
      params.category = cat;
    } else if (selectedKey.startsWith('my_')) {
      params.source = 'user';
      const sub = MY_ASSET_SUBCATEGORIES.find(s => s.key === selectedKey);
      if (sub) {
        Object.entries(sub.filter).forEach(([k, v]) => {
          params[k] = v;
        });
      }
    }

    return params;
  }, [selectedKey]);

  const fetchAssets = useCallback(async () => {
    try {
      setLoading(true);
      const params = buildQueryParams();
      const queryStr = new URLSearchParams(params).toString();
      const url = queryStr ? `/assets/user/list?${queryStr}` : '/assets/user/list';
      const res = await (request.get(url, { headers: { 'x-plugin-ns': pluginNs } }) as any);
      if (res.assets) {
        setAssets(res.assets);
      }
    } catch (error) {
      console.error(error);
      // 全局拦截器已统一弹出错误提示
    } finally {
      setLoading(false);
    }
  }, [buildQueryParams]);

  // 提交审核
  const [submittingReview, setSubmittingReview] = useState<number | null>(null);

  // 轮询 processing 状态
  useEffect(() => {
    const processingAssets = assets.filter(a => a.status === 'processing');
    if (processingAssets.length === 0) return;
    
    const timer = setInterval(async () => {
      for (const asset of processingAssets) {
        try {
          const res = await (request.get(`/assets/user/asset-status/${asset.id}`, { headers: { 'x-plugin-ns': pluginNs } }) as any);
          if (res.status && res.status !== 'processing') {
            fetchAssets();
            break;
          }
        } catch (e) {
          console.error('轮询状态失败', e);
        }
      }
    }, 5000);

    return () => clearInterval(timer);
  }, [assets, fetchAssets]);

  const fetchStorageInfo = async () => {
    try {
      setStorageLoading(true);
      const res = await (request.get('/assets/user/storage-info', { headers: { 'x-plugin-ns': pluginNs } }) as any);
      if (res) {
        setStorage(res);
      }
    } catch (error) {
      console.error('获取存储信息失败', error);
    } finally {
      setStorageLoading(false);
    }
  };

  useEffect(() => {
    if (!storage) {
      fetchStorageInfo();
    }
  }, []);

  // 当 selectedKey 改变时重新获取素材并清空选中
  useEffect(() => {
    if (selectedKey) {
      setSelectedRecord(null);
      setSelectedAssetIds(new Set());
      fetchAssets();
    }
  }, [selectedKey, fetchAssets]);

  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  // 真人认证处理
  const handleRealPortraitVerify = async () => {
    try {
      setLoading(true);
      const res = await request.post('/assets/user/init-real-person-verify', {
        callback_url: window.location.origin + window.location.pathname
      }, { headers: { 'x-plugin-ns': pluginNs } }) as any;

      if (res.h5_link) {
        // 保存 token 到 session 供回来后查看
        sessionStorage.setItem('pending_byted_token', res.byted_token);
        window.location.href = res.h5_link;
      }
    } catch (error) {
      console.error(error);
      // 全局拦截器已统一弹出错误提示
    } finally {
      setLoading(false);
    }
  };

  // 检查 URL 中是否有认证返回的 token
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('byted_token') || sessionStorage.getItem('pending_byted_token');
    
    if (token) {
      sessionStorage.removeItem('pending_byted_token');
      // 清除 URL 参数
      window.history.replaceState({}, document.title, window.location.pathname);
      
      const completeVerify = async () => {
        try {
          message.loading({ content: t('verify_in_progress'), key: 'verify' });
          await request.post('/assets/user/complete-real-person-verify', { byted_token: token }, { headers: { 'x-plugin-ns': pluginNs } });
          message.success({ content: t('verify_success'), key: 'verify' });
          fetchAssets();
        } catch (error) {
          message.error({ content: t('verify_failed'), key: 'verify' });
        }
      };
      completeVerify();
    }
  }, [fetchAssets]);

  // 上传处理
  
  const handleCreateGroup = async () => {
    try {
      const vals = await groupForm.validateFields();
      setLoadingGroups(true);
      await request.post('/assets/user/groups', vals, { headers: { 'x-plugin-ns': pluginNs } });
      message.success(t('create_group_success'));
      setIsGroupModalOpen(false);
      groupForm.resetFields();
      fetchGroups();
      fetchStorageInfo();
    } catch (error: any) {
      // 表单验证错误由 antd 处理，API 错误由全局拦截器统一弹出
      if (error?.errorFields) return;
    } finally {
      setLoadingGroups(false);
    }
  };

  const handleCustomUpload = async () => {
    try {
      const values = await uploadForm.validateFields();
      if (fileList.length === 0) {
        message.warning(t('select_files'));
        return;
      }

      const category = values.category || '未分类';
      const api = category === '虚拟人像' ? '/assets/user/upload-virtual-portrait' : '/assets/upload';
      const filesToUpload = [...fileList];
      const groupId = currentGroup?.group_id;

      // 立即关闭弹窗，进入异步上传模式
      setIsUploadModalOpen(false);
      uploadForm.resetFields();
      setFileList([]);
      setBatchProgress({ action: 'upload', total: filesToUpload.length, done: 0, failed: 0, active: true });

      // 逐个上传文件，实时更新进度
      let doneCount = 0;
      let failCount = 0;
      const errorMessages = new Set<string>();
      let quotaExceeded = false;

      for (const fileItem of filesToUpload) {
        // 如果已经触发了配额上限，跳过剩余文件
        if (quotaExceeded) {
          failCount++;
          setBatchProgress({ action: 'upload', total: filesToUpload.length, done: doneCount, failed: failCount, active: true });
          continue;
        }
        try {
          const rawFile = fileItem.originFileObj as File;
          const ext = fileItem.name?.split('.').pop()?.toLowerCase() || '';
          const videoExts = ['mp4', 'mov', 'webm', 'avi', 'mkv'];
          const audioExts = ['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a'];
          const detectedType = videoExts.includes(ext) ? 'video' : audioExts.includes(ext) ? 'audio' : 'image';
          // 文件名超过64字符时自动截断（保留扩展名）
          let uploadFile: File = rawFile;
          if (rawFile.name.length > 64) {
            const dotIdx = rawFile.name.lastIndexOf('.');
            const fileExt = dotIdx >= 0 ? rawFile.name.slice(dotIdx) : '';
            const baseName = dotIdx >= 0 ? rawFile.name.slice(0, dotIdx) : rawFile.name;
            const truncatedName = baseName.slice(0, 64 - fileExt.length) + fileExt;
            uploadFile = new File([rawFile], truncatedName, { type: rawFile.type });
          }
          const formData = new FormData();
          formData.append('file', uploadFile);
          formData.append('category', category);
          formData.append('asset_type', detectedType);
          if (category === '虚拟人像' && groupId) { formData.append('group_id', groupId); }
          await request.post(api, formData, { headers: { 'Content-Type': 'multipart/form-data', 'x-plugin-ns': pluginNs }, skipErrorHandler: true } as any);
          doneCount++;
        } catch (e: any) {
          console.error(`上传 ${fileItem.name} 失败`, e);
          failCount++;
          const errMsg = e?.response?.data?.error?.message || '上传失败';
          errorMessages.add(errMsg);
          // 如果是配额/上限错误，标记后跳过剩余文件
          if (errMsg.includes('上限') || errMsg.includes('已达') || errMsg.includes('超出') || errMsg.includes('配额')) {
            quotaExceeded = true;
          }
        }
        setBatchProgress({ action: 'upload', total: filesToUpload.length, done: doneCount, failed: failCount, active: true });
      }

      // 上传完毕 — 统一提示
      if (failCount === 0) {
        message.success(reviewEnabled ? t('all_upload_success', { count: doneCount }) : t('all_upload_success_no_review', { count: doneCount }));
      } else if (doneCount === 0) {
        message.error(Array.from(errorMessages).join('；'));
      } else {
        message.warning(t('upload_partial', { success: doneCount, fail: failCount }) + (errorMessages.size > 0 ? ` (${Array.from(errorMessages).join('; ')})` : ''));
      }
      setSelectedKey('my_virtual_portrait');
      fetchAssets();
      fetchStorageInfo();
      // 3 秒后自动隐藏进度条
      setTimeout(() => setBatchProgress(null), 3000);
    } catch (error) {
      console.error(error);
      message.error(t('upload_failed'));
      setBatchProgress(null);
    }
  };

  // 提交审核
  const handleSubmitReview = async (assetId: number) => {
    try {
      setSubmittingReview(assetId);
      await request.post(`/assets/user/submit-review/${assetId}`, {}, { skipErrorHandler: true, headers: { 'x-plugin-ns': pluginNs } } as any);
      message.success(t('review_submitted'));
      fetchAssets();
    } catch (error: any) {
      const rawMsg = error?.response?.data?.error?.message || '';
      message.error(rawMsg || t('review_submit_failed'));
    } finally {
      setSubmittingReview(null);
    }
  };

  // 批量提交审核
  const handleBatchSubmitReview = async () => {
    // 找出选中的素材中需要提交审核的（过滤掉已通过且有 asset_id 的、审核中的）
    const needReviewIds = Array.from(selectedAssetIds).filter(id => {
      const asset = assets.find(a => a.id === id);
      return asset && asset.source === 'user' && (asset.status === 'uploaded' || (asset.status === 'approved' && !asset.asset_id));
    });
    if (needReviewIds.length === 0) {
      message.info(t('no_review_needed'));
      return;
    }
    setBatchProgress({ action: 'submit', total: needReviewIds.length, done: 0, failed: 0, active: true });
    let successCount = 0;
    let failCount = 0;
    const errorMessages = new Set<string>();
    for (const id of needReviewIds) {
      try {
        await request.post(`/assets/user/submit-review/${id}`, {}, { skipErrorHandler: true, headers: { 'x-plugin-ns': pluginNs } } as any);
        successCount++;
      } catch (e: any) {
        failCount++;
        const errMsg = e?.response?.data?.error?.message || '审核失败';
        errorMessages.add(errMsg);
      }
      setBatchProgress({ action: 'submit', total: needReviewIds.length, done: successCount, failed: failCount, active: true });
    }
    if (failCount === 0) {
      message.success(t('batch_submit_success', { count: successCount }));
    } else if (successCount === 0) {
      message.error(Array.from(errorMessages).join('；'));
    } else {
      message.warning(t('batch_submit_partial', { success: successCount, fail: failCount }) + (errorMessages.size > 0 ? ` (${Array.from(errorMessages).join('; ')})` : ''));
    }
    setSelectedAssetIds(new Set());
    fetchAssets();
    setTimeout(() => setBatchProgress(null), 3000);
  };

  // 批量删除
  const handleBatchDelete = () => {
    if (selectedAssetIds.size === 0) return;
    Modal.confirm({
      title: t('confirm_batch_delete'),
      content: t('confirm_batch_delete_content', { count: selectedAssetIds.size }),
      okText: t('delete'),
      okType: 'danger',
      cancelText: t('cancel'),
      onOk: () => {
        const idsToDelete = Array.from(selectedAssetIds);
        setBatchProgress({ action: 'delete', total: idsToDelete.length, done: 0, failed: 0, active: true });
        // 异步执行批量删除，不阻塞弹窗关闭
        (async () => {
          let successCount = 0;
          let failCount = 0;
          for (const id of idsToDelete) {
            try {
              await request.delete(`/assets/user/${id}`, { skipErrorHandler: true, headers: { 'x-plugin-ns': pluginNs } } as any);
              successCount++;
            } catch {
              failCount++;
            }
            setBatchProgress({ action: 'delete', total: idsToDelete.length, done: successCount, failed: failCount, active: true });
          }
          if (failCount === 0) {
            message.success(t('batch_delete_success', { count: successCount }));
          } else {
            message.warning(t('batch_delete_partial', { success: successCount, fail: failCount }));
          }
          setSelectedAssetIds(new Set());
          fetchAssets();
          fetchStorageInfo();
          setTimeout(() => setBatchProgress(null), 3000);
        })();
      }
    });
  };

  // 存储空间计算
  const usedMB = storage ? parseFloat(storage.total_size_mb) : 0;
  const quotaMB = storage?.quota_mb ?? 100;
  const isAdmin = storage?.is_admin ?? false;
  const reviewEnabled = storage?.review_enabled !== false; // 默认开启
  const remainMB = isAdmin ? 0 : Math.max(0, quotaMB - usedMB);
  const usagePercent = (!isAdmin && quotaMB > 0) ? Math.min(100, (usedMB / quotaMB) * 100) : 0;
  const progressColor = usagePercent > 90 ? '#ff4d4f' : usagePercent > 70 ? '#faad14' : '#52c41a';


  // 当前选中的类别名称，用于列表上方提示
  const currentCategoryName = useMemo(() => {
    if (selectedKey.startsWith('preset_')) {
      const cat = selectedKey.replace('preset_', '');
      return cat.replace('/', ' · ');
    } else if (selectedKey.startsWith('my_')) {
      const sub = MY_ASSET_SUBCATEGORIES.find(s => s.key === selectedKey);
      return sub ? sub.label : t('unknown');
    }
    return t('unknown');
  }, [selectedKey]);

  const columns = [
    {
      title: t('preview'),
      key: 'preview',
      width: 100,
      render: (_: any, record: PluginAsset) => {
        let fullUrl = record.file_url;
        if (!fullUrl.startsWith('http') && !fullUrl.startsWith('/')) {
          fullUrl = `https://${fullUrl}`;
        } else if (fullUrl.startsWith('/')) {
          fullUrl = `${API_BASE_URL}${fullUrl}`;
        }

        if (record.asset_type === 'image') {
          return <img src={fullUrl} alt={record.file_name} style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: '4px' }} />;
        } else {
          return <video src={fullUrl} style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: '4px' }} muted />;
        }
      }
    },
    {
      title: 'Asset ID',
      dataIndex: 'asset_id',
      key: 'asset_id',
      render: (aid: string) => aid ? <Text code copyable>{aid}</Text> : <Text type="secondary">{t('none_yet')}</Text>
    },
    {
      title: t('type'),
      key: 'asset_type',
      render: (_: any, record: PluginAsset) => (
        <Tag color={record.asset_type === 'image' ? 'blue' : 'purple'}>
          {record.asset_type === 'image' ? t('image') : t('video')}
        </Tag>
      )
    },
    {
      title: t('category'),
      dataIndex: 'category',
      key: 'category',
      render: (cat: string) => <Tag color="cyan">{cat || t('uncategorized')}</Tag>
    },
    {
      title: t('size'),
      key: 'size',
      render: (_: any, record: PluginAsset) => {
        if (!record.size) return <Text type="secondary">-</Text>;
        if (record.size < 1024) return `${record.size} B`;
        if (record.size < 1024 * 1024) return `${(record.size / 1024).toFixed(1)} KB`;
        return `${(record.size / 1024 / 1024).toFixed(2)} MB`;
      }
    },
    ...(reviewEnabled ? [{
      title: t('review_status'),
      key: 'status',
      render: (_: any, record: PluginAsset) => {
        if (record.source === 'builtin') return <Tag color="gold">{t('preset')}</Tag>;
        if (record.status === 'uploaded' || (record.status === 'approved' && !record.asset_id)) return <Tag color="blue" icon={<SendOutlined />}>{t('pending_review')}</Tag>;
        if (record.status === 'processing') return <Tag color="processing" icon={<LoadingOutlined spin />}>{t('reviewing')}</Tag>;
        if (record.status === 'approved') return <Tag color="success" icon={<CheckCircleOutlined />}>{t('approved')}</Tag>;
        if (record.status === 'rejected') return (
          <>
            <Tag color="error" icon={<CloseCircleOutlined />}>{t('rejected')}</Tag>
            <div style={{ fontSize: '12px', color: '#ff4d4f', marginTop: 4 }}>
              {t('reason')}: {record.reject_reason || t('none_yet')}
            </div>
          </>
        );
        if (record.status === 'pending') return <Tag color="warning">{t('pending')}</Tag>;
        return <Tag>{record.status}</Tag>;
      }
    }] : [{
      title: t('status'),
      key: 'status',
      render: (_: any, record: PluginAsset) => {
        if (record.source === 'builtin') return <Tag color="gold">{t('preset')}</Tag>;
        return <Tag color="success" icon={<CheckCircleOutlined />}>{t('available')}</Tag>;
      }
    }]),
    {
      title: t('actions'),
      key: 'action',
      render: (_: any, record: PluginAsset) => (
        <Space size="middle">
          {reviewEnabled && record.source === 'user' && (record.status === 'uploaded' || (record.status === 'approved' && !record.asset_id)) && (
            <Button
              type="primary"
              size="small"
              icon={<SendOutlined />}
              loading={submittingReview === record.id}
              onClick={() => handleSubmitReview(record.id)}
            >
              {t('submit_review')}
            </Button>
          )}
          {record.source === 'user' && (
            <Button 
              type="text" 
              icon={<EditOutlined style={{ color: '#1677ff' }} />} 
              onClick={() => {
                setEditingAsset(record);
                editForm.setFieldsValue({
                  file_name: record.file_name,
                  category: record.category || '图片'
                });
                setIsEditModalOpen(true);
              }} 
            />
          )}
        </Space>
      )
    },
  ];

  const renderRightPanel = () => {
    if (!selectedRecord) {
      return (
        <div className="assets-right-panel-wrapper" style={{ width: 350, flexShrink: 0, background: panelBg, borderRadius: 12, border: panelBorder, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
          <div style={{ textAlign: 'center', color: hintText }}>
            <AppstoreOutlined style={{ fontSize: 48, marginBottom: 16, opacity: 0.5 }} />
            <div style={{ fontSize: 16 }}>{t('select_item_hint')}</div>
            <div style={{ fontSize: 12, marginTop: 8 }}>{t('support_hint')}</div>
          </div>
        </div>
      );
    }

    if (selectedRecord.type === 'group') {
      const g = selectedRecord.data as AssetGroup;
      const groupAssets = assets.filter(a => a.group_id === g.group_id);
      return (
        <div className="assets-right-panel-wrapper" style={{ width: 350, flexShrink: 0, background: isLight ? 'linear-gradient(180deg, rgba(22,119,255,0.05) 0%, rgba(0,0,0,0.01) 100%)' : 'linear-gradient(180deg, rgba(22,119,255,0.05) 0%, rgba(255,255,255,0.02) 100%)', borderRadius: 12, border: panelBorderStrong, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '32px 24px', textAlign: 'center', borderBottom: panelBorder }}>
            <FolderOutlined style={{ fontSize: 64, color: '#1677ff', marginBottom: 16 }} />
            <Title level={4} style={{ margin: 0, color: mainText, wordBreak: 'break-all' }}>{g.name}</Title>
            <Text type="secondary" style={{ display: 'block', marginTop: 8, wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>{g.description || t('no_description')}</Text>
          </div>
          <div style={{ padding: 24, flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Text type="secondary">Group ID</Text>
              <Text copyable={{ text: g.group_id }} style={{ color: descText }}>{g.group_id.substring(0, 16)}...</Text>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Text type="secondary">{t('contains_assets')}</Text>
              <Text style={{ color: mainText, fontWeight: 500 }}>{groupAssets.length} {t('items')}</Text>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Text type="secondary">{t('created_time')}</Text>
              <Text style={{ color: descText }}>{new Date(g.created_at).toLocaleString()}</Text>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Text type="secondary">{t('updated_time')}</Text>
              <Text style={{ color: descText }}>{g.updated_at ? new Date(g.updated_at).toLocaleString() : new Date(g.created_at).toLocaleString()}</Text>
            </div>
            <div style={{ flex: 1 }} />
            {/* 操作按钮组 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <Button 
                  icon={<EditOutlined style={{ color: btnText }} />} 
                  style={{ flex: 1, background: btnBg, border: 'none', color: btnText, height: 40, borderRadius: 8, fontSize: 14 }} 
                  onClick={() => {
                    setEditingGroup(g);
                    editGroupForm.setFieldsValue({ name: g.name, description: g.description || '' });
                    setIsEditGroupModalOpen(true);
                  }}>
                  {t('edit')}
                </Button>
                <Button 
                  icon={<DeleteOutlined style={{ color: '#ff7875' }} />} 
                  style={{ flex: 1, background: btnBg, border: 'none', color: '#ff7875', height: 40, borderRadius: 8, fontSize: 14 }} 
                  onClick={() => {
                    Modal.confirm({
                      title: '确认删除文件夹',
                      content: `确定要删除「${g.name}」文件夹吗？此操作不可恢复。文件夹中有素材时无法删除。`,
                      okText: '删除',
                      cancelText: '取消',
                      okButtonProps: { danger: true },
                      onOk: async () => {
                        try {
                          await (request as any).delete(`/assets/user/groups/${g.group_id}`, { headers: { 'x-plugin-ns': pluginNs } });
                          message.success(t('folder_deleted'));
                          setSelectedRecord(null);
                          fetchGroups();
                        } catch (e: any) {
                          // 拦截器已弹出错误提示，此处不重复弹出
                        }
                      }
                    });
                  }}>
                  {t('delete')}
                </Button>
              </div>
              <Button 
                type="primary" 
                size="large" 
                block 
                icon={<LoginOutlined />} 
                onClick={() => { setCurrentGroup(g); setSelectedRecord(null); }} 
                style={{ 
                  borderRadius: 8, 
                  height: 48, 
                  fontSize: 16, 
                  fontWeight: 500
                }}>
                {t('enter_folder')}
              </Button>
            </div>
          </div>
        </div>
      );
    }

    if (selectedRecord.type === 'asset') {
      const a = selectedRecord.data as PluginAsset;
      let fullUrl = a.file_url;
      if (!fullUrl.startsWith('http') && !fullUrl.startsWith('/')) { fullUrl = `https://${fullUrl}`; } else if (fullUrl.startsWith('/')) { fullUrl = `${API_BASE_URL}${fullUrl}`; }
      
      const sizeStr = a.size ? (a.size < 1024*1024 ? `${(a.size/1024).toFixed(1)} KB` : `${(a.size/1024/1024).toFixed(1)} MB`) : t('unknown');
      const ext = a.file_name.split('.').pop()?.toUpperCase() || 'FILE';
      const isImage = a.asset_type === 'image' || ['JPG','JPEG','PNG','WEBP','GIF','BMP','TIFF','HEIC','HEIF'].includes(ext);
      const isVideo = a.asset_type === 'video' || ['MP4','MOV','WEBM','AVI','MKV'].includes(ext);
      const isAudio = a.asset_type === 'audio' || ['MP3','WAV','AAC','FLAC','OGG','M4A'].includes(ext);
      const typeLabel = isImage ? `${ext} ${t('image_type')}` : isVideo ? `${ext} ${t('video_type')}` : isAudio ? `${ext} ${t('audio_type')}` : ext;
      const createdDate = a.created_at ? new Date(a.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : '-';
      const updatedDate = a.updated_at ? new Date(a.updated_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : '-';

      // 从文件名提取标签（下划线和短横线分割，去掉扩展名）
      const nameWithoutExt = a.file_name.replace(/\.[^/.]+$/, '');
      const tags = nameWithoutExt.split(/[_\-]+/).filter(t => t.length > 0).slice(0, 5);

      const infoRowStyle: React.CSSProperties = {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 16px',
        borderBottom: panelBorder,
      };

      return (
        <div className="assets-right-panel-wrapper" style={{ width: 350, flexShrink: 0, background: panelBg, borderRadius: 12, border: panelBorderStrong, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
          {/* 顶部标题 */}
          <div style={{ padding: '16px 20px 0', fontSize: 16, fontWeight: 600, color: mainText }}>{t('details')}</div>

          {/* 预览区 */}
          <div style={{ margin: '16px 20px 0', borderRadius: 10, overflow: 'hidden', background: '#111', flexShrink: 0 }}>
            {isImage ? (
              <Image src={fullUrl} alt={a.file_name} style={{ width: '100%', display: 'block' }} preview={{ mask: <span style={{ color: '#fff' }}>{t('click_preview')}</span> }} />
            ) : isVideo ? (
              <video src={fullUrl} controls style={{ width: '100%', display: 'block' }} />
            ) : isAudio ? (
              <div style={{ width: '100%', padding: '16px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <AudioOutlined style={{ fontSize: 36, color: '#1677ff' }} />
                <audio src={fullUrl} controls style={{ width: '100%' }} />
              </div>
            ) : (
              <div style={{ padding: 40, textAlign: 'center' }}>
                <FileOutlined style={{ fontSize: 56, color: hintText }} />
              </div>
            )}
          </div>

          {/* 文件名 */}
          <div style={{ padding: '16px 20px 0', fontSize: 17, fontWeight: 600, color: mainText, wordBreak: 'break-all', lineHeight: 1.4 }}>
            {a.file_name}
          </div>

          {/* 操作按钮区 */}
          <div style={{ padding: '16px 20px 0' }}>
            <div style={{ display: 'flex', gap: 10 }}>
              {a.source === 'user' && (
                <Button
                  type="primary"
                  icon={<EditOutlined />}
                  style={{ flex: 1, borderRadius: 8, height: 38, fontWeight: 500 }}
                  onClick={() => {
                    setEditingAsset(a);
                    editForm.setFieldsValue({ file_name: a.file_name, category: a.category || '图片' });
                    setIsEditModalOpen(true);
                  }}
                >
                  {t('edit')}
                </Button>
              )}
              {reviewEnabled && a.source === 'user' && (a.status === 'uploaded' || (a.status === 'approved' && !a.asset_id)) && (
                <Button
                  icon={<SendOutlined />}
                  style={{ flex: 1, borderRadius: 8, height: 38, fontWeight: 500, background: actionBtnBg, borderColor: actionBtnBorder, color: mainText }}
                  loading={submittingReview === a.id}
                  onClick={() => handleSubmitReview(a.id)}
                >
                  {t('submit_review')}
                </Button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              <Button
                icon={<DownloadOutlined />}
                style={{ flex: 1, borderRadius: 8, height: 38, background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.04)', borderColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.12)', color: tagText }}
                onClick={() => {
                  const link = document.createElement('a');
                  link.href = fullUrl;
                  link.download = a.file_name;
                  link.target = '_blank';
                  link.click();
                }}
              >
                {t('download')}
              </Button>
              <Button
                icon={<DeleteOutlined />}
                danger
                style={{ width: 38, height: 38, borderRadius: 8, flexShrink: 0 }}
                onClick={() => {
                  Modal.confirm({
                    title: t('confirm_delete'),
                    content: t('confirm_delete_asset', { name: a.file_name }),
                    okText: t('delete'),
                    okButtonProps: { danger: true },
                    cancelText: t('cancel'),
                    onOk: async () => {
                      try {
                        await request.delete(`/assets/user/${a.id}`, { headers: { 'x-plugin-ns': pluginNs } });
                        message.success(t('asset_deleted'));
                        setSelectedRecord(null);
                        fetchAssets();
                        fetchStorageInfo();
                      } catch (e) {
                        // 全局拦截器已统一弹出错误提示
                      }
                    }
                  });
                }}
              />
            </div>
          </div>

          {/* 审核状态 */}
          {reviewEnabled && a.source === 'user' && (
            <div style={{ padding: '12px 20px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {(a.status === 'uploaded' || (a.status === 'approved' && !a.asset_id)) ? <Tag color="blue">{t('pending_review')}</Tag> :
                 a.status === 'processing' ? <Tag color="processing" icon={<LoadingOutlined spin />}>{t('reviewing')}</Tag> :
                 a.status === 'approved' ? <Tag color="success" icon={<CheckCircleOutlined />}>{t('approved')}</Tag> :
                 a.status === 'rejected' ? <Tag color="error" icon={<CloseCircleOutlined />}>{t('rejected')}</Tag> :
                 <Tag>{a.status}</Tag>}
              </div>
              {a.status === 'rejected' && a.reject_reason && (
                <div style={{ fontSize: 12, color: '#ff4d4f', marginTop: 6, padding: '6px 10px', background: 'rgba(255,77,79,0.08)', borderRadius: 6 }}>
                  {t('reject_reason')}：{a.reject_reason}
                </div>
              )}
            </div>
          )}

          {/* 基础信息 */}
          <div style={{ padding: '20px 20px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
              <div style={{ width: 3, height: 14, borderRadius: 2, background: '#1677ff' }} />
              <span style={{ fontSize: 14, fontWeight: 600, color: mainText }}>{t('basic_info')}</span>
            </div>
            <div style={{ borderRadius: 10, border: panelBorderStrong, overflow: 'hidden' }}>
              <div style={infoRowStyle}>
                <Text style={{ color: subText, fontSize: 13 }}>{t('asset_id_label')}</Text>
                <Text copyable={a.asset_id ? { text: a.asset_id } : undefined} style={{ color: a.asset_id ? mainText : dimText, fontSize: 13 }}>{a.asset_id || t('not_generated')}</Text>
              </div>
              <div style={infoRowStyle}>
                <Text style={{ color: subText, fontSize: 13 }}>{t('type')}</Text>
                <Text style={{ color: mainText, fontSize: 13 }}>{typeLabel}</Text>
              </div>
              <div style={infoRowStyle}>
                <Text style={{ color: subText, fontSize: 13 }}>{t('size')}</Text>
                <Text style={{ color: mainText, fontSize: 13 }}>{sizeStr}</Text>
              </div>
              {mediaInfo?.width && mediaInfo?.height && (
                <div style={infoRowStyle}>
                  <Text style={{ color: subText, fontSize: 13 }}>{t('resolution')}</Text>
                  <Text style={{ color: mainText, fontSize: 13 }}>{mediaInfo.width} x {mediaInfo.height}</Text>
                </div>
              )}
              {mediaInfo?.duration != null && (
                <div style={infoRowStyle}>
                  <Text style={{ color: subText, fontSize: 13 }}>{t('duration')}</Text>
                  <Text style={{ color: mainText, fontSize: 13 }}>
                    {mediaInfo.duration >= 3600
                      ? `${Math.floor(mediaInfo.duration / 3600)}:${String(Math.floor((mediaInfo.duration % 3600) / 60)).padStart(2, '0')}:${String(Math.floor(mediaInfo.duration % 60)).padStart(2, '0')}`
                      : `${Math.floor(mediaInfo.duration / 60)}:${String(Math.floor(mediaInfo.duration % 60)).padStart(2, '0')}`
                    }
                  </Text>
                </div>
              )}
              <div style={infoRowStyle}>
                <Text style={{ color: subText, fontSize: 13 }}>{t('created_time')}</Text>
                <Text style={{ color: mainText, fontSize: 13 }}>{createdDate}</Text>
              </div>
              <div style={{ ...infoRowStyle, borderBottom: 'none' }}>
                <Text style={{ color: subText, fontSize: 13 }}>{t('modified_time')}</Text>
                <Text style={{ color: mainText, fontSize: 13 }}>{updatedDate}</Text>
              </div>
            </div>
          </div>

          {/* 标签 */}
          <div style={{ padding: '20px 20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
              <div style={{ width: 3, height: 14, borderRadius: 2, background: '#faad14' }} />
              <span style={{ fontSize: 14, fontWeight: 600, color: mainText }}>{t('tags')}</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {tags.map((tag, idx) => (
                <Tag key={idx} style={{
                  borderRadius: 16,
                  padding: '2px 12px',
                  background: idx === 0 ? 'rgba(22,119,255,0.15)' : tagBg,
                  border: idx === 0 ? '1px solid rgba(22,119,255,0.3)' : tagBorder,
                  color: idx === 0 ? '#1677ff' : tagText,
                  fontSize: 13,
                  whiteSpace: 'normal',
                  wordBreak: 'break-all',
                  height: 'auto',
                }}>{tag}</Tag>
              ))}
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div style={{ padding: 0, height: 'calc(100vh - 56px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Card
        title={
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16 }}>
            <Title level={4} style={{ margin: 0 }}>{pluginNs === 'asset_manager_intl' ? '我的资产库' : '我的素材库'}</Title>
            <Spin spinning={storageLoading} size="small">
              {storage && (
                <div className="mobile-scroll-bar" style={{
                  display: 'flex', alignItems: 'center', gap: 12, fontSize: 13,
                  background: 'linear-gradient(90deg, rgba(22,119,255,0.1) 0%, rgba(22,119,255,0.02) 100%)',
                  border: '1px solid rgba(22,119,255,0.2)',
                  borderRadius: 30,
                  padding: '6px 16px',
                  boxShadow: isLight ? '0 4px 16px rgba(0,0,0,0.05)' : '0 4px 16px rgba(0,0,0,0.15), inset 0 1px 1px rgba(255,255,255,0.05)',
                  color: isLight ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.7)',
                }}>
                  <div className="hide-on-mobile" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <CloudOutlined style={{ color: '#1677ff' }} />
                    <span>{t('folder')}: <Text style={{ color: '#1677ff', fontWeight: 600 }}>{storage.folder || t('not_initialized')}</Text></span>
                  </div>

                  <div className="hide-on-mobile" style={{ width: 1, height: 12, background: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)' }} />

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>{t('used')}: <Text style={{ color: progressColor, fontWeight: 600, textShadow: `0 0 10px ${progressColor}40` }}>{usedMB.toFixed(1)} <span style={{ fontSize: 11 }}>MB</span></Text></span>

                    {!isAdmin ? (
                      <div style={{
                        width: 80, height: 6, background: 'rgba(0,0,0,0.3)', borderRadius: 3, overflow: 'hidden', position: 'relative',
                        boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)'
                      }}>
                        <div style={{
                          position: 'absolute', left: 0, top: 0, height: '100%',
                          width: `${usagePercent}%`,
                          background: progressColor === '#52c41a' ? 'linear-gradient(90deg, #13c2c2 0%, #52c41a 100%)' : progressColor,
                          borderRadius: 3,
                          transition: 'width 1s cubic-bezier(0.34, 1.56, 0.64, 1)',
                          boxShadow: `0 0 8px ${progressColor}80`
                        }} />
                      </div>
                    ) : (
                      <Tag color="cyan" bordered={false} style={{ margin: 0, borderRadius: 12 }}>{t('unlimited')}</Tag>
                    )}

                    {!isAdmin && (
                      <span>{t('quota')}: <Text style={{ color: '#52c41a', fontWeight: 600 }}>{quotaMB} <span style={{ fontSize: 11 }}>MB</span></Text></span>
                    )}
                  </div>

                  <div style={{ width: 1, height: 12, background: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)' }} />

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>{t('file_count')}: <Text style={{ color: isLight ? 'rgba(0,0,0,0.9)' : 'rgba(255,255,255,0.9)', fontWeight: 600 }}>{storage.file_count || 0}</Text></span>
                  </div>
                </div>
              )}
            </Spin>
          </div>
        }
        bordered={false}
        style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '16px 24px' } }}
      >
        {/* 异步批量操作进度条 */}
        {batchProgress && (
          <div style={{
            marginBottom: 16,
            padding: '12px 16px',
            background: batchProgress.action === 'delete' 
              ? 'linear-gradient(135deg, rgba(255,77,79,0.08) 0%, rgba(255,77,79,0.02) 100%)'
              : 'linear-gradient(135deg, rgba(22,119,255,0.08) 0%, rgba(22,119,255,0.02) 100%)',
            borderRadius: 10,
            border: batchProgress.action === 'delete'
              ? '1px solid rgba(255,77,79,0.15)'
              : '1px solid rgba(22,119,255,0.15)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {batchProgress.done < batchProgress.total ? (
                  <LoadingOutlined style={{ color: batchProgress.action === 'delete' ? '#ff4d4f' : '#1677ff', fontSize: 16 }} />
                ) : (
                  <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 16 }} />
                )}
                <Text style={{ color: isLight ? '#1f2937' : '#fff', fontSize: 14, fontWeight: 500 }}>
                  {batchProgress.done < batchProgress.total
                    ? t('in_progress', { action: batchProgress.action === 'upload' ? t('uploading') : batchProgress.action === 'submit' ? t('submitting') : t('deleting'), done: batchProgress.done, total: batchProgress.total })
                    : t('completed', { action: batchProgress.action === 'upload' ? t('uploading') : batchProgress.action === 'submit' ? t('submitting') : t('deleting'), done: batchProgress.done, total: batchProgress.total })
                  }
                </Text>
              </div>
              {batchProgress.failed > 0 && (
                <Tag color="red" style={{ margin: 0 }}>{t('n_failed', { count: batchProgress.failed })}</Tag>
              )}
              {batchProgress.done >= batchProgress.total && (
                <Button type="text" size="small" onClick={() => setBatchProgress(null)} style={{ color: isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)' }}>{t('close')}</Button>
              )}
            </div>
            <Progress
              percent={Math.round((batchProgress.done / batchProgress.total) * 100)}
              strokeColor={batchProgress.action === 'delete' ? { from: '#ff4d4f', to: '#ff7875' } : { from: '#1677ff', to: '#52c41a' }}
              trailColor={isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)"}
              size="small"
              status={batchProgress.done < batchProgress.total ? 'active' : batchProgress.failed > 0 ? 'exception' : 'success'}
            />
          </div>
        )}

        <style>
          {`
            .asset-btn-secondary {
              background: linear-gradient(145deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%) !important;
              border: 1px solid rgba(255,255,255,0.15) !important;
              color: #fff !important;
              border-radius: 8px !important;
              backdrop-filter: blur(10px) !important;
              transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
            }
            body[data-theme='light'] .asset-btn-secondary {
              background: #fff !important;
              border: 1px solid #d9d9d9 !important;
              color: rgba(0, 0, 0, 0.85) !important;
              box-shadow: 0 2px 0 rgba(0, 0, 0, 0.02) !important;
            }
            .asset-btn-secondary:hover {
              background: linear-gradient(145deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.05) 100%) !important;
              border-color: rgba(255,255,255,0.3) !important;
              box-shadow: 0 4px 16px rgba(0,0,0,0.4), 0 0 10px rgba(255,255,255,0.05) !important;
              transform: translateY(-1px) !important;
            }
            body[data-theme='light'] .asset-btn-secondary:hover {
              border-color: #1677ff !important;
              color: #1677ff !important;
              box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05) !important;
              background: #fff !important;
            }
            .asset-btn-secondary:active {
              transform: translateY(1px) !important;
            }
            
            .asset-btn-primary {
              background: linear-gradient(135deg, #1677ff 0%, #36cfc9 100%) !important;
              border: none !important;
              color: #fff !important;
              border-radius: 8px !important;
              box-shadow: 0 4px 15px rgba(22, 119, 255, 0.3) !important;
              transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
            }
            .asset-btn-primary:hover {
              background: linear-gradient(135deg, #4096ff 0%, #5cdbd3 100%) !important;
              box-shadow: 0 6px 20px rgba(22, 119, 255, 0.4), 0 0 12px rgba(54, 207, 201, 0.4) !important;
              transform: translateY(-1px) !important;
            }
            .asset-btn-primary:active {
              transform: translateY(1px) !important;
            }

            .assets-layout-container {
              display: flex;
              gap: 24px;
              flex: 1;
              overflow: hidden;
            }
            .assets-left-panel {
              flex: 1;
              min-width: 0;
              display: flex;
              flex-direction: column;
              gap: 16px;
              overflow-y: auto;
              padding-right: 4px;
            }
            @media (max-width: 768px) {
              .assets-layout-container {
                flex-direction: column !important;
                overflow-y: auto !important;
              }
              .assets-left-panel {
                overflow-y: visible !important;
                flex: none !important;
              }
              .assets-right-panel-wrapper {
                width: 100% !important;
                margin-top: 24px;
              }
              .ant-card-body {
                padding: 12px 16px !important;
              }
              .mobile-scroll-bar {
                flex-wrap: nowrap !important;
                overflow-x: auto;
                -webkit-overflow-scrolling: touch;
              }
              .mobile-scroll-bar::-webkit-scrollbar {
                display: none;
              }
              .hide-on-mobile {
                display: none !important;
              }
            }
          `}
        </style>
        <div className="assets-layout-container">
          {/* 左侧为主视图 */}
          <div className="assets-left-panel">
            {/* 上方横向分类导航 */}
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 12, padding: '16px 20px',
              background: tagBg, borderRadius: 8, border: tagBorder
            }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* 一级分类：预设分类 + 我的素材 */}
              <Segmented
                options={[
                  { label: t('my_materials', '我的素材'), value: 'top_my' },
                  ...PRESET_CATEGORIES.map(cat => ({ label: cat.label, value: `top_preset_${cat.key}` }))
                ]}
                value={selectedKey.startsWith('my_') ? 'top_my' : `top_preset_${selectedKey.replace('preset_', '').split('/')[0]}`}
                onChange={(val) => {
                  if (val === 'top_my') {
                    setSelectedKey('my_virtual_portrait');
                  } else {
                    const catKey = (val as string).replace('top_preset_', '');
                    setSelectedKey(`preset_${catKey}`);
                  }
                }}
                size="large"
                style={{ alignSelf: 'flex-start' }}
              />
              
              {/* 二级分类：根据一级分类动态展示 */}
              {(() => {
                if (selectedKey.startsWith('my_')) {
                  // 我的素材的二级分类
                  return (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'center' }}>
                      <Segmented
                        options={MY_ASSET_SUBCATEGORIES.map(sub => ({ label: sub.label, value: sub.key }))}
                        value={selectedKey}
                        onChange={(val) => setSelectedKey(val as string)}
                        style={{ alignSelf: 'flex-start' }}
                      />
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <Dropdown
                          menu={{
                            items: [
                              { key: 'all', label: t('all_types') },
                              { key: 'image', label: t('image') },
                              { key: 'video', label: t('video') },
                              { key: 'audio', label: t('audio') },
                            ],
                            selectable: true,
                            defaultSelectedKeys: ['all'],
                            selectedKeys: [assetFilter],
                            onClick: (e) => setAssetFilter(e.key),
                          }}
                        >
                          <Button className="asset-btn-secondary">
                            <FilterOutlined /> {t('filter', '筛选')}
                          </Button>
                        </Dropdown>
                        
                        <Button 
                          type="primary"
                          className="asset-btn-primary" 
                          icon={<UploadOutlined />}
                          onClick={() => {
                            if (selectedKey === 'my_virtual_portrait' && !currentGroup) {
                              message.warning(t('please_select_folder'));
                              return;
                            }
                            setIsUploadModalOpen(true);
                            setTimeout(() => {
                              uploadForm.setFieldsValue({ category: '虚拟人像' });
                            }, 50);
                          }}
                        >
                          {t('upload_assets', '上传素材')}
                        </Button>

                        {selectedKey === 'my_virtual_portrait' && (
                          <Button className="asset-btn-secondary" icon={<FolderOutlined />} onClick={() => setIsGroupModalOpen(true)}>
                            {t('create_group', '创建素材组合')}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                } else {
                  // 预设素材的二级分类
                  const currentPrimary = selectedKey.replace('preset_', '').split('/')[0];
                  const activeCat = PRESET_CATEGORIES.find(c => c.key === currentPrimary);
                  const currentSecondary = selectedKey.includes('/') ? selectedKey.replace('preset_', '').split('/')[1] : '全部';
                  
                  if (activeCat && activeCat.children.length > 0) {
                    return (
                      <Segmented
                        options={[
                          { label: t('all', '全部'), value: '全部' },
                          ...activeCat.children.map(child => ({ label: child.label, value: child.key }))
                        ]}
                        value={currentSecondary}
                        onChange={(val) => setSelectedKey(val === '全部' ? `preset_${currentPrimary}` : `preset_${currentPrimary}/${val}`)}
                        style={{ alignSelf: 'flex-start' }}
                      />
                    );
                  }
                }
                return null;
              })()}
            </div>
          </div>

            {/* 上方：人物文件夹列表 (如果是人物素材分类) */}
            {selectedKey === 'my_virtual_portrait' && (
              <Spin spinning={loadingGroups}>
                <div style={{ marginBottom: 32 }}>
                  <div style={{ marginBottom: 16 }}>
                    <span style={{ fontSize: 16, fontWeight: 500, color: '#fff' }}>{t('folder_list_title')}</span>
                    <Text style={{ marginLeft: 10, color: hintText, fontSize: 13, wordBreak: 'break-all' }}>
                      （{t('groups_created', { count: groups.length })}
                      {storage?.virtual_portrait_quota !== undefined && (
                        <> / {t('groups_quota', { count: storage.virtual_portrait_quota })}</>
                      )}
                      ）
                    </Text>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(max(150px, calc(16.666% - 10px)), 1fr))', gap: 12 }}>
                    {groups.length === 0 && !loadingGroups && <Text type="secondary" style={{ marginTop: 20 }}>{t('no_folders_hint')}</Text>}
                    {groups.map(g => {
                      const groupAssetsCount = assets.filter(a => a.group_id === g.group_id).length;
                      const isSelected = currentGroup?.id === g.id;
                      return (
                        <div
                          className="asset-folder-card"
                          key={g.id} 
                          onClick={() => {
                            setCurrentGroup(g);
                            setSelectedRecord({ type: 'group', data: g });
                          }}
                          style={{ 
                            width: '100%', 
                            borderRadius: 12, 
                            background: isSelected ? (isLight ? 'rgba(22,119,255,0.1)' : 'rgba(255,255,255,0.1)') : (isLight ? '#fafafa' : '#262626'), 
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            padding: '10px 14px',
                            gap: 12,
                            border: isSelected ? (isLight ? '1px solid #1677ff' : '1px solid rgba(255,255,255,0.15)') : '1px solid transparent',
                            transition: 'all 0.2s ease',
                          }}
                        >
                          <div style={{ width: 44, height: 44, borderRadius: 8, background: isLight ? '#f0f0f0' : '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <FolderFilled style={{ fontSize: 24, color: '#91caff' }} />
                          </div>
                          <div style={{ overflow: 'hidden' }}>
                            <div style={{ color: isLight ? '#1f2937' : '#fff', fontSize: 15, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.name}</div>
                            <div style={{ color: hintText, fontSize: 13, marginTop: 2 }}>{groupAssetsCount} {t('items')}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Spin>
            )}

            {/* 下方：素材列表显示区 */}
            {(selectedKey !== 'my_virtual_portrait' || currentGroup) && (
              <div>
                <div style={{
                  marginBottom: 12,
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ fontSize: 16, fontWeight: 500, color: isLight ? '#1f2937' : '#fff' }}>
                      {currentGroup ? currentGroup.name : currentCategoryName}
                      <Text style={{ marginLeft: 12, color: dimText, fontSize: 13, fontWeight: 'normal' }}>
                        {t('total_items', { count: currentGroup ? assets.filter(a => a.group_id === currentGroup.group_id).length : assets.length })}
                      </Text>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Checkbox
                      checked={(() => {
                        const visibleAssets = (currentGroup ? assets.filter(a => a.group_id === currentGroup.group_id) : assets)
                          .filter(a => {
                            if (assetFilter === 'all') return true;
                            const ext = a.file_name?.split('.').pop()?.toUpperCase() || '';
                            if (assetFilter === 'image') return a.asset_type === 'image' || ['JPG','JPEG','PNG','WEBP','GIF','HEIC'].includes(ext);
                            if (assetFilter === 'video') return a.asset_type === 'video' || ['MP4','MOV','WEBM','AVI','MKV'].includes(ext);
                            if (assetFilter === 'audio') return a.asset_type === 'audio' || ['MP3','WAV','AAC','FLAC','OGG','M4A'].includes(ext);
                            return true;
                          });
                        return visibleAssets.length > 0 && visibleAssets.every(a => selectedAssetIds.has(a.id));
                      })()}
                      indeterminate={(() => {
                        const visibleAssets = (currentGroup ? assets.filter(a => a.group_id === currentGroup.group_id) : assets)
                          .filter(a => {
                            if (assetFilter === 'all') return true;
                            const ext = a.file_name?.split('.').pop()?.toUpperCase() || '';
                            if (assetFilter === 'image') return a.asset_type === 'image' || ['JPG','JPEG','PNG','WEBP','GIF','HEIC'].includes(ext);
                            if (assetFilter === 'video') return a.asset_type === 'video' || ['MP4','MOV','WEBM','AVI','MKV'].includes(ext);
                            if (assetFilter === 'audio') return a.asset_type === 'audio' || ['MP3','WAV','AAC','FLAC','OGG','M4A'].includes(ext);
                            return true;
                          });
                        const selectedCount = visibleAssets.filter(a => selectedAssetIds.has(a.id)).length;
                        return selectedCount > 0 && selectedCount < visibleAssets.length;
                      })()}
                      onChange={(e) => {
                        const visibleAssets = (currentGroup ? assets.filter(a => a.group_id === currentGroup.group_id) : assets)
                          .filter(a => {
                            if (assetFilter === '全部类型') return true;
                            const ext = a.file_name?.split('.').pop()?.toUpperCase() || '';
                            if (assetFilter === 'image') return a.asset_type === 'image' || ['JPG','JPEG','PNG','WEBP','GIF','HEIC'].includes(ext);
                            if (assetFilter === 'video') return a.asset_type === 'video' || ['MP4','MOV','WEBM','AVI','MKV'].includes(ext);
                            if (assetFilter === 'audio') return a.asset_type === 'audio' || ['MP3','WAV','AAC','FLAC','OGG','M4A'].includes(ext);
                            return true;
                          });
                        if (e.target.checked) {
                          const newSet = new Set(selectedAssetIds);
                          visibleAssets.forEach(a => newSet.add(a.id));
                          setSelectedAssetIds(newSet);
                        } else {
                          const newSet = new Set(selectedAssetIds);
                          visibleAssets.forEach(a => newSet.delete(a.id));
                          setSelectedAssetIds(newSet);
                        }
                      }}
                    >
                      <span style={{ color: descText }}>{t('select_all')}</span>
                    </Checkbox>
                    {selectedAssetIds.size > 0 && (
                      <>
                        <Text style={{ color: hintText, fontSize: 13 }}>{t('selected_count', { count: selectedAssetIds.size })}</Text>
                        {reviewEnabled && (
                        <Button
                          type="primary"
                          size="small"
                          icon={<SendOutlined />}
                          loading={batchProgress?.action === 'submit'}
                          onClick={handleBatchSubmitReview}
                          style={{ borderRadius: 6 }}
                        >
                          {t('batch_submit')}
                        </Button>
                        )}
                        <Button
                          danger
                          size="small"
                          icon={<DeleteOutlined />}
                          loading={batchProgress?.action === 'delete'}
                          onClick={handleBatchDelete}
                          style={{ borderRadius: 6 }}
                        >
                          {t('batch_delete')}
                        </Button>
                        <Button
                          type="text"
                          size="small"
                          onClick={() => setSelectedAssetIds(new Set())}
                          style={{ color: hintText }}
                        >
                          {t('cancel_selection')}
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(max(180px, calc(16.666% - 20px)), 1fr))', gap: '24px', minHeight: 200 }}>
                  {loading && assets.length === 0 ? (
                    <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
                      <Spin />
                    </div>
                  ) : null}

                  {(currentGroup ? assets.filter(a => a.group_id === currentGroup.group_id) : assets)
                    .filter(a => {
                      if (assetFilter === 'all') return true;
                      const ext = a.file_name?.split('.').pop()?.toUpperCase() || '';
                      if (assetFilter === 'image') return a.asset_type === 'image' || ['JPG', 'JPEG', 'PNG', 'WEBP', 'GIF', 'HEIC'].includes(ext);
                      if (assetFilter === 'video') return a.asset_type === 'video' || ['MP4', 'MOV', 'WEBM', 'AVI', 'MKV'].includes(ext);
                      if (assetFilter === 'audio') return a.asset_type === 'audio' || ['MP3', 'WAV', 'AAC', 'FLAC', 'OGG', 'M4A'].includes(ext);
                      return true;
                    })
                    .map((asset) => {
                    const isSelected = selectedRecord?.type === 'asset' && selectedRecord.data.id === asset.id;
                    
                    let fullUrl = asset.file_url || '';
                    if (!fullUrl.startsWith('http') && !fullUrl.startsWith('/')) {
                      fullUrl = `https://${fullUrl}`;
                    } else if (fullUrl.startsWith('/')) {
                      fullUrl = `${API_BASE_URL}${fullUrl}`;
                    }

                    const ext = asset.file_name.split('.').pop()?.toUpperCase() || 'FILE';
                    const sizeMB = asset.size ? (asset.size / 1024 / 1024).toFixed(1) + ' MB' : t('unknown');
                    const dateStr = asset.created_at ? new Date(asset.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
                    const isImage = asset.asset_type === 'image' || ['JPG', 'JPEG', 'PNG', 'WEBP', 'GIF', 'HEIC'].includes(ext);
                    
                    const isChecked = selectedAssetIds.has(asset.id);
                    return (
                      <div 
                        key={asset.id}
                        onClick={() => setSelectedRecord({ type: 'asset', data: asset })}
                        style={{
                          position: 'relative',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{
                          width: '100%',
                          aspectRatio: '1/1',
                          borderRadius: 8,
                          background: isLight ? '#f0f0f0' : '#1a1a1a',
                          border: isChecked ? '2px solid #1677ff' : isSelected ? '2px solid #91caff' : '2px solid transparent',
                          overflow: 'hidden',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          position: 'relative',
                          transition: 'all 0.2s ease',
                          padding: isImage ? 0 : 20,
                        }}>
                          {/* 多选勾选框 */}
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              const newSet = new Set(selectedAssetIds);
                              if (newSet.has(asset.id)) {
                                newSet.delete(asset.id);
                              } else {
                                newSet.add(asset.id);
                              }
                              setSelectedAssetIds(newSet);
                            }}
                            style={{
                              position: 'absolute',
                              top: 8,
                              left: 8,
                              zIndex: 10,
                            }}
                          >
                            <Checkbox checked={isChecked} />
                          </div>
                          
                          {/* 待审核标记 */}
                          {(asset.status !== 'approved' || !asset.asset_id) && asset.source === 'user' && (
                            <div style={{
                              position: 'absolute',
                              top: 8,
                              right: 8,
                              zIndex: 10,
                              background: asset.status === 'processing' ? 'rgba(22,119,255,0.8)' : asset.status === 'rejected' ? 'rgba(255,77,79,0.8)' : (isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.2)'),
                              padding: '2px 6px',
                              borderRadius: 4,
                              fontSize: 10,
                              color: '#fff',
                              backdropFilter: 'blur(4px)'
                            }}>
                              {(asset.status === 'uploaded' || (asset.status === 'approved' && !asset.asset_id)) ? t('pending_review') : asset.status === 'processing' ? t('reviewing') : asset.status === 'rejected' ? t('rejected') : asset.status}
                            </div>
                          )}
                          
                          {isImage ? (
                            <img src={fullUrl} alt={asset.file_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: hintText }}>
                              <FileOutlined style={{ fontSize: 48 }} />
                              <div style={{
                                position: 'absolute',
                                bottom: 12,
                                right: 12,
                                background: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.2)',
                                padding: '2px 8px',
                                borderRadius: 4,
                                color: isLight ? '#1f2937' : '#fff',
                                fontSize: 12,
                                fontWeight: 600
                              }}>{ext}</div>
                            </div>
                          )}
                        </div>
                        
                        <div style={{ marginTop: 12 }}>
                          <div style={{
                            color: isLight ? '#1f2937' : '#fff',
                            fontSize: 14,
                            fontWeight: 500,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            marginBottom: 4
                          }}>
                            {asset.file_name}
                          </div>
                          <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            color: subText,
                            fontSize: 12
                          }}>
                            <span>{ext} • {sizeMB}</span>
                            <span>{dateStr}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          
          {/* 右侧详情面板 */}
          {renderRightPanel()}
        </div>
      </Card>

      
      {/* 创建素材组合弹窗 */}
      <Modal
        title={t('create_asset_group')}
        open={isGroupModalOpen}
        onCancel={() => { setIsGroupModalOpen(false); groupForm.resetFields(); }}
        onOk={handleCreateGroup}
        confirmLoading={loadingGroups}
        okText={t('create_btn')}
        cancelText={t('cancel')}
      >
        <Form form={groupForm} layout="vertical">
          <Form.Item label={t('group_name_label')} name="name" rules={[{ required: true, message: t('group_name_required') }]}
            extra={<span style={{ color: dimText, fontSize: 12 }}>{t('group_name_hint')}</span>}
          >
            <Input placeholder={t('group_name_placeholder')} maxLength={64} showCount />
          </Form.Item>
          <Form.Item label={t('description')} name="description" rules={[{ required: true, message: t('description_required') }]}
            extra={<span style={{ color: dimText, fontSize: 12 }}>{t('description_hint')}</span>}
          >
            <Input.TextArea placeholder={t('description_placeholder')} maxLength={300} showCount />
          </Form.Item>
        </Form>
      </Modal>

      {/* 上传人物素材弹窗 */}
      <Modal
        title={t('upload_to_folder')}
        open={isUploadModalOpen}
        onCancel={() => { setIsUploadModalOpen(false); uploadForm.resetFields(); setFileList([]); }}
        onOk={handleCustomUpload}
        confirmLoading={uploading}
        okText={t('start_upload')}
        destroyOnClose
        width={520}
      >
        <Form form={uploadForm} layout="vertical" initialValues={{ category: '虚拟人像' }}>
          <Form.Item label={t('select_file')} required>
            <Upload
              accept=".jpeg,.jpg,.png,.webp,.bmp,.tiff,.gif,.heic,.heif,.mp4,.mov,.webm,.avi,.mkv,.mp3,.wav,.aac,.flac,.ogg,.m4a"
              multiple={true}
              fileList={fileList}
              onChange={(info) => {
                setFileList([...info.fileList]);
              }}
              onRemove={(file) => {
                setFileList((prev) => prev.filter((f) => f.uid !== file.uid));
              }}
              beforeUpload={(file) => {
                const ext = file.name.split('.').pop()?.toLowerCase() || '';
                const sizeMB = file.size / 1024 / 1024;

                const imageExts = ['jpeg', 'jpg', 'png', 'webp', 'bmp', 'tiff', 'gif', 'heic', 'heif'];
                const videoExts = ['mp4', 'mov', 'webm', 'avi', 'mkv'];
                const audioExts = ['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a'];

                if (imageExts.includes(ext)) {
                  if (sizeMB > 30) {
                    message.error(t('img_size_exceed', { name: file.name }));
                    return Upload.LIST_IGNORE;
                  }
                  // 图片尺寸校验
                  return new Promise<boolean | string>((resolve, reject) => {
                    const img = new window.Image();
                    img.onload = () => {
                      const { width, height } = img;
                      URL.revokeObjectURL(img.src);
                      if (width < 300 || width > 6000 || height < 300 || height > 6000) {
                        message.error(t('img_dimension_error', { name: file.name, w: width, h: height }));
                        return reject();
                      }
                      const ratio = width / height;
                      if (ratio <= 0.4 || ratio >= 2.5) {
                        message.error(t('img_ratio_error', { name: file.name, ratio: ratio.toFixed(2) }));
                        return reject();
                      }
                      resolve(false);
                    };
                    img.onerror = () => resolve(false);
                    img.src = URL.createObjectURL(file);
                  }).catch(() => Upload.LIST_IGNORE);
                } else if (videoExts.includes(ext)) {
                  if (sizeMB > 300) {
                    message.error(t('video_size_exceed', { name: file.name }));
                    return Upload.LIST_IGNORE;
                  }
                } else if (audioExts.includes(ext)) {
                  if (sizeMB > 100) {
                    message.error(t('audio_size_exceed', { name: file.name }));
                    return Upload.LIST_IGNORE;
                  }
                } else {
                  message.error(t('unsupported_format', { name: file.name }));
                  return Upload.LIST_IGNORE;
                }
                return false;
              }}
            >
              <Button icon={<UploadOutlined />}>{t('select_files_btn')}</Button>
            </Upload>
            <div style={{ marginTop: 12, color: hintText, fontSize: 12, lineHeight: '20px' }}>
              <div>• {t('upload_hint_image')}</div>
              <div>• {t('upload_hint_video')}</div>
              <div>• {t('upload_hint_audio')}</div>
              <div>• {t('upload_hint_mixed')}{reviewEnabled ? t('upload_hint_review') : ''}</div>
              <div>• {t('upload_hint_filename')}</div>
            </div>
          </Form.Item>
          <Form.Item name="category" hidden>
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      {/* 编辑素材资产组合弹窗 */}
      <Modal
        title={t('edit_asset_group')}
        open={isEditGroupModalOpen}
        onCancel={() => setIsEditGroupModalOpen(false)}
        confirmLoading={savingGroup}
        okText={t('save')}
        cancelText={t('cancel')}
        onOk={async () => {
          try {
            const values = await editGroupForm.validateFields();
            if (!editingGroup) return;
            setSavingGroup(true);
            await request.put(`/assets/user/groups/${editingGroup.group_id}`, {
              name: values.name,
              description: values.description,
            }, { headers: { 'x-plugin-ns': pluginNs } });
            message.success(t('group_update_success'));
            setIsEditGroupModalOpen(false);
            fetchGroups();
            // 更新右侧面板显示
            setSelectedRecord({ type: 'group', data: { ...editingGroup, name: values.name, description: values.description } });
          } catch (error: any) {
            console.error('update failed', error);
          } finally {
            setSavingGroup(false);
          }
        }}
      >
        <Form form={editGroupForm} layout="vertical">
          <Form.Item label={t('group_name_label')} name="name" rules={[{ required: true, message: t('group_name_required') }]}
            extra={<span style={{ color: dimText, fontSize: 12 }}>{t('asset_name_hint')}</span>}
          >
            <Input placeholder={t('group_name_placeholder')} maxLength={64} showCount />
          </Form.Item>
          <Form.Item label={t('description')} name="description" rules={[{ required: true, message: t('description_required') }]}
            extra={<span style={{ color: dimText, fontSize: 12 }}>{t('description_hint')}</span>}
          >
            <Input.TextArea placeholder={t('description_placeholder')} maxLength={300} showCount />
          </Form.Item>
        </Form>
      </Modal>

      {/* 修改素材信息弹窗 */}
      <Modal
        title={t('edit_asset_info')}
        open={isEditModalOpen}
        onCancel={() => setIsEditModalOpen(false)}
        onOk={handleEditAsset}
        confirmLoading={savingEdit}
        okText={t('confirm')}
        cancelText={t('cancel')}
      >
        <Form form={editForm} layout="vertical">
          <Form.Item label={t('asset_name_label')} name="file_name" rules={[{ required: true, message: t('asset_name_required') }]}
            extra={<span style={{ color: dimText, fontSize: 12 }}>{t('asset_name_hint')}</span>}
          >
            <Input placeholder={t('asset_name_placeholder')} maxLength={64} showCount />
          </Form.Item>
          <Form.Item label={t('asset_category_label')} name="category" rules={[{ required: true, message: t('select_category') }]}>
            <Select placeholder={t('select_category')} disabled>
              <Select.Option value="虚拟人像">{t('virtual_portrait')}</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default UserAssets;
