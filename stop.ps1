# stop.ps1 - Kill tien trinh theo port (8000, 8765, 8766, 5173).
$ports = 8000, 8765, 8766, 5173
foreach ($p in $ports) {
    $conns = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
    foreach ($c in $conns) {
        try {
            Stop-Process -Id $c.OwningProcess -Force -ErrorAction Stop
            Write-Host "Da kill PID $($c.OwningProcess) (port $p)"
        } catch {}
    }
}
# Kem node/python lech:
Get-Process node, python -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -like '*vite*' -or $_.Path -like '*uvicorn*' } | Stop-Process -Force -ErrorAction SilentlyContinue
