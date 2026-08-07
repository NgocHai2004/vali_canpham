# install-startup.ps1 - Tao/go shortcut Startup: bat may -> login -> tu chay App_CCCD.
# Dev:   .\install-startup.ps1
#          (shortcut goi run-electron.ps1: start Mongo + services + backend + Electron)
# Prod:  .\install-startup.ps1 -Target "C:\...\App_CCCD.exe"
# Go:    .\install-startup.ps1 -Uninstall
[CmdletBinding()]
param(
    [switch]$Uninstall,
    [string]$Target
)

$ErrorActionPreference = 'Stop'
$root        = $PSScriptRoot                              # app_cccd/kiosk
$appRoot     = Split-Path -Parent $root                   # app_cccd
$runScript   = Join-Path $appRoot 'run-electron.ps1'
$electronDir = Join-Path $appRoot 'electron'
$startupDir  = [Environment]::GetFolderPath('Startup')
$lnkPath     = Join-Path $startupDir 'App_CCCD.lnk'

if ($Uninstall) {
    if (Test-Path $lnkPath) {
        Remove-Item $lnkPath -Force
        Write-Host "Da go shortcut Startup: $lnkPath"
    } else {
        Write-Host "Khong co shortcut de go: $lnkPath"
    }
    return
}

$shell = New-Object -ComObject WScript.Shell
$lnk   = $shell.CreateShortcut($lnkPath)

if ($Target) {
    # Prod: tro thang vao App_CCCD.exe (electron-builder).
    if (-not (Test-Path $Target)) { throw "Khong tim thay Target: $Target" }
    $lnk.TargetPath       = $Target
    $lnk.WorkingDirectory = Split-Path -Parent $Target
} else {
    # Dev: goi run-electron.ps1 (start Mongo + services + backend + Electron).
    if (-not (Test-Path $runScript)) {
        throw "Khong tim thay $runScript. Phai nam trong app_cccd/."
    }
    $lnk.TargetPath       = "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe"
    $lnk.Arguments        = "-NoProfile -ExecutionPolicy Bypass -File `"$runScript`""
    $lnk.WorkingDirectory = $appRoot
}
$lnk.WindowStyle = 7                                      # 7 = minimized (an cua so PS)
$lnk.Description  = 'App_CCCD kiosk auto-start (Electron + services)'
$lnk.Save()

Write-Host "Da tao shortcut Startup: $lnkPath"
Write-Host "Target: $($lnk.TargetPath)"
Write-Host "Args  : $($lnk.Arguments)"