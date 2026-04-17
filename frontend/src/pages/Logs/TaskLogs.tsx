import React, { useState, useEffect } from 'react';
import { Table, Tag, Progress, Button, Space, Typography, DatePicker, Input, Row, Col, Form, message, Grid } from 'antd';
import MobileCardList, { MobileCard, CardRow, CardActions } from '../../components/MobileCardList';
import { SyncOutlined, ExperimentOutlined } from '@ant-design/icons';
import request from '../../utils/request';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';

const { RangePicker } = DatePicker;
const { Text } = Typography;
const { useBreakpoint } = Grid;

interface TaskLog {
  id: number;
  user_id: string;
  channel_id: number;
  platform: string;
  action_type: string;
  task_id: string;
  status: string;
  progress: number;
  submit_time: string;
  end_time: string;
  time_spent: number;
  details: string;
  created_at: string;
}

const TaskLogs: React.FC = () => {
  const { t } = useTranslation();
  const [data, setData] = useState<TaskLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [form] = Form.useForm();
  const screens = useBreakpoint();

  const fetchLogs = async (current = 1, size = 20) => {
    setLoading(true);
    try {
      const values = form.getFieldsValue();
      const params: any = {
        page: current,
        per_page: size,
        task_id: values.task_id,
        channel_id: values.channel_id,
      };

      if (values.dateRange) {
        params.start_date = values.dateRange[0].format('YYYY-MM-DD');
        params.end_date = values.dateRange[1].format('YYYY-MM-DD');
      }

      const res = await (request.get('/task_logs', { params }) as any);
      setData(res.data);
      setTotal(res.total);
      setPage(current);
      setPageSize(size);
    } catch (error) {
      console.error(error);
      message.error('获取任务日志失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const handleMockGenerate = async () => {
    try {
      setLoading(true);
      await request.post('/task_logs/mock');
      message.success('已模拟生成一条任务记录');
      fetchLogs(1, pageSize);
    } catch (error) {
      message.error('生成模拟记录失败');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: '提交时间',
      dataIndex: 'submit_time',
      key: 'submit_time',
      render: (text: string) => text ? dayjs(text).format('YYYY-MM-DD HH:mm:ss') : '-',
    },
    {
      title: '结束时间',
      dataIndex: 'end_time',
      key: 'end_time',
      render: (text: string) => text ? dayjs(text).format('YYYY-MM-DD HH:mm:ss') : '-',
    },
    {
      title: '花费时间',
      dataIndex: 'time_spent',
      key: 'time_spent',
      render: (val: number) => val ? <Text type="secondary" style={{ backgroundColor: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: 4 }}>🕗 {val} 秒</Text> : '-',
    },
    {
      title: '渠道',
      dataIndex: 'channel_id',
      key: 'channel_id',
      render: (val: number) => val ? <Tag color="gold" style={{ borderRadius: '12px', padding: '0 8px' }}># {val}</Tag> : '-',
    },
    {
      title: '平台',
      dataIndex: 'platform',
      key: 'platform',
      render: (text: string) => <Tag color="blue">{text}</Tag>,
    },
    {
      title: '类型',
      dataIndex: 'action_type',
      key: 'action_type',
      render: (text: string) => <Tag color="cyan">{text}</Tag>,
    },
    {
      title: '任务ID',
      dataIndex: 'task_id',
      key: 'task_id',
    },
    {
      title: '任务状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        let color = 'default';
        if (status === '成功') color = 'success';
        if (status === '失败') color = 'error';
        if (status === '进行中') color = 'processing';
        return <Tag color={color}>{status}</Tag>;
      },
    },
    {
      title: '进度',
      dataIndex: 'progress',
      key: 'progress',
      render: (val: number, record: TaskLog) => (
        <Progress 
          percent={val} 
          size="small" 
          status={record.status === '失败' ? 'exception' : (val === 100 ? 'success' : 'active')}
        />
      ),
    },
    {
      title: '详情',
      dataIndex: 'details',
      key: 'details',
      render: (text: string) => {
        if (!text) return '-';
        try {
          const parsed = JSON.parse(text);
          return (
            <Space>
              {parsed.preview && <a href={parsed.preview} target="_blank" rel="noreferrer">点击预览视频</a>}
              {parsed.download && <a href={parsed.download} target="_blank" rel="noreferrer">点击下载视频</a>}
            </Space>
          );
        } catch {
          return text;
        }
      },
    },
  ];

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Space>
            <Typography.Title level={4} style={{ margin: 0 }}>
              <SyncOutlined style={{ marginRight: 8 }} />
              任务记录
            </Typography.Title>
          </Space>
        </Col>
        <Col>
          <Space>
            <Button icon={<ExperimentOutlined />} onClick={handleMockGenerate}>
              生成测试数据
            </Button>
            <Button onClick={() => fetchLogs()} disabled={loading}>
              刷新
            </Button>
          </Space>
        </Col>
      </Row>

      <div style={{ padding: 16, background: '#141414', borderRadius: 8, marginBottom: 16 }}>
        <Form form={form} layout="inline" onFinish={() => fetchLogs(1, pageSize)}>
          <Form.Item name="dateRange" style={{ marginBottom: 16 }}>
            <RangePicker showTime />
          </Form.Item>
          <Form.Item name="task_id" style={{ marginBottom: 16 }}>
            <Input placeholder="任务 ID" allowClear />
          </Form.Item>
          <Form.Item name="channel_id" style={{ marginBottom: 16 }}>
            <Input placeholder="渠道 ID" allowClear />
          </Form.Item>
          <Form.Item style={{ marginBottom: 16 }}>
            <Space>
              <Button type="primary" htmlType="submit">
                {t('common.query', '查询')}
              </Button>
              <Button onClick={() => form.resetFields()}>
                {t('common.reset', '重置')}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </div>

      {screens.xs ? (
        <MobileCardList
          dataSource={data}
          loading={loading}
          rowKey="id"
          pagination={{
            current: page,
            pageSize,
            total,
            onChange: (p: number, s: number) => fetchLogs(p, s),
          }}
          renderCard={(record: any) => {
            let statusColor = 'default';
            if (record.status === '成功') statusColor = 'success';
            if (record.status === '失败') statusColor = 'error';
            if (record.status === '进行中') statusColor = 'processing';
            let detailNode = null;
            if (record.details) {
              try {
                const parsed = JSON.parse(record.details);
                detailNode = (
                  <Space>
                    {parsed.preview && <a href={parsed.preview} target="_blank" rel="noreferrer">预览</a>}
                    {parsed.download && <a href={parsed.download} target="_blank" rel="noreferrer">下载</a>}
                  </Space>
                );
              } catch {
                detailNode = <Text type="secondary" style={{ fontSize: 12 }}>{record.details}</Text>;
              }
            }
            return (
              <MobileCard
                title={<Space><Tag color="blue">{record.platform}</Tag><Tag color="cyan">{record.action_type}</Tag></Space>}
                extra={<Tag color={statusColor}>{record.status}</Tag>}
              >
                <CardRow label="任务ID"><Text style={{ fontSize: 11, fontFamily: 'monospace' }}>{record.task_id}</Text></CardRow>
                <CardRow label="渠道">{record.channel_id ? <Tag color="gold" style={{ borderRadius: 12 }}># {record.channel_id}</Tag> : '-'}</CardRow>
                <CardRow label="进度">
                  <Progress 
                    percent={record.progress} 
                    size="small" 
                    style={{ width: 120, margin: 0 }}
                    status={record.status === '失败' ? 'exception' : (record.progress === 100 ? 'success' : 'active')}
                  />
                </CardRow>
                <CardRow label="提交"><Text type="secondary" style={{ fontSize: 12 }}>{record.submit_time ? dayjs(record.submit_time).format('MM-DD HH:mm:ss') : '-'}</Text></CardRow>
                {record.time_spent > 0 && <CardRow label="耗时"><Text type="secondary" style={{ fontSize: 12 }}>🕗 {record.time_spent} 秒</Text></CardRow>}
                {detailNode && <CardRow label="详情">{detailNode}</CardRow>}
              </MobileCard>
            );
          }}
        />
      ) : (
        <Table
          columns={columns}
          dataSource={data}
          rowKey="id"
          loading={loading}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            onChange: (page, size) => fetchLogs(page, size),
          }}
          scroll={{ x: 'max-content' }}
          size="middle"
        />
      )}
    </div>
  );
};

export default TaskLogs;
