import React, { useState, useEffect } from 'react';
import { Table, Button, Space, message, Card, Typography, Upload, Tag, Popconfirm, Tooltip } from 'antd';
import { UploadOutlined, CheckOutlined, CloseOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import request from '../../../utils/request';
import type { PluginAsset } from '../../../types';

const { Title } = Typography;

const AdminAssets: React.FC = () => {
  const [assets, setAssets] = useState<PluginAsset[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchAssets();
  }, []);

  const fetchAssets = async () => {
    try {
      setLoading(true);
      const res = await (request.get('/assets/admin/list') as any);
      if (res.assets) {
        setAssets(res.assets);
      }
    } catch (error) {
      console.error(error);
      message.error('获取素材列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAudit = async (id: number, status: string, rejectReason?: string) => {
    try {
      await request.post(`/assets/admin/audit/${id}`, {
        status,
        reject_reason: rejectReason || null,
      });
      message.success('审核完成');
      fetchAssets();
    } catch (error) {
      console.error(error);
      message.error('审核操作失败');
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

  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  const props = {
    name: 'file',
    action: '/api/v1/assets/upload',
    headers: {
      Authorization: `Bearer ${localStorage.getItem('token')}`
    },
    showUploadList: false,
    onChange(info: any) {
      if (info.file.status === 'done') {
        message.success(`${info.file.name} 上传成功`);
        fetchAssets();
      } else if (info.file.status === 'error') {
        message.error(`${info.file.name} 上传失败`);
      }
    },
  };

  const columns = [
    {
      title: '预览',
      key: 'preview',
      render: (_: any, record: PluginAsset) => {
        const fullUrl = `${API_BASE_URL}${record.file_url}`;
        if (record.asset_type === 'image') {
          return <img src={fullUrl} alt={record.file_name} style={{ width: 80, height: 80, objectFit: 'cover' }} />;
        } else {
          return <video src={fullUrl} style={{ width: 80, height: 80, objectFit: 'cover' }} muted />;
        }
      }
    },
    {
      title: '文件名',
      dataIndex: 'file_name',
      key: 'file_name',
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
      title: '来源',
      key: 'source',
      render: (_: any, record: PluginAsset) => (
        <Tag color={record.source === 'builtin' ? 'gold' : 'green'}>
          {record.source === 'builtin' ? '系统内置' : `用户上传(${record.user_id})`}
        </Tag>
      )
    },
    {
      title: '状态',
      key: 'status',
      render: (_: any, record: PluginAsset) => {
        if (record.status === 'approved') return <Tag color="success">已通过</Tag>;
        if (record.status === 'rejected') return <Tag color="error">已驳回</Tag>;
        return <Tag color="warning">待审核</Tag>;
      }
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: PluginAsset) => (
        <Space size="small">
          {record.status === 'pending' && (
            <>
              <Button 
                type="primary" 
                size="small" 
                icon={<CheckOutlined />} 
                onClick={() => handleAudit(record.id, 'approved')}
              >
                通过
              </Button>
              <Popconfirm
                title="确定要驳回吗？"
                onConfirm={() => handleAudit(record.id, 'rejected')}
                okText="确定"
                cancelText="取消"
              >
                <Button danger size="small" icon={<CloseOutlined />}>
                  驳回
                </Button>
              </Popconfirm>
            </>
          )}
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
    <div style={{ padding: 24 }}>
      <Card 
        title={<Title level={4}>素材资产管理 (全部)</Title>} 
        bordered={false}
        extra={
          <Upload {...props} accept="image/*,video/*">
            <Button icon={<UploadOutlined />} type="primary">
              上传系统级素材
            </Button>
          </Upload>
        }
      >
        <Table
          dataSource={assets}
          columns={columns}
          rowKey="id"
          loading={loading}
        />
      </Card>
    </div>
  );
};

export default AdminAssets;
