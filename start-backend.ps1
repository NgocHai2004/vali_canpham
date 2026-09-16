$ErrorActionPreference = 'Stop'
$root = "c:\Users\vali-01\Documents\Vali_hientruong\app_cccd"
$envFile = "c:\Users\vali-01\Documents\Vali_hientruong\.env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith('#') -and $line.Contains('=')) {
            $parts = $line.Split('=', 2)
            $k = $parts[0].Trim()
            $v = $parts[1].Trim().Trim('"').Trim("'")
            [System.Environment]::SetEnvironmentVariable($k, $v, "Process")
        }
    }
}
$py = "c:\Users\vali-01\Documents\Vali_hientruong\app_cccd\.venv\Scripts\python.exe"
$cmd = "`"$py`" -m uvicorn --app-dir backend main:app --host 127.0.0.1 --port 8001"
$result = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
    CommandLine = $cmd
    CurrentDirectory = $root
}
Write-Host "Started backend with PID: $($result.ProcessId), ReturnValue: $($result.ReturnValue)"
for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 500
    try {
        $r = Invoke-RestMethod -Uri "http://127.0.0.1:8001/api/health" -TimeoutSec 2 -ErrorAction Stop
        if ($r.ok) {
            Write-Host "Backend ready. Health: $($r.ok) (db: $($r.db))"
            break
        }
    } catch {}
}
