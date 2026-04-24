import React, { useState, useEffect, useCallback } from 'react';
import { Table, Tag, Button, Space, Typography, DatePicker, Input, Select, Row, Col, Form, message, Grid, Descriptions } from 'antd';
import MobileCardList, { MobileCard, CardRow } from '../../components/MobileCardList';
import { SyncOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import request from '../../utils/request';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import useAuthStore from '../../store/auth';

const { RangePicker } = DatePicker;
const { Text } = Typography;
const { useBreakpoint } = Grid;

interface TaskLog {
  id: number;
  user_id: string;
  channel_id: number | null;
  model: string;
  endpoint: string;
  prompt_tokens: number;
  completion_tokens: number;
  cost: number;
  latency_ms: number;
  status_code: number;
  error_message: string | null;
  request_content: string | null;
  response_content: string | null;
  billing_detail: string | null;
  channel_name: string | null;
  channel_group_aid: string | null;
  user_nickname: string | null;
  created_at: string;
}

// ── 工具函数：从 endpoint 推断任务类型 ──────────────────────────
const getTaskType = (ep: string) => {
  if (ep.includes('chat/completions') || ep.includes('generateContent'))
    return { label: '聊天', color: 'blue', icon: '💬' };
  if (ep.includes('images/generations'))
    return { label: '图片', color: 'purple', icon: '🖼️' };
  if (ep.includes('video/generations') || ep.includes('contents/generations'))
    return { label: '视频', color: 'orange', icon: '🎬' };
  return { label: '其它', color: 'default', icon: '🔧' };
};

// ── 工具函数：判断是否异步提交（视频 POST 或带有 task_id 的图片 POST） ─────────────────────
const isAsyncPost = (r: TaskLog) => {
  const ep = r.endpoint || '';
  if (ep.endsWith('/video/generations') || ep.endsWith('/generations/tasks')) return true;
  if (ep.endsWith('/images/generations') && r.response_content) {
    try {
      const v = JSON.parse(r.response_content);
      // 支持根节点、data 对象、data 数组第一项
      return !!(v.task_id || v.data?.task_id || (Array.isArray(v.data) && v.data[0]?.task_id));
    } catch { return false; }
  }
  return false;
};

// ── 工具函数：获取异步任务终态 ─────────────────────────
const getAsyncFinalStatus = (r: TaskLog): 'pending' | 'succeeded' | 'failed' => {
  if (!isAsyncPost(r)) return 'succeeded';
  
  // 1. 优先从最新的响应结果中解析状态
  if (r.response_content) {
    try {
      const v = JSON.parse(r.response_content);
      const status = v.status || v.final_result?.status || v.output?.status;
      if (status === 'succeeded' || status === 'SUCCESS') return 'succeeded';
      if (status === 'failed' || status === 'FAILED') return 'failed';
    } catch { /* ignore */ }
  }

  // 2. 兜底逻辑：通过计费明细判断（结算后"冻结"字样会被替换）
  if (r.billing_detail) {
    if (r.billing_detail.includes('失败')) return 'failed';
    if (!r.billing_detail.includes('冻结')) return 'succeeded'; // 计费完成
  }

  return 'pending'; // 尚未结算
};

// ── 工具函数：从异步响应中提取完成时间戳（秒级 Unix） ─────────
const getAsyncCompletedTs = (r: TaskLog): number | null => {
  if (!r.response_content) return null;
  try {
    const v = JSON.parse(r.response_content);
    // 异步任务响应中 updated_at 是任务完成的 Unix 时间戳（秒）
    // 修复 Bug：此前错误地读取了 v.created_at（创建时间），导致 (结束时间 - 创建时间) 永远接近于 0秒
    const ts = v.updated_at ?? v.final_result?.updated_at ?? v.output?.updated_at ?? null;
    return typeof ts === 'number' ? ts : null;
  } catch { return null; }
};

// ── 工具函数：从 endpoint/response 提取任务 ID ──────────────────
const getTaskId = (record: TaskLog): string => {
  const ep = record.endpoint;
  // 视频 GET：末尾是 task_id
  if ((ep.includes('video/generations/') || ep.includes('generations/tasks/'))
    && !ep.endsWith('/generations') && !ep.endsWith('/tasks')) {
    return ep.split('/').pop() || '-';
  }
  // 视频 POST / 异步图片：从 response_content 提取
  if (isAsyncPost(record) && record.response_content) {
    try {
      const r = JSON.parse(record.response_content);
      return r.task_id || r.id || r.data?.task_id || (Array.isArray(r.data) && r.data[0]?.task_id) || '-';
    } catch { /* ignore */ }
  }
  return '-';
};

// ── 工具函数：格式化 JSON 用于展示 ─────────────────────────────
const fmtJson = (raw: string | null): string => {
  if (!raw) return '-';
  try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { return raw; }
};

const TaskLogs: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';
  const [data, setData] = useState<TaskLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [form] = Form.useForm();
  const screens = useBreakpoint();

  const fetchLogs = useCallback(async (current = 1, size = 20) => {
    setLoading(true);
    try {
      const v = form.getFieldsValue();
      const params: any = { page: current, per_page: size };
      if (v.action_type) params.action_type = v.action_type;
      if (v.model) params.model = v.model;
      if (v.dateRange?.[0]) params.start_date = v.dateRange[0].format('YYYY-MM-DD');
      if (v.dateRange?.[1]) params.end_date = v.dateRange[1].format('YYYY-MM-DD');

      const res = await (request.get('/task_logs', { params }) as any);
      setData(res.data);
      setTotal(res.total);
      setPage(current);
      setPageSize(size);
    } catch (e) {
      console.error(e);
      message.error('获取任务日志失败');
    } finally {
      setLoading(false);
    }
  }, [form]);

  const handleSyncTask = async (id: number) => {
    try {
      const res = await (request.post(`/task_logs/${id}/sync`) as any);
      message.success(res.message || '任务状态已同步');
      fetchLogs(page, pageSize);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => { fetchLogs(); }, []);

  // ── 展开行：详细信息 ─────────────────────────────────────────
  const expandedRowRender = (record: TaskLog) => (
    <div style={{ padding: '8px 0' }}>
      <Descriptions size="small" column={1} bordered
        labelStyle={{ width: 120, color: '#8c8c8c', background: '#1a1a1a' }}
        contentStyle={{ background: '#141414', whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontFamily: 'monospace', fontSize: 12, maxHeight: 300, overflow: 'auto' }}
      >
        <Descriptions.Item label="Token 用量">
          输入 {record.prompt_tokens} / 输出 {record.completion_tokens}
        </Descriptions.Item>
        <Descriptions.Item label="费用">
          {record.cost > 0 ? record.cost.toFixed(6) : '0'}
        </Descriptions.Item>
        {record.billing_detail && (
          <Descriptions.Item label="计费明细">{fmtJson(record.billing_detail)}</Descriptions.Item>
        )}
        {record.request_content && (
          <Descriptions.Item label="请求参数">{fmtJson(record.request_content)}</Descriptions.Item>
        )}
        {record.response_content && (
          <Descriptions.Item label="响应内容">{fmtJson(record.response_content)}</Descriptions.Item>
        )}
      </Descriptions>
    </div>
  );

  // ── 表格列定义 ───────────────────────────────────────────────
  const columns: any[] = [
    {
      title: '提交时间',
      dataIndex: 'created_at',
      key: 'submit_time',
      width: 170,
      render: (v: string, r: TaskLog) => {
        // 异步任务 created_at 就是提交时间，同步任务需减去耗时
        const submit = isAsyncPost(r) ? dayjs(v) : dayjs(v).subtract(r.latency_ms, 'ms');
        return <Text style={{ fontSize: 13 }}>{submit.format('YYYY-MM-DD HH:mm:ss')}</Text>;
      },
    },
    {
      title: '结束时间',
      dataIndex: 'created_at',
      key: 'end_time',
      width: 170,
      render: (_: string, r: TaskLog) => {
        const status = getAsyncFinalStatus(r);
        if (status === 'pending') return <Tag color="processing" icon={<SyncOutlined spin />}>进行中</Tag>;
        // 已结束：优先从响应体提取完成时间戳
        const ts = getAsyncCompletedTs(r);
        const endTime = ts ? dayjs.unix(ts) : dayjs(r.created_at);
        return <Text style={{ fontSize: 13 }}>{endTime.format('YYYY-MM-DD HH:mm:ss')}</Text>;
      },
    },
    {
      title: '花费时间',
      key: 'time_spent',
      width: 100,
      render: (_: any, r: TaskLog) => {
        const status = getAsyncFinalStatus(r);
        if (isAsyncPost(r)) {
          if (status === 'pending') return <Tag color="processing">处理中...</Tag>;
          // 异步已完成：计算从提交到完成的总耗时
          const ts = getAsyncCompletedTs(r);
          if (ts) {
            const totalSec = ts - dayjs(r.created_at).unix();
            if (totalSec >= 60) return <Text type="secondary" style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: 4 }}>🕗 {(totalSec / 60).toFixed(1)}m</Text>;
            return <Text type="secondary" style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: 4 }}>🕗 {totalSec.toFixed(1)}s</Text>;
          }
        }
        return (
          <Text type="secondary" style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: 4 }}>
            🕗 {(r.latency_ms / 1000).toFixed(1)}s
          </Text>
        );
      },
    },
    {
      title: '渠道',
      key: 'channel',
      width: 160,
      render: (_: any, r: TaskLog) => {
        if (!r.channel_name) return '-';
        return (
          <Space size={4}>
            <Text>{r.channel_name}</Text>
            {r.channel_group_aid && <Tag style={{ borderRadius: 10 }}>{r.channel_group_aid}</Tag>}
          </Space>
        );
      },
    },
    {
      title: '类型',
      key: 'type',
      width: 80,
      render: (_: any, r: TaskLog) => {
        const t = getTaskType(r.endpoint);
        return <Tag color={t.color}>{t.icon} {t.label}</Tag>;
      },
    },
    {
      title: '模型',
      dataIndex: 'model',
      key: 'model',
      width: 180,
      ellipsis: true,
      render: (v: string) => <Text style={{ fontSize: 12, fontFamily: 'monospace' }}>{v || '-'}</Text>,
    },
    {
      title: '任务 ID',
      key: 'task_id',
      width: 200,
      ellipsis: true,
      render: (_: any, r: TaskLog) => {
        const tid = getTaskId(r);
        return <Text style={{ fontSize: 11, fontFamily: 'monospace' }} copyable={tid !== '-' ? { text: tid } : undefined}>{tid}</Text>;
      },
    },
    {
      title: '状态',
      key: 'status',
      width: 120,
      render: (_: any, r: TaskLog) => {
        const status = getAsyncFinalStatus(r);
        if (status === 'pending') {
          return (
            <Space>
              <Tag color="processing">进行中</Tag>
              <Button 
                type="text" 
                size="small" 
                icon={<SyncOutlined />} 
                onClick={(e) => { e.stopPropagation(); handleSyncTask(r.id); }} 
                title="手动同步状态"
              />
            </Space>
          );
        }
        if (status === 'failed') return <Tag color="error">失败</Tag>;
        return <Tag color="success">成功</Tag>;
      },
    },
  ];

  // 管理员额外显示用户列
  if (isAdmin) {
    columns.splice(4, 0, {
      title: '用户',
      key: 'user',
      width: 120,
      render: (_: any, r: TaskLog) => (
        <Text style={{ fontSize: 12 }}>{r.user_nickname || r.user_id}</Text>
      ),
    });
  }

  // ── 筛选栏 ───────────────────────────────────────────────────
  const filterBar = (
    <div style={{ padding: 16, background: '#141414', borderRadius: 8, marginBottom: 16 }}>
      <Form form={form} layout="inline" onFinish={() => fetchLogs(1, pageSize)}>
        <Form.Item name="action_type" style={{ marginBottom: 8 }}>
          <Select placeholder="全部类型" allowClear style={{ width: 120 }}
            options={[
              { label: '💬 聊天', value: 'chat' },
              { label: '🖼️ 图片', value: 'image' },
              { label: '🎬 视频', value: 'video' },
            ]}
          />
        </Form.Item>
        <Form.Item name="model" style={{ marginBottom: 8 }}>
          <Input placeholder="模型名称" allowClear style={{ width: 160 }} />
        </Form.Item>
        <Form.Item name="dateRange" style={{ marginBottom: 8 }}>
          <RangePicker />
        </Form.Item>
        <Form.Item style={{ marginBottom: 8 }}>
          <Space>
            <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>查询</Button>
            <Button onClick={() => { form.resetFields(); fetchLogs(1, pageSize); }}>重置</Button>
          </Space>
        </Form.Item>
      </Form>
    </div>
  );

  // ── 移动端卡片 ───────────────────────────────────────────────
  const renderMobileCard = (record: TaskLog) => {
    const tp = getTaskType(record.endpoint);
    const tid = getTaskId(record);
    const status = getAsyncFinalStatus(record);
    return (
      <MobileCard
        title={<Space><Tag color={tp.color}>{tp.icon} {tp.label}</Tag><Text style={{ fontSize: 12, fontFamily: 'monospace' }}>{record.model}</Text></Space>}
        extra={
          status === 'pending' ? (
            <Space>
              <Tag color="processing">进行中</Tag>
              <Button type="text" size="small" icon={<SyncOutlined />} onClick={(e) => { e.stopPropagation(); handleSyncTask(record.id); }} />
            </Space>
          ) : status === 'failed' ? <Tag color="error">失败</Tag> : <Tag color="success">成功</Tag>
        }
      >
        {record.channel_name && (
          <CardRow label="渠道">
            {record.channel_name} {record.channel_group_aid && <Tag style={{ borderRadius: 10, marginLeft: 4 }}>{record.channel_group_aid}</Tag>}
          </CardRow>
        )}
        {isAdmin && <CardRow label="用户"><Text style={{ fontSize: 12 }}>{record.user_nickname || record.user_id}</Text></CardRow>}
        <CardRow label="提交"><Text type="secondary" style={{ fontSize: 12 }}>{(isAsyncPost(record.endpoint) ? dayjs(record.created_at) : dayjs(record.created_at).subtract(record.latency_ms, 'ms')).format('MM-DD HH:mm:ss')}</Text></CardRow>
        <CardRow label="耗时"><Text type="secondary" style={{ fontSize: 12 }}>🕗 {(() => {
          if (isAsyncPost(record.endpoint)) {
            if (status === 'pending') return '处理中...';
            const ts = getAsyncCompletedTs(record);
            if (ts) { const sec = ts - dayjs(record.created_at).unix(); return sec >= 60 ? `${(sec / 60).toFixed(1)}m` : `${sec.toFixed(1)}s`; }
          }
          return `${(record.latency_ms / 1000).toFixed(1)}s`;
        })()}</Text></CardRow>
        {tid !== '-' && <CardRow label="任务ID"><Text style={{ fontSize: 11, fontFamily: 'monospace' }}>{tid}</Text></CardRow>}
        {record.cost > 0 && <CardRow label="费用"><Text style={{ fontSize: 12 }}>{record.cost.toFixed(6)}</Text></CardRow>}
      </MobileCard>
    );
  };

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Typography.Title level={4} style={{ margin: 0 }}>
            <SyncOutlined style={{ marginRight: 8 }} />
            {t('menu.task_logs', '任务日志')}
          </Typography.Title>
        </Col>
        <Col>
          <Button icon={<ReloadOutlined />} onClick={() => fetchLogs(page, pageSize)} loading={loading}>刷新</Button>
        </Col>
      </Row>

      {filterBar}

      {screens.xs ? (
        <MobileCardList
          dataSource={data}
          loading={loading}
          rowKey="id"
          pagination={{ current: page, pageSize, total, onChange: (p: number, s: number) => fetchLogs(p, s) }}
          renderCard={renderMobileCard}
        />
      ) : (
        <Table
          columns={columns}
          dataSource={data}
          rowKey="id"
          loading={loading}
          expandable={{ expandedRowRender, expandRowByClick: true }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (p, s) => fetchLogs(p, s),
          }}
          scroll={{ x: 'max-content' }}
          size="middle"
        />
      )}
    </div>
  );
};

export default TaskLogs;
