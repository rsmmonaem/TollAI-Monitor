@echo off
title TollAI Monitor - Windows EXE Builder
echo ========================================================
echo   TollAI Monitor - 1-Click Windows EXE Builder
echo ========================================================
echo.

:: 1. Check for Python
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in PATH!
    echo Please install Python 3.11 or 3.12 from https://www.python.org
    echo NOTE: Make sure to check "Add Python to PATH" during installation.
    pause
    exit /b 1
)

:: 2. Display Python version
echo [*] Detected Python version:
python --version
echo.

:: Check for Python 3.13 / 3.14 warning
python -c "import sys; sys.exit(0 if sys.version_info < (3, 13) else 1)"
if %errorlevel% neq 0 (
    echo [WARNING] You are using Python 3.13+ or Python 3.14!
    echo PyTorch and OpenCV C++ extensions (c10.dll) do NOT officially support Python 3.14 yet.
    echo If the build fails with [WinError 1114], please install Python 3.11 or 3.12 (64-bit).
    echo.
)

:: 3. Create build virtual environment
echo [*] Creating build virtual environment...
if not exist "build_venv" (
    python -m venv build_venv
)

call build_venv\Scripts\activate

:: 4. Install dependencies
echo [*] Installing dependencies and PyInstaller...
pip install --upgrade pip
pip install -r python/requirements.txt
pip install pyinstaller

echo.
echo [*] Building standalone Windows executable (TollAI_Monitor.exe)...
pyinstaller --clean TollAI.spec

if %errorlevel% equ 0 (
    echo.
    echo ========================================================
    echo   BUILD SUCCESSFUL!
    echo ========================================================
    echo Your standalone Windows executable is ready at:
    echo   dist\TollAI_Monitor.exe
    echo.
    echo Anyone can now double-click TollAI_Monitor.exe on any
    echo Windows computer to start the SQLite DB, server, and
    echo automatically open their browser!
    echo ========================================================
) else (
    echo.
    echo ========================================================
    echo   BUILD TROUBLESHOOTING
    echo ========================================================
    echo If you see "[WinError 1114] Error loading c10.dll":
    echo 1. Install Microsoft Visual C++ 2015-2022 Redistributable (x64):
    echo    https://aka.ms/vs/17/release/vc_redist.x64.exe
    echo 2. Use Python 3.11 (64-bit) instead of Python 3.14.
    echo ========================================================
)

pause
