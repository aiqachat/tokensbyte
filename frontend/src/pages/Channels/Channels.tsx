import React, { useEffect, useState } from 'react';
import { Table, Button, Space, Tag, Modal, Form, Input, InputNumber, message, Popconfirm, Card, Typography, Select, Row, Col } from 'antd';

import { PlusOutlined, EditOutlined, DeleteOutlined, SyncOutlined } from '@ant-design/icons';
import request from '../../utils/request';
import type { Channel } from '../../types';

const { Title, Text } = Typography;
const { Option } = Select;

const Channels: React.FC = () => {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [form] = Form.useForm();

  const fetchChannels = async () => {
    setLoading(true);
    try {
      const data = await (request.get('/channels') as unknown as Promise<Channel[]>);
      setChannels(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChannels();
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
      models: record.models.join('\n'),
      model_mapping: JSON.stringify(record.model_mapping, null, 2),
    });
    setIsModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await request.delete(`/channels/${id}`);
      message.success('Channel deleted');
      fetchChannels();
    } catch (e) {
      console.error(e);
    }
  };

  const handleTest = async (id: number) => {
    try {
      message.loading({ content: 'Testing channel...', key: 'test' });
      const resp = await (request.post(`/channels/${id}/test`, {}) as unknown as Promise<{ success: boolean; message: string }>);
      if (resp.success) {
        message.success({ content: 'Channel working correctly!', key: 'test' });
      } else {
        message.error({ content: `Test failed: ${resp.message}`, key: 'test' });
      }
    } catch (e) {
      console.error(e);
      message.error({ content: 'Test failed', key: 'test' });
    }
  };

  const handleSave = async (values: { models: string; model_mapping?: string; [key: string]: unknown }) => {

    const data = {
      ...values,
      models: values.models?.split('\n').filter((m: string) => m.trim()) || [],
      model_mapping: values.model_mapping ? JSON.parse(values.model_mapping) : {},
    };

    try {
      if (editingChannel) {
        await request.put(`/channels/${editingChannel.id}`, data);
        message.success('Channel updated');
      } else {
        await request.post('/channels', data);
        message.success('Channel created');
      }
      setIsModalVisible(false);
      fetchChannels();
    } catch (e) {
      console.error(e);
    }
  };

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => <Text strong>{text}</Text>,
    },
    {
      title: 'Type',
      dataIndex: 'provider_type',
      key: 'provider_type',
      render: (type: string) => <Tag color="purple">{type}</Tag>,
    },
    {
      title: 'Base URL',
      dataIndex: 'base_url',
      key: 'base_url',
      render: (url: string) => <Text code>{url || 'Default'}</Text>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: number) => (
        <Tag color={status === 1 ? 'success' : 'error'}>
          {status === 1 ? 'Active' : 'Disabled'}
        </Tag>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: unknown, record: Channel) => (

        <Space>
          <Button onClick={() => handleTest(record.id)}>Test</Button>
          <Button icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          <Popconfirm title="Delete channel?" onConfirm={() => handleDelete(record.id)}>
            <Button icon={<DeleteOutlined />} danger />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card bordered={false}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
        <Title level={2} style={{ margin: 0 }}>Channel Management</Title>
        <Space>
          <Button icon={<SyncOutlined />} onClick={fetchChannels}>Refresh</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>Add Channel</Button>
        </Space>
      </div>

      <Table
        dataSource={channels}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
      />

      <Modal
        title={editingChannel ? 'Edit Channel' : 'Add Channel'}
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        onOk={() => form.submit()}
        width={800}
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="name" label="Channel Name" rules={[{ required: true }]}>
                <Input placeholder="e.g. OpenAI Primary" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="provider_type" label="Provider" rules={[{ required: true }]}>
                <Select placeholder="Select Provider">
                  <Option value="openai">OpenAI</Option>
                  <Option value="anthropic">Anthropic</Option>
                  <Option value="google">Google Gemini</Option>
                  <Option value="azure">Azure OpenAI</Option>
                  <Option value="custom">Custom (OpenAI Compatible)</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="base_url" label="Base URL (Optional)">
            <Input placeholder="https://api.openai.com/v1" />
          </Form.Item>

          <Form.Item name="api_key" label="API Key" rules={[{ required: true }]}>
            <Input.Password placeholder="sk-..." />
          </Form.Item>

          <Form.Item name="models" label="Models (one per line)" rules={[{ required: true }]}>
            <Input.TextArea rows={4} placeholder="gpt-4\ngpt-3.5-turbo" />
          </Form.Item>

          <Form.Item name="model_mapping" label="Model Mapping (JSON, optional)">
            <Input.TextArea rows={4} placeholder='{"gpt-4": "gpt-4-0613"}' />
          </Form.Item>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="priority" label="Priority" initialValue={0}>
                <InputNumber style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="weight" label="Weight" initialValue={1}>
                <InputNumber style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="status" label="Status" initialValue={1}>
                <Select>
                  <Option value={1}>Enabled</Option>
                  <Option value={0}>Disabled</Option>
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
