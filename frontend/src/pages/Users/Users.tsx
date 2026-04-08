import React, { useEffect, useState } from 'react';
import { Table, Button, Space, Tag, Modal, Form, Input, InputNumber, message, Popconfirm, Card, Typography, Select } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, UserOutlined, SyncOutlined } from '@ant-design/icons';
import request from '../../utils/request';
import type { User } from '../../types';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;

const Users: React.FC = () => {
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
      message.success('User deleted');
      fetchUsers();
    } catch (e) {
      console.error(e);
    }
  };

  const handleSave = async (values: { [key: string]: unknown }) => {

    try {
      if (editingUser) {
        await request.put(`/users/${editingUser.id}`, values);
        message.success('User updated');
      } else {
        await request.post('/users', values);
        message.success('User created');
      }
      setIsModalVisible(false);
      fetchUsers();
    } catch (e) {
      console.error(e);
    }
  };

  const columns = [
    {
      title: 'Username',
      dataIndex: 'username',
      key: 'username',
      render: (text: string) => <Space><UserOutlined /><Text strong>{text}</Text></Space>,
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      render: (role: string) => (
        <Tag color={role === 'admin' ? 'purple' : 'blue'}>
          {role.toUpperCase()}
        </Tag>
      ),
    },
    {
      title: 'Group',
      dataIndex: 'user_group',
      key: 'user_group',
      render: (group: string) => (
        <Tag color={group === 'vip' ? 'gold' : group === 'partner' ? 'cyan' : 'default'}>
          {(group || 'default').toUpperCase()}
        </Tag>
      ),
    },
    {
      title: 'Balance',
      dataIndex: 'balance',
      key: 'balance',
      render: (val: number) => `$${val.toFixed(2)}`,
    },
    {
      title: 'Status',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (active: boolean) => (
        <Tag color={active ? 'success' : 'error'}>
          {active ? 'Active' : 'Disabled'}
        </Tag>
      ),
    },
    {
      title: 'Joined',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (text: string) => dayjs(text).format('YYYY-MM-DD'),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: unknown, record: User) => (
        <Space>
          <Button icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          <Popconfirm title="Delete user?" onConfirm={() => handleDelete(record.id)}>
            <Button icon={<DeleteOutlined />} danger disabled={record.role === 'admin'} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card bordered={false}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
        <Title level={2} style={{ margin: 0 }}>User Management</Title>
        <Space>
          <Button icon={<SyncOutlined />} onClick={fetchUsers}>Refresh</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>Add User</Button>
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
        title={editingUser ? 'Edit User' : 'Add User'}
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="username" label="Username" rules={[{ required: true }]}>
            <Input placeholder="Username" />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
            <Input placeholder="email@example.com" />
          </Form.Item>
          <Form.Item 
            name="password" 
            label={editingUser ? "Password (leave blank to keep current)" : "Password"}
            rules={[{ required: !editingUser }]}
          >
            <Input.Password placeholder="Password" />
          </Form.Item>
          <Form.Item name="role" label="Role" initialValue="user">
            <Select>
              <Option value="user">User</Option>
              <Option value="admin">Admin</Option>
            </Select>
          </Form.Item>
          <Form.Item name="balance" label="Balance ($)" initialValue={0}>
            <InputNumber style={{ width: '100%' }} precision={2} />
          </Form.Item>
          <Form.Item name="user_group" label="Group" initialValue="default">
            <Select>
              <Option value="default">Default</Option>
              <Option value="vip">VIP</Option>
              <Option value="partner">Partner</Option>
            </Select>
          </Form.Item>
          <Form.Item name="is_active" label="Status" initialValue={true}>
            <Select>
              <Option value={true}>Active</Option>
              <Option value={false}>Disabled</Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default Users;
