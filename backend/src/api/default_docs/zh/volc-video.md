# 火山方舟视频生成接入指南

火山方舟（Volcengine Ark）平台提供了国内顶尖的视频生成大模型（如 `doubao-seedance-2-0`）。支持超强的画面物理规律还原与极高的光影连贯性。

网关已将其接入地址与 OpenAI 官方规范完全对齐。除了文生视频、图生视频，还支持“图片参考 + 视频参考”多模态融合生成。

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
    "model": "doubao-seedance-2-0",
    "prompt": "一只穿着红大衣的可爱小猫，在漫天大雪中好奇地伸爪抓雪花，写实电影画质，微距镜头",
    "resolution": "720p",
    "ratio": "16:9",
    "duration": 5,
    "generate_audio": true
  }'
```

### B. 单图/首尾帧图生视频
通过传入 1 或 2 张图片 URL，网关会自动将第一张图识别为首帧（若传 2 张，则第二张自动识别为尾帧），生成连贯平滑的动态视频。
```bash
curl -X POST https://{{domain}}/v1/video/generations \
  -H "Authorization: Bearer sk-your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "doubao-seedance-2-0",
    "prompt": "画面由第一张图片的森林日出平滑过渡到第二张图片的雷雨大作场景，大风吹拂树木",
    "images": [
      "https://example.com/forest_sunny.png",
      "https://example.com/forest_storm.png"
    ],
    "resolution": "720p",
    "ratio": "16:9",
    "duration": 5
  }'
```

### C. 多图外观/主体参考生视频 (不含视频参考)
当您想指定多张图片作为外观参考时，可以使用带有指定角色的对象数组。在没有视频参考时，网关底层的 `role` 字段（也可以使用 `type` 字段完全等价替代）应指定为 `"reference_image"`。
```bash
curl -X POST https://{{domain}}/v1/video/generations \
  -H "Authorization: Bearer sk-your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "doubao-seedance-2-0",
    "prompt": "参考图一中角色的发型与服饰、图二中的脸部轮廓以及图三中的背景，生成一段主角在木屋前缓缓走动的视频",
    "images": [
      {
        "url": "https://example.com/clothes_ref.png",
        "role": "reference_image"
      },
      {
        "url": "https://example.com/face_ref.png",
        "role": "reference_image"
      },
      {
        "url": "https://example.com/room_ref.png",
        "role": "reference_image"
      }
    ],
    "resolution": "720p",
    "ratio": "16:9",
    "duration": 5
  }'
```

### D. 图像参考 + 视频参考多模态混合生成
火山 Seedance 支持“图像参考（控制主体外观）+ 视频参考（控制镜头/运动轨迹）”混合生成。若请求中同时包含 `videos`，所有 `images` 均会被自动识别为外观参考（本示例中采用 `type` 字段演示等价替换 `role` 的形式）。

```bash
curl -X POST https://{{domain}}/v1/video/generations \
  -H "Authorization: Bearer sk-your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "doubao-seedance-2-0",
    "prompt": "让第一张图中的柴犬，完美复刻视频二中狗奔跑的轨迹与镜头摇移，动作写实连贯",
    "images": [
      {
        "url": "https://example.com/my_shiba_inu.png",
        "role": "reference_image"
      }
    ],
    "videos": [
      "https://example.com/running_action_reference.mp4"
    ],
    "resolution": "720p",
    "ratio": "16:9",
    "duration": 5
  }'
```

---

## 2. 轮询获取任务结果 (GET)

* **请求路径**: `/v1/video/generations/{task_id}` 
* **调用示例**：
```bash
curl -X GET https://{{domain}}/v1/video/generations/video_task_abc123 \
  -H "Authorization: Bearer sk-your_token_here"
```

---

## 3. 完整参数字典说明

| OpenAI 兼容参数名 | 类型 | 必填 | 默认值 | 描述与限制 |
| :--- | :--- | :--- | :--- | :--- |
| `model` | `string` | **是** | - | 目标视频生成模型名，传入 `doubao-seedance-2-0` 等。 |
| `prompt` | `string` | **是** | - | 视频生成画面与动作描述提示词。对中文理解极佳。 |
| `images` / `image_urls` | `array` | 否 | - | 图片参考数组。智能模式下：1张为首帧，2张为首尾帧。支持使用对象形式指定 `role` 或其等价字段 `type`（如 `"first_frame"`, `"last_frame"`, `"reference_image"`）。 |
| `videos` | `array` | 否 | - | 视频参考链接数组。传入网络直链视频 URL，用于控制视频生成的运动、背景或场景。 |
| `audios` | `array` | 否 | - | 音频参考链接数组。传入网络直链音频 URL（如音乐或人声），实现视频声画融合。 |
| `resolution` | `string` | 否 | `"720p"` | 目标视频清晰度。可选 `"720p"`、`"1080p"`。 |
| `ratio` | `string` | 否 | `"16:9"` | 目标画幅比例。可选 `"16:9"`, `"9:16"`, `"4:3"`, `"3:4"`, `"1:1"`。 |
| `duration` | `integer` | 否 | `5` | 视频时长（秒），可选 `5` 或 `10`。 |
| `camera_fixed` | `boolean` | 否 | `false` | 是否锁定镜头（不使用镜头运镜，保持静态视角拍摄）。 |
| `generate_audio` | `boolean` | 否 | `false` | 是否同步生成匹配的视频背景环境音效。 |
| `web_search` | `boolean` | 否 | `false` | 是否启用联网搜索（OpenAI 兼容布尔开关）。网关会自动转换为火山方舟等通道所需格式。 |
| `seed` | `integer` | 否 | - | 随机种子值，用于多次生成时的效果控制。 |

---

## 4. 返回结果示例 (200 OK)

* **提交任务响应**：
```json
{
  "id": "video_task_abc123",
  "task_id": "video_task_abc123",
  "status": "pending",
  "message": "Task submitted successfully"
}
```

* **查询结果响应（已完成）**：
```json
{
  "id": "video_task_abc123",
  "task_id": "video_task_abc123",
  "status": "completed",
  "data": [
    {
      "url": "https://example.com/output/generated_video.mp4"
    }
  ]
}
```
