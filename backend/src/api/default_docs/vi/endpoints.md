# Danh sách các Endpoint Mở

Hệ thống đã đóng gói toàn diện các giao diện xử lý đa phương tiện và mô hình lớn phổ biến trong ngành thông qua cổng Gateway, đồng thời mở các tuyến định tuyến (routing) tương ứng cho các giao thức của các nhà cung cấp khác nhau. Bạn có thể sử dụng khóa API thống nhất của mình để truy cập trực tiếp vào tất cả các endpoint sau thông qua cổng Gateway:

### 1. Định tuyến Giao thức OpenAI
| Tên Endpoint | Đường dẫn (Path) | Phương thức Yêu cầu | Loại Giao thức |
| :--- | :--- | :--- | :--- |
| Trò chuyện Đối thoại OpenAI | `/v1/chat/completions` | `POST` | Tương thích OpenAI |
| Truyền trực tiếp Gốc Chính thức OpenAI (Pass-through) | `/v1/responses` | `POST` | Tương thích OpenAI |
| Tạo Hình ảnh (Text2Image) | `/v1/images/generations` | `POST` | Tương thích OpenAI |
| Chỉnh sửa Hình ảnh (Image Edit) | `/v1/images/edits` | `POST` | Tương thích OpenAI |
| Gửi Nhiệm vụ Video Bất đồng bộ | `/v1/video/generations` | `POST` | Tương thích OpenAI |
| Tra cứu Trạng thái Nhiệm vụ Video Bất đồng bộ | `/v1/video/generations/{task_id}` | `GET` | Tương thích OpenAI |
| Tổng hợp Giọng nói từ Văn bản (Text-to-Speech) | `/v1/audio/speech` | `POST` | Tương thích OpenAI |
| Tra cứu Hạn mức Khả dụng của Token | `/v1/balance` | `GET` | Thông tin Tài khoản |
| Tra cứu Tổng Số dư Tài khoản | `/v1/user/balance` | `GET` | Thông tin Tài khoản |
| Danh sách Mô hình Khả dụng | `/v1/models` | `GET` | Thông tin Tài khoản |

### 2. Định tuyến Volcengine (Núi lửa Phương Chu)
| Tên Endpoint | Đường dẫn (Path) | Phương thức Yêu cầu | Loại Giao thức |
| :--- | :--- | :--- | :--- |
| Trò chuyện Đối thoại (Tương thích OpenAI) | `/api/v3/chat/completions` | `POST` | Volcengine |
| Phản hồi Gốc (Responses) | `/api/v3/responses` | `POST` | Volcengine |
| Tạo Hình ảnh (Generations) | `/api/v3/images/generations` | `POST` | Volcengine |
| Gửi Nhiệm vụ Video Bất đồng bộ | `/api/v3/contents/generations/tasks` | `POST` | Volcengine |
| Tra cứu Nhiệm vụ Video Bất đồng bộ | `/api/v3/contents/generations/tasks/{task_id}` | `GET` | Volcengine |
| Hủy Nhiệm vụ Video Bất đồng bộ | `/api/v3/contents/generations/tasks/{task_id}` | `DELETE` | Volcengine |
| Tổng hợp Giọng nói (Luồng Văn bản SSE) | `/api/v3/tts/unidirectional/sse` | `POST` | Volcengine |
| Tổng hợp Giọng nói (Nhị phân Chunked) | `/api/v3/tts/unidirectional` | `POST` | Volcengine |
| Nâng cao Chất lượng Video (Tiêu chuẩn/Chuyên nghiệp) | `/api/v1/tools/enhance-video` | `POST` | Volcengine MediaKit |
| Nâng cao Chất lượng Video (Phiên bản Siêu tốc) | `/api/v1/tools/enhance-video-fast` | `POST` | Volcengine MediaKit |
| Nâng cao Chất lượng Video (Phiên bản Mô hình lớn) | `/api/v1/tools/enhance-video-generative` | `POST` | Volcengine MediaKit |
| Xóa Phụ đề Video | `/api/v1/tools/erase-video-subtitle` | `POST` | Volcengine MediaKit |
| Tra cứu Trạng thái Nhiệm vụ Đa phương tiện | `/api/v1/tasks/{task_id}` | `GET` | Volcengine MediaKit |

### 3. Định tuyến Gốc của các Nhà cung cấp Khác
| Tên Nhà Cung Cấp | Tên Endpoint | Đường dẫn (Path) | Phương thức Yêu cầu |
| :--- | :--- | :--- | :--- |
| Alibaba Bailian | Tạo Video Wanxian (Gửi) | `/api/v1/services/aigc/video-generation/video-synthesis` | `POST` |
| Alibaba Bailian | Tạo Ảnh Wanxian (Gửi) | `/api/v1/services/aigc/multimodal-generation/generation` | `POST` |
| Alibaba Bailian | Tra cứu Nhiệm vụ Bất đồng bộ (Chung) | `/api/v1/tasks/{task_id}` | `GET` |
| Alibaba Bailian | Nhúng Văn bản (Embeddings) | `/compatible-mode/v1/embeddings` | `POST` |
| Alibaba Bailian | Sắp xếp lại Tài liệu (Rerank) | `/compatible-api/v1/reranks` | `POST` |
| Kling AI | Văn bản sang Video (Kling) | `/v1/videos/text2video` | `POST` |
| Kling AI | Hình ảnh sang Video (Kling) | `/v1/videos/image2video` | `POST` |
| Kling AI | Tra cứu Trạng thái Nhiệm vụ (Video/Hình ảnh) | `/v1/videos/{endpoint}/{task_id}` | `GET` |
| Google | Tạo Văn bản Gemini | `/v1beta/models/{model}:generateContent` | `POST` |
| Google | Tạo Văn bản Luồng Gemini | `/v1beta/models/{model}:streamGenerateContent` | `POST` |
| Anthropic | Tin nhắn Gốc Claude | `/v1/messages` | `POST` |
