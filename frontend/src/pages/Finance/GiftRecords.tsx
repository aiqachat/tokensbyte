/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Table, Card, Typography, Space, Input, Button, Tag, DatePicker, Grid, List } from 'antd';
import { SyncOutlined, SearchOutlined, GiftOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';
import useSettingsStore from '../../store/settings';
import { formatApiDateTime } from '../../utils/timedisplay';
import { toTimeRangeParams } from '../../utils/dateRangeParams';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

interface GiftRecord {
  id: number;
  user_id: string;
  username: string;
  uid: string;
  amount: number;
  recharge_type: string;
  remark: string | null;
  operator: string | null;
  created_at: string;
  referrer_uid?: string;
  referrer_username?: string;
}

const GiftRecords: React.FC = () => {
  const { t } = useTranslation();
  const screens = Grid.useBreakpoint();
  const { settings } = useSettingsStore();
  const currencySymbol = settings?.currency?.currency_symbol || '$';
  const [data, setData] = useState<GiftRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [search, setSearch] = useState('');
  const [referrerSearch, setReferrerSearch] = useState('');
  const [totalAmount, setTotalAmount] = useState<number>(0);
  const [dateRange, setDateRange] = useState<[string, string] | undefined>([
    dayjs().startOf('month').format('YYYY-MM-DD'),
    dayjs().endOf('month').format('YYYY-MM-DD')
  ]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await (request.get('/finance/recharges', {
        params: {
          page,
          per_page: pageSize,
          user_id: search || undefined,
          referrer: referrerSearch || undefined,
          wallet_type: 'gift',
          ...toTimeRangeParams(dateRange),
        }
      }) as unknown as Promise<{ data: GiftRecord[]; total: number; total_amount: number }>);
      setData(resp.data);
      setTotal(resp.total);
      setTotalAmount(resp.total_amount || 0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, referrerSearch, dateRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const columns = [
    {
      title: t('logs.time'),
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (text: string) => formatApiDateTime(text),
    },
    {
      title: t('finance.user_info'),
      key: 'user',
      render: (record: GiftRecord) => (
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
        <Text strong style={{ color: val >= 0 ? '#faad14' : '#ff4d4f' }}>
          {val >= 0 ? '+' : '-'}{currencySymbol}{Math.abs(val).toFixed(6)}
        </Text>
      ),
    },
    {
      title: '类型',
      dataIndex: 'recharge_type',
      key: 'recharge_type',
      render: (type: string) => {
        const label = t(`finance.recharge_type_${type}`) || t('finance.recharge_type_other');
        return <Tag color="gold">🎁 {label}</Tag>;
      },
    },
    {
      title: '用户推荐人',
      key: 'referrer',
      render: (record: GiftRecord) => {
        if (!record.referrer_uid) return '-';
        return (
          <Space direction="vertical" size={0}>
            <Text strong>{record.referrer_username}</Text>
            <Text type="secondary" style={{ fontSize: '12px' }}>UID: {record.referrer_uid}</Text>
          </Space>
        );
      },
    },
    {
      title: t('finance.remark'),
      dataIndex: 'remark',
      key: 'remark',
      render: (text: string) => text || '-',
    },
    {
      title: t('finance.operator'),
      dataIndex: 'operator',
      key: 'operator',
      render: (text: string) => text || '-',
    },
  ];

  return (
    <Card bordered={false}>
      <div style={{ display: 'flex', flexDirection: screens.xs ? 'column' : 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 12, alignItems: screens.xs ? 'flex-start' : 'center', gap: 16 }}>
        <Space size="small" align="center" wrap>
          <GiftOutlined style={{ fontSize: 24, color: '#faad14' }} />
          <Title level={2} style={{ margin: 0, fontSize: screens.xs ? 20 : 24 }}>{t('finance.gift_records_title')}</Title>
          <Text type="secondary" style={{ marginLeft: screens.xs ? 0 : 8 }}>
            赠送金合计: <Text strong style={{ color: '#faad14', fontSize: 16 }}>{currencySymbol}{totalAmount.toFixed(6)}</Text>
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
          <Input
            placeholder="搜索 用户名 / UID"
            prefix={<SearchOutlined />}
            value={search}
            onChange={e => setSearch(e.target.value)}
            onPressEnter={fetchData}
            style={{ width: 180 }}
          />
          <Input
            placeholder="搜索推荐人 用户名/UID"
            prefix={<SearchOutlined />}
            value={referrerSearch}
            onChange={e => setReferrerSearch(e.target.value)}
            onPressEnter={fetchData}
            style={{ width: 180 }}
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
            size: 'small'
          }}
          renderItem={(record) => (
            <List.Item style={{ padding: '0 0 8px 0', border: 'none' }}>
              <Card
                size="small"
                style={{ width: '100%', borderRadius: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
                title={<Text strong>{record.username}</Text>}
                extra={<Tag color="gold">🎁 {t(`finance.recharge_type_${record.recharge_type}`) || t('finance.recharge_type_other')}</Tag>}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>UID</Text>
                  <Text style={{ fontSize: 12 }}>{record.uid}</Text>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>金额</Text>
                  <Text strong style={{ color: record.amount >= 0 ? '#faad14' : '#ff4d4f' }}>
                    {record.amount >= 0 ? '+' : '-'}{currencySymbol}{Math.abs(record.amount).toFixed(6)}
                  </Text>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>时间</Text>
                  <Text style={{ fontSize: 12 }}>{formatApiDateTime(record.created_at)}</Text>
                </div>
                {record.referrer_uid && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, alignItems: 'center' }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>用户推荐人</Text>
                  <Space direction="vertical" size={0} align="end">
                    <Text strong style={{ fontSize: 12 }}>{record.referrer_username}</Text>
                    <Text type="secondary" style={{ fontSize: 10 }}>UID: {record.referrer_uid}</Text>
                  </Space>
                </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>备注</Text>
                  <Text style={{ fontSize: 12, wordBreak: 'break-all', maxWidth: '60%', textAlign: 'right' }}>{record.remark || '-'}</Text>
                </div>
                {record.operator && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 0 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>操作人</Text>
                  <Text style={{ fontSize: 12 }}>{record.operator}</Text>
                </div>
                )}
              </Card>
            </List.Item>
          )}
        />
      ) : (
        <Table
          dataSource={data}
          columns={columns}
          rowKey="id"
          className="compact-table"
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
          size="small"
          scroll={{ x: 'max-content' }}
        />
      )}
    </Card>
  );
};

export default GiftRecords;
