import React, { useState, useEffect, useCallback } from 'react';
import { Typography, Button, Table, Tag, Tabs, Modal, Form, Input, InputNumber, Select, Space, Spin, message, Popconfirm, TimePicker, Tooltip, Card, Row, Col, Statistic, Drawer } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined, ReloadOutlined, ApiOutlined, CloudServerOutlined, CheckCircleOutlined, CloseCircleOutlined, ExclamationCircleOutlined, MinusCircleOutlined } from '@ant-design/icons';
import request from '../../../utils/request';
import dayjs from 'dayjs';

const { Text } = Typography;

interface PoolAccountMapping {
  account_id: number;
  status: string;
  quota_unit: string;
  daily_reset_hour: number;
  daily_reset_minute: number;
  period_start: string;
  period_end: string;
  daily_quota: number;
  hourly_quota: number;
  period_quota: number;
  daily_used: number;
  hourly_used: number;
  period_used: number;
  last_daily_reset: string;
  last_hourly_reset: string;
  last_period_reset: string;
  priority: number;
}

interface Pool {
  id: number; name: string; pool_type: string; strategy: string;
  is_active: number; remark?: string; model_id: string; total_accounts: number; active_accounts: number;
  accounts: PoolAccountMapping[];
  created_at: string; updated_at: string;
}

interface PoolAccount {
  id: number; name: string; base_url: string; api_key_masked: string; status: string;
  account_id: string; access_key: string; secret_key_masked: string; models: string;
  last_error?: string; last_error_at?: string;
  created_at: string; updated_at: string;
}

interface PoolLog {
  id: number; pool_id: number; account_id: number; account_name: string; model_id: string;
  channel_id: number; usage_amount: number; quota_unit: string; status: string;
  error_message?: string; created_at: string;
}

const poolTypeLabels: Record<string, { label: string; color: string }> = {
  chat: { label: '聊天', color: '#1677ff' },
  image: { label: '图片', color: '#52c41a' },
  video: { label: '视频', color: '#fa8c16' },
  custom: { label: '自定义', color: '#722ed1' },
};

const statusConfig: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  active: { color: 'success', icon: <CheckCircleOutlined />, label: '可用' },
  disabled: { color: 'error', icon: <CloseCircleOutlined />, label: '故障禁用' },
  exhausted: { color: 'warning', icon: <ExclamationCircleOutlined />, label: '配额耗尽' },
};

const PoolManager: React.FC = () => {
  const [pools, setPools] = useState<Pool[]>([]);
  const [selectedPool, setSelectedPool] = useState<Pool | null>(null);
  const [accounts, setAccounts] = useState<PoolAccount[]>([]);
  const [logs, setLogs] = useState<PoolLog[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsPage, setLogsPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [poolModalVisible, setPoolModalVisible] = useState(false);
  const [editingPool, setEditingPool] = useState<Pool | null>(null);
  const [accountModalVisible, setAccountModalVisible] = useState(false);
  const [editingAccount, setEditingAccount] = useState<PoolAccount | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailPool, setDetailPool] = useState<Pool | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [poolForm] = Form.useForm();
  const [accountForm] = Form.useForm();
  const [siteModels, setSiteModels] = useState<any[]>([]);
  const [siteProviders, setSiteProviders] = useState<any[]>([]);
  const [siteTypes, setSiteTypes] = useState<any[]>([]);
  const [poolSaving, setPoolSaving] = useState(false);
  const [accountSaving, setAccountSaving] = useState(false);
  const [modelFilterProvider, setModelFilterProvider] = useState<number | undefined>();
  const [modelFilterType, setModelFilterType] = useState<number | undefined>();

  const fetchPools = useCallback(async () => {
    try {
      setLoading(true);
      const res = await (request.get('/plugins/volcengine_pool/pools') as any);
      if (res.pools) setPools(res.pools);
    } catch { message.error('获取卡池列表失败'); }
    finally { setLoading(false); }
  }, []);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await (request.get(`/plugins/volcengine_pool/accounts`) as any);
      if (res.accounts) setAccounts(res.accounts);
    } catch { message.error('获取账号列表失败'); }
  }, []);

  const fetchLogs = useCallback(async (page = 1, poolId?: number) => {
    try {
      const params: any = { page, page_size: 15 };
      if (poolId) params.pool_id = poolId;
      const res = await (request.get('/plugins/volcengine_pool/logs', { params }) as any);
      if (res.logs) { setLogs(res.logs); setLogsTotal(res.total || 0); }
    } catch { /* silent */ }
  }, []);

  useEffect(() => { fetchPools(); fetchAccounts(); fetchSiteModels(); }, [fetchPools, fetchAccounts]);

  const fetchSiteModels = async () => {
    try {
      const [modelsRes, providersRes, typesRes] = await Promise.all([
        request.get('/models', { params: { page_size: 500 } }) as any,
        request.get('/model-providers') as any,
        request.get('/model-types') as any,
      ]);
      if (modelsRes.data) setSiteModels(modelsRes.data);
      if (Array.isArray(providersRes)) setSiteProviders(providersRes);
      if (Array.isArray(typesRes)) setSiteTypes(typesRes);
    } catch { /* silent */ }
  };

  const groupedModelOptions = React.useMemo(() => {
    let filtered = siteModels;
    if (modelFilterProvider !== undefined) filtered = filtered.filter(m => m.provider_id === modelFilterProvider);
    if (modelFilterType !== undefined) filtered = filtered.filter(m => m.type_id === modelFilterType);
    const providerMap = new Map(siteProviders.map((p: any) => [p.id, p.name]));
    const groups: Record<string, { label: string; value: string; disabled: boolean }[]> = {};
    const poolModelId = poolForm.getFieldValue('model_id');

    for (const m of filtered) {
      const groupName = providerMap.get(m.provider_id) || '未分类';
      if (!groups[groupName]) groups[groupName] = [];
      const isDisabled = poolModelId && poolModelId !== m.mid && poolModelId !== m.model_id;
      groups[groupName].push({ label: `${m.name} (${m.model_id}) [MID:${m.mid}]`, value: m.mid, disabled: !!isDisabled });
    }
    return Object.entries(groups).map(([label, options]) => ({ label, options }));
  }, [siteModels, siteProviders, modelFilterProvider, modelFilterType]);

  useEffect(() => {
    if (selectedPool) { fetchLogs(1, selectedPool.id); }
  }, [selectedPool, fetchLogs]);

  // ── 卡池 CRUD ─────────────────────────────────────────────
  const handleSavePool = async () => {
    try {
      setPoolSaving(true);
      const values = await poolForm.validateFields();
      let modelValue = values.model_id;
      if (modelValue) {
        const match = siteModels.find((m: any) => m.mid === modelValue);
        modelValue = match ? match.model_id : modelValue;
      }

      const formattedAccounts = (values.accounts || []).map((acc: any) => {
        const resetTime = acc._resetTime;
        const periodRange = acc._periodRange;
        return {
          account_id: acc.account_id,
          status: acc.status || 'active',
          quota_unit: acc.quota_unit || 'tokens',
          daily_reset_hour: resetTime ? resetTime.hour() : 0,
          daily_reset_minute: resetTime ? resetTime.minute() : 0,
          period_start: periodRange?.[0] ? periodRange[0].format('HH:mm') : '',
          period_end: periodRange?.[1] ? periodRange[1].format('HH:mm') : '',
          daily_quota: acc.daily_quota || 0,
          hourly_quota: acc.hourly_quota || 0,
          period_quota: acc.period_quota || 0,
          priority: acc.priority || 0,
        };
      });

      const payload: any = {
        name: values.name, pool_type: values.pool_type, strategy: values.strategy,
        remark: values.remark || '', model_id: modelValue || '', accounts: formattedAccounts,
      };
      if (editingPool) {
        payload.is_active = values.is_active;
        await request.put(`/plugins/volcengine_pool/pools/${editingPool.id}`, payload);
        message.success('卡池已更新');
      } else {
        await request.post('/plugins/volcengine_pool/pools', payload);
        message.success('卡池已创建');
      }
      setPoolModalVisible(false); fetchPools();
    } catch { /* validation */ }
    finally { setPoolSaving(false); }
  };

  const openPoolModal = (pool?: Pool) => {
    setEditingPool(pool || null);
    poolForm.resetFields();
    if (pool) {
      const match = siteModels.find((m: any) => m.model_id === pool.model_id);
      const mid = match ? match.mid : pool.model_id;

      const formattedAccounts = (pool.accounts || []).map(acc => ({
        ...acc,
        _resetTime: dayjs().hour(acc.daily_reset_hour).minute(acc.daily_reset_minute),
        _periodRange: acc.period_start && acc.period_end ? [dayjs(acc.period_start, 'HH:mm'), dayjs(acc.period_end, 'HH:mm')] : undefined,
      }));

      poolForm.setFieldsValue({ ...pool, model_id: mid || undefined, accounts: formattedAccounts });
    }
    setPoolModalVisible(true);
  };

  const handleDeletePool = async (id: number) => {
    try {
      await request.delete(`/plugins/volcengine_pool/pools/${id}`);
      message.success('卡池已删除');
      if (selectedPool?.id === id) { setSelectedPool(null); setAccounts([]); }
      fetchPools();
    } catch (e: any) { message.error(e?.message || '删除失败'); }
  };

  // ── 账号 CRUD ─────────────────────────────────────────────
  const handleSaveAccount = async () => {
    try {
      setAccountSaving(true);
      const values = await accountForm.validateFields();
      
      const payload: any = {
        name: values.name,
        base_url: values.base_url,
        api_key: values.api_key,
        account_id: values.account_id,
        access_key: values.access_key,
        secret_key: values.secret_key,
        models: values.models,
      };
      if (editingAccount) {
        payload.status = values.status;
        await request.put(`/plugins/volcengine_pool/accounts/${editingAccount.id}`, payload);
        message.success('账号已更新');
      } else {
        await request.post(`/plugins/volcengine_pool/accounts`, payload);
        message.success('账号已添加');
      }
      setAccountModalVisible(false); fetchAccounts();
    } catch { /* validation */ }
    finally { setAccountSaving(false); }
  };

  const openAccountModal = (account?: PoolAccount) => {
    setEditingAccount(account || null);
    accountForm.resetFields();
    if (account) {
      accountForm.setFieldsValue({ ...account });
    }
    setAccountModalVisible(true);
  };

  const handleDeleteAccount = async (id: number) => {
    await request.delete(`/plugins/volcengine_pool/accounts/${id}`);
    message.success('账号已删除'); fetchAccounts();
  };

  const handleTestAccount = async (id: number) => {
    setTestingId(id);
    try {
      const res = await (request.post(`/plugins/volcengine_pool/accounts/${id}/test`) as any);
      if (res.success) message.success(`连接成功 (${res.latency_ms}ms)`);
      else message.error(`连接失败: ${res.message}`);
    } catch { message.error('测试请求失败'); }
    finally { setTestingId(null); }
  };

  const handleResetAccount = async (id: number) => {
    await request.post(`/plugins/volcengine_pool/accounts/${id}/reset`);
    message.success('配额已重置'); fetchAccounts(); fetchPools();
  };

  // ── 渲染 ─────────────────────────────────────────────────
  const quotaBar = (used: number, quota: number) => {
    if (quota <= 0) return <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>不限</Text>;
    const pct = Math.min(100, (used / quota) * 100);
    const color = pct >= 90 ? '#ff4d4f' : pct >= 60 ? '#faad14' : '#52c41a';
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 2 }}>
          <span>{used.toFixed(0)}</span><span>{quota.toFixed(0)}</span>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 2, height: 4 }}>
          <div style={{ width: `${pct}%`, background: color, borderRadius: 2, height: 4, transition: 'width 0.3s' }} />
        </div>
      </div>
    );
  };

  const baseAccountColumns = [
    { title: '名称', dataIndex: 'name', key: 'name', width: 120 },
    { title: 'URL & API Key', key: 'url_key', width: 200, render: (_: any, r: PoolAccount) => (
      <div>
        <Text style={{ fontSize: 12, display: 'block' }} ellipsis title={r.base_url}>{r.base_url}</Text>
        <Text type="secondary" style={{ fontSize: 12 }}>API: {r.api_key_masked}</Text>
        {r.access_key && <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>AK: {r.access_key}</Text>}
      </div>
    )},
    { title: '状态', dataIndex: 'status', key: 'status', width: 100,
      render: (v: string) => { const c = statusConfig[v] || statusConfig.active; return <Tag icon={c.icon} color={c.color}>{c.label}</Tag>; } },
    { title: '最近错误', key: 'error', width: 180, render: (_: any, r: PoolAccount) =>
      r.last_error ? <Tooltip title={r.last_error}><Text ellipsis style={{ maxWidth: 160, fontSize: 12, color: '#ff4d4f' }}>{r.last_error}</Text></Tooltip> : '-' },
    { title: '操作', key: 'action', width: 220, render: (_: any, r: PoolAccount) => (
      <Space size={4}>
        <Button size="small" icon={<ApiOutlined />} loading={testingId === r.id} onClick={() => handleTestAccount(r.id)}>测试</Button>
        <Button size="small" onClick={() => handleResetAccount(r.id)}>重置</Button>
        <Button size="small" icon={<EditOutlined />} onClick={() => openAccountModal(r)} />
        <Popconfirm title="确定删除?" onConfirm={() => handleDeleteAccount(r.id)}>
          <Button size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      </Space>
    )},
  ];

  const poolMappingColumns = [
    { title: '账号名称', key: 'name', width: 120, render: (_: any, m: PoolAccountMapping) => {
        const acc = accounts.find(a => a.id === m.account_id);
        return <Text>{acc ? acc.name : `未知(${m.account_id})`}</Text>;
    }},
    { title: '映射状态', dataIndex: 'status', key: 'status', width: 100,
      render: (v: string) => { const c = statusConfig[v] || statusConfig.active; return <Tag icon={c.icon} color={c.color}>{c.label}</Tag>; } },
    { title: '优先级', dataIndex: 'priority', key: 'priority', width: 70 },
    { title: '每日用量', key: 'daily', width: 120, render: (_: any, r: PoolAccountMapping) => quotaBar(r.daily_used, r.daily_quota) },
    { title: '每小时用量', key: 'hourly', width: 120, render: (_: any, r: PoolAccountMapping) => quotaBar(r.hourly_used, r.hourly_quota) },
    { title: '时段用量', key: 'period', width: 120, render: (_: any, r: PoolAccountMapping) => quotaBar(r.period_used, r.period_quota) },
  ];

  const logColumns = [
    { title: '时间', dataIndex: 'created_at', key: 'created_at', width: 160, render: (v: string) => <Text style={{ fontSize: 12 }}>{v?.substring(0, 19)}</Text> },
    { title: '账号', dataIndex: 'account_name', key: 'account_name', width: 120 },
    { title: '模型', dataIndex: 'model_id', key: 'model_id', width: 180 },
    { title: '使用量', dataIndex: 'usage_amount', key: 'usage_amount', width: 100, render: (v: number) => v.toFixed(0) },
    { title: '单位', dataIndex: 'quota_unit', key: 'quota_unit', width: 80 },
    { title: '状态', dataIndex: 'status', key: 'status', width: 80,
      render: (v: string) => <Tag color={v === 'success' ? 'success' : 'error'}>{v === 'success' ? '成功' : '失败'}</Tag> },
    { title: '错误', dataIndex: 'error_message', key: 'error_message', ellipsis: true },
  ];

  // ── Tab1: 卡池管理 ─────────────────────────────────────────
  const poolTab = (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>管理所有卡池，每个卡池固定一种模型，可分配多个账号并设置独立配额</Text>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchPools} loading={loading}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openPoolModal()}>新建卡池</Button>
        </Space>
      </div>
      <Row gutter={[16, 16]}>
        {pools.map(pool => {
          const typeInfo = poolTypeLabels[pool.pool_type] || poolTypeLabels.custom;
          const isSelected = selectedPool?.id === pool.id;
          return (
            <Col xs={24} sm={12} lg={8} key={pool.id}>
              <Card size="small" hoverable
                onClick={() => {
                  setSelectedPool(pool);
                  setDetailPool(pool);
                  setDetailVisible(true);
                }}
                style={{
                  background: isSelected ? 'rgba(250,140,22,0.06)' : '#1a1a1a',
                  border: isSelected ? '1px solid rgba(250,140,22,0.4)' : '1px solid rgba(255,255,255,0.08)',
                  cursor: 'pointer',
                }}
                styles={{ body: { padding: '14px 16px' } }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <Space>
                    <CloudServerOutlined style={{ color: typeInfo.color, fontSize: 18 }} />
                    <Text strong style={{ color: '#fff', fontSize: 14 }}>{pool.name}</Text>
                    <Tag color={typeInfo.color} style={{ fontSize: 11 }}>{typeInfo.label}</Tag>
                  </Space>
                  <Tag color={pool.is_active ? 'success' : 'default'}>{pool.is_active ? '启用' : '禁用'}</Tag>
                </div>
                <div style={{ marginBottom: 10 }}>
                   <Text type="secondary" style={{ fontSize: 12 }}>绑定的模型: {pool.model_id || '未配置'}</Text>
                </div>
                <Row gutter={16}>
                  <Col span={8}><Statistic title="账号" value={pool.total_accounts} valueStyle={{ fontSize: 16, color: '#fff' }} /></Col>
                  <Col span={8}><Statistic title="在线" value={pool.active_accounts} valueStyle={{ fontSize: 16, color: '#52c41a' }} /></Col>
                  <Col span={8}><Statistic title="策略" value={pool.strategy === 'random' ? '随机' : '顺序'} valueStyle={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }} /></Col>
                </Row>
                <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                  <Button size="small" icon={<EditOutlined />} onClick={e => { e.stopPropagation(); openPoolModal(pool); }}>编辑</Button>
                  <Popconfirm title="确定删除此卡池?" onConfirm={() => handleDeletePool(pool.id)}>
                    <Button size="small" danger icon={<DeleteOutlined />} onClick={e => e.stopPropagation()} />
                  </Popconfirm>
                </div>
              </Card>
            </Col>
          );
        })}
        {pools.length === 0 && !loading && (
          <Col span={24}><div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.3)' }}>暂无卡池，点击「新建卡池」开始</div></Col>
        )}
      </Row>
    </div>
  );

  // ── Tab2: 账号管理 ─────────────────────────────────────────
  const accountTab = (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>独立账号池，配置基础账号认证信息，用于分配给各个卡池</Text>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => fetchAccounts()}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openAccountModal()}>添加账号</Button>
        </Space>
      </div>
      <Table dataSource={accounts} columns={baseAccountColumns} rowKey="id" size="small" pagination={{ pageSize: 20 }}
        style={{ background: '#141414' }} />
    </div>
  );

  // ── Tab3: 调度日志 ─────────────────────────────────────────
  const logTab = (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <Space>
          <Select placeholder="筛选卡池" allowClear style={{ width: 160 }}
            options={pools.map(p => ({ label: p.name, value: p.id }))}
            onChange={(v) => { setLogsPage(1); fetchLogs(1, v); }} />
        </Space>
        <Button icon={<ReloadOutlined />} onClick={() => fetchLogs(logsPage, selectedPool?.id)}>刷新</Button>
      </div>
      <Table dataSource={logs} columns={logColumns} rowKey="id" size="small"
        pagination={{ current: logsPage, total: logsTotal, pageSize: 15,
          onChange: (p) => { setLogsPage(p); fetchLogs(p, selectedPool?.id); } }}
        scroll={{ x: 900 }} />
    </div>
  );

  return (
    <div>
      <Tabs defaultActiveKey="pools" items={[
        { key: 'pools', label: '卡池管理', children: poolTab },
        { key: 'accounts', label: '账号管理', children: accountTab },
        { key: 'logs', label: '调度日志', children: logTab },
      ]} />

      {/* 卡池编辑全屏抽屉 */}
      <Drawer
        title={editingPool ? '编辑卡池' : '新建卡池'}
        placement="right"
        width="100%"
        onClose={() => setPoolModalVisible(false)}
        open={poolModalVisible}
        destroyOnClose
        styles={{ body: { padding: '24px' } }}
        footer={
          <div style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setPoolModalVisible(false)} disabled={poolSaving}>取消</Button>
              <Button type="primary" onClick={handleSavePool} loading={poolSaving}>保存</Button>
            </Space>
          </div>
        }
      >
        <Form form={poolForm} layout="vertical" initialValues={{ pool_type: 'chat', strategy: 'random', is_active: 1 }}>
          <Row gutter={16}>
            <Col span={12}>
                <Form.Item name="name" label="卡池名称" rules={[{ required: true, message: '请输入名称' }]}>
                    <Input placeholder="如：视频模型卡池" />
                </Form.Item>
            </Col>
            <Col span={12}>
               <Form.Item name="model_id" label="绑定的模型" rules={[{ required: true, message: '请选择模型' }]} tooltip="卡池固定支持该模型。">
                  <Select placeholder="搜索或选择模型" allowClear showSearch
                    options={groupedModelOptions}
                    filterOption={(input, option) => ((option as any)?.label ?? '').toLowerCase().includes(input.toLowerCase()) || ((option as any)?.value ?? '').toLowerCase().includes(input.toLowerCase())} />
                </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="pool_type" label="卡池类型">
                <Select options={[
                  { label: '聊天', value: 'chat' }, { label: '图片', value: 'image' },
                  { label: '视频', value: 'video' }, { label: '自定义', value: 'custom' },
                ]} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="strategy" label="调度策略">
                <Select options={[{ label: '随机分布', value: 'random' }, { label: '顺序轮转', value: 'sequential' }]} />
              </Form.Item>
            </Col>
          </Row>

          <Form.List name="accounts">
            {(fields, { add, remove }) => (
              <>
                <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text strong>分配账号及配额</Text>
                  <Button type="dashed" onClick={() => add({ status: 'active', quota_unit: 'tokens', daily_quota: 0, hourly_quota: 0, period_quota: 0, priority: 0 })} icon={<PlusOutlined />}>
                    添加账号
                  </Button>
                </div>
                {fields.map(({ key, name, ...restField }) => (
                  <Card key={key} size="small" style={{ marginBottom: 16, background: '#141414', border: '1px solid #303030' }}>
                    <div style={{ position: 'absolute', right: 12, top: 8, zIndex: 10 }}>
                      <Button 
                        type="text" 
                        danger 
                        size="small"
                        icon={<MinusCircleOutlined style={{ fontSize: 18 }} />} 
                        onClick={(e) => {
                          e.stopPropagation();
                          remove(name);
                        }} 
                      />
                    </div>
                    <Row gutter={16}>
                      <Col span={8}>
                        <Form.Item {...restField} name={[name, 'account_id']} label="选择账号" rules={[{ required: true, message: '请选择账号' }]}>
                          <Select placeholder="请选择" options={accounts.map(a => ({ label: a.name, value: a.id }))} showSearch optionFilterProp="label" />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item {...restField} name={[name, 'status']} label="映射状态">
                          <Select options={[{ label: '可用', value: 'active' }, { label: '禁用', value: 'disabled' }]} />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item {...restField} name={[name, 'priority']} label="优先级(顺序模式)">
                          <InputNumber min={0} max={999} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Row gutter={16}>
                        <Col span={8}>
                          <Form.Item {...restField} name={[name, 'quota_unit']} label="配额计量单位">
                            <Select options={[{ label: 'Token 数', value: 'tokens' }, { label: '请求次数', value: 'requests' }, { label: '图片张数', value: 'images' }]} />
                          </Form.Item>
                        </Col>
                        <Col span={8}>
                          <Form.Item {...restField} name={[name, '_resetTime']} label="每日配额刷新时间">
                            <TimePicker format="HH:mm" style={{ width: '100%' }} placeholder="选择时间" />
                          </Form.Item>
                        </Col>
                        <Col span={8}>
                          <Form.Item {...restField} name={[name, '_periodRange']} label="时段范围（可选）">
                            <TimePicker.RangePicker format="HH:mm" style={{ width: '100%' }} placeholder={['开始', '结束']} />
                          </Form.Item>
                        </Col>
                    </Row>
                    <Form.Item noStyle shouldUpdate={(prev, cur) => {
                        const pu = prev.accounts?.[name]?.quota_unit;
                        const cu = cur.accounts?.[name]?.quota_unit;
                        return pu !== cu;
                    }}>
                        {({ getFieldValue }) => {
                          const unit = getFieldValue(['accounts', name, 'quota_unit']) || 'tokens';
                          const unitLabel = unit === 'tokens' ? 'Token' : unit === 'requests' ? '次' : '张';
                          return (
                            <Row gutter={16}>
                              <Col span={8}><Form.Item {...restField} name={[name, 'daily_quota']} label={`每日限额(0=不限)`}><InputNumber min={0} style={{ width: '100%' }} addonAfter={unitLabel} /></Form.Item></Col>
                              <Col span={8}><Form.Item {...restField} name={[name, 'hourly_quota']} label={`每小时限额(0=不限)`}><InputNumber min={0} style={{ width: '100%' }} addonAfter={unitLabel} /></Form.Item></Col>
                              <Col span={8}><Form.Item {...restField} name={[name, 'period_quota']} label={`时段限额(0=不限)`}><InputNumber min={0} style={{ width: '100%' }} addonAfter={unitLabel} /></Form.Item></Col>
                            </Row>
                          );
                        }}
                    </Form.Item>
                  </Card>
                ))}
              </>
            )}
          </Form.List>

          {editingPool && (
            <Form.Item name="is_active" label="启用状态">
              <Select options={[{ label: '启用', value: 1 }, { label: '禁用', value: 0 }]} />
            </Form.Item>
          )}
          <Form.Item name="remark" label="备注"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Drawer>

      {/* 账号编辑抽屉（简化版） */}
      <Drawer
        title={editingAccount ? '编辑账号' : '添加账号'}
        placement="right"
        width={500}
        onClose={() => setAccountModalVisible(false)}
        open={accountModalVisible}
        destroyOnClose
        styles={{ body: { padding: '24px' } }}
        footer={
          <div style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setAccountModalVisible(false)} disabled={accountSaving}>取消</Button>
              <Button type="primary" onClick={handleSaveAccount} loading={accountSaving}>保存</Button>
            </Space>
          </div>
        }
      >
        <Form form={accountForm} layout="vertical" initialValues={{ base_url: 'https://ark.cn-beijing.volces.com/api/v3' }}>
          <Form.Item name="account_id" label="账号 ID (Account ID)">
            <Input placeholder="非必填，火山引擎 Account ID 或自定义标识" />
          </Form.Item>
          <Form.Item name="base_url" label="请求地址 (Base URL)" rules={[{ required: true, message: '请输入请求地址' }]}>
            <Input placeholder="例如: https://ark.cn-beijing.volces.com/api/v3" />
          </Form.Item>
          {!editingAccount ? (
            <Form.Item name="api_key" label="API Key (密钥)" rules={[{ required: true, message: '请输入API Key' }]}>
              <Input.Password placeholder="火山引擎 API Key (Bearer Token)" />
            </Form.Item>
          ) : (
            <Form.Item name="api_key" label="API Key (密钥)（留空不修改）">
              <Input.Password placeholder="留空保持原值" />
            </Form.Item>
          )}
          <Form.Item name="access_key" label="Access Key (AK)">
            <Input placeholder="非必填，IAM AK (若需要)" />
          </Form.Item>
          {!editingAccount ? (
            <Form.Item name="secret_key" label="Secret Key (SK)">
              <Input.Password placeholder="非必填，IAM SK (若需要)" />
            </Form.Item>
          ) : (
            <Form.Item name="secret_key" label="Secret Key (SK)（留空不修改）">
              <Input.Password placeholder="留空保持原值" />
            </Form.Item>
          )}
          <Form.Item name="models" label="限制调用的模型" tooltip="限制此账号仅可调用哪些模型，以逗号分隔，留空表示不限制">
            <Input placeholder="例如: doubao-pro-32k,ep-2024..." />
          </Form.Item>
          <Form.Item name="name" label="备注" rules={[{ required: true, message: '请输入备注名' }]}>
            <Input placeholder="如：账号A" />
          </Form.Item>
          {editingAccount && (
            <Form.Item name="status" label="状态">
              <Select options={[{ label: '可用', value: 'active' }, { label: '禁用', value: 'disabled' }]} />
            </Form.Item>
          )}
        </Form>
      </Drawer>

      {/* 卡池详情全屏抽屉 */}
      <Drawer
        title={detailPool ? `卡池详细信息 - ${detailPool.name}` : '卡池详情'}
        placement="right"
        width="100%"
        onClose={() => setDetailVisible(false)}
        open={detailVisible}
        styles={{ body: { padding: '24px' } }}
      >
        {detailPool && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 16, fontWeight: 'bold' }}>该卡池绑定的账号使用情况</Text>
              <Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
                绑定模型: {detailPool.model_id} | 账号数: {detailPool.total_accounts} | 当前可用数: {detailPool.active_accounts}
              </Text>
            </div>
            <Table
              dataSource={detailPool.accounts}
              columns={poolMappingColumns}
              rowKey="account_id"
              size="small"
              pagination={false}
              scroll={{ x: 1000 }}
              style={{ background: '#141414' }}
            />
          </div>
        )}
      </Drawer>
    </div>
  );
};

export default PoolManager;
