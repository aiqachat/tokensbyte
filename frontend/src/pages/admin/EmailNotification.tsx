import React, { useEffect, useState } from 'react';
import { Card, Form, Input, InputNumber, Button, message, Typography, Space } from 'antd';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';
import useSettingsStore from '../../store/settings';

const { Text } = Typography;

const EmailNotification: React.FC = () => {
  const { t } = useTranslation();
  const { updateStoreSettings } = useSettingsStore();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [testLoading, setTestLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await (request.get('/settings') as any);
        if (res.smtp) form.setFieldsValue(res.smtp);
      } catch { /* ignore */ }
    })();
  }, []);

  const handleSave = async () => {
    setLoading(true);
    try {
      const values = await form.validateFields();
      const res = await (request.post('/settings', { smtp: values }) as any);
      message.success(t('settings.save_success'));
      updateStoreSettings(res);
    } catch (e) {
      message.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    if (!testEmail) { message.warning(t('settings.test_email_placeholder')); return; }
    setTestLoading(true);
    try {
      const res = await (request.post('/settings/email/test', { to: testEmail }) as any);
      res.success ? message.success(res.message) : message.error(res.message);
    } catch (e: any) {
      message.error(e?.message || '发送失败');
    } finally {
      setTestLoading(false);
    }
  };

  return (
    <Card bordered={false} title={t('menu.email_notification')} style={{ borderRadius: 12 }}>
      <Form form={form} layout="vertical" autoComplete="off" style={{ maxWidth: 600 }}>
        <Form.Item label={t('settings.smtp_host')} name="host" rules={[{ required: true }]}><Input placeholder="smtp.gmail.com" /></Form.Item>
        <Form.Item label={t('settings.smtp_port')} name="port" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} placeholder="465" /></Form.Item>
        <Form.Item label={t('settings.smtp_user')} name="username" rules={[{ required: true }]}><Input placeholder="user@gmail.com" /></Form.Item>
        <Form.Item label={t('settings.smtp_pass')} name="password"><Input.Password placeholder="留空保持不变" /></Form.Item>
        <Form.Item label={t('settings.from_address')} name="from_address" rules={[{ required: true }]}><Input placeholder="noreply@tokensbyte.com" /></Form.Item>
        <Form.Item label={t('settings.from_name')} name="from_name" rules={[{ required: true }]}><Input placeholder="TokensByte" /></Form.Item>

        <Space style={{ marginBottom: 24 }}>
          <Button type="primary" onClick={handleSave} loading={loading}>{t('common.save')}</Button>
        </Space>

        <Typography.Title level={5} style={{ marginTop: 16 }}>{t('settings.test_email')}</Typography.Title>
        <Space>
          <Input placeholder={t('settings.test_email_placeholder')} value={testEmail} onChange={e => setTestEmail(e.target.value)} style={{ width: 300 }} />
          <Button onClick={handleTest} loading={testLoading}>{t('settings.test_email')}</Button>
        </Space>
      </Form>
    </Card>
  );
};

export default EmailNotification;
