import React, { useEffect, useState } from 'react';
import { Table, Button, Space, Tag, Modal, Form, Input, InputNumber, message, Popconfirm, Card, Typography, Tooltip, Row, Col } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, CopyOutlined, SyncOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';
import type { ApiToken } from '../../types';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const Tokens: React.FC = () => {
  const { t } = useTranslation();
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingToken, setEditingToken] = useState<ApiToken | null>(null);
  const [form] = Form.useForm();

  const fetchTokens = async () => {
    setLoading(true);
    try {
      const resp = await (request.get('/tokens') as unknown as Promise<{ data: ApiToken[] }>);
      setTokens(resp.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTokens();
  }, []);

  const handleCopy = (key: string) => {
    navigator.clipboard.writeText(key);
    message.success(t('tokens.copy_success'));
  };

  const handleAdd = () => {
    setEditingToken(null);
    form.resetFields();
    setIsModalVisible(true);
  };

  const handleEdit = (record: ApiToken) => {
    setEditingToken(record);
    const models = record.allowed_models ? (typeof record.allowed_models === 'string' ? JSON.parse(record.allowed_models) : record.allowed_models) : [];
    form.setFieldsValue({
      ...record,
      allowed_models: Array.isArray(models) ? models.join('\n') : '',
    });
    setIsModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await request.delete(`/tokens/${id}`);
      message.success(t('common.success'));
      fetchTokens();
    } catch (e) {
      console.error(e);
    }
  };

  const handleSave = async (values: { allowed_models?: string; [key: string]: unknown }) => {
    const data = {
      ...values,
      allowed_models: values.allowed_models?.split('\n').filter((m: string) => m.trim()) || [],
    };

    try {
      if (editingToken) {
        await request.put(`/tokens/${editingToken.id}`, data);
        message.success(t('common.success'));
      } else {
        await request.post('/tokens', data);
        message.success(t('common.success'));
      }
      setIsModalVisible(false);
      fetchTokens();
    } catch (e) {
      console.error(e);
    }
  };

  const columns = [
    {
      title: t('tokens.name'),
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => <Text strong>{text}</Text>,
    },
    {
      title: t('tokens.key'),
      dataIndex: 'token_key',
      key: 'token_key',
      render: (key: string) => (
        <Space>
          <Text code style={{ fontSize: 11 }}>{key.substring(0, 10)}...{key.substring(key.length - 4)}</Text>
          <Tooltip title={t('tokens.copy_hint')}>
            <Button icon={<CopyOutlined />} size="small" onClick={() => handleCopy(key)} />
          </Tooltip>
        </Space>
      ),
    },
    {
      title: t('tokens.usage_quota'),
      key: 'usage',
      render: (record: ApiToken) => (
        <Space direction="vertical" size={2}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t('tokens.used')}: {record.quota_used.toFixed(4)}
          </Text>
          <Text style={{ fontSize: 12 }}>
            {t('tokens.limit')}: {record.quota_limit < 0 ? t('tokens.unlimited') : record.quota_limit}
          </Text>
        </Space>
      ),
    },
    {
      title: t('tokens.limits'),
      key: 'limits',
      render: (record: ApiToken) => (
        <Space direction="vertical" size={2}>
          <Text type="secondary" style={{ fontSize: 12 }}>RPS: {record.rps_limit || '∞'}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>RPM: {record.rpm_limit || '∞'}</Text>
        </Space>
      ),
    },
    {
      title: t('common.status'),
      dataIndex: 'is_active',
      key: 'is_active',
      render: (active: boolean) => (
        <Tag color={active ? 'success' : 'error'}>
          {active ? t('common.active') : t('common.disabled')}
        </Tag>
      ),
    },
    {
      title: t('users.joined'),
      dataIndex: 'created_at',
      key: 'created_at',
      render: (text: string) => dayjs(text).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: t('common.actions'),
      key: 'actions',
      render: (_: unknown, record: ApiToken) => (
        <Space>
          <Button icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          <Popconfirm title={t('common.confirm_delete')} onConfirm={() => handleDelete(record.id)}>
            <Button icon={<DeleteOutlined />} danger />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card bordered={false}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
        <Title level={2} style={{ margin: 0 }}>{t('tokens.title')}</Title>
        <Space>
          <Button icon={<SyncOutlined />} onClick={fetchTokens}>{t('common.refresh')}</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>{t('tokens.create')}</Button>
        </Space>
      </div>

      <Table
        dataSource={tokens}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
      />

      <Modal
        title={editingToken ? t('tokens.edit') : t('tokens.create')}
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="name" label={t('tokens.name')} rules={[{ required: true }]} initialValue="default">
            <Input placeholder="e.g. Project A" />
          </Form.Item>

          <Form.Item name="quota_limit" label={t('tokens.limit') + " (-1 for unlimited)"} initialValue={-1}>
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item name="allowed_models" label={t('channels.models')}>
            <Input.TextArea rows={4} placeholder="gpt-4o\ngpt-3.5-turbo" />
          </Form.Item>

          <Form.Item name="allowed_ips" label="IP Whitelist (comma separated, empty for all)">
             <Input placeholder="192.168.1.1, 10.0.0.1" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="rps_limit" label="RPS Limit" initialValue={0}>
                <InputNumber min={0} style={{ width: '100%' }} placeholder="0 = ∞" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="rpm_limit" label="RPM Limit" initialValue={0}>
                <InputNumber min={0} style={{ width: '100%' }} placeholder="0 = ∞" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </Card>
  );
};

export default Tokens;

