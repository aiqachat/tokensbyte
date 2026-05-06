import React, { useEffect, useState } from 'react';
import { Card, Form, Input, Button, message, Typography, Tabs, Switch, Alert, Divider, InputNumber } from 'antd';
import { WechatOutlined, AlipayCircleOutlined, CopyOutlined, LinkOutlined, SafetyCertificateOutlined, DollarOutlined, CreditCardOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';
import useSettingsStore from '../../store/settings';

const { Title, Text, Paragraph } = Typography;

const PaymentSettings: React.FC = () => {
  const { t } = useTranslation();
  const { updateStoreSettings } = useSettingsStore();
  const [formCurrency] = Form.useForm();
  const [formWechat] = Form.useForm();
  const [formAlipay] = Form.useForm();
  const [formStripe] = Form.useForm();
  const [formBonuspay] = Form.useForm();
  const [loadingCurrency, setLoadingCurrency] = useState(false);
  const [loadingWechat, setLoadingWechat] = useState(false);
  const [loadingAlipay, setLoadingAlipay] = useState(false);
  const [loadingStripe, setLoadingStripe] = useState(false);
  const [loadingBonuspay, setLoadingBonuspay] = useState(false);

  // 回调地址展示：生产环境用户通过域名访问，nginx 自动反代 /api/v1 到后端
  const siteOrigin = window.location.origin;
  const notifyWechat = `${siteOrigin}/api/v1/finance/pay/notify/wechat`;
  const notifyAlipay = `${siteOrigin}/api/v1/finance/pay/notify/alipay`;
  const notifyStripe = `${siteOrigin}/api/v1/finance/pay/notify/stripe`;
  const notifyBonuspay = `${siteOrigin}/api/v1/finance/pay/notify/bonuspay`;

  useEffect(() => { fetchSettings(); }, []);

  const fetchSettings = async () => {
    try {
      const response = await (request.get('/settings') as any);
      if (response?.currency) formCurrency.setFieldsValue(response.currency);
      if (response?.payment_wechat) formWechat.setFieldsValue(response.payment_wechat);
      if (response?.payment_alipay) formAlipay.setFieldsValue(response.payment_alipay);
      if (response?.payment_stripe) formStripe.setFieldsValue(response.payment_stripe);
      if (response?.payment_bonuspay) formBonuspay.setFieldsValue(response.payment_bonuspay);
    } catch (error) {
      console.error('Failed to fetch payment settings:', error);
    }
  };

  const onFinishCurrency = async (values: any) => {
    setLoadingCurrency(true);
    try {
      const payload = {
        currency: {
          default_currency: values.default_currency,
          currency_symbol: values.currency_symbol,
          currency_unit: values.currency_unit,
          token_ratio: values.token_ratio,
        }
      };
      const updatedSettings = await (request.post('/settings', payload) as any);
      message.success(t('settings.save_success', '货币设置保存成功'));
      updateStoreSettings(updatedSettings);
    } catch (error) {
      console.error('Save currency error:', error);
      message.error(t('common.error'));
    } finally {
      setLoadingCurrency(false);
    }
  };

  const onFinishWechat = async (values: any) => {
    setLoadingWechat(true);
    try {
      const payload = {
        payment_wechat: {
          enabled: values.enabled || false,
          mchid: values.mchid || '',
          appid: values.appid || '',
          api_v3_key: values.api_v3_key || '',
          cert_serial_no: values.cert_serial_no || '',
          private_key: values.private_key || '',
        }
      };
      const updatedSettings = await (request.post('/settings', payload) as any);
      message.success('微信支付配置保存成功');
      updateStoreSettings(updatedSettings);
    } catch (error) {
      console.error('Save wechat error:', error);
      message.error(t('common.error'));
    } finally {
      setLoadingWechat(false);
    }
  };

  const onFinishAlipay = async (values: any) => {
    setLoadingAlipay(true);
    try {
      const payload = {
        payment_alipay: {
          enabled: values.enabled || false,
          app_id: values.app_id || '',
          private_key: values.private_key || '',
          alipay_public_key: values.alipay_public_key || '',
          sign_type: 'RSA2',
        }
      };
      const updatedSettings = await (request.post('/settings', payload) as any);
      message.success('支付宝配置保存成功');
      updateStoreSettings(updatedSettings);
    } catch (error) {
      console.error('Save alipay error:', error);
      message.error(t('common.error'));
    } finally {
      setLoadingAlipay(false);
    }
  };

  const onFinishStripe = async (values: any) => {
    setLoadingStripe(true);
    try {
      const payload = {
        payment_stripe: {
          enabled: values.enabled || false,
          secret_key: values.secret_key || '',
          publishable_key: values.publishable_key || '',
          webhook_secret: values.webhook_secret || '',
        }
      };
      const updatedSettings = await (request.post('/settings', payload) as any);
      message.success('Stripe 配置保存成功');
      updateStoreSettings(updatedSettings);
    } catch (error) {
      console.error('Save stripe error:', error);
      message.error(t('common.error'));
    } finally {
      setLoadingStripe(false);
    }
  };

  const onFinishBonuspay = async (values: any) => {
    setLoadingBonuspay(true);
    try {
      const payload = {
        payment_bonuspay: {
          enabled: values.enabled || false,
          partner_id: values.partner_id || '',
          merchant_private_key: values.merchant_private_key || '',
          bonuspay_public_key: values.bonuspay_public_key || '',
          api_url: values.api_url || 'https://api.bonuspay.network',
          crypto_exchange_rate: values.crypto_exchange_rate || 1.0,
        }
      };
      const updatedSettings = await (request.post('/settings', payload) as any);
      message.success('BonusPay 配置保存成功');
      updateStoreSettings(updatedSettings);
    } catch (error) {
      console.error('Save bonuspay error:', error);
      message.error(t('common.error'));
    } finally {
      setLoadingBonuspay(false);
    }
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    message.success('已复制到剪贴板');
  };

  const notifyUrlBlock = (url: string, label: string) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      background: 'rgba(22, 119, 255, 0.06)',
      border: '1px dashed rgba(22, 119, 255, 0.3)',
      borderRadius: 8, padding: '10px 14px', marginBottom: 8,
    }}>
      <LinkOutlined style={{ color: '#1677ff', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>{label}</Text>
        <Text copyable={{ text: url }} style={{ fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all' }}>{url}</Text>
      </div>
    </div>
  );

  const tabItems = [
    {
      key: 'currency',
      label: <span><DollarOutlined style={{ color: '#faad14' }} /> {t('menu.currency_settings', '货币设置')}</span>,
      children: (
        <div style={{ maxWidth: 640, marginTop: 16 }}>
          <Form form={formCurrency} layout="vertical" onFinish={onFinishCurrency} autoComplete="off">
            <Form.Item label={t('settings.default_currency', '默认货币代码')} name="default_currency" rules={[{ required: true }]}><Input placeholder="CNY" /></Form.Item>
            <Form.Item label={t('settings.currency_symbol', '货币符号')} name="currency_symbol" rules={[{ required: true }]}><Input placeholder="¥" /></Form.Item>
            <Form.Item label={t('settings.currency_unit', '货币单位')} name="currency_unit" rules={[{ required: true }]}><Input placeholder="元" /></Form.Item>
            <Form.Item noStyle dependencies={['default_currency']}>
              {({ getFieldValue }) => {
                const c = getFieldValue('default_currency') || 'USD';
                return (
                  <Form.Item label={t('settings.token_ratio', '兑换比例')} name="token_ratio" rules={[{ required: true }]} extra={<Text type="secondary">{`1 ${c} = N Tokens`}</Text>}>
                    <InputNumber style={{ width: '100%' }} min={0} step={0.0001} />
                  </Form.Item>
                );
              }}
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={loadingCurrency} size="large" style={{ borderRadius: 8 }}>
                {t('common.save', '保存设置')}
              </Button>
            </Form.Item>
          </Form>
        </div>
      ),
    },
    {
      key: 'wechat',
      label: <span><WechatOutlined style={{ color: '#07c160' }} /> 微信支付 (V3)</span>,
      children: (
        <div style={{ maxWidth: 640, marginTop: 16 }}>
          <Alert
            type="info"
            showIcon
            icon={<SafetyCertificateOutlined />}
            style={{ marginBottom: 20, borderRadius: 8 }}
            message="微信支付 API v3 接入指引"
            description={
              <div style={{ fontSize: 13, lineHeight: 1.8 }}>
                <div>1. 登录 <a href="https://pay.weixin.qq.com" target="_blank" rel="noreferrer">微信支付商户平台</a> → 账户中心 → 获取<strong>商户号 (MCHID)</strong></div>
                <div>2. 账户中心 → API安全 → 设置 <strong>API v3 密钥</strong>（32位字符串）</div>
                <div>3. 账户中心 → API安全 → 申请API证书 → 获取<strong>证书序列号</strong>和<strong>私钥文件 apiclient_key.pem</strong></div>
                <div>4. 产品中心 → 开通 <strong>Native支付</strong> 产品</div>
                <div>5. 绑定一个<strong>公众号/小程序</strong>的 AppID 到商户号</div>
              </div>
            }
          />

          {notifyUrlBlock(notifyWechat, '微信支付异步回调通知地址（请将此地址配置到微信商户平台 → 开发配置 → 支付回调URL）')}

          <Divider style={{ margin: '16px 0' }} />

          <Form form={formWechat} layout="vertical" onFinish={onFinishWechat} autoComplete="off">
            <Form.Item label="是否启用微信支付" name="enabled" valuePropName="checked">
              <Switch checkedChildren="已开启" unCheckedChildren="已关闭" />
            </Form.Item>

            <Form.Item label="商户号 (MCHID)" name="mchid" rules={[{ required: true, message: '请输入微信支付商户号' }]}
              extra="10位数字，在商户平台 → 账户中心 查看">
              <Input placeholder="例如：1900000109" />
            </Form.Item>

            <Form.Item label="应用 AppID" name="appid" rules={[{ required: true, message: '请输入绑定的 AppID' }]}
              extra="绑定到商户号的公众号或小程序 AppID">
              <Input placeholder="例如：wx8888888888888888" />
            </Form.Item>

            <Form.Item label="API v3 密钥" name="api_v3_key" rules={[{ required: true, message: '请输入 API v3 密钥' }]}
              extra="32字符，用于回调通知报文解密，在商户平台 → API安全 设置">
              <Input.Password placeholder="32位字符串密钥" />
            </Form.Item>

            <Form.Item label="商户证书序列号" name="cert_serial_no" rules={[{ required: true, message: '请输入商户证书序列号' }]}
              extra="16进制字符串，在商户平台 → API安全 → API证书管理 查看">
              <Input placeholder="例如：7F5C2B3A..." />
            </Form.Item>

            <Form.Item label="商户私钥 (apiclient_key.pem 内容)" name="private_key" rules={[{ required: true, message: '请粘贴私钥全部内容' }]}
              extra="打开 apiclient_key.pem 文件，复制全部内容粘贴到此处">
              <Input.TextArea rows={6} placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----" style={{ fontFamily: 'monospace', fontSize: 12 }} />
            </Form.Item>

            <Form.Item>
              <Button type="primary" htmlType="submit" loading={loadingWechat} size="large"
                style={{ background: 'linear-gradient(135deg, #07c160, #059048)', border: 'none', borderRadius: 8 }}>
                <WechatOutlined /> 保存微信支付配置
              </Button>
            </Form.Item>
          </Form>
        </div>
      ),
    },
    {
      key: 'alipay',
      label: <span><AlipayCircleOutlined style={{ color: '#1677ff' }} /> 支付宝</span>,
      children: (
        <div style={{ maxWidth: 640, marginTop: 16 }}>
          <Alert
            type="info"
            showIcon
            icon={<SafetyCertificateOutlined />}
            style={{ marginBottom: 20, borderRadius: 8 }}
            message="支付宝电脑网站支付接入指引"
            description={
              <div style={{ fontSize: 13, lineHeight: 1.8 }}>
                <div>1. 登录 <a href="https://open.alipay.com" target="_blank" rel="noreferrer">支付宝开放平台</a> → 创建网页应用 → 获取 <strong>App ID</strong></div>
                <div>2. 应用详情 → 开发设置 → 接口加签方式 → 选择 <strong>RSA2(SHA256)</strong></div>
                <div>3. 使用支付宝密钥生成工具生成<strong>应用公/私钥对</strong></div>
                <div>4. 将应用公钥上传至开放平台，获取<strong>支付宝公钥</strong>（注意区分：不是应用公钥）</div>
                <div>5. 签约 <strong>电脑网站支付</strong> 产品</div>
              </div>
            }
          />

          {notifyUrlBlock(notifyAlipay, '支付宝异步回调通知地址（系统自动携带至支付请求中，无需手动配置到支付宝后台）')}

          <Divider style={{ margin: '16px 0' }} />

          <Form form={formAlipay} layout="vertical" onFinish={onFinishAlipay} autoComplete="off">
            <Form.Item label="是否启用支付宝" name="enabled" valuePropName="checked">
              <Switch checkedChildren="已开启" unCheckedChildren="已关闭" />
            </Form.Item>

            <Form.Item label="App ID (应用ID)" name="app_id" rules={[{ required: true, message: '请输入支付宝应用 AppID' }]}
              extra="在开放平台 → 应用详情页顶部查看">
              <Input placeholder="例如：2021000000000000" />
            </Form.Item>

            <Form.Item label="应用私钥 (App Private Key)" name="private_key" rules={[{ required: true, message: '请输入应用私钥' }]}
              extra="使用密钥生成工具生成的 RSA2 私钥，一行字符串或 PEM 格式">
              <Input.TextArea rows={6} placeholder="粘贴 RSA2 应用私钥" style={{ fontFamily: 'monospace', fontSize: 12 }} />
            </Form.Item>

            <Form.Item label="支付宝公钥 (Alipay Public Key)" name="alipay_public_key" rules={[{ required: true, message: '请输入支付宝公钥' }]}
              extra="上传应用公钥后由支付宝返回的公钥（注意：不是你自己生成的应用公钥）">
              <Input.TextArea rows={5} placeholder="粘贴支付宝公钥，用于异步回调验签" style={{ fontFamily: 'monospace', fontSize: 12 }} />
            </Form.Item>

            <Form.Item>
              <Button type="primary" htmlType="submit" loading={loadingAlipay} size="large"
                style={{ background: 'linear-gradient(135deg, #1677ff, #003eb3)', border: 'none', borderRadius: 8 }}>
                <AlipayCircleOutlined /> 保存支付宝配置
              </Button>
            </Form.Item>
          </Form>
        </div>
      ),
    },
    {
      key: 'stripe',
      label: <span><CreditCardOutlined style={{ color: '#635bff' }} /> Stripe</span>,
      children: (
        <div style={{ maxWidth: 640, marginTop: 16 }}>
          <Alert
            type="info"
            showIcon
            icon={<SafetyCertificateOutlined />}
            style={{ marginBottom: 20, borderRadius: 8 }}
            message="Stripe Checkout 接入指引"
            description={
              <div style={{ fontSize: 13, lineHeight: 1.8 }}>
                <div>1. 登录 <a href="https://dashboard.stripe.com" target="_blank" rel="noreferrer">Stripe Dashboard</a> → 获取 <strong>Secret Key</strong> 和 <strong>Publishable Key</strong></div>
                <div>2. 开发者 → Webhooks → 添加端点，填入下方回调地址</div>
                <div>3. 监听事件选择 <strong>checkout.session.completed</strong></div>
                <div>4. 获取 <strong>Webhook Signing Secret</strong>（whsec_ 开头）填入下方</div>
                <div>5. 支持全球主流信用卡、Apple Pay、Google Pay 等支付方式</div>
              </div>
            }
          />

          {notifyUrlBlock(notifyStripe, 'Stripe Webhook 回调地址（请将此地址配置到 Stripe Dashboard → Webhooks → Endpoint URL）')}

          <Divider style={{ margin: '16px 0' }} />

          <Form form={formStripe} layout="vertical" onFinish={onFinishStripe} autoComplete="off">
            <Form.Item label="是否启用 Stripe 支付" name="enabled" valuePropName="checked">
              <Switch checkedChildren="已开启" unCheckedChildren="已关闭" />
            </Form.Item>

            <Form.Item label="Secret Key (密钥)" name="secret_key" rules={[{ required: true, message: '请输入 Stripe Secret Key' }]}
              extra="以 sk_live_ 或 sk_test_ 开头，在 Dashboard → API Keys 获取">
              <Input.Password placeholder="sk_live_xxxx 或 sk_test_xxxx" />
            </Form.Item>

            <Form.Item label="Publishable Key (公钥)" name="publishable_key" rules={[{ required: true, message: '请输入 Stripe Publishable Key' }]}
              extra="以 pk_live_ 或 pk_test_ 开头">
              <Input placeholder="pk_live_xxxx 或 pk_test_xxxx" />
            </Form.Item>

            <Form.Item label="Webhook Signing Secret" name="webhook_secret" rules={[{ required: true, message: '请输入 Webhook Secret' }]}
              extra="以 whsec_ 开头，在 Webhooks 端点详情页查看">
              <Input.Password placeholder="whsec_xxxx" />
            </Form.Item>

            <Form.Item>
              <Button type="primary" htmlType="submit" loading={loadingStripe} size="large"
                style={{ background: 'linear-gradient(135deg, #635bff, #4b45c6)', border: 'none', borderRadius: 8 }}>
                <CreditCardOutlined /> 保存 Stripe 配置
              </Button>
            </Form.Item>
          </Form>
        </div>
      ),
    },
    {
      key: 'bonuspay',
      label: <span><ThunderboltOutlined style={{ color: '#ff6a00' }} /> BonusPay</span>,
      children: (
        <div style={{ maxWidth: 640, marginTop: 16 }}>
          <Alert
            type="info"
            showIcon
            icon={<SafetyCertificateOutlined />}
            style={{ marginBottom: 20, borderRadius: 8 }}
            message="BonusPay 加密货币支付接入指引"
            description={
              <div style={{ fontSize: 13, lineHeight: 1.8 }}>
                <div>1. 在 <a href="https://www.bonuspay.network" target="_blank" rel="noreferrer">bonuspay.network</a> 注册商户账号</div>
                <div>2. 商户后台 → Setting → Your Business → API Keys → 获取 <strong>Partner-Id</strong></div>
                <div>3. 使用密钥生成工具或 OpenSSL 生成 RSA 密钥对 (2048位)</div>
                <div>4. 上传商户公钥到 BonusPay 后台，并下载 <strong>BonusPay 公钥</strong></div>
                <div>5. 将商户 RSA 私钥 (PKCS#8 PEM) 和 BonusPay 公钥填入下方</div>
                <div>6. 将下方回调地址配置到商户后台的回调通知设置中</div>
                <div style={{ marginTop: 4, color: '#888' }}>📖 API 文档：<a href="https://docs.bonuspay.network" target="_blank" rel="noreferrer">docs.bonuspay.network</a></div>
              </div>
            }
          />

          {notifyUrlBlock(notifyBonuspay, 'BonusPay 异步回调通知地址（请配置到商户后台 → API Keys → Notification URL）')}

          <Divider style={{ margin: '16px 0' }} />

          <Form form={formBonuspay} layout="vertical" onFinish={onFinishBonuspay} autoComplete="off">
            <Form.Item label="是否启用 BonusPay" name="enabled" valuePropName="checked">
              <Switch checkedChildren="已开启" unCheckedChildren="已关闭" />
            </Form.Item>

            <Form.Item label="Partner-Id (商户ID)" name="partner_id" rules={[{ required: true, message: '请输入 Partner-Id' }]}
              extra="在 BonusPay 商户后台 → Setting → Your Business 获取，12位数字">
              <Input placeholder="例如：200000000888" />
            </Form.Item>

            <Form.Item label="商户 RSA 私钥 (PKCS#8 PEM)" name="merchant_private_key" rules={[{ required: true, message: '请输入商户私钥' }]}
              extra="用于对请求进行 SHA256WithRSA 签名，请妥善保管">
              <Input.TextArea rows={4} placeholder={'-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----'} style={{ fontFamily: 'monospace', fontSize: 12 }} />
            </Form.Item>

            <Form.Item label="BonusPay RSA 公钥 (PEM)" name="bonuspay_public_key" rules={[{ required: true, message: '请输入 BonusPay 公钥' }]}
              extra="用于验证回调签名，在商户后台下载">
              <Input.TextArea rows={4} placeholder={'-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----'} style={{ fontFamily: 'monospace', fontSize: 12 }} />
            </Form.Item>

            <Form.Item label="API 接口地址" name="api_url"
              extra="正式环境：https://api.bonuspay.network 测试环境：http://api.testbonuspay.network">
              <Input placeholder="https://api.bonuspay.network" />
            </Form.Item>

            <Form.Item label="USDT / USDC 汇率" name="crypto_exchange_rate" rules={[{ required: true, message: '请输入加密货币兑换系统法币的汇率' }]}
              extra="例如系统货币为 CNY，汇率为 7.2，则 10 USDT/USDC 会为用户充值 72 余额。如果系统货币是 USD，请填 1.0">
              <InputNumber min={0.01} step={0.1} style={{ width: '100%' }} placeholder="7.2" />
            </Form.Item>

            <Form.Item>
              <Button type="primary" htmlType="submit" loading={loadingBonuspay} size="large"
                style={{ background: 'linear-gradient(135deg, #ff6a00, #ee0979)', border: 'none', borderRadius: 8 }}>
                <ThunderboltOutlined /> 保存 BonusPay 配置
              </Button>
            </Form.Item>
          </Form>
        </div>
      ),
    },
  ];

  return (
    <Card bordered={false} style={{ borderRadius: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <SafetyCertificateOutlined style={{ fontSize: 24, color: '#52c41a' }} />
        <Title level={3} style={{ margin: 0 }}>在线支付设置</Title>
      </div>
      <Tabs items={tabItems} />
    </Card>
  );
};

export default PaymentSettings;
