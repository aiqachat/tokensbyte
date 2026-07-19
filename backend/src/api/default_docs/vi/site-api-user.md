# Hồ sơ Người dùng & API Ví

Các điểm cuối này cho phép nhà phát triển truy xuất thông tin chi tiết hồ sơ của người dùng đã xác thực, truy vấn số dư ví, kiểm tra hồ sơ nạp tiền và chuyển hoa hồng giới thiệu.

### 1. Lấy Hồ sơ Người dùng
Truy xuất chi tiết tài khoản của người dùng hiện đang đăng nhập.
* **Điểm cuối**: `/api/v1/user/profile`
* **Phương thức**: `GET`
* **Ví dụ Phản hồi**:
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

### 2. Lấy Số dư Ví và Thống kê
Truy vấn số dư còn lại, số dư đã chi tiêu và chi tiết cấp độ người dùng hiện tại.
* **Điểm cuối**: `/api/v1/user/wallet`
* **Phương thức**: `GET`
* **Ví dụ Phản hồi**:
```json
{
  "balance": 500.00,
  "spent": 24.50,
  "affiliate_commission": 15.00,
  "user_level": "VIP 1",
  "discount_rate": 0.95
}
```

### 3. Lấy Hồ sơ Nạp tiền
Truy xuất lịch sử nạp tiền vào tài khoản.
* **Điểm cuối**: `/api/v1/user/recharge_records`
* **Phương thức**: `GET`
* **Ví dụ Phản hồi**:
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

### 4. Chuyển Hoa hồng Giới thiệu
Chuyển hoa hồng giới thiệu đã kiếm được vào số dư ví của bạn để tiêu dùng mô hình.
* **Điểm cuối**: `/api/v1/user/affiliate/transfer`
* **Phương thức**: `POST`
* **Dữ liệu yêu cầu**:
```json
{
  "amount": 10.00
}
```
* **Ví dụ Phản hồi**:
```json
{
  "message": "Commission transferred successfully",
  "new_balance": 510.00,
  "remaining_commission": 5.00
}
```
