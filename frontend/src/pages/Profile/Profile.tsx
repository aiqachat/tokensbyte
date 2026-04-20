import React, { useEffect, useState } from 'react';
import { Card, Typography, Avatar, Space, List, Button, Modal, Form, Input, message, Popconfirm } from 'antd';
import { UserOutlined, CameraOutlined, LockOutlined, MailOutlined, MobileOutlined, WechatOutlined, GoogleOutlined, SafetyOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import request from '../../utils/request';
import type { User, AllSettings } from '../../types';
import useAuthStore from '../../store/auth';
import useSettingsStore from '../../store/settings';

const { Title, Text } = Typography;

const Profile: React.FC = () => {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [modalType, setModalType] = useState<string>('nickname');
  const [form] = Form.useForm();
  const { setUser } = useAuthStore();
  const { settings } = useSettingsStore();
  const [countdown, setCountdown] = useState(0);

  const login = settings?.login;

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const resp = await (request.get('/user/profile') as unknown as Promise<User>);
      setProfile(resp);
      setUser(resp);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchProfile(); }, []);
  useEffect(() => {
    if (countdown > 0) { const t = setTimeout(() => setCountdown(c => c - 1), 1000); return () => clearTimeout(t); }
  }, [countdown]);

  const handleAction = (type: string) => {
    setModalType(type);
    form.resetFields();
    setIsModalVisible(true);
  };

  const handleUpdate = async (values: any) => {
    try {
      const resp = await (request.put('/user/profile', values) as unknown as Promise<User>);
      message.success(t('profile.edit_success'));
      setProfile(resp);
      setUser(resp);
      setIsModalVisible(false);
    } catch (e) { console.error(e); }
  };

  // 绑定手机号
  const handleBindMobile = async (values: any) => {
    try {
      await (request.post('/user/bind/mobile', values) as any);
      message.success('手机号绑定成功');
      setIsModalVisible(false);
      fetchProfile();
    } catch (e: any) {
      message.error(e?.message || '绑定失败');
    }
  };

  // 绑定邮箱
  const handleBindEmail = async (values: any) => {
    try {
      await (request.post('/user/bind/email', values) as any);
      message.success('邮箱绑定成功');
      setIsModalVisible(false);
      fetchProfile();
    } catch (e: any) {
      message.error(e?.message || '绑定失败');
    }
  };

  // 解绑第三方
  const handleUnbind = async (type: string, password: string) => {
    try {
      await (request.post(`/user/unbind/${type}`, { password }) as any);
      message.success('解绑成功');
      fetchProfile();
    } catch (e: any) {
      message.error(e?.message || '解绑失败');
    }
  };

  // 发送验证码
  const sendCode = async (target: string, type: 'email' | 'sms', purpose: string) => {
    if (countdown > 0) return;
    try {
      if (type === 'email') {
        await axios.post('/api/v1/auth/send-code', { email: target, purpose });
      } else {
        await axios.post('/api/v1/auth/send-sms-code', { mobile: target, purpose });
      }
      message.success('验证码已发送');
      setCountdown(60);
    } catch (e: any) {
      message.error(e?.response?.data?.error?.message || '发送失败');
    }
  };

  // 构建安全设置项（动态根据登录开关显示）
  const buildSecurityItems = () => {
    const items: { key: string; label: string; value: string; action: string; icon: React.ReactNode; handler: () => void }[] = [];

    // 密码始终显示
    items.push({
      key: 'password',
      label: t('profile.password'),
      value: '********',
      action: t('profile.edit'),
      icon: <LockOutlined />,
      handler: () => handleAction('password'),
    });

    // 手机号（仅当手机号登录开启时显示）
    if (login?.enable_mobile_login) {
      const hasMobile = !!profile?.mobile;
      items.push({
        key: 'mobile',
        label: t('profile.mobile'),
        value: profile?.mobile || t('profile.not_bound'),
        action: hasMobile ? t('profile.rebind') : t('profile.bind'),
        icon: <MobileOutlined />,
        handler: () => handleAction('bind_mobile'),
      });
    }

    // 邮箱（仅当邮箱登录开启时显示）
    if (login?.enable_email_login) {
      const hasEmail = !!profile?.email && !profile.email.endsWith('@tokensbyte.local');
      items.push({
        key: 'email',
        label: t('profile.email'),
        value: hasEmail ? profile!.email : t('profile.not_bound'),
        action: hasEmail ? t('profile.rebind') : t('profile.bind'),
        icon: <MailOutlined />,
        handler: () => handleAction('bind_email'),
      });
    }

    // 微信（仅当微信登录开启时显示）
    if (login?.enable_wechat_login) {
      items.push({
        key: 'wechat',
        label: t('profile.wechat'),
        value: profile?.wechat_id ? t('profile.bound') : t('profile.not_bound'),
        action: profile?.wechat_id ? t('profile.rebind') : t('profile.bind'),
        icon: <WechatOutlined />,
        handler: () => { window.location.href = '/api/v1/user/bind/wechat'; },
      });
    }

    // 谷歌（仅当谷歌登录开启时显示）
    if (login?.enable_google_login) {
      items.push({
        key: 'google',
        label: t('profile.google'),
        value: profile?.google_id ? t('profile.bound') : t('profile.not_bound'),
        action: profile?.google_id ? t('profile.rebind') : t('profile.bind'),
        icon: <GoogleOutlined />,
        handler: () => { window.location.href = '/api/v1/user/bind/google'; },
      });
    }

    return items;
  };

  const securityItems = buildSecurityItems();

  // Modal 内容
  const renderModalContent = () => {
    switch (modalType) {
      case 'nickname':
        return (
          <Form.Item name="nickname" label={t('profile.nickname')} rules={[{ required: true }]}>
            <Input placeholder={t('profile.nickname')} />
          </Form.Item>
        );
      case 'password':
        return (
          <>
            <Form.Item name="password" label={t('profile.password')} rules={[{ required: true, min: 6 }]}>
              <Input.Password placeholder={t('profile.password')} />
            </Form.Item>
            <Form.Item name="confirm" label={t('login.confirm_password')} dependencies={['password']}
              rules={[{ required: true }, ({ getFieldValue }) => ({
                validator(_, value) { return !value || getFieldValue('password') === value ? Promise.resolve() : Promise.reject(new Error(t('login.password_mismatch'))); },
              })]}>
              <Input.Password />
            </Form.Item>
          </>
        );
      case 'bind_mobile':
        return (
          <Form form={form} layout="vertical" onFinish={handleBindMobile}>
            {profile?.mobile && (
              <>
                <Text type="secondary">当前手机号：{profile.mobile}</Text>
                <Form.Item name="old_code" label="原手机验证码" rules={[{ required: true }]} style={{ marginTop: 12 }}>
                  <Input prefix={<SafetyOutlined />} placeholder="输入原手机验证码"
                    suffix={<Button type="link" size="small" disabled={countdown > 0}
                      onClick={() => sendCode(profile.mobile!, 'sms', 'bind_mobile')}>
                      {countdown > 0 ? `${countdown}s` : '发送验证码'}
                    </Button>} />
                </Form.Item>
              </>
            )}
            <Form.Item name="mobile" label={t('profile.bind_mobile_title')} rules={[{ required: true }]}>
              <Input prefix={<MobileOutlined />} placeholder={t('profile.new_mobile_placeholder')} />
            </Form.Item>
            <Form.Item name="code" label="新手机验证码" rules={[{ required: true }]}>
              <Input prefix={<SafetyOutlined />} placeholder="输入验证码"
                suffix={<Button type="link" size="small" disabled={countdown > 0}
                  onClick={() => { const v = form.getFieldValue('mobile'); if (v) sendCode(v, 'sms', 'bind_mobile'); else message.warning('请输入手机号'); }}>
                  {countdown > 0 ? `${countdown}s` : '发送验证码'}
                </Button>} />
            </Form.Item>
          </Form>
        );
      case 'bind_email':
        return (
          <Form form={form} layout="vertical" onFinish={handleBindEmail}>
            {profile?.email && !profile.email.endsWith('@tokensbyte.local') && (
              <>
                <Text type="secondary">当前邮箱：{profile.email}</Text>
                <Form.Item name="old_code" label="原邮箱验证码" rules={[{ required: true }]} style={{ marginTop: 12 }}>
                  <Input prefix={<SafetyOutlined />} placeholder="输入原邮箱验证码"
                    suffix={<Button type="link" size="small" disabled={countdown > 0}
                      onClick={() => sendCode(profile.email, 'email', 'bind_email')}>
                      {countdown > 0 ? `${countdown}s` : '发送验证码'}
                    </Button>} />
                </Form.Item>
              </>
            )}
            <Form.Item name="email" label={t('profile.bind_email_title')} rules={[{ required: true, type: 'email' }]}>
              <Input prefix={<MailOutlined />} placeholder={t('profile.new_email_placeholder')} />
            </Form.Item>
            <Form.Item name="code" label="新邮箱验证码" rules={[{ required: true }]}>
              <Input prefix={<SafetyOutlined />} placeholder="输入验证码"
                suffix={<Button type="link" size="small" disabled={countdown > 0}
                  onClick={() => { const v = form.getFieldValue('email'); if (v) sendCode(v, 'email', 'bind_email'); else message.warning('请输入邮箱'); }}>
                  {countdown > 0 ? `${countdown}s` : '发送验证码'}
                </Button>} />
            </Form.Item>
          </Form>
        );
      default:
        return null;
    }
  };

  const handleModalOk = () => {
    if (modalType === 'bind_mobile' || modalType === 'bind_email') {
      form.submit();
    } else {
      form.submit();
    }
  };

  const isBindModal = modalType === 'bind_mobile' || modalType === 'bind_email';

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      {/* Profile Header */}
      <Card style={{ marginBottom: 24, borderRadius: 16, background: '#141414', border: '1px solid #303030' }}
        bodyStyle={{ padding: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <Avatar size={80} icon={<UserOutlined />} style={{ background: '#303030', border: '2px solid #505050' }} />
            <Button shape="circle" size="small" icon={<CameraOutlined style={{ fontSize: 10 }} />}
              style={{ position: 'absolute', bottom: 0, right: 0, background: '#1677ff', border: 'none', color: '#fff' }} />
          </div>
          <div style={{ marginLeft: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <Title level={3} style={{ margin: 0, color: '#fff' }}>
                {profile?.nickname || profile?.username || t('profile.nickname')}
              </Title>
              {(profile?.level_name || profile?.user_group) && (
                <div style={{
                  padding: '2px 10px',
                  background: 'linear-gradient(135deg, #FFD700 0%, #FDB931 100%)',
                  borderRadius: '12px', color: '#fff',
                  textShadow: '0px 1px 2px rgba(0,0,0,0.4)',
                  fontSize: '12px', fontWeight: 600,
                  boxShadow: '0 2px 4px rgba(253, 185, 49, 0.3)',
                }}>
                  {profile?.level_name || (profile?.user_group === 'default' ? '普通会员' : profile?.user_group)}
                </div>
              )}
            </div>
            <Text type="secondary" style={{ color: '#8c8c8c' }}>UID: {profile?.uid}</Text>
          </div>
        </div>
      </Card>

      {/* Basic Info */}
      <Card style={{ marginBottom: 24, borderRadius: 16, background: '#141414', border: '1px solid #303030' }}>
        <List itemLayout="horizontal"
          dataSource={[
            { label: t('profile.account'), value: profile?.username },
            { label: t('profile.nickname'), value: profile?.nickname },
          ]}
          renderItem={(item) => (
            <List.Item style={{ borderBottom: '1px solid #303030', padding: '16px 24px' }}
              extra={item.label === t('profile.nickname') && (
                <Button type="link" onClick={() => handleAction('nickname')}>{t('profile.edit')}</Button>
              )}>
              <div style={{ width: 120 }}><Text style={{ color: '#8c8c8c' }}>{item.label}</Text></div>
              <div style={{ flex: 1 }}><Text style={{ color: '#fff' }}>{item.value || t('profile.not_set')}</Text></div>
            </List.Item>
          )}
        />
      </Card>

      {/* Security */}
      <Card style={{ borderRadius: 16, background: '#141414', border: '1px solid #303030' }}>
        <List itemLayout="horizontal" dataSource={securityItems}
          renderItem={(item) => (
            <List.Item style={{ borderBottom: '1px solid #303030', padding: '16px 24px' }}
              extra={
                <Space>
                  <Button type="link" onClick={item.handler}>{item.action}</Button>
                  {/* 已绑定的第三方显示解绑按钮 */}
                  {(item.key === 'wechat' && profile?.wechat_id) || (item.key === 'google' && profile?.google_id) ? (
                    <Popconfirm title={t('profile.unbind_confirm')}
                      description={<Input.Password placeholder={t('profile.unbind_password')} id={`unbind_pwd_${item.key}`} />}
                      onConfirm={() => {
                        const pwd = (document.getElementById(`unbind_pwd_${item.key}`) as HTMLInputElement)?.value;
                        if (!pwd) { message.warning('请输入密码'); return; }
                        handleUnbind(item.key, pwd);
                      }}
                      okText="确定解绑" cancelText="取消">
                      <Button type="link" danger>解绑</Button>
                    </Popconfirm>
                  ) : null}
                </Space>
              }>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: 120 }}>
                <span style={{ color: '#8c8c8c' }}>{item.icon}</span>
                <Text style={{ color: '#8c8c8c' }}>{item.label}</Text>
              </div>
              <div style={{ flex: 1 }}><Text style={{ color: '#fff' }}>{item.value}</Text></div>
            </List.Item>
          )}
        />
      </Card>

      <Modal
        title={isBindModal ? (modalType === 'bind_mobile' ? t('profile.bind_mobile_title') : t('profile.bind_email_title')) : t(`profile.${modalType}`)}
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        onOk={handleModalOk}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
      >
        {!isBindModal ? (
          <Form form={form} layout="vertical" onFinish={handleUpdate}>
            {renderModalContent()}
          </Form>
        ) : (
          renderModalContent()
        )}
      </Modal>
    </div>
  );
};

export default Profile;
