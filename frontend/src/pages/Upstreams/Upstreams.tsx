import React, { useState, useEffect } from 'react';
import { Table, Button, Space, Modal, Form, Input, InputNumber, Switch, message, Popconfirm, Card, Typography, Select, Divider } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SyncOutlined, KeyOutlined, ApiOutlined, ProfileOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';
import type { Upstream } from '../../types';

const { Title, Text } = Typography;
const { Option } = Select;

const UPSTREAM_TYPES = [
  'newapi', '火山官方', 'byteplus', '阿里云官方', '阿里云国际', 
  '腾讯云官方', '腾讯云国际', 'openrouter', 'AWS', '其他'
];

const Upstreams: React.FC = () => {
  const { t } = useTranslation();
  const [upstreams, setUpstreams] = useState<Upstream[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingUpstream, setEditingUpstream] = useState<Upstream | null>(null);
  const [syncingId, setSyncingId] = useState<number | null>(null);
  const [form] = Form.useForm();
  
  const currentUpstreamType = Form.useWatch('upstream_type', form);

  const fetchUpstreams = async () => {
    setLoading(true);
    try {
      const resp = await (request.get('/upstreams') as unknown as Promise<Upstream[]>);
      setUpstreams(resp || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUpstreams();
  }, []);

  const handleAdd = () => {
    setEditingUpstream(null);
    form.resetFields();
    setIsModalVisible(true);
  };

  const handleEdit = (record: Upstream) => {
    setEditingUpstream(record);
    
    // Parse config if it exists
    let extraFields = {};
    if (record.config) {
        try {
            extraFields = JSON.parse(record.config);
        } catch (e) {
            console.error('Failed to parse config:', e);
        }
    }
    
    form.setFieldsValue({
        ...record,
        ...extraFields
    });
    setIsModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await request.delete(`/upstreams/${id}`);
      message.success(t('common.success'));
      fetchUpstreams();
    } catch (e) {
      console.error(e);
    }
  };

  const handleSave = async (values: any) => {
    try {
      
      // Extract specific configs
      const { api_key, api_secret, ...restValues } = values;
      const configObj: any = {};
      
      if (values.upstream_type === '火山官方') {
          if (api_key) configObj.api_key = api_key;
          if (api_secret) configObj.api_secret = api_secret;
      }
      
      const payload = {
        ...restValues,
        config: Object.keys(configObj).length > 0 ? JSON.stringify(configObj) : null,
        is_active: values.is_active ? 1 : 0,
      };
      
      if (editingUpstream) {
        await request.put(`/upstreams/${editingUpstream.id}`, payload);
        message.success(t('common.success'));
      } else {
        await request.post('/upstreams', payload);
        message.success(t('common.success'));
      }
      setIsModalVisible(false);
      fetchUpstreams();
    } catch (e) {
      console.error(e);
    }
  };

  const handleSyncBalance = async (id: number) => {
    setSyncingId(id);
    try {
        const resp = await (request.get(`/upstreams/${id}/balance`) as unknown as Promise<{ balance: number, message?: string }>);
        
        // Update local state without full reload
        setUpstreams(prev => prev.map(up => {
            if (up.id === id) {
                return { ...up, balance: resp.balance || 0 };
            }
            return up;
        }));
        
        if (resp.message) {
             message.info(resp.message);
        } else {
             message.success(`余额同步成功: ¥${resp.balance}`);
        }
    } catch (e) {
        console.error(e);
        message.error("余额同步失败");
    } finally {
        setSyncingId(null);
    }
  };

  const columns = [
    {
      title: '上游名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => <Text strong>{text}</Text>,
    },
    {
      title: '上游类型',
      dataIndex: 'upstream_type',
      key: 'upstream_type',
      width: 120,
    },
    {
      title: '备注信息',
      dataIndex: 'remark',
      key: 'remark',
      render: (text: string) => <Text type="secondary">{text || '-'}</Text>,
    },
    {
      title: '现金余额',
      key: 'balance',
      width: 180,
      render: (_: unknown, record: Upstream) => (
          <Space>
              <Text strong style={{ color: '#52c41a' }}>
                  {record.balance !== undefined ? `¥ ${record.balance}` : '-'}
              </Text>
              <Button 
                type="link" 
                size="small" 
                icon={<SyncOutlined spin={syncingId === record.id} />} 
                onClick={() => handleSyncBalance(record.id)}
                disabled={syncingId === record.id}
              >
                 同步
              </Button>
          </Space>
      )
    },
    {
      title: t('models.sort_order'),
      dataIndex: 'sort_order',
      key: 'sort_order',
    },
    {
      title: t('common.status'),
      dataIndex: 'is_active',
      key: 'is_active',
      render: (active: boolean) => (
        <Switch checked={active} disabled />
      ),
    },
    {
      title: t('common.actions'),
      key: 'actions',
      render: (_: unknown, record: Upstream) => (
        <Space>
          <Button icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          <Popconfirm title={t('common.confirm_delete')} onConfirm={() => handleDelete(record.id)}>
            <Button icon={<DeleteOutlined />} danger />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card bordered={false}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
        <Title level={2} style={{ margin: 0 }}>上游管理</Title>
        <Space>
          <Button icon={<SyncOutlined />} onClick={fetchUpstreams}>{t('common.refresh')}</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增上游转发</Button>
        </Space>
      </div>

      <Table
        dataSource={upstreams}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 15 }}
      />

      <Modal
        title={editingUpstream ? "编辑上游" : "新增上游"}
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" onFinish={handleSave} initialValues={{ sort_order: 0, is_active: true, upstream_type: '其他' }}>
          <Divider orientation={"left" as any} plain style={{ color: '#888', marginBottom: 24, marginTop: 0 }}>
             <ProfileOutlined /> 基础配置
          </Divider>
          
          <Form.Item name="name" label="上游名称 (标识)" rules={[{ required: true }]}>
            <Input placeholder="输入上游提供商名称。将在渠道预设配置中直接可用。" />
          </Form.Item>

          <Form.Item name="upstream_type" label="上游类型" rules={[{ required: true }]}>
            <Select placeholder="选择上游类型" showSearch>
              {UPSTREAM_TYPES.map(type => (
                <Option key={type} value={type}>{type}</Option>
              ))}
            </Select>
          </Form.Item>
          
          {currentUpstreamType === '火山官方' && (
              <>
                  <Divider orientation={"left" as any} plain style={{ color: '#888', margin: '12px 0 24px' }}>
                      <ApiOutlined /> 火山官方接入凭证
                  </Divider>
                  <Form.Item name="api_key" label="Access Key ID (AK)" rules={[{ required: true, message: '请输入火山 AK' }]} normalize={(value) => (value || '').trim()}>
                      <Input prefix={<KeyOutlined style={{color: 'rgba(0,0,0,.25)'}}/>} placeholder="输入您的 Access Key ID" />
                  </Form.Item>
                  <Form.Item name="api_secret" label="Secret Access Key (SK)" rules={[{ required: true, message: '请输入火山 SK' }]} normalize={(value) => (value || '').trim()}>
                      <Input.Password prefix={<KeyOutlined style={{color: 'rgba(0,0,0,.25)'}}/>} placeholder="输入您的 Secret Access Key" />
                  </Form.Item>
              </>
          )}

          <Form.Item name="remark" label="备注说明" extra="详细记录上游中转商的信息、官方联系方式与特性">
            <Input.TextArea rows={3} placeholder="备注将仅供您查阅..." />
          </Form.Item>

          <Form.Item name="sort_order" label={t('models.sort_order')}>
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item name="is_active" label={t('common.status')} valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default Upstreams;
