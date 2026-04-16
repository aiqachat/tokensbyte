import React, { useState, useEffect } from 'react';
import { Table, Button, Space, message, Typography, Upload, Popconfirm, Tag, Modal, Input, Form, Select, Tooltip } from 'antd';
import { UploadOutlined, EditOutlined, DeleteOutlined, ArrowUpOutlined, ArrowDownOutlined, CloudOutlined } from '@ant-design/icons';
import request from '../../../utils/request';
import type { PluginAsset } from '../../../types';

const { Text } = Typography;

const AdminPresetAssets: React.FC = () => {
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
  const [adminStorage, setAdminStorage] = useState<{ used_bytes: number; used_mb: string; folder: string } | null>(null);

  useEffect(() => {
    fetchAssets();
  }, []);

  const fetchAssets = async () => {
    try {
      setLoading(true);
      const res = await (request.get('/assets/admin/list?source=builtin') as any);
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
      assetid: record.asset_id || '',
    });
    
    // Optionally fetch live tags from TOS
    try {
      const res = await (request.get(`/assets/admin/${record.id}/tags`) as any);
      if (res.tags) {
        form.setFieldsValue({
          category: res.tags.category || record.category || '图片',
          userid: res.tags.userid || record.user_id || '',
          assetid: res.tags.assetid || record.asset_id || '',
        });
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
        userid: values.userid,
        assetid: values.assetid,
      });
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
        ids: orderedAssets.map((a) => a.id),
      });
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
      formData.append('target_user_id', values.target_user_id || '');
      formData.append('target_asset_id', values.target_asset_id || '');

      await request.post('/assets/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

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
      key: 'file_name',
    },
    {
      title: '分类 (Category)',
      dataIndex: 'category',
      key: 'category',
      render: (cat: string) => <Tag color="blue">{cat || '未分类'}</Tag>
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
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <Text strong style={{ color: '#fff', fontSize: 14 }}>预设素材管理</Text><br />
          <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>您可以上传系统级预设素材，为其指定专属用户及分类，此信息同时写入对象存储(TOS)标签。点击 ↑↓ 按钮可调整排列顺序。</Text>
          {adminStorage && (
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <CloudOutlined style={{ color: '#1677ff', fontSize: 14 }} />
              <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12 }}>
                管理员存储（文件夹: {adminStorage.folder}）已使用 <Text strong style={{ color: '#1677ff' }}>{adminStorage.used_mb} MB</Text>
              </Text>
            </div>
          )}
        </div>
        <Button icon={<UploadOutlined />} type="primary" onClick={() => setIsUploadModalOpen(true)}>
          上传预设素材
        </Button>
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
              <Select.Option value="视频">视频</Select.Option>
              <Select.Option value="图片">图片</Select.Option>
              <Select.Option value="音频">音频</Select.Option>
              <Select.Option value="虚拟人像">虚拟人像</Select.Option>
              <Select.Option value="我的">我的</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item label="归属用户 (User ID) (非必填)" name="userid">
            <Input placeholder="输入特定的前台 User ID，留空表示公共" />
          </Form.Item>
          {editingAsset && (
             <Form.Item label="素材 ID (Asset ID)" name="assetid">
               <Input placeholder="输入自定义素材 ID (留空保持原样)" />
             </Form.Item>
          )}
        </Form>
      </Modal>

      <Modal
        title="上传预设素材"
        open={isUploadModalOpen}
        onCancel={() => { setIsUploadModalOpen(false); uploadForm.resetFields(); setFileList([]); }}
        onOk={handleCustomUpload}
        confirmLoading={uploading}
        okText="开始上传"
      >
        <Form form={uploadForm} layout="vertical" initialValues={{ category: '图片' }}>
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
              beforeUpload={() => false} // 手动上传
            >
              <Button icon={<UploadOutlined />}>选择图片或视频</Button>
            </Upload>
          </Form.Item>
          <Form.Item label="分类" name="category" rules={[{ required: true, message: '请选择分类' }]}>
            <Select placeholder="请选择预设分类">
              <Select.Option value="视频">视频</Select.Option>
              <Select.Option value="图片">图片</Select.Option>
              <Select.Option value="音频">音频</Select.Option>
              <Select.Option value="虚拟人像">虚拟人像</Select.Option>
              <Select.Option value="我的">我的</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item label="指定专属用户 ID" name="target_user_id" extra="如果填入 User ID，该预设素材将只属于该用户；不填即所有人可用">
            <Input placeholder="可选" />
          </Form.Item>
          <Form.Item label="自定义素材 ID (Asset ID)" name="target_asset_id" extra="推荐自行指定唯一的标识，留空将由系统自动生成 UUID">
            <Input placeholder="可选，例如：bg_forest_01" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default AdminPresetAssets;
