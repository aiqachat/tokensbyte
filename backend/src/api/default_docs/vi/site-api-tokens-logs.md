# API Quản lý Token & Nhật ký Sử dụng

Quản lý khóa API (Tokens) của bạn và truy xuất các số liệu thống kê hoặc nhật ký sử dụng chi tiết thông qua các điểm cuối này.

### 1. Truy xuất Danh sách API Tokens
* **Điểm cuối**: `/api/v1/tokens`
* **Phương thức**: `GET`
* **Ví dụ Phản hồi**:
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

### 2. Tạo API Token
* **Điểm cuối**: `/api/v1/tokens`
* **Phương thức**: `POST`
* **Dữ liệu yêu cầu**:
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
* **Ví dụ Phản hồi**:
```json
{
  "id": 6,
  "name": "New Key",
  "token_key": "sk-ProjX82...",
  "quota_limit": 500.0,
  "is_active": 1
}
```
*Lưu ý: Khóa API thực tế (`token_key`) chỉ được trả về một lần duy nhất khi tạo, hoặc có thể được truy xuất thông qua điểm cuối `/reveal`.*

### 3. Tiết lộ Khóa Bí mật Token
Truy xuất giá trị khóa dạng văn bản thuần túy đầy đủ của một mã thông báo API.
* **Điểm cuối**: `/api/v1/tokens/{id}/reveal`
* **Phương thức**: `POST`
* **Ví dụ Phản hồi**:
```json
{
  "token_key": "sk-your_full_api_key_value_here"
}
```

### 4. Xóa API Token
* **Điểm cuối**: `/api/v1/tokens/{id}`
* **Phương thức**: `DELETE`

### 5. Truy vấn Nhật ký Sử dụng
Truy xuất hồ sơ thực thi mô hình, mã thông báo tiêu thụ, chi tiết thanh toán và trạng thái phản hồi.
* **Điểm cuối**: `/api/v1/logs`
* **Phương thức**: `GET`
* **Tham số Truy vấn**:
  * `page`, `per_page` (Phân trang)
  * `model` (ví dụ: `gpt-4o`)
  * `status` (`success` hoặc `fail`)
  * `start_date`, `end_date` (`YYYY-MM-DD`)
* **Ví dụ Phản hồi**:
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

### 6. Truy vấn Nhật ký Nhiệm vụ
Truy vấn các tác vụ không đồng bộ chạy ngầm (ví dụ: tạo video hoặc nâng cao chất lượng MediaKit).
* **Điểm cuối**: `/api/v1/task_logs`
* **Phương thức**: `GET`
* **Ví dụ Phản hồi**:
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
* Sử dụng `POST /api/v1/task_logs/{log_id}/sync` để đồng bộ thủ công trạng thái hoặc `POST /api/v1/task_logs/{log_id}/cancel` để hủy nhiệm vụ đang chờ xử lý.
