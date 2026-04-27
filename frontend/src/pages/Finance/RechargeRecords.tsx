import React, { useCallback, useEffect, useState } from 'react';
import { Table, Card, Typography, Space, Input, Button, Tag, Select, DatePicker, Grid, List } from 'antd';
import { SyncOutlined, SearchOutlined, WalletOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';
import useSettingsStore from '../../store/settings';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { Option } = Select;

interface RechargeRecord {
  id: number;
  user_id: string;
  username: string;
  uid: string;
  amount: number;
  recharge_type: string;
  remark: string | null;
  created_at: string;
}

const RechargeRecords: React.FC = () => {
  const { t } = useTranslation();
  const screens = Grid.useBreakpoint();
  const { settings } = useSettingsStore();
  const currencySymbol = settings?.currency?.currency_symbol || '$';
  const [data, setData] = useState<RechargeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [search, setSearch] = useState('');
  const [rechargeTypes, setRechargeTypes] = useState<string[]>([]);
  const [selectedType, setSelectedType] = useState<string | undefined>();
  const [totalAmount, setTotalAmount] = useState<number>(0);
  const [dateRange, setDateRange] = useState<[string, string] | undefined>([
    dayjs().startOf('month').format('YYYY-MM-DD'),
    dayjs().endOf('month').format('YYYY-MM-DD')
  ]);

  useEffect(() => {
    const init = async () => {
      try {
        const resp = await request.get('/finance/recharge_types');
        setRechargeTypes((resp as any) || []);
      } catch(e) {
        console.error(e);
      }
    };
    init();
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await (request.get('/finance/recharges', {
        params: {
          page,
          per_page: pageSize,
          user_id: search || undefined,
          recharge_type: selectedType || undefined,
          start_time: dateRange?.[0] || undefined,
          end_time: dateRange?.[1] ? dateRange[1] + ' 23:59:59' : undefined,
        }
      }) as unknown as Promise<{ data: RechargeRecord[]; total: number; total_amount: number }>);
      setData(resp.data);
      setTotal(resp.total);
      setTotalAmount(resp.total_amount || 0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, selectedType, dateRange]);

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
      title: t('finance.recharge_type'),
      dataIndex: 'recharge_type',
      key: 'recharge_type',
      render: (type: string) => {
        let color = 'default';
        if (type === 'registration') color = 'magenta';
        if (type === 'manual') color = 'orange';
        if (type === 'redemption') color = 'blue';

        const label = t(`finance.recharge_type_${type}`) || t('finance.recharge_type_other');
        return <Tag color={color}>{label}</Tag>;
      },
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
        <Space size="middle" align="baseline">
            <WalletOutlined style={{ fontSize: '24px', color: '#1677ff' }} />
            <Title level={2} style={{ margin: 0 }}>{t('finance.recharge_title')}</Title>
            <Text type="secondary" style={{ marginLeft: 8 }}>
              金额合计: <Text strong style={{ color: '#1677ff', fontSize: 16 }}>{currencySymbol}{totalAmount.toFixed(2)}</Text>
            </Text>
        </Space>
        <Space>
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
            placeholder="按类型筛选"
            allowClear
            value={selectedType}
            onChange={setSelectedType}
            style={{ width: 140 }}
          >
            {rechargeTypes.map(rt => (
              <Option key={rt} value={rt}>{t(`finance.recharge_type_${rt}`) || rt}</Option>
            ))}
          </Select>
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
            pageSizeOptions: ['50', '100', '200'],
            onChange: (p, s) => {
              setPage(p);
              setPageSize(s);
            },
            showSizeChanger: true,
            size: "small"
          }}
          renderItem={(record) => {
            let color = 'default';
            if (record.recharge_type === 'registration') color = 'magenta';
            if (record.recharge_type === 'manual') color = 'orange';
            if (record.recharge_type === 'redemption') color = 'blue';
            const label = t(`finance.recharge_type_${record.recharge_type}`) || t('finance.recharge_type_other');

            return (
              <List.Item style={{ padding: '0 0 16px 0', border: 'none' }}>
                <Card 
                  size="small" 
                  style={{ width: '100%', borderRadius: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
                  title={<Text strong>{record.username}</Text>}
                  extra={<Tag color={color}>{label}</Tag>}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>UID</Text>
                    <Text style={{ fontSize: 12 }}>{record.uid}</Text>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>金额</Text>
                    <Text strong style={{ color: record.amount >= 0 ? '#52c41a' : '#ff4d4f' }}>
                      {record.amount >= 0 ? '+' : '-'}{currencySymbol}{Math.abs(record.amount).toFixed(2)}
                    </Text>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>时间</Text>
                    <Text style={{ fontSize: 12 }}>{dayjs(record.created_at).format('YYYY-MM-DD HH:mm:ss')}</Text>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 0 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>备注</Text>
                    <Text style={{ fontSize: 12, wordBreak: 'break-all', maxWidth: '60%', textAlign: 'right' }}>{record.remark || '-'}</Text>
                  </div>
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
          pageSizeOptions: ['50', '100', '200'],
          onChange: (p, s) => {
            setPage(p);
            setPageSize(s);
          },
          showSizeChanger: true,
        }}
        size="middle"
        scroll={{ x: 'max-content' }}
      />
      )}
    </Card>
  );
};

export default RechargeRecords;
