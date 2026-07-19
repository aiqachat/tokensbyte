import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Table, Typography, Tag, Button, Space, message, Row, Col, Divider, Select, Tooltip } from 'antd';
import { SyncOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import request from '../../utils/request';
import type { Channel } from '../../types';

const { Title, Text } = Typography;

type TestStatus = 'idle' | 'testing' | 'success' | 'error';
interface TestResult {
  status: TestStatus;
  latency?: number;
  message?: string;
  request_data?: any;
  response_data?: any;
  curl_command?: string;
  timestamp?: string;
}

const ChannelTest: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const adminPath = localStorage.getItem('tokensbyte_admin_path') || 'admin1688';
    const [channel, setChannel] = useState<Channel | null>(null);
    const [loading, setLoading] = useState(true);
    const [testStatuses, setTestStatuses] = useState<Record<string, TestResult>>({});
    const [selectedTestModels, setSelectedTestModels] = useState<React.Key[]>([]);
    
    // New states for Rules evaluation
    const [globalModels, setGlobalModels] = useState<Record<string, any>>({});
    const [forwardRules, setForwardRules] = useState<Record<number, any>>({});
    const [selectedRules, setSelectedRules] = useState<Record<string, number>>({});
    
    const [activeModelLog, setActiveModelLog] = useState<string | null>(null);
    const [batchTesting, setBatchTesting] = useState(false);

    // 高可用子渠道列表相关状态
    const [subChannels, setSubChannels] = useState<Channel[]>([]);
    const [isHaMode, setIsHaMode] = useState<boolean>(false);
    const [expandedRowKeys, setExpandedRowKeys] = useState<React.Key[]>([]);

    useEffect(() => {
        const fetchChannelData = async () => {
            try {
                // Parallel fetch resources needed for UI mappings
                const [channelResp, modelsResp, configsResp, rulesResp] = await Promise.all([
                    request.get('/channels') as unknown as Promise<{ data: Channel[] }>,
                    request.get('/models') as unknown as Promise<{ data: any[] }>,
                    request.get('/channel-configs') as unknown as Promise<{ data: any[] }>,
                    request.get('/forward-rules') as unknown as Promise<any[]>
                ]);
                
                const modMap: Record<string, any> = {};
                modelsResp.data.forEach(m => { 
                    modMap[String(m.model_id)] = m; 
                    if (m.mid) {
                        modMap[String(m.mid)] = m;
                    }
                });
                setGlobalModels(modMap);

                const rMap: Record<number, any> = {};
                rulesResp.forEach(r => { rMap[r.id] = r; });
                setForwardRules(rMap);

                const target = channelResp.data.find(c => c.id === Number(id));
                if (target) {
                    setChannel(target);

                    const isHa = target.provider_type === 'high_availability_group';
                    setIsHaMode(isHa);

                    let subChs: Channel[] = [];
                    if (isHa) {
                        let parsed: any = {};
                        try {
                            parsed = target.config ? (typeof target.config === 'string' ? JSON.parse(target.config) : target.config) : {};
                        } catch {}
                        const subIds = parsed.sub_channels || [];
                        subChs = (configsResp.data || []).filter(c => subIds.includes(c.id));
                        setSubChannels(subChs);
                    }
                    
                    const initialStatuses: Record<string, TestResult> = {};
                    const initSelRules: Record<string, number> = {};
                    
                    target.models.forEach(m => {
                        if (isHa) {
                            subChs.forEach(sc => {
                                initialStatuses[`${m}_${sc.id}`] = { status: 'idle' };
                            });
                        } else {
                            initialStatuses[m] = { status: 'idle' };
                        }

                        const gModel = modMap[String(m)];
                        if (gModel && gModel.forward_rule_ids) {
                            try {
                                const rIds = JSON.parse(gModel.forward_rule_ids);
                                if (Array.isArray(rIds) && rIds.length > 0) {
                                    initSelRules[m] = rIds[0];
                                }
                            } catch(e) {}
                        }
                    });
                    setTestStatuses(initialStatuses);
                    setSelectedRules(initSelRules);
                    if (isHa) {
                        setExpandedRowKeys(target.models);
                    }
                } else {
                    message.error('渠道并未找到，请检查！');
                    navigate(`/${adminPath}/channels`);
                }
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        fetchChannelData();
    }, [id, navigate]);

    const runSingleModelTest = async (channelId: number, model: string, ruleId?: number, autoFocus: boolean = true, statusKey?: string, subChannelId?: number) => {
        const key = statusKey || model;
        if (autoFocus) {
            setActiveModelLog(key);
        }
        setTestStatuses(prev => ({ ...prev, [key]: { status: 'testing', timestamp: new Date().toISOString() } }));
        try {
            const gModel = globalModels[String(model)];
            const actualModelId = gModel ? gModel.model_id : model;

            const payload: any = { model: actualModelId, forward_rule_id: ruleId };
            if (subChannelId) payload.sub_channel_id = subChannelId;
            const resp = await (request.post(`/channels/${channelId}/test`, payload) as unknown as Promise<{ success: boolean; err_msg?: string; latency?: number; request_data?: any; response_data?: any; curl_command?: string }>);
            if (resp.success) {
                setTestStatuses(prev => ({ 
                    ...prev, 
                    [key]: { status: 'success', latency: resp.latency, request_data: resp.request_data, response_data: resp.response_data, curl_command: resp.curl_command, timestamp: new Date().toISOString() } 
                }));
            } else {
                setTestStatuses(prev => ({ 
                    ...prev, 
                    [key]: { status: 'error', message: resp.err_msg, latency: resp.latency, request_data: resp.request_data, response_data: resp.response_data, curl_command: resp.curl_command, timestamp: new Date().toISOString() } 
                }));
            }
        } catch (e: any) {
            setTestStatuses(prev => ({ 
                ...prev, 
                [key]: { status: 'error', message: e.message || '网关连接断开或超时', timestamp: new Date().toISOString() } 
            }));
        }
    };

    const handleBatchTest = async () => {
        if (!channel || selectedTestModels.length === 0) return;
        
        setBatchTesting(true);
        try {
            const promises: Promise<void>[] = [];
            
            if (isHaMode) {
                if (subChannels.length > 0) {
                    setActiveModelLog(`${selectedTestModels[0]}_${subChannels[0].id}`);
                }
                
                selectedTestModels.forEach(modelKey => {
                    const model = modelKey as string;
                    subChannels.forEach(sc => {
                        promises.push(runSingleModelTest(channel!.id, model, selectedRules[model], false, `${model}_${sc.id}`, sc.id));
                    });
                });
            } else {
                setActiveModelLog(selectedTestModels[0] as string);
                selectedTestModels.forEach(modelKey => {
                    const model = modelKey as string;
                    promises.push(runSingleModelTest(channel.id, model, selectedRules[model], false));
                });
            }

            await Promise.all(promises);
            message.success('勾选模型的批量拨测已完成');
        } catch (error) {
            message.error('批量拨测发生异常');
        } finally {
            setBatchTesting(false);
        }
    };

    // UI renderer for logs
    const _isLight = document.documentElement.getAttribute('data-theme') !== 'dark';
    const activeLogData = activeModelLog ? testStatuses[activeModelLog] : null;

    let displayLogTarget = activeModelLog || '';
    let displaySubChannelName = '';
    if (activeModelLog && isHaMode) {
        const parts = activeModelLog.split('_');
        if (parts.length >= 2) {
            const modelName = parts.slice(0, -1).join('_');
            const subId = Number(parts[parts.length - 1]);
            displayLogTarget = modelName;
            const sc = subChannels.find(c => c.id === subId);
            if (sc) {
                displaySubChannelName = ` (物理上游: ${sc.name})`;
            }
        }
    }

    return (
        <Card bordered={false}>
            <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 16 }}>
                <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/${adminPath}/channels`)}>返回列表</Button>
                <div>
                    <Title level={3} style={{ margin: 0 }}>渠道日志抓取分析：{channel?.name}</Title>
                    <Text type="secondary" style={{ marginTop: 4, display: 'block' }}>Base URL: {channel?.base_url}</Text>
                </div>
            </div>
            
            <Row gutter={24}>
                {/* Left Panel: Models Table */}
                <Col xs={24} lg={12} xl={14} style={{ marginBottom: 24 }}>
                    <Card size="small" title="模型拨测队列" extra={
                        <Button type="primary" onClick={handleBatchTest} disabled={selectedTestModels.length === 0 || batchTesting} loading={batchTesting}>
                            {batchTesting ? '批量拨测中...' : `批量拨测 ${selectedTestModels.length} 个模型`}
                        </Button>
                    }>
                       <Table
                            dataSource={channel?.models.map(m => ({ model: m })) || []}
                            rowKey="model"
                            loading={loading}
                            pagination={false}
                            scroll={{ x: 'max-content', y: 'calc(100vh - 350px)' }}
                            onRow={(record) => {
                                return {
                                    onClick: () => {
                                        if (isHaMode) {
                                            if (subChannels.length > 0) {
                                                setActiveModelLog(`${record.model}_${subChannels[0].id}`);
                                            }
                                        } else {
                                            setActiveModelLog(record.model);
                                        }
                                    },
                                    style: { cursor: 'pointer' }
                                };
                            }}
                            rowSelection={{
                                selectedRowKeys: selectedTestModels,
                                onChange: (newSelectedRowKeys) => setSelectedTestModels(newSelectedRowKeys),
                            }}
                            expandable={isHaMode ? {
                                expandedRowKeys: expandedRowKeys,
                                onExpandedRowsChange: (keys) => setExpandedRowKeys(keys as React.Key[]),
                                expandedRowRender: (record) => {
                                    return (
                                        <div style={{ padding: '8px 12px', background: _isLight ? 'rgba(0,0,0,0.01)' : 'rgba(255,255,255,0.01)', borderRadius: 6, border: _isLight ? '1px dashed rgba(0,0,0,0.08)' : '1px dashed rgba(255,255,255,0.08)' }}>
                                            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 'bold' }}>
                                                ↳ 物理上游子通道拨测队列 ({subChannels.length})
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                {subChannels.map(sc => {
                                                    const statusKey = `${record.model}_${sc.id}`;
                                                    const st = testStatuses[statusKey];
                                                    const isTesting = st?.status === 'testing';
                                                    
                                                    return (
                                                        <div 
                                                            key={sc.id} 
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setActiveModelLog(statusKey);
                                                            }}
                                                            style={{ 
                                                                display: 'flex', 
                                                                justifyContent: 'space-between', 
                                                                alignItems: 'center', 
                                                                padding: '6px 12px', 
                                                                background: activeModelLog === statusKey ? (_isLight ? 'rgba(22,119,255,0.08)' : 'rgba(22,119,255,0.15)') : 'transparent', 
                                                                border: activeModelLog === statusKey ? '1px solid #91caff' : (_isLight ? '1px solid #e5e4e7' : '1px solid rgba(255,255,255,0.08)'),
                                                                borderRadius: 6,
                                                                cursor: 'pointer',
                                                                transition: 'all 0.15s'
                                                            }}
                                                        >
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, flexWrap: 'wrap' }}>
                                                                <span style={{ fontSize: 12, fontWeight: 600 }}>{sc.name}</span>
                                                                <span style={{ fontSize: 10, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                                                    {sc.provider_type ? `(${sc.provider_type})` : ''} {(sc as any).yid ? `YID: ${(sc as any).yid}` : `ID: ${sc.id}`}
                                                                </span>
                                                                <Space size={4} style={{ marginLeft: 8 }}>
                                                                    <Tag color="cyan" style={{ margin: 0, fontSize: 10, borderRadius: 4 }}>倍率: {(sc as any).rate ?? 1}x</Tag>
                                                                    <Tag color="blue" style={{ margin: 0, fontSize: 10, borderRadius: 4 }}>请求优先级: {(sc as any).priority ?? 0}</Tag>
                                                                    <Tag color="cyan" style={{ margin: 0, fontSize: 10, borderRadius: 4 }}>请求权重: {(sc as any).weight ?? 1}</Tag>
                                                                </Space>
                                                            </div>
                                                            
                                                            <Space size={8} style={{ flexShrink: 0 }}>
                                                                {!st || st.status === 'idle' ? (
                                                                    <Tag color="default" style={{ margin: 0, fontSize: 10, borderRadius: 3 }}>未开始</Tag>
                                                                ) : isTesting ? (
                                                                    <Tag color="processing" icon={<SyncOutlined spin />} style={{ margin: 0, fontSize: 10, borderRadius: 3 }}>拨测中</Tag>
                                                                ) : st.status === 'success' ? (
                                                                    <Tag color="success" style={{ margin: 0, fontSize: 10, borderRadius: 3 }}>成功 ({st.latency}ms)</Tag>
                                                                ) : (
                                                                    <Tooltip title={st.message}>
                                                                        <Tag color="error" style={{ margin: 0, fontSize: 10, borderRadius: 3, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                            失败: {st.message}
                                                                        </Tag>
                                                                    </Tooltip>
                                                                )}
                                                                
                                                                <Button
                                                                    size="small"
                                                                    type="dashed"
                                                                    style={{ fontSize: 11 }}
                                                                    loading={isTesting}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        runSingleModelTest(channel!.id, record.model, selectedRules[record.model], true, statusKey, sc.id);
                                                                    }}
                                                                >
                                                                    发起拨测
                                                                </Button>
                                                            </Space>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                },
                                rowExpandable: () => true,
                                defaultExpandAllRows: true,
                            } : undefined}
                            columns={[
                                {
                                    title: '接入模型',
                                    dataIndex: 'model',
                                    key: 'model',
                                    render: (text) => {
                                        const gModel = globalModels[String(text)];
                                        if (gModel) {
                                            return (
                                                <Space direction="vertical" size={0}>
                                                    <Text strong>{gModel.name || gModel.model_id}</Text>
                                                    <Tag color="blue" style={{ fontSize: 10, margin: 0, marginTop: 4, borderRadius: 3 }}>{gModel.model_id}</Tag>
                                                </Space>
                                            );
                                        }
                                        return <Text strong>{text}</Text>;
                                    }
                                },
                                {
                                    title: '探测状态',
                                    key: 'status',
                                    render: (_, record) => {
                                        if (isHaMode) {
                                            const statuses = subChannels.map(sc => testStatuses[`${record.model}_${sc.id}`]?.status);
                                            if (statuses.every(s => s === 'idle' || !s)) return <Tag color="default" style={{ borderRadius: 3 }}>未开始</Tag>;
                                            if (statuses.some(s => s === 'testing')) return <Tag color="processing" icon={<SyncOutlined spin />} style={{ borderRadius: 3 }}>拨测中</Tag>;
                                            if (statuses.every(s => s === 'success')) return <Tag color="success" style={{ borderRadius: 3 }}>全部通道成功</Tag>;
                                            if (statuses.every(s => s === 'error')) return <Tag color="error" style={{ borderRadius: 3 }}>全部通道异常</Tag>;
                                            if (statuses.some(s => s === 'error')) {
                                                const errCount = statuses.filter(s => s === 'error').length;
                                                return <Tag color="warning" style={{ borderRadius: 3 }}>部分通道异常 ({errCount}失败)</Tag>;
                                            }
                                            return <Tag color="success" style={{ borderRadius: 3 }}>部分通道成功</Tag>;
                                        }

                                        const st = testStatuses[record.model];
                                        if (!st || st.status === 'idle') return <Tag color="default" style={{ borderRadius: 3 }}>未开始</Tag>;
                                        if (st.status === 'testing') return <Tag color="processing" icon={<SyncOutlined spin />} style={{ borderRadius: 3 }}>拨测中</Tag>;
                                        if (st.status === 'success') return <Tag color="success" style={{ borderRadius: 3 }}>成功 ({st.latency}ms)</Tag>;
                                        return (
                                            <Tooltip title={st.message}>
                                                <Tag color="error" style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'middle', borderRadius: 3 }}>
                                                    失败: {st.message}
                                                </Tag>
                                            </Tooltip>
                                        );
                                    }
                                },
                                {
                                    title: '操作',
                                    key: 'action',
                                    render: (_, record) => {
                                        const gModel = globalModels[String(record.model)];
                                        let ruleOptions: {label: string, value: number}[] = [];
                                        if (gModel && gModel.forward_rule_ids) {
                                            try {
                                                const rIds = JSON.parse(gModel.forward_rule_ids);
                                                ruleOptions = rIds.map((rid: number) => {
                                                    const r = forwardRules[rid];
                                                    return r ? { label: `${r.category}: ${r.name}`, value: rid } : null;
                                                }).filter(Boolean) as {label: string, value: number}[];
                                            } catch(e) {}
                                        }

                                        const isAnySubTesting = isHaMode 
                                            ? subChannels.some(sc => testStatuses[`${record.model}_${sc.id}`]?.status === 'testing') 
                                            : testStatuses[record.model]?.status === 'testing';

                                        return (
                                            <Space direction="horizontal" size="small">
                                                {ruleOptions.length > 0 && (
                                                    <Select
                                                        size="small"
                                                        style={{ minWidth: 160 }}
                                                        placeholder="默认拨号"
                                                        value={selectedRules[record.model] || undefined}
                                                        onChange={(val) => setSelectedRules({...selectedRules, [record.model]: val})}
                                                        options={ruleOptions}
                                                        onClick={(e) => e.stopPropagation()}
                                                    />
                                                )}
                                                <Button 
                                                    size="small" 
                                                    type="dashed"
                                                    loading={isAnySubTesting}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (isHaMode) {
                                                            subChannels.forEach(sc => {
                                                                runSingleModelTest(channel!.id, record.model, selectedRules[record.model], true, `${record.model}_${sc.id}`, sc.id);
                                                            });
                                                        } else {
                                                            runSingleModelTest(channel!.id, record.model, selectedRules[record.model]);
                                                        }
                                                    }}
                                                >
                                                    {isHaMode ? '全部拨测' : '发起拨测'}
                                                </Button>
                                            </Space>
                                        );
                                    }
                                }
                            ]}
                        />
                    </Card>
                </Col>

                {/* Right Panel: Data Layout Rendering */}
                <Col xs={24} lg={12} xl={10}>
                    <Card size="small" title={activeModelLog ? `链路解包跟踪 - ${displayLogTarget}${displaySubChannelName}` : '链路解包跟踪'}>
                        {!activeModelLog ? (
                            <div style={{ padding: 40, textAlign: 'center', color: '#666', display: 'flex', flexDirection: 'column', justifyContent: 'center', height: 'calc(100vh - 350px)' }}>
                                <div style={{ fontSize: 16, marginBottom: 12 }}>等待查看底层链路</div>
                                <div>请点击左侧任一模型，或发起拨测，<br/>即可实时显示底层发出与接收的真实 Payload。</div>
                            </div>
                        ) : (
                            <div style={{
                                backgroundColor: '#1e1e1e',
                                color: '#d4d4d4',
                                padding: 16,
                                borderRadius: 8,
                                minHeight: 'calc(100vh - 310px)',
                                maxHeight: 'calc(100vh - 310px)',
                                overflowY: 'auto',
                                fontFamily: 'monospace',
                                fontSize: 13,
                            }}>
                                <div style={{ marginBottom: 16, color: '#4ec9b0', fontWeight: 'bold' }}>
                                    {`[${activeLogData?.timestamp || '队列外'}]`} 【Target】: {globalModels[String(displayLogTarget)]?.model_id || displayLogTarget}{displaySubChannelName}
                                </div>
                                
                                {activeLogData?.status === 'idle' && (
                                    <div style={{ color: '#ce9178' }}>... 等待指令，暂无建立 of TPC/HTTP 数据交换记录 ...</div>
                                )}
                                
                                {activeLogData?.status === 'testing' && (
                                    <div style={{ color: '#569cd6' }}>&gt; 正在拨号并执行网关校验... 
                                      <span style={{ color: '#9cdcfe', paddingLeft: 8, fontSize: 12 }}>(若是视频/异步任务，可能自动轮询，预计 1-3 分钟，请耐心等待)</span>
                                    </div>
                                )}

                                {(activeLogData?.status === 'success' || activeLogData?.status === 'error') && (
                                    <>
                                        <div style={{ color: '#9cdcfe', marginTop: 8 }}>### [OUTGOING] 构造的请求报文 (Request Config) ###</div>
                                        <div style={{ borderLeft: '3px solid #569cd6', marginTop: 8, marginBottom: 24, background: '#252526', padding: 12 }}>
                                           <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                                                {JSON.stringify(activeLogData.request_data || {}, null, 2)}
                                           </pre>
                                        </div>

                                        {activeLogData.curl_command && (
                                            <>
                                                <div style={{ color: '#ce9178', marginTop: 8 }}>### [CURL] 通道 REST 同构请求 (cURL Equivalent) ###</div>
                                                <div style={{ borderLeft: '3px solid #ce9178', marginTop: 8, marginBottom: 24, background: '#252526', padding: 12 }}>
                                                   <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                                                         {activeLogData.curl_command}
                                                   </pre>
                                                </div>
                                            </>
                                        )}

                                        <div style={{ color: activeLogData.status === 'success' ? '#6a9955' : '#f44336' }}>
                                            ### [INCOMING] 代理回包快照 (Response Snapshot) ###
                                            <span style={{ marginLeft: 8, background: '#333', padding: '2px 8px', borderRadius: 4 }}>
                                                Round-Trip Time: {activeLogData.latency} ms
                                                {activeLogData.response_data?._upstream_status && ` | HTTP ${activeLogData.response_data._upstream_status}`}
                                            </span>
                                        </div>
                                        <div style={{ borderLeft: `3px solid ${activeLogData.status === 'success' ? '#6a9955' : '#f44336'}`, marginTop: 8, background: '#252526', padding: 12 }}>
                                           <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                                                {JSON.stringify(activeLogData.response_data || { intercept_err: activeLogData.message }, null, 2)}
                                           </pre>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </Card>
                </Col>
            </Row>
        </Card>
    );
};

export default ChannelTest;
