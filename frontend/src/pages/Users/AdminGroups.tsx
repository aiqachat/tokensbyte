import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Checkbox, Space, message, Card, Typography, Divider } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import request from '../../utils/request';
import type { AdminGroup } from '../../types';

const { Title, Text } = Typography;

const ALL_PERMISSIONS = [
  { label: '仪表盘 (Dashboard)', value: 'dashboard' },
  { label: '令牌管理 (Tokens)', value: 'tokens' },
  { label: '日志管理 (Logs)', value: 'logs' },
  { label: '渠道管理 (Channels)', value: 'channels' },
  { label: '模型管理 (Models)', value: 'models' },
  { label: '营销管理 (Marketing)', value: 'marketing' },
  { label: '用户管理 (Users)', value: 'users' },
  { label: '财务管理 (Finance)', value: 'finance' },
  { label: '系统设置 (Settings)', value: 'settings' },
  { label: '权限分组管理 (Admin Groups)', value: 'admin_groups' },
];

const AdminGroups: React.FC = () => {
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingGroup, setEditingGroup] = useState<AdminGroup | null>(null);
  const [form] = Form.useForm();

  const fetchGroups = async () => {
    setLoading(true);
    try {
      const response = await (request.get('/admin_groups') as any);
      setGroups(response.data);
    } catch (error) {
      message.error('获取管理员分组失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGroups();
  }, []);

  const handleCreate = () => {
    setEditingGroup(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (group: AdminGroup) => {
    setEditingGroup(group);
    form.setFieldsValue({
      name: group.name,
      description: group.description,
      permissions: group.permissions ? JSON.parse(group.permissions) : [],
    });
    setModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await request.delete(`/admin_groups/${id}`);
      message.success('删除成功');
      fetchGroups();
    } catch (error) {
      message.error('删除失败，分组可能正在使用中');
    }
  };

  const onModalOk = async () => {
    try {
      const values = await form.validateFields();
      if (editingGroup) {
        await request.put(`/admin_groups/${editingGroup.id}`, values);
        message.success('修改成功');
      } else {
        await request.post('/admin_groups', values);
        message.success('创建成功');
      }
      setModalVisible(false);
      fetchGroups();
    } catch (error) {
      console.error(error);
    }
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 80 },
    { title: '名称', dataIndex: 'name', key: 'name', width: 150 },
    { title: '描述', dataIndex: 'description', key: 'description' },
    { 
      title: '操作', 
      key: 'action', 
      width: 200,
      render: (_: any, record: AdminGroup) => (
        <Space>
          <Button icon={<EditOutlined />} onClick={() => handleEdit(record)}>编辑</Button>
          <Button danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.id)}>删除</Button>
        </Space>
      )
    },
  ];

  return (
    <Card 
      title={
        <Space>
          <SafetyCertificateOutlined />
          <span>管理员权限分组</span>
        </Space>
      }
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
          新建分组
        </Button>
      }
    >
      <Table 
        columns={columns} 
        dataSource={groups} 
        rowKey="id" 
        loading={loading}
      />

      <Modal
        title={editingGroup ? '编辑分组' : '新建分组'}
        open={modalVisible}
        onOk={onModalOk}
        onCancel={() => setModalVisible(false)}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="分组名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea />
          </Form.Item>
          <Divider>权限配置</Divider>
          <Form.Item name="permissions" label="选择可见菜单">
            <Checkbox.Group options={ALL_PERMISSIONS} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default AdminGroups;
