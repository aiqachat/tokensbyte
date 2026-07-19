# 사이트 API 개요 및 인증

TokensByte 플랫폼 사이트 기능 API에 오신 것을 환영합니다. 통합 AI 라우트를 통해 LLM 프로바이더를 호출하는 것 외에도, 개발자는 관리 API를 사용하여 API 토큰을 관리하고 사용자의 청구/사용 로그를 조회하며 계정 설정을 검색할 수 있습니다.

### 1. 기본 URL
모든 사이트 API 엔드포인트의 접두사는 다음과 같습니다:
```bash
https://{{domain}}/api/v1
```
*참고: 공개 라우트 및 인증 엔드포인트도 `/api/v1` 아래에 중첩되어 있습니다.*

### 2. 인증 메커니즘
공개 및 등록 엔드포인트를 제외하고, 모든 사이트 관리 API에는 JSON Web Token (JWT) 인증이 필요합니다. 인증하려면 다음 단계를 따르세요:

#### 1단계: 로그인하여 JWT 토큰 가져오기
* **엔드포인트**: `/api/v1/auth/login`
* **메서드**: `POST`
* **요청 파라미터**:
```json
{
  "username": "사용자 이름 또는 이메일",
  "password": "비밀번호",
  "login_type": "username"
}
```
* `login_type`: 선택 사항. `"username"`, `"email"`, `"mobile"` 중 하나를 지정할 수 있습니다. 기본값은 `"username"` 입니다.

* **응답 파라미터**:
```json
{
  "token": "eyJhbGciOi...",
  "user": {
    "id": "1",
    "username": "user1",
    "role": "user",
    "email": "user@example.com",
    "is_active": 1
  }
}
```

#### 2단계: 요청 헤더에 JWT 토큰 포함
이후의 모든 API 호출에서는 반환된 토큰을 표준 `Authorization` 헤더에 추가합니다:
```http
Authorization: Bearer <JWT_토큰_값>
```

> [!IMPORTANT]
> JWT 토큰은 일시적이며 대화형 프론트엔드 또는 통합용으로 설계되었습니다. JWT 토큰을 누설하지 마십시오. 모델 호출을 위해 정적 토큰이 필요한 경우 대신 **API 토큰** 관리 엔드포인트를 사용하십시오.
