import React, { useState, useEffect } from 'react';
import { Layout, Menu, Typography, ConfigProvider, theme, Button, Select, Empty, Spin } from 'antd';
import { VideoCameraOutlined, PictureOutlined, MessageOutlined, AudioOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import request from '../../utils/request';

const { Header, Sider, Content } = Layout;
const { Title, Text } = Typography;

const Playground: React.FC = () => {
  const navigate = useNavigate();
  const [activeMenu, setActiveMenu] = useState('chat');
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<any>({});
  const [selectedModel, setSelectedModel] = useState<string>('');

  useEffect(() => {
    document.title = '模型体验中心';
    fetchConfig();
  }, []);

  useEffect(() => {
    const rawMenuItems = [
      { key: 'chat', icon: <MessageOutlined />, label: '聊天对话', enabled: config.enable_chat !== false },
      { key: 'image', icon: <PictureOutlined />, label: '图片生成', enabled: config.enable_image !== false },
      { key: 'video', icon: <VideoCameraOutlined />, label: '视频生成', enabled: config.enable_video !== false },
      { key: 'audio', icon: <AudioOutlined />, label: '声音克隆', disabled: true, enabled: config.enable_audio !== false },
    ];
    const activatedItems = rawMenuItems.filter(item => item.enabled);

    // 切换标签时，或者首次获取配置时自动选中有效菜单
    if (Object.keys(config).length > 0) {
      if (activatedItems.length > 0 && !activatedItems.find(m => m.key === activeMenu)) {
        setActiveMenu(activatedItems[0].key);
      }
    }

    const models = config[`${activeMenu}_models`] || [];
    if (models.length > 0) {
      setSelectedModel(models[0]);
    } else {
      setSelectedModel('');
    }
  }, [activeMenu, config]);

  const fetchConfig = async () => {
    try {
      setLoading(true);
      const res = await (request.get('/plugins/playground/playground-public-config') as any);
      setConfig(res || {});
    } catch (e) {
      console.error('获取体验中心配置失败', e);
    } finally {
      setLoading(false);
    }
  };

  const menuItems = [
    { key: 'chat', icon: <MessageOutlined />, label: '聊天对话', enabled: config.enable_chat !== false },
    { key: 'image', icon: <PictureOutlined />, label: '图片生成', enabled: config.enable_image !== false },
    { key: 'video', icon: <VideoCameraOutlined />, label: '视频生成', enabled: config.enable_video !== false },
    { key: 'audio', icon: <AudioOutlined />, label: '声音克隆', disabled: true, enabled: config.enable_audio !== false },
  ].filter(item => item.enabled);

  return (
    <ConfigProvider theme={{ algorithm: theme.darkAlgorithm, token: { colorPrimary: '#1677ff', borderRadius: 8 } }}>
      <Layout style={{ height: '100vh', width: '100vw', overflow: 'hidden' }}>
        <Header style={{ background: '#141414', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => { window.close(); navigate('/'); }} style={{ color: 'rgba(255,255,255,0.65)' }} />
            <Title level={4} style={{ margin: 0, color: '#fff' }}>模型体验中心</Title>
          </div>
          <div>
            {/* 你可以在这里放用户的简易信息、充值按钮或是余额 */}
          </div>
        </Header>
        <Layout>
          <Sider width={200} style={{ background: '#141414', borderRight: '1px solid rgba(255,255,255,0.08)' }}>
            {menuItems.length === 0 ? (
              <Empty 
                description="管理员没有开放任何可用体验频道" 
                style={{ marginTop: 60 }}
              />
            ) : (
              <Menu
                mode="inline"
                theme="dark"
                selectedKeys={[activeMenu]}
                onClick={(e) => setActiveMenu(e.key)}
                items={menuItems}
                style={{ background: 'transparent', border: 'none', padding: '16px 8px' }}
              />
            )}
          </Sider>
          <Content style={{ background: '#000', padding: 24, position: 'relative' }}>
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                <Spin size="large" />
              </div>
            ) : (
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center' }}>
                  <Text style={{ color: 'rgba(255,255,255,0.45)', marginRight: 12 }}>请求模型:</Text>
                  <Select
                    style={{ width: 220 }}
                    placeholder={`选择可用${activeMenu === 'chat' ? '对话' : activeMenu === 'image' ? '生图' : '视频'}模型`}
                    popupClassName="dark-select-dropdown"
                    value={selectedModel || undefined}
                    onChange={(val) => setSelectedModel(val)}
                    options={(config[`${activeMenu}_models`] || []).map((m: string) => ({ label: m, value: m }))}
                  />
                  {(config[`${activeMenu}_models`] || []).length === 0 && (
                    <Text type="danger" style={{ marginLeft: 16, fontSize: 13 }}>
                      管理员未配置该类型的模型清单
                    </Text>
                  )}
                </div>
                <div style={{ flex: 1, background: '#141414', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'center', alignItems: 'center', flexDirection: 'column' }}>
                  <Empty 
                    description={
                      <div>
                        基于您的站点 API Key 或者动态分配的接口，您可在此对体验功能进行交互。<br/>
                        <Text type="secondary">（该版本为里程碑验证 UI，功能内核将在此版本后演进实现）</Text>
                      </div>
                    } 
                  />
                </div>
              </div>
            )}
          </Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
};

export default Playground;
