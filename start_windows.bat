@echo off
setlocal enabledelayedexpansion
title TollAI Monitor - Highway Monitoring System

echo ======================================================================
echo    ROAD MONITORING ^& REVENUE SYSTEM - TOLLAI MONITOR
echo ======================================================================
echo.

:: Check if standalone EXE is present
if exist "dist\TollAI_Monitor.exe" (
    echo [✓] Standalone executable found at: dist\TollAI_Monitor.exe
    echo [*] Launching standalone executable (http://localhost:5001)...
    echo.
    start "" "dist\TollAI_Monitor.exe"
    exit /b 0
)

if exist "TollAI_Monitor.exe" (
    echo [✓] Standalone executable found: TollAI_Monitor.exe
    echo [*] Launching standalone executable (http://localhost:5001)...
    echo.
    start "" "TollAI_Monitor.exe"
    exit /b 0
)

:: If standalone EXE is not present, run with auto-installed dependencies
echo [*] Standalone EXE not found. Checking Python environment...
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Python is not installed or not in your system PATH!
    echo Please install Python 3.10, 3.11, or 3.12 from:
    echo   https://www.python.org/downloads/
    echo NOTE: Be sure to check "Add Python to PATH" during installation.
    echo.
    pause
    exit /b 1
)

:: Virtual environment setup
if not exist "venv" (
    echo [*] Creating isolated virtual environment (venv)...
    python -m venv venv
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to create virtual environment.
        pause
        exit /b 1
    )
)

echo [*] Activating virtual environment...
call venv\Scripts\activate.bat

echo [*] Verifying and auto-installing required dependencies...
python -m pip install --upgrade pip
pip install -r python\requirements.txt

echo.
echo ======================================================================
echo [✓] Dependencies installed! Starting TollAI Monitor on http://localhost:5001
echo ======================================================================
echo.

python app_launcher.py

pause
