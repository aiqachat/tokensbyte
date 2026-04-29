import React, { useEffect, useState, useMemo } from 'react';
import { Table, Button, Space, Tag, Modal, Form, Input, InputNumber, message, Popconfirm, Card, Typography, Select, Progress, Grid, Radio } from 'antd';
import MobileCardList, { MobileCard, CardRow, CardActions } from '../../components/MobileCardList';
import { PlusOutlined, EditOutlined, DeleteOutlined, UserOutlined, SyncOutlined, WalletOutlined, DollarOutlined, LoginOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import request from '../../utils/request';
import useSettingsStore from '../../store/settings';
import useAuthStore from '../../store/auth';
import type { User } from '../../types';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;
const { useBreakpoint } = Grid;

const Users: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const screens = useBreakpoint();
  const isAdminPage = location.pathname.includes('/admins');
  const targetRole = isAdminPage ? 'admin' : 'user';
  
  const { settings } = useSettingsStore();
  const currencySymbol = settings?.currency?.currency_symbol || '$';
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [userLevels, setUserLevels] = useState<any[]>([]);
  const [adminGroups, setAdminGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string>('user');
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isRechargeModalVisible, setIsRechargeModalVisible] = useState(false);
  const [rechargingUser, setRechargingUser] = useState<User | null>(null);
  const [searchText, setSearchText] = useState('');
  const [form] = Form.useForm();
  const [rechargeForm] = Form.useForm();

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const resp = await (request.get('/users') as unknown as Promise<{ data: User[] }>);
      setAllUsers(resp.data);
      // Filter by role
      const filteredUsers = resp.data.filter(u => u.role === targetRole);
      setUsers(filteredUsers);
      
      const levelsResp = await (request.get('/user_levels') as unknown as Promise<{ data: any[] }>);
      setUserLevels(levelsResp.data);

      const adminGroupsResp = await (request.get('/admin_groups') as unknown as Promise<{ data: any[] }>);
      setAdminGroups(adminGroupsResp.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [isAdminPage]);

  const displayedUsers = useMemo(() => {
    if (!searchText) return users;
    const lower = searchText.toLowerCase();
    return users.filter(user => 
      user.username?.toLowerCase().includes(lower) ||
      user.uid?.toLowerCase().includes(lower) ||
      user.nickname?.toLowerCase().includes(lower) ||
      user.email?.toLowerCase().includes(lower) ||
      user.mobile?.toLowerCase().includes(lower) ||
      user.register_ip?.toLowerCase().includes(lower)
    );
  }, [users, searchText]);

  const handleAdd = () => {
    setEditingUser(null);
    setSelectedRole(targetRole);
    form.resetFields();
    form.setFieldsValue({ role: targetRole, is_active: true, balance: 0, user_group: 'default' });
    setIsModalVisible(true);
  };

  const handleEdit = (record: User) => {
    setEditingUser(record);
    setSelectedRole(record.role);
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
        const payload = { ...values };
        if (!payload.password || (payload.password as string).trim() === '') {
          delete payload.password;
        }
        if (payload.referred_by === undefined) {
          payload.referred_by = "";
        }
        await request.put(`/users/${editingUser.id}`, payload);
        message.success(t('common.success'));
      } else {
        const payload = { ...values, role: targetRole };
        await request.post('/users', payload);
        message.success(t('common.success'));
      }
      setIsModalVisible(false);
      fetchUsers();
    } catch (e) {
      console.error(e);
    }
  };

  const handleRechargeClick = (record: User) => {
    setRechargingUser(record);
    rechargeForm.setFieldsValue({
      actionType: 'increase',
      amount: 0,
      remark: '',
    });
    setIsRechargeModalVisible(true);
  };

  const handleRechargeSave = async (values: any) => {
    if (!rechargingUser) return;
    try {
      let finalAmount = values.amount;
      if (values.actionType === 'decrease') {
        finalAmount = -finalAmount;
      }
      const payload = {
        amount: finalAmount,
        remark: values.remark,
      };
      await request.post(`/users/${rechargingUser.id}/recharge`, payload);
      message.success(t('users.recharge_success'));
      setIsRechargeModalVisible(false);
      fetchUsers();
    } catch (e) {
      console.error(e);
    }
  };

  const handleImpersonate = async (record: User) => {
    try {
      const resp = await (request.post(`/users/${record.id}/impersonate`) as unknown as Promise<{ token: string; user: User }>);
      const { token, user } = resp;
      
      let baseUrl = window.location.origin;
      // 严谨判断：如果处于本地开发环境，并且不是在5173端口，强制向5173发起用户端请求
      if (baseUrl.includes('localhost') && !baseUrl.includes('5173')) {
        baseUrl = 'http://localhost:5173';
      }
      
      message.success(`正在打开用户端: ${user.username}`);
      
      // 添加一个特定标记，便于 Login.tsx 处理特殊情况
      window.open(`${baseUrl}/login?token=${token}&impersonate=1`, '_blank');
    } catch (e) {
      console.error(e);
      message.error('切换用户失败');
    }
  };

  const baseColumns: any[] = [
    {
      title: t('users.uid'),
      dataIndex: 'uid',
      key: 'uid',
      render: (text: string) => <Text code style={{ color: '#fff' }}>{text}</Text>,
    },
    {
      title: t('users.username'),
      dataIndex: 'username',
      key: 'username',
      render: (text: string, record: User) => (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <Space>
            <UserOutlined />
            <Text strong>{text}</Text>
            {record.nickname && <Text type="secondary">({record.nickname})</Text>}
          </Space>
          {record.referred_by && (() => {
            const referrer = allUsers.find(u => u.id === record.referred_by || u.uid === record.referred_by || u.username === record.referred_by);
            return (
              <Text type="secondary" style={{ fontSize: '12px', marginTop: 4 }}>
                推荐人: {referrer ? `${referrer.username} (UID: ${referrer.uid})` : record.referred_by}
              </Text>
            );
          })()}
          <Text 
            type="secondary" 
            style={{ fontSize: '12px', marginTop: 4 }}
            editable={{
              text: record.admin_remark || '',
              onChange: async (val) => {
                if (val === record.admin_remark) return;
                try {
                  await request.put(`/users/${record.id}`, { admin_remark: val });
                  message.success('备注已更新');
                  await fetchUsers();
                } catch (e) {
                  console.error('Failed to update remark:', e);
                  message.error('备注更新失败');
                }
              },
              tooltip: '点击编辑用户备注',
              triggerType: ['text', 'icon']
            }}
          >
            {record.admin_remark || '添加备注'}
          </Text>
        </div>
      ),
    },
    {
      title: '注册信息',
      key: 'registration_info',
      render: (_: any, record: User) => (
        <Space direction="vertical" size={2} style={{ fontSize: '13px' }}>
          {record.email && <Text type="secondary">邮箱: {record.email}</Text>}
          {record.mobile && <Text type="secondary">手机号: {record.mobile}</Text>}
          <Text type="secondary">注册 IP: {record.register_ip || '未知'}</Text>
          <Text type="secondary">加入时间: {dayjs(record.created_at).format('YYYY-MM-DD HH:mm:ss')}</Text>
        </Space>
      ),
    },

    {
      title: t('users.group'),
      dataIndex: 'user_group',
      key: 'user_group',
      render: (group: string, record: User) => {
        if (record.role === 'admin') {
          const adminGroup = adminGroups.find(g => g.id === record.admin_group_id);
          return <Tag color="purple">{adminGroup ? adminGroup.name : '超级管理员'}</Tag>;
        }
        
        const level = userLevels.find(l => l.group_key === group);
        const levelName = level ? level.name : (group || 'default').toUpperCase();
        
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
            <Tag color={group === 'vip' ? 'gold' : group === 'partner' ? 'cyan' : 'default'} style={{ margin: 0 }}>
              {levelName}
            </Tag>
            {level && (
              <Text type="secondary" style={{ fontSize: '12px' }}>
                折扣倍率: {level.discount}x
              </Text>
            )}
          </div>
        );
      },
    },
    {
      title: '剩余额度/总额度',
      key: 'balance',
      render: (_: unknown, record: User) => {
        const balance = record.balance;
        const used = record.used_quota || 0;
        const total = balance + used;
        const percent = total > 0 ? (balance / total) * 100 : 0;
        return (
          <div style={{ width: 140 }}>
             <Tag 
                icon={<DollarOutlined />}
                style={{ 
                  width: '100%', 
                  background: 'rgba(255, 255, 255, 0.04)',
                  borderColor: 'rgba(255, 255, 255, 0.1)',
                  borderRadius: '12px',
                  padding: '4px 8px',
                  fontSize: '13px',
                  textAlign: 'center',
                  marginBottom: 4,
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center'
                }}
             >
                {currencySymbol}{balance.toFixed(2)} / {currencySymbol}{total.toFixed(2)}
             </Tag>
             <Progress 
                percent={percent} 
                showInfo={false} 
                size="small" 
                strokeColor={balance > 0 ? '#52c41a' : '#ff4d4f'}
                trailColor="rgba(255, 255, 255, 0.1)"
                style={{ marginBottom: 0, padding: '0 8px' }}
             />
          </div>
        );
      },
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
      title: t('common.actions'),
      key: 'actions',
      render: (_: unknown, record: User) => (
        <Space>
          {!isAdminPage && (
            <>
              <Button 
                icon={<WalletOutlined />} 
                style={{ color: '#52c41a', borderColor: '#52c41a' }}
                onClick={() => handleRechargeClick(record)} 
                title="充值"
              />
              <Button 
                icon={<LoginOutlined />} 
                style={{ color: '#1677ff', borderColor: '#1677ff' }}
                onClick={() => handleImpersonate(record)}
                title="登录此用户"
              />
            </>
          )}
          <Button icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          <Popconfirm title={t('common.confirm_delete')} onConfirm={() => handleDelete(record.id)}>
            <Button icon={<DeleteOutlined />} danger disabled={record.role === 'admin'} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const columns = isAdminPage ? baseColumns.filter(c => c.key !== 'balance') : baseColumns;

  return (
    <Card variant="borderless">
      <div style={{ display: 'flex', flexDirection: screens.xs ? 'column' : 'row', justifyContent: 'space-between', marginBottom: 24, gap: 12 }}>
        <Title level={screens.xs ? 4 : 2} style={{ margin: 0 }}>
          {isAdminPage ? t('menu.admin_list') : t('menu.user_list')}
        </Title>
        <Space wrap>
          <Input.Search 
            placeholder="搜索用户名/ID/昵称/邮箱/手机号/IP..." 
            allowClear 
            onSearch={setSearchText} 
            onChange={(e) => setSearchText(e.target.value)} 
            style={{ width: screens.xs ? '100%' : 300 }}
          />
          <Button icon={<SyncOutlined />} onClick={fetchUsers}>{t('common.refresh')}</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>{isAdminPage ? '添加管理员' : '添加普通用户'}</Button>
        </Space>
      </div>

      {screens.xs ? (
        <MobileCardList
          dataSource={displayedUsers}
          loading={loading}
          rowKey="id"
          pagination={{ pageSize: 20, showTotal: (total: number) => `共 ${total} 条` }}
          renderCard={(record: any) => {
            const level = userLevels.find((l: any) => l.group_key === record.user_group);
            const levelName = level ? level.name : (record.user_group || 'default').toUpperCase();
            const balance = record.balance || 0;
            const used = record.used_quota || 0;
            const total = balance + used;
            return (
              <MobileCard
                title={<Space><UserOutlined /><Text strong>{record.username}</Text>{record.nickname && <Text type="secondary">({record.nickname})</Text>}</Space>}
                extra={<Tag color={record.is_active ? 'success' : 'error'}>{record.is_active ? t('common.active') : t('common.disabled')}</Tag>}
              >
                <CardRow label="UID"><Text code style={{ color: '#fff', fontSize: 12 }}>{record.uid}</Text></CardRow>
                {record.email && <CardRow label="邮箱"><Text style={{ fontSize: 12 }}>{record.email}</Text></CardRow>}
                {record.mobile && <CardRow label="手机号"><Text style={{ fontSize: 12 }}>{record.mobile}</Text></CardRow>}
                {!isAdminPage && (
                  <CardRow label="余额">
                    <Text style={{ color: '#52c41a', fontWeight: 'bold' }}>{currencySymbol}{balance.toFixed(2)}</Text>
                    <Text type="secondary" style={{ fontSize: 11 }}> / {currencySymbol}{total.toFixed(2)}</Text>
                  </CardRow>
                )}
                {isAdminPage ? (
                  <CardRow label="分组">
                    {(() => {
                      const adminGroup = adminGroups.find((g: any) => g.id === record.admin_group_id);
                      return <Tag color="purple">{adminGroup ? adminGroup.name : '超级管理员'}</Tag>;
                    })()}
                  </CardRow>
                ) : (
                  <CardRow label="等级">
                    <Tag color={record.user_group === 'vip' ? 'gold' : 'default'}>{levelName}</Tag>
                  </CardRow>
                )}
                <CardRow label="注册IP"><Text type="secondary" style={{ fontSize: 12 }}>{record.register_ip || '未知'}</Text></CardRow>
                <CardRow label="加入时间"><Text type="secondary" style={{ fontSize: 12 }}>{dayjs(record.created_at).format('MM-DD HH:mm')}</Text></CardRow>
                <CardActions>
                  {!isAdminPage && (
                    <>
                      <Button size="small" icon={<WalletOutlined />} style={{ color: '#52c41a', borderColor: '#52c41a' }} onClick={() => handleRechargeClick(record)} title="充值" />
                      <Button size="small" icon={<LoginOutlined />} style={{ color: '#1677ff', borderColor: '#1677ff' }} onClick={() => handleImpersonate(record)} title="登录此用户" />
                    </>
                  )}
                  <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
                  <Popconfirm title={t('common.confirm_delete')} onConfirm={() => handleDelete(record.id)}>
                    <Button size="small" icon={<DeleteOutlined />} danger disabled={record.role === 'admin'} />
                  </Popconfirm>
                </CardActions>
              </MobileCard>
            );
          }}
        />
      ) : (
        <Table
          dataSource={displayedUsers}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ 
            defaultPageSize: 50, 
            pageSizeOptions: ['50', '100', '200'], 
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条数据`
          }}
          scroll={{ x: 'max-content' }}
        />
      )}

      <Modal
        title={editingUser ? t('users.edit_user') : (isAdminPage ? '添加管理员' : '添加普通用户')}
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="username" label={t('users.username')} rules={[{ required: true }]}>
            <Input placeholder={t('users.username')} />
          </Form.Item>
          <Form.Item name="nickname" label="用户昵称">
            <Input placeholder="输入用户昵称" />
          </Form.Item>
          <Form.Item name="admin_remark" label="用户备注 (管理员可见)">
            <Input.TextArea placeholder="写入简便备注例如: vip客户" rows={3} autoSize={{ minRows: 2, maxRows: 6 }} />
          </Form.Item>
          <Form.Item name="referral_history" label="关联记录 (流转记录)">
            <Input.TextArea placeholder="详细记录该客户的推荐流转情况..." rows={3} autoSize={{ minRows: 2, maxRows: 6 }} />
          </Form.Item>
          <Form.Item name="referred_by" label="上级推荐人 (UID / User ID)">
            <Select
              showSearch
              allowClear
              placeholder="输入用户名、UID 或邮箱快速搜索"
              filterOption={(input, option) => {
                if (!option) return false;
                const searchStr = String(option.label || '').toLowerCase();
                return searchStr.includes(input.toLowerCase());
              }}
              options={allUsers.map(u => ({
                value: u.uid || String(u.id),
                label: `${u.username} ${u.nickname ? `(${u.nickname})` : ''} - UID: ${u.uid || u.id} ${u.email ? `(${u.email})` : ''}`
              }))}
            />
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
          {!editingUser && (
             <Form.Item name="role" label={t('users.role')} initialValue={targetRole} hidden>
                <Input />
             </Form.Item>
          )}
          {editingUser && isAdminPage && (
            <Form.Item name="role" label={t('users.role')}>
              <Select onChange={(val) => setSelectedRole(val)}>
                <Option value="user">User</Option>
                <Option value="admin">Admin</Option>
              </Select>
            </Form.Item>
          )}
          {selectedRole === 'admin' && (
            <Form.Item name="admin_group_id" label="管理员分组" tooltip="未分配则默认为全权限超级管理员">
              <Select placeholder="选择分组" allowClear>
                {adminGroups.map(group => (
                  <Option key={group.id} value={group.id}>{group.name}</Option>
                ))}
              </Select>
            </Form.Item>
          )}
          {!isAdminPage && !editingUser && (
            <Form.Item name="balance" label={`${t('users.balance')} (${currencySymbol})`} initialValue={0}>
              <InputNumber style={{ width: '100%' }} precision={2} />
            </Form.Item>
          )}
          {!isAdminPage && (
            <Form.Item name="user_group" label="普通用户等级" initialValue="default">
              <Select>
                {userLevels.map(level => (
                  <Option key={level.id} value={level.group_key}>
                    {level.name} (折扣倍率: {level.discount}x)
                  </Option>
                ))}
              </Select>
            </Form.Item>
          )}
          <Form.Item name="is_active" label={t('common.status')} initialValue={true}>
            <Select>
              <Option value={true}>{t('common.active')}</Option>
              <Option value={false}>{t('common.disabled')}</Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('users.recharge')}
        open={isRechargeModalVisible}
        onCancel={() => setIsRechargeModalVisible(false)}
        onOk={() => rechargeForm.submit()}
        width={420}
      >
        <div style={{ marginBottom: 16 }}>
          <Text type="secondary">{t('users.username')}: </Text>
          <Text strong>{rechargingUser?.username}</Text>
          <br />
          <Text type="secondary">{t('users.balance')}: </Text>
          <Text strong style={{ color: '#1677ff' }}>{currencySymbol}{rechargingUser?.balance.toFixed(2)}</Text>
        </div>
        <Form form={rechargeForm} layout="vertical" onFinish={handleRechargeSave} initialValues={{ actionType: 'increase', amount: 0 }}>
          <Form.Item name="actionType" label="操作类型">
            <Radio.Group optionType="button" buttonStyle="solid">
              <Radio value="increase">增加金额 (+)</Radio>
              <Radio value="decrease">减少金额 (-)</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item 
            name="amount" 
            label={t('users.adjustment_amount')} 
            rules={[{ required: true, message: 'Please enter amount' }]}
          >
            <InputNumber 
              style={{ width: '100%' }} 
              precision={2} 
              min={0}
              placeholder={t('finance.amount')}
            />
          </Form.Item>
          <div style={{ marginBottom: 16 }}>
            <Text type="secondary" style={{ fontSize: 13, marginBottom: 8, display: 'block' }}>快捷输入：</Text>
            <Space wrap size={[8, 8]}>
              {[10, 20, 50, 100, 500, 1000].map(val => (
                <Button 
                  key={val} 
                  size="small" 
                  onClick={() => rechargeForm.setFieldsValue({ amount: val })}
                >
                  {val}
                </Button>
              ))}
            </Space>
          </div>
          <Form.Item name="remark" label={t('users.remark')}>
            <Input.TextArea rows={2} placeholder={t('users.remark')} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default Users;

