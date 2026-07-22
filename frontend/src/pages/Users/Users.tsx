/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import React, { useEffect, useState, useMemo, startTransition } from 'react';
import { Table, Button, Space, Tag, Modal, Form, Input, InputNumber, message, Popconfirm, Card, Typography, Select, Progress, Grid, Radio, Tabs, Timeline, Row, Col, Tooltip, DatePicker, Statistic, Spin, Switch } from 'antd';
import MobileCardList, { MobileCard, CardRow, CardActions } from '../../components/MobileCardList';
import ModelSelector from '../../components/ModelSelector';
import WalletBalanceDisplay from '../../components/WalletBalanceDisplay';
import WalletDetailsView from '../../components/WalletDetailsView';
import { PlusOutlined, EditOutlined, DeleteOutlined, UserOutlined, SyncOutlined, WalletOutlined, LoginOutlined, ArrowLeftOutlined, CloseOutlined, SearchOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import request from '../../utils/request';
import useSettingsStore from '../../store/settings';
import { useThemeStore } from '../../store/theme';

import type { User } from '../../types';
import dayjs from 'dayjs';
import { formatApiDateTime } from '../../utils/timedisplay';
import { toAbsoluteDateParam } from '../../utils/dateRangeParams';
import { Resizable } from 'react-resizable';
import type { ResizeCallbackData } from 'react-resizable';

const ResizableTitle = (props: any) => {
  const { onResize, width, ...restProps } = props;
  const thRef = React.useRef<HTMLTableCellElement>(null);

  if (!width) {
    return <th {...restProps} />;
  }

  return (
    <Resizable
      width={width}
      height={0}
      handle={
        <span
          className="react-resizable-handle"
          onClick={(e) => {
            e.stopPropagation();
          }}
          style={{
            position: 'absolute',
            right: 0,
            bottom: 0,
            zIndex: 1,
            width: '10px',
            height: '100%',
            cursor: 'col-resize',
            display: 'block'
          }}
        />
      }
      onResize={(e, { size }) => {
        // Bypass React state for 60fps native performance during dragging
        if (thRef.current) {
          const index = Array.from(thRef.current.parentNode!.children).indexOf(thRef.current);
          const tableContainer = thRef.current.closest('.ant-table');
          if (tableContainer) {
            const colgroups = tableContainer.querySelectorAll('colgroup');
            colgroups.forEach(cg => {
              const col = cg.children[index] as HTMLElement;
              if (col) {
                col.style.width = `${Math.max(size.width, 80)}px`;
                col.style.minWidth = `${Math.max(size.width, 80)}px`;
              }
            });
          }
        }
      }}
      onResizeStop={onResize}
      draggableOpts={{ enableUserSelectHack: false }}
    >
      <th ref={thRef} {...restProps} style={{ ...restProps.style, position: 'relative' }} />
    </Resizable>
  );
};

const { Title, Text } = Typography;
const { Option } = Select;
const { useBreakpoint } = Grid;

// Helper: check if email is a real user-bound email (not a placeholder)
const isRealEmail = (email?: string) => !!email && !email.endsWith('@tokensbyte.local');

const Users: React.FC = () => {
  const { themeMode } = useThemeStore();
  const _isLight = themeMode === 'light';
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
  const [rechargeLoading, setRechargeLoading] = useState(false);

  const [walletTimeFilter, setWalletTimeFilter] = useState<'all' | 'month'>(() => {
    return (localStorage.getItem('walletTimeFilter') as 'all' | 'month') || 'all';
  });
  const [monthStatsMap, setMonthStatsMap] = useState<Record<string, { recharge_amount: number; gift_amount: number }>>({});
  const [allStatsMap, setAllStatsMap] = useState<Record<string, { recharge_amount: number; gift_amount: number }>>({});

  useEffect(() => {
    if (users.length === 0) return;
    const userIds = users.map(u => u.id);
    if (walletTimeFilter === 'month') {
      request.post('/finance/recharges/stats_batch', {
        user_ids: userIds,
        start_date: toAbsoluteDateParam(dayjs().startOf('month')),
        end_date: toAbsoluteDateParam(dayjs().endOf('month'), true),
      }).then((res: any) => {
        setMonthStatsMap(res || {});
      }).catch(console.error);
    } else {
      setMonthStatsMap({});
    }
    // 获取全量充值统计（用于"总充值"显示）
    request.post('/finance/recharges/stats_batch', {
      user_ids: userIds,
    }).then((res: any) => {
      setAllStatsMap(res || {});
    }).catch(console.error);
  }, [walletTimeFilter, users]);
  
  const [columnsWidths, setColumnsWidths] = useState<Record<string, number>>({
    uid: 100,
    username: 320,
    registration_info: 280,
    user_group: 150,
    balance: 320,
    actions: 120,
  });

  const handleResize = (key: string) => (_e: React.SyntheticEvent<Element>, { size }: ResizeCallbackData) => {
    setColumnsWidths((prev) => ({ ...prev, [key]: Math.max(size.width, 80) }));
  };
  const [searchText, setSearchText] = useState('');
  const [filterGroup, setFilterGroup] = useState<string>('all');
  const [filterReferrer, setFilterReferrer] = useState('');
  const [form] = Form.useForm();
  const [rechargeForm] = Form.useForm();
  const rechargeActionType = Form.useWatch('actionType', rechargeForm);
  const rechargeWalletType = Form.useWatch('walletType', rechargeForm) || 'system';

  // ── 钱包明细弹窗状态 ──
  const [walletDetailUser, setWalletDetailUser] = useState<User | null>(null);
  const [walletRecharges, setWalletRecharges] = useState<any[]>([]);
  const [walletDetailLoading, setWalletDetailLoading] = useState(false);
  // 缓存：{ userId: { data: [...], time: timestamp } }
  const walletCacheRef = React.useRef<Record<string, { data: any[]; time: number }>>({});
  const WALLET_CACHE_TTL = 30 * 1000; // 30秒

  // ── 模型折扣 Tab 相关状态 ──
  const [availableModels, setAvailableModels] = useState<any[]>([]);
  /** 当前编辑用户的模型折扣数据: {mid: discount} */
  const [discountMap, setDiscountMap] = useState<Record<string, number>>({});
  /** 已选用于设置折扣的模型 mid 列表 */
  const [discountMids, setDiscountMids] = useState<string[]>([]);

  // ── 等级变更历史 ──
  const [levelLogs, setLevelLogs] = useState<any[]>([]);
  const [levelLogsLoading, setLevelLogsLoading] = useState(false);

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
    // 加载模型列表用于折扣标识显示模型名称（仅首次）
    if (availableModels.length === 0) {
      request.get('/models').then((resp: any) => {
        if (resp?.data) setAvailableModels(resp.data);
      }).catch(() => {});
    }
  }, [isAdminPage]);

  const displayedUsers = useMemo(() => {
    let result = users;
    
    if (filterGroup && filterGroup !== 'all') {
      result = result.filter(user => user.user_group === filterGroup);
    }

    const trimmedFilterReferrer = filterReferrer.trim();
    if (trimmedFilterReferrer) {
      const lowerRef = trimmedFilterReferrer.toLowerCase();
      result = result.filter(user => {
        if (!user.referred_by) return false;
        const referrerObj = allUsers.find(u => u.id === user.referred_by || u.uid === user.referred_by || u.username === user.referred_by);
        if (referrerObj) {
          return referrerObj.uid?.toLowerCase().includes(lowerRef) || 
                 referrerObj.username?.toLowerCase().includes(lowerRef) || 
                 (referrerObj.nickname && referrerObj.nickname.toLowerCase().includes(lowerRef));
        }
        return user.referred_by.toLowerCase().includes(lowerRef);
      });
    }
    
    const trimmedSearchText = searchText.trim();
    if (trimmedSearchText) {
      const lower = trimmedSearchText.toLowerCase();
      result = result.filter(user => 
        user.username?.toLowerCase().includes(lower) ||
        user.uid?.toLowerCase().includes(lower) ||
        user.nickname?.toLowerCase().includes(lower) ||
        (isRealEmail(user.email) && user.email!.toLowerCase().includes(lower)) ||
        user.mobile?.toLowerCase().includes(lower) ||
        user.register_ip?.toLowerCase().includes(lower) ||
        user.admin_remark?.toLowerCase().includes(lower)
      );
    }
    
    return result;
  }, [users, searchText, filterGroup, filterReferrer, allUsers]);

  const handleAdd = () => {
    setEditingUser(null);
    setSelectedRole(targetRole);
    form.resetFields();
    form.setFieldsValue({ role: targetRole, is_active: 1, balance: 0, gift_balance: 0, user_group: 'default' });
    // 清空模型折扣状态
    setDiscountMap({});
    setDiscountMids([]);
    setIsModalVisible(true);
  };

  const handleEdit = (record: User) => {
    setEditingUser(record);
    setIsModalVisible(true);
    // 加载等级变更记录
    setLevelLogs([]);
    setLevelLogsLoading(true);
    (request.get(`/users/${record.id}/level-logs`) as unknown as Promise<{ data: any[] }>)
      .then(res => setLevelLogs(res.data || []))
      .catch(() => {})
      .finally(() => setLevelLogsLoading(false));
    setSelectedRole(record.role);
    form.setFieldsValue({
      ...record,
      password: '', // Don't show password
    });
    // 初始化模型折扣数据
    const md: Record<string, number> = record.model_discounts ? (() => { try { return JSON.parse(record.model_discounts); } catch { return {}; } })() : {};
    setDiscountMap(md);
    setDiscountMids(Object.keys(md));
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
        // 编辑模式下不发送 balance/gift_balance，避免并发覆盖充值操作
        delete payload.balance;
        delete payload.gift_balance;
        delete payload.gift_used_quota;
        delete payload.used_quota;
        // 保存模型折扣：仅保留已设置折扣值的模型
        const validDiscounts: Record<string, number> = {};
        for (const mid of discountMids) {
          if (discountMap[mid] !== undefined && discountMap[mid] !== null) {
            validDiscounts[mid] = discountMap[mid];
          }
        }
        payload.model_discounts = Object.keys(validDiscounts).length > 0 ? JSON.stringify(validDiscounts) : '';
        await request.put(`/users/${editingUser.id}`, payload);
        message.success(t('common.success'));
      } else {
        const payload: any = { ...values, role: targetRole };
        // 创建时去掉值为0的余额字段，避免后端不必要的记录
        if (payload.balance === 0 || payload.balance === null) delete payload.balance;
        if (payload.gift_balance === 0 || payload.gift_balance === null) delete payload.gift_balance;
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
      walletType: 'system',
      actionType: 'increase',
      amount: '',
      remark: '',
    });
    setIsRechargeModalVisible(true);
  };

  const handleRechargeSave = async (values: any) => {
    if (!rechargingUser) return;
    if (rechargeLoading) return;
    setRechargeLoading(true);
    try {
      let finalAmount = Number(values.amount);
      if (values.actionType === 'decrease') {
        finalAmount = -finalAmount;
      }
      const payload = {
        amount: finalAmount,
        remark: values.remark,
        wallet_type: values.walletType || 'system',
      };
      await request.post(`/users/${rechargingUser.id}/recharge`, payload);
      message.success(t('users.recharge_success'));
      setIsRechargeModalVisible(false);
      // 充值后清除该用户的钱包明细缓存，确保下次查看时获取最新数据
      delete walletCacheRef.current[rechargingUser.id];
      fetchUsers();
    } catch (e) {
      console.error(e);
    } finally {
      setRechargeLoading(false);
    }
  };

  // ── 钱包明细：获取用户充值记录（30秒 TTL 缓存） ──
  const openWalletDetail = async (record: User) => {
    setWalletDetailUser(record);
    // 检查缓存是否有效（30秒内）
    const cached = walletCacheRef.current[record.id];
    if (cached && Date.now() - cached.time < WALLET_CACHE_TTL) {
      setWalletRecharges(cached.data);
      return;
    }
    setWalletDetailLoading(true);
    try {
      const res = await (request.get('/finance/recharges', { params: { user_id: record.id, per_page: 500 } }) as any);
      const data = res.data || [];
      setWalletRecharges(data);
      walletCacheRef.current[record.id] = { data, time: Date.now() };
    } catch (e) {
      console.error('获取充值记录失败', e);
      setWalletRecharges([]);
    } finally {
      setWalletDetailLoading(false);
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
      render: (text: string) => (
        <Text code style={{ color: '#fff', padding: '2px 6px', whiteSpace: 'nowrap', fontSize: 13 }}>{text}</Text>
      ),
    },
    {
      title: t('users.username'),
      dataIndex: 'username',
      key: 'username',
      width: 320,
      render: (text: string, record: User) => (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <Space align="center" style={{ flexWrap: 'wrap' }}>
            <UserOutlined />
            <Text strong>{text}</Text>
            {record.nickname && <Text type="secondary">({record.nickname})</Text>}
            <Tag color={record.is_active ? 'success' : 'error'} style={{ fontSize: 11, padding: '0 4px', margin: 0, whiteSpace: 'nowrap' }}>
              {record.is_active ? t('common.active') : t('common.disabled')}
            </Tag>
          </Space>
          {record.referred_by && (() => {
            const referrer = allUsers.find(u => u.id === record.referred_by || u.uid === record.referred_by || u.username === record.referred_by);
            return (
              <Text type="secondary" style={{ fontSize: '12px', marginTop: 4 }}>
                推荐人: {referrer ? `${referrer.username} (UID: ${referrer.uid})` : record.referred_by}
              </Text>
            );
          })()}
          <div style={{ maxWidth: 280, display: 'flex', marginTop: 4 }}>
          <Text 
            type="secondary" 
            style={{ fontSize: '12px', width: '100%' }}
            ellipsis={{ tooltip: record.admin_remark || '添加备注' }}
            editable={{
              text: record.admin_remark || '',
              onChange: async (val) => {
                if (val === record.admin_remark) return;
                try {
                  await request.put(`/users/${record.id}`, { admin_remark: val });
                  setAllUsers(prev => prev.map(u => u.id === record.id ? { ...u, admin_remark: val } : u));
                  setUsers(prev => prev.map(u => u.id === record.id ? { ...u, admin_remark: val } : u));
                } catch (e) {
                  console.error('Failed to update remark:', e);
                  message.error('备注更新失败');
                }
              },
              tooltip: '点击编辑用户备注',
              triggerType: ['icon']
            }}
          >
            {record.admin_remark || '添加备注'}
          </Text>
          </div>
          {/* 模型单独折扣标识：悬浮展示具体 mid 及折扣倍率 */}
          {(() => {
            const md: Record<string, number> = record.model_discounts ? (() => { try { return JSON.parse(record.model_discounts); } catch { return {}; } })() : {};
            const entries = Object.entries(md);
            if (entries.length === 0) return null;
            const content = (
              <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                {entries.map(([mid, discount]) => {
                  const model = availableModels.find((m: any) => m.mid === mid);
                  const hasLimit = model?.site_discount_enabled === 1;
                  const limit = hasLimit ? Number(model.site_discount || 1) : null;
                  const isLimited = hasLimit && discount < limit!;
                  const actualDiscount = isLimited ? limit : discount;

                  return (
                    <div key={mid} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 1fr) 85px 85px 85px', gap: 12, padding: '4px 0', fontSize: 12, alignItems: 'center' }}>
                      <span style={{ opacity: 0.85, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={model ? model.name : mid}>
                        {model ? model.name : mid}
                      </span>
                      <span style={{ textAlign: 'right', fontWeight: 500, color: discount < 1 ? '#52c41a' : discount > 1 ? '#ff4d4f' : undefined, textDecoration: isLimited ? 'line-through' : 'none', opacity: isLimited ? 0.6 : 1 }}>
                        设置: {discount}x
                      </span>
                      <span style={{ textAlign: 'right', color: '#faad14' }}>
                        {hasLimit ? `限价: ${limit}x` : ''}
                      </span>
                      <span style={{ textAlign: 'right', fontWeight: 'bold', color: actualDiscount! < 1 ? '#52c41a' : actualDiscount! > 1 ? '#ff4d4f' : undefined }}>
                        实际: {actualDiscount}x
                      </span>
                    </div>
                  );
                })}
              </div>
            );
            return (
              <div style={{ marginTop: 4 }}>
                <Tooltip title={content} placement="right" overlayStyle={{ maxWidth: 500 }}>
                  <Tag color="orange" style={{ width: 'fit-content', fontSize: 11, padding: '0 6px', margin: 0, cursor: 'pointer', lineHeight: '20px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <span>🏷️</span>
                    <span>模型折扣({entries.length})</span>
                  </Tag>
                </Tooltip>
              </div>
            );
          })()}
        </div>
      ),
    },
    {
      title: '注册信息',
      key: 'registration_info',
      width: 280,
      render: (_: any, record: User) => (
        <Space direction="vertical" size={2} style={{ fontSize: '13px' }}>
          {isRealEmail(record.email) && <div style={{ display: 'flex' }}><Text type="secondary" style={{ whiteSpace: 'nowrap' }}>邮箱: </Text><Text type="secondary" style={{ marginLeft: 4, maxWidth: 220 }} ellipsis={{ tooltip: record.email }}>{record.email}</Text></div>}
          {record.mobile && <Text type="secondary">手机号: {record.mobile}</Text>}
          <Text type="secondary">注册 IP: {record.register_ip || '未知'}</Text>
          <Text type="secondary">加入时间: {formatApiDateTime(record.created_at)}</Text>
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
      title: (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <span>钱包余额</span>
          <Select
            size="small"
            value={walletTimeFilter}
            onChange={(v) => {
              setWalletTimeFilter(v);
              localStorage.setItem('walletTimeFilter', v);
            }}
            bordered={false}
            options={[
              { label: '全部数据', value: 'all' },
              { label: '当月数据', value: 'month' },
            ]}
            style={{ width: 100, marginLeft: 8 }}
            popupMatchSelectWidth={false}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ),
      key: 'balance',
      width: 320,
      render: (_: unknown, record: User) => (
        <WalletBalanceDisplay 
          record={record} 
          onWalletClick={openWalletDetail} 
          width={140} 
          gap={20} 
          totalRecharge={allStatsMap[record.id]?.recharge_amount}
          totalGiftRecharge={allStatsMap[record.id]?.gift_amount}
          monthStats={walletTimeFilter === 'month' ? monthStatsMap[record.id] : undefined}
        />
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

  const columns = (isAdminPage ? baseColumns.filter(c => c.key !== 'balance') : baseColumns).map((col: any) => ({
    ...col,
    width: columnsWidths[col.key as string] || col.width || 150,
    onHeaderCell: (column: any) => ({
      width: column.width,
      onResize: handleResize(column.key as string),
    }),
  }));

  return (
    <Card variant="borderless">
      {!isModalVisible ? (
      <>
      <div style={{ display: 'flex', flexDirection: screens.xs ? 'column' : 'row', justifyContent: 'space-between', marginBottom: 12, gap: 12 }}>
        <Title level={screens.xs ? 4 : 2} style={{ margin: 0 }}>
          {isAdminPage ? t('menu.admin_list') : t('menu.user_list')}
        </Title>
        <Space wrap>
          {!isAdminPage && (
            <>
              <Select
                value={filterGroup}
                onChange={setFilterGroup}
                style={{ width: screens.xs ? '100%' : 200 }}
                options={[
                  { value: 'all', label: '全部用户等级' },
                  ...userLevels.map(level => ({ value: level.group_key, label: `${level.name} (${level.discount}x)` }))
                ]}
              />
              {screens.xs && (
                <Select
                  value={walletTimeFilter}
                  onChange={(v) => {
                    setWalletTimeFilter(v);
                    localStorage.setItem('walletTimeFilter', v);
                  }}
                  options={[
                    { label: '全部钱包数据', value: 'all' },
                    { label: '当月钱包数据', value: 'month' },
                  ]}
                  style={{ width: '100%' }}
                />
              )}
            </>
          )}
          <Input 
            prefix={<SearchOutlined style={{ color: 'var(--ant-color-text-quaternary, #bfbfbf)' }} />}
            placeholder="搜索用户名/ID/昵称/邮箱/手机号/IP/备注..." 
            allowClear 
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)} 
            onBlur={() => setSearchText(searchText.trim())}
            onPressEnter={(e) => setSearchText((e.target as HTMLInputElement).value.trim())}
            style={{ width: screens.xs ? '100%' : 280 }}
          />
          {!isAdminPage && (
            <Input 
              prefix={<SearchOutlined style={{ color: 'var(--ant-color-text-quaternary, #bfbfbf)' }} />}
              placeholder="搜索推荐人(UID/用户名/昵称)..." 
              allowClear 
              value={filterReferrer}
              onChange={(e) => setFilterReferrer(e.target.value)} 
              onBlur={() => setFilterReferrer(filterReferrer.trim())}
              onPressEnter={(e) => setFilterReferrer((e.target as HTMLInputElement).value.trim())}
              style={{ width: screens.xs ? '100%' : 220 }}
            />
          )}
          {isAdminPage && <Button icon={<SyncOutlined />} onClick={fetchUsers}>{t('common.refresh')}</Button>}
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
                {isRealEmail(record.email) && <CardRow label="邮箱"><Text style={{ fontSize: 12 }}>{record.email}</Text></CardRow>}
                {record.mobile && <CardRow label="手机号"><Text style={{ fontSize: 12 }}>{record.mobile}</Text></CardRow>}
                
                {/* 推荐人 */}
                {record.referred_by && (() => {
                  const referrer = allUsers.find(u => u.id === record.referred_by || u.uid === record.referred_by || u.username === record.referred_by);
                  return (
                    <CardRow label="推荐人">
                      <Text type="secondary" style={{ fontSize: '12px' }}>
                        {referrer ? `${referrer.username} (UID: ${referrer.uid})` : record.referred_by}
                      </Text>
                    </CardRow>
                  );
                })()}

                {/* 备注 (可编辑) */}
                <CardRow label="备注">
                  <div style={{ maxWidth: 200, display: 'flex', justifyContent: 'flex-end' }}>
                    <Text 
                      type="secondary" 
                      style={{ fontSize: '12px', textAlign: 'right' }}
                      ellipsis={{ tooltip: record.admin_remark || '添加备注' }}
                      editable={{
                        text: record.admin_remark || '',
                        onChange: async (val) => {
                          if (val === record.admin_remark) return;
                          try {
                            await request.put(`/users/${record.id}`, { admin_remark: val });
                            setAllUsers(prev => prev.map(u => u.id === record.id ? { ...u, admin_remark: val } : u));
                            setUsers(prev => prev.map(u => u.id === record.id ? { ...u, admin_remark: val } : u));
                          } catch (e) {
                            console.error('Failed to update remark:', e);
                            message.error('备注更新失败');
                          }
                        },
                        tooltip: '点击编辑用户备注',
                        triggerType: ['icon']
                      }}
                    >
                      {record.admin_remark || '添加备注'}
                    </Text>
                  </div>
                </CardRow>

                {/* 模型单独折扣标识 */}
                {(() => {
                  const md: Record<string, number> = record.model_discounts ? (() => { try { return JSON.parse(record.model_discounts); } catch { return {}; } })() : {};
                  const entries = Object.entries(md);
                  if (entries.length === 0) return null;
                  const content = (
                    <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                      {entries.map(([mid, discount]) => {
                        const model = availableModels.find((m: any) => m.mid === mid);
                        const hasLimit = model?.site_discount_enabled === 1;
                        const limit = hasLimit ? Number(model.site_discount || 1) : null;
                        const isLimited = hasLimit && discount < limit!;
                        const actualDiscount = isLimited ? limit : discount;
                        return (
                          <div key={mid} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 1fr) 85px 85px 85px', gap: 12, padding: '4px 0', fontSize: 12, alignItems: 'center' }}>
                            <span style={{ opacity: 0.85, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={model ? model.name : mid}>
                              {model ? model.name : mid}
                            </span>
                            <span style={{ textAlign: 'right', fontWeight: 500, color: discount < 1 ? '#52c41a' : discount > 1 ? '#ff4d4f' : undefined, textDecoration: isLimited ? 'line-through' : 'none', opacity: isLimited ? 0.6 : 1 }}>
                              设置: {discount}x
                            </span>
                            <span style={{ textAlign: 'right', color: '#faad14' }}>
                              {hasLimit ? `限价: ${limit}x` : ''}
                            </span>
                            <span style={{ textAlign: 'right', fontWeight: 'bold', color: actualDiscount! < 1 ? '#52c41a' : actualDiscount! > 1 ? '#ff4d4f' : undefined }}>
                              实际: {actualDiscount}x
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                  return (
                    <CardRow label="模型折扣">
                      <Tooltip title={content} placement="topRight" overlayStyle={{ maxWidth: '90vw' }}>
                        <Tag color="orange" style={{ fontSize: 11, padding: '0 6px', margin: 0, cursor: 'pointer', borderRadius: 4 }}>
                          🏷️ 已设({entries.length})
                        </Tag>
                      </Tooltip>
                    </CardRow>
                  );
                })()}

                {isAdminPage ? (
                  <CardRow label="分组">
                    {(() => {
                      const adminGroup = adminGroups.find((g: any) => g.id === record.admin_group_id);
                      return <Tag color="purple">{adminGroup ? adminGroup.name : '超级管理员'}</Tag>;
                    })()}
                  </CardRow>
                ) : (
                  <CardRow label="等级">
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                      <Tag color={record.user_group === 'vip' ? 'gold' : record.user_group === 'partner' ? 'cyan' : 'default'} style={{ margin: 0 }}>
                        {levelName}
                      </Tag>
                      {level && (
                        <Text type="secondary" style={{ fontSize: '12px' }}>
                          折扣倍率: {level.discount}x
                        </Text>
                      )}
                    </div>
                  </CardRow>
                )}

                {!isAdminPage && (
                  <div style={{ padding: '8px 0', borderBottom: '1px solid var(--ant-color-border-secondary)', borderTop: '1px solid var(--ant-color-border-secondary)', marginTop: 8 }}>
                    <div style={{ marginBottom: 8 }}>
                      <Text type="secondary" style={{ fontSize: 13 }}>钱包数据</Text>
                    </div>
                    <WalletBalanceDisplay 
                      record={record} 
                      onWalletClick={openWalletDetail} 
                      totalRecharge={allStatsMap[record.id]?.recharge_amount}
                      totalGiftRecharge={allStatsMap[record.id]?.gift_amount}
                      monthStats={walletTimeFilter === 'month' ? monthStatsMap[record.id] : undefined}
                      gap={12}
                    />
                  </div>
                )}
                <CardRow label="注册IP"><Text type="secondary" style={{ fontSize: 12 }}>{record.register_ip || '未知'}</Text></CardRow>
                <CardRow label="加入时间"><Text type="secondary" style={{ fontSize: 12 }}>{formatApiDateTime(record.created_at, 'MM-DD HH:mm')}</Text></CardRow>
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
          components={{
            header: {
              cell: ResizableTitle,
            },
          }}
          className="compact-table"
          dataSource={displayedUsers}
          columns={columns}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={{ 
            pageSize: 50, 
            pageSizeOptions: ['50', '100', '200'], 
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条数据`
          }}
          scroll={{ x: 'max-content' }}
        />
      )}
      </>
      ) : (
        <div style={{ animation: 'fadeIn 0.3s' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12, gap: 16 }}>
            <Button icon={<ArrowLeftOutlined />} onClick={() => setIsModalVisible(false)}>返回</Button>
            <Title level={3} style={{ margin: 0 }}>
              {editingUser ? t('users.edit_user') : (isAdminPage ? '添加管理员' : '添加普通用户')}
            </Title>
          </div>
          <div style={{ maxWidth: 1200, width: '100%' }}>
            <Form form={form} layout="vertical" onFinish={handleSave}>
              <Tabs
                defaultActiveKey="1"
                items={[
                  {
                    key: '1',
                    label: '用户基本信息',
                    children: (
                      <>
          <Form.Item
            name="username"
            label={t('users.username')}
            rules={[
              { required: true, message: '请输入用户名' },
              {
                validator: (_, val) =>
                  (editingUser && val === editingUser.username) || !val || (val.length >= 5 && val.length <= 48)
                    ? Promise.resolve()
                    : Promise.reject(new Error(val.length < 5 ? '用户名长度不能少于 5 个字符' : '正确输入用户名限制为 48 字'))
              }
            ]}
          >
            <Input placeholder={t('users.username')} />
          </Form.Item>
          <Form.Item
            name="nickname"
            label="用户昵称"
            rules={[{ max: 24, message: '昵称长度最多不能超过 24 个字符' }]}
          >
            <Input placeholder="输入用户昵称" />
          </Form.Item>
          <Form.Item name="admin_remark" label="用户备注 (管理员可见)">
            <Input.TextArea placeholder="写入简便备注例如: vip客户" rows={3} autoSize={{ minRows: 2, maxRows: 6 }} />
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
                value: String(u.id),
                label: `${u.username} ${u.nickname ? `(${u.nickname})` : ''} - UID: ${u.uid || u.id} ${isRealEmail(u.email) ? `(${u.email})` : ''}`
              }))}
            />
          </Form.Item>
          <Form.Item name="mobile" label="手机号">
            <Input placeholder="输入用户手机号 (可选)" />
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
            <Form.Item name="admin_group_id" label="管理员等级" tooltip="未分配则默认为全权限超级管理员">
              <Select placeholder="选择分组" allowClear>
                {adminGroups.map(group => (
                  <Option key={group.id} value={group.id}>{group.name}</Option>
                ))}
              </Select>
            </Form.Item>
          )}
          {!isAdminPage && !editingUser && (
            <div style={{ display: 'flex', gap: 16 }}>
              <Form.Item name="balance" label={`系统钱包余额 (${currencySymbol})`} initialValue={0} style={{ flex: 1 }}>
                <InputNumber style={{ width: '100%' }} precision={6} min={0} />
              </Form.Item>
              <Form.Item name="gift_balance" label={`赠送钱包余额 (${currencySymbol})`} initialValue={0} style={{ flex: 1 }}>
                <InputNumber style={{ width: '100%' }} precision={6} min={0} />
              </Form.Item>
            </div>
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
          <Form.Item name="is_active" label={t('common.status')} initialValue={1}>
            <Select>
              <Option value={1}>{t('common.active')}</Option>
              <Option value={0}>{t('common.disabled')}</Option>
            </Select>
          </Form.Item>
                      </>
                    )
                  },
                  ...(editingUser ? [{
                    key: '2',
                    label: '用户详细',
                    children: (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 8 }}>
                        <div>
                          <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>注册时间:</Typography.Text>
                          <Typography.Text>{editingUser.created_at ? formatApiDateTime(editingUser.created_at) : '未知'}</Typography.Text>
                        </div>
                        <div>
                          <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>最后活跃时间:</Typography.Text>
                          <Typography.Text>{editingUser.updated_at ? formatApiDateTime(editingUser.updated_at) : '未知'}</Typography.Text>
                        </div>
                        <div>
                          <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>注册 IP:</Typography.Text>
                          <Typography.Text>{editingUser.register_ip || '未知'}</Typography.Text>
                        </div>
                        <div>
                          <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>关联记录 (流转记录):</Typography.Text>
                          <div style={{ padding: '16px 16px 0', background: 'var(--ant-color-fill-quaternary, rgba(0,0,0,0.02))', borderRadius: 8, minHeight: 100, border: '1px solid var(--ant-color-border-secondary, #f0f0f0)' }}>
                            {editingUser.referral_history ? (
                              <Timeline 
                                items={editingUser.referral_history.split('\n').filter(line => line.trim()).map(line => {
                                  const match = line.match(/^\[(.*?)\]\s*(.*)$/);
                                  if (match) {
                                    return {
                                      color: 'blue',
                                      children: (
                                        <>
                                          <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>{match[1]}</Typography.Text>
                                          <Typography.Text style={{ marginTop: 2, display: 'block' }}>{match[2]}</Typography.Text>
                                        </>
                                      )
                                    };
                                  }
                                  return { children: <Typography.Text>{line}</Typography.Text> };
                                }).reverse()}
                              />
                            ) : (
                              <Typography.Text type="secondary">暂无流转记录</Typography.Text>
                            )}
                          </div>
                        </div>
                         {/* 等级变更记录（仅非管理员页面显示） */}
                         {!isAdminPage && (
                           <div>
                             <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>等级变更记录:</Typography.Text>
                             <div style={{ padding: '16px 16px 0', background: 'var(--ant-color-fill-quaternary, rgba(0,0,0,0.02))', borderRadius: 8, minHeight: 60, border: '1px solid var(--ant-color-border-secondary, #f0f0f0)' }}>
                               {levelLogsLoading ? (
                                 <div style={{ textAlign: 'center', padding: '12px 0' }}><Spin size="small" /></div>
                               ) : levelLogs.length === 0 ? (
                                 <Typography.Text type="secondary">暂无等级变更记录</Typography.Text>
                               ) : (
                                 <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                                   <Timeline
                                     items={levelLogs.map((log: any) => {
                                       const sourceMap: Record<string, { label: string; color: string }> = {
                                         admin: { label: '管理员', color: 'blue' },
                                         marketing: { label: '推广负责人', color: 'purple' },
                                         system: { label: '系统自动', color: 'default' },
                                       };
                                       const src = sourceMap[log.source] || { label: log.source, color: 'default' };
                                       return {
                                         color: src.color === 'blue' ? 'blue' : src.color === 'purple' ? 'purple' : 'gray',
                                         children: (
                                           <div style={{ paddingBottom: 4 }}>
                                             <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                                               <Text type="secondary" style={{ fontSize: 12 }}>
                                                 {formatApiDateTime(log.created_at)}
                                               </Text>
                                               <Tag color={src.color === 'blue' ? 'blue' : src.color === 'purple' ? 'purple' : 'default'} style={{ fontSize: 11, margin: 0 }}>
                                                 {src.label}
                                               </Tag>
                                             </div>
                                             <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                               <Tag color="default" style={{ fontSize: 12, margin: 0 }}>
                                                 {log.old_level_name || log.old_level || '—'}
                                               </Tag>
                                               <Text style={{ fontSize: 12 }}>→</Text>
                                               <Tag color="success" style={{ fontSize: 12, margin: 0 }}>
                                                 {log.new_level_name || log.new_level || '—'}
                                               </Tag>
                                             </div>
                                             <div style={{ marginTop: 4 }}>
                                               <Text type="secondary" style={{ fontSize: 12 }}>
                                                 操作人：{log.operator || '未知'}
                                                 {log.remark ? `  ·  ${log.remark}` : ''}
                                               </Text>
                                             </div>
                                           </div>
                                         ),
                                       };
                                     })}
                                   />
                                 </div>
                               )}
                             </div>
                           </div>
                         )}
                       </div>
                     )
                   },
                  {
                    key: '3',
                    label: '账号绑定',
                    children: (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 8 }}>
                        {[{
                          label: '📧 邮箱',
                          bound: isRealEmail(editingUser.email),
                          value: isRealEmail(editingUser.email) ? editingUser.email : null,
                        }, {
                          label: '📱 手机号',
                          bound: !!editingUser.mobile,
                          value: editingUser.mobile || null,
                        }, {
                          label: '🔵 Google',
                          bound: !!editingUser.google_id,
                          value: editingUser.google_name || editingUser.google_id || null,
                        }, {
                          label: '💬 微信',
                          bound: !!editingUser.wechat_id,
                          value: editingUser.wechat_name || editingUser.wechat_id || null,
                        }].map(item => (
                          <div key={item.label} style={{ padding: '12px 16px', borderRadius: 8, background: 'var(--ant-color-fill-quaternary, rgba(0,0,0,0.02))', border: '1px solid var(--ant-color-border-secondary, #f0f0f0)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Space>
                              <Typography.Text strong>{item.label}</Typography.Text>
                              {item.bound && item.value && <Typography.Text type="secondary" style={{ fontSize: 13 }}>{item.value}</Typography.Text>}
                            </Space>
                            <Tag color={item.bound ? 'success' : 'default'}>{item.bound ? '已绑定' : '未绑定'}</Tag>
                          </div>
                        ))}
                      </div>
                    )
                  }] : []),
                  // ── 支付设置 Tab（仅非管理员页面显示） ──
                  ...(!isAdminPage ? [{
                    key: '5',
                    label: '支付设置',
                    children: (
                      <div style={{ marginTop: 8 }}>
                        <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 16, fontSize: 13 }}>
                          控制该用户是否可使用在线充值功能。关闭后，用户端资产中心将不显示在线充值按钮，且无法发起任何支付请求。
                        </Typography.Text>
                        <div style={{ padding: '16px 20px', background: _isLight ? '#f9fafb' : 'rgba(255,255,255,0.04)', borderRadius: 8, border: _isLight ? '1px solid #e5e4e7' : '1px solid rgba(255,255,255,0.1)' }}>
                          <Form.Item
                            name="pay_enabled"
                            label="在线支付"
                            initialValue={1}
                            style={{ marginBottom: 0 }}
                            extra="开启后用户可在资产中心使用在线充值功能（支付宝、微信、Stripe、加密货币等）"
                          >
                            <Radio.Group buttonStyle="solid" optionType="button">
                              <Radio value={1}>✅ 允许支付</Radio>
                              <Radio value={0}>🚫 禁止支付</Radio>
                            </Radio.Group>
                          </Form.Item>
                        </div>
                      </div>
                    )
                  }] : []),
                  // ── 模型折扣 Tab（仅编辑模式 + 非管理员页面） ──
                  ...((editingUser && !isAdminPage) ? [{
                    key: '4',
                    label: '模型折扣',
                    children: (
                      <div style={{ marginTop: 8 }}>
                        <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 16, fontSize: 13 }}>
                          为该用户针对特定模型设置单独折扣。系统取 MIN(用户模型折扣, 全站折扣, 等级折扣) 中最低值，若模型开启折扣限价则 MAX(最低折扣, 限价) 保底。
                        </Typography.Text>
                        <Row gutter={24}>
                          {/* 左侧：已选模型及折扣设置 */}
                          <Col xs={24} md={10}>
                            <div style={{ padding: 16, background: _isLight ? '#f9fafb' : 'rgba(255,255,255,0.04)', borderRadius: 8, minHeight: 300 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                <Text strong>已选模型折扣 ({discountMids.length})</Text>
                              </div>
                              {discountMids.length === 0 ? (
                                <Text type="secondary" style={{ fontSize: 13 }}>从右侧选择模型后设置折扣</Text>
                              ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 500, overflowY: 'auto' }}>
                                  {discountMids.map(mid => {
                                    const model = availableModels.find((m: any) => m.mid === mid);
                                    const discount = discountMap[mid];
                                    const siteDiscount = model?.site_discount_enabled ? model.site_discount : null;
                                    return (
                                      <div key={mid} style={{ padding: '8px 12px', background: _isLight ? '#fff' : 'rgba(255,255,255,0.06)', borderRadius: 6, border: _isLight ? '1px solid #e5e4e7' : '1px solid rgba(255,255,255,0.1)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                          <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontWeight: 500, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                              {model ? model.name : mid}
                                              {model?.remark && <span style={{ color: 'var(--text-secondary)', fontWeight: 'normal', marginLeft: 4, fontSize: 11 }}>({model.remark})</span>}
                                            </div>
                                            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{model ? model.model_id : ''} · MID: {mid}</div>
                                          </div>
                                          <Button
                                            type="text"
                                            size="small"
                                            icon={<CloseOutlined style={{ fontSize: 10 }} />}
                                            style={{ width: 20, height: 20, minWidth: 20, color: 'var(--text-secondary)' }}
                                            onClick={() => {
                                              setDiscountMids(prev => prev.filter(id => id !== mid));
                                              setDiscountMap(prev => { const n = { ...prev }; delete n[mid]; return n; });
                                            }}
                                          />
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                          <InputNumber
                                            size="small"
                                            min={siteDiscount !== null ? siteDiscount : 0}
                                            max={2}
                                            step={0.05}
                                            precision={2}
                                            value={discount}
                                            onChange={(val) => setDiscountMap(prev => ({ ...prev, [mid]: val ?? 1 }))}
                                            style={{ width: 100 }}
                                            placeholder="折扣倍率"
                                            addonAfter="x"
                                          />
                                          <Text type="secondary" style={{ fontSize: 11 }}>
                                            {discount !== undefined ? `${(discount * 100).toFixed(0)}%` : '未设置'}
                                          </Text>
                                          {siteDiscount !== null && (
                                            <Tag color="orange" style={{ margin: 0, fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>
                                              限价 {siteDiscount}x
                                            </Tag>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </Col>
                          {/* 右侧：ModelSelector 选择模型 */}
                          <Col xs={24} md={14}>
                            <div style={{ padding: 16, background: _isLight ? '#fff' : 'rgba(255,255,255,0.02)', border: _isLight ? '1px solid #e5e4e7' : '1px solid rgba(255,255,255,0.08)', borderRadius: 8 }}>
                              <ModelSelector
                                selectedMids={discountMids}
                                onSelectionChange={(mids) => {
                                  setDiscountMids(mids);
                                }}
                                onModelsLoaded={(models) => setAvailableModels(models)}
                                allowDuplicateModelId={true}
                                isLightTheme={_isLight}
                                title="选择模型"
                              />
                            </div>
                          </Col>
                        </Row>
                      </div>
                    )
                  }] : [])
                ]}
              />

              <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
                <Button type="primary" onClick={() => form.submit()}>保存</Button>
                <Button onClick={() => setIsModalVisible(false)}>取消</Button>
              </div>
            </Form>
          </div>
        </div>
      )}

      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <WalletOutlined style={{ color: '#1677ff' }} />
            <span>{t('users.recharge')}</span>
          </div>
        }
        open={isRechargeModalVisible}
        onCancel={() => setIsRechargeModalVisible(false)}
        onOk={() => rechargeForm.submit()}
        confirmLoading={rechargeLoading}
        width={500}
        destroyOnClose
      >
        <div style={{ 
          padding: '16px 20px', 
          background: _isLight ? '#f8f9fa' : 'rgba(255,255,255,0.02)', 
          borderRadius: 12, 
          marginBottom: 24,
          border: `1px solid ${_isLight ? '#f0f0f0' : 'rgba(255,255,255,0.06)'}`,
          boxShadow: _isLight ? '0 2px 8px rgba(0,0,0,0.02)' : 'inset 0 1px 1px rgba(255,255,255,0.02)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ 
              width: 32, height: 32, borderRadius: '50%', 
              background: _isLight ? '#e6f4ff' : 'rgba(22,119,255,0.15)', 
              display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 12 
            }}>
              <UserOutlined style={{ fontSize: 16, color: '#1677ff' }} />
            </div>
            <div>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', lineHeight: 1.2 }}>{t('users.username')}</Text>
              <Text strong style={{ fontSize: 16, lineHeight: 1.2 }}>{rechargingUser?.username}</Text>
            </div>
          </div>
          
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px 32px' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <Text type="secondary" style={{ fontSize: 12, marginBottom: 4 }}>系统钱包余额</Text>
              <Text strong style={{ color: '#1677ff', fontSize: 18, fontFamily: 'monospace' }}>{currencySymbol}{(rechargingUser?.balance || 0).toFixed(6)}</Text>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <Text type="secondary" style={{ fontSize: 12, marginBottom: 4 }}>赠送钱包余额</Text>
              <Text strong style={{ color: '#faad14', fontSize: 18, fontFamily: 'monospace' }}>🎁 {currencySymbol}{(rechargingUser?.gift_balance || 0).toFixed(6)}</Text>
            </div>
            {((rechargingUser?.credit_limit || 0) > 0) && (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <Text type="secondary" style={{ fontSize: 12, marginBottom: 4 }}>信控额度</Text>
                <Text strong style={{ color: '#1890ff', fontSize: 18, fontFamily: 'monospace' }}>💳 {currencySymbol}{(rechargingUser?.credit_limit || 0).toFixed(6)}</Text>
              </div>
            )}
          </div>
        </div>

        <Form form={rechargeForm} layout="vertical" onFinish={handleRechargeSave} initialValues={{ actionType: 'increase', amount: '', walletType: 'system' }}>
          <Form.Item name="walletType" label={<Text strong>充值到哪个钱包</Text>} rules={[{ required: true }]}>
            <Radio.Group style={{ width: '100%', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <Radio.Button value="system" style={{ borderRadius: 6 }}>系统钱包 (正常充值)</Radio.Button>
              <Radio.Button value="gift" style={{ borderRadius: 6 }}>赠送钱包 (活动赠送)</Radio.Button>
              <Radio.Button value="credit" style={{ borderRadius: 6 }}>💳 信控额度</Radio.Button>
            </Radio.Group>
          </Form.Item>
          
          <Form.Item name="actionType" label={<Text strong>操作类型</Text>} rules={[{ required: true }]}>
            <Radio.Group style={{ width: '100%', display: 'flex', gap: 8 }}>
              <Radio.Button value="increase" style={{ flex: 1, textAlign: 'center', borderRadius: 6 }}>
                增加金额 (+)
              </Radio.Button>
              <Radio.Button value="decrease" style={{ flex: 1, textAlign: 'center', borderRadius: 6 }}>
                减少金额 (-)
              </Radio.Button>
            </Radio.Group>
          </Form.Item>
          
          <Form.Item 
            name="amount" 
            label={<Text strong>{t('users.adjustment_amount')}</Text>} 
            rules={[
              { required: true, message: '请输入调整金额' },
              {
                validator: async (_, value) => {
                  if (value === undefined || value === null || value === '') {
                    return Promise.resolve();
                  }
                  const num = Number(value);
                  if (isNaN(num) || !isFinite(num)) {
                    return Promise.reject(new Error('请输入有效的数字金额'));
                  }
                  const reg = /^-?\d+(\.\d{1,6})?$/;
                  if (!reg.test(value.toString())) {
                    return Promise.reject(new Error('请输入正确的金额格式（最多保留六位小数，可为负数）'));
                  }
                  return Promise.resolve();
                }
              }
            ]}
          >
            <Input 
              style={{ width: '100%' }} 
              size="large"
              prefix={<span style={{ color: 'var(--ant-color-text-secondary)', marginRight: 4 }}>{currencySymbol}</span>}
              placeholder="0.000000"
            />
          </Form.Item>
          
          <div style={{ marginBottom: 20 }}>
            <Text type="secondary" style={{ fontSize: 13, marginBottom: 10, display: 'block' }}>
              快捷输入：<span style={{ color: '#1677ff', fontWeight: 500 }}>{
                rechargeWalletType === 'system' ? '系统钱包 (正常充值)' : 
                rechargeWalletType === 'gift' ? '赠送钱包 (活动赠送)' : '💳 信控额度'
              }</span>
            </Text>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(4, 1fr)', 
              gap: 12 
            }}>
              {[10, 20, 50, 100, 500, 1000, 5000, 10000].map(val => (
                <Button 
                  key={val} 
                  style={{ 
                    borderRadius: 8,
                    height: 36,
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 500,
                    color: rechargeActionType === 'decrease' ? '#ff4d4f' : '#52c41a', 
                    borderColor: rechargeActionType === 'decrease' ? 'rgba(255, 77, 79, 0.5)' : 'rgba(82, 196, 26, 0.5)',
                    background: rechargeActionType === 'decrease' ? 'rgba(255, 77, 79, 0.04)' : 'rgba(82, 196, 26, 0.04)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = rechargeActionType === 'decrease' ? '#ff4d4f' : '#52c41a';
                    e.currentTarget.style.background = rechargeActionType === 'decrease' ? 'rgba(255, 77, 79, 0.1)' : 'rgba(82, 196, 26, 0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = rechargeActionType === 'decrease' ? 'rgba(255, 77, 79, 0.5)' : 'rgba(82, 196, 26, 0.5)';
                    e.currentTarget.style.background = rechargeActionType === 'decrease' ? 'rgba(255, 77, 79, 0.04)' : 'rgba(82, 196, 26, 0.04)';
                  }}
                  onClick={() => {
                    const cur = rechargeForm.getFieldValue('amount') || 0;
                    rechargeForm.setFieldsValue({ amount: Math.round((cur + val) * 1_000_000) / 1_000_000 });
                  }}
                >
                  {rechargeActionType === 'decrease' ? '-' : '+'}{val}
                </Button>
              ))}
            </div>
          </div>
          
          <Form.Item name="remark" label={<Text strong>{t('users.remark')}</Text>} style={{ marginBottom: 0 }}>
            <Input.TextArea rows={3} placeholder="输入调整备注信息 (必填/选填，建议填写以便后续对账)" style={{ borderRadius: 8 }} />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── 钱包明细弹窗 ── */}
      <Modal
        title={`${walletDetailUser?.username || ''} 的钱包明细`}
        open={!!walletDetailUser}
        onCancel={() => { setWalletDetailUser(null); setWalletRecharges([]); }}
        footer={null}
        width={800}
        destroyOnClose
      >
        {walletDetailUser && (
          <WalletDetailsView 
            key={walletDetailUser.id}
            user={walletDetailUser} 
            recharges={walletRecharges} 
            loading={walletDetailLoading} 
          />
        )}
      </Modal>
    </Card>
  );
};

export default Users;

