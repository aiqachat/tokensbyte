import React, { useEffect, useState } from 'react';
import { Row, Col, Card, Statistic, Typography, Table, Tag, Space, List, Progress, Alert } from 'antd';
import {
  RocketOutlined,
  ThunderboltOutlined,
  DollarOutlined,
  KeyOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';
import useSettingsStore from '../../store/settings';
import type { DashboardStats, RequestLog, Announcement } from '../../types';
import dayjs from 'dayjs';

const { Title, Text, Paragraph } = Typography;

const Dashboard: React.FC = () => {
  const { t } = useTranslation();
  const { settings } = useSettingsStore();
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
      render: (text: string) => dayjs(text).format('MM-DD HH:mm:ss'),
    },
    {
      title: t('channels.type'),
      dataIndex: 'model',
      key: 'model',
      render: (text: string) => <Tag color="blue">{text}</Tag>,
    },
    {
      title: 'Tokens',
      key: 'tokens',
      render: (log: RequestLog) => (
        <Space direction="vertical" size={0}>
          <Text type="secondary" style={{ fontSize: 12 }}>In: {log.prompt_tokens}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>Out: {log.completion_tokens}</Text>
        </Space>
      ),
    },
    {
      title: t('dashboard.estimated_cost'),
      dataIndex: 'cost',
      key: 'cost',
      render: (val: number) => `${currencySymbol}${val.toFixed(4)}`,
    },
    {
      title: t('common.status'),
      dataIndex: 'status_code',
      key: 'status_code',
      render: (code: number) => (
        <Tag color={code === 200 ? 'success' : 'error'}>{code}</Tag>
      ),
    },
  ];

  return (
    <div>
      <Title level={2} style={{ marginBottom: pinnedAnnouncement ? 16 : 24 }}>{t('dashboard.title')}</Title>

      {pinnedAnnouncement && (
        <Alert
          message={<span style={{ fontWeight: 600 }}>{pinnedAnnouncement.title}</span>}
          description={<div className="quill-content" dangerouslySetInnerHTML={{ __html: pinnedAnnouncement.content }} />}
          type="info"
          showIcon
          style={{ marginBottom: 24, borderRadius: 12, border: '1px solid #1677ff33' }}
        />
      )}
      
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card variant="borderless" loading={loading}>
            <Statistic
              title={t('dashboard.total_requests')}
              value={stats?.total_requests || 0}
              prefix={<ThunderboltOutlined />}
              styles={{ content: { color: '#1677ff' } }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card variant="borderless" loading={loading}>
            <Statistic
              title={t('dashboard.total_tokens')}
              value={stats?.total_tokens || 0}
              prefix={<RocketOutlined />}
              styles={{ content: { color: '#52c41a' } }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card variant="borderless" loading={loading}>
            <Statistic
              title={t('dashboard.estimated_cost')}
              value={stats?.total_cost || 0}
              prefix={currencySymbol}
              precision={4}
              styles={{ content: { color: '#faad14' } }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card variant="borderless" loading={loading}>
            <Statistic
              title={t('dashboard.active_tokens')}
              value={stats?.active_tokens || 0}
              prefix={<KeyOutlined />}
              styles={{ content: { color: '#13c2c2' } }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        <Col lg={16} xs={24}>
          <Card title={t('dashboard.recent_activity')} variant="borderless" extra={<Text type="secondary">{t('dashboard.auto_refresh')}</Text>}>
            <Table
              dataSource={stats?.recent_logs || []}
              columns={columns}
              rowKey="id"
              pagination={false}
              size="middle"
              loading={loading}
              locale={{ emptyText: t('dashboard.no_data') }}
              scroll={{ x: 'max-content' }}
            />
          </Card>
        </Col>
        <Col lg={8} xs={24}>
          <Card title={t('dashboard.model_distribution')} variant="borderless" style={{ height: '100%' }}>
            <List
              dataSource={stats?.model_stats || []}
              loading={loading}
              locale={{ emptyText: t('dashboard.no_data') }}
              renderItem={(item) => {
                const percentage = stats?.total_cost ? (item.total_cost / stats.total_cost) * 100 : 0;
                return (
                  <List.Item>
                    <div style={{ width: '100%' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Tag color="blue">{item.model}</Tag>
                        <Text strong>{currencySymbol}{item.total_cost.toFixed(4)}</Text>
                      </div>
                      <Progress percent={Math.round(percentage)} size="small" status="active" />
                    </div>
                  </List.Item>
                );
              }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Dashboard;

