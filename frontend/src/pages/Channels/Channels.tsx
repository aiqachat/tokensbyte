/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import React, { useEffect, useRef, useState } from 'react';
import ModelSelector from '../../components/ModelSelector';
import { Table, Button, Space, Tag, Modal, Form, Input, InputNumber, message, Popconfirm, Card, Typography, Select, Row, Col, Switch, Grid, Segmented, Tooltip, Divider, Alert, List, Progress, Drawer, Checkbox, Spin } from 'antd';
import MobileCardList, { MobileCard, CardRow, CardActions } from '../../components/MobileCardList';
import { PlusOutlined, EditOutlined, DeleteOutlined, SyncOutlined, ArrowLeftOutlined, ArrowRightOutlined, CloseOutlined, UnorderedListOutlined, AppstoreOutlined, PlayCircleOutlined, SearchOutlined, ApartmentOutlined, CloudServerOutlined, SettingOutlined, ThunderboltOutlined, ReloadOutlined, GlobalOutlined, ClearOutlined, StopOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation } from 'react-router-dom';
import request from '../../utils/request';
import useSettingsStore from '../../store/settings';
import type { Channel, ChannelCategory } from '../../types';
import { useThemeStore } from '../../store/theme';
import ChannelCategoryManager from '../../components/Channels/ChannelCategoryManager';
import {
  parseQuotaLimitInput,
  getEffectiveChannelPeriodUsed,
} from '../../utils/quotaPeriod';

// ── 插件动态加载（各插件均可独立移除，删除对应目录后自动降级，不影响主功能） ──
type HHPluginModule = any;


const { Title, Text } = Typography;
const { Option } = Select;
const { useBreakpoint } = Grid;

const Channels: React.FC = () => {
  const { themeMode } = useThemeStore();
  const isLight = themeMode === 'light';
  const { t } = useTranslation();
  const { settings } = useSettingsStore();
  const currencySymbol = settings?.currency?.currency_symbol || '$';
  const adminPath = settings?.site?.admin_path || 'admin1688';
  const quotaTz = settings?.site?.default_timezone || 'Asia/Shanghai';
  const [channels, setChannels] = useState<Channel[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'card'>(() => {
    return (localStorage.getItem('channels_view_mode') as 'list' | 'card') || 'card';
  });
  const [availableModels, setAvailableModels] = useState<any[]>([]);
  const [availableUserLevels, setAvailableUserLevels] = useState<any[]>([]);
  const [presets, setPresets] = useState<any[]>([]);
  const [activePlugins, setActivePlugins] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [isModalVisible, setIsModalVisible] = useState(() => {
    return new URLSearchParams(window.location.search).has('edit');
  });
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const location = useLocation();

  const handleCloseModal = () => {
    setIsModalVisible(false);
    if (location.state && (location.state as any).from === 'model-display') {
      navigate(`/${adminPath}/channels/model-display`);
    }
  };
  const [showMapping, setShowMapping] = useState(false);
  const [activeMappingInputs, setActiveMappingInputs] = useState<string[]>([]);
  const [modelMappingState, setModelMappingState] = useState<Record<string, string>>({});
  // 高可用渠道组：按子渠道独立别名映射 { model_id: { sub_channel_id: alias } }
  const [haModelMappingState, setHaModelMappingState] = useState<Record<string, Record<string, string>>>({});
  const [expandedHaModels, setExpandedHaModels] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const screens = useBreakpoint();
  const [isExcludeMode, setIsExcludeMode] = useState(false);
  const [activeRightPanel, setActiveRightPanel] = useState<'models' | 'levels' | 'mapping' | 'presets'>('models');
  const [presetSearchText, setPresetSearchText] = useState('');
  const [enableQuota, setEnableQuota] = useState(false);
  const [upstreamTab, setUpstreamTab] = useState<'preset' | 'volcengine_enhance'>('preset');
  const [volcengineEnhanceKeys, setVolcengineEnhanceKeys] = useState<any[]>([]);
  /** 模型选择的桥接状态，同步 form store 与 ModelSelector 双向数据 */
  const [channelModelMids, setChannelModelMids] = useState<string[]>([]);
  const [selectedSubChannelAids, setSelectedSubChannelAids] = useState<any[]>([]);
  const [haMaxRetries, setHaMaxRetries] = useState<number>(3);
  // 熔断状态 Map: { channelId: { channel_meltdown, sub_channels } }
  const [meltdownMap, setMeltdownMap] = useState<Record<number, any>>({});
  const [meltdownLoading, setMeltdownLoading] = useState<Record<number, boolean>>({});

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
  const [categoryFilter, setCategoryFilter] = useState<number | 'all' | 'unclassified'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'default' | 'volcengine' | 'ha'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [configObj, setConfigObj] = useState<Record<string, any>>({});
  const [categories, setCategories] = useState<ChannelCategory[]>([]);
  const [isCategoryManagerVisible, setIsCategoryManagerVisible] = useState(false);

  // 清除画质增强凭证关联（取消选择时复用）
  const clearVolcengineEnhance = () => {
    setUpstreamTab('preset');
    form.setFieldsValue({ provider_type: 'custom' });
    setConfigObj(prev => {
      const { volcengine_enhance_credential_id, ...rest } = prev;
      return rest;
    });
  };

  const getChannelTypeKey = (c: Channel): 'default' | 'volcengine' | 'ha' => {
    if (c.provider_type === 'high_availability_group') return 'ha';
    if (c.provider_type === 'volcengine') return 'volcengine';
    return 'default';
  };

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

    let matchCategory = true;
    if (categoryFilter !== 'all') {
      if (categoryFilter === 'unclassified') {
        matchCategory = !c.category_id;
      } else {
        matchCategory = c.category_id === categoryFilter;
      }
    }

    let matchType = true;
    if (typeFilter !== 'all') {
      matchType = getChannelTypeKey(c) === typeFilter;
    }

    return matchStatus && matchSearch && matchCategory && matchType;
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

  const fetchCategories = async () => {
    try {
      const resp = await (request.get('/channel-categories') as any);
      setCategories(Array.isArray(resp) ? resp : []);
    } catch (e) {
      console.error(e);
    }
  };

  const resolveCategoryName = (categoryId?: number | null) => {
    if (!categoryId) return null;
    const cat = categories.find(c => c.id === categoryId);
    return cat?.name || null;
  };

  const activeCategories = categories.filter(c => !!c.is_active);

  const fetchPluginsAndPools = async () => {
    try {
      const resp = await (request.get('/plugins') as unknown as Promise<{ plugins: any[] }>);
      const plugins = resp.plugins || [];
      const activeMap: Record<string, boolean> = {};
      let hasVolcengineEnhance = false;

      plugins.forEach(p => {
        if (p.is_enabled === 1) {
          activeMap[p.name] = true;
          if (p.name === 'volcengine_enhance') hasVolcengineEnhance = true;
          // Plugin: happyhorse_router 数据加载（插件可移除）
          if (p.name === 'happyhorse_router') {
            setHappyHorseEnabled(true);
            request.get('/plugins/happyhorse_router/configs').then((r: any) => {
              const data = r?.data ?? r;
              const list = data?.configs ?? [];
              setHappyHorseConfigs(list);
            }).catch(() => {});
            // 动态加载插件 UI 模块
            const modGlob = import.meta.glob('../Plugins/HappyHorse/HappyHorseChannelPlugin.tsx');
            if (modGlob['../Plugins/HappyHorse/HappyHorseChannelPlugin.tsx']) {
              modGlob['../Plugins/HappyHorse/HappyHorseChannelPlugin.tsx']().then((mod: any) => setHhModule(mod)).catch(() => {});
            }
            }
          }
      });
      setActivePlugins(activeMap);

      if (hasVolcengineEnhance) {
        request.get('/plugins/volcengine_enhance/volcengine-enhance-config').then((r: any) => {
          if (r && r.keys) {
            setVolcengineEnhanceKeys(r.keys);
          }
        }).catch(() => {});
      }
    } catch (e) {
      console.error(e);
    }
  };


  // 批量加载所有 HA 渠道的熔断状态
  const fetchAllMeltdownStatus = async (channelList?: Channel[]) => {
    const list = channelList || channels;
    const haChannels = list.filter(c => c.provider_type === 'high_availability_group');
    if (haChannels.length === 0) return;
    const results: Record<number, any> = {};
    await Promise.allSettled(
      haChannels.map(async (ch) => {
        try {
          const resp = await request.get(`/channels/${ch.id}/meltdown`) as any;
          results[ch.id] = resp;
        } catch { /* ignore */ }
      })
    );
    setMeltdownMap(prev => ({ ...prev, ...results }));
  };

  // 手动重置单个渠道的熔断
  const handleResetMeltdown = async (channelId: number) => {
    setMeltdownLoading(prev => ({ ...prev, [channelId]: true }));
    try {
      const resp = await request.post(`/channels/${channelId}/meltdown/reset`) as any;
      message.success(`已重置熔断状态，清除了 ${resp.cleared_count || 0} 条记录`);
      // 刷新该渠道的熔断状态
      try {
        const updated = await request.get(`/channels/${channelId}/meltdown`) as any;
        setMeltdownMap(prev => ({ ...prev, [channelId]: updated }));
      } catch { /* ignore */ }
    } catch {
      message.error('重置熔断状态失败');
    } finally {
      setMeltdownLoading(prev => ({ ...prev, [channelId]: false }));
    }
  };

  // 手动清零渠道已用额度（总/日/月）
  const handleResetQuota = async (channelId: number) => {
    try {
      await request.post(`/channels/${channelId}/quota/reset`);
      message.success('已清零渠道已用额度');
      fetchChannels();
    } catch {
      message.error('清零额度失败');
    }
  };

  useEffect(() => {
    fetchChannels();
    fetchModels();
    fetchUserLevels();
    fetchPresets();
    fetchCategories();
    fetchPluginsAndPools();
    fetchHaMaxRetries();
  }, []);

  // 渠道列表加载后自动获取 HA 渠道熔断状态
  useEffect(() => {
    if (channels.length > 0) {
      fetchAllMeltdownStatus(channels);
    }
  }, [channels]);

  // 选中的渠道类型在列表中已不存在时，回退到「全部」
  useEffect(() => {
    if (typeFilter === 'all') return;
    const stillExists = channels.some((ch) => getChannelTypeKey(ch) === typeFilter);
    if (!stillExists) setTypeFilter('all');
  }, [channels, typeFilter]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const editId = params.get('edit');
    if (editId && channels.length > 0 && availableModels.length > 0) {
      const channelId = parseInt(editId);
      const ch = channels.find(c => c.id === channelId);
      if (ch) {
        window.history.replaceState(null, '', window.location.pathname);
        handleEdit(ch);
      }
    }
  }, [channels, availableModels]);

  const handleAdd = () => {
    setEditingChannel(null);
    setEnableQuota(false);
    form.resetFields();
    setShowMapping(false);
    setActiveMappingInputs([]);
    setModelMappingState({});
    setHaModelMappingState({});
    setExpandedHaModels([]);
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
    const q = record.quota_limit ?? -1;
    const dq = record.daily_quota_limit ?? -1;
    const wq = record.weekly_quota_limit ?? -1;
    const mq = record.monthly_quota_limit ?? -1;
    setEnableQuota(q >= 0 || dq >= 0 || wq >= 0 || mq >= 0);
    setModelMappingState(mapping);
    setActiveMappingInputs(Object.keys(mapping).filter(k => mapping[k] && String(mapping[k]).trim()));
    setIsExcludeMode(!!record.exclude_user_groups && record.exclude_user_groups.length > 0);
    setActiveRightPanel('models');
    setPresetSearchText('');
    if (record.preset_id) {
      setUpstreamTab('preset');
    } else if (record.provider_type === 'volcengine') {
      setUpstreamTab('volcengine_enhance');
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

    // 恢复高可用子渠道独立映射（必须在 parsedConfig 解析之后）
    const haMapping = parsedConfig?.ha_model_mapping || {};
    setHaModelMappingState(haMapping);
    // 自动展开有映射值的模型
    const expandedModels = Object.keys(haMapping).filter(k => {
      const subMap = haMapping[k];
      return subMap && Object.values(subMap).some((v: any) => v && String(v).trim());
    });
    setExpandedHaModels(expandedModels);

    setIsModalVisible(true);

    setTimeout(() => {
      form.setFieldsValue({
        name: record.name,
        provider_type: record.provider_type || 'custom',
        base_url: record.base_url,
        api_key: (record as any).api_key || '',
        sort_order: record.sort_order || 0,
        category_id: record.category_id || null,
        priority: record.priority || 0,
        status: record.status ?? 1,
        weight: record.weight || 1,
        rate: record.rate ?? 1.0,
        max_rps: (record as any).max_rps || 0,
        quota_limit: record.quota_limit ?? -1,
        quota_used: record.quota_used || 0,
        daily_quota_limit: record.daily_quota_limit ?? -1,
        weekly_quota_limit: record.weekly_quota_limit ?? -1,
        monthly_quota_limit: record.monthly_quota_limit ?? -1,
        preset_id: record.preset_id || null,
        model_mapping: mapping,
        models: modelsForForm,
        level_select: levelIds,
      });
    }, 0);
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
      if (newStatus === 1 && record.provider_type === 'high_availability_group' && !activePlugins['high_availability_channel']) {
        message.warning('高可用上游渠道系统插件未开启，无法启用此渠道');
        return;
      }
      await request.put(`/channels/${record.id}`, { status: newStatus });
      setChannels(prev => prev.map(c => c.id === record.id ? { ...c, status: newStatus } : c));
      message.success(newStatus === 1 ? '已启用渠道' : '已禁用渠道');
    } catch (e) {
      console.error(e);
      message.error('状态更新失败');
    }
  };

  const handleTest = (record: Channel) => {
    navigate(`/${adminPath}/channels/test/${record.id}`);
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

    // 同步清理 HA 子渠道映射中已移除的模型
    setHaModelMappingState(prev => {
      const cleaned = { ...prev };
      let changed = false;
      for (const key of Object.keys(cleaned)) {
        if (!validModelIds.has(key)) {
          delete cleaned[key];
          changed = true;
        }
      }
      return changed ? cleaned : prev;
    });
    setExpandedHaModels(prev => prev.filter(id => validModelIds.has(id)));
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

    if (!isHaGroup && values.provider_type !== 'volcengine' && !values.preset_id) {
      message.error('请选择上游渠道（预设、卡池或增强凭证至少选其一）');
      setSubmitting(false);
      return;
    }

    // 画质增强渠道必须关联凭证
    if (values.provider_type === 'volcengine' && !configObj.volcengine_enhance_credential_id) {
      message.error('请选择画质增强凭证');
      setSubmitting(false);
      return;
    }

    // Ensure only one upstream is used and others are explicitly cleared
    let { preset_id } = values;
    if (isHaGroup) {
      preset_id = null;
    }

    // 构建 HA 子渠道独立映射（只保留有实际值的条目）
    let finalHaModelMapping: Record<string, Record<string, string>> | undefined;
    if (isHaGroup && showMapping) {
      const cleaned: Record<string, Record<string, string>> = {};
      for (const [modelId, subMap] of Object.entries(haModelMappingState)) {
        const validEntries: Record<string, string> = {};
        for (const [subId, alias] of Object.entries(subMap)) {
          if (alias && String(alias).trim() && selectedSubChannelAids.includes(Number(subId))) {
            validEntries[subId] = String(alias).trim();
          }
        }
        if (Object.keys(validEntries).length > 0) {
          cleaned[modelId] = validEntries;
        }
      }
      if (Object.keys(cleaned).length > 0) {
        finalHaModelMapping = cleaned;
      }
    }

    const finalConfig = isHaGroup 
      ? { ...configObj, sub_channels: selectedSubChannelAids, ...(finalHaModelMapping ? { ha_model_mapping: finalHaModelMapping } : { ha_model_mapping: undefined }) }
      : {
          tos_storage_enabled: configObj.tos_storage_enabled,
          tos_storage_days: configObj.tos_storage_days,
          // 画质增强凭证关联：通过凭证 ID 实时查询最新密钥，保证数据一致性
          ...(values.provider_type === 'volcengine' && configObj.volcengine_enhance_credential_id
            ? { volcengine_enhance_credential_id: configObj.volcengine_enhance_credential_id }
            : {}),
        };

    const data = {
      ...values,
      models: reliableModels,
      provider_type: values.provider_type || 'custom',
      model_mapping: finalMapping,
      user_groups: isExcludeMode ? [] : reliableLevels,
      exclude_user_groups: isExcludeMode ? reliableLevels : [],
      config: finalConfig,
      sort_order: values.sort_order || 0,
      category_id: values.category_id ?? null,
      priority: values.priority || 0,
      rate: typeof values.rate === 'number' ? values.rate : 1.0,
      quota_limit: (!enableQuota || values.quota_limit === undefined || values.quota_limit === null) ? -1 : Number(values.quota_limit),
      daily_quota_limit: (!enableQuota || values.daily_quota_limit === undefined || values.daily_quota_limit === null) ? -1 : Number(values.daily_quota_limit),
      weekly_quota_limit: (!enableQuota || values.weekly_quota_limit === undefined || values.weekly_quota_limit === null) ? -1 : Number(values.weekly_quota_limit),
      monthly_quota_limit: (!enableQuota || values.monthly_quota_limit === undefined || values.monthly_quota_limit === null) ? -1 : Number(values.monthly_quota_limit),
      preset_id,
    };
    delete data.level_select;
    data.models = reliableModels;

    // 画质增强渠道不再存储 api_key/base_url，由后端通过 config 中的凭证 ID 实时查询
    if (data.provider_type === 'volcengine') {
      data.api_key = '';
      data.base_url = '';
    }

    try {
      if (editingChannel) {
        // 密钥未修改（与加载时原值相同）或为空时不提交，防止覆盖（画质增强例外：必须清空）
        if (data.provider_type !== 'volcengine' && (!data.api_key || data.api_key === (editingChannel as any).api_key)) {
          delete data.api_key;
        }
        await request.put(`/channels/${editingChannel.id}`, data);
        message.success(t('common.success'));
      } else {
        await request.post('/channels', data);
        message.success(t('common.success'));
      }
      handleCloseModal();
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

  /** 解析渠道 config（兼容 string / object） */
  const parseChannelConfig = (record: Channel): Record<string, any> => {
    try {
      if (!record.config) return {};
      return typeof record.config === 'string' ? JSON.parse(record.config) : record.config;
    } catch {
      return {};
    }
  };

  /** 画质增强上游：凭证名称与基址 */
  const resolveVolcEnhanceUpstream = (record: Channel) => {
    const cfg = parseChannelConfig(record);
    const credId = cfg.volcengine_enhance_credential_id;
    const cred = volcengineEnhanceKeys.find((k) => k.id === credId);
    return {
      credId,
      name: cred?.name || (credId ? `凭证 #${credId}` : '未绑定凭证'),
      baseUrl: cred?.base_url || '',
    };
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
      title: '请求优先级',
      dataIndex: 'priority',
      key: 'priority',
      sorter: (a: Channel, b: Channel) => (a.priority || 0) - (b.priority || 0),
      render: (priority: number) => <Text type="secondary" style={{ fontSize: 13 }}>{priority || 0}</Text>,
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
      width: 200,
      render: (_: any, record: Channel) => {
        const used = record.quota_used || 0;
        const limit = record.quota_limit ?? -1;
        const dailyLimit = record.daily_quota_limit ?? -1;
        const weeklyLimit = record.weekly_quota_limit ?? -1;
        const monthlyLimit = record.monthly_quota_limit ?? -1;
        const { dailyUsed, weeklyUsed, monthlyUsed } = getEffectiveChannelPeriodUsed(record, quotaTz);
        const hasPeriodic = dailyLimit >= 0 || weeklyLimit >= 0 || monthlyLimit >= 0;
        return (
          <div style={{ fontSize: 12, lineHeight: 1.6 }}>
            <div>总: {currencySymbol}{used.toFixed(6)} / {limit < 0 ? '∞' : `${currencySymbol}${Number(limit).toFixed(6)}`}</div>
            {hasPeriodic && (
              <>
                {dailyLimit >= 0 && <div>日: {dailyUsed.toFixed(6)} / {dailyLimit}</div>}
                {weeklyLimit >= 0 && <div>周: {weeklyUsed.toFixed(6)} / {weeklyLimit}</div>}
                {monthlyLimit >= 0 && <div>月: {monthlyUsed.toFixed(6)} / {monthlyLimit}</div>}
              </>
            )}
          </div>
        );
      }
    },
    {
      title: '使用上游',
      key: 'upstream',
      render: (_: any, record: Channel) => {
        if (record.provider_type === 'high_availability_group') {
          const parsed = parseChannelConfig(record);
          const subCount = parsed.sub_channels ? parsed.sub_channels.length : 0;
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Tag color={activePlugins['high_availability_channel'] ? 'purple' : 'red'} style={{ borderRadius: 4, margin: 0, fontSize: 11, width: 'fit-content' }}>
                {activePlugins['high_availability_channel'] ? '高可用' : '高可用插件未开启'}
              </Tag>
              <Text strong style={{ fontSize: 13 }}>高可用虚拟渠道组</Text>
              <Text type="secondary" style={{ fontSize: 11 }}>已绑定 {subCount} 个渠道</Text>
            </div>
          );
        }
        if (record.provider_type === 'volcengine') {
          const { name, baseUrl } = resolveVolcEnhanceUpstream(record);
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Tag color="magenta" style={{ borderRadius: 4, margin: 0, fontSize: 11, width: 'fit-content' }}>画质增强</Tag>
              <Text strong style={{ fontSize: 13 }}>{name}</Text>
              {baseUrl ? (
                <Text type="secondary" style={{ fontSize: 11 }} ellipsis={{ tooltip: baseUrl }}>
                  {baseUrl}
                </Text>
              ) : null}
            </div>
          );
        }
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
        return <Text type="secondary">-</Text>;
      }
    },
    {
      title: '渠道分类',
      dataIndex: 'category_id',
      key: 'category_id',
      render: (categoryId: number | null) => {
        const name = resolveCategoryName(categoryId);
        return name ? <Tag style={{ margin: 0 }}>{name}</Tag> : <Text type="secondary">-</Text>;
      },
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
      title: '页面排序',
      dataIndex: 'sort_order',
      key: 'sort_order',
      sorter: (a: Channel, b: Channel) => (a.sort_order || 0) - (b.sort_order || 0),
      render: (sort_order: number) => <Text type="secondary" style={{ fontSize: 13 }}>{sort_order || 0}</Text>,
    },
    {
      title: '操作',
      key: 'actions',
      align: 'center' as const,
      render: (_: unknown, record: Channel) => (
        <Space size={0} style={{ opacity: 0.8, justifyContent: 'center', width: '100%' }}>
          <Tooltip title={record.status === 1 ? '禁用' : '启用'}>
            <Button
              type="text"
              size="small"
              icon={record.status === 1
                ? <StopOutlined style={{ color: '#ff4d4f' }} />
                : <CheckCircleOutlined style={{ color: '#52c41a' }} />}
              onClick={() => handleToggleStatus(record)}
            />
          </Tooltip>
          {record.provider_type === 'high_availability_group' && (
            <Tooltip title="重置熔断">
              <Button
                type="text"
                size="small"
                icon={<ReloadOutlined style={{ color: '#1890ff' }} />}
                onClick={() => handleResetMeltdown(record.id)}
                loading={meltdownLoading[record.id]}
              />
            </Tooltip>
          )}
          <Tooltip title="测试">
            <Button
              type="text"
              size="small"
              icon={<PlayCircleOutlined />}
              onClick={() => handleTest(record)}
            />
          </Tooltip>
          <Tooltip title="清零额度">
            <Popconfirm title="确定清零该渠道的总/日/周/月已用额度吗？" onConfirm={() => handleResetQuota(record.id)}>
              <Button type="text" size="small" icon={<ClearOutlined />} />
            </Popconfirm>
          </Tooltip>
          <Tooltip title="编辑">
            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          </Tooltip>
          <Tooltip title="删除">
            <Popconfirm title={t('common.confirm_delete')} onConfirm={() => handleDelete(record.id)}>
              <Button type="text" size="small" icon={<DeleteOutlined />} danger />
            </Popconfirm>
          </Tooltip>
        </Space>
      ),
    },
  ];

  /** 仪表盘卡片：仅展示已配置限额的圆环 */
  const quotaRingPercent = (used: number, limit: number) => {
    if (limit < 0) return 0;
    if (limit === 0) return used > 0 ? 100 : 0;
    return Math.min(100, Math.round((used / limit) * 100));
  };

  const quotaRingStroke = (pct: number) => {
    if (pct >= 90) return '#ff4d4f';
    if (pct >= 70) return '#faad14';
    return isLight ? '#1677ff' : '#69b1ff';
  };

  const renderQuotaRings = (opts: {
    used: number;
    limit: number;
    dailyUsed: number;
    dailyLimit: number;
    weeklyUsed: number;
    weeklyLimit: number;
    monthlyUsed: number;
    monthlyLimit: number;
  }) => {
    const items = [
      { key: 'total', label: '总', used: opts.used, limit: opts.limit },
      { key: 'day', label: '日', used: opts.dailyUsed, limit: opts.dailyLimit },
      { key: 'week', label: '周', used: opts.weeklyUsed, limit: opts.weeklyLimit },
      { key: 'month', label: '月', used: opts.monthlyUsed, limit: opts.monthlyLimit },
    ].filter((item) => item.limit >= 0);

    if (items.length === 0) return null;

    const tip = (label: string, used: number, limit: number) =>
      `${label}：${used.toFixed(6)} / ${Number(limit).toFixed(6)}`;

    return (
      <div
        className="channel-quota-rings"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
          gap: 2,
          alignItems: 'center',
          marginTop: 2,
        }}
      >
        {items.map((item) => {
          const pct = quotaRingPercent(item.used, item.limit);
          return (
            <Tooltip key={item.key} title={tip(item.label, item.used, item.limit)}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, cursor: 'default' }}>
                <Progress
                  type="circle"
                  percent={pct}
                  size={36}
                  strokeWidth={10}
                  strokeColor={quotaRingStroke(pct)}
                  trailColor={isLight ? '#eceef2' : 'rgba(255,255,255,0.1)'}
                  format={() => (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: isLight ? 'rgba(0,0,0,0.72)' : 'rgba(255,255,255,0.88)',
                        lineHeight: 1,
                      }}
                    >
                      {pct}%
                    </span>
                  )}
                />
                <span
                  style={{
                    fontSize: 10,
                    color: isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)',
                    lineHeight: 1,
                  }}
                >
                  {item.label}
                </span>
              </div>
            </Tooltip>
          );
        })}
      </div>
    );
  };

  const hasEditParam = new URLSearchParams(window.location.search).has('edit');

  return (
    <Card variant="borderless">
      <style>{`
        .channel-card-disabled {
          opacity: 0.62;
          filter: grayscale(18%);
        }
        .channels-grid-list .ant-list-items {
          display: grid !important;
          grid-template-columns: repeat(auto-fill, minmax(248px, 1fr)) !important;
          gap: 10px !important;
        }
        .channels-grid-list .ant-list-item {
          margin: 0 !important;
          padding: 0 !important;
          width: 100% !important;
          border-block-end: none !important;
        }
        .channel-dash-card {
          transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
          cursor: default;
        }
        .channel-dash-card:hover {
          border-color: ${isLight ? 'rgba(22,119,255,0.35)' : 'rgba(105,177,255,0.35)'} !important;
          box-shadow: ${isLight ? '0 4px 14px rgba(15,23,42,0.08)' : '0 4px 16px rgba(0,0,0,0.35)'} !important;
          transform: translateY(-1px);
        }
        .channel-dash-card .channel-dash-actions {
          opacity: 0.72;
          transition: opacity 0.15s ease;
        }
        .channel-dash-card:hover .channel-dash-actions {
          opacity: 1;
        }
        .channel-dash-card .channel-dash-action-btn {
          width: 24px !important;
          height: 24px !important;
          min-width: 24px !important;
          padding: 0 !important;
          display: inline-flex !important;
          align-items: center;
          justify-content: center;
          border-radius: 6px !important;
        }
        .channel-dash-card .channel-dash-action-btn:hover {
          background: ${isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'} !important;
        }
        @keyframes meltdownPulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(255, 77, 79, 0.5); }
          50% { opacity: 0.6; box-shadow: 0 0 0 4px rgba(255, 77, 79, 0); }
        }
        .meltdown-pulse-dot {
          animation: meltdownPulse 1.5s ease-in-out infinite;
        }
      `}</style>
      {!isModalVisible ? (
        <div style={{ width: '100%' }}>
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
              <Button type="default" icon={<ApartmentOutlined />} onClick={() => navigate(`/${adminPath}/channels/model-display`)}>模型渠道显示</Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>{t('channels.add_channel')}</Button>
            </Space>
          </div>

          <div style={{
            backgroundColor: isLight ? '#fafafa' : '#141414',
            padding: '12px 16px',
            borderRadius: 8,
            marginBottom: 16,
            border: isLight ? '1px solid #e8e8e8' : '1px solid #303030',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', padding: 0 }}>
              <Text type="secondary" style={{ width: 80, flexShrink: 0, fontSize: 13 }}>渠道分类</Text>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flexGrow: 1 }}>
                {([
                  { key: 'all' as const, label: '全部', count: channels.length },
                  ...categories.map(c => ({
                    key: c.id,
                    label: c.name,
                    count: channels.filter(ch => ch.category_id === c.id).length,
                  })),
                  {
                    key: 'unclassified' as const,
                    label: '未分类',
                    count: channels.filter(ch => !ch.category_id).length,
                  },
                ] as { key: number | 'all' | 'unclassified'; label: string; count: number }[]).map(item => {
                  const selected = categoryFilter === item.key;
                  return (
                    <div
                      key={String(item.key)}
                      onClick={() => setCategoryFilter(item.key)}
                      style={{
                        padding: '4px 12px',
                        borderRadius: 16,
                        fontSize: 14,
                        backgroundColor: selected ? '#1677ff' : (isLight ? '#f0f0f0' : '#1d1d1d'),
                        color: selected ? '#fff' : (isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)'),
                        border: isLight ? '1px solid #d9d9d9' : '1px solid #303030',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        transition: 'all 0.2s',
                      }}
                    >
                      {item.label}
                      <span style={{ opacity: 0.6 }}>{item.count}</span>
                    </div>
                  );
                })}
                <Tooltip title={t('common.manage', '管理')}>
                  <Button
                    type="text"
                    size="small"
                    icon={<SettingOutlined style={{ color: '#1677ff' }} />}
                    onClick={() => setIsCategoryManagerVisible(true)}
                    style={{ marginLeft: 8 }}
                  />
                </Tooltip>
              </div>
            </div>

            {(() => {
              const typeCounts = {
                default: channels.filter(ch => getChannelTypeKey(ch) === 'default').length,
                volcengine: channels.filter(ch => getChannelTypeKey(ch) === 'volcengine').length,
                ha: channels.filter(ch => getChannelTypeKey(ch) === 'ha').length,
              };
              const typeOptions = (
                [
                  { key: 'all' as const, label: '全部', count: channels.length },
                  { key: 'default' as const, label: '预设', count: typeCounts.default },
                  { key: 'volcengine' as const, label: '画质增强', count: typeCounts.volcengine },
                  { key: 'ha' as const, label: '高可用', count: typeCounts.ha },
                ] as { key: 'all' | 'default' | 'volcengine' | 'ha'; label: string; count: number }[]
              ).filter((item) => item.key === 'all' || item.count > 0);

              if (typeOptions.length <= 1) return null;

              return (
                <div style={{ display: 'flex', alignItems: 'center', padding: 0 }}>
                  <Text type="secondary" style={{ width: 80, flexShrink: 0, fontSize: 13 }}>渠道类型</Text>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flexGrow: 1 }}>
                    {typeOptions.map((item) => {
                      const selected = typeFilter === item.key;
                      return (
                        <div
                          key={item.key}
                          onClick={() => setTypeFilter(item.key)}
                          style={{
                            padding: '4px 12px',
                            borderRadius: 16,
                            fontSize: 14,
                            backgroundColor: selected ? '#1677ff' : (isLight ? '#f0f0f0' : '#1d1d1d'),
                            color: selected ? '#fff' : (isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)'),
                            border: isLight ? '1px solid #d9d9d9' : '1px solid #303030',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            transition: 'all 0.2s',
                          }}
                        >
                          {item.label}
                          <span style={{ opacity: 0.6 }}>{item.count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
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
                const dailyLimit = record.daily_quota_limit ?? -1;
                const weeklyLimit = record.weekly_quota_limit ?? -1;
                const monthlyLimit = record.monthly_quota_limit ?? -1;
                const { dailyUsed, weeklyUsed, monthlyUsed } = getEffectiveChannelPeriodUsed(record, quotaTz);
                const hasPeriodic = dailyLimit >= 0 || weeklyLimit >= 0 || monthlyLimit >= 0;
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
                      <div style={{ fontSize: 12, lineHeight: 1.6, textAlign: 'right' }}>
                        <div>
                          总: {currencySymbol}{used.toFixed(6)} / {limit < 0 ? '∞' : `${currencySymbol}${Number(limit).toFixed(6)}`}
                        </div>
                        {hasPeriodic && (
                          <>
                            {dailyLimit >= 0 && <div>日: {dailyUsed.toFixed(6)} / {Number(dailyLimit).toFixed(6)}</div>}
                            {weeklyLimit >= 0 && <div>周: {weeklyUsed.toFixed(6)} / {Number(weeklyLimit).toFixed(6)}</div>}
                            {monthlyLimit >= 0 && <div>月: {monthlyUsed.toFixed(6)} / {Number(monthlyLimit).toFixed(6)}</div>}
                          </>
                        )}
                      </div>
                    </CardRow>
                    <CardRow label="使用上游">
                      {record.provider_type === 'high_availability_group' ? (
                        (() => {
                          const parsed = parseChannelConfig(record);
                          const subCount = parsed.sub_channels ? parsed.sub_channels.length : 0;
                          return (
                            <Space size={4}>
                              <Tag color={activePlugins['high_availability_channel'] ? 'purple' : 'red'} style={{ borderRadius: 4, margin: 0, fontSize: 10 }}>
                                {activePlugins['high_availability_channel'] ? '高可用' : '高可用插件未开启'}
                              </Tag>
                              <Text style={{ fontSize: 12 }}>
                                高可用虚拟渠道组 (已绑定 {subCount} 个渠道)
                              </Text>
                            </Space>
                          );
                        })()
                      ) : record.provider_type === 'volcengine' ? (
                        (() => {
                          const { name, baseUrl } = resolveVolcEnhanceUpstream(record);
                          return (
                            <Space size={4} wrap>
                              <Tag color="magenta" style={{ borderRadius: 4, margin: 0, fontSize: 10 }}>画质增强</Tag>
                              <Text style={{ fontSize: 12 }}>
                                {name}{baseUrl ? ` (${baseUrl})` : ''}
                              </Text>
                            </Space>
                          );
                        })()
                      ) : record.preset_id ? (
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
                      ) : (
                        <Text type="secondary">-</Text>
                      )}
                    </CardRow>
                    <CardRow label="页面排序">
                      <Text type="secondary">{record.sort_order || 0}</Text>
                    </CardRow>
                    <CardRow label="渠道分类">
                      {resolveCategoryName(record.category_id) ? (
                        <Tag style={{ margin: 0 }}>{resolveCategoryName(record.category_id)}</Tag>
                      ) : (
                        <Text type="secondary">-</Text>
                      )}
                    </CardRow>
                    <CardRow label="请求优先级">
                      <Text type="secondary">{record.priority || 0}</Text>
                    </CardRow>

                    <CardRow label="最后修改">
                      <Text type="secondary" style={{ fontSize: 12 }}>{new Date(record.updated_at || record.created_at).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</Text>
                    </CardRow>

                    {/* 熔断状态可视化（仅 HA 渠道且有熔断时显示） */}
                    {record.provider_type === 'high_availability_group' && (() => {
                      const meltdown = meltdownMap[record.id];
                      if (!meltdown) return null;
                      const meltedSubs = (meltdown.sub_channels || []).filter((s: any) => s.is_melted);
                      const channelMelted = meltdown.channel_meltdown?.is_melted;
                      const totalMelted = meltedSubs.length + (channelMelted ? 1 : 0);
                      if (totalMelted === 0) return null;
                      const totalSubs = (meltdown.sub_channels || []).length;
                      return (
                        <div style={{
                          background: isLight ? 'rgba(255, 77, 79, 0.04)' : 'rgba(255, 77, 79, 0.08)',
                          borderRadius: 6,
                          padding: '8px 10px',
                          margin: '4px 0',
                          border: isLight ? '1px solid rgba(255, 77, 79, 0.12)' : '1px solid rgba(255, 77, 79, 0.2)',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <div className="meltdown-pulse-dot" style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: '#ff4d4f', flexShrink: 0 }} />
                              <Text style={{ fontSize: 12, color: '#ff4d4f', fontWeight: 500 }}>
                                <ThunderboltOutlined style={{ marginRight: 3 }} />
                                熔断中 {meltedSubs.length}/{totalSubs} 个子渠道
                              </Text>
                            </div>
                            <Popconfirm
                              title="确定要重置所有熔断状态吗？"
                              description="重置后所有子渠道将立即恢复可用"
                              onConfirm={() => handleResetMeltdown(record.id)}
                              okText="重置"
                              cancelText="取消"
                            >
                              <Button
                                type="link"
                                size="small"
                                danger
                                loading={meltdownLoading[record.id]}
                                icon={<ReloadOutlined />}
                                style={{ padding: 0, fontSize: 12, height: 20 }}
                              >
                                重置熔断
                              </Button>
                            </Popconfirm>
                          </div>
                          {meltedSubs.map((sub: any) => (
                            <div key={sub.config_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, padding: '2px 0' }}>
                              <Text style={{ fontSize: 12, color: isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)' }} ellipsis>
                                {sub.name}
                              </Text>
                              <Tag color="red" style={{ borderRadius: 4, margin: 0, padding: '0 4px', fontSize: 10, lineHeight: '16px' }}>
                                剩余 {sub.remaining_seconds}s
                              </Tag>
                            </div>
                          ))}
                        </div>
                      );
                    })()}

                    <CardActions>
                      <Tooltip title={record.status === 1 ? '禁用' : '启用'}>
                        <Button
                          type="text"
                          size="small"
                          icon={record.status === 1
                            ? <StopOutlined style={{ color: '#ff4d4f' }} />
                            : <CheckCircleOutlined style={{ color: '#52c41a' }} />}
                          onClick={() => handleToggleStatus(record)}
                        />
                      </Tooltip>
                      {record.provider_type === 'high_availability_group' && (
                        <Tooltip title="重置熔断">
                          <Button
                            type="text"
                            size="small"
                            icon={<ReloadOutlined style={{ color: '#1890ff' }} />}
                            onClick={() => handleResetMeltdown(record.id)}
                            loading={meltdownLoading[record.id]}
                          />
                        </Tooltip>
                      )}
                      <Tooltip title="测试">
                        <Button type="text" size="small" icon={<PlayCircleOutlined />} onClick={() => handleTest(record)} />
                      </Tooltip>
                      <Tooltip title="清零额度">
                        <Popconfirm title="确定清零该渠道的总/日/周/月已用额度吗？" onConfirm={() => handleResetQuota(record.id)}>
                          <Button type="text" size="small" icon={<ClearOutlined />} />
                        </Popconfirm>
                      </Tooltip>
                      <Tooltip title="编辑">
                        <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
                      </Tooltip>
                      <Tooltip title="删除">
                        <Popconfirm title={t('common.confirm_delete')} onConfirm={() => handleDelete(record.id)}>
                          <Button type="text" size="small" icon={<DeleteOutlined />} danger />
                        </Popconfirm>
                      </Tooltip>
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
              className="channels-grid-list"
              dataSource={filteredChannels}
              loading={loading}
              pagination={{
                pageSize: 24,
                showSizeChanger: true,
                pageSizeOptions: ['24', '48', '72', '96'],
                showTotal: (total) => `共 ${total} 个渠道`,
                size: 'small',
              }}
              renderItem={(record: Channel) => {
                const used = record.quota_used || 0;
                const limit = record.quota_limit ?? -1;
                const dailyLimit = record.daily_quota_limit ?? -1;
                const weeklyLimit = record.weekly_quota_limit ?? -1;
                const monthlyLimit = record.monthly_quota_limit ?? -1;
                const { dailyUsed, weeklyUsed, monthlyUsed } = getEffectiveChannelPeriodUsed(record, quotaTz);

                const groups = record.user_groups || [];
                const excludeGroups = record.exclude_user_groups || [];
                const resolveName = (idStr: string) => {
                  const lv = availableUserLevels.find((l: any) => l.id.toString() === idStr || l.group_key === idStr);
                  return lv ? lv.name : idStr;
                };
                const levelIds = excludeGroups.length > 0 ? excludeGroups : groups;
                const levelMode = excludeGroups.length > 0 ? 'exclude' : (!groups.length ? 'all' : 'allow');
                const visibleLevels = levelIds.slice(0, 2);
                const moreLevels = levelIds.length - visibleLevels.length;

                const isHa = record.provider_type === 'high_availability_group';
                const hasMeltdown = isHa && meltdownMap[record.id] && (
                  (meltdownMap[record.id].sub_channels || []).some((s: any) => s.is_melted)
                  || meltdownMap[record.id].channel_meltdown?.is_melted
                );
                const categoryName = resolveCategoryName(record.category_id);

                let upstreamTag: React.ReactNode = (
                  <Tag style={{ margin: 0, padding: '0 5px', fontSize: 10, lineHeight: '18px', borderRadius: 4 }}>无上游</Tag>
                );
                if (isHa) {
                  const parsed = parseChannelConfig(record);
                  const subIds = parsed.sub_channels || [];
                  const boundChannels = subIds.map((id: any) => {
                    const p = presets.find((x: any) => x.id === id);
                    return p ? `- ${p.name} (YID: ${p.yid || '无'})` : `- 未知渠道 (ID: ${id})`;
                  });
                  const tip = boundChannels.length > 0
                    ? `高可用虚拟渠道组，已绑定:\n${boundChannels.join('\n')}`
                    : '高可用虚拟渠道组 (未绑定上游)';
                  upstreamTag = (
                    <Tooltip title={<div style={{ whiteSpace: 'pre-wrap' }}>{tip}</div>}>
                      <Tag color={activePlugins['high_availability_channel'] ? 'purple' : 'red'} style={{ margin: 0, padding: '0 5px', fontSize: 10, lineHeight: '18px', borderRadius: 4 }}>
                        {activePlugins['high_availability_channel'] ? `高可用 · ${subIds.length}` : '高可用未开启'}
                      </Tag>
                    </Tooltip>
                  );
                } else if (record.provider_type === 'volcengine') {
                  const { name, baseUrl } = resolveVolcEnhanceUpstream(record);
                  upstreamTag = (
                    <Tooltip title={<div style={{ whiteSpace: 'pre-wrap' }}>{baseUrl ? `画质增强: ${name}\n${baseUrl}` : `画质增强: ${name}`}</div>}>
                      <Tag color="magenta" style={{ margin: 0, padding: '0 5px', fontSize: 10, lineHeight: '18px', borderRadius: 4 }}>画质增强</Tag>
                    </Tooltip>
                  );
                } else if (record.preset_id) {
                  const preset = presets.find(p => p.id === record.preset_id);
                  upstreamTag = (
                    <Tooltip title={preset ? `预设: ${preset.name} (YID: ${preset.yid || '无'})` : '未知预设'}>
                      <Tag color="cyan" style={{ margin: 0, padding: '0 5px', fontSize: 10, lineHeight: '18px', borderRadius: 4 }}>预设</Tag>
                    </Tooltip>
                  );
                }

                return (
                  <List.Item style={{ height: '100%', marginBottom: 0, width: '100%' }}>
                    <Card
                      className={`channel-dash-card${record.status === 0 ? ' channel-card-disabled' : ''}`}
                      onDoubleClick={() => handleEdit(record)}
                      style={{
                        background: isLight ? '#fff' : '#1a1a1a',
                        borderRadius: 8,
                        border: isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.1)',
                        boxShadow: 'none',
                        display: 'flex',
                        flexDirection: 'column',
                        width: '100%',
                        height: '100%',
                        ...(hasMeltdown ? { borderLeft: '3px solid #ff4d4f' } : {}),
                      }}
                      styles={{ body: { padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6, flex: 1 } }}
                    >
                      {/* 头部：状态 + 名称 */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 24 }}>
                        <Tooltip title={record.status === 1 ? '点击禁用' : '点击启用'}>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleToggleStatus(record); }}
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              border: 'none',
                              padding: 0,
                              flexShrink: 0,
                              cursor: 'pointer',
                              backgroundColor: record.status === 1 ? '#52c41a' : (isLight ? '#d1d5db' : 'rgba(255,255,255,0.28)'),
                            }}
                            aria-label={record.status === 1 ? '禁用' : '启用'}
                          />
                        </Tooltip>
                        <Tooltip title={`${record.name}${record.group_aid ? ` · AID ${record.group_aid}` : ''}（双击编辑）`}>
                          <Text
                            strong
                            onClick={() => handleEdit(record)}
                            style={{
                              flex: 1,
                              minWidth: 0,
                              fontSize: 13,
                              lineHeight: '20px',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              color: isLight ? '#111827' : '#f3f4f6',
                              cursor: 'pointer',
                            }}
                          >
                            {record.name}
                          </Text>
                        </Tooltip>
                      </div>

                      {/* 标签行：上游 + 等级 */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', minHeight: 20 }}>
                        {upstreamTag}
                        {levelMode === 'all' ? (
                          <Tag color="green" style={{ margin: 0, padding: '0 5px', fontSize: 10, lineHeight: '18px', borderRadius: 4 }}>全部等级</Tag>
                        ) : (
                          <>
                            {levelMode === 'exclude' && (
                              <Tag color="orange" style={{ margin: 0, padding: '0 5px', fontSize: 10, lineHeight: '18px', borderRadius: 4 }}>排除</Tag>
                            )}
                            {visibleLevels.map((id: string) => (
                              <Tag
                                key={id}
                                color={levelMode === 'exclude' ? 'red' : 'blue'}
                                style={{ margin: 0, padding: '0 5px', fontSize: 10, lineHeight: '18px', borderRadius: 4, maxWidth: 72, overflow: 'hidden', textOverflow: 'ellipsis' }}
                              >
                                {resolveName(id)}
                              </Tag>
                            ))}
                            {moreLevels > 0 && (
                              <Tooltip title={levelIds.slice(2).map(resolveName).join('、')}>
                                <Tag style={{ margin: 0, padding: '0 5px', fontSize: 10, lineHeight: '18px', borderRadius: 4 }}>+{moreLevels}</Tag>
                              </Tooltip>
                            )}
                          </>
                        )}
                      </div>

                      {/* 元信息一行 */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 11,
                          color: isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)',
                          lineHeight: 1.2,
                          minHeight: 16,
                        }}
                      >
                        <span>优先级 {record.priority || 0}</span>
                        <span style={{ opacity: 0.45 }}>·</span>
                        <span>排序 {record.sort_order || 0}</span>
                        {categoryName && (
                          <>
                            <span style={{ opacity: 0.45 }}>·</span>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 72 }}>{categoryName}</span>
                          </>
                        )}
                      </div>

                      {/* 熔断条（仅有熔断时） */}
                      {hasMeltdown && (() => {
                        const meltdown = meltdownMap[record.id];
                        const meltedSubs = (meltdown.sub_channels || []).filter((s: any) => s.is_melted);
                        const totalSubs = (meltdown.sub_channels || []).length;
                        return (
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 6,
                              background: isLight ? 'rgba(255,77,79,0.05)' : 'rgba(255,77,79,0.1)',
                              borderRadius: 6,
                              padding: '4px 8px',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                              <div className="meltdown-pulse-dot" style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#ff4d4f', flexShrink: 0 }} />
                              <Text style={{ fontSize: 11, color: '#ff4d4f', fontWeight: 500 }} ellipsis>
                                熔断 {meltedSubs.length}/{totalSubs}
                              </Text>
                            </div>
                            <Popconfirm
                              title="确定重置所有熔断？"
                              onConfirm={() => handleResetMeltdown(record.id)}
                              okText="重置"
                              cancelText="取消"
                            >
                              <Button type="link" size="small" danger loading={meltdownLoading[record.id]} style={{ padding: 0, height: 18, fontSize: 11 }}>
                                重置
                              </Button>
                            </Popconfirm>
                          </div>
                        );
                      })()}

                      {/* 额度环图（仅已配置） */}
                      <div style={{ marginTop: 'auto' }}>
                        {renderQuotaRings({
                          used,
                          limit,
                          dailyUsed,
                          dailyLimit,
                          weeklyUsed,
                          weeklyLimit,
                          monthlyUsed,
                          monthlyLimit,
                        })}
                      </div>

                      {/* 底栏：AID + 操作 */}
                      <div
                        className="channel-dash-actions"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 6,
                          marginTop: 2,
                          paddingTop: 6,
                          borderTop: isLight ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(255,255,255,0.08)',
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Text
                          type="secondary"
                          style={{
                            flex: 1,
                            minWidth: 0,
                            fontSize: 11,
                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                            opacity: 0.75,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            margin: 0,
                          }}
                        >
                          {record.group_aid ? `AID ${record.group_aid}` : '—'}
                        </Text>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                          {isHa && (
                            <Tooltip title="重置熔断">
                              <Button
                                className="channel-dash-action-btn"
                                type="text"
                                size="small"
                                icon={<ReloadOutlined style={{ fontSize: 12, color: '#1677ff' }} />}
                                loading={meltdownLoading[record.id]}
                                onClick={() => handleResetMeltdown(record.id)}
                              />
                            </Tooltip>
                          )}
                          <Tooltip title="测试">
                            <Button
                              className="channel-dash-action-btn"
                              type="text"
                              size="small"
                              icon={<PlayCircleOutlined style={{ fontSize: 12 }} />}
                              onClick={() => handleTest(record)}
                            />
                          </Tooltip>
                          <Tooltip title="编辑">
                            <Button
                              className="channel-dash-action-btn"
                              type="text"
                              size="small"
                              icon={<EditOutlined style={{ fontSize: 12 }} />}
                              onClick={() => handleEdit(record)}
                            />
                          </Tooltip>
                          <Popconfirm title={t('common.confirm_delete')} onConfirm={() => handleDelete(record.id)}>
                            <Tooltip title="删除">
                              <Button
                                className="channel-dash-action-btn"
                                type="text"
                                size="small"
                                danger
                                icon={<DeleteOutlined style={{ fontSize: 12 }} />}
                              />
                            </Tooltip>
                          </Popconfirm>
                        </div>
                      </div>
                    </Card>
                  </List.Item>
                );
              }}
            />
          )}
        </div>
      ) : (
        <div style={{ animation: 'fadeIn 0.3s' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24, gap: 16 }}>
            <Button icon={<ArrowLeftOutlined />} onClick={() => handleCloseModal()}>返回</Button>
            <Title level={3} style={{ margin: 0 }}>
              {editingChannel ? t('channels.edit_channel') : t('channels.add_channel')}
            </Title>
          </div>
          <div style={{ maxWidth: 1600, width: '100%' }}>
            <Spin spinning={hasEditParam && !editingChannel} size="large">
              <Form form={form} layout="vertical" onFinish={handleSave} preserve={true}>
              <Row gutter={24}>
                {/* 左侧基本配置栏 */}
                <Col xs={24} md={10} xl={10}>
                  <div style={{ padding: 16, background: isLight ? '#f9fafb' : 'rgba(255,255,255,0.04)', borderRadius: 8, height: '100%', position: 'sticky', top: 24 }}>
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
                        <Form.Item name="category_id" label={<Text strong>渠道分类</Text>}>
                          <Select
                            allowClear
                            placeholder="选择分类"
                            options={activeCategories.map(c => ({ label: c.name, value: c.id }))}
                            dropdownRender={(menu) => (
                              <>
                                {menu}
                                <Divider style={{ margin: '8px 0' }} />
                                <Button
                                  type="link"
                                  icon={<SettingOutlined />}
                                  onClick={() => setIsCategoryManagerVisible(true)}
                                  style={{ width: '100%' }}
                                >
                                  管理分类
                                </Button>
                              </>
                            )}
                          />
                        </Form.Item>
                      </Col>
                    </Row>

                    <Form.Item name="status" label={<Text strong>状态</Text>} initialValue={1}>
                      <Select>
                        <Option value={1}>启用</Option>
                        <Option value={0}>禁用</Option>
                      </Select>
                    </Form.Item>

                    <Form.Item name="provider_type" style={{ display: 'none' }}><Input /></Form.Item>
                    <Form.Item name="preset_id" style={{ display: 'none' }}><Input /></Form.Item>
                    <Form.Item name="api_key" style={{ display: 'none' }}><Input /></Form.Item>
                    <Form.Item name="base_url" style={{ display: 'none' }}><Input /></Form.Item>

                    <Form.Item shouldUpdate={(prev, curr) => 
                      prev.preset_id !== curr.preset_id || 
                      prev.provider_type !== curr.provider_type ||
                      prev.api_key !== curr.api_key
                    } noStyle>
                      {() => {
                        const providerType = form.getFieldValue('provider_type');
                        const currentPreset = form.getFieldValue('preset_id');
                        const isActive = activeRightPanel === 'presets';

                        let displayType = '无';
                        let displayName = '未选择';
                        let displayDetail: React.ReactNode = '';
                        let displayRate: React.ReactNode = null;

                        if (providerType === 'high_availability_group') {
                          displayType = '高可用组';
                          displayName = '高可用虚拟渠道组';
                          displayDetail = `已绑定 ${selectedSubChannelAids.length} 个渠道`;
                        } else if (currentPreset) {
                          const preset = presets.find(p => p.id === currentPreset);
                          displayType = '预设渠道';
                          displayName = preset ? preset.name : '未知预设';
                          displayDetail = preset?.yid ? `YID: ${preset.yid}` : `ID: ${currentPreset}`;
                          if (preset) {
                            displayRate = <Tag color="orange" style={{ margin: 0, borderRadius: 4, fontSize: 10, padding: '0 4px', lineHeight: '18px', border: 'none' }}>倍率: {preset.rate ?? 1.0}x</Tag>;
                          }
                        } else if (providerType === 'volcengine') {
                          displayType = '画质增强';
                          const credId = configObj.volcengine_enhance_credential_id;
                          const cred = volcengineEnhanceKeys.find(k => k.id === credId);
                          displayName = cred ? cred.name : '画质增强密钥';
                          displayDetail = cred ? `基址: ${cred.base_url || '-'}` : '';
                        }

                        return (
                          <div 
                            onClick={() => setActiveRightPanel('presets')} 
                            style={{ 
                              padding: '12px 16px', 
                              borderRadius: 8, 
                              border: isActive ? '1px solid var(--text)' : (isLight ? '1px solid #e5e4e7' : '1px solid rgba(255,255,255,0.08)'), 
                              background: isActive ? (isLight ? '#f9fafb' : 'rgba(255,255,255,0.04)') : (isLight ? '#fff' : 'rgba(255,255,255,0.02)'), 
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
                                  <Tag
                                    color={
                                      providerType === 'high_availability_group'
                                        ? 'purple'
                                        : providerType === 'volcengine'
                                          ? 'magenta'
                                          : 'cyan'
                                    }
                                    style={{ margin: 0, borderRadius: 4 }}
                                  >
                                    {displayType}
                                  </Tag>
                                ) : '未选择'}
                                <ArrowRightOutlined style={{ marginLeft: 4 }} />
                              </span>
                            </div>
                            {displayType !== '无' && (
                              <>
                                <div style={{ marginTop: 8, padding: '6px 8px', background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)', borderRadius: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 8 }}>
                                    {displayName}
                                  </span>
                                  <Space size={6} style={{ flexShrink: 0, alignItems: 'center' }}>
                                    {displayRate}
                                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{displayDetail}</span>
                                    <Button 
                                      type="text" 
                                      size="small" 
                                      icon={<CloseOutlined style={{ fontSize: 10 }} />} 
                                      style={{ width: 20, height: 20, minWidth: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', margin: 0, padding: 0 }}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedSubChannelAids([]);
                                        form.setFieldsValue({
                                          preset_id: null,
                                          provider_type: 'custom'
                                        });
                                      }}
                                    />
                                  </Space>
                                </div>
                                {providerType === 'high_availability_group' && selectedSubChannelAids.length > 0 && (
                                  <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }} onClick={(e) => e.stopPropagation()}>
                                    {presets
                                      .filter(p => selectedSubChannelAids.includes(p.id))
                                      .map((p) => (
                                        <div 
                                          key={p.id} 
                                          style={{ 
                                            display: 'flex', 
                                            justifyContent: 'space-between', 
                                            alignItems: 'center', 
                                            padding: '4px 8px', 
                                            background: isLight ? 'rgba(0,0,0,0.015)' : 'rgba(255,255,255,0.015)', 
                                            borderRadius: 4,
                                            border: isLight ? '1px dashed rgba(0,0,0,0.06)' : '1px dashed rgba(255,255,255,0.06)'
                                          }}
                                        >
                                          <div style={{ display: 'flex', alignItems: 'center', overflow: 'hidden', maxWidth: '50%' }}>
                                            <span style={{ fontSize: 11, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.name}>
                                              {p.name}
                                            </span>
                                            {p.yid && (
                                              <Typography.Text keyboard style={{ color: '#1677ff', fontSize: 10, margin: 0, padding: '0 4px', lineHeight: '14px', marginLeft: 6, flexShrink: 0 }}>YID: {p.yid}</Typography.Text>
                                            )}
                                          </div>
                                          <Space size={4} style={{ flexShrink: 0 }}>
                                            <Tag color="orange" style={{ margin: 0, fontSize: 10, lineHeight: '14px', height: 16, padding: '0 4px', borderRadius: 2 }}>倍率: {p.rate ?? 1.0}x</Tag>
                                            <Tag color="blue" style={{ margin: 0, fontSize: 10, lineHeight: '14px', height: 16, padding: '0 4px', borderRadius: 2 }}>请求优先级: {(p as any).priority ?? 0}</Tag>
                                            <Tag color="cyan" style={{ margin: 0, fontSize: 10, lineHeight: '14px', height: 16, padding: '0 4px', borderRadius: 2 }}>请求权重: {(p as any).weight ?? 1}</Tag>
                                          </Space>
                                        </div>
                                      ))
                                    }
                                  </div>
                                )}
                              </>
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
                            onSwitchMode={(val: any) => {
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
                            onSelectNode={(nodeVal: any) => {
                              setSelectedRoutingNode(nodeVal);
                              handleModelsChange([nodeVal]);
                            }}
                            isLight={isLight}
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
                                  isLight={isLight}
                                  onClick={() => setActiveRightPanel('models')}
                                />
                              );
                            }

                            return (
                              <div onClick={() => setActiveRightPanel('models')} style={{ padding: '12px 16px', borderRadius: 8, border: isActive ? '1px solid var(--text)' : (isLight ? '1px solid #e5e4e7' : '1px solid rgba(255,255,255,0.08)'), background: isActive ? (isLight ? '#f9fafb' : 'rgba(255,255,255,0.04)') : (isLight ? '#fff' : 'rgba(255,255,255,0.02)'), cursor: 'pointer', transition: 'all 0.2s' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: m.length > 0 ? 8 : 0 }}>
                                  <Text strong={isActive} style={{ color: isActive ? 'var(--text)' : 'inherit' }}>选择模型</Text>
                                  <span style={{ fontSize: 12, color: isActive ? 'var(--text)' : 'var(--text-secondary)' }}>已选 {m.length} 个 <ArrowRightOutlined style={{ marginLeft: 4 }} /></span>
                                </div>
                                {m.length > 0 && (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto', paddingRight: 4 }}>
                                    {m.map((mid: string) => {
                                      const match = availableModels.find((model: any) => model.mid === mid);
                                      return (
                                        <div key={mid} style={{ padding: '6px 8px', background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)', borderRadius: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                          <span style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 8 }}>
                                            {match ? match.name : mid}
                                            {(!match || match.is_active === 0) && <Tag color="error" bordered={false} style={{ borderRadius: 4, margin: 0, padding: '0 4px', fontSize: 10, lineHeight: '18px', marginLeft: 8 }}>已禁用</Tag>}
                                            {match && match.remark && <span style={{ color: 'var(--text-secondary)', fontWeight: 'normal', marginLeft: 4 }}>({match.remark})</span>}
                                          </span>
                                          <Space size={4} style={{ flexShrink: 0 }}>
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
                            const providerType = form.getFieldValue('provider_type');
                            const isHaMode = providerType === 'high_availability_group';
                            // 统计 HA 子渠道独立映射数量
                            const haMappingCount = isHaMode ? Object.values(haModelMappingState).reduce((sum, subMap) => 
                              sum + Object.values(subMap).filter(v => v && String(v).trim()).length, 0) : 0;
                            return (
                              <div onClick={() => setActiveRightPanel('mapping')} style={{ padding: '12px 16px', borderRadius: 8, border: isActive ? '1px solid var(--text)' : (isLight ? '1px solid #e5e4e7' : '1px solid rgba(255,255,255,0.08)'), background: isActive ? (isLight ? '#f9fafb' : 'rgba(255,255,255,0.04)') : (isLight ? '#fff' : 'rgba(255,255,255,0.02)'), cursor: 'pointer', transition: 'all 0.2s' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: (showMapping && (mappedEntries.length > 0 || haMappingCount > 0)) ? 8 : 0 }}>
                                  <Text strong={isActive} style={{ color: isActive ? 'var(--text)' : 'inherit' }}>模型别名映射</Text>
                                  <span style={{ fontSize: 12, color: isActive ? 'var(--text)' : 'var(--text-secondary)' }}>
                                    {showMapping ? <span style={{ fontWeight: 500 }}>已开启 {(mappedEntries.length + haMappingCount) > 0 ? `(${mappedEntries.length}${haMappingCount > 0 ? `+${haMappingCount}` : ''})` : ''}</span> : <span>未开启</span>} <ArrowRightOutlined style={{ marginLeft: 4 }} />
                                  </span>
                                </div>
                                {showMapping && mappedEntries.length > 0 && (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {mappedEntries.slice(0, 8).map(([k, v]) => (
                                      <div key={k} style={{ padding: '6px 8px', background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)', borderRadius: 4, display: 'flex', alignItems: 'center' }}>
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
                                {showMapping && isHaMode && haMappingCount > 0 && (
                                  <div style={{ padding: '6px 8px', background: isLight ? 'rgba(22,119,255,0.04)' : 'rgba(22,119,255,0.08)', borderRadius: 4, marginTop: mappedEntries.length > 0 ? 6 : 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <ApartmentOutlined style={{ fontSize: 11, color: '#1677ff' }} />
                                    <span style={{ fontSize: 11, color: '#1677ff', fontWeight: 500 }}>子渠道独立映射: {haMappingCount} 条</span>
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
                              <div onClick={() => setActiveRightPanel('levels')} style={{ padding: '12px 16px', borderRadius: 8, border: isActive ? '1px solid var(--text)' : (isLight ? '1px solid #e5e4e7' : '1px solid rgba(255,255,255,0.08)'), background: isActive ? (isLight ? '#f9fafb' : 'rgba(255,255,255,0.04)') : (isLight ? '#fff' : 'rgba(255,255,255,0.02)'), cursor: 'pointer', transition: 'all 0.2s' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: levels.length > 0 ? 8 : 0 }}>
                                  <Text strong={isActive} style={{ color: isActive ? 'var(--text)' : 'inherit' }}>{isExcludeMode ? '不支持用户等级' : '支持用户等级'}</Text>
                                  <span style={{ fontSize: 12, color: isActive ? 'var(--text)' : 'var(--text-secondary)' }}>
                                    <Tag style={{ marginRight: 4, border: 'none', background: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.1)', color: 'var(--text)' }}>{isExcludeMode ? '排除模式' : '允许模式'}</Tag>
                                    <ArrowRightOutlined />
                                  </span>
                                </div>
                                {levels.length > 0 ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {levels.slice(0, 8).map((idStr: string) => {
                                      const lv = availableUserLevels.find((l: any) => l.id.toString() === idStr || l.group_key === idStr);
                                      return (
                                      <div key={idStr} style={{ padding: '6px 8px', background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)', borderRadius: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 8 }}>{lv ? `${lv.name} (${lv.discount}x)` : '未知等级'}</span>
                                        <Space size={4} style={{ flexShrink: 0 }}>
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
                        <Col span={24}>
                          <Form.Item label="额度配置" style={{ marginBottom: 12 }}>
                            <Switch 
                              checked={enableQuota}
                              onChange={(checked) => {
                                setEnableQuota(checked);
                                if (!checked) {
                                  form.setFieldsValue({
                                    quota_limit: -1,
                                    daily_quota_limit: -1,
                                    weekly_quota_limit: -1,
                                    monthly_quota_limit: -1,
                                  });
                                } else {
                                  form.setFieldsValue({
                                    quota_limit: -1,
                                    daily_quota_limit: -1,
                                    weekly_quota_limit: -1,
                                    monthly_quota_limit: -1,
                                  });
                                }
                              }}
                              checkedChildren="已开启限额"
                              unCheckedChildren="默认不限额"
                            />
                          </Form.Item>
                        </Col>
                        {enableQuota && (
                          <>
                            <Col span={12}>
                              <Form.Item name="quota_limit" label="总额度" initialValue={-1} extra="-1 表示无限额">
                                <InputNumber 
                                  min={-1} 
                                  style={{ width: '100%' }} 
                                  formatter={(val) => (val === -1 || String(val) === '-1') ? '无限额' : `${val}`}
                                  parser={parseQuotaLimitInput}
                                />
                              </Form.Item>
                            </Col>
                            <Col span={12}>
                              <Form.Item name="daily_quota_limit" label="日额度" initialValue={-1} extra="-1 表示不限制">
                                <InputNumber
                                  min={-1}
                                  style={{ width: '100%' }}
                                  formatter={(val) => (val === -1 || String(val) === '-1') ? '不限制' : `${val}`}
                                  parser={parseQuotaLimitInput}
                                />
                              </Form.Item>
                            </Col>
                            <Col span={12}>
                              <Form.Item name="weekly_quota_limit" label="周额度" initialValue={-1} extra="-1 表示不限制">
                                <InputNumber
                                  min={-1}
                                  style={{ width: '100%' }}
                                  formatter={(val) => (val === -1 || String(val) === '-1') ? '不限制' : `${val}`}
                                  parser={parseQuotaLimitInput}
                                />
                              </Form.Item>
                            </Col>
                            <Col span={12}>
                              <Form.Item name="monthly_quota_limit" label="月额度" initialValue={-1} extra="-1 表示不限制">
                                <InputNumber
                                  min={-1}
                                  style={{ width: '100%' }}
                                  formatter={(val) => (val === -1 || String(val) === '-1') ? '不限制' : `${val}`}
                                  parser={parseQuotaLimitInput}
                                />
                              </Form.Item>
                            </Col>
                          </>
                        )}
                      </Row>
                      <Form.Item name="rate" initialValue={1.0} style={{ display: 'none' }}><InputNumber /></Form.Item>

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
                  <div style={{ padding: 24, background: isLight ? '#fff' : 'rgba(255,255,255,0.02)', border: isLight ? '1px solid #e5e4e7' : '1px solid rgba(255,255,255,0.08)', borderRadius: 8, minHeight: 600 }}>
                    
                    <div style={{ display: activeRightPanel === 'models' ? 'block' : 'none', animation: 'fadeIn 0.2s' }}>
                      {/* Plugin: happyhorse_router 右侧详情面板（插件可移除） */}
                      {isHappyHorseRouting && hhModule ? (() => {
                        const activeConfig = happyHorseConfigs.find((c: any) => c.routing_node === selectedRoutingNode);
                        return (
                          <hhModule.HappyHorseDetailPanel
                            activeConfig={activeConfig || null}
                            selectedNode={selectedRoutingNode}
                            isLight={isLight}
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
                            isLightTheme={isLight}
                            title="选择模型"
                          />
                        </>
                      )}
                    </div>

                    <div style={{ display: activeRightPanel === 'presets' ? 'block' : 'none', animation: 'fadeIn 0.2s' }}>
                      <Form.Item shouldUpdate={(prev, curr) => 
                        prev.provider_type !== curr.provider_type || 
                        prev.preset_id !== curr.preset_id ||
                        prev.api_key !== curr.api_key
                      } noStyle>
                        {() => {
                          const providerType = form.getFieldValue('provider_type');
                          return (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
                              <Title level={4} style={{ margin: 0 }}>选择上游渠道</Title>
                              <Space size={8} style={{ flexWrap: 'wrap' }}>
                                {/* 按钮一：高可用虚拟渠道组 */}
                                <Tooltip title={!activePlugins['high_availability_channel'] ? '高可用上游渠道系统插件未开启' : ''}>
                                  <Button
                                    type={providerType === 'high_availability_group' ? 'primary' : 'dashed'}
                                    icon={<ApartmentOutlined />}
                                    size="small"
                                    disabled={!activePlugins['high_availability_channel'] && providerType !== 'high_availability_group'}
                                    onClick={() => {
                                      if (providerType === 'high_availability_group') {
                                        // 若已是高可用组，点击则取消选择
                                        setSelectedSubChannelAids([]);
                                        form.setFieldsValue({
                                          preset_id: null,
                                          provider_type: 'custom'
                                        });
                                      } else {
                                        if (!activePlugins['high_availability_channel']) {
                                          message.warning('高可用上游渠道系统插件未开启');
                                          return;
                                        }
                                        // 一键设置为高可用虚拟组
                                        setSelectedSubChannelAids([]);
                                        setUpstreamTab('preset'); // 强制切回预设渠道
                                        form.setFieldsValue({
                                          preset_id: -99, // 对应预设 ID
                                          rate: 1.0,
                                          provider_type: 'high_availability_group'
                                        });
                                      }
                                    }}
                                  >
                                    {providerType === 'high_availability_group' ? '已开启高可用上游渠道' : '开启高可用上游渠道'}
                                  </Button>
                                </Tooltip>

                                {/* 按钮四：画质增强渠道 (仅在启用时展示) */}
                                {activePlugins['volcengine_enhance'] && (
                                  <Button
                                    type={upstreamTab === 'volcengine_enhance' ? 'primary' : 'dashed'}
                                    icon={<SettingOutlined />}
                                    size="small"
                                    onClick={() => {
                                      if (upstreamTab === 'volcengine_enhance') {
                                        clearVolcengineEnhance();
                                      } else {
                                        setUpstreamTab('volcengine_enhance');
                                        setSelectedSubChannelAids([]);
                                        form.setFieldsValue({
                                          preset_id: null,
                                          provider_type: 'custom'
                                        });
                                      }
                                    }}
                                  >
                                    {upstreamTab === 'volcengine_enhance' ? '已开启火山画质增强渠道' : '开启火山画质增强渠道'}
                                  </Button>
                                )}
                              </Space>
                            </div>
                          );
                        }}
                      </Form.Item>

                      <Form.Item shouldUpdate={(prev, curr) => prev.preset_id !== curr.preset_id || prev.provider_type !== curr.provider_type} noStyle>
                        {() => {
                          const providerType = form.getFieldValue('provider_type');
                          const currentPreset = form.getFieldValue('preset_id');

                          if (providerType === 'high_availability_group') {
                            const subCandidates = presets.filter(p => 
                              p.id !== -99 && 
                              (
                                p.name?.toLowerCase().includes(presetSearchText.toLowerCase()) || 
                                p.provider_type?.toLowerCase().includes(presetSearchText.toLowerCase()) ||
                                String(p.id).includes(presetSearchText)
                              )
                            );

                            return (
                              <>
                                {/* 搜索框 */}
                                <div style={{ marginBottom: 10 }}>
                                  <Input
                                    placeholder="输入关键字搜索上游渠道配置名称、类型或 YID/ID..."
                                    allowClear
                                    prefix={<SearchOutlined style={{ color: 'var(--text-secondary)' }} />}
                                    value={presetSearchText}
                                    onChange={(e) => setPresetSearchText(e.target.value)}
                                  />
                                </div>

                                <div style={{ marginBottom: 10 }}>
                                  <Alert
                                    message="高可用上游多选绑定"
                                    description={`您可以选择最多 ${haMaxRetries} 个上游配置绑定到该虚拟组。系统优先使用「请求优先级priority」最高的一组渠道；若最高优先级渠道有多个，则按它们各自的「请求权重weight」比例随机分流。选满 ${haMaxRetries} 个后，其余配置将被置灰。`}
                                    type="info"
                                    showIcon
                                    style={{ borderRadius: 6 }}
                                  />
                                </div>

                                <div style={{ marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Text strong>
                                    绑定物理上游 ({selectedSubChannelAids.length} / {haMaxRetries})
                                  </Text>
                                  {selectedSubChannelAids.length === 0 && (
                                    <span style={{ color: '#ff4d4f', fontSize: 12, fontWeight: 500 }}>
                                      请至少绑定一个上游配置
                                    </span>
                                  )}
                                </div>

                                {subCandidates.length === 0 ? (
                                  <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-secondary)', border: '1px dashed #e5e4e7', borderRadius: 8 }}>
                                    暂无可绑定的上游渠道配置（请检查并先在左侧选择或者全局配置中创建）
                                  </div>
                                ) : (
                                  <div style={{ 
                                    maxHeight: 'calc(100vh - 320px)', minHeight: '400px', 
                                    overflowY: 'auto', 
                                    background: isLight ? 'rgba(0,0,0,0.01)' : 'rgba(255,255,255,0.01)', 
                                    padding: '6px', 
                                    borderRadius: 8, 
                                    border: isLight ? '1px solid #e5e4e7' : '1px solid rgba(255,255,255,0.08)' 
                                  }}>
                                    <Space direction="vertical" style={{ width: '100%' }} size={4}>
                                      {subCandidates.map(c => {
                                        const aid = c.id;
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
                                              padding: '6px 10px', 
                                              borderRadius: 6,
                                              background: isChecked ? (isLight ? 'rgba(22,119,255,0.08)' : 'rgba(22,119,255,0.15)') : 'transparent',
                                              border: isChecked ? '1px solid #91caff' : (isLight ? '1px solid #e5e4e7' : '1px solid rgba(255,255,255,0.08)'),
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
                                              <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 8 }}>
                                                {c.provider_type ? `(${c.provider_type})` : ''}
                                              </span>
                                              <Typography.Text keyboard style={{ color: '#1677ff', fontSize: 11, marginLeft: 8 }}>YID: {c.yid || '-'}</Typography.Text>
                                            </Checkbox>
                                            <Space size={4}>
                                               <Tag color="orange" style={{ margin: 0, fontSize: 11, borderRadius: 4 }}>倍率: {c.rate ?? 1.0}x</Tag>
                                               <Tag color="blue" style={{ margin: 0, fontSize: 11, borderRadius: 4 }}>请求优先级: {(c as any).priority ?? 0}</Tag>
                                               <Tag color="cyan" style={{ margin: 0, fontSize: 11, borderRadius: 4 }}>请求权重: {(c as any).weight ?? 1}</Tag>
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
                            items = presets.filter(p => p.id !== -99 && p.provider_type !== 'high_availability_group' && (
                              p.name?.toLowerCase().includes(presetSearchText.toLowerCase()) || 
                              p.provider_type?.toLowerCase().includes(presetSearchText.toLowerCase()) || 
                              String(p.id).includes(presetSearchText) ||
                              (p.yid && String(p.yid).includes(presetSearchText))
                            ));
                          } else if (upstreamTab === 'volcengine_enhance') {
                            items = volcengineEnhanceKeys.filter(p =>
                              p.name?.toLowerCase().includes(presetSearchText.toLowerCase()) ||
                              p.api_key?.toLowerCase().includes(presetSearchText.toLowerCase())
                            );
                          }

                          return (
                            <>


                              {/* 2. 搜索框 */}
                              <div style={{ marginBottom: 10 }}>
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
                                <div style={{ 
                                  maxHeight: 'calc(100vh - 320px)', minHeight: '400px', 
                                  overflowY: 'auto', 
                                  paddingRight: 4 
                                }}>
                                  <Space direction="vertical" style={{ width: '100%' }} size={4}>

                                    {items.map((item) => {
                                      let isSelected = false;
                                      let cardTitle = item.name;
                                      let cardSubtitle = '';
                                      let extraTag = null;

                                      if (upstreamTab === 'preset') {
                                        isSelected = currentPreset === item.id;
                                        cardSubtitle = item.yid ? `YID: ${item.yid}` : 'YID: -';
                                        extraTag = (
                                          <Space size={4}>
                                             <Tag color="default" style={{ margin: 0, fontSize: 11, borderRadius: 4 }}>{item.provider_type}</Tag>
                                             <Tag color="orange" style={{ margin: 0, fontSize: 11, borderRadius: 4 }}>倍率: {item.rate ?? 1.0}x</Tag>
                                             <Tag color="blue" style={{ margin: 0, fontSize: 11, borderRadius: 4 }}>请求优先级: {(item as any).priority ?? 0}</Tag>
                                             <Tag color="cyan" style={{ margin: 0, fontSize: 11, borderRadius: 4 }}>请求权重: {(item as any).weight ?? 1}</Tag>
                                          </Space>
                                        );
                                      } else if (upstreamTab === 'volcengine_enhance') {
                                        isSelected = configObj.volcengine_enhance_credential_id === item.id;
                                        cardSubtitle = `基址: ${item.base_url || '-'}`;
                                        extraTag = <Tag color="blue" style={{ margin: 0, fontSize: 11 }}>火山凭证</Tag>;
                                      }

                                      return (

                                          <div
                                            onClick={() => {
                                              if (upstreamTab === 'preset') {
                                                const isHa = item.provider_type === 'high_availability_group';
                                                if (!isHa) {
                                                  setSelectedSubChannelAids([]);
                                                }
                                                form.setFieldsValue({
                                                  preset_id: item.id,
                                                  rate: item.rate ?? 1.0,
                                                  provider_type: item.provider_type || 'custom'
                                                });
                                              } else {
                                                setSelectedSubChannelAids([]);
                                                if (upstreamTab === 'volcengine_enhance') {
                                                  form.setFieldsValue({
                                                    preset_id: null,
                                                    provider_type: 'volcengine',
                                                  });
                                                  // 仅在 config 中存储凭证 ID 关联关系，不再复制 api_key/base_url
                                                  setConfigObj(prev => ({
                                                    ...prev,
                                                    volcengine_enhance_credential_id: item.id,
                                                  }));
                                                }
                                              }
                                            }}
                                            style={{
                                              padding: '6px 10px',
                                              borderRadius: 6,
                                              border: isSelected ? '1px solid #91caff' : (isLight ? '1px solid #e5e4e7' : '1px solid rgba(255,255,255,0.08)'),
                                              background: isSelected ? (isLight ? 'rgba(22,119,255,0.08)' : 'rgba(22,119,255,0.15)') : 'transparent',
                                              cursor: 'pointer',
                                              display: 'flex',
                                              justifyContent: 'space-between',
                                              alignItems: 'center',
                                              transition: 'all 0.15s'
                                            }}
                                          >
                                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', minWidth: 0, gap: 8 }}>
                                              <span style={{ fontWeight: 600, fontSize: 13, color: isSelected ? 'var(--text)' : 'inherit', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {cardTitle}
                                              </span>
                                              {upstreamTab === 'preset' ? (
                                                <Typography.Text keyboard style={{ color: '#1677ff', fontSize: 11, margin: 0 }}>
                                                  {item.yid ? `YID: ${item.yid}` : 'YID: -'}
                                                </Typography.Text>
                                              ) : (
                                                <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                                  {cardSubtitle}
                                                </span>
                                              )}
                                            </div>
                                            <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                                              {extraTag}
                                            </div>
                                          </div>
                                      );
                                    })}
                                  </Space>
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
                          <Space size={4} align="center">
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
                                            border: isSelected ? '1px solid var(--text)' : (isLight ? '1px solid #e5e4e7' : '1px solid rgba(255,255,255,0.08)'),
                                            background: isSelected ? (isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.08)') : 'transparent',
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
                          <Form.Item shouldUpdate={(prev, curr) => prev.models !== curr.models || prev.provider_type !== curr.provider_type} noStyle>
                            {() => {
                              const providerType = form.getFieldValue('provider_type');
                              const isHaMode = providerType === 'high_availability_group';
                              // Plugin: happyhorse_router 模型别名映射适配（插件可移除）
                              // 快乐小马模式下基于4个视频模型生成映射列表，而非 routing_node
                              let selectedModels = form.getFieldValue('models') || [];
                              if (isHappyHorseRouting && hhModule) {
                                const activeConfig = happyHorseConfigs.find((c: any) => c.routing_node === selectedRoutingNode);
                                const hhModels = hhModule.getHappyHorseMappingModels(activeConfig || null);
                                selectedModels = hhModels.map((m: any) => m.modelId);
                              }
                              if (selectedModels.length === 0) {
                                return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text)', background: isLight ? '#f9fafb' : 'rgba(255,255,255,0.04)', borderRadius: 8 }}>{isHappyHorseRouting ? '请先选择推理节点' : '请先在左侧选择模型'}</div>;
                              }

                              // HA 模式下获取已绑定的子渠道信息
                              const haSubChannels = isHaMode
                                ? presets.filter((p: any) => selectedSubChannelAids.includes(p.id))
                                : [];

                              return (
                                <div style={{ maxHeight: 'calc(100vh - 340px)', minHeight: 300, overflowY: 'auto', paddingRight: 12 }}>
                                  {isHaMode && haSubChannels.length > 0 && (
                                    <Alert
                                      message="高可用子渠道独立映射"
                                      description="可为每个子渠道设置独立的模型别名。子渠道独立映射优先级最高，未设置时回退到默认别名。"
                                      type="info"
                                      showIcon
                                      style={{ borderRadius: 6, marginBottom: 16 }}
                                    />
                                  )}
                                  <Row gutter={16}>
                                    {selectedModels.map((midOrId: string) => {
                                      const match = availableModels.find(m => m.mid === midOrId);
                                      const actualModelId = match ? match.model_id : midOrId;
                                      const isActive = activeMappingInputs.includes(actualModelId);
                                      const currentMapping = modelMappingState;
                                      const hasValue = currentMapping[actualModelId] && String(currentMapping[actualModelId]).trim();
                                      const isHaExpanded = expandedHaModels.includes(actualModelId);
                                      const haSubMapping = haModelMappingState[actualModelId] || {};
                                      const haSubMappingCount = Object.values(haSubMapping).filter(v => v && String(v).trim()).length;

                                      return (
                                        <Col span={24} key={midOrId}>
                                          <div style={{ 
                                            padding: '12px', 
                                            marginBottom: 12, 
                                            borderRadius: 8, 
                                            border: isLight ? '1px solid #e5e4e7' : '1px solid rgba(255,255,255,0.08)',
                                            background: isActive ? (isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)') : 'transparent',
                                            transition: 'all 0.2s'
                                          }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                              <div style={{ flex: 1, minWidth: 0, paddingRight: 16 }}>
                                                <div style={{ fontWeight: 500, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{match?.name || actualModelId}</div>
                                                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>ID: {actualModelId} | MID: {midOrId}</div>
                                              </div>
                                              
                                              <Space size={4}>
                                                {!isActive && !(isHaMode && haSubChannels.length > 0) && (
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
                                                {isHaMode && haSubChannels.length > 0 && (
                                                  <Button
                                                    type={isHaExpanded ? 'primary' : 'dashed'}
                                                    size="small"
                                                    ghost={isHaExpanded}
                                                    icon={<ApartmentOutlined />}
                                                    onClick={() => {
                                                      setExpandedHaModels(prev =>
                                                        prev.includes(actualModelId)
                                                          ? prev.filter(id => id !== actualModelId)
                                                          : [...prev, actualModelId]
                                                      );
                                                    }}
                                                    style={{ flexShrink: 0 }}
                                                  >
                                                    {isHaExpanded ? '收起' : '子渠道映射'}{haSubMappingCount > 0 ? ` (${haSubMappingCount})` : ''}
                                                  </Button>
                                                )}
                                              </Space>
                                            </div>

                                            {/* 默认别名输入 */}
                                            {isActive && !(isHaMode && haSubChannels.length > 0) && (
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
                                                    addonBefore={isHaMode ? <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>默认</span> : undefined}
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

                                            {/* HA 子渠道独立映射 */}
                                            {isHaMode && isHaExpanded && haSubChannels.length > 0 && (
                                              <div style={{ 
                                                marginTop: 12, 
                                                padding: '10px 12px', 
                                                background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)', 
                                                borderRadius: 6, 
                                                border: isLight ? '1px dashed #d9d9d9' : '1px dashed rgba(255,255,255,0.12)',
                                                animation: 'fadeIn 0.2s'
                                              }}>
                                                <div style={{ marginBottom: 8, fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>
                                                  <ApartmentOutlined style={{ marginRight: 4 }} />
                                                  子渠道独立映射（覆盖默认别名）
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                  {/* 默认别名 (回退) */}
                                                  <div style={{ 
                                                    display: 'flex', 
                                                    alignItems: 'center', 
                                                    gap: 8, 
                                                    paddingBottom: 6, 
                                                    borderBottom: isLight ? '1px dashed #f0f0f0' : '1px dashed rgba(255,255,255,0.06)',
                                                    marginBottom: 4 
                                                  }}>
                                                    <div style={{ 
                                                      minWidth: 120, 
                                                      maxWidth: 160, 
                                                      flexShrink: 0,
                                                      fontSize: 12,
                                                      fontWeight: 600,
                                                      color: 'var(--text-secondary)',
                                                    }}>
                                                      <GlobalOutlined style={{ marginRight: 4, color: '#fa8c16' }} />
                                                      默认别名 (回退)
                                                    </div>
                                                    <Input
                                                      size="small"
                                                      placeholder={actualModelId}
                                                      value={modelMappingState[actualModelId] || ''}
                                                      onChange={(e) => {
                                                        const val = e.target.value;
                                                        setModelMappingState(prev => {
                                                          if (!val.trim()) {
                                                            const next = { ...prev };
                                                            delete next[actualModelId];
                                                            return next;
                                                          }
                                                          return { ...prev, [actualModelId]: val };
                                                        });
                                                      }}
                                                      style={{ flex: 1 }}
                                                    />
                                                    {modelMappingState[actualModelId] && (
                                                      <Button
                                                        type="text"
                                                        size="small"
                                                        icon={<CloseOutlined style={{ fontSize: 10 }} />}
                                                        style={{ width: 20, height: 20, minWidth: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', margin: 0, padding: 0 }}
                                                        onClick={() => {
                                                          setModelMappingState(prev => {
                                                            const next = { ...prev };
                                                            delete next[actualModelId];
                                                            return next;
                                                          });
                                                        }}
                                                      />
                                                    )}
                                                  </div>
                                                  {haSubChannels.map((sub: any) => {
                                                    const subIdStr = String(sub.id);
                                                    const subAlias = haSubMapping[subIdStr] || '';
                                                    return (
                                                      <div key={sub.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                        <div style={{ 
                                                          minWidth: 120, 
                                                          maxWidth: 160, 
                                                          flexShrink: 0,
                                                          fontSize: 12,
                                                          fontWeight: 500,
                                                          overflow: 'hidden',
                                                          textOverflow: 'ellipsis',
                                                          whiteSpace: 'nowrap'
                                                        }} title={`${sub.name} (YID: ${sub.yid || '-'})`}>
                                                          <CloudServerOutlined style={{ marginRight: 4, color: '#1677ff' }} />
                                                          {sub.name}
                                                        </div>
                                                        <Input
                                                          size="small"
                                                          placeholder={modelMappingState[actualModelId] || actualModelId}
                                                          value={subAlias}
                                                          onChange={(e) => {
                                                            const val = e.target.value;
                                                            setHaModelMappingState(prev => ({
                                                              ...prev,
                                                              [actualModelId]: {
                                                                ...(prev[actualModelId] || {}),
                                                                [subIdStr]: val,
                                                              }
                                                            }));
                                                          }}
                                                          style={{ flex: 1 }}
                                                        />
                                                        {subAlias && (
                                                          <Button
                                                            type="text"
                                                            size="small"
                                                            icon={<CloseOutlined style={{ fontSize: 10 }} />}
                                                            style={{ width: 20, height: 20, minWidth: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', margin: 0, padding: 0 }}
                                                            onClick={() => {
                                                              setHaModelMappingState(prev => {
                                                                const next = { ...prev };
                                                                const subMap = { ...(next[actualModelId] || {}) };
                                                                delete subMap[subIdStr];
                                                                if (Object.keys(subMap).length === 0) {
                                                                  delete next[actualModelId];
                                                                } else {
                                                                  next[actualModelId] = subMap;
                                                                }
                                                                return next;
                                                              });
                                                            }}
                                                          />
                                                        )}
                                                      </div>
                                                    );
                                                  })}
                                                </div>
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
                          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text)', background: isLight ? '#f9fafb' : 'rgba(255,255,255,0.04)', borderRadius: 8 }}>别名映射功能已关闭</div>
                        )}
                      </div>

                  </div>
                </Col>
              </Row>

              <div style={{ marginTop: 24, paddingTop: 24, borderTop: isLight ? '1px solid #e5e4e7' : '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <Button size="large" onClick={() => handleCloseModal()}>取消</Button>
                <Button size="large" type="primary" htmlType="submit" loading={submitting} style={{ minWidth: 120 }}>保存设置</Button>
              </div>
            </Form>
          </Spin>
        </div>
        </div>
      )}

      <ChannelCategoryManager
        visible={isCategoryManagerVisible}
        onClose={() => setIsCategoryManagerVisible(false)}
        onUpdate={fetchCategories}
      />

    </Card>
  );
};

export default Channels;
