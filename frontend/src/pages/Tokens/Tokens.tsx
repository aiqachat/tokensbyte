import React, { useEffect, useState } from 'react';
import { Table, Button, Space, Tag, Modal, Form, Input, InputNumber, message, Popconfirm, Card, Typography, Tooltip, Row, Col, Grid, theme, Spin, Dropdown, Progress, Checkbox } from 'antd';
import AppSwitch from '../../components/AppSwitch';
import MobileCardList, { MobileCard, CardRow, CardActions } from '../../components/MobileCardList';
import { PlusOutlined, EditOutlined, DeleteOutlined, CopyOutlined, SyncOutlined, EyeOutlined, EyeInvisibleOutlined, KeyOutlined, CheckOutlined, ArrowLeftOutlined, DollarOutlined, BarChartOutlined, EllipsisOutlined, PieChartOutlined, InfoCircleOutlined, FileTextOutlined, ClearOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import request from '../../utils/request';
import { useThemeStore } from '../../store/theme';
import useSettingsStore from '../../store/settings';
import useAuthStore from '../../store/auth';
import type { ApiToken } from '../../types';
import dayjs from 'dayjs';
import { getPeriodicUsed, getQuotaRefreshText, hasPeriodicLimits } from './quotaUtils';
import { resolveTimedisplay } from '../../utils/timedisplay';

const { Title, Text } = Typography;
const { useBreakpoint } = Grid;

const Tokens: React.FC = () => {
  const { t } = useTranslation();
  const { token: themeToken } = theme.useToken();
  const { themeMode } = useThemeStore();
  const { settings, fetchSettings } = useSettingsStore();
  const userTimezone = useAuthStore((s) => s.user?.timezone);
  // 与后端令牌热路径一致：用户 timedisplay（个人时区 > 站点默认）
  const quotaTz = (userTimezone?.trim() || resolveTimedisplay() || settings?.site?.default_timezone || 'Asia/Shanghai');
  const isLight = themeMode === 'light';
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailRefreshing, setDetailRefreshing] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingToken, setEditingToken] = useState<ApiToken | null>(null);
  const [form] = Form.useForm();
  const [passwordForm] = Form.useForm();
  const screens = useBreakpoint();
  const [saving, setSaving] = useState(false);
  const [enableModelFilter, setEnableModelFilter] = useState(false);
  const [limitQuotaEnabled, setLimitQuotaEnabled] = useState(false);
  const [periodicQuotaEnabled, setPeriodicQuotaEnabled] = useState(false);
  const [ipFilterEnabled, setIpFilterEnabled] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // 高可用通道确认弹窗状态
  const [isHAConfirmModalOpen, setIsHAConfirmModalOpen] = useState(false);
  const [haConfirmDismiss, setHaConfirmDismiss] = useState(false);
  const [tempValues, setTempValues] = useState<any>(null);

  const sectionContainerStyle: React.CSSProperties = {
    marginBottom: '16px',
    padding: 0,
    background: 'transparent',
    border: 'none',
  };

  const sectionTitleStyle: React.CSSProperties = {
    fontSize: '18px',
    fontWeight: 600,
    color: isLight ? '#09090b' : '#fafafa',
    marginBottom: '16px',
    display: 'block',
  };

  const inputStyle: React.CSSProperties = {
    borderRadius: '6px',
    borderColor: isLight ? '#e4e4e7' : '#27272a',
    background: isLight ? '#ffffff' : '#141414',
    color: isLight ? '#09090b' : '#fafafa',
    fontSize: '14px',
  };



  // 密钥明文展示状态
  const [revealModalVisible, setRevealModalVisible] = useState(false);
  const [revealingTokenId, setRevealingTokenId] = useState<number | null>(null);
  const [revealedKeys, setRevealedKeys] = useState<Record<number, string>>({});
  const [revealLoading, setRevealLoading] = useState(false);

  // 令牌额度使用详情弹窗状态
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedToken, setSelectedToken] = useState<ApiToken | null>(null);
  const [clearingUsage, setClearingUsage] = useState(false);

  const refreshTokenInList = async (tokenId: number): Promise<ApiToken | null> => {
    const resp = await (request.get('/tokens') as unknown as Promise<{ data: ApiToken[] }>);
    setTokens(resp.data);
    return resp.data.find(t => t.id === tokenId) ?? null;
  };

  const handleShowDetails = async (record: ApiToken) => {
    setSelectedToken(record);
    setIsDetailModalOpen(true);
    setDetailRefreshing(true);
    try {
      const fresh = await refreshTokenInList(record.id);
      if (fresh) setSelectedToken(fresh);
    } catch (e) {
      console.error(e);
    } finally {
      setDetailRefreshing(false);
    }
  };

  const handleClearUsage = async () => {
    if (!selectedToken) return;
    setClearingUsage(true);
    try {
      const updated = await (request.post(`/tokens/${selectedToken.id}/reset-usage`) as unknown as Promise<ApiToken>);
      setSelectedToken(updated);
      setTokens(prev => prev.map(t => (t.id === updated.id ? updated : t)));
      message.success(t('tokens.clear_usage_success', '已清空该令牌的使用额度数据'));
    } catch (e: any) {
      message.error(e?.message || t('tokens.clear_usage_failed', '清空失败'));
    } finally {
      setClearingUsage(false);
    }
  };

  const isLocal = window.location.hostname === 'localhost' || /^(127\.|192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(window.location.hostname);
  const baseUrl = isLocal
    ? `${window.location.protocol}//${window.location.hostname}:3000`
    : `${window.location.protocol}//${window.location.hostname}`;

  const [isHAPluginEnabled, setIsHAPluginEnabled] = useState(false);

  const fetchTokens = async () => {
    setLoading(true);
    try {
      const resp = await (request.get('/tokens') as unknown as Promise<{ data: ApiToken[] }>);
      setTokens(resp.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchPluginsState = async () => {
    try {
      const pluginRes = await (request.get('/plugins/active') as Promise<any>);
      const isActiveHA = pluginRes?.active_plugins?.some((p: any) => p.name === 'high_availability_channel');
      setIsHAPluginEnabled(!!isActiveHA);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    fetchTokens();
    fetchPluginsState();
    fetchSettings();
  }, []);

  const handleCopy = async (key: string, tokenId: number) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(key);
      } else {
        // Fallback for non-secure contexts (HTTP) or older browsers
        const textArea = document.createElement("textarea");
        textArea.value = key;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
          document.execCommand('copy');
        } finally {
          textArea.remove();
        }
      }
      setCopiedId(tokenId);
      setTimeout(() => setCopiedId(prev => prev === tokenId ? null : prev), 2000);
    } catch (err) {
      console.error('Failed to copy: ', err);
      message.error(t('tokens.copy_failed', '复制失败，请手动选择复制'));
    }
  };

  const handleAdd = () => {
    setEditingToken(null);
    setSaving(false);
    form.resetFields();
    form.setFieldsValue({
      only_playground: false,
      high_availability: false,
      daily_quota_limit: -1,
      weekly_quota_limit: -1,
      monthly_quota_limit: -1,
    });
    setEnableModelFilter(false);
    setLimitQuotaEnabled(false);
    setPeriodicQuotaEnabled(false);
    setIpFilterEnabled(false);
    setIsModalVisible(true);
  };

  const handleEdit = (record: ApiToken) => {
    setEditingToken(record);
    setSaving(false);
    const models = record.allowed_models ? (typeof record.allowed_models === 'string' ? JSON.parse(record.allowed_models) : record.allowed_models) : [];
    const hasModels = Array.isArray(models) && models.length > 0;
    setEnableModelFilter(hasModels);
    setLimitQuotaEnabled(record.quota_limit >= 0);
    setPeriodicQuotaEnabled(hasPeriodicLimits(record));
    const hasIpLimit = record.allowed_ips !== undefined && record.allowed_ips !== null && record.allowed_ips.trim() !== '';
    setIpFilterEnabled(hasIpLimit);
    form.setFieldsValue({
      ...record,
      quota_limit: record.quota_limit === -1 ? undefined : record.quota_limit,
      daily_quota_limit: record.daily_quota_limit === -1 ? undefined : record.daily_quota_limit,
      weekly_quota_limit: record.weekly_quota_limit === -1 ? undefined : record.weekly_quota_limit,
      monthly_quota_limit: record.monthly_quota_limit === -1 ? undefined : record.monthly_quota_limit,
      rps_limit: record.rps_limit === 0 ? undefined : record.rps_limit,
      rpm_limit: record.rpm_limit === 0 ? undefined : record.rpm_limit,
      only_playground: record.only_playground === 1,
      high_availability: record.high_availability === 1,
      allowed_models: Array.isArray(models) ? models.join('\n') : '',
    });
    setIsModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await request.delete(`/tokens/${id}`);
      message.success(t('common.success'));
      fetchTokens();
    } catch (e) {
      console.error(e);
    }
  };

  const executeSave = async (formValues: any, shouldDismissHA: boolean) => {
    const data = {
      ...formValues,
      quota_limit: (formValues.quota_limit === undefined || formValues.quota_limit === null) ? -1 : formValues.quota_limit,
      daily_quota_limit: (formValues.daily_quota_limit === undefined || formValues.daily_quota_limit === null) ? -1 : formValues.daily_quota_limit,
      weekly_quota_limit: (formValues.weekly_quota_limit === undefined || formValues.weekly_quota_limit === null) ? -1 : formValues.weekly_quota_limit,
      monthly_quota_limit: (formValues.monthly_quota_limit === undefined || formValues.monthly_quota_limit === null) ? -1 : formValues.monthly_quota_limit,
      rps_limit: (formValues.rps_limit === undefined || formValues.rps_limit === null) ? 0 : formValues.rps_limit,
      rpm_limit: (formValues.rpm_limit === undefined || formValues.rpm_limit === null) ? 0 : formValues.rpm_limit,
      allowed_ips: ipFilterEnabled ? (formValues.allowed_ips || '') : '',
      only_playground: formValues.only_playground ? 1 : 0,
      high_availability: formValues.high_availability ? 1 : 0,
      allowed_models: enableModelFilter
        ? (formValues.allowed_models?.split('\n').filter((m: string) => m.trim()) || [])
        : [],
    };

    try {
      const res = editingToken
        ? await (request as any).put(`/tokens/${editingToken.id}`, data, { skipErrorHandler: true })
        : await (request as any).post('/tokens', data, { skipErrorHandler: true });
      if (shouldDismissHA) {
        const tokenId = editingToken?.id ?? res?.id;
        if (tokenId) localStorage.setItem(`ha_confirm_dismiss_${tokenId}`, 'true');
      }
      message.success(t('common.success'));
      setIsModalVisible(false);
      fetchTokens();
    } catch (e: any) {
      const serverMsg = e?.response?.data?.error?.message || e?.message || t('tokens.create_failed', '创建失败');
      setIsModalVisible(false);
      message.error(serverMsg);
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async (values: { allowed_models?: string; allowed_ips?: string; [key: string]: unknown }) => {
    const isDismissed = editingToken && localStorage.getItem(`ha_confirm_dismiss_${editingToken.id}`) === 'true';

    if (values.high_availability && !isDismissed) {
      setTempValues(values);
      setHaConfirmDismiss(false);
      setIsHAConfirmModalOpen(true);
    } else {
      executeSave(values, false);
    }
  };

  // 打开密码验证弹窗
  const handleRevealClick = (tokenId: number) => {
    if (revealedKeys[tokenId]) {
      // 已经展示了，点击则隐藏
      setRevealedKeys(prev => {
        const next = { ...prev };
        delete next[tokenId];
        return next;
      });
      return;
    }
    setRevealingTokenId(tokenId);
    passwordForm.resetFields();
    setRevealModalVisible(true);
  };

  // 提交密码验证并展示密钥
  const handleRevealSubmit = async () => {
    try {
      const values = await passwordForm.validateFields();
      setRevealLoading(true);
      const resp = await (request.post(`/tokens/${revealingTokenId}/reveal`, {
        password: values.password,
      }) as unknown as Promise<{ token_key: string }>);
      setRevealedKeys(prev => ({ ...prev, [revealingTokenId!]: resp.token_key }));
      setRevealModalVisible(false);
      message.success(t('tokens.key_revealed', '密钥已展示'));
    } catch (e: any) {
      // error is handled by request interceptor
      console.error(e);
    } finally {
      setRevealLoading(false);
    }
  };

  // 渲染密钥列内容（桌面端）
  const renderTokenKey = (key: string, record: ApiToken) => {
    const isRevealed = !!revealedKeys[record.id];
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        width: 'max-content',
      }}>
        {isRevealed ? (
          <Text
            style={{ fontFamily: 'monospace', fontSize: 13, color: themeToken.colorText, letterSpacing: '0.5px', userSelect: 'all' }}
            copyable={{ text: revealedKeys[record.id] }}
          >
            {revealedKeys[record.id]}
          </Text>
        ) : (
          <Text style={{ fontFamily: 'monospace', fontSize: 13, color: themeToken.colorText, letterSpacing: '0.5px' }}>
            {key.substring(0, 10)}<span style={{color: '#666', margin: '0 4px'}}>••••••••</span>{key.substring(key.length - 6)}
          </Text>
        )}
        <Tooltip title={copiedId === record.id ? t('tokens.copied', '已复制!') : t('tokens.copy_hint')}>
          <Button 
            type="text" 
            icon={copiedId === record.id ? <CheckOutlined style={{ color: themeToken.colorText }} /> : <CopyOutlined />} 
            size="small" 
            onClick={() => handleCopy(isRevealed ? revealedKeys[record.id] : key, record.id)} 
            style={{ color: copiedId === record.id ? themeToken.colorText : '#888', marginLeft: 8 }} 
          />
        </Tooltip>
        <Tooltip title={isRevealed ? t('tokens.hide_key', '隐藏密钥') : t('tokens.view_key', '查看完整密钥')}>
          <Button 
            type="text" 
            icon={isRevealed ? <EyeInvisibleOutlined /> : <EyeOutlined />} 
            size="small" 
            onClick={() => handleRevealClick(record.id)} 
            style={{ color: isRevealed ? themeToken.colorText : '#888' }} 
          />
        </Tooltip>
      </div>
    );
  };

  const columns = [
    {
      title: '令牌(KID)',
      dataIndex: 'kid',
      key: 'kid',
      width: 110,
      render: (kid: string) => kid ? <Tag color="default" style={{ fontFamily: 'monospace', fontSize: 12 }}>{kid}</Tag> : <Text type="secondary">-</Text>,
    },
    {
      title: t('tokens.name'),
      dataIndex: 'name',
      key: 'name',
      sorter: (a: ApiToken, b: ApiToken) => a.name.localeCompare(b.name),
      render: (text: string, record: ApiToken) => {
        const isPlayground = record.only_playground === 1;
        const isActive = record.is_active === 1 || record.is_active === true;
        return (
          <Space direction="vertical" size={4} style={{ display: 'flex' }}>
            <Text strong>{text}</Text>
            <Space size={4} wrap>
              <Tag color={isPlayground ? 'orange' : 'blue'} style={{ margin: 0, fontSize: '11px', padding: '0 4px', lineHeight: '16px' }}>
                {isPlayground ? t('tokens.playground_only', '仅创作中心') : t('tokens.general', '通用')}
              </Tag>
              <Tag color={isActive ? 'success' : 'default'} style={{ margin: 0, fontSize: '11px', padding: '0 4px', lineHeight: '16px' }}>
                {isActive ? t('common.active', '启用') : t('common.disabled', '禁用')}
              </Tag>
            </Space>
          </Space>
        );
      },
    },
    {
      title: t('tokens.key'),
      dataIndex: 'token_key',
      key: 'token_key',
      render: (key: string, record: ApiToken) => renderTokenKey(key, record),
    },
    {
      title: t('tokens.usage_quota'),
      key: 'usage',
      sorter: (a: ApiToken, b: ApiToken) => a.quota_used - b.quota_used,
      render: (record: ApiToken) => {
        const { dailyUsed, weeklyUsed, monthlyUsed } = getPeriodicUsed(record, quotaTz);
        const periodic = hasPeriodicLimits(record);

        const periodicTooltipContent = (
          <div style={{ fontSize: '12px', padding: '4px' }}>
            <div style={{ fontWeight: 600, marginBottom: '4px' }}>周期额度详情：</div>
            <div style={{ marginBottom: '2px' }}>日限额: {record.daily_quota_limit < 0 ? '无限' : `${dailyUsed.toFixed(6)} / ${record.daily_quota_limit}`}</div>
            <div style={{ marginBottom: '2px' }}>周限额: {record.weekly_quota_limit < 0 ? '无限' : `${weeklyUsed.toFixed(6)} / ${record.weekly_quota_limit}`}</div>
            <div>月限额: {record.monthly_quota_limit < 0 ? '无限' : `${monthlyUsed.toFixed(6)} / ${record.monthly_quota_limit}`}</div>
          </div>
        );

        return (
          <Tooltip title={periodic ? periodicTooltipContent : null}>
            <Space direction="vertical" size={2} style={{ cursor: periodic ? 'pointer' : 'default' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {t('tokens.used')}: {record.quota_used.toFixed(6)}
              </Text>
              <Text style={{ fontSize: 12 }}>
                {t('tokens.limit')}: {record.quota_limit < 0 ? t('tokens.unlimited') : record.quota_limit}
                {periodic && <span style={{ marginLeft: '4px', color: '#1890ff', fontSize: '10px', fontWeight: 500 }}>[周期限额]</span>}
              </Text>
            </Space>
          </Tooltip>
        );
      },
    },
    {
      title: t('tokens.limits'),
      key: 'limits',
      render: (record: ApiToken) => (
        <Space direction="vertical" size={2}>
          <Text type="secondary" style={{ fontSize: 12 }}>RPS: {record.rps_limit || '∞'}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>RPM: {record.rpm_limit || '∞'}</Text>
        </Space>
      ),
    },
    {
      title: t('tokens.time_info', '时间信息'),
      key: 'times',
      sorter: (a: ApiToken, b: ApiToken) => dayjs(a.created_at).unix() - dayjs(b.created_at).unix(),
      render: (record: ApiToken) => (
        <Space direction="vertical" size={2}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t('tokens.created_at', '创建: ')}{dayjs(record.created_at).format('YYYY-MM-DD HH:mm')}
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t('tokens.last_used_at', '最后使用: ')}{record.last_used_at ? record.last_used_at : t('tokens.never_used', '从未')}
          </Text>
        </Space>
      ),
    },
    {
      title: t('common.actions'),
      key: 'actions',
      render: (_: unknown, record: ApiToken) => (
        <Space>
          <Tooltip title="额度详情">
            <Button icon={<PieChartOutlined />} onClick={() => handleShowDetails(record)} />
          </Tooltip>
          <Button icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          <Popconfirm title={t('common.confirm_delete')} onConfirm={() => handleDelete(record.id)}>
            <Button icon={<DeleteOutlined />} danger />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card 
      variant="borderless" 
      style={{ 
        minHeight: '60vh', 
        display: 'flex', 
        flexDirection: 'column',
        background: screens.xs ? 'transparent' : (isLight ? '#fff' : 'rgba(255,255,255,0.02)'), 
        boxShadow: screens.xs ? 'none' : undefined
      }} 
      styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column', padding: screens.xs ? 0 : '16px 24px 24px' } }}
    >
      {!isModalVisible ? (
        <>
          {loading && tokens.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Spin size="large" />
        </div>
      ) : tokens.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          <div style={{ marginBottom: 48 }}>
             <Title level={screens.xs ? 4 : 2} style={{ margin: 0, marginBottom: 8, display: 'flex', alignItems: 'baseline' }}>
               {t('tokens.title')}
               <Text type="secondary" style={{ fontSize: 14, marginLeft: 12, fontWeight: 'normal' }}>{t('tokens.subtitle')}</Text>
             </Title>
             <div style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: 12, background: isLight ? '#f5f5f5' : 'rgba(255,255,255,0.04)', padding: '8px 16px', borderRadius: 8, border: `1px solid ${isLight ? '#e5e5e5' : '#333'}` }}>
                <Text type="secondary" style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' }}>{t('tokens.api_base_url', 'API Base URL:')}</Text>
                <Text 
                  style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 'bold', color: themeToken.colorText, wordBreak: 'break-all' }}
                  copyable={{ 
                    text: baseUrl,
                    icon: [
                      <CopyOutlined key="copy-icon" style={{ color: themeToken.colorTextSecondary }} />,
                      <CheckOutlined key="copied-icon" style={{ color: themeToken.colorText }} />
                    ]
                  }}
                >
                  {baseUrl}
                </Text>
             </div>
          </div>
          
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingBottom: '10vh' }}>
             <div style={{
                width: 48, 
                height: 48, 
                background: 'rgba(255, 255, 255, 0.08)',
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 24,
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
             }}>
               <KeyOutlined style={{ fontSize: 24, color: themeToken.colorText }} />
             </div>
             <Title level={4} style={{ margin: 0, marginBottom: 12 }}>{t('tokens.empty_title')}</Title>
             <Text type="secondary" style={{ marginBottom: 24 }}>{t('tokens.empty_desc')}</Text>
             <Button type="primary" size="large" onClick={handleAdd} style={{ padding: '0 32px' }}>
                {t('tokens.create')}
             </Button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          <div style={{ display: 'flex', flexDirection: screens.xs ? 'column' : 'row', justifyContent: 'space-between', marginBottom: 24, gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <Title level={screens.xs ? 4 : 2} style={{ margin: 0, display: 'flex', alignItems: 'baseline' }}>
                {t('tokens.title')}
                <Text type="secondary" style={{ fontSize: 13, marginLeft: 12, fontWeight: 'normal' }}>{t('tokens.subtitle')}</Text>
              </Title>
              <div style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: 12, background: isLight ? '#f5f5f5' : 'rgba(255,255,255,0.04)', padding: '8px 16px', borderRadius: 8, border: `1px solid ${isLight ? '#e5e5e5' : '#333'}` }}>
                <Text type="secondary" style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' }}>{t('tokens.api_base_url', 'API Base URL:')}</Text>
                <Text 
                  style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 'bold', color: themeToken.colorText, wordBreak: 'break-all' }}
                  copyable={{ 
                    text: baseUrl,
                    icon: [
                      <CopyOutlined key="copy-icon" style={{ color: themeToken.colorTextSecondary }} />,
                      <CheckOutlined key="copied-icon" style={{ color: themeToken.colorText }} />
                    ]
                  }}
                >
                  {baseUrl}
                </Text>
              </div>
            </div>
            <Space style={{ alignItems: 'flex-start', gap: '12px' }}>
              <Button 
                type="text" 
                icon={<FileTextOutlined style={{ fontSize: '15px' }} />} 
                onClick={() => window.open('/docs', '_blank')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  color: isLight ? '#71717a' : '#a1a1aa',
                  fontWeight: 500,
                  fontSize: '14px',
                  padding: '4px 8px',
                  height: '36px'
                }}
              >
                API 快速入门
              </Button>
              <Button 
                type="primary" 
                icon={<KeyOutlined style={{ fontSize: '15px' }} />} 
                onClick={handleAdd}
                style={{
                  borderRadius: '6px',
                  background: isLight ? '#09090b' : '#fafafa',
                  color: isLight ? '#ffffff' : '#09090b',
                  border: 'none',
                  fontSize: '14px',
                  fontWeight: 500,
                  height: '36px',
                  padding: '0 16px',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                创建 API 令牌
              </Button>
            </Space>
          </div>

          {screens.xs ? (
            <MobileCardList
              dataSource={tokens}
              loading={loading}
              rowKey="id"
              compact={true}
              gap={10}
              pagination={{ pageSize: 10 }}
              renderCard={(record: any) => {
                const isRevealed = !!revealedKeys[record.id];
                const displayedKey = isRevealed 
                  ? revealedKeys[record.id] 
                  : (record.token_key.length > 8 ? `...${record.token_key.slice(-6)}` : record.token_key);

                const cardTitle = (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <Text
                      ellipsis={isRevealed ? false : { tooltip: false }}
                      style={{
                        fontSize: isRevealed ? 13 : 16,
                        fontWeight: '600',
                        color: themeToken.colorText,
                        fontFamily: 'monospace',
                        cursor: 'pointer',
                        wordBreak: 'break-all',
                        whiteSpace: isRevealed ? 'normal' : 'nowrap',
                        display: 'block'
                      }}
                      onClick={() => handleCopy(isRevealed ? revealedKeys[record.id] : record.token_key, record.id)}
                    >
                      {displayedKey}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12, marginTop: 4, fontWeight: 'normal' }}>
                      {record.name}
                    </Text>
                  </div>
                );

                const cardExtra = (
                  <Space size={2} align="center">
                    <Tooltip title={copiedId === record.id ? t('tokens.copied', '已复制!') : t('tokens.copy_hint')}>
                      <Button 
                        type="text" 
                        size="small" 
                        icon={copiedId === record.id ? <CheckOutlined style={{ color: themeToken.colorText }} /> : <CopyOutlined style={{ fontSize: 15 }} />} 
                        onClick={() => handleCopy(isRevealed ? revealedKeys[record.id] : record.token_key, record.id)}
                        style={{ color: copiedId === record.id ? themeToken.colorText : undefined }}
                      />
                    </Tooltip>
                    <Tooltip title={isRevealed ? t('tokens.hide_key', '隐藏密钥') : t('tokens.view_key', '查看完整密钥')}>
                      <Button 
                        type="text" 
                        size="small" 
                        icon={isRevealed ? <EyeInvisibleOutlined style={{ fontSize: 15 }} /> : <EyeOutlined style={{ fontSize: 15 }} />} 
                        onClick={() => handleRevealClick(record.id)}
                        style={{ color: isRevealed ? themeToken.colorText : undefined }}
                      />
                    </Tooltip>
                    <Link to="/logs">
                      <Tooltip title="查看使用日志">
                        <Button 
                          type="text" 
                          size="small" 
                          icon={<BarChartOutlined style={{ fontSize: 15 }} />} 
                        />
                      </Tooltip>
                    </Link>
                    <Dropdown
                      menu={{
                        items: [
                          {
                            key: 'details',
                            label: '额度详情',
                            icon: <PieChartOutlined />,
                            onClick: () => handleShowDetails(record)
                          },
                          {
                            key: 'edit',
                            label: '编辑令牌',
                            icon: <EditOutlined />,
                            onClick: () => handleEdit(record)
                          },
                          {
                            key: 'delete',
                            label: <Text>删除令牌</Text>,
                            icon: <DeleteOutlined />,
                            onClick: () => {
                              Modal.confirm({
                                title: t('common.confirm_delete'),
                                okText: t('common.confirm'),
                                okType: 'danger',
                                cancelText: t('common.cancel'),
                                onOk: () => handleDelete(record.id)
                              });
                            }
                          }
                        ]
                      }}
                      trigger={['click']}
                    >
                      <Button type="text" size="small" icon={<EllipsisOutlined style={{ fontSize: 15 }} />} />
                    </Dropdown>
                  </Space>
                );

                return (
                  <MobileCard
                    compact={true}
                    style={{ background: isLight ? '#fff' : '#141414', border: 'none', borderRadius: 12, padding: '12px' }}
                    title={cardTitle}
                    extra={cardExtra}
                  >
                    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <CardRow label="令牌(KID)" compact={true}>
                        {record.kid ? <Tag color="default" style={{ fontFamily: 'monospace', fontSize: 11, margin: 0 }}>{record.kid}</Tag> : <Text type="secondary">-</Text>}
                      </CardRow>
                      <CardRow label="密钥状态" compact={true}>
                        <Tag color="default" style={{ margin: 0 }}>{record.is_active ? t('common.active') : t('common.disabled')}</Tag>
                      </CardRow>
                      <CardRow label="可用限额" compact={true}>
                        <Space direction="vertical" size={0}>
                          <Text style={{ fontSize: 12 }}>{record.quota_limit < 0 ? t('tokens.unlimited') : `${record.quota_used.toFixed(6)} / ${record.quota_limit}`}</Text>
                          {hasPeriodicLimits(record) && (() => {
                            const { dailyUsed, weeklyUsed, monthlyUsed } = getPeriodicUsed(record, quotaTz);
                            const parts: string[] = [];
                            if (record.daily_quota_limit >= 0) parts.push(`日 ${dailyUsed.toFixed(6)}/${record.daily_quota_limit}`);
                            if (record.weekly_quota_limit >= 0) parts.push(`周 ${weeklyUsed.toFixed(6)}/${record.weekly_quota_limit}`);
                            if (record.monthly_quota_limit >= 0) parts.push(`月 ${monthlyUsed.toFixed(6)}/${record.monthly_quota_limit}`);
                            return parts.length > 0 ? (
                              <Text type="secondary" style={{ fontSize: 11 }}>{parts.join(' · ')}</Text>
                            ) : null;
                          })()}
                        </Space>
                      </CardRow>
                      <CardRow label="使用范围" compact={true}>
                        <Tag color={record.only_playground === 1 ? 'blue' : 'gray'} style={{ fontSize: 11, margin: 0 }}>
                          {record.only_playground === 1 ? t('tokens.playground_only', '仅创作中心') : t('tokens.general', '通用')}
                        </Tag>
                      </CardRow>
                      <CardRow label="速率限制" compact={true}>
                        <Text type="secondary" style={{ fontSize: 12 }}>RPS: {record.rps_limit || '∞'} · RPM: {record.rpm_limit || '∞'}</Text>
                      </CardRow>
                      <CardRow label="创建日期" compact={true}>
                        <Text type="secondary" style={{ fontSize: 12 }}>{dayjs(record.created_at).format('YYYY年M月D日')}</Text>
                      </CardRow>
                    </div>
                  </MobileCard>
                );
              }}
            />
          ) : (
            <Table
              dataSource={tokens}
              columns={columns}
              rowKey="id"
              loading={loading}
              pagination={{ pageSize: 10 }}
              scroll={{ x: 'max-content' }}
            />
          )}
        </div>
      )}
        </>
      ) : (
        <div style={{ 
          width: '100%',
          padding: screens.xs ? '8px 0' : '4px 0 24px 0',
          animation: 'fadeIn 0.25s ease'
        }}>
          {/* 注入符合 shadcn 风格的 input 样式与 focus ring */}
          <style>{`
            /* 覆盖 Ant Design 输入框默认聚焦轮廓线 */
            .ant-input.shadcn-input:focus,
            .ant-input-focused.shadcn-input,
            .ant-input-number.shadcn-input:focus,
            .ant-input-number-focused.shadcn-input,
            .ant-input-affix-wrapper-focused.shadcn-input,
            .ant-input-affix-wrapper.shadcn-input:focus,
            .ant-input-textarea.shadcn-input:focus,
            .ant-input-textarea-focused.shadcn-input {
              border-color: ${isLight ? '#09090b' : '#fafafa'} !important;
              box-shadow: 0 0 0 2px ${isLight ? 'rgba(9, 9, 11, 0.1)' : 'rgba(250, 250, 250, 0.15)'} !important;
              outline: 0 !important;
            }
            
            /* 输入框 Placeholder 样式 */
            .shadcn-input::placeholder,
            .shadcn-input .ant-input::placeholder {
              color: ${isLight ? '#a1a1aa' : '#52525b'} !important;
              opacity: 1;
            }
            
            /* Antd input 悬浮状态 */
            .ant-input.shadcn-input:hover,
            .ant-input-number.shadcn-input:hover,
            .ant-input-affix-wrapper.shadcn-input:hover {
              border-color: ${isLight ? '#d4d4d8' : '#3f3f46'} !important;
            }
            
            /* 覆写 antd input addonBefore 背景及边框 */
            .ant-input-group-wrapper.shadcn-input .ant-input-group-addon {
              background-color: ${isLight ? '#fafafa' : '#18181b'} !important;
              border-color: ${isLight ? '#e4e4e7' : '#27272a'} !important;
              border-radius: 6px 0 0 6px !important;
            }
            
            /* 覆写 antd textarea */
            .ant-input-textarea.shadcn-input textarea {
              background: transparent !important;
              color: ${isLight ? '#09090b' : '#fafafa'} !important;
            }
            .ant-input-textarea.shadcn-input textarea:focus {
              border-color: ${isLight ? '#09090b' : '#fafafa'} !important;
              box-shadow: 0 0 0 2px ${isLight ? 'rgba(9, 9, 11, 0.1)' : 'rgba(250, 250, 250, 0.15)'} !important;
            }
            
            /* 自定义中央弹出动画 */
            .center-popup-modal .ant-modal-content {
              animation: centerZoomIn 0.28s cubic-bezier(0.34, 1.56, 0.64, 1) forwards !important;
            }
            @keyframes centerZoomIn {
              0% {
                opacity: 0;
                transform: scale(0.85);
              }
              100% {
                opacity: 1;
                transform: scale(1);
              }
            }
            .center-popup-modal .ant-modal-close:focus-visible,
            .center-popup-modal .ant-modal-close:focus,
            .center-popup-modal .ant-modal-close:hover {
              outline: none !important;
              box-shadow: none !important;
            }
            .center-popup-modal .ant-modal-header {
              background: transparent !important;
              border-bottom: none !important;
            }
          `}</style>

          {/* 返回按钮与辅助信息 */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            marginBottom: '8px' 
          }}>
            <Button 
              type="text" 
              icon={<ArrowLeftOutlined style={{ fontSize: '15px' }} />} 
              onClick={() => setIsModalVisible(false)}
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                color: isLight ? '#71717a' : '#a1a1aa',
                padding: '4px 8px',
                height: 'auto',
                fontSize: '16px',
                fontWeight: 500
              }}
            >
              {t('common.back', '返回列表')}
            </Button>
            
          </div>

          {/* 表单主区域平铺 */}
          <div
            style={{
              padding: screens.xs ? '8px 0 16px 0' : '12px 0 24px 0'
            }}
          >
            {/* 头部说明 */}
            <div style={{ marginBottom: '28px' }}>
              <Title level={3} style={{ margin: '0 0 6px 0', fontSize: '24px', fontWeight: 600, color: isLight ? '#09090b' : '#fafafa', letterSpacing: '-0.3px' }}>
                {editingToken ? t('tokens.edit') : t('tokens.create')}
              </Title>
              <Text style={{ fontSize: '14px', lineHeight: '1.5', display: 'block', color: isLight ? '#71717a' : '#a1a1aa' }}>
                {editingToken 
                  ? t('tokens.edit_desc', '修改当前令牌的限制和配置信息') 
                  : t('tokens.create_desc', '新建一个 API 访问令牌，用于调用站内的 AI 模型')}
              </Text>
            </div>

            <Form form={form} layout="vertical" onFinish={handleSave} onFinishFailed={() => setSaving(false)}>
              
              {/* 区块一：基础配置 */}
              <div style={sectionContainerStyle}>

                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item 
                      name="name" 
                      label={<Text style={{ fontSize: '14px', fontWeight: 500, color: isLight ? '#09090b' : '#fafafa' }}>{t('tokens.name')}</Text>} 
                      rules={[
                        { required: true, message: t('tokens.name_required', '请输入令牌名称') },
                        { max: 24, message: t('tokens.name_max_length', '令牌名称不能超过 24 个字符') },
                        {
                          pattern: /^[\p{L}\p{N}\s_-]+$/u,
                          message: t('tokens.name_invalid_chars', '不支持标点符号'),
                        }
                      ]} 
                      initialValue="default"
                      style={{ marginBottom: '20px' }}
                    >
                      <Input placeholder="e.g. Project A" size="large" style={inputStyle} className="shadcn-input" maxLength={24} />
                    </Form.Item>
                  </Col>

                  <Col span={6}>
                    <Form.Item 
                      name="rps_limit" 
                      label={
                        <Space size={4}>
                          <Text style={{ fontSize: '14px', fontWeight: 500, color: isLight ? '#09090b' : '#fafafa' }}>RPS Limit</Text>
                          <Tooltip title={t('tokens.rps_limit_tooltip', '每秒请求数限制，0代表不限制')}>
                            <span style={{ cursor: 'pointer', color: isLight ? '#71717a' : '#a1a1aa', fontSize: '13px' }}>ⓘ</span>
                          </Tooltip>
                        </Space>
                      } 
                      style={{ marginBottom: '20px' }}
                    >
                      <InputNumber min={0} size="large" style={{ ...inputStyle, width: '100%' }} className="shadcn-input" placeholder="无限" />
                    </Form.Item>
                  </Col>

                  <Col span={6}>
                    <Form.Item 
                      name="rpm_limit" 
                      label={
                        <Space size={4}>
                          <Text style={{ fontSize: '14px', fontWeight: 500, color: isLight ? '#09090b' : '#fafafa' }}>RPM Limit</Text>
                          <Tooltip title={t('tokens.rpm_limit_tooltip', '每分钟请求数限制，0代表不限制')}>
                            <span style={{ cursor: 'pointer', color: isLight ? '#71717a' : '#a1a1aa', fontSize: '13px' }}>ⓘ</span>
                          </Tooltip>
                        </Space>
                      } 
                      style={{ marginBottom: '20px' }}
                    >
                      <InputNumber min={0} size="large" style={{ ...inputStyle, width: '100%' }} className="shadcn-input" placeholder="无限" />
                    </Form.Item>
                  </Col>
                </Row>

                {/* 高可用通道开关 */}
                {isHAPluginEnabled && (
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    boxSizing: 'border-box',
                    padding: '8px 0',
                    marginBottom: '12px'
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingRight: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Text style={{ fontSize: '14px', fontWeight: 500, color: isLight ? '#09090b' : '#fafafa' }}>{t('tokens.high_availability_label', '高可用通道')}</Text>
                        <Tooltip title={t('tokens.high_availability_tooltip', '开启后，当调用物理渠道遇到网关错误、5xx、429 等故障时，系统会自动重试并秒级切换到同虚拟组内的备选渠道。')}>
                          <span style={{ cursor: 'pointer', color: isLight ? '#09090b' : '#fafafa', fontSize: '13px' }}>ⓘ</span>
                        </Tooltip>
                      </div>
                      <Text style={{ fontSize: '13px', lineHeight: '1.4', color: isLight ? '#71717a' : '#a1a1aa' }}>
                        仅针对管理后台分组里已开启的高可用渠道生效，普通渠道无自动切换功能。
                      </Text>
                    </div>
                    <Form.Item name="high_availability" valuePropName="checked" noStyle>
                      <AppSwitch />
                    </Form.Item>
                  </div>
                )}

                {/* 限制总额度开关 */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  boxSizing: 'border-box',
                  padding: '8px 0',
                  marginBottom: limitQuotaEnabled ? '12px' : '0px'
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingRight: '12px' }}>
                    <Text style={{ fontSize: '14px', fontWeight: 500, color: isLight ? '#09090b' : '#fafafa' }}>{t('tokens.limit_total_quota', '限制总额度')}</Text>
                    <Text style={{ fontSize: '13px', lineHeight: '1.4', color: isLight ? '#71717a' : '#a1a1aa' }}>
                      {limitQuotaEnabled ? t('tokens.limited_quota_desc', '额度消耗完令牌失效') : t('tokens.unlimited_quota_desc', '不限制使用额度')}
                    </Text>
                  </div>
                  <AppSwitch
                    checked={limitQuotaEnabled}
                    onChange={(checked) => {
                      setLimitQuotaEnabled(checked);
                      if (!checked) {
                        form.setFieldsValue({ quota_limit: -1 });
                      } else {
                        const currentVal = form.getFieldValue('quota_limit');
                        if (currentVal === -1) {
                          form.setFieldsValue({ quota_limit: undefined });
                        }
                      }
                    }}
                  />
                </div>

                {limitQuotaEnabled && (
                  <Form.Item 
                    name="quota_limit" 
                    style={{ marginBottom: 0 }}
                  >
                    <InputNumber 
                      min={0}
                      size="large"
                      style={{ ...inputStyle, width: '100%' }} 
                      className="shadcn-input"
                      placeholder="无限"
                    />
                  </Form.Item>
                )}

                {!limitQuotaEnabled && (
                  <Form.Item name="quota_limit" initialValue={-1} hidden>
                    <InputNumber />
                  </Form.Item>
                )}

                {/* 周期额度限制开关 */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  boxSizing: 'border-box',
                  padding: '8px 0',
                  marginTop: '16px',
                  marginBottom: periodicQuotaEnabled ? '12px' : '0px'
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingRight: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Text style={{ fontSize: '14px', fontWeight: 500, color: isLight ? '#09090b' : '#fafafa' }}>{t('tokens.periodic_quota_limits', '周期额度限制')}</Text>
                      <Tooltip title={t('tokens.periodic_quota_tooltip', '设定令牌在日、周、月等周期内的最高使用额度。')}>
                        <span style={{ cursor: 'pointer', color: isLight ? '#71717a' : '#a1a1aa', fontSize: '13px' }}>ⓘ</span>
                      </Tooltip>
                    </div>
                    <Text style={{ fontSize: '13px', lineHeight: '1.4', color: isLight ? '#71717a' : '#a1a1aa' }}>
                      按日、周、月循环控制额度消耗上限
                    </Text>
                  </div>
                  <AppSwitch
                    checked={periodicQuotaEnabled}
                    onChange={(checked) => {
                      setPeriodicQuotaEnabled(checked);
                      if (!checked) {
                        form.setFieldsValue({
                          daily_quota_limit: -1,
                          weekly_quota_limit: -1,
                          monthly_quota_limit: -1,
                        });
                      } else {
                        const dailyVal = form.getFieldValue('daily_quota_limit');
                        const weeklyVal = form.getFieldValue('weekly_quota_limit');
                        const monthlyVal = form.getFieldValue('monthly_quota_limit');
                        
                        form.setFieldsValue({
                          daily_quota_limit: (dailyVal === undefined || dailyVal === -1) ? undefined : dailyVal,
                          weekly_quota_limit: (weeklyVal === undefined || weeklyVal === -1) ? undefined : weeklyVal,
                          monthly_quota_limit: (monthlyVal === undefined || monthlyVal === -1) ? undefined : monthlyVal,
                        });
                      }
                    }}
                  />
                </div>

                {periodicQuotaEnabled && (
                  <div style={{ animation: 'fadeIn 0.25s ease', marginBottom: '16px' }}>
                    <Row gutter={16}>
                      <Col xs={24} sm={8}>
                        <Form.Item 
                          name="daily_quota_limit" 
                          label={<Text style={{ fontSize: '13px', fontWeight: 500, color: isLight ? '#09090b' : '#fafafa' }}>{t('tokens.daily_limit', '日额度限额')}</Text>} 
                          style={{ marginBottom: screens.xs ? '12px' : 0 }}
                        >
                          <InputNumber 
                            min={0}
                            size="large"
                            style={{ ...inputStyle, width: '100%' }} 
                            className="shadcn-input"
                            placeholder="无限"
                          />
                        </Form.Item>
                      </Col>
                      
                      <Col xs={24} sm={8}>
                        <Form.Item 
                          name="weekly_quota_limit" 
                          label={<Text style={{ fontSize: '13px', fontWeight: 500, color: isLight ? '#09090b' : '#fafafa' }}>{t('tokens.weekly_limit', '周额度限额')}</Text>} 
                          style={{ marginBottom: screens.xs ? '12px' : 0 }}
                        >
                          <InputNumber 
                            min={0}
                            size="large"
                            style={{ ...inputStyle, width: '100%' }} 
                            className="shadcn-input"
                            placeholder="无限"
                          />
                        </Form.Item>
                      </Col>
                      
                      <Col xs={24} sm={8}>
                        <Form.Item 
                          name="monthly_quota_limit" 
                          label={<Text style={{ fontSize: '13px', fontWeight: 500, color: isLight ? '#09090b' : '#fafafa' }}>{t('tokens.monthly_limit', '月额度限额')}</Text>} 
                          style={{ marginBottom: 0 }}
                        >
                          <InputNumber 
                            min={0}
                            size="large"
                            style={{ ...inputStyle, width: '100%' }} 
                            className="shadcn-input"
                            placeholder="无限"
                          />
                        </Form.Item>
                      </Col>
                    </Row>
                  </div>
                )}

                {!periodicQuotaEnabled && (
                  <>
                    <Form.Item name="daily_quota_limit" initialValue={-1} hidden>
                      <InputNumber />
                    </Form.Item>
                    <Form.Item name="weekly_quota_limit" initialValue={-1} hidden>
                      <InputNumber />
                    </Form.Item>
                    <Form.Item name="monthly_quota_limit" initialValue={-1} hidden>
                      <InputNumber />
                    </Form.Item>
                  </>
                )}

              </div>

              {/* 区块二：访问控制 */}
              <div style={sectionContainerStyle}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  height: '100%',
                  boxSizing: 'border-box',
                  padding: '8px 0',
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingRight: '12px' }}>
                    <Text style={{ fontSize: '14px', fontWeight: 500, color: isLight ? '#09090b' : '#fafafa' }}>{t('tokens.playground_only_limit', '仅创作中心使用')}</Text>
                    <Text style={{ fontSize: '13px', lineHeight: '1.3', color: isLight ? '#71717a' : '#a1a1aa' }}>
                      令牌限制仅在创作中心内可用
                    </Text>
                  </div>
                  <Form.Item name="only_playground" valuePropName="checked" noStyle>
                    <AppSwitch />
                  </Form.Item>
                </div>
              </div>

              {/* 区块三：模型与路由 */}
              <div style={sectionContainerStyle}>

                {/* 指定模型开关行 */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 0',
                  marginBottom: enableModelFilter ? '16px' : '0px',
                  transition: 'all 0.2s',
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingRight: '12px' }}>
                    <Text style={{ fontSize: '14px', fontWeight: 500, color: isLight ? '#09090b' : '#fafafa' }}>{t('tokens.limit_models_switch', '限制模型')}</Text>
                    <Text style={{ fontSize: '13px', lineHeight: '1.4', color: isLight ? '#71717a' : '#a1a1aa' }}>
                      {enableModelFilter ? t('tokens.models_enabled_desc', '仅允许请求下方指定的模型') : t('tokens.models_disabled_desc', '全站模型都可以使用，一般不需要修改')}
                    </Text>
                  </div>
                  <AppSwitch
                    checked={enableModelFilter}
                    onChange={(checked) => {
                      setEnableModelFilter(checked);
                      if (!checked) {
                        form.setFieldsValue({ allowed_models: '' });
                      }
                    }}
                  />
                </div>

                {enableModelFilter && (
                  <div style={{ 
                    animation: 'fadeIn 0.25s ease',
                    marginBottom: '0px',
                    marginTop: '16px'
                  }}>

                    <Form.Item
                      name="allowed_models"
                      style={{ marginBottom: 0 }}
                      extra={
                        <div style={{ fontSize: 12, color: isLight ? '#71717a' : '#a1a1aa', lineHeight: 1.6, marginTop: 6 }}>
                          <div>{t('tokens.models_hint_1', '📌 每行填写一个模型名称（model ID），例如：')}</div>
                          <div style={{ fontFamily: 'monospace', color: isLight ? '#71717a' : '#a1a1aa', padding: '4px 0 4px 12px', fontSize: '12px' }}>
                            gpt-4o<br />
                            claude-sonnet-4-20250514<br />
                            ep-tokensbyte2a7f9x3k
                          </div>
                          <div>{t('tokens.models_hint_2', '模型名称需与站内已配置的模型 ID 完全一致，不区分大小写。')}</div>
                        </div>
                      }
                    >
                      <Input.TextArea
                        rows={4}
                        style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '14px' }}
                        className="shadcn-input"
                        placeholder={t('tokens.models_placeholder', '请输入允许使用的模型名称，每行一个\n例如：\ngpt-4o\nclaude-sonnet-4-20250514\nep-tokensbyteXXXXXXXX')}
                      />
                    </Form.Item>
                  </div>
                )}

                {/* IP 白名单开关 */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  boxSizing: 'border-box',
                  padding: '8px 0',
                  marginTop: '16px',
                  marginBottom: ipFilterEnabled ? '12px' : '0px'
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingRight: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Text style={{ fontSize: '14px', fontWeight: 500, color: isLight ? '#09090b' : '#fafafa' }}>IP 白名单</Text>
                      <Tooltip title="限制允许调用该令牌的客户端 IP 地址。支持多个 IP，以英文逗号分隔。">
                        <span style={{ cursor: 'pointer', color: isLight ? '#71717a' : '#a1a1aa', fontSize: '13px' }}>ⓘ</span>
                      </Tooltip>
                    </div>
                    <Text style={{ fontSize: '13px', lineHeight: '1.4', color: isLight ? '#71717a' : '#a1a1aa' }}>
                      限制允许使用该令牌调用的客户端 IP 范围
                    </Text>
                  </div>
                  <AppSwitch
                    checked={ipFilterEnabled}
                    onChange={(checked) => {
                      setIpFilterEnabled(checked);
                      if (!checked) {
                        form.setFieldsValue({ allowed_ips: '' });
                      }
                    }}
                  />
                </div>

                {ipFilterEnabled && (
                  <div style={{ animation: 'fadeIn 0.25s ease', marginTop: '12px' }}>
                    <Form.Item 
                      name="allowed_ips" 
                      style={{ marginBottom: 0 }}
                    >
                      <Input placeholder="e.g. 192.168.1.1, 10.0.0.1" size="large" style={inputStyle} className="shadcn-input" />
                    </Form.Item>
                  </div>
                )}

                {!ipFilterEnabled && (
                  <Form.Item name="allowed_ips" initialValue="" hidden>
                    <Input />
                  </Form.Item>
                )}
              </div>

              {/* 底部操作按钮区域 */}
              <div style={{ 
                marginTop: '28px', 
                display: 'flex', 
                justifyContent: 'flex-end',
                gap: '12px',
                paddingTop: '0px'
              }}>
                <Button 
                  onClick={() => setIsModalVisible(false)} 
                  size="large"
                  style={{ 
                    borderRadius: '6px', 
                    minWidth: '100px',
                    borderColor: isLight ? '#e4e4e7' : '#27272a',
                    background: isLight ? '#ffffff' : '#09090b',
                    color: isLight ? '#09090b' : '#fafafa',
                    fontSize: '14px',
                  }}
                >
                  {t('common.cancel', '取消')}
                </Button>
                <Button
                  loading={saving}
                  size="large"
                  onClick={() => {
                    if (saving) return;
                    setSaving(true);
                    form.submit();
                  }}
                  style={{ 
                    borderRadius: '6px', 
                    minWidth: '120px',
                    background: isLight ? '#09090b' : '#fafafa',
                    color: isLight ? '#ffffff' : '#09090b',
                    border: 'none',
                    fontSize: '14px',
                  }}
                >
                  {t('common.confirm', '确认')}
                </Button>
              </div>
            </Form>
          </div>
        </div>
      )}

      {/* 密码验证弹窗 */}
      <Modal
        title={t('tokens.verify_identity', '🔐 验证身份')}
        open={revealModalVisible}
        onCancel={() => setRevealModalVisible(false)}
        onOk={handleRevealSubmit}
        confirmLoading={revealLoading}
        okText={t('tokens.confirm_view', '确认查看')}
        cancelText={t('common.cancel', '取消')}
        destroyOnClose
      >
        <div style={{ marginBottom: 16, color: '#888', fontSize: 13 }}>
          {t('tokens.verify_identity_desc', '为了保护您的密钥安全，查看完整密钥需要验证您的登录密码。')}
        </div>
        <Form form={passwordForm} layout="vertical">
          <Form.Item 
            name="password" 
            label={t('login.password', '登录密码')} 
            rules={[{ required: true, message: t('tokens.enter_password', '请输入您的登录密码') }]}
          >
            <Input.Password 
              placeholder={t('tokens.enter_password', '请输入您的登录密码')} 
              autoFocus 
              onPressEnter={handleRevealSubmit}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 额度使用详情弹窗 */}
      <Modal
        title={
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px', 
            fontSize: '16px', 
            fontWeight: 600,
            color: isLight ? '#09090b' : '#fafafa',
            paddingBottom: '4px'
          }}>
            <span style={{ 
              fontFamily: 'monospace', 
              background: isLight ? '#f4f4f5' : '#18181b', 
              padding: '2px 8px', 
              borderRadius: '6px', 
              fontSize: '13px', 
              fontWeight: 500,
              border: `1px solid ${isLight ? '#e4e4e7' : '#27272a'}`,
              color: isLight ? '#27272a' : '#e4e4e7' 
            }}>
              {selectedToken?.name}
            </span>
            <span>额度详情</span>
            <Tooltip title="打开时从服务端拉取最新用量；周期按站点默认时区统计（周重置为周日 00:00）">
              <InfoCircleOutlined style={{ fontSize: '13px', color: isLight ? '#71717a' : '#a1a1aa', cursor: 'pointer', marginLeft: '2px' }} />
            </Tooltip>
            {detailRefreshing && <SyncOutlined spin style={{ fontSize: 13, color: isLight ? '#71717a' : '#a1a1aa' }} />}
          </div>
        }
        open={isDetailModalOpen}
        onCancel={() => setIsDetailModalOpen(false)}
        footer={null}
        destroyOnClose
        centered
        width={500}
        transitionName=""
        className="center-popup-modal"
        styles={{
          body: {
            background: isLight ? '#ffffff' : '#09090b',
            border: `1px solid ${isLight ? '#e4e4e7' : '#27272a'}`,
            borderRadius: '12px',
            padding: '24px',
          }
        }}
      >
        <div style={{ 
          marginTop: '16px', 
          display: 'flex', 
          flexDirection: 'column',
          background: isLight ? '#fafafa' : '#141414',
          border: `1px solid ${isLight ? '#e4e4e7' : '#27272a'}`,
          borderRadius: '10px',
          padding: '0 20px',
          boxSizing: 'border-box'
        }}>
          {(() => {
            if (!selectedToken) return null;

            const { dailyUsed, weeklyUsed, monthlyUsed } = getPeriodicUsed(selectedToken, quotaTz);

            const items = [];
            const totalItems = 1 + 
              (selectedToken.daily_quota_limit >= 0 ? 1 : 0) + 
              (selectedToken.weekly_quota_limit >= 0 ? 1 : 0) + 
              (selectedToken.monthly_quota_limit >= 0 ? 1 : 0);
            
            let count = 0;

            // 1. 总额度
            count++;
            items.push(
              <QuotaProgressItem
                key="total"
                label="总额度限制"
                used={selectedToken.quota_used}
                limit={selectedToken.quota_limit}
                isLight={isLight}
                isLast={count === totalItems}
              />
            );

            // 2. 日额度
            if (selectedToken.daily_quota_limit >= 0) {
              count++;
              items.push(
                <QuotaProgressItem
                  key="daily"
                  label="日额度限制"
                  used={dailyUsed}
                  limit={selectedToken.daily_quota_limit}
                  refreshText={getQuotaRefreshText('day', quotaTz)}
                  isLight={isLight}
                  isLast={count === totalItems}
                />
              );
            }

            // 3. 周额度
            if (selectedToken.weekly_quota_limit >= 0) {
              count++;
              items.push(
                <QuotaProgressItem
                  key="weekly"
                  label="周额度限制"
                  used={weeklyUsed}
                  limit={selectedToken.weekly_quota_limit}
                  refreshText={getQuotaRefreshText('week', quotaTz)}
                  isLight={isLight}
                  isLast={count === totalItems}
                />
              );
            }

            // 4. 月额度
            if (selectedToken.monthly_quota_limit >= 0) {
              count++;
              items.push(
                <QuotaProgressItem
                  key="monthly"
                  label="月额度限制"
                  used={monthlyUsed}
                  limit={selectedToken.monthly_quota_limit}
                  refreshText={getQuotaRefreshText('month', quotaTz)}
                  isLight={isLight}
                  isLast={count === totalItems}
                />
              );
            }

            return items;
          })()}
        </div>

        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
          <Popconfirm
            title={t('tokens.clear_usage_confirm', '确认清空该令牌的已用额度数据？')}
            description={t('tokens.clear_usage_confirm_desc', '将重置总额度与日/周/月已用量为 0，不影响额度上限与账户余额。')}
            onConfirm={handleClearUsage}
            okText={t('common.confirm', '确认')}
            cancelText={t('common.cancel', '取消')}
            okButtonProps={{ danger: true, loading: clearingUsage }}
          >
            <Button
              danger
              icon={<ClearOutlined />}
              loading={clearingUsage}
              disabled={!selectedToken}
            >
              {t('tokens.clear_usage', '清空使用额度')}
            </Button>
          </Popconfirm>
        </div>
      </Modal>

      {/* 开启高可用通道确认弹窗 */}
      <Modal
        title="开启高可用通道确认"
        open={isHAConfirmModalOpen}
        onCancel={() => {
          setIsHAConfirmModalOpen(false);
          setSaving(false);
        }}
        onOk={() => {
          setIsHAConfirmModalOpen(false);
          executeSave(tempValues, haConfirmDismiss);
        }}
        okText="确认"
        cancelText="取消"
      >
        <div style={{ marginTop: '12px' }}>
          <p style={{ margin: 0, lineHeight: '1.6', fontSize: '14px', color: isLight ? '#3f3f46' : '#d4d4d8' }}>
            高可用通道功能，使用中遇到上游不稳定的模型会自动切换稳定上游计费可能会受上游渠道不同费用会短暂增加，确认是否开启
          </p>
          <div style={{ marginTop: '16px' }}>
            <Checkbox checked={haConfirmDismiss} onChange={(e) => setHaConfirmDismiss(e.target.checked)}>
              不再提示（仅针对当前令牌）
            </Checkbox>
          </div>
        </div>
      </Modal>
    </Card>
  );
};

// 额度详情的单项进度条组件
const QuotaProgressItem: React.FC<{
  label: string;
  used: number;
  limit: number;
  refreshText?: string;
  isLight: boolean;
  isLast: boolean;
}> = ({ label, used, limit, refreshText, isLight, isLast }) => {
  const isUnlimited = limit < 0;
  const percent = isUnlimited ? 0 : Math.min(100, (used / limit) * 100);
  
  // 决定进度条状态颜色
  let strokeColor = '#22c55e'; // 绿色
  if (!isUnlimited) {
    if (percent >= 90) {
      strokeColor = '#ef4444'; // 90% 以上红色
    } else if (percent >= 70) {
      strokeColor = '#eab308'; // 70% - 90% 黄色
    }
  }

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '20px 0',
      borderBottom: isLast ? 'none' : `1px solid ${isLight ? '#e4e4e7' : '#27272a'}`,
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, paddingRight: '16px' }}>
        <Text style={{ 
          fontSize: '14px', 
          fontWeight: 600, 
          color: isLight ? '#09090b' : '#fafafa' 
        }}>
          {label}
        </Text>
        
        {/* 数据层级可视化排版 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
          <span style={{ fontSize: '11px', color: isLight ? '#71717a' : '#a1a1aa', fontWeight: 500 }}>已使用</span>
          <span style={{ fontSize: '13px', fontWeight: 600, fontFamily: 'monospace', color: isLight ? '#09090b' : '#fafafa' }}>
            {used.toFixed(6)}
          </span>
          <span style={{ fontSize: '12px', color: isLight ? '#e4e4e7' : '#27272a' }}>/</span>
          <span style={{ fontSize: '11px', color: isLight ? '#71717a' : '#a1a1aa', fontWeight: 500 }}>限额</span>
          <span style={{ fontSize: '13px', fontWeight: 600, fontFamily: 'monospace', color: isLight ? '#09090b' : '#fafafa' }}>
            {isUnlimited ? '无限' : limit.toFixed(6)}
          </span>
        </div>

        {/* 刷新倒计时排版 */}
        {refreshText && (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '4px', 
            marginTop: '6px', 
            fontSize: '11px', 
            color: isLight ? '#71717a' : '#a1a1aa'
          }}>
            <SyncOutlined spin style={{ fontSize: '10px', color: '#22c55e' }} />
            <span>重置倒计时：</span>
            <span style={{ fontWeight: 500, color: isLight ? '#09090b' : '#fafafa' }}>{refreshText}</span>
          </div>
        )}
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
        <Text style={{ 
          fontSize: '15px', 
          fontWeight: 700, 
          fontFamily: 'monospace',
          color: isLight ? '#09090b' : '#fafafa' 
        }}>
          {isUnlimited ? '∞' : `${Math.round(percent)}%`}
        </Text>
        <Progress 
          type="circle" 
          percent={isUnlimited ? 100 : percent} 
          width={36} 
          strokeWidth={8}
          strokeColor={isUnlimited ? '#3b82f6' : strokeColor} // 蓝/绿/黄/红
          trailColor={isLight ? '#e4e4e7' : '#27272a'}
          showInfo={false}
        />
      </div>
    </div>
  );
};

export default Tokens;
