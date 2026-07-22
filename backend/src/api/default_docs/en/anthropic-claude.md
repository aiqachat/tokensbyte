# Anthropic Claude Native API Guide

The gateway supports direct calls to the official Anthropic Messages API. You can directly send native payloads to call Claude series models (such as `claude-3-5-sonnet-20241022`).

### 1. Message Generation Dialogue (Messages API)
* **Request Path**: `/v1/messages`
* **Request Method**: `POST`

#### Core Request Parameter Description
* **model** (string, Required)
  Specifies the Claude model name, such as `claude-3-5-sonnet-20241022`.
* **messages** (array, Required)
  Array of historical dialogue data, structured as `[{"role": "user", "content": "你好"}]`.
* **max_tokens** (integer, Required)
  The maximum limit of tokens generated. Note: The official Anthropic protocol requires this parameter to be filled in.
* **system** (string, Optional)
  System prompt, used to set the role and behavior of the model.
* **stream** (boolean, Optional)
  Whether to return in SSE (Server-Sent Events) streaming format. Optional values are `true` or `false`.
* **temperature** (number, Optional)
  Sampling temperature, ranging between `0.0` and `1.0`.

#### Call Example (Curl)
```bash
curl -X POST https://{{domain}}/v1/messages \
  -H "x-api-key: sk-your_token" \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "max_tokens": 1024,
    "messages": [
      {"role": "user", "content": "你好，请用一句话描述你自己的核心特征。"}
    ]
  }'
```

### 2. API Authentication Methods
When calling the native Claude API, the gateway supports the following two types of authentication request headers:
1. **Unified Bearer Token Authentication (Recommended)**:
   ```http
   Authorization: Bearer sk-your_token
   ```
2. **Official Anthropic API Key**:
   ```http
   x-api-key: sk-your_token
   ```
