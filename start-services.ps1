$ErrorActionPreference = 'Stop'

# Resolve tu vi tri script: app_cccd/start-services.ps1
$appRoot     = $PSScriptRoot                          # app_cccd/
$backendDir  = Join-Path $appRoot 'backend'
$svc         = Join-Path $backendDir 'services'
$py          = Join-Path $appRoot '.venv\Scripts\python.exe'
$distPy      = 'C:\Users\vali-01\Documents\App_CCCD_dist\stage\runtime\python\python.exe'
if (Test-Path $distPy) { $py = $distPy }
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

# --- Guard chong trung: neu port da co process thi KHONG spawn lai. ---
# (Truong hop 2 nguon auto-start: kiosk-shell + Task AppCCCD-Services cu.
#  Chay 2 cung uvicorn cung port -> cuom device vân tay -> ZKFPM_Init code=1.)
function Test-PortInUse([int]$Port) {
    $c = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
    return [bool]$c
}
# Service van tay: morfin_service (Morfin slap scanner MORPHS, 4 ngon/lan chup)
# thay cho fingerprint_service (ZKFinger 1 ngon/lan). Giu nguyen port 8765 va
# contract API => frontend khong phai doi endpoint.
#
# MORFIN_SDK_DIR tro toi thu muc chua Morfin_Enroll_Core.dll + cac DLL phu
# (~273MB). Neu chua set trong .env, service se tim ./runtime canh api.py.
# LUU Y: template Morfin (FMR_V2005) KHONG so khop duoc voi template ZKFinger
# cu. Can pham da enroll bang ZK phai enroll lai.
$fpSvcDir = Join-Path $svc 'morfin_service'
if (-not $env:MORFIN_SDK_DIR) {
    Write-Warning "MORFIN_SDK_DIR chua set - morfin_service se tim runtime/ canh api.py."
}
if (Test-PortInUse 8765) {
    Write-Warning "Port 8765 (fingerprint) da co service - bo qua spawn de tranh trung."
} else {
    Start-Process -FilePath $py `
        -ArgumentList '-m','uvicorn','--app-dir',$fpSvcDir,'api:app','--host','127.0.0.1','--port','8765' `
        -WorkingDirectory $appRoot `
        -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $logs 'fingerprint.out.log') `
        -RedirectStandardError  (Join-Path $logs 'fingerprint.err.log')
}
if (Test-PortInUse 8766) {
    Write-Warning "Port 8766 (usb) da co service - bo qua spawn de tranh trung."
} else {
    Start-Process -FilePath $py `
        -ArgumentList '-m','uvicorn','--app-dir',(Join-Path $svc 'usb_service'),'api:app','--host','127.0.0.1','--port','8766' `
        -WorkingDirectory $appRoot `
        -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $logs 'usb.out.log') `
        -RedirectStandardError  (Join-Path $logs 'usb.err.log')
}

