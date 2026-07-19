# 可灵 Kling 视频生成接入指南

快手可灵 AI（Kling）具备行业顶尖的复杂物理模拟和运动连贯性。本平台提供了基于 OpenAI 兼容协议的视频路由分发，并在后台自动进行参数翻译与任务管理。

网关已将该通道的 `kling-v3-omni` 及其他模型包装为标准的 `/v1/video/generations` 路由。

---

## 1. 提交视频生成任务代码示例 (POST)

* **HTTP Method**: `POST`
* **请求路径**: `https://{{domain}}/v1/video/generations`
* **鉴权头部**: `Authorization: Bearer sk-your_token`

### A. 经典文生视频
```bash
curl -X POST https://{{domain}}/v1/video/generations \
  -H "Authorization: Bearer sk-your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "kling-v3-omni",
    "prompt": "繁华都市霓虹灯下的雨夜，一个打着雨伞的行人在积水的路面上缓慢行走，写实电影风格，光影斑驳",
    "negative_prompt": "画面模糊，低画质，崩坏肢体，水印",
    "resolution": "1080p",
    "ratio": "16:9",
    "duration": 5
  }'
```

### B. 经典图生视频 (首尾帧控制)
通过传入 2 张图片 URL，网关会自动映射到可灵的 `image`（首帧）与 `image_tail`（尾帧），生成两张图之间的平滑动态变化。
```bash
curl -X POST https://{{domain}}/v1/video/generations \
  -H "Authorization: Bearer sk-your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "kling-v3-omni",
    "prompt": "画面由第一张图片的人物微笑平滑过渡到第二张图片的惊讶表情，动作写实自然",
    "images": [
      "https://example.com/smile_face.png",
      "https://example.com/surprised_face.png"
    ],
    "duration": 5
  }'
```

### C. 多图融合参考 (Kling-v3-omni 独有)
对于支持多图/视频联合输入的 `kling-v3-omni`，网关会自动将 `images` 列表打包为官方要求的 `image_list`（带 `first_frame` / `end_frame` 类型标记）实现高级生成。
```bash
curl -X POST https://{{domain}}/v1/video/generations \
  -H "Authorization: Bearer sk-your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "kling-v3-omni",
    "prompt": "参考图片一中的女主角和图片二的复古咖啡馆场景，绘制一段平稳摇臂运镜的画面",
    "images": [
      {
        "url": "https://example.com/character.png",
        "role": "first_frame"
      },
      {
        "url": "https://example.com/coffee_shop.png",
        "role": "reference_image"
      }
    ],
    "duration": 5
  }'
```

### D. 图像参考 + 视频参考多模态混合生成 (Kling-v3-omni 独有)
可灵 v3-omni 模型支持同时传入图片与视频作为生成参考。网关底层会自动将 `videos` 参数转化为官方的 `video_list` 并配置相应的 `refer_type`（参考类型）。使用显式 `role`（或等价的 `type`）可以更精确地指定图片用途。
```bash
curl -X POST https://{{domain}}/v1/video/generations \
  -H "Authorization: Bearer sk-your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "kling-v3-omni",
    "prompt": "图一中的人物作为主角，完美复刻视频二中的太极招式动作，动作流畅，画风高清写实",
    "images": [
      {
        "url": "https://example.com/my_character.png",
        "role": "reference_image"
      }
    ],
    "videos": [
      "https://example.com/taichi_motion.mp4"
    ],
    "duration": 5
  }'
```

---

## 2. 轮询获取任务结果 (GET)

* **请求路径**: `/v1/video/generations/{task_id}` 或 `/v1/tasks/{task_id}`
* **调用示例**：
```bash
curl -X GET https://{{domain}}/v1/video/generations/video_task_xyz789 \
  -H "Authorization: Bearer sk-your_token_here"
```

---

## 3. 完整参数字典说明

| OpenAI 兼容参数名 | 类型 | 必填 | 默认值 | 描述与限制 |
| :--- | :--- | :--- | :--- | :--- |
| `model` | `string` | **是** | - | 视频生成模型名，传入 `kling-v3-omni`。 |
| `prompt` | `string` | **是** | - | 画面动作描述，字数上限 2000 字符。 |
| `negative_prompt` | `string` | 否 | - | 负向提示词，用于规避不需要的画面元素或质量缺陷。 |
| `images` / `image_urls` | `array` | 否 | - | 图片参考链接/对象数组。智能模式下：1张为首帧，2张为首尾帧。支持使用对象形式指定 `role` 或其等价字段 `type`。首帧可用 `"first_frame"`, `"first"`；尾帧可用 `"last_frame"`, `"end_frame"`, `"last"`, `"tail"`；参考图可用 `"reference_image"`。 |
| `videos` | `array` | 否 | - | **（v3-omni 独有）** 视频参考链接/对象数组。网关在后台自动映射为可灵官方 `video_list` (支持配置 `refer_type` 如 `"base"`) 参数。 |
| `resolution` | `string` | 否 | `"720p"` | 视频分辨率。传入 `"1080p"` 会自动配置为可灵官方的高级 `pro` 模式；传入 `"720p"` / `"480p"` 自动映射为标准 `std` 模式。 |
| `ratio` | `string` | 否 | `"16:9"` | 视频比例。可选 `"16:9"`, `"9:16"`, `"1:1"`（网关自动映射为官方 `aspect_ratio`）。 |
| `duration` | `integer` | 否 | `5` | 生成时长。通常可选 `5` 秒。 |
| `generate_audio` | `boolean` | 否 | `false` | 是否同时生成配套背景音效（网关将自动转换为可灵的 `sound` 参数值为 `"on"` 或 `"off"`）。 |
| `camera_control` | `object` | 否 | - | 镜头控制参数。包含 `pan` (水平)、`tilt` (垂直)、`zoom` (变焦)、`roll` (旋转) 等偏移，格式参考可灵官方定义。 |

---

## 4. 返回结果示例 (200 OK)

* **提交任务响应**：
```json
{
  "id": "video_task_xyz789",
  "task_id": "video_task_xyz789",
  "status": "pending",
  "message": "Task submitted successfully"
}
```

* **查询结果响应（已完成）**：
```json
{
  "id": "video_task_xyz789",
  "task_id": "video_task_xyz789",
  "status": "completed",
  "data": [
    {
      "url": "https://example.com/output/generated_video.mp4"
    }
  ]
}
```
