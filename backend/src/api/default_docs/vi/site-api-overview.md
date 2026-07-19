# Tổng quan về API Trang web & Xác thực

Chào mừng bạn đến với API Chức năng Trang web của TokensByte. Ngoài việc gọi các nhà cung cấp mô hình lớn thông qua các tuyến AI thống nhất, nhà phát triển có thể sử dụng API quản lý để quản lý mã thông báo API, truy vấn nhật ký thanh toán/sử dụng của người dùng và truy xuất cài đặt tài khoản.

### 1. URL Cơ sở
Tất cả các điểm cuối API trang web đều có tiền tố là:
```bash
https://{{domain}}/api/v1
```
*Lưu ý: Các tuyến công khai và điểm cuối xác thực cũng nằm trong thư mục `/api/v1`.*

### 2. Cơ chế Xác thực
Ngoại trừ các điểm cuối công khai và đăng ký, tất cả các API quản lý trang web đều yêu cầu xác thực JSON Web Token (JWT). Làm theo các bước sau để xác thực:

#### Bước 1: Đăng nhập để nhận JWT Token
* **Điểm cuối**: `/api/v1/auth/login`
* **Phương thức**: `POST`
* **Dữ liệu yêu cầu**:
```json
{
  "username": "tên_đăng_nhập_hoặc_email_của_bạn",
  "password": "mật_khẩu_của_bạn",
  "login_type": "username"
}
```
* `login_type`: Tùy chọn. Có thể là `"username"`, `"email"`, hoặc `"mobile"`. Mặc định là `"username"`.

* **Dữ liệu phản hồi**:
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

#### Bước 2: Thêm JWT Token vào Header của yêu cầu
Đối với tất cả các cuộc gọi API tiếp theo, hãy thêm token đã nhận vào header `Authorization` tiêu chuẩn:
```http
Authorization: Bearer <mã_token_jwt_của_bạn>
```

> [!IMPORTANT]
> Token JWT là tạm thời và được thiết kế cho các giao diện người dùng tương tác hoặc tích hợp. Không rò rỉ token JWT của bạn. Nếu bạn cần mã thông báo tĩnh cho các cuộc gọi API đến các mô hình lớn, vui lòng sử dụng điểm cuối quản lý **API Token** để thay thế.
