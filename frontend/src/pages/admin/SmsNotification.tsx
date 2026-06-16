import React, { useEffect, useState } from 'react';
import { Card, Form, Input, Button, message, Typography, Space } from 'antd';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';
import useSettingsStore from '../../store/settings';

const SmsNotification: React.FC = () => {
  const { t } = useTranslation();
  const { updateStoreSettings } = useSettingsStore();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [testMobile, setTestMobile] = useState('');
  const [testLoading, setTestLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await (request.get('/settings/full') as any);
        if (res.sms) form.setFieldsValue(res.sms);
      } catch { /* ignore */ }
    })();
  }, []);

  const handleSave = async () => {
    setLoading(true);
    try {
      const values = await form.validateFields();
      const res = await (request.post('/settings', { sms: values }) as any);
      message.success(t('settings.save_success'));
      updateStoreSettings(res);
    } catch (e) {
      message.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    if (!testMobile) { message.warning(t('settings.test_mobile_placeholder')); return; }
    setTestLoading(true);
    try {
      const res = await (request.post('/settings/sms/test', { mobile: testMobile }) as any);
      res.success ? message.success(res.message) : message.error(res.message);
    } catch (e: any) {
      message.error(e?.message || '发送失败');
    } finally {
      setTestLoading(false);
    }
  };

  return (
    <div style={{ paddingTop: 12 }}>
      <Form form={form} layout="vertical" autoComplete="off" style={{ maxWidth: 600 }}>
        <Form.Item label={t('settings.sms_secret_id')} name="secret_id" rules={[{ required: true }]}><Input placeholder="AKIDxxxxxxxx" /></Form.Item>
        <Form.Item label={t('settings.sms_secret_key')} name="secret_key" rules={[{ required: true }]}><Input.Password placeholder="请输入 SecretKey" /></Form.Item>
        <Form.Item label={t('settings.sms_sdk_app_id')} name="sdk_app_id" rules={[{ required: true }]}><Input placeholder="1400000000" /></Form.Item>
        <Form.Item label={t('settings.sms_sign_name')} name="sign_name" rules={[{ required: true }]}><Input placeholder="已审核的短信签名" /></Form.Item>
        <Form.Item label={t('settings.sms_template_id')} name="template_id" rules={[{ required: true }]}><Input placeholder="123456" /></Form.Item>

        <Space style={{ marginBottom: 24 }}>
          <Button type="primary" onClick={handleSave} loading={loading}>{t('common.save')}</Button>
        </Space>

        <Typography.Title level={5} style={{ marginTop: 16 }}>{t('settings.test_sms')}</Typography.Title>
        <Space>
          <Input placeholder={t('settings.test_mobile_placeholder')} value={testMobile} onChange={e => setTestMobile(e.target.value)} style={{ width: 300 }} />
          <Button onClick={handleTest} loading={testLoading}>{t('settings.test_sms')}</Button>
        </Space>
      </Form>
    </div>
  );
};

export default SmsNotification;
