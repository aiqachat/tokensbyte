# Hướng dẫn API Gốc Volcengine Ark

Nếu hệ thống nghiệp vụ hiện tại của bạn đã kết nối với nền tảng Volcengine Ark của Volcengine, bạn không cần phải tái cấu trúc mã nguồn sang định dạng OpenAI, vì Gateway cũng mở các tuyến chuyển tiếp tương thích hoàn toàn với đường dẫn gốc của Volcengine. Bạn chỉ cần thay thế API Key trong header yêu cầu bằng mã khóa API thống nhất được phân phối bởi nền tảng của chúng tôi.

### 1. Trò chuyện và phản hồi gốc (Chat & Responses)
* **Điểm cuối hội thoại (Chat endpoint)**: `/api/v3/chat/completions`
* **Điểm cuối phản hồi gốc (Response endpoint)**: `/api/v3/responses`
* **Phương thức yêu cầu**: `POST`

Hỗ trợ truyền tiếp đầy đủ Request Payload gốc của Volcengine Ark. Về đặc tả tham số, vui lòng tham khảo [Tài liệu chính thức của Volcengine Ark](https://www.volcengine.com/docs/82379/1298454).

### 2. Giao diện tạo hình ảnh gốc (Image Generations)
* **Điểm cuối (Endpoint)**: `/api/v3/images/generations`
* **Phương thức yêu cầu**: `POST`

Căn chỉnh hoàn hảo với giao diện chuyển văn bản thành hình ảnh của Ark, hỗ trợ các tham số gốc như chỉ định tỷ lệ khung hình hình ảnh, viết lại từ gợi ý thông minh, đóng dấu bản quyền (watermark), v.v.

### 3. Tác vụ tạo video gốc (Video Studio)
* **Gửi tác vụ**: `/api/v3/contents/generations/tasks` (`POST`)
* **Truy vấn trạng thái tác vụ**: `/api/v3/contents/generations/tasks/{task_id}` (`GET`)
* **Hủy/Xóa tác vụ**: `/api/v3/contents/generations/tasks/{task_id}` (`DELETE`)
* **Danh sách lịch sử tác vụ**: `/api/v3/contents/generations/tasks` (`GET`)

### 4. Giao diện tổng hợp giọng nói (TTS)
* **Chế độ luồng sự kiện (SSE)**: `/api/v3/tts/unidirectional/sse` (`POST`)
* **Chế độ HTTP non-streaming**: `/api/v3/tts/unidirectional` (`POST`)

Header yêu cầu cần sử dụng định dạng gốc của Volcengine là `X-Api-Key: sk-your_token`, mô hình có thể được chỉ định bằng header `X-Api-Resource-Id` hoặc ghi trong phần thân yêu cầu (request body) `model`. Gateway sẽ trả về dữ liệu JSON tiêu chuẩn của Volcengine (chứa khung âm thanh mã hóa Base64).
