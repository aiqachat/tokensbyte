import React, { useEffect, useState } from 'react';
import { Table, Button, Space, Tag, Modal, Form, Input, InputNumber, message, Popconfirm, Card, Typography, Select, Row, Col, Divider } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SyncOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';

const { Title, Text } = Typography;
const { Option } = Select;

interface ModelModel {
  id: number;
  name: string;
  model_id: string;
  billing_type: string;
  prompt_rate: number;
  completion_rate: number;
  fixed_rate: number;
  duration_rate: number;
  group_ratios: string;
  is_active: boolean;
  created_at: string;
}

const Models: React.FC = () => {
  const { t } = useTranslation();
  const [models, setModels] = useState<ModelModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingModel, setEditingModel] = useState<ModelModel | null>(null);
  const [billingType, setBillingType] = useState('tokens');
  const [form] = Form.useForm();

  const fetchModels = async () => {
    setLoading(true);
    try {
      const resp = await (request.get('/models') as unknown as Promise<{ data: ModelModel[] }>);
      setModels(resp.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchModels();
  }, []);

  const handleAdd = () => {
    setEditingModel(null);
    setBillingType('tokens');
    form.resetFields();
    setIsModalVisible(true);
  };

  const handleEdit = (record: ModelModel) => {
    setEditingModel(record);
    setBillingType(record.billing_type);
    const gr = JSON.parse(record.group_ratios || '{}');
    const group_ratios_list = Object.entries(gr).map(([group_name, ratio]) => ({ group_name, ratio }));

    form.setFieldsValue({
      ...record,
      group_ratios_list,
    });
    setIsModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await request.delete(`/models/${id}`);
      message.success(t('common.success'));
      fetchModels();
    } catch (e) {
      console.error(e);
    }
  };

  const handleSave = async (values: any) => {
    const group_ratios: Record<string, number> = {};
    if (values.group_ratios_list) {
      values.group_ratios_list.forEach((item: any) => {
        if (item.group_name) group_ratios[item.group_name] = item.ratio;
      });
    }

    const data = {
      ...values,
      group_ratios,
    };

    try {
      if (editingModel) {
        await request.put(`/models/${editingModel.id}`, data);
        message.success(t('common.success'));
      } else {
        await request.post('/models', data);
        message.success(t('common.success'));
      }
      setIsModalVisible(false);
      fetchModels();
    } catch (e) {
      console.error(e);
    }
  };

  const columns = [
    {
      title: t('models.model_name'),
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => <Text strong>{text}</Text>,
    },
    {
      title: t('models.model_id'),
      dataIndex: 'model_id',
      key: 'model_id',
      render: (text: string) => <Tag color="blue">{text}</Tag>,
    },
    {
      title: t('models.billing_type'),
      dataIndex: 'billing_type',
      key: 'billing_type',
      render: (type: string) => {
        const colors: Record<string, string> = { tokens: 'cyan', requests: 'orange', duration: 'purple' };
        return <Tag color={colors[type]}>{t(`models.type_${type}`)}</Tag>;
      },
    },
    {
      title: 'Rates',
      key: 'rates',
      render: (_: any, record: ModelModel) => {
        if (record.billing_type === 'tokens') {
            return (
              <Space direction="vertical" size={0}>
                <Text type="secondary" style={{ fontSize: '12px' }}>P: ${record.prompt_rate}</Text>
                <Text type="secondary" style={{ fontSize: '12px' }}>C: ${record.completion_rate}</Text>
              </Space>
            );
        } else if (record.billing_type === 'requests') {
            return <Text type="secondary">${record.fixed_rate}</Text>;
        } else {
            return <Text type="secondary">${record.duration_rate}/s</Text>;
        }
      }
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
      title: t('common.actions'),
      key: 'actions',
      render: (_: unknown, record: ModelModel) => (
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
        <Title level={2} style={{ margin: 0 }}>{t('models.title')}</Title>
        <Space>
          <Button icon={<SyncOutlined />} onClick={fetchModels}>{t('common.refresh')}</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>{t('models.add_model')}</Button>
        </Space>
      </div>

      <Table
        dataSource={models}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
      />

      <Modal
        title={editingModel ? t('models.edit_model') : t('models.add_model')}
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        onOk={() => form.submit()}
        width={700}
      >
        <Form form={form} layout="vertical" onFinish={handleSave} initialValues={{ billing_type: 'tokens', prompt_rate: 0, completion_rate: 0, fixed_rate: 0, duration_rate: 0 }}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="name" label={t('models.model_name')} rules={[{ required: true }]}>
                <Input placeholder="e.g. GPT-4o" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="model_id" label={t('models.model_id')} rules={[{ required: true }]}>
                <Input placeholder="e.g. gpt-4o" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="billing_type" label={t('models.billing_type')} rules={[{ required: true }]}>
            <Select onChange={(v) => setBillingType(v)}>
              <Option value="tokens">{t('models.type_tokens')}</Option>
              <Option value="requests">{t('models.type_requests')}</Option>
              <Option value="duration">{t('models.type_duration')}</Option>
            </Select>
          </Form.Item>

          {billingType === 'tokens' && (
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="prompt_rate" label={t('models.prompt_rate')} rules={[{ required: true }]}>
                  <InputNumber style={{ width: '100%' }} precision={6} step={0.00001} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="completion_rate" label={t('models.completion_rate')} rules={[{ required: true }]}>
                  <InputNumber style={{ width: '100%' }} precision={6} step={0.00001} />
                </Form.Item>
              </Col>
            </Row>
          )}

          {billingType === 'requests' && (
            <Form.Item name="fixed_rate" label={t('models.fixed_rate')} rules={[{ required: true }]}>
              <InputNumber style={{ width: '100%' }} precision={4} />
            </Form.Item>
          )}

          {billingType === 'duration' && (
            <Form.Item name="duration_rate" label={t('models.duration_rate')} rules={[{ required: true }]}>
              <InputNumber style={{ width: '100%' }} precision={6} />
            </Form.Item>
          )}

          <Divider orientation="left">{t('models.group_ratios')}</Divider>
          <Form.List name="group_ratios_list">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name, ...restField }) => (
                  <Row key={key} gutter={16} align="bottom">
                    <Col span={12}>
                      <Form.Item
                        {...restField}
                        name={[name, 'group_name']}
                        label={key === 0 ? t('models.group_name') : ''}
                        rules={[{ required: true }]}
                      >
                        <Input placeholder="e.g. vip" />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item
                        {...restField}
                        name={[name, 'ratio']}
                        label={key === 0 ? t('models.ratio') : ''}
                        rules={[{ required: true }]}
                        initialValue={1.0}
                      >
                        <InputNumber style={{ width: '100%' }} step={0.1} min={0} />
                      </Form.Item>
                    </Col>
                    <Col span={4}>
                      <Form.Item>
                        <Button type="link" danger onClick={() => remove(name)} icon={<DeleteOutlined />} />
                      </Form.Item>
                    </Col>
                  </Row>
                ))}
                <Form.Item>
                  <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                    {t('common.add')}
                  </Button>
                </Form.Item>
              </>
            )}
          </Form.List>

          <Form.Item name="is_active" label={t('common.status')} valuePropName="checked" initialValue={true}>
            <Select>
                <Option value={true}>{t('common.active')}</Option>
                <Option value={false}>{t('common.disabled')}</Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default Models;
