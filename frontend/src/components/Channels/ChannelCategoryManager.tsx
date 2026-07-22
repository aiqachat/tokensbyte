/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import React, { useState, useEffect } from 'react';
import { Modal, Table, Button, Space, Form, Input, InputNumber, Switch, message, Popconfirm, Tag } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';
import type { ChannelCategory } from '../../types';

interface ChannelCategoryManagerProps {
  visible: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

const ChannelCategoryManager: React.FC<ChannelCategoryManagerProps> = ({
  visible,
  onClose,
  onUpdate,
}) => {
  const { t, i18n } = useTranslation();
  const isEn = i18n.language === 'en';
  const [items, setItems] = useState<ChannelCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<ChannelCategory | null>(null);
  const [form] = Form.useForm();

  const fetchItems = async () => {
    setLoading(true);
    try {
      const resp = await (request.get('/channel-categories') as any);
      setItems(Array.isArray(resp) ? resp : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) {
      fetchItems();
    }
  }, [visible]);

  const handleAdd = () => {
    setEditingItem(null);
    form.resetFields();
    setIsEditModalVisible(true);
  };

  const handleEdit = (item: ChannelCategory) => {
    setEditingItem(item);
    form.setFieldsValue({
      ...item,
      is_active: !!item.is_active,
    });
    setIsEditModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await request.delete(`/channel-categories/${id}`);
      message.success(t('common.success'));
      fetchItems();
      onUpdate();
    } catch (e) {
      console.error(e);
    }
  };

  const handleSave = async (values: any) => {
    try {
      const payload = {
        ...values,
        is_active: values.is_active ? 1 : 0,
      };
      if (editingItem) {
        await request.put(`/channel-categories/${editingItem.id}`, payload);
      } else {
        await request.post('/channel-categories', payload);
      }
      message.success(t('common.success'));
      setIsEditModalVisible(false);
      fetchItems();
      onUpdate();
    } catch (e) {
      console.error(e);
    }
  };

  const columns = [
    {
      title: t('common.name'),
      dataIndex: 'name',
      key: 'name',
      render: (_: any, record: ChannelCategory) => (
        <Space>
          <span>{isEn && record.name_en ? record.name_en : record.name}</span>
          {record.is_system === 1 && <Tag color="blue">系统</Tag>}
        </Space>
      ),
    },
    {
      title: t('models.sort_order', '排序'),
      dataIndex: 'sort_order',
      key: 'sort_order',
      width: 100,
    },
    {
      title: t('common.status'),
      dataIndex: 'is_active',
      key: 'is_active',
      render: (active: number | boolean) => (
        <Switch checked={!!active} disabled />
      ),
      width: 100,
    },
    {
      title: t('common.actions'),
      key: 'actions',
      render: (_: any, record: ChannelCategory) => (
        <Space>
          <Button icon={<EditOutlined />} onClick={() => handleEdit(record)} size="small" />
          <Popconfirm
            title={t('common.confirm_delete')}
            onConfirm={() => handleDelete(record.id)}
            disabled={record.is_system === 1}
          >
            <Button icon={<DeleteOutlined />} danger size="small" disabled={record.is_system === 1} />
          </Popconfirm>
        </Space>
      ),
      width: 120,
    },
  ];

  return (
    <>
      <Modal
        title="管理渠道分类"
        open={visible}
        onCancel={onClose}
        footer={[
          <Button key="close" onClick={onClose}>{t('common.close')}</Button>
        ]}
        width={600}
      >
        <div style={{ marginBottom: 16 }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            {t('common.add')}
          </Button>
        </div>
        <Table
          dataSource={items}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={false}
          size="small"
        />
      </Modal>

      <Modal
        title={editingItem ? t('common.edit') : t('common.add')}
        open={isEditModalVisible}
        onCancel={() => setIsEditModalVisible(false)}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" onFinish={handleSave} initialValues={{ sort_order: 0, is_active: true }}>
          <Form.Item name="name" label={t('common.name')} rules={[{ required: true }]}>
            <Input placeholder="例如：图片" disabled={editingItem?.is_system === 1} />
          </Form.Item>
          <Form.Item name="name_en" label={t('common.name_en', '英文名称')}>
            <Input placeholder="例如：Image" />
          </Form.Item>
          <Form.Item name="sort_order" label={t('models.sort_order', '排序')}>
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="is_active" label={t('common.status')} valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default ChannelCategoryManager;
