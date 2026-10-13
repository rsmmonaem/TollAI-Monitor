/**
 * detection-table.js
 * Live-updating vehicle detection table with manual verification,
 * calculation checkmark toggling, manual editing, and bulk actions.
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
    Car: `<svg viewBox="0 0 52 36" fill="none" xmlns="http://www.w3.org/2000/svg" width="52" height="36">
      <rect width="52" height="36" rx="4" fill="#1e293b"/>
      <rect x="4" y="14" width="44" height="12" rx="3" fill="none" stroke="#60a5fa" stroke-width="1.8"/>
      <path d="M12 14 L18 8 L34 8 L40 14 Z" fill="rgba(96,165,250,0.15)" stroke="#60a5fa" stroke-width="1.4"/>
      <circle cx="13" cy="26" r="4" stroke="#60a5fa" stroke-width="1.5"/>
      <circle cx="39" cy="26" r="4" stroke="#60a5fa" stroke-width="1.5"/>
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
  let maxSeenId = 0;
  let currentFilter = 'all'; // 'all' | 'included' | 'excluded'
  const MAX_ROWS = 60;

  function toast(msg, type = 'info') {
    if (window.App && typeof window.App.showToast === 'function') {
      window.App.showToast(msg, type);
      return;
    }
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

  function getVehicleSVG(type) {
    return VEHICLE_SVGS[type] || VEHICLE_SVGS['Auto'] || VEHICLE_SVGS['Car'];
  }

  function isCalculated(record) {
    if (!record) return true;
    if (record.is_calculated !== undefined) return Boolean(record.is_calculated);
    if (!record.status) return true;
    return String(record.status).toLowerCase() !== 'excluded';
  }

  function formatTime(entryTime) {
    const d = (entryTime instanceof Date) ? entryTime : new Date(entryTime);
    return isNaN(d.getTime())
      ? '--:--:--'
      : d.toLocaleTimeString('en-BD', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  }

  function buildRow(record, isNew = false) {
    const d = window.AppData;
    const typeClass = (d && d.VEHICLE_COLORS && d.VEHICLE_COLORS[record.vehicle_type]) || '';
    const emoji = (d && d.VEHICLE_EMOJIS && d.VEHICLE_EMOJIS[record.vehicle_type]) || '🚗';
    const timeStr = formatTime(record.entry_time);
    const confidenceColor = record.confidence > 95 ? 'var(--success)' : record.confidence > 90 ? 'var(--warning)' : 'var(--danger)';
    const included = isCalculated(record);

    const tr = document.createElement('tr');
    tr.id = `det-row-${record.id}`;
    tr.setAttribute('data-id', record.id);
    tr.setAttribute('data-status', included ? 'included' : 'excluded');
    if (isNew) tr.classList.add('new-row');
    if (!included) tr.classList.add('row-excluded');

    // Respect active filter
    if (currentFilter === 'included' && !included) {
      tr.style.display = 'none';
    } else if (currentFilter === 'excluded' && included) {
      tr.style.display = 'none';
    }

    const hasImage = d && d.isBackend && record.image_path;
    let imgHtml = getVehicleSVG(record.vehicle_type);
    if (hasImage) {
      const norm = record.image_path.replace(/\\/g, '/');
      const cleanPath = norm.startsWith('/') ? norm : '/' + norm;
      imgHtml = `<img src="${cleanPath}" style="width:100%;height:100%;object-fit:cover;display:block;" onerror="this.parentElement.innerHTML='${getVehicleSVG(record.vehicle_type).replace(/'/g, "\\'")}'" />`;
    }

    tr.innerHTML = `
      <td style="text-align:center;width:36px;">
        <input type="checkbox" class="form-check-input det-row-check" data-id="${record.id}" ${included ? 'checked' : ''} onchange="DetectionTable.onRowCheckboxChange(${record.id}, this.checked)" title="${included ? 'Included in calculation (click to exclude)' : 'Excluded from calculation (click to include)'}" style="cursor:pointer;">
      </td>
      <td style="width:70px;">
        <div style="width:52px;height:36px;border-radius:5px;overflow:hidden;border:1px solid rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:center;background:#1e293b;">
          ${imgHtml}
        </div>
      </td>
      <td>
        <span class="type-badge ${typeClass}">${emoji} ${record.vehicle_type}</span>
      </td>
      <td><span class="plate-badge">${record.plate_number || 'UNREAD'}</span></td>
      <td style="color:var(--text-secondary);font-size:12px;">${timeStr}</td>
      <td><span style="font-size:11.5px;color:var(--text-muted);">CAM-${record.camera_id || 1}</span></td>
      <td class="det-toll-amount" style="font-weight:600;color:var(--text-primary);">৳${record.toll_amount}</td>
      <td>
        ${included
          ? `<button type="button" class="btn-calc-toggle included" onclick="DetectionTable.toggleStatus(${record.id}, false)" title="Click to Exclude from toll calculation"><i class="bi bi-check-circle-fill"></i> Included</button>`
          : `<button type="button" class="btn-calc-toggle excluded" onclick="DetectionTable.toggleStatus(${record.id}, true)" title="Click to Include in toll calculation"><i class="bi bi-x-circle-fill"></i> Excluded</button>`
        }
      </td>
      <td style="text-align:center;">
        <button type="button" class="btn-det-action" onclick="DetectionTable.openEditModal(${record.id})" title="Edit classification, plate or toll fee"><i class="bi bi-pencil-square"></i> Edit</button>
      </td>`;

    return tr;
  }

  function insertRow(record) {
    const tbody = document.getElementById('detection-tbody');
    if (!tbody) return;

    const emptyRow = document.getElementById('empty-detection-row');
    if (emptyRow) emptyRow.remove();

    const rows = tbody.querySelectorAll('tr');
    if (rows.length >= MAX_ROWS) tbody.removeChild(tbody.lastElementChild);

    const tr = buildRow(record, true);
    tbody.insertBefore(tr, tbody.firstChild);

    // Sync record with AppData if it is a new live event
    if (window.AppData && window.AppData.records) {
      if (!window.AppData.records.some(r => r.id === record.id)) {
        window.AppData.records.unshift(record);
        
        // Update type-specific summaries dynamically only if calculated
        if (isCalculated(record)) {
          const type = record.vehicle_type;
          if (window.AppData.revenue) {
            window.AppData.revenue.total += record.toll_amount;
            if (window.AppData.revenue.byType && window.AppData.revenue.byType[type]) {
              window.AppData.revenue.byType[type].count++;
              window.AppData.revenue.byType[type].revenue += record.toll_amount;
            }
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

    // Refresh camera metrics HUD
    if (window.App && window.App.updateCameraStats) {
      window.App.updateCameraStats();
    }
  }

  function populateInitial() {
    const tbody = document.getElementById('detection-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const initial = window.AppData ? window.AppData.getRecentRecords(35) : [];
    if (!initial || initial.length === 0) {
      tbody.innerHTML = '<tr id="empty-detection-row"><td colspan="9" class="text-center py-4 text-muted-c" style="font-size:12px;"><i class="bi bi-camera-video me-1"></i> No vehicles captured yet today. Real-time detection active.</td></tr>';
      maxSeenId = 0;
      return;
    }

    initial.forEach(r => {
      const tr = buildRow(r, false);
      tbody.appendChild(tr);
    });

    if (initial.length > 0) {
      maxSeenId = Math.max(...initial.map(r => r.id || 0));
    }
  }

  function updateRowInDom(id, newRecord) {
    const rows = document.querySelectorAll(`tr[data-id="${id}"]`);
    if (!rows || rows.length === 0) return;

    const newTr = buildRow(newRecord, false);
    rows.forEach(r => {
      r.parentNode.replaceChild(newTr.cloneNode(true), r);
    });
  }

  async function toggleStatus(id, makeIncluded) {
    const record = window.AppData && window.AppData.records ? window.AppData.records.find(r => r.id === id) : null;
    if (record) {
      record.status = makeIncluded ? 'verified' : 'excluded';
      record.is_calculated = makeIncluded;
      updateRowInDom(id, record);
    }

    // Backend sync
    if (window.AppData && window.AppData.isBackend) {
      try {
        await fetch(`/api/detections/${id}/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: makeIncluded ? 'verified' : 'excluded' })
        });
      } catch (err) {
        console.error('[DetectionTable] Failed to update status on server:', err);
      }
    }

    // Recalculate AppData totals
    if (window.AppData && typeof window.AppData.recalculateTotals === 'function') {
      window.AppData.recalculateTotals();
    }
    if (window.App && typeof window.App.updateCameraStats === 'function') {
      window.App.updateCameraStats();
    }

    toast(makeIncluded ? `Vehicle #${id} included in toll calculation` : `Vehicle #${id} excluded from calculation`, makeIncluded ? 'success' : 'info');
  }

  function onRowCheckboxChange(id, checked) {
    toggleStatus(id, checked);
  }

  async function toggleSelectAll(checked) {
    const master1 = document.getElementById('det-select-all');
    const master2 = document.getElementById('det-select-all-full');
    if (master1) master1.checked = checked;
    if (master2) master2.checked = checked;

    const rows = document.querySelectorAll('#detection-tbody tr[data-id]');
    const ids = [];

    rows.forEach(row => {
      const id = parseInt(row.getAttribute('data-id'));
      if (!isNaN(id)) ids.push(id);
    });

    if (ids.length === 0) return;

    // Update records in AppData
    if (window.AppData && window.AppData.records) {
      window.AppData.records.forEach(r => {
        if (ids.includes(r.id)) {
          r.status = checked ? 'verified' : 'excluded';
          r.is_calculated = checked;
          updateRowInDom(r.id, r);
        }
      });
    }

    // Backend bulk sync
    if (window.AppData && window.AppData.isBackend) {
      try {
        await fetch('/api/detections/bulk_status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids, status: checked ? 'verified' : 'excluded' })
        });
      } catch (err) {
        console.error('[DetectionTable] Bulk status sync error:', err);
      }
    }

    if (window.AppData && typeof window.AppData.recalculateTotals === 'function') {
      window.AppData.recalculateTotals();
    }
    if (window.App && typeof window.App.updateCameraStats === 'function') {
      window.App.updateCameraStats();
    }

    toast(checked ? `All ${ids.length} visible vehicles included in calculation` : `All ${ids.length} visible vehicles excluded from calculation`, checked ? 'success' : 'info');
  }

  async function bulkSetSelected(makeIncluded) {
    const checkedBoxes = document.querySelectorAll('#detection-tbody-full .det-row-check:checked, #detection-tbody .det-row-check:checked');
    const idsSet = new Set();
    checkedBoxes.forEach(cb => {
      const id = parseInt(cb.getAttribute('data-id'));
      if (!isNaN(id)) idsSet.add(id);
    });

    const ids = Array.from(idsSet);
    if (ids.length === 0) {
      toast('Please check at least one vehicle to apply bulk action.', 'info');
      return;
    }

    if (window.AppData && window.AppData.records) {
      window.AppData.records.forEach(r => {
        if (ids.includes(r.id)) {
          r.status = makeIncluded ? 'verified' : 'excluded';
          r.is_calculated = makeIncluded;
          updateRowInDom(r.id, r);
        }
      });
    }

    if (window.AppData && window.AppData.isBackend) {
      try {
        await fetch('/api/detections/bulk_status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids, status: makeIncluded ? 'verified' : 'excluded' })
        });
      } catch (err) {
        console.error('[DetectionTable] Bulk update failed:', err);
      }
    }

    if (window.AppData && typeof window.AppData.recalculateTotals === 'function') {
      window.AppData.recalculateTotals();
    }
    if (window.App && typeof window.App.updateCameraStats === 'function') {
      window.App.updateCameraStats();
    }

    toast(`Bulk updated ${ids.length} vehicle(s) to ${makeIncluded ? 'Included' : 'Excluded'}.`, makeIncluded ? 'success' : 'info');
  }

  function setStatusFilter(filter) {
    currentFilter = filter;

    const btnAll = document.getElementById('det-filter-all');
    const btnInc = document.getElementById('det-filter-included');
    const btnExc = document.getElementById('det-filter-excluded');

    if (btnAll) btnAll.classList.toggle('active', filter === 'all');
    if (btnInc) btnInc.classList.toggle('active', filter === 'included');
    if (btnExc) btnExc.classList.toggle('active', filter === 'excluded');

    const allRows = document.querySelectorAll('#detection-tbody tr[data-id], #detection-tbody-full tr[data-id]');
    allRows.forEach(row => {
      const status = row.getAttribute('data-status');
      if (filter === 'all') {
        row.style.display = '';
      } else if (filter === 'included') {
        row.style.display = (status === 'included') ? '' : 'none';
      } else if (filter === 'excluded') {
        row.style.display = (status === 'excluded') ? '' : 'none';
      }
    });
  }

  function openEditModal(id) {
    const record = window.AppData && window.AppData.records ? window.AppData.records.find(r => r.id === id) : null;
    if (!record) {
      toast('Record not found', 'error');
      return;
    }

    // Set form fields
    document.getElementById('edit-det-id').value = record.id;
    document.getElementById('edit-det-id-display').textContent = `#${record.id}`;
    document.getElementById('edit-det-cam-display').textContent = `CAM-${record.camera_id || 1}`;
    document.getElementById('edit-det-time-display').textContent = `Time: ${formatTime(record.entry_time)}`;
    document.getElementById('edit-det-plate').value = record.plate_number || '';
    document.getElementById('edit-det-toll').value = record.toll_amount || 0;
    document.getElementById('edit-det-calc-check').checked = isCalculated(record);

    // Populate Vehicle Type options
    const typeSelect = document.getElementById('edit-det-type');
    typeSelect.innerHTML = '';
    const availableTypes = window.AppData && window.AppData.VEHICLE_RATES ? Object.keys(window.AppData.VEHICLE_RATES) : ['Bike', 'CNG', 'Auto', 'Car', 'Pickup', 'Bus', 'Truck', 'Lorry'];
    
    // Ensure the record's current vehicle type is present
    if (!availableTypes.includes(record.vehicle_type)) {
      availableTypes.push(record.vehicle_type);
    }

    availableTypes.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t;
      const rate = (window.AppData && window.AppData.VEHICLE_RATES && window.AppData.VEHICLE_RATES[t]) ? `(৳${window.AppData.VEHICLE_RATES[t]})` : '';
      opt.textContent = `${t} ${rate}`;
      if (t === record.vehicle_type) opt.selected = true;
      typeSelect.appendChild(opt);
    });

    // Thumbnail Preview
    const previewContainer = document.getElementById('edit-det-img-preview');
    if (previewContainer) {
      if (window.AppData && window.AppData.isBackend && record.image_path) {
        const norm = record.image_path.replace(/\\/g, '/');
        const cleanPath = norm.startsWith('/') ? norm : '/' + norm;
        previewContainer.innerHTML = `<img src="${cleanPath}" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.innerHTML='${getVehicleSVG(record.vehicle_type).replace(/'/g, "\\'")}'" />`;
      } else {
        previewContainer.innerHTML = getVehicleSVG(record.vehicle_type);
      }
    }

    // Show modal via Bootstrap
    const modalEl = document.getElementById('editDetectionModal');
    if (modalEl && window.bootstrap) {
      const modalInstance = window.bootstrap.Modal.getOrCreateInstance(modalEl);
      modalInstance.show();
    }
  }

  function onEditTypeChange(type) {
    // When user changes vehicle type, automatically suggest corresponding toll amount
    if (window.AppData && window.AppData.VEHICLE_RATES && window.AppData.VEHICLE_RATES[type] !== undefined) {
      document.getElementById('edit-det-toll').value = window.AppData.VEHICLE_RATES[type];
    }
    const previewContainer = document.getElementById('edit-det-img-preview');
    if (previewContainer && !previewContainer.querySelector('img')) {
      previewContainer.innerHTML = getVehicleSVG(type);
    }
  }

  async function saveEditRecord() {
    const id = parseInt(document.getElementById('edit-det-id').value);
    const vehicleType = document.getElementById('edit-det-type').value;
    const plateNumber = document.getElementById('edit-det-plate').value.trim();
    const tollAmount = parseInt(document.getElementById('edit-det-toll').value) || 0;
    const isIncluded = document.getElementById('edit-det-calc-check').checked;
    const newStatus = isIncluded ? 'verified' : 'excluded';

    const record = window.AppData && window.AppData.records ? window.AppData.records.find(r => r.id === id) : null;
    if (record) {
      record.vehicle_type = vehicleType;
      record.plate_number = plateNumber;
      record.toll_amount = tollAmount;
      record.status = newStatus;
      record.is_calculated = isIncluded;
      updateRowInDom(id, record);
    }

    // Backend save
    if (window.AppData && window.AppData.isBackend) {
      try {
        await fetch(`/api/detections/${id}/update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vehicle_type: vehicleType,
            plate_number: plateNumber,
            toll_amount: tollAmount,
            status: newStatus
          })
        });
      } catch (err) {
        console.error('[DetectionTable] Server update error:', err);
      }
    }

    // Close modal
    const modalEl = document.getElementById('editDetectionModal');
    if (modalEl && window.bootstrap) {
      const modalInstance = window.bootstrap.Modal.getInstance(modalEl);
      if (modalInstance) modalInstance.hide();
    }

    // Recalculate totals
    if (window.AppData && typeof window.AppData.recalculateTotals === 'function') {
      window.AppData.recalculateTotals();
    }
    if (window.App && typeof window.App.updateCameraStats === 'function') {
      window.App.updateCameraStats();
    }

    toast(`Vehicle #${id} successfully updated and recalculated.`, 'success');
  }

  function startLiveFeed() {
    if (window.AppData && window.AppData.isBackend) {
      feedInterval = setInterval(async () => {
        try {
          const resp = await fetch(`/api/detections?since_id=${maxSeenId}&limit=10`);
          if (resp.ok) {
            const newDetections = await resp.json();
            if (newDetections.length > 0) {
              const sorted = [...newDetections].reverse();
              sorted.forEach(r => {
                r.entry_time = new Date(r.entry_time);
                insertRow(r);
                maxSeenId = Math.max(maxSeenId, r.id);
                displayedCount++;
              });
              
              const badge = document.getElementById('live-count-badge');
              if (badge) badge.textContent = `${displayedCount} detected today`;
            }
          }
        } catch (e) {
          console.error('[DetectionTable] Error polling live feed:', e);
        }
      }, 2500);
    } else {
      recordQueue = (window.AppData && window.AppData.records) ? [...window.AppData.records].reverse() : [];

      feedInterval = setInterval(() => {
        if (!window.AppData) return;

        if (recordQueue.length === 0) {
          const types = Object.keys(window.AppData.VEHICLE_RATES || { Car: 50 });
          const type = types[Math.floor(Math.random() * types.length)];
          const synth = {
            id: ++maxSeenId,
            vehicle_type: type,
            plate_number: `Dhaka Metro Ga-${Math.floor(Math.random()*88+11)}-${Math.floor(Math.random()*8999+1000)}`,
            entry_time: new Date(),
            confidence: parseFloat((88 + Math.random() * 11.5).toFixed(1)),
            camera_id: Math.random() > 0.5 ? 1 : 2,
            toll_amount: window.AppData.VEHICLE_RATES[type] || 50,
            status: 'verified',
            is_calculated: true
          };
          insertRow(synth);
        } else {
          const r = recordQueue.pop();
          r.entry_time = new Date();
          insertRow(r);
        }

        displayedCount++;
        const badge = document.getElementById('live-count-badge');
        if (badge) badge.textContent = `${displayedCount} detected today`;
      }, 2500);
    }
  }

  function stopLiveFeed() {
    if (feedInterval) {
      clearInterval(feedInterval);
      feedInterval = null;
    }
  }

  return {
    init() {
      populateInitial();
      startLiveFeed();
    },
    stop: stopLiveFeed,
    toggleSelectAll,
    bulkSetSelected,
    onRowCheckboxChange,
    toggleStatus,
    openEditModal,
    onEditTypeChange,
    saveEditRecord,
    setStatusFilter
  };
})();

// Export globally
window.DetectionTable = DetectionTable;

window.clearDetectionLogs = async function() {
  if (!confirm('Are you sure you want to clear all vehicle detection logs?')) return;
  
  try {
    const resp = await fetch('/api/detections', { method: 'DELETE' });
    const data = await resp.json();
    if (data.success) {
      document.getElementById('detection-tbody').innerHTML = '';
      const fullTbody = document.getElementById('detection-tbody-full');
      if (fullTbody) fullTbody.innerHTML = '';
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
