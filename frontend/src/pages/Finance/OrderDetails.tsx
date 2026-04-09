import React, { useCallback, useEffect, useState } from 'react';
import { Table, Card, Typography, Space, Input, Button, Tag } from 'antd';
import { SyncOutlined, SearchOutlined, BarChartOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';
import useSettingsStore from '../../store/settings';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

interface OrderRecord {
  id: number;
  user_id: string;
  username: string;
  uid: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  cost: number;
  status_code: number;
  created_at: string;
}

const OrderDetails: React.FC = () => {
  const { t } = useTranslation();
  const { settings } = useSettingsStore();
  const currencySymbol = settings?.currency?.currency_symbol || '$';
  const [data, setData] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await (request.get('/finance/orders', {
        params: {
          page,
          per_page: pageSize,
          user_id: search || undefined,
        }
      }) as unknown as Promise<{ data: OrderRecord[]; total: number }>);
      setData(resp.data);
      setTotal(resp.total);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const columns = [
    {
      title: t('logs.time'),
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (text: string) => dayjs(text).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: t('finance.user_info'),
      key: 'user',
        render: (record: OrderRecord) => (
          <Space direction="vertical" size={0}>
            <Text strong>{record.username}</Text>
            <Text type="secondary" style={{ fontSize: '12px' }}>UID: {record.uid}</Text>
          </Space>
        ),
    },
    {
      title: t('logs.model'),
      dataIndex: 'model',
      key: 'model',
      render: (text: string) => <Tag color="blue">{text}</Tag>,
    },
    {
      title: t('logs.usage'),
      key: 'usage',
      render: (record: OrderRecord) => (
        <Space direction="vertical" size={0}>
          <Text type="secondary" style={{ fontSize: 11 }}>{t('logs.in')}: {record.prompt_tokens}</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>{t('logs.out')}: {record.completion_tokens}</Text>
        </Space>
      ),
    },
    {
      title: t('finance.cost'),
      dataIndex: 'cost',
      key: 'cost',
      render: (val: number) => <Text strong>{currencySymbol}{val.toFixed(4)}</Text>,
    },
    {
      title: t('finance.status'),
      dataIndex: 'status_code',
      key: 'status_code',
      render: (code: number) => (
        <Tag color={code === 200 ? 'success' : 'error'}>{code === 200 ? 'Success' : 'Error'}</Tag>
      ),
    },
  ];

  return (
    <Card bordered={false}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24, alignItems: 'center' }}>
        <Space size="middle">
            <BarChartOutlined style={{ fontSize: '24px', color: '#52c41a' }} />
            <Title level={2} style={{ margin: 0 }}>{t('finance.order_title')}</Title>
        </Space>
        <Space>
          <Input 
            placeholder={t('common.search_placeholder')} 
            prefix={<SearchOutlined />} 
            value={search}
            onChange={e => setSearch(e.target.value)}
            onPressEnter={fetchData}
            style={{ width: 250 }}
          />
          <Button icon={<SyncOutlined />} onClick={fetchData}>{t('common.refresh')}</Button>
        </Space>
      </div>

      <Table
        dataSource={data}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={{
          total,
          current: page,
          pageSize,
          onChange: (p, s) => {
            setPage(p);
            setPageSize(s);
          },
          showSizeChanger: true,
        }}
        size="middle"
        scroll={{ x: 'max-content' }}
      />
    </Card>
  );
};

export default OrderDetails;
