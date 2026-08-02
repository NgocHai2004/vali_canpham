# JPD-700A BLE Gateway — service đọc cân + đẩy lên web (máy production)

Máy production (có Bluetooth, đặt cạnh cân) chạy service này để: đọc cân JPD-700A →
**đẩy JSON lên trang web đăng ký của bạn** (qua HTTP/HTTPS). Tự chạy khi đăng nhập Windows.

> Máy test hiện tại của bạn KHÔNG liên quan — chỉ cần copy thư mục `jpd_win` này sang máy
> production và cấu hình URL là chạy.

## Các file

| File                    | Vai trò                                                        |
|-------------------------|----------------------------------------------------------------|
| `config.py`             | Cấu hình: **URL web**, API key, UUID cân, MAC...              |
| `parser.py`             | Parse frame 11 byte của cân → kg                              |
| `sender.py`             | Gửi HTTP(S) + retry + hàng đợi offline (gửi bù khi web lỗi)   |
| `service_run.py`        | **Bản chạy nền** (không UI) — dùng cho auto-start            |
| `main.py` / `display.py`| Bản có console để test/xem bằng mắt                          |
| `install_service.ps1`   | Cài tự chạy khi đăng nhập Windows                            |
| `uninstall_service.ps1` | Gỡ bỏ                                                          |

## Bước 1 — cấu hình (mở `config.py`)

```python
# Điền full URL API của trang web bạn:
RECEIVER_URL = "https://your-website.com/api/weight"

# Cách web xác thực (chọn 1):
AUTH_MODE  = "bearer"     # -> header: Authorization: Bearer <token>
#            "apikey"     # -> header: X-API-Key: <token>
#            "custom"     # -> header tự đặt tên (AUTH_HEADER_NAME)
#            "none"       # -> không xác thực
AUTH_TOKEN = "API-KEY-CUA-WEB"
```

Trang web của bạn cần có 1 endpoint nhận **POST JSON** theo schema ở cuối file này.

## Bước 2 — test tay

```powershell
py service_run.py
```

Đứng lên cân → xem log `logs\gateway.log` (dòng `EMIT ...` = đã gửi). `Ctrl+C` để dừng.

## Bước 3 — cài tự chạy khi đăng nhập

```powershell
powershell -ExecutionPolicy Bypass -File install_service.ps1
```

Sau đó:
- Chạy thử ngay: `Start-ScheduledTask -TaskName JPDScaleGateway`
- Từ giờ mỗi lần đăng nhập Windows trên máy production, nó tự chạy ẩn (không cửa sổ đen).
- Kiểm tra đang chạy: Task Manager > Details > có `pythonw.exe`.
- Xem log: `logs\gateway.log`.

Gỡ bỏ: `powershell -ExecutionPolicy Bypass -File uninstall_service.ps1`

## Không mất dữ liệu khi web lỗi

Nếu web tạm sập / mất mạng, `sender.py` lưu số cân vào `pending_queue.jsonl`, lần gửi thành
công kế tiếp sẽ đẩy bù toàn bộ. (Nếu web trả lỗi 4xx như sai API key thì KHÔNG queue — vì gửi
lại cũng lỗi; kiểm tra lại URL/token/schema.)

## Vì sao KHÔNG dùng "Windows Service" thật

Bluetooth LE trên Windows (qua WinRT mà `bleak` dùng) cần chạy trong **phiên người dùng đã đăng
nhập**. Windows Service chạy ở Session 0 cô lập, thường **không truy cập được Bluetooth** →
không đọc được cân. Vì vậy dùng **Scheduled Task khi đăng nhập** — cách chạy nền tin cậy nhất
cho BLE trên Windows. (Đánh đổi: máy production phải được đăng nhập thì service mới chạy; không
chạy ở màn hình đăng nhập. Nếu cần chạy hoàn toàn không người đăng nhập, phải tính cách khác
như auto-logon hoặc thiết bị Android như bản gốc.)

## Schema JSON gửi lên web

Trang web của bạn sẽ nhận POST với body dạng:

```json
{
  "weight_kg": 91.6,
  "source": "scale-01",
  "device_id": "scale-01",
  "stable": true,
  "seq": 1,
  "unit": "kg",
  "raw_hex": "CE 00 00 C8 23 54 00 00 00 00 71",
  "measured_at": "2026-07-28T08:36:05.543Z"
}
```

Nếu web của bạn cần tên field khác (vd `weight` thay vì `weight_kg`), báo tôi để chỉnh
`emit()` trong `service_run.py`.
