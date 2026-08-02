# Hướng dẫn cài lên máy mới (máy production)

Làm theo 5 bước. Tổng thời gian ~10 phút.

## Bước 1 — Cài Python trên máy mới

1. Tải Python tại https://www.python.org/downloads/ (bản 3.8 trở lên).
2. Chạy file cài. **QUAN TRỌNG:** ở màn hình đầu tiên, tích vào ô
   **"Add Python to PATH"** rồi mới bấm Install. (Nếu quên bước này, sau
   phải gỡ cài lại.)

## Bước 2 — Cài thư viện bleak

Mở **PowerShell** (bấm Start, gõ "PowerShell", Enter), rồi gõ:

```powershell
pip install bleak
```

Chờ nó tải xong (thấy chữ "Successfully installed bleak..." là được).

## Bước 3 — Giải nén code

1. Copy file `jpd_win_production.zip` sang máy mới (USB/mạng/cloud).
2. Chuột phải file zip → **Extract All...** → chọn nơi giải nén,
   ví dụ `C:\jpd_win`.

## Bước 4 — Điền URL trang web của bạn

Mở file `config.py` (trong thư mục vừa giải nén) bằng Notepad, tìm và sửa:

```python
RECEIVER_URL = "https://trang-web-cua-ban.com/api/weight"   # URL API web bạn
AUTH_MODE    = "bearer"        # hoac "apikey" / "custom" / "none"
AUTH_TOKEN   = "API-KEY-CUA-WEB"
```

Nếu chưa có web thật, có thể để nguyên và test bằng server mẫu trước (xem README_SERVICE.md).

## Bước 5 — Chạy thử rồi cài tự động

Trong PowerShell, chuyển vào thư mục code rồi kiểm tra môi trường:

```powershell
cd C:\jpd_win
py check_env.py
```

Nếu báo mọi thứ OK, chạy thử:

```powershell
py service_run.py
```

Đứng lên cân → mở file `logs\gateway.log`, thấy dòng có chữ `EMIT` là gửi thành công.
`Ctrl+C` để dừng.

Cuối cùng, cài tự chạy khi đăng nhập Windows:

```powershell
powershell -ExecutionPolicy Bypass -File install_service.ps1
```

Xong. Từ giờ mỗi lần đăng nhập vào máy production, nó tự chạy nền.

---

## Sự cố thường gặp

- **"py không phải lệnh..."** → chưa cài Python hoặc quên tích "Add to PATH". Cài lại.
- **"No module named bleak"** → chưa chạy `pip install bleak` (Bước 2).
- **Không thấy cân** → cân chỉ phát Bluetooth khi có người đứng lên. Đứng lên rồi xem lại.
  Kiểm tra máy mới có Bluetooth và đã bật chưa.
- **Gửi web lỗi 401/403** → sai `AUTH_TOKEN` hoặc `AUTH_MODE`. Kiểm tra lại với web của bạn.
- **Gửi web lỗi 404** → sai `RECEIVER_URL`.
