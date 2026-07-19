# Video Generation Endpoints

With the explosion of video foundation models in the AIGC field, the gateway has extended the `/v1/video/generations` endpoint under the standard OpenAI protocol framework, providing an out-of-the-box unified access route for mainstream video generation engines such as Volcengine Ark, Bailian Wanxiang, Kling AI, Jimeng AI, and Bytefor. Since most video models operate in asynchronous computing mode, the calling process is split into two steps: **submitting the task** and **polling for the result**.

### 1. Submit Video Task
* **Path**: `/v1/video/generations`
* **Method**: `POST`

#### Core Parameters
| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `model` | `string` | Yes | Video generation model name, e.g., `doubao-seedance-2-0`, `kling-v3-omni`, `wanx-v1` |
| `prompt` | `string` | Yes | Prompt text describing the video motion and scene |
| `negative_prompt` | `string` | No | Negative prompt text to avoid unwanted visual elements |
| `images` / `image_urls` | `array` | No | Array of reference images (URLs or base64). `image_urls` has the exact same effect as `images`. One image serves as first frame; two serve as start/end frames; 3+ serve as multi-image reference |
| `videos` | `array` | No | Array of reference video links for video-to-video or video control (e.g. Kling Omni reference, Bytefor reference) |
| `audios` | `array` | No | Array of reference audio links for background music/voiceovers (e.g. Volcengine, Bytefor) |
| `resolution` | `string` | No | Target resolution (e.g., `1080p`, `720p`, `480p`). The gateway auto-adapts this (e.g. Kling `1080p` maps to `pro`, `720p` maps to `std`) |
| `ratio` | `string` | No | Aspect ratio options (e.g., `16:9`, `9:16`, `4:3`, `3:4`, `1:1`) |
| `duration` | `integer` | No | Generated video duration in seconds (e.g., `5` or `10`). Auto-converted to `121` or `241` frames for Jimeng AI |
| `generate_audio` | `boolean` | No | Whether to concurrently generate matching background sound/voiceovers (default is `false`) |
| `watermark` | `boolean` | No | Whether to add a watermark to the generated video (supported by Volcengine, Alibaba, etc.) |
| `web_search` | `boolean` | No | Enable web search (OpenAI-style boolean, default `false`). the gateway converts it for Volcengine Seedance, etc. |
| `seed` | `integer` | No | Random seed for video generation determinism |

#### Submit Task Example
```bash
curl -X POST https://{{domain}}/v1/video/generations \
  -H "Authorization: Bearer sk-your_token" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "kling-v3-omni",
    "prompt": "推开欧式古典大门，展现在眼前的是一片奇幻的云海城堡，航拍视角，4k 级细节",
    "resolution": "1080p",
    "duration": 5
  }'
```

#### Submission Response (Get Task ID)
```json
{
  "id": "video_task_abc123xyz789",
  "task_id": "video_task_abc123xyz789",
  "status": "pending",
  "message": "Task submitted successfully"
}
```

### 2. Poll Task Result
* **Path**: `/v1/video/generations/{task_id}` or `/v1/tasks/{task_id}`
* **Method**: `GET`

#### Query Response Example (Success)
```json
{
  "id": "video_task_abc123xyz789",
  "task_id": "video_task_abc123xyz789",
  "status": "completed",
  "data": [
    {
      "url": "https://example.com/output/generated_video.mp4"
    }
  ]
}
```
