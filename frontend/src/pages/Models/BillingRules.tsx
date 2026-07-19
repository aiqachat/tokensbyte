import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Card, Table, Button, Space, Form, Input, Switch, message, Popconfirm, Tag, Radio, InputNumber, Row, Col, Typography, Grid, Tooltip, Select, Modal, TimePicker, Alert } from 'antd';
import MobileCardList, { MobileCard, CardRow, CardActions } from '../../components/MobileCardList';
import { PlusOutlined, EditOutlined, DeleteOutlined, DeleteTwoTone } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';
import useSettingsStore from '../../store/settings';
import RateDisplay from './RateDisplay';
import { useThemeStore } from '../../store/theme';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);
import { type ModelProvider, type ModelType } from '../../types';
import ClassificationFilter from '../../components/Models/ClassificationFilter';
const { Title, Text } = Typography;
const { useBreakpoint } = Grid;

const GPT_BILLING_ITEMS = [
  { key: 'input_text', label: '输入文本 (Text Input)' },
  { key: 'input_image', label: '输入图片 (Image Input)' },
  { key: 'output_image', label: '输出图片 (Image Output)' },
  { key: 'cached_input_text', label: '输入文本缓存 (Text Cached Input)' },
  { key: 'cached_input_image', label: '输入图片缓存 (Image Cached Input)' },
];

/** 使用 pricing_tiers 持久化阶梯配置的 billing_rule；未列入的规则保存时清空阶梯，避免脏数据串模式 */
const RULES_WITH_PRICING_TIERS = new Set([
  'tiered',
  'doubao_chat',
  'image_resolution',
  'image_size_pixel',
  'video_resolution',
  'video_quality',
  'volc_seedream_pro',
]);

interface RuleContainerProps {
  isLight: boolean;
  title?: React.ReactNode;
  description?: React.ReactNode;
  extra?: React.ReactNode;
  children: React.ReactNode;
  padding?: string | number;
}

const RuleContainer: React.FC<RuleContainerProps> = ({ isLight, title, description, extra, children, padding = 20 }) => {
  return (
    <div style={{
      background: isLight ? '#fff' : '#141414',
      padding: typeof padding === 'number' ? `${padding}px` : padding,
      borderRadius: '12px',
      marginBottom: 24,
      border: isLight ? '1px solid #e8e8e8' : '1px solid #303030'
    }}>
      {(title || description || extra) && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: description ? 6 : 0 }}>
            {title && (
              typeof title === 'string' ? (
                <Title level={5} style={{ margin: 0, fontSize: '14px', color: isLight ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.85)' }}>
                  {title}
                </Title>
              ) : title
            )}
            {extra}
          </div>
          {description && (
            typeof description === 'string' ? (
              <Text type="secondary" style={{ fontSize: '12px', display: 'block', lineHeight: '1.5' }}>
                {description}
              </Text>
            ) : description
          )}
        </div>
      )}
      {children}
    </div>
  );
};

interface CacheRateControlProps {
  name: string;
  rateName: string;
  label: string;
  isLight: boolean;
}

const CacheRateControl: React.FC<CacheRateControlProps> = ({ name, rateName, label, isLight }) => {
  return (
    <Form.Item noStyle dependencies={[name]}>
      {({ getFieldValue: gfv }) => {
        const enabled = gfv(name);
        return (
          <div style={{ padding: '12px 16px', background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)', borderRadius: 8, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: enabled ? 12 : 0 }}>
              <Text style={{ fontSize: 13 }}>{label}</Text>
              <Form.Item name={name} valuePropName="checked" style={{ margin: 0 }}>
                <Switch size="small" />
              </Form.Item>
            </div>
            {enabled && (
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name={rateName} style={{ marginBottom: 0 }}>
                    <InputNumber style={{ width: '100%' }} precision={6} addonAfter="/ 1M" placeholder={label} />
                  </Form.Item>
                </Col>
              </Row>
            )}
          </div>
        );
      }}
    </Form.Item>
  );
};

const WebSearchRateControl: React.FC<{ isLight: boolean; currencySymbol: string }> = ({ isLight, currencySymbol }) => {
  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px dashed ${isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'}` }}>
      <Row gutter={16}>
        <Col span={12}>
          <Form.Item name={["extended_config", "web_search_rate"]} label={`联网搜索单价 (Web Search, ${currencySymbol}/千次)`} initialValue={0}>
            <InputNumber style={{ width: '100%' }} precision={6} min={0} addonAfter="/ 千次" />
          </Form.Item>
        </Col>
      </Row>
    </div>
  );
};

interface PriceTableRowProps {
  label: string;
  value: number;
  isDisabled: boolean;
  precision?: number;
  step?: number;
  addonAfter: string;
  onChange: (val: number) => void;
  onActiveChange: (active: boolean) => void;
}

const PriceTableRow: React.FC<PriceTableRowProps> = ({
  label,
  value,
  isDisabled,
  precision = 6,
  step = 0.001,
  addonAfter,
  onChange,
  onActiveChange
}) => {
  return (
    <Row gutter={12} align="middle" style={{ marginBottom: 8, opacity: isDisabled ? 0.45 : 1 }}>
      <Col span={9}>
        <Text style={{ fontSize: 13 }}>{label}</Text>
      </Col>
      <Col span={10}>
        <InputNumber
          style={{ width: '100%' }}
          precision={precision}
          step={step}
          min={0}
          addonAfter={addonAfter}
          disabled={isDisabled}
          value={value}
          onChange={(val) => onChange(val ?? 0)}
        />
      </Col>
      <Col span={5} style={{ textAlign: 'right' }}>
        <Switch
          size="small"
          checked={!isDisabled}
          onChange={onActiveChange}
        />
      </Col>
    </Row>
  );
};

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

const RealTimeClock: React.FC<{ defaultTz: string }> = ({ defaultTz }) => {
  const [time, setTime] = useState(dayjs());

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(dayjs());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  let displayTime = time;
  let offsetStr = time.format('Z');
  try {
    if (defaultTz) {
      if (defaultTz.startsWith('UTC') || defaultTz.match(/^[+-]\d/)) {
        const offset = defaultTz.replace('UTC', '');
        displayTime = time.utcOffset(offset);
        offsetStr = displayTime.format('Z');
      } else {
        displayTime = time.tz(defaultTz);
        offsetStr = displayTime.format('Z');
      }
    }
  } catch (e) {
    // Ignore invalid timezone
  }

  return (
    <Text type="secondary" style={{ fontSize: 12 }}>
      当前管理后台系统时间: {displayTime.format('YYYY-MM-DD HH:mm:ss')} (UTC{offsetStr})
    </Text>
  );
};

const BillingRules: React.FC = () => {
  const { themeMode } = useThemeStore();
  const _isLight = themeMode === 'light';
  const { t } = useTranslation();
  const { settings } = useSettingsStore();
  const currencySymbol = settings?.currency?.currency_symbol || '$';

  const auxiliaryCurrencies = useMemo(() => {
    const list = settings?.currency?.auxiliary_currencies;
    return Array.isArray(list) ? list.filter(c => c.enabled) : [];
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
  // 火山引擎级联增强精确查表 state
  const [volcCascadePriceTable, setVolcCascadePriceTable] = useState<Record<string, number>>({});
  const [volcCascadeDisabledKeys, setVolcCascadeDisabledKeys] = useState<string[]>([]);
  const [allProviders, setAllProviders] = useState<ModelProvider[]>([]);
  const [allTypes, setAllTypes] = useState<ModelType[]>([]);
  const [filterProvider, setFilterProvider] = useState<number | null>(null);
  const [filterTypeSelect, setFilterTypeSelect] = useState<number | null>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const fetchClassifications = async () => {
    try {
      const providers = await (request.get('/model-providers') as any);
      setAllProviders(Array.isArray(providers) ? providers.filter(p => p.is_active) : []);
      const types = await (request.get('/model-types') as any);
      setAllTypes(Array.isArray(types) ? types.filter(t => t.is_active) : []);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchItems = async () => {
    setLoading(true);
    try {
      const resp = await (request.get('/billing-rules') as any);
      setItems(Array.isArray(resp) ? resp : []);
    } catch (e) {
      console.error(e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
    fetchClassifications();
  }, []);

  // ===== PC端鼠标左键按下拖拽滚动表格功能 =====
  useEffect(() => {
    const tableEl = tableContainerRef.current;
    if (!tableEl) return;

    // 查找 Ant Design Table 内部实际滚动的容器
    const container = tableEl.querySelector('.ant-table-content') || tableEl.querySelector('.ant-table-body') as HTMLElement | null;
    if (!container) return;

    let isDown = false;
    let startX: number;
    let scrollLeft: number;

    const handleMouseDown = (e: MouseEvent) => {
      // 避开可操作性子项（按钮、链接、输入框等），以及选中文本的操作
      const target = e.target as HTMLElement;
      if (
        target.closest('button') || 
        target.closest('a') || 
        target.closest('input') || 
        target.closest('textarea') ||
        target.closest('.ant-typography-copy') ||
        target.closest('.ant-select') ||
        target.closest('.ant-table-filter-trigger') ||
        target.closest('.ant-popconfirm') ||
        target.closest('.ant-popover') ||
        window.getSelection()?.toString()
      ) {
        return;
      }

      isDown = true;
      (container as HTMLElement).style.cursor = 'grabbing';
      startX = e.pageX - (container as HTMLElement).offsetLeft;
      scrollLeft = (container as HTMLElement).scrollLeft;
    };

    const handleMouseLeave = () => {
      isDown = false;
      (container as HTMLElement).style.cursor = 'grab';
    };

    const handleMouseUp = () => {
      isDown = false;
      (container as HTMLElement).style.cursor = 'grab';
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - (container as HTMLElement).offsetLeft;
      const walk = (x - startX) * 1.5; // 滚动速度倍率
      (container as HTMLElement).scrollLeft = scrollLeft - walk;
    };

    // 初始化为 grab 手势
    (container as HTMLElement).style.cursor = 'grab';

    container.addEventListener('mousedown', handleMouseDown as any);
    container.addEventListener('mouseleave', handleMouseLeave as any);
    container.addEventListener('mouseup', handleMouseUp as any);
    container.addEventListener('mousemove', handleMouseMove as any);

    return () => {
      container.removeEventListener('mousedown', handleMouseDown as any);
      container.removeEventListener('mouseleave', handleMouseLeave as any);
      container.removeEventListener('mouseup', handleMouseUp as any);
      container.removeEventListener('mousemove', handleMouseMove as any);
    };
  }, [loading]);

  const handleAdd = () => {
    setEditingItem(null);
    setBillingType('tokens');
    setKlingPriceTable({});
    setKlingDisabledKeys([]);
    setViduVideoPriceTable({});
    setViduVideoDisabledKeys([]);
    setViduImagePriceTable({});
    setViduImageDisabledKeys([]);
    setVolcCascadePriceTable({});
    setVolcCascadeDisabledKeys([]);
    form.resetFields();
    form.setFieldsValue({
      pid: '',
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
      extended_config: {
        enable_time_multipliers: false,
        time_multipliers: [],
        web_search_rate: 0,
      },
      sd2_resolutions: [
        { resolution: '480p', enabled: false, with_video: 0, without_video: 0 },
        { resolution: '720p', enabled: false, with_video: 0, without_video: 0 },
        { resolution: '1080p', enabled: false, with_video: 0, without_video: 0 },
        { resolution: '4k', enabled: false, with_video: 0, without_video: 0 },
      ],
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
      ...(() => {
        const gptDefaultValues: Record<string, any> = {};
        GPT_BILLING_ITEMS.forEach(it => {
          gptDefaultValues[`gpt_${it.key}_enabled`] = false;
          gptDefaultValues[`gpt_${it.key}_rate`] = 0;
        });
        return gptDefaultValues;
      })(),
    });
    setIsModalVisible(true);
  };

    let handleEdit = (item: BillingRuleData) => {
    let tiers: any[] = [];
    let ext: any = {};
    try {
      if (item.pricing_tiers) {
        const parsed = JSON.parse(item.pricing_tiers);
        if (Array.isArray(parsed)) {
          // image_size_pixel：旧表单曾误存 max_pixels，编辑时保留其余字段，需用户补全 size
          tiers.push(...parsed.map((t: any) => ({ ...t })));
        }
      }
      if (item.extended_config) {
        Object.assign(ext, JSON.parse(item.extended_config));
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
    if (item.billing_rule === 'volc_enhance_cascade') {
      setVolcCascadePriceTable(ext.price_table || {});
      setVolcCascadeDisabledKeys(Array.isArray(ext.price_table_disabled) ? ext.price_table_disabled : []);
    } else {
      setVolcCascadePriceTable({});
      setVolcCascadeDisabledKeys([]);
    }

    let timeMultipliers = [];
    if (Array.isArray(ext.time_multipliers)) {
      timeMultipliers = ext.time_multipliers.map((i: any) => ({
        start: i.start ? dayjs(i.start, 'HH:mm') : null,
        end: i.end ? dayjs(i.end, 'HH:mm') : null,
        multiplier: i.multiplier ?? 1.0,
      })).filter((i: any) => i.start && i.end);
    }

    let sd2_resolutions: any[] = [];
    if (ext.resolution_rates) {
      Object.keys(ext.resolution_rates).forEach(res => {
        sd2_resolutions.push({
          resolution: res,
          enabled: true,
          with_video: ext.resolution_rates[res].with_video || 0,
          without_video: ext.resolution_rates[res].without_video || 0,
        });
      });
      ['480p', '720p', '1080p', '4k'].forEach(res => {
        if (!sd2_resolutions.find(r => r.resolution === res)) {
          sd2_resolutions.push({ resolution: res, enabled: false, with_video: 0, without_video: 0 });
        }
      });
    } else {
      sd2_resolutions = [
        { resolution: '480p', enabled: false, with_video: 0, without_video: 0 },
        { resolution: '720p', enabled: false, with_video: 0, without_video: 0 },
        { resolution: '1080p', enabled: false, with_video: 0, without_video: 0 },
        { resolution: '4k', enabled: false, with_video: 0, without_video: 0 },
      ];
    }

    form.setFieldsValue({
      ...item,
      pricing_tiers: tiers,
      sd2_resolutions,
      volc_audio_rate: ext.audio_rate || 0,
      volc_base_rate: ext.base_rate || 0,
      volc_offline_discount: ext.offline_discount ?? 0.5,
      s1_online_rate: ext.online_rate || 0,
      s1_offline_rate: ext.offline_rate || 0,
      image_prompt_rate: ext.image_prompt_rate || 0,
      prompt_extend_multiplier: ext.prompt_extend_multiplier || 1,
      image_ref_multiplier: ext.image_ref_multiplier ?? 1,
      quality_pricing_enabled: !!ext.quality_pricing_enabled
        || (item.billing_rule === 'image_size_pixel' && tiers.some((t: any) => t.quality_pricing)),
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
      ...(() => {
        const gptConfig = ext.gpt_config || {};
        const gptValues: Record<string, any> = {};
        GPT_BILLING_ITEMS.forEach(it => {
          const cfg = gptConfig[it.key] || {};
          gptValues[`gpt_${it.key}_enabled`] = !!cfg.enabled;
          gptValues[`gpt_${it.key}_rate`] = cfg.rate ?? 0;
        });
        return gptValues;
      })(),
      extended_config: {
        enable_time_multipliers: !!ext.enable_time_multipliers,
        time_multipliers: timeMultipliers,
        web_search_rate: ext.web_search_rate || 0,
      },
    });
    setIsModalVisible(true);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const editId = params.get('edit_id');
    if (editId && items.length > 0) {
      const target = items.find((item: any) => String(item.id) === editId);
      if (target) {
        handleEdit(target);
        const url = new URL(window.location.href);
        url.searchParams.delete('edit_id');
        window.history.replaceState({}, '', url.toString());
      }
    }
  }, [items]);

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
      // 提取并校验时间段倍率设置
      const enableTimeMultipliers = form.getFieldValue(['extended_config', 'enable_time_multipliers']) === true;
      let timeMultipliers = form.getFieldValue(['extended_config', 'time_multipliers']) || [];

      if (enableTimeMultipliers) {
        const intervals: { start: number; end: number; index: number }[] = [];
        for (let i = 0; i < timeMultipliers.length; i++) {
          const item = timeMultipliers[i];
          if (!item.start || !item.end) {
            message.error("请完整填写所有时间段的起止时间");
            return;
          }
          const startMin = item.start.hour() * 60 + item.start.minute();
          const endMin = item.end.hour() * 60 + item.end.minute();

          if (startMin === endMin) {
            message.error(`第 ${i + 1} 个时间段的起止时间不能相同`);
            return;
          }

          if (startMin > endMin) {
            // 跨天区间，拆分为 [start, 1440) 和 [0, end)
            intervals.push({ start: startMin, end: 1440, index: i });
            intervals.push({ start: 0, end: endMin, index: i });
          } else {
            intervals.push({ start: startMin, end: endMin, index: i });
          }
        }

        // 两两进行重叠判断 (max(start) < min(end) 时重合)
        for (let a = 0; a < intervals.length; a++) {
          for (let b = a + 1; b < intervals.length; b++) {
            const intA = intervals[a];
            const intB = intervals[b];

            if (intA.index === intB.index) continue;

            if (Math.max(intA.start, intB.start) < Math.min(intA.end, intB.end)) {
              message.error(`配置的时间段存在重叠，请修正（第 ${intA.index + 1} 组与第 ${intB.index + 1} 组）`);
              return;
            }
          }
        }
      }
      if (!RULES_WITH_PRICING_TIERS.has(values.billing_rule)) {
        values.pricing_tiers = [];
      }

      // 只有特定多模态规则才打包 extended_config，其他保持空对象
      let extConfig: Record<string, any> = {};
      if (values.billing_rule === 'seedance2.0') {
        let resRates: any = {};
        if (values.sd2_resolutions && Array.isArray(values.sd2_resolutions)) {
          values.sd2_resolutions.forEach((item: any) => {
            if (item.enabled && item.resolution) {
              resRates[item.resolution] = {
                with_video: item.with_video || 0,
                without_video: item.without_video || 0
              };
            }
          });
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
      } else if (values.billing_rule === 'volc_enhance_cascade') {
        extConfig = {
          price_table: volcCascadePriceTable,
          price_table_disabled: volcCascadeDisabledKeys,
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
      } else if (values.billing_rule === 'gpt_billing') {
        const gpt_config: Record<string, any> = {};
        GPT_BILLING_ITEMS.forEach(it => {
          gpt_config[it.key] = {
            enabled: !!values[`gpt_${it.key}_enabled`],
            rate: values[`gpt_${it.key}_rate`] || 0,
          };
        });

        extConfig = {
          gpt_config,
        };
        values.prompt_rate = values.gpt_input_text_rate || 0;
        values.completion_rate = values.gpt_output_image_rate || 0;
        values.cached_rate = 0;
        values.fixed_rate = 0;
        values.duration_rate = 0;
        values.claude_cache_creation_rate = 0;
        values.claude_cache_read_rate = 0;
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
      if (values.extended_config?.web_search_rate !== undefined) {
        extConfig.web_search_rate = values.extended_config.web_search_rate;
      } else if (values.web_search_rate !== undefined) {
        extConfig.web_search_rate = values.web_search_rate;
      }

      // 将时间段倍率配置序列化为 HH:mm 并写入 extConfig
      if (enableTimeMultipliers) {
        const formattedMultipliers = timeMultipliers.map((item: any) => ({
          start: item.start.format("HH:mm"),
          end: item.end.format("HH:mm"),
          multiplier: item.multiplier ?? 1.0,
        }));
        extConfig = {
          ...extConfig,
          enable_time_multipliers: true,
          time_multipliers: formattedMultipliers,
        };
      } else {
        extConfig = {
          ...extConfig,
          enable_time_multipliers: false,
          time_multipliers: [],
        };
      }

      // 清除表单中不应提交的临时字段
      delete values.sd2_resolutions;
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
          t.enabled ??= true;
          if (values.billing_rule === 'image_size_pixel') {
            t.quality_pricing = form.getFieldValue('quality_pricing_enabled') === true;
          }
          if (values.billing_rule === 'doubao_chat' && !form.getFieldValue('doubao_fast_enabled')) {
            t.fast_prompt_rate = 0; t.fast_completion_rate = 0; t.fast_cached_rate = 0;
            t.fast_audio_prompt_rate = 0; t.fast_audio_cached_rate = 0;
          }
          return t;
        }) || [],
        extended_config: extConfig,
        is_active: 1,
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

  const handleRestoreDefault = async () => {
    if (!editingItem) return;
    Modal.confirm({
      title: '确认恢复默认？',
      content: '此操作将覆盖当前计费规则下的所有费率、定价阶梯与配置，恢复为系统默认初始状态。此操作不可撤销，是否继续？',
      okText: '确认',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const resp = await (request.post(`/billing-rules/${editingItem.id}/restore-default`) as any);
          message.success('恢复默认成功');
          // 更新表单回显与编辑状态
          handleEdit(resp);
          // 刷新列表
          fetchItems();
        } catch (e: any) {
          console.error(e);
          message.error(e?.response?.data?.message || '恢复默认失败');
        }
      }
    });
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
      width: 320,
      render: (_: any, record: BillingRuleData) => {
        return <RateDisplay rule={record} currencySymbol={currencySymbol} formatPrice={formatPrice} />;
      }
    },
    {
      title: '规则来源',
      dataIndex: 'is_system',
      key: 'is_system',
      render: (isSystem: number) => {
        const isSys = isSystem === 1;
        return (
          <Tag color={isSys ? 'blue' : 'orange'}>
            {isSys ? '系统规则' : '手动添加'}
          </Tag>
        );
      },
      width: 120,
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
    if (filterPricingType === 'system' && item.is_system !== 1) return false;
    if (filterPricingType === 'manual' && item.is_system === 1) return false;
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
              <Text strong>规则来源：</Text>
              <Radio.Group
                value={filterPricingType}
                onChange={e => setFilterPricingType(e.target.value)}
                optionType="button"
                buttonStyle="solid"
              >
                <Radio value="all">全部</Radio>
                <Radio value="system">系统规则</Radio>
                <Radio value="manual">手动添加</Radio>
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
                    extra={
                      <Tag color={record.is_system === 1 ? 'blue' : 'orange'} style={{ margin: 0 }}>
                        {record.is_system === 1 ? '系统' : '手动'}
                      </Tag>
                    }
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
            <div ref={tableContainerRef}>
              <Table
                dataSource={filteredItems}
                columns={columns}
                rowKey="id"
                loading={loading}
                pagination={{ pageSize: 15 }}
                size="middle"
                scroll={{ x: 'max-content' }}
              />
            </div>
          )}
        </Card>
      )}

      {isModalVisible && (
        <Card
          title={editingItem ? '编辑计费基础组' : '生成新的计费规则'}
          extra={
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button onClick={() => setIsModalVisible(false)}>取消</Button>
              {editingItem?.is_system === 1 && (
                <Button danger onClick={handleRestoreDefault}>恢复默认</Button>
              )}
              <Button type="primary" onClick={() => form.submit()}>保存</Button>
            </div>
          }
        >
          <div style={{ maxWidth: 1400, margin: '0 auto' }}>
            <Form form={form} layout="vertical" onFinish={handleSave}>
              <Row gutter={16}>
                <Col xs={24} sm={12}>
                  <Form.Item name="name" label="大模型计费模版名称" rules={[{ required: true }]}>
                    <Input placeholder="输入该组计费的明显记号，方便添加模型时直接下拉应用。" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={6}>
                  <Form.Item
                    name="pid"
                    label="计费规则 PID"
                    tooltip={editingItem ? "编辑时计费规则 PID 唯一且不可修改" : "选填，不填则自动生成。手动规则必须以 6 开头，系统规则必须以 7 开头，且都是 5 位数字字符串"}
                    rules={[
                      {
                        validator: (_, value) => {
                          if (!value) return Promise.resolve();
                          if (!/^\d{5}$/.test(value)) {
                            return Promise.reject(new Error('PID 必须是 5 位数字字符串'));
                          }
                          const isSys = editingItem?.is_system === 1;
                          if (isSys && !value.startsWith('7')) {
                            return Promise.reject(new Error('系统规则 PID 必须是以 7 开头'));
                          }
                          if (!isSys && !value.startsWith('6')) {
                            return Promise.reject(new Error('手动添加规则 PID 必须是以 6 开头'));
                          }
                          return Promise.resolve();
                        }
                      }
                    ]}
                  >
                    <Input placeholder="例如: 61001" maxLength={5} disabled={!!editingItem} />
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
                  <Form.Item name="billing_rule" label={t('models.billing_rule')} initialValue="standard" rules={[{ required: true, message: '请选择计费规则' }]}>
                    <Radio.Group optionType="button" buttonStyle="solid">
                      <Radio value="standard">{t('models.rule_standard')}</Radio>
                      <Radio value="multimodal">{t('models.rule_multimodal')}</Radio>
                      <Radio value="gpt_billing">GPT官方计费</Radio>
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

                      if (rule === 'gpt_billing') {
                        const items = [
                          { key: 'input_text', label: '输入文本 (Text Input)' },
                          { key: 'input_image', label: '输入图片 (Image Input)' },
                          { key: 'output_image', label: '输出图片 (Image Output)' },
                          { key: 'cached_input_text', label: '输入文本缓存 (Text Cached Input)' },
                          { key: 'cached_input_image', label: '输入图片缓存 (Image Cached Input)' },
                        ];

                        return (
                          <RuleContainer isLight={_isLight} title="GPT官方计费配置" description="每一项计费可分别开启或关闭，开启后对应的 Token 消耗将按照设定单价（每 1M tokens）计费。对于只返回图片的模型，输出部分将直接使用输出图片进行计费，无需配置输出文本。">
                            <Row gutter={16}>
                              {items.map(item => (
                                <Col span={12} key={item.key}>
                                  <Form.Item noStyle dependencies={[`gpt_${item.key}_enabled`]}>
                                    {({ getFieldValue: gfv }) => {
                                      const enabled = gfv(`gpt_${item.key}_enabled`);
                                      return (
                                        <div style={{
                                          padding: '12px 16px',
                                          background: _isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)',
                                          borderRadius: 8,
                                          marginBottom: 12,
                                          border: _isLight ? '1px solid #f0f0f0' : '1px solid #303030'
                                        }}>
                                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: enabled ? 12 : 0 }}>
                                            <span style={{ fontSize: 13, fontWeight: 500 }}>{item.label}</span>
                                            <Form.Item name={`gpt_${item.key}_enabled`} valuePropName="checked" style={{ margin: 0 }}>
                                              <Switch size="small" />
                                            </Form.Item>
                                          </div>
                                          {enabled && (
                                            <Form.Item name={`gpt_${item.key}_rate`} style={{ margin: 0 }} rules={[{ required: true, message: '请输入价格' }]}>
                                              <InputNumber style={{ width: '100%' }} precision={6} addonAfter="/ 1M" placeholder="输入价格" />
                                            </Form.Item>
                                          )}
                                        </div>
                                      );
                                    }}
                                  </Form.Item>
                                </Col>
                              ))}
                            </Row>
                          </RuleContainer>
                        );
                      }

                      if (rule === 'multimodal') {
                        return (
                          <RuleContainer isLight={_isLight} title={t('models.rule_multimodal')}>
                            <Row gutter={16}>
                              <Col span={12}>
                                <Form.Item name="prompt_rate" label={t('models.text_input_rate')} rules={[{ required: true }]} style={{ marginBottom: 0 }}>
                                  <InputNumber style={{ width: '100%' }} precision={6} addonAfter="/ 1M" />
                                </Form.Item>
                              </Col>
                              <Col span={12}>
                                <Form.Item name="image_prompt_rate" label={t('models.image_input_rate')} rules={[{ required: true }]} style={{ marginBottom: 0 }}>
                                  <InputNumber style={{ width: '100%' }} precision={6} addonAfter="/ 1M" />
                                </Form.Item>
                              </Col>
                            </Row>
                            <WebSearchRateControl isLight={_isLight} currencySymbol={currencySymbol} />
                          </RuleContainer>
                        );
                      }

                      if (rule === 'standard') {
                        return (
                          <RuleContainer isLight={_isLight} title={t('models.rule_standard')}>
                            <Row gutter={16} style={{ marginBottom: 16 }}>
                              <Col span={12}>
                                <Form.Item name="prompt_rate" label={unitLabel} rules={[{ required: true }]} style={{ marginBottom: 0 }}>
                                  <InputNumber style={{ width: '100%' }} precision={6} addonAfter="/ 1M" />
                                </Form.Item>
                              </Col>
                              <Col span={12}>
                                <Form.Item name="completion_rate" label={unitLabelComp} rules={[{ required: true }]} style={{ marginBottom: 0 }}>
                                  <InputNumber style={{ width: '100%' }} precision={6} addonAfter="/ 1M" />
                                </Form.Item>
                              </Col>
                            </Row>

                            <CacheRateControl name="enable_cached_rate" rateName="cached_rate" label="缓存命中费率（OpenAI/Gemini 等通用缓存读取）" isLight={_isLight} />
                            <CacheRateControl name="enable_claude_cache_creation" rateName="claude_cache_creation_rate" label="Claude 缓存创建费率" isLight={_isLight} />
                            <CacheRateControl name="enable_claude_cache_read" rateName="claude_cache_read_rate" label="Claude 缓存读取费率" isLight={_isLight} />
                            <WebSearchRateControl isLight={_isLight} currencySymbol={currencySymbol} />
                          </RuleContainer>
                        );
                      }

                      if (rule === 'seedance2.0') {
                        return (
                          <RuleContainer
                            isLight={_isLight}
                            title="Seedance 2.0 计费配置"
                            description="Seedance 2.0 — 指定具体支持的视频分辨率及是否包含视频输入的定价 (可分级管控)。匹配说明：按分辨率参数精确匹配（如 480p, 720p, 1080p, 4k）。若未命中且未配置，默认兜底使用 720p 档位。"
                          >
                            <Form.List name="sd2_resolutions" initialValue={[
                              { resolution: '480p', enabled: false, with_video: 0, without_video: 0 },
                              { resolution: '720p', enabled: false, with_video: 0, without_video: 0 },
                              { resolution: '1080p', enabled: false, with_video: 0, without_video: 0 }
                            ]}>
                              {(fields, { add, remove }) => (
                                <>
                                  {fields.map(({ key, name, ...restField }) => (
                                    <div key={key} style={{ marginBottom: 16, padding: '12px', background: _isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)', borderRadius: '8px' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                          <Form.Item {...restField} name={[name, 'resolution']} rules={[{ required: true }]} noStyle>
                                            <Input placeholder="分辨率 (如 4k)" style={{ width: 120 }} size="small" />
                                          </Form.Item>
                                          <Text strong style={{ fontSize: '13px' }}>分辨率矩阵计费</Text>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                          <Form.Item {...restField} name={[name, 'enabled']} valuePropName="checked" style={{ margin: 0 }}>
                                            <Switch size="small" />
                                          </Form.Item>
                                          <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(name)} size="small" />
                                        </div>
                                      </div>
                                      <Form.Item noStyle dependencies={[['sd2_resolutions', name, 'enabled']]}>
                                        {({ getFieldValue }) => {
                                          const isEnabled = getFieldValue(['sd2_resolutions', name, 'enabled']);
                                          const resValue = getFieldValue(['sd2_resolutions', name, 'resolution']) || '此分辨率';
                                          return isEnabled ? (
                                            <Row gutter={16} align="middle">
                                              <Col span={12}>
                                                <Form.Item {...restField} name={[name, 'with_video']} label={<Text style={{ fontSize: '12px' }}>包含视频输入 (元/百万)</Text>} rules={[{ required: true, message: '' }]} style={{ marginBottom: 0 }}>
                                                  <InputNumber style={{ width: '100%' }} precision={6} min={0} />
                                                </Form.Item>
                                              </Col>
                                              <Col span={12}>
                                                <Form.Item {...restField} name={[name, 'without_video']} label={<Text style={{ fontSize: '12px' }}>不包含视频输入 (元/百万)</Text>} rules={[{ required: true, message: '' }]} style={{ marginBottom: 0 }}>
                                                  <InputNumber style={{ width: '100%' }} precision={6} min={0} />
                                                </Form.Item>
                                              </Col>
                                            </Row>
                                          ) : (
                                            <Text type="secondary" style={{ fontSize: '12px' }}>{resValue} 被关闭，将不响应此分辨率独立的按需定价。</Text>
                                          );
                                        }}
                                      </Form.Item>
                                    </div>
                                  ))}
                                  <Button
                                    type="dashed"
                                    onClick={() => add({ resolution: '', enabled: true, with_video: 0, without_video: 0 })}
                                    block
                                    icon={<PlusOutlined />}
                                    style={{ marginTop: 8, height: '40px' }}
                                  >
                                    添加一条 Seedance 2.0 分辨率计费阶梯
                                  </Button>
                                </>
                              )}
                            </Form.List>
                          </RuleContainer>
                        );
                      }

                      if (rule === 'seedance1.5pro') {
                        return (
                          <RuleContainer
                            isLight={_isLight}
                            description="如需支持离线推理(flex)降价，请在此配置乘以的折扣倍率"
                          >
                            <Row gutter={16} align="middle">
                              <Col span={8}><Form.Item name="volc_audio_rate" label="包含语音" rules={[{ required: true }]} style={{ marginBottom: 0 }}><InputNumber style={{ width: '100%' }} precision={6} addonAfter="/ 1M" /></Form.Item></Col>
                              <Col span={8}><Form.Item name="volc_base_rate" label="不包含语音" rules={[{ required: true }]} style={{ marginBottom: 0 }}><InputNumber style={{ width: '100%' }} precision={6} addonAfter="/ 1M" /></Form.Item></Col>
                              <Col span={8}><Form.Item name="volc_offline_discount" label="离线推理(flex)折扣倍率" tooltip="例如 0.5 即等于最终价格减半" rules={[{ required: true }]} style={{ marginBottom: 0 }}><InputNumber style={{ width: '100%' }} precision={2} step={0.1} /></Form.Item></Col>
                            </Row>
                          </RuleContainer>
                        );
                      }

                      if (rule === 'seedance1.0') {
                        return (
                          <RuleContainer
                            isLight={_isLight}
                            description="Seedance 1.0 — 支持在线与离线的双轨计费"
                          >
                            <Row gutter={16} align="middle">
                              <Col span={12}><Form.Item name="s1_online_rate" label="在线推理定价" rules={[{ required: true }]} style={{ marginBottom: 0 }}><InputNumber style={{ width: '100%' }} precision={6} addonAfter="/ 1M" /></Form.Item></Col>
                              <Col span={12}><Form.Item name="s1_offline_rate" label="离线推理(flex)定价" rules={[{ required: true }]} style={{ marginBottom: 0 }}><InputNumber style={{ width: '100%' }} precision={6} addonAfter="/ 1M" /></Form.Item></Col>
                            </Row>
                          </RuleContainer>
                        );
                      }

                      if (rule === 'tiered') {
                        return (
                          <RuleContainer
                            isLight={_isLight}
                            title={t('models.pricing_tiers')}
                            description='界定说明：输入上限与输出上限填写的数值单位是以"千(K)"为步长判定的。例如输入 128 即表示 ≤128K Token 命中此阶梯；输出上限不填则表示不限制输出。缓存费率用于对命中输入缓存的 Token 独立定价（属于输入的子集），未填写则缓存按输入费率计。命中落区后，最终费用将结合配置的费率采用 1M (一百万) 定标结算。'
                          >
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
                                        <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(name)} />
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
                            <WebSearchRateControl isLight={_isLight} currencySymbol={currencySymbol} />
                          </RuleContainer>
                        );
                      }

                      if (rule === 'doubao_chat') {
                        return (
                          <Form.Item noStyle dependencies={['doubao_fast_enabled']}>
                            {({ getFieldValue: gfv }) => {
                              const fastEnabled = gfv('doubao_fast_enabled');
                              return (
                                <RuleContainer
                                  isLight={_isLight}
                                  title="豆包聊天阶梯计费"
                                  extra={
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                      <Text style={{ fontSize: 12 }}>低延迟</Text>
                                      <Form.Item name="doubao_fast_enabled" valuePropName="checked" style={{ margin: 0 }}>
                                        <Switch size="small" />
                                      </Form.Item>
                                    </div>
                                  }
                                  description={`界定说明：输入与输出上限填写的数值单位是"千(K)"。例如输入 8 即表示 ≤8K Token，输出不填则表示不限制。匹配时需同时满足输入与输出上限。对齐官方公式：费用 = 输入(非音频)×费率 + 输入(音频)×费率 + 缓存(非音频)×费率 + 缓存(音频)×费率 + 输出×费率，费率单位 /1M Tokens。${fastEnabled ? '开启低延迟后，service_tier=fast 的请求将使用低延迟费率组计费，未设置的低延迟费率自动降级为常规费率。' : ''}`}
                                >
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
                                              <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(name)} size="small" />
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
                                  <WebSearchRateControl isLight={_isLight} currencySymbol={currencySymbol} />
                                </RuleContainer>
                              );
                            }}
                          </Form.Item>
                        );
                      }

                      return null;
                    }}
                  </Form.Item>
                </>
              )}


              {billingType === 'requests' && (
                <>
                  <Form.Item name="billing_rule" label="计费子模式配置" initialValue="fixed" rules={[{ required: true, message: '请选择计费子模式' }]}>
                    <Radio.Group optionType="button" buttonStyle="solid">
                      <Radio value="fixed">固定费率 (单次)</Radio>
                      <Radio value="per_image">按张收费 (实际返回)</Radio>
                      <Radio value="image_resolution">按分辨率K</Radio>
                      <Radio value="image_size_pixel">按分辨率像素</Radio>
                      <Radio value="vidu_image">Vidu 图片</Radio>
                      <Radio value="volc_seedream_pro">火山 Seedream 5.0 Pro</Radio>
                      <Radio value="characters">按字符计费 (语音合成)</Radio>
                    </Radio.Group>
                  </Form.Item>

                  <Form.Item noStyle shouldUpdate={(prev, curr) => prev.billing_rule !== curr.billing_rule}>
                    {({ getFieldValue }) => {
                      const rule = getFieldValue('billing_rule');

                      if (rule === 'image_resolution') {
                        return (
                          <RuleContainer
                            isLight={_isLight}
                            title="图片分辨率K计费配置"
                            description="匹配说明：此模式按图片模型的 resolution 参数匹配分辨率等级（如 1k、2k、4k）。系统自动忽略大小写（1K 和 1k 等效）。配置的匹配名称推荐统一写标准小写形式（如 1k、2k、4k）。若请求的分辨率未命中任何档位，将按最高价计费。"
                          >
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
                                          <InputNumber placeholder="参考图倍率" style={{ width: '100%' }} precision={2} step={0.1} />
                                        </Form.Item>
                                      </Col>
                                      <Col span={4}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                          <Form.Item {...restField} name={[name, 'enabled']} valuePropName="checked" style={{ marginBottom: 0 }}>
                                            <Switch size="small" />
                                          </Form.Item>
                                          <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(name)} style={{ marginLeft: 8 }} />
                                        </div>
                                      </Col>
                                    </Row>
                                  ))}
                                  <Button
                                    type="dashed"
                                    onClick={() => add({ resolution: '', rate: 0, image_ref_multiplier: 1.0, enabled: true })}
                                    block
                                    icon={<PlusOutlined />}
                                    style={{ marginTop: 8, height: '40px' }}
                                  >
                                    增加一个分辨率价格档位
                                  </Button>
                                </>
                              )}
                            </Form.List>
                          </RuleContainer>
                        );
                      }

                      if (rule === 'image_size_pixel') {
                        return (
                          <Form.Item noStyle dependencies={['quality_pricing_enabled']}>
                            {({ getFieldValue: gfv }) => {
                              const qpEnabled = gfv('quality_pricing_enabled') === true;
                              return (
                                <RuleContainer
                                  isLight={_isLight}
                                  title="图片分辨率像素计费配置"
                                  extra={
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                      <Text style={{ fontSize: 12 }}>画质</Text>
                                      <Form.Item name="quality_pricing_enabled" valuePropName="checked" style={{ margin: 0 }}>
                                        <Switch size="small" />
                                      </Form.Item>
                                    </div>
                                  }
                                  description={`匹配说明：此模式按图片模型的 size 参数匹配像素分辨率（如 1024x1024、1536x1024）。系统自动将 *、×、X、: 统一替换为 x 匹配（如 2:3 等同 2x3）；K 等级（如 1k）自动映射为像素值（1024x1024）。若未命中任何档位，将按最高价计费。${qpEnabled ? '开启画质后，将按请求的 quality 参数（low/medium/high）匹配对应的画质费率，未传画质参数时默认按中画质计费。' : ''}`}
                                >
                                  <Form.List name="pricing_tiers" initialValue={[]}>
                                    {(fields, { add, remove }) => (
                                      <>
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
                                          <Col span={3}>状态</Col>
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
                                            <Col span={3}>
                                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <Form.Item {...restField} name={[name, 'enabled']} valuePropName="checked" style={{ marginBottom: 0 }}>
                                                  <Switch size="small" />
                                                </Form.Item>
                                                <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(name)} style={{ marginLeft: 8 }} />
                                              </div>
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
                                  <div style={{ marginTop: 16, padding: '12px 16px', background: _isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
                                    <Form.Item name="prompt_extend_multiplier" label="提示词扩写倍率" tooltip="当请求开启 prompt_extend 时，分辨率阶梯单价将乘以该倍率 (默认 1.0)" style={{ marginBottom: 0 }}>
                                      <InputNumber style={{ width: '100%', maxWidth: 280 }} precision={2} step={0.1} min={0} addonAfter="x" />
                                    </Form.Item>
                                  </div>
                                </RuleContainer>
                              );
                            }}
                          </Form.Item>
                        );
                      }

                      if (rule === 'volc_seedream_pro') {
                        return (
                          <RuleContainer
                            isLight={_isLight}
                            title="火山 Seedream 5.0 Pro 计费配置"
                            description={
                              <div>
                                <Text type="secondary" style={{ fontSize: '13px', display: 'block', marginBottom: '8px' }}>
                                  计费说明：适用于火山方舟图像生成模型。输入图按超过 1 张后的单价计费（首张免费）。输出图按分辨率相乘获得总像素值（单位：万像素），匹配满足该总像素上限的最小价格阶梯（若均未命中则按最高价格档位兜底）。
                                </Text>
                                <Alert
                                  type="info"
                                  showIcon
                                  message={
                                    <span>
                                      <strong>配置建议：</strong>
                                      建议配置两个阶梯。
                                      阶梯 1：总像素上限 236（万像素，对应 &lt;= 236 万像素，单张 0.30 元）；
                                      阶梯 2：总像素上限 999999（万像素，对应 &gt; 236 万像素，单张 0.60 元）。
                                    </span>
                                  }
                                  style={{ marginBottom: '12px' }}
                                />
                              </div>
                            }
                          >
                            <Form.Item name="prompt_rate" label="输入图额外单价" rules={[{ required: true, message: '请输入输入图额外单价' }]} style={{ marginBottom: '16px' }}>
                              <InputNumber placeholder="每多一张输入图的价格 (首张免费)" style={{ width: '100%' }} precision={6} addonAfter="元/张 (第2张起收费)" />
                            </Form.Item>

                            <Form.Item label="输出图总像素阶梯单价" required style={{ marginBottom: 0 }}>
                              <Form.List name="pricing_tiers" initialValue={[]}>
                                {(fields, { add, remove }) => (
                                  <>
                                    <Row gutter={12} style={{ marginBottom: 8, opacity: 0.5, fontSize: 12 }}>
                                      <Col span={10}>总像素上限 (万像素)</Col>
                                      <Col span={10}>单张费率 (元/张)</Col>
                                      <Col span={4}>状态</Col>
                                    </Row>
                                    {fields.map(({ key, name, ...restField }) => (
                                      <Row key={key} gutter={12} align="middle" style={{ marginBottom: 12 }}>
                                        <Col span={10}>
                                          <Form.Item {...restField} name={[name, 'max_pixels_wan']} rules={[{ required: true, message: '像素上限' }]} noStyle>
                                            <InputNumber placeholder="例如: 236" style={{ width: '100%' }} precision={2} />
                                          </Form.Item>
                                        </Col>
                                        <Col span={10}>
                                          <Form.Item {...restField} name={[name, 'rate']} rules={[{ required: true, message: '单张费率' }]} noStyle>
                                            <InputNumber placeholder="例如: 0.30" style={{ width: '100%' }} precision={6} addonAfter="/张" />
                                          </Form.Item>
                                        </Col>
                                        <Col span={4}>
                                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <Form.Item {...restField} name={[name, 'enabled']} valuePropName="checked" style={{ marginBottom: 0 }}>
                                              <Switch size="small" />
                                            </Form.Item>
                                            <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(name)} style={{ marginLeft: 8 }} />
                                          </div>
                                        </Col>
                                      </Row>
                                    ))}
                                    <Button
                                      type="dashed"
                                      onClick={() => add({ max_pixels_wan: 236, rate: 0.30, enabled: true })}
                                      block
                                      icon={<PlusOutlined />}
                                      style={{ marginTop: 8, height: '40px' }}
                                    >
                                      增加一个像素阶段阶梯
                                    </Button>
                                  </>
                                )}
                              </Form.List>
                            </Form.Item>
                          </RuleContainer>
                        );
                      }

                      if (rule === 'vidu_image') {
                        // 腾讯云 Vidu 图片精确查表
                        const viduImgAttrs = ['text', 'img2img', 'ref_1_3', 'ref_4_7'];
                        const viduImgRes = ['1k', '2k', '4k'];
                        const viduImgAttrLabels: Record<string, string> = { text: '文生图', img2img: '图生图', ref_1_3: '参考生图 2~3张', ref_4_7: '参考生图 4~7张' };
                        return (
                          <RuleContainer
                            isLight={_isLight}
                            title="Vidu 图片价格表"
                            description="按 属性×分辨率 组合设置每张单价。属性由参考图数量自动判断：0张=文生图，1张=图生图，2~3张=参考生图(低)，4~7张=参考生图(高)。模型版本通过绑定不同计费规则区分。"
                          >
                            <div style={{ padding: '12px', background: _isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
                              <Text strong style={{ fontSize: '13px', display: 'block', marginBottom: 12 }}>精确价格表 (单价/张)</Text>
                              {viduImgAttrs.map(attr => viduImgRes.map(res => {
                                const key = `${attr}|${res}`;
                                const isDisabled = viduImageDisabledKeys.includes(key);
                                return (
                                  <PriceTableRow
                                    key={key}
                                    label={`${viduImgAttrLabels[attr] || attr} / ${res}`}
                                    value={viduImagePriceTable[key] ?? 0}
                                    isDisabled={isDisabled}
                                    step={0.01}
                                    addonAfter="/张"
                                    onChange={(val) => setViduImagePriceTable(prev => ({ ...prev, [key]: val }))}
                                    onActiveChange={(checked) => setViduImageDisabledKeys(prev => checked ? prev.filter(k => k !== key) : [...prev, key])}
                                  />
                                );
                              })).flat()}
                            </div>
                          </RuleContainer>
                        );
                      }

                      // 其它：包括 fixed (固定费率), per_image (按张收费), characters (按字符计费) 等
                      const ruleLabels: Record<string, string> = {
                        fixed: '固定费率计费 (单次)',
                        per_image: '按张收费计费 (实际返回)',
                        characters: '按字符计费 (语音合成)'
                      };
                      return (
                        <RuleContainer isLight={_isLight} title={ruleLabels[rule] || '常规计费配置'}>
                          <Row gutter={16}>
                            <Col span={12}>
                              <Form.Item name="fixed_rate" label={t('models.fixed_rate')} rules={[{ required: true }]} style={{ marginBottom: 0 }}>
                                <InputNumber style={{ width: '100%' }} precision={6} addonAfter={rule === 'per_image' ? "/ 张" : rule === 'characters' ? "/ 万字符" : "/ Request"} />
                              </Form.Item>
                            </Col>
                            {rule === 'per_image' && (
                              <>
                                <Col span={6}>
                                  <Form.Item name="prompt_extend_multiplier" label="提示词扩写倍率" tooltip="当请求开启 prompt_extend 时，单价将乘以该倍率 (默认 1.0)" style={{ marginBottom: 0 }}>
                                    <InputNumber style={{ width: '100%' }} precision={2} step={0.1} min={0} />
                                  </Form.Item>
                                </Col>
                                <Col span={6}>
                                  <Form.Item name="image_ref_multiplier" label="有图倍率" tooltip="当请求包含参考图（图生图）时，单价将乘以该倍率 (默认 1.0，不生效)" style={{ marginBottom: 0 }}>
                                    <InputNumber style={{ width: '100%' }} precision={2} step={0.1} min={0} />
                                  </Form.Item>
                                </Col>
                              </>
                            )}
                          </Row>
                        </RuleContainer>
                      );
                    }}
                  </Form.Item>
                </>
              )}

              {billingType === 'duration' && (
                <>
                  <Form.Item name="billing_rule" label="时长计费子模式配置" initialValue="standard" rules={[{ required: true, message: '请选择时长计费子模式' }]}>
                    <Radio.Group optionType="button" buttonStyle="solid">
                      <Radio value="standard">按固定时长收费 (单价/秒)</Radio>
                      <Radio value="video_resolution">按视频分辨率阶梯表</Radio>
                      <Radio value="video_quality">按视频画质及帧率阶梯表</Radio>
                      <Radio value="kling_video">可灵视频 (倍率计费)</Radio>
                      <Radio value="vidu_video">Vidu 视频</Radio>
                      <Radio value="volc_enhance_cascade">火山级联增强</Radio>
                    </Radio.Group>
                  </Form.Item>

                  <Form.Item noStyle shouldUpdate={(prev, curr) => prev.billing_rule !== curr.billing_rule}>
                    {({ getFieldValue }) => {
                      const rule = getFieldValue('billing_rule');

                      if (rule === 'video_quality') {
                        return (
                          <RuleContainer
                            isLight={_isLight}
                            title="视频画质及帧率计费阶梯配置"
                            description="匹配说明：根据任务中的输出视频分辨率短边规格、以及输出帧率（如 ≤30fps 或 >30fps）来决定秒级单价。分辨率名推荐写小写形式（如 720p, 1080p, 2k, 4k），匹配时会自动解析短边像素并判断档位。未命中的规格将自动采用已启用阶梯中的最高单价兜底。"
                          >
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
                                          <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(name)} style={{ marginLeft: 8 }} />
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
                          </RuleContainer>
                        );
                      }

                      if (rule === 'video_resolution') {
                        return (
                          <RuleContainer
                            isLight={_isLight}
                            title="视频分辨率计费组合包"
                            description="匹配说明：系统会自动忽略大小写（例如 4K 和 4k 等效），并且自动将包含星号的乘式（如 1920*1080）转换为统一 of 1920x1080 格式；若仅传递纯数字（如 1080）则会自动追加 'p' 后缀匹配 1080p。此处配置的匹配名称推荐统一写标准小写形式（如 720p, 1080p, 4k）。"
                          >
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
                                        <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(name)} />
                                      </Col>
                                    </Row>
                                  ))}
                                  <Button type="dashed" onClick={() => add({ resolution: '', rate: 0, enabled: true })} block icon={<PlusOutlined />} style={{ marginTop: 8, height: '40px' }}>
                                    增加一个视频分辨率价格档位
                                  </Button>
                                </>
                              )}
                            </Form.List>
                          </RuleContainer>
                        );
                      }

                      if (rule === 'kling_video') {
                        return (
                          <Form.Item noStyle dependencies={['kling_use_price_table', 'kling_enable_mode', 'kling_enable_sound', 'kling_enable_video_ref']}>
                            {({ getFieldValue }) => {
                              const usePT = getFieldValue('kling_use_price_table');
                              const eMode = getFieldValue('kling_enable_mode') !== false;
                              const eSound = getFieldValue('kling_enable_sound') !== false;
                              const eVideo = getFieldValue('kling_enable_video_ref') === true;

                              return (
                                <RuleContainer
                                  isLight={_isLight}
                                  title="可灵视频计费配置"
                                  extra={
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                      <Text style={{ fontSize: 12 }}>精确查表模式</Text>
                                      <Form.Item name="kling_use_price_table" valuePropName="checked" style={{ marginBottom: 0 }}>
                                        <Switch size="small" />
                                      </Form.Item>
                                    </div>
                                  }
                                  description="可灵视频按秒计费。精确查表模式下系统按 mode|sound|参考视频 组合 key 直接匹配单价；倍率模式下按 基准秒单价 × 倍率 计算。"
                                >
                                  {usePT ? (
                                    <>
                                      {/* 维度开关：控制精确价格表的维度组合 */}
                                      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 16, padding: '12px 16px', background: _isLight ? '#f5f5f5' : 'rgba(255,255,255,0.04)', borderRadius: 8 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                          <Text style={{ fontSize: 12 }}>生成模式区分计费</Text>
                                          <Form.Item name="kling_enable_mode" valuePropName="checked" style={{ margin: 0 }}>
                                            <Switch size="small" />
                                          </Form.Item>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                          <Text style={{ fontSize: 12 }}>有声/无声区分计费</Text>
                                          <Form.Item name="kling_enable_sound" valuePropName="checked" style={{ margin: 0 }}>
                                            <Switch size="small" />
                                          </Form.Item>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                          <Text style={{ fontSize: 12 }}>参考视频区分计费</Text>
                                          <Form.Item name="kling_enable_video_ref" valuePropName="checked" style={{ margin: 0 }}>
                                            <Switch size="small" />
                                          </Form.Item>
                                        </div>
                                      </div>

                                      <div style={{ padding: '12px', background: _isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
                                        <Text strong style={{ fontSize: '13px', display: 'block', marginBottom: 12 }}>精确价格表 (单价/秒)</Text>
                                        {(() => {
                                          const modes = eMode ? ['std', 'pro', '2k', '4k'] : ['std'];
                                          const sounds = eSound ? ['off', 'on'] : ['off'];
                                          const videos = eVideo ? ['no', 'yes'] : ['no'];
                                          const modeLabels: Record<string, string> = { std: '标准', pro: '高品质', '2k': '2k', '4k': '4k' };
                                          const soundLabels: Record<string, string> = { off: '无声', on: '有声' };
                                          const videoLabels: Record<string, string> = { no: '无参考视频', yes: '有参考视频' };

                                          return modes.map(m => sounds.map(s => videos.map(v => {
                                            const key = `${m}|${s}|${v}`;
                                            const dimLabels = [modeLabels[m] || m];
                                            if (eSound) dimLabels.push(soundLabels[s] || s);
                                            if (eVideo) dimLabels.push(videoLabels[v] || v);
                                            const isDisabled = klingDisabledKeys.includes(key);
                                            return (
                                              <PriceTableRow
                                                key={key}
                                                label={dimLabels.join(' / ')}
                                                value={klingPriceTable[key] ?? 0}
                                                isDisabled={isDisabled}
                                                precision={2}
                                                step={0.1}
                                                addonAfter="/秒"
                                                onChange={(val) => setKlingPriceTable(prev => ({ ...prev, [key]: val }))}
                                                onActiveChange={(checked) => setKlingDisabledKeys(prev => checked ? prev.filter(k => k !== key) : [...prev, key])}
                                              />
                                            );
                                          }))).flat(2);
                                        })()}
                                      </div>
                                    </>
                                  ) : (
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
                                  )}
                                </RuleContainer>
                              );
                            }}
                          </Form.Item>
                        );
                      }

                      if (rule === 'vidu_video') {
                        // 腾讯云 Vidu 视频精确查表
                        const viduAttrs = ['text', 'image', 'ref'];
                        const viduRes = ['480p', '720p', '1080p', '2k', '4k'];
                        const viduAttrLabels: Record<string, string> = { text: '文生视频', image: '图生视频', ref: '参考生视频' };
                        return (
                          <RuleContainer
                            isLight={_isLight}
                            title="Vidu 视频价格表"
                            description="按 属性×分辨率 组合设置每秒单价。模型版本通过绑定不同计费规则区分。错峰折扣在请求含 OutputConfig.OffPeak=Enabled 或 service_tier=flex 时自动应用。"
                          >
                            <Form.Item name="vidu_offpeak_discount" label="错峰折扣率" initialValue={0.5} style={{ marginBottom: 16 }}>
                              <InputNumber style={{ width: '200px' }} precision={2} step={0.1} min={0} max={1} addonAfter="x" />
                            </Form.Item>
                            <div style={{ padding: '12px', background: _isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
                              <Text strong style={{ fontSize: '13px', display: 'block', marginBottom: 12 }}>精确价格表 (单价/秒)</Text>
                              {viduAttrs.map(attr => viduRes.map(res => {
                                const key = `${attr}|${res}`;
                                const isDisabled = viduVideoDisabledKeys.includes(key);
                                return (
                                  <PriceTableRow
                                    key={key}
                                    label={`${viduAttrLabels[attr] || attr} / ${res}`}
                                    value={viduVideoPriceTable[key] ?? 0}
                                    isDisabled={isDisabled}
                                    step={0.01}
                                    addonAfter="/秒"
                                    onChange={(val) => setViduVideoPriceTable(prev => ({ ...prev, [key]: val }))}
                                    onActiveChange={(checked) => setViduVideoDisabledKeys(prev => checked ? prev.filter(k => k !== key) : [...prev, key])}
                                  />
                                );
                              })).flat()}
                            </div>
                          </RuleContainer>
                        );
                      }

                      if (rule === 'volc_enhance_cascade') {
                        // 仅标准版 / 极速版：由模型 Id 是否含 fast 自动选用，与请求体 version 无关
                        const volcVersions = ['fast', 'standard'];
                        const volcRes = ['720p', '1080p', '2k', '4k'];
                        const volcInputs = ['no', 'yes'];

                        const volcVersionLabels: Record<string, string> = {
                          fast: '极速版 (模型 Id 含 fast)',
                          standard: '标准版 (默认)',
                        };
                        const volcInputLabels: Record<string, string> = {
                          no: '无视频输入',
                          yes: '有视频输入'
                        };

                        return (
                          <RuleContainer
                            isLight={_isLight}
                            title="火山级联增强价格表"
                            description="按 标准/极速×分辨率×是否有视频输入 设置每秒单价。极速版对应模型 Id 含 fast，否则走标准版；无需在请求中传 version。"
                          >
                            <div style={{ padding: '12px', background: _isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
                              <Text strong style={{ fontSize: '13px', display: 'block', marginBottom: 12 }}>精确价格表 (单价/秒)</Text>
                              {volcVersions.map(ver => volcRes.map(res => volcInputs.map(input => {
                                const key = `${ver}|${res}|${input}`;
                                const isDisabled = volcCascadeDisabledKeys.includes(key);
                                return (
                                  <PriceTableRow
                                    key={key}
                                    label={`${volcVersionLabels[ver]} / ${res} / ${volcInputLabels[input]}`}
                                    value={volcCascadePriceTable[key] ?? 0}
                                    isDisabled={isDisabled}
                                    step={0.001}
                                    addonAfter="/秒"
                                    onChange={(val) => setVolcCascadePriceTable(prev => ({ ...prev, [key]: val }))}
                                    onActiveChange={(checked) => setVolcCascadeDisabledKeys(prev => checked ? prev.filter(k => k !== key) : [...prev, key])}
                                  />
                                );
                              }))).flat(2)}
                            </div>
                          </RuleContainer>
                        );
                      }

                      return (
                        <RuleContainer isLight={_isLight} title="固定时长计费配置">
                          <Form.Item name="duration_rate" label={t('models.duration_rate')} rules={[{ required: true }]} style={{ marginBottom: 0 }}>
                            <InputNumber style={{ width: '100%' }} precision={6} addonAfter="/ s" />
                          </Form.Item>
                        </RuleContainer>
                      );
                    }}
                  </Form.Item>
                </>
              )}


              {/* 全局时间段价格倍率设置 (峰谷价格) */}
              <Form.Item noStyle dependencies={[['extended_config', 'enable_time_multipliers']]}>
                {({ getFieldValue }) => {
                  const enabled = getFieldValue(['extended_config', 'enable_time_multipliers']);
                  return (
                    <RuleContainer
                      isLight={_isLight}
                      title="时间段价格倍率 (峰谷价格)"
                      extra={
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <RealTimeClock defaultTz={settings?.site?.default_timezone || 'Asia/Shanghai'} />
                          <Form.Item name={['extended_config', 'enable_time_multipliers']} valuePropName="checked" style={{ margin: 0 }}>
                            <Switch size="small" />
                          </Form.Item>
                        </div>
                      }
                      description="开启后可按时间段（支持 01:00-06:00 等非重叠时段，也支持跨天时段）设置模型费率倍率。默认倍率 1.00，例如：闲时降价设为 0.50，高峰翻倍设为 2.00。将自适应系统设定的时区计算。"
                    >
                      {enabled && (
                        <Form.List name={['extended_config', 'time_multipliers']} initialValue={[]}>
                          {(fields, { add, remove }) => (
                            <>
                              {fields.map(({ key, name: listName, ...restField }) => (
                                <Row key={key} gutter={12} align="middle" style={{ marginBottom: 12 }}>
                                  <Col span={9}>
                                    <Form.Item
                                      {...restField}
                                      name={[listName, 'start']}
                                      rules={[{ required: true, message: '选择开始时间' }]}
                                      style={{ marginBottom: 0 }}
                                    >
                                      <TimePicker
                                        placeholder="开始时间"
                                        format="HH:mm"
                                        style={{ width: '100%' }}
                                        allowClear={false}
                                      />
                                    </Form.Item>
                                  </Col>
                                  <Col span={1} style={{ textAlign: 'center' }}>
                                    <Text style={{ opacity: 0.5 }}>至</Text>
                                  </Col>
                                  <Col span={9}>
                                    <Form.Item
                                      {...restField}
                                      name={[listName, 'end']}
                                      rules={[{ required: true, message: '选择结束时间' }]}
                                      style={{ marginBottom: 0 }}
                                    >
                                      <TimePicker
                                        placeholder="结束时间"
                                        format="HH:mm"
                                        style={{ width: '100%' }}
                                        allowClear={false}
                                      />
                                    </Form.Item>
                                  </Col>
                                  <Col span={4}>
                                    <Form.Item
                                      {...restField}
                                      name={[listName, 'multiplier']}
                                      rules={[{ required: true, message: '倍率' }]}
                                      style={{ marginBottom: 0 }}
                                      initialValue={1.0}
                                    >
                                      <InputNumber
                                        placeholder="倍率"
                                        min={0}
                                        precision={2}
                                        step={0.1}
                                        style={{ width: '100%' }}
                                        addonAfter="倍"
                                      />
                                    </Form.Item>
                                  </Col>
                                  <Col span={1} style={{ textAlign: 'right' }}>
                                    <Button
                                      type="text"
                                      danger
                                      icon={<DeleteOutlined />}
                                      onClick={() => remove(listName)}
                                      size="small"
                                    />
                                  </Col>
                                </Row>
                              ))}
                              <Button
                                type="dashed"
                                onClick={() => add({ multiplier: 1.0 })}
                                block
                                icon={<PlusOutlined />}
                                style={{ marginTop: fields.length > 0 ? 8 : 0 }}
                              >
                                添加时间段价格倍率
                              </Button>
                            </>
                          )}
                        </Form.List>
                      )}
                    </RuleContainer>
                  );
                }}
              </Form.Item>

              {/* 始终启用，隐藏激活状态开关 */}

              <Form.Item style={{ marginTop: 24, textAlign: 'center' }}>
                <Space size="large">
                  <Button onClick={() => setIsModalVisible(false)}>取消</Button>
                  {editingItem?.is_system === 1 && (
                    <Button danger onClick={handleRestoreDefault}>恢复默认</Button>
                  )}
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
