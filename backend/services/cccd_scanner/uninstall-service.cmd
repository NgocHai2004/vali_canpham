@echo off
chcp 65001 >nul
title Go bo CCCD Reader Service
setlocal

set "SVC_NAME=CccdReaderService"

rem --- Yeu cau quyen Administrator ---
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [LOI] Can chay file nay voi quyen Administrator.
    echo Chuot phai vao uninstall-service.cmd -^> Run as administrator.
    pause
    exit /b 1
)

sc query "%SVC_NAME%" >nul 2>&1
if %errorlevel% neq 0 (
    echo Service "%SVC_NAME%" khong ton tai. Khong can go bo.
    pause
    exit /b 0
)

echo === Dang dung va go bo service "%SVC_NAME%" ===
sc stop "%SVC_NAME%" >nul 2>&1
timeout /t 2 >nul
sc delete "%SVC_NAME%"

echo.
echo Da go bo service.
pause
