/**
 * app.js
 * Core application: navigation, camera simulation, clock, toast system
 */

const App = (() => {

  // ── Live Clock ─────────────────────────────────────────
  function startClock() {
    const el = document.getElementById('live-clock');
    if (!el) return;
    function update() {
      el.textContent = new Date().toLocaleTimeString('en-BD', {
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
      });
    }
    update();
    setInterval(update, 1000);
  }

  // ── Navigation ─────────────────────────────────────────
  const sections = ['dashboard', 'live-feed', 'detection', 'analytics', 'fraud', 'rates', 'reports'];

  function navigateTo(sectionId, linkEl = null) {
    // Hide all
    sections.forEach(id => {
      const el = document.getElementById(`section-${id}`);
      if (el) el.classList.remove('active');
    });

    // Show target
    const target = document.getElementById(`section-${sectionId}`);
    if (target) target.classList.add('active');

    // Update sidebar links
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    if (linkEl) linkEl.classList.add('active');
    else {
      const match = document.querySelector(`[data-section="${sectionId}"]`);
      if (match) match.classList.add('active');
    }

    // Update topbar title
    const titles = {
      dashboard:  'Overview Dashboard',
      'live-feed': 'Live Camera Monitoring',
      detection:  'Vehicle Detection Log',
      analytics:  'Revenue Analytics',
      fraud:      'Fraud Detection Module',
      rates:      'Toll Rate Management',
      reports:    'Reports & Export'
    };
    const topTitle = document.getElementById('topbar-title');
    if (topTitle) topTitle.textContent = titles[sectionId] || 'Dashboard';

    // Lazy-initialize charts when analytics section opens
    if (sectionId === 'analytics' && window.Charts) {
      setTimeout(() => window.Charts.refresh(), 100);
    }

    // Close mobile sidebar
    const sidebar = document.getElementById('sidebar');
    if (sidebar && window.innerWidth < 768) sidebar.classList.remove('mobile-open');

    // Update URL hash
    window.location.hash = sectionId;
  }

  function initNav() {
    document.querySelectorAll('.nav-link[data-section]').forEach(link => {
      link.addEventListener('click', e => {
        e.preventDefault();
        navigateTo(link.dataset.section, link);
      });
    });

    // Handle hash on load
    const hash = window.location.hash.replace('#', '');
    if (hash && sections.includes(hash)) navigateTo(hash);
    else navigateTo('dashboard');
  }

  // ── Camera Simulation ──────────────────────────────────
  const CAM_SCENES = [
    {
      label: 'CAM-01 · Toll Lane A',
      plate: 'Dhaka Metro Ga-15-4821',
      type: 'Bus',
      conf: '97.3%',
      detections: [
        { top: '22%', left: '18%', width: '55%', height: '48%', label: 'BUS 97.3%' }
      ]
    },
    {
      label: 'CAM-01 · Toll Lane A',
      plate: 'Dhaka Metro Kha-22-7741',
      type: 'Bike',
      conf: '94.8%',
      detections: [
        { top: '35%', left: '30%', width: '28%', height: '38%', label: 'BIKE 94.8%' }
      ]
    },
    {
      label: 'CAM-01 · Toll Lane A',
      plate: 'Rajshahi Metro Ga-11-2234',
      type: 'Truck',
      conf: '98.1%',
      detections: [
        { top: '15%', left: '10%', width: '65%', height: '58%', label: 'TRUCK 98.1%' }
      ]
    }
  ];

  const CAM2_SCENES = [
    {
      label: 'CAM-02 · Toll Lane B',
      plate: 'Dhaka Metro Ga-33-9012',
      type: 'CNG',
      conf: '96.2%',
      detections: [
        { top: '28%', left: '22%', width: '40%', height: '42%', label: 'CNG 96.2%' }
      ]
    },
    {
      label: 'CAM-02 · Toll Lane B',
      plate: 'Sylhet Metro Ka-18-5567',
      type: 'Pickup',
      conf: '99.0%',
      detections: [
        { top: '20%', left: '14%', width: '58%', height: '50%', label: 'PICKUP 99.0%' }
      ]
    },
    {
      label: 'CAM-02 · Toll Lane B',
      plate: 'Dhaka Metro Gha-44-1123',
      type: 'Auto',
      conf: '91.5%',
      detections: [
        { top: '30%', left: '25%', width: '38%', height: '40%', label: 'AUTO 91.5%' }
      ]
    }
  ];

  function renderCameraOverlay(cameraId, scene) {
    const overlay = document.getElementById(`cam${cameraId}-overlay`);
    const plateEl = document.getElementById(`cam${cameraId}-plate`);
    const typeEl = document.getElementById(`cam${cameraId}-type`);
    const confEl = document.getElementById(`cam${cameraId}-conf`);

    if (overlay) {
      overlay.innerHTML = scene.detections.map(d => `
        <div class="detection-box" style="top:${d.top};left:${d.left};width:${d.width};height:${d.height};">
          <div class="detection-label">${d.label}</div>
        </div>`).join('');
    }
    if (plateEl) plateEl.textContent = scene.plate;
    if (typeEl) typeEl.textContent = scene.type;
    if (confEl) confEl.textContent = scene.conf;
  }

  function startCameraSimulation() {
    if (window.AppData.isBackend) {
      // In backend mode, connect the image elements directly to the live MJPEG streams
      const c1 = document.getElementById('cam1-img');
      const c2 = document.getElementById('cam2-img');
      const c1f = document.getElementById('cam1f-img');
      const c2f = document.getElementById('cam2f-img');
      if (c1) c1.src = '/api/camera/1/stream';
      if (c2) c2.src = '/api/camera/2/stream';
      if (c1f) c1f.src = '/api/camera/1/stream';
      if (c2f) c2f.src = '/api/camera/2/stream';
      return;
    }

    let cam1Idx = 0, cam2Idx = 0;

    // Immediately render first
    renderCameraOverlay(1, CAM_SCENES[0]);
    renderCameraOverlay(2, CAM2_SCENES[0]);

    // Rotate cam1 every 4s
    setInterval(() => {
      cam1Idx = (cam1Idx + 1) % CAM_SCENES.length;
      renderCameraOverlay(1, CAM_SCENES[cam1Idx]);
    }, 4000);

    // Rotate cam2 every 5s (offset)
    setInterval(() => {
      cam2Idx = (cam2Idx + 1) % CAM2_SCENES.length;
      renderCameraOverlay(2, CAM2_SCENES[cam2Idx]);
    }, 5000);
  }

  function updateCameraHUD(cameraId, data) {
    const overlay = document.getElementById(`cam${cameraId}-overlay`);
    const plateEl = document.getElementById(`cam${cameraId}-plate`);
    const typeEl = document.getElementById(`cam${cameraId}-type`);
    const confEl = document.getElementById(`cam${cameraId}-conf`);
    
    const plateElF = document.getElementById(`cam${cameraId}f-plate`);
    const typeElF = document.getElementById(`cam${cameraId}f-type`);
    const confElF = document.getElementById(`cam${cameraId}f-conf`);

    const imgEl = document.getElementById(`cam${cameraId}-img`);
    const imgElF = document.getElementById(`cam${cameraId}f-img`);

    // Draw dynamic detection bounding box based on vehicle category
    let boxHtml = '';
    if (data.type === 'Bike') {
      boxHtml = `<div class="detection-box" style="top:35%;left:30%;width:28%;height:38%;"><div class="detection-label">BIKE ${data.conf}</div></div>`;
    } else if (data.type === 'Bus') {
      boxHtml = `<div class="detection-box" style="top:22%;left:18%;width:55%;height:48%;"><div class="detection-label">BUS ${data.conf}</div></div>`;
    } else if (data.type === 'Truck' || data.type === 'Lorry') {
      boxHtml = `<div class="detection-box" style="top:15%;left:10%;width:65%;height:58%;"><div class="detection-label">${data.type.toUpperCase()} ${data.conf}</div></div>`;
    } else {
      boxHtml = `<div class="detection-box" style="top:25%;left:20%;width:45%;height:45%;"><div class="detection-label">${data.type.toUpperCase()} ${data.conf}</div></div>`;
    }

    if (overlay) overlay.innerHTML = boxHtml;
    if (plateEl) plateEl.textContent = data.plate;
    if (typeEl) typeEl.textContent = data.type;
    if (confEl) confEl.textContent = data.conf;

    const overlayF = document.getElementById(`cam${cameraId}f-overlay`);
    if (overlayF) overlayF.innerHTML = boxHtml;
    if (plateElF) plateElF.textContent = data.plate;
    if (typeElF) typeElF.textContent = data.type;
    if (confElF) confElF.textContent = data.conf;

  }

  function updateCameraStats() {
    const d = window.AppData;
    if (!d || !d.records) return;

    // Filter records by camera
    const cam1Records = d.records.filter(r => r.camera_id === 1);
    const cam2Records = d.records.filter(r => r.camera_id === 2);

    // Calculate count
    const count1 = cam1Records.length;
    const count2 = cam2Records.length;

    // Calculate revenue
    const rev1 = cam1Records.reduce((sum, r) => sum + (r.toll_amount || 0), 0);
    const rev2 = cam2Records.reduce((sum, r) => sum + (r.toll_amount || 0), 0);

    // Calculate alerts
    const alerts1 = cam1Records.filter(r => r.status && r.status.toLowerCase() !== 'verified').length;
    const alerts2 = cam2Records.filter(r => r.status && r.status.toLowerCase() !== 'verified').length;

    // Update DOM
    const elCount1 = document.getElementById('cam1-today-count');
    const elCount2 = document.getElementById('cam2-today-count');
    const elRev1 = document.getElementById('cam1-revenue');
    const elRev2 = document.getElementById('cam2-revenue');
    const elAlerts1 = document.getElementById('cam1-alerts');
    const elAlerts2 = document.getElementById('cam2-alerts');

    if (elCount1) elCount1.textContent = count1.toLocaleString();
    if (elCount2) elCount2.textContent = count2.toLocaleString();
    if (elRev1) elRev1.textContent = '৳' + rev1.toLocaleString();
    if (elRev2) elRev2.textContent = '৳' + rev2.toLocaleString();
    if (elAlerts1) elAlerts1.textContent = alerts1.toLocaleString();
    if (elAlerts2) elAlerts2.textContent = alerts2.toLocaleString();
  }

  // ── Toast ──────────────────────────────────────────────
  function toast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast-msg ${type}`;
    const icons = { success: 'check-circle-fill', error: 'x-circle-fill', info: 'info-circle-fill' };
    const colors = { success: 'var(--success)', error: 'var(--danger)', info: 'var(--primary-light)' };
    el.innerHTML = `<i class="bi bi-${icons[type]||'info-circle-fill'}" style="color:${colors[type]};font-size:18px;"></i><span>${msg}</span>`;
    container.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }

  // ── Mobile Sidebar Toggle ──────────────────────────────
  function initMobileToggle() {
    const btn = document.getElementById('mobile-menu-btn');
    const sidebar = document.getElementById('sidebar');
    if (btn && sidebar) {
      btn.addEventListener('click', () => sidebar.classList.toggle('mobile-open'));
    }
  }

  async function init() {
    // 1. Data
    await window.AppData.init();

    // 2. UI modules
    startClock();
    initNav();
    initMobileToggle();
    startCameraSimulation();

    // 3. Dashboard
    Dashboard.init();

    // 4. Live detection table
    DetectionTable.init();

    // 5. Charts
    Charts.init();

    // 6. Fraud
    FraudModule.init();

    // 7. Rates
    RatesModule.init();

    // 8. Reports
    ReportsModule.init();

    // 9. Initial camera stats sync
    updateCameraStats();

    // 10. Welcome toast
    setTimeout(() => toast('🟢 AI Monitoring System Online — All cameras active', 'success'), 800);

    console.log('[App] AI Toll Monitoring System initialized');
  }

  return { init, navigateTo, toast, updateCameraHUD, updateCameraStats };
})();

window.App = App;
document.addEventListener('DOMContentLoaded', () => App.init());
