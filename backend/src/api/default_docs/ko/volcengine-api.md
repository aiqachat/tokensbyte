# 볼케인엔진 화산방주 (Volcengine Ark) 네이티브 API 설명

기존 비즈니스 시스템이 이미 볼케인엔진 화산방주 플랫폼(Volcengine Ark)에 연동되어 있는 경우, 코드를 OpenAI 형식으로 리팩토링할 필요가 없습니다. 게이트웨이는 볼케인엔진 네이티브 경로와 완전히 일치하는 포워딩 라우트를 제공합니다. 요청 헤더의 API Key를 본 플랫폼에서 할당한 통합 API 키로 바꾸기만 하면 됩니다.

### 1. 네이티브 채팅 및 대화 (Chat & Responses)
* **대화 엔드포인트**: `/api/v3/chat/completions`
* **네이티브 응답 엔드포인트**: `/api/v3/responses`
* **요청 메서드**: `POST`

화산방주 네이티브 Request Payload의 완전한 투과 전송(Pass-through)을 지원합니다. 파라미터 규격에 대한 자세한 내용은 [화산방주 공식 문서](https://www.volcengine.com/docs/82379/1298454)를 참고하십시오.

### 2. 네이티브 이미지 생성 API (Image Generations)
* **엔드포인트**: `/api/v3/images/generations`
* **요청 메서드**: `POST`

화산방주 텍스트 기반 이미지 생성 API와 완벽하게 동기화되어 이미지 종횡비 지정, 프롬프트 스마트 재작성, 워터마크 등 네이티브 파라미터를 지원합니다.

### 3. 네이티브 비디오 생성 작업 (Video Studio)
* **작업 제출**: `/api/v3/contents/generations/tasks` (`POST`)
* **작업 상태 조회**: `/api/v3/contents/generations/tasks/{task_id}` (`GET`)
* **작업 취소/삭제**: `/api/v3/contents/generations/tasks/{task_id}` (`DELETE`)
* **작업 이력 조회**: `/api/v3/contents/generations/tasks` (`GET`)

### 4. 음성 합성 API (TTS)
* **이벤트 스트림 모드 (SSE)**: `/api/v3/tts/unidirectional/sse` (`POST`)
* **비스트리밍 HTTP 모드**: `/api/v3/tts/unidirectional` (`POST`)

요청 헤더는 볼케인엔진 네이티브 형식인 `X-Api-Key: sk-your_token`을 사용해야 하며, 모델은 `X-Api-Resource-Id` 헤더로 지정하거나 `model` 요청 본문에 작성할 수 있습니다. 게이트웨이는 볼케인엔진 표준 JSON 데이터(Base64로 인코딩된 오디오 프레임 포함)를 반환합니다.
