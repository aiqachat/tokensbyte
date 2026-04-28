import React, { useEffect, useState } from 'react';
import { Table, Button, Space, Modal, Form, Input, Select, message, Popconfirm, Card, Typography, AutoComplete } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SyncOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';
import type { ChannelConfig, Upstream } from '../../types';

const { Title, Text } = Typography;
const { Option } = Select;

const ChannelConfigs: React.FC = () => {
  const { t } = useTranslation();
  const [configs, setConfigs] = useState<ChannelConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingConfig, setEditingConfig] = useState<ChannelConfig | null>(null);
  const [upstreams, setUpstreams] = useState<{id: number, name: string}[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  const fetchConfigs = async () => {
    setLoading(true);
    try {
      const resp = await (request.get('/channel-configs') as unknown as Promise<{ data: ChannelConfig[] }>);
      setConfigs(resp.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchUpstreams = async () => {
    try {
      const pResp = await (request.get('/upstreams') as unknown as Promise<Upstream[]>);
      setUpstreams(pResp || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchConfigs();
    fetchUpstreams();
  }, []);

  const handleAdd = () => {
    setEditingConfig(null);
    form.resetFields();
    setIsModalVisible(true);
  };

  const handleEdit = (record: ChannelConfig) => {
    setEditingConfig(record);
    form.resetFields();
    form.setFieldsValue(record);
    setIsModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await request.delete(`/channel-configs/${id}`);
      message.success(t('common.success'));
      fetchConfigs();
    } catch (e) {
      console.error(e);
    }
  };

  const handleSave = async (values: any) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      if (editingConfig) {
        if (!values.api_key) delete values.api_key;
        await request.put(`/channel-configs/${editingConfig.id}`, values);
        message.success(t('common.success'));
      } else {
        await request.post('/channel-configs', values);
        message.success(t('common.success'));
      }
      setIsModalVisible(false);
      fetchConfigs();
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  const columns = [
    {
      title: '配置名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => <Text strong>{text}</Text>,
    },
    {
      title: '服务商类型',
      dataIndex: 'provider_type',
      key: 'provider_type',
    },
    {
      title: '端点基础 URL (Base URL)',
      dataIndex: 'base_url',
      key: 'base_url',
      render: (text: string) => <Text code>{text}</Text>
    },
    {
      title: '密钥状态',
      key: 'has_api_key',
      render: (_: unknown, record: ChannelConfig) => (
        <Text type={record.has_api_key ? 'success' : 'danger'}>
          {record.has_api_key ? '已配置密钥' : '无密钥'}
        </Text>
      ),
    },
    {
      title: '备注说明',
      dataIndex: 'remark',
      key: 'remark',
      render: (text: string) => <Text type="secondary">{text || '-'}</Text>
    },
    {
      title: t('common.actions'),
      key: 'actions',
      render: (_: unknown, record: ChannelConfig) => (
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
        <Title level={2} style={{ margin: 0 }}>模型渠道配置预设</Title>
        <Space>
          <Button icon={<SyncOutlined />} onClick={fetchConfigs}>{t('common.refresh')}</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>添加预设配置</Button>
        </Space>
      </div>

      <Table
        dataSource={configs}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 15 }}
      />

      <Modal
        title={editingConfig ? "编辑模型预设配置" : "添加模型预设配置"}
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        onOk={() => form.submit()}
        confirmLoading={submitting}
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="name" label="配置名称" rules={[{ required: true }]}>
            <Input placeholder="例如：OpenAI 官方渠道接口" />
          </Form.Item>
          <Form.Item name="provider_type" label="服务商类型 (输入或快捷选择)" rules={[{ required: true }]}>
            <AutoComplete
              options={(upstreams || []).map(p => ({ value: p.name, label: p.name.toUpperCase() })).concat([{ value: 'openai', label: 'OPENAI (默认)' }, { value: 'anthropic', label: 'ANTHROPIC' }, { value: 'gemini', label: 'GEMINI' }, { value: 'azure', label: 'AZURE' }])}
              placeholder="可直选或自由输入 (如: custom)"
              filterOption={(inputValue, option) =>
                option!.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
              }
            />
          </Form.Item>
          <Form.Item name="base_url" label="端点基础地址 (Base URL)" rules={[{ required: true }]}>
            <AutoComplete
              options={[
                { value: 'https://api.openai.com', label: 'OpenAI 官方 (https://api.openai.com)' },
                { value: 'https://ark.cn-beijing.volces.com/api/v3', label: '火山方舟 (https://ark.cn-beijing.volces.com/api/v3)' }
              ]}
              placeholder="可直接选择预设地址或自由输入"
              filterOption={(inputValue, option) =>
                String(option?.label || '').toUpperCase().indexOf(inputValue.toUpperCase()) !== -1 ||
                String(option?.value || '').toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
              }
            />
          </Form.Item>
          <Form.Item 
            name="api_key" 
            label="请求鉴权密钥 (API Key)" 
            rules={[{ required: !editingConfig, message: '请输入 API Key' }]}
            extra={editingConfig ? '留空则保持原密钥不变，输入新值将覆盖旧密钥' : undefined}
          >
            <Input.Password placeholder={editingConfig ? '留空保持不变，输入新值覆盖' : 'sk-...'} />
          </Form.Item>
          <Form.Item name="remark" label="备注说明" extra="在这里记录您的渠道归属、适用场景等信息，方便自己查阅">
            <Input.TextArea rows={2} placeholder="例如：这是供图片生成的官方主通道..." />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default ChannelConfigs;
