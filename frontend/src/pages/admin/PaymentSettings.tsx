import React, { useEffect, useState } from 'react';
import { Card, Form, Input, Button, message, Typography, Tabs, Switch, Space } from 'antd';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';
import useSettingsStore from '../../store/settings';

const { Title, Text } = Typography;
const { TabPane } = Tabs;

const PaymentSettings: React.FC = () => {
  const { t } = useTranslation();
  const { updateStoreSettings } = useSettingsStore();

  const [formWechat] = Form.useForm();
  const [formAlipay] = Form.useForm();
  const [loadingWechat, setLoadingWechat] = useState(false);
  const [loadingAlipay, setLoadingAlipay] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await (request.get('/settings') as any);
      
      const { payment_wechat, payment_alipay } = response;
      
      if (payment_wechat) {
        formWechat.setFieldsValue(payment_wechat);
      }
      
      if (payment_alipay) {
        formAlipay.setFieldsValue(payment_alipay);
      }
    } catch (error) {
      console.error('Failed to fetch payment settings:', error);
      message.error(t('common.error'));
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

  return (
    <Card 
      bordered={false} 
      title="在线支付设置"
      style={{ borderRadius: 12 }}
    >
      <Tabs defaultActiveKey="wechat">
        <TabPane tab="微信支付 (API v3)" key="wechat">
          <div style={{ maxWidth: 600, marginTop: 16 }}>
            <Form
              form={formWechat}
              layout="vertical"
              onFinish={onFinishWechat}
              autoComplete="off"
            >
              <Form.Item label="是否启用微信支付" name="enabled" valuePropName="checked">
                <Switch checkedChildren="已开启" unCheckedChildren="已关闭" />
              </Form.Item>
              
              <Form.Item label="商户号 (MCHID)" name="mchid" rules={[{ required: true, message: '请输入微信支付商户号' }]}>
                <Input placeholder="输入 10 位数字的商户号" />
              </Form.Item>
              
              <Form.Item label="应用 AppID" name="appid" rules={[{ required: true, message: '请输入绑定的 AppID' }]}>
                <Input placeholder="输入服务号/小程序的 AppID" />
              </Form.Item>
              
              <Form.Item label="API v3 密钥" name="api_v3_key" rules={[{ required: true, message: '请输入 API v3 密钥 (用于回调解密)' }]}>
                <Input.Password placeholder="支持 32 个字符的 AES-256 密钥" />
              </Form.Item>
              
              <Form.Item label="商户证书序列号" name="cert_serial_no" rules={[{ required: true, message: '请输入商户证书序列号' }]}>
                <Input placeholder="微信支付商户API证书序列号 (例如: 7F...44C)" />
              </Form.Item>
              
              <Form.Item label="商户私钥 (apiclient_key.pem)" name="private_key" rules={[{ required: true, message: '请直接粘贴私钥全部内容' }]}>
                <Input.TextArea rows={8} placeholder="-----BEGIN PRIVATE KEY----- ... -----END PRIVATE KEY-----" />
              </Form.Item>

              <Form.Item>
                <Button type="primary" htmlType="submit" loading={loadingWechat} size="large">
                  {t('common.save')}微信配置
                </Button>
              </Form.Item>
            </Form>
          </div>
        </TabPane>
        
        <TabPane tab="支付宝 (电脑网站)" key="alipay">
          <div style={{ maxWidth: 600, marginTop: 16 }}>
            <Form
              form={formAlipay}
              layout="vertical"
              onFinish={onFinishAlipay}
              autoComplete="off"
            >
              <Form.Item label="是否启用支付宝" name="enabled" valuePropName="checked">
                <Switch checkedChildren="已开启" unCheckedChildren="已关闭" />
              </Form.Item>
              
              <Form.Item label="App ID / 应用 ID" name="app_id" rules={[{ required: true, message: '请输入支付宝应用AppID' }]}>
                <Input placeholder="输入 20xxxxx 格式的支付宝应用 ID" />
              </Form.Item>
              
              <Form.Item label="应用私钥 (App Private Key)" name="private_key" rules={[{ required: true, message: '请输入支付宝应用私钥' }]}>
                <Input.TextArea rows={8} placeholder="请贴入 RSA2 的应用私钥内容" />
              </Form.Item>
              
              <Form.Item label="支付宝公钥 (Alipay Public Key)" name="alipay_public_key" rules={[{ required: true, message: '请输入支付宝公钥 (非应用公钥)' }]}>
                <Input.TextArea rows={6} placeholder="请贴入支付宝公钥，用于系统回调验签" />
              </Form.Item>

              <Form.Item>
                <Button type="primary" htmlType="submit" loading={loadingAlipay} size="large" style={{ backgroundColor: '#1677ff' }}>
                  {t('common.save')}支付宝配置
                </Button>
              </Form.Item>
            </Form>
          </div>
        </TabPane>
      </Tabs>
    </Card>
  );
};

export default PaymentSettings;
