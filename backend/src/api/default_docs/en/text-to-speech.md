# Text-to-Speech (TTS) Endpoints

Text-to-Speech (TTS) converts input text into natural, fluent human-like audio streams. The gateway interface remains highly compatible with the OpenAI `/v1/audio/speech` specification, and supports automatic encoding and decoding translation for advanced voice models such as Volcengine Ark.

### 1. Speech Synthesis
* **Path**: `/v1/audio/speech`
* **Method**: `POST`

#### Request Parameters
| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `model` | `string` | Yes | TTS model name, e.g., `tts-1` (OpenAI), `seed-tts-2.0` (Volcengine Speech LLM) |
| `input` | `string` | Yes | The text to be synthesized into speech. The maximum length is determined by the specific model specifications |
| `voice` | `string` | Yes | Voice identity/timbre. For Volcengine Ark, pass the speaker ID (e.g., `zh_female_vv_uranus_bigtts`) |
| `response_format` | `string` | No | Audio format. Options: `mp3` (default), `opus`, `aac`, `flac`, `wav`, `pcm` |
| `speed` | `number` | No | Speed adjustment factor (`0.25` to `4.0`, default is `1.0`) |

#### Calling Example
```bash
curl -X POST https://{{domain}}/v1/audio/speech \
  -H "Authorization: Bearer sk-your_token" \
  -H "Content-Type: application/json" \
  -o output.mp3 \
  -d '{
    "model": "seed-tts-2.0",
    "input": "您好，欢迎使用统一智能语音合成系统，请在下方输入您希望合成的文本内容。",
    "voice": "zh_female_vv_uranus_bigtts",
    "response_format": "mp3"
  }'
```

> [!NOTE]
> The gateway returns raw binary audio data stream for this endpoint (HTTP binary response, with `Content-Type` set to `audio/mpeg` or the corresponding audio format type). For Volcengine TTS V3, the gateway automatically decodes and merges the Base64 encoded data from the SSE event stream, returning it as a binary stream. This greatly simplifies frontend parsing and development.
