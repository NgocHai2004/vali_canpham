# restart-fp.ps1 - Dung roi spawn lai RIENG service van tay (morfin_service, port 8767).
#
# Vi sao can script rieng: start-services.ps1 co guard "port 8767 da co service - bo
# qua spawn" nen chay lai run-electron.ps1 KHONG bao gio nap lai code moi cua
# engine.py / api.py. Sua backend van tay xong thi phai dung process cu truoc.
#
# Cach dung: mo PowerShell "Run as Administrator" roi:
#     cd C:\Users\vali-01\Documents\Vali_hientruong\app_cccd
#     .\restart-fp.ps1
#
# Can quyen Admin vi process 8767 do launcher (chay elevated) spawn ra: PowerShell
# thuong se bao "Access is denied" khi Stop-Process.
#
# KHONG dung Mongo (27018), backend (8001), usb (8768) hay Electron - frontend chi
# goi HTTP sang 8767 nen service moi len la dung duoc ngay, khong phai mo lai app.
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

# --- 1. Dung process dang giu 8767 ---
$conn = Get-NetTCPConnection -LocalPort 8767 -State Listen -ErrorAction SilentlyContinue
if ($conn) {
    # Dedupe: mot process co the co nhieu dong connection.
    $pids = @($conn.OwningProcess | Select-Object -Unique)
    foreach ($procId in $pids) {
        $p = Get-Process -Id $procId -ErrorAction SilentlyContinue
        $label = if ($p) { "$($p.ProcessName) (PID $procId)" } else { "PID $procId" }
        try {
            Stop-Process -Id $procId -Force -ErrorAction Stop
            Write-Host "  Da dung $label." -ForegroundColor Green
        } catch {
            Write-Host "  KHONG dung duoc $label : $($_.Exception.Message)" -ForegroundColor Red
            Write-Host "  => Mo lai PowerShell bang 'Run as Administrator'." -ForegroundColor Yellow
            exit 1
        }
    }
    # Cho port that su nha. Spawn qua som thi instance moi chet voi
    # "[Errno 10048] only one usage of each socket address".
    for ($i = 0; $i -lt 20; $i++) {
        if (-not (Get-NetTCPConnection -LocalPort 8767 -State Listen -ErrorAction SilentlyContinue)) { break }
        Start-Sleep -Milliseconds 250
    }
} else {
    Write-Host "  8767 dang trong - khong co gi phai dung." -ForegroundColor Yellow
}

# --- 2. Spawn lai ---
# Goi start-services.ps1 thay vi tu Start-Process: no lo phan load .env
# (DONGLE_SECRET, MORFIN_SDK_DIR) va cac guard con lai. Cac service khac dang chay
# thi guard cua no tu bo qua, khong spawn trung.
& (Join-Path $root 'start-services.ps1')

# --- 3. Cho ready roi in chieu anh de xac nhan che do ---
# 800x750 = ROLL (lan), 1600x1500 = FLAT (chum). Day la cach duy nhat nhin tu ngoai
# de biet device dang o mode nao.
$ok = $false
for ($i = 0; $i -lt 40; $i++) {
    try {
        $h = Invoke-RestMethod -Uri 'http://127.0.0.1:8767/api/health' -TimeoutSec 2 -ErrorAction Stop
        Write-Host "`n[restart-fp] Service van tay da len." -ForegroundColor Cyan
        $h | ConvertTo-Json -Depth 4
        $ok = $true
        break
    } catch {}
    Start-Sleep -Milliseconds 500
}
if (-not $ok) {
    Write-Host "`n[restart-fp] Service khong tra loi /api/health sau 20s." -ForegroundColor Red
    Write-Host "Xem log: $(Join-Path $root 'logs\fingerprint.err.log')" -ForegroundColor Yellow
}
