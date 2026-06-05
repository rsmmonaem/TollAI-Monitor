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

import cv2
import easyocr
import mysql.connector
import urllib.request
import numpy as np
import os
import re
import time
import argparse
import logging
from datetime import datetime
from pathlib import Path
from ultralytics import YOLO

# ─────────────────────────────────────────────────────────────
# CONFIGURATION
# ─────────────────────────────────────────────────────────────

DB_CONFIG = {
    'host':     'localhost',
    'port':     3306,
    'database': 'toll_monitoring',
    'user':     'root',
    'password': ''
}

# Output directory for saved vehicle images
OUTPUT_DIR = Path('captured_vehicles')
OUTPUT_DIR.mkdir(exist_ok=True)

# Camera ID (change per deployment)
CAMERA_ID = 1

# Confidence threshold for YOLO detections
YOLO_CONF_THRESHOLD = 0.45

# Detection cooldown per plate (seconds) — prevents duplicate entries
PLATE_COOLDOWN = 8

# YOLO vehicle class IDs (COCO dataset)
VEHICLE_CLASS_IDS = {
    2:  'Car',
    3:  'Bike',    # motorcycle
    5:  'Bus',
    7:  'Truck',
}

# Custom class mapping (if using custom YOLO model)
CUSTOM_CLASS_MAP = {
    'motorcycle': 'Bike',
    'bike':       'Bike',
    'bicycle':    'Bike',
    'cng':        'CNG',
    'auto':       'Auto',
    'auto-rickshaw': 'Auto',
    'pickup':     'Pickup',
    'bus':        'Bus',
    'truck':      'Truck',
    'lorry':      'Lorry',
    'covered-van':'Covered Van',
    'car':        'Car',
}

# Toll rates (BDT)
TOLL_RATES = {
    'Bike':        5,
    'CNG':        10,
    'Auto':       10,
    'Pickup':     20,
    'Bus':        50,
    'Truck':      50,
    'Lorry':      60,
    'Covered Van':40,
    'Car':        20,
    'Unknown':     0,
}

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
                for v_type, rate_val in rows:
                    TOLL_RATES[v_type] = int(rate_val)
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

def classify_vehicle(yolo_class_name: str, yolo_class_id: int) -> str:
    """Map YOLO class to toll system vehicle category."""
    # Try custom map first (case-insensitive)
    name_lower = yolo_class_name.lower()
    for key, val in CUSTOM_CLASS_MAP.items():
        if key in name_lower:
            return val

    # Fall back to COCO class IDs
    return VEHICLE_CLASS_IDS.get(yolo_class_id, 'Unknown')


# ─────────────────────────────────────────────────────────────
# VISUALIZATION HELPERS
# ─────────────────────────────────────────────────────────────

COLORS = {
    'Bike':   (130, 102, 99),
    'CNG':    (50, 205, 50),
    'Auto':   (0, 190, 230),
    'Pickup': (0, 215, 255),
    'Bus':    (255, 165, 0),
    'Truck':  (71, 68, 239),
    'Lorry':  (200, 100, 255),
    'Car':    (128, 192, 255),
    'Unknown':(150, 150, 150),
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


def draw_hud(frame, fps: float, total_today: int, total_revenue: int):
    """Draw heads-up display overlay on frame."""
    h, w = frame.shape[:2]

    # Dark banner at top
    overlay = frame.copy()
    cv2.rectangle(overlay, (0, 0), (w, 50), (15, 20, 35), -1)
    cv2.addWeighted(overlay, 0.7, frame, 0.3, 0, frame)

    cv2.putText(frame, f"AI TOLL MONITORING | CAM-{CAMERA_ID} | FPS: {fps:.1f}",
                (10, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (200, 200, 255), 1)

    ts = datetime.now().strftime('%Y-%m-%d  %H:%M:%S')
    cv2.putText(frame, ts, (10, 38),
                cv2.FONT_HERSHEY_SIMPLEX, 0.48, (150, 200, 150), 1)

    # Stats on right
    stats = f"Today: {total_today}  Revenue: {total_revenue:,} Tk"
    (sw, _), _ = cv2.getTextSize(stats, cv2.FONT_HERSHEY_SIMPLEX, 0.48, 1)
    cv2.putText(frame, stats, (w - sw - 10, 18),
                cv2.FONT_HERSHEY_SIMPLEX, 0.48, (100, 255, 150), 1)

    # Recording indicator
    cv2.circle(frame, (w - 15, 38), 5, (0, 0, 255), -1)
    cv2.putText(frame, "REC", (w - 50, 42),
                cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0, 0, 255), 1)


# ─────────────────────────────────────────────────────────────
# MAIN ENGINE
# ─────────────────────────────────────────────────────────────

class TollAIEngine:
    def __init__(self, source, model_path: str = 'yolov8n.pt', show_window: bool = True):
        self.source = source
        self.show_window = show_window
        self.port = int(os.environ.get('PORT', 5001))

        # Load YOLO model
        logger.info(f"Loading YOLO model: {model_path}")
        self.model = YOLO(model_path)

        # EasyOCR reader (Bengali + English)
        logger.info("Initializing EasyOCR (bn, en)...")
        self.ocr = easyocr.Reader(['bn', 'en'], gpu=False, verbose=False)

        # Database
        self.conn = get_db_connection()
        if self.conn:
            init_database(self.conn)
            load_db_toll_rates(self.conn)

        # State
        self.plate_last_seen: dict[str, float] = {}
        self.total_today = 0
        self.total_revenue = 0
        self.fps_counter = 0
        self.fps_start = time.time()
        self.current_fps = 0.0

    def _is_duplicate(self, plate: str) -> bool:
        """Check if this plate was seen recently (cooldown window)."""
        now = time.time()
        if plate in self.plate_last_seen:
            if now - self.plate_last_seen[plate] < PLATE_COOLDOWN:
                return True
        self.plate_last_seen[plate] = now
        return False

    def _save_image(self, frame: np.ndarray, vehicle_type: str, plate: str, camera_id: int) -> str:
        """Save the captured vehicle frame to disk."""
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S_%f')[:19]
        safe_plate = re.sub(r'[^\w]', '_', plate) if plate else 'unknown'
        filename = f"{vehicle_type}_{safe_plate}_{timestamp}_CAM{camera_id}.jpg"
        path = OUTPUT_DIR / filename
        cv2.imwrite(str(path), frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
        return str(path)

    def _process_frame(self, frame: np.ndarray, camera_id: int):
        """Run YOLO detection + OCR on a single frame."""
        results = self.model(frame, conf=YOLO_CONF_THRESHOLD, verbose=False)[0]

        for det in results.boxes:
            # Vehicle classification
            cls_id   = int(det.cls[0])
            cls_name = self.model.names[cls_id]
            conf     = float(det.conf[0])
            bbox     = det.xyxy[0].tolist()

            vehicle_type = classify_vehicle(cls_name, cls_id)
            if vehicle_type == 'Unknown':
                continue  # Skip non-vehicle detections

            # Extract plate ROI & run OCR
            plate_roi = extract_plate_region(frame, bbox)
            plate_text = ''
            plate_conf = 0.0

            if plate_roi is not None:
                processed_roi = preprocess_plate_roi(plate_roi)
                try:
                    ocr_results = self.ocr.readtext(processed_roi, detail=1)
                    if ocr_results:
                        # Take highest-confidence result
                        best = max(ocr_results, key=lambda r: r[2])
                        raw = best[1]
                        plate_conf = float(best[2]) * 100
                        plate_text = clean_plate_text(raw)
                except Exception as e:
                    logger.warning(f"OCR error: {e}")

            if not plate_text:
                plate_text = f"UNKNOWN-{int(time.time()) % 9999}"

            # Duplicate check
            if self._is_duplicate(plate_text):
                continue

            # Save image
            img_path = self._save_image(frame, vehicle_type, plate_text, camera_id)

            # Toll calculation
            toll = TOLL_RATES.get(vehicle_type, 0)
            status = 'verified' if conf > 0.75 else 'manual_check'

            # Database insert
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

            if self.conn and self.conn.is_connected():
                rec_id = insert_detection(self.conn, record)
                logger.info(f"[#{rec_id}] {vehicle_type:10} | Plate: {plate_text:20} | "
                            f"Conf: {conf:.1%} | Toll: {toll}Tk | {img_path}")
            else:
                logger.warning(f"DB offline — {vehicle_type} | {plate_text} | Toll: {toll}Tk")

            # Draw on frame
            draw_detection(frame, bbox, vehicle_type, plate_text, conf, toll)

            # Update stats
            self.total_today += 1
            self.total_revenue += toll

        return frame

    def _update_fps(self):
        self.fps_counter += 1
        elapsed = time.time() - self.fps_start
        if elapsed >= 1.0:
            self.current_fps = self.fps_counter / elapsed
            self.fps_counter = 0
            self.fps_start = time.time()

    def run(self):
        """Main processing loop."""
        cap = cv2.VideoCapture(self.source)

        if not cap.isOpened():
            logger.error(f"❌ Cannot open source: {self.source}")
            return

        # Get source properties
        src_fps = cap.get(cv2.CAP_PROP_FPS) or 30
        width   = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height  = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        logger.info(f"📹 Source: {self.source} | {width}x{height} @ {src_fps:.1f} FPS")

        frame_skip = max(1, int(src_fps / 10))  # Process ~10 frames/sec
        frame_num  = 0

        logger.info("🚀 AI Engine running. Press Q to quit.")

        try:
            while True:
                # 1. Check for uploaded raw webcam frames first (supporting both cameras)
                webcam_processed = False
                for cam_id in [1, 2]:
                    raw_frame = None
                    try:
                        req = urllib.request.Request(f"http://localhost:{self.port}/api/camera/{cam_id}/raw_download")
                        with urllib.request.urlopen(req, timeout=0.1) as res:
                            img_bytes = res.read()
                            if img_bytes:
                                nparr = np.frombuffer(img_bytes, np.uint8)
                                raw_frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                    except Exception:
                        pass

                    if raw_frame is not None:
                        # Process webcam frame for this camera
                        processed = self._process_frame(raw_frame, cam_id)
                        
                        # Post processed frame back to Flask
                        try:
                            _, jpeg = cv2.imencode('.jpg', processed)
                            post_req = urllib.request.Request(
                                f"http://localhost:{self.port}/api/camera/{cam_id}/frame",
                                data=jpeg.tobytes(),
                                headers={'Content-Type': 'image/jpeg'}
                            )
                            with urllib.request.urlopen(post_req, timeout=0.03) as res:
                                res.read()
                        except Exception as e:
                            logger.warning(f"Error posting webcam frame for camera {cam_id}: {e}")
                        
                        webcam_processed = True

                if webcam_processed:
                    # If we processed webcam frame(s), sleep a bit to regulate rate and skip the video loop tick
                    time.sleep(0.1)
                    continue

                # 2. Default: Process video stream frame
                ret, frame = cap.read()
                if not ret:
                    if isinstance(self.source, str) and not str(self.source).isdigit():
                        logger.info("Stream ended. Looping video source.")
                        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                        ret, frame = cap.read()
                        if not ret:
                            break
                    else:
                        logger.info("Stream ended.")
                        break

                frame_num += 1

                # Skip frames to maintain performance
                if frame_num % frame_skip != 0:
                    if self.show_window:
                        cv2.imshow('AI Toll Monitor', frame)
                    continue

                # Process
                frame = self._process_frame(frame, CAMERA_ID)

                # HUD
                self._update_fps()
                draw_hud(frame, self.current_fps, self.total_today, self.total_revenue)

                # Post live annotated frame to Flask web server for streaming
                try:
                    _, jpeg = cv2.imencode('.jpg', frame)
                    req = urllib.request.Request(
                        f"http://localhost:{self.port}/api/camera/{CAMERA_ID}/frame",
                        data=jpeg.tobytes(),
                        headers={'Content-Type': 'image/jpeg'}
                    )
                    with urllib.request.urlopen(req, timeout=0.03) as res:
                        res.read()
                    if not getattr(self, 'stream_connected', False):
                        self.stream_connected = True
                        logger.info("📡 Live video streaming connected to Flask server successfully!")
                except Exception as e:
                    if getattr(self, 'stream_connected', False):
                        self.stream_connected = False
                        logger.warning(f"📡 Live video stream disconnected: {e}")

                # Display
                if self.show_window:
                    cv2.imshow(f'AI Toll Monitor — CAM {CAMERA_ID}', frame)
                    key = cv2.waitKey(1) & 0xFF
                    if key == ord('q') or key == 27:
                        break

        except KeyboardInterrupt:
            logger.info("Stopped by user")
        finally:
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
    parser.add_argument('--model',   type=str, default='yolov8n.pt',
                        help='YOLO model path (default: yolov8n.pt)')
    parser.add_argument('--camera-id', type=int, default=1,
                        help='Camera ID for database records (default: 1)')
    parser.add_argument('--no-window', action='store_true',
                        help='Run headless (no display window)')
    args = parser.parse_args()

    CAMERA_ID = args.camera_id

    # Try to parse source as int (webcam index)
    source = int(args.source) if args.source.isdigit() else args.source

    engine = TollAIEngine(
        source=source,
        model_path=args.model,
        show_window=not args.no_window
    )
    engine.run()
