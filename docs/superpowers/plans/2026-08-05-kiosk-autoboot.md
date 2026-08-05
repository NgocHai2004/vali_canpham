# Kiosk Auto-boot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cấu hình Windows để bật máy → tự đăng nhập → tự mở app Electron App_CCCD, qua hai script PowerShell + một README vận hành.

**Architecture:** Hai lớp tách rời. Lớp A (auto-login) là script wrapper quanh Sysinternals `Autologon.exe` — người vận hành tự chạy và nhập mật khẩu; code không chạm mật khẩu. Lớp B (tự mở app) là script tạo/gỡ shortcut `.lnk` trong Startup folder trỏ tới lệnh khởi động Electron.

**Tech Stack:** PowerShell 5.1, Windows Startup folder (`shell:startup`), `WScript.Shell` COM để tạo `.lnk`, Sysinternals Autologon (bên ngoài, không bundle).

## Global Constraints

- Phụ thuộc plan Electron Phase 1 (`docs/superpowers/plans/2026-08-04-electron-migration-phase1.md`) — shortcut chỉ chạy được khi thư mục `app_cccd/electron/` đã dựng xong. Xem spec `docs/superpowers/specs/2026-08-05-kiosk-autoboot-design.md`.
- Auto-login: **chỉ viết script + hướng dẫn**, không nhận/log/ghi mật khẩu trong code. Dùng `Autologon.exe`, KHÔNG ghi registry Winlogon `DefaultPassword`.
- Tất cả file mới đặt trong `app_cccd/kiosk/`.
- Script phải **idempotent**: chạy nhiều lần không hỏng.
- Commit dùng tiếng Việt nhất quán với repo; kết thúc bằng `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Cần **local account** (tài khoản Microsoft có thể chặn auto-login) — nêu trong README.

---

## File Structure

```
app_cccd/kiosk/
├─ install-startup.ps1     # Lớp B: tạo/gỡ shortcut Startup (tự động hoá được)
├─ setup-autologon.ps1     # Lớp A: wrapper quanh Autologon.exe (người vận hành chạy)
└─ README-autoboot.md      # Hướng dẫn vận hành + cách gỡ
```

Ranh giới trách nhiệm:
- `install-startup.ps1` — chỉ quản shortcut trong `shell:startup`. Không đụng login.
- `setup-autologon.ps1` — chỉ mở Autologon. Không đụng shortcut, không đụng mật khẩu.
- `README-autoboot.md` — nguồn hướng dẫn vận hành duy nhất.

Kiểm thử: cả hai script kiểm **thủ công** (đụng filesystem/GUI thật của Windows, không unit-test tự động được). Mỗi task nêu rõ bước kiểm chứng thủ công + kết quả mong đợi.

---

## Task 1: Script cài/gỡ Startup shortcut (Lớp B)

**Files:**
- Create: `app_cccd/kiosk/install-startup.ps1`

**Interfaces:**
- Consumes: thư mục `app_cccd/electron/` với script npm `start` (do plan Electron Phase 1 tạo).
- Produces: shortcut `App_CCCD.lnk` trong `[Environment]::GetFolderPath('Startup')`.

- [ ] **Step 1: Viết script**

```powershell
# install-startup.ps1 - Tao/go shortcut Startup mo app Electron khi login.
# Cai:  .\install-startup.ps1              (dev: chay npm start trong electron/)
#       .\install-startup.ps1 -Target "C:\...\App_CCCD.exe"   (prod: tro thang exe)
# Go:   .\install-startup.ps1 -Uninstall
[CmdletBinding()]
param(
    [switch]$Uninstall,
    [string]$Target
)

$ErrorActionPreference = 'Stop'
$root       = $PSScriptRoot                              # app_cccd/kiosk
$appRoot    = Split-Path -Parent $root                   # app_cccd
$electronDir = Join-Path $appRoot 'electron'
$startupDir = [Environment]::GetFolderPath('Startup')
$lnkPath    = Join-Path $startupDir 'App_CCCD.lnk'

if ($Uninstall) {
    if (Test-Path $lnkPath) {
        Remove-Item $lnkPath -Force
        Write-Host "Da go shortcut Startup: $lnkPath"
    } else {
        Write-Host "Khong co shortcut de go: $lnkPath"
    }
    return
}

$shell = New-Object -ComObject WScript.Shell
$lnk   = $shell.CreateShortcut($lnkPath)

if ($Target) {
    if (-not (Test-Path $Target)) { throw "Khong tim thay Target: $Target" }
    $lnk.TargetPath       = $Target
    $lnk.WorkingDirectory = Split-Path -Parent $Target
} else {
    # Dev: chay 'npm start' trong electron/ (khong hien cua so cmd).
    if (-not (Test-Path $electronDir)) {
        throw "Chua co thu muc electron/ ($electronDir). Dung plan Electron Phase 1 truoc."
    }
    $lnk.TargetPath       = "$env:WINDIR\System32\cmd.exe"
    $lnk.Arguments        = '/c start "" /min npm.cmd start'
    $lnk.WorkingDirectory = $electronDir
}
$lnk.WindowStyle = 7                                      # 7 = minimized
$lnk.Description  = 'App_CCCD kiosk auto-start'
$lnk.Save()

Write-Host "Da tao shortcut Startup: $lnkPath"
Write-Host "Target: $($lnk.TargetPath) $($lnk.Arguments)"
```

- [ ] **Step 2: Kiểm chứng cài (thủ công)**

Chạy: `powershell -ExecutionPolicy Bypass -File app_cccd\kiosk\install-startup.ps1`
Mong đợi: in "Da tao shortcut Startup: ...\App_CCCD.lnk". Mở `shell:startup` (Win+R → gõ `shell:startup`) thấy `App_CCCD.lnk`. Chuột phải → Properties: Target là `cmd.exe`, Start in là đường dẫn `electron/`.

- [ ] **Step 3: Kiểm chứng gỡ (thủ công) — idempotent**

Chạy: `... install-startup.ps1 -Uninstall` (hai lần).
Mong đợi: lần 1 in "Da go shortcut...", lần 2 in "Khong co shortcut de go...". Không lỗi.

- [ ] **Step 4: Commit**

```bash
git add app_cccd/kiosk/install-startup.ps1
git commit -m "$(printf 'feat(kiosk): script cai/go Startup shortcut mo app Electron\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 2: Script wrapper Autologon (Lớp A)

**Files:**
- Create: `app_cccd/kiosk/setup-autologon.ps1`

**Interfaces:**
- Consumes: `Autologon.exe` (Sysinternals) do người vận hành tải; tuỳ chọn qua `-AutologonPath`.
- Produces: mở GUI Autologon (không trả về giá trị cho task khác).

- [ ] **Step 1: Viết script**

```powershell
# setup-autologon.ps1 - Mo Sysinternals Autologon de nhap tai khoan auto-login.
# Mat khau do NGUOI VAN HANH tu go trong GUI; script khong doc/ghi/log mat khau.
# Dung:  .\setup-autologon.ps1
#        .\setup-autologon.ps1 -AutologonPath "C:\Tools\Autologon.exe"
[CmdletBinding()]
param([string]$AutologonPath)

$ErrorActionPreference = 'Stop'
$dlUrl = 'https://learn.microsoft.com/sysinternals/downloads/autologon'

function Find-Autologon {
    param([string]$Hint)
    if ($Hint) {
        if (Test-Path $Hint) { return (Resolve-Path $Hint).Path }
        throw "Khong tim thay Autologon tai: $Hint"
    }
    $cmd = Get-Command 'Autologon.exe','Autologon64.exe' -ErrorAction SilentlyContinue |
           Select-Object -First 1
    if ($cmd) { return $cmd.Source }
    foreach ($p in @(
        (Join-Path $PSScriptRoot 'Autologon.exe'),
        (Join-Path $PSScriptRoot 'Autologon64.exe'))) {
        if (Test-Path $p) { return $p }
    }
    return $null
}

$exe = Find-Autologon -Hint $AutologonPath
if (-not $exe) {
    Write-Warning "Chua co Autologon.exe."
    Write-Host    "Tai tu Microsoft Sysinternals: $dlUrl"
    Write-Host    "Roi chay lai, hoac: .\setup-autologon.ps1 -AutologonPath <duong-dan>"
    return
}

Write-Host "Mo Autologon: $exe"
Write-Host "Trong cua so hien ra: nhap Username, Domain (thuong la ten may), Password roi bam Enable."
Write-Host "LUU Y: dung tai khoan LOCAL. De TAT auto-login sau nay, mo lai Autologon va bam Disable."
Start-Process -FilePath $exe
```

- [ ] **Step 2: Kiểm chứng thiếu Autologon (thủ công)**

Chạy ở máy chưa có Autologon: `... setup-autologon.ps1`
Mong đợi: cảnh báo "Chua co Autologon.exe" + in link tải. Không mở gì, không lỗi.

- [ ] **Step 3: Kiểm chứng có Autologon (thủ công)**

Tải `Autologon.exe`, chạy `... setup-autologon.ps1 -AutologonPath <path>`.
Mong đợi: in hướng dẫn + GUI Autologon mở lên. Script không đọc/ghi mật khẩu (kiểm bằng đọc lại code — không có biến password nào).

- [ ] **Step 4: Commit**

```bash
git add app_cccd/kiosk/setup-autologon.ps1
git commit -m "$(printf 'feat(kiosk): wrapper mo Sysinternals Autologon cho auto-login\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 3: README vận hành auto-boot

**Files:**
- Create: `app_cccd/kiosk/README-autoboot.md`

**Interfaces:**
- Consumes: hai script ở Task 1 & 2.
- Produces: không (tài liệu).

- [ ] **Step 1: Viết README**

Nội dung phải gồm đủ các mục sau (viết đầy đủ, không để trống):

```markdown
# Auto-boot App_CCCD (kiosk)

Bật máy → tự đăng nhập → tự mở app. Hai lớp tách rời.

## Điều kiện tiên quyết
- Đã dựng xong Electron Phase 1 (có thư mục `app_cccd/electron/`, chạy được `npm start`).
- Dùng **tài khoản local** của Windows (tài khoản Microsoft có thể chặn auto-login).

## Cài đặt (theo thứ tự)
1. Tự mở app sau khi login:
   `powershell -ExecutionPolicy Bypass -File app_cccd\kiosk\install-startup.ps1`
   (Prod có exe: thêm `-Target "C:\...\App_CCCD.exe"`.)
2. Auto-login: tải Autologon từ
   https://learn.microsoft.com/sysinternals/downloads/autologon
   rồi `powershell -ExecutionPolicy Bypass -File app_cccd\kiosk\setup-autologon.ps1`
   — nhập Username / Domain (tên máy) / Password trong GUI, bấm Enable.
3. Khởi động lại máy để kiểm tra: máy vào thẳng app.

## Gỡ / tắt
- Tắt auto-login: mở `Autologon.exe`, bấm **Disable**.
- Bỏ app tự mở: `... install-startup.ps1 -Uninstall`.

## Bảo mật (đọc kỹ)
- Auto-login nghĩa là **ai bật máy cũng vào được app**. Đặt máy nơi có kiểm soát.
- Tắt chia sẻ file / Remote Desktop nếu không cần — tài khoản auto-login là điểm yếu qua LAN.
- Autologon lưu mật khẩu qua LSA secret (mã hoá), không phải plaintext — an toàn hơn ghi registry.

## Xử lý sự cố
- Máy vào desktop nhưng app không lên: kiểm tra shortcut trong `shell:startup`, chạy thử
  `npm start` trong `app_cccd/electron/` xem có lỗi không.
- App lên chậm sau desktop vài giây: bình thường (backend + Mongo khởi động), splash Electron che.
```

- [ ] **Step 2: Kiểm chứng (thủ công)**

Đọc lại README: mọi lệnh chạy được, không còn TODO/chỗ trống, đường dẫn khớp Task 1 & 2.

- [ ] **Step 3: Commit**

```bash
git add app_cccd/kiosk/README-autoboot.md
git commit -m "$(printf 'docs(kiosk): huong dan van hanh auto-boot\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Self-Review (auto-boot plan)

- **Spec coverage:** Lớp A (setup-autologon) → Task 2; Lớp B (install-startup) → Task 1; README + cách gỡ + lưu ý bảo mật → Task 3. Đủ mục §4 của spec.
- **Placeholder scan:** không có TODO/TBD; script viết đầy đủ.
- **Type consistency:** tên file `.lnk` (`App_CCCD.lnk`), tham số (`-Uninstall`, `-Target`, `-AutologonPath`) nhất quán giữa script và README.
- **Phụ thuộc:** nêu rõ cần Electron Phase 1 xong trước (Global Constraints + README).
