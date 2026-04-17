import React, { useCallback, useEffect, useState } from 'react';
import { Table, Tag, Card, Typography, Space, Input, Button, Avatar, Row, Col, Descriptions, theme } from 'antd';
import { SyncOutlined, SearchOutlined, UserOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';
import useSettingsStore from '../../store/settings';
import type { RequestLog, ModelModel } from '../../types';
import dayjs from 'dayjs';

const { Text } = Typography;

const Logs: React.FC = () => {
  const { t } = useTranslation();
  const { token: themeToken } = theme.useToken();
  const { settings } = useSettingsStore();
  const currencySymbol = settings?.currency?.currency_symbol || '$';
  const [logs, setLogs] = useState<RequestLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [modelFilter, setModelFilter] = useState('');
  const [modelsCache, setModelsCache] = useState<ModelModel[]>([]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await (request.get('/logs', {
        params: { page, per_page: pageSize, model: modelFilter || undefined }
      }) as unknown as Promise<{ data: RequestLog[]; total: number }>);
      setLogs(resp.data);
      setTotal(resp.total);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, modelFilter]);

  useEffect(() => {
    fetchLogs();
    request.get('/models').then((res: any) => setModelsCache(res.data || [])).catch(console.error);
  }, [fetchLogs]);

  const columns = [
    {
      title: t('logs.time'),
      dataIndex: 'created_at',
      key: 'created_at',
      width: 130,
      render: (text: string) => <Text style={{ fontSize: 12 }}>{dayjs(text).format('MM-DD HH:mm:ss')}</Text>,
    },
    {
      title: t('logs.model'),
      dataIndex: 'model',
      key: 'model',
      render: (text: string, record: RequestLog) => (
        <Space direction="vertical" size={0}>
          <Tag color="blue">{text}</Tag>
          {record.channel_name && <Text type="secondary" style={{ fontSize: 11 }}>渠道: {record.channel_name}</Text>}
        </Space>
      ),
    },
    {
      title: '令牌',
      dataIndex: 'token_name',
      key: 'token_name',
      width: 120,
      render: (text: string) => <Tag color="cyan">{text || '-'}</Tag>,
    },
    {
      title: '用户',
      key: 'user',
      width: 150,
      render: (_: any, record: RequestLog) => {
        const name = record.user_nickname || record.user_id?.slice(0, 8) || '-';
        const initial = name[0]?.toUpperCase() || '?';
        return (
          <Space size={6}>
            <Avatar size="small" style={{ backgroundColor: themeToken.colorPrimary, fontSize: 12 }}>{initial}</Avatar>
            <Text style={{ fontSize: 12 }}>{name}</Text>
          </Space>
        );
      },
    },
    {
      title: '分组',
      dataIndex: 'user_group',
      key: 'user_group',
      width: 80,
      render: (text: string) => <Tag color="purple">{text || 'default'}</Tag>,
    },
    {
      title: t('logs.usage'),
      key: 'usage',
      width: 100,
      render: (_: any, record: RequestLog) => (
        <Space direction="vertical" size={0}>
          <Text type="secondary" style={{ fontSize: 11 }}>输入: {record.prompt_tokens}</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>输出: {record.completion_tokens}</Text>
        </Space>
      ),
    },
    {
      title: t('logs.cost'),
      dataIndex: 'cost',
      key: 'cost',
      width: 90,
      render: (val: number) =>
        val === 0
          ? <Text type="secondary" style={{ fontSize: 12 }}>-</Text>
          : <Text strong style={{ fontSize: 12, color: themeToken.colorError }}>{currencySymbol}{val.toFixed(4)}</Text>,
    },
    {
      title: t('logs.latency'),
      dataIndex: 'latency_ms',
      key: 'latency_ms',
      width: 80,
      render: (val: number) => <Text style={{ fontSize: 12 }}>{(val / 1000).toFixed(3)}s</Text>,
    },
    {
      title: '类型',
      dataIndex: 'is_stream',
      key: 'is_stream',
      width: 60,
      render: (stream: number) => <Tag color={stream === 1 ? 'geekblue' : 'default'}>{stream === 1 ? '流' : '非流'}</Tag>,
    },
    {
      title: t('logs.status'),
      dataIndex: 'status_code',
      key: 'status_code',
      width: 60,
      render: (code: number) => <Tag color={code === 200 ? 'success' : 'error'}>{code}</Tag>,
    },
  ];

  const expandedRowRender = (record: RequestLog) => {
    let reqJson = record.request_content;
    let respJson = record.response_content;
    let upstreamReqJson = record.upstream_req_content;
    try {
      if (reqJson) reqJson = JSON.stringify(JSON.parse(reqJson), null, 2);
    } catch (e) { /* keep raw */ }
    try {
      if (respJson) respJson = JSON.stringify(JSON.parse(respJson), null, 2);
    } catch (e) { /* keep raw */ }
    try {
      if (upstreamReqJson) upstreamReqJson = JSON.stringify(JSON.parse(upstreamReqJson), null, 2);
    } catch (e) { /* keep raw */ }

    const costFormula = '由绑定的计费模板动态结算';

    // 使用 antd theme token 来适配深色/浅色主题
    const panelBg = themeToken.colorBgElevated;
    const codeBg = themeToken.colorFillQuaternary;
    const codeBorder = themeToken.colorBorderSecondary;

    return (
      <div style={{ padding: 16, background: panelBg, borderRadius: 8 }}>
        <Descriptions size="small" column={1} labelStyle={{ width: '100px', color: themeToken.colorTextSecondary }}>
          <Descriptions.Item label="系统请求路径">
            {record.endpoint.startsWith('http') ? record.endpoint : `${window.location.protocol}//${window.location.hostname}:3000${record.endpoint.startsWith('/') ? '' : '/'}${record.endpoint}`}
          </Descriptions.Item>
          {record.upstream_url && <Descriptions.Item label="真实上游地址">{record.upstream_url}</Descriptions.Item>}
          <Descriptions.Item label="渠道标识">{record.channel_group_aid || '-'}</Descriptions.Item>
          <Descriptions.Item label="错误信息">
            {record.error_message ? <Text type="danger">{record.error_message}</Text> : <Text type="secondary">无</Text>}
          </Descriptions.Item>
          <Descriptions.Item label="计费明细">
            <div>
              {record.billing_detail ? (
                <Text type="secondary" style={{ fontSize: 12 }}>计算依据: {record.billing_detail}</Text>
              ) : (
                <Text type="secondary" style={{ fontSize: 12 }}>{costFormula}</Text>
              )}
              <br />
              <Text strong style={{ fontSize: 13 }}>实际扣费: {currencySymbol}{record.cost.toFixed(6)}</Text>
              <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>（优先扣令牌配额，不足扣用户余额）</Text>
            </div>
          </Descriptions.Item>
        </Descriptions>

        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col span={24} style={{ maxWidth: '100%', overflow: 'hidden' }}>
            <Text strong style={{ fontSize: 13 }}>请求参数（入参）</Text>
            <div style={{
              marginTop: 8, maxHeight: 300, overflow: 'auto',
              background: codeBg, border: `1px solid ${codeBorder}`,
              padding: 12, borderRadius: 6,
            }}>
              <pre style={{ margin: 0, fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {reqJson || '该模型未开启「记录上下文」或内容为空'}
              </pre>
            </div>
          </Col>
          <Col span={24} style={{ maxWidth: '100%', overflow: 'hidden' }}>
            <Text strong style={{ fontSize: 13 }}>真实转发给上游的请求参数（出参）</Text>
            <div style={{
              marginTop: 8, maxHeight: 300, overflow: 'auto',
              background: codeBg, border: `1px solid ${codeBorder}`,
              padding: 12, borderRadius: 6,
            }}>
              <pre style={{ margin: 0, fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {upstreamReqJson || '同【请求参数】或未记录。对于未发生协议变异的请求默认展示同上。'}
              </pre>
            </div>
          </Col>
          <Col span={24} style={{ maxWidth: '100%', overflow: 'hidden' }}>
            <Text strong style={{ fontSize: 13 }}>响应结果</Text>
            <div style={{
              marginTop: 8, maxHeight: 300, overflow: 'auto',
              background: codeBg, border: `1px solid ${codeBorder}`,
              padding: 12, borderRadius: 6,
            }}>
              <pre style={{ margin: 0, fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {respJson || '该模型未开启「记录上下文」或内容为空'}
              </pre>
            </div>
          </Col>
        </Row>
      </div>
    );
  };

  return (
    <Card bordered={false}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24, alignItems: 'center' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          <SyncOutlined style={{ marginRight: 8 }} />
          {t('menu.usage_logs', '使用日志')}
        </Typography.Title>
        <Space>
          <Input
            placeholder={t('logs.search_model')}
            prefix={<SearchOutlined />}
            value={modelFilter}
            onChange={e => setModelFilter(e.target.value)}
            onPressEnter={fetchLogs}
          />
          <Button icon={<SyncOutlined />} onClick={fetchLogs}>{t('common.refresh')}</Button>
        </Space>
      </div>

      <Table
        dataSource={logs}
        columns={columns}
        rowKey="id"
        loading={loading}
        expandable={{ expandedRowRender, expandRowByClick: true }}
        pagination={{
          total,
          current: page,
          pageSize,
          onChange: (p, s) => { setPage(p); setPageSize(s); },
          showSizeChanger: true,
        }}
        size="middle"
        locale={{ emptyText: t('dashboard.no_data') }}
        scroll={{ x: 'max-content' }}
      />
    </Card>
  );
};

export default Logs;
