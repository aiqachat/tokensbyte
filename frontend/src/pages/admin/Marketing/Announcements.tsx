import React, { useEffect, useState } from 'react';
import { Card, Table, Button, Modal, Form, Input, Switch, message, Space, Tag, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import request from '../../../utils/request';
import type { Announcement } from '../../../types';

const Announcements: React.FC = () => {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form] = Form.useForm();

  const fetchAnnouncements = async () => {
    setLoading(true);
    try {
      const response = await (request.get('/announcements') as any);
      setAnnouncements(response.data || []);
    } catch (error) {
      console.error('Failed to fetch announcements:', error);
      message.error('获取公告列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const handleAdd = () => {
    setEditingId(null);
    form.resetFields();
    form.setFieldsValue({ is_pinned: false, is_active: true });
    setModalVisible(true);
  };

  const handleEdit = (record: Announcement) => {
    setEditingId(record.id);
    form.setFieldsValue({
      ...record,
      is_pinned: record.is_pinned === 1,
      is_active: record.is_active === 1,
    });
    setModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await (request.delete(`/announcements/${id}`) as any);
      message.success('删除成功');
      fetchAnnouncements();
    } catch (error) {
      console.error('Failed to delete announcement:', error);
      message.error('删除失败');
    }
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        title: values.title,
        content: values.content,
        is_pinned: values.is_pinned ? 1 : 0,
        is_active: values.is_active ? 1 : 0,
      };

      if (editingId) {
        await (request.put(`/announcements/${editingId}`, payload) as any);
        message.success('更新成功');
      } else {
        await (request.post('/announcements', payload) as any);
        message.success('创建成功');
      }
      setModalVisible(false);
      fetchAnnouncements();
    } catch (error) {
      console.error('Failed to save announcement:', error);
    }
  };

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 80,
    },
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
    },
    {
      title: '状态',
      key: 'status',
      render: (_: any, record: Announcement) => (
        <Space>
          {record.is_active === 1 ? <Tag color="success">上架</Tag> : <Tag color="default">下架</Tag>}
          {record.is_pinned === 1 && <Tag color="blue">置顶</Tag>}
        </Space>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (text: string) => new Date(text).toLocaleString(),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: Announcement) => (
        <Space>
          <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Popconfirm title="确定要删除该公告吗？" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card 
      title="站点公告管理" 
      extra={<Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增公告</Button>}
      style={{ borderRadius: 12 }}
      bordered={false}
    >
      <Table 
        columns={columns} 
        dataSource={announcements} 
        rowKey="id" 
        loading={loading}
        pagination={{ pageSize: 10 }}
      />

      <Modal
        title={editingId ? '编辑公告' : '新增公告'}
        open={modalVisible}
        onOk={handleSave}
        onCancel={() => setModalVisible(false)}
        width={800}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="公告标题" rules={[{ required: true, message: '请输入标题' }]}>
            <Input placeholder="请输入公告标题" />
          </Form.Item>
          
          <Space size="large" style={{ marginBottom: 24 }}>
            <Form.Item name="is_pinned" label="置顶显示" valuePropName="checked" style={{ margin: 0 }}>
              <Switch />
            </Form.Item>
            <Form.Item name="is_active" label="是否上架" valuePropName="checked" style={{ margin: 0 }}>
              <Switch />
            </Form.Item>
          </Space>

          <Form.Item name="content" label="公告内容" rules={[{ required: true, message: '请输入公告内容' }]}>
            <ReactQuill 
              theme="snow" 
              style={{ height: 300, marginBottom: 40, backgroundColor: 'var(--ant-color-bg-container)', color: 'var(--ant-color-text)' }} 
            />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default Announcements;
