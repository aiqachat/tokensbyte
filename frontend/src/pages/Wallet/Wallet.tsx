import React, { useEffect, useState } from 'react';
import { Card, Typography, Row, Col, Table, Button, Space, Statistic, Tag, Tooltip, message } from 'antd';
import { SwapOutlined, HistoryOutlined, CopyOutlined, TeamOutlined, GiftOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';
import useSettingsStore from '../../store/settings';
import useAuthStore from '../../store/auth';
import type { WalletStats, RechargeRecord } from '../../types';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const Wallet: React.FC = () => {
  const { t } = useTranslation();
  const { settings } = useSettingsStore();
  const { user } = useAuthStore();
  const currencySymbol = settings?.currency?.currency_symbol || '$';
  const currencyUnit = settings?.currency?.currency_unit || '元';
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

  const handleTransfer = async () => {
    if (!stats || stats.commission_balance <= 0) return;
    try {
      await request.post('/user/affiliate/transfer', {});
      message.success('奖励金已成功转入主余额');
      fetchData();
    } catch (e: any) {
      message.error(e.response?.data?.message || '转账失败');
    }
  };

  const copyInviteLink = () => {
    const link = `${window.location.origin}/register?aff=${user?.uid}`;
    navigator.clipboard.writeText(link);
    message.success('邀请链接已复制到剪贴板');
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
          {amount > 0 ? '+' : '-'}{currencySymbol}{Math.abs(amount).toFixed(2)}
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
              {currencySymbol}{stats?.balance.toFixed(6) || '0.000000'}
            </Title>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: '18px' }}>{currencyUnit}</Text>
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

      <Row gutter={24}>
        <Col xs={24} md={12}>
          {/* Reward Balance Card */}
          <Card 
            style={{ 
              marginBottom: 24, 
              borderRadius: 16, 
              background: 'linear-gradient(135deg, #722ed1 0%, #391085 100%)', 
              border: 'none',
              boxShadow: '0 8px 24px rgba(114, 46, 209, 0.25)'
            }}
            bodyStyle={{ padding: '24px' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <Statistic 
                  title={<span style={{ color: 'rgba(255,255,255,0.65)' }}>奖励余额 (不可直接消费)</span>} 
                  value={stats?.commission_balance || 0} 
                  precision={2}
                  valueStyle={{ color: '#fff', fontSize: '32px', fontWeight: 'bold' }}
                  prefix={currencySymbol}
                />
              </div>
              <Button 
                type="primary" 
                icon={<SwapOutlined />} 
                style={{ background: '#52c41a', borderColor: '#52c41a', borderRadius: 8 }}
                onClick={handleTransfer}
                disabled={!stats || stats.commission_balance <= 0}
              >
                转入主余额
              </Button>
            </div>
            <Divider style={{ borderColor: 'rgba(255,255,255,0.1)', margin: '16px 0' }} />
            <Row>
              <Col span={12}>
                <Statistic 
                  title={<span style={{ color: 'rgba(255,255,255,0.65)' }}>累计邀请人数</span>} 
                  value={stats?.total_referred || 0} 
                  valueStyle={{ color: '#fff', fontSize: '18px' }}
                  prefix={<TeamOutlined />}
                />
              </Col>
            </Row>
          </Card>
        </Col>

        <Col xs={24} md={12}>
          {/* Invite Link Card */}
          <Card 
            title={<Space><GiftOutlined /><span>邀请获返利</span></Space>}
            style={{ 
              marginBottom: 24, 
              borderRadius: 16, 
              background: '#1d1d1d', 
              border: '1px solid #303030',
              height: 'calc(100% - 24px)'
            }}
            headStyle={{ borderBottom: '1px solid #303030', color: '#fff' }}
          >
            <div style={{ marginBottom: 16 }}>
              <Text style={{ color: 'rgba(255,255,255,0.65)' }}>
                分享您的专属链接，被邀请用户充值后，您将获得对应比例的奖励金余额。
              </Text>
            </div>
            <div style={{ 
              background: '#000', 
              padding: '12px 16px', 
              borderRadius: 8, 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              border: '1px dashed #434343'
            }}>
              <Text ellipsis style={{ color: '#fff', width: '80%' }}>
                {window.location.origin}/register?aff={user?.uid}
              </Text>
              <Tooltip title="复制链接">
                <Button 
                  type="text" 
                  icon={<CopyOutlined style={{ color: '#1677ff' }} />} 
                  onClick={copyInviteLink}
                />
              </Tooltip>
            </div>
          </Card>
        </Col>
      </Row>

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
