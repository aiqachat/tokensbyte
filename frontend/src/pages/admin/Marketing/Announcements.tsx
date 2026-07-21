import React, { useEffect, useMemo, useState } from 'react';
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Switch,
  message,
  Space,
  Tag,
  Popconfirm,
  Tabs,
  Spin,
  Typography,
  Divider,
  Alert,
  Segmented,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SaveOutlined,
  SendOutlined,
  UndoOutlined,
  CodeOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import request from '../../../utils/request';
import type { Announcement } from '../../../types';

const { Text, Title } = Typography;
const { TextArea } = Input;

const DEFAULT_EMAIL_SUBJECT = '【{{site_name}}】账户余额不足提醒';
const DEFAULT_EMAIL_HTML = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e8e8e8; border-radius: 8px;">
  <div style="padding: 30px;">
    <h2 style="color: #fa8c16; margin: 0 0 24px 0; font-size: 22px; font-weight: 600;">余额不足提醒</h2>
    <p style="color: #333; font-size: 16px; margin: 0 0 16px 0;">您好！</p>
    <p style="color: #333; font-size: 16px; margin: 0 0 24px 0;">您的账户可用余额已低于设定阈值，请及时充值以免影响服务使用。</p>
    <div style="background-color: #f5f5f5; padding: 20px; border-radius: 6px; margin-bottom: 24px;">
      <p style="color: #666; font-size: 14px; margin: 0 0 8px 0;">当前余额：<strong style="color: #fa541c; font-size: 18px;">{{balance}}</strong></p>
      <p style="color: #666; font-size: 14px; margin: 0;">提醒阈值：<strong>{{threshold}}</strong></p>
    </div>
    <div style="border-top: 1px dashed #e8e8e8; margin-top: 24px; padding-top: 16px;">
      <p style="color: #999; font-size: 12px; margin: 0;">此邮件由 {{site_name}} 系统根据您的通知订阅设置自动发送。</p>
    </div>
  </div>
</div>`;

function renderTemplate(
  tpl: string,
  vars: { site_name: string; balance: string; threshold: string },
) {
  return tpl
    .replaceAll('{{site_name}}', vars.site_name)
    .replaceAll('{{balance}}', vars.balance)
    .replaceAll('{{threshold}}', vars.threshold);
}

const NotificationSettingsForm: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [siteName, setSiteName] = useState('TokensByte');
  const [previewBalance, setPreviewBalance] = useState('88.0000');
  const [previewThreshold, setPreviewThreshold] = useState('100.000000');
  const [testEmail, setTestEmail] = useState('');
  const [testMobile, setTestMobile] = useState('');
  const [testEmailLoading, setTestEmailLoading] = useState(false);
  const [testSmsLoading, setTestSmsLoading] = useState(false);
  const [bodyMode, setBodyMode] = useState<'edit' | 'preview'>('edit');

  const siteNotificationEnabled = Form.useWatch('site_notification_enabled', form);
  const emailSubject = Form.useWatch('low_balance_email_subject', form) || '';
  const emailHtml = Form.useWatch('low_balance_email_html', form) || '';

  const previewVars = useMemo(
    () => ({
      site_name: siteName || 'TokensByte',
      balance: previewBalance || '88.0000',
      threshold: previewThreshold || '100.000000',
    }),
    [siteName, previewBalance, previewThreshold],
  );

  const previewSubject = useMemo(
    () => renderTemplate(emailSubject || DEFAULT_EMAIL_SUBJECT, previewVars),
    [emailSubject, previewVars],
  );
  const previewHtml = useMemo(
    () => renderTemplate(emailHtml || DEFAULT_EMAIL_HTML, previewVars),
    [emailHtml, previewVars],
  );

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const response = await (request.get('/settings/full') as any);
      const n = response.notification || {};
      const smtpName = response.smtp?.from_name || response.site?.name || 'TokensByte';
      setSiteName(smtpName);
      form.setFieldsValue({
        site_notification_enabled: n.site_notification_enabled || false,
        sms_balance_notification: n.sms_balance_notification || false,
        email_balance_notification: n.email_balance_notification || false,
        web_notification_enabled: n.web_notification_enabled !== false,
        push_notification_enabled: n.push_notification_enabled !== false,
        do_not_disturb_enabled: n.do_not_disturb_enabled !== false,
        low_balance_threshold:
          n.low_balance_threshold != null && n.low_balance_threshold > 0
            ? n.low_balance_threshold
            : 100,
        low_balance_email_subject:
          n.low_balance_email_subject?.trim() || DEFAULT_EMAIL_SUBJECT,
        low_balance_email_html: n.low_balance_email_html?.trim() || DEFAULT_EMAIL_HTML,
      });
      if (n.low_balance_threshold != null && n.low_balance_threshold > 0) {
        setPreviewThreshold(String(n.low_balance_threshold));
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error);
      message.error('获取基础配置失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async () => {
    setSubmitting(true);
    try {
      const values = await form.validateFields();
      await request.post('/settings', { notification: values });
      message.success('保存配置成功');
    } catch (error) {
      console.error('Failed to save settings:', error);
      message.error('保存配置失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetTemplate = () => {
    form.setFieldsValue({
      low_balance_email_subject: DEFAULT_EMAIL_SUBJECT,
      low_balance_email_html: DEFAULT_EMAIL_HTML,
    });
    message.info('已恢复默认邮件模版（需点击保存才会生效）');
  };

  const handleTestEmail = async () => {
    if (!testEmail.trim()) {
      message.warning('请输入测试收件邮箱');
      return;
    }
    setTestEmailLoading(true);
    try {
      const values = form.getFieldsValue();
      const res = await (request.post('/settings/notification/test', {
        channel: 'email',
        to: testEmail.trim(),
        balance: previewBalance,
        threshold: previewThreshold,
        subject: values.low_balance_email_subject || DEFAULT_EMAIL_SUBJECT,
        html: values.low_balance_email_html || DEFAULT_EMAIL_HTML,
      }) as any);
      res.success ? message.success(res.message) : message.error(res.message || '发送失败');
    } catch (e: any) {
      message.error(e?.message || '测试邮件发送失败');
    } finally {
      setTestEmailLoading(false);
    }
  };

  const handleTestSms = async () => {
    if (!testMobile.trim()) {
      message.warning('请输入测试手机号');
      return;
    }
    setTestSmsLoading(true);
    try {
      const res = await (request.post('/settings/notification/test', {
        channel: 'sms',
        mobile: testMobile.trim(),
        balance: previewBalance,
        threshold: previewThreshold,
      }) as any);
      res.success ? message.success(res.message) : message.error(res.message || '发送失败');
    } catch (e: any) {
      message.error(e?.message || '测试短信发送失败');
    } finally {
      setTestSmsLoading(false);
    }
  };

  if (loading) return <Spin style={{ display: 'block', margin: '40px auto' }} />;

  return (
    <Form
      form={form}
      layout="vertical"
      style={{ maxWidth: 960 }}
      initialValues={{
        web_notification_enabled: true,
        push_notification_enabled: true,
        do_not_disturb_enabled: true,
        low_balance_threshold: 100,
        low_balance_email_subject: DEFAULT_EMAIL_SUBJECT,
        low_balance_email_html: DEFAULT_EMAIL_HTML,
      }}
    >
      <Form.Item
        name="site_notification_enabled"
        label="站点提示（总开关）"
        valuePropName="checked"
        tooltip="开启后用户可以在个人中心订阅以下通知功能"
      >
        <Switch />
      </Form.Item>

      {siteNotificationEnabled && (
        <Card size="small" style={{ marginBottom: 24, backgroundColor: 'var(--ant-color-bg-layout)' }}>
          <Form.Item
            name="do_not_disturb_enabled"
            label="勿扰模式"
            valuePropName="checked"
            tooltip="开启后用户可在通知订阅中使用勿扰开关"
          >
            <Switch />
          </Form.Item>
          <Form.Item
            name="web_notification_enabled"
            label="Web 站内通知"
            valuePropName="checked"
            tooltip="开启后用户可订阅控制台站内通知（铃铛/公告）"
          >
            <Switch />
          </Form.Item>
          <Form.Item
            name="push_notification_enabled"
            label="Push 浏览器推送"
            valuePropName="checked"
            tooltip="开启后用户可订阅浏览器系统推送"
          >
            <Switch />
          </Form.Item>
          <Form.Item
            name="sms_balance_notification"
            label="短信余额提示"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          <Form.Item
            name="email_balance_notification"
            label="邮件余额提示"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          <Form.Item
            name="low_balance_threshold"
            label="余额不足提醒阈值（全局默认）"
            rules={[{ required: true, message: '请设置阈值' }]}
            extra="用户未自定义时使用该阈值，默认为 100"
          >
            <InputNumber min={0} step={1} precision={6} style={{ width: '100%' }} placeholder="100" />
          </Form.Item>
        </Card>
      )}

      <Divider />

      <Title level={5} style={{ marginTop: 0 }}>
        余额不足提醒 · 邮件模版
      </Title>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="可用变量"
        description={
          <span>
            <Text code>{'{{site_name}}'}</Text> 站点/发件人名称 ·{' '}
            <Text code>{'{{balance}}'}</Text> 当前余额 ·{' '}
            <Text code>{'{{threshold}}'}</Text> 提醒阈值
          </span>
        }
      />

      <Form.Item
        name="low_balance_email_subject"
        label="邮件主题"
        rules={[{ required: true, message: '请填写邮件主题' }]}
      >
        <Input placeholder={DEFAULT_EMAIL_SUBJECT} />
      </Form.Item>

      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
          <Text style={{ fontWeight: 500 }}>邮件正文</Text>
          <Space wrap size="small">
            <Segmented
              size="small"
              value={bodyMode}
              onChange={(v) => setBodyMode(v as 'edit' | 'preview')}
              options={[
                { label: '编辑 HTML', value: 'edit', icon: <CodeOutlined /> },
                { label: '实时预览', value: 'preview', icon: <EyeOutlined /> },
              ]}
            />
            {bodyMode === 'preview' && (
              <>
                <Text type="secondary" style={{ fontSize: 12 }}>预览余额</Text>
                <Input
                  value={previewBalance}
                  onChange={(e) => setPreviewBalance(e.target.value)}
                  style={{ width: 100 }}
                  size="small"
                />
                <Text type="secondary" style={{ fontSize: 12 }}>预览阈值</Text>
                <Input
                  value={previewThreshold}
                  onChange={(e) => setPreviewThreshold(e.target.value)}
                  style={{ width: 100 }}
                  size="small"
                />
              </>
            )}
            <Button size="small" icon={<UndoOutlined />} onClick={handleResetTemplate}>
              恢复默认
            </Button>
          </Space>
        </div>
        <Text type="secondary" style={{ display: 'block', fontSize: 12, marginBottom: 8 }}>
          支持 HTML。预览模式会实时替换变量，发送给用户时使用同一套渲染逻辑。
        </Text>
        <Form.Item
          name="low_balance_email_html"
          rules={[{ required: true, message: '请填写邮件正文' }]}
          style={{ display: bodyMode === 'edit' ? 'block' : 'none', marginBottom: 0 }}
        >
          <TextArea
            rows={14}
            style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12 }}
          />
        </Form.Item>
        {bodyMode === 'preview' && (
          <div
            style={{
              border: '1px solid var(--ant-color-border)',
              borderRadius: 8,
              padding: 12,
              background: '#fff',
              minHeight: 280,
              overflow: 'auto',
            }}
          >
            <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>
              主题：{previewSubject}
            </Text>
            <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
          </div>
        )}
      </div>

      <Title level={5}>测试发送</Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
        使用上方预览余额/阈值与当前编辑中的模版发送，无需先保存。短信正文由腾讯云「余额提醒模板」决定，此处仅传入余额与阈值变量。
      </Text>
      <Space direction="vertical" style={{ width: '100%', marginBottom: 24 }} size="middle">
        <Space wrap>
          <Input
            placeholder="测试收件邮箱"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            style={{ width: 280 }}
          />
          <Button
            icon={<SendOutlined />}
            loading={testEmailLoading}
            onClick={handleTestEmail}
          >
            发送测试邮件
          </Button>
        </Space>
        <Space wrap>
          <Input
            placeholder="测试手机号"
            value={testMobile}
            onChange={(e) => setTestMobile(e.target.value)}
            style={{ width: 280 }}
          />
          <Button
            icon={<SendOutlined />}
            loading={testSmsLoading}
            onClick={handleTestSms}
          >
            发送测试短信
          </Button>
        </Space>
      </Space>

      <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={submitting}>
        保存配置
      </Button>
    </Form>
  );
};

const Announcements: React.FC = () => {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form] = Form.useForm();

  const fetchAnnouncements = async () => {
    setLoading(true);
    try {
      const response = await (request.get('/announcements') as any);
      setAnnouncements(response.data || []);
    } catch (error) {
      console.error('Failed to fetch announcements:', error);
      message.error('获取通知列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const handleAdd = () => {
    setEditingId(null);
    form.resetFields();
    form.setFieldsValue({ is_pinned: false, is_active: true });
    setModalVisible(true);
  };

  const handleEdit = (record: Announcement) => {
    setEditingId(record.id);
    form.setFieldsValue({
      ...record,
      is_pinned: record.is_pinned === 1,
      is_active: record.is_active === 1,
    });
    setModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await (request.delete(`/announcements/${id}`) as any);
      message.success('删除成功');
      fetchAnnouncements();
    } catch (error) {
      console.error('Failed to delete announcement:', error);
      message.error('删除失败');
    }
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        title: values.title,
        content: values.content,
        is_pinned: values.is_pinned ? 1 : 0,
        is_active: values.is_active ? 1 : 0,
      };

      if (editingId) {
        await (request.put(`/announcements/${editingId}`, payload) as any);
        message.success('更新成功');
      } else {
        await (request.post('/announcements', payload) as any);
        message.success('创建成功');
      }
      setModalVisible(false);
      fetchAnnouncements();
    } catch (error) {
      console.error('Failed to save announcement:', error);
    }
  };

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 80,
    },
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
    },
    {
      title: '状态',
      key: 'status',
      render: (_: any, record: Announcement) => (
        <Space>
          {record.is_active === 1 ? <Tag color="success">上架</Tag> : <Tag color="default">下架</Tag>}
          {record.is_pinned === 1 && <Tag color="blue">置顶</Tag>}
        </Space>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (text: string) => new Date(text).toLocaleString(),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: Announcement) => (
        <Space>
          <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Popconfirm title="确定要删除该通知吗？" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const items = [
    {
      key: 'list',
      label: '通知列表',
      children: (
        <>
          <div style={{ marginBottom: 16 }}>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增通知</Button>
          </div>
          <Table
            columns={columns}
            dataSource={announcements}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 10 }}
          />
        </>
      ),
    },
    {
      key: 'settings',
      label: '基础配置',
      children: <NotificationSettingsForm />,
    },
  ];

  return (
    <Card
      title="提示通知管理"
      style={{ borderRadius: 12 }}
      bordered={false}
    >
      <Tabs items={items} />

      <Modal
        title={editingId ? '编辑通知' : '新增通知'}
        open={modalVisible}
        onOk={handleSave}
        onCancel={() => setModalVisible(false)}
        width={800}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="通知标题" rules={[{ required: true, message: '请输入标题' }]}>
            <Input placeholder="请输入通知标题" />
          </Form.Item>

          <Space size="large" style={{ marginBottom: 24 }}>
            <Form.Item name="is_pinned" label="置顶显示" valuePropName="checked" style={{ margin: 0 }}>
              <Switch />
            </Form.Item>
            <Form.Item name="is_active" label="是否上架" valuePropName="checked" style={{ margin: 0 }}>
              <Switch />
            </Form.Item>
          </Space>

          <Form.Item name="content" label="通知内容" rules={[{ required: true, message: '请输入通知内容' }]}>
            <ReactQuill
              theme="snow"
              style={{ height: 300, marginBottom: 40, backgroundColor: 'var(--ant-color-bg-container)', color: 'var(--ant-color-text)' }}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default Announcements;
