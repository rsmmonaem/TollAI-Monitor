/**
 * charts.js
 * All Chart.js charts: Vehicle Distribution, Hourly Traffic, Revenue Trend
 */

const Charts = (() => {

  // ── Color Palette ──────────────────────────────────────
  const COLORS = {
    Bike:   { bg: 'rgba(99,102,241,0.8)',  border: '#818cf8' },
    CNG:    { bg: 'rgba(16,185,129,0.8)',  border: '#34d399' },
    Auto:   { bg: 'rgba(245,158,11,0.8)',  border: '#fbbf24' },
    Pickup: { bg: 'rgba(6,182,212,0.8)',   border: '#22d3ee' },
    Bus:    { bg: 'rgba(59,130,246,0.8)',  border: '#60a5fa' },
    Truck:  { bg: 'rgba(239,68,68,0.8)',   border: '#f87171' },
    Lorry:  { bg: 'rgba(168,85,247,0.8)',  border: '#c084fc' }
  };

  // ── Chart Defaults ─────────────────────────────────────
  Chart.defaults.color = '#94a3b8';
  Chart.defaults.font.family = "'Inter', sans-serif";
  Chart.defaults.font.size = 12;

  const gridColor = 'rgba(255,255,255,0.06)';

  // ── Doughnut: Vehicle Type Distribution ───────────────
  async function initDistributionChart() {
    const ctx = document.getElementById('chartDistribution');
    if (!ctx) return;

    try {
      const resp = await fetch('/api/charts/distribution');
      const rev = await resp.json();
      const labels = Object.keys(rev).filter(k => rev[k].count > 0);
      const data   = labels.map(k => rev[k].count);
      const bgs    = labels.map(k => COLORS[k]?.bg || 'rgba(100,100,100,0.8)');
      const borders= labels.map(k => COLORS[k]?.border || '#aaa');

      if (window._chartDist) window._chartDist.destroy();

      window._chartDist = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{
            data,
            backgroundColor: bgs,
            borderColor: borders,
            borderWidth: 2,
            hoverOffset: 8
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          cutout: '68%',
          plugins: {
            legend: { position: 'bottom', labels: { padding: 16, boxWidth: 12, boxHeight: 12, usePointStyle: true, pointStyle: 'circle' } },
            tooltip: {
              callbacks: {
                label(ctx) {
                  const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                  const pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
                  return ` ${ctx.label}: ${ctx.parsed.toLocaleString()} (${pct}%)`;
                }
              }
            }
          }
        }
      });
    } catch (e) { console.error('Error fetching distribution chart data', e); }
  }

  // ── Bar: Hourly Traffic Analysis ─────────────────────
  async function initHourlyChart() {
    const ctx = document.getElementById('chartHourly');
    if (!ctx) return;

    try {
      const resp = await fetch('/api/charts/hourly');
      const hourly = await resp.json();
      const labels = hourly.map(h => `${String(h.hour).padStart(2,'0')}:00`);
      const counts = hourly.map(h => h.count);

      const peakColor = counts.map(c => {
        if (c > 80) return 'rgba(239,68,68,0.8)';
        if (c > 50) return 'rgba(245,158,11,0.75)';
        return 'rgba(37,99,235,0.75)';
      });

      if (window._chartHourly) window._chartHourly.destroy();

      window._chartHourly = new Chart(ctx, {
        type: 'bar',
        data: {
          labels,
          datasets: [{ label: 'Vehicles', data: counts, backgroundColor: peakColor, borderRadius: 4 }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { x: { grid: { color: gridColor } }, y: { beginAtZero: true, grid: { color: gridColor } } }
        }
      });
    } catch (e) { console.error('Error fetching hourly chart data', e); }
  }

  // ── Line: Revenue Trend ──────────────────────────────
  async function initRevenueTrendChart() {
    const ctx = document.getElementById('chartRevenueTrend');
    if (!ctx) return;

    try {
      const resp = await fetch('/api/charts/trend');
      const trend = await resp.json();
      
      const labels = Array.from({length:24}, (_, i) => `${String(i).padStart(2,'0')}:00`);
      
      if (window._chartRevenue) window._chartRevenue.destroy();

      window._chartRevenue = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'Today',
              data: trend.today,
              borderColor: '#3b82f6',
              backgroundColor: 'rgba(59,130,246,0.1)',
              borderWidth: 2,
              tension: 0.4,
              fill: true,
              pointRadius: 0,
              pointHoverRadius: 6
            },
            {
              label: 'Yesterday',
              data: trend.yesterday,
              borderColor: 'rgba(148,163,184,0.3)',
              borderWidth: 2,
              borderDash: [5, 5],
              tension: 0.4,
              fill: false,
              pointRadius: 0
            }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label(item) { return ` ${item.dataset.label}: ৳${item.parsed.y.toLocaleString()}`; } } }
          },
          scales: {
            x: { grid: { color: gridColor }, ticks: { maxRotation: 45, font: { size: 10 } } },
            y: { grid: { color: gridColor }, beginAtZero: true, ticks: { callback(v) { return '৳' + v.toLocaleString(); } } }
          }
        }
      });
    } catch (e) { console.error('Error fetching trend chart data', e); }
  }

  // ── Revenue by Type Bar (Reports section) ─────────────
  async function initRevenueByTypeChart() {
    const ctx = document.getElementById('chartRevenueByType');
    if (!ctx) return;

    try {
      const resp = await fetch('/api/charts/distribution');
      const rev = await resp.json();
      const labels = Object.keys(rev).filter(k => rev[k].count > 0);
      const data = labels.map(k => rev[k].revenue);

      if (window._chartRevType) window._chartRevType.destroy();

      window._chartRevType = new Chart(ctx, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Revenue (৳)',
            data,
            backgroundColor: labels.map(k => COLORS[k]?.bg || 'rgba(100,100,100,0.8)'),
            borderColor: labels.map(k => COLORS[k]?.border || '#aaa'),
            borderWidth: 1.5,
            borderRadius: 6
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label(item) { return ` ৳${item.parsed.y.toLocaleString()}`; } } } },
          scales: { x: { grid: { color: gridColor } }, y: { grid: { color: gridColor }, beginAtZero: true, ticks: { callback(v) { return '৳' + v.toLocaleString(); } } } }
        }
      });
    } catch (e) { console.error('Error fetching revenue by type chart data', e); }
  }

  return {
    init() {
      initDistributionChart();
      initHourlyChart();
      initRevenueTrendChart();
      initRevenueByTypeChart();
    },

    // Refresh charts if section becomes visible
    refresh() {
      initDistributionChart();
      initHourlyChart();
      initRevenueTrendChart();
      initRevenueByTypeChart();
    }
  };
})();
