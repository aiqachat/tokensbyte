# Chat & Response Endpoints

The chat interface provided by the gateway is fully backward-compatible with the official OpenAI specifications. Regardless of whether the underlying model you are calling belongs to OpenAI, Google, Anthropic, Alibaba, Volcengine, or other providers, the gateway will intelligently handle request format translation and response format normalization in the background.

### 1. Chat Completions
* **Path**: `/v1/chat/completions`
* **Method**: `POST`

#### Core Request Parameters
| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `model` | `string` | Yes | Target model name, e.g., `gpt-4o`, `claude-3-5-sonnet-20241022`, `gemini-1.5-pro` |
| `messages` | `array` | Yes | Array of historical conversation messages, e.g., `[{"role": "user", "content": "Hello"}]` |
| `stream` | `boolean` | No | Whether to return the response as an SSE event stream (streaming character-by-character, default is `false`) |
| `temperature` | `number` | No | Sampling temperature (0~2). Higher values increase randomness. Recommended: `0.7` to `1.0` |
| `max_tokens` | `integer` | No | Maximum token limit for model generation |
| `tools` | `array` | No | List of tools (Function Calling) available for the model |

#### Command Line Example (Curl)
```bash
curl -X POST https://{{domain}}/v1/chat/completions \
  -H "Authorization: Bearer sk-your_token" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "请解释什么是量子纠缠。"}
    ],
    "stream": false
  }'
```

### 2. Transparent Response Passthrough (Responses)
* **Path**: `/v1/responses`
* **Method**: `POST`

> [!NOTE]
> If you want to bypass the gateway's automatic parameter validation and protocol translation and send the official native Request Payload directly to the underlying OpenAI or Volcengine Ark models, you can use the `/v1/responses` endpoint. The gateway will pass the request body losslessly to the upstream channel while still securing core platform features such as global billing, quota limits, and audit logs.

#### Request Example
```json
{
  "model": "gpt-4o",
  "input": [
    {"role": "user", "content": "透传请求内容"}
  ],
  "stream": false
} 
```
