# チャットおよびレスポンスインターフェース

ゲートウェイが提供するチャットインターフェースは、OpenAI公式仕様と完全に下位互換性があります。実際に呼び出すモデルのバックエンドがOpenAI公式のものであっても、Google、Anthropic、Alibaba（アリ）、Volcengine（火山）などの他のプロバイダーのものであっても、ゲートウェイはバックエンドでリクエスト形式の変換とレスポンス形式の標準化をインテリジェントに完了します。

### 1. チャット対話インターフェース (Chat Completions)
* **パス**: `/v1/chat/completions`
* **リクエスト方式**: `POST`

#### 主要なリクエストパラメータの説明
| パラメータ名 | タイプ | 必須 | 説明 |
| :--- | :--- | :--- | :--- |
| `model` | `string` | はい | 対象モデル名。例：`gpt-4o`, `claude-3-5-sonnet-20241022`, `gemini-1.5-pro` |
| `messages` | `array` | はい | 対話履歴メッセージの配列。例：`[{"role": "user", "content": "こんにちは"}]` |
| `stream` | `boolean` | いいえ | SSE（Server-Sent Events）イベントストリーム方式（文字ごとの逐次返却）で返すかどうか（デフォルトは `false`） |
| `temperature` | `number` | いいえ | サンプリング温度 (0〜2)。数値が高いほどランダム性が強くなります。推奨値：`0.7` 〜 `1.0` |
| `max_tokens` | `integer` | いいえ | モデルが生成する最大トークン数の制限 |
| `tools` | `array` | いいえ | モデルが呼び出し可能なツール（Function Calling）のリスト |

#### ターミナル呼び出し例 (Curl)
```bash
curl -X POST https://{{domain}}/v1/chat/completions \
  -H "Authorization: Bearer sk-your_token" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "量子もつれについて説明してください。"}
    ],
    "stream": false
  }'
```

### 2. レスポンス透過送信インターフェース (Responses)
* **パス**: `/v1/responses`
* **リクエスト方式**: `POST`

> [!NOTE]
> ゲートウェイによる自動パラメータ検証やプロトコル変換をスキップし、バックエンドのOpenAIまたは火山方舟（Volcengine）モデルへ公式ネイティブの完全な Request Payload を直接送信したい場合は、`/v1/responses` インターフェースを使用できます。ゲートウェイは、リクエストボディを上流チャネルに無損失で透過送信（パススルー）しつつ、グローバル課金、クォータ制限、および使用ログ監査などのプラットフォーム中核機能を維持します。

#### リクエスト例
```json
{
  "model": "gpt-4o",
  "input": [
    {"role": "user", "content": "透過送信リクエスト内容"}
  ],
  "stream": false
} 
```
