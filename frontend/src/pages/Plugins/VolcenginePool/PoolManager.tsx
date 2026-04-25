import React, { useState, useEffect, useCallback } from 'react';
import { Typography, Button, Table, Tag, Tabs, Modal, Form, Input, InputNumber, Select, Space, Spin, message, Popconfirm, TimePicker, Tooltip, Card, Row, Col, Statistic } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined, ReloadOutlined, ApiOutlined, CloudServerOutlined, ThunderboltOutlined, CheckCircleOutlined, CloseCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import request from '../../../utils/request';
import dayjs from 'dayjs';

const { Text } = Typography;

interface Pool {
  id: number; name: string; pool_type: string; strategy: string; quota_unit: string;
  daily_reset_hour: number; daily_reset_minute: number; period_start: string; period_end: string;
  default_daily_quota: number; default_hourly_quota: number; default_period_quota: number;
  is_active: number; remark?: string; total_accounts: number; active_accounts: number;
  created_at: string; updated_at: string;
}

interface PoolAccount {
  id: number; pool_id: number; name: string; api_key_masked: string; status: string;
  daily_quota: number; hourly_quota: number; period_quota: number;
  daily_used: number; hourly_used: number; period_used: number;
  last_error?: string; last_error_at?: string; priority: number;
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
  const [testingId, setTestingId] = useState<number | null>(null);
  const [poolForm] = Form.useForm();
  const [accountForm] = Form.useForm();

  const fetchPools = useCallback(async () => {
    try {
      setLoading(true);
      const res = await (request.get('/plugins/volcengine_pool/pools') as any);
      if (res.pools) setPools(res.pools);
    } catch { message.error('获取卡池列表失败'); }
    finally { setLoading(false); }
  }, []);

  const fetchAccounts = useCallback(async (poolId: number) => {
    try {
      const res = await (request.get(`/plugins/volcengine_pool/pools/${poolId}/accounts`) as any);
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

  useEffect(() => { fetchPools(); }, [fetchPools]);

  useEffect(() => {
    if (selectedPool) { fetchAccounts(selectedPool.id); fetchLogs(1, selectedPool.id); }
  }, [selectedPool, fetchAccounts, fetchLogs]);

  // ── 卡池 CRUD ─────────────────────────────────────────────
  const handleSavePool = async () => {
    try {
      const values = await poolForm.validateFields();
      const resetTime = values._resetTime;
      const periodRange = values._periodRange;
      const payload: any = {
        name: values.name, pool_type: values.pool_type, strategy: values.strategy,
        quota_unit: values.quota_unit, remark: values.remark || '',
        daily_reset_hour: resetTime ? resetTime.hour() : 0,
        daily_reset_minute: resetTime ? resetTime.minute() : 0,
        period_start: periodRange?.[0] ? periodRange[0].format('HH:mm') : '',
        period_end: periodRange?.[1] ? periodRange[1].format('HH:mm') : '',
        default_daily_quota: values.default_daily_quota || 0,
        default_hourly_quota: values.default_hourly_quota || 0,
        default_period_quota: values.default_period_quota || 0,
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
  };

  const openPoolModal = (pool?: Pool) => {
    setEditingPool(pool || null);
    poolForm.resetFields();
    if (pool) {
      poolForm.setFieldsValue({
        ...pool,
        default_daily_quota: pool.default_daily_quota || 0,
        default_hourly_quota: pool.default_hourly_quota || 0,
        default_period_quota: pool.default_period_quota || 0,
        _resetTime: dayjs().hour(pool.daily_reset_hour).minute(pool.daily_reset_minute),
        _periodRange: pool.period_start && pool.period_end
          ? [dayjs(pool.period_start, 'HH:mm'), dayjs(pool.period_end, 'HH:mm')] : undefined,
      });
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
    if (!selectedPool) return;
    try {
      const values = await accountForm.validateFields();
      if (editingAccount) {
        await request.put(`/plugins/volcengine_pool/accounts/${editingAccount.id}`, values);
        message.success('账号已更新');
      } else {
        await request.post(`/plugins/volcengine_pool/pools/${selectedPool.id}/accounts`, values);
        message.success('账号已添加');
      }
      setAccountModalVisible(false); fetchAccounts(selectedPool.id); fetchPools();
    } catch { /* validation */ }
  };

  const openAccountModal = (account?: PoolAccount) => {
    setEditingAccount(account || null);
    accountForm.resetFields();
    if (account) {
      accountForm.setFieldsValue(account);
    } else if (selectedPool) {
      // 新建时用卡池默认配额预填
      const defaults = (selectedPool as any);
      accountForm.setFieldsValue({
        daily_quota: defaults.default_daily_quota || 0,
        hourly_quota: defaults.default_hourly_quota || 0,
        period_quota: defaults.default_period_quota || 0,
      });
    }
    setAccountModalVisible(true);
  };

  const handleDeleteAccount = async (id: number) => {
    if (!selectedPool) return;
    await request.delete(`/plugins/volcengine_pool/accounts/${id}`);
    message.success('账号已删除'); fetchAccounts(selectedPool.id); fetchPools();
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
    if (!selectedPool) return;
    await request.post(`/plugins/volcengine_pool/accounts/${id}/reset`);
    message.success('配额已重置'); fetchAccounts(selectedPool.id);
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

  const accountColumns = [
    { title: '名称', dataIndex: 'name', key: 'name', width: 120 },
    { title: 'API Key', dataIndex: 'api_key_masked', key: 'api_key_masked', width: 160,
      render: (v: string) => <Text copyable={false} style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{v}</Text> },
    { title: '状态', dataIndex: 'status', key: 'status', width: 100,
      render: (v: string) => { const c = statusConfig[v] || statusConfig.active; return <Tag icon={c.icon} color={c.color}>{c.label}</Tag>; } },
    { title: '每日用量', key: 'daily', width: 120, render: (_: any, r: PoolAccount) => quotaBar(r.daily_used, r.daily_quota) },
    { title: '每小时用量', key: 'hourly', width: 120, render: (_: any, r: PoolAccount) => quotaBar(r.hourly_used, r.hourly_quota) },
    { title: '时段用量', key: 'period', width: 120, render: (_: any, r: PoolAccount) => quotaBar(r.period_used, r.period_quota) },
    { title: '优先级', dataIndex: 'priority', key: 'priority', width: 70 },
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
        <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>管理所有卡池，每个卡池可包含多个火山引擎账号</Text>
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
                onClick={() => setSelectedPool(pool)}
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
      {selectedPool ? (
        <>
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Space>
              <ThunderboltOutlined style={{ color: '#fa8c16' }} />
              <Text strong style={{ color: '#fff' }}>{selectedPool.name}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>
                配额单位: {selectedPool.quota_unit} | 刷新时间: {String(selectedPool.daily_reset_hour).padStart(2, '0')}:{String(selectedPool.daily_reset_minute).padStart(2, '0')}
                {selectedPool.period_start && ` | 时段: ${selectedPool.period_start}~${selectedPool.period_end}`}
              </Text>
            </Space>
            <Space>
              <Button icon={<ReloadOutlined />} onClick={() => fetchAccounts(selectedPool.id)}>刷新</Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => openAccountModal()}>添加账号</Button>
            </Space>
          </div>
          <Table dataSource={accounts} columns={accountColumns} rowKey="id" size="small" pagination={false}
            scroll={{ x: 1100 }} style={{ background: '#141414' }} />
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: 60, color: 'rgba(255,255,255,0.3)' }}>请先在「卡池管理」中选择一个卡池</div>
      )}
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

      {/* 卡池编辑弹窗 */}
      <Modal title={editingPool ? '编辑卡池' : '新建卡池'} open={poolModalVisible}
        onCancel={() => setPoolModalVisible(false)} onOk={handleSavePool} width={560} destroyOnClose>
        <Form form={poolForm} layout="vertical" initialValues={{ pool_type: 'chat', strategy: 'random', quota_unit: 'tokens', is_active: 1, default_daily_quota: 0, default_hourly_quota: 0, default_period_quota: 0 }}>
          <Form.Item name="name" label="卡池名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="如：视频模型卡池" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="pool_type" label="卡池类型">
                <Select options={[
                  { label: '聊天', value: 'chat' }, { label: '图片', value: 'image' },
                  { label: '视频', value: 'video' }, { label: '自定义', value: 'custom' },
                ]} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="strategy" label="调度策略">
                <Select options={[{ label: '随机分布', value: 'random' }, { label: '顺序轮转', value: 'sequential' }]} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="quota_unit" label="配额计量单位">
                <Select options={[{ label: 'Token 数', value: 'tokens' }, { label: '请求次数', value: 'requests' }, { label: '图片张数', value: 'images' }]} />
              </Form.Item>
            </Col>
          </Row>

          {/* 配额限额 */}
          <div style={{ background: 'rgba(250,140,22,0.04)', border: '1px solid rgba(250,140,22,0.15)', borderRadius: 6, padding: '12px 16px', marginBottom: 16 }}>
            <Text style={{ color: '#fa8c16', fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 8 }}>
              账号默认配额限额
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, display: 'block', marginBottom: 12 }}>
              添加账号时的默认配额上限，0 = 不限制。达到限额后该账号将暂停使用，直到配额重置。
            </Text>
            <Form.Item noStyle shouldUpdate={(prev, cur) => prev.quota_unit !== cur.quota_unit}>
              {({ getFieldValue }) => {
                const unit = getFieldValue('quota_unit') || 'tokens';
                const unitLabel = unit === 'tokens' ? 'Token' : unit === 'requests' ? '次' : '张';
                return (
                  <Row gutter={16}>
                    <Col span={8}>
                      <Form.Item name="default_daily_quota" label="每日限额">
                        <InputNumber min={0} style={{ width: '100%' }} addonAfter={unitLabel} placeholder="0=不限" />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="default_hourly_quota" label="每小时限额">
                        <InputNumber min={0} style={{ width: '100%' }} addonAfter={unitLabel} placeholder="0=不限" />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="default_period_quota" label="时段限额">
                        <InputNumber min={0} style={{ width: '100%' }} addonAfter={unitLabel} placeholder="0=不限" />
                      </Form.Item>
                    </Col>
                  </Row>
                );
              }}
            </Form.Item>
          </div>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="_resetTime" label="每日配额刷新时间">
                <TimePicker format="HH:mm" style={{ width: '100%' }} placeholder="选择时间" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="_periodRange" label="时段配额时间范围（可选）">
                <TimePicker.RangePicker format="HH:mm" style={{ width: '100%' }} placeholder={['开始', '结束']} />
              </Form.Item>
            </Col>
          </Row>
          {editingPool && (
            <Form.Item name="is_active" label="启用状态">
              <Select options={[{ label: '启用', value: 1 }, { label: '禁用', value: 0 }]} />
            </Form.Item>
          )}
          <Form.Item name="remark" label="备注"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      {/* 账号编辑弹窗 */}
      <Modal title={editingAccount ? '编辑账号' : '添加账号'} open={accountModalVisible}
        onCancel={() => setAccountModalVisible(false)} onOk={handleSaveAccount} width={480} destroyOnClose>
        <Form form={accountForm} layout="vertical" initialValues={{ daily_quota: 0, hourly_quota: 0, period_quota: 0, priority: 0 }}>
          <Form.Item name="name" label="账号名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="备注名，如：账号A" />
          </Form.Item>
          {!editingAccount && (
            <Form.Item name="api_key" label="API Key" rules={[{ required: true, message: '请输入API Key' }]}>
              <Input.Password placeholder="火山引擎 API Key" />
            </Form.Item>
          )}
          {editingAccount && (
            <Form.Item name="api_key" label="API Key（留空不修改）">
              <Input.Password placeholder="留空保持原值" />
            </Form.Item>
          )}
          <Row gutter={16}>
            <Col span={8}><Form.Item name="daily_quota" label={`每日限额(0=不限)`}><InputNumber min={0} style={{ width: '100%' }} addonAfter={selectedPool?.quota_unit === 'tokens' ? 'Token' : selectedPool?.quota_unit === 'requests' ? '次' : '张'} /></Form.Item></Col>
            <Col span={8}><Form.Item name="hourly_quota" label={`每小时限额(0=不限)`}><InputNumber min={0} style={{ width: '100%' }} addonAfter={selectedPool?.quota_unit === 'tokens' ? 'Token' : selectedPool?.quota_unit === 'requests' ? '次' : '张'} /></Form.Item></Col>
            <Col span={8}><Form.Item name="period_quota" label={`时段限额(0=不限)`}><InputNumber min={0} style={{ width: '100%' }} addonAfter={selectedPool?.quota_unit === 'tokens' ? 'Token' : selectedPool?.quota_unit === 'requests' ? '次' : '张'} /></Form.Item></Col>
          </Row>
          <Form.Item name="priority" label="优先级（越大越优先，顺序模式下有效）">
            <InputNumber min={0} max={999} style={{ width: '100%' }} />
          </Form.Item>
          {editingAccount && (
            <Form.Item name="status" label="状态">
              <Select options={[{ label: '可用', value: 'active' }, { label: '禁用', value: 'disabled' }]} />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
};

export default PoolManager;
