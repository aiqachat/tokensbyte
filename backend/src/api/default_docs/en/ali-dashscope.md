# Alibaba Bailian (DashScope) Native API Guide

The gateway is fully compatible with the native API routing of Alibaba Cloud Bailian (DashScope) LLMs, image, and video models, supporting complete status extraction and billing auditing.

### 1. Wanx Video Generation (Submit Video)
* **Path**: `/api/v1/services/aigc/video-generation/video-synthesis`
* **Request Method**: `POST`

#### Request Example
```json
{
  "model": "wanx-v1",
  "input": {
    "prompt": "一只金毛寻回犬在金色的秋天落叶中奔跑"
  },
  "parameters": {
    "resolution": "1280*720",
    "duration": 5
  }
} 
```
The gateway automatically intercepts and injects the `X-DashScope-Async: enable` request header to achieve automatic hosting and submission of asynchronous tasks.

### 2. Wanx Image Generation (Submit Image)
* **Path**: `/api/v1/services/aigc/multimodal-generation/generation`
* **Request Method**: `POST`

The format is similar to video, supporting direct transparent transmission of vendor-specific control parameters such as seed and size.

### 3. Asynchronous Task Status Query
* **Path**: `/api/v1/tasks/{task_id}`
* **Request Method**: `GET`

Both Alibaba Wanx video and image tasks use Bailian's unified asynchronous task ID. You can use the native `task_id` for polling. The gateway will extract the corresponding usage for billing deduction after the status changes to `succeeded` or `failed`.

### 4. Text Embeddings (Embeddings) and Rerank
* **Embeddings API**: `/compatible-mode/v1/embeddings` (`POST`)
  Supports official Tongyi Qianwen embedding models (e.g., `text-embedding-v4`), billed by the total number of tokens.
* **Document Reranking API (Rerank)**:
  * Compatible path (used for qwen3-rerank, etc.): `/compatible-api/v1/reranks`
  * Native path (used for gte-rerank-v2, etc.): `/api/v1/services/rerank/text-rerank/text-rerank`
