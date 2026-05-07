import React, { useEffect, useState } from 'react';
import { Table, Button, Space, Tag, Modal, Form, Input, InputNumber, message, Popconfirm, Card, Typography, Select, Row, Col, Switch, Grid } from 'antd';
import MobileCardList, { MobileCard, CardRow, CardActions } from '../../components/MobileCardList';
import { PlusOutlined, EditOutlined, DeleteOutlined, SyncOutlined, SearchOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';
import useSettingsStore from '../../store/settings';
import { type ModelModel, type ClassificationsResponse, type ModelProvider, type ModelType, type ClassificationCount } from '../../types';
import ClassificationFilter from '../../components/Models/ClassificationFilter';
import ClassificationManager from '../../components/Models/ClassificationManager';
import IconPicker from '../../components/IconPicker';
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
  const [searchKeyword, setSearchKeyword] = useState('');

  const fetchModels = async () => {
    setLoading(true);
    try {
      const params: any = {
        provider_id: selectedProvider,
        type_id: selectedType,
      };
      if (searchKeyword.trim()) {
        params.search = searchKeyword.trim();
      }
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
  }, [selectedProvider, selectedType, searchKeyword]);

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
      enable_log_content: record.enable_log_content === 1,
      site_discount_enabled: record.site_discount_enabled === 1,
      site_discount: record.site_discount ?? 1.0,
      logo: record.logo || undefined,
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
      values.site_discount_enabled = values.site_discount_enabled ? 1 : 0;

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
      title: 'MID',
      dataIndex: 'mid',
      key: 'mid',
      render: (text: string) => (
        <Tag color="purple" style={{ fontFamily: 'monospace', fontSize: 12 }}>{text || '-'}</Tag>
      ),
    },
    {
      title: t('models.model_name'),
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: ModelModel) => (
        <Space size={8} align="start">
          {record.logo && (
            <img
              src={`/assets/icons/lobe/${record.logo}.svg`}
              alt=""
              style={{ width: 28, height: 28, objectFit: 'contain', borderRadius: 4, flexShrink: 0, marginTop: 2 }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          )}
          <Space direction="vertical" size={0}>
            <Text strong>{text}</Text>
            <Space size={4}>
              {record.provider_id && <Tag color="default" style={{ fontSize: '10px' }}>{getProviderName(record.provider_id)}</Tag>}
              {record.type_id && <Tag color="blue" style={{ fontSize: '10px' }}>{getTypeName(record.type_id)}</Tag>}
            </Space>
          </Space>
        </Space>
      ),
    },
    {
      title: t('models.model_id'),
      dataIndex: 'model_id',
      key: 'model_id',
      render: (text: string, record: ModelModel) => {
        let ruleNames: string[] = [];
        try {
          if (record.forward_rule_ids) {
            const ruleIds = JSON.parse(record.forward_rule_ids);
            if (Array.isArray(ruleIds)) {
              ruleNames = ruleIds.map((id: number) => {
                const r = allForwardRules.find(rule => rule.id === id);
                return r ? `${r.name}${r.eid ? ` (EID: ${r.eid})` : ''}` : null;
              }).filter(Boolean) as string[];
            }
          }
        } catch (e) {}

        return (
          <Space direction="vertical" size={4} style={{ display: 'flex' }}>
            <Tag color="blue">{text}</Tag>
            {ruleNames.length > 0 && (
              <div style={{ fontSize: 11, color: '#1677ff' }}>已挂载: {ruleNames.join(', ')}</div>
            )}
          </Space>
        );
      },
    },
    {
      title: t('models.billing_type'),
      key: 'billing_type',
      render: (_: any, record: ModelModel) => {
        const br = allBillingRules.find(b => b.id === record.billing_rule_id);
        const type = br ? br.billing_type : 'tokens';
        const colors: Record<string, string> = { tokens: 'cyan', requests: 'orange', duration: 'purple' };
        return (
          <Space direction="vertical" size={4}>
            <Tag color={colors[type]} style={{ margin: 0 }}>{t(`models.type_${type}`)}</Tag>
            {br && <Text type="secondary" style={{ fontSize: '11px' }}>{br.name}{br.pid ? ` (PID: ${br.pid})` : ''}</Text>}
          </Space>
        );
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
            {record.site_discount_enabled === 1 && (
              <Tag color="volcano" bordered={false} style={{ fontSize: '10px', marginTop: 2, padding: '0 4px', lineHeight: '16px' }}>
                {`折扣限价 ${Number(record.site_discount || 1).toFixed(2)} 倍率`}
              </Tag>
            )}
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
    <Card variant="borderless">
        <div style={{ display: 'flex', flexDirection: screens.xs ? 'column' : 'row', justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
          <Title level={screens.xs ? 4 : 2} style={{ margin: 0 }}>{t('models.title')}</Title>
          <Space wrap>
            <Input
              prefix={<SearchOutlined />}
              placeholder="搜索模型名 / Model ID / MID"
              allowClear
              value={searchKeyword}
              onChange={e => setSearchKeyword(e.target.value)}
              style={{ width: 240 }}
            />
            <Button icon={<SyncOutlined />} onClick={() => { fetchModels(); fetchClassifications(); }}>{t('common.refresh')}</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>{t('models.add_model')}</Button>
          </Space>
        </div>

      <ClassificationFilter
        providers={classStats.providers.map(p => ({
          ...p,
          logo: allProviders.find(ap => ap.id === p.id)?.logo
        }))}
        types={classStats.types.map(t => ({
          ...t,
          logo: allTypes.find(at => at.id === t.id)?.logo
        }))}
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {record.logo && (
                      <img src={`/assets/icons/lobe/${record.logo}.svg`} alt="" style={{ width: 24, height: 24, objectFit: 'contain', borderRadius: 4 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    )}
                    <div>
                      <Text strong>{record.name}</Text>
                      <div style={{ marginTop: 4 }}>
                        {record.provider_id && <Tag color="default" style={{ fontSize: 10 }}>{getProviderName(record.provider_id)}</Tag>}
                        {record.type_id && <Tag color="blue" style={{ fontSize: 10 }}>{getTypeName(record.type_id)}</Tag>}
                      </div>
                    </div>
                  </div>
                }
                extra={<Tag color={record.is_active ? 'success' : 'error'}>{record.is_active ? t('common.active') : t('common.disabled')}</Tag>}
              >
                <CardRow label="MID">
                  <Tag color="purple" style={{ fontFamily: 'monospace', fontSize: 11 }}>{record.mid || '-'}</Tag>
                </CardRow>
                <CardRow label="模型ID">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <Tag color="blue" style={{ fontSize: 11, width: 'fit-content', margin: 0 }}>{record.model_id}</Tag>
                    {(() => {
                      let ruleNames: string[] = [];
                      try {
                        if (record.forward_rule_ids) {
                          const ruleIds = JSON.parse(record.forward_rule_ids);
                          if (Array.isArray(ruleIds)) {
                            ruleNames = ruleIds.map((id: number) => {
                              const r = allForwardRules.find(rule => rule.id === id);
                              return r ? `${r.name}${r.eid ? ` (EID: ${r.eid})` : ''}` : null;
                            }).filter(Boolean) as string[];
                          }
                        }
                      } catch (e) {}
                      if (ruleNames.length > 0) {
                        return <div style={{ fontSize: 11, color: '#1677ff' }}>已挂载: {ruleNames.join(', ')}</div>;
                      }
                      return null;
                    })()}
                  </div>
                </CardRow>
                <CardRow label="计费类型">
                  <Space size={4}>
                    <Tag color={colors[billingTypeVal]} style={{ margin: 0 }}>{t(`models.type_${billingTypeVal}`)}</Tag>
                    {br && <Text type="secondary" style={{ fontSize: 11 }}>{br.name}{br.pid ? ` (PID: ${br.pid})` : ''}</Text>}
                  </Space>
                </CardRow>
                <CardRow label="费率">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {br ? <RateDisplay rule={br} currencySymbol={currencySymbol} /> : <Text type="secondary" italic>未挂载</Text>}
                    {record.site_discount_enabled === 1 && (
                      <div>
                        <Tag color="volcano" bordered={false} style={{ fontSize: '10px', margin: 0, padding: '0 4px', lineHeight: '16px' }}>
                          {`折扣限价 ${Number(record.site_discount || 1).toFixed(2)} 倍率`}
                        </Tag>
                      </div>
                    )}
                  </div>
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

          <Form.Item name="logo" label="模型 Logo">
            <IconPicker
              value={form.getFieldValue('logo')}
              onChange={(icon) => form.setFieldsValue({ logo: icon?.name || undefined })}
              placeholder="选择模型图标"
            />
          </Form.Item>

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
              <Form.Item name="type_id" label={t('models.type')} rules={[{ required: true, message: '请选择模型类型' }]}>
                <Select placeholder={t('common.select_placeholder')} allowClear>
                  {allTypes.map(t => (
                    <Option key={t.id} value={t.id}>{t.name}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="billing_rule_id" label="计费基础定价模板绑定 (核心枢纽)" rules={[{ required: true }]}>
             <Select placeholder="选择从《计费策略配置库》中下发的统一基础定价方案" allowClear>
               {allBillingRules.map(b => (
                 <Option key={b.id} value={b.id}>{b.name}{b.pid ? ` [PID: ${b.pid}]` : ''}</Option>
               ))}
             </Select>
          </Form.Item>

          <Form.Item name="forward_rule_ids" label="挂载高级组合理念流 (转发规则组合包)">
            <Select 
                mode="multiple" 
                placeholder="在此选择需被当前模型顺序应用的一系列专属转发规则" 
                allowClear 
                optionFilterProp="children"
            >
              {allForwardRules.map(r => (
                <Option key={r.id} value={r.id}>{r.name} ({r.rule_type}){r.eid ? ` [EID: ${r.eid}]` : ''}</Option>
              ))}
            </Select>
          </Form.Item>

          <Row gutter={16}>
             <Col span={6}>
                 <Form.Item name="is_active" label={t('common.status')} valuePropName="checked" initialValue={true}>
                    <Switch checkedChildren={t('common.active')} unCheckedChildren={t('common.disabled')} />
                 </Form.Item>
             </Col>
             <Col span={6}>
                 <Form.Item name="enable_log_content" label="记录上下文" valuePropName="checked" initialValue={false}>
                    <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                 </Form.Item>
             </Col>
             <Col span={6}>
                 <Form.Item name="site_discount_enabled" label="折扣限价" valuePropName="checked" initialValue={false}>
                    <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                 </Form.Item>
             </Col>
             <Col span={6}>
                 <Form.Item name="pre_deduction" label={`预扣费 (${settings?.currency?.default_currency || 'USD'})`} initialValue={0.0}>
                    <InputNumber style={{ width: '100%' }} precision={6} min={0} />
                 </Form.Item>
             </Col>
          </Row>

          <Form.Item noStyle shouldUpdate={(prev: any, cur: any) => prev.site_discount_enabled !== cur.site_discount_enabled}>
            {({ getFieldValue }: any) => getFieldValue('site_discount_enabled') ? (
              <Form.Item name="site_discount" label="折扣限价倍率（设置后折扣不低于此值，如 0.9 = 最低九折，等级折扣高于此值时仍使用等级折扣）" initialValue={1.0}>
                <InputNumber style={{ width: '100%' }} precision={2} step={0.1} min={0.01} />
              </Form.Item>
            ) : null}
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
