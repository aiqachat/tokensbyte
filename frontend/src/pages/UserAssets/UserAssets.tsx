import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Space, message, Card, Typography, Upload, Tag, Progress, Spin, Menu, Modal, Select, Form } from 'antd';
import {
  UploadOutlined, CloudOutlined, FolderOutlined, FileOutlined,
  PictureOutlined, VideoCameraOutlined, UserOutlined, AppstoreOutlined,
  StarOutlined, InboxOutlined
} from '@ant-design/icons';
import request from '../../utils/request';
import type { PluginAsset } from '../../types';
import type { MenuProps } from 'antd';

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

// 我的素材固定二级分类
const MY_ASSET_SUBCATEGORIES = [
  { key: 'my_image', label: '图片', icon: <PictureOutlined />, filter: { asset_type: 'image' } },
  { key: 'my_video', label: '视频', icon: <VideoCameraOutlined />, filter: { asset_type: 'video' } },
  { key: 'my_portrait', label: '我的人像', icon: <UserOutlined />, filter: { category: '我的人像' } },
  { key: 'my_other', label: '其他素材', icon: <InboxOutlined />, filter: { category: '__other__' } },
];

const UserAssets: React.FC = () => {
  const [assets, setAssets] = useState<PluginAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [storageLoading, setStorageLoading] = useState(false);

  // 分类状态
  const [presetCategories, setPresetCategories] = useState<string[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>(''); // 当前选中的菜单key
  const [openKeys, setOpenKeys] = useState<string[]>(['preset']); // 默认展开预设素材

  // 上传弹窗
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadForm] = Form.useForm();
  const [fileList, setFileList] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);

  // 获取预设素材分类
  const fetchPresetCategories = useCallback(async () => {
    try {
      const res = await (request.get('/assets/user/preset-categories') as any);
      if (res.categories) {
        setPresetCategories(res.categories);
        // 默认选中第一个预设分类
        if (res.categories.length > 0 && !selectedKey) {
          setSelectedKey(`preset_${res.categories[0]}`);
        }
      }
    } catch (error) {
      console.error('获取预设分类失败', error);
    }
  }, [selectedKey]);

  // 根据当前选中分类构建 query 参数
  const buildQueryParams = useCallback(() => {
    const params: Record<string, string> = {};

    if (selectedKey.startsWith('preset_')) {
      params.source = 'builtin';
      const cat = selectedKey.replace('preset_', '');
      if (cat) params.category = cat;
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
    fetchPresetCategories();
    fetchStorageInfo();
  }, []);

  // 当 selectedKey 改变时重新获取素材
  useEffect(() => {
    if (selectedKey) {
      fetchAssets();
    }
  }, [selectedKey, fetchAssets]);

  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  // 上传处理
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

      await request.post('/assets/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      message.success('上传成功，等待管理员审核');
      setIsUploadModalOpen(false);
      uploadForm.resetFields();
      setFileList([]);
      fetchAssets();
      fetchStorageInfo();
    } catch (error) {
      console.error(error);
      message.error('上传失败');
    } finally {
      setUploading(false);
    }
  };

  // 存储空间计算
  const usedMB = storage ? parseFloat(storage.total_size_mb) : 0;
  const quotaMB = storage?.quota_mb ?? 100;
  const isAdmin = storage?.is_admin ?? false;
  const remainMB = isAdmin ? 0 : Math.max(0, quotaMB - usedMB);
  const usagePercent = (!isAdmin && quotaMB > 0) ? Math.min(100, (usedMB / quotaMB) * 100) : 0;
  const progressColor = usagePercent > 90 ? '#ff4d4f' : usagePercent > 70 ? '#faad14' : '#52c41a';

  // 构建分类菜单
  const categoryMenuItems: MenuProps['items'] = [
    {
      key: 'preset',
      icon: <StarOutlined />,
      label: '预设素材',
      children: presetCategories.map(cat => ({
        key: `preset_${cat}`,
        icon: cat === '图片' ? <PictureOutlined /> :
              cat === '视频' ? <VideoCameraOutlined /> :
              cat === '虚拟人像' ? <UserOutlined /> :
              <AppstoreOutlined />,
        label: cat,
      })),
    },
    {
      key: 'my',
      icon: <FolderOutlined />,
      label: '我的素材',
      children: MY_ASSET_SUBCATEGORIES.map(sub => ({
        key: sub.key,
        icon: sub.icon,
        label: sub.label,
      })),
    },
  ];

  // 当前选中分类的显示名
  const currentCategoryName = (() => {
    if (selectedKey.startsWith('preset_')) {
      return `预设素材 / ${selectedKey.replace('preset_', '')}`;
    }
    const sub = MY_ASSET_SUBCATEGORIES.find(s => s.key === selectedKey);
    if (sub) return `我的素材 / ${sub.label}`;
    return '全部素材';
  })();

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
    <div style={{ padding: '16px 24px' }}>
      <Card
        title={<Title level={4}>我的资产库</Title>}
        bordered={false}
        extra={
          <Button
            icon={<UploadOutlined />}
            type="primary"
            size="large"
            onClick={() => setIsUploadModalOpen(true)}
          >
            上传素材
          </Button>
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

        {/* 分类导航 + 素材列表 */}
        <div style={{ display: 'flex', gap: 16 }}>
          {/* 左侧分类导航 */}
          <div style={{
            width: 180,
            minWidth: 180,
            background: 'rgba(255,255,255,0.02)',
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.06)',
            overflow: 'hidden',
          }}>
            <div style={{
              padding: '12px 16px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              fontSize: 13,
              fontWeight: 600,
              color: 'rgba(255,255,255,0.85)',
            }}>
              <AppstoreOutlined style={{ marginRight: 6 }} />
              素材分类
            </div>
            <Menu
              mode="inline"
              selectedKeys={[selectedKey]}
              openKeys={openKeys}
              onOpenChange={(keys) => setOpenKeys(keys as string[])}
              onClick={({ key }) => setSelectedKey(key)}
              items={categoryMenuItems}
              style={{
                background: 'transparent',
                border: 'none',
                fontSize: 13,
              }}
            />
          </div>

          {/* 右侧素材列表 */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              marginBottom: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13 }}>
                当前分类：<Text strong style={{ color: '#1677ff' }}>{currentCategoryName}</Text>
                <Text style={{ marginLeft: 12, color: 'rgba(255,255,255,0.35)' }}>
                  共 {assets.length} 个素材
                </Text>
              </Text>
            </div>

            <Table
              dataSource={assets}
              columns={columns}
              rowKey="id"
              loading={loading}
              pagination={{ pageSize: 10 }}
              size="middle"
            />
          </div>
        </div>
      </Card>

      {/* 上传素材弹窗 */}
      <Modal
        title="上传素材"
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
              beforeUpload={() => false}
            >
              <Button icon={<UploadOutlined />}>选择图片或视频</Button>
            </Upload>
          </Form.Item>
          <Form.Item
            label="素材分类"
            name="category"
            rules={[{ required: true, message: '请选择分类' }]}
            extra="选择『我的人像』可在资产库的『我的素材 > 我的人像』中查看"
          >
            <Select placeholder="请选择分类">
              <Select.Option value="图片">图片</Select.Option>
              <Select.Option value="视频">视频</Select.Option>
              <Select.Option value="我的人像">我的人像</Select.Option>
              <Select.Option value="其他">其他</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default UserAssets;
