import React, { useEffect, useState } from 'react';
import { Card, Form, Input, Button, InputNumber, message, Typography, Space, Switch } from 'antd';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import request from '../../utils/request';
import useSettingsStore from '../../store/settings';

const { Title, Text } = Typography;

interface SiteSettings {
  name: string;
  title: string;
  keywords: string;
  description: string;
}

interface CurrencySettings {
  default_currency: string;
  currency_symbol: string;
  currency_unit: string;
  token_ratio: number;
}

interface RegistrationSettings {
  enable_username_registration: boolean;
  enable_email_registration: boolean;
  enable_password_recovery: boolean;
}

interface SMTPSettings {
  host: string;
  port: number;
  username: string;
  password?: string;
  from_address: string;
  from_name: string;
}

const Settings: React.FC = () => {
  const { t } = useTranslation();
  const { updateStoreSettings } = useSettingsStore();
  const [searchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'basic';

  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const getTitle = () => {
    switch(tab) {
      case 'currency': return t('menu.currency_settings');
      case 'registration': return t('settings.registration_title');
      case 'smtp': return t('settings.smtp_title');
      default: return t('menu.basic_settings');
    }
  };

  useEffect(() => {
    fetchSettings();
  }, [tab]);

  const fetchSettings = async () => {
    try {
      const response = await (request.get('/settings') as any);
      const { site, currency, registration, smtp } = response;
      form.setFieldsValue({
        ...site,
        ...currency,
        ...registration,
        ...smtp,
      });
    } catch (error) {
      console.error('Failed to fetch settings:', error);
      message.error(t('common.error'));
    }
  };

  const onFinish = async (values: any) => {
    setLoading(true);
    try {
      let payload: any = {};
      
      if (tab === 'basic') {
        payload.site = {
          name: values.name,
          title: values.title,
          keywords: values.keywords,
          description: values.description,
        };
      } else if (tab === 'currency') {
        payload.currency = {
          default_currency: values.default_currency,
          currency_symbol: values.currency_symbol,
          currency_unit: values.currency_unit,
          token_ratio: values.token_ratio,
        };
      } else if (tab === 'registration') {
        payload.registration = {
          enable_username_registration: values.enable_username_registration,
          enable_email_registration: values.enable_email_registration,
          enable_password_recovery: values.enable_password_recovery,
        };
      } else if (tab === 'smtp') {
        payload.smtp = {
          host: values.host,
          port: values.port,
          username: values.username,
          password: values.password,
          from_address: values.from_address,
          from_name: values.from_name,
        };
      }

      const updatedSettings = await (request.post('/settings', payload) as any);
      message.success(t('settings.save_success'));
      
      // Update global store
      updateStoreSettings(updatedSettings);
      
      if (payload.site?.title) {
          document.title = payload.site.title;
      }
    } catch (error) {
      console.error('Failed to update settings:', error);
      message.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card 
      bordered={false} 
      title={getTitle()}
      style={{ borderRadius: 12 }}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        autoComplete="off"
      >
        {tab === 'basic' && (
          <div style={{ maxWidth: 600 }}>
            <Form.Item label={t('settings.site_name')} name="name" rules={[{ required: true }]}>
              <Input placeholder="TokensByte" />
            </Form.Item>
            <Form.Item label={t('settings.site_title')} name="title" rules={[{ required: true }]}>
              <Input placeholder="TokensByte - LLM API Gateway" />
            </Form.Item>
            <Form.Item label={t('settings.site_keywords')} name="keywords">
              <Input.TextArea rows={2} placeholder="LLM, API, Gateway" />
            </Form.Item>
            <Form.Item label={t('settings.site_description')} name="description">
              <Input.TextArea rows={4} placeholder="Description..." />
            </Form.Item>
          </div>
        )}

        {tab === 'currency' && (
          <div style={{ maxWidth: 600 }}>
            <Form.Item label={t('settings.default_currency')} name="default_currency" rules={[{ required: true }]}>
              <Input placeholder="CNY" />
            </Form.Item>
            <Form.Item label={t('settings.currency_symbol')} name="currency_symbol" rules={[{ required: true }]}>
              <Input placeholder="¥" />
            </Form.Item>
            <Form.Item label={t('settings.currency_unit')} name="currency_unit" rules={[{ required: true }]}>
              <Input placeholder="元" />
            </Form.Item>
            <Form.Item 
              label={t('settings.token_ratio')} 
              name="token_ratio" 
              rules={[{ required: true }]}
              extra={<Text type="secondary">{t('settings.currency_hint')}</Text>}
            >
              <InputNumber style={{ width: '100%' }} min={0} step={0.0001} />
            </Form.Item>
          </div>
        )}

        {tab === 'registration' && (
          <div style={{ maxWidth: 600 }}>
            <Form.Item 
              label={t('settings.enable_username_reg')} 
              name="enable_username_registration" 
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
            <Form.Item 
              label={t('settings.enable_email_reg')} 
              name="enable_email_registration" 
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
            <Form.Item 
              label={t('settings.enable_password_recovery')} 
              name="enable_password_recovery" 
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
          </div>
        )}

        {tab === 'smtp' && (
          <div style={{ maxWidth: 600 }}>
            <Form.Item label={t('settings.smtp_host')} name="host" rules={[{ required: true }]}>
              <Input placeholder="smtp.gmail.com" />
            </Form.Item>
            <Form.Item label={t('settings.smtp_port')} name="port" rules={[{ required: true }]}>
              <InputNumber style={{ width: '100%' }} placeholder="465" />
            </Form.Item>
            <Form.Item label={t('settings.smtp_user')} name="username" rules={[{ required: true }]}>
              <Input placeholder="user@gmail.com" />
            </Form.Item>
            <Form.Item label={t('settings.smtp_pass')} name="password">
              <Input.Password placeholder="Leave empty to keep current password" />
            </Form.Item>
            <Form.Item label={t('settings.from_address')} name="from_address" rules={[{ required: true }]}>
              <Input placeholder="noreply@tokensbyte.com" />
            </Form.Item>
            <Form.Item label={t('settings.from_name')} name="from_name" rules={[{ required: true }]}>
              <Input placeholder="TokensByte" />
            </Form.Item>
          </div>
        )}

        <Form.Item style={{ marginTop: 24 }}>
          <Button type="primary" htmlType="submit" loading={loading} size="large">
            {t('common.save')}
          </Button>
        </Form.Item>
      </Form>
    </Card>
  );
};

export default Settings;
