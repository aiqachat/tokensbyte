import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, Typography, Row, Col, Table, Button, Space, Statistic, Tag, Tooltip, message, Grid, theme } from 'antd';
import { SwapOutlined, HistoryOutlined, CopyOutlined, TeamOutlined, GiftOutlined, WalletOutlined, PlusOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';
import useSettingsStore from '../../store/settings';
import useAuthStore from '../../store/auth';
import type { WalletStats, RechargeRecord } from '../../types';
import dayjs from 'dayjs';

import RechargeModal from './RechargeModal';

const { Title, Text } = Typography;
const { useBreakpoint } = Grid;
const { useToken } = theme;

const Wallet: React.FC = () => {
  const { t } = useTranslation();
  const { settings } = useSettingsStore();
  const { user } = useAuthStore();
  const screens = useBreakpoint();
  const { token } = useToken();
  
  const currencySymbol = settings?.currency?.currency_symbol || '$';
  const currencyUnit = settings?.currency?.currency_unit || '元';
  
  const cardBg = token.colorBgContainer;
  const cardBorder = `1px solid ${token.colorBorderSecondary}`;
  const subText = token.colorTextSecondary;
  const mainText = token.colorText;
  const primaryBlue = token.colorPrimary;
  const giftColor = token.colorWarning;
  const successColor = token.colorSuccess;
  
  const [rechargeModalVisible, setRechargeModalVisible] = useState(false);
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

  const copyInviteLink = () => {
    const link = `${window.location.origin}/register?aff=${user?.uid}`;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(link).then(() => {
          message.success('邀请链接已复制到剪贴板');
        }).catch(() => {
          throw new Error('Clipboard write failed');
        });
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = link;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
          document.execCommand('copy');
          message.success('邀请链接已复制到剪贴板');
        } finally {
          textArea.remove();
        }
      }
    } catch (e) {
      console.error('Failed to copy text: ', e);
      message.error('复制失败，请手动选择复制');
    }
  };

  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    fetchData();
  }, []);

  // Stripe/支付宝跳转回来后，检测 URL 参数并提示
  useEffect(() => {
    const payment = searchParams.get('payment');
    if (payment === 'success') {
      message.success('支付已完成，余额稍后到账');
      // 清除 URL 参数，避免刷新重复提示
      setSearchParams({}, { replace: true });
      // 延迟刷新数据，等待 webhook 处理
      const timer = setTimeout(() => fetchData(), 3000);
      return () => clearTimeout(timer);
    } else if (payment === 'cancelled') {
      message.info('支付已取消');
      setSearchParams({}, { replace: true });
    }
  }, [searchParams]);

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
        <Text style={{ color: amount > 0 ? successColor : token.colorError, fontWeight: 500 }}>
          {amount > 0 ? '+' : '-'}{currencySymbol}{Math.abs(amount).toFixed(2)}
        </Text>
      ),
    },
    {
      title: t('wallet.remark'),
      dataIndex: 'remark',
      key: 'remark',
      render: (text: string) => <Text style={{ color: mainText }}>{text || '-'}</Text>,
    },
    {
      title: t('wallet.time'),
      dataIndex: 'created_at',
      key: 'created_at',
      render: (text: string) => <Text style={{ color: subText }}>{dayjs(text).format('YYYY/MM/DD HH:mm:ss')}</Text>,
    },
  ];

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: screens.md ? '32px 0' : '16px 0' }}>
      {/* Header Area */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0, fontWeight: 600, color: mainText, letterSpacing: '-0.5px' }}>
          钱包与账户
        </Title>
        <Button 
          type="primary" 
          icon={<PlusOutlined />}
          style={{ borderRadius: 6, padding: '0 20px', height: 38, fontWeight: 500, boxShadow: 'none' }}
          onClick={() => setRechargeModalVisible(true)}
        >
          在线充值
        </Button>
      </div>

      {/* Main Balances */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={(stats?.gift_balance ?? 0) > 0 ? 12 : 24}>
          <Card 
            style={{ borderRadius: 12, height: '100%', border: cardBorder, background: cardBg }}
            styles={{ body: { padding: '24px' } }}
            bordered={false}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <WalletOutlined style={{ color: primaryBlue, fontSize: 16 }} />
              <Text style={{ color: subText, fontSize: 14, fontWeight: 500 }}>系统主余额</Text>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontSize: 32, fontWeight: 600, color: mainText, lineHeight: 1, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                {stats?.balance.toFixed(4) || '0.0000'}
              </span>
              <span style={{ fontSize: 14, color: subText, fontWeight: 500 }}>{currencyUnit}</span>
            </div>
          </Card>
        </Col>

        {(stats?.gift_balance ?? 0) > 0 && (
          <Col xs={24} md={12}>
            <Card 
              style={{ borderRadius: 12, height: '100%', border: cardBorder, background: cardBg }}
              styles={{ body: { padding: '24px' } }}
              bordered={false}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <GiftOutlined style={{ color: giftColor, fontSize: 16 }} />
                  <Text style={{ color: subText, fontSize: 14, fontWeight: 500 }}>赠送金余额</Text>
                </div>
                <Tag color="processing" bordered={false} style={{ margin: 0, borderRadius: 4, fontSize: 12 }}>优先扣除</Tag>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{ fontSize: 32, fontWeight: 600, color: mainText, lineHeight: 1, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                  {stats?.gift_balance.toFixed(4) || '0.0000'}
                </span>
                <span style={{ fontSize: 14, color: subText, fontWeight: 500 }}>{currencyUnit}</span>
              </div>
            </Card>
          </Col>
        )}
      </Row>



      {/* Affiliate Banner */}
      {stats?.marketing_enabled && (
        <Card 
          style={{ borderRadius: 12, border: cardBorder, background: cardBg, marginBottom: 32 }}
          styles={{ body: { padding: '20px 24px' } }}
          bordered={false}
        >
          <Row align="middle" justify="space-between" gutter={[24, 24]}>
            <Col xs={24} md={12}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: token.colorSuccessBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <CopyOutlined style={{ color: successColor, fontSize: 20 }} />
                </div>
                <div>
                  <Text style={{ fontSize: 15, fontWeight: 600, color: mainText, display: 'block', marginBottom: 2 }}>邀请好友获返利</Text>
                  <Text style={{ fontSize: 13, color: subText }}>分享专属链接，用户充值后您将获得 <strong style={{ color: successColor }}>{Math.round((stats?.commission_ratio || 0) * 100)}%</strong> 的充值奖励金</Text>
                </div>
              </div>
            </Col>
            <Col xs={24} md={12}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <div style={{ 
                  flex: 1,
                  background: token.colorBgLayout, 
                  padding: '8px 16px', 
                  borderRadius: 6, 
                  border: cardBorder,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <Text ellipsis style={{ color: subText, fontSize: 13, fontFamily: 'monospace' }}>
                    {window.location.origin}/register?aff={user?.uid}
                  </Text>
                  <Tooltip title="复制链接">
                    <Button type="text" icon={<CopyOutlined />} onClick={copyInviteLink} style={{ color: subText, margin: '-4px -8px -4px 0' }} />
                  </Tooltip>
                </div>
                <div style={{ paddingLeft: 16, borderLeft: cardBorder, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <Text style={{ color: subText, fontSize: 12, marginBottom: 2 }}>已邀请</Text>
                  <Text style={{ color: mainText, fontSize: 16, fontWeight: 600, fontFamily: 'system-ui, -apple-system, sans-serif' }}>{stats?.total_referred || 0} <span style={{ fontSize: 12, color: subText, fontWeight: 400 }}>人</span></Text>
                </div>
              </div>
            </Col>
          </Row>
        </Card>
      )}

      {/* Recharge Records */}
      <div style={{ marginTop: 32 }}>
        <Title level={5} style={{ color: mainText, fontWeight: 600, marginBottom: 16 }}>
          {t('wallet.recharge_records')}
        </Title>
        <Card
          style={{
            borderRadius: 12,
            background: cardBg,
            border: cardBorder,
            overflow: 'hidden'
          }}
          styles={{ body: { padding: 0 } }}
          bordered={false}
        >
          <Table
            dataSource={records}
            columns={columns}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 10, showSizeChanger: true }}
            size="middle"
            scroll={{ x: 'max-content' }}
            style={{ margin: 0 }}
          />
        </Card>
      </div>

      {/* Recharge Modal */}
      <RechargeModal 
        visible={rechargeModalVisible}
        onCancel={() => setRechargeModalVisible(false)}
        onSuccess={() => {
          setRechargeModalVisible(false);
          fetchData();
        }}
      />
    </div>
  );
};

export default Wallet;
