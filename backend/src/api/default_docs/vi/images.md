# Giao diện Tạo và Chỉnh sửa Hình ảnh

Giao diện tạo hình ảnh của Gateway tương thích hoàn hảo với đặc tả tạo hình ảnh tiêu chuẩn của OpenAI. Phía sau hệ thống tích hợp nhiều kênh tạo hình ảnh phổ biến như Dall-E-3, Gemini Imagen, Volcengine, Tencent Hunyuan, Alibaba Wanxiang, Jimeng AI, v.v., đồng thời tự động căn chỉnh và phân tích cú pháp các tham số đặc trưng của từng nhà cung cấp.

### 1. Tạo Hình ảnh (Image Generations)
* **Đường dẫn**: `/v1/images/generations`
* **Phương thức Yêu cầu**: `POST`

#### Giải thích các tham số yêu cầu chính
| Tên tham số | Kiểu dữ liệu | Bắt buộc | Mô tả |
| :--- | :--- | :--- | :--- |
| `model` | `string` | Có | Tên mô hình tạo hình ảnh, ví dụ `dall-e-3` (OpenAI), `wanx-v1` (Alibaba Wanxiang), `seedream-5.0-lite` (Jimeng) |
| `prompt` | `string` | Có | Câu lệnh gợi ý (prompt) dạng văn bản mô tả hình ảnh |
| `n` | `integer` | Không | Số lượng hình ảnh mong muốn tạo ra (mặc định là `1`). Gateway sẽ tự động chuyển đổi sang tham số tương ứng của kênh thượng nguồn gốc |
| `size` | `string` | Không | Độ phân giải (ví dụ `1024x1024`). Hệ thống sẽ tự động chuyển dịch kích thước sang thông số tiêu chuẩn được hỗ trợ bởi nhà cung cấp tương ứng |
| `watermark` | `boolean` | Không | Có thêm hình mờ (watermark) vào ảnh hay không (hỗ trợ một số kênh như Volcengine, Alibaba Bailian) |
| `web_search` | `boolean` | Không | Bật tìm kiếm web (boolean tương thích OpenAI, mặc định `false`). Gateway sẽ tự chuyển đổi cho Volcengine Seedream, v.v. |
| `ratio` | `string` | Không | Tùy chọn tỷ lệ khung hình (ví dụ `16:9`, `3:4`, chủ yếu sử dụng cho các mô hình tạo hình ảnh hỗ trợ tỷ lệ như Gemini) |
| `image` | `string` | Không | URL hình ảnh tham chiếu cho tính năng Image-to-Image (mở rộng giao thức OpenAI, có thể truyền liên kết hình ảnh web) |

#### Ví dụ gọi tạo hình ảnh bằng Curl
```bash
curl -X POST https://{{domain}}/v1/images/generations \
  -H "Authorization: Bearer sk-your_token" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "dall-e-3",
    "prompt": "一只在太空中漂浮的宇航员猫，写实赛博朋克风格",
    "size": "1024x1024",
    "n": 1
  }'
```

#### Ví dụ phản hồi (Trả về trực tiếp URL hình ảnh)
```json
{
  "created": 1719441600,
  "data": [
    {
      "url": "https://example.com/output/img_abc123.png"
    }
  ]
}
```

### 2. Chỉnh sửa Hình ảnh (Image Edits)
* **Đường dẫn**: `/v1/images/edits`
* **Phương thức Yêu cầu**: `POST`

Hỗ trợ tải lên hình ảnh gốc, mặt nạ che (Mask) và câu lệnh gợi ý (prompt) để tiến hành sửa đổi có định hướng, thực hiện chức năng xóa và vẽ lại cục bộ trên hình ảnh.
