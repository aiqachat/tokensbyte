import React, { useEffect, useState } from 'react';
import { Table, Button, Space, Tag, Modal, Form, Input, InputNumber, message, Popconfirm, Card, Typography, Select, Row, Col, Switch, Grid } from 'antd';
import MobileCardList, { MobileCard, CardRow, CardActions } from '../../components/MobileCardList';
import { PlusOutlined, EditOutlined, DeleteOutlined, SyncOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import request from '../../utils/request';
import useSettingsStore from '../../store/settings';
import type { Channel } from '../../types';

const { Title, Text } = Typography;
const { Option } = Select;
const { useBreakpoint } = Grid;

const Channels: React.FC = () => {
  const { t } = useTranslation();
  const { settings } = useSettingsStore();
  const currencySymbol = settings?.currency?.currency_symbol || '$';
  const [channels, setChannels] = useState<Channel[]>([]);
  const [availableModels, setAvailableModels] = useState<any[]>([]);
  const [availableUserLevels, setAvailableUserLevels] = useState<any[]>([]);
  const [presets, setPresets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const [showMapping, setShowMapping] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const screens = useBreakpoint();

  const fetchChannels = async () => {
    setLoading(true);
    try {
      const resp = await (request.get('/channels') as unknown as Promise<{ data: Channel[] }>);
      setChannels(resp.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchModels = async () => {
    try {
      const resp = await (request.get('/models') as unknown as Promise<{ data: any[] }>);
      setAvailableModels(resp.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchUserLevels = async () => {
    try {
      const resp = await (request.get('/user_levels') as unknown as Promise<{ data: any[] }>);
      setAvailableUserLevels(resp.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchPresets = async () => {
    try {
      const resp = await (request.get('/channel-configs') as unknown as Promise<{ data: any[] }>);
      setPresets(resp.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchChannels();
    fetchModels();
    fetchUserLevels();
    fetchPresets();
  }, []);

  const handleAdd = () => {
    setEditingChannel(null);
    form.resetFields();
    setShowMapping(false);
    setIsModalVisible(true);
  };

  const handleEdit = (record: Channel) => {
    setEditingChannel(record);
    let mapping = {};
    try {
      mapping = typeof record.model_mapping === 'string' ? JSON.parse(record.model_mapping) : record.model_mapping;
    } catch (e) {}

    form.setFieldsValue({
      ...record,
      model_mapping: mapping,
    });
    // 如果有任何映射值则自动开启开关
    const hasMapping = Object.values(mapping as Record<string, string>).some(v => v && String(v).trim());
    setShowMapping(hasMapping);
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

  const handleTest = (record: Channel) => {
    navigate(`/admin0755/channels/test/${record.id}`);
  };

  const handleSave = async (values: any) => {
    if (submitting) return;
    setSubmitting(true);
    const finalMapping: Record<string, string> = {};
    if (values.model_mapping) {
      for (const [k, v] of Object.entries(values.model_mapping)) {
        if (v && String(v).trim()) {
          finalMapping[k] = String(v).trim();
        }
      }
    }

    const data = {
      ...values,
      provider_type: values.provider_type || 'custom',
      model_mapping: finalMapping,
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
    } finally {
      setSubmitting(false);
    }
  };

  const columns = [
    {
      title: '渠道分组 AID',
      dataIndex: 'group_aid',
      key: 'group_aid',
      render: (aid: string) => {
        return aid ? <Tag color="geekblue">{aid}</Tag> : <Text type="secondary">-</Text>;
      }
    },
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
      title: '支持等级', // Supported user levels
      dataIndex: 'user_groups',
      key: 'user_groups',
      render: (groups: string[] | undefined) => {
        if (!groups || groups.length === 0) return <Tag color="green">全部允许</Tag>;
        return (
          <Space size={[0, 4]} wrap>
            {groups.map(groupKey => {
              const level = availableUserLevels.find(l => l.group_key === groupKey);
              return <Tag color="blue" key={groupKey}>{level ? level.name : groupKey}</Tag>;
            })}
          </Space>
        );
      },
    },
    {
      title: '已用/额度',
      key: 'quota',
      width: 160,
      render: (_: any, record: Channel) => {
        const used = record.quota_used || 0;
        const limit = record.quota_limit ?? -1;
        return (
          <Space size={4}>
            <Tag color="orange">{currencySymbol}{used.toFixed(2)}</Tag>
            <Text type="secondary">/</Text>
            {limit < 0 
              ? <Tag color="green">∞ 无限额</Tag>
              : <Tag color="default">{currencySymbol}{limit.toFixed(2)}</Tag>
            }
          </Space>
        );
      }
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
          <Button onClick={() => handleTest(record)}>{t('common.test')}</Button>
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
        <Title level={screens.xs ? 4 : 2} style={{ margin: 0 }}>{t('channels.title')}</Title>
        <Space>
          <Button icon={<SyncOutlined />} onClick={fetchChannels}>{t('common.refresh')}</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>{t('channels.add_channel')}</Button>
        </Space>
      </div>

      {screens.xs ? (
        <MobileCardList
          dataSource={channels}
          loading={loading}
          rowKey="id"
          pagination={{ pageSize: 10 }}
          renderCard={(record: any) => {
            const used = record.quota_used || 0;
            const limit = record.quota_limit ?? -1;
            const groups = record.user_groups;
            return (
              <MobileCard
                title={<Text strong>{record.name}</Text>}
                extra={<Tag color={record.status === 1 ? 'success' : 'error'}>{record.status === 1 ? t('common.active') : t('common.disabled')}</Tag>}
              >
                {record.group_aid && <CardRow label="AID"><Tag color="geekblue">{record.group_aid}</Tag></CardRow>}
                <CardRow label="类型"><Tag color="purple">通用接口池</Tag></CardRow>
                <CardRow label="支持等级">
                  {(!groups || groups.length === 0)
                    ? <Tag color="green">全部允许</Tag>
                    : <Space size={[0, 4]} wrap>{groups.map((gk: string) => {
                        const lv = availableUserLevels.find((l: any) => l.group_key === gk);
                        return <Tag color="blue" key={gk}>{lv ? lv.name : gk}</Tag>;
                      })}</Space>
                  }
                </CardRow>
                <CardRow label="已用/额度">
                  <Space size={4}>
                    <Tag color="orange">{currencySymbol}{used.toFixed(2)}</Tag>
                    <Text type="secondary">/</Text>
                    {limit < 0 ? <Tag color="green">∞</Tag> : <Tag>{currencySymbol}{limit.toFixed(2)}</Tag>}
                  </Space>
                </CardRow>
                <CardActions>
                  <Button size="small" onClick={() => handleTest(record)}>{t('common.test')}</Button>
                  <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
                  <Popconfirm title={t('common.confirm_delete')} onConfirm={() => handleDelete(record.id)}>
                    <Button size="small" icon={<DeleteOutlined />} danger />
                  </Popconfirm>
                </CardActions>
              </MobileCard>
            );
          }}
        />
      ) : (
        <Table
          dataSource={channels}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 'max-content' }}
        />
      )}

      <Modal
        title={editingChannel ? t('channels.edit_channel') : t('channels.add_channel')}
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        onOk={() => form.submit()}
        confirmLoading={submitting}
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

          <Form.Item name="preset_id" label="预设渠道配置 (可选)" extra="选择预设后，基础 URL 和 API Key 会在实际请求时被预设接管">
            <Select placeholder="选择预设配置（不选则使用独立配置）" allowClear>
              {(presets || []).map(p => (
                <Option key={p.id} value={p.id}>{p.name} [{p.provider_type}]</Option>
              ))}
            </Select>
          </Form.Item>


          <Form.Item name="models" label={t('channels.models')} rules={[{ required: true }]}>
            <Select mode="multiple" placeholder="Select Models">
                {availableModels.map((m) => (
                    <Option key={m.model_id} value={m.model_id}>{m.name} ({m.model_id})</Option>
                ))}
            </Select>
          </Form.Item>

          <Form.Item shouldUpdate={(prev, curr) => prev.models !== curr.models} noStyle>
            {() => {
              const selectedModels = form.getFieldValue('models') || [];
              if (selectedModels.length === 0) return null;
              return (
                <div style={{ marginBottom: 24, padding: 16, background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showMapping ? 12 : 0 }}>
                    <div>
                      <Text strong style={{ display: 'block', marginBottom: 2 }}>模型别名映射 (Model Mapping)</Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>开启后可为每个模型指定上游别名</Text>
                    </div>
                    <Switch checked={showMapping} onChange={setShowMapping} size="small" />
                  </div>
                  {showMapping && selectedModels.map((modelId: string) => (
                    <Form.Item
                      key={modelId}
                      label={modelId}
                      name={['model_mapping', modelId]}
                      style={{ marginBottom: 12 }}
                      labelCol={{ span: 8 }}
                      wrapperCol={{ span: 16 }}
                    >
                      <Input placeholder={`默认为原名：${modelId}`} />
                    </Form.Item>
                  ))}
                </div>
              );
            }}
          </Form.Item>


          <Form.Item name="user_groups" label="支持用户等级" extra="默认不选则表示允许所有等级的用户使用该渠道">
            <Select mode="multiple" placeholder="选择开放该渠道的特定 VIP 等级（留空允许所有）" allowClear>
                {availableUserLevels.map((l) => (
                    <Option key={l.group_key} value={l.group_key}>{l.name} ({l.group_key})</Option>
                ))}
            </Select>
          </Form.Item>

          <Row gutter={16}>
            <Col span={6}>
              <Form.Item name="priority" label={t('channels.priority')} initialValue={0}>
                <InputNumber style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="weight" label={t('channels.weight')} initialValue={1}>
                <InputNumber style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="quota_limit" label="使用额度" initialValue={-1} extra="-1 表示无限额度">
                <InputNumber 
                  min={-1} 
                  style={{ width: '100%' }} 
                  formatter={(val) => (val === -1 || val === '-1') ? '无限额' : `${val}`}
                  parser={(val) => (val === '无限额' ? -1 : parseFloat(val as string) || 0) as -1}
                />
              </Form.Item>
            </Col>
            <Col span={6}>
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
