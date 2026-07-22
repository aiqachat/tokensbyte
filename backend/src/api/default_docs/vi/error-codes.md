# Mã lỗi thường gặp và Khắc phục sự cố

Khi sử dụng API Gateway để truy cập các dịch vụ mô hình lớn, nếu có lỗi xảy ra với yêu cầu, Gateway sẽ trả về cho máy khách thông qua mã trạng thái HTTP (Status Code) tương ứng cùng với thân phản hồi lỗi JSON tuân thủ tiêu chuẩn OpenAI.

### 1. Định dạng phản hồi lỗi thống nhất
Khi yêu cầu gặp lỗi, Gateway luôn trả về thân lỗi định dạng JSON tiêu chuẩn:
```json
{
  "error": {
    "message": "错误原因详细描述...",
    "type": "invalid_request_error",
    "code": "context_length_exceeded",
    "param": null
  }
}
```

### 2. Mã trạng thái và Hướng dẫn khắc phục sự cố

* **400 Bad Request (Định dạng yêu cầu không hợp lệ)**
  * **Nguyên nhân có thể**: Dữ liệu yêu cầu (Payload) không phải là JSON hợp lệ; thiếu tham số bắt buộc (như `model` hoặc `messages`); loại tham số không chính xác.
  * **Cách khắc phục**: Kiểm tra Body của yêu cầu HTTP đã gửi, so khớp với các tham số tiêu chuẩn của giao diện nhà cung cấp (như `max_tokens`, v.v.) để kiểm tra lỗi chính tả của các trường.

* **401 Unauthorized (Chưa xác thực/Xác thực thất bại)**
  * **Nguyên nhân có thể**: Header yêu cầu không đi kèm `Authorization` hoặc thiếu Bearer Token; Khóa (Token) không hợp lệ hoặc đã bị hệ thống xóa; Chuỗi Token có khoảng trắng, xuống dòng hoặc hậu tố thừa.
  * **Cách khắc phục**: Xác nhận định dạng header yêu cầu là `Authorization: Bearer sk-xxxxx`, và kiểm tra xem token đó có đang hoạt động trong trang quản trị hay không.

* **403 Forbidden (Không có quyền/Hạn mức bị giới hạn)**
  * **Nguyên nhân có thể**: Hạn mức khả dụng (Quota) của token hoặc số dư tài khoản của người dùng đã hết; token hiện tại chưa được chọn quyền gọi mô hình đang yêu cầu; token đã bị quản trị viên hoặc hệ thống vô hiệu hóa.
  * **Cách khắc phục**: Đăng nhập vào trang người dùng của hệ thống để kiểm tra số dư token; kiểm tra trong danh sách token xem "Danh sách mô hình khả dụng" có bao gồm mô hình đang được yêu cầu hay không.

* **404 Not Found (Giao diện hoặc định tuyến không tồn tại)**
  * **Nguyên nhân có thể**: Đường dẫn URL yêu cầu bị viết sai chính tả; mô hình được gọi chưa được cấu hình bất kỳ "kênh thượng nguồn" (upstream channel) hợp lệ nào ở trang quản trị; tất cả các nút kênh liên kết bên dưới đều ở trạng thái "Vô hiệu hóa".
  * **Cách khắc phục**: Kiểm tra đường dẫn gọi (như `/v1/chat/completions`); xác nhận mô hình đó ở trang quản trị đã được liên kết với kênh đang hoạt động.

* **429 Too Many Requests (Kích hoạt giới hạn tần suất/Kiểm soát tần suất)**
  * **Nguyên nhân có thể**: Kích hoạt giới hạn tần suất của token (RPM / TPM); kích hoạt ngưỡng kiểm soát tần suất chính thức của nhà cung cấp dịch vụ thượng nguồn tương ứng với kênh bên dưới.
  * **Cách khắc phục**: Thêm logic thử lại với độ trễ lũy thừa (exponential backoff retry) ở phía mã nguồn; xác nhận cài đặt giới hạn tần suất của token hoặc liên hệ với quản trị viên để nâng giới hạn tần suất.

* **500 Internal Error (Lỗi nội bộ Gateway)**
  * **Nguyên nhân có thể**: Kết nối cơ sở dữ liệu của Gateway bị ngắt hoặc quá hạn (timeout); xảy ra ngoại lệ Panic chưa được bắt trong mã nguồn nội bộ của nền tảng.
  * **Cách khắc phục**: Liên hệ với quản trị viên hệ thống, kiểm tra nhật ký (log) của container dịch vụ backend để xác định nguyên nhân lỗi.

* **502 Bad Gateway (Dịch vụ kênh thượng nguồn không khả dụng)**
  * **Nguyên nhân có thể**: Kết nối đến điểm cuối (endpoint) chính thức của thượng nguồn (như `api.openai.com`) bị quá hạn hoặc gián đoạn mạng; tài khoản chính thức của thượng nguồn bị nợ cước hoặc mô hình đã bị nhà cung cấp chính thức khai tử.
  * **Cách khắc phục**: Xem chi tiết trong trường `message` của thân phản hồi JSON trả về, kiểm tra tính khả dụng của kênh ở trang quản trị, loại trừ các vấn đề về mạng của kênh hoặc nợ cước tài khoản.

* **504 Gateway Timeout (Gateway phản hồi quá hạn)**
  * **Nguyên nhân có thể**: Mô hình được yêu cầu mất rất nhiều thời gian để tạo kết quả, dẫn đến kết nối HTTP bị quá hạn.
  * **Cách khắc phục**: Đối với các tác vụ cực kỳ tốn thời gian như tạo video hoặc nâng siêu phân giải hình ảnh, hãy sử dụng giao diện bất đồng bộ (như `/v1/video/generations`) để gửi yêu cầu, sau đó lấy kết quả thông qua giao diện truy vấn trạng thái tác vụ.

### 3. Cơ chế kiểm tra sức khỏe thông minh và Thử lại
1. **Thử lại khi có lỗi**: Khi mô hình của bạn gặp tình trạng không khả dụng như lỗi 502 hoặc quá hạn kết nối mạng trên kênh A, nếu Gateway được cấu hình đa kênh, nó sẽ tự động chuyển sang kênh dự phòng B để thử lại trong im lặng. Toàn bộ quá trình này hoàn toàn trong suốt đối với phía gọi API.
2. **Kiểm toán nhật ký**: Bất kể thành công hay thất bại, thời gian phản hồi, mức phí khấu trừ, IP, dữ liệu yêu cầu/phản hồi (Payload) của mỗi lần yêu cầu sẽ được lưu giữ đầy đủ trong nhật ký sử dụng của bạn, giúp nhanh chóng theo dõi nguyên nhân bất thường.
