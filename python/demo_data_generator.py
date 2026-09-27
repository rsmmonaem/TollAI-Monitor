#!/usr/bin/env python3
"""
AI Toll Monitoring System — Demo Data Generator
Generates 1130 realistic vehicle detection records and seeds MySQL database.

Usage:
    python demo_data_generator.py
    python demo_data_generator.py --count 2000
    python demo_data_generator.py --dry-run   # print without DB insert
"""

try:
    import mysql.connector
except ImportError:
    pass
import random
import string
import argparse
import logging
from datetime import datetime, timedelta
from decimal import Decimal

# ─────────────────────────────────────────────────────────────
# CONFIGURATION
# ─────────────────────────────────────────────────────────────

try:
    from config import DB_CONFIG
except ImportError:
    try:
        from ai_engine import DB_CONFIG
    except ImportError:
        DB_CONFIG = {
            'host':     'localhost',
            'port':     3306,
            'database': 'toll_monitoring',
            'user':     'root',
            'password': ''
        }

# Vehicle distribution (count per type)
VEHICLE_DISTRIBUTION = {
    'Bike':   650,
    'CNG':    180,
    'Auto':   120,
    'Pickup':  80,
    'Bus':     60,
    'Truck':   40,
}

# Toll rates (BDT)
TOLL_RATES = {
    'Bike':    5,
    'CNG':    10,
    'Auto':   10,
    'Pickup': 20,
    'Bus':    50,
    'Truck':  50,
    'Lorry':  60,
}

# Confidence range per vehicle type (simulates real AI accuracy)
CONFIDENCE_RANGES = {
    'Bike':   (88.0, 99.5),
    'CNG':    (90.0, 99.0),
    'Auto':   (85.0, 97.5),
    'Pickup': (92.0, 99.8),
    'Bus':    (94.0, 99.9),
    'Truck':  (93.0, 99.7),
    'Lorry':  (90.0, 99.2),
}

# Plate prefix patterns (realistic BD plates)
PLATE_PATTERNS = [
    ('Dhaka', 'Metro', ['Ga', 'Gha', 'Nga', 'Ka', 'Kha', 'Ga']),
    ('Chatt', 'Metro', ['Ka', 'Kha', 'Ga']),
    ('Sylhet', 'Metro', ['Ka', 'Ga']),
    ('Rajshahi', 'Metro', ['Ka', 'Kha']),
    ('Khulna', 'Metro', ['Ga', 'Ka']),
    ('Barishal', 'Metro', ['Ka']),
]

# Camera IDs
CAMERA_IDS = [1, 2]

# Traffic hour weights (simulates rush hours)
HOUR_WEIGHTS = {
    0: 2, 1: 1, 2: 1, 3: 1, 4: 2, 5: 4,
    6: 8, 7: 15, 8: 20, 9: 18, 10: 12, 11: 10,
    12: 9, 13: 11, 14: 12, 15: 14, 16: 18, 17: 20,
    18: 16, 19: 12, 20: 9, 21: 7, 22: 5, 23: 3
}

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(message)s', datefmt='%H:%M:%S')
logger = logging.getLogger('DataGen')


# ─────────────────────────────────────────────────────────────
# GENERATORS
# ─────────────────────────────────────────────────────────────

def generate_plate() -> str:
    """Generate a realistic Bangladeshi vehicle number plate."""
    city, area, letters = random.choice(PLATE_PATTERNS)
    letter = random.choice(letters)
    num1 = random.randint(11, 99)
    num2 = random.randint(1000, 9999)
    return f"{city} Metro {letter}-{num1}-{num2}"


def generate_datetime(days_back: int = 0) -> datetime:
    """Generate a realistic datetime with rush-hour weighting."""
    base = datetime.now() - timedelta(days=days_back)

    # Weighted random hour
    hours = list(HOUR_WEIGHTS.keys())
    weights = list(HOUR_WEIGHTS.values())
    hour = random.choices(hours, weights=weights, k=1)[0]

    minute = random.randint(0, 59)
    second = random.randint(0, 59)

    return base.replace(hour=hour, minute=minute, second=second, microsecond=0)


def generate_confidence(vehicle_type: str) -> float:
    """Generate realistic confidence score for a vehicle type."""
    lo, hi = CONFIDENCE_RANGES.get(vehicle_type, (85.0, 99.0))
    return round(random.uniform(lo, hi), 2)


def generate_image_path(vehicle_type: str, plate: str) -> str:
    """Generate a fake image path for demo records."""
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    safe_plate = plate.replace(' ', '_').replace('-', '_')
    return f"captured_vehicles/{vehicle_type}_{safe_plate}_{timestamp}.jpg"


def determine_status(confidence: float) -> str:
    """Determine record status based on confidence."""
    if confidence >= 92:
        return 'verified'
    elif confidence >= 80:
        return 'manual_check'
    else:
        return 'flagged'


def build_records(distribution: dict, days_back: int = 0) -> list[dict]:
    """Build the full list of vehicle detection records."""
    records = []
    plate_pool = set()  # Track used plates to avoid duplicates

    for vehicle_type, count in distribution.items():
        for _ in range(count):
            # Ensure unique plate
            while True:
                plate = generate_plate()
                if plate not in plate_pool:
                    plate_pool.add(plate)
                    break

            conf = generate_confidence(vehicle_type)
            toll = TOLL_RATES.get(vehicle_type, 0)

            records.append({
                'vehicle_type': vehicle_type,
                'plate_number': plate,
                'image_path':   generate_image_path(vehicle_type, plate),
                'camera_id':    random.choice(CAMERA_IDS),
                'entry_time':   generate_datetime(days_back),
                'confidence':   conf,
                'toll_amount':  Decimal(str(toll)),
                'plate_conf':   Decimal(str(round(conf * random.uniform(0.80, 1.0), 2))),
                'status':       determine_status(conf),
            })

    # Sort by entry time
    records.sort(key=lambda r: r['entry_time'])
    return records


# ─────────────────────────────────────────────────────────────
# DATABASE OPERATIONS
# ─────────────────────────────────────────────────────────────

from db_adapter import get_db_connection as get_adapter_connection

def get_connection():
    return get_adapter_connection()


def ensure_schema(conn):
    """Create tables if not exist."""
    cursor = conn.cursor()
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
            status          ENUM('verified','manual_check','flagged') DEFAULT 'verified',
            created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_entry_time (entry_time),
            INDEX idx_vehicle_type (vehicle_type),
            INDEX idx_camera (camera_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    """)
    conn.commit()
    cursor.close()


def batch_insert(conn, records: list[dict], batch_size: int = 100) -> int:
    """Insert records in batches for performance."""
    cursor = conn.cursor()
    sql = """
        INSERT INTO vehicle_detections
            (vehicle_type, plate_number, image_path, camera_id, entry_time,
             confidence, toll_amount, plate_conf, status)
        VALUES
            (%(vehicle_type)s, %(plate_number)s, %(image_path)s, %(camera_id)s,
             %(entry_time)s, %(confidence)s, %(toll_amount)s, %(plate_conf)s, %(status)s)
    """
    inserted = 0
    for i in range(0, len(records), batch_size):
        batch = records[i:i + batch_size]
        cursor.executemany(sql, batch)
        conn.commit()
        inserted += len(batch)
        logger.info(f"  ↳ Inserted {inserted}/{len(records)} records...")

    cursor.close()
    return inserted


# ─────────────────────────────────────────────────────────────
# SUMMARY PRINTING
# ─────────────────────────────────────────────────────────────

def print_summary(records: list[dict]):
    """Print a formatted summary of the generated records."""
    total_count = len(records)
    total_revenue = sum(float(r['toll_amount']) for r in records)

    by_type: dict[str, dict] = {}
    for r in records:
        t = r['vehicle_type']
        if t not in by_type:
            by_type[t] = {'count': 0, 'revenue': 0.0}
        by_type[t]['count'] += 1
        by_type[t]['revenue'] += float(r['toll_amount'])

    print("\n" + "═" * 62)
    print("  AI TOLL MONITORING SYSTEM — Demo Data Summary")
    print("═" * 62)
    print(f"  {'Vehicle Type':<14} {'Count':>8} {'Rate (৳)':>10} {'Revenue (৳)':>14}")
    print("─" * 62)
    for t, d in sorted(by_type.items(), key=lambda x: -x[1]['count']):
        rate = TOLL_RATES.get(t, 0)
        print(f"  {t:<14} {d['count']:>8,} {rate:>10} {d['revenue']:>14,.0f}")
    print("─" * 62)
    print(f"  {'TOTAL':<14} {total_count:>8,} {'—':>10} {total_revenue:>14,.0f}")
    print("═" * 62)
    print(f"\n  Camera 1: {sum(1 for r in records if r['camera_id']==1):,} vehicles")
    print(f"  Camera 2: {sum(1 for r in records if r['camera_id']==2):,} vehicles")
    print(f"\n  Verified:  {sum(1 for r in records if r['status']=='verified'):,} records")
    print(f"  Manual Check: {sum(1 for r in records if r['status']=='manual_check'):,} records")
    print(f"  Flagged:   {sum(1 for r in records if r['status']=='flagged'):,} records")
    print()


# ─────────────────────────────────────────────────────────────
# ENTRY POINT
# ─────────────────────────────────────────────────────────────

def main(argv=None):
    parser = argparse.ArgumentParser(description='AI Toll Demo Data Generator')
    parser.add_argument('--count', type=int, default=None,
                        help='Override total count (distributes proportionally)')
    parser.add_argument('--days', type=int, default=0,
                        help='Spread data over N past days (default: today only)')
    parser.add_argument('--dry-run', action='store_true',
                        help='Generate records without inserting to DB')
    parser.add_argument('--truncate', action='store_true',
                        help='Truncate existing table before inserting')
    args = parser.parse_args(argv if argv is not None else None)

    # Adjust distribution if custom count requested
    distribution = VEHICLE_DISTRIBUTION.copy()
    if args.count:
        total = sum(distribution.values())
        scale = args.count / total
        distribution = {k: max(1, int(v * scale)) for k, v in distribution.items()}

    # Generate records
    logger.info(f"Generating {sum(distribution.values())} vehicle detection records...")
    all_records = []

    if args.days > 0:
        daily_dist = {k: max(1, v // (args.days + 1)) for k, v in distribution.items()}
        for day in range(args.days + 1):
            day_records = build_records(daily_dist, days_back=day)
            all_records.extend(day_records)
    else:
        all_records = build_records(distribution, days_back=0)

    print_summary(all_records)

    if args.dry_run:
        logger.info("Dry-run mode — no database operations performed.")
        return

    # Connect and insert
    try:
        conn = get_connection()
        logger.info("✅ Connected to database")
        ensure_schema(conn)

        if args.truncate:
            cursor = conn.cursor()
            cursor.execute("TRUNCATE TABLE vehicle_detections")
            conn.commit()
            cursor.close()
            logger.info("⚠️  Table truncated")

        logger.info(f"Inserting {len(all_records)} records...")
        count = batch_insert(conn, all_records)
        logger.info(f"✅ Successfully inserted {count} records!")

        conn.close()
    except Exception as e:
        logger.error(f"❌ Database error: {e}")


if __name__ == '__main__':
    main()
