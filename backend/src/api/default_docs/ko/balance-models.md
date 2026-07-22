# 잔액 및 모델 조회 인터페이스

클라이언트가 런타임 중에 계정 상태 및 토큰의 잔여 한도를 편리하게 조회할 수 있도록, 게이트웨이는 다음과 같은 조회용 API를 제공합니다:

### 1. 현재 토큰 한도 조회 (Token Balance)
* **경로**: `/v1/balance`
* **요청 방식**: `GET`
* **인증**: 요청 헤더에 해당 토큰을 포함해야 합니다. `Authorization: Bearer sk-xxx`

#### 响应字段
```json
{
  "remain_balance": 985.42,
  "used_balance": 14.58,
  "unlimited_quota": false
}
```
*참고: 토큰이 무제한 한도로 설정된 경우, `remain_balance`는 `-1`을 반환하며, `unlimited_quota`는 `true`를 반환합니다.*

### 2. 소속 사용자 총 계정 잔액 조회 (User Balance)
* **경로**: `/v1/user/balance`
* **요청 방식**: `GET`

현재 토큰이 속한 사용자 계정의 전역 총 한도(단일 토큰의 개별 한도 제한이 아님)를 가져옵니다.

### 3. 사용 가능한 모델 목록 조회 (Models List)
* **경로**: `/v1/models`
* **요청 방식**: `GET`

현재 시스템에서 귀하의 계정/등급에 활성화된 모든 모델 목록을 나열하며, 클라이언트의 드롭다운 메뉴 렌더링 등에 활용할 수 있습니다.

#### 응답 예시
```json
{
  "object": "list",
  "data": [
    {
      "id": "gpt-4o",
      "object": "model",
      "created": 1719441600,
      "owned_by": "OpenAI"
    },
    {
      "id": "claude-3-5-sonnet-20241022",
      "object": "model",
      "created": 1719441600,
      "owned_by": "Anthropic"
    }
  ]
}
```
