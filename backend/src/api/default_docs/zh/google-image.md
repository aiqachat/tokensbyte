# 谷歌 gemini-3.1 图像生成接入指南

`gemini-3.1-flash-image-preview` 是 Google 旗下最新推出的极速、高品质多模态图像生成接口。本平台已将其统一包装为向下兼容的 OpenAI 标准生图路由。

由于 Google Gemini 官方 Imagen 生图 API 对尺寸和比例有特殊的入参规范，请使用下方演示的 `ratio` (比例) 与 `resolution` (分辨率) 参数进行调用。

---

## 1. 提交生图任务代码示例 (POST)

* **HTTP Method**: `POST`
* **请求路径**: `https://{{domain}}/v1/images/generations`
* **鉴权头部**: `Authorization: Bearer sk-your_token`

### A. 经典文生图（带比例与分辨率控制）

```bash
curl -X POST https://{{domain}}/v1/images/generations \
  -H "Authorization: Bearer sk-your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-3.1-flash-image-preview",
    "prompt": "阳光照耀下的日式庭院，樱花飘落，清澈的池塘，极细致光影效果，新海诚动画风格",
    "ratio": "16:9",
    "resolution": "1k",
    "n": 1,
    "response_format": "url"
  }'
```

### B. 图生图 (Image-to-Image) / 参考图生图

Gemini 图像引擎支持传入网络直链图片 URL 或 `data:image/png;base64,...` 数据，以执行图生图或多图参考生成。

```bash
curl -X POST https://{{domain}}/v1/images/generations \
  -H "Authorization: Bearer sk-your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-3.1-flash-image-preview",
    "prompt": "将这只猫在画面中画得更加科幻，添加发光的机械眼，赛博朋克写实风",
    "image": "https://example.com/assets/my_cat.png",
    "ratio": "1:1",
    "resolution": "1k",
    "response_format": "url"
  }'
```

### C. 搜索增强生图 (Search Grounding)

您可以启用谷歌原生搜索或谷歌图片搜索组件，使模型在生成时能联网检索现实世界中最新的视觉信息辅助作画。

```bash
curl -X POST https://{{domain}}/v1/images/generations \
  -H "Authorization: Bearer sk-your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-3.1-flash-image-preview",
    "prompt": "绘制一幅 2026 年最新款智能手机的概念设计图，展现透明屏幕",
    "google_search": true,
    "google_image_search": true,
    "ratio": "16:9",
    "resolution": "1k"
  }'
```

---

## 2. 完整参数字典说明

本网关自动完成 OpenAI 规范到谷歌官方的对齐适配，支持以下字段：

| OpenAI 兼容参数名 | 类型 | 必填 | 默认值 | 描述与限制 |
| :--- | :--- | :--- | :--- | :--- |
| `model` | `string` | **是** | - | 图像生成模型标识，传入 `gemini-3.1-flash-image-preview`。 |
| `prompt` | `string` | **是** | - | 描述画面的中英文提示词。 |
| `image` | `string / array` | 否 | - | 单个参考图 URL 字符串，或者 URL 数组（用于图生图参考）。 |
| `image_urls` | `array` | 否 | - | 纯参考图 URL 数组。与 `image` 二选一，支持多图参考。 |
| `ratio` | `string` | 否 | `"1:1"` | 图片宽高比。可选值：`"1:1"`, `"3:4"`, `"4:3"`, `"9:16"`, `"16:9"`。优先级高于 `size`。 |
| `resolution` | `string` | 否 | `"1k"` | 画面分辨率大小。可选值：`"1k"` (最长边 1024 像素)、`"2k"` (最长边 2048 像素) 等。优先级高于 `size`。 |
| `size` | `string` | 否 | - | **兼容参数**：若传入带冒号的比例（如 `"16:9"` 等）会自动映射为 `ratio`；传入不带冒号的（如 `"1k"` 等）映射为 `resolution`。**避免直接传入 `"1024x1024"` 像素值**。 |
| `response_format` | `string` | 否 | `"url"` | 响应格式。可选 `"url"` (返回可下载的图片链接) 或 `"b64_json"` (返回 Base64 编码的图像数据)。 |
| `n` | `integer` | 否 | `1` | 期望生成的图片张数。 |
| `google_search` | `boolean` | 否 | `false` | 是否开启 Google Search 搜索增强联网工具。 |
| `google_image_search` | `boolean` | 否 | `false` | 是否开启谷歌图片搜索联网辅助工具。 |

---

## 3. 返回结果示例 (200 OK)

```json
{
  "created": 1719441600,
  "data": [
    {
      "url": "https://example.com/output/img_gemini_garden.png"
    }
  ]
}
```
