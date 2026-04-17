import React, { useEffect, useState } from 'react';
import { Table, Button, Space, Tag, Modal, Form, Input, InputNumber, message, Popconfirm, Card, Typography, Select, Row, Col, Radio, Switch, Grid } from 'antd';
import MobileCardList, { MobileCard, CardRow, CardActions } from '../../components/MobileCardList';
import { PlusOutlined, EditOutlined, DeleteOutlined, SyncOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';
import useSettingsStore from '../../store/settings';
import { type ModelModel, type ClassificationsResponse, type ModelProvider, type ModelType, type ClassificationCount } from '../../types';
import ClassificationFilter from '../../components/Models/ClassificationFilter';
import ClassificationManager from '../../components/Models/ClassificationManager';
import RateDisplay from './RateDisplay';

const { Title, Text } = Typography;
const { Option } = Select;
const { useBreakpoint } = Grid;

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
  const screens = useBreakpoint();

  // Classification State
  const [classStats, setClassStats] = useState<ClassificationsResponse>({ providers: [], types: [] });
  const [allProviders, setAllProviders] = useState<ModelProvider[]>([]);
  const [allTypes, setAllTypes] = useState<ModelType[]>([]);
  const [allForwardRules, setAllForwardRules] = useState<any[]>([]);
  const [allBillingRules, setAllBillingRules] = useState<any[]>([]);
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

      const rules = await (request.get('/forward-rules') as any);
      setAllForwardRules(rules.filter((r: any) => r.is_active));

      const brs = await (request.get('/billing-rules') as any);
      setAllBillingRules(brs.filter((b: any) => b.is_active === 1));
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
    setEditingModel(record);
    setBillingType('tokens');
    
    let ruleIds = [];
    try {
        if (record.forward_rule_ids) {
            ruleIds = JSON.parse(record.forward_rule_ids);
        }
    } catch(e) {}

    form.setFieldsValue({
      ...record,
      forward_rule_ids: ruleIds,
      is_active: record.is_active === 1,
      enable_log_content: record.enable_log_content === 1
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
      // Cleanup arrays internally managed
      values.is_active = values.is_active ? 1 : 0;
      values.enable_log_content = values.enable_log_content ? 1 : 0;

      const br = allBillingRules.find(b => b.id === values.billing_rule_id);

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
            {(() => {
              const br = allBillingRules.find(b => b.id === record.billing_rule_id);
              if (br && br.billing_rule === 'tiered') return <Tag color="gold" style={{ fontSize: '10px' }}>{t('models.rule_tiered')}</Tag>;
              return null;
            })()}
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
      key: 'billing_type',
      render: (_: any, record: ModelModel) => {
        const br = allBillingRules.find(b => b.id === record.billing_rule_id);
        const type = br ? br.billing_type : 'tokens';
        const colors: Record<string, string> = { tokens: 'cyan', requests: 'orange', duration: 'purple' };
        return <Tag color={colors[type]}>{t(`models.type_${type}`)}</Tag>;
      },
    },
    {
      title: t('models.rates'),
      key: 'rates',
      render: (_: any, record: ModelModel) => {
        const br = allBillingRules.find((b: any) => b.id === record.billing_rule_id);
        if (!br) return <Text type="secondary" italic>未挂载费用模板</Text>;
        return (
          <Space direction="vertical" size={0}>
            <RateDisplay rule={br} currencySymbol={currencySymbol} />
            {(record.pre_deduction ?? 0) > 0 && <Text style={{ fontSize: '11px', color: '#faad14' }}>预扣: {currencySymbol}{record.pre_deduction}</Text>}
          </Space>
        );
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
      <div style={{ display: 'flex', flexDirection: screens.xs ? 'column' : 'row', justifyContent: 'space-between', marginBottom: 24, gap: 12 }}>
        <Title level={screens.xs ? 4 : 2} style={{ margin: 0 }}>{t('models.title')}</Title>
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

      {screens.xs ? (
        <MobileCardList
          dataSource={models}
          loading={loading}
          rowKey="id"
          pagination={{ pageSize: 12 }}
          renderCard={(record: any) => {
            const br = allBillingRules.find((b: any) => b.id === record.billing_rule_id);
            const billingTypeVal = br ? br.billing_type : 'tokens';
            const colors: Record<string, string> = { tokens: 'cyan', requests: 'orange', duration: 'purple' };
            return (
              <MobileCard
                title={
                  <div>
                    <Text strong>{record.name}</Text>
                    <div style={{ marginTop: 4 }}>
                      {record.provider_id && <Tag color="default" style={{ fontSize: 10 }}>{getProviderName(record.provider_id)}</Tag>}
                      {record.type_id && <Tag color="blue" style={{ fontSize: 10 }}>{getTypeName(record.type_id)}</Tag>}
                    </div>
                  </div>
                }
                extra={<Tag color={record.is_active ? 'success' : 'error'}>{record.is_active ? t('common.active') : t('common.disabled')}</Tag>}
              >
                <CardRow label="模型ID"><Tag color="blue" style={{ fontSize: 11 }}>{record.model_id}</Tag></CardRow>
                <CardRow label="计费类型"><Tag color={colors[billingTypeVal]}>{t(`models.type_${billingTypeVal}`)}</Tag></CardRow>
                <CardRow label="费率">
                  {br ? <RateDisplay rule={br} currencySymbol={currencySymbol} /> : <Text type="secondary" italic>未挂载</Text>}
                </CardRow>
                {(record.pre_deduction ?? 0) > 0 && (
                  <CardRow label="预扣"><Text style={{ fontSize: 11, color: '#faad14' }}>{currencySymbol}{record.pre_deduction}</Text></CardRow>
                )}
                <CardActions>
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
          dataSource={models}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 12 }}
          scroll={{ x: 'max-content' }}
        />
      )}

      <Modal
        title={editingModel ? t('models.edit_model') : t('models.add_model')}
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        onOk={() => form.submit()}
        width={700}
      >
        <Form form={form} layout="vertical" onFinish={handleSave} initialValues={{ is_active: true, enable_log_content: 0, pre_deduction: 0 }}>
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

          <Form.Item name="forward_rule_ids" label="挂载高级组合理念流 (转发规则组合包)">
            <Select 
                mode="multiple" 
                placeholder="在此选择需被当前模型顺序应用的一系列专属转发规则" 
                allowClear 
                optionFilterProp="children"
            >
              {allForwardRules.map(r => (
                <Option key={r.id} value={r.id}>{r.name} ({r.rule_type})</Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="billing_rule_id" label="计费基础定价模板绑定 (核心枢纽)" rules={[{ required: true }]}>
             <Select placeholder="选择从《计费策略配置库》中下发的统一基础定价方案" allowClear>
               {allBillingRules.map(b => (
                 <Option key={b.id} value={b.id}>{b.name}</Option>
               ))}
             </Select>
          </Form.Item>

          <Row gutter={16}>
             <Col span={8}>
                 <Form.Item name="is_active" label={t('common.status')} valuePropName="checked" initialValue={true}>
                    <Switch checkedChildren={t('common.active')} unCheckedChildren={t('common.disabled')} />
                 </Form.Item>
             </Col>
             <Col span={8}>
                 <Form.Item name="enable_log_content" label="记录上下文" valuePropName="checked" initialValue={false}>
                    <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                 </Form.Item>
             </Col>
             <Col span={8}>
                 <Form.Item name="pre_deduction" label="初始预扣费 (USD)" initialValue={0.0}>
                    <InputNumber style={{ width: '100%' }} precision={6} min={0} />
                 </Form.Item>
             </Col>
          </Row>
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
