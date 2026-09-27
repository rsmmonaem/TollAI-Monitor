#!/bin/bash
# 1-Click Launcher for macOS
# Double-click this file to start the TollAI Monitor on your Mac

cd "$(dirname "$0")"

echo "========================================================"
echo "   🛣️  TOLLAI MONITOR - 1-CLICK MAC LAUNCHER"
echo "========================================================"

# Check Python
if command -v python3 >/dev/null 2>&1; then
    PYTHON_CMD="python3"
elif command -v python >/dev/null 2>&1; then
    PYTHON_CMD="python"
else
    echo "[ERROR] Python 3 is not installed on this Mac!"
    read -p "Press Enter to exit..."
    exit 1
fi

# Run the unified launcher
$PYTHON_CMD app_launcher.py
