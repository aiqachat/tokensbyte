import React, { useState, useEffect } from 'react';
import { Table, Button, Space, message, Card, Typography, Upload, Tag, Progress, Spin } from 'antd';
import { UploadOutlined, CloudOutlined, FolderOutlined, FileOutlined } from '@ant-design/icons';
import request from '../../utils/request';
import type { PluginAsset } from '../../types';

const { Title, Text } = Typography;

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
  total_size: number;
  total_size_mb: string;
  quota_mb: number;
  remain_mb: string;
  is_admin: boolean;
}

const UserAssets: React.FC = () => {
  const [assets, setAssets] = useState<PluginAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [storageLoading, setStorageLoading] = useState(false);

  useEffect(() => {
    fetchAssets();
    fetchStorageInfo();
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
        fetchStorageInfo(); // 上传成功后刷新存储信息
      } else if (info.file.status === 'error') {
        const errMsg = info.file.response?.error?.message || `${info.file.name} 上传失败`;
        message.error(errMsg);
      }
    },
  };

  // 存储空间计算
  const usedMB = storage ? parseFloat(storage.total_size_mb) : 0;
  const quotaMB = storage?.quota_mb ?? 100;
  const isAdmin = storage?.is_admin ?? false;
  const remainMB = isAdmin ? 0 : Math.max(0, quotaMB - usedMB);
  const usagePercent = (!isAdmin && quotaMB > 0) ? Math.min(100, (usedMB / quotaMB) * 100) : 0;
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
        {/* 存储空间信息 - 从 TOS 实际读取 */}
        <Spin spinning={storageLoading} tip="正在读取存储空间...">
          <div style={{
            background: 'linear-gradient(135deg, rgba(22,119,255,0.08) 0%, rgba(22,119,255,0.02) 100%)',
            borderRadius: 10,
            border: '1px solid rgba(22,119,255,0.15)',
            padding: '18px 22px',
            marginBottom: 20,
          }}>
            {/* 标题行 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CloudOutlined style={{ color: '#1677ff', fontSize: 18 }} />
                <Text strong style={{ fontSize: 15 }}>存储空间</Text>
                {storage && (
                  <Tag style={{ 
                    margin: 0, fontSize: 11, borderRadius: 10, 
                    background: 'rgba(22,119,255,0.1)', border: '1px solid rgba(22,119,255,0.2)', 
                    color: '#1677ff' 
                  }}>
                    <FolderOutlined style={{ marginRight: 4 }}/>{storage.folder || '未初始化'}
                  </Tag>
                )}
              </div>
              {storage && (
                <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13 }}>
                  <FileOutlined style={{ marginRight: 4 }}/>{storage.file_count || 0} 个文件
                </Text>
              )}
            </div>

            {/* 用量信息 */}
            {storage && (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
                  <Text style={{ fontSize: 24, fontWeight: 700, color: progressColor }}>
                    {usedMB.toFixed(1)}
                  </Text>
                  <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
                    MB 已使用
                    {!isAdmin && (
                      <> / {quotaMB} MB 总空间</>
                    )}
                  </Text>
                </div>

                {/* 进度条 - 普通用户显示 */}
                {!isAdmin && quotaMB > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <Progress
                      percent={Number(usagePercent.toFixed(1))}
                      strokeColor={{
                        '0%': progressColor,
                        '100%': usagePercent > 70 ? '#ff4d4f' : '#52c41a',
                      }}
                      trailColor="rgba(255,255,255,0.06)"
                      format={(p) => `${p}%`}
                      size="small"
                    />
                  </div>
                )}

                <div style={{ display: 'flex', gap: 20, color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>
                  {!isAdmin && (
                    <span>剩余 <Text strong style={{ color: remainMB < 10 ? '#faad14' : '#52c41a', fontSize: 12 }}>{storage.remain_mb} MB</Text></span>
                  )}
                  {isAdmin && (
                    <span style={{ color: 'rgba(255,255,255,0.35)' }}>管理员存储无空间限制</span>
                  )}
                </div>
              </>
            )}

            {!storage && !storageLoading && (
              <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>存储信息加载中...</Text>
            )}
          </div>
        </Spin>

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
