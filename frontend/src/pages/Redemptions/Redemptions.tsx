/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import React, { useEffect, useState } from 'react';
import {
  Table, Tag, Card, Typography, Space, Button, Modal, Form, Input, InputNumber,
  Popconfirm, Switch, App, Radio, DatePicker,
} from 'antd';
import {
  SyncOutlined,
  PlusOutlined,
  DeleteOutlined,
  CopyOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';
import useSettingsStore from '../../store/settings';
import type { Redemption } from '../../types';
import dayjs from 'dayjs';
import { isRedemptionExpired } from '../../utils/quotaPeriod';

const { Title, Text } = Typography;

interface GenerateResponse {
  success: boolean;
  count: number;
  codes: string[];
}

const Redemptions: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { message: msgApi, modal } = App.useApp();
  const isZh = i18n.language === 'zh';
  const { settings, updateStoreSettings, fetchSettings } = useSettingsStore();
  const currencySymbol = settings?.currency?.currency_symbol || '$';
  const quotaTz = settings?.site?.default_timezone || 'Asia/Shanghai';
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggleLoading, setToggleLoading] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form] = Form.useForm();

  const permanent = Form.useWatch('permanent', form);
  const allowMultiple = Form.useWatch('allow_multiple', form);

  const fetchRedemptions = async () => {
    setLoading(true);
    try {
      const resp = await (request.get('/redemptions') as unknown as Promise<{ data: Redemption[] }>);
      setRedemptions(resp.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadFeatureFlag = async () => {
    try {
      const res = await (request.get('/settings/full') as any);
      const on = !!res?.marketing?.enable_redemption;
      setEnabled(on);
      if (res) {
        updateStoreSettings({
          ...(settings || {}),
          ...res,
        } as any);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleRedemption = async (checked: boolean) => {
    setToggleLoading(true);
    try {
      const res = await (request.post('/settings', {
        marketing: { enable_redemption: checked },
      }) as any);
      setEnabled(checked);
      updateStoreSettings(res);
      await fetchSettings(true);
      msgApi.success(
        checked
          ? (isZh ? '已开启兑换功能' : 'Redemption enabled')
          : (isZh ? '已关闭兑换功能' : 'Redemption disabled'),
      );
    } catch (e) {
      console.error(e);
      msgApi.error(isZh ? '保存失败' : 'Save failed');
    } finally {
      setToggleLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
          msgApi.success(t('common.copied'));
        });
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
          document.execCommand('copy');
          msgApi.success(t('common.copied'));
        } finally {
          textArea.remove();
        }
      }
    } catch {
      msgApi.error(isZh ? '复制失败，请手动选择复制' : 'Failed to copy, please select manually');
    }
  };

  const handleCreate = async (values: any) => {
    try {
      const payload = {
        name: values.name,
        count: values.count,
        quota: values.quota,
        permanent: !!values.permanent,
        expires_at: values.permanent
          ? null
          : (values.expires_at ? dayjs(values.expires_at).format('YYYY-MM-DD') : null),
        allow_multiple: !!values.allow_multiple,
        max_uses: values.allow_multiple ? Number(values.max_uses ?? -1) : 1,
        per_user_limit: values.allow_multiple ? Number(values.per_user_limit ?? -1) : 1,
      };

      const resp = await (request.post('/redemptions', payload) as unknown as Promise<GenerateResponse>);
      if (resp.success) {
        msgApi.success(t('common.success'));
        setIsModalOpen(false);
        form.resetFields();
        fetchRedemptions();

        modal.success({
          title: t('redemptions.codes_generated'),
          content: (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <Text type="secondary" style={{ fontSize: 13 }}>
                  {isZh ? '您可以点击右侧按钮单独复制，或一键复制全部代码' : 'Copy individual codes or copy all at once.'}
                </Text>
                <Button
                  type="primary"
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={() => copyToClipboard(resp.codes.join('\n'))}
                  style={{ borderRadius: 6 }}
                >
                  {isZh ? '复制全部' : 'Copy All'}
                </Button>
              </div>
              <div
                style={{
                  maxHeight: 280,
                  overflowY: 'auto',
                  borderRadius: 10,
                  border: '1px solid var(--ant-color-border-secondary)',
                  background: 'var(--ant-color-bg-layout)',
                  padding: '4px 0',
                }}
              >
                {resp.codes.map((code: string) => (
                  <div
                    key={code}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 16px',
                      borderBottom: '1px solid var(--ant-color-border-secondary)',
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontWeight: 600,
                        fontSize: 14,
                        letterSpacing: '0.5px',
                        color: 'var(--ant-color-text)',
                        userSelect: 'all',
                      }}
                    >
                      {code}
                    </span>
                    <Button
                      type="text"
                      icon={<CopyOutlined />}
                      size="small"
                      onClick={() => copyToClipboard(code)}
                      style={{
                        color: '#1677ff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 4,
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          ),
          width: 480,
          okText: t('common.ok'),
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await request.delete(`/redemptions/${id}`);
      msgApi.success(t('common.success'));
      fetchRedemptions();
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchRedemptions();
    loadFeatureFlag();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formatExpiry = (record: Redemption) => {
    if (!record.expires_at) {
      return <Tag color="blue">{isZh ? '长期有效' : 'Permanent'}</Tag>;
    }
    const expired = isRedemptionExpired(record.expires_at, quotaTz);
    const dateLabel = String(record.expires_at).trim().slice(0, 10);
    return (
      <Tag color={expired ? 'error' : 'processing'}>
        {dateLabel}
        {expired ? (isZh ? ' · 已过期' : ' · Expired') : ''}
      </Tag>
    );
  };

  const formatUses = (record: Redemption) => {
    const used = record.used_count ?? (record.is_used ? 1 : 0);
    const max = record.max_uses ?? 1;
    if (max <= 0) {
      return `${used} / ${isZh ? '不限' : '∞'}`;
    }
    return `${used} / ${max}`;
  };

  const formatPerUser = (record: Redemption) => {
    const limit = record.per_user_limit ?? 1;
    if (limit <= 0) return isZh ? '不限' : 'Unlimited';
    return isZh ? `${limit} 次/人` : `${limit}/user`;
  };

  const columns = [
    {
      title: t('redemptions.name'),
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: t('redemptions.code'),
      dataIndex: 'code',
      key: 'code',
      render: (code: string) => <Text code>{code}</Text>,
    },
    {
      title: t('redemptions.quota'),
      dataIndex: 'quota',
      key: 'quota',
      render: (q: number) => <Text strong>{currencySymbol}{q.toFixed(6)}</Text>,
    },
    {
      title: isZh ? '有效期' : 'Validity',
      key: 'expires_at',
      render: (_: unknown, record: Redemption) => formatExpiry(record),
    },
    {
      title: isZh ? '已用/单码次数' : 'Used / Per Code',
      key: 'uses',
      render: (_: unknown, record: Redemption) => formatUses(record),
    },
    {
      title: isZh ? '单码单用户' : 'Per Code / User',
      key: 'per_user',
      render: (_: unknown, record: Redemption) => formatPerUser(record),
    },
    {
      title: t('redemptions.status'),
      key: 'status',
      render: (_: unknown, record: Redemption) => {
        const expired = isRedemptionExpired(record.expires_at, quotaTz);
        const max = record.max_uses ?? 1;
        const used = record.used_count ?? (record.is_used ? 1 : 0);
        const exhausted = (max > 0 && used >= max) || (!!record.is_used && max === 1);
        if (expired) return <Tag color="error">{isZh ? '已过期' : 'Expired'}</Tag>;
        if (exhausted) return <Tag color="error">{isZh ? '已用完' : 'Exhausted'}</Tag>;
        return <Tag color="success">{isZh ? '可用' : 'Available'}</Tag>;
      },
    },
    {
      title: t('redemptions.created_at'),
      dataIndex: 'created_at',
      key: 'created_at',
      render: (t: string) => dayjs(t).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: t('common.actions'),
      key: 'actions',
      render: (_: unknown, record: Redemption) => (
        <Space>
          <Popconfirm title={t('common.confirm_delete')} onConfirm={() => handleDelete(record.id)}>
            <Button icon={<DeleteOutlined />} danger size="small" />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card variant="borderless">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <Title level={2} style={{ margin: 0 }}>{t('redemptions.title')}</Title>
        <Space>
          <Button icon={<SyncOutlined />} onClick={fetchRedemptions}>{t('common.refresh')}</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsModalOpen(true)}>
            {t('redemptions.add')}
          </Button>
        </Space>
      </div>

      <div
        style={{
          marginBottom: 24,
          padding: '12px 16px',
          borderRadius: 8,
          border: '1px solid var(--ant-color-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <Text strong>{isZh ? '兑换功能' : 'Redemption Feature'}</Text>
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {isZh
                ? '开启后，用户可在「钱包与账户」页面使用兑换码充值余额。'
                : 'When enabled, users can redeem codes on the Wallet page.'}
            </Text>
          </div>
        </div>
        <Switch
          checked={enabled}
          loading={toggleLoading}
          onChange={handleToggleRedemption}
          checkedChildren={isZh ? '开启' : 'On'}
          unCheckedChildren={isZh ? '关闭' : 'Off'}
        />
      </div>

      <Table
        dataSource={redemptions}
        columns={columns}
        rowKey="id"
        loading={loading}
        scroll={{ x: 'max-content' }}
      />

      <Modal
        title={t('redemptions.add')}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        onOk={() => form.submit()}
        okText={t('common.ok')}
        cancelText={t('common.cancel')}
        width={520}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreate}
          initialValues={{
            count: 1,
            quota: 10,
            permanent: true,
            allow_multiple: false,
            max_uses: -1,
            per_user_limit: -1,
          }}
        >
          <Form.Item name="name" label={t('redemptions.name')} rules={[{ required: true }]}>
            <Input placeholder={t('redemptions.name')} />
          </Form.Item>
          <Form.Item name="count" label={isZh ? '生成数量' : t('common.count')} rules={[{ required: true }]}>
            <InputNumber min={1} max={100} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="quota" label={`${t('redemptions.quota')} (${currencySymbol})`} rules={[{ required: true }]}>
            <InputNumber min={0.01} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item name="permanent" label={isZh ? '有效期' : 'Validity'} rules={[{ required: true }]}>
            <Radio.Group>
              <Radio value={true}>{isZh ? '长期有效' : 'Permanent'}</Radio>
              <Radio value={false}>{isZh ? '设置到期日' : 'Set expiry date'}</Radio>
            </Radio.Group>
          </Form.Item>
          {!permanent && (
            <Form.Item
              name="expires_at"
              label={isZh ? '到期日期' : 'Expires on'}
              rules={[{ required: true, message: isZh ? '请选择到期日期' : 'Please select expiry date' }]}
            >
              <DatePicker
                style={{ width: '100%' }}
                disabledDate={(current) => !!current && current < dayjs().startOf('day')}
              />
            </Form.Item>
          )}

          <Form.Item
            name="allow_multiple"
            label={isZh ? '开启多次兑换' : 'Allow multiple redemptions'}
            valuePropName="checked"
            extra={isZh ? '关闭时每个兑换码仅可兑换 1 次' : 'When off, each code can only be redeemed once'}
          >
            <Switch />
          </Form.Item>

          {allowMultiple && (
            <div style={{ display: 'flex', gap: 16 }}>
              <Form.Item
                name="max_uses"
                label={isZh ? '单兑换码兑换次数' : 'Uses per code'}
                rules={[{ required: true }]}
                extra={isZh ? '-1 表示不限制；对每个生成的兑换码分别生效' : '-1 = unlimited; applies to each generated code'}
                style={{ flex: 1, marginBottom: 0 }}
              >
                <InputNumber min={-1} max={100000} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item
                name="per_user_limit"
                label={isZh ? '单兑换码单用户兑换次数' : 'Uses per code per user'}
                rules={[{ required: true }]}
                extra={isZh ? '-1 表示不限制；同一用户对同一兑换码的上限' : '-1 = unlimited; limit for the same user on the same code'}
                style={{ flex: 1, marginBottom: 0 }}
              >
                <InputNumber min={-1} max={10000} style={{ width: '100%' }} />
              </Form.Item>
            </div>
          )}
        </Form>
      </Modal>
    </Card>
  );
};

export default Redemptions;
