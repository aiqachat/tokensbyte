# 빠른 시작 및 API 인증 안내

통합 API 게이트웨이를 이용해 주셔서 감사합니다! 본 게이트웨이는 OpenAI 프로토콜 및 각 대형 언어 모델(LLM) 제공업체의 네이티브 프로토콜을 지원하며, 자동 채널 배포, 프로토콜 변환 및 스마트 빌링/정산 서비스를 제공합니다.

### 1. 기본 호출 주소 (Base URL)
통합 API 기본 요청 주소는 다음과 같습니다:
```bash
https://{{domain}}
```
로컬 환경에서 디버깅하거나 프라이빗 배포(온프레미스)를 진행하는 경우, 시스템에서 할당한 해당 포트 주소를 사용할 수 있습니다.

### 2. 보안 인증 방식
게이트웨이는 모든 API 인터페이스에서 엄격한 권한 검사를 제공합니다. 요청 시 다음 중 하나의 방법을 사용하여 'API 키 (Token)'를 전달할 수 있습니다:

1. **표준 Authorization 요청 헤더 (권장)**
   HTTP 요청 헤더에 표준 Bearer 토큰을 추가합니다:
   ```http
   Authorization: Bearer sk-your_token_string_here
   ```

2. **Google 프로토콜 호환 요청 헤더**
   클라이언트 프로그램이 Google 네이티브 프로토콜을 사용하는 경우, 공식 API Key 요청 헤더를 사용할 수 있습니다:
   ```http
   X-Goog-Api-Key: sk-your_token_string_here
   ```

3. **URL 매개변수 직접 전달**
   GET/POST 단순 요청만 지원하거나 제한된 일부 환경에서는 URL 쿼리 매개변수에 키를 직접 추가할 수 있습니다:
   ```bash
   https://{{domain}}/v1/chat/completions?key=sk-your_token_string_here
   ```

> [!IMPORTANT]
> API 키 (Token)는 귀하 계정의 결제 자격 증명이므로 안전하게 보관해 주십시오. 프론트엔드 HTML/JS 등 공개된 클라이언트에 키를 일반 텍스트로 하드코딩해서는 안 됩니다. 백엔드 서비스를 통해 중계하거나 환경 변수에 설정하여 저장하는 것을 권장합니다.
