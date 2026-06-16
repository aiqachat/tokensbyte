import React, { useState, useEffect, useCallback } from 'react';
import { Typography, Button, Space, Spin, Switch, Tag, Modal, Input, message, Empty, Tooltip, Badge } from 'antd';
import {
  PlusOutlined, DeleteOutlined, EditOutlined, ThunderboltOutlined,
  DollarOutlined, SafetyCertificateOutlined, ApiOutlined, ReloadOutlined,
  CheckOutlined, ArrowLeftOutlined, RightOutlined, CopyOutlined, InfoCircleOutlined
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';
import { useThemeStore } from '../../store/theme';
import Logs from '../Logs/Logs';

const { Title, Text } = Typography;

interface ModelInfo { mid: string; name: string; model_id: string; logo?: string; billing_type?: string; }
interface ChannelGroup { group_aid: string; group_name: string; models: ModelInfo[]; }
interface RouteGroup {
  id: number; name: string; description?: string; route_rule: string;
  model_ids: string[]; model_details: ModelInfo[]; is_active: number;
  endpoint_id: string; created_at: string; updated_at: string;
}
interface RouteRule { id: string; name: string; name_en: string; icon: string; description: string; features: string[]; }

const copyText = (text: string, onSuccess: () => void) => {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      onSuccess();
    }).catch(() => {
      fallbackCopyText(text, onSuccess);
    });
  } else {
    fallbackCopyText(text, onSuccess);
  }
};

const fallbackCopyText = (text: string, onSuccess: () => void) => {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  document.body.appendChild(textArea);
  textArea.select();
  try {
    document.execCommand('copy');
    onSuccess();
  } catch (err) {
    console.error('Fallback copy failed', err);
    message.error('Copy failed');
  }
  document.body.removeChild(textArea);
};

const SmartRouter: React.FC = () => {
  const { t } = useTranslation('router_flow');
  const { themeMode } = useThemeStore();
  const isLight = themeMode === 'light';
  const [groups, setGroups] = useState<RouteGroup[]>([]);
  const [rules, setRules] = useState<RouteRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewingLogsGroup, setViewingLogsGroup] = useState<RouteGroup | null>(null);

  // Inline create/edit state
  const [mode, setMode] = useState<'list' | 'create' | 'edit' | 'logs'>('list');
  const [editingGroup, setEditingGroup] = useState<RouteGroup | null>(null);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formRule, setFormRule] = useState('price');
  const [formModelIds, setFormModelIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Channel groups
  const [channelGroups, setChannelGroups] = useState<ChannelGroup[]>([]);
  const [selectedGroupAid, setSelectedGroupAid] = useState<string | null>(null);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [modelSearch, setModelSearch] = useState('');

  const cardBg = isLight ? '#fff' : '#141414';
  const borderColor = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)';
  const textColor = isLight ? '#1f2937' : '#fff';
  const subTextColor = isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)';
  const dimColor = isLight ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)';

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [g, r] = await Promise.all([
        request.get('/plugins/router-flow/groups') as Promise<any>,
        request.get('/plugins/router-flow/rules') as Promise<any>,
      ]);
      if (g?.groups) setGroups(g.groups);
      if (r?.rules) setRules(r.rules);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, []);

  const fetchChannelGroups = useCallback(async () => {
    try {
      setGroupsLoading(true);
      const res = await (request.get('/plugins/router-flow/channel-groups') as Promise<any>);
      if (res?.channel_groups) setChannelGroups(res.channel_groups);
    } catch (e) { console.error(e); } finally { setGroupsLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const enterCreate = () => {
    setEditingGroup(null); setFormName(''); setFormDesc(''); setFormRule('price');
    setFormModelIds([]); setSelectedGroupAid(null); setModelSearch('');
    setMode('create'); fetchChannelGroups();
  };

  const enterEdit = (g: RouteGroup) => {
    setEditingGroup(g); setFormName(g.name); setFormDesc(g.description || '');
    setFormRule(g.route_rule); setFormModelIds(g.model_ids);
    setSelectedGroupAid(null); setModelSearch('');
    setMode('edit'); fetchChannelGroups();
  };

  const goBack = () => { setMode('list'); };

  const handleSave = async () => {
    if (!formName.trim()) { message.warning(t('enter_name_warning')); return; }
    if (formModelIds.length < 2) { message.warning(t('select_two_warning')); return; }
    try {
      setSaving(true);
      const body = { name: formName, description: formDesc, route_rule: formRule, model_ids: formModelIds };
      if (editingGroup) {
        await request.put(`/plugins/router-flow/groups/${editingGroup.id}`, body);
        message.success(t('update_success'));
      } else {
        await request.post('/plugins/router-flow/groups', body);
        message.success(t('create_success'));
      }
      setMode('list'); fetchData();
    } catch (e: any) { message.error(e?.response?.data?.error?.message || t('operation_failed')); }
    finally { setSaving(false); }
  };

  const handleDelete = (g: RouteGroup) => {
    Modal.confirm({
      title: t('confirm_delete'), content: t('confirm_delete_content', { name: g.name }),
      okText: t('delete_btn'), okButtonProps: { danger: true }, cancelText: t('cancel_btn'),
      onOk: async () => {
        await request.delete(`/plugins/router-flow/groups/${g.id}`);
        message.success(t('deleted')); fetchData();
      },
    });
  };

  const handleToggle = async (g: RouteGroup, checked: boolean) => {
    await request.put(`/plugins/router-flow/groups/${g.id}`, { is_active: checked ? 1 : 0 });
    message.success(checked ? t('enabled') : t('disabled')); fetchData();
  };

  const toggleModel = (mid: string) => {
    setFormModelIds(prev => prev.includes(mid) ? prev.filter(i => i !== mid) : [...prev, mid]);
  };

  const selectedGroup = channelGroups.find(g => g.group_aid === selectedGroupAid);
  const filteredModels = (selectedGroup?.models || []).filter(m =>
    !modelSearch || m.name.toLowerCase().includes(modelSearch.toLowerCase()) || m.model_id.toLowerCase().includes(modelSearch.toLowerCase())
  );

  if (loading && groups.length === 0) return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>;

  // ── LOGS VIEW ──
  if (mode === 'logs' && viewingLogsGroup) {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, paddingBottom: 16, borderBottom: `1px solid ${borderColor}` }}>
          <Button icon={<ArrowLeftOutlined />} type="text" onClick={goBack} />
          <div>
            <Title level={4} style={{ margin: 0, color: textColor }}>{t('logs_title')}</Title>
            <Text style={{ color: subTextColor, fontSize: 13 }}>{t('logs_viewing', { name: viewingLogsGroup.name })}</Text>
          </div>
        </div>
        <Logs routerEp={viewingLogsGroup.endpoint_id} />
      </div>
    );
  }

  // ── CREATE / EDIT VIEW ──
  if (mode === 'create' || mode === 'edit') {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, paddingBottom: 16, borderBottom: `1px solid ${borderColor}` }}>
          <Button icon={<ArrowLeftOutlined />} type="text" onClick={goBack} />
          <Title level={4} style={{ margin: 0, color: textColor }}>{mode === 'edit' ? t('edit_group') : t('create_group')}</Title>
        </div>

        {/* 编辑模式：显示推理节点信息 */}
        {mode === 'edit' && editingGroup?.endpoint_id && (
          <div style={{
            background: isLight ? '#f9fafb' : 'rgba(255,255,255,0.02)',
            border: `1px solid ${borderColor}`,
            borderRadius: 12, padding: '16px 20px', marginBottom: 20,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 16 }}>🔗</span>
                <Text style={{ color: subTextColor, fontSize: 12, fontWeight: 500 }}>{t('endpoint_label')}</Text>
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: 18, color: textColor, fontWeight: 700, letterSpacing: 0.5 }}>
                {editingGroup.endpoint_id}
              </div>
              <div style={{ color: dimColor, fontSize: 11, marginTop: 6, lineHeight: 1.6 }}>
                {t('endpoint_hint')} <code style={{ background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)', padding: '1px 6px', borderRadius: 4, fontSize: 11 }}>model: "{editingGroup.endpoint_id}"</code> {t('endpoint_call')}
              </div>
            </div>
            <Tooltip title={t('copy_endpoint')}>
              <Button icon={<CopyOutlined />} onClick={(e) => {
                e.stopPropagation();
                copyText(editingGroup.endpoint_id, () => message.success(t('copied')));
              }}>{t('copy')}</Button>
            </Tooltip>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {/* Left: Config */}
          <div>
            <div style={{ background: cardBg, border: `1px solid ${borderColor}`, borderRadius: 10, padding: 20, marginBottom: 16 }}>
              <Text strong style={{ color: textColor, fontSize: 13, display: 'block', marginBottom: 6 }}>{t('group_name')}</Text>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder={t('group_name_placeholder')} maxLength={64} />
              <Text strong style={{ color: textColor, fontSize: 13, display: 'block', marginBottom: 6, marginTop: 14 }}>{t('description_label')}</Text>
              <Input.TextArea value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder={t('description_placeholder')} rows={2} maxLength={200} />
            </div>
            <div style={{ background: cardBg, border: `1px solid ${borderColor}`, borderRadius: 10, padding: 20, marginBottom: 16 }}>
              <Text strong style={{ color: textColor, fontSize: 13, display: 'block', marginBottom: 10 }}>{t('route_strategy')}</Text>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                {rules.map(rule => {
                  const sel = formRule === rule.id;
                  return (
                    <div key={rule.id} onClick={() => setFormRule(rule.id)} style={{
                      position: 'relative',
                      border: `1.5px solid ${sel ? textColor : borderColor}`, background: sel ? (isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.08)') : 'transparent',
                      borderRadius: 8, padding: '10px 12px', cursor: 'pointer', transition: 'all 0.2s', textAlign: 'center',
                    }}>
                      <div style={{ color: textColor, marginBottom: 4 }}>
                        {rule.id === 'price' ? <DollarOutlined style={{ fontSize: 20 }} /> : 
                         rule.id === 'speed' ? <ThunderboltOutlined style={{ fontSize: 20 }} /> : 
                         rule.id === 'stability' ? <SafetyCertificateOutlined style={{ fontSize: 20 }} /> : 
                         <ApiOutlined style={{ fontSize: 20 }} />}
                      </div>
                      <div style={{ color: textColor, fontSize: 13, fontWeight: sel ? 600 : 500 }}>{rule.name}</div>
                      <div style={{ color: subTextColor, fontSize: 11, marginTop: 2 }}>{rule.name_en}</div>
                      
                      <div style={{ position: 'absolute', top: 8, right: 8 }} onClick={e => e.stopPropagation()}>
                        <Tooltip
                          title={
                            <div>
                              <div style={{ fontWeight: 600, marginBottom: 6 }}>{rule.description}</div>
                              {rule.features && rule.features.length > 0 && (
                                <ul style={{ paddingLeft: 16, margin: 0, fontSize: 12 }}>
                                  {rule.features.map((f, i) => (
                                    <li key={i}>{f}</li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          }
                          overlayStyle={{ maxWidth: 300 }}
                          placement="top"
                          trigger="click"
                        >
                          <InfoCircleOutlined style={{ fontSize: 14, color: dimColor, cursor: 'pointer' }} />
                        </Tooltip>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            {/* Selected models summary */}
            <div style={{ background: cardBg, border: `1px solid ${borderColor}`, borderRadius: 10, padding: 20 }}>
              <Text strong style={{ color: textColor, fontSize: 13 }}>{t('selected_models')} ({formModelIds.length})</Text>
              {formModelIds.length < 2 && <Text style={{ color: '#fa8c16', fontSize: 12, marginLeft: 8 }}>{t('at_least_two')}</Text>}
              <div style={{ marginTop: 10, maxHeight: 200, overflowY: 'auto' }}>
                {formModelIds.length === 0 ? (
                  <Text style={{ color: dimColor, fontSize: 12 }}>{t('select_from_right')}</Text>
                ) : formModelIds.map(mid => {
                  const m = channelGroups.flatMap(g => g.models).find(x => x.mid === mid) || editingGroup?.model_details.find(x => x.mid === mid);
                  return (
                    <div key={mid} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: `1px solid ${isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)'}` }}>
                      <div style={{ width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {m?.logo ? <img src={`/assets/icons/lobe/${m.logo}.svg`} alt="" style={{ width: '100%', height: '100%', borderRadius: 4, objectFit: 'contain' }} onError={(e) => { e.currentTarget.style.display = 'none'; if (e.currentTarget.nextElementSibling) (e.currentTarget.nextElementSibling as HTMLElement).style.display = 'inline-flex'; }} /> : null}
                        <ApiOutlined style={{ fontSize: 14, color: dimColor, display: m?.logo ? 'none' : 'inline-flex' }} />
                      </div>
                      <Text style={{ color: textColor, fontSize: 12, flex: 1 }}>{m?.name || mid}</Text>
                      <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => toggleModel(mid)} style={{ fontSize: 11 }} />
                    </div>
                  );
                })}
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <Button type="primary" onClick={handleSave} loading={saving} style={{ marginRight: 10 }}>
                {mode === 'edit' ? t('save_changes') : t('create_group')}
              </Button>
              <Button onClick={goBack}>{t('cancel')}</Button>
            </div>
          </div>

          {/* Right: Channel Group → Model selection */}
          <div>
            <div style={{ background: cardBg, border: `1px solid ${borderColor}`, borderRadius: 10, padding: 20, minHeight: 400 }}>
              <Text strong style={{ color: textColor, fontSize: 13, display: 'block', marginBottom: 10 }}>
                {selectedGroupAid ? t('select_model') : t('select_channel_group')}
              </Text>

              {groupsLoading ? <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div> : !selectedGroupAid ? (
                /* Channel group list */
                <div>
                  {channelGroups.length === 0 ? (
                    <Text style={{ color: dimColor, fontSize: 13 }}>{t('no_groups_available')}</Text>
                  ) : channelGroups.map(cg => (
                    <div key={cg.group_aid} onClick={() => setSelectedGroupAid(cg.group_aid)} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px',
                      borderRadius: 8, border: `1px solid ${borderColor}`, marginBottom: 8, cursor: 'pointer',
                      transition: 'all 0.15s', background: isLight ? 'rgba(0,0,0,0.01)' : 'rgba(255,255,255,0.02)',
                    }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = '#1677ff'; e.currentTarget.style.background = 'rgba(22,119,255,0.04)'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = borderColor; e.currentTarget.style.background = isLight ? 'rgba(0,0,0,0.01)' : 'rgba(255,255,255,0.02)'; }}
                    >
                      <div>
                        <Text strong style={{ color: textColor, fontSize: 14 }}>{cg.group_name}</Text>
                        <div style={{ color: subTextColor, fontSize: 12, marginTop: 2 }}>
                          {t('group_prefix')} {cg.group_aid} · {t('model_count', { count: cg.models.length })}
                        </div>
                      </div>
                      <RightOutlined style={{ color: dimColor, fontSize: 12 }} />
                    </div>
                  ))}
                </div>
              ) : (
                /* Model list within selected group */
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <Button type="text" size="small" icon={<ArrowLeftOutlined />} onClick={() => setSelectedGroupAid(null)} />
                    <Text style={{ color: subTextColor, fontSize: 12 }}>{selectedGroup?.group_name} ({t('group_prefix')} {selectedGroupAid})</Text>
                  </div>
                  <Input placeholder={t('search_model')} value={modelSearch} onChange={e => setModelSearch(e.target.value)} allowClear style={{ marginBottom: 10 }} size="small" />
                  <div style={{ maxHeight: 340, overflowY: 'auto' }}>
                    {filteredModels.length === 0 ? (
                      <Text style={{ color: dimColor, fontSize: 12 }}>{t('no_match')}</Text>
                    ) : filteredModels.map(m => {
                      const sel = formModelIds.includes(m.mid);
                      return (
                        <div key={m.mid} onClick={() => toggleModel(m.mid)} style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 6, cursor: 'pointer',
                          background: sel ? (isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.08)') : 'transparent',
                          border: sel ? `1px solid ${borderColor}` : '1px solid transparent', marginBottom: 2,
                        }}>
                          <div style={{
                            width: 18, height: 18, borderRadius: 4,
                            border: `1.5px solid ${sel ? textColor : borderColor}`,
                            background: sel ? textColor : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          }}>
                            {sel && <CheckOutlined style={{ color: isLight ? '#fff' : '#000', fontSize: 10 }} />}
                          </div>
                          <div style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            {m.logo ? <img src={`/assets/icons/lobe/${m.logo}.svg`} alt="" style={{ width: '100%', height: '100%', borderRadius: 4, objectFit: 'contain' }} onError={(e) => { e.currentTarget.style.display = 'none'; if (e.currentTarget.nextElementSibling) (e.currentTarget.nextElementSibling as HTMLElement).style.display = 'inline-flex'; }} /> : null}
                            <ApiOutlined style={{ fontSize: 12, color: textColor, display: m.logo ? 'none' : 'inline-flex' }} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <Text style={{ color: textColor, fontSize: 13 }} ellipsis>{m.name}</Text>
                            <Text style={{ color: dimColor, fontSize: 11, display: 'block' }}>{m.model_id}</Text>
                          </div>
                          {m.billing_type && (
                            <Tag style={{ margin: 0, fontSize: 10, borderRadius: 4,
                              background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.04)',
                              border: `1px solid ${borderColor}`,
                              color: subTextColor,
                            }}>{m.billing_type === 'requests' ? t('per_request') : m.billing_type === 'duration' ? t('per_duration') : t('per_token')}</Tag>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── LIST VIEW ──
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, paddingBottom: 16, borderBottom: `1px solid ${borderColor}` }}>
        <div>
          <Title level={4} style={{ margin: 0, color: textColor }}>{t('title')}</Title>
          <Text style={{ color: subTextColor, fontSize: 13 }}>{t('subtitle')}</Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>{t('refresh')}</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={enterCreate}>{t('create_group')}</Button>
        </Space>
      </div>



      {/* Groups */}
      {groups.length === 0 ? (
        <div style={{ background: cardBg, border: `1px solid ${borderColor}`, borderRadius: 12, padding: '60px 20px', textAlign: 'center' }}>
          <ApiOutlined style={{ fontSize: 48, color: dimColor, marginBottom: 16 }} />
          <div style={{ color: subTextColor, fontSize: 15, marginBottom: 8 }}>{t('no_groups')}</div>
          <div style={{ color: dimColor, fontSize: 13, marginBottom: 20 }}>{t('no_groups_hint')}</div>
          <Button type="primary" icon={<PlusOutlined />} onClick={enterCreate}>{t('create_first')}</Button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(380px,1fr))', gap: 16 }}>
          {groups.map(g => {
            const rn = rules.find(r => r.id === g.route_rule)?.name || g.route_rule;
            const routeId = g.route_rule;
            const ri = routeId === 'price' ? <DollarOutlined /> : routeId === 'speed' ? <ThunderboltOutlined /> : routeId === 'stability' ? <SafetyCertificateOutlined /> : <ApiOutlined />;
            return (
              <div key={g.id} style={{ background: cardBg, border: `1px solid ${borderColor}`, borderRadius: 12, padding: 20, transition: 'border-color 0.2s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = isLight ? '#000' : '#fff'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = borderColor; }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <Text strong style={{ color: textColor, fontSize: 16 }}>{g.name}</Text>
                      <Badge status={g.is_active === 1 ? 'success' : 'default'} text={<span style={{ color: subTextColor, fontSize: 11 }}>{g.is_active === 1 ? t('running') : t('stopped')}</span>} />
                    </div>
                    {g.description && <Text style={{ color: subTextColor, fontSize: 12 }}>{g.description}</Text>}
                  </div>
                  <Switch size="small" checked={g.is_active === 1} onChange={v => handleToggle(g, v)} />
                </div>
                {/* EP 推理节点 */}
                {g.endpoint_id && (
                  <div style={{ background: isLight ? '#f9fafb' : 'rgba(255,255,255,0.02)', border: `1px solid ${borderColor}`, borderRadius: 8, padding: '8px 12px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <Text style={{ color: subTextColor, fontSize: 11 }}>{t('endpoint_node')}</Text>
                      <div style={{ fontFamily: 'monospace', fontSize: 13, color: textColor, fontWeight: 600, marginTop: 2 }}>{g.endpoint_id}</div>
                    </div>
                    <Tooltip title={t('copy_endpoint')}>
                      <Button type="text" size="small" icon={<CopyOutlined />} style={{ color: textColor }}
                        onClick={(e) => { 
                          e.stopPropagation();
                          copyText(g.endpoint_id, () => message.success(t('copied'))); 
                        }} />
                    </Tooltip>
                  </div>
                )}
                <div style={{ marginBottom: 12 }}>
                  <Tag style={{ background: isLight ? '#f9fafb' : 'rgba(255,255,255,0.02)', border: `1px solid ${borderColor}`, color: textColor, borderRadius: 6, fontSize: 12, padding: '2px 8px' }}>{ri} {rn}</Tag>
                  <Tag style={{ background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.04)', border: `1px solid ${borderColor}`, color: subTextColor, borderRadius: 6, fontSize: 12, padding: '2px 8px' }}>{t('model_count', { count: g.model_ids.length })}</Tag>
                </div>
                <div style={{ background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '10px 12px', marginBottom: 12, maxHeight: 120, overflowY: 'auto' }}>
                  {g.model_details.map((m, i) => (
                    <div key={m.mid} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: i < g.model_details.length - 1 ? `1px solid ${isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)'}` : 'none' }}>
                      <div style={{ width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {m.logo ? <img src={`/assets/icons/lobe/${m.logo}.svg`} alt="" style={{ width: '100%', height: '100%', borderRadius: 4, objectFit: 'contain' }} onError={(e) => { e.currentTarget.style.display = 'none'; if (e.currentTarget.nextElementSibling) (e.currentTarget.nextElementSibling as HTMLElement).style.display = 'inline-flex'; }} /> : null}
                        <ApiOutlined style={{ fontSize: 10, color: textColor, display: m.logo ? 'none' : 'inline-flex' }} />
                      </div>
                      <Text style={{ color: textColor, fontSize: 12, flex: 1 }}>{m.name}</Text>
                      <Text style={{ color: dimColor, fontSize: 11 }}>{m.model_id || m.mid}</Text>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, borderTop: `1px solid ${isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)'}` }}>
                  <Text style={{ color: dimColor, fontSize: 11 }}>{new Date(g.created_at).toLocaleDateString('zh-CN')}</Text>
                  <Space size={4}>
                    <Button type="text" size="small" icon={<InfoCircleOutlined />} style={{ color: textColor, fontSize: 12 }} onClick={() => { setViewingLogsGroup(g); setMode('logs'); }}>{t('logs')}</Button>
                    <Button type="text" size="small" icon={<EditOutlined />} style={{ color: subTextColor, fontSize: 12 }} onClick={() => enterEdit(g)}>{t('edit')}</Button>
                    <Button type="text" size="small" icon={<DeleteOutlined />} danger style={{ fontSize: 12 }} onClick={() => handleDelete(g)}>{t('delete')}</Button>
                  </Space>
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
};

export default SmartRouter;
