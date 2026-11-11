import { createApi, settings, demo } from './api.js';
import { usageBars, liveLines, fmtBytes } from './charts.js';
import { parseWireGuard } from './core/wireguard.js';

const $ = (s, r = document) => r.querySelector(s);
const view = $('#view');
let api, status, liveTimer, liveSamples = [];
const state = { range: 'today', connection: 'all', statusFilter: 'all', direction: 'total', protectLevel: 2, provider: 'quad9' };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ago = (t) => {
  if (!t) return '—';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
};
const dt = (t) => t ? new Date(t).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—';
const dur = (ms) => { const m = Math.round(ms / 60000); return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`; };
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2800); }

const ICONS = {
  laptop: '<rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 19h20"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/>',
  tablet: '<rect x="5" y="2.5" width="14" height="19" rx="2"/><path d="M11 18.5h2"/>',
  tv: '<rect x="2.5" y="4" width="19" height="13" rx="1.5"/><path d="M8 21h8"/>',
  speaker: '<rect x="6" y="2.5" width="12" height="19" rx="3"/><circle cx="12" cy="14" r="3"/><circle cx="12" cy="7" r="1"/>',
  console: '<path d="M6 8h12a4 4 0 014 4v1a4 4 0 01-7 2.6L14 15h-4l-1 .6A4 4 0 012 13v-1a4 4 0 014-4z"/><path d="M7 11v3M5.5 12.5h3"/>',
  iot: '<path d="M9 18h6M10 21h4M12 3a6 6 0 014 10.5V16H8v-2.5A6 6 0 0112 3z"/>',
  camera: '<circle cx="12" cy="11" r="7"/><circle cx="12" cy="11" r="2.5"/><path d="M8 21h8"/>',
  router: '<rect x="3" y="13" width="18" height="7" rx="1.5"/><path d="M7 13l-2-7M17 13l2-7M7 16.5h.01M11 16.5h.01"/>',
  server: '<rect x="4" y="3" width="16" height="7" rx="1"/><rect x="4" y="14" width="16" height="7" rx="1"/><path d="M8 6.5h.01M8 17.5h.01"/>',
  watch: '<rect x="7" y="6" width="10" height="12" rx="3"/><path d="M9 6l1-3h4l1 3M9 18l1 3h4l1-3"/>',
  unknown: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 114 2c-1 .7-1.5 1.2-1.5 2.5M12 17h.01"/>',
};
const icon = (t) => `<svg viewBox="0 0 24 24">${ICONS[t] || ICONS.unknown}</svg>`;
const SVC_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#c98500', '#d55181', '#008300', '#6250d6', '#52514e'];
const svcColor = (name) => { let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0; return SVC_COLORS[h % SVC_COLORS.length]; };
const CONF = { high: ['good', 'High confidence'], medium: ['warn', 'Medium confidence'], low: ['', 'Low confidence'] };
const confBadge = (c) => `<span class="badge conf ${CONF[c][0]}" title="${esc({ high: 'Directly identified domain or known app endpoint', medium: 'Inferred from supporting domains', low: 'Shared infrastructure or ambiguous destination' }[c])}">${CONF[c][1]}</span>`;

// ---------- router ----------
async function render() {
  clearInterval(liveTimer);
  const hash = location.hash.slice(1) || '/';
  const [, page, arg] = hash.split('/');
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === (page || 'overview') || (page === 'device' && a.dataset.nav === 'devices')));
  if (api.mode === 'none') { $('#nav-foot').innerHTML = ''; return renderNoAgent(); }
  if (api.needsPairing) return renderPairing();
  try {
    status = await api.status();
  } catch (e) {
    if (e.pairing || api.needsPairing) return renderPairing();
    return renderError(e);
  }
  $('#nav-foot').innerHTML = status.connected ? `<div class="row"><span class="dot on"></span>${esc(status.router.model)}</div><div>${api.mode === 'demo' ? 'Demo mode, in your browser' : 'Local agent · data stays on this network'}</div>` : '';
  if (!status.connected && page !== 'settings') return renderSetup();
  view.focus({ preventScroll: true });
  try {
    if (!page) await renderOverview();
    else if (page === 'devices') await renderDevices();
    else if (page === 'device') await renderDevice(decodeURIComponent(arg));
    else if (page === 'protect') await renderProtect();
    else if (page === 'settings') await renderSettings();
    else await renderOverview();
  } catch (e) { renderError(e); }
}
function renderError(e) { view.innerHTML = `<div class="card empty"><h2>Something went wrong</h2><p>${esc(e.message)}</p><button class="btn" onclick="location.reload()">Try again</button></div>`; }
const demoBanner = () => api.mode === 'demo' ? `<div class="demo-banner">Demo mode: this is a simulated home network, not yours. <a href="#" data-exit-demo>Connect your real router</a></div>` : '';
document.addEventListener('click', async (e) => { if (!e.target.closest('[data-exit-demo]')) return; e.preventDefault(); demo.chosen = false; api = await createApi(); location.hash = '#/'; render(); });

// ---------- setup flow ----------
async function renderSetup(step = 1, ctx = {}) {
  const bar = `<div class="steps">${[1, 2, 3, 4].map(i => `<i class="${i <= step ? 'on' : ''}"></i>`).join('')}</div>`;
  if (step === 1) {
    view.innerHTML = `${demoBanner()}<div class="setup">${bar}<div class="card"><h1>Find your router</h1>
      <p class="muted">RouterView looks for the router your device is using. It only reads the router's public login page; no passwords are sent.</p>
      <div class="row" style="padding:24px 0"><div class="spinner"></div><span class="muted">Scanning your network…</span></div></div></div>`;
    let found = { gateways: [] };
    try { found = await api.discover(); } catch {}
    const gws = found.gateways || [];
    view.innerHTML = `${demoBanner()}<div class="setup">${bar}<div class="card"><h1>Find your router</h1>
      <p class="muted">${gws.length ? (api.mode === 'demo' ? 'In the demo, this simulated router stands in for yours.' : 'We found this router on your network.') : 'We could not detect a router automatically. You can still pick one below.'}</p>
      <div id="gws">${gws.map((g, i) => `<label class="choice ${i === 0 ? 'selected' : ''}"><input type="radio" name="gw" value="${i}" ${i === 0 ? 'checked' : ''}>
        <div><b>${esc(g.label)}</b> <span class="faint mono">${esc(g.host)}</span><div class="faint">${g.vendor ? `Made by ${esc(g.vendor)} · ` : ''}${g.luci ? 'LuCI web interface detected' : g.reachable ? 'Login page found' : 'No web interface answered'}${g.suggestion?.plannedName ? ` · ${esc(g.suggestion.plannedName)} support is planned` : ''}</div></div></label>`).join('')}
        <label class="choice ${gws.length ? '' : 'selected'}"><input type="radio" name="gw" value="manual" ${gws.length ? '' : 'checked'}><div style="flex:1"><b>Enter the address myself</b><input type="text" id="manual-host" placeholder="192.168.1.1" style="margin-top:8px"></div></label>
      </div>
      <div class="row between section"><a href="#" id="try-demo" class="faint">Just exploring? Use the demo router</a><button class="btn primary" id="next">Continue</button></div></div></div>`;
    bindChoices();
    $('#try-demo').onclick = (e) => { e.preventDefault(); renderSetup(3, { adapter: { id: 'demo', name: 'Demo router (simulated)', needsCredentials: false }, host: '192.168.1.1' }); };
    $('#next').onclick = () => {
      const v = document.querySelector('input[name=gw]:checked')?.value;
      const g = v === 'manual' ? { host: $('#manual-host').value.trim() || '192.168.1.1', suggestion: { id: 'generic' } } : gws[+v];
      renderSetup(2, { host: g.host, suggested: g.suggestion?.id, gateway: g });
    };
    return;
  }
  if (step === 2) {
    const adapters = await api.adapters();
    const order = (a) => a.id === ctx.suggested ? -1 : { supported: 0, basic: 1, planned: 2 }[a.status];
    adapters.sort((a, b) => order(a) - order(b));
    view.innerHTML = `${demoBanner()}<div class="setup">${bar}<div class="card"><h1>What kind of router is it?</h1>
      <p class="muted">Each router family exposes different features. We'll show you exactly what works with yours.</p>
      ${adapters.map((a, i) => `<label class="choice ${i === 0 ? 'selected' : ''} ${a.status === 'planned' ? 'disabled' : ''}"><input type="radio" name="ad" value="${esc(a.id)}" ${i === 0 ? 'checked' : ''} ${a.status === 'planned' ? 'disabled' : ''}>
        <div><b>${esc(a.name)}</b> ${a.id === ctx.suggested ? '<span class="badge accent">Detected</span>' : ''} ${a.status === 'planned' ? '<span class="badge">Coming soon</span>' : a.status === 'basic' ? '<span class="badge">Basic</span>' : a.status === 'testing' ? '<span class="badge warn">In testing</span>' : '<span class="badge good">Full support</span>'}
        <div class="faint">${esc(a.description)}</div></div></label>`).join('')}
      <div class="row between section"><button class="btn" id="back">Back</button><button class="btn primary" id="next">Continue</button></div></div></div>`;
    bindChoices();
    $('#back').onclick = () => renderSetup(1);
    $('#next').onclick = () => renderSetup(3, { ...ctx, adapter: adapters.find(a => a.id === document.querySelector('input[name=ad]:checked').value) });
    return;
  }
  if (step === 3) {
    const a = ctx.adapter;
    view.innerHTML = `${demoBanner()}<div class="setup">${bar}<div class="card"><h1>Connect to ${esc(a.name)}</h1>
      ${a.needsCredentials ? `<p class="muted">Use the same username and password you use for the router's admin page. They are stored only on this computer and sent only to your router.</p>
      <label class="field"><span>Router address</span><input type="text" id="host" value="${esc(ctx.host || '192.168.1.1')}"></label>
      <label class="field"><span>Username</span><input type="text" id="user" value="${esc(a.defaultUser || 'admin')}" autocomplete="username"></label>
      <label class="field"><span>Password</span><input type="password" id="pass" autocomplete="current-password"></label>` : `<p class="muted">${esc(a.description)}</p>`}
      <div id="err"></div>
      <div class="row between section"><button class="btn" id="back">Back</button><button class="btn primary" id="go">Connect</button></div></div></div>`;
    $('#back').onclick = () => renderSetup(a.id === 'demo' ? 1 : 2, ctx);
    $('#go').onclick = async () => {
      const btn = $('#go'); btn.disabled = true; btn.textContent = 'Connecting…';
      try {
        const r = await api.connect({ adapter: a.id, host: $('#host')?.value || ctx.host, username: $('#user')?.value, password: $('#pass')?.value });
        renderSetup(4, { ...ctx, result: r });
      } catch (e) { $('#err').innerHTML = `<div class="note bad">${esc(e.message)}</div>`; btn.disabled = false; btn.textContent = 'Connect'; }
    };
    return;
  }
  if (step === 4) {
    const { router, capabilities } = ctx.result;
    const labels = status.capabilityLabels || {};
    view.innerHTML = `${demoBanner()}<div class="setup">${bar}<div class="card"><h1>Connected</h1>
      <p class="muted">${esc(router.model)} · ${esc(router.firmware || '')}</p>
      <h3 class="section">What RouterView can do with this router</h3>
      <div class="cap-list">${Object.entries(labels).map(([k, l]) => `<div><span class="dot ${capabilities[k] ? 'on' : 'off'}"></span>${esc(l)}${capabilities[k] ? '' : ' <span class="faint">(not available)</span>'}</div>`).join('')}</div>
      ${capabilities.dnsHistory && router.adapter === 'openwrt' ? `<div class="note section"><div><b>Turn on DNS insights?</b> To show which apps each device uses, the router has to log DNS lookups. The log stays in the router's memory and is read only by this computer.<div class="row section"><button class="btn small" id="dns-on">Turn on</button></div></div></div>` : ''}
      <div class="row between section"><span class="faint">Devices and history build up over the next few minutes.</span><button class="btn primary" id="open-dash">Open dashboard</button></div></div></div>`;
    $('#dns-on')?.addEventListener('click', async (e) => { e.target.disabled = true; await api.enableDnsInsights(); e.target.textContent = 'On'; toast('DNS insights turned on'); });
    $('#open-dash').onclick = () => { if (location.hash === '#/' || !location.hash) render(); else location.hash = '#/'; };
  }
}
function bindChoices() {
  document.querySelectorAll('.choice input').forEach(i => i.addEventListener('change', () => {
    document.querySelectorAll(`.choice input[name=${i.name}]`).forEach(x => x.closest('.choice').classList.toggle('selected', x.checked));
  }));
}

// ---------- overview ----------
function filterBar({ withDevices = false } = {}) {
  const seg = (key, opts) => `<div class="seg" data-key="${key}">${opts.map(([v, l]) => `<button data-v="${v}" class="${state[key] === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  return `<div class="filters">${seg('range', [['today', 'Today'], ['yesterday', 'Yesterday'], ['7d', '7 days'], ['custom', 'Custom']])}
    ${state.range === 'custom' ? `<input type="date" id="from" value="${state.from || ''}" style="width:auto"><input type="date" id="to" value="${state.to || ''}" style="width:auto">` : ''}
    ${withDevices ? seg('connection', [['all', 'All'], ['wired', 'Wired'], ['wireless', 'Wi-Fi']]) + seg('statusFilter', [['all', 'Any'], ['active', 'Active'], ['inactive', 'Inactive']]) + seg('direction', [['total', 'Total'], ['download', 'Down'], ['upload', 'Up']]) : ''}</div>`;
}
function bindFilters(rerender) {
  document.querySelectorAll('.seg[data-key]').forEach(s => s.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    state[s.dataset.key] = b.dataset.v;
    if (b.dataset.v === 'custom' && !state.from) { const d = new Date(); state.to = d.toISOString().slice(0, 10); d.setDate(d.getDate() - 3); state.from = d.toISOString().slice(0, 10); }
    rerender();
  }));
  ['from', 'to'].forEach(k => $('#' + k)?.addEventListener('change', (e) => { state[k] = e.target.value; rerender(); }));
}
function query() {
  const q = { connection: state.connection, status: state.statusFilter, direction: state.direction };
  if (state.range === 'custom' && state.from) { q.from = new Date(state.from + 'T00:00').getTime(); q.to = new Date(state.to + 'T23:59:59').getTime(); }
  else q.range = state.range === 'custom' ? 'today' : state.range;
  return q;
}

function deviceRow(d, maxUsage) {
  const st = { active: ['on', 'Active'], idle: ['warn', 'Idle'], offline: ['off', 'Offline'], paused: ['bad', 'Paused'] }[d.status];
  const conn = d.connection === 'wired' ? 'Wired' : d.connection === 'wifi' ? `Wi-Fi${d.band ? ' ' + d.band : ''}` : 'Network';
  return `<a class="dev" href="#/device/${encodeURIComponent(d.mac)}">
    <div class="ic">${icon(d.type)}</div>
    <div><div class="name">${esc(d.displayName)}</div><div class="sub">${esc(d.typeLabel)} · ${conn}${d.topService ? ` · mostly ${esc(d.topService)}` : ''}</div></div>
    <div class="status-col row"><span class="dot ${st[0]}"></span><span class="faint">${st[1]}</span></div>
    <div class="usage num">${fmtBytes(d.usage.total)}<div class="bar"><i style="width:${maxUsage ? Math.max(2, d.usage.total / maxUsage * 100) : 0}%"></i></div></div></a>`;
}

async function renderOverview() {
  const o = await api.overview(query());
  const caps = o.capabilities;
  const prot = o.protection;
  const protText = prot.status === 'active' ? ['good', `Level ${prot.level} active`] : ['warn', 'Not enabled'];
  view.innerHTML = `${demoBanner()}
    <div class="page-head"><div><h1>Network overview</h1><div class="status-line"><span class="dot on"></span>${esc(o.router.model)} · Online · ${o.counts.online} of ${o.counts.total} devices connected</div></div>${filterBar()}</div>
    <div class="grid tiles">
      <div class="card tile"><div class="label">Connected devices</div><div class="value num">${o.counts.online}</div><div class="faint">${o.counts.wired} wired · ${o.counts.wireless} wireless known</div></div>
      <div class="card tile"><div class="label">${esc(o.range.label)} usage</div><div class="value num">${caps.trafficCounters ? fmtBytes(o.totals.total) : '—'}</div><div class="faint">${caps.trafficCounters ? `${fmtBytes(o.totals.rx)} down · ${fmtBytes(o.totals.tx)} up` : 'Router does not report usage'}</div></div>
      <div class="card tile"><div class="label">Download now</div><div class="value num" id="live-down">${o.live ? o.live.down : '—'}<small>Mbps</small></div><div class="faint">Live, from router counters</div></div>
      <div class="card tile"><div class="label">Upload now</div><div class="value num" id="live-up">${o.live ? o.live.up : '—'}<small>Mbps</small></div><div class="faint">Not a speed test</div></div>
    </div>
    <div class="grid two section">
      <div class="card"><div class="row between"><h2>Data usage</h2><div class="legend"><span><i style="background:var(--down)"></i>Download</span><span><i style="background:var(--up)"></i>Upload</span></div></div><div id="usage-chart"></div></div>
      <div class="card"><div class="row between"><h2>Live bandwidth</h2></div><div id="live-chart"></div><p class="faint">${esc(o.live?.source || 'Live speed is not available on this router')}. This is what your devices are using right now, not your plan's maximum.</p></div>
    </div>
    <div class="grid two section">
      <div class="card"><div class="row between"><h2>Devices</h2><a href="#/devices" class="faint">See all</a></div>
        <div class="dev-list">${o.devices.slice(0, 6).map(d => deviceRow(d, o.devices[0]?.usage.total)).join('')}</div></div>
      <div class="card"><div class="row between"><h2>What your ISP can see</h2><span class="badge ${protText[0]}">${protText[1]}</span></div>
        ${prot.summary.observableDomains ? `<p><b class="num" style="font-size:22px">${prot.summary.observableDomains}</b> <span class="muted">website names were sent unencrypted from your home in this period.</span></p>` : `<p class="muted">Website lookups are encrypted.</p>`}
        <ul class="visible-list">${prot.summary.findings.slice(0, 3).map(f => `<li><span class="dot ${f.severity === 'high' ? 'bad' : f.severity === 'medium' ? 'warn' : 'off'}" style="margin-top:7px"></span><span>${esc(f.title)}</span></li>`).join('')}</ul>
        <a class="btn primary section" href="#/protect">Protect your internet</a></div>
    </div>`;
  bindFilters(renderOverview);
  if (caps.trafficCounters) usageBars($('#usage-chart'), o.usageSeries); else $('#usage-chart').innerHTML = unsupported('Per-device usage', caps);
  startLive();
}
function unsupported(what) { return `<div class="empty"><b>${esc(what)}</b> is not available with this router.<br><span class="faint">Connect an OpenWrt router with nlbwmon for full data.</span></div>`; }

function startLive() {
  const draw = (o) => {
    if (!o.live) return;
    liveSamples.push({ t: Date.now(), down: o.live.down, up: o.live.up });
    liveSamples = liveSamples.filter(s => s.t > Date.now() - 120_000);
    const c = $('#live-chart');
    if (c) { if (liveSamples.length < 2) c.innerHTML = '<div class="empty faint">Measuring live speed… the graph fills in every 3 seconds.</div>'; else liveLines(c, liveSamples); }
    const d = $('#live-down'), u = $('#live-up');
    if (d) d.innerHTML = `${o.live.down}<small>Mbps</small>`; if (u) u.innerHTML = `${o.live.up}<small>Mbps</small>`;
  };
  const tick = async () => { try { draw(await api.overview({ range: 'today' })); } catch {} };
  tick();
  liveTimer = setInterval(tick, 3000);
}

// ---------- devices ----------
async function renderDevices() {
  const o = await api.overview(query());
  const max = Math.max(...o.devices.map(d => d.usage.total), 1);
  view.innerHTML = `${demoBanner()}<div class="page-head"><div><h1>Devices</h1><div class="status-line">${o.devices.length} shown · ${esc(o.range.label)}</div></div></div>
    ${filterBar({ withDevices: true })}
    <div class="card section"><div class="dev-list">${o.devices.map(d => deviceRow(d, max)).join('') || '<div class="empty">No devices match these filters.</div>'}</div></div>`;
  bindFilters(renderDevices);
}

// ---------- device detail ----------
async function renderDevice(mac) {
  const r = await api.device(mac, query());
  const d = r.device, caps = r.capabilities, act = r.activity;
  const conn = d.connection === 'wired' ? 'Wired (Ethernet)' : d.connection === 'wifi' ? `Wi-Fi${d.band ? ' ' + d.band : ''}` : 'Unknown';
  const live = r.live && (r.live.down + r.live.up > 0.2);
  view.innerHTML = `${demoBanner()}
    <a class="crumb" href="#/devices">← Devices</a>
    <div class="page-head"><div class="row" style="gap:14px"><div class="dev"><div class="ic" style="width:52px;height:52px">${icon(d.type)}</div></div>
      <div><h1>${esc(d.displayName)}</h1><div class="status-line"><span class="dot ${d.blocked ? 'bad' : live ? 'on' : d.online ? 'warn' : 'off'}"></span>${d.blocked ? 'Internet paused' : live ? 'Currently active' : d.online ? 'Connected, idle' : 'Offline'} · ${esc(d.typeLabel)} · ${esc(conn)}</div></div></div>
      ${filterBar()}</div>
    <div class="grid two">
      <div class="card"><h2>Device information</h2><dl class="kv">
        <dt>Device type</dt><dd>${esc(d.typeLabel)} ${confBadge(d.typeConfidence)}</dd>
        <dt>Local IP</dt><dd class="mono">${esc(d.ip || '—')}</dd>
        <dt>MAC address</dt><dd class="mono">${esc(d.mac)}${d.privateMac ? ' <span class="badge">Private address</span>' : ''}</dd>
        <dt>Manufacturer</dt><dd>${d.vendor ? `${esc(d.vendor)} <span class="faint">(from MAC prefix)</span>` : d.privateMac ? '<span class="faint">Hidden by private MAC</span>' : '<span class="faint">Unknown</span>'}</dd>
        <dt>Hostname</dt><dd class="mono">${esc(d.hostname || '—')}</dd>
        <dt>Connection</dt><dd>${esc(conn)}</dd>
        ${d.signal != null ? `<dt>Signal</dt><dd>${d.signal} dBm <span class="faint">${d.signal > -55 ? 'Excellent' : d.signal > -67 ? 'Good' : d.signal > -75 ? 'Fair' : 'Weak'}</span></dd>` : ''}
        <dt>First seen</dt><dd>${dt(d.firstSeen)}</dd>
        ${d.connectedSince ? `<dt>Connected since</dt><dd>${dt(d.connectedSince)}</dd>` : ''}
        <dt>Last active</dt><dd>${live ? 'Just now' : ago(d.lastActive)}</dd>
      </dl>
      <details class="section"><summary class="faint">How we identified this device</summary><ul class="faint">${d.typeEvidence.map(e => `<li>${esc(e)}</li>`).join('')}</ul></details></div>
      <div class="card"><h2>${esc(r.range.label)}</h2>
        <div class="grid" style="grid-template-columns:1fr 1fr"><div class="tile"><div class="label">Downloaded</div><div class="value num">${fmtBytes(r.usage.rx)}</div></div><div class="tile"><div class="label">Uploaded</div><div class="value num">${fmtBytes(r.usage.tx)}</div></div></div>
        ${r.live ? `<p class="faint">Right now: ${r.live.down} Mbps down · ${r.live.up} Mbps up</p>` : ''}
        <h3 class="section">Actions</h3>
        <div class="row wrap">
          <button class="btn" id="pause" ${caps.deviceBlocking ? '' : 'disabled title="Not supported by this router"'}>${d.blocked ? 'Resume internet' : 'Pause internet'}</button>
          <button class="btn" id="rename">Rename</button>
          <button class="btn danger" id="forget">Forget device</button>
        </div></div>
    </div>
    <div class="card section"><div class="row between"><h2>Activity timeline</h2><div class="legend"><span><i style="background:var(--down)"></i>Download</span><span><i style="background:var(--up)"></i>Upload</span></div></div><div id="dev-chart"></div></div>
    <div class="card section" id="apps"></div>`;
  bindFilters(() => renderDevice(mac));
  if (caps.trafficCounters) usageBars($('#dev-chart'), r.timeline); else $('#dev-chart').innerHTML = unsupported('Usage history');

  const apps = $('#apps');
  if (!act) apps.innerHTML = `<h2>Apps and websites</h2>${unsupported('DNS history')}`;
  else {
    const svcs = act.services.filter(s => s.category !== 'cdn' || s.queries > 2);
    apps.innerHTML = `<div class="row between wrap"><h2>Apps and websites</h2><div class="seg" id="apps-mode"><button class="on" data-v="apps">By app</button><button data-v="raw">Raw DNS log</button></div></div>
      <div class="note" style="margin-bottom:10px"><div><b>Network activity time is not screen time.</b> It's how long this device exchanged traffic with a service. Apps sync and play in the background, so treat it as a strong hint, not proof.${svcs.some(s => s.bytesEstimated) ? ' Data per app is estimated from activity, because routers count bytes per device, not per website.' : ''}</div></div>
      <div id="apps-body">${svcs.map(s => `
        <div class="svc"><div class="logo" style="background:${s.category === 'unknown' ? 'var(--text-3)' : svcColor(s.service)}">${esc(s.service[0].toUpperCase())}</div>
          <div><div class="row wrap" style="gap:6px"><b>${esc(s.service)}</b>${s.tracker ? '<span class="badge bad">Tracker</span>' : ''}${confBadge(s.confidence)}</div>
            <div class="faint">${esc(s.categoryLabel)} · ${esc(s.domains[0].name)}${s.domains.length > 1 ? ` + ${s.domains.length - 1} more` : ''}</div>
            <details><summary>Show ${s.domains.length} domain${s.domains.length > 1 ? 's' : ''} and why</summary>
              ${s.domains.map(x => `<div class="domain-row"><span class="mono">${esc(x.name)}</span><span class="faint">${esc(x.role || '')} ${x.count}×</span></div><div class="faint" style="margin-bottom:4px">${esc(x.reason)}</div>`).join('')}
              ${caps.domainBlocking ? `<button class="btn small section" data-block="${esc(s.domains[0].name)}">Block ${esc(s.service)} network-wide</button>` : ''}</details></div>
          <div style="text-align:right"><div class="num"><b>${fmtBytes(s.bytes)}</b>${s.bytesEstimated ? '<span class="faint" title="Estimated"> est.</span>' : ''}</div><div class="faint">${dur(s.activeMs)} network activity</div></div></div>`).join('') || '<div class="empty">No DNS activity in this period.</div>'}</div>`;
    const raw = r.recentDns;
    $('#apps-mode').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      $('#apps-mode').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
      if (b.dataset.v === 'raw') $('#apps-body').innerHTML = `<p class="faint">The last ${raw.length} lookups, exactly as the router saw them. This is what your ISP receives today if DNS is unencrypted.</p><div style="overflow:auto;max-height:420px"><table class="data"><thead><tr><th>Time</th><th>Domain</th><th>Belongs to</th></tr></thead><tbody>${raw.map(x => `<tr><td class="num">${new Date(x.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td><td class="mono">${esc(x.name)}</td><td>${esc((svcs.find(s => s.domains.some(d => d.name === x.name)) || {}).service || '')}</td></tr>`).join('')}</tbody></table></div>`;
      else renderDevice(mac);
    });
    apps.querySelectorAll('[data-block]').forEach(b => b.onclick = async () => { const r = await api.blockDomain(b.dataset.block); toast(`Blocked ${r.service} for every device`); b.disabled = true; });
  }

  $('#pause').onclick = async () => { await api.pause(d.mac, !d.blocked); toast(d.blocked ? 'Internet resumed' : `Paused internet for ${d.displayName}`); renderDevice(mac); };
  $('#rename').onclick = async () => { const n = prompt('Name this device', d.displayName); if (n != null) { await api.rename(d.mac, n.trim()); renderDevice(mac); } };
  $('#forget').onclick = async () => { if (confirm(`Forget ${d.displayName}? Its history is deleted. If it connects again it appears as a new device.`)) { await api.forget(d.mac); location.hash = '#/devices'; } };
}

// ---------- protect ----------
async function renderProtect() {
  const p = await api.protection({ provider: state.provider });
  const active = p.status.status === 'active';
  const job = p.job;
  const L = p.levels, plan = p.plans[state.protectLevel];
  const lvl = state.protectLevel;
  view.innerHTML = `${demoBanner()}
    <div class="page-head"><div><h1>Protect your internet</h1><div class="status-line"><span class="dot ${active ? 'on' : 'warn'}"></span>${active ? `${esc(L[p.status.level].name)} is on and verified${p.status.provider ? ' · ' + esc(p.status.provider) : ''}` : 'Not protected: your ISP can see every website your home looks up'}</div></div>
      ${active ? '<button class="btn danger" id="rollback">Turn off and restore settings</button>' : ''}</div>

    <div class="card"><h2>What your ISP sees ${active ? 'now' : 'today'}</h2>
      <div class="flow">
        <div class="node"><b>Your devices</b>${p.audit.devices} on this network</div><div class="arrow">→</div>
        <div class="node" style="${active && p.status.level >= 2 ? 'background:var(--good-weak)' : !active ? 'background:var(--bad-weak)' : 'background:var(--warn-weak)'}"><b>Your ISP</b>${!active ? `Sees ${p.audit.observableDomains} website names, every destination IP and your usage` : p.status.level >= 2 ? 'Sees encrypted traffic to one VPN server, and how much you use' : 'Lookups hidden. Still sees site names in HTTPS handshakes and destination IPs'}</div><div class="arrow">→</div>
        <div class="node"><b>${active && p.status.level >= 2 ? 'VPN exit → websites' : 'Websites'}</b>YouTube still works normally</div>
      </div>
      <div class="grid section" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr))">${p.audit.findings.map(f => `<div class="note ${f.severity === 'high' ? 'bad' : f.severity === 'medium' ? 'warn' : ''}"><div><b>${esc(f.title)}</b><br>${esc(f.detail)}</div></div>`).join('')}</div>
    </div>

    <h2 class="section">Choose a protection level</h2>
    <div class="grid levels">${[1, 2, 3].map(l => {
      const miss = p.plans[l].missing;
      return `<div class="card level ${lvl === l ? 'selected' : ''}" data-level="${l}" role="button" tabindex="0" aria-pressed="${lvl === l}">
        <span class="badge ${l === 2 ? 'accent' : ''} tag">${esc(L[l].badge)}</span>
        <div class="faint">Level ${l}</div><h3>${esc(L[l].name)}</h3><div class="muted" style="font-size:14px">${esc(L[l].summary)}</div>
        <ul>${L[l].hides.map(h => `<li>Hides ${esc(/^[A-Z][a-z]/.test(h) ? h.charAt(0).toLowerCase() + h.slice(1) : h)}</li>`).join('')}</ul>
        ${miss.length ? `<div class="note warn section" style="font-size:13px">Your router is missing: ${miss.map(m => esc(p.capabilities && status.capabilityLabels[m] || m)).join(', ')}</div>` : ''}
        ${active && p.status.level === l ? '<span class="badge good section">Active</span>' : ''}</div>`;
    }).join('')}</div>

    <div class="grid two section">
      <div class="card"><h2>${esc(L[lvl].name)}: what changes</h2>
        ${lvl === 1 || lvl >= 1 ? `<label class="field"><span>Encrypted DNS provider</span><select id="provider">${Object.entries(p.providers).map(([k, v]) => `<option value="${k}" ${k === state.provider ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select><span class="faint" style="margin-top:4px">${esc(p.providers[state.provider].note)}</span></label>` : ''}
        ${lvl >= 2 ? `<label class="field"><span>VPN profile (WireGuard .conf)</span><textarea id="wg" placeholder="[Interface]\nPrivateKey = …\nAddress = 10.64.0.2/32\nDNS = 10.64.0.1\n\n[Peer]\nPublicKey = …\nEndpoint = vpn.example.com:51820\nAllowedIPs = 0.0.0.0/0">${esc(state.wg || '')}</textarea><span class="faint" style="margin-top:4px">From your VPN provider (Mullvad, Proton, IVPN and most others offer WireGuard files) or your own server. Your VPN provider can see your traffic instead of your ISP, so choose one you trust.</span></label>` : ''}
        <ol style="padding-left:18px;font-size:14px">${plan.steps.map(s => `<li style="margin-bottom:6px">${esc(s.action)}${s.detail ? `<div class="faint">${esc(s.detail)}</div>` : ''}</li>`).join('')}</ol>
        <h3 class="section">Your ISP can still see</h3>
        <ul class="visible-list">${L[lvl].stillVisible.map(s => `<li><span class="dot warn" style="margin-top:7px"></span>${esc(s)}</li>`).join('')}</ul>
        <div class="note section"><div><b>Risk:</b> ${esc(L[lvl].risk)}</div></div>
        <div class="row between section wrap">
          ${api.mode === 'demo' || status.router?.adapter === 'demo' ? `<label class="faint row"><input type="checkbox" id="rehearse"> Rehearse a failed check (shows rollback)</label>` : '<span></span>'}
          <button class="btn primary" id="activate" ${!plan.compatible || job?.status === 'running' || (active && p.status.level === lvl) ? 'disabled' : ''}>${active && p.status.level === lvl ? 'Active and verified' : active ? `Switch to ${esc(L[lvl].name)}` : `Turn on ${esc(L[lvl].name)}`}</button>
        </div></div>
      <div class="card"><h2>Safety checks</h2><p class="faint">Protection is only marked on after every check passes. If one fails, your previous settings are restored automatically.</p>
        <ul class="checks" id="checks">${checkItems(plan.checks, job && job.level === lvl ? job : null)}</ul>
        <div id="job-msg">${job && job.message ? `<div class="note ${job.status === 'active' ? 'good' : job.status === 'rolled_back' ? 'warn' : 'bad'} section">${esc(job.message)}</div>` : ''}</div></div>
    </div>`;

  view.querySelectorAll('.level').forEach(c => { const pick = () => { state.protectLevel = +c.dataset.level; renderProtect(); }; c.onclick = pick; c.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } }; });
  $('#provider')?.addEventListener('change', (e) => { state.provider = e.target.value; renderProtect(); });
  $('#wg')?.addEventListener('input', (e) => { state.wg = e.target.value; });
  $('#rollback')?.addEventListener('click', async () => { if (!confirm('Turn off protection and restore the router settings saved before it was turned on?')) return; await api.rollback(); toast('Previous settings restored'); renderProtect(); });
  $('#activate').onclick = async () => {
    const options = { dohProvider: state.provider, blockTrackers: true };
    if (lvl >= 2) {
      const vpn = parseWireGuard(state.wg || '');
      const isDemo = api.mode === 'demo' || status.router?.adapter === 'demo';
      if (!vpn && !isDemo) return toast('Paste a WireGuard profile first');
      options.vpn = vpn || { endpoint: 'demo.vpn.example:51820' };
    }
    if ($('#rehearse')?.checked) options.rehearseFailure = 'sites';
    await api.activate(lvl, options);
    pollJob(lvl);
  };
  if (job?.status === 'running') pollJob(lvl);
}
function checkItems(checks, job) {
  return checks.map(c => {
    const r = job?.results?.[c.id];
    const s = r?.status || 'pending';
    return `<li class="${s}"><span class="s">${s === 'pass' ? '✓' : s === 'fail' ? '!' : ''}</span><div>${esc(c.label)}${r?.detail ? `<div class="faint">${esc(r.detail)}</div>` : ''}</div></li>`;
  }).join('');
}
function pollJob(lvl) {
  clearInterval(liveTimer);
  liveTimer = setInterval(async () => {
    const p = await api.protection({ provider: state.provider });
    const job = p.job;
    if (!$('#checks')) return clearInterval(liveTimer);
    $('#checks').innerHTML = checkItems(p.plans[lvl].checks, job);
    $('#activate').disabled = true;
    if (job && job.status !== 'running') { clearInterval(liveTimer); renderProtect(); toast(job.message); }
  }, 400);
}
// ---------- settings ----------
async function renderSettings() {
  view.innerHTML = `<div class="page-head"><h1>Settings</h1></div>
    <div class="grid two">
      <div class="card"><h2>Router</h2>${status.connected ? `<dl class="kv"><dt>Model</dt><dd>${esc(status.router.model)}</dd><dt>Firmware</dt><dd>${esc(status.router.firmware || '—')}</dd><dt>Address</dt><dd class="mono">${esc(status.router.host)}</dd><dt>Integration</dt><dd>${esc(status.router.adapterName)}</dd></dl>
        <h3 class="section">Supported features</h3><div class="cap-list">${Object.entries(status.capabilityLabels).map(([k, l]) => `<div><span class="dot ${status.capabilities[k] ? 'on' : 'off'}"></span>${esc(l)}</div>`).join('')}</div>
        <div class="row section"><button class="btn danger" id="disconnect">Disconnect and delete local data</button></div>` : '<p class="muted">No router connected.</p><a class="btn primary" href="#/">Set up a router</a>'}</div>
      <div class="card"><h2>Agent connection</h2>
        <p class="muted" style="font-size:14px">${api.mode === 'demo' ? 'You are exploring a demo network.' : `Connected to the agent at ${esc(api.base || location.host)}.`} The phone app needs the address and pairing code the agent prints when started with <span class="mono">--lan</span>.</p>
        <label class="field"><span>Agent address</span><input type="url" id="agent-url" placeholder="http://192.168.1.20:7380" value="${esc(settings.agentUrl)}"></label>
        <label class="field"><span>Pairing code</span><input type="text" id="token" value="${esc(settings.token)}"></label>
        <button class="btn" id="save-agent">Save and reconnect</button>
        <h3 class="section">Appearance</h3>
        <div class="seg" id="theme">${['system', 'light', 'dark'].map(t => `<button data-v="${t}" class="${(localStorage.getItem('rv:theme') || 'system') === t ? 'on' : ''}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div>
        <h3 class="section">Your data</h3><p class="faint">Everything RouterView collects (devices, usage, DNS history, and your router password, which is encrypted) is stored only on the computer running the agent. Nothing is sent to RouterView or anyone else.</p></div>
    </div>`;
  $('#disconnect')?.addEventListener('click', async () => { if (confirm('Disconnect the router and delete all locally stored history?')) { await api.disconnect(); location.hash = '#/'; render(); } });
  $('#save-agent').onclick = async () => { settings.agentUrl = $('#agent-url').value.trim().replace(/\/$/, ''); settings.token = $('#token').value.trim(); api = await createApi(); toast(api.mode === 'agent' ? 'Connected to agent' : 'Agent not reachable'); render(); };
  $('#theme').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; applyTheme(b.dataset.v); renderSettings(); };
}
const RELEASES = 'https://github.com/Kailu687/RouterView/releases/latest';
const REPO = 'https://github.com/Kailu687/RouterView#quick-start';
function returnUrl() { const u = new URL(location.href); u.searchParams.delete('pair'); u.hash = ''; return u.href; }

// No agent answered: explain the one-time install, keep the demo as a secondary option.
function renderNoAgent() {
  view.innerHTML = `<div class="setup"><div class="card">
    <h1>Connect RouterView on this computer</h1>
    <p class="muted">Browsers can't talk to your router directly, so RouterView uses a small helper that runs on a computer at home. It reads your router and keeps all data on that computer. This page connects to it at <span class="mono">localhost:7380</span>.</p>
    <ol class="install-steps">
      <li><b>Install and open RouterView.</b> <a href="${RELEASES}" target="_blank" rel="noopener">Download for Windows</a>, unzip it and run <span class="mono">RouterView.exe</span>. On macOS or Linux, <a href="${REPO}" target="_blank" rel="noopener">run it from source</a> with Node 20: <span class="mono">node agent/src/server.js</span>.</li>
      <li><b>Leave it running</b>, then come back here.</li>
      <li><b>If your browser asks to let this site access devices on your local network, choose Allow.</b> That permission is what lets this page reach RouterView on your computer.</li>
    </ol>
    <div class="row between section"><a href="#" id="use-demo" class="faint">Just exploring? Try a demo network</a><button class="btn primary" id="retry">I've started it, check again</button></div>
    <p class="faint section" style="font-size:13px">Using Safari? It blocks secure pages from talking to programs on your computer, so open <a href="http://localhost:7380">http://localhost:7380</a> directly instead.</p>
  </div></div>`;
  $('#retry').onclick = async () => { $('#retry').disabled = true; $('#retry').textContent = 'Looking…'; api = await createApi(); if (api.mode === 'none') { toast('RouterView is not running on this computer yet'); } render(); };
  $('#use-demo').onclick = async (e) => { e.preventDefault(); demo.chosen = true; api = await createApi(); render(); };
}

function renderPairing() {
  const pairUrl = api.pairUrl && /^http:\/\/(localhost|127\.0\.0\.1):\d+\/pair$/.test(api.pairUrl) ? `${api.pairUrl}?return=${encodeURIComponent(returnUrl())}` : null;
  view.innerHTML = `<div class="setup"><div class="card"><h1>Allow this page to use RouterView</h1>
    <p class="muted">RouterView is running on this computer. To keep other websites out, it only answers pages you approve.</p>
    ${pairUrl ? `<a class="btn primary" href="${esc(pairUrl)}">Approve this page</a><p class="faint section" style="font-size:13px">Opens RouterView on this computer, asks you to confirm, and brings you back here.</p>` : ''}
    <details class="section"${pairUrl ? '' : ' open'}><summary class="faint">Enter a pairing code instead</summary>
      <label class="field"><span>Pairing code</span><input type="text" id="token" autocomplete="off"></label><button class="btn" id="pair">Pair</button></details></div></div>`;
  $('#pair').onclick = async () => { settings.token = $('#token').value.trim(); api = await createApi(); if (api.needsPairing) toast('That code did not work'); render(); };
}
function applyTheme(t) {
  try { localStorage.setItem('rv:theme', t); } catch {}
  if (t === 'system') document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme = t;
}

// ---------- boot ----------
try { const t = localStorage.getItem('rv:theme'); if (t && t !== 'system') document.documentElement.dataset.theme = t; } catch {}
window.addEventListener('hashchange', render);
(async () => {
  api = await createApi();
  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http') && location.hostname !== 'localhost') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
