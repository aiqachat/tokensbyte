# Google Gemini ネイティブ API 説明

Google 公式 SDK をご使用の場合、またはプロトコル変換レイヤーをスキップして Gemini ネイティブの Multi-modal、System Instruction、または JSON Mode を使用したい場合は、ゲートウェイの Google ネイティブ ルーティングを直接呼び出すことができます。

### 1. テキスト生成 (Non-stream)
* **パス**: `/v1beta/models/{model}:generateContent`
* **リクエストメソッド**: `POST`

### 2. ストリーミング生成 (Streaming)
* **パス**: `/v1beta/models/{model}:streamGenerateContent`
* **リクエストメソッド**: `POST`

#### 主要リクエストペイロード例
```json
{
  "contents": [
    {
      "role": "user",
      "parts": [
        {
          "text": "请扮演我的私人旅行助手，规划一份 3 天的京都赏樱路线。"
        }
      ]
    }
  ],
  "systemInstruction": {
    "parts": [
      {
        "text": "你是一个专业的旅行规划师，语气亲切幽默。"
      }
    ]
  },
  "generationConfig": {
    "temperature": 0.4,
    "maxOutputTokens": 2000,
    "responseMimeType": "text/plain"
  }
}
```

#### 認証方法（以下のいずれか1つ）
* 標準ヘッダー: `Authorization: Bearer sk-your_token`
* Google ヘッダー: `X-Goog-Api-Key: sk-your_token`
* URL パラメータ末尾: `?key=sk-your_token`
