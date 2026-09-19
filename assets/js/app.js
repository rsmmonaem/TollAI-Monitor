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
    updateActiveStreams();
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

  // Current active camera selections for slots
  const activeCameras = {
    slot1: 1,
    slot2: 2,
    quad1: 1,
    quad2: 2,
    quad3: 3,
    quad4: 4
  };

  let currentCameraView = 'dual';

  function initCameraSelectors() {
    const cams = window.AppData.cameras || [];
    if (!cams.length) return;

    const slotSelectors = [
      { id: 'slot1-cam-select', defaultVal: 1 },
      { id: 'slot2-cam-select', defaultVal: 2 },
      { id: 'dash-cam1-select', defaultVal: 1 },
      { id: 'dash-cam2-select', defaultVal: 2 },
      { id: 'quad1-cam-select', defaultVal: 1 },
      { id: 'quad2-cam-select', defaultVal: 2 },
      { id: 'quad3-cam-select', defaultVal: 3 },
      { id: 'quad4-cam-select', defaultVal: 4 }
    ];

    slotSelectors.forEach(selInfo => {
      const el = document.getElementById(selInfo.id);
      if (!el) return;
      el.innerHTML = cams.map(c => 
        `<option value="${c.id}" ${c.id === selInfo.defaultVal ? 'selected' : ''}>${c.name}</option>`
      ).join('');
    });
  }

  function onCameraSelectChange(slot, camId, isDash = false) {
    camId = parseInt(camId, 10);
    activeCameras[`slot${slot}`] = camId;

    // Synchronize both live feed and dashboard dropdowns
    const feedSel = document.getElementById(`slot${slot}-cam-select`);
    const dashSel = document.getElementById(`dash-cam${slot}-select`);
    if (feedSel) feedSel.value = camId;
    if (dashSel) dashSel.value = camId;

    // Update active stream sources dynamically
    updateActiveStreams();

    // Update AI / NVR stream badge
    const badge = document.getElementById(`cam${slot}f-ai-badge`);
    if (badge) {
      const activeAi = window.AppData.activeAiCameras || [1, 2];
      const isAi = activeAi.includes(camId);
      if (isAi) {
        badge.className = 'badge-ai-active';
        badge.innerHTML = '<i class="bi bi-cpu-fill"></i> AI ACTIVE';
        badge.style.cssText = 'cursor:pointer;';
        badge.title = `Camera ${camId}: AI Active (Click to toggle off)`;
        badge.onclick = () => App.toggleAiCamera(camId);
      } else {
        badge.className = 'badge';
        badge.style.cssText = 'background:rgba(255,255,255,0.06); color:var(--text-muted); font-size:10px; border:1px solid var(--border); cursor:pointer;';
        const camObj = (window.AppData.cameras || []).find(c => c.id === camId);
        const chName = camObj ? `Ch ${camObj.channel}` : `Cam ${camId}`;
        badge.innerHTML = `<i class="bi bi-broadcast"></i> NVR ${chName} (AI OFF)`;
        badge.title = `Camera ${camId}: Stream Only (Click to activate AI)`;
        badge.onclick = () => App.toggleAiCamera(camId);
      }
    }

    updateCameraStats();
    toast(`Switched Slot ${slot} to Camera ${camId}`, 'info');
  }

  function onQuadSelectChange(quadIndex, camId) {
    camId = parseInt(camId, 10);
    activeCameras[`quad${quadIndex}`] = camId;
    updateActiveStreams();
  }

  function setCameraView(mode) {
    currentCameraView = mode;
    const btnDual = document.getElementById('btn-view-dual');
    const btnQuad = document.getElementById('btn-view-quad');
    const btnAll14 = document.getElementById('btn-view-all14');

    const containerDual = document.getElementById('container-dual-view');
    const containerQuad = document.getElementById('container-quad-view');
    const containerAll14 = document.getElementById('container-all14-view');

    if (btnDual) btnDual.classList.toggle('active', mode === 'dual');
    if (btnQuad) btnQuad.classList.toggle('active', mode === 'quad');
    if (btnAll14) btnAll14.classList.toggle('active', mode === 'all14');

    if (containerDual) containerDual.style.display = (mode === 'dual' ? 'flex' : 'none');
    if (containerQuad) containerQuad.style.display = (mode === 'quad' ? 'flex' : 'none');
    if (containerAll14) containerAll14.style.display = (mode === 'all14' ? 'block' : 'none');

    if (mode !== 'all14' && all14Interval) {
      clearInterval(all14Interval);
      all14Interval = null;
    }

    if (mode === 'all14') {
      renderAll14Grid();
    }
    updateActiveStreams();
  }

  function focusCamera(camId) {
    camId = parseInt(camId, 10);
    setCameraView('dual');
    onCameraSelectChange(1, camId);
    const feedSec = document.getElementById('section-live-feed');
    if (feedSec) {
      window.scrollTo({ top: feedSec.offsetTop - 20, behavior: 'smooth' });
    }
  }

  let all14Interval = null;

  function renderAll14Grid() {
    const container = document.getElementById('all14-grid-container');
    if (!container) return;
    const cams = window.AppData.cameras || [];
    if (!cams.length) return;
    const activeAi = window.AppData.activeAiCameras || [1, 2];

    container.innerHTML = cams.map(c => {
      const isAi = activeAi.includes(c.id);
      return `
        <div class="cam-card-mini" style="border: 1px solid ${isAi ? 'rgba(168,85,247,0.35)' : 'var(--border)'};">
          <div class="card-header-mini">
            <div class="d-flex align-items-center gap-2">
              <i class="bi bi-camera-video text-primary-c"></i>
              <span style="font-size:12px; font-weight:700;">Camera ${c.id}</span>
              <span class="badge" style="background:rgba(255,255,255,0.08); font-size:10px; color:#94a3b8;">Ch ${c.channel}</span>
            </div>
            <div class="d-flex align-items-center gap-1">
              <button class="btn btn-xs py-0 px-1" onclick="App.toggleAiCamera(${c.id})" title="Toggle AI Detection" style="font-size:9.5px; border-radius:4px; font-weight:600; ${isAi ? 'background:rgba(168,85,247,0.25); color:#c084fc; border:1px solid rgba(168,85,247,0.4);' : 'background:rgba(255,255,255,0.06); color:#64748b; border:1px solid rgba(255,255,255,0.1);'}">
                <i class="bi bi-cpu-fill"></i> ${isAi ? 'AI ON' : 'AI OFF'}
              </button>
              <span class="cam-badge live py-0 px-2" style="font-size:10px;"><span class="cam-live-dot"></span> LIVE</span>
            </div>
          </div>
          <div class="camera-feed" style="aspect-ratio:16/9; cursor:pointer;" onclick="App.focusCamera(${c.id})" title="Click to focus in Slot 1">
            <img id="all14-img-${c.id}" src="/api/camera/${c.id}/snapshot?t=${Date.now()}" alt="${c.name}" />
          </div>
          <div class="card-footer-mini">
            <span class="text-muted-c" style="font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:180px;">${c.lane}</span>
            <button class="btn btn-xs btn-outline-primary py-0 px-2" onclick="App.focusCamera(${c.id})" style="font-size:11px; border-radius:4px;">
              <i class="bi bi-arrows-angle-expand"></i> Focus
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Refresh all 14 snapshots on a quick interval without exhausting browser HTTP connection limit
    if (all14Interval) clearInterval(all14Interval);
    all14Interval = setInterval(() => {
      if (currentCameraView !== 'all14') {
        clearInterval(all14Interval);
        all14Interval = null;
        return;
      }
      const t = Date.now();
      cams.forEach(c => {
        const img = document.getElementById(`all14-img-${c.id}`);
        if (img) {
          img.src = `/api/camera/${c.id}/snapshot?t=${t}`;
        }
      });
    }, 1500);
  }

  function updateActiveStreams() {
    if (!window.AppData || !window.AppData.isBackend) return;
    const currentSection = (window.location.hash.replace('#', '') || 'dashboard');

    const c1 = document.getElementById('cam1-img');
    const c2 = document.getElementById('cam2-img');
    const c1f = document.getElementById('cam1f-img');
    const c2f = document.getElementById('cam2f-img');

    const s1 = activeCameras.slot1 || 1;
    const s2 = activeCameras.slot2 || 2;
    const s1Url = `/api/camera/${s1}/stream`;
    const s2Url = `/api/camera/${s2}/stream`;

    if (currentSection === 'dashboard') {
      if (c1 && (!c1.src || !c1.src.includes(`/api/camera/${s1}/stream`))) c1.src = s1Url;
      if (c2 && (!c2.src || !c2.src.includes(`/api/camera/${s2}/stream`))) c2.src = s2Url;
      if (c1f && c1f.src) c1f.src = '';
      if (c2f && c2f.src) c2f.src = '';
      [1, 2, 3, 4].forEach(i => {
        const q = document.getElementById(`quad${i}-img`);
        if (q && q.src) q.src = '';
      });
      if (all14Interval) { clearInterval(all14Interval); all14Interval = null; }
    } else if (currentSection === 'live-feed') {
      if (c1 && c1.src) c1.src = '';
      if (c2 && c2.src) c2.src = '';
      if (currentCameraView === 'dual') {
        if (c1f && (!c1f.src || !c1f.src.includes(`/api/camera/${s1}/stream`))) c1f.src = s1Url;
        if (c2f && (!c2f.src || !c2f.src.includes(`/api/camera/${s2}/stream`))) c2f.src = s2Url;
        [1, 2, 3, 4].forEach(i => {
          const q = document.getElementById(`quad${i}-img`);
          if (q && q.src) q.src = '';
        });
        if (all14Interval) { clearInterval(all14Interval); all14Interval = null; }
      } else if (currentCameraView === 'quad') {
        if (c1f && c1f.src) c1f.src = '';
        if (c2f && c2f.src) c2f.src = '';
        [1, 2, 3, 4].forEach(i => {
          const camId = activeCameras[`quad${i}`];
          const q = document.getElementById(`quad${i}-img`);
          const qUrl = `/api/camera/${camId}/stream`;
          if (q && (!q.src || !q.src.includes(`/api/camera/${camId}/stream`))) q.src = qUrl;
        });
        if (all14Interval) { clearInterval(all14Interval); all14Interval = null; }
      } else if (currentCameraView === 'all14') {
        if (c1f && c1f.src) c1f.src = '';
        if (c2f && c2f.src) c2f.src = '';
        [1, 2, 3, 4].forEach(i => {
          const q = document.getElementById(`quad${i}-img`);
          if (q && q.src) q.src = '';
        });
      }
    } else {
      // Free up all network sockets on other tabs to completely eliminate latency & queue bloat
      if (c1 && c1.src) c1.src = '';
      if (c2 && c2.src) c2.src = '';
      if (c1f && c1f.src) c1f.src = '';
      if (c2f && c2f.src) c2f.src = '';
      [1, 2, 3, 4].forEach(i => {
        const q = document.getElementById(`quad${i}-img`);
        if (q && q.src) q.src = '';
      });
      if (all14Interval) { clearInterval(all14Interval); all14Interval = null; }
    }
  }

  function startCameraSimulation() {
    initCameraSelectors();

    if (window.AppData.isBackend) {
      updateActiveStreams();
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

    const cam1Id = activeCameras.slot1;
    const cam2Id = activeCameras.slot2;

    // Filter records by camera
    const cam1Records = d.records.filter(r => r.camera_id === cam1Id);
    const cam2Records = d.records.filter(r => r.camera_id === cam2Id);

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

    // 9. Initial camera stats sync & AI badges
    updateCameraStats();
    updateAiBadges();

    // 10. Welcome toast
    setTimeout(() => toast('🟢 AI Monitoring System Online — 14 NVR channels ready', 'success'), 800);

    console.log('[App] AI Toll Monitoring System initialized');
  }

  // ── AI Camera Multi-Select Functions ───────────────────

  function updateAiBadges() {
    const activeAi = window.AppData.activeAiCameras || [1, 2];
    
    // 1. Update header badge count
    const countBadge = document.getElementById('ai-active-count-badge');
    if (countBadge) {
      countBadge.textContent = activeAi.length;
    }

    // 2. Update Slot 1 & Slot 2 badges in Dual Focus view
    [1, 2].forEach(slot => {
      const select = document.getElementById(`slot${slot}-cam-select`);
      const camId = select ? parseInt(select.value, 10) : slot;
      const badge = document.getElementById(`cam${slot}f-ai-badge`);
      if (badge) {
        const isAi = activeAi.includes(camId);
        if (isAi) {
          badge.className = 'badge-ai-active';
          badge.innerHTML = '<i class="bi bi-cpu-fill"></i> AI ACTIVE';
          badge.style.cssText = 'cursor:pointer;';
          badge.title = `Camera ${camId}: AI Active (Click to toggle off)`;
          badge.onclick = () => toggleAiCamera(camId);
        } else {
          badge.className = 'badge';
          badge.style.cssText = 'background:rgba(255,255,255,0.06); color:var(--text-muted); font-size:10px; border:1px solid var(--border); cursor:pointer;';
          const camObj = (window.AppData.cameras || []).find(c => c.id === camId);
          const chName = camObj ? `Ch ${camObj.channel}` : `Cam ${camId}`;
          badge.innerHTML = `<i class="bi bi-broadcast"></i> NVR ${chName} (AI OFF)`;
          badge.title = `Camera ${camId}: Stream Only (Click to activate AI)`;
          badge.onclick = () => toggleAiCamera(camId);
        }
      }
    });

    // 3. Re-render All 14 Grid if currently active
    if (currentCameraView === 'all14') {
      renderAll14Grid();
    }
  }

  function openAiCameraModal() {
    const container = document.getElementById('ai-camera-checkbox-grid');
    if (!container) return;
    
    const cams = window.AppData.cameras || [];
    const activeAi = window.AppData.activeAiCameras || [1, 2];

    container.innerHTML = cams.map(c => {
      const isChecked = activeAi.includes(c.id);
      return `
        <div class="col-md-6 col-lg-4">
          <div class="p-2 rounded" style="background:${isChecked ? 'rgba(168,85,247,0.14)' : 'rgba(255,255,255,0.03)'}; border:1px solid ${isChecked ? 'rgba(168,85,247,0.45)' : 'rgba(148,163,184,0.12)'}; transition:all 0.2s;" id="ai-card-${c.id}">
            <div class="form-check d-flex align-items-center justify-content-between mb-0" style="padding-left:1.8em;">
              <div>
                <input class="form-check-input ai-cam-checkbox" type="checkbox" value="${c.id}" id="ai-cam-${c.id}" ${isChecked ? 'checked' : ''} onchange="App.onAiCheckboxChange(${c.id}, this.checked)">
                <label class="form-check-label fw-bold" for="ai-cam-${c.id}" style="font-size:12.5px; cursor:pointer; color:${isChecked ? '#f1f5f9' : '#94a3b8'};">
                  Camera ${c.id} <span class="badge" style="background:rgba(255,255,255,0.08); font-size:10px; color:#cbd5e1;">Ch ${c.channel}</span>
                </label>
                <div style="font-size:11px; color:${isChecked ? '#c084fc' : '#64748b'}; margin-top:2px;">${c.lane}</div>
              </div>
              <div>
                <span class="badge" id="ai-status-badge-${c.id}" style="font-size:9.5px; ${isChecked ? 'background:rgba(34,197,94,0.2); color:#4ade80; border:1px solid rgba(34,197,94,0.3);' : 'background:rgba(255,255,255,0.05); color:#64748b;'}">
                  ${isChecked ? 'AI ACTIVE' : 'OFF'}
                </span>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    updateModalSelectedBadge();

    const modalEl = document.getElementById('aiCameraModal');
    if (modalEl && window.bootstrap) {
      const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
      modal.show();
    }
  }

  function onAiCheckboxChange(camId, isChecked) {
    const card = document.getElementById(`ai-card-${camId}`);
    const badge = document.getElementById(`ai-status-badge-${camId}`);
    if (card) {
      card.style.background = isChecked ? 'rgba(168,85,247,0.14)' : 'rgba(255,255,255,0.03)';
      card.style.borderColor = isChecked ? 'rgba(168,85,247,0.45)' : 'rgba(148,163,184,0.12)';
    }
    if (badge) {
      badge.textContent = isChecked ? 'AI ACTIVE' : 'OFF';
      badge.style.cssText = isChecked 
        ? 'font-size:9.5px; background:rgba(34,197,94,0.2); color:#4ade80; border:1px solid rgba(34,197,94,0.3);' 
        : 'font-size:9.5px; background:rgba(255,255,255,0.05); color:#64748b;';
    }
    updateModalSelectedBadge();
  }

  function updateModalSelectedBadge() {
    const checkedBoxes = document.querySelectorAll('.ai-cam-checkbox:checked');
    const badge = document.getElementById('ai-modal-selected-badge');
    if (badge) {
      badge.textContent = `${checkedBoxes.length} of 14 Selected`;
    }
  }

  function aiSelectPreset(preset) {
    const checkboxes = document.querySelectorAll('.ai-cam-checkbox');
    checkboxes.forEach(cb => {
      const cid = parseInt(cb.value, 10);
      let shouldCheck = false;
      if (preset === 'all') shouldCheck = true;
      else if (preset === 'lanes') shouldCheck = (cid >= 1 && cid <= 4);
      else if (preset === 'inbound') shouldCheck = [1, 3, 5].includes(cid);
      else if (preset === 'clear') shouldCheck = false;
      
      cb.checked = shouldCheck;
      onAiCheckboxChange(cid, shouldCheck);
    });
    updateModalSelectedBadge();
  }

  async function saveAiCameraModalSelection() {
    const checkedBoxes = Array.from(document.querySelectorAll('.ai-cam-checkbox:checked'));
    const selectedIds = checkedBoxes.map(cb => parseInt(cb.value, 10)).sort((a,b) => a - b);
    
    if (selectedIds.length === 0) {
      if (!confirm('Warning: No cameras selected for AI processing. The AI Engine will be idle. Continue?')) {
        return;
      }
    }

    try {
      const resp = await fetch('/api/ai/cameras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cameras: selectedIds })
      });
      if (resp.ok) {
        const data = await resp.json();
        window.AppData.activeAiCameras = data.active_cameras || selectedIds;
        updateAiBadges();
        toast(`✅ AI Engine active on ${selectedIds.length} Camera(s): [${selectedIds.join(', ')}]`, 'success');
      } else {
        window.AppData.activeAiCameras = selectedIds;
        updateAiBadges();
        toast(`✅ Updated AI cameras: [${selectedIds.join(', ')}]`, 'info');
      }
    } catch (e) {
      window.AppData.activeAiCameras = selectedIds;
      updateAiBadges();
      toast(`✅ Updated AI cameras: [${selectedIds.join(', ')}]`, 'info');
    }

    const modalEl = document.getElementById('aiCameraModal');
    if (modalEl && window.bootstrap) {
      const modal = bootstrap.Modal.getInstance(modalEl);
      if (modal) modal.hide();
    }
  }

  async function toggleAiCamera(camId) {
    try {
      const resp = await fetch('/api/ai/cameras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toggle: camId })
      });
      if (resp.ok) {
        const data = await resp.json();
        window.AppData.activeAiCameras = data.active_cameras;
      } else {
        const list = window.AppData.activeAiCameras || [1, 2];
        if (list.includes(camId)) {
          window.AppData.activeAiCameras = list.filter(x => x !== camId);
        } else {
          window.AppData.activeAiCameras = [...list, camId].sort((a,b) => a - b);
        }
      }
    } catch (e) {
      const list = window.AppData.activeAiCameras || [1, 2];
      if (list.includes(camId)) {
        window.AppData.activeAiCameras = list.filter(x => x !== camId);
      } else {
        window.AppData.activeAiCameras = [...list, camId].sort((a,b) => a - b);
      }
    }
    updateAiBadges();
    const isNowActive = (window.AppData.activeAiCameras || []).includes(camId);
    toast(`${isNowActive ? '🤖 AI Activated' : '📴 AI Deactivated'} for Camera ${camId}`, isNowActive ? 'success' : 'info');
  }

  return { 
    init, 
    navigateTo, 
    toast, 
    updateCameraHUD, 
    updateCameraStats,
    setCameraView,
    onCameraSelectChange,
    onQuadSelectChange,
    focusCamera,
    openAiCameraModal,
    saveAiCameraModalSelection,
    aiSelectPreset,
    onAiCheckboxChange,
    toggleAiCamera,
    updateAiBadges
  };
})();

window.App = App;
document.addEventListener('DOMContentLoaded', () => App.init());
