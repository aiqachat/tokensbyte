# Hướng dẫn API Gốc Alibaba Bailian (DashScope)

Gateway tương thích hoàn toàn với định tuyến API gốc của các mô hình ngôn ngữ lớn (LLM), hình ảnh và video của Alibaba Cloud Bailian (DashScope), hỗ trợ trích xuất trạng thái và kiểm toán tính phí đầy đủ.

### 1. Tạo video Wanx (Submit Video)
* **Đường dẫn**: `/api/v1/services/aigc/video-generation/video-synthesis`
* **Phương thức yêu cầu**: `POST`

#### Ví dụ yêu cầu
```json
{
  "model": "wanx-v1",
  "input": {
    "prompt": "一只金毛寻回犬在金色的秋天落叶中奔跑"
  },
  "parameters": {
    "resolution": "1280*720",
    "duration": 5
  }
} 
```
Gateway sẽ tự động chặn và chèn thêm header `X-DashScope-Async: enable` vào yêu cầu, thực hiện việc tự động ủy thác gửi các tác vụ bất đồng bộ.

### 2. Tạo hình ảnh Wanx (Submit Image)
* **Đường dẫn**: `/api/v1/services/aigc/multimodal-generation/generation`
* **Phương thức yêu cầu**: `POST`

Định dạng tương tự như video, hỗ trợ truyền trực tiếp các tham số điều khiển đặc trưng của nhà cung cấp như `seed`, `size`, v.v.

### 3. Truy vấn trạng thái tác vụ bất đồng bộ
* **Đường dẫn**: `/api/v1/tasks/{task_id}`
* **Phương thức yêu cầu**: `GET`

Cả video và hình ảnh Alibaba Wanx đều sử dụng ID tác vụ bất đồng bộ thống nhất của Bailian. Bạn có thể sử dụng `task_id` gốc để thực hiện truy vấn thăm dò (polling). Gateway sẽ trích xuất mức tiêu thụ tương ứng để khấu trừ phí sau khi trạng thái chuyển sang `succeeded` hoặc `failed`.

### 4. Nhúng văn bản (Embeddings) và Rerank
* **Giao diện Embeddings (Nhúng)**: `/compatible-mode/v1/embeddings` (`POST`)
  Hỗ trợ các mô hình nhúng chính thức của Tongyi Qianwen (ví dụ: `text-embedding-v4`), tính phí dựa trên tổng số lượng Token.
* **Giao diện xếp hạng lại tài liệu (Rerank)**:
  * Đường dẫn tương thích (dành cho qwen3-rerank, v.v.): `/compatible-api/v1/reranks`
  * Đường dẫn gốc (dành cho gte-rerank-v2, v.v.): `/api/v1/services/rerank/text-rerank/text-rerank`
