# Anthropic Claude 네이티브 API 설명

게이트웨이는 Anthropic 공식 Messages API의 직접 호출을 지원하므로, 네이티브 Payload를 직접 전송하여 Claude 시리즈 모델(예: `claude-3-5-sonnet-20241022`)을 호출할 수 있습니다.

### 1. 메시지 생성 대화 (Messages API)
* **요청 경로**: `/v1/messages`
* **요청 메서드**: `POST`

#### 핵심 요청 파라미터 설명
* **model** (string, 필수)
  Claude 모델명을 지정합니다. 예: `claude-3-5-sonnet-20241022`.
* **messages** (array, 필수)
  대화 이력 데이터 배열입니다. 구조 예: `[{"role": "user", "content": "你好"}]`.
* **max_tokens** (integer, 필수)
  생성할 최대 토큰 수 제한입니다. 주의: Anthropic 공식 프로토콜에 따라 이 파라미터는 필수로 입력해야 합니다.
* **system** (string, 선택)
  시스템 프롬프트(System Prompt)로, 모델의 역할과 행동을 설정하는 데 사용됩니다.
* **stream** (boolean, 선택)
  SSE(Server-Sent Events) 스트리밍 형식으로 반환할지 여부입니다. 선택 가능한 값은 `true` 또는 `false`입니다.
* **temperature** (number, 선택)
  샘플링 온도로, `0.0`에서 `1.0` 사이의 값입니다.

#### 호출 예시 (Curl)
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

### 2. API 인증 방식
네이티브 Claude API 호출 시, 게이트웨이는 다음 두 가지 인증 요청 헤더를 지원합니다:
1. **통합 Bearer Token 인증 (권장)**:
   ```http
   Authorization: Bearer sk-your_token
   ```
2. **Anthropic 공식 API Key**:
   ```http
   x-api-key: sk-your_token
   ```
