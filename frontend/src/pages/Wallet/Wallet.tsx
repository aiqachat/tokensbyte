import React, { useEffect, useState } from 'react';
import { Card, Typography, Row, Col, Table, Button, Space, Statistic, Tag } from 'antd';
import { WalletOutlined, ShoppingCartOutlined, SwapOutlined, CheckCircleOutlined, HistoryOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';
import type { WalletStats, RechargeRecord } from '../../types';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const Wallet: React.FC = () => {
  const { t } = useTranslation();
  const [stats, setStats] = useState<WalletStats | null>(null);
  const [records, setRecords] = useState<RechargeRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const statsResp = await (request.get('/user/wallet') as unknown as Promise<WalletStats>);
      setStats(statsResp);
      
      const recordsResp = await (request.get('/user/recharge_records') as unknown as Promise<RechargeRecord[]>);
      setRecords(recordsResp);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 80,
    },
    {
      title: t('wallet.amount'),
      dataIndex: 'amount',
      key: 'amount',
      render: (amount: number) => (
        <Text style={{ color: amount > 0 ? '#52c41a' : '#ff4d4f', fontWeight: 'bold' }}>
          {amount > 0 ? `+${amount.toFixed(2)}` : amount.toFixed(2)}
        </Text>
      ),
    },
    {
      title: t('wallet.remark'),
      dataIndex: 'remark',
      key: 'remark',
      render: (text: string) => text || '-',
    },
    {
      title: t('wallet.time'),
      dataIndex: 'created_at',
      key: 'created_at',
      render: (text: string) => dayjs(text).format('YYYY/MM/DD HH:mm:ss'),
    },
  ];

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Wallet Balance Card */}
      <Card 
        style={{ 
          marginBottom: 24, 
          borderRadius: 16, 
          background: 'linear-gradient(135deg, #1677ff 0%, #003eb3 100%)', 
          border: 'none',
          boxShadow: '0 8px 24px rgba(22, 119, 255, 0.25)'
        }}
        bodyStyle={{ padding: '32px' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <Title level={1} style={{ margin: 0, color: '#fff', fontSize: '48px' }}>
              {stats?.balance.toFixed(6) || '0.000000'}
            </Title>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: '18px' }}>{t('common.currency_unit') || '元'}</Text>
          </div>
          <Button 
            type="default" 
            ghost 
            icon={<SwapOutlined />} 
            size="large"
            style={{ borderRadius: 8, borderColor: 'rgba(255,255,255,0.65)', color: '#fff' }}
            onClick={() => window.location.href = '/redemptions'} // Or open modal
          >
            {t('wallet.recharge')}
          </Button>
        </div>

        <Divider style={{ borderColor: 'rgba(255,255,255,0.1)', margin: '24px 0' }} />

        <Row gutter={32}>
          <Col xs={8}>
            <Statistic 
              title={<span style={{ color: 'rgba(255,255,255,0.65)' }}>{t('wallet.total_consumption')}</span>} 
              value={stats?.total_consumption || 0} 
              precision={6}
              valueStyle={{ color: '#fff', fontSize: '20px' }}
            />
          </Col>
          <Col xs={8}>
            <Statistic 
              title={<span style={{ color: 'rgba(255,255,255,0.65)' }}>{t('wallet.total_calls')}</span>} 
              value={stats?.total_calls || 0} 
              valueStyle={{ color: '#fff', fontSize: '20px' }}
            />
          </Col>
          <Col xs={8}>
            <Statistic 
              title={<span style={{ color: 'rgba(255,255,255,0.65)' }}>{t('wallet.success_calls')}</span>} 
              value={stats?.success_calls || 0} 
              valueStyle={{ color: '#fff', fontSize: '20px' }}
            />
          </Col>
        </Row>
      </Card>

      {/* Recharge Records */}
      <Card 
        title={<Space><HistoryOutlined /><span>{t('wallet.recharge_records')}</span></Space>}
        style={{ 
          borderRadius: 16, 
          background: '#141414', 
          border: '1px solid #303030' 
        }}
        headStyle={{ borderBottom: '1px solid #303030', color: '#fff' }}
      >
        <Table
          dataSource={records}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10, showSizeChanger: true }}
          size="middle"
          scroll={{ x: 'max-content' }}
        />
      </Card>
    </div>
  );
};

const Divider = ({ style }: { style?: React.CSSProperties }) => (
  <div style={{ height: '1px', width: '100%', borderTop: '1px solid #303030', margin: '16px 0', ...style }} />
);

export default Wallet;
