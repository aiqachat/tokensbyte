import React, { useState, useEffect, useRef } from 'react';
import { Modal, Button, Typography, Space, Row, Col, QRCode, message, Spin, Result, InputNumber } from 'antd';
import { useTranslation } from 'react-i18next';
import { WalletOutlined, AlipayCircleOutlined, WechatOutlined, SafetyCertificateOutlined, LockOutlined, CreditCardOutlined, ThunderboltOutlined } from '@ant-design/icons';
import request from '../../utils/request';
import { useThemeStore } from '../../store/theme';
import useSettingsStore from '../../store/settings';
import useAuthStore from '../../store/auth';

const { Title, Text } = Typography;

interface RechargeModalProps {
  visible: boolean;
  onCancel: () => void;
  onSuccess: () => void;
}

/** HyperBC：裸 usdt/usdc→ERC20；USDC@Tron→Tron (USDCOLD)，与官方收银台一致 */
const NETWORK_LABELS: Record<string, string> = {
  trc20: 'Tron (TRC20)',
  usdcold: 'Tron (USDCOLD)',
  erc20: 'Ethereum (ERC20)',
  bep20: 'BNB Smart Chain (BEP20)',
  solana: 'Solana',
  trx: 'Tron',
  eth: 'Ethereum',
  bnb: 'BNB Smart Chain',
  btc: 'Bitcoin',
};
const CURRENCY_ORDER = ['USDT', 'USDC'];

type HyperbcAddr = { coin: string; address: string; amount: string };
type HyperbcCoinDetails = { symbol: string; netKey: string; netKeyUpper: string; network: string };

const hyperbcDetails = (symbol: string, netKey: string): HyperbcCoinDetails => ({
  symbol,
  netKey,
  netKeyUpper: netKey.toUpperCase(),
  network: NETWORK_LABELS[netKey] || (netKey ? netKey.toUpperCase() : ''),
});

const getCoinDetails = (coinStr: string): HyperbcCoinDetails => {
  if (!coinStr) return hyperbcDetails('', '');
  const raw = coinStr.trim().toLowerCase();
  // usdcold → usdc_usdcold，与 usdc_trc20 归一同一路径
  const parts = (raw === 'usdcold' ? 'usdc_usdcold' : raw).split('_').filter(Boolean);
  const symbol = (parts[0] || '').toUpperCase();
  let netKey =
    parts.length >= 2
      ? parts.slice(1).join('_')
      : symbol === 'USDT' || symbol === 'USDC'
        ? 'erc20'
        : parts[0] || '';
  if (symbol === 'USDC' && (netKey === 'trc20' || netKey === 'trx')) netKey = 'usdcold';
  return hyperbcDetails(symbol, netKey);
};

const listHyperbcCurrencies = (addrs: HyperbcAddr[]) =>
  [...new Set(addrs.map((a) => getCoinDetails(a.coin).symbol).filter(Boolean))].sort((a, b) => {
    const ia = CURRENCY_ORDER.indexOf(a);
    const ib = CURRENCY_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });

/** 按币种过滤；顺序保持 addresses 出现序 */
const listHyperbcNetworks = (addrs: HyperbcAddr[], coin: string) => {
  const seen = new Map<string, string>();
  for (const a of addrs) {
    const d = getCoinDetails(a.coin);
    if (d.symbol === coin && d.netKey && !seen.has(d.netKey)) seen.set(d.netKey, d.network);
  }
  return [...seen.entries()].map(([netKey, label]) => ({
    keyUpper: netKey.toUpperCase(),
    label,
  }));
};

const findHyperbcAddress = (addrs: HyperbcAddr[], coin: string, netUpper: string) =>
  addrs.find((a) => {
    const d = getCoinDetails(a.coin);
    return d.symbol === coin && d.netKeyUpper === netUpper;
  }) || null;

const pickDefaultHyperbc = (addrs: HyperbcAddr[]) => {
  if (!addrs.length) return { coin: '', net: '', address: null as HyperbcAddr | null };
  const coin = listHyperbcCurrencies(addrs)[0] || getCoinDetails(addrs[0].coin).symbol;
  const net = listHyperbcNetworks(addrs, coin)[0]?.keyUpper || '';
  return { coin, net, address: findHyperbcAddress(addrs, coin, net) };
};

const RechargeModal: React.FC<RechargeModalProps> = ({ visible, onCancel, onSuccess }) => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { settings } = useSettingsStore();
  const currencySymbol = settings?.currency?.currency_symbol || '¥';
  const currencyUnit = settings?.currency?.currency_unit || '元';

  const amounts = settings?.currency?.quick_amounts || [20, 50, 100, 500, 1000, 5000];

  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState<number | null>(null);
  const [isCustom, setIsCustom] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (amounts.length > 0 && (selectedAmount === null || !amounts.includes(selectedAmount)) && !isCustom) {
      const defaultSel = amounts.includes(50) ? 50 : amounts[0];
      setSelectedAmount(defaultSel);
    }
  }, [amounts, isCustom]);
  const [paymentMethod, setPaymentMethod] = useState<'wechat' | 'alipay' | 'stripe' | 'bonuspay' | 'hyperbc' | 'allinpay_wechat' | 'allinpay_alipay'>('alipay');
  const [loading, setLoading] = useState(false);
  
  const [wechatEnabled, setWechatEnabled] = useState(false);
  const [alipayEnabled, setAlipayEnabled] = useState(false);
  const [stripeEnabled, setStripeEnabled] = useState(false);
  const [bonuspayEnabled, setBonuspayEnabled] = useState(false);
  const [hyperbcEnabled, setHyperbcEnabled] = useState(false);
  const [allinpayEnabled, setAllinpayEnabled] = useState(false);
  const [fetchingSettings, setFetchingSettings] = useState(true);

  // BonusPay TOPUP 参数
  const [assetCode, setAssetCode] = useState<'USDT' | 'USDC'>('USDT');
  const [depositNetwork, setDepositNetwork] = useState<'TRON' | 'ETH' | 'POLYGON'>('TRON');

  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [outTradeNo, setOutTradeNo] = useState<string>('');
  const [payStatus, setPayStatus] = useState<'idle' | 'paying' | 'success'>('idle');
  const [hyperbcData, setHyperbcData] = useState<{ addresses?: HyperbcAddr[] } | null>(null);
  const [selectedAddress, setSelectedAddress] = useState<HyperbcAddr | null>(null);
  
  // HyperBC 界面状态
  const [hyperbcStep, setHyperbcStep] = useState<'select' | 'pay'>('select');
  const [hyperbcNetwork, setHyperbcNetwork] = useState<string>('');
  const [hyperbcCoin, setHyperbcCoin] = useState<string>('');
  const [timeLeft, setTimeLeft] = useState(900);

  const timerRef = useRef<any>(null);

  const finalAmount = isCustom ? (customAmount || 0) : (selectedAmount || 0);

  useEffect(() => {
    if (visible) {
      fetchPaymentSettings();
      resetState();
    } else {
      clearTimer();
    }
    return () => clearTimer();
  }, [visible]);

  const resetState = () => {
    clearTimer();
    setQrCodeUrl('');
    setOutTradeNo('');
    setPayStatus('idle');
    setHyperbcData(null);
    setSelectedAddress(null);
    setHyperbcStep('select');
    setHyperbcNetwork('');
    setHyperbcCoin('');
    setTimeLeft(900);
    const defaultSel = amounts.includes(50) ? 50 : (amounts[0] || null);
    setSelectedAmount(defaultSel);
    setCustomAmount(null);
    setIsCustom(false);
    setErrorMessage(null);
  };

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const hyperbcAddresses: HyperbcAddr[] = hyperbcData?.addresses || [];
  const hyperbcCurrencies = listHyperbcCurrencies(hyperbcAddresses);
  const hyperbcNetworksForCoin = listHyperbcNetworks(hyperbcAddresses, hyperbcCoin);

  const handleCoinChange = (coin: string) => {
    setHyperbcCoin(coin);
    const nets = listHyperbcNetworks(hyperbcAddresses, coin).map((n) => n.keyUpper);
    const nextNet = nets.includes(hyperbcNetwork) ? hyperbcNetwork : (nets[0] || '');
    setHyperbcNetwork(nextNet);
    setSelectedAddress(findHyperbcAddress(hyperbcAddresses, coin, nextNet));
  };

  const handleNetworkChange = (net: string) => {
    setHyperbcNetwork(net);
    setSelectedAddress(findHyperbcAddress(hyperbcAddresses, hyperbcCoin, net));
  };

  // 倒计时控制
  useEffect(() => {
    let interval: any = null;
    if (payStatus === 'paying' && paymentMethod === 'hyperbc' && hyperbcStep === 'pay') {
      setTimeLeft(900);
      interval = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [payStatus, paymentMethod, hyperbcStep]);

  const formatTimeLeft = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const fetchPaymentSettings = async () => {
    setFetchingSettings(true);
    try {
      const res = await (request.get('/settings') as any);
      // 公开接口返回 payment 对象，仅包含各渠道的 enabled 布尔值（不含密钥）
      const payment = res?.payment;
      const wc = !!payment?.wechat_enabled;
      const al = !!payment?.alipay_enabled;
      const st = !!payment?.stripe_enabled;
      const bp = !!payment?.bonuspay_enabled;
      const hbc = !!payment?.hyperbc_enabled;
      const ap = !!payment?.allinpay_enabled;
      
      setWechatEnabled(wc);
      setAlipayEnabled(al);
      setStripeEnabled(st);
      setBonuspayEnabled(bp);
      setHyperbcEnabled(hbc);
      setAllinpayEnabled(ap);
      if (al) {
        setPaymentMethod('alipay');
      } else if (wc) {
        setPaymentMethod('wechat');
      } else if (ap) {
        setPaymentMethod('allinpay_alipay');
      } else if (st) {
        setPaymentMethod('stripe');
      } else if (bp) {
        setPaymentMethod('bonuspay');
      } else if (hbc) {
        setPaymentMethod('hyperbc');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setFetchingSettings(false);
    }
  };

  const startPolling = (tradeNo: string) => {
    clearTimer();
    timerRef.current = setInterval(async () => {
      try {
        const res = await (request.get(`/finance/pay/status/${tradeNo}`) as any);
        if (res?.status === 'paid') {
          clearTimer();
          setPayStatus('success');
          message.success('充值成功！');
          setTimeout(() => { onSuccess(); }, 2000);
        }
      } catch (err) {
        console.error('Polling error', err);
      }
    }, 3000);
  };

  const handleCreateOrder = async () => {
    const minRechargeLimit = settings?.currency?.min_recharge_amount !== undefined ? parseFloat(String(settings.currency.min_recharge_amount)) : 5.0;

    if (paymentMethod !== 'bonuspay') {
      if (minRechargeLimit > 0 && finalAmount < minRechargeLimit) {
        setErrorMessage(t('recharge.min_amount_error', { 
          defaultValue: `充值金额不能小于 ${minRechargeLimit} ${currencyUnit}`, 
          unit: currencyUnit, 
          limit: minRechargeLimit 
        }));
        return;
      }
      if (finalAmount < 0.01) {
        setErrorMessage(t('recharge.min_amount_error', { 
          defaultValue: `充值金额不能小于 0.01 ${currencyUnit}`, 
          unit: currencyUnit, 
          limit: 0.01 
        }));
        return;
      }
    }
    setErrorMessage(null);
    clearTimer();
    setLoading(true);
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    try {
      const reqBody: any = {
        amount: paymentMethod === 'bonuspay' ? 1 : finalAmount,
        payment_method: paymentMethod,
        is_mobile: isMobile,
      };
      if (paymentMethod === 'bonuspay') {
        reqBody.asset_code = assetCode;
        reqBody.network = depositNetwork;
      }
      const res = await (request.post('/finance/pay/create', reqBody, { skipErrorHandler: true } as any) as any);
      
      setOutTradeNo(res.out_trade_no);
      setPayStatus('paying');
      
      if (paymentMethod === 'alipay') {
        window.location.href = res.payment_url;
      } else if (paymentMethod === 'stripe') {
        window.open(res.payment_url, '_blank');
        startPolling(res.out_trade_no);
      } else if (paymentMethod === 'wechat') {
        setQrCodeUrl(res.payment_url);
        startPolling(res.out_trade_no);
      } else if (paymentMethod === 'allinpay_wechat' || paymentMethod === 'allinpay_alipay') {
        if (isMobile) {
          window.location.href = res.payment_url;
        } else {
          setQrCodeUrl(res.payment_url);
          startPolling(res.out_trade_no);
        }
      } else if (paymentMethod === 'bonuspay') {
        // BonusPay TOPUP: 打开收银台，不轮询（无预创建订单，余额由回调驱动）
        window.open(res.payment_url, '_blank');
      } else if (paymentMethod === 'hyperbc') {
        // HyperBC: 不再跳转收银台，而是记录返回的地址列表，展示在弹窗中并启动轮询
        if (res.hyperbc_data) {
          setHyperbcData(res.hyperbc_data);
          const picked = pickDefaultHyperbc(res.hyperbc_data.addresses || []);
          setHyperbcCoin(picked.coin);
          setHyperbcNetwork(picked.net);
          setSelectedAddress(picked.address);
        }
        setHyperbcStep('select');
        startPolling(res.out_trade_no);
      }
    } catch (err: any) {
      const errMsg = err.response?.data?.error?.message || err.response?.data?.error || err.message || '获取支付信息失败';
      const errMsgStr = typeof errMsg === 'object' ? JSON.stringify(errMsg) : String(errMsg);
      if (
        errMsgStr.includes('充值金额不能小于') ||
        errMsgStr.includes('金额必须大于') ||
        errMsgStr.includes('min_amount_error') ||
        errMsgStr.includes('金额不能小于')
      ) {
        setErrorMessage(errMsgStr);
      } else {
        message.error(errMsgStr);
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePresetClick = (amt: number) => {
    setSelectedAmount(amt);
    setIsCustom(false);
    setCustomAmount(null);
    setErrorMessage(null);
  };

  const handleCustomFocus = () => {
    setIsCustom(true);
    setSelectedAmount(null);
    setErrorMessage(null);
  };

  const { themeMode } = useThemeStore();
  const isLight = themeMode === 'light';

  const modalStyles = {
    content: { background: isLight ? '#fff' : '#141414', border: isLight ? '1px solid #e8e8e8' : '1px solid #303030', borderRadius: 16, padding: 0 },
    body: { padding: '28px 32px' },
    header: { display: 'none' as const },
    mask: { backgroundColor: 'rgba(0, 0, 0, 0.65)' },
  };
  const borderIdle = isLight ? '#d9d9d9' : '#303030';
  const bgIdle = isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.04)';
  const labelColor = isLight ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.85)';
  const descColor = isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)';
  const subColor = isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)';
  const summaryBg = isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.03)';
  const summaryBorder = isLight ? '#e8e8e8' : '#252525';
  const titleColor = isLight ? '#1f2937' : '#fff';
  const accent = isLight ? '#18181b' : '#fafafa';
  const accentSoft = isLight ? 'rgba(24, 24, 27, 0.08)' : 'rgba(250, 250, 250, 0.12)';
  const accentOn = isLight ? '#fafafa' : '#18181b';

  if (fetchingSettings) {
    return (
      <Modal open={visible} footer={null} closable={false} centered styles={modalStyles}>
        <div style={{ textAlign: 'center', padding: '40px 0' }}><Spin /></div>
      </Modal>
    );
  }

  if (!wechatEnabled && !alipayEnabled && !stripeEnabled && !bonuspayEnabled && !hyperbcEnabled && !allinpayEnabled) {
    return (
      <Modal open={visible} footer={null} onCancel={onCancel} centered styles={modalStyles}>
        <Result
          status="warning"
          title={t('recharge.not_available', '在线充值暂不可用')}
          subTitle={t('recharge.not_available_desc', '管理员尚未开启或正确配置在线支付功能')}
        />
      </Modal>
    );
  }

  return (
    <Modal
      open={visible}
      destroyOnClose
      width={480}
      title={null}
      footer={null}
      onCancel={onCancel}
      styles={modalStyles}
      centered
    >
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 56,
          height: 56,
          borderRadius: 16,
          background: accent,
          marginBottom: 16,
          boxShadow: isLight ? '0 8px 24px rgba(24, 24, 27, 0.2)' : '0 8px 24px rgba(0, 0, 0, 0.45)',
        }}>
          <WalletOutlined style={{ fontSize: 28, color: accentOn }} />
        </div>
        <Title level={4} style={{ margin: 0, color: titleColor }}>{t('recharge.title', '钱包余额充值')}</Title>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 6 }}>
          <LockOutlined style={{ fontSize: 11, color: '#52c41a' }} />
          <Text type="secondary" style={{ fontSize: 12 }}>{t('recharge.secure_channel', '安全加密支付通道')}</Text>
        </div>
      </div>

      {payStatus === 'success' ? (
        <Result
          status="success"
          title={t('recharge.success_title', '支付成功！')}
          subTitle={t('recharge.success_subtitle', '您的钱包余额已经更新')}
          extra={[
            <Button type="primary" key="done" onClick={onSuccess} style={{ borderRadius: 8 }}>{t('recharge.done', '完成')}</Button>
          ]}
        />
      ) : payStatus === 'paying' && (paymentMethod === 'wechat' || paymentMethod === 'allinpay_wechat' || paymentMethod === 'allinpay_alipay') ? (
        <div style={{ textAlign: 'center' }}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
            {paymentMethod === 'allinpay_alipay' 
              ? t('recharge.alipay_scan', '请使用支付宝扫一扫支付') 
              : t('recharge.wechat_scan', '请使用微信扫一扫支付')}
          </Text>
          <div style={{ padding: 16, background: '#fff', borderRadius: 12, display: 'inline-block', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
            <QRCode value={qrCodeUrl} size={200} color="#000000" />
          </div>
          <div style={{ marginTop: 24 }}>
            <Title level={3} style={{ color: '#ff4d4f', margin: 0 }}>{currencySymbol} {finalAmount.toFixed(2)}</Title>
            <Text type="secondary" style={{ fontSize: 13 }}>{t('recharge.order_no', '订单号: ')}{outTradeNo}</Text>
          </div>
          <Button style={{ marginTop: 24, borderRadius: 8 }} onClick={resetState}>{t('recharge.return_modify', '返回修改')}</Button>
        </div>
      ) : payStatus === 'paying' && paymentMethod === 'stripe' ? (
        <div style={{ textAlign: 'center' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 64, height: 64, borderRadius: 16,
            background: 'linear-gradient(135deg, #635bff, #4b45c6)',
            marginBottom: 20, boxShadow: '0 8px 24px rgba(99, 91, 255, 0.3)',
          }}>
            <CreditCardOutlined style={{ fontSize: 32, color: '#fff' }} />
          </div>
          <Title level={4} style={{ color: '#fff', margin: '0 0 8px 0' }}>{t('recharge.stripe_waiting', '等待 Stripe 支付完成')}</Title>
          <Text type="secondary" style={{ display: 'block', marginBottom: 20 }}>
            {t('recharge.stripe_desc', '请在新打开的页面完成支付，支付成功后此页面将自动更新')}
          </Text>
          <Spin size="large" />
          <div style={{ marginTop: 24 }}>
            <Title level={3} style={{ color: '#ff4d4f', margin: 0 }}>{currencySymbol} {finalAmount.toFixed(2)}</Title>
            <Text type="secondary" style={{ fontSize: 13 }}>订单号: {outTradeNo}</Text>
          </div>
          <Button style={{ marginTop: 24, borderRadius: 8 }} onClick={resetState}>返回修改</Button>
        </div>
      ) : payStatus === 'paying' && paymentMethod === 'hyperbc' ? (
        hyperbcStep === 'select' ? (
          <div style={{ textAlign: 'left' }}>
            <Title level={4} style={{ color: titleColor, textAlign: 'center', marginBottom: 24, fontWeight: 600 }}>
              账户充值
            </Title>
            <Text type="secondary" style={{ display: 'block', textAlign: 'center', marginBottom: 24, fontSize: 13 }}>
              请先选择支付币种，再选择对应网络。
            </Text>

            {/* 1. 币种 */}
            <div style={{ marginBottom: 16 }}>
              <Text style={{ color: descColor, fontSize: 13, display: 'block', marginBottom: 8 }}>选择支付币种</Text>
              <div style={{ display: 'flex', gap: 10 }}>
                {hyperbcCurrencies.map((coin) => {
                  const isSel = hyperbcCoin === coin;
                  const accent = coin === 'USDC' ? '#2775CA' : '#26A17B';
                  return (
                    <div
                      key={coin}
                      onClick={() => handleCoinChange(coin)}
                      style={{
                        flex: 1,
                        height: 52,
                        borderRadius: 12,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        border: `2px solid ${isSel ? '#8b5cf6' : borderIdle}`,
                        background: isSel ? 'rgba(139, 92, 246, 0.12)' : bgIdle,
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <span style={{
                        width: 22, height: 22, borderRadius: '50%', background: accent,
                        color: '#fff', fontSize: 11, fontWeight: 700,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {coin === 'USDC' ? '$' : '₮'}
                      </span>
                      <Text strong style={{ color: isSel ? '#8b5cf6' : labelColor, fontSize: 16 }}>{coin}</Text>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 2. 网络（随币种联动） */}
            <div style={{ marginBottom: 20 }}>
              <Text style={{ color: descColor, fontSize: 13, display: 'block', marginBottom: 8 }}>选择网络</Text>
              <div style={{
                border: `1px solid ${borderIdle}`,
                borderRadius: 12,
                padding: 12,
                display: 'flex',
                gap: 8,
                flexWrap: 'wrap',
              }}>
                {hyperbcNetworksForCoin.length === 0 ? (
                  <Text type="secondary" style={{ fontSize: 12 }}>暂无可用网络</Text>
                ) : hyperbcNetworksForCoin.map((net) => {
                  const isSel = hyperbcNetwork === net.keyUpper;
                  return (
                    <Button
                      key={net.keyUpper}
                      type={isSel ? 'primary' : 'default'}
                      onClick={() => handleNetworkChange(net.keyUpper)}
                      style={{
                        height: 40,
                        borderRadius: 10,
                        fontWeight: isSel ? 600 : 400,
                        borderColor: isSel ? '#8b5cf6' : borderIdle,
                        backgroundColor: isSel ? '#8b5cf6' : bgIdle,
                        color: isSel ? '#fff' : labelColor,
                      }}
                    >
                      {net.label}
                    </Button>
                  );
                })}
              </div>
            </div>

            {/* 金额显示 */}
            <div style={{ marginBottom: 24 }}>
              <Text style={{ color: descColor, fontSize: 13, display: 'block', marginBottom: 8 }}>金额</Text>
              <div style={{
                background: bgIdle,
                border: `1px solid ${borderIdle}`,
                borderRadius: 10,
                padding: '14px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: subColor, fontSize: 16 }}>$</span>
                  <Text style={{ color: labelColor, fontSize: 20, fontWeight: 'bold' }}>
                    {selectedAddress ? parseFloat(selectedAddress.amount).toFixed(2) : finalAmount.toFixed(2)}
                  </Text>
                </div>
                <Text style={{ color: subColor, fontWeight: 500, fontSize: 15 }}>{hyperbcCoin}</Text>
              </div>
            </div>

            {/* 前往支付按钮 */}
            <Button
              type="primary"
              block
              disabled={!selectedAddress || !hyperbcCoin || !hyperbcNetwork}
              onClick={() => setHyperbcStep('pay')}
              style={{
                height: 50,
                borderRadius: 10,
                background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
                border: 'none',
                fontWeight: 600,
                fontSize: 16,
                boxShadow: '0 4px 16px rgba(139, 92, 246, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8
              }}
            >
              前往支付 <span style={{ fontSize: 16 }}>➔</span>
            </Button>

            <div style={{ marginTop: 16, textAlign: 'center' }}>
              <Button type="text" size="small" onClick={resetState} style={{ color: subColor }}>
                返回修改充值金额
              </Button>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center' }}>
            {selectedAddress && (() => {
              const details = getCoinDetails(selectedAddress.coin);
              const amtStr = selectedAddress.amount || '0.00';
              const dotIdx = amtStr.indexOf('.');
              const integerPart = dotIdx !== -1 ? amtStr.substring(0, dotIdx) : amtStr;
              const decimalPart = dotIdx !== -1 ? amtStr.substring(dotIdx) : '';

              return (
                <div>
                  <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>
                    待支付总额
                  </Text>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 36, fontWeight: 800, color: labelColor }}>{integerPart}</span>
                    <span style={{ fontSize: 24, fontWeight: 700, color: '#ff4d4f' }}>{decimalPart}</span>
                    <span style={{ fontSize: 18, fontWeight: 600, color: subColor, marginLeft: 6 }}>{details.symbol}</span>
                  </div>
                  <div style={{ color: '#ff4d4f', fontSize: 12, fontWeight: 500, marginBottom: 20 }}>
                    ⚠️ 请通过此网络支付精确金额：<span style={{ textDecoration: 'underline' }}>{details.network}</span>
                  </div>

                  {/* 二维码 */}
                  <div style={{
                    padding: 16,
                    background: '#fff',
                    borderRadius: 12,
                    display: 'inline-block',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                    marginBottom: 20
                  }}>
                    <QRCode value={selectedAddress.address} size={180} color="#000000" bordered={false} />
                  </div>

                  {/* 订单信息卡片 */}
                  <div style={{
                    background: isLight ? '#f4f4f5' : '#1e1e1f',
                    border: `1px solid ${summaryBorder}`,
                    borderRadius: 12,
                    padding: '12px 16px',
                    textAlign: 'left',
                    marginBottom: 16,
                    fontSize: 13
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <Text type="secondary">商户订单号</Text>
                      <Text copyable={{ text: outTradeNo }} style={{ color: labelColor, fontFamily: 'monospace' }}>
                        {outTradeNo.length > 20 ? `${outTradeNo.substring(0, 10)}...${outTradeNo.substring(outTradeNo.length - 8)}` : outTradeNo}
                      </Text>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Text type="secondary">用户标识</Text>
                      <Text style={{ color: labelColor, fontFamily: 'monospace' }}>{user?.uid || user?.id || 'unknown'}</Text>
                    </div>
                  </div>

                  {/* 收款地址 */}
                  <div style={{ textAlign: 'left', marginBottom: 20 }}>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
                      收款地址 ({details.network})
                    </Text>
                    <Typography.Paragraph
                      copyable={{ text: selectedAddress.address }}
                      style={{
                        color: labelColor,
                        fontSize: 13,
                        background: isLight ? '#f4f4f5' : '#1e1e1f',
                        padding: '10px 12px',
                        borderRadius: 10,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        border: `1px solid ${summaryBorder}`,
                        margin: 0,
                      }}
                    >
                      <span style={{ fontFamily: 'monospace', wordBreak: 'break-all', paddingRight: 8 }}>
                        {selectedAddress.address}
                      </span>
                    </Typography.Paragraph>
                  </div>

                  {/* 提币提示警告框 */}
                  <div style={{
                    background: isLight ? 'rgba(250, 173, 20, 0.08)' : 'rgba(250, 173, 20, 0.1)',
                    border: '1px solid rgba(250, 173, 20, 0.3)',
                    borderRadius: 10,
                    padding: '12px 14px',
                    textAlign: 'left',
                    marginBottom: 20,
                    color: isLight ? '#d48806' : '#faad14',
                    fontSize: 12,
                    lineHeight: 1.6
                  }}>
                    <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      ⚠️ 交易所提币付款提示:
                    </div>
                    如果您从 币安 (Binance)、OKX (欧易) 等交易所提币付款，交易所会扣除提现手续费（通常为 0.01~1 USDT）。请在提币时手动将手续费加到提币数量中，确保钱包“实际到账”与上方金额完全一致，否则将导致自动到账失败。
                  </div>

                  {/* 倒计时与进度条 */}
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>等待支付中</Text>
                      <Text style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 'bold', color: labelColor }}>
                        {formatTimeLeft(timeLeft)}
                      </Text>
                    </div>
                    <div style={{
                      width: '100%',
                      height: 5,
                      background: isLight ? '#e4e4e7' : '#27272a',
                      borderRadius: 3,
                      overflow: 'hidden'
                    }}>
                      <div style={{
                        width: `${(timeLeft / 900) * 100}%`,
                        height: '100%',
                        background: '#60a5fa',
                        transition: 'width 1s linear'
                      }} />
                    </div>
                  </div>

                  {/* 返回修改网络/币种 */}
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
                    <Button style={{ borderRadius: 8 }} onClick={() => setHyperbcStep('select')}>
                      返回修改币种网络
                    </Button>
                    <Button style={{ borderRadius: 8 }} onClick={resetState}>
                      返回修改充值金额
                    </Button>
                  </div>
                </div>
              );
            })()}
          </div>
        )
      ) : payStatus === 'paying' && paymentMethod === 'bonuspay' ? (
        <div style={{ textAlign: 'center' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 64, height: 64, borderRadius: 16,
            background: 'linear-gradient(135deg, #ff6a00, #ee0979)',
            marginBottom: 20, boxShadow: '0 8px 24px rgba(255, 106, 0, 0.3)',
          }}>
            <ThunderboltOutlined style={{ fontSize: 32, color: '#fff' }} />
          </div>
          <Title level={4} style={{ color: titleColor, margin: '0 0 8px 0' }}>{t('recharge.bonuspay_opened', '充值页面已打开')}</Title>
          <Text type="secondary" style={{ display: 'block', marginBottom: 8, lineHeight: 1.8 }}>
            {t('recharge.bonuspay_desc', '请在新打开的 BonusPay 收银台页面完成转账。\\n链上确认后余额将自动更新，您可以关闭此弹窗。').split('\\n')[0]}
            <br />{t('recharge.bonuspay_desc', '请在新打开的 BonusPay 收银台页面完成转账。\\n链上确认后余额将自动更新，您可以关闭此弹窗。').split('\\n')[1]}
          </Text>
          <div style={{
            marginTop: 16, padding: '12px 16px', borderRadius: 8,
            background: 'rgba(255, 106, 0, 0.08)', border: '1px solid rgba(255, 106, 0, 0.2)',
          }}>
            <Text style={{ fontSize: 12, color: '#ff6a00' }}>
              {t('recharge.bonuspay_tip', '💡 充值金额以实际链上到账金额为准，通常需要几分钟确认')}
            </Text>
          </div>
          <Space style={{ marginTop: 24 }}>
            <Button style={{ borderRadius: 8 }} onClick={resetState}>{t('recharge.recharge_again', '再次充值')}</Button>
            <Button type="primary" style={{ borderRadius: 8, background: 'linear-gradient(135deg, #ff6a00, #ee0979)', border: 'none' }} onClick={onCancel}>{t('recharge.close', '关闭')}</Button>
          </Space>
        </div>
      ) : (
        <div>
          {paymentMethod !== 'bonuspay' ? (
            <>
              {/* Amount Selection - only for fiat payment methods */}
              <Text strong style={{ display: 'block', marginBottom: 12, color: labelColor }}>{t('recharge.select_amount', { defaultValue: `选择金额 (${currencyUnit})`, unit: currencyUnit })}</Text>
              <Row gutter={[10, 10]}>
                {amounts.map((amt: number) => (
                  <Col span={8} key={amt}>
                    <div
                      onClick={() => handlePresetClick(amt)}
                      style={{
                        border: `2px solid ${!isCustom && selectedAmount === amt ? accent : borderIdle}`,
                        borderRadius: 10,
                        padding: '14px 0',
                        textAlign: 'center',
                        cursor: 'pointer',
                        background: !isCustom && selectedAmount === amt
                          ? accentSoft
                          : bgIdle,
                        transition: 'all 0.25s ease',
                      }}
                    >
                      <Text strong style={{
                        color: !isCustom && selectedAmount === amt ? accent : labelColor,
                        fontSize: 20,
                      }}>
                        {amt}
                      </Text>
                    </div>
                  </Col>
                ))}
              </Row>

              {/* Custom Amount Input */}
              <div
                onClick={handleCustomFocus}
                style={{
                  marginTop: 12,
                  border: `2px solid ${isCustom ? accent : borderIdle}`,
                  borderRadius: 10,
                  padding: '8px 16px',
                  background: isCustom ? accentSoft : bgIdle,
                  transition: 'all 0.25s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <Text style={{ color: descColor, whiteSpace: 'nowrap' }}>{t('recharge.custom', '自定义')}</Text>
                <InputNumber
                  min={0.01}
                  max={50000}
                  precision={2}
                  placeholder={t('recharge.input_amount', '输入金额')}
                  value={customAmount}
                  onChange={(val) => { setCustomAmount(val); setIsCustom(true); setSelectedAmount(null); setErrorMessage(null); }}
                  onFocus={handleCustomFocus}
                  controls={false}
                  variant="borderless"
                  style={{ flex: 1, background: 'transparent' }}
                />
                <Text style={{ color: subColor }}>{currencyUnit}</Text>
              </div>
            </>
          ) : (
            /* BonusPay TOPUP Info + 参数选择 */
            <div style={{
              padding: '20px',
              borderRadius: 12,
              background: bgIdle,
              border: `1px solid ${borderIdle}`,
            }}>
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 48, height: 48, borderRadius: 12,
                  background: 'linear-gradient(135deg, #ff6a00, #ee0979)',
                  marginBottom: 12,
                }}>
                  <ThunderboltOutlined style={{ fontSize: 24, color: '#fff' }} />
                </div>
                <Title level={5} style={{ color: labelColor, margin: '0 0 4px 0' }}>{t('recharge.crypto_recharge', '加密货币充值')}</Title>
                <Text type="secondary" style={{ fontSize: 12 }}>{t('recharge.crypto_desc', '充值金额以实际链上到账金额为准')}</Text>
              </div>

              {/* 币种选择 */}
              <Text strong style={{ display: 'block', marginBottom: 8, color: labelColor, fontSize: 13 }}>{t('recharge.recharge_currency', '充值币种')}</Text>
              <Row gutter={10} style={{ marginBottom: 16 }}>
                {(['USDT', 'USDC'] as const).map(code => (
                  <Col span={12} key={code}>
                    <div
                      onClick={() => setAssetCode(code)}
                      style={{
                        textAlign: 'center', padding: '10px 0', borderRadius: 8, cursor: 'pointer',
                        border: `2px solid ${assetCode === code ? '#ff6a00' : borderIdle}`,
                        background: assetCode === code ? 'rgba(255, 106, 0, 0.1)' : 'transparent',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <Text strong style={{ color: assetCode === code ? '#ff6a00' : labelColor, fontSize: 15 }}>{code}</Text>
                    </div>
                  </Col>
                ))}
              </Row>

              {/* 网络选择 */}
              <Text strong style={{ display: 'block', marginBottom: 8, color: labelColor, fontSize: 13 }}>{t('recharge.recharge_network', '充值网络')}</Text>
              <Row gutter={10}>
                {(['TRON', 'ETH', 'POLYGON'] as const).map(net => (
                  <Col span={8} key={net}>
                    <div
                      onClick={() => setDepositNetwork(net)}
                      style={{
                        textAlign: 'center', padding: '10px 0', borderRadius: 8, cursor: 'pointer',
                        border: `2px solid ${depositNetwork === net ? '#ff6a00' : borderIdle}`,
                        background: depositNetwork === net ? 'rgba(255, 106, 0, 0.1)' : 'transparent',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <Text strong style={{ color: depositNetwork === net ? '#ff6a00' : labelColor, fontSize: 13 }}>{net}</Text>
                    </div>
                  </Col>
                ))}
              </Row>
            </div>
          )}

          {/* Payment Method */}
          <Text strong style={{ display: 'block', marginTop: 24, marginBottom: 12, color: labelColor }}>{t('recharge.payment_method', '支付方式')}</Text>
          <Row gutter={[12, 12]} wrap>
            {alipayEnabled && (
              <Col span={12}>
                <div
                  onClick={() => setPaymentMethod('alipay')}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    height: 52, borderRadius: 10, cursor: 'pointer',
                    border: `2px solid ${paymentMethod === 'alipay' ? accent : borderIdle}`,
                    background: paymentMethod === 'alipay' ? accentSoft : bgIdle,
                    transition: 'all 0.25s ease',
                  }}
                >
                  <AlipayCircleOutlined style={{ fontSize: 22, color: paymentMethod === 'alipay' ? accent : labelColor }} />
                  <Text strong style={{ color: paymentMethod === 'alipay' ? accent : labelColor, fontSize: 15 }}>{t('recharge.alipay', '支付宝')}</Text>
                </div>
              </Col>
            )}
            {wechatEnabled && (
              <Col span={12}>
                <div
                  onClick={() => setPaymentMethod('wechat')}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    height: 52, borderRadius: 10, cursor: 'pointer',
                    border: `2px solid ${paymentMethod === 'wechat' ? '#07c160' : borderIdle}`,
                    background: paymentMethod === 'wechat' ? 'rgba(7, 193, 96, 0.12)' : bgIdle,
                    transition: 'all 0.25s ease',
                  }}
                >
                  <WechatOutlined style={{ fontSize: 22, color: '#07c160' }} />
                  <Text strong style={{ color: '#07c160', fontSize: 15 }}>{t('recharge.wechat_pay', '微信支付')}</Text>
                </div>
              </Col>
            )}
            {allinpayEnabled && (
              <>
                <Col span={12}>
                  <div
                    onClick={() => setPaymentMethod('allinpay_wechat')}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      height: 52, borderRadius: 10, cursor: 'pointer',
                      border: `2px solid ${paymentMethod === 'allinpay_wechat' ? '#07c160' : borderIdle}`,
                      background: paymentMethod === 'allinpay_wechat' ? 'rgba(7, 193, 96, 0.12)' : bgIdle,
                      transition: 'all 0.25s ease',
                    }}
                  >
                    <WechatOutlined style={{ fontSize: 22, color: '#07c160' }} />
                    <Text strong style={{ color: '#07c160', fontSize: 15 }}>{t('recharge.allinpay_wechat', '通联微信')}</Text>
                  </div>
                </Col>
                <Col span={12}>
                  <div
                    onClick={() => setPaymentMethod('allinpay_alipay')}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      height: 52, borderRadius: 10, cursor: 'pointer',
                      border: `2px solid ${paymentMethod === 'allinpay_alipay' ? accent : borderIdle}`,
                      background: paymentMethod === 'allinpay_alipay' ? accentSoft : bgIdle,
                      transition: 'all 0.25s ease',
                    }}
                  >
                    <AlipayCircleOutlined style={{ fontSize: 22, color: paymentMethod === 'allinpay_alipay' ? accent : labelColor }} />
                    <Text strong style={{ color: paymentMethod === 'allinpay_alipay' ? accent : labelColor, fontSize: 15 }}>{t('recharge.allinpay_alipay', '通联支付宝')}</Text>
                  </div>
                </Col>
              </>
            )}
            {stripeEnabled && (
              <Col span={12}>
                <div
                  onClick={() => setPaymentMethod('stripe')}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    height: 52, borderRadius: 10, cursor: 'pointer',
                    border: `2px solid ${paymentMethod === 'stripe' ? '#635bff' : borderIdle}`,
                    background: paymentMethod === 'stripe' ? 'rgba(99, 91, 255, 0.12)' : bgIdle,
                    transition: 'all 0.25s ease',
                  }}
                >
                  <CreditCardOutlined style={{ fontSize: 22, color: '#635bff' }} />
                  <Text strong style={{ color: '#635bff', fontSize: 15 }}>Stripe</Text>
                </div>
              </Col>
            )}
            {bonuspayEnabled && (
              <Col span={12}>
                <div
                  onClick={() => setPaymentMethod('bonuspay')}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    height: 52, borderRadius: 10, cursor: 'pointer',
                    border: `2px solid ${paymentMethod === 'bonuspay' ? '#ff6a00' : borderIdle}`,
                    background: paymentMethod === 'bonuspay' ? 'rgba(255, 106, 0, 0.12)' : bgIdle,
                    transition: 'all 0.25s ease',
                  }}
                >
                  <ThunderboltOutlined style={{ fontSize: 22, color: '#ff6a00' }} />
                  <Text strong style={{ color: '#ff6a00', fontSize: 15 }}>BonusPay</Text>
                </div>
              </Col>
            )}
            {hyperbcEnabled && (
              <Col span={12}>
                <div
                  onClick={() => setPaymentMethod('hyperbc')}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    height: 52, borderRadius: 10, cursor: 'pointer',
                    border: `2px solid ${paymentMethod === 'hyperbc' ? '#8b5cf6' : borderIdle}`,
                    background: paymentMethod === 'hyperbc' ? 'rgba(139, 92, 246, 0.12)' : bgIdle,
                    transition: 'all 0.25s ease',
                  }}
                >
                  <span style={{ fontSize: 22 }}>₿</span>
                  <Text strong style={{ color: '#8b5cf6', fontSize: 15 }}>HyperBC</Text>
                </div>
              </Col>
            )}
          </Row>

          {/* Summary - hide for BonusPay TOPUP */}
          {paymentMethod !== 'bonuspay' && (
            <div style={{
              marginTop: 24, padding: '16px 20px',
              background: summaryBg, borderRadius: 10, border: `1px solid ${summaryBorder}`,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <Text type="secondary" style={{ fontSize: 13 }}>{t('recharge.payable_amount', '应付金额')}</Text>
              <Title level={3} style={{ margin: 0, color: '#ff4d4f' }}>{currencySymbol} {finalAmount.toFixed(2)}</Title>
            </div>
          )}

          {errorMessage && (
            <div style={{
              marginTop: 16,
              padding: '10px 14px',
              background: 'rgba(255, 77, 79, 0.1)',
              border: '1px solid rgba(255, 77, 79, 0.2)',
              borderRadius: 10,
              textAlign: 'center',
            }}>
              <Text type="danger" style={{ fontSize: 13, fontWeight: 500 }}>⚠️ {errorMessage}</Text>
            </div>
          )}

          <Button
            type="primary"
            block
            size="large"
            loading={loading}
            onClick={handleCreateOrder}
            disabled={paymentMethod !== 'bonuspay' && finalAmount < 0.01}
            style={{
              marginTop: 20, borderRadius: 10, height: 50, fontSize: 16, fontWeight: 600,
              background: paymentMethod === 'bonuspay'
                ? 'linear-gradient(135deg, #ff6a00, #ee0979)'
                : paymentMethod === 'hyperbc'
                  ? 'linear-gradient(135deg, #8b5cf6, #6d28d9)'
                  : paymentMethod === 'stripe'
                    ? 'linear-gradient(135deg, #635bff, #4b45c6)'
                    : accent,
              color: paymentMethod === 'bonuspay' || paymentMethod === 'hyperbc' || paymentMethod === 'stripe'
                ? '#fff'
                : accentOn,
              border: 'none',
              boxShadow: paymentMethod === 'bonuspay'
                ? '0 4px 16px rgba(255, 106, 0, 0.35)'
                : paymentMethod === 'hyperbc'
                  ? '0 4px 16px rgba(139, 92, 246, 0.35)'
                  : paymentMethod === 'stripe'
                    ? '0 4px 16px rgba(99, 91, 255, 0.35)'
                    : (isLight ? '0 4px 16px rgba(24, 24, 27, 0.2)' : '0 4px 16px rgba(0, 0, 0, 0.4)'),
            }}
          >
            {paymentMethod === 'bonuspay' ? (
              <Space><ThunderboltOutlined />{t('recharge.get_address', '获取充值地址')}</Space>
            ) : paymentMethod === 'hyperbc' ? (
              <Space><span>₿</span>{t('recharge.go_hyperbc', '去 HyperBC 支付')}</Space>
            ) : paymentMethod === 'stripe' ? (
              <Space><CreditCardOutlined />{t('recharge.go_stripe', '去 Stripe 支付')}</Space>
            ) : paymentMethod === 'alipay' ? (
              <Space><AlipayCircleOutlined />{t('recharge.go_alipay', '去支付宝支付')}</Space>
            ) : paymentMethod === 'allinpay_alipay' ? (
              <Space><AlipayCircleOutlined />{t('recharge.gen_alipay_qr', '生成支付宝支付码')}</Space>
            ) : (
              <Space><WechatOutlined />{t('recharge.gen_wechat_qr', '生成微信支付码')}</Space>
            )}
          </Button>

          {/* Trust badge */}
          <div style={{ textAlign: 'center', marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <SafetyCertificateOutlined style={{ fontSize: 13, color: '#52c41a' }} />
            <Text type="secondary" style={{ fontSize: 11 }}>{t('recharge.trust_badge', '资金安全保障 · 充值后即时到账 · 正规支付渠道')}</Text>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default RechargeModal;
