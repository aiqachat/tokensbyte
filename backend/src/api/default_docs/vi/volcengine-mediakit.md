# Giao diện nâng cao xử lý đa phương tiện Volcengine MediaKit

Nền tảng của chúng tôi tích hợp sâu sắc dịch vụ xử lý AI MediaKit của Volcengine, cung cấp các thuật toán chỉnh sửa đa phương tiện cao cấp như tăng cường chất lượng video, chèn khung hình video thông minh (smart frame interpolation), phục hồi chi tiết và xóa phụ đề thông minh. Do xử lý tăng cường video rất tốn thời gian, các tác vụ đều sử dụng cơ chế tính toán bất đồng bộ.

### Tài liệu chính thức
Vui lòng tham khảo tài liệu chính thức của Volcengine để biết chi tiết tham số và khả năng:
* [Tài liệu chính thức AI MediaKit](https://docs.volcengine.com/docs/6448/2279230)

### 1. Danh sách các điểm cuối đa phương tiện được mở
* **Tăng cường chất lượng hình ảnh video (Bản tiêu chuẩn/chuyên nghiệp)**: `/api/v1/tools/enhance-video` (`POST`)
* **Tăng cường chất lượng hình ảnh video (Bản siêu tốc)**: `/api/v1/tools/enhance-video-fast` (`POST`)
* **Tăng cường chất lượng hình ảnh video (Bản mô hình lớn)**: `/api/v1/tools/enhance-video-generative` (`POST`)
* **Xóa phụ đề video**: `/api/v1/tools/erase-video-subtitle` (`POST`)
* **Truy vấn trạng thái tác vụ (Chung)**: `/api/v1/tasks/{task_id}` (`GET`)

### 2. Ví dụ gửi tác vụ tăng cường chất lượng hình ảnh video
* **Đường dẫn**: `/api/v1/tools/enhance-video`
* **Phương thức yêu cầu**: `POST`

#### Định dạng Payload yêu cầu
```json
{
  "model": "vve-sd",
  "video_url": "https://example.com/assets/input_video.mp4",
  "mode": "standard",
  "scene": "aigc",
  "resolution": "1080p",
  "fps": 60
}
```
* `model`: Tên mô hình cài đặt sẵn để xử lý nâng cao đa phương tiện. Ví dụ: `vve-sd` (tăng cường chất lượng hình ảnh bản tiêu chuẩn), `vve-pf` (bản chuyên nghiệp), `vve-ft` (bản siêu tốc), `vve-gt` (tăng cường mô hình lớn), `vvs-er` (xóa phụ đề), `vvs-ep` (xóa phụ đề tinh tế)
* `video_url`: Địa chỉ mạng của video gốc cần xử lý (phải là liên kết trực tiếp có thể truy cập công khai)
* `resolution`: Độ phân giải siêu phân giải mục tiêu, có thể chọn: `720p`, `1080p`, `2k`, `4k`
* `fps`: Tỷ lệ khung hình mục tiêu (hỗ trợ chèn khung hình lên 60 fps)

#### Kết quả trả về sau khi gửi
```json
{
  "task_id": "vve_task_1729495831000",
  "status": "pending"
}
```

### 3. Truy vấn thăm dò kết quả tác vụ video
* **Đường dẫn**: `/api/v1/tasks/vve_task_1729495831000`
* **Phương thức yêu cầu**: `GET`

#### Ví dụ phản hồi
```json
{
  "task_id": "vve_task_1729495831000",
  "status": "success",
  "result": {
    "video_url": "https://example.com/output/enhanced_video.mp4",
    "duration": 15.5,
    "resolution": "1920x1080",
    "fps": 60
  }
}
```

### 4. Cơ chế tính phí và khấu trừ đa phương tiện
Tính phí tác vụ đa phương tiện Volcengine MediaKit thuộc danh mục lớn "Video", áp dụng mô hình "tính phí theo thời lượng (VNĐ/giây hoặc Nhân dân tệ/giây)". Quy tắc khấu trừ được quyết định bởi quy tắc tính phí "Tính phí siêu phân giải video chính thức Volcengine MediaKit" do hệ thống thiết lập, định giá bậc thang dựa trên **độ phân giải mục tiêu** và **tỷ lệ khung hình mục tiêu**. Chỉ khi tác vụ bất đồng bộ được thực hiện thành công (`status = "success"`), Gateway mới hoàn thành việc khấu trừ thanh toán hạn mức chính xác dựa trên thời lượng video thực tế xử lý được (`duration`).
