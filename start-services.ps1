$ErrorActionPreference = 'Stop'

$root = 'C:\Users\vali-01\Documents\App_CCCD\app_cccd'
$py   = Join-Path $root '.venv\Scripts\python.exe'
$logs = Join-Path $root 'logs'

if (-not (Test-Path $logs)) {
    New-Item -ItemType Directory -Path $logs -Force | Out-Null
}

$env:DONGLE_SECRET = '4wYaZj6PURKzLJ2FlAf0thSvuWdH8cIC'

Start-Process -FilePath $py `
    -ArgumentList '-m','uvicorn','--app-dir','fingerprint_service','api:app','--host','127.0.0.1','--port','8765' `
    -WorkingDirectory $root `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $logs 'fingerprint.out.log') `
    -RedirectStandardError  (Join-Path $logs 'fingerprint.err.log')

Start-Process -FilePath $py `
    -ArgumentList '-m','uvicorn','--app-dir','usb_service','api:app','--host','127.0.0.1','--port','8766' `
    -WorkingDirectory $root `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $logs 'usb.out.log') `
    -RedirectStandardError  (Join-Path $logs 'usb.err.log')
