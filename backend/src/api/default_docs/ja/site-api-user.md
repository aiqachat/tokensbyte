# ユーザープロフィールとウォレット API

これらのエンドポイントを使用すると、開発者は認証されたユーザーのプロフィール詳細を取得し、ウォレット残高を照会し、チャージ記録を検査し、アフィリエイトコミッションを移行できます。

### 1. ユーザープロフィールの取得
現在ログインしているユーザーのアカウント詳細を取得します。
* **エンドポイント**: `/api/v1/user/profile`
* **メソッド**: `GET`
* **レスポンス例**:
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

### 2. ウォレット残高と統計情報の取得
残高、使用済み金額、および現在のユーザーレベルの詳細を照会します。
* **エンドポイント**: `/api/v1/user/wallet`
* **メソッド**: `GET`
* **レスポンス例**:
```json
{
  "balance": 500.00,
  "spent": 24.50,
  "affiliate_commission": 15.00,
  "user_level": "VIP 1",
  "discount_rate": 0.95
}
```

### 3. チャージ履歴の取得
資金のチャージ履歴を取得します。
* **エンドポイント**: `/api/v1/user/recharge_records`
* **メソッド**: `GET`
* **レスポンス例**:
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

### 4. アフィリエイトコミッションの残高移行
獲得した紹介コミッションをウォレット残高に移行し、モデル消費に使用します。
* **エンドポイント**: `/api/v1/user/affiliate/transfer`
* **メソッド**: `POST`
* **リクエストパラメータ**:
```json
{
  "amount": 10.00
}
```
* **レスポンス例**:
```json
{
  "message": "Commission transferred successfully",
  "new_balance": 510.00,
  "remaining_commission": 5.00
}
```
