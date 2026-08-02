$ErrorActionPreference = 'Stop'

# Resolve tu vi tri script: app_cccd/start-services.ps1
$appRoot     = $PSScriptRoot                          # app_cccd/
$backendDir  = Join-Path $appRoot 'backend'
$svc         = Join-Path $backendDir 'services'
$py          = Join-Path $appRoot '.venv\Scripts\python.exe'
$logs        = Join-Path $appRoot 'logs'

if (-not (Test-Path $logs)) {
    New-Item -ItemType Directory -Path $logs -Force | Out-Null
}

# DONGLE_SECRET phai duoc set truoc (tu .env hoac env cua user).
if (-not $env:DONGLE_SECRET) {
    throw "DONGLE_SECRET chua duoc set. Copy .env.example thanh .env va dien gia tri, hoac set env var."
}

Start-Process -FilePath $py `
    -ArgumentList '-m','uvicorn','--app-dir',(Join-Path $svc 'fingerprint_service'),'api:app','--host','127.0.0.1','--port','8765' `
    -WorkingDirectory $appRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $logs 'fingerprint.out.log') `
    -RedirectStandardError  (Join-Path $logs 'fingerprint.err.log')

Start-Process -FilePath $py `
    -ArgumentList '-m','uvicorn','--app-dir',(Join-Path $svc 'usb_service'),'api:app','--host','127.0.0.1','--port','8766' `
    -WorkingDirectory $appRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $logs 'usb.out.log') `
    -RedirectStandardError  (Join-Path $logs 'usb.err.log')
