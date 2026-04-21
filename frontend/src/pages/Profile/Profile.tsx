import React, { useEffect, useState } from 'react';
import { Card, Typography, Avatar, Space, List, Button, Modal, Form, Input, message, Popconfirm } from 'antd';
import { UserOutlined, CameraOutlined, LockOutlined, MailOutlined, MobileOutlined, WechatOutlined, GoogleOutlined, SafetyOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';
import type { User, AllSettings } from '../../types';
import useAuthStore from '../../store/auth';
import useSettingsStore from '../../store/settings';
import WechatQR from '../../components/WechatQR';

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
  const [countdowns, setCountdowns] = useState<Record<string, number>>({});

  const startCountdown = (key: string) => {
    setCountdowns(prev => ({ ...prev, [key]: 60 }));
  };

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
    const activeKeys = Object.keys(countdowns).filter(k => countdowns[k] > 0);
    if (activeKeys.length === 0) return;

    const timer = setInterval(() => {
      setCountdowns(prev => {
        const next = { ...prev };
        let changed = false;
        Object.keys(next).forEach(k => {
          if (next[k] > 0) {
            next[k] -= 1;
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [countdowns]);

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
      message.success(t('profile.edit_success'));
      setIsModalVisible(false);
      fetchProfile();
    } catch (e: any) {
      console.error(e);
    }
  };

  // 绑定邮箱
  const handleBindEmail = async (values: any) => {
    try {
      await (request.post('/user/bind/email', values) as any);
      message.success(t('profile.edit_success'));
      setIsModalVisible(false);
      fetchProfile();
    } catch (e: any) {
      console.error(e);
    }
  };

  // 解绑第三方
  const handleUnbind = async (type: string, password: string) => {
    try {
      await (request.post(`/user/unbind/${type}`, { password }) as any);
      message.success(t('profile.unbind_success'));
      fetchProfile();
    } catch (e: any) {
      console.error(e);
    }
  };

  // 发送验证码
  const sendCode = async (target: string, type: 'email' | 'sms', purpose: string, timerKey: string) => {
    if (countdowns[timerKey] > 0) return;
    try {
      if (type === 'email') {
        await request.post('/auth/send-code', { email: target, purpose });
        message.success(t('auth.code_sent'));
      } else {
        await request.post('/auth/send-sms-code', { mobile: target, purpose });
        message.success(t('auth.sms_code_sent'));
      }
      startCountdown(timerKey);
    } catch (e: any) {
      console.error(e);
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
        handler: () => handleAction('bind_wechat'),
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
              <Input.Password placeholder={t('auth.password_placeholder')} />
            </Form.Item>
            <Form.Item name="confirm" label={t('login.confirm_password')} dependencies={['password']}
              rules={[{ required: true, message: t('auth.confirm_password_required') }, ({ getFieldValue }) => ({
                validator(_, value) { return !value || getFieldValue('password') === value ? Promise.resolve() : Promise.reject(new Error(t('auth.passwords_not_match'))); },
              })]}>
              <Input.Password placeholder={t('auth.confirm_password_placeholder')} />
            </Form.Item>
          </>
        );
      case 'bind_mobile':
        return (
          <Form form={form} layout="vertical" onFinish={handleBindMobile}>
            {profile?.mobile && (
              <>
                <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>{t('profile.current_mobile')}: {profile.mobile}</Text>
                <Form.Item name="old_code" label={t('profile.old_mobile_code')} rules={[{ required: true, message: t('auth.code_required') }]}>
                  <Input prefix={<SafetyOutlined />} placeholder={t('profile.enter_old_code')}
                    suffix={<Button type="link" size="small" disabled={countdowns['old_mobile'] > 0}
                      onClick={() => sendCode(profile.mobile!, 'sms', 'bind_mobile', 'old_mobile')}>
                      {countdowns['old_mobile'] > 0 ? `${countdowns['old_mobile']}s` : t('auth.send_code')}
                    </Button>} />
                </Form.Item>
              </>
            )}
            <Form.Item name="mobile" label={t('profile.bind_mobile_title')} rules={[{ required: true, message: t('auth.mobile_required') }]}>
              <Input prefix={<MobileOutlined />} placeholder={t('profile.new_mobile_placeholder')} />
            </Form.Item>
            <Form.Item name="code" label={t('profile.new_mobile_code')} rules={[{ required: true, message: t('auth.code_required') }]}>
              <Input prefix={<SafetyOutlined />} placeholder={t('profile.enter_new_code')}
                suffix={<Button type="link" size="small" disabled={countdowns['new_mobile'] > 0}
                  onClick={() => { const v = form.getFieldValue('mobile'); if (v) sendCode(v, 'sms', 'bind_mobile', 'new_mobile'); else message.warning(t('auth.mobile_required')); }}>
                  {countdowns['new_mobile'] > 0 ? `${countdowns['new_mobile']}s` : t('auth.send_code')}
                </Button>} />
            </Form.Item>
          </Form>
        );
      case 'bind_email':
        return (
          <Form form={form} layout="vertical" onFinish={handleBindEmail}>
            {profile?.email && !profile.email.endsWith('@tokensbyte.local') && (
              <>
                <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>{t('profile.current_email')}: {profile.email}</Text>
                <Form.Item name="old_code" label={t('profile.old_email_code')} rules={[{ required: true, message: t('auth.code_required') }]}>
                  <Input prefix={<SafetyOutlined />} placeholder={t('profile.enter_old_code')}
                    suffix={<Button type="link" size="small" disabled={countdowns['old_email'] > 0}
                      onClick={() => sendCode(profile.email, 'email', 'bind_email', 'old_email')}>
                      {countdowns['old_email'] > 0 ? `${countdowns['old_email']}s` : t('auth.send_code')}
                    </Button>} />
                </Form.Item>
              </>
            )}
            <Form.Item name="email" label={t('profile.bind_email_title')} rules={[{ required: true, type: 'email', message: t('auth.email_required') }]}>
              <Input prefix={<MailOutlined />} placeholder={t('profile.new_email_placeholder')} />
            </Form.Item>
            <Form.Item name="code" label={t('profile.new_email_code')} rules={[{ required: true, message: t('auth.code_required') }]}>
              <Input prefix={<SafetyOutlined />} placeholder={t('profile.enter_new_code')}
                suffix={<Button type="link" size="small" disabled={countdowns['new_email'] > 0}
                  onClick={() => { const v = form.getFieldValue('email'); if (v) sendCode(v, 'email', 'bind_email', 'new_email'); else message.warning(t('auth.email_required')); }}>
                  {countdowns['new_email'] > 0 ? `${countdowns['new_email']}s` : t('auth.send_code')}
                </Button>} />
            </Form.Item>
          </Form>
        );
      case 'bind_wechat':
        return (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <WechatQR
              appId={settings?.wechat_oauth?.app_id || ''}
              redirectUri={`${window.location.origin}/api/v1/user/bind/wechat/callback`}
              state={`bind_wechat_${profile?.id || ''}`}
              selfRedirect={true}
              style={1}
            />
            <div style={{ marginTop: 8, color: '#e5e5e5', fontSize: 14 }}>{t('profile.bind_wechat')}</div>
            <div style={{ color: '#8c8c8c', fontSize: 12, marginTop: 4 }}>"{settings?.site?.name}"</div>
          </div>
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
                  {profile?.level_name || (profile?.user_group === 'default' ? t('profile.membership_default') : profile?.user_group)}
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
                        if (!pwd) { message.warning(t('auth.password_required')); return; }
                        handleUnbind(item.key, pwd);
                      }}
                      okText={t('profile.unbind_ok')} cancelText={t('common.cancel')}>
                      <Button type="link" danger>{t('profile.unbind')}</Button>
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
        title={isBindModal ? (modalType === 'bind_mobile' ? t('profile.bind_mobile_title') : t('profile.bind_email_title')) : (modalType === 'nickname' ? t('profile.modify_nickname') : (modalType === 'password' ? t('profile.modify_password') : t(`profile.${modalType}`)))}
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        onOk={handleModalOk}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        footer={modalType === 'bind_wechat' ? null : undefined}
      >
        {!isBindModal && modalType !== 'bind_wechat' ? (
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
