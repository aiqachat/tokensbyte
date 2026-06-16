import React, { useEffect, useState } from 'react';
import { Table, Button, Space, Tag, Modal, Form, Input, InputNumber, Select, message, Popconfirm, Card, Typography, AutoComplete, Grid } from 'antd';
import MobileCardList, { MobileCard, CardRow, CardActions } from '../../components/MobileCardList';
import { PlusOutlined, EditOutlined, DeleteOutlined, SyncOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';
import type { ChannelConfig, Upstream } from '../../types';

const { Title, Text } = Typography;
const { Option } = Select;
const { useBreakpoint } = Grid;

const ChannelConfigs: React.FC = () => {
  const { t } = useTranslation();
  const screens = useBreakpoint();
  const [configs, setConfigs] = useState<ChannelConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingConfig, setEditingConfig] = useState<ChannelConfig | null>(null);
  const [upstreams, setUpstreams] = useState<{ id: number, name: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [searchText, setSearchText] = useState('');
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
    form.setFieldsValue({ sort_order: 0, rate: 1.0 });
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
      const payload = { ...values, sort_order: Number(values.sort_order) || 0, rate: values.rate !== undefined && values.rate !== null ? Number(values.rate) : 1.0 };
      if (editingConfig) {
        // 密钥未修改（与加载时原值相同）或为空时不提交，防止覆盖
        if (!payload.api_key || payload.api_key === editingConfig.api_key) {
          delete payload.api_key;
        }
        await request.put(`/channel-configs/${editingConfig.id}`, payload);
        message.success(t('common.success'));
      } else {
        await request.post('/channel-configs', payload);
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

  const filteredConfigs = configs.filter(config => {
    if (searchText && !config.name?.toLowerCase().includes(searchText.toLowerCase())) {
      return false;
    }
    return true;
  });

  const columns = [
    {
      title: '上游渠道 ID',
      dataIndex: 'yid',
      key: 'yid',
      width: 120,
      render: (text: string) => <Typography.Text keyboard style={{ color: '#1677ff' }}>{text || '-'}</Typography.Text>
    },
    {
      title: '排序',
      dataIndex: 'sort_order',
      key: 'sort_order',
      width: 80,
      render: (val: number) => <Typography.Text type="secondary">{val || 0}</Typography.Text>
    },
    {
      title: '配置名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => <Text strong>{text}</Text>,
    },
    {
      title: '倍率',
      dataIndex: 'rate',
      key: 'rate',
      width: 80,
      align: 'center' as const,
      render: (val: number) => <Tag color="orange" style={{ margin: 0 }}>{val ?? 1.0}</Tag>
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
        <Title level={screens.xs ? 4 : 2} style={{ margin: 0 }}>上游渠道配置预设</Title>
        <Space wrap>
          <Input.Search
            placeholder="搜索配置名称"
            allowClear
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            style={{ width: 200 }}
          />
          <Button icon={<SyncOutlined />} onClick={fetchConfigs}>{t('common.refresh')}</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>添加预设配置</Button>
        </Space>
      </div>

      {screens.xs ? (
        <MobileCardList
          dataSource={filteredConfigs}
          loading={loading}
          rowKey="id"
          pagination={{ pageSize: 15, showTotal: (total) => `共 ${total} 条` }}
          renderCard={(record: ChannelConfig) => (
            <MobileCard
              title={<Text strong>{record.name}</Text>}
              extra={<Text type={record.has_api_key ? 'success' : 'danger'}>{record.has_api_key ? '已配置密钥' : '无密钥'}</Text>}
            >
              <CardRow label="快捷识别(YID)">
                <Typography.Text keyboard style={{ color: '#1677ff' }}>{(record as any).yid || '-'}</Typography.Text>
              </CardRow>
              <CardRow label="服务商类型">
                <Text>{record.provider_type}</Text>
              </CardRow>
              <CardRow label="排序">
                <Text>{record.sort_order || 0}</Text>
              </CardRow>
              <CardRow label="倍率">
                <Text>{record.rate ?? 1.0}</Text>
              </CardRow>
              <CardRow label="端点基础URL">
                <Text code>{record.base_url}</Text>
              </CardRow>
              <CardRow label="备注说明">
                <Text type="secondary">{record.remark || '-'}</Text>
              </CardRow>
              <CardActions>
                <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
                <Popconfirm title={t('common.confirm_delete')} onConfirm={() => handleDelete(record.id)}>
                  <Button type="text" size="small" icon={<DeleteOutlined />} danger />
                </Popconfirm>
              </CardActions>
            </MobileCard>
          )}
        />
      ) : (
        <Table
          size="small"
          dataSource={filteredConfigs}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 15, showTotal: (total) => `共 ${total} 条` }}
          scroll={{ x: 'max-content' }}
        />
      )}

      <Modal
        title={editingConfig ? "编辑模型预设配置" : "添加模型预设配置"}
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        onOk={() => form.submit()}
        confirmLoading={submitting}
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <div style={{ display: 'flex', gap: '16px' }}>
            <Form.Item name="name" label="配置名称" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Input placeholder="例如：OpenAI 官方渠道接口" />
            </Form.Item>
            <Form.Item name="sort_order" label="排序权重" extra="数字越大越靠前">
              <InputNumber placeholder="0" style={{ width: '120px' }} />
            </Form.Item>
          </div>
          <div style={{ display: 'flex', gap: '16px' }}>
            <Form.Item name="provider_type" label="服务商类型" style={{ flex: 1 }}>
              <Input placeholder="可自由输入 (如: custom)" />
            </Form.Item>
            <Form.Item name="rate" label="渠道倍率" rules={[{ required: true }]}>
              <InputNumber min={0} step={0.1} placeholder="1.0" style={{ width: '120px' }} />
            </Form.Item>
          </div>
          <Form.Item name="base_url" label="端点基础地址 (Base URL)" rules={[{ required: true }]}>
            <AutoComplete
              options={[
                { value: 'https://ark.cn-beijing.volces.com', label: '火山方舟 (https://ark.cn-beijing.volces.com)' },
                { value: 'https://api-beijing.klingai.com', label: '可灵 (https://api-beijing.klingai.com)' },
                { value: 'https://dashscope.aliyuncs.com', label: '阿里百炼 (https://dashscope.aliyuncs.com)' },
                { value: 'https://vod.tencentcloudapi.com', label: '腾讯云 VOD AIGC (https://vod.tencentcloudapi.com)' },
                { value: 'https://visual.volcengineapi.com', label: '即梦AI/火山CV (https://visual.volcengineapi.com)' },
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
            extra={editingConfig ? '保持不变直接保存即可，输入新值将覆盖旧密钥' : '可灵 AI 格式：access_key:secret_key；腾讯云 VOD 格式：SecretId:SecretKey:SubAppId；即梦AI 格式：AccessKeyID:SecretAccessKey；其他：sk-xxx'}
          >
            <Input.Password placeholder={editingConfig ? '保持当前密钥或输入新值覆盖' : 'sk-... 或 access_key:secret_key'} />
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
