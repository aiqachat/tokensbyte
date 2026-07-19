/**
 * 悬浮参数设置面板 (可拖拽、可折叠)
 * 
 * 性能关键：拖拽期间完全绕过 React 状态系统，直接操作 DOM
 * 仅在 mouseup 时提交最终位置到 Context state
 */
import React from 'react';
import { Typography, Tooltip, Grid, message, Popover } from 'antd';
import { AppstoreOutlined, DownOutlined, CloseOutlined, InfoCircleOutlined, DollarOutlined, StarOutlined, StarFilled, CopyOutlined, BookOutlined, LockFilled, UnlockOutlined } from '@ant-design/icons';
import { usePlayground, useCanvas } from '../context/PlaygroundContext';
import ParamControl from './ParamControl';
import { useThemeStore } from '../../../store/theme';
import useSettingsStore from '../../../store/settings';
import RateDisplay from '../../Models/RateDisplay';
import { getCategoryIcon, getCategoryLabel, getLucideCategoryIcon } from '../constants';
import SmartSvgIcon from '../../../components/SmartSvgIcon';

const { Text } = Typography;
const { useBreakpoint } = Grid;

const SettingsWidget: React.FC = React.memo(() => {
  const {
    isSettingsWidgetVisible, setIsSettingsWidgetVisible,
    currentModel, setIsModelDrawerVisible,
    chatMessages, defaultModelMids, models, handleSelectModel,
    modelConfigs, saveModelConfig, deleteModelConfig, paramValues,
    favorites, toggleFavorite,
  } = usePlayground();
  const { nodes } = useCanvas();

  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  const isLocked = currentModel ? !!modelConfigs[currentModel.mid] : false;

  const handleToggleLock = React.useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentModel) return;
    if (isLocked) {
      await deleteModelConfig(currentModel.mid);
    } else {
      await saveModelConfig(currentModel.mid, paramValues);
    }
  }, [currentModel, isLocked, paramValues, saveModelConfig, deleteModelConfig]);
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
  const { themeMode } = useThemeStore();
  const { settings } = useSettingsStore();
  const _isLight = themeMode === 'light';
  
  const screens = useBreakpoint();
  const isMobile = screens.md === false; // <= 768px

  const isVisible = isSettingsWidgetVisible;
  const isEmptyProject = nodes.length === 0 && chatMessages.length === 0;


  // Extract favorite and default models
  const displayModels: any[] = React.useMemo(() => {
    const list: any[] = [];
    const addedMids = new Set<string>();

    favorites.forEach(mid => {
      const midStr = String(mid);
      const m = models.find(m => String(m.mid) === midStr);
      if (m && !addedMids.has(midStr)) {
        list.push({ ...m, typeKey: m.scheme_type || m.type_name || 'chat', label: '收藏模型' });
        addedMids.add(midStr);
      }
    });

    const mids = Array.isArray(defaultModelMids) ? defaultModelMids : [];
    mids.forEach(mid => {
      const m = models.find(m => m.mid === mid);
      if (m && !addedMids.has(m.mid)) {
        const typeLabel = m.scheme_type || m.type_name || '对话';
        list.push({ ...m, typeKey: m.scheme_type || m.type_name || 'chat', label: `${typeLabel} (默认)` });
        addedMids.add(m.mid);
      }
    });

    return list.sort((a, b) => {
      const sa = a.sort_order ?? 0;
      const sb = b.sort_order ?? 0;
      if (sa !== sb) return sb - sa; // 权重降序
      return a.name.localeCompare(b.name); // 拼音升序
    });
  }, [defaultModelMids, models, favorites]);

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
          width: 24px; height: 24px; border-radius: 50%;
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
      width: isVisible ? (isMobile ? '100vw' : (currentModel ? 360 : 480)) : 0,
      flexShrink: 0,
      transition: 'width 0.3s cubic-bezier(0.2, 0, 0, 1)',
      overflow: 'hidden',
      borderLeft: isVisible ? (_isLight ? '1px solid rgba(0,0,0,0.1)' : '1px solid rgba(255,255,255,0.12)') : 'none',
      background: _isLight ? '#ffffff' : '#1e1f20',
      display: 'flex',
      flexDirection: 'column',
      position: isMobile ? 'absolute' : 'relative',
      right: 0, top: 0, bottom: 0,
      zIndex: isMobile ? 2099 : 1,
    }}>
      <div style={{ width: isMobile ? '100vw' : (currentModel ? 360 : 480), minWidth: isMobile ? '100vw' : (currentModel ? 360 : 480), height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{
          padding: '16px 16px',
          borderBottom: _isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid #444746',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <AppstoreOutlined style={{ color: _isLight ? '#333' : '#fff', fontSize: 16 }} />
            <Text style={{ color: _isLight ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.85)', fontSize: 15, fontWeight: 500 }}>
              模型属性配置
            </Text>
            {currentModel && (
              <Tooltip 
                title={isLocked ? '配置已锁定' : '已解锁配置'}
                placement="bottom"
              >
                <div 
                  onClick={handleToggleLock}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    color: isLocked ? (_isLight ? '#1677ff' : '#ffffff') : (_isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)'),
                    transform: isLocked ? 'scale(1.1)' : 'scale(1)',
                    marginLeft: 2
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = isLocked ? (_isLight ? '#4096ff' : 'rgba(255,255,255,0.85)') : (_isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)');
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = isLocked ? (_isLight ? '#1677ff' : '#ffffff') : (_isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)');
                  }}
                >
                  {isLocked ? <LockFilled style={{ fontSize: 14 }} /> : <UnlockOutlined style={{ fontSize: 14 }} />}
                </div>
              </Tooltip>
            )}
          </div>
          <Tooltip title="关闭">
            <CloseOutlined
              style={{ color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)', cursor: 'pointer' }}
              onClick={() => setIsSettingsWidgetVisible(false)}
            />
          </Tooltip>
        </div>

        {/* Body */}
        <div style={{ padding: isMobile ? '12px 8px' : '20px 12px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 模型选择卡片 */}
          {currentModel && (
          <div>
            <div
              onClick={() => setIsModelDrawerVisible(true)}
              style={{
                background: _isLight ? '#ffffff' : '#202124', borderRadius: 16, padding: '10px',
                border: 'none', cursor: 'pointer',
                transition: 'all 0.2s ease', position: 'relative',
                boxShadow: _isLight ? '0 4px 12px rgba(0,0,0,0.03)' : '0 4px 12px rgba(0,0,0,0.15)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = _isLight ? '#f8f9fa' : '#2a2b2f';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = _isLight ? '#ffffff' : '#202124';
              }}
            >
              {currentModel ? (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                  {/* Logo 容器 */}
                  <div style={{
                    width: 36, height: 36, flexShrink: 0,
                    borderRadius: 8,
                    background: _isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)',
                    border: _isLight ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(255,255,255,0.08)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginTop: 2
                  }}>
                    {currentModel.logo ? (
                      <SmartSvgIcon 
                        src={`/assets/icons/lobe/${currentModel.logo}.svg`} 
                        alt={currentModel.name} 
                        style={{ width: 24, height: 24, objectFit: 'contain', borderRadius: 4 }} 
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div style={{ fontSize: 18, opacity: 0.8, color: _isLight ? '#1677ff' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {getLucideCategoryIcon(currentModel.scheme_type || currentModel.type_name || 'chat', 18)}
                      </div>
                    )}
                  </div>

                  {/* 信息和操作区 */}
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, width: '100%' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                        <div style={{ color: _isLight ? '#1f2937' : '#E8eaed', fontSize: 16, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {currentModel.name}
                        </div>
                        {/* 模型类型徽章 */}
                        <Tooltip title={getCategoryLabel(currentModel.scheme_type || currentModel.type_name || 'chat')}>
                          <div style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 28,
                            height: 28,
                            borderRadius: 6,
                            background: _isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.08)',
                            color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)',
                            flexShrink: 0
                          }}>
                            {getLucideCategoryIcon(currentModel.scheme_type || currentModel.type_name || 'chat', 17)}
                          </div>
                        </Tooltip>
                      </div>

                      {/* 操作按钮区 */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0, marginLeft: 'auto' }} onClick={e => e.stopPropagation()}>
                        <Tooltip title="收藏" placement="bottom" overlayStyle={{ zIndex: 9999 }}>
                          <div className="action-icon-btn" onClick={(e) => { e.stopPropagation(); toggleFavorite(currentModel.mid); }}>
                            {favorites.includes(String(currentModel.mid)) ? (
                              <StarFilled style={{ fontSize: 13.5, color: _isLight ? '#000' : '#fff' }} />
                            ) : (
                              <StarOutlined style={{ fontSize: 13.5 }} />
                            )}
                          </div>
                        </Tooltip>
                        <Tooltip title={copiedId === currentModel.model_id ? '已复制！' : '复制'} placement="bottom" overlayStyle={{ zIndex: 9999 }}>
                          <div className="action-icon-btn" onClick={(e) => { e.stopPropagation(); handleCopy(currentModel.model_id); }}>
                            <CopyOutlined style={{ fontSize: 13.5 }} />
                          </div>
                        </Tooltip>
                        <Tooltip title="开发文档" placement="bottom" overlayStyle={{ zIndex: 9999 }}>
                          <div className="action-icon-btn" onClick={(e) => { e.stopPropagation(); window.open('/docs', '_blank'); }}>
                            <BookOutlined style={{ fontSize: 13.5 }} />
                          </div>
                        </Tooltip>
                      </div>
                    </div>

                    <div style={{ color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.4)', fontSize: 13, fontFamily: 'monospace', marginBottom: 4 }}>
                      {currentModel.model_id}
                    </div>

                    {currentModel.description && (
                      <div style={{ color: _isLight ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.6)', fontSize: 13, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {currentModel.description}
                      </div>
                    )}

                    {currentModel.billing && (
                      <div style={{ color: _isLight ? '#5f6368' : '#9aa0a6', fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>
                        <RateDisplay rule={currentModel.billing} currencySymbol={currencySymbol} formatPrice={formatPrice} siteDiscount={currentModel.global_discount} siteDiscountEnabled={currentModel.global_discount_enabled} />
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)', fontSize: 15, padding: '8px 0' }}>
                  选择模型...
                </div>
              )}
            </div>
          </div>
          )}

          {/* 动态参数面板 */}
          {currentModel && currentModel?.params && currentModel.params.length > 0 && (
            currentModel.params.map(param => <ParamControl key={param.key} param={param} disabled={isLocked} />)
          )}

          {currentModel && (!currentModel.params || currentModel.params.length === 0) && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <Text style={{ color: _isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)', fontSize: 13 }}>该模型未绑定体验方案，无可配置参数</Text>
            </div>
          )}

          {!currentModel && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <Text style={{ color: _isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)', fontSize: 13 }}>请先选择一个模型</Text>
            </div>
          )}
        </div>
      </div>
    </div>
  </>
  );
});

SettingsWidget.displayName = 'SettingsWidget';
export default SettingsWidget;
