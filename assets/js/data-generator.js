/**
 * data-generator.js
 * Generates 1130 realistic vehicle detection records for demo purposes
 */

const VEHICLE_RATES = {
  'Bike':   5,
  'CNG':    10,
  'Auto':   10,
  'Pickup': 20,
  'Bus':    50,
  'Truck':  50,
  'Lorry':  60
};

const VEHICLE_DISTRIBUTION = {
  'Bike':   650,
  'CNG':    180,
  'Auto':   120,
  'Pickup': 80,
  'Bus':    60,
  'Truck':  40
};

const PLATE_PREFIXES = [
  'ঢাকা মেট্রো গ', 'ঢাকা মেট্রো ঘ', 'ঢাকা মেট্রো ঙ',
  'চট্ট মেট্রো ক', 'সিলেট মেট্রো গ', 'রাজশাহী মেট্রো খ'
];

const PLATE_PREFIXES_EN = [
  'Dhaka Metro Ga', 'Dhaka Metro Gha', 'Dhaka Metro Nga',
  'Chatt Metro Ka', 'Sylhet Metro Ga', 'Rajshahi Metro Kha'
];

const CAMERA_IDS = [1, 2];

const VEHICLE_EMOJIS = {
  'Bike': '🏍️', 'CNG': '🛺', 'Auto': '🚐',
  'Pickup': '🛻', 'Bus': '🚌', 'Truck': '🚛', 'Lorry': '🚚'
};

const VEHICLE_COLORS = {
  'Bike': 'badge-bike', 'CNG': 'badge-cng', 'Auto': 'badge-auto',
  'Pickup': 'badge-pickup', 'Bus': 'badge-bus', 'Truck': 'badge-truck', 'Lorry': 'badge-lorry'
};

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min, max, decimals = 2) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}

function generatePlate() {
  const idx = randomInt(0, PLATE_PREFIXES_EN.length - 1);
  const num1 = randomInt(11, 99);
  const num2 = randomInt(1000, 9999);
  return `${PLATE_PREFIXES_EN[idx]}-${num1}-${num2}`;
}

function generateTime(hoursAgo = 0, minutesVariance = 30) {
  const now = new Date();
  now.setHours(now.getHours() - hoursAgo);
  now.setMinutes(now.getMinutes() - randomInt(0, minutesVariance));
  return now;
}

function formatTime(date) {
  return date.toLocaleTimeString('en-BD', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function formatDateTime(date) {
  return date.toLocaleString('en-BD', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
}

/**
 * Generate all vehicle records
 */
function generateVehicleRecords() {
  const records = [];
  let id = 1;
  const now = new Date();

  Object.entries(VEHICLE_DISTRIBUTION).forEach(([type, count]) => {
    for (let i = 0; i < count; i++) {
      const hoursAgo = randomFloat(0, 10, 2);
      const entryTime = new Date(now - hoursAgo * 3600000);
      const confidence = randomFloat(88.5, 99.8, 1);

      records.push({
        id: id++,
        vehicle_type: type,
        plate_number: generatePlate(),
        camera_id: CAMERA_IDS[randomInt(0, 1)],
        entry_time: entryTime,
        confidence: confidence,
        toll_amount: VEHICLE_RATES[type],
        status: confidence > 95 ? 'Verified' : 'Manual Check'
      });
    }
  });

  // Sort by time desc
  records.sort((a, b) => b.entry_time - a.entry_time);

  // Re-number after sort
  records.forEach((r, i) => r.id = i + 1);

  return records;
}

/**
 * Calculate revenue summary from records
 */
function calcRevenueSummary(records) {
  const summary = {};
  let total = 0;

  Object.keys(VEHICLE_DISTRIBUTION).forEach(type => {
    summary[type] = { count: 0, revenue: 0 };
  });

  records.forEach(r => {
    if (summary[r.vehicle_type]) {
      summary[r.vehicle_type].count++;
      summary[r.vehicle_type].revenue += r.toll_amount;
      total += r.toll_amount;
    }
  });

  return { byType: summary, total };
}

/**
 * Generate hourly traffic data (24 hours)
 */
function generateHourlyData(records) {
  const hours = Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0, revenue: 0 }));

  records.forEach(r => {
    const h = r.entry_time.getHours();
    if (hours[h]) {
      hours[h].count++;
      hours[h].revenue += r.toll_amount;
    }
  });

  return hours;
}

/**
 * Generate yesterday's revenue trend (slightly lower for comparison)
 */
function generateYesterdayRevenue(hours) {
  return hours.map(h => ({
    ...h,
    revenue: Math.round(h.revenue * randomFloat(0.7, 0.92, 2)),
    count: Math.round(h.count * randomFloat(0.7, 0.92, 2))
  }));
}

// ── FRAUD DATA (Operator vs AI) ───────────────────────────
const FRAUD_DATA = {
  'Bike':   { operator: 500, ai: 650 },
  'CNG':    { operator: 175, ai: 180 },
  'Auto':   { operator: 118, ai: 120 },
  'Pickup': { operator: 80,  ai: 80  },
  'Bus':    { operator: 55,  ai: 60  },
  'Truck':  { operator: 38,  ai: 40  }
};

function calcFraudSummary() {
  let operatorRevenue = 0;
  let aiRevenue = 0;

  Object.entries(FRAUD_DATA).forEach(([type, d]) => {
    const rate = VEHICLE_RATES[type];
    operatorRevenue += d.operator * rate;
    aiRevenue += d.ai * rate;
  });

  return {
    data: FRAUD_DATA,
    operatorRevenue,
    aiRevenue,
    leakage: aiRevenue - operatorRevenue
  };
}

// Export globally
window.AppData = {
  records: null,
  revenue: null,
  hourly: null,
  yesterdayHourly: null,
  fraud: null,
  rates: { ...VEHICLE_RATES },
  isBackend: false,

  async init() {
    try {
      const resp = await fetch('/api/config');
      if (resp.ok) {
        const config = await resp.json();
        this.isBackend = true;
        this.config = config;
        this.cameras = config.cameras || [];
        this.activeAiCameras = config.active_ai_cameras || [1, 2];
        await this.loadFromBackend();
        const dbStatusText = config.db_status === 'connected' ? 'MySQL Live' : 'Mock Fallback (DB Offline)';
        console.log(`[DataGen] Integrated with Backend API (${dbStatusText}). Loaded ${this.records.length} records. Found ${this.cameras.length} cameras.`);
        
        // Show inline banner in document if backend database is offline
        if (config.db_status === 'fallback') {
          setTimeout(() => {
            if (window.App && window.App.toast) {
              window.App.toast('⚠️ Backend database offline — running in API mock fallback mode', 'info');
            }
          }, 2000);
        }
        return;
      }
    } catch (e) {
      console.log('[DataGen] Backend API not reachable. Using client-side mock data.');
    }

    // Client-side fallback (Disabled demo data)
    this.isBackend = false;
    this.records = [];
    this.revenue = { byType: {}, total: 0 };
    this.hourly = Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0, revenue: 0 }));
    this.yesterdayHourly = Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0, revenue: 0 }));
    this.fraud = { data: {}, operatorRevenue: 0, aiRevenue: 0, leakage: 0 };
    this.cameras = [
      { id: 1, name: 'Camera 1 (Ch 101 - Toll Lane A)', lane: 'Toll Lane A (Inbound)', channel: '101', ai_enabled: true },
      { id: 2, name: 'Camera 2 (Ch 201 - Toll Lane B)', lane: 'Toll Lane B (Outbound)', channel: '201', ai_enabled: false },
      { id: 3, name: 'Camera 3 (Ch 301 - Lane C Entry)', lane: 'Toll Lane C (Inbound)', channel: '301', ai_enabled: false },
      { id: 4, name: 'Camera 4 (Ch 401 - Lane D Exit)', lane: 'Toll Lane D (Outbound)', channel: '401', ai_enabled: false },
      { id: 5, name: 'Camera 5 (Ch 501 - Plaza Approach)', lane: 'Plaza Approach North', channel: '501', ai_enabled: false },
      { id: 6, name: 'Camera 6 (Ch 601 - Plaza Departure)', lane: 'Plaza Departure South', channel: '601', ai_enabled: false },
      { id: 7, name: 'Camera 7 (Ch 701 - Heavy Vehicle Lane)', lane: 'Heavy Vehicle Lane', channel: '701', ai_enabled: false },
      { id: 8, name: 'Camera 8 (Ch 801 - FastPass / ETC 1)', lane: 'ETC FastPass Lane 1', channel: '801', ai_enabled: false },
      { id: 9, name: 'Camera 9 (Ch 901 - FastPass / ETC 2)', lane: 'ETC FastPass Lane 2', channel: '901', ai_enabled: false },
      { id: 10, name: 'Camera 10 (Ch 1001 - Weighbridge A)', lane: 'Weighbridge Lane 1', channel: '1001', ai_enabled: false },
      { id: 11, name: 'Camera 11 (Ch 1101 - Booth 1 Cabin)', lane: 'Toll Booth 1', channel: '1101', ai_enabled: false },
      { id: 12, name: 'Camera 12 (Ch 1201 - Booth 2 Cabin)', lane: 'Toll Booth 2', channel: '1201', ai_enabled: false },
      { id: 13, name: 'Camera 13 (Ch 1301 - Plaza Overview)', lane: 'Main Plaza Yard', channel: '1301', ai_enabled: false },
      { id: 14, name: 'Camera 14 (Ch 1501 - Perimeter Security)', lane: 'Perimeter Guard Post', channel: '1501', ai_enabled: false },
    ];
    console.log('[DataGen] Client-side fallback active. Mock data disabled.');
  },

  async loadFromBackend() {
    try {
      this.rates = await (await fetch('/api/rates')).json();
      Object.assign(this.VEHICLE_RATES, this.rates);
      
      this.records = await (await fetch('/api/detections?limit=1500')).json();
      this.records.forEach(r => {
        r.entry_time = new Date(r.entry_time);
      });
      
      this.revenue = calcRevenueSummary(this.records);
      this.hourly = generateHourlyData(this.records);
      this.yesterdayHourly = generateYesterdayRevenue(this.hourly);
      this.fraud = await (await fetch('/api/fraud')).json();
    } catch (e) {
      console.error('[DataGen] loadFromBackend failed:', e);
      throw e;
    }
  },

  getRecentRecords(n = 20) {
    return this.records.slice(0, n);
  },

  formatCurrency(amount) {
    return `৳${amount.toLocaleString('en-BD')}`;
  },

  VEHICLE_EMOJIS,
  VEHICLE_COLORS,
  VEHICLE_RATES,
  VEHICLE_DISTRIBUTION
};
