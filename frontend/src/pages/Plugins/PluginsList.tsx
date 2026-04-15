import React, { useState, useEffect } from 'react';
import { Switch, message, Typography, Row, Col, Tag, Button, Space } from 'antd';
import { SettingOutlined, AppstoreOutlined, PictureOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import request from '../../utils/request';
import type { Plugin } from '../../types';

const { Title, Text } = Typography;

const pluginMeta: Record<string, { icon: React.ReactNode; gradient: string }> = {
  asset_manager: {
    icon: <PictureOutlined style={{ fontSize: 28, color: '#fff' }} />,
    gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  },
};

const defaultMeta = {
  icon: <AppstoreOutlined style={{ fontSize: 28, color: '#fff' }} />,
  gradient: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
};

const PluginsList: React.FC = () => {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchPlugins();
  }, []);

  const fetchPlugins = async () => {
    try {
      setLoading(true);
      const res = await (request.get('/plugins') as any);
      if (res.plugins) setPlugins(res.plugins);
    } catch (error: any) {
      console.error(error);
      message.error(error?.response?.data?.error?.message || '获取插件列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (checked: boolean, plugin: Plugin) => {
    try {
      await request.post(`/plugins/${plugin.name}/toggle`, { is_enabled: checked ? 1 : 0 });
      message.success(checked ? '插件已开启' : '插件已关闭');
      fetchPlugins();
    } catch (error) {
      message.error('操作失败');
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Title level={4} style={{ margin: 0, color: '#fff' }}>站点插件</Title>
        <Text type="secondary">管理平台功能模块的启用与配置</Text>
      </div>

      <Row gutter={[20, 20]}>
        {plugins.map((plugin) => {
          const meta = pluginMeta[plugin.name] || defaultMeta;
          const isEnabled = plugin.is_enabled === 1;

          return (
            <Col xs={24} sm={12} lg={8} xl={6} key={plugin.id}>
              <div style={{
                background: '#1a1a2e',
                borderRadius: 16,
                overflow: 'hidden',
                border: '1px solid rgba(255,255,255,0.06)',
                transition: 'all 0.3s ease',
                cursor: 'default',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(102,126,234,0.4)';
                (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
                (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 24px rgba(0,0,0,0.3)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.06)';
                (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
                (e.currentTarget as HTMLElement).style.boxShadow = 'none';
              }}
              >
                {/* 渐变头部 */}
                <div style={{
                  background: meta.gradient,
                  padding: '24px 20px',
                  position: 'relative',
                }}>
                  {/* 状态指示 */}
                  <div style={{ position: 'absolute', top: 12, right: 12 }}>
                    {isEnabled ? (
                      <Tag color="rgba(0,0,0,0.3)" style={{ border: 'none', borderRadius: 12 }}>
                        <CheckCircleOutlined /> 运行中
                      </Tag>
                    ) : (
                      <Tag color="rgba(0,0,0,0.3)" style={{ border: 'none', borderRadius: 12 }}>
                        <CloseCircleOutlined /> 已停用
                      </Tag>
                    )}
                  </div>

                  <div style={{
                    width: 52, height: 52, borderRadius: 14,
                    background: 'rgba(255,255,255,0.15)',
                    backdropFilter: 'blur(10px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: 12,
                  }}>
                    {meta.icon}
                  </div>
                  <Text strong style={{ fontSize: 17, color: '#fff', display: 'block', lineHeight: 1.3 }}>
                    {plugin.title}
                  </Text>
                  <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>
                    {plugin.name}
                  </Text>
                </div>

                {/* 内容区 */}
                <div style={{ padding: '16px 20px' }}>
                  <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, display: 'block', minHeight: 38, lineHeight: '19px' }}>
                    {plugin.description || '暂无描述'}
                  </Text>

                  <div style={{ margin: '12px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>开放等级</Text>
                    {plugin.allowed_levels === 'all' ? (
                      <Tag color="#177ddc" style={{ margin: 0, borderRadius: 4, fontSize: 11 }}>全部用户</Tag>
                    ) : (
                      plugin.allowed_levels.split(',').slice(0, 3).map(lv => (
                        <Tag key={lv} style={{ margin: 0, borderRadius: 4, fontSize: 11, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.65)' }}>{lv}</Tag>
                      ))
                    )}
                  </div>

                  {/* 底部操作 */}
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)',
                  }}>
                    <Space size={8} align="center">
                      <Switch
                        size="small"
                        checked={isEnabled}
                        onChange={(checked) => handleToggle(checked, plugin)}
                      />
                      <Text style={{ color: isEnabled ? '#52c41a' : 'rgba(255,255,255,0.3)', fontSize: 12 }}>
                        {isEnabled ? '已启用' : '已关闭'}
                      </Text>
                    </Space>
                    <Button
                      type="link"
                      size="small"
                      icon={<SettingOutlined />}
                      style={{ color: 'rgba(255,255,255,0.45)', padding: 0 }}
                      onClick={() => navigate(`/admin0755/plugins/${plugin.name}/config`)}
                    >
                      配置
                    </Button>
                  </div>
                </div>
              </div>
            </Col>
          );
        })}
      </Row>
    </div>
  );
};

export default PluginsList;
