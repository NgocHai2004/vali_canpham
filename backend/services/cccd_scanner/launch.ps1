# Start CccdService.exe (.NET). Binary phai nam trong .\bin\ (xem README.md).
$ErrorActionPreference = 'Stop'
$here   = $PSScriptRoot
$exe    = Join-Path $here 'bin\CccdService.exe'
if (-not (Test-Path $exe)) {
    throw "Khong tim thay $exe. Doc README.md de deploy binary."
}
Start-Process -FilePath $exe -WorkingDirectory $here
Write-Host "CccdService da start. Log: $here\Logs\"
