import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, Typography, Row, Col, Table, Button, Space, Statistic, Tag, Tooltip, message, Grid, theme, Tabs, Input } from 'antd';
import { SwapOutlined, HistoryOutlined, CopyOutlined, TeamOutlined, GiftOutlined, WalletOutlined, PlusOutlined, TagOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';
import useSettingsStore from '../../store/settings';
import useAuthStore from '../../store/auth';
import { useThemeStore } from '../../store/theme';
import type { WalletStats, RechargeRecord } from '../../types';
import dayjs from 'dayjs';

import RechargeModal from './RechargeModal';

const { Title, Text } = Typography;
const { useBreakpoint } = Grid;
const { useToken } = theme;

const Wallet: React.FC = () => {
  const { t, i18n } = useTranslation();
  const isEn = i18n.language === 'en';
  const { settings } = useSettingsStore();
  const { user } = useAuthStore();
  const screens = useBreakpoint();
  
  const currencySymbol = settings?.currency?.currency_symbol || '$';
  const currencyUnit = settings?.currency?.currency_unit || '元';
  
  const { themeMode } = useThemeStore();
  const isLight = themeMode === 'light';
  
  const subText = isLight ? '#71717a' : '#a1a1aa'; // text-muted-foreground
  const mainText = isLight ? '#09090b' : '#fafafa'; // text-foreground
  const cardBg = isLight ? '#ffffff' : '#09090b';
  const statCardBg = isLight ? '#ffffff' : '#141414';
  const cardBorder = `1px solid ${isLight ? '#e4e4e7' : '#27272a'}`;
  const neutralBg = isLight ? '#f4f4f5' : '#27272a'; // background-muted

  const [rechargeModalVisible, setRechargeModalVisible] = useState(false);
  const [stats, setStats] = useState<WalletStats | null>(null);
  const [records, setRecords] = useState<RechargeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [availableModels, setAvailableModels] = useState<any[]>([]);
  const [redeemCode, setRedeemCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [redeemCooldown, setRedeemCooldown] = useState(0);
  const [redeemFeedback, setRedeemFeedback] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);
  const redeemLockRef = React.useRef(false);

  const redemptionEnabled = !!settings?.marketing?.enable_redemption;

  const fetchData = async () => {
    setLoading(true);
    try {
      const modelsResp = await (request.get('/models') as unknown as Promise<any>);
      if (modelsResp?.data) {
        setAvailableModels(modelsResp.data);
      }
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
          message.success(t('wallet.copy_invite_link_success'));
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
        document.execCommand('copy');
        message.success(t('wallet.copy_invite_link_success'));
        textArea.remove();
      }
    } catch (e) {
      console.error('Failed to copy text: ', e);
      message.error(t('wallet.copy_failed'));
    }
  };

  const handleRedeem = async () => {
    if (redeemLockRef.current || redeeming || redeemCooldown > 0) return;

    const code = redeemCode.trim();
    if (!code) {
      setRedeemFeedback({
        type: 'warning',
        text: isEn ? 'Please enter a redemption code' : '请输入兑换码',
      });
      return;
    }

    redeemLockRef.current = true;
    setRedeeming(true);
    setRedeemFeedback(null);
    try {
      const res = await (request.post('/redemptions/redeem', { code }, {
        skipErrorHandler: true,
      } as any) as any);
      if (res?.success) {
        const amount = Number(res.quota_added || 0);
        setRedeemFeedback({
          type: 'success',
          text: isEn
            ? `Redeemed successfully (+${currencySymbol}${amount.toFixed(6)})`
            : `兑换成功，已充值 ${currencySymbol}${amount.toFixed(6)}`,
        });
        setRedeemCode('');
        fetchData();
      }
    } catch (e: any) {
      const data = e?.response?.data;
      let serverMsg =
        data?.error?.message ||
        data?.message ||
        (typeof data?.error === 'string' ? data.error : undefined) ||
        (typeof data === 'string' ? data : undefined);
      if (serverMsg === 'Invalid or already used redemption code') {
        serverMsg = isEn ? 'Invalid or already used redemption code' : '兑换码无效或已被使用';
      }
      setRedeemFeedback({
        type: 'error',
        text: serverMsg || (isEn ? 'Redemption failed' : '兑换失败，请稍后重试'),
      });
    } finally {
      setRedeeming(false);
      setRedeemCooldown(3);
      setTimeout(() => {
        redeemLockRef.current = false;
      }, 300);
    }
  };

  useEffect(() => {
    if (redeemCooldown <= 0) return;
    const timer = setTimeout(() => setRedeemCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [redeemCooldown]);

  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const payment = searchParams.get('payment');
    if (payment === 'success') {
      message.success(t('wallet.payment_success'));
      setSearchParams({}, { replace: true });
      const timer = setTimeout(() => fetchData(), 3000);
      return () => clearTimeout(timer);
    } else if (payment === 'cancelled') {
      message.info(t('wallet.payment_cancelled'));
      setSearchParams({}, { replace: true });
    }
  }, [searchParams]);

  const columns: any[] = [
    {
      title: t('wallet.time'),
      dataIndex: 'created_at',
      key: 'created_at',
      align: 'left' as const,
      render: (text: string) => <Text style={{ color: subText }}>{dayjs(text).format('YYYY/MM/DD HH:mm:ss')}</Text>,
    },
    {
      title: t('wallet.amount', { defaultValue: `金额 (${currencyUnit})`, unit: currencyUnit }),
      dataIndex: 'amount',
      key: 'amount',
      align: 'right' as const,
      filters: [
        { text: isEn ? 'Increase' : '增加', value: 'positive' },
        { text: isEn ? 'Decrease' : '扣除', value: 'negative' },
      ],
      onFilter: (value: string | number | boolean, record: RechargeRecord) => {
        if (value === 'positive') return record.amount > 0;
        if (value === 'negative') return record.amount < 0;
        return true;
      },
      render: (amount: number) => (
        <Text style={{ color: mainText, fontWeight: 500 }}>
          {amount > 0 ? '+' : '-'}{currencySymbol}{Math.abs(amount).toFixed(6)}
        </Text>
      ),
    },
    {
      title: isEn ? 'Type' : '资金类型',
      dataIndex: 'recharge_type',
      key: 'recharge_type',
      align: 'center' as const,
      filters: [
        { text: isEn ? 'Manual' : '手动操作', value: 'manual' },
        { text: isEn ? 'Gift' : '赠送金', value: 'gift' },
        { text: isEn ? 'Registration' : '注册赠送', value: 'registration' },
        { text: isEn ? 'Commission' : '邀请返佣', value: 'commission' },
        { text: isEn ? 'Alipay' : '支付宝', value: 'alipay' },
        { text: isEn ? 'WeChat' : '微信', value: 'wechat' },
        { text: isEn ? 'Redemption' : '兑换码', value: 'redemption' },
      ],
      onFilter: (value: string | number | boolean, record: RechargeRecord) => record.recharge_type === value,
      render: (type: string, record: RechargeRecord) => {
        let manualText = isEn ? 'Manual' : '手动';
        if (type === 'manual' && record.wallet_type === 'credit') {
          manualText = isEn ? 'Credit Manual' : '信控手动';
        }
        
        const textMap: Record<string, string> = {
          manual: manualText,
          gift: isEn ? 'Gift' : '赠送',
          registration: isEn ? 'Registration' : '注册',
          commission: isEn ? 'Commission' : '返佣',
          alipay: isEn ? 'Alipay' : '支付宝',
          wechat: isEn ? 'WeChat' : '微信',
          allinpay_wechat: isEn ? 'Allinpay WeChat' : '通联微信',
          'allinpay wechat': isEn ? 'Allinpay WeChat' : '通联微信',
          allinpay_alipay: isEn ? 'Allinpay Alipay' : '通联支付宝',
          'allinpay alipay': isEn ? 'Allinpay Alipay' : '通联支付宝',
          stripe: 'Stripe',
          bonuspay: 'BonusPay',
          hyperbc: 'HyperBC',
          redemption: isEn ? 'Redemption' : '兑换码',
          other: isEn ? 'Other' : '其它'
        };
        const colorMap: Record<string, string> = {
          manual: 'blue',
          gift: 'cyan',
          registration: 'purple',
          commission: 'gold',
          alipay: 'blue',
          wechat: 'green',
          allinpay_wechat: 'green',
          'allinpay wechat': 'green',
          allinpay_alipay: 'blue',
          'allinpay alipay': 'blue',
          stripe: 'purple',
          bonuspay: 'geekblue',
          hyperbc: 'purple',
          redemption: 'orange',
          other: 'default'
        };
        return <Tag color={colorMap[type] || 'default'} bordered={false} style={{ margin: 0 }}>{textMap[type] || type}</Tag>;
      }
    },
    {
      title: t('wallet.remark'),
      dataIndex: 'remark',
      key: 'remark',
      align: 'left' as const,
      render: (text: string) => <Text style={{ color: mainText }}>{text || '-'}</Text>,
    },
  ];

  const modelDiscounts: Record<string, number> = user?.model_discounts ? (() => { try { return JSON.parse(user.model_discounts); } catch { return {}; } })() : {};
  const discountEntries = Object.entries(modelDiscounts);

  const modelDiscountData = discountEntries.map(([mid, discount]) => {
    const model = availableModels.find((m: any) => m.mid === mid);
    const hasLimit = model?.site_discount_enabled === 1;
    const limit = hasLimit ? Number(model.site_discount || 1) : null;
    const isLimited = hasLimit && discount < limit!;
    const actualDiscount = isLimited ? limit : discount;
    return {
      mid,
      model_id: model ? model.model_id : '-',
      modelName: model ? model.name : mid,
      discount,
      limit,
      hasLimit,
      isLimited,
      actualDiscount
    };
  });

  const modelColumns = [
    {
      title: isEn ? 'Model(MID)' : '模型(MID)',
      dataIndex: 'mid',
      key: 'mid',
      render: (text: string) => <Text style={{ color: subText, fontSize: 13, fontFamily: 'monospace' }}>{text}</Text>,
    },
    {
      title: isEn ? 'Model Name' : '模型名称',
      dataIndex: 'modelName',
      key: 'modelName',
      render: (text: string) => <Text style={{ color: mainText, fontWeight: 500 }}>{text}</Text>,
    },
    {
      title: isEn ? 'Request ID' : '请求 ID',
      dataIndex: 'model_id',
      key: 'model_id',
      render: (text: string) => (
        <Text 
          copyable={!!text && text !== '-' ? { text: String(text) } : false} 
          style={{ color: subText, fontSize: 13, fontFamily: 'monospace' }}
        >
          {text || '-'}
        </Text>
      ),
    },
    {
      title: isEn ? 'Exclusive Discount' : '专享折扣',
      dataIndex: 'discount',
      key: 'discount',
      align: 'right' as const,
      render: (val: number) => (
        <Text style={{ color: mainText }}>
          {val}x
        </Text>
      ),
    },
  ];

  const totalAvailable = ((stats?.balance || 0) + (stats?.credit_limit || 0) + (stats?.gift_balance || 0)).toFixed(6);

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: screens.md ? '16px 0 40px 0' : '12px 0 24px 0' }}>
      
      {/* Header Area */}
      <div style={{ marginBottom: 32 }}>
        <Title level={2} style={{ margin: 0, fontWeight: 700, color: mainText, letterSpacing: '-0.025em' }}>
          {t('wallet.wallet_and_account')}
        </Title>
        <Text style={{ color: subText, fontSize: 15, marginTop: 4, display: 'block' }}>
          {isEn ? 'Manage your balance, top-ups, and referral rewards.' : '管理您的余额、充值记录以及邀请奖励。'}
        </Text>
      </div>

      {/* Main Balances Grid */}
      <Row gutter={[16, 16]} style={{ marginBottom: 32 }}>
        <Col xs={24} sm={12} lg={8}>
          <Card 
            style={{ borderRadius: 8, height: '100%', border: cardBorder, background: statCardBg, boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' }}
            styles={{ body: { padding: '24px' } }}
            bordered={false}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={{ color: mainText, fontSize: 14, fontWeight: 500 }}>{isEn ? 'Total Available' : '可用总额'}</Text>
              <SwapOutlined style={{ color: subText }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 32, fontWeight: 700, color: mainText, letterSpacing: '-0.025em', lineHeight: 1, wordBreak: 'break-word' }}>
                {currencySymbol}{totalAvailable}
              </div>
              {(!loading && stats?.pay_enabled !== false) && (
                <Button 
                  onClick={() => setRechargeModalVisible(true)}
                  style={{ 
                    borderRadius: 6, 
                    padding: '0 16px', 
                    height: 32, 
                    fontWeight: 500, 
                    background: isLight ? '#09090b' : '#fafafa',
                    color: isLight ? '#fafafa' : '#09090b',
                    borderColor: isLight ? '#09090b' : '#fafafa',
                    borderWidth: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    flexShrink: 0
                  }}
                >
                  <PlusOutlined /> {t('wallet.online_recharge')}
                </Button>
              )}
            </div>
            <div style={{ marginTop: 8 }}>
              <Text style={{ color: subText, fontSize: 13 }}>
                {isEn ? 'Spent: ' : '已消费: '}{currencySymbol}{(stats?.total_consumption || 0).toFixed(6)}
              </Text>
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={8}>
          <Card 
            style={{ borderRadius: 8, height: '100%', border: cardBorder, background: statCardBg, boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' }}
            styles={{ body: { padding: '24px' } }}
            bordered={false}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={{ color: mainText, fontSize: 14, fontWeight: 500 }}>{t('wallet.system_balance')}</Text>
              <WalletOutlined style={{ color: subText }} />
            </div>
            <div style={{ fontSize: 32, fontWeight: 700, color: mainText, letterSpacing: '-0.025em', lineHeight: 1 }}>
              {currencySymbol}{(stats?.balance || 0).toFixed(6)}
            </div>
            {(stats?.credit_limit || 0) > 0 && (
              <div style={{ marginTop: 8 }}>
                <Text style={{ color: subText, fontSize: 13 }}>
                  {isEn ? 'Credit limit: ' : '信控金额: '}{currencySymbol}{(stats?.credit_limit || 0).toFixed(6)}
                </Text>
              </div>
            )}
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={8}>
          <Card 
            style={{ borderRadius: 8, height: '100%', border: cardBorder, background: statCardBg, boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' }}
            styles={{ body: { padding: '24px' } }}
            bordered={false}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={{ color: mainText, fontSize: 14, fontWeight: 500 }}>{t('wallet.gift_balance')}</Text>
              <GiftOutlined style={{ color: subText }} />
            </div>
            <div style={{ fontSize: 32, fontWeight: 700, color: mainText, letterSpacing: '-0.025em', lineHeight: 1 }}>
              {currencySymbol}{(stats?.gift_balance || 0).toFixed(6)}
            </div>
            <div style={{ marginTop: 8 }}>
              <Text style={{ color: subText, fontSize: 13 }}>
                {t('wallet.priority_deduction')}
              </Text>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Affiliate Banner：紧挨余额仪表盘，避免被兑换码挤到下面不易发现 */}
      {(stats?.marketing_enabled || (stats?.commission_ratio ?? 0) > 0) && (
        <div style={{ 
          marginBottom: 32, 
          padding: '24px', 
          borderRadius: 8, 
          border: cardBorder, 
          background: cardBg,
          boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
          display: 'flex',
          flexDirection: screens.md ? 'row' : 'column',
          alignItems: screens.md ? 'center' : 'flex-start',
          justifyContent: 'space-between',
          gap: 24
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <TeamOutlined style={{ color: mainText, fontSize: 18 }} />
              <Text style={{ fontSize: 16, fontWeight: 600, color: mainText, letterSpacing: '-0.01em' }}>
                {t('wallet.invite_friends')}
              </Text>
            </div>
            <Text style={{ fontSize: 14, color: subText }}>
              <span dangerouslySetInnerHTML={{ __html: t('wallet.invite_desc', { ratio: `<strong style="color: ${mainText}">${Math.round((stats?.commission_ratio || 0) * 100)}</strong>` }) }} />
            </Text>
            <div style={{ marginTop: 12, fontSize: 14, color: subText }}>
              {isEn ? 'Invited:' : '已邀请'} <strong style={{ color: mainText }}>{stats?.total_referred || 0}</strong> {isEn ? 'people' : '人'}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: screens.md ? 'center' : 'stretch', width: screens.md ? 'auto' : '100%', flex: screens.md ? 1 : undefined, minWidth: 0, justifyContent: 'flex-end' }}>
            <div style={{ 
              background: neutralBg, 
              padding: '10px 12px', 
              borderRadius: 6, 
              border: cardBorder,
              display: 'flex',
              alignItems: 'center',
              flex: 1,
              minWidth: 0,
              maxWidth: '100%',
            }}>
              <Text
                style={{
                  color: mainText,
                  fontSize: 13,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                  wordBreak: 'break-all',
                  whiteSpace: 'normal',
                  lineHeight: 1.5,
                }}
              >
                {window.location.origin}/register?aff={user?.uid}
              </Text>
            </div>
            <Button 
              icon={<CopyOutlined />} 
              onClick={copyInviteLink} 
              style={{ height: 40, borderRadius: 6, border: cardBorder, color: mainText, background: cardBg, boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)', flexShrink: 0 }} 
            >
              {isEn ? 'Copy' : '复制'}
            </Button>
          </div>
        </div>
      )}

      {/* 兑换码：管理后台开启兑换功能后显示 */}
      {redemptionEnabled && (
        <div
          style={{
            marginBottom: 32,
            padding: '20px 24px',
            borderRadius: 8,
            border: cardBorder,
            background: cardBg,
            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <TagOutlined style={{ color: mainText, fontSize: 16 }} />
            <Text style={{ fontSize: 15, fontWeight: 600, color: mainText }}>
              {isEn ? 'Redeem Code' : '兑换码充值'}
            </Text>
            {redeemFeedback && (
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color:
                    redeemFeedback.type === 'success'
                      ? (isLight ? '#15803d' : '#4ade80')
                      : redeemFeedback.type === 'warning'
                        ? (isLight ? '#b45309' : '#fbbf24')
                        : (isLight ? '#dc2626' : '#f87171'),
                }}
              >
                {redeemFeedback.text}
              </Text>
            )}
          </div>
          <Text style={{ color: subText, fontSize: 13, display: 'block', marginBottom: 12 }}>
            {isEn
              ? 'Enter a valid redemption code to top up your wallet balance.'
              : '输入有效兑换码，即可为钱包余额充值。'}
          </Text>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', maxWidth: 520 }}>
            <Input
              value={redeemCode}
              onChange={(e) => {
                setRedeemCode(e.target.value);
                if (redeemFeedback) setRedeemFeedback(null);
              }}
              onPressEnter={handleRedeem}
              placeholder={isEn ? 'Enter redemption code' : '请输入兑换码'}
              allowClear
              status={redeemFeedback?.type === 'error' ? 'error' : undefined}
              style={{ flex: 1, minWidth: 220, height: 40, borderRadius: 6 }}
            />
            <Button
              type="primary"
              loading={redeeming}
              disabled={redeeming || redeemCooldown > 0 || !redeemCode.trim()}
              onClick={handleRedeem}
              style={{
                height: 40,
                borderRadius: 6,
                fontWeight: 500,
                background: isLight ? '#09090b' : '#fafafa',
                color: isLight ? '#fafafa' : '#09090b',
                borderWidth: 0,
                opacity: (redeeming || redeemCooldown > 0 || !redeemCode.trim()) ? 0.55 : 1,
              }}
            >
              {redeemCooldown > 0
                ? (isEn ? `Wait ${redeemCooldown}s` : `${redeemCooldown}s 后可再试`)
                : (isEn ? 'Redeem' : '立即兑换')}
            </Button>
          </div>
        </div>
      )}

      {/* Tabs for Records & Models */}
      <Tabs
        defaultActiveKey="records"
        tabBarStyle={{ borderBottom: cardBorder, marginBottom: 24 }}
        items={[
          {
            key: 'records',
            label: <span style={{ fontSize: 14, fontWeight: 500, color: mainText }}>{t('wallet.recharge_records')}</span>,
            children: (
              <div style={{ borderRadius: 8, border: cardBorder, overflow: 'hidden', background: cardBg }}>
                <Table
                  dataSource={records}
                  columns={columns}
                  rowKey="id"
                  loading={loading}
                  pagination={{ pageSize: 10, showSizeChanger: false }}
                  size="middle"
                  scroll={{ x: 'max-content' }}
                  style={{ margin: 0 }}
                />
              </div>
            )
          },
          ...(discountEntries.length > 0 ? [{
            key: 'models',
            label: <span style={{ fontSize: 14, fontWeight: 500, color: mainText }}>{isEn ? 'Discounted Models' : '优惠模型'}</span>,
            children: (
              <div style={{ borderRadius: 8, border: cardBorder, overflow: 'hidden', background: cardBg }}>
                <Table
                  dataSource={modelDiscountData}
                  columns={modelColumns}
                  rowKey="mid"
                  pagination={{ pageSize: 10, showSizeChanger: false }}
                  size="middle"
                  scroll={{ x: 'max-content' }}
                  style={{ margin: 0 }}
                />
              </div>
            )
          }] : [])
        ]}
      />

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
