-- ============================================================
-- AI Toll & Lease Collection Monitoring System
-- MySQL Database Schema
-- ============================================================

CREATE DATABASE IF NOT EXISTS toll_monitoring
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE toll_monitoring;

-- ── Vehicle Detections ────────────────────────────────────
CREATE TABLE IF NOT EXISTS vehicle_detections (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    vehicle_type    VARCHAR(50)   NOT NULL DEFAULT 'Unknown'
                    COMMENT 'Bike, CNG, Auto, Pickup, Bus, Truck, Lorry',
    plate_number    VARCHAR(30)   NOT NULL DEFAULT ''
                    COMMENT 'Detected number plate text',
    image_path      VARCHAR(512)  NOT NULL DEFAULT ''
                    COMMENT 'Path to saved vehicle image',
    camera_id       TINYINT       NOT NULL DEFAULT 1
                    COMMENT 'Camera identifier (1 or 2)',
    entry_time      DATETIME      NOT NULL
                    COMMENT 'Timestamp of vehicle detection',
    confidence      DECIMAL(5,2)  NOT NULL DEFAULT 0.00
                    COMMENT 'YOLO detection confidence 0-100',
    toll_amount     DECIMAL(8,2)  NOT NULL DEFAULT 0.00
                    COMMENT 'Toll fee in BDT',
    plate_conf      DECIMAL(5,2)  NOT NULL DEFAULT 0.00
                    COMMENT 'OCR plate recognition confidence 0-100',
    lane            VARCHAR(20)   DEFAULT NULL
                    COMMENT 'Toll lane identifier',
    status          ENUM('verified','manual_check','flagged')
                    DEFAULT 'verified',
    created_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_entry_time   (entry_time),
    INDEX idx_vehicle_type (vehicle_type),
    INDEX idx_plate        (plate_number),
    INDEX idx_camera       (camera_id),
    INDEX idx_status       (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='AI-detected vehicle records with toll and plate data';

-- ── Toll Rates ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS toll_rates (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    vehicle_type    VARCHAR(50)   NOT NULL UNIQUE,
    rate_amount     DECIMAL(8,2)  NOT NULL DEFAULT 0.00,
    effective_from  DATE          NOT NULL,
    updated_by      VARCHAR(100)  DEFAULT 'System',
    updated_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Default rates
INSERT IGNORE INTO toll_rates (vehicle_type, rate_amount, effective_from, updated_by) VALUES
  ('Bike',   5.00,  '2025-01-01', 'BRTA'),
  ('CNG',    10.00, '2025-01-01', 'BRTA'),
  ('Auto',   10.00, '2025-01-01', 'BRTA'),
  ('Pickup', 20.00, '2025-01-01', 'BRTA'),
  ('Bus',    50.00, '2025-01-01', 'BRTA'),
  ('Truck',  50.00, '2025-01-01', 'BRTA'),
  ('Lorry',  60.00, '2025-01-01', 'BRTA');

-- ── Fraud Reports ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fraud_reports (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    report_date     DATE          NOT NULL,
    vehicle_type    VARCHAR(50),
    operator_count  INT           DEFAULT 0
                    COMMENT 'Count as reported by human operator',
    ai_count        INT           DEFAULT 0
                    COMMENT 'Count as detected by AI system',
    discrepancy     INT           GENERATED ALWAYS AS (ai_count - operator_count) STORED,
    leakage_amount  DECIMAL(10,2) DEFAULT 0.00
                    COMMENT 'BDT value of unaccounted vehicles',
    reviewed_by     VARCHAR(100)  DEFAULT NULL,
    created_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_date_type (report_date, vehicle_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Rate Change Audit Log ─────────────────────────────────
CREATE TABLE IF NOT EXISTS rate_audit_log (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    vehicle_type    VARCHAR(50)   NOT NULL,
    old_rate        DECIMAL(8,2)  NOT NULL,
    new_rate        DECIMAL(8,2)  NOT NULL,
    changed_by      VARCHAR(100)  DEFAULT 'Admin',
    changed_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
    reason          TEXT          DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Useful Views ──────────────────────────────────────────

-- Today's revenue summary
CREATE OR REPLACE VIEW v_today_summary AS
SELECT
    vehicle_type,
    COUNT(*)                                AS total_count,
    SUM(toll_amount)                        AS total_revenue,
    AVG(confidence)                         AS avg_confidence,
    MIN(entry_time)                         AS first_entry,
    MAX(entry_time)                         AS last_entry
FROM vehicle_detections
WHERE DATE(entry_time) = CURDATE()
GROUP BY vehicle_type;

-- Hourly traffic view
CREATE OR REPLACE VIEW v_hourly_traffic AS
SELECT
    HOUR(entry_time)    AS hour_of_day,
    COUNT(*)            AS vehicle_count,
    SUM(toll_amount)    AS revenue
FROM vehicle_detections
WHERE DATE(entry_time) = CURDATE()
GROUP BY HOUR(entry_time)
ORDER BY hour_of_day;

-- Camera performance view
CREATE OR REPLACE VIEW v_camera_stats AS
SELECT
    camera_id,
    COUNT(*)            AS total_detections,
    SUM(toll_amount)    AS total_revenue,
    AVG(confidence)     AS avg_confidence,
    SUM(CASE WHEN status='flagged' THEN 1 ELSE 0 END) AS flagged_count
FROM vehicle_detections
WHERE DATE(entry_time) = CURDATE()
GROUP BY camera_id;
