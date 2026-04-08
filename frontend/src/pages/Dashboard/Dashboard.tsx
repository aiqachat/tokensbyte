import React, { useEffect, useState } from 'react';
import { Row, Col, Card, Statistic, Typography, Table, Tag, Space, List, Progress } from 'antd';
import {
  RocketOutlined,
  ThunderboltOutlined,
  DollarOutlined,
  KeyOutlined,
} from '@ant-design/icons';
import request from '../../utils/request';
import type { DashboardStats, RequestLog } from '../../types';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    fetchStats();
    const timer = setInterval(fetchStats, 30000); // 30s refresh
    return () => clearInterval(timer);
  }, []);

  const columns = [
    {
      title: 'Time',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (text: string) => dayjs(text).format('MM-DD HH:mm:ss'),
    },
    {
      title: 'Model',
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
      title: 'Cost',
      dataIndex: 'cost',
      key: 'cost',
      render: (val: number) => `$${val.toFixed(4)}`,
    },
    {
      title: 'Status',
      dataIndex: 'status_code',
      key: 'status_code',
      render: (code: number) => (
        <Tag color={code === 200 ? 'success' : 'error'}>{code}</Tag>
      ),
    },
  ];

  return (
    <div>
      <Title level={2} style={{ marginBottom: 24 }}>System Overview</Title>
      
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} loading={loading}>
            <Statistic
              title="Total Requests"
              value={stats?.total_requests || 0}
              prefix={<ThunderboltOutlined />}
              valueStyle={{ color: '#1677ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} loading={loading}>
            <Statistic
              title="Total Tokens"
              value={stats?.total_tokens || 0}
              prefix={<RocketOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} loading={loading}>
            <Statistic
              title="Estimated Cost"
              value={stats?.total_cost || 0}
              prefix={<DollarOutlined />}
              precision={4}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} loading={loading}>
            <Statistic
              title="Active Tokens"
              value={stats?.active_tokens || 0}
              prefix={<KeyOutlined />}
              valueStyle={{ color: '#13c2c2' }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        <Col lg={16} xs={24}>
          <Card title="Recent Activity" bordered={false} extra={<Text type="secondary">Auto-refresh: 30s</Text>}>
            <Table
              dataSource={stats?.recent_logs || []}
              columns={columns}
              rowKey="id"
              pagination={false}
              size="middle"
              loading={loading}
            />
          </Card>
        </Col>
        <Col lg={8} xs={24}>
          <Card title="Model Distribution (by Cost)" bordered={false} style={{ height: '100%' }}>
            <List
              dataSource={stats?.model_stats || []}
              loading={loading}
              renderItem={(item) => {
                const percentage = stats?.total_cost ? (item.total_cost / stats.total_cost) * 100 : 0;
                return (
                  <List.Item>
                    <div style={{ width: '100%' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Tag color="blue">{item.model}</Tag>
                        <Text strong>${item.total_cost.toFixed(4)}</Text>
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
