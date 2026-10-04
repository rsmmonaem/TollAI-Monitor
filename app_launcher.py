#!/usr/bin/env python3
"""
TollAI Monitor - 1-Click Windows Application Launcher
Bundles the Flask web dashboard, SQLite database, and AI engine into a standalone executable.
Automatically starts the local server and opens your default browser.
"""

import os
import sys
import time
import socket
import logging
import threading
import webbrowser
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s'
)
logger = logging.getLogger("TollAI-Launcher")

# ─────────────────────────────────────────────────────────────
# PATH RESOLUTION (PyInstaller Frozen vs Development Mode)
# ─────────────────────────────────────────────────────────────
if getattr(sys, 'frozen', False):
    # Running inside PyInstaller packaged .exe
    BUNDLE_DIR = sys._MEIPASS  # Read-only bundled assets
    APP_DIR = os.path.dirname(sys.executable)  # Persistent folder next to the .exe
else:
    # Running directly from source
    BUNDLE_DIR = os.path.abspath(os.path.dirname(__file__))
    APP_DIR = BUNDLE_DIR

# Ensure python directory is in sys.path
python_code_dir = os.path.join(BUNDLE_DIR, 'python')
if python_code_dir not in sys.path:
    sys.path.insert(0, python_code_dir)
if BUNDLE_DIR not in sys.path:
    sys.path.insert(0, BUNDLE_DIR)

# Check if running directly inside a temporary archive directory (WinRAR, 7-Zip, Temp)
is_temp_archive = any(t in APP_DIR.lower() for t in ['appdata\\local\\temp', 'temp\\rar$', 'temp\\7z', 'temp\\wz', 'rartemp'])
if is_temp_archive:
    # Use persistent AppData location so database and captured images are never deleted by WinRAR
    DATA_DIR = os.path.join(os.environ.get('LOCALAPPDATA', os.path.expanduser('~')), 'TollAI_Monitor')
    os.makedirs(DATA_DIR, exist_ok=True)
else:
    DATA_DIR = APP_DIR

# Force SQLite database to persist
os.environ['SQLITE_DB_PATH'] = os.path.join(DATA_DIR, 'toll_monitoring.db')
os.environ['PERSISTENT_DATA_DIR'] = DATA_DIR

# Set port (default 7860 to match standard TollAI deployment or find free port)
PORT = int(os.environ.get('PORT', 7860))

def is_port_in_use(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('127.0.0.1', port)) == 0

def find_available_port(start_port=7860):
    port = start_port
    while is_port_in_use(port) and port < start_port + 20:
        port += 1
    return port

PORT = find_available_port(PORT)
os.environ['PORT'] = str(PORT)

# ─────────────────────────────────────────────────────────────
# SEED INITIAL DATA IF DB IS EMPTY
# ─────────────────────────────────────────────────────────────
def ensure_database_ready():
    try:
        from db_adapter import get_db_connection
        conn = get_db_connection()
        if conn:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM vehicle_detections")
            row = cursor.fetchone()
            count = row[0] if isinstance(row, tuple) else (row.get('COUNT(*)', 0) if isinstance(row, dict) else 0)
            cursor.close()
            conn.close()

            if count == 0:
                logger.info("Initializing SQLite database with starting demo records...")
                try:
                    import demo_data_generator
                    demo_data_generator.main()
                    logger.info("Database initialized successfully.")
                except Exception as ex:
                    logger.warning(f"Could not run demo_data_generator: {ex}")
    except Exception as e:
        logger.warning(f"Database check notice: {e}")

# ─────────────────────────────────────────────────────────────
# BACKGROUND SERVERS
# ─────────────────────────────────────────────────────────────
def run_flask_server():
    try:
        from server import app, ROOT_DIR
        logger.info(f"Serving web dashboard from: {ROOT_DIR}")
        logger.info(f"Flask API server running on http://127.0.0.1:{PORT}")
        app.run(host='0.0.0.0', port=PORT, debug=False, use_reloader=False)
    except Exception as e:
        logger.error(f"Flask server error: {e}", exc_info=True)

def is_nvr_online(host='103.79.179.116', timeout=1.5):
    for port in [80, 56981, 554]:
        try:
            with socket.create_connection((host, port), timeout=timeout):
                return True
        except Exception:
            pass
    return False

def run_ai_engine():
    """Runs the AI Engine in background with smart camera detection."""
    try:
        logger.info("Initializing AI Video Engine...")
        
        # 1. Determine camera/video source
        source = os.environ.get('CAM1_SOURCE')
        if not source:
            if is_nvr_online():
                logger.info("✅ Real NVR at 103.79.179.116 is ONLINE. Using real multi-camera NVR streams!")
                source = 'nvr'
            else:
                video_sample = os.path.join(APP_DIR, 'traffic.mp4')
                if not os.path.exists(video_sample):
                    video_sample = os.path.join(BUNDLE_DIR, 'traffic.mp4')
                
                if os.path.exists(video_sample):
                    logger.info(f"📹 NVR offline or unreachable. Falling back to local video: {video_sample}")
                    source = video_sample
                else:
                    logger.info("📹 NVR offline and no traffic.mp4. Falling back to default webcam (0)...")
                    source = "0"

        logger.info(f"AI Engine source set to: {source}")

        import ai_engine
        
        # 2. Locate model: prefer best.pt, then yolov8n.pt
        model_sample = os.path.join(APP_DIR, 'best.pt')
        if not os.path.exists(model_sample):
            model_sample = os.path.join(BUNDLE_DIR, 'best.pt')
        if not os.path.exists(model_sample):
            model_sample = os.path.join(APP_DIR, 'yolov8n.pt')
        if not os.path.exists(model_sample):
            model_sample = os.path.join(BUNDLE_DIR, 'yolov8n.pt')
        if not os.path.exists(model_sample):
            model_sample = 'best.pt'

        logger.info(f"AI Engine model: {model_sample}")

        engine = ai_engine.TollAIEngine(
            source=source,
            model_path=model_sample,
            show_window=False,
            camera_ids=[1, 2],
            port=PORT
        )
        engine.run()
    except Exception as e:
        logger.error(f"AI Engine error: {e}", exc_info=True)

def open_browser():
    """Wait for server to be responsive, then open default web browser."""
    url = f"http://localhost:{PORT}"
    time.sleep(2.0)  # give Flask a moment to bind
    logger.info(f"Opening browser at: {url}")
    webbrowser.open(url)

# ─────────────────────────────────────────────────────────────
# MAIN ENTRYPOINT
# ─────────────────────────────────────────────────────────────
if __name__ == '__main__':
    import multiprocessing
    multiprocessing.freeze_support()

    print("=" * 65)
    print("   🛣️  TOLLAI MONITOR - HIGHWAY AUTHORITY MONITORING SYSTEM")
    print("=" * 65)
    print(f"[*] Starting system on local computer...")
    print(f"[*] Database: SQLite ({os.environ['SQLITE_DB_PATH']})")
    if is_temp_archive:
        print(f"[*] Storage Note: Running inside archive. Persistent database saved to LocalAppData.")
    print(f"[*] Web Interface: http://localhost:{PORT}")
    print("=" * 65)

    # 1. Initialize SQLite database & demo data
    ensure_database_ready()

    # 2. Start Flask Server in background thread
    server_thread = threading.Thread(target=run_flask_server, daemon=True)
    server_thread.start()

    # 3. Start AI Detection Engine in background thread
    ai_thread = threading.Thread(target=run_ai_engine, daemon=True)
    ai_thread.start()

    # 4. Open browser automatically
    browser_thread = threading.Thread(target=open_browser, daemon=True)
    browser_thread.start()

    print("\n[✓] System is running! Your web browser will open automatically.")
    print("[*] Press Ctrl+C or close this window to stop the application.\n")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n[*] Shutting down TollAI Monitor...")
        sys.exit(0)
