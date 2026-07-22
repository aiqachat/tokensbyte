# API 토큰 및 사용 로그 API

API 키(토큰)를 관리하고 상세 사용 메트릭 또는 로그를 이 엔드포인트를 통해 조회합니다.

### 1. API 토큰 목록 가져오기
* **엔드포인트**: `/api/v1/tokens`
* **메서드**: `GET`
* **응답 예시**:
```json
{
  "data": [
    {
      "id": 5,
      "name": "Production Key",
      "kid": "usr123987",
      "quota_limit": 1000.0,
      "used_quota": 5.23,
      "is_active": 1,
      "created_at": "2026-06-20T10:00:00Z"
    }
  ],
  "total": 1
}
```

### 2. API 토큰 생성
* **엔드포인트**: `/api/v1/tokens`
* **메서드**: `POST`
* **요청 파라미터**:
```json
{
  "name": "New Key",
  "quota_limit": 500.0,
  "allowed_models": ["gpt-4o", "claude-3-5-sonnet-20241022"],
  "allowed_ips": "192.168.1.1,10.0.0.1",
  "rps_limit": 10,
  "rpm_limit": 100
}
```
* **응답 예시**:
```json
{
  "id": 6,
  "name": "New Key",
  "token_key": "sk-ProjX82...",
  "quota_limit": 500.0,
  "is_active": 1
}
```
*참고: 실제 비밀 키(`token_key`)는 생성 시에만 반환되거나, `/reveal` 엔드포인트를 통해 조회할 수 있습니다.*

### 3. 토큰 비밀 키 표시
API 토큰의 완전한 플레인 텍스트 키 값을 가져옵니다.
* **엔드포인트**: `/api/v1/tokens/{id}/reveal`
* **메서드**: `POST`
* **응답 예시**:
```json
{
  "token_key": "sk-your_full_api_key_value_here"
}
```

### 4. API 토큰 삭제
* **엔드포인트**: `/api/v1/tokens/{id}`
* **메서드**: `DELETE`

### 5. 사용 로그 조회
모델 실행 기록, 소비된 토큰, 청구 세부 정보 및 응답 상태를 가져옵니다.
* **엔드포인트**: `/api/v1/logs`
* **메서드**: `GET`
* **쿼리 파라미터**:
  * `page`, `per_page` (페이징)
  * `model` (예: `gpt-4o`)
  * `status` (`success` 또는 `fail`)
  * `start_date`, `end_date` (`YYYY-MM-DD`)
* **응답 예시**:
```json
{
  "data": [
    {
      "log_id": "log_xyz123",
      "model": "gpt-4o",
      "prompt_tokens": 15,
      "completion_tokens": 20,
      "cost": 0.0007,
      "status_code": 200,
      "created_at": "2026-06-21T15:20:00Z"
    }
  ],
  "total": 1,
  "total_cost": 0.0007,
  "success_count": 1,
  "fail_count": 0
}
```

### 6. 작업 로그 조회
백그라운드 비동기 작업(비디오 생성, 화질 개선 등)을 조회합니다.
* **엔드포인트**: `/api/v1/task_logs`
* **메서드**: `GET`
* **응답 예시**:
```json
{
  "data": [
    {
      "log_id": "task_abc789",
      "action_type": "视频",
      "status": "success",
      "duration": 5.0,
      "cost": 1.5,
      "created_at": "2026-06-21T16:00:00Z"
    }
  ],
  "total": 1
}
```
* `POST /api/v1/task_logs/{log_id}/sync`를 사용하여 상태를 수동 동기화하거나, `POST /api/v1/task_logs/{log_id}/cancel`을 사용하여 대기 중인 작업을 취소합니다.
