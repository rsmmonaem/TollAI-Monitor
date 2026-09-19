import os
import sqlite3
import re
import logging
import time
from decimal import Decimal
from datetime import datetime, timedelta
from pathlib import Path

# Register Decimal adapter for SQLite
sqlite3.register_adapter(Decimal, lambda d: float(d))

# Try to import mysql.connector
try:
    import mysql.connector
    MYSQL_AVAILABLE = True
except ImportError:
    MYSQL_AVAILABLE = False

# Configuration path setup
sys_path = os.path.dirname(os.path.abspath(__file__))
import sys
if sys_path not in sys.path:
    sys.path.append(sys_path)

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

logger = logging.getLogger('DBAdapter')

# MySQL backoff tracking
_mysql_last_attempt = 0
_mysql_retry_interval = 60  # seconds
_mysql_failure_logged = False
_sqlite_schema_initialized = False

# SQLite custom functions for MySQL compatibility
def _sqlite_subdate(date_val, days):
    if not date_val:
        return None
    try:
        days = int(days)
        if isinstance(date_val, str):
            clean = date_val.split('.')[0]
            if len(clean) == 10:
                dt = datetime.strptime(clean, '%Y-%m-%d')
                return (dt - timedelta(days=days)).strftime('%Y-%m-%d')
            elif 'T' in clean:
                dt = datetime.fromisoformat(clean)
                return (dt - timedelta(days=days)).strftime('%Y-%m-%d')
            else:
                dt = datetime.strptime(clean, '%Y-%m-%d %H:%M:%S')
                return (dt - timedelta(days=days)).strftime('%Y-%m-%d %H:%M:%S')
        elif hasattr(date_val, 'strftime'):
            return (date_val - timedelta(days=days)).strftime('%Y-%m-%d')
    except Exception:
        pass
    return str(date_val)

def _sqlite_date_format(val, fmt):
    if not val:
        return ''
    try:
        if isinstance(val, str):
            clean = val.split('.')[0]
            if len(clean) == 10:
                dt = datetime.strptime(clean, '%Y-%m-%d')
            elif 'T' in clean:
                dt = datetime.fromisoformat(clean)
            else:
                dt = datetime.strptime(clean, '%Y-%m-%d %H:%M:%S')
        else:
            dt = val
            
        replacements = {
            '%Y': '%Y', '%y': '%y',
            '%m': '%m', '%c': '%m',
            '%d': '%d', '%e': '%d',
            '%H': '%H', '%k': '%H',
            '%h': '%I', '%I': '%I', '%l': '%I',
            '%i': '%M',
            '%s': '%S', '%S': '%S',
            '%p': '%p',
            '%r': '%I:%M:%S %p',
            '%T': '%H:%M:%S'
        }
        py_fmt = fmt
        for k, v in replacements.items():
            py_fmt = py_fmt.replace(k, v)
        return dt.strftime(py_fmt)
    except Exception:
        return str(val)

def _sqlite_now():
    return datetime.now().strftime('%Y-%m-%d %H:%M:%S')

def _sqlite_curdate():
    return datetime.now().strftime('%Y-%m-%d')

def _sqlite_date(val):
    if not val:
        return None
    return str(val)[:10]

# SQLite row factory to return dictionaries
def dict_factory(cursor, row):
    d = {}
    for idx, col in enumerate(cursor.description):
        d[col[0]] = row[idx]
    return d

def _clean_param(v):
    if isinstance(v, Decimal):
        return float(v)
    return v

def _clean_params(params):
    if isinstance(params, dict):
        return {k: _clean_param(v) for k, v in params.items()}
    elif isinstance(params, (list, tuple)):
        return tuple(_clean_param(v) for v in params)
    return params

class SQLiteCursorWrapper:
    def __init__(self, sqlite_cursor):
        self.cursor = sqlite_cursor

    def execute(self, query, params=None):
        translated_query = self._translate_query(query)
        try:
            if params is not None:
                cleaned = _clean_params(params)
                self.cursor.execute(translated_query, cleaned)
            else:
                self.cursor.execute(translated_query)
        except Exception as e:
            logger.error(f"SQLite execute failed:\nQuery: {translated_query}\nParams: {params}\nError: {e}")
            raise e

    def executemany(self, query, params_list):
        translated_query = self._translate_query(query)
        try:
            cleaned_list = [_clean_params(p) for p in params_list]
            self.cursor.executemany(translated_query, cleaned_list)
        except Exception as e:
            logger.error(f"SQLite executemany failed:\nQuery: {translated_query}\nError: {e}")
            raise e

    def fetchone(self):
        return self.cursor.fetchone()

    def fetchall(self):
        return self.cursor.fetchall()

    def close(self):
        self.cursor.close()

    @property
    def lastrowid(self):
        return self.cursor.lastrowid

    def _translate_query(self, query):
        q = query
        
        # 1. Translate named placeholders %(name)s -> :name
        q = re.sub(r'%\(([^)]+)\)s', r':\1', q)
        
        # 2. Translate positional placeholders %s -> ?
        q = q.replace('%s', '?')
        
        # 3. MySQL schema compatibility adjustments for SQLite
        q = re.sub(r'ENGINE=InnoDB', '', q, flags=re.IGNORECASE)
        q = re.sub(r'DEFAULT CHARSET=\w+', '', q, flags=re.IGNORECASE)
        q = re.sub(r'CHARACTER SET \w+ COLLATE \w+', '', q, flags=re.IGNORECASE)
        q = re.sub(r'COMMENT\s*\'[^\']*\'', '', q, flags=re.IGNORECASE)
        
        # SQLite integer autoincrement format
        q = re.sub(r'INT AUTO_INCREMENT PRIMARY KEY', 'INTEGER PRIMARY KEY AUTOINCREMENT', q, flags=re.IGNORECASE)
        q = re.sub(r'TINYINT', 'INTEGER', q, flags=re.IGNORECASE)
        q = re.sub(r'ENUM\([^)]+\)', 'TEXT', q, flags=re.IGNORECASE)
        q = re.sub(r'UNIQUE\s+KEY(\s+\w+)?\s*(\([^)]+\))', r'UNIQUE \2', q, flags=re.IGNORECASE)
        
        # Remove MySQL Index declarations inside CREATE TABLE (SQLite creates indexes separately)
        if "CREATE TABLE" in q:
            q = re.sub(r'INDEX\s+\w+\s*\([^)]+\),?', '', q, flags=re.IGNORECASE)
            q = re.sub(r',\s*\)', ')', q)
            q = re.sub(r'COMMENT\s*=[^;\n]+', '', q, flags=re.IGNORECASE)
            
        # 4. Translate date/time functions (compound before single replacements)
        q = re.sub(r'SUBDATE\(\s*CURDATE\(\)\s*,\s*(\d+)\s*\)', r"date('now', 'localtime', '-\1 day')", q, flags=re.IGNORECASE)
        q = re.sub(r'SUBDATE\(\s*date\([^)]+\)\s*,\s*(\d+)\s*\)', r"date('now', 'localtime', '-\1 day')", q, flags=re.IGNORECASE)
        q = q.replace('CURDATE()', "date('now', 'localtime')")
        q = q.replace('DATE(entry_time)', "date(entry_time)")
        q = q.replace('HOUR(entry_time)', "cast(strftime('%H', entry_time) as integer)")
        q = re.sub(r'DATE_SUB\(NOW\(\),\s*INTERVAL\s+(\?|:\w+|\d+)\s+DAY\)', r"datetime('now', 'localtime', '-' || \1 || ' days')", q, flags=re.IGNORECASE)
        q = re.sub(r'DATE_SUB\(NOW\(\),\s*INTERVAL\s+(\?|:\w+|\d+)\s+HOUR\)', r"datetime('now', 'localtime', '-' || \1 || ' hours')", q, flags=re.IGNORECASE)
        q = re.sub(r'NOW\(\)\s*-\s*INTERVAL\s+(\?|:\w+|\d+)\s+SECOND', r"datetime('now', 'localtime', '-' || \1 || ' seconds')", q, flags=re.IGNORECASE)
        q = re.sub(r'NOW\(\)', "datetime('now', 'localtime')", q, flags=re.IGNORECASE)
        
        # 5. ON DUPLICATE KEY UPDATE -> ON CONFLICT
        if 'ON DUPLICATE KEY UPDATE' in q:
            q = re.sub(
                r'ON DUPLICATE KEY UPDATE\s+rate_amount\s*=\s*(:rate_amount|\?),?\s*updated_by\s*=\s*[\'"]Admin[\'"]',
                'ON CONFLICT(vehicle_type) DO UPDATE SET rate_amount=excluded.rate_amount, updated_by=excluded.updated_by',
                q,
                flags=re.IGNORECASE
            )
            
        # 6. INSERT IGNORE -> INSERT OR IGNORE
        q = re.sub(r'INSERT\s+IGNORE\s+INTO', 'INSERT OR IGNORE INTO', q, flags=re.IGNORECASE)

        # 7. SQLite doesn't support SHOW TABLES LIKE
        if "SHOW TABLES LIKE" in q:
            table_match = re.search(r"LIKE\s+'([^']+)'", q, flags=re.IGNORECASE)
            if table_match:
                table_name = table_match.group(1)
                q = f"SELECT name FROM sqlite_master WHERE type='table' AND name='{table_name}'"

        return q

class SQLiteConnectionWrapper:
    def __init__(self, conn):
        self.conn = conn
        self.conn.row_factory = dict_factory
        # Register custom MySQL-compatible functions
        self.conn.create_function("SUBDATE", 2, _sqlite_subdate)
        self.conn.create_function("DATE_SUB", 2, _sqlite_subdate)
        self.conn.create_function("DATE_FORMAT", 2, _sqlite_date_format)
        self.conn.create_function("CURDATE", 0, _sqlite_curdate)
        self.conn.create_function("NOW", 0, _sqlite_now)
        self.conn.create_function("DATE", 1, _sqlite_date)

    def cursor(self, dictionary=False):
        return SQLiteCursorWrapper(self.conn.cursor())

    def commit(self):
        self.conn.commit()

    def close(self):
        self.conn.close()

    def is_connected(self):
        return self.conn is not None

    def ping(self, reconnect=True):
        return True

def _ensure_sqlite_tables(conn):
    """Ensure essential tables exist in SQLite so API queries don't fail."""
    global _sqlite_schema_initialized
    if _sqlite_schema_initialized:
        return
    try:
        c = conn.cursor()
        c.execute("""
            CREATE TABLE IF NOT EXISTS vehicle_detections (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                vehicle_type    TEXT NOT NULL DEFAULT 'Unknown',
                plate_number    TEXT NOT NULL DEFAULT '',
                image_path      TEXT NOT NULL DEFAULT '',
                camera_id       INTEGER NOT NULL DEFAULT 1,
                entry_time      DATETIME NOT NULL,
                confidence      REAL NOT NULL DEFAULT 0.00,
                toll_amount     REAL NOT NULL DEFAULT 0.00,
                plate_conf      REAL NOT NULL DEFAULT 0.00,
                lane            TEXT DEFAULT NULL,
                status          TEXT DEFAULT 'verified',
                created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        c.execute("""
            CREATE TABLE IF NOT EXISTS fraud_reports (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                report_date     DATE NOT NULL,
                vehicle_type    TEXT,
                operator_count  INTEGER DEFAULT 0,
                ai_count        INTEGER DEFAULT 0,
                discrepancy     INTEGER DEFAULT 0,
                leakage_amount  REAL DEFAULT 0.00,
                created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (report_date, vehicle_type)
            );
        """)
        c.execute("""
            CREATE TABLE IF NOT EXISTS toll_rates (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                vehicle_type    TEXT NOT NULL UNIQUE,
                rate_amount     REAL NOT NULL DEFAULT 0.00,
                effective_from  DATE NOT NULL,
                updated_by      TEXT DEFAULT 'System',
                updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        c.execute("""
            INSERT OR IGNORE INTO toll_rates (vehicle_type, rate_amount, effective_from, updated_by) VALUES
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
        c.execute("""
            CREATE TABLE IF NOT EXISTS rate_audit_log (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                vehicle_type    TEXT NOT NULL,
                old_rate        REAL NOT NULL,
                new_rate        REAL NOT NULL,
                changed_by      TEXT DEFAULT 'Admin',
                changed_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                reason          TEXT DEFAULT NULL
            );
        """)
        # Create indexes
        c.execute("CREATE INDEX IF NOT EXISTS idx_det_entry_time ON vehicle_detections(entry_time);")
        c.execute("CREATE INDEX IF NOT EXISTS idx_det_camera ON vehicle_detections(camera_id);")
        conn.commit()
        c.close()
        _sqlite_schema_initialized = True
    except Exception as e:
        logger.warning(f"Failed to auto-ensure SQLite tables: {e}")

def get_db_connection():
    """Returns a connection. Tries MySQL first, falls back to SQLite."""
    global _mysql_last_attempt, _mysql_failure_logged
    now = time.time()
    
    # 1. Try MySQL if available and not in backoff cooldown
    if MYSQL_AVAILABLE and (now - _mysql_last_attempt > _mysql_retry_interval):
        try:
            from ai_engine import DB_CONFIG
            # Try to connect without DB first to ensure it exists
            config_no_db = {k: v for k, v in DB_CONFIG.items() if k != 'database'}
            conn = mysql.connector.connect(**config_no_db)
            cursor = conn.cursor()
            cursor.execute(f"CREATE DATABASE IF NOT EXISTS {DB_CONFIG['database']} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
            cursor.close()
            conn.close()

            # Connect with target database
            conn = mysql.connector.connect(**DB_CONFIG)
            _mysql_failure_logged = False
            return conn
        except Exception as e:
            _mysql_last_attempt = now
            if not _mysql_failure_logged:
                logger.info(f"MySQL unavailable ({e}). Using SQLite for data persistence.")
                _mysql_failure_logged = True
            
    # 2. SQLite fallback (for local development and Hugging Face Spaces persistence)
    db_path = Path(ROOT_DIR) / "toll_monitoring.db"
    try:
        raw_conn = sqlite3.connect(str(db_path), timeout=30.0, check_same_thread=False)
        raw_conn.execute("PRAGMA journal_mode=WAL;")
        raw_conn.execute("PRAGMA synchronous=NORMAL;")
        raw_conn.execute("PRAGMA busy_timeout=15000;")
        wrapped = SQLiteConnectionWrapper(raw_conn)
        _ensure_sqlite_tables(wrapped)
        return wrapped
    except Exception as e:
        logger.error(f"Failed to create SQLite connection: {e}")
        return None
