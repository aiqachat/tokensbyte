# 聊天对话调用示例 (Claude / GPT / DeepSeek)

本平台提供两种接入协议：**OpenAI 兼容协议** 与 **Anthropic 原生协议**。

> [!NOTE]
> **多模型通用提示**：本示例以 `claude-opus-4-6` 为例演示。平台支持的所有其他对话模型（如 `gpt-4o`、`deepseek-chat`、`gemini-1.5-pro` 等）的 **OpenAI 兼容协议** 调用方式与下方「方法 A」完全一致，您只需将代码请求体中的 `model` 字段值替换为对应的模型 ID 即可。

---

## 协议选择

### 方法 A: OpenAI 兼容协议 (推荐)
* **HTTP Method**: `POST`
* **请求路径**: `https://{{domain}}/v1/chat/completions`
* **鉴权方式**: HTTP Header 携带 `Authorization: Bearer sk-your_token_here`

:::tabs
=== cURL
```bash
curl -X POST https://{{domain}}/v1/chat/completions \
  -H "Authorization: Bearer sk-your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-opus-4-6",
    "messages": [
      {"role": "user", "content": "你好，请用一句话介绍你自己。"}
    ],
    "stream": false
  }'
```
=== Python (openai SDK)
```python
import openai

client = openai.OpenAI(
    api_key="sk-your_token_here",
    base_url="https://{{domain}}/v1"
)

response = client.chat.completions.create(
    model="claude-opus-4-6",
    messages=[
        {"role": "user", "content": "你好，请用一句话介绍你自己。"}
    ],
    stream=False
)
print(response.choices[0].message.content)
```
=== Node.js (openai SDK)
```javascript
const { OpenAI } = require("openai");

const openai = new OpenAI({
  apiKey: "sk-your_token_here",
  baseURL: "https://{{domain}}/v1"
});

async function main() {
  const completion = await openai.chat.completions.create({
    messages: [{ role: "user", content: "你好，请用一句话介绍你自己。" }],
    model: "claude-opus-4-6",
  });

  console.log(completion.choices[0].message.content);
}
main();
```
:::

#### 响应结果示例 (OpenAI 协议格式)
```json
{
  "id": "chatcmpl-claude46xyz192847ff",
  "object": "chat.completion",
  "created": 1719441600,
  "model": "claude-opus-4-6",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "您好！我是由 Anthropic 研发的 AI 助手 Claude Opus 4.6，随时准备协助您进行复杂推理、编写代码或解答问题。"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 12,
    "completion_tokens": 34,
    "total_tokens": 46
  }
}
```

---

### 方法 B: Anthropic 原生协议 (/v1/messages)
如果您已在使用 Anthropic 官方 SDK 或官方原生协议格式，可直接请求此端点。

* **HTTP Method**: `POST`
* **请求路径**: `https://{{domain}}/v1/messages`
* **鉴权方式**: HTTP Header 携带 `x-api-key: sk-your_token_here`
* **必填 Header**: `anthropic-version: 2023-06-01` (若使用官方 SDK，已默认携带)

:::tabs
=== cURL
```bash
curl -X POST https://{{domain}}/v1/messages \
  -H "x-api-key: sk-your_token_here" \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-opus-4-6",
    "max_tokens": 1024,
    "messages": [
      {"role": "user", "content": "你好，请用一句话介绍你自己。"}
    ]
  }'
```
=== Python (anthropic SDK)
```python
from anthropic import Anthropic

client = Anthropic(
    api_key="sk-your_token_here",
    base_url="https://{{domain}}" # 指向网关域名，注意官方SDK会拼上/v1
)

message = client.messages.create(
    model="claude-opus-4-6",
    max_tokens=1024,
    messages=[
        {"role": "user", "content": "你好，请用一句话介绍你自己。"}
    ]
)
print(message.content[0].text)
```
=== Node.js (anthropic SDK)
```javascript
const Anthropic = require("@anthropic-ai/sdk");

const anthropic = new Anthropic({
  apiKey: "sk-your_token_here",
  baseURL: "https://{{domain}}" // 指向网关域名
});

async function main() {
  const message = await anthropic.messages.create({
    model: "claude-opus-4-6",
    max_tokens=1024,
    messages: [{ role: "user", content: "你好，请用一句话介绍你自己。" }],
  });
  console.log(message.content[0].text);
}
main();
```
:::

#### 响应结果示例 (Anthropic 原生格式)
```json
{
  "id": "msg_013829471984719fba",
  "type": "message",
  "role": "assistant",
  "content": [
    {
      "type": "text",
      "text": "您好！我是由 Anthropic 研发的正版 AI 助手，随时准备协助您进行复杂推理、编写代码或解答问题。"
    }
  ],
  "model": "claude-opus-4-6",
  "stop_reason": "end_turn",
  "stop_sequence": null,
  "usage": {
    "input_tokens": 12,
    "output_tokens": 34
  }
}
```

---

## 请求参数说明 (OpenAI 协议)
| 参数名 | 类型 | 必填 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- | :--- |
| `model` | `string` | 是 | - | 模型名称，必须为 `claude-opus-4-6`。 |
| `messages` | `array` | 是 | - | 历史对话消息数组。例如：`[{"role": "user", "content": "内容"}]`。 |
| `stream` | `boolean` | 否 | `false` | 是否以 SSE 流式逐字返回。 |
| `temperature` | `number` | 否 | `0.7` | 采样温度，介于 `0.0` 到 `1.0` 之间。 |
| `max_tokens` | `integer` | 否 | - | 最大生成 Token 限制，原生协议中为必填项。 |
