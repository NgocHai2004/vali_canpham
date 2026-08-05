# install-startup.ps1 - Tao/go shortcut Startup mo app Electron khi login.
# Cai:  .\install-startup.ps1              (dev: chay npm start trong electron/)
#       .\install-startup.ps1 -Target "C:\...\App_CCCD.exe"   (prod: tro thang exe)
# Go:   .\install-startup.ps1 -Uninstall
[CmdletBinding()]
param(
    [switch]$Uninstall,
    [string]$Target
)

$ErrorActionPreference = 'Stop'
$root       = $PSScriptRoot                              # app_cccd/kiosk
$appRoot    = Split-Path -Parent $root                   # app_cccd
$electronDir = Join-Path $appRoot 'electron'
$startupDir = [Environment]::GetFolderPath('Startup')
$lnkPath    = Join-Path $startupDir 'App_CCCD.lnk'

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
    if (-not (Test-Path $Target)) { throw "Khong tim thay Target: $Target" }
    $lnk.TargetPath       = $Target
    $lnk.WorkingDirectory = Split-Path -Parent $Target
} else {
    # Dev: chay 'npm start' trong electron/ (khong hien cua so cmd).
    if (-not (Test-Path $electronDir)) {
        throw "Chua co thu muc electron/ ($electronDir). Dung plan Electron Phase 1 truoc."
    }
    $lnk.TargetPath       = "$env:WINDIR\System32\cmd.exe"
    $lnk.Arguments        = '/c start "" /min npm.cmd start'
    $lnk.WorkingDirectory = $electronDir
}
$lnk.WindowStyle = 7                                      # 7 = minimized
$lnk.Description  = 'App_CCCD kiosk auto-start'
$lnk.Save()

Write-Host "Da tao shortcut Startup: $lnkPath"
Write-Host "Target: $($lnk.TargetPath) $($lnk.Arguments)"