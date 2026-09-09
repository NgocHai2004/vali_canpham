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
# cu. Nghi pham da enroll bang ZK phai enroll lai.
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

# CCCD Reader Service (Hanel HN-212) — chay nhu background process (khong phai
# Windows service, tranh SCM kill). Chay tu publish/ de doc appsettings.json + DLL.
$cccdExe = Join-Path $svc 'cccd_scanner\publish\CccdService.exe'
if (Test-Path $cccdExe) {
    # Neu Windows service CccdReaderService dang chay -> dung de tranh trung port/device.
    $cccdSvc = Get-Service -Name 'CccdReaderService' -ErrorAction SilentlyContinue
    if ($cccdSvc -and $cccdSvc.Status -eq 'Running') {
        try { Stop-Service -Name 'CccdReaderService' -Force -ErrorAction Stop } catch {}
    }
    # Guard chong trung o TANG PROCESS (khong phai port: service nay khong listen).
    # Instance thu hai lam StartMonitor throw "Multiple reader initialization is not
    # allowed" -> Program.cs Environment.Exit(1) sau 3 giay, nen moi lan chay
    # run-electron lai spawn mot process chet yeu. Ca hai instance con redirect
    # stdout vao cung cccd.out.log (truncate) => log bi cat nat, kho doc.
    # LUU Y: loi "[DOC] SCANCARD -> FAILURE" KHONG phai do double-spawn. Da kiem
    # chung 26/08: kill sach, chay dung 1 instance, StartMonitor OK + "Dau doc:
    # ADDED" nhung van FAILURE. Do la loi rieng (nghi thieu nap SDK tu _runtime).
    $cccdRunning = @(Get-Process -Name 'CccdService' -ErrorAction SilentlyContinue)
    if ($cccdRunning.Count -gt 0) {
        Write-Warning "CccdService.exe da chay (PID $($cccdRunning.Id -join ', ')) - bo qua spawn de tranh cuom reader."
    } else {
        Start-Process -FilePath $cccdExe `
            -WorkingDirectory (Split-Path $cccdExe) `
            -WindowStyle Hidden `
            -RedirectStandardOutput (Join-Path $logs 'cccd.out.log') `
            -RedirectStandardError  (Join-Path $logs 'cccd.err.log')
        Write-Host "  -> spawned: CCCD Reader Service (background)"
    }
} else {
    Write-Warning "Khong tim thay CCCD service: $cccdExe"
}
