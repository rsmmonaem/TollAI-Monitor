#!/usr/bin/env python3
"""
AI Toll & Lease Collection Monitoring System
AI Engine — Vehicle Detection, ANPR, Classification, MySQL Storage

Requirements:
    pip install ultralytics opencv-python easyocr mysql-connector-python pillow

Usage:
    python ai_engine.py --source 0                  # webcam
    python ai_engine.py --source /path/to/video.mp4 # video file
    python ai_engine.py --source rtsp://camera-ip   # RTSP stream
"""
import math
import cv2
try:
    import easyocr
    EASYOCR_AVAILABLE = True
except Exception as e:
    EASYOCR_AVAILABLE = False
    easyocr = None
import mysql.connector
import urllib.request
import urllib.parse
import threading
import queue
import json
import requests
from requests.auth import HTTPDigestAuth
from concurrent.futures import ThreadPoolExecutor
import urllib3
urllib3.disable_warnings()
import numpy as np
import os
import sys
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import re
import socket
import time
import argparse
import logging
from datetime import datetime
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent

# Safe AI imports (handles environments where PyTorch C++ DLLs or dependencies are missing)
AI_AVAILABLE = False
torch = None
YOLO = None
ai_import_error = None

# Safe torchvision NMS shim for PyInstaller on Windows
try:
    import torchvision
    import torch
    _b = torch.zeros((1, 4))
    _s = torch.zeros((1,))
    torchvision.ops.nms(_b, _s, 0.5)
except Exception:
    import types
    try:
        from ultralytics.utils.nms import TorchNMS
        tv_mock = types.ModuleType('torchvision')
        tv_ops = types.ModuleType('torchvision.ops')
        tv_ops.nms = TorchNMS.nms
        tv_mock.ops = tv_ops
        import sys
        sys.modules['torchvision'] = tv_mock
        sys.modules['torchvision.ops'] = tv_ops
    except Exception:
        pass

try:
    import torch
    try:
        torch.set_num_threads(max(1, min(6, (os.cpu_count() or 4))))
        torch.set_grad_enabled(False)
    except Exception:
        pass
    from ultralytics import YOLO
    AI_AVAILABLE = True
except Exception as e:
    ai_import_error = e
    logging.getLogger('AIEngine').warning(f"PyTorch/YOLO not available ({e}). AI engine will run in mock/standby mode.")

# ─────────────────────────────────────────────────────────────
# CONFIGURATION (Imported from config.py)
# ─────────────────────────────────────────────────────────────
from config import (
    DB_CONFIG,
    OUTPUT_DIR,
    NVR_HOST,
    NVR_USER,
    NVR_PASS,
    NVR_CHANNELS,
    CAMERA_ID,
    YOLO_CONF_THRESHOLD,
    PLATE_COOLDOWN,
    STATIONARY_COOLDOWN,
    SPATIAL_GRID_CELLS,
    VEHICLE_CLASS_IDS,
    CUSTOM_CLASS_MAP,
    TOLL_RATES,
)

# ─────────────────────────────────────────────────────────────
# LOGGING
# ─────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger('TollAI')


# ─────────────────────────────────────────────────────────────
# DATABASE SETUP
# ─────────────────────────────────────────────────────────────

from db_adapter import get_db_connection


def init_database(conn):
    """Create database tables if they don't exist."""
    cursor = conn.cursor()

    # Main detection table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS vehicle_detections (
            id              INT AUTO_INCREMENT PRIMARY KEY,
            vehicle_type    VARCHAR(50)  NOT NULL DEFAULT 'Unknown',
            plate_number    VARCHAR(30)  NOT NULL DEFAULT '',
            image_path      VARCHAR(512) NOT NULL DEFAULT '',
            camera_id       TINYINT      NOT NULL DEFAULT 1,
            entry_time      DATETIME     NOT NULL,
            confidence      DECIMAL(5,2) NOT NULL DEFAULT 0.00,
            toll_amount     DECIMAL(8,2) NOT NULL DEFAULT 0.00,
            plate_conf      DECIMAL(5,2) NOT NULL DEFAULT 0.00,
            lane            VARCHAR(20)  DEFAULT NULL,
            status          ENUM('verified','manual_check','flagged') DEFAULT 'verified',
            created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_entry_time (entry_time),
            INDEX idx_vehicle_type (vehicle_type),
            INDEX idx_plate (plate_number),
            INDEX idx_camera (camera_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    """)

    # Fraud reports table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS fraud_reports (
            id              INT AUTO_INCREMENT PRIMARY KEY,
            report_date     DATE         NOT NULL,
            vehicle_type    VARCHAR(50),
            operator_count  INT          DEFAULT 0,
            ai_count        INT          DEFAULT 0,
            discrepancy     INT          DEFAULT 0,
            leakage_amount  DECIMAL(10,2) DEFAULT 0.00,
            created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_date_type (report_date, vehicle_type)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    """)

    # Toll rates table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS toll_rates (
            id              INT AUTO_INCREMENT PRIMARY KEY,
            vehicle_type    VARCHAR(50)   NOT NULL UNIQUE,
            rate_amount     DECIMAL(8,2)  NOT NULL DEFAULT 0.00,
            effective_from  DATE          NOT NULL,
            updated_by      VARCHAR(100)  DEFAULT 'System',
            updated_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    """)

    # Default rates
    cursor.execute("""
        INSERT IGNORE INTO toll_rates (vehicle_type, rate_amount, effective_from, updated_by) VALUES
            ('Bike',        5.00,  '2025-01-01', 'BRTA'),
            ('CNG',         10.00, '2025-01-01', 'BRTA'),
            ('Auto',        10.00, '2025-01-01', 'BRTA'),
            ('Pickup',      20.00, '2025-01-01', 'BRTA'),
            ('Car',         20.00, '2025-01-01', 'BRTA'),
            ('Covered Van', 40.00, '2025-01-01', 'BRTA'),
            ('Bus',         50.00, '2025-01-01', 'BRTA'),
            ('Truck',       50.00, '2025-01-01', 'BRTA'),
            ('Lorry',       60.00, '2025-01-01', 'BRTA');
    """)

    # Rate audit log table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS rate_audit_log (
            id              INT AUTO_INCREMENT PRIMARY KEY,
            vehicle_type    VARCHAR(50)   NOT NULL,
            old_rate        DECIMAL(8,2)  NOT NULL,
            new_rate        DECIMAL(8,2)  NOT NULL,
            changed_by      VARCHAR(100)  DEFAULT 'Admin',
            changed_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
            reason          TEXT          DEFAULT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    """)

    conn.commit()
    cursor.close()
    logger.info("✅ Database tables initialized")


def load_db_toll_rates(conn):
    """Query current toll rates from database and update the global TOLL_RATES dictionary."""
    global TOLL_RATES
    try:
        cursor = conn.cursor()
        cursor.execute("SHOW TABLES LIKE 'toll_rates'")
        if cursor.fetchone():
            cursor.execute("SELECT vehicle_type, rate_amount FROM toll_rates")
            rows = cursor.fetchall()
            if rows:
                for row in rows:
                    if isinstance(row, dict):
                        v_type = row.get('vehicle_type')
                        rate_val = row.get('rate_amount')
                    elif isinstance(row, (tuple, list)):
                        v_type, rate_val = row[0], row[1]
                    else:
                        continue
                    if v_type and rate_val is not None:
                        try:
                            TOLL_RATES[v_type] = int(float(rate_val))
                        except (ValueError, TypeError):
                            pass
                logger.info("✅ Toll rates loaded from database")
        cursor.close()
    except Exception as e:
        logger.warning(f"⚠️ Could not load toll rates from DB, using defaults: {e}")


def insert_detection(conn, record: dict) -> int:
    """Insert a detection record into the database."""
    cursor = conn.cursor()
    sql = """
        INSERT INTO vehicle_detections
            (vehicle_type, plate_number, image_path, camera_id, entry_time,
             confidence, toll_amount, plate_conf, status)
        VALUES
            (%(vehicle_type)s, %(plate_number)s, %(image_path)s, %(camera_id)s,
             %(entry_time)s, %(confidence)s, %(toll_amount)s, %(plate_conf)s, %(status)s)
    """
    cursor.execute(sql, record)
    conn.commit()
    last_id = cursor.lastrowid
    cursor.close()
    return last_id


# ─────────────────────────────────────────────────────────────
# PLATE OCR
# ─────────────────────────────────────────────────────────────

def preprocess_plate_roi(roi: np.ndarray) -> np.ndarray:
    """Enhance a number plate ROI for better OCR accuracy."""
    # Resize to standard height
    h, w = roi.shape[:2]
    scale = max(1, 80 // h)
    roi = cv2.resize(roi, (w * scale, h * scale), interpolation=cv2.INTER_CUBIC)

    # Convert to grayscale
    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)

    # Adaptive thresholding
    thresh = cv2.adaptiveThreshold(
        gray, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV, 11, 2
    )

    # Morphological closing
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
    cleaned = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)

    return cleaned


def extract_plate_region(frame: np.ndarray, bbox) -> np.ndarray | None:
    """Extract the license plate region from the lower half of a vehicle bbox."""
    x1, y1, x2, y2 = map(int, bbox)
    h = y2 - y1

    # Focus on the lower 30% of the vehicle bounding box (where plates typically are)
    plate_y1 = y1 + int(h * 0.65)
    plate_y2 = y2

    # Add horizontal margin
    margin = int((x2 - x1) * 0.05)
    px1 = max(0, x1 + margin)
    px2 = min(frame.shape[1], x2 - margin)

    roi = frame[plate_y1:plate_y2, px1:px2]
    if roi.size == 0:
        return None
    return roi


def clean_plate_text(raw_text: str) -> str:
    """Clean and normalize OCR output to a valid plate number."""
    # Remove non-alphanumeric except spaces and hyphens
    cleaned = re.sub(r'[^\w\s\-]', '', raw_text).strip()
    # Collapse multiple spaces
    cleaned = re.sub(r'\s+', ' ', cleaned)
    # Uppercase
    cleaned = cleaned.upper()
    return cleaned if len(cleaned) >= 4 else ''


# ─────────────────────────────────────────────────────────────
# VEHICLE CLASSIFICATION
# ─────────────────────────────────────────────────────────────

def classify_vehicle(yolo_class_name: str, yolo_class_id: int = -1, bbox: list = None) -> str:
    """Map YOLO detection to the 9 Bangladeshi toll categories:
    1. Bike (৳5)
    2. CNG (৳10)
    3. Auto (৳10)
    4. Car (৳20)
    5. Pickup (৳20)
    6. Covered Van (৳40)
    7. Bus (৳50)
    8. Truck (৳50)
    9. Lorry (৳60)
    """
    name_clean = str(yolo_class_name).strip().lower()

    # 1. Direct custom class dictionary match
    if name_clean in CUSTOM_CLASS_MAP:
        return CUSTOM_CLASS_MAP[name_clean]

    # 2. Key phrases in name
    if any(k in name_clean for k in ('motorbike', 'motorcycle', 'scooter', 'bicycle', 'bike')):
        return 'Bike'
    if any(k in name_clean for k in ('cng', 'three wheeler', 'three-wheeler')):
        return 'CNG'
    if any(k in name_clean for k in ('auto rickshaw', 'auto-rickshaw', 'easybike', 'rickshaw', 'auto', 'wheelbarrow')):
        return 'Auto'
    if any(k in name_clean for k in ('bus', 'minibus')):
        return 'Bus'
    if any(k in name_clean for k in ('pickup', 'human hauler')):
        return 'Pickup'
    if any(k in name_clean for k in ('lorry', 'trailer', 'prime mover')):
        return 'Lorry'
    if any(k in name_clean for k in ('truck', 'army vehicle')):
        return 'Truck'
    if any(k in name_clean for k in ('van', 'covered-van', 'covered van', 'garbagevan')):
        return 'Covered Van'
    if any(k in name_clean for k in ('car', 'suv', 'taxi', 'policecar', 'ambulance', 'minivan', 'jeep', 'microbus')):
        return 'Car'

    # 3. Geometric fallback if generic
    if bbox is not None:
        w = max(1.0, bbox[2] - bbox[0])
        h = max(1.0, bbox[3] - bbox[1])
        area = w * h
        if area > 65000:
            return 'Lorry'
        if w < 70 or area < 8500:
            return 'Bike'

    return VEHICLE_CLASS_IDS.get(yolo_class_id, 'Car')


# ─────────────────────────────────────────────────────────────
# VISUALIZATION HELPERS
# ─────────────────────────────────────────────────────────────

COLORS = {
    'Bike':   (130, 102, 99),
    'CNG':    (50, 205, 50),
    'Auto':   (0, 190, 230),
    'Pickup': (0, 215, 255),
    'Bus':    (255, 165, 0),
    'Truck':       (71, 68, 239),
    'Lorry':       (200, 100, 255),
    'Covered Van': (255, 190, 0),
    'Car':         (128, 192, 255),
    'Unknown':     (150, 150, 150),
}

def draw_detection(frame, bbox, vehicle_type: str, plate: str, confidence: float, toll: int):
    """Draw bounding box and labels on frame."""
    x1, y1, x2, y2 = map(int, bbox)
    color = COLORS.get(vehicle_type, (200, 200, 200))

    # Bounding box
    cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

    # Label background
    label = f"{vehicle_type} {confidence:.0%}"
    (lw, lh), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 2)
    cv2.rectangle(frame, (x1, y1 - lh - 8), (x1 + lw + 6, y1), color, -1)
    cv2.putText(frame, label, (x1 + 3, y1 - 4),
                cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 0), 2)

    # Plate number below bbox
    if plate:
        plate_label = f"PLATE: {plate}  |  Toll: {toll}Tk"
        cv2.putText(frame, plate_label, (x1, y2 + 18),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 1)


def draw_hud(frame, fps: float, total_today: int, total_revenue: int, is_paused: bool = False):
    """Draw heads-up display overlay on frame."""
    h, w = frame.shape[:2]

    # Dark banner at top
    overlay = frame.copy()
    cv2.rectangle(overlay, (0, 0), (w, 50), (15, 20, 35), -1)
    cv2.addWeighted(overlay, 0.7, frame, 0.3, 0, frame)

    status_tag = "[PAUSED]" if is_paused else "[ACTIVE]"
    status_color = (0, 165, 255) if is_paused else (100, 255, 100)
    cv2.putText(frame, f"AI TOLL {status_tag} | FPS: {fps:.1f}",
                (10, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.52, status_color, 1)

    ts = datetime.now().strftime('%Y-%m-%d  %H:%M:%S')
    cv2.putText(frame, ts, (10, 38),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (180, 200, 180), 1)

    # Stats on right
    stats = f"Today: {total_today}  Revenue: {total_revenue:,} Tk"
    (sw, _), _ = cv2.getTextSize(stats, cv2.FONT_HERSHEY_SIMPLEX, 0.48, 1)
    cv2.putText(frame, stats, (w - sw - 10, 18),
                cv2.FONT_HERSHEY_SIMPLEX, 0.48, (100, 255, 150), 1)

    # Status indicator dot
    dot_color = (0, 165, 255) if is_paused else (0, 0, 255)
    cv2.circle(frame, (w - 15, 38), 5, dot_color, -1)
    cv2.putText(frame, "PAUSE" if is_paused else "LIVE", (w - 55, 42),
                cv2.FONT_HERSHEY_SIMPLEX, 0.38, dot_color, 1)


# ─────────────────────────────────────────────────────────────
# MAIN ENGINE
# ─────────────────────────────────────────────────────────────

class TollAIEngine:
    def __init__(self, source, model_path: str = 'best.pt', show_window: bool = True, camera_ids=None, port: int = None):
        self.source = source
        self.show_window = show_window
        self.port = int(port or os.environ.get('PORT', 5002))

        # Camera multi-select set
        if camera_ids is not None:
            self.camera_ids = set(camera_ids)
        else:
            self.camera_ids = {1, 2}

        self.model_lock = threading.Lock()
        self.running = True

        # Load YOLO model
        if not AI_AVAILABLE or YOLO is None:
            raise RuntimeError(f"PyTorch/YOLO could not be loaded: {ai_import_error}")

        logger.info(f"Loading YOLO model: {model_path}")
        self.model = YOLO(model_path)

        # Warmup YOLO model for zero cold-start inference latency
        try:
            dummy = np.zeros((360, 640, 3), dtype=np.uint8)
            with torch.inference_mode():
                self.model(dummy, verbose=False, imgsz=480)
            logger.info("⚡ YOLO model warmed up with torch.inference_mode")
        except Exception as e:
            logger.debug(f"Warmup notice: {e}")

        # Thread pool for concurrent multi-camera NVR processing
        self.nvr_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="NVRProcessWorker")

        # EasyOCR reader (Bengali + English)
        if EASYOCR_AVAILABLE:
            try:
                logger.info("Initializing EasyOCR (bn, en)...")
                self.ocr = easyocr.Reader(['bn', 'en'], gpu=False, verbose=False)
            except Exception as e:
                logger.warning(f"EasyOCR initialization failed: {e}")
                self.ocr = None
        else:
            logger.info("EasyOCR not available, skipping OCR initialization.")
            self.ocr = None

        # Database
        self.conn = get_db_connection()
        if self.conn:
            init_database(self.conn)
            load_db_toll_rates(self.conn)

        # State
        self.ai_enabled = True                        # Master AI detection switch
        self.cam_trackers = {}                        # Independent ByteTrack instance per camera
        self.captured_tracks = set()                  # Set of 'c{cam_id}_t{track_id}' already counted
        self.plate_last_seen: dict[str, float] = {}   # plate_text -> last insert timestamp
        self.plate_last_bbox: dict[str, list] = {}    # plate_text -> last bbox [x1,y1,x2,y2]
        self.spatial_last_seen: dict[str, float] = {} # spatial_cell_key -> last insert timestamp
        self.plate_cache: dict[str, tuple[str, float]] = {}  # cache_key -> (plate_text, conf)
        self.recent_records: list[dict] = []  # list of {'camera_id': int, 'bbox': list, 'plate': str, 'time': float}
        self.total_today = 0
        self.total_revenue = 0

        # Load today's existing baseline statistics from database
        try:
            if self.conn:
                cursor = self.conn.cursor(dictionary=True)
                cursor.execute("""
                    SELECT COUNT(*) as cnt, COALESCE(SUM(toll_amount), 0) as rev
                    FROM vehicle_detections
                    WHERE DATE(entry_time) = CURDATE()
                """)
                row = cursor.fetchone()
                if row:
                    self.total_today = int(row.get('cnt') or 0)
                    self.total_revenue = int(row.get('rev') or 0)
                cursor.close()
                logger.info(f"Loaded today's existing records: {self.total_today} vehicles, ৳{self.total_revenue} revenue")
        except Exception as e:
            logger.warning(f"Could not load baseline stats: {e}")

        self.fps_counter = 0
        self.fps_start = time.time()
        self.current_fps = 0.0
        self.last_webcam_frame_time = 0.0

        # Background DB and disk write worker (prevents I/O blocking the real-time video loop)
        self.db_queue = queue.Queue(maxsize=200)
        self.db_thread = threading.Thread(target=self._db_worker, daemon=True)
        self.db_thread.start()

        # Thread pool for asynchronous non-blocking OCR recognition
        self.ocr_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="OCRWorker")
        self.ocr_pending = set()

        # Persistent HTTP session for ultra-fast local frame streaming to Flask
        self.http_session = requests.Session()

    def _sync_cameras_worker(self):
        """Polls Flask /api/ai/control and /api/ai/cameras dynamically to sync state from UI."""
        while self.running:
            try:
                # 1. Sync Master AI detection switch
                ctrl_url = f"http://127.0.0.1:{self.port}/api/ai/control"
                req_ctrl = urllib.request.Request(ctrl_url)
                with urllib.request.urlopen(req_ctrl, timeout=1.0) as res:
                    if res.status == 200:
                        ctrl_data = json.loads(res.read().decode())
                        self.ai_enabled = ctrl_data.get('ai_enabled', True)

                # 2. Sync active cameras
                url = f"http://127.0.0.1:{self.port}/api/ai/cameras"
                req = urllib.request.Request(url)
                with urllib.request.urlopen(req, timeout=1.0) as res:
                    if res.status == 200:
                        data = json.loads(res.read().decode())
                        active = data.get('active_cameras')
                        if isinstance(active, list):
                            new_cams = set(int(x) for x in active if 1 <= int(x) <= len(NVR_CHANNELS))
                            if new_cams != self.camera_ids:
                                logger.info(f"🔄 AI Engine active cameras dynamically updated: {sorted(list(new_cams))}")
                                self.camera_ids = new_cams
            except Exception:
                pass
            time.sleep(2.0)

    def _db_worker(self):
        """Asynchronously writes captured vehicle images to disk and logs records to database with auto-reconnect."""
        while True:
            item = self.db_queue.get()
            if item is None:
                break
            frame, vehicle_type, plate_text, camera_id, conf, toll, plate_conf, status = item
            try:
                img_path = self._save_image(frame, vehicle_type, plate_text, camera_id)
                record = {
                    'vehicle_type': vehicle_type,
                    'plate_number': plate_text,
                    'image_path':   img_path,
                    'camera_id':    camera_id,
                    'entry_time':   datetime.now(),
                    'confidence':   round(conf * 100, 2),
                    'toll_amount':  toll,
                    'plate_conf':   round(plate_conf, 2),
                    'status':       status,
                }
                
                # Check connection health; reconnect if dropped
                if not self.conn or not getattr(self.conn, 'is_connected', lambda: True)():
                    self.conn = get_db_connection()

                if self.conn:
                    try:
                        rec_id = insert_detection(self.conn, record)
                        logger.info(f"[#{rec_id}] {vehicle_type:10} | Plate: {plate_text:20} | "
                                    f"Conf: {conf:.1%} | Toll: {toll}Tk | {img_path}")
                    except Exception as ins_err:
                        # Attempt one reconnect and retry
                        logger.debug(f"DB insert retry after error: {ins_err}")
                        self.conn = get_db_connection()
                        if self.conn:
                            rec_id = insert_detection(self.conn, record)
                            logger.info(f"[#{rec_id}] {vehicle_type:10} | Plate: {plate_text:20} | "
                                        f"Conf: {conf:.1%} | Toll: {toll}Tk | {img_path}")
            except Exception as e:
                logger.warning(f"Error in async DB worker: {e}")
            finally:
                self.db_queue.task_done()

    def _spatial_key(self, bbox: list, camera_id: int = 1, frame_w: int = 640, frame_h: int = 360) -> str:
        """Map a bounding box to a spatial grid cell key."""
        cx = (bbox[0] + bbox[2]) / 2
        cy = (bbox[1] + bbox[3]) / 2
        cell_x = int(cx / frame_w * SPATIAL_GRID_CELLS)
        cell_y = int(cy / frame_h * SPATIAL_GRID_CELLS)
        return f"cam{camera_id}_cell_{cell_x}_{cell_y}"

    def _is_duplicate(self, track_id, bbox: list, camera_id: int = 1) -> bool:
        """Accurate deduplication:
        1. If vehicle has ByteTrack track_id: check if track_id was already captured.
        2. If track_id is None: check if vehicle in the same camera view has IoU > 0.60
           within the last 3.5 seconds (prevents counting stationary car repeatedly).
        """
        now = time.time()

        if track_id is not None:
            track_key = f"c{camera_id}_t{track_id}"
            if track_key in self.captured_tracks:
                return True
            self.captured_tracks.add(track_key)
            if len(self.captured_tracks) > 5000:
                self.captured_tracks.clear()
            return False

        # Untracked fallback
        self.recent_records = [r for r in self.recent_records if now - r['time'] < 3.5]
        for rec in self.recent_records:
            if rec['camera_id'] == camera_id:
                b1, b2 = rec['bbox'], bbox
                xA = max(b1[0], b2[0])
                yA = max(b1[1], b2[1])
                xB = min(b1[2], b2[2])
                yB = min(b1[3], b2[3])
                inter = max(0.0, xB - xA) * max(0.0, yB - yA)
                a1 = max(1.0, (b1[2] - b1[0]) * (b1[3] - b1[1]))
                a2 = max(1.0, (b2[2] - b2[0]) * (b2[3] - b2[1]))
                iou = inter / float(a1 + a2 - inter)
                if iou > 0.60:
                    rec['time'] = now
                    return True

        self.recent_records.append({
            'camera_id': camera_id,
            'bbox': bbox,
            'time': now
        })
        return False

    def _save_image(self, frame: np.ndarray, vehicle_type: str, plate: str, camera_id: int) -> str:
        """Save the captured vehicle frame to disk and return web-ready relative path."""
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S_%f')[:19]
        safe_plate = re.sub(r'[^\w]', '_', plate) if plate else 'unknown'
        filename = f"{vehicle_type}_{safe_plate}_{timestamp}_CAM{camera_id}.jpg"

        data_dir = os.environ.get('PERSISTENT_DATA_DIR', str(ROOT_DIR))
        out_folder = Path(data_dir) / 'captured_vehicles'
        out_folder.mkdir(parents=True, exist_ok=True)

        path = out_folder / filename
        cv2.imwrite(str(path), frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
        return f"captured_vehicles/{filename}"

    def _async_ocr_task(self, cache_key, plate_roi, vehicle_type, camera_id, conf, toll, bbox, full_frame, track_id=None):
        """Asynchronous OCR worker running in background thread pool."""
        plate_text = ""
        plate_conf = 0.0
        try:
            if self.ocr is not None and plate_roi is not None and plate_roi.size > 0:
                processed_roi = preprocess_plate_roi(plate_roi)
                ocr_results = self.ocr.readtext(processed_roi, detail=1)
                if ocr_results:
                    best = max(ocr_results, key=lambda r: r[2])
                    raw = best[1]
                    plate_conf = float(best[2]) * 100
                    plate_text = clean_plate_text(raw)
        except Exception as e:
            logger.debug(f"Async OCR error: {e}")
        finally:
            if not plate_text:
                if track_id is not None:
                    plate_text = f"BD-CAM{camera_id}-T{track_id}"
                else:
                    plate_text = f"BD-CAM{camera_id}-P{int(time.time()) % 10000}"

            self.plate_cache[cache_key] = (plate_text, plate_conf)
            self.ocr_pending.discard(cache_key)

            # Check deduplication and queue DB insert
            if not self._is_duplicate(track_id, bbox, camera_id):
                status = 'verified' if conf > 0.75 else 'manual_check'
                try:
                    self.db_queue.put_nowait((full_frame, vehicle_type, plate_text, camera_id, conf, toll, plate_conf, status))
                    self.total_today += 1
                    self.total_revenue += toll
                    logger.info(f"🚗 CAPTURED: {vehicle_type:10} | Plate: {plate_text:18} | Cam {camera_id} | Total: {self.total_today} | Rev: ৳{self.total_revenue}")
                except queue.Full:
                    pass

    def _track_camera_frame(self, frame: np.ndarray, camera_id: int):
        """Ensures each camera maintains its own independent ByteTrack tracker state."""
        if hasattr(self.model, 'predictor') and self.model.predictor and camera_id in self.cam_trackers:
            self.model.predictor.trackers = [self.cam_trackers[camera_id]]

        results = self.model.track(
            frame,
            conf=YOLO_CONF_THRESHOLD,
            persist=True,
            verbose=False,
            imgsz=480,
            tracker="bytetrack.yaml"
        )[0]

        if hasattr(self.model, 'predictor') and self.model.predictor and getattr(self.model.predictor, 'trackers', None):
            self.cam_trackers[camera_id] = self.model.predictor.trackers[0]

        return results

    def _process_frame(self, frame: np.ndarray, camera_id: int):
        """Run YOLO tracking + ultra-fast non-blocking OCR pipeline on a single frame."""
        if not getattr(self, 'ai_enabled', True):
            return frame

        with torch.inference_mode():
            results = self._track_camera_frame(frame, camera_id)

        # 1. Extract all valid vehicle detections
        raw_dets = []
        for det in results.boxes:
            cls_id   = int(det.cls[0])
            cls_name = self.model.names[cls_id]
            conf     = float(det.conf[0])
            bbox     = det.xyxy[0].tolist()

            vehicle_type = classify_vehicle(cls_name, cls_id, bbox)

            track_id = int(det.id[0]) if det.id is not None else None
            raw_dets.append({
                'cls_id': cls_id, 'cls_name': cls_name, 'conf': conf,
                'bbox': bbox, 'vehicle_type': vehicle_type, 'track_id': track_id
            })

        # 2. Suppress duplicate overlapping boxes
        kept_dets = []
        for d in sorted(raw_dets, key=lambda x: x['conf'], reverse=True):
            overlap = False
            for k in kept_dets:
                b1, b2 = d['bbox'], k['bbox']
                xA = max(b1[0], b2[0])
                yA = max(b1[1], b2[1])
                xB = min(b1[2], b2[2])
                yB = min(b1[3], b2[3])
                inter = max(0.0, xB - xA) * max(0.0, yB - yA)
                a1 = max(1.0, (b1[2] - b1[0]) * (b1[3] - b1[1]))
                a2 = max(1.0, (b2[2] - b2[0]) * (b2[3] - b2[1]))
                iou = inter / float(a1 + a2 - inter)
                if iou > 0.40:
                    overlap = True
                    break
            if not overlap:
                kept_dets.append(d)

        for det in kept_dets:
            bbox = det['bbox']
            vehicle_type = det['vehicle_type']
            conf = det['conf']
            track_id = det['track_id']

            cache_key = f"c{camera_id}_t{track_id}" if track_id is not None else f"c{camera_id}_{int(bbox[0])}_{int(bbox[1])}"

            if cache_key in self.plate_cache:
                plate_text, plate_conf = self.plate_cache[cache_key]
            else:
                plate_text = f"T{track_id}" if track_id is not None else "DETECTING..."
                plate_conf = 0.0

                # Queue capture + OCR job in background thread pool once per vehicle
                if cache_key not in self.ocr_pending:
                    self.ocr_pending.add(cache_key)
                    plate_roi = extract_plate_region(frame, bbox)
                    self.ocr_executor.submit(
                        self._async_ocr_task,
                        cache_key,
                        plate_roi.copy() if plate_roi is not None else None,
                        vehicle_type,
                        camera_id,
                        conf,
                        TOLL_RATES.get(vehicle_type, 20),
                        bbox,
                        frame.copy(),
                        track_id
                    )

            # Draw bounding box and label immediately on frame for zero-latency live visual feedback
            toll = TOLL_RATES.get(vehicle_type, 20)
            draw_detection(frame, bbox, vehicle_type, plate_text, conf, toll)

        return frame

    def _update_fps(self):
        self.fps_counter += 1
        elapsed = time.time() - self.fps_start
        if elapsed >= 1.0:
            self.current_fps = self.fps_counter / elapsed
            self.fps_counter = 0
            self.fps_start = time.time()

    def _setup_http_isapi(self):
        """Helper to establish HTTP ISAPI snapshot polling if RTSP is blocked."""
        if not isinstance(self.source, str):
            return None, None
        
        # 1. Direct HTTP URL
        if self.source.startswith('http://') or self.source.startswith('https://'):
            m = re.match(r'https?://(?:([^:]+):([^@]+)@)?([^/]+)(/.*)?', self.source)
            if m:
                u, p, host, path = m.groups()
                session = requests.Session()
                if u and p:
                    session.auth = HTTPDigestAuth(urllib.parse.unquote(u), urllib.parse.unquote(p))
                return session, f"http://{host}{path or '/ISAPI/Streaming/channels/101/picture'}"

        # 2. RTSP URL fallback to HTTP ISAPI
        m = re.match(r'rtsp://(?:([^:]+):([^@]+)@)?([^:/]+)(?::(\d+))?(/.*)?', self.source)
        if m:
            u, p, host, _, path = m.groups()
            if u and p and host:
                user = urllib.parse.unquote(u)
                pwd = urllib.parse.unquote(p)
                ch_match = re.search(r'Channels?/(\d+)', path or '')
                ch = ch_match.group(1) if ch_match else '101'
                session = requests.Session()
                session.auth = HTTPDigestAuth(user, pwd)
                test_url = f"http://{host}/ISAPI/Streaming/channels/{ch}/picture"
                try:
                    r = session.get(test_url, timeout=3)
                    if r.status_code == 200:
                        logger.info(f"✅ Auto-switched to Hikvision HTTP ISAPI stream: {test_url}")
                        return session, test_url
                except Exception as e:
                    logger.debug(f"HTTP ISAPI probe failed: {e}")
        return None, None

    def _open_video_capture(self, source):
        """Robustly opens video source across macOS, Windows, and Linux with auto-fallbacks."""
        # 1. Handle webcam index (e.g. 0, '0', 1, '1')
        is_cam_idx = False
        cam_idx = 0
        if isinstance(source, int):
            is_cam_idx = True
            cam_idx = source
        elif isinstance(source, str) and source.strip().isdigit():
            is_cam_idx = True
            cam_idx = int(source.strip())

        if is_cam_idx:
            # macOS: Prefer AVFoundation
            if sys.platform == 'darwin':
                try:
                    cap = cv2.VideoCapture(cam_idx, cv2.CAP_AVFOUNDATION)
                    if cap.isOpened():
                        logger.info(f"📹 Opened macOS Camera {cam_idx} with AVFoundation")
                        return cap
                    cap.release()
                except Exception:
                    pass
            # Windows: Prefer DirectShow to prevent device lockups
            elif sys.platform.startswith('win'):
                try:
                    cap = cv2.VideoCapture(cam_idx, cv2.CAP_DSHOW)
                    if cap.isOpened():
                        logger.info(f"📹 Opened Windows Camera {cam_idx} with DirectShow")
                        return cap
                    cap.release()
                except Exception:
                    pass
                try:
                    cap = cv2.VideoCapture(cam_idx, cv2.CAP_MSMF)
                    if cap.isOpened():
                        logger.info(f"📹 Opened Windows Camera {cam_idx} with MSMF")
                        return cap
                    cap.release()
                except Exception:
                    pass
            # Linux: Prefer V4L2
            elif sys.platform.startswith('linux'):
                try:
                    cap = cv2.VideoCapture(cam_idx, cv2.CAP_V4L2)
                    if cap.isOpened():
                        logger.info(f"📹 Opened Linux Camera {cam_idx} with V4L2")
                        return cap
                    cap.release()
                except Exception:
                    pass

            # Default generic VideoCapture fallback
            try:
                cap = cv2.VideoCapture(cam_idx)
                if cap.isOpened():
                    logger.info(f"📹 Opened Camera {cam_idx} with default backend")
                    return cap
                cap.release()
            except Exception:
                pass
            logger.warning(f"⚠️ Could not open webcam index {cam_idx}")
            return None

        # 2. Handle RTSP stream
        if isinstance(source, str) and source.startswith('rtsp://'):
            from rtsp_manager import is_rtsp_reachable
            if not is_rtsp_reachable(source, timeout=1.5):
                logger.warning(f"⚠️ RTSP host {source} is unreachable. Skipping direct VideoCapture.")
                return None
            try:
                cap = cv2.VideoCapture(source, cv2.CAP_FFMPEG)
                if cap.isOpened():
                    logger.info(f"📹 Opened RTSP stream: {source}")
                    return cap
                cap.release()
            except Exception as e:
                logger.warning(f"RTSP open error: {e}")
            return None

        # 3. Handle local video file
        if isinstance(source, str) and os.path.exists(source):
            try:
                cap = cv2.VideoCapture(source)
                if cap.isOpened():
                    return cap
                cap.release()
            except Exception:
                pass

        # 4. Standard VideoCapture attempt
        try:
            cap = cv2.VideoCapture(source)
            if cap.isOpened():
                return cap
            cap.release()
        except Exception:
            pass

        return None

    def run(self):
        """Main processing loop."""
        os.environ['OPENCV_FFMPEG_CAPTURE_OPTIONS'] = 'rtsp_transport;tcp|stimeout;2000000|max_delay;500000'
        cap = None
        http_session = None
        http_url = None

        # Check if source is 'nvr' or CCTV NVR stream
        is_nvr_source = (
            isinstance(self.source, str) and
            (self.source.lower() == 'nvr' or '103.79.179.116' in self.source)
        )

        if is_nvr_source:
            logger.info("📹 Source: Real CCTV Multi-Channel NVR (103.79.179.116) active — Processing Real CCTV Cameras!")

        # If not NVR mode and not direct http, try opening video capture
        if not is_nvr_source and not (isinstance(self.source, str) and self.source.startswith('http')):
            cap = self._open_video_capture(self.source)
            if cap is not None and cap.isOpened():
                try:
                    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                except Exception:
                    pass
                src_fps = cap.get(cv2.CAP_PROP_FPS) or 30
                width   = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                height  = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                logger.info(f"📹 Video Source Ready: {self.source} | {width}x{height} @ {src_fps:.1f} FPS")
            else:
                logger.warning(f"⚠️ Cannot open capture for source '{self.source}'. Probing HTTP ISAPI fallback...")
                cap = None

        # 2. If cap failed to open or source is HTTP, probe HTTP ISAPI stream
        self.running = True
        latest_http_frame = None
        frame_lock = threading.Lock()

        if cap is None and isinstance(self.source, str) and not is_nvr_source:
            http_session, http_url = self._setup_http_isapi()
            if http_url:
                logger.info(f"📹 Live HTTP stream active: {http_url}")
                # Start fast background frame grabber
                def _http_grabber():
                    nonlocal latest_http_frame
                    while getattr(self, 'running', True):
                        try:
                            r = http_session.get(http_url, timeout=1.5)
                            if r.status_code == 200:
                                arr = np.frombuffer(r.content, np.uint8)
                                img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
                                if img is not None:
                                    with frame_lock:
                                        latest_http_frame = img
                        except Exception:
                            time.sleep(0.05)

                t = threading.Thread(target=_http_grabber, daemon=True)
                t.start()
            else:
                logger.warning("⚠️ Running AI Engine in Web Upload mode (listening for browser webcam frames)...")

        frame_skip = 1
        frame_num  = 0

        # Start dynamic camera sync thread to listen for UI updates
        self.sync_thread = threading.Thread(target=self._sync_cameras_worker, daemon=True)
        self.sync_thread.start()

        logger.info(f"🚀 AI Engine running. Active cameras: {sorted(list(self.camera_ids))}")

        try:
            while self.running:
                active_cams = sorted(list(self.camera_ids))
                if not active_cams:
                    time.sleep(0.1)
                    continue

                # 1. Single ultra-fast check for any active uploaded client webcam frame
                raw_frame = None
                webcam_cam_id = None
                try:
                    res = self.http_session.get(f"http://127.0.0.1:{self.port}/api/camera/raw_active_frame", timeout=0.08)
                    if res.status_code == 200 and res.content:
                        nparr = np.frombuffer(res.content, np.uint8)
                        raw_frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                        webcam_cam_id = int(res.headers.get('X-Camera-ID', active_cams[0]))
                except Exception:
                    pass

                if raw_frame is not None and webcam_cam_id is not None:
                    self.last_webcam_frame_time = time.time()
                    if raw_frame.shape[1] > 960:
                        raw_frame = cv2.resize(raw_frame, (640, 360))
                    with self.model_lock:
                        processed = self._process_frame(raw_frame, webcam_cam_id)
                    
                    # Post processed frame back to Flask
                    try:
                        _, jpeg = cv2.imencode('.jpg', processed, [cv2.IMWRITE_JPEG_QUALITY, 65])
                        self.http_session.post(
                            f"http://127.0.0.1:{self.port}/api/camera/{webcam_cam_id}/frame",
                            data=jpeg.tobytes(),
                            headers={'Content-Type': 'image/jpeg'},
                            timeout=0.15
                        )
                    except Exception as e:
                        logger.debug(f"Error posting webcam frame for camera {webcam_cam_id}: {e}")
                    
                    time.sleep(0.02)
                    continue

                if time.time() - self.last_webcam_frame_time < 2.0:
                    time.sleep(0.02)
                    continue

                # 2. Process real NVR camera frames concurrently if source is NVR / CCTV
                if is_nvr_source:
                    def _handle_nvr_cam(cam_id):
                        raw_frame = None
                        # Try cached raw NVR frame from server
                        try:
                            res = self.http_session.get(f"http://127.0.0.1:{self.port}/api/camera/{cam_id}/raw_nvr_frame", timeout=0.35)
                            if res.status_code == 200 and res.content and len(res.content) > 1000:
                                arr = np.frombuffer(res.content, np.uint8)
                                raw_frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
                        except Exception:
                            pass

                        # If server cache doesn't have it yet, query NVR ISAPI directly
                        if raw_frame is None:
                            ch_map = {1: '101', 2: '201', 3: '301', 4: '401', 5: '501', 6: '601', 7: '701', 8: '801', 9: '901', 10: '1001', 11: '1101', 12: '1201', 13: '1301', 14: '1501'}
                            ch = ch_map.get(cam_id, f'{cam_id}01')
                            try:
                                r = requests.get(f"http://103.79.179.116/ISAPI/Streaming/channels/{ch}/picture",
                                                 auth=HTTPDigestAuth('admin', 'nurbio2026'), timeout=1.0)
                                if r.status_code == 200 and len(r.content) > 1000:
                                    arr = np.frombuffer(r.content, np.uint8)
                                    raw_frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
                            except Exception:
                                pass

                        if raw_frame is not None:
                            if raw_frame.shape[1] > 960:
                                raw_frame = cv2.resize(raw_frame, (640, 360))
                            with self.model_lock:
                                proc_frame = self._process_frame(raw_frame, cam_id)
                            draw_hud(proc_frame, self.current_fps, self.total_today, self.total_revenue, is_paused=not getattr(self, 'ai_enabled', True))
                            _, jpeg = cv2.imencode('.jpg', proc_frame, [cv2.IMWRITE_JPEG_QUALITY, 65])
                            try:
                                self.http_session.post(
                                    f"http://127.0.0.1:{self.port}/api/camera/{cam_id}/frame",
                                    data=jpeg.tobytes(),
                                    headers={'Content-Type': 'image/jpeg'},
                                    timeout=0.25
                                )
                            except Exception:
                                pass

                    self._update_fps()
                    list(self.nvr_executor.map(_handle_nvr_cam, active_cams))
                    time.sleep(0.02)
                    continue

                # 3. Process video frame from cap or HTTP snapshot
                frame = None
                if cap is not None and cap.isOpened():
                    ret, frame = cap.read()
                    if not ret:
                        if isinstance(self.source, str) and not str(self.source).isdigit() and os.path.exists(str(self.source)):
                            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                            ret, frame = cap.read()
                            if not ret:
                                time.sleep(0.05)
                                continue
                        else:
                            time.sleep(0.2)
                            continue
                elif http_session is not None:
                    with frame_lock:
                        if latest_http_frame is not None:
                            frame = latest_http_frame
                            latest_http_frame = None  # Consume frame
                    if frame is None:
                        time.sleep(0.02)
                        continue
                else:
                    time.sleep(0.1)
                    continue

                if frame is None:
                    time.sleep(0.02)
                    continue

                frame_num += 1

                # Resize if high resolution to maintain 30+ FPS
                if frame.shape[1] > 960:
                    frame = cv2.resize(frame, (640, 360))

                self._update_fps()

                # Process detection once on the frame
                with self.model_lock:
                    proc_frame = self._process_frame(frame, active_cams[0])

                # HUD overlay
                draw_hud(proc_frame, self.current_fps, self.total_today, self.total_revenue, is_paused=not getattr(self, 'ai_enabled', True))

                # Ultra-fast JPEG encode with quality 65 (cuts latency & size in half)
                _, jpeg = cv2.imencode('.jpg', proc_frame, [cv2.IMWRITE_JPEG_QUALITY, 65])
                jpeg_bytes = jpeg.tobytes()

                # One single broadcast POST to update all active cameras instantly
                cams_csv = ",".join(map(str, active_cams))
                try:
                    self.http_session.post(
                        f"http://127.0.0.1:{self.port}/api/cameras/broadcast_frame",
                        data=jpeg_bytes,
                        headers={
                            'Content-Type': 'image/jpeg',
                            'X-Camera-IDs': cams_csv
                        },
                        timeout=0.25
                    )
                except Exception:
                    pass

                # Display if window is enabled
                if self.show_window:
                    cv2.imshow(f'AI Toll Monitor — CAM {active_cams[0]}', proc_frame)
                    key = cv2.waitKey(1) & 0xFF
                    if key == ord('q') or key == 27:
                        self.running = False
                        break

        except KeyboardInterrupt:
            logger.info("Stopped by user")
        finally:
            self.running = False
            if cap is not None:
                cap.release()
            if self.show_window:
                cv2.destroyAllWindows()
            if self.conn and self.conn.is_connected():
                self.conn.close()

            logger.info(f"📊 Session Summary: {self.total_today} vehicles | "
                        f"Revenue: ৳{self.total_revenue:,}")


# ─────────────────────────────────────────────────────────────
# ENTRY POINT
# ─────────────────────────────────────────────────────────────

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='AI Toll Monitoring Engine')
    parser.add_argument('--source',  type=str, default='0',
                        help='Video source: 0=webcam, /path/to/video.mp4, rtsp://...')
    parser.add_argument('--model',   type=str, default='best.pt',
                        help='YOLO model path (default: best.pt)')
    parser.add_argument('--camera-id', type=int, default=None,
                        help='Single Camera ID (default: None)')
    parser.add_argument('--cameras', type=str, default=None,
                        help='Comma-separated Camera IDs to process (e.g. "1,2,3" or "all")')
    parser.add_argument('--no-window', action='store_true',
                        help='Run headless (no display window)')
    parser.add_argument('--port', type=int, default=None,
                        help='Flask server port (default: PORT env or 5002)')
    args = parser.parse_args()

    # Determine camera IDs to process
    selected_cameras = []
    if args.cameras:
        if args.cameras.strip().lower() == 'all':
            selected_cameras = list(range(1, len(NVR_CHANNELS) + 1))
        else:
            for part in args.cameras.split(','):
                part = part.strip()
                if part.isdigit() and 1 <= int(part) <= len(NVR_CHANNELS):
                    selected_cameras.append(int(part))
    elif args.camera_id is not None:
        selected_cameras = [args.camera_id]
    elif os.environ.get('ACTIVE_CAMERAS'):
        env_c = os.environ.get('ACTIVE_CAMERAS')
        if env_c.strip().lower() == 'all':
            selected_cameras = list(range(1, len(NVR_CHANNELS) + 1))
        else:
            for part in env_c.split(','):
                part = part.strip()
                if part.isdigit() and 1 <= int(part) <= len(NVR_CHANNELS):
                    selected_cameras.append(int(part))
    else:
        selected_cameras = [1, 2]

    selected_cameras = sorted(list(set(selected_cameras))) if selected_cameras else [1]
    logger.info(f"🎯 AI Engine initialized with Active Cameras: {selected_cameras}")

    # Try to parse source as int (webcam index)
    source = int(args.source) if args.source.isdigit() else args.source

    engine = TollAIEngine(
        source=source,
        model_path=args.model,
        show_window=not args.no_window,
        camera_ids=selected_cameras,
        port=args.port
    )
    engine.run()
