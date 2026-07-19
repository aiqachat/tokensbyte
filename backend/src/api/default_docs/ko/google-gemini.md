# Google Gemini 네이티브 API 설명

Google 공식 SDK를 사용 중이거나, 프로토콜 변환 레이어를 건너뛰고 Gemini 네이티브의 Multi-modal, System Instruction 또는 JSON Mode를 사용하고자 하는 경우, 게이트웨이의 Google 네이티브 라우트를 직접 호출할 수 있습니다.

### 1. 텍스트 생성 (Non-stream)
* **경로**: `/v1beta/models/{model}:generateContent`
* **요청 메서드**: `POST`

### 2. 스트리밍 생성 (Streaming)
* **경로**: `/v1beta/models/{model}:streamGenerateContent`
* **요청 메서드**: `POST`

#### 핵심 요청 페이로드 예시
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

#### 인증 방식 (택일)
* 표준 헤더: `Authorization: Bearer sk-your_token`
* Google 헤더: `X-Goog-Api-Key: sk-your_token`
* URL 파라미터: `?key=sk-your_token`
