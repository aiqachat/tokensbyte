import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Space, Form, Input, Switch, message, Popconfirm, Modal, Tag, Select, Alert, Popover, Grid, Typography } from 'antd';
import MobileCardList, { MobileCard, CardRow, CardActions } from '../../components/MobileCardList';
import { PlusOutlined, EditOutlined, DeleteOutlined, CodeOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';

const { TextArea } = Input;
const { Text } = Typography;
const { useBreakpoint } = Grid;

interface ForwardRule {
  id: number;
  name: string;
  rule_type: string;
  category: string;
  config_json: string;
  description?: string;
  is_active: number;
  is_system?: number;
  created_at: string;
}

const ForwardRules: React.FC = () => {
  const { t } = useTranslation();
  const [items, setItems] = useState<ForwardRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isConfigModalVisible, setIsConfigModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<ForwardRule | null>(null);
  const [currentConfig, setCurrentConfig] = useState<string>('');
  const [form] = Form.useForm();
  const screens = useBreakpoint();

  const fetchItems = async () => {
    setLoading(true);
    try {
      const resp = await (request.get('/forward-rules') as any);
      setItems(resp);
    } catch (e) {
      console.error(e);
      message.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const handleAdd = () => {
    setEditingItem(null);
    form.resetFields();
    form.setFieldsValue({
      is_active: true,
      config_json: '{\n  \n}'
    });
    setIsModalVisible(true);
  };

  const handleEdit = (item: ForwardRule) => {
    setEditingItem(item);
    form.setFieldsValue({
      ...item,
      category: item.category ? [item.category] : ['聊天'],
      is_active: item.is_active === 1,
    });
    setIsModalVisible(true);
  };

  const handleStatusChange = async (record: ForwardRule, checked: boolean) => {
    try {
      await request.put(`/forward-rules/${record.id}`, {
        is_active: checked ? 1 : 0
      });
      message.success(t('common.success'));
      fetchItems();
    } catch (e) {
      console.error(e);
      message.error(t('common.error'));
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await request.delete(`/forward-rules/${id}`);
      message.success(t('common.success'));
      fetchItems();
    } catch (e) {
      console.error(e);
      message.error(t('common.error'));
    }
  };

  const handleSave = async (values: any) => {
    try {
      // Validate JSON content
      if (values.config_json) {
        try {
          JSON.parse(values.config_json);
        } catch (err) {
          message.error("配置内容不是合法的 JSON 格式");
          return;
        }
      }

      const payload = {
        ...values,
        category: (Array.isArray(values.category) && values.category.length > 0) ? values.category[0] : (values.category || '聊天'),
        is_active: values.is_active ? 1 : 0,
      };

      if (editingItem) {
        await request.put(`/forward-rules/${editingItem.id}`, payload);
      } else {
        await request.post('/forward-rules', payload);
      }
      message.success(t('common.success'));
      setIsModalVisible(false);
      fetchItems();
    } catch (e) {
      console.error(e);
      message.error(t('common.error'));
    }
  };

  const viewConfigJson = (jsonStr: string) => {
    try {
      const formatted = JSON.stringify(JSON.parse(jsonStr), null, 2);
      setCurrentConfig(formatted);
    } catch (e) {
      setCurrentConfig(jsonStr);
    }
    setIsConfigModalVisible(true);
  };

  const columns = [
    {
      title: '规则 ID',
      dataIndex: 'id',
      key: 'id',
      width: 80,
    },
    {
      title: '规则名称',
      dataIndex: 'name',
      key: 'name',
      width: 200,
      render: (text: string) => <Text strong>{text}</Text>
    },
    {
      title: '来源类型',
      dataIndex: 'is_system',
      key: 'is_system',
      width: 100,
      render: (is_system: number) => is_system === 1 ? <Tag color="blue">系统内置</Tag> : <Tag color="default">自定义</Tag>
    },
    {
      title: '模式/厂商类型',
      dataIndex: 'rule_type',
      key: 'rule_type',
      width: 150,
      render: (text: string) => <Tag color="purple">{text}</Tag>
    },
    {
      title: '所属分类',
      dataIndex: 'category',
      key: 'category',
      width: 100,
      render: (text: string) => {
        let color = 'cyan';
        if (text === '聊天') color = 'blue';
        else if (text === '图片') color = 'magenta';
        else if (text === '视频') color = 'volcano';
        else if (text === '语音') color = 'green';
        return <Tag color={color}>{text || '聊天'}</Tag>;
      }
    },
    {
      title: '应用详情描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: 'JSON 配置',
      key: 'config',
      render: (_: any, record: ForwardRule) => (
        <Button size="small" type="dashed" icon={<CodeOutlined />} onClick={() => viewConfigJson(record.config_json)}>
          查看 JSON 详情
        </Button>
      ),
      width: 150,
    },
    {
      title: t('common.status'),
      dataIndex: 'is_active',
      key: 'is_active',
      render: (active: number, record: ForwardRule) => (
        <Switch checked={active === 1} onChange={(checked) => handleStatusChange(record, checked)} />
      ),
      width: 100,
    },
    {
      title: t('common.actions'),
      key: 'actions',
      render: (_: any, record: ForwardRule) => (
        <Space>
          <Button icon={<EditOutlined />} onClick={() => handleEdit(record)} size="small" disabled={record.is_system === 1} />
          {record.is_system === 1 ? null : (
            <Popconfirm title={t('common.confirm_delete')} onConfirm={() => handleDelete(record.id)}>
              <Button icon={<DeleteOutlined />} danger size="small" />
            </Popconfirm>
          )}
        </Space>
      ),
      width: 120,
    },
  ];

  const CText: React.FC<{children: React.ReactNode}> = ({ children }) => (
    <span style={{ background: '#252526', color: '#ce9178', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace' }}>{children}</span>
  );

  const helpContent = (
    <div style={{ maxWidth: 500, color: 'rgba(255, 255, 255, 0.85)' }}>
      <p>高级转发规则（Forward Rules）用于底层<strong>路由重写</strong>与<strong>协议转换</strong>，赋予系统对接所有非标准 OpenAI 接口的自定义能力。</p>
      <p>当您接入特殊的第三方模型 API（如 Google 官方、Anthropic 等）而他们不使用标准的 <CText>/v1/chat/completions</CText> 路径时，您可以通过该规则将标准的接入请求转换为特定格式发往上游。</p>
      <div style={{ marginTop: 8 }}>
        <b>核心 JSON 配置参数指南：</b>
        <ul style={{ paddingLeft: 20, marginBottom: 0 }}>
          <li><CText>mode</CText>: 转发执行模式，例如 <CText>"transform"</CText> (启用协议报文转换)、<CText>"passthrough"</CText> (透明代理直接透传)。</li>
          <li><CText>target_type</CText>: 目标厂商架构标识，如 <CText>"gemini"</CText>, <CText>"anthropic"</CText>, <CText>"volcengine"</CText>。系统底层会自动加载该类型的 Header 或 Payload 模板。</li>
          <li><CText>path_rewrite</CText>: URL 路径拦截变异规则。
            <ul>
              <li><CText>old</CText>: 将被拦截替换的原始路径片段，例如 <CText>"/v1/video/generations"</CText>；</li>
              <li><CText>new</CText>: 将转换的新路径目标，支持宏变量替换，例如 <CText>{"\"/api/v3/contents/generations/tasks\""}</CText> (火山方舟官方)。</li>
            </ul>
          </li>
          <li><CText>auth_type</CText>: <span style={{ color: '#888' }}>(可选)</span> 强行覆盖认证鉴权机制传递方式，例如 <CText>"query_key"</CText> 将 API-Key 拼装至 URL Query 参数中发放，或 <CText>"bearer"</CText> 强制走 Authorization 头。</li>
          <li><CText>asset_convert</CText>: <span style={{ color: '#888' }}>(可选)</span> 设为 <CText>true</CText> 时启用火山方舟视频素材自动转换，系统会将请求体 content 中的网络 URL（图片/视频/音频）通过 CreateAsset API 注册为方舟素材 ID（<CText>asset://</CText> 前缀格式），同一 URL 仅转换一次。<span style={{ color: '#faad14' }}>需先在素材资产管理插件中配置审核凭证。</span></li>
        </ul>
      </div>
      <p style={{ marginTop: 8, color: '#1890ff', marginBottom: 0 }}>配置结束后，您可在「模型列表」页将其绑定至对应的具体模型，真实网关或系统拨测都将自动走您定义的这条重写链路。</p>
    </div>
  );

  return (
    <div>
      <Card title={
        <Space>
          {!screens.xs && '大模型高级转发规则引擎配置'}
          {screens.xs && '转发规则'}
          <Popover content={helpContent} title="什么是高级转发规则引擎？" trigger="hover" placement="bottomLeft">
            <QuestionCircleOutlined style={{ color: '#1890ff', cursor: 'pointer' }} />
          </Popover>
        </Space>
      } extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          {screens.xs ? '新增' : '新增定制规则'}
        </Button>
      }>
        {screens.xs ? (
          <MobileCardList
            dataSource={items}
            loading={loading}
            rowKey="id"
            pagination={{ pageSize: 15 }}
            renderCard={(record: any) => {
              let categoryColor = 'cyan';
              if (record.category === '聊天') categoryColor = 'blue';
              else if (record.category === '图片') categoryColor = 'magenta';
              else if (record.category === '视频') categoryColor = 'volcano';
              else if (record.category === '语音') categoryColor = 'green';
              return (
                <MobileCard
                  title={<Space><Text strong>{record.name}</Text></Space>}
                  extra={<Switch checked={record.is_active === 1} size="small" onChange={(checked) => handleStatusChange(record, checked)} />}
                >
                  <CardRow label="来源类型">{record.is_system === 1 ? <Tag color="blue">系统内置</Tag> : <Tag color="default">自定义</Tag>}</CardRow>
                  <CardRow label="模式"><Tag color="purple">{record.rule_type}</Tag></CardRow>
                  <CardRow label="分类"><Tag color={categoryColor}>{record.category || '聊天'}</Tag></CardRow>
                  {record.description && <CardRow label="描述"><Text type="secondary" style={{ fontSize: 12 }}>{record.description}</Text></CardRow>}
                  <CardActions>
                    <Button size="small" type="dashed" icon={<CodeOutlined />} onClick={() => viewConfigJson(record.config_json)}>JSON</Button>
                    <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} disabled={record.is_system === 1} />
                    {record.is_system !== 1 && (
                      <Popconfirm title={t('common.confirm_delete')} onConfirm={() => handleDelete(record.id)}>
                        <Button size="small" icon={<DeleteOutlined />} danger />
                      </Popconfirm>
                    )}
                  </CardActions>
                </MobileCard>
              );
            }}
          />
        ) : (
          <Table
            dataSource={items}
            columns={columns}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 15 }}
            size="middle"
          />
        )}
      </Card>

      <Modal
        title={editingItem ? '编辑高级规则' : '新增规则引擎接入'}
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        onOk={() => form.submit()}
        width={700}
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="name" label={'规则标识名称 (例如: Anthropic 原生转换)'} rules={[{ required: true }]}>
            <Input placeholder="输入此规则的标记名称以便于检索" />
          </Form.Item>

          <Form.Item name="rule_type" label="映射厂商及模式 (类型标识)" rules={[{ required: true }]}>
            <Input placeholder="如: openai, anthropic, gemini, passthrough" />
          </Form.Item>

          <Form.Item name="category" label={'模型分类属类'} rules={[{ required: true }]} initialValue={['聊天']}>
            <Select
              mode="tags"
              maxCount={1}
              placeholder="请选择或输入新分类并回车..."
              options={[
                { value: '聊天', label: '聊天' },
                { value: '图片', label: '图片' },
                { value: '视频', label: '视频' },
                { value: '语音', label: '语音' },
                { value: '其他', label: '其他' },
              ]}
            />
          </Form.Item>

          <Form.Item name="description" label="详细阐述">
            <Input.TextArea placeholder="用以描述该规则专门为了对接什么样的通道代理结构" rows={2} />
          </Form.Item>

          <Form.Item name="config_json" label="JSON 引擎路由协议参数配置 (核心)" rules={[{ required: true }]}>
            <TextArea style={{ fontFamily: 'monospace', fontSize: 13, background: '#1e1e1e', color: '#d4d4d4', padding: 12 }} rows={10} placeholder={'{\n  "mode": "...", \n}'} />
          </Form.Item>

          <Form.Item name="is_active" label={t('common.status')} valuePropName="checked">
            <Switch checkedChildren="激活中" unCheckedChildren="已停用" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="JSON 重写拦截协议预览"
        open={isConfigModalVisible}
        footer={null}
        onCancel={() => setIsConfigModalVisible(false)}
        width={650}
      >
        <pre style={{
          background: '#121212',
          color: '#4af626',
          padding: 16,
          borderRadius: 8,
          border: '1px solid #333',
          overflow: 'auto',
          maxHeight: '60vh',
          fontSize: 13,
        }}>
          {currentConfig}
        </pre>
      </Modal>

    </div>
  );
};

export default ForwardRules;
