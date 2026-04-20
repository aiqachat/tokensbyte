import React, { useEffect, useState } from 'react';
import { Card, Form, Input, Button, InputNumber, message, Typography, Space, Switch, Radio, Tabs, Select, Tag } from 'antd';
import { useTranslation } from 'react-i18next';
import { useSearchParams, useNavigate } from 'react-router-dom';
import request from '../../utils/request';
import useSettingsStore from '../../store/settings';

const { Text } = Typography;

const Settings: React.FC = () => {
  const { t } = useTranslation();
  const { updateStoreSettings } = useSettingsStore();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const tab = searchParams.get('tab') || 'basic';

  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [basicSubTab, setBasicSubTab] = useState('site');

  const getTitle = () => {
    switch (tab) {
      case 'currency': return t('menu.currency_settings');
      case 'database': return '数据库设置';
      default: return t('menu.basic_settings');
    }
  };

  useEffect(() => { fetchSettings(); }, [tab]);

  const fetchSettings = async () => {
    try {
      const response = await (request.get('/settings') as any);
      const { site, currency, login, registration, smtp, database: backendDatabase } = response;
      const defaultDatabase = { db_type: 'postgres', host: 'localhost', port: 5432, database: 'postgres', username: 'postgres', password: 'postgres', ssl_mode: false };
      form.setFieldsValue({
        ...site,
        ...currency,
        login: login || {},
        registration: registration || {},
        smtp,
        database: { ...defaultDatabase, ...backendDatabase },
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
        payload.site = {
          name: values.name || '', logo: values.logo || '', title: values.title || '',
          keywords: values.keywords || '', description: values.description || '',
          favicon: values.favicon || '', login_title: values.login_title || '',
          login_subtitle: values.login_subtitle || '',
          enable_multilingual: values.enable_multilingual !== false,
        };
        payload.login = values.login || {};
        payload.registration = values.registration || {};
      } else if (tab === 'currency') {
        payload.currency = {
          default_currency: values.default_currency, currency_symbol: values.currency_symbol,
          currency_unit: values.currency_unit, token_ratio: values.token_ratio,
        };
      } else if (tab === 'database') {
        payload.database = values.database;
      }

      const updatedSettings = await (request.post('/settings', payload) as any);
      message.success(t('settings.save_success'));
      updateStoreSettings(updatedSettings);
      if (payload.site?.title) document.title = payload.site.title;
    } catch (error) {
      console.error('Failed to update settings:', error);
      message.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  const GoLink: React.FC<{ to: string; text: string }> = ({ to, text }) => (
    <Button type="link" size="small" onClick={() => navigate(to)} style={{ padding: 0, height: 'auto' }}>{text}</Button>
  );

  const siteSettingsContent = (
    <div style={{ maxWidth: 600 }}>
      <Form.Item label={t('settings.site_name')} name="name" rules={[{ required: true }]}><Input placeholder="TokensByte" /></Form.Item>
      <Form.Item label="站点 Logo" name="logo" extra={<Text type="secondary">支持图片链接，建议尺寸 32x32 或 40x40，留空则仅显示站点名称文字</Text>}>
        <Input placeholder="https://example.com/logo.png" />
      </Form.Item>
      <Form.Item label={t('settings.site_title')} name="title" rules={[{ required: true }]}><Input placeholder="TokensByte - LLM API Gateway" /></Form.Item>
      <Form.Item label="站点图标 (Favicon)" name="favicon" extra={<Text type="secondary">支持 .ico / .png / .svg 格式的图片链接</Text>}>
        <Input placeholder="https://example.com/favicon.ico" />
      </Form.Item>
      <Form.Item label={t('settings.site_keywords')} name="keywords"><Input.TextArea rows={2} placeholder="LLM, API, Gateway" /></Form.Item>
      <Form.Item label={t('settings.site_description')} name="description"><Input.TextArea rows={4} placeholder="Description..." /></Form.Item>
      <Form.Item label="站点多语言" name="enable_multilingual" valuePropName="checked" extra={<Text type="secondary">开启后，页面右上角将显示中英文语言切换按钮</Text>}>
        <Switch />
      </Form.Item>
    </div>
  );

  const loginSettingsContent = (
    <div style={{ maxWidth: 600 }}>
      <Form.Item label="登录页标题" name="login_title" extra={<Text type="secondary">留空则使用站点名称</Text>}>
        <Input placeholder="例如：TokensByte" />
      </Form.Item>
      <Form.Item label="登录页副标题" name="login_subtitle" extra={<Text type="secondary">留空则使用默认文字</Text>}>
        <Input placeholder="例如：Next-gen LLM API Gateway" />
      </Form.Item>

      <Typography.Title level={5} style={{ marginTop: 24, marginBottom: 16 }}>{t('settings.login_title')}</Typography.Title>

      <Form.Item label={t('settings.enable_username_login')} name={['login', 'enable_username_login']} valuePropName="checked">
        <Switch />
      </Form.Item>
      <Form.Item label={t('settings.enable_mobile_login')} name={['login', 'enable_mobile_login']} valuePropName="checked"
        extra={<Text type="secondary">{t('settings.login_hint_sms')}，<GoLink to="/admin0755/sms-notification" text={t('settings.goto_settings')} /></Text>}>
        <Switch />
      </Form.Item>
      <Form.Item label={t('settings.enable_email_login')} name={['login', 'enable_email_login']} valuePropName="checked"
        extra={<Text type="secondary">{t('settings.login_hint_email')}，<GoLink to="/admin0755/email-notification" text={t('settings.goto_settings')} /></Text>}>
        <Switch />
      </Form.Item>
      <Form.Item label={t('settings.enable_wechat_login')} name={['login', 'enable_wechat_login']} valuePropName="checked"
        extra={<Text type="secondary">{t('settings.login_hint_oauth')}，<GoLink to="/admin0755/oauth-settings" text={t('settings.goto_settings')} /></Text>}>
        <Switch />
      </Form.Item>
      <Form.Item label={t('settings.enable_google_login')} name={['login', 'enable_google_login']} valuePropName="checked"
        extra={<Text type="secondary">{t('settings.login_hint_oauth')}，<GoLink to="/admin0755/oauth-settings" text={t('settings.goto_settings')} /></Text>}>
        <Switch />
      </Form.Item>
    </div>
  );

  const registrationSettingsContent = (
    <div style={{ maxWidth: 600 }}>
      <Form.Item label={t('settings.enable_username_reg')} name={['registration', 'enable_username_registration']} valuePropName="checked"><Switch /></Form.Item>
      <Form.Item label={t('settings.enable_email_reg')} name={['registration', 'enable_email_registration']} valuePropName="checked"><Switch /></Form.Item>
      <Form.Item label={t('settings.enable_mobile_registration')} name={['registration', 'enable_mobile_registration']} valuePropName="checked"
        extra={<Text type="secondary">{t('settings.login_hint_sms')}，<GoLink to="/admin0755/sms-notification" text={t('settings.goto_settings')} /></Text>}>
        <Switch />
      </Form.Item>
      <Form.Item label={t('settings.enable_password_recovery')} name={['registration', 'enable_password_recovery']} valuePropName="checked"><Switch /></Form.Item>

      <Typography.Title level={5} style={{ marginTop: 24, marginBottom: 16 }}>安全策略</Typography.Title>

      <Form.Item label={t('settings.ip_rate_limit_enabled')} name={['registration', 'ip_rate_limit_enabled']} valuePropName="checked"
        extra={<Text type="secondary">开启后限制同一 IP 每天注册次数</Text>}>
        <Switch />
      </Form.Item>
      <Form.Item noStyle dependencies={[['registration', 'ip_rate_limit_enabled']]}>
        {({ getFieldValue }) => getFieldValue(['registration', 'ip_rate_limit_enabled']) ? (
          <Form.Item label={t('settings.ip_daily_limit')} name={['registration', 'ip_daily_limit']}>
            <InputNumber min={1} max={100} addonAfter={t('settings.ip_daily_limit_unit')} style={{ width: 200 }} />
          </Form.Item>
        ) : null}
      </Form.Item>

      <Form.Item label={t('settings.email_validation_strict')} name={['registration', 'email_validation_strict']} valuePropName="checked"
        extra={<Text type="secondary">开启后邮箱 @ 前仅允许数字、字母和下划线，长度≤25</Text>}>
        <Switch />
      </Form.Item>

      <Form.Item label={t('settings.email_whitelist_enabled')} name={['registration', 'email_whitelist_enabled']} valuePropName="checked"
        extra={<Text type="secondary">开启后仅允许指定域名的邮箱注册</Text>}>
        <Switch />
      </Form.Item>
      <Form.Item noStyle dependencies={[['registration', 'email_whitelist_enabled']]}>
        {({ getFieldValue }) => getFieldValue(['registration', 'email_whitelist_enabled']) ? (
          <Form.Item label="允许的邮箱域名" name={['registration', 'email_whitelist']}>
            <Select mode="tags" placeholder={t('settings.email_whitelist_placeholder')} style={{ width: '100%' }}
              tokenSeparators={[',', ' ']} />
          </Form.Item>
        ) : null}
      </Form.Item>
    </div>
  );

  return (
    <Card bordered={false} title={getTitle()} style={{ borderRadius: 12 }}>
      <Form form={form} layout="vertical" autoComplete="off"
        initialValues={{ database: { db_type: 'postgres', host: 'localhost', port: 5432, database: 'postgres', username: 'postgres', password: 'postgres', ssl_mode: false } }}>

        {tab === 'basic' && (
          <Tabs activeKey={basicSubTab} onChange={setBasicSubTab} items={[
            { key: 'site', label: '站点信息', children: siteSettingsContent },
            { key: 'login', label: '登录设置', children: loginSettingsContent },
            { key: 'registration', label: '注册设置', children: registrationSettingsContent },
          ]} />
        )}

        {tab === 'currency' && (
          <div style={{ maxWidth: 600 }}>
            <Form.Item label={t('settings.default_currency')} name="default_currency" rules={[{ required: true }]}><Input placeholder="CNY" /></Form.Item>
            <Form.Item label={t('settings.currency_symbol')} name="currency_symbol" rules={[{ required: true }]}><Input placeholder="¥" /></Form.Item>
            <Form.Item label={t('settings.currency_unit')} name="currency_unit" rules={[{ required: true }]}><Input placeholder="元" /></Form.Item>
            <Form.Item noStyle dependencies={['default_currency']}>
              {({ getFieldValue }) => {
                const c = getFieldValue('default_currency') || 'USD';
                return (
                  <Form.Item label={t('settings.token_ratio')} name="token_ratio" rules={[{ required: true }]} extra={<Text type="secondary">{`1 ${c} = N Tokens`}</Text>}>
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
              <Radio.Group><Radio.Button value="postgres">PostgreSQL</Radio.Button></Radio.Group>
            </Form.Item>
            <Form.Item label="数据库地址 (Host)" name={['database', 'host']} rules={[{ required: true }]}><Input placeholder="localhost" /></Form.Item>
            <Form.Item label="端口 (Port)" name={['database', 'port']} rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} placeholder="5432" /></Form.Item>
            <Form.Item label="数据库名称" name={['database', 'database']} rules={[{ required: true }]}><Input placeholder="postgres" /></Form.Item>
            <Form.Item label="用户名" name={['database', 'username']} rules={[{ required: true }]}><Input placeholder="postgres" /></Form.Item>
            <Form.Item label="密码" name={['database', 'password']}><Input.Password placeholder="postgres" /></Form.Item>
            <Form.Item label="启用 SSL" name={['database', 'ssl_mode']} valuePropName="checked"><Switch /></Form.Item>
            <Space style={{ marginBottom: 24 }}>
              <Button onClick={async () => {
                try { const v = await form.validateFields(); const r = await (request.post('/settings/database/verify', v.database) as any); r.success ? message.success(r.message) : message.error(r.message); } catch { message.error("验证失败"); }
              }}>测试连接</Button>
              <Button danger onClick={async () => {
                try { const v = await form.validateFields(); const r = await (request.post('/settings/database/initialize', v.database) as any); r.success ? message.success(r.message) : message.error(r.message); } catch { message.error("初始化失败"); }
              }}>初始化数据库</Button>
              <Button onClick={async () => {
                try { const r = await (request.post('/settings/database/backup') as any); r.success ? message.success(r.message) : message.error(r.message); } catch { message.error("备份失败"); }
              }}>执行备份</Button>
            </Space>
          </div>
        )}

        <Form.Item style={{ marginTop: 24 }}>
          <Button type="primary" onClick={handleSave} loading={loading} size="large">{t('common.save')}</Button>
        </Form.Item>
      </Form>
    </Card>
  );
};

export default Settings;
