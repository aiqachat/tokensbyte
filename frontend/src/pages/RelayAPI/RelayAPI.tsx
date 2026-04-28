import React from 'react';
import { Card, Typography, Tag, Tabs, Descriptions, Table, Alert, Divider, theme } from 'antd';
import { RocketOutlined, CodeOutlined, InfoCircleOutlined } from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;

const RelayAPI: React.FC = () => {
  const { token: themeToken } = theme.useToken();
  const isLocal = window.location.hostname === 'localhost' || /^(127\.|192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(window.location.hostname);
  const baseUrl = isLocal
    ? `${window.location.protocol}//${window.location.hostname}:3000`
    : `${window.location.protocol}//${window.location.hostname}`;

  const endpoints = [
    { label: 'OpenAI 聊天', path: '/v1/chat/completions', method: 'POST', type: 'openai' },
    { label: 'OpenAI 图片', path: '/v1/images/generations', method: 'POST', type: 'openai' },
    { label: 'OpenAI 视频 (提交)', path: '/v1/video/generations', method: 'POST', type: 'openai' },
    { label: 'OpenAI 视频 (查询)', path: '/v1/video/generations/{task_id}', method: 'GET', type: 'openai' },
    { label: '图片/视频异步状态 (查询)', path: '/v1/tasks/{task_id}', method: 'GET', type: 'openai' },
    { label: 'Google 原生 (非流式)', path: '/v1beta/models/{model}:generateContent', method: 'POST', type: 'google' },
    { label: 'Google 原生 (流式)', path: '/v1beta/models/{model}:streamGenerateContent', method: 'POST', type: 'google' },
    { label: '火山方舟聊天', path: '/api/v3/chat/completions', method: 'POST', type: 'volcengine' },
    { label: '火山方舟生图', path: '/api/v3/images/generations', method: 'POST', type: 'volcengine' },
    { label: '火山方舟视频 (提交)', path: '/api/v3/contents/generations/tasks', method: 'POST', type: 'volcengine' },
    { label: '火山方舟视频 (查询)', path: '/api/v3/contents/generations/tasks/{task_id}', method: 'GET', type: 'volcengine' },
    { label: '阿里百炼视频 (提交)', path: '/api/v1/services/aigc/video-generation/video-synthesis', method: 'POST', type: 'dashscope' },
    { label: '阿里百炼视频 (查询)', path: '/api/v1/tasks/{task_id}', method: 'GET', type: 'dashscope' },
    { label: '阿里百炼图片 (提交)', path: '/api/v1/services/aigc/multimodal-generation/generation', method: 'POST', type: 'dashscope' },
  ];

  const errorCodes = [
    { code: 400, desc: 'Bad Request — 请求参数错误（如必需字段缺失、格式不合法）' },
    { code: 401, desc: 'Unauthorized — API Key 无效、已过期或未提供' },
    { code: 403, desc: 'Forbidden — 余额不足 / 令牌权限不足 / 模型无权访问' },
    { code: 404, desc: 'Not Found — 请求的路径不存在，或当前模型无可用渠道' },
    { code: 429, desc: 'Too Many Requests — 触发并发限制或令牌请求速率上限' },
    { code: 500, desc: 'Internal Server Error — 网关内部异常，请稍后重试或联系管理员' },
    { code: 502, desc: 'Bad Gateway — 上游服务请求失败（渠道不可达或已耗尽）' },
  ];

  const codeStyle: React.CSSProperties = { background: themeToken.colorFillQuaternary, padding: 12, borderRadius: 8, marginBottom: 16 };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <Title level={2} style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
        <RocketOutlined style={{ color: '#1677ff' }} />
        中转网关接口文档 (API Reference)
      </Title>

      <Alert
        message="统一认证与智能调度计费系统"
        description="本网关兼容 OpenAI、Google Gemini、火山方舟、Anthropic 等多家厂商原生协议。只需使用您颁发的请求令牌（Token），渠道自动调度、协议自动转换、日志计费等均由平台全权智能处理。"
        type="info"
        showIcon
        style={{ marginBottom: 24, borderRadius: 8 }}
      />

      <Card variant="borderless" style={{ marginBottom: 24, borderRadius: 8 }} title={<><InfoCircleOutlined /> 基础地址与鉴权方式</>}>
        <Paragraph>
          <Text strong>Base URL: </Text>
          <Text code copyable>{baseUrl}</Text>
        </Paragraph>
        <Divider style={{ margin: '12px 0' }} />
        <Paragraph style={{ marginBottom: 0 }}>
          <Text strong>鉴权方式 (适用于所有请求):</Text>
          <ul style={{ marginTop: 8 }}>
            <li><Text code>Authorization: Bearer sk-xxx</Text> （通用推荐标准，适用于所有协议）</li>
            <li>Google 兼容透传: <Text code>X-Goog-Api-Key: sk-xxx</Text> 或 URL 尾部 <Text code>?key=sk-xxx</Text></li>
          </ul>
        </Paragraph>
      </Card>

      <Card variant="borderless" style={{ marginBottom: 24, borderRadius: 8 }} title={<><CodeOutlined /> 开放端点一览</>}>
        {endpoints.map((item) => (
          <div key={item.path + item.method} style={{ display: 'flex', alignItems: 'center', marginBottom: 12, gap: 12 }}>
            <Tag color={item.method === 'POST' ? 'green' : 'blue'} style={{ width: 60, textAlign: 'center', margin: 0 }}>{item.method}</Tag>
            <Text type="secondary" style={{ minWidth: 160 }}>{item.label}</Text>
            <Paragraph copyable style={{ margin: 0, fontFamily: 'monospace', fontSize: 13, background: themeToken.colorFillQuaternary, padding: '2px 8px', borderRadius: 4 }}>
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
              <Card variant="borderless" style={{ background: themeToken.colorBgContainer }}>
                {/* ── 聊天 ── */}
                <Title level={5}>聊天接口 (Chat Completions)</Title>
                <div style={codeStyle}><Text code>POST /v1/chat/completions</Text></div>
                <Descriptions column={1} bordered size="small" style={{ marginBottom: 8 }}>
                  <Descriptions.Item label="model (必填)">目标模型名称，如 "gpt-4o"、"gemini-2.0-flash"、"claude-sonnet-4-20250514"</Descriptions.Item>
                  <Descriptions.Item label="messages (必填)">消息数组 [{'{'} role: "system"|"user"|"assistant", content: "..." {'}'}]</Descriptions.Item>
                  <Descriptions.Item label="stream (选填)">true/false — 启用后以 SSE 流式逐字返回（默认 false）</Descriptions.Item>
                  <Descriptions.Item label="temperature (选填)">采样温度 0~2，值越大输出越随机（默认 1）</Descriptions.Item>
                  <Descriptions.Item label="top_p (选填)">核采样概率阈值 0~1（默认 1）</Descriptions.Item>
                  <Descriptions.Item label="max_tokens (选填)">最大生成 Token 数量（默认由模型决定）</Descriptions.Item>
                  <Descriptions.Item label="web_search (选填)">true/false — 启用联网搜索。火山方舟自动转为 <Text code>tools: [type: web_search]</Text>；Google Gemini 自动转为 <Text code>tools: [google_search]</Text></Descriptions.Item>
                </Descriptions>
                <Alert message="协议自动转换：无论上游实际是 OpenAI / Gemini / Anthropic / 火山方舟，网关均会自动完成请求体格式转换与响应体标准化归一，调用方始终使用 OpenAI 格式即可。" type="info" showIcon style={{ marginBottom: 24, borderRadius: 8 }} />

                <Divider />

                {/* ── 图片 ── */}
                <Title level={5}>图像接口 (Image Generations)</Title>
                <div style={codeStyle}>
                  <Text code>POST /v1/images/generations</Text>
                  <br />
                  <Text code>GET  /v1/tasks/{'{task_id}'}?model=xxx</Text>
                  <span style={{ marginLeft: 16 }}><Text type="secondary">轮询查询异步图片结果（针对 Midjourney 等带 task_id 响应的模型）</Text></span>
                </div>
                <Descriptions column={1} bordered size="small">
                  <Descriptions.Item label="model (必填)">模型名称，如 "dall-e-3"、"gemini-2.0-flash"、"seedream-5.0-lite"。未传时默认 "dall-e-3"</Descriptions.Item>
                  <Descriptions.Item label="prompt (必填)">图像生成的提示词描述文本</Descriptions.Item>
                  <Descriptions.Item label="n (选填)">
                    <Text>生成图片数量（默认 1）。网关自动转换为上游厂商原生参数：</Text>
                    <ul style={{ marginTop: 4, marginBottom: 0, paddingLeft: 20 }}>
                      <li><Text type="secondary">火山方舟：n {'>'} 1 时自动设置 <Text code>sequential_image_generation: "auto"</Text> + <Text code>sequential_image_generation_options.max_images = n</Text></Text></li>
                      <li><Text type="secondary">Google Gemini：自动转为 <Text code>generationConfig.candidateCount = n</Text></Text></li>
                      <li><Text type="secondary">阿里百炼 (DashScope)：n 保持原样</Text></li>
                    </ul>
                  </Descriptions.Item>
                  <Descriptions.Item label="watermark (选填)">true/false — 是否在图片上添加水印标识（火山/阿里模型均支持）</Descriptions.Item>
                  <Descriptions.Item label="size (选填)">图片分辨率（例："1024x1024"）。阿里模型自动转为 <Text code>1024*1024</Text>；Gemini 自动转为 <Text code>imageSize</Text></Descriptions.Item>
                  <Descriptions.Item label="ratio (选填)">图片宽高比（例："16:9"、"1:1"）。Gemini 自动转为 <Text code>aspectRatio</Text></Descriptions.Item>
                  <Descriptions.Item label="image (选填)">
                    <Text>参考图 URL (OpenAI 协议扩展)。阿里百炼模型自动将其封装进 <Text code>input.messages</Text> 用于图生图或参考生图模式。</Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="prompt_extend (选填)">true/false — 阿里百炼特有：是否启用提示词智能改写（默认 false）</Descriptions.Item>
                  <Descriptions.Item label="stream (选填)">true/false — 部分原生支持流式的模型（如 Gemini）可启用，网关自动解析 SSE 流提取图像</Descriptions.Item>
                  <Descriptions.Item label="web_search (选填)">true/false — 联网搜索，转换规则同聊天接口</Descriptions.Item>
                  <Descriptions.Item label="其他透传参数">
                    <Text type="secondary">以下参数原封不动透传至上游：</Text>
                    <ul style={{ marginTop: 4, marginBottom: 0, paddingLeft: 20 }}>
                      <li><Text code>quality</Text>: 图片质量级别（例："standard", "hd"）</li>
                      <li><Text code>style</Text>: 艺术渲染风格（例："vivid", "natural"）</li>
                      <li><Text code>response_format</Text>: 返回格式（例："url", "b64_json"）</li>
                      <li>以及任何上游厂商官方定义的扩展参数 (如阿里 <Text code>seed</Text>) …</li>
                    </ul>
                  </Descriptions.Item>
                </Descriptions>

                <Divider />

                {/* ── 视频 ── */}
                <Title level={5}>视频接口 (Video Generations)</Title>
                <div style={codeStyle}>
                  <Text code>POST /v1/video/generations</Text>
                  <span style={{ marginLeft: 16 }}><Text type="secondary">提交异步任务</Text></span>
                  <br />
                  <Text code>GET  /v1/tasks/{'{task_id}'}?model=xxx</Text>
                  <span style={{ marginLeft: 16 }}><Text type="secondary">轮询查询结果（model 参数选填，兼容 /v1/video/generations/{'{task_id}'}）</Text></span>
                </div>

                <Descriptions column={1} bordered size="small" title={<Text strong style={{ fontSize: 13 }}>核心参数</Text>}>
                  <Descriptions.Item label="model (必填)">视频生成模型名称，如 "doubao-seedance-2-0-fast-260128", "wanx-v1" (阿里百炼万相视频)</Descriptions.Item>
                  <Descriptions.Item label="prompt (必填)">视频生成的提示词描述文本</Descriptions.Item>
                  <Descriptions.Item label="images (选填)">
                    <Text>参考图片数组，支持两种格式：</Text>
                    <ul style={{ marginTop: 4, marginBottom: 4, paddingLeft: 20 }}>
                      <li><Text type="secondary">简单模式：</Text> <Text code>["url1", "url2"]</Text>
                        <Text type="secondary"> — 系统按数量自动推断 role（1张=首帧，2张=首尾帧，3+张=参考图）</Text></li>
                      <li><Text type="secondary">精确模式：</Text> <Text code>[{'{"url": "...", "role": "first_frame"}'}]</Text>
                        <Text type="secondary"> — 显式指定每张图的 role</Text></li>
                    </ul>
                    <Text type="secondary">role 可选值：<Text code>first_frame</Text>（首帧）| <Text code>last_frame</Text>（尾帧）| <Text code>reference_image</Text>（参考图）</Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="videos (选填)">
                    <Text>参考视频数组，格式同 images</Text>
                    <br />
                    <Text type="secondary">role 可选值：<Text code>reference_video</Text>（默认值）</Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="audios (选填)">
                    <Text>参考音频数组，格式同 images</Text>
                    <br />
                    <Text type="secondary">role 可选值：<Text code>reference_audio</Text>（默认值）</Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="content (选填)">
                    <Text>高级直通模式 — 直接传入火山方舟官方 content 数组结构，系统将原样透传：</Text>
                    <div style={{ background: themeToken.colorFillQuaternary, padding: 8, borderRadius: 4, marginTop: 4, fontSize: 12, fontFamily: 'monospace' }}>
                      <Text code style={{ whiteSpace: 'pre-wrap' }}>{`[
  {"type":"text","text":"..."},
  {"type":"image_url","image_url":{"url":"..."},"role":"first_frame"},
  {"type":"video_url","video_url":{"url":"..."},"role":"reference_video"},
  {"type":"audio_url","audio_url":{"url":"..."},"role":"reference_audio"}
]`}</Text>
                    </div>
                    <Text type="secondary" style={{ marginTop: 4, display: 'block' }}>⚠️ 传入 content 时，prompt / images / videos / audios 将被忽略</Text>
                  </Descriptions.Item>
                </Descriptions>

                <Descriptions column={2} bordered size="small" title={<Text strong style={{ fontSize: 13 }}>视频控制参数（全部选填，按需传入）</Text>} style={{ marginTop: 16 }}>
                  <Descriptions.Item label={<Text code>resolution</Text>}>分辨率：480p, 720p, 1080p（默认 720p）</Descriptions.Item>
                  <Descriptions.Item label={<Text code>ratio</Text>}>宽高比：16:9, 4:3, 1:1 等</Descriptions.Item>
                  <Descriptions.Item label={<Text code>duration</Text>}>视频时长（秒），如 5, 10</Descriptions.Item>
                  <Descriptions.Item label={<Text code>fps</Text>}>帧率</Descriptions.Item>
                  <Descriptions.Item label={<Text code>seed</Text>}>随机种子（可复现结果）</Descriptions.Item>
                  <Descriptions.Item label={<Text code>generate_audio</Text>}>是否生成音频 (true/false)</Descriptions.Item>
                  <Descriptions.Item label={<Text code>return_last_frame</Text>}>是否返回末帧 (true/false)</Descriptions.Item>
                  <Descriptions.Item label={<Text code>watermark</Text>}>是否添加水印 (true/false)</Descriptions.Item>
                  <Descriptions.Item label={<Text code>service_tier</Text>}>服务等级，如 <Text code>flex</Text> (离线减半) 或 <Text code>default</Text> (在线)</Descriptions.Item>
                  <Descriptions.Item label={<Text code>stream</Text>}>是否流式返回 (true/false)</Descriptions.Item>
                  <Descriptions.Item label={<Text code>callback_url</Text>}>任务完成回调地址（URL）</Descriptions.Item>
                </Descriptions>
              </Card>
            )
          },
          {
            key: '2',
            label: '原生协议 (Google/火山/阿里)',
            children: (
              <Card variant="borderless" style={{ background: themeToken.colorBgContainer }}>
                <Title level={5}>Google Gemini 原生接口</Title>
                <Paragraph type="secondary">发送原生 Gemini Payload，网关自动完成鉴权替换、计费审计并路由到最优渠道节点。</Paragraph>
                <div style={codeStyle}>
                  <Text code>POST /v1beta/models/{'{model}'}:generateContent</Text>
                  <span style={{ marginLeft: 16 }}><Text type="secondary">非流式</Text></span>
                  <br />
                  <Text code>POST /v1beta/models/{'{model}'}:streamGenerateContent</Text>
                  <span style={{ marginLeft: 16 }}><Text type="secondary">流式（SSE）</Text></span>
                </div>
                <Descriptions column={1} bordered size="small" style={{ marginBottom: 24 }}>
                  <Descriptions.Item label="model (路径)">Gemini 模型名嵌入路径中，如 gemini-2.0-flash</Descriptions.Item>
                  <Descriptions.Item label="contents (必填)">Gemini 原生 contents 数组：[{'{"role":"user","parts":[{"text":"..."}]}'}]</Descriptions.Item>
                  <Descriptions.Item label="systemInstruction (选填)">系统指令：{'{"parts":[{"text":"You are a helpful assistant"}]}'}</Descriptions.Item>
                  <Descriptions.Item label="generationConfig (选填)">生成配置对象：temperature、topP、maxOutputTokens、responseMimeType 等</Descriptions.Item>
                  <Descriptions.Item label="鉴权说明">支持 <Text code>Authorization: Bearer sk-xxx</Text>、<Text code>X-Goog-Api-Key: sk-xxx</Text>、或 URL 参数 <Text code>?key=sk-xxx</Text>，三选一</Descriptions.Item>
                </Descriptions>

                <Divider />

                <Title level={5}>火山方舟原生接口</Title>
                <Paragraph type="secondary">使用火山方舟官方路径和请求体格式，网关自动鉴权、渠道路由与计费。</Paragraph>
                <div style={codeStyle}>
                  <Text code>POST /api/v3/chat/completions</Text>
                  <span style={{ marginLeft: 16 }}><Text type="secondary">聊天（OpenAI 兼容格式）</Text></span>
                  <br />
                  <Text code>POST /api/v3/images/generations</Text>
                  <span style={{ marginLeft: 16 }}><Text type="secondary">图片生成（OpenAI 兼容格式）</Text></span>
                  <br />
                  <Text code>POST /api/v3/contents/generations/tasks</Text>
                  <span style={{ marginLeft: 16 }}><Text type="secondary">视频/多模态任务提交（火山原生格式）</Text></span>
                  <br />
                  <Text code>GET  /api/v3/contents/generations/tasks/{'{task_id}'}</Text>
                  <span style={{ marginLeft: 16 }}><Text type="secondary">异步任务状态查询</Text></span>
                </div>
                <Descriptions column={1} bordered size="small">
                  <Descriptions.Item label="聊天/图片">请求体完全兼容 OpenAI 格式（与 /v1/ 系列参数一致），仅路径不同</Descriptions.Item>
                  <Descriptions.Item label="视频任务提交">请求体同 OpenAI 视频接口参数，或直接传入火山官方 content 数组。控制参数（resolution、duration 等）支持顶层直传</Descriptions.Item>
                  <Descriptions.Item label="异步任务轮询">GET 请求返回原始上游响应，任务完成时（status=succeeded）网关自动提取 Token 用量并执行最终计费结算</Descriptions.Item>
                  <Descriptions.Item label="鉴权说明">统一使用 <Text code>Authorization: Bearer sk-xxx</Text></Descriptions.Item>
                </Descriptions>

                <Divider />

                <Title level={5}>阿里百炼 (DashScope) 原生视频接口</Title>
                <Paragraph type="secondary">使用阿里百炼官方路径和请求体格式（支持文生视频、图生视频等），网关自动拦截注入 X-DashScope-Async 请求头并完成计费。如果使用 OpenAI 标准协议调用 `/v1/video/generations`，系统也会自动转换兼容。</Paragraph>
                <div style={codeStyle}>
                  <Text code>POST /api/v1/services/aigc/video-generation/video-synthesis</Text>
                  <span style={{ marginLeft: 16 }}><Text type="secondary">视频生成任务提交（官方 DashScope 格式）</Text></span>
                  <br />
                  <Text code>GET  /api/v1/tasks/{'{task_id}'}</Text>
                  <span style={{ marginLeft: 16 }}><Text type="secondary">异步任务状态查询</Text></span>
                </div>
                <Descriptions column={1} bordered size="small">
                  <Descriptions.Item label="视频任务提交">请求体完全支持阿里官方格式，形如 <Text code>{`{"input": {"prompt": "..."}, "parameters": {"resolution": "720P"}}`}</Text>。支持传入模型参数、分辨率等。</Descriptions.Item>
                  <Descriptions.Item label="异步任务轮询">使用原生任务 ID 进行轮询查询，网关将无缝解析 DashScope 返回的 `output.task_status` 与使用量进行自动扣费。</Descriptions.Item>
                  <Descriptions.Item label="鉴权说明">统一使用 <Text code>Authorization: Bearer sk-xxx</Text></Descriptions.Item>
                </Descriptions>

                <Divider />

                <Title level={5}>阿里百炼 (DashScope) 原生接口</Title>
                <Paragraph type="secondary">使用阿里官方原生路径调用图像与视频生成接口。</Paragraph>
                <div style={codeStyle}>
                  <Text code>POST /api/v1/services/aigc/multimodal-generation/generation</Text>
                  <span style={{ marginLeft: 16 }}><Text type="secondary">图片生成（多模态原生格式）</Text></span>
                  <br />
                  <Text code>POST /api/v1/services/aigc/video-generation/video-synthesis</Text>
                  <span style={{ marginLeft: 16 }}><Text type="secondary">视频生成（原生格式）</Text></span>
                  <br />
                  <Text code>GET  /api/v1/tasks/{'{task_id}'}</Text>
                  <span style={{ marginLeft: 16 }}><Text type="secondary">任务查询（同步返回 200，异步返回任务 ID 后轮询此路径）</Text></span>
                </div>
                <Descriptions column={1} bordered size="small">
                  <Descriptions.Item label="请求体说明">完全兼容阿里百炼官方文档中定义的 <Text code>input</Text> 与 <Text code>parameters</Text> 嵌套格式</Descriptions.Item>
                  <Descriptions.Item label="计费机制">网关自动从 <Text code>usage.image_count</Text> 或 <Text code>usage.duration</Text> 提取实际消耗量，扣除对应资产</Descriptions.Item>
                  <Descriptions.Item label="鉴权说明">统一使用 <Text code>Authorization: Bearer sk-xxx</Text></Descriptions.Item>
                </Descriptions>
              </Card>
            )
          },
          {
            key: '3',
            label: '错误码说明',
            children: (
              <Card variant="borderless" style={{ background: themeToken.colorBgContainer }}>
                <Table
                  dataSource={errorCodes}
                  rowKey="code"
                  pagination={false}
                  size="small"
                  columns={[
                    { title: 'HTTP 状态码', dataIndex: 'code', width: 120, render: (val: number) => <Tag color={val >= 500 ? 'red' : 'warning'}>{val}</Tag> },
                    { title: '问题描述', dataIndex: 'desc' }
                  ]}
                />
                <Alert
                  message="当上游返回非成功状态时，网关会在响应体中包含上游原始错误信息以便排查。同时所有失败请求均会被完整记录至使用日志，管理员可在后台查看详细的请求/响应内容。"
                  type="warning"
                  showIcon
                  style={{ marginTop: 16, borderRadius: 8 }}
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
