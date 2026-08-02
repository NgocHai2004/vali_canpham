# install_service.ps1
# ====================
# Tao Scheduled Task chay JPD Gateway TU DONG khi ban dang nhap Windows (May A).
# Chay AN (khong hien cua so) bang pythonw.exe, tu restart khi loi.
#
# Cach dung: mo PowerShell, chay:
#     powershell -ExecutionPolicy Bypass -File install_service.ps1
#
# Go bo: chay uninstall_service.ps1

$ErrorActionPreference = "Stop"

$TaskName   = "JPDScaleGateway"
$ScriptDir  = $PSScriptRoot
$RunScript  = Join-Path $ScriptDir "service_run.py"

# Tim pythonw.exe (chay khong cua so). Neu khong co, fallback python.exe.
$pythonw = (Get-Command pythonw.exe -ErrorAction SilentlyContinue).Source
if (-not $pythonw) {
    $py = (Get-Command python.exe -ErrorAction SilentlyContinue).Source
    if (-not $py) { throw "Khong tim thay python. Cai Python roi chay lai." }
    # pythonw thuong nam cung thu muc python
    $cand = Join-Path (Split-Path $py) "pythonw.exe"
    $pythonw = if (Test-Path $cand) { $cand } else { $py }
}

Write-Host "python : $pythonw"
Write-Host "script : $RunScript"

if (-not (Test-Path $RunScript)) { throw "Khong thay $RunScript" }

# Xoa task cu neu da ton tai
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Write-Host "Task '$TaskName' da ton tai -> xoa de tao lai..."
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

$action = New-ScheduledTaskAction -Execute $pythonw -Argument "`"$RunScript`"" -WorkingDirectory $ScriptDir

# Trigger: khi user hien tai dang nhap
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

# Settings: chay an, restart khi loi, khong tu dung
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -RestartCount 3 `
    -ExecutionTimeLimit (New-TimeSpan -Seconds 0)   # 0 = khong gioi han thoi gian chay

$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest

Register-ScheduledTask -TaskName $TaskName `
    -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
    -Description "JPD-700A BLE Gateway - doc can va gui JSON sang May B" | Out-Null

Write-Host ""
Write-Host "DA CAI XONG task '$TaskName'." -ForegroundColor Green
Write-Host "  - Task se tu chay khi ban dang nhap Windows."
Write-Host "  - Chay thu ngay bay gio bang lenh:"
Write-Host "      Start-ScheduledTask -TaskName $TaskName"
Write-Host "  - Xem log: $ScriptDir\logs\gateway.log"
Write-Host "  - Go bo: chay uninstall_service.ps1"
