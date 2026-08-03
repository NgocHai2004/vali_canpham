@echo off
chcp 65001 >nul
title CCCD Service - Hanel HN-212 (chay thu console)
rem Chay thu ban publish self-contained (khong can dotnet cai san) o che do console
rem de kiem tra truoc khi cai thanh Windows Service.
cd /d "%~dp0publish"
del /q run_console.txt 2>nul
CccdService.exe 2>&1 | powershell -NoProfile -Command "$input | Tee-Object -FilePath run_console.txt"
echo.
echo === Service da ket thuc. Nhan phim bat ky de dong cua so ===
pause >nul
