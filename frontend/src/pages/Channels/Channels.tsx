import React, { useEffect, useState } from 'react';
import { Table, Button, Space, Tag, Modal, Form, Input, InputNumber, message, Popconfirm, Card, Typography, Select, Row, Col, Switch, Grid, Segmented } from 'antd';
import MobileCardList, { MobileCard, CardRow, CardActions } from '../../components/MobileCardList';
import { PlusOutlined, EditOutlined, DeleteOutlined, SyncOutlined, ArrowLeftOutlined, ArrowRightOutlined } from '@ant-design/icons';
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
  const [activeRightPanel, setActiveRightPanel] = useState<'models' | 'levels' | 'mapping' | 'presets'>('models');
  const [modelSearch, setModelSearch] = useState('');

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
      matchSearch = !!((c.name && c.name.toLowerCase().includes(q)) || 
                    (c.group_aid && c.group_aid.toLowerCase().includes(q)));
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
    setActiveRightPanel('models');
    setModelSearch('');
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
    setActiveRightPanel('models');
    setModelSearch('');
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
    // 处理 config
    const configObj = editingChannel && editingChannel.config ? 
        (typeof editingChannel.config === 'string' ? JSON.parse(editingChannel.config) : editingChannel.config) 
        : {};

    const data = {
      ...values,
      models: values.models || [],
      provider_type: values.provider_type || 'custom',
      model_mapping: finalMapping,
      user_groups: isExcludeMode ? [] : selectedLevels,
      exclude_user_groups: isExcludeMode ? selectedLevels : [],
      config: configObj,
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
      {!isModalVisible ? (
        <>
          <div style={{ display: 'flex', flexDirection: screens.xs ? 'column' : 'row', justifyContent: 'space-between', marginBottom: 24, gap: 12 }}>
            <Title level={screens.xs ? 4 : 2} style={{ margin: 0 }}>{t('channels.title')}</Title>
            <Space wrap>
              <Segmented
                options={[
                  { label: '全部', value: 'all' },
                  { label: '激活', value: '1' },
                  { label: '已禁用', value: '0' },
                ]}
                value={statusFilter === 'all' ? 'all' : statusFilter.toString()}
                onChange={(val) => setStatusFilter(val === 'all' ? 'all' : parseInt(val as string, 10))}
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
        </>
      ) : (
        <div style={{ animation: 'fadeIn 0.3s' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24, gap: 16 }}>
            <Button icon={<ArrowLeftOutlined />} onClick={() => setIsModalVisible(false)}>返回</Button>
            <Title level={3} style={{ margin: 0 }}>
              {editingChannel ? t('channels.edit_channel') : t('channels.add_channel')}
            </Title>
          </div>
          <div style={{ maxWidth: 1200, width: '100%' }}>
            <Form form={form} layout="vertical" onFinish={handleSave}>
              <Row gutter={24}>
                {/* 左侧基本配置栏 */}
                <Col xs={24} md={10} xl={10}>
                  <div style={{ padding: 16, background: _isLight ? '#f9fafb' : 'rgba(255,255,255,0.04)', borderRadius: 8, height: '100%', position: 'sticky', top: 24 }}>
                    <Form.Item name="name" label={<Text strong>{t('channels.name')}</Text>} rules={[{ required: true }]}>
                      <Input placeholder="e.g. OpenAI Primary" />
                    </Form.Item>

                    <Form.Item shouldUpdate={(prev, curr) => prev.preset_id !== curr.preset_id || prev.pool_id !== curr.pool_id || prev.gptimage_pool_id !== curr.gptimage_pool_id} noStyle>
                      {() => {
                        const currentPreset = form.getFieldValue('preset_id');
                        const currentVolcPool = form.getFieldValue('pool_id');
                        const currentGptImagePool = form.getFieldValue('gptimage_pool_id');

                        return (
                          <div style={{ marginBottom: 24, padding: 12, borderRadius: 8, background: _isLight ? '#fff' : 'rgba(255,255,255,0.02)', border: _isLight ? '1px solid #e5e4e7' : '1px solid rgba(255,255,255,0.05)' }}>
                            <Text strong style={{ display: 'block', marginBottom: 12 }}>预设与卡池配置 (互斥)</Text>
                            <Space direction="vertical" size={12} style={{ width: '100%' }}>
                              <Form.Item name="preset_id" style={{ marginBottom: 0 }}>
                                <Select placeholder="选择预设渠道配置" allowClear disabled={!!currentVolcPool || !!currentGptImagePool}>
                                  {(presets || []).map(p => (
                                    <Option key={p.id} value={p.id}>{p.name} [ID: {p.id}] [{p.provider_type}]</Option>
                                  ))}
                                </Select>
                              </Form.Item>

                              {activePlugins['volcengine_pool'] && (
                                <Form.Item name="pool_id" style={{ marginBottom: 0 }}>
                                  <Select placeholder="选择火山引擎卡池" allowClear disabled={!!currentPreset || !!currentGptImagePool}>
                                    {(volcenginePools || []).map(p => (
                                      <Option key={p.id} value={p.id}>{p.name} [{p.strategy === 'random' ? '随机' : '顺序'}]</Option>
                                    ))}
                                  </Select>
                                </Form.Item>
                              )}

                              {activePlugins['gptimage_pool'] && (
                                <Form.Item name="gptimage_pool_id" style={{ marginBottom: 0 }}>
                                  <Select placeholder="选择 GPT Image 卡池" allowClear disabled={!!currentPreset || !!currentVolcPool}>
                                    {(gptImagePools || []).map(p => (
                                      <Option key={p.id} value={p.id}>{p.name} [{p.strategy === 'random' ? '随机' : '顺序'}]</Option>
                                    ))}
                                  </Select>
                                </Form.Item>
                              )}
                            </Space>
                          </div>
                        );
                      }}
                    </Form.Item>

                    <Form.Item label={<Text strong>路由与范围配置</Text>} style={{ marginBottom: 0 }}>
                      <Space direction="vertical" style={{ width: '100%' }} size={12}>
                        {/* Models */}
                        <Form.Item shouldUpdate={(prev, curr) => prev.models !== curr.models} noStyle>
                          {() => {
                            const m = form.getFieldValue('models') || [];
                            const isActive = activeRightPanel === 'models';
                            return (
                              <div onClick={() => setActiveRightPanel('models')} style={{ padding: '12px 16px', borderRadius: 8, border: isActive ? '1px solid var(--text)' : (_isLight ? '1px solid #e5e4e7' : '1px solid rgba(255,255,255,0.08)'), background: isActive ? (_isLight ? '#f9fafb' : 'rgba(255,255,255,0.04)') : (_isLight ? '#fff' : 'rgba(255,255,255,0.02)'), cursor: 'pointer', transition: 'all 0.2s' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: m.length > 0 ? 8 : 0 }}>
                                  <Text strong={isActive} style={{ color: isActive ? 'var(--text)' : 'inherit' }}>选择模型</Text>
                                  <span style={{ fontSize: 12, color: isActive ? 'var(--text)' : 'var(--text-secondary)' }}>已选 {m.length} 个 <ArrowRightOutlined style={{ marginLeft: 4 }} /></span>
                                </div>
                                {m.length > 0 && (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {m.slice(0, 8).map((mid: string) => {
                                      const match = availableModels.find(model => model.mid === mid);
                                      return (
                                        <div key={mid} style={{ padding: '6px 8px', background: _isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)', borderRadius: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                          <span style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 8 }}>{match ? match.name : '未知模型'}</span>
                                          <span style={{ fontSize: 11, color: 'var(--text-secondary)', flexShrink: 0 }}>MID: {match ? match.mid : mid}</span>
                                        </div>
                                      );
                                    })}
                                    {m.length > 8 && <div style={{ fontSize: 11, color: 'var(--text-secondary)', textAlign: 'center', marginTop: 2 }}>...还有 {m.length - 8} 个</div>}
                                  </div>
                                )}
                              </div>
                            );
                          }}
                        </Form.Item>

                        {/* User Levels */}
                        <Form.Item shouldUpdate={(prev, curr) => prev.level_select !== curr.level_select} noStyle>
                          {() => {
                            const levels = form.getFieldValue('level_select') || [];
                            const isActive = activeRightPanel === 'levels';
                            return (
                              <div onClick={() => setActiveRightPanel('levels')} style={{ padding: '12px 16px', borderRadius: 8, border: isActive ? '1px solid var(--text)' : (_isLight ? '1px solid #e5e4e7' : '1px solid rgba(255,255,255,0.08)'), background: isActive ? (_isLight ? '#f9fafb' : 'rgba(255,255,255,0.04)') : (_isLight ? '#fff' : 'rgba(255,255,255,0.02)'), cursor: 'pointer', transition: 'all 0.2s' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: levels.length > 0 ? 8 : 0 }}>
                                  <Text strong={isActive} style={{ color: isActive ? 'var(--text)' : 'inherit' }}>支持用户等级</Text>
                                  <span style={{ fontSize: 12, color: isActive ? 'var(--text)' : 'var(--text-secondary)' }}>
                                    <Tag style={{ marginRight: 4, border: 'none', background: _isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.1)', color: 'var(--text)' }}>{isExcludeMode ? '排除模式' : '允许模式'}</Tag>
                                    <ArrowRightOutlined />
                                  </span>
                                </div>
                                {levels.length > 0 ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {levels.slice(0, 8).map((idStr: string) => {
                                      const lv = availableUserLevels.find((l: any) => l.id.toString() === idStr || l.group_key === idStr);
                                      return (
                                        <div key={idStr} style={{ padding: '6px 8px', background: _isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)', borderRadius: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                          <span style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 8 }}>{lv ? lv.name : '未知等级'}</span>
                                          <span style={{ fontSize: 11, color: 'var(--text-secondary)', flexShrink: 0 }}>ULID: {idStr.padStart(4, '0')}</span>
                                        </div>
                                      );
                                    })}
                                    {levels.length > 8 && <div style={{ fontSize: 11, color: 'var(--text-secondary)', textAlign: 'center', marginTop: 2 }}>...还有 {levels.length - 8} 个</div>}
                                  </div>
                                ) : (
                                  <Text type="secondary" style={{ fontSize: 12 }}>{isExcludeMode ? '未排除任何等级 (全部允许)' : '未选择等级 (全部允许)'}</Text>
                                )}
                              </div>
                            );
                          }}
                        </Form.Item>

                        {/* Model Mapping */}
                        <div onClick={() => setActiveRightPanel('mapping')} style={{ padding: '12px 16px', borderRadius: 8, border: activeRightPanel === 'mapping' ? '1px solid var(--text)' : (_isLight ? '1px solid #e5e4e7' : '1px solid rgba(255,255,255,0.08)'), background: activeRightPanel === 'mapping' ? (_isLight ? '#f9fafb' : 'rgba(255,255,255,0.04)') : (_isLight ? '#fff' : 'rgba(255,255,255,0.02)'), cursor: 'pointer', transition: 'all 0.2s' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text strong={activeRightPanel === 'mapping'} style={{ color: activeRightPanel === 'mapping' ? 'var(--text)' : 'inherit' }}>模型别名映射</Text>
                            <span style={{ fontSize: 12, color: activeRightPanel === 'mapping' ? 'var(--text)' : 'var(--text-secondary)' }}>
                              {showMapping ? <span style={{ fontWeight: 500 }}>已开启</span> : <span>未开启</span>} <ArrowRightOutlined style={{ marginLeft: 4 }} />
                            </span>
                          </div>
                        </div>
                      </Space>
                    </Form.Item>

                    <div style={{ marginTop: 24 }}>
                      <Text strong style={{ display: 'block', marginBottom: 12 }}>调度策略</Text>
                      <Row gutter={12}>
                        <Col span={12}>
                          <Form.Item name="priority" label="优先级" initialValue={0}>
                            <InputNumber style={{ width: '100%' }} />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="weight" label="权重" initialValue={1}>
                            <InputNumber style={{ width: '100%' }} />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="quota_limit" label="使用额度" initialValue={-1}>
                            <InputNumber 
                              min={-1} 
                              style={{ width: '100%' }} 
                              formatter={(val) => (val === -1 || val === '-1') ? '无限额' : `${val}`}
                              parser={(val) => (val === '无限额' ? -1 : parseFloat(val as string) || 0) as -1}
                            />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="status" label="状态" initialValue={1}>
                            <Select>
                              <Option value={1}>{t('common.enabled')}</Option>
                              <Option value={0}>{t('common.disabled')}</Option>
                            </Select>
                          </Form.Item>
                        </Col>
                      </Row>
                    </div>
                  </div>
                </Col>

                {/* 右侧动态面板 */}
                <Col xs={24} md={14} xl={14}>
                  <div style={{ padding: 24, background: _isLight ? '#fff' : 'rgba(255,255,255,0.02)', border: _isLight ? '1px solid #e5e4e7' : '1px solid rgba(255,255,255,0.08)', borderRadius: 8, minHeight: 600 }}>
                    
                    {activeRightPanel === 'models' && (
                      <div style={{ animation: 'fadeIn 0.2s' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                          <Title level={4} style={{ margin: 0 }}>选择模型</Title>
                          <Space>
                            <Input.Search placeholder="搜索模型名称或ID" value={modelSearch} onChange={(e) => setModelSearch(e.target.value)} style={{ width: 200 }} allowClear />
                            <Form.Item shouldUpdate={(prev, curr) => prev.models !== curr.models} noStyle>
                              {() => {
                                const selected = form.getFieldValue('models') || [];
                                const allMids = availableModels.map(m => m.mid);
                                return (
                                  <>
                                    <Button onClick={() => form.setFieldsValue({ models: allMids })}>全选</Button>
                                    <Button onClick={() => form.setFieldsValue({ models: [] })} disabled={selected.length === 0}>
                                      清空
                                    </Button>
                                  </>
                                );
                              }}
                            </Form.Item>
                          </Space>
                        </div>
                        <Form.Item shouldUpdate={(prev, curr) => prev.models !== curr.models} noStyle>
                          {() => {
                            const selectedMids: string[] = form.getFieldValue('models') || [];
                            const selectedModelIds = selectedMids.map(mid => {
                              const m = availableModels.find(m => m.mid === mid);
                              return m ? m.model_id : mid;
                            });

                            const filteredModels = availableModels.filter(m => {
                              if (!modelSearch) return true;
                              const q = modelSearch.toLowerCase();
                              return m.name.toLowerCase().includes(q) || m.model_id.toLowerCase().includes(q) || m.mid.toLowerCase().includes(q);
                            });

                            return (
                              <>
                                <Form.Item name="models" rules={[{ required: true, message: '请选择至少一个模型' }]} style={{ marginBottom: 0 }}>
                                  {/* 隐藏真实的 Input，只用于触发表单验证规则 */}
                                  <Input style={{ display: 'none' }} />
                                </Form.Item>
                                <div style={{ maxHeight: 600, overflowY: 'auto', paddingRight: 8, marginTop: 12 }}>
                                  <Row gutter={[12, 12]}>
                                    {filteredModels.map((m) => {
                                      const isModelIdSelected = selectedModelIds.includes(m.model_id);
                                      const isCurrentMidSelected = selectedMids.includes(m.mid);
                                      const isDisabled = isModelIdSelected && !isCurrentMidSelected;
                                      return (
                                        <Col xs={24} sm={12} lg={12} key={m.mid}>
                                          <div 
                                            onClick={() => {
                                              if (isDisabled) return;
                                              const next = isCurrentMidSelected ? selectedMids.filter(id => id !== m.mid) : [...selectedMids, m.mid];
                                              form.setFieldsValue({ models: next });
                                            }}
                                            style={{
                                              padding: '8px 12px',
                                              borderRadius: 6,
                                              border: isCurrentMidSelected ? '1px solid var(--text)' : (_isLight ? '1px solid #e5e4e7' : '1px solid rgba(255,255,255,0.08)'),
                                              background: isCurrentMidSelected ? (_isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.08)') : 'transparent',
                                              cursor: isDisabled ? 'not-allowed' : 'pointer',
                                              opacity: isDisabled ? 0.5 : 1,
                                              display: 'flex',
                                              alignItems: 'center',
                                              gap: 8,
                                              transition: 'all 0.2s'
                                            }}
                                          >
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                              <div style={{ fontWeight: 500, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</div>
                                              <div style={{ fontSize: 12, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.model_id}</div>
                                              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>MID: {m.mid}</div>
                                            </div>
                                          </div>
                                        </Col>
                                      );
                                    })}
                                  </Row>
                                </div>
                              </>
                            );
                          }}
                        </Form.Item>
                      </div>
                    )}

                    {activeRightPanel === 'levels' && (
                      <div style={{ animation: 'fadeIn 0.2s' }}>
                        <Title level={4} style={{ marginBottom: 24 }}>支持用户等级</Title>
                        <div style={{ marginBottom: 24, padding: 16, background: _isLight ? '#f9fafb' : 'rgba(255,255,255,0.04)', borderRadius: 8 }}>
                          <Space size={16} align="center">
                            <span>访问控制模式：</span>
                            <Segmented
                              options={['允许模式', '排除模式']}
                              value={isExcludeMode ? '排除模式' : '允许模式'}
                              onChange={(val) => setIsExcludeMode(val === '排除模式')}
                            />
                            <Text type="secondary" style={{ fontSize: 13 }}>
                              {isExcludeMode ? '选中排除的等级将【不可】使用该渠道' : '选中允许的等级才【可以】使用该渠道'}
                            </Text>
                          </Space>
                        </div>
                        
                        <Form.Item name="level_select">
                          <Input style={{ display: 'none' }} />
                        </Form.Item>
                        
                        <Form.Item shouldUpdate={(prev, curr) => prev.level_select !== curr.level_select} noStyle>
                          {() => {
                            const selectedLevels = form.getFieldValue('level_select') || [];
                            return (
                              <Row gutter={[16, 16]}>
                                {availableUserLevels.map((l) => {
                                  const idStr = l.id.toString();
                                  const isSelected = selectedLevels.includes(idStr);
                                  return (
                                    <Col xs={24} sm={12} key={idStr}>
                                      <div 
                                        onClick={() => {
                                          const next = isSelected ? selectedLevels.filter((id: string) => id !== idStr) : [...selectedLevels, idStr];
                                          form.setFieldsValue({ level_select: next });
                                        }}
                                        style={{
                                          padding: '12px 16px',
                                          borderRadius: 8,
                                          border: isSelected ? '1px solid var(--text)' : (_isLight ? '1px solid #e5e4e7' : '1px solid rgba(255,255,255,0.08)'),
                                          background: isSelected ? (_isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.08)') : 'transparent',
                                          cursor: 'pointer',
                                          display: 'flex',
                                          justifyContent: 'space-between',
                                          alignItems: 'center',
                                          transition: 'all 0.2s'
                                        }}
                                      >
                                        <Space direction="vertical" size={2}>
                                          <Text strong style={{ color: isSelected ? 'var(--text)' : undefined }}>{l.name}</Text>
                                          <Text type="secondary" style={{ fontSize: 12 }}>ULID: {idStr.padStart(4, '0')} | {l.group_key}</Text>
                                        </Space>
                                      </div>
                                    </Col>
                                  );
                                })}
                              </Row>
                            );
                          }}
                        </Form.Item>
                      </div>
                    )}

                    {activeRightPanel === 'mapping' && (
                      <div style={{ animation: 'fadeIn 0.2s' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                          <Title level={4} style={{ margin: 0 }}>模型别名映射</Title>
                          <Switch checked={showMapping} onChange={setShowMapping} checkedChildren="已开启" unCheckedChildren="未开启" />
                        </div>
                        <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>开启后可为每个模型指定上游别名，解决上下游模型名称不一致的问题。</Text>
                        
                        {showMapping ? (
                          <Form.Item shouldUpdate={(prev, curr) => prev.models !== curr.models} noStyle>
                            {() => {
                              const selectedModels = form.getFieldValue('models') || [];
                              if (selectedModels.length === 0) {
                                return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text)', background: _isLight ? '#f9fafb' : 'rgba(255,255,255,0.04)', borderRadius: 8 }}>请先在左侧选择模型</div>;
                              }
                              return (
                                <div style={{ maxHeight: 450, overflowY: 'auto', paddingRight: 12 }}>
                                  <Row gutter={16}>
                                    {selectedModels.map((midOrId: string) => {
                                      const match = availableModels.find(m => m.mid === midOrId);
                                      const actualModelId = match ? match.model_id : midOrId;
                                      return (
                                        <Col span={24} key={midOrId}>
                                          <Form.Item
                                            label={`${match?.name || actualModelId} [MID:${midOrId}]`}
                                            name={['model_mapping', actualModelId]}
                                            labelCol={{ span: 8 }}
                                            wrapperCol={{ span: 16 }}
                                            style={{ marginBottom: 16 }}
                                          >
                                            <Input placeholder={`默认为原名：${actualModelId}`} />
                                          </Form.Item>
                                        </Col>
                                      );
                                    })}
                                  </Row>
                                </div>
                              );
                            }}
                          </Form.Item>
                        ) : (
                          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text)', background: _isLight ? '#f9fafb' : 'rgba(255,255,255,0.04)', borderRadius: 8 }}>别名映射功能已关闭</div>
                        )}
                      </div>
                    )}
                  </div>
                </Col>
              </Row>

              <div style={{ marginTop: 24, paddingTop: 24, borderTop: _isLight ? '1px solid #e5e4e7' : '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <Button size="large" onClick={() => setIsModalVisible(false)}>取消</Button>
                <Button size="large" type="primary" htmlType="submit" loading={submitting} style={{ minWidth: 120 }}>保存设置</Button>
              </div>
            </Form>
          </div>
        </div>
      )}

    </Card>
  );
};

export default Channels;
