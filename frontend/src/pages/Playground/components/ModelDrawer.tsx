/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 模型全景选择器抽屉
 */
import React from 'react';
import { Input, Tooltip, Grid, message, Popover } from 'antd';
import { CloseOutlined, SearchOutlined, AppstoreOutlined, InfoCircleOutlined, DollarOutlined, StarOutlined, StarFilled, CopyOutlined, BookOutlined, UpOutlined, DownOutlined } from '@ant-design/icons';
import { usePlayground } from '../context/PlaygroundContext';
import { getCategoryIcon, getCategoryLabel, getLucideCategoryIcon } from '../constants';
import { useThemeStore } from '../../../store/theme';
import useSettingsStore from '../../../store/settings';
import RateDisplay from '../../Models/RateDisplay';
import SmartSvgIcon from '../../../components/SmartSvgIcon';

const { useBreakpoint } = Grid;

const ModelDrawer: React.FC = React.memo(() => {
  const {
    isModelDrawerVisible, setIsModelDrawerVisible,
    searchModelKeyword, setSearchModelKeyword,
    modelsInCategory, selectedMid, activeCategory,
    handleSelectModel, categories, handleCategoryChange,
    isSettingsWidgetVisible,
    favorites, toggleFavorite,
    activeSelectorNodeId, activeSelectorNodeSelectedMid,
  } = usePlayground();
  const { themeMode } = useThemeStore();
  const { settings } = useSettingsStore();
  const _isLight = themeMode === 'light';

  const screens = useBreakpoint();
  const isMobile = screens.md === false; // <= 768px

  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const [expandedBillingMids, setExpandedBillingMids] = React.useState<Set<number | string>>(new Set());

  const toggleBillingExpand = (mid: number | string) => {
    setExpandedBillingMids(prev => {
      const next = new Set(prev);
      if (next.has(mid)) {
        next.delete(mid);
      } else {
        next.add(mid);
      }
      return next;
    });
  };

  const isBillingExpanded = (mid: number | string) => {
    return expandedBillingMids.has(mid);
  };


  const handleCopy = (text: string) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        setCopiedId(text);
        setTimeout(() => setCopiedId(null), 2000);
      }).catch(() => {});
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        setCopiedId(text);
        setTimeout(() => setCopiedId(null), 2000);
      } catch (err) {}
      document.body.removeChild(textarea);
    }
  };

  const currencySymbol = settings?.currency?.currency_symbol || '$';
  const formatPrice = (price: number | string | undefined | null) => {
    if (price === undefined || price === null || price === '') return '-';
    const num = Number(price);
    if (isNaN(num)) return String(price);
    return `${currencySymbol}${num}`;
  };

  return (
    <>
      <style>{`
        .action-icon-btn {
          width: 20px; height: 20px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; transition: all 0.2s;
          color: ${_isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.65)'};
        }
        .action-icon-btn:hover {
          background: ${_isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'};
          color: ${_isLight ? 'rgba(0,0,0,0.88)' : 'rgba(255,255,255,1)'};
        }
      `}</style>
      <div style={{
      width: isModelDrawerVisible ? (isMobile ? '100vw' : 480) : 0,
      flexShrink: 0,
      transition: 'width 0.3s cubic-bezier(0.2, 0, 0, 1)',
      overflow: 'hidden',
      borderLeft: isModelDrawerVisible ? (_isLight ? '1px solid rgba(0,0,0,0.1)' : '1px solid rgba(255,255,255,0.12)') : 'none',
      background: _isLight ? '#ffffff' : '#1e1f20',
      display: 'flex',
      flexDirection: 'column',
      position: (isMobile || isSettingsWidgetVisible) ? 'absolute' : 'relative',
      right: 0, top: 0, bottom: 0,
      zIndex: (isMobile || isSettingsWidgetVisible) ? 2101 : 1,
      boxShadow: (isMobile || isSettingsWidgetVisible) && isModelDrawerVisible ? (_isLight ? '-8px 0 30px rgba(0,0,0,0.05)' : '-8px 0 30px rgba(0,0,0,0.4)') : 'none',
    }}>
      <div style={{ width: isMobile ? '100vw' : 480, minWidth: isMobile ? '100vw' : 480, height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{
          padding: '16px 16px',
          borderBottom: _isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid #444746',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <AppstoreOutlined style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 16 }} />
            <span style={{ color: _isLight ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.85)', fontSize: 15, fontWeight: 500 }}>
              选择模型
            </span>
          </div>
          <Tooltip title="关闭">
            <CloseOutlined
              style={{ color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)', cursor: 'pointer' }}
              onClick={() => setIsModelDrawerVisible(false)}
            />
          </Tooltip>
        </div>

        {/* Body */}
        <div style={{ padding: isMobile ? '12px 8px 8px 8px' : '16px 12px 8px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* 类别切换器 */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '0 2px' }}>
            {categories.map((cat: string) => {
              const isActive = activeCategory === cat;
              return (
                <div
                  key={cat}
                  onClick={() => handleCategoryChange(cat)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 20,
                    cursor: 'pointer',
                    background: isActive
                      ? (_isLight ? 'rgba(22,119,255,0.08)' : '#262930')
                      : (_isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)'),
                    border: isActive
                      ? '1px solid #1677ff'
                      : (_isLight ? '1px solid transparent' : '1px solid transparent'),
                    color: isActive
                      ? '#1677ff'
                      : (_isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.7)'),
                    fontSize: 12,
                    fontWeight: 500,
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6
                  }}
                >
                  {getLucideCategoryIcon(cat, 16)}
                  <span>{getCategoryLabel(cat)}</span>
                </div>
              );
            })}
          </div>

          <Input
            size="large"
            prefix={<SearchOutlined style={{ color: _isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)', paddingRight: 8 }} />}
            placeholder="搜索体验模型..."
            value={searchModelKeyword}
            onChange={e => setSearchModelKeyword(e.target.value)}
            style={{ background: _isLight ? 'rgba(0,0,0,0.04)' : 'rgba(0,0,0,0.3)', border: _isLight ? '1px solid rgba(0,0,0,0.1)' : '1px solid rgba(255,255,255,0.1)', color: _isLight ? '#000' : '#fff', borderRadius: 12 }}
          />
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '8px 8px 20px 8px' : '8px 12px 20px 12px', display: 'flex', flexDirection: 'column', gap: 0 }}>
          {modelsInCategory.length === 0 ? (
            <div style={{ color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.4)', textAlign: 'center', padding: '60px 0' }}>该类别下暂无可体验的模型。</div>
          ) : (
            modelsInCategory.map(model => {
              const isSelected = activeSelectorNodeId
                ? String(activeSelectorNodeSelectedMid) === String(model.mid)
                : selectedMid === model.mid;
              const isPaid = !!model.billing;
              return (
                <div
                  key={model.mid}
                  onClick={() => handleSelectModel(model.mid)}
                  style={{
                    borderRadius: 12,
                    padding: '6px 8px',
                    marginBottom: 8,
                    border: 'none',
                    background: isSelected
                      ? (_isLight ? 'rgba(22,119,255,0.06)' : '#262930')
                      : (_isLight ? '#ffffff' : '#202124'),
                    cursor: 'pointer', display: 'flex', flexDirection: 'column', transition: 'all 0.2s ease',
                    boxShadow: isSelected
                      ? (_isLight ? '0 4px 12px rgba(22,119,255,0.06)' : '0 4px 12px rgba(0,0,0,0.15)')
                      : 'none'
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = _isLight ? '#f8f9fa' : '#2a2b2f';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = _isLight ? '#ffffff' : '#202124';
                    }
                  }}
                >
                  {/* 头部区：Logo + ID + 操作区 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
                    {/* Logo 容器 */}
                    <div style={{
                      width: 20, height: 20, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      {model.logo ? (
                        <SmartSvgIcon 
                          src={`/assets/icons/lobe/${model.logo}.svg`} 
                          alt={model.name} 
                          style={{ width: 16, height: 16, objectFit: 'contain' }} 
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div style={{ fontSize: 14, opacity: 0.8, color: _isLight ? '#1677ff' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {getLucideCategoryIcon(activeCategory, 14)}
                        </div>
                      )}
                    </div>
                    
                    {/* ID 和 徽章 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                      <div style={{ color: _isLight ? '#1f2937' : '#E8eaed', fontSize: 15, fontWeight: 500, fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{model.model_id}</div>
                      {/* 模型类型徽章 */}
                      <Tooltip title={getCategoryLabel(model.scheme_type || model.type_name || 'chat')}>
                        <div style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 26,
                          height: 26,
                          borderRadius: 6,
                          background: _isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.08)',
                          color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)',
                          flexShrink: 0
                        }}>
                          {getLucideCategoryIcon(model.scheme_type || model.type_name || 'chat', 16)}
                        </div>
                      </Tooltip>
                    </div>
                    
                    {/* 快捷操作区 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 0, flexShrink: 0, marginLeft: 'auto' }} onClick={e => e.stopPropagation()}>
                      <Tooltip title="收藏" placement="bottom" overlayStyle={{ zIndex: 9999 }} overlayInnerStyle={{ fontSize: 11, padding: '3px 6px', minHeight: 'auto' }}>
                        <div className="action-icon-btn" onClick={(e) => { e.stopPropagation(); toggleFavorite(model.mid); }}>
                          {favorites.includes(String(model.mid)) ? (
                            <StarFilled style={{ fontSize: 11.5, color: _isLight ? '#000' : '#fff' }} />
                          ) : (
                            <StarOutlined style={{ fontSize: 11.5 }} />
                          )}
                        </div>
                      </Tooltip>
                      <Tooltip title={copiedId === model.model_id ? '已复制！' : '复制'} placement="bottom" overlayStyle={{ zIndex: 9999 }} overlayInnerStyle={{ fontSize: 11, padding: '3px 6px', minHeight: 'auto' }}>
                        <div className="action-icon-btn" onClick={(e) => { e.stopPropagation(); handleCopy(model.model_id); }}>
                          <CopyOutlined style={{ fontSize: 11.5 }} />
                        </div>
                      </Tooltip>
                      {model.billing && (
                        <Tooltip title={isBillingExpanded(model.mid) ? "收起Tokens详情" : "Tokens详情"} placement="bottom" overlayStyle={{ zIndex: 9999 }} overlayInnerStyle={{ fontSize: 11, padding: '3px 6px', minHeight: 'auto' }}>
                          <div className="action-icon-btn" onClick={(e) => { e.stopPropagation(); toggleBillingExpand(model.mid); }}>
                            {isBillingExpanded(model.mid) ? (
                              <UpOutlined style={{ fontSize: 11.5 }} />
                            ) : (
                              <DownOutlined style={{ fontSize: 11.5 }} />
                            )}
                          </div>
                        </Tooltip>
                      )}
                    </div>
                  </div>

                  {/* 详情区：简介 + 价格 */}
                  {model.billing && (
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'flex-start', 
                      gap: 8, 
                      color: _isLight ? '#5f6368' : '#9aa0a6', 
                      fontSize: 13,
                      paddingLeft: 8,
                      maxHeight: isBillingExpanded(model.mid) ? 200 : 0,
                      opacity: isBillingExpanded(model.mid) ? 1 : 0,
                      overflow: 'hidden',
                      marginTop: isBillingExpanded(model.mid) ? 8 : 0,
                      paddingTop: isBillingExpanded(model.mid) ? 4 : 0,
                      paddingBottom: isBillingExpanded(model.mid) ? 4 : 0,
                      transition: 'max-height 0.25s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease, margin-top 0.25s cubic-bezier(0.4, 0, 0.2, 1), padding 0.2s ease',
                    }}>
                      <div style={{ flex: 1, lineHeight: 1.5 }}>
                        <RateDisplay rule={model.billing} currencySymbol={currencySymbol} formatPrice={formatPrice} siteDiscount={model.global_discount} siteDiscountEnabled={model.global_discount_enabled} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
    </>
  );
});

ModelDrawer.displayName = 'ModelDrawer';
export default ModelDrawer;
