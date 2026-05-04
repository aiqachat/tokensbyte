import React, { useCallback, useEffect, useState } from 'react';
import { Table, Tag, Card, Typography, Space, Input, Button, Avatar, Row, Col, Descriptions, theme, Grid, Select, Tooltip } from 'antd';
import MobileCardList, { MobileCard, CardRow, CardActions } from '../../components/MobileCardList';
import { SyncOutlined, SearchOutlined, UserOutlined, DownOutlined, UpOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';
import useSettingsStore from '../../store/settings';
import useAuthStore from '../../store/auth';
import { useThemeStore } from '../../store/theme';
import type { RequestLog, ModelModel } from '../../types';
import dayjs from 'dayjs';

const { Option } = Select;

const { Text } = Typography;
const { useBreakpoint } = Grid;

const maskUrlDomain = (url: string) => {
  try {
    const u = new URL(url);
    return `${u.protocol}//***${u.pathname}${u.search}${u.hash}`;
  } catch {
    return url.replace(/^(https?:\/\/)[^\/]+/, '$1***');
  }
};

const Logs: React.FC = () => {
  const { t } = useTranslation();
  const { token: themeToken } = theme.useToken();
  const { settings } = useSettingsStore();
  const { themeMode } = useThemeStore();
  const _isLight = themeMode === 'light';
  const currencySymbol = settings?.currency?.currency_symbol || '$';
  const [logs, setLogs] = useState<RequestLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [modelFilter, setModelFilter] = useState('');
  const [userFilter, setUserFilter] = useState<string | undefined>(undefined);
  const [channelFilter, setChannelFilter] = useState<number | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [channelsList, setChannelsList] = useState<any[]>([]);
  const { user } = useAuthStore();
  const screens = useBreakpoint();

  useEffect(() => {
    if (user?.role === 'admin') {
      request.get('/users').then((res: any) => setUsersList(res.data || [])).catch(console.error);
      request.get('/channels').then((res: any) => setChannelsList(res.data || [])).catch(console.error);
    }
  }, [user]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, per_page: pageSize, model: modelFilter || undefined };
      if (userFilter) params.user_id = userFilter;
      if (channelFilter) params.channel_id = channelFilter;
      if (statusFilter) params.status = statusFilter;
      const resp = await (request.get('/logs', { params }) as unknown as Promise<{ data: RequestLog[]; total: number }>);
      setLogs(resp.data);
      setTotal(resp.total);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, modelFilter, userFilter, channelFilter, statusFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const columns = ([
    {
      title: t('logs.time'),
      dataIndex: 'created_at',
      key: 'created_at',
      width: 170,
      render: (text: string) => <Text style={{ fontSize: 12 }}>{dayjs(text).format('YYYY-MM-DD HH:mm:ss')}</Text>,
    },
    {
      title: '渠道AID',
      dataIndex: 'channel_group_aid',
      key: 'channel_group_aid',
      width: 80,
      render: (text: string) => <Text type="secondary" style={{ fontSize: 12 }}>{text || '-'}</Text>,
    },
    user?.role === 'admin' ? {
      title: '用户',
      key: 'user',
      width: 150,
      render: (_: any, record: RequestLog) => {
        const name = record.user_nickname || record.user_id?.slice(0, 8) || '-';
        const initial = name[0]?.toUpperCase() || '?';
        return (
          <Space size={6}>
            <Avatar size="small" style={{ backgroundColor: themeToken.colorPrimary, fontSize: 12 }}>{initial}</Avatar>
            <Space direction="vertical" size={0}>
              <Text style={{ fontSize: 12 }}>{name}</Text>
              {record.user_uid && <Text type="secondary" style={{ fontSize: 10, fontFamily: 'monospace' }}>UID: {record.user_uid}</Text>}
            </Space>
          </Space>
        );
      },
    } : null,
    {
      title: '令牌',
      key: 'token_name',
      width: 120,
      render: (_: any, record: RequestLog) => (
        <Space direction="vertical" size={0}>
          <Text style={{ fontSize: 12 }}>{record.token_name || '-'}</Text>
          {record.token_kid && <Text type="secondary" style={{ fontSize: 10, fontFamily: 'monospace' }}>KID: {record.token_kid}</Text>}
        </Space>
      ),
    },

    {
      title: t('logs.status'),
      dataIndex: 'status_code',
      key: 'status_code',
      width: 60,
      render: (code: number) => <Tag color={code === 200 ? 'success' : 'error'}>{code}</Tag>,
    },
    {
      title: t('logs.model'),
      dataIndex: 'model',
      key: 'model',
      width: 180,
      ellipsis: true,
      render: (text: string, record: RequestLog) => (
        <Space direction="vertical" size={0}>
          <Text style={{ fontSize: 12 }}>{text}</Text>
          {(record.billing_pid || record.forward_eid) && (
            <Space size={4}>
              {record.billing_pid && <Text type="secondary" style={{ fontSize: 10, fontFamily: 'monospace' }}>PID:{record.billing_pid}</Text>}
              {record.forward_eid && <Text type="secondary" style={{ fontSize: 10, fontFamily: 'monospace' }}>EID:{record.forward_eid}</Text>}
            </Space>
          )}
        </Space>
      ),
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
      render: (stream: number) => <Text type="secondary" style={{ fontSize: 12 }}>{stream === 1 ? '流' : '非流'}</Text>,
    },
    {
      title: t('logs.usage'),
      key: 'usage',
      width: 100,
      render: (_: any, record: RequestLog) => (
        <Space direction="vertical" size={0}>
          <Text type="secondary" style={{ fontSize: 11 }}>输入: {record.prompt_tokens}</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>输出: {record.completion_tokens}</Text>
          {(record.cached_tokens ?? 0) > 0 && <Text type="secondary" style={{ fontSize: 11, color: '#52c41a' }}>缓存(输入内): {record.cached_tokens}</Text>}
        </Space>
      ),
    },
    {
      title: t('logs.cost'),
      dataIndex: 'cost',
      key: 'cost',
      width: 90,
      render: (val: number, record: RequestLog) => (
        <Space direction="vertical" size={0}>
          {val === 0
            ? <Text type="secondary" style={{ fontSize: 12 }}>-</Text>
            : <Text strong style={{ fontSize: 12, color: themeToken.colorError }}>{currencySymbol}{val.toFixed(4)}</Text>
          }
          {record.billing_detail?.includes('退回') && (
            <Tag color="orange" style={{ margin: 0, fontSize: 10, lineHeight: '14px', padding: '0 4px' }}>已退费</Tag>
          )}
        </Space>
      ),
    },
  ].filter(Boolean)) as any[];

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
      <div style={{ 
        padding: 16, background: panelBg, borderRadius: 8, 
        maxWidth: screens.xs ? 'calc(100vw - 64px)' : 'calc(100vw - 320px)', 
        overflowX: 'auto', boxSizing: 'border-box'
      }}>
        <Descriptions size="small" column={1} labelStyle={{ width: '100px', color: themeToken.colorTextSecondary }} contentStyle={{ wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>
          <Descriptions.Item label="系统请求路径">
            {record.endpoint.startsWith('http') ? record.endpoint : `${window.location.origin}${record.endpoint.startsWith('/') ? '' : '/'}${record.endpoint}`}
          </Descriptions.Item>
          {record.upstream_url && (
            <Descriptions.Item label="真实上游地址">
              {user?.role === 'admin' ? record.upstream_url : maskUrlDomain(record.upstream_url)}
            </Descriptions.Item>
          )}
          <Descriptions.Item label="渠道标识">{record.channel_group_aid || '-'}</Descriptions.Item>
          <Descriptions.Item label="错误信息">
            {(() => {
              if (!record.error_message) return <Text type="secondary">无</Text>;
              try {
                const parsed = JSON.parse(record.error_message);
                return (
                  <div style={{
                    marginTop: 4, maxHeight: 300, overflow: 'auto',
                    background: codeBg, border: `1px solid ${codeBorder}`,
                    padding: 8, borderRadius: 6,
                  }}>
                    <pre style={{ margin: 0, fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: themeToken.colorError }}>
                      {JSON.stringify(parsed, null, 2)}
                    </pre>
                  </div>
                );
              } catch (e) {
                return <Text type="danger">{record.error_message}</Text>;
              }
            })()}
          </Descriptions.Item>
          <Descriptions.Item label="匹配规则">
            <Space size={16}>
              <Text type="secondary" style={{ fontSize: 12 }}>计费规则 (PID): {record.billing_pid ? <Typography.Text keyboard>{record.billing_pid}</Typography.Text> : '-'}</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>转发规则 (EID): {record.forward_eid ? <Typography.Text keyboard>{record.forward_eid}</Typography.Text> : '-'}</Text>
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label="计费明细">
            <div>
              {record.billing_detail ? (
                <Text type="secondary" style={{ fontSize: 12 }}>计算依据: {record.billing_detail}</Text>
              ) : (
                <Text type="secondary" style={{ fontSize: 12 }}>{costFormula}</Text>
              )}
              <br />
              <Text strong style={{ fontSize: 13, textDecoration: record.billing_detail?.includes('退回') ? 'line-through' : 'none' }}>实际扣费: {currencySymbol}{record.cost.toFixed(6)}</Text>
              {record.billing_detail?.includes('退回') && <Text type="danger" style={{ fontSize: 13, marginLeft: 8 }}>已全额退回</Text>}
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
    <Card variant="borderless" style={{ background: _isLight ? '#fff' : 'rgba(255,255,255,0.02)', borderRadius: 12 }}>
      <div style={{ display: 'flex', flexDirection: screens.xs ? 'column' : 'row', justifyContent: 'space-between', marginBottom: 24, alignItems: 'flex-start', gap: 12 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          <SyncOutlined style={{ marginRight: 8 }} />
          {t('menu.usage_logs', '使用日志')}
        </Typography.Title>
        <Space wrap>
          {user?.role === 'admin' && (
            <>
              <Select
                showSearch
                placeholder="搜索用户 (用户名/昵称/UID)"
                allowClear
                style={{ width: 220 }}
                value={userFilter}
                onChange={setUserFilter}
                optionFilterProp="children"
              >
                <Option value="unknown">未知用户 (unknown)</Option>
                {usersList.map(u => (
                  <Option key={u.id} value={u.id}>
                    {u.username} {u.nickname ? `(${u.nickname})` : ''} {u.uid ? `[UID: ${u.uid}]` : ''}
                  </Option>
                ))}
              </Select>
              <Select
                showSearch
                placeholder="筛选渠道"
                allowClear
                style={{ width: 140 }}
                value={channelFilter}
                onChange={setChannelFilter}
                optionFilterProp="children"
              >
                {channelsList.map(c => (
                  <Option key={c.id} value={c.id}>
                    #{c.id} {c.name}
                  </Option>
                ))}
              </Select>
            </>
          )}
          <Select
            placeholder="请求状态"
            allowClear
            style={{ width: 110 }}
            value={statusFilter}
            onChange={setStatusFilter}
          >
            <Option value="success">成功</Option>
            <Option value="fail">失败</Option>
          </Select>
          <Input
            placeholder={t('logs.search_model')}
            prefix={<SearchOutlined />}
            value={modelFilter}
            onChange={e => setModelFilter(e.target.value)}
            onPressEnter={fetchLogs}
            style={{ width: screens.xs ? '100%' : 140 }}
          />
          <Button icon={<SyncOutlined />} onClick={fetchLogs}>{t('common.refresh')}</Button>
        </Space>
      </div>

      {screens.xs ? (
        <MobileCardList
          dataSource={logs}
          loading={loading}
          rowKey="id"
          pagination={{
            total,
            current: page,
            pageSize,
            onChange: (p: number, s: number) => { setPage(p); setPageSize(s); },
          }}
          renderCard={(record: any) => {
            const userName = record.user_nickname || record.user_id?.slice(0, 8) || '-';
            return (
              <MobileCard
                title={<Tag color="blue">{record.model}</Tag>}
                extra={<Tag color={record.status_code === 200 ? 'success' : 'error'}>{record.status_code}</Tag>}
              >
                <CardRow label="时间"><Text type="secondary" style={{ fontSize: 12 }}>{dayjs(record.created_at).format('YYYY-MM-DD HH:mm:ss')}</Text></CardRow>
                {user?.role === 'admin' && (
                  <CardRow label="用户">
                    <Space size={4}>
                      <Avatar size={18} style={{ backgroundColor: themeToken.colorPrimary, fontSize: 10 }}>{userName[0]?.toUpperCase()}</Avatar>
                      <Space direction="vertical" size={0}>
                        <Text style={{ fontSize: 12 }}>{userName}</Text>
                        {record.user_uid && <Text type="secondary" style={{ fontSize: 10, fontFamily: 'monospace' }}>UID: {record.user_uid}</Text>}
                      </Space>
                    </Space>
                  </CardRow>
                )}
                {record.channel_group_aid && <CardRow label="渠道AID"><Text type="secondary" style={{ fontSize: 12 }}>{record.channel_group_aid}</Text></CardRow>}
                {(record.billing_pid || record.forward_eid) && (
                  <CardRow label="匹配规则">
                    <Space size={8}>
                      {record.billing_pid && <Text type="secondary" style={{ fontSize: 11 }}>PID:<Typography.Text keyboard style={{ fontSize: 10 }}>{record.billing_pid}</Typography.Text></Text>}
                      {record.forward_eid && <Text type="secondary" style={{ fontSize: 11 }}>EID:<Typography.Text keyboard style={{ fontSize: 10 }}>{record.forward_eid}</Typography.Text></Text>}
                    </Space>
                  </CardRow>
                )}
                <CardRow label="令牌">
                  <Space direction="vertical" size={0} align="end">
                    <Tag color="cyan" style={{ fontSize: 11, margin: 0 }}>{record.token_name || '-'}</Tag>
                    {record.token_kid && <Text type="secondary" style={{ fontSize: 10, fontFamily: 'monospace' }}>KID: {record.token_kid}</Text>}
                  </Space>
                </CardRow>
                <CardRow label="耗时"><Text style={{ fontSize: 12 }}>{(record.latency_ms / 1000).toFixed(3)}s</Text></CardRow>
                <CardRow label="类型"><Tag color={record.is_stream === 1 ? 'geekblue' : 'default'}>{record.is_stream === 1 ? '流' : '非流'}</Tag></CardRow>
                <CardRow label="用量">
                  <Space direction="vertical" size={0} align="end">
                    <Text type="secondary" style={{ fontSize: 12 }}>输入:{record.prompt_tokens} / 输出:{record.completion_tokens}</Text>
                    {(record.cached_tokens ?? 0) > 0 && <Text type="secondary" style={{ fontSize: 11, color: '#52c41a' }}>缓存(输入内):{record.cached_tokens}</Text>}
                  </Space>
                </CardRow>
                <CardRow label="成本">
                  <Space direction="vertical" size={0} align="end">
                    {record.cost === 0
                      ? <Text type="secondary" style={{ fontSize: 12 }}>-</Text>
                      : <Text strong style={{ fontSize: 12, color: themeToken.colorError }}>{currencySymbol}{record.cost.toFixed(4)}</Text>
                    }
                    {record.billing_detail?.includes('退回') && (
                      <Tag color="orange" style={{ margin: 0, fontSize: 10, lineHeight: '14px', padding: '0 4px' }}>已退费</Tag>
                    )}
                  </Space>
                </CardRow>
              </MobileCard>
            );
          }}
        />
      ) : (
        <Table
          dataSource={logs}
          columns={columns}
          rowKey="id"
          loading={loading}
          expandable={
            (user?.role === 'admin' || user?.allow_view_log_details !== 0) ? { 
              expandedRowRender, 
              expandRowByClick: false
            } : undefined
          }
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
      )}
    </Card>
  );
};

export default Logs;
