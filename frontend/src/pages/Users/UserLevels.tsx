import React, { useEffect, useState } from 'react';
import { Table, Button, Space, Tag, Modal, Form, Input, InputNumber, message, Popconfirm, Card, Typography } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SyncOutlined, TrophyOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

interface UserLevel {
  id: number;
  name: String;
  group_key: String;
  discount: number;
  description: String;
  created_at: String;
}

const UserLevels: React.FC = () => {
  const { t } = useTranslation();
  const [levels, setLevels] = useState<UserLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingLevel, setEditingLevel] = useState<UserLevel | null>(null);
  const [form] = Form.useForm();

  const fetchLevels = async () => {
    setLoading(true);
    try {
      const resp = await (request.get('/user_levels') as unknown as Promise<{ data: UserLevel[] }>);
      setLevels(resp.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLevels();
  }, []);

  const handleAdd = () => {
    setEditingLevel(null);
    form.resetFields();
    setIsModalVisible(true);
  };

  const handleEdit = (record: UserLevel) => {
    setEditingLevel(record);
    form.setFieldsValue(record);
    setIsModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await request.delete(`/user_levels/${id}`);
      message.success(t('user_levels.success'));
      fetchLevels();
    } catch (e: any) {
      console.error(e);
      message.error(e.response?.data?.message || t('common.error'));
    }
  };

  const handleSave = async (values: any) => {
    try {
      if (editingLevel) {
        await request.put(`/user_levels/${editingLevel.id}`, values);
      } else {
        await request.post('/user_levels', values);
      }
      message.success(t('user_levels.success'));
      setIsModalVisible(false);
      fetchLevels();
    } catch (e) {
      console.error(e);
    }
  };

  const columns = [
    {
      title: t('user_levels.name'),
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => <Space><TrophyOutlined style={{ color: '#faad14' }} /><Text strong>{text}</Text></Space>,
    },
    {
      title: t('user_levels.group_key'),
      dataIndex: 'group_key',
      key: 'group_key',
      render: (key: string) => <Tag color="blue">{key}</Tag>,
    },
    {
      title: t('user_levels.discount'),
      dataIndex: 'discount',
      key: 'discount',
      render: (val: number) => {
        const off = Math.round((1 - val) * 100);
        return (
          <Space>
            <Text>{val.toFixed(2)}x</Text>
            {off > 0 && <Tag color="red">-{off}%</Tag>}
          </Space>
        );
      },
    },
    {
      title: t('user_levels.description'),
      dataIndex: 'description',
      key: 'description',
    },
    {
      title: t('user_levels.created_at'),
      dataIndex: 'created_at',
      key: 'created_at',
      render: (text: string) => dayjs(text).format('YYYY-MM-DD'),
    },
    {
      title: t('common.actions'),
      key: 'actions',
      render: (_: any, record: UserLevel) => (
        <Space>
          <Button icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          <Popconfirm 
            title={t('user_levels.delete_confirm')} 
            onConfirm={() => handleDelete(record.id)}
            disabled={record.group_key === 'default'}
          >
            <Button icon={<DeleteOutlined />} danger disabled={record.group_key === 'default'} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card bordered={false}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
        <Title level={2} style={{ margin: 0 }}>{t('user_levels.title')}</Title>
        <Space>
          <Button icon={<SyncOutlined />} onClick={fetchLevels}>{t('common.refresh')}</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>{t('user_levels.add_level')}</Button>
        </Space>
      </div>

      <Table
        dataSource={levels}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={false}
      />

      <Modal
        title={editingLevel ? t('user_levels.edit_level') : t('user_levels.add_level')}
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="name" label={t('user_levels.name')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="group_key" label={t('user_levels.group_key')} rules={[{ required: true }]}>
            <Input placeholder="e.g. vip" disabled={editingLevel?.group_key === 'default'} />
          </Form.Item>
          <Form.Item 
            name="discount" 
            label={t('user_levels.discount')} 
            initialValue={1.0}
            rules={[{ required: true }]}
            extra={t('user_levels.discount_hint')}
          >
            <InputNumber style={{ width: '100%' }} min={0.01} max={1} step={0.01} precision={2} />
          </Form.Item>
          <Form.Item name="description" label={t('user_levels.description')}>
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default UserLevels;
