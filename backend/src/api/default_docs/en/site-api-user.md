# User Profile & Wallet APIs

These endpoints allow developers to retrieve the authenticated user's profile details, query wallet balance, inspect recharge records, and transfer affiliate commissions.

### 1. Get User Profile
Retrieve account details of the currently logged-in user.
* **Endpoint**: `/api/v1/user/profile`
* **Method**: `GET`
* **Response Example**:
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

### 2. Get Wallet Balance and Statistics
Query remaining balance, spent balance, and current user level details.
* **Endpoint**: `/api/v1/user/wallet`
* **Method**: `GET`
* **Response Example**:
```json
{
  "balance": 500.00,
  "spent": 24.50,
  "affiliate_commission": 15.00,
  "user_level": "VIP 1",
  "discount_rate": 0.95
}
```

### 3. Get Recharge Records
Retrieve the history of fund top-ups.
* **Endpoint**: `/api/v1/user/recharge_records`
* **Method**: `GET`
* **Response Example**:
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

### 4. Transfer Affiliate Commission
Transfer earned referral commissions to your wallet balance for model consumption.
* **Endpoint**: `/api/v1/user/affiliate/transfer`
* **Method**: `POST`
* **Request Payload**:
```json
{
  "amount": 10.00
}
```
* **Response Example**:
```json
{
  "message": "Commission transferred successfully",
  "new_balance": 510.00,
  "remaining_commission": 5.00
}
```
