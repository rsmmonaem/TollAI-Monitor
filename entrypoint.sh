#!/bin/bash

echo "=== Starting TollAI Monitor ==="

# Determine python executable (prefer venv if present)
PYTHON_BIN="python"
if [ -d "python/venv" ]; then
    PYTHON_BIN="./python/venv/bin/python"
fi

echo "Cleaning up old AI Engine processes..."
pkill -f "python/ai_engine.py" || true


# 1. Start the Flask server in the background
# Default PORT to 5002 if not already set
export PORT=${PORT:-5002}
echo "Starting Flask web server on port $PORT..."
$PYTHON_BIN python/server.py &
SERVER_PID=$!
trap 'kill $SERVER_PID $AI_PID 2>/dev/null' EXIT INT TERM

# 2. Wait for the Flask server to initialize
sleep 5

# 3. Start the AI Engine — Camera source priority:
#    1st: CAM1_SOURCE environment variable (if provided)
#    2nd: RTSP stream (if reachable)
#    3rd: Local traffic.mp4 demo file (if present)
#    4th: Webcam (device 0)

RTSP_URL='rtsp://admin:nurbio2026@103.79.179.116:554/Streaming/Channels/101'

if [ -n "$CAM1_SOURCE" ]; then
    SOURCE="$CAM1_SOURCE"
elif nc -z -w 1 103.79.179.116 554 2>/dev/null; then
    SOURCE="$RTSP_URL"
elif [ -f "traffic.mp4" ]; then
    SOURCE="traffic.mp4"
else
    SOURCE="0"
fi

export ACTIVE_CAMERAS=${ACTIVE_CAMERAS:-"1,2"}

echo "Starting YOLO AI engine with source: $SOURCE on Active Cameras: $ACTIVE_CAMERAS"
# Run in headless mode without showing cv2 display window
$PYTHON_BIN python/ai_engine.py --source "$SOURCE" --cameras "$ACTIVE_CAMERAS" --no-window \
    --model "${YOLO_MODEL:-yolov8n.pt}" &
AI_PID=$!

# 4. Wait for the main Flask server process to keep the container active
wait $SERVER_PID
