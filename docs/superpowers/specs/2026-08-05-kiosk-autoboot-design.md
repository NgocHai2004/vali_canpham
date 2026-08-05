# Kiosk auto-boot: bật máy vào thẳng App_CCCD (Electron)

Ngày: 2026-08-05
Trạng thái: Design (đã duyệt qua brainstorming)

## 1. Bối cảnh & mục tiêu

Người dùng muốn máy kiosk **bật lên là vào thẳng App_CCCD**, không dừng ở
desktop, và app chạy dưới vỏ Electron kiosk thay vì Edge/Chrome `--app` như hiện
tại.

Yêu cầu này gồm hai phần độc lập:

1. **Vỏ Electron kiosk** — đã có spec + plan duyệt sẵn trong repo:
   - `docs/superpowers/specs/2026-08-04-electron-migration-design.md`
   - `docs/superpowers/plans/2026-08-04-electron-migration-phase1.md`
   Spec này KHÔNG thiết kế lại phần đó; sẽ thực thi đúng theo plan Phase 1.
2. **Lớp auto-boot** (MỚI — trọng tâm của spec này): cấu hình Windows để bật máy
   → tự đăng nhập → tự mở app.

### Phạm vi

- Chỉ Giai đoạn 1 của Electron (Electron shell, spawn backend từ venv, kiosk
  lockdown Tầng 1, watchdog, splash, bind 127.0.0.1, bỏ Vite). KHÔNG Nuitka /
  bytenode / mã hoá model.
- Auto-boot ở mức **auto-login + Startup**.

### Phi mục tiêu

- Không dùng Windows Assigned Access / Shell Launcher (thay explorer.exe) — quá
  cứng, khó bảo trì.
- Không tự xử lý mật khẩu Windows trong code (xem quyết định bên dưới).

## 2. Quyết định đã chốt

| Vấn đề | Quyết định |
|---|---|
| Phạm vi | Dựng Electron shell (Phase 1) + auto-boot |
| Mức auto-boot | Auto-login + Startup folder (không dùng Assigned Access) |
| Auto-login | Giữ mật khẩu, dùng Sysinternals `Autologon.exe` (mã hoá LSA secret). Tôi **chỉ viết script + hướng dẫn**, người vận hành tự chạy để nhập mật khẩu — code không chạm mật khẩu |
| Mở app sau login | Shortcut `.lnk` trong Startup folder (`shell:startup`) |

Lý do dùng `Autologon.exe` thay vì ghi thẳng registry Winlogon: cách registry
lưu `DefaultPassword` dạng **plaintext**, ai đọc registry đều thấy. `Autologon.exe`
lưu qua LSA secret (mã hoá) — an toàn hơn ở mức thực tế cho máy kiosk.

## 3. Kiến trúc lớp auto-boot

Hai lớp tách rời, mỗi lớp một trách nhiệm, gỡ được độc lập:

```
[Bật máy]
   │
   ├─ Lớp A: Auto-login (Autologon.exe / LSA)  ← người vận hành tự chạy 1 lần
   │     → Windows đăng nhập tài khoản kiosk, không hỏi mật khẩu
   │
   └─ Lớp B: Startup shortcut (shell:startup)  ← script tôi viết tạo/gỡ
         → Sau khi vào session, Windows tự chạy shortcut → khởi động Electron
               → Electron (Phase 1) spawn backend/mongo, hiện splash, vào kiosk
```

**Vì sao tách A và B:** login và mở-app là hai mối lo khác nhau. Tách ra thì:
- Gỡ từng cái độc lập (bỏ auto-login nhưng vẫn giữ app tự mở khi login tay).
- Phần đụng-tới-mật-khẩu (A) nằm hoàn toàn ngoài code — giảm rủi ro lộ bí mật.

## 4. Thành phần & giao diện

Tất cả file mới đặt trong `app_cccd/kiosk/`.

### 4.1 `kiosk/setup-autologon.ps1` — Lớp A (người vận hành tự chạy)

- **Đầu vào:** không nhận mật khẩu qua tham số. Tuỳ chọn `-AutologonPath <path>`
  nếu đã có sẵn `Autologon.exe`.
- **Hành vi:**
  1. Kiểm tra có `Autologon.exe` (Sysinternals) chưa. Nếu chưa: in link tải
     chính thức (`https://learn.microsoft.com/sysinternals/downloads/autologon`)
     + hướng dẫn, rồi dừng. **Không tự tải** (tránh chạm mạng ngoài ý muốn).
  2. Nếu có: mở GUI `Autologon.exe` để người vận hành tự gõ user + mật khẩu.
     Mật khẩu được Autologon mã hoá qua LSA secret; script không đọc/ghi nó.
- **Không làm:** không ghi registry Winlogon, không nhận/log mật khẩu.

### 4.2 `kiosk/install-startup.ps1` — Lớp B (tự động hoá được)

- **Tham số:** `-Uninstall` để gỡ; mặc định là cài.
- **Cài:** tạo shortcut `App_CCCD.lnk` trong
  `[Environment]::GetFolderPath('Startup')` trỏ tới lệnh khởi động Electron.
  - Dev (giai đoạn hiện tại, chưa có installer prod): shortcut chạy
    `cmd /c start "" npm.cmd start` với `WorkingDirectory = app_cccd\electron`
    (hoặc lệnh tương đương do plan Phase 1 định nghĩa trong `electron/package.json`).
  - Prod (sau Giai đoạn 2, khi có `App_CCCD.exe`): trỏ thẳng tới exe. Script
    nhận `-Target <path>` để chỉ định, mặc định dò `electron/`.
- **Gỡ:** xoá shortcut nếu tồn tại (idempotent).
- **Không đụng** auto-login — chỉ quản shortcut.

### 4.3 `kiosk/README-autoboot.md` — hướng dẫn vận hành

- Thứ tự thực hiện: (1) build frontend + dựng Electron theo Phase 1, (2) chạy
  `install-startup.ps1`, (3) chạy `setup-autologon.ps1` và nhập mật khẩu.
- Cách **tắt** auto-boot:
  - Tắt auto-login: mở `Autologon.exe`, bấm **Disable**.
  - Gỡ app tự mở: `install-startup.ps1 -Uninstall`.
- Lưu ý bảo mật: máy kiosk auto-login nghĩa là ai bật máy cũng vào được app;
  đảm bảo máy đặt nơi có kiểm soát và không bật chia sẻ file/RDP không cần thiết.
- Lưu ý: cần **local account** (tài khoản Microsoft có thể chặn cấu hình này).

## 5. Xử lý lỗi & trường hợp biên

- **Electron chưa dựng xong / `npm start` lỗi:** shortcut Startup vẫn chạy nhưng
  app không lên. README nêu rõ phải hoàn tất Phase 1 trước khi bật auto-boot.
- **Backend load chậm (YOLO):** đã được splash của Electron (Phase 1) che — không
  thuộc phạm vi lớp auto-boot.
- **Autologon.exe thiếu:** script dừng có thông báo, không làm gì nửa vời.
- **Chạy `install-startup.ps1` hai lần:** idempotent, ghi đè shortcut cũ.
- **Máy có nhiều user:** auto-login gắn với một tài khoản kiosk cụ thể; README
  nhắc chọn đúng tài khoản.

## 6. Kiểm thử

- `install-startup.ps1`: kiểm thủ công — chạy cài, xác nhận shortcut xuất hiện
  trong `shell:startup` và trỏ đúng target; chạy `-Uninstall`, xác nhận đã xoá.
- `setup-autologon.ps1`: kiểm thủ công — chạy khi thiếu Autologon (thấy hướng
  dẫn tải), chạy khi có (GUI mở).
- Auto-login end-to-end: người vận hành khởi động lại máy, xác nhận vào thẳng
  app. Không tự động hoá được (đụng cấu hình login thật của máy).
- Phần Electron shell: theo mục kiểm thử trong plan Phase 1.

## 7. Rủi ro & lưu ý

- Auto-login hạ thấp bảo mật vật lý của máy — chấp nhận được cho kiosk có kiểm
  soát, nêu rõ trong README.
- Startup shortcut chạy **sau** khi shell (explorer) sẵn sàng; nếu backend/mongo
  nặng, thời điểm app lên có thể trễ vài giây sau desktop — splash Electron che.
- Khi lên Giai đoạn 2 (installer prod), cân nhắc để electron-builder tự thêm mục
  Startup thay cho script — nhưng script vẫn là phương án hiện tại và fallback.
