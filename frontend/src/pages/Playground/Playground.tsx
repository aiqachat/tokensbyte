import React, { useState, useEffect, useMemo } from 'react';
import { Layout, Typography, ConfigProvider, theme, Button, Select, Input, Spin, Tooltip, Radio, Drawer, Tag, Dropdown, message, Switch, Modal } from 'antd';
import { 
    VideoCameraOutlined, PictureOutlined, MessageOutlined, AudioOutlined, 
    SettingOutlined, CompassOutlined, CloseOutlined, 
    SlidersOutlined, AppstoreAddOutlined, DownOutlined, SearchOutlined,
    StarOutlined, CopyOutlined, FileTextOutlined, InfoCircleOutlined, DollarOutlined, KeyOutlined,
    LoadingOutlined, PlayCircleOutlined, CheckCircleOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import request from '../../utils/request';
import './Playground.css';

const { Sider } = Layout;
const { Title, Text } = Typography;
const { TextArea } = Input;

interface SchemeParam {
  key: string;
  label: string;
  type: 'radio' | 'select' | 'switch';
  options?: (string | number)[];
  default: any;
  unit?: string;
}

interface PlaygroundModel {
  mid: string;
  name: string;
  model_id: string;
  type_name: string;
  scheme_id: string;
  scheme_name: string;
  scheme_type: string;
  params: SchemeParam[];
}

const Playground: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [models, setModels] = useState<PlaygroundModel[]>([]);
  const [selectedMid, setSelectedMid] = useState<string>('');
  const [prompt, setPrompt] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(true);

  // 模型选择 Drawer
  const [isModelDrawerVisible, setIsModelDrawerVisible] = useState(false);
  const [searchModelKeyword, setSearchModelKeyword] = useState('');
  
  // 用户令牌密钥
  const [apiTokens, setApiTokens] = useState<any[]>([]);
  const [selectedTokenKey, setSelectedTokenKey] = useState<string>('');
  const [isTokenModalVisible, setIsTokenModalVisible] = useState(false);

  // 动态参数值
  const [paramValues, setParamValues] = useState<Record<string, any>>({});

  // 生成状态
  const [generating, setGenerating] = useState(false);
  const [generationResult, setGenerationResult] = useState<any>(null);
  const [taskPolling, setTaskPolling] = useState(false);

  // 当前活跃类别
  const [activeCategory, setActiveCategory] = useState<string>('');

  useEffect(() => {
    document.title = 'TokensByte AI Studio';
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      const [configRes, tokensRes] = await Promise.all([
          request.get('/plugins/playground/playground-public-config') as Promise<any>,
          request.get('/tokens').catch(() => ({ data: [] })) as Promise<any>
      ]);
      
      const enabledModels: PlaygroundModel[] = configRes?.models || [];
      setModels(enabledModels);

      // 自动选择第一个类别和模型
      if (enabledModels.length > 0) {
        const categories = [...new Set(enabledModels.map(m => m.scheme_type || m.type_name))];
        const firstCat = categories[0] || '';
        setActiveCategory(firstCat);
        const firstModel = enabledModels.find(m => (m.scheme_type || m.type_name) === firstCat);
        if (firstModel) {
          setSelectedMid(firstModel.mid);
          initParamDefaults(firstModel.params);
        }
      }

      if (tokensRes?.data && Array.isArray(tokensRes.data)) {
        setApiTokens(tokensRes.data);
      }
    } catch (e) {
      console.error('Data initialization failed', e);
    } finally {
      setLoading(false);
    }
  };

  const initParamDefaults = (params: SchemeParam[]) => {
    const defaults: Record<string, any> = {};
    for (const p of params) {
      defaults[p.key] = p.default;
    }
    setParamValues(defaults);
  };

  // 当前选中的模型对象
  const currentModel = useMemo(() => {
    return models.find(m => m.mid === selectedMid) || null;
  }, [selectedMid, models]);

  // 可用类别列表
  const categories = useMemo(() => {
    const cats = [...new Set(models.map(m => m.scheme_type || m.type_name))];
    return cats.filter(Boolean);
  }, [models]);

  // 当前类别下的模型
  const modelsInCategory = useMemo(() => {
    return models.filter(m => {
      const cat = m.scheme_type || m.type_name;
      return cat === activeCategory;
    }).filter(m => {
      if (!searchModelKeyword) return true;
      return m.name.toLowerCase().includes(searchModelKeyword.toLowerCase());
    });
  }, [models, activeCategory, searchModelKeyword]);

  const getCategoryIcon = (cat: string, isActive: boolean) => {
    const color = isActive ? '#fff' : 'rgba(255,255,255,0.45)';
    const size = 20;
    if (cat === 'video' || cat.includes('视频')) return <VideoCameraOutlined style={{ color, fontSize: size }} />;
    if (cat === 'image' || cat.includes('图片')) return <PictureOutlined style={{ color, fontSize: size }} />;
    if (cat === 'chat' || cat.includes('聊天')) return <MessageOutlined style={{ color, fontSize: size }} />;
    if (cat === 'audio' || cat.includes('音频')) return <AudioOutlined style={{ color, fontSize: size }} />;
    return <CompassOutlined style={{ color, fontSize: size }} />;
  };

  const getCategoryLabel = (cat: string) => {
    if (cat === 'video' || cat.includes('视频')) return 'Video Gen';
    if (cat === 'image' || cat.includes('图片')) return 'Image Gen';
    if (cat === 'chat' || cat.includes('聊天')) return 'Chat';
    if (cat === 'audio' || cat.includes('音频')) return 'Audio Voice';
    return cat;
  };

  // 切换类别时自动选中该类别第一个模型
  const handleCategoryChange = (cat: string) => {
    setActiveCategory(cat);
    const first = models.find(m => (m.scheme_type || m.type_name) === cat);
    if (first) {
      setSelectedMid(first.mid);
      initParamDefaults(first.params);
    }
    setGenerationResult(null);
  };

  // 选中模型时初始化参数
  const handleSelectModel = (mid: string) => {
    setSelectedMid(mid);
    const model = models.find(m => m.mid === mid);
    if (model) {
      initParamDefaults(model.params);
    }
    setIsModelDrawerVisible(false);
    setGenerationResult(null);
  };

  // 发送生成请求
  const handleGenerate = async () => {
    if (!currentModel || !prompt.trim()) return;
    if (!selectedTokenKey) {
      message.warning('请先选择一个 API 密钥');
      return;
    }

    setGenerating(true);
    setGenerationResult(null);

    try {
      const schemeType = currentModel.scheme_type || '';
      const body: any = {
        model: currentModel.model_id,
        prompt: prompt.trim(),
        ...paramValues,
      };

      let endpoint = '';
      if (schemeType === 'video' || currentModel.type_name.includes('视频')) {
        endpoint = '/v1/video/generations';
      } else if (schemeType === 'image' || currentModel.type_name.includes('图片')) {
        endpoint = '/v1/images/generations';
      } else {
        endpoint = '/v1/chat/completions';
        body.messages = [{ role: 'user', content: prompt.trim() }];
        delete body.prompt;
      }

      const res = await (request.post(endpoint, body, {
        headers: { 'Authorization': `Bearer ${selectedTokenKey}` }
      }) as Promise<any>);

      // 视频异步任务需要轮询
      if (endpoint === '/v1/video/generations' && res?.id) {
        setGenerationResult({ status: 'processing', task_id: res.id, ...res });
        pollTaskStatus(res.id, currentModel.model_id);
      } else {
        setGenerationResult({ status: 'completed', data: res });
        setGenerating(false);
      }
    } catch (e: any) {
      const errMsg = e?.response?.data?.error?.message || e?.message || '生成失败';
      message.error(errMsg);
      setGenerationResult({ status: 'error', message: errMsg });
      setGenerating(false);
    }
  };

  // 轮询视频任务状态
  const pollTaskStatus = async (taskId: string, modelId: string) => {
    setTaskPolling(true);
    let attempts = 0;
    const maxAttempts = 120; // 最多等待 10 分钟

    const poll = async () => {
      if (attempts >= maxAttempts) {
        setGenerationResult((prev: any) => ({ ...prev, status: 'timeout', message: '生成超时，请稍后在日志中查看结果' }));
        setGenerating(false);
        setTaskPolling(false);
        return;
      }
      attempts++;

      try {
        const res = await (request.get(`/v1/video/generations/${taskId}?model=${modelId}`, {
          headers: { 'Authorization': `Bearer ${selectedTokenKey}` }
        }) as Promise<any>);

        const status = res?.status || res?.final_result?.status || '';
        
        if (status === 'succeeded') {
          setGenerationResult({ status: 'completed', data: res });
          setGenerating(false);
          setTaskPolling(false);
          return;
        } else if (status === 'failed') {
          setGenerationResult({ status: 'error', message: res?.error?.message || '生成失败', data: res });
          setGenerating(false);
          setTaskPolling(false);
          return;
        }

        // 继续轮询
        setTimeout(poll, 5000);
      } catch (e) {
        setTimeout(poll, 5000);
      }
    };

    setTimeout(poll, 3000);
  };

  // 渲染动态参数面板
  const renderParamControl = (param: SchemeParam) => {
    const value = paramValues[param.key] ?? param.default;

    if (param.type === 'radio' && param.options) {
      return (
        <div key={param.key}>
          <Text style={{ display: 'block', marginBottom: 12, fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{param.label}</Text>
          <div style={{ width: '100%', display: 'flex', height: 68, background: '#17181A', borderRadius: 12, padding: 4 }}>
            {param.options.map(opt => {
              const isActive = value === opt;
              return (
                <div 
                  key={String(opt)}
                  onClick={() => setParamValues(prev => ({ ...prev, [param.key]: opt }))}
                  style={{ 
                    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', 
                    cursor: 'pointer', background: isActive ? '#33373E' : 'transparent', borderRadius: 8, 
                    color: isActive ? '#fff' : 'rgba(255,255,255,0.45)', transition: 'all 0.2s',
                    fontSize: 13, fontWeight: 500,
                  }}
                >
                  {String(opt).includes(':') ? (
                    <>
                      <div style={{ 
                        width: String(opt) === '16:9' || String(opt) === '21:9' ? 22 : String(opt) === '9:16' ? 12 : String(opt) === '1:1' ? 16 : String(opt) === '4:3' ? 18 : String(opt) === '3:4' ? 14 : 16,
                        height: String(opt) === '16:9' || String(opt) === '21:9' ? 12 : String(opt) === '9:16' ? 22 : String(opt) === '1:1' ? 16 : String(opt) === '4:3' ? 14 : String(opt) === '3:4' ? 18 : 16,
                        border: '1.5px solid currentColor', borderRadius: 2, marginBottom: 6
                      }}></div>
                      <span>{String(opt)}</span>
                    </>
                  ) : (
                    <span>{String(opt)}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    if (param.type === 'select' && param.options) {
      return (
        <div key={param.key}>
          <Text style={{ display: 'block', marginBottom: 12, fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{param.label}</Text>
          <Select 
            style={{ width: '100%' }} size="large" 
            value={value} 
            onChange={(v) => setParamValues(prev => ({ ...prev, [param.key]: v }))} 
            popupClassName="dark-select-dropdown"
            options={param.options.map(opt => ({ label: `${opt}${param.unit ? ' ' + param.unit : ''}`, value: opt }))}
          />
        </div>
      );
    }

    if (param.type === 'switch') {
      return (
        <div key={param.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{param.label}</Text>
          <Switch 
            checked={!!value}
            onChange={(v) => setParamValues(prev => ({ ...prev, [param.key]: v }))}
          />
        </div>
      );
    }

    return null;
  };

  // 渲染生成结果
  const renderResult = () => {
    if (!generationResult) return null;

    if (generationResult.status === 'processing') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 16 }}>
          <LoadingOutlined style={{ fontSize: 48, color: '#A2C1FF' }} />
          <Title level={4} style={{ color: 'rgba(255,255,255,0.9)', margin: 0 }}>正在生成中...</Title>
          <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>任务ID: {generationResult.task_id}</Text>
        </div>
      );
    }

    if (generationResult.status === 'error') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 16 }}>
          <Text style={{ color: '#ff4d4f', fontSize: 16 }}>生成失败</Text>
          <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, maxWidth: 400, textAlign: 'center' }}>{generationResult.message}</Text>
        </div>
      );
    }

    if (generationResult.status === 'completed') {
      const data = generationResult.data;
      
      // 视频结果
      const videoUrl = data?.content?.video_url || data?.final_result?.video_url || data?.video_url;
      if (videoUrl) {
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 16, padding: 24 }}>
            <CheckCircleOutlined style={{ fontSize: 24, color: '#52c41a' }} />
            <video src={videoUrl} controls style={{ maxWidth: '100%', maxHeight: '60vh', borderRadius: 12 }} />
            <Button type="link" href={videoUrl} target="_blank">下载视频</Button>
          </div>
        );
      }

      // 图片结果
      const imageData = data?.data?.[0] || data?.content?.image_url;
      const imageUrl = typeof imageData === 'string' ? imageData : imageData?.url || imageData?.b64_json;
      if (imageUrl) {
        const isBase64 = imageUrl.length > 200;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 16, padding: 24 }}>
            <CheckCircleOutlined style={{ fontSize: 24, color: '#52c41a' }} />
            <img 
              src={isBase64 ? `data:image/png;base64,${imageUrl}` : imageUrl} 
              alt="Generated" 
              style={{ maxWidth: '100%', maxHeight: '60vh', borderRadius: 12 }} 
            />
          </div>
        );
      }

      // 通用 JSON 结果
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 16, padding: 24 }}>
          <CheckCircleOutlined style={{ fontSize: 24, color: '#52c41a' }} />
          <pre style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, maxHeight: '60vh', overflow: 'auto', background: '#1A1B1E', padding: 16, borderRadius: 8, width: '100%', maxWidth: 600 }}>
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      );
    }

    return null;
  };

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
            {categories.map(cat => {
              const isActive = activeCategory === cat;
              return (
                <Tooltip placement="right" title={getCategoryLabel(cat)} key={cat}>
                  <div 
                    onClick={() => handleCategoryChange(cat)}
                    style={{
                      width: 48, height: 48, borderRadius: 12, margin: '8px auto', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', background: isActive ? 'rgba(255, 255, 255, 0.08)' : 'transparent', transition: 'all 0.2s',
                      boxShadow: isActive ? 'inset 0 0 0 1px rgba(255,255,255,0.1)' : 'none'
                    }}
                  >
                    {getCategoryIcon(cat, isActive)}
                  </div>
                </Tooltip>
              );
            })}
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
                        {generationResult ? (
                          renderResult()
                        ) : (
                          <>
                            <CompassOutlined style={{ fontSize: 48, color: 'rgba(255,255,255,0.05)', marginBottom: 20 }} />
                            <Title level={2} style={{ color: 'rgba(255,255,255,0.9)', letterSpacing: '0.5px', margin: '0 0 16px 0' }}>
                                {currentModel ? currentModel.name : 'AI Experience Center'}
                            </Title>
                            <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, maxWidth: 400, textAlign: 'center', lineHeight: 1.6 }}>
                                {currentModel 
                                  ? `使用 ${currentModel.scheme_name || '默认方案'} 进行体验。选择右侧参数后输入提示词开始生成。`
                                  : '请在右侧面板选择一个模型，然后描述你的创意开始体验。'}
                            </Text>
                          </>
                        )}
                    </div>

                    <div style={{
                        margin: '0 24px 24px 24px', background: '#1A1B1E', borderRadius: 16,
                        border: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', overflow: 'hidden'
                    }}>
                        <TextArea 
                            value={prompt}
                            onChange={e => setPrompt(e.target.value)}
                            placeholder={currentModel ? `描述你的${getCategoryLabel(activeCategory)}创意...` : '请先选择模型...'}
                            autoSize={{ minRows: 3, maxRows: 8 }}
                            bordered={false}
                            style={{ color: '#E8EAED', resize: 'none', padding: '16px', fontSize: 15, lineHeight: '1.6', background: 'transparent' }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'rgba(0,0,0,0.1)' }}>
                            <div style={{ display: 'flex', gap: 12 }}>
                                <Tooltip title={selectedTokenKey ? "更换 API 密钥" : "选择 API 密钥"}>
                                    <Button 
                                        type="text" 
                                        shape="circle" 
                                        onClick={() => setIsTokenModalVisible(true)}
                                        icon={
                                            selectedTokenKey ? <KeyOutlined /> : (
                                                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <KeyOutlined />
                                                    <div style={{ position: 'absolute', width: '100%', height: 1.5, background: 'currentColor', transform: 'rotate(45deg)' }} />
                                                </div>
                                            )
                                        } 
                                        style={{ 
                                            color: selectedTokenKey ? '#1677ff' : 'rgba(255,255,255,0.4)', 
                                            background: selectedTokenKey ? 'rgba(22,119,255,0.1)' : 'rgba(255,255,255,0.03)',
                                            border: selectedTokenKey ? '1px solid rgba(22,119,255,0.2)' : 'none'
                                        }} 
                                    />
                                </Tooltip>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <Button 
                                    type="primary" 
                                    disabled={!currentModel || !prompt.trim() || generating}
                                    loading={generating}
                                    onClick={handleGenerate}
                                    icon={generating ? undefined : <PlayCircleOutlined />}
                                    style={{
                                        height: 38, borderRadius: 19, padding: '0 20px', fontWeight: 500,
                                        background: currentModel && prompt.trim() && !generating ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'rgba(255,255,255,0.03)',
                                        color: currentModel && prompt.trim() ? '#fff' : 'rgba(255,255,255,0.3)',
                                        border: 'none', boxShadow: currentModel && prompt.trim() && !generating ? '0 4px 15px rgba(102,126,234,0.4)' : 'none'
                                    }}
                                >
                                    {generating ? '生成中...' : 'Run ⌘ ↵'}
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
                <div style={{ padding: '24px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.03)', display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                   <Button 
                       type="text" shape="circle" icon={<CloseOutlined />} 
                       onClick={() => setIsSettingsOpen(false)}
                       style={{ color: 'rgba(255,255,255,0.5)', background: 'transparent' }} 
                   />
                </div>
                
                <div style={{ flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
                    {/* 模型选择卡片 */}
                    <div>
                        <div 
                            onClick={() => setIsModelDrawerVisible(true)}
                            className="studio-model-card"
                            style={{ 
                                background: '#202124', borderRadius: 12, padding: '16px', 
                                border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer',
                                transition: 'all 0.2s ease', position: 'relative'
                            }}
                        >
                            <div style={{ color: '#E8eaed', fontSize: 17, fontWeight: 500, marginBottom: 8, paddingRight: 24 }}>
                                {currentModel?.name || '选择模型...'}
                            </div>
                            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                {currentModel?.scheme_name 
                                  ? `${currentModel.scheme_name} · ${currentModel.model_id}`
                                  : '选择适合的生成模型来处理你的工作流需求。'}
                            </div>
                            <div style={{ position: 'absolute', right: 16, top: 16, color: 'rgba(255,255,255,0.4)' }}><DownOutlined /></div>
                        </div>
                    </div>

                    {/* 动态参数面板 — 根据模型绑定的方案渲染 */}
                    {currentModel?.params && currentModel.params.length > 0 && (
                      currentModel.params.map(param => renderParamControl(param))
                    )}

                    {/* 无参数时的提示 */}
                    {currentModel && (!currentModel.params || currentModel.params.length === 0) && (
                      <div style={{ textAlign: 'center', padding: '20px 0' }}>
                        <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>该模型未绑定体验方案，无可配置参数</Text>
                      </div>
                    )}

                    {!currentModel && (
                      <div style={{ textAlign: 'center', padding: '20px 0' }}>
                        <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>请先选择一个模型</Text>
                      </div>
                    )}
                </div>
            </div>
        </Sider>

        {/* 模型全景选择器抽屉 */}
        <Drawer
            title={<span style={{ fontSize: 18, fontWeight: 600, color: '#e8eaed' }}>Model selection</span>}
            open={isModelDrawerVisible}
            onClose={() => setIsModelDrawerVisible(false)}
            placement="right"
            width={480}
            mask={false}
            rootClassName="studio-model-drawer"
            closeIcon={<CloseOutlined style={{ color: '#e8eaed' }} />}
            style={{ background: '#1c1c1f', borderLeft: '1px solid rgba(255,255,255,0.06)' }}
            getContainer={false}
        >
            <div>
                <Input 
                    size="large" prefix={<SearchOutlined style={{ color: 'rgba(255,255,255,0.4)', paddingRight: 8 }} />} 
                    placeholder="Search for a model" 
                    value={searchModelKeyword} onChange={e => setSearchModelKeyword(e.target.value)}
                    style={{ background: '#131416', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8 }}
                />
            </div>

            {/* 模型列表 */}
            <div style={{ height: 500, overflowY: 'auto', paddingRight: '4px', marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {modelsInCategory.length === 0 ? (
                    <div style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: '60px 0' }}>该类别下暂无可体验的模型。</div>
                ) : (
                    modelsInCategory.map(model => (
                        <div 
                            key={model.mid}
                            className="studio-model-list-item"
                            onClick={() => handleSelectModel(model.mid)}
                            style={{ 
                                background: selectedMid === model.mid ? 'rgba(22,119,255,0.06)' : '#1c1c1f', 
                                padding: '16px 20px', borderRadius: 12,
                                border: selectedMid === model.mid ? '1px solid rgba(22,119,255,0.3)' : '1px solid rgba(255,255,255,0.03)', 
                                cursor: 'pointer', display: 'flex', gap: 16
                            }}
                        >
                            <div style={{ fontSize: 24, padding: 4, opacity: 0.8, color: '#A2C1FF' }}>
                                {getCategoryIcon(activeCategory, true)}
                            </div>
                            
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flex: 1, flexWrap: 'wrap' }}>
                                        <div style={{ color: '#E8eaed', fontSize: 16, fontWeight: 500, wordBreak: 'break-word', lineHeight: 1.4 }}>{model.name}</div>
                                    </div>
                                </div>
                                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 4 }}>ID: {model.model_id}</div>
                                
                                {model.scheme_name && (
                                  <div style={{ marginTop: 8 }}>
                                    <Tag color="blue" style={{ borderRadius: 12, fontSize: 11 }}>{model.scheme_name}</Tag>
                                  </div>
                                )}
                                
                                <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
                                    <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>
                                        <DollarOutlined style={{ marginRight: 6 }} />
                                        按量计费
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </Drawer>

        {/* 关联付费 API 密钥 Modal */}
        <Modal
            title="关联付费 API 密钥"
            open={isTokenModalVisible}
            onCancel={() => setIsTokenModalVisible(false)}
            footer={null}
            width={480}
            styles={{
                content: { backgroundColor: '#1E1F22', border: '1px solid rgba(255,255,255,0.08)' },
                header: { backgroundColor: '#1E1F22', borderBottom: '1px solid rgba(255,255,255,0.08)' },
                title: { color: '#E8EAED', fontWeight: 500 }
            }}
            closeIcon={<CloseOutlined style={{ color: 'rgba(255,255,255,0.45)' }} />}
        >
            <div style={{ maxHeight: 400, overflowY: 'auto', padding: '12px 0' }}>
                {apiTokens.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.45)', padding: '60px 0' }}>
                        暂无可用的接口密钥，请先在「接口令牌」页创建
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {apiTokens.map(t => (
                            <div 
                                key={t.token_key}
                                onClick={() => {
                                    setSelectedTokenKey(t.token_key);
                                    setIsTokenModalVisible(false);
                                    message.success('已切换当前调用的令牌密钥');
                                }}
                                style={{
                                    padding: '16px',
                                    borderRadius: 8,
                                    background: selectedTokenKey === t.token_key ? 'rgba(22,119,255,0.1)' : 'rgba(255,255,255,0.02)',
                                    border: `1px solid ${selectedTokenKey === t.token_key ? '#1677ff' : 'rgba(255,255,255,0.06)'}`,
                                    cursor: 'pointer',
                                    transition: 'all 0.3s'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <span style={{ fontWeight: 500, color: '#E8EAED', fontSize: 15, marginBottom: 4 }}>{t.name}</span>
                                        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', fontFamily: 'monospace' }}>
                                            {t.token_key.substring(0, 12)}...{t.token_key.substring(t.token_key.length - 6)}
                                        </span>
                                    </div>
                                    {selectedTokenKey === t.token_key && (
                                        <CheckCircleOutlined style={{ color: '#1677ff', fontSize: 18 }} />
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </Modal>

      </Layout>
    </ConfigProvider>
  );
};

export default Playground;
