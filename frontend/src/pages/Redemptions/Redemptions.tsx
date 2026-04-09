import React, { useEffect, useState } from 'react';
import { Table, Tag, Card, Typography, Space, Button, Modal, Form, Input, InputNumber, message, Popconfirm } from 'antd';
import {
  SyncOutlined,
  PlusOutlined,
  DeleteOutlined,
  CopyOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';
import type { Redemption } from '../../types';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

interface GenerateResponse {
  success: boolean;
  count: number;
  codes: string[];
}

const Redemptions: React.FC = () => {
  const { t } = useTranslation();
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form] = Form.useForm();

  const fetchRedemptions = async () => {
    setLoading(true);
    try {
      const resp = await (request.get('/redemptions') as unknown as Promise<{ data: Redemption[] }>);
      setRedemptions(resp.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (values: unknown) => {
    try {
      const resp = await (request.post('/redemptions', values) as unknown as Promise<GenerateResponse>);
      if (resp.success) {
        message.success(t('common.success'));
        setIsModalOpen(false);
        form.resetFields();
        fetchRedemptions();
        
        // Modal showing generated codes for copy
        Modal.success({
          title: t('redemptions.codes_generated'),
          content: (
            <div style={{ maxHeight: 300, overflow: 'auto' }}>
              {resp.codes.map((code: string) => (
                <div key={code} style={{ marginBottom: 4 }}>
                  <Text code>{code}</Text>
                  <Button 
                    type="link" 
                    icon={<CopyOutlined />} 
                    size="small"
                    onClick={() => {
                      navigator.clipboard.writeText(code);
                      message.success(t('common.copied'));
                    }}
                  />
                </div>
              ))}
            </div>
          ),
          width: 500,
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await request.delete(`/redemptions/${id}`);
      message.success(t('common.success'));
      fetchRedemptions();
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchRedemptions();
  }, []);

  const columns = [
    {
      title: t('redemptions.name'),
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: t('redemptions.code'),
      dataIndex: 'code',
      key: 'code',
      render: (code: string) => <Text code>{code}</Text>,
    },
    {
      title: t('redemptions.quota'),
      dataIndex: 'quota',
      key: 'quota',
      render: (q: number) => <Text strong>${q.toFixed(2)}</Text>,
    },
    {
      title: t('redemptions.status'),
      dataIndex: 'is_used',
      key: 'is_used',
      render: (used: number) => (
        <Tag color={used === 1 ? 'error' : 'success'}>
          {used === 1 ? t('redemptions.used') : t('redemptions.unused')}
        </Tag>
      ),
    },
    {
      title: t('redemptions.created_at'),
      dataIndex: 'created_at',
      key: 'created_at',
      render: (t: string) => dayjs(t).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: t('common.actions'),
      key: 'actions',
      render: (_: unknown, record: Redemption) => (
        <Space>
           <Popconfirm title={t('common.confirm_delete')} onConfirm={() => handleDelete(record.id)}>
            <Button icon={<DeleteOutlined />} danger size="small" />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card bordered={false}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
        <Title level={2} style={{ margin: 0 }}>{t('redemptions.title')}</Title>
        <Space>
          <Button icon={<SyncOutlined />} onClick={fetchRedemptions}>{t('common.refresh')}</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsModalOpen(true)}>
            {t('redemptions.add')}
          </Button>
        </Space>
      </div>

      <Table
        dataSource={redemptions}
        columns={columns}
        rowKey="id"
        loading={loading}
      />

      <Modal
        title={t('redemptions.add')}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} initialValues={{ count: 1, quota: 10 }}>
          <Form.Item name="name" label={t('redemptions.name')} rules={[{ required: true }]}>
            <Input placeholder="e.g. Summer Recharge 2026" />
          </Form.Item>
          <Form.Item name="count" label={t('common.count')} rules={[{ required: true }]}>
            <InputNumber min={1} max={100} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="quota" label={t('redemptions.quota') + " ($)"} rules={[{ required: true }]}>
            <InputNumber min={0.01} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default Redemptions;

