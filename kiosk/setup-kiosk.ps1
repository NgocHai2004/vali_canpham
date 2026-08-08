# setup-kiosk.ps1 - Thiet lap KIOSK: bat may -> tu dong dang nhap Windows -> tu chay app Electron.
# ==============================================================================================
# Script nay lam 2 viec:
#   1. Bat Windows auto-login (bo qua man hinh mat khau khi boot)
#   2. Tao shortcut Startup -> chay run-electron.ps1 (khoi dong toan bo service + Electron)
#
# Cach dung (chay voi quyen Administrator):
#   powershell -ExecutionPolicy Bypass -File setup-kiosk.ps1
#
# Go bo kiosk:
#   powershell -ExecutionPolicy Bypass -File setup-kiosk.ps1 -Uninstall
#
# Tham so:
#   -UserName   : ten tai khoan Windows (mac dinh: user dang dang nhap)
#   -Password   : mat khau Windows (can thiet de auto-login)
#   -Domain     : ten may / domain (mac dinh: ten may hien tai)
#   -Uninstall  : go bo auto-login + shortcut Startup
# ==============================================================================================

[CmdletBinding()]
param(
    [string]$UserName,
    [string]$Password,
    [string]$Domain,
    [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'

# ---- Kiem tra quyen Administrator ----
$id = [Security.Principal.WindowsIdentity]::GetCurrent()
$pr = New-Object Security.Principal.WindowsPrincipal($id)
if (-not $pr.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "[LOI] Can chay script nay voi quyen Administrator." -ForegroundColor Red
    Write-Host "      Chuot phai vao PowerShell -> Run as administrator, roi chay lai." -ForegroundColor Yellow
    exit 1
}

$root       = $PSScriptRoot                              # app_cccd/kiosk
$appRoot    = Split-Path -Parent $root                   # app_cccd
$runScript  = Join-Path $appRoot 'run-electron.ps1'
$startupDir = [Environment]::GetFolderPath('Startup')
$lnkPath    = Join-Path $startupDir 'App_CCCD.lnk'
$winlogon   = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon'

# ---- Mac dinh ----
if (-not $UserName) { $UserName = $env:USERNAME }
if (-not $Domain)   { $Domain   = $env:COMPUTERNAME }

# =====================================================================
# UNINSTALL
# =====================================================================
if ($Uninstall) {
    Write-Host "=== Go bo kiosk ===" -ForegroundColor Cyan

    # Go shortcut Startup
    if (Test-Path $lnkPath) {
        Remove-Item $lnkPath -Force
        Write-Host "  [OK] Da xoa shortcut Startup: $lnkPath" -ForegroundColor Green
    } else {
        Write-Host "  [i] Khong co shortcut de xoa." -ForegroundColor DarkGray
    }

    # Tat auto-login
    foreach ($p in 'AutoAdminLogon','DefaultUserName','DefaultDomainName','DefaultPassword','ForceAutoLogon') {
        Remove-ItemProperty -Path $winlogon -Name $p -ErrorAction SilentlyContinue
    }
    Write-Host "  [OK] Da tat auto-login Windows." -ForegroundColor Green

    Write-Host ""
    Write-Host "Da go bo kiosk. Lan sau bat may se hoi mat khau nhu binh thuong." -ForegroundColor Yellow
    exit 0
}

# =====================================================================
# INSTALL
# =====================================================================
Write-Host "=== Thiet lap KIOSK App_CCCD ===" -ForegroundColor Cyan
Write-Host ""

# ---- 1. Kiem tra run-electron.ps1 ----
if (-not (Test-Path $runScript)) {
    Write-Host "[LOI] Khong tim thay $runScript" -ForegroundColor Red
    exit 1
}

# ---- 2. Bat Windows auto-login ----
if (-not $Password) {
    Write-Host "[LOI] Can mat khau Windows de bat auto-login." -ForegroundColor Red
    Write-Host "      Chay lai: powershell -ExecutionPolicy Bypass -File setup-kiosk.ps1 -Password 'MAT_KHAU'" -ForegroundColor Yellow
    exit 1
}

Write-Host "1/2 Bat auto-login Windows..." -ForegroundColor Yellow
Set-ItemProperty -Path $winlogon -Name 'AutoAdminLogon'    -Value '1' -Type String
Set-ItemProperty -Path $winlogon -Name 'DefaultUserName'   -Value $UserName -Type String
Set-ItemProperty -Path $winlogon -Name 'DefaultDomainName' -Value $Domain -Type String
Set-ItemProperty -Path $winlogon -Name 'DefaultPassword'   -Value $Password -Type String
Set-ItemProperty -Path $winlogon -Name 'ForceAutoLogon'    -Value '1' -Type String
Write-Host "  [OK] Auto-logon: $Domain\$UserName" -ForegroundColor Green
Write-Host "  [i] Mat khau duoc luu dang plaintext trong registry (DefaultPassword)." -ForegroundColor DarkGray

# ---- 3. Tao shortcut Startup ----
Write-Host "2/2 Tao shortcut Startup..." -ForegroundColor Yellow
$shell = New-Object -ComObject WScript.Shell
$lnk   = $shell.CreateShortcut($lnkPath)
$lnk.TargetPath       = "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe"
$lnk.Arguments        = "-NoProfile -ExecutionPolicy Bypass -File `"$runScript`""
$lnk.WorkingDirectory = $appRoot
$lnk.WindowStyle      = 7                                  # 7 = minimized (an cua so PS)
$lnk.Description      = 'App_CCCD kiosk auto-start (Electron + services)'
$lnk.Save()
Write-Host "  [OK] Da tao shortcut: $lnkPath" -ForegroundColor Green

# ---- 4. Kiem tra weight scheduled task ----
$task = Get-ScheduledTask -TaskName 'JPDScaleGateway' -ErrorAction SilentlyContinue
if ($task) {
    Write-Host "  [OK] Weight service (JPDScaleGateway) da co - tu chay khi dang nhap." -ForegroundColor Green
} else {
    Write-Host "  [!] Chua thay weight service (JPDScaleGateway). Chay: .\weight\install_service.ps1" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== HOAN TAT ===" -ForegroundColor Cyan
Write-Host "  - Bat may -> tu dong dang nhap $Domain\$UserName (khong can mat khau)"
Write-Host "  - Tu chay: MongoDB + Backend + USB + Fingerprint + CCCD + Electron app"
Write-Host "  - Weight (can) tu chay qua Scheduled Task"
Write-Host ""
Write-Host "Khoi dong lai may de kiem tra." -ForegroundColor Yellow
Write-Host "Go bo: powershell -ExecutionPolicy Bypass -File setup-kiosk.ps1 -Uninstall" -ForegroundColor DarkGray