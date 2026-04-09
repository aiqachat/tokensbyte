import React, { useCallback, useEffect, useState } from 'react';
import { Table, Card, Typography, Space, Input, Button, Tag } from 'antd';
import { SyncOutlined, SearchOutlined, WalletOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';
import useSettingsStore from '../../store/settings';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

interface RechargeRecord {
  id: i64;
  user_id: string;
  username: string;
  uid: string;
  amount: number;
  remark: string | null;
  created_at: string;
}

const RechargeRecords: React.FC = () => {
  const { t } = useTranslation();
  const { settings } = useSettingsStore();
  const currencySymbol = settings?.currency?.currency_symbol || '$';
  const [data, setData] = useState<RechargeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await (request.get('/finance/recharges', {
        params: {
          page,
          per_page: pageSize,
          user_id: search || undefined,
        }
      }) as unknown as Promise<{ data: RechargeRecord[]; total: number }>);
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
        render: (record: RechargeRecord) => (
          <Space direction="vertical" size={0}>
            <Text strong>{record.username}</Text>
            <Text type="secondary" style={{ fontSize: '12px' }}>UID: {record.uid}</Text>
          </Space>
        ),
    },
    {
      title: t('finance.amount'),
      dataIndex: 'amount',
      key: 'amount',
      render: (val: number) => (
        <Text strong style={{ color: val >= 0 ? '#52c41a' : '#ff4d4f' }}>
          {val >= 0 ? '+' : '-'}{currencySymbol}{Math.abs(val).toFixed(2)}
        </Text>
      ),
    },
    {
      title: t('finance.remark'),
      dataIndex: 'remark',
      key: 'remark',
      render: (text: string) => text || '-',
    },
  ];

  return (
    <Card bordered={false}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24, alignItems: 'center' }}>
        <Space size="middle">
            <WalletOutlined style={{ fontSize: '24px', color: '#1677ff' }} />
            <Title level={2} style={{ margin: 0 }}>{t('finance.recharge_title')}</Title>
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

export default RechargeRecords;
