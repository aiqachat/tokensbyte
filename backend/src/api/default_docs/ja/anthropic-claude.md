# Anthropic Claude ネイティブ API 説明

ゲートウェイは Anthropic 公式の Messages API の直接呼び出しをサポートしており、ネイティブの Payload を直接送信して Claude シリーズモデル（例: `claude-3-5-sonnet-20241022`）を呼び出すことができます。

### 1. メッセージ生成対話 (Messages API)
* **リクエストパス**: `/v1/messages`
* **リクエストメソッド**: `POST`

#### 主要リクエストパラメータ説明
* **model** (string, 必須)
  Claude モデル名を指定します。例: `claude-3-5-sonnet-20241022`。
* **messages** (array, 必須)
  対話履歴データの配列。構造例: `[{"role": "user", "content": "你好"}]`。
* **max_tokens** (integer, 必須)
  生成される最大トークン数の制限。注意：Anthropic 公式プロトコルでは、このパラメータの指定が必須となっています。
* **system** (string, 任意)
  システムプロンプト（System Prompt）。モデルの役割や挙動を設定するために使用します。
* **stream** (boolean, 任意)
  SSE (Server-Sent Events) ストリーム形式で返却するかどうか。選択値は `true` または `false`。
* **temperature** (number, 任意)
  サンプリング温度。`0.0` から `1.0` の間。

#### 呼び出し例 (Curl)
```bash
curl -X POST https://{{domain}}/v1/messages \
  -H "x-api-key: sk-your_token" \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "max_tokens": 1024,
    "messages": [
      {"role": "user", "content": "你好，请用一句话描述你自己的核心特征。"}
    ]
  }'
```

### 2. API 認証方法
ネイティブの Claude API を呼び出す際、ゲートウェイは以下の 2 つの認証リクエストヘッダーをサポートします：
1. **統一 Bearer Token 認証 (推奨)**:
   ```http
   Authorization: Bearer sk-your_token
   ```
2. **Anthropic 公式 API キー**:
   ```http
   x-api-key: sk-your_token
   ```
