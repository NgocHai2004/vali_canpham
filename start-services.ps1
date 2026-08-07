$ErrorActionPreference = 'Stop'

# Resolve tu vi tri script: app_cccd/start-services.ps1
$appRoot     = $PSScriptRoot                          # app_cccd/
$backendDir  = Join-Path $appRoot 'backend'
$svc         = Join-Path $backendDir 'services'
$py          = Join-Path $appRoot '.venv\Scripts\python.exe'
$logs        = Join-Path $appRoot 'logs'
$envFile     = Join-Path (Split-Path -Parent $appRoot) '.env'   # App_CCCD/.env

if (-not (Test-Path $logs)) {
    New-Item -ItemType Directory -Path $logs -Force | Out-Null
}

# Load .env vao env var cua session nay. Nguon su that duy nhat la .env —
# usb_service/fingerprint_service cung tu doc .env (code), nhung load o day de
# cac service ke thua env va cho start-services khong throw khi chua set env var.
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

# DONGLE_SECRET: uu tien env var, roi den .env (da load o tren).
# Neu van khong co -> canh bao, KHONG throw (usb_service tu doc .env hoac bao loi).
if (-not $env:DONGLE_SECRET) {
    Write-Warning "DONGLE_SECRET chua duoc set. usb_service se thu doc tu .env."
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

# CCCD Reader Service (Hanel HN-212) — chay nhu background process (khong phai
# Windows service, tranh SCM kill). Chay tu publish/ de doc appsettings.json + DLL.
$cccdExe = Join-Path $svc 'cccd_scanner\publish\CccdService.exe'
if (Test-Path $cccdExe) {
    # Neu Windows service CccdReaderService dang chay -> dung de tranh trung port/device.
    $cccdSvc = Get-Service -Name 'CccdReaderService' -ErrorAction SilentlyContinue
    if ($cccdSvc -and $cccdSvc.Status -eq 'Running') {
        try { Stop-Service -Name 'CccdReaderService' -Force -ErrorAction Stop } catch {}
    }
    Start-Process -FilePath $cccdExe `
        -WorkingDirectory (Split-Path $cccdExe) `
        -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $logs 'cccd.out.log') `
        -RedirectStandardError  (Join-Path $logs 'cccd.err.log')
    Write-Host "  -> spawned: CCCD Reader Service (background)"
} else {
    Write-Warning "Khong tim thay CCCD service: $cccdExe"
}
