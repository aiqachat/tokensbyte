import React, { useEffect, useState } from 'react';
import { Table, Button, Space, Tag, Modal, Form, Input, InputNumber, Switch, message, Popconfirm, Card, Typography, AutoComplete, Grid, Tooltip } from 'antd';
import MobileCardList, { MobileCard, CardRow, CardActions } from '../../components/MobileCardList';
import { PlusOutlined, EditOutlined, DeleteOutlined, SyncOutlined, ClearOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';
import useSettingsStore from '../../store/settings';
import type { ChannelConfig, Upstream } from '../../types';
import {
  formatQuotaLimitDisplay,
  parseQuotaLimitInput,
  getEffectiveChannelPeriodUsed,
} from '../../utils/quotaPeriod';

const { Title, Text } = Typography;
const { useBreakpoint } = Grid;

const ChannelConfigs: React.FC = () => {
  const { t } = useTranslation();
  const screens = useBreakpoint();
  const { settings } = useSettingsStore();
  const quotaTz = settings?.site?.default_timezone || 'Asia/Shanghai';
  const [configs, setConfigs] = useState<ChannelConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingConfig, setEditingConfig] = useState<ChannelConfig | null>(null);
  const [upstreams, setUpstreams] = useState<{ id: number, name: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [enableQuota, setEnableQuota] = useState(false);
  const [form] = Form.useForm();

  const fetchConfigs = async () => {
    setLoading(true);
    try {
      const resp = await (request.get('/channel-configs') as unknown as Promise<{ data: ChannelConfig[] }>);
      setConfigs(resp.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchUpstreams = async () => {
    try {
      const pResp = await (request.get('/upstreams') as unknown as Promise<Upstream[]>);
      setUpstreams(pResp || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchConfigs();
    fetchUpstreams();
  }, []);

  const handleAdd = () => {
    setEditingConfig(null);
    setEnableQuota(false);
    form.resetFields();
    form.setFieldsValue({
      sort_order: 0,
      rate: 1.0,
      priority: 0,
      weight: 1,
      quota_limit: -1,
      daily_quota_limit: -1,
      weekly_quota_limit: -1,
      monthly_quota_limit: -1,
    });
    setIsModalVisible(true);
  };

  const handleEdit = (record: ChannelConfig) => {
    setEditingConfig(record);
    const q = record.quota_limit ?? -1;
    const dq = record.daily_quota_limit ?? -1;
    const wq = record.weekly_quota_limit ?? -1;
    const mq = record.monthly_quota_limit ?? -1;
    setEnableQuota(q >= 0 || dq >= 0 || wq >= 0 || mq >= 0);
    form.resetFields();
    form.setFieldsValue({
      ...record,
      quota_limit: record.quota_limit ?? -1,
      daily_quota_limit: record.daily_quota_limit ?? -1,
      weekly_quota_limit: record.weekly_quota_limit ?? -1,
      monthly_quota_limit: record.monthly_quota_limit ?? -1,
    });
    setIsModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await request.delete(`/channel-configs/${id}`);
      message.success(t('common.success'));
      fetchConfigs();
    } catch (e) {
      console.error(e);
    }
  };

  const handleResetQuota = async (id: number) => {
    try {
      await request.post(`/channel-configs/${id}/quota/reset`);
      message.success('已清零上游预设已用额度');
      fetchConfigs();
    } catch (e) {
      console.error(e);
      message.error('清零额度失败');
    }
  };

  const handleSave = async (values: any) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const payload = {
        ...values,
        base_url: values.base_url ? values.base_url.trim() : values.base_url,
        sort_order: Number(values.sort_order) || 0,
        rate: values.rate !== undefined && values.rate !== null ? Number(values.rate) : 1.0,
        priority: values.priority !== undefined && values.priority !== null ? Number(values.priority) : 0,
        weight: values.weight !== undefined && values.weight !== null ? Number(values.weight) : 1,
        quota_limit: (!enableQuota || values.quota_limit === undefined || values.quota_limit === null) ? -1 : Number(values.quota_limit),
        daily_quota_limit: (!enableQuota || values.daily_quota_limit === undefined || values.daily_quota_limit === null) ? -1 : Number(values.daily_quota_limit),
        weekly_quota_limit: (!enableQuota || values.weekly_quota_limit === undefined || values.weekly_quota_limit === null) ? -1 : Number(values.weekly_quota_limit),
        monthly_quota_limit: (!enableQuota || values.monthly_quota_limit === undefined || values.monthly_quota_limit === null) ? -1 : Number(values.monthly_quota_limit),
      };
      if (editingConfig) {
        // 密钥未修改（与加载时原值相同）时或未填写时不提交，防止覆盖；但如果显式清空(等于空字符串)，则提交给后端处理
        if (payload.api_key === undefined || payload.api_key === editingConfig.api_key) {
          delete payload.api_key;
        } else if (typeof payload.api_key === 'string') {
          payload.api_key = payload.api_key.trim();
        }
        await request.put(`/channel-configs/${editingConfig.id}`, payload);
        message.success(t('common.success'));
      } else {
        if (typeof payload.api_key === 'string') {
          payload.api_key = payload.api_key.trim();
        }
        await request.post('/channel-configs', payload);
        message.success(t('common.success'));
      }
      setIsModalVisible(false);
      fetchConfigs();
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  const renderQuotaCell = (record: ChannelConfig) => {
    const used = record.quota_used || 0;
    const limit = record.quota_limit ?? -1;
    const dailyLimit = record.daily_quota_limit ?? -1;
    const weeklyLimit = record.weekly_quota_limit ?? -1;
    const monthlyLimit = record.monthly_quota_limit ?? -1;
    const { dailyUsed, weeklyUsed, monthlyUsed } = getEffectiveChannelPeriodUsed(record, quotaTz);
    const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(6));
    return (
      <div style={{ fontSize: 12, lineHeight: 1.4, whiteSpace: 'nowrap' }}>
        <div>{fmt(used)} / {limit < 0 ? '∞' : fmt(Number(limit))}</div>
        {dailyLimit >= 0 && <div style={{ color: 'var(--ant-color-text-secondary)' }}>日 {fmt(dailyUsed)}/{fmt(dailyLimit)}</div>}
        {weeklyLimit >= 0 && <div style={{ color: 'var(--ant-color-text-secondary)' }}>周 {fmt(weeklyUsed)}/{fmt(weeklyLimit)}</div>}
        {monthlyLimit >= 0 && <div style={{ color: 'var(--ant-color-text-secondary)' }}>月 {fmt(monthlyUsed)}/{fmt(monthlyLimit)}</div>}
      </div>
    );
  };

  const filteredConfigs = configs.filter(config => {
    if (searchText) {
      const searchLower = searchText.toLowerCase();
      const nameMatch = config.name?.toLowerCase().includes(searchLower);
      const yidMatch = config.yid?.toLowerCase().includes(searchLower);
      const providerMatch = config.provider_type?.toLowerCase().includes(searchLower);
      return nameMatch || yidMatch || providerMatch;
    }
    return true;
  });

  const columns = [
    {
      title: '配置',
      key: 'name',
      width: 180,
      ellipsis: true,
      render: (_: unknown, record: ChannelConfig) => (
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{record.name}</div>
          <Typography.Text keyboard style={{ color: '#1677ff', fontSize: 11 }}>
            YID {record.yid || '-'}
          </Typography.Text>
        </div>
      ),
    },
    {
      title: '服务商',
      dataIndex: 'provider_type',
      key: 'provider_type',
      width: 100,
      ellipsis: true,
      render: (text: string) => text || '-',
    },
    {
      title: '调度',
      key: 'schedule',
      width: 110,
      render: (_: unknown, record: ChannelConfig) => (
        <Space size={4} wrap={false}>
          <Tooltip title="优先级"><Text type="secondary" style={{ fontSize: 12 }}>P{record.priority || 0}</Text></Tooltip>
          <Tooltip title="权重"><Text type="secondary" style={{ fontSize: 12 }}>W{record.weight || 1}</Text></Tooltip>
          <Tag color="orange" style={{ margin: 0, lineHeight: '18px', fontSize: 12 }}>{record.rate ?? 1.0}x</Tag>
        </Space>
      ),
    },
    {
      title: '额度',
      key: 'quota',
      width: 130,
      render: (_: unknown, record: ChannelConfig) => renderQuotaCell(record),
    },
    {
      title: 'Base URL',
      dataIndex: 'base_url',
      key: 'base_url',
      width: 200,
      ellipsis: true,
      render: (text: string) => (
        <Tooltip title={text}>
          <Text code style={{ fontSize: 12 }}>{text}</Text>
        </Tooltip>
      ),
    },
    {
      title: '排序',
      dataIndex: 'sort_order',
      key: 'sort_order',
      width: 56,
      align: 'center' as const,
      render: (val: number) => <Text type="secondary">{val || 0}</Text>,
    },
    {
      title: '备注',
      dataIndex: 'remark',
      key: 'remark',
      width: 120,
      ellipsis: true,
      render: (text: string) => <Text type="secondary">{text || '-'}</Text>,
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 120,
      fixed: 'right' as const,
      render: (_: unknown, record: ChannelConfig) => (
        <Space size={0}>
          <Tooltip title="清零额度">
            <Popconfirm title="确定清零该预设的总/日/周/月已用额度吗？" onConfirm={() => handleResetQuota(record.id)}>
              <Button type="text" size="small" icon={<ClearOutlined />} />
            </Popconfirm>
          </Tooltip>
          <Tooltip title="编辑">
            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          </Tooltip>
          <Tooltip title="删除">
            <Popconfirm title={t('common.confirm_delete')} onConfirm={() => handleDelete(record.id)}>
              <Button type="text" size="small" icon={<DeleteOutlined />} danger />
            </Popconfirm>
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <Card bordered={false}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
        <Title level={screens.xs ? 4 : 2} style={{ margin: 0 }}>上游渠道配置预设</Title>
        <Space wrap>
          <Input.Search
            placeholder="名称、YID或服务商"
            allowClear
            onSearch={setSearchText}
            onChange={(e) => !e.target.value && setSearchText('')}
            style={{ width: screens.xs ? '100%' : 220 }}
          />
          <Button icon={<SyncOutlined />} onClick={fetchConfigs}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>添加配置</Button>
        </Space>
      </div>

      {screens.xs ? (
        <MobileCardList
          dataSource={filteredConfigs}
          loading={loading}
          rowKey="id"
          renderCard={(record: ChannelConfig) => (
            <MobileCard
              title={record.name}
              extra={<Typography.Text keyboard style={{ color: '#1677ff' }}>{record.yid || '-'}</Typography.Text>}
            >
              <CardRow label="服务商广场展示">{record.provider_type || '-'}</CardRow>
              <CardRow label="Base URL"><Text code style={{ fontSize: 12 }}>{record.base_url}</Text></CardRow>
              <CardRow label="额度">{renderQuotaCell(record)}</CardRow>
              <CardRow label="备注">{record.remark || '-'}</CardRow>
              <CardActions>
                <Tooltip title="清零额度">
                  <Popconfirm title="确定清零已用额度吗？" onConfirm={() => handleResetQuota(record.id)}>
                    <Button type="text" size="small" icon={<ClearOutlined />} />
                  </Popconfirm>
                </Tooltip>
                <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
                <Popconfirm title={t('common.confirm_delete')} onConfirm={() => handleDelete(record.id)}>
                  <Button type="text" size="small" icon={<DeleteOutlined />} danger />
                </Popconfirm>
              </CardActions>
            </MobileCard>
          )}
        />
      ) : (
        <Table
          size="small"
          dataSource={filteredConfigs}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 15, showTotal: (total) => `共 ${total} 条` }}
          scroll={{ x: 900 }}
        />
      )}

      <Modal
        title={editingConfig ? "编辑上游渠道配置" : "添加上游渠道配置"}
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        onOk={() => form.submit()}
        confirmLoading={submitting}
        width={640}
      >
        <Form form={form} layout="vertical" onFinish={handleSave} autoComplete="off">
          <Form.Item name="name" label="配置名称" rules={[{ required: true }]}>
            <Input placeholder="例如：OpenAI 官方渠道接口" autoComplete="off" />
          </Form.Item>
          <Form.Item name="provider_type" label="服务商类型(模型广场展示)">
            <Input placeholder="可自由输入 (如: custom)" autoComplete="off" />
          </Form.Item>
          <div style={{ display: 'flex', gap: '16px' }}>
            <Form.Item name="rate" label="渠道倍率" rules={[{ required: true }]} style={{ flex: 1 }}>
              <InputNumber min={0} step={0.1} placeholder="1.0" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="priority" label="请求优先级priority" rules={[{ required: true }]} style={{ flex: 1 }}>
              <InputNumber min={0} placeholder="0" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="weight" label="请求权重weight" rules={[{ required: true }]} style={{ flex: 1 }}>
              <InputNumber min={1} placeholder="1" style={{ width: '100%' }} />
            </Form.Item>
          </div>
          <Form.Item label="额度配置" style={{ marginBottom: 16 }}>
            <Switch 
              checked={enableQuota}
              onChange={(checked) => {
                setEnableQuota(checked);
                if (!checked) {
                  form.setFieldsValue({
                    quota_limit: -1,
                    daily_quota_limit: -1,
                    weekly_quota_limit: -1,
                    monthly_quota_limit: -1,
                  });
                } else {
                  form.setFieldsValue({
                    quota_limit: -1,
                    daily_quota_limit: -1,
                    weekly_quota_limit: -1,
                    monthly_quota_limit: -1,
                  });
                }
              }}
              checkedChildren="已开启限额"
              unCheckedChildren="默认不限额"
            />
          </Form.Item>
          {enableQuota && (
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <Form.Item name="quota_limit" label="总额度" initialValue={-1} style={{ flex: 1, minWidth: 120 }} extra="-1 无限额">
                <InputNumber min={-1} style={{ width: '100%' }} formatter={formatQuotaLimitDisplay} parser={parseQuotaLimitInput} />
              </Form.Item>
              <Form.Item name="daily_quota_limit" label="日额度" initialValue={-1} style={{ flex: 1, minWidth: 120 }} extra="-1 不限制">
                <InputNumber min={-1} style={{ width: '100%' }} formatter={formatQuotaLimitDisplay} parser={parseQuotaLimitInput} />
              </Form.Item>
              <Form.Item name="weekly_quota_limit" label="周额度" initialValue={-1} style={{ flex: 1, minWidth: 120 }} extra="-1 不限制">
                <InputNumber min={-1} style={{ width: '100%' }} formatter={formatQuotaLimitDisplay} parser={parseQuotaLimitInput} />
              </Form.Item>
              <Form.Item name="monthly_quota_limit" label="月额度" initialValue={-1} style={{ flex: 1, minWidth: 120 }} extra="-1 不限制">
                <InputNumber min={-1} style={{ width: '100%' }} formatter={formatQuotaLimitDisplay} parser={parseQuotaLimitInput} />
              </Form.Item>
            </div>
          )}
          <Form.Item name="base_url" label="端点基础地址 (Base URL)" rules={[{ required: true }]}>
            <AutoComplete
              options={[
                { value: 'https://ark.cn-beijing.volces.com', label: '火山方舟 (https://ark.cn-beijing.volces.com)' },
                { value: 'https://ark.ap-southeast.bytepluses.com/api/v3', label: 'BytePlus(ap-southeast-1) (https://ark.ap-southeast.bytepluses.com/api/v3)' },
                { value: 'https://ark.eu-west.bytepluses.com/api/v3', label: 'BytePlus(eu-west-1) (https://ark.eu-west.bytepluses.com/api/v3)' },
                { value: 'https://api-beijing.klingai.com', label: '可灵 (https://api-beijing.klingai.com)' },
                { value: 'https://dashscope.aliyuncs.com', label: '阿里百炼 (https://dashscope.aliyuncs.com)' },
                { value: 'https://vod.tencentcloudapi.com', label: '腾讯云 VOD AIGC (https://vod.tencentcloudapi.com)' },
                { value: 'https://visual.volcengineapi.com', label: '即梦AI/火山CV (https://visual.volcengineapi.com)' },
              ]}
              placeholder="可直接选择预设地址或自由输入"
              filterOption={(inputValue, option) =>
                String(option?.label || '').toUpperCase().indexOf(inputValue.toUpperCase()) !== -1 ||
                String(option?.value || '').toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
              }
            />
          </Form.Item>
          <Form.Item
            name="api_key"
            label="请求鉴权密钥 (API Key)"
            extra={editingConfig ? '保持不变直接保存即可，输入新值将覆盖旧密钥' : '可灵 AI 格式：access_key:secret_key；腾讯云 VOD 格式：SecretId:SecretKey:SubAppId；即梦AI 格式：AccessKeyID:SecretAccessKey；其他：sk-xxx'}
          >
            <Input.Password 
              autoComplete="new-password"
              placeholder={editingConfig ? '保持当前密钥或输入新值覆盖' : 'sk-... 或 access_key:secret_key'} 
            />
          </Form.Item>
          <Form.Item name="remark" label="备注说明" extra="在这里记录您的渠道归属、适用场景等信息，方便自己查阅">
            <Input.TextArea rows={2} placeholder="例如：这是供图片生成的官方主通道..." />
          </Form.Item>
          <Form.Item name="sort_order" label="页面排序" extra="数字越大在页面中越靠前">
            <InputNumber placeholder="0" style={{ width: '120px' }} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default ChannelConfigs;
