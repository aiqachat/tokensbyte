/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import React, { useEffect, useState } from 'react';
import { getAnnouncementLabel } from '../../utils/announcement';
import {
  parseNotificationPreferences,
  shouldShowWebNotifications,
} from '../../utils/notificationPrefs';
import { Row, Col, Card, Typography, Table, Space, List, Progress, Alert, Grid, Spin, Modal, Button, Statistic, Divider, Tooltip as AntTooltip, DatePicker, Radio, Tag } from 'antd';
import MobileCardList, { MobileCard, CardRow } from '../../components/MobileCardList';
import {
  ExpandAltOutlined,
  BarChartOutlined,
  DatabaseOutlined,
  AccountBookOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import { LineChart as LineChartIcon, PieChart as PieChartIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';
import useSettingsStore from '../../store/settings';
import useAuthStore from '../../store/auth';
import { useThemeStore } from '../../store/theme';
import type { DashboardStats, RequestLog, Announcement, ModelTrend30dResponse, LiveMetricsResponse, LiveMetricsSnapshot } from '../../types';
import dayjs from 'dayjs';
import { toCalendarDateRangeParams } from '../../utils/dateRangeParams';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

const { Title, Text } = Typography;

const Dashboard: React.FC = () => {
  const { t, i18n } = useTranslation();
  const screens = Grid.useBreakpoint();
  const { settings } = useSettingsStore();
  const { user } = useAuthStore();
  const { themeMode } = useThemeStore();
  const _isLight = themeMode === 'light';
  const currencySymbol = settings?.currency?.currency_symbol || '$';
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [liveMetrics, setLiveMetrics] = useState<LiveMetricsSnapshot | null>(null);
  const [pinnedAnnouncement, setPinnedAnnouncement] = useState<Announcement | null>(null);
  const { RangePicker } = DatePicker;
  const isAdmin = user?.role === 'admin';
  const [dateRange, setDateRange] = useState<[any, any] | null>(() => [
    dayjs().startOf('day'),
    dayjs().endOf('day'),
  ]);
  const [quickRange, setQuickRange] = useState<string>('today');

  const applyTodayRange = () => {
    setQuickRange('today');
    setDateRange([dayjs().startOf('day'), dayjs().endOf('day')]);
  };

  const handleQuickRangeChange = (e: any) => {
    const val = e.target.value;
    setQuickRange(val);
    if (val === 'today') {
      setDateRange([dayjs().startOf('day'), dayjs().endOf('day')]);
    } else if (val === 'yesterday') {
      setDateRange([dayjs().subtract(1, 'day').startOf('day'), dayjs().subtract(1, 'day').endOf('day')]);
    } else if (val === 'week') {
      setDateRange([dayjs().startOf('week'), dayjs().endOf('week')]);
    } else if (val === 'month') {
      setDateRange([dayjs().startOf('month'), dayjs().endOf('month')]);
    } else if (val === 'last_month') {
      setDateRange([
        dayjs().subtract(1, 'month').startOf('month'),
        dayjs().subtract(1, 'month').endOf('month'),
      ]);
    }
  };

  const handleDateRangeChange = (vals: any) => {
    if (!vals?.[0] || !vals?.[1]) {
      applyTodayRange();
      return;
    }
    setDateRange(vals);
    setQuickRange('custom');
  };

  const showDayComparison = quickRange === 'today' || quickRange === 'yesterday';

  const periodLabel = (() => {
    switch (quickRange) {
      case 'today':
        return t('dashboard.today');
      case 'yesterday':
        return t('dashboard.yesterday');
      case 'week':
        return t('dashboard.week');
      case 'month':
        return t('dashboard.month');
      case 'last_month':
        return t('dashboard.last_month');
      default:
        if (dateRange?.[0] && dateRange?.[1]) {
          const sameYear = dateRange[0].year() === dateRange[1].year();
          const fmt = sameYear ? 'MM-DD' : 'YYYY-MM-DD';
          return `${dateRange[0].format(fmt)} ~ ${dateRange[1].format(fmt)}`;
        }
        return t('dashboard.custom');
    }
  })();

  const requestsLabel = t('dashboard.period_requests', { period: periodLabel });
  const tokensLabel = t('dashboard.period_tokens', { period: periodLabel });
  const costLabel = t('dashboard.period_cost', { period: periodLabel });
  const scopeLabel = isAdmin
    ? t('dashboard.scope_admin')
    : t('dashboard.scope_user');
  const modelDetailHint = t('dashboard.model_detail_period', { period: periodLabel });
  const [cardHeight, setCardHeight] = useState(580);
  const [isTrendModalVisible, setIsTrendModalVisible] = useState(false);
  const [isFullscreenTrend, setIsFullscreenTrend] = useState(false);
  const [isModel30dModalVisible, setIsModel30dModalVisible] = useState(false);
  const [isFullscreen30d, setIsFullscreen30d] = useState(false);
  const [modelStats30d, setModelStats30d] = useState<ModelTrend30dResponse | null>(null);
  const [loading30d, setLoading30d] = useState(false);

  const fetchModelStats30d = async () => {
    setLoading30d(true);
    try {
      const data = await (request.get<ModelTrend30dResponse>('/dashboard/models_30d') as unknown as Promise<ModelTrend30dResponse>);
      setModelStats30d(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading30d(false);
    }
  };

  const chartData30d = React.useMemo(() => {
    if (!modelStats30d) return [];
    
    const dataMap = new Map<string, any>();
    
    // Initialize dates for the last 30 days
    for (let i = 29; i >= 0; i--) {
      const d = dayjs().subtract(i, 'day').format('YYYY-MM-DD');
      dataMap.set(d, { date: d.slice(5) });
    }

    if (modelStats30d.daily_data && Array.isArray(modelStats30d.daily_data)) {
      modelStats30d.daily_data.forEach(item => {
        if (!dataMap.has(item.date)) {
          dataMap.set(item.date, { date: item.date.slice(5) });
        }
        const entry = dataMap.get(item.date);
        entry[item.model] = parseFloat(item.total_cost.toFixed(6));
      });
    }

    return Array.from(dataMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [modelStats30d]);

  useEffect(() => {
    if (isModel30dModalVisible && !modelStats30d) {
      fetchModelStats30d();
    }
  }, [isModel30dModalVisible]);

  useEffect(() => {
    const handleResize = () => {
      const announcementOffset = pinnedAnnouncement ? 70 : 0;
      const calculated = window.innerHeight - 470 - announcementOffset;
      setCardHeight(Math.max(450, calculated));
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [pinnedAnnouncement]);

  const isDark = !_isLight;
  const textColor = isDark ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.85)';

  const getRankBadgeStyle = (index: number) => {
    const base: React.CSSProperties = {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 20,
      height: 20,
      borderRadius: '50%',
      fontWeight: 'bold',
      fontSize: 10,
      marginRight: 8,
      color: '#fff',
      flexShrink: 0,
    };
    if (index === 0) {
      return {
        ...base,
        background: 'linear-gradient(135deg, #FFE066 0%, #F5A623 100%)',
        boxShadow: '0 1px 4px rgba(245, 166, 35, 0.3)',
      };
    }
    if (index === 1) {
      return {
        ...base,
        background: 'linear-gradient(135deg, #E2E8F0 0%, #94A3B8 100%)',
        boxShadow: '0 1px 4px rgba(148, 163, 184, 0.3)',
      };
    }
    if (index === 2) {
      return {
        ...base,
        background: 'linear-gradient(135deg, #FDBA74 0%, #C2410C 100%)',
        boxShadow: '0 1px 4px rgba(194, 65, 12, 0.3)',
      };
    }
    return {
      ...base,
      background: isDark ? 'rgba(255, 255, 255, 0.15)' : '#e8e8e8',
      color: textColor,
    };
  };

  const getBarColor = (index: number) => {
    if (index === 0) return 'linear-gradient(90deg, #F5A623 0%, #FFE066 100%)';
    if (index === 1) return 'linear-gradient(90deg, #94A3B8 0%, #CBD5E1 100%)';
    if (index === 2) return 'linear-gradient(90deg, #C2410C 0%, #FDBA74 100%)';
    return 'linear-gradient(90deg, #18181b 0%, #52525b 100%)';
  };

  const fetchStats = async () => {
    try {
      const params: any = {};
      Object.assign(params, toCalendarDateRangeParams(dateRange));
      const data = await (request.get<DashboardStats>('/dashboard', { params }) as unknown as Promise<DashboardStats>);
      setStats(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const fetchLiveMetrics = async () => {
    if (typeof document !== 'undefined' && document.hidden) return;
    try {
      const data = await (request.get<LiveMetricsResponse>('/metrics/live') as unknown as Promise<LiveMetricsResponse>);
      setLiveMetrics(data.metrics);
    } catch (error) {
      // 实时指标失败不阻断看板
      console.error(error);
    }
  };

  const fetchAnnouncement = async () => {
    const prefs = parseNotificationPreferences(
      user?.notification_preferences,
      settings?.notification?.low_balance_threshold ?? 100.0,
    );
    if (!shouldShowWebNotifications(prefs, settings?.notification)) {
      setPinnedAnnouncement(null);
      return;
    }
    try {
      const response = await (request.get('/announcements/public') as any);
      if (response.data && response.data.length > 0) {
        const pinned = response.data.find((a: Announcement) => a.is_pinned === 1);
        if (pinned) {
          setPinnedAnnouncement(pinned);
        } else {
          setPinnedAnnouncement(null);
        }
      } else {
        setPinnedAnnouncement(null);
      }
    } catch (e) {}
  };

  useEffect(() => {
    setLoading(true);
    fetchStats();
    fetchAnnouncement();
    // 与后端 dashboard SWR 缓存 TTL（180s）对齐，减轻 logs 大表聚合压力
    const timer = setInterval(fetchStats, 180000);
    return () => clearInterval(timer);
  }, [dateRange, user?.notification_preferences]);

  useEffect(() => {
    fetchLiveMetrics();
    const timer = setInterval(fetchLiveMetrics, 5000);
    const onVis = () => {
      if (!document.hidden) fetchLiveMetrics();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  const columns = [
    {
      title: t('dashboard.recent_activity_time', { defaultValue: 'Time' }),
      key: 'time_status',
      align: 'center' as const,
      render: (log: RequestLog) => (
        <Space direction="vertical" size={2} align="center">
          <Text style={{ color: _isLight ? '#666' : '#888', fontSize: 13 }}>
            {dayjs(log.created_at).format('YYYY-MM-DD HH:mm:ss')}
          </Text>
          <span style={{ 
            display: 'inline-block',
            width: 'fit-content',
            background: log.status_code === 200 ? (_isLight ? 'rgba(82, 196, 26, 0.1)' : 'rgba(255,255,255,0.1)') : 'rgba(255,0,0,0.1)', 
            color: log.status_code === 200 ? (_isLight ? '#52c41a' : '#ccc') : '#ff4d4f',
            padding: '1px 6px', 
            borderRadius: 4, 
            fontSize: 11 
          }}>
            {log.status_code}
          </span>
        </Space>
      ),
    },
    ...(isAdmin
      ? [
          {
            title: t('dashboard.recent_activity_user', '用户'),
            key: 'user',
            render: (log: RequestLog) => (
              <Text style={{ color: _isLight ? '#666' : '#888', fontSize: 13 }}>
                {log.user_nickname || log.user_uid || log.user_id || '-'}
              </Text>
            ),
          },
        ]
      : []),
    {
      title: t('channels.type'),
      dataIndex: 'model',
      key: 'model',
      render: (text: string) => (
        <span style={{ background: _isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: 4, color: _isLight ? '#333' : '#ccc', fontSize: 13 }}>
          {text}
        </span>
      ),
    },
    {
      title: 'Tokens',
      key: 'tokens',
      render: (log: RequestLog) => (
        <Space direction="vertical" size={0}>
          <Text style={{ color: _isLight ? '#666' : '#888', fontSize: 12 }}>In: {log.prompt_tokens}</Text>
          <Text style={{ color: _isLight ? '#666' : '#888', fontSize: 12 }}>Out: {log.completion_tokens}</Text>
        </Space>
      ),
    },
    {
      title: t('dashboard.estimated_cost'),
      dataIndex: 'cost',
      key: 'cost',
      render: (val: number) => <Text style={{ color: _isLight ? '#333' : '#ccc', fontSize: 13 }}>{currencySymbol}{val.toFixed(6)}</Text>,
    },
  ];

  const cardStyle: React.CSSProperties = {
    height: screens.xs ? 180 : 210,
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    borderRadius: 12,
  };

  const metricLabelStyle: React.CSSProperties = {
    color: _isLight ? '#666' : '#888',
    fontSize: screens.xs ? 11 : 13,
    fontWeight: 500,
  };

  const metricValueStyle: React.CSSProperties = {
    margin: '4px 0 0 0',
    color: _isLight ? '#1f2937' : '#fff',
    fontWeight: 500,
    fontSize: screens.xs ? 18 : 26,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    lineHeight: 1.2,
  };

  const metricSubStyle: React.CSSProperties = {
    color: _isLight ? '#666' : '#888',
    fontSize: screens.xs ? 10 : 12,
  };

  const liveMetricItems = [
    { key: 'qps', label: t('dashboard.live_qps'), tip: t('dashboard.live_qps_tip'), value: liveMetrics?.qps ?? 0 },
    { key: 'rpm', label: t('dashboard.live_rpm'), tip: t('dashboard.live_rpm_tip'), value: liveMetrics?.rpm ?? 0 },
    { key: 'tpm', label: t('dashboard.live_tpm'), tip: t('dashboard.live_tpm_tip'), value: liveMetrics?.tpm ?? 0 },
    { key: 'task', label: t('dashboard.live_task'), tip: t('dashboard.live_task_tip'), value: liveMetrics?.task ?? 0 },
  ];

  const backgroundIconStyle: React.CSSProperties = {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    fontSize: screens.xs ? '48px' : '64px',
    color: _isLight ? 'rgba(0, 0, 0, 0.025)' : 'rgba(255, 255, 255, 0.03)',
    pointerEvents: 'none',
    zIndex: 0,
  };



  return (
    <div style={{ maxWidth: 1600, margin: '0 auto' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: pinnedAnnouncement ? 16 : 24 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <Title level={2} style={{ margin: 0, fontWeight: 600, color: _isLight ? '#1f2937' : '#E8EAED' }}>
            {t('dashboard.title')}
          </Title>
          <Tag
            style={{
              marginLeft: 12,
              marginRight: 0,
              borderRadius: 6,
              border: _isLight ? '1px solid rgba(24,24,27,0.12)' : '1px solid rgba(255,255,255,0.16)',
              background: _isLight ? 'rgba(24,24,27,0.04)' : 'rgba(255,255,255,0.06)',
              color: _isLight ? '#52525b' : '#a1a1aa',
              fontWeight: 500,
            }}
          >
            {scopeLabel}
          </Tag>
          <AntTooltip title={t('dashboard.view_30d_trend', '查看 30 天趋势')}>
            <LineChartIcon 
              size={24}
              strokeWidth={2}
              className="shadcn-icon-btn"
              style={{ 
                marginLeft: 12, 
                color: _isLight ? '#000000' : '#ffffff', 
                cursor: 'pointer' 
              }} 
              onClick={() => setIsTrendModalVisible(true)}
            />
          </AntTooltip>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
          <Radio.Group value={quickRange} onChange={handleQuickRangeChange} style={{ display: 'flex', flexWrap: 'wrap' }}>
            <Radio.Button value="today">{t('dashboard.today', '今天')}</Radio.Button>
            <Radio.Button value="yesterday">{t('dashboard.yesterday', '昨日')}</Radio.Button>
            <Radio.Button value="week">{t('dashboard.week', '本周')}</Radio.Button>
            <Radio.Button value="month">{t('dashboard.month', '本月')}</Radio.Button>
            <Radio.Button value="last_month">{t('dashboard.last_month', '上月')}</Radio.Button>
          </Radio.Group>
          <RangePicker
            value={dateRange}
            onChange={handleDateRangeChange}
            allowClear={false}
            style={{ width: screens.xs ? '100%' : 260 }}
          />
        </div>
      </div>

      {pinnedAnnouncement && (
        <div
          className="compact-announcement-banner"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            padding: '8px 12px',
            marginBottom: 16,
            borderRadius: '8px',
            background: _isLight ? 'rgba(24, 24, 27, 0.04)' : 'rgba(250, 250, 250, 0.06)',
            border: _isLight ? '1px solid rgba(24, 24, 27, 0.1)' : '1px solid rgba(250, 250, 250, 0.12)',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)',
          }}
        >
          {/* Custom Info Icon */}
          <div style={{ display: 'flex', alignItems: 'center', height: '18px', color: _isLight ? '#18181b' : '#fafafa', flexShrink: 0 }}>
            <svg viewBox="0 0 1024 1024" width="14" height="14" fill="currentColor" style={{ verticalAlign: 'middle' }}>
              <path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm32 664c0 4.4-3.6 8-8 8h-48c-4.4 0-8-3.6-8-8V456c0-4.4 3.6-8 8-8h48c-4.4 0-8 3.6-8 8v272zm-32-344c-22.1 0-40-17.9-40-40s17.9-40 40-40 40 17.9 40 40-17.9 40-40 40z" />
            </svg>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontWeight: 600, fontSize: '13px', color: _isLight ? '#1f2937' : '#f3f4f6', lineHeight: '1.4' }}>
              {getAnnouncementLabel(pinnedAnnouncement.title)}
            </span>
            <div 
              className="quill-content compact-announcement" 
              dangerouslySetInnerHTML={{ __html: getAnnouncementLabel(pinnedAnnouncement.content) }} 
              style={{ 
                fontSize: '12px', 
                lineHeight: '1.4', 
                color: _isLight ? '#4b5563' : '#d1d5db' 
              }}
            />
          </div>
        </div>
      )}

      {/* 概览仪表盘：消耗 Token | 预估成本 | 请求+令牌 | 实时吞吐 */}
      <Row gutter={[16, 16]}>
        <Col xs={12} sm={12} lg={6}>
          <Card
            variant="borderless"
            style={cardStyle}
            styles={{ body: { padding: screens.xs ? 16 : 24, height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' } }}
          >
            <DatabaseOutlined style={backgroundIconStyle} />
            <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
              <Text style={{ color: _isLight ? '#666' : '#888', fontSize: screens.xs ? 12 : 14, fontWeight: 500 }}>{tokensLabel}</Text>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, margin: '8px 0 0 0' }}>
                <Title level={2} style={{ margin: 0, color: _isLight ? '#1f2937' : '#fff', fontWeight: 500, fontSize: screens.xs ? 18 : 30, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={stats?.total_tokens?.toLocaleString() || '0'}>{stats?.total_tokens?.toLocaleString() || 0}</Title>
                {showDayComparison && (
                  <>
                    <Text style={{ color: _isLight ? '#666' : '#888', fontSize: screens.xs ? 11 : 13 }}>{t('dashboard.today')}: {stats?.today_tokens?.toLocaleString() || 0}</Text>
                    <Text style={{ color: _isLight ? '#666' : '#888', fontSize: screens.xs ? 11 : 13 }}>{t('dashboard.yesterday')}: {stats?.yesterday_tokens?.toLocaleString() || 0}</Text>
                  </>
                )}
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={12} lg={6}>
          <Card
            variant="borderless"
            style={cardStyle}
            styles={{ body: { padding: screens.xs ? 16 : 24, height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' } }}
          >
            <AccountBookOutlined style={backgroundIconStyle} />
            <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
              <Text style={{ color: _isLight ? '#666' : '#888', fontSize: screens.xs ? 12 : 14, fontWeight: 500 }}>{costLabel}</Text>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, margin: '8px 0 0 0' }}>
                <Title level={2} style={{ margin: 0, color: _isLight ? '#1f2937' : '#fff', fontWeight: 500, fontSize: screens.xs ? 18 : 30, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={`${currencySymbol}${stats?.total_cost?.toFixed(6) || 0}`}>{currencySymbol}{stats?.total_cost?.toFixed(6) || 0}</Title>
                {showDayComparison && (
                  <>
                    <Text style={{ color: _isLight ? '#666' : '#888', fontSize: screens.xs ? 11 : 13 }}>{t('dashboard.today')}: {currencySymbol}{(stats?.today_cost || 0).toFixed(6)}</Text>
                    <Text style={{ color: _isLight ? '#666' : '#888', fontSize: screens.xs ? 11 : 13 }}>{t('dashboard.yesterday')}: {currencySymbol}{(stats?.yesterday_cost || 0).toFixed(6)}</Text>
                  </>
                )}
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={12} lg={6}>
          <Card
            variant="borderless"
            style={cardStyle}
            styles={{ body: { padding: screens.xs ? 14 : 20, height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' } }}
          >
            <BarChartOutlined style={backgroundIconStyle} />
            <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%', gap: 10 }}>
              <div style={{ flex: 1, minHeight: 0 }}>
                <Text style={metricLabelStyle}>{requestsLabel}</Text>
                <Title level={2} style={metricValueStyle} title={String(stats?.total_requests || 0)}>
                  {stats?.total_requests || 0}
                </Title>
                {showDayComparison && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0 10px', marginTop: 2 }}>
                    <Text style={metricSubStyle}>{t('dashboard.today')}: {stats?.today_requests || 0}</Text>
                    <Text style={metricSubStyle}>{t('dashboard.yesterday')}: {stats?.yesterday_requests || 0}</Text>
                  </div>
                )}
              </div>
              <Divider style={{ margin: 0, borderColor: _isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)' }} />
              <div style={{ flex: 1, minHeight: 0 }}>
                <Text style={metricLabelStyle}>{t('dashboard.total_api_tokens', '总令牌')}</Text>
                <Title level={2} style={{ ...metricValueStyle, fontSize: screens.xs ? 16 : 22 }} title={String(stats?.total_api_tokens || 0)}>
                  {stats?.total_api_tokens || 0}
                </Title>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0 10px', marginTop: 2 }}>
                  <Text style={metricSubStyle}>{t('dashboard.today_active')}: {stats?.today_active_tokens || 0}</Text>
                  <Text style={metricSubStyle}>{t('dashboard.yesterday_active')}: {stats?.yesterday_active_tokens || 0}</Text>
                </div>
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={12} lg={6}>
          <Card
            variant="borderless"
            style={cardStyle}
            styles={{ body: { padding: screens.xs ? 14 : 18, height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' } }}
          >
            <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                <Text style={{ color: _isLight ? '#666' : '#888', fontSize: screens.xs ? 12 : 13, fontWeight: 500 }}>
                  {t('dashboard.live_throughput')}
                </Text>
                <Tag style={{ margin: 0, lineHeight: '18px', fontSize: 11 }}>{t('dashboard.live_tag')}</Tag>
              </div>
              <div
                style={{
                  flex: 1,
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gridTemplateRows: '1fr 1fr',
                  gap: screens.xs ? 8 : 10,
                }}
              >
                {liveMetricItems.map((item) => (
                  <AntTooltip key={item.key} title={item.tip}>
                    <div style={{ minWidth: 0 }}>
                      <Text style={metricSubStyle}>{item.label}</Text>
                      <Title
                        level={4}
                        style={{
                          margin: '2px 0 0 0',
                          color: _isLight ? '#1f2937' : '#fff',
                          fontWeight: 500,
                          fontSize: screens.xs ? 15 : 20,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {Number(item.value).toLocaleString()}
                      </Title>
                    </div>
                  </AntTooltip>
                ))}
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        <Col lg={14} xs={24}>
          <div style={{ height: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <Title level={5} style={{ color: _isLight ? '#1f2937' : '#fff', fontWeight: 500, margin: 0 }}>{t('dashboard.recent_activity')}</Title>
            <Text type="secondary" style={{ color: _isLight ? '#999' : '#666', fontSize: 13 }}>{t('dashboard.auto_refresh')}</Text>
          </div>
          <Card 
            variant="borderless" 
            style={{ 
              borderRadius: 12, 
              height: screens.xs ? 'auto' : cardHeight, 
              display: 'flex', 
              flexDirection: 'column',
              background: screens.xs ? 'transparent' : undefined,
              boxShadow: screens.xs ? 'none' : undefined
            }} 
            styles={{ body: { padding: 0, flex: 1, overflowY: screens.xs ? 'auto' : 'hidden' } }}
          >
            {screens.xs ? (
              <MobileCardList
                dataSource={stats?.recent_logs || []}
                loading={loading}
                rowKey="id"
                compact={true}
                gap={4}
                renderCard={(item) => (
                  <MobileCard
                    compact={true}
                    style={{ background: _isLight ? '#fff' : '#141414', border: 'none' }}
                    title={
                      <span style={{ background: _isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)', padding: '1px 6px', borderRadius: 4, color: _isLight ? '#333' : '#ccc', fontSize: 11 }}>
                        {item.model}
                      </span>
                    }
                    extra={
                      <span style={{ 
                        background: item.status_code === 200 ? (_isLight ? 'rgba(82, 196, 26, 0.1)' : 'rgba(255,255,255,0.1)') : 'rgba(255,0,0,0.1)', 
                        color: item.status_code === 200 ? (_isLight ? '#52c41a' : '#ccc') : '#ff4d4f',
                        padding: '1px 6px', 
                        borderRadius: 4, 
                        fontSize: 11 
                      }}>
                        {item.status_code}
                      </span>
                    }
                  >
                    <CardRow compact={true} label={t('dashboard.recent_activity_time', { defaultValue: 'Time' })}>
                      <Text style={{ color: _isLight ? '#666' : '#888', fontSize: 12 }}>{dayjs(item.created_at).format('YYYY-MM-DD HH:mm:ss')}</Text>
                    </CardRow>
                    {isAdmin && (
                      <CardRow compact={true} label={t('dashboard.recent_activity_user', '用户')}>
                        <Text style={{ color: _isLight ? '#666' : '#888', fontSize: 12 }}>
                          {item.user_nickname || item.user_uid || item.user_id || '-'}
                        </Text>
                      </CardRow>
                    )}
                    <CardRow compact={true} label={t('dashboard.recent_activity_tokens', 'Tokens (In / Out)')}>
                      <Text style={{ color: _isLight ? '#666' : '#888', fontSize: 12 }}>{item.prompt_tokens} / {item.completion_tokens}</Text>
                    </CardRow>
                    <CardRow compact={true} label={t('dashboard.estimated_cost')}>
                      <Text style={{ color: _isLight ? '#333' : '#ccc', fontSize: 12, fontWeight: 500 }}>{currencySymbol}{(item.cost || 0).toFixed(6)}</Text>
                    </CardRow>
                  </MobileCard>
                )}
              />
            ) : (
              <Table
                dataSource={stats?.recent_logs || []}
                columns={columns}
                rowKey="id"
                pagination={false}
                size="middle"
                loading={loading}
                locale={{ emptyText: <Text style={{ color: _isLight ? '#999' : '#888' }}>{t('dashboard.no_data')}</Text> }}
                scroll={{ y: cardHeight - 48, x: 'max-content' }}
                style={{ borderRadius: 12, overflow: 'hidden', border: 'none' }}
              />
            )}
          </Card>
        </Col>
        
        <Col lg={10} xs={24}>
          <div style={{ height: 24, display: 'flex', alignItems: 'center', marginBottom: 16, gap: 8 }}>
            <Title level={5} style={{ color: _isLight ? '#1f2937' : '#fff', fontWeight: 500, margin: 0 }}>{t('dashboard.model_distribution')}</Title>
            <Text type="secondary" style={{ color: _isLight ? '#999' : '#666', fontSize: 12 }}>{modelDetailHint}</Text>
            <AntTooltip title="查看最近 30 天分布详细数据">
              <PieChartIcon 
                size={18}
                strokeWidth={2}
                className="shadcn-icon-btn"
                style={{ 
                  marginLeft: 2, 
                  color: _isLight ? '#000000' : '#ffffff', 
                  cursor: 'pointer' 
                }} 
                onClick={() => setIsModel30dModalVisible(true)}
              />
            </AntTooltip>
          </div>
          <Card 
            variant="borderless" 
            style={{ borderRadius: 12, height: screens.xs ? 'auto' : cardHeight, display: 'flex', flexDirection: 'column' }} 
            styles={{ body: { padding: '16px 20px', flex: 1, overflowY: 'hidden' } }}
          >
            <Spin spinning={loading}>
              <div 
                className="custom-scrollbar"
                style={{ 
                  height: screens.xs ? 'auto' : cardHeight - 64, 
                  overflowY: 'auto', 
                  paddingRight: 8 
                }}
              >
                {stats?.model_stats && stats.model_stats.length > 0 ? (
                  (() => {
                    const maxCost = stats.model_stats.reduce((max, item) => Math.max(max, item.total_cost), 0) || 1;
                    return stats.model_stats.map((item, index) => {
                      const percentage = (item.total_cost / maxCost) * 100;
                      return (
                        <div 
                          key={item.model} 
                          style={{ 
                            display: 'flex', 
                            flexDirection: 'column',
                            padding: '10px 2px',
                            borderBottom: index === stats.model_stats.length - 1 
                              ? 'none' 
                              : (_isLight ? '1px dashed #e8e8e8' : '1px dashed rgba(255, 255, 255, 0.08)'),
                            transition: 'all 0.3s ease',
                          }}
                        >
                          {/* Main Row */}
                          <div style={{ display: 'flex', alignItems: 'center' }}>
                            {/* Rank Badge */}
                            <div style={getRankBadgeStyle(index)}>{index + 1}</div>
                            
                            {/* Info & Progress bar */}
                            <div style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2, alignItems: 'center' }}>
                                <span style={{ fontWeight: 600, color: _isLight ? '#1f2937' : '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 13 }}>
                                  {item.model}
                                </span>
                                <span style={{ fontSize: 11, color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)', flexShrink: 0 }}>
                                  {t('dashboard.count_times', { count: item.count })}
                                </span>
                              </div>
                              {/* Progress Bar Container */}
                              <div style={{ 
                                height: 4, 
                                borderRadius: 2, 
                                background: _isLight ? '#f5f5f5' : 'rgba(255,255,255,0.06)', 
                                overflow: 'hidden' 
                              }}>
                                <div style={{ 
                                  height: '100%', 
                                  width: `${percentage}%`, 
                                  borderRadius: 2, 
                                  background: getBarColor(index),
                                  transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)' 
                                }} />
                              </div>
                            </div>

                            {/* Cost Display */}
                            <div style={{ width: 110, textAlign: 'right', flexShrink: 0 }}>
                              <span style={{ 
                                fontFamily: 'SFMono-Regular, Consolas, "Liberation Mono", Menlo, Courier, monospace', 
                                fontWeight: 700, 
                                color: index === 0 ? '#F5A623' : (_isLight ? '#1f2937' : '#fff'),
                                fontSize: 14 
                              }}>
                                {currencySymbol}{Number(item.total_cost).toFixed(6)}
                              </span>
                            </div>
                          </div>

                          {/* Last 3 Days Row */}
                          {item.last_three_days && item.last_three_days.length > 0 && (
                            <div style={{ 
                              display: 'flex', 
                              gap: 6, 
                              marginTop: 6, 
                              paddingLeft: 28, 
                              flexWrap: 'wrap' 
                            }}>
                              {item.last_three_days.map((day) => {
                                const dateLabel = day.date.slice(5);
                                return (
                                  <div 
                                    key={day.date} 
                                    style={{ 
                                      background: !_isLight ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)',
                                      borderRadius: 4,
                                      padding: '1px 6px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 4,
                                      fontSize: 10,
                                    }}
                                  >
                                    <span style={{ color: !_isLight ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)', fontWeight: 500 }}>
                                      {dateLabel}
                                    </span>
                                    <span style={{ color: index === 0 ? '#faad14' : textColor, fontFamily: 'monospace', fontWeight: 600 }}>
                                      {currencySymbol}{day.total_cost.toFixed(6)}
                                    </span>
                                    <span style={{ color: !_isLight ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)', fontSize: 9 }}>
                                      ({t('dashboard.times', { count: day.count })})
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()
                ) : (
                  <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: _isLight ? '#999' : '#888', minHeight: 400 }}>
                    {t('dashboard.no_data')}
                  </div>
                )}
              </div>
            </Spin>
          </Card>
        </Col>
      </Row>
      
      {/* Global override for table styles to ensure monochrome dark theme */}
      <style>{`
        .shadcn-icon-btn {
          opacity: 0.85;
          transition: all 0.2s ease-in-out;
        }
        .shadcn-icon-btn:hover {
          opacity: 1;
          transform: scale(1.08);
        }
        .shadcn-icon-btn:active {
          transform: scale(0.95);
        }
        .ant-progress-text {
          color: ${_isLight ? '#666' : '#888'} !important;
        }
        .compact-announcement p,
        .compact-announcement h1,
        .compact-announcement h2,
        .compact-announcement h3,
        .compact-announcement h4,
        .compact-announcement h5,
        .compact-announcement h6,
        .compact-announcement ul,
        .compact-announcement ol {
          margin: 0 !important;
          padding: 0 !important;
          line-height: 1.4 !important;
        }
        .compact-announcement p + p,
        .compact-announcement p + ul,
        .compact-announcement p + ol,
        .compact-announcement ul + p,
        .compact-announcement ol + p {
          margin-top: 3px !important;
        }
        .custom-scrollbar::-webkit-scrollbar,
        .ant-card-body::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track,
        .ant-card-body::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb,
        .ant-card-body::-webkit-scrollbar-thumb {
          background: ${_isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)'};
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover,
        .ant-card-body::-webkit-scrollbar-hover {
          background: ${_isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)'};
        }
      `}</style>
      
      <Modal
        closable={false}
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 16 }}>{t('dashboard.trend_30d_title', '最近 30 天数据趋势')}</span>
            <Space size="small">
              <Button 
                type="text" 
                icon={isFullscreenTrend ? <FullscreenExitOutlined /> : <ExpandAltOutlined />} 
                onClick={() => setIsFullscreenTrend(!isFullscreenTrend)} 
                style={{ color: _isLight ? '#666' : '#999' }}
              >
                {isFullscreenTrend ? t('dashboard.exit_fullscreen', '退出全屏') : t('dashboard.fullscreen', '全屏')}
              </Button>
              <Button 
                type="text" 
                icon={<CloseOutlined />} 
                onClick={() => {
                  setIsTrendModalVisible(false);
                  setIsFullscreenTrend(false);
                }} 
                style={{ color: _isLight ? '#666' : '#999' }}
              />
            </Space>
          </div>
        }
        open={isTrendModalVisible}
        onCancel={() => {
          setIsTrendModalVisible(false);
          setIsFullscreenTrend(false);
        }}
        footer={null}
        width={isFullscreenTrend ? '100vw' : 800}
        style={isFullscreenTrend ? { top: 0, padding: 0, margin: 0, maxWidth: '100vw' } : { top: 40 }}
        styles={{ 
          body: { 
            padding: '24px 0', 
            height: isFullscreenTrend ? 'calc(100vh - 55px)' : 'auto',
            background: _isLight ? '#fff' : '#141414',
          }
        }}
      >
        <div style={{ height: isFullscreenTrend ? 'calc(100vh - 120px)' : 400, width: '100%', padding: '0 24px' }}>
          {stats?.daily_trends && stats.daily_trends.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={stats.daily_trends} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={_isLight ? '#f0f0f0' : '#434343'} vertical={false} />
                <XAxis dataKey="date" stroke={textColor} tick={{fill: textColor}} tickLine={false} axisLine={false} />
                <YAxis yAxisId="left" stroke={textColor} tick={{fill: textColor}} tickLine={false} axisLine={false} />
                <YAxis yAxisId="right" orientation="right" stroke={textColor} tick={{fill: textColor}} tickLine={false} axisLine={false} tickFormatter={(value: number) => parseFloat(Number(value).toFixed(6)).toString()} />
                <Tooltip 
                  contentStyle={{ backgroundColor: isDark ? '#1f1f1f' : '#fff', color: textColor, borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }} 
                  formatter={(value: any, name: any) => [
                    name === t('dashboard.estimated_cost') ? `${currencySymbol}${parseFloat(Number(value).toFixed(6))}` : value,
                    name
                  ]}
                  cursor={{fill: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'}}
                />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: 20 }} />
                <Line yAxisId="left" type="monotone" dataKey="requests" stroke="#faad14" strokeWidth={3} name={t('dashboard.total_requests')} dot={false} />
                <Bar yAxisId="right" dataKey="cost" fill="#71717a" radius={[4, 4, 0, 0]} name={t('dashboard.estimated_cost')} barSize={18} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: _isLight ? '#999' : '#888' }}>
              {t('dashboard.no_data')}
            </div>
          )}
        </div>
      </Modal>

      <Modal
        closable={false}
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 16 }}>{t('dashboard.model_distribution_30d', '模型分布 (按成本) - 最近 30 天趋势')}</span>
            <Space size="small">
              <Button 
                type="text" 
                icon={isFullscreen30d ? <FullscreenExitOutlined /> : <ExpandAltOutlined />} 
                onClick={() => setIsFullscreen30d(!isFullscreen30d)} 
                style={{ color: _isLight ? '#666' : '#999' }}
              >
                {isFullscreen30d ? t('dashboard.exit_fullscreen', '退出全屏') : t('dashboard.fullscreen', '全屏')}
              </Button>
              <Button 
                type="text" 
                icon={<CloseOutlined />} 
                onClick={() => {
                  setIsModel30dModalVisible(false);
                  setIsFullscreen30d(false);
                }} 
                style={{ color: _isLight ? '#666' : '#999' }}
              />
            </Space>
          </div>
        }
        open={isModel30dModalVisible}
        onCancel={() => {
          setIsModel30dModalVisible(false);
          setIsFullscreen30d(false);
        }}
        footer={null}
        width={isFullscreen30d ? '100vw' : 1000}
        style={isFullscreen30d ? { top: 0, padding: 0, margin: 0, maxWidth: '100vw' } : { top: 40 }}
        styles={{ 
          body: { 
            padding: '24px', 
            height: isFullscreen30d ? 'calc(100vh - 55px)' : 650, 
            overflowY: 'auto',
            background: _isLight ? '#f5f5f5' : '#0a0a0a',
          }
        }}
      >
        <div className="custom-scrollbar" style={{ height: '100%', overflowX: 'hidden' }}>
          {modelStats30d && modelStats30d.top_models && Array.isArray(modelStats30d.top_models) && modelStats30d.top_models.length > 0 ? (
            <Row gutter={[24, 24]}>
              {modelStats30d.top_models.map((m, index) => {
                // 明暗双套高对比色，避免暗色下近黑线条/字不可见
                const colors = _isLight
                  ? ['#d97706', '#0284c7', '#16a34a', '#e11d48', '#0d9488', '#ca8a04', '#ea580c', '#2563eb', '#64748b', '#0891b2']
                  : ['#fbbf24', '#38bdf8', '#4ade80', '#fb7185', '#2dd4bf', '#facc15', '#fb923c', '#60a5fa', '#94a3b8', '#22d3ee'];
                const strokeColor = colors[index % colors.length];
                const axisColor = _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.55)';
                const modelData = chartData30d.map(d => ({ date: d.date, cost: d[m.model] || 0 }));
                return (
                  <Col xs={24} lg={12} xl={isFullscreen30d ? 8 : 12} key={m.model}>
                    <Card 
                      bordered={false}
                      style={{ 
                        background: _isLight ? '#fff' : '#141414', 
                        borderRadius: 12,
                        border: _isLight ? 'none' : '1px solid rgba(255,255,255,0.06)',
                        boxShadow: _isLight ? '0 1px 2px 0 rgba(0, 0, 0, 0.03), 0 1px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px 0 rgba(0, 0, 0, 0.02)' : 'none'
                      }}
                      styles={{ body: { padding: '20px 24px' } }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                          <span style={{ 
                            display: 'inline-block', width: 12, height: 12, borderRadius: '50%', backgroundColor: strokeColor, flexShrink: 0,
                          }} />
                          <Title level={4} style={{ margin: 0, color: _isLight ? '#1f2937' : '#fafafa', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {m.model}
                          </Title>
                        </div>
                      </div>
                      
                      <Row gutter={16} style={{ marginBottom: 20 }}>
                        <Col span={12}>
                          <Statistic 
                            title={<span style={{ color: axisColor, fontSize: 13 }}>{t('dashboard.total_spend', '总花费')}</span>} 
                            value={m.total_cost} 
                            precision={6}
                            prefix={currencySymbol}
                            valueStyle={{ color: strokeColor, fontWeight: 600, fontSize: 22 }} 
                          />
                        </Col>
                        <Col span={12}>
                          <Statistic 
                            title={<span style={{ color: axisColor, fontSize: 13 }}>{t('dashboard.call_count', '调用次数')}</span>} 
                            value={m.count} 
                            valueStyle={{ color: _isLight ? '#434343' : '#e5e5e5', fontWeight: 600, fontSize: 22 }} 
                          />
                        </Col>
                      </Row>

                      <div style={{ height: 180, width: '100%' }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={modelData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={_isLight ? '#f0f0f0' : 'rgba(255,255,255,0.08)'} vertical={false} />
                            <XAxis
                              dataKey="date"
                              stroke={axisColor}
                              tick={{ fontSize: 11, fill: axisColor }}
                              tickLine={false}
                              axisLine={false}
                            />
                            <YAxis
                              stroke={axisColor}
                              tick={{ fontSize: 11, fill: axisColor }}
                              tickLine={false}
                              axisLine={false}
                              tickFormatter={(value: number) => parseFloat(Number(value).toFixed(6)).toString()}
                            />
                            <Tooltip 
                              formatter={(value: any) => [`${currencySymbol}${parseFloat(Number(value).toFixed(6))}`, t('dashboard.estimated_cost')]}
                              contentStyle={{
                                backgroundColor: isDark ? '#1c1c1f' : '#fff',
                                color: textColor,
                                borderRadius: 8,
                                border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid #eee',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                              }}
                              labelStyle={{ color: textColor }}
                              itemStyle={{ color: textColor }}
                              cursor={{ stroke: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)' }}
                            />
                            <Line type="monotone" dataKey="cost" stroke={strokeColor} strokeWidth={2.5} dot={false} activeDot={{ r: 5, strokeWidth: 0, fill: strokeColor }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </Card>
                  </Col>
                );
              })}
            </Row>
          ) : (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: _isLight ? '#999' : '#888' }}>
              {loading30d ? <Spin size="large" /> : t('dashboard.no_data')}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default Dashboard;
