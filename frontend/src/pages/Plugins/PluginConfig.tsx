import React, { useState, useEffect } from 'react';
import { Typography, Switch, Button, message, Checkbox, Divider, Spin, Tag, Tabs, Input, Form, Space, Alert } from 'antd';
import { ArrowLeftOutlined, SaveOutlined, PictureOutlined, AppstoreOutlined, CloudServerOutlined, ApiOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import request from '../../utils/request';
import type { Plugin } from '../../types';

const { Title, Text } = Typography;

interface UserLevel {
  id: number;
  group_key: string;
  name: string;
  description?: string;
  discount?: number;
}

interface StorageConfig {
  tos_access_key: string;
  tos_secret_key_masked: string;
  tos_endpoint: string;
  tos_region: string;
  tos_bucket: string;
  tos_path_prefix: string;
  tos_custom_domain: string;
  is_configured: boolean;
}

const pluginIcons: Record<string, React.ReactNode> = {
  asset_manager: <PictureOutlined style={{ fontSize: 20 }} />,
};

const PluginConfig: React.FC = () => {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const [plugin, setPlugin] = useState<Plugin | null>(null);
  const [levels, setLevels] = useState<UserLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isAllLevels, setIsAllLevels] = useState(true);
  const [selectedLevels, setSelectedLevels] = useState<string[]>([]);

  // 存储配置
  const [storageConfig, setStorageConfig] = useState<StorageConfig | null>(null);
  const [storageForm] = Form.useForm();
  const [savingStorage, setSavingStorage] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    fetchData();
  }, [name]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [pluginRes, levelRes, storageRes] = await Promise.all([
        request.get('/plugins') as any,
        request.get('/user_levels') as any,
        request.get(`/plugins/${name}/storage-config`) as any,
      ]);

      const found = pluginRes.plugins?.find((p: Plugin) => p.name === name);
      if (found) {
        setPlugin(found);
        if (found.allowed_levels === 'all') {
          setIsAllLevels(true);
          setSelectedLevels([]);
        } else {
          setIsAllLevels(false);
          setSelectedLevels(found.allowed_levels.split(',').filter(Boolean));
        }
      }

      if (Array.isArray(levelRes)) setLevels(levelRes);
      else if (levelRes.data) setLevels(levelRes.data);
      else if (levelRes.levels) setLevels(levelRes.levels);

      if (storageRes) {
        setStorageConfig(storageRes);
        storageForm.setFieldsValue({
          tos_access_key: storageRes.tos_access_key || '',
          tos_secret_key: '',
          tos_endpoint: storageRes.tos_endpoint || '',
          tos_region: storageRes.tos_region || '',
          tos_bucket: storageRes.tos_bucket || '',
          tos_path_prefix: storageRes.tos_path_prefix || '',
          tos_custom_domain: storageRes.tos_custom_domain || '',
        });
      }
    } catch (error) {
      message.error('加载插件信息失败');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (checked: boolean) => {
    if (!plugin) return;
    try {
      await request.post(`/plugins/${plugin.name}/toggle`, { is_enabled: checked ? 1 : 0 });
      message.success(checked ? '插件已开启' : '插件已关闭');
      fetchData();
    } catch (error) {
      message.error('操作失败');
    }
  };

  const handleSaveBasic = async () => {
    if (!plugin) return;
    const allowed = isAllLevels ? 'all' : selectedLevels.join(',');
    if (!isAllLevels && selectedLevels.length === 0) {
      message.warning('请至少选择一个用户等级');
      return;
    }
    try {
      setSaving(true);
      await request.post(`/plugins/${plugin.name}/config`, { allowed_levels: allowed });
      message.success('配置已保存');
      fetchData();
    } catch (error) {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveStorage = async () => {
    try {
      const values = await storageForm.validateFields();
      setSavingStorage(true);
      await request.post(`/plugins/${name}/storage-config`, values);
      message.success('存储配置已保存');
      setTestResult(null);
      fetchData();
    } catch (error: any) {
      if (error?.errorFields) return; // form validation
      message.error('保存失败');
    } finally {
      setSavingStorage(false);
    }
  };

  const handleTestConnection = async () => {
    try {
      setTesting(true);
      setTestResult(null);
      const res = await request.post(`/plugins/${name}/test-connection`, {}) as any;
      setTestResult(res);
    } catch (error: any) {
      setTestResult({ success: false, message: error?.response?.data?.error?.message || '测试失败' });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>;
  }

  if (!plugin) {
    return <div style={{ textAlign: 'center', padding: 80 }}><Text type="secondary">插件不存在</Text></div>;
  }

  const isEnabled = plugin.is_enabled === 1;

  // ====== 基本配置 Tab ======
  const basicTab = (
    <div>
      {/* 启用状态 */}
      <div style={{
        background: '#141414', borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.08)',
        padding: '16px 20px', marginBottom: 16,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <Text strong style={{ color: '#fff', fontSize: 14 }}>启用状态</Text><br />
          <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>开启后，符合等级要求的用户将在菜单中看到此功能</Text>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Tag color={isEnabled ? 'success' : 'default'} style={{ margin: 0 }}>{isEnabled ? '运行中' : '已停用'}</Tag>
          <Switch checked={isEnabled} onChange={handleToggle} />
        </div>
      </div>

      {/* 用户等级 */}
      <div style={{
        background: '#141414', borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.08)', padding: '20px', marginBottom: 16,
      }}>
        <Text strong style={{ color: '#fff', fontSize: 14 }}>开放用户等级</Text><br />
        <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>设置哪些用户等级可以使用此插件功能</Text>
        <Divider style={{ borderColor: 'rgba(255,255,255,0.06)', margin: '14px 0' }} />

        <div
          style={{ padding: '12px 16px', borderRadius: 6, border: isAllLevels ? '1px solid rgba(22,119,255,0.4)' : '1px solid rgba(255,255,255,0.08)', background: isAllLevels ? 'rgba(22,119,255,0.06)' : 'transparent', cursor: 'pointer', marginBottom: 8, transition: 'all 0.15s' }}
          onClick={() => { setIsAllLevels(true); setSelectedLevels([]); }}
        >
          <Checkbox checked={isAllLevels}><Text style={{ color: '#fff', fontSize: 13 }}>对所有用户等级开放</Text></Checkbox>
          <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, display: 'block', marginLeft: 24, marginTop: 2 }}>包含当前及以后新增的所有用户等级</Text>
        </div>
        <div
          style={{ padding: '12px 16px', borderRadius: 6, border: !isAllLevels ? '1px solid rgba(22,119,255,0.4)' : '1px solid rgba(255,255,255,0.08)', background: !isAllLevels ? 'rgba(22,119,255,0.06)' : 'transparent', cursor: 'pointer', transition: 'all 0.15s' }}
          onClick={() => setIsAllLevels(false)}
        >
          <Checkbox checked={!isAllLevels}><Text style={{ color: '#fff', fontSize: 13 }}>仅对指定用户等级开放</Text></Checkbox>
        </div>

        {!isAllLevels && (
          <div style={{ marginTop: 14 }}>
            <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, display: 'block', marginBottom: 10 }}>已选择 {selectedLevels.length} 个等级</Text>
            {levels.map(lv => {
              const isSelected = selectedLevels.includes(lv.group_key);
              return (
                <div key={lv.group_key} onClick={() => setSelectedLevels(prev => prev.includes(lv.group_key) ? prev.filter(k => k !== lv.group_key) : [...prev, lv.group_key])}
                  style={{ padding: '10px 14px', borderRadius: 6, border: isSelected ? '1px solid rgba(22,119,255,0.3)' : '1px solid rgba(255,255,255,0.06)', background: isSelected ? 'rgba(22,119,255,0.04)' : 'transparent', cursor: 'pointer', marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'all 0.15s' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Checkbox checked={isSelected} />
                    <Text style={{ color: '#fff', fontSize: 13 }}>{lv.name}</Text>
                    <Tag style={{ margin: 0, fontSize: 11, borderRadius: 4, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.45)' }}>{lv.group_key}</Tag>
                  </div>
                  {lv.discount !== undefined && lv.discount !== 1 && (
                    <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>{(lv.discount * 100).toFixed(0)}%</Text>
                  )}
                </div>
              );
            })}
            {levels.length === 0 && <Text style={{ color: 'rgba(255,255,255,0.25)', display: 'block', textAlign: 'center', padding: 16, fontSize: 13 }}>暂无用户等级，请先在「用户管理 → 用户等级」中创建</Text>}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSaveBasic}>保存配置</Button>
      </div>
    </div>
  );

  // ====== 存储配置 Tab ======
  const inputStyle = { background: '#1f1f1f', borderColor: 'rgba(255,255,255,0.1)' };
  const storageTab = (
    <div>
      {/* 状态提示 */}
      {storageConfig && (
        <div style={{ marginBottom: 16 }}>
          {storageConfig.is_configured ? (
            <Alert
              type="success"
              showIcon
              icon={<CheckCircleOutlined />}
              message="对象存储已配置"
              description={`当前 Bucket: ${storageConfig.tos_bucket}，Endpoint: ${storageConfig.tos_endpoint}`}
              style={{ background: 'rgba(82,196,26,0.06)', border: '1px solid rgba(82,196,26,0.2)' }}
            />
          ) : (
            <Alert
              type="warning"
              showIcon
              message="对象存储未配置"
              description="用户上传素材功能需要先完成火山引擎 TOS 对象存储配置"
              style={{ background: 'rgba(250,173,20,0.06)', border: '1px solid rgba(250,173,20,0.2)' }}
            />
          )}
        </div>
      )}

      <div style={{
        background: '#141414', borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.08)', padding: '20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <CloudServerOutlined style={{ color: '#1677ff', fontSize: 16 }} />
          <Text strong style={{ color: '#fff', fontSize: 14 }}>火山引擎 TOS 对象存储</Text>
        </div>

        <Form form={storageForm} layout="vertical" requiredMark={false}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item label={<Text style={{ color: 'rgba(255,255,255,0.65)' }}>Access Key</Text>} name="tos_access_key" rules={[{ required: true, message: '请输入 Access Key' }]}>
              <Input placeholder="火山引擎 Access Key" style={inputStyle} />
            </Form.Item>
            <Form.Item
              label={<Text style={{ color: 'rgba(255,255,255,0.65)' }}>Secret Key</Text>}
              name="tos_secret_key"
              extra={storageConfig?.tos_secret_key_masked ? <Text style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11 }}>当前: {storageConfig.tos_secret_key_masked}（留空则不修改）</Text> : undefined}
            >
              <Input.Password placeholder="火山引擎 Secret Key" style={inputStyle} />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item label={<Text style={{ color: 'rgba(255,255,255,0.65)' }}>Endpoint</Text>} name="tos_endpoint" rules={[{ required: true, message: '请输入 Endpoint' }]}>
              <Input placeholder="如 https://tos-cn-beijing.volces.com" style={inputStyle} />
            </Form.Item>
            <Form.Item label={<Text style={{ color: 'rgba(255,255,255,0.65)' }}>Region</Text>} name="tos_region" rules={[{ required: true, message: '请输入 Region' }]}>
              <Input placeholder="如 cn-beijing" style={inputStyle} />
            </Form.Item>
          </div>

          <Form.Item label={<Text style={{ color: 'rgba(255,255,255,0.65)' }}>Bucket</Text>} name="tos_bucket" rules={[{ required: true, message: '请输入 Bucket 名称' }]}>
            <Input placeholder="对象存储桶名称" style={inputStyle} />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item label={<Text style={{ color: 'rgba(255,255,255,0.65)' }}>路径前缀</Text>} name="tos_path_prefix" extra={<Text style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11 }}>选填，如 assets/upload</Text>}>
              <Input placeholder="如 assets/" style={inputStyle} />
            </Form.Item>
            <Form.Item label={<Text style={{ color: 'rgba(255,255,255,0.65)' }}>自定义域名</Text>} name="tos_custom_domain" extra={<Text style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11 }}>选填，CDN 加速域名</Text>}>
              <Input placeholder="如 https://cdn.example.com" style={inputStyle} />
            </Form.Item>
          </div>
        </Form>

        {/* 测试结果 */}
        {testResult && (
          <div style={{ marginBottom: 16 }}>
            <Alert
              type={testResult.success ? 'success' : 'error'}
              showIcon
              message={testResult.success ? '连接成功' : '连接失败'}
              description={testResult.message}
              style={{ background: testResult.success ? 'rgba(82,196,26,0.06)' : 'rgba(255,77,79,0.06)', border: `1px solid ${testResult.success ? 'rgba(82,196,26,0.2)' : 'rgba(255,77,79,0.2)'}` }}
            />
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Button icon={<ApiOutlined />} loading={testing} onClick={handleTestConnection}>测试连接</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={savingStorage} onClick={handleSaveStorage}>保存存储配置</Button>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth: 720 }}>
      {/* 页头 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 20, paddingBottom: 16,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/admin0755/plugins')} style={{ color: 'rgba(255,255,255,0.65)', padding: '4px 8px' }} />
          <div style={{
            width: 36, height: 36, borderRadius: 8, background: 'rgba(22,119,255,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1677ff',
          }}>
            {pluginIcons[plugin.name] || <AppstoreOutlined style={{ fontSize: 20 }} />}
          </div>
          <div>
            <Title level={4} style={{ margin: 0, color: '#fff', lineHeight: 1.3 }}>{plugin.title}</Title>
            <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>{plugin.name}</Text>
          </div>
        </div>
      </div>

      {/* 描述 */}
      <div style={{ background: '#141414', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', padding: '14px 20px', marginBottom: 20 }}>
        <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>{plugin.description || '暂无描述'}</Text>
      </div>

      {/* Tabs */}
      <Tabs
        defaultActiveKey="basic"
        items={[
          { key: 'basic', label: '基本配置', children: basicTab },
          { key: 'storage', label: '存储配置', children: storageTab },
        ]}
      />
    </div>
  );
};

export default PluginConfig;
