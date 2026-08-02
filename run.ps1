# run.ps1 - Start toan bo App_CCCD (usb+fp services, backend, frontend).
# Cach dung: .\run.ps1
# Yeu cau: .env da co JWT_SECRET + DONGLE_SECRET.
param([switch]$SkipMongo)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot                       # app_cccd/
$py   = Join-Path $root '.venv\Scripts\python.exe'
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
