import React, { useEffect, useState } from 'react';
import { Card, Form, Input, Button, InputNumber, message, Typography, Space, Switch, Radio, Tabs } from 'antd';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import request from '../../utils/request';
import useSettingsStore from '../../store/settings';

const { Text } = Typography;

const Settings: React.FC = () => {
  const { t } = useTranslation();
  const { updateStoreSettings } = useSettingsStore();
  const [searchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'basic';

  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [basicSubTab, setBasicSubTab] = useState('site');

  const getTitle = () => {
    switch(tab) {
      case 'currency': return t('menu.currency_settings');
      case 'database': return '数据库设置';
      default: return t('menu.basic_settings');
    }
  };

  useEffect(() => {
    fetchSettings();
  }, [tab]);

  const fetchSettings = async () => {
    try {
      const response = await (request.get('/settings') as any);
      const { site, currency, registration, smtp, database: backendDatabase } = response;
      
      const defaultDatabase = {
        db_type: 'postgres',
        host: 'localhost',
        port: 5432,
        database: 'postgres',
        username: 'postgres',
        password: 'postgres',
        ssl_mode: false,
      };

      const database = { ...defaultDatabase, ...backendDatabase };

      form.setFieldsValue({
        ...site,
        ...currency,
        ...registration,
        smtp,
        database,
      });
    } catch (error) {
      console.error('Failed to fetch settings:', error);
      message.error(t('common.error'));
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const values = form.getFieldsValue(true);
      let payload: any = {};
      
      if (tab === 'basic') {
        // Save all basic sub-tabs together
        payload.site = {
          name: values.name || '',
          logo: values.logo || '',
          title: values.title || '',
          keywords: values.keywords || '',
          description: values.description || '',
          favicon: values.favicon || '',
          login_title: values.login_title || '',
          login_subtitle: values.login_subtitle || '',
          enable_multilingual: values.enable_multilingual !== false,
        };
        payload.registration = {
          enable_username_registration: !!values.enable_username_registration,
          enable_email_registration: !!values.enable_email_registration,
          enable_password_recovery: !!values.enable_password_recovery,
        };
        if (values.smtp) payload.smtp = values.smtp;
      } else if (tab === 'currency') {
        payload.currency = {
          default_currency: values.default_currency,
          currency_symbol: values.currency_symbol,
          currency_unit: values.currency_unit,
          token_ratio: values.token_ratio,
        };
      } else if (tab === 'database') {
        payload.database = values.database;
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

  const siteSettingsContent = (
    <div style={{ maxWidth: 600 }}>
      <Form.Item label={t('settings.site_name')} name="name" rules={[{ required: true }]}>
        <Input placeholder="TokensByte" />
      </Form.Item>
      <Form.Item 
        label="站点 Logo" 
        name="logo" 
        extra={<Text type="secondary">支持图片链接，建议尺寸 32x32 或 40x40，留空则仅显示站点名称文字</Text>}
      >
        <Input placeholder="https://example.com/logo.png" />
      </Form.Item>
      <Form.Item label={t('settings.site_title')} name="title" rules={[{ required: true }]}>
        <Input placeholder="TokensByte - LLM API Gateway" />
      </Form.Item>
      <Form.Item 
        label="站点图标 (Favicon)" 
        name="favicon" 
        extra={<Text type="secondary">支持 .ico / .png / .svg 格式的图片链接，留空则使用默认图标</Text>}
      >
        <Input placeholder="https://example.com/favicon.ico" />
      </Form.Item>
      <Form.Item label={t('settings.site_keywords')} name="keywords">
        <Input.TextArea rows={2} placeholder="LLM, API, Gateway" />
      </Form.Item>
      <Form.Item label={t('settings.site_description')} name="description">
        <Input.TextArea rows={4} placeholder="Description..." />
      </Form.Item>
      <Form.Item 
        label="站点多语言" 
        name="enable_multilingual" 
        valuePropName="checked"
        extra={<Text type="secondary">开启后，页面右上角将显示中英文语言切换按钮</Text>}
      >
        <Switch />
      </Form.Item>
    </div>
  );

  const loginSettingsContent = (
    <div style={{ maxWidth: 600 }}>
      <Form.Item 
        label="登录页标题" 
        name="login_title" 
        extra={<Text type="secondary">显示在登录页面的主标题位置，留空则使用站点名称</Text>}
      >
        <Input placeholder="例如：TokensByte" />
      </Form.Item>
      <Form.Item 
        label="登录页副标题" 
        name="login_subtitle" 
        extra={<Text type="secondary">显示在登录页标题下方的描述文字，留空则使用默认文字</Text>}
      >
        <Input placeholder="例如：Next-gen LLM API Gateway" />
      </Form.Item>
    </div>
  );

  const registrationSettingsContent = (
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

      <Form.Item noStyle dependencies={['enable_email_registration']}>
        {({ getFieldValue }) => {
          const enableEmailReg = getFieldValue('enable_email_registration');
          return enableEmailReg ? (
            <div style={{ padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', marginBottom: '24px' }}>
              <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 16 }}>{t('settings.smtp_title')}</Typography.Title>
              <Form.Item label={t('settings.smtp_host')} name={['smtp', 'host']} rules={[{ required: true }]}>
                <Input placeholder="smtp.gmail.com" />
              </Form.Item>
              <Form.Item label={t('settings.smtp_port')} name={['smtp', 'port']} rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} placeholder="465" />
              </Form.Item>
              <Form.Item label={t('settings.smtp_user')} name={['smtp', 'username']} rules={[{ required: true }]}>
                <Input placeholder="user@gmail.com" />
              </Form.Item>
              <Form.Item label={t('settings.smtp_pass')} name={['smtp', 'password']}>
                <Input.Password placeholder="Leave empty to keep current password" />
              </Form.Item>
              <Form.Item label={t('settings.from_address')} name={['smtp', 'from_address']} rules={[{ required: true }]}>
                <Input placeholder="noreply@tokensbyte.com" />
              </Form.Item>
              <Form.Item label={t('settings.from_name')} name={['smtp', 'from_name']} rules={[{ required: true }]}>
                <Input placeholder="TokensByte" />
              </Form.Item>
            </div>
          ) : null;
        }}
      </Form.Item>

      <Form.Item 
        label={t('settings.enable_password_recovery')} 
        name="enable_password_recovery" 
        valuePropName="checked"
      >
        <Switch />
      </Form.Item>
    </div>
  );

  return (
    <Card 
      bordered={false} 
      title={getTitle()}
      style={{ borderRadius: 12 }}
    >
      <Form
        form={form}
        layout="vertical"
        autoComplete="off"
        initialValues={{
          database: {
            db_type: 'postgres',
            host: 'localhost',
            port: 5432,
            database: 'postgres',
            username: 'postgres',
            password: 'postgres',
            ssl_mode: false,
          }
        }}
      >
        {tab === 'basic' && (
          <Tabs
            activeKey={basicSubTab}
            onChange={setBasicSubTab}
            items={[
              { key: 'site', label: '站点信息', children: siteSettingsContent },
              { key: 'login', label: '登录设置', children: loginSettingsContent },
              { key: 'registration', label: '注册设置', children: registrationSettingsContent },
            ]}
          />
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
            <Form.Item noStyle dependencies={['default_currency']}>
              {({ getFieldValue }) => {
                const defaultCurrency = getFieldValue('default_currency') || 'USD';
                return (
                  <Form.Item 
                    label={t('settings.token_ratio')} 
                    name="token_ratio" 
                    rules={[{ required: true }]}
                    extra={<Text type="secondary">{`1 ${defaultCurrency} = N Tokens`}</Text>}
                  >
                    <InputNumber style={{ width: '100%' }} min={0} step={0.0001} />
                  </Form.Item>
                );
              }}
            </Form.Item>
          </div>
        )}

        {tab === 'database' && (
          <div style={{ maxWidth: 600 }}>
            <Form.Item label="数据库类型" name={['database', 'db_type']} rules={[{ required: true }]}>
              <Radio.Group>
                <Radio.Button value="postgres">PostgreSQL</Radio.Button>
              </Radio.Group>
            </Form.Item>
            <Form.Item label="数据库地址 (Host)" name={['database', 'host']} rules={[{ required: true }]}>
              <Input placeholder="localhost" />
            </Form.Item>
            <Form.Item label="端口 (Port)" name={['database', 'port']} rules={[{ required: true }]}>
              <InputNumber style={{ width: '100%' }} placeholder="5432" />
            </Form.Item>
            <Form.Item label="数据库名称 (Database)" name={['database', 'database']} rules={[{ required: true }]}>
              <Input placeholder="postgres" />
            </Form.Item>
            <Form.Item label="用户名 (Username)" name={['database', 'username']} rules={[{ required: true }]}>
              <Input placeholder="postgres" />
            </Form.Item>
            <Form.Item label="密码 (Password)" name={['database', 'password']}>
              <Input.Password placeholder="postgres" />
            </Form.Item>
            <Form.Item label="启用 SSL" name={['database', 'ssl_mode']} valuePropName="checked">
              <Switch />
            </Form.Item>
            
            <Space style={{ marginBottom: 24 }}>
              <Button 
                onClick={async () => {
                  try {
                    const values = await form.validateFields();
                    const res = await (request.post('/settings/database/verify', values.database) as any);
                    if (res.success) {
                      message.success(res.message);
                    } else {
                      message.error(res.message);
                    }
                  } catch (e) {
                    message.error("验证失败");
                  }
                }}
              >
                测试连接
              </Button>
              <Button 
                danger
                onClick={async () => {
                  try {
                    const values = await form.validateFields();
                    const res = await (request.post('/settings/database/initialize', values.database) as any);
                    if (res.success) {
                      message.success(res.message);
                    } else {
                      message.error(res.message);
                    }
                  } catch (e) {
                    message.error("初始化失败");
                  }
                }}
              >
                初始化数据库
              </Button>
              <Button 
                onClick={async () => {
                   try {
                    const res = await (request.post('/settings/database/backup') as any);
                    if (res.success) {
                      message.success(res.message);
                    } else {
                      message.error(res.message);
                    }
                  } catch (e) {
                    message.error("备份失败");
                  }
                }}
              >
                执行备份
              </Button>
            </Space>
          </div>
        )}

        <Form.Item style={{ marginTop: 24 }}>
          <Button type="primary" onClick={handleSave} loading={loading} size="large">
            {t('common.save')}
          </Button>
        </Form.Item>
      </Form>
    </Card>
  );
};

export default Settings;
