import React from 'react';
import { Card, Typography, Tag, Tabs, Descriptions, Table, Alert, Divider } from 'antd';
import { RocketOutlined, CodeOutlined, InfoCircleOutlined, WarningOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

const { Title, Text, Paragraph } = Typography;

const RelayAPI: React.FC = () => {
  const { t } = useTranslation();
  const baseUrl = `${window.location.protocol}//${window.location.hostname}:3000`;

  const endpoints = [
    { label: 'OpenAI 聊天', path: '/v1/chat/completions', method: 'POST', type: 'openai' },
    { label: 'OpenAI 图片', path: '/v1/images/generations', method: 'POST', type: 'openai' },
    { label: 'OpenAI 视频 (提交)', path: '/v1/video/generations', method: 'POST', type: 'openai' },
    { label: 'OpenAI 视频 (查询)', path: '/v1/video/generations/{task_id}', method: 'GET', type: 'openai' },
    { label: 'Google 原生 (非流式)', path: '/v1beta/models/{model}:generateContent', method: 'POST', type: 'google' },
    { label: 'Google 原生 (流式)', path: '/v1beta/models/{model}:streamGenerateContent', method: 'POST', type: 'google' },
    { label: '火山方舟 (提交)', path: '/api/v3/contents/generations/tasks', method: 'POST', type: 'volcengine' },
    { label: '火山方舟 (查询)', path: '/api/v3/contents/generations/tasks/{task_id}', method: 'GET', type: 'volcengine' },
  ];

  const errorCodes = [
    { code: 400, desc: 'Bad Request - 请求参数错误 (如必需字段缺失)' },
    { code: 401, desc: 'Unauthorized - API Key 无效或未提供' },
    { code: 403, desc: 'Forbidden - 余额不足 / 模型暂无权限访问' },
    { code: 404, desc: 'Not Found - 请求的路径或上游模型不存在' },
    { code: 429, desc: 'Too Many Requests - 触发并发或速率限制' },
    { code: 502, desc: 'Bad Gateway - 上游服务请求失败 (可用渠道耗尽)' },
  ];

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <Title level={2} style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
        <RocketOutlined style={{ color: '#1677ff' }} />
        中转网关接口文档 (API Reference)
      </Title>

      <Alert
        message="统一认证与计费系统"
        description="本中转网关兼容 OpenAI 与诸多厂商原生协议。只需使用您颁发的请求令牌（Token），其余鉴权、渠道自动调度、日志计费等一律由平台全权智能处理。"
        type="info"
        showIcon
        style={{ marginBottom: 24, borderRadius: 8 }}
      />

      <Card bordered={false} style={{ marginBottom: 24, borderRadius: 8 }} title={<><InfoCircleOutlined /> 基础地址与鉴权方式</>}>
        <Paragraph>
          <Text strong>Base URL: </Text>
          <Text code copyable>{baseUrl}</Text>
        </Paragraph>
        <Divider style={{ margin: '12px 0' }} />
        <Paragraph style={{ marginBottom: 0 }}>
          <Text strong>鉴权方式 (适用于所有请求):</Text>
          <ul style={{ marginTop: 8 }}>
            <li><Text code>Authorization: Bearer sk-xxx</Text> (通用推荐标准)</li>
            <li>Google 兼容透传支持: <Text code>X-Goog-Api-Key: sk-xxx</Text> 或在 URL 尾部添加 <Text code>?key=sk-xxx</Text></li>
          </ul>
        </Paragraph>
      </Card>

      <Card bordered={false} style={{ marginBottom: 24, borderRadius: 8 }} title={<><CodeOutlined /> 开放端点一览</>}>
        {endpoints.map((item) => (
          <div key={item.path} style={{ display: 'flex', alignItems: 'center', marginBottom: 12, gap: 12 }}>
            <Tag color={item.method === 'POST' ? 'green' : 'blue'} style={{ width: 60, textAlign: 'center', margin: 0 }}>{item.method}</Tag>
            <Text type="secondary" style={{ minWidth: 160 }}>{item.label}</Text>
            <Paragraph copyable style={{ margin: 0, fontFamily: 'monospace', fontSize: 13, background: 'rgba(255,255,255,0.04)', padding: '2px 8px', borderRadius: 4 }}>
              {`${baseUrl}${item.path}`}
            </Paragraph>
          </div>
        ))}
      </Card>

      <Tabs 
        defaultActiveKey="1" 
        items={[
          {
            key: '1',
            label: 'OpenAI 协议指南',
            children: (
              <Card bordered={false} style={{ background: '#1f1f1f' }}>
                <Title level={5}>聊天接口 (Chat Completions)</Title>
                <div style={{ background: '#000', padding: 12, borderRadius: 8, marginBottom: 16 }}>
                  <Text code>POST /v1/chat/completions</Text>
                </div>
                <Descriptions column={1} bordered size="small" style={{ marginBottom: 24 }}>
                  <Descriptions.Item label="model (必填)">目标模型名称，如 'gpt-4o' 或 'gemini-1.5-pro'</Descriptions.Item>
                  <Descriptions.Item label="messages (必填)">消息数组列表 [{'{'} role: 'user', content: 'hello' {'}'}]</Descriptions.Item>
                  <Descriptions.Item label="stream (选填)">可选值 true/false，支持 Server-Sent Events (SSE) 流式响应</Descriptions.Item>
                </Descriptions>

                <Title level={5}>图像接口 (Image Generations)</Title>
                <div style={{ background: '#000', padding: 12, borderRadius: 8, marginBottom: 16 }}>
                  <Text code>POST /v1/images/generations</Text>
                </div>
                <Descriptions column={1} bordered size="small">
                  <Descriptions.Item label="prompt (必填)">图像生成的提示词描述</Descriptions.Item>
                  <Descriptions.Item label="model (选填)">模型名称，如 'dall-e-3'</Descriptions.Item>
                  <Descriptions.Item label="size (选填)">分辨率，缺省通常为 1024x1024</Descriptions.Item>
                </Descriptions>
              </Card>
            )
          },
          {
            key: '2',
            label: 'Google/火山 原生协议指南',
            children: (
              <Card bordered={false} style={{ background: '#1f1f1f' }}>
                <Title level={5}>Google Gemini 架构 (通过网关直连原生结构)</Title>
                <Paragraph type="secondary">发送原生 Gemini Payload，网关内部自动替换签权、完成计费审计并路由到最优后端节点。</Paragraph>
                <div style={{ background: '#000', padding: 12, borderRadius: 8, marginBottom: 16 }}>
                  <Text code>POST /v1beta/models/{'{model}'}:generateContent</Text>
                  <br/>
                  <Text code>POST /v1beta/models/{'{model}'}:streamGenerateContent</Text>
                </div>

                <Title level={5} style={{ marginTop: 24 }}>火山方舟 架构</Title>
                <div style={{ background: '#000', padding: 12, borderRadius: 8, marginBottom: 16 }}>
                  <Text code>POST /api/v3/contents/generations/tasks</Text> 
                </div>
              </Card>
            )
          },
          {
            key: '3',
            label: '错误说明 (Error Codes)',
            children: (
              <Card bordered={false} style={{ background: '#1f1f1f' }}>
                <Table 
                  dataSource={errorCodes} 
                  rowKey="code" 
                  pagination={false}
                  size="small"
                  columns={[
                    { title: 'HTTP 状态码', dataIndex: 'code', width: 120, render: val => <Tag color={val >= 500 ? 'red' : 'warning'}>{val}</Tag> },
                    { title: '问题描述', dataIndex: 'desc' }
                  ]} 
                />
              </Card>
            )
          }
        ]}
      />
    </div>
  );
};

export default RelayAPI;
