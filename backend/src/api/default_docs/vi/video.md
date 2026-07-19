# Giao diện Tạo Video

Cùng với sự bùng nổ của các mô hình video lớn trong lĩnh vực AIGC, Gateway đã mở rộng giao diện `/v1/video/generations` dưới khung giao thức OpenAI tiêu chuẩn, cung cấp một đường dẫn gọi thống nhất dùng được ngay (out-of-the-box) cho các công cụ tạo video phổ biến như Volcengine, Bailian Wanxiang, Kling AI, Jimeng AI, Bytefor, v.v. Hầu hết các mô hình video đều thuộc chế độ tính toán bất đồng bộ, vì vậy quá trình gọi được chia thành hai bước: **Gửi nhiệm vụ** và **Vòng lặp truy vấn kết quả (Polling)**.

### 1. Gửi Nhiệm vụ Video
* **Đường dẫn**: `/v1/video/generations`
* **Phương thức Yêu cầu**: `POST`

#### Giải thích các tham số cốt lõi
| Tên tham số | Kiểu dữ liệu | Bắt buộc | Mô tả |
| :--- | :--- | :--- | :--- |
| `model` | `string` | Có | Tên mô hình tạo video, ví dụ `doubao-seedance-2-0`, `kling-v3-omni`, `wanx-v1` |
| `prompt` | `string` | Có | Văn bản câu lệnh gợi ý (prompt) mô tả chuyển động và hình ảnh của video |
| `negative_prompt` | `string` | Không | Câu lệnh gợi ý phủ định (negative prompt) để loại bỏ các yếu tố hình ảnh không mong muốn |
| `images` / `image_urls` | `array` | Không | Mảng chứa liên kết hoặc dữ liệu base64 của hình ảnh tham chiếu (`image_urls` có hiệu lực hoàn toàn giống `images`). Một ảnh làm khung hình đầu, hai ảnh làm khung hình đầu/cuối, ba ảnh trở lên làm tham chiếu nhiều ảnh (như Kling, Volcengine) |
| `videos` | `array` | Không | Mảng liên kết video tham chiếu cho chế độ video-to-video hoặc điều khiển video (ví dụ: Kling Omni, Bytefor) |
| `audios` | `array` | Không | Mảng liên kết âm thanh tham chiếu để cung cấp nhạc nền hoặc âm thanh tham chiếu (ví dụ: Volcengine, Bytefor) |
| `resolution` | `string` | Không | Độ phân giải mục tiêu (ví dụ `1080p`, `720p`, `480p`). Hệ thống tự động chuyển đổi sang chuẩn của nhà cung cấp (ví dụ: Kling `1080p` ánh xạ sang `pro`, `720p` sang `std`) |
| `ratio` | `string` | Không | Tùy chọn tỷ lệ khung hình (ví dụ `16:9`, `9:16`, `4:3`, `3:4`, `1:1`) |
| `duration` | `integer` | Không | Thời lượng video được tạo (giây), ví dụ `5` hoặc `10`. Với Jimeng AI, thời lượng được tự động chuyển đổi thành số khung hình `121` or `241` |
| `generate_audio` | `boolean` | Không | Đồng bộ tạo hiệu ứng âm thanh nền/lồng tiếng (mặc định là `false`) |
| `watermark` | `boolean` | Không | Có thêm hình mờ (watermark) vào video hay không (hỗ trợ bởi Volcengine, Alibaba, v.v.) |
| `web_search` | `boolean` | Không | Bật tìm kiếm web (boolean kiểu thích OpenAI, mặc định `false`). Gateway sẽ tự chuyển đổi cho Volcengine Seedance, v.v. |
| `seed` | `integer` | Không | Hạt giống ngẫu nhiên (dùng để kiểm soát tính nhất quán của video được tạo) |

#### Ví dụ gửi nhiệm vụ
```bash
curl -X POST https://{{domain}}/v1/video/generations \
  -H "Authorization: Bearer sk-your_token" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "kling-v3-omni",
    "prompt": "推开欧式古典大门，展现在眼前的是一片奇幻的云海城堡，航拍视角，4k 级细节",
    "resolution": "1080p",
    "duration": 5
  }'
```

#### Phản hồi gửi nhiệm vụ (Nhận Task ID)
```json
{
  "id": "video_task_abc123xyz789",
  "task_id": "video_task_abc123xyz789",
  "status": "pending",
  "message": "Task submitted successfully"
}
```

### 2. Vòng lặp lấy kết quả nhiệm vụ (Polling)
* **Đường dẫn**: `/v1/video/generations/{task_id}` hoặc `/v1/tasks/{task_id}`
* **Phương thức Yêu cầu**: `GET`

#### Ví dụ phản hồi truy vấn (Tạo thành công)
```json
{
  "id": "video_task_abc123xyz789",
  "task_id": "video_task_abc123xyz789",
  "status": "completed",
  "data": [
    {
      "url": "https://example.com/output/generated_video.mp4"
    }
  ]
}
```
