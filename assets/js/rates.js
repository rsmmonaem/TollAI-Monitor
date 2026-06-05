/**
 * rates.js
 * Vehicle Toll Rate Management — inline editing with history log
 */

const RatesModule = (() => {

  const VEHICLE_ICONS = {
    Bike:   { emoji: '🏍️', color: '#818cf8', bg: 'rgba(99,102,241,0.15)' },
    CNG:    { emoji: '🛺', color: '#34d399', bg: 'rgba(16,185,129,0.15)' },
    Auto:   { emoji: '🚐', color: '#fbbf24', bg: 'rgba(245,158,11,0.15)' },
    Pickup: { emoji: '🛻', color: '#22d3ee', bg: 'rgba(6,182,212,0.15)' },
    Bus:    { emoji: '🚌', color: '#60a5fa', bg: 'rgba(59,130,246,0.15)' },
    Truck:  { emoji: '🚛', color: '#f87171', bg: 'rgba(239,68,68,0.15)' },
    Lorry:  { emoji: '🚚', color: '#c084fc', bg: 'rgba(168,85,247,0.15)' }
  };

  let changeHistory = [];

  function renderRatesTable() {
    const container = document.getElementById('rates-table-container');
    if (!container) return;

    const rates = window.AppData.rates;

    const rows = Object.entries(rates).map(([type, rate]) => {
      const info = VEHICLE_ICONS[type] || { emoji: '🚗', color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' };
      return `
        <div class="rate-row" id="rate-row-${type}">
          <div class="rate-vehicle-icon" style="background:${info.bg};color:${info.color};">${info.emoji}</div>
          <div class="rate-vehicle-name">${type}</div>
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="rate-currency">৳</span>
            <input type="number" class="rate-input" id="rate-input-${type}" value="${rate}" min="1" max="9999" step="1">
          </div>
          <div>
            <button class="btn-save-rate" onclick="RatesModule.saveRate('${type}')">
              <i class="bi bi-check-lg"></i> Save
            </button>
          </div>
        </div>`;
    }).join('');

    container.innerHTML = `
      <div style="padding:8px 0;">
        ${rows}
      </div>`;
  }

  function renderHistory() {
    const container = document.getElementById('rate-history');
    if (!container) return;

    if (changeHistory.length === 0) {
      container.innerHTML = `<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:20px;">No rate changes today</div>`;
      return;
    }

    const rows = changeHistory.slice(0, 10).map(h => `
      <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.04);">
        <div style="width:32px;height:32px;border-radius:8px;background:rgba(37,99,235,0.15);display:flex;align-items:center;justify-content:center;font-size:16px;">${VEHICLE_ICONS[h.type]?.emoji || '🚗'}</div>
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:600;color:var(--text-primary);">${h.type}</div>
          <div style="font-size:11px;color:var(--text-muted);">${h.time}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:12px;color:var(--text-muted);">৳${h.oldRate} → <span style="color:#34d399;font-weight:700;">৳${h.newRate}</span></div>
          <div style="font-size:10px;color:var(--text-muted);">by Admin</div>
        </div>
      </div>`).join('');

    container.innerHTML = rows;
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

  function flashRow(type) {
    const row = document.getElementById(`rate-row-${type}`);
    if (row) {
      row.style.background = 'rgba(16,185,129,0.08)';
      row.style.borderRadius = '8px';
      setTimeout(() => { row.style.background = ''; }, 1200);
    }
  }

  async function reloadHistoryFromBackend() {
    try {
      const resp = await fetch('/api/rates/history');
      if (resp.ok) {
        changeHistory = await resp.json();
        renderHistory();
      }
    } catch (e) {
      console.error('[Rates] Error loading history:', e);
    }
  }

  async function saveRate(type) {
    const input = document.getElementById(`rate-input-${type}`);
    if (!input) return;

    const newRate = parseInt(input.value, 10);
    if (isNaN(newRate) || newRate < 1) {
      showToast('Invalid rate value!', 'error');
      return;
    }

    if (window.AppData.isBackend) {
      try {
        const resp = await fetch('/api/rates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vehicle_type: type, rate_amount: newRate })
        });
        if (resp.ok) {
          const res = await resp.json();
          if (res.success) {
            window.AppData.rates[type] = newRate;
            window.AppData.VEHICLE_RATES[type] = newRate;
            await reloadHistoryFromBackend();
            flashRow(type);
            showToast(`${type} rate updated to ৳${newRate}`, 'success');
          } else {
            showToast(res.message || 'Error updating rate', 'error');
          }
        } else {
          showToast('HTTP error updating rate', 'error');
        }
      } catch (e) {
        console.error('[Rates] Error saving rate:', e);
        showToast('Connection error', 'error');
      }
    } else {
      const oldRate = window.AppData.rates[type];
      window.AppData.rates[type] = newRate;
      window.AppData.VEHICLE_RATES[type] = newRate;

      changeHistory.unshift({
        type, oldRate, newRate,
        time: new Date().toLocaleTimeString('en-BD', { hour: '2-digit', minute: '2-digit', hour12: true })
      });

      flashRow(type);
      renderHistory();
      showToast(`${type} rate updated to ৳${newRate}`, 'success');
    }
  }

  async function saveAllRates() {
    const rates = window.AppData.rates;
    let changed = [];
    
    Object.keys(rates).forEach(type => {
      const input = document.getElementById(`rate-input-${type}`);
      if (input) {
        const val = parseInt(input.value, 10);
        if (!isNaN(val) && val > 0 && val !== rates[type]) {
          changed.push({ type, val });
        }
      }
    });

    if (changed.length === 0) {
      showToast('No changes to save', 'info');
      return;
    }

    if (window.AppData.isBackend) {
      let successCount = 0;
      for (const item of changed) {
        try {
          const resp = await fetch('/api/rates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vehicle_type: item.type, rate_amount: item.val })
          });
          if (resp.ok) {
            const res = await resp.json();
            if (res.success) {
              window.AppData.rates[item.type] = item.val;
              window.AppData.VEHICLE_RATES[item.type] = item.val;
              flashRow(item.type);
              successCount++;
            }
          }
        } catch (e) {
          console.error('[Rates] Error saving rate:', e);
        }
      }
      if (successCount > 0) {
        await reloadHistoryFromBackend();
        showToast(`${successCount} rate(s) updated successfully`, 'success');
      } else {
        showToast('Error saving rates to backend', 'error');
      }
    } else {
      changed.forEach(item => {
        const old = rates[item.type];
        rates[item.type] = item.val;
        window.AppData.VEHICLE_RATES[item.type] = item.val;
        changeHistory.unshift({
          type: item.type, oldRate: old, newRate: item.val,
          time: new Date().toLocaleTimeString('en-BD', { hour: '2-digit', minute: '2-digit', hour12: true })
        });
        flashRow(item.type);
      });
      renderHistory();
      showToast(`${changed.length} rate(s) updated successfully`, 'success');
    }
  }

  return {
    init() {
      renderRatesTable();
      if (window.AppData.isBackend) {
        reloadHistoryFromBackend();
      } else {
        renderHistory();
      }
    },
    saveRate,
    saveAllRates
  };
  // Expose reloadHistoryFromBackend for test/sync purposes
  RatesModule.reloadHistoryFromBackend = reloadHistoryFromBackend;
})();

// Expose globally for onclick handlers
window.RatesModule = RatesModule;
