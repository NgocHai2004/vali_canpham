# uninstall_service.ps1
# ======================
# Go bo Scheduled Task JPD Gateway (May A).
# Chay: powershell -ExecutionPolicy Bypass -File uninstall_service.ps1

$TaskName = "JPDScaleGateway"

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Da go bo task '$TaskName'." -ForegroundColor Green
} else {
    Write-Host "Khong tim thay task '$TaskName' (co the chua cai)."
}
