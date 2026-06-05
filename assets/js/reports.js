/**
 * reports.js
 * Report generation with PDF (jsPDF) and Excel (SheetJS) export
 */

const ReportsModule = (() => {

  let currentType = 'daily';

  const REPORT_LABELS = {
    daily: 'Daily Report — ' + new Date().toLocaleDateString('en-BD', { year: 'numeric', month: 'long', day: 'numeric' }),
    weekly: 'Weekly Report — ' + getWeekLabel(),
    monthly: 'Monthly Report — ' + new Date().toLocaleDateString('en-BD', { year: 'numeric', month: 'long' })
  };

  function getWeekLabel() {
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return `${start.toLocaleDateString('en-BD', { day: '2-digit', month: 'short' })} – ${end.toLocaleDateString('en-BD', { day: '2-digit', month: 'short', year: 'numeric' })}`;
  }

  async function getReportData(type) {
    if (window.AppData.isBackend) {
      try {
        const resp = await fetch(`/api/reports?type=${type}`);
        if (resp.ok) {
          const data = await resp.json();
          return {
            rows: data.rows,
            totalCount: data.totalCount,
            totalRevenue: data.totalRevenue,
            multiplier: type === 'weekly' ? 7 : type === 'monthly' ? 30 : 1
          };
        }
      } catch (e) {
        console.error('[Reports] Error loading report data:', e);
      }
    }

    const d = window.AppData;
    const rev = d.revenue;
    const multiplier = type === 'weekly' ? 7 : type === 'monthly' ? 30 : 1;

    const rows = Object.entries(rev.byType)
      .filter(([, v]) => v.count > 0)
      .map(([vehicleType, v]) => ({
        vehicle_type: vehicleType,
        count: Math.round(v.count * multiplier),
        rate: d.VEHICLE_RATES[vehicleType],
        revenue: Math.round(v.revenue * multiplier)
      }));

    const totalCount = rows.reduce((s, r) => s + r.count, 0);
    const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);

    return { rows, totalCount, totalRevenue, multiplier };
  }

  async function renderReportTable() {
    const container = document.getElementById('report-table-container');
    const titleEl = document.getElementById('report-title');
    const summaryContainer = document.getElementById('report-summary');
    if (!container) return;

    if (titleEl) titleEl.textContent = REPORT_LABELS[currentType];

    const { rows, totalCount, totalRevenue } = await getReportData(currentType);
    const d = window.AppData;

    // Summary cards
    if (summaryContainer) {
      summaryContainer.innerHTML = `
        <div class="col-md-4">
          <div class="summary-stat">
            <div class="s-value">${totalCount.toLocaleString()}</div>
            <div class="s-label">Total Vehicles</div>
          </div>
        </div>
        <div class="col-md-4">
          <div class="summary-stat">
            <div class="s-value text-success-c">৳${totalRevenue.toLocaleString()}</div>
            <div class="s-label">Total Revenue</div>
          </div>
        </div>
        <div class="col-md-4">
          <div class="summary-stat">
            <div class="s-value text-primary-c">${rows.length}</div>
            <div class="s-label">Vehicle Categories</div>
          </div>
        </div>`;
    }

    // Table
    const tableRows = rows.map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>
          <span class="type-badge ${d.VEHICLE_COLORS[r.vehicle_type]}" style="font-size:12px;">
            ${d.VEHICLE_EMOJIS[r.vehicle_type]} ${r.vehicle_type}
          </span>
        </td>
        <td>${r.count.toLocaleString()}</td>
        <td>৳${r.rate}</td>
        <td style="font-weight:700;color:var(--success);">৳${r.revenue.toLocaleString()}</td>
        <td style="font-size:11px;color:var(--text-muted);">${((r.revenue / totalRevenue) * 100).toFixed(1)}%</td>
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
            ${tableRows}
            <tr style="border-top:2px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.02);">
              <td colspan="2" style="font-weight:700;color:var(--text-primary);">GRAND TOTAL</td>
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
    document.querySelectorAll('.report-tab').forEach(t => t.classList.remove('active'));
    const tab = document.getElementById(`tab-${type}`);
    if (tab) tab.classList.add('active');
    await renderReportTable();
  }

  // ── PDF Export ────────────────────────────────────────
  async function exportPDF() {
    if (typeof jspdf === 'undefined' && typeof window.jspdf === 'undefined') {
      showToast('PDF library loading... please try again.', 'error');
      return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Header
    doc.setFillColor(11, 17, 32);
    doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    doc.text('AI Toll & Lease Collection Monitoring System', 105, 16, { align: 'center' });
    doc.setFontSize(11);
    doc.setFont(undefined, 'normal');
    doc.text(REPORT_LABELS[currentType], 105, 26, { align: 'center' });
    doc.setFontSize(9);
    doc.text(`Generated: ${new Date().toLocaleString('en-BD')}`, 105, 34, { align: 'center' });

    // Data
    const { rows, totalCount, totalRevenue } = await getReportData(currentType);

    const tableData = rows.map((r, i) => [
      i + 1,
      r.vehicle_type,
      r.count.toLocaleString(),
      `৳${r.rate}`,
      `৳${r.revenue.toLocaleString()}`,
      `${((r.revenue / totalRevenue) * 100).toFixed(1)}%`
    ]);
    tableData.push(['', 'GRAND TOTAL', totalCount.toLocaleString(), '—', `৳${totalRevenue.toLocaleString()}`, '100%']);

    doc.autoTable({
      startY: 48,
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
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text('This report is generated by AI Toll Monitoring System. Confidential.', 105, finalY, { align: 'center' });

    doc.save(`toll-report-${currentType}-${new Date().toISOString().slice(0,10)}.pdf`);
    showToast('PDF report exported!', 'success');
  }

  // ── Excel Export ──────────────────────────────────────
  async function exportExcel() {
    if (typeof XLSX === 'undefined') {
      showToast('Excel library loading... please try again.', 'error');
      return;
    }

    const { rows, totalCount, totalRevenue } = await getReportData(currentType);

    const wsData = [
      ['AI Toll & Lease Collection Monitoring System'],
      [REPORT_LABELS[currentType]],
      [`Generated: ${new Date().toLocaleString('en-BD')}`],
      [],
      ['#', 'Vehicle Type', 'Total Count', 'Rate (BDT)', 'Revenue (BDT)', 'Share %'],
      ...rows.map((r, i) => [
        i + 1, r.vehicle_type, r.count, r.rate, r.revenue,
        parseFloat(((r.revenue / totalRevenue) * 100).toFixed(1))
      ]),
      ['', 'GRAND TOTAL', totalCount, '', totalRevenue, 100]
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Column widths
    ws['!cols'] = [
      { wch: 4 }, { wch: 15 }, { wch: 14 }, { wch: 12 }, { wch: 16 }, { wch: 10 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Toll Report');
    XLSX.writeFile(wb, `toll-report-${currentType}-${new Date().toISOString().slice(0,10)}.xlsx`);
    showToast('Excel report exported!', 'success');
  }

  function showToast(msg, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast-msg ${type}`;
    toast.innerHTML = `
      <i class="bi bi-${type === 'success' ? 'download' : 'exclamation-circle-fill'}" style="color:var(--${type === 'success' ? 'success' : 'danger'});font-size:18px;"></i>
      <span>${msg}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
  }

  return {
    init() {
      renderReportTable();
    },
    setReportType,
    exportPDF,
    exportExcel
  };
})();

window.ReportsModule = ReportsModule;
