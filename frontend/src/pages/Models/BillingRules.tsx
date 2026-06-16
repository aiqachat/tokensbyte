import React, { useState, useEffect, useMemo } from 'react';
import { Card, Table, Button, Space, Form, Input, Switch, message, Popconfirm, Tag, Radio, InputNumber, Row, Col, Typography, Grid, Tooltip, Select } from 'antd';
import MobileCardList, { MobileCard, CardRow, CardActions } from '../../components/MobileCardList';
import { PlusOutlined, EditOutlined, DeleteOutlined, DeleteTwoTone } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';
import useSettingsStore from '../../store/settings';
import RateDisplay from './RateDisplay';
import { useThemeStore } from '../../store/theme';
import dayjs from 'dayjs';
import { type ModelProvider, type ModelType } from '../../types';
import ClassificationFilter from '../../components/Models/ClassificationFilter';
const { Title, Text } = Typography;
const { useBreakpoint } = Grid;

interface BillingRuleData {
  id: number;
  name: string;
  billing_type: string;
  billing_rule: string;
  prompt_rate: number;
  completion_rate: number;
  cached_rate?: number;
  claude_cache_creation_rate?: number;
  claude_cache_read_rate?: number;
  fixed_rate: number;
  duration_rate: number;
  pricing_tiers: string;
  extended_config: string;
  pid?: string;
  provider_id?: number;
  type_id?: number;
  pricing_type: string;
  is_active: number;
  is_system: number;
  sort_order?: number;
  created_at: string;
  updated_at: string;
}

const BillingRules: React.FC = () => {
  const { themeMode } = useThemeStore();
  const _isLight = themeMode === 'light';
  const { t } = useTranslation();
  const { settings } = useSettingsStore();
  const currencySymbol = settings?.currency?.currency_symbol || '$';

  const auxiliaryCurrencies = useMemo(() => {
    return (settings?.currency?.auxiliary_currencies || []).filter((c: any) => c.enabled);
  }, [settings?.currency?.auxiliary_currencies]);
  const [selectedCurrencyCode, setSelectedCurrencyCode] = useState<string>('');

  const formatPrice = (price: number | string | undefined | null) => {
    if (price === undefined || price === null || price === '') return '-';
    const num = Number(price);
    if (isNaN(num)) return String(price);
    if (selectedCurrencyCode === '') {
      return `${currencySymbol}${num}`;
    }
    const curr = auxiliaryCurrencies.find(c => c.code === selectedCurrencyCode);
    if (curr) {
      return `${curr.symbol}${(num * curr.exchange_rate).toFixed(6).replace(/\.?0+$/, '')}`;
    }
    return `${currencySymbol}${num}`;
  };

  const [items, setItems] = useState<BillingRuleData[]>([]);
  const [filterType, setFilterType] = useState('all');
  const [filterPricingType, setFilterPricingType] = useState('all');
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<BillingRuleData | null>(null);
  const [billingType, setBillingType] = useState('tokens');
  const [form] = Form.useForm();
  const screens = useBreakpoint();
  // 精确查表模式：使用独立 state 管理价格表（form store 无法触发 re-render）
  const [klingPriceTable, setKlingPriceTable] = useState<Record<string, number>>({});
  const [klingDisabledKeys, setKlingDisabledKeys] = useState<string[]>([]);

  // 腾讯云 Vidu 视频/图片精确查表 state
  const [viduVideoPriceTable, setViduVideoPriceTable] = useState<Record<string, number>>({});
  const [viduVideoDisabledKeys, setViduVideoDisabledKeys] = useState<string[]>([]);
  const [viduImagePriceTable, setViduImagePriceTable] = useState<Record<string, number>>({});
  const [viduImageDisabledKeys, setViduImageDisabledKeys] = useState<string[]>([]);
  const [allProviders, setAllProviders] = useState<ModelProvider[]>([]);
  const [allTypes, setAllTypes] = useState<ModelType[]>([]);
  const [filterProvider, setFilterProvider] = useState<number | null>(null);
  const [filterTypeSelect, setFilterTypeSelect] = useState<number | null>(null);

  const fetchClassifications = async () => {
    try {
      const providers = await (request.get('/model-providers') as any);
      setAllProviders(providers.filter((p: any) => p.is_active));
      const types = await (request.get('/model-types') as any);
      setAllTypes(types.filter((t: any) => t.is_active));
    } catch (e) {
      console.error(e);
    }
  };

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
    fetchClassifications();
  }, []);

  const handleAdd = () => {
    setEditingItem(null);
    setBillingType('tokens');
    setKlingPriceTable({});
    setKlingDisabledKeys([]);
    setViduVideoPriceTable({});
    setViduVideoDisabledKeys([]);
    setViduImagePriceTable({});
    setViduImageDisabledKeys([]);
    form.resetFields();
    form.setFieldsValue({
      billing_type: 'tokens',
      billing_rule: 'standard',
      pricing_type: 'custom',
      is_active: true,
      sort_order: 0,
      prompt_rate: 0,
      completion_rate: 0,
      fixed_rate: 0,
      duration_rate: 0,
      pricing_tiers: [],
      sd2_480p_video: 0, sd2_480p_base: 0,
      sd2_720p_video: 0, sd2_720p_base: 0,
      sd2_1080p_video: 0, sd2_1080p_base: 0,
      sd2_480p_enabled: false,
      sd2_720p_enabled: false,
      sd2_1080p_enabled: false,
      volc_audio_rate: 0, volc_base_rate: 0,
      volc_offline_discount: 0.5,
      s1_online_rate: 0, s1_offline_rate: 0,
      prompt_extend_multiplier: 1,
      image_ref_multiplier: 1,
      quality_pricing_enabled: false,
      doubao_fast_enabled: false,
      kling_mode_std: 1.0, kling_mode_pro: 1.33, kling_mode_2k: 1.5, kling_mode_4k: 2.0,
      kling_sound_off: 1.0, kling_sound_on: 1.5,
      kling_video_ref_no: 1.0, kling_video_ref_yes: 1.5,
      kling_enable_mode: true, kling_enable_sound: true, kling_enable_video_ref: false,
      kling_use_price_table: false,
      vidu_offpeak_discount: 0.5,
      enable_cached_rate: false,
      enable_claude_cache_creation: false,
      enable_claude_cache_read: false,
      provider_id: null,
      type_id: null,
      supported_models: [],
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
    } catch (e) { }

    setEditingItem(item);
    setBillingType(item.billing_type);
    // 可灵精确查表回显
    if (item.billing_rule === 'kling_video') {
      setKlingPriceTable(ext.price_table || {});
      setKlingDisabledKeys(Array.isArray(ext.price_table_disabled) ? ext.price_table_disabled : []);
    } else {
      setKlingPriceTable({});
      setKlingDisabledKeys([]);
    }
    // Vidu 视频/图片精确查表回显
    if (item.billing_rule === 'vidu_video') {
      setViduVideoPriceTable(ext.price_table || {});
      setViduVideoDisabledKeys(Array.isArray(ext.price_table_disabled) ? ext.price_table_disabled : []);
    } else {
      setViduVideoPriceTable({});
      setViduVideoDisabledKeys([]);
    }
    if (item.billing_rule === 'vidu_image') {
      setViduImagePriceTable(ext.price_table || {});
      setViduImageDisabledKeys(Array.isArray(ext.price_table_disabled) ? ext.price_table_disabled : []);
    } else {
      setViduImagePriceTable({});
      setViduImageDisabledKeys([]);
    }
    form.setFieldsValue({
      ...item,
      pricing_tiers: tiers,
      sd2_480p_video: ext.resolution_rates?.['480p']?.with_video || 0,
      sd2_480p_base: ext.resolution_rates?.['480p']?.without_video || 0,
      sd2_720p_video: ext.resolution_rates?.['720p']?.with_video || 0,
      sd2_720p_base: ext.resolution_rates?.['720p']?.without_video || 0,
      sd2_1080p_video: ext.resolution_rates?.['1080p']?.with_video || 0,
      sd2_1080p_base: ext.resolution_rates?.['1080p']?.without_video || 0,
      sd2_480p_enabled: !!ext.resolution_rates?.['480p'],
      sd2_720p_enabled: !!ext.resolution_rates?.['720p'],
      sd2_1080p_enabled: !!ext.resolution_rates?.['1080p'],
      volc_audio_rate: ext.audio_rate || 0,
      volc_base_rate: ext.base_rate || 0,
      volc_offline_discount: ext.offline_discount ?? 0.5,
      s1_online_rate: ext.online_rate || 0,
      s1_offline_rate: ext.offline_rate || 0,
      image_prompt_rate: ext.image_prompt_rate || 0,
      prompt_extend_multiplier: ext.prompt_extend_multiplier || 1,
      image_ref_multiplier: ext.image_ref_multiplier ?? 1,
      quality_pricing_enabled: !!ext.quality_pricing_enabled,
      doubao_fast_enabled: !!ext.doubao_fast_enabled,
      kling_mode_std: ext.mode_multipliers?.std ?? 1.0,
      kling_mode_pro: ext.mode_multipliers?.pro ?? 1.33,
      kling_mode_4k: ext.mode_multipliers?.['4k'] ?? 2.0,
      kling_mode_2k: ext.mode_multipliers?.['2k'] ?? 1.5,
      kling_sound_off: ext.sound_multipliers?.off ?? 1.0,
      kling_sound_on: ext.sound_multipliers?.on ?? 1.5,
      kling_video_ref_no: ext.video_ref_multipliers?.no ?? 1.0,
      kling_video_ref_yes: ext.video_ref_multipliers?.yes ?? 1.5,
      kling_enable_mode: ext.enable_mode !== false,
      kling_enable_sound: ext.enable_sound !== false,
      kling_enable_video_ref: ext.enable_video_ref === true,
      kling_use_price_table: item.billing_rule === 'kling_video' && !!ext.price_table && Object.keys(ext.price_table).length > 0,
      vidu_offpeak_discount: ext.offpeak_discount ?? 0.5,
      enable_cached_rate: (item as any).cached_rate > 0,
      enable_claude_cache_creation: (item as any).claude_cache_creation_rate > 0,
      enable_claude_cache_read: (item as any).claude_cache_read_rate > 0,
      is_active: item.is_active === 1,
      provider_id: item.provider_id ?? null,
      type_id: item.type_id ?? null,
      supported_models: Array.isArray(ext.supported_models) ? ext.supported_models : [],
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
      if (values.billing_rule !== 'tiered' && values.billing_rule !== 'doubao_chat' && values.billing_rule !== 'image_resolution' && values.billing_rule !== 'image_size_pixel' && values.billing_rule !== 'video_resolution') {
        values.pricing_tiers = [];
      }

      // 只有特定多模态规则才打包 extended_config，其他保持空对象
      let extConfig: Record<string, any> = {};
      if (values.billing_rule === 'seedance2.0') {
        let resRates: any = {};
        if (values.sd2_480p_enabled) {
          resRates['480p'] = { with_video: values.sd2_480p_video || 0, without_video: values.sd2_480p_base || 0 };
        }
        if (values.sd2_720p_enabled) {
          resRates['720p'] = { with_video: values.sd2_720p_video || 0, without_video: values.sd2_720p_base || 0 };
        }
        if (values.sd2_1080p_enabled) {
          resRates['1080p'] = { with_video: values.sd2_1080p_video || 0, without_video: values.sd2_1080p_base || 0 };
        }
        extConfig = { resolution_rates: resRates };
      } else if (values.billing_rule === 'seedance1.5pro') {
        extConfig = {
          audio_rate: values.volc_audio_rate || 0,
          base_rate: values.volc_base_rate || 0,
          offline_discount: values.volc_offline_discount ?? 0.5,
        };
      } else if (values.billing_rule === 'seedance1.0') {
        extConfig = {
          online_rate: values.s1_online_rate || 0,
          offline_rate: values.s1_offline_rate || 0,
        };
      } else if (values.billing_rule === 'kling_video') {
        // 直接从 form store 读取（这些字段通过条件渲染挂载，onFinish values 中可能缺失）
        const enableMode = form.getFieldValue('kling_enable_mode') !== false;
        const enableSound = form.getFieldValue('kling_enable_sound') !== false;
        const enableVideoRef = form.getFieldValue('kling_enable_video_ref') === true;
        const usePriceTable = form.getFieldValue('kling_use_price_table');
        if (usePriceTable && Object.keys(klingPriceTable).length > 0) {
          // 精确查表模式——从 React state 读取
          extConfig = {
            price_table: klingPriceTable,
            price_table_disabled: klingDisabledKeys,
            enable_mode: enableMode,
            enable_sound: enableSound,
            enable_video_ref: enableVideoRef,
          };
        } else {
          // 倍率模式（兼容旧规则）
          extConfig = {
            mode_multipliers: { std: values.kling_mode_std ?? 1.0, pro: values.kling_mode_pro ?? 1.33, '2k': values.kling_mode_2k ?? 1.5, '4k': values.kling_mode_4k ?? 2.0 },
            sound_multipliers: { off: values.kling_sound_off ?? 1.0, on: values.kling_sound_on ?? 1.5 },
            video_ref_multipliers: { no: values.kling_video_ref_no ?? 1.0, yes: values.kling_video_ref_yes ?? 1.5 },
            enable_mode: enableMode,
            enable_sound: enableSound,
            enable_video_ref: enableVideoRef,
          };
        }
      } else if (values.billing_rule === 'vidu_video') {
        extConfig = {
          price_table: viduVideoPriceTable,
          price_table_disabled: viduVideoDisabledKeys,
          offpeak_discount: values.vidu_offpeak_discount ?? 0.5,
        };
      } else if (values.billing_rule === 'vidu_image') {
        extConfig = {
          price_table: viduImagePriceTable,
          price_table_disabled: viduImageDisabledKeys,
        };
      } else if (values.billing_rule === 'multimodal') {
        extConfig = {
          image_prompt_rate: values.image_prompt_rate || 0,
        };
        values.completion_rate = 0;
      }

      // 图像模型特有：提示词扩写倍率（per_image 全局生效，image_resolution 仅保留扩写倍率，有图倍率已下沉到每个阶梯行）
      if (values.billing_rule === 'per_image') {
        extConfig = { ...extConfig, prompt_extend_multiplier: values.prompt_extend_multiplier || 1, image_ref_multiplier: values.image_ref_multiplier ?? 1 };
      } else if (values.billing_rule === 'image_resolution') {
        extConfig = { ...extConfig, prompt_extend_multiplier: values.prompt_extend_multiplier || 1 };
      } else if (values.billing_rule === 'image_size_pixel') {
        const qpEnabled = form.getFieldValue('quality_pricing_enabled') === true;
        extConfig = {
          ...extConfig,
          prompt_extend_multiplier: values.prompt_extend_multiplier || 1,
          quality_pricing_enabled: qpEnabled,
        };
      } else if (values.billing_rule === 'doubao_chat') {
        const fastEnabled = form.getFieldValue('doubao_fast_enabled') === true;
        extConfig = { ...extConfig, doubao_fast_enabled: fastEnabled };
      }
      if (Array.isArray(values.supported_models) && values.supported_models.length > 0) {
        extConfig.supported_models = values.supported_models;
      }

      // 清除表单中不应提交的临时字段
      delete values.sd2_480p_video; delete values.sd2_480p_base; delete values.sd2_480p_enabled;
      delete values.sd2_720p_video; delete values.sd2_720p_base; delete values.sd2_720p_enabled;
      delete values.sd2_1080p_video; delete values.sd2_1080p_base; delete values.sd2_1080p_enabled;
      delete values.volc_audio_rate; delete values.volc_base_rate; delete values.volc_offline_discount;
      delete values.s1_online_rate; delete values.s1_offline_rate;
      delete values.image_prompt_rate;
      delete values.prompt_extend_multiplier;
      delete values.image_ref_multiplier;
      delete values.kling_mode_std; delete values.kling_mode_pro; delete values.kling_mode_2k; delete values.kling_mode_4k;
      delete values.kling_sound_off; delete values.kling_sound_on;
      delete values.kling_video_ref_no; delete values.kling_video_ref_yes;
      delete values.supported_models;
      delete values.kling_enable_mode; delete values.kling_enable_sound; delete values.kling_enable_video_ref;
      delete values.kling_use_price_table;
      delete values.quality_pricing_enabled;
      delete values.doubao_fast_enabled;
      delete values.vidu_offpeak_discount;
      // 开关关闭时清零对应费率，防止旧值残留
      if (!values.enable_cached_rate) values.cached_rate = 0;
      if (!values.enable_claude_cache_creation) values.claude_cache_creation_rate = 0;
      if (!values.enable_claude_cache_read) values.claude_cache_read_rate = 0;
      delete values.enable_cached_rate;
      delete values.enable_claude_cache_creation;
      delete values.enable_claude_cache_read;

      const payload = {
        prompt_rate: 0,
        completion_rate: 0,
        fixed_rate: 0,
        duration_rate: 0,
        ...values,
        provider_id: values.provider_id || null,
        type_id: values.type_id || null,
        cached_rate: values.cached_rate || 0,
        claude_cache_creation_rate: values.claude_cache_creation_rate || 0,
        claude_cache_read_rate: values.claude_cache_read_rate || 0,
        pricing_tiers: values.pricing_tiers?.map((tier: any) => {
          const t = { ...tier, cached_rate: tier.cached_rate || 0 };
          // 画质开关统一同步到每行（后端根据此字段选取费率）
          if (values.billing_rule === 'image_size_pixel') {
            const qp = form.getFieldValue('quality_pricing_enabled') === true;
            t.quality_pricing = qp;
          }
          // 低延迟开关关闭时清零 fast_* 字段，防止未渲染的表单子项旧值残留
          if (values.billing_rule === 'doubao_chat' && !form.getFieldValue('doubao_fast_enabled')) {
            t.fast_prompt_rate = 0; t.fast_completion_rate = 0; t.fast_cached_rate = 0;
            t.fast_audio_prompt_rate = 0; t.fast_audio_cached_rate = 0;
          }
          return t;
        }) || [],
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
      title: '计费 (PID)',
      dataIndex: 'pid',
      key: 'pid',
      width: 120,
      render: (text: string) => <Tag color="blue">{text || '-'}</Tag>
    },
    {
      title: '计费策略集命名',
      dataIndex: 'name',
      key: 'name',
      width: 200,
      render: (text: string) => <Text strong>{text}</Text>
    },
    {
      title: '服务商 / 分类 / 计费',
      key: 'attributes',
      width: 250,
      render: (_: any, record: BillingRuleData) => {
        const p = allProviders.find(x => x.id === record.provider_id);
        const tObj = allTypes.find(x => x.id === record.type_id);
        const colors: Record<string, string> = { tokens: 'cyan', requests: 'orange', duration: 'purple' };
        return (
          <Space size={[4, 4]} wrap>
            {p && <Tag color="default" style={{ margin: 0 }}>{p.name}</Tag>}
            {tObj && <Tag color="processing" style={{ margin: 0 }}>{tObj.name}</Tag>}
            <Tag color={record.pricing_type === 'official' ? 'orange' : 'green'} style={{ margin: 0 }}>{record.pricing_type === 'official' ? '官方计价' : '自定义计价'}</Tag>
            <Tag color={colors[record.billing_type]} style={{ margin: 0 }}>{t(`models.type_${record.billing_type}`)}</Tag>
          </Space>
        );
      }
    },
    {
      title: t('models.rates'),
      key: 'rates',
      render: (_: any, record: BillingRuleData) => {
        return <RateDisplay rule={record} currencySymbol={currencySymbol} formatPrice={formatPrice} />;
      }
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
      title: '排序',
      dataIndex: 'sort_order',
      key: 'sort_order',
      width: 100,
      sorter: (a: BillingRuleData, b: BillingRuleData) => (a.sort_order || 0) - (b.sort_order || 0),
      render: (sort_order: number) => <Text type="secondary" style={{ fontSize: 13 }}>{sort_order || 0}</Text>,
    },
    {
      title: '最后修改时间',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 150,
      render: (text: string) => <Text type="secondary" style={{ fontSize: 12 }}>{text ? dayjs(text).format('YYYY-MM-DD HH:mm:ss') : '-'}</Text>,
    },
    {
      title: t('common.actions'),
      key: 'actions',
      render: (_: any, record: BillingRuleData) => (
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

  const filteredItems = items.filter(item => {
    if (filterType !== 'all' && item.billing_type !== filterType) return false;
    if (filterPricingType !== 'all' && (item.pricing_type || 'custom') !== filterPricingType) return false;
    if (searchText) {
      const lower = searchText.toLowerCase();
      if (!item.name?.toLowerCase().includes(lower) && !String(item.pid || '').toLowerCase().includes(lower)) {
        return false;
      }
    }
    if (filterProvider && item.provider_id !== filterProvider) return false;
    if (filterTypeSelect && item.type_id !== filterTypeSelect) return false;
    return true;
  });

  return (
    <>
      {!isModalVisible && (
        <Card variant="borderless">
          <div style={{ display: 'flex', flexDirection: screens.xs ? 'column' : 'row', justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
            <Typography.Title level={screens.xs ? 4 : 2} style={{ margin: 0 }}>
              计费规则管理
            </Typography.Title>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
              {screens.xs ? '新建' : '新建计费策略类'}
            </Button>
          </div>
          <div style={{ marginBottom: 20, display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
            <Space wrap>
              <Text strong>筛选计费类型：</Text>
              <Radio.Group
                value={filterType}
                onChange={e => setFilterType(e.target.value)}
                optionType="button"
                buttonStyle="solid"
              >
                <Radio value="all">全部</Radio>
                <Radio value="tokens">{t('models.type_tokens')}</Radio>
                <Radio value="requests">{t('models.type_requests')}</Radio>
                <Radio value="duration">{t('models.type_duration')}</Radio>
              </Radio.Group>
            </Space>
            <Space wrap>
              <Text strong>定价类型：</Text>
              <Radio.Group
                value={filterPricingType}
                onChange={e => setFilterPricingType(e.target.value)}
                optionType="button"
                buttonStyle="solid"
              >
                <Radio value="all">全部</Radio>
                <Radio value="custom">自定义计价</Radio>
                <Radio value="official">官方计价</Radio>
              </Radio.Group>
            </Space>
            <Input.Search
              placeholder="搜索名称或PID"
              allowClear
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              style={{ width: 200 }}
            />
            {auxiliaryCurrencies.length > 0 && (
              <Select
                value={selectedCurrencyCode}
                onChange={setSelectedCurrencyCode}
                style={{ width: 140 }}
                options={[
                  { value: '', label: `默认货币 (${currencySymbol})` },
                  ...auxiliaryCurrencies.map(c => ({ value: c.code, label: `${c.code} (${c.symbol})` }))
                ]}
              />
            )}
          </div>

          <ClassificationFilter
            providers={allProviders.map(p => ({
              ...p,
              count: items.filter(i => i.provider_id != null && Number(i.provider_id) === Number(p.id)).length
            }))}
            types={allTypes.map(t => ({
              ...t,
              count: items.filter(i => i.type_id != null && Number(i.type_id) === Number(t.id)).length
            }))}
            selectedProvider={filterProvider}
            selectedType={filterTypeSelect}
            onProviderChange={setFilterProvider}
            onTypeChange={setFilterTypeSelect}
          />

          {screens.xs ? (
            <MobileCardList
              dataSource={filteredItems}
              loading={loading}
              rowKey="id"
              pagination={{ pageSize: 15 }}
              renderCard={(record: any) => {
                const colors: Record<string, string> = { tokens: 'cyan', requests: 'orange', duration: 'purple' };
                return (
                  <MobileCard
                    title={<Text strong>{record.name}</Text>}
                    extra={<Switch checked={record.is_active === 1} disabled size="small" />}
                  >
                    <CardRow label="计费 (PID)"><Tag color="blue">{record.pid || '-'}</Tag></CardRow>
                    <CardRow label="计费类型"><Tag color={colors[record.billing_type]}>{t(`models.type_${record.billing_type}`)}</Tag></CardRow>
                    <CardRow label="费率"><RateDisplay rule={record} currencySymbol={currencySymbol} formatPrice={formatPrice} /></CardRow>
                    <CardRow label="排序"><Text type="secondary" style={{ fontSize: 13 }}>{record.sort_order || 0}</Text></CardRow>
                    <CardRow label="最后修改"><Text type="secondary" style={{ fontSize: 12 }}>{record.updated_at ? dayjs(record.updated_at).format('YYYY-MM-DD HH:mm:ss') : '-'}</Text></CardRow>
                    <CardActions>
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
      )}

      {isModalVisible && (
        <Card
          title={editingItem ? '编辑计费基础组' : '生成新的计费规则'}
          extra={
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button onClick={() => setIsModalVisible(false)}>取消</Button>
              <Button type="primary" onClick={() => form.submit()}>保存</Button>
            </div>
          }
        >
          <div style={{ maxWidth: 1400, margin: '0 auto' }}>
            <Form form={form} layout="vertical" onFinish={handleSave}>
              <Row gutter={16}>
                <Col xs={24} sm={18}>
                  <Form.Item name="name" label="大模型计费模版名称" rules={[{ required: true }]}>
                    <Input placeholder="输入该组计费的明显记号，方便添加模型时直接下拉应用。" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={6}>
                  <Form.Item name="sort_order" label="排序" tooltip="数字越大越靠前，默认 0">
                    <InputNumber min={0} style={{ width: '100%' }} placeholder="排序" />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item name="supported_models" label={<Text type="secondary">支持模型ID (非必填，仅作提示)</Text>} tooltip="可输入多个模型 ID，按回车确认，用于提示哪些模型可以使用此计费规则">
                <Select mode="tags" open={false} placeholder="输入支持的模型 ID，按回车确认，例如: gpt-4, claude-3-opus" style={{ width: '100%' }} />
              </Form.Item>

              <Row gutter={24}>
                <Col span={12}>
                  <Form.Item name="provider_id" label={<Text type="secondary">所属服务商 (选填，仅作筛选用)</Text>} style={{ marginBottom: 16 }}>
                    <Radio.Group size="small" optionType="button" buttonStyle="solid" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 8px' }}>
                      <Radio value={null}>无 (不绑定)</Radio>
                      {allProviders.map(p => (
                        <Radio key={p.id} value={p.id}>{p.name}</Radio>
                      ))}
                    </Radio.Group>
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="type_id" label={<Text type="secondary">模型分类 (选填，仅作筛选用)</Text>} style={{ marginBottom: 16 }}>
                    <Radio.Group size="small" optionType="button" buttonStyle="solid" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 8px' }}>
                      <Radio value={null}>无 (不绑定)</Radio>
                      {allTypes.map(t => (
                        <Radio key={t.id} value={t.id}>{t.name}</Radio>
                      ))}
                    </Radio.Group>
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={24}>
                <Col span={12}>
                  <Form.Item name="pricing_type" label={<Text type="secondary">定价类型</Text>} style={{ marginBottom: 16 }}>
                    <Radio.Group size="small" optionType="button" buttonStyle="solid" style={{ display: 'flex', gap: 8 }}>
                      <Radio value="custom">自定义计价</Radio>
                      <Radio value="official">官方计价</Radio>
                    </Radio.Group>
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="billing_type" label={<Text type="secondary">{t('models.billing_type')}</Text>} rules={[{ required: true }]} style={{ marginBottom: 16 }}>
                    <Radio.Group size="small" optionType="button" buttonStyle="solid" style={{ display: 'flex', gap: 8 }} onChange={(e) => {
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
                </Col>
              </Row>

              {billingType === 'tokens' && (
                <>
                  <Form.Item name="billing_rule" label={t('models.billing_rule')} initialValue="standard">
                    <Radio.Group optionType="button" buttonStyle="solid">
                      <Radio value="standard">{t('models.rule_standard')}</Radio>
                      <Radio value="multimodal">{t('models.rule_multimodal')}</Radio>
                      <Radio value="tiered">{t('models.rule_tiered')}</Radio>
                      <Radio value="doubao_chat">豆包聊天阶梯</Radio>
                      <Radio value="seedance2.0">Seedance 2.0</Radio>
                      <Radio value="seedance1.5pro">Seedance 1.5 Pro</Radio>
                      <Radio value="seedance1.0">Seedance 1.0</Radio>
                    </Radio.Group>
                  </Form.Item>

                  <Form.Item noStyle shouldUpdate={(prev, curr) => prev.billing_rule !== curr.billing_rule}>
                    {({ getFieldValue }) => {
                      const rule = getFieldValue('billing_rule');
                      const unitLabel = t('models.prompt_rate');
                      const unitLabelComp = t('models.completion_rate');

                      if (rule === 'multimodal') {
                        return (
                          <>
                            <Row gutter={16}>
                              <Col span={12}>
                                <Form.Item name="prompt_rate" label={t('models.text_input_rate')} rules={[{ required: true }]}>
                                  <InputNumber style={{ width: '100%' }} precision={6} addonAfter="/ 1M" />
                                </Form.Item>
                              </Col>
                              <Col span={12}>
                                <Form.Item name="image_prompt_rate" label={t('models.image_input_rate')} rules={[{ required: true }]}>
                                  <InputNumber style={{ width: '100%' }} precision={6} addonAfter="/ 1M" />
                                </Form.Item>
                              </Col>
                            </Row>
                          </>
                        );
                      }

                      if (rule === 'standard') {
                        return (
                          <>
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

                            <Form.Item noStyle dependencies={['enable_cached_rate']}>
                              {({ getFieldValue: gfv }) => {
                                const enabled = gfv('enable_cached_rate');
                                return (
                                  <div style={{ padding: '12px 16px', background: _isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)', borderRadius: 8, marginBottom: 16 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: enabled ? 12 : 0 }}>
                                      <Text style={{ fontSize: 13 }}>缓存命中费率（OpenAI/Gemini 等通用缓存读取）</Text>
                                      <Form.Item name="enable_cached_rate" valuePropName="checked" style={{ margin: 0 }}>
                                        <Switch size="small" />
                                      </Form.Item>
                                    </div>
                                    {enabled && (
                                      <Row gutter={16}>
                                        <Col span={12}>
                                          <Form.Item name="cached_rate" style={{ marginBottom: 0 }}>
                                            <InputNumber style={{ width: '100%' }} precision={6} addonAfter="/ 1M" placeholder="缓存命中费率" />
                                          </Form.Item>
                                        </Col>
                                      </Row>
                                    )}
                                  </div>
                                );
                              }}
                            </Form.Item>

                            <Form.Item noStyle dependencies={['enable_claude_cache_creation']}>
                              {({ getFieldValue: gfv }) => {
                                const enabled = gfv('enable_claude_cache_creation');
                                return (
                                  <div style={{ padding: '12px 16px', background: _isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)', borderRadius: 8, marginBottom: 16 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: enabled ? 12 : 0 }}>
                                      <Text style={{ fontSize: 13 }}>Claude 缓存创建费率</Text>
                                      <Form.Item name="enable_claude_cache_creation" valuePropName="checked" style={{ margin: 0 }}>
                                        <Switch size="small" />
                                      </Form.Item>
                                    </div>
                                    {enabled && (
                                      <Row gutter={16}>
                                        <Col span={12}>
                                          <Form.Item name="claude_cache_creation_rate" style={{ marginBottom: 0 }}>
                                            <InputNumber style={{ width: '100%' }} precision={6} addonAfter="/ 1M" placeholder="Claude 缓存创建费率" />
                                          </Form.Item>
                                        </Col>
                                      </Row>
                                    )}
                                  </div>
                                );
                              }}
                            </Form.Item>

                            <Form.Item noStyle dependencies={['enable_claude_cache_read']}>
                              {({ getFieldValue: gfv }) => {
                                const enabled = gfv('enable_claude_cache_read');
                                return (
                                  <div style={{ padding: '12px 16px', background: _isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)', borderRadius: 8, marginBottom: 16 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: enabled ? 12 : 0 }}>
                                      <Text style={{ fontSize: 13 }}>Claude 缓存读取费率</Text>
                                      <Form.Item name="enable_claude_cache_read" valuePropName="checked" style={{ margin: 0 }}>
                                        <Switch size="small" />
                                      </Form.Item>
                                    </div>
                                    {enabled && (
                                      <Row gutter={16}>
                                        <Col span={12}>
                                          <Form.Item name="claude_cache_read_rate" style={{ marginBottom: 0 }}>
                                            <InputNumber style={{ width: '100%' }} precision={6} addonAfter="/ 1M" placeholder="Claude 缓存读取费率" />
                                          </Form.Item>
                                        </Col>
                                      </Row>
                                    )}
                                  </div>
                                );
                              }}
                            </Form.Item>
                          </>
                        );
                      } else if (rule === 'seedance2.0') {
                        return (
                          <div style={{ background: _isLight ? '#fff' : '#141414', padding: '20px', borderRadius: '12px', marginBottom: 24, border: _isLight ? '1px solid #e8e8e8' : '1px solid #303030' }}>
                            <Text type="secondary" style={{ fontSize: '12px', display: 'block', marginBottom: 16 }}>
                              Seedance 2.0 — 指定具体支持的视频分辨率及是否包含视频输入的定价 (可分级管控)
                            </Text>
                            {['480p', '720p', '1080p'].map(r => (
                              <div key={r} style={{ marginBottom: 16, padding: '12px', background: _isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)', borderRadius: '8px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                  <Text strong style={{ fontSize: '13px' }}>{r} 分辨率矩阵计费</Text>
                                  <Form.Item name={`sd2_${r}_enabled`} valuePropName="checked" style={{ margin: 0 }}>
                                    <Switch size="small" />
                                  </Form.Item>
                                </div>
                                <Form.Item noStyle dependencies={[`sd2_${r}_enabled`]}>
                                  {({ getFieldValue }) => getFieldValue(`sd2_${r}_enabled`) ? (
                                    <Row gutter={16} align="middle">
                                      <Col span={12}>
                                        <Form.Item name={`sd2_${r}_video`} label={<Text style={{ fontSize: '12px' }}>包含视频输入 (元/百万)</Text>} rules={[{ required: true, message: '' }]} style={{ marginBottom: 0 }}>
                                          <InputNumber style={{ width: '100%' }} precision={6} min={0} />
                                        </Form.Item>
                                      </Col>
                                      <Col span={12}>
                                        <Form.Item name={`sd2_${r}_base`} label={<Text style={{ fontSize: '12px' }}>不包含视频输入 (元/百万)</Text>} rules={[{ required: true, message: '' }]} style={{ marginBottom: 0 }}>
                                          <InputNumber style={{ width: '100%' }} precision={6} min={0} />
                                        </Form.Item>
                                      </Col>
                                    </Row>
                                  ) : (
                                    <Text type="secondary" style={{ fontSize: '12px' }}>{r} 被关闭，将不响应此分辨率独立的按需定价。</Text>
                                  )}
                                </Form.Item>
                              </div>
                            ))}
                          </div>
                        );
                      } else if (rule === 'seedance1.5pro') {
                        return (
                          <div style={{ background: _isLight ? '#fff' : '#141414', padding: '16px', borderRadius: '12px', marginBottom: 24, border: _isLight ? '1px solid #e8e8e8' : '1px solid #303030' }}>
                            <Text type="secondary" style={{ fontSize: '12px', display: 'block', marginBottom: 16 }}>
                              如需支持离线推理(flex)降价，请在此配置乘以的折扣倍率
                            </Text>
                            <Row gutter={16} align="middle">
                              <Col span={8}><Form.Item name="volc_audio_rate" label="包含语音" rules={[{ required: true }]} style={{ marginBottom: 0 }}><InputNumber style={{ width: '100%' }} precision={6} addonAfter="/ 1M" /></Form.Item></Col>
                              <Col span={8}><Form.Item name="volc_base_rate" label="不包含语音" rules={[{ required: true }]} style={{ marginBottom: 0 }}><InputNumber style={{ width: '100%' }} precision={6} addonAfter="/ 1M" /></Form.Item></Col>
                              <Col span={8}><Form.Item name="volc_offline_discount" label="离线推理(flex)折扣倍率" tooltip="例如 0.5 即等于最终价格减半" rules={[{ required: true }]} style={{ marginBottom: 0 }}><InputNumber style={{ width: '100%' }} precision={2} step={0.1} /></Form.Item></Col>
                            </Row>
                          </div>
                        );
                      } else if (rule === 'seedance1.0') {
                        return (
                          <div style={{ background: _isLight ? '#fff' : '#141414', padding: '16px', borderRadius: '12px', marginBottom: 24, border: _isLight ? '1px solid #e8e8e8' : '1px solid #303030' }}>
                            <Text type="secondary" style={{ fontSize: '12px', display: 'block', marginBottom: 16 }}>
                              Seedance 1.0 — 支持在线与离线的双轨计费
                            </Text>
                            <Row gutter={16} align="middle">
                              <Col span={12}><Form.Item name="s1_online_rate" label="在线推理定价" rules={[{ required: true }]} style={{ marginBottom: 0 }}><InputNumber style={{ width: '100%' }} precision={6} addonAfter="/ 1M" /></Form.Item></Col>
                              <Col span={12}><Form.Item name="s1_offline_rate" label="离线推理(flex)定价" rules={[{ required: true }]} style={{ marginBottom: 0 }}><InputNumber style={{ width: '100%' }} precision={6} addonAfter="/ 1M" /></Form.Item></Col>
                            </Row>
                          </div>
                        );
                      } else if (rule === 'tiered') {
                        return (
                          <div style={{
                            background: _isLight ? '#fff' : '#141414',
                            padding: '20px',
                            borderRadius: '12px',
                            marginBottom: '24px',
                            border: _isLight ? '1px solid #e8e8e8' : '1px solid #303030'
                          }}>
                            <div style={{ marginBottom: 16 }}>
                              <Title level={5} style={{ marginBottom: 6, fontSize: '14px', color: _isLight ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.85)' }}>{t('models.pricing_tiers')}</Title>
                              <Text type="secondary" style={{ fontSize: '12px' }}>
                                界定说明：输入上限与输出上限填写的数值单位是以"千(K)"为步长判定的。例如输入 128 即表示 ≤128K Token 命中此阶梯；输出上限不填则表示不限制输出。缓存费率用于对命中输入缓存的 Token 独立定价（属于输入的子集），未填写则缓存按输入费率计。命中落区后，最终费用将结合配置的费率采用 1M (一百万) 定标结算。
                              </Text>
                            </div>
                            <Form.List name="pricing_tiers" initialValue={[]}>
                              {(fields, { add, remove }) => (
                                <>
                                  {fields.map(({ key, name, ...restField }) => (
                                    <Row key={key} gutter={12} align="middle" style={{ marginBottom: 12 }}>
                                      <Col span={7}>
                                        <Space.Compact style={{ width: '100%' }}>
                                          <Form.Item {...restField} name={[name, 'max_prompt_tokens']} rules={[{ required: true, message: '' }]} noStyle>
                                            <InputNumber placeholder="输入上限(如:128)" style={{ width: '50%' }} />
                                          </Form.Item>
                                          <Form.Item {...restField} name={[name, 'max_completion_tokens']} noStyle>
                                            <InputNumber placeholder="输出上限(如:16)" style={{ width: '50%' }} />
                                          </Form.Item>
                                        </Space.Compact>
                                      </Col>
                                      <Col span={5}>
                                        <Form.Item {...restField} name={[name, 'prompt_rate']} rules={[{ required: true }]} noStyle>
                                          <InputNumber placeholder={t('models.input_rate')} style={{ width: '100%' }} precision={6} />
                                        </Form.Item>
                                      </Col>
                                      <Col span={5}>
                                        <Form.Item {...restField} name={[name, 'completion_rate']} rules={[{ required: true }]} noStyle>
                                          <InputNumber placeholder={t('models.output_rate')} style={{ width: '100%' }} precision={6} />
                                        </Form.Item>
                                      </Col>
                                      <Col span={5}>
                                        <Form.Item {...restField} name={[name, 'cached_rate']} noStyle>
                                          <InputNumber placeholder="缓存费率(选填)" style={{ width: '100%' }} precision={6} />
                                        </Form.Item>
                                      </Col>
                                      <Col span={2} style={{ textAlign: 'right' }}>
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
                      } else if (rule === 'doubao_chat') {
                        return (
                          <Form.Item noStyle dependencies={['doubao_fast_enabled']}>
                            {({ getFieldValue: gfv }) => {
                              const fastEnabled = gfv('doubao_fast_enabled');
                              return (
                                <div style={{
                                  background: _isLight ? '#fff' : '#141414',
                                  padding: '20px',
                                  borderRadius: '12px',
                                  marginBottom: '24px',
                                  border: _isLight ? '1px solid #e8e8e8' : '1px solid #303030'
                                }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                                    <Title level={5} style={{ margin: 0, fontSize: '14px', color: _isLight ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.85)' }}>豆包聊天阶梯计费</Title>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                      <Text style={{ fontSize: 12 }}>低延迟</Text>
                                      <Form.Item name="doubao_fast_enabled" valuePropName="checked" style={{ margin: 0 }}>
                                        <Switch size="small" />
                                      </Form.Item>
                                    </div>
                                  </div>
                                  <Text type="secondary" style={{ fontSize: '12px', display: 'block', marginBottom: 16, lineHeight: '1.5' }}>
                                    对齐官方计费公式：费用 = 输入(非音频)×费率 + 输入(音频)×费率 + 缓存(非音频)×费率 + 缓存(音频)×费率 + 输出×费率。输入/输出上限单位千(K)，费率单位 /1M Tokens。{fastEnabled ? '开启低延迟后，service_tier=fast 的请求将使用低延迟费率组计费，未设置的低延迟费率自动降级为常规费率。' : ''}
                                  </Text>
                                  <Form.List name="pricing_tiers" initialValue={[]}>
                                    {(fields, { add, remove }) => (
                                      <>
                                        {/* 表头 */}
                                        <Row gutter={8} style={{ marginBottom: 6, opacity: 0.6, fontSize: 11, paddingLeft: fastEnabled ? '45px' : 0 }}>
                                          <Col span={4}>上下文区间</Col>
                                          <Col span={4}>输入(非音频)</Col>
                                          <Col span={3}>输出</Col>
                                          <Col span={4}>缓存(非音频)</Col>
                                          <Col span={4}>输入(音频)</Col>
                                          <Col span={4}>缓存(音频)</Col>
                                          <Col span={1}></Col>
                                        </Row>
                                        {fields.map(({ key, name, ...restField }) => (
                                          <Row key={key} gutter={8} align="middle" style={{
                                            position: 'relative',
                                            paddingLeft: fastEnabled ? '45px' : 0,
                                            marginBottom: fastEnabled ? 16 : 10,
                                            paddingTop: fastEnabled ? '10px' : '4px',
                                            paddingBottom: fastEnabled ? '10px' : '4px',
                                            borderBottom: fastEnabled ? (_isLight ? '1px dashed #e8e8e8' : '1px dashed #303030') : 'none'
                                          }}>
                                            {fastEnabled && (
                                              <div style={{ position: 'absolute', left: 0, top: '10px', display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0 }}>
                                                <div style={{ height: '32px', display: 'flex', alignItems: 'center' }}>
                                                  <Tag color="success" style={{ margin: 0, fontSize: '10px', padding: '0 4px', lineHeight: '18px' }}>常规</Tag>
                                                </div>
                                                <div style={{ height: '32px', display: 'flex', alignItems: 'center' }}>
                                                  <Tag color="warning" style={{ margin: 0, fontSize: '10px', padding: '0 4px', lineHeight: '18px' }}>低延迟</Tag>
                                                </div>
                                              </div>
                                            )}
                                            {/* 第一列：上下文区间（两个输入框） */}
                                            <Col span={4}>
                                              <Space.Compact style={{ width: '100%' }}>
                                                <Form.Item {...restField} name={[name, 'max_prompt_tokens']} rules={[{ required: true, message: '' }]} noStyle>
                                                  <InputNumber placeholder="输入(K)" style={{ width: '50%' }} />
                                                </Form.Item>
                                                <Form.Item {...restField} name={[name, 'max_completion_tokens']} noStyle>
                                                  <InputNumber placeholder="输出(K)" style={{ width: '50%' }} />
                                                </Form.Item>
                                              </Space.Compact>
                                            </Col>
                                            {/* 第二列：输入(非音频)费率 */}
                                            <Col span={4}>
                                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                <Form.Item {...restField} name={[name, 'prompt_rate']} rules={[{ required: true }]} noStyle>
                                                  <InputNumber placeholder="常规·非音频" style={{ width: '100%' }} precision={6} />
                                                </Form.Item>
                                                {fastEnabled && (
                                                  <Form.Item {...restField} name={[name, 'fast_prompt_rate']} noStyle>
                                                    <InputNumber placeholder="低延迟·非音频" style={{ width: '100%', borderColor: _isLight ? '#ffe7ba' : '#874d00' }} precision={6} />
                                                  </Form.Item>
                                                )}
                                              </div>
                                            </Col>
                                            {/* 第三列：输出费率 */}
                                            <Col span={3}>
                                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                <Form.Item {...restField} name={[name, 'completion_rate']} rules={[{ required: true }]} noStyle>
                                                  <InputNumber placeholder="常规·输出" style={{ width: '100%' }} precision={6} />
                                                </Form.Item>
                                                {fastEnabled && (
                                                  <Form.Item {...restField} name={[name, 'fast_completion_rate']} noStyle>
                                                    <InputNumber placeholder="低延迟·输出" style={{ width: '100%', borderColor: _isLight ? '#ffe7ba' : '#874d00' }} precision={6} />
                                                  </Form.Item>
                                                )}
                                              </div>
                                            </Col>
                                            {/* 第四列：缓存(非音频)费率 */}
                                            <Col span={4}>
                                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                <Form.Item {...restField} name={[name, 'cached_rate']} noStyle>
                                                  <InputNumber placeholder="常规·缓存" style={{ width: '100%' }} precision={6} />
                                                </Form.Item>
                                                {fastEnabled && (
                                                  <Form.Item {...restField} name={[name, 'fast_cached_rate']} noStyle>
                                                    <InputNumber placeholder="低延迟·缓存" style={{ width: '100%', borderColor: _isLight ? '#ffe7ba' : '#874d00' }} precision={6} />
                                                  </Form.Item>
                                                )}
                                              </div>
                                            </Col>
                                            {/* 第五列：输入(音频)费率 */}
                                            <Col span={4}>
                                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                <Form.Item {...restField} name={[name, 'audio_prompt_rate']} noStyle>
                                                  <InputNumber placeholder="常规·音频" style={{ width: '100%' }} precision={6} />
                                                </Form.Item>
                                                {fastEnabled && (
                                                  <Form.Item {...restField} name={[name, 'fast_audio_prompt_rate']} noStyle>
                                                    <InputNumber placeholder="低延迟·音频" style={{ width: '100%', borderColor: _isLight ? '#ffe7ba' : '#874d00' }} precision={6} />
                                                  </Form.Item>
                                                )}
                                              </div>
                                            </Col>
                                            {/* 第六列：缓存(音频)费率 */}
                                            <Col span={4}>
                                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                <Form.Item {...restField} name={[name, 'audio_cached_rate']} noStyle>
                                                  <InputNumber placeholder="常规·音频缓存" style={{ width: '100%' }} precision={6} />
                                                </Form.Item>
                                                {fastEnabled && (
                                                  <Form.Item {...restField} name={[name, 'fast_audio_cached_rate']} noStyle>
                                                    <InputNumber placeholder="低延迟·音频缓存" style={{ width: '100%', borderColor: _isLight ? '#ffe7ba' : '#874d00' }} precision={6} />
                                                  </Form.Item>
                                                )}
                                              </div>
                                            </Col>
                                            {/* 第七列：操作区（删除按钮） */}
                                            <Col span={1} style={{ textAlign: 'right' }}>
                                              <Button type="text" danger icon={<DeleteTwoTone />} onClick={() => remove(name)} size="small" />
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
                                          添加一条豆包聊天阶梯
                                        </Button>
                                      </>
                                    )}
                                  </Form.List>
                                </div>
                              );
                            }}
                          </Form.Item>
                        );
                      } else {
                        return null;
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
                      <Radio value="image_resolution">按分辨率K</Radio>
                      <Radio value="image_size_pixel">按分辨率像素</Radio>
                      <Radio value="vidu_image">Vidu 图片</Radio>
                      <Radio value="characters">按字符计费 (语音合成)</Radio>
                    </Radio.Group>
                  </Form.Item>

                  <Form.Item noStyle shouldUpdate={(prev, curr) => prev.billing_rule !== curr.billing_rule}>
                    {({ getFieldValue }) => {
                      const rule = getFieldValue('billing_rule');

                      if (rule === 'image_resolution') {
                        return (
                          <div style={{
                            background: _isLight ? '#fff' : '#141414', padding: '20px', borderRadius: '12px', marginBottom: '24px', border: _isLight ? '1px solid #e8e8e8' : '1px solid #303030'
                          }}>
                            <Title level={5} style={{ marginBottom: 6, fontSize: '14px', color: _isLight ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.85)' }}>图片分辨率K计费配置</Title>
                            <Text type="secondary" style={{ fontSize: '12px', display: 'block', marginBottom: 16, lineHeight: '1.5' }}>
                              匹配说明：此模式按图片模型的 resolution 参数匹配分辨率等级（如 1k、2k、4k）。系统自动忽略大小写（1K 和 1k 等效）。配置的匹配名称推荐统一写标准小写形式（如 1k、2k、4k）。若请求的分辨率未命中任何档位，将按最高价计费。
                            </Text>
                            <Form.List name="pricing_tiers" initialValue={[]}>
                              {(fields, { add, remove }) => (
                                <>
                                  <Row gutter={12} style={{ marginBottom: 8, opacity: 0.5, fontSize: 12 }}>
                                    <Col span={7}>分辨率</Col>
                                    <Col span={6}>单张费率</Col>
                                    <Col span={5}>有图倍率 (图生图)</Col>
                                    <Col span={4}>状态</Col>
                                  </Row>
                                  {fields.map(({ key, name, ...restField }) => (
                                    <Row key={key} gutter={12} align="middle" style={{ marginBottom: 12 }}>
                                      <Col span={7}>
                                        <Form.Item {...restField} name={[name, 'resolution']} rules={[{ required: true }]} noStyle>
                                          <Input placeholder="分辨率等级 (如: 1k)" style={{ width: '100%' }} />
                                        </Form.Item>
                                      </Col>
                                      <Col span={6}>
                                        <Form.Item {...restField} name={[name, 'rate']} rules={[{ required: true }]} noStyle>
                                          <InputNumber placeholder="单张费率" style={{ width: '100%' }} precision={6} addonAfter="/张" />
                                        </Form.Item>
                                      </Col>
                                      <Col span={5}>
                                        <Form.Item {...restField} name={[name, 'image_ref_multiplier']} noStyle>
                                          <InputNumber placeholder="有图倍率" style={{ width: '100%' }} precision={2} step={0.1} min={0} addonAfter="x" />
                                        </Form.Item>
                                      </Col>
                                      <Col span={4}>
                                        <Form.Item {...restField} name={[name, 'enabled']} valuePropName="checked" style={{ marginBottom: 0 }}>
                                          <Switch size="small" />
                                        </Form.Item>
                                      </Col>
                                      <Col span={2} style={{ textAlign: 'right' }}>
                                        <Button type="text" danger icon={<DeleteTwoTone />} onClick={() => remove(name)} />
                                      </Col>
                                    </Row>
                                  ))}
                                  <Button
                                    type="dashed"
                                    onClick={() => add({ resolution: '', rate: 0, enabled: true, image_ref_multiplier: 1.0 })}
                                    block
                                    icon={<PlusOutlined />}
                                    style={{ marginTop: 8, height: '40px' }}
                                  >
                                    增加一个分辨率价格档位
                                  </Button>
                                </>
                              )}
                            </Form.List>
                            {/* 提示词扩写倍率 */}
                            <div style={{ marginTop: 20, padding: '12px 16px', background: _isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
                              <Row gutter={16}>
                                <Col span={8}>
                                  <Form.Item name="prompt_extend_multiplier" label="提示词扩写倍率" tooltip="当请求开启 prompt_extend 时，分辨率阶梯单价将乘以该倍率 (默认 1.0)" style={{ marginBottom: 0 }}>
                                    <InputNumber style={{ width: '100%' }} precision={2} step={0.1} min={0} addonAfter="x" />
                                  </Form.Item>
                                </Col>
                              </Row>
                            </div>
                          </div>
                        );
                      } else if (rule === 'image_size_pixel') {
                        return (
                          <Form.Item noStyle dependencies={['quality_pricing_enabled']}>
                            {({ getFieldValue: gfv }) => {
                              const qpEnabled = gfv('quality_pricing_enabled');
                              return (
                                <div style={{
                                  background: _isLight ? '#fff' : '#141414', padding: '20px', borderRadius: '12px', marginBottom: '24px', border: _isLight ? '1px solid #e8e8e8' : '1px solid #303030'
                                }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                                    <Title level={5} style={{ margin: 0, fontSize: '14px', color: _isLight ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.85)' }}>图片分辨率像素计费配置</Title>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                      <Text style={{ fontSize: 12 }}>画质</Text>
                                      <Form.Item name="quality_pricing_enabled" valuePropName="checked" style={{ margin: 0 }}>
                                        <Switch size="small" />
                                      </Form.Item>
                                    </div>
                                  </div>
                                  <Text type="secondary" style={{ fontSize: '12px', display: 'block', marginBottom: 16, lineHeight: '1.5' }}>
                                    匹配说明：此模式按图片模型的 size 参数匹配像素分辨率（如 1024x1024、1536x1024）。系统自动将 *、×、X、: 统一替换为 x 匹配（如 2:3 等同 2x3）；K 等级（如 1k）自动映射为像素值（1024x1024）。若未命中任何档位，将按最高价计费。{qpEnabled ? '开启画质后，将按请求的 quality 参数（low/medium/high）匹配对应的画质费率，未传画质参数时默认按中画质计费。' : ''}
                                  </Text>
                                  <Form.List name="pricing_tiers" initialValue={[]}>
                                    {(fields, { add, remove }) => (
                                      <>
                                        {/* 表头：根据画质开关切换列布局 */}
                                        <Row gutter={12} style={{ marginBottom: 8, opacity: 0.5, fontSize: 12 }}>
                                          <Col span={qpEnabled ? 5 : 7}>像素分辨率</Col>
                                          {qpEnabled ? (
                                            <>
                                              <Col span={4}>低画质</Col>
                                              <Col span={4}>中画质</Col>
                                              <Col span={4}>高画质</Col>
                                            </>
                                          ) : (
                                            <Col span={6}>单张费率</Col>
                                          )}
                                          <Col span={qpEnabled ? 3 : 5}>有图倍率 (图生图)</Col>
                                          <Col span={2}>状态</Col>
                                        </Row>
                                        {fields.map(({ key, name, ...restField }) => (
                                          <Row key={key} gutter={12} align="middle" style={{ marginBottom: 12 }}>
                                            <Col span={qpEnabled ? 5 : 7}>
                                              <Form.Item {...restField} name={[name, 'size']} rules={[{ required: true }]} noStyle>
                                                <Input placeholder="如: 1024x1024" style={{ width: '100%' }} />
                                              </Form.Item>
                                            </Col>
                                            {qpEnabled ? (
                                              <>
                                                <Col span={4}>
                                                  <Form.Item {...restField} name={[name, 'rate_low']} rules={[{ required: true, message: '' }]} noStyle>
                                                    <InputNumber placeholder="低画质" style={{ width: '100%' }} precision={6} addonAfter="/张" />
                                                  </Form.Item>
                                                </Col>
                                                <Col span={4}>
                                                  <Form.Item {...restField} name={[name, 'rate_medium']} rules={[{ required: true, message: '' }]} noStyle>
                                                    <InputNumber placeholder="中画质" style={{ width: '100%' }} precision={6} addonAfter="/张" />
                                                  </Form.Item>
                                                </Col>
                                                <Col span={4}>
                                                  <Form.Item {...restField} name={[name, 'rate_high']} rules={[{ required: true, message: '' }]} noStyle>
                                                    <InputNumber placeholder="高画质" style={{ width: '100%' }} precision={6} addonAfter="/张" />
                                                  </Form.Item>
                                                </Col>
                                              </>
                                            ) : (
                                              <Col span={6}>
                                                <Form.Item {...restField} name={[name, 'rate']} rules={[{ required: true }]} noStyle>
                                                  <InputNumber placeholder="单张费率" style={{ width: '100%' }} precision={6} addonAfter="/张" />
                                                </Form.Item>
                                              </Col>
                                            )}
                                            <Col span={qpEnabled ? 3 : 5}>
                                              <Form.Item {...restField} name={[name, 'image_ref_multiplier']} noStyle>
                                                <InputNumber placeholder="有图倍率" style={{ width: '100%' }} precision={2} step={0.1} min={0} addonAfter="x" />
                                              </Form.Item>
                                            </Col>
                                            <Col span={2}>
                                              <Form.Item {...restField} name={[name, 'enabled']} valuePropName="checked" style={{ marginBottom: 0 }}>
                                                <Switch size="small" />
                                              </Form.Item>
                                            </Col>
                                            <Col span={2} style={{ textAlign: 'right' }}>
                                              <Button type="text" danger icon={<DeleteTwoTone />} onClick={() => remove(name)} />
                                            </Col>
                                          </Row>
                                        ))}
                                        <Button
                                          type="dashed"
                                          onClick={() => add(qpEnabled
                                            ? { size: '', rate: 0, rate_low: 0, rate_medium: 0, rate_high: 0, quality_pricing: true, enabled: true, image_ref_multiplier: 1.0 }
                                            : { size: '', rate: 0, enabled: true, image_ref_multiplier: 1.0 }
                                          )}
                                          block
                                          icon={<PlusOutlined />}
                                          style={{ marginTop: 8, height: '40px' }}
                                        >
                                          增加一个像素分辨率价格档位
                                        </Button>
                                      </>
                                    )}
                                  </Form.List>
                                  {/* 提示词扩写倍率 */}
                                  <div style={{ marginTop: 20, padding: '12px 16px', background: _isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
                                    <Row gutter={16}>
                                      <Col span={8}>
                                        <Form.Item name="prompt_extend_multiplier" label="提示词扩写倍率" tooltip="当请求开启 prompt_extend 时，分辨率阶梯单价将乘以该倍率 (默认 1.0)" style={{ marginBottom: 0 }}>
                                          <InputNumber style={{ width: '100%' }} precision={2} step={0.1} min={0} addonAfter="x" />
                                        </Form.Item>
                                      </Col>
                                    </Row>
                                  </div>
                                </div>
                              );
                            }}
                          </Form.Item>
                        );
                      } else if (rule === 'vidu_image') {
                        // 腾讯云 Vidu 图片精确查表
                        const viduImgAttrs = ['text', 'img2img', 'ref_1_3', 'ref_4_7'];
                        const viduImgRes = ['1k', '2k', '4k'];
                        const viduImgAttrLabels: Record<string, string> = { text: '文生图', img2img: '图生图', ref_1_3: '参考生图 2~3张', ref_4_7: '参考生图 4~7张' };
                        return (
                          <div style={{ background: _isLight ? '#fff' : '#141414', padding: '20px', borderRadius: '12px', marginBottom: '24px', border: _isLight ? '1px solid #e8e8e8' : '1px solid #303030' }}>
                            <Title level={5} style={{ marginBottom: 6, fontSize: '14px', color: _isLight ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.85)' }}>Vidu 图片价格表</Title>
                            <Text type="secondary" style={{ fontSize: '12px', display: 'block', marginBottom: 16, lineHeight: '1.5' }}>
                              按 属性×分辨率 组合设置每张单价。属性由参考图数量自动判断：0张=文生图，1张=图生图，2~3张=参考生图(低)，4~7张=参考生图(高)。模型版本通过绑定不同计费规则区分。
                            </Text>
                            <div style={{ padding: '12px', background: _isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
                              <Text strong style={{ fontSize: '13px', display: 'block', marginBottom: 12 }}>精确价格表 (单价/张)</Text>
                              {viduImgAttrs.map(attr => viduImgRes.map(res => {
                                const key = `${attr}|${res}`;
                                const isDisabled = viduImageDisabledKeys.includes(key);
                                return (
                                  <Row key={key} gutter={12} align="middle" style={{ marginBottom: 8, opacity: isDisabled ? 0.45 : 1 }}>
                                    <Col span={9}>
                                      <Text style={{ fontSize: 13 }}>{viduImgAttrLabels[attr] || attr} / {res}</Text>
                                    </Col>
                                    <Col span={10}>
                                      <InputNumber style={{ width: '100%' }} precision={6} step={0.01} min={0} addonAfter="/张" disabled={isDisabled}
                                        value={viduImagePriceTable[key] ?? 0}
                                        onChange={(val) => setViduImagePriceTable(prev => ({ ...prev, [key]: val ?? 0 }))}
                                      />
                                    </Col>
                                    <Col span={5} style={{ textAlign: 'right' }}>
                                      <Switch size="small" checked={!isDisabled}
                                        onChange={(checked) => setViduImageDisabledKeys(prev => checked ? prev.filter(k => k !== key) : [...prev, key])}
                                      />
                                    </Col>
                                  </Row>
                                );
                              })).flat()}
                            </div>
                          </div>
                        );
                      } else {
                        return (
                          <Row gutter={16}>
                            <Col span={12}>
                              <Form.Item name="fixed_rate" label={t('models.fixed_rate')} rules={[{ required: true }]}>
                                <InputNumber style={{ width: '100%' }} precision={6} addonAfter={rule === 'per_image' ? "/ 张" : rule === 'characters' ? "/ 万字符" : "/ Request"} />
                              </Form.Item>
                            </Col>
                            {rule === 'per_image' && (
                              <>
                                <Col span={6}>
                                  <Form.Item name="prompt_extend_multiplier" label="提示词扩写倍率" tooltip="当请求开启 prompt_extend 时，单价将乘以该倍率 (默认 1.0)">
                                    <InputNumber style={{ width: '100%' }} precision={2} step={0.1} min={0} />
                                  </Form.Item>
                                </Col>
                                <Col span={6}>
                                  <Form.Item name="image_ref_multiplier" label="有图倍率" tooltip="当请求包含参考图（图生图）时，单价将乘以该倍率 (默认 1.0，不生效)">
                                    <InputNumber style={{ width: '100%' }} precision={2} step={0.1} min={0} />
                                  </Form.Item>
                                </Col>
                              </>
                            )}
                          </Row>
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
                      <Radio value="video_quality">按视频画质及帧率阶梯表</Radio>
                      <Radio value="kling_video">可灵视频 (倍率计费)</Radio>
                      <Radio value="vidu_video">Vidu 视频</Radio>
                    </Radio.Group>
                  </Form.Item>

                  <Form.Item noStyle shouldUpdate={(prev, curr) => prev.billing_rule !== curr.billing_rule}>
                    {({ getFieldValue }) => {
                      const rule = getFieldValue('billing_rule');

                      if (rule === 'video_quality') {
                        return (
                          <div style={{ background: _isLight ? '#fff' : '#141414', padding: '20px', borderRadius: '12px', marginBottom: '24px', border: _isLight ? '1px solid #e8e8e8' : '1px solid #303030' }}>
                            <Title level={5} style={{ marginBottom: 6, fontSize: '14px', color: _isLight ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.85)' }}>视频画质及帧率计费阶梯配置</Title>
                            <Text type="secondary" style={{ fontSize: '12px', display: 'block', marginBottom: 16, lineHeight: '1.5' }}>
                              匹配说明：根据任务中的输出视频分辨率短边规格、以及输出帧率（如 ≤30fps 或 {">"}30fps）来决定秒级单价。分辨率名推荐写小写形式（如 720p, 1080p, 2k, 4k），匹配时会自动解析短边像素并判断档位。未命中的规格将自动采用已启用阶梯中的最高单价兜底。
                            </Text>
                            <Form.List name="pricing_tiers" initialValue={[]}>
                              {(fields, { add, remove }) => (
                                <>
                                  <Row gutter={12} style={{ marginBottom: 8, opacity: 0.5, fontSize: 12 }}>
                                    <Col span={8}>分辨率规格 (如: 1080p)</Col>
                                    <Col span={7}>帧率范围</Col>
                                    <Col span={6}>秒单价</Col>
                                    <Col span={3}>状态</Col>
                                  </Row>
                                  {fields.map(({ key, name, ...restField }) => (
                                    <Row key={key} gutter={12} align="middle" style={{ marginBottom: 12 }}>
                                      <Col span={8}>
                                        <Form.Item {...restField} name={[name, 'resolution']} rules={[{ required: true }]} noStyle>
                                          <Input placeholder="如: 1080p, 2k, 4k" style={{ width: '100%' }} />
                                        </Form.Item>
                                      </Col>
                                      <Col span={7}>
                                        <Form.Item {...restField} name={[name, 'fps_range']} rules={[{ required: true }]} noStyle>
                                          <Select placeholder="选择帧率范围" style={{ width: '100%' }}>
                                            <Select.Option value="<=30">≤30fps</Select.Option>
                                            <Select.Option value=">30">{">"}30fps</Select.Option>
                                          </Select>
                                        </Form.Item>
                                      </Col>
                                      <Col span={6}>
                                        <Form.Item {...restField} name={[name, 'rate']} rules={[{ required: true }]} noStyle>
                                          <InputNumber placeholder="秒单价" style={{ width: '100%' }} precision={6} addonAfter="/秒" />
                                        </Form.Item>
                                      </Col>
                                      <Col span={3}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                          <Form.Item {...restField} name={[name, 'enabled']} valuePropName="checked" style={{ marginBottom: 0 }}>
                                            <Switch size="small" />
                                          </Form.Item>
                                          <Button type="text" danger icon={<DeleteTwoTone />} onClick={() => remove(name)} style={{ marginLeft: 8 }} />
                                        </div>
                                      </Col>
                                    </Row>
                                  ))}
                                  <Button type="dashed" onClick={() => add({ resolution: '1080p', fps_range: '<=30', rate: 0, enabled: true })} block icon={<PlusOutlined />} style={{ marginTop: 8, height: '40px' }}>
                                    添加画质阶梯
                                  </Button>
                                </>
                              )}
                            </Form.List>
                          </div>
                        );
                      }

                      if (rule === 'video_resolution') {
                        return (
                          <div style={{ background: _isLight ? '#fff' : '#141414', padding: '20px', borderRadius: '12px', marginBottom: '24px', border: _isLight ? '1px solid #e8e8e8' : '1px solid #303030' }}>
                            <Title level={5} style={{ marginBottom: 6, fontSize: '14px', color: _isLight ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.85)' }}>视频分辨率计费组合包</Title>
                            <Text type="secondary" style={{ fontSize: '12px', display: 'block', marginBottom: 16, lineHeight: '1.5' }}>
                              匹配说明：系统会自动忽略大小写（例如 4K 和 4k 等效），并且自动将包含星号的乘式（如 1920*1080）转换为统一的 1920x1080 格式；若仅传递纯数字（如 1080）则会自动追加 "p" 后缀匹配 1080p。此处配置的匹配名称推荐统一写标准小写形式（如 720p, 1080p, 4k）。
                            </Text>
                            <Form.List name="pricing_tiers" initialValue={[]}>
                              {(fields, { add, remove }) => (
                                <>
                                  <Row gutter={12} style={{ marginBottom: 8, opacity: 0.5, fontSize: 12 }}>
                                    <Col span={7}>分辨率</Col>
                                    <Col span={7}>秒单价</Col>
                                    <Col span={5}>状态</Col>
                                  </Row>
                                  {fields.map(({ key, name, ...restField }) => (
                                    <Row key={key} gutter={12} align="middle" style={{ marginBottom: 12 }}>
                                      <Col span={7}>
                                        <Form.Item {...restField} name={[name, 'resolution']} rules={[{ required: true }]} noStyle>
                                          <Input placeholder="如: 720p" style={{ width: '100%' }} />
                                        </Form.Item>
                                      </Col>
                                      <Col span={7}>
                                        <Form.Item {...restField} name={[name, 'rate']} rules={[{ required: true }]} noStyle>
                                          <InputNumber placeholder="秒单价" style={{ width: '100%' }} precision={6} addonAfter="/秒" />
                                        </Form.Item>
                                      </Col>
                                      <Col span={5}>
                                        <Form.Item {...restField} name={[name, 'enabled']} valuePropName="checked" style={{ marginBottom: 0 }}>
                                          <Switch size="small" />
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
                      } else if (rule === 'kling_video') {
                        return (
                          <div style={{ background: _isLight ? '#fff' : '#141414', padding: '20px', borderRadius: '12px', marginBottom: 24, border: _isLight ? '1px solid #e8e8e8' : '1px solid #303030' }}>
                            <Text type="secondary" style={{ fontSize: '12px', display: 'block', marginBottom: 16 }}>
                              可灵视频按秒计费。精确查表模式下系统按 mode|sound|参考视频 组合 key 直接匹配单价；倍率模式下按 基准秒单价 × 倍率 计算。
                            </Text>

                            {/* 模式切换：精确查表 vs 倍率 */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                              <Text style={{ fontSize: 12 }}>模式切换</Text>
                              <Form.Item name="kling_use_price_table" valuePropName="checked" style={{ marginBottom: 0 }}>
                                <Switch />
                              </Form.Item>
                            </div>

                            <Form.Item noStyle dependencies={['kling_use_price_table', 'kling_enable_mode', 'kling_enable_sound', 'kling_enable_video_ref']}>
                              {({ getFieldValue }) => {
                                const usePT = getFieldValue('kling_use_price_table');
                                const eMode = getFieldValue('kling_enable_mode') !== false;
                                const eSound = getFieldValue('kling_enable_sound') !== false;
                                const eVideo = getFieldValue('kling_enable_video_ref') === true;

                                if (usePT) {
                                  // 精确查表面板
                                  const modes = eMode ? ['std', 'pro', '2k', '4k'] : ['std'];
                                  const sounds = eSound ? ['off', 'on'] : ['off'];
                                  const videos = eVideo ? ['no', 'yes'] : ['no'];
                                  const modeLabels: Record<string, string> = { std: '标准', pro: '高品质', '2k': '2k', '4k': '4k' };
                                  const soundLabels: Record<string, string> = { off: '无声', on: '有声' };
                                  const videoLabels: Record<string, string> = { no: '无参考视频', yes: '有参考视频' };

                                  return (
                                    <>
                                      {/* 维度开关：控制精确价格表的维度组合 */}
                                      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 16, padding: '12px 16px', background: _isLight ? '#f5f5f5' : 'rgba(255,255,255,0.04)', borderRadius: 8 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                          <Text style={{ fontSize: 12 }}>生成模式区分计费</Text>
                                          <Form.Item name="kling_enable_mode" valuePropName="checked" style={{ marginBottom: 0 }}>
                                            <Switch size="small" />
                                          </Form.Item>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                          <Text style={{ fontSize: 12 }}>有声/无声区分计费</Text>
                                          <Form.Item name="kling_enable_sound" valuePropName="checked" style={{ marginBottom: 0 }}>
                                            <Switch size="small" />
                                          </Form.Item>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                          <Text style={{ fontSize: 12 }}>参考视频区分计费</Text>
                                          <Form.Item name="kling_enable_video_ref" valuePropName="checked" style={{ marginBottom: 0 }}>
                                            <Switch size="small" />
                                          </Form.Item>
                                        </div>
                                      </div>

                                      <div style={{ padding: '12px', background: _isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
                                        <Text strong style={{ fontSize: '13px', display: 'block', marginBottom: 12 }}>精确价格表 (单价/秒)</Text>
                                        {modes.map(m => sounds.map(s => videos.map(v => {
                                          const key = `${m}|${s}|${v}`;
                                          const dimLabels = [modeLabels[m] || m];
                                          if (eSound) dimLabels.push(soundLabels[s] || s);
                                          if (eVideo) dimLabels.push(videoLabels[v] || v);
                                          const isDisabled = klingDisabledKeys.includes(key);
                                          return (
                                            <Row key={key} gutter={12} align="middle" style={{ marginBottom: 8, opacity: isDisabled ? 0.45 : 1 }}>
                                              <Col span={9}>
                                                <Text style={{ fontSize: 13 }}>{dimLabels.join(' / ')}</Text>
                                              </Col>
                                              <Col span={10}>
                                                <InputNumber
                                                  style={{ width: '100%' }}
                                                  precision={2}
                                                  step={0.1}
                                                  min={0}
                                                  addonAfter="/秒"
                                                  disabled={isDisabled}
                                                  value={klingPriceTable[key] ?? 0}
                                                  onChange={(val) => {
                                                    setKlingPriceTable(prev => ({ ...prev, [key]: val ?? 0 }));
                                                  }}
                                                />
                                              </Col>
                                              <Col span={5} style={{ textAlign: 'right' }}>
                                                <Switch
                                                  size="small"
                                                  checked={!isDisabled}
                                                  onChange={(checked) => {
                                                    setKlingDisabledKeys(prev =>
                                                      checked ? prev.filter(k => k !== key) : [...prev, key]
                                                    );
                                                  }}
                                                />
                                              </Col>
                                            </Row>
                                          );
                                        }))).flat(2)}
                                      </div>
                                    </>
                                  );
                                }

                                // 倍率模式面板
                                return (
                                  <>
                                    <Form.Item name="duration_rate" label="基准秒单价 (倍率模式基准)" rules={[{ required: true }]} style={{ marginBottom: 16 }}>
                                      <InputNumber style={{ width: '200px' }} precision={6} addonAfter="/ s" />
                                    </Form.Item>
                                    <Text strong style={{ fontSize: '13px', display: 'block', marginBottom: 8 }}>生成模式 (mode) 倍率</Text>
                                    <Row gutter={16} style={{ marginBottom: 16 }}>
                                      <Col span={6}><Form.Item name="kling_mode_std" label="std (标准)" style={{ marginBottom: 0 }}><InputNumber style={{ width: '100%' }} precision={2} step={0.1} addonAfter="x" /></Form.Item></Col>
                                      <Col span={6}><Form.Item name="kling_mode_pro" label="pro (高品质)" style={{ marginBottom: 0 }}><InputNumber style={{ width: '100%' }} precision={2} step={0.1} addonAfter="x" /></Form.Item></Col>
                                      <Col span={6}><Form.Item name="kling_mode_2k" label="2k (2k)" style={{ marginBottom: 0 }}><InputNumber style={{ width: '100%' }} precision={2} step={0.1} addonAfter="x" /></Form.Item></Col>
                                      <Col span={6}><Form.Item name="kling_mode_4k" label="4k (4k)" style={{ marginBottom: 0 }}><InputNumber style={{ width: '100%' }} precision={2} step={0.1} addonAfter="x" /></Form.Item></Col>
                                    </Row>
                                    <Text strong style={{ fontSize: '13px', display: 'block', marginBottom: 8 }}>声音 (sound) 倍率</Text>
                                    <Row gutter={16} style={{ marginBottom: 16 }}>
                                      <Col span={12}><Form.Item name="kling_sound_off" label="off (无声)" style={{ marginBottom: 0 }}><InputNumber style={{ width: '100%' }} precision={2} step={0.1} addonAfter="x" /></Form.Item></Col>
                                      <Col span={12}><Form.Item name="kling_sound_on" label="on (有声)" style={{ marginBottom: 0 }}><InputNumber style={{ width: '100%' }} precision={2} step={0.1} addonAfter="x" /></Form.Item></Col>
                                    </Row>
                                    <Text strong style={{ fontSize: '13px', display: 'block', marginBottom: 8 }}>参考视频 倍率</Text>
                                    <Row gutter={16}>
                                      <Col span={12}><Form.Item name="kling_video_ref_no" label="无参考视频" style={{ marginBottom: 0 }}><InputNumber style={{ width: '100%' }} precision={2} step={0.1} addonAfter="x" /></Form.Item></Col>
                                      <Col span={12}><Form.Item name="kling_video_ref_yes" label="有参考视频" style={{ marginBottom: 0 }}><InputNumber style={{ width: '100%' }} precision={2} step={0.1} addonAfter="x" /></Form.Item></Col>
                                    </Row>
                                  </>
                                );
                              }}
                            </Form.Item>
                          </div>
                        );
                      } else if (rule === 'vidu_video') {
                        // 腾讯云 Vidu 视频精确查表
                        const viduAttrs = ['text', 'image', 'ref'];
                        const viduRes = ['480p', '720p', '1080p', '2k', '4k'];
                        const viduAttrLabels: Record<string, string> = { text: '文生视频', image: '图生视频', ref: '参考生视频' };
                        return (
                          <div style={{ background: _isLight ? '#fff' : '#141414', padding: '20px', borderRadius: '12px', marginBottom: 24, border: _isLight ? '1px solid #e8e8e8' : '1px solid #303030' }}>
                            <Title level={5} style={{ marginBottom: 6, fontSize: '14px', color: _isLight ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.85)' }}>Vidu 视频价格表</Title>
                            <Text type="secondary" style={{ fontSize: '12px', display: 'block', marginBottom: 16, lineHeight: '1.5' }}>
                              按 属性×分辨率 组合设置每秒单价。模型版本通过绑定不同计费规则区分。错峰折扣在请求含 OutputConfig.OffPeak=Enabled 或 service_tier=flex 时自动应用。
                            </Text>
                            <Form.Item name="vidu_offpeak_discount" label="错峰折扣率" initialValue={0.5} style={{ marginBottom: 16 }}>
                              <InputNumber style={{ width: '200px' }} precision={2} step={0.1} min={0} max={1} addonAfter="x" />
                            </Form.Item>
                            <div style={{ padding: '12px', background: _isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
                              <Text strong style={{ fontSize: '13px', display: 'block', marginBottom: 12 }}>精确价格表 (单价/秒)</Text>
                              {viduAttrs.map(attr => viduRes.map(res => {
                                const key = `${attr}|${res}`;
                                const isDisabled = viduVideoDisabledKeys.includes(key);
                                return (
                                  <Row key={key} gutter={12} align="middle" style={{ marginBottom: 8, opacity: isDisabled ? 0.45 : 1 }}>
                                    <Col span={9}>
                                      <Text style={{ fontSize: 13 }}>{viduAttrLabels[attr] || attr} / {res}</Text>
                                    </Col>
                                    <Col span={10}>
                                      <InputNumber style={{ width: '100%' }} precision={6} step={0.01} min={0} addonAfter="/秒" disabled={isDisabled}
                                        value={viduVideoPriceTable[key] ?? 0}
                                        onChange={(val) => setViduVideoPriceTable(prev => ({ ...prev, [key]: val ?? 0 }))}
                                      />
                                    </Col>
                                    <Col span={5} style={{ textAlign: 'right' }}>
                                      <Switch size="small" checked={!isDisabled}
                                        onChange={(checked) => setViduVideoDisabledKeys(prev => checked ? prev.filter(k => k !== key) : [...prev, key])}
                                      />
                                    </Col>
                                  </Row>
                                );
                              })).flat()}
                            </div>
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
                <Switch />
              </Form.Item>

              <Form.Item style={{ marginTop: 24, textAlign: 'center' }}>
                <Space size="large">
                  <Button onClick={() => setIsModalVisible(false)}>取消</Button>
                  <Button type="primary" htmlType="submit" style={{ minWidth: 120 }}>保存</Button>
                </Space>
              </Form.Item>
            </Form>
          </div>
        </Card>
      )}

    </>
  );
};

export default BillingRules;
