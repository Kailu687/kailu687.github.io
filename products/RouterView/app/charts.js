// Small dependency-free SVG charts with hover tooltips.
const NS = 'http://www.w3.org/2000/svg';

export function fmtBytes(b) {
  if (!b) return '0 MB';
  if (b >= 1e9) return (b / 1e9).toFixed(b >= 1e10 ? 1 : 2) + ' GB';
  if (b >= 1e6) return Math.round(b / 1e6) + ' MB';
  return Math.max(1, Math.round(b / 1e3)) + ' KB';
}
function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}
function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  parent?.appendChild(e);
  return e;
}
const timeLabel = (t, step) => step >= 86400_000
  ? new Date(t).toLocaleDateString([], { weekday: 'short', day: 'numeric' })
  : new Date(t).toLocaleTimeString([], { hour: 'numeric' });

/**
 * Stacked bar chart of download + upload per time bucket.
 * points: [{t, rx, tx}], step in ms.
 */
export function usageBars(container, { points, step, height = 200 }) {
  container.innerHTML = '';
  container.classList.add('chart');
  if (!points.length) { container.innerHTML = '<div class="empty">No usage recorded in this period yet.</div>'; return; }
  const W = Math.max(280, container.clientWidth || 640), H = height, L = 52, R = 6, T = 8, B = 24;
  const max = niceMax(Math.max(...points.map(p => p.rx + p.tx)));
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Data usage over time' }, container);
  const g = el('g', { class: 'grid' }, svg);
  const ax = el('g', { class: 'axis' }, svg);
  for (let i = 0; i <= 4; i++) {
    const y = T + (H - T - B) * (1 - i / 4);
    el('line', { x1: L, x2: W - R, y1: y, y2: y }, g);
    el('text', { x: L - 6, y: y + 4, 'text-anchor': 'end' }, ax).textContent = fmtBytes(max * i / 4).replace(' ', ' ');
  }
  const n = points.length, slot = (W - L - R) / n, bw = Math.max(2, Math.min(28, slot - 3));
  const y = v => T + (H - T - B) * (1 - v / max);
  const every = Math.ceil(n / 8);
  const tip = document.createElement('div'); tip.className = 'tip'; container.appendChild(tip);
  points.forEach((p, i) => {
    const x = L + i * slot + (slot - bw) / 2;
    const hRx = (H - T - B) * p.rx / max, hTx = (H - T - B) * p.tx / max;
    const base = H - B;
    if (hRx > 0) el('path', { d: roundedTop(x, base - hRx, bw, hRx, hTx > 1 ? 0 : 3), fill: 'var(--down)' }, svg);
    if (hTx > 0) el('path', { d: roundedTop(x, base - hRx - hTx - (hRx > 0 ? 2 : 0), bw, hTx, 3), fill: 'var(--up)' }, svg);
    if (i % every === 0) el('text', { x: x + bw / 2, y: H - 6, 'text-anchor': 'middle' }, ax).textContent = timeLabel(p.t, step);
    const hit = el('rect', { x: L + i * slot, y: T, width: slot, height: H - T - B, fill: 'transparent' }, svg);
    hit.addEventListener('pointerenter', () => {
      const end = new Date(p.t + step);
      tip.innerHTML = `<b>${step >= 86400_000 ? new Date(p.t).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' }) : `${timeLabel(p.t, step)} – ${timeLabel(end, step)}`}</b><br>
        <span style="color:var(--text-2)">Download</span> ${fmtBytes(p.rx)}<br><span style="color:var(--text-2)">Upload</span> ${fmtBytes(p.tx)}`;
      tip.style.left = ((x + bw / 2) / W * 100) + '%';
      tip.style.top = (y(p.rx + p.tx) / H * container.clientWidth * H / W - 6) + 'px';
      tip.classList.add('show');
    });
    hit.addEventListener('pointerleave', () => tip.classList.remove('show'));
  });
}
function roundedTop(x, y, w, h, r) {
  r = Math.min(r, h, w / 2);
  return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`;
}

/** Rolling live throughput line chart (Mbps). samples: [{t, down, up}] */
export function liveLines(container, samples, { height = 150 } = {}) {
  container.innerHTML = '';
  container.classList.add('chart');
  const W = Math.max(280, container.clientWidth || 640), H = height, L = 60, R = 6, T = 8, B = 20;
  const max = niceMax(Math.max(5, ...samples.map(s => Math.max(s.down, s.up))));
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Live download and upload speed' }, container);
  const g = el('g', { class: 'grid' }, svg), ax = el('g', { class: 'axis' }, svg);
  for (let i = 0; i <= 3; i++) {
    const yy = T + (H - T - B) * (1 - i / 3);
    el('line', { x1: L, x2: W - R, y1: yy, y2: yy }, g);
    el('text', { x: L - 6, y: yy + 4, 'text-anchor': 'end' }, ax).textContent = Math.round(max * i / 3) + ' Mbps';
  }
  if (samples.length < 2) return;
  const t0 = samples[0].t, t1 = samples[samples.length - 1].t;
  const x = t => L + (W - L - R) * (t - t0) / Math.max(1, t1 - t0);
  const y = v => T + (H - T - B) * (1 - v / max);
  for (const [key, color] of [['down', 'var(--down)'], ['up', 'var(--up)']]) {
    const d = samples.map((s, i) => `${i ? 'L' : 'M'}${x(s.t).toFixed(1)},${y(s[key]).toFixed(1)}`).join(' ');
    el('path', { d: d + ` L${x(t1)},${H - B} L${x(t0)},${H - B} Z`, fill: color, opacity: key === 'down' ? .12 : .08 }, svg);
    el('path', { d, fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linejoin': 'round' }, svg);
  }
  el('text', { x: L, y: H - 4 }, ax).textContent = 'Last ' + Math.round((t1 - t0) / 1000) + ' s';
  el('text', { x: W - R, y: H - 4, 'text-anchor': 'end' }, ax).textContent = 'now';
  const tip = document.createElement('div'); tip.className = 'tip'; container.appendChild(tip);
  const cross = el('line', { y1: T, y2: H - B, stroke: 'var(--text-3)', 'stroke-width': 1, opacity: 0 }, svg);
  const hit = el('rect', { x: L, y: T, width: W - L - R, height: H - T - B, fill: 'transparent' }, svg);
  hit.addEventListener('pointermove', (e) => {
    const r = svg.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width * W;
    let best = samples[0];
    for (const s of samples) if (Math.abs(x(s.t) - px) < Math.abs(x(best.t) - px)) best = s;
    cross.setAttribute('x1', x(best.t)); cross.setAttribute('x2', x(best.t)); cross.setAttribute('opacity', .5);
    tip.innerHTML = `<b>${new Date(best.t).toLocaleTimeString()}</b><br><span style="color:var(--text-2)">Down</span> ${best.down} Mbps<br><span style="color:var(--text-2)">Up</span> ${best.up} Mbps`;
    tip.style.left = (x(best.t) / W * 100) + '%'; tip.style.top = '0px'; tip.classList.add('show');
  });
  hit.addEventListener('pointerleave', () => { tip.classList.remove('show'); cross.setAttribute('opacity', 0); });
}
