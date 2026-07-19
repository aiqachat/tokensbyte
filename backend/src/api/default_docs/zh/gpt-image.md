# GPT-gpt-image-2 图像生成与编辑接入指南

`gpt-image-2` 是 OpenAI 旗下最新一代旗舰图像生成与编辑模型（完美对齐并支持 DALL-E 旗舰生图标准），具备极高的提示词还原能力和清晰写实的画面质感。

网关已将其接入地址与 OpenAI 官方规范完全对齐。除了支持经典的**文生图 (Generations)**，还全面兼容**图像编辑与局部重绘 (Image Edits)**。

---

## 1. 基础调用地址 (Endpoint)

* **HTTP Method**: `POST`
* **文生图路由**: `https://{{domain}}/v1/images/generations`
* **图像编辑与局部重绘路由**: `https://{{domain}}/v1/images/edits`
* **鉴权头部**: `Authorization: Bearer sk-your_token`

---

## 2. 经典文生图 (Text-to-Image) 示例

### A. 代码调用示例
:::tabs
=== cURL
```bash
curl -X POST https://{{domain}}/v1/images/generations \
  -H "Authorization: Bearer sk-your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-image-2",
    "prompt": "一个极简主义风格的宇航员，站在红色荒凉的火星表面，背景是浩瀚的宇宙星空，高分辨率",
    "size": "1024x1024",
    "n": 1,
    "response_format": "url"
  }'
```
=== Python
```python
import openai

client = openai.OpenAI(
    api_key="sk-your_token_here",
    base_url="https://{{domain}}/v1"
)

response = client.images.generate(
    model="gpt-image-2",
    prompt="一个极简主义风格的宇航员，站在红色荒凉的火星表面，背景是浩瀚的宇宙星空，高分辨率",
    size="1024x1024",
    n=1,
    response_format="url"
)
print(response.data[0].url)
```
=== Node.js
```javascript
const { OpenAI } = require("openai");

const openai = new OpenAI({
  apiKey: "sk-your_token_here",
  baseURL: "https://{{domain}}/v1"
});

async function main() {
  const image = await openai.images.generate({
    model: "gpt-image-2",
    prompt: "一个极简主义风格的宇航员，站在红色荒凉的火星表面，背景是浩瀚的宇宙星空，高分辨率",
    size: "1024x1024",
    n: 1,
  });

  console.log(image.data[0].url);
}
main();
```
:::

---

## 3. 图像编辑与局部重绘 (Image Edits) 示例

图像编辑路由为 `/v1/images/edits`。网关同时兼容 `JSON` 格式与 `Form-Data` 格式，具体使用取决于上游通道支持情况或您的客户端便利性：

### A. 极简 JSON 传参方式 (直接传网络图片 URL)
无需繁琐的文件流处理，直接通过 JSON 传递底图与遮罩图的网络公开直链。

```bash
curl -X POST https://{{domain}}/v1/images/edits \
  -H "Authorization: Bearer sk-your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-image-2",
    "image": "https://example.com/assets/my_avatar.png",
    "mask": "https://example.com/assets/mask_face.png",
    "prompt": "在遮罩涂抹的脸部区域加上一副酷炫的墨镜，保持逼真光影",
    "size": "1024x1024",
    "n": 1,
    "response_format": "url"
  }'
```

### B. OpenAI 标准 Form-Data 传参方式 (上传本地二进制文件)
兼容官方标准，直接上传客户端本地图片执行修改。

```bash
curl -X POST https://{{domain}}/v1/images/edits \
  -H "Authorization: Bearer sk-your_token_here" \
  -F "model=gpt-image-2" \
  -F "image=@/path/to/my_avatar.png" \
  -F "mask=@/path/to/mask_face.png" \
  -F "prompt=在遮罩涂抹的脸部区域加上一副酷炫的墨镜，保持逼真光影" \
  -F "size=1024x1024" \
  -F "n=1" \
  -F "response_format=url"
```

### C. Python SDK 图像编辑示例
```python
import openai

client = openai.OpenAI(
    api_key="sk-your_token_here",
    base_url="https://{{domain}}/v1"
)

# 传入本地打开的二进制文件流
response = client.images.edit(
    model="gpt-image-2",
    image=open("/path/to/my_avatar.png", "rb"),
    mask=open("/path/to/mask_face.png", "rb"),
    prompt="在遮罩涂抹的脸部区域加上一副酷炫的墨镜，保持逼真光影",
    size="1024x1024",
    n=1,
    response_format="url"
)
print(response.data[0].url)
```

---

## 4. 请求参数说明

| 参数名 | 类型 | 必填 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- | :--- |
| `model` | `string` | **是** | - | 图像生成模型名，传入 `gpt-image-2`。 |
| `prompt` | `string` | **是** | - | 画面描述提示词（文生图时限制 1000 字符内）。在图像编辑（edits）中，描述需要做出的具体改动。 |
| `image` | `file / string` | 否 | - | **图像编辑 (edits) 必填**。需要编辑的底图文件（Form-Data 方式）或底图网络直链 URL（JSON 方式）。格式须为正方形 PNG 文件，小于 4MB。 |
| `mask` | `file / string` | 否 | - | **图像编辑 (edits) 可选**。遮罩图（PNG 文件或网络直链），其中透明区域（Alpha通道）指示了需要进行擦除和重新绘制的部分。 |
| `size` | `string` | 否 | `1024x1024` | 画面分辨率规格。可选：`1024x1024`、`1024x1792`、`1792x1024`。 |
| `response_format` | `string` | 否 | `url` | 返回的格式，可选 `url` (图片下载链接) 或 `b64_json` (Base64 编码数据)。 |
| `n` | `integer` | 否 | `1` | 生成图片数量。每次限制最多返回 1 张图片。 |

---

## 5. 返回结果示例 (200 OK)

```json
{
  "created": 1719441600,
  "data": [
    {
      "url": "https://example.com/output/img_astronaut_gptimage2.png"
    }
  ]
}
```
