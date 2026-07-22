
### 5. Các phản hồi lỗi thường gặp (Common Errors)

Giao diện API của chúng tôi tuân theo các mã trạng thái HTTP tiêu chuẩn và định dạng phản hồi lỗi JSON thống nhất. Dưới đây là các lỗi phổ biến và hướng dẫn khắc phục:

*   **400 Bad Request (Lỗi tham số / Không tìm thấy model)**: Trả về khi tham số yêu cầu không hợp lệ hoặc mô hình được chỉ định không tồn tại.
*   **401 Unauthorized (API Key không hợp lệ)**: Trả về khi API Key trong HTTP Header bị thiếu, hết hạn hoặc không hợp lệ.
*   **429 Too Many Requests (Không đủ số dư / Giới hạn tần suất)**: Trả về khi số dư tài khoản không đủ để thanh toán hoặc tần suất yêu cầu vượt quá giới hạn Rate Limit.

*(※ Vui lòng tham khảo tài liệu phiên bản tiếng Anh [English (en)] để xem chi tiết cấu trúc JSON lỗi và các bước khắc phục cụ thể)*
