@echo off
chcp 65001 >nul
title Cai dat CCCD Reader Service
setlocal

set "SVC_NAME=CccdReaderService"
set "SVC_DISPLAY=CCCD Reader Service (HN-212)"
rem Tu do duong dan theo vi tri script (%~dp0), khong hardcode o dia -> portable.
set "BIN_PATH=%~dp0publish\CccdService.exe"

rem --- Yeu cau quyen Administrator ---
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [LOI] Can chay file nay voi quyen Administrator.
    echo Chuot phai vao install-service.cmd -^> Run as administrator.
    pause
    exit /b 1
)

if not exist "%BIN_PATH%" (
    echo [LOI] Khong tim thay "%BIN_PATH%".
    echo Hay publish truoc: chay build-publish.cmd
    pause
    exit /b 1
)

echo === Dang cai dat service "%SVC_NAME%" ===

rem Neu da ton tai thi dung + xoa truoc khi cai lai
sc query "%SVC_NAME%" >nul 2>&1
if %errorlevel% equ 0 (
    echo Service da ton tai -^> dung va xoa de cai lai...
    sc stop "%SVC_NAME%" >nul 2>&1
    timeout /t 2 >nul
    sc delete "%SVC_NAME%" >nul 2>&1
    timeout /t 2 >nul
)

rem Tao service, tu khoi dong cung Windows (start= auto)
sc create "%SVC_NAME%" binPath= "\"%BIN_PATH%\"" start= auto DisplayName= "%SVC_DISPLAY%"
if %errorlevel% neq 0 (
    echo [LOI] Tao service that bai.
    pause
    exit /b 1
)

sc description "%SVC_NAME%" "Doc CCCD tu dau doc Hanel HN-212 va gui du lieu toi API cau hinh trong appsettings.json."

rem Tu khoi dong lai neu service loi (sau 5s), reset bo dem loi sau 1 ngay
sc failure "%SVC_NAME%" reset= 86400 actions= restart/5000/restart/5000/restart/5000

echo.
echo === Cai dat xong. Dang khoi dong service... ===
sc start "%SVC_NAME%"

echo.
echo Trang thai:
sc query "%SVC_NAME%"
echo.
echo Xong. Service se tu khoi dong moi khi bat Windows.
pause
