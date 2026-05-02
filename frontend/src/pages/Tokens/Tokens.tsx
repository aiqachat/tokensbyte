import React, { useEffect, useState } from 'react';
import { Table, Button, Space, Tag, Modal, Form, Input, InputNumber, message, Popconfirm, Card, Typography, Tooltip, Row, Col, Grid, Switch, theme, Spin } from 'antd';
import MobileCardList, { MobileCard, CardRow, CardActions } from '../../components/MobileCardList';
import { PlusOutlined, EditOutlined, DeleteOutlined, CopyOutlined, SyncOutlined, EyeOutlined, EyeInvisibleOutlined, KeyOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';
import type { ApiToken } from '../../types';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { useBreakpoint } = Grid;

const Tokens: React.FC = () => {
  const { t } = useTranslation();
  const { token: themeToken } = theme.useToken();
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingToken, setEditingToken] = useState<ApiToken | null>(null);
  const [form] = Form.useForm();
  const [passwordForm] = Form.useForm();
  const screens = useBreakpoint();
  const [saving, setSaving] = useState(false);
  const [enableModelFilter, setEnableModelFilter] = useState(false);

  // 密钥明文展示状态
  const [revealModalVisible, setRevealModalVisible] = useState(false);
  const [revealingTokenId, setRevealingTokenId] = useState<number | null>(null);
  const [revealedKeys, setRevealedKeys] = useState<Record<number, string>>({});
  const [revealLoading, setRevealLoading] = useState(false);

  const fetchTokens = async () => {
    setLoading(true);
    try {
      const resp = await (request.get('/tokens') as unknown as Promise<{ data: ApiToken[] }>);
      setTokens(resp.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTokens();
  }, []);

  const handleCopy = (key: string) => {
    navigator.clipboard.writeText(key);
    message.success(t('tokens.copy_success'));
  };

  const handleAdd = () => {
    setEditingToken(null);
    form.resetFields();
    setEnableModelFilter(false);
    setIsModalVisible(true);
  };

  const handleEdit = (record: ApiToken) => {
    setEditingToken(record);
    const models = record.allowed_models ? (typeof record.allowed_models === 'string' ? JSON.parse(record.allowed_models) : record.allowed_models) : [];
    const hasModels = Array.isArray(models) && models.length > 0;
    setEnableModelFilter(hasModels);
    form.setFieldsValue({
      ...record,
      allowed_models: Array.isArray(models) ? models.join('\n') : '',
    });
    setIsModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await request.delete(`/tokens/${id}`);
      message.success(t('common.success'));
      fetchTokens();
    } catch (e) {
      console.error(e);
    }
  };

  const handleSave = async (values: { allowed_models?: string; [key: string]: unknown }) => {
    if (saving) return;
    const data = {
      ...values,
      allowed_models: enableModelFilter
        ? (values.allowed_models?.split('\n').filter((m: string) => m.trim()) || [])
        : [],
    };

    setSaving(true);
    try {
      if (editingToken) {
        await request.put(`/tokens/${editingToken.id}`, data);
        message.success(t('common.success'));
      } else {
        await (request as any).post('/tokens', data, { skipErrorHandler: true });
        message.success(t('common.success'));
      }
      setIsModalVisible(false);
      fetchTokens();
    } catch (e: any) {
      // 提取后端错误信息，关闭弹窗并只显示一次
      const serverMsg = e?.response?.data?.error?.message || e?.message || '创建失败';
      setIsModalVisible(false);
      message.error(serverMsg);
    } finally {
      setSaving(false);
    }
  };

  // 打开密码验证弹窗
  const handleRevealClick = (tokenId: number) => {
    if (revealedKeys[tokenId]) {
      // 已经展示了，点击则隐藏
      setRevealedKeys(prev => {
        const next = { ...prev };
        delete next[tokenId];
        return next;
      });
      return;
    }
    setRevealingTokenId(tokenId);
    passwordForm.resetFields();
    setRevealModalVisible(true);
  };

  // 提交密码验证并展示密钥
  const handleRevealSubmit = async () => {
    try {
      const values = await passwordForm.validateFields();
      setRevealLoading(true);
      const resp = await (request.post(`/tokens/${revealingTokenId}/reveal`, {
        password: values.password,
      }) as unknown as Promise<{ token_key: string }>);
      setRevealedKeys(prev => ({ ...prev, [revealingTokenId!]: resp.token_key }));
      setRevealModalVisible(false);
      message.success('密钥已展示');
    } catch (e: any) {
      // error is handled by request interceptor
      console.error(e);
    } finally {
      setRevealLoading(false);
    }
  };

  // 渲染密钥列内容（桌面端）
  const renderTokenKey = (key: string, record: ApiToken) => {
    const isRevealed = !!revealedKeys[record.id];
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        background: 'rgba(255, 255, 255, 0.04)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '8px',
        padding: '4px 8px 4px 12px',
        width: 'max-content',
      }}>
        {isRevealed ? (
          <Text
            style={{ fontFamily: 'monospace', fontSize: 13, color: '#52c41a', letterSpacing: '0.5px', userSelect: 'all' }}
            copyable={{ text: revealedKeys[record.id] }}
          >
            {revealedKeys[record.id]}
          </Text>
        ) : (
          <Text style={{ fontFamily: 'monospace', fontSize: 13, color: '#1677ff', letterSpacing: '0.5px' }}>
            {key.substring(0, 10)}<span style={{color: '#666', margin: '0 4px'}}>••••••••</span>{key.substring(key.length - 6)}
          </Text>
        )}
        <Tooltip title={t('tokens.copy_hint')}>
          <Button 
            type="text" 
            icon={<CopyOutlined />} 
            size="small" 
            onClick={() => handleCopy(isRevealed ? revealedKeys[record.id] : key)} 
            style={{ color: '#888', marginLeft: 8 }} 
          />
        </Tooltip>
        <Tooltip title={isRevealed ? '隐藏密钥' : '查看完整密钥'}>
          <Button 
            type="text" 
            icon={isRevealed ? <EyeInvisibleOutlined /> : <EyeOutlined />} 
            size="small" 
            onClick={() => handleRevealClick(record.id)} 
            style={{ color: isRevealed ? '#52c41a' : '#888' }} 
          />
        </Tooltip>
      </div>
    );
  };

  const columns = [
    {
      title: t('tokens.name'),
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => <Text strong>{text}</Text>,
    },
    {
      title: 'KID',
      dataIndex: 'kid',
      key: 'kid',
      width: 100,
      render: (kid: string) => kid ? <Tag color="geekblue" style={{ fontFamily: 'monospace', fontSize: 12 }}>{kid}</Tag> : <Text type="secondary">-</Text>,
    },
    {
      title: t('tokens.key'),
      dataIndex: 'token_key',
      key: 'token_key',
      render: (key: string, record: ApiToken) => renderTokenKey(key, record),
    },
    {
      title: t('tokens.usage_quota'),
      key: 'usage',
      render: (record: ApiToken) => (
        <Space direction="vertical" size={2}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t('tokens.used')}: {record.quota_used.toFixed(4)}
          </Text>
          <Text style={{ fontSize: 12 }}>
            {t('tokens.limit')}: {record.quota_limit < 0 ? t('tokens.unlimited') : record.quota_limit}
          </Text>
        </Space>
      ),
    },
    {
      title: t('tokens.limits'),
      key: 'limits',
      render: (record: ApiToken) => (
        <Space direction="vertical" size={2}>
          <Text type="secondary" style={{ fontSize: 12 }}>RPS: {record.rps_limit || '∞'}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>RPM: {record.rpm_limit || '∞'}</Text>
        </Space>
      ),
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
      title: t('users.joined'),
      dataIndex: 'created_at',
      key: 'created_at',
      render: (text: string) => dayjs(text).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: t('common.actions'),
      key: 'actions',
      render: (_: unknown, record: ApiToken) => (
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
    <Card variant="borderless" style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column' }} styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column' } }}>
      {loading && tokens.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Spin size="large" />
        </div>
      ) : tokens.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          <div style={{ marginBottom: 48 }}>
             <Title level={screens.xs ? 4 : 2} style={{ margin: 0, marginBottom: 8 }}>{t('tokens.title')}</Title>
             <Text type="secondary" style={{ fontSize: 14 }}>{t('tokens.subtitle')}</Text>
          </div>
          
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingBottom: '10vh' }}>
             <div style={{
                width: 48, 
                height: 48, 
                background: 'rgba(255, 255, 255, 0.08)',
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 24,
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
             }}>
               <KeyOutlined style={{ fontSize: 24, color: themeToken.colorText }} />
             </div>
             <Title level={4} style={{ margin: 0, marginBottom: 12 }}>{t('tokens.empty_title')}</Title>
             <Text type="secondary" style={{ marginBottom: 24 }}>{t('tokens.empty_desc')}</Text>
             <Button type="primary" size="large" onClick={handleAdd} style={{ padding: '0 32px' }}>
                {t('tokens.create')}
             </Button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          <div style={{ display: 'flex', flexDirection: screens.xs ? 'column' : 'row', justifyContent: 'space-between', marginBottom: 24, gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <Title level={screens.xs ? 4 : 2} style={{ margin: 0 }}>{t('tokens.title')}</Title>
              <Text type="secondary" style={{ fontSize: 13, marginTop: 4 }}>{t('tokens.subtitle')}</Text>
            </div>
            <Space style={{ alignItems: 'flex-start' }}>
              <Button icon={<SyncOutlined />} onClick={fetchTokens}>{t('common.refresh')}</Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>{t('tokens.create')}</Button>
            </Space>
          </div>

          {screens.xs ? (
            <MobileCardList
              dataSource={tokens}
              loading={loading}
              rowKey="id"
              pagination={{ pageSize: 10 }}
              renderCard={(record: any) => (
                <MobileCard
                  title={<Text strong>{record.name}</Text>}
                  extra={<Tag color={record.is_active ? 'success' : 'error'}>{record.is_active ? t('common.active') : t('common.disabled')}</Tag>}
                >
                  <CardRow label="KID">
                    {record.kid ? <Tag color="geekblue" style={{ fontFamily: 'monospace', fontSize: 11 }}>{record.kid}</Tag> : <Text type="secondary">-</Text>}
                  </CardRow>
                  <CardRow label={t('tokens.key')}>
                    <Space size={4}>
                      {revealedKeys[record.id] ? (
                        <Text style={{ fontFamily: 'monospace', fontSize: 11, color: '#52c41a', wordBreak: 'break-all', userSelect: 'all' }}>
                          {revealedKeys[record.id]}
                        </Text>
                      ) : (
                        <Text style={{ fontFamily: 'monospace', fontSize: 11, color: '#1677ff' }}>
                          {record.token_key.substring(0, 8)}••••{record.token_key.substring(record.token_key.length - 4)}
                        </Text>
                      )}
                      <Button type="text" icon={<CopyOutlined />} size="small" onClick={() => handleCopy(revealedKeys[record.id] || record.token_key)} style={{ color: '#888' }} />
                      <Button 
                        type="text" 
                        icon={revealedKeys[record.id] ? <EyeInvisibleOutlined /> : <EyeOutlined />} 
                        size="small" 
                        onClick={() => handleRevealClick(record.id)} 
                        style={{ color: revealedKeys[record.id] ? '#52c41a' : '#888' }} 
                      />
                    </Space>
                  </CardRow>
                  <CardRow label={t('tokens.used')}>
                    <Text type="secondary" style={{ fontSize: 12 }}>{record.quota_used.toFixed(4)}</Text>
                  </CardRow>
                  <CardRow label={t('tokens.limit')}>
                    <Text style={{ fontSize: 12 }}>{record.quota_limit < 0 ? t('tokens.unlimited') : record.quota_limit}</Text>
                  </CardRow>
                  <CardRow label={t('tokens.limits')}>
                    <Text type="secondary" style={{ fontSize: 12 }}>RPS: {record.rps_limit || '∞'} / RPM: {record.rpm_limit || '∞'}</Text>
                  </CardRow>
                  <CardRow label={t('users.joined')}>
                    <Text type="secondary" style={{ fontSize: 12 }}>{dayjs(record.created_at).format('MM-DD HH:mm')}</Text>
                  </CardRow>
                  <CardActions>
                    <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
                    <Popconfirm title={t('common.confirm_delete')} onConfirm={() => handleDelete(record.id)}>
                      <Button size="small" icon={<DeleteOutlined />} danger />
                    </Popconfirm>
                  </CardActions>
                </MobileCard>
              )}
            />
          ) : (
            <Table
              dataSource={tokens}
              columns={columns}
              rowKey="id"
              loading={loading}
              pagination={{ pageSize: 10 }}
              scroll={{ x: 'max-content' }}
            />
          )}
        </div>
      )}

      <Modal
        title={editingToken ? t('tokens.edit') : t('tokens.create')}
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        onOk={() => form.submit()}
        confirmLoading={saving}
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="name" label={t('tokens.name')} rules={[{ required: true }]} initialValue="default">
            <Input placeholder="e.g. Project A" />
          </Form.Item>

          <Form.Item name="quota_limit" label={`${t('tokens.limit')} ${t('tokens.limit_hint')}`} initialValue={-1}>
            <InputNumber 
              min={-1}
              style={{ width: '100%' }} 
              formatter={(val) => (val === -1 || val === '-1') ? t('tokens.unlimited_quota') : `${val}`}
              parser={(val) => (val === t('tokens.unlimited_quota') ? -1 : parseFloat(val as string) || 0) as -1}
            />
          </Form.Item>

          <Form.Item label="选择指定模型" style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Switch
                checked={enableModelFilter}
                onChange={(checked) => {
                  setEnableModelFilter(checked);
                  if (!checked) {
                    form.setFieldsValue({ allowed_models: '' });
                  }
                }}
                checkedChildren="已开启"
                unCheckedChildren="未开启"
              />
              <Text type="secondary" style={{ fontSize: 13 }}>
                {enableModelFilter ? '仅允许请求下方指定的模型' : '不开启，全站模型都可以使用，一般不开'}
              </Text>
            </div>
          </Form.Item>
          {enableModelFilter && (
            <Form.Item
              name="allowed_models"
              extra={
                <div style={{ fontSize: 12, color: '#888', lineHeight: 1.8, marginTop: 4 }}>
                  <div>📌 每行填写一个模型名称（model ID），例如：</div>
                  <div style={{ fontFamily: 'monospace', color: '#aaa', padding: '4px 0 4px 12px' }}>
                    gpt-4o<br />
                    claude-sonnet-4-20250514<br />
                    deepseek-chat
                  </div>
                  <div>模型名称需与站内已配置的模型 ID 完全一致，不区分大小写。</div>
                </div>
              }
            >
              <Input.TextArea
                rows={4}
                placeholder={'请输入允许使用的模型名称，每行一个\n例如：\ngpt-4o\nclaude-sonnet-4-20250514\ndeepseek-chat'}
              />
            </Form.Item>
          )}

          <Form.Item name="allowed_ips" label={t('tokens.allowed_ips')}>
             <Input placeholder="192.168.1.1, 10.0.0.1" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="rps_limit" label="RPS Limit" initialValue={0}>
                <InputNumber min={0} style={{ width: '100%' }} placeholder={t('tokens.rps_limit_hint')} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="rpm_limit" label="RPM Limit" initialValue={0}>
                <InputNumber min={0} style={{ width: '100%' }} placeholder={t('tokens.rpm_limit_hint')} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* 密码验证弹窗 */}
      <Modal
        title="🔐 验证身份"
        open={revealModalVisible}
        onCancel={() => setRevealModalVisible(false)}
        onOk={handleRevealSubmit}
        confirmLoading={revealLoading}
        okText="确认查看"
        cancelText="取消"
        destroyOnClose
      >
        <div style={{ marginBottom: 16, color: '#888', fontSize: 13 }}>
          为了保护您的密钥安全，查看完整密钥需要验证您的登录密码。
        </div>
        <Form form={passwordForm} layout="vertical">
          <Form.Item 
            name="password" 
            label="登录密码" 
            rules={[{ required: true, message: '请输入您的登录密码' }]}
          >
            <Input.Password 
              placeholder="请输入您的登录密码" 
              autoFocus 
              onPressEnter={handleRevealSubmit}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default Tokens;
