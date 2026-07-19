import React, { useState, useEffect } from 'react';
import { Modal, Table, Button, Space, Form, Input, InputNumber, Switch, message, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';
import { type ModelProvider, type ModelType } from '../../types';
import IconPicker from '../IconPicker';
import { Image as ImageIcon, Video, AudioLines, MessageSquare, Cuboid, ListOrdered, Sparkles } from 'lucide-react';

interface ClassificationItem {
  id: number;
  name: string;
  name_en?: string;
  is_active: boolean;
  is_system?: number;
  logo?: string;
}

interface ClassificationManagerProps {
  type: 'provider' | 'api_provider' | 'type';
  visible: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

const ClassificationManager: React.FC<ClassificationManagerProps> = ({
  type,
  visible,
  onClose,
  onUpdate,
}) => {
  const { t, i18n } = useTranslation();
  const isEn = i18n.language === 'en';
  const [items, setItems] = useState<ClassificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<ClassificationItem | null>(null);
  const [form] = Form.useForm();

  const apiPath = type === 'provider' ? '/model-providers' : (type === 'api_provider' ? '/model-api-providers' : '/model-types');

  const fetchItems = async () => {
    setLoading(true);
    try {
      const resp = await (request.get(apiPath) as any);
      setItems(resp);
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

  const handleEdit = (item: ClassificationItem) => {
    setEditingItem(item);
    form.setFieldsValue({ ...item, logo: item.logo || undefined });
    setIsEditModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await request.delete(`${apiPath}/${id}`);
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
        await request.put(`${apiPath}/${editingItem.id}`, payload);
      } else {
        await request.post(apiPath, payload);
      }
      message.success(t('common.success'));
      setIsEditModalVisible(false);
      fetchItems();
      onUpdate();
    } catch (e) {
      console.error(e);
    }
  };

  const renderSystemIcon = (name: string) => {
    const lowerName = name.toLowerCase();
    if (lowerName.includes('视频增强') || lowerName.includes('videoenhance') || lowerName.includes('video-enhance') || lowerName.includes('video_enhance')) return <Sparkles size={18} />;
    if (lowerName.includes('图片') || lowerName.includes('image')) return <ImageIcon size={18} />;
    if (lowerName.includes('视频') || lowerName.includes('video')) return <Video size={18} />;
    if (lowerName.includes('音频') || lowerName.includes('audio')) return <AudioLines size={18} />;
    if (lowerName.includes('聊天') || lowerName.includes('chat') || lowerName.includes('text')) return <MessageSquare size={18} />;
    if (lowerName.includes('embedding') || lowerName.includes('向量')) return <Cuboid size={18} />;
    if (lowerName.includes('rerank') || lowerName.includes('排序')) return <ListOrdered size={18} />;
    return null;
  };

  const columns = [
    {
      title: 'Logo',
      dataIndex: 'logo',
      key: 'logo',
      width: 50,
      render: (logo: string, record: ClassificationItem) => {
        const sysIcon = renderSystemIcon(record.name_en || record.name);
        if (sysIcon) {
          return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, opacity: 0.85 }}>{sysIcon}</div>;
        }
        return logo ? (
          <img src={`/assets/icons/lobe/${logo}.svg`} alt="" style={{ width: 22, height: 22, objectFit: 'contain' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        ) : <span style={{ color: 'rgba(255,255,255,0.15)' }}>—</span>;
      },
    },
    {
      title: t('common.name'),
      dataIndex: 'name',
      key: 'name',
      render: (_: any, record: ClassificationItem) => isEn && record.name_en ? record.name_en : record.name,
    },
    {
      title: t('models.sort_order'),
      dataIndex: 'sort_order',
      key: 'sort_order',
      width: 100,
    },
    {
      title: t('common.status'),
      dataIndex: 'is_active',
      key: 'is_active',
      render: (active: boolean) => (
        <Switch checked={active} disabled />
      ),
      width: 100,
    },
    {
      title: t('common.actions'),
      key: 'actions',
      render: (_: any, record: ClassificationItem) => {
        return (
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
        );
      },
      width: 120,
    },
  ];

  return (
    <>
      <Modal
        title={type === 'provider' ? t('models.manage_providers') : (type === 'api_provider' ? t('models.manage_api_providers', '管理API服务商') : t('models.manage_types'))}
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
            <Input placeholder="例如：OpenAI" disabled={editingItem?.is_system === 1} />
          </Form.Item>
          <Form.Item name="name_en" label={t('common.name_en', '英文名称')}>
            <Input placeholder="例如：OpenAI" />
          </Form.Item>
          <Form.Item name="logo" label="Logo 图标">
            <IconPicker
              value={form.getFieldValue('logo')}
              onChange={(icon) => form.setFieldsValue({ logo: icon?.name || undefined })}
              placeholder={`选择${type === 'provider' ? '服务商' : '类型'}图标`}
            />
          </Form.Item>
          <Form.Item name="sort_order" label={t('models.sort_order')}>
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

export default ClassificationManager;
