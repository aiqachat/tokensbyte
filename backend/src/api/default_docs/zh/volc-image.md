# seedream 图像生成接入指南

`doubao-seedream-5-0-260128` 是字节跳动即梦 AI 推出的全新一代生图旗舰模型。具备超强的中文提示词理解力和极其出色的画面细节呈现，是国内目前最顶尖的商业级作画工具。

网关已将该模型封装并兼容标准的 OpenAI 图像协议。对于火山方舟原生特有的组图生成（Sequential Image Generation）和图生图参数，系统已在后台完成全自动转换对齐。

---

## 1. 提交生图任务代码示例 (POST)

* **HTTP Method**: `POST`
* **请求路径**: `https://{{domain}}/v1/images/generations`
* **鉴权头部**: `Authorization: Bearer sk-your_token`

### A. 经典文生图（多图并行/顺序生成）

通过 `n` 参数，网关将自动向火山引擎发送组图并行生成参数（`sequential_image_generation = "auto"`），提供完美的组图体验。

```bash
curl -X POST https://{{domain}}/v1/images/generations \
  -H "Authorization: Bearer sk-your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "doubao-seedream-5-0-260128",
    "prompt": "一只穿着红色唐装的小柴犬，坐在大门红灯笼下拜年，国潮插画风格，喜庆温馨，4k分辨率",
    "size": "2k",
    "n": 2,
    "watermark": false,
    "response_format": "url"
  }'
```

### B. 图生图与多图参考生图 (Image-to-Image)

火山方舟原生生图 API 深度支持图生图和多图融合参考。您可以传入 1 张或多张参考图片链接，网关会自动将 OpenAI 的 `image`/`image_urls` 数组转化为火山官方的 `image`（支持多参考图直传）参数。

```bash
curl -X POST https://{{domain}}/v1/images/generations \
  -H "Authorization: Bearer sk-your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "doubao-seedream-5-0-260128",
    "prompt": "参考图一中柴犬的神态和图二的古风房屋背景，绘制一幅精美的贺年国画插图",
    "image_urls": [
      "https://example.com/assets/dog.png",
      "https://example.com/assets/background.png"
    ],
    "size": "2k",
    "n": 1
  }'
```

---

## 2. 完整参数字典说明

火山 `doubao-seedream` 支持并对齐的各项字段说明：

| OpenAI 兼容参数名 | 类型 | 必填 | 默认值 | 描述与限制 |
| :--- | :--- | :--- | :--- | :--- |
| `model` | `string` | **是** | - | 图像生成模型标识，传入 `doubao-seedream-5-0-260128`。 |
| `prompt` | `string` | **是** | - | 画面描述提示词，火山引擎对中文指令理解极其优秀，建议详细描述。 |
| `size` / `resolution` | `string` | 否 | `"2k"` | 目标分辨率。可选值有：`"512x512"`, `"768x1024"`, `"1024x720"` 等像素格式，或直接传快捷比例字符如 `"1k"`, `"2k"`, `"4k"` 等（默认 `"2k"`）。 |
| `image` | `string / array` | 否 | - | 参考图片 URL（支持单个字符串或数组形式，用于触发图生图/多图参考生图）。 |
| `image_urls` | `array` | 否 | - | 纯参考图 URL 数组。用于指定多图融合参考生图。 |
| `n` | `integer` | 否 | `1` | 期望生成的图片张数。若 `n > 1`，网关会自动配置火山原生的 `sequential_image_generation` 选项。 |
| `watermark` | `boolean` | 否 | `false` | 是否包含火山官方生图水印。 |
| `web_search` | `boolean` | 否 | `false` | 是否启用联网搜索（OpenAI 兼容布尔开关）。网关会自动转换。 |
| `response_format` | `string` | 否 | `"url"` | 返回格式。可选 `"url"` (图片 URL) 或 `"b64_json"` (Base64 编码数据)。 |

---

## 3. 返回结果示例 (200 OK)

```json
{
  "created": 1719441600,
  "data": [
    {
      "url": "https://example.com/output/img_seedream_dog_1.png"
    },
    {
      "url": "https://example.com/output/img_seedream_dog_2.png"
    }
  ]
}
```
