import React, { useState, useEffect } from 'react';
import { Typography, Table, Form, Input, Button, Select, Space, Card, Tag, Badge, Tooltip, Modal, Radio, message, Divider, Switch, Popconfirm, DatePicker } from 'antd';
import { CopyOutlined, ReloadOutlined, SettingOutlined, EyeOutlined, CheckCircleOutlined, CloseCircleOutlined, InfoCircleOutlined, RocketOutlined, PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons';
import request from '../../../utils/request';
import { useThemeStore } from '../../../store/theme';
import JsonView from '@uiw/react-json-view';
import { darkTheme } from '@uiw/react-json-view/dark';
import { lightTheme } from '@uiw/react-json-view/light';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
dayjs.extend(utc);

const { RangePicker } = DatePicker;

const { Title, Text, Paragraph } = Typography;

interface ConfigType {
  id: number;
  custom_model_name: string;
  custom_model_id: string;
  t2v_model: string;
  i2v_model: string;
  r2v_model: string;
  edit_model: string;
  routing_node: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

interface SimpleModel {
  mid: string;
  name: string;
  model_id: string;
}

interface LogType {
  id: number;
  user_uid: string;
  user_nickname: string | null;
  original_model: string;
  media_type: string;
  matched_model: string;
  status: number;
  latency_ms: number;
  error_message: string | null;
  task_id: string | null;
  log_id: number | null;
  created_at: string;
  // 关联主日志表字段（LEFT JOIN 获取）
  log_request_content: string | null;
  log_upstream_req_content: string | null;
  log_response_content: string | null;
  log_billing_detail: string | null;
  log_billing_pid: string | null;
  log_forward_eid: string | null;
}

interface HappyHorseManagerProps {
  mode?: 'logs' | 'config';
}

const HappyHorseManager: React.FC<HappyHorseManagerProps> = ({ mode }) => {
  const { themeMode } = useThemeStore();
  const isDark = themeMode === 'dark';

  const [activeTab, setActiveTab] = useState<'logs' | 'config'>(mode || 'logs');

  useEffect(() => {
    if (mode) {
      setActiveTab(mode);
    }
  }, [mode]);

  // Logs States
  const [logs, setLogs] = useState<LogType[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(15);
  const [loadingLogs, setLoadingLogs] = useState<boolean>(false);
  const [filterStatus, setFilterStatus] = useState<number | undefined>(undefined);
  const [filterUserUid, setFilterUserUid] = useState<string>('');
  const [filterOriginalModel, setFilterOriginalModel] = useState<string>('');
  const [filterDateRange, setFilterDateRange] = useState<[any, any] | null>(null);
  const [inspectLog, setInspectLog] = useState<LogType | null>(null);

  const searchTimerRef = React.useRef<any>(null);

  const triggerDebouncedSearch = (uid: string, origModel: string, status = filterStatus, dateRange = filterDateRange) => {
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }
    searchTimerRef.current = setTimeout(() => {
      setPage(1);
      loadLogs(1, pageSize, status, uid, origModel, dateRange);
    }, 500); // 500ms 防抖
  };

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, []);

  // Config States
  const [configs, setConfigs] = useState<ConfigType[]>([]);
  const [loadingConfigs, setLoadingConfigs] = useState<boolean>(false);
  const [availableModels, setAvailableModels] = useState<SimpleModel[]>([]);
  
  // Modal States
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [editingConfig, setEditingConfig] = useState<ConfigType | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [form] = Form.useForm();

  // Watch model values for dynamic option injection
  const t2vValue = Form.useWatch('t2v_model', form);
  const i2vValue = Form.useWatch('i2v_model', form);
  const r2vValue = Form.useWatch('r2v_model', form);
  const editValue = Form.useWatch('edit_model', form);

  const getSelectOptions = (currentVal: string) => {
    const list = [...availableModels];
    // 兼容：当前值（mid）不在列表中时追加占位项（模型可能已删除/禁用）
    if (currentVal && !list.some(m => m.mid === currentVal)) {
      list.unshift({
        mid: currentVal,
        name: currentVal,
        model_id: currentVal,
      });
    }
    return list;
  };
  // 按 mid 查找模型信息（配置列表展示用）
  const resolveModelName = (mid: string) => {
    const m = availableModels.find(m => m.mid === mid);
    return m ? `${m.name} (${m.model_id})` : mid;
  };

  // Load configurations list
  const loadConfigsList = async () => {
    setLoadingConfigs(true);
    try {
      const res = await request.get('/plugins/happyhorse_router/configs');
      const data = res.data || res;
      if (data) {
        setConfigs(data.configs || []);
        setAvailableModels(data.available_models || []);
      }
    } catch (e: any) {
      message.error('加载路由配置失败: ' + (e.message || e));
    } finally {
      setLoadingConfigs(false);
    }
  };

  // Save config (create/edit)
  const handleSaveConfig = async (values: any) => {
    setSaving(true);
    try {
      if (editingConfig) {
        // Edit
        const payload = {
          ...values,
          is_active: editingConfig.is_active,
        };
        await request.put(`/plugins/happyhorse_router/configs/${editingConfig.id}`, payload);
        message.success('配置已成功更新！');
      } else {
        // Create
        await request.post('/plugins/happyhorse_router/configs', values);
        message.success('配置已成功创建！');
      }
      setModalOpen(false);
      loadConfigsList();
    } catch (e: any) {
      message.error('保存配置失败: ' + (e.message || e));
    } finally {
      setSaving(false);
    }
  };

  // Toggle dynamic active status
  const handleToggleActive = async (record: ConfigType, checked: boolean) => {
    try {
      const payload = {
        custom_model_name: record.custom_model_name,
        custom_model_id: record.custom_model_id,
        t2v_model: record.t2v_model,
        i2v_model: record.i2v_model,
        r2v_model: record.r2v_model,
        edit_model: record.edit_model,
        is_active: checked ? 1 : 0,
      };
      await request.put(`/plugins/happyhorse_router/configs/${record.id}`, payload);
      message.success(`${checked ? '已开启' : '已关闭'}该路由配置`);
      setConfigs(prev => prev.map(c => c.id === record.id ? { ...c, is_active: checked ? 1 : 0 } : c));
    } catch (e: any) {
      message.error('更改启用状态失败: ' + (e.message || e));
    }
  };

  // Delete config
  const handleDelete = async (id: number) => {
    try {
      await request.delete(`/plugins/happyhorse_router/configs/${id}`);
      message.success('配置已成功删除！');
      loadConfigsList();
    } catch (e: any) {
      message.error('删除配置失败: ' + (e.message || e));
    }
  };

  // Load logs
  const loadLogs = async (p = page, ps = pageSize, status = filterStatus, uid = filterUserUid, origModel = filterOriginalModel, dateRange = filterDateRange) => {
    setLoadingLogs(true);
    try {
      const params: any = {
        page: p,
        page_size: ps,
      };
      if (status !== undefined) {
        params.status = status;
      }
      if (uid?.trim()) {
        params.user_uid = uid.trim();
      }
      if (origModel?.trim()) {
        params.original_model = origModel.trim();
      }
      if (dateRange?.[0]) {
        params.start_date = dateRange[0].startOf('day').toISOString();
      }
      if (dateRange?.[1]) {
        params.end_date = dateRange[1].endOf('day').toISOString();
      }
      const res = await request.get('/plugins/happyhorse_router/logs', { params });
      const data = res.data || res;
      if (data) {
        setLogs(data.logs || []);
        setTotal(data.total || 0);
      }
    } catch (e: any) {
      message.error('加载转换日志失败: ' + (e.message || e));
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    loadConfigsList();
    loadLogs(1, 15);
  }, []);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    message.success('已复制到剪贴板！');
  };

  const logsColumns = [
    {
      title: '时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 170,
      render: (text: string) => <Text style={{ fontSize: 12 }}>{dayjs.utc(text).local().format('YYYY-MM-DD HH:mm:ss')}</Text>,
    },
    {
      title: '用户',
      key: 'user',
      width: 140,
      render: (_: any, record: LogType) => (
        <Space direction="vertical" size={0}>
          <Text style={{ fontSize: 13 }}>{record.user_nickname || record.user_uid || '-'}</Text>
          {record.user_nickname && record.user_uid && (
            <Text type="secondary" style={{ fontSize: 10, fontFamily: 'monospace' }}>UID: {record.user_uid}</Text>
          )}
        </Space>
      ),
    },
    {
      title: '原始模型',
      dataIndex: 'original_model',
      key: 'original_model',
      ellipsis: true,
      render: (text: string) => <Text style={{ fontSize: 13, fontFamily: 'monospace' }}>{text}</Text>,
    },
    {
      title: '媒体类型',
      dataIndex: 'media_type',
      key: 'media_type',
      width: 120,
      render: (text: string) => {
        return <Tag color="default" style={{ borderRadius: 4, fontWeight: 'medium' }}>{text}</Tag>;
      },
    },
    {
      title: '匹配上游模型',
      dataIndex: 'matched_model',
      key: 'matched_model',
      render: (text: string, record: LogType) => (
        <Tooltip title={`小马映射: ${record.original_model} → ${text}`}>
          <Text style={{ fontSize: 13, fontFamily: 'monospace' }}>{text}</Text>
        </Tooltip>
      ),
    },
    {
      title: '路由提交状态',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (val: number) => {
        if (val === 200) {
          return <Badge status="success" text={<Tag color="success" style={{ border: 'none', margin: 0 }}>成功</Tag>} />;
        }
        return <Badge status="error" text={<Tag color="error" style={{ border: 'none', margin: 0 }}>失败 ({val})</Tag>} />;
      },
    },
    {
      title: '延迟 (s)',
      dataIndex: 'latency_ms',
      key: 'latency_ms',
      width: 110,
      render: (val: number) => {
        const seconds = (val / 1000).toFixed(2);
        return <Text strong style={{ color: val > 2000 ? '#fa8c16' : '#52c41a' }}>{seconds} s</Text>;
      },
    },
    {
      title: '任务 ID (Task ID)',
      dataIndex: 'task_id',
      key: 'task_id',
      ellipsis: true,
      render: (text: string | null) => {
        if (!text) return <Text type="secondary">-</Text>;
        return (
          <Tooltip title="点击复制 Task ID">
            <Text
              style={{ fontSize: 12, cursor: 'pointer', fontFamily: 'monospace', textDecoration: 'underline' }}
              onClick={() => handleCopy(text)}
            >
              {text}
            </Text>
          </Tooltip>
        );
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_: any, record: LogType) => (
        <Button
          type="text"
          icon={<EyeOutlined />}
          onClick={() => setInspectLog(record)}
          size="small"
        />
      ),
    },
  ];

  const configColumns = [
    {
      title: '用户请求模型',
      key: 'custom_model',
      render: (_: any, record: ConfigType) => (
        <Space direction="vertical" size={1}>
          <Text strong style={{ fontSize: 14 }}>{record.custom_model_name}</Text>
          <Text type="secondary" style={{ fontSize: 12, fontFamily: 'monospace' }}>ID: {record.custom_model_id}</Text>
        </Space>
      ),
    },
    {
      title: '系统节点 ID',
      dataIndex: 'routing_node',
      key: 'routing_node',
      render: (text: string) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Tag color="default" style={{ fontFamily: 'monospace', fontSize: 13, padding: '4px 8px', borderRadius: 4 }}>
            {text}
          </Tag>
          <Tooltip title="系统自动生成，用于渠道内部匹配（非 API 请求用）">
            <Tag color="default" style={{ fontFamily: 'monospace', fontSize: 10, padding: '2px 6px', borderRadius: 4, cursor: 'help', background: 'transparent', border: '1px dashed rgba(128,128,128,0.3)', color: 'rgba(128,128,128,0.6)' }}>?</Tag>
          </Tooltip>
          <Tooltip title="复制节点 ID">
            <Button
              type="text"
              icon={<CopyOutlined />}
              size="small"
              onClick={() => handleCopy(text)}
            />
          </Tooltip>
        </div>
      ),
    },
    {
      title: '子模型映射关联',
      key: 'mappings',
      render: (_: any, record: ConfigType) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div>
            <Text type="secondary" style={{ fontSize: 11 }}>文生视频: </Text>
            <Tag color="default" style={{ fontSize: 11 }}>{record.t2v_model ? resolveModelName(record.t2v_model) : '未绑定'}</Tag>
          </div>
          <div>
            <Text type="secondary" style={{ fontSize: 11 }}>图生视频: </Text>
            <Tag color="default" style={{ fontSize: 11 }}>{record.i2v_model ? resolveModelName(record.i2v_model) : '未绑定'}</Tag>
          </div>
          <div>
            <Text type="secondary" style={{ fontSize: 11 }}>参考视频: </Text>
            <Tag color="default" style={{ fontSize: 11 }}>{record.r2v_model ? resolveModelName(record.r2v_model) : '未绑定'}</Tag>
          </div>
          <div>
            <Text type="secondary" style={{ fontSize: 11 }}>视频编辑: </Text>
            <Tag color="default" style={{ fontSize: 11 }}>{record.edit_model ? resolveModelName(record.edit_model) : '未绑定'}</Tag>
          </div>
        </div>
      ),
    },
    {
      title: '状态',
      key: 'status',
      width: 100,
      render: (_: any, record: ConfigType) => (
        <Switch
          checked={record.is_active === 1}
          onChange={(checked) => handleToggleActive(record, checked)}
          checkedChildren="启用"
          unCheckedChildren="禁用"
        />
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_: any, record: ConfigType) => (
        <Space size="small">
          <Button
            type="text"
            icon={<EditOutlined />}
            onClick={() => {
              setEditingConfig(record);
              form.setFieldsValue(record);
              setModalOpen(true);
            }}
            size="small"
          >
            编辑
          </Button>
          <Popconfirm
            title="确定要删除该智能路由配置吗？"
            description="删除后，以此节点配置的渠道将无法路由分发。"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              size="small"
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '0 8px' }}>
      {!mode && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <Title level={4} style={{ margin: 0 }}>快乐小马智能路由</Title>
            <Text type="secondary" style={{ fontSize: 13 }}>
              支持创建多个智能推理节点版本。自动根据用户请求参数判定类型，将请求分发至文生视频/图生视频/参考生视频/视频编辑等对应的真实模型。
            </Text>
          </div>
          <Radio.Group value={activeTab} onChange={(e) => setActiveTab(e.target.value)} buttonStyle="solid">
            <Radio.Button value="logs"><ReloadOutlined style={{ marginRight: 6 }} />日志分析</Radio.Button>
            <Radio.Button value="config"><SettingOutlined style={{ marginRight: 6 }} />路由配置</Radio.Button>
          </Radio.Group>
        </div>
      )}

      {activeTab === 'logs' ? (
        <Card
          bordered={false}
          style={{
            background: isDark ? '#141414' : '#fff',
            borderRadius: 12,
            boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
          }}
        >
          <div style={{ marginBottom: 16 }}>
            <Space wrap size={[8, 8]}>
              <Input
                placeholder="搜索用户 UID"
                prefix={<SearchOutlined />}
                value={filterUserUid}
                onChange={e => {
                  const val = e.target.value;
                  setFilterUserUid(val);
                  triggerDebouncedSearch(val, filterOriginalModel);
                }}
                onPressEnter={() => { setPage(1); loadLogs(1, pageSize, filterStatus, filterUserUid, filterOriginalModel, filterDateRange); }}
                style={{ width: 160 }}
                allowClear
              />
              <Input
                placeholder="原始模型 ID"
                prefix={<SearchOutlined />}
                value={filterOriginalModel}
                onChange={e => {
                  const val = e.target.value;
                  setFilterOriginalModel(val);
                  triggerDebouncedSearch(filterUserUid, val);
                }}
                onPressEnter={() => { setPage(1); loadLogs(1, pageSize, filterStatus, filterUserUid, filterOriginalModel, filterDateRange); }}
                style={{ width: 180 }}
                allowClear
              />
              <Select
                placeholder="全部提交状态"
                style={{ width: 140 }}
                allowClear
                value={filterStatus}
                onChange={(val) => {
                  setFilterStatus(val);
                  setPage(1);
                  loadLogs(1, pageSize, val, filterUserUid, filterOriginalModel, filterDateRange);
                }}
              >
                <Select.Option value={200}>成功</Select.Option>
                <Select.Option value={400}>失败</Select.Option>
              </Select>
              <RangePicker
                value={filterDateRange}
                onChange={(vals) => {
                  setFilterDateRange(vals as [any, any] | null);
                  setPage(1);
                  loadLogs(1, pageSize, filterStatus, filterUserUid, filterOriginalModel, vals as [any, any] | null);
                }}
              />
              <Button
                icon={<ReloadOutlined />}
                onClick={() => {
                  setPage(1);
                  loadLogs(1, pageSize, filterStatus, filterUserUid, filterOriginalModel, filterDateRange);
                }}
              >
                刷新日志
              </Button>
              <Text type="secondary">共 {total} 条记录</Text>
            </Space>
          </div>

          <Table
            dataSource={logs}
            columns={logsColumns}
            rowKey="id"
            loading={loadingLogs}
            pagination={{
              current: page,
              pageSize: pageSize,
              total: total,
              showSizeChanger: true,
              pageSizeOptions: ['10', '15', '30', '50'],
              onChange: (p, ps) => {
                setPage(p);
                setPageSize(ps);
                loadLogs(p, ps);
              },
            }}
            style={{ fontSize: 13 }}
          />
        </Card>
      ) : (
        <div>
          <Card
            bordered={false}
            style={{
              background: isDark ? '#141414' : '#fff',
              borderRadius: 12,
              boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <Title level={5} style={{ margin: 0 }}>多版本智能推理节点管理</Title>
                <Text type="secondary" style={{ fontSize: 13 }}>
                  管理员在此处添加多个配置后，每个配置会独立生成一个以 <Text code>ephh-</Text> 开头的唯一智能路由节点 ID。您可以在“模型渠道分组”关联并进行范围分配。
                </Text>
              </div>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  setEditingConfig(null);
                  form.resetFields();
                  setModalOpen(true);
                }}
              >
                添加路由配置
              </Button>
            </div>

            <Table
              dataSource={configs}
              columns={configColumns}
              rowKey="id"
              loading={loadingConfigs}
              pagination={false}
              style={{ fontSize: 13 }}
            />
          </Card>
        </div>
      )}

      {/* Add / Edit Modal */}
      <Modal
        title={editingConfig ? '编辑路由配置' : '添加智能路由配置'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={720}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSaveConfig}
          style={{ marginTop: 12 }}
        >
          <Form.Item
            name="version"
            label={<Text strong>选择预设版本</Text>}
            extra="自动加载推荐的模型预设"
          >
            <Select
              placeholder="请选择预设版本"
              size="large"
              allowClear
              style={{ width: '100%' }}
              onChange={(val) => {
                if (val === '1.0') {
                  // 预设 model_id → 查找对应 mid（配置存 mid）
                  const findMid = (modelId: string) => availableModels.find(m => m.model_id === modelId)?.mid || modelId;
                  form.setFieldsValue({
                    custom_model_name: form.getFieldValue('custom_model_name') || '快乐小马智能视频 v1.0',
                    custom_model_id: form.getFieldValue('custom_model_id') || 'happyhorse-1.0',
                    t2v_model: findMid('happyhorse-1.0-t2v'),
                    i2v_model: findMid('happyhorse-1.0-i2v'),
                    r2v_model: findMid('happyhorse-1.0-r2v'),
                    edit_model: findMid('happyhorse-1.0-video-edit'),
                  });
                }
              }}
            >
              <Select.Option value="1.0">1.0 版本</Select.Option>
            </Select>
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '20px' }}>
            <Form.Item
              name="custom_model_name"
              label={<Text strong>自定义模型名称</Text>}
              rules={[{ required: true, message: '请输入自定义模型名称' }]}
            >
              <Input placeholder="例如：快乐小马智能视频 v1" size="large" />
            </Form.Item>

            <Form.Item
              name="custom_model_id"
              label={<Text strong>用户请求模型 ID</Text>}
              extra="用户 API 请求中 model 参数的值"
              rules={[{ required: true, message: '请输入自定义模型 ID' }]}
            >
              <Input placeholder="例如：happyhorse-1.0" size="large" />
            </Form.Item>
          </div>

          <Divider style={{ margin: '12px 0 24px 0' }} />
          <Title level={5} style={{ marginBottom: 16 }}>🎯 上游实际分发模型映射关联</Title>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '20px' }}>
            <Form.Item
              name="t2v_model"
              label={<Text strong>1. 文生视频 (Text-to-Video)</Text>}
              extra="当请求中没有输入媒体素材时使用此模型分发"
              rules={[{ required: true, message: '请选择文生视频模型' }]}
            >
              <Select placeholder="请选择系统注册模型" size="large" showSearch optionFilterProp="label" style={{ width: '100%' }}>
                {getSelectOptions(t2vValue).map(m => (
                  <Select.Option key={m.mid} value={m.mid} label={`${m.name} (${m.model_id})`}>
                    {m.name} <Text type="secondary" style={{ fontSize: 12 }}>({m.model_id})</Text>
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item
              name="i2v_model"
              label={<Text strong>2. 图生视频 (Image-to-Video)</Text>}
              extra="当请求中包含首帧图 first_frame 或 image 参数时"
              rules={[{ required: true, message: '请选择图生视频模型' }]}
            >
              <Select placeholder="请选择系统注册模型" size="large" showSearch optionFilterProp="label" style={{ width: '100%' }}>
                {getSelectOptions(i2vValue).map(m => (
                  <Select.Option key={m.mid} value={m.mid} label={`${m.name} (${m.model_id})`}>
                    {m.name} <Text type="secondary" style={{ fontSize: 12 }}>({m.model_id})</Text>
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item
              name="r2v_model"
              label={<Text strong>3. 参考生视频 (Reference-to-Video)</Text>}
              extra="当请求中包含 reference_image 描述时"
              rules={[{ required: true, message: '请选择参考生视频模型' }]}
            >
              <Select placeholder="请选择系统注册模型" size="large" showSearch optionFilterProp="label" style={{ width: '100%' }}>
                {getSelectOptions(r2vValue).map(m => (
                  <Select.Option key={m.mid} value={m.mid} label={`${m.name} (${m.model_id})`}>
                    {m.name} <Text type="secondary" style={{ fontSize: 12 }}>({m.model_id})</Text>
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item
              name="edit_model"
              label={<Text strong>4. 视频编辑 (Video Edit)</Text>}
              extra="当请求中输入参数包含 video 字段时"
              rules={[{ required: true, message: '请选择视频编辑模型' }]}
            >
              <Select placeholder="请选择系统注册模型" size="large" showSearch optionFilterProp="label" style={{ width: '100%' }}>
                {getSelectOptions(editValue).map(m => (
                  <Select.Option key={m.mid} value={m.mid} label={`${m.name} (${m.model_id})`}>
                    {m.name} <Text type="secondary" style={{ fontSize: 12 }}>({m.model_id})</Text>
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          </div>

          <div style={{ marginTop: 24, textAlign: 'right' }}>
            <Button onClick={() => setModalOpen(false)} style={{ marginRight: 8 }} size="large">
              取消
            </Button>
            <Button type="primary" htmlType="submit" size="large" loading={saving}>
              保存配置
            </Button>
          </div>
        </Form>
      </Modal>

      <Modal
        title="小马转换日志详情"
        open={inspectLog !== null}
        onCancel={() => setInspectLog(null)}
        footer={null}
        width={800}
      >
        {inspectLog && (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <Text type="secondary">原始请求模型: </Text>
                <Text strong>{inspectLog.original_model}</Text>
              </div>
              <div>
                <Text type="secondary">匹配调度上游: </Text>
                <Text strong>{inspectLog.matched_model}</Text>
              </div>
              <div>
                <Text type="secondary">媒体分析类型: </Text>
                <Tag color="default">{inspectLog.media_type}</Tag>
              </div>
              <div>
                <Text type="secondary">状态耗时: </Text>
                <Tag color={inspectLog.status === 200 ? 'success' : 'error'}>{inspectLog.status === 200 ? '成功' : '失败'}</Tag>
                <Text style={{ marginLeft: 8 }}>{(inspectLog.latency_ms / 1000).toFixed(2)} s</Text>
              </div>
              {inspectLog.log_billing_pid && (
                <div>
                  <Text type="secondary">计费规则 (PID): </Text>
                  <Tag color="blue">{inspectLog.log_billing_pid}</Tag>
                </div>
              )}
              {inspectLog.log_forward_eid && (
                <div>
                  <Text type="secondary">转发规则 (EID): </Text>
                  <Tag color="cyan">{inspectLog.log_forward_eid}</Tag>
                </div>
              )}
              {inspectLog.log_billing_detail && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <Text type="secondary">计费明细: </Text>
                  <Text style={{ fontSize: 12, fontFamily: 'monospace' }}>{inspectLog.log_billing_detail}</Text>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 6, background: isDark ? 'rgba(22,119,255,0.08)' : 'rgba(22,119,255,0.04)', border: '1px solid rgba(22,119,255,0.15)' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>小马映射:</Text>
              <Tag color="default" style={{ fontFamily: 'monospace' }}>{inspectLog.original_model}</Tag>
              <Text type="secondary">→</Text>
              <Tag color="default" style={{ fontFamily: 'monospace' }}>{inspectLog.matched_model}</Tag>
              <Tag color="default">{inspectLog.media_type}</Tag>
              {inspectLog.log_id && <Text type="secondary" style={{ fontSize: 11, marginLeft: 'auto' }}>关联日志 ID: {inspectLog.log_id}</Text>}
            </div>

            {inspectLog.error_message && (
              <div>
                <Text type="danger" strong>异常报错详情: </Text>
                <div
                  style={{
                    background: isDark ? '#2a1215' : '#fff1f0',
                    border: '1px solid #ffa39e',
                    padding: '8px 12px',
                    borderRadius: 4,
                    color: '#cf1322',
                    marginTop: 4,
                  }}
                >
                  {inspectLog.error_message}
                </div>
              </div>
            )}

            {/* 客户端请求参数（关联主日志） */}
            <div>
              <Text strong>客户端请求参数 (Request Body):</Text>
              <div
                style={{
                  border: isDark ? '1px solid #303030' : '1px solid #d9d9d9',
                  borderRadius: 6, padding: 10, marginTop: 6,
                  maxHeight: 250, overflowY: 'auto',
                  background: isDark ? '#1f1f1f' : '#fafafa',
                }}
              >
                {(() => {
                  const content = inspectLog.log_request_content;
                  if (!content) return <Text type="secondary">无</Text>;
                  try { return <JsonView value={JSON.parse(content)} style={isDark ? darkTheme : lightTheme} enableClipboard={true} />; }
                  catch { return <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 12 }}>{content}</pre>; }
                })()}
              </div>
            </div>

            {/* 上游请求参数（关联主日志） */}
            {inspectLog.log_upstream_req_content && (
              <div>
                <Text strong>上游请求参数 (Upstream Request):</Text>
                <div
                  style={{
                    border: isDark ? '1px solid #303030' : '1px solid #d9d9d9',
                    borderRadius: 6, padding: 10, marginTop: 6,
                    maxHeight: 250, overflowY: 'auto',
                    background: isDark ? '#1f1f1f' : '#fafafa',
                  }}
                >
                  {(() => {
                    try { return <JsonView value={JSON.parse(inspectLog.log_upstream_req_content!)} style={isDark ? darkTheme : lightTheme} enableClipboard={true} />; }
                    catch { return <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 12 }}>{inspectLog.log_upstream_req_content}</pre>; }
                  })()}
                </div>
              </div>
            )}

            {/* 响应结果（关联主日志） */}
            {inspectLog.log_response_content && (
              <div>
                <Text strong>响应结果 (Response):</Text>
                <div
                  style={{
                    border: isDark ? '1px solid #303030' : '1px solid #d9d9d9',
                    borderRadius: 6, padding: 10, marginTop: 6,
                    maxHeight: 250, overflowY: 'auto',
                    background: isDark ? '#1f1f1f' : '#fafafa',
                  }}
                >
                  {(() => {
                    try { return <JsonView value={JSON.parse(inspectLog.log_response_content!)} style={isDark ? darkTheme : lightTheme} enableClipboard={true} />; }
                    catch { return <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 12 }}>{inspectLog.log_response_content}</pre>; }
                  })()}
                </div>
              </div>
            )}
          </Space>
        )}
      </Modal>
    </div>
  );
};

export default HappyHorseManager;
