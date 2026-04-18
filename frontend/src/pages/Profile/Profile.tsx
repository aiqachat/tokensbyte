import React, { useEffect, useState } from 'react';
import { Card, Typography, Avatar, Space, List, Button, Modal, Form, Input, message, Divider } from 'antd';
import { UserOutlined, CameraOutlined, LockOutlined, MailOutlined, MobileOutlined, WechatOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';
import type { User } from '../../types';
import useAuthStore from '../../store/auth';

const { Title, Text } = Typography;

const Profile: React.FC = () => {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [modalType, setModalType] = useState<'nickname' | 'password' | 'email' | 'mobile' | 'wechat'>('nickname');
  const [form] = Form.useForm();
  const { user: authUser, setUser } = useAuthStore();

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const resp = await (request.get('/user/profile') as unknown as Promise<User>);
      setProfile(resp);
      setUser(resp);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const handleAction = (type: typeof modalType) => {
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
    } catch (e) {
      console.error(e);
    }
  };

  const securityItems = [
    {
      key: 'password',
      label: t('profile.password'),
      value: '********',
      action: t('profile.edit'),
      icon: <LockOutlined />,
    },
    {
      key: 'email',
      label: t('profile.email'),
      value: profile?.email || t('profile.not_bound'),
      action: profile?.email ? t('profile.edit') : t('profile.bind'),
      icon: <MailOutlined />,
    },
    {
      key: 'mobile',
      label: t('profile.mobile'),
      value: profile?.mobile || t('profile.not_bound'),
      action: profile?.mobile ? t('profile.edit') : t('profile.bind'),
      icon: <MobileOutlined />,
    },
    {
      key: 'wechat',
      label: t('profile.wechat'),
      value: profile?.wechat_id ? t('profile.bound') : t('profile.not_enabled'),
      action: t('profile.bind'),
      icon: <WechatOutlined />,
    },
  ];

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      {/* Profile Header */}
      <Card 
        style={{ 
          marginBottom: 24, 
          borderRadius: 16, 
          background: '#141414', 
          border: '1px solid #303030' 
        }}
        bodyStyle={{ padding: '32px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <Avatar 
              size={80} 
              icon={<UserOutlined />} 
              src={null}
              style={{ background: '#303030', border: '2px solid #505050' }}
            />
            <Button 
              shape="circle" 
              size="small" 
              icon={<CameraOutlined style={{ fontSize: 10 }} />} 
              style={{ position: 'absolute', bottom: 0, right: 0, background: '#1677ff', border: 'none', color: '#fff' }}
            />
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
                  borderRadius: '12px',
                  color: '#fff',
                  textShadow: '0px 1px 2px rgba(0,0,0,0.4)',
                  fontSize: '12px',
                  fontWeight: 600,
                  boxShadow: '0 2px 4px rgba(253, 185, 49, 0.3)',
                }}>
                  {profile?.level_name || (profile?.user_group === 'default' ? '普通会员' : profile?.user_group)}
                </div>
              )}
            </div>
            <Text type="secondary" style={{ color: '#8c8c8c' }}>
              UID: {profile?.uid}
            </Text>
          </div>
        </div>
      </Card>

      {/* Basic Info */}
      <Card 
        style={{ 
          marginBottom: 24, 
          borderRadius: 16, 
          background: '#141414', 
          border: '1px solid #303030' 
        }}
      >
        <List
          itemLayout="horizontal"
          dataSource={[
            { label: t('profile.account'), value: profile?.username },
            { label: t('profile.nickname'), value: profile?.nickname },
          ]}
          renderItem={(item) => (
            <List.Item 
              style={{ borderBottom: '1px solid #303030', padding: '16px 24px' }}
              extra={item.label === t('profile.nickname') && (
                <Button type="link" onClick={() => handleAction('nickname')}>{t('profile.edit')}</Button>
              )}
            >
              <div style={{ width: 120 }}>
                <Text style={{ color: '#8c8c8c' }}>{item.label}</Text>
              </div>
              <div style={{ flex: 1 }}>
                <Text style={{ color: '#fff' }}>{item.value || t('profile.not_set')}</Text>
              </div>
            </List.Item>
          )}
        />
      </Card>

      {/* Security */}
      <Card 
        style={{ 
          borderRadius: 16, 
          background: '#141414', 
          border: '1px solid #303030' 
        }}
      >
        <List
          itemLayout="horizontal"
          dataSource={securityItems}
          renderItem={(item) => (
            <List.Item 
              style={{ borderBottom: '1px solid #303030', padding: '16px 24px' }}
              extra={
                <Button type="link" onClick={() => handleAction(item.key as any)}>{item.action}</Button>
              }
            >
              <div style={{ width: 120 }}>
                <Text style={{ color: '#8c8c8c' }}>{item.label}</Text>
              </div>
              <div style={{ flex: 1 }}>
                <Text style={{ color: '#fff' }}>{item.value}</Text>
              </div>
            </List.Item>
          )}
        />
      </Card>

      <Modal
        title={t(`profile.${modalType}`)}
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        onOk={() => form.submit()}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
      >
        <Form form={form} layout="vertical" onFinish={handleUpdate}>
          {modalType === 'nickname' && (
            <Form.Item name="nickname" label={t('profile.nickname')} rules={[{ required: true }]}>
              <Input placeholder={t('profile.nickname')} />
            </Form.Item>
          )}
          {modalType === 'password' && (
            <>
              <Form.Item name="password" label={t('profile.password')} rules={[{ required: true, min: 6 }]}>
                <Input.Password placeholder={t('profile.password')} />
              </Form.Item>
              <Form.Item 
                name="confirm" 
                label={t('login.confirm_password')} 
                dependencies={['password']}
                rules={[
                  { required: true },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (!value || getFieldValue('password') === value) {
                        return Promise.resolve();
                      }
                      return Promise.reject(new Error(t('login.password_mismatch')));
                    },
                  }),
                ]}
              >
                <Input.Password />
              </Form.Item>
            </>
          )}
          {modalType === 'email' && (
            <Form.Item name="email" label={t('profile.email')} rules={[{ required: true, type: 'email' }]}>
              <Input placeholder="email@example.com" />
            </Form.Item>
          )}
          {modalType === 'mobile' && (
            <Form.Item name="mobile" label={t('profile.mobile')} rules={[{ required: true }]}>
              <Input placeholder="13800138000" />
            </Form.Item>
          )}
          {modalType === 'wechat' && (
             <div style={{ textAlign: 'center', padding: '20px 0' }}>
               <Text type="secondary">微信绑定功能开发中...</Text>
             </div>
          )}
        </Form>
      </Modal>
    </div>
  );
};

export default Profile;
