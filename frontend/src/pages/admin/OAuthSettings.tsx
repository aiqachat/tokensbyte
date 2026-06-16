import React, { useEffect, useState } from 'react';
import { Card, Form, Input, Button, message, Typography, Tabs, Space, Tooltip } from 'antd';
import { CopyOutlined, LinkOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';
import useSettingsStore from '../../store/settings';

const { Text } = Typography;

const OAuthSettings: React.FC = () => {
  const { t } = useTranslation();
  const { settings, updateStoreSettings } = useSettingsStore();
  const [googleForm] = Form.useForm();
  const [wechatForm] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [siteUrl, setSiteUrl] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await (request.get('/settings/full') as any);
        if (res.google_oauth) googleForm.setFieldsValue(res.google_oauth);
        if (res.wechat_oauth) wechatForm.setFieldsValue(res.wechat_oauth);
        const base = res.site?.name ? window.location.origin : window.location.origin;
        setSiteUrl(base);
      } catch { /* ignore */ }
    })();
  }, []);

  const handleSaveGoogle = async () => {
    setLoading(true);
    try {
      const values = await googleForm.validateFields();
      const res = await (request.post('/settings', { google_oauth: values }) as any);
      message.success(t('settings.save_success'));
      updateStoreSettings(res);
    } catch { message.error(t('common.error')); }
    finally { setLoading(false); }
  };

  const handleSaveWechat = async () => {
    setLoading(true);
    try {
      const values = await wechatForm.validateFields();
      const res = await (request.post('/settings', { wechat_oauth: values }) as any);
      message.success(t('settings.save_success'));
      updateStoreSettings(res);
    } catch { message.error(t('common.error')); }
    finally { setLoading(false); }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    message.success('已复制到剪贴板');
  };

  const googleCallbackUrl = `${siteUrl}/api/v1/auth/oauth/google/callback`;
  const wechatCallbackDomain = siteUrl.replace(/^https?:\/\//, '');

  const googleTab = (
    <Form form={googleForm} layout="vertical" autoComplete="off" style={{ maxWidth: 600 }}>
      <Form.Item label={t('settings.google_client_id')} name="client_id" rules={[{ required: true }]}>
        <Input placeholder="xxxx.apps.googleusercontent.com" />
      </Form.Item>
      <Form.Item label={t('settings.google_client_secret')} name="client_secret" rules={[{ required: true }]}>
        <Input.Password placeholder="请输入 Client Secret" />
      </Form.Item>
      <Form.Item label={t('settings.callback_url')}>
        <Space.Compact style={{ display: 'flex' }}>
          <Input value={googleCallbackUrl} readOnly />
          <Button icon={<CopyOutlined />} onClick={() => copyToClipboard(googleCallbackUrl)}>{t('settings.copy_callback_url')}</Button>
        </Space.Compact>
        <Text type="secondary" style={{ display: 'block', marginTop: 4 }}>请将此地址添加到 Google Cloud Console 的「已授权的重定向 URI」中</Text>
      </Form.Item>
      <Space>
        <Button type="primary" onClick={handleSaveGoogle} loading={loading}>{t('common.save')}</Button>
        <Button type="link" icon={<LinkOutlined />} href="https://console.cloud.google.com/apis/credentials" target="_blank">
          {t('settings.doc_link')}
        </Button>
      </Space>
    </Form>
  );

  const wechatTab = (
    <Form form={wechatForm} layout="vertical" autoComplete="off" style={{ maxWidth: 600 }}>
      <Form.Item label={t('settings.wechat_app_id')} name="app_id" rules={[{ required: true }]}>
        <Input placeholder="wxxxxxxxxxxx" />
      </Form.Item>
      <Form.Item label={t('settings.wechat_app_secret')} name="app_secret" rules={[{ required: true }]}>
        <Input.Password placeholder="请输入网站应用密钥" />
      </Form.Item>
      <Form.Item label="授权回调域">
        <Space.Compact style={{ display: 'flex' }}>
          <Input value={wechatCallbackDomain} readOnly />
          <Button icon={<CopyOutlined />} onClick={() => copyToClipboard(wechatCallbackDomain)}>{t('settings.copy_callback_url')}</Button>
        </Space.Compact>
        <Text type="secondary" style={{ display: 'block', marginTop: 4 }}>请将此域名填写到微信开放平台 → 网站应用 → 开发信息 → 授权回调域中</Text>
      </Form.Item>
      <Space>
        <Button type="primary" onClick={handleSaveWechat} loading={loading}>{t('common.save')}</Button>
        <Button type="link" icon={<LinkOutlined />} href="https://developers.weixin.qq.com/doc/oplatform/Website_App/WeChat_Login/Wechat_Login.html" target="_blank">
          {t('settings.doc_link')}
        </Button>
      </Space>
    </Form>
  );

  return (
    <Card bordered={false} title={t('settings.oauth_title')} style={{ borderRadius: 12 }}>
      <Tabs items={[
        { key: 'google', label: t('settings.google_oauth_tab'), children: googleTab },
        { key: 'wechat', label: t('settings.wechat_oauth_tab'), children: wechatTab },
      ]} />
    </Card>
  );
};

export default OAuthSettings;
