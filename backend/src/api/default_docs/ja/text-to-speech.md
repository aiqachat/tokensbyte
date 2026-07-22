# 音声合成インターフェース (Text-to-Speech)

音声合成（TTS）は、入力されたテキストを自然で流暢な人間の声のオーディオストリームに変換することができます。ゲートウェイのインターフェースは OpenAI の `/v1/audio/speech` 仕様と高度に一致しており、火山方舟（Volcengine）などの高度な音声モデルの自動コーデック変換をサポートしています。

### 1. 音声合成インターフェース
* **パス**: `/v1/audio/speech`
* **リクエスト方式**: `POST`

#### リクエストパラメータの説明
| パラメータ名 | タイプ | 必須 | 説明 |
| :--- | :--- | :--- | :--- |
| `model` | `string` | はい | 音声合成モデル名。例：`tts-1` (OpenAI), `seed-tts-2.0` (火山大規模音声モデル) |
| `input` | `string` | はい | 合成対象のテキストコンテンツ。最大文字数は通常、具体的なモデルの仕様によって決まります |
| `voice` | `string` | はい | 音色識別子。火山方舟の場合は speaker ID を渡す必要があります（例：`zh_female_vv_uranus_bigtts`） |
| `response_format` | `string` | いいえ | オーディオストリームの返却フォーマット。選択肢：`mp3` (デフォルト), `opus`, `aac`, `flac`, `wav`, `pcm` |
| `speed` | `number` | いいえ | 話速の調整倍率（`0.25` 〜 `4.0`，デフォルトは `1.0`） |

#### 呼び出し例
```bash
curl -X POST https://{{domain}}/v1/audio/speech \
  -H "Authorization: Bearer sk-your_token" \
  -H "Content-Type: application/json" \
  -o output.mp3 \
  -d '{
    "model": "seed-tts-2.0",
    "input": "こんにちは。統一スマート音声合成システムへようこそ。合成したいテキストを以下に入力してください。",
    "voice": "zh_female_vv_uranus_bigtts",
    "response_format": "mp3"
  }'
```

> [!NOTE]
> ゲートウェイはこのインターフェースにおいて、純粋なバイナリのオーディオデータストリームを返します（HTTPバイナリレスポンス、Content-Type は `audio/mpeg` または対応するオーディオ形式タイプになります）。火山 TTS V3 については、ゲートウェイが SSE イベントストリーム内の Base64 エンコードデータを自動的にマージ・デコードしてバイナリストリームとして返却するため、フロントエンド開発でのパースの手間を大幅に軽減します。
