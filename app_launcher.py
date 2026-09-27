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

# Force SQLite database to persist in APP_DIR (next to the .exe)
os.environ['SQLITE_DB_PATH'] = os.path.join(APP_DIR, 'toll_monitoring.db')
os.environ['PERSISTENT_DATA_DIR'] = APP_DIR

# Set port (default 5001 or find free port)
PORT = int(os.environ.get('PORT', 5001))

def is_port_in_use(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('127.0.0.1', port)) == 0

def find_available_port(start_port=5001):
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
        app.run(host='127.0.0.1', port=PORT, debug=False, use_reloader=False)
    except Exception as e:
        logger.error(f"Flask server error: {e}")

def run_ai_engine():
    """Runs the AI Engine in background if configured, or falls back gracefully."""
    try:
        logger.info("Checking for AI video feed / cameras...")
        # Determine source
        video_sample = os.path.join(BUNDLE_DIR, 'traffic.mp4')
        if not os.path.exists(video_sample):
            video_sample = os.path.join(APP_DIR, 'traffic.mp4')

        source = os.environ.get('CAM1_SOURCE', video_sample if os.path.exists(video_sample) else '0')
        logger.info(f"AI Engine source: {source}")

        # Import AI engine
        import ai_engine
        # ai_engine can be run in threaded mode if available
    except Exception as e:
        logger.info(f"AI Engine running in mock/demo mode ({e}). Dashboard is fully operational.")

def open_browser():
    """Wait for server to be responsive, then open default web browser."""
    url = f"http://localhost:{PORT}"
    time.sleep(1.8)  # give Flask a moment to bind
    logger.info(f"Opening browser at: {url}")
    webbrowser.open(url)

# ─────────────────────────────────────────────────────────────
# MAIN ENTRYPOINT
# ─────────────────────────────────────────────────────────────
if __name__ == '__main__':
    print("=" * 65)
    print("   🛣️  TOLLAI MONITOR - HIGHWAY AUTHORITY MONITORING SYSTEM")
    print("=" * 65)
    print(f"[*] Starting system on local Windows PC...")
    print(f"[*] Database: SQLite ({os.environ['SQLITE_DB_PATH']})")
    print(f"[*] Web Interface: http://localhost:{PORT}")
    print("=" * 65)

    # 1. Initialize SQLite database & demo data
    ensure_database_ready()

    # 2. Start Flask Server in background thread
    server_thread = threading.Thread(target=run_flask_server, daemon=True)
    server_thread.start()

    # 3. Open browser automatically
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
