# Hướng dẫn API Gốc Anthropic Claude

Gateway hỗ trợ gọi trực tiếp Messages API chính thức của Anthropic, bạn có thể gửi trực tiếp Payload gốc để gọi các mô hình thuộc dòng Claude (ví dụ: `claude-3-5-sonnet-20241022`).

### 1. Tạo hội thoại tin nhắn (Messages API)
* **Đường dẫn yêu cầu**: `/v1/messages`
* **Phương thức yêu cầu**: `POST`

#### Giải thích các tham số yêu cầu cốt lõi
* **model** (string, bắt buộc)
  Chỉ định tên mô hình Claude, ví dụ: `claude-3-5-sonnet-20241022`.
* **messages** (array, bắt buộc)
  Mảng dữ liệu hội thoại lịch sử, cấu trúc như `[{"role": "user", "content": "你好"}]`.
* **max_tokens** (integer, bắt buộc)
  Giới hạn số lượng Token tối đa được tạo ra. Lưu ý: Giao thức chính thức của Anthropic yêu cầu bắt buộc phải điền tham số này.
* **system** (string, tùy chọn)
  Từ gợi ý hệ thống (System Prompt), được sử dụng để thiết lập vai trò và hành vi của mô hình.
* **stream** (boolean, tùy chọn)
  Có trả về dưới dạng luồng dữ liệu SSE (Server-Sent Events) hay không. Giá trị có thể chọn là `true` hoặc `false`.
* **temperature** (number, tùy chọn)
  Nhiệt độ lấy mẫu (temperature), nằm trong khoảng từ `0.0` đến `1.0`.

#### Ví dụ cuộc gọi (Curl)
```bash
curl -X POST https://{{domain}}/v1/messages \
  -H "x-api-key: sk-your_token" \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "max_tokens": 1024,
    "messages": [
      {"role": "user", "content": "你好，请用一句话描述你自己的核心特征。"}
    ]
  }'
```

### 2. Phương thức xác thực API
Khi gọi API Claude gốc, gateway hỗ trợ hai loại header xác thực sau:
1. **Xác thực Bearer Token thống nhất (Khuyến nghị)**:
   ```http
   Authorization: Bearer sk-your_token
   ```
2. **API Key chính thức của Anthropic**:
   ```http
   x-api-key: sk-your_token
   ```
