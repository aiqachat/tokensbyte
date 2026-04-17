import React from 'react';
import { Card, Typography, Tag, Tabs, Descriptions, Table, Alert, Divider } from 'antd';
import { RocketOutlined, CodeOutlined, InfoCircleOutlined, WarningOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

const { Title, Text, Paragraph } = Typography;

const RelayAPI: React.FC = () => {
  const { t } = useTranslation();
  const isLocal = window.location.hostname === 'localhost' || /^(127\.|192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(window.location.hostname);
  const baseUrl = isLocal 
    ? `${window.location.protocol}//${window.location.hostname}:3000` 
    : `${window.location.protocol}//${window.location.hostname}`;

  const endpoints = [
    { label: 'OpenAI 聊天', path: '/v1/chat/completions', method: 'POST', type: 'openai' },
    { label: 'OpenAI 图片', path: '/v1/images/generations', method: 'POST', type: 'openai' },
    { label: 'OpenAI 视频 (提交)', path: '/v1/video/generations', method: 'POST', type: 'openai' },
    { label: 'OpenAI 视频 (查询)', path: '/v1/video/generations/{task_id}', method: 'GET', type: 'openai' },
    { label: 'Google 原生 (非流式)', path: '/v1beta/models/{model}:generateContent', method: 'POST', type: 'google' },
    { label: 'Google 原生 (流式)', path: '/v1beta/models/{model}:streamGenerateContent', method: 'POST', type: 'google' },
    { label: '火山方舟聊天', path: '/api/v3/chat/completions', method: 'POST', type: 'volcengine' },
    { label: '火山方舟生图', path: '/api/v3/images/generations', method: 'POST', type: 'volcengine' },
    { label: '火山方舟视频 (提交)', path: '/api/v3/contents/generations/tasks', method: 'POST', type: 'volcengine' },
    { label: '火山方舟视频 (查询)', path: '/api/v3/contents/generations/tasks/{task_id}', method: 'GET', type: 'volcengine' },
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
                  <Descriptions.Item label="model (必填)">模型名称，如果不传系统将默认回落至 'dall-e-3'</Descriptions.Item>
                  <Descriptions.Item label="prompt (必填)">图像生成的提示词描述文本</Descriptions.Item>
                  <Descriptions.Item label="stream (选填)">可选值为 true/false，专为部分原生支持流式的模型体系（如 Gemini 等）转换解析使用</Descriptions.Item>
                  <Descriptions.Item label="规范全量透传参数 (Passthrough)">
                    <Text type="secondary">对于所有符合官方原生或 OpenAI 兼容格式的绘图模型，网关在此层不作字段抹除，将原封不动向原始上游透传（Passthrough）各类参数：</Text>
                    <ul style={{ marginTop: 8, marginBottom: 0, paddingLeft: 20 }}>
                      <li><Text code>size</Text>: 图片分辨率 (例："1024x1024")</li>
                      <li><Text code>n</Text>: 请求生成的图片数量</li>
                      <li><Text code>quality</Text>: 图片质量级别 (例："standard", "hd")</li>
                      <li><Text code>style</Text>: 艺术渲染风格 (例："vivid", "natural")</li>
                      <li><Text code>response_format</Text>: 编码返回格式 (例："url", "b64_json")</li>
                      <li>以及任何上游厂商官方私有定义的合法扩展传参...</li>
                    </ul>
                  </Descriptions.Item>
                </Descriptions>

                <Divider />

                <Title level={5}>视频接口 (Video Generations)</Title>
                <div style={{ background: '#000', padding: 12, borderRadius: 8, marginBottom: 16 }}>
                  <Text code>POST /v1/video/generations</Text>
                  <span style={{ marginLeft: 16 }}><Text type="secondary">提交任务</Text></span>
                  <br/>
                  <Text code>GET  /v1/video/generations/{'{task_id}'}</Text>
                  <span style={{ marginLeft: 16 }}><Text type="secondary">查询结果</Text></span>
                </div>
                <Descriptions column={1} bordered size="small" style={{ marginBottom: 16 }}>
                  <Descriptions.Item label="model (必填)">视频生成模型名称，如 'doubao-seedance-2-0-fast-260128'</Descriptions.Item>
                  <Descriptions.Item label="prompt (必填)">视频生成的提示词描述文本</Descriptions.Item>
                  <Descriptions.Item label="images (选填)">
                    <Text>参考图片数组，支持两种格式：</Text>
                    <ul style={{ marginTop: 4, marginBottom: 4, paddingLeft: 20 }}>
                      <li><Text type="secondary">简单模式：</Text> <Text code>["url1", "url2"]</Text>
                        <Text type="secondary"> — 系统按数量自动推断 role（1张=首帧，2张=首尾帧，3+张=参考图）</Text></li>
                      <li><Text type="secondary">精确模式：</Text> <Text code>[{'{"url": "...", "role": "first_frame"}'}]</Text>
                        <Text type="secondary"> — 显式指定每张图的 role</Text></li>
                    </ul>
                    <Text type="secondary">role 可选值：<Text code>first_frame</Text> (首帧) | <Text code>last_frame</Text> (尾帧) | <Text code>reference_image</Text> (参考图)</Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="videos (选填)">
                    <Text>参考视频数组，格式同 images</Text>
                    <br/>
                    <Text type="secondary">role 默认值：<Text code>reference_video</Text></Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="audios (选填)">
                    <Text>参考音频数组，格式同 images</Text>
                    <br/>
                    <Text type="secondary">role 默认值：<Text code>reference_audio</Text></Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="content (选填)">
                    <Text>高级模式 — 直接传入火山方舟官方 content 数组格式，系统将原样透传：</Text>
                    <div style={{ background: '#000', padding: 8, borderRadius: 4, marginTop: 4, fontSize: 12, fontFamily: 'monospace' }}>
                      <Text code style={{ whiteSpace: 'pre-wrap' }}>{`[
  {"type":"text","text":"..."},
  {"type":"image_url","image_url":{"url":"..."},"role":"first_frame"},
  {"type":"video_url","video_url":{"url":"..."},"role":"reference_video"},
  {"type":"audio_url","audio_url":{"url":"..."},"role":"reference_audio"}
]`}</Text>
                    </div>
                    <Text type="secondary" style={{ marginTop: 4, display: 'block' }}>当传入 content 时，prompt / images / videos / audios 将被忽略</Text>
                  </Descriptions.Item>
                </Descriptions>

                <Descriptions column={2} bordered size="small" title={<Text strong style={{ fontSize: 13 }}>视频控制参数 (全部选填，按需传入)</Text>}>
                  <Descriptions.Item label={<Text code>resolution</Text>}>分辨率：480p, 720p, 1080p</Descriptions.Item>
                  <Descriptions.Item label={<Text code>ratio</Text>}>宽高比：16:9, 4:3, 1:1 等</Descriptions.Item>
                  <Descriptions.Item label={<Text code>duration</Text>}>视频时长（秒），如 5, 10</Descriptions.Item>
                  <Descriptions.Item label={<Text code>fps</Text>}>帧率</Descriptions.Item>
                  <Descriptions.Item label={<Text code>generate_audio</Text>}>是否生成音频 (true/false)</Descriptions.Item>
                  <Descriptions.Item label={<Text code>return_last_frame</Text>}>是否返回末帧 (true/false)</Descriptions.Item>
                  <Descriptions.Item label={<Text code>watermark</Text>}>是否添加水印 (true/false)</Descriptions.Item>
                  <Descriptions.Item label={<Text code>seed</Text>}>随机种子（可复现结果）</Descriptions.Item>
                  <Descriptions.Item label={<Text code>stream</Text>}>是否流式返回 (true/false)</Descriptions.Item>
                  <Descriptions.Item label={<Text code>callback_url</Text>}>任务完成回调地址</Descriptions.Item>
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
                  <Text code>POST /api/v3/chat/completions</Text>
                  <br/>
                  <Text code>POST /api/v3/images/generations</Text>
                  <br/>
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
