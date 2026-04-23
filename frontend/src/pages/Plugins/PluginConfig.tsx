import React, { useState, useEffect } from 'react';
import { Typography, Switch, Button, Checkbox, Divider, Spin, Tag, Tabs, Input, InputNumber, Form, Space, Alert, Select, Table, Drawer, Radio, App } from 'antd';
import { ArrowLeftOutlined, SaveOutlined, PictureOutlined, AppstoreOutlined, CloudServerOutlined, ApiOutlined, CheckCircleOutlined, LoadingOutlined, CloseCircleOutlined, SendOutlined, TeamOutlined, ExperimentOutlined, SettingOutlined, VideoCameraOutlined, PlusOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import request from '../../utils/request';
import type { Plugin } from '../../types';
import AdminPresetAssets from './AssetManager/AdminPresetAssets';
import RelayConvertAssets from './AssetManager/RelayConvertAssets';
import TeamConfig from './TeamMarketing/TeamConfig';
import JsonView from '@uiw/react-json-view';
import { darkTheme } from '@uiw/react-json-view/dark';

const { Title, Text } = Typography;

interface UserLevel {
  id: number;
  group_key: string;
  name: string;
  description?: string;
  discount?: number;
}

interface StorageConfig {
  tos_access_key: string;
  tos_secret_key_masked: string;
  tos_endpoint: string;
  tos_region: string;
  tos_bucket: string;
  tos_path_prefix: string;
  tos_custom_domain: string;
  is_configured: boolean;
}

interface ModerationConfig {
  volc_access_key: string;
  volc_secret_key_masked: string;
  volc_app_id: string;
  volc_project_name: string;
  volc_group_id: string;
  is_configured: boolean;
}

// 火山引擎 TOS 地域及访问域名（来自官方文档）
const TOS_REGIONS = [
  { label: '华北2（北京）', region: 'cn-beijing', endpoint: 'https://tos-cn-beijing.volces.com', endpointInternal: 'tos-cn-beijing.ivolces.com' },
  { label: '华南1（广州）', region: 'cn-guangzhou', endpoint: 'https://tos-cn-guangzhou.volces.com', endpointInternal: 'tos-cn-guangzhou.ivolces.com' },
  { label: '华东2（上海）', region: 'cn-shanghai', endpoint: 'https://tos-cn-shanghai.volces.com', endpointInternal: 'tos-cn-shanghai.ivolces.com' },
  { label: '中国香港', region: 'cn-hongkong', endpoint: 'https://tos-cn-hongkong.volces.com', endpointInternal: 'tos-cn-hongkong.ivolces.com' },
  { label: '亚太东南（柔佛）', region: 'ap-southeast-1', endpoint: 'https://tos-ap-southeast-1.volces.com', endpointInternal: 'tos-ap-southeast-1.ivolces.com' },
  { label: '亚太东南（雅加达）', region: 'ap-southeast-3', endpoint: 'https://tos-ap-southeast-3.volces.com', endpointInternal: 'tos-ap-southeast-3.ivolces.com' },
];

const pluginIcons: Record<string, React.ReactNode> = {
  asset_manager: <PictureOutlined style={{ fontSize: 20 }} />,
  team_marketing: <TeamOutlined style={{ fontSize: 20 }} />,
  playground: <ExperimentOutlined style={{ fontSize: 20 }} />,
};

const PluginConfigInner: React.FC = () => {
  const { message } = App.useApp();
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
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
  const [levelApiEnabled, setLevelApiEnabled] = useState<Record<string, boolean>>({});
  const [defaultApiEnabled, setDefaultApiEnabled] = useState<boolean>(true);

  // 存储配置
  const [storageConfig, setStorageConfig] = useState<StorageConfig | null>(null);
  const [storageForm] = Form.useForm();
  const [savingStorage, setSavingStorage] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [activeTabKey, setActiveTabKey] = useState(() => {
    const hash = window.location.hash.replace('#', '');
    if (['audit_log', 'basic', 'storage', 'moderation', 'preset', 'api_log', 'team_config', 'pg_storage'].includes(hash)) return hash;
    return 'basic'; // default to basic, will be adjusted when plugin loads
  });
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

  // ====== 体验中心 (Playground) 配置 Tab ======
  const [pgModels, setPgModels] = useState<any[]>([]);
  const [pgSchemes, setPgSchemes] = useState<any[]>([]);
  const [savingPlayground, setSavingPlayground] = useState(false);
  const [pgSearchKeyword, setPgSearchKeyword] = useState('');
  const [pgSchemeDrawerVisible, setPgSchemeDrawerVisible] = useState(false);
  const [pgCurrentId, setPgCurrentId] = useState<number | null>(null);
  const [pgSelectedSchemeId, setPgSelectedSchemeId] = useState<string>('');

  const fetchPlaygroundConfigBase = async () => {
    try {
      const res = await (request.get(`/plugins/${name}/playground-config`) as Promise<any>);
      if (res.models) setPgModels(res.models);
      if (res.schemes) setPgSchemes(res.schemes);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (name === 'playground') {
      fetchPlaygroundConfigBase();
    }
  }, [name]);

  const handleSavePlaygroundConfig = async () => {
    try {
      setSavingPlayground(true);
      const payload = {
        models: pgModels.map(m => ({
          id: m.id,
          mid: m.mid || '',
          enabled: m.pg_enabled,
          scheme_id: m.pg_scheme_id || null,
        }))
      };
      await request.post(`/plugins/${name}/playground-config`, payload);
      message.success('体验配置保存成功');
    } catch (e) {
      message.error('保存失败');
    } finally {
      setSavingPlayground(false);
    }
  };

  const handlePgToggle = (id: number, enabled: boolean) => {
    setPgModels(prev => prev.map(m => m.id === id ? { ...m, pg_enabled: enabled } : m));
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

  // ====== 体验方案配置 Tab ======
  const [schemeList, setSchemeList] = useState<any[]>([]);
  const [savingSchemes, setSavingSchemes] = useState(false);
  const [schemeEditVisible, setSchemeEditVisible] = useState(false);
  const [editingScheme, setEditingScheme] = useState<any>(null);
  const [editingSchemeIndex, setEditingSchemeIndex] = useState<number>(-1);

  const fetchSchemeList = async () => {
    try {
      const res = await (request.get(`/plugins/${name}/playground-schemes`) as Promise<any>);
      if (res.schemes) setSchemeList(res.schemes);
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
      name: '新建体验方案',
      type: 'video',
      is_system: false,
      description: '请填写方案描述',
      params: [
        { key: 'ratio', label: '画面比例', type: 'radio', options: ['16:9', '9:16', '1:1'], default: '16:9' },
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
    const newParams = [...editingScheme.params, { key: `param_${Date.now()}`, label: '新参数', type: 'select', options: ['选项1'], default: '选项1' }];
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
    } catch (e) {
      console.error('获取接口日志失败', e);
    } finally {
      setApiLogsLoading(false);
    }
  };

  // 审核日志
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditUidMap, setAuditUidMap] = useState<Record<string, {uid: string; username: string}>>({});

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
          const res = await (request.get(`/assets/admin/list?category=虚拟人像`) as any);
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
        if (found.allowed_levels === 'all') {
          setIsAllLevels(true);
          setSelectedLevels([]);
        } else {
          setIsAllLevels(false);
          setSelectedLevels(found.allowed_levels.split(',').filter(Boolean));
        }
      }

      const allLevels = Array.isArray(levelRes) ? levelRes : (levelRes.data || levelRes.levels || []);
      setLevels(allLevels);

      if (storageRes) {
        setStorageConfig(storageRes);
        // 加载等级配额
        if (storageRes.level_quotas) {
          setLevelQuotas(storageRes.level_quotas);
        }
        if (storageRes.default_quota != null) {
          setDefaultQuota(storageRes.default_quota);
        }
        if (storageRes.level_max_folders) {
          setLevelMaxFolders(storageRes.level_max_folders);
        }
        if (storageRes.default_max_folders != null) {
          setDefaultMaxFolders(storageRes.default_max_folders);
        }
        if (storageRes.level_max_files_per_folder) {
          setLevelMaxFilesPerFolder(storageRes.level_max_files_per_folder);
        }
        if (storageRes.default_max_files_per_folder != null) {
          setDefaultMaxFilesPerFolder(storageRes.default_max_files_per_folder);
        }
        if (storageRes.default_api_enabled != null) {
          setDefaultApiEnabled(storageRes.default_api_enabled);
        }
        // 为所有等级显式初始化 API 开关，每个等级独立互不影响
        const savedApiEnabled = storageRes.level_api_enabled || {};
        const apiDefault = storageRes.default_api_enabled ?? true;
        const initialApiEnabled: Record<string, boolean> = {};
        allLevels.forEach((lv: any) => {
          initialApiEnabled[lv.group_key] = savedApiEnabled[lv.group_key] ?? apiDefault;
        });
        setLevelApiEnabled(initialApiEnabled);
        // 延迟设置表单值，等待 Tabs 内的 Form 组件渲染完毕
        setTimeout(() => {
          storageForm.setFieldsValue({
            tos_access_key: storageRes.tos_access_key || '',
            tos_secret_key: '',
            tos_endpoint: storageRes.tos_endpoint || '',
            tos_region: storageRes.tos_region || '',
            tos_bucket: storageRes.tos_bucket || '',
            tos_path_prefix: storageRes.tos_path_prefix || '',
            tos_custom_domain: storageRes.tos_custom_domain || '',
          });
        }, 0);
      }

      if (moderationRes) {
        setModerationConfig(moderationRes);
        setTimeout(() => {
          moderationForm.setFieldsValue({
            volc_access_key: moderationRes.volc_access_key || '',
            volc_secret_key: '',
            volc_app_id: moderationRes.volc_app_id || '',
            volc_project_name: moderationRes.volc_project_name || 'default',
            volc_group_id: moderationRes.volc_group_id || '',
          });
        }, 0);
      }
    } catch (error) {
      message.error('加载插件信息失败');
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
      message.error('操作失败');
    }
  };

  const handleSaveBasic = async () => {
    if (!plugin) return;
    const allowed = isAllLevels ? 'all' : selectedLevels.join(',');
    if (!isAllLevels && selectedLevels.length === 0) {
      message.warning('请至少选择一个用户等级');
      return;
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
        level_api_enabled: levelApiEnabled,
        default_api_enabled: defaultApiEnabled,
      });
      message.success('配置已保存');
    } catch (error) {
      message.error('保存失败');
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
      message.error('保存失败');
    } finally {
      setSavingStorage(false);
    }
  };

  const handleTestConnection = async () => {
    try {
      setTesting(true);
      setTestResult(null);
      const res = await request.post(`/plugins/${name}/test-connection`, {}) as any;
      setTestResult(res);
    } catch (error: any) {
      setTestResult({ success: false, message: error?.response?.data?.error?.message || '测试失败' });
    } finally {
      setTesting(false);
    }
  };

  const handleSaveModeration = async () => {
    try {
      const values = await moderationForm.validateFields();
      setSavingModeration(true);
      await request.post(`/plugins/${name}/moderation-config`, values);
      message.success('审核配置已保存');
    } catch (error: any) {
      if (error?.errorFields) return; // 表单验证失败
      const rawMsg = error?.response?.data?.error?.message || '';
      message.error(rawMsg || '保存审核配置失败');
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

  const isEnabled = plugin.is_enabled === 1;

  // ====== 基本配置 Tab ======
  const basicTab = (
    <div>
      {/* 启用状态 */}
      <div style={{
        background: '#141414', borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.08)',
        padding: '16px 20px', marginBottom: 16,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <Text strong style={{ color: '#fff', fontSize: 14 }}>启用状态</Text><br />
          <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>开启后，符合等级要求的用户将在菜单中看到此功能</Text>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Tag color={isEnabled ? 'success' : 'default'} style={{ margin: 0 }}>{isEnabled ? '运行中' : '已停用'}</Tag>
          <Switch checked={isEnabled} onChange={handleToggle} />
        </div>
      </div>

      {/* 用户等级 */}
      <div style={{
        background: '#141414', borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.08)', padding: '20px', marginBottom: 16,
      }}>
        <Text strong style={{ color: '#fff', fontSize: 14 }}>开放用户等级</Text><br />
        <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>设置哪些用户等级可以使用此插件功能</Text>
        <Divider style={{ borderColor: 'rgba(255,255,255,0.06)', margin: '14px 0' }} />

        <div
          style={{ padding: '12px 16px', borderRadius: 6, border: isAllLevels ? '1px solid rgba(22,119,255,0.4)' : '1px solid rgba(255,255,255,0.08)', background: isAllLevels ? 'rgba(22,119,255,0.06)' : 'transparent', cursor: 'pointer', marginBottom: 8, transition: 'all 0.15s' }}
          onClick={() => { setIsAllLevels(true); setSelectedLevels([]); }}
        >
          <Checkbox checked={isAllLevels}><Text style={{ color: '#fff', fontSize: 13 }}>对所有用户等级开放</Text></Checkbox>
          <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, display: 'block', marginLeft: 24, marginTop: 2 }}>包含当前及以后新增的所有用户等级</Text>
        </div>
        <div
          style={{ padding: '12px 16px', borderRadius: 6, border: !isAllLevels ? '1px solid rgba(22,119,255,0.4)' : '1px solid rgba(255,255,255,0.08)', background: !isAllLevels ? 'rgba(22,119,255,0.06)' : 'transparent', cursor: 'pointer', transition: 'all 0.15s' }}
          onClick={() => setIsAllLevels(false)}
        >
          <Checkbox checked={!isAllLevels}><Text style={{ color: '#fff', fontSize: 13 }}>仅对指定用户等级开放</Text></Checkbox>
        </div>

        {!isAllLevels && (
          <div style={{ marginTop: 14 }}>
            <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, display: 'block', marginBottom: 10 }}>已选择 {selectedLevels.length} 个等级</Text>
            {levels.map(lv => {
              const isSelected = selectedLevels.includes(lv.group_key);
              const showLimits = name !== 'team_marketing' && name !== 'playground';
              return (
                <div key={lv.group_key}
                  style={{ padding: '10px 14px', borderRadius: 6, border: isSelected ? '1px solid rgba(22,119,255,0.3)' : '1px solid rgba(255,255,255,0.06)', background: isSelected ? 'rgba(22,119,255,0.04)' : 'transparent', marginBottom: 6, transition: 'all 0.15s' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flex: 1 }}
                      onClick={() => setSelectedLevels(prev => prev.includes(lv.group_key) ? prev.filter(k => k !== lv.group_key) : [...prev, lv.group_key])}
                    >
                      <Checkbox checked={isSelected} />
                      <Text style={{ color: '#fff', fontSize: 13 }}>{lv.name}</Text>
                      <Tag style={{ margin: 0, fontSize: 11, borderRadius: 4, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.45)' }}>{lv.group_key}</Tag>
                    </div>
                  </div>
                  {showLimits && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, marginLeft: 24, flexWrap: 'wrap' }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, whiteSpace: 'nowrap' }}>存储空间</Text>
                        <InputNumber size="small" min={1} max={10240}
                          value={levelQuotas[lv.group_key] ?? 100}
                          onChange={(val) => setLevelQuotas(prev => ({ ...prev, [lv.group_key]: val ?? 100 }))}
                          style={{ width: 72, background: '#1f1f1f', borderColor: 'rgba(255,255,255,0.1)' }}
                          addonAfter="MB"
                        />
                      </div>
                      <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.08)' }} />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, whiteSpace: 'nowrap' }}>文件夹</Text>
                        <InputNumber size="small" min={1} max={1000}
                          value={levelMaxFolders[lv.group_key] ?? 20}
                          onChange={(val) => setLevelMaxFolders(prev => ({ ...prev, [lv.group_key]: val ?? 20 }))}
                          style={{ width: 68, background: '#1f1f1f', borderColor: 'rgba(255,255,255,0.1)' }}
                          addonAfter="个"
                        />
                      </div>
                      <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.08)' }} />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, whiteSpace: 'nowrap' }}>每夹文件</Text>
                        <InputNumber size="small" min={1} max={10000}
                          value={levelMaxFilesPerFolder[lv.group_key] ?? 100}
                          onChange={(val) => setLevelMaxFilesPerFolder(prev => ({ ...prev, [lv.group_key]: val ?? 100 }))}
                          style={{ width: 72, background: '#1f1f1f', borderColor: 'rgba(255,255,255,0.1)' }}
                          addonAfter="个"
                        />
                      </div>
                      <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.08)' }} />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, whiteSpace: 'nowrap' }}>API 接口调用</Text>
                        <Switch size="small"
                          checked={levelApiEnabled[lv.group_key] ?? true}
                          onChange={(checked) => setLevelApiEnabled(prev => ({ ...prev, [lv.group_key]: checked }))}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {levels.length === 0 && <Text style={{ color: 'rgba(255,255,255,0.25)', display: 'block', textAlign: 'center', padding: 16, fontSize: 13 }}>暂无用户等级，请先在「用户管理 → 用户等级」中创建</Text>}
          </div>
        )}
      </div>

      {isAllLevels && (name !== 'team_marketing' && name !== 'playground') && (
        <div style={{
          background: '#141414', borderRadius: 8,
          border: '1px solid rgba(255,255,255,0.08)', padding: '20px', marginBottom: 16,
        }}>
          <Text strong style={{ color: '#fff', fontSize: 14 }}>资源配额管理</Text><br />
          <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>设置每位用户的存储空间、文件夹数量、每文件夹文件数上限，可按等级单独覆盖</Text>
          <Divider style={{ borderColor: 'rgba(255,255,255,0.06)', margin: '14px 0' }} />

          {/* 表头 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr repeat(3, 140px) 100px', gap: 8, padding: '0 14px 8px', alignItems: 'center' }}>
            <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11 }}>等级</Text>
            <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, textAlign: 'center' }}>存储空间</Text>
            <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, textAlign: 'center' }}>文件夹上限</Text>
            <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, textAlign: 'center' }}>每夹文件上限</Text>
            <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, textAlign: 'center' }}>API 接口</Text>
          </div>

          {/* 全局默认行 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr repeat(3, 140px) 100px', gap: 8, padding: '10px 14px', borderRadius: 6, border: '1px solid rgba(22,119,255,0.3)', background: 'rgba(22,119,255,0.04)', marginBottom: 8, alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: 500 }}>全局默认</Text>
              <Tag color="blue" style={{ margin: 0, fontSize: 11 }}>默认值</Tag>
            </div>
            <InputNumber size="small" min={1} max={10240}
              value={defaultQuota} onChange={(val) => setDefaultQuota(val ?? 100)}
              style={{ width: '100%', background: '#1f1f1f', borderColor: 'rgba(255,255,255,0.1)' }}
              addonAfter="MB"
            />
            <InputNumber size="small" min={1} max={1000}
              value={defaultMaxFolders} onChange={(val) => setDefaultMaxFolders(val ?? 20)}
              style={{ width: '100%', background: '#1f1f1f', borderColor: 'rgba(255,255,255,0.1)' }}
              addonAfter="个"
            />
            <InputNumber size="small" min={1} max={10000}
              value={defaultMaxFilesPerFolder} onChange={(val) => setDefaultMaxFilesPerFolder(val ?? 100)}
              style={{ width: '100%', background: '#1f1f1f', borderColor: 'rgba(255,255,255,0.1)' }}
              addonAfter="个"
            />
            <div style={{ textAlign: 'center' }}>
              <Switch size="small" checked={defaultApiEnabled} onChange={setDefaultApiEnabled} />
            </div>
          </div>

          {/* 按等级覆盖 */}
          {levels.length > 0 && (
            <>
              <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, display: 'block', margin: '12px 0 8px' }}>按等级单独设置（覆盖全局默认值）</Text>
              {levels.map(lv => (
                <div key={lv.group_key}
                  style={{ display: 'grid', gridTemplateColumns: '1fr repeat(3, 140px) 100px', gap: 8, padding: '8px 14px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.06)', background: 'transparent', marginBottom: 6, alignItems: 'center' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Text style={{ color: '#fff', fontSize: 13 }}>{lv.name}</Text>
                    <Tag style={{ margin: 0, fontSize: 11, borderRadius: 4, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.45)' }}>{lv.group_key}</Tag>
                  </div>
                  <InputNumber size="small" min={1} max={10240}
                    value={levelQuotas[lv.group_key] ?? defaultQuota}
                    onChange={(val) => setLevelQuotas(prev => ({ ...prev, [lv.group_key]: val ?? defaultQuota }))}
                    style={{ width: '100%', background: '#1f1f1f', borderColor: 'rgba(255,255,255,0.1)' }}
                    addonAfter="MB"
                  />
                  <InputNumber size="small" min={1} max={1000}
                    value={levelMaxFolders[lv.group_key] ?? defaultMaxFolders}
                    onChange={(val) => setLevelMaxFolders(prev => ({ ...prev, [lv.group_key]: val ?? defaultMaxFolders }))}
                    style={{ width: '100%', background: '#1f1f1f', borderColor: 'rgba(255,255,255,0.1)' }}
                    addonAfter="个"
                  />
                  <InputNumber size="small" min={1} max={10000}
                    value={levelMaxFilesPerFolder[lv.group_key] ?? defaultMaxFilesPerFolder}
                    onChange={(val) => setLevelMaxFilesPerFolder(prev => ({ ...prev, [lv.group_key]: val ?? defaultMaxFilesPerFolder }))}
                    style={{ width: '100%', background: '#1f1f1f', borderColor: 'rgba(255,255,255,0.1)' }}
                    addonAfter="个"
                  />
                  <div style={{ textAlign: 'center' }}>
                    <Switch size="small"
                      checked={levelApiEnabled[lv.group_key] ?? true}
                      onChange={(checked) => setLevelApiEnabled(prev => ({ ...prev, [lv.group_key]: checked }))}
                    />
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSaveBasic}>保存配置</Button>
      </div>
    </div>
  );

  // ====== 存储配置 Tab ======
  const inputStyle = { background: '#1f1f1f', borderColor: 'rgba(255,255,255,0.1)' };
  const storageTab = (
    <div>
      {/* 状态提示 */}
      {storageConfig && (
        <div style={{ marginBottom: 16 }}>
          {storageConfig.is_configured ? (
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
        background: '#141414', borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.08)', padding: '20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <CloudServerOutlined style={{ color: '#1677ff', fontSize: 16 }} />
          <Text strong style={{ color: '#fff', fontSize: 14 }}>火山引擎 TOS 对象存储</Text>
        </div>

        <Form form={storageForm} layout="vertical" requiredMark={false}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item label={<Text style={{ color: 'rgba(255,255,255,0.65)' }}>Access Key</Text>} name="tos_access_key" rules={[{ required: true, message: '请输入 Access Key' }]}>
              <Input placeholder="火山引擎 Access Key" style={inputStyle} />
            </Form.Item>
            <Form.Item
              label={<Text style={{ color: 'rgba(255,255,255,0.65)' }}>Secret Key</Text>}
              name="tos_secret_key"
              extra={storageConfig?.tos_secret_key_masked ? <Text style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11 }}>当前: {storageConfig.tos_secret_key_masked}（留空则不修改）</Text> : undefined}
            >
              <Input.Password placeholder="火山引擎 Secret Key" style={inputStyle} />
            </Form.Item>
          </div>

          <Form.Item label={<Text style={{ color: 'rgba(255,255,255,0.65)' }}>数据地域</Text>} name="tos_region" rules={[{ required: true, message: '请选择数据地域' }]}>
            <Select
              placeholder="选择数据地域"
              style={{ width: '100%' }}
              popupClassName="dark-select-dropdown"
              onChange={(value: string) => {
                const found = TOS_REGIONS.find(r => r.region === value);
                if (found) {
                  storageForm.setFieldsValue({ tos_endpoint: found.endpoint });
                }
              }}
              options={TOS_REGIONS.map(r => ({
                value: r.region,
                label: (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{r.label}</span>
                    <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>{r.region}</span>
                  </div>
                ),
              }))}
            />
          </Form.Item>
          <Form.Item label={<Text style={{ color: 'rgba(255,255,255,0.65)' }}>Endpoint</Text>} name="tos_endpoint" rules={[{ required: true, message: '请选择地域后自动填充' }]}
            extra={<Text style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11 }}>选择地域后自动填充，如使用内网请手动修改</Text>}
          >
            <Input placeholder="选择地域后自动填充" style={inputStyle} />
          </Form.Item>

          <Form.Item label={<Text style={{ color: 'rgba(255,255,255,0.65)' }}>Bucket</Text>} name="tos_bucket" rules={[{ required: true, message: '请输入 Bucket 名称' }]}>
            <Input placeholder="对象存储桶名称" style={inputStyle} />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item label={<Text style={{ color: 'rgba(255,255,255,0.65)' }}>路径前缀</Text>} name="tos_path_prefix" extra={<Text style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11 }}>选填，如 assets/upload</Text>}>
              <Input placeholder="如 assets/" style={inputStyle} />
            </Form.Item>
            <Form.Item label={<Text style={{ color: 'rgba(255,255,255,0.65)' }}>自定义域名</Text>} name="tos_custom_domain" extra={<Text style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11 }}>选填，CDN 加速域名</Text>}>
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
    </div>
  );

  // ====== 审核配置 Tab ======
  const moderationTab = (
    <div>
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
        background: '#141414', borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.08)', padding: '20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <ApiOutlined style={{ color: '#1677ff', fontSize: 16 }} />
          <Text strong style={{ color: '#fff', fontSize: 14 }}>私域虚拟人像素材资产库配置</Text>
        </div>
        <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, display: 'block', marginBottom: 16 }}>
          请前往火山引擎控制台 → 头像下拉菜单 →「API访问密钥」页面，创建并获取 Access Key ID 和 Secret Access Key
        </Text>

        <Form form={moderationForm} layout="vertical" requiredMark={false}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item label={<Text style={{ color: 'rgba(255,255,255,0.65)' }}>Access Key ID</Text>} name="volc_access_key" rules={[{ required: true, message: '请输入 Access Key ID' }]}>
              <Input placeholder="Access Key ID" style={inputStyle} />
            </Form.Item>
            <Form.Item
              label={<Text style={{ color: 'rgba(255,255,255,0.65)' }}>Secret Access Key</Text>}
              name="volc_secret_key"
              rules={[{ required: !moderationConfig?.is_configured, message: '请输入 Secret Access Key' }]}
              extra={moderationConfig?.volc_secret_key_masked ? <Text style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11 }}>当前: {moderationConfig.volc_secret_key_masked}（留空则不修改）</Text> : undefined}
            >
              <Input.Password placeholder="Secret Access Key" style={inputStyle} />
            </Form.Item>
          </div>
          <Form.Item
            label={<Text style={{ color: 'rgba(255,255,255,0.65)' }}>使用项目名称 (ProjectName)</Text>}
            name="volc_project_name"
            extra={<Text style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11 }}>接口调用时使用的项目名称，留空则默认为 default</Text>}
          >
            <Input placeholder="default" style={inputStyle} />
          </Form.Item>
          {name === 'asset_manager' && (
            <Form.Item
              label={<Text style={{ color: 'rgba(255,255,255,0.65)' }}>Ark 转换素材组 ID (GroupID)</Text>}
              name="volc_group_id"
              extra={<Text style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11 }}>若留空，系统将在首次转换素材时自动向方舟申请并绑定专属群组 ID。您也可以手动填入在方舟控制台申请的已有组标识如: g-xxx</Text>}
            >
              <Input placeholder="留空交由系统自动为您生成管理，或输入火山引擎资产库 Group ID" style={inputStyle} />
            </Form.Item>
          )}
        </Form>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <Button type="primary" icon={<SaveOutlined />} loading={savingModeration} onClick={handleSaveModeration}>保存审核配置</Button>
        </div>
      </div>
    </div>
  );

  // ====== 审核日志 Tab ======


  const fetchAuditLogs = async () => {
    try {
      setAuditLoading(true);
      const res = await (request.get(`/assets/admin/list?category=虚拟人像`) as any);
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
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{info.username}</div>
          </span>
        ) : <Text style={{ fontSize: 12 }}>{userId?.slice(0, 8)}...</Text>;
      },
    },
    {
      title: '文件名',
      dataIndex: 'file_name',
      key: 'file_name',
      ellipsis: true,
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
      render: (aid: string) => aid ? <Text code style={{ fontSize: 11 }}>{aid.slice(0, 20)}...</Text> : <Text type="secondary">暂无</Text>,
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
      render: (t: string) => t ? <Text style={{ fontSize: 12 }}>{new Date(t).toLocaleString('zh-CN')}</Text> : '-',
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
        <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>共 {auditLogs.length} 条虚拟人像上传记录</Text>
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
              <div style={{ padding: 16, background: '#1a1a1a', borderRadius: 8 }}>
                <Text strong style={{ color: '#1677ff', display: 'block', marginBottom: 12, fontSize: 14 }}>📄 火山引擎素材详情 (GetAsset)</Text>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px' }}>
                  <div><Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>Asset ID</Text><br/><Text copyable style={{ fontSize: 13, fontFamily: 'monospace' }}>{info.Id}</Text></div>
                  <div><Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>Group ID</Text><br/><Text copyable style={{ fontSize: 13, fontFamily: 'monospace' }}>{info.GroupId}</Text></div>
                  <div><Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>状态 (Status)</Text><br/><Tag color={info.Status === 'Active' ? 'success' : info.Status === 'Failed' ? 'error' : 'processing'}>{info.Status}</Tag></div>
                  <div><Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>素材类型 (AssetType)</Text><br/><Text style={{ fontSize: 13 }}>{info.AssetType}</Text></div>
                  <div><Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>项目名称 (ProjectName)</Text><br/><Text style={{ fontSize: 13 }}>{info.ProjectName}</Text></div>
                  <div><Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>创建时间 (CreateTime)</Text><br/><Text style={{ fontSize: 13 }}>{info.CreateTime ? new Date(info.CreateTime).toLocaleString('zh-CN') : '-'}</Text></div>
                  <div style={{ gridColumn: '1 / -1' }}><Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>URL</Text><br/><Text copyable style={{ fontSize: 12, fontFamily: 'monospace', wordBreak: 'break-all' }}>{info.URL}</Text></div>
                </div>
              </div>
            );
          },
          onExpand: (expanded, record) => {
            if (expanded && record.asset_id) fetchAssetInfo(record.asset_id);
          },
        }}
      />
    </div>
  );


  const SOURCE_MAP: Record<string, { label: string; color: string }> = {
    api_proxy: { label: 'API 接口调用', color: 'blue' },
    page: { label: '页面操作', color: 'green' },
    relay_convert: { label: '转发规则替换', color: 'orange' },
  };

  const apiLogColumns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    { title: 'User ID', dataIndex: 'user_id', key: 'user_id', width: 140, render: (u: string) => <Text copyable>{u ? (u.substring(0,8) + '...') : ''}</Text> },
    { title: '接口名称', dataIndex: 'api_endpoint', key: 'api_endpoint', width: 180, render: (r: string) => <Tag color="cyan">{r}</Tag> },
    {
      title: '来源',
      dataIndex: 'source',
      key: 'source',
      width: 120,
      render: (s: string) => {
        const info = SOURCE_MAP[s] || { label: s, color: 'default' };
        return <Tag color={info.color}>{info.label}</Tag>;
      },
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
            placeholder="搜索接口名 / 用户ID"
            allowClear
            value={logKeyword}
            onChange={(e) => setLogKeyword(e.target.value)}
            onSearch={() => fetchApiLogs(1)}
            style={{ width: 220 }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>共 {apiLogsTotal} 条记录</Text>
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
                  <div style={{ background: '#141414', padding: '16px', borderRadius: '8px', maxHeight: '500px', overflow: 'auto', border: '1px solid #303030' }}>
                    <JsonView value={safeParse(record.request_payload)} style={darkTheme} collapsed={false} shortenTextAfterLength={0} displayDataTypes={false} displayObjectSize={false} />
                  </div>
                </div>
                <div>
                  <Text strong style={{ color: '#faad14', display: 'block', marginBottom: 8 }}>📥 Response Payload</Text>
                  <div style={{ background: '#141414', padding: '16px', borderRadius: '8px', maxHeight: '600px', overflow: 'auto', border: '1px solid #303030' }}>
                    <JsonView value={safeParse(record.response_payload)} style={darkTheme} collapsed={false} shortenTextAfterLength={0} displayDataTypes={false} displayObjectSize={false} />
                  </div>
                </div>
              </div>
            );
          },
        }}
      />
    </div>
  );

  // ====== 体验中心 (Playground) 统一模型管理 Tab ======
  const filteredPgModels = pgModels.filter(m => {
    if (!pgSearchKeyword) return true;
    const kw = pgSearchKeyword.toLowerCase();
    return m.name.toLowerCase().includes(kw) || m.model_id.toLowerCase().includes(kw) || m.mid?.toLowerCase()?.includes(kw);
  });

  const pgModelColumns = [
    {
      title: '模型名称',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: any) => (
        <div>
          <Text strong style={{ color: '#fff', fontSize: 13 }}>{name}</Text>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' }}>MID: {record.mid} | {record.model_id}</div>
        </div>
      ),
    },
    {
      title: '类型',
      dataIndex: 'type_name',
      key: 'type_name',
      width: 100,
      render: (t: string) => t ? (
        <Tag style={{ borderRadius: 4, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }}>
          {t.includes('视频') ? <VideoCameraOutlined style={{ marginRight: 4 }} /> : t.includes('图片') ? <PictureOutlined style={{ marginRight: 4 }} /> : null}
          {t}
        </Tag>
      ) : <Text type="secondary">-</Text>,
    },
    {
      title: '体验开关',
      key: 'pg_enabled',
      width: 100,
      render: (_: any, record: any) => (
        <Switch
          checked={record.pg_enabled}
          onChange={(val) => handlePgToggle(record.id, val)}
          checkedChildren="开启"
          unCheckedChildren="关闭"
        />
      ),
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
          <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>未绑定</Text>
        );
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_: any, record: any) => (
        <Button
          type="text"
          icon={<SettingOutlined />}
          onClick={() => handleOpenSchemeDrawer(record.id, record.pg_scheme_id)}
          style={{ color: '#1677ff' }}
        >
          配置
        </Button>
      ),
    },
  ];

  const playgroundModelTab = (
    <div>
      <div style={{ background: '#141414', borderRadius: 8, padding: '20px', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <Text strong style={{ color: '#fff', fontSize: 14 }}>可体验模型列表</Text>
            <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, display: 'block', marginTop: 4 }}>
              开启体验开关并绑定方案后，用户即可在体验中心使用该模型。已开启 {pgModels.filter(m => m.pg_enabled).length} / {pgModels.length} 个模型
            </Text>
          </div>
          <Input
            placeholder="搜索模型..."
            value={pgSearchKeyword}
            onChange={e => setPgSearchKeyword(e.target.value)}
            style={{ width: 220, background: '#1f1f1f', borderColor: 'rgba(255,255,255,0.1)' }}
            allowClear
          />
        </div>

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

      {/* 方案选择 Drawer */}
      <Drawer
        title="选择体验方案"
        open={pgSchemeDrawerVisible}
        onClose={() => setPgSchemeDrawerVisible(false)}
        size="default"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => { setPgSelectedSchemeId(''); handleConfirmScheme(); }}>取消绑定</Button>
            <Button type="primary" onClick={handleConfirmScheme}>确认绑定</Button>
          </div>
        }
      >
        <div style={{ marginBottom: 16 }}>
          <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
            为模型 <Text strong style={{ color: '#1677ff' }}>{pgModels.find(m => m.id === pgCurrentId)?.name}</Text> 选择一个体验方案
          </Text>
        </div>
        <Radio.Group
          value={pgSelectedSchemeId}
          onChange={e => setPgSelectedSchemeId(e.target.value)}
          style={{ width: '100%' }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {pgSchemes.map(scheme => (
              <div
                key={scheme.id}
                style={{
                  padding: '16px', borderRadius: 8,
                  border: pgSelectedSchemeId === scheme.id ? '1px solid rgba(22,119,255,0.5)' : '1px solid rgba(255,255,255,0.08)',
                  background: pgSelectedSchemeId === scheme.id ? 'rgba(22,119,255,0.06)' : '#141414',
                  cursor: 'pointer', transition: 'all 0.2s',
                }}
                onClick={() => setPgSelectedSchemeId(scheme.id)}
              >
                <Radio value={scheme.id}>
                  <Text strong style={{ color: '#fff', fontSize: 14 }}>{scheme.name}</Text>
                </Radio>
                <div style={{ marginTop: 8, marginLeft: 24 }}>
                  <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>{scheme.description}</Text>
                  <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {scheme.params?.map((p: any) => (
                      <Tag key={p.key} style={{ fontSize: 11, borderRadius: 4, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}>
                        {p.label}: {Array.isArray(p.options) ? p.options.join('/') : String(p.default)}
                      </Tag>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Radio.Group>
      </Drawer>
    </div>
  );

  // ====== 体验方案配置 Tab ======
  const playgroundSchemeTab = (
    <div>
      <div style={{ background: '#141414', borderRadius: 8, padding: '20px', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <Text strong style={{ color: '#fff', fontSize: 14 }}>体验方案列表</Text>
            <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, display: 'block', marginTop: 4 }}>
              管理内置和自定义的体验方案。每个方案定义了可配置的参数模板，绑定到模型后用户侧会动态展示。
            </Text>
          </div>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAddScheme}>新增方案</Button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {schemeList.map((scheme, idx) => (
            <div key={scheme.id} style={{
              padding: '16px 20px', borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.06)', background: '#1a1a1a',
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <Text strong style={{ color: '#fff', fontSize: 14 }}>{scheme.name}</Text>
                  {scheme.is_system && <Tag color="gold" style={{ fontSize: 10, borderRadius: 8, lineHeight: '18px' }}>内置</Tag>}
                  <Tag style={{ fontSize: 10, borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}>{scheme.type}</Tag>
                </div>
                <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, display: 'block', marginBottom: 8 }}>{scheme.description}</Text>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {scheme.params?.map((p: any) => (
                    <Tag key={p.key} style={{ fontSize: 11, borderRadius: 4, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.45)' }}>
                      {p.label}: {Array.isArray(p.options) ? p.options.join('/') : String(p.default)}{p.unit ? ` ${p.unit}` : ''}
                    </Tag>
                  ))}
                </div>
                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace', display: 'block', marginTop: 6 }}>ID: {scheme.id}</Text>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <Button type="text" icon={<EditOutlined />} onClick={() => handleEditScheme(scheme, idx)} style={{ color: '#1677ff' }}>编辑</Button>
                <Button type="text" icon={<DeleteOutlined />} onClick={() => handleDeleteScheme(idx)} danger disabled={!!scheme.is_system}>删除</Button>
              </div>
            </div>
          ))}
          {schemeList.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(255,255,255,0.3)' }}>暂无方案，点击「新增方案」创建</div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
          <Button type="primary" loading={savingSchemes} onClick={handleSaveAllSchemes} icon={<SaveOutlined />}>
            保存全部方案
          </Button>
        </div>
      </div>

      {/* 方案编辑 Drawer */}
      <Drawer
        title={editingSchemeIndex >= 0 ? '编辑体验方案' : '新建体验方案'}
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
              <Text style={{ display: 'block', marginBottom: 6, fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>方案名称</Text>
              <Input value={editingScheme.name} onChange={e => setEditingScheme({...editingScheme, name: e.target.value})} />
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <Text style={{ display: 'block', marginBottom: 6, fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>方案 ID</Text>
                <Input value={editingScheme.id} onChange={e => setEditingScheme({...editingScheme, id: e.target.value})} disabled={!!editingScheme.is_system} />
              </div>
              <div style={{ flex: 1 }}>
                <Text style={{ display: 'block', marginBottom: 6, fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>类型</Text>
                <Select value={editingScheme.type} onChange={v => setEditingScheme({...editingScheme, type: v})} style={{ width: '100%' }}
                  options={[{ label: '视频 (video)', value: 'video' }, { label: '图片 (image)', value: 'image' }, { label: '聊天 (chat)', value: 'chat' }]}
                />
              </div>
            </div>
            <div>
              <Text style={{ display: 'block', marginBottom: 6, fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>描述</Text>
              <Input.TextArea value={editingScheme.description} onChange={e => setEditingScheme({...editingScheme, description: e.target.value})} autoSize={{ minRows: 2, maxRows: 4 }} />
            </div>

            <Divider style={{ margin: '8px 0', borderColor: 'rgba(255,255,255,0.06)' }} />

            {/* 参数列表 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text strong style={{ color: '#fff', fontSize: 14 }}>参数配置</Text>
              <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={handleAddParam}>添加参数</Button>
            </div>

            {editingScheme.params?.map((param: any, pIdx: number) => (
              <div key={pIdx} style={{ background: '#1a1a1a', borderRadius: 8, padding: 14, border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>参数 #{pIdx + 1}</Text>
                  <Button type="text" size="small" icon={<DeleteOutlined />} danger onClick={() => handleRemoveParam(pIdx)} />
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <div style={{ flex: 1 }}>
                    <Text style={{ display: 'block', marginBottom: 4, fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Key</Text>
                    <Input size="small" value={param.key} onChange={e => handleEditingSchemeParamChange(pIdx, 'key', e.target.value)} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <Text style={{ display: 'block', marginBottom: 4, fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>显示标签</Text>
                    <Input size="small" value={param.label} onChange={e => handleEditingSchemeParamChange(pIdx, 'label', e.target.value)} />
                  </div>
                  <div style={{ width: 120 }}>
                    <Text style={{ display: 'block', marginBottom: 4, fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>控件类型</Text>
                    <Select size="small" value={param.type} onChange={v => handleEditingSchemeParamChange(pIdx, 'type', v)} style={{ width: '100%' }}
                      options={[{ label: 'Radio 单选', value: 'radio' }, { label: 'Select 下拉', value: 'select' }, { label: 'Switch 开关', value: 'switch' }]}
                    />
                  </div>
                </div>
                {param.type !== 'switch' && (
                  <div style={{ marginBottom: 8 }}>
                    <Text style={{ display: 'block', marginBottom: 4, fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>选项列表（用英文逗号分隔）</Text>
                    <Input size="small" value={Array.isArray(param.options) ? param.options.join(',') : ''}
                      onChange={e => handleEditingSchemeParamChange(pIdx, 'options', e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean))}
                      placeholder="例如: 16:9,9:16,1:1 或 480p,720p,1080p"
                    />
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <Text style={{ display: 'block', marginBottom: 4, fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>默认值</Text>
                    {param.type === 'switch' ? (
                      <Switch checked={!!param.default} onChange={v => handleEditingSchemeParamChange(pIdx, 'default', v)} />
                    ) : (
                      <Input size="small" value={String(param.default ?? '')} onChange={e => handleEditingSchemeParamChange(pIdx, 'default', e.target.value)} />
                    )}
                  </div>
                  <div style={{ width: 100 }}>
                    <Text style={{ display: 'block', marginBottom: 4, fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>单位</Text>
                    <Input size="small" value={param.unit || ''} onChange={e => handleEditingSchemeParamChange(pIdx, 'unit', e.target.value)} placeholder="可选" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Drawer>
    </div>
  );

  return (

    <div>
      {/* 页头 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 20, paddingBottom: 16,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/admin0755/plugins')} style={{ color: 'rgba(255,255,255,0.65)', padding: '4px 8px' }} />
          <div style={{
            width: 36, height: 36, borderRadius: 8, background: 'rgba(22,119,255,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1677ff',
          }}>
            {pluginIcons[plugin.name] || <AppstoreOutlined style={{ fontSize: 20 }} />}
          </div>
          <div>
            <Title level={4} style={{ margin: 0, color: '#fff', lineHeight: 1.3 }}>{plugin.title}</Title>
            <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>{plugin.name}</Text>
          </div>
        </div>
      </div>



      {/* Tabs */}
      <Tabs
        activeKey={activeTabKey}
        onChange={handleTabChange}
        items={
          plugin.name === 'team_marketing'
            ? [
                { key: 'basic', label: '基本配置', children: basicTab },
                { key: 'team_config', label: '团队配置', children: <TeamConfig /> },
              ]
            : plugin.name === 'playground'
            ? [
                { key: 'basic', label: '基本配置', children: basicTab },
                { key: 'pg_storage', label: '存储配置', children: storageTab },
                { key: 'playground_models', label: '体验模型管理', children: playgroundModelTab },
                { key: 'playground_schemes', label: '体验方案配置', children: playgroundSchemeTab },
              ]
            : [
                { key: 'audit_log', label: '审核日志', children: auditLogTab },
                { key: 'basic', label: '基本配置', children: basicTab },
                { key: 'storage', label: '存储配置', children: storageTab },
                { key: 'moderation', label: '审核配置', children: moderationTab },
                { key: 'preset', label: '预设素材', children: <AdminPresetAssets /> },
                { key: 'relay_convert', label: '转换素材', children: <RelayConvertAssets /> },
                { key: 'api_log', label: '接口日志', children: apiLogTab },
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
    <PluginConfigInner />
  </App>
);

export default PluginConfig;
