# GPT-gpt-image-2 Image Generation Example

gpt-image-2 is OpenAI's latest flagship text-to-image model, featuring unmatched prompt adherence and crisp, realistic visual details. This gateway aligns all request fields seamlessly.

### 1. Base URL & Endpoint
* **HTTP Method**: `POST`
* **Request Path**: `https://{{domain}}/v1/images/generations`

### 2. Code Examples
:::tabs
=== cURL
```bash
curl -X POST https://{{domain}}/v1/images/generations \
  -H "Authorization: Bearer sk-your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-image-2",
    "prompt": "A minimalist astronaut standing on the red, desolate Martian surface, vast cosmic starry sky in the background, high resolution",
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
    prompt="A minimalist astronaut standing on the red, desolate Martian surface, vast cosmic starry sky in the background, high resolution",
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
    prompt: "A minimalist astronaut standing on the red, desolate Martian surface, vast cosmic starry sky in the background, high resolution",
    size: "1024x1024",
    n: 1,
  });

  console.log(image.data[0].url);
}
main();
```
:::

### 3. Request Parameters
| Parameter | Type | Required | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `model` | `string` | Yes | - | Name of the model. Use `gpt-image-2`. |
| `prompt` | `string` | Yes | - | Text prompt describing the image. |
| `size` | `string` | No | `1024x1024` | Image dimensions: `1024x1024`, `1024x1792`, or `1792x1024`. |
| `response_format` | `string` | No | `url` | Response format: `url` or `b64_json`. |
| `n` | `integer` | No | `1` | Number of images to generate (usually restricted to 1). |

### 4. Response Example (200 OK)
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
