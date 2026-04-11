import React, { useEffect, useState } from 'react';
import { Table, Button, Space, Tag, Modal, Form, Input, InputNumber, message, Popconfirm, Card, Typography, Select, Row, Col } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SyncOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';
import type { Channel } from '../../types';

const { Title, Text } = Typography;
const { Option } = Select;

const Channels: React.FC = () => {
  const { t } = useTranslation();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [availableModels, setAvailableModels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [form] = Form.useForm();

  const fetchChannels = async () => {
    setLoading(true);
    try {
      const resp = await (request.get('/channels') as unknown as Promise<{ data: Channel[] }>);
      setChannels(resp.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchModels = async () => {
    try {
      const resp = await (request.get('/models') as unknown as Promise<{ data: any[] }>);
      setAvailableModels(resp.data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchChannels();
    fetchModels();
  }, []);

  const handleAdd = () => {
    setEditingChannel(null);
    form.resetFields();
    setIsModalVisible(true);
  };

  const handleEdit = (record: Channel) => {
    setEditingChannel(record);
    form.setFieldsValue({
      ...record,
      model_mapping: JSON.stringify(record.model_mapping, null, 2),
    });
    setIsModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await request.delete(`/channels/${id}`);
      message.success(t('common.success'));
      fetchChannels();
    } catch (e) {
      console.error(e);
    }
  };

  const handleTest = async (id: number) => {
    try {
      message.loading({ content: t('common.loading'), key: 'test' });
      const resp = await (request.post(`/channels/${id}/test`, {}) as unknown as Promise<{ success: boolean; message: string }>);
      if (resp.success) {
        message.success({ content: t('channels.test_success'), key: 'test' });
      } else {
        message.error({ content: `${t('channels.test_failed')}: ${resp.message}`, key: 'test' });
      }
    } catch (e) {
      console.error(e);
      message.error({ content: t('channels.test_failed'), key: 'test' });
    }
  };

  const handleSave = async (values: { models: string[]; model_mapping?: string; provider_type?: string; [key: string]: unknown }) => {
    const data = {
      ...values,
      provider_type: 'custom',
      model_mapping: {},
    };

    try {
      if (editingChannel) {
        await request.put(`/channels/${editingChannel.id}`, data);
        message.success(t('common.success'));
      } else {
        await request.post('/channels', data);
        message.success(t('common.success'));
      }
      setIsModalVisible(false);
      fetchChannels();
    } catch (e) {
      console.error(e);
    }
  };

  const columns = [
    {
      title: t('channels.name'),
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => <Text strong>{text}</Text>,
    },
    {
      title: t('channels.type'),
      dataIndex: 'provider_type',
      key: 'provider_type',
      render: (type: string) => <Tag color="purple">通用接口池</Tag>,
    },
    {
      title: t('channels.base_url'),
      dataIndex: 'base_url',
      key: 'base_url',
      render: (url: string) => <Text code>{url || 'Default'}</Text>,
    },
    {
      title: t('common.status'),
      dataIndex: 'status',
      key: 'status',
      render: (status: number) => (
        <Tag color={status === 1 ? 'success' : 'error'}>
          {status === 1 ? t('common.active') : t('common.disabled')}
        </Tag>
      ),
    },
    {
      title: t('common.actions'),
      key: 'actions',
      render: (_: unknown, record: Channel) => (
        <Space>
          <Button onClick={() => handleTest(record.id)}>{t('common.test')}</Button>
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
        <Title level={2} style={{ margin: 0 }}>{t('channels.title')}</Title>
        <Space>
          <Button icon={<SyncOutlined />} onClick={fetchChannels}>{t('common.refresh')}</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>{t('channels.add_channel')}</Button>
        </Space>
      </div>

      <Table
        dataSource={channels}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
        scroll={{ x: 'max-content' }}
      />

      <Modal
        title={editingChannel ? t('channels.edit_channel') : t('channels.add_channel')}
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        onOk={() => form.submit()}
        width={800}
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Row gutter={16}>
            <Col span={24}>
              <Form.Item name="name" label={t('channels.name')} rules={[{ required: true }]}>
                <Input placeholder="e.g. OpenAI Primary" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="base_url" label={t('channels.base_url')}>
            <Input placeholder="https://api.openai.com/v1" />
          </Form.Item>

          <Form.Item name="api_key" label={t('channels.api_key')} rules={[{ required: true }]}>
            <Input.Password placeholder="sk-..." />
          </Form.Item>

          <Form.Item name="models" label={t('channels.models')} rules={[{ required: true }]}>
            <Select mode="multiple" placeholder="Select Models">
                {availableModels.map((m) => (
                    <Option key={m.model_id} value={m.model_id}>{m.name} ({m.model_id})</Option>
                ))}
            </Select>
          </Form.Item>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="priority" label={t('channels.priority')} initialValue={0}>
                <InputNumber style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="weight" label={t('channels.weight')} initialValue={1}>
                <InputNumber style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="status" label={t('common.status')} initialValue={1}>
                <Select>
                  <Option value={1}>{t('common.enabled')}</Option>
                  <Option value={0}>{t('common.disabled')}</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </Card>
  );
};


export default Channels;

