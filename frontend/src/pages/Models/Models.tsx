import React, { useEffect, useState } from 'react';
import { Table, Button, Space, Tag, Modal, Form, Input, InputNumber, message, Popconfirm, Card, Typography, Select, Row, Col, Radio } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SyncOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';
import useSettingsStore from '../../store/settings';
import { type ModelModel, type ClassificationsResponse, type ModelProvider, type ModelType, type ClassificationCount } from '../../types';
import ClassificationFilter from '../../components/Models/ClassificationFilter';
import ClassificationManager from '../../components/Models/ClassificationManager';

const { Title, Text } = Typography;
const { Option } = Select;

const Models: React.FC = () => {
  const { t } = useTranslation();
  const { settings } = useSettingsStore();
  const currencySymbol = settings?.currency?.currency_symbol || '$';
  const [models, setModels] = useState<ModelModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingModel, setEditingModel] = useState<ModelModel | null>(null);
  const [billingType, setBillingType] = useState('tokens');
  const [form] = Form.useForm();

  // Classification State
  const [classStats, setClassStats] = useState<ClassificationsResponse>({ providers: [], types: [] });
  const [allProviders, setAllProviders] = useState<ModelProvider[]>([]);
  const [allTypes, setAllTypes] = useState<ModelType[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<number | null>(null);
  const [selectedType, setSelectedType] = useState<number | null>(null);
  const [isProviderManagerVisible, setIsProviderManagerVisible] = useState(false);
  const [isTypeManagerVisible, setIsTypeManagerVisible] = useState(false);

  const fetchModels = async () => {
    setLoading(true);
    try {
      const params = {
        provider_id: selectedProvider,
        type_id: selectedType,
      };
      const resp = await (request.get('/models', { params }) as unknown as Promise<{ data: ModelModel[] }>);
      setModels(resp.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchClassifications = async () => {
    try {
      const stats = await (request.get('/classifications/stats') as any);
      setClassStats(stats);
      
      const providers = await (request.get('/model-providers') as any);
      setAllProviders(providers.filter((p: any) => p.is_active));
      
      const types = await (request.get('/model-types') as any);
      setAllTypes(types.filter((t: any) => t.is_active));
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchModels();
  }, [selectedProvider, selectedType]);

  useEffect(() => {
    fetchClassifications();
  }, []);

  const handleAdd = () => {
    setEditingModel(null);
    setBillingType('tokens');
    form.resetFields();
    setIsModalVisible(true);
  };

  const handleEdit = (record: ModelModel) => {
    let tiers = [];
    try {
      tiers = JSON.parse(record.pricing_tiers || '[]');
    } catch (e) {
      console.error('Failed to parse tiers', e);
    }
    
    setEditingModel(record);
    setBillingType(record.billing_type);
    form.setFieldsValue({
      ...record,
      pricing_tiers: tiers
    });
    setIsModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await request.delete(`/models/${id}`);
      message.success(t('common.success'));
      fetchModels();
      fetchClassifications();
    } catch (e) {
      console.error(e);
    }
  };

  const handleSave = async (values: any) => {
    try {
      // If rule is standard, ensure tiers is empty or handled
      if (values.billing_rule === 'standard') {
        values.pricing_tiers = [];
      }
      
      // Site-wide standard: Million tokens
      values.billing_unit = '1M';
      
      if (editingModel) {
        await request.put(`/models/${editingModel.id}`, values);
      } else {
        await request.post('/models', values);
      }
      message.success(t('common.success'));
      setIsModalVisible(false);
      fetchModels();
      fetchClassifications();
    } catch (e) {
      console.error(e);
    }
  };

  const getProviderName = (id?: number) => {
    const p = classStats.providers.find(p => p.id === id);
    return p ? p.name : null;
  };

  const getTypeName = (id?: number) => {
    const t = classStats.types.find(t => t.id === id);
    return t ? t.name : null;
  };

  const columns = [
    {
      title: t('models.model_name'),
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: ModelModel) => (
        <Space direction="vertical" size={0}>
          <Text strong>{text}</Text>
          <Space size={4}>
            {record.provider_id && <Tag color="default" style={{ fontSize: '10px' }}>{getProviderName(record.provider_id)}</Tag>}
            {record.type_id && <Tag color="blue" style={{ fontSize: '10px' }}>{getTypeName(record.type_id)}</Tag>}
            {record.billing_rule === 'tiered' && <Tag color="gold" style={{ fontSize: '10px' }}>{t('models.rule_tiered')}</Tag>}
          </Space>
        </Space>
      ),
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
      title: t('models.rates'),
      key: 'rates',
      render: (_: any, record: ModelModel) => {
        if (record.billing_type === 'tokens') {
            const unitSuffix = '/1M';
            if (record.billing_rule === 'tiered') {
                return <Text type="warning" style={{ fontSize: '12px' }}>{t('models.rule_tiered')}</Text>;
            }
            return (
              <Space direction="vertical" size={0}>
                <Text type="secondary" style={{ fontSize: '12px' }}>P: {currencySymbol}{record.prompt_rate}{unitSuffix}</Text>
                <Text type="secondary" style={{ fontSize: '12px' }}>C: {currencySymbol}{record.completion_rate}{unitSuffix}</Text>
              </Space>
            );
        } else if (record.billing_type === 'requests') {
            return <Text type="secondary">{currencySymbol}{record.fixed_rate}</Text>;
        } else {
            return <Text type="secondary">{currencySymbol}{record.duration_rate}/s</Text>;
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

  const totalModelsCount = classStats.providers.reduce((acc, curr) => acc + curr.count, 0);

  return (
    <Card bordered={false}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
        <Title level={2} style={{ margin: 0 }}>{t('models.title')}</Title>
        <Space>
          <Button icon={<SyncOutlined />} onClick={() => { fetchModels(); fetchClassifications(); }}>{t('common.refresh')}</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>{t('models.add_model')}</Button>
        </Space>
      </div>

      <ClassificationFilter
        providers={classStats.providers}
        types={classStats.types}
        selectedProvider={selectedProvider}
        selectedType={selectedType}
        onProviderChange={setSelectedProvider}
        onTypeChange={setSelectedType}
        onManageProviders={() => setIsProviderManagerVisible(true)}
        onManageTypes={() => setIsTypeManagerVisible(true)}
        totalModels={totalModelsCount}
      />

      <Table
        dataSource={models}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 12 }}
        scroll={{ x: 'max-content' }}
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

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="provider_id" label={t('models.provider')}>
                <Select placeholder={t('common.select_placeholder')} allowClear>
                  {allProviders.map(p => (
                    <Option key={p.id} value={p.id}>{p.name}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="type_id" label={t('models.type')}>
                <Select placeholder={t('common.select_placeholder')} allowClear>
                  {allTypes.map(t => (
                    <Option key={t.id} value={t.id}>{t.name}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="billing_type" label={t('models.billing_type')} rules={[{ required: true }]}>
            <Radio.Group optionType="button" buttonStyle="solid" onChange={(e) => setBillingType(e.target.value)}>
              <Radio value="tokens">{t('models.type_tokens')}</Radio>
              <Radio value="requests">{t('models.type_requests')}</Radio>
              <Radio value="duration">{t('models.type_duration')}</Radio>
            </Radio.Group>
          </Form.Item>

          {billingType === 'tokens' && (
            <>
              <Form.Item name="billing_rule" label={t('models.billing_rule')} initialValue="standard">
                <Radio.Group optionType="button" buttonStyle="solid">
                  <Radio value="standard">{t('models.rule_standard')}</Radio>
                  <Radio value="tiered">{t('models.rule_tiered')}</Radio>
                </Radio.Group>
              </Form.Item>

              <Form.Item noStyle shouldUpdate={(prev, curr) => prev.billing_rule !== curr.billing_rule}>
                {({ getFieldValue }) => {
                  const rule = getFieldValue('billing_rule');
                  const unitLabel = t('models.prompt_rate');
                  const unitLabelComp = t('models.completion_rate');

                  if (rule === 'standard') {
                    return (
                      <Row gutter={16}>
                        <Col span={12}>
                          <Form.Item name="prompt_rate" label={unitLabel} rules={[{ required: true }]}>
                            <InputNumber style={{ width: '100%' }} precision={6} />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="completion_rate" label={unitLabelComp} rules={[{ required: true }]}>
                            <InputNumber style={{ width: '100%' }} precision={6} />
                          </Form.Item>
                        </Col>
                      </Row>
                    );
                  } else {
                    return (
                      <div style={{ 
                        background: '#141414', 
                        padding: '20px', 
                        borderRadius: '12px', 
                        marginBottom: '24px',
                        border: '1px solid #303030'
                      }}>
                        <Title level={5} style={{ marginBottom: 16, fontSize: '14px', color: 'rgba(255,255,255,0.85)' }}>{t('models.pricing_tiers')}</Title>
                        <Form.List name="pricing_tiers" initialValue={[]}>
                          {(fields, { add, remove }) => (
                            <>
                              {fields.map(({ key, name, ...restField }) => (
                                <Row key={key} gutter={12} align="middle" style={{ marginBottom: 12 }}>
                                  <Col span={9}>
                                    <Form.Item {...restField} name={[name, 'max_tokens']} rules={[{ required: true, message: '' }]} noStyle>
                                      <InputNumber placeholder={t('models.context_limit')} style={{ width: '100%' }} />
                                    </Form.Item>
                                  </Col>
                                  <Col span={6}>
                                    <Form.Item {...restField} name={[name, 'prompt_rate']} rules={[{ required: true }]} noStyle>
                                      <InputNumber placeholder={t('models.input_rate')} style={{ width: '100%' }} precision={6} />
                                    </Form.Item>
                                  </Col>
                                  <Col span={6}>
                                    <Form.Item {...restField} name={[name, 'completion_rate']} rules={[{ required: true }]} noStyle>
                                      <InputNumber placeholder={t('models.output_rate')} style={{ width: '100%' }} precision={6} />
                                    </Form.Item>
                                  </Col>
                                  <Col span={3} style={{ textAlign: 'right' }}>
                                    <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(name)} />
                                  </Col>
                                </Row>
                              ))}
                              <Button 
                                type="dashed" 
                                onClick={() => add()} 
                                block 
                                icon={<PlusOutlined />}
                                style={{ marginTop: 8, height: '40px' }}
                              >
                                {t('models.add_tier')}
                              </Button>
                            </>
                          )}
                        </Form.List>
                      </div>
                    );
                  }
                }}
              </Form.Item>
            </>
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

          <Form.Item name="is_active" label={t('common.status')} valuePropName="checked" initialValue={true}>
            <Select>
                <Option value={true}>{t('common.active')}</Option>
                <Option value={false}>{t('common.disabled')}</Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      <ClassificationManager
        type="provider"
        visible={isProviderManagerVisible}
        onClose={() => setIsProviderManagerVisible(false)}
        onUpdate={fetchClassifications}
      />

      <ClassificationManager
        type="type"
        visible={isTypeManagerVisible}
        onClose={() => setIsTypeManagerVisible(false)}
        onUpdate={fetchClassifications}
      />
    </Card>
  );
};

export default Models;
