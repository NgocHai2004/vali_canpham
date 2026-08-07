# run-electron.ps1 - Start toan bo App_CCCD qua app Electron kiosk (thay Edge).
# Cach dung: .\run-electron.ps1
# Yeu cau: .env da co JWT_SECRET + DONGLE_SECRET.
#
# Thu tu:
#   1. Mongo (mongod.exe truc tiep, KHONG Docker)  -> 127.0.0.1:27017
#   2. Services usb + fp                          -> 8766 / 8765
#   3. Backend uvicorn                            -> 127.0.0.1:8000
#   4. Build frontend (bo qua neu dist co)
#   5. Electron (npm start trong electron/)
param([switch]$ForceBuild)

$ErrorActionPreference = 'Stop'
$root     = $PSScriptRoot                       # app_cccd/
$py       = Join-Path $root '.venv\Scripts\python.exe'
$electron = Join-Path $root 'electron'
$frontend = Join-Path $root 'frontend'
$dist     = Join-Path $frontend 'dist'
$logs     = Join-Path $root 'logs'
$envFile  = Join-Path (Split-Path -Parent $root) '.env'

# Mongo truc tiep (KHONG Docker).
# Ban mongod 8.3 (C:\Program Files\MongoDB\Server\8.3) gap STATUS_ENTRYPOINT_NOT_FOUND (0xC0000139)
# tren may nay -> dung ban portable 6.0.19 trong App_CCCD\mongo_portable.
$mongod   = Join-Path (Split-Path -Parent $root) 'mongo_portable\mongodb-win32-x86_64-windows-6.0.19\bin\mongod.exe'
if (-not (Test-Path $mongod)) {
    # Fallback: ban 8.3 (neu may da fix UCRT).
    $mongod = 'C:\Program Files\MongoDB\Server\8.3\bin\mongod.exe'
}
$dbpath   = Join-Path (Split-Path -Parent $root) 'mongo_data'   # App_CCCD/mongo_data

function Write-Step($msg) { Write-Host "`n[run-electron] $msg" -ForegroundColor Cyan }

# ---- Load .env ----
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith('#') -and $line.Contains('=')) {
            $k, $v = $line -split '=', 2
            Set-Item -Path "Env:$($k.Trim())" -Value $v.Trim().Trim('"').Trim("'")
        }
    }
} else {
    Write-Warning "Khong tim thay $envFile - dung env var hien co."
}
if (-not $env:DONGLE_SECRET) { throw "DONGLE_SECRET chua duoc set." }
if (-not $env:JWT_SECRET)    { throw "JWT_SECRET chua duoc set." }

if (-not (Test-Path $logs)) { New-Item -ItemType Directory -Path $logs -Force | Out-Null }

# ---- 1. Mongo (mongod.exe truc tiep, bind 127.0.0.1) ----
Write-Step "1/5 Mongo (mongod.exe, 127.0.0.1:27017)..."
if (-not (Test-Path $mongod)) { throw "Khong tim thay mongod.exe tai $mongod. Cai MongoDB Server hoac chinh duong dan." }
if (-not (Test-Path $dbpath)) { New-Item -ItemType Directory -Path $dbpath -Force | Out-Null }

$mongoAlreadyUp = Get-NetTCPConnection -LocalPort 27017 -State Listen -ErrorAction SilentlyContinue
if (-not $mongoAlreadyUp) {
    # Dung --logpath thay vi RedirectStandardOutput: mongod.exe 8.3 gap STATUS_ENTRYPOINT_NOT_FOUND
    # (0xC0000139) khi stdout/stderr bi redirect boi Start-Process. --logpath ghi log vao file truc tiep.
    Start-Process -FilePath $mongod `
        -ArgumentList '--dbpath', $dbpath, '--bind_ip', '127.0.0.1', '--port', '27017', `
                      '--logpath', (Join-Path $logs 'mongod.log') `
        -WindowStyle Hidden
    Write-Host "  Da start mongod.exe (dbpath=$dbpath)."
} else {
    Write-Host "  Mongo da lang nghe 27017 (co the Docker chua tat hoac dang chay). Bo qua start."
}
# Cho port 27017 san sang.
for ($i=0; $i -lt 30; $i++) {
    if (Get-NetTCPConnection -LocalPort 27017 -State Listen -ErrorAction SilentlyContinue) { break }
    Start-Sleep -Milliseconds 500
}

# ---- 2. Services (usb + fingerprint) ----
Write-Step "2/5 Services (usb 8766 + fingerprint 8765)..."
& (Join-Path $root 'start-services.ps1')

# ---- 3. Backend uvicorn (bind 127.0.0.1, khong 0.0.0.0 nhu run.ps1 cu) ----
Write-Step "3/5 Backend uvicorn (127.0.0.1:8000)..."
Start-Process -FilePath $py `
    -ArgumentList '-m','uvicorn','--app-dir','backend','main:app','--host','127.0.0.1','--port','8000' `
    -WorkingDirectory $root `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $root 'logs\backend.out.log') `
    -RedirectStandardError  (Join-Path $root 'logs\backend.err.log')
# Cho backend ready (poll /api/health).
$healthUrl = 'http://127.0.0.1:8000/api/health'
for ($i=0; $i -lt 60; $i++) {
    try {
        $r = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2 -ErrorAction Stop
        if ($r.ok) { Write-Host "  Backend ready (db=$($r.db))."; break }
    } catch {}
    Start-Sleep -Milliseconds 1000
}

# ---- 4. Build frontend (bo qua neu dist co va khong -ForceBuild) ----
Write-Step "4/5 Frontend build..."
if ($ForceBuild -or -not (Test-Path (Join-Path $dist 'index.html'))) {
    Push-Location $frontend
    try { npm run build } finally { Pop-Location }
    Write-Host "  Da build frontend -> dist/"
} else {
    Write-Host "  Da co dist/index.html (bo qua build). Dung -ForceBuild de rebuild."
}

# ---- 5. Electron ----
Write-Step "5/5 Khoi dong Electron..."
Push-Location $electron
try {
    $env:ELECTRON_BUILD = 'dev'
    # Chay o前台 (khong Start-Process) de Ctrl+C dong hop tat ca + xem log.
    npm start
} finally {
    Pop-Location
}

Write-Host "`n[run-electron] Da thoat. Dung .\stop.ps1 de don sach tien trinh." -ForegroundColor Yellow
