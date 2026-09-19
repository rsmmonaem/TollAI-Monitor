/**
 * detection-table.js
 * Live-updating vehicle detection table with animated row insertion
 */

const DetectionTable = (() => {

  // SVG vehicle thumbnails (inline, no external images needed for table)
  const VEHICLE_SVGS = {
    Bike: `<svg viewBox="0 0 52 36" fill="none" xmlns="http://www.w3.org/2000/svg" width="52" height="36">
      <rect width="52" height="36" rx="4" fill="#1e293b"/>
      <circle cx="14" cy="26" r="6" stroke="#818cf8" stroke-width="2"/>
      <circle cx="38" cy="26" r="6" stroke="#818cf8" stroke-width="2"/>
      <path d="M14 26 L22 14 L30 14 L38 26" stroke="#818cf8" stroke-width="1.5" fill="none"/>
      <circle cx="26" cy="14" r="2" fill="#818cf8"/>
      <path d="M26 14 L28 20" stroke="#818cf8" stroke-width="1.5"/>
    </svg>`,
    CNG: `<svg viewBox="0 0 52 36" fill="none" xmlns="http://www.w3.org/2000/svg" width="52" height="36">
      <rect width="52" height="36" rx="4" fill="#1e293b"/>
      <rect x="8" y="10" width="28" height="16" rx="6" fill="none" stroke="#34d399" stroke-width="1.8"/>
      <circle cx="14" cy="27" r="4" stroke="#34d399" stroke-width="1.5"/>
      <circle cx="30" cy="27" r="4" stroke="#34d399" stroke-width="1.5"/>
      <rect x="16" y="13" width="16" height="8" rx="2" fill="rgba(52,211,153,0.15)" stroke="#34d399" stroke-width="1"/>
      <line x1="36" y1="18" x2="44" y2="18" stroke="#34d399" stroke-width="1.5"/>
    </svg>`,
    Auto: `<svg viewBox="0 0 52 36" fill="none" xmlns="http://www.w3.org/2000/svg" width="52" height="36">
      <rect width="52" height="36" rx="4" fill="#1e293b"/>
      <rect x="6" y="12" width="32" height="14" rx="3" fill="none" stroke="#fbbf24" stroke-width="1.8"/>
      <rect x="12" y="8" width="20" height="10" rx="2" fill="none" stroke="#fbbf24" stroke-width="1.4"/>
      <circle cx="13" cy="27" r="4" stroke="#fbbf24" stroke-width="1.5"/>
      <circle cx="31" cy="27" r="4" stroke="#fbbf24" stroke-width="1.5"/>
    </svg>`,
    Pickup: `<svg viewBox="0 0 52 36" fill="none" xmlns="http://www.w3.org/2000/svg" width="52" height="36">
      <rect width="52" height="36" rx="4" fill="#1e293b"/>
      <rect x="4" y="14" width="44" height="12" rx="2" fill="none" stroke="#22d3ee" stroke-width="1.8"/>
      <rect x="4" y="9" width="22" height="10" rx="2" fill="none" stroke="#22d3ee" stroke-width="1.4"/>
      <circle cx="12" cy="27" r="4" stroke="#22d3ee" stroke-width="1.5"/>
      <circle cx="40" cy="27" r="4" stroke="#22d3ee" stroke-width="1.5"/>
    </svg>`,
    Bus: `<svg viewBox="0 0 52 36" fill="none" xmlns="http://www.w3.org/2000/svg" width="52" height="36">
      <rect width="52" height="36" rx="4" fill="#1e293b"/>
      <rect x="4" y="6" width="44" height="22" rx="3" fill="none" stroke="#60a5fa" stroke-width="1.8"/>
      <circle cx="12" cy="29" r="4" stroke="#60a5fa" stroke-width="1.5"/>
      <circle cx="40" cy="29" r="4" stroke="#60a5fa" stroke-width="1.5"/>
      <line x1="4" y1="14" x2="48" y2="14" stroke="#60a5fa" stroke-width="1"/>
      <rect x="8" y="8" width="8" height="5" rx="1" fill="rgba(96,165,250,0.2)" stroke="#60a5fa" stroke-width="1"/>
      <rect x="20" y="8" width="8" height="5" rx="1" fill="rgba(96,165,250,0.2)" stroke="#60a5fa" stroke-width="1"/>
      <rect x="32" y="8" width="8" height="5" rx="1" fill="rgba(96,165,250,0.2)" stroke="#60a5fa" stroke-width="1"/>
    </svg>`,
    Truck: `<svg viewBox="0 0 52 36" fill="none" xmlns="http://www.w3.org/2000/svg" width="52" height="36">
      <rect width="52" height="36" rx="4" fill="#1e293b"/>
      <rect x="4" y="10" width="28" height="18" rx="2" fill="none" stroke="#f87171" stroke-width="1.8"/>
      <rect x="32" y="14" width="16" height="14" rx="2" fill="none" stroke="#f87171" stroke-width="1.8"/>
      <circle cx="10" cy="29" r="4" stroke="#f87171" stroke-width="1.5"/>
      <circle cx="38" cy="29" r="4" stroke="#f87171" stroke-width="1.5"/>
      <circle cx="46" cy="29" r="3" stroke="#f87171" stroke-width="1.5"/>
    </svg>`,
    Lorry: `<svg viewBox="0 0 52 36" fill="none" xmlns="http://www.w3.org/2000/svg" width="52" height="36">
      <rect width="52" height="36" rx="4" fill="#1e293b"/>
      <rect x="4" y="8" width="30" height="20" rx="2" fill="none" stroke="#c084fc" stroke-width="1.8"/>
      <rect x="34" y="12" width="14" height="16" rx="2" fill="none" stroke="#c084fc" stroke-width="1.8"/>
      <circle cx="10" cy="29" r="4" stroke="#c084fc" stroke-width="1.5"/>
      <circle cx="24" cy="29" r="4" stroke="#c084fc" stroke-width="1.5"/>
      <circle cx="40" cy="29" r="3" stroke="#c084fc" stroke-width="1.5"/>
    </svg>`
  };

  let feedInterval = null;
  let recordQueue = [];
  let displayedCount = 0;
  const MAX_ROWS = 50;

  function getVehicleSVG(type) {
    return VEHICLE_SVGS[type] || VEHICLE_SVGS['Auto'];
  }

  function buildRow(record, isNew = false) {
    const d = window.AppData;
    const typeClass = d.VEHICLE_COLORS[record.vehicle_type] || '';
    const emoji = d.VEHICLE_EMOJIS[record.vehicle_type] || '🚗';
    const timeStr = record.entry_time.toLocaleTimeString('en-BD', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    const confidenceColor = record.confidence > 95 ? 'var(--success)' : record.confidence > 90 ? 'var(--warning)' : 'var(--danger)';
    const statusBg = record.status === 'Verified' ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)';
    const statusColor = record.status === 'Verified' ? '#34d399' : '#fbbf24';
    const statusBorder = record.status === 'Verified' ? 'rgba(16,185,129,0.25)' : 'rgba(245,158,11,0.25)';

    const tr = document.createElement('tr');
    if (isNew) tr.classList.add('new-row');

    const hasImage = d.isBackend && record.image_path;
    let imgHtml = getVehicleSVG(record.vehicle_type);
    if (hasImage) {
      const cleanPath = record.image_path.startsWith('/') ? record.image_path : '/' + record.image_path;
      imgHtml = `<img src="${cleanPath}" style="width:100%;height:100%;object-fit:cover;display:block;" onerror="this.style.display='none';" />`;
    }

    tr.innerHTML = `
      <td>
        <div style="width:52px;height:36px;border-radius:5px;overflow:hidden;border:1px solid rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:center;background:#1e293b;">
          ${imgHtml}
        </div>
      </td>
      <td>
        <span class="type-badge ${typeClass}">${emoji} ${record.vehicle_type}</span>
      </td>
      <td><span class="plate-badge">${record.plate_number}</span></td>
      <td style="color:var(--text-secondary);font-size:12px;">${timeStr}</td>
      <td style="text-align:center;">
        <span style="font-size:11px;color:${confidenceColor};font-weight:600;">${record.confidence}%</span>
      </td>
      <td><span style="font-size:11.5px;color:var(--text-muted);">CAM-${record.camera_id}</span></td>
      <td style="color:var(--text-primary);font-weight:600;">৳${record.toll_amount}</td>
      <td>
        <span style="background:${statusBg};color:${statusColor};border:1px solid ${statusBorder};font-size:10px;font-weight:600;padding:2px 8px;border-radius:4px;">${record.status}</span>
      </td>`;

    return tr;
  }

  function insertRow(record) {
    const tbody = document.getElementById('detection-tbody');
    if (!tbody) return;

    const rows = tbody.querySelectorAll('tr');
    if (rows.length >= MAX_ROWS) tbody.removeChild(tbody.lastElementChild);

    const tr = buildRow(record, true);
    tbody.insertBefore(tr, tbody.firstChild);

    // Sync record with AppData if it is a new live event
    if (window.AppData && window.AppData.records) {
      if (!window.AppData.records.some(r => r.id === record.id)) {
        window.AppData.records.unshift(record);
        
        // Update type-specific summaries dynamically
        const type = record.vehicle_type;
        if (window.AppData.revenue) {
          window.AppData.revenue.total += record.toll_amount;
          if (window.AppData.revenue.byType[type]) {
            window.AppData.revenue.byType[type].count++;
            window.AppData.revenue.byType[type].revenue += record.toll_amount;
          }
        }
      }
    }

    // Dynamically update camera HUD overlays with live detection data!
    if (window.App && window.App.updateCameraHUD && record.camera_id) {
      window.App.updateCameraHUD(record.camera_id, {
        plate: record.plate_number,
        type: record.vehicle_type,
        conf: `${record.confidence}%`,
        image_path: record.image_path
      });
    }

    // Refresh the camera metrics HUD (Today, Revenue, Alerts) dynamically
    if (window.App && window.App.updateCameraStats) {
      window.App.updateCameraStats();
    }
  }

  let maxSeenId = 0;

  function populateInitial() {
    const tbody = document.getElementById('detection-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const initial = window.AppData.getRecentRecords(25);
    initial.forEach(r => {
      const tr = buildRow(r, false);
      tbody.appendChild(tr);
    });

    if (initial.length > 0) {
      maxSeenId = Math.max(...initial.map(r => r.id));
    }
  }

  function startLiveFeed() {
    if (window.AppData.isBackend) {
      feedInterval = setInterval(async () => {
        try {
          const resp = await fetch(`/api/detections?since_id=${maxSeenId}&limit=10`);
          if (resp.ok) {
            const newDetections = await resp.json();
            if (newDetections.length > 0) {
              // Detections are returned DESC (most recent first)
              // Reverse them to insert oldest ones first, so the most recent ends up at the top
              const sorted = [...newDetections].reverse();
              sorted.forEach(r => {
                r.entry_time = new Date(r.entry_time);
                insertRow(r);
                maxSeenId = Math.max(maxSeenId, r.id);
                displayedCount++;
              });
              
              // Update vehicle count badge
              const badge = document.getElementById('live-count-badge');
              if (badge) badge.textContent = `${displayedCount} detected today`;
            }
          }
        } catch (e) {
          console.error('[DetectionTable] Error polling live feed:', e);
        }
      }, 2500);
    } else {
      // Build queue from remaining records (not already displayed) (Client-side fallback)
      recordQueue = [...window.AppData.records].reverse();

      feedInterval = setInterval(() => {
        if (recordQueue.length === 0) {
          // Regenerate synthetic records
          const types = Object.keys(window.AppData.VEHICLE_RATES);
          const type = types[Math.floor(Math.random() * types.length)];
          const synth = {
            id: ++maxSeenId,
            vehicle_type: type,
            plate_number: `Dhaka Metro Ga-${Math.floor(Math.random()*88+11)}-${Math.floor(Math.random()*8999+1000)}`,
            entry_time: new Date(),
            confidence: parseFloat((88 + Math.random() * 11.5).toFixed(1)),
            camera_id: Math.random() > 0.5 ? 1 : 2,
            toll_amount: window.AppData.VEHICLE_RATES[type],
            status: Math.random() > 0.1 ? 'Verified' : 'Manual Check'
          };
          insertRow(synth);
        } else {
          const r = recordQueue.pop();
          r.entry_time = new Date(); // Make it feel live
          insertRow(r);
        }

        // Update vehicle count badge
        displayedCount++;
        const badge = document.getElementById('live-count-badge');
        if (badge) badge.textContent = `${displayedCount} detected today`;
      }, 2500);
    }
  }

  function stopLiveFeed() {
    if (feedInterval) { clearInterval(feedInterval); feedInterval = null; }
  }

  return {
    init() {
      populateInitial();
      startLiveFeed();
    },
    stop: stopLiveFeed
  };
})();

window.clearDetectionLogs = async function() {
  if (!confirm('Are you sure you want to clear all vehicle detection logs?')) return;
  
  try {
    const resp = await fetch('/api/detections', { method: 'DELETE' });
    const data = await resp.json();
    if (data.success) {
      document.getElementById('detection-tbody').innerHTML = '';
      document.getElementById('detection-tbody-full').innerHTML = '';
      const badge = document.getElementById('live-count-badge');
      if (badge) badge.textContent = `0 detected today`;
      alert('Detection logs cleared successfully!');
    } else {
      alert('Failed to clear logs: ' + data.message);
    }
  } catch (e) {
    console.error('Error clearing logs:', e);
    alert('An error occurred while clearing logs.');
  }
};
