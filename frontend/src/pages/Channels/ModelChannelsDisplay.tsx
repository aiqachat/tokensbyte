/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import React, { useEffect, useState } from 'react';
import { Card, Typography, List, Spin, Button, Space, Tooltip, Input, Dropdown, Popconfirm, message } from 'antd';
import { ArrowLeftOutlined, AppstoreOutlined, ApiOutlined, SearchOutlined, CloseOutlined, PlusOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import request from '../../utils/request';
import type { Channel, ModelModel } from '../../types';
import SmartSvgIcon from '../../components/SmartSvgIcon';
import { Image as ImageIcon, Video, AudioLines, MessageSquare, Cuboid, ListOrdered, Sparkles, LayoutGrid } from 'lucide-react';

const { Title, Text } = Typography;

interface ModelChannelGroup {
  model: string;
  modelName: string;
  channels: Channel[];
  typeId?: number;
  typeName?: string;
  typeLogo?: string;
}

const styles = `
.shadcn-card {
  background-color: var(--ant-color-bg-container, #ffffff);
  border: 1px solid var(--ant-color-border, #e2e8f0);
  border-radius: 8px;
  padding: 12px;
  transition: all 0.2s ease-in-out;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.02);
  height: 100%;
  display: flex;
  flex-direction: column;
}
.shadcn-card:hover {
  box-shadow: 0 4px 12px 0 rgba(0, 0, 0, 0.05);
  border-color: var(--ant-color-text, #09090b);
}
.shadcn-model-header {
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--ant-color-border-secondary, #f0f0f0);
}
.shadcn-model-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--ant-color-text, #09090b);
  display: flex;
  align-items: flex-start;
  gap: 6px;
  line-height: 1.3;
  word-break: break-all;
}
.shadcn-model-name-text {
  word-wrap: break-word;
  white-space: normal;
  word-break: break-all;
}
.shadcn-model-id-badge {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 10px;
  background-color: var(--ant-color-fill-alter, #f4f4f5);
  color: var(--ant-color-text-secondary, #71717a);
  padding: 1px 5px;
  border-radius: 4px;
  margin-top: 4px;
  display: inline-block;
  word-break: break-all;
  white-space: normal;
}
.shadcn-model-type-badge {
  font-size: 10px;
  background-color: var(--ant-color-fill-secondary, #e4e4e7);
  color: var(--ant-color-text-secondary, #71717a);
  padding: 1px 5px;
  border-radius: 4px;
  margin-top: 4px;
  display: inline-block;
  font-weight: 500;
}
.shadcn-channel-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.shadcn-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 4px;
  transition: all 0.15s ease;
  cursor: pointer;
  position: relative;
}
.shadcn-pill:hover {
  border-color: var(--ant-color-text, #09090b);
  background-color: var(--ant-color-fill-alter, #f4f4f5);
}
.shadcn-pill.active {
  background-color: var(--ant-color-fill-secondary, #f4f4f5);
  color: var(--ant-color-text, #09090b);
  border: 1px solid var(--ant-color-border, #e4e4e7);
}
.shadcn-pill.disabled {
  background-color: transparent;
  color: var(--ant-color-text-quaternary, #a1a1aa);
  border: 1px dashed var(--ant-color-border-secondary, #e4e4e7);
  opacity: 0.6;
}
.shadcn-pill-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background-color: var(--ant-color-text, #09090b);
}
.shadcn-ha-badge {
  font-size: 8px;
  font-weight: 700;
  background-color: var(--ant-color-text, #09090b);
  color: var(--ant-color-bg-container, #ffffff);
  padding: 0px 3px;
  border-radius: 3px;
  line-height: 1.1;
  text-transform: uppercase;
  margin-left: 2px;
}
.shadcn-pill.disabled .shadcn-ha-badge {
  background-color: var(--ant-color-fill-secondary, #e4e4e7);
  color: var(--ant-color-text-quaternary, #a1a1aa);
}

.shadcn-pill .shadcn-pill-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  width: 0;
  overflow: hidden;
  transition: all 0.15s ease-in-out;
  cursor: pointer;
}
.shadcn-pill:hover .shadcn-pill-close {
  opacity: 0.5;
  width: 9px;
  margin-left: 4px;
}
.shadcn-pill-close:hover {
  opacity: 1 !important;
  color: var(--ant-color-error, #ff4d4f);
}

/* Filter pills styles */
.shadcn-filter-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.shadcn-filter-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 500;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--ant-color-border, #e2e8f0);
  background-color: transparent;
  color: var(--ant-color-text-secondary, #71717a);
  cursor: pointer;
  transition: all 0.2s;
  user-select: none;
  line-height: 1.2;
}
.shadcn-filter-pill:hover {
  background-color: var(--ant-color-fill-alter, #f4f4f5);
  color: var(--ant-color-text, #09090b);
}
.shadcn-filter-pill.active {
  background-color: var(--ant-color-text, #09090b);
  color: var(--ant-color-bg-container, #ffffff);
  border-color: var(--ant-color-text, #09090b);
}
`;

const ModelChannelsDisplay: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ModelChannelGroup[]>([]);
  const [allChannels, setAllChannels] = useState<Channel[]>([]);
  const [modelTypes, setModelTypes] = useState<any[]>([]);
  const [selectedType, setSelectedType] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();
  const adminPath = localStorage.getItem('tokensbyte_admin_path') || 'admin1688';

  const fetchData = async () => {
    setLoading(true);
    try {
      const [channelsResp, modelsResp, typesResp] = await Promise.all([
        request.get('/channels') as unknown as Promise<{ data: Channel[] }>,
        request.get('/models') as unknown as Promise<{ data: ModelModel[] }>,
        request.get('/model-types') as Promise<any>
      ]);
      
      const channels = channelsResp.data || [];
      const models = modelsResp.data || [];
      const types = Array.isArray(typesResp) ? typesResp : (typesResp as any)?.data || [];
      
      setAllChannels(channels);

      // Filter out active types to populate select filter options
      const activeTypes = types.filter((t: any) => t.is_active);
      setModelTypes(activeTypes);

      const modelNameMap: Record<string, string> = {};
      models.forEach(m => {
        modelNameMap[m.mid] = m.name;
      });

      const modelTypeMap: Record<string, { id: number, name: string, logo: string }> = {};
      models.forEach(m => {
        if (m.type_id) {
          const t = types.find((type: any) => type.id === m.type_id);
          if (t) {
            modelTypeMap[m.mid] = { id: t.id, name: t.name, logo: t.logo || '' };
          }
        }
      });
      
      const modelMap: Record<string, Channel[]> = {};
      models.forEach(m => {
        modelMap[m.mid] = [];
      });
      channels.forEach(channel => {
        if (Array.isArray(channel.models)) {
          channel.models.forEach(model => {
            if (!modelMap[model]) {
              modelMap[model] = [];
            }
            modelMap[model].push(channel);
          });
        }
      });

      const groupedData = Object.keys(modelMap).map(model => {
        const typeInfo = modelTypeMap[model];
        return {
          model,
          modelName: modelNameMap[model] || model,
          channels: modelMap[model].sort((a, b) => a.name.localeCompare(b.name)),
          typeId: typeInfo?.id,
          typeName: typeInfo?.name,
          typeLogo: typeInfo?.logo
        };
      }).filter(item => item.channels.length > 0)
      .sort((a, b) => {
        const nameA = a.modelName.toLowerCase();
        const nameB = b.modelName.toLowerCase();
        return nameA.localeCompare(nameB, 'zh-CN', { numeric: true });
      });

      setData(groupedData);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredData = data.filter(item => {
    const matchSearch = item.model.toLowerCase().includes(searchQuery.toLowerCase()) || 
                        item.modelName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchType = !selectedType || String(item.typeId) === selectedType;
    return matchSearch && matchType;
  });

  const handleRemoveModelFromChannel = async (channel: Channel, modelId: string) => {
    const currentModels = Array.isArray(channel.models) ? channel.models : [];
    const updatedModels = currentModels.filter(m => m !== modelId);
    
    setLoading(true);
    try {
      await request.put(`/channels/${channel.id}`, { models: updatedModels });
      message.success(`已成功从渠道 [${channel.name}] 中移除了该模型`);
      await fetchData();
    } catch (e) {
      console.error(e);
      message.error('操作失败');
      setLoading(false);
    }
  };

  const handleAddModelToChannel = async (channel: Channel, modelId: string) => {
    const currentModels = Array.isArray(channel.models) ? channel.models : [];
    if (currentModels.includes(modelId)) return;
    
    const updatedModels = [...currentModels, modelId];
    
    setLoading(true);
    try {
      await request.put(`/channels/${channel.id}`, { models: updatedModels });
      message.success(`已成功为渠道 [${channel.name}] 绑定了该模型`);
      await fetchData();
    } catch (e) {
      console.error(e);
      message.error('操作失败');
      setLoading(false);
    }
  };

  const getUnassociatedChannels = (modelId: string) => {
    return allChannels.filter(c => {
      const models = Array.isArray(c.models) ? c.models : [];
      return !models.includes(modelId);
    });
  };

  const renderModelTypeIcon = (typeName?: string, typeLogo?: string) => {
    if (!typeName) return <AppstoreOutlined style={{ color: 'var(--ant-color-text-secondary)', marginTop: '2px' }} />;
    
    const lowerName = typeName.toLowerCase();
    const iconStyle = { color: 'var(--ant-color-text-secondary)', width: 14, height: 14, marginTop: '2px', flexShrink: 0 };
    
    if (lowerName.includes('视频增强') || lowerName.includes('videoenhance') || lowerName.includes('video-enhance') || lowerName.includes('video_enhance')) return <Sparkles style={iconStyle} />;
    if (lowerName.includes('图片') || lowerName.includes('image')) return <ImageIcon style={iconStyle} />;
    if (lowerName.includes('视频') || lowerName.includes('video')) return <Video style={iconStyle} />;
    if (lowerName.includes('音频') || lowerName.includes('audio')) return <AudioLines style={iconStyle} />;
    if (lowerName.includes('聊天') || lowerName.includes('chat') || lowerName.includes('text')) return <MessageSquare style={iconStyle} />;
    if (lowerName.includes('embedding') || lowerName.includes('向量')) return <Cuboid style={iconStyle} />;
    if (lowerName.includes('rerank') || lowerName.includes('排序')) return <ListOrdered style={iconStyle} />;
    
    if (typeLogo) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, flexShrink: 0, marginTop: '2px' }}>
          <SmartSvgIcon 
            src={`/assets/icons/lobe/${typeLogo}.svg`} 
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      );
    }
    
    return <AppstoreOutlined style={{ color: 'var(--ant-color-text-secondary)', marginTop: '2px' }} />;
  };

  const renderFilterIcon = (name: string, logo?: string, isSelected?: boolean) => {
    const iconStyle = { color: 'inherit', width: 13, height: 13, flexShrink: 0 };
    if (name === '全部') return <LayoutGrid style={iconStyle} />;
    
    const lowerName = name.toLowerCase();
    if (lowerName.includes('视频增强') || lowerName.includes('videoenhance') || lowerName.includes('video-enhance') || lowerName.includes('video_enhance')) return <Sparkles style={iconStyle} />;
    if (lowerName.includes('图片') || lowerName.includes('image')) return <ImageIcon style={iconStyle} />;
    if (lowerName.includes('视频') || lowerName.includes('video')) return <Video style={iconStyle} />;
    if (lowerName.includes('音频') || lowerName.includes('audio')) return <AudioLines style={iconStyle} />;
    if (lowerName.includes('聊天') || lowerName.includes('chat') || lowerName.includes('text')) return <MessageSquare style={iconStyle} />;
    if (lowerName.includes('embedding') || lowerName.includes('向量')) return <Cuboid style={iconStyle} />;
    if (lowerName.includes('rerank') || lowerName.includes('排序')) return <ListOrdered style={iconStyle} />;
    
    if (logo) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 13, height: 13, flexShrink: 0 }}>
          <SmartSvgIcon 
            src={`/assets/icons/lobe/${logo}.svg`} 
            style={{ width: '100%', height: '100%', objectFit: 'contain', filter: (isSelected && document.documentElement.getAttribute('data-theme') !== 'dark') ? 'brightness(0) invert(1)' : undefined }}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      );
    }
    return <AppstoreOutlined style={iconStyle} />;
  };

  return (
    <Card variant="borderless" style={{ padding: 0 }} styles={{ body: { padding: 8 } }}>
      <style>{styles}</style>
      
      <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Button icon={<ArrowLeftOutlined />} size="small" onClick={() => navigate(`/${adminPath}/channels`)}>
              返回
            </Button>
            <div>
              <Title level={5} style={{ margin: 0 }}>模型对应可用渠道</Title>
              <Text type="secondary" style={{ fontSize: 12 }}>
                全局概览：清晰查看每个模型当前已分配的所有可用渠道
              </Text>
            </div>
          </div>
          <Space wrap size={12}>
            <div className="shadcn-filter-pills">
              <div 
                className={`shadcn-filter-pill ${!selectedType ? 'active' : ''}`}
                onClick={() => setSelectedType('')}
              >
                {renderFilterIcon('全部', '', !selectedType)}
                全部
              </div>
              {modelTypes.map((t: any) => {
                const isSelected = selectedType === String(t.id);
                return (
                  <div 
                    key={t.id}
                    className={`shadcn-filter-pill ${isSelected ? 'active' : ''}`}
                    onClick={() => setSelectedType(String(t.id))}
                  >
                    {renderFilterIcon(t.name, t.logo, isSelected)}
                    {t.name}
                  </div>
                );
              })}
            </div>
            <Input.Search
              placeholder="搜索模型名称或ID..."
              allowClear
              size="small"
              onChange={e => setSearchQuery(e.target.value)}
              style={{ width: 180 }}
              prefix={<SearchOutlined style={{ color: 'var(--ant-color-text-quaternary)' }} />}
            />
          </Space>
        </div>
      </div>

      <Spin spinning={loading}>
        <List
          grid={{ gutter: 12, xs: 1, sm: 2, md: 3, lg: 4, xl: 4, xxl: 5 }}
          dataSource={filteredData}
          pagination={{
            defaultPageSize: 50,
            showSizeChanger: true,
            pageSizeOptions: ['20', '50', '100', '200'],
            showTotal: (total) => `共 ${total} 个模型`,
            size: 'small',
            style: { textAlign: 'right', marginTop: 16 }
          }}
          renderItem={(item) => {
            const unassociated = getUnassociatedChannels(item.model);
            return (
              <List.Item style={{ marginBottom: 12 }}>
                <div className="shadcn-card">
                  <div className="shadcn-model-header">
                    <div className="shadcn-model-name">
                      {renderModelTypeIcon(item.typeName, item.typeLogo)}
                      <span className="shadcn-model-name-text">{item.modelName}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      <Tooltip title="内部模型 ID (Model ID)">
                        <div className="shadcn-model-id-badge">{item.model}</div>
                      </Tooltip>
                      {item.typeName && (
                        <div className="shadcn-model-type-badge">{item.typeName}</div>
                      )}
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <Text type="secondary" style={{ fontSize: 11, fontWeight: 500 }}>
                      支持渠道 ({item.channels.length})
                    </Text>
                  </div>

                  <div className="shadcn-channel-pills">
                    {item.channels.map(channel => {
                      const isActive = channel.status === 1;
                      const isHa = channel.provider_type === 'high_availability_group';
                      return (
                        <Tooltip 
                          key={channel.id} 
                          title={
                            isHa 
                              ? (isActive 
                                  ? (item.channels.length > 1 ? '高可用虚拟渠道组 (悬浮点击移除该模型)' : '高可用虚拟渠道组 (必须至一个渠道)')
                                  : '高可用虚拟渠道组已禁用')
                              : (isActive 
                                  ? (item.channels.length > 1 ? '渠道已启用 (悬浮点击移除该模型)' : '渠道启用 (必须至一个渠道)')
                                  : '渠道已禁用')
                          }
                        >
                          <span 
                            className={`shadcn-pill ${isActive ? 'active' : 'disabled'}`}
                            onClick={() => navigate(`/${adminPath}/channels?edit=${channel.id}`, { state: { from: 'model-display' } })}
                          >
                            {isActive && <div className="shadcn-pill-dot" />}
                            <ApiOutlined style={{ fontSize: 9, opacity: 0.6 }} />
                            {channel.name}
                            {isHa && <span className="shadcn-ha-badge">HA</span>}
                            
                            {/* Close button to remove the model (only if there are multiple channels) */}
                            {item.channels.length > 1 && (
                              <Popconfirm
                                title={`确定从渠道 [${channel.name}] 中移除模型吗？`}
                                onConfirm={() => handleRemoveModelFromChannel(channel, item.model)}
                                okText="确定"
                                cancelText="取消"
                              >
                                <span 
                                  className="shadcn-pill-close"
                                  onClick={e => e.stopPropagation()}
                                >
                                  <CloseOutlined style={{ fontSize: 8 }} />
                                </span>
                              </Popconfirm>
                            )}
                          </span>
                        </Tooltip>
                      );
                    })}

                    {/* Bind channel Dropdown */}
                    {unassociated.length > 0 && (
                      <Dropdown
                        menu={{
                          items: unassociated.map(c => ({
                            key: c.id,
                            label: c.name,
                            onClick: () => handleAddModelToChannel(c, item.model)
                          }))
                        }}
                        trigger={['click']}
                      >
                        <span 
                          className="shadcn-pill active" 
                          style={{ 
                            cursor: 'pointer', 
                            borderStyle: 'dashed',
                            backgroundColor: 'transparent',
                            color: 'var(--ant-color-text-secondary)'
                          }}
                        >
                          <PlusOutlined style={{ fontSize: 9 }} />
                          绑定渠道
                        </span>
                      </Dropdown>
                    )}
                  </div>
                </div>
              </List.Item>
            );
          }}
        />
      </Spin>
    </Card>
  );
};

export default ModelChannelsDisplay;
