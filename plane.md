# AI Toll & Lease Collection Monitoring System — Implementation Plan

A full-stack demo of a government-grade AI-powered toll monitoring platform for roads, bridges, and highways. The system simulates real-time vehicle detection, ANPR, revenue calculation, and fraud detection.

---

## Proposed Changes

### Project Structure

```
tole/
├── index.html                  # Main dashboard entry point
├── assets/
│   ├── css/
│   │   └── style.css           # Custom dark-theme government styles
│   ├── js/
│   │   ├── app.js              # Core app logic, routing, navigation
│   │   ├── data-generator.js   # Generates 1000 sample vehicle records
│   │   ├── dashboard.js        # Stats counters + animations
│   │   ├── charts.js           # Chart.js revenue & traffic charts
│   │   ├── detection-table.js  # Live vehicle detection table feed
│   │   ├── fraud.js            # Fraud detection comparison module
│   │   ├── rates.js            # Vehicle rate management (CRUD)
│   │   └── reports.js          # Report generation + PDF/Excel export
│   └── img/
│       └── vehicles/           # Sample vehicle images (generated)
├── pages/
│   ├── live-feed.html          # Camera feed simulation page
│   ├── reports.html            # Reports module
│   └── rates.html              # Vehicle rates management
└── python/
    ├── ai_engine.py            # Main Python YOLO+OCR+OpenCV engine
    ├── demo_data_generator.py  # MySQL record generator (1000 records)
    └── requirements.txt        # Python dependencies
```

---

### Component Plan

#### 1. Dashboard Shell (`index.html`)
- Dark sidebar navigation with icons (Bootstrap Icons)
- Top header bar with clock, user info, system status badge
- Section views loaded dynamically via JS (SPA-style)
- Responsive layout (mobile-friendly)

#### 2. Statistics Cards
- Animated counter cards: Total Vehicles, Total Revenue, Bikes, Buses, Trucks, Fraud Alerts
- Each card has a Bootstrap Icon, gradient background, and pulse animation

#### 3. Live Camera Feed Section
- Two simulated camera feeds with vehicle image cycling
- Camera status badge (LIVE / OFFLINE)
- Detection overlay showing plate + vehicle type on each frame

#### 4. Vehicle Detection Table
- Auto-refreshing table (every 2–3 seconds) with new rows inserted at top
- Columns: Vehicle Image thumbnail, Vehicle Type, Number Plate, Detection Time, Toll Rate, Amount
- Plate format: `Dhaka Metro Ga-11-XXXX`
- Color-coded vehicle type badges

#### 5. Revenue Analytics (Chart.js)
- **Doughnut chart**: Vehicle Type Distribution
- **Bar chart**: Hourly Traffic Analysis (24h)
- **Line chart**: Revenue Trend (today vs yesterday)

#### 6. Fraud Detection Module
- Side-by-side comparison table: Operator Report vs AI Count
- Red warning card: "Possible Revenue Leakage Detected"
- Per-vehicle discrepancy with percentage deviation
- Total leakage amount calculation

#### 7. Vehicle Rates Management
- Admin-editable rate card table
- Inline edit with Save button
- Rate change history log

#### 8. Reports Module
- Date range picker (Daily / Weekly / Monthly)
- Summary table
- Export to PDF (jsPDF) and Excel (SheetJS)

---

### Python AI Engine (`python/ai_engine.py`)

- **OpenCV**: Video stream capture
- **YOLOv8** (Ultralytics): Vehicle detection & classification
- **EasyOCR**: Number plate text extraction
- **MySQL connector**: Insert records to DB

**MySQL Schema:**
```sql
CREATE TABLE vehicle_detections (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vehicle_type VARCHAR(50),
  plate_number VARCHAR(30),
  image_path VARCHAR(255),
  camera_id TINYINT,
  entry_time DATETIME,
  confidence DECIMAL(5,2),
  toll_amount DECIMAL(8,2)
);
```

---

### Demo Data Generator (`python/demo_data_generator.py`)

Generates **1,130 records** with realistic distribution:

| Vehicle Type | Count |
|---|---|
| Bike | 650 |
| CNG | 180 |
| Auto | 120 |
| Pickup | 80 |
| Bus | 60 |
| Truck | 40 |
| **Total** | **1,130** |

Auto-calculates revenue using rate table.

---

### Toll Rates

| Vehicle | Rate (Tk) |
|---|---|
| Bike | 5 |
| CNG | 10 |
| Auto | 10 |
| Pickup | 20 |
| Bus | 50 |
| Truck | 50 |
| Lorry | 60 |

---

## UI Theme

| Element | Value |
|---|---|
| Primary Color | `#1a56db` (Royal Blue) |
| Sidebar | `#0f172a` (Dark Navy) |
| Background | `#0f172a` / `#1e293b` |
| Cards | `#1e293b` with glassmorphism borders |
| Success | `#10b981` (Emerald Green) |
| Danger/Fraud | `#ef4444` (Red) |
| Font | Inter (Google Fonts) |

---

## Libraries (CDN, no install needed)

| Library | Purpose |
|---|---|
| Bootstrap 5.3 | Layout, components |
| Bootstrap Icons | Icons |
| Chart.js 4 | Revenue & traffic charts |
| jsPDF + AutoTable | PDF export |
| SheetJS (xlsx) | Excel export |
| Google Fonts (Inter) | Typography |

---

## Open Questions

> [!IMPORTANT]
> **No open questions** — all requirements are clearly specified. Proceeding with full implementation immediately upon approval.

---

## Verification Plan

### Manual Verification
- Open `index.html` in browser (no server needed — pure client-side)
- Confirm all 6 dashboard sections render correctly
- Verify chart animations, counter animations, live feed cycling
- Test fraud detection comparison module
- Test rate management edit/save
- Test PDF and Excel export buttons
- Confirm mobile responsiveness

### Python Script
- Run `python/ai_engine.py` (requires YOLO model + camera)
- Run `python/demo_data_generator.py` to seed MySQL DB
