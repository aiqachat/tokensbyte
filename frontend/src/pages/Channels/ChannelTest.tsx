import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Table, Typography, Tag, Button, Space, message, Row, Col, Divider, Select } from 'antd';
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
    const [channel, setChannel] = useState<Channel | null>(null);
    const [loading, setLoading] = useState(true);
    const [testStatuses, setTestStatuses] = useState<Record<string, TestResult>>({});
    const [selectedTestModels, setSelectedTestModels] = useState<React.Key[]>([]);
    
    // New states for Rules evaluation
    const [globalModels, setGlobalModels] = useState<Record<string, any>>({});
    const [forwardRules, setForwardRules] = useState<Record<number, any>>({});
    const [selectedRules, setSelectedRules] = useState<Record<string, number>>({});
    
    const [activeModelLog, setActiveModelLog] = useState<string | null>(null);

    useEffect(() => {
        const fetchChannelData = async () => {
            try {
                // Parallel fetch resources needed for UI mappings
                const [channelResp, modelsResp, rulesResp] = await Promise.all([
                    request.get('/channels') as unknown as Promise<{ data: Channel[] }>,
                    request.get('/models') as unknown as Promise<{ data: any[] }>,
                    request.get('/forward-rules') as unknown as Promise<any[]>
                ]);
                
                const modMap: Record<string, any> = {};
                modelsResp.data.forEach(m => { modMap[m.model_id] = m; });
                setGlobalModels(modMap);

                const rMap: Record<number, any> = {};
                rulesResp.forEach(r => { rMap[r.id] = r; });
                setForwardRules(rMap);

                const target = channelResp.data.find(c => c.id === Number(id));
                if (target) {
                    setChannel(target);
                    const initialStatuses: Record<string, TestResult> = {};
                    const initSelRules: Record<string, number> = {};
                    
                    target.models.forEach(m => {
                        initialStatuses[m] = { status: 'idle' };
                        const gModel = modMap[m];
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
                } else {
                    message.error('渠道并未找到，请检查！');
                    navigate('/admin0755/channels');
                }
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        fetchChannelData();
    }, [id, navigate]);

    const runSingleModelTest = async (channelId: number, model: string, ruleId?: number) => {
        setActiveModelLog(model);
        setTestStatuses(prev => ({ ...prev, [model]: { status: 'testing', timestamp: new Date().toISOString() } }));
        try {
            const resp = await (request.post(`/channels/${channelId}/test`, { model, forward_rule_id: ruleId }) as unknown as Promise<{ success: boolean; err_msg?: string; latency?: number; request_data?: any; response_data?: any; curl_command?: string }>);
            if (resp.success) {
                setTestStatuses(prev => ({ 
                    ...prev, 
                    [model]: { status: 'success', latency: resp.latency, request_data: resp.request_data, response_data: resp.response_data, curl_command: resp.curl_command, timestamp: new Date().toISOString() } 
                }));
            } else {
                setTestStatuses(prev => ({ 
                    ...prev, 
                    [model]: { status: 'error', message: resp.err_msg, latency: resp.latency, request_data: resp.request_data, response_data: resp.response_data, curl_command: resp.curl_command, timestamp: new Date().toISOString() } 
                }));
            }
        } catch (e: any) {
            setTestStatuses(prev => ({ 
                ...prev, 
                [model]: { status: 'error', message: e.message || '网关连接断开或超时', timestamp: new Date().toISOString() } 
            }));
        }
    };

    const handleBatchTest = async () => {
        if (!channel || selectedTestModels.length === 0) return;
        for (const modelKey of selectedTestModels) {
            const model = modelKey as string;
            await runSingleModelTest(channel.id, model, selectedRules[model]);
        }
        message.success('勾选模型的批量拨测已完成');
    };

    // UI renderer for logs
    const activeLogData = activeModelLog ? testStatuses[activeModelLog] : null;

    return (
        <Card bordered={false}>
            <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 16 }}>
                <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/admin0755/channels')}>返回列表</Button>
                <div>
                    <Title level={3} style={{ margin: 0 }}>渠道日志抓取分析：{channel?.name}</Title>
                    <Text type="secondary" style={{ marginTop: 4, display: 'block' }}>Base URL: {channel?.base_url}</Text>
                </div>
            </div>
            
            <Row gutter={24}>
                {/* Left Panel: Models Table */}
                <Col span={24} style={{ marginBottom: 24 }}>
                    <Card size="small" title="模型拨测队列" extra={
                        <Button type="primary" onClick={handleBatchTest} disabled={selectedTestModels.length === 0}>
                            批量拨测 {selectedTestModels.length} 个模型
                        </Button>
                    }>
                       <Table
                            dataSource={channel?.models.map(m => ({ model: m })) || []}
                            rowKey="model"
                            loading={loading}
                            pagination={false}
                            scroll={{ y: 300 }}
                            onRow={(record) => {
                                return {
                                    onClick: () => {
                                        setActiveModelLog(record.model);
                                    },
                                    style: { cursor: 'pointer' }
                                };
                            }}
                            rowSelection={{
                                selectedRowKeys: selectedTestModels,
                                onChange: (newSelectedRowKeys) => setSelectedTestModels(newSelectedRowKeys),
                            }}
                            columns={[
                                {
                                    title: '接入模型',
                                    dataIndex: 'model',
                                    key: 'model',
                                    render: (text) => <Text strong>{text}</Text>
                                },
                                {
                                    title: '探测状态',
                                    key: 'status',
                                    render: (_, record) => {
                                        const st = testStatuses[record.model];
                                        if (!st || st.status === 'idle') return <Tag color="default">未开始</Tag>;
                                        if (st.status === 'testing') return <Tag color="processing" icon={<SyncOutlined spin />}>建立连接中</Tag>;
                                        if (st.status === 'success') return <Tag color="success">成功 ({st.latency}ms)</Tag>;
                                        return <Tag color="error" style={{ whiteSpace: 'normal', maxWidth: 150 }}>失败: {st.message}</Tag>;
                                    }
                                },
                                {
                                    title: '操作',
                                    key: 'action',
                                    render: (_, record) => {
                                        const gModel = globalModels[record.model];
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

                                        return (
                                            <Space direction="horizontal" size="small">
                                                {ruleOptions.length > 0 && (
                                                    <Select
                                                        size="small"
                                                        style={{ minWidth: 180 }}
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
                                                    loading={testStatuses[record.model]?.status === 'testing'}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        runSingleModelTest(channel!.id, record.model, selectedRules[record.model]);
                                                    }}
                                                >
                                                    发起拨测
                                                </Button>
                                            </Space>
                                        );
                                    }
                                }
                            ]}
                        />
                    </Card>
                </Col>

                {/* Bottom Panel: Data Layout Rendering */}
                <Col span={24}>
                    <Card size="small" title={activeModelLog ? `链路解包跟踪 - ${activeModelLog}` : '链路解包跟踪'}>
                        {!activeModelLog ? (
                            <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>
                                点击上面任一表格行，实时显示底层发出与接收的真实 Payload
                            </div>
                        ) : (
                            <div style={{
                                backgroundColor: '#1e1e1e',
                                color: '#d4d4d4',
                                padding: 16,
                                borderRadius: 8,
                                minHeight: 450,
                                maxHeight: 450,
                                overflowY: 'auto',
                                fontFamily: 'monospace',
                                fontSize: 13,
                            }}>
                                <div style={{ marginBottom: 16, color: '#4ec9b0', fontWeight: 'bold' }}>
                                    {`[${activeLogData?.timestamp || '队列外'}]`} 【Target】: {activeModelLog}
                                </div>
                                
                                {activeLogData?.status === 'idle' && (
                                    <div style={{ color: '#ce9178' }}>... 等待指令，暂无建立的 TPC/HTTP 数据交换记录 ...</div>
                                )}
                                
                                {activeLogData?.status === 'testing' && (
                                    <div style={{ color: '#569cd6' }}>&gt; 正在拨号并执行网关校验...</div>
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
