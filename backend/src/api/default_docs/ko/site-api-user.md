# 사용자 프로필 및 지갑 API

이 엔드포인트를 통해 개발자는 인증된 사용자의 프로필 상세 정보를 가져오고 지갑 잔액을 조회하며 충전 기록을 검사하고 추천인 수수료를 이전할 수 있습니다.

### 1. 사용자 프로필 가져오기
현재 로그인한 사용자의 계정 정보를 조회합니다.
* **엔드포인트**: `/api/v1/user/profile`
* **메서드**: `GET`
* **응답 예시**:
```json
{
  "id": "1",
  "username": "user1",
  "email": "user@example.com",
  "mobile": "13800000000",
  "role": "user",
  "user_group": "default",
  "is_active": 1,
  "created_at": "2026-06-01T12:00:00Z"
}
```

### 2. 지갑 잔액 및 통계 가져오기
잔액, 사용 금액, 현재 사용자 레벨의 상세 정보를 조회합니다.
* **엔드포인트**: `/api/v1/user/wallet`
* **메서드**: `GET`
* **응답 예시**:
```json
{
  "balance": 500.00,
  "spent": 24.50,
  "affiliate_commission": 15.00,
  "user_level": "VIP 1",
  "discount_rate": 0.95
}
```

### 3. 충전 기록 가져오기
자금 충전 이력을 조회합니다.
* **엔드포인트**: `/api/v1/user/recharge_records`
* **메서드**: `GET`
* **응답 예시**:
```json
{
  "data": [
    {
      "id": "1001",
      "amount": 100.00,
      "method": "wechat",
      "status": "success",
      "created_at": "2026-06-15T09:30:00Z"
    }
  ],
  "total": 1
}
```

### 4. 추천인 수수료 전환
획득한 추천인 수수료를 지갑 잔액으로 전환하여 모델 소비에 사용합니다.
* **엔드포인트**: `/api/v1/user/affiliate/transfer`
* **메서드**: `POST`
* **요청 파라미터**:
```json
{
  "amount": 10.00
}
```
* **응답 예시**:
```json
{
  "message": "Commission transferred successfully",
  "new_balance": 510.00,
  "remaining_commission": 5.00
}
```
