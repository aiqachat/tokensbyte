import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Space, Form, Input, Switch, message, Popconfirm, Modal, Tag, Select, Alert, Popover, Grid, Typography, Tooltip, Radio, InputNumber } from 'antd';
import MobileCardList, { MobileCard, CardRow, CardActions } from '../../components/MobileCardList';
import { PlusOutlined, EditOutlined, DeleteOutlined, CodeOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';
import { useThemeStore } from '../../store/theme';

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
  eid?: string;
  is_active: number;
  is_system?: number;
  sort_order: number;
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
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [ruleTypeFilter, setRuleTypeFilter] = useState('all');
  // 动态获取的模型分类类型列表（从 model_types 接口获取，保持与后台一致）
  const [modelTypes, setModelTypes] = useState<{ id: number; name: string }[]>([]);
  const [form] = Form.useForm();
  const screens = useBreakpoint();

  const uniqueCategories = Array.from(new Set(items.map(i => i.category).filter(Boolean)));
  const uniqueTypes = Array.from(new Set(items.map(i => i.rule_type).filter(Boolean)));

  const filteredItems = items.filter(item => {
    let matchQuery = true;
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      matchQuery = Boolean(
        (item.name && item.name.toLowerCase().includes(lowerQuery)) ||
        (item.eid && String(item.eid).toLowerCase().includes(lowerQuery))
      );
    }
    const matchCategory = categoryFilter === 'all' || item.category === categoryFilter;
    const matchType = ruleTypeFilter === 'all' || item.rule_type === ruleTypeFilter;
    return matchQuery && matchCategory && matchType;
  });

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
    // 动态加载模型分类类型（用于新增/编辑弹窗的分类选择）
    (request.get('/model-types') as any).then((types: any[]) => {
      setModelTypes(types.filter((t: any) => t.is_active === 1));
    }).catch(() => {});
  }, []);

  const handleAdd = () => {
    setEditingItem(null);
    form.resetFields();
    form.setFieldsValue({
      is_active: true,
      config_json: '{\n  \n}',
      sort_order: 0,
    });
    setIsModalVisible(true);
  };

  const handleEdit = (item: ForwardRule) => {
    let pollPath = '';
    try {
      const config = JSON.parse(item.config_json);
      pollPath = config.poll_path || '';
    } catch (e) { /* ignore */ }

    setEditingItem(item);
    form.setFieldsValue({
      ...item,
      category: item.category ? [item.category] : ['聊天'],
      poll_path: pollPath,
      is_active: item.is_active === 1,
      sort_order: item.sort_order || 0,
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
      let configObj: any = {};
      try {
        configObj = JSON.parse(values.config_json || '{}');
      } catch (err) {
        message.error("配置内容不是合法的 JSON 格式");
        return;
      }

      // 自动同步 poll_path 到 config_json
      if (values.poll_path) {
        configObj.poll_path = values.poll_path;
      } else {
        delete configObj.poll_path;
      }

      const payload = {
        ...values,
        config_json: JSON.stringify(configObj, null, 2),
        category: (Array.isArray(values.category) && values.category.length > 0) ? values.category[0] : (values.category || '聊天'),
        is_active: values.is_active ? 1 : 0,
      };
      // poll_path 已合并到 config_json 内，不需要作为独立字段发送
      delete payload.poll_path;

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
      title: '转发 (EID)',
      dataIndex: 'eid',
      key: 'eid',
      width: 120,
      render: (text: string) => <Tag color="blue">{text || '-'}</Tag>
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
        const colorMap: Record<string, string> = {
          '聊天': 'blue', '图片': 'magenta', '视频': 'volcano',
          '语音': 'green', '音频': 'green', '向量': 'geekblue', '排序': 'gold',
        };
        return <Tag color={colorMap[text] || 'cyan'}>{text || '聊天'}</Tag>;
      }
    },
    {
      title: '应用详情描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: '排序',
      dataIndex: 'sort_order',
      key: 'sort_order',
      width: 90,
      sorter: (a: ForwardRule, b: ForwardRule) => (a.sort_order || 0) - (b.sort_order || 0),
      render: (text: number) => <Text>{text || 0}</Text>
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
      render: (active: number) => {
        const isActive = active === 1;
        return (
          <span style={{ 
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '2px 6px', borderRadius: 4, fontSize: 12,
            background: isActive ? 'rgba(128,128,128,0.06)' : 'transparent',
            color: isActive ? 'var(--text-color, inherit)' : '#8c8c8c',
            border: isActive ? '1px solid rgba(128,128,128,0.15)' : '1px dashed rgba(128,128,128,0.3)'
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: isActive ? '#8c8c8c' : 'transparent', border: isActive ? 'none' : '1px solid #8c8c8c' }} />
            {isActive ? t('common.active') : t('common.disabled')}
          </span>
        );
      },
      width: 100,
    },
    {
      title: t('common.actions'),
      key: 'actions',
      render: (_: any, record: ForwardRule) => (
        <Space>
          <Button icon={<EditOutlined />} onClick={() => handleEdit(record)} size="small" />
          {record.is_system === 1 ? (
            <Tooltip title="系统内置规则，不可删除">
              <Button icon={<DeleteOutlined />} disabled size="small" />
            </Tooltip>
          ) : (
            <Popconfirm title={t('common.confirm_delete')} onConfirm={() => handleDelete(record.id)}>
              <Button icon={<DeleteOutlined />} danger size="small" />
            </Popconfirm>
          )}
        </Space>
      ),
      width: 120,
    },
  ];

  const { themeMode } = useThemeStore();
  const _isLight = themeMode === 'light';

  const CText: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <span style={{
      background: _isLight ? 'rgba(0,0,0,0.06)' : '#252526',
      color: _isLight ? '#cf222e' : '#ce9178',
      padding: '2px 6px',
      borderRadius: 4,
      fontFamily: 'monospace'
    }}>{children}</span>
  );

  const helpContent = (
    <div style={{ maxWidth: 500, color: _isLight ? 'rgba(0, 0, 0, 0.85)' : 'rgba(255, 255, 255, 0.85)' }}>
      <p>高级转发规则（Forward Rules）用于底层<strong>路由重写</strong>与<strong>协议转换</strong>，赋予系统对接所有非标准 OpenAI 接口的自定义能力。</p>
      <p>当您接入特殊的第三方模型 API（如 Google 官方、Anthropic 等）而他们不使用标准的 <CText>/v1/chat/completions</CText> 路径时，您可以通过该规则将标准的接入请求转换为特定格式发往上游。</p>
      <div style={{ marginTop: 8 }}>
        <b>核心 JSON 配置参数指南：</b>
        <ul style={{ paddingLeft: 20, marginBottom: 0 }}>
          <li><CText>mode</CText>: 转发执行模式，例如 <CText>"transform"</CText> (启用协议报文转换)、<CText>"passthrough"</CText> (透明代理直接透传)。</li>
          <li><CText>target_type</CText>: 目标厂商架构标识，如 <CText>"gemini"</CText>, <CText>"anthropic"</CText>, <CText>"volcengine"</CText>, <CText>"tencent_vod_image"</CText>, <CText>"tencent_vod_video"</CText>。系统底层会自动加载该类型的 Header 或 Payload 模板。</li>
          <li><CText>path_rewrite</CText>: URL 路径拦截变异规则。
            <ul>
              <li><CText>old</CText>: 将被拦截替换的原始路径片段，例如 <CText>"/v1/video/generations"</CText>；</li>
              <li><CText>new</CText>: 将转换的新路径目标，支持宏变量替换，例如 <CText>{"\"/api/v3/contents/generations/tasks\""}</CText> (火山方舟官方)。</li>
            </ul>
          </li>
          <li><CText>auth_type</CText>: <span style={{ color: '#888' }}>(可选)</span> 强行覆盖认证鉴权机制传递方式，例如 <CText>"query_key"</CText> 将 API-Key 拼装至 URL Query 参数中发放，<CText>"bearer"</CText> 强制走 Authorization 头，<CText>"tencent_vod"</CText> 使用 TC3-HMAC-SHA256 签名鉴权。</li>
          <li><CText>poll_path</CText>: <span style={{ color: '#888' }}>(可选)</span> <strong>异步轮询路径</strong>。例如针对图片模型设为 <CText>{`"/v1/tasks/\${task_id}"`}</CText>。支持宏变量 <CText>{`\${task_id}`}</CText> 和 <CText>{`\${model}`}</CText>。</li>
          <li><CText>asset_convert</CText>: <span style={{ color: '#888' }}>(可选)</span> 设为 <CText>true</CText> 时启用火山方舟视频素材自动转换，系统会将请求体 content 中的网络 URL（图片/视频/音频）通过 CreateAsset API 注册为方舟素材 ID（<CText>asset://</CText> 前缀格式），同一 URL 仅转换一次。<span style={{ color: '#faad14' }}>需先在素材资产管理插件中配置审核凭证。</span>（可通过 <CText>asset_convert_ns</CText> 指定使用国际版插件: <CText>"asset_manager_intl"</CText>）</li>
          <li><CText>moderation</CText>: <span style={{ color: '#888' }}>(可选)</span> 设为 <CText>true</CText> 时，在资产转换注册时会向方舟接口发起 <CText>Moderation.Strategy</CText> 为 <CText>Skip</CText> 的免审核策略参数。</li>
        </ul>
      </div>
      <p style={{ marginTop: 8, color: '#1890ff', marginBottom: 0 }}>配置结束后，您可在「模型列表」页将其绑定至对应的具体模型，真实网关或系统拨测都将自动走您定义的这条重写链路。</p>
    </div>
  );

  return (
    <>
      <Card variant="borderless">
        <div style={{ display: 'flex', flexDirection: screens.xs ? 'column' : 'row', justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Typography.Title level={screens.xs ? 4 : 2} style={{ margin: 0 }}>
              高级转发规则管理
            </Typography.Title>
            <Popover content={helpContent} title="什么是高级转发规则引擎？" trigger="hover" placement="bottomLeft">
              <QuestionCircleOutlined style={{ color: '#1890ff', cursor: 'pointer', fontSize: 18 }} />
            </Popover>
          </div>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            {screens.xs ? '新增' : '新增定制规则'}
          </Button>
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', marginBottom: 20 }}>
          <Input.Search
            placeholder="搜索规则名称或EID"
            allowClear
            onSearch={setSearchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: 200 }}
          />
          <Space wrap size={[0, 8]}>
            <Text type="secondary" style={{ fontSize: 13, marginRight: 4 }}>所属分类:</Text>
            <Radio.Group
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              optionType="button"
              buttonStyle="solid"
              size="small"
            >
              <Radio.Button value="all">全部分类</Radio.Button>
              {uniqueCategories.map(c => <Radio.Button key={c} value={c}>{c}</Radio.Button>)}
            </Radio.Group>
          </Space>
          <Space wrap size={[0, 8]}>
            <Text type="secondary" style={{ fontSize: 13, marginRight: 4 }}>类型:</Text>
            <Radio.Group
              value={ruleTypeFilter}
              onChange={e => setRuleTypeFilter(e.target.value)}
              optionType="button"
              buttonStyle="solid"
              size="small"
            >
              <Radio.Button value="all">全部类型</Radio.Button>
              {uniqueTypes.map(t => <Radio.Button key={t} value={t}>{t}</Radio.Button>)}
            </Radio.Group>
          </Space>
        </div>
        {screens.xs ? (
          <MobileCardList
            dataSource={filteredItems}
            loading={loading}
            rowKey="id"
            pagination={{ pageSize: 15 }}
            renderCard={(record: any) => {
              const mobileColorMap: Record<string, string> = {
                '聊天': 'blue', '图片': 'magenta', '视频': 'volcano',
                '语音': 'green', '音频': 'green', '向量': 'geekblue', '排序': 'gold',
              };
              const categoryColor = mobileColorMap[record.category] || 'cyan';
              return (
                  <MobileCard
                    title={<Space><Text strong>{record.name}</Text></Space>}
                    extra={(() => {
                      const isActive = record.is_active === 1;
                      return (
                        <span style={{ 
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '2px 6px', borderRadius: 4, fontSize: 12,
                          background: isActive ? 'rgba(128,128,128,0.06)' : 'transparent',
                          color: isActive ? 'var(--text-color, inherit)' : '#8c8c8c',
                          border: isActive ? '1px solid rgba(128,128,128,0.15)' : '1px dashed rgba(128,128,128,0.3)'
                        }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: isActive ? '#8c8c8c' : 'transparent', border: isActive ? 'none' : '1px solid #8c8c8c' }} />
                          {isActive ? t('common.active') : t('common.disabled')}
                        </span>
                      );
                    })()}
                  >
                  <CardRow label="转发 (EID)"><Tag color="blue">{record.eid || '-'}</Tag></CardRow>
                  <CardRow label="来源类型">{record.is_system === 1 ? <Tag color="blue">系统内置</Tag> : <Tag color="default">自定义</Tag>}</CardRow>
                  <CardRow label="模式"><Tag color="purple">{record.rule_type}</Tag></CardRow>
                  <CardRow label="分类"><Tag color={categoryColor}>{record.category || '聊天'}</Tag></CardRow>
                  <CardRow label="排序"><Text>{record.sort_order || 0}</Text></CardRow>
                  {record.description && <CardRow label="描述"><Text type="secondary" style={{ fontSize: 12 }}>{record.description}</Text></CardRow>}
                  <CardActions>
                    <Button size="small" type="dashed" icon={<CodeOutlined />} onClick={() => viewConfigJson(record.config_json)}>JSON</Button>
                    <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
                    {record.is_system === 1 ? (
                      <Tooltip title="系统内置规则，不可删除">
                        <Button size="small" icon={<DeleteOutlined />} disabled />
                      </Tooltip>
                    ) : (
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
            dataSource={filteredItems}
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
              options={modelTypes.length > 0
                ? modelTypes.map(t => ({ value: t.name, label: t.name }))
                : [{ value: '聊天', label: '聊天' }]
              }
            />
          </Form.Item>

          <Form.Item name="description" label="详细阐述">
            <Input.TextArea placeholder="用以描述该规则专门为了对接什么样的通道代理结构" rows={2} />
          </Form.Item>

          <Form.Item name="sort_order" label="排序" initialValue={0} tooltip="数字越大排在越前面">
            <InputNumber min={0} style={{ width: '100%' }} placeholder="请输入排序值（数字越大越靠前）" />
          </Form.Item>

          <Form.Item name="poll_path" label={<Space>异步任务轮询路径 (可选) <Popover content={`如果该模型是异步任务且上游查询路径非标准，请在此填写。例如：/v1/tasks/\${task_id}`}><QuestionCircleOutlined /></Popover></Space>}>
            <Input placeholder={`例如: /v1/tasks/\${task_id} 或 /v1/video/generations/\${task_id}`} />
          </Form.Item>

          <Form.Item name="config_json" label="JSON 引擎路由协议参数配置 (核心)" rules={[{ required: true }]}>
            <TextArea style={{ fontFamily: 'monospace', fontSize: 13, background: '#1e1e1e', color: '#d4d4d4', padding: 12 }} rows={10} placeholder={'{\n  "mode": "...", \n}'} />
          </Form.Item>

          <Form.Item name="is_active" label={t('common.status')} valuePropName="checked">
            <Switch />
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

    </>
  );
};

export default ForwardRules;
