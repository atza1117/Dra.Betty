// ════════════════════════════════════════════════════════════════
//  Gráficas (Chart.js, se carga solo cuando abrís la pestaña).
//  Colores validados para daltonismo y contraste sobre las tarjetas.
// ════════════════════════════════════════════════════════════════
import * as C from './calculos.js';

const URL_CHART = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.js';
export const COLOR_BOLSA = {
  'Necesidades': '#4A8FE6', 'Suscripciones': '#E05C9E', 'Apoyo familiar': '#DC6F30',
  'Antojos': '#A673E8', 'Ahorro': '#2AAE7A',
};
const SERIE = { ingresos: '#4A8FE6', gastos: '#DC6F30', ahorro: '#2AAE7A' };
const SUPERFICIE = '#161C38';
const TINTA = '#B9BCD8';
const REJILLA = 'rgba(255,255,255,.08)';

let cargando = null;
const vivos = {};

function cargarChart() {
  if (window.Chart) return Promise.resolve();
  if (!cargando) {
    cargando = new Promise((ok, no) => {
      const s = document.createElement('script');
      s.src = URL_CHART;
      s.onload = ok;
      s.onerror = () => { cargando = null; no(new Error('No se pudieron cargar las gráficas. Revisá el internet.')); };
      document.head.appendChild(s);
    });
  }
  return cargando;
}

const miles = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const crc = (n) => { n = Math.round(Number(n) || 0); return (n < 0 ? '−₡' : '₡') + miles(Math.abs(n)); };
function corto(n) {
  const a = Math.abs(n), s = n < 0 ? '−' : '';
  if (a >= 1e6) return s + '₡' + (a / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace('.', ',') + 'M';
  if (a >= 1e3) return s + '₡' + Math.round(a / 1e3) + 'k';
  return s + '₡' + Math.round(a);
}
const mesCorto = (m) => C.MESES[+m.slice(5, 7) - 1].slice(0, 3);

function base() {
  const Ch = window.Chart;
  Ch.defaults.color = TINTA;
  Ch.defaults.font.family = "'Nunito', system-ui, sans-serif";
  Ch.defaults.font.weight = '700';
  Ch.defaults.plugins.tooltip.backgroundColor = '#232A55';
  Ch.defaults.plugins.tooltip.borderColor = 'rgba(255,255,255,.24)';
  Ch.defaults.plugins.tooltip.borderWidth = 1;
  Ch.defaults.plugins.tooltip.padding = 10;
  Ch.defaults.plugins.tooltip.cornerRadius = 10;
  Ch.defaults.plugins.tooltip.titleColor = '#F3F1FA';
  Ch.defaults.plugins.tooltip.bodyColor = '#F3F1FA';
  Ch.defaults.animation.duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 500;
}

function nuevo(id, cfg) {
  if (vivos[id]) { vivos[id].destroy(); delete vivos[id]; }
  const el = document.getElementById(id);
  if (!el) return;
  vivos[id] = new window.Chart(el, cfg);
}

export function destruirTodo() {
  Object.keys(vivos).forEach((k) => { vivos[k].destroy(); delete vivos[k]; });
}

/** Dibuja las tres gráficas de la pestaña. Las listas y leyendas ya vienen en el HTML. */
export async function pintar(S, mes) {
  try { await cargarChart(); }
  catch (e) {
    document.querySelectorAll('.grafica canvas').forEach((c) => {
      c.parentElement.innerHTML = `<p class="vacio">${e.message}</p>`;
    });
    return;
  }
  base();

  // 1 · Dona: gastos del mes por bolsa
  const r = C.resumenMes(S, mes);
  const bolsas = C.BOLSAS_GASTO.filter((b) => (r.porBolsa[b] || 0) > 0);
  if (bolsas.length) {
    nuevo('g-dona', {
      type: 'doughnut',
      data: {
        labels: bolsas,
        datasets: [{
          data: bolsas.map((b) => Math.round(r.porBolsa[b])),
          backgroundColor: bolsas.map((b) => COLOR_BOLSA[b]),
          borderColor: SUPERFICIE, borderWidth: 3, hoverOffset: 6, borderRadius: 4,
        }],
      },
      options: {
        cutout: '64%', maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c) => ` ${c.label}: ${crc(c.raw)} (${Math.round(c.raw / r.gastos * 100)}%)` } },
        },
      },
    });
  }

  // 2 · Barras: últimos 6 meses
  const h = C.historialMeses(S, 6, mes);
  const minNeg = Math.min(0, ...h.map((x) => x.ahorro));
  nuevo('g-barras', {
    type: 'bar',
    data: {
      labels: h.map((x) => mesCorto(x.mes)),
      datasets: [
        { label: 'Entró', data: h.map((x) => Math.round(x.ingresos)), backgroundColor: SERIE.ingresos },
        { label: 'Gastaste', data: h.map((x) => Math.round(x.gastos)), backgroundColor: SERIE.gastos },
        { label: 'Ahorraste', data: h.map((x) => Math.round(x.ahorro)), backgroundColor: SERIE.ahorro },
      ].map((d) => ({ ...d, borderRadius: 4, borderSkipped: 'start', maxBarThickness: 16, categoryPercentage: 0.72, barPercentage: 0.86 })),
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', align: 'start', labels: { boxWidth: 10, boxHeight: 10, useBorderRadius: true, borderRadius: 3, padding: 14 } },
        tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${crc(c.raw)}` } },
      },
      scales: {
        x: { grid: { display: false }, border: { display: false } },
        y: {
          grid: { color: REJILLA }, border: { display: false },
          min: minNeg < 0 ? minNeg * 1.25 : 0,
          ticks: { callback: (v) => corto(v), maxTicksLimit: 5 },
          // si hay un ahorro negativo chiquito, el eje baja apenas lo necesario y no muestra rótulos negativos
          afterBuildTicks: (ax) => { if (minNeg < 0) ax.ticks = ax.ticks.filter((t) => t.value >= 0); },
        },
      },
    },
  });

  // 3 · Línea: ahorro total al cierre de cada mes
  const a = C.ahorroEnElTiempo(S, 6, mes);
  nuevo('g-linea', {
    type: 'line',
    data: {
      labels: a.map((x) => mesCorto(x.mes)),
      datasets: [{
        label: 'Ahorrado', data: a.map((x) => Math.round(x.total)),
        borderColor: SERIE.ahorro, borderWidth: 2.5, tension: 0.3,
        pointRadius: 4.5, pointHoverRadius: 7, pointBackgroundColor: SERIE.ahorro, pointBorderColor: SUPERFICIE, pointBorderWidth: 2,
        fill: true,
        backgroundColor: (ctx) => {
          const { chart } = ctx; const { ctx: g, chartArea } = chart;
          if (!chartArea) return 'rgba(42,174,122,.15)';
          const grad = g.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          grad.addColorStop(0, 'rgba(42,174,122,.32)'); grad.addColorStop(1, 'rgba(42,174,122,0)');
          return grad;
        },
      }],
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` Ahorrado: ${crc(c.raw)}` } } },
      scales: {
        x: { grid: { display: false }, border: { display: false } },
        y: { grid: { color: REJILLA }, border: { display: false }, ticks: { callback: (v) => corto(v), maxTicksLimit: 4 } },
      },
    },
  });
}
