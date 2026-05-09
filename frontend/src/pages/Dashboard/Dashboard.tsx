import React, { useEffect, useState } from 'react';
import { Row, Col, Card, Typography, Table, Space, List, Progress, Alert } from 'antd';
import {
  ExpandAltOutlined,
  BarChartOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';
import useSettingsStore from '../../store/settings';
import { useThemeStore } from '../../store/theme';
import type { DashboardStats, RequestLog, Announcement } from '../../types';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const Dashboard: React.FC = () => {
  const { t } = useTranslation();
  const { settings } = useSettingsStore();
  const { themeMode } = useThemeStore();
  const _isLight = themeMode === 'light';
  const currencySymbol = settings?.currency?.currency_symbol || '$';
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [pinnedAnnouncement, setPinnedAnnouncement] = useState<Announcement | null>(null);

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
      dataIndex: 'created_at',
      key: 'created_at',
      render: (text: string) => <Text style={{ color: _isLight ? '#666' : '#888', fontSize: 13 }}>{dayjs(text).format('YYYY-MM-DD HH:mm:ss')}</Text>,
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
    {
      title: t('common.status'),
      dataIndex: 'status_code',
      key: 'status_code',
      render: (code: number) => (
        <span style={{ 
          background: code === 200 ? (_isLight ? 'rgba(82, 196, 26, 0.1)' : 'rgba(255,255,255,0.1)') : 'rgba(255,0,0,0.1)', 
          color: code === 200 ? (_isLight ? '#52c41a' : '#ccc') : '#ff4d4f',
          padding: '2px 8px', 
          borderRadius: 4, 
          fontSize: 12 
        }}>
          {code}
        </span>
      ),
    },
  ];

  const cardStyle: React.CSSProperties = {
    height: 200,
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    borderRadius: 12,
  };

  const renderChartOrEmpty = (hasData: boolean) => (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: hasData ? (_isLight ? 0.3 : 0.6) : (_isLight ? 0.1 : 0.3), marginTop: 20 }}>
      <BarChartOutlined style={{ fontSize: 40, color: _isLight ? '#333' : '#555', marginBottom: 12 }} />
      {!hasData && <Text style={{ color: _isLight ? '#666' : '#888', fontSize: 13 }}>{t('dashboard.no_data', 'No data')}</Text>}
    </div>
  );

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <Title level={2} style={{ marginBottom: pinnedAnnouncement ? 16 : 24, fontWeight: 600, color: _isLight ? '#1f2937' : '#E8EAED' }}>
        {t('dashboard.title')}
      </Title>

      {pinnedAnnouncement && (
        <Alert
          message={<span style={{ fontWeight: 600 }}>{pinnedAnnouncement.title}</span>}
          description={<div className="quill-content" dangerouslySetInnerHTML={{ __html: pinnedAnnouncement.content }} />}
          type="info"
          showIcon
          style={{ 
            marginBottom: 24, 
            borderRadius: 12, 
            background: _isLight ? 'rgba(22,119,255,0.05)' : 'rgba(22,119,255,0.05)', 
            border: _isLight ? '1px solid rgba(22,119,255,0.2)' : '1px solid rgba(22,119,255,0.2)',
            color: _isLight ? '#333' : '#ccc'
          }}
        />
      )}

      {/* Main Stats Cards */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card variant="borderless" style={cardStyle} styles={{ body: { padding: 24, height: '100%', display: 'flex', flexDirection: 'column' } }}>
            <Text style={{ color: _isLight ? '#666' : '#888', fontSize: 14, fontWeight: 500 }}>{t('dashboard.total_requests')}</Text>
            <Title level={2} style={{ margin: '8px 0 0 0', color: _isLight ? '#1f2937' : '#fff', fontWeight: 500 }}>{stats?.total_requests || 0}</Title>
            {renderChartOrEmpty((stats?.total_requests || 0) > 0)}
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card variant="borderless" style={cardStyle} styles={{ body: { padding: 24, height: '100%', display: 'flex', flexDirection: 'column' } }}>
            <Text style={{ color: _isLight ? '#666' : '#888', fontSize: 14, fontWeight: 500 }}>{t('dashboard.total_tokens')}</Text>
            <Title level={2} style={{ margin: '8px 0 0 0', color: _isLight ? '#1f2937' : '#fff', fontWeight: 500 }}>{stats?.total_tokens?.toLocaleString() || 0}</Title>
            {renderChartOrEmpty((stats?.total_tokens || 0) > 0)}
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card variant="borderless" style={cardStyle} styles={{ body: { padding: 24, height: '100%', display: 'flex', flexDirection: 'column' } }}>
            <Text style={{ color: _isLight ? '#666' : '#888', fontSize: 14, fontWeight: 500 }}>{t('dashboard.estimated_cost')}</Text>
            <Title level={2} style={{ margin: '8px 0 0 0', color: _isLight ? '#1f2937' : '#fff', fontWeight: 500 }}>{currencySymbol}{stats?.total_cost?.toFixed(4) || 0}</Title>
            {renderChartOrEmpty((stats?.total_cost || 0) > 0)}
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card variant="borderless" style={cardStyle} styles={{ body: { padding: 24, height: '100%', display: 'flex', flexDirection: 'column' } }}>
            <Text style={{ color: _isLight ? '#666' : '#888', fontSize: 14, fontWeight: 500 }}>{t('dashboard.active_tokens')}</Text>
            <Title level={2} style={{ margin: '8px 0 0 0', color: _isLight ? '#1f2937' : '#fff', fontWeight: 500 }}>{stats?.active_tokens || 0}</Title>
            {renderChartOrEmpty((stats?.active_tokens || 0) > 0)}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        <Col lg={16} xs={24}>
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
            <Title level={5} style={{ color: _isLight ? '#1f2937' : '#fff', fontWeight: 500, margin: 0 }}>{t('dashboard.recent_activity')}</Title>
            <Text type="secondary" style={{ color: _isLight ? '#999' : '#666', fontSize: 13 }}>{t('dashboard.auto_refresh')}</Text>
          </div>
          <Card variant="borderless" style={{ padding: 0 }} styles={{ body: { padding: 0 } }}>
            <Table
              dataSource={stats?.recent_logs || []}
              columns={columns}
              rowKey="id"
              pagination={false}
              size="middle"
              loading={loading}
              locale={{ emptyText: <Text style={{ color: _isLight ? '#999' : '#888' }}>{t('dashboard.no_data')}</Text> }}
              scroll={{ x: 'max-content' }}
              style={{ borderRadius: 12, overflow: 'hidden', border: _isLight ? '1px solid rgba(0,0,0,0.06)' : 'none' }}
            />
          </Card>
        </Col>
        
        <Col lg={8} xs={24}>
          <div style={{ marginBottom: 16 }}>
            <Title level={5} style={{ color: _isLight ? '#1f2937' : '#fff', fontWeight: 500, margin: 0 }}>{t('dashboard.model_distribution')}</Title>
          </div>
          <Card variant="borderless" style={{ borderRadius: 12, height: 'calc(100% - 38px)' }} styles={{ body: { padding: 16 } }}>
            <List
              dataSource={stats?.model_stats || []}
              loading={loading}
              locale={{ emptyText: <Text style={{ color: _isLight ? '#999' : '#888' }}>{t('dashboard.no_data')}</Text> }}
              renderItem={(item) => {
                const percentage = stats?.total_cost ? (item.total_cost / stats.total_cost) * 100 : 0;
                return (
                  <List.Item style={{ borderBottom: _isLight ? '1px solid rgba(0,0,0,0.04)' : '1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ width: '100%' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ background: _isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: 4, color: _isLight ? '#333' : '#ccc', fontSize: 12 }}>
                          {item.model}
                        </span>
                        <Text style={{ color: _isLight ? '#333' : '#fff', fontSize: 13 }}>{currencySymbol}{item.total_cost.toFixed(4)}</Text>
                      </div>
                      <Progress 
                        percent={Math.round(percentage)} 
                        size="small" 
                        showInfo={true}
                        strokeColor={_isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)'} 
                        trailColor={_isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)'}
                      />
                    </div>
                  </List.Item>
                );
              }}
            />
          </Card>
        </Col>
      </Row>
      
      {/* Global override for table styles to ensure monochrome dark theme */}
      <style>{`
        .ant-progress-text {
          color: ${_isLight ? '#666' : '#888'} !important;
        }
      `}</style>
    </div>
  );
};

export default Dashboard;
