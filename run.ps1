# run.ps1 - Start toan bo App_CCCD (usb+fp services, backend, frontend).
# Cach dung: .\run.ps1
# Yeu cau: .env da co JWT_SECRET + DONGLE_SECRET.
param([switch]$SkipMongo)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot                       # app_cccd/
$py   = Join-Path $root '.venv\Scripts\python.exe'
$distPy = 'C:\Users\vali-01\Documents\App_CCCD_dist\stage\runtime\python\python.exe'
if (Test-Path $distPy) { $py = $distPy }
$envFile = Join-Path (Split-Path -Parent $root) '.env'

# Load .env
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

# 0. MongoDB (neu chua chay)
$projectRoot = Split-Path -Parent $root
$mongoExe = Join-Path $projectRoot 'mongo_portable\mongodb-win32-x86_64-windows-6.0.19\bin\mongod.exe'
$mongoData = Join-Path $projectRoot 'mongo_data'
$mongoLogDir = Join-Path $projectRoot 'mongo_log'

if (-not $SkipMongo) {
    $mongoPortOpen = [bool](Get-NetTCPConnection -LocalPort 27017 -State Listen -ErrorAction SilentlyContinue)
    if (-not $mongoPortOpen) {
        if (-not (Test-Path $mongoData)) { New-Item -ItemType Directory -Path $mongoData -Force | Out-Null }
        if (-not (Test-Path $mongoLogDir)) { New-Item -ItemType Directory -Path $mongoLogDir -Force | Out-Null }
        $mongoLock = Join-Path $mongoData 'mongod.lock'
        if (Test-Path $mongoLock) { Remove-Item $mongoLock -Force -ErrorAction SilentlyContinue }
        if (Test-Path $mongoExe) {
            Start-Process -FilePath $mongoExe `
                -ArgumentList '--dbpath', $mongoData, '--bind_ip', '127.0.0.1', '--port', '27017', '--logpath', (Join-Path $mongoLogDir 'mongod.log') `
                -WorkingDirectory $projectRoot -WindowStyle Hidden
            Write-Host "Da khoi dong MongoDB native (port 27017)."
            Start-Sleep -Seconds 2
        }
    }
}

# 1. Services (usb + fingerprint)
& (Join-Path $root 'start-services.ps1')

# 2. Backend
Start-Process -FilePath $py `
    -ArgumentList '-m','uvicorn','--app-dir','backend','main:app','--host','0.0.0.0','--port','8000' `
    -WorkingDirectory $root -WindowStyle Normal

# 3. Frontend
Start-Process -FilePath 'npm' -ArgumentList 'run','dev' `
    -WorkingDirectory (Join-Path $root 'frontend') -WindowStyle Normal

Write-Host "Da start. Frontend: http://localhost:5173 | Backend: http://localhost:8000/api/health"
Write-Host "Dung: .\stop.ps1"
