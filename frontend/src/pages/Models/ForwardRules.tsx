/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Space, Form, Input, Switch, message, Popconfirm, Modal, Tag, Select, Alert, Popover, Grid, Typography, Tooltip, Radio, InputNumber } from 'antd';
import MobileCardList, { MobileCard, CardRow, CardActions } from '../../components/MobileCardList';
import { PlusOutlined, EditOutlined, DeleteOutlined, CodeOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';
import { useThemeStore } from '../../store/theme';

const { TextArea } = Input;
const { Text } = Typography;
const { useBreakpoint } = Grid;

const RES_MUL_KEYS = ['720p', '1080p', '2k', '4k'] as const;
type ResKey = (typeof RES_MUL_KEYS)[number];

const ENHANCE_OPTIONS = [
  { value: 'standard', label: '标准' },
  { value: 'fast', label: '极速' },
  { value: 'pro', label: '专业' },
  { value: 'ai', label: '大模型' },
] as const;

/** 标准版场景（仅 standard 生效），默认 common */
const SCENE_OPTIONS = [
  { value: 'common', label: '通用' },
  { value: 'ugc', label: 'UGC 短视频' },
  { value: 'short_series', label: '短剧' },
  { value: 'aigc', label: 'AIGC' },
  { value: 'old_film', label: '老片修复' },
] as const;

/** 各目标分辨率允许的底座（首项为默认一级） */
const BASE_OPTIONS: Record<ResKey, string[]> = {
  '720p': ['480p'],
  '1080p': ['720p', '480p'],
  '2k': ['1080p', '720p', '480p'],
  '4k': ['1080p', '720p', '480p'],
};

const ENHANCE_VALUES = new Set<string>(ENHANCE_OPTIONS.map((o) => o.value));
const SCENE_VALUES = new Set<string>(SCENE_OPTIONS.map((o) => o.value));
type SelectOpt = { value: string; label: string };
const ENHANCE_SELECT = ENHANCE_OPTIONS as unknown as SelectOpt[];
const SCENE_SELECT = SCENE_OPTIONS as unknown as SelectOpt[];

const mapResKeys = <T,>(fn: (k: ResKey) => T): Record<string, T> =>
  Object.fromEntries(RES_MUL_KEYS.map((k) => [k, fn(k)]));

const defaultResMul = (): Record<string, number> => mapResKeys(() => 1);
const defaultResEnhance = (): Record<string, string> => mapResKeys(() => 'standard');
const defaultResScene = (): Record<string, string> => mapResKeys(() => 'common');
const defaultResBase = (): Record<string, string> => mapResKeys((k) => BASE_OPTIONS[k][0]);

/** 四档字符串映射：非法/缺失保留 defaults */
const parseStrMap = (
  raw: unknown,
  defaults: () => Record<string, string>,
  valid: Set<string> | ((k: ResKey, v: string) => boolean),
): Record<string, string> => {
  const out = defaults();
  if (!raw || typeof raw !== 'object') return out;
  const src = raw as Record<string, unknown>;
  for (const k of RES_MUL_KEYS) {
    const v = String(src[k] ?? '').trim().toLowerCase();
    const ok = typeof valid === 'function' ? valid(k, v) : valid.has(v);
    if (ok) out[k] = v;
  }
  return out;
};

/** 仅保留 keep 为真的档位；全默认则不落库 */
const compactStrMap = (
  raw: Record<string, string>,
  keep: (k: ResKey, v: string) => boolean,
): Record<string, string> | undefined => {
  const out: Record<string, string> = {};
  for (const k of RES_MUL_KEYS) {
    const v = (raw[k] || '').trim().toLowerCase();
    if (v && keep(k, v)) out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
};

const parseResMul = (raw: unknown): Record<string, number> => {
  const out = defaultResMul();
  if (!raw || typeof raw !== 'object') return out;
  const src = raw as Record<string, unknown>;
  for (const k of RES_MUL_KEYS) {
    const v = Number(src[k]);
    if (v > 0) out[k] = v;
  }
  return out;
};

const parseResEnhance = (raw: unknown) => parseStrMap(raw, defaultResEnhance, ENHANCE_VALUES);
const parseResScene = (raw: unknown) => parseStrMap(raw, defaultResScene, SCENE_VALUES);
const parseResBase = (raw: unknown) =>
  parseStrMap(raw, defaultResBase, (k, v) => BASE_OPTIONS[k].includes(v));

const compactResEnhance = (raw: Record<string, string>) =>
  compactStrMap(raw, (_k, v) => v !== 'standard');

/** scene 已由 parseResScene 校验，此处只过滤非标准档与默认 common */
const compactResScene = (enhance: Record<string, string>, scene: Record<string, string>) =>
  compactStrMap(scene, (k, v) => (enhance[k] || 'standard') === 'standard' && v !== 'common');

const compactResBase = (raw: Record<string, string>) =>
  compactStrMap(raw, (k, v) => v !== BASE_OPTIONS[k][0]);

interface ForwardRule {
  id: number;
  name: string;
  rule_type: string;
  category: string;
  config_json: string;
  description?: string;
  eid?: string;
  is_active: number;
  is_system?: number;
  sort_order: number;
  created_at: string;
}

const ForwardRules: React.FC = () => {
  const { t } = useTranslation();
  const [items, setItems] = useState<ForwardRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isConfigModalVisible, setIsConfigModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<ForwardRule | null>(null);
  const [currentConfig, setCurrentConfig] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [ruleTypeFilter, setRuleTypeFilter] = useState('all');
  // 动态获取的模型分类类型列表（从 model_types 接口获取，保持与后台一致）
  const [modelTypes, setModelTypes] = useState<{ id: number; name: string }[]>([]);
  const [form] = Form.useForm();
  const screens = useBreakpoint();

  const uniqueCategories = Array.from(new Set([
    ...modelTypes.map(t => t.name),
    ...items.map(i => i.category).filter(Boolean)
  ]));
  const uniqueTypes = Array.from(new Set(items.map(i => i.rule_type).filter(Boolean)));

  const filteredItems = items.filter(item => {
    let matchQuery = true;
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      matchQuery = Boolean(
        (item.name && item.name.toLowerCase().includes(lowerQuery)) ||
        (item.eid && String(item.eid).toLowerCase().includes(lowerQuery))
      );
    }
    const matchCategory = categoryFilter === 'all' || item.category === categoryFilter;
    const matchType = ruleTypeFilter === 'all' || item.rule_type === ruleTypeFilter;
    return matchQuery && matchCategory && matchType;
  });

  const fetchItems = async () => {
    setLoading(true);
    try {
      const resp = await (request.get('/forward-rules') as any);
      setItems(resp);
    } catch (e) {
      console.error(e);
      message.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
    // 动态加载模型分类类型（用于新增/编辑弹窗的分类选择）
    (request.get('/model-types') as any).then((types: any[]) => {
      setModelTypes(types.filter((t: any) => t.is_active === 1));
    }).catch(() => {});
  }, []);

  const handleAdd = () => {
    setEditingItem(null);
    form.resetFields();
    form.setFieldsValue({
      is_active: true,
      config_json: '{\n  \n}',
      sort_order: 0,
      is_cascade: false,
      res_mul: defaultResMul(),
      res_enhance: defaultResEnhance(),
      res_scene: defaultResScene(),
      res_base: defaultResBase(),
    });
    setIsModalVisible(true);
  };

  const handleEdit = (item: ForwardRule) => {
    let pollPath = '';
    let isCascade = false;
    let resMul = defaultResMul();
    let resEnhance = defaultResEnhance();
    let resScene = defaultResScene();
    let resBase = defaultResBase();
    try {
      const config = JSON.parse(item.config_json);
      pollPath = config.poll_path || '';
      isCascade = !!config.is_cascade;
      resMul = parseResMul(config.res_mul);
      resEnhance = parseResEnhance(config.res_enhance);
      resScene = parseResScene(config.res_scene);
      resBase = parseResBase(config.res_base);
    } catch (e) { /* ignore */ }

    setEditingItem(item);
    form.setFieldsValue({
      ...item,
      category: item.category ? [item.category] : ['聊天'],
      poll_path: pollPath,
      is_cascade: isCascade,
      res_mul: resMul,
      res_enhance: resEnhance,
      res_scene: resScene,
      res_base: resBase,
      is_active: item.is_active === 1,
      sort_order: item.sort_order || 0,
    });
    setIsModalVisible(true);
  };

  const handleStatusChange = async (record: ForwardRule, checked: boolean) => {
    try {
      await request.put(`/forward-rules/${record.id}`, {
        is_active: checked ? 1 : 0
      });
      message.success(t('common.success'));
      fetchItems();
    } catch (e) {
      console.error(e);
      message.error(t('common.error'));
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await request.delete(`/forward-rules/${id}`);
      message.success(t('common.success'));
      fetchItems();
    } catch (e) {
      console.error(e);
      message.error(t('common.error'));
    }
  };

  const handleSave = async (values: any) => {
    try {
      let configObj: any = {};
      try {
        configObj = JSON.parse(values.config_json || '{}');
      } catch (err) {
        message.error("配置内容不是合法的 JSON 格式");
        return;
      }

      // 自动同步 poll_path 到 config_json
      if (values.poll_path) {
        configObj.poll_path = values.poll_path;
      } else {
        delete configObj.poll_path;
      }

      // 级联：res_mul / res_enhance / res_scene / res_base（缺省值不落库）
      const putOpt = (key: string, val?: Record<string, string>) => {
        if (val) configObj[key] = val;
        else delete configObj[key];
      };
      if (values.is_cascade) {
        configObj.is_cascade = true;
        configObj.res_mul = parseResMul(values.res_mul);
        const enhanceMap = parseResEnhance(values.res_enhance);
        putOpt('res_enhance', compactResEnhance(enhanceMap));
        putOpt('res_scene', compactResScene(enhanceMap, parseResScene(values.res_scene)));
        putOpt('res_base', compactResBase(parseResBase(values.res_base)));
      } else {
        delete configObj.is_cascade;
        delete configObj.res_mul;
        delete configObj.res_enhance;
        delete configObj.res_scene;
        delete configObj.res_base;
      }

      const payload = {
        ...values,
        config_json: JSON.stringify(configObj, null, 2),
        category: (Array.isArray(values.category) && values.category.length > 0) ? values.category[0] : (values.category || '聊天'),
        is_active: values.is_active ? 1 : 0,
      };
      // 表单辅助字段已合并进 config_json，不单独提交
      delete payload.poll_path;
      delete payload.is_cascade;
      delete payload.res_mul;
      delete payload.res_enhance;
      delete payload.res_scene;
      delete payload.res_base;

      if (editingItem) {
        await request.put(`/forward-rules/${editingItem.id}`, payload);
      } else {
        await request.post('/forward-rules', payload);
      }
      message.success(t('common.success'));
      setIsModalVisible(false);
      fetchItems();
    } catch (e) {
      console.error(e);
      message.error(t('common.error'));
    }
  };

  const viewConfigJson = (jsonStr: string) => {
    try {
      const formatted = JSON.stringify(JSON.parse(jsonStr), null, 2);
      setCurrentConfig(formatted);
    } catch (e) {
      setCurrentConfig(jsonStr);
    }
    setIsConfigModalVisible(true);
  };

  const columns = [
    {
      title: '转发 (EID)',
      dataIndex: 'eid',
      key: 'eid',
      width: 120,
      render: (text: string) => <Tag color="blue">{text || '-'}</Tag>
    },
    {
      title: '规则名称',
      dataIndex: 'name',
      key: 'name',
      width: 200,
      render: (text: string) => <Text strong>{text}</Text>
    },
    {
      title: '来源类型',
      dataIndex: 'is_system',
      key: 'is_system',
      width: 100,
      render: (is_system: number) => is_system === 1 ? <Tag color="blue">系统内置</Tag> : <Tag color="default">自定义</Tag>
    },
    {
      title: '模式/厂商类型',
      dataIndex: 'rule_type',
      key: 'rule_type',
      width: 150,
      render: (text: string) => <Tag color="purple">{text}</Tag>
    },
    {
      title: '所属分类',
      dataIndex: 'category',
      key: 'category',
      width: 100,
      render: (text: string) => {
        const colorMap: Record<string, string> = {
          '聊天': 'blue', '图片': 'magenta', '视频': 'volcano',
          '语音': 'green', '音频': 'green', '向量': 'geekblue', '排序': 'gold',
        };
        return <Tag color={colorMap[text] || 'cyan'}>{text || '聊天'}</Tag>;
      }
    },
    {
      title: '应用详情描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: '排序',
      dataIndex: 'sort_order',
      key: 'sort_order',
      width: 90,
      sorter: (a: ForwardRule, b: ForwardRule) => (a.sort_order || 0) - (b.sort_order || 0),
      render: (text: number) => <Text>{text || 0}</Text>
    },
    {
      title: 'JSON 配置',
      key: 'config',
      render: (_: any, record: ForwardRule) => (
        <Button size="small" type="dashed" icon={<CodeOutlined />} onClick={() => viewConfigJson(record.config_json)}>
          查看 JSON 详情
        </Button>
      ),
      width: 150,
    },
    {
      title: t('common.status'),
      dataIndex: 'is_active',
      key: 'is_active',
      render: (active: number) => {
        const isActive = active === 1;
        return (
          <span style={{ 
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '2px 6px', borderRadius: 4, fontSize: 12,
            background: isActive ? 'rgba(128,128,128,0.06)' : 'transparent',
            color: isActive ? 'var(--text-color, inherit)' : '#8c8c8c',
            border: isActive ? '1px solid rgba(128,128,128,0.15)' : '1px dashed rgba(128,128,128,0.3)'
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: isActive ? '#8c8c8c' : 'transparent', border: isActive ? 'none' : '1px solid #8c8c8c' }} />
            {isActive ? t('common.active') : t('common.disabled')}
          </span>
        );
      },
      width: 100,
    },
    {
      title: t('common.actions'),
      key: 'actions',
      render: (_: any, record: ForwardRule) => (
        <Space>
          <Button icon={<EditOutlined />} onClick={() => handleEdit(record)} size="small" />
          {record.is_system === 1 ? (
            <Tooltip title="系统内置规则，不可删除">
              <Button icon={<DeleteOutlined />} disabled size="small" />
            </Tooltip>
          ) : (
            <Popconfirm title={t('common.confirm_delete')} onConfirm={() => handleDelete(record.id)}>
              <Button icon={<DeleteOutlined />} danger size="small" />
            </Popconfirm>
          )}
        </Space>
      ),
      width: 120,
    },
  ];

  const { themeMode } = useThemeStore();
  const _isLight = themeMode === 'light';

  const CText: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <span style={{
      background: _isLight ? 'rgba(0,0,0,0.06)' : '#252526',
      color: _isLight ? '#cf222e' : '#ce9178',
      padding: '1px 5px',
      borderRadius: 4,
      fontFamily: 'monospace',
      fontSize: 12,
      wordBreak: 'break-all',
      overflowWrap: 'anywhere',
    }}>{children}</span>
  );

  const ParamNo: React.FC<{ n: string; children: React.ReactNode }> = ({ n, children }) => (
    <div style={{ display: 'flex', gap: 8, marginBottom: 8, lineHeight: 1.5, minWidth: 0 }}>
      <span style={{
        flexShrink: 0,
        minWidth: 28,
        padding: '0 6px',
        height: 22,
        lineHeight: '22px',
        textAlign: 'center',
        borderRadius: 4,
        fontSize: 12,
        fontWeight: 600,
        background: _isLight ? 'rgba(24,144,255,0.12)' : 'rgba(24,144,255,0.25)',
        color: '#1890ff',
      }}>{n}</span>
      <div style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{children}</div>
    </div>
  );

  const helpParams: { n: string; body: React.ReactNode }[] = [
    {
      n: '1',
      body: <>
        <CText>target_type</CText>：目标协议类型。常用 <CText>openai</CText>、<CText>anthropic</CText>、
        <CText>gemini</CText>、<CText>volcengine</CText>、<CText>dashscope</CText>、<CText>kling</CText>、
        <CText>tencent_vod_video</CText>、<CText>tencent_vod_image</CText> 等。
      </>,
    },
    {
      n: '2',
      body: <>
        <CText>path_rewrite</CText>：入口路径改写。
        <div style={{ marginTop: 6 }}>
          <ParamNo n="2.1">
            <CText>old</CText>：匹配片段，如 <CText>/v1/video/generations</CText>
          </ParamNo>
          <ParamNo n="2.2">
            <CText>new</CText>：上游路径，支持 <CText>{`\${model}`}</CText> 等宏，如{' '}
            <CText>/api/v3/contents/generations/tasks</CText>
          </ParamNo>
        </div>
      </>,
    },
    {
      n: '3',
      body: <>
        <CText>auth_type</CText>：鉴权方式，默认 <CText>bearer</CText>。可选{' '}
        <CText>query_key</CText>、<CText>x-api-key</CText>、<CText>tencent_vod</CText>、<CText>volcengine_tts</CText>。
      </>,
    },
    {
      n: '4',
      body: <>
        <CText>poll_path</CText>：异步轮询路径，如 <CText>{`/api/v1/tasks/\${task_id}`}</CText>。
        支持 <CText>{`\${task_id}`}</CText>、<CText>{`\${model}`}</CText>。
      </>,
    },
    {
      n: '5',
      body: <>
        <CText>asset_convert</CText>：<CText>true</CText> 时将 content 网络 URL 转为方舟素材 ID（<CText>asset://</CText>），需配置素材插件凭证。
      </>,
    },
    {
      n: '6',
      body: <>
        <CText>asset_convert_ns</CText>：素材插件命名空间，默认 <CText>asset_manager</CText>，国际版 <CText>asset_manager_intl</CText>。
      </>,
    },
    {
      n: '7',
      body: <>
        <CText>moderation</CText>：<CText>true</CText> 时素材注册免审核（<CText>Skip</CText>）。
      </>,
    },
    {
      n: '8',
      body: <>
        <CText>content_to_prompt</CText>：无 <CText>prompt</CText> 时从 <CText>content</CText> 文本提取写入（部分火山视频通道）。
      </>,
    },
    {
      n: '9',
      body: <>
        <CText>is_cascade</CText>：启用二阶段级联（底座 → 超分）；阶段二超分不计费。
      </>,
    },
    {
      n: '10',
      body: <>
        <CText>res_mul</CText>：级联分辨率倍率，如 <CText>{`{"720p":1,"1080p":1.5,"2k":2,"4k":3.5}`}</CText>。
        阶段二成功后：若 stage1 有 usage tokens，则 token（返回/列表/计费）× 倍率；否则底座费用 × 倍率。缺省 key 按 <CText>1.0</CText>。
      </>,
    },
    {
      n: '11',
      body: <>
        <CText>res_enhance</CText>：每目标分辨率的增强版本（<CText>fast|standard|pro|ai</CText>），缺省 <CText>standard</CText>。
      </>,
    },
    {
      n: '12',
      body: <>
        <CText>res_scene</CText>：标准版增强场景（<CText>common|ugc|short_series|aigc|old_film</CText>），缺省 <CText>common</CText>；仅增强为 standard 时生效。
      </>,
    },
    {
      n: '13',
      body: <>
        <CText>res_base</CText>：每目标分辨率的阶段一座底，如 <CText>{`{"1080p":"720p"}`}</CText>。
        默认取一级（720p→480p、1080p→720p、2k/4k→1080p）；1080p 可调为 480p。
      </>,
    },
  ];

  const helpContent = (
    <div style={{
      width: '100%',
      maxWidth: 480,
      maxHeight: 'min(70vh, 560px)',
      overflowX: 'hidden',
      overflowY: 'auto',
      color: _isLight ? 'rgba(0, 0, 0, 0.85)' : 'rgba(255, 255, 255, 0.85)',
      boxSizing: 'border-box',
    }}>
      <p style={{ marginBottom: 10 }}>
        用于<strong>路径重写</strong>与<strong>协议转换</strong>，将标准 OpenAI 请求适配各厂商上游。配置后在「模型列表」绑定模型。
      </p>
      <b>核心参数（1–3）</b>
      <div style={{ marginTop: 8 }}>
        {helpParams.slice(0, 3).map((p) => (
          <ParamNo key={p.n} n={p.n}>{p.body}</ParamNo>
        ))}
      </div>
      <b>可选参数（4–13）</b>
      <div style={{ marginTop: 8 }}>
        {helpParams.slice(3).map((p) => (
          <ParamNo key={p.n} n={p.n}>{p.body}</ParamNo>
        ))}
      </div>
    </div>
  );

  return (
    <>
      <Card variant="borderless">
        <div style={{ display: 'flex', flexDirection: screens.xs ? 'column' : 'row', justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Typography.Title level={screens.xs ? 4 : 2} style={{ margin: 0 }}>
              高级转发规则管理
            </Typography.Title>
            <Popover
              content={helpContent}
              title="什么是高级转发规则引擎？"
              trigger="hover"
              placement="bottomLeft"
              overlayInnerStyle={{ maxWidth: 520, overflow: 'hidden' }}
            >
              <QuestionCircleOutlined style={{ color: '#1890ff', cursor: 'pointer', fontSize: 18 }} />
            </Popover>
          </div>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            {screens.xs ? '新增' : '新增定制规则'}
          </Button>
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', marginBottom: 20 }}>
          <Input.Search
            placeholder="搜索规则名称或EID"
            allowClear
            onSearch={setSearchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: 200 }}
          />
          <Space wrap size={[0, 8]}>
            <Text type="secondary" style={{ fontSize: 13, marginRight: 4 }}>所属分类:</Text>
            <Radio.Group
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              optionType="button"
              buttonStyle="solid"
              size="small"
            >
              <Radio.Button value="all">全部分类</Radio.Button>
              {uniqueCategories.map(c => <Radio.Button key={c} value={c}>{c}</Radio.Button>)}
            </Radio.Group>
          </Space>
          <Space wrap size={[0, 8]}>
            <Text type="secondary" style={{ fontSize: 13, marginRight: 4 }}>类型:</Text>
            <Radio.Group
              value={ruleTypeFilter}
              onChange={e => setRuleTypeFilter(e.target.value)}
              optionType="button"
              buttonStyle="solid"
              size="small"
            >
              <Radio.Button value="all">全部类型</Radio.Button>
              {uniqueTypes.map(t => <Radio.Button key={t} value={t}>{t}</Radio.Button>)}
            </Radio.Group>
          </Space>
        </div>
        {screens.xs ? (
          <MobileCardList
            dataSource={filteredItems}
            loading={loading}
            rowKey="id"
            pagination={{ pageSize: 15 }}
            renderCard={(record: any) => {
              const mobileColorMap: Record<string, string> = {
                '聊天': 'blue', '图片': 'magenta', '视频': 'volcano',
                '语音': 'green', '音频': 'green', '向量': 'geekblue', '排序': 'gold',
              };
              const categoryColor = mobileColorMap[record.category] || 'cyan';
              return (
                  <MobileCard
                    title={<Space><Text strong>{record.name}</Text></Space>}
                    extra={(() => {
                      const isActive = record.is_active === 1;
                      return (
                        <span style={{ 
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '2px 6px', borderRadius: 4, fontSize: 12,
                          background: isActive ? 'rgba(128,128,128,0.06)' : 'transparent',
                          color: isActive ? 'var(--text-color, inherit)' : '#8c8c8c',
                          border: isActive ? '1px solid rgba(128,128,128,0.15)' : '1px dashed rgba(128,128,128,0.3)'
                        }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: isActive ? '#8c8c8c' : 'transparent', border: isActive ? 'none' : '1px solid #8c8c8c' }} />
                          {isActive ? t('common.active') : t('common.disabled')}
                        </span>
                      );
                    })()}
                  >
                  <CardRow label="转发 (EID)"><Tag color="blue">{record.eid || '-'}</Tag></CardRow>
                  <CardRow label="来源类型">{record.is_system === 1 ? <Tag color="blue">系统内置</Tag> : <Tag color="default">自定义</Tag>}</CardRow>
                  <CardRow label="模式"><Tag color="purple">{record.rule_type}</Tag></CardRow>
                  <CardRow label="分类"><Tag color={categoryColor}>{record.category || '聊天'}</Tag></CardRow>
                  <CardRow label="排序"><Text>{record.sort_order || 0}</Text></CardRow>
                  {record.description && <CardRow label="描述"><Text type="secondary" style={{ fontSize: 12 }}>{record.description}</Text></CardRow>}
                  <CardActions>
                    <Button size="small" type="dashed" icon={<CodeOutlined />} onClick={() => viewConfigJson(record.config_json)}>JSON</Button>
                    <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
                    {record.is_system === 1 ? (
                      <Tooltip title="系统内置规则，不可删除">
                        <Button size="small" icon={<DeleteOutlined />} disabled />
                      </Tooltip>
                    ) : (
                      <Popconfirm title={t('common.confirm_delete')} onConfirm={() => handleDelete(record.id)}>
                        <Button size="small" icon={<DeleteOutlined />} danger />
                      </Popconfirm>
                    )}
                  </CardActions>
                </MobileCard>
              );
            }}
          />
        ) : (
          <Table
            dataSource={filteredItems}
            columns={columns}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 15 }}
            size="middle"
          />
        )}
      </Card>

      <Modal
        title={editingItem ? '编辑高级规则' : '新增规则引擎接入'}
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        onOk={() => form.submit()}
        width={860}
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="name" label={'规则标识名称 (例如: Anthropic 原生转换)'} rules={[{ required: true }]}>
            <Input placeholder="输入此规则的标记名称以便于检索" />
          </Form.Item>

          <Form.Item name="rule_type" label="映射厂商及模式 (类型标识)" rules={[{ required: true }]}>
            <Input placeholder="如: openai, anthropic, gemini, passthrough" />
          </Form.Item>

          <Form.Item name="category" label={'模型分类属类'} rules={[{ required: true }]} initialValue={['聊天']}>
            <Select
              mode="tags"
              maxCount={1}
              placeholder="请选择或输入新分类并回车..."
              options={modelTypes.length > 0
                ? modelTypes.map(t => ({ value: t.name, label: t.name }))
                : [{ value: '聊天', label: '聊天' }]
              }
            />
          </Form.Item>

          <Form.Item name="description" label="详细阐述">
            <Input.TextArea placeholder="用以描述该规则专门为了对接什么样的通道代理结构" rows={2} />
          </Form.Item>

          <Form.Item name="sort_order" label="排序" initialValue={0} tooltip="数字越大排在越前面">
            <InputNumber min={0} style={{ width: '100%' }} placeholder="请输入排序值（数字越大越靠前）" />
          </Form.Item>

          <Form.Item name="poll_path" label={<Space>异步任务轮询路径 (可选) <Popover content={`如果该模型是异步任务且上游查询路径非标准，请在此填写。例如：/v1/tasks/\${task_id}`}><QuestionCircleOutlined /></Popover></Space>}>
            <Input placeholder={`例如: /v1/tasks/\${task_id} 或 /v1/video/generations/\${task_id}`} />
          </Form.Item>

          <Form.Item name="is_cascade" label={<Space>级联超分 <Popover content="启用后走二阶段级联；阶段二超分不计费。阶段二成功后：有 usage tokens 则按 res_mul 放大 token（返回/列表/计费），无 tokens 时对底座费用相乘"><QuestionCircleOutlined /></Popover></Space>} valuePropName="checked">
            <Switch />
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prev, cur) =>
              prev.is_cascade !== cur.is_cascade ||
              RES_MUL_KEYS.some((k) => prev?.res_enhance?.[k] !== cur?.res_enhance?.[k])
            }
          >
            {({ getFieldValue }) => getFieldValue('is_cascade') ? (
              <Form.Item
                label={<Space>级联分辨率配置 <Popover content={<div style={{ maxWidth: 320 }}>每档可设：倍率、增强（默认标准）、场景（仅标准版，默认 common）、底座（默认一级，如 1080p→720p 可改 480p）。阶段二成功：有 usage 时 tokens×倍率，否则底座费用×倍率。</div>}><QuestionCircleOutlined /></Popover></Space>}
                style={{ marginBottom: 8 }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {RES_MUL_KEYS.map((k) => (
                    <Space key={k} wrap size="middle" align="start">
                      <Text strong style={{ width: 48, display: 'inline-block', lineHeight: '32px' }}>{k}</Text>
                      <Form.Item name={['res_mul', k]} label="倍率" style={{ marginBottom: 0 }} rules={[{ required: true }]}>
                        <InputNumber min={0.01} step={0.1} precision={2} style={{ width: 88 }} />
                      </Form.Item>
                      <Form.Item name={['res_enhance', k]} label="增强" style={{ marginBottom: 0 }}>
                        <Select style={{ width: 100 }} options={ENHANCE_SELECT} />
                      </Form.Item>
                      {getFieldValue(['res_enhance', k]) === 'standard' ? (
                        <Form.Item name={['res_scene', k]} label="场景" style={{ marginBottom: 0 }}>
                          <Select style={{ width: 128 }} options={SCENE_SELECT} />
                        </Form.Item>
                      ) : null}
                      <Form.Item name={['res_base', k]} label="底座" style={{ marginBottom: 0 }} rules={[{ required: true }]}>
                        <Select
                          style={{ width: 100 }}
                          options={BASE_OPTIONS[k].map((b) => ({ value: b, label: b }))}
                        />
                      </Form.Item>
                    </Space>
                  ))}
                </div>
              </Form.Item>
            ) : null}
          </Form.Item>

          <Form.Item name="config_json" label="JSON 引擎路由协议参数配置 (核心)" rules={[{ required: true }]}>
            <TextArea
              style={{ fontFamily: 'monospace', fontSize: 13, background: '#1e1e1e', color: '#d4d4d4', padding: 12 }}
              rows={10}
              placeholder={'{\n  "target_type": "volcengine",\n  "path_rewrite": {"old": "/v1/video/generations", "new": "/api/v3/contents/generations/tasks"},\n  "auth_type": "bearer"\n}'}
            />
          </Form.Item>

          <Form.Item name="is_active" label={t('common.status')} valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="JSON 重写拦截协议预览"
        open={isConfigModalVisible}
        footer={null}
        onCancel={() => setIsConfigModalVisible(false)}
        width={650}
      >
        <pre style={{
          background: '#121212',
          color: '#4af626',
          padding: 16,
          borderRadius: 8,
          border: '1px solid #333',
          overflow: 'auto',
          maxHeight: '60vh',
          fontSize: 13,
        }}>
          {currentConfig}
        </pre>
      </Modal>

    </>
  );
};

export default ForwardRules;
