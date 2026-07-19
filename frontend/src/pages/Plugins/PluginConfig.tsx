import React, { useState, useEffect, Suspense } from 'react';
import { Typography, Switch, Button, Checkbox, Divider, Spin, Tag, Tabs, Input, InputNumber, Form, Space, Alert, Select, Table, Drawer, Radio, App, Segmented, Modal, Tooltip, Row, Col } from 'antd';
import { AppMessageBridge } from '../../components/AppMessageBridge';
import { EyeOutlined, ArrowLeftOutlined, SaveOutlined, PictureOutlined, AppstoreOutlined, CloudServerOutlined, ApiOutlined, CheckCircleOutlined, LoadingOutlined, CloseCircleOutlined, SendOutlined, TeamOutlined, ExperimentOutlined, SettingOutlined, VideoCameraOutlined, PlusOutlined, DeleteOutlined, EditOutlined, ShopOutlined, MessageOutlined, ReloadOutlined, ApartmentOutlined, HomeOutlined, ThunderboltOutlined, InfoCircleOutlined, BookOutlined } from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import request from '../../utils/request';
import type { Plugin, UserLevel } from '../../types';
import {
  AdminPresetAssets,
  RelayConvertAssets,
  ApiProxyAssets,
  TeamConfig,
  SiteIconsManager,
  PortalManager,
  PortalStyleSelection,
  HappyHorseManager,
  DocsManager,
  ApiAccessConfig
} from '../../plugins-registry';
import ModerationQuery from '../ModerationQuery/ModerationQuery';
import JsonView from '@uiw/react-json-view';
import { darkTheme } from '@uiw/react-json-view/dark';
import { lightTheme } from '@uiw/react-json-view/light';
import { useThemeStore } from '../../store/theme';
import useSettingsStore from '../../store/settings';
import ClassificationFilter from '../../components/Models/ClassificationFilter';
import { useTranslation } from 'react-i18next';

// ── 物理级完全解耦动态插件扫描 ──
const dynamicMeta = import.meta.glob('./**/plugin_meta.ts', { eager: true });
const dynamicPlugins: Record<
  string,
  {
    name: string;
    title: string;
    component?: () => Promise<any>;
    tabs?: { key: string; label: string; component: () => Promise<any> }[];
  }
> = {};

Object.entries(dynamicMeta).forEach(([path, module]: [string, any]) => {
  const meta = module.default;
  if (meta && meta.name) {
    dynamicPlugins[meta.name] = meta;
  }
});

// ── 插件组件动态加载（各插件均可独立移除，删除对应目录后自动降级为「该插件模块暂未安装」） ──
const safeLazy = (loader: () => Promise<any>) =>
  React.lazy(() =>
    loader().catch(() => ({ default: () => <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>该插件模块暂未安装</div> }))
  );

/** 插件组件包装器：Suspense + 降级 */
const PluginModule: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Suspense fallback={<div style={{ padding: 60, textAlign: 'center' }}><Spin /></div>}>{children}</Suspense>
);

/** 内置 Tab hash 白名单（与 Tabs items 的 key 对齐） */
const BUILTIN_TAB_KEYS = [
  'audit_log', 'basic', 'api_access', 'storage', 'moderation', 'moderation_query',
  'preset', 'api_log', 'team_config', 'pg_storage', 'marketplace_models',
  'routing_rules', 'portal_manager', 'ha_config', 'docs_manager',
] as const;

const { Title, Text } = Typography;

interface StorageConfig {
  tos_access_key: string;
  tos_secret_key_masked: string;
  tos_endpoint: string;
  tos_region: string;
  tos_bucket: string;
  tos_path_prefix: string;
  tos_custom_domain: string;
  is_configured: boolean;
  global_configured?: boolean;
  global_tos_bucket?: string;
  global_tos_endpoint?: string;
}

interface ModerationConfig {
  volc_access_key: string;
  volc_secret_key_masked: string;
  volc_app_id: string;
  volc_project_name: string;
  volc_group_id: string;
  volc_region: string;
  review_api_url: string;
  is_configured: boolean;
  review_enabled: boolean;
}

// 火山引擎 TOS 对象存储地域配置（国内版 + 海外版）
const TOS_REGION_GROUPS = [
  {
    group: '🇨🇳 国内版 - 火山引擎',
    regions: [
      { label: '华北2（北京）', region: 'cn-beijing', endpointExternal: 'https://tos-cn-beijing.volces.com', endpointInternal: 'https://tos-cn-beijing.ivolces.com' },
      { label: '华南1（广州）', region: 'cn-guangzhou', endpointExternal: 'https://tos-cn-guangzhou.volces.com', endpointInternal: 'https://tos-cn-guangzhou.ivolces.com' },
      { label: '华东2（上海）', region: 'cn-shanghai', endpointExternal: 'https://tos-cn-shanghai.volces.com', endpointInternal: 'https://tos-cn-shanghai.ivolces.com' },
      { label: '中国香港', region: 'cn-hongkong', endpointExternal: 'https://tos-cn-hongkong.volces.com', endpointInternal: 'https://tos-cn-hongkong.ivolces.com' },
      { label: '亚太东南（柔佛）', region: 'ap-southeast-1', endpointExternal: 'https://tos-ap-southeast-1.volces.com', endpointInternal: 'https://tos-ap-southeast-1.ivolces.com' },
      { label: '亚太东南（雅加达）', region: 'ap-southeast-3', endpointExternal: 'https://tos-ap-southeast-3.volces.com', endpointInternal: 'https://tos-ap-southeast-3.ivolces.com' },
    ]
  },
  {
    group: '🌏 海外版 - BytePlus',
    regions: [
      { label: '亚太地区（柔佛）', region: 'bp-ap-southeast-1', endpointExternal: 'https://tos-ap-southeast-1.bytepluses.com', endpointInternal: 'https://tos-ap-southeast-1.ibytepluses.com' },
      { label: '中国（香港）', region: 'bp-cn-hongkong', endpointExternal: 'https://tos-cn-hongkong.bytepluses.com', endpointInternal: 'https://tos-cn-hongkong.ibytepluses.com' },
      { label: '亚太地区（雅加达）', region: 'bp-ap-southeast-3', endpointExternal: 'https://tos-ap-southeast-3.bytepluses.com', endpointInternal: 'https://tos-ap-southeast-3.ibytepluses.com' },
      { label: '中国（北京）', region: 'bp-cn-beijing', endpointExternal: 'https://tos-cn-beijing.bytepluses.com.cn', endpointInternal: 'https://tos-cn-beijing.ibytepluses.com.cn' },
      { label: '中国（广州）', region: 'bp-cn-guangzhou', endpointExternal: 'https://tos-cn-guangzhou.bytepluses.com.cn', endpointInternal: 'https://tos-cn-guangzhou.ibytepluses.com.cn' },
      { label: '中国（上海）', region: 'bp-cn-shanghai', endpointExternal: 'https://tos-cn-shanghai.bytepluses.com.cn', endpointInternal: 'https://tos-cn-shanghai.ibytepluses.com.cn' },
    ]
  }
];

// 扁平化用于快速查找
const ALL_TOS_REGIONS = TOS_REGION_GROUPS.flatMap(g => g.regions);

// 兼容旧代码的 TOS_REGIONS
const TOS_REGIONS = ALL_TOS_REGIONS;

// ── 插件图标映射（各插件均可独立移除，未匹配时使用默认图标 AppstoreOutlined） ──
const pluginIcons: Record<string, React.ReactNode> = {
  asset_manager: <PictureOutlined style={{ fontSize: 20 }} />,
  asset_manager_intl: <PictureOutlined style={{ fontSize: 20 }} />,
  team_marketing: <TeamOutlined style={{ fontSize: 20 }} />,
  playground: <ExperimentOutlined style={{ fontSize: 20 }} />,

  model_marketplace: <ShopOutlined style={{ fontSize: 20 }} />,
  site_icons: <AppstoreOutlined style={{ fontSize: 20 }} />,

  site_portal: <HomeOutlined style={{ fontSize: 20 }} />,
  docs_api: <BookOutlined style={{ fontSize: 20 }} />,
  happyhorse_router: <ThunderboltOutlined style={{ fontSize: 20 }} />
};

const PluginConfigInner: React.FC = () => {
  const { t } = useTranslation();
  const { themeMode } = useThemeStore();
  const _isLight = themeMode === 'light';
  const { message } = App.useApp();
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const { settings } = useSettingsStore();
  const adminPath = settings?.site?.admin_path || 'admin1688';
  const [plugin, setPlugin] = useState<Plugin | null>(null);
  const [levels, setLevels] = useState<UserLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isAllLevels, setIsAllLevels] = useState(true);
  const [selectedLevels, setSelectedLevels] = useState<string[]>([]);
  const [levelQuotas, setLevelQuotas] = useState<Record<string, number>>({});
  const [defaultQuota, setDefaultQuota] = useState<number>(100);
  const [levelMaxFolders, setLevelMaxFolders] = useState<Record<string, number>>({});
  const [defaultMaxFolders, setDefaultMaxFolders] = useState<number>(20);
  const [levelMaxFilesPerFolder, setLevelMaxFilesPerFolder] = useState<Record<string, number>>({});
  const [defaultMaxFilesPerFolder, setDefaultMaxFilesPerFolder] = useState<number>(100);
  const [levelMaxProjects, setLevelMaxProjects] = useState<Record<string, number>>({});
  const [defaultMaxProjects, setDefaultMaxProjects] = useState<number>(3);
  const [levelMaxAssets, setLevelMaxAssets] = useState<Record<string, number>>({});
  const [defaultMaxAssets, setDefaultMaxAssets] = useState<number>(10);
  const [showInPlaygroundPrompt, setShowInPlaygroundPrompt] = useState<boolean>(false);
  const [docsApiAllowGuest, setDocsApiAllowGuest] = useState<boolean>(false);

  // 管理员等级（系统增强插件使用）
  const [adminGroups, setAdminGroups] = useState<{ id: number; name: string; description?: string }[]>([]);
  const [selectedAdminGroups, setSelectedAdminGroups] = useState<number[]>([]);
  const [isAllAdminGroups, setIsAllAdminGroups] = useState(true);

  // 存储配置
  const [storageConfig, setStorageConfig] = useState<StorageConfig | null>(null);
  const [storageForm] = Form.useForm();
  const [haForm] = Form.useForm();
  const [savingStorage, setSavingStorage] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [tosNetworkType, setTosNetworkType] = useState<'external' | 'internal'>('external');
  const [activeTabKey, setActiveTabKey] = useState(() => {
    const hash = window.location.hash.replace('#', '');
    const currentPlugin = name ? dynamicPlugins[name] : null;
    const customTabKeys = currentPlugin?.tabs?.map((t: any) => t.key) || [];
    if ([...BUILTIN_TAB_KEYS, ...customTabKeys].includes(hash)) return hash;
    if (name === 'site_portal') return 'portal_manager';
    if (name === 'docs_api') return 'docs_manager';
    return 'basic'; // default to basic, will be adjusted when plugin loads
  });

  useEffect(() => {
    if (!name) return;
    const hash = window.location.hash.replace('#', '');
    const currentPlugin = dynamicPlugins[name];
    const customTabKeys = currentPlugin?.tabs?.map((t: any) => t.key) || [];
    if ([...BUILTIN_TAB_KEYS, ...customTabKeys].includes(hash)) {
      setActiveTabKey(hash);
      return;
    }
    if (name === 'site_portal') {
      setActiveTabKey('portal_manager');
    } else if (name === 'docs_api') {
      setActiveTabKey('docs_manager');
    } else {
      setActiveTabKey('basic');
    }
  }, [name]);

  const handleTabChange = (key: string) => {
    setActiveTabKey(key);
    window.location.hash = key;
  };

  // 审核配置
  const [moderationConfig, setModerationConfig] = useState<ModerationConfig | null>(null);
  const [moderationForm] = Form.useForm();
  const [savingModeration, setSavingModeration] = useState(false);

  // 审核日志展开详情
  const [expandedAssetInfo, setExpandedAssetInfo] = useState<Record<string, any>>({});
  const [loadingAssetInfo, setLoadingAssetInfo] = useState<Record<string, boolean>>({});


  // 接口日志
  const [apiLogs, setApiLogs] = useState<any[]>([]);
  const [apiLogsTotal, setApiLogsTotal] = useState(0);
  const [apiLogsPage, setApiLogsPage] = useState(1);
  const [apiLogsLoading, setApiLogsLoading] = useState(false);
  const [logSourceFilter, setLogSourceFilter] = useState<string>('');
  const [logKeyword, setLogKeyword] = useState<string>('');

  // ====== 模型创作中心 (Playground) 配置 Tab ======
  const [pgModels, setPgModels] = useState<any[]>([]);
  const [pgAdvancedNodesEnabled, setPgAdvancedNodesEnabled] = useState<boolean>(false);
  const [pgAdvancedNodePreviewEnabled, setPgAdvancedNodePreviewEnabled] = useState<boolean>(true);
  const [pgAdvancedNodeVolcEnhanceEnabled, setPgAdvancedNodeVolcEnhanceEnabled] = useState<boolean>(false);
  const [pgAdvancedNodePromptEnabled, setPgAdvancedNodePromptEnabled] = useState<boolean>(true);
  const [pgAdvancedNodeAiVideoEnabled, setPgAdvancedNodeAiVideoEnabled] = useState<boolean>(true);
  const [pgAdvancedNodeAiImageEnabled, setPgAdvancedNodeAiImageEnabled] = useState<boolean>(true);
  const [pgAdvancedNodeAgentEnabled, setPgAdvancedNodeAgentEnabled] = useState<boolean>(false);
  const [pgAdvancedNodesUnifiedLimitEnabled, setPgAdvancedNodesUnifiedLimitEnabled] = useState<boolean>(false);
  const [pgAdvancedNodesUnifiedLimitValue, setPgAdvancedNodesUnifiedLimitValue] = useState<number>(10);
  const [pgAdvancedNodePreviewLimit, setPgAdvancedNodePreviewLimit] = useState<number>(10);
  const [pgAdvancedNodePromptLimit, setPgAdvancedNodePromptLimit] = useState<number>(10);
  const [pgAdvancedNodeAiVideoLimit, setPgAdvancedNodeAiVideoLimit] = useState<number>(10);
  const [pgAdvancedNodeAiImageLimit, setPgAdvancedNodeAiImageLimit] = useState<number>(10);
  const [pgAdvancedNodeAgentLimit, setPgAdvancedNodeAgentLimit] = useState<number>(10);
  const [pgAdvancedNodeVolcEnhanceLimit, setPgAdvancedNodeVolcEnhanceLimit] = useState<number>(10);
  const [pgAdvancedNodeInstanceLimit, setPgAdvancedNodeInstanceLimit] = useState<number>(50);
  const [pgAgentModeEnabled, setPgAgentModeEnabled] = useState<boolean>(false);
  const [pgAgentVideoMode, setPgAgentVideoMode] = useState<string>('track');
  const [pgAgentWelcomeTitle, setPgAgentWelcomeTitle] = useState<string>('');
  const [pgAgentWelcomeDesc, setPgAgentWelcomeDesc] = useState<string>('');
  const [pgAgentPresetPrompts, setPgAgentPresetPrompts] = useState<any[]>([]);
  const [pgAgentSystemPrompt, setPgAgentSystemPrompt] = useState<string>('');
  const [pgAgentChatModels, setPgAgentChatModels] = useState<string[]>([]);
  const [volcEnhancePluginActive, setVolcEnhancePluginActive] = useState<boolean>(false);
  const [pgSchemes, setPgSchemes] = useState<any[]>([]);
  const [savingPlayground, setSavingPlayground] = useState(false);
  const [pgSearchKeyword, setPgSearchKeyword] = useState('');
  const [pgSchemeTypeFilter, setPgSchemeTypeFilter] = useState('all');
  const [pgSchemeDrawerVisible, setPgSchemeDrawerVisible] = useState(false);
  const [pgCurrentId, setPgCurrentId] = useState<number | null>(null);
  const [pgSelectedSchemeId, setPgSelectedSchemeId] = useState<string>('');
  const [pgDefaultModelMids, setPgDefaultModelMids] = useState<string[]>([]);
  // 分类过滤
  const [pgProvidersStats, setPgProvidersStats] = useState<any[]>([]);
  const [pgApiProvidersStats, setPgApiProvidersStats] = useState<any[]>([]);
  const [pgTypesStats, setPgTypesStats] = useState<any[]>([]);
  const [pgSelectedProvider, setPgSelectedProvider] = useState<number | null>(null);
  const [pgSelectedApiProvider, setPgSelectedApiProvider] = useState<number | null>(null);
  const [pgSelectedType, setPgSelectedType] = useState<number | null>(null);
  // 参数覆写 Modal
  const [pgOverrideModalVisible, setPgOverrideModalVisible] = useState(false);
  const [pgOverrideModelId, setPgOverrideModelId] = useState<number | null>(null);
  const [pgOverrideData, setPgOverrideData] = useState<any>({ modify: {}, remove: [], add: [] });

  // ====== 模型广场管理 (Model Marketplace) 配置 ======
  const [mpModels, setMpModels] = useState<any[]>([]);
  const [savingMarketplace, setSavingMarketplace] = useState(false);
  const [mpSearchKeyword, setMpSearchKeyword] = useState('');
  const [mpProviderFilter, setMpProviderFilter] = useState<string>('all');
  const [mpTypeFilter, setMpTypeFilter] = useState<string>('all');
  const [mpStatusFilter, setMpStatusFilter] = useState<string>('all'); // 'all' | 'enabled' | 'disabled'
  const [mpModelActiveFilter, setMpModelActiveFilter] = useState<string>('all'); // 'all' | 'active' | 'inactive' (模型管理里的状态)
  const [mpDisplayMode, setMpDisplayMode] = useState<'whitelist' | 'blacklist'>('whitelist');
  const [mpAllowGuest, setMpAllowGuest] = useState<boolean>(false);

  const fetchMarketplaceConfig = async () => {
    try {
      const res = await (request.get(`/plugins/${name}/marketplace-models`) as Promise<any>);
      if (res.models) {
        const sorted = [...res.models].sort((a, b) => (b.mp_sort_order || 0) - (a.mp_sort_order || 0));
        setMpModels(sorted);
      }
      if (res.display_mode) setMpDisplayMode(res.display_mode);
      if (res.allow_guest !== undefined) setMpAllowGuest(res.allow_guest);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (name === 'model_marketplace') {
      fetchMarketplaceConfig();
    }
  }, [name]);

  const handleSaveMarketplaceConfig = async () => {
    try {
      setSavingMarketplace(true);
      const payload = {
        display_mode: mpDisplayMode,
        allow_guest: mpAllowGuest,
        models: mpModels.map(m => ({
          id: m.id,
          enabled: m.mp_enabled,
          sort_order: m.mp_sort_order || 0,
          description: m.mp_description || ''
        }))
      };
      await request.post(`/plugins/${name}/marketplace-models`, payload);
      message.success('模型广场配置保存成功');
    } catch (e) {
      message.error('保存失败');
    } finally {
      setSavingMarketplace(false);
    }
  };

  const handleMpToggle = (id: number, enabled: boolean) => {
    setMpModels(prev => prev.map(m => m.id === id ? { ...m, mp_enabled: enabled } : m));
  };

  const handleMpSortChange = (id: number, sort: number) => {
    setMpModels(prev => prev.map(m => m.id === id ? { ...m, mp_sort_order: sort } : m));
  };

  const handleMpDescChange = (id: number, desc: string) => {
    setMpModels(prev => prev.map(m => m.id === id ? { ...m, mp_description: desc } : m));
  };

  const fetchPlaygroundConfigBase = async () => {
    try {
      const res = await (request.get(`/plugins/${name}/playground-config`) as Promise<any>);
      if (res.models) {
        const sorted = [...res.models].sort((a, b) => (b.pg_sort_order || 0) - (a.pg_sort_order || 0));
        setPgModels(sorted);
      }
      if (res.schemes) setPgSchemes(res.schemes);
      if (res.default_model_mids) {
        let midsArray: string[] = [];
        if (Array.isArray(res.default_model_mids)) {
          midsArray = res.default_model_mids;
        } else if (typeof res.default_model_mids === 'object' && res.default_model_mids !== null) {
          midsArray = Object.values(res.default_model_mids).filter(v => typeof v === 'string') as string[];
        }
        setPgDefaultModelMids(midsArray);
      }
      if (res.advanced_nodes) {
        setPgAdvancedNodesEnabled(!!res.advanced_nodes.enabled);
        setPgAdvancedNodePreviewEnabled(res.advanced_nodes.preview_enabled !== false);
        setPgAdvancedNodeVolcEnhanceEnabled(!!res.advanced_nodes.volc_enhance_enabled);
        setPgAdvancedNodePromptEnabled(res.advanced_nodes.prompt_enabled !== false);
        setPgAdvancedNodeAiVideoEnabled(res.advanced_nodes.ai_video_enabled !== false);
        setPgAdvancedNodeAiImageEnabled(res.advanced_nodes.ai_image_enabled !== false);
        setPgAdvancedNodeAgentEnabled(!!res.advanced_nodes.agent_enabled);
        setPgAdvancedNodesUnifiedLimitEnabled(res.advanced_nodes.unified_limit_enabled ?? false);
        setPgAdvancedNodesUnifiedLimitValue(res.advanced_nodes.unified_limit_value ?? 10);
        setPgAdvancedNodePreviewLimit(res.advanced_nodes.preview_limit ?? 10);
        setPgAdvancedNodePromptLimit(res.advanced_nodes.prompt_limit ?? 10);
        setPgAdvancedNodeAiVideoLimit(res.advanced_nodes.ai_video_limit ?? 10);
        setPgAdvancedNodeAiImageLimit(res.advanced_nodes.ai_image_limit ?? 10);
        setPgAdvancedNodeAgentLimit(res.advanced_nodes.agent_limit ?? 10);
        setPgAdvancedNodeVolcEnhanceLimit(res.advanced_nodes.volc_enhance_limit ?? 10);
        setPgAdvancedNodeInstanceLimit(res.advanced_nodes.instance_limit ?? 50);
        setPgAgentModeEnabled(!!res.advanced_nodes.agent_mode_enabled);
        setPgAgentVideoMode(res.advanced_nodes.agent_video_mode || 'track');
        setPgAgentWelcomeTitle(res.advanced_nodes.agent_welcome_title || '');
        setPgAgentWelcomeDesc(res.advanced_nodes.agent_welcome_desc || '');
        setPgAgentSystemPrompt(res.advanced_nodes.agent_system_prompt || '');
        setPgAgentChatModels(res.advanced_nodes.agent_chat_models || []);
        if (res.advanced_nodes.agent_preset_prompts && Array.isArray(res.advanced_nodes.agent_preset_prompts)) {
          setPgAgentPresetPrompts(res.advanced_nodes.agent_preset_prompts);
        } else {
          setPgAgentPresetPrompts([]);
        }
        setVolcEnhancePluginActive(!!res.advanced_nodes.volc_enhance_plugin_active);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchPgClassificationsStats = async (searchTerm = '') => {
    try {
      let url = `/classifications/stats?search=${encodeURIComponent(searchTerm)}`;
      if (pgSelectedProvider) url += `&provider_id=${pgSelectedProvider}`;
      if (pgSelectedApiProvider) url += `&api_provider_id=${pgSelectedApiProvider}`;
      if (pgSelectedType) url += `&type_id=${pgSelectedType}`;
      const resp = await (request.get(url) as any);
      setPgProvidersStats(resp.providers || []);
      setPgApiProvidersStats(resp.api_providers || []);
      setPgTypesStats(resp.types || []);
    } catch (e) {
      console.error(e);
    }
  };

  const [savingHa, setSavingHa] = useState(false);
  const fetchHaConfigBase = async () => {
    try {
      const res = await (request.get(`/plugins/${name}/ha-config`) as Promise<any>);
      haForm.setFieldsValue(res);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveHaConfig = async () => {
    try {
      const values = await haForm.validateFields();
      setSavingHa(true);
      await request.post(`/plugins/${name}/ha-config`, values);
      message.success('高可用插件配置保存成功');
    } catch (e: any) {
      console.error(e);
      message.error(e?.response?.data?.error?.message || e?.message || '保存失败');
    } finally {
      setSavingHa(false);
    }
  };

  useEffect(() => {
    if (name === 'playground') {
      fetchPlaygroundConfigBase();
    } else if (name === 'high_availability_channel') {
      fetchHaConfigBase();
    }
  }, [name]);

  // Playground: 等级被选中时，将其配额初始化为当前全局默认值的快照（确保等级配额与全局默认互不影响）
  useEffect(() => {
    if (name !== 'playground' || isAllLevels || levels.length === 0) return;
    let changed = false;
    const nq = { ...levelQuotas }, np = { ...levelMaxProjects }, na = { ...levelMaxAssets };
    for (const lv of levels) {
      const key = lv.id.toString();
      if (!selectedLevels.includes(key) && !selectedLevels.includes(lv.group_key)) continue;
      if (nq[key] == null) { nq[key] = defaultQuota; changed = true; }
      if (np[key] == null) { np[key] = defaultMaxProjects; changed = true; }
      if (na[key] == null) { na[key] = defaultMaxAssets; changed = true; }
    }
    if (changed) {
      setLevelQuotas(nq);
      setLevelMaxProjects(np);
      setLevelMaxAssets(na);
    }
  }, [selectedLevels, levels]);

  useEffect(() => {
    if (name === 'playground') {
      fetchPgClassificationsStats(pgSearchKeyword);
    }
  }, [name, pgSelectedProvider, pgSelectedApiProvider, pgSelectedType, pgSearchKeyword]);

  const handleSavePlaygroundConfig = async () => {
    try {
      setSavingPlayground(true);
      const payload = {
        default_model_mids: pgDefaultModelMids,
        models: pgModels.map(m => ({
          id: m.id,
          mid: m.mid || '',
          enabled: m.pg_enabled,
          scheme_id: m.pg_scheme_id || null,
          param_overrides: m.pg_param_overrides || null,
          sort_order: m.pg_sort_order || 0
        })),
        advanced_nodes: {
          enabled: pgAdvancedNodesEnabled,
          preview_enabled: pgAdvancedNodePreviewEnabled,
          volc_enhance_enabled: pgAdvancedNodeVolcEnhanceEnabled,
          prompt_enabled: pgAdvancedNodePromptEnabled,
          ai_video_enabled: pgAdvancedNodeAiVideoEnabled,
          ai_image_enabled: pgAdvancedNodeAiImageEnabled,
          agent_enabled: pgAdvancedNodeAgentEnabled,
          unified_limit_enabled: pgAdvancedNodesUnifiedLimitEnabled,
          unified_limit_value: pgAdvancedNodesUnifiedLimitValue,
          preview_limit: pgAdvancedNodesUnifiedLimitEnabled ? pgAdvancedNodesUnifiedLimitValue : pgAdvancedNodePreviewLimit,
          prompt_limit: pgAdvancedNodesUnifiedLimitEnabled ? pgAdvancedNodesUnifiedLimitValue : pgAdvancedNodePromptLimit,
          ai_video_limit: pgAdvancedNodesUnifiedLimitEnabled ? pgAdvancedNodesUnifiedLimitValue : pgAdvancedNodeAiVideoLimit,
          ai_image_limit: pgAdvancedNodesUnifiedLimitEnabled ? pgAdvancedNodesUnifiedLimitValue : pgAdvancedNodeAiImageLimit,
          agent_limit: pgAdvancedNodesUnifiedLimitEnabled ? pgAdvancedNodesUnifiedLimitValue : pgAdvancedNodeAgentLimit,
          volc_enhance_limit: pgAdvancedNodesUnifiedLimitEnabled ? pgAdvancedNodesUnifiedLimitValue : pgAdvancedNodeVolcEnhanceLimit,
          instance_limit: pgAdvancedNodesUnifiedLimitEnabled ? pgAdvancedNodesUnifiedLimitValue : pgAdvancedNodeInstanceLimit,
          agent_mode_enabled: pgAgentModeEnabled,
          agent_video_mode: pgAgentVideoMode,
          agent_welcome_title: pgAgentWelcomeTitle,
          agent_welcome_desc: pgAgentWelcomeDesc,
          agent_system_prompt: pgAgentSystemPrompt,
          agent_preset_prompts: pgAgentPresetPrompts,
          agent_chat_models: pgAgentChatModels,
        }
      };
      await request.post(`/plugins/${name}/playground-config`, payload);
      message.success('创作配置保存成功');
    } catch (e) {
      message.error('保存失败');
    } finally {
      setSavingPlayground(false);
    }
  };

  const handlePgToggle = (id: number, enabled: boolean) => {
    setPgModels(prev => prev.map(m => m.id === id ? { ...m, pg_enabled: enabled } : m));
  };

  const handlePgSortChange = (id: number, sort: number) => {
    setPgModels(prev => prev.map(m => m.id === id ? { ...m, pg_sort_order: sort } : m));
  };

  const handleOpenSchemeDrawer = (id: number, currentSchemeId: string) => {
    setPgCurrentId(id);
    setPgSelectedSchemeId(currentSchemeId || '');
    setPgSchemeDrawerVisible(true);
  };

  const handleConfirmScheme = () => {
    setPgModels(prev => prev.map(m => m.id === pgCurrentId ? { ...m, pg_scheme_id: pgSelectedSchemeId } : m));
    setPgSchemeDrawerVisible(false);
  };

  // ====== 创作方案配置 Tab ======
  const [schemeList, setSchemeList] = useState<any[]>([]);
  const [defaultSchemeList, setDefaultSchemeList] = useState<any[]>([]);
  const [savingSchemes, setSavingSchemes] = useState(false);
  const [schemeEditVisible, setSchemeEditVisible] = useState(false);
  const [editingScheme, setEditingScheme] = useState<any>(null);
  const [editingSchemeIndex, setEditingSchemeIndex] = useState<number>(-1);

  const fetchSchemeList = async () => {
    try {
      const res = await (request.get(`/plugins/${name}/playground-schemes`) as Promise<any>);
      if (res.schemes) setSchemeList(res.schemes);
      if (res.defaults) setDefaultSchemeList(res.defaults);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (name === 'playground') {
      fetchSchemeList();
    }
  }, [name]);

  const handleSaveAllSchemes = async () => {
    try {
      setSavingSchemes(true);
      await request.post(`/plugins/${name}/playground-schemes`, { schemes: schemeList });
      message.success('方案配置已保存');
    } catch (e) {
      message.error('保存失败');
    } finally {
      setSavingSchemes(false);
    }
  };

  const handleAddScheme = () => {
    const newScheme = {
      id: `custom_${Date.now()}`,
      name: '新建创作方案',
      type: 'video',
      is_system: false,
      description: '请填写方案描述',
      params: [
        { key: 'ratio', label: '画面比例', type: 'radio', data_type: 'string', options: ['16:9', '9:16', '1:1'], default: '16:9' },
        { key: 'resolution', label: '分辨率', type: 'select', data_type: 'string', options: ['720p', '1080p', '4k'], default: '1080p' },
        { key: 'duration', label: '时长', type: 'slider', data_type: 'integer', min: 1, max: 60, step: 1, default: 5 },
        { key: 'watermark', label: '水印', type: 'switch', data_type: 'boolean', default: false },
        { key: 'return_last_frame', label: '返回最后一帧', type: 'switch', data_type: 'boolean', default: false },
        { key: 'generate_audio', label: '生成音频', type: 'switch', data_type: 'boolean', default: false },
        { key: 'web_search', label: '联网搜索', type: 'switch', data_type: 'boolean', default: false }
      ]
    };
    setEditingScheme(JSON.parse(JSON.stringify(newScheme)));
    setEditingSchemeIndex(-1);
    setSchemeEditVisible(true);
  };

  const handleEditScheme = (scheme: any, index: number) => {
    setEditingScheme(JSON.parse(JSON.stringify(scheme)));
    setEditingSchemeIndex(index);
    setSchemeEditVisible(true);
  };

  const handleDeleteScheme = (index: number) => {
    setSchemeList(prev => prev.filter((_, i) => i !== index));
    message.success('方案已删除，请点击保存生效');
  };

  const handleResetScheme = (id: string, idx: number) => {
    Modal.confirm({
      title: '确认重置',
      content: '是否将该内置方案重置为初始默认参数？该操作将在您点击"保存全部方案"后生效。',
      onOk: () => {
        const def = defaultSchemeList.find(s => s.id === id);
        if (def) {
          const newList = [...schemeList];
          newList[idx] = JSON.parse(JSON.stringify(def));
          setSchemeList(newList);
          message.success('已重置为默认参数，请记得保存配置');
        } else {
          message.error('无法获取内置默认参数');
        }
      }
    });
  };

  const handleSaveEditingScheme = () => {
    if (!editingScheme) return;
    if (editingSchemeIndex >= 0) {
      setSchemeList(prev => prev.map((s, i) => i === editingSchemeIndex ? editingScheme : s));
    } else {
      setSchemeList(prev => [...prev, editingScheme]);
    }
    setSchemeEditVisible(false);
    message.success('方案已更新，请点击保存生效');
  };

  const handleEditingSchemeParamChange = (paramIndex: number, field: string, value: any) => {
    if (!editingScheme) return;
    const newParams = [...editingScheme.params];
    newParams[paramIndex] = { ...newParams[paramIndex], [field]: value };
    setEditingScheme({ ...editingScheme, params: newParams });
  };

  const handleAddParam = () => {
    if (!editingScheme) return;
    const newParams = [...editingScheme.params, { key: `param_${Date.now()}`, label: '新参数', type: 'select', data_type: 'string', options: ['选项1'], default: '选项1' }];
    setEditingScheme({ ...editingScheme, params: newParams });
  };

  const handleRemoveParam = (paramIndex: number) => {
    if (!editingScheme) return;
    const newParams = editingScheme.params.filter((_: any, i: number) => i !== paramIndex);
    setEditingScheme({ ...editingScheme, params: newParams });
  };

  const fetchApiLogs = async (page = 1) => {
    try {
      setApiLogsLoading(true);
      const params: any = { page, page_size: 15 };
      if (logSourceFilter) params.source = logSourceFilter;
      if (logKeyword) params.keyword = logKeyword;
      const res = await (request.get(`/plugins/${name}/api-logs`, { params }) as any);
      if (res.logs) setApiLogs(res.logs);
      if (res.total != null) setApiLogsTotal(res.total);
      setApiLogsPage(res.page || page);
      if (res.uid_map) {
        setAuditUidMap(prev => ({ ...prev, ...res.uid_map }));
      }
    } catch (e) {
      console.error('获取接口日志失败', e);
    } finally {
      setApiLogsLoading(false);
    }
  };

  // 审核日志
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditUidMap, setAuditUidMap] = useState<Record<string, { uid: string; username: string }>>({});

  useEffect(() => {
    fetchData();
  }, [name]);

  useEffect(() => {
    if (activeTabKey === 'api_log' && !loading && apiLogs.length === 0) {
      fetchApiLogs(1);
    }
    if (activeTabKey === 'audit_log' && !loading) {
      (async () => {
        try {
          setAuditLoading(true);
          const res = await (request.get(`/assets/admin/list?category=虚拟人像`, { headers: { 'x-plugin-ns': name } }) as any);
          if (res.assets) setAuditLogs(res.assets);
          if (res.uid_map) setAuditUidMap(res.uid_map);
        } catch (e) {
          console.error('获取审核日志失败', e);
        } finally {
          setAuditLoading(false);
        }
      })();
    }
  }, [activeTabKey, loading]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [pluginRes, levelRes, storageRes, moderationRes] = await Promise.all([
        request.get('/plugins') as any,
        request.get('/user_levels') as any,
        request.get(`/plugins/${name}/storage-config`) as any,
        request.get(`/plugins/${name}/moderation-config`) as any,
      ]);

      const found = pluginRes.plugins?.find((p: Plugin) => p.name === name);
      if (found) {
        setPlugin(found);
        if (found.category === 'system' || found.category === 'system_builtin') {
          // 系统增强插件：解析管理员等级权限
          if (found.allowed_levels === 'all') {
            setIsAllAdminGroups(true);
            setSelectedAdminGroups([]);
          } else {
            setIsAllAdminGroups(false);
            setSelectedAdminGroups(found.allowed_levels.split(',').filter(Boolean).map(Number).filter((n: number) => !isNaN(n)));
          }
        } else {
          if (found.allowed_levels === 'all') {
            setIsAllLevels(true);
            setSelectedLevels([]);
          } else {
            setIsAllLevels(false);
            setSelectedLevels(found.allowed_levels.split(',').filter(Boolean));
          }
        }
      }

      const allLevels = Array.isArray(levelRes) ? levelRes : (levelRes.data || levelRes.levels || []);
      setLevels(allLevels);

      // 系统增强插件：加载管理员等级
      try {
        const agRes = await (request.get('/admin_groups') as any);
        const groups = agRes?.data || agRes || [];
        if (Array.isArray(groups)) setAdminGroups(groups);
      } catch { /* 忽略 */ }

      if (storageRes) {
        setStorageConfig(storageRes);
        // 加载等级配额 (统一使用 ULID key 即 lv.id.toString())
        if (storageRes.level_quotas) {
          const lq: Record<string, number> = {};
          allLevels.forEach((lv: any) => {
            const key = lv.id.toString();
            lq[key] = storageRes.level_quotas[key] ?? storageRes.level_quotas[lv.group_key];
          });
          setLevelQuotas(lq);
        }
        if (storageRes.default_quota != null) {
          setDefaultQuota(storageRes.default_quota);
        }
        if (storageRes.level_max_folders) {
          const lmf: Record<string, number> = {};
          allLevels.forEach((lv: any) => {
            const key = lv.id.toString();
            lmf[key] = storageRes.level_max_folders[key] ?? storageRes.level_max_folders[lv.group_key];
          });
          setLevelMaxFolders(lmf);
        }
        if (storageRes.default_max_folders != null) {
          setDefaultMaxFolders(storageRes.default_max_folders);
        }
        if (storageRes.level_max_files_per_folder) {
          const lmfpf: Record<string, number> = {};
          allLevels.forEach((lv: any) => {
            const key = lv.id.toString();
            lmfpf[key] = storageRes.level_max_files_per_folder[key] ?? storageRes.level_max_files_per_folder[lv.group_key];
          });
          setLevelMaxFilesPerFolder(lmfpf);
        }
        if (storageRes.default_max_files_per_folder != null) {
          setDefaultMaxFilesPerFolder(storageRes.default_max_files_per_folder);
        }

        if (storageRes.level_max_projects) {
          const lmp: Record<string, number> = {};
          allLevels.forEach((lv: any) => {
            const key = lv.id.toString();
            lmp[key] = storageRes.level_max_projects[key] ?? storageRes.level_max_projects[lv.group_key];
          });
          setLevelMaxProjects(lmp);
        }
        if (storageRes.default_max_projects != null) setDefaultMaxProjects(storageRes.default_max_projects);

        if (storageRes.level_max_assets) {
          const lma: Record<string, number> = {};
          allLevels.forEach((lv: any) => {
            const key = lv.id.toString();
            lma[key] = storageRes.level_max_assets[key] ?? storageRes.level_max_assets[lv.group_key];
          });
          setLevelMaxAssets(lma);
        }
        if (storageRes.default_max_assets != null) setDefaultMaxAssets(storageRes.default_max_assets);
        if (storageRes.show_in_playground_prompt != null) setShowInPlaygroundPrompt(storageRes.show_in_playground_prompt);
        if (storageRes.docs_api_allow_guest != null) setDocsApiAllowGuest(storageRes.docs_api_allow_guest);

        // 延迟设置表单值，等待 Tabs 内的 Form 组件渲染完毕
        setTimeout(() => {
          storageForm.setFieldsValue({
            tos_access_key: storageRes.tos_access_key || '',
            tos_secret_key: storageRes.tos_secret_key || '',
            tos_endpoint: storageRes.tos_endpoint || '',
            tos_region: storageRes.tos_region || '',
            tos_bucket: storageRes.tos_bucket || '',
            tos_path_prefix: storageRes.tos_path_prefix || '',
            tos_custom_domain: storageRes.tos_custom_domain || ''
          });
          // 根据已保存的 endpoint 智能推断网络类型
          const ep = storageRes.tos_endpoint || '';
          if (ep.includes('ivolces.com') || ep.includes('ibytepluses.com')) {
            setTosNetworkType('internal');
          } else {
            setTosNetworkType('external');
          }
        }, 0);
      }

      if (moderationRes) {
        setModerationConfig(moderationRes);
        setTimeout(() => {
          moderationForm.setFieldsValue({
            volc_access_key: moderationRes.volc_access_key || '',
            volc_secret_key: moderationRes.volc_secret_key || '',
            volc_app_id: moderationRes.volc_app_id || '',
            volc_project_name: moderationRes.volc_project_name || 'default',
            volc_group_id: moderationRes.volc_group_id || '',
            volc_region: moderationRes.volc_region || 'cn-beijing'
          });
        }, 0);
      }
    } catch (error) {
      // 全局拦截器已统一弹出错误提示
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (checked: boolean) => {
    if (!plugin) return;
    try {
      await request.post(`/plugins/${plugin.name}/toggle`, { is_enabled: checked ? 1 : 0 });
      message.success(checked ? '插件已开启' : '插件已关闭');
      fetchData();
    } catch (error) {
      // 全局拦截器已统一弹出错误提示
    }
  };

  // ================= 辅助快捷选择逻辑 =================
  const handleSelectAllLevels = () => {
    const allLvs = levels.map(lv => lv.id.toString());
    setSelectedLevels(allLvs);
  };

  const handleClearAllLevels = () => {
    setSelectedLevels([]);
  };

  const handleSelectAllAdminGroups = () => {
    const allGroups = adminGroups.map(ag => ag.id);
    setSelectedAdminGroups(allGroups);
  };

  const handleClearAllAdminGroups = () => {
    setSelectedAdminGroups([]);
  };

  const handleSaveBasic = async () => {
    if (!plugin) return;
    let allowed: string;
    if (plugin.category === 'system' || plugin.category === 'system_builtin') {
      // 系统增强插件：保存管理员等级 ID
      allowed = isAllAdminGroups ? 'all' : selectedAdminGroups.join(',');
      if (!isAllAdminGroups && selectedAdminGroups.length === 0) {
        message.warning('请至少选择一个管理员等级');
        return;
      }
    } else {
      allowed = isAllLevels ? 'all' : selectedLevels.join(',');
      if (!isAllLevels && selectedLevels.length === 0) {
        message.warning('请至少选择一个用户等级');
        return;
      }
    }
    try {
      setSaving(true);
      await request.post(`/plugins/${plugin.name}/config`, {
        allowed_levels: allowed,
        level_quotas: levelQuotas,
        default_quota: defaultQuota,
        level_max_folders: levelMaxFolders,
        default_max_folders: defaultMaxFolders,
        level_max_files_per_folder: levelMaxFilesPerFolder,
        default_max_files_per_folder: defaultMaxFilesPerFolder,
        level_max_projects: levelMaxProjects,
        default_max_projects: defaultMaxProjects,
        level_max_assets: levelMaxAssets,
        default_max_assets: defaultMaxAssets,
        show_in_playground_prompt: showInPlaygroundPrompt,
        docs_api_allow_guest: docsApiAllowGuest
      });
      // 同步本地插件状态，供「API 接口调用」Tab 正确展示开放等级标签
      setPlugin((prev) => (prev ? { ...prev, allowed_levels: allowed } : prev));
      message.success('配置已保存');
    } catch (error) {
      // 全局拦截器已统一弹出错误提示
    } finally {
      setSaving(false);
    }
  };

  const handleSaveStorage = async () => {
    try {
      const values = await storageForm.validateFields();
      setSavingStorage(true);
      await request.post(`/plugins/${name}/storage-config`, values);
      message.success('存储配置已保存');
      setTestResult(null);
    } catch (error: any) {
      if (error?.errorFields) return; // form validation
      // 全局拦截器已统一弹出错误提示
    } finally {
      setSavingStorage(false);
    }
  };

  const handleTestConnection = async () => {
    try {
      setTesting(true);
      setTestResult(null);
      const values = storageForm.getFieldsValue();
      const res = await request.post(`/plugins/${name}/test-connection`, values) as any;
      setTestResult(res);
    } catch (error: any) {
      setTestResult({ success: false, message: error?.response?.data?.error?.message || '测试失败' });
    } finally {
      setTesting(false);
    }
  };

  // 审核开关状态
  const [reviewEnabled, setReviewEnabled] = useState(false);

  // 同步服务端的 review_enabled 状态
  useEffect(() => {
    if (moderationConfig) {
      setReviewEnabled(moderationConfig.review_enabled === true);
    }
  }, [moderationConfig]);

  const handleSaveModeration = async () => {
    try {
      const values = await moderationForm.validateFields();
      setSavingModeration(true);
      await request.post(`/plugins/${name}/moderation-config`, { ...values, review_enabled: reviewEnabled });
      message.success('审核配置已保存');
    } catch (error: any) {
      if (error?.errorFields) return; // 表单验证失败
      // 全局拦截器已统一弹出错误提示
    } finally {
      setSavingModeration(false);
    }
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>;
  }

  if (!plugin) {
    return <div style={{ textAlign: 'center', padding: 80 }}><Text type="secondary">插件不存在</Text></div>;
  }

  const isSystemPlugin = plugin.category === 'system' || plugin.category === 'system_builtin';
  const isEnabled = plugin.is_enabled === 1;

  // ====== 基本配置 Tab ======
  const basicTab = (
    <div>
      {/* 启用状态 */}
      <div style={{
        background: _isLight ? '#fff' : '#141414', borderRadius: 8,
        border: _isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.08)',
        padding: '16px 20px', marginBottom: 16,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between'
      }}>
        <div>
          <Text strong style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 14 }}>启用状态</Text><br />
          <Text style={{ color: _isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)', fontSize: 12 }}>
            {isSystemPlugin ? '开启后，有权限的管理员将在管理后台看到此插件' : '开启后，符合等级要求的用户将在菜单中看到此功能'}
          </Text>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Tag color={isEnabled ? 'success' : 'default'} style={{ margin: 0 }}>{isEnabled ? '运行中' : '已停用'}</Tag>
          <Switch checked={isEnabled} onChange={handleToggle} />
        </div>
      </div>

      {/* 模型创作中心提示词输入窗口加载显示 (仅限素材资产管理插件) */}
      {isEnabled && (name === 'asset_manager' || name === 'asset_manager_intl') && (
        <div style={{
          background: _isLight ? '#fff' : '#141414', borderRadius: 8,
          border: _isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.08)',
          padding: '16px 20px', marginBottom: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <div>
            <Text strong style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 14 }}>模型创作中心提示词输入窗口加载显示</Text><br />
            <Text style={{ color: _isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)', fontSize: 12 }}>
              开启后，在模型创作中心的提示词输入窗口将会加载并显示此插件功能
            </Text>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Tag color={showInPlaygroundPrompt ? 'success' : 'default'} style={{ margin: 0 }}>{showInPlaygroundPrompt ? '已开启' : '已关闭'}</Tag>
            <Switch checked={showInPlaygroundPrompt} onChange={setShowInPlaygroundPrompt} />
          </div>
        </div>
      )}

      {/* DocsApi 插件专属：免登录访问教程中心 */}
      {isEnabled && name === 'docs_api' && (
        <div style={{
          background: _isLight ? '#fff' : '#141414', borderRadius: 8,
          border: _isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.08)',
          padding: '16px 20px', marginBottom: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <div>
            <Text strong style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 14 }}>免登录访问教程中心</Text><br />
            <Text style={{ color: _isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)', fontSize: 12 }}>
              开启后，即使在没有登陆状态的情况下，游客也可以查询并访问 API 教程中心
            </Text>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Tag color={docsApiAllowGuest ? 'success' : 'default'} style={{ margin: 0 }}>{docsApiAllowGuest ? '已开启' : '已关闭'}</Tag>
            <Switch checked={docsApiAllowGuest} onChange={setDocsApiAllowGuest} />
          </div>
        </div>
      )}

      {/* 系统增强插件：管理员等级权限 */}
      {isSystemPlugin ? (
        <div style={{
          background: _isLight ? '#fff' : '#141414', borderRadius: 8,
          border: _isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.08)', padding: '20px', marginBottom: 16
        }}>
          <Text strong style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 14 }}>管理员等级权限</Text><br />
          <Text style={{ color: _isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)', fontSize: 12 }}>设置哪些管理员等级可以在管理后台看到并管理此插件</Text>
          <Divider style={{ borderColor: _isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)', margin: '14px 0' }} />

          <div
            style={{ padding: '12px 16px', borderRadius: 6, border: isAllAdminGroups ? '1px solid rgba(250,140,22,0.4)' : (_isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.08)'), background: isAllAdminGroups ? 'rgba(250,140,22,0.06)' : 'transparent', cursor: 'pointer', marginBottom: 8, transition: 'all 0.15s' }}
            onClick={() => { setIsAllAdminGroups(true); }}
          >
            <Checkbox checked={isAllAdminGroups}><Text style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 13 }}>所有管理员等级可见</Text></Checkbox>
            <Text style={{ color: _isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)', fontSize: 12, display: 'block', marginLeft: 24, marginTop: 2 }}>所有管理员等级均可管理此插件</Text>
          </div>
          <div
            style={{ padding: '12px 16px', borderRadius: 6, border: !isAllAdminGroups ? '1px solid rgba(250,140,22,0.4)' : (_isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.08)'), background: !isAllAdminGroups ? 'rgba(250,140,22,0.06)' : 'transparent', cursor: 'pointer', transition: 'all 0.15s' }}
            onClick={() => setIsAllAdminGroups(false)}
          >
            <Checkbox checked={!isAllAdminGroups}><Text style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 13 }}>仅指定管理员等级可见</Text></Checkbox>
          </div>

          {!isAllAdminGroups && (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                <Text style={{ color: _isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)', fontSize: 12 }}>
                  已选择 {selectedAdminGroups.length} 个分组
                </Text>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <Button 
                    type="link" 
                    size="small" 
                    onClick={handleSelectAllAdminGroups} 
                    style={{ padding: '0 4px', fontSize: 12, height: 'auto', lineHeight: 1, color: '#fa8c16' }}
                  >
                    全选
                  </Button>
                  <Divider type="vertical" style={{ margin: '0 8px', borderColor: _isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)' }} />
                  <Button 
                    type="link" 
                    size="small" 
                    danger 
                    onClick={handleClearAllAdminGroups} 
                    style={{ padding: '0 4px', fontSize: 12, height: 'auto', lineHeight: 1 }}
                  >
                    清除
                  </Button>
                </div>
              </div>
              {adminGroups.map(ag => {
                const isSelected = selectedAdminGroups.includes(ag.id);
                return (
                  <div key={ag.id}
                    style={{ padding: '10px 14px', borderRadius: 6, border: isSelected ? '1px solid rgba(250,140,22,0.3)' : (_isLight ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(255,255,255,0.06)'), background: isSelected ? 'rgba(250,140,22,0.04)' : 'transparent', marginBottom: 6, cursor: 'pointer', transition: 'all 0.15s' }}
                    onClick={() => setSelectedAdminGroups(prev => prev.includes(ag.id) ? prev.filter(id => id !== ag.id) : [...prev, ag.id])}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Checkbox checked={isSelected} />
                      <Text style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 13 }}>{ag.name}</Text>
                      {ag.description && <Text style={{ color: _isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)', fontSize: 12 }}>({ag.description})</Text>}
                    </div>
                  </div>
                );
              })}
              {adminGroups.length === 0 && <Text style={{ color: _isLight ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)', display: 'block', textAlign: 'center', padding: 16, fontSize: 13 }}>暂无管理员等级，请先在「站点设置 → 管理员等级」中创建</Text>}
            </div>
          )}
        </div>
      ) : (
        <>

          {/* 用户增强插件：用户等级 */}
          <div style={{
            background: _isLight ? '#fff' : '#141414', borderRadius: 8,
            border: _isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.08)', padding: '20px', marginBottom: 16
          }}>
            <Text strong style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 14 }}>开放用户等级</Text><br />
            <Text style={{ color: _isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)', fontSize: 12 }}>设置哪些用户等级可以使用此插件功能</Text>
            <Divider style={{ borderColor: _isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)', margin: '14px 0' }} />

            <div
              style={{ padding: '12px 16px', borderRadius: 6, border: isAllLevels ? '1px solid rgba(22,119,255,0.4)' : (_isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.08)'), background: isAllLevels ? 'rgba(22,119,255,0.06)' : 'transparent', cursor: 'pointer', marginBottom: 8, transition: 'all 0.15s' }}
              onClick={() => { setIsAllLevels(true); }}
            >
              <Checkbox checked={isAllLevels}><Text style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 13 }}>对所有用户等级开放</Text></Checkbox>
              <Text style={{ color: _isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)', fontSize: 12, display: 'block', marginLeft: 24, marginTop: 2 }}>包含当前及以后新增的所有用户等级</Text>
            </div>
            <div
              style={{ padding: '12px 16px', borderRadius: 6, border: !isAllLevels ? '1px solid rgba(22,119,255,0.4)' : (_isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.08)'), background: !isAllLevels ? 'rgba(22,119,255,0.06)' : 'transparent', cursor: 'pointer', transition: 'all 0.15s' }}
              onClick={() => setIsAllLevels(false)}
            >
              <Checkbox checked={!isAllLevels}><Text style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 13 }}>按等级单独设置（覆盖全局默认值）</Text></Checkbox>
            </div>

            {!isAllLevels && (
              <div style={{ marginTop: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                  <Text style={{ color: _isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)', fontSize: 12 }}>
                    已选择 {selectedLevels.length} 个等级
                  </Text>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <Button 
                      type="link" 
                      size="small" 
                      onClick={handleSelectAllLevels} 
                      style={{ padding: '0 4px', fontSize: 12, height: 'auto', lineHeight: 1, color: '#1677ff' }}
                    >
                      全选
                    </Button>
                    <Divider type="vertical" style={{ margin: '0 8px', borderColor: _isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)' }} />
                    <Button 
                      type="link" 
                      size="small" 
                      danger 
                      onClick={handleClearAllLevels} 
                      style={{ padding: '0 4px', fontSize: 12, height: 'auto', lineHeight: 1 }}
                    >
                      清除
                    </Button>
                  </div>
                </div>
                {levels.map(lv => {
                  const lvIdStr = lv.id.toString();
                  const isSelected = selectedLevels.includes(lvIdStr) || selectedLevels.includes(lv.group_key);
                  const showLimits = name !== 'team_marketing' && name !== 'playground' && name !== 'model_marketplace';
                  return (
                    <div key={lv.group_key}
                      style={{ padding: '10px 14px', borderRadius: 6, border: isSelected ? '1px solid rgba(22,119,255,0.3)' : (_isLight ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(255,255,255,0.06)'), background: isSelected ? 'rgba(22,119,255,0.04)' : 'transparent', marginBottom: 6, transition: 'all 0.15s' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flex: 1 }}
                          onClick={() => setSelectedLevels(prev => prev.includes(lvIdStr) || prev.includes(lv.group_key) ? prev.filter(k => k !== lvIdStr && k !== lv.group_key) : [...prev, lvIdStr])}
                        >
                          <Checkbox checked={isSelected} />
                          <Text style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 13 }}>
                            {lv.name}
                            <span style={{ color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)', fontSize: 12, marginLeft: 6 }}>
                              (ULID: {lvIdStr.padStart(4, '0')}{lv.discount != null ? `，折扣倍率: ${lv.discount}` : ''})
                            </span>
                          </Text>
                        </div>
                      </div>
                      {showLimits && (name === 'asset_manager' || name === 'asset_manager_intl') && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, marginLeft: 24, flexWrap: 'wrap' }} onClick={(e) => e.stopPropagation()}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Text style={{ color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)', fontSize: 12, whiteSpace: 'nowrap' }}>存储空间</Text>
                            <InputNumber size="small" min={1} max={10240}
                              value={levelQuotas[lv.group_key] ?? 100}
                              onChange={(val) => setLevelQuotas(prev => ({ ...prev, [lv.group_key]: val ?? 100 }))}
                              style={{ width: 72 }}
                              addonAfter="MB"
                            />
                          </div>
                          <div style={{ width: 1, height: 16, background: _isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.08)' }} />
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Text style={{ color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)', fontSize: 12, whiteSpace: 'nowrap' }}>文件夹</Text>
                            <InputNumber size="small" min={1} max={1000}
                              value={levelMaxFolders[lv.group_key] ?? 20}
                              onChange={(val) => setLevelMaxFolders(prev => ({ ...prev, [lv.group_key]: val ?? 20 }))}
                              style={{ width: 68 }}
                              addonAfter="个"
                            />
                          </div>
                          <div style={{ width: 1, height: 16, background: _isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.08)' }} />
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Text style={{ color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)', fontSize: 12, whiteSpace: 'nowrap' }}>每夹文件</Text>
                            <InputNumber size="small" min={1} max={10000}
                              value={levelMaxFilesPerFolder[lv.group_key] ?? 100}
                              onChange={(val) => setLevelMaxFilesPerFolder(prev => ({ ...prev, [lv.group_key]: val ?? 100 }))}
                              style={{ width: 72 }}
                              addonAfter="个"
                            />
                          </div>
                        </div>
                      )}

                    </div>
                  );
                })}
                {levels.length === 0 && <Text style={{ color: _isLight ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)', display: 'block', textAlign: 'center', padding: 16, fontSize: 13 }}>暂无用户等级，请先在「用户管理 → 用户等级」中创建</Text>}
              </div>
            )}
          </div>

          {name === 'playground' && (
            <div style={{
              background: _isLight ? '#fff' : '#141414', borderRadius: 8,
              border: _isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.08)', padding: '20px', marginBottom: 16
            }}>
              <Text strong style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 14 }}>资源配额管理</Text><br />
              <Text style={{ color: _isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)', fontSize: 12 }}>{isAllLevels ? '全局默认的模型创作中心配额（对所有用户生效）' : '按已选等级单独设置资源配额'}</Text>
              <Divider style={{ borderColor: _isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)', margin: '14px 0' }} />

              {/* 表头 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr repeat(3, 140px)', gap: 8, padding: '0 14px 8px', alignItems: 'center' }}>
                <Text style={{ color: _isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)', fontSize: 11 }}>等级</Text>
                <Text style={{ color: _isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)', fontSize: 11, textAlign: 'center' }}>存储空间</Text>
                <Text style={{ color: _isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)', fontSize: 11, textAlign: 'center' }}>项目限制</Text>
                <Text style={{ color: _isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)', fontSize: 11, textAlign: 'center' }}>每个项目素材</Text>
              </div>

              {/* 全局默认行（仅在对所有用户等级开放时显示） */}
              {isAllLevels && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr repeat(3, 140px)', gap: 8, padding: '10px 14px', borderRadius: 6, border: '1px solid rgba(22,119,255,0.3)', background: 'rgba(22,119,255,0.04)', marginBottom: 8, alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Text style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 13, fontWeight: 500 }}>全局默认</Text>
                    <Tag color="blue" style={{ margin: 0, fontSize: 11 }}>默认值</Tag>
                  </div>
                  <InputNumber size="small" min={1} max={10240}
                    value={defaultQuota} onChange={(val) => setDefaultQuota(val ?? 100)}
                    style={{ width: '100%' }}
                    addonAfter="MB"
                  />
                  <InputNumber size="small" min={1} max={1000}
                    value={defaultMaxProjects} onChange={(val) => setDefaultMaxProjects(val ?? 3)}
                    style={{ width: '100%' }}
                    addonAfter="个"
                  />
                  <InputNumber size="small" min={1} max={1000}
                    value={defaultMaxAssets} onChange={(val) => setDefaultMaxAssets(val ?? 10)}
                    style={{ width: '100%' }}
                    addonAfter="个"
                  />
                </div>
              )}

              {/* 按等级覆盖（仅"按等级单独设置"模式且有已选等级时显示） */}
              {!isAllLevels && (() => {
                const selected = levels.filter(lv => selectedLevels.includes(lv.id.toString()) || selectedLevels.includes(lv.group_key));
                return selected.length > 0 ? (
                  <>

                    {selected.map(lv => (
                      <div key={lv.id.toString()}
                        style={{ display: 'grid', gridTemplateColumns: '1fr repeat(3, 140px)', gap: 8, padding: '8px 14px', borderRadius: 6, border: _isLight ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(255,255,255,0.06)', background: 'transparent', marginBottom: 6, alignItems: 'center' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Text style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 13 }}>
                            {lv.name}
                            <span style={{ color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)', fontSize: 12, marginLeft: 6 }}>
                              (ULID: {lv.id.toString().padStart(4, '0')}{lv.discount != null ? `，折扣倍率: ${lv.discount}` : ''})
                            </span>
                          </Text>
                        </div>
                        <InputNumber size="small" min={1} max={10240}
                          value={levelQuotas[lv.id.toString()] ?? defaultQuota}
                          onChange={(val) => setLevelQuotas(prev => ({ ...prev, [lv.id.toString()]: val ?? defaultQuota }))}
                          style={{ width: '100%' }}
                          addonAfter="MB"
                        />
                        <InputNumber size="small" min={1} max={1000}
                          value={levelMaxProjects[lv.id.toString()] ?? defaultMaxProjects}
                          onChange={(val) => setLevelMaxProjects(prev => ({ ...prev, [lv.id.toString()]: val ?? defaultMaxProjects }))}
                          style={{ width: '100%' }}
                          addonAfter="个"
                        />
                        <InputNumber size="small" min={1} max={1000}
                          value={levelMaxAssets[lv.id.toString()] ?? defaultMaxAssets}
                          onChange={(val) => setLevelMaxAssets(prev => ({ ...prev, [lv.id.toString()]: val ?? defaultMaxAssets }))}
                          style={{ width: '100%' }}
                          addonAfter="个"
                        />
                      </div>
                    ))}
                  </>
                ) : null;
              })()}
            </div>
          )}

          {isAllLevels && (name === 'asset_manager' || name === 'asset_manager_intl') && (
            <div style={{
              background: _isLight ? '#fff' : '#141414', borderRadius: 8,
              border: _isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.08)', padding: '20px', marginBottom: 16
            }}>
              <Text strong style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 14 }}>资源配额管理</Text><br />
              <Text style={{ color: _isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)', fontSize: 12 }}>设置每位用户的存储空间、文件夹数量、每文件夹文件数上限，可按等级单独覆盖</Text>
              <Divider style={{ borderColor: _isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)', margin: '14px 0' }} />

              {/* 表头 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr repeat(3, 140px)', gap: 8, padding: '0 14px 8px', alignItems: 'center' }}>
                <Text style={{ color: _isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)', fontSize: 11 }}>等级</Text>
                <Text style={{ color: _isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)', fontSize: 11, textAlign: 'center' }}>存储空间</Text>
                <Text style={{ color: _isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)', fontSize: 11, textAlign: 'center' }}>文件夹上限</Text>
                <Text style={{ color: _isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)', fontSize: 11, textAlign: 'center' }}>每夹文件上限</Text>
              </div>

              {/* 全局默认行 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr repeat(3, 140px)', gap: 8, padding: '10px 14px', borderRadius: 6, border: '1px solid rgba(22,119,255,0.3)', background: 'rgba(22,119,255,0.04)', marginBottom: 8, alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Text style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 13, fontWeight: 500 }}>全局默认</Text>
                  <Tag color="blue" style={{ margin: 0, fontSize: 11 }}>默认值</Tag>
                </div>
                <InputNumber size="small" min={1} max={10240}
                  value={defaultQuota} onChange={(val) => setDefaultQuota(val ?? 100)}
                  style={{ width: '100%' }}
                  addonAfter="MB"
                />
                <InputNumber size="small" min={1} max={1000}
                  value={defaultMaxFolders} onChange={(val) => setDefaultMaxFolders(val ?? 20)}
                  style={{ width: '100%' }}
                  addonAfter="个"
                />
                <InputNumber size="small" min={1} max={10000}
                  value={defaultMaxFilesPerFolder} onChange={(val) => setDefaultMaxFilesPerFolder(val ?? 100)}
                  style={{ width: '100%' }}
                  addonAfter="个"
                />
              </div>

              {/* 按等级覆盖 */}
              {levels.length > 0 && (
                <>
                  <Text style={{ color: _isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)', fontSize: 12, display: 'block', margin: '12px 0 8px' }}>按等级单独设置（覆盖全局默认值）</Text>
                  {levels.map(lv => (
                    <div key={lv.id.toString()}
                      style={{ display: 'grid', gridTemplateColumns: '1fr repeat(3, 140px)', gap: 8, padding: '8px 14px', borderRadius: 6, border: _isLight ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(255,255,255,0.06)', background: 'transparent', marginBottom: 6, alignItems: 'center' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Text style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 13 }}>
                          {lv.name}
                          <span style={{ color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)', fontSize: 12, marginLeft: 6 }}>
                            (ULID: {lv.id.toString().padStart(4, '0')}{lv.discount != null ? `，折扣倍率: ${lv.discount}` : ''})
                          </span>
                        </Text>
                      </div>
                      <InputNumber size="small" min={1} max={10240}
                        value={levelQuotas[lv.id.toString()] ?? levelQuotas[lv.group_key] ?? defaultQuota}
                        onChange={(val) => setLevelQuotas(prev => ({ ...prev, [lv.id.toString()]: val ?? defaultQuota }))}
                        style={{ width: '100%' }}
                        addonAfter="MB"
                      />
                      <InputNumber size="small" min={1} max={1000}
                        value={levelMaxFolders[lv.id.toString()] ?? defaultMaxFolders}
                        onChange={(val) => setLevelMaxFolders(prev => ({ ...prev, [lv.id.toString()]: val ?? defaultMaxFolders }))}
                        style={{ width: '100%' }}
                        addonAfter="个"
                      />
                      <InputNumber size="small" min={1} max={10000}
                        value={levelMaxFilesPerFolder[lv.id.toString()] ?? defaultMaxFilesPerFolder}
                        onChange={(val) => setLevelMaxFilesPerFolder(prev => ({ ...prev, [lv.id.toString()]: val ?? defaultMaxFilesPerFolder }))}
                        style={{ width: '100%' }}
                        addonAfter="个"
                      />
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSaveBasic}>保存配置</Button>
      </div>
    </div>
  );

  const inputStyle = {};
  // 支持独立存储配置的插件：素材中心、素材中心国际版、创作中心
  const isAssetManagerPlugin = name === 'asset_manager' || name === 'asset_manager_intl' || name === 'playground';
  // 创作中心插件标识（用于展示前端直传 CORS 配置说明）
  const isPlaygroundPlugin = name === 'playground';
  const storageTab = (
    <div>
      {isAssetManagerPlugin ? (
        <>
          {/* 状态提示：基于插件独立存储是否已配置 tos_access_key 来判断 */}
          {storageConfig && (
            <div style={{ marginBottom: 16 }}>
              {storageConfig.tos_access_key ? (
                <Alert
                  type="success"
                  showIcon
                  icon={<CheckCircleOutlined />}
                  message="对象存储已配置"
                  description={`当前 Bucket: ${storageConfig.tos_bucket}，Endpoint: ${storageConfig.tos_endpoint}`}
                  style={{ background: 'rgba(82,196,26,0.06)', border: '1px solid rgba(82,196,26,0.2)' }}
                />
              ) : (
                <Alert
                  type="warning"
                  showIcon
                  message="对象存储未配置"
                  description="用户上传素材功能需要先完成火山引擎 TOS 对象存储配置"
                  style={{ background: 'rgba(250,173,20,0.06)', border: '1px solid rgba(250,173,20,0.2)' }}
                />
              )}
            </div>
          )}

          <div style={{
            background: _isLight ? '#fff' : '#141414', borderRadius: 8,
            border: _isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.08)', padding: '20px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <CloudServerOutlined style={{ color: '#1677ff', fontSize: 16 }} />
              <Text strong style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 14 }}>火山引擎 TOS 对象存储</Text>
            </div>

            {/* 插件独立存储配置表单 */}
            <Form form={storageForm} layout="vertical" requiredMark={false}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                <Form.Item label={<Text style={{ color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)' }}>Access Key</Text>} name="tos_access_key" rules={[{ required: true, message: '请输入 Access Key' }]}>
                  <Input placeholder="火山引擎 Access Key" style={inputStyle} />
                </Form.Item>
                <Form.Item
                  label={<Text style={{ color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)' }}>Secret Key</Text>}
                  name="tos_secret_key"
                  extra={storageConfig?.tos_secret_key_masked ? <Text style={{ color: _isLight ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)', fontSize: 11 }}>当前: {storageConfig.tos_secret_key_masked}（留空则不修改）</Text> : undefined}
                >
                  <Input.Password placeholder="火山引擎 Secret Key" style={inputStyle} />
                </Form.Item>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0 16px' }}>
                <Form.Item label={<Text style={{ color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)' }}>数据地域</Text>} name="tos_region" rules={[{ required: true, message: '请选择数据地域' }]}>
                  <Select
                    placeholder="选择数据地域"
                    style={{ width: '100%' }}
                    popupClassName="dark-select-dropdown"
                    showSearch
                    optionFilterProp="label"
                    onChange={(value: string) => {
                      const found = ALL_TOS_REGIONS.find(r => r.region === value);
                      if (found) {
                        const ep = tosNetworkType === 'internal' ? found.endpointInternal : found.endpointExternal;
                        storageForm.setFieldsValue({ tos_endpoint: ep });
                      }
                    }}
                  >
                    {TOS_REGION_GROUPS.map(g => (
                      <Select.OptGroup key={g.group} label={<span style={{ fontWeight: 600, fontSize: 13 }}>{g.group}</span>}>
                        {g.regions.map(r => (
                          <Select.Option key={r.region} value={r.region} label={`${r.label} ${r.region}`}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span>{r.label}</span>
                              <span style={{ color: _isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)', fontSize: 12 }}>{r.region.replace(/^bp-/, '')}</span>
                            </div>
                          </Select.Option>
                        ))}
                      </Select.OptGroup>
                    ))}
                  </Select>
                </Form.Item>
                <Form.Item label={<Text style={{ color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)' }}>网络类型</Text>}>
                  <Radio.Group
                    value={tosNetworkType}
                    onChange={(e) => {
                      const newType = e.target.value as 'external' | 'internal';
                      setTosNetworkType(newType);
                      // 如果已选地域，自动切换 endpoint
                      const currentRegion = storageForm.getFieldValue('tos_region');
                      if (currentRegion) {
                        const found = ALL_TOS_REGIONS.find(r => r.region === currentRegion);
                        if (found) {
                          const ep = newType === 'internal' ? found.endpointInternal : found.endpointExternal;
                          storageForm.setFieldsValue({ tos_endpoint: ep });
                        }
                      }
                    }}
                    optionType="button"
                    buttonStyle="solid"
                    size="middle"
                    options={[
                      { label: '外网', value: 'external' },
                      { label: '内网', value: 'internal' },
                    ]}
                  />
                </Form.Item>
              </div>
              <Form.Item label={<Text style={{ color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)' }}>Endpoint</Text>} name="tos_endpoint" rules={[{ required: true, message: '请选择地域后自动填充' }]}
                extra={<Text style={{ color: _isLight ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)', fontSize: 11 }}>选择地域和网络类型后自动填充，也可手动修改</Text>}
              >
                <Input placeholder="选择地域后自动填充" style={inputStyle} />
              </Form.Item>

              <Form.Item label={<Text style={{ color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)' }}>Bucket</Text>} name="tos_bucket" rules={[{ required: true, message: '请输入 Bucket 名称' }]}>
                <Input placeholder="对象存储桶名称" style={inputStyle} />
              </Form.Item>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                <Form.Item label={<Text style={{ color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)' }}>路径前缀</Text>} name="tos_path_prefix" extra={<Text style={{ color: _isLight ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)', fontSize: 11 }}>选填，如 assets/upload</Text>}>
                  <Input placeholder="如 assets/" style={inputStyle} />
                </Form.Item>
                <Form.Item label={<Text style={{ color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)' }}>自定义域名</Text>} name="tos_custom_domain" extra={<Text style={{ color: _isLight ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)', fontSize: 11 }}>选填，CDN 加速域名</Text>}>
                  <Input placeholder="如 https://cdn.example.com" style={inputStyle} />
                </Form.Item>
              </div>
            </Form>

            {/* 测试结果 */}
            {testResult && (
              <div style={{ marginBottom: 16 }}>
                <Alert
                  type={testResult.success ? 'success' : 'error'}
                  showIcon
                  message={testResult.success ? '连接成功' : '连接失败'}
                  description={testResult.message}
                  style={{ background: testResult.success ? 'rgba(82,196,26,0.06)' : 'rgba(255,77,79,0.06)', border: `1px solid ${testResult.success ? 'rgba(82,196,26,0.2)' : 'rgba(255,77,79,0.2)'}` }}
                />
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Button icon={<ApiOutlined />} loading={testing} onClick={handleTestConnection}>测试连接</Button>
              <Button type="primary" icon={<SaveOutlined />} loading={savingStorage} onClick={handleSaveStorage}>保存存储配置</Button>
            </div>
          </div>

          {/* CORS 配置说明：仅创作中心插件展示，指引运营者配置前端直传功能 */}
          {isPlaygroundPlugin && (
            <div style={{
              marginTop: 16, padding: '16px 20px', borderRadius: 8,
              background: _isLight ? 'rgba(22,119,255,0.03)' : 'rgba(22,119,255,0.06)',
              border: _isLight ? '1px solid rgba(22,119,255,0.15)' : '1px solid rgba(22,119,255,0.2)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <InfoCircleOutlined style={{ color: '#1677ff', fontSize: 14 }} />
                <Text strong style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 13 }}>前端直传 TOS 所需的 CORS 配置</Text>
                <Tag color="blue" style={{ margin: 0, fontSize: 11 }}>可选但推荐</Tag>
              </div>
              <Text style={{ color: _isLight ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.55)', fontSize: 12, lineHeight: '20px', display: 'block', marginBottom: 10 }}>
                创作中心支持浏览器直接上传文件到 TOS（无需经过服务器中转，显著节省服务器带宽）。
                直传请求发往 TOS 官方域名（与自定义域名 / CDN 解耦，避免签名 Host 不一致）；上传成功后的访问地址仍可使用自定义域名。
                若需启用此功能，请在火山引擎 TOS 控制台完成以下 CORS 配置，否则上传将自动降级为服务器中转模式。
              </Text>
              <div style={{ background: _isLight ? '#f8fafc' : '#1a1a2e', borderRadius: 6, padding: '10px 14px', fontSize: 12 }}>
                <div style={{ marginBottom: 6 }}>
                  <Text style={{ color: '#1677ff', fontSize: 12 }}>操作路径：</Text>
                  <Text style={{ color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)', fontSize: 12 }}>火山引擎控制台 → 对象存储 TOS → 选择 Bucket → 权限管理 → CORS 设置 → 添加规则</Text>
                </div>
                {[
                  { label: '允许来源 AllowedOrigin', value: '本站完整域名，如 https://your-domain.com（请勿填写 *，存在安全风险）' },
                  { label: '允许方法 AllowedMethod', value: 'PUT、GET、HEAD' },
                  { label: '允许请求头 AllowedHeader', value: 'Content-Type、Content-Length' },
                  { label: '暴露响应头 ExposeHeader', value: 'ETag' },
                  { label: '预检缓存 MaxAgeSeconds', value: '3600' },
                ].map(item => (
                  <div key={item.label} style={{ display: 'flex', gap: 8, marginBottom: 3, alignItems: 'flex-start' }}>
                    <Text style={{ color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.4)', fontSize: 11, whiteSpace: 'nowrap', minWidth: 160 }}>{item.label}:</Text>
                    <Text style={{ color: _isLight ? '#1f2937' : '#e2e8f0', fontSize: 11 }}>{item.value}</Text>
                  </div>
                ))}
              </div>
              <Text style={{ color: _isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.3)', fontSize: 11, marginTop: 8, display: 'block' }}>
                💡 配置后用户上传文件将直接传输到 TOS，不再经过服务器，大幅降低带宽消耗。未配置时自动降级为服务器中转，功能不受影响。
              </Text>
            </div>
          )}
        </>
      ) : (
        /* 其它插件继续继承站点全局存储设置 */
        <div style={{
          background: _isLight ? '#fff' : '#141414', borderRadius: 8,
          border: _isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.08)', padding: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <CloudServerOutlined style={{ color: '#1677ff', fontSize: 16 }} />
            <Text strong style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 14 }}>火山引擎 TOS 对象存储</Text>
          </div>

          <Alert
            type={storageConfig?.global_configured ? "success" : "warning"}
            showIcon
            icon={storageConfig?.global_configured ? <CheckCircleOutlined /> : <InfoCircleOutlined />}
            message={storageConfig?.global_configured ? "已使用全局存储设置" : "未配置存储"}
            description={
              <div>
                <p style={{ margin: 0 }}>当前存储默认使用<b>管理后台「站点设置 → 存储设置」</b>里面的对象存储配置，无需在此处单独进行配置。</p>
                {storageConfig?.global_configured ? (
                  <div style={{ marginTop: 12, borderTop: _isLight ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(255,255,255,0.08)', paddingTop: 8 }}>
                    <p style={{ margin: '4px 0 0 0', fontSize: 12 }}>
                      <b>已启用全局存储设置：</b>
                    </p>
                    <p style={{ margin: '4px 0 0 0', fontSize: 12 }}>
                      全局 Bucket: <code style={{ background: _isLight ? '#f3f4f6' : '#27272a', padding: '2px 4px', borderRadius: 4, fontFamily: 'monospace' }}>{storageConfig.global_tos_bucket}</code>
                    </p>
                    <p style={{ margin: '4px 0 0 0', fontSize: 12 }}>
                      全局 Endpoint: <code style={{ background: _isLight ? '#f3f4f6' : '#27272a', padding: '2px 4px', borderRadius: 4, fontFamily: 'monospace' }}>{storageConfig.global_tos_endpoint}</code>
                    </p>
                  </div>
                ) : (
                  <div style={{ marginTop: 12, color: '#ff4d4f' }}>
                    <p style={{ margin: 0, fontSize: 12 }}>
                      ⚠️ 系统提示：管理后台尚未配置全局对象存储，请先前往<b>「站点设置 → 存储设置」</b>中完成火山引擎 TOS 存储配置。
                    </p>
                  </div>
                )}
              </div>
            }
            style={{
              background: storageConfig?.global_configured ? 'rgba(82,196,26,0.06)' : 'rgba(250,173,20,0.06)',
              border: storageConfig?.global_configured ? '1px solid rgba(82,196,26,0.2)' : '1px solid rgba(250,173,20,0.2)',
              padding: '16px'
            }}
          />
        </div>
      )}
    </div>
  );

  const handleToggleReviewEnabled = async (checked: boolean) => {
    setReviewEnabled(checked);
    try {
      const values = moderationForm.getFieldsValue();
      await request.post(`/plugins/${name}/moderation-config`, { ...values, review_enabled: checked });
      message.success(checked ? '素材审核功能已开启' : '素材审核功能已关闭');
    } catch (error: any) {
      console.error(error);
      const rawMsg = error?.response?.data?.error?.message || '';
      message.error(rawMsg || '切换失败');
      setReviewEnabled(!checked);
    }
  };

  // ====== 审核配置 Tab ======
  const moderationTab = (
    <div>
      {/* 审核功能开关 */}
      <div style={{
        background: _isLight ? '#fff' : '#141414', borderRadius: 8,
        border: _isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.08)',
        padding: '16px 20px', marginBottom: 16,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between'
      }}>
        <div>
          <Text strong style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 14 }}>素材审核功能</Text><br />
          <Text style={{ color: _isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)', fontSize: 12 }}>
            {moderationConfig?.is_configured
              ? '开启后用户上传的素材需要通过火山引擎审核才能使用；关闭后素材上传即可用，无需审核流程。'
              : '请先完成下方私域虚拟人像素材资产库配置（Access Key / Secret Key）后才可开启审核功能。'}
          </Text>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Tag color={reviewEnabled ? 'success' : 'default'} style={{ margin: 0, background: reviewEnabled ? 'rgba(82,196,26,0.1)' : 'rgba(255,255,255,0.04)', border: 'none' }}>{reviewEnabled ? '已开启' : '已关闭'}</Tag>
          <Switch
            checked={reviewEnabled}
            disabled={!moderationConfig?.is_configured}
            onChange={handleToggleReviewEnabled}
          />
        </div>
      </div>

      {/* 状态提示 */}
      {moderationConfig && (
        <div style={{ marginBottom: 16 }}>
          {moderationConfig.is_configured ? (
            <Alert
              type="success"
              showIcon
              icon={<CheckCircleOutlined />}
              message="私域素材资产库已配置"
              description="Access Key 已配置，可正常使用虚拟人像上传与审核功能"
              style={{ background: 'rgba(82,196,26,0.06)', border: '1px solid rgba(82,196,26,0.2)' }}
            />
          ) : (
            <Alert
              type="warning"
              showIcon
              message="私域素材资产库未配置"
              description="虚拟人像功能需要配置火山引擎 API 访问密钥，请前往火山引擎控制台获取"
              style={{ background: 'rgba(250,173,20,0.06)', border: '1px solid rgba(250,173,20,0.2)' }}
            />
          )}
        </div>
      )}

      <div style={{
        background: _isLight ? '#fff' : '#141414', borderRadius: 8,
        border: _isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.08)', padding: '20px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <ApiOutlined style={{ color: '#1677ff', fontSize: 16 }} />
          <Text strong style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 14 }}>私域虚拟人像素材资产库配置</Text>
        </div>
        <Text style={{ color: _isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)', fontSize: 12, display: 'block', marginBottom: 16 }}>
          请前往火山引擎控制台 → 头像下拉菜单 →「API访问密钥」页面，创建并获取 Access Key ID 和 Secret Access Key
        </Text>

        <Form form={moderationForm} layout="vertical" requiredMark={false}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item label={<Text style={{ color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)' }}>Access Key ID</Text>} name="volc_access_key" rules={[{ required: true, message: '请输入 Access Key ID' }]}>
              <Input placeholder="Access Key ID" style={inputStyle} />
            </Form.Item>
            <Form.Item
              label={<Text style={{ color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)' }}>Secret Access Key</Text>}
              name="volc_secret_key"
              rules={[{ required: !moderationConfig?.is_configured, message: '请输入 Secret Access Key' }]}
              extra={moderationConfig?.volc_secret_key_masked ? <Text style={{ color: _isLight ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)', fontSize: 11 }}>当前: {moderationConfig.volc_secret_key_masked}（留空则不修改）</Text> : undefined}
            >
              <Input.Password placeholder="Secret Access Key" style={inputStyle} />
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item
              label={<Text style={{ color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)' }}>使用项目名称 (ProjectName)</Text>}
              name="volc_project_name"
              extra={<Text style={{ color: _isLight ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)', fontSize: 11 }}>接口调用时使用的项目名称，留空则默认为 default</Text>}
            >
              <Input placeholder="default" style={inputStyle} />
            </Form.Item>
            <Form.Item
              label={<Text style={{ color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)' }}>API 地域 (Region)</Text>}
              name="volc_region"
              extra={<Text style={{ color: _isLight ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)', fontSize: 11 }}>选择火山引擎方舟 API 的服务地域，影响签名和请求路由</Text>}
            >
              <Select
                placeholder="选择 API 地域"
                style={{ width: '100%' }}
                popupClassName="dark-select-dropdown"
                options={[
                  { value: 'cn-beijing', label: <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span>🇨🇳 国内版</span><span style={{ color: _isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)', fontSize: 12 }}>cn-beijing</span></div> },
                  { value: 'ap-southeast-1', label: <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span>🌏 国际版</span><span style={{ color: _isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)', fontSize: 12 }}>ap-southeast-1</span></div> },
                ]}
              />
            </Form.Item>
          </div>
          {(name === 'asset_manager' || name === 'asset_manager_intl') && (
            <Form.Item
              label={<Text style={{ color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)' }}>Ark 转换素材组 ID (GroupID)</Text>}
              name="volc_group_id"
              extra={<Text style={{ color: _isLight ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)', fontSize: 11 }}>系统将在首次转换素材时自动向方舟申请并绑定专属群组 ID，自动管理无需干预</Text>}
            >
              <Input disabled placeholder="留空交由系统自动为您生成管理" style={{ ...inputStyle, color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)' }} />
            </Form.Item>
          )}
        </Form>

        {/* 审核请求地址信息 */}
        {moderationConfig?.is_configured && (
          <div style={{
            marginTop: 16, padding: '12px 16px', borderRadius: 6,
            background: _isLight ? 'rgba(22,119,255,0.04)' : 'rgba(22,119,255,0.08)',
            border: _isLight ? '1px solid rgba(22,119,255,0.15)' : '1px solid rgba(22,119,255,0.2)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <CloudServerOutlined style={{ color: '#1677ff', fontSize: 13 }} />
              <Text style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 13, fontWeight: 500 }}>审核请求地址</Text>
              <Tag color="blue" style={{ margin: 0, fontSize: 11, lineHeight: '18px' }}>
                {(moderationConfig?.volc_region || 'cn-beijing') === 'ap-southeast-1' ? '国际版' : '国内版'}
              </Tag>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)', fontSize: 11, whiteSpace: 'nowrap' }}>WithRegion</Text>
                <Text copyable code style={{ fontSize: 12, fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  {moderationConfig?.volc_region || 'cn-beijing'}
                </Text>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)', fontSize: 11, whiteSpace: 'nowrap' }}>Endpoint</Text>
                <Text copyable code style={{ fontSize: 12, fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  {moderationConfig?.review_api_url || 'https://open.volcengineapi.com/?Action=CreateAsset&Version=2024-01-01'}
                </Text>
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <Button type="primary" icon={<SaveOutlined />} loading={savingModeration} onClick={handleSaveModeration}>保存审核配置</Button>
        </div>
      </div>
    </div>
  );

  // ====== 高可用配置 Tab ======
  const haConfigTab = (
    <div>
      <div style={{
        background: _isLight ? '#fff' : '#141414', borderRadius: 8,
        border: _isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.08)', padding: '20px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <Text strong style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 14 }}>高可用 Failover 参数配置</Text>
        </div>
        <Form form={haForm} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="ha_max_retries"
                label="最大备用切换次数 (次)"
                tooltip="控制当物理上游损坏时，允许向下 Failover 切换重试的最大子渠道个数。同时也作为添加渠道虚拟组时多渠道绑定的多选勾选上限。"
                rules={[{ required: true, message: '请输入最大重试次数' }]}
              >
                <InputNumber min={1} max={10} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="ha_cooldown_429"
                label="限流 (429) 熔断阻断时长 (秒)"
                tooltip="上游返回 429 Too Many Requests 时，该子渠道在内存中熔断冷却的倒计时秒数。"
                rules={[{ required: true, message: '请输入冷却时间' }]}
              >
                <InputNumber min={5} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="ha_cooldown_network"
                label="网络超时 / 5xx 熔断阻断时长 (秒)"
                tooltip="上游连接超时、DNS失败、网关502等，该子渠道在内存中熔断冷却的倒计时秒数。"
                rules={[{ required: true, message: '请输入冷却时间' }]}
              >
                <InputNumber min={5} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="ha_cooldown_auth"
                label="鉴权失效 / 欠费 (401/402) 熔断阻断时长 (秒)"
                tooltip="上游返回 401 密钥失效、402 余额耗尽等错误时，在内存中拉黑该渠道的倒计时秒数。"
                rules={[{ required: true, message: '请输入冷却时间' }]}
              >
                <InputNumber min={5} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="ha_cooldown_404"
                label="上游返回 404 熔断阻断时长 (秒)"
                tooltip="上游返回 404 Not Found 时（如接口路径配错或模型下线等），在内存中熔断拉黑该渠道的倒计时秒数。设置为较小值可快速恢复。"
                rules={[{ required: true, message: '请输入冷却时间' }]}
              >
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="ha_meltdown_whitelist"
            label="报错信息不熔断白名单"
            tooltip="输入上游报错信息中的关键词，当上游返回的错误信息包含白名单中的任意一条关键词时（不区分大小写），将跳过熔断，不冷却对应子渠道。适用于上游返回的业务级错误提示（如内容安全审核等）不应触发渠道切换的场景。"
          >
            <Select
              mode="tags"
              style={{ width: '100%' }}
              placeholder="输入报错关键词后按回车添加，例如：内容安全、content_filter"
              tokenSeparators={['\n']}
              open={false}
              suffixIcon={null}
            />
          </Form.Item>
        </Form>
      </div>
      <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
        <Button type="primary" icon={<SaveOutlined />} loading={savingHa} onClick={handleSaveHaConfig}>保存配置</Button>
      </div>
    </div>
  );

  // ====== 审核日志 Tab ======


  const fetchAuditLogs = async () => {
    try {
      setAuditLoading(true);
      const res = await (request.get(`/assets/admin/list?category=虚拟人像`, { headers: { 'x-plugin-ns': name } }) as any);
      if (res.assets) {
        setAuditLogs(res.assets);
      }
      if (res.uid_map) {
        setAuditUidMap(res.uid_map);
      }
    } catch (e) {
      console.error('获取审核日志失败', e);
    } finally {
      setAuditLoading(false);
    }
  };

  const auditLogColumns = [
    {
      title: '用户 UID',
      dataIndex: 'user_id',
      key: 'user_id',
      width: 140,
      render: (userId: string) => {
        const info = auditUidMap[userId];
        return info ? (
          <span>
            <Text copyable style={{ fontSize: 12 }}>{info.uid}</Text>
            <div style={{ fontSize: 11, color: _isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)' }}>{info.username}</div>
          </span>
        ) : <Text style={{ fontSize: 12 }}>{userId?.slice(0, 8)}...</Text>;
      }
    },
    {
      title: '文件名',
      dataIndex: 'file_name',
      key: 'file_name',
      ellipsis: true
    },
    {
      title: '预览',
      key: 'preview',
      width: 80,
      render: (_: any, record: any) => {
        if (record.file_url) {
          let url = record.file_url;
          if (!url.startsWith('http') && !url.startsWith('/')) url = `https://${url}`;
          return <img src={url} alt="" style={{ width: 50, height: 50, objectFit: 'cover', borderRadius: 4 }} />;
        }
        return <Text type="secondary">-</Text>;
      }
    },
    {
      title: 'Asset ID',
      dataIndex: 'asset_id',
      key: 'asset_id',
      width: 160,
      render: (aid: string) => aid ? <Text code style={{ fontSize: 11 }}>{aid.slice(0, 20)}...</Text> : <Text type="secondary">暂无</Text>
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: string, record: any) => {
        if (status === 'uploaded') return <Tag color="blue" icon={<SendOutlined />}>待提交审核</Tag>;
        if (status === 'processing') return <Tag color="processing" icon={<LoadingOutlined spin />}>审核中</Tag>;
        if (status === 'approved') return <Tag color="success" icon={<CheckCircleOutlined />}>已通过</Tag>;
        if (status === 'rejected') return (
          <span>
            <Tag color="error" icon={<CloseCircleOutlined />}>已驳回</Tag>
            {record.reject_reason && <div style={{ fontSize: 11, color: '#ff4d4f', marginTop: 2 }}>{record.reject_reason}</div>}
          </span>
        );
        if (status === 'pending') return <Tag color="warning">待审核</Tag>;
        return <Tag>{status}</Tag>;
      }
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (t: string) => t ? <Text style={{ fontSize: 12 }}>{new Date(t).toLocaleString('zh-CN')}</Text> : '-'
    },
  ];


  const fetchAssetInfo = async (assetId: string) => {
    if (!assetId || expandedAssetInfo[assetId]) return;
    try {
      setLoadingAssetInfo(prev => ({ ...prev, [assetId]: true }));
      const res = await (request.get(`/assets/admin/get-asset-info/${assetId}`) as any);
      setExpandedAssetInfo(prev => ({ ...prev, [assetId]: res }));
    } catch (e: any) {
      setExpandedAssetInfo(prev => ({ ...prev, [assetId]: { error: e?.response?.data?.error?.message || '查询失败' } }));
    } finally {
      setLoadingAssetInfo(prev => ({ ...prev, [assetId]: false }));
    }
  };

  const auditLogTab = (
    <div>
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: _isLight ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)', fontSize: 13 }}>共 {auditLogs.length} 条虚拟人像上传记录</Text>
        <Button size="small" onClick={fetchAuditLogs} loading={auditLoading}>刷新</Button>
      </div>
      <Table
        dataSource={auditLogs}
        columns={auditLogColumns}
        rowKey="id"
        loading={auditLoading}
        size="small"
        pagination={{ pageSize: 15 }}
        expandable={{
          expandedRowRender: record => {
            const aid = record.asset_id;
            if (!aid) return <Text type="secondary">该素材尚未提交到火山引擎，无详细信息</Text>;
            const info = expandedAssetInfo[aid];
            const loading = loadingAssetInfo[aid];
            if (loading || !info) return <Spin size="small" />;
            if (info?.error) return <Text type="danger">查询失败: {info.error}</Text>;
            if (!info) return <Spin size="small" />;
            return (
              <div style={{ padding: 16, background: _isLight ? '#fafafa' : '#1a1a1a', borderRadius: 8 }}>
                <Text strong style={{ color: '#1677ff', display: 'block', marginBottom: 12, fontSize: 14 }}>📄 火山引擎素材详情 (GetAsset)</Text>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px' }}>
                  <div><Text style={{ color: _isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)', fontSize: 12 }}>Asset ID</Text><br /><Text copyable style={{ fontSize: 13, fontFamily: 'monospace' }}>{info.Id}</Text></div>
                  <div><Text style={{ color: _isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)', fontSize: 12 }}>Group ID</Text><br /><Text copyable style={{ fontSize: 13, fontFamily: 'monospace' }}>{info.GroupId}</Text></div>
                  <div><Text style={{ color: _isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)', fontSize: 12 }}>状态 (Status)</Text><br /><Tag color={info.Status === 'Active' ? 'success' : info.Status === 'Failed' ? 'error' : 'processing'}>{info.Status}</Tag></div>
                  <div><Text style={{ color: _isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)', fontSize: 12 }}>素材类型 (AssetType)</Text><br /><Text style={{ fontSize: 13 }}>{info.AssetType}</Text></div>
                  <div><Text style={{ color: _isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)', fontSize: 12 }}>项目名称 (ProjectName)</Text><br /><Text style={{ fontSize: 13 }}>{info.ProjectName}</Text></div>
                  <div><Text style={{ color: _isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)', fontSize: 12 }}>创建时间 (CreateTime)</Text><br /><Text style={{ fontSize: 13 }}>{info.CreateTime ? new Date(info.CreateTime).toLocaleString('zh-CN') : '-'}</Text></div>
                  <div style={{ gridColumn: '1 / -1' }}><Text style={{ color: _isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)', fontSize: 12 }}>URL</Text><br /><Text copyable style={{ fontSize: 12, fontFamily: 'monospace', wordBreak: 'break-all' }}>{info.URL}</Text></div>
                </div>
              </div>
            );
          },
          onExpand: (expanded, record) => {
            if (expanded && record.asset_id) fetchAssetInfo(record.asset_id);
          }
        }}
      />
    </div>
  );


  const SOURCE_MAP: Record<string, { label: string; color: string }> = {
    api_proxy: { label: 'API 接口调用', color: 'blue' },
    page: { label: '页面操作', color: 'green' },
    relay_convert: { label: '转发规则替换', color: 'orange' }
  };

  const apiLogColumns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    {
      title: 'User ID',
      dataIndex: 'user_id',
      key: 'user_id',
      width: 140,
      render: (userId: string) => {
        const info = auditUidMap[userId];
        return info ? (
          <span>
            <Text copyable style={{ fontSize: 12 }}>{info.uid}</Text>
            <div style={{ fontSize: 11, color: _isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)' }}>{info.username}</div>
          </span>
        ) : <Text style={{ fontSize: 12 }}>{userId?.slice(0, 8)}...</Text>;
      }
    },
    { title: '接口名称', dataIndex: 'api_endpoint', key: 'api_endpoint', width: 180, render: (r: string) => <Tag color="cyan">{r}</Tag> },
    {
      title: '来源',
      dataIndex: 'source',
      key: 'source',
      width: 120,
      render: (s: string) => {
        const info = SOURCE_MAP[s] || { label: s, color: 'default' };
        return <Tag color={info.color}>{info.label}</Tag>;
      }
    },
    {
      title: '状态',
      dataIndex: 'status_code',
      key: 'status_code',
      width: 100,
      render: (s: number) => {
        if (s === 200) return <Tag color="success">成功 ({s})</Tag>;
        return <Tag color="error">失败 ({s})</Tag>;
      }
    },
    { title: '请求时间', dataIndex: 'created_at', key: 'created_at', width: 180, render: (t: string) => <Text style={{ fontSize: 12 }}>{new Date(t).toLocaleString('zh-CN')}</Text> },
  ];

  const apiLogTab = (
    <div>
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Select
            placeholder="来源筛选" allowClear
            value={logSourceFilter || undefined}
            onChange={(val) => { setLogSourceFilter(val || ''); setTimeout(() => fetchApiLogs(1), 0); }}
            style={{ width: 150 }}
            options={[
              { value: 'api_proxy', label: 'API 接口调用' },
              { value: 'page', label: '页面操作' },
              { value: 'relay_convert', label: '转发规则替换' },
            ]}
          />
          <Input.Search
            placeholder="搜索接口名 / 用户UID"
            allowClear
            value={logKeyword}
            onChange={(e) => setLogKeyword(e.target.value)}
            onSearch={() => fetchApiLogs(1)}
            style={{ width: 220 }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Text style={{ color: _isLight ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)', fontSize: 13 }}>共 {apiLogsTotal} 条记录</Text>
          <Button size="small" onClick={() => fetchApiLogs(apiLogsPage)} loading={apiLogsLoading}>刷新</Button>
        </div>
      </div>
      <Table
        dataSource={apiLogs}
        columns={apiLogColumns}
        rowKey="id"
        loading={apiLogsLoading}
        size="small"
        pagination={{
          current: apiLogsPage,
          total: apiLogsTotal,
          pageSize: 15,
          onChange: (page) => fetchApiLogs(page)
        }}
        expandable={{
          expandedRowRender: record => {
            const safeParse = (str: string) => {
              try { return typeof str === 'string' ? JSON.parse(str) : str; } catch { return { raw_text: str || '(空)' }; }
            };
            return (
              <div style={{ margin: 0, padding: 16, background: '#1e1e1e', borderRadius: 8 }}>
                <div style={{ marginBottom: 16 }}>
                  <Text strong style={{ color: '#1677ff', display: 'block', marginBottom: 8 }}>📤 Request Payload</Text>
                  <div style={{ background: _isLight ? '#fff' : '#141414', padding: '16px', borderRadius: '8px', maxHeight: '500px', overflow: 'auto', border: _isLight ? '1px solid #e8e8e8' : '1px solid #303030' }}>
                    <JsonView value={safeParse(record.request_payload)} style={_isLight ? lightTheme : darkTheme} collapsed={false} shortenTextAfterLength={0} displayDataTypes={false} displayObjectSize={false} />
                  </div>
                </div>
                <div>
                  <Text strong style={{ color: '#faad14', display: 'block', marginBottom: 8 }}>📥 Response Payload</Text>
                  <div style={{ background: _isLight ? '#fff' : '#141414', padding: '16px', borderRadius: '8px', maxHeight: '600px', overflow: 'auto', border: _isLight ? '1px solid #e8e8e8' : '1px solid #303030' }}>
                    <JsonView value={safeParse(record.response_payload)} style={_isLight ? lightTheme : darkTheme} collapsed={false} shortenTextAfterLength={0} displayDataTypes={false} displayObjectSize={false} />
                  </div>
                </div>
              </div>
            );
          }
        }}
      />
    </div>
  );



  const filteredPgModels = pgModels.filter(m => {
    if (pgSelectedProvider && m.provider_id !== pgSelectedProvider) return false;
    if (pgSelectedApiProvider && m.api_provider_id !== pgSelectedApiProvider) return false;
    if (pgSelectedType && m.type_id !== pgSelectedType) return false;

    if (!pgSearchKeyword) return true;
    const kw = pgSearchKeyword.toLowerCase();
    return m.name.toLowerCase().includes(kw) || m.model_id.toLowerCase().includes(kw) || m.mid?.toLowerCase()?.includes(kw);
  });

  const pgModelColumns = [
    {
      title: '模型名称',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: any) => {
        const scheme = pgSchemes.find(s => s.id === record.pg_scheme_id);
        return (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Text strong style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 13 }}>{name}</Text>
              {scheme && (
                <span style={{ fontSize: 11, color: '#1677ff', fontWeight: 'normal' }}>
                  (已挂载流：{scheme.name})
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: _isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)', fontFamily: 'monospace' }}>MID: {record.mid} | {record.model_id}</div>
          </div>
        );
      }
    },
    {
      title: '类型',
      dataIndex: 'type_name',
      key: 'type_name',
      width: 100,
      render: (t: string) => t ? (
        <Tag style={{ borderRadius: 4, background: _isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.04)', border: _isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.08)', color: _isLight ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.6)' }}>
          {t.includes('视频增强') ? <ThunderboltOutlined style={{ marginRight: 4 }} /> : t.includes('视频') ? <VideoCameraOutlined style={{ marginRight: 4 }} /> : t.includes('图片') ? <PictureOutlined style={{ marginRight: 4 }} /> : null}
          {t}
        </Tag>
      ) : <Text type="secondary">-</Text>
    },
    {
      title: '启用创作',
      key: 'pg_enabled',
      width: 100,
      render: (_: any, record: any) => (
        <Switch
          checked={record.pg_enabled}
          onChange={(val) => handlePgToggle(record.id, val)}
        />
      )
    },
    {
      title: '绑定方案',
      key: 'pg_scheme_id',
      width: 200,
      render: (_: any, record: any) => {
        const scheme = pgSchemes.find(s => s.id === record.pg_scheme_id);
        return scheme ? (
          <Tag color="blue" style={{ borderRadius: 12, fontSize: 12 }}>{scheme.name}</Tag>
        ) : (
          <Text style={{ color: _isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)', fontSize: 12 }}>未绑定</Text>
        );
      }
    },
    {
      title: '排序权重',
      key: 'pg_sort_order',
      width: 120,
      sorter: (a: any, b: any) => (a.pg_sort_order || 0) - (b.pg_sort_order || 0),
      render: (_: any, record: any) => (
        <InputNumber
          size="small"
          min={0}
          max={9999}
          value={record.pg_sort_order || 0}
          onChange={(val) => handlePgSortChange(record.id, val ?? 0)}
          style={{ width: 80 }}
        />
      )
    },
    {
      title: '默认展示',
      key: 'pg_default',
      width: 100,
      align: 'center' as const,
      render: (_: any, record: any) => {
        const isChecked = Array.isArray(pgDefaultModelMids) && pgDefaultModelMids.includes(record.mid);
        return (
          <Checkbox
            checked={isChecked}
            onChange={(e) => {
              const checked = e.target.checked;
              setPgDefaultModelMids(prev => {
                const prevList = Array.isArray(prev) ? prev : [];
                if (checked) {
                  if (!prevList.includes(record.mid)) {
                    return [...prevList, record.mid];
                  }
                } else {
                  return prevList.filter(mid => mid !== record.mid);
                }
                return prevList;
              });
            }}
            disabled={!record.pg_enabled}
          />
        );
      }
    },
    {
      title: '操作',
      key: 'action',
      width: 140,
      render: (_: any, record: any) => (
        <div style={{ display: 'flex', gap: 4 }}>
          <Button
            type="text"
            icon={<SettingOutlined />}
            onClick={() => handleOpenSchemeDrawer(record.id, record.pg_scheme_id)}
            style={{ color: '#1677ff' }}
          >
            方案
          </Button>
          {record.pg_scheme_id && (
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => {
                setPgOverrideModelId(record.id);
                setPgOverrideData(record.pg_param_overrides || { modify: {}, remove: [], add: [] });
                setPgOverrideModalVisible(true);
              }}
              style={{ color: '#faad14' }}
            >
              调参
            </Button>
          )}
        </div>
      )
    },
  ];

  const playgroundModelTab = (
    <div>
      <div style={{ background: _isLight ? '#fff' : '#141414', borderRadius: 8, padding: '20px', border: _isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.08)', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <Text strong style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 14 }}>可创作模型列表</Text>
            <Text style={{ color: _isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)', fontSize: 12, display: 'block', marginTop: 4 }}>
              开启启用开关并绑定方案后，用户即可在模型创作中心使用该模型。选中"默认展示"列后，可将模型设为默认展示（支持多选）。
            </Text>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <Input
              placeholder="搜索模型..."
              value={pgSearchKeyword}
              onChange={e => setPgSearchKeyword(e.target.value)}
              style={{ width: 220 }}
              allowClear
            />
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <ClassificationFilter
            providers={pgProvidersStats}
            apiProviders={pgApiProvidersStats}
            types={pgTypesStats}
            selectedProvider={pgSelectedProvider}
            selectedApiProvider={pgSelectedApiProvider}
            selectedType={pgSelectedType}
            onProviderChange={setPgSelectedProvider}
            onApiProviderChange={setPgSelectedApiProvider}
            onTypeChange={setPgSelectedType}
          />
        </div>

        {Array.isArray(pgDefaultModelMids) && pgDefaultModelMids.length > 0 && (() => {
          const selectedModels = pgModels.filter(m => pgDefaultModelMids.includes(m.mid));
          return selectedModels.length > 0 ? (
            <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 6, background: 'rgba(22,119,255,0.06)', border: '1px solid rgba(22,119,255,0.15)', fontSize: 12 }}>
              <Space wrap size={[4, 8]}>
                <Text style={{ color: '#1677ff' }}>默认展示的模型：</Text>
                {selectedModels.map(m => (
                  <Tag
                    key={m.mid}
                    color="blue"
                    closable
                    onClose={() => {
                      setPgDefaultModelMids(prev => prev.filter(mid => mid !== m.mid));
                    }}
                  >
                    {m.name}
                  </Tag>
                ))}
              </Space>
            </div>
          ) : null;
        })()}

        <Table
          dataSource={filteredPgModels}
          columns={pgModelColumns}
          rowKey="id"
          size="small"
          pagination={{ pageSize: 20 }}
          style={{ marginBottom: 16 }}
        />

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button type="primary" loading={savingPlayground} onClick={handleSavePlaygroundConfig} icon={<SaveOutlined />}>
            保存全部配置
          </Button>
        </div>
      </div>

      {/* 参数覆写 Modal */}
      <Modal
        title={`参数调整 — ${pgModels.find(m => m.id === pgOverrideModelId)?.name || ''}`}
        open={pgOverrideModalVisible}
        onCancel={() => setPgOverrideModalVisible(false)}
        width={640}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Button danger onClick={() => {
              setPgOverrideData({ modify: {}, remove: [], add: [] });
              setPgModels(prev => prev.map(m => m.id === pgOverrideModelId ? { ...m, pg_param_overrides: null } : m));
              setPgOverrideModalVisible(false);
              message.info('已清空覆写，保存后生效');
            }}>重置为预设</Button>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button onClick={() => setPgOverrideModalVisible(false)}>取消</Button>
              <Button type="primary" onClick={() => {
                const cleaned = { ...pgOverrideData };
                if (Object.keys(cleaned.modify || {}).length === 0) delete cleaned.modify;
                if ((cleaned.remove || []).length === 0) delete cleaned.remove;
                if ((cleaned.add || []).length === 0) delete cleaned.add;
                const hasOverrides = Object.keys(cleaned).length > 0;
                setPgModels(prev => prev.map(m => m.id === pgOverrideModelId ? { ...m, pg_param_overrides: hasOverrides ? cleaned : null } : m));
                setPgOverrideModalVisible(false);
                message.success('参数已调整，保存全部配置后生效');
              }}>确认</Button>
            </div>
          </div>
        }
      >
        {(() => {
          const model = pgModels.find(m => m.id === pgOverrideModelId);
          const scheme = pgSchemes.find(s => s.id === model?.pg_scheme_id);
          if (!scheme?.params) return <Text type="secondary">该模型未绑定方案或方案无参数</Text>;
          const overrides = pgOverrideData || { modify: {}, remove: [], add: [] };
          const removes = new Set(overrides.remove || []);
          const modifies = overrides.modify || {};

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Text style={{ color: _isLight ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)', fontSize: 12 }}>
                基于方案「{scheme.name}」的参数个性化调整（仅对此模型生效）
              </Text>
              {/* 预设参数列表 */}
              {scheme.params.map((p: any) => {
                const isRemoved = removes.has(p.key);
                const mod = modifies[p.key] || {};
                return (
                  <div key={p.key} style={{
                    padding: '10px 14px', borderRadius: 8,
                    background: isRemoved ? (_isLight ? 'rgba(255,0,0,0.03)' : 'rgba(255,0,0,0.06)') : (_isLight ? '#fafafa' : '#1a1a1a'),
                    border: _isLight ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(255,255,255,0.06)',
                    opacity: isRemoved ? 0.5 : 1,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isRemoved ? 0 : 8 }}>
                      <div>
                        <Text strong style={{ fontSize: 13, color: _isLight ? '#1f2937' : '#fff' }}>{p.label}</Text>
                        <Text style={{ fontSize: 11, color: _isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)', marginLeft: 8 }}>{p.key}</Text>
                      </div>
                      <Switch
                        checked={!isRemoved}
                        onChange={(checked) => {
                          const newRemoves = checked ? (overrides.remove || []).filter((k: string) => k !== p.key) : [...(overrides.remove || []), p.key];
                          setPgOverrideData({ ...overrides, remove: newRemoves });
                        }}
                        size="small"
                      />
                    </div>
                    {!isRemoved && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {p.type !== 'switch' && p.type !== 'slider' && Array.isArray(p.options) && (
                          <div style={{ flex: 1, minWidth: 200 }}>
                            <Text style={{ fontSize: 11, color: _isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 4 }}>选项 (逗号分隔)</Text>
                            <Input
                              size="small"
                              defaultValue={(mod.options || p.options).join(', ')}
                              key={`opts-${p.key}-${JSON.stringify(mod.options || p.options)}`}
                              onBlur={e => {
                                const isNumeric = typeof p.default === 'number' || (Array.isArray(p.options) && p.options.length > 0 && typeof p.options[0] === 'number');
                                const newOpts = e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean).map(x => (isNumeric && !isNaN(Number(x))) ? Number(x) : x);
                                const isOriginal = JSON.stringify(newOpts) === JSON.stringify(p.options);
                                const newMod = { ...modifies };
                                if (isOriginal) { delete newMod[p.key]; } else { newMod[p.key] = { ...mod, options: newOpts }; }
                                setPgOverrideData({ ...overrides, modify: newMod });
                              }}
                              onPressEnter={e => (e.target as HTMLInputElement).blur()}
                            />
                          </div>
                        )}
                        <div style={{ width: 120 }}>
                          <Text style={{ fontSize: 11, color: _isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 4 }}>默认值</Text>
                          {p.type === 'switch' ? (
                            <Switch
                              size="small"
                              checked={mod.default !== undefined ? mod.default : p.default}
                              onChange={v => {
                                const newMod = { ...modifies };
                                if (v === p.default) { delete newMod[p.key]; } else { newMod[p.key] = { ...mod, default: v }; }
                                setPgOverrideData({ ...overrides, modify: newMod });
                              }}
                            />
                          ) : (
                            <Input
                              size="small"
                              value={String(mod.default !== undefined ? mod.default : p.default)}
                              onChange={e => {
                                const rawVal = e.target.value;
                                let val: any = rawVal;
                                if (typeof p.default === 'number') {
                                  if (rawVal !== '' && !rawVal.endsWith('.') && !isNaN(Number(rawVal))) {
                                    val = Number(rawVal);
                                  }
                                } else if (p.type === 'slider') {
                                  val = Number(rawVal) || 0;
                                }
                                const newMod = { ...modifies };
                                if (val === p.default || String(val) === String(p.default)) { delete newMod[p.key]; } else { newMod[p.key] = { ...mod, default: val }; }
                                setPgOverrideData({ ...overrides, modify: newMod });
                              }}
                            />
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {/* 新增参数 */}
              <Divider style={{ margin: '4px 0', borderColor: _isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 13, color: _isLight ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.6)' }}>自定义新增参数</Text>
                <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={() => {
                  const adds = [...(overrides.add || [])];
                  adds.push({ key: '', label: '', type: 'select', options: [], default: '' });
                  setPgOverrideData({ ...overrides, add: adds });
                }}>添加</Button>
              </div>
              {(overrides.add || []).map((ap: any, idx: number) => {
                const updateAdd = (patch: any) => {
                  const adds = [...overrides.add];
                  adds[idx] = { ...ap, ...patch };
                  setPgOverrideData({ ...overrides, add: adds });
                };
                return (
                  <div key={idx} style={{ padding: '10px 12px', borderRadius: 6, background: _isLight ? 'rgba(22,119,255,0.03)' : 'rgba(22,119,255,0.06)', border: '1px solid rgba(22,119,255,0.15)', marginTop: 8 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 8 }}>
                      <div style={{ flex: 1 }}>
                        <Text style={{ fontSize: 11, color: _isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 2 }}>Key</Text>
                        <Input size="small" value={ap.key} onChange={e => updateAdd({ key: e.target.value })} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <Text style={{ fontSize: 11, color: _isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 2 }}>标签</Text>
                        <Input size="small" value={ap.label} onChange={e => updateAdd({ label: e.target.value })} />
                      </div>
                      <div style={{ width: 100 }}>
                        <Text style={{ fontSize: 11, color: _isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 2 }}>类型</Text>
                        <Select size="small" value={ap.type} onChange={v => updateAdd({ type: v, options: (v === 'select' || v === 'radio') ? (ap.options || []) : undefined, min: v === 'slider' ? (ap.min ?? 0) : undefined, max: v === 'slider' ? (ap.max ?? 1) : undefined, step: v === 'slider' ? (ap.step ?? 0.1) : undefined })} style={{ width: '100%' }}
                          options={[{ label: 'Select', value: 'select' }, { label: 'Radio', value: 'radio' }, { label: 'Switch', value: 'switch' }, { label: 'Slider', value: 'slider' }]} />
                      </div>
                      <Button type="text" size="small" icon={<DeleteOutlined />} danger onClick={() => {
                        const adds = overrides.add.filter((_: any, i: number) => i !== idx);
                        setPgOverrideData({ ...overrides, add: adds });
                      }} />
                    </div>
                    {/* 按类型显示对应配置字段 */}
                    {(ap.type === 'select' || ap.type === 'radio') && (
                      <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                        <div style={{ flex: 1 }}>
                          <Text style={{ fontSize: 11, color: _isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 2 }}>选项 (逗号分隔)</Text>
                          <Input size="small" defaultValue={(ap.options || []).join(', ')} key={`add-opts-${idx}-${(ap.options || []).length}`}
                            onBlur={e => {
                              const opts = e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean);
                              const isNumeric = opts.length > 0 && opts.every(x => !isNaN(Number(x)));
                              const parsedOpts = isNumeric ? opts.map(Number) : opts;
                              updateAdd({ options: parsedOpts });
                            }}
                            onPressEnter={e => (e.target as HTMLInputElement).blur()} />
                        </div>
                        <div style={{ width: 100 }}>
                          <Text style={{ fontSize: 11, color: _isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 2 }}>默认值</Text>
                          <Input size="small" value={String(ap.default || '')} onChange={e => {
                            const rawVal = e.target.value;
                            let val: any = rawVal;
                            const isNumericOptions = Array.isArray(ap.options) && ap.options.length > 0 && ap.options.every((x: any) => typeof x === 'number');
                            if ((isNumericOptions || !isNaN(Number(rawVal))) && rawVal !== '' && !rawVal.endsWith('.')) {
                              val = Number(rawVal);
                            }
                            updateAdd({ default: val });
                          }} />
                        </div>
                      </div>
                    )}
                    {ap.type === 'slider' && (
                      <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                        <div style={{ flex: 1 }}>
                          <Text style={{ fontSize: 11, color: _isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 2 }}>最小值</Text>
                          <Input size="small" type="number" value={ap.min ?? 0} onChange={e => updateAdd({ min: Number(e.target.value) })} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <Text style={{ fontSize: 11, color: _isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 2 }}>最大值</Text>
                          <Input size="small" type="number" value={ap.max ?? 1} onChange={e => updateAdd({ max: Number(e.target.value) })} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <Text style={{ fontSize: 11, color: _isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 2 }}>步长</Text>
                          <Input size="small" type="number" value={ap.step ?? 0.1} onChange={e => updateAdd({ step: Number(e.target.value) })} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <Text style={{ fontSize: 11, color: _isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 2 }}>默认值</Text>
                          <Input size="small" type="number" value={ap.default ?? 0} onChange={e => updateAdd({ default: Number(e.target.value) })} />
                        </div>
                      </div>
                    )}
                    {ap.type === 'switch' && (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                        <Text style={{ fontSize: 11, color: _isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)' }}>默认值</Text>
                        <Switch size="small" checked={!!ap.default} onChange={v => updateAdd({ default: v })} />
                      </div>
                    )}
                    <div>
                      <Text style={{ fontSize: 11, color: _isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 2 }}>提示 (选填)</Text>
                      <Input size="small" value={ap.hint || ''} onChange={e => updateAdd({ hint: e.target.value || undefined })} placeholder="参数说明" />
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </Modal>

      {/* 方案选择 Drawer */}
      <Drawer
        title="选择创作方案"
        open={pgSchemeDrawerVisible}
        onClose={() => setPgSchemeDrawerVisible(false)}
        width={580}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => { setPgSelectedSchemeId(''); handleConfirmScheme(); }}>取消绑定</Button>
            <Button type="primary" onClick={handleConfirmScheme}>确认绑定</Button>
          </div>
        }
      >
        <div style={{ marginBottom: 16 }}>
          <Text style={{ color: _isLight ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)', fontSize: 13 }}>
            为模型 <Text strong style={{ color: '#1677ff' }}>{pgModels.find(m => m.id === pgCurrentId)?.name}</Text> 选择一个创作方案
          </Text>
        </div>
        {(() => {
          const currentModelType = pgModels.find(m => m.id === pgCurrentId)?.type_name || '';
          const modelSchemeType = currentModelType.includes('视频') ? 'video' : currentModelType.includes('图片') ? 'image' : 'chat';
          const filteredSchemes = pgSchemes.filter(s => s.type === modelSchemeType);
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {filteredSchemes.map(scheme => {
                const isSelected = pgSelectedSchemeId === scheme.id;
                return (
                  <div
                    key={scheme.id}
                    style={{
                      padding: '16px 20px', borderRadius: 8,
                      border: isSelected ? '2px solid #1677ff' : (_isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.08)'),
                      background: isSelected ? (_isLight ? 'rgba(22,119,255,0.03)' : 'rgba(22,119,255,0.06)') : (_isLight ? '#fff' : '#141414'),
                      cursor: 'pointer', transition: 'all 0.2s',
                      boxShadow: isSelected ? '0 4px 12px rgba(22,119,255,0.08)' : 'none',
                      position: 'relative'
                    }}
                    onClick={() => setPgSelectedSchemeId(scheme.id)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingRight: 24 }}>
                      <Text strong style={{ color: isSelected ? '#1677ff' : (_isLight ? '#1f2937' : '#fff'), fontSize: 14 }}>
                        {scheme.name}
                      </Text>
                      {isSelected && (
                        <div style={{ position: 'absolute', top: 16, right: 16 }}>
                          <CheckCircleOutlined style={{ color: '#1677ff', fontSize: 18, fontWeight: 'bold' }} />
                        </div>
                      )}
                    </div>
                    <div>
                      <Text style={{ color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)', fontSize: 12, display: 'block', marginBottom: 8 }}>
                        {scheme.description}
                      </Text>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {scheme.params?.map((p: any) => (
                          <Tag key={p.key} style={{ fontSize: 11, borderRadius: 4, background: _isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.04)', border: _isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.08)', color: _isLight ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)', maxWidth: '100%', display: 'inline-flex', flexWrap: 'wrap', whiteSpace: 'normal', height: 'auto', padding: '4px 8px' }}>
                            <span style={{ wordBreak: 'break-all', whiteSpace: 'normal' }}>
                              {p.label}: {Array.isArray(p.options) ? (p.options.length > 4 ? p.options.slice(0, 4).join(' / ') + ` / ...(+${p.options.length - 4})` : p.options.join(' / ')) : String(p.default)}
                            </span>
                          </Tag>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
              {filteredSchemes.length === 0 && (
                <div style={{ textAlign: 'center', padding: '30px 0', color: _isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)' }}>暂无匹配类型的方案</div>
              )}
            </div>
          );
        })()}
      </Drawer>
    </div>
  );

  // ====== 体验方案配置 Tab ======
  const playgroundSchemeTab = (
    <div>
      <div style={{ background: _isLight ? '#fff' : '#141414', borderRadius: 8, padding: '20px', border: _isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <Text strong style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 14 }}>体验方案列表</Text>
            <Text style={{ color: _isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)', fontSize: 12, display: 'block', marginTop: 4 }}>
              管理内置和自定义的体验方案。每个方案定义了可配置的参数模板，绑定到模型后用户侧会动态展示。
            </Text>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <Radio.Group value={pgSchemeTypeFilter} onChange={e => setPgSchemeTypeFilter(e.target.value)}>
              <Radio.Button value="all">全部</Radio.Button>
              <Radio.Button value="chat">对话</Radio.Button>
              <Radio.Button value="image">图片</Radio.Button>
              <Radio.Button value="video">视频</Radio.Button>
            </Radio.Group>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAddScheme}>新增方案</Button>
          </div>
        </div>

        {(() => {
          const typeGroups: Record<string, { label: string; icon: React.ReactNode; color: string; schemes: { scheme: any; idx: number }[] }> = {
            video: { label: '视频生成方案', icon: <VideoCameraOutlined />, color: '#1677ff', schemes: [] },
            image: { label: '图片生成方案', icon: <PictureOutlined />, color: '#52c41a', schemes: [] },
            chat: { label: '聊天对话方案', icon: <MessageOutlined />, color: '#722ed1', schemes: [] },
            other: { label: '其他方案', icon: <AppstoreOutlined />, color: '#faad14', schemes: [] }
          };
          schemeList.forEach((scheme, idx) => {
            if (pgSchemeTypeFilter !== 'all') {
              if (pgSchemeTypeFilter === 'chat' && scheme.type !== 'chat') return;
              if (pgSchemeTypeFilter === 'video' && scheme.type !== 'video') return;
              if (pgSchemeTypeFilter === 'image' && scheme.type !== 'image') return;
            }
            const key = scheme.type === 'video' ? 'video' : scheme.type === 'image' ? 'image' : scheme.type === 'chat' ? 'chat' : 'other';
            typeGroups[key].schemes.push({ scheme, idx });
          });
          const activeGroups = Object.entries(typeGroups).filter(([, g]) => g.schemes.length > 0);
          if (activeGroups.length === 0) {
            return <div style={{ textAlign: 'center', padding: '40px 0', color: _isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)' }}>暂无方案，点击「新增方案」创建</div>;
          }
          return activeGroups.map(([key, group]) => (
            <div key={key} style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, paddingBottom: 8, borderBottom: `1px solid ${group.color}22` }}>
                <span style={{ color: group.color, fontSize: 16 }}>{group.icon}</span>
                <Text strong style={{ color: group.color, fontSize: 14 }}>{group.label}</Text>
                <Tag style={{ fontSize: 11, borderRadius: 10, background: `${group.color}15`, border: `1px solid ${group.color}30`, color: group.color }}>{group.schemes.length} 个</Tag>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {group.schemes.map(({ scheme, idx }) => (
                  <div key={scheme.id} style={{
                    padding: '14px 18px', borderRadius: 10,
                    border: _isLight ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(255,255,255,0.06)', background: _isLight ? '#fafafa' : '#1a1a1a',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <Text strong style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 14 }}>{scheme.name}</Text>
                        {scheme.is_system && <Tag color="gold" style={{ fontSize: 10, borderRadius: 8, lineHeight: '18px' }}>内置</Tag>}
                      </div>
                      <Text style={{ color: _isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)', fontSize: 12, display: 'block', marginBottom: 8 }}>{scheme.description}</Text>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {scheme.params?.map((p: any) => (
                          <Tag key={p.key} style={{ fontSize: 11, borderRadius: 4, background: _isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.03)', border: _isLight ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(255,255,255,0.06)', color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)', maxWidth: '100%', display: 'inline-flex', flexWrap: 'wrap', whiteSpace: 'normal', height: 'auto', padding: '4px 8px' }}>
                            <span style={{ wordBreak: 'break-all', whiteSpace: 'normal' }}>
                              {p.label}: {Array.isArray(p.options) ? (p.options.length > 4 ? p.options.slice(0, 4).join(' / ') + ` / ...(+${p.options.length - 4})` : p.options.join(' / ')) : String(p.default)}{p.unit ? ` ${p.unit}` : ''}
                            </span>
                          </Tag>
                        ))}
                      </div>
                      <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace', display: 'block', marginTop: 6 }}>ID: {scheme.id}</Text>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      <Button type="text" icon={<EditOutlined />} onClick={() => handleEditScheme(scheme, idx)} style={{ color: '#1677ff' }}>编辑</Button>
                      {scheme.is_system && (
                        <Button type="text" icon={<ReloadOutlined />} onClick={() => handleResetScheme(scheme.id, idx)} style={{ color: '#faad14' }}>重置</Button>
                      )}
                      <Button type="text" icon={<DeleteOutlined />} onClick={() => handleDeleteScheme(idx)} danger disabled={!!scheme.is_system}>删除</Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ));
        })()}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
          <Button type="primary" loading={savingSchemes} onClick={handleSaveAllSchemes} icon={<SaveOutlined />}>
            保存全部方案
          </Button>
        </div>
      </div>

      {/* 方案编辑 Drawer */}
      <Drawer
        title={editingSchemeIndex >= 0 ? '编辑创作方案' : '新建创作方案'}
        open={schemeEditVisible}
        onClose={() => setSchemeEditVisible(false)}
        size="large"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => setSchemeEditVisible(false)}>取消</Button>
            <Button type="primary" onClick={handleSaveEditingScheme}>确认</Button>
          </div>
        }
      >
        {editingScheme && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* 基本信息 */}
            <div>
              <Text style={{ display: 'block', marginBottom: 6, fontSize: 13, color: _isLight ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.6)' }}>方案名称</Text>
              <Input value={editingScheme.name} onChange={e => setEditingScheme({ ...editingScheme, name: e.target.value })} />
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <Text style={{ display: 'block', marginBottom: 6, fontSize: 13, color: _isLight ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.6)' }}>方案 ID</Text>
                <Input value={editingScheme.id} onChange={e => setEditingScheme({ ...editingScheme, id: e.target.value })} disabled={!!editingScheme.is_system} />
              </div>
              <div style={{ flex: 1 }}>
                <Text style={{ display: 'block', marginBottom: 6, fontSize: 13, color: _isLight ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.6)' }}>类型</Text>
                <Select value={editingScheme.type} onChange={v => setEditingScheme({ ...editingScheme, type: v })} style={{ width: '100%' }}
                  options={[{ label: '视频 (video)', value: 'video' }, { label: '图片 (image)', value: 'image' }, { label: '聊天 (chat)', value: 'chat' }]}
                />
              </div>
            </div>
            <div>
              <Text style={{ display: 'block', marginBottom: 6, fontSize: 13, color: _isLight ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.6)' }}>描述</Text>
              <Input.TextArea value={editingScheme.description} onChange={e => setEditingScheme({ ...editingScheme, description: e.target.value })} autoSize={{ minRows: 2, maxRows: 4 }} />
            </div>

            <Divider style={{ margin: '8px 0', borderColor: _isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)' }} />

            {/* 参数列表 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text strong style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 14 }}>参数配置</Text>
              <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={handleAddParam}>添加参数</Button>
            </div>

            {editingScheme.params?.map((param: any, pIdx: number) => {
              const isSystemParam = !!(editingScheme.is_system && defaultSchemeList.find(s => s.id === editingScheme.id)?.params?.some((p: any) => p.key === param.key));
              return (
              <div key={pIdx} style={{ background: _isLight ? '#fafafa' : '#1a1a1a', borderRadius: 8, padding: 14, border: _isLight ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <Text style={{ color: _isLight ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)', fontSize: 12 }}>参数 #{pIdx + 1}</Text>
                  {!isSystemParam && (
                    <Button type="text" size="small" icon={<DeleteOutlined />} danger onClick={() => handleRemoveParam(pIdx)} />
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <div style={{ flex: 1 }}>
                    <Text style={{ display: 'block', marginBottom: 4, fontSize: 11, color: _isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)' }}>Key</Text>
                    <Input size="small" value={param.key} onChange={e => handleEditingSchemeParamChange(pIdx, 'key', e.target.value)} disabled={isSystemParam} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <Text style={{ display: 'block', marginBottom: 4, fontSize: 11, color: _isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)' }}>显示标签</Text>
                    <Input size="small" value={param.label} onChange={e => handleEditingSchemeParamChange(pIdx, 'label', e.target.value)} />
                  </div>
                  <div style={{ width: 140 }}>
                    <Text style={{ display: 'block', marginBottom: 4, fontSize: 11, color: _isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)' }}>控件类型</Text>
                    <Select size="small" value={param.type} onChange={v => handleEditingSchemeParamChange(pIdx, 'type', v)} style={{ width: '100%' }} disabled={isSystemParam}
                      options={[{ label: 'Input 文本', value: 'input' }, { label: 'Radio 单选', value: 'radio' }, { label: 'Select 下拉', value: 'select' }, { label: 'Switch 开关', value: 'switch' }, { label: 'Slider 滑块', value: 'slider' }]}
                    />
                  </div>
                  <div style={{ width: 120 }}>
                    <Text style={{ display: 'block', marginBottom: 4, fontSize: 11, color: _isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)' }}>数据类型</Text>
                    <Select size="small" value={param.data_type || 'string'} onChange={v => handleEditingSchemeParamChange(pIdx, 'data_type', v)} style={{ width: '100%' }} disabled={isSystemParam}
                      options={[{ label: 'String 字符串', value: 'string' }, { label: 'Number 数字', value: 'number' }, { label: 'Integer 整数', value: 'integer' }, { label: 'Boolean 布尔', value: 'boolean' }]}
                    />
                  </div>
                </div>
                {param.type !== 'switch' && param.type !== 'slider' && (
                  <div style={{ marginBottom: 8 }}>
                    <Text style={{ display: 'block', marginBottom: 4, fontSize: 11, color: _isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)' }}>选项列表（用英文逗号分隔）</Text>
                    <Input size="small" value={Array.isArray(param.options) ? param.options.join(',') : ''}
                      onChange={e => handleEditingSchemeParamChange(pIdx, 'options', e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean))}
                      placeholder="例如: 16:9,9:16,1:1 或 480p,720p,1080p"
                    />
                  </div>
                )}
                {param.type === 'slider' && (
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <div style={{ flex: 1 }}>
                      <Text style={{ display: 'block', marginBottom: 4, fontSize: 11, color: _isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)' }}>最小值</Text>
                      <InputNumber size="small" style={{ width: '100%' }} value={param.min ?? 0}
                        onChange={v => handleEditingSchemeParamChange(pIdx, 'min', v ?? 0)}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <Text style={{ display: 'block', marginBottom: 4, fontSize: 11, color: _isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)' }}>最大值</Text>
                      <InputNumber size="small" style={{ width: '100%' }} value={param.max ?? 100}
                        onChange={v => handleEditingSchemeParamChange(pIdx, 'max', v ?? 100)}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <Text style={{ display: 'block', marginBottom: 4, fontSize: 11, color: _isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)' }}>步长</Text>
                      <InputNumber size="small" style={{ width: '100%' }} value={param.step ?? 1} min={0.001}
                        onChange={v => handleEditingSchemeParamChange(pIdx, 'step', v ?? 1)}
                      />
                    </div>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <Text style={{ display: 'block', marginBottom: 4, fontSize: 11, color: _isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)' }}>默认值</Text>
                    {param.type === 'switch' ? (
                      <Switch checked={!!param.default} onChange={v => handleEditingSchemeParamChange(pIdx, 'default', v)} />
                    ) : param.type === 'slider' ? (
                      <InputNumber size="small" style={{ width: '100%' }}
                        value={typeof param.default === 'number' ? param.default : Number(param.default) || 0}
                        min={param.min ?? 0} max={param.max ?? 100} step={param.step ?? 1}
                        onChange={v => handleEditingSchemeParamChange(pIdx, 'default', v ?? 0)}
                      />
                    ) : (
                      <Input size="small" value={String(param.default ?? '')} onChange={e => handleEditingSchemeParamChange(pIdx, 'default', e.target.value)} />
                    )}
                  </div>
                  <div style={{ width: 100 }}>
                    <Text style={{ display: 'block', marginBottom: 4, fontSize: 11, color: _isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)' }}>单位</Text>
                    <Input size="small" value={param.unit || ''} onChange={e => handleEditingSchemeParamChange(pIdx, 'unit', e.target.value)} placeholder="可选" />
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </Drawer>
    </div>
  );

  const playgroundAdvancedNodesTab = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 功能总控 Card */}
      <div style={{
        background: _isLight ? '#fff' : '#141414',
        borderRadius: 12,
        padding: '24px',
        border: _isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.08)',
        boxShadow: _isLight ? '0 2px 8px rgba(0,0,0,0.02)' : '0 2px 8px rgba(0,0,0,0.2)',
        transition: 'all 0.3s ease',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div>
            <div style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 16, fontWeight: 600 }}>
              开启高级节点功能
            </div>
            <div style={{ color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)', fontSize: 13, marginTop: 4 }}>
              开启后，用户在创作中心画布上点击选中的图片或视频素材时，可以追加高级操作节点进行处理。
            </div>
          </div>
          <Switch
            checked={pgAdvancedNodesEnabled}
            onChange={(checked) => setPgAdvancedNodesEnabled(checked)}
            style={{ transform: 'scale(1.1)' }}
          />
        </div>
      </div>

      {/* 基础实例设置 */}
      <div style={{
        background: _isLight ? '#fff' : '#141414',
        borderRadius: 12,
        padding: '24px',
        border: _isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.08)',
        boxShadow: _isLight ? '0 2px 8px rgba(0,0,0,0.02)' : '0 2px 8px rgba(0,0,0,0.2)',
        transition: 'all 0.3s ease',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 16, fontWeight: 600 }}>
              基础素材实例上限
            </div>
            <div style={{ color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)', fontSize: 13, marginTop: 4 }}>
              设置在创作中心画布上最多可以存在的图片或视频基础素材节点的数量。
            </div>
          </div>
          <Space>
            <span style={{ fontSize: 13, color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)' }}>数量上限</span>
            <InputNumber 
              size="middle" 
              min={1} 
              max={1000} 
              value={pgAdvancedNodeInstanceLimit} 
              onChange={(val) => setPgAdvancedNodeInstanceLimit(val || 50)} 
            />
          </Space>
        </div>
      </div>

      {/* 节点列表 Card (总开关开启时可用) */}
      <div style={{
        background: _isLight ? '#fff' : '#141414',
        borderRadius: 12,
        padding: '24px',
        border: _isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.08)',
        boxShadow: _isLight ? '0 2px 8px rgba(0,0,0,0.02)' : '0 2px 8px rgba(0,0,0,0.2)',
        opacity: pgAdvancedNodesEnabled ? 1 : 0.6,
        pointerEvents: pgAdvancedNodesEnabled ? 'auto' : 'none',
        transition: 'all 0.3s ease',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 15, fontWeight: 600 }}>
            可用的节点列表
          </div>
          <Space>
            <span style={{ fontSize: 13, color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)' }}>一键统一配置上限</span>
            <Switch
              size="small"
              checked={pgAdvancedNodesUnifiedLimitEnabled}
              onChange={setPgAdvancedNodesUnifiedLimitEnabled}
            />
            {pgAdvancedNodesUnifiedLimitEnabled && (
              <InputNumber
                size="small"
                min={1}
                max={100}
                value={pgAdvancedNodesUnifiedLimitValue}
                onChange={(val) => setPgAdvancedNodesUnifiedLimitValue(val || 10)}
              />
            )}
          </Space>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          
          {/* 系统节点：预览节点 */}
          <div style={{
            background: _isLight ? 'rgba(0,0,0,0.01)' : 'rgba(255,255,255,0.02)',
            border: _isLight ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(255,255,255,0.06)',
            borderRadius: 8,
            padding: '16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            transition: 'border-color 0.2s',
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 14, fontWeight: 500 }}>预览节点</span>
                <span style={{
                  fontSize: 11,
                  background: 'rgba(82,196,26,0.1)',
                  color: '#52c41a',
                  border: '1px solid rgba(82,196,26,0.2)',
                  borderRadius: 4,
                  padding: '1px 6px',
                  fontWeight: 500,
                }}>
                  系统节点
                </span>
              </div>
              <div style={{ color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 4 }}>
                生成当前素材的快速缩略图、比例预览和预览文件。
              </div>
            </div>
            <Space size="large">
              <Space>
                <span style={{ fontSize: 13, color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)' }}>数量上限</span>
                <InputNumber 
                  size="small" 
                  min={1} 
                  max={100} 
                  value={pgAdvancedNodesUnifiedLimitEnabled ? pgAdvancedNodesUnifiedLimitValue : pgAdvancedNodePreviewLimit} 
                  onChange={(val) => setPgAdvancedNodePreviewLimit(val || 10)} 
                  disabled={pgAdvancedNodesUnifiedLimitEnabled}
                />
              </Space>
              <Switch
                checked={pgAdvancedNodePreviewEnabled}
                onChange={(checked) => setPgAdvancedNodePreviewEnabled(checked)}
                size="small"
              />
            </Space>
          </div>

          {/* 系统节点：提示词节点 */}
          <div style={{
            background: _isLight ? 'rgba(0,0,0,0.01)' : 'rgba(255,255,255,0.02)',
            border: _isLight ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(255,255,255,0.06)',
            borderRadius: 8,
            padding: '16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            transition: 'border-color 0.2s',
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 14, fontWeight: 500 }}>提示词节点</span>
                <span style={{
                  fontSize: 11,
                  background: 'rgba(82,196,26,0.1)',
                  color: '#52c41a',
                  border: '1px solid rgba(82,196,26,0.2)',
                  borderRadius: 4,
                  padding: '1px 6px',
                  fontWeight: 500,
                }}>
                  系统节点
                </span>
              </div>
              <div style={{ color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 4 }}>
                在画布上建立并管理专门的文本提示词编辑区域。
              </div>
            </div>
            <Space size="large">
              <Space>
                <span style={{ fontSize: 13, color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)' }}>数量上限</span>
                <InputNumber 
                  size="small" 
                  min={1} 
                  max={100} 
                  value={pgAdvancedNodesUnifiedLimitEnabled ? pgAdvancedNodesUnifiedLimitValue : pgAdvancedNodePromptLimit} 
                  onChange={(val) => setPgAdvancedNodePromptLimit(val || 10)} 
                  disabled={pgAdvancedNodesUnifiedLimitEnabled}
                />
              </Space>
              <Switch
                checked={pgAdvancedNodePromptEnabled}
                onChange={(checked) => setPgAdvancedNodePromptEnabled(checked)}
                size="small"
              />
            </Space>
          </div>

          {/* 系统节点：AI视频节点 */}
          <div style={{
            background: _isLight ? 'rgba(0,0,0,0.01)' : 'rgba(255,255,255,0.02)',
            border: _isLight ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(255,255,255,0.06)',
            borderRadius: 8,
            padding: '16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            transition: 'border-color 0.2s',
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 14, fontWeight: 500 }}>AI视频节点</span>
                <span style={{
                  fontSize: 11,
                  background: 'rgba(82,196,26,0.1)',
                  color: '#52c41a',
                  border: '1px solid rgba(82,196,26,0.2)',
                  borderRadius: 4,
                  padding: '1px 6px',
                  fontWeight: 500,
                }}>
                  系统节点
                </span>
              </div>
              <div style={{ color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 4 }}>
                运行AI生成算法以生成或编辑视频。
              </div>
            </div>
            <Space size="large">
              <Space>
                <span style={{ fontSize: 13, color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)' }}>数量上限</span>
                <InputNumber 
                  size="small" 
                  min={1} 
                  max={100} 
                  value={pgAdvancedNodesUnifiedLimitEnabled ? pgAdvancedNodesUnifiedLimitValue : pgAdvancedNodeAiVideoLimit} 
                  onChange={(val) => setPgAdvancedNodeAiVideoLimit(val || 10)} 
                  disabled={pgAdvancedNodesUnifiedLimitEnabled}
                />
              </Space>
              <Switch
                checked={pgAdvancedNodeAiVideoEnabled}
                onChange={(checked) => setPgAdvancedNodeAiVideoEnabled(checked)}
                size="small"
              />
            </Space>
          </div>

          {/* 系统节点：AI图片节点 */}
          <div style={{
            background: _isLight ? 'rgba(0,0,0,0.01)' : 'rgba(255,255,255,0.02)',
            border: _isLight ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(255,255,255,0.06)',
            borderRadius: 8,
            padding: '16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            transition: 'border-color 0.2s',
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 14, fontWeight: 500 }}>AI图片节点</span>
                <span style={{
                  fontSize: 11,
                  background: 'rgba(82,196,26,0.1)',
                  color: '#52c41a',
                  border: '1px solid rgba(82,196,26,0.2)',
                  borderRadius: 4,
                  padding: '1px 6px',
                  fontWeight: 500,
                }}>
                  系统节点
                </span>
              </div>
              <div style={{ color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 4 }}>
                运行AI生成算法以生成或编辑图像。
              </div>
            </div>
            <Space size="large">
              <Space>
                <span style={{ fontSize: 13, color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)' }}>数量上限</span>
                <InputNumber 
                  size="small" 
                  min={1} 
                  max={100} 
                  value={pgAdvancedNodesUnifiedLimitEnabled ? pgAdvancedNodesUnifiedLimitValue : pgAdvancedNodeAiImageLimit} 
                  onChange={(val) => setPgAdvancedNodeAiImageLimit(val || 10)} 
                  disabled={pgAdvancedNodesUnifiedLimitEnabled}
                />
              </Space>
              <Switch
                checked={pgAdvancedNodeAiImageEnabled}
                onChange={(checked) => setPgAdvancedNodeAiImageEnabled(checked)}
                size="small"
              />
            </Space>
          </div>

          {/* 增强节点：Agent 智能体 */}
          <div style={{
            background: _isLight ? 'rgba(0,0,0,0.01)' : 'rgba(255,255,255,0.02)',
            border: _isLight ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(255,255,255,0.06)',
            borderRadius: 8,
            padding: '16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            transition: 'border-color 0.2s',
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 14, fontWeight: 500 }}>Agent智能体</span>
                <span style={{
                  fontSize: 11,
                  background: 'rgba(24,144,255,0.1)',
                  color: '#1890ff',
                  border: '1px solid rgba(24,144,255,0.2)',
                  borderRadius: 4,
                  padding: '1px 6px',
                  fontWeight: 500,
                }}>
                  增强节点
                </span>
              </div>
              <div style={{ color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 4 }}>
                在画布上建立独立智能体对话，支持设定系统提示词并执行特定角色流式响应。
              </div>
            </div>
            <Space size="large">
              <Space>
                <span style={{ fontSize: 13, color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)' }}>数量上限</span>
                <InputNumber 
                  size="small" 
                  min={1} 
                  max={100} 
                  value={pgAdvancedNodesUnifiedLimitEnabled ? pgAdvancedNodesUnifiedLimitValue : pgAdvancedNodeAgentLimit} 
                  onChange={(val) => setPgAdvancedNodeAgentLimit(val || 10)} 
                  disabled={pgAdvancedNodesUnifiedLimitEnabled}
                />
              </Space>
              <Switch
                checked={pgAdvancedNodeAgentEnabled}
                onChange={(checked) => setPgAdvancedNodeAgentEnabled(checked)}
                size="small"
              />
            </Space>
          </div>

          {/* 增强节点：火山画质增强 */}
          <div style={{
            background: _isLight ? 'rgba(0,0,0,0.01)' : 'rgba(255,255,255,0.02)',
            border: _isLight ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(255,255,255,0.06)',
            borderRadius: 8,
            padding: '16px',
            transition: 'all 0.2s',
            opacity: volcEnhancePluginActive ? 1 : 0.85,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 14, fontWeight: 500 }}>火山画质增强</span>
                  <span style={{
                    fontSize: 11,
                    background: 'rgba(24,144,255,0.1)',
                    color: '#1890ff',
                    border: '1px solid rgba(24,144,255,0.2)',
                    borderRadius: 4,
                    padding: '1px 6px',
                    fontWeight: 500,
                  }}>
                    增强节点
                  </span>
                </div>
                <div style={{ color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 4 }}>
                  通过接入火山引擎 MediaKit 进行视频或图片的超分辨率、插帧及智能修复。
                </div>
              </div>
              <Space size="large">
                <Space>
                  <span style={{ fontSize: 13, color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)' }}>数量上限</span>
                  <InputNumber 
                    size="small" 
                    min={1} 
                    max={100} 
                    value={pgAdvancedNodesUnifiedLimitEnabled ? pgAdvancedNodesUnifiedLimitValue : pgAdvancedNodeVolcEnhanceLimit} 
                    onChange={(val) => setPgAdvancedNodeVolcEnhanceLimit(val || 10)} 
                    disabled={pgAdvancedNodesUnifiedLimitEnabled || !volcEnhancePluginActive}
                  />
                </Space>
                <Tooltip title={!volcEnhancePluginActive ? "依赖的前置“AI MediaKit火山引擎画质增加插件”未开启" : ""}>
                  <Switch
                    checked={pgAdvancedNodeVolcEnhanceEnabled}
                    onChange={(checked) => setPgAdvancedNodeVolcEnhanceEnabled(checked)}
                    disabled={!volcEnhancePluginActive}
                    size="small"
                  />
                </Tooltip>
              </Space>
            </div>

            {/* 如果依赖插件未激活，显示警告及指引链接 */}
            {!volcEnhancePluginActive && (
              <div style={{
                marginTop: 12,
                background: _isLight ? 'rgba(250,173,20,0.06)' : 'rgba(250,173,20,0.1)',
                border: '1px solid rgba(250,173,20,0.2)',
                borderRadius: 6,
                padding: '8px 12px',
                fontSize: 12,
                color: _isLight ? '#d46b08' : '#e08f23',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <span>
                  ⚠️ 该功能依赖 <strong>AI MediaKit火山引擎画质增加插件</strong>，检测到当前未启用。
                </span>
                <a
                  href={`/${adminPath}/plugins`}
                  onClick={(e) => {
                    e.preventDefault();
                    navigate(`/${adminPath}/plugins`);
                  }}
                  style={{
                    color: '#1890ff',
                    fontWeight: 500,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  去开启插件
                </a>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* 保存按钮卡片 */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        <Button
          type="primary"
          loading={savingPlayground}
          onClick={handleSavePlaygroundConfig}
          icon={<SaveOutlined />}
        >
          保存高级节点配置
        </Button>
      </div>
    </div>
  );

  const playgroundAgentConfigTab = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 功能总控 Card */}
      <div style={{
        background: _isLight ? '#fff' : '#141414',
        borderRadius: 12,
        padding: '24px',
        border: _isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.08)',
        boxShadow: _isLight ? '0 2px 8px rgba(0,0,0,0.02)' : '0 2px 8px rgba(0,0,0,0.2)',
        transition: 'all 0.3s ease',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div>
            <div style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 16, fontWeight: 600 }}>
              开启智能体模式高级功能
            </div>
            <div style={{ color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)', fontSize: 13, marginTop: 4 }}>
              开启后，用户在创作中心左上角和右下角的菜单中可以切换到「AI智能体模式」，并支持高级智能体操作。
            </div>
          </div>
          <Switch
            checked={pgAgentModeEnabled}
            onChange={(checked) => setPgAgentModeEnabled(checked)}
            style={{ transform: 'scale(1.1)' }}
          />
        </div>
      </div>

      {/* 视频生成模式选择 Card (总开关开启时可用) */}
      <div style={{
        background: _isLight ? '#fff' : '#141414',
        borderRadius: 12,
        padding: '24px',
        border: _isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.08)',
        boxShadow: _isLight ? '0 2px 8px rgba(0,0,0,0.02)' : '0 2px 8px rgba(0,0,0,0.2)',
        opacity: pgAgentModeEnabled ? 1 : 0.6,
        pointerEvents: pgAgentModeEnabled ? 'auto' : 'none',
        transition: 'all 0.3s ease',
      }}>
        <div style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 15, fontWeight: 600, marginBottom: 16 }}>
          智能体操作视频生成模式
        </div>
        <Radio.Group 
          value={pgAgentVideoMode} 
          onChange={(e) => setPgAgentVideoMode(e.target.value)}
          style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}
        >
          <Radio value="track" style={{ display: 'flex', alignItems: 'flex-start', margin: 0 }}>
            <div style={{ marginLeft: 8 }}>
              <Text strong style={{ color: _isLight ? '#1f2937' : '#fff', display: 'block', fontSize: 14 }}>操作轨迹视频生成</Text>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>智能体根据用户在创作中心画布上的一系列节点操作轨迹，自动渲染生成连贯性操作视频</Text>
            </div>
          </Radio>
          
          <Radio value="autonomous" style={{ display: 'flex', alignItems: 'flex-start', margin: 0 }}>
            <div style={{ marginLeft: 8 }}>
              <Text strong style={{ color: _isLight ? '#1f2937' : '#fff', display: 'block', fontSize: 14 }}>自主决策视频生成</Text>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>智能体根据用户的输入指令，自主进行规划、点击操作节点并合成最终的演示生成视频</Text>
            </div>
          </Radio>

          <Radio value="interactive" style={{ display: 'flex', alignItems: 'flex-start', margin: 0 }}>
            <div style={{ marginLeft: 8 }}>
              <Text strong style={{ color: _isLight ? '#1f2937' : '#fff', display: 'block', fontSize: 14 }}>交互录制视频生成</Text>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>智能体实时响应交互，捕获当前画布视口的内容并以录屏形式导出高质量操作演示视频</Text>
            </div>
          </Radio>
        </Radio.Group>
      </div>

      {/* 对话界面高度自定义配置 Card */}
      <div style={{
        background: _isLight ? '#fff' : '#141414',
        borderRadius: 12,
        padding: '24px',
        border: _isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.08)',
        boxShadow: _isLight ? '0 2px 8px rgba(0,0,0,0.02)' : '0 2px 8px rgba(0,0,0,0.2)',
        opacity: pgAgentModeEnabled ? 1 : 0.6,
        pointerEvents: pgAgentModeEnabled ? 'auto' : 'none',
        transition: 'all 0.3s ease',
      }}>
        <div style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 15, fontWeight: 600, marginBottom: 16 }}>
          对话沉浸式界面配置
        </div>
        
        <div style={{ marginBottom: 16 }}>
          <div style={{ color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)', fontSize: 13, marginBottom: 8 }}>
            欢迎语大标题 (默认: Start a conversation)
          </div>
          <Input 
            placeholder="Start a conversation" 
            value={pgAgentWelcomeTitle} 
            onChange={e => setPgAgentWelcomeTitle(e.target.value)} 
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)', fontSize: 13, marginBottom: 8 }}>
            欢迎语副标题 (默认: I can help you design, and optimise your creative workflow.)
          </div>
          <Input 
            placeholder="I can help you design, and optimise your creative workflow." 
            value={pgAgentWelcomeDesc} 
            onChange={e => setPgAgentWelcomeDesc(e.target.value)} 
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)', fontSize: 13 }}>
              智能体系统提示词 (限定使用范围)
            </div>
            <Button size="small" onClick={() => setPgAgentSystemPrompt("你是一个专业的创作中心 AI 智能体，专为辅助用户制作图片和视频而设计。你的主要任务是根据用户的需求，通过对话理解他们的意图，并利用站点提供的内置节点帮助用户自动搭建工作流，最终用户只需点击生成即可完成创作。\n\n【限定使用范围】\n1. 只能回答与图片制作、视频生成、创意设计相关的创作类问题。\n2. 对于任何超出创作中心和音视频/图片生成范畴的话题（如政治、编程、代码、常识问答等），请礼貌地拒绝，并引导用户回到图像/视频创作上。\n3. 保持热情、专业，并引导用户提供更具体的画面描述以优化生成效果。")}>
              填入 Hermes 风格默认提示词
            </Button>
          </div>
          <Input.TextArea
            autoSize={{ minRows: 4, maxRows: 8 }}
            placeholder="请在此输入限定智能体行为和范围的 System Prompt。如果不填则使用系统全局默认配置。"
            value={pgAgentSystemPrompt}
            onChange={e => setPgAgentSystemPrompt(e.target.value)}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)', fontSize: 13, marginBottom: 8 }}>
            智能体对话大模型 (多选)
          </div>
          <Select
            mode="multiple"
            style={{ width: '100%' }}
            placeholder="请选择智能体聊天可选的大模型"
            value={pgAgentChatModels}
            onChange={setPgAgentChatModels}
            options={pgModels.filter(m => m.scheme_type === 'chat' || m.type_name?.includes('聊天') || m.type_name?.includes('对话')).map(m => ({ label: m.name, value: m.mid }))}
          />
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)', fontSize: 13 }}>
              预设引导提示词 (将展示为对话框上方的点击卡片)
            </div>
            <Button size="small" onClick={() => setPgAgentPresetPrompts([
              { icon: '🎬', text: '我想制作一段赛博朋克风格的科幻视频' },
              { icon: '👩', text: '帮我生成一张极具质感的人像照片' },
              { icon: '🎨', text: '根据我的描述设计一个 3D IP 盲盒角色' }
            ])}>
              填入 Hermes 风格预设卡片
            </Button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pgAgentPresetPrompts.map((prompt, index) => (
              <div key={index} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Input 
                  placeholder="图标 (如 🖼️)" 
                  style={{ width: 80 }} 
                  value={prompt.icon} 
                  onChange={e => {
                    const newPrompts = [...pgAgentPresetPrompts];
                    newPrompts[index] = { ...newPrompts[index], icon: e.target.value };
                    setPgAgentPresetPrompts(newPrompts);
                  }} 
                />
                <Input 
                  placeholder="提示词内容 (如 Create a product shot...)" 
                  value={prompt.text} 
                  onChange={e => {
                    const newPrompts = [...pgAgentPresetPrompts];
                    newPrompts[index] = { ...newPrompts[index], text: e.target.value };
                    setPgAgentPresetPrompts(newPrompts);
                  }} 
                />
                <Button 
                  danger 
                  type="text" 
                  icon={<DeleteOutlined />} 
                  onClick={() => {
                    const newPrompts = [...pgAgentPresetPrompts];
                    newPrompts.splice(index, 1);
                    setPgAgentPresetPrompts(newPrompts);
                  }} 
                />
              </div>
            ))}
            <Button 
              type="dashed" 
              icon={<PlusOutlined />} 
              onClick={() => {
                setPgAgentPresetPrompts([...pgAgentPresetPrompts, { icon: '', text: '' }]);
              }}
              style={{ width: '100%', marginTop: 8 }}
            >
              添加预设提示词
            </Button>
          </div>
        </div>
      </div>

      {/* 保存按钮卡片 */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        <Button
          type="primary"
          loading={savingPlayground}
          onClick={handleSavePlaygroundConfig}
          icon={<SaveOutlined />}
        >
          保存智能体配置
        </Button>
      </div>
    </div>
  );

  // ====== 模型广场管理 模型列表 Tab ======
  // 提取供应商和类型的唯一列表，用于筛选下拉
  const mpProviderOptions = Array.from(new Set(mpModels.map(m => m.provider_name).filter(Boolean)));
  const mpTypeOptions = Array.from(new Set(mpModels.map(m => m.type_name).filter(Boolean)));

  const filteredMpModels = mpModels.filter(m => {
    // 关键词搜索
    if (mpSearchKeyword) {
      const kw = mpSearchKeyword.toLowerCase();
      const matchText = m.name.toLowerCase().includes(kw) || m.model_id.toLowerCase().includes(kw) || m.mid?.toLowerCase()?.includes(kw) || m.provider_name?.toLowerCase()?.includes(kw);
      if (!matchText) return false;
    }
    // 供应商筛选
    if (mpProviderFilter !== 'all' && (m.provider_name || '') !== mpProviderFilter) return false;
    // 类型筛选
    if (mpTypeFilter !== 'all' && (m.type_name || '') !== mpTypeFilter) return false;
    // 展示状态筛选
    if (mpStatusFilter === 'enabled' && !m.mp_enabled) return false;
    if (mpStatusFilter === 'disabled' && m.mp_enabled) return false;
    // 模型状态筛选（模型管理中的启用/禁用状态）
    if (mpModelActiveFilter === 'active' && m.is_active !== 1) return false;
    if (mpModelActiveFilter === 'inactive' && m.is_active === 1) return false;
    return true;
  });

  // 一键切换当前筛选结果的广场展示状态
  const handleMpBatchToggle = (enabled: boolean) => {
    const filteredIds = new Set(filteredMpModels.map(m => m.id));
    setMpModels(prev => prev.map(m => filteredIds.has(m.id) ? { ...m, mp_enabled: enabled } : m));
  };

  const mpModelColumns = [
    {
      title: '模型名称',
      dataIndex: 'name',
      key: 'name',
      render: (nameVal: string, record: any) => {
        const scheme = pgSchemes.find(s => s.id === record.pg_scheme_id);
        return (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Text strong style={{ color: record.is_active !== 1 ? (_isLight ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)') : (_isLight ? '#1f2937' : '#fff'), fontSize: 13 }}>{nameVal}</Text>
              {record.is_active !== 1 && (
                <Tooltip title="该模型在模型管理中已被禁用，即使开启广场展示也不会在模型广场中显示">
                  <Tag color="error" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0, borderRadius: 4 }}>已禁用</Tag>
                </Tooltip>
              )}
              {scheme && (
                <span style={{ fontSize: 11, color: '#1677ff', fontWeight: 'normal' }}>
                  (已挂载流：{scheme.name})
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: _isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)', fontFamily: 'monospace' }}>
              MID: {record.mid} | {record.model_id}
              {record.remark && <span style={{ marginLeft: 8, color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)' }}>({record.remark})</span>}
            </div>
          </div>
        );
      }
    },
    {
      title: '供应商',
      dataIndex: 'provider_name',
      key: 'provider_name',
      width: 100,
      render: (p: string) => p ? (
        <Tag style={{ borderRadius: 4, background: _isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.04)', border: _isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.08)', color: _isLight ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.6)' }}>{p}</Tag>
      ) : <Text type="secondary">-</Text>
    },
    {
      title: '类型',
      dataIndex: 'type_name',
      key: 'type_name',
      width: 100,
      render: (t: string) => t ? (
        <Tag style={{ borderRadius: 4, background: _isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.04)', border: _isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.08)', color: _isLight ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.6)' }}>
          {t.includes('视频增强') ? <ThunderboltOutlined style={{ marginRight: 4 }} /> : t.includes('视频') ? <VideoCameraOutlined style={{ marginRight: 4 }} /> : t.includes('图片') ? <PictureOutlined style={{ marginRight: 4 }} /> : null}
          {t}
        </Tag>
      ) : <Text type="secondary">-</Text>
    },
    {
      title: '模型状态',
      key: 'model_status',
      width: 80,
      render: (_: any, record: any) => (
        record.is_active === 1
          ? <Tag color="success" style={{ borderRadius: 4, margin: 0 }}>启用</Tag>
          : <Tooltip title="模型在模型管理中被禁用，不会出现在模型广场"><Tag color="error" style={{ borderRadius: 4, margin: 0 }}>禁用</Tag></Tooltip>
      )
    },
    {
      title: '广场展示',
      key: 'mp_enabled',
      width: 100,
      render: (_: any, record: any) => (
        <Tooltip title={record.is_active !== 1 ? '模型已被禁用，即使开启也不会在广场中显示' : ''}>
          <Switch
            checked={record.mp_enabled}
            onChange={(val) => handleMpToggle(record.id, val)}
            style={record.is_active !== 1 ? { opacity: 0.5 } : {}}
          />
        </Tooltip>
      )
    },
    {
      title: '排序权重',
      key: 'mp_sort_order',
      width: 120,
      sorter: (a: any, b: any) => (a.mp_sort_order || 0) - (b.mp_sort_order || 0),
      render: (_: any, record: any) => (
        <InputNumber
          size="small"
          min={0}
          max={9999}
          value={record.mp_sort_order || 0}
          onChange={(val) => handleMpSortChange(record.id, val ?? 0)}
          style={{ width: 80 }}
        />
      )
    },
    {
      title: '广场描述',
      key: 'mp_description',
      width: 240,
      render: (_: any, record: any) => (
        <Input
          size="small"
          value={record.mp_description || ''}
          onChange={(e) => handleMpDescChange(record.id, e.target.value)}
          placeholder="简短描述..."

        />
      )
    },
  ];

  const marketplaceModelTab = (() => {
    const enabledCount = mpModels.filter(m => m.mp_enabled).length;
    const filteredEnabledCount = filteredMpModels.filter(m => m.mp_enabled).length;
    const allFilteredEnabled = filteredMpModels.length > 0 && filteredEnabledCount === filteredMpModels.length;

    return (
      <div>
        <div style={{ background: _isLight ? '#fff' : '#141414', borderRadius: 8, padding: '20px', border: _isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.08)' }}>
          {/* 标题 + 一键开关 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <Text strong style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 14 }}>模型广场模型列表</Text>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Text style={{ color: _isLight ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)', fontSize: 12, whiteSpace: 'nowrap' }}>
                {filteredMpModels.length === mpModels.length ? '一键全部' : `当前 ${filteredMpModels.length} 项`}
              </Text>
              <Switch
                checked={allFilteredEnabled}
                onChange={(val) => handleMpBatchToggle(val)}
              />
            </div>
          </div>

          {/* 模型状态提示 */}
          {mpModels.some(m => m.is_active !== 1 && m.mp_enabled) && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 16, borderRadius: 8 }}
              message={`有 ${mpModels.filter(m => m.is_active !== 1 && m.mp_enabled).length} 个模型已开启广场展示但在模型管理中处于禁用状态，这些模型不会在模型广场中显示。`}
            />
          )}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            marginBottom: 16, padding: '10px 14px', borderRadius: 8,
            background: mpDisplayMode === 'blacklist'
              ? (_isLight ? 'rgba(22,119,255,0.04)' : 'rgba(22,119,255,0.08)')
              : (_isLight ? '#fafafa' : 'rgba(255,255,255,0.02)'),
            border: mpDisplayMode === 'blacklist'
              ? '1px solid rgba(22,119,255,0.2)'
              : (_isLight ? '1px solid rgba(0,0,0,0.04)' : '1px solid rgba(255,255,255,0.04)'),
          }}>
            <Text style={{ color: _isLight ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.6)', fontSize: 12, whiteSpace: 'nowrap' }}>展示模式：</Text>
            <Segmented
              options={[
                { label: '手动选择展示', value: 'whitelist' },
                { label: '默认全部展示', value: 'blacklist' },
              ]}
              value={mpDisplayMode}
              onChange={(val) => setMpDisplayMode(val as 'whitelist' | 'blacklist')}
              size="small"
            />
            <Text style={{ color: _isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)', fontSize: 12 }}>
              {mpDisplayMode === 'blacklist'
                ? '所有模型默认在广场展示（含新添加的），仅需关闭不想展示的。'
                : '模型默认不展示，需手动逐个开启。'}
            </Text>
            <Text style={{ color: _isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)', fontSize: 12, marginLeft: 'auto' }}>
              已展示 {enabledCount} / {mpModels.length}（启用 {mpModels.filter(m => m.is_active === 1).length} 个）
            </Text>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            marginBottom: 16, padding: '10px 14px', borderRadius: 8,
            background: mpAllowGuest
              ? (_isLight ? 'rgba(22,119,255,0.04)' : 'rgba(22,119,255,0.08)')
              : (_isLight ? '#fafafa' : 'rgba(255,255,255,0.02)'),
            border: mpAllowGuest
              ? '1px solid rgba(22,119,255,0.2)'
              : (_isLight ? '1px solid rgba(0,0,0,0.04)' : '1px solid rgba(255,255,255,0.04)'),
          }}>
            <Text style={{ color: _isLight ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.6)', fontSize: 12, whiteSpace: 'nowrap' }}>游客访问：</Text>
            <Switch
              checked={mpAllowGuest}
              onChange={(val) => setMpAllowGuest(val)}
              size="small"
            />
            <Text style={{ color: _isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)', fontSize: 12 }}>
              允许未登录用户浏览模型广场（仅做价格/模型展示，实际聊天及对话仍需注册并登录）。
            </Text>
          </div>

          {/* 筛选区 */}
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 16,
            marginBottom: 16, padding: '16px', borderRadius: 8,
            background: _isLight ? '#fafafa' : 'rgba(255,255,255,0.02)',
            border: _isLight ? '1px solid rgba(0,0,0,0.04)' : '1px solid rgba(255,255,255,0.04)',
          }}>
            {/* 第一行：搜索 + 供应商 */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24, flexWrap: 'wrap' }}>
              <Input
                placeholder="搜索模型名称 / ID..."
                value={mpSearchKeyword}
                onChange={e => setMpSearchKeyword(e.target.value)}
                style={{ width: 260 }}
                allowClear
                size="small"
              />
              {/* 供应商筛选 */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flex: 1 }}>
                <Text type="secondary" style={{ fontSize: 13, flexShrink: 0, marginTop: 2 }}>供应商:</Text>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <span
                    onClick={() => setMpProviderFilter('all')}
                    style={{ fontSize: 12, cursor: 'pointer', padding: '2px 10px', borderRadius: 12, background: mpProviderFilter === 'all' ? '#1677ff' : 'transparent', color: mpProviderFilter === 'all' ? '#fff' : 'var(--text-secondary)' }}
                  >全部</span>
                  {mpProviderOptions.map(p => (
                    <span
                      key={p} onClick={() => setMpProviderFilter(p)}
                      style={{ fontSize: 12, cursor: 'pointer', padding: '2px 10px', borderRadius: 12, background: mpProviderFilter === p ? '#1677ff' : 'transparent', color: mpProviderFilter === p ? '#fff' : 'var(--text-secondary)' }}
                    >{p}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* 第二行：类型 + 状态 */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 32, flexWrap: 'wrap' }}>
              {/* 类型筛选 */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <Text type="secondary" style={{ fontSize: 13, flexShrink: 0, marginTop: 2 }}>类型:</Text>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <span
                    onClick={() => setMpTypeFilter('all')}
                    style={{ fontSize: 12, cursor: 'pointer', padding: '2px 10px', borderRadius: 12, background: mpTypeFilter === 'all' ? '#1677ff' : 'transparent', color: mpTypeFilter === 'all' ? '#fff' : 'var(--text-secondary)' }}
                  >全部</span>
                  {mpTypeOptions.map(t => (
                    <span
                      key={t} onClick={() => setMpTypeFilter(t)}
                      style={{ fontSize: 12, cursor: 'pointer', padding: '2px 10px', borderRadius: 12, background: mpTypeFilter === t ? '#1677ff' : 'transparent', color: mpTypeFilter === t ? '#fff' : 'var(--text-secondary)' }}
                    >{t}</span>
                  ))}
                </div>
              </div>

              {/* 广场展示状态筛选 */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <Text type="secondary" style={{ fontSize: 13, flexShrink: 0, marginTop: 2 }}>广场:</Text>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <span
                    onClick={() => setMpStatusFilter('all')}
                    style={{ fontSize: 12, cursor: 'pointer', padding: '2px 10px', borderRadius: 12, background: mpStatusFilter === 'all' ? '#1677ff' : 'transparent', color: mpStatusFilter === 'all' ? '#fff' : 'var(--text-secondary)' }}
                  >全部</span>
                  <span
                    onClick={() => setMpStatusFilter('enabled')}
                    style={{ fontSize: 12, cursor: 'pointer', padding: '2px 10px', borderRadius: 12, background: mpStatusFilter === 'enabled' ? '#1677ff' : 'transparent', color: mpStatusFilter === 'enabled' ? '#fff' : 'var(--text-secondary)' }}
                  >已展示</span>
                  <span
                    onClick={() => setMpStatusFilter('disabled')}
                    style={{ fontSize: 12, cursor: 'pointer', padding: '2px 10px', borderRadius: 12, background: mpStatusFilter === 'disabled' ? '#1677ff' : 'transparent', color: mpStatusFilter === 'disabled' ? '#fff' : 'var(--text-secondary)' }}
                  >未展示</span>
                </div>
              </div>

              {/* 模型状态筛选（模型管理中的启用/禁用） */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <Text type="secondary" style={{ fontSize: 13, flexShrink: 0, marginTop: 2 }}>模型:</Text>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <span
                    onClick={() => setMpModelActiveFilter('all')}
                    style={{ fontSize: 12, cursor: 'pointer', padding: '2px 10px', borderRadius: 12, background: mpModelActiveFilter === 'all' ? '#1677ff' : 'transparent', color: mpModelActiveFilter === 'all' ? '#fff' : 'var(--text-secondary)' }}
                  >全部</span>
                  <span
                    onClick={() => setMpModelActiveFilter('active')}
                    style={{ fontSize: 12, cursor: 'pointer', padding: '2px 10px', borderRadius: 12, background: mpModelActiveFilter === 'active' ? '#52c41a' : 'transparent', color: mpModelActiveFilter === 'active' ? '#fff' : 'var(--text-secondary)' }}
                  >已启用</span>
                  <span
                    onClick={() => setMpModelActiveFilter('inactive')}
                    style={{ fontSize: 12, cursor: 'pointer', padding: '2px 10px', borderRadius: 12, background: mpModelActiveFilter === 'inactive' ? '#ff4d4f' : 'transparent', color: mpModelActiveFilter === 'inactive' ? '#fff' : 'var(--text-secondary)' }}
                  >已禁用</span>
                </div>
              </div>
            </div>
          </div>

          <Table
            dataSource={filteredMpModels}
            columns={mpModelColumns}
            rowKey="id"
            size="small"
            pagination={{ pageSize: 20, showTotal: (total) => `共 ${total} 项` }}
            style={{ marginBottom: 16 }}
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button type="primary" loading={savingMarketplace} onClick={handleSaveMarketplaceConfig} icon={<SaveOutlined />}>
              保存全部配置
            </Button>
          </div>
        </div>
      </div>
    );
  })();


  const currentDyn = plugin ? dynamicPlugins[plugin.name] : undefined;

  return (

    <div>
      {/* 页头 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 20, paddingBottom: 16,
        borderBottom: '1px solid rgba(255,255,255,0.06)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(`/${adminPath}/plugins`)} style={{ color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)', padding: '4px 8px' }} />
          <div style={{
            width: 36, height: 36, borderRadius: 8, background: 'rgba(22,119,255,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1677ff'
          }}>
            {pluginIcons[plugin.name] || <AppstoreOutlined style={{ fontSize: 20 }} />}
          </div>
          <div>
            <Title level={4} style={{ margin: 0, color: _isLight ? '#1f2937' : '#fff', lineHeight: 1.3 }}>{t(`${plugin.name}:title`, plugin.title)}</Title>
            <Text style={{ color: _isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)', fontSize: 12 }}>{plugin.name}</Text>
          </div>
        </div>
      </div>



      {/* Tabs */}
      <Tabs
        activeKey={activeTabKey}
        onChange={handleTabChange}
        tabBarExtraContent={
          plugin.name === 'site_portal' && ['portal_manager', 'style_selection'].includes(activeTabKey) ? (
            <Button
              icon={<EyeOutlined />}
              onClick={() => window.open('/home', '_blank')}
              style={{ marginRight: 8 }}
            >
              预览门户
            </Button>
          ) : undefined
        }
        items={
          currentDyn
            ? [
              { key: 'basic', label: '基本配置', children: basicTab },
              ...(currentDyn.tabs
                ? currentDyn.tabs.map((t: any) => ({
                    key: t.key,
                    label: t.label,
                    children: <PluginModule>{React.createElement(safeLazy(t.component))}</PluginModule>
                  }))
                : currentDyn.component
                  ? [
                      {
                        key: 'plugin_panel',
                        label: currentDyn.title,
                        children: <PluginModule>{React.createElement(safeLazy(currentDyn.component!))}</PluginModule>
                      }
                    ]
                  : [])
            ]
            : plugin.name === 'high_availability_channel'
              ? [
              { key: 'basic', label: '基本配置', children: basicTab },
              { key: 'ha_config', label: '高可用参数配置', children: haConfigTab },
            ]
            : plugin.name === 'team_marketing'
              ? [
                { key: 'basic', label: '基本配置', children: basicTab },
                { key: 'team_config', label: '团队配置', children: <PluginModule><TeamConfig /></PluginModule> },
              ]
            : plugin.name === 'playground'
              ? [
                { key: 'basic', label: '基本配置', children: basicTab },
                { key: 'pg_storage', label: '存储配置', children: storageTab },
                { key: 'playground_models', label: '创作模型管理', children: playgroundModelTab },
                { key: 'playground_schemes', label: '创作方案配置', children: playgroundSchemeTab },
                { key: 'playground_advanced_nodes', label: '高级节点配置', children: playgroundAdvancedNodesTab },
                { key: 'playground_agent_config', label: 'AI智能体配置', children: playgroundAgentConfigTab },
              ]
                  : plugin.name === 'model_marketplace'
                    ? [
                      { key: 'basic', label: '基本配置', children: basicTab },
                      { key: 'marketplace_models', label: '模型列表', children: marketplaceModelTab },
                    ]
                    : plugin.name === 'site_icons'
                      ? [
                        { key: 'basic', label: '基本配置', children: basicTab },
                        { key: 'icon_library', label: '图标库管理', children: <PluginModule><SiteIconsManager /></PluginModule> },
                      ]
                        : plugin.name === 'site_portal'
                          ? [
                            { key: 'portal_manager', label: '门户管理', children: <PluginModule><PortalManager /></PluginModule> },
                            { key: 'style_selection', label: '风格选择', children: <PluginModule><PortalStyleSelection /></PluginModule> },
                            { key: 'basic', label: '基本配置', children: basicTab },
                            { key: 'storage', label: '门户存储配置', children: storageTab },
                          ]
                        : plugin.name === 'docs_api'
                          ? [
                            { key: 'docs_manager', label: '文档管理', children: <PluginModule><DocsManager /></PluginModule> },
                            { key: 'basic', label: '基本配置', children: basicTab },
                          ]
                        : plugin.name === 'happyhorse_router'
                            ? [
                              { key: 'basic', label: '基本配置', children: basicTab },
                              { key: 'happyhorse_logs', label: '小马转换日志', children: <PluginModule><HappyHorseManager mode="logs" /></PluginModule> },
                              { key: 'happyhorse_config', label: '小马转换配置', children: <PluginModule><HappyHorseManager mode="config" /></PluginModule> }
                            ]
                            : (plugin.name === 'asset_manager' || plugin.name === 'asset_manager_intl')
                            ? [
                              { key: 'basic', label: '基本配置', children: basicTab },
                              { key: 'api_access', label: 'API 接口调用', children: (
                                <ApiAccessConfig
                                  key={`${plugin.name}-${plugin.allowed_levels || 'all'}`}
                                  pluginNs={plugin.name}
                                  levels={levels}
                                  allowedLevels={plugin.allowed_levels || 'all'}
                                />
                              )},
                              { key: 'storage', label: '存储配置', children: storageTab },
                              { key: 'moderation', label: '审核配置', children: moderationTab },
                              {
                                key: 'moderation_query',
                                label: '风控查询',
                                // 仅激活时挂载，避免 Tabs 保活导致抢焦点/多余渲染
                                children: activeTabKey === 'moderation_query'
                                  ? <ModerationQuery key={plugin.name} pluginNs={plugin.name} />
                                  : null,
                              },
                              { key: 'audit_log', label: '审核日志', children: auditLogTab },
                              { key: 'preset', label: '预设素材', children: <AdminPresetAssets pluginNs={plugin.name} /> },
                              { key: 'relay_convert', label: '转换素材', children: <RelayConvertAssets pluginNs={plugin.name} /> },
                              { key: 'api_proxy', label: 'API 素材', children: <ApiProxyAssets pluginNs={plugin.name} /> },
                              { key: 'api_log', label: '接口日志', children: apiLogTab },
                            ]
                            : [
                              { key: 'basic', label: '基本配置', children: basicTab },
                            ]
        }
      />

      {/* 针对部分插件可能不挂载而导致 useForm() 失去关联的警告处理 */}
      {name === 'playground' && (
        <div style={{ display: 'none' }}>
          <Form form={moderationForm} />
        </div>
      )}
    </div>
  );
};

const PluginConfig: React.FC = () => (
  <App style={{ height: '100%', width: '100%' }}>
    <AppMessageBridge>
      <PluginConfigInner />
    </AppMessageBridge>
  </App>
);

export default PluginConfig;
