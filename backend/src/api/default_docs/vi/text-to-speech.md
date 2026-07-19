# Giao diện Tổng hợp Giọng nói (Text-to-Speech)

Tổng hợp giọng nói (TTS) có khả năng chuyển đổi văn bản bạn nhập thành dòng dữ liệu âm thanh giọng nói con người tự nhiên và trôi chảy. Giao diện Gateway duy trì khả năng tương thích cao với đặc tả OpenAI `/v1/audio/speech`, đồng thời hỗ trợ chuyển dịch tự động mã hóa/giải mã (codec) của các mô hình giọng nói cao cấp như Volcengine.

### 1. Giao diện Tổng hợp Giọng nói
* **Đường dẫn**: `/v1/audio/speech`
* **Phương thức Yêu cầu**: `POST`

#### Giải thích các tham số yêu cầu
| Tên tham số | Kiểu dữ liệu | Bắt buộc | Mô tả |
| :--- | :--- | :--- | :--- |
| `model` | `string` | Có | Tên mô hình tổng hợp giọng nói, ví dụ `tts-1` (OpenAI), `seed-tts-2.0` (Mô hình lớn giọng nói Volcengine) |
| `input` | `string` | Có | Nội dung văn bản cần tổng hợp, giới hạn độ dài tối đa thường do đặc tả của từng mô hình cụ thể quyết định |
| `voice` | `string` | Có | Định danh giọng đọc (âm sắc), ví dụ Volcengine yêu cầu truyền vào speaker ID (ví dụ: `zh_female_vv_uranus_bigtts`) |
| `response_format` | `string` | Không | Định dạng trả về của dòng âm thanh, tùy chọn: `mp3` (mặc định), `opus`, `aac`, `flac`, `wav`, `pcm` |
| `speed` | `number` | Không | Hệ số điều chỉnh tốc độ nói (`0.25` ~ `4.0`, mặc định là `1.0`) |

#### Ví dụ gọi
```bash
curl -X POST https://{{domain}}/v1/audio/speech \
  -H "Authorization: Bearer sk-your_token" \
  -H "Content-Type: application/json" \
  -o output.mp3 \
  -d '{
    "model": "seed-tts-2.0",
    "input": "您好，欢迎使用统一智能语音合成系统，请在下方输入您希望合成的文本内容。",
    "voice": "zh_female_vv_uranus_bigtts",
    "response_format": "mp3"
  }'
```

> [!NOTE]
> Gateway trong giao diện này sẽ trả về dòng dữ liệu âm thanh nhị phân thuần túy (phản hồi nhị phân HTTP, Content-Type là `audio/mpeg` hoặc định dạng âm thanh tương ứng). Đối với Volcengine TTS V3，Gateway sẽ tự động gộp, giải mã dữ liệu mã hóa Base64 trong luồng sự kiện SSE và chuyển đổi thành dòng nhị phân để trả về, giúp giảm đáng kể rào cản phân tích cú pháp ở phía phát triển frontend.
