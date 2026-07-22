# Hướng dẫn Giao thức Gốc Kling AI

Kling AI được sử dụng rộng rãi nhờ chất lượng hình ảnh video và khả năng kiểm soát chuyển động cực kỳ cao. Gateway đã mở ra định tuyến Kling chuyên dụng, căn chỉnh hoàn toàn với API chính thức của Kling. 

### 1. Giao diện mô hình video
* **Chuyển văn bản thành video (Text-to-Video)**: `/v1/videos/text2video` (`POST`)
* **Chuyển hình ảnh thành video (Image-to-Video)**: `/v1/videos/image2video` (`POST`)
* **Chuyển nhiều hình ảnh thành video (Multi-Image-to-Video)**: `/v1/videos/multi-image2video` (`POST`)
* **Omni video tham chiếu tạo video**: `/v1/videos/omni-video` (`POST`)
* **Truy vấn trạng thái tác vụ**: `/v1/videos/{endpoint}/{task_id}` (`GET`)

*Lưu ý: Trong giao diện truy vấn, `{endpoint}` tương ứng với loại dịch vụ được sử dụng khi bạn gửi tác vụ (như `text2video`, `image2video`, v.v.).*

### 2. Giao diện mô hình hình ảnh
* **Chuyển văn bản/hình ảnh tiêu chuẩn thành hình ảnh**: `/v1/images/generations` (`POST`)
* **Chuyển nhiều hình ảnh thành hình ảnh (Multi-Image-to-Image)**: `/v1/images/multi-image2image` (`POST`)
* **Omni tạo hình ảnh**: `/v1/images/omni-image` (`POST`)
* **Truy vấn trạng thái tác vụ**: `/v1/images/{endpoint}/{task_id}` (`GET`)

### 3. Tham chiếu tài liệu chính thức của Kling
Cấu trúc dữ liệu yêu cầu (Payload) chi tiết (ví dụ: điều khiển camera `camera_control`, kiểm soát tỷ lệ `aspect_ratio`, hình ảnh khung hình đầu/cuối, v.v.) vui lòng đối chiếu với tiêu chuẩn chính thức. Bạn có thể nhấp vào đây để chuyển đến tài liệu hướng dẫn chính thức:
* [Tài liệu đặc tả chính thức Kling OmniVideo](https://klingai.com/document-api/apiReference/model/OmniVideo)
* [Tài liệu đặc tả chính thức Kling OmniImage](https://klingai.com/document-api/apiReference/model/OmniImage)
