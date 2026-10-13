/**
 * reports.js
 * 3-Shift (8-Hour Slot), Custom Date-Time, and Camera-Wise Report Generation
 * Supports PDF (jsPDF) and Excel (SheetJS) export
 */

const ReportsModule = (() => {

  let currentType = 'daily';
  let selectedSlot = 'slot2'; // Default to Evening Shift (14:00 - 22:00 / 2 PM - 10 PM)
  let selectedDate = new Date().toISOString().slice(0, 10);
  let startTime = '14:00';
  let endTime = '22:00';
  let dynamicReportLabel = '';
  let selectedCameras = 'all'; // 'all', '1', '1,2', or comma-separated list
  let multiSelectedCameras = []; // Array of integers for multi-select
  let cachedCameraBreakdown = [];
  let cameraFilterLabel = 'All Cameras (Combined)';

  const SLOT_NAMES = {
    slot1: 'Slot 1: Morning Shift (06:00 AM – 02:00 PM)',
    slot2: 'Slot 2: Evening Shift (02:00 PM – 10:00 PM)',
    slot3: 'Slot 3: Night Shift (10:00 PM – 06:00 AM)',
    custom: 'Custom Time Slot'
  };

  function getWeekLabel() {
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return `${start.toLocaleDateString('en-BD', { day: '2-digit', month: 'short' })} – ${end.toLocaleDateString('en-BD', { day: '2-digit', month: 'short', year: 'numeric' })}`;
  }

  function getReportTitle() {
    if (dynamicReportLabel) return dynamicReportLabel;
    if (currentType === 'slot') {
      const slotName = SLOT_NAMES[selectedSlot] || '8-Hour Shift Slot';
      if (selectedSlot === 'custom') {
        return `Custom Slot (${startTime} – ${endTime}) · ${selectedDate}`;
      }
      return `${slotName} · ${selectedDate}`;
    }
    if (currentType === 'weekly') {
      return 'Weekly Report — ' + getWeekLabel();
    }
    if (currentType === 'monthly') {
      return 'Monthly Report — ' + new Date().toLocaleDateString('en-BD', { year: 'numeric', month: 'long' });
    }
    return 'Daily Report — ' + (selectedDate ? new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-BD', { year: 'numeric', month: 'long', day: 'numeric' }) : new Date().toLocaleDateString('en-BD', { year: 'numeric', month: 'long', day: 'numeric' }));
  }

  // ── Camera Selection Dropdown & Modal ───────────────────────
  function populateCameraDropdown() {
    const selectEl = document.getElementById('report-camera-select');
    if (!selectEl) return;

    const cams = (window.AppData && window.AppData.cameras) || [];
    let html = `
      <option value="all" ${selectedCameras === 'all' ? 'selected' : ''}>🌐 All Cameras Combined (14 Lanes)</option>
      <option value="1,2" ${selectedCameras === '1,2' ? 'selected' : ''}>📹 Cameras 1 & 2 (Main Toll Lanes)</option>
    `;

    cams.forEach(c => {
      const isSel = selectedCameras === String(c.id);
      html += `<option value="${c.id}" ${isSel ? 'selected' : ''}>📹 Camera ${c.id}: ${c.name} (${c.lane})</option>`;
    });

    const isCustom = selectedCameras !== 'all' && selectedCameras !== '1,2' && !cams.some(c => String(c.id) === selectedCameras);
    if (isCustom) {
      html += `<option value="${selectedCameras}" selected>⚙️ Selected Cameras (${selectedCameras})</option>`;
    }

    selectEl.innerHTML = html;
  }

  function onCameraSelectChange(val) {
    if (val === 'custom') {
      openMultiCameraModal();
      return;
    }
    selectedCameras = val;
    if (val === 'all') {
      multiSelectedCameras = [];
    } else {
      multiSelectedCameras = val.split(',').map(x => parseInt(x, 10)).filter(x => !isNaN(x));
    }
    renderReportTable();
  }

  function openMultiCameraModal() {
    const cams = (window.AppData && window.AppData.cameras) || [];
    const grid = document.getElementById('report-camera-checkbox-grid');
    if (!grid) return;

    // Current active selection
    let activeIds = [];
    if (selectedCameras === 'all') {
      activeIds = cams.map(c => c.id);
    } else {
      activeIds = selectedCameras.split(',').map(x => parseInt(x.trim(), 10)).filter(x => !isNaN(x));
    }

    grid.innerHTML = cams.map(c => {
      const isChecked = activeIds.includes(c.id);
      return `
        <div class="col-md-6">
          <label class="d-flex align-items-center justify-content-between p-2 rounded" 
                 style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); cursor: pointer; transition: all 0.2s;"
                 id="report-cam-label-${c.id}">
            <div class="d-flex align-items-center gap-2">
              <input type="checkbox" class="form-check-input report-cam-checkbox" 
                     value="${c.id}" ${isChecked ? 'checked' : ''} 
                     onchange="ReportsModule.onModalCheckboxChange()"
                     style="cursor: pointer; width: 17px; height: 17px;">
              <div>
                <div style="font-size: 13px; font-weight: 600; color: #f8fafc;">${c.name}</div>
                <div style="font-size: 11px; color: #94a3b8;"><i class="bi bi-geo-alt me-1"></i>${c.lane}</div>
              </div>
            </div>
            <span class="badge" style="background: rgba(59,130,246,0.15); color: #60a5fa; font-size: 10px;">Ch ${c.channel}</span>
          </label>
        </div>
      `;
    }).join('');

    updateModalSelectedBadge();

    const modalEl = document.getElementById('reportCameraModal');
    if (modalEl && window.bootstrap) {
      const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
      modal.show();
    }
  }

  function onModalCheckboxChange() {
    updateModalSelectedBadge();
  }

  function updateModalSelectedBadge() {
    const checkboxes = document.querySelectorAll('.report-cam-checkbox:checked');
    const badge = document.getElementById('report-modal-selected-badge');
    const total = document.querySelectorAll('.report-cam-checkbox').length;
    if (badge) {
      badge.textContent = `${checkboxes.length} of ${total} Selected`;
    }
  }

  function selectPreset(preset) {
    const checkboxes = document.querySelectorAll('.report-cam-checkbox');
    checkboxes.forEach(cb => {
      const cid = parseInt(cb.value, 10);
      if (preset === 'all') {
        cb.checked = true;
      } else if (preset === 'lanes12') {
        cb.checked = (cid === 1 || cid === 2);
      } else if (preset === 'lanes14') {
        cb.checked = (cid >= 1 && cid <= 4);
      } else if (preset === 'clear') {
        cb.checked = false;
      }
    });
    updateModalSelectedBadge();
  }

  function saveMultiCameraSelection() {
    const checked = Array.from(document.querySelectorAll('.report-cam-checkbox:checked'))
                         .map(cb => parseInt(cb.value, 10));

    const cams = (window.AppData && window.AppData.cameras) || [];
    if (checked.length === 0 || checked.length === cams.length) {
      selectedCameras = 'all';
      multiSelectedCameras = [];
    } else {
      selectedCameras = checked.sort((a,b) => a - b).join(',');
      multiSelectedCameras = checked;
    }

    populateCameraDropdown();

    const modalEl = document.getElementById('reportCameraModal');
    if (modalEl && window.bootstrap) {
      const modal = bootstrap.Modal.getInstance(modalEl);
      if (modal) modal.hide();
    }

    renderReportTable();
    showToast(`Filter applied: ${checked.length} cameras selected`, 'success');
  }

  function focusSingleCamera(camId) {
    selectedCameras = String(camId);
    multiSelectedCameras = [camId];
    populateCameraDropdown();
    renderReportTable();
    showToast(`Focused report on Camera ${camId}`, 'info');
  }

  // ── Data Fetching ───────────────────────────────────────────
  async function getReportData(type) {
    if (window.AppData && window.AppData.isBackend) {
      try {
        let url = `/api/reports?type=${type}&date=${selectedDate}&camera_ids=${selectedCameras}`;
        if (type === 'slot') {
          url += `&slot=${selectedSlot}&start_time=${startTime}&end_time=${endTime}`;
        }
        const resp = await fetch(url);
        if (resp.ok) {
          const data = await resp.json();
          if (data.label) dynamicReportLabel = data.label;
          cachedCameraBreakdown = data.camera_breakdown || [];
          cameraFilterLabel = data.camera_filter_label || 'All Cameras';
          return {
            rows: data.rows || [],
            totalCount: data.totalCount || 0,
            totalRevenue: data.totalRevenue || 0,
            camera_breakdown: cachedCameraBreakdown,
            camera_filter_label: cameraFilterLabel,
            multiplier: 1
          };
        }
      } catch (e) {
        console.error('[Reports] Error loading report data:', e);
      }
    }

    // Client-side fallback computation
    const d = window.AppData || {};
    let multiplier = 1;
    if (type === 'slot') multiplier = 0.35; // 8-hour shift is ~35% of daily total
    else if (type === 'weekly') multiplier = 7;
    else if (type === 'monthly') multiplier = 30;

    let records = d.records || [];
    if (selectedCameras !== 'all') {
      const allowed = selectedCameras.split(',').map(x => parseInt(x, 10));
      records = records.filter(r => allowed.includes(r.camera_id));
    }

    const byType = {};
    const camStats = {};
    records.forEach(r => {
      const t = r.vehicle_type || 'Car';
      const cid = r.camera_id || 1;
      const amt = r.toll_amount || ((d.VEHICLE_RATES && d.VEHICLE_RATES[t]) || 20);

      if (!byType[t]) byType[t] = { count: 0, revenue: 0 };
      byType[t].count++;
      byType[t].revenue += amt;

      if (!camStats[cid]) camStats[cid] = { count: 0, revenue: 0, by_type: {} };
      camStats[cid].count++;
      camStats[cid].revenue += amt;
      camStats[cid].by_type[t] = (camStats[cid].by_type[t] || 0) + 1;
    });

    const rows = Object.entries(byType).map(([vehicleType, v]) => ({
      vehicle_type: vehicleType,
      count: Math.max(1, Math.round(v.count * multiplier)),
      rate: (d.VEHICLE_RATES && d.VEHICLE_RATES[vehicleType]) || 20,
      revenue: Math.round(v.revenue * multiplier)
    }));

    const totalCount = rows.reduce((s, r) => s + r.count, 0);
    const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);

    const cams = d.cameras || [];
    const camera_breakdown = Object.entries(camStats).map(([cidStr, cs]) => {
      const cid = parseInt(cidStr, 10);
      const camObj = cams.find(c => c.id === cid) || { name: `Camera ${cid}`, lane: `Lane ${cid}`, channel: String(cid) };
      return {
        camera_id: cid,
        name: camObj.name,
        lane: camObj.lane,
        channel: camObj.channel,
        total_count: Math.round(cs.count * multiplier),
        total_revenue: Math.round(cs.revenue * multiplier),
        by_type: Object.entries(cs.by_type).map(([vt, cnt]) => ({
          vehicle_type: vt,
          count: Math.round(cnt * multiplier),
          revenue: Math.round(cnt * multiplier * ((d.VEHICLE_RATES && d.VEHICLE_RATES[vt]) || 20))
        }))
      };
    });

    cachedCameraBreakdown = camera_breakdown;
    cameraFilterLabel = selectedCameras === 'all' ? 'All Cameras Combined' : `Cameras [${selectedCameras}]`;

    return { rows, totalCount, totalRevenue, camera_breakdown, camera_filter_label: cameraFilterLabel, multiplier };
  }

  // ── Render Report View ──────────────────────────────────────
  async function renderReportTable() {
    const container = document.getElementById('report-table-container');
    const titleEl = document.getElementById('report-title');
    const subtitleEl = document.getElementById('report-subtitle');
    const summaryContainer = document.getElementById('report-summary');
    const cameraBreakdownContainer = document.getElementById('report-camera-breakdown-section');
    if (!container) return;

    const { rows, totalCount, totalRevenue, camera_breakdown, camera_filter_label } = await getReportData(currentType);
    const d = window.AppData || {};

    if (titleEl) titleEl.textContent = getReportTitle();
    if (subtitleEl) {
      subtitleEl.innerHTML = `<span class="badge" style="background:rgba(59,130,246,0.15);color:#60a5fa;border:1px solid rgba(59,130,246,0.3);"><i class="bi bi-camera-video me-1"></i>${camera_filter_label}</span> · Dhaka Bypass Toll Plaza AI Audit`;
    }

    // Summary Cards (4 stats)
    if (summaryContainer) {
      summaryContainer.innerHTML = `
        <div class="col-md-3">
          <div class="summary-stat">
            <div class="s-value text-primary-c">${totalCount.toLocaleString()}</div>
            <div class="s-label">Total Vehicles in Shift</div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="summary-stat">
            <div class="s-value text-success-c">৳${totalRevenue.toLocaleString()}</div>
            <div class="s-label">Total Toll Collection</div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="summary-stat">
            <div class="s-value" style="color:#fbbf24;">${rows.length}</div>
            <div class="s-label">Active Categories</div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="summary-stat">
            <div class="s-value" style="color:#a855f7; font-size:18px; line-height:28px;">
              ${(camera_breakdown && camera_breakdown.length) || (selectedCameras === 'all' ? 14 : 1)} Lane(s)
            </div>
            <div class="s-label">Camera Filter Scope</div>
          </div>
        </div>`;
    }

    // Camera Breakdown Section
    if (cameraBreakdownContainer) {
      if (camera_breakdown && camera_breakdown.length > 0) {
        const cardsHtml = camera_breakdown.map(cb => {
          const share = totalRevenue > 0 ? ((cb.total_revenue / totalRevenue) * 100).toFixed(1) : 0;
          const isSolo = selectedCameras === String(cb.camera_id);
          return `
            <div class="col-md-6 col-lg-4">
              <div class="glass-card h-100" style="border: 1px solid rgba(255,255,255,0.08); background: rgba(15,23,42,0.6);">
                <div class="card-body-custom p-3">
                  <div class="d-flex justify-content-between align-items-start mb-2">
                    <div>
                      <div style="font-size: 13px; font-weight: 700; color: #f8fafc;" title="${cb.name}">
                        📹 ${cb.name}
                      </div>
                      <span class="badge mt-1" style="background: rgba(59,130,246,0.15); color: #60a5fa; font-size: 10px;">
                        <i class="bi bi-geo-alt me-1"></i>${cb.lane}
                      </span>
                    </div>
                    <span class="badge" style="background: rgba(16,185,129,0.15); color: #34d399; font-size: 11px; font-weight: 700;">
                      ${share}% Share
                    </span>
                  </div>

                  <div class="d-flex justify-content-between align-items-center my-3 py-2 px-3 rounded" style="background: rgba(0,0,0,0.25);">
                    <div>
                      <div style="font-size: 10px; color: #94a3b8; text-transform: uppercase;">Vehicles</div>
                      <div style="font-size: 18px; font-weight: 700; color: #38bdf8;">${cb.total_count.toLocaleString()}</div>
                    </div>
                    <div class="text-end">
                      <div style="font-size: 10px; color: #94a3b8; text-transform: uppercase;">Collection</div>
                      <div style="font-size: 18px; font-weight: 800; color: #22c55e;">৳${cb.total_revenue.toLocaleString()}</div>
                    </div>
                  </div>

                  <div class="d-flex justify-content-between align-items-center">
                    <span style="font-size: 11px; color: #94a3b8;">
                      Ch ${cb.channel || cb.camera_id} · AI Active
                    </span>
                    ${isSolo ? `
                      <button class="btn btn-sm btn-outline-warning py-0 px-2" style="font-size: 11px;" onclick="ReportsModule.onCameraSelectChange('all')">
                        <i class="bi bi-x-circle me-1"></i> Clear Filter
                      </button>
                    ` : `
                      <button class="btn btn-sm btn-outline-primary py-0 px-2" style="font-size: 11px;" onclick="ReportsModule.focusSingleCamera(${cb.camera_id})">
                        <i class="bi bi-funnel-fill me-1"></i> Solo Report
                      </button>
                    `}
                  </div>
                </div>
              </div>
            </div>
          `;
        }).join('');

        // If multiple cameras, show comparison table
        let compTableHtml = '';
        if (camera_breakdown.length >= 2) {
          const compRows = camera_breakdown.map((cb, idx) => `
            <tr>
              <td>${idx + 1}</td>
              <td style="font-weight: 600; color: #f8fafc;">${cb.name}</td>
              <td><span class="badge" style="background: rgba(255,255,255,0.06); color: #cbd5e1; font-size:11px;">${cb.lane}</span></td>
              <td style="font-weight: 700; color: #38bdf8;">${cb.total_count.toLocaleString()}</td>
              <td style="font-weight: 700; color: #22c55e;">৳${cb.total_revenue.toLocaleString()}</td>
              <td style="font-size: 11px; color: #94a3b8;">${totalRevenue > 0 ? ((cb.total_revenue / totalRevenue) * 100).toFixed(1) : 0}%</td>
              <td>
                <button class="btn btn-sm btn-outline-info py-0 px-2" style="font-size: 10px;" onclick="ReportsModule.focusSingleCamera(${cb.camera_id})">
                  <i class="bi bi-zoom-in"></i> Focus
                </button>
              </td>
            </tr>
          `).join('');

          compTableHtml = `
            <div class="glass-card mt-3">
              <div class="card-header-custom d-flex justify-content-between align-items-center">
                <h6><i class="bi bi-bar-chart-steps text-primary-c"></i> Camera / Lane Accounting Comparison</h6>
                <span class="badge" style="background: rgba(59,130,246,0.15); color: #60a5fa;">${camera_breakdown.length} Cameras Audited</span>
              </div>
              <div class="card-body-custom p-0">
                <div class="table-responsive">
                  <table class="detection-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Camera Name</th>
                        <th>Lane / Booth</th>
                        <th>Total Vehicles</th>
                        <th>Total Revenue</th>
                        <th>Share %</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${compRows}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          `;
        }

        cameraBreakdownContainer.innerHTML = `
          <div class="d-flex justify-content-between align-items-center mb-3">
            <h6 class="mb-0" style="font-weight: 700; color: var(--text-primary);">
              <i class="bi bi-camera-reels-fill text-info-c me-1"></i> Camera-Wise Revenue Breakdown
            </h6>
            <div class="d-flex gap-2">
              <button class="btn btn-sm btn-outline-secondary py-1 px-2" onclick="App.openRenameCameraModal()" style="font-size: 11px; color: #cbd5e1;">
                <i class="bi bi-pencil me-1"></i> Rename Cameras
              </button>
              <button class="btn btn-sm btn-outline-primary py-1 px-2" onclick="ReportsModule.openMultiCameraModal()" style="font-size: 11px;">
                <i class="bi bi-filter me-1"></i> Change Camera Filter
              </button>
            </div>
          </div>
          <div class="row g-3">
            ${cardsHtml}
          </div>
          ${compTableHtml}
        `;
        cameraBreakdownContainer.style.display = 'block';
      } else {
        cameraBreakdownContainer.innerHTML = '';
        cameraBreakdownContainer.style.display = 'none';
      }
    }

    // Vehicle Category Detail Table
    const tableRows = rows.map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>
          <span class="type-badge ${(d.VEHICLE_COLORS && d.VEHICLE_COLORS[r.vehicle_type]) || 'type-car'}" style="font-size:12px;">
            ${(d.VEHICLE_EMOJIS && d.VEHICLE_EMOJIS[r.vehicle_type]) || '🚗'} ${r.vehicle_type}
          </span>
        </td>
        <td>${r.count.toLocaleString()}</td>
        <td>৳${r.rate}</td>
        <td style="font-weight:700;color:var(--success);">৳${r.revenue.toLocaleString()}</td>
        <td style="font-size:11px;color:var(--text-muted);">${totalRevenue > 0 ? ((r.revenue / totalRevenue) * 100).toFixed(1) : 0}%</td>
      </tr>`).join('');

    container.innerHTML = `
      <div class="detection-table-wrapper">
        <table class="detection-table" id="report-data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Vehicle Type</th>
              <th>Total Count</th>
              <th>Rate (৳)</th>
              <th>Revenue</th>
              <th>Share %</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows || '<tr><td colspan="6" class="text-center py-4 text-muted">No vehicle detections logged for this camera / time slot.</td></tr>'}
            <tr style="border-top:2px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.02);">
              <td colspan="2" style="font-weight:700;color:var(--text-primary);">TOTAL (${cameraFilterLabel})</td>
              <td style="font-weight:700;color:var(--text-primary);">${totalCount.toLocaleString()}</td>
              <td>—</td>
              <td style="font-weight:800;color:var(--success);font-size:15px;">৳${totalRevenue.toLocaleString()}</td>
              <td style="font-weight:700;color:var(--text-primary);">100%</td>
            </tr>
          </tbody>
        </table>
      </div>`;
  }

  async function setReportType(type) {
    currentType = type;
    dynamicReportLabel = '';
    document.querySelectorAll('.report-tab').forEach(t => t.classList.remove('active'));
    const tab = document.getElementById(`tab-${type}`);
    if (tab) tab.classList.add('active');

    // Show / hide slot filter panel
    const filterPanel = document.getElementById('slot-filter-panel');
    if (filterPanel) {
      filterPanel.style.display = (type === 'daily' || type === 'slot') ? 'block' : 'none';
    }
    await renderReportTable();
  }

  function onSlotSelectChange(val) {
    selectedSlot = val;
    dynamicReportLabel = '';
    const customTimeGroup = document.getElementById('custom-time-group');
    if (customTimeGroup) {
      customTimeGroup.style.display = (val === 'custom') ? 'block' : 'none';
    }
    if (val === 'slot1') {
      startTime = '06:00';
      endTime = '14:00';
    } else if (val === 'slot2') {
      startTime = '14:00';
      endTime = '22:00';
    } else if (val === 'slot3') {
      startTime = '22:00';
      endTime = '06:00';
    }
  }

  async function applySlotFilter() {
    const dateInput = document.getElementById('report-date-input');
    const slotSelect = document.getElementById('report-slot-select');
    const startInput = document.getElementById('report-start-time');
    const endInput = document.getElementById('report-end-time');

    if (dateInput && dateInput.value) selectedDate = dateInput.value;
    if (slotSelect && slotSelect.value) selectedSlot = slotSelect.value;
    if (startInput && startInput.value) startTime = startInput.value;
    if (endInput && endInput.value) endTime = endInput.value;

    currentType = 'slot';
    dynamicReportLabel = '';
    document.querySelectorAll('.report-tab').forEach(t => t.classList.remove('active'));
    const tab = document.getElementById('tab-slot');
    if (tab) tab.classList.add('active');

    await renderReportTable();
    showToast(`Generated report for ${getReportTitle()}`, 'success');
  }

  // ── Exports (PDF & Excel) ───────────────────────────────────
  async function exportPDF() {
    if (typeof jspdf === 'undefined' && typeof window.jspdf === 'undefined') {
      showToast('PDF library loading... please try again.', 'error');
      return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const titleText = getReportTitle();

    // Header
    doc.setFillColor(11, 17, 32);
    doc.rect(0, 0, 210, 44, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(15);
    doc.setFont(undefined, 'bold');
    doc.text('AI Toll & Lease Collection Monitoring System', 105, 14, { align: 'center' });
    doc.setFontSize(11);
    doc.setFont(undefined, 'normal');
    doc.text(titleText, 105, 24, { align: 'center' });
    doc.setFontSize(9);
    doc.setTextColor(148, 163, 184);
    doc.text(`Camera Scope: ${cameraFilterLabel} | Generated: ${new Date().toLocaleString('en-BD')}`, 105, 34, { align: 'center' });

    // Data
    const { rows, totalCount, totalRevenue, camera_breakdown } = await getReportData(currentType);

    let startYPos = 52;

    // Optional: Camera Breakdown Table in PDF
    if (camera_breakdown && camera_breakdown.length > 1) {
      const camData = camera_breakdown.map((cb, i) => [
        i + 1,
        cb.name,
        cb.lane,
        cb.total_count.toLocaleString(),
        `৳${cb.total_revenue.toLocaleString()}`,
        `${totalRevenue > 0 ? ((cb.total_revenue / totalRevenue) * 100).toFixed(1) : 0}%`
      ]);

      doc.autoTable({
        startY: startYPos,
        head: [['#', 'Camera Name', 'Lane', 'Vehicles', 'Revenue', 'Share %']],
        body: camData,
        theme: 'grid',
        headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold', fontSize: 9 },
        bodyStyles: { fontSize: 8.5, textColor: [30, 30, 30] },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        margin: { left: 14, right: 14 }
      });

      startYPos = doc.lastAutoTable.finalY + 10;
    }

    const tableData = rows.map((r, i) => [
      i + 1,
      r.vehicle_type,
      r.count.toLocaleString(),
      `৳${r.rate}`,
      `৳${r.revenue.toLocaleString()}`,
      `${totalRevenue > 0 ? ((r.revenue / totalRevenue) * 100).toFixed(1) : 0}%`
    ]);
    tableData.push(['', 'SHIFT / GRAND TOTAL', totalCount.toLocaleString(), '—', `৳${totalRevenue.toLocaleString()}`, '100%']);

    doc.autoTable({
      startY: startYPos,
      head: [['#', 'Vehicle Type', 'Total Count', 'Rate (৳)', 'Revenue', 'Share %']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold', fontSize: 10 },
      bodyStyles: { fontSize: 9, textColor: [30, 30, 30] },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      footStyles: { fontStyle: 'bold', fillColor: [240, 244, 255] },
      margin: { left: 14, right: 14 }
    });

    const finalY = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(8.5);
    doc.setTextColor(100, 100, 100);
    doc.text('Powered & Maintained by N.I.Biz Soft (www.nibizsoft.com) · TollAI Highway Authority', 105, finalY, { align: 'center' });

    const filename = `toll-report-${currentType}-${selectedDate || new Date().toISOString().slice(0,10)}.pdf`;
    doc.save(filename);
    showToast('📄 PDF report exported successfully!', 'success');
  }

  async function exportExcel() {
    if (typeof XLSX === 'undefined') {
      showToast('Excel library loading... please try again.', 'error');
      return;
    }

    const { rows, totalCount, totalRevenue, camera_breakdown } = await getReportData(currentType);
    const titleText = getReportTitle();

    const wsData = [
      ['AI Toll & Lease Collection Monitoring System'],
      [titleText],
      [`Camera Filter Scope: ${cameraFilterLabel}`],
      [`Generated: ${new Date().toLocaleString('en-BD')} | Shift: ${SLOT_NAMES[selectedSlot] || 'Custom'}`],
      [],
    ];

    if (camera_breakdown && camera_breakdown.length > 1) {
      wsData.push(['--- CAMERA-WISE SUMMARY ---']);
      wsData.push(['#', 'Camera Name', 'Lane', 'Vehicles', 'Revenue (BDT)', 'Share %']);
      camera_breakdown.forEach((cb, i) => {
        wsData.push([
          i + 1, cb.name, cb.lane, cb.total_count, cb.total_revenue,
          parseFloat(totalRevenue > 0 ? ((cb.total_revenue / totalRevenue) * 100).toFixed(1) : 0)
        ]);
      });
      wsData.push([]);
    }

    wsData.push(['--- VEHICLE CATEGORY BREAKDOWN ---']);
    wsData.push(['#', 'Vehicle Type', 'Total Count', 'Rate (BDT)', 'Revenue (BDT)', 'Share %']);
    rows.forEach((r, i) => {
      wsData.push([
        i + 1, r.vehicle_type, r.count, r.rate, r.revenue,
        parseFloat(totalRevenue > 0 ? ((r.revenue / totalRevenue) * 100).toFixed(1) : 0)
      ]);
    });
    wsData.push(['', 'GRAND TOTAL', totalCount, '', totalRevenue, 100]);
    wsData.push([]);
    wsData.push(['Powered & Maintained by N.I.Biz Soft (www.nibizsoft.com)']);

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [
      { wch: 4 }, { wch: 28 }, { wch: 22 }, { wch: 14 }, { wch: 16 }, { wch: 10 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Toll Report');
    const filename = `toll-report-${currentType}-${selectedDate || new Date().toISOString().slice(0,10)}.xlsx`;
    XLSX.writeFile(wb, filename);
    showToast('📊 Excel report exported successfully!', 'success');
  }

  function showToast(msg, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast-msg ${type}`;
    toast.innerHTML = `
      <i class="bi bi-${type === 'success' ? 'check-circle-fill' : 'exclamation-circle-fill'}" style="color:var(--${type === 'success' ? 'success' : 'danger'});font-size:18px;"></i>
      <span>${msg}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
  }

  function init() {
    const dateInput = document.getElementById('report-date-input');
    if (dateInput) {
      dateInput.value = selectedDate;
      dateInput.addEventListener('change', (e) => {
        selectedDate = e.target.value;
      });
    }
    const slotSelect = document.getElementById('report-slot-select');
    if (slotSelect) {
      slotSelect.value = selectedSlot;
    }

    populateCameraDropdown();
    renderReportTable();
  }

  return {
    init,
    setReportType,
    onSlotSelectChange,
    applySlotFilter,
    populateCameraDropdown,
    onCameraSelectChange,
    openMultiCameraModal,
    onModalCheckboxChange,
    selectPreset,
    saveMultiCameraSelection,
    focusSingleCamera,
    exportPDF,
    exportExcel
  };
})();

window.ReportsModule = ReportsModule;
