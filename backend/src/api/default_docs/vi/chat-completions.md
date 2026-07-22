# Giao diện Trò chuyện và Phản hồi

Giao diện trò chuyện do Cổng Gateway cung cấp hoàn toàn tương thích ngược với đặc tả chính thức của OpenAI. Bất kể mô hình thực tế bạn gọi ở tầng dưới thuộc về OpenAI chính thức, hay do các nhà cung cấp khác như Google, Anthropic, Alibaba, Volcengine cung cấp, Cổng Gateway sẽ tự động hoàn thành việc chuyển dịch định dạng yêu cầu và chuẩn hóa định dạng phản hồi ở chế độ nền một cách thông minh.

### 1. Giao diện Đối thoại Trò chuyện (Chat Completions)
* **Đường dẫn**: `/v1/chat/completions`
* **Phương thức Yêu cầu**: `POST`

#### Giải thích các tham số yêu cầu cốt lõi
| Tên tham số | Kiểu dữ liệu | Bắt buộc | Mô tả |
| :--- | :--- | :--- | :--- |
| `model` | `string` | Có | Tên mô hình mục tiêu, ví dụ `gpt-4o`, `claude-3-5-sonnet-20241022`, `gemini-1.5-pro` |
| `messages` | `array` | Có | Mảng chứa các tin nhắn đối thoại lịch sử, ví dụ `[{"role": "user", "content": "你好"}]` |
| `stream` | `boolean` | Không | Có trả về dưới dạng luồng sự kiện SSE (trả về từng chữ một theo luồng) hay không (mặc định là `false`) |
| `temperature` | `number` | Không | Nhiệt độ lấy mẫu (0~2), giá trị càng cao tính ngẫu nhiên càng mạnh, khuyến nghị từ `0.7` đến `1.0` |
| `max_tokens` | `integer` | Không | Giới hạn số lượng Token tối đa được tạo ra bởi mô hình |
| `tools` | `array` | Không | Danh sách các công cụ (Function Calling) mà mô hình có thể gọi |

#### Ví dụ gọi từ Terminal (Curl)
```bash
curl -X POST https://{{domain}}/v1/chat/completions \
  -H "Authorization: Bearer sk-your_token" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "请解释什么是量子纠缠。"}
    ],
    "stream": false
  }'
```

### 2. Giao diện Truyền Phản hồi Trực tiếp (Responses)
* **Đường dẫn**: `/v1/responses`
* **Phương thức Yêu cầu**: `POST`

> [!NOTE]
> Nếu bạn muốn bỏ qua bước tự động kiểm tra tham số và chuyển dịch giao thức của Gateway to gửi trực tiếp Request Payload đầy đủ, gốc chính thức của nhà cung cấp đến mô hình OpenAI hoặc Volcengine ở tầng dưới, bạn có thể sử dụng giao diện `/v1/responses`. Gateway sẽ truyền trực tiếp thân yêu cầu (request body) đến kênh thượng nguồn (upstream) mà không làm mất dữ liệu, trong khi vẫn đảm bảo các chức năng cốt lõi của nền tảng như tính phí toàn cục, giới hạn hạn ngạch và kiểm toán nhật ký sử dụng.

#### Ví dụ yêu cầu
```json
{
  "model": "gpt-4o",
  "input": [
    {"role": "user", "content": "透传请求内容"}
  ],
  "stream": false
} 
```
