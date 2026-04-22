import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Space, message, Typography, Tag, Popconfirm, Select, Empty } from 'antd';
import { DeleteOutlined, ReloadOutlined, LinkOutlined } from '@ant-design/icons';
import request from '../../../utils/request';

const { Text } = Typography;

interface RelayConvertAsset {
  id: number;
  user_id: string;
  asset_type: string;
  file_name: string;
  file_url: string;
  asset_id: string | null;
  status: string;
  created_at: string;
}

const RelayConvertAssets: React.FC = () => {
  const [items, setItems] = useState<RelayConvertAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [filterType, setFilterType] = useState<string | undefined>(undefined);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [deleting, setDeleting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      let url = `/assets/admin/relay-converts?page=${page}&page_size=${pageSize}`;
      if (filterType) url += `&asset_type=${filterType}`;
      const res = await (request.get(url) as any);
      setItems(res.items || []);
      setTotal(res.total || 0);
    } catch (e) {
      console.error(e);
      message.error('获取转换素材列表失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, filterType]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return;
    try {
      setDeleting(true);
      await request.post('/assets/admin/relay-converts/delete', { ids: selectedIds });
      message.success(`已删除 ${selectedIds.length} 条转换素材`);
      setSelectedIds([]);
      fetchData();
    } catch (e) {
      console.error(e);
      message.error('批量删除失败');
    } finally {
      setDeleting(false);
    }
  };

  const handleSingleDelete = async (id: number) => {
    try {
      await request.post('/assets/admin/relay-converts/delete', { ids: [id] });
      message.success('删除成功');
      fetchData();
    } catch (e) {
      console.error(e);
      message.error('删除失败');
    }
  };

  const typeColorMap: Record<string, string> = { image: 'blue', video: 'volcano', audio: 'green' };
  const typeLabelMap: Record<string, string> = { image: '图片', video: '视频', audio: '音频' };

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 60,
    },
    {
      title: '原始 URL',
      dataIndex: 'file_url',
      key: 'file_url',
      ellipsis: true,
      render: (url: string) => (
        <Text copyable={{ text: url }} style={{ fontSize: 12, fontFamily: 'monospace' }}>
          <LinkOutlined style={{ marginRight: 4, color: '#1677ff' }} />
          {url.length > 60 ? url.slice(0, 60) + '...' : url}
        </Text>
      ),
    },
    {
      title: '素材 ID',
      dataIndex: 'asset_id',
      key: 'asset_id',
      width: 220,
      render: (aid: string | null) => aid
        ? <Text code copyable style={{ fontSize: 11 }}>{aid}</Text>
        : <Text type="secondary">-</Text>,
    },
    {
      title: '类型',
      dataIndex: 'asset_type',
      key: 'asset_type',
      width: 80,
      render: (t: string) => <Tag color={typeColorMap[t] || 'default'}>{typeLabelMap[t] || t}</Tag>,
    },
    {
      title: '关联用户',
      dataIndex: 'user_id',
      key: 'user_id',
      width: 140,
      render: (uid: string) => <Text style={{ fontSize: 12 }}>{uid?.slice(0, 12)}...</Text>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (s: string) => {
        if (s === 'approved') return <Tag color="success">有效</Tag>;
        if (s === 'processing') return <Tag color="processing">处理中</Tag>;
        return <Tag>{s}</Tag>;
      },
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (t: string) => t ? <Text style={{ fontSize: 12 }}>{new Date(t).toLocaleString('zh-CN')}</Text> : '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 70,
      render: (_: any, record: RelayConvertAsset) => (
        <Popconfirm
          title="确定删除此转换素材？"
          description="将同时尝试删除方舟远端素材"
          onConfirm={() => handleSingleDelete(record.id)}
          okText="确定"
          cancelText="取消"
          okButtonProps={{ danger: true }}
        >
          <Button type="text" size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Text strong style={{ color: '#fff', fontSize: 14 }}>转换素材管理</Text><br />
        <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>
          通过「火山方舟 视频素材转换」转发规则自动将请求中的网络 URL 转换为方舟素材 ID 的历史记录。同一 URL 仅创建一次，后续请求自动复用。
        </Text>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Space>
          <Select
            placeholder="按类型筛选"
            allowClear
            value={filterType}
            onChange={(v) => { setFilterType(v); setPage(1); }}
            style={{ width: 140 }}
            options={[
              { label: '全部类型', value: undefined as any },
              { label: '图片', value: 'image' },
              { label: '视频', value: 'video' },
              { label: '音频', value: 'audio' },
            ]}
          />
          <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>共 {total} 条记录</Text>
        </Space>
        <Space>
          {selectedIds.length > 0 && (
            <Popconfirm
              title={`确定批量删除 ${selectedIds.length} 条转换素材？`}
              description="将同时尝试删除方舟远端素材"
              onConfirm={handleBatchDelete}
              okText="确定删除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
            >
              <Button danger icon={<DeleteOutlined />} loading={deleting}>
                批量删除 ({selectedIds.length})
              </Button>
            </Popconfirm>
          )}
          <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>刷新</Button>
        </Space>
      </div>

      <Table
        dataSource={items}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="small"
        locale={{ emptyText: <Empty description="暂无转换素材记录" /> }}
        rowSelection={{
          selectedRowKeys: selectedIds,
          onChange: (keys) => setSelectedIds(keys as number[]),
        }}
        pagination={{
          current: page,
          total,
          pageSize,
          showSizeChanger: false,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (p) => setPage(p),
        }}
      />
    </div>
  );
};

export default RelayConvertAssets;
