import React, { useState, useEffect, useRef } from 'react';
import { Modal, Radio, Button, Typography, Space, Row, Col, QRCode, message, Spin, Result } from 'antd';
import { Wallet, QrCode } from 'lucide-react';
import request from '../../utils/request';

const { Title, Text } = Typography;

interface RechargeModalProps {
  visible: boolean;
  onCancel: () => void;
  onSuccess: () => void;
}

const AMOUNTS = [10, 50, 100, 200, 500, 1000];

const RechargeModal: React.FC<RechargeModalProps> = ({ visible, onCancel, onSuccess }) => {
  const [selectedAmount, setSelectedAmount] = useState<number>(50);
  const [paymentMethod, setPaymentMethod] = useState<'wechat' | 'alipay'>('alipay');
  const [loading, setLoading] = useState(false);
  
  // Settings
  const [wechatEnabled, setWechatEnabled] = useState(false);
  const [alipayEnabled, setAlipayEnabled] = useState(false);
  const [fetchingSettings, setFetchingSettings] = useState(true);

  // Pay state
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [outTradeNo, setOutTradeNo] = useState<string>('');
  const [payStatus, setPayStatus] = useState<'idle' | 'paying' | 'success'>('idle');
  
  const timerRef = useRef<any>(null);

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
      let wc = false, al = false;
      if (res?.payment_wechat?.enabled) wc = true;
      if (res?.payment_alipay?.enabled) al = true;
      
      setWechatEnabled(wc);
      setAlipayEnabled(al);
      if (al) {
        setPaymentMethod('alipay');
      } else if (wc) {
        setPaymentMethod('wechat');
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
          setTimeout(() => {
            onSuccess();
          }, 2000);
        }
      } catch (err) {
        console.error('Polling error', err);
      }
    }, 3000); // 3 seconds interval
  };

  const handleCreateOrder = async () => {
    if (selectedAmount <= 0) {
      message.error('请选择充值金额');
      return;
    }
    setLoading(true);
    try {
      const res = await (request.post('/finance/pay/create', {
        amount: selectedAmount,
        payment_method: paymentMethod
      }) as any);
      
      setOutTradeNo(res.out_trade_no);
      setPayStatus('paying');
      
      if (paymentMethod === 'alipay') {
        // Redirect to Alipay
        window.location.href = res.payment_url;
      } else if (paymentMethod === 'wechat') {
        // Show QR Code directly
        setQrCodeUrl(res.payment_url);
        startPolling(res.out_trade_no);
      }
    } catch (err: any) {
      message.error(err.response?.data?.error || err.message || '获取支付二维码失败');
    } finally {
      setLoading(false);
    }
  };

  if (fetchingSettings) {
    return (
      <Modal open={visible} footer={null} closable={false} centered>
        <div style={{ textAlign: 'center', padding: '40px 0' }}><Spin /></div>
      </Modal>
    );
  }

  // Handle No Payment Method
  if (!wechatEnabled && !alipayEnabled) {
    return (
      <Modal open={visible} footer={null} onCancel={onCancel} centered>
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
      styles={{ body: { padding: '24px 32px' } }}
      centered
    >
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <Wallet size={48} style={{ color: '#1677ff', marginBottom: 12 }} />
        <Title level={4} style={{ margin: 0 }}>钱包余额充值</Title>
      </div>

      {payStatus === 'success' ? (
        <Result
          status="success"
          title="支付成功！"
          subTitle="您的钱包余额已经更新"
          extra={[
            <Button type="primary" key="console" onClick={onSuccess}>
              完成
            </Button>
          ]}
        />
      ) : payStatus === 'paying' && paymentMethod === 'wechat' ? (
        <div style={{ textAlign: 'center' }}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>请使用微信扫一扫支付</Text>
          <div style={{ padding: 16, background: '#fff', borderRadius: 8, display: 'inline-block', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
            <QRCode value={qrCodeUrl} size={200} />
          </div>
          <div style={{ marginTop: 24 }}>
            <Title level={3} style={{ color: '#ff4d4f', margin: 0 }}>¥ {selectedAmount.toFixed(2)}</Title>
            <Text type="secondary" style={{ fontSize: 13 }}>订单号: {outTradeNo}</Text>
          </div>
          <Button style={{ marginTop: 24 }} onClick={resetState}>返回修改</Button>
        </div>
      ) : (
        <div>
          <Text strong style={{ display: 'block', marginBottom: 12 }}>选择金额 (元)</Text>
          <Row gutter={[12, 12]}>
            {AMOUNTS.map(amt => (
              <Col span={8} key={amt}>
                <div 
                  onClick={() => setSelectedAmount(amt)}
                  style={{
                    border: `2px solid ${selectedAmount === amt ? '#1677ff' : '#f0f0f0'}`,
                    borderRadius: 8,
                    padding: '12px 0',
                    textAlign: 'center',
                    cursor: 'pointer',
                    background: selectedAmount === amt ? '#e6f4ff' : '#fff',
                    transition: 'all 0.2s'
                  }}
                >
                  <Text strong style={{ color: selectedAmount === amt ? '#1677ff' : 'inherit', fontSize: 18 }}>{amt}</Text>
                </div>
              </Col>
            ))}
          </Row>

          <Text strong style={{ display: 'block', marginTop: 24, marginBottom: 12 }}>支付方式</Text>
          <Radio.Group 
            onChange={(e) => setPaymentMethod(e.target.value)} 
            value={paymentMethod}
            style={{ width: '100%', display: 'flex', gap: 12 }}
          >
            {alipayEnabled && (
              <Radio.Button value="alipay" style={{ flex: 1, textAlign: 'center', height: 48, lineHeight: '46px', borderRadius: 8 }}>
                <span style={{ color: '#1677ff', fontWeight: 500 }}>支付宝</span>
              </Radio.Button>
            )}
            {wechatEnabled && (
              <Radio.Button value="wechat" style={{ flex: 1, textAlign: 'center', height: 48, lineHeight: '46px', borderRadius: 8 }}>
                 <span style={{ color: '#07c160', fontWeight: 500 }}>微信支付</span>
              </Radio.Button>
            )}
          </Radio.Group>

          <Button 
            type="primary" 
            block 
            size="large" 
            style={{ marginTop: 32, borderRadius: 8, height: 48, fontSize: 16 }}
            loading={loading}
            onClick={handleCreateOrder}
          >
            {paymentMethod === 'alipay' ? '去支付宝支付' : '生成微信支付码'}
          </Button>
        </div>
      )}
    </Modal>
  );
};

export default RechargeModal;
