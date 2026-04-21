import React, { useState, useEffect, useMemo } from 'react';
import { Layout, Typography, ConfigProvider, theme, Button, Select, Input, Spin, Tooltip, Radio, Drawer, Tag } from 'antd';
import { 
    VideoCameraOutlined, PictureOutlined, MessageOutlined, AudioOutlined, 
    SettingOutlined, CompassOutlined, BulbOutlined, CloseOutlined, 
    SlidersOutlined, PlusOutlined, AppstoreAddOutlined, DownOutlined, SearchOutlined,
    StarOutlined, CopyOutlined, FileTextOutlined, InfoCircleOutlined, DollarOutlined, LockOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import request from '../../utils/request';
import './Playground.css';

const { Sider } = Layout;
const { Title, Text } = Typography;
const { TextArea } = Input;

const Playground: React.FC = () => {
  const navigate = useNavigate();
  const [activeMenu, setActiveMenu] = useState('video');
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<any>({});
  
  const [allModelsDetail, setAllModelsDetail] = useState<any[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [prompt, setPrompt] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(true);

  // 控制高级模型弹窗
  const [isModelModalVisible, setIsModelModalVisible] = useState(false);
  const [searchModelKeyword, setSearchModelKeyword] = useState('');
  const [activeModelTab, setActiveModelTab] = useState('All');

  // 设置面板占位状态
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [videoDuration, setVideoDuration] = useState('8s');
  const [frameRate, setFrameRate] = useState('24 fps');
  const [resolution, setResolution] = useState('720p');

  useEffect(() => {
    document.title = 'TokensByte AI Studio';
    fetchInitialData();
  }, []);

  useEffect(() => {
    const rawMenuItems = [
      { key: 'video', enabled: config.enable_video !== false },
      { key: 'image', enabled: config.enable_image !== false },
      { key: 'chat', enabled: config.enable_chat !== false },
      { key: 'audio', enabled: config.enable_audio !== false },
    ];
    const activatedItems = rawMenuItems.filter(item => item.enabled);

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

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      const [configRes, modelsRes] = await Promise.all([
          request.get('/plugins/playground/playground-public-config') as Promise<any>,
          request.get('/models?page_size=1000') as Promise<any>
      ]);
      setConfig(configRes || {});
      
      let allModels = [];
      if (modelsRes && modelsRes.models) allModels = modelsRes.models;
      else if (modelsRes && modelsRes.data && Array.isArray(modelsRes.data)) allModels = modelsRes.data;
      else if (Array.isArray(modelsRes)) allModels = modelsRes;
      
      setAllModelsDetail(allModels);

    } catch (e) {
      console.error('Data initialization failed', e);
    } finally {
      setLoading(false);
    }
  };

  const getMenuIcon = (key: string, isActive: boolean) => {
    const color = isActive ? '#fff' : 'rgba(255,255,255,0.45)';
    const size = 20;
    switch(key) {
      case 'video': return <VideoCameraOutlined style={{ color, fontSize: size }} />;
      case 'image': return <PictureOutlined style={{ color, fontSize: size }} />;
      case 'chat': return <MessageOutlined style={{ color, fontSize: size }} />;
      case 'audio': return <AudioOutlined style={{ color, fontSize: size }} />;
      default: return <SettingOutlined />;
    }
  };

  // 通过比对获得详细的选中模型对象数据
  const currentModelDetail = useMemo(() => {
      if (!selectedModel || !allModelsDetail) return null;
      return allModelsDetail.find(m => m.name === selectedModel);
  }, [selectedModel, allModelsDetail]);

  const getMenuLabel = (key: string) => {
    switch(key) {
      case 'video': return 'Video Gen';
      case 'image': return 'Image Gen';
      case 'chat': return 'Chat';
      case 'audio': return 'Audio Voice';
      default: return '';
    }
  };

  const renderSidebarItem = (key: string) => {
    if (config[`enable_${key}`] === false) return null;
    const isActive = activeMenu === key;
    return (
      <Tooltip placement="right" title={getMenuLabel(key)} key={key}>
        <div 
          onClick={() => setActiveMenu(key)}
          style={{
            width: 48, height: 48, borderRadius: 12, margin: '8px auto', display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', background: isActive ? 'rgba(255, 255, 255, 0.08)' : 'transparent', transition: 'all 0.2s',
            boxShadow: isActive ? 'inset 0 0 0 1px rgba(255,255,255,0.1)' : 'none'
          }}
        >
          {getMenuIcon(key, isActive)}
        </div>
      </Tooltip>
    );
  };

  // 弹窗中过滤出属于当前频道的可用模型表
  const availableModelsInCurrentMenu = useMemo(() => {
      const activeMenuStrModels = config[`${activeMenu}_models`] || [];
      return allModelsDetail.filter(am => activeMenuStrModels.includes(am.name)).filter(am => 
          !searchModelKeyword || am.name.toLowerCase().includes(searchModelKeyword.toLowerCase())
      );
  }, [activeMenu, config, allModelsDetail, searchModelKeyword]);

  return (
    <ConfigProvider theme={{ algorithm: theme.darkAlgorithm, token: { colorPrimary: '#A2C1FF', borderRadius: 12, colorBgContainer: '#1E1F22', colorBorder: 'rgba(255,255,255,0.08)' } }}>
      <Layout style={{ height: '100vh', width: '100vw', overflow: 'hidden', background: '#090A0B' }}>
        
        {/* 左侧极简工具栏 */}
        <Sider width={72} style={{ background: '#0E0F11', borderRight: '1px solid rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 20 }}>
          <div style={{ padding: '0 12px', marginBottom: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
             <Button 
                type="text" shape="circle" icon={<CloseOutlined />} 
                onClick={() => { window.close(); navigate('/'); }} 
                style={{ color: 'rgba(255,255,255,0.6)', background: 'rgba(255,255,255,0.02)' }}
              />
          </div>
          <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {renderSidebarItem('video')}
            {renderSidebarItem('image')}
            {renderSidebarItem('chat')}
            {renderSidebarItem('audio')}
          </div>
        </Sider>

        {/* 中央工作视口 Canvas */}
        <Layout style={{ background: 'transparent', display: 'flex', flexDirection: 'column', padding: '16px', position: 'relative' }}>
            <div style={{ padding: '8px 12px 16px 12px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <Title level={4} style={{ margin: 0, color: 'rgba(255,255,255,0.9)', fontWeight: 500 }}>Playground</Title>
            </div>

            {!isSettingsOpen && (
                <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 100, display: 'flex', gap: 12 }}>
                    <Tooltip title="Run settings" placement="left">
                        <Button 
                            type="text" shape="circle" icon={<SlidersOutlined />} 
                            onClick={() => setIsSettingsOpen(true)}
                            style={{ 
                                color: 'rgba(255,255,255,0.7)',  background: 'rgba(255, 255, 255, 0.05)',
                                border: '1px solid rgba(255, 255, 255, 0.05)', width: 40,  height: 40,
                                fontSize: 18, backdropFilter: 'blur(10px)'
                            }}
                        />
                    </Tooltip>
                </div>
            )}

            <div style={{ 
                flex: 1, background: '#0E0F11', borderRadius: 20, 
                border: '1px solid rgba(255,255,255,0.03)', boxShadow: 'inset 0px 4px 60px rgba(0,0,0,0.4)',
                display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden', transition: 'all 0.3s ease'
            }}>
                {loading ? (
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                    <Spin size="large" />
                  </div>
                ) : (
                  <>
                    <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        <CompassOutlined style={{ fontSize: 48, color: 'rgba(255,255,255,0.05)', marginBottom: 20 }} />
                        <Title level={2} style={{ color: 'rgba(255,255,255,0.9)', letterSpacing: '0.5px', margin: '0 0 16px 0' }}>
                            Upgrade to unlock {activeMenu === 'image' ? 'Pro Generation' : 'Veo Series'}
                        </Title>
                        <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, maxWidth: 400, textAlign: 'center', lineHeight: 1.6 }}>
                            This is an immersive environment for {getMenuLabel(activeMenu)}. Describe your vision below to begin testing models.
                        </Text>
                    </div>

                    <div style={{
                        margin: '0 24px 24px 24px', background: '#1A1B1E', borderRadius: 16,
                        border: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', overflow: 'hidden'
                    }}>
                        <TextArea 
                            value={prompt}
                            onChange={e => setPrompt(e.target.value)}
                            placeholder={`Describe your ${activeMenu}...`}
                            autoSize={{ minRows: 3, maxRows: 8 }}
                            bordered={false}
                            style={{ color: '#E8EAED', resize: 'none', padding: '16px', fontSize: 15, lineHeight: '1.6', background: 'transparent' }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'rgba(0,0,0,0.1)' }}>
                            <div style={{ display: 'flex', gap: 12 }}>
                                <Tooltip title="Clear or attachments"><Button type="text" shape="circle" icon={<BulbOutlined />} style={{ color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.03)' }} /></Tooltip>
                                <Button icon={<AppstoreAddOutlined />} style={{ background: 'rgba(255,255,255,0.03)', border: 'none', color: 'rgba(255,255,255,0.4)', borderRadius: 20 }}>Tools</Button>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <Tooltip title="Add reference"><Button type="text" shape="circle" icon={<PlusOutlined />} style={{ color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.03)' }} /></Tooltip>
                                <Button 
                                    type="primary" 
                                    disabled={!selectedModel || !prompt.trim()}
                                    style={{
                                        height: 38, borderRadius: 19, padding: '0 20px', fontWeight: 500,
                                        background: selectedModel && prompt.trim() ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
                                        color: selectedModel && prompt.trim() ? '#fff' : 'rgba(255,255,255,0.3)',
                                        border: 'none', boxShadow: 'none'
                                    }}
                                >
                                    Run ⌘ ↵
                                </Button>
                            </div>
                        </div>
                    </div>
                  </>
                )}
            </div>
        </Layout>

        {/* 右侧深度操作参数台 Control Panel */}
        <Sider 
            width={340} 
            collapsed={!isSettingsOpen}
            collapsedWidth={0}
            trigger={null}
            style={{ 
                background: '#121315', 
                borderLeft: isSettingsOpen ? '1px solid rgba(255,255,255,0.04)' : 'none',
                padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', transition: 'all 0.3s ease'
            }}
        >
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', width: 340 }}>
                <div style={{ padding: '24px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.03)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                   <Title level={5} style={{ margin: 0, color: 'rgba(255,255,255,0.85)', fontWeight: 500 }}>
                       Run settings
                   </Title>
                   <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                       <Button type="text" style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>&lt;&gt; Get code</Button>
                       <Button 
                           type="text" shape="circle" icon={<CloseOutlined />} 
                           onClick={() => setIsSettingsOpen(false)}
                           style={{ color: 'rgba(255,255,255,0.5)', background: 'transparent' }} 
                       />
                   </div>
                </div>
                
                <div style={{ flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
                    {/* 高仿 AI Studio 模型的粗体厚重卡片入口 */}
                    <div>
                        <div 
                            onClick={() => setIsModelModalVisible(true)}
                            className="studio-model-card"
                            style={{ 
                                background: '#202124', borderRadius: 12, padding: '16px', 
                                border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer',
                                transition: 'all 0.2s ease', position: 'relative'
                            }}
                        >
                            <div style={{ color: '#E8eaed', fontSize: 17, fontWeight: 500, marginBottom: 8, paddingRight: 24 }}>
                                {selectedModel || 'Select a model...'}
                            </div>
                            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                {currentModelDetail?.model_desc || 'Select the most appropriate generative model to process your workflow requirement. Available to all platform registered developers.'}
                            </div>
                            <div style={{ position: 'absolute', right: 16, top: 16, color: 'rgba(255,255,255,0.4)' }}><DownOutlined /></div>
                        </div>
                    </div>

                    {/* Placeholder Settings specific to Video */}
                    {(activeMenu === 'video') && (
                        <>
                          <div>
                              <Text style={{ display: 'block', marginBottom: 12, fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>Aspect ratio</Text>
                              <div style={{ width: '100%', display: 'flex', height: 68, background: '#17181A', borderRadius: 12, padding: 4 }}>
                                 <div 
                                    onClick={() => setAspectRatio('16:9')}
                                    style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: aspectRatio === '16:9' ? '#33373E' : 'transparent', borderRadius: 8, color: aspectRatio === '16:9' ? '#fff' : 'rgba(255,255,255,0.45)', transition: 'all 0.2s' }}
                                 >
                                    <div style={{ width: 22, height: 12, border: '1.5px solid currentColor', borderRadius: 2, marginBottom: 6 }}></div>
                                    <span style={{ fontSize: 13, fontWeight: 500 }}>16:9</span>
                                 </div>
                                 <div 
                                    onClick={() => setAspectRatio('9:16')}
                                    style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: aspectRatio === '9:16' ? '#33373E' : 'transparent', borderRadius: 8, color: aspectRatio === '9:16' ? '#fff' : 'rgba(255,255,255,0.45)', transition: 'all 0.2s' }}
                                 >
                                    <div style={{ width: 12, height: 22, border: '1.5px solid currentColor', borderRadius: 2, marginBottom: 6 }}></div>
                                    <span style={{ fontSize: 13, fontWeight: 500 }}>9:16</span>
                                 </div>
                              </div>
                          </div>
                          
                          <div>
                              <Text style={{ display: 'block', marginBottom: 12, fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>Video duration</Text>
                              <Select style={{ width: '100%' }} size="large" value={videoDuration} onChange={setVideoDuration} popupClassName="dark-select-dropdown"
                                  options={[{ label: '8s', value: '8s' }, { label: '16s', value: '16s' }]}
                              />
                          </div>

                          <div>
                              <Text style={{ display: 'block', marginBottom: 12, fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>Frame rate</Text>
                              <Select style={{ width: '100%' }} size="large" value={frameRate} onChange={setFrameRate} popupClassName="dark-select-dropdown"
                                  options={[{ label: '24 fps', value: '24 fps' }, { label: '30 fps', value: '30 fps' }]}
                              />
                          </div>

                          <div>
                              <Text style={{ display: 'block', marginBottom: 12, fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>Output resolution</Text>
                              <Select style={{ width: '100%' }} size="large" value={resolution} onChange={setResolution} popupClassName="dark-select-dropdown"
                                  options={[{ label: '720p', value: '720p' }, { label: '1080p', value: '1080p' }]}
                              />
                          </div>
                        </>
                    )}

                    {(activeMenu === 'image') && (
                        <>
                          <div>
                              <Text style={{ display: 'block', margin: '20px 0 12px 0', fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>Output resolution</Text>
                              <Select style={{ width: '100%' }} size="large" value={resolution} onChange={setResolution} popupClassName="dark-select-dropdown"
                                  options={[{ label: '1024x1024', value: '1024x1024' }, { label: '1920x1080', value: '1920x1080' }]}
                              />
                          </div>
                        </>
                    )}
                </div>
            </div>
        </Sider>

        {/* 模型全景选择器抽屉 (取代之前的弹窗，实现从右向左滑入的覆盖抽屉效果) */}
        <Drawer
            title={<span style={{ fontSize: 18, fontWeight: 600, color: '#e8eaed' }}>Model selection</span>}
            open={isModelModalVisible}
            onClose={() => setIsModelModalVisible(false)}
            placement="right"
            width={480}
            mask={false} /* 移除黑底，产生直接在页面操作侧滑覆盖的连续感 */
            rootClassName="studio-model-drawer"
            closeIcon={<CloseOutlined style={{ color: '#e8eaed' }} />}
            style={{ background: '#1c1c1f', borderLeft: '1px solid rgba(255,255,255,0.06)' }}
            getContainer={false} /* 可以限制在布局内，但全屏时 false 或挂在 body 都一样 */
        >
            <div style={{}}>
                <Input 
                    size="large" prefix={<SearchOutlined style={{ color: 'rgba(255,255,255,0.4)', paddingRight: 8 }} />} 
                    placeholder="Search for a model" 
                    value={searchModelKeyword} onChange={e => setSearchModelKeyword(e.target.value)}
                    style={{ background: '#131416', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8 }}
                />
            </div>
            
            {/* Tag Tabs 横条 */}
            <div style={{ display: 'flex', gap: 8, padding: '16px 0', overflowX: 'auto', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                {['All', 'Video', 'Images', 'Featured', 'Gemini'].map(t => (
                    <div 
                        key={t} onClick={() => setActiveModelTab(t)}
                        style={{ 
                            padding: '6px 16px', borderRadius: 20, cursor: 'pointer', fontSize: 13,
                            background: activeModelTab === t ? 'rgba(255,255,255,0.1)' : 'transparent',
                            border: activeModelTab === t ? '1px solid rgba(255,255,255,0.3)' : '1px solid rgba(255,255,255,0.08)',
                            color: activeModelTab === t ? '#fff' : 'rgba(255,255,255,0.6)',
                            whiteSpace: 'nowrap'
                        }}
                    >
                        {t}
                    </div>
                ))}
            </div>

            {/* 模型列表大画卷 */}
            <div style={{ height: 450, overflowY: 'auto', paddingRight: '4px', marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {availableModelsInCurrentMenu.length === 0 ? (
                    <div style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: '60px 0' }}>No models found for this category.</div>
                ) : (
                    availableModelsInCurrentMenu.map(model => (
                        <div 
                            key={model.id}
                            className="studio-model-list-item"
                            onClick={() => { setSelectedModel(model.name); setIsModelModalVisible(false); }}
                            style={{ 
                                background: '#1c1c1f', padding: '16px 20px', borderRadius: 12,
                                border: '1px solid rgba(255,255,255,0.03)', cursor: 'pointer', display: 'flex', gap: 16
                            }}
                        >
                            {/* 左侧图标 */}
                            <div style={{ fontSize: 24, padding: 4, opacity: 0.8, color: '#A2C1FF' }}>
                                {activeMenu === 'video' ? <VideoCameraOutlined /> : (activeMenu === 'chat' ? <MessageOutlined /> : <PictureOutlined/>)}
                            </div>
                            
                            {/* 内容主体 */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flex: 1, flexWrap: 'wrap' }}>
                                        <div style={{ color: '#E8eaed', fontSize: 16, fontWeight: 500, wordBreak: 'break-word', lineHeight: 1.4 }}>{model.name}</div>
                                        <div style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: 12, fontSize: 12, color: '#bfbfbf', whiteSpace: 'nowrap', flexShrink: 0, marginTop: 2 }}>• Paid</div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 12, color: 'rgba(255,255,255,0.4)', flexShrink: 0, marginTop: 4 }}>
                                        <StarOutlined />
                                        <CopyOutlined />
                                        <FileTextOutlined />
                                    </div>
                                </div>
                                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 4 }}>ID: {model.code || model.name}</div>
                                
                                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, marginTop: 16, lineHeight: 1.5 }}>
                                    <InfoCircleOutlined style={{ marginRight: 6 }} />
                                    {model.model_desc || 'A standard generative model configured via TokensByte core. Provides steady generation speed.'}
                                </div>
                                
                                <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
                                    <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>
                                        <DollarOutlined style={{ marginRight: 6 }} />
                                        Usage cost standard active
                                    </div>
                                    <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>
                                        <LockOutlined style={{ marginRight: 6 }} />
                                        Knowledge cutoff: Unknown
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </Drawer>

      </Layout>
    </ConfigProvider>
  );
};

export default Playground;
