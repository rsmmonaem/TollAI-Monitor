import os
from pathlib import Path

# Database Configuration
DB_CONFIG = {
    'host':     os.environ.get('DB_HOST', 'localhost'),
    'port':     int(os.environ.get('DB_PORT', 3306)),
    'database': os.environ.get('DB_NAME', 'toll_monitoring'),
    'user':     os.environ.get('DB_USER', 'root'),
    'password': os.environ.get('DB_PASSWORD', '')
}

# Output directory for saved vehicle images
OUTPUT_DIR = Path('captured_vehicles')
OUTPUT_DIR.mkdir(exist_ok=True)

# NVR Configuration and Channel Mapping (14 Channels)
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

# Default Active Camera ID
CAMERA_ID = 1

# Confidence threshold for YOLO detections
YOLO_CONF_THRESHOLD = float(os.environ.get('YOLO_CONF_THRESHOLD', 0.16))

# Detection cooldown per plate (seconds)
PLATE_COOLDOWN = int(os.environ.get('PLATE_COOLDOWN', 60))

# Stationary cooldown window (seconds)
STATIONARY_COOLDOWN = int(os.environ.get('STATIONARY_COOLDOWN', 120))

# Grid cell size for spatial deduplication
SPATIAL_GRID_CELLS = 8

# YOLO vehicle class IDs (COCO dataset)
VEHICLE_CLASS_IDS = {
    2:  'Car',
    3:  'Bike',    # motorcycle
    5:  'Bus',
    7:  'Truck',
}

# Custom class mapping for fine-tuned Bangladesh models (all 21 classes)
CUSTOM_CLASS_MAP = {
    'motorbike':  'Bike',
    'motorcycle': 'Bike',
    'scooter':    'Bike',
    'bicycle':    'Bike',
    'bike':       'Bike',
    'cng':        'CNG',
    'three wheelers (cng)': 'CNG',
    'three wheelers': 'CNG',
    'auto':          'Auto',
    'auto rickshaw': 'Auto',
    'auto-rickshaw': 'Auto',
    'rickshaw':      'Auto',
    'easybike':      'Auto',
    'wheelbarrow':   'Auto',
    'car':        'Car',
    'suv':        'Car',
    'taxi':       'Car',
    'policecar':  'Car',
    'ambulance':  'Car',
    'minivan':    'Car',
    'pickup':       'Pickup',
    'human hauler': 'Pickup',
    'covered-van': 'Covered Van',
    'covered van': 'Covered Van',
    'van':         'Covered Van',
    'garbagevan':  'Covered Van',
    'bus':     'Bus',
    'minibus': 'Bus',
    'truck':        'Truck',
    'army vehicle': 'Truck',
    'lorry':        'Lorry',
    'trailer':      'Lorry',
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
}
