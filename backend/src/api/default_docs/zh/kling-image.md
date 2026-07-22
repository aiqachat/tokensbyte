# 可灵 Kling-v3 图像生成接入指南

`kling-v3-omni` 是快手可灵 AI 推出的新一代旗舰级生图与视频统一大模型。具备强大的复杂物理世界还原与高保真画质呈现。本网关对其生图接口进行了 OpenAI 协议的标准封装。

可灵 AI 生图分为 Omni 系列模型与普通系列模型。网关已在后台自动兼容处理了图生图（Image-to-Image）、主体参考（Subject Reference）以及比例分辨率的智能转译。

---

## 1. 提交生图任务代码示例 (POST)

* **HTTP Method**: `POST`
* **请求路径**: `https://{{domain}}/v1/images/generations`
* **鉴权头部**: `Authorization: Bearer sk-your_token`

### A. 经典文生图（带比例控制与负向提示词）

您可以通过指定比例、分辨率和负向提示词来控制生成效果。

```bash
curl -X POST https://{{domain}}/v1/images/generations \
  -H "Authorization: Bearer sk-your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "kling-v3-omni",
    "prompt": "繁华都市街头，雨夜的霓虹灯影倒映在湿滑的路面上，科幻写实风格，电影级弱光表现，4k分辨率",
    "negative_prompt": "低画质，模糊，崩坏，变形，丑陋",
    "ratio": "16:9",
    "resolution": "1k",
    "n": 1,
    "response_format": "url"
  }'
```

### B. 图生图与主体多图参考 (Image-to-Image / Subject Image)

网关会自动根据您的模型属性将图片列表路由到正确的通道中：
* **Omni 系列模型**：图片参数统一解析并填充到官方的 `image_list` 中。
* **普通系列模型**：
  * **单图图生图**（传入 1 张图片）。
  * **多图主体参考**（传入多张图片）。

```bash
curl -X POST https://{{domain}}/v1/images/generations \
  -H "Authorization: Bearer sk-your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "kling-v3-omni",
    "prompt": "将图一中的卡通角色造型，重绘融入到背景中，动作保持一致",
    "image_urls": [
      "https://example.com/assets/cartoon_char.png",
      "https://example.com/assets/background_scene.png"
    ],
    "ratio": "3:4",
    "n": 1
  }'
```

---

## 2. 完整参数字典说明

可灵 `Kling` 生图在网关中兼容支持并转换的各项字段：

| OpenAI 兼容参数名 | 类型 | 必填 | 默认值 | 描述与限制 |
| :--- | :--- | :--- | :--- | :--- |
| `model` | `string` | **是** | - | 图像生成模型标识，支持 `kling-v3-omni`（生图大模型）或其它可灵可用模型。 |
| `prompt` | `string` | **是** | - | 画面描述提示词，上限为 2000 个字符。 |
| `negative_prompt` | `string` | 否 | - | 负向提示词，用于过滤画面中不希望出现的各种内容、风格或低质伪影。 |
| `ratio` / `aspect_ratio` | `string` | 否 | `"1:1"` | 图片画幅比例。可选值有：`"1:1"`, `"16:9"`, `"9:16"`, `"4:3"`, `"3:4"`。网关会将其自动对齐转换为官方 `aspect_ratio` 参数。 |
| `resolution` / `size` | `string` | 否 | `"1k"` | 目标分辨率。可选 `"1k"`（最长边 1024 像素），网关会自动映射。 |
| `image` | `string / array` | 否 | - | 参考图片 URL。支持单个 URL 字符串或纯 URL 数组（用于触发图生图/多图主体参考生图）。 |
| `image_urls` | `array` | 否 | - | 纯参考图 URL 数组。 |
| `n` | `integer` | 否 | `1` | 期望生成的图片张数。支持 `1` 到 `4`（不同模型上限有所不同）。 |
| `watermark` | `boolean` | 否 | `false` | 是否添加可灵官方生图水印。 |
| `response_format` | `string` | 否 | `"url"` | 响应格式。可选 `"url"` (图片 URL) 或 `"b64_json"` (Base64 编码数据)。 |

---

## 3. 返回结果示例 (200 OK)

```json
{
  "created": 1719441600,
  "data": [
    {
      "url": "https://example.com/output/img_kling_city.png"
    }
  ]
}
```
