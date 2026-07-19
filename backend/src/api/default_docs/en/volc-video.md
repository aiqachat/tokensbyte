# Volcengine Seedance Video Generation Example

doubao-seedance-2-0 is a flagship video generation model launched by ByteDance's Volcengine. Due to substantial computing overhead, it employs an **asynchronous pattern**. Developers first **submit a generation task** to get a `task_id`, and then **poll the task status** to obtain the final video URL.

### 1. Step 1: Submit Video Generation Task (Submit Task)
* **HTTP Method**: `POST`
* **Request Path**: `https://{{domain}}/v1/video/generations`

#### Curl Example
```bash
curl -X POST https://{{domain}}/v1/video/generations \
  -H "Authorization: Bearer sk-your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "doubao-seedance-2-0",
    "prompt": "A gorgeous phoenix soaring up from the burning ruins of an ancient city, slow motion, epic atmospheric visual, 4K details",
    "duration": 5
  }'
```

#### Response Example (returns task_id)
```json
{
  "id": "vtask-volc-882ab381cd84e0",
  "task_id": "vtask-volc-882ab381cd84e0",
  "status": "pending",
  "message": "Task submitted successfully"
}
```

---

### 2. Step 2: Poll for Results (Query Task)
* **HTTP Method**: `GET`
* **Request Path**: `https://{{domain}}/v1/video/generations/{task_id}`

#### Curl Query Example
```bash
curl -X GET https://{{domain}}/v1/video/generations/vtask-volc-882ab381cd84e0 \
  -H "Authorization: Bearer sk-your_token_here"
```

#### Response Example (in progress)
```json
{
  "id": "vtask-volc-882ab381cd84e0",
  "task_id": "vtask-volc-882ab381cd84e0",
  "status": "processing",
  "message": "Task is being processed"
}
```

#### Response Example (completed)
```json
{
  "id": "vtask-volc-882ab381cd84e0",
  "task_id": "vtask-volc-882ab381cd84e0",
  "status": "completed",
  "data": [
    {
      "url": "https://example.com/output/volc_phoenix_video.mp4"
    }
  ]
}
```

---

### 3. Request Parameters (Submit Task)
| Parameter | Type | Required | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `model` | `string` | Yes | - | Name of the model. Use `doubao-seedance-2-0`. |
| `prompt` | `string` | Yes | - | Motion and scene description prompt. |
| `duration` | `integer` | No | `5` | Video length in seconds (e.g. `5` or `10`). |
| `watermark` | `boolean` | No | `false` | Whether to append the official model watermark. |
| `web_search` | `boolean` | No | `false` | Enable web search. Use this OpenAI-style boolean; — the gateway converts it for Volcengine. |
