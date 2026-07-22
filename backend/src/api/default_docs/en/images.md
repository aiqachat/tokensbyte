# Image Generation & Editing Endpoints

The gateway's image generation interface is fully compatible with the official OpenAI image generation specifications. In the backend, the system integrates major image generation channels including Dall-E-3, Gemini Imagen, Volcengine Ark, Tencent Hunyuan, Alibaba Wanxiang, Jimeng AI, and automatically aligns and parses provider-specific parameters.

### 1. Image Generations
* **Path**: `/v1/images/generations`
* **Method**: `POST`

#### Major Request Parameters
| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `model` | `string` | Yes | Image generation model name, e.g., `dall-e-3` (OpenAI), `wanx-v1` (Alibaba Wanxiang), `seedream-5.0-lite` (Jimeng) |
| `prompt` | `string` | Yes | A text description of the desired image(s) |
| `n` | `integer` | No | The number of images to generate (default is `1`). The gateway will automatically translate this to the upstream native equivalent parameter |
| `size` | `string` | No | The resolution (e.g., `1024x1024`). The system will automatically translate the dimensions to the standard sizes supported by the corresponding provider |
| `watermark` | `boolean` | No | Whether to add a watermark to the image (supported by some channels like Volcengine and Alibaba Bailian) |
| `web_search` | `boolean` | No | Enable web search (OpenAI-style boolean, default `false`). the gateway converts it for Volcengine Seedream, etc. |
| `ratio` | `string` | No | Aspect ratio options (e.g., `16:9`, `3:4`, primarily used for image generation models supporting ratios such as Gemini) |
| `image` | `string` | No | Reference image URL for image-to-image (OpenAI protocol extension, accepting external image URLs) |

#### Curl Image Generation Example
```bash
curl -X POST https://{{domain}}/v1/images/generations \
  -H "Authorization: Bearer sk-your_token" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "dall-e-3",
    "prompt": "一只在太空中漂浮的宇航员猫，写实赛博朋克风格",
    "size": "1024x1024",
    "n": 1
  }'
```

#### Response Example (Returns Image URL)
```json
{
  "created": 1719441600,
  "data": [
    {
      "url": "https://example.com/output/img_abc123.png"
    }
  ]
}
```

### 2. Image Edits
* **Path**: `/v1/images/edits`
* **Method**: `POST`

Supports uploading a base image, a mask, and prompts to perform targeted edits, achieving local erasure and inpainting features.
