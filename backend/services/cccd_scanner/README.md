# CccdService (.NET) — CCCD scanner

Service .NET đọc CCCD qua thiết bị quét, bắn dữ liệu lên backend qua
`POST /api/cccd/push` và `POST /api/cccd/upload_image`.

## Deploy binary (1 lần / máy)

Binary KHÔNG nằm trong git (~550MB). Cài đặt:

1. Lấy bản `CccdService_portable_*.zip` (hỏi team / build từ source .NET).
2. Giải nén vào `bin/`:
   ```
   backend/services/cccd_scanner/bin/CccdService.exe
   backend/services/cccd_scanner/bin/*.dll
   ```
3. Copy `appsettings.json` (template ở thư mục này) vào `bin/` nếu service
   đọc config từ thư mục làm việc. Sửa `CccdKey` nếu backend yêu cầu.

## Chạy

```powershell
.\backend\services\cccd_scanner\launch.ps1
```

## Cấu hình `appsettings.json`

| Field | Ý nghĩa |
|---|---|
| `BaseUrl` | URL backend (mặc định `http://127.0.0.1:8000`) |
| `PushPath` | Route push dữ liệu CCCD (`/api/cccd/push`) |
| `UploadImagePath` | Route upload ảnh (`/api/cccd/upload_image`) |
| `CccdKey` | API key (nếu backend set `CCCD_API_KEY`) |
| `Source` | Định danh máy quét |

Backend phải set `CCCD_API_KEY` (trong `.env`) và `CccdKey` trong
`appsettings.json` khớp nhau nếu muốn bật xác thực.
