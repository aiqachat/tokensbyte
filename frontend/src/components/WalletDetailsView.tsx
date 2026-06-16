import React, { useState } from 'react';
import { Card, Table, Tag, Row, Col, Statistic, DatePicker, Tabs, Spin, Typography, Radio, Button } from 'antd';
import { useTranslation } from 'react-i18next';
import { useThemeStore } from '../store/theme';
import useSettingsStore from '../store/settings';
import request from '../utils/request';
import dayjs from 'dayjs';

const { Text } = Typography;

interface WalletDetailsViewProps {
  user: {
    id?: string | number;
    user_id?: string | number;
    username?: string;
    used_quota?: number;
    gift_used_quota?: number;
    credit_limit?: number;
    balance?: number;
    gift_balance?: number;
  };
  recharges: any[];
  loading?: boolean;
  isLight?: boolean;
  currencySymbol?: string;
  /** 使用 team-marketing 专用 API 获取消费统计（用于推荐人查看推荐用户的消费数据） */
  useReferralApi?: boolean;
}

const WalletDetailsView: React.FC<WalletDetailsViewProps> = ({
  user,
  recharges = [],
  loading = false,
  isLight: customIsLight,
  currencySymbol: customCurrencySymbol,
  useReferralApi = false,
}) => {
  console.log('WalletDetailsView render debug:', { user, recharges, loading });
  const { t } = useTranslation('team_marketing');
  
  // 动态读取主题
  const { themeMode } = useThemeStore();
  const isLight = customIsLight !== undefined ? customIsLight : themeMode === 'light';

  // 动态读取币种符号
  const { settings } = useSettingsStore();
  const currencySymbol = customCurrencySymbol !== undefined ? customCurrencySymbol : (settings?.currency?.currency_symbol || '$');

  // 组件局部状态控制日期过滤，使外部完全解耦
  const [activePreset, setActivePreset] = useState<string | null>('thisMonth');
  const [filterRange, setFilterRange] = useState<any>(() => {
    const now = dayjs();
    return [now.startOf('month'), now.endOf('month')];
  });

  const [consumedSystem, setConsumedSystem] = useState<number>(0);
  const [consumedGift, setConsumedGift] = useState<number>(0);
  const [consumedLoading, setConsumedLoading] = useState<boolean>(false);

  React.useEffect(() => {
    if (!user || !user.id) return;
    
    let start_date = undefined;
    let end_date = undefined;
    if (filterRange && filterRange[0] && filterRange[1]) {
      start_date = filterRange[0].format('YYYY-MM-DD');
      end_date = filterRange[1].format('YYYY-MM-DD');
    }

    setConsumedLoading(true);

    // 推荐人查看推荐用户时，使用 team-marketing 专用 API
    if (useReferralApi) {
      const params: any = {};
      if (start_date) params.start_date = start_date;
      if (end_date) params.end_date = end_date;
      request.get(`/team-marketing/referral/${user.id}/consumption-stats`, { params }).then((res: any) => {
        setConsumedSystem(res?.total_system_cost || 0);
        setConsumedGift(res?.total_gift_cost || 0);
      }).catch(e => {
        console.error('Failed to fetch referral consumed amount', e);
        setConsumedSystem(0);
        setConsumedGift(0);
      }).finally(() => {
        setConsumedLoading(false);
      });
    } else {
      request.get('/logs', {
        params: {
          user_id: user.id,
          start_date,
          end_date,
          per_page: 1, // we just need the stats
        }
      }).then((res: any) => {
        setConsumedSystem(res?.total_system_cost || 0);
        setConsumedGift(res?.total_gift_cost || 0);
      }).catch(e => {
        console.error('Failed to fetch consumed amount', e);
        setConsumedSystem(0);
        setConsumedGift(0);
      }).finally(() => {
        setConsumedLoading(false);
      });
    }
  }, [filterRange, user.id, useReferralApi]);

  const handlePresetChange = (preset: string) => {
    setActivePreset(preset);
    const now = dayjs();
    let range: [dayjs.Dayjs, dayjs.Dayjs] | null = null;
    switch (preset) {
      case 'today':
        range = [now.startOf('day'), now.endOf('day')];
        break;
      case 'yesterday':
        const yesterday = now.subtract(1, 'day');
        range = [yesterday.startOf('day'), yesterday.endOf('day')];
        break;
      case 'thisMonth':
        range = [now.startOf('month'), now.endOf('month')];
        break;
      case 'lastMonth':
        const lastMonth = now.subtract(1, 'month');
        range = [lastMonth.startOf('month'), lastMonth.endOf('month')];
        break;
      case 'thisYear':
        range = [now.startOf('year'), now.endOf('year')];
        break;
      case 'lastHalfYear':
        range = [now.subtract(6, 'month').startOf('day'), now.endOf('day')];
        break;
      case 'lastYear':
        range = [now.subtract(1, 'year').startOf('day'), now.endOf('day')];
        break;
      case 'all':
        range = null;
        break;
      default:
        range = null;
    }
    setFilterRange(range);
  };

  const handleRangeChange = (dates: any) => {
    setFilterRange(dates);
    setActivePreset(null); // 手动调节日期时清除快捷键高亮
  };

  const filteredRecharges = recharges.filter((r: any) => {
    if (!filterRange || !filterRange[0] || !filterRange[1]) return true;
    const rDate = dayjs(r.created_at);
    return (rDate.isAfter(filterRange[0].startOf('day')) || rDate.isSame(filterRange[0], 'day')) && 
           (rDate.isBefore(filterRange[1].endOf('day')) || rDate.isSame(filterRange[1], 'day'));
  });

  const systemRecharges = filteredRecharges.filter((r: any) => (r.wallet_type || 'system') === 'system');
  const giftRecharges = filteredRecharges.filter((r: any) => (r.wallet_type || 'system') === 'gift');
  const creditRecharges = filteredRecharges.filter((r: any) => (r.wallet_type || 'system') === 'credit');

  const totalSystemRecharge = systemRecharges.reduce((sum, r) => sum + (r.amount > 0 ? r.amount : 0), 0);
  const totalGiftRecharge = giftRecharges.reduce((sum, r) => sum + (r.amount > 0 ? r.amount : 0), 0);
  const totalCreditRecharge = creditRecharges.reduce((sum, r) => sum + (r.amount > 0 ? r.amount : 0), 0);
  
  const systemUsed = user.used_quota || 0;
  const giftUsed = user.gift_used_quota || 0;
  const creditLimit = user.credit_limit || 0;

  const getFilterTextPrefix = () => {
    if (activePreset === 'today') return '当日';
    if (activePreset === 'yesterday') return '前一日';
    if (activePreset === 'thisMonth') return '当月';
    if (activePreset === 'lastMonth') return '上月';
    if (activePreset === 'thisYear') return '当年';
    if (activePreset === 'lastHalfYear') return '近半年';
    if (activePreset === 'lastYear') return '近一年';
    if (activePreset === 'all') return '全部';
    if (filterRange && filterRange[0] && filterRange[1]) return '筛选期内';
    return '累计';
  };
  const timePrefix = getFilterTextPrefix();

  const rechargeColumns = [
    { title: t('recharge_id', 'ID'), dataIndex: 'id', key: 'id', width: 60 },
    {
      title: t('amount', '金额'),
      dataIndex: 'amount',
      key: 'amount',
      render: (amount: number) => (
        <Text style={{ color: amount > 0 ? '#52c41a' : amount < 0 ? '#ff4d4f' : undefined, fontWeight: 500 }}>
          {amount > 0 ? '+' : (amount < 0 ? '-' : '')}{Math.abs(amount).toFixed(2)}
        </Text>
      ),
    },
    {
      title: t('recharge_type', '类型'),
      dataIndex: 'recharge_type',
      key: 'recharge_type',
      render: (type: string, record: any) => {
        let manualText = t('type_manual', '手动操作');
        if (type === 'manual' && record.wallet_type === 'credit') {
          manualText = t('type_manual_credit', '手动信控操作');
        }
        
        const typeMap: Record<string, string> = {
          'manual': manualText,
          'online': t('type_online', '在线支付'),
          'transfer': t('type_transfer', '佣金结转'),
          'gift': t('type_registration', '注册赠送'),
          'commission': t('type_commission', '佣金奖励'),
          'registration': t('type_registration', '注册赠送'),
          'alipay': t('type_alipay', '支付宝'),
          'wechat': t('type_wechat', '微信支付'),
          'redemption': t('type_redemption', '兑换码'),
        };
        return <Tag>{typeMap[type] || type}</Tag>;
      },
    },
    {
      title: t('remark', '备注'),
      dataIndex: 'remark',
      key: 'remark',
      render: (text: string) => text || '-',
    },
    {
      title: t('operator', '操作人'),
      dataIndex: 'operator',
      key: 'operator',
      render: (text: string) => text || '-',
    },
    {
      title: t('time', '时间'),
      dataIndex: 'created_at',
      key: 'created_at',
      render: (tVal: string) => <Text style={{ fontSize: 12 }}>{dayjs(tVal).format('YYYY/MM/DD HH:mm:ss')}</Text>,
    },
  ];

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center' }}><Spin /></div>;
  }

  // 构建 Tab 列表，信控额度 Tab 仅在有信控记录或额度 > 0 时显示
  const showCreditTab = creditRecharges.length > 0 || creditLimit > 0;

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <Radio.Group 
            value={activePreset} 
            onChange={(e) => handlePresetChange(e.target.value)} 
            size="small"
            buttonStyle="outline"
          >
            <Radio.Button value="today">{t('today', '当日')}</Radio.Button>
            <Radio.Button value="yesterday">{t('yesterday', '前一日')}</Radio.Button>
            <Radio.Button value="thisMonth">{t('this_month', '当月')}</Radio.Button>
            <Radio.Button value="lastMonth">{t('last_month', '上月')}</Radio.Button>
            <Radio.Button value="thisYear">{t('this_year', '当年')}</Radio.Button>
            <Radio.Button value="lastHalfYear">{t('last_half_year', '最近半年')}</Radio.Button>
            <Radio.Button value="lastYear">{t('last_year', '最近一年')}</Radio.Button>
            <Radio.Button value="all">{t('all_time', '全部')}</Radio.Button>
          </Radio.Group>
          {filterRange && (
            <Button size="small" type="link" onClick={() => { setFilterRange(null); setActivePreset(null); }} style={{ padding: 0, fontSize: 12 }}>
              {t('reset', '重置')}
            </Button>
          )}
        </div>
        <DatePicker.RangePicker 
          value={filterRange} 
          onChange={handleRangeChange} 
          style={{ width: '100%' }} 
        />
      </div>

      <Tabs defaultActiveKey="system" items={[
        {
          key: 'system',
          label: t('system_wallet_details', '系统钱包明细'),
          children: (
            <div>
              <Row gutter={16} style={{ marginBottom: 16 }}>
                <Col span={6}>
                  <Card size="small" style={{ background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)', border: 'none' }}>
                    <Statistic title={<span style={{ color: isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)' }}>当前系统账户余额</span>} value={user.balance || 0} precision={2} prefix={currencySymbol} valueStyle={{ color: isLight ? '#1f2937' : '#fff' }} />
                  </Card>
                </Col>
                <Col span={6}>
                  <Card size="small" style={{ background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)', border: 'none' }}>
                    <Statistic title={<span style={{ color: isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)' }}>{`${timePrefix}充值记录`}</span>} value={totalSystemRecharge} precision={2} prefix={currencySymbol} valueStyle={{ color: isLight ? '#1f2937' : '#fff' }} />
                  </Card>
                </Col>
                <Col span={6}>
                  <Card size="small" style={{ background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)', border: 'none' }}>
                    <Statistic title={<span style={{ color: isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)' }}>{`${timePrefix}消费合计`}</span>} value={consumedSystem} precision={2} prefix={currencySymbol} valueStyle={{ color: isLight ? '#1f2937' : '#fff' }} loading={consumedLoading} />
                  </Card>
                </Col>
                <Col span={6}>
                  <Card size="small" style={{ background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)', border: 'none' }}>
                    <Statistic title={<span style={{ color: isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)' }}>历史全部消费合计</span>} value={systemUsed} precision={2} prefix={currencySymbol} valueStyle={{ color: isLight ? '#1f2937' : '#fff' }} />
                  </Card>
                </Col>
              </Row>
              <Table
                dataSource={systemRecharges}
                columns={rechargeColumns}
                rowKey="id"
                pagination={{ pageSize: 20 }}
                scroll={{ x: 'max-content' }}
                size="small"
                locale={{ emptyText: t('no_system_recharges', '该期间暂无系统钱包明细') }}
              />
            </div>
          )
        },
        {
          key: 'gift',
          label: t('gift_wallet_details', '赠送钱包明细'),
          children: (
            <div>
              <Row gutter={16} style={{ marginBottom: 16 }}>
                <Col span={6}>
                  <Card size="small" style={{ background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)', border: 'none' }}>
                    <Statistic title={<span style={{ color: isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)' }}>当前赠送账户余额</span>} value={user.gift_balance || 0} precision={2} prefix={currencySymbol} valueStyle={{ color: isLight ? '#1f2937' : '#fff' }} />
                  </Card>
                </Col>
                <Col span={6}>
                  <Card size="small" style={{ background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)', border: 'none' }}>
                    <Statistic title={<span style={{ color: isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)' }}>{`${timePrefix}获得赠送`}</span>} value={totalGiftRecharge} precision={2} prefix={currencySymbol} valueStyle={{ color: isLight ? '#1f2937' : '#fff' }} />
                  </Card>
                </Col>
                <Col span={6}>
                  <Card size="small" style={{ background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)', border: 'none' }}>
                    <Statistic title={<span style={{ color: isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)' }}>{`${timePrefix}使用赠送`}</span>} value={consumedGift} precision={2} prefix={currencySymbol} valueStyle={{ color: isLight ? '#1f2937' : '#fff' }} loading={consumedLoading} />
                  </Card>
                </Col>
                <Col span={6}>
                  <Card size="small" style={{ background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)', border: 'none' }}>
                    <Statistic title={<span style={{ color: isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)' }}>历史全部赠送使用</span>} value={giftUsed} precision={2} prefix={currencySymbol} valueStyle={{ color: isLight ? '#1f2937' : '#fff' }} />
                  </Card>
                </Col>
              </Row>
              <Table
                dataSource={giftRecharges}
                columns={rechargeColumns}
                rowKey="id"
                pagination={{ pageSize: 20 }}
                scroll={{ x: 'max-content' }}
                size="small"
                locale={{ emptyText: t('no_gift_recharges', '该期间暂无赠送钱包明细') }}
              />
            </div>
          )
        },
        ...(showCreditTab ? [{
          key: 'credit',
          label: '💳 信控额度明细',
          children: (
            <div>
              <Row gutter={16} style={{ marginBottom: 16 }}>
                <Col span={12}>
                  <Card size="small" style={{ background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)', border: 'none' }}>
                    <Statistic title={<span style={{ color: isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)' }}>当前信控额度</span>} value={creditLimit} precision={2} prefix={currencySymbol} valueStyle={{ color: isLight ? '#1890ff' : '#69b1ff' }} />
                  </Card>
                </Col>
                <Col span={12}>
                  <Card size="small" style={{ background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)', border: 'none' }}>
                    <Statistic title={<span style={{ color: isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)' }}>{(filterRange && filterRange[0] && filterRange[1]) ? '筛选期内信控调整' : '累计信控调增'}</span>} value={totalCreditRecharge} precision={2} prefix={currencySymbol} valueStyle={{ color: isLight ? '#1f2937' : '#fff' }} />
                  </Card>
                </Col>
              </Row>
              <Table
                dataSource={creditRecharges}
                columns={rechargeColumns}
                rowKey="id"
                pagination={{ pageSize: 20 }}
                scroll={{ x: 'max-content' }}
                size="small"
                locale={{ emptyText: '该期间暂无信控额度变更记录' }}
              />
            </div>
          )
        }] : [])
      ]} />
    </div>
  );
};

export default WalletDetailsView;
