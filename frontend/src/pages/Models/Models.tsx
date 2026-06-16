import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Table, Button, Space, Tag, Modal, Form, Input, InputNumber, message, Popconfirm, Card, Typography, Select, Row, Col, Switch, Grid, Radio, Empty, Pagination } from 'antd';
import MobileCardList, { MobileCard, CardRow, CardActions } from '../../components/MobileCardList';
import { PlusOutlined, EditOutlined, DeleteOutlined, SyncOutlined, SearchOutlined, RightOutlined, DownOutlined, ArrowLeftOutlined, ArrowRightOutlined, CloseOutlined, FilterOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';
import useSettingsStore from '../../store/settings';
import { type ModelModel, type ClassificationsResponse, type ModelProvider, type ModelType, type ClassificationCount } from '../../types';
import ClassificationFilter from '../../components/Models/ClassificationFilter';
import ClassificationManager from '../../components/Models/ClassificationManager';
import IconPicker from '../../components/IconPicker';
import RateDisplay from './RateDisplay';
import { useThemeStore } from '../../store/theme';
import SmartSvgIcon from '../../components/SmartSvgIcon';


const { Title, Text } = Typography;

const ResizableHeaderCell = (props: any) => {
  const { onResize, width: initialWidth, minWidth, ...restProps } = props;
  const thRef = useRef<HTMLTableCellElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!thRef.current) return;
    
    const startX = e.clientX;
    const startWidth = thRef.current.getBoundingClientRect().width;

    const doDrag = (moveEvent: MouseEvent) => {
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
      const deltaX = moveEvent.clientX - startX;
      const newWidth = Math.max(minWidth || 60, startWidth + deltaX);
      if (onResize) {
        onResize(null, { size: { width: newWidth } });
      }
    };

    const stopDrag = () => {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      document.removeEventListener('mousemove', doDrag);
      document.removeEventListener('mouseup', stopDrag);
    };

    document.addEventListener('mousemove', doDrag);
    document.addEventListener('mouseup', stopDrag);
  };

  if (!initialWidth) {
    return <th {...restProps} />;
  }

  return (
    <th 
      {...restProps} 
      ref={thRef}
      style={{ 
        ...restProps.style, 
        width: initialWidth,
        position: 'relative',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap'
      }}
    >
      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 10 }}>
        {restProps.children}
      </div>
      <div
        onMouseDown={handleMouseDown}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: 8,
          cursor: 'col-resize',
          zIndex: 100,
          userSelect: 'none'
        }}
        className="resizable-trigger"
      />
    </th>
  );
};
const { Option } = Select;
const { useBreakpoint } = Grid;

const renderModelLogo = (logo?: string | null, fallbackName?: string) => {
  if (logo) {
    return (
      <div style={{ 
        width: 32, height: 32, borderRadius: 8, 
        background: 'rgba(128,128,128,0.05)', 
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: '1px solid rgba(128,128,128,0.15)',
        flexShrink: 0
      }}>
        <SmartSvgIcon
          src={`/assets/icons/lobe/${logo}.svg`}
          alt=""
          style={{ width: 20, height: 20, objectFit: 'contain' }}
          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      </div>
    );
  }
  return (
    <div style={{ 
      width: 32, height: 32, borderRadius: 8, 
      background: 'rgba(128,128,128,0.04)', 
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      border: '1px dashed rgba(128,128,128,0.2)',
      color: 'var(--text-secondary, #8c8c8c)',
      flexShrink: 0,
      fontSize: 14,
      fontWeight: 'bold',
      textTransform: 'uppercase'
    }}>
      {(fallbackName || 'M').charAt(0)}
    </div>
  );
};

// ===== 分组展示组件 =====
const GroupedModelTable: React.FC<{
  group: { key: string; model_id: string; children: ModelModel[]; count: number };
  columns: any[];
  showHeader: boolean;
  getProviderName: (id?: number) => string | null;
  allBillingRules: any[];
  currencySymbol: string;
  t: any;
  isLight: boolean;
}> = ({ group, columns, showHeader, getProviderName, allBillingRules, currencySymbol, t, isLight }) => {
  const [expanded, setExpanded] = useState(true);


  // 汇总信息
  const providers = Array.from(new Set(group.children.map(m => getProviderName(m.provider_id)).filter(Boolean)));
  const activeCount = group.children.filter(m => m.is_active === 1).length;
  const billingNames = Array.from(new Set(
    group.children.map(m => {
      const br = allBillingRules.find(b => b.id === m.billing_rule_id);
      return br ? br.name : null;
    }).filter(Boolean)
  ));
  const firstChild = group.children[0];

  return (
    <div 
      style={{ 
        marginBottom: 16,
        borderRadius: 16,
        border: isLight ? '1px solid #d9d9d9' : '1px solid #303030',
        background: isLight ? '#ffffff' : '#141414',
        boxShadow: isLight ? '0 2px 8px rgba(0,0,0,0.04)' : '0 2px 8px rgba(0,0,0,0.2)',
        transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        transform: 'scale(1)',
        overflow: 'hidden',
        position: 'relative'
      }}
      onMouseEnter={(e) => {
        if (!expanded) {
          e.currentTarget.style.transform = 'translateY(-2px) scale(1.002)';
          e.currentTarget.style.boxShadow = isLight ? '0 12px 24px rgba(0,0,0,0.08)' : '0 12px 24px rgba(0,0,0,0.2)';
          e.currentTarget.style.borderColor = isLight ? '#d9d9d9' : '#404040';
        }
      }}
      onMouseLeave={(e) => {
        if (!expanded) {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)';
          e.currentTarget.style.borderColor = isLight ? '#d9d9d9' : '#303030';
        }
      }}
    >
      {/* Removed 侧边强调色 to reduce visual clutter */}

      {/* 组头 */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '10px 16px', cursor: 'pointer',
          background: expanded ? (isLight ? '#fafafa' : '#1a1a1a') : 'transparent',
          borderBottom: expanded ? (isLight ? '1px solid #f0f0f0' : '1px solid #303030') : '1px solid transparent',
          transition: 'all 0.3s ease',
          userSelect: 'none',
        }}
      >
        <span style={{ 
          color: expanded ? (isLight ? '#000' : '#fff') : '#8c8c8c', 
          fontSize: 14, 
          transition: 'all 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55)', 
          transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 24, height: 24, borderRadius: '50%',
          background: expanded ? (isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.1)') : 'transparent',
        }}>
          <RightOutlined />
        </span>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1, minWidth: 0 }}>
          <div style={{ 
            padding: 4, borderRadius: 12, 
            background: isLight ? '#fff' : '#141414',
            boxShadow: isLight ? '0 2px 8px rgba(0,0,0,0.06)' : '0 2px 8px rgba(0,0,0,0.2)',
            border: isLight ? '1px solid #f0f0f0' : '1px solid #303030'
          }}>
            {renderModelLogo(firstChild.logo, firstChild.name || group.model_id)}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ 
                fontFamily: 'var(--font-family, Inter, sans-serif)', 
                fontSize: 16, 
                fontWeight: 700, 
                color: 'var(--text-color, inherit)',
                letterSpacing: '-0.3px'
              }}>
                {group.model_id}
              </span>
              <span style={{
                fontSize: 12, fontWeight: 500, lineHeight: '20px',
                padding: '0 8px', borderRadius: 4,
                background: isLight ? '#f5f5f5' : '#1f1f1f', 
                color: isLight ? '#595959' : '#a6a6a6',
                border: isLight ? '1px solid #e8e8e8' : '1px solid #303030'
              }}>
                {group.count} 个变体
              </span>
            </div>

            {/* 供应商与计费概要 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary, #8c8c8c)', flexWrap: 'wrap' }}>
              {providers.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ opacity: 0.7 }}>供应商:</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {providers.slice(0, 3).map((p, i) => (
                      <span key={i} style={{ color: 'var(--text-color, inherit)', fontWeight: 500 }}>{p}{i < Math.min(providers.length, 3) - 1 ? ',' : ''}</span>
                    ))}
                    {providers.length > 3 && <span>等 {providers.length} 家</span>}
                  </div>
                </div>
              )}
              {providers.length > 0 && billingNames.length > 0 && <span style={{ opacity: 0.2, fontWeight: 300 }}>|</span>}
              {billingNames.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ opacity: 0.7 }}>计费模板:</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {billingNames.slice(0, 2).map((n, i) => (
                      <span key={i} style={{ color: 'var(--text-color, inherit)', fontWeight: 500 }}>{n}{i < Math.min(billingNames.length, 2) - 1 ? ',' : ''}</span>
                    ))}
                    {billingNames.length > 2 && <span>等</span>}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 状态 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingRight: 8 }}>
          {activeCount === group.count ? (
            <div style={{ 
              padding: '2px 8px', borderRadius: 4, fontWeight: 500, fontSize: 12,
              background: isLight ? '#f5f5f5' : '#1f1f1f', 
              color: isLight ? '#595959' : '#a6a6a6', border: isLight ? '1px solid #e8e8e8' : '1px solid #303030'
            }}>
              全部启用
            </div>
          ) : activeCount === 0 ? (
            <div style={{ 
              padding: '2px 8px', borderRadius: 4, fontWeight: 500, fontSize: 12,
              background: isLight ? '#fff' : '#141414', 
              color: isLight ? '#bfbfbf' : '#595959', border: isLight ? '1px dashed #d9d9d9' : '1px dashed #434343'
            }}>
              全部禁用
            </div>
          ) : (
            <div style={{ 
              padding: '2px 8px', borderRadius: 4, fontWeight: 500, fontSize: 12,
              background: isLight ? '#fafafa' : '#1a1a1a', 
              color: isLight ? '#8c8c8c' : '#8c8c8c', border: isLight ? '1px solid #d9d9d9' : '1px solid #434343'
            }}>
              部分启用 ({activeCount}/{group.count})
            </div>
          )}
        </div>
      </div>

      {/* 展开的子表 */}
      {expanded && (
        <div 
          className="slide-down-enter"
          style={{ 
            background: isLight ? '#fafafa' : '#0a0a0a',
            padding: '12px 0',
            boxShadow: 'inset 0 6px 12px -8px rgba(0, 0, 0, 0.1)',
            transformOrigin: 'top',
          }}
        >
          <style>{`
            @keyframes slideDownEnter {
              0% { opacity: 0; transform: translateY(-10px) scaleY(0.95); }
              100% { opacity: 1; transform: translateY(0) scaleY(1); }
            }
            .slide-down-enter {
              animation: slideDownEnter 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            }
            .expanded-model-table .ant-table {
              background: transparent !important;
            }
            .expanded-model-table .ant-table-container {
              background: transparent !important;
              border-radius: 8px;
              overflow: hidden;
            }
            .expanded-model-table .ant-table-cell {
              background: transparent;
            }

            .expanded-model-table .ant-table-tbody > tr > td {
              border-bottom: 1px solid ${isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)'} !important;
              transition: background 0.3s;
            }
            .expanded-model-table .ant-table-tbody > tr:hover > td {
              background: ${isLight ? '#ffffff' : '#1f1f1f'} !important;
              box-shadow: ${isLight ? '0 2px 8px rgba(0,0,0,0.05)' : '0 2px 8px rgba(0,0,0,0.2)'};
            }
            .expanded-model-table .ant-table-tbody > tr:last-child > td {
              border-bottom: none !important;
            }
          `}</style>
          <Table
            className="expanded-model-table compact-table"
            dataSource={group.children}
            columns={columns}
            rowKey="id"
            size="small"
            pagination={false}
            showHeader={false}
            tableLayout="fixed"
            style={{ marginBottom: 0 }}
          />
        </div>
      )}
    </div>
  );
};

const FeatureTagsSelect = ({ value = [], onChange, options = [] }: any) => {
  const [inputValue, setInputValue] = useState('');
  
  const toggleOption = (opt: string) => {
    const next = value.includes(opt) ? value.filter((v: string) => v !== opt) : [...value, opt];
    onChange?.(next);
  };
  
  const handleAddCustom = (e: any) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      e.preventDefault();
      const newTag = inputValue.trim();
      if (!value.includes(newTag)) {
        onChange?.([...value, newTag]);
      }
      setInputValue('');
    }
  };

  const removeCustom = (opt: string) => {
    onChange?.(value.filter((v: string) => v !== opt));
  };

  const customTags = value.filter((v: string) => !options.includes(v));

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {options.map((opt: string) => (
        <Tag.CheckableTag 
          key={opt}
          checked={value.includes(opt)} 
          onChange={() => toggleOption(opt)}
          style={{ 
            border: '1px solid', 
            borderColor: value.includes(opt) ? 'transparent' : 'var(--border-color, rgba(128,128,128,0.2))', 
            padding: '4px 12px', 
            fontSize: 13,
            lineHeight: '22px'
          }}
        >
          {opt}
        </Tag.CheckableTag>
      ))}
      {customTags.map((opt: string) => (
        <Tag 
          key={opt} 
          closable 
          onClose={(e) => { e.preventDefault(); removeCustom(opt); }}
          color="blue"
          style={{ padding: '4px 12px', fontSize: 13, border: 'none', lineHeight: '22px' }}
        >
          {opt}
        </Tag>
      ))}
      <Input 
        size="small" 
        style={{ width: 140, height: 32, borderRadius: 6 }} 
        placeholder="+ 自定义并回车" 
        value={inputValue}
        onChange={e => setInputValue(e.target.value)}
        onKeyDown={handleAddCustom}
      />
    </div>
  );
};

const Models: React.FC = () => {
  const { t, i18n } = useTranslation();
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const isEn = i18n.language === 'en';
  const { settings } = useSettingsStore();
  const { themeMode } = useThemeStore();
  const isLight = themeMode === 'light';
  const currencySymbol = settings?.currency?.currency_symbol || '$';
  const auxiliaryCurrencies = useMemo(() => {
    return (settings?.currency?.auxiliary_currencies || []).filter((c: any) => c.enabled);
  }, [settings?.currency?.auxiliary_currencies]);
  const [selectedCurrencyCode, setSelectedCurrencyCode] = useState<string>('');
  const [models, setModels] = useState<ModelModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingModel, setEditingModel] = useState<ModelModel | null>(null);
  const [billingType, setBillingType] = useState('tokens');
  const [saving, setSaving] = useState(false);
  const [aliasEnabled, setAliasEnabled] = useState(false);  // 模型ID别名映射开关（本地UI状态）
  const [form] = Form.useForm();
  const screens = useBreakpoint();

  // Classification State
  const [classStats, setClassStats] = useState<ClassificationsResponse>({ providers: [], types: [] });
  const [allProviders, setAllProviders] = useState<any[]>([]);
  const [allApiProviders, setAllApiProviders] = useState<any[]>([]);
  const [allTypes, setAllTypes] = useState<any[]>([]);
  const [providersStats, setProvidersStats] = useState<any[]>([]);
  const [apiProvidersStats, setApiProvidersStats] = useState<any[]>([]);
  const [typesStats, setTypesStats] = useState<any[]>([]);
  const [allForwardRules, setAllForwardRules] = useState<any[]>([]);
  const [allBillingRules, setAllBillingRules] = useState<any[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<number | null>(null);
  const [selectedApiProvider, setSelectedApiProvider] = useState<number | null>(null);
  const [selectedType, setSelectedType] = useState<number | null>(null);
  const [isProviderManagerVisible, setIsProviderManagerVisible] = useState(false);
  const [isApiProviderManagerVisible, setIsApiProviderManagerVisible] = useState(false);
  const [isTypeManagerVisible, setIsTypeManagerVisible] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  type ActiveRightPanel = 'billing' | 'forwarding' | 'provider' | 'api_provider' | 'type' | 'billing_rule' | 'forward_rules';
  const [activeRightPanel, setActiveRightPanel] = useState<ActiveRightPanel | null>('provider');
  const [billingTypeFilter, setBillingTypeFilter] = useState<string>('all');
  const [billingSearchKeyword, setBillingSearchKeyword] = useState<string>('');
  const [forwardRuleSearchKeyword, setForwardRuleSearchKeyword] = useState<string>('');
  const [sortType, setSortType] = useState<string>('time_desc');
  const [tableBillingTypeFilter, setTableBillingTypeFilter] = useState<string>('all');
  const [tableStatusFilter, setTableStatusFilter] = useState<string>('all');

  const fetchModels = async () => {
    setLoading(true);
    try {
      const params: any = {
        provider_id: selectedProvider,
        api_provider_id: selectedApiProvider,
        type_id: selectedType,
      };
      if (searchKeyword.trim()) {
        params.search = searchKeyword.trim();
      }
      const resp = await (request.get('/models', { params }) as unknown as Promise<{ data: ModelModel[] }>);
      setModels(resp.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchClassificationsStats = async (searchTerm = '') => {
    try {
      let url = `/classifications/stats?search=${encodeURIComponent(searchTerm)}`;
      if (selectedProvider) url += `&provider_id=${selectedProvider}`;
      if (selectedApiProvider) url += `&api_provider_id=${selectedApiProvider}`;
      if (selectedType) url += `&type_id=${selectedType}`;
      const resp = await (request.get(url) as any);
      setProvidersStats(resp.providers || []);
      setApiProvidersStats(resp.api_providers || []);
      setTypesStats(resp.types || []);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchAllClassifications = async () => {
    try {
      const [provResp, apiProvResp, typeResp, rules, brs] = await Promise.all([
        request.get('/model-providers') as Promise<any>,
        request.get('/model-api-providers') as Promise<any>,
        request.get('/model-types') as Promise<any>,
        request.get('/forward-rules') as Promise<any>,
        request.get('/billing-rules') as Promise<any>
      ]);
      setAllProviders((provResp as any[]).filter((p: any) => p.is_active));
      setAllApiProviders((apiProvResp as any[]).filter((p: any) => p.is_active));
      setAllTypes((typeResp as any[]).filter((t: any) => t.is_active));
      setAllForwardRules((rules as any[]).filter((r: any) => r.is_active));
      setAllBillingRules((brs as any[]).filter((b: any) => b.is_active === 1));
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchModels();
    fetchClassificationsStats();
    setCurrentPage(1);
  }, [selectedProvider, selectedApiProvider, selectedType, searchKeyword]);

  useEffect(() => {
    fetchClassificationsStats();
    fetchAllClassifications();
  }, []);


  const formatPrice = (price: number | string | undefined | null) => {
    if (price === undefined || price === null || price === '') return '-';
    const num = Number(price);
    if (isNaN(num)) return String(price);
    if (selectedCurrencyCode === '') {
      return `${currencySymbol}${num}`;
    }
    const curr = auxiliaryCurrencies.find(c => c.code === selectedCurrencyCode);
    if (curr) {
      return `${curr.symbol}${(num * curr.exchange_rate).toFixed(6).replace(/\\.?0+$/, '')}`;
    }
    return `${currencySymbol}${num}`;
  };

  const handleAdd = () => {
    setEditingModel(null);
    setBillingType('tokens');
    setSaving(false);
    setAliasEnabled(false);
    form.resetFields();
    setIsModalVisible(true);
  };

  const handleEdit = (record: ModelModel) => {
    setEditingModel(record);
    setBillingType('tokens');
    setSaving(false);

    let ruleIds: number[] = [];
    try {
      if (record.forward_rule_ids) {
        const parsed = JSON.parse(record.forward_rule_ids);
        // 过滤掉已删除/禁用的规则 ID，消除脏数据
        ruleIds = Array.isArray(parsed) ? parsed.filter((id: number) => allForwardRules.some(r => r.id === id)) : [];
      }
    } catch (e) { }

    let featureAttributes: string[] = [];
    try {
      if (record.feature_attributes) {
        featureAttributes = JSON.parse(record.feature_attributes);
      }
    } catch (e) { }

    form.setFieldsValue({
      ...record,
      forward_rule_ids: ruleIds,
      feature_attributes: featureAttributes,
      is_active: record.is_active === 1,
      enable_log_content: record.enable_log_content === 1,
      site_discount_enabled: record.site_discount_enabled === 1,
      site_discount: record.site_discount ?? 1.0,
      global_discount_enabled: record.global_discount_enabled === 1,
      global_discount: record.global_discount ?? 1.0,
      logo: record.logo || undefined,
      remark: record.remark,
      description: record.description,
    });
    setAliasEnabled(!!(record.model_id_alias && record.model_id_alias.length > 0));
    setIsModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await request.delete(`/models/${id}`);
      message.success(t('common.success'));
      fetchModels();
      fetchClassificationsStats();
      fetchAllClassifications();
    } catch (e) {
      console.error(e);
    }
  };

  const handleSave = async (values: any) => {
    try {
      // Cleanup arrays internally managed
      values.is_active = values.is_active ? 1 : 0;
      values.enable_log_content = values.enable_log_content ? 1 : 0;
      values.site_discount_enabled = values.site_discount_enabled ? 1 : 0;
      values.global_discount_enabled = values.global_discount_enabled ? 1 : 0;
      values.feature_attributes = JSON.stringify(values.feature_attributes || []);
      // 模型ID别名映射：开关关闭时清空值
      if (!aliasEnabled) {
        values.model_id_alias = '';
      }

      const br = allBillingRules.find(b => b.id === values.billing_rule_id);

      if (editingModel) {
        await request.put(`/models/${editingModel.id}`, values);
      } else {
        await request.post('/models', values);
      }
      message.success(t('common.success'));
      setIsModalVisible(false);
      fetchModels();
      fetchClassificationsStats();
      fetchAllClassifications();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateRemark = async (id: number, remark: string) => {
    // 乐观更新：本地状态立刻变更，达到瞬时生效且页面绝无闪烁的绝佳体验
    setModels(prev => prev.map(m => m.id === id ? { ...m, remark } : m));
    try {
      await request.put(`/models/${id}`, { remark });
    } catch (e) {
      console.error(e);
      message.error(t('common.error') || '保存备注失败');
      fetchModels(); // 失败时强制同步最新数据回滚
    }
  };

  const getProviderName = (id?: number) => {
    const p = providersStats.find(p => p.id === id);
    return p ? (isEn && p.name_en ? p.name_en : p.name) : null;
  };

  const getApiProviderName = (id?: number) => {
    const p = apiProvidersStats.find(p => p.id === id);
    return p ? (isEn && p.name_en ? p.name_en : p.name) : null;
  };

  const getTypeName = (id?: number) => {
    const t = typesStats.find(t => t.id === id);
    return t ? (isEn && t.name_en ? t.name_en : t.name) : null;
  };

  const [colWidths] = useState<number[]>([120, 320, 340, 180, 260, 100, 100]);
  const currentWidthsRef = useRef([...colWidths]);

  const handleResize = useMemo(() => {
    let animationFrameId: number | null = null;
    return (index: number, newWidth: number) => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
      animationFrameId = requestAnimationFrame(() => {
        const minWidth = index === 0 ? 60 : index === 5 ? 60 : 80;
        const validWidth = Math.max(minWidth, newWidth);
        
        currentWidthsRef.current[index] = validWidth;
        const total = currentWidthsRef.current.reduce((a, b) => a + b, 0);

        if (tableContainerRef.current) {
          tableContainerRef.current.style.setProperty(`--col-width-${index}`, `${validWidth}px`);
          tableContainerRef.current.style.setProperty('--table-scroll-x', `${total}px`);
        }
      });
    };
  }, []);

  const tableComponents = useMemo(() => ({
    header: {
      cell: ResizableHeaderCell,
    },
  }), []);

  // ===== PC端鼠标左键按下拖拽滚动表格功能 =====
  useEffect(() => {
    const container = tableContainerRef.current;
    if (!container) return;

    let isDown = false;
    let startX: number;
    let scrollLeft: number;

    const handleMouseDown = (e: MouseEvent) => {
      // 避开可操作性子项（按钮、表单、复制图标、下拉菜单、拉伸触碰区、备注编辑按钮等）
      const target = e.target as HTMLElement;
      if (
        target.closest('button') || 
        target.closest('a') || 
        target.closest('input') || 
        target.closest('textarea') ||
        target.closest('.ant-typography-copy') ||
        target.closest('.resizable-trigger') ||
        target.closest('.ant-select') ||
        target.closest('.ant-table-filter-trigger') ||
        target.closest('.ant-typography-edit') ||
        target.closest('.ant-typography-editable-single-line') ||
        target.closest('.ant-switch') ||
        window.getSelection()?.toString()
      ) {
        return;
      }

      isDown = true;
      startX = e.pageX - container.offsetLeft;
      scrollLeft = container.scrollLeft;
    };

    const handleMouseLeave = () => {
      isDown = false;
    };

    const handleMouseUp = () => {
      isDown = false;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - container.offsetLeft;
      const walk = (x - startX) * 1.5; // 滚动速度倍率
      container.scrollLeft = scrollLeft - walk;
    };

    container.addEventListener('mousedown', handleMouseDown);
    container.addEventListener('mouseleave', handleMouseLeave);
    container.addEventListener('mouseup', handleMouseUp);
    container.addEventListener('mousemove', handleMouseMove);

    return () => {
      container.removeEventListener('mousedown', handleMouseDown);
      container.removeEventListener('mouseleave', handleMouseLeave);
      container.removeEventListener('mouseup', handleMouseUp);
      container.removeEventListener('mousemove', handleMouseMove);
    };
  }, [loading]);

  const columns = [
    {
      title: '模型(MID)',
      dataIndex: 'mid',
      key: 'mid',
      width: 120,
      render: (text: string, record: ModelModel) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontFamily: 'monospace', fontSize: 12, lineHeight: 1.2, color: 'var(--text-secondary, #8c8c8c)' }}>{text || '-'}</span>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Text
              type="secondary"
              style={{ fontSize: 12, maxWidth: 80, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}
              title={record.remark}
              editable={{
                tooltip: false,
                text: record.remark || '',
                onChange: (val) => handleUpdateRemark(record.id, val),
              }}
            >
              {record.remark || <span style={{ opacity: 0.5 }}>添加备注</span>}
            </Text>
          </div>
        </div>
      ),
    },
    {
      title: t('models.model_name'),
      dataIndex: 'name',
      key: 'name',
      width: 320,
      filterDropdown: ({ setSelectedKeys, confirm }: any) => (
        <div style={{ padding: 8 }}>
          <Radio.Group 
            onChange={(e) => {
              setSortType(e.target.value);
              setSelectedKeys([e.target.value]);
              confirm();
            }} 
            value={sortType}
            style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
          >
            <Radio value="time_desc">按添加时间 (最新)</Radio>
            <Radio value="time_asc">按添加时间 (最早)</Radio>
            <Radio value="name_asc">按名称 (A-Z)</Radio>
            <Radio value="name_desc">按名称 (Z-A)</Radio>
          </Radio.Group>
        </div>
      ),
      filterIcon: () => (
        <FilterOutlined style={{ color: sortType !== 'time_desc' ? '#1677ff' : undefined }} />
      ),
      render: (text: string, record: ModelModel) => {
        const providerName = record.provider_id ? getProviderName(record.provider_id) : null;
        const apiProviderName = record.api_provider_id ? getApiProviderName(record.api_provider_id) : null;
        const typeName = record.type_id ? getTypeName(record.type_id) : null;
        const parts = [providerName, apiProviderName, typeName].filter(Boolean);

        return (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            {renderModelLogo(record.logo, text || record.model_id)}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
              <span 
                title={text}
                style={{ fontWeight: 600, color: 'var(--text-color, inherit)', fontSize: 13, lineHeight: 1.2, wordBreak: 'break-all' }}
              >
                {text}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, lineHeight: 1.2, color: 'var(--text-secondary, #8c8c8c)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {parts.map((part, idx) => (
                  <React.Fragment key={idx}>
                    {idx > 0 && <span style={{ opacity: 0.3 }}>•</span>}
                    <span>{part}</span>
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      title: t('models.model_id'),
      dataIndex: 'model_id',
      key: 'model_id',
      width: 340,
      render: (text: string, record: ModelModel) => {
        let rules: { name: string; eid?: string }[] = [];
        try {
          if (record.forward_rule_ids) {
            const ruleIds = JSON.parse(record.forward_rule_ids);
            if (Array.isArray(ruleIds)) {
              rules = ruleIds.map((id: number) => {
                const r = allForwardRules.find(rule => rule.id === id);
                return r ? { name: r.name, eid: r.eid } : null;
              }).filter(Boolean) as { name: string; eid?: string }[];
            }
          }
        } catch (e) { }

        return (
          <Space direction="vertical" size={2} style={{ display: 'flex', width: '100%', overflow: 'hidden' }}>
            <div style={{ display: 'block', width: '100%', wordBreak: 'break-all', whiteSpace: 'normal' }}>
              <Text 
                className="monochrome-copy" 
                copyable={{ text: text }} 
                style={{ 
                  fontFamily: 'var(--font-family, Inter, sans-serif)', 
                  fontSize: 13, 
                  lineHeight: 1.2, 
                  color: 'var(--text-color, inherit)',
                  wordBreak: 'break-all',
                  whiteSpace: 'normal',
                  display: 'inline'
                }}
              >
                {text}
              </Text>
            </div>
            {rules.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, width: '100%' }}>
                {rules.map((rule, idx) => (
                  <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 2, width: '100%' }}>
                    <div style={{ 
                      display: 'flex', alignItems: 'center', fontSize: 11, lineHeight: 1.2, color: 'var(--text-secondary, #595959)', 
                      width: 'fit-content', maxWidth: '100%'
                    }}>
                      <span style={{ flexShrink: 0 }}>已挂载: </span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: '0 4px' }} title={rule.name}>
                        {rule.name}
                      </span>
                    </div>
                    {rule.eid && (
                      <div style={{ fontSize: 11, lineHeight: 1.2, color: 'var(--text-secondary, #8c8c8c)' }}>
                        EID: <span style={{ fontFamily: 'monospace' }}>{rule.eid}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {record.model_id_alias && (
              <div style={{ fontSize: 11, lineHeight: 1.2, color: 'var(--text-secondary, #8c8c8c)' }}>
                别名: <span style={{ fontFamily: 'monospace' }}>{record.model_id_alias}</span>
              </div>
            )}
          </Space>
        );
      },
    },
    {
      title: t('models.billing_type'),
      key: 'billing_type',
      width: 180,
      filterDropdown: ({ setSelectedKeys, confirm }: any) => (
        <div style={{ padding: 8 }}>
          <Radio.Group 
            onChange={(e) => {
              setTableBillingTypeFilter(e.target.value);
              setSelectedKeys([e.target.value]);
              confirm();
            }} 
            value={tableBillingTypeFilter}
            style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
          >
            <Radio value="all">全部</Radio>
            <Radio value="tokens">按量 (Tokens)</Radio>
            <Radio value="requests">按次 (Requests)</Radio>
            <Radio value="duration">按时 (Duration)</Radio>
          </Radio.Group>
        </div>
      ),
      filterIcon: () => (
        <FilterOutlined style={{ color: tableBillingTypeFilter !== 'all' ? '#1677ff' : undefined }} />
      ),
      render: (_: any, record: ModelModel) => {
        const br = allBillingRules.find(b => b.id === record.billing_rule_id);
        const type = br ? br.billing_type : 'tokens';
        return (
          <Space direction="vertical" size={0}>
            <span style={{ fontSize: '11px', lineHeight: 1.2, margin: 0, color: 'var(--text-secondary, #595959)' }}>{t(`models.type_${type}`)}</span>
            {br && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                <Text type="secondary" style={{ fontSize: '11px', lineHeight: 1.2 }}>{br.name}</Text>
                {br.pid && <Text type="secondary" style={{ fontSize: '11px', lineHeight: 1.2 }}>PID: {br.pid}</Text>}
              </div>
            )}
          </Space>
        );
      },
    },
    {
      title: t('models.rates'),
      key: 'rates',
      width: 260,
      render: (_: any, record: ModelModel) => {
        const br = allBillingRules.find((b: any) => b.id === record.billing_rule_id);
        if (!br) return <Text type="secondary" italic>未挂载费用模板</Text>;
        return (
          <Space direction="vertical" size={0}>
            <RateDisplay rule={br} currencySymbol={currencySymbol} formatPrice={formatPrice} />
            {(record.pre_deduction ?? 0) > 0 && <Text style={{ fontSize: '11px', lineHeight: 1.2, color: 'var(--text-secondary, #8c8c8c)' }}>预扣: {formatPrice(record.pre_deduction)}</Text>}
            {record.site_discount_enabled === 1 && (
              <span style={{ fontSize: '10px', marginTop: 0, lineHeight: 1.2, color: 'var(--text-secondary, #595959)' }}>
                {`折扣限价 ${Number(record.site_discount || 1).toFixed(2)} 倍率`}
              </span>
            )}
            {record.global_discount_enabled === 1 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, padding: '0 4px', borderRadius: 3, fontSize: 10, background: 'rgba(114, 46, 209, 0.08)', color: '#722ed1', border: '1px solid rgba(114, 46, 209, 0.2)', lineHeight: '16px' }}>
                {`全站折扣 ${Number(record.global_discount || 1).toFixed(2)} 倍率`}
              </span>
            )}
          </Space>
        );
      }
    },
    {
      title: t('common.status'),
      dataIndex: 'is_active',
      key: 'is_active',
      width: 100,
      filterDropdown: ({ setSelectedKeys, confirm }: any) => (
        <div style={{ padding: 8 }}>
          <Radio.Group 
            onChange={(e) => {
              setTableStatusFilter(e.target.value);
              setSelectedKeys([e.target.value]);
              confirm();
            }} 
            value={tableStatusFilter}
            style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
          >
            <Radio value="all">全部</Radio>
            <Radio value="active">已启用</Radio>
            <Radio value="disabled">已禁用</Radio>
          </Radio.Group>
        </div>
      ),
      filterIcon: () => (
        <FilterOutlined style={{ color: tableStatusFilter !== 'all' ? '#1677ff' : undefined }} />
      ),
      render: (active: boolean) => (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '2px 6px', borderRadius: 4, fontSize: 12,
          background: active ? 'rgba(128,128,128,0.06)' : 'transparent',
          color: active ? 'var(--text-color, inherit)' : '#8c8c8c',
          border: active ? '1px solid rgba(128,128,128,0.15)' : '1px dashed rgba(128,128,128,0.3)'
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: active ? '#8c8c8c' : 'transparent', border: active ? 'none' : '1px solid #8c8c8c' }} />
          {active ? t('common.active') : t('common.disabled')}
        </span>
      ),
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 100,
      render: (_: unknown, record: ModelModel) => (
        <Space size={4}>
          <Button icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          <Popconfirm title={t('common.confirm_delete')} onConfirm={() => handleDelete(record.id)}>
            <Button icon={<DeleteOutlined />} danger />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const resizableColumns = useMemo(() => {
    return columns.map((col: any, idx) => {
      const minWidth = idx === 0 ? 60 : idx === 5 ? 60 : 80;
      const colClassName = `col-idx-${idx}`;
      const existingClassName = col.className || '';
      const combinedClassName = existingClassName ? `${existingClassName} ${colClassName}` : colClassName;

      const baseCol = {
        ...col,
        className: combinedClassName,
        width: `var(--col-width-${idx}, ${colWidths[idx]}px)` as any,
        onCell: () => ({
          className: combinedClassName,
        }),
      };

      if (col.key === 'actions') {
        return baseCol;
      }
      return {
        ...baseCol,
        onHeaderCell: (column: any) => ({
          width: colWidths[idx],
          minWidth,
          className: combinedClassName,
          onResize: (e: any, { size }: any) => handleResize(idx, size.width),
        }),
      };
    });
  }, [colWidths, columns, handleResize]);

  const sortedModels = useMemo(() => {
    let list = [...models];

    if (tableBillingTypeFilter !== 'all') {
      list = list.filter(m => {
        const br = allBillingRules.find(b => b.id === m.billing_rule_id);
        const type = br ? br.billing_type : 'tokens';
        return type === tableBillingTypeFilter;
      });
    }

    if (tableStatusFilter !== 'all') {
      const active = tableStatusFilter === 'active' ? 1 : 0;
      list = list.filter(m => m.is_active === active);
    }

    list.sort((a, b) => {
      if (sortType === 'name_asc') {
        return (a.name || '').localeCompare(b.name || '');
      } else if (sortType === 'name_desc') {
        return (b.name || '').localeCompare(a.name || '');
      } else if (sortType === 'time_asc') {
        return a.id - b.id;
      } else if (sortType === 'time_desc') {
        return b.id - a.id;
      }
      return 0;
    });
    return list;
  }, [models, sortType, tableBillingTypeFilter, tableStatusFilter, allBillingRules]);

  // ===== 扁平模型分页切片 =====
  const pagedModels = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return sortedModels.slice(startIndex, startIndex + pageSize);
  }, [sortedModels, currentPage, pageSize]);

  // ===== 按 original_id / model_id 分组逻辑 =====
  const displayGroups = useMemo(() => {
    const map = new Map<string, ModelModel[]>();
    const order: string[] = [];
    pagedModels.forEach(m => {
      const key = m.original_id || m.model_id || `__no_id_${m.id}`;
      if (!map.has(key)) {
        order.push(key);
        map.set(key, []);
      }
      map.get(key)!.push(m);
    });
    const groupedData = order.map(key => ({
      key,
      model_id: key.startsWith('__no_id_') ? '' : key,
      children: map.get(key)!,
      count: map.get(key)!.length,
    }));

    const result: any[] = [];
    let currentSingles: any[] = [];
    groupedData.forEach(g => {
      if (g.count === 1) {
        currentSingles.push(g.children[0]);
      } else {
        if (currentSingles.length > 0) {
          result.push({ type: 'singles', children: currentSingles });
          currentSingles = [];
        }
        result.push({ type: 'group', ...g });
      }
    });
    if (currentSingles.length > 0) {
      result.push({ type: 'singles', children: currentSingles });
    }
    return result;
  }, [pagedModels]);

  useEffect(() => {
    setCurrentPage(1);
  }, [tableBillingTypeFilter, tableStatusFilter]);

  // 防御性校准：当数据被删除或过滤导致总页数变小，且 currentPage 大于最大页数时，自动校准页码
  useEffect(() => {
    const maxPage = Math.ceil(sortedModels.length / pageSize);
    if (maxPage > 0 && currentPage > maxPage) {
      setCurrentPage(maxPage);
    }
  }, [sortedModels.length, pageSize, currentPage]);

  return (
    <Card variant="borderless" style={{ width: '100%', minWidth: 0 }}>
      <style>{`
        .monochrome-copy .ant-typography-copy {
          color: var(--text-secondary, #8c8c8c) !important;
          transition: color 0.3s;
        }
        .monochrome-copy .ant-typography-copy:hover {
          color: ${isLight ? '#262626' : '#d9d9d9'} !important;
        }
        .header-only-table .ant-table-tbody {
          display: none !important;
        }
        .header-only-table .ant-table-placeholder {
          display: none !important;
        }
        
        /* 让 table 总是充满 100% 宽度，但通过 min-width 强制阻挡在各列最小拉伸宽度之和 */
        .compact-table .ant-table table {
          width: 100% !important;
          min-width: var(--table-scroll-x, 1420px) !important;
          table-layout: fixed !important;
        }
        
        /* 强制每一列的宽度使用对应的 CSS 变量，确保即使内容较长也会被剪切/折行，而非撑开 */
        .compact-table .col-idx-0 {
          width: var(--col-width-0, 120px) !important;
          min-width: var(--col-width-0, 120px) !important;
          max-width: var(--col-width-0, 120px) !important;
          overflow: hidden !important;
        }
        .compact-table .col-idx-1 {
          width: var(--col-width-1, 320px) !important;
          min-width: var(--col-width-1, 320px) !important;
          /* 不设 max-width 限制，使其可在宽屏自适应平摊多余宽度 */
          overflow: hidden !important;
        }
        .compact-table .col-idx-2 {
          width: var(--col-width-2, 340px) !important;
          min-width: var(--col-width-2, 340px) !important;
          /* 不设 max-width 限制，使其可在宽屏自适应平摊多余宽度 */
          overflow: hidden !important;
        }
        .compact-table .col-idx-3 {
          width: var(--col-width-3, 180px) !important;
          min-width: var(--col-width-3, 180px) !important;
          max-width: var(--col-width-3, 180px) !important;
          overflow: hidden !important;
        }
        .compact-table .col-idx-4 {
          width: var(--col-width-4, 260px) !important;
          min-width: var(--col-width-4, 260px) !important;
          max-width: var(--col-width-4, 260px) !important;
          overflow: hidden !important;
        }
        .compact-table .col-idx-5 {
          width: var(--col-width-5, 100px) !important;
          min-width: var(--col-width-5, 100px) !important;
          max-width: var(--col-width-5, 100px) !important;
          overflow: hidden !important;
        }
        .compact-table .col-idx-6 {
          width: var(--col-width-6, 100px) !important;
          min-width: var(--col-width-6, 100px) !important;
          max-width: var(--col-width-6, 100px) !important;
        }
        

        
        /* 拖拽指示条 hover 高亮效果：只显示单条右侧蓝色竖线，解决双竖线显示冗余问题 */
        .resizable-trigger {
          transition: background-color 0.2s;
        }
        /* 针对 PC 端滚动容器，强制美化并永久显现水平滚动条 */
        .table-scroll-container::-webkit-scrollbar {
          height: 8px !important;
          background-color: transparent;
        }
        .table-scroll-container::-webkit-scrollbar-thumb {
          background-color: ${isLight ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.18)'} !important;
          border-radius: 4px !important;
        }
        .table-scroll-container::-webkit-scrollbar-thumb:hover {
          background-color: ${isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)'} !important;
        }
        .table-scroll-container::-webkit-scrollbar-track {
          background-color: transparent;
        }
      `}</style>
      {!isModalVisible ? (
        <>
        <div style={{ display: 'flex', flexDirection: screens.xs ? 'column' : 'row', justifyContent: 'space-between', marginBottom: 12, gap: 12 }}>
          <Title level={screens.xs ? 4 : 2} style={{ margin: 0 }}>{t('models.title')}</Title>
          <Space wrap>
            <Input
              prefix={<SearchOutlined />}
              placeholder="搜索模型名 / Model ID / MID"
              allowClear
              value={searchKeyword}
              onChange={e => setSearchKeyword(e.target.value)}
              style={{ width: 240 }}
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
            <Button icon={<SyncOutlined />} onClick={() => { fetchModels(); fetchClassificationsStats(); fetchAllClassifications(); }}>{t('common.refresh')}</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>{t('models.add_model')}</Button>
          </Space>
        </div>

      <ClassificationFilter
        providers={providersStats}
        apiProviders={apiProvidersStats}
        types={typesStats}
        selectedProvider={selectedProvider}
        selectedApiProvider={selectedApiProvider}
        selectedType={selectedType}
        onProviderChange={setSelectedProvider}
        onApiProviderChange={setSelectedApiProvider}
        onTypeChange={setSelectedType}
        onManageProviders={() => setIsProviderManagerVisible(true)}
        onManageApiProviders={() => setIsApiProviderManagerVisible(true)}
        onManageTypes={() => setIsTypeManagerVisible(true)}
      />

      {screens.xs ? (
        <MobileCardList
          dataSource={pagedModels}
          loading={loading}
          rowKey="id"
          pagination={{
            current: currentPage,
            pageSize: pageSize,
            total: sortedModels.length,
            onChange: (page, size) => {
              setCurrentPage(page);
              setPageSize(size);
            },
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '30', '50', '100'],
            showTotal: (total) => `共 ${total} 个模型`,
          }}
          renderCard={(record: any) => {
            const br = allBillingRules.find((b: any) => b.id === record.billing_rule_id);
            const billingTypeVal = br ? br.billing_type : 'tokens';
            const colors: Record<string, string> = { tokens: 'cyan', requests: 'orange', duration: 'purple' };
            return (
              <MobileCard
                title={
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {record.logo && (
                      <SmartSvgIcon src={`/assets/icons/lobe/${record.logo}.svg`} alt="" style={{ width: 24, height: 24, objectFit: 'contain', borderRadius: 4 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    )}
                    <div>
                      <Text strong>{record.name}</Text>
                      <div style={{ marginTop: 4 }}>
                        {record.provider_id && <Tag color="default" style={{ fontSize: 10 }}>{getProviderName(record.provider_id)}</Tag>}
                        {record.type_id && <Tag color="blue" style={{ fontSize: 10 }}>{getTypeName(record.type_id)}</Tag>}
                      </div>
                    </div>
                  </div>
                }
                extra={<Tag color={record.is_active ? 'success' : 'error'}>{record.is_active ? t('common.active') : t('common.disabled')}</Tag>}
              >
                <CardRow label="模型(MID)">
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                    <Tag color="purple" style={{ fontFamily: 'monospace', fontSize: 11, margin: 0, marginLeft: -7 }}>{record.mid || '-'}</Tag>
                    <div style={{ display: 'flex', alignItems: 'center', marginLeft: 1 }}>
                      <Text
                        type="secondary"
                        style={{ fontSize: 11 }}
                        editable={{
                          tooltip: false,
                          text: record.remark || '',
                          onChange: (val) => handleUpdateRemark(record.id, val),
                        }}
                      >
                        {record.remark}
                      </Text>
                    </div>
                  </div>
                </CardRow>
                <CardRow label="模型ID">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
                      <Tag color="blue" style={{ fontSize: 11, width: 'fit-content', maxWidth: '100%', margin: 0, whiteSpace: 'normal', wordBreak: 'break-all' }}>{record.model_id}</Tag>
                      {record.model_id_alias && (
                        <Text style={{ fontSize: 11, color: 'var(--text-secondary, #8c8c8c)' }}>({record.model_id_alias})</Text>
                      )}
                    </div>
                    {(() => {
                      let rules: { name: string; eid?: string }[] = [];
                      try {
                        if (record.forward_rule_ids) {
                          const ruleIds = JSON.parse(record.forward_rule_ids);
                          if (Array.isArray(ruleIds)) {
                            rules = ruleIds.map((id: number) => {
                              const r = allForwardRules.find(rule => rule.id === id);
                              return r ? { name: r.name, eid: r.eid } : null;
                            }).filter(Boolean) as { name: string; eid?: string }[];
                          }
                        }
                      } catch (e) { }
                      if (rules.length > 0) {
                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {rules.map((rule, idx) => (
                              <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <div style={{ fontSize: 11, color: '#1677ff' }}>已挂载: {rule.name}</div>
                                {rule.eid && (
                                  <div style={{ fontSize: 11, color: 'var(--text-secondary, #8c8c8c)' }}>
                                    EID: <span style={{ fontFamily: 'monospace' }}>{rule.eid}</span>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                </CardRow>
                <CardRow label="计费类型">
                  <Space direction="vertical" size={4}>
                    <Tag color={colors[billingTypeVal]} style={{ margin: 0 }}>{t(`models.type_${billingTypeVal}`)}</Tag>
                    {br && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <Text type="secondary" style={{ fontSize: 11 }}>{br.name}</Text>
                        {br.pid && <Text type="secondary" style={{ fontSize: 11 }}>PID: {br.pid}</Text>}
                      </div>
                    )}
                  </Space>
                </CardRow>
                <CardRow label="费率">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {br ? <RateDisplay rule={br} currencySymbol={currencySymbol} formatPrice={formatPrice} /> : <Text type="secondary" italic>未挂载</Text>}
                    {record.site_discount_enabled === 1 && (
                      <div>
                        <Tag color="volcano" bordered={false} style={{ fontSize: '10px', margin: 0, padding: '0 4px', lineHeight: '16px' }}>
                          {`折扣限价 ${Number(record.site_discount || 1).toFixed(2)} 倍率`}
                        </Tag>
                      </div>
                    )}
                    {record.global_discount_enabled === 1 && (
                      <div>
                        <Tag color="purple" bordered={false} style={{ fontSize: '10px', margin: 0, padding: '0 4px', lineHeight: '16px' }}>
                          {`全站折扣 ${Number(record.global_discount || 1).toFixed(2)} 倍率`}
                        </Tag>
                      </div>
                    )}
                  </div>
                </CardRow>
                {(record.pre_deduction ?? 0) > 0 && (
                  <CardRow label="预扣"><Text style={{ fontSize: 11, color: '#faad14' }}>{formatPrice(record.pre_deduction)}</Text></CardRow>
                )}
                <CardActions>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', minWidth: 0 }}>
          <div 
            ref={tableContainerRef}
            className="table-scroll-container"
            style={{ 
              width: '100%', 
              maxWidth: '100%',
              overflowX: 'auto',
              '--col-width-0': `${currentWidthsRef.current[0]}px`,
              '--col-width-1': `${currentWidthsRef.current[1]}px`,
              '--col-width-2': `${currentWidthsRef.current[2]}px`,
              '--col-width-3': `${currentWidthsRef.current[3]}px`,
              '--col-width-4': `${currentWidthsRef.current[4]}px`,
              '--col-width-5': `${currentWidthsRef.current[5]}px`,
              '--col-width-6': `${currentWidthsRef.current[6]}px`,
              '--table-scroll-x': `${currentWidthsRef.current.reduce((a, b) => a + b, 0)}px`
            } as React.CSSProperties}
          >
            <div style={{ minWidth: 'var(--table-scroll-x, 1200px)', display: 'flex', flexDirection: 'column', gap: 0 }}>
              {loading ? (
                <Table className="compact-table" dataSource={[]} columns={resizableColumns} loading rowKey="id" tableLayout="fixed" />
              ) : displayGroups.length === 0 ? (
                <Table className="compact-table" dataSource={[]} columns={resizableColumns} rowKey="id" tableLayout="fixed" />
              ) : (
                <>
                  {displayGroups.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <Table
                        className="compact-table header-only-table"
                        dataSource={[]}
                        columns={resizableColumns}
                        components={tableComponents}
                        rowKey="id"
                        size="small"
                        tableLayout="fixed"
                        pagination={false}
                        style={{ marginBottom: 0 }}
                      />
                    </div>
                  )}
                  {displayGroups.map((item, index) => {
                    if (item.type === 'singles') {
                      return (
                        <div
                          key={`singles-${index}`}
                          style={{
                            marginBottom: 12,
                          }}
                        >
                          <Table
                            className="compact-table"
                            dataSource={item.children}
                            columns={resizableColumns}
                            rowKey="id"
                            size="small"
                            pagination={false}
                            showHeader={false}
                            tableLayout="fixed"
                            style={{ marginBottom: 0 }}
                          />
                        </div>
                      );
                    }
                    // 多个相同 model_id 的模型分组展示
                    return (
                      <GroupedModelTable
                        key={item.key}
                        group={item}
                        columns={resizableColumns}
                        showHeader={false}
                        getProviderName={getProviderName}
                        allBillingRules={allBillingRules}
                        currencySymbol={currencySymbol}
                        t={t}
                        isLight={isLight}
                      />
                    );
                  })}
                </>
              )}
            </div>
          </div>
          
          {!loading && sortedModels.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 8px' }}>
              <Pagination
                current={currentPage}
                pageSize={pageSize}
                total={sortedModels.length}
                onChange={(page, size) => {
                  setCurrentPage(page);
                  setPageSize(size);
                }}
                showSizeChanger
                pageSizeOptions={['10', '20', '30', '50', '100']}
                showTotal={(total) => `共 ${total} 个模型`}
                 size={screens.xs ? 'small' : undefined}
              />
            </div>
          )}
        </div>
      )}
      </>
      ) : (
        <div style={{ animation: 'fadeIn 0.3s' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <Button icon={<ArrowLeftOutlined />} onClick={() => setIsModalVisible(false)}>返回</Button>
              <Title level={3} style={{ margin: 0 }}>
                {editingModel ? t('models.edit_model') : t('models.add_model')}
              </Title>
            </div>
            <Space>
              <Button onClick={() => setIsModalVisible(false)}>取消</Button>
              <Button
                type="primary"
                loading={saving}
                onClick={() => {
                  if (saving) return;
                  setSaving(true);
                  form.submit();
                }}
              >
                保存模型
              </Button>
            </Space>
          </div>
          <div style={{ width: '100%' }}>
            <Form form={form} layout="vertical" onFinish={handleSave} onFinishFailed={() => setSaving(false)} initialValues={{ is_active: true, enable_log_content: 0, pre_deduction: 0 }}>
              {/* Hidden inputs to preserve form data for the custom fields */}
              <Form.Item name="provider_id" hidden><Input /></Form.Item>
              <Form.Item name="api_provider_id" hidden><Input /></Form.Item>
              <Form.Item name="type_id" hidden rules={[{ required: true, message: '请选择模型类型' }]}><Input /></Form.Item>
              <Form.Item name="billing_rule_id" hidden rules={[{ required: true }]}><Input /></Form.Item>
              <Form.Item name="forward_rule_ids" hidden><Input /></Form.Item>

              <Row gutter={24}>
                {/* 左侧基本配置栏 */}
                <Col xs={24} md={10} xl={10}>
                  <div style={{ padding: 16, background: isLight ? '#f9fafb' : 'rgba(255,255,255,0.04)', borderRadius: 8, height: 'calc(100vh - 220px)', overflowY: 'auto' }}>
                    <Form.Item name="name" label={<Text strong>{t('models.model_name')}</Text>} rules={[{ required: true }]} style={{ marginBottom: 12 }}>
                      <Input placeholder="e.g. GPT-4o" />
                    </Form.Item>
                    
                    <Form.Item name="model_id" label={<Text strong>{t('models.model_id')}(模型请求ID)</Text>} rules={[{ required: true }]} style={{ marginBottom: 12 }}>
                      <Input placeholder="e.g. gpt-4o" />
                    </Form.Item>

                    {/* 模型ID别名映射 */}
                    <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border-color, #f0f0f0)', background: isLight ? '#fafafa' : 'rgba(255,255,255,0.02)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: aliasEnabled ? 8 : 0 }}>
                        <Text style={{ fontSize: 13 }}>模型ID别名映射</Text>
                        <Switch size="small" checked={aliasEnabled} onChange={(checked) => { setAliasEnabled(checked); if (!checked) form.setFieldsValue({ model_id_alias: '' }); }} />
                      </div>
                      {aliasEnabled && (
                        <>
                          <Form.Item name="model_id_alias" style={{ marginBottom: 4 }}>
                            <Input placeholder="填写真实的上游模型ID，如 Kling@3.0" />
                          </Form.Item>
                          <div style={{ fontSize: 11, color: 'var(--text-secondary, #8c8c8c)' }}>
                            渠道的模型映射优先级最高。只有渠道未设置映射时，才会使用此处的模型别名。
                          </div>
                        </>
                      )}
                    </div>
                    
                    <Form.Item name="original_id" label={<Text strong>模型原始ID(把所有的相同的模型合并显示)</Text>} style={{ marginBottom: 12 }} extra={<span style={{ fontSize: 11, color: 'var(--text-secondary, #8c8c8c)' }}>如果不填，默认使用模型请求ID合并。</span>}>
                      <Input placeholder="e.g. gpt-4o" />
                    </Form.Item>
                    
                    <Form.Item noStyle shouldUpdate={(prevValues, currentValues) => prevValues.model_id !== currentValues.model_id || prevValues.original_id !== currentValues.original_id}>
                      {({ getFieldValue }) => {
                        if (editingModel) return null;
                        const currentModelId = getFieldValue('model_id');
                        const currentOriginalId = getFieldValue('original_id');
                        const targetId = currentOriginalId || currentModelId;
                        if (targetId) {
                          const existingCount = models.filter(m => (m.original_id || m.model_id) === targetId).length;
                          if (existingCount > 0) {
                            return (
                              <div style={{ marginTop: -8, marginBottom: 12, padding: '6px 10px', borderRadius: 6, background: 'rgba(22,119,255,0.08)', border: '1px solid rgba(22,119,255,0.2)', fontSize: 12, color: '#1677ff' }}>
                                💡 该ID ({targetId}) 已有 {existingCount} 个模型，新模型将在模型广场中与其自动归为同组显示。
                              </div>
                            );
                          }
                        }
                        return null;
                      }}
                    </Form.Item>

                    <Form.Item name="logo" label={<Text strong>模型 Logo</Text>} style={{ marginBottom: 12 }}>
                      <IconPicker
                        value={form.getFieldValue('logo')}
                        onChange={(icon) => form.setFieldsValue({ logo: icon?.name || undefined })}
                        placeholder="选择模型图标"
                      />
                    </Form.Item>

                    <Form.Item name="description" label={<Text strong>模型简介</Text>} style={{ marginBottom: 12 }}>
                      <Input.TextArea placeholder="模型简介，可以在前台展示给用户" rows={1} />
                    </Form.Item>

                    <Form.Item name="remark" label={<Text strong>内部备注</Text>} style={{ marginBottom: 12 }}>
                      <Input.TextArea placeholder="内部备注信息，仅管理员可见" rows={1} />
                    </Form.Item>



                    <div style={{ marginBottom: 16 }}>
                      <Text strong style={{ display: 'block', marginBottom: 8 }}>关联设置</Text>
                      
                      {/* Provider */}
                      <Form.Item shouldUpdate={(prev, cur) => prev.provider_id !== cur.provider_id} noStyle>
                        {() => {
                          const val = form.getFieldValue('provider_id');
                          const provider = allProviders.find(p => p.id === val);
                          const isActive = activeRightPanel === 'provider';
                          return (
                            <div onClick={() => setActiveRightPanel('provider')} style={{ padding: '8px 12px', borderRadius: 6, marginBottom: 6, border: isActive ? '1px solid var(--text)' : (isLight ? '1px solid #e5e4e7' : '1px solid rgba(255,255,255,0.08)'), background: isActive ? (isLight ? '#f9fafb' : 'rgba(255,255,255,0.04)') : (isLight ? '#fff' : 'rgba(255,255,255,0.02)'), cursor: 'pointer', transition: 'all 0.2s' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Text strong={isActive} style={{ color: isActive ? 'var(--text)' : 'inherit' }}>官方服务商</Text>
                                <span style={{ fontSize: 13, color: isActive ? 'var(--text)' : 'var(--text-secondary)' }}>
                                  {provider ? (isEn && provider.name_en ? provider.name_en : provider.name) : <span style={{ opacity: 0.5 }}>点击选择</span>} <ArrowRightOutlined style={{ marginLeft: 4 }} />
                                </span>
                              </div>
                            </div>
                          );
                        }}
                      </Form.Item>

                        {/* API 服务商选择 */}
                        <Form.Item shouldUpdate={(prev, cur) => prev.api_provider_id !== cur.api_provider_id} noStyle>
                          {() => {
                            const val = form.getFieldValue('api_provider_id');
                            const isActive = activeRightPanel === 'api_provider';
                            const apiProvider = allApiProviders.find(p => p.id === val);
                            return (
                              <div onClick={() => setActiveRightPanel('api_provider')} style={{ padding: '8px 12px', borderRadius: 6, marginBottom: 6, border: isActive ? '1px solid var(--text)' : (isLight ? '1px solid #e5e4e7' : '1px solid rgba(255,255,255,0.08)'), background: isActive ? (isLight ? '#f9fafb' : 'rgba(255,255,255,0.04)') : (isLight ? '#fff' : 'rgba(255,255,255,0.02)'), cursor: 'pointer', transition: 'all 0.2s' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Text strong={isActive} style={{ color: isActive ? 'var(--text)' : 'inherit' }}>API服务商</Text>
                                  <span style={{ fontSize: 13, color: isActive ? 'var(--text)' : 'var(--text-secondary)' }}>
                                    {apiProvider ? (isEn && apiProvider.name_en ? apiProvider.name_en : apiProvider.name) : <span style={{ opacity: 0.5 }}>点击选择</span>} <ArrowRightOutlined style={{ marginLeft: 4 }} />
                                  </span>
                                </div>
                              </div>
                            );
                          }}
                        </Form.Item>

                      {/* Type */}
                      <Form.Item shouldUpdate={(prev, cur) => prev.type_id !== cur.type_id} noStyle>
                        {() => {
                          const val = form.getFieldValue('type_id');
                          const type = allTypes.find(p => p.id === val);
                          const isActive = activeRightPanel === 'type';
                          return (
                            <div onClick={() => setActiveRightPanel('type')} style={{ padding: '8px 12px', borderRadius: 6, marginBottom: 6, border: isActive ? '1px solid var(--text)' : (isLight ? '1px solid #e5e4e7' : '1px solid rgba(255,255,255,0.08)'), background: isActive ? (isLight ? '#f9fafb' : 'rgba(255,255,255,0.04)') : (isLight ? '#fff' : 'rgba(255,255,255,0.02)'), cursor: 'pointer', transition: 'all 0.2s' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Text strong={isActive} style={{ color: isActive ? 'var(--text)' : 'inherit' }}>
                                  <span style={{ color: '#ff4d4f', marginRight: 4, fontFamily: 'SimSun, sans-serif' }}>*</span>模型类型
                                </Text>
                                <span style={{ fontSize: 13, color: isActive ? 'var(--text)' : 'var(--text-secondary)' }}>
                                  {type ? (isEn && type.name_en ? type.name_en : type.name) : <span style={{ opacity: 0.5 }}>点击选择</span>} <ArrowRightOutlined style={{ marginLeft: 4 }} />
                                </span>
                              </div>
                            </div>
                          );
                        }}
                      </Form.Item>

                      {/* Billing Rule */}
                      <Form.Item shouldUpdate={(prev, cur) => prev.billing_rule_id !== cur.billing_rule_id} noStyle>
                        {() => {
                          const val = form.getFieldValue('billing_rule_id');
                          const br = allBillingRules.find(p => p.id === val);
                          const isActive = activeRightPanel === 'billing_rule';
                          return (
                            <div onClick={() => setActiveRightPanel('billing_rule')} style={{ padding: '8px 12px', borderRadius: 6, marginBottom: 6, border: isActive ? '1px solid var(--text)' : (isLight ? '1px solid #e5e4e7' : '1px solid rgba(255,255,255,0.08)'), background: isActive ? (isLight ? '#f9fafb' : 'rgba(255,255,255,0.04)') : (isLight ? '#fff' : 'rgba(255,255,255,0.02)'), cursor: 'pointer', transition: 'all 0.2s' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Text strong={isActive} style={{ color: isActive ? 'var(--text)' : 'inherit' }}>
                                  <span style={{ color: '#ff4d4f', marginRight: 4, fontFamily: 'SimSun, sans-serif' }}>*</span>计费模板
                                </Text>
                                <span style={{ fontSize: 13, color: isActive ? 'var(--text)' : 'var(--text-secondary)' }}>
                                  {br ? br.name : <span style={{ opacity: 0.5 }}>点击选择</span>} <ArrowRightOutlined style={{ marginLeft: 4 }} />
                                </span>
                              </div>
                            </div>
                          );
                        }}
                      </Form.Item>

                      {/* Forward Rules */}
                      <Form.Item shouldUpdate={(prev, cur) => prev.forward_rule_ids !== cur.forward_rule_ids} noStyle>
                        {() => {
                          const val = form.getFieldValue('forward_rule_ids') || [];
                          const isActive = activeRightPanel === 'forward_rules';
                          return (
                            <div onClick={() => setActiveRightPanel('forward_rules')} style={{ padding: '8px 12px', borderRadius: 6, marginBottom: 6, border: isActive ? '1px solid var(--text)' : (isLight ? '1px solid #e5e4e7' : '1px solid rgba(255,255,255,0.08)'), background: isActive ? (isLight ? '#f9fafb' : 'rgba(255,255,255,0.04)') : (isLight ? '#fff' : 'rgba(255,255,255,0.02)'), cursor: 'pointer', transition: 'all 0.2s' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Text strong={isActive} style={{ color: isActive ? 'var(--text)' : 'inherit' }}>转发规则组合包</Text>
                                <span style={{ fontSize: 13, color: isActive ? 'var(--text)' : 'var(--text-secondary)' }}>
                                  {val.length > 0 ? `已选 ${val.length} 个` : <span style={{ opacity: 0.5 }}>点击选择</span>} <ArrowRightOutlined style={{ marginLeft: 4 }} />
                                </span>
                              </div>
                            </div>
                          );
                        }}
                      </Form.Item>
                    </div>

                    <Row gutter={16}>
                       <Col span={12}>
                           <Form.Item name="pre_deduction" label={<Text strong>{`预扣费 (${settings?.currency?.default_currency || 'USD'})`}</Text>} initialValue={0.0}>
                              <InputNumber style={{ width: '100%' }} precision={6} min={0} />
                           </Form.Item>
                       </Col>
                       <Col span={12}>
                           <Form.Item name="is_active" label={<Text strong>{t('common.status')}</Text>} valuePropName="checked" initialValue={true}>
                              <Switch />
                           </Form.Item>
                       </Col>
                       <Col span={12}>
                           <Form.Item name="enable_log_content" label={<Text strong>记录上下文</Text>} valuePropName="checked" initialValue={false}>
                              <Switch />
                           </Form.Item>
                       </Col>
                       <Col span={12}>
                           <Form.Item name="site_discount_enabled" label={<Text strong>折扣限价</Text>} valuePropName="checked" initialValue={false}>
                              <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                           </Form.Item>
                       </Col>
                    </Row>

                    <Form.Item noStyle shouldUpdate={(prev: any, cur: any) => prev.site_discount_enabled !== cur.site_discount_enabled}>
                      {({ getFieldValue }: any) => getFieldValue('site_discount_enabled') ? (
                        <Form.Item name="site_discount" label={<Text strong>折扣限价倍率</Text>} initialValue={1.0} extra="系统取 MIN(用户模型折扣, 全站折扣, 等级折扣) 最低值后，与此限价取 MAX 保底，保证折扣不低于此值">
                          <InputNumber style={{ width: '100%' }} precision={2} step={0.1} min={0.01} />
                        </Form.Item>
                      ) : null}
                    </Form.Item>

                    <Row gutter={16}>
                       <Col span={12}>
                           <Form.Item name="global_discount_enabled" label={<Text strong>全站折扣</Text>} valuePropName="checked" initialValue={false}>
                              <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                           </Form.Item>
                       </Col>
                    </Row>

                    <Form.Item noStyle shouldUpdate={(prev: any, cur: any) => prev.global_discount_enabled !== cur.global_discount_enabled || prev.site_discount_enabled !== cur.site_discount_enabled || prev.site_discount !== cur.site_discount}>
                      {({ getFieldValue }: any) => {
                        if (!getFieldValue('global_discount_enabled')) return null;
                        const siteEnabled = getFieldValue('site_discount_enabled');
                        const siteDiscount = getFieldValue('site_discount') ?? 1.0;
                        return (
                          <Form.Item
                            name="global_discount"
                            label={<Text strong>全站折扣倍率</Text>}
                            initialValue={1.0}
                            dependencies={['site_discount', 'site_discount_enabled']}
                            extra="开启后所有用户使用此模型时参与折扣比较。系统取 MIN(用户模型折扣, 全站折扣, 等级折扣) 最低值，若开启折扣限价则 MAX(最低折扣, 限价) 保底"
                            rules={siteEnabled ? [{
                              validator: (_: any, value: number) =>
                                value != null && value < siteDiscount
                                  ? Promise.reject(`全站折扣 ${value} 低于折扣限价 ${siteDiscount}，设置后将被限价覆盖，请调整`)
                                  : Promise.resolve(),
                            }] : []}
                          >
                            <InputNumber style={{ width: '100%' }} precision={2} step={0.1} min={0.01} />
                          </Form.Item>
                        );
                      }}
                    </Form.Item>
                    
                  </div>
                </Col>

                {/* 右侧交互选择栏 */}
                <Col xs={24} md={14} xl={14}>
                  <div style={{ padding: '24px', background: isLight ? '#f9fafb' : 'rgba(255,255,255,0.02)', borderRadius: 8, height: 'calc(100vh - 220px)', overflowY: 'auto', border: isLight ? '1px solid #e5e4e7' : '1px solid rgba(255,255,255,0.05)' }}>
                    <Form.Item shouldUpdate noStyle>
                      {() => {
                        if (activeRightPanel === 'provider') {
                          return (
                            <div style={{ animation: 'fadeIn 0.2s' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                <Title level={4} style={{ margin: 0 }}>选择官方服务商</Title>
                                <Button type="dashed" size="small" onClick={() => setIsProviderManagerVisible(true)}>管理官方服务商</Button>
                              </div>
                              <Row gutter={[12, 12]}>
                                <Col span={8}>
                                  <div 
                                    onClick={() => form.setFieldsValue({ provider_id: null })}
                                    style={{ padding: '10px', borderRadius: 8, cursor: 'pointer', border: !form.getFieldValue('provider_id') ? '2px solid #1677ff' : (isLight ? '1px solid #e5e4e7' : '1px solid #303030'), background: !form.getFieldValue('provider_id') ? 'rgba(22,119,255,0.05)' : (isLight ? '#fff' : '#141414'), display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 68, transition: 'all 0.2s' }}
                                  >
                                    <span style={{ fontWeight: !form.getFieldValue('provider_id') ? 600 : 400, color: 'var(--text-secondary)' }}>清除选择</span>
                                  </div>
                                </Col>
                                {allProviders.map(p => {
                                  const selected = form.getFieldValue('provider_id') === p.id;
                                  return (
                                    <Col span={8} key={p.id}>
                                      <div 
                                        onClick={() => form.setFieldsValue({ provider_id: p.id })}
                                        style={{ padding: '10px', borderRadius: 8, cursor: 'pointer', border: selected ? '2px solid #1677ff' : (isLight ? '1px solid #e5e4e7' : '1px solid #303030'), background: selected ? 'rgba(22,119,255,0.05)' : (isLight ? '#fff' : '#141414'), display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 68, gap: 8, transition: 'all 0.2s' }}
                                      >
                                        {p.logo ? <SmartSvgIcon src={`/assets/icons/lobe/${p.logo}.svg`} alt="" style={{ width: 24, height: 24, objectFit: 'contain' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} /> : <div style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(128,128,128,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{(p.name_en || p.name).charAt(0)}</div>}
                                        <span style={{ fontWeight: selected ? 600 : 400, fontSize: 13, textAlign: 'center', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(isEn && p.name_en) ? p.name_en : p.name}</span>
                                      </div>
                                    </Col>
                                  );
                                })}
                              </Row>
                            </div>
                          );
                        }


                        if (activeRightPanel === 'api_provider') {
                          return (
                            <div style={{ animation: 'fadeIn 0.2s' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                <Title level={4} style={{ margin: 0 }}>选择API服务商</Title>
                                <Button type="dashed" size="small" onClick={() => setIsApiProviderManagerVisible(true)}>管理API服务商</Button>
                              </div>
                              <Row gutter={[12, 12]}>
                                <Col span={8}>
                                  <div
                                    onClick={() => form.setFieldsValue({ api_provider_id: null })}
                                    style={{ border: form.getFieldValue('api_provider_id') === null ? '2px solid var(--text)' : (isLight ? '1px solid #d9d9d9' : '1px solid rgba(255,255,255,0.1)'), borderRadius: 8, padding: '10px', cursor: 'pointer', background: form.getFieldValue('api_provider_id') === null ? (isLight ? '#f9fafb' : 'rgba(255,255,255,0.04)') : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 48, transition: 'all 0.2s' }}
                                  >
                                    <div style={{ textAlign: 'center' }}>
                                      <CloseOutlined style={{ fontSize: 16, color: 'var(--text-secondary)', marginBottom: 4 }} />
                                      <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>清除选择</div>
                                    </div>
                                  </div>
                                </Col>
                                {allApiProviders.map(p => {
                                  const selected = form.getFieldValue('api_provider_id') === p.id;
                                  return (
                                    <Col span={8} key={p.id}>
                                      <div
                                        onClick={() => form.setFieldsValue({ api_provider_id: p.id })}
                                        style={{ border: selected ? '2px solid var(--text)' : (isLight ? '1px solid #d9d9d9' : '1px solid rgba(255,255,255,0.1)'), borderRadius: 8, padding: '10px 12px', cursor: 'pointer', background: selected ? (isLight ? '#f9fafb' : 'rgba(255,255,255,0.04)') : 'transparent', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 8, height: '100%' }}
                                      >
                                        {p.logo && (
                                          <SmartSvgIcon src={`/assets/icons/lobe/${p.logo}.svg`} alt="" style={{ width: 20, height: 20, objectFit: 'contain' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                        )}
                                        <div style={{ fontSize: 13, fontWeight: selected ? 600 : 400, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                          {isEn && p.name_en ? p.name_en : p.name}
                                        </div>
                                      </div>
                                    </Col>
                                  );
                                })}
                              </Row>
                            </div>
                          );
                        }

                        if (activeRightPanel === 'type') {
                          return (
                            <div style={{ animation: 'fadeIn 0.2s' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                <Title level={4} style={{ margin: 0 }}>选择模型类型</Title>
                                <Button type="dashed" size="small" onClick={() => setIsTypeManagerVisible(true)}>管理类型</Button>
                              </div>
                              <Row gutter={[12, 12]}>
                                {allTypes.map(t => {
                                  const selected = form.getFieldValue('type_id') === t.id;
                                  return (
                                    <Col span={8} key={t.id}>
                                      <div 
                                        onClick={() => {
                                          if (form.getFieldValue('type_id') !== t.id) {
                                            form.setFieldsValue({ type_id: t.id, feature_attributes: [] });
                                          }
                                        }}
                                        style={{ padding: '10px', borderRadius: 8, cursor: 'pointer', border: selected ? '2px solid #1677ff' : (isLight ? '1px solid #e5e4e7' : '1px solid #303030'), background: selected ? 'rgba(22,119,255,0.05)' : (isLight ? '#fff' : '#141414'), display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.2s' }}
                                      >
                                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: selected ? '#1677ff' : (isLight ? '#d9d9d9' : '#434343') }} />
                                        <span style={{ fontWeight: selected ? 600 : 400, fontSize: 14 }}>{(isEn && t.name_en) ? t.name_en : t.name}</span>
                                      </div>
                                    </Col>
                                  );
                                })}
                              </Row>

                              {/* 二级功能属性选择 */}
                              <Form.Item noStyle shouldUpdate={(prev, cur) => prev.type_id !== cur.type_id}>
                                {({ getFieldValue }) => {
                                  const typeId = getFieldValue('type_id');
                                  if (!typeId) return null; // 只有选择了类型才显示

                                  const typeObj = allTypes.find(t => t.id === typeId);
                                  let options: {label: string, value: string}[] = [];
                                  
                                  if (typeObj && typeObj.default_features) {
                                    try {
                                      const defaultFeatures = JSON.parse(typeObj.default_features);
                                      if (Array.isArray(defaultFeatures)) {
                                        options = defaultFeatures.map(v => ({ label: v, value: v }));
                                      }
                                    } catch (e) {
                                      console.error("Failed to parse default_features:", e);
                                    }
                                  }
                                  return (
                                    <div style={{ marginTop: 24, padding: '16px', background: isLight ? '#fff' : 'rgba(255,255,255,0.02)', borderRadius: 8, border: isLight ? '1px solid #e5e4e7' : '1px solid #303030' }}>
                                      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Text strong>二级功能属性选择</Text>
                                        <Text type="secondary" style={{ fontSize: 12 }}>支持自定义输入添加</Text>
                                      </div>
                                      <Form.Item name="feature_attributes" style={{ marginBottom: 0 }}>
                                        <FeatureTagsSelect options={options.map(o => o.value)} />
                                      </Form.Item>
                                    </div>
                                  );
                                }}
                              </Form.Item>

                            </div>
                          );
                        }

                        if (activeRightPanel === 'billing_rule') {
                          const filteredBillingRules = allBillingRules.filter(b => {
                            const matchType = billingTypeFilter === 'all' || b.billing_type === billingTypeFilter;
                            const matchKeyword = !billingSearchKeyword || b.name.toLowerCase().includes(billingSearchKeyword.toLowerCase());
                            return matchType && matchKeyword;
                          });

                          return (
                            <div style={{ animation: 'fadeIn 0.2s' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                <Title level={4} style={{ margin: 0 }}>选择计费基础定价模板</Title>
                                <Input 
                                  placeholder="搜索模板名称..." 
                                  prefix={<SearchOutlined style={{ color: 'var(--text-secondary)' }} />} 
                                  style={{ width: 180 }} 
                                  value={billingSearchKeyword}
                                  onChange={e => setBillingSearchKeyword(e.target.value)}
                                  allowClear
                                />
                              </div>
                              <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                                <span style={{ color: 'var(--text-secondary)' }}>
                                  <span style={{ color: '#ff4d4f', marginRight: 4, fontFamily: 'SimSun, sans-serif' }}>*</span>计费类型
                                </span>
                                <Radio.Group 
                                  value={billingTypeFilter} 
                                  onChange={e => setBillingTypeFilter(e.target.value)} 
                                  buttonStyle="solid"
                                >
                                  <Radio.Button value="all">全部</Radio.Button>
                                  <Radio.Button value="tokens">按Token计费</Radio.Button>
                                  <Radio.Button value="requests">按次计费</Radio.Button>
                                  <Radio.Button value="duration">按时长计费</Radio.Button>
                                </Radio.Group>
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {filteredBillingRules.length > 0 ? filteredBillingRules.map(b => {
                                  const selected = form.getFieldValue('billing_rule_id') === b.id;
                                  return (
                                    <div 
                                      key={b.id}
                                      onClick={() => form.setFieldsValue({ billing_rule_id: b.id })}
                                      style={{ padding: '12px 16px', borderRadius: 8, cursor: 'pointer', border: selected ? '2px solid #1677ff' : (isLight ? '1px solid #e5e4e7' : '1px solid #303030'), background: selected ? 'rgba(22,119,255,0.05)' : (isLight ? '#fff' : '#141414'), display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'all 0.2s' }}
                                    >
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, overflow: 'hidden' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                          <span style={{ fontWeight: selected ? 600 : 500, fontSize: 15, color: selected ? '#1677ff' : 'inherit' }}>{b.name}</span>
                                          {b.pid && <Tag color="blue" bordered={false} style={{ margin: 0, fontSize: 10, padding: '0 4px', lineHeight: '18px' }}>PID: {b.pid}</Tag>}
                                          <Tag color={b.billing_type === 'tokens' ? 'green' : (b.billing_type === 'requests' ? 'orange' : 'purple')} bordered={false} style={{ margin: 0, fontSize: 10, padding: '0 4px', lineHeight: '18px' }}>
                                            {b.billing_type === 'tokens' ? '按Token' : (b.billing_type === 'requests' ? '按次' : '按时长')}
                                          </Tag>
                                        </div>
                                        <div style={{ background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)', padding: '6px 10px', borderRadius: 6 }}>
                                          <RateDisplay rule={b} currencySymbol={currencySymbol} formatPrice={formatPrice} />
                                        </div>
                                      </div>
                                      <div style={{ width: 18, height: 18, borderRadius: '50%', border: selected ? '5px solid #1677ff' : '1px solid #d9d9d9', background: selected ? '#fff' : 'transparent', transition: 'all 0.2s', flexShrink: 0, marginLeft: 16 }} />
                                    </div>
                                  );
                                }) : <Empty description="未找到匹配的计费模板" style={{ margin: '40px 0' }} />}
                              </div>
                            </div>
                          );
                        }

                        if (activeRightPanel === 'forward_rules') {
                          const val = form.getFieldValue('forward_rule_ids') || [];
                          const filteredForwardRules = allForwardRules.filter(r => {
                            if (!forwardRuleSearchKeyword) return true;
                            const keyword = forwardRuleSearchKeyword.toLowerCase();
                            return r.name.toLowerCase().includes(keyword) || (r.eid && String(r.eid).toLowerCase().includes(keyword));
                          });

                          return (
                            <div style={{ animation: 'fadeIn 0.2s' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                <Title level={4} style={{ margin: 0 }}>挂载转发规则组合</Title>
                                <Input 
                                  placeholder="搜索名称或 EID..." 
                                  prefix={<SearchOutlined style={{ color: 'var(--text-secondary)' }} />} 
                                  style={{ width: 180 }} 
                                  value={forwardRuleSearchKeyword}
                                  onChange={e => setForwardRuleSearchKeyword(e.target.value)}
                                  allowClear
                                />
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {filteredForwardRules.length > 0 ? filteredForwardRules.map(r => {
                                  const isSelected = val.includes(r.id);
                                  return (
                                    <div 
                                      key={r.id}
                                      onClick={() => {
                                        const newVal = isSelected ? val.filter((id: number) => id !== r.id) : [...val, r.id];
                                        form.setFieldsValue({ forward_rule_ids: newVal });
                                      }}
                                      style={{ padding: '10px 16px', borderRadius: 8, cursor: 'pointer', border: isSelected ? '2px solid #1677ff' : (isLight ? '1px solid #e5e4e7' : '1px solid #303030'), background: isSelected ? 'rgba(22,119,255,0.05)' : (isLight ? '#fff' : '#141414'), display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'all 0.2s' }}
                                    >
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                        <span style={{ fontWeight: isSelected ? 600 : 500, fontSize: 15, color: isSelected ? '#1677ff' : 'inherit' }}>{r.name}</span>
                                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>EID: {r.eid || '-'} | 规则类型: {r.rule_type}</span>
                                      </div>
                                      <div style={{ width: 18, height: 18, borderRadius: 4, background: isSelected ? '#1677ff' : 'transparent', border: isSelected ? 'none' : '1px solid #d9d9d9', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
                                        {isSelected && <span style={{ color: '#fff', fontSize: 12 }}>✓</span>}
                                      </div>
                                    </div>
                                  );
                                }) : <Empty description="未找到匹配的转发规则" style={{ margin: '40px 0' }} />}
                              </div>
                            </div>
                          );
                        }


                        return (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)' }}>
                            <Space direction="vertical" align="center" size={16}>
                              <div style={{ fontSize: 48, opacity: 0.2 }}>👈</div>
                              <span>请在左侧点击配置项，以在此处查看更多选项</span>
                            </Space>
                          </div>
                        );
                      }}
                    </Form.Item>
                  </div>
                </Col>
              </Row>
            </Form>
          </div>
      </div>
      )}

      <ClassificationManager
        type="api_provider"
        visible={isApiProviderManagerVisible}
        onClose={() => setIsApiProviderManagerVisible(false)}
        onUpdate={() => {
          fetchAllClassifications();
          fetchClassificationsStats();
        }}
      />

      <ClassificationManager
        type="provider"
        visible={isProviderManagerVisible}
        onClose={() => setIsProviderManagerVisible(false)}
        onUpdate={() => {
          fetchAllClassifications();
          fetchClassificationsStats();
        }}
      />
      
      <ClassificationManager
        type="type"
        visible={isTypeManagerVisible}
        onClose={() => setIsTypeManagerVisible(false)}
        onUpdate={() => {
          fetchAllClassifications();
          fetchClassificationsStats();
        }}
      />
    </Card>
  );
};

export default Models;
