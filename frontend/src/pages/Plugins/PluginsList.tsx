import React, { useState, useEffect } from 'react';
import { Switch, message, Typography, Row, Col, Tag, Button, Space, Spin } from 'antd';
import { SettingOutlined, AppstoreOutlined, PictureOutlined, ReloadOutlined, TeamOutlined, ExperimentOutlined, ThunderboltOutlined, CloudServerOutlined, ShopOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import request from '../../utils/request';
import type { Plugin } from '../../types';

const { Title, Text } = Typography;

const pluginIcons: Record<string, React.ReactNode> = {
  asset_manager: <PictureOutlined style={{ fontSize: 22 }} />,
  team_marketing: <TeamOutlined style={{ fontSize: 22 }} />,
  playground: <ExperimentOutlined style={{ fontSize: 22 }} />,
  volcengine_pool: <CloudServerOutlined style={{ fontSize: 22 }} />,
  gptimage_pool: <PictureOutlined style={{ fontSize: 22 }} />,
  model_marketplace: <ShopOutlined style={{ fontSize: 22 }} />,
  site_icons: <AppstoreOutlined style={{ fontSize: 22 }} />,
};

// 系统增强插件使用不同的图标颜色
const pluginColors: Record<string, { bg: string; color: string }> = {
  user: { bg: 'rgba(22,119,255,0.1)', color: '#1677ff' },
  system: { bg: 'rgba(250,140,22,0.12)', color: '#fa8c16' },
};

const categoryLabels: Record<string, { title: string; icon: React.ReactNode }> = {
  user: { title: '用户增强插件', icon: <AppstoreOutlined style={{ marginRight: 6 }} /> },
  system: { title: '系统增强插件', icon: <ThunderboltOutlined style={{ marginRight: 6 }} /> },
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
      message.error('获取插件列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (checked: boolean, plugin: Plugin, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await request.post(`/plugins/${plugin.name}/toggle`, { is_enabled: checked ? 1 : 0 });
      message.success(checked ? '插件已开启' : '插件已关闭');
      fetchPlugins();
    } catch (error) {
      message.error('操作失败');
    }
  };

  // 按 category 分组
  const groupedPlugins: Record<string, Plugin[]> = {};
  plugins.forEach((p) => {
    const cat = p.category || 'user';
    if (!groupedPlugins[cat]) groupedPlugins[cat] = [];
    groupedPlugins[cat].push(p);
  });

  const categoryOrder = ['user', 'system'];

  const renderPluginCard = (plugin: Plugin) => {
    const isEnabled = plugin.is_enabled === 1;
    const cat = plugin.category || 'user';
    const colors = pluginColors[cat] || pluginColors.user;

    return (
      <Col xs={24} sm={12} lg={8} key={plugin.id}>
        <div
          onClick={() => navigate(`/admin0755/plugins/${plugin.name}/config`)}
          style={{
            background: '#141414',
            borderRadius: 8,
            border: `1px solid ${cat === 'system' ? 'rgba(250,140,22,0.15)' : 'rgba(255,255,255,0.08)'}`,
            padding: '20px',
            cursor: 'pointer',
            transition: 'border-color 0.2s, box-shadow 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = cat === 'system' ? 'rgba(250,140,22,0.5)' : 'rgba(22,119,255,0.5)';
            e.currentTarget.style.boxShadow = cat === 'system' ? '0 0 12px rgba(250,140,22,0.08)' : '0 0 12px rgba(22,119,255,0.06)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = cat === 'system' ? 'rgba(250,140,22,0.15)' : 'rgba(255,255,255,0.08)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          {/* 头部 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Space size={10}>
              <div style={{
                width: 40, height: 40, borderRadius: 8,
                background: colors.bg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: colors.color,
              }}>
                {pluginIcons[plugin.name] || <AppstoreOutlined style={{ fontSize: 22 }} />}
              </div>
              <div>
                <Text strong style={{ color: '#fff', fontSize: 15, display: 'block', lineHeight: 1.3 }}>{plugin.title}</Text>
                <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>{plugin.name}</Text>
              </div>
            </Space>
            <Switch
              size="small"
              checked={isEnabled}
              onChange={(checked, e) => handleToggle(checked, plugin, e as any)}
            />
          </div>

          {/* 描述 */}
          <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, display: 'block', marginBottom: 12 }}>
            {plugin.description || '暂无描述'}
          </Text>

          {/* 底部信息 */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Text style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12 }}>开放：</Text>
              {plugin.allowed_levels === 'all' ? (
                <Tag style={{ margin: 0, fontSize: 11, background: `${colors.bg}`, border: `1px solid ${colors.color}33`, color: colors.color, borderRadius: 4 }}>{cat === 'system' ? '全部管理员分组' : '所有用户等级'}</Tag>
              ) : (
                plugin.allowed_levels.split(',').slice(0, 2).map(lv => (
                  <Tag key={lv} style={{ margin: 0, fontSize: 11, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)', borderRadius: 4 }}>{lv}</Tag>
                ))
              )}
            </div>
            <Button
              type="text"
              size="small"
              icon={<SettingOutlined />}
              style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}
              onClick={(e) => { e.stopPropagation(); navigate(`/admin0755/plugins/${plugin.name}/config`); }}
            >
              配置
            </Button>
          </div>
        </div>
      </Col>
    );
  };

  return (
    <div>
      {/* 页头 - 与站点其它页面一致 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 20, paddingBottom: 16,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <Title level={4} style={{ margin: 0, color: '#fff' }}>站点插件</Title>
        <Button icon={<ReloadOutlined />} onClick={fetchPlugins} loading={loading}>刷新</Button>
      </div>

      {loading && plugins.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60 }}><Spin /></div>
      ) : (
        categoryOrder
          .filter((cat) => groupedPlugins[cat]?.length)
          .map((cat) => {
            const label = categoryLabels[cat] || categoryLabels.user;
            return (
              <div key={cat} style={{ marginBottom: 28 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', marginBottom: 14,
                  color: cat === 'system' ? '#fa8c16' : 'rgba(255,255,255,0.55)',
                  fontSize: 13, fontWeight: 500,
                }}>
                  {label.icon}
                  {label.title}
                  <span style={{
                    marginLeft: 8, fontSize: 11,
                    color: 'rgba(255,255,255,0.25)',
                  }}>
                    ({groupedPlugins[cat].length})
                  </span>
                </div>
                <Row gutter={[16, 16]}>
                  {groupedPlugins[cat].map(renderPluginCard)}
                </Row>
              </div>
            );
          })
      )}
    </div>
  );
};

export default PluginsList;
