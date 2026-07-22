# 채팅 및 응답 인터페이스

게이트웨이가 제공하는 채팅 인터페이스는 OpenAI 공식 사양과 완전한 하위 호환성을 제공합니다. 실제로 호출하는 백엔드 모델이 OpenAI 공식 모델이든, Google, Anthropic, 알리바바(Ali), 볼케인진(Volcengine) 등 기타 제공업체의 모델이든 관계없이, 게이트웨이가 백엔드에서 요청 형식의 변환과 응답 형식의 표준화 및 정규화를 지능적으로 처리합니다.

### 1. 채팅 대화 인터페이스 (Chat Completions)
* **경로**: `/v1/chat/completions`
* **요청 방식**: `POST`

#### 핵심 요청 매개변수 설명
| 매개변수명 | 타입 | 필수 여부 | 설명 |
| :--- | :--- | :--- | :--- |
| `model` | `string` | 예 | 대상 모델 이름 (예: `gpt-4o`, `claude-3-5-sonnet-20241022`, `gemini-1.5-pro`) |
| `messages` | `array` | 예 | 대화 기록 메시지 배열 (예: `[{"role": "user", "content": "안녕하세요"}]`) |
| `stream` | `boolean` | 아니오 | SSE 이벤트 스트림(단어 단위 실시간 출력) 방식으로 응답할지 여부 (기본값: `false`) |
| `temperature` | `number` | 아니오 | 샘플링 온도 (0~2). 값이 높을수록 무작위성이 강해지며, `0.7` ~ `1.0` 권장 |
| `max_tokens` | `integer` | 아니오 | 모델이 생성할 수 있는 최대 토큰 수 제한 |
| `tools` | `array` | 아니오 | 모델이 호출할 수 있는 도구 (Function Calling) 목록 |

#### 터미널 호출 예시 (Curl)
```bash
curl -X POST https://{{domain}}/v1/chat/completions \
  -H "Authorization: Bearer sk-your_token" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "请解释什么是量子纠缠。"}
    ],
    "stream": false
  }'
```

### 2. 응답 직접 전달(Pass-through) 인터페이스 (Responses)
* **경로**: `/v1/responses`
* **요청 방식**: `POST`

> [!NOTE]
> 게이트웨이의 자동 매개변수 검증 및 프로토콜 변환을 건너뛰고, 백엔드의 OpenAI 또는 볼케인진(Volcengine) 모델에 직접 공식 네이티브 요청 페이로드(Request Payload) 전체를 전송하려는 경우, `/v1/responses` 인터페이스를 사용할 수 있습니다. 게이트웨이는 요청 바디를 상류 채널로 손실 없이 직접 전달(Pass-through)하면서도, 전체 빌링, 할당량 제한, 사용 로그 감사 등 플랫폼의 핵심 기능은 그대로 보장합니다.

#### 요청 예시
```json
{
  "model": "gpt-4o",
  "input": [
    {"role": "user", "content": "透传请求内容"}
  ],
  "stream": false
} 
```
