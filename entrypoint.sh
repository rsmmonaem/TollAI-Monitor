#!/bin/bash

echo "=== Starting TollAI Monitor ==="

# Determine python executable (prefer venv if present)
PYTHON_BIN="python"
if [ -d "venv" ]; then
    PYTHON_BIN="./venv/bin/python"
elif [ -d "python/venv" ]; then
    PYTHON_BIN="./python/venv/bin/python"
fi

export PYTHONPATH="${PYTHONPATH:-}:$(pwd)/python:$(pwd)"

echo "Cleaning up old AI Engine processes..."
if command -v pkill >/dev/null 2>&1; then
    pkill -f "python/ai_engine.py" 2>/dev/null || true
fi

# 1. Start the Flask server in the background
# Default PORT to 7860 (Hugging Face) or 5002 locally
export PORT=${PORT:-7860}
export ACTIVE_CAMERAS=${ACTIVE_CAMERAS:-"1,2"}
echo "Starting Flask web server on port $PORT..."
$PYTHON_BIN python/server.py &
SERVER_PID=$!
trap 'kill $SERVER_PID $AI_PID 2>/dev/null' EXIT INT TERM

# 2. Wait for the Flask server to initialize
sleep 4

# Seed demo data if database is empty so dashboard works immediately on fresh deployment
$PYTHON_BIN -c "
import sys; sys.path.insert(0, 'python')
from db_adapter import get_db_connection
conn = get_db_connection()
if conn:
    cursor = conn.cursor()
    cursor.execute('SELECT COUNT(*) as cnt FROM vehicle_detections')
    row = cursor.fetchone()
    cnt = row.get('cnt', 0) if isinstance(row, dict) else (row[0] if row else 0)
    cursor.close()
    if cnt == 0:
        import demo_data_generator
        demo_data_generator.main()
" 2>/dev/null || true

# 3. Start the AI Engine — Camera source priority:
#    1st: CAM1_SOURCE environment variable (if provided)
#    2nd: Real NVR multi-camera streams (if 103.79.179.116 is reachable)
#    3rd: Local traffic.mp4 demo file (fallback)
#    4th: Webcam (/dev/video0 if present)
NVR_ONLINE=0
if $PYTHON_BIN -c "
import socket, sys
for port in [80, 56981, 554]:
    try:
        with socket.create_connection(('103.79.179.116', port), timeout=1.5):
            sys.exit(0)
    except Exception:
        pass
sys.exit(1)
" 2>/dev/null; then
    NVR_ONLINE=1
fi

if [ -n "$CAM1_SOURCE" ]; then
    SOURCE="$CAM1_SOURCE"
elif [ "$NVR_ONLINE" -eq 1 ]; then
    echo "✅ Real NVR at 103.79.179.116 is ONLINE. Using real multi-camera NVR streams!"
    SOURCE="nvr"
elif [ -f "traffic.mp4" ]; then
    SOURCE="traffic.mp4"
elif [ -f "python/traffic.mp4" ]; then
    SOURCE="python/traffic.mp4"
elif [ -e "/dev/video0" ]; then
    SOURCE="0"
else
    # In cloud environments with no camera and no video yet, download demo clip
    if [ ! -f "traffic.mp4" ] && [ ! -f "python/traffic.mp4" ]; then
        echo "Downloading sample traffic video for cloud container..."
        curl -sL -o traffic.mp4 https://raw.githubusercontent.com/imkevinabraham/traffic_analysis/master/traffic.mp4 2>/dev/null || true
        cp traffic.mp4 python/traffic.mp4 2>/dev/null || true
    fi
    if [ -f "traffic.mp4" ]; then
        SOURCE="traffic.mp4"
    elif [ -f "python/traffic.mp4" ]; then
        SOURCE="python/traffic.mp4"
    else
        SOURCE="0"
    fi
fi

export ACTIVE_CAMERAS=${ACTIVE_CAMERAS:-"1,2"}

echo "Starting YOLO AI engine with source: $SOURCE on Active Cameras: $ACTIVE_CAMERAS"
# Run in headless mode without showing cv2 display window
$PYTHON_BIN python/ai_engine.py --source "$SOURCE" --cameras "$ACTIVE_CAMERAS" --no-window \
    --model "${YOLO_MODEL:-yolov8n.pt}" &
AI_PID=$!

# 4. Wait for the main Flask server process to keep the container active
wait $SERVER_PID
