import React, { useEffect, useState } from 'react';
import { Row, Col, Card, Typography, Table, Space, List, Progress, Alert, Grid, Spin, Modal, Button, Statistic, Divider, Tooltip as AntTooltip } from 'antd';
import MobileCardList, { MobileCard, CardRow } from '../../components/MobileCardList';
import {
  ExpandAltOutlined,
  BarChartOutlined,
  DatabaseOutlined,
  AccountBookOutlined,
  KeyOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import { LineChart as LineChartIcon, PieChart as PieChartIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';
import useSettingsStore from '../../store/settings';
import { useThemeStore } from '../../store/theme';
import type { DashboardStats, RequestLog, Announcement, ModelTrend30dResponse } from '../../types';
import dayjs from 'dayjs';
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
  const { t } = useTranslation();
  const screens = Grid.useBreakpoint();
  const { settings } = useSettingsStore();
  const { themeMode } = useThemeStore();
  const _isLight = themeMode === 'light';
  const currencySymbol = settings?.currency?.currency_symbol || '$';
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [pinnedAnnouncement, setPinnedAnnouncement] = useState<Announcement | null>(null);
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
        entry[item.model] = parseFloat(item.total_cost.toFixed(4));
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
    return 'linear-gradient(90deg, #1677ff 0%, #40a9ff 100%)';
  };

  const fetchStats = async () => {
    try {
      const data = await (request.get<DashboardStats>('/dashboard') as unknown as Promise<DashboardStats>);
      setStats(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAnnouncement = async () => {
    try {
      const response = await (request.get('/announcements/public') as any);
      if (response.data && response.data.length > 0) {
        const pinned = response.data.find((a: Announcement) => a.is_pinned === 1);
        if (pinned) {
          setPinnedAnnouncement(pinned);
        }
      }
    } catch (e) {}
  };

  useEffect(() => {
    fetchStats();
    fetchAnnouncement();
    const timer = setInterval(fetchStats, 30000); // 30s refresh
    return () => clearInterval(timer);
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
      render: (val: number) => <Text style={{ color: _isLight ? '#333' : '#ccc', fontSize: 13 }}>{currencySymbol}{val.toFixed(4)}</Text>,
    },
  ];

  const cardStyle: React.CSSProperties = {
    height: screens.xs ? 160 : 200,
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    borderRadius: 12,
  };

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
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: pinnedAnnouncement ? 16 : 24 }}>
        <Title level={2} style={{ margin: 0, fontWeight: 600, color: _isLight ? '#1f2937' : '#E8EAED' }}>
          {t('dashboard.title')}
        </Title>
        <AntTooltip title="查看 30 天趋势">
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
            background: _isLight ? 'rgba(22, 119, 255, 0.03)' : 'rgba(22, 119, 255, 0.06)',
            border: _isLight ? '1px solid rgba(22, 119, 255, 0.12)' : '1px solid rgba(22, 119, 255, 0.18)',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)',
          }}
        >
          {/* Custom Info Icon */}
          <div style={{ display: 'flex', alignItems: 'center', height: '18px', color: '#1677ff', flexShrink: 0 }}>
            <svg viewBox="0 0 1024 1024" width="14" height="14" fill="currentColor" style={{ verticalAlign: 'middle' }}>
              <path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm32 664c0 4.4-3.6 8-8 8h-48c-4.4 0-8-3.6-8-8V456c0-4.4 3.6-8 8-8h48c-4.4 0-8 3.6-8 8v272zm-32-344c-22.1 0-40-17.9-40-40s17.9-40 40-40 40 17.9 40 40-17.9 40-40 40z" />
            </svg>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontWeight: 600, fontSize: '13px', color: _isLight ? '#1f2937' : '#f3f4f6', lineHeight: '1.4' }}>
              {pinnedAnnouncement.title}
            </span>
            <div 
              className="quill-content compact-announcement" 
              dangerouslySetInnerHTML={{ __html: pinnedAnnouncement.content }} 
              style={{ 
                fontSize: '12px', 
                lineHeight: '1.4', 
                color: _isLight ? '#4b5563' : '#d1d5db' 
              }}
            />
          </div>
        </div>
      )}

      {/* Main Stats Cards */}
      <Row gutter={[16, 16]}>
        <Col xs={12} sm={12} lg={6}>
          <Card 
            variant="borderless" 
            style={cardStyle} 
            styles={{ body: { padding: screens.xs ? 16 : 24, height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' } }}
          >
            {/* Background Icon */}
            <BarChartOutlined style={backgroundIconStyle} />
            
            {/* Content Container */}
            <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
              <Text style={{ color: _isLight ? '#666' : '#888', fontSize: screens.xs ? 12 : 14, fontWeight: 500 }}>{t('dashboard.total_requests')}</Text>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, margin: '8px 0 0 0' }}>
                <Title level={2} style={{ margin: 0, color: _isLight ? '#1f2937' : '#fff', fontWeight: 500, fontSize: screens.xs ? 18 : 30, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={String(stats?.total_requests || 0)}>{stats?.total_requests || 0}</Title>
                <Text style={{ color: _isLight ? '#666' : '#888', fontSize: screens.xs ? 11 : 13 }}>今日: {stats?.today_requests || 0}</Text>
                <Text style={{ color: _isLight ? '#666' : '#888', fontSize: screens.xs ? 11 : 13 }}>昨日: {stats?.yesterday_requests || 0}</Text>
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
            {/* Background Icon */}
            <DatabaseOutlined style={backgroundIconStyle} />
            
            {/* Content Container */}
            <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
              <Text style={{ color: _isLight ? '#666' : '#888', fontSize: screens.xs ? 12 : 14, fontWeight: 500 }}>{t('dashboard.total_tokens')}</Text>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, margin: '8px 0 0 0' }}>
                <Title level={2} style={{ margin: 0, color: _isLight ? '#1f2937' : '#fff', fontWeight: 500, fontSize: screens.xs ? 18 : 30, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={stats?.total_tokens?.toLocaleString() || '0'}>{stats?.total_tokens?.toLocaleString() || 0}</Title>
                <Text style={{ color: _isLight ? '#666' : '#888', fontSize: screens.xs ? 11 : 13 }}>今日: {stats?.today_tokens?.toLocaleString() || 0}</Text>
                <Text style={{ color: _isLight ? '#666' : '#888', fontSize: screens.xs ? 11 : 13 }}>昨日: {stats?.yesterday_tokens?.toLocaleString() || 0}</Text>
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
            {/* Background Icon */}
            <AccountBookOutlined style={backgroundIconStyle} />
            
            {/* Content Container */}
            <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
              <Text style={{ color: _isLight ? '#666' : '#888', fontSize: screens.xs ? 12 : 14, fontWeight: 500 }}>{t('dashboard.estimated_cost')}</Text>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, margin: '8px 0 0 0' }}>
                <Title level={2} style={{ margin: 0, color: _isLight ? '#1f2937' : '#fff', fontWeight: 500, fontSize: screens.xs ? 18 : 30, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={`${currencySymbol}${stats?.total_cost?.toFixed(4) || 0}`}>{currencySymbol}{stats?.total_cost?.toFixed(4) || 0}</Title>
                <Text style={{ color: _isLight ? '#666' : '#888', fontSize: screens.xs ? 11 : 13 }}>今日: {currencySymbol}{(stats?.today_cost || 0).toFixed(4)}</Text>
                <Text style={{ color: _isLight ? '#666' : '#888', fontSize: screens.xs ? 11 : 13 }}>昨日: {currencySymbol}{(stats?.yesterday_cost || 0).toFixed(4)}</Text>
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
            {/* Background Icon */}
            <KeyOutlined style={backgroundIconStyle} />
            
            {/* Content Container */}
            <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
              <Text style={{ color: _isLight ? '#666' : '#888', fontSize: screens.xs ? 12 : 14, fontWeight: 500 }}>{t('dashboard.total_api_tokens', '总令牌')}</Text>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, margin: '8px 0 0 0' }}>
                <Title level={2} style={{ margin: 0, color: _isLight ? '#1f2937' : '#fff', fontWeight: 500, fontSize: screens.xs ? 18 : 30, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={String(stats?.total_api_tokens || 0)}>{stats?.total_api_tokens || 0}</Title>
                <Text style={{ color: _isLight ? '#666' : '#888', fontSize: screens.xs ? 11 : 13 }}>今日活跃: {stats?.today_active_tokens || 0}</Text>
                <Text style={{ color: _isLight ? '#666' : '#888', fontSize: screens.xs ? 11 : 13 }}>昨日活跃: {stats?.yesterday_active_tokens || 0}</Text>
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
                    <CardRow compact={true} label="Tokens (In / Out)">
                      <Text style={{ color: _isLight ? '#666' : '#888', fontSize: 12 }}>{item.prompt_tokens} / {item.completion_tokens}</Text>
                    </CardRow>
                    <CardRow compact={true} label={t('dashboard.estimated_cost')}>
                      <Text style={{ color: _isLight ? '#333' : '#ccc', fontSize: 12, fontWeight: 500 }}>{currencySymbol}{(item.cost || 0).toFixed(4)}</Text>
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
          <div style={{ height: 24, display: 'flex', alignItems: 'center', marginBottom: 16 }}>
            <Title level={5} style={{ color: _isLight ? '#1f2937' : '#fff', fontWeight: 500, margin: 0 }}>{t('dashboard.model_distribution')}</Title>
            <AntTooltip title="查看最近 30 天分布详细数据">
              <PieChartIcon 
                size={18}
                strokeWidth={2}
                className="shadcn-icon-btn"
                style={{ 
                  marginLeft: 10, 
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
                                  共 {item.count.toLocaleString()} 次
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
                                {currencySymbol}{Number(item.total_cost).toFixed(4)}
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
                                      {currencySymbol}{day.total_cost.toFixed(2)}
                                    </span>
                                    <span style={{ color: !_isLight ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)', fontSize: 9 }}>
                                      ({day.count}次)
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
            <span style={{ fontSize: 16 }}>最近 30 天数据趋势</span>
            <Space size="small">
              <Button 
                type="text" 
                icon={isFullscreenTrend ? <FullscreenExitOutlined /> : <ExpandAltOutlined />} 
                onClick={() => setIsFullscreenTrend(!isFullscreenTrend)} 
                style={{ color: _isLight ? '#666' : '#999' }}
              >
                {isFullscreenTrend ? '退出全屏' : '全屏'}
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
                <YAxis yAxisId="right" orientation="right" stroke={textColor} tick={{fill: textColor}} tickLine={false} axisLine={false} tickFormatter={(value: number) => parseFloat(Number(value).toFixed(4)).toString()} />
                <Tooltip 
                  contentStyle={{ backgroundColor: isDark ? '#1f1f1f' : '#fff', color: textColor, borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }} 
                  formatter={(value: any, name: any) => [
                    name === '预估成本' ? `${currencySymbol}${parseFloat(Number(value).toFixed(4))}` : value,
                    name
                  ]}
                  cursor={{fill: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'}}
                />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: 20 }} />
                <Line yAxisId="left" type="monotone" dataKey="requests" stroke="#faad14" strokeWidth={3} name="总请求数" dot={false} />
                <Bar yAxisId="right" dataKey="cost" fill="#1677ff" radius={[4, 4, 0, 0]} name="预估成本" barSize={18} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: _isLight ? '#999' : '#888' }}>
              暂无数据
            </div>
          )}
        </div>
      </Modal>

      <Modal
        closable={false}
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 16 }}>模型分布 (按成本) - 最近 30 天趋势</span>
            <Space size="small">
              <Button 
                type="text" 
                icon={isFullscreen30d ? <FullscreenExitOutlined /> : <ExpandAltOutlined />} 
                onClick={() => setIsFullscreen30d(!isFullscreen30d)} 
                style={{ color: _isLight ? '#666' : '#999' }}
              >
                {isFullscreen30d ? '退出全屏' : '全屏'}
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
            background: _isLight ? '#f5f5f5' : '#000',
          }
        }}
      >
        <div className="custom-scrollbar" style={{ height: '100%', overflowX: 'hidden' }}>
          {modelStats30d && modelStats30d.top_models && Array.isArray(modelStats30d.top_models) && modelStats30d.top_models.length > 0 ? (
            <Row gutter={[24, 24]}>
              {modelStats30d.top_models.map((m, index) => {
                const colors = ['#1677ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2', '#eb2f96', '#fa8c16', '#a0d911', '#2f54eb'];
                const strokeColor = colors[index % 10];
                const modelData = chartData30d.map(d => ({ date: d.date, cost: d[m.model] || 0 }));
                return (
                  <Col xs={24} lg={12} xl={isFullscreen30d ? 8 : 12} key={m.model}>
                    <Card 
                      bordered={false}
                      style={{ 
                        background: _isLight ? '#fff' : '#141414', 
                        borderRadius: 12, 
                        boxShadow: _isLight ? '0 1px 2px 0 rgba(0, 0, 0, 0.03), 0 1px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px 0 rgba(0, 0, 0, 0.02)' : 'none'
                      }}
                      bodyStyle={{ padding: '20px 24px' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ 
                            display: 'inline-block', width: 14, height: 14, borderRadius: '50%', backgroundColor: strokeColor,
                            boxShadow: `0 0 8px ${strokeColor}40`
                          }} />
                          <Title level={4} style={{ margin: 0, color: _isLight ? '#1f2937' : '#fff', fontWeight: 600 }}>
                            {m.model}
                          </Title>
                        </div>
                      </div>
                      
                      <Row gutter={16} style={{ marginBottom: 20 }}>
                        <Col span={12}>
                          <Statistic 
                            title={<span style={{ color: _isLight ? '#8c8c8c' : '#666', fontSize: 13 }}>总花费</span>} 
                            value={m.total_cost} 
                            precision={4}
                            prefix={currencySymbol}
                            valueStyle={{ color: strokeColor, fontWeight: 600, fontSize: 24 }} 
                          />
                        </Col>
                        <Col span={12}>
                          <Statistic 
                            title={<span style={{ color: _isLight ? '#8c8c8c' : '#666', fontSize: 13 }}>调用次数</span>} 
                            value={m.count} 
                            valueStyle={{ color: _isLight ? '#434343' : '#d9d9d9', fontWeight: 600, fontSize: 24 }} 
                          />
                        </Col>
                      </Row>

                      <div style={{ height: 180, width: '100%' }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={modelData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={_isLight ? '#f0f0f0' : '#303030'} vertical={false} />
                            <XAxis dataKey="date" stroke={_isLight ? '#8c8c8c' : '#666'} tick={{fontSize: 11}} tickLine={false} axisLine={false} />
                            <YAxis stroke={_isLight ? '#8c8c8c' : '#666'} tick={{fontSize: 11}} tickLine={false} axisLine={false} tickFormatter={(value: number) => parseFloat(Number(value).toFixed(4)).toString()} />
                            <Tooltip 
                              formatter={(value: any) => [`${currencySymbol}${parseFloat(Number(value).toFixed(4))}`, '预估成本']}
                              contentStyle={{ backgroundColor: isDark ? '#1f1f1f' : '#fff', color: textColor, borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }} 
                              cursor={{stroke: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}}
                            />
                            <Line type="monotone" dataKey="cost" stroke={strokeColor} strokeWidth={2.5} dot={false} activeDot={{ r: 6, strokeWidth: 0 }} />
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
              {loading30d ? <Spin size="large" /> : '暂无数据'}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default Dashboard;
