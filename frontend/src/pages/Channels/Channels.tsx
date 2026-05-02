import React, { useEffect, useState } from 'react';
import { Table, Button, Space, Tag, Modal, Form, Input, InputNumber, message, Popconfirm, Card, Typography, Select, Row, Col, Switch, Grid, Segmented } from 'antd';
import MobileCardList, { MobileCard, CardRow, CardActions } from '../../components/MobileCardList';
import { PlusOutlined, EditOutlined, DeleteOutlined, SyncOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import request from '../../utils/request';
import useSettingsStore from '../../store/settings';
import type { Channel } from '../../types';
import { useThemeStore } from '../../store/theme';

const { Title, Text } = Typography;
const { Option } = Select;
const { useBreakpoint } = Grid;

const Channels: React.FC = () => {
  const { themeMode } = useThemeStore();
  const _isLight = themeMode === 'light';
  const { t } = useTranslation();
  const { settings } = useSettingsStore();
  const currencySymbol = settings?.currency?.currency_symbol || '$';
  const [channels, setChannels] = useState<Channel[]>([]);
  const [availableModels, setAvailableModels] = useState<any[]>([]);
  const [availableUserLevels, setAvailableUserLevels] = useState<any[]>([]);
  const [presets, setPresets] = useState<any[]>([]);
  const [volcenginePools, setVolcenginePools] = useState<any[]>([]);
  const [gptImagePools, setGptImagePools] = useState<any[]>([]);
  const [activePlugins, setActivePlugins] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const [showMapping, setShowMapping] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const screens = useBreakpoint();
  const [isExcludeMode, setIsExcludeMode] = useState(false);

  const [statusFilter, setStatusFilter] = useState<number | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredChannels = channels.filter(c => {
    let matchStatus = true;
    if (statusFilter !== 'all') {
      matchStatus = c.status === statusFilter;
    }
    
    let matchSearch = true;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      matchSearch = (c.name && c.name.toLowerCase().includes(q)) || 
                    (c.group_aid && c.group_aid.toLowerCase().includes(q));
    }
    return matchStatus && matchSearch;
  });

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

  const fetchPluginsAndPools = async () => {
    try {
      const resp = await (request.get('/plugins') as unknown as Promise<{ plugins: any[] }>);
      const plugins = resp.plugins || [];
      const activeMap: Record<string, boolean> = {};
      
      let hasVolcengine = false;
      let hasGptImage = false;

      plugins.forEach(p => {
        if (p.is_enabled === 1) {
          activeMap[p.name] = true;
          if (p.name === 'volcengine_pool') hasVolcengine = true;
          if (p.name === 'gptimage_pool') hasGptImage = true;
        }
      });
      setActivePlugins(activeMap);

      if (hasVolcengine) {
        request.get('/plugins/volcengine_pool/pools').then((r: any) => setVolcenginePools(r.pools || [])).catch(() => {});
      }
      if (hasGptImage) {
        request.get('/plugins/gptimage_pool/pools').then((r: any) => setGptImagePools(r.pools || [])).catch(() => {});
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchChannels();
    fetchModels();
    fetchUserLevels();
    fetchPresets();
    fetchPluginsAndPools();
  }, []);

  const handleAdd = () => {
    setEditingChannel(null);
    form.resetFields();
    setShowMapping(false);
    setIsExcludeMode(false);
    setIsModalVisible(true);
  };

  const handleEdit = (record: Channel) => {
    setEditingChannel(record);
    let mapping = {};
    try {
      mapping = typeof record.model_mapping === 'string' ? JSON.parse(record.model_mapping) : record.model_mapping;
    } catch (e) {}

    // models 兼容处理：新格式存 mid，旧格式存 model_id，需要统一转为 mid
    const modelsForForm = (record.models || []).map((val: string) => {
      // 先检查是否已经是 mid
      if (availableModels.find(m => m.mid === val)) return val;
      // 如果不是 mid，尝试按 model_id 查找对应的 mid（旧格式兼容）
      const match = availableModels.find(m => m.model_id === val);
      return match ? match.mid : val;
    });

    form.setFieldsValue({
      ...record,
      model_mapping: mapping,
      models: modelsForForm,
      level_select: (record as any).exclude_user_groups?.length > 0 ? (record as any).exclude_user_groups : record.user_groups,
    });
    // 如果有任何映射值则自动开启开关
    const hasMapping = Object.values(mapping as Record<string, string>).some(v => v && String(v).trim());
    setShowMapping(hasMapping);
    // 判断是否为排除模式
    setIsExcludeMode((record as any).exclude_user_groups?.length > 0);
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

    // 直接以 mid 保存，后端路由层会通过 mid 反查 model_id 进行匹配
    const selectedLevels = values.level_select || [];
    const data = {
      ...values,
      models: values.models || [],
      provider_type: values.provider_type || 'custom',
      model_mapping: finalMapping,
      user_groups: isExcludeMode ? [] : selectedLevels,
      exclude_user_groups: isExcludeMode ? selectedLevels : [],
    };
    delete data.level_select;

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
      key: 'user_groups',
      render: (_: any, record: any) => {
        const groups = record.user_groups;
        const excludeGroups = record.exclude_user_groups;
        if (excludeGroups && excludeGroups.length > 0) {
          return (
            <Space size={[0, 4]} wrap>
              <Tag color="orange">排除模式</Tag>
              {excludeGroups.map((idStr: string) => {
                const level = availableUserLevels.find(l => l.id.toString() === idStr || l.group_key === idStr);
                return <Tag color="red" key={idStr}>{level ? level.name : idStr}</Tag>;
              })}
            </Space>
          );
        }
        if (!groups || groups.length === 0) return <Tag color="green">全部允许</Tag>;
        return (
          <Space size={[0, 4]} wrap>
            {groups.map((idStr: string) => {
              const level = availableUserLevels.find(l => l.id.toString() === idStr || l.group_key === idStr);
              return <Tag color="blue" key={idStr}>{level ? level.name : idStr}</Tag>;
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
        <Space wrap>
          <Segmented
            options={[
              { label: '全部', value: 'all' },
              { label: '激活', value: 1 },
              { label: '已禁用', value: 0 },
            ]}
            value={statusFilter}
            onChange={(val) => setStatusFilter(val as number | 'all')}
          />
          <Input.Search
            placeholder="搜索 AID 或 名称"
            allowClear
            onSearch={setSearchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: 200 }}
          />
          <Button icon={<SyncOutlined />} onClick={fetchChannels}>{t('common.refresh')}</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>{t('channels.add_channel')}</Button>
        </Space>
      </div>

      {screens.xs ? (
        <MobileCardList
          dataSource={filteredChannels}
          loading={loading}
          rowKey="id"
          pagination={{ pageSize: 10 }}
          renderCard={(record: any) => {
            const used = record.quota_used || 0;
            const limit = record.quota_limit ?? -1;
            const groups = record.user_groups;
            const excludeGroups = record.exclude_user_groups;
            return (
              <MobileCard
                title={<Text strong>{record.name}</Text>}
                extra={<Tag color={record.status === 1 ? 'success' : 'error'}>{record.status === 1 ? t('common.active') : t('common.disabled')}</Tag>}
              >
                {record.group_aid && <CardRow label="AID"><Tag color="geekblue">{record.group_aid}</Tag></CardRow>}
                <CardRow label="类型"><Tag color="purple">通用接口池</Tag></CardRow>
                <CardRow label="支持等级">
                  {excludeGroups && excludeGroups.length > 0
                    ? <Space size={[0, 4]} wrap>
                        <Tag color="orange">排除模式</Tag>
                        {excludeGroups.map((idStr: string) => {
                          const lv = availableUserLevels.find((l: any) => l.id.toString() === idStr || l.group_key === idStr);
                          return <Tag color="red" key={idStr}>{lv ? lv.name : idStr}</Tag>;
                        })}
                      </Space>
                    : (!groups || groups.length === 0)
                      ? <Tag color="green">全部允许</Tag>
                      : <Space size={[0, 4]} wrap>{groups.map((idStr: string) => {
                          const lv = availableUserLevels.find((l: any) => l.id.toString() === idStr || l.group_key === idStr);
                          return <Tag color="blue" key={idStr}>{lv ? lv.name : idStr}</Tag>;
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
          dataSource={filteredChannels}
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

          <Form.Item shouldUpdate={(prev, curr) => prev.preset_id !== curr.preset_id || prev.pool_id !== curr.pool_id || prev.gptimage_pool_id !== curr.gptimage_pool_id} noStyle>
            {() => {
              const currentPreset = form.getFieldValue('preset_id');
              const currentVolcPool = form.getFieldValue('pool_id');
              const currentGptImagePool = form.getFieldValue('gptimage_pool_id');

              return (
                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item name="preset_id" label="预设渠道配置 (可选)" extra="选择预设后，基础 URL 和 API Key 会在实际请求时被预设接管（预设和各类卡池互斥，只能选其一）">
                      <Select placeholder="选择预设配置" allowClear disabled={!!currentVolcPool || !!currentGptImagePool}>
                        {(presets || []).map(p => (
                          <Option key={p.id} value={p.id}>{p.name} [{p.provider_type}]</Option>
                        ))}
                      </Select>
                    </Form.Item>
                  </Col>
                  {activePlugins['volcengine_pool'] && (
                    <Col span={12}>
                      <Form.Item name="pool_id" label="火山引擎卡池 (可选)" extra="使用卡池内的账号进行请求分发和限额（预设和各类卡池互斥，只能选其一）">
                        <Select placeholder="选择卡池" allowClear disabled={!!currentPreset || !!currentGptImagePool}>
                          {(volcenginePools || []).map(p => (
                            <Option key={p.id} value={p.id}>{p.name} [{p.strategy === 'random' ? '随机' : '顺序'}]</Option>
                          ))}
                        </Select>
                      </Form.Item>
                    </Col>
                  )}
                  {activePlugins['gptimage_pool'] && (
                    <Col span={12}>
                      <Form.Item name="gptimage_pool_id" label="GPT Image卡池 (可选)" extra="使用卡池内的账号进行请求分发和限额（预设和各类卡池互斥，只能选其一）">
                        <Select placeholder="选择卡池" allowClear disabled={!!currentPreset || !!currentVolcPool}>
                          {(gptImagePools || []).map(p => (
                            <Option key={p.id} value={p.id}>{p.name} [{p.strategy === 'random' ? '随机' : '顺序'}]</Option>
                          ))}
                        </Select>
                      </Form.Item>
                    </Col>
                  )}
                </Row>
              );
            }}
          </Form.Item>


          <Form.Item shouldUpdate={(prev, curr) => prev.models !== curr.models} noStyle>
            {() => {
              const selectedMids: string[] = form.getFieldValue('models') || [];
              const selectedModelIds = selectedMids.map(mid => {
                const m = availableModels.find(m => m.mid === mid);
                return m ? m.model_id : mid;
              });

              return (
                <Form.Item name="models" label={t('channels.models')} rules={[{ required: true }]}>
                  <Select mode="multiple" placeholder="选择模型" showSearch
                    filterOption={(input, option) => {
                      const label = String((option as any)?.children ?? '');
                      return label.toLowerCase().includes(input.toLowerCase());
                    }}>
                    {availableModels.map((m) => {
                      // 同一渠道内 model_id 必须唯一：如果该 model_id 已被另一个 mid 选中，则禁用
                      const isModelIdSelected = selectedModelIds.includes(m.model_id);
                      const isCurrentMidSelected = selectedMids.includes(m.mid);
                      const isDisabled = isModelIdSelected && !isCurrentMidSelected;
                      return (
                        <Option key={m.mid} value={m.mid} disabled={isDisabled}>
                          {m.name} ({m.model_id}) [MID:{m.mid}]
                        </Option>
                      );
                    })}
                  </Select>
                </Form.Item>
              );
            }}
          </Form.Item>

          <Form.Item shouldUpdate={(prev, curr) => prev.models !== curr.models} noStyle>
            {() => {
              const selectedModels = form.getFieldValue('models') || [];
              if (selectedModels.length === 0) return null;
              return (
                <div style={{ marginBottom: 24, padding: 16, background: _isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)', borderRadius: 8, border: _isLight ? '1px solid rgba(0,0,0,0.1)' : '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showMapping ? 12 : 0 }}>
                    <div>
                      <Text strong style={{ display: 'block', marginBottom: 2 }}>模型别名映射 (Model Mapping)</Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>开启后可为每个模型指定上游别名</Text>
                    </div>
                    <Switch checked={showMapping} onChange={setShowMapping} size="small" />
                  </div>
                  {showMapping && selectedModels.map((midOrId: string) => {
                    const match = availableModels.find(m => m.mid === midOrId);
                    const actualModelId = match ? match.model_id : midOrId;
                    const displayLabel = match ? `${actualModelId} [MID:${midOrId}]` : actualModelId;
                    return (
                      <Form.Item
                        key={midOrId}
                        label={displayLabel}
                        name={['model_mapping', actualModelId]}
                        style={{ marginBottom: 12 }}
                        labelCol={{ span: 8 }}
                        wrapperCol={{ span: 16 }}
                      >
                        <Input placeholder={`默认为原名：${actualModelId}`} />
                      </Form.Item>
                    );
                  })}
                </div>
              );
            }}
          </Form.Item>


          <Form.Item label={
            <Space>
              <span>{isExcludeMode ? '不支持的用户等级' : '支持用户等级'}</span>
              <Switch
                size="small"
                checked={isExcludeMode}
                onChange={(checked) => setIsExcludeMode(checked)}
                checkedChildren="排除"
                unCheckedChildren="允许"
              />
            </Space>
          } extra={isExcludeMode ? '当前为排除模式：选中的等级将不允许使用该渠道，其余等级均可使用。' : '当前为允许模式：不选则允许所有等级，选中的等级才可以使用该渠道。'}>
            <Form.Item name="level_select" noStyle>
              <Select mode="multiple" placeholder={isExcludeMode ? '选择要排除的用户等级' : '选择开放该渠道的特定 VIP 等级（留空允许所有）'} allowClear>
                {availableUserLevels.map((l) => (
                  <Option key={l.id.toString()} value={l.id.toString()}>{l.name} (ULID: {l.id.toString().padStart(4, '0')})</Option>
                ))}
              </Select>
            </Form.Item>
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="priority" label={t('channels.priority')} initialValue={0} extra="数字越大优先级越高。系统优先调用高优先级渠道，仅当其不可用时才会降级到低优先级。">
                <InputNumber style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="weight" label={t('channels.weight')} initialValue={1} extra="优先级相同的渠道，将根据权重比例分配流量。例如权重为 2 和 1，则请求会按 2:1 的概率分发。">
                <InputNumber style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="quota_limit" label="使用额度" initialValue={-1} extra="-1 表示无限额度">
                <InputNumber 
                  min={-1} 
                  style={{ width: '100%' }} 
                  formatter={(val) => (val === -1 || val === '-1') ? '无限额' : `${val}`}
                  parser={(val) => (val === '无限额' ? -1 : parseFloat(val as string) || 0) as -1}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
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
