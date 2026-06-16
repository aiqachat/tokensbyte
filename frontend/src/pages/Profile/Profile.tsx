import React, { useEffect, useState, useCallback } from 'react';
import { Card, Typography, Avatar, Space, List, Button, Modal, Form, Input, message, Popconfirm, Select } from 'antd';
import { UserOutlined, CameraOutlined, LockOutlined, MailOutlined, MobileOutlined, WechatOutlined, GoogleOutlined, SafetyOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import request from '../../utils/request';
import type { User } from '../../types';
import useAuthStore from '../../store/auth';
import useSettingsStore from '../../store/settings';
import { useThemeStore } from '../../store/theme';
import WechatQR from '../../components/WechatQR';

const { Title, Text } = Typography;

const timezoneOptions = (() => {
  const timezones = Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : [
    'Asia/Shanghai', 'Asia/Tokyo', 'America/New_York', 'Europe/London'
  ];
  
  const grouped: Record<string, { value: string, label: string }[]> = {};
  
  timezones.forEach(tz => {
    const parts = tz.split('/');
    if (parts.length >= 2) {
      const group = parts[0];
      const city = parts.slice(1).join('/').replace(/_/g, ' ');
      
      const date = new Date();
      const str = date.toLocaleString('en-US', { timeZone: tz, timeZoneName: 'shortOffset' });
      const match = str.match(/(GMT|UTC)([+-]\d{1,2}(:\d{2})?)/);
      let offset = '';
      if (match) {
        offset = ` (UTC${match[2]})`;
      } else if (str.includes('GMT') || str.includes('UTC')) {
        offset = ' (UTC+0)';
      }
      
      if (!grouped[group]) grouped[group] = [];
      grouped[group].push({ value: tz, label: `${tz.replace(/_/g, ' ')}${offset}` });
    }
  });
  
  return Object.entries(grouped)
    .map(([group, options]) => ({
      label: group,
      options: options.sort((a, b) => a.label.localeCompare(b.label))
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
})();

const formatTimezoneDisplay = (tz: string) => {
  if (!tz) return '';
  const displayTz = tz.replace(/_/g, ' ');
  try {
    const date = new Date();
    const str = date.toLocaleString('en-US', { timeZone: tz, timeZoneName: 'shortOffset' });
    const match = str.match(/(GMT|UTC)([+-]\d{1,2}(:\d{2})?)/);
    if (match) return `${displayTz} (UTC${match[2]})`;
    if (str.includes('GMT') || str.includes('UTC')) return `${displayTz} (UTC+0)`;
  } catch (e) {}
  return displayTz;
};

const Profile: React.FC = () => {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [modalType, setModalType] = useState<string>('nickname');
  const [form] = Form.useForm();
  const { setUser } = useAuthStore();
  const { settings } = useSettingsStore();
  const { themeMode } = useThemeStore();
  const isLight = themeMode === 'light';
  const cardBg = isLight ? '#fff' : '#141414';
  const cardBorder = isLight ? '1px solid #e8e8e8' : '1px solid #303030';
  const listBorder = isLight ? '1px solid #f0f0f0' : '1px solid #303030';
  const mainText = isLight ? '#1f2937' : '#fff';
  const subText = isLight ? '#6b7280' : '#8c8c8c';
  const avatarBg = isLight ? '#e8e8e8' : '#303030';
  const avatarBorder = isLight ? '2px solid #d9d9d9' : '2px solid #505050';
  const [countdowns, setCountdowns] = useState<Record<string, number>>({});
  const [searchParams, setSearchParams] = useSearchParams();

  // 微信换绑步骤：'verify'=验证旧微信, 'bind'=绑定新微信
  const [wechatBindStep, setWechatBindStep] = useState<'verify' | 'bind'>('verify');
  // 每次切换步骤时重新生成 key，确保二维码刷新
  const [wechatQRKey, setWechatQRKey] = useState(() => Date.now());

  const startCountdown = (key: string) => {
    setCountdowns(prev => ({ ...prev, [key]: 60 }));
  };

  const login = settings?.login;

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await (request.get('/user/profile') as unknown as Promise<User>);
      setProfile(resp);
      setUser(resp);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [setUser]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  // ── 监听微信回调 URL 参数 ──────────────────────────────────
  useEffect(() => {
    const action = searchParams.get('wechat_action');
    if (!action) return;
    // 消费掉参数，避免刷新重复触发
    searchParams.delete('wechat_action');
    setSearchParams(searchParams, { replace: true });

    switch (action) {
      case 'verified':
        message.success(t('profile.wechat_verify_success', '身份验证通过，请用新微信扫码绑定'));
        setWechatBindStep('bind');
        setWechatQRKey(Date.now());
        setModalType('bind_wechat');
        setIsModalVisible(true);
        break;
      case 'verify_failed':
        message.error(t('profile.wechat_verify_failed', '验证失败：扫码微信与当前绑定的微信不一致'));
        break;
      case 'bindok':
        message.success(t('profile.wechat_bind_success', '微信绑定成功'));
        setIsModalVisible(false);
        fetchProfile();
        break;
      case 'bindconflict':
        message.error(t('profile.wechat_bind_conflict', '此微信已绑定其他账号'));
        break;
    }

    const googleAction = searchParams.get('google_action');
    if (googleAction) {
      searchParams.delete('google_action');
      setSearchParams(searchParams, { replace: true });
      switch (googleAction) {
        case 'verified':
          Modal.confirm({
            title: t('auth.identity_verified') || '身份验证通过',
            content: t('auth.google_bind_confirm_text') || '原谷歌账号身份验证通过，是否立即前往绑定新谷歌账号？',
            okText: t('auth.go_to_bind') || '前往绑定',
            cancelText: t('common.cancel') || '取消',
            onOk: () => {
              window.location.href = '/api/v1/user/bind/google?action=bind';
            }
          });
          break;
        case 'verify_failed':
          message.error(t('auth.google_verify_failed') || '验证失败：授权的谷歌账号与当前绑定的谷歌账号不一致');
          break;
        case 'bindok':
          message.success(t('auth.google_bind_success') || '谷歌账号绑定成功');
          fetchProfile();
          break;
        case 'bindconflict':
          message.error(t('auth.google_bind_conflict') || '此谷歌账号已绑定其他账号');
          break;
      }
    }
  }, [searchParams, setSearchParams, fetchProfile, t]);

  useEffect(() => {
    const activeKeys = Object.keys(countdowns).filter(k => countdowns[k] > 0);
    if (activeKeys.length === 0) return;
    const timer = setInterval(() => {
      setCountdowns(prev => {
        const next = { ...prev };
        let changed = false;
        Object.keys(next).forEach(k => { if (next[k] > 0) { next[k] -= 1; changed = true; } });
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [countdowns]);

  const handleAction = (type: string) => {
    setModalType(type);
    form.resetFields();
    if (type === 'bind_wechat') {
      // 已绑定微信 → 换绑模式（先验证）；未绑定 → 直接绑定
      setWechatBindStep(profile?.wechat_id ? 'verify' : 'bind');
      setWechatQRKey(Date.now());
    } else if (type === 'timezone') {
      form.setFieldsValue({ timezone: profile?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai' });
    } else if (type === 'nickname') {
      form.setFieldsValue({ nickname: profile?.nickname || '' });
    }
    setIsModalVisible(true);
  };

  const handleUpdate = async (values: any) => {
    try {
      await request.put('/user/profile', values);
      message.success(t('profile.edit_success'));
      setIsModalVisible(false);
      fetchProfile();
    } catch (e) { console.error(e); }
  };

  const handleBindMobile = async (values: any) => {
    try {
      await (request.post('/user/bind/mobile', values) as any);
      message.success(t('profile.edit_success'));
      setIsModalVisible(false);
      fetchProfile();
    } catch (e) { console.error(e); }
  };

  const handleBindEmail = async (values: any) => {
    try {
      await (request.post('/user/bind/email', values) as any);
      message.success(t('profile.edit_success'));
      setIsModalVisible(false);
      fetchProfile();
    } catch (e) { console.error(e); }
  };

  const handleUnbind = async (type: string, password: string) => {
    try {
      await (request.post(`/user/unbind/${type}`, { password }) as any);
      message.success(t('profile.unbind_success'));
      fetchProfile();
    } catch (e) { console.error(e); }
  };

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
    } catch (e) { console.error(e); }
  };

  // 构建安全设置项
  const buildSecurityItems = () => {
    const items: { key: string; label: string; value: string; action: string; icon: React.ReactNode; handler: () => void }[] = [];
    items.push({ key: 'password', label: t('profile.password'), value: '********', action: t('profile.edit'), icon: <LockOutlined />, handler: () => handleAction('password') });
    if (login?.enable_mobile_login) {
      const hasMobile = !!profile?.mobile;
      items.push({ key: 'mobile', label: t('profile.mobile'), value: profile?.mobile || t('profile.not_bound'), action: hasMobile ? t('profile.rebind') : t('profile.bind'), icon: <MobileOutlined />, handler: () => handleAction('bind_mobile') });
    }
    if (login?.enable_email_login) {
      const hasEmail = !!profile?.email && !profile.email.endsWith('@tokensbyte.local');
      items.push({ key: 'email', label: t('profile.email'), value: hasEmail ? profile!.email : t('profile.not_bound'), action: hasEmail ? t('profile.rebind') : t('profile.bind'), icon: <MailOutlined />, handler: () => handleAction('bind_email') });
    }
    if (login?.enable_wechat_login) {
      items.push({ 
        key: 'wechat', 
        label: t('profile.wechat'), 
        value: profile?.wechat_id ? `${t('profile.bound')} ${profile.wechat_name ? `(${profile.wechat_name})` : ''}` : t('profile.not_bound'), 
        action: profile?.wechat_id ? t('profile.rebind') : t('profile.bind'), 
        icon: <WechatOutlined />, 
        handler: () => handleAction('bind_wechat') 
      });
    }
    if (login?.enable_google_login) {
      items.push({ 
        key: 'google', 
        label: t('profile.google'), 
        value: profile?.google_id ? `${t('profile.bound')} ${profile.google_name ? `(${profile.google_name})` : ''}` : t('profile.not_bound'), 
        action: profile?.google_id ? t('profile.rebind') : t('profile.bind'), 
        icon: <GoogleOutlined />, 
        handler: () => { 
          if (profile?.google_id) {
            window.location.href = '/api/v1/user/bind/google?action=verify';
          } else {
            window.location.href = '/api/v1/user/bind/google?action=bind';
          }
        } 
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
          <Form.Item
            name="nickname"
            label={t('profile.nickname')}
            rules={[
              { required: true, message: t('profile.nickname_required', '昵称不能为空') },
              { max: 24, message: t('profile.nickname_max_length', '昵称长度最多不能超过 24 个字符') }
            ]}
          >
            <Input placeholder={t('profile.nickname')} />
          </Form.Item>
        );
      case 'timezone':
        return (
          <Form.Item name="timezone" label={t('profile.timezone', '时区')} rules={[{ required: true }]}>
            <Select 
              showSearch 
              placeholder={t('profile.select_timezone', '请选择时区')} 
              options={timezoneOptions} 
              filterOption={(input, option: any) =>
                (option?.label as string ?? '').toLowerCase().includes(input.toLowerCase()) ||
                (option?.value as string ?? '').toLowerCase().includes(input.toLowerCase())
              }
            />
          </Form.Item>
        );
      case 'password':
        return (
          <>
            <Form.Item name="old_password" label={t('profile.old_password', '原密码')} rules={[{ required: true, min: 6, message: t('profile.verify_current_password', '请验证目前的登录密码') }]}>
              <Input.Password placeholder={t('profile.enter_old_password', '请输入原密码以验证身份')} />
            </Form.Item>
            <Form.Item name="password" label={t('profile.password')} rules={[{ required: true, min: 6 }]}>
              <Input.Password placeholder={t('profile.enter_new_password', '请输入新密码')} />
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
      case 'bind_wechat': {
        const appId = settings?.wechat_oauth_app_id || '';
        const redirectUri = `${window.location.origin}/api/v1/user/bind/wechat/callback`;
        const isVerifyStep = wechatBindStep === 'verify';
        const statePrefix = isVerifyStep ? 'verify_wechat_' : 'bind_wechat_';
        return (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <WechatQR
              key={wechatQRKey}
              appId={appId}
              redirectUri={redirectUri}
              state={`${statePrefix}${profile?.id || ''}`}
            />
            <div style={{ marginTop: 8, color: '#e5e5e5', fontSize: 14 }}>
              {isVerifyStep ? t('profile.scan_current_wechat', '请用当前绑定的微信扫码验证身份') : t('profile.scan_new_wechat', '请用新微信扫码绑定')}
            </div>
            <div style={{ color: '#8c8c8c', fontSize: 12, marginTop: 4 }}>"{settings?.site?.name}"</div>
          </div>
        );
      }
      default:
        return null;
    }
  };

  const handleModalOk = () => { form.submit(); };

  const isBindModal = modalType === 'bind_mobile' || modalType === 'bind_email';

  // Modal 标题
  const getModalTitle = () => {
    if (modalType === 'bind_wechat') return wechatBindStep === 'verify' ? t('profile.verify_wechat_identity', '验证微信身份') : t('profile.bind_wechat');
    if (isBindModal) return modalType === 'bind_mobile' ? t('profile.bind_mobile_title') : t('profile.bind_email_title');
    if (modalType === 'nickname') return t('profile.modify_nickname');
    if (modalType === 'timezone') return t('profile.timezone', '修改时区');
    if (modalType === 'password') return t('profile.modify_password');
    return '';
  };

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* Profile Header */}
      <Card style={{ marginBottom: 24, borderRadius: 16, background: cardBg, border: cardBorder }}
        styles={{ body: { padding: '32px' } }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <Avatar size={80} icon={<UserOutlined />} style={{ background: avatarBg, border: avatarBorder }} />
            <Button shape="circle" size="small" icon={<CameraOutlined style={{ fontSize: 10 }} />}
              style={{ position: 'absolute', bottom: 0, right: 0, background: '#1677ff', border: 'none', color: '#fff' }} />
          </div>
          <div style={{ marginLeft: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <Title level={3} style={{ margin: 0, color: mainText }}>
                {profile?.nickname || profile?.username || t('profile.nickname')}
              </Title>
              {(profile?.level_name || profile?.user_group) && (
                <div style={{
                  padding: '2px 10px',
                  background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.08)',
                  borderRadius: '12px', 
                  color: isLight ? '#4b5563' : '#e5e5e5',
                  border: isLight ? '1px solid rgba(0,0,0,0.1)' : '1px solid rgba(255,255,255,0.2)',
                  fontSize: '12px', fontWeight: 600,
                }}>
                  {profile?.level_name || (profile?.user_group === 'default' ? t('profile.membership_default') : profile?.user_group)}
                </div>
              )}
            </div>
            <Text type="secondary" style={{ color: subText }}>UID: {profile?.uid}</Text>
          </div>
        </div>
      </Card>

      {/* Basic Info */}
      <Card style={{ marginBottom: 24, borderRadius: 16, background: cardBg, border: cardBorder }}>
        <List itemLayout="horizontal"
          dataSource={[
            { key: 'username', label: t('profile.account'), value: profile?.username },
            { key: 'nickname', label: t('profile.nickname'), value: profile?.nickname },
            { key: 'timezone', label: t('profile.timezone', '时区'), value: formatTimezoneDisplay(profile?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai') },
          ]}
          renderItem={(item) => (
            <List.Item style={{ borderBottom: listBorder, padding: '16px 24px' }}
              extra={(item.key === 'nickname' || item.key === 'timezone') && (
                <Button type="link" onClick={() => handleAction(item.key)}>{t('profile.edit')}</Button>
              )}>
              <div style={{ width: 120 }}><Text style={{ color: subText }}>{item.label}</Text></div>
              <div style={{ flex: 1 }}><Text style={{ color: mainText }}>{item.value || t('profile.not_set')}</Text></div>
            </List.Item>
          )}
        />
      </Card>

      {/* Security */}
      <Card style={{ borderRadius: 16, background: cardBg, border: cardBorder }}>
        <List itemLayout="horizontal" dataSource={securityItems}
          renderItem={(item) => (
            <List.Item style={{ borderBottom: listBorder, padding: '16px 24px' }}
              extra={
                <Space>
                  <Button type="link" onClick={item.handler}>{item.action}</Button>
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
                <span style={{ color: subText }}>{item.icon}</span>
                <Text style={{ color: subText }}>{item.label}</Text>
              </div>
              <div style={{ flex: 1 }}><Text style={{ color: mainText }}>{item.value}</Text></div>
            </List.Item>
          )}
        />
      </Card>

      <Modal
        title={getModalTitle()}
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
