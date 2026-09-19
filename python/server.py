#!/usr/bin/env python3
"""
AI Toll & Lease Collection Monitoring System
Flask Web Server — REST APIs & Static File Hosting

Serves the frontend SPA dashboard and connects it to the MySQL database.
If the database connection fails, falls back gracefully to in-memory mock data.
"""

import os
import sys
import time
import threading
import random
import re
import logging
from datetime import datetime, timedelta
from decimal import Decimal
from io import BytesIO
from PIL import Image
import requests
from requests.auth import HTTPDigestAuth
from requests.adapters import HTTPAdapter
from flask import Flask, jsonify, request, send_from_directory, Response
from flask_cors import CORS

# Configure path to allow importing from the python directory
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from ai_engine import DB_CONFIG, TOLL_RATES

# Initialize Flask App
# Static files reside in the root directory (parent of python/)
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
app = Flask(__name__, static_folder=ROOT_DIR, static_url_path='')
CORS(app) # Enable CORS for development cross-origin requests

# Logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger('TollServer')
logging.getLogger('werkzeug').setLevel(logging.WARNING)
logging.getLogger('urllib3').setLevel(logging.ERROR)

# Database Status
db_status = 'fallback'

# Import mysql.connector
try:
    import mysql.connector
    MYSQL_AVAILABLE = True
except ImportError:
    MYSQL_AVAILABLE = False
    logger.warning("mysql-connector-python not installed. Running in mock fallback mode.")

# Global state for in-memory mock data (fallback mode)
mock_records = []
mock_rates = {**TOLL_RATES}
mock_rate_history = []
mock_operator_counts = {
    'Bike': 500, 'CNG': 175, 'Auto': 118, 'Pickup': 80, 'Bus': 55, 'Truck': 38
}

# ─────────────────────────────────────────────────────────────
# MOCK DATA GENERATOR (Python-side Fallback)
# ─────────────────────────────────────────────────────────────

PLATE_PREFIXES = ['Dhaka Metro Ga', 'Dhaka Metro Gha', 'Dhaka Metro Nga', 'Chatt Metro Ka', 'Sylhet Metro Ga', 'Rajshahi Metro Kha']
VEHICLE_DISTRIBUTION = {'Bike': 650, 'CNG': 180, 'Auto': 120, 'Pickup': 80, 'Bus': 60, 'Truck': 40}

def generate_mock_plate():
    prefix = random.choice(PLATE_PREFIXES)
    num1 = random.randint(11, 99)
    num2 = random.randint(1000, 9999)
    return f"{prefix}-{num1}-{num2}"

def init_mock_data():
    # Disabled mock data initialization - all data will load from database
    global mock_records
    mock_records = []
            
    # Sort descending by entry time
    mock_records.sort(key=lambda x: x['entry_time'], reverse=True)
    # Re-assign IDs sequentially
    for idx, r in enumerate(reversed(mock_records)):
        r['id'] = idx + 1
    logger.info(f"Initialized {len(mock_records)} mock records in memory (Fallback Mode)")

# ─────────────────────────────────────────────────────────────
# DATABASE UTILITIES
# ─────────────────────────────────────────────────────────────

from db_adapter import get_db_connection as get_raw_db_connection

def get_db_connection():
    global db_status
    try:
        conn = get_raw_db_connection()
        if conn:
            db_status = 'connected'
            return conn
    except Exception as e:
        logger.error(f"Database connection failed: {e}")
        
    db_status = 'fallback'
    return None

def check_db_health():
    conn = get_db_connection()
    if conn:
        try:
            conn.close()
            return True
        except Exception:
            pass
    return False

# Initialize database check and seed mock data
if not check_db_health():
    init_mock_data()

# ─────────────────────────────────────────────────────────────
# STATIC ROUTING
# ─────────────────────────────────────────────────────────────

@app.route('/')
def serve_index():
    return app.send_static_file('index.html')

@app.route('/assets/<path:path>')
def serve_assets(path):
    return send_from_directory(os.path.join(ROOT_DIR, 'assets'), path)

@app.route('/captured_vehicles/<path:filename>')
def serve_captured_vehicles(filename):
    return send_from_directory(os.path.join(ROOT_DIR, 'captured_vehicles'), filename)

# ─────────────────────────────────────────────────────────────
# LIVE CAMERA VIDEO STREAMING & 14-CHANNEL NVR PROXY
# ─────────────────────────────────────────────────────────────

NVR_HOST = os.environ.get('NVR_HOST', '103.79.179.116')
NVR_USER = os.environ.get('NVR_USER', 'admin')
NVR_PASS = os.environ.get('NVR_PASS', 'nurbio2026')

NVR_CHANNELS = {
    1: {'channel': '101', 'name': 'Camera 1 (Ch 101 - Toll Lane A)', 'lane': 'Toll Lane A (Inbound)'},
    2: {'channel': '201', 'name': 'Camera 2 (Ch 201 - Toll Lane B)', 'lane': 'Toll Lane B (Outbound)'},
    3: {'channel': '301', 'name': 'Camera 3 (Ch 301 - Lane C Entry)', 'lane': 'Toll Lane C (Inbound)'},
    4: {'channel': '401', 'name': 'Camera 4 (Ch 401 - Lane D Exit)', 'lane': 'Toll Lane D (Outbound)'},
    5: {'channel': '501', 'name': 'Camera 5 (Ch 501 - Plaza Approach)', 'lane': 'Plaza Approach North'},
    6: {'channel': '601', 'name': 'Camera 6 (Ch 601 - Plaza Departure)', 'lane': 'Plaza Departure South'},
    7: {'channel': '701', 'name': 'Camera 7 (Ch 701 - Heavy Vehicle Lane)', 'lane': 'Heavy Vehicle Lane'},
    8: {'channel': '801', 'name': 'Camera 8 (Ch 801 - FastPass / ETC 1)', 'lane': 'ETC FastPass Lane 1'},
    9: {'channel': '901', 'name': 'Camera 9 (Ch 901 - FastPass / ETC 2)', 'lane': 'ETC FastPass Lane 2'},
    10: {'channel': '1001', 'name': 'Camera 10 (Ch 1001 - Weighbridge A)', 'lane': 'Weighbridge Lane 1'},
    11: {'channel': '1101', 'name': 'Camera 11 (Ch 1101 - Booth 1 Cabin)', 'lane': 'Toll Booth 1'},
    12: {'channel': '1201', 'name': 'Camera 12 (Ch 1201 - Booth 2 Cabin)', 'lane': 'Toll Booth 2'},
    13: {'channel': '1301', 'name': 'Camera 13 (Ch 1301 - Plaza Overview)', 'lane': 'Main Plaza Yard'},
    14: {'channel': '1501', 'name': 'Camera 14 (Ch 1501 - Perimeter Security)', 'lane': 'Perimeter Guard Post'},
}

# Active AI Cameras Multi-Select State
def _parse_active_cams(val):
    if not val:
        return [1, 2]
    if str(val).strip().lower() == 'all':
        return list(range(1, len(NVR_CHANNELS) + 1))
    cams = []
    for p in str(val).split(','):
        p = p.strip()
        if p.isdigit():
            cid = int(p)
            if 1 <= cid <= len(NVR_CHANNELS):
                cams.append(cid)
    return sorted(list(set(cams))) if cams else [1, 2]

active_ai_cameras = _parse_active_cams(os.environ.get('ACTIVE_CAMERAS', '1,2'))

nvr_session = requests.Session()
nvr_session.auth = HTTPDigestAuth(NVR_USER, NVR_PASS)
nvr_session.mount('http://', HTTPAdapter(pool_connections=25, pool_maxsize=25, max_retries=0))

# In-memory store for the latest JPEG frame of each camera (from AI engine)
latest_frames = {}
latest_frame_times = {}
nvr_frame_cache = {}
nvr_frame_cache_times = {}
nvr_fail_times = {}

_placeholder_cache = None

def get_placeholder_bytes():
    global _placeholder_cache
    if _placeholder_cache:
        return _placeholder_cache
    placeholder_path = os.path.join(ROOT_DIR, 'assets', 'img', 'vehicles', 'toll_plaza.png')
    if os.path.exists(placeholder_path):
        try:
            im = Image.open(placeholder_path)
            if im.mode in ('RGBA', 'LA') or (im.mode == 'P' and 'transparency' in im.info):
                im = im.convert('RGB')
            out = BytesIO()
            im.save(out, format='JPEG', quality=80)
            _placeholder_cache = out.getvalue()
            return _placeholder_cache
        except Exception as e:
            logger.error(f"Error converting placeholder to JPEG: {e}")
            
def get_camera_placeholder(cam_id):
    """Generate a clean visual 'Camera Offline' placeholder with camera metadata."""
    try:
        from PIL import ImageDraw
        im = Image.new('RGB', (640, 360), color='#090d16')
        draw = ImageDraw.Draw(im)
        ch_info = NVR_CHANNELS.get(cam_id, {})
        lane = ch_info.get('lane', 'Toll Lane')
        ch = ch_info.get('channel', '---')
        
        # Grid frame
        draw.rectangle([(15, 15), (625, 345)], outline='#1e293b', width=2)
        draw.text((320, 140), f"CAM {cam_id} · NO SIGNAL", fill='#ef4444', anchor='mm')
        draw.text((320, 175), f"NVR Channel {ch} (Hardware Offline)", fill='#94a3b8', anchor='mm')
        draw.text((320, 205), lane, fill='#64748b', anchor='mm')
        out = BytesIO()
        im.save(out, format='JPEG', quality=75)
        return out.getvalue()
    except Exception:
        return get_placeholder_bytes()

def _background_nvr_poller():
    """Continuously poll NVR cameras in background and update cache with zero streaming lag."""
    logger.info("📡 Starting background NVR multi-camera poller...")
    while True:
        for cam_id, ch_info in list(NVR_CHANNELS.items()):
            now = time.time()
            # If camera is currently active with AI engine frames, skip polling NVR
            if cam_id in latest_frames and (now - latest_frame_times.get(cam_id, 0) < 5.0):
                continue
            
            ch = ch_info['channel']
            url = f"http://{NVR_HOST}/ISAPI/Streaming/channels/{ch}/picture"
            try:
                resp = nvr_session.get(url, timeout=2.5)
                if resp.status_code == 200 and resp.content and len(resp.content) > 1000:
                    nvr_frame_cache[cam_id] = resp.content
                    nvr_frame_cache_times[cam_id] = time.time()
                elif resp.status_code == 503:
                    if cam_id not in nvr_frame_cache:
                        nvr_frame_cache[cam_id] = get_camera_placeholder(cam_id)
            except Exception:
                if cam_id not in nvr_frame_cache:
                    nvr_frame_cache[cam_id] = get_camera_placeholder(cam_id)
            time.sleep(0.08)
        time.sleep(1.2)

# Start background poller thread
nvr_poller_thread = threading.Thread(target=_background_nvr_poller, daemon=True)
nvr_poller_thread.start()

def fetch_nvr_snapshot(camera_id, max_age=15.0):
    """Fetch live JPEG snapshot from AI Engine or cached NVR frame."""
    now = time.time()
    # 1. Prefer AI engine processed frame if available and recent
    if camera_id in latest_frames and (now - latest_frame_times.get(camera_id, 0) < 6.0):
        return latest_frames[camera_id]

    # 2. Return cached NVR frame from background poller
    if camera_id in nvr_frame_cache:
        return nvr_frame_cache[camera_id]

    # 3. Fallback placeholder
    return get_camera_placeholder(camera_id)

@app.route('/api/camera/<int:camera_id>/frame', methods=['POST'])
def upload_camera_frame(camera_id):
    latest_frames[camera_id] = request.data
    latest_frame_times[camera_id] = time.time()
    return jsonify({'success': True})

@app.route('/api/cameras/broadcast_frame', methods=['POST'])
def broadcast_camera_frames():
    """Ultra-fast zero-overhead endpoint for AI Engine to update all camera frames in one request."""
    data = request.data
    cam_ids_header = request.headers.get('X-Camera-IDs', '')
    now = time.time()
    if cam_ids_header:
        try:
            cam_ids = [int(c.strip()) for c in cam_ids_header.split(',') if c.strip().isdigit()]
        except Exception:
            cam_ids = list(NVR_CHANNELS.keys())
    else:
        cam_ids = list(NVR_CHANNELS.keys())
    
    for cid in cam_ids:
        latest_frames[cid] = data
        latest_frame_times[cid] = now
        
    return jsonify({'success': True, 'count': len(cam_ids)})

# In-memory store for raw client webcam uploads (for remote AI processing)
latest_raw_frames = {}
latest_raw_frame_times = {}

@app.route('/api/camera/<int:camera_id>/raw_upload', methods=['POST'])
def upload_raw_frame(camera_id):
    latest_raw_frames[camera_id] = request.data
    latest_raw_frame_times[camera_id] = time.time()
    return jsonify({'success': True})

@app.route('/api/camera/<int:camera_id>/raw_download', methods=['GET'])
def download_raw_frame(camera_id):
    t = latest_raw_frame_times.get(camera_id, 0)
    # Consider frame valid if uploaded within last 3.5 seconds
    if time.time() - t < 3.5 and camera_id in latest_raw_frames:
        return latest_raw_frames[camera_id], 200, {'Content-Type': 'image/jpeg'}
    return jsonify({'error': 'No recent raw frame'}), 404

@app.route('/api/camera/raw_active_frame', methods=['GET'])
def get_raw_active_frame():
    """Return the freshest client webcam frame across all channels in one shot, or 204 if none."""
    now = time.time()
    for cid, t in list(latest_raw_frame_times.items()):
        if now - t < 3.0 and cid in latest_raw_frames:
            return Response(
                latest_raw_frames[cid],
                mimetype='image/jpeg',
                headers={'X-Camera-ID': str(cid)}
            )
    return ('', 204)

def generate_video_stream(camera_id):
    placeholder_bytes = get_placeholder_bytes()
    last_sent_ts = 0.0

    while True:
        now = time.time()
        ai_time = latest_frame_times.get(camera_id, 0.0)
        nvr_time = nvr_frame_cache_times.get(camera_id, 0.0)
        curr_ts = max(ai_time, nvr_time)

        # Only push frame if it's genuinely new or as a heartbeat every 1.5s
        if curr_ts > last_sent_ts or (now - last_sent_ts) > 1.5:
            frame_bytes = fetch_nvr_snapshot(camera_id, max_age=0.2)
            if not frame_bytes:
                frame_bytes = placeholder_bytes

            if frame_bytes:
                last_sent_ts = curr_ts if curr_ts > 0 else now
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
        
        time.sleep(0.025)  # 40Hz check for minimal latency (<25ms)

@app.route('/api/camera/<int:camera_id>/stream')
def get_camera_stream(camera_id):
    return Response(
        generate_video_stream(camera_id),
        mimetype='multipart/x-mixed-replace; boundary=frame'
    )

@app.route('/api/camera/<int:camera_id>/snapshot')
def get_camera_snapshot(camera_id):
    snap = fetch_nvr_snapshot(camera_id, max_age=0.4)
    if snap:
        return Response(snap, mimetype='image/jpeg', headers={'Cache-Control': 'no-cache, no-store, must-revalidate'})
    placeholder_bytes = get_placeholder_bytes()
    return Response(placeholder_bytes, mimetype='image/jpeg', headers={'Cache-Control': 'no-cache'})

@app.route('/api/camera/channels')
def get_camera_channels():
    cams = [
        {
            'id': cam_id,
            'name': info['name'],
            'lane': info['lane'],
            'channel': info['channel'],
            'stream_url': f'/api/camera/{cam_id}/stream',
            'snapshot_url': f'/api/camera/{cam_id}/snapshot',
            'ai_enabled': (cam_id in active_ai_cameras)
        }
        for cam_id, info in NVR_CHANNELS.items()
    ]
    return jsonify(cams)

# ─────────────────────────────────────────────────────────────
# AI ENGINE CAMERA MULTI-SELECT ENDPOINT
# ─────────────────────────────────────────────────────────────

@app.route('/api/ai/cameras', methods=['GET', 'POST'])
def manage_ai_cameras():
    global active_ai_cameras
    if request.method == 'POST':
        data = request.get_json() or {}
        if 'toggle' in data:
            try:
                cid = int(data['toggle'])
                if cid in active_ai_cameras:
                    active_ai_cameras.remove(cid)
                elif 1 <= cid <= len(NVR_CHANNELS):
                    active_ai_cameras.append(cid)
                    active_ai_cameras.sort()
            except Exception as e:
                return jsonify({'error': str(e)}), 400
        elif 'cameras' in data:
            raw_cams = data.get('cameras', [])
            cleaned = []
            for c in raw_cams:
                if str(c).isdigit():
                    cid = int(c)
                    if 1 <= cid <= len(NVR_CHANNELS):
                        cleaned.append(cid)
            active_ai_cameras = sorted(list(set(cleaned)))
            
        logger.info(f"Updated active AI Cameras: {active_ai_cameras}")
        return jsonify({
            'success': True,
            'active_cameras': active_ai_cameras,
            'count': len(active_ai_cameras)
        })

    return jsonify({
        'active_cameras': active_ai_cameras,
        'count': len(active_ai_cameras),
        'total_available': len(NVR_CHANNELS)
    })

# ─────────────────────────────────────────────────────────────
# REST API ENDPOINTS
# ─────────────────────────────────────────────────────────────

@app.route('/api/config', methods=['GET'])
def get_config():
    # Attempt to reconnect if currently in fallback
    global db_status
    if db_status == 'fallback':
        if check_db_health():
            db_status = 'connected'
            
    cameras_list = [
        {
            'id': cam_id,
            'name': info['name'],
            'lane': info['lane'],
            'channel': info['channel'],
            'stream_url': f'/api/camera/{cam_id}/stream',
            'snapshot_url': f'/api/camera/{cam_id}/snapshot',
            'ai_enabled': (cam_id in active_ai_cameras)
        }
        for cam_id, info in NVR_CHANNELS.items()
    ]
    return jsonify({
        'db_status': db_status,
        'db_host': DB_CONFIG['host'],
        'db_database': DB_CONFIG['database'],
        'camera_ids': list(NVR_CHANNELS.keys()),
        'cameras': cameras_list,
        'active_ai_cameras': active_ai_cameras,
        'total_cameras': len(NVR_CHANNELS)
    })

@app.route('/api/stats', methods=['GET'])
def get_stats():
    conn = get_db_connection()
    
    if conn:
        try:
            cursor = conn.cursor(dictionary=True)
            # Fetch summary stats for today
            query = """
                SELECT 
                    COUNT(*) as total_vehicles,
                    COALESCE(SUM(toll_amount), 0) as total_revenue,
                    SUM(CASE WHEN vehicle_type = 'Bike' THEN 1 ELSE 0 END) as bikes,
                    SUM(CASE WHEN vehicle_type = 'Bus' THEN 1 ELSE 0 END) as buses,
                    SUM(CASE WHEN vehicle_type IN ('Truck', 'Lorry') THEN 1 ELSE 0 END) as trucks
                FROM vehicle_detections
                WHERE DATE(entry_time) = CURDATE()
            """
            cursor.execute(query)
            stats = cursor.fetchone()
            
            # Count manual check alerts
            cursor.execute("SELECT COUNT(*) as fraud_alerts FROM vehicle_detections WHERE DATE(entry_time) = CURDATE() AND status != 'verified'")
            alert_count = cursor.fetchone()
            
            cursor.close()
            conn.close()
            
            return jsonify({
                'total_vehicles': stats['total_vehicles'],
                'total_revenue': float(stats['total_revenue']),
                'bike_count': stats['bikes'] or 0,
                'bus_count': stats['buses'] or 0,
                'truck_count': stats['trucks'] or 0,
                'fraud_alerts': alert_count['fraud_alerts'] or 0
            })
        except Exception as e:
            logger.error(f"Error executing stats query: {e}")
            if conn: conn.close()
            # Fall through to mock logic

    # Fallback Logic
    total_vehicles = len(mock_records)
    total_revenue = sum(r['toll_amount'] for r in mock_records)
    bike_count = sum(1 for r in mock_records if r['vehicle_type'] == 'Bike')
    bus_count = sum(1 for r in mock_records if r['vehicle_type'] == 'Bus')
    truck_count = sum(1 for r in mock_records if r['vehicle_type'] in ('Truck', 'Lorry'))
    fraud_alerts = sum(1 for r in mock_records if r['status'] == 'Manual Check')
    
    return jsonify({
        'total_vehicles': total_vehicles,
        'total_revenue': total_revenue,
        'bike_count': bike_count,
        'bus_count': bus_count,
        'truck_count': truck_count,
        'fraud_alerts': fraud_alerts
    })

@app.route('/api/detections', methods=['GET'])
def get_detections():
    since_id = request.args.get('since_id', default=0, type=int)
    limit = request.args.get('limit', default=50, type=int)
    
    conn = get_db_connection()
    if conn:
        try:
            cursor = conn.cursor(dictionary=True)
            query = """
                SELECT id, vehicle_type, plate_number, image_path, camera_id, entry_time, confidence, toll_amount, status
                FROM vehicle_detections
                WHERE id > %s
                ORDER BY entry_time DESC
                LIMIT %s
            """
            cursor.execute(query, (since_id, limit))
            results = cursor.fetchall()
            
            # Format datetime
            for r in results:
                r['entry_time'] = r['entry_time'].isoformat()
                r['confidence'] = float(r['confidence'])
                r['toll_amount'] = float(r['toll_amount'])
                r['status'] = r['status'].replace('_', ' ').title()
                # Ensure a valid image path fallback if null
                if not r.get('image_path'):
                    r['image_path'] = None
                
            cursor.close()
            conn.close()
            return jsonify(results)
        except Exception as e:
            logger.error(f"Error querying detections: {e}")
            if conn: conn.close()

    # Fallback Logic
    # Filter by since_id
    filtered = [r for r in mock_records if r['id'] > since_id]
    # Take top limit
    sliced = filtered[:limit]
    
    # Format dates
    formatted = []
    for r in sliced:
        formatted.append({
            **r,
            'entry_time': r['entry_time'].isoformat()
        })
    return jsonify(formatted)

@app.route('/api/detections', methods=['DELETE'])
def delete_detections():
    conn = get_db_connection()
    if conn:
        try:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM vehicle_detections")
            conn.commit()
            cursor.close()
            conn.close()
            return jsonify({'success': True, 'message': 'All detection logs deleted.'})
        except Exception as e:
            logger.error(f"Error deleting detections: {e}")
            if conn: conn.close()
            return jsonify({'success': False, 'message': str(e)}), 500
            
    # Fallback
    global mock_records
    mock_records.clear()
    return jsonify({'success': True, 'message': 'All fallback detection logs deleted.'})

@app.route('/api/charts/distribution', methods=['GET'])
def get_chart_distribution():
    conn = get_db_connection()
    if conn:
        try:
            cursor = conn.cursor(dictionary=True)
            query = """
                SELECT vehicle_type, COUNT(*) as count, COALESCE(SUM(toll_amount), 0) as revenue
                FROM vehicle_detections
                WHERE DATE(entry_time) = CURDATE()
                GROUP BY vehicle_type
            """
            cursor.execute(query)
            results = cursor.fetchall()
            
            distribution = {}
            for r in results:
                distribution[r['vehicle_type']] = {
                    'count': r['count'],
                    'revenue': float(r['revenue'])
                }
                
            cursor.close()
            conn.close()
            return jsonify(distribution)
        except Exception as e:
            logger.error(f"Error getting distribution chart data: {e}")
            if conn: conn.close()

    # Fallback Logic
    distribution = {}
    for v_type in VEHICLE_DISTRIBUTION.keys():
        distribution[v_type] = {'count': 0, 'revenue': 0}
        
    for r in mock_records:
        t = r['vehicle_type']
        if t in distribution:
            distribution[t]['count'] += 1
            distribution[t]['revenue'] += r['toll_amount']
            
    return jsonify(distribution)

@app.route('/api/charts/hourly', methods=['GET'])
def get_chart_hourly():
    conn = get_db_connection()
    if conn:
        try:
            cursor = conn.cursor(dictionary=True)
            query = """
                SELECT HOUR(entry_time) as hour, COUNT(*) as count, COALESCE(SUM(toll_amount), 0) as revenue
                FROM vehicle_detections
                WHERE DATE(entry_time) = CURDATE()
                GROUP BY HOUR(entry_time)
                ORDER BY hour
            """
            cursor.execute(query)
            results = cursor.fetchall()
            
            # Map database rows to 24 hours
            hours = [{'hour': i, 'count': 0, 'revenue': 0.0} for i in range(24)]
            for r in results:
                hr = r['hour']
                if 0 <= hr < 24:
                    hours[hr]['count'] = r['count']
                    hours[hr]['revenue'] = float(r['revenue'])
                    
            cursor.close()
            conn.close()
            return jsonify(hours)
        except Exception as e:
            logger.error(f"Error fetching hourly data: {e}")
            if conn: conn.close()

    # Fallback Logic
    hours = [{'hour': i, 'count': 0, 'revenue': 0.0} for i in range(24)]
    for r in mock_records:
        hr = r['entry_time'].hour
        hours[hr]['count'] += 1
        hours[hr]['revenue'] += r['toll_amount']
        
    return jsonify(hours)

@app.route('/api/charts/trend', methods=['GET'])
def get_chart_trend():
    conn = get_db_connection()
    if conn:
        try:
            cursor = conn.cursor(dictionary=True)
            
            # Today hourly
            cursor.execute("""
                SELECT HOUR(entry_time) as hour, COALESCE(SUM(toll_amount), 0) as revenue
                FROM vehicle_detections
                WHERE DATE(entry_time) = CURDATE()
                GROUP BY HOUR(entry_time)
                ORDER BY hour
            """)
            today_res = cursor.fetchall()
            
            # Yesterday hourly
            cursor.execute("""
                SELECT HOUR(entry_time) as hour, COALESCE(SUM(toll_amount), 0) as revenue
                FROM vehicle_detections
                WHERE DATE(entry_time) = SUBDATE(CURDATE(), 1)
                GROUP BY HOUR(entry_time)
                ORDER BY hour
            """)
            yest_res = cursor.fetchall()
            
            today = [0.0] * 24
            yesterday = [0.0] * 24
            
            for r in today_res:
                today[r['hour']] = float(r['revenue'])
            for r in yest_res:
                yesterday[r['hour']] = float(r['revenue'])
                
            cursor.close()
            conn.close()
            return jsonify({
                'today': today,
                'yesterday': yesterday
            })
        except Exception as e:
            logger.error(f"Error fetching trend data: {e}")
            if conn: conn.close()

    # Fallback Logic
    today = [0.0] * 24
    yesterday = [0.0] * 24
    
    for r in mock_records:
        hr = r['entry_time'].hour
        today[hr] += r['toll_amount']
        
    # Scale yesterday values to simulate a variation
    for i in range(24):
        yesterday[i] = round(today[i] * random.uniform(0.72, 0.94), 2)
        
    return jsonify({
        'today': today,
        'yesterday': yesterday
    })

@app.route('/api/fraud', methods=['GET'])
def get_fraud_data():
    conn = get_db_connection()
    
    ai_counts = {k: 0 for k in mock_operator_counts.keys()}
    rates = {k: mock_rates.get(k, 0) for k in mock_operator_counts.keys()}
    
    if conn:
        try:
            cursor = conn.cursor(dictionary=True)
            # Group actual AI counts from DB today
            query = """
                SELECT vehicle_type, COUNT(*) as count
                FROM vehicle_detections
                WHERE DATE(entry_time) = CURDATE()
                GROUP BY vehicle_type
            """
            cursor.execute(query)
            results = cursor.fetchall()
            
            for r in results:
                t = r['vehicle_type']
                if t in ai_counts:
                    ai_counts[t] = r['count']
                    
            # Try to fetch actual operator reports if seeded
            cursor.execute("""
                SELECT vehicle_type, operator_count, ai_count, discrepancy, leakage_amount
                FROM fraud_reports
                WHERE report_date = CURDATE()
            """)
            fraud_rows = cursor.fetchall()
            
            # Get latest rates from database
            cursor.execute("SELECT vehicle_type, rate_amount FROM toll_rates")
            rates_rows = cursor.fetchall()
            for r in rates_rows:
                if r['vehicle_type'] in rates:
                    rates[r['vehicle_type']] = float(r['rate_amount'])
            
            cursor.close()
            conn.close()
            
            # If we have rows in fraud_reports, use them
            if fraud_rows:
                data = {}
                operator_revenue = 0
                ai_revenue = 0
                leakage = 0
                
                for row in fraud_rows:
                    t = row['vehicle_type']
                    data[t] = {
                        'operator': row['operator_count'],
                        'ai': row['ai_count']
                    }
                    operator_revenue += row['operator_count'] * rates.get(t, 0)
                    ai_revenue += row['ai_count'] * rates.get(t, 0)
                
                return jsonify({
                    'data': data,
                    'operatorRevenue': operator_revenue,
                    'aiRevenue': ai_revenue,
                    'leakage': ai_revenue - operator_revenue
                })
        except Exception as e:
            logger.error(f"Error querying fraud: {e}")
            if conn: conn.close()

    # If database is connected but no reports yet, or in fallback mode:
    # Compute simulated operator report counts dynamically
    data = {}
    operator_revenue = 0
    ai_revenue = 0
    
    if db_status == 'connected':
        # Simulated discrepancy on live DB count
        for v_type, ai_c in ai_counts.items():
            if v_type == 'Bike':
                op_c = int(ai_c * 0.76) # high bike leakage
            elif v_type == 'CNG':
                op_c = int(ai_c * 0.95)
            elif v_type == 'Bus':
                op_c = int(ai_c * 0.90)
            else:
                op_c = ai_c # match
            data[v_type] = {'operator': op_c, 'ai': ai_c}
            operator_revenue += op_c * rates.get(v_type, 0)
            ai_revenue += ai_c * rates.get(v_type, 0)
    else:
        # Fallback Mode using mock records
        ai_counts_fallback = {k: 0 for k in mock_operator_counts.keys()}
        for r in mock_records:
            t = r['vehicle_type']
            if t in ai_counts_fallback:
                ai_counts_fallback[t] += 1
                
        for v_type, mock_op in mock_operator_counts.items():
            ai_c = ai_counts_fallback[v_type]
            data[v_type] = {'operator': mock_op, 'ai': ai_c}
            operator_revenue += mock_op * rates.get(v_type, 0)
            ai_revenue += ai_c * rates.get(v_type, 0)
            
    return jsonify({
        'data': data,
        'operatorRevenue': operator_revenue,
        'aiRevenue': ai_revenue,
        'leakage': ai_revenue - operator_revenue
    })

@app.route('/api/rates', methods=['GET'])
def get_rates():
    conn = get_db_connection()
    if conn:
        try:
            cursor = conn.cursor(dictionary=True)
            cursor.execute("SELECT vehicle_type, rate_amount FROM toll_rates")
            rows = cursor.fetchall()
            
            rates = {r['vehicle_type']: float(r['rate_amount']) for r in rows}
            
            cursor.close()
            conn.close()
            
            # Fill missing types
            for k, v in mock_rates.items():
                if k not in rates:
                    rates[k] = v
                    
            return jsonify(rates)
        except Exception as e:
            logger.error(f"Error fetching rates: {e}")
            if conn: conn.close()
            
    return jsonify(mock_rates)

@app.route('/api/rates', methods=['POST'])
def save_rate():
    data = request.json
    if not data or 'vehicle_type' not in data or 'rate_amount' not in data:
        return jsonify({'success': False, 'message': 'Missing data'}), 400
        
    v_type = data['vehicle_type']
    new_rate = float(data['rate_amount'])
    
    conn = get_db_connection()
    if conn:
        try:
            cursor = conn.cursor(dictionary=True)
            # Get old rate
            cursor.execute("SELECT rate_amount FROM toll_rates WHERE vehicle_type = %s", (v_type,))
            old_row = cursor.fetchone()
            old_rate = float(old_row['rate_amount']) if old_row else TOLL_RATES.get(v_type, 0)
            
            # Update rates
            cursor.execute("""
                INSERT INTO toll_rates (vehicle_type, rate_amount, effective_from, updated_by)
                VALUES (%s, %s, CURDATE(), 'Admin')
                ON DUPLICATE KEY UPDATE rate_amount = %s, updated_by = 'Admin'
            """, (v_type, new_rate, new_rate))
            
            # Audit log
            cursor.execute("""
                INSERT INTO rate_audit_log (vehicle_type, old_rate, new_rate, changed_by)
                VALUES (%s, %s, %s, 'Admin')
            """, (v_type, old_rate, new_rate))
            
            conn.commit()
            cursor.close()
            conn.close()
            
            logger.info(f"Updated rate for {v_type}: ৳{old_rate} -> ৳{new_rate}")
            return jsonify({'success': True, 'message': f'Updated {v_type} toll rate successfully'})
        except Exception as e:
            logger.error(f"Error updating rate: {e}")
            if conn: conn.close()
            
    # Fallback Logic
    old_rate = mock_rates.get(v_type, 0)
    mock_rates[v_type] = new_rate
    mock_rate_history.insert(0, {
        'type': v_type,
        'oldRate': old_rate,
        'newRate': new_rate,
        'time': datetime.now().strftime('%h:%i %p')
    })
    
    # Update local in-memory records to match new toll rate
    for r in mock_records:
        if r['vehicle_type'] == v_type:
            r['toll_amount'] = new_rate
            
    logger.info(f"[Fallback Mode] Updated rate for {v_type}: ৳{old_rate} -> ৳{new_rate}")
    return jsonify({'success': True, 'message': f'Updated {v_type} rate to ৳{new_rate} (Mock fallback)'})

@app.route('/api/rates/history', methods=['GET'])
def get_rate_history():
    conn = get_db_connection()
    if conn:
        try:
            cursor = conn.cursor(dictionary=True)
            cursor.execute("""
                SELECT vehicle_type as type, old_rate as oldRate, new_rate as newRate,
                       changed_by as user, DATE_FORMAT(changed_at, '%h:%i %p') as time
                FROM rate_audit_log
                ORDER BY changed_at DESC
                LIMIT 15
            """)
            history = cursor.fetchall()
            
            # Convert decimals to float
            for h in history:
                h['oldRate'] = float(h['oldRate'])
                h['newRate'] = float(h['newRate'])
                
            cursor.close()
            conn.close()
            return jsonify(history)
        except Exception as e:
            logger.error(f"Error querying rate log: {e}")
            if conn: conn.close()
            
    return jsonify(mock_rate_history[:15])

@app.route('/api/reports', methods=['GET'])
def get_report():
    report_type = request.args.get('type', default='daily')
    days_back = 0
    if report_type == 'weekly':
        days_back = 7
    elif report_type == 'monthly':
        days_back = 30
        
    conn = get_db_connection()
    if conn:
        try:
            cursor = conn.cursor(dictionary=True)
            
            # Query grouped summary for selected timeframe
            query = """
                SELECT 
                    vehicle_type,
                    COUNT(*) as count,
                    COALESCE(SUM(toll_amount), 0) as revenue
                FROM vehicle_detections
                WHERE entry_time >= DATE_SUB(NOW(), INTERVAL %s DAY)
                GROUP BY vehicle_type
            """
            cursor.execute(query, (days_back,))
            results = cursor.fetchall()
            
            # Get latest rates
            cursor.execute("SELECT vehicle_type, rate_amount FROM toll_rates")
            rates_rows = cursor.fetchall()
            rates = {r['vehicle_type']: float(r['rate_amount']) for r in rates_rows}
            
            cursor.close()
            conn.close()
            
            rows = []
            total_count = 0
            total_revenue = 0
            
            for r in results:
                t = r['vehicle_type']
                rate = rates.get(t, TOLL_RATES.get(t, 0))
                rows.append({
                    'vehicle_type': t,
                    'count': r['count'],
                    'rate': rate,
                    'revenue': float(r['revenue'])
                })
                total_count += r['count']
                total_revenue += float(r['revenue'])
                
            return jsonify({
                'rows': rows,
                'totalCount': total_count,
                'totalRevenue': total_revenue
            })
        except Exception as e:
            logger.error(f"Error compiling report: {e}")
            if conn: conn.close()

    # Fallback Logic
    multiplier = 1
    if report_type == 'weekly':
        multiplier = 7
    elif report_type == 'monthly':
        multiplier = 30
        
    rows = []
    total_count = 0
    total_revenue = 0
    
    # Calculate daily aggregate from mock data
    daily_stats = {}
    for v_type in VEHICLE_DISTRIBUTION.keys():
        daily_stats[v_type] = {'count': 0, 'revenue': 0}
        
    for r in mock_records:
        t = r['vehicle_type']
        if t in daily_stats:
            daily_stats[t]['count'] += 1
            daily_stats[t]['revenue'] += r['toll_amount']
            
    for t, stat in daily_stats.items():
        v_count = stat['count'] * multiplier
        v_rev = stat['revenue'] * multiplier
        rate = mock_rates.get(t, 0)
        rows.append({
            'vehicle_type': t,
            'count': v_count,
            'rate': rate,
            'revenue': v_rev
        })
        total_count += v_count
        total_revenue += v_rev
        
    return jsonify({
        'rows': rows,
        'totalCount': total_count,
        'totalRevenue': total_revenue
    })

# ─────────────────────────────────────────────────────────────
# BACKGROUND MOCK SIMULATION (Disabled)
# ─────────────────────────────────────────────────────────────

# ─────────────────────────────────────────────────────────────
# RUN APPLICATION
# ─────────────────────────────────────────────────────────────

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    logger.info(f"Serving AI Toll Monitor web files from: {ROOT_DIR}")
    logger.info(f"Starting Flask server on http://localhost:{port}")
    app.run(host='0.0.0.0', port=port, debug=False)

