import React, { useCallback, useEffect, useState } from 'react';
import { Table, Card, Typography, Space, Input, Button, Tag, Select, DatePicker } from 'antd';
import { SyncOutlined, SearchOutlined, BarChartOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';
import useSettingsStore from '../../store/settings';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

interface OrderRecord {
  id: number;
  out_trade_no: string;
  user_id: string;
  username: string;
  uid: string;
  payment_method: string;
  amount: number;
  status: string;
  trade_no: string | null;
  created_at: string;
  paid_at: string | null;
}

const statusMap: Record<string, { color: string; label: string }> = {
  pending: { color: 'processing', label: '待支付' },
  paid: { color: 'success', label: '已支付' },
  closed: { color: 'default', label: '已关闭' },
};

const methodMap: Record<string, { color: string; label: string }> = {
  wechat: { color: '#07c160', label: '微信支付' },
  alipay: { color: '#1677ff', label: '支付宝' },
};

const OrderDetails: React.FC = () => {
  const { t } = useTranslation();
  const { settings } = useSettingsStore();
  const currencySymbol = settings?.currency?.currency_symbol || '¥';
  const [data, setData] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [totalAmount, setTotalAmount] = useState<number>(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [methodFilter, setMethodFilter] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<[string, string] | undefined>([
    dayjs().startOf('month').format('YYYY-MM-DD'),
    dayjs().endOf('month').format('YYYY-MM-DD')
  ]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await (request.get('/finance/orders', {
        params: {
          page,
          per_page: pageSize,
          user_id: search || undefined,
          status: statusFilter,
          payment_method: methodFilter,
          start_time: dateRange?.[0] || undefined,
          end_time: dateRange?.[1] ? dateRange[1] + ' 23:59:59' : undefined,
        }
      }) as unknown as Promise<{ data: OrderRecord[]; total: number; total_amount: number }>);
      setData(resp.data);
      setTotal(resp.total);
      setTotalAmount(resp.total_amount || 0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, statusFilter, methodFilter, dateRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const columns = [
    {
      title: '订单号',
      dataIndex: 'out_trade_no',
      key: 'out_trade_no',
      width: 220,
      render: (text: string) => <Text copyable style={{ fontFamily: 'monospace', fontSize: 12 }}>{text}</Text>,
    },
    {
      title: t('finance.user_info'),
      key: 'user',
      width: 150,
      render: (_: unknown, record: OrderRecord) => (
        <Space direction="vertical" size={0}>
          <Text strong>{record.username}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>UID: {record.uid}</Text>
        </Space>
      ),
    },
    {
      title: '支付方式',
      dataIndex: 'payment_method',
      key: 'payment_method',
      width: 100,
      render: (method: string) => {
        const m = methodMap[method] || { color: 'default', label: method };
        return <Tag color={m.color}>{m.label}</Tag>;
      },
    },
    {
      title: '金额',
      dataIndex: 'amount',
      key: 'amount',
      width: 100,
      render: (val: number) => <Text strong style={{ color: '#ff4d4f' }}>¥ {val.toFixed(2)}</Text>,
    },
    {
      title: t('finance.status'),
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => {
        const s = statusMap[status] || { color: 'default', label: status };
        return <Tag color={s.color}>{s.label}</Tag>;
      },
    },
    {
      title: '第三方交易号',
      dataIndex: 'trade_no',
      key: 'trade_no',
      width: 220,
      render: (text: string | null) => text ? <Text copyable style={{ fontFamily: 'monospace', fontSize: 12 }}>{text}</Text> : <Text type="secondary">-</Text>,
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (text: string) => dayjs(text).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '支付时间',
      dataIndex: 'paid_at',
      key: 'paid_at',
      width: 180,
      render: (text: string | null) => text ? dayjs(text).format('YYYY-MM-DD HH:mm:ss') : <Text type="secondary">-</Text>,
    },
  ];

  return (
    <Card bordered={false}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24, alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <Space size="middle" align="baseline">
          <BarChartOutlined style={{ fontSize: 24, color: '#52c41a' }} />
          <Title level={2} style={{ margin: 0 }}>支付订单</Title>
          <Text type="secondary" style={{ marginLeft: 8 }}>
            (已支付) 合计: <Text strong style={{ color: '#52c41a', fontSize: 16 }}>{currencySymbol}{totalAmount.toFixed(2)}</Text>
          </Text>
        </Space>
        <Space wrap>
          <RangePicker 
            defaultValue={[dayjs().startOf('month'), dayjs().endOf('month')]}
            onChange={(dates) => {
              if (dates && dates[0] && dates[1]) {
                 setDateRange([dates[0].format('YYYY-MM-DD'), dates[1].format('YYYY-MM-DD')]);
              } else {
                 setDateRange(undefined);
              }
            }} 
            style={{ width: 240 }}
          />
          <Select
            placeholder="支付状态"
            allowClear
            value={statusFilter}
            onChange={setStatusFilter}
            style={{ width: 120 }}
            options={[
              { label: '待支付', value: 'pending' },
              { label: '已支付', value: 'paid' },
              { label: '已关闭', value: 'closed' },
            ]}
          />
          <Select
            placeholder="支付方式"
            allowClear
            value={methodFilter}
            onChange={setMethodFilter}
            style={{ width: 120 }}
            options={[
              { label: '微信支付', value: 'wechat' },
              { label: '支付宝', value: 'alipay' },
            ]}
          />
          <Input
            placeholder={t('common.search_placeholder')}
            prefix={<SearchOutlined />}
            value={search}
            onChange={e => setSearch(e.target.value)}
            onPressEnter={fetchData}
            style={{ width: 200 }}
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
          showTotal: (t) => `共 ${t} 条`,
        }}
        size="middle"
        scroll={{ x: 'max-content' }}
      />
    </Card>
  );
};

export default OrderDetails;
