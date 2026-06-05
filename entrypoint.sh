#!/bin/bash

echo "=== Starting TollAI Monitor Cloud Deployment ==="

# 1. Start the Flask server in the background
# Hugging Face sets the PORT environment variable to 7860
export PORT=7860
echo "Starting Flask web server on port $PORT..."
python python/server.py &
SERVER_PID=$!

# 2. Wait for the Flask server to initialize
sleep 5

# 3. Start the AI Engine in headless mode utilizing the traffic video loop
if [ -f "python/traffic.mp4" ]; then
    echo "Starting YOLO AI engine simulation with python/traffic.mp4..."
    # Run in headless mode without showing cv2 display window
    python python/ai_engine.py --source python/traffic.mp4 --no-window &
    AI_PID=$!
else
    echo "⚠️ Warning: python/traffic.mp4 not found. AI Engine stream will not start automatically."
fi

# 4. Wait for the main Flask server process to keep the container active
wait $SERVER_PID
