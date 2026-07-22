/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, Checkbox, Space, message, Card, Typography, Divider, Grid, Tag } from 'antd';
import MobileCardList, { MobileCard, CardRow, CardActions } from '../../components/MobileCardList';
import { PlusOutlined, EditOutlined, DeleteOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import request from '../../utils/request';
import { formatApiDateTime } from '../../utils/timedisplay';
import type { AdminGroup } from '../../types';

const { Title, Text } = Typography;
const { useBreakpoint } = Grid;

const ALL_PERMISSIONS = [
  { label: '仪表盘 (Dashboard)', value: 'dashboard' },
  { label: '中转网关 (Relay API)', value: 'relay_api' },
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
  const [activePlugins, setActivePlugins] = useState<any[]>([]);
  const [form] = Form.useForm();
  const screens = useBreakpoint();

  const fetchGroups = async () => {
    setLoading(true);
    try {
      const response = await (request.get('/admin_groups') as any);
      setGroups(response.data);
    } catch (error) {
      message.error('获取管理员等级失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchActivePlugins = async () => {
    try {
      const response = await (request.get('/plugins/active') as any);
      if (response.active_plugins) {
        setActivePlugins(response.active_plugins);
      }
    } catch (error) {
      console.error('获取插件失败', error);
    }
  };

  useEffect(() => {
    fetchGroups();
    fetchActivePlugins();
  }, []);

  const handleCreate = () => {
    setEditingGroup(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (group: AdminGroup) => {
    setEditingGroup(group);
    const allPerms = group.permissions ? JSON.parse(group.permissions) : [];
    const basicPerms = allPerms.filter((p: string) => !p.startsWith('plugin:'));
    const pluginPerms = allPerms.filter((p: string) => p.startsWith('plugin:'));

    form.setFieldsValue({
      name: group.name,
      description: group.description,
      permissions: basicPerms,
      plugin_permissions: pluginPerms,
      sort_order: group.sort_order || 0,
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
      const allPerms = [...(values.permissions || []), ...(values.plugin_permissions || [])];
      const payload = {
        ...values,
        permissions: allPerms
      };
      delete payload.plugin_permissions;

      if (editingGroup) {
        await request.put(`/admin_groups/${editingGroup.id}`, payload);
        message.success('修改成功');
      } else {
        await request.post('/admin_groups', payload);
        message.success('创建成功');
      }
      setModalVisible(false);
      fetchGroups();
    } catch (error) {
      console.error(error);
    }
  };

  const renderPermissionsTags = (permissionsStr?: string) => {
    let perms: string[] = [];
    try {
      if (permissionsStr) {
        perms = JSON.parse(permissionsStr);
      }
    } catch {}
    
    const hasAllBasic = ALL_PERMISSIONS.every(item => perms.includes(item.value));
    const hasAllPlugins = activePlugins.every(plugin => perms.includes(`plugin:${plugin.name}`));

    if (hasAllBasic && hasAllPlugins) {
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          <Tag color="success" style={{ fontSize: '11px', margin: 0, padding: '0 4px', fontWeight: 'bold' }}>
            全部功能
          </Tag>
        </div>
      );
    }

    const permLabels = perms.map(p => {
      if (p.startsWith('plugin:')) {
        const pName = p.substring(7);
        const foundPlugin = activePlugins.find(ap => ap.name === pName);
        return `插件: ${foundPlugin ? (foundPlugin.title || pName) : pName}`;
      }
      const found = ALL_PERMISSIONS.find(item => item.value === p);
      return found ? found.label.split(' ')[0] : p;
    });

    if (permLabels.length === 0) {
      return <Text type="secondary" style={{ fontSize: '11px' }}>未配置权限</Text>;
    }

    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
        {permLabels.map(label => (
          <Tag color="blue" style={{ fontSize: '11px', margin: 0, padding: '0 4px' }} key={label}>
            {label}
          </Tag>
        ))}
      </div>
    );
  };

  const columns = [
    { title: '名称', dataIndex: 'name', key: 'name', width: 150 },
    { title: '用户数', dataIndex: 'user_count', key: 'user_count', width: 80, render: (val: number) => <Tag color="blue">{val || 0}</Tag> },
    { 
      title: '权限详细', 
      key: 'permissions_detail', 
      width: 500,
      render: (_: any, record: AdminGroup) => renderPermissionsTags(record.permissions)
    },
    { title: '描述', dataIndex: 'description', key: 'description' },
    { title: '排序', dataIndex: 'sort_order', key: 'sort_order', width: 80 },
    { title: '创建时间', dataIndex: 'created_at', key: 'created_at', render: (text: string) => formatApiDateTime(text) },
    { 
      title: '操作', 
      key: 'action', 
      width: 200,
      render: (_: any, record: AdminGroup) => (
        <Space>
          <Button icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          <Button danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.id)} />
        </Space>
      )
    },
  ];

  return (
    <Card 
      title={
        <Space>
          <SafetyCertificateOutlined />
          <span>管理员权限等级</span>
        </Space>
      }
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
          添加管理员等级
        </Button>
      }
    >
      {screens.xs ? (
        <MobileCardList
          dataSource={groups}
          loading={loading}
          rowKey="id"
          pagination={false}
          renderCard={(record: any) => (
            <MobileCard
              title={<Text strong>{record.name}</Text>}
              extra={null}
            >
              <CardRow label="权限详细">{renderPermissionsTags(record.permissions)}</CardRow>
              <CardRow label="用户数"><Tag color="blue">{record.user_count || 0}</Tag></CardRow>
              {record.description && <CardRow label="描述"><Text type="secondary" style={{ fontSize: 12 }}>{record.description}</Text></CardRow>}
              <CardRow label="排序"><Text type="secondary" style={{ fontSize: 12 }}>{record.sort_order || 0}</Text></CardRow>
              <CardRow label="创建时间"><Text type="secondary" style={{ fontSize: 12 }}>{formatApiDateTime(record.created_at)}</Text></CardRow>
              <CardActions>
                <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
                <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.id)} />
              </CardActions>
            </MobileCard>
          )}
        />
      ) : (
        <Table 
          columns={columns} 
          dataSource={groups} 
          rowKey="id" 
          loading={loading}
        />
      )}

      <Modal
        title={editingGroup ? '编辑管理员等级' : '添加管理员等级'}
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
          <Form.Item name="sort_order" label="排序（数字越大越靠前）" initialValue={0}>
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
          <Divider>权限配置</Divider>
          <Form.Item 
            name="permissions" 
            label={
              <Space>
                选择可见基础菜单
                <Checkbox 
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    form.setFieldsValue({ permissions: e.target.checked ? ALL_PERMISSIONS.map(p => p.value) : [] });
                  }}
                >
                  <span style={{ fontWeight: 'normal', fontSize: 12, color: '#1677ff' }}>全选/全不选</span>
                </Checkbox>
              </Space>
            }
          >
            <Checkbox.Group options={ALL_PERMISSIONS} />
          </Form.Item>
          {activePlugins.length > 0 && (
            <Form.Item 
              name="plugin_permissions" 
              label={
                <Space>
                  插件权限（可展示使用的插件）
                  <Checkbox 
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      form.setFieldsValue({ plugin_permissions: e.target.checked ? activePlugins.map(p => `plugin:${p.name}`) : [] });
                    }}
                  >
                    <span style={{ fontWeight: 'normal', fontSize: 12, color: '#1677ff' }}>全选/全不选</span>
                  </Checkbox>
                </Space>
              }
            >
              <Checkbox.Group 
                options={activePlugins.map(p => ({ label: p.title || p.name, value: `plugin:${p.name}` }))} 
              />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </Card>
  );
};

export default AdminGroups;
