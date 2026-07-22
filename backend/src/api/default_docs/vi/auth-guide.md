# Hướng dẫn Bắt đầu Nhanh và Xác thực API

Chào mừng bạn đến với Cổng kết nối API thống nhất (API Gateway)! Cổng kết nối này hỗ trợ giao thức OpenAI và giao thức gốc của các nhà cung cấp mô hình lớn khác nhau, có khả năng tự động phân phối kênh, biên dịch giao thức và quyết toán thanh toán thông minh cho bạn.

### 1. Địa chỉ gọi cơ bản (Base URL)
Địa chỉ yêu cầu API chuẩn hóa và thống nhất là:
```bash
https://{{domain}}
```
Nếu bạn đang gỡ lỗi tại địa phương (local debugging) hoặc triển khai riêng tư (private deployment), bạn có thể sử dụng địa chỉ cổng (port) tương ứng do hệ thống cấp phát.

### 2. Phương thức Xác thực Bảo mật
Cổng Gateway cung cấp tính năng kiểm tra quyền nghiêm ngặt trong tất cả các giao diện API. Bạn có thể đính kèm "Khóa API (Token)" của mình vào yêu cầu thông qua bất kỳ phương thức nào sau đây:

1. **Header Authorization tiêu chuẩn (Khuyến nghị)**
   Thêm token Bearer tiêu chuẩn vào header của yêu cầu HTTP:
   ```http
   Authorization: Bearer sk-your_token_string_here
   ```

2. **Header tương thích với giao thức Google**
   Nếu chương trình máy khách (client) của bạn sử dụng giao thức gốc của Google, bạn có thể sử dụng header API Key chính thức:
   ```http
   X-Goog-Api-Key: sk-your_token_string_here
   ```

3. **Truyền tham số qua URL (URL Parameter Pass-through)**
   Trong một số môi trường hạn chế hoặc chỉ hỗ trợ các yêu cầu GET/POST đơn giản, bạn cũng có thể đính kèm trực tiếp khóa vào tham số truy vấn URL:
   ```bash
   https://{{domain}}/v1/chat/completions?key=sk-your_token_string_here
   ```

> [!IMPORTANT]
> Khóa API (Token) là chứng từ tiêu dùng cho tài khoản của bạn, vui lòng bảo quản cẩn thận và không bao giờ mã hóa cứng (hardcode) khóa dưới dạng văn bản thuần túy trong các máy khách công khai (chẳng hạn như HTML/JS phía frontend). Khuyến nghị chuyển tiếp thông qua dịch vụ backend hoặc cấu hình lưu trữ trong biến môi trường (environment variables).
