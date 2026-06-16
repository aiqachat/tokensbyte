import React, { useEffect, useRef, useState } from 'react';
import ModelSelector from '../../components/ModelSelector';
import { Table, Button, Space, Tag, Modal, Form, Input, InputNumber, message, Popconfirm, Card, Typography, Select, Row, Col, Switch, Grid, Segmented, Tooltip, Divider, Alert, List, Progress, Drawer, Checkbox } from 'antd';
import MobileCardList, { MobileCard, CardRow, CardActions } from '../../components/MobileCardList';
import { PlusOutlined, EditOutlined, DeleteOutlined, SyncOutlined, ArrowLeftOutlined, ArrowRightOutlined, CloseOutlined, RocketOutlined, UnorderedListOutlined, AppstoreOutlined, PlayCircleOutlined, SearchOutlined, ApartmentOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import request from '../../utils/request';
import useSettingsStore from '../../store/settings';
import type { Channel } from '../../types';
import { useThemeStore } from '../../store/theme';

// ── 插件动态加载（各插件均可独立移除，删除对应目录后自动降级，不影响主功能） ──
type HHPluginModule = typeof import('../Plugins/HappyHorse/HappyHorseChannelPlugin');


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
  const [viewMode, setViewMode] = useState<'list' | 'card'>(() => {
    return (localStorage.getItem('channels_view_mode') as 'list' | 'card') || 'card';
  });
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
  const [activeMappingInputs, setActiveMappingInputs] = useState<string[]>([]);
  const [modelMappingState, setModelMappingState] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const screens = useBreakpoint();
  const [isExcludeMode, setIsExcludeMode] = useState(false);
  const [activeRightPanel, setActiveRightPanel] = useState<'models' | 'levels' | 'mapping' | 'presets'>('models');
  const [presetSearchText, setPresetSearchText] = useState('');
  const [upstreamTab, setUpstreamTab] = useState<'preset' | 'volc' | 'gptimage'>('preset');
  /** 模型选择的桥接状态，同步 form store 与 ModelSelector 双向数据 */
  const [channelModelMids, setChannelModelMids] = useState<string[]>([]);
  const [selectedSubChannelAids, setSelectedSubChannelAids] = useState<any[]>([]);
  const [haMaxRetries, setHaMaxRetries] = useState<number>(3);

  // useRef to hold reliable copies of models/levels outside AntD form store
  // (form store gets corrupted when model_mapping Form.Items are registered)
  const modelsRef = useRef<string[]>([]);
  const levelsRef = useRef<string[]>([]);
  // Plugin: happyhorse_router 状态（插件可移除，移除后这些状态保持默认值，所有条件渲染自动跳过）
  const [isHappyHorseRouting, setIsHappyHorseRouting] = useState<boolean>(false);
  const [happyHorseConfigs, setHappyHorseConfigs] = useState<any[]>([]);
  const [selectedRoutingNode, setSelectedRoutingNode] = useState<string | null>(null);
  const [happyHorseEnabled, setHappyHorseEnabled] = useState<boolean>(false);
  const [hhModule, setHhModule] = useState<HHPluginModule | null>(null);

  const [statusFilter, setStatusFilter] = useState<number | 'all'>(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [configObj, setConfigObj] = useState<Record<string, any>>({});

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

  const fetchHaMaxRetries = async () => {
    try {
      const res = await (request.get('/plugins/high_availability_channel/ha-config') as Promise<any>);
      if (res && res.ha_max_retries) {
        setHaMaxRetries(res.ha_max_retries);
      }
    } catch (e) {
      console.error('加载高可用插件配置失败:', e);
    }
  };

  const fetchPresets = async () => {
    try {
      const resp = await (request.get('/channel-configs') as unknown as Promise<{ data: any[] }>);
      const data = resp.data || [];
      const haPreset = {
        id: -99,
        name: '高可用虚拟渠道组',
        provider_type: 'high_availability_group',
        yid: 'HA',
        rate: 1.0,
      };
      setPresets([haPreset, ...data]);
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
          // Plugin: happyhorse_router 数据加载（插件可移除）
          if (p.name === 'happyhorse_router') {
            setHappyHorseEnabled(true);
            request.get('/plugins/happyhorse_router/configs').then((r: any) => {
              const data = r?.data ?? r;
              const list = data?.configs ?? [];
              setHappyHorseConfigs(list);
            }).catch(() => {});
            // 动态加载插件 UI 模块
            import('../Plugins/HappyHorse/HappyHorseChannelPlugin')
              .then(mod => setHhModule(mod))
              .catch(() => {});
          }
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
    fetchHaMaxRetries();
  }, []);

  const handleAdd = () => {
    setEditingChannel(null);
    form.resetFields();
    setShowMapping(false);
    setActiveMappingInputs([]);
    setModelMappingState({});
    setIsExcludeMode(false);
    setChannelModelMids([]);
    setActiveRightPanel('models');
    setPresetSearchText('');
    setUpstreamTab('preset');
    setConfigObj({});
    setSelectedSubChannelAids([]);
    modelsRef.current = [];
    levelsRef.current = [];
    setIsHappyHorseRouting(false);
    setSelectedRoutingNode(null);
    setIsModalVisible(true);
  };

  const handleEdit = (record: Channel) => {
    setEditingChannel(record);
    let mapping: Record<string, string> = {};
    try {
      mapping = typeof record.model_mapping === 'string' ? JSON.parse(record.model_mapping) : (record.model_mapping || {});
    } catch (e) {}

    // models 兼容处理：新格式存 mid，旧格式存 model_id，需要统一转为 mid
    const rawModels = Array.isArray(record.models) ? record.models : [];
    const modelsForForm = rawModels.map((val: string) => {
      if (availableModels.find(m => m.mid === val)) return val;
      const match = availableModels.find(m => m.model_id === val);
      return match ? match.mid : val;
    });

    const levelIds = (record.exclude_user_groups && record.exclude_user_groups.length > 0)
      ? record.exclude_user_groups
      : (record.user_groups || []);

    // Sync refs (reliable source of truth for save)
    modelsRef.current = modelsForForm;
    levelsRef.current = levelIds;
    setChannelModelMids(modelsForForm);

    const hasHappyHorse = rawModels.some((m: string) => m.startsWith('ephh-'));
    setIsHappyHorseRouting(hasHappyHorse);
    if (hasHappyHorse) {
      const node = rawModels.find((m: string) => m.startsWith('ephh-')) || '';
      setSelectedRoutingNode(node);
    } else {
      setSelectedRoutingNode(null);
    }

    const hasMapping = Object.values(mapping).some(v => v && String(v).trim());
    setShowMapping(hasMapping);
    setModelMappingState(mapping);
    setActiveMappingInputs(Object.keys(mapping).filter(k => mapping[k] && String(mapping[k]).trim()));
    setIsExcludeMode(!!record.exclude_user_groups && record.exclude_user_groups.length > 0);
    setActiveRightPanel('models');
    setPresetSearchText('');
    if (record.preset_id) {
      setUpstreamTab('preset');
    } else if ((record as any).pool_id) {
      setUpstreamTab('volc');
    } else if ((record as any).gptimage_pool_id) {
      setUpstreamTab('gptimage');
    } else {
      setUpstreamTab('preset');
    }


    // 解析 config JSON 初始化存储设置状态
    let parsedConfig: Record<string, any> = {};
    try {
      parsedConfig = record.config
        ? (typeof record.config === 'string' ? JSON.parse(record.config) : record.config)
        : {};
    } catch { parsedConfig = {}; }
    setConfigObj(parsedConfig);
    const subAids = parsedConfig.sub_channels || [];
    setSelectedSubChannelAids(subAids);

    form.setFieldsValue({
      name: record.name,
      provider_type: record.provider_type || 'custom',
      base_url: record.base_url,
      api_key: (record as any).api_key || '',
      sort_order: record.sort_order || 0,
      priority: record.priority || 0,
      status: record.status ?? 1,
      weight: record.weight || 1,
      rate: record.rate ?? 1.0,
      max_rps: (record as any).max_rps || 0,
      quota_limit: record.quota_limit ?? -1,
      quota_used: record.quota_used || 0,
      preset_id: record.preset_id || null,
      pool_id: (record as any).pool_id || null,
      gptimage_pool_id: (record as any).gptimage_pool_id || null,
      model_mapping: mapping,
      models: modelsForForm,
      level_select: levelIds,
    });

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

  const handleToggleStatus = async (record: Channel) => {
    try {
      const newStatus = record.status === 1 ? 0 : 1;
      await request.put(`/channels/${record.id}`, { status: newStatus });
      setChannels(prev => prev.map(c => c.id === record.id ? { ...c, status: newStatus } : c));
      message.success(newStatus === 1 ? '已启用渠道' : '已禁用渠道');
    } catch (e) {
      console.error(e);
      message.error('状态更新失败');
    }
  };

  const handleTest = (record: Channel) => {
    navigate(`/admin0755/channels/test/${record.id}`);
  };

  const handleModelsChange = (nextModels: string[]) => {
    form.setFieldsValue({ models: nextModels });
    modelsRef.current = nextModels;
    setChannelModelMids(nextModels);

    const currentMapping = modelMappingState;
    const validModelIds = new Set(nextModels.map(mid => {
      const match = availableModels.find(m => m.mid === mid);
      return match ? match.model_id : mid;
    }));

    let mappingChanged = false;
    const newMapping = { ...currentMapping };
    for (const key of Object.keys(newMapping)) {
      if (!validModelIds.has(key)) {
        delete newMapping[key];
        mappingChanged = true;
      }
    }

    if (mappingChanged) {
      setModelMappingState(newMapping);
      form.setFieldsValue({ model_mapping: newMapping });
      setActiveMappingInputs(prev => prev.filter(id => validModelIds.has(id)));
    }
  };

  const handleSave = async (values: any) => {
    if (submitting) return;
    setSubmitting(true);
    const finalMapping: Record<string, string> = {};
    const currentModelMapping = modelMappingState;
    if (showMapping && currentModelMapping) {
      for (const [k, v] of Object.entries(currentModelMapping)) {
        if (v && String(v).trim()) {
          finalMapping[k] = String(v).trim();
        }
      }
    }


    // Read models and levels from refs (immune to form store corruption)
    const reliableModels = modelsRef.current;
    const reliableLevels = levelsRef.current;

    if (reliableModels.length === 0) {
      message.error('请选择至少一个模型');
      setSubmitting(false);
      return;
    }

    const isHaGroup = values.provider_type === 'high_availability_group';
    if (isHaGroup && selectedSubChannelAids.length === 0) {
      message.error('高可用虚拟组必须至少绑定一个子渠道');
      setSubmitting(false);
      return;
    }

    if (!isHaGroup && !values.preset_id && !values.pool_id && !values.gptimage_pool_id) {
      message.error('请选择上游渠道（预设、火山引擎卡池或GPT Image卡池至少选其一）');
      setSubmitting(false);
      return;
    }

    // Ensure only one upstream is used and others are explicitly cleared
    let { preset_id, pool_id, gptimage_pool_id } = values;
    if (isHaGroup) {
      preset_id = null;
      pool_id = null;
      gptimage_pool_id = null;
    } else {
      if (preset_id) {
        pool_id = null;
        gptimage_pool_id = null;
      } else if (pool_id) {
        preset_id = null;
        gptimage_pool_id = null;
      } else if (gptimage_pool_id) {
        preset_id = null;
        pool_id = null;
      }
    }

    const finalConfig = isHaGroup 
      ? { ...configObj, sub_channels: selectedSubChannelAids }
      : configObj;

    const data = {
      ...values,
      models: reliableModels,
      provider_type: values.provider_type || 'custom',
      model_mapping: finalMapping,
      user_groups: isExcludeMode ? [] : reliableLevels,
      exclude_user_groups: isExcludeMode ? reliableLevels : [],
      config: finalConfig,
      sort_order: values.sort_order || 0,
      priority: values.priority || 0,
      rate: typeof values.rate === 'number' ? values.rate : 1.0,
      preset_id,
      pool_id,
      gptimage_pool_id,
    };
    delete data.level_select;
    data.models = reliableModels;

    try {
      if (editingChannel) {
        // 密钥未修改（与加载时原值相同）或为空时不提交，防止覆盖
        if (!data.api_key || data.api_key === (editingChannel as any).api_key) {
          delete data.api_key;
        }
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

  const handleUpdateSortOrder = async (id: number, sort_order: number) => {
    try {
      await request.put(`/channels/${id}`, { sort_order });
      // Update local state without full refresh for instant feedback
      setChannels(prev => prev.map(c => c.id === id ? { ...c, sort_order } : c));
      message.success('排序已更新');
    } catch (e) {
      console.error(e);
      message.error('排序更新失败');
    }
  };

  const columns = [
    {
      title: '渠道分组名称',
      key: 'name_and_aid',
      render: (_: any, record: Channel) => (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <Text strong style={{ fontSize: 14 }}>{record.name}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>AID: {record.group_aid || '-'}</Text>
        </div>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: number) => (
        <Space size={6} style={{ color: status === 1 ? '#52c41a' : '#ff4d4f' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: status === 1 ? '#52c41a' : '#ff4d4f' }} />
          <span style={{ fontSize: 13 }}>{status === 1 ? '启用' : '禁用'}</span>
        </Space>
      ),
    },
    {
      title: '支持等级',
      key: 'user_groups',
      render: (_: any, record: Channel) => {
        const groups = record.user_groups;
        const excludeGroups = record.exclude_user_groups;
        const resolveName = (idStr: string) => {
          const lv = availableUserLevels.find((l: any) => l.id.toString() === idStr || l.group_key === idStr);
          return lv ? lv.name : idStr;
        };
        if (excludeGroups && excludeGroups.length > 0) {
          return (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
              <Tag color="orange" style={{ borderRadius: 4, margin: 0, fontSize: 11 }}>排除模式</Tag>
              {excludeGroups.map((id: string) => (
                <Tag key={id} color="red" style={{ borderRadius: 4, margin: 0, fontSize: 11, opacity: 0.85 }}>{resolveName(id)}</Tag>
              ))}
            </div>
          );
        }
        if (!groups || groups.length === 0) {
          return <Tag color="green" style={{ borderRadius: 4, margin: 0, fontSize: 11 }}>全部等级</Tag>;
        }
        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {groups.map((id: string) => (
              <Tag key={id} color="blue" style={{ borderRadius: 4, margin: 0, fontSize: 11 }}>{resolveName(id)}</Tag>
            ))}
          </div>
        );
      },
    },
    {
      title: '消耗 / 额度',
      key: 'quota',
      render: (_: any, record: Channel) => {
        const used = record.quota_used || 0;
        const limit = record.quota_limit ?? -1;
        return (
          <Text type="secondary" style={{ fontSize: 13 }}>
            {currencySymbol}{used.toFixed(2)} / {limit < 0 ? '∞' : `${currencySymbol}${limit.toFixed(2)}`}
          </Text>
        );
      }
    },
    {
      title: '使用上游',
      key: 'upstream',
      render: (_: any, record: Channel) => {
        if (record.preset_id) {
          const preset = presets.find(p => p.id === record.preset_id);
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Tag color="cyan" style={{ borderRadius: 4, margin: 0, fontSize: 11, width: 'fit-content' }}>预设渠道</Tag>
              <Text strong style={{ fontSize: 13 }}>{preset ? preset.name : '未知预设'}</Text>
              <Text type="secondary" style={{ fontSize: 11 }}>
                {preset?.yid ? `YID: ${preset.yid}` : `ID: ${record.preset_id}`}
              </Text>
            </div>
          );
        }
        if (record.pool_id) {
          const pool = volcenginePools.find(p => p.id === record.pool_id);
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Tag color="purple" style={{ borderRadius: 4, margin: 0, fontSize: 11, width: 'fit-content' }}>火山卡池</Tag>
              <Text strong style={{ fontSize: 13 }}>{pool ? pool.name : '未知卡池'}</Text>
              <Text type="secondary" style={{ fontSize: 11 }}>ID: {record.pool_id}</Text>
            </div>
          );
        }
        if (record.gptimage_pool_id) {
          const pool = gptImagePools.find(p => p.id === record.gptimage_pool_id);
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Tag color="blue" style={{ borderRadius: 4, margin: 0, fontSize: 11, width: 'fit-content' }}>GPT Image卡池</Tag>
              <Text strong style={{ fontSize: 13 }}>{pool ? pool.name : '未知卡池'}</Text>
              <Text type="secondary" style={{ fontSize: 11 }}>ID: {record.gptimage_pool_id}</Text>
            </div>
          );
        }
        return <Text type="secondary">-</Text>;
      }
    },
    {
      title: '页面排序',
      dataIndex: 'sort_order',
      key: 'sort_order',
      sorter: (a: Channel, b: Channel) => (a.sort_order || 0) - (b.sort_order || 0),
      render: (sort_order: number) => <Text type="secondary" style={{ fontSize: 13 }}>{sort_order || 0}</Text>,
    },
    {
      title: '请求优先级',
      dataIndex: 'priority',
      key: 'priority',
      sorter: (a: Channel, b: Channel) => (a.priority || 0) - (b.priority || 0),
      render: (priority: number) => <Text type="secondary" style={{ fontSize: 13 }}>{priority || 0}</Text>,
    },
    {
      title: '倍率',
      dataIndex: 'rate',
      key: 'rate',
      sorter: (a: Channel, b: Channel) => (a.rate || 0.0) - (b.rate || 0.0),
      render: (rate: number) => <Text type="secondary" style={{ fontSize: 13 }}>{rate ?? 1.0}</Text>,
    },
    {
      title: '最后修改',
      dataIndex: 'updated_at',
      key: 'updated_at',
      sorter: (a: Channel, b: Channel) => {
        const ta = a.updated_at || a.created_at || '';
        const tb = b.updated_at || b.created_at || '';
        return ta.localeCompare(tb);
      },
      render: (t: string, record: Channel) => {
        const time = t || record.created_at;
        if (!time) return <Text type="secondary">-</Text>;
        const d = new Date(time);
        return <Text type="secondary" style={{ fontSize: 13 }}>{d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</Text>;
      },
    },
    {
      title: '操作',
      key: 'actions',
      align: 'center' as const,
      render: (_: unknown, record: Channel) => (
        <Space size={4} style={{ opacity: 0.8, justifyContent: 'center', width: '100%' }}>
          <Button 
            type="text" 
            size="small" 
            onClick={() => handleToggleStatus(record)} 
            style={{ fontSize: 13, color: record.status === 1 ? '#ff4d4f' : '#52c41a' }}
          >
            {record.status === 1 ? '禁用' : '启用'}
          </Button>
          <Button type="text" size="small" onClick={() => handleTest(record)} style={{ fontSize: 13 }}>测试</Button>
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          <Popconfirm title={t('common.confirm_delete')} onConfirm={() => handleDelete(record.id)}>
            <Button type="text" size="small" icon={<DeleteOutlined />} danger />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card variant="borderless">
      <style>{`
        .channel-card-disabled {
          opacity: 0.65;
          filter: grayscale(20%);
        }
      `}</style>
      {!isModalVisible ? (
        <>
          <div style={{ display: 'flex', flexDirection: screens.xs ? 'column' : 'row', justifyContent: 'space-between', marginBottom: 24, gap: 12 }}>
            <Title level={screens.xs ? 4 : 2} style={{ margin: 0 }}>{t('channels.title')}</Title>
            <Space wrap>
              <Segmented
                options={[
                  { label: `全部 (${channels.length})`, value: 'all' },
                  { label: `激活 (${channels.filter(c => c.status === 1).length})`, value: '1' },
                  { label: `已禁用 (${channels.filter(c => c.status === 0).length})`, value: '0' },
                ]}
                value={statusFilter === 'all' ? 'all' : statusFilter.toString()}
                onChange={(val) => setStatusFilter(val === 'all' ? 'all' : parseInt(val as string, 10))}
              />
              <Segmented
                options={[
                  { value: 'card', icon: <AppstoreOutlined /> },
                  { value: 'list', icon: <UnorderedListOutlined /> }
                ]}
                value={viewMode}
                onChange={(val) => {
                  setViewMode(val as 'list' | 'card');
                  localStorage.setItem('channels_view_mode', val as string);
                }}
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
              pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: ['10', '20', '50', '100'], showTotal: (total) => `共 ${total} 条` }}
              renderCard={(record: any) => {
                const used = record.quota_used || 0;
                const limit = record.quota_limit ?? -1;
                const groups = record.user_groups;
                const excludeGroups = record.exclude_user_groups;
                return (
                  <MobileCard
                    title={<Text strong>{record.name}</Text>}
                    extra={
                      <Space size={6} style={{ color: record.status === 1 ? '#52c41a' : '#ff4d4f' }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: record.status === 1 ? '#52c41a' : '#ff4d4f' }} />
                        <span style={{ fontSize: 12 }}>{record.status === 1 ? t('common.active') : t('common.disabled')}</span>
                      </Space>
                    }
                  >
                    {record.group_aid && <CardRow label="AID"><Text type="secondary">{record.group_aid}</Text></CardRow>}
                    <CardRow label="支持等级">
                      {excludeGroups && excludeGroups.length > 0 ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                          <Tag color="orange" style={{ borderRadius: 4, margin: 0, fontSize: 11 }}>排除</Tag>
                          {excludeGroups.map((id: string) => {
                            const lv = availableUserLevels.find((l: any) => l.id.toString() === id || l.group_key === id);
                            return <Tag key={id} color="red" style={{ borderRadius: 4, margin: 0, fontSize: 11, opacity: 0.85 }}>{lv ? lv.name : id}</Tag>;
                          })}
                        </div>
                      ) : (!groups || groups.length === 0) ? (
                        <Tag color="green" style={{ borderRadius: 4, margin: 0, fontSize: 11 }}>全部等级</Tag>
                      ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {groups.map((id: string) => {
                            const lv = availableUserLevels.find((l: any) => l.id.toString() === id || l.group_key === id);
                            return <Tag key={id} color="blue" style={{ borderRadius: 4, margin: 0, fontSize: 11 }}>{lv ? lv.name : id}</Tag>;
                          })}
                        </div>
                      )}
                    </CardRow>
                    <CardRow label="已用/额度">
                      <Text type="secondary">
                        {currencySymbol}{used.toFixed(2)} / {limit < 0 ? '∞' : `${currencySymbol}${limit.toFixed(2)}`}
                      </Text>
                    </CardRow>
                    <CardRow label="使用上游">
                      {record.preset_id ? (
                        (() => {
                          const preset = presets.find(p => p.id === record.preset_id);
                          return (
                            <Space size={4}>
                              <Tag color="cyan" style={{ borderRadius: 4, margin: 0, fontSize: 10 }}>预设</Tag>
                              <Text style={{ fontSize: 12 }}>
                                {preset?.name || '未知预设'} ({preset?.yid ? `YID: ${preset.yid}` : `ID: ${record.preset_id}`})
                              </Text>
                            </Space>
                          );
                        })()
                      ) : record.pool_id ? (
                        <Space size={4}>
                          <Tag color="purple" style={{ borderRadius: 4, margin: 0, fontSize: 10 }}>火山</Tag>
                          <Text style={{ fontSize: 12 }}>
                            {volcenginePools.find(p => p.id === record.pool_id)?.name || '未知卡池'} (ID: {record.pool_id})
                          </Text>
                        </Space>
                      ) : record.gptimage_pool_id ? (
                        <Space size={4}>
                          <Tag color="blue" style={{ borderRadius: 4, margin: 0, fontSize: 10 }}>GPT Image</Tag>
                          <Text style={{ fontSize: 12 }}>
                            {gptImagePools.find(p => p.id === record.gptimage_pool_id)?.name || '未知卡池'} (ID: {record.gptimage_pool_id})
                          </Text>
                        </Space>
                      ) : (
                        <Text type="secondary">-</Text>
                      )}
                    </CardRow>
                    <CardRow label="页面排序">
                      <Text type="secondary">{record.sort_order || 0}</Text>
                    </CardRow>
                    <CardRow label="请求优先级">
                      <Text type="secondary">{record.priority || 0}</Text>
                    </CardRow>
                    <CardRow label="倍率">
                      <Text type="secondary">{record.rate ?? 1.0}</Text>
                    </CardRow>
                    <CardRow label="最后修改">
                      <Text type="secondary" style={{ fontSize: 12 }}>{new Date(record.updated_at || record.created_at).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</Text>
                    </CardRow>
                    <CardActions>
                      <Button 
                        type="text" 
                        size="small" 
                        onClick={() => handleToggleStatus(record)} 
                        style={{ color: record.status === 1 ? '#ff4d4f' : '#52c41a' }}
                      >
                        {record.status === 1 ? '禁用' : '启用'}
                      </Button>
                      <Button type="text" size="small" onClick={() => handleTest(record)}>测试</Button>
                      <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
                      <Popconfirm title={t('common.confirm_delete')} onConfirm={() => handleDelete(record.id)}>
                        <Button type="text" size="small" icon={<DeleteOutlined />} danger />
                      </Popconfirm>
                    </CardActions>
                  </MobileCard>
                );
              }}
            />
          ) : viewMode === 'list' ? (
            <Table
              size="small"
              dataSource={filteredChannels}
              columns={columns}
              rowKey="id"
              loading={loading}
              pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: ['10', '20', '50', '100'], showTotal: (total) => `共 ${total} 条` }}
              scroll={{ x: 'max-content' }}
            />
          ) : (
            <List
              grid={{ gutter: 20, xs: 1, sm: 2, md: 3, lg: 4, xl: 4, xxl: 4 }}
              dataSource={filteredChannels}
              loading={loading}
              pagination={{
                pageSize: 12,
                showSizeChanger: true,
                pageSizeOptions: ['12', '24', '48', '96'],
                showTotal: (total) => `共 ${total} 个渠道`
              }}
              renderItem={(record: Channel) => {
                const used = record.quota_used || 0;
                const limit = record.quota_limit ?? -1;
                const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
                const progressColor = percent > 85 ? '#ff4d4f' : percent > 60 ? '#faad14' : '#52c41a';

                const groups = record.user_groups;
                const excludeGroups = record.exclude_user_groups;
                const resolveName = (idStr: string) => {
                  const lv = availableUserLevels.find((l: any) => l.id.toString() === idStr || l.group_key === idStr);
                  return lv ? lv.name : idStr;
                };

                return (
                  <List.Item style={{ height: '100%' }}>
                    <Card
                      className={record.status === 0 ? 'channel-card-disabled' : ''}
                      style={{
                        background: _isLight ? 'linear-gradient(180deg, #f5f5f5 0%, #ffffff 100%)' : 'linear-gradient(180deg, #121212 0%, #1e1e1e 100%)',
                        borderRadius: '8px',
                        border: _isLight ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(255,255,255,0.08)',
                        boxShadow: _isLight ? '0 2px 8px rgba(0,0,0,0.02)' : '0 2px 8px rgba(0,0,0,0.12)',
                        display: 'flex',
                        flexDirection: 'column',
                        height: '215px',
                      }}
                      styles={{ body: { padding: '12px 14px', display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' } }}
                    >
                      {/* 第 1 行：头部 */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: record.status === 1 ? (_isLight ? '#111827' : '#ffffff') : (_isLight ? '#d1d5db' : 'rgba(255,255,255,0.25)'), flexShrink: 0 }} />
                        <Text strong style={{ fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: _isLight ? '#111827' : '#ffffff' }}>
                          {record.name}
                        </Text>
                      </div>

                      {/* 第 2 行：上游与支持等级 */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', overflow: 'hidden', height: 24 }}>
                        {record.preset_id ? (
                          (() => {
                            const preset = presets.find(p => p.id === record.preset_id);
                            return (
                              <Tooltip title={preset ? `预设渠道: ${preset.name}` : '未知预设'}>
                                <Tag color="default" style={{ borderRadius: 4, margin: 0, padding: '0 6px', fontSize: 11 }}>
                                  预设
                                </Tag>
                              </Tooltip>
                            );
                          })()
                        ) : record.pool_id ? (
                          (() => {
                            const pool = volcenginePools.find(p => p.id === record.pool_id);
                            return (
                              <Tooltip title={pool ? `火山卡池: ${pool.name}` : '未知卡池'}>
                                <Tag color="default" style={{ borderRadius: 4, margin: 0, padding: '0 6px', fontSize: 11 }}>
                                  火山
                                </Tag>
                              </Tooltip>
                            );
                          })()
                        ) : record.gptimage_pool_id ? (
                          (() => {
                            const pool = gptImagePools.find(p => p.id === record.gptimage_pool_id);
                            return (
                              <Tooltip title={pool ? `GPT Image卡池: ${pool.name}` : '未知卡池'}>
                                <Tag color="default" style={{ borderRadius: 4, margin: 0, padding: '0 6px', fontSize: 11 }}>
                                  GPT
                                </Tag>
                              </Tooltip>
                            );
                          })()
                        ) : (
                          <Tag color="default" style={{ borderRadius: 4, margin: 0, padding: '0 6px', fontSize: 11 }}>无上游</Tag>
                        )}

                        <span style={{ color: _isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)' }}>|</span>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden' }}>
                          {excludeGroups && excludeGroups.length > 0 ? (
                            <>
                              <Tag color="orange" style={{ borderRadius: 4, margin: 0, padding: '0 6px', fontSize: 11 }}>排除</Tag>
                              <Tag color="red" style={{ borderRadius: 4, margin: 0, padding: '0 6px', fontSize: 11, maxWidth: 70, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.8 }}>
                                {resolveName(excludeGroups[0])}
                              </Tag>
                              {excludeGroups.length > 1 && <span style={{ fontSize: 10, opacity: 0.7 }}>+{excludeGroups.length - 1}</span>}
                            </>
                          ) : (!groups || groups.length === 0) ? (
                            <Tag color="green" style={{ borderRadius: 4, margin: 0, padding: '0 6px', fontSize: 11 }}>全部等级</Tag>
                          ) : (
                            <>
                              <Tag color="blue" style={{ borderRadius: 4, margin: 0, padding: '0 6px', fontSize: 11, maxWidth: 70, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {resolveName(groups[0])}
                              </Tag>
                              {groups.length > 1 && <span style={{ fontSize: 10, opacity: 0.7 }}>+{groups.length - 1}</span>}
                            </>
                          )}
                        </div>
                      </div>

                      {/* 第 3 行：排序、优先级、倍率 */}
                      <div style={{ display: 'flex', alignItems: 'center', fontSize: 12, color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)' }}>
                        <span>排序: {record.sort_order || 0}</span>
                        <span style={{ margin: '0 6px', opacity: 0.5 }}>·</span>
                        <span>优先级: {record.priority || 0}</span>
                        <span style={{ margin: '0 6px', opacity: 0.5 }}>·</span>
                        <span>倍率: {record.rate ?? 1.0}</span>
                      </div>

                      {/* 第 4 行：消耗/额度与进度条 */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
                          <span style={{ color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)' }}>消耗/额度</span>
                          <span style={{ fontWeight: 500, color: _isLight ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.85)' }}>
                            {currencySymbol}{used.toFixed(1)}/{limit < 0 ? '∞' : `${currencySymbol}${limit.toFixed(0)}`}
                          </span>
                        </div>
                        {limit > 0 ? (
                          <Progress
                            percent={percent}
                            strokeColor={_isLight ? '#111827' : '#ffffff'}
                            trailColor={_isLight ? '#f3f4f6' : 'rgba(255,255,255,0.08)'}
                            strokeWidth={4}
                            showInfo={false}
                            style={{ margin: 0 }}
                          />
                        ) : (
                          <div style={{ height: 4, borderRadius: 2, background: _isLight ? '#f3f4f6' : 'rgba(255,255,255,0.06)' }} />
                        )}
                      </div>

                      {/* 第 5 行：底栏按钮 */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: _isLight ? '1px solid #f0f0f0' : '1px solid rgba(255,255,255,0.06)', paddingTop: 6, marginTop: 2 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', maxWidth: '60%' }}>
                          {record.group_aid && (
                            <Text type="secondary" style={{ fontSize: 11, fontFamily: 'monospace', opacity: 0.8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {record.group_aid}
                            </Text>
                          )}
                          {record.group_aid && <span style={{ color: _isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)', fontSize: 9 }}>|</span>}
                          <Button
                            type="link"
                            size="small"
                            icon={<PlayCircleOutlined />}
                            onClick={() => handleTest(record)}
                            style={{ padding: 0, fontSize: 13, height: 20, display: 'flex', alignItems: 'center', flexShrink: 0, color: _isLight ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.85)' }}
                          >
                            测试
                          </Button>
                        </div>
                        <Space size={12}>
                          <Button
                            type="text"
                            size="small"
                            icon={<EditOutlined style={{ fontSize: 14 }} />}
                            onClick={() => handleEdit(record)}
                            style={{ padding: 0, width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          />
                          <Popconfirm title={t('common.confirm_delete')} onConfirm={() => handleDelete(record.id)}>
                            <Button
                              type="text"
                              size="small"
                              icon={<DeleteOutlined style={{ fontSize: 14 }} />}
                              style={{ padding: 0, width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            />
                          </Popconfirm>
                        </Space>
                      </div>
                    </Card>
                  </List.Item>
                );
              }}
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
          <div style={{ maxWidth: 1600, width: '100%' }}>
            <Form form={form} layout="vertical" onFinish={handleSave} preserve={true}>
              <Row gutter={24}>
                {/* 左侧基本配置栏 */}
                <Col xs={24} md={10} xl={10}>
                  <div style={{ padding: 16, background: _isLight ? '#f9fafb' : 'rgba(255,255,255,0.04)', borderRadius: 8, height: '100%', position: 'sticky', top: 24 }}>
                    <Form.Item name="name" label={<Text strong>{t('channels.name')}</Text>} rules={[{ required: true }]}>
                      <Input placeholder="e.g. OpenAI Primary" />
                    </Form.Item>

                    <Row gutter={16}>
                      <Col span={12}>
                        <Form.Item name="sort_order" label={<Text strong>页面排序</Text>} initialValue={0}>
                          <InputNumber min={0} max={9999} style={{ width: '100%' }} placeholder="越大越靠前" />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item name="status" label={<Text strong>状态</Text>} initialValue={1}>
                          <Select>
                            <Option value={1}>启用</Option>
                            <Option value={0}>禁用</Option>
                          </Select>
                        </Form.Item>
                      </Col>
                    </Row>

                    <Form.Item name="provider_type" style={{ display: 'none' }}><Input /></Form.Item>
                    <Form.Item name="preset_id" style={{ display: 'none' }}><Input /></Form.Item>
                    {activePlugins['volcengine_pool'] && <Form.Item name="pool_id" style={{ display: 'none' }}><Input /></Form.Item>}
                    {activePlugins['gptimage_pool'] && <Form.Item name="gptimage_pool_id" style={{ display: 'none' }}><Input /></Form.Item>}

                    <Form.Item shouldUpdate={(prev, curr) => prev.preset_id !== curr.preset_id || prev.pool_id !== curr.pool_id || prev.gptimage_pool_id !== curr.gptimage_pool_id || prev.provider_type !== curr.provider_type} noStyle>
                      {() => {
                        const providerType = form.getFieldValue('provider_type');
                        const currentPreset = form.getFieldValue('preset_id');
                        const currentVolcPool = form.getFieldValue('pool_id');
                        const currentGptImagePool = form.getFieldValue('gptimage_pool_id');
                        const isActive = activeRightPanel === 'presets';

                        let displayType = '无';
                        let displayName = '未选择';
                        let displayDetail = '';

                        if (providerType === 'high_availability_group') {
                          displayType = '高可用组';
                          displayName = '高可用虚拟渠道组';
                          displayDetail = `已绑定 ${selectedSubChannelAids.length} 个渠道`;
                        } else if (currentPreset) {
                          const preset = presets.find(p => p.id === currentPreset);
                          displayType = '预设渠道';
                          displayName = preset ? preset.name : '未知预设';
                          displayDetail = preset?.yid ? `YID: ${preset.yid}` : `ID: ${currentPreset}`;
                        } else if (currentVolcPool) {
                          const pool = volcenginePools.find(p => p.id === currentVolcPool);
                          displayType = '火山卡池';
                          displayName = pool ? pool.name : '未知卡池';
                          displayDetail = `ID: ${currentVolcPool}`;
                        } else if (currentGptImagePool) {
                          const pool = gptImagePools.find(p => p.id === currentGptImagePool);
                          displayType = 'GPT Image 卡池';
                          displayName = pool ? pool.name : '未知卡池';
                          displayDetail = `ID: ${currentGptImagePool}`;
                        }

                        return (
                          <div 
                            onClick={() => setActiveRightPanel('presets')} 
                            style={{ 
                              padding: '12px 16px', 
                              borderRadius: 8, 
                              border: isActive ? '1px solid var(--text)' : (_isLight ? '1px solid #e5e4e7' : '1px solid rgba(255,255,255,0.08)'), 
                              background: isActive ? (_isLight ? '#f9fafb' : 'rgba(255,255,255,0.04)') : (_isLight ? '#fff' : 'rgba(255,255,255,0.02)'), 
                              cursor: 'pointer', 
                              transition: 'all 0.2s',
                              marginBottom: 12
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Text strong={isActive} style={{ color: isActive ? 'var(--text)' : 'inherit' }}>
                                <span style={{ color: '#ff4d4f', marginRight: 4, fontFamily: 'SimSun, sans-serif' }}>*</span>
                                选择上游渠道
                              </Text>
                              <span style={{ fontSize: 12, color: isActive ? 'var(--text)' : 'var(--text-secondary)' }}>
                                {displayType !== '无' ? (
                                  <Tag color={providerType === 'high_availability_group' ? 'purple' : 'blue'} style={{ margin: 0, borderRadius: 4 }}>{displayType}</Tag>
                                ) : '未选择'}
                                <ArrowRightOutlined style={{ marginLeft: 4 }} />
                              </span>
                            </div>
                            {displayType !== '无' && (
                              <div style={{ marginTop: 8, padding: '6px 8px', background: _isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)', borderRadius: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 8 }}>
                                  {displayName}
                                </span>
                                <Space size={8} style={{ flexShrink: 0 }}>
                                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{displayDetail}</span>
                                  <Button 
                                    type="text" 
                                    size="small" 
                                    icon={<CloseOutlined style={{ fontSize: 10 }} />} 
                                    style={{ width: 20, height: 20, minWidth: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', margin: 0, padding: 0 }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedSubChannelAids([]);
                                      setConfigObj({});
                                      form.setFieldsValue({
                                        preset_id: null,
                                        pool_id: null,
                                        gptimage_pool_id: null,
                                        provider_type: 'custom'
                                      });
                                    }}
                                  />
                                </Space>
                              </div>
                            )}
                          </div>
                        );
                      }}
                    </Form.Item>


                    <Form.Item label={<Text strong>路由与范围配置</Text>} style={{ marginBottom: 0 }}>
                      <Space direction="vertical" style={{ width: '100%' }} size={12}>
                        {/* Plugin: happyhorse_router 路由切换+节点选择（插件可移除） */}
                        {happyHorseEnabled && hhModule && (
                          <hhModule.HappyHorseRouteConfig
                            enabled={happyHorseEnabled}
                            isRouting={isHappyHorseRouting}
                            configs={happyHorseConfigs}
                            selectedNode={selectedRoutingNode}
                            onSwitchMode={(val) => {
                              const isHH = val === 'happyhorse';
                              setIsHappyHorseRouting(isHH);
                              if (isHH) {
                                const activeConfigs = happyHorseConfigs.filter((c: any) => c.is_active === 1);
                                const defaultNode = activeConfigs[0]?.routing_node || '';
                                setSelectedRoutingNode(defaultNode);
                                if (defaultNode) handleModelsChange([defaultNode]);
                              } else {
                                setSelectedRoutingNode(null);
                                handleModelsChange([]);
                              }
                            }}
                            onSelectNode={(nodeVal) => {
                              setSelectedRoutingNode(nodeVal);
                              handleModelsChange([nodeVal]);
                            }}
                            isLight={_isLight}
                          />
                        )}

                        {/* Models */}
                        <Form.Item shouldUpdate={(prev, curr) => prev.models !== curr.models} noStyle>
                           {() => {
                            const m = form.getFieldValue('models') || [];
                            const isActive = activeRightPanel === 'models';

                            /* Plugin: happyhorse_router 左侧信息卡（插件可移除） */
                            if (isHappyHorseRouting && hhModule) {
                              const activeConfig = happyHorseConfigs.find((c: any) => c.routing_node === selectedRoutingNode);
                              return (
                                <hhModule.HappyHorseStatusCard
                                  activeConfig={activeConfig || null}
                                  selectedNode={selectedRoutingNode}
                                  isLight={_isLight}
                                  onClick={() => setActiveRightPanel('models')}
                                />
                              );
                            }

                            return (
                              <div onClick={() => setActiveRightPanel('models')} style={{ padding: '12px 16px', borderRadius: 8, border: isActive ? '1px solid var(--text)' : (_isLight ? '1px solid #e5e4e7' : '1px solid rgba(255,255,255,0.08)'), background: isActive ? (_isLight ? '#f9fafb' : 'rgba(255,255,255,0.04)') : (_isLight ? '#fff' : 'rgba(255,255,255,0.02)'), cursor: 'pointer', transition: 'all 0.2s' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: m.length > 0 ? 8 : 0 }}>
                                  <Text strong={isActive} style={{ color: isActive ? 'var(--text)' : 'inherit' }}>选择模型</Text>
                                  <span style={{ fontSize: 12, color: isActive ? 'var(--text)' : 'var(--text-secondary)' }}>已选 {m.length} 个 <ArrowRightOutlined style={{ marginLeft: 4 }} /></span>
                                </div>
                                {m.length > 0 && (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto', paddingRight: 4 }}>
                                    {m.map((mid: string) => {
                                      const match = availableModels.find((model: any) => model.mid === mid);
                                      return (
                                        <div key={mid} style={{ padding: '6px 8px', background: _isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)', borderRadius: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                          <span style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 8 }}>
                                            {match ? match.name : '未知模型'}
                                            {match && match.remark && <span style={{ color: 'var(--text-secondary)', fontWeight: 'normal', marginLeft: 4 }}>({match.remark})</span>}
                                          </span>
                                          <Space size={8} style={{ flexShrink: 0 }}>
                                            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>MID: {match ? match.mid : mid}</span>
                                            <Button 
                                              type="text" 
                                              size="small" 
                                              icon={<CloseOutlined style={{ fontSize: 10 }} />} 
                                              style={{ width: 20, height: 20, minWidth: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', margin: 0, padding: 0 }}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                const next = m.filter((id: string) => id !== mid);
                                                handleModelsChange(next);
                                              }}
                                            />
                                          </Space>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          }}
                        </Form.Item>

                        {/* Model Mapping */}
                        <Form.Item shouldUpdate noStyle>
                          {() => {
                            const mapping = modelMappingState || {};
                            const mappedEntries = Object.entries(mapping).filter(([_, v]) => v && String(v).trim());
                            const isActive = activeRightPanel === 'mapping';
                            return (
                              <div onClick={() => setActiveRightPanel('mapping')} style={{ padding: '12px 16px', borderRadius: 8, border: isActive ? '1px solid var(--text)' : (_isLight ? '1px solid #e5e4e7' : '1px solid rgba(255,255,255,0.08)'), background: isActive ? (_isLight ? '#f9fafb' : 'rgba(255,255,255,0.04)') : (_isLight ? '#fff' : 'rgba(255,255,255,0.02)'), cursor: 'pointer', transition: 'all 0.2s' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: (showMapping && mappedEntries.length > 0) ? 8 : 0 }}>
                                  <Text strong={isActive} style={{ color: isActive ? 'var(--text)' : 'inherit' }}>模型别名映射</Text>
                                  <span style={{ fontSize: 12, color: isActive ? 'var(--text)' : 'var(--text-secondary)' }}>
                                    {showMapping ? <span style={{ fontWeight: 500 }}>已开启 {mappedEntries.length > 0 ? `(${mappedEntries.length})` : ''}</span> : <span>未开启</span>} <ArrowRightOutlined style={{ marginLeft: 4 }} />
                                  </span>
                                </div>
                                {showMapping && mappedEntries.length > 0 && (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {mappedEntries.slice(0, 8).map(([k, v]) => (
                                      <div key={k} style={{ padding: '6px 8px', background: _isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)', borderRadius: 4, display: 'flex', alignItems: 'center' }}>
                                        <span style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 8 }} title={k}>{k}</span>
                                        <span style={{ fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 8, textAlign: 'right' }} title={String(v)}>➔ {String(v)}</span>
                                        <Button 
                                          type="text" 
                                          size="small" 
                                          icon={<CloseOutlined style={{ fontSize: 10 }} />} 
                                          style={{ width: 20, height: 20, minWidth: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', margin: 0, padding: 0, flexShrink: 0 }}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setActiveMappingInputs(prev => prev.filter(id => id !== k));
                                            setModelMappingState(prev => {
                                              const next = { ...prev };
                                              delete next[k];
                                              form.setFieldsValue({ model_mapping: next });
                                              return next;
                                            });
                                          }}
                                        />
                                      </div>
                                    ))}
                                    {mappedEntries.length > 8 && <div style={{ fontSize: 11, color: 'var(--text-secondary)', textAlign: 'center', marginTop: 2 }}>...还有 {mappedEntries.length - 8} 个</div>}
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
                                  <Text strong={isActive} style={{ color: isActive ? 'var(--text)' : 'inherit' }}>{isExcludeMode ? '不支持用户等级' : '支持用户等级'}</Text>
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
                                        <span style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 8 }}>{lv ? `${lv.name} (${lv.discount}x)` : '未知等级'}</span>
                                        <Space size={8} style={{ flexShrink: 0 }}>
                                          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>ULID: {idStr.padStart(4, '0')}</span>
                                          <Button 
                                            type="text" 
                                            size="small" 
                                            icon={<CloseOutlined style={{ fontSize: 10 }} />} 
                                            style={{ width: 20, height: 20, minWidth: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', margin: 0, padding: 0 }}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              const next = levels.filter((id: string) => id !== idStr);
                                              form.setFieldsValue({ level_select: next });
                                              levelsRef.current = next;
                                            }}
                                          />
                                        </Space>
                                      </div>
                                      );
                                    })}
                                    {levels.length > 8 && <div style={{ fontSize: 11, color: 'var(--text-secondary)', textAlign: 'center', marginTop: 2 }}>...还有 {levels.length - 8} 个</div>}
                                  </div>
                                ) : (
                                  <Text type="secondary" style={{ fontSize: 12 }}>{isExcludeMode ? '未排除任何等级 (全部允许)' : '当前全部用户等级允许'}</Text>
                                )}
                              </div>
                            );
                          }}
                        </Form.Item>
                      </Space>
                    </Form.Item>

                    <div style={{ marginTop: 24 }}>
                      <Text strong style={{ display: 'block', marginBottom: 12 }}>调度策略</Text>
                      <Row gutter={12}>
                        <Col span={12}>
                          <Form.Item name="priority" label="请求优先级" initialValue={0}>
                            <InputNumber style={{ width: '100%' }} />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="weight" label="权重" initialValue={1}>
                            <InputNumber style={{ width: '100%' }} />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="rate" label="倍率" initialValue={1.0}>
                            <InputNumber
                              min={0}
                              step={0.1}
                              style={{ width: '100%' }}
                            />
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
                      </Row>

                      {/* ─── 存储设置 ─── */}
                      <Divider style={{ margin: '12px 0 8px' }}>存储设置</Divider>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div>
                          <Text strong style={{ fontSize: 13 }}>开启 TOS 资源存储</Text>
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                            开启后，图片/视频响应资源自动上传到 TOS 并返回永久 URL
                          </div>
                        </div>
                        <Switch
                          checked={configObj.tos_storage_enabled || false}
                          onChange={(v) => setConfigObj({ ...configObj, tos_storage_enabled: v, tos_storage_days: configObj.tos_storage_days ?? 1 })}
                        />
                      </div>
                      {configObj.tos_storage_enabled && (
                        <div style={{ marginTop: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                            <Text style={{ fontSize: 13, whiteSpace: 'nowrap' }}>存储有效期</Text>
                            <InputNumber
                              min={0} max={365}
                              value={configObj.tos_storage_days ?? 1}
                              onChange={(v) => setConfigObj({ ...configObj, tos_storage_days: v })}
                              addonAfter="天"
                              style={{ width: 140 }}
                            />
                            <Text type="secondary" style={{ fontSize: 11 }}>0 = 永久保留</Text>
                          </div>
                          <Alert
                            type="info"
                            showIcon
                            style={{ fontSize: 12, padding: '6px 12px' }}
                            message="使用站点「系统设置 → 存储设置」中配置的 TOS 信息。请确保已正确配置。"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </Col>

                {/* 右侧动态面板 */}
                <Col xs={24} md={14} xl={14}>
                  <div style={{ padding: 24, background: _isLight ? '#fff' : 'rgba(255,255,255,0.02)', border: _isLight ? '1px solid #e5e4e7' : '1px solid rgba(255,255,255,0.08)', borderRadius: 8, minHeight: 600 }}>
                    
                    <div style={{ display: activeRightPanel === 'models' ? 'block' : 'none', animation: 'fadeIn 0.2s' }}>
                      {/* Plugin: happyhorse_router 右侧详情面板（插件可移除） */}
                      {isHappyHorseRouting && hhModule ? (() => {
                        const activeConfig = happyHorseConfigs.find((c: any) => c.routing_node === selectedRoutingNode);
                        return (
                          <hhModule.HappyHorseDetailPanel
                            activeConfig={activeConfig || null}
                            selectedNode={selectedRoutingNode}
                            isLight={_isLight}
                          />
                        );
                      })() : (
                        <>
                          <Form.Item name="models" rules={[{ required: true, message: '请选择至少一个模型' }]} style={{ marginBottom: 0 }} hidden>
                            <Select mode="multiple" />
                          </Form.Item>
                          <ModelSelector
                            selectedMids={channelModelMids}
                            onSelectionChange={handleModelsChange}
                            onModelsLoaded={(models) => setAvailableModels(models)}
                            allowDuplicateModelId={false}
                            isLightTheme={_isLight}
                            title="选择模型"
                          />
                        </>
                      )}
                    </div>

                    <div style={{ display: activeRightPanel === 'presets' ? 'block' : 'none', animation: 'fadeIn 0.2s' }}>
                      <Form.Item shouldUpdate={(prev, curr) => prev.provider_type !== curr.provider_type} noStyle>
                        {() => {
                          const providerType = form.getFieldValue('provider_type');
                          return (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                              <Title level={4} style={{ margin: 0 }}>选择上游渠道</Title>
                              <Button
                                type={providerType === 'high_availability_group' ? 'primary' : 'dashed'}
                                icon={<ApartmentOutlined />}
                                size="small"
                                onClick={() => {
                                  if (providerType === 'high_availability_group') {
                                    // 若已是高可用组，点击则取消选择
                                    setSelectedSubChannelAids([]);
                                    setConfigObj({});
                                    form.setFieldsValue({
                                      preset_id: null,
                                      pool_id: null,
                                      gptimage_pool_id: null,
                                      provider_type: 'custom'
                                    });
                                  } else {
                                    // 一键设置为高可用虚拟组
                                    setSelectedSubChannelAids([]);
                                    setConfigObj({});
                                    form.setFieldsValue({
                                      preset_id: -99, // 对应预设 ID
                                      pool_id: null,
                                      gptimage_pool_id: null,
                                      rate: 1.0,
                                      provider_type: 'high_availability_group'
                                    });
                                  }
                                }}
                              >
                                {providerType === 'high_availability_group' ? '已选高可用虚拟渠道组' : '点击选择高可用虚拟渠道组'}
                              </Button>
                            </div>
                          );
                        }}
                      </Form.Item>

                      <Form.Item shouldUpdate={(prev, curr) => prev.preset_id !== curr.preset_id || prev.pool_id !== curr.pool_id || prev.gptimage_pool_id !== curr.gptimage_pool_id || prev.provider_type !== curr.provider_type} noStyle>
                        {() => {
                          const providerType = form.getFieldValue('provider_type');
                          const currentPreset = form.getFieldValue('preset_id');
                          const currentVolcPool = form.getFieldValue('pool_id');
                          const currentGptImagePool = form.getFieldValue('gptimage_pool_id');

                          if (providerType === 'high_availability_group') {
                            const subCandidates = channels.filter(c => 
                              c.provider_type !== 'high_availability_group' && 
                              c.group_aid &&
                              (
                                c.name?.toLowerCase().includes(presetSearchText.toLowerCase()) || 
                                c.group_aid.toLowerCase().includes(presetSearchText.toLowerCase())
                              )
                            );

                            return (
                              <>
                                {/* 搜索框 */}
                                <div style={{ marginBottom: 16 }}>
                                  <Input
                                    placeholder="输入关键字搜索物理渠道名称或 AID..."
                                    allowClear
                                    prefix={<SearchOutlined style={{ color: 'var(--text-secondary)' }} />}
                                    value={presetSearchText}
                                    onChange={(e) => setPresetSearchText(e.target.value)}
                                  />
                                </div>

                                <div style={{ marginBottom: 12 }}>
                                  <Alert
                                    message="高可用渠道多选绑定"
                                    description={`您可以选择最多 ${haMaxRetries} 个物理渠道绑定到该虚拟组。当选满 ${haMaxRetries} 个后，其余未选渠道将被置灰不可勾选。`}
                                    type="info"
                                    showIcon
                                    style={{ borderRadius: 6 }}
                                  />
                                </div>

                                <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Text strong>
                                    绑定物理渠道 ({selectedSubChannelAids.length} / {haMaxRetries})
                                  </Text>
                                  {selectedSubChannelAids.length === 0 && (
                                    <span style={{ color: '#ff4d4f', fontSize: 12, fontWeight: 500 }}>
                                      请至少绑定一个渠道
                                    </span>
                                  )}
                                </div>

                                {subCandidates.length === 0 ? (
                                  <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-secondary)', border: '1px dashed #e5e4e7', borderRadius: 8 }}>
                                    暂无可绑定的物理渠道（请先在左侧输入唯一识别码 AID）
                                  </div>
                                ) : (
                                  <div style={{ 
                                    maxHeight: '680px', 
                                    overflowY: 'auto', 
                                    background: _isLight ? 'rgba(0,0,0,0.01)' : 'rgba(255,255,255,0.01)', 
                                    padding: '10px', 
                                    borderRadius: 8, 
                                    border: _isLight ? '1px solid #e5e4e7' : '1px solid rgba(255,255,255,0.08)' 
                                  }}>
                                    <Space direction="vertical" style={{ width: '100%' }} size={8}>
                                      {subCandidates.map(c => {
                                        const aid = c.group_aid || '';
                                        const isChecked = selectedSubChannelAids.includes(aid);
                                        const isFull = selectedSubChannelAids.length >= haMaxRetries;
                                        const isDisabled = isFull && !isChecked;

                                        return (
                                          <div 
                                            key={aid} 
                                            style={{ 
                                              display: 'flex', 
                                              alignItems: 'center', 
                                              justifyContent: 'space-between',
                                              padding: '10px 12px', 
                                              borderRadius: 6,
                                              background: isChecked ? (_isLight ? 'rgba(22,119,255,0.08)' : 'rgba(22,119,255,0.15)') : 'transparent',
                                              border: isChecked ? '1px solid #91caff' : (_isLight ? '1px solid #e5e4e7' : '1px solid rgba(255,255,255,0.08)'),
                                              opacity: isDisabled ? 0.5 : 1,
                                              transition: 'all 0.15s'
                                            }}
                                          >
                                            <Checkbox
                                              checked={isChecked}
                                              disabled={isDisabled}
                                              onChange={(e) => {
                                                let next = [...selectedSubChannelAids];
                                                if (e.target.checked) {
                                                  if (!next.includes(aid)) next.push(aid);
                                                } else {
                                                  next = next.filter(a => a !== aid);
                                                }
                                                setSelectedSubChannelAids(next);
                                                setConfigObj(prev => ({ ...prev, sub_channels: next }));
                                              }}
                                              style={{ flex: 1, marginRight: 8 }}
                                            >
                                              <span style={{ fontWeight: 600, fontSize: 13, color: isChecked ? 'var(--text)' : 'inherit' }}>{c.name}</span>
                                              <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }} code>{aid}</Text>
                                            </Checkbox>
                                            <Space size={8}>
                                              <Tag color="orange" style={{ margin: 0, fontSize: 11, borderRadius: 4 }}>倍率: {c.rate ?? 1.0}x</Tag>
                                              <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>P:{c.priority} | W:{c.weight}</span>
                                            </Space>
                                          </div>
                                        );
                                      })}
                                    </Space>
                                  </div>
                                )}
                              </>
                            );
                          }

                          let items: any[] = [];
                          if (upstreamTab === 'preset') {
                            items = presets.filter(p => 
                              p.name?.toLowerCase().includes(presetSearchText.toLowerCase()) || 
                              p.provider_type?.toLowerCase().includes(presetSearchText.toLowerCase()) || 
                              String(p.id).includes(presetSearchText) ||
                              (p.yid && String(p.yid).includes(presetSearchText))
                            );
                          } else if (upstreamTab === 'volc') {
                            items = volcenginePools.filter(p => 
                              p.name?.toLowerCase().includes(presetSearchText.toLowerCase()) || 
                              String(p.id).includes(presetSearchText)
                            );
                          } else if (upstreamTab === 'gptimage') {
                            items = gptImagePools.filter(p => 
                              p.name?.toLowerCase().includes(presetSearchText.toLowerCase()) || 
                              String(p.id).includes(presetSearchText)
                            );
                          }

                          return (
                            <>
                              {/* 1. 如果有火山或GPT Image卡池插件，则展示 Segmented 进行切换。否则直接隐藏切换器 */}
                              {(activePlugins['volcengine_pool'] || activePlugins['gptimage_pool']) && (
                                <div style={{ marginBottom: 16 }}>
                                  <Segmented
                                    block
                                    value={upstreamTab}
                                    onChange={(value) => setUpstreamTab(value as any)}
                                    options={[
                                      { label: `预设渠道 (${presets.length})`, value: 'preset' },
                                      ...(activePlugins['volcengine_pool'] ? [{ label: `火山卡池 (${volcenginePools.length})`, value: 'volc' }] : []),
                                      ...(activePlugins['gptimage_pool'] ? [{ label: `GPT Image 卡池 (${gptImagePools.length})`, value: 'gptimage' }] : [])
                                    ]}
                                  />
                                </div>
                              )}

                              {/* 2. 搜索框 */}
                              <div style={{ marginBottom: 16 }}>
                                <Input
                                  placeholder="输入关键字搜索名称或 ID..."
                                  allowClear
                                  prefix={<SearchOutlined style={{ color: 'var(--text-secondary)' }} />}
                                  value={presetSearchText}
                                  onChange={(e) => setPresetSearchText(e.target.value)}
                                />
                              </div>

                              {items.length === 0 ? (
                                <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                  暂无匹配的上游渠道配置
                                </div>
                              ) : (
                                <div style={{ maxHeight: '680px', overflowY: 'auto', paddingRight: 4 }}>
                                  <Row gutter={[12, 12]}>
                                    {items.map((item) => {
                                      let isSelected = false;
                                      let cardTitle = item.name;
                                      let cardSubtitle = '';
                                      let extraTag = null;

                                      if (upstreamTab === 'preset') {
                                        isSelected = currentPreset === item.id;
                                        cardSubtitle = item.yid ? `YID: ${item.yid} | ID: ${item.id}` : `ID: ${item.id}`;
                                        extraTag = (
                                          <Space size={4}>
                                            <Tag color="default" style={{ margin: 0, fontSize: 11 }}>{item.provider_type}</Tag>
                                            <Tag color="orange" style={{ margin: 0, fontSize: 11 }}>倍率: {item.rate ?? 1.0}</Tag>
                                          </Space>
                                        );
                                      } else if (upstreamTab === 'volc') {
                                        isSelected = currentVolcPool === item.id;
                                        cardSubtitle = `ID: ${item.id}`;
                                        extraTag = <Tag color="cyan" style={{ margin: 0, fontSize: 11 }}>{item.strategy === 'random' ? '随机' : '顺序'}</Tag>;
                                      } else if (upstreamTab === 'gptimage') {
                                        isSelected = currentGptImagePool === item.id;
                                        cardSubtitle = `ID: ${item.id}`;
                                        extraTag = <Tag color="purple" style={{ margin: 0, fontSize: 11 }}>{item.strategy === 'random' ? '随机' : '顺序'}</Tag>;
                                      }

                                      return (
                                        <Col span={24} key={item.id}>
                                          <div
                                            onClick={() => {
                                              if (upstreamTab === 'preset') {
                                                const isHa = item.provider_type === 'high_availability_group';
                                                if (!isHa) {
                                                  setSelectedSubChannelAids([]);
                                                  setConfigObj({});
                                                }
                                                form.setFieldsValue({
                                                  preset_id: item.id,
                                                  pool_id: null,
                                                  gptimage_pool_id: null,
                                                  rate: item.rate ?? 1.0,
                                                  provider_type: item.provider_type || 'custom'
                                                });
                                              } else {
                                                setSelectedSubChannelAids([]);
                                                setConfigObj({});
                                                if (upstreamTab === 'volc') {
                                                  form.setFieldsValue({
                                                    preset_id: null,
                                                    pool_id: item.id,
                                                    gptimage_pool_id: null,
                                                    provider_type: 'custom'
                                                  });
                                                } else if (upstreamTab === 'gptimage') {
                                                  form.setFieldsValue({
                                                    preset_id: null,
                                                    pool_id: null,
                                                    gptimage_pool_id: item.id,
                                                    provider_type: 'custom'
                                                  });
                                                }
                                              }
                                            }}
                                            style={{
                                              padding: '12px 16px',
                                              borderRadius: 8,
                                              border: isSelected ? '1.5px solid var(--text)' : (_isLight ? '1px solid #e5e4e7' : '1px solid rgba(255,255,255,0.08)'),
                                              background: isSelected ? (_isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.06)') : 'transparent',
                                              cursor: 'pointer',
                                              display: 'flex',
                                              justifyContent: 'space-between',
                                              alignItems: 'center',
                                              transition: 'all 0.2s'
                                            }}
                                          >
                                            <div style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
                                              <div style={{ fontWeight: 600, fontSize: 14, color: isSelected ? 'var(--text)' : 'inherit', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {cardTitle}
                                              </div>
                                              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                                                {cardSubtitle}
                                              </div>
                                            </div>
                                            <div style={{ flexShrink: 0 }}>
                                              {extraTag}
                                            </div>
                                          </div>
                                        </Col>
                                      );
                                    })}
                                  </Row>
                                </div>
                              )}
                            </>
                          );
                        }}
                      </Form.Item>
                    </div>

                    <div style={{ display: activeRightPanel === 'levels' ? 'block' : 'none', animation: 'fadeIn 0.2s' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 12 }}>
                          <Space size={16} align="center" wrap>
                            <Title level={4} style={{ margin: 0, whiteSpace: 'nowrap' }}>{isExcludeMode ? '不支持用户等级' : '支持用户等级'}</Title>
                            <Form.Item shouldUpdate={(prev, curr) => prev.level_select !== curr.level_select} noStyle>
                              {() => {
                                const selected = form.getFieldValue('level_select') || [];
                                const allLevelIds = availableUserLevels.map(l => l.id.toString());
                                return (
                                  <Space>
                                    <Button onClick={() => { levelsRef.current = allLevelIds; form.setFieldsValue({ level_select: allLevelIds }); }}>全选</Button>
                                    <Button onClick={() => { levelsRef.current = []; form.setFieldsValue({ level_select: [] }); }} disabled={selected.length === 0}>
                                      清空
                                    </Button>
                                  </Space>
                                );
                              }}
                            </Form.Item>
                          </Space>
                          <Space size={8} align="center">
                            <Text type="secondary" style={{ fontSize: 13, display: screens.xs ? 'none' : 'inline-block' }}>访问控制模式：</Text>
                            <Segmented
                              options={['允许模式', '排除模式']}
                              value={isExcludeMode ? '排除模式' : '允许模式'}
                              onChange={(val) => setIsExcludeMode(val === '排除模式')}
                            />
                          </Space>
                        </div>
                        <div style={{ marginBottom: 24 }}>
                          <Text type="secondary" style={{ fontSize: 13 }}>
                            {isExcludeMode ? '选中排除的等级将【不可】使用该渠道。' : '选中允许的等级才【可以】使用该渠道。'}
                          </Text>
                        </div>
                        
                        <Form.Item name="level_select" style={{ marginBottom: 0 }} hidden>
                          <Select mode="multiple" />
                        </Form.Item>
                        
                        <Form.Item shouldUpdate={(prev, curr) => prev.level_select !== curr.level_select} noStyle>
                          {() => {
                            const selectedLevels = form.getFieldValue('level_select') || [];
                            return (
                              <div style={{ maxHeight: 600, overflowY: 'auto', paddingRight: 8 }}>
                                <Row gutter={[12, 12]}>
                                  {availableUserLevels.map((l) => {
                                    const idStr = l.id.toString();
                                    const isSelected = selectedLevels.includes(idStr);
                                    return (
                                      <Col xs={24} sm={12} lg={12} key={idStr}>
                                        <div 
                                          onClick={() => {
                                            const next = isSelected ? selectedLevels.filter((id: string) => id !== idStr) : [...selectedLevels, idStr];
                                            levelsRef.current = next;
                                            form.setFieldsValue({ level_select: next });
                                          }}
                                          style={{
                                            padding: '8px 12px',
                                            borderRadius: 6,
                                            border: isSelected ? '1px solid var(--text)' : (_isLight ? '1px solid #e5e4e7' : '1px solid rgba(255,255,255,0.08)'),
                                            background: isSelected ? (_isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.08)') : 'transparent',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            transition: 'all 0.2s'
                                          }}
                                        >
                                          <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontWeight: 500, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: isSelected ? 'var(--text)' : 'inherit' }}>{l.name} ({l.discount}x)</div>
                                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>ULID: {idStr.padStart(4, '0')} | {l.group_key}</div>
                                          </div>
                                        </div>
                                      </Col>
                                    );
                                  })}
                                </Row>
                              </div>
                            );
                          }}
                        </Form.Item>
                      </div>


                    <div style={{ display: activeRightPanel === 'mapping' ? 'block' : 'none', animation: 'fadeIn 0.2s' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                          <Title level={4} style={{ margin: 0 }}>模型别名映射</Title>
                          <Switch checked={showMapping} onChange={setShowMapping} />
                        </div>
                        <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>开启后可为每个模型指定上游别名，解决上下游模型名称不一致的问题。</Text>
                        
                        {showMapping ? (
                          <Form.Item shouldUpdate={(prev, curr) => prev.models !== curr.models} noStyle>
                            {() => {
                              // Plugin: happyhorse_router 模型别名映射适配（插件可移除）
                              // 快乐小马模式下基于4个视频模型生成映射列表，而非 routing_node
                              let selectedModels = form.getFieldValue('models') || [];
                              if (isHappyHorseRouting && hhModule) {
                                const activeConfig = happyHorseConfigs.find((c: any) => c.routing_node === selectedRoutingNode);
                                const hhModels = hhModule.getHappyHorseMappingModels(activeConfig || null);
                                selectedModels = hhModels.map(m => m.modelId);
                              }
                              if (selectedModels.length === 0) {
                                return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text)', background: _isLight ? '#f9fafb' : 'rgba(255,255,255,0.04)', borderRadius: 8 }}>{isHappyHorseRouting ? '请先选择推理节点' : '请先在左侧选择模型'}</div>;
                              }
                              return (
                                <div style={{ maxHeight: 450, overflowY: 'auto', paddingRight: 12 }}>
                                  <Row gutter={16}>
                                    {selectedModels.map((midOrId: string) => {
                                      const match = availableModels.find(m => m.mid === midOrId);
                                      const actualModelId = match ? match.model_id : midOrId;
                                      const isActive = activeMappingInputs.includes(actualModelId);
                                      const currentMapping = modelMappingState;
                                      const hasValue = currentMapping[actualModelId] && String(currentMapping[actualModelId]).trim();

                                      return (
                                        <Col span={24} key={midOrId}>
                                          <div style={{ 
                                            padding: '12px', 
                                            marginBottom: 12, 
                                            borderRadius: 8, 
                                            border: _isLight ? '1px solid #e5e4e7' : '1px solid rgba(255,255,255,0.08)',
                                            background: isActive ? (_isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)') : 'transparent',
                                            transition: 'all 0.2s'
                                          }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                              <div style={{ flex: 1, minWidth: 0, paddingRight: 16 }}>
                                                <div style={{ fontWeight: 500, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{match?.name || actualModelId}</div>
                                                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>ID: {actualModelId} | MID: {midOrId}</div>
                                              </div>
                                              
                                              {!isActive && (
                                                <Button 
                                                  type={hasValue ? "default" : "dashed"} 
                                                  size="small" 
                                                  icon={<PlusOutlined />}
                                                  onClick={() => setActiveMappingInputs(prev => [...prev, actualModelId])}
                                                  style={{ flexShrink: 0 }}
                                                >
                                                  {hasValue ? "编辑别名" : "添加映射"}
                                                </Button>
                                              )}
                                            </div>

                                            {isActive && (
                                              <div style={{ marginTop: 12, display: 'flex', gap: 8, animation: 'fadeIn 0.2s' }}>
                                                <div style={{ marginBottom: 0, flex: 1 }}>
                                                  <Input 
                                                    placeholder={`请输入上游调用的实际名称，不填则默认：${actualModelId}`} 
                                                    autoFocus 
                                                    value={modelMappingState[actualModelId] || ''}
                                                    onChange={(e) => {
                                                      const val = e.target.value;
                                                      setModelMappingState(prev => ({ ...prev, [actualModelId]: val }));
                                                    }}
                                                  />
                                                </div>
                                                <Button 
                                                  icon={<DeleteOutlined />} 
                                                  onClick={() => {
                                                    setActiveMappingInputs(prev => prev.filter(id => id !== actualModelId));
                                                    setModelMappingState(prev => {
                                                      const next = { ...prev };
                                                      delete next[actualModelId];
                                                      return next;
                                                    });
                                                  }}
                                                />
                                              </div>
                                            )}
                                          </div>
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
