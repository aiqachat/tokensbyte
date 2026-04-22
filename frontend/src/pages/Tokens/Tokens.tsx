import React, { useEffect, useState } from 'react';
import { Table, Button, Space, Tag, Modal, Form, Input, InputNumber, message, Popconfirm, Card, Typography, Tooltip, Row, Col, Grid } from 'antd';
import MobileCardList, { MobileCard, CardRow, CardActions } from '../../components/MobileCardList';
import { PlusOutlined, EditOutlined, DeleteOutlined, CopyOutlined, SyncOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';
import type { ApiToken } from '../../types';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { useBreakpoint } = Grid;

const Tokens: React.FC = () => {
  const { t } = useTranslation();
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingToken, setEditingToken] = useState<ApiToken | null>(null);
  const [form] = Form.useForm();
  const screens = useBreakpoint();

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
        <div style={{
          display: 'flex',
          alignItems: 'center',
          background: 'rgba(255, 255, 255, 0.04)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '8px',
          padding: '4px 8px 4px 12px',
          width: 'max-content',
        }}>
          <Text style={{ fontFamily: 'monospace', fontSize: 13, color: '#1677ff', letterSpacing: '0.5px' }}>
            {key.substring(0, 10)}<span style={{color: '#666', margin: '0 4px'}}>••••••••</span>{key.substring(key.length - 6)}
          </Text>
          <Tooltip title={t('tokens.copy_hint')}>
            <Button 
              type="text" 
              icon={<CopyOutlined />} 
              size="small" 
              onClick={() => handleCopy(key)} 
              style={{ color: '#888', marginLeft: 12 }} 
            />
          </Tooltip>
        </div>
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
    <Card variant="borderless">
      <div style={{ display: 'flex', flexDirection: screens.xs ? 'column' : 'row', justifyContent: 'space-between', marginBottom: 24, gap: 12 }}>
        <Title level={screens.xs ? 4 : 2} style={{ margin: 0 }}>{t('tokens.title')}</Title>
        <Space>
          <Button icon={<SyncOutlined />} onClick={fetchTokens}>{t('common.refresh')}</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>{t('tokens.create')}</Button>
        </Space>
      </div>

      {screens.xs ? (
        <MobileCardList
          dataSource={tokens}
          loading={loading}
          rowKey="id"
          pagination={{ pageSize: 10 }}
          renderCard={(record: any) => (
            <MobileCard
              title={<Text strong>{record.name}</Text>}
              extra={<Tag color={record.is_active ? 'success' : 'error'}>{record.is_active ? t('common.active') : t('common.disabled')}</Tag>}
            >
              <CardRow label={t('tokens.key')}>
                <Space size={4}>
                  <Text style={{ fontFamily: 'monospace', fontSize: 11, color: '#1677ff' }}>
                    {record.token_key.substring(0, 8)}••••{record.token_key.substring(record.token_key.length - 4)}
                  </Text>
                  <Button type="text" icon={<CopyOutlined />} size="small" onClick={() => handleCopy(record.token_key)} style={{ color: '#888' }} />
                </Space>
              </CardRow>
              <CardRow label={t('tokens.used')}>
                <Text type="secondary" style={{ fontSize: 12 }}>{record.quota_used.toFixed(4)}</Text>
              </CardRow>
              <CardRow label={t('tokens.limit')}>
                <Text style={{ fontSize: 12 }}>{record.quota_limit < 0 ? t('tokens.unlimited') : record.quota_limit}</Text>
              </CardRow>
              <CardRow label={t('tokens.limits')}>
                <Text type="secondary" style={{ fontSize: 12 }}>RPS: {record.rps_limit || '∞'} / RPM: {record.rpm_limit || '∞'}</Text>
              </CardRow>
              <CardRow label={t('users.joined')}>
                <Text type="secondary" style={{ fontSize: 12 }}>{dayjs(record.created_at).format('MM-DD HH:mm')}</Text>
              </CardRow>
              <CardActions>
                <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
                <Popconfirm title={t('common.confirm_delete')} onConfirm={() => handleDelete(record.id)}>
                  <Button size="small" icon={<DeleteOutlined />} danger />
                </Popconfirm>
              </CardActions>
            </MobileCard>
          )}
        />
      ) : (
        <Table
          dataSource={tokens}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 'max-content' }}
        />
      )}

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

          <Form.Item name="quota_limit" label={`${t('tokens.limit')} ${t('tokens.limit_hint')}`} initialValue={-1}>
            <InputNumber 
              min={-1}
              style={{ width: '100%' }} 
              formatter={(val) => (val === -1 || val === '-1') ? t('tokens.unlimited_quota') : `${val}`}
              parser={(val) => (val === t('tokens.unlimited_quota') ? -1 : parseFloat(val as string) || 0) as -1}
            />
          </Form.Item>

          <Form.Item name="allowed_models" label={t('channels.models')}>
            <Input.TextArea rows={4} placeholder="gpt-4o\ngpt-3.5-turbo" />
          </Form.Item>

          <Form.Item name="allowed_ips" label={t('tokens.allowed_ips')}>
             <Input placeholder="192.168.1.1, 10.0.0.1" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="rps_limit" label="RPS Limit" initialValue={0}>
                <InputNumber min={0} style={{ width: '100%' }} placeholder={t('tokens.rps_limit_hint')} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="rpm_limit" label="RPM Limit" initialValue={0}>
                <InputNumber min={0} style={{ width: '100%' }} placeholder={t('tokens.rpm_limit_hint')} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </Card>
  );
};

export default Tokens;

