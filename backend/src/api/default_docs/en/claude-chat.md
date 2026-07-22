# Chat Completions Example (Claude / GPT / DeepSeek)

This platform provides two protocols: **OpenAI-Compatible Protocol** and **Anthropic Native Protocol**.

> [!NOTE]
> **Multi-Model General Notice**: This example demonstrates the usage with `claude-opus-4-6`. All other chat completion models supported by our platform (such as `gpt-4o`, `deepseek-chat`, `gemini-1.5-pro`, etc.) can be called in the exact same way via the **OpenAI-Compatible Protocol** shown in "Method A" below. You only need to replace the `model` parameter value in your request body with your desired model ID.

---

## Protocol Selection

### Method A: OpenAI-Compatible Protocol (Recommended)
* **HTTP Method**: `POST`
* **Request Path**: `https://{{domain}}/v1/chat/completions`
* **Authentication**: HTTP Header `Authorization: Bearer sk-your_token_here`

:::tabs
=== cURL
```bash
curl -X POST https://{{domain}}/v1/chat/completions \
  -H "Authorization: Bearer sk-your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-opus-4-6",
    "messages": [
      {"role": "user", "content": "Hello, please introduce yourself in one sentence."}
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
        {"role": "user", "content": "Hello, please introduce yourself in one sentence."}
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
    messages: [{ role: "user", content: "Hello, please introduce yourself in one sentence." }],
    model: "claude-opus-4-6",
  });

  console.log(completion.choices[0].message.content);
}
main();
```
:::

#### Response Example (OpenAI Format)
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
        "content": "Hello! I am Claude Opus 4.6, an AI assistant developed by Anthropic. I'm ready to assist you with analysis, coding, or answering questions."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 14,
    "completion_tokens": 32,
    "total_tokens": 46
  }
}
```

---

### Method B: Anthropic Native Protocol (/v1/messages)
If you are already using Anthropic official SDKs or their native protocol formats, you can directly query this endpoint.

* **HTTP Method**: `POST`
* **Request Path**: `https://{{domain}}/v1/messages`
* **Authentication**: HTTP Header `x-api-key: sk-your_token_here`
* **Required Header**: `anthropic-version: 2023-06-01` (provided by official SDK by default)

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
      {"role": "user", "content": "Hello, please introduce yourself in one sentence."}
    ]
  }'
```
=== Python (anthropic SDK)
```python
from anthropic import Anthropic

client = Anthropic(
    api_key="sk-your_token_here",
    base_url="https://{{domain}}" # Point to the gateway domain. Official SDK will automatically append /v1.
)

message = client.messages.create(
    model="claude-opus-4-6",
    max_tokens=1024,
    messages=[
        {"role": "user", "content": "Hello, please introduce yourself in one sentence."}
    ]
)
print(message.content[0].text)
```
=== Node.js (anthropic SDK)
```javascript
const Anthropic = require("@anthropic-ai/sdk");

const anthropic = new Anthropic({
  apiKey: "sk-your_token_here",
  baseURL: "https://{{domain}}" // Point to the gateway domain
});

async function main() {
  const message = await anthropic.messages.create({
    model: "claude-opus-4-6",
    max_tokens=1024,
    messages: [{ role: "user", content: "Hello, please introduce yourself in one sentence." }],
  });
  console.log(message.content[0].text);
}
main();
```
:::

#### Response Example (Anthropic Native Format)
```json
{
  "id": "msg_013829471984719fba",
  "type": "message",
  "role": "assistant",
  "content": [
    {
      "type": "text",
      "text": "Hello! I am Claude Opus 4.6, an AI assistant developed by Anthropic. I'm ready to assist you with analysis, coding, or answering questions."
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

## Request Parameters (OpenAI Protocol)
| Parameter | Type | Required | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `model` | `string` | Yes | - | Name of the model. Must be `claude-opus-4-6`. |
| `messages` | `array` | Yes | - | Conversation messages. E.g. `[{"role": "user", "content": "text"}]`. |
| `stream` | `boolean` | No | `false` | Whether to stream responses back (SSE). |
| `temperature` | `number` | No | `0.7` | Sampling temperature between `0.0` and `1.0`. |
| `max_tokens` | `integer` | No | - | Maximum tokens to generate in response. Required for native Anthropic protocol. |
