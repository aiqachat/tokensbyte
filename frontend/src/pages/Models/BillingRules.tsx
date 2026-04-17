import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Space, Form, Input, Switch, message, Popconfirm, Modal, Tag, Radio, InputNumber, Row, Col, Typography } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, DeleteTwoTone } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';
import useSettingsStore from '../../store/settings';
import RateDisplay from './RateDisplay';

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
  extended_config: string;
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
      pricing_tiers: [],
      sd2_480p_video: 0, sd2_480p_base: 0,
      sd2_720p_video: 0, sd2_720p_base: 0,
      sd2_1080p_video: 0, sd2_1080p_base: 0,
      volc_audio_rate: 0, volc_base_rate: 0,
    });
    setIsModalVisible(true);
  };

  const handleEdit = (item: BillingRuleData) => {
    let tiers = [];
    let ext: any = {};
    try {
      if (item.pricing_tiers) {
        tiers = JSON.parse(item.pricing_tiers);
      }
      if (item.extended_config) {
        ext = JSON.parse(item.extended_config);
      }
    } catch (e) {}

    setEditingItem(item);
    setBillingType(item.billing_type);
    form.setFieldsValue({
      ...item,
      pricing_tiers: tiers,
      sd2_480p_video: ext.resolution_rates?.['480p']?.with_video || 0,
      sd2_480p_base: ext.resolution_rates?.['480p']?.without_video || 0,
      sd2_720p_video: ext.resolution_rates?.['720p']?.with_video || 0,
      sd2_720p_base: ext.resolution_rates?.['720p']?.without_video || 0,
      sd2_1080p_video: ext.resolution_rates?.['1080p']?.with_video || 0,
      sd2_1080p_base: ext.resolution_rates?.['1080p']?.without_video || 0,
      volc_audio_rate: ext.audio_rate || 0,
      volc_base_rate: ext.base_rate || 0,
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
      if (values.billing_rule !== 'tiered' && values.billing_rule !== 'image_resolution' && values.billing_rule !== 'video_resolution') {
        values.pricing_tiers = [];
      }

      // 只有特定多模态规则才打包 extended_config，其他保持空对象
      let extConfig = {};
      if (values.billing_rule === 'seedance2.0') {
        extConfig = {
          resolution_rates: {
            '480p': { with_video: values.sd2_480p_video || 0, without_video: values.sd2_480p_base || 0 },
            '720p': { with_video: values.sd2_720p_video || 0, without_video: values.sd2_720p_base || 0 },
            '1080p': { with_video: values.sd2_1080p_video || 0, without_video: values.sd2_1080p_base || 0 },
          },
        };
      } else if (values.billing_rule === 'seedance1.5pro') {
        extConfig = {
          audio_rate: values.volc_audio_rate || 0,
          base_rate: values.volc_base_rate || 0,
        };
      }

      // 清除表单中不应提交的临时字段
      delete values.sd2_480p_video; delete values.sd2_480p_base;
      delete values.sd2_720p_video; delete values.sd2_720p_base;
      delete values.sd2_1080p_video; delete values.sd2_1080p_base;
      delete values.volc_audio_rate;
      delete values.volc_base_rate;

      const payload = {
        prompt_rate: 0,
        completion_rate: 0,
        fixed_rate: 0,
        duration_rate: 0,
        ...values,
        extended_config: extConfig,
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
        return <RateDisplay rule={record} currencySymbol={currencySymbol} />;
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
            <Radio.Group optionType="button" buttonStyle="solid" onChange={(e) => {
              const type = e.target.value;
              setBillingType(type);
              if (type === 'tokens') form.setFieldsValue({ billing_rule: 'standard' });
              else if (type === 'requests') form.setFieldsValue({ billing_rule: 'fixed' });
              else if (type === 'duration') form.setFieldsValue({ billing_rule: 'standard' });
            }}>
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
                  <Radio value="seedance2.0">Seedance 2.0</Radio>
                  <Radio value="seedance1.5pro">Seedance 1.5 Pro</Radio>
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
                  } else if (rule === 'seedance2.0') {
                    return (
                      <div style={{ background: '#141414', padding: '20px', borderRadius: '12px', marginBottom: 24, border: '1px solid #303030' }}>
                        <Text type="secondary" style={{ fontSize: '12px', display: 'block', marginBottom: 12 }}>
                          Seedance 2.0 — 按输出视频分辨率和输入是否包含视频区分定价 (doubao-seedance-2.0)
                        </Text>
                        <Row gutter={16} style={{ marginBottom: 8 }}>
                          <Col span={6}><Text strong style={{ fontSize: '12px' }}>单价 (元/百万Token)</Text></Col>
                          {['480p', '720p', '1080p'].map(r => <Col span={6} key={r} style={{ textAlign: 'center' }}><Text strong style={{ fontSize: '12px' }}>{r}</Text></Col>)}
                        </Row>
                        <Row gutter={16} align="middle" style={{ marginBottom: 8 }}>
                          <Col span={6}><Text style={{ fontSize: '12px' }}>包含视频输入</Text></Col>
                          {['480p', '720p', '1080p'].map(r => (
                            <Col span={6} key={r}><Form.Item name={`sd2_${r}_video`} noStyle rules={[{ required: true, message: '' }]}><InputNumber style={{ width: '100%' }} precision={2} min={0} /></Form.Item></Col>
                          ))}
                        </Row>
                        <Row gutter={16} align="middle">
                          <Col span={6}><Text style={{ fontSize: '12px' }}>不包含视频输入</Text></Col>
                          {['480p', '720p', '1080p'].map(r => (
                            <Col span={6} key={r}><Form.Item name={`sd2_${r}_base`} noStyle rules={[{ required: true, message: '' }]}><InputNumber style={{ width: '100%' }} precision={2} min={0} /></Form.Item></Col>
                          ))}
                        </Row>
                      </div>
                    );
                  } else if (rule === 'seedance1.5pro') {
                    return (
                      <>
                        <Row gutter={16} align="middle" style={{ marginBottom: 12 }}>
                          <Col span={12}><Form.Item name="volc_audio_rate" label="包含语音" rules={[{ required: true }]} style={{ marginBottom: 0 }}><InputNumber style={{ width: '100%' }} precision={6} addonAfter="/ 1M" /></Form.Item></Col>
                          <Col span={12}><Form.Item name="volc_base_rate" label="不包含语音" rules={[{ required: true }]} style={{ marginBottom: 0 }}><InputNumber style={{ width: '100%' }} precision={6} addonAfter="/ 1M" /></Form.Item></Col>
                        </Row>
                      </>
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
                                    <Space.Compact style={{ width: '100%' }}>
                                      <Form.Item {...restField} name={[name, 'max_prompt_tokens']} rules={[{ required: true, message: '' }]} noStyle>
                                        <InputNumber placeholder="输入界限(Token)" style={{ width: '50%' }} />
                                      </Form.Item>
                                      <Form.Item {...restField} name={[name, 'max_completion_tokens']} noStyle>
                                        <InputNumber placeholder="输出上限(选填)" style={{ width: '50%' }} />
                                      </Form.Item>
                                    </Space.Compact>
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
            <>
              <Form.Item name="billing_rule" label="计费子模式配置" initialValue="fixed">
                <Radio.Group optionType="button" buttonStyle="solid">
                  <Radio value="fixed">固定费率 (单次)</Radio>
                  <Radio value="per_image">按张收费 (实际返回)</Radio>
                  <Radio value="image_resolution">按分辨率张收费</Radio>
                </Radio.Group>
              </Form.Item>

              <Form.Item noStyle shouldUpdate={(prev, curr) => prev.billing_rule !== curr.billing_rule}>
                {({ getFieldValue }) => {
                  const rule = getFieldValue('billing_rule');
                  
                  if (rule === 'image_resolution') {
                    return (
                      <div style={{ 
                        background: '#141414', padding: '20px', borderRadius: '12px', marginBottom: '24px', border: '1px solid #303030'
                      }}>
                        <Title level={5} style={{ marginBottom: 16, fontSize: '14px', color: 'rgba(255,255,255,0.85)' }}>图片分辨率计费配置</Title>
                        <Form.List name="pricing_tiers" initialValue={[]}>
                          {(fields, { add, remove }) => (
                            <>
                              {fields.map(({ key, name, ...restField }) => (
                                <Row key={key} gutter={16} align="middle" style={{ marginBottom: 12 }}>
                                  <Col span={10}>
                                    <Form.Item {...restField} name={[name, 'resolution']} rules={[{ required: true }]} noStyle>
                                      <Input placeholder="图片分辨率 (如: 1K, 1024x1024)" style={{ width: '100%' }} />
                                    </Form.Item>
                                  </Col>
                                  <Col span={8}>
                                    <Form.Item {...restField} name={[name, 'rate']} rules={[{ required: true }]} noStyle>
                                      <InputNumber placeholder="单张费率" style={{ width: '100%' }} precision={6} addonAfter="/ 张" />
                                    </Form.Item>
                                  </Col>
                                  <Col span={4}>
                                    <Form.Item {...restField} name={[name, 'enabled']} valuePropName="checked" style={{ marginBottom: 0 }}>
                                      <Switch size="small" checkedChildren="开启" unCheckedChildren="关闭" />
                                    </Form.Item>
                                  </Col>
                                  <Col span={2} style={{ textAlign: 'right' }}>
                                    <Button type="text" danger icon={<DeleteTwoTone />} onClick={() => remove(name)} />
                                  </Col>
                                </Row>
                              ))}
                              <Button 
                                type="dashed" 
                                onClick={() => add({ resolution: '', rate: 0, enabled: true })} 
                                block 
                                icon={<PlusOutlined />}
                                style={{ marginTop: 8, height: '40px' }}
                              >
                                增加一个分辨率价格档位
                              </Button>
                            </>
                          )}
                        </Form.List>
                      </div>
                    );
                  } else {
                    return (
                      <Form.Item name="fixed_rate" label={t('models.fixed_rate')} rules={[{ required: true }]}>
                        <InputNumber style={{ width: '100%' }} precision={6} addonAfter={rule === 'per_image' ? "/ 张" : "/ Request"} />
                      </Form.Item>
                    );
                  }
                }}
              </Form.Item>
            </>
          )}

          {billingType === 'duration' && (
            <>
              <Form.Item name="billing_rule" label="时长计费子模式配置" initialValue="standard">
                <Radio.Group optionType="button" buttonStyle="solid">
                  <Radio value="standard">按固定时长收费 (单价/秒)</Radio>
                  <Radio value="video_resolution">按视频分辨率阶梯表</Radio>
                </Radio.Group>
              </Form.Item>

              <Form.Item noStyle shouldUpdate={(prev, curr) => prev.billing_rule !== curr.billing_rule}>
                {({ getFieldValue }) => {
                  const rule = getFieldValue('billing_rule');
                  
                  if (rule === 'video_resolution') {
                    return (
                      <div style={{ background: '#141414', padding: '20px', borderRadius: '12px', marginBottom: '24px', border: '1px solid #303030' }}>
                        <Title level={5} style={{ marginBottom: 16, fontSize: '14px', color: 'rgba(255,255,255,0.85)' }}>视频分辨率计费组合包</Title>
                        <Form.List name="pricing_tiers" initialValue={[]}>
                          {(fields, { add, remove }) => (
                            <>
                              {fields.map(({ key, name, ...restField }) => (
                                <Row key={key} gutter={16} align="middle" style={{ marginBottom: 12 }}>
                                  <Col span={10}>
                                    <Form.Item {...restField} name={[name, 'resolution']} rules={[{ required: true }]} noStyle>
                                      <Input placeholder="视频分辨率 (如: 720p, 1080p, 4k)" style={{ width: '100%' }} />
                                    </Form.Item>
                                  </Col>
                                  <Col span={8}>
                                    <Form.Item {...restField} name={[name, 'rate']} rules={[{ required: true }]} noStyle>
                                      <InputNumber placeholder="每秒单价" style={{ width: '100%' }} precision={6} addonAfter="/ 秒" />
                                    </Form.Item>
                                  </Col>
                                  <Col span={4}>
                                    <Form.Item {...restField} name={[name, 'enabled']} valuePropName="checked" style={{ marginBottom: 0 }}>
                                      <Switch size="small" checkedChildren="开启" unCheckedChildren="关闭" />
                                    </Form.Item>
                                  </Col>
                                  <Col span={2} style={{ textAlign: 'right' }}>
                                    <Button type="text" danger icon={<DeleteTwoTone />} onClick={() => remove(name)} />
                                  </Col>
                                </Row>
                              ))}
                              <Button type="dashed" onClick={() => add({ resolution: '', rate: 0, enabled: true })} block icon={<PlusOutlined />} style={{ marginTop: 8, height: '40px' }}>
                                增加一个视频分辨率价格档位
                              </Button>
                            </>
                          )}
                        </Form.List>
                      </div>
                    );
                  } else {
                    return (
                      <Form.Item name="duration_rate" label={t('models.duration_rate')} rules={[{ required: true }]}>
                        <InputNumber style={{ width: '100%' }} precision={6} addonAfter="/ s" />
                      </Form.Item>
                    );
                  }
                }}
              </Form.Item>
            </>
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
