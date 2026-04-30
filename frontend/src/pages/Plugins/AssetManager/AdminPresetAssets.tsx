import React, { useState, useEffect } from 'react';
import { Table, Button, Space, message, Typography, Upload, Popconfirm, Tag, Modal, Input, Form, Select, Tooltip, Segmented } from 'antd';
import { UploadOutlined, EditOutlined, DeleteOutlined, ArrowUpOutlined, ArrowDownOutlined, CloudOutlined } from '@ant-design/icons';
import request from '../../../utils/request';
import { useThemeStore } from '../../../store/theme';
import type { PluginAsset } from '../../../types';

const { Text } = Typography;

const AdminPresetAssets: React.FC = () => {
  const { themeMode } = useThemeStore();
  const _isLight = themeMode === 'light';
  const [assets, setAssets] = useState<PluginAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<PluginAsset | null>(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [reordering, setReordering] = useState(false);

  // New Upload Modal state
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadForm] = Form.useForm();
  const [fileList, setFileList] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [adminStorage, setAdminStorage] = useState<{ used_bytes: number; used_mb: string; folder: string; file_count?: number } | null>(null);

  const PRESET_CATEGORIES = [
    { key: '模版库', label: '模版库', children: ['参考生成', '视频编辑', '时序补全'] },
    { key: '素材库', label: '素材库', children: ['视频', '图片', '音频'] },
    { key: '虚拟人像库', label: '虚拟人像库', children: [] }
  ];
  const [selectedKey, setSelectedKey] = useState<string>('preset_模版库');

  useEffect(() => {
    fetchAssets();
  }, [selectedKey]);

  const fetchAssets = async () => {
    try {
      setLoading(true);
      let url = '/assets/admin/list?source=builtin';
      if (selectedKey !== 'preset_全部') {
        const cat = selectedKey.replace('preset_', '');
        url += `&category=${encodeURIComponent(cat)}`;
      }
      const res = await (request.get(url) as any);
      if (res.assets) {
        setAssets(res.assets);
      }
      if (res.admin_storage) {
        setAdminStorage(res.admin_storage);
      }
    } catch (error) {
      console.error(error);
      message.error('获取预设素材列表失败');
    } finally {
      setLoading(false);
    }
  };

  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  const handleEdit = async (record: PluginAsset) => {
    setEditingAsset(record);
    setIsEditModalOpen(true);
    form.setFieldsValue({
      file_name: record.file_name || '',
      category: record.category || '图片',
      userid: record.user_id || '',
      assetid: record.asset_id || '' });
    
    // Optionally fetch live tags from TOS
    try {
      const res = await (request.get(`/assets/admin/${record.id}/tags`) as any);
      if (res.tags) {
        form.setFieldsValue({
          category: res.tags.category || record.category || '图片',
          userid: res.tags.userid || record.user_id || '',
          assetid: res.tags.assetid || record.asset_id || '' });
      }
    } catch (e) {
      console.error('Failed to fetch tags', e);
    }
  };

  const handleSaveEdit = async () => {
    try {
      const values = await form.validateFields();
      if (!editingAsset) return;
      setSaving(true);
      
      await request.put(`/assets/admin/${editingAsset.id}/tags`, {
        file_name: values.file_name,
        category: values.category,
        userid: (!values.userid || values.userid === '000000') ? '' : values.userid,
        assetid: values.assetid });
      message.success('标签更新成功');
      setIsEditModalOpen(false);
      fetchAssets();
    } catch (error) {
      console.error(error);
      message.error('标签更新失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (record: PluginAsset) => {
    try {
      const res = await request.post(`/assets/admin/delete/${record.id}`) as any;
      if (res?.tos_deleted) {
        message.success(res.message || '素材已删除（数据库 + TOS 文件）');
      } else {
        message.warning(res.message || '数据库记录已删除，但 TOS 文件未能删除');
      }
      fetchAssets();
    } catch (error) {
      console.error(error);
      message.error('删除失败');
    }
  };

  const handleMoveUp = async (index: number) => {
    if (index === 0) return;
    const newAssets = [...assets];
    [newAssets[index - 1], newAssets[index]] = [newAssets[index], newAssets[index - 1]];
    setAssets(newAssets);
    await saveOrder(newAssets);
  };

  const handleMoveDown = async (index: number) => {
    if (index === assets.length - 1) return;
    const newAssets = [...assets];
    [newAssets[index], newAssets[index + 1]] = [newAssets[index + 1], newAssets[index]];
    setAssets(newAssets);
    await saveOrder(newAssets);
  };

  const saveOrder = async (orderedAssets: PluginAsset[]) => {
    try {
      setReordering(true);
      await request.post('/assets/admin/reorder', {
        ids: orderedAssets.map((a) => a.id) });
      message.success('排序已保存');
    } catch (error) {
      console.error(error);
      message.error('排序保存失败');
      // 恢复原始顺序
      fetchAssets();
    } finally {
      setReordering(false);
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
      const formData = new FormData();
      formData.append('file', fileList[0].originFileObj as any);
      formData.append('category', values.category || '图片');
      formData.append('target_user_id', (!values.target_user_id || values.target_user_id === '000000') ? '' : values.target_user_id);
      formData.append('target_asset_id', values.target_asset_id || '00000');
      formData.append('remark', values.remark || '');

      await request.post('/assets/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data' } });

      message.success('预设素材上传成功');
      setIsUploadModalOpen(false);
      uploadForm.resetFields();
      setFileList([]);
      fetchAssets();
    } catch (error) {
      console.error(error);
      message.error('上传失败');
    } finally {
      setUploading(false);
    }
  };

  const columns = [
    {
      title: '排序',
      key: 'sort',
      width: 80,
      render: (_: any, record: PluginAsset, index: number) => (
        <Space size={2}>
          <Tooltip title="上移">
            <Button
              type="text"
              size="small"
              icon={<ArrowUpOutlined />}
              disabled={index === 0 || reordering}
              onClick={() => handleMoveUp(index)}
            />
          </Tooltip>
          <Tooltip title="下移">
            <Button
              type="text"
              size="small"
              icon={<ArrowDownOutlined />}
              disabled={index === assets.length - 1 || reordering}
              onClick={() => handleMoveDown(index)}
            />
          </Tooltip>
        </Space>
      )
    },
    {
      title: '预览',
      key: 'preview',
      render: (_: any, record: PluginAsset) => {
        let fullUrl = record.file_url;
        if (!fullUrl.startsWith('http') && !fullUrl.startsWith('/')) {
          fullUrl = `https://${fullUrl}`;
        } else if (fullUrl.startsWith('/')) {
          fullUrl = `${API_BASE_URL}${fullUrl}`;
        }

        if (record.asset_type === 'image') {
          return <img src={fullUrl} alt={record.file_name} style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 4 }} />;
        } else {
          return <video src={fullUrl} style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 4 }} muted />;
        }
      }
    },
    {
      title: '文件名',
      dataIndex: 'file_name',
      key: 'file_name' },
    {
      title: '分类 (Category)',
      dataIndex: 'category',
      key: 'category',
      render: (cat: string) => <Tag color="blue">{cat ? cat.replace('/', ' · ') : '未分类'}</Tag>
    },
    {
      title: '所属用户 (UserID)',
      dataIndex: 'user_id',
      key: 'user_id',
      render: (uid: string) => {
        let currentUserId = '';
        try {
          const token = localStorage.getItem('token');
          if (token) {
            currentUserId = JSON.parse(atob(token.split('.')[1])).sub;
          }
        } catch (e) {}
        
        if (uid && uid === currentUserId) {
          return <Tag color="green">全部可用 (公共)</Tag>;
        }
        return uid ? <Text code>{uid}</Text> : <Text type="secondary">N/A</Text>;
      }
    },
    {
      title: '素材 ID (AssetID)',
      dataIndex: 'asset_id',
      key: 'asset_id',
      render: (aid: string) => aid ? <Text code copyable>{aid}</Text> : <Text type="secondary">N/A</Text>
    },
    {
      title: '大小',
      key: 'size',
      render: (_: any, record: PluginAsset) => {
        if (!record.size) return '未知';
        return `${(record.size / 1024 / 1024).toFixed(2)} MB`;
      }
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: PluginAsset) => (
        <Space size="small">
          <Tooltip title="编辑标签">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleEdit(record)}
            />
          </Tooltip>
          <Popconfirm
            title="确定要删除该素材吗？"
            description="将同时尝试删除 TOS 上的文件"
            onConfirm={() => handleDelete(record)}
            okText="确定删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Tooltip title="删除">
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      ) },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <Text strong style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 14 }}>预设素材管理</Text><br />
          <Text style={{ color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)', fontSize: 13 }}>您可以上传系统级预设素材，为其指定专属用户及分类，此信息同时写入对象存储(TOS)标签。点击 ↑↓ 按钮可调整排列顺序。</Text>
          {adminStorage && (
            <div style={{
              marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 12, fontSize: 13,
              background: 'linear-gradient(90deg, rgba(22,119,255,0.1) 0%, rgba(22,119,255,0.02) 100%)',
              border: '1px solid rgba(22,119,255,0.2)',
              borderRadius: 30,
              padding: '6px 16px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.15), inset 0 1px 1px rgba(255,255,255,0.05)',
              color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.7)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <CloudOutlined style={{ color: '#1677ff' }} />
                <span>文件夹: <Text style={{ color: '#1677ff', fontWeight: 600 }}>{adminStorage.folder || '未初始化'}</Text></span>
              </div>

              <div style={{ width: 1, height: 12, background: _isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)' }} />

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>已用空间: <Text style={{ color: '#1677ff', fontWeight: 600, textShadow: '0 0 10px rgba(22,119,255,0.4)' }}>{adminStorage.used_mb} <span style={{ fontSize: 11 }}>MB</span></Text></span>

                <div style={{
                  width: 80, height: 6, background: 'rgba(0,0,0,0.3)', borderRadius: 3, overflow: 'hidden', position: 'relative',
                  boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)'
                }}>
                  <div style={{
                    position: 'absolute', left: 0, top: 0, height: '100%',
                    width: '100%',
                    background: 'linear-gradient(90deg, #13c2c2 0%, #1677ff 100%)',
                    borderRadius: 3,
                    animation: 'pulse 2s infinite ease-in-out',
                    boxShadow: '0 0 8px rgba(22,119,255,0.8)'
                  }} />
                </div>
                
                <span>限额: <Text style={{ color: '#52c41a', fontWeight: 600 }}>无限制</Text></span>
              </div>

              <div style={{ width: 1, height: 12, background: _isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)' }} />

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>文件数量: <Text style={{ color: _isLight ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.9)', fontWeight: 600 }}>{adminStorage.file_count || 0}</Text></span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Segmented
            options={PRESET_CATEGORIES.map(cat => ({ label: cat.label, value: cat.key }))}
            value={selectedKey.replace('preset_', '').split('/')[0]}
            onChange={(val) => setSelectedKey(`preset_${val}`)}
          />
          <Button 
            icon={<UploadOutlined />} 
            type="primary" 
            onClick={() => {
              setIsUploadModalOpen(true);
              setTimeout(() => {
                const currentPrimary = selectedKey.replace('preset_', '').split('/')[0];
                const activeCat = PRESET_CATEGORIES.find(c => c.key === currentPrimary);
                if (activeCat && activeCat.children.length > 0) {
                  uploadForm.setFieldsValue({ category: `${currentPrimary}/${activeCat.children[0]}` });
                } else {
                  uploadForm.setFieldsValue({ category: currentPrimary });
                }
              }, 50);
            }}
          >
            {selectedKey.replace('preset_', '').split('/')[0] === '模版库' ? '上传模版' : 
             selectedKey.replace('preset_', '').split('/')[0] === '素材库' ? '上传素材' : '上传虚拟人像'}
          </Button>
        </div>
        
        {(() => {
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
          return null;
        })()}
      </div>

      <Table
        dataSource={assets}
        columns={columns}
        rowKey="id"
        loading={loading || reordering}
        pagination={{ pageSize: 10 }}
        size="middle"
      />

      <Modal
        title="编辑素材 TOS 管理标签"
        open={isEditModalOpen}
        onCancel={() => setIsEditModalOpen(false)}
        onOk={handleSaveEdit}
        confirmLoading={saving}
        okText="保存(写TOS)"
      >
        <Form form={form} layout="vertical">
          <Form.Item label="文件名" name="file_name" rules={[{ required: true, message: '请输入文件名' }]}>
            <Input placeholder="输入新的显示名称" />
          </Form.Item>
          <Form.Item label="分类 (Category)" name="category" rules={[{ required: true, message: '请选择分类' }]}>
            <Select placeholder="请选择预设分类">
              <Select.OptGroup label="模版库">
                <Select.Option value="模版库/参考生成">参考生成</Select.Option>
                <Select.Option value="模版库/视频编辑">视频编辑</Select.Option>
                <Select.Option value="模版库/时序补全">时序补全</Select.Option>
              </Select.OptGroup>
              <Select.OptGroup label="素材库">
                <Select.Option value="素材库/视频">视频</Select.Option>
                <Select.Option value="素材库/图片">图片</Select.Option>
                <Select.Option value="素材库/音频">音频</Select.Option>
              </Select.OptGroup>
              <Select.Option value="虚拟人像库">虚拟人像库</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item label="归属用户 (User ID) (非必填)" name="userid" extra="如果不填，默认分配为 000000 (所有人可用)">
            <Input placeholder="输入特定的前台 User ID，留空表示公开 (000000)" />
          </Form.Item>
          {editingAsset && (
             <Form.Item label="素材 ID (Asset ID)" name="assetid" extra="如果不填，默认分配为 00000">
               <Input placeholder="输入自定义素材 ID，留空默认为 00000" />
             </Form.Item>
          )}
        </Form>
      </Modal>

      <Modal
        title={selectedKey.replace('preset_', '').split('/')[0] === '模版库' ? '上传模版' : 
               selectedKey.replace('preset_', '').split('/')[0] === '素材库' ? '上传素材' : '上传虚拟人像'}
        open={isUploadModalOpen}
        onCancel={() => { setIsUploadModalOpen(false); uploadForm.resetFields(); setFileList([]); }}
        onOk={handleCustomUpload}
        confirmLoading={uploading}
        okText="开始上传"
        destroyOnClose
      >
        <Form form={uploadForm} layout="vertical">
          <Form.Item label="选择文件" required>
            <Upload 
              accept="image/*,video/*"
              maxCount={1}
              fileList={fileList}
              onChange={(info) => {
                let newFileList = [...info.fileList];
                newFileList = newFileList.slice(-1);
                setFileList(newFileList);
              }}
              beforeUpload={(file) => {
                const isVideo = file.type.startsWith('video/');
                const isImage = file.type.startsWith('image/');
                const sizeMB = file.size / 1024 / 1024;
                
                if (isVideo && sizeMB > 50) {
                  import('antd').then(({ message }) => message.error(`视频文件过大，不能超过 50MB！当前大小: ${sizeMB.toFixed(1)}MB`));
                  return Upload.LIST_IGNORE;
                }
                if (isImage && sizeMB > 10) {
                  import('antd').then(({ message }) => message.error(`图片文件过大，不能超过 10MB！当前大小: ${sizeMB.toFixed(1)}MB`));
                  return Upload.LIST_IGNORE;
                }
                return false; // 手动上传
              }}
            >
              <Button icon={<UploadOutlined />}>选择图片或视频</Button>
            </Upload>
          </Form.Item>
          <Form.Item label="分类" name="category" rules={[{ required: true, message: '请选择分类' }]}>
            <Select placeholder="请选择二级分类">
              {(() => {
                const currentPrimary = selectedKey.replace('preset_', '').split('/')[0];
                const activeCat = PRESET_CATEGORIES.find(c => c.key === currentPrimary);
                if (activeCat && activeCat.children.length > 0) {
                  return activeCat.children.map(child => (
                    <Select.Option key={child} value={`${currentPrimary}/${child}`}>{child}</Select.Option>
                  ));
                } else {
                  return <Select.Option value={currentPrimary}>{currentPrimary}</Select.Option>;
                }
              })()}
            </Select>
          </Form.Item>
          {selectedKey.replace('preset_', '').split('/')[0] === '模版库' && (
            <Form.Item label="模版介绍" name="remark">
              <Input.TextArea rows={3} placeholder="请输入模版介绍说明" />
            </Form.Item>
          )}
          <Form.Item label="指定专属用户 ID" name="target_user_id" extra="如果不填，默认分配为 000000（所有人可用）；如果填写特定的 User ID，则该素材只属于该用户">
            <Input placeholder="可选，留空默认为 000000" />
          </Form.Item>
          <Form.Item label="自定义素材 ID (Asset ID)" name="target_asset_id" extra="推荐自行指定唯一的标识，如果不填默认分配为 00000">
            <Input placeholder="可选，留空默认为 00000" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default AdminPresetAssets;
