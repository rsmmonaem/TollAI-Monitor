import os
import sqlite3
import re
import logging
from pathlib import Path

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

# SQLite row factory to return dictionaries
def dict_factory(cursor, row):
    d = {}
    for idx, col in enumerate(cursor.description):
        d[col[0]] = row[idx]
    return d

class SQLiteCursorWrapper:
    def __init__(self, sqlite_cursor):
        self.cursor = sqlite_cursor

    def execute(self, query, params=None):
        translated_query = self._translate_query(query)
        try:
            if params is not None:
                # SQLite expects named dict parameters for :name or tuple for ?
                # If params is a dict, pass directly
                self.cursor.execute(translated_query, params)
            else:
                self.cursor.execute(translated_query)
        except Exception as e:
            logger.error(f"SQLite execute failed:\nQuery: {translated_query}\nParams: {params}\nError: {e}")
            raise e

    def executemany(self, query, params_list):
        translated_query = self._translate_query(query)
        try:
            self.cursor.executemany(translated_query, params_list)
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
        
        # Remove MySQL Index declarations inside CREATE TABLE (SQLite creates indexes separately)
        # We only remove indices inside CREATE TABLE definitions
        if "CREATE TABLE" in q:
            # Remove INDEX idx_... (col) lines
            q = re.sub(r'INDEX\s+\w+\s*\([^)]+\),?', '', q, flags=re.IGNORECASE)
            # Clean trailing commas before closing parenthesis
            q = re.sub(r',\s*\)', ')', q)
            # Remove comment comments
            q = re.sub(r'COMMENT\s*=[^;\n]+', '', q, flags=re.IGNORECASE)
            
        # 4. Translate date/time functions
        q = q.replace('CURDATE()', "date('now', 'localtime')")
        q = q.replace('SUBDATE(CURDATE(), 1)', "date('now', 'localtime', '-1 day')")
        q = q.replace('DATE(entry_time)', "date(entry_time)")
        q = q.replace('HOUR(entry_time)', "cast(strftime('%H', entry_time) as integer)")
        q = re.sub(r'DATE_SUB\(NOW\(\),\s*INTERVAL\s+(\?|:\w+|\d+)\s+DAY\)', r"datetime('now', 'localtime', '-' || \1 || ' days')", q, flags=re.IGNORECASE)
        q = re.sub(r'DATE_SUB\(NOW\(\),\s*INTERVAL\s+(\?|:\w+|\d+)\s+HOUR\)', r"datetime('now', 'localtime', '-' || \1 || ' hours')", q, flags=re.IGNORECASE)
        
        # 5. ON DUPLICATE KEY UPDATE -> ON CONFLICT
        # Specifically for toll_rates updates
        if 'ON DUPLICATE KEY UPDATE' in q:
            q = re.sub(
                r'ON DUPLICATE KEY UPDATE\s+rate_amount\s*=\s*(:rate_amount|\?),?\s*updated_by\s*=\s*[\'"]Admin[\'"]',
                'ON CONFLICT(vehicle_type) DO UPDATE SET rate_amount=excluded.rate_amount, updated_by=excluded.updated_by',
                q,
                flags=re.IGNORECASE
            )
            
        # 6. SQLite doesn't support SHOW TABLES LIKE
        if "SHOW TABLES LIKE" in q:
            # "SHOW TABLES LIKE 'toll_rates'" -> "SELECT name FROM sqlite_master WHERE type='table' AND name='toll_rates'"
            table_match = re.search(r"LIKE\s+'([^']+)'", q, flags=re.IGNORECASE)
            if table_match:
                table_name = table_match.group(1)
                q = f"SELECT name FROM sqlite_master WHERE type='table' AND name='{table_name}'"

        return q

class SQLiteConnectionWrapper:
    def __init__(self, conn):
        self.conn = conn
        self.conn.row_factory = dict_factory

    def cursor(self, dictionary=False):
        return SQLiteCursorWrapper(self.conn.cursor())

    def commit(self):
        self.conn.commit()

    def close(self):
        self.conn.close()

def get_db_connection():
    """Returns a connection. Tries MySQL first, falls back to SQLite."""
    from ai_engine import DB_CONFIG
    # 1. Try MySQL if available
    if MYSQL_AVAILABLE:
        try:
            # Try to connect without DB first to ensure it exists
            config_no_db = {k: v for k, v in DB_CONFIG.items() if k != 'database'}
            conn = mysql.connector.connect(**config_no_db)
            cursor = conn.cursor()
            cursor.execute(f"CREATE DATABASE IF NOT EXISTS {DB_CONFIG['database']} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
            cursor.close()
            conn.close()

            # Connect with target database
            conn = mysql.connector.connect(**DB_CONFIG)
            return conn
        except Exception as e:
            logger.info(f"MySQL connection failed: {e}. Falling back to SQLite.")
            
    # 2. SQLite fallback
    db_path = Path(ROOT_DIR) / "toll_monitoring.db"
    try:
        conn = sqlite3.connect(str(db_path), check_same_thread=False)
        return SQLiteConnectionWrapper(conn)
    except Exception as e:
        logger.error(f"Failed to create SQLite connection: {e}")
        return None
