import React, { useEffect, useState } from 'react';
import { Card, Form, Switch, InputNumber, Button, message, Typography, Radio, Space, Spin, Divider } from 'antd';
import { useTranslation } from 'react-i18next';
import { SaveOutlined, GiftOutlined } from '@ant-design/icons';
import request from '../../../utils/request';
import useSettingsStore from '../../../store/settings';
import type { MarketingSettings } from '../../../types';
import { useThemeStore } from '../../../store/theme';

const { Title, Text } = Typography;

const RegistrationGifts: React.FC = () => {
  const { themeMode } = useThemeStore();
  const _isLight = themeMode === 'light';
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const { fetchSettings } = useSettingsStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [giftMode, setGiftMode] = useState<'fixed' | 'random'>('fixed');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const response = await (request.get('/settings') as any);
      
      const marketing = response.marketing || {
        enable_registration_gift: false,
        gift_mode: 'fixed',
        fixed_amount: 0,
        min_amount: 0,
        max_amount: 0,
      };

      setGiftMode(marketing.gift_mode);
      form.setFieldsValue({
        ...marketing,
      });
    } catch (error) {
      console.error('Failed to load settings:', error);
      message.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  const onFinish = async (values: MarketingSettings) => {
    setSaving(true);
    try {
      await request.post('/settings', { marketing: values });
      message.success(t('marketing.save_success'));
      fetchSettings(); // Refresh global state if needed
    } catch (error) {
      console.error('Failed to save settings:', error);
      message.error(t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card bordered={false}>
        <div style={{ textAlign: 'center', padding: '50px' }}>
          <Spin size="large" />
        </div>
      </Card>
    );
  }

  return (
    <Card bordered={false} style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ 
          width: 48, height: 48, borderRadius: 12, 
          background: 'rgba(22, 119, 255, 0.1)', 
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#1677ff', fontSize: 24
        }}>
          <GiftOutlined />
        </div>
        <div>
          <Title level={4} style={{ margin: 0 }}>{t('marketing.registration_gift_title')}</Title>
          <Text type="secondary">{t('menu.marketing')}</Text>
        </div>
      </div>
      
      <Divider />

      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        initialValues={{ gift_mode: 'fixed' }}
        style={{ maxWidth: 600 }}
      >
        <Form.Item
          name="enable_registration_gift"
          label={t('marketing.enable_gift')}
          valuePropName="checked"
        >
          <Switch />
        </Form.Item>

        <Form.Item dependencies={['enable_registration_gift']} noStyle>
          {({ getFieldValue }) => {
            const isEnabled = getFieldValue('enable_registration_gift');
            if (!isEnabled) return null;

            return (
              <div style={{ 
                background: _isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)', 
                padding: '24px', 
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.05)',
                marginTop: 24 
              }}>
                <Form.Item
                  name="gift_mode"
                  label={t('marketing.gift_mode')}
                  rules={[{ required: true }]}
                >
                  <Radio.Group onChange={(e) => setGiftMode(e.target.value)}>
                    <Space>
                      <Radio.Button value="fixed">{t('marketing.mode_fixed')}</Radio.Button>
                      <Radio.Button value="random">{t('marketing.mode_random')}</Radio.Button>
                    </Space>
                  </Radio.Group>
                </Form.Item>

                {giftMode === 'fixed' && (
                  <Form.Item
                    name="fixed_amount"
                    label={t('marketing.fixed_amount')}
                    rules={[{ required: true }]}
                  >
                    <InputNumber min={0} precision={2} style={{ width: '100%' }} size="large" />
                  </Form.Item>
                )}

                {giftMode === 'random' && (
                  <Space style={{ width: '100%' }} align="start">
                    <Form.Item
                      name="min_amount"
                      label={t('marketing.min_amount')}
                      rules={[{ required: true }]}
                      style={{ width: '100%' }}
                    >
                      <InputNumber min={0} precision={2} style={{ width: '100%' }} size="large" />
                    </Form.Item>
                    <Form.Item
                      name="max_amount"
                      label={t('marketing.max_amount')}
                      rules={[{ required: true }]}
                      style={{ width: '100%' }}
                    >
                      <InputNumber min={0} precision={2} style={{ width: '100%' }} size="large" />
                    </Form.Item>
                  </Space>
                )}
              </div>
            );
          }}
        </Form.Item>

        <Form.Item style={{ marginTop: 24 }}>
          <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving} size="large">
            {t('common.save')}
          </Button>
        </Form.Item>
      </Form>
    </Card>
  );
};

export default RegistrationGifts;
