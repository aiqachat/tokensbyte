/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * ModelSelector — 公共模型选择器组件（自加载数据）
 *
 * 功能：自动加载模型/服务商/类型数据、搜索、按官方服务商/API服务商/类型筛选、全选/清空、卡片式多选
 * 复用场景：渠道编辑页（选择模型）、用户编辑页（模型折扣设置）
 *
 * Props:
 *   - selectedMids: 已选模型的 mid 数组
 *   - onSelectionChange: 选中模型变更回调
 *   - onModelsLoaded: 模型数据加载完成回调（可选，父组件需要模型信息时使用）
 *   - allowDuplicateModelId: 是否允许同一 model_id 的多个 mid 同时选中
 *     - false（默认）: 渠道模式，同一 model_id 只能选一个 mid
 *     - true: 用户折扣模式，同一 model_id 的不同 mid 可独立选择
 *   - isLightTheme: 当前是否亮色主题
 *   - title: 自定义标题（默认"选择模型"）
 *
 * 修改记录：
 *   - 2026-05-22: 从 Channels.tsx 提炼为独立公共组件，支持 allowDuplicateModelId 模式
 *   - 2026-05-22: 新增 API 服务商筛选，标题与模型列表对齐（官方服务商/API服务商）
 *   - 2026-05-22: 数据加载内聚到组件内部，消除父组件冗余代码；筛选数量改为交叉实时计数
 */

import React, { useState, useMemo, useEffect } from 'react';
import { Input, Button, Space, Row, Col, Tag, Typography, Spin } from 'antd';
import request from '../utils/request';

const { Title, Text } = Typography;

interface ModelSelectorModel {
  mid: string;
  name: string;
  model_id: string;
  provider_id?: number;
  api_provider_id?: number;
  type_id?: number;
  remark?: string;
  site_discount?: number;
  site_discount_enabled?: number;
}

interface ModelSelectorProvider {
  id: number;
  name: string;
  logo?: string;
}

interface ModelSelectorType {
  id: number;
  name: string;
  logo?: string;
}

interface ModelSelectorProps {
  selectedMids: string[];
  onSelectionChange: (mids: string[]) => void;
  /** 模型数据加载完成回调，父组件可据此获取模型详情（如折扣面板显示模型名称） */
  onModelsLoaded?: (models: ModelSelectorModel[]) => void;
  /** false: 同一 model_id 只能选一个 mid（渠道模式）; true: 可选多个（用户折扣模式） */
  allowDuplicateModelId?: boolean;
  isLightTheme?: boolean;
  /** 自定义标题（默认"选择模型"） */
  title?: string;
}

const ModelSelector: React.FC<ModelSelectorProps> = ({
  selectedMids,
  onSelectionChange,
  onModelsLoaded,
  allowDuplicateModelId = false,
  isLightTheme = false,
  title = '选择模型',
}) => {
  // ── 组件内部数据加载 ──
  const [availableModels, setAvailableModels] = useState<ModelSelectorModel[]>([]);
  const [allProviders, setAllProviders] = useState<ModelSelectorProvider[]>([]);
  const [allApiProviders, setAllApiProviders] = useState<ModelSelectorProvider[]>([]);
  const [allTypes, setAllTypes] = useState<ModelSelectorType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [modelsResp, providers, apiProviders, types] = await Promise.all([
          request.get('/models') as any,
          request.get('/model-providers') as any,
          request.get('/model-api-providers') as any,
          request.get('/model-types') as any,
        ]);
        // 与模型列表和渠道页对齐：仅保留已激活的模型，服务商/类型仅保留启用项
        const rawModels = modelsResp?.data || modelsResp || [];
        const models = rawModels.filter((m: any) => m.is_active === 1);
        setAvailableModels(models);
        setAllProviders((providers || []).filter((p: any) => p.is_active));
        setAllApiProviders((apiProviders || []).filter((p: any) => p.is_active));
        setAllTypes((types || []).filter((t: any) => t.is_active));
        // 通知父组件模型数据已加载
        onModelsLoaded?.(rawModels);
      } catch (e) {
        console.error('ModelSelector: 数据加载失败', e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 筛选状态 ──
  const [modelSearch, setModelSearch] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<number | null>(null);
  const [selectedApiProvider, setSelectedApiProvider] = useState<number | null>(null);
  const [selectedType, setSelectedType] = useState<number | null>(null);

  // 已选模型的 model_id 集合（用于 allowDuplicateModelId=false 时禁止重复）
  const selectedModelIds = useMemo(() => {
    return selectedMids.map(mid => {
      const m = availableModels.find(model => model.mid === mid);
      return m ? m.model_id : mid;
    });
  }, [selectedMids, availableModels]);

  /** 基础筛选：仅搜索关键词（所有维度共用） */
  const searchFiltered = useMemo(() => {
    if (!modelSearch) return availableModels;
    const q = modelSearch.toLowerCase();
    return availableModels.filter(m =>
      m.name.toLowerCase().includes(q) || m.model_id.toLowerCase().includes(q) || m.mid.toLowerCase().includes(q)
    );
  }, [availableModels, modelSearch]);

  /**
   * 交叉筛选计数：每个维度的数量基于"排除自身维度、保留其他维度筛选"的结果
   * 确保选中"视频"类型后，服务商的数量只统计视频类的模型
   */
  const providerCountBase = useMemo(() => {
    return searchFiltered.filter(m => {
      if (selectedApiProvider && m.api_provider_id !== selectedApiProvider) return false;
      if (selectedType && m.type_id !== selectedType) return false;
      return true;
    });
  }, [searchFiltered, selectedApiProvider, selectedType]);

  const apiProviderCountBase = useMemo(() => {
    return searchFiltered.filter(m => {
      if (selectedProvider && m.provider_id !== selectedProvider) return false;
      if (selectedType && m.type_id !== selectedType) return false;
      return true;
    });
  }, [searchFiltered, selectedProvider, selectedType]);

  const typeCountBase = useMemo(() => {
    return searchFiltered.filter(m => {
      if (selectedProvider && m.provider_id !== selectedProvider) return false;
      if (selectedApiProvider && m.api_provider_id !== selectedApiProvider) return false;
      return true;
    });
  }, [searchFiltered, selectedProvider, selectedApiProvider]);

  // 最终筛选结果：所有条件叠加
  const filteredModels = useMemo(() => {
    return searchFiltered.filter(m => {
      if (selectedProvider && m.provider_id !== selectedProvider) return false;
      if (selectedApiProvider && m.api_provider_id !== selectedApiProvider) return false;
      if (selectedType && m.type_id !== selectedType) return false;
      return true;
    });
  }, [searchFiltered, selectedProvider, selectedApiProvider, selectedType]);

  // 全选当前筛选结果
  const handleSelectAll = () => {
    const newSelection = [...selectedMids];
    const currentSelectedModelIds = new Set(selectedModelIds);

    filteredModels.forEach(m => {
      if (allowDuplicateModelId) {
        if (!newSelection.includes(m.mid)) {
          newSelection.push(m.mid);
        }
      } else {
        if (!currentSelectedModelIds.has(m.model_id) && !newSelection.includes(m.mid)) {
          newSelection.push(m.mid);
          currentSelectedModelIds.add(m.model_id);
        }
      }
    });

    onSelectionChange(newSelection);
  };

  /** 渲染一行筛选标签（公共函数，消除重复代码） */
  const renderFilterRow = (
    label: string,
    items: { id: number; name: string; logo?: string }[],
    selected: number | null,
    onSelect: (id: number | null) => void,
    countBase: ModelSelectorModel[],
    countField: 'provider_id' | 'api_provider_id' | 'type_id',
  ) => (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
      <Text type="secondary" style={{ fontSize: 12, paddingTop: 3, width: 56, flexShrink: 0 }}>{label}</Text>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <div
          onClick={() => onSelect(null)}
          style={{
            padding: '1px 10px', borderRadius: 10, fontSize: 12,
            backgroundColor: selected === null ? '#1677ff' : 'transparent',
            color: selected === null ? '#fff' : 'var(--text-secondary)',
            border: `1px solid ${selected === null ? '#1677ff' : (isLightTheme ? '#e5e4e7' : 'rgba(255,255,255,0.15)')}`,
            cursor: 'pointer', transition: 'all 0.2s',
          }}
        >全部</div>
        {items.map(p => {
          // 全量模型中是否有关联（决定是否显示该项）
          const hasModels = availableModels.some(m => m[countField] === p.id);
          if (!hasModels && selected !== p.id) return null;
          // 交叉筛选后的实时计数
          const count = countBase.filter(m => m[countField] === p.id).length;
          const isSelected = selected === p.id;
          return (
            <div
              key={p.id}
              onClick={() => onSelect(p.id)}
              style={{
                padding: '1px 10px', borderRadius: 10, fontSize: 12,
                backgroundColor: isSelected ? '#1677ff' : 'transparent',
                color: isSelected ? '#fff' : 'var(--text)',
                border: `1px solid ${isSelected ? '#1677ff' : (isLightTheme ? '#e5e4e7' : 'rgba(255,255,255,0.15)')}`,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, transition: 'all 0.2s',
              }}
            >
              {p.logo && <img src={`/assets/icons/lobe/${p.logo}.svg`} alt="" style={{ width: 12, height: 12 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
              <span>{p.name} <span style={{ opacity: isSelected ? 0.8 : 0.45, fontSize: 11, marginLeft: 2 }}>{count}</span></span>
            </div>
          );
        })}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
        <Spin tip="加载模型数据..."><div style={{ padding: 40 }} /></Spin>
      </div>
    );
  }

  return (
    <div style={{ animation: 'fadeIn 0.2s' }}>
      {/* 标题和操作栏 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>{title}</Title>
        <Space>
          <Input.Search
            placeholder="搜索模型名称或ID"
            value={modelSearch}
            onChange={(e) => setModelSearch(e.target.value)}
            style={{ width: 200 }}
            allowClear
          />
          <Button onClick={handleSelectAll}>全选</Button>
          <Button onClick={() => onSelectionChange([])} disabled={selectedMids.length === 0}>清空</Button>
        </Space>
      </div>

      {/* 筛选面板 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16, padding: '12px', background: isLightTheme ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)', borderRadius: 6 }}>
        {renderFilterRow('官方服务商', allProviders, selectedProvider, setSelectedProvider, providerCountBase, 'provider_id')}
        {allApiProviders.length > 0 &&
          renderFilterRow('API服务商', allApiProviders, selectedApiProvider, setSelectedApiProvider, apiProviderCountBase, 'api_provider_id')
        }
        {renderFilterRow('类型', allTypes, selectedType, setSelectedType, typeCountBase, 'type_id')}
      </div>

      {/* 模型卡片列表 */}
      <div style={{ maxHeight: 600, overflowY: 'auto', paddingRight: 8, marginTop: 12 }}>
        <Row gutter={[12, 12]}>
          {filteredModels.map((m) => {
            const isModelIdSelected = selectedModelIds.includes(m.model_id);
            const isCurrentMidSelected = selectedMids.includes(m.mid);
            const isDisabled = !allowDuplicateModelId && isModelIdSelected && !isCurrentMidSelected;
            return (
              <Col xs={24} sm={12} lg={12} key={m.mid}>
                <div
                  onClick={() => {
                    if (isDisabled) return;
                    const next = isCurrentMidSelected
                      ? selectedMids.filter(id => id !== m.mid)
                      : [...selectedMids, m.mid];
                    onSelectionChange(next);
                  }}
                  style={{
                    padding: '8px 12px', borderRadius: 6,
                    border: isCurrentMidSelected ? '1px solid var(--text)' : (isLightTheme ? '1px solid #e5e4e7' : '1px solid rgba(255,255,255,0.08)'),
                    background: isCurrentMidSelected ? (isLightTheme ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.08)') : 'transparent',
                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                    opacity: isDisabled ? 0.5 : 1,
                    display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.2s',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {m.name}
                      {m.remark && <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 'normal', marginLeft: 6 }}>({m.remark})</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.model_id}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                      <span>MID: {m.mid}</span>
                      {m.provider_id && <Tag style={{ margin: 0, padding: '0 4px', fontSize: 10, lineHeight: '14px', border: 'none', background: isLightTheme ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.08)' }}>{allProviders.find(p => p.id === m.provider_id)?.name || m.provider_id}</Tag>}
                      {m.type_id && <Tag style={{ margin: 0, padding: '0 4px', fontSize: 10, lineHeight: '14px', border: 'none', background: isLightTheme ? 'rgba(22,119,255,0.08)' : 'rgba(22,119,255,0.15)', color: '#1677ff' }}>{allTypes.find(t => t.id === m.type_id)?.name || m.type_id}</Tag>}
                    </div>
                  </div>
                </div>
              </Col>
            );
          })}
        </Row>
      </div>
    </div>
  );
};

export default ModelSelector;
