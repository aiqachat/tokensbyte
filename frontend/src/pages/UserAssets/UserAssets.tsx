import React, { useState, useEffect } from 'react';
import { Table, Button, Space, message, Card, Typography, Upload, Tag, Progress } from 'antd';
import { UploadOutlined, CloudOutlined } from '@ant-design/icons';
import request from '../../utils/request';
import type { PluginAsset } from '../../types';

const { Title, Text } = Typography;

interface StorageInfo {
  used_bytes: number;
  quota_mb: number;
  quota_bytes: number;
  used_mb: string;
}

const UserAssets: React.FC = () => {
  const [assets, setAssets] = useState<PluginAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [storage, setStorage] = useState<StorageInfo | null>(null);

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
      if (res.storage) {
        setStorage(res.storage);
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
    action: '/api/v1/assets/upload',
    headers: {
      Authorization: `Bearer ${localStorage.getItem('token')}`
    },
    showUploadList: false,
    onChange(info: any) {
      if (info.file.status === 'done') {
        message.success(`${info.file.name} 上传成功, 等待管理员审核`);
        fetchAssets();
      } else if (info.file.status === 'error') {
        const errMsg = info.file.response?.error?.message || `${info.file.name} 上传失败`;
        message.error(errMsg);
      }
    },
  };

  // 存储空间计算
  const usedMB = storage ? parseFloat(storage.used_mb) : 0;
  const quotaMB = storage?.quota_mb ?? 100;
  const remainMB = Math.max(0, quotaMB - usedMB);
  const usagePercent = quotaMB > 0 ? Math.min(100, (usedMB / quotaMB) * 100) : 0;
  const progressColor = usagePercent > 90 ? '#ff4d4f' : usagePercent > 70 ? '#faad14' : '#52c41a';

  const columns = [
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
        {/* 存储空间信息 */}
        {storage && (
          <div style={{
            background: 'rgba(255,255,255,0.04)',
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.08)',
            padding: '16px 20px',
            marginBottom: 20,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CloudOutlined style={{ color: '#1677ff', fontSize: 16 }} />
                <Text strong style={{ fontSize: 14 }}>存储空间</Text>
              </div>
              <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>
                已用 <Text strong style={{ color: progressColor }}>{usedMB.toFixed(1)} MB</Text> / {quotaMB} MB，剩余 <Text strong style={{ color: '#52c41a' }}>{remainMB.toFixed(1)} MB</Text>
              </Text>
            </div>
            <Progress
              percent={Number(usagePercent.toFixed(1))}
              strokeColor={progressColor}
              trailColor="rgba(255,255,255,0.08)"
              showInfo={false}
              size="small"
            />
          </div>
        )}

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
