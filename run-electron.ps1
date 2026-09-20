# run-electron.ps1 - Start toan bo App_CCCD qua app Electron kiosk (thay Edge).
# Cach dung: .\run-electron.ps1
# Yeu cau: .env da co JWT_SECRET + DONGLE_SECRET; Docker Desktop da cai (Linux engine).
#
# Thu tu:
#   1. Docker compose up (mongo + backend container)      -> 27017 / 8000
#   2. Services usb + fp (native, phan cung)              -> 8766 / 8765
#   3. Doi backend (docker) healthy tren 8000
#   4. OCR service (ScanSnap_iX1400_Driver_AutoInstall)   -> 127.0.0.1:8787
#      - Hung file ScanSnap Home xuat ra scan_paper, OCR, day sang backend.
#      - Dung system python (Python310) vi .venv khong co deps OCR.
#   5. Build frontend (bo qua neu dist co)
#   6. Electron (npm start trong electron/) — dev mode, khong spawn mongo/backend
#      vi docker da chiem 27017/8000; load frontend tu dist/ + proxy 8000/8765/8766.
param([switch]$ForceBuild)

$ErrorActionPreference = 'Stop'
$root     = $PSScriptRoot                       # app_cccd/
$py       = Join-Path $root '.venv\Scripts\python.exe'
$distPy   = 'C:\Users\vali-01\Documents\App_CCCD_dist\stage\runtime\python\python.exe'
if (Test-Path $distPy) { $py = $distPy }
$electron = Join-Path $root 'electron'
$frontend = Join-Path $root 'frontend'
$dist     = Join-Path $frontend 'dist'
$logs     = Join-Path $root 'logs'
$envFile  = Join-Path (Split-Path -Parent $root) '.env'
# Service OCR: ocr_service.py (Tesseract-vie), port 8787.
# Dung system python (Python310) vi .venv khong co deps OCR.
$ocrScript = Join-Path (Split-Path -Parent $root) 'ocr_service.py'
$ocrPy     = 'C:\Users\vali-01\AppData\Local\Programs\Python\Python310\python.exe'

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
if (-not $env:MONGO_URL -or $env:MONGO_URL.Contains('27018')) { $env:MONGO_URL = 'mongodb://127.0.0.1:27017' }
if (-not $env:USB_SERVICE_URL -or $env:USB_SERVICE_URL.Contains('8768')) { $env:USB_SERVICE_URL = 'http://127.0.0.1:8766' }
if (-not $env:FP_SERVICE_URL -or $env:FP_SERVICE_URL.Contains('8767'))  { $env:FP_SERVICE_URL  = 'http://127.0.0.1:8765' }

if (-not (Test-Path $logs)) { New-Item -ItemType Directory -Path $logs -Force | Out-Null }

# ---- 1. Mongo + Backend (Docker hoac Native Portable Mongo + Uvicorn) ----
Write-Step "1/6 Khoi dong Mongo + Backend..."
$projectRoot = Split-Path -Parent $root                    # App_CCCD/
$composeFile = Join-Path $projectRoot 'docker-compose.yml' # App_CCCD/docker-compose.yml
$mongoExe    = Join-Path $projectRoot 'mongo_portable\mongodb-win32-x86_64-windows-6.0.19\bin\mongod.exe'
$mongoData   = Join-Path $projectRoot 'mongo_data'

function Test-PortInUse([int]$Port) {
    $c = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
    return [bool]$c
}

# Kiem tra Docker Desktop co san sang khong
$useDocker = $false
try {
    $dockerCheck = docker info 2>&1
    if ($LASTEXITCODE -eq 0) {
        $useDocker = $true
    }
} catch {}

if ($useDocker -and (Test-Path $composeFile)) {
    Write-Host "  Phat hien Docker daemon -> Dung Docker compose..." -ForegroundColor Green
    Push-Location $projectRoot
    try { docker compose -f $composeFile up -d } finally { Pop-Location }
    if ($LASTEXITCODE -ne 0) { throw "docker compose up that bai (exit=$LASTEXITCODE)." }
    Write-Host "  Docker compose stack da up."
} else {
    Write-Host "  Docker daemon khong chay -> Chuyen sang che do Native (mongo_portable + uvicorn)..." -ForegroundColor Yellow

    # 1. MongoDB Native
    if (Test-PortInUse 27017) {
        Write-Host "  MongoDB da chay tren port 27017." -ForegroundColor Green
    } else {
        if (-not (Test-Path $mongoExe)) { throw "Khong tim thay mongod.exe tai $mongoExe" }
        if (-not (Test-Path $mongoData)) { New-Item -ItemType Directory -Path $mongoData -Force | Out-Null }
        $mongoLock = Join-Path $mongoData 'mongod.lock'
        if (Test-Path $mongoLock) { Remove-Item $mongoLock -Force -ErrorAction SilentlyContinue }
        $mongoLogDir = Join-Path $projectRoot 'mongo_log'
        if (-not (Test-Path $mongoLogDir)) { New-Item -ItemType Directory -Path $mongoLogDir -Force | Out-Null }
        Start-Process -FilePath $mongoExe `
            -ArgumentList '--dbpath', $mongoData, '--bind_ip', '127.0.0.1', '--port', '27017', '--logpath', (Join-Path $mongoLogDir 'mongod.log') `
            -WorkingDirectory $projectRoot `
            -WindowStyle Hidden
        Write-Host "  Da khoi dong MongoDB native (port 27017)." -ForegroundColor Green
        Start-Sleep -Seconds 2
    }

    # 2. Backend Native
    if (Test-PortInUse 8000) {
        Write-Host "  Backend da chay tren port 8000." -ForegroundColor Green
    } else {
        Start-Process -FilePath $py `
            -ArgumentList '-m','uvicorn','--app-dir','backend','main:app','--host','127.0.0.1','--port','8000' `
            -WorkingDirectory $root `
            -WindowStyle Hidden `
            -RedirectStandardOutput (Join-Path $logs 'backend.out.log') `
            -RedirectStandardError  (Join-Path $logs 'backend.err.log')
        Write-Host "  Da khoi dong Backend native (port 8000)." -ForegroundColor Green
    }
}

# ---- 2. Services (usb + fingerprint) ----
Write-Step "2/6 Services (usb 8766 + fingerprint 8765)..."
& (Join-Path $root 'start-services.ps1')

# ---- 3. Backend (doi healthy tren 8000) ----
Write-Step "3/6 Backend (doi healthy 8000)..."
$healthUrl = 'http://127.0.0.1:8000/api/health'
$backendOk = $false
for ($i = 0; $i -lt 90; $i++) {
    try {
        $r = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2 -ErrorAction Stop
        if ($r.ok) { $backendOk = $true; Write-Host "  Backend ready (db=$($r.db))."; break }
    } catch {}
    Start-Sleep -Milliseconds 1000
}
if (-not $backendOk) { throw "Backend khong healthy sau 90s (kiem tra logs/backend.err.log hoac docker logs)." }

# ---- 4. OCR service (ocr_service.py - Tesseract-vie, port 8787) ----
# Hung file ScanSnap Home xuat ra scan_paper, OCR, day sang backend (8000).
# Chay sau backend ready de push khong bi loi mang. Guard chong trung giong nhau.
Write-Step "4/6 OCR service (Tesseract-vie watch scan_paper)..."
if (-not (Test-Path $ocrPy)) {
    Write-Warning "  Khong tim thay $ocrPy - bo qua OCR service."
} elseif (-not (Test-Path $ocrScript)) {
    Write-Warning "  Khong tim thay $ocrScript - bo qua OCR service."
} elseif (Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue) {
    Write-Host "  OCR service da lang nghe 8787 - bo qua spawn."
} else {
    $env:PYTHONIOENCODING = 'utf-8'
    $env:TESSDATA_PREFIX  = Join-Path (Split-Path -Parent $root) 'tessdata_user'
    Start-Process -FilePath $ocrPy `
        -ArgumentList '-u', $ocrScript, '--watch', '--folder', (Join-Path (Split-Path -Parent $root) 'scan_paper'), '--backend', 'http://127.0.0.1:8000', '--port', '8787' `
        -WorkingDirectory (Split-Path -Parent $root) `
        -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $logs 'ocr.out.log') `
        -RedirectStandardError  (Join-Path $logs 'ocr.err.log')
    Write-Host "  Da start OCR service (folder=scan_paper, port 8787)."
}


# ---- 5. Build frontend va dong bo webdist ----
Write-Step "5/6 Frontend build & sync..."
$webdist = Join-Path $electron 'webdist'
if ($ForceBuild -or -not (Test-Path (Join-Path $dist 'index.html'))) {
    Push-Location $frontend
    try { npm run build } finally { Pop-Location }
    Write-Host "  Da build frontend -> dist/"
} else {
    Write-Host "  Da co dist/index.html. Dung -ForceBuild de rebuild neu can."
}
if (Test-Path $dist) {
    if (-not (Test-Path $webdist)) { New-Item -ItemType Directory -Path $webdist -Force | Out-Null }
    Copy-Item -Path "$dist\*" -Destination $webdist -Recurse -Force
    Write-Host "  Da dong bo dist sang electron/webdist."
}

# Don sach cac tien trinh electron cu va cache GPU loi neu co
Get-Process electron -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
$appDataShell = Join-Path $env:APPDATA 'app-cccd-shell'
if (Test-Path $appDataShell) {
    Remove-Item -Path (Join-Path $appDataShell 'GPUCache') -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path (Join-Path $appDataShell 'Singleton*') -Force -ErrorAction SilentlyContinue
}

# ---- 6. Electron ----
Write-Step "6/6 Khoi dong Electron..."
Push-Location $electron
try {
    $env:ELECTRON_BUILD = 'dev'
    # Chay o foreground de Ctrl+C dong hop tat ca + xem log truc tiep.
    npm start
} finally {
    Pop-Location
}

Write-Host "`n[run-electron] Da thoat. Dung .\stop.ps1 de don sach tien trinh." -ForegroundColor Yellow
