# Giao diện Tra cứu Số dư và Mô hình

Để tạo điều kiện thuận lợi cho các máy khách (client) lấy được trạng thái tài khoản và hạn mức còn lại của token trong thời gian chạy (runtime), Gateway cung cấp các API tra cứu sau:

### 1. Tra cứu Hạn mức Token Hiện tại (Token Balance)
* **Đường dẫn**: `/v1/balance`
* **Phương thức Yêu cầu**: `GET`
* **Xác thực**: Cần mang theo token tương ứng trong header yêu cầu `Authorization: Bearer sk-xxx`

#### Các trường phản hồi
```json
{
  "remain_balance": 985.42,
  "used_balance": 14.58,
  "unlimited_quota": false
}
```
*Lưu ý: Khi token được đặt thành hạn mức không giới hạn, `remain_balance` sẽ trả về `-1`, và `unlimited_quota` sẽ trả về `true`.*

### 2. Tra cứu Tổng Số dư Tài khoản của Người dùng Sở hữu (User Balance)
* **Đường dẫn**: `/v1/user/balance`
* **Phương thức Yêu cầu**: `GET`

Lấy tổng hạn mức toàn cục của tài khoản người dùng sở hữu token hiện tại (thay vì giới hạn hạn mức phụ của một token đơn lẻ).

### 3. Lấy Danh sách Mô hình Khả dụng (Models List)
* **Đường dẫn**: `/v1/models`
* **Phương thức Yêu cầu**: `GET`

Liệt kê toàn bộ danh sách các mô hình đang hoạt động được hệ thống mở cho tài khoản/cấp độ của bạn, giúp máy khách dễ dàng hiển thị trực tiếp trong menu thả xuống (dropdown menu).

#### Ví dụ phản hồi
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
