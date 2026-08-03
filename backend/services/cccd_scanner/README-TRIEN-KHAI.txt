================================================================
  CCCD READER SERVICE - HN-212  |  HƯỚNG DẪN MANG SANG MÁY KHÁC
================================================================

Service này đọc thẻ CCCD từ đầu đọc Hanel HN-212 và push dữ liệu
lên API /api/cccd/push (kèm header X-CCCD-Key). Bản build là
"self-contained" nên MÁY MỚI KHÔNG CẦN CÀI .NET.

----------------------------------------------------------------
1. COPY GÌ SANG MÁY MỚI
----------------------------------------------------------------
Copy NGUYÊN cả thư mục này (D:\service_cccd) sang máy mới.
Có thể đặt ở ổ/đường dẫn bất kỳ (vd C:\service_cccd, D:\cccd...).
Các script tự dò đường dẫn nên không cần sửa gì khi đổi vị trí.

Thư mục gồm:
  publish\               <- ứng dụng + .NET runtime + native lib (BẮT BUỘC)
  driver\                <- driver đầu đọc HN-212
  install-service.cmd    <- cài chạy nền cùng Windows (chạy quyền Admin)
  uninstall-service.cmd  <- gỡ service (chạy quyền Admin)
  run.cmd                <- chạy thử ở chế độ cửa sổ console
  README-TRIEN-KHAI.txt  <- file này

----------------------------------------------------------------
2. CÀI DRIVER ĐẦU ĐỌC (làm 1 lần trên máy mới)
----------------------------------------------------------------
- Cắm đầu đọc HN-212 vào máy.
- Nếu Windows không tự nhận, vào Device Manager -> thiết bị chưa
  nhận -> Update driver -> Browse -> trỏ tới thư mục driver\.
- Nếu máy dùng Windows bản N/KN: cài thêm "Media Feature Pack".

----------------------------------------------------------------
3. CẤU HÌNH API KEY (BẮT BUỘC)
----------------------------------------------------------------
Service gửi header "X-CCCD-Key" khi push. Có 2 cách đặt key:

Cách A (khuyến nghị — bảo mật): dùng biến môi trường
  - Mở CMD quyền Administrator, chạy:
      setx CCCD_API_KEY "admin:admin123" /M
  (chế độ /M = system-wide, mọi user đều thấy)
  - Đóng và mở lại terminal/service để env có hiệu lực.

Cách B (nhanh, kém bảo mật): điền thẳng vào file cấu hình
  - Mở: publish\appsettings.json
  - Sửa dòng: "CccdApiKey": "admin:admin123"
  - Lưu file.

Các cấu hình khác trong publish\appsettings.json:
  - ApiBaseUrl    : địa chỉ server API (http://192.168.21.24:8000)
  - PushPath      : endpoint push (/api/cccd/push)
  - Source        : nhãn nguồn (scanner-01)
  - PostTimeoutSeconds, RetryCount, RetryDelaySeconds : tinh chỉnh retry

Lưu ý: sau khi cài service, bản chạy là thư mục publish\. Sửa
appsettings.json trong publish\ rồi restart service:
  sc stop CccdReaderService
  sc start CccdReaderService

----------------------------------------------------------------
4A. CHẠY THỬ (không cài service)
----------------------------------------------------------------
- Bấm đúp:  run.cmd
- Đặt thẻ CCCD lên đầu đọc -> xem log đọc + gửi API ngay trên
  cửa sổ.
- Đóng cửa sổ = dừng.

----------------------------------------------------------------
4B. CÀI CHẠY NỀN CÙNG WINDOWS (chính thức)
----------------------------------------------------------------
- Chuột phải install-service.cmd -> Run as administrator.
- Service tên "CccdReaderService" sẽ tự khởi động mỗi lần bật máy,
  chạy nền không cần mở cửa sổ.
- Gỡ bỏ: chuột phải uninstall-service.cmd -> Run as administrator.

----------------------------------------------------------------
5. LUỒNG HOẠT ĐỘNG (mỗi lần quét thẻ)
----------------------------------------------------------------
  Đặt thẻ CCCD lên đầu đọc
    -> Service tự đọc chip
    -> Trích dữ liệu (số CCCD, họ tên, ngày sinh, ..., MRZ)
    -> POST JSON lên {ApiBaseUrl}{PushPath}
       với header X-CCCD-Key
    -> In log "Push thông tin OK (200)" nếu thành công

Payload gửi lên (theo schema API):
  cccd_number, full_name, dob, gender, nationality,
  ethnicity, religion, hometown, address,
  issued_date, expiry_date, issued_place,
  cmnd_old, personal_identification, mrz,
  face_photo (luôn rỗng ""), source

Lưu ý:
  - issued_place hardcode "CỤC CẢNH SÁT QLHC VỀ TTXH" (SDK không trả).
  - mrz được clean về đúng 90 ký tự (bỏ prefix rác của SDK).
  - Service không upload ảnh khuôn mặt (FE tự hiển thị từ nguồn khác).

----------------------------------------------------------------
6. XEM LOG
----------------------------------------------------------------
- Chạy thử (run.cmd): log hiện ngay trên cửa sổ console.
- Khi chạy service: log vào Windows Event Viewer
  (Application log, source "CccdService") + log4net theo cấu hình
  publish\reader.log4net.config.

----------------------------------------------------------------
7. LỖI THƯỜNG GẶP
----------------------------------------------------------------
- "Multiple reader initialization is not allowed":
    Có 1 process khác đang giữ đầu đọc. Rút USB đầu đọc ra rồi
    cắm lại, hoặc khởi động lại máy.

- "Push trả về 401/403":
    API key sai/thiếu. Kiểm tra biến môi trường CCCD_API_KEY
    hoặc CccdApiKey trong appsettings.json.

- "Push trả về 404":
    Sai PushPath hoặc ApiBaseUrl. Kiểm tra appsettings.json.

- Service chạy nhưng không đọc thẻ:
    Kiểm tra driver đầu đọc (Device Manager), thử run.cmd để xem
    log trực tiếp.
================================================================
