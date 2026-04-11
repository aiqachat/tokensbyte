import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Space, Form, Input, Switch, message, Popconfirm, Modal, Tag } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, CodeOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';

const { TextArea } = Input;

interface ForwardRule {
  id: number;
  name: string;
  rule_type: string;
  config_json: string;
  description?: string;
  is_active: number;
  created_at: string;
}

const ForwardRules: React.FC = () => {
  const { t } = useTranslation();
  const [items, setItems] = useState<ForwardRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isConfigModalVisible, setIsConfigModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<ForwardRule | null>(null);
  const [currentConfig, setCurrentConfig] = useState<string>('');
  const [form] = Form.useForm();

  const fetchItems = async () => {
    setLoading(true);
    try {
      const resp = await (request.get('/forward-rules') as any);
      setItems(resp);
    } catch (e) {
      console.error(e);
      message.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const handleAdd = () => {
    setEditingItem(null);
    form.resetFields();
    form.setFieldsValue({
        is_active: true,
        config_json: '{\n  \n}'
    });
    setIsModalVisible(true);
  };

  const handleEdit = (item: ForwardRule) => {
    setEditingItem(item);
    form.setFieldsValue({
      ...item,
      is_active: item.is_active === 1,
    });
    setIsModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await request.delete(`/forward-rules/${id}`);
      message.success(t('common.success'));
      fetchItems();
    } catch (e) {
      console.error(e);
      message.error(t('common.error'));
    }
  };

  const handleSave = async (values: any) => {
    try {
      // Validate JSON content
      if (values.config_json) {
         try {
            JSON.parse(values.config_json);
         } catch(err) {
            message.error("配置内容不是合法的 JSON 格式");
            return;
         }
      }

      const payload = {
        ...values,
        is_active: values.is_active ? 1 : 0,
      };

      if (editingItem) {
        await request.put(`/forward-rules/${editingItem.id}`, payload);
      } else {
        await request.post('/forward-rules', payload);
      }
      message.success(t('common.success'));
      setIsModalVisible(false);
      fetchItems();
    } catch (e) {
      console.error(e);
      message.error(t('common.error'));
    }
  };

  const viewConfigJson = (jsonStr: string) => {
      try {
          const formatted = JSON.stringify(JSON.parse(jsonStr), null, 2);
          setCurrentConfig(formatted);
      } catch(e) {
          setCurrentConfig(jsonStr);
      }
      setIsConfigModalVisible(true);
  };

  const columns = [
    {
      title: '规则 ID',
      dataIndex: 'id',
      key: 'id',
      width: 80,
    },
    {
      title: '规则名称',
      dataIndex: 'name',
      key: 'name',
      width: 200,
      render: (text: string) => <Tag color="blue">{text}</Tag>
    },
    {
      title: '模式/厂商类型',
      dataIndex: 'rule_type',
      key: 'rule_type',
      width: 150,
      render: (text: string) => <Tag color="purple">{text}</Tag>
    },
    {
      title: '应用详情描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
       title: 'JSON 配置',
       key: 'config',
       render: (_: any, record: ForwardRule) => (
         <Button size="small" type="dashed" icon={<CodeOutlined />} onClick={() => viewConfigJson(record.config_json)}>
           查看 JSON 详情
         </Button>
       ),
       width: 150,
    },
    {
      title: t('common.status'),
      dataIndex: 'is_active',
      key: 'is_active',
      render: (active: number) => (
        <Switch checked={active === 1} disabled />
      ),
      width: 100,
    },
    {
      title: t('common.actions'),
      key: 'actions',
      render: (_: any, record: ForwardRule) => (
        <Space>
          <Button icon={<EditOutlined />} onClick={() => handleEdit(record)} size="small" />
          <Popconfirm title={t('common.confirm_delete')} onConfirm={() => handleDelete(record.id)}>
            <Button icon={<DeleteOutlined />} danger size="small" />
          </Popconfirm>
        </Space>
      ),
      width: 120,
    },
  ];

  return (
    <div>
      <Card title="大模型高级转发规则引擎配置" extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          新增定制规则
        </Button>
      }>
        <Table
          dataSource={items}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 15 }}
          size="middle"
        />
      </Card>

      <Modal
        title={editingItem ? '编辑高级规则' : '新增规则引擎接入'}
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        onOk={() => form.submit()}
        width={700}
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="name" label={'规则标识名称 (例如: Anthropic 原生转换)'} rules={[{ required: true }]}>
            <Input placeholder="输入此规则的标记名称以便于检索" />
          </Form.Item>

          <Form.Item name="rule_type" label="映射厂商及模式 (类型标识)" rules={[{ required: true }]}>
            <Input placeholder="如: openai, anthropic, gemini, passthrough" />
          </Form.Item>

          <Form.Item name="description" label="详细阐述">
            <Input.TextArea placeholder="用以描述该规则专门为了对接什么样的通道代理结构" rows={2} />
          </Form.Item>

          <Form.Item name="config_json" label="JSON 引擎路由协议参数配置 (核心)" rules={[{ required: true }]}>
             <TextArea style={{ fontFamily: 'monospace', fontSize: 13, background: '#1e1e1e', color: '#d4d4d4', padding: 12 }} rows={10} placeholder={'{\n  "mode": "...", \n}'} />
          </Form.Item>

          <Form.Item name="is_active" label={t('common.status')} valuePropName="checked">
            <Switch checkedChildren="激活中" unCheckedChildren="已停用" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
         title="JSON 重写拦截协议预览"
         open={isConfigModalVisible}
         footer={null}
         onCancel={() => setIsConfigModalVisible(false)}
         width={650}
      >
          <pre style={{
              background: '#121212',
              color: '#4af626',
              padding: 16,
              borderRadius: 8,
              border: '1px solid #333',
              overflow: 'auto',
              maxHeight: '60vh',
              fontSize: 13,
          }}>
              {currentConfig}
          </pre>
      </Modal>

    </div>
  );
};

export default ForwardRules;
