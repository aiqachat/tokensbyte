import React, { useCallback, useEffect, useState } from 'react';
import { Table, Card, Typography, Space, Input, Button, Tag, Select, DatePicker, Grid, List } from 'antd';
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
  stripe: { color: '#635bff', label: 'Stripe' },
};

const OrderDetails: React.FC = () => {
  const { t } = useTranslation();
  const screens = Grid.useBreakpoint();
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
      <div style={{ display: 'flex', flexDirection: screens.xs ? 'column' : 'row', justifyContent: 'space-between', marginBottom: 24, alignItems: screens.xs ? 'flex-start' : 'center', gap: 16 }}>
        <Space size="small" align="center" wrap>
          <BarChartOutlined style={{ fontSize: 24, color: '#52c41a' }} />
          <Title level={2} style={{ margin: 0, fontSize: screens.xs ? 20 : 24 }}>支付订单</Title>
          <Text type="secondary" style={{ marginLeft: screens.xs ? 0 : 8 }}>
            (已支付) 合计: <Text strong style={{ color: '#52c41a', fontSize: 16 }}>{currencySymbol}{totalAmount.toFixed(2)}</Text>
          </Text>
        </Space>
        <Space wrap style={{ width: screens.xs ? '100%' : 'auto' }}>
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
              { label: 'Stripe', value: 'stripe' },
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

      {screens.xs ? (
        <List
          dataSource={data}
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
            size: "small",
            showTotal: (t) => `共 ${t} 条`
          }}
          renderItem={(record) => {
            const statusInfo = statusMap[record.status] || { color: 'default', label: record.status };
            const methodInfo = methodMap[record.payment_method] || { color: 'default', label: record.payment_method };
            return (
              <List.Item style={{ padding: '0 0 16px 0', border: 'none' }}>
                <Card 
                  size="small" 
                  style={{ width: '100%', borderRadius: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
                  title={<Text strong>{record.username}</Text>}
                  extra={<Tag color={statusInfo.color}>{statusInfo.label}</Tag>}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>订单号</Text>
                    <Text copyable style={{ fontFamily: 'monospace', fontSize: 12 }}>{record.out_trade_no}</Text>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>UID</Text>
                    <Text style={{ fontSize: 12 }}>{record.uid}</Text>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>支付方式</Text>
                    <Tag color={methodInfo.color} style={{ margin: 0 }}>{methodInfo.label}</Tag>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>金额</Text>
                    <Text strong style={{ color: '#ff4d4f' }}>¥ {record.amount.toFixed(2)}</Text>
                  </div>
                  {record.trade_no && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>第三方交易号</Text>
                      <Text copyable style={{ fontFamily: 'monospace', fontSize: 12 }}>{record.trade_no}</Text>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>创建时间</Text>
                    <Text style={{ fontSize: 12 }}>{dayjs(record.created_at).format('YYYY-MM-DD HH:mm:ss')}</Text>
                  </div>
                  {record.paid_at && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 0 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>支付时间</Text>
                      <Text style={{ fontSize: 12 }}>{dayjs(record.paid_at).format('YYYY-MM-DD HH:mm:ss')}</Text>
                    </div>
                  )}
                </Card>
              </List.Item>
            );
          }}
        />
      ) : (
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
      )}
    </Card>
  );
};

export default OrderDetails;
