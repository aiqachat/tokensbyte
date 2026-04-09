import React, { useEffect, useState } from 'react';
import { Card, Form, Input, Button, Tabs, InputNumber, message, Typography, Space } from 'antd';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';

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

const Settings: React.FC = () => {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('1');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await (request.get('/settings') as any);
      const { site, currency } = response;
      form.setFieldsValue({
        ...site,
        ...currency,
      });
    } catch (error) {
      console.error('Failed to fetch settings:', error);
      message.error(t('common.error'));
    }
  };

  const onFinish = async (values: any) => {
    setLoading(true);
    try {
      const site: SiteSettings = {
        name: values.name,
        title: values.title,
        keywords: values.keywords,
        description: values.description,
      };
      
      const currency: CurrencySettings = {
        default_currency: values.default_currency,
        currency_symbol: values.currency_symbol,
        currency_unit: values.currency_unit,
        token_ratio: values.token_ratio,
      };

      await request.post('/settings', { site, currency });
      message.success(t('settings.save_success'));
      
      // Update browser title if it's the site title being changed
      if (values.title) {
          document.title = values.title;
      }
    } catch (error) {
      console.error('Failed to update settings:', error);
      message.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  const tabsItems = [
    {
      key: '1',
      label: t('settings.basic_tab'),
      children: (
        <div style={{ maxWidth: 600 }}>
          <Form.Item
            label={t('settings.site_name')}
            name="name"
            rules={[{ required: true }]}
          >
            <Input placeholder="TokensByte" />
          </Form.Item>
          <Form.Item
            label={t('settings.site_title')}
            name="title"
            rules={[{ required: true }]}
          >
            <Input placeholder="TokensByte - LLM API Gateway" />
          </Form.Item>
          <Form.Item
            label={t('settings.site_keywords')}
            name="keywords"
          >
            <Input.TextArea rows={2} placeholder="LLM, API, Gateway" />
          </Form.Item>
          <Form.Item
            label={t('settings.site_description')}
            name="description"
          >
            <Input.TextArea rows={4} placeholder="Description..." />
          </Form.Item>
        </div>
      ),
    },
    {
      key: '2',
      label: t('settings.currency_tab'),
      children: (
        <div style={{ maxWidth: 600 }}>
          <Form.Item
            label={t('settings.default_currency')}
            name="default_currency"
            rules={[{ required: true }]}
          >
            <Input placeholder="CNY" />
          </Form.Item>
          <Form.Item
            label={t('settings.currency_symbol')}
            name="currency_symbol"
            rules={[{ required: true }]}
          >
            <Input placeholder="¥" />
          </Form.Item>
          <Form.Item
            label={t('settings.currency_unit')}
            name="currency_unit"
            rules={[{ required: true }]}
          >
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
      ),
    },
  ];

  return (
    <Card bordered={false}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Title level={3}>{t('settings.title')}</Title>
        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          autoComplete="off"
        >
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            items={tabsItems}
          />
          <Form.Item style={{ marginTop: 24 }}>
            <Button type="primary" htmlType="submit" loading={loading} size="large">
              {t('common.save')}
            </Button>
          </Form.Item>
        </Form>
      </Space>
    </Card>
  );
};

export default Settings;
