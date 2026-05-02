import React, { useState, useEffect, useRef } from 'react';
import { Modal, Button, Typography, Space, Row, Col, QRCode, message, Spin, Result, InputNumber } from 'antd';
import { WalletOutlined, AlipayCircleOutlined, WechatOutlined, SafetyCertificateOutlined, LockOutlined, CreditCardOutlined, ThunderboltOutlined } from '@ant-design/icons';
import request from '../../utils/request';
import { useThemeStore } from '../../store/theme';

const { Title, Text } = Typography;

interface RechargeModalProps {
  visible: boolean;
  onCancel: () => void;
  onSuccess: () => void;
}

const AMOUNTS = [10, 50, 100, 200, 500, 1000];

const RechargeModal: React.FC<RechargeModalProps> = ({ visible, onCancel, onSuccess }) => {
  const [selectedAmount, setSelectedAmount] = useState<number | null>(50);
  const [customAmount, setCustomAmount] = useState<number | null>(null);
  const [isCustom, setIsCustom] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'wechat' | 'alipay' | 'stripe' | 'bonuspay'>('alipay');
  const [loading, setLoading] = useState(false);
  
  const [wechatEnabled, setWechatEnabled] = useState(false);
  const [alipayEnabled, setAlipayEnabled] = useState(false);
  const [stripeEnabled, setStripeEnabled] = useState(false);
  const [bonuspayEnabled, setBonuspayEnabled] = useState(false);
  const [fetchingSettings, setFetchingSettings] = useState(true);

  // BonusPay TOPUP 参数
  const [assetCode, setAssetCode] = useState<'USDT' | 'USDC'>('USDT');
  const [depositNetwork, setDepositNetwork] = useState<'TRON' | 'ETH' | 'POLYGON'>('TRON');

  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [outTradeNo, setOutTradeNo] = useState<string>('');
  const [payStatus, setPayStatus] = useState<'idle' | 'paying' | 'success'>('idle');
  
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
    setQrCodeUrl('');
    setOutTradeNo('');
    setPayStatus('idle');
    setSelectedAmount(50);
    setCustomAmount(null);
    setIsCustom(false);
  };

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const fetchPaymentSettings = async () => {
    setFetchingSettings(true);
    try {
      const res = await (request.get('/settings') as any);
      let wc = false, al = false, st = false, bp = false;
      if (res?.payment_wechat?.enabled) wc = true;
      if (res?.payment_alipay?.enabled) al = true;
      if (res?.payment_stripe?.enabled) st = true;
      if (res?.payment_bonuspay?.enabled) bp = true;
      
      setWechatEnabled(wc);
      setAlipayEnabled(al);
      setStripeEnabled(st);
      setBonuspayEnabled(bp);
      if (al) {
        setPaymentMethod('alipay');
      } else if (wc) {
        setPaymentMethod('wechat');
      } else if (st) {
        setPaymentMethod('stripe');
      } else if (bp) {
        setPaymentMethod('bonuspay');
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
    if (paymentMethod !== 'bonuspay' && finalAmount < 0.01) {
      message.error('充值金额不能小于 0.01 元');
      return;
    }
    setLoading(true);
    try {
      const reqBody: any = {
        amount: paymentMethod === 'bonuspay' ? 1 : finalAmount,
        payment_method: paymentMethod,
      };
      if (paymentMethod === 'bonuspay') {
        reqBody.asset_code = assetCode;
        reqBody.network = depositNetwork;
      }
      const res = await (request.post('/finance/pay/create', reqBody) as any);
      
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
      } else if (paymentMethod === 'bonuspay') {
        // BonusPay TOPUP: 打开收银台，不轮询（无预创建订单，余额由回调驱动）
        window.open(res.payment_url, '_blank');
      }
    } catch (err: any) {
      message.error(err.response?.data?.error || err.message || '获取支付信息失败');
    } finally {
      setLoading(false);
    }
  };

  const handlePresetClick = (amt: number) => {
    setSelectedAmount(amt);
    setIsCustom(false);
    setCustomAmount(null);
  };

  const handleCustomFocus = () => {
    setIsCustom(true);
    setSelectedAmount(null);
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

  if (fetchingSettings) {
    return (
      <Modal open={visible} footer={null} closable={false} centered styles={modalStyles}>
        <div style={{ textAlign: 'center', padding: '40px 0' }}><Spin /></div>
      </Modal>
    );
  }

  if (!wechatEnabled && !alipayEnabled && !stripeEnabled && !bonuspayEnabled) {
    return (
      <Modal open={visible} footer={null} onCancel={onCancel} centered styles={modalStyles}>
        <Result
          status="warning"
          title="在线充值暂不可用"
          subTitle="管理员尚未开启或正确配置在线支付功能"
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
          background: 'linear-gradient(135deg, #1677ff 0%, #003eb3 100%)',
          marginBottom: 16,
          boxShadow: '0 8px 24px rgba(22, 119, 255, 0.3)',
        }}>
          <WalletOutlined style={{ fontSize: 28, color: '#fff' }} />
        </div>
        <Title level={4} style={{ margin: 0, color: titleColor }}>钱包余额充值</Title>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 6 }}>
          <LockOutlined style={{ fontSize: 11, color: '#52c41a' }} />
          <Text type="secondary" style={{ fontSize: 12 }}>安全加密支付通道</Text>
        </div>
      </div>

      {payStatus === 'success' ? (
        <Result
          status="success"
          title="支付成功！"
          subTitle="您的钱包余额已经更新"
          extra={[
            <Button type="primary" key="done" onClick={onSuccess} style={{ borderRadius: 8 }}>完成</Button>
          ]}
        />
      ) : payStatus === 'paying' && paymentMethod === 'wechat' ? (
        <div style={{ textAlign: 'center' }}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>请使用微信扫一扫支付</Text>
          <div style={{ padding: 16, background: '#fff', borderRadius: 12, display: 'inline-block', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
            <QRCode value={qrCodeUrl} size={200} color="#000000" />
          </div>
          <div style={{ marginTop: 24 }}>
            <Title level={3} style={{ color: '#ff4d4f', margin: 0 }}>¥ {finalAmount.toFixed(2)}</Title>
            <Text type="secondary" style={{ fontSize: 13 }}>订单号: {outTradeNo}</Text>
          </div>
          <Button style={{ marginTop: 24, borderRadius: 8 }} onClick={resetState}>返回修改</Button>
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
          <Title level={4} style={{ color: '#fff', margin: '0 0 8px 0' }}>等待 Stripe 支付完成</Title>
          <Text type="secondary" style={{ display: 'block', marginBottom: 20 }}>
            请在新打开的页面完成支付，支付成功后此页面将自动更新
          </Text>
          <Spin size="large" />
          <div style={{ marginTop: 24 }}>
            <Title level={3} style={{ color: '#ff4d4f', margin: 0 }}>¥ {finalAmount.toFixed(2)}</Title>
            <Text type="secondary" style={{ fontSize: 13 }}>订单号: {outTradeNo}</Text>
          </div>
          <Button style={{ marginTop: 24, borderRadius: 8 }} onClick={resetState}>返回修改</Button>
        </div>
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
          <Title level={4} style={{ color: titleColor, margin: '0 0 8px 0' }}>充值页面已打开</Title>
          <Text type="secondary" style={{ display: 'block', marginBottom: 8, lineHeight: 1.8 }}>
            请在新打开的 BonusPay 收银台页面完成转账。
            <br />链上确认后余额将自动更新，您可以关闭此弹窗。
          </Text>
          <div style={{
            marginTop: 16, padding: '12px 16px', borderRadius: 8,
            background: 'rgba(255, 106, 0, 0.08)', border: '1px solid rgba(255, 106, 0, 0.2)',
          }}>
            <Text style={{ fontSize: 12, color: '#ff6a00' }}>
              💡 充值金额以实际链上到账金额为准，通常需要几分钟确认
            </Text>
          </div>
          <Space style={{ marginTop: 24 }}>
            <Button style={{ borderRadius: 8 }} onClick={resetState}>再次充值</Button>
            <Button type="primary" style={{ borderRadius: 8, background: 'linear-gradient(135deg, #ff6a00, #ee0979)', border: 'none' }} onClick={onCancel}>关闭</Button>
          </Space>
        </div>
      ) : (
        <div>
          {paymentMethod !== 'bonuspay' ? (
            <>
              {/* Amount Selection - only for fiat payment methods */}
              <Text strong style={{ display: 'block', marginBottom: 12, color: labelColor }}>选择金额 (元)</Text>
              <Row gutter={[10, 10]}>
                {AMOUNTS.map(amt => (
                  <Col span={8} key={amt}>
                    <div
                      onClick={() => handlePresetClick(amt)}
                      style={{
                        border: `2px solid ${!isCustom && selectedAmount === amt ? '#1677ff' : borderIdle}`,
                        borderRadius: 10,
                        padding: '14px 0',
                        textAlign: 'center',
                        cursor: 'pointer',
                        background: !isCustom && selectedAmount === amt
                          ? 'rgba(22, 119, 255, 0.12)'
                          : bgIdle,
                        transition: 'all 0.25s ease',
                      }}
                    >
                      <Text strong style={{
                        color: !isCustom && selectedAmount === amt ? '#1677ff' : labelColor,
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
                  border: `2px solid ${isCustom ? '#1677ff' : borderIdle}`,
                  borderRadius: 10,
                  padding: '8px 16px',
                  background: isCustom ? 'rgba(22, 119, 255, 0.12)' : bgIdle,
                  transition: 'all 0.25s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <Text style={{ color: descColor, whiteSpace: 'nowrap' }}>自定义</Text>
                <InputNumber
                  min={0.01}
                  max={50000}
                  precision={2}
                  placeholder="输入金额"
                  value={customAmount}
                  onChange={(val) => { setCustomAmount(val); setIsCustom(true); setSelectedAmount(null); }}
                  onFocus={handleCustomFocus}
                  controls={false}
                  variant="borderless"
                  style={{ flex: 1, background: 'transparent' }}
                />
                <Text style={{ color: subColor }}>元</Text>
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
                <Title level={5} style={{ color: labelColor, margin: '0 0 4px 0' }}>加密货币充值</Title>
                <Text type="secondary" style={{ fontSize: 12 }}>充值金额以实际链上到账金额为准</Text>
              </div>

              {/* 币种选择 */}
              <Text strong style={{ display: 'block', marginBottom: 8, color: labelColor, fontSize: 13 }}>充值币种</Text>
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
              <Text strong style={{ display: 'block', marginBottom: 8, color: labelColor, fontSize: 13 }}>充值网络</Text>
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
          <Text strong style={{ display: 'block', marginTop: 24, marginBottom: 12, color: labelColor }}>支付方式</Text>
          <Row gutter={12}>
            {alipayEnabled && (
              <Col flex={1}>
                <div
                  onClick={() => setPaymentMethod('alipay')}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    height: 52, borderRadius: 10, cursor: 'pointer',
                    border: `2px solid ${paymentMethod === 'alipay' ? '#1677ff' : borderIdle}`,
                    background: paymentMethod === 'alipay' ? 'rgba(22, 119, 255, 0.12)' : bgIdle,
                    transition: 'all 0.25s ease',
                  }}
                >
                  <AlipayCircleOutlined style={{ fontSize: 22, color: '#1677ff' }} />
                  <Text strong style={{ color: '#1677ff', fontSize: 15 }}>支付宝</Text>
                </div>
              </Col>
            )}
            {wechatEnabled && (
              <Col flex={1}>
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
                  <Text strong style={{ color: '#07c160', fontSize: 15 }}>微信支付</Text>
                </div>
              </Col>
            )}
            {stripeEnabled && (
              <Col flex={1}>
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
              <Col flex={1}>
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
          </Row>

          {/* Summary - hide for BonusPay TOPUP */}
          {paymentMethod !== 'bonuspay' && (
            <div style={{
              marginTop: 24, padding: '16px 20px',
              background: summaryBg, borderRadius: 10, border: `1px solid ${summaryBorder}`,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <Text type="secondary" style={{ fontSize: 13 }}>应付金额</Text>
              <Title level={3} style={{ margin: 0, color: '#ff4d4f' }}>¥ {finalAmount.toFixed(2)}</Title>
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
                : paymentMethod === 'stripe'
                  ? 'linear-gradient(135deg, #635bff, #4b45c6)'
                  : paymentMethod === 'alipay'
                    ? 'linear-gradient(135deg, #1677ff, #003eb3)'
                    : 'linear-gradient(135deg, #07c160, #059048)',
              border: 'none',
              boxShadow: paymentMethod === 'bonuspay'
                ? '0 4px 16px rgba(255, 106, 0, 0.35)'
                : paymentMethod === 'stripe'
                  ? '0 4px 16px rgba(99, 91, 255, 0.35)'
                  : paymentMethod === 'alipay'
                    ? '0 4px 16px rgba(22, 119, 255, 0.35)'
                    : '0 4px 16px rgba(7, 193, 96, 0.35)',
            }}
          >
            {paymentMethod === 'bonuspay' ? (
              <Space><ThunderboltOutlined />获取充值地址</Space>
            ) : paymentMethod === 'stripe' ? (
              <Space><CreditCardOutlined />去 Stripe 支付</Space>
            ) : paymentMethod === 'alipay' ? (
              <Space><AlipayCircleOutlined />去支付宝支付</Space>
            ) : (
              <Space><WechatOutlined />生成微信支付码</Space>
            )}
          </Button>

          {/* Trust badge */}
          <div style={{ textAlign: 'center', marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <SafetyCertificateOutlined style={{ fontSize: 13, color: '#52c41a' }} />
            <Text type="secondary" style={{ fontSize: 11 }}>资金安全保障 · 充值后即时到账 · 正规支付渠道</Text>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default RechargeModal;
