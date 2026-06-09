#!/bin/bash

echo "=== Starting TollAI Monitor ==="

# Determine python executable (prefer venv if present)
PYTHON_BIN="python"
if [ -d "venv" ]; then
    PYTHON_BIN="./venv/bin/python"
fi

# 1. Start the Flask server in the background
# Default PORT to 5002 if not already set
export PORT=${PORT:-5002}
echo "Starting Flask web server on port $PORT..."
$PYTHON_BIN python/server.py &
SERVER_PID=$!

# 2. Wait for the Flask server to initialize
sleep 5

# 3. Start the AI Engine in headless mode utilizing the webcam (source 0)
echo "Starting YOLO AI engine with webcam (source 0)..."
# Run in headless mode without showing cv2 display window
$PYTHON_BIN python/ai_engine.py --source 0 --no-window &
AI_PID=$!

# 4. Wait for the main Flask server process to keep the container active
wait $SERVER_PID
