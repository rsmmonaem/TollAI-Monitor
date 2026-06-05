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
  function initDistributionChart() {
    const ctx = document.getElementById('chartDistribution');
    if (!ctx) return;

    const rev = window.AppData.revenue.byType;
    const labels = Object.keys(rev).filter(k => rev[k].count > 0);
    const data   = labels.map(k => rev[k].count);
    const bgs    = labels.map(k => COLORS[k]?.bg || 'rgba(100,100,100,0.8)');
    const borders= labels.map(k => COLORS[k]?.border || '#aaa');

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
          legend: {
            position: 'bottom',
            labels: {
              padding: 16,
              boxWidth: 12,
              boxHeight: 12,
              usePointStyle: true,
              pointStyle: 'circle'
            }
          },
          tooltip: {
            callbacks: {
              label(ctx) {
                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                const pct = ((ctx.parsed / total) * 100).toFixed(1);
                return ` ${ctx.label}: ${ctx.parsed.toLocaleString()} (${pct}%)`;
              }
            }
          }
        }
      }
    });
  }

  // ── Bar: Hourly Traffic Analysis ─────────────────────
  function initHourlyChart() {
    const ctx = document.getElementById('chartHourly');
    if (!ctx) return;

    const hourly = window.AppData.hourly;
    const labels = hourly.map(h => `${String(h.hour).padStart(2,'0')}:00`);
    const counts = hourly.map(h => h.count);

    // Peak hours gradient feel
    const peakColor = counts.map(c => {
      if (c > 80) return 'rgba(239,68,68,0.8)';
      if (c > 50) return 'rgba(245,158,11,0.75)';
      return 'rgba(37,99,235,0.75)';
    });

    window._chartHourly = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Vehicles',
          data: counts,
          backgroundColor: peakColor,
          borderRadius: 5,
          borderSkipped: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title(items) { return `Hour: ${items[0].label}`; },
              label(item) { return ` ${item.parsed.y} vehicles`; }
            }
          }
        },
        scales: {
          x: {
            grid: { color: gridColor },
            ticks: { maxRotation: 45, font: { size: 10 } }
          },
          y: {
            grid: { color: gridColor },
            beginAtZero: true,
            ticks: { stepSize: 10 }
          }
        }
      }
    });
  }

  // ── Line: Revenue Trend (Today vs Yesterday) ──────────
  function initRevenueTrendChart() {
    const ctx = document.getElementById('chartRevenueTrend');
    if (!ctx) return;

    const hourly = window.AppData.hourly;
    const yesterday = window.AppData.yesterdayHourly;
    const labels = hourly.map(h => `${String(h.hour).padStart(2,'0')}:00`);

    window._chartRevenue = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Today',
            data: hourly.map(h => h.revenue),
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59,130,246,0.1)',
            tension: 0.4,
            fill: true,
            pointRadius: 3,
            pointHoverRadius: 6,
            borderWidth: 2.5
          },
          {
            label: 'Yesterday',
            data: yesterday.map(h => h.revenue),
            borderColor: '#475569',
            backgroundColor: 'rgba(71,85,105,0.05)',
            tension: 0.4,
            fill: false,
            pointRadius: 2,
            borderWidth: 1.5,
            borderDash: [5, 4]
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', align: 'end' },
          tooltip: {
            callbacks: {
              label(item) {
                return ` ${item.dataset.label}: ৳${item.parsed.y.toLocaleString()}`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: gridColor },
            ticks: { maxRotation: 45, font: { size: 10 } }
          },
          y: {
            grid: { color: gridColor },
            beginAtZero: true,
            ticks: {
              callback(v) { return '৳' + v.toLocaleString(); }
            }
          }
        }
      }
    });
  }

  // ── Revenue by Type Bar (Reports section) ─────────────
  function initRevenueByTypeChart() {
    const ctx = document.getElementById('chartRevenueByType');
    if (!ctx) return;

    const rev = window.AppData.revenue.byType;
    const labels = Object.keys(rev).filter(k => rev[k].count > 0);
    const data = labels.map(k => rev[k].revenue);

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
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label(item) { return ` ৳${item.parsed.y.toLocaleString()}`; }
            }
          }
        },
        scales: {
          x: { grid: { color: gridColor } },
          y: {
            grid: { color: gridColor },
            beginAtZero: true,
            ticks: { callback(v) { return '৳' + v.toLocaleString(); } }
          }
        }
      }
    });
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
      [window._chartDist, window._chartHourly, window._chartRevenue, window._chartRevType]
        .forEach(c => c && c.update());
    }
  };
})();
