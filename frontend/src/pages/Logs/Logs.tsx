import React, { useCallback, useEffect, useState } from 'react';
import { Table, Tag, Card, Typography, Space, Input, Button, Avatar, Row, Col, Descriptions, theme, Grid, Tooltip, DatePicker, message, Radio } from 'antd';
import MobileCardList, { MobileCard, CardRow, CardActions } from '../../components/MobileCardList';
import { RefreshCw, Search, Download, Image as ImageIcon, MessageSquare, Video, Wrench, LayoutGrid, Copy, Cuboid, ListOrdered, Mic } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';
import useSettingsStore from '../../store/settings';
import useAuthStore from '../../store/auth';
import { useThemeStore } from '../../store/theme';
import type { RequestLog, ModelModel } from '../../types';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
dayjs.extend(utc);

const { RangePicker } = DatePicker;

const { Text } = Typography;
const { useBreakpoint } = Grid;


const CopyButton: React.FC<{ text: string, color?: string }> = ({ text, color }) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  return (
    <Tooltip title={copied ? t('logs.copy_success', '已复制') : t('logs.copy', '复制')} open={copied || undefined}>
      <Button 
        size="small" 
        type="text" 
        icon={<Copy size={14} />} 
        onClick={() => {
          navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          });
        }} 
        style={{ color: color, height: 22, padding: '0 8px' }}
      >
        {t('logs.copy', '复制')}
      </Button>
    </Tooltip>
  );
};

const ShadcnTabs = ({ value, onChange, options, isLight, themeToken }: any) => {
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: '8px',
      background: themeToken?.colorFillAlter || (isLight ? '#fafafa' : '#1d1d1d'),
      padding: '4px',
      height: '32px',
    }}>
      {options.map((opt: any) => {
        const isActive = value === opt.value;
        return (
          <div
            key={opt.value}
            onClick={() => onChange(opt.value)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              whiteSpace: 'nowrap',
              borderRadius: '6px',
              padding: '0 16px',
              height: '100%',
              fontSize: '14px',
              fontWeight: 500,
              transition: 'all 0.2s',
              cursor: 'pointer',
              background: isActive ? 'rgb(72, 72, 72)' : 'transparent',
              color: isActive ? '#fff' : (themeToken?.colorTextSecondary || (isLight ? '#71717a' : '#a1a1aa')),
              boxShadow: isActive ? '0 1px 2px 0 rgba(0, 0, 0, 0.05)' : 'none',
              gap: '6px'
            }}
          >
            {opt.icon}
            {opt.label}
          </div>
        );
      })}
    </div>
  );
};

const Logs: React.FC<{ routerEp?: string }> = ({ routerEp }) => {
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
  const [kidFilter, setKidFilter] = useState('');
  const [logIdFilter, setLogIdFilter] = useState('');
  const [userFilter, setUserFilter] = useState<string | undefined>(undefined);
  const [channelFilter, setChannelFilter] = useState<string | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [channelsList, setChannelsList] = useState<any[]>([]);
  const [allowDetails, setAllowDetails] = useState(true);
  const [dateRange, setDateRange] = useState<[any, any] | null>(null);
  const [exporting, setExporting] = useState(false);
  const [stats, setStats] = useState<{ total_cost: number; success_count: number; fail_count: number }>({ total_cost: 0, success_count: 0, fail_count: 0 });
  const { user } = useAuthStore();
  const screens = useBreakpoint();
  const [actionTypeFilter, setActionTypeFilter] = useState<string>('视觉');

  useEffect(() => {
    if (user?.role === 'admin') {
      request.get('/channels').then((res: any) => setChannelsList(res.data || [])).catch(console.error);
    } else {
      // 普通用户：从自己的日志中提取去重的渠道列表
      request.get('/logs', { params: { page: 1, per_page: 500 } }).then((res: any) => {
        const seen = new Map<string, string>();
        (res.data || []).forEach((log: any) => {
          if (log.channel_group_aid && !seen.has(log.channel_group_aid)) {
            seen.set(log.channel_group_aid, log.channel_name || '');
          }
        });
        const list = Array.from(seen.entries()).map(([aid, name]) => ({ group_aid: aid, name }));
        setChannelsList(list);
      }).catch(console.error);
    }
  }, [user]);

  const buildParams = useCallback(() => {
    const params: any = { model: modelFilter || undefined };
    if (routerEp) params.router_ep = routerEp;
    if (logIdFilter) params.log_id = logIdFilter;
    if (userFilter) params.user_id = userFilter;
    if (channelFilter) params.channel_group_aid = channelFilter;
    if (statusFilter) params.status = statusFilter;
    if (kidFilter) params.token_kid = kidFilter;
    if (dateRange?.[0]) params.start_date = dateRange[0].startOf('day').toISOString();
    if (dateRange?.[1]) params.end_date = dateRange[1].endOf('day').toISOString();
    if (actionTypeFilter && actionTypeFilter !== '全部') {
      params.action_type = actionTypeFilter;
    }
    return params;
  }, [modelFilter, logIdFilter, userFilter, channelFilter, statusFilter, dateRange, routerEp, actionTypeFilter, kidFilter]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = { ...buildParams(), page, per_page: pageSize };
      const resp = await (request.get('/logs', { params }) as unknown as Promise<{ data: RequestLog[]; total: number; allow_details?: boolean }>);
      setLogs(resp.data);
      setTotal(resp.total);
      if (resp.allow_details !== undefined) {
        setAllowDetails(resp.allow_details);
      }
      setStats({
        total_cost: (resp as any).total_cost || 0,
        success_count: (resp as any).success_count || 0,
        fail_count: (resp as any).fail_count || 0,
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, buildParams]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = buildParams();
      const resp = await request.get('/logs/export', {
        params,
        responseType: 'blob',
        skipErrorHandler: true,
      } as any) as any;
      // 如果返回的是 JSON 错误（blob mimetype 为 application/json），解析提示
      if (resp instanceof Blob && resp.type?.includes('json')) {
        const text = await resp.text();
        const json = JSON.parse(text);
        message.error(json.error || t('logs.export_fail', '导出失败'));
        return;
      }
      const blob = resp instanceof Blob ? resp : new Blob([resp], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `usage_logs_${dayjs().format('YYYYMMDDHHmmss')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      message.success(t('logs.export_success', '导出成功'));
    } catch (e: any) {
      // 尝试从 axios 错误响应中提取后端消息
      if (e?.response?.data) {
        try {
          const blob = e.response.data;
          const text = blob instanceof Blob ? await blob.text() : JSON.stringify(blob);
          const json = JSON.parse(text);
          message.error(json.error || t('logs.export_fail', '导出失败'));
        } catch { message.error(t('logs.export_fail', '导出失败')); }
      } else {
        message.error(t('logs.export_fail', '导出失败'));
      }
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const columns = ([
    {
      title: t('logs.time'),
      dataIndex: 'created_at',
      key: 'created_at',
      width: 170,
      render: (text: string, record: RequestLog) => (
        <Space direction="vertical" size={0}>
          <Text style={{ fontSize: 12 }}>{dayjs.utc(text).local().format('YYYY-MM-DD HH:mm:ss')}</Text>
          {record.log_id && (
            <Text 
              type="secondary" 
              style={{ fontSize: 10, fontFamily: 'monospace', maxWidth: 140 }} 
              ellipsis={{ tooltip: record.log_id }}
              copyable={{ text: record.log_id, tooltips: [t('logs.copy', '复制'), t('logs.copy_success', '已复制')] }}
            >
              {record.log_id}
            </Text>
          )}
        </Space>
      ),
    },
    user?.role === 'admin' ? {
      title: t('logs.channel_aid', '渠道AID'),
      dataIndex: 'channel_group_aid',
      key: 'channel_group_aid',
      width: 120,
      filters: channelsList.map((c: any) => ({ text: `${c.group_aid || c.id} ${c.name}`, value: c.group_aid || String(c.id) })),
      filterMultiple: false,
      filterSearch: true,
      filteredValue: channelFilter ? [channelFilter] : null,
      render: (text: string) => <Text type="secondary" style={{ fontSize: 12 }}>{text || '-'}</Text>,
    } : null,
    user?.role === 'admin' ? {
      title: t('logs.user', '用户'),
      key: 'user',
      width: 150,
      render: (_: any, record: RequestLog) => {
        const name = record.user_nickname || record.user_id?.slice(0, 8) || '-';
        return (
          <Space direction="vertical" size={0}>
            <Text style={{ fontSize: 12 }}>{name}</Text>
            {record.user_uid && <Text type="secondary" style={{ fontSize: 10, fontFamily: 'monospace' }}>UID: {record.user_uid}</Text>}
          </Space>
        );
      },
    } : null,
    {
      title: t('logs.token', '令牌'),
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
      width: 100,
      filters: [
        { text: t('logs.success', '成功'), value: 'success' },
        { text: t('logs.fail', '失败'), value: 'fail' },
      ],
      filterMultiple: false,
      filteredValue: statusFilter ? [statusFilter] : null,
      render: (code: number) => {
        if (code === 0) {
          return <Tag icon={<RefreshCw size={14} className="anticon-spin" style={{ marginRight: 4 }} />} color="processing">{t('logs.processing', '处理中')}</Tag>;
        }
        return <Tag color={code === 200 ? 'success' : 'error'}>{code || 400}</Tag>;
      },
    },
    {
      title: t('logs.model'),
      dataIndex: 'model',
      key: 'model',
      width: 180,
      ellipsis: true,
      render: (text: string, record: RequestLog) => {
        let pluginLabel: string | null = null;
        if (record.plugin_tag) {
          try { pluginLabel = JSON.parse(record.plugin_tag)?.title; } catch {}
        }
        return (
          <Space direction="vertical" size={0}>
            <Space size={4}>
              <Text style={{ fontSize: 12 }}>{text}</Text>
              {pluginLabel && <Tag color="purple" style={{ fontSize: 10, margin: 0, padding: '0 4px', lineHeight: '16px' }}>{pluginLabel}</Tag>}
            </Space>
            {user?.role === 'admin' && (record.billing_pid || record.forward_eid) && (
              <Space size={4}>
                {record.billing_pid && <Text type="secondary" style={{ fontSize: 10, fontFamily: 'monospace' }}>PID:{record.billing_pid}</Text>}
                {record.forward_eid && <Text type="secondary" style={{ fontSize: 10, fontFamily: 'monospace' }}>EID:{record.forward_eid}</Text>}
              </Space>
            )}
          </Space>
        );
      },
    },
    {
      title: t('logs.latency'),
      dataIndex: 'latency_ms',
      key: 'latency_ms',
      width: 80,
      render: (val: number) => <Text style={{ fontSize: 12 }}>{(val / 1000).toFixed(3)}s</Text>,
    },
    {
      title: t('logs.type', '类型'),
      dataIndex: 'is_stream',
      key: 'is_stream',
      width: 60,
      render: (stream: number) => <Text type="secondary" style={{ fontSize: 12 }}>{stream === 1 ? t('logs.stream', '流') : t('logs.non_stream', '非流')}</Text>,
    },
    {
      title: t('logs.usage'),
      key: 'usage',
      width: 100,
      render: (_: any, record: RequestLog) => {
        // 从 billing_detail 中提取 Claude 缓存创建/读取数量
        const ccMatch = record.billing_detail?.match(/(\d+)创建@/);
        const crMatch = record.billing_detail?.match(/(\d+)读取@/);
        const cacheCreation = ccMatch ? parseInt(ccMatch[1]) : 0;
        const cacheRead = crMatch ? parseInt(crMatch[1]) : 0;
        const isClaude = cacheCreation > 0 || cacheRead > 0;
        return (
          <Space direction="vertical" size={0}>
            <Text type="secondary" style={{ fontSize: 11 }}>{t('logs.input', '输入')}: {record.prompt_tokens}</Text>
            <Text type="secondary" style={{ fontSize: 11 }}>{t('logs.output', '输出')}: {record.completion_tokens}</Text>
            {isClaude ? (
              <>
                {cacheCreation > 0 && <Text type="secondary" style={{ fontSize: 11, color: '#faad14' }}>{t('logs.cache_creation', '缓存创建')}: {cacheCreation}</Text>}
                {cacheRead > 0 && <Text type="secondary" style={{ fontSize: 11, color: '#52c41a' }}>{t('logs.cache_read', '缓存读取')}: {cacheRead}</Text>}
              </>
            ) : (
              (record.cached_tokens ?? 0) > 0 && <Text type="secondary" style={{ fontSize: 11, color: '#52c41a' }}>{t('logs.cache_input', '缓存(输入内)')}: {record.cached_tokens}</Text>
            )}
          </Space>
        );
      },
    },
    {
      title: t('logs.cost'),
      dataIndex: 'cost',
      key: 'cost',
      width: 90,
      render: (val: number, record: RequestLog) => (
        <Space direction="vertical" size={0}>
          {val === 0 || record.billing_detail?.includes('退回') || record.billing_detail?.includes('失败')
            ? <Text type="secondary" style={{ fontSize: 12 }}>-</Text>
            : <Text strong style={{ fontSize: 12, color: themeToken.colorError }}>{currencySymbol}{val.toFixed(4)}</Text>
          }
          {record.billing_detail?.includes('退回') && (
            <Tag color="orange" style={{ margin: 0, fontSize: 10, lineHeight: '14px', padding: '0 4px' }}>{t('logs.refunded', '已退费')}</Tag>
          )}
        </Space>
      ),
    },
  ].map((c: any) => c ? { ...c, align: 'center' } : null).filter(Boolean)) as any[];

  const expandedRowRender = (record: RequestLog) => {
    let reqJson = record.request_content;
    let respJson = record.response_content;
    let postRespJson = record.post_response;
    let upstreamReqJson = record.upstream_req_content;
    try {
      if (reqJson) reqJson = JSON.stringify(JSON.parse(reqJson), null, 2);
    } catch (e) { /* keep raw */ }
    try {
      if (respJson) respJson = JSON.stringify(JSON.parse(respJson), null, 2);
    } catch (e) { /* keep raw */ }
    try {
      if (postRespJson) postRespJson = JSON.stringify(JSON.parse(postRespJson), null, 2);
    } catch (e) { /* keep raw */ }
    try {
      if (upstreamReqJson) upstreamReqJson = JSON.stringify(JSON.parse(upstreamReqJson), null, 2);
    } catch (e) { /* keep raw */ }

    const costFormula = t('logs.cost_formula_dynamic', '由绑定的计费模板动态结算');

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
          <Descriptions.Item label={t('logs.system_endpoint', '系统请求路径')}>
            {record.endpoint.startsWith('http') ? record.endpoint : `${window.location.origin}${record.endpoint.startsWith('/') ? '' : '/'}${record.endpoint}`}
          </Descriptions.Item>
          {record.upstream_url && (
            <Descriptions.Item label={t('logs.upstream_url', '真实上游地址')}>
              {record.upstream_url}
            </Descriptions.Item>
          )}
          {user?.role === 'admin' && (
            <Descriptions.Item label={t('logs.channel_aid', '渠道标识')}>{record.channel_group_aid || '-'}</Descriptions.Item>
          )}
          <Descriptions.Item label={t('logs.error_msg', '错误信息')}>
            {(() => {
              if (!record.error_message) {
                if (record.billing_detail?.includes('退回') || record.billing_detail?.includes('失败')) {
                  return <Text type="danger">{t('logs.see_response', '查看下方的响应结果')}</Text>;
                }
                return <Text type="secondary">{t('logs.none', '无')}</Text>;
              }
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
          <Descriptions.Item label={t('logs.match_rule', '匹配规则')}>
            <Space size={16} wrap>
              {user?.role === 'admin' && (
                <>
                  <Text type="secondary" style={{ fontSize: 12 }}>{t('logs.billing_rule', '计费规则 (PID)')}: {record.billing_pid ? <Typography.Text keyboard>{record.billing_pid}</Typography.Text> : '-'}</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>{t('logs.forward_rule', '转发规则 (EID)')}: {record.forward_eid ? <Typography.Text keyboard>{record.forward_eid}</Typography.Text> : '-'}</Text>
                </>
              )}
              {record.plugin_tag && (() => {
                try {
                  const tag = JSON.parse(record.plugin_tag);
                  return (
                    <Tag color="purple" style={{ fontSize: 11 }}>
                      {tag.title || tag.name}: {tag.custom_model} → {tag.actual_model} ({tag.media_type})
                    </Tag>
                  );
                } catch { return null; }
              })()}
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label={t('logs.billing_detail', '计费明细')}>
            <div>
              {record.billing_detail ? (
                <Text type="secondary" style={{ fontSize: 12 }}>{t('logs.calc_basis', '计算依据')}: {record.billing_detail}</Text>
              ) : (
                <Text type="secondary" style={{ fontSize: 12 }}>{costFormula}</Text>
              )}
              <br />
              <Text strong style={{ fontSize: 13, textDecoration: record.billing_detail?.includes('退回') ? 'line-through' : 'none' }}>
                {record.billing_detail?.includes('退回') ? t('logs.pre_deduct', '预扣费') : t('logs.actual_deduct', '实际扣费')}: {currencySymbol}{record.cost.toFixed(6)}
              </Text>
              {record.billing_detail?.includes('退回') && <Text type="danger" style={{ fontSize: 13, marginLeft: 8 }}>{t('logs.fully_refunded', '已全额退回')}</Text>}
              <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>{t('logs.cost_priority', '（优先扣令牌配额，不足扣用户余额）')}</Text>
            </div>
          </Descriptions.Item>
        </Descriptions>

        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col span={24} style={{ maxWidth: '100%', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text strong style={{ fontSize: 13 }}>{t('logs.req_params', '请求参数（入参）')}</Text>
              {reqJson && <CopyButton text={reqJson} color={themeToken.colorTextSecondary} />}
            </div>
            <div style={{
              marginTop: 8, maxHeight: 300, overflow: 'auto',
              background: codeBg, border: `1px solid ${codeBorder}`,
              padding: 12, borderRadius: 6,
            }}>
              <pre style={{ margin: 0, fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {reqJson || t('logs.no_context', '该模型未开启「记录上下文」或内容为空')}
              </pre>
            </div>
          </Col>
          <Col span={24} style={{ maxWidth: '100%', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text strong style={{ fontSize: 13 }}>{t('logs.upstream_req_params', '真实转发给上游的请求参数（出参）')}</Text>
              {upstreamReqJson && <CopyButton text={upstreamReqJson} color={themeToken.colorTextSecondary} />}
            </div>
            <div style={{
              marginTop: 8, maxHeight: 300, overflow: 'auto',
              background: codeBg, border: `1px solid ${codeBorder}`,
              padding: 12, borderRadius: 6,
            }}>
              <pre style={{ margin: 0, fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {upstreamReqJson || t('logs.same_as_req', '同【请求参数】或未记录。')}
              </pre>
            </div>
          </Col>
          <Col span={24} style={{ maxWidth: '100%', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text strong style={{ fontSize: 13 }}>{t('logs.resp_content', '响应结果')}</Text>
              {respJson && <CopyButton text={respJson} color={themeToken.colorTextSecondary} />}
            </div>
            <div style={{
              marginTop: 8, maxHeight: 300, overflow: 'auto',
              background: codeBg, border: `1px solid ${codeBorder}`,
              padding: 12, borderRadius: 6,
            }}>
              <pre style={{ margin: 0, fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {respJson || t('logs.no_context', '该模型未开启「记录上下文」或内容为空')}
              </pre>
            </div>
          </Col>
          {postRespJson && (
            <Col span={24} style={{ maxWidth: '100%', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text strong style={{ fontSize: 13 }}>{t('logs.post_resp_content', 'POST 提交响应结果')}</Text>
                <CopyButton text={postRespJson} color={themeToken.colorTextSecondary} />
              </div>
              <div style={{
                marginTop: 8, maxHeight: 300, overflow: 'auto',
                background: codeBg, border: `1px solid ${codeBorder}`,
                padding: 12, borderRadius: 6,
              }}>
                <pre style={{ margin: 0, fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {postRespJson}
                </pre>
              </div>
            </Col>
          )}
        </Row>
      </div>
    );
  };

  return (
    <Card 
      variant="borderless" 
      style={{ 
        background: screens.xs ? 'transparent' : (_isLight ? '#fff' : 'rgba(255,255,255,0.02)'), 
        borderRadius: 12,
        boxShadow: screens.xs ? 'none' : undefined
      }} 
      styles={{ body: { padding: screens.xs ? 0 : '16px 24px 24px' } }}
    >
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <Typography.Title level={4} style={{ margin: 0, fontSize: 18, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <RefreshCw size={20} />
              {t('menu.usage_logs', '使用日志')}
            </Typography.Title>
            <ShadcnTabs 
              value={actionTypeFilter}
              isLight={_isLight}
              themeToken={themeToken}
              onChange={(v: string) => {
                setActionTypeFilter(v);
                setPage(1);
              }}
              options={[
                { value: '视觉', label: t('logs.type_vision', '视觉'), icon: <ImageIcon size={14} /> },
                { value: '聊天', label: t('logs.type_chat', '聊天'), icon: <MessageSquare size={14} /> },
                { value: '音频', label: t('logs.type_audio', '音频'), icon: <Mic size={14} /> },
                { value: '向量', label: t('logs.type_embedding', '向量'), icon: <Cuboid size={14} /> },
                { value: '排序', label: t('logs.type_rerank', '排序'), icon: <ListOrdered size={14} /> },
                { value: '其它', label: t('logs.type_other', '其它'), icon: <Wrench size={14} /> },
                { value: '全部', label: t('logs.type_all', '全部'), icon: <LayoutGrid size={14} /> },
              ]}
            />
          </div>
        </div>
        {total > 0 && (
          <div style={{ marginTop: 8 }}>
            <Space size={12} wrap split={<span style={{ color: themeToken.colorBorder }}>|</span>}>
              <Text type="secondary" style={{ fontSize: 12 }}>请求 <strong style={{ color: themeToken.colorText }}>{total}</strong></Text>
              <Text type="secondary" style={{ fontSize: 12 }}>成功 <strong style={{ color: themeToken.colorText }}>{stats.success_count}</strong></Text>
              <Text type="secondary" style={{ fontSize: 12 }}>失败 <strong style={{ color: themeToken.colorText }}>{stats.fail_count}</strong></Text>
              <Text type="secondary" style={{ fontSize: 12 }}>成功率 <strong style={{ color: themeToken.colorText }}>{total > 0 ? ((stats.success_count / total) * 100).toFixed(1) : '0.0'}%</strong></Text>
              <Text type="secondary" style={{ fontSize: 12 }}>成本合计 <strong style={{ color: themeToken.colorText }}>{currencySymbol}{stats.total_cost.toFixed(4)}</strong></Text>
            </Space>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          {user?.role === 'admin' && (
            <Input
              placeholder={t('logs.search_user_id', '搜索用户 UID/用户名')}
              prefix={<Search size={16} />}
              value={userFilter || ''}
              onChange={e => setUserFilter(e.target.value || undefined)}
              onPressEnter={fetchLogs}
              style={{ width: screens.xs ? '100%' : 180 }}
              allowClear
            />
          )}
          <Input
            placeholder={t('logs.search_log_id', '搜索日志ID')}
            prefix={<Search size={16} />}
            value={logIdFilter}
            onChange={e => setLogIdFilter(e.target.value)}
            onPressEnter={fetchLogs}
            style={{ width: screens.xs ? '100%' : 200 }}
          />
          <Input
            placeholder={t('logs.search_model')}
            prefix={<Search size={16} />}
            value={modelFilter}
            onChange={e => setModelFilter(e.target.value)}
            onPressEnter={fetchLogs}
            style={{ width: screens.xs ? '100%' : 140 }}
          />
          <Input
            placeholder={t('logs.search_kid', '搜索 KID')}
            prefix={<Search size={16} />}
            value={kidFilter}
            onChange={e => setKidFilter(e.target.value)}
            onPressEnter={fetchLogs}
            style={{ width: screens.xs ? '100%' : 140 }}
          />
          <RangePicker
            value={dateRange}
            onChange={(vals) => setDateRange(vals as [any, any] | null)}
            style={{ width: screens.xs ? '100%' : undefined }}
          />
          <Space size={8} style={{ marginLeft: screens.xs ? 0 : 'auto' }}>
            <Button icon={<RefreshCw size={14} />} onClick={fetchLogs} style={{ borderRadius: 6 }}>{t('common.refresh')}</Button>
            {user?.role === 'admin' && (
              <Tooltip title={t('logs.export_tooltip', '根据当前筛选条件导出 CSV（上限10万条）')}>
                <Button icon={<Download size={14} />} loading={exporting} onClick={handleExport} style={{ borderRadius: 6 }}>{t('logs.export', '导出')}</Button>
              </Tooltip>
            )}
          </Space>
        </div>

      {screens.xs ? (
        <MobileCardList
          dataSource={logs}
          loading={loading}
          rowKey="id"
          compact={true}
          gap={4}
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
                compact={true}
                style={{ background: _isLight ? '#fff' : '#141414', border: 'none' }}
                title={<Tag color="blue">{record.model}</Tag>}
                extra={record.status_code === 0
                  ? <Tag icon={<RefreshCw size={14} className="anticon-spin" style={{ marginRight: 4 }} />} color="processing">{t('logs.processing', '处理中')}</Tag>
                  : <Tag color={record.status_code === 200 ? 'success' : 'error'}>{record.status_code || 400}</Tag>
                }
              >
                <CardRow label={t('logs.time', '时间')}>
                  <Space direction="vertical" size={0} align="end">
                    <Text type="secondary" style={{ fontSize: 12 }}>{dayjs.utc(record.created_at).local().format('YYYY-MM-DD HH:mm:ss')}</Text>
                    {record.log_id && (
                      <Text 
                        type="secondary" 
                        style={{ fontSize: 10, fontFamily: 'monospace', maxWidth: '45vw' }} 
                        ellipsis={{ tooltip: record.log_id }}
                        copyable={{ text: record.log_id }}
                      >
                        {record.log_id}
                      </Text>
                    )}
                  </Space>
                </CardRow>
                {user?.role === 'admin' && (
                  <CardRow label={t('logs.user', '用户')}>
                    <Space direction="vertical" size={0}>
                      <Text style={{ fontSize: 12 }}>{userName}</Text>
                      {record.user_uid && <Text type="secondary" style={{ fontSize: 10, fontFamily: 'monospace' }}>UID: {record.user_uid}</Text>}
                    </Space>
                  </CardRow>
                )}
                {user?.role === 'admin' && record.channel_group_aid && <CardRow label={t('logs.channel_aid', '渠道AID')}><Text type="secondary" style={{ fontSize: 12 }}>{record.channel_group_aid}</Text></CardRow>}
                {user?.role === 'admin' && (record.billing_pid || record.forward_eid) && (
                  <CardRow label={t('logs.match_rule', '匹配规则')}>
                    <Space size={8}>
                      {record.billing_pid && <Text type="secondary" style={{ fontSize: 11 }}>PID:<Typography.Text keyboard style={{ fontSize: 10 }}>{record.billing_pid}</Typography.Text></Text>}
                      {record.forward_eid && <Text type="secondary" style={{ fontSize: 11 }}>EID:<Typography.Text keyboard style={{ fontSize: 10 }}>{record.forward_eid}</Typography.Text></Text>}
                    </Space>
                  </CardRow>
                )}
                <CardRow label={t('logs.token', '令牌')}>
                  <Space size={6} align="center" style={{ justifyContent: 'flex-end', width: '100%' }}>
                    <Tag color="cyan" style={{ fontSize: 11, margin: 0 }}>{record.token_name || '-'}</Tag>
                    {record.token_kid && <Text type="secondary" style={{ fontSize: 10, fontFamily: 'monospace' }}>KID: {record.token_kid}</Text>}
                  </Space>
                </CardRow>
                <CardRow label={t('logs.latency', '耗时')}><Text style={{ fontSize: 12 }}>{(record.latency_ms / 1000).toFixed(3)}s</Text></CardRow>
                <CardRow label={t('logs.type', '类型')}><Tag color={record.is_stream === 1 ? 'geekblue' : 'default'}>{record.is_stream === 1 ? t('logs.stream', '流') : t('logs.non_stream', '非流')}</Tag></CardRow>
                <CardRow label={t('logs.usage', '用量')}>
                  <Space direction="vertical" size={0} align="end">
                    <Text type="secondary" style={{ fontSize: 12 }}>输入:{record.prompt_tokens} / 输出:{record.completion_tokens}</Text>
                    {(() => {
                      const ccM = record.billing_detail?.match(/(\d+)创建@/);
                      const crM = record.billing_detail?.match(/(\d+)读取@/);
                      const cc = ccM ? parseInt(ccM[1]) : 0;
                      const cr = crM ? parseInt(crM[1]) : 0;
                      if (cc > 0 || cr > 0) {
                        return (
                          <>
                            {cc > 0 && <Text type="secondary" style={{ fontSize: 11, color: '#faad14' }}>缓存创建:{cc}</Text>}
                            {cr > 0 && <Text type="secondary" style={{ fontSize: 11, color: '#52c41a' }}>缓存读取:{cr}</Text>}
                          </>
                        );
                      }
                      return (record.cached_tokens ?? 0) > 0 ? <Text type="secondary" style={{ fontSize: 11, color: '#52c41a' }}>缓存(输入内):{record.cached_tokens}</Text> : null;
                    })()}
                  </Space>
                </CardRow>
                <CardRow label={t('logs.cost', '成本')}>
                  <Space direction="vertical" size={0} align="end">
                    {record.cost === 0 || record.billing_detail?.includes('退回') || record.billing_detail?.includes('失败')
                      ? <Text type="secondary" style={{ fontSize: 12 }}>-</Text>
                      : <Text strong style={{ fontSize: 12, color: themeToken.colorError }}>{currencySymbol}{record.cost.toFixed(4)}</Text>
                    }
                    {record.billing_detail?.includes('退回') && (
                      <Tag color="orange" style={{ margin: 0, fontSize: 10, lineHeight: '14px', padding: '0 4px' }}>{t('logs.refunded', '已退费')}</Tag>
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
            allowDetails ? {
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
          onChange={(pagination, filters: any) => {
            let shouldResetPage = false;
            
            const chFilter = filters.channel_group_aid ? filters.channel_group_aid[0] as string : undefined;
            if (chFilter !== channelFilter) {
              setChannelFilter(chFilter);
              shouldResetPage = true;
            }
            
            const stFilter = filters.status_code ? filters.status_code[0] as string : undefined;
            if (stFilter !== statusFilter) {
              setStatusFilter(stFilter);
              shouldResetPage = true;
            }

            if (shouldResetPage) {
              setPage(1);
            }
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
