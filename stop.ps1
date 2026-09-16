# stop.ps1 - Dung cac tien trinh cua INSTANCE NAY (Vali_hientruong).
# Bo port rieng: mongod 27018 / backend 8001 / fp 8767 / usb 8768.
# (App_CCCD van chay 27017 / 8000 / 8765 / 8766 - script nay KHONG dung toi.)
#
# Nguyen tac: chi kill theo (a) PID dang giu port cua instance nay, va
# (b) process co duong dan nam duoi cay $PSScriptRoot. Khong kill electron/node/
# python "hang loat" nhu ban cu - ban cu diet luon ca instance App_CCCD.
$ErrorActionPreference = 'SilentlyContinue'
$tree = $PSScriptRoot                      # ...\Vali_hientruong\app_cccd
$ports = 27018, 8001, 8767, 8768

Write-Host "[stop] Instance: $tree" -ForegroundColor Cyan
Write-Host "[stop] Port      : $($ports -join ', ')"

# ---- 1. Kill theo PID dang lang nghe tren port cua instance nay ----
foreach ($p in $ports) {
    $conns = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
    foreach ($c in $conns) {
        try {
            Stop-Process -Id $c.OwningProcess -Force -ErrorAction Stop
            Write-Host "  Da kill PID $($c.OwningProcess) (port $p)"
        } catch {}
    }
}

# ---- 2. Kill electron / node / python thuoc CAY NAY (tien trinh con, lech port) ----
# electron.exe cua dev nam o electron\node_modules\electron\dist\; python cua
# backend/service nam o .venv\Scripts\. Tat ca deu bat dau bang $tree.
$mine = Get-Process electron, node, python, mongod -ErrorAction SilentlyContinue |
        Where-Object { $_.Path -and $_.Path.StartsWith($tree, [System.StringComparison]::OrdinalIgnoreCase) }
foreach ($pr in $mine) {
    Stop-Process -Id $pr.Id -Force -ErrorAction SilentlyContinue
    Write-Host "  Da kill $($pr.ProcessName) PID $($pr.Id) ($($pr.Path))"
}

Start-Sleep -Milliseconds 800
Write-Host "`n[stop] Kiem tra lai port:"
foreach ($p in $ports) {
    $still = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
    if ($still) { Write-Host "  $p VAN con lang nghe (PID $($still.OwningProcess -join ', '))" -ForegroundColor Yellow }
    else        { Write-Host "  $p da trong" }
}
Write-Host "`n[stop] Xong. App_CCCD (27017/8000/8765/8766) khong bi anh huong." -ForegroundColor Green
