# Volcengine Ark Native API Guide

If your existing business system is already integrated with the Volcengine Ark platform, there is no need to refactor your code to the OpenAI format. The gateway also provides forwarding routes that correspond completely to the native Volcengine path. You only need to replace the API Key in the request header with the unified API key allocated by this platform.

### 1. Native Chat & Responses
* **Chat Endpoint**: `/api/v3/chat/completions`
* **Native Responses Endpoint**: `/api/v3/responses`
* **Request Method**: `POST`

Supports complete transparent transmission of the Volcengine Ark native Request Payload. For parameter specifications, please refer to the [Volcengine Ark Official Documentation](https://www.volcengine.com/docs/82379/1298454).

### 2. Native Image Generation (Image Generations)
* **Endpoint**: `/api/v3/images/generations`
* **Request Method**: `POST`

Perfectly aligned with the Ark Text-to-Image interface, supporting native parameters such as specifying image aspect ratios, intelligent prompt rewriting, and watermarks.

### 3. Native Video Generation Tasks (Video Studio)
* **Submit Task**: `/api/v3/contents/generations/tasks` (`POST`)
* **Query Task Status**: `/api/v3/contents/generations/tasks/{task_id}` (`GET`)
* **Cancel/Delete Task**: `/api/v3/contents/generations/tasks/{task_id}` (`DELETE`)
* **List Task History**: `/api/v3/contents/generations/tasks` (`GET`)

### 4. Text-to-Speech API (TTS)
* **Event Stream Mode (SSE)**: `/api/v3/tts/unidirectional/sse` (`POST`)
* **Non-streaming HTTP Mode**: `/api/v3/tts/unidirectional` (`POST`)

The request header needs to use the Volcengine native format: `X-Api-Key: sk-your_token`. The model can be specified using the `X-Api-Resource-Id` header or written in the `model` request body. The gateway will return Volcengine standard JSON data (containing base64-encoded audio frames).
