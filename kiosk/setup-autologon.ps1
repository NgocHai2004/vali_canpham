# setup-autologon.ps1 - Mo Sysinternals Autologon de nhap tai khoan auto-login.
# Mat khau do NGUOI VAN HANH tu go trong GUI; script khong doc/ghi/log mat khau.
# Dung:  .\setup-autologon.ps1
#        .\setup-autologon.ps1 -AutologonPath "C:\Tools\Autologon.exe"
[CmdletBinding()]
param([string]$AutologonPath)

$ErrorActionPreference = 'Stop'
$dlUrl = 'https://learn.microsoft.com/sysinternals/downloads/autologon'

function Find-Autologon {
    param([string]$Hint)
    if ($Hint) {
        if (Test-Path $Hint) { return (Resolve-Path $Hint).Path }
        throw "Khong tim thay Autologon tai: $Hint"
    }
    $cmd = Get-Command 'Autologon.exe','Autologon64.exe' -ErrorAction SilentlyContinue |
           Select-Object -First 1
    if ($cmd) { return $cmd.Source }
    foreach ($p in @(
        (Join-Path $PSScriptRoot 'Autologon.exe'),
        (Join-Path $PSScriptRoot 'Autologon64.exe'))) {
        if (Test-Path $p) { return $p }
    }
    return $null
}

$exe = Find-Autologon -Hint $AutologonPath
if (-not $exe) {
    Write-Warning "Chua co Autologon.exe."
    Write-Host    "Tai tu Microsoft Sysinternals: $dlUrl"
    Write-Host    "Roi chay lai, hoac: .\setup-autologon.ps1 -AutologonPath <duong-dan>"
    return
}

Write-Host "Mo Autologon: $exe"
Write-Host "Trong cua so hien ra: nhap Username, Domain (thuong la ten may), Password roi bam Enable."
Write-Host "LUU Y: dung tai khoan LOCAL. De TAT auto-login sau nay, mo lai Autologon va bam Disable."
Start-Process -FilePath $exe