import React, { useEffect, useState } from 'react';
import { Table, Button, Space, Tag, Modal, Form, Input, InputNumber, message, Popconfirm, Card, Typography, Select } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, UserOutlined, SyncOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';
import type { User } from '../../types';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;

const Users: React.FC = () => {
  const { t } = useTranslation();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form] = Form.useForm();

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const resp = await (request.get('/users') as unknown as Promise<{ data: User[] }>);
      setUsers(resp.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleAdd = () => {
    setEditingUser(null);
    form.resetFields();
    setIsModalVisible(true);
  };

  const handleEdit = (record: User) => {
    setEditingUser(record);
    form.setFieldsValue({
      ...record,
      password: '', // Don't show password
    });
    setIsModalVisible(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await request.delete(`/users/${id}`);
      message.success(t('common.success'));
      fetchUsers();
    } catch (e) {
      console.error(e);
    }
  };

  const handleSave = async (values: { [key: string]: unknown }) => {
    try {
      if (editingUser) {
        await request.put(`/users/${editingUser.id}`, values);
        message.success(t('common.success'));
      } else {
        await request.post('/users', values);
        message.success(t('common.success'));
      }
      setIsModalVisible(false);
      fetchUsers();
    } catch (e) {
      console.error(e);
    }
  };

  const columns = [
    {
      title: t('users.username'),
      dataIndex: 'username',
      key: 'username',
      render: (text: string) => <Space><UserOutlined /><Text strong>{text}</Text></Space>,
    },
    {
      title: t('users.email'),
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: t('users.role'),
      dataIndex: 'role',
      key: 'role',
      render: (role: string) => (
        <Tag color={role === 'admin' ? 'purple' : 'blue'}>
          {role.toUpperCase()}
        </Tag>
      ),
    },
    {
      title: t('users.group'),
      dataIndex: 'user_group',
      key: 'user_group',
      render: (group: string) => (
        <Tag color={group === 'vip' ? 'gold' : group === 'partner' ? 'cyan' : 'default'}>
          {(group || 'default').toUpperCase()}
        </Tag>
      ),
    },
    {
      title: t('users.balance'),
      dataIndex: 'balance',
      key: 'balance',
      render: (val: number) => `$${val.toFixed(2)}`,
    },
    {
      title: t('common.status'),
      dataIndex: 'is_active',
      key: 'is_active',
      render: (active: boolean) => (
        <Tag color={active ? 'success' : 'error'}>
          {active ? t('common.active') : t('common.disabled')}
        </Tag>
      ),
    },
    {
      title: t('users.joined'),
      dataIndex: 'created_at',
      key: 'created_at',
      render: (text: string) => dayjs(text).format('YYYY-MM-DD'),
    },
    {
      title: t('common.actions'),
      key: 'actions',
      render: (_: unknown, record: User) => (
        <Space>
          <Button icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          <Popconfirm title={t('common.confirm_delete')} onConfirm={() => handleDelete(record.id)}>
            <Button icon={<DeleteOutlined />} danger disabled={record.role === 'admin'} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card bordered={false}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
        <Title level={2} style={{ margin: 0 }}>{t('users.title')}</Title>
        <Space>
          <Button icon={<SyncOutlined />} onClick={fetchUsers}>{t('common.refresh')}</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>{t('users.add_user')}</Button>
        </Space>
      </div>

      <Table
        dataSource={users}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
      />

      <Modal
        title={editingUser ? t('users.edit_user') : t('users.add_user')}
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="username" label={t('users.username')} rules={[{ required: true }]}>
            <Input placeholder={t('users.username')} />
          </Form.Item>
          <Form.Item name="email" label={t('users.email')} rules={[{ required: true, type: 'email' }]}>
            <Input placeholder="email@example.com" />
          </Form.Item>
          <Form.Item 
            name="password" 
            label={editingUser ? t('users.password_hint') : t('login.password')}
            rules={[{ required: !editingUser }]}
          >
            <Input.Password placeholder={t('login.password')} />
          </Form.Item>
          <Form.Item name="role" label={t('users.role')} initialValue="user">
            <Select>
              <Option value="user">User</Option>
              <Option value="admin">Admin</Option>
            </Select>
          </Form.Item>
          <Form.Item name="balance" label={t('users.balance') + " ($)"} initialValue={0}>
            <InputNumber style={{ width: '100%' }} precision={2} />
          </Form.Item>
          <Form.Item name="user_group" label={t('users.group')} initialValue="default">
            <Select>
              <Option value="default">Default</Option>
              <Option value="vip">VIP</Option>
              <Option value="partner">Partner</Option>
            </Select>
          </Form.Item>
          <Form.Item name="is_active" label={t('common.status')} initialValue={true}>
            <Select>
              <Option value={true}>{t('common.active')}</Option>
              <Option value={false}>{t('common.disabled')}</Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default Users;

