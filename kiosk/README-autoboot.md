# Auto-boot App_CCCD (kiosk)

Bật máy → tự đăng nhập → tự mở app. Hai lớp tách rời: **auto-login** (vào Windows
không hỏi mật khẩu) và **Startup** (tự chạy Electron sau khi đăng nhập).

## Điều kiện tiên quyết

- Đã dựng xong Electron Phase 1 (có thư mục `app_cccd/electron/`, chạy được
  `npm start`). Xem
  `docs/superpowers/plans/2026-08-04-electron-migration-phase1.md`.
- Đã cài dependency Electron: `cd app_cccd/electron && npm install`.
- Dùng **tài khoản local** của Windows (tài khoản Microsoft có thể chặn
  auto-login).

## Cài đặt (làm theo thứ tự)

### Bước 1 — Tự mở app sau khi login (Startup shortcut)

```powershell
powershell -ExecutionPolicy Bypass -File app_cccd\kiosk\install-startup.ps1
```

- Giai đoạn dev (chưa có installer prod): shortcut chạy `npm start` trong
  `app_cccd/electron/`.
- Sau này khi có `App_CCCD.exe` (electron-builder): thêm
  `-Target "C:\Path\To\App_CCCD.exe"`.

Kiểm tra: Win+R → gõ `shell:startup` → thấy `App_CCCD.lnk`.

### Bước 2 — Auto-login Windows (bạn tự nhập mật khẩu)

1. Tải Autologon (của Microsoft Sysinternals) từ
   https://learn.microsoft.com/sysinternals/downloads/autologon
2. Chạy (có thể truyền đường dẫn nếu để nơi khác):

```powershell
powershell -ExecutionPolicy Bypass -File app_cccd\kiosk\setup-autologon.ps1
```

3. Trong cửa sổ Autologon hiện ra, nhập:
   - **Username**: tài khoản kiosk
   - **Domain**: thường là tên máy (hoặc để trống cho máy không join domain)
   - **Password**: mật khẩu của tài khoản đó
4. Bấm **Enable**.

> Autologon lưu mật khẩu qua **LSA secret (mã hoá)**, không phải plaintext trong
> registry. Mật khẩu chỉ do bạn gõ trong GUI — script không đọc/ghi mật khẩu.

### Bước 3 — Khởi động lại máy để kiểm tra

Máy vào thẳng app, không dừng ở desktop.

## Gỡ / tắt

- **Tắt auto-login**: mở lại `Autologon.exe`, bấm **Disable**.
- **Bỏ app tự mở**:

```powershell
powershell -ExecutionPolicy Bypass -File app_cccd\kiosk\install-startup.ps1 -Uninstall
```

## Bảo mật (đọc kỹ)

- Auto-login nghĩa là **ai bật máy cũng vào được app**. Đặt máy ở nơi có kiểm
  soát.
- Tắt chia sẻ file / Remote Desktop nếu không cần — tài khoản auto-login là điểm
  yếu nếu lộ ra LAN.
- Đảm bảo dùng tài khoản **local**; tài khoản Microsoft có thể không cho mật khẩu
  rỗng / auto-login.

## Xử lý sự cố

- **Vào desktop nhưng app không lên**: kiểm tra shortcut trong `shell:startup`;
  chạy thử `cd app_cccd/electron && npm start` xem có lỗi không.
- **App mở chậm sau desktop vài giây**: bình thường — backend + Mongo khởi động;
  màn hình splash (tông đỏ Công an) che khoảng này.
- **Lỗi khởi động liên tục**: xem log backend / trình tự trong `main.js`, vì
  window watchdog có thể mở lại cửa sổ nếu nó bị đóng bất thường.