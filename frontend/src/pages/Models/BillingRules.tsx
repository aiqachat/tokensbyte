import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Space, Form, Input, Switch, message, Popconfirm, Modal, Tag, Radio, InputNumber, Row, Col, Typography } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, DeleteTwoTone } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';
import useSettingsStore from '../../store/settings';

const { Title, Text } = Typography;

interface BillingRuleData {
  id: number;
  name: string;
  billing_type: string;
  billing_rule: string;
  prompt_rate: number;
  completion_rate: number;
  fixed_rate: number;
  duration_rate: number;
  pricing_tiers: string;
  is_active: number;
  created_at: string;
}

const BillingRules: React.FC = () => {
  const { t } = useTranslation();
  const { settings } = useSettingsStore();
  const currencySymbol = settings?.currency?.currency_symbol || '$';
  
  const [items, setItems] = useState<BillingRuleData[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<BillingRuleData | null>(null);
  const [billingType, setBillingType] = useState('tokens');
  const [form] = Form.useForm();

  const fetchItems = async () => {
    setLoading(true);
    try {
      const resp = await (request.get('/billing-rules') as any);
      setItems(resp);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const handleAdd = () => {
    setEditingItem(null);
    setBillingType('tokens');
    form.resetFields();
    form.setFieldsValue({
      billing_type: 'tokens',
      billing_rule: 'standard',
      is_active: true,
      prompt_rate: 0,
      completion_rate: 0,
      fixed_rate: 0,
      duration_rate: 0,
      pricing_tiers: []
    });
    setIsModalVisible(true);
  };

  const handleEdit = (item: BillingRuleData) => {
    let tiers = [];
    try {
      if (item.pricing_tiers) {
        tiers = JSON.parse(item.pricing_tiers);
      }
    } catch (e) {}

    setEditingItem(item);
    setBillingType(item.billing_type);
    form.setFieldsValue({
      ...item,
      pricing_tiers: tiers,
      is_active: item.is_active === 1,
    });
    setIsModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await request.delete(`/billing-rules/${id}`);
      message.success(t('common.success'));
      fetchItems();
    } catch (e) {
      console.error(e);
      message.error(t('common.error'));
    }
  };

  const handleSave = async (values: any) => {
    try {
      if (values.billing_rule === 'standard') {
        values.pricing_tiers = [];
      }

      const payload = {
        ...values,
        is_active: values.is_active ? 1 : 0,
      };

      if (editingItem) {
        await request.put(`/billing-rules/${editingItem.id}`, payload);
      } else {
        await request.post('/billing-rules', payload);
      }
      message.success(t('common.success'));
      setIsModalVisible(false);
      fetchItems();
    } catch (e) {
      console.error(e);
    }
  };

  const columns = [
    {
      title: '策略 ID',
      dataIndex: 'id',
      key: 'id',
      width: 80,
    },
    {
      title: '计费策略集命名',
      dataIndex: 'name',
      key: 'name',
      width: 200,
      render: (text: string) => <Text strong>{text}</Text>
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
      render: (_: any, record: BillingRuleData) => {
        if (record.billing_type === 'tokens') {
            const unitSuffix = '/1M';
            if (record.billing_rule === 'tiered') {
                return <Text type="warning" style={{ fontSize: '12px' }}>{t('models.rule_tiered')} (见JSON)</Text>;
            }
            return (
              <Space direction="vertical" size={0}>
                <Text type="secondary" style={{ fontSize: '12px' }}>P: {currencySymbol}{record.prompt_rate}{unitSuffix}</Text>
                <Text type="secondary" style={{ fontSize: '12px' }}>C: {currencySymbol}{record.completion_rate}{unitSuffix}</Text>
              </Space>
            );
        } else if (record.billing_type === 'requests') {
            return <Text type="secondary">{currencySymbol}{record.fixed_rate} / 请求</Text>;
        } else {
            return <Text type="secondary">{currencySymbol}{record.duration_rate}/s</Text>;
        }
      }
    },
    {
      title: t('common.status'),
      dataIndex: 'is_active',
      key: 'is_active',
      render: (active: number) => (
        <Switch checked={active === 1} disabled />
      ),
      width: 100,
    },
    {
      title: t('common.actions'),
      key: 'actions',
      render: (_: any, record: BillingRuleData) => (
        <Space>
          <Button icon={<EditOutlined />} onClick={() => handleEdit(record)} size="small" />
          <Popconfirm title={t('common.confirm_delete')} onConfirm={() => handleDelete(record.id)}>
            <Button icon={<DeleteOutlined />} danger size="small" />
          </Popconfirm>
        </Space>
      ),
      width: 120,
    },
  ];

  return (
    <div>
      <Card title="大模型价格配置与统一计费计算池" extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          新建计费策略类
        </Button>
      }>
        <Table
          dataSource={items}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 15 }}
          size="middle"
        />
      </Card>

      <Modal
        title={editingItem ? '编辑计费基础组' : '生成新的计费规则'}
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        onOk={() => form.submit()}
        width={700}
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="name" label="计费模板名称规则记号 (比如: 高级大模型统一定价 1M包)" rules={[{ required: true }]}>
            <Input placeholder="输入该组计费的明显记号，方便添加模型时直接下拉应用。" />
          </Form.Item>

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
                            <InputNumber style={{ width: '100%' }} precision={6} addonAfter="/ 1M" />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="completion_rate" label={unitLabelComp} rules={[{ required: true }]}>
                            <InputNumber style={{ width: '100%' }} precision={6} addonAfter="/ 1M" />
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
                                    <Button type="text" danger icon={<DeleteTwoTone />} onClick={() => remove(name)} />
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
                                添加一条上下文费用阶梯设定
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
              <InputNumber style={{ width: '100%' }} precision={4} addonAfter="/ Request" />
            </Form.Item>
          )}

          {billingType === 'duration' && (
            <Form.Item name="duration_rate" label={t('models.duration_rate')} rules={[{ required: true }]}>
              <InputNumber style={{ width: '100%' }} precision={6} addonAfter="/ s" />
            </Form.Item>
          )}

          <Form.Item name="is_active" label={t('common.status')} valuePropName="checked">
            <Switch checkedChildren="开放策略" unCheckedChildren="关闭策略" />
          </Form.Item>
        </Form>
      </Modal>

    </div>
  );
};

export default BillingRules;
