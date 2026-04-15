import React, { useState, useEffect } from 'react';
import { Table, Button, Space, message, Typography, Upload, Popconfirm, Tag, Modal, Input, Form } from 'antd';
import { UploadOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
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

  // New Upload Modal state
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadForm] = Form.useForm();
  const [fileList, setFileList] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);

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
      category: record.category || '未分类',
      userid: record.user_id || '',
    });
    
    // Optionally fetch live tags from TOS
    try {
      const res = await (request.get(`/assets/admin/${record.id}/tags`) as any);
      if (res.tags) {
        form.setFieldsValue({
          category: res.tags.category || record.category || '未分类',
          userid: res.tags.userid || record.user_id || '',
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
        category: values.category,
        userid: values.userid,
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
      formData.append('category', values.category || '未分类');
      formData.append('target_user_id', values.target_user_id || '');

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
      title: '预览',
      key: 'preview',
      render: (_: any, record: PluginAsset) => {
        const fullUrl = `${API_BASE_URL}${record.file_url}`;
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
      render: (uid: string) => uid ? <Text code>{uid}</Text> : <Text type="secondary">N/A</Text>
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
          <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)}>编辑标签</Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <Text strong style={{ color: '#fff', fontSize: 14 }}>预设素材管理</Text><br />
          <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>您可以上传系统级预设素材，为其指定专属用户及分类，此信息同时写入对象存储(TOS)标签。</Text>
        </div>
        <Button icon={<UploadOutlined />} type="primary" onClick={() => setIsUploadModalOpen(true)}>
          上传预设素材
        </Button>
      </div>

      <Table
        dataSource={assets}
        columns={columns}
        rowKey="id"
        loading={loading}
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
          <Form.Item label="分类 (Category)" name="category" rules={[{ required: true, message: '请输入分类' }]}>
            <Input placeholder="例如：风景、人物、背景等" />
          </Form.Item>
          <Form.Item label="归属用户 (User ID) (非必填)" name="userid">
            <Input placeholder="输入特定的前台 User ID，留空表示公共" />
          </Form.Item>
          {editingAsset && (
             <Form.Item label="素材 ID (Asset ID)">
               <Input disabled value={editingAsset.asset_id || '暂无'} />
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
        <Form form={uploadForm} layout="vertical" initialValues={{ category: '未分类' }}>
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
          <Form.Item label="分类" name="category">
            <Input placeholder="预设分类（默认：未分类）" />
          </Form.Item>
          <Form.Item label="指定专属用户 ID" name="target_user_id" extra="如果填入 User ID，该预设素材将只属于该用户；不填即所有人可用">
            <Input placeholder="可选" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default AdminPresetAssets;
