# Google Gemini-3.1 Image Generation Example

`gemini-3.1-flash-image-preview` is the latest fast, high-quality multimodal image generation model from Google. This platform wraps it as an OpenAI-compatible image generation route.

Since the official Google Gemini Image API has specific parameters for aspect ratios and resolutions, please use the `ratio` and `resolution` parameters demonstrated below.

### 1. Endpoint
* **HTTP Method**: `POST`
* **Request Path**: `https://{{domain}}/v1/images/generations`

### 2. Code Example
:::tabs
=== cURL
```bash
curl -X POST https://{{domain}}/v1/images/generations \
  -H "Authorization: Bearer sk-your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-3.1-flash-image-preview",
    "prompt": "Japanese courtyard in sunny day, cherry blossoms falling, clear pond, highly detailed lighting effects",
    "ratio": "1:1",
    "resolution": "1k",
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
    model="gemini-3.1-flash-image-preview",
    prompt="Japanese courtyard in sunny day, cherry blossoms falling, clear pond, highly detailed lighting effects",
    extra_body={
        "ratio": "1:1",
        "resolution": "1k"
    },
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
    model: "gemini-3.1-flash-image-preview",
    prompt: "Japanese courtyard in sunny day, cherry blossoms falling, clear pond, highly detailed lighting effects",
    n: 1,
    // Pass custom parameters using object destructuring for gateway compatibility
    ...{
      ratio: "1:1",
      resolution: "1k"
    }
  });

  console.log(image.data[0].url);
}
main();
```
:::

### 3. Request Parameters

To simplify integration, the gateway converts standard OpenAI parameters to match Gemini's specifications:

| OpenAI-Compatible Parameter | Type | Required | Default | Description & Restrictions |
| :--- | :--- | :--- | :--- | :--- |
| `model` | `string` | Yes | - | Name of the model. Pass `gemini-3.1-flash-image-preview`. |
| `prompt` | `string` | Yes | - | Text prompt describing the image. |
| `ratio` | `string` | No | `"1:1"` | Aspect ratio of the generated image. Supported values: `"1:1"`, `"3:4"`, `"4:3"`, `"9:16"`, `"16:9"`, etc. Takes precedence over `size`. |
| `resolution` | `string` | No | `"1k"` | Resolution of the image. Supported values: `"1k"` (max side 1024px), `"2k"` (max side 2048px), etc. Takes precedence over `size`. |
| `size` | `string` | No | - | **Fallback Parameter**: If a ratio format containing a colon is passed (e.g. `"1:1"`), it maps to `ratio`; if `"1k"` is passed, it maps to `resolution`. **Do not pass absolute dimensions like `"1024x1024"`, otherwise upstream API will reject it.** |
| `response_format` | `string` | No | `url` | Format of response. Support `url` or `b64_json`. |
| `n` | `integer` | No | `1` | Number of images to generate. |

### 4. Response Example (200 OK)
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
