import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Table, Tag, Button, Space, Typography, DatePicker, Input, Select, Row, Col, Form, message, Grid, Descriptions, Card, Tooltip, theme, Radio, Popconfirm, Modal, Image, Carousel, Spin } from 'antd';
import MobileCardList, { MobileCard, CardRow } from '../../components/MobileCardList';
import { RefreshCw, Search, Download, Image as ImageIcon, MessageSquare, Video, Wrench, LayoutGrid, CheckCircle2, XCircle, Cuboid, ListOrdered, Mic, MoreHorizontal } from 'lucide-react';
import request from '../../utils/request';
import { QueryGuard, isRequestAborted } from '../../utils/queryGuard';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { formatApiDateTime } from '../../utils/timedisplay';
import { toDateRangeParams } from '../../utils/dateRangeParams';
import { useLogDetailLoader } from '../../hooks/useLogDetailLoader';
dayjs.extend(utc);
import { useTranslation } from 'react-i18next';
import useAuthStore from '../../store/auth';
import { useThemeStore } from '../../store/theme';

const { RangePicker } = DatePicker;
const { Text } = Typography;
const { useBreakpoint } = Grid;

interface TaskLog {
  id: number;
  log_id?: string;
  user_id: string;
  user_uid?: string;
  channel_id: number | null;
  model: string;
  endpoint: string;
  prompt_tokens: number;
  completion_tokens: number;
  cached_tokens: number;
  cost: number;
  latency_ms: number;
  status_code: number;
  error_message: string | null;
  request_content: string | null;
  response_content: string | null;
  post_response?: string | null;
  billing_detail?: string | null;
  billing_failed?: boolean;
  billing_frozen?: boolean;
  billing_present?: boolean;
  channel_name: string | null;
  channel_group_aid: string | null;
  channel_provider_type?: string | null;
  user_nickname: string | null;
  task_id: string | null;
  action_type: string | null;
  yid?: string | null;
  billing_pid?: string | null;
  forward_eid?: string | null;
  created_at: string;
}

// ── 工具函数：从记录中获取任务类型（直接读取后端返回的 action_type） ──────────────────────────
const getTaskType = (r: TaskLog) => {
  // eslint-disable-next-line
  const t = (key: string, def: string) => def; // A quick polyfill if t is not available in top level. But wait, it's better to translate in component. Let's fix this in another chunk.
  if (r.action_type === '聊天') return { label: '聊天', color: 'blue', icon: <MessageSquare size={14} /> };
  if (r.action_type === '图片') return { label: '图片', color: 'purple', icon: <ImageIcon size={14} /> };
  if (r.action_type === '视频') return { label: '视频', color: 'orange', icon: <Video size={14} /> };
  if (r.action_type === '视频增强') return { label: '视频增强', color: 'volcano', icon: <Video size={14} /> };
  if (r.action_type === '音频') return { label: '音频', color: 'green', icon: <Mic size={14} /> };
  if (r.action_type === '向量') return { label: '向量', color: 'cyan', icon: <Cuboid size={14} /> };
  if (r.action_type === '排序') return { label: '排序', color: 'geekblue', icon: <ListOrdered size={14} /> };
  return { label: r.action_type || '其它', color: 'default', icon: <Wrench size={14} /> };
};

// ── 工具函数：判断是否异步任务（后端 task_id 非空即为异步） ─────────────────
const isAsyncPost = (r: TaskLog) => !!r.task_id;

// ── 工具函数：获取异步任务终态 ─────────────────────────
const getAsyncFinalStatus = (r: TaskLog): 'pending' | 'succeeded' | 'failed' => {
  if (!isAsyncPost(r)) return 'succeeded';
  
  // 1. 优先从最新的响应结果中解析状态
  if (r.response_content) {
    try {
      const v = JSON.parse(r.response_content);
      const status = v.status || v.data?.status || v.data?.task_status
        || v.final_result?.status || v.output?.status || v.output?.task_status;
      if (status === 'succeeded' || status === 'succeed' || status === 'SUCCESS' || status === 'completed') return 'succeeded';
      if (status === 'failed' || status === 'FAILED') return 'failed';
    } catch { /* ignore */ }
  }

  // 2. 列表标记优先；billing_detail 仅兼容旧缓存/展开合并
  if (r.billing_failed) return 'failed';
  if (r.billing_present && !r.billing_frozen) return 'succeeded';
  if (r.billing_detail) {
    if (r.billing_detail.includes('失败')) return 'failed';
    if (!r.billing_detail.includes('冻结')) return 'succeeded';
  }

  return 'pending';
};



// ── 工具函数：获取任务 ID ──────────────────
const getTaskId = (record: TaskLog): string => record.task_id || '-';

// ── 工具函数：格式化 JSON 用于展示 ─────────────────────────────
const fmtJson = (raw: string | null): string => {
  if (!raw) return '-';
  try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { return raw; }
};

// ── 工具函数：提取文本/JSON中的链接 ─────────────────────────────
const extractUrls = (content: string | null): string[] => {
  if (!content) return [];
  try {
    const parsed = JSON.parse(content);
    const root = (parsed && typeof parsed === 'object' && parsed.stage1 != null && parsed.stage2 != null)
      ? parsed.stage2
      : parsed;
    const urls: string[] = [];
    const searchUrl = (obj: any) => {
      if (typeof obj === 'string') {
        if (obj.startsWith('http://') || obj.startsWith('https://')) {
          urls.push(obj);
        }
      } else if (Array.isArray(obj)) {
        obj.forEach(searchUrl);
      } else if (obj !== null && typeof obj === 'object') {
        Object.values(obj).forEach(searchUrl);
      }
    };
    searchUrl(root);
    return Array.from(new Set(urls));
  } catch {
    // 降级使用正则匹配
    const regex = /https?:\/\/[^"'\s\\]+/g;
    const matches = content.match(regex);
    if (!matches) return [];
    return Array.from(new Set(matches.map(u => u.replace(/\\/g, ''))));
  }
};

const CustomMedia = ({ src, type }: { src: string; type: '图片' | '视频' }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  return (
    <div style={{ position: 'relative', minHeight: 150, minWidth: 200, display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.05)', borderRadius: 8, padding: 8, maxWidth: '100%' }}>
      {loading && !error && <Spin style={{ position: 'absolute' }} tip={`正在加载${type}...`} />}
      {error ? (
        <div style={{ textAlign: 'center', color: '#ff4d4f', padding: 16 }}>
          <div style={{ marginBottom: 8 }}>{type}加载失败，链接可能已失效或无法直接访问：</div>
          <a href={src} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all', fontSize: 12 }}>{src}</a>
        </div>
      ) : (
        type === '图片' ? (
          <Image 
            src={src} 
            style={{ maxWidth: '100%', maxHeight: '600px', objectFit: 'contain', opacity: loading ? 0 : 1, transition: 'opacity 0.3s' }}
            onLoad={() => setLoading(false)}
            onError={() => { setLoading(false); setError(true); }}
          />
        ) : (
          <video 
            src={src} 
            controls 
            style={{ maxWidth: '100%', maxHeight: '600px', opacity: loading ? 0 : 1, transition: 'opacity 0.3s' }}
            onLoadedData={() => setLoading(false)}
            onError={() => { setLoading(false); setError(true); }}
          />
        )
      )}
    </div>
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

const TaskLogs: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';
  const { themeMode } = useThemeStore();
  const { token: themeToken } = theme.useToken();
  const isLight = themeMode === 'light';
  const panelBg = isLight ? '#fafafa' : '#141414';
  const labelBg = isLight ? '#f5f5f5' : '#1a1a1a';
  const labelColor = isLight ? '#6b7280' : '#8c8c8c';
  const contentBg = isLight ? '#fff' : '#141414';
  const timeBadgeBg = isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)';
  const [data, setData] = useState<TaskLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [allowDetails, setAllowDetails] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [form] = Form.useForm();
  const screens = useBreakpoint();
  const [actionTypeFilter, setActionTypeFilter] = useState<string>(localStorage.getItem('default_log_type') || '视觉');
  const [subTypeFilter, setSubTypeFilter] = useState<string | null>(null);
  const [isSettingsModalVisible, setIsSettingsModalVisible] = useState(false);
  const [tempDefaultType, setTempDefaultType] = useState<string>('视觉');
  const queryGuardRef = useRef(new QueryGuard());
  const skipNextEffectFetchRef = useRef(false);
  const rowIds = useMemo(() => data.map((l) => l.id), [data]);
  const {
    detailCache,
    detailLoadingIds,
    expandedRowKeys,
    loadLogDetail,
    handleExpand,
    resetDetailCache,
  } = useLogDetailLoader(rowIds);

  useEffect(() => {
    const guard = queryGuardRef.current;
    return () => guard.dispose();
  }, []);

  useEffect(() => {
    if (isSettingsModalVisible) {
      setTempDefaultType(localStorage.getItem('default_log_type') || '视觉');
    }
  }, [isSettingsModalVisible]);

  // 预览相关状态
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [previewType, setPreviewType] = useState<'图片' | '视频'>('图片');


  const handlePreview = async (record: TaskLog) => {
    let content = detailCache[record.id]?.response_content ?? record.response_content;
    if (!content) {
      const detail = await loadLogDetail(record.id);
      content = detail?.response_content ?? null;
    }
    const urls = extractUrls(content);
    if (urls.length === 0) {
      message.warning(t('task_logs.no_media', '未找到可预览的媒体链接'));
      return;
    }
    setPreviewUrls(urls);
    setPreviewType(record.action_type === '图片' ? '图片' : '视频');
    setPreviewOpen(true);
  };

  const fetchLogs = useCallback(async (current = 1, size = 20) => {
    const signal = queryGuardRef.current.begin();
    setLoading(true);
    try {
      const v = form.getFieldsValue();
      const params: any = { page: current, per_page: size };
      if (subTypeFilter) {
        if (subTypeFilter === '图片') params.action_type = 'image';
        else if (subTypeFilter === '视频') params.action_type = 'video';
        else if (subTypeFilter === '聊天') params.action_type = 'chat';
        else if (subTypeFilter === '其它') params.action_type = 'other';
        else params.action_type = subTypeFilter;
      } else if (actionTypeFilter && actionTypeFilter !== '全部') {
        if (actionTypeFilter === '视觉') params.action_type = 'vision';
        else if (actionTypeFilter === '聊天') params.action_type = 'chat';
        else if (actionTypeFilter === '其它') params.action_type = 'other';
        else params.action_type = actionTypeFilter;
      }
      if (v.model && v.model.trim()) params.model = v.model.trim();
      if (v.search_keyword && v.search_keyword.trim()) params.search_keyword = v.search_keyword.trim();
      if (v.user_id && v.user_id.trim()) params.user_id = v.user_id.trim();
      Object.assign(params, toDateRangeParams(v.dateRange));

      const res = await (request.get('/task_logs', { params, signal }) as any);
      if (!queryGuardRef.current.isCurrent(signal)) return;
      setData(res.data);
      setTotal(res.total);
      resetDetailCache();
      if (res.allow_details !== undefined) {
        setAllowDetails(res.allow_details);
      }
      if (current !== page || size !== pageSize) {
        skipNextEffectFetchRef.current = true;
      }
      setPage(current);
      setPageSize(size);
    } catch (e) {
      if (isRequestAborted(e)) return;
      console.error(e);
      message.error(t('task_logs.fetch_fail', '获取任务日志失败'));
    } finally {
      if (queryGuardRef.current.isCurrent(signal)) {
        setLoading(false);
      }
    }
  }, [form, actionTypeFilter, subTypeFilter, t, page, pageSize, resetDetailCache]);


  const handleSyncTask = async (log_id: string) => {
    try {
      const res = await (request.post(`/task_logs/${log_id}/sync`) as any);
      message.success(res.message || t('task_logs.sync_success', '任务状态已同步'));
      fetchLogs(page, pageSize);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCancelTask = async (log_id: string) => {
    try {
      const res = await (request.post(`/task_logs/${log_id}/cancel`) as any);
      message.success(res.message || t('task_logs.cancel_success', '任务已取消'));
      fetchLogs(page, pageSize);
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    if (skipNextEffectFetchRef.current) {
      skipNextEffectFetchRef.current = false;
      return;
    }
    fetchLogs(page, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, actionTypeFilter, subTypeFilter]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const v = form.getFieldsValue();
      const params: any = {};
      if (v.action_type) params.action_type = v.action_type;
      if (v.model && v.model.trim()) params.model = v.model.trim();
      if (v.search_keyword && v.search_keyword.trim()) params.search_keyword = v.search_keyword.trim();
      if (v.user_id && v.user_id.trim()) params.user_id = v.user_id.trim();
      Object.assign(params, toDateRangeParams(v.dateRange));
      const resp = await request.get('/task_logs/export', {
        params,
        responseType: 'blob',
        skipErrorHandler: true,
      } as any) as any;
      if (resp instanceof Blob && resp.type?.includes('json')) {
        const text = await resp.text();
        const json = JSON.parse(text);
        message.error(json.error || t('task_logs.export_fail', '导出失败'));
        return;
      }
      const blob = resp instanceof Blob ? resp : new Blob([resp], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `task_logs_${dayjs().format('YYYYMMDDHHmmss')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      message.success(t('task_logs.export_success', '导出成功'));
    } catch (e: any) {
      if (e?.response?.data) {
        try {
          const blob = e.response.data;
          const text = blob instanceof Blob ? await blob.text() : JSON.stringify(blob);
          const json = JSON.parse(text);
          message.error(json.error || t('task_logs.export_fail', '导出失败'));
        } catch { message.error(t('task_logs.export_fail', '导出失败')); }
      } else {
        message.error(t('task_logs.export_fail', '导出失败'));
      }
    } finally {
      setExporting(false);
    }
  };

  // ── 展开行：详细信息 ─────────────────────────────────────────
  const expandedRowRender = (record: TaskLog) => {
    const merged = { ...record, ...detailCache[record.id] };
    const loadingDetail = !!detailLoadingIds[record.id] && !detailCache[record.id];
    if (loadingDetail) {
      return (
        <div style={{ padding: 24, textAlign: 'center' }}>
          <Spin tip={t('logs.loading_detail', '加载详情中...')} />
        </div>
      );
    }
    return (
      <div style={{ padding: '8px 0' }}>
        <Descriptions size="small" column={1} bordered
          labelStyle={{ width: 120, color: labelColor, background: labelBg }}
          contentStyle={{ background: contentBg, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontFamily: 'monospace', fontSize: 12, maxHeight: 300, overflow: 'auto' }}
        >
          <Descriptions.Item label={t('task_logs.token_usage', 'Token 用量')}>
            {t('logs.input', '输入')} {record.prompt_tokens} / {t('logs.output', '输出')} {record.completion_tokens}{(record.cached_tokens ?? 0) > 0 ? ` / ${t('logs.cache_input', '缓存(输入内)')} ${record.cached_tokens}` : ''}
          </Descriptions.Item>
          <Descriptions.Item label={t('task_logs.cost', '费用')}>
            {record.cost > 0 ? record.cost.toFixed(6) : '0'}
          </Descriptions.Item>
          {merged.billing_detail && (
            <Descriptions.Item label={t('logs.billing_detail', '计费明细')}>{fmtJson(merged.billing_detail)}</Descriptions.Item>
          )}
          {merged.request_content && (
            <Descriptions.Item label={t('logs.req_params', '请求参数')}>{fmtJson(merged.request_content)}</Descriptions.Item>
          )}
          {merged.response_content && (
            <Descriptions.Item label={t('logs.resp_content', '响应内容')}>{fmtJson(merged.response_content)}</Descriptions.Item>
          )}
          {merged.post_response && (
            <Descriptions.Item label={t('logs.post_resp_content', 'POST 提交响应')}>{fmtJson(merged.post_response)}</Descriptions.Item>
          )}
          {!merged.request_content && !merged.response_content && !merged.post_response && (
            <Descriptions.Item label={t('logs.detail', '详情')}>
              <Text type="secondary">{t('logs.no_context', '该模型未开启「记录上下文」或内容为空')}</Text>
            </Descriptions.Item>
          )}
        </Descriptions>
      </div>
    );
  };

  // ── 表格列定义 ───────────────────────────────────────────────
  const columns: any[] = [
    {
      title: t('task_logs.submit_time', '提交时间'),
      dataIndex: 'created_at',
      key: 'submit_time',
      width: 170,
      render: (v: string, r: TaskLog) => {
        return (
          <Space direction="vertical" size={0}>
            <Text style={{ fontSize: 13 }}>{formatApiDateTime(v)}</Text>
            {r.log_id && (
              <Text 
                type="secondary" 
                style={{ fontSize: 10, fontFamily: 'monospace', maxWidth: 140 }} 
                ellipsis={{ tooltip: r.log_id }}
                copyable={{ text: r.log_id, tooltips: [t('logs.copy', '复制'), t('logs.copy_success', '已复制')] }}
              >
                {r.log_id}
              </Text>
            )}
          </Space>
        );
      },
    },
    {
      title: t('task_logs.time_spent', '花费时间'),
      key: 'time_spent',
      width: 100,
      render: (_: any, r: TaskLog) => {
        const status = getAsyncFinalStatus(r);
        if (isAsyncPost(r) && status === 'pending') {
          return <Tag color="processing">{t('task_logs.processing', '处理中...')}</Tag>;
        }
        // 统一使用 latency_ms（后端在异步任务结算时已精确更新为 CURRENT_TIMESTAMP - created_at）
        const sec = r.latency_ms / 1000;
        const display = sec >= 60 ? `${(sec / 60).toFixed(1)}m` : `${sec.toFixed(1)}s`;
        return (
          <Text type="secondary" style={{ background: timeBadgeBg, padding: '2px 8px', borderRadius: 4 }}>
            🕗 {display}
          </Text>
        );
      },
    },
    isAdmin ? {
      title: t('logs.channel_aid', '渠道AID'),
      key: 'channel',
      width: 120,
      render: (_: any, r: TaskLog) => {
        return (
          <Space size={4}>
            <Text type="secondary" style={{ fontSize: 12 }}>{r.channel_group_aid || '-'}</Text>
            {r.channel_provider_type === 'high_availability_group' && <Tag color="blue" style={{ fontSize: 10, margin: 0, padding: '0 4px', lineHeight: '16px' }}>HA</Tag>}
          </Space>
        );
      },
    } : null,
    {
      title: t('logs.type', '类型'),
      key: 'type',
      width: 100,
      filters: actionTypeFilter === '视觉' ? [
        { text: t('logs.type_image', '图片'), value: '图片' },
        { text: t('logs.type_video', '视频'), value: '视频' },
        { text: '视频增强', value: '视频增强' },
      ] : actionTypeFilter === '全部' ? [
        { text: t('logs.type_image', '图片'), value: '图片' },
        { text: t('logs.type_video', '视频'), value: '视频' },
        { text: t('logs.type_chat', '聊天'), value: '聊天' },
        { text: t('logs.type_audio', '音频'), value: '音频' },
        { text: t('logs.type_embedding', '向量'), value: '向量' },
        { text: t('logs.type_rerank', '排序'), value: '排序' },
        { text: t('logs.type_other', '其它'), value: '其它' },
      ] : undefined,
      filterMultiple: false,
      filteredValue: subTypeFilter ? [subTypeFilter] : null,
      render: (_: any, r: TaskLog) => {
        const typeInfo = getTaskType(r);
        return (
          <Tag color={typeInfo.color} style={{ borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px' }}>
            {typeInfo.icon}
            <span>{typeInfo.label}</span>
          </Tag>
        );
      },
    },
    {
      title: t('logs.model', '模型'),
      dataIndex: 'model',
      key: 'model',
      width: 180,
      ellipsis: true,
      render: (v: string, record: TaskLog) => (
        <Space direction="vertical" size={0}>
          <Text style={{ fontSize: 12, fontFamily: 'monospace' }}>{v || '-'}</Text>
          {user?.role === 'admin' && (record.yid || record.billing_pid || record.forward_eid) && (
            <Space size={4}>
              {record.yid && <Text type="secondary" style={{ fontSize: 10, fontFamily: 'monospace' }}>YID:{record.yid}</Text>}
              {record.billing_pid && <Text type="secondary" style={{ fontSize: 10, fontFamily: 'monospace' }}>PID:{record.billing_pid}</Text>}
              {record.forward_eid && <Text type="secondary" style={{ fontSize: 10, fontFamily: 'monospace' }}>EID:{record.forward_eid}</Text>}
            </Space>
          )}
        </Space>
      ),
    },
    {
      title: t('task_logs.task_id', '任务 ID'),
      key: 'task_id',
      width: 200,
      ellipsis: true,
      render: (_: any, r: TaskLog) => {
        const tid = getTaskId(r);
        return <Text style={{ fontSize: 11, fontFamily: 'monospace' }} copyable={tid !== '-' ? { text: tid } : undefined}>{tid}</Text>;
      },
    },
    {
      title: t('task_logs.status', '状态'),
      key: 'status',
      width: 120,
      render: (_: any, r: TaskLog) => {
        const status = getAsyncFinalStatus(r);
        if (status === 'pending') {
          // 视频任务支持取消（后端 cancel_task_log 会校验具体任务类型）
          const canCancel = r.action_type === '视频';
          return (
            <Space>
              <Tag color="processing">{t('task_logs.pending', '进行中')}</Tag>
              <Button 
                type="text" 
                size="small" 
                icon={<RefreshCw size={14} />} 
                onClick={(e) => { e.stopPropagation(); handleSyncTask(r.log_id!); }} 
                title={t('logs.manual_sync', '手动同步状态')}
              />
              {canCancel && (
                <Popconfirm
                  title={t('task_logs.confirm_cancel', '确认取消此视频任务？')}
                  onConfirm={(e) => { e?.stopPropagation(); handleCancelTask(r.log_id!); }}
                  onCancel={(e) => e?.stopPropagation()}
                  okText={t('common.confirm', '确认')}
                  cancelText={t('common.cancel', '取消')}
                >
                  <Button
                    type="text"
                    size="small"
                    danger
                    icon={<XCircle size={14} />}
                    onClick={(e) => e.stopPropagation()}
                    title={t('task_logs.cancel_task', '取消任务')}
                  />
                </Popconfirm>
              )}
            </Space>
          );
        }
        
        let statusTag = null;
        if (status === 'failed') {
          statusTag = <Tag color="error">{t('task_logs.fail', '失败')}</Tag>;
        } else {
          statusTag = <Tag color="success">{t('task_logs.success', '成功')}</Tag>;
        }

        const canPreview = (r.action_type === '图片' || r.action_type === '视频' || r.action_type === '视频增强') && status === 'succeeded';

        return (
          <Space>
            {statusTag}
            {canPreview && (
              <Button type="link" size="small" style={{ padding: 0 }} onClick={(e) => { e.stopPropagation(); handlePreview(r); }}>
                {t('task_logs.preview', '预览')}
              </Button>
            )}
          </Space>
        );
      },
    },
  ];

  // 管理员额外显示用户列
  if (isAdmin) {
    columns.splice(4, 0, {
      title: t('logs.user', '用户'),
      key: 'user',
      width: 120,
      render: (_: any, r: TaskLog) => (
        <Space direction="vertical" size={0}>
          <Text style={{ fontSize: 12 }}>{r.user_nickname || r.user_uid || r.user_id}</Text>
          <Text type="secondary" style={{ fontSize: 10, fontFamily: 'monospace' }} copyable={{ text: r.user_uid || r.user_id, tooltips: [t('logs.copy', '复制'), t('logs.copy_success', '已复制')] }}>
            {r.user_uid || r.user_id}
          </Text>
        </Space>
      ),
    });
  }

  // ── 筛选栏 ───────────────────────────────────────────────────
  const filterBar = (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
      <Form form={form} initialValues={{ dateRange: [dayjs().startOf('day'), dayjs().endOf('day')] }} onFinish={() => fetchLogs(1, pageSize)}>
        <Space wrap size={[8, 8]}>
          {isAdmin && (
            <Form.Item name="user_id" noStyle>
              <Input placeholder={t('task_logs.search_user_id', '搜索用户 UID/用户名')} prefix={<Search size={16} />} allowClear style={{ width: 180 }} />
            </Form.Item>
          )}
          <Form.Item name="search_keyword" noStyle>
            <Input placeholder={t('logs.search_keyword', '搜索日志 ID / 任务 ID')} prefix={<Search size={16} />} allowClear style={{ width: 240 }} />
          </Form.Item>
          <Form.Item name="model" noStyle>
            <Input placeholder={t('task_logs.model_name', '模型名称')} prefix={<Search size={16} />} allowClear style={{ width: 180 }} />
          </Form.Item>
          <Form.Item name="dateRange" noStyle>
            <RangePicker />
          </Form.Item>
          <Button type="primary" htmlType="submit" icon={<Search size={16} />} loading={loading} disabled={loading} style={{ borderRadius: 6 }}>{t('task_logs.query', '查询')}</Button>
          <Button disabled={loading} onClick={() => {
            form.resetFields();
            form.setFieldsValue({ dateRange: [dayjs().startOf('day'), dayjs().endOf('day')] });
            fetchLogs(1, pageSize);
          }} style={{ borderRadius: 6 }}>{t('task_logs.reset', '重置')}</Button>
          <Button icon={<RefreshCw size={14} />} onClick={() => fetchLogs(page, pageSize)} loading={loading} disabled={loading} style={{ borderRadius: 6 }}>{t('common.refresh', '刷新')}</Button>
          {isAdmin && (
            <Tooltip title={t('logs.export_tooltip', '根据当前筛选条件导出 CSV（上限10万条）')}>
              <Button icon={<Download size={14} />} loading={exporting} disabled={loading} onClick={handleExport} style={{ borderRadius: 6 }}>{t('task_logs.export', '导出')}</Button>
            </Tooltip>
          )}
        </Space>
      </Form>
    </div>
  );

  // ── 移动端卡片 ───────────────────────────────────────────────
  const renderMobileCard = (record: TaskLog) => {
    const tp = getTaskType(record);
    const tid = getTaskId(record);
    const status = getAsyncFinalStatus(record);
    return (
      <MobileCard
        compact={true}
        style={{ background: isLight ? '#fff' : '#141414', border: 'none' }}
        title={
          <Space direction="vertical" size={2}>
            <Space>
              <Tag color={tp.color}>{tp.icon} {tp.label}</Tag>
              <Text style={{ fontSize: 12, fontFamily: 'monospace' }}>{record.model}</Text>
            </Space>
            {user?.role === 'admin' && (record.yid || record.billing_pid || record.forward_eid) && (
              <Space size={4} style={{ display: 'flex', flexWrap: 'wrap' }}>
                {record.yid && <Text type="secondary" style={{ fontSize: 10, fontFamily: 'monospace' }}>YID:{record.yid}</Text>}
                {record.billing_pid && <Text type="secondary" style={{ fontSize: 10, fontFamily: 'monospace' }}>PID:{record.billing_pid}</Text>}
                {record.forward_eid && <Text type="secondary" style={{ fontSize: 10, fontFamily: 'monospace' }}>EID:{record.forward_eid}</Text>}
              </Space>
            )}
          </Space>
        }
        extra={
          status === 'pending' ? (
            <Space>
              <Tag color="processing">{t('task_logs.pending', '进行中')}</Tag>
              <Button type="text" size="small" icon={<RefreshCw size={14} />} onClick={(e) => { e.stopPropagation(); handleSyncTask(record.log_id!); }} />
              {record.action_type === '视频' && (
                <Popconfirm
                  title={t('task_logs.confirm_cancel', '确认取消此视频任务？')}
                  onConfirm={(e) => { e?.stopPropagation(); handleCancelTask(record.log_id!); }}
                  onCancel={(e) => e?.stopPropagation()}
                  okText={t('common.confirm', '确认')}
                  cancelText={t('common.cancel', '取消')}
                >
                  <Button type="text" size="small" danger icon={<XCircle size={14} />} onClick={(e) => e.stopPropagation()} />
                </Popconfirm>
              )}
            </Space>
          ) : status === 'failed' ? (
            <Tag color="error">{t('task_logs.fail', '失败')}</Tag>
          ) : (
            <Space>
              <Tag color="success">{t('task_logs.success', '成功')}</Tag>
              {(record.action_type === '图片' || record.action_type === '视频' || record.action_type === '视频增强') && (
                <Button type="link" size="small" style={{ padding: 0 }} onClick={(e) => { e.stopPropagation(); handlePreview(record); }}>
                  {t('task_logs.preview', '预览')}
                </Button>
              )}
            </Space>
          )
        }
      >
        <CardRow label={t('task_logs.submit_time', '提交')}>
          <Space direction="vertical" size={0} align="end">
            <Text type="secondary" style={{ fontSize: 12 }}>{formatApiDateTime(record.created_at)}</Text>
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
        {isAdmin && record.channel_group_aid && (
          <CardRow label={t('logs.channel_aid', '渠道AID')}>
            <Space size={4}>
              <Text type="secondary" style={{ fontSize: 12 }}>{record.channel_group_aid}</Text>
              {record.channel_provider_type === 'high_availability_group' && <Tag color="blue" style={{ fontSize: 10, margin: 0, padding: '0 4px', lineHeight: '16px' }}>HA</Tag>}
            </Space>
          </CardRow>
        )}
        {isAdmin && <CardRow label={t('logs.user', '用户')}><Space direction="vertical" size={0} align="end"><Text style={{ fontSize: 12 }}>{record.user_nickname || record.user_uid || record.user_id}</Text><Text type="secondary" style={{ fontSize: 10, fontFamily: 'monospace' }} copyable={{ text: record.user_uid || record.user_id }}>{record.user_uid || record.user_id}</Text></Space></CardRow>}
        <CardRow label={t('logs.latency', '耗时')}><Text type="secondary" style={{ fontSize: 12 }}>🕗 {(() => {
          if (isAsyncPost(record) && status === 'pending') return t('task_logs.processing', '处理中...');
          const sec = record.latency_ms / 1000;
          return sec >= 60 ? `${(sec / 60).toFixed(1)}m` : `${sec.toFixed(1)}s`;
        })()}</Text></CardRow>
        {tid !== '-' && <CardRow label={t('task_logs.task_id', '任务ID')}><Text style={{ fontSize: 11, fontFamily: 'monospace' }}>{tid}</Text></CardRow>}
        {record.cost > 0 && <CardRow label={t('task_logs.cost', '费用')}><Text style={{ fontSize: 12 }}>{record.cost.toFixed(6)}</Text></CardRow>}
      </MobileCard>
    );
  };

  return (
    <Card 
      variant="borderless" 
      style={{ 
        background: screens.xs ? 'transparent' : (isLight ? '#fff' : 'rgba(255,255,255,0.02)'), 
        borderRadius: 12,
        boxShadow: screens.xs ? 'none' : undefined
      }} 
      styles={{ body: { padding: screens.xs ? 0 : '16px 24px 24px' } }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <Typography.Title level={4} style={{ margin: 0, fontSize: 18, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <RefreshCw size={20} />
            {t('menu.task_logs', '任务日志')}
          </Typography.Title>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShadcnTabs 
              value={actionTypeFilter}
              isLight={isLight}
              themeToken={themeToken}
              onChange={(v: string) => {
                setActionTypeFilter(v);
                setSubTypeFilter(null);
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
            <Tooltip title={t('logs.configure_default_type', '配置默认视图')}>
              <Button
                type="text"
                icon={<MoreHorizontal size={16} />}
                onClick={() => setIsSettingsModalVisible(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '8px',
                  width: '32px',
                  height: '32px',
                  padding: 0,
                  background: themeToken?.colorFillAlter || (isLight ? '#fafafa' : '#1d1d1d'),
                  border: 'none',
                  color: themeToken?.colorTextSecondary || (isLight ? '#71717a' : '#a1a1aa'),
                }}
              />
            </Tooltip>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        {filterBar}
      </div>

      {screens.xs ? (
        <MobileCardList
          dataSource={data}
          loading={loading}
          rowKey="id"
          compact={true}
          gap={4}
          pagination={{ current: page, pageSize, total, onChange: (p: number, s: number) => fetchLogs(p, s) }}
          renderCard={renderMobileCard}
        />
      ) : (
        <Table
          columns={columns.map((c: any) => c ? { ...c, align: 'center' } : null).filter(Boolean) as any}
          dataSource={data}
          rowKey="id"
          loading={loading}
          expandable={
            allowDetails 
              ? { expandedRowKeys, expandedRowRender, onExpand: handleExpand, expandRowByClick: false } 
              : undefined
          }
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (totalCount) => t('task_logs.total_records', '共 {{total}} 条', { total: totalCount }),
          }}
          onChange={(pagination, filters) => {
            const typeFilter = filters?.type;
            const newSubFilter = (typeFilter && typeFilter.length > 0) ? (typeFilter[0] as string) : null;
            
            let shouldResetPage = false;
            if (newSubFilter !== subTypeFilter) {
              setSubTypeFilter(newSubFilter);
              shouldResetPage = true;
            }
            if (shouldResetPage) {
              setPage(1);
            } else if (pagination.current !== page || pagination.pageSize !== pageSize) {
              setPage(pagination.current || 1);
              setPageSize(pagination.pageSize || 20);
            }
          }}
          scroll={{ x: 'max-content' }}
          size="middle"
        />
      )}

      {/* 媒体预览 Modal */}
      <Modal
        title={t('task_logs.preview_media', '媒体预览')}
        open={previewOpen}
        onCancel={() => { setPreviewOpen(false); setPreviewUrls([]); }}
        footer={null}
        width={800}
        destroyOnClose
        centered
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center', justifyContent: 'center' }}>
          {previewType === '图片' ? (
            <Image.PreviewGroup>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'center', width: '100%' }}>
                {previewUrls.map((url, idx) => (
                  <CustomMedia key={idx} src={url} type="图片" />
                ))}
              </div>
            </Image.PreviewGroup>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'center', width: '100%' }}>
              {previewUrls.map((url, idx) => (
                <CustomMedia key={idx} src={url} type="视频" />
              ))}
            </div>
          )}
        </div>
      </Modal>
      {/* 默认类型设置 Modal */}
      <Modal
        title={null}
        open={isSettingsModalVisible}
        onCancel={() => setIsSettingsModalVisible(false)}
        footer={null}
        width={420}
        styles={{
          mask: { backgroundColor: 'rgba(0, 0, 0, 0.45)' },
          body: { padding: '24px' },
          content: { 
            backgroundColor: isLight ? 'rgba(255, 255, 255, 0.95)' : 'rgba(28, 29, 31, 0.85)', 
            backdropFilter: 'blur(16px) saturate(120%)', 
            WebkitBackdropFilter: 'blur(16px) saturate(120%)',
            borderRadius: 16, 
            padding: 0, 
            overflow: 'hidden',
            border: isLight ? '1px solid rgba(0,0,0,0.1)' : '1px solid rgba(255,255,255,0.1)',
            boxShadow: isLight ? '0 12px 32px rgba(0,0,0,0.1)' : '0 24px 48px rgba(0,0,0,0.4)'
          },
        } as any}
      >
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: isLight ? '#1f2937' : '#E8EAED' }}>
            {t('logs.default_type_modal_title', '配置默认查看日志类型')}
          </h3>
          <p style={{ fontSize: 12, color: isLight ? '#71717a' : '#a1a1aa', margin: '4px 0 0 0' }}>
            {t('logs.default_type_modal_desc', '选择在进入日志查询页面时，默认加载并展示 of 日志类别。')}
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 24 }}>
          {[
            { value: '视觉', label: t('logs.type_vision', '视觉'), icon: <ImageIcon size={14} /> },
            { value: '聊天', label: t('logs.type_chat', '聊天'), icon: <MessageSquare size={14} /> },
            { value: '音频', label: t('logs.type_audio', '音频'), icon: <Mic size={14} /> },
            { value: '向量', label: t('logs.type_embedding', '向量'), icon: <Cuboid size={14} /> },
            { value: '排序', label: t('logs.type_rerank', '排序'), icon: <ListOrdered size={14} /> },
            { value: '其它', label: t('logs.type_other', '其它'), icon: <Wrench size={14} /> },
            { value: '全部', label: t('logs.type_all', '全部'), icon: <LayoutGrid size={14} /> },
          ].map((opt) => {
            const isSelected = tempDefaultType === opt.value;
            return (
              <div
                key={opt.value}
                onClick={() => setTempDefaultType(opt.value)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: `1px solid ${isSelected ? themeToken.colorPrimary : (isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)')}`,
                  background: isSelected 
                    ? (isLight ? 'rgba(22, 119, 255, 0.05)' : 'rgba(22, 119, 255, 0.15)') 
                    : (isLight ? 'transparent' : 'rgba(255,255,255,0.02)'),
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  color: isSelected ? themeToken.colorPrimary : (isLight ? '#1f2937' : '#E8EAED'),
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.borderColor = isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)';
                    e.currentTarget.style.background = isLight ? 'rgba(0,0,0,0.01)' : 'rgba(255,255,255,0.04)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.borderColor = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)';
                    e.currentTarget.style.background = isLight ? 'transparent' : 'rgba(255,255,255,0.02)';
                  }
                }}
              >
                <span>{opt.icon}</span>
                <span style={{ fontSize: 13, fontWeight: isSelected ? 500 : 400 }}>{opt.label}</span>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <Button
            onClick={() => setIsSettingsModalVisible(false)}
            style={{
              borderRadius: 6,
              height: 32,
              padding: '0 16px',
              fontSize: 13,
              border: isLight ? '1px solid rgba(0,0,0,0.15)' : '1px solid rgba(255,255,255,0.15)',
              background: 'transparent',
              color: isLight ? '#1f2937' : '#E8EAED',
            }}
          >
            {t('common.cancel', '取消')}
          </Button>
          <Button
            onClick={() => {
              localStorage.setItem('default_log_type', tempDefaultType);
              setActionTypeFilter(tempDefaultType);
              setPage(1);
              message.success(t('logs.default_type_saved', '默认日志类型配置已保存'));
              setIsSettingsModalVisible(false);
            }}
            style={{
              borderRadius: 6,
              height: 32,
              padding: '0 16px',
              fontSize: 13,
              background: themeToken.colorPrimary,
              color: '#fff',
              border: 'none',
            }}
          >
            {t('common.confirm', '确认')}
          </Button>
        </div>
      </Modal>
    </Card>
  );
};

export default TaskLogs;
