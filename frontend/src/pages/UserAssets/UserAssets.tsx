import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Table, Button, Space, message, Card, Typography, Upload, Tag, Progress, Spin, Menu, Modal, Select, Form, Segmented, Input } from 'antd';
import {
  UploadOutlined, CloudOutlined, FolderOutlined, FileOutlined,
  PictureOutlined, VideoCameraOutlined, UserOutlined, AppstoreOutlined,
  StarOutlined, InboxOutlined, AudioOutlined, UserAddOutlined, EditOutlined,
  SendOutlined, LoadingOutlined, CheckCircleOutlined, CloseCircleOutlined
} from '@ant-design/icons';
import request from '../../utils/request';
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
}

// 我的素材固定二级分类
const MY_ASSET_SUBCATEGORIES = [
  { key: 'my_virtual_portrait', label: '虚拟人像', icon: <UserOutlined />, filter: { category: '虚拟人像' } },
  { key: 'my_real_portrait', label: '真人人像', icon: <UserAddOutlined />, filter: { category: '真人人像' } },
];

const UserAssets: React.FC = () => {
  const [assets, setAssets] = useState<PluginAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [storageLoading, setStorageLoading] = useState(false);

  // 分类状态
  const PRESET_CATEGORIES = [
    { key: '模版库', label: '模版库', children: ['参考生成', '视频编辑', '时序补全'] },
    { key: '素材库', label: '素材库', children: ['视频', '图片', '音频'] },
    { key: '虚拟人像库', label: '虚拟人像库', children: [] }
  ];
  const [selectedKey, setSelectedKey] = useState<string>('my_virtual_portrait'); // 默认选中我的素材

  // 上传弹窗
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadForm] = Form.useForm();
  const [fileList, setFileList] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);

  // 组状态
  const [groups, setGroups] = useState<AssetGroup[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [currentGroup, setCurrentGroup] = useState<AssetGroup | null>(null);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [groupForm] = Form.useForm();

  const fetchGroups = useCallback(async () => {
    try {
      setLoadingGroups(true);
      const res = await (request.get('/assets/user/groups') as any);
      if (res.groups) setGroups(res.groups);
    } catch (e) {
      console.error(e);
      message.error('获取文件夹列表失败');
    } finally {
      setLoadingGroups(false);
    }
  }, []);

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
      });
      message.success('素材更新成功');
      setIsEditModalOpen(false);
      fetchAssets();
    } catch (error) {
      console.error('更新素材失败', error);
      message.error('更新素材失败');
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
      const res = await (request.get(url) as any);
      if (res.assets) {
        setAssets(res.assets);
      }
    } catch (error) {
      console.error(error);
      message.error('获取素材列表失败');
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
          const res = await (request.get(`/assets/user/asset-status/${asset.id}`) as any);
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
      const res = await (request.get('/assets/user/storage-info') as any);
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
    fetchStorageInfo();
  }, []);

  // 当 selectedKey 改变时重新获取素材
  useEffect(() => {
    if (selectedKey) {
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
      }) as any;

      if (res.h5_link) {
        // 保存 token 到 session 供回来后查看
        sessionStorage.setItem('pending_byted_token', res.byted_token);
        window.location.href = res.h5_link;
      }
    } catch (error) {
      console.error(error);
      message.error('发起认证失败');
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
          message.loading({ content: '正在完成认证...', key: 'verify' });
          await request.post('/assets/user/complete-real-person-verify', { byted_token: token });
          message.success({ content: '真人认证成功', key: 'verify' });
          fetchAssets();
        } catch (error) {
          message.error({ content: '认证同步失败', key: 'verify' });
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
      await request.post('/assets/user/groups', vals);
      message.success('创建组合成功');
      setIsGroupModalOpen(false);
      groupForm.resetFields();
      fetchGroups();
      fetchStorageInfo();
    } catch (error: any) {
      const msg = error?.response?.data?.error?.message || '创建失败';
      if (!error?.errorFields) message.error(msg); // Only show message if it's not a validation error
    } finally {
      setLoadingGroups(false);
    }
  };

  const handleCustomUpload = async () => {
    try {
      const values = await uploadForm.validateFields();
      if (fileList.length === 0) {
        message.warning('请选择要上传的文件');
        return;
      }

      setUploading(true);
      const category = values.category || '未分类';
      const api = category === '虚拟人像' ? '/assets/user/upload-virtual-portrait' : '/assets/upload';

      const uploadPromises = fileList.map(async (fileItem) => {
        const formData = new FormData();
        formData.append('file', fileItem.originFileObj as any);
        formData.append('category', category);
        if (category === '虚拟人像' && currentGroup) { formData.append('group_id', currentGroup.group_id); }
        return request.post(api, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      });

      await Promise.all(uploadPromises);

      message.success('上传成功，请点击「提交审核」');
      setIsUploadModalOpen(false);
      uploadForm.resetFields();
      setFileList([]);
      // 切换到虚拟人像分类查看结果
      setSelectedKey('my_virtual_portrait');
      fetchAssets();
      fetchStorageInfo();
    } catch (error) {
      console.error(error);
      message.error('上传失败');
    } finally {
      setUploading(false);
    }
  };

  // 提交审核
  const handleSubmitReview = async (assetId: number) => {
    try {
      setSubmittingReview(assetId);
      await request.post(`/assets/user/submit-review/${assetId}`, {});
      message.success('已提交审核，请等待审核结果');
      fetchAssets();
    } catch (error: any) {
      const rawMsg = error?.response?.data?.error?.message || '';
      message.error(rawMsg || '提交审核失败');
    } finally {
      setSubmittingReview(null);
    }
  };

  // 存储空间计算
  const usedMB = storage ? parseFloat(storage.total_size_mb) : 0;
  const quotaMB = storage?.quota_mb ?? 100;
  const isAdmin = storage?.is_admin ?? false;
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
      return sub ? sub.label : '未知';
    }
    return '未知';
  }, [selectedKey]);

  const columns = [
    {
      title: '预览',
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
      render: (aid: string) => aid ? <Text code copyable>{aid}</Text> : <Text type="secondary">暂无</Text>
    },
    {
      title: '类型',
      key: 'asset_type',
      render: (_: any, record: PluginAsset) => (
        <Tag color={record.asset_type === 'image' ? 'blue' : 'purple'}>
          {record.asset_type === 'image' ? '图片' : '视频'}
        </Tag>
      )
    },
    {
      title: '分类',
      dataIndex: 'category',
      key: 'category',
      render: (cat: string) => <Tag color="cyan">{cat || '未分类'}</Tag>
    },
    {
      title: '大小',
      key: 'size',
      render: (_: any, record: PluginAsset) => {
        if (!record.size) return <Text type="secondary">-</Text>;
        if (record.size < 1024) return `${record.size} B`;
        if (record.size < 1024 * 1024) return `${(record.size / 1024).toFixed(1)} KB`;
        return `${(record.size / 1024 / 1024).toFixed(2)} MB`;
      }
    },
    {
      title: '审核状态',
      key: 'status',
      render: (_: any, record: PluginAsset) => {
        if (record.source === 'builtin') return <Tag color="gold">预设</Tag>;
        if (record.status === 'uploaded') return <Tag color="blue" icon={<SendOutlined />}>待提交审核</Tag>;
        if (record.status === 'processing') return <Tag color="processing" icon={<LoadingOutlined spin />}>审核中</Tag>;
        if (record.status === 'approved') return <Tag color="success" icon={<CheckCircleOutlined />}>已通过</Tag>;
        if (record.status === 'rejected') return (
          <>
            <Tag color="error" icon={<CloseCircleOutlined />}>已驳回</Tag>
            <div style={{ fontSize: '12px', color: '#ff4d4f', marginTop: 4 }}>
              原因: {record.reject_reason || '无'}
            </div>
          </>
        );
        if (record.status === 'pending') return <Tag color="warning">审核中</Tag>;
        return <Tag>{record.status}</Tag>;
      }
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: PluginAsset) => (
        <Space size="middle">
          {record.source === 'user' && record.status === 'uploaded' && (
            <Button
              type="primary"
              size="small"
              icon={<SendOutlined />}
              loading={submittingReview === record.id}
              onClick={() => handleSubmitReview(record.id)}
            >
              提交审核
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

  return (
    <div style={{ padding: '16px 24px' }}>
      <Card
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Title level={4} style={{ margin: 0 }}>我的资产库</Title>
            <Spin spinning={storageLoading} size="small">
              {storage && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12, fontSize: 13,
                  background: 'linear-gradient(90deg, rgba(22,119,255,0.1) 0%, rgba(22,119,255,0.02) 100%)',
                  border: '1px solid rgba(22,119,255,0.2)',
                  borderRadius: 30,
                  padding: '6px 16px',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.15), inset 0 1px 1px rgba(255,255,255,0.05)',
                  color: 'rgba(255,255,255,0.7)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <CloudOutlined style={{ color: '#1677ff' }} />
                    <span>文件夹: <Text style={{ color: '#1677ff', fontWeight: 600 }}>{storage.folder || '未初始化'}</Text></span>
                  </div>

                  <div style={{ width: 1, height: 12, background: 'rgba(255,255,255,0.15)' }} />

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>已用空间: <Text style={{ color: progressColor, fontWeight: 600, textShadow: `0 0 10px ${progressColor}40` }}>{usedMB.toFixed(1)} <span style={{ fontSize: 11 }}>MB</span></Text></span>

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
                      <Tag color="cyan" bordered={false} style={{ margin: 0, borderRadius: 12 }}>∞ 无限</Tag>
                    )}

                    {!isAdmin && (
                      <span>限额: <Text style={{ color: '#52c41a', fontWeight: 600 }}>{quotaMB} <span style={{ fontSize: 11 }}>MB</span></Text></span>
                    )}
                  </div>

                  <div style={{ width: 1, height: 12, background: 'rgba(255,255,255,0.15)' }} />

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>文件数量: <Text style={{ color: 'rgba(255,255,255,0.9)', fontWeight: 600 }}>{storage.file_count || 0}</Text></span>
                  </div>
                </div>
              )}
            </Spin>
          </div>
        }
        bordered={false}
      >
        {/* 分类导航 + 素材列表 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 上方横向分类导航 */}
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 12, padding: '16px 20px',
            background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)'
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* 一级分类：预设分类 + 我的素材 */}
              <Segmented
                options={[
                  { label: '我的素材', value: 'top_my' },
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Segmented
                        options={MY_ASSET_SUBCATEGORIES.map(sub => ({ label: sub.label, value: sub.key }))}
                        value={selectedKey}
                        onChange={(val) => setSelectedKey(val as string)}
                        style={{ alignSelf: 'flex-start' }}
                      />
                      {selectedKey === 'my_real_portrait' && (
                        <Button
                          icon={<UserAddOutlined />}
                          type="primary"
                          onClick={handleRealPortraitVerify}
                          loading={loading}
                        >
                          上传真人人像
                        </Button>
                      )}
                      {selectedKey === 'my_virtual_portrait' && (
                        <Button
                          icon={<FolderOutlined />}
                          type="primary"
                          onClick={() => setIsGroupModalOpen(true)}
                        >
                          新建人物文件夹
                        </Button>
                      )}
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
                          { label: '全部', value: '全部' },
                          ...activeCat.children.map(child => ({ label: child, value: child }))
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

          {/* 下方素材列表 */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {selectedKey === 'my_virtual_portrait' && !currentGroup ? (
              <Spin spinning={loadingGroups}>
                <div style={{
                  marginBottom: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                  <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13 }}>
                    <Text strong style={{ color: '#1677ff' }}>人物文件夹列表</Text>
                    <Text style={{ marginLeft: 12, color: 'rgba(255,255,255,0.35)' }}>
                      （您有 {groups.length} 个人物组合文件夹）
                    </Text>
                    {storage?.virtual_portrait_quota !== undefined && (
                      <Text style={{ marginLeft: 12, color: 'rgba(255,255,255,0.45)' }}>
                        (还可以新加 {Math.max(0, storage.virtual_portrait_quota - groups.length)} 个组合)
                      </Text>
                    )}
                  </Text>
               </div>
               <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                 {groups.length === 0 && !loadingGroups && <Text type="secondary" style={{ marginTop: 20 }}>暂无人物文件夹，请先新建人物文件夹。</Text>}
                 {groups.map(g => (
                   <Card key={g.id} hoverable style={{ width: 220, borderRadius: 12, border: '1px solid #303030' }} onClick={() => setCurrentGroup(g)} bodyStyle={{ padding: 16 }}>
                     <div style={{ display: 'flex', gap: 12 }}>
                       <FolderOutlined style={{ fontSize: 40, color: '#1677ff', flexShrink: 0 }} />
                       <div style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                         <Text strong style={{ fontSize: 16 }} ellipsis={{ tooltip: g.name }}>{g.name}</Text>
                         {g.description && <Text type="secondary" style={{ fontSize: 12 }} ellipsis={{ tooltip: g.description }}>{g.description}</Text>}
                       </div>
                     </div>
                   </Card>
                 ))}
               </div>
              </Spin>
            ) : (
              // 以下为原素材列表的渲染
              <>
                <div style={{
                  marginBottom: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    {currentGroup && (
                      <Button style={{ marginRight: 8 }} onClick={() => setCurrentGroup(null)}>返回主列表</Button>
                    )}
                    <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13 }}>
                      当前分类：<Text strong style={{ color: '#1677ff' }}>
                        {currentGroup ? `虚拟人像 / ${currentGroup.name}` : currentCategoryName}
                      </Text>
                      <Text style={{ marginLeft: 12, color: 'rgba(255,255,255,0.35)' }}>
                        共 {currentGroup ? assets.filter(a => a.group_id === currentGroup.group_id).length : assets.length} 个素材
                      </Text>
                      {!currentGroup && currentCategoryName === '虚拟人像' && storage?.virtual_portrait_quota !== undefined && (
                        <Text style={{ marginLeft: 12, color: 'rgba(255,255,255,0.45)' }}>
                          (可以新加 {Math.max(0, storage.virtual_portrait_quota - (storage?.virtual_portrait_count || 0))} 个 AssetGroups 的素材组合)
                        </Text>
                      )}
                    </Text>
                  </div>
                  {currentGroup && (
                    <Button
                      icon={<UploadOutlined />}
                      type="primary"
                      onClick={() => {
                        setIsUploadModalOpen(true);
                        setTimeout(() => {
                          uploadForm.setFieldsValue({ category: '虚拟人像' });
                        }, 50);
                      }}
                    >
                      上传此人物的资产
                    </Button>
                  )}
                </div>

                <Table
                  dataSource={currentGroup ? assets.filter(a => a.group_id === currentGroup.group_id) : assets}
                  columns={columns}
                  rowKey="id"
                  loading={loading}
                  pagination={{ pageSize: 10 }}
                  size="middle"
                />
              </>
            )}
          </div>
</div>
      </Card>

      
      {/* 新建人物文件夹弹窗 */}
      <Modal
        title="新建人物文件夹"
        open={isGroupModalOpen}
        onCancel={() => { setIsGroupModalOpen(false); groupForm.resetFields(); }}
        onOk={handleCreateGroup}
        confirmLoading={loadingGroups}
        okText="创建"
      >
        <Form form={groupForm} layout="vertical">
          <Form.Item label="人物名称" name="name" rules={[{ required: true, message: '请填写人物名称' }]}>
            <Input placeholder="输入该人物的称呼或名字..." />
          </Form.Item>
          <Form.Item label="描述" name="description">
            <Input.TextArea placeholder="这会在方舟平台记录为对该虚拟人像素材组合的简短说明..." />
          </Form.Item>
        </Form>
      </Modal>

      {/* 上传虚拟人像弹窗 */}
      <Modal
        title="上传虚拟人像"
        open={isUploadModalOpen}
        onCancel={() => { setIsUploadModalOpen(false); uploadForm.resetFields(); setFileList([]); }}
        onOk={handleCustomUpload}
        confirmLoading={uploading}
        okText="开始上传"
        destroyOnClose
      >
        <Form form={uploadForm} layout="vertical" initialValues={{ category: '虚拟人像' }}>
          <Form.Item label="选择文件" required>
            <Upload
              accept=".jpeg,.jpg,.png,.webp,.bmp,.tiff,.gif,.heic,.heif"
              multiple={true}
              fileList={fileList}
              onChange={(info) => {
                setFileList([...info.fileList]);
              }}
              beforeUpload={(file) => {
                const ext = file.name.split('.').pop()?.toLowerCase() || '';
                const allowedExts = ['jpeg', 'jpg', 'png', 'webp', 'bmp', 'tiff', 'gif', 'heic', 'heif'];
                if (!allowedExts.includes(ext)) {
                  import('antd').then(({ message }) => message.error(`${file.name}: 不支持的图片格式`));
                  return Upload.LIST_IGNORE;
                }
                const sizeMB = file.size / 1024 / 1024;
                if (sizeMB > 30) {
                  import('antd').then(({ message }) => message.error(`${file.name}: 单张图片不能超过 30MB`));
                  return Upload.LIST_IGNORE;
                }

                return new Promise<boolean | string>((resolve, reject) => {
                  const img = new window.Image();
                  img.onload = () => {
                    const { width, height } = img;
                    URL.revokeObjectURL(img.src);
                    if (width < 300 || width > 6000 || height < 300 || height > 6000) {
                      import('antd').then(({ message }) => message.error(`${file.name}: 宽高长度需在 300-6000 px 之间，当前 ${width}x${height}`));
                      return reject();
                    }
                    const ratio = width / height;
                    if (ratio <= 0.4 || ratio >= 2.5) {
                      import('antd').then(({ message }) => message.error(`${file.name}: 宽高比（宽/高）需在 (0.4, 2.5) 之间，当前 ${ratio.toFixed(2)}`));
                      return reject();
                    }
                    resolve(false); // Stop Action
                  };
                  img.onerror = () => {
                    // For HEIC and formats not natively previewable in all browsers, we skip local dimension validation
                    resolve(false);
                  };
                  img.src = URL.createObjectURL(file);
                }).catch(() => Upload.LIST_IGNORE);
              }}
            >
              <Button icon={<UploadOutlined />}>选择多张图片</Button>
            </Upload>
            <div style={{ marginTop: 12, color: 'rgba(255,255,255,0.45)', fontSize: 12, lineHeight: '20px' }}>
              <div>• 格式：jpeg、png、webp、bmp、tiff、gif、heic/heif</div>
              <div>• 宽高比（宽/高）：(0.4, 2.5)</div>
              <div>• 宽高长度（px）：(300, 6000)</div>
              <div>• 大小：单张图片小于 30 MB</div>
            </div>
          </Form.Item>
          <Form.Item name="category" hidden>
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      {/* 修改素材信息弹窗 */}
      <Modal
        title="修改素材信息"
        open={isEditModalOpen}
        onCancel={() => setIsEditModalOpen(false)}
        onOk={handleEditAsset}
        confirmLoading={savingEdit}
      >
        <Form form={editForm} layout="vertical">
          <Form.Item label="素材名称" name="file_name" rules={[{ required: true, message: '请输入素材名称' }]}>
            <Input placeholder="输入新的素材名称" />
          </Form.Item>
          <Form.Item label="素材分类" name="category" rules={[{ required: true, message: '请选择分类' }]}>
            <Select placeholder="请选择分类">
              <Select.Option value="真人人像">真人人像</Select.Option>
              <Select.Option value="虚拟人像">虚拟人像</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default UserAssets;
