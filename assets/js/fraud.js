/**
 * fraud.js
 * Fraud Detection: Operator Report vs AI Count comparison module
 */

const FraudModule = (() => {

  function calcLeakage(type, operatorCount, aiCount) {
    const rate = window.AppData.VEHICLE_RATES[type] || 0;
    const diff = aiCount - operatorCount;
    const leakageTk = diff * rate;
    const pct = operatorCount > 0 ? ((diff / operatorCount) * 100).toFixed(1) : '0.0';
    return { diff, leakageTk, pct };
  }

  function renderFraudTable() {
    const container = document.getElementById('fraud-comparison-table');
    if (!container) return;

    const fraud = window.AppData.fraud;
    let totalOperator = 0, totalAI = 0, totalLeakage = 0;

    const rows = Object.entries(fraud.data).map(([type, d]) => {
      const { diff, leakageTk, pct } = calcLeakage(type, d.operator, d.ai);
      totalOperator += d.operator;
      totalAI += d.ai;
      totalLeakage += leakageTk;

      const hasDiscrepancy = diff > 0;
      const pctNum = parseFloat(pct);

      const emoji = window.AppData.VEHICLE_EMOJIS[type] || '🚗';
      const typeClass = window.AppData.VEHICLE_COLORS[type] || '';

      return `
      <div class="fraud-row">
        <div class="vehicle-name">
          <span class="type-badge ${typeClass}" style="font-size:12px;">${emoji} ${type}</span>
        </div>
        <div class="operator-count" style="font-size:13px;">${d.operator.toLocaleString()}</div>
        <div class="ai-count" style="font-size:13px;">${d.ai.toLocaleString()}</div>
        <div class="discrepancy">
          ${hasDiscrepancy
            ? `<span class="discrepancy-badge">+${diff} | ${pct}%</span>
               <span style="color:#f87171;font-size:12px;font-weight:600;">-৳${leakageTk.toLocaleString()}</span>`
            : `<span class="discrepancy-badge ok">✓ Match</span>`}
        </div>
      </div>`;
    }).join('');

    const totalDiff = totalAI - totalOperator;
    const totalPct = totalOperator > 0 ? ((totalDiff / totalOperator) * 100).toFixed(1) : '0.0';

    container.innerHTML = `
      <div class="fraud-comparison-card">
        <div class="fc-header">
          <span>Vehicle Type</span>
          <span>Operator Report</span>
          <span>AI Count</span>
          <span>Discrepancy</span>
        </div>
        ${rows}
        <div class="fraud-row" style="background:rgba(239,68,68,0.06);border-top:1px solid rgba(239,68,68,0.2);margin-top:4px;">
          <div class="vehicle-name" style="color:var(--text-primary);font-weight:700;">TOTAL</div>
          <div style="font-weight:700;color:var(--text-primary);">${totalOperator.toLocaleString()}</div>
          <div style="font-weight:700;color:#60a5fa;">${totalAI.toLocaleString()}</div>
          <div>
            <span class="discrepancy-badge">+${totalDiff} | ${totalPct}%</span>
          </div>
        </div>
      </div>`;

    // Update summary leakage cards
    updateLeakageCards(totalLeakage, totalOperator, totalAI, totalDiff);
  }

  function updateLeakageCards(leakage, operatorCount, aiCount, diff) {
    const leakageTk = document.getElementById('fraud-leakage-amount');
    const leakagePct = document.getElementById('fraud-leakage-pct');
    const operatorTotal = document.getElementById('fraud-operator-total');
    const aiTotal = document.getElementById('fraud-ai-total');

    if (leakageTk) leakageTk.textContent = `৳${leakage.toLocaleString()}`;
    if (leakagePct) leakagePct.textContent = `${((diff / operatorCount) * 100).toFixed(1)}%`;

    // Animate revenue cards
    if (operatorTotal) {
      animateNum(operatorTotal, operatorCount, 1200);
    }
    if (aiTotal) {
      animateNum(aiTotal, aiCount, 1200);
    }
  }

  function animateNum(el, target, duration) {
    let start = 0;
    const startTime = performance.now();
    function update(now) {
      const p = Math.min((now - startTime) / duration, 1);
      const val = Math.round(start + (target - start) * (1 - Math.pow(1 - p, 3)));
      el.textContent = val.toLocaleString();
      if (p < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
  }

  function renderAlertBanner() {
    const fraud = window.AppData.fraud;
    const leakage = fraud.leakage || 0;

    const banner = document.getElementById('fraud-alert-banner');
    if (!banner) return;

    const bikeDiff = (fraud.data?.Bike?.ai || 0) - (fraud.data?.Bike?.operator || 0);
    const cngDiff = (fraud.data?.CNG?.ai || 0) - (fraud.data?.CNG?.operator || 0);
    const busDiff = (fraud.data?.Bus?.ai || 0) - (fraud.data?.Bus?.operator || 0);
    const totalDiff = Math.max(0, bikeDiff) + Math.max(0, cngDiff) + Math.max(0, busDiff);

    banner.innerHTML = `
      <div class="alert-icon">⚠️</div>
      <div>
        <h5>🚨 Possible Revenue Leakage Detected</h5>
        <p>AI system detected <strong style="color:#fbbf24;">${totalDiff}</strong> unaccounted vehicles. 
        Estimated revenue leakage: <strong style="color:#f87171;">৳${leakage.toLocaleString()}</strong>. 
        Immediate review recommended.</p>
      </div>
      <div style="margin-left:auto;text-align:right;flex-shrink:0;">
        <div style="font-size:22px;font-weight:800;color:#f87171;">৳${leakage.toLocaleString()}</div>
        <div style="font-size:11px;color:var(--text-muted);">Estimated Leakage</div>
      </div>`;
  }

  return {
    async init() {
      if (window.AppData.isBackend) {
        try {
          const resp = await fetch('/api/fraud');
          if (resp.ok) {
            window.AppData.fraud = await resp.json();
          }
        } catch (e) {
          console.error('[Fraud] Error fetching fraud data:', e);
        }
      }
      renderAlertBanner();
      renderFraudTable();
    }
  };
})();
