import React, { useState, useEffect } from 'react';
import { Table, Button, Space, message, Card, Typography, Upload, Tag } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import request from '../../utils/request';
import type { PluginAsset } from '../../types';

const { Title } = Typography;

const UserAssets: React.FC = () => {
  const [assets, setAssets] = useState<PluginAsset[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchAssets();
  }, []);

  const fetchAssets = async () => {
    try {
      setLoading(true);
      const res = await (request.get('/assets/user/list') as any);
      if (res.assets) {
        setAssets(res.assets);
      }
    } catch (error) {
      console.error(error);
      message.error('获取个人素材列表失败');
    } finally {
      setLoading(false);
    }
  };

  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  const props = {
    name: 'file',
    action: `${API_BASE_URL}/assets/upload`,
    headers: {
      Authorization: `Bearer ${localStorage.getItem('token')}`
    },
    showUploadList: false,
    onChange(info: any) {
      if (info.file.status === 'done') {
        message.success(`${info.file.name} 上传成功, 等待管理员审核`);
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
          return <img src={fullUrl} alt={record.file_name} style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: '4px' }} />;
        } else {
          return <video src={fullUrl} style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: '4px' }} muted />;
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
      title: '审核状态',
      key: 'status',
      render: (_: any, record: PluginAsset) => {
        if (record.status === 'approved') return <Tag color="success">已通过</Tag>;
        if (record.status === 'rejected') return (
          <>
            <Tag color="error">已驳回</Tag>
            <div style={{ fontSize: '12px', color: '#ff4d4f', marginTop: 4 }}>
              原因: {record.reject_reason || '无'}
            </div>
          </>
        );
        return <Tag color="warning">审核中</Tag>;
      }
    },
  ];

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <Card 
        title={<Title level={4}>我的资产库</Title>} 
        bordered={false}
        extra={
          <Upload {...props} accept="image/*,video/*">
            <Button icon={<UploadOutlined />} type="primary" size="large">
              上传素材
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

export default UserAssets;
