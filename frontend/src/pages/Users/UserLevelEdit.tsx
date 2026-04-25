import React, { useEffect, useState } from 'react';
import { Card, Form, Input, InputNumber, Button, message, Space, Tabs, Spin, Switch } from 'antd';
import { SaveOutlined, ArrowLeftOutlined, KeyOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { pinyin } from 'pinyin-pro';
import request from '../../utils/request';
import type { UserLevel } from '../../types';

const { TabPane } = Tabs;

const UserLevelEdit: React.FC = () => {
  const { t } = useTranslation();
  const { actionId } = useParams<{ actionId: string }>();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [groupKeyManuallyEdited, setGroupKeyManuallyEdited] = useState(false);
  const isAdd = actionId === 'new';

  // 根据名称自动生成分组标识
  const generateGroupKey = (name: string): string => {
    if (!name.trim()) return '';
    // 判断是否包含中文字符
    const hasChinese = /[\u4e00-\u9fa5]/.test(name);
    if (hasChinese) {
      // 中文：取每个字的拼音首字母
      const py = pinyin(name, { pattern: 'first', toneType: 'none', type: 'array' });
      return py.join('').toLowerCase().replace(/[^a-z0-9]/g, '');
    } else {
      // 英文：直接用名称小写，去除非字母数字
      return name.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    }
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    // 新建模式下且未手动编辑过分组标识，自动生成
    if (isAdd && !groupKeyManuallyEdited) {
      form.setFieldValue('group_key', generateGroupKey(name));
    }
  };

  useEffect(() => {
    if (isAdd) {
      setLoading(false);
      form.setFieldsValue({
        discount: 1.0,
        commission_ratio: 0.0,
        invite_reward_inviter: 0.0,
        invite_reward_invitee: 0.0,
        daily_invite_limit: 10,
        marketing_enabled: false,
        is_default: false,
        max_token_count: 10,
      });
      return;
    }

    const fetchLevel = async () => {
      setLoading(true);
      try {
        const resp = await (request.get('/user_levels') as unknown as Promise<{ data: UserLevel[] }>);
        const level = resp.data.find((l: UserLevel) => String(l.id) === actionId);
        if (level) {
          form.setFieldsValue({
            ...level,
            marketing_enabled: level.marketing_enabled === 1,
            is_default: level.is_default === 1,
          });
        } else {
          message.error('未找到对应等级记录');
          navigate('/admin0755/user-levels');
        }
      } catch (e) {
        console.error(e);
        message.error('获取等级详情失败');
      } finally {
        setLoading(false);
      }
    };

    fetchLevel();
  }, [actionId, form, isAdd, navigate]);

  const handleSave = async (values: any) => {
    setSaving(true);
    // Convert boolean switch back to number
    const payload = {
      ...values,
      marketing_enabled: values.marketing_enabled ? 1 : 0,
      is_default: values.is_default ? 1 : 0,
    };
    // 新建时自动生成 group_key
    if (isAdd && !payload.group_key) {
      payload.group_key = generateGroupKey(values.name || '');
    }
    if (!payload.group_key) {
      message.error('分组标识不能为空');
      setSaving(false);
      return;
    }
    try {
      if (isAdd) {
        await request.post('/user_levels', payload);
        message.success(t('user_levels.success'));
      } else {
        await request.put(`/user_levels/${actionId}`, payload);
        message.success(t('user_levels.success'));
      }
      navigate('/admin0755/user-levels');
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div style={{ textAlign: 'center', marginTop: 100 }}><Spin size="large" /></div>;
  }

  const groupKey = form.getFieldValue('group_key');

  return (
    <Card 
      title={
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/admin0755/user-levels')} />
          <span>{isAdd ? t('user_levels.add_level') : t('user_levels.edit_level')}</span>
        </Space>
      }
      extra={
        <Button type="primary" icon={<SaveOutlined />} onClick={() => form.submit()} loading={saving}>
          保存配置
        </Button>
      }
      bordered={false}
    >
      <Form form={form} layout="vertical" onFinish={handleSave} style={{ maxWidth: 800 }}>
        <Tabs defaultActiveKey="1" type="card">
          <TabPane tab="等级基本信息" key="1">
            <Form.Item name="name" label={t('user_levels.name')} rules={[{ required: true }]}>
              <Input placeholder="输入等级呈现的中文名称" onChange={handleNameChange} />
            </Form.Item>
            {!isAdd && (
              <Form.Item 
                name="group_key" 
                label={t('user_levels.group_key')} 
                rules={[{ required: true }]}
              >
                <Input 
                  placeholder="e.g. vip, primary" 
                  disabled={groupKey === 'default'}
                />
              </Form.Item>
            )}
            <Form.Item 
              name="discount" 
              label={t('user_levels.discount', '计费倍率 (Discount/Multiplier)')} 
              rules={[{ required: true }]}
              extra="设置用户计费的乘数。1 为原价不打折；小于1为折扣优惠（如 0.8 为 8折）；大于1为加倍收费（如 1.5 表明加价50%）。"
            >
              <InputNumber style={{ width: '100%' }} min={0.01} max={999} step={0.01} precision={2} />
            </Form.Item>
            <Form.Item name="description" label={t('user_levels.description')}>
              <Input.TextArea rows={4} placeholder="描述该组特权或补充信息..." />
            </Form.Item>
            <Form.Item 
              name="is_default" 
              label="设为默认注册等级" 
              valuePropName="checked"
              extra="开启后，新用户注册时将自动成为该等级。同一时间只能有一个默认注册等级，设置后会覆盖之前的默认等级。"
            >
              <Switch checkedChildren="默认等级" unCheckedChildren="非默认" />
            </Form.Item>
          </TabPane>

          <TabPane tab="等级营销推广" key="2">
            <Form.Item 
              name="marketing_enabled" 
              label="开启专属推广模式 (高优先级)" 
              valuePropName="checked"
              extra="开启后，被邀请人注册时将不再发放站点的「全局注册好礼」，而是直接发放该等级配置的面额。邀请人也会根据日限制额度获得对应提成。"
            >
              <Switch checkedChildren="已开启" unCheckedChildren="已关闭" />
            </Form.Item>

            <Form.Item 
              name="commission_ratio" 
              label="返利比例 (邀请充值返现)" 
              rules={[{ required: true }]}
              extra="邀请的用户充值后，邀请人获得的奖金入账比例 (0-1)"
            >
              <InputNumber 
                style={{ width: '100%' }} 
                min={0} 
                max={1} 
                step={0.01} 
                precision={2} 
                formatter={value => `${Math.round((Number(value) || 0) * 100)}%`}
                parser={value => (parseFloat(value?.replace('%', '') || '0') / 100) as any}
              />
            </Form.Item>

            <Form.Item 
              name="invite_reward_inviter" 
              label="邀请成功送额度（给邀请人）" 
              rules={[{ required: true }]}
              extra="当受邀人成功注册并激活后，一次性赠送给【邀请人】的固定消费额度"
            >
              <InputNumber style={{ width: '100%' }} min={0} step={1} precision={2} />
            </Form.Item>

            <Form.Item 
              name="invite_reward_invitee" 
              label="走邀请链接注册送额度（给新客户/受邀人）" 
              rules={[{ required: true }]}
              extra="【受到邀请】而来的新用户，一经注册额外直接赠送的启动资金加成额度"
            >
              <InputNumber style={{ width: '100%' }} min={0} step={1} precision={2} />
            </Form.Item>

            <Form.Item 
              name="daily_invite_limit" 
              label="每日邀请人数上限 (0为无限)" 
              rules={[{ required: true }]}
              extra="限制每天最多有多少个有效下线名额可以获得固定额度奖励，防止机器批量注册撸羊毛（超出的邀请可能依然绑定但不支持送额度）"
            >
              <InputNumber style={{ width: '100%' }} min={0} step={1} precision={0} />
            </Form.Item>
          </TabPane>

          <TabPane tab={<span><KeyOutlined /> 密钥配置</span>} key="3">
            <Form.Item 
              name="max_token_count" 
              label="最大密钥创建数量" 
              rules={[{ required: true }]}
              extra="限制该等级用户可以创建的 API 密钥数量上限。设为 0 表示禁止创建密钥。"
            >
              <InputNumber style={{ width: '100%' }} min={0} max={1000} step={1} precision={0} />
            </Form.Item>
          </TabPane>
        </Tabs>
      </Form>
    </Card>
  );
};

export default UserLevelEdit;
