/**
 * dashboard.js
 * Animated statistics counters and live dashboard updates
 */

const Dashboard = (() => {

  // ── Animated Counter ───────────────────────────────────
  function animateCounter(el, target, duration = 1500, prefix = '', suffix = '') {
    const start = 0;
    const startTime = performance.now();

    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(start + (target - start) * eased);
      el.textContent = prefix + current.toLocaleString('en-BD') + suffix;
      if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
  }

  // ── Render Stat Cards ──────────────────────────────────
  function renderStatCards() {
    const d = window.AppData;
    const rev = d.revenue;
    const totalVehicles = d.records.length;
    const totalRevenue = rev.total;
    const bikeCount = rev.byType['Bike']?.count || 0;
    const busCount = rev.byType['Bus']?.count || 0;
    const truckCount = (rev.byType['Truck']?.count || 0) + (rev.byType['Lorry']?.count || 0);
    const fraudAlerts = d.records.filter(r => r.status && r.status.toLowerCase() !== 'verified').length;

    const cards = [
      {
        id: 'stat-total-vehicles',
        label: 'Total Vehicles Today',
        value: totalVehicles,
        icon: 'bi-car-front-fill',
        color: '#3b82f6',
        iconBg: 'rgba(59,130,246,0.15)',
        change: '+12.4%',
        changeDir: 'up',
        changeLabel: 'vs yesterday'
      },
      {
        id: 'stat-total-revenue',
        label: 'Total Revenue Today',
        value: totalRevenue,
        prefix: '৳',
        icon: 'bi-currency-exchange',
        color: '#10b981',
        iconBg: 'rgba(16,185,129,0.15)',
        change: '+8.7%',
        changeDir: 'up',
        changeLabel: 'vs yesterday'
      },
      {
        id: 'stat-bikes',
        label: 'Bikes Detected',
        value: bikeCount,
        icon: 'bi-bicycle',
        color: '#818cf8',
        iconBg: 'rgba(99,102,241,0.15)',
        change: '+5.2%',
        changeDir: 'up',
        changeLabel: 'vs yesterday'
      },
      {
        id: 'stat-buses',
        label: 'Buses Detected',
        value: busCount,
        icon: 'bi-bus-front-fill',
        color: '#60a5fa',
        iconBg: 'rgba(37,99,235,0.15)',
        change: '-2.1%',
        changeDir: 'down',
        changeLabel: 'vs yesterday'
      },
      {
        id: 'stat-trucks',
        label: 'Trucks / Lorries',
        value: truckCount,
        icon: 'bi-truck-front-fill',
        color: '#f87171',
        iconBg: 'rgba(239,68,68,0.15)',
        change: '+1.3%',
        changeDir: 'up',
        changeLabel: 'vs yesterday'
      },
      {
        id: 'stat-fraud',
        label: 'Fraud Alerts',
        value: fraudAlerts,
        icon: 'bi-shield-exclamation',
        color: '#f59e0b',
        iconBg: 'rgba(245,158,11,0.15)',
        change: 'ACTION REQUIRED',
        changeDir: 'down',
        changeLabel: ''
      }
    ];

    const container = document.getElementById('stat-cards-row');
    if (!container) return;

    container.innerHTML = '';

    cards.forEach(card => {
      const col = document.createElement('div');
      col.className = 'col-xl-2 col-lg-4 col-md-4 col-sm-6 mb-3';

      col.innerHTML = `
        <div class="stat-card" style="--stat-color:${card.color}; --stat-icon-bg:${card.iconBg};">
          <div class="stat-info">
            <div class="stat-label">${card.label}</div>
            <div class="stat-value" id="${card.id}">0</div>
            <div class="stat-change ${card.changeDir}">
              <i class="bi bi-arrow-${card.changeDir === 'up' ? 'up-right' : 'down-right'}"></i>
              <span>${card.change}</span>
              <span style="color:var(--text-muted)">${card.changeLabel}</span>
            </div>
          </div>
          <div class="stat-icon">
            <i class="bi ${card.icon}"></i>
          </div>
          <div class="stat-glow"></div>
        </div>`;
      container.appendChild(col);

      // Animate after a short delay
      setTimeout(() => {
        const el = document.getElementById(card.id);
        if (el) animateCounter(el, card.value, 1800, card.prefix || '');
      }, 200);
    });
  }

  // ── Mini Summary Bar (under detection table) ───────────
  function renderSummaryBar() {
    const d = window.AppData;
    const container = document.getElementById('summary-bar');
    if (!container) return;

    const items = Object.entries(d.revenue.byType)
      .filter(([, v]) => v.count > 0)
      .map(([type, v]) => `
        <div class="col">
          <div class="summary-stat">
            <div class="s-value">${d.VEHICLE_EMOJIS[type]} ${v.count.toLocaleString()}</div>
            <div class="s-label">${type}</div>
          </div>
        </div>`).join('');

    container.innerHTML = items;
  }

  // ── Live Stat Updates (every 8 seconds) ────────────────
  function startLiveUpdates() {
    setInterval(async () => {
      if (window.AppData.isBackend) {
        try {
          const resp = await fetch('/api/stats');
          if (resp.ok) {
            const stats = await resp.json();
            
            // Sync with AppData
            window.AppData.records.length = stats.total_vehicles;
            window.AppData.revenue.total = stats.total_revenue;
            if (window.AppData.revenue.byType['Bike']) window.AppData.revenue.byType['Bike'].count = stats.bike_count;
            if (window.AppData.revenue.byType['Bus']) window.AppData.revenue.byType['Bus'].count = stats.bus_count;
            
            // Update the UI values directly
            const revEl = document.getElementById('stat-total-revenue');
            const vehEl = document.getElementById('stat-total-vehicles');
            const bikeEl = document.getElementById('stat-bikes');
            const busEl = document.getElementById('stat-buses');
            const truckEl = document.getElementById('stat-trucks');
            const fraudEl = document.getElementById('stat-fraud');
            
            if (revEl) revEl.textContent = '৳' + stats.total_revenue.toLocaleString('en-BD');
            if (vehEl) vehEl.textContent = stats.total_vehicles.toLocaleString('en-BD');
            if (bikeEl) bikeEl.textContent = stats.bike_count.toLocaleString('en-BD');
            if (busEl) busEl.textContent = stats.bus_count.toLocaleString('en-BD');
            if (truckEl) truckEl.textContent = stats.truck_count.toLocaleString('en-BD');
            if (fraudEl) fraudEl.textContent = stats.fraud_alerts.toLocaleString('en-BD');
          }
        } catch (e) {
          console.error('[Dashboard] Error polling stats:', e);
        }
      } else {
        // Simulate a new vehicle arriving (Client-side fallback)
        const types = Object.keys(window.AppData.VEHICLE_RATES);
        const type = types[Math.floor(Math.random() * types.length)];

        window.AppData.revenue.byType[type].count++;
        window.AppData.revenue.byType[type].revenue += window.AppData.VEHICLE_RATES[type];
        window.AppData.revenue.total += window.AppData.VEHICLE_RATES[type];

        // Silently update just the revenue card
        const el = document.getElementById('stat-total-revenue');
        if (el) el.textContent = '৳' + window.AppData.revenue.total.toLocaleString('en-BD');
      }
    }, 8000);
  }

  return {
    init() {
      renderStatCards();
      renderSummaryBar();
      startLiveUpdates();
    }
  };
})();
