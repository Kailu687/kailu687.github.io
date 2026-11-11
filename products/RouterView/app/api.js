// API client. Talks to the local agent when one is reachable; otherwise runs a
// fully in-browser demo built from the same core modules the agent uses.
import { create as createDemo, demoChecker } from './core/demo-adapter.js';
import { buildOverview, buildDeviceDetail } from './core/views.js';
import { buildPlan, activate, LEVELS, DOH_PROVIDERS } from './core/protection.js';
import { exposureAudit, classify } from './core/interpret.js';
import { CAPABILITIES } from './core/capabilities.js';

const LS = {
  get(k, d = null) { try { const v = localStorage.getItem('rv:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('rv:' + k, JSON.stringify(v)); } catch {} },
};

export const settings = {
  get agentUrl() { return LS.get('agentUrl', ''); }, set agentUrl(v) { LS.set('agentUrl', v); },
  get token() { return LS.get('token', ''); }, set token(v) { LS.set('token', v); },
};

function agentClient(base) {
  const req = async (method, path, body) => {
    const r = await fetch(base + path, {
      method, headers: { 'content-type': 'application/json', ...(settings.token ? { authorization: 'Bearer ' + settings.token } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || r.statusText); e.status = r.status; e.pairing = j.pairing; throw e; }
    return j;
  };
  return {
    mode: 'agent',
    status: () => req('GET', '/api/status'),
    discover: () => req('GET', '/api/discover'),
    adapters: () => req('GET', '/api/adapters'),
    connect: (b) => req('POST', '/api/connect', b),
    disconnect: () => req('POST', '/api/disconnect'),
    overview: (q) => req('GET', '/api/overview?' + new URLSearchParams(q)),
    device: (mac, q) => req('GET', `/api/devices/${encodeURIComponent(mac)}?` + new URLSearchParams(q)),
    rename: (mac, name) => req('PATCH', `/api/devices/${encodeURIComponent(mac)}`, { name }),
    pause: (mac, paused) => req('POST', `/api/devices/${encodeURIComponent(mac)}/pause`, { paused }),
    forget: (mac) => req('POST', `/api/devices/${encodeURIComponent(mac)}/forget`),
    blockDomain: (domain) => req('POST', '/api/block-domain', { domain }),
    protection: (q = {}) => req('GET', '/api/protection?' + new URLSearchParams(q)),
    activate: (level, options) => req('POST', '/api/protection/activate', { level, options }),
    rollback: () => req('POST', '/api/protection/rollback'),
    enableDnsInsights: () => req('POST', '/api/dns-insights'),
  };
}

function demoClient() {
  let adapter = null, caps = {}, router = null, job = null, protection = { level: 0, status: 'off' };
  let snapshot = null;
  const overrides = LS.get('demoOverrides', {});
  const save = () => LS.set('demoOverrides', overrides);
  const data = async () => {
    const d = adapter.dataset();
    d.devices = d.devices.filter(x => !overrides[x.mac]?.forgotten).map(x => ({ ...x, ...(overrides[x.mac] || {}) }));
    return { ...d, live: await adapter.live() };
  };
  const status = async () => ({ ...protection, ...(await adapter.protectionState()) });
  let connecting = null;
  const connectDemo = () => connecting ||= (async () => { const a = createDemo(); await a.connect(); caps = await a.capabilities(); router = { ...(await a.info()), adapter: 'demo', adapterName: 'Demo router (simulated)' }; adapter = a; })().finally(() => { connecting = null; });
  if (LS.get('demoConnected', true)) connectDemo();
  const range = (q) => q.from ? { from: +q.from, to: +q.to } : (q.range || 'today');
  const need = async () => { if (!adapter) { if (LS.get('demoConnected', true)) await connectDemo(); else throw Object.assign(new Error('No router connected'), { status: 409 }); } };
  return {
    mode: 'demo',
    async status() { if (LS.get('demoConnected', true) && !adapter) await connectDemo(); return { connected: !!adapter, router, capabilities: caps, capabilityLabels: CAPABILITIES, local: true, demo: true }; },
    async discover() {
      await new Promise(r => setTimeout(r, 1200));
      return { gateways: [{ host: '192.168.1.1', mac: '94:83:C4:0A:1B:2C', vendor: 'Simulated', reachable: true, luci: true, ubus: true, title: 'OpenWrt', label: 'Example router (simulated)', suggestion: { id: 'openwrt', status: 'supported' }, demo: true }], scannedAt: Date.now() };
    },
    async adapters() {
      return [
        { id: 'openwrt', name: 'OpenWrt / LuCI', status: 'supported', needsCredentials: true, defaultUser: 'root', description: 'Routers running OpenWrt, including GL.iNet, Turris and many TP-Link, Linksys and Xiaomi models flashed with OpenWrt.' },
        { id: 'demo', name: 'Demo router (simulated)', status: 'supported', needsCredentials: false, description: 'A simulated home network with 10 devices. Nothing on your real network is touched.' },
        { id: 'generic', name: 'Any router (basic)', status: 'basic', needsCredentials: false, description: 'No login needed. Lists devices seen on your network. Usage, DNS and protection need a supported router.' },
        ...['Ubiquiti UniFi', 'MikroTik RouterOS', 'ASUS (Asuswrt / Merlin)', 'TP-Link', 'AVM FRITZ!Box', 'ISP-supplied router'].map(n => ({ id: n, name: n, status: 'planned', description: 'Planned adapter. Use "Any router (basic)" for now.' })),
      ];
    },
    async connect() { await new Promise(r => setTimeout(r, 900)); LS.set('demoConnected', true); await connectDemo(); return { router, capabilities: caps }; },
    async disconnect() { LS.set('demoConnected', false); adapter = null; return { ok: true }; },
    async overview(q) { await need(); return buildOverview({ router, capabilities: caps, ...(await data()), protection: await status(), range: range(q), filters: q }); },
    async device(mac, q) { await need(); const d = await data(); const device = d.devices.find(x => x.mac === mac); if (!device) throw new Error('Device not found'); return buildDeviceDetail({ device, ...d, capabilities: caps, range: range(q) }); },
    async rename(mac, name) { overrides[mac] = { ...(overrides[mac] || {}), name: name || null }; save(); return { ok: true }; },
    async pause(mac, paused) { await adapter.setDevicePaused(mac, paused); overrides[mac] = { ...(overrides[mac] || {}), blocked: paused }; save(); return { ok: true }; },
    async forget(mac) { overrides[mac] = { forgotten: true }; save(); return { ok: true }; },
    async blockDomain(domain) { await adapter.blockDomain(domain); return { ok: true, domain, service: classify(domain).service }; },
    async protection(q = {}) {
      await need();
      const d = await data();
      const st = await status();
      return { status: st, job, levels: LEVELS, providers: DOH_PROVIDERS, capabilities: caps,
        plans: Object.fromEntries([1, 2, 3].map(l => [l, buildPlan(l, caps, { dohProvider: q.provider || 'quad9' })])),
        audit: exposureAudit({ devices: d.devices, dnsEvents: d.dnsEvents, protection: st }) };
    },
    async activate(level, options = {}) {
      const plan = buildPlan(level, caps, options);
      job = { level, status: 'running', results: {} };
      activate({ plan, adapter, checker: demoChecker(adapter, { failAt: options.rehearseFailure }), onUpdate: s => { job = s; } })
        .then(s => { job = s; if (s.status === 'active') { protection = { level, status: 'active', since: Date.now(), provider: plan.provider.name }; snapshot = { id: s.snapshotId }; } });
      return { started: true, plan };
    },
    async rollback() { if (snapshot) await adapter.restore(snapshot); protection = { level: 0, status: 'off' }; job = null; return { ok: true }; },
    async enableDnsInsights() { return { ok: true }; },
  };
}

const LOCAL_AGENTS = ['http://127.0.0.1:7380', 'http://localhost:7380'];

/** Pick up a pairing code handed back by the agent's /pair page (?pair=...), then strip it from the address bar. */
function takePairingCode() {
  try {
    const u = new URL(location.href);
    const code = u.searchParams.get('pair');
    if (!code) return;
    settings.token = code;
    u.searchParams.delete('pair');
    history.replaceState(null, '', u.pathname + u.search + u.hash);
  } catch {}
}

export const demo = {
  get chosen() { return LS.get('demoChosen', false); },
  set chosen(v) { LS.set('demoChosen', v); },
};

export async function createApi() {
  takePairingCode();
  const candidates = [settings.agentUrl || null, location.protocol.startsWith('http') ? '' : null, ...LOCAL_AGENTS].filter(x => x !== null);
  let paired = null;
  for (const base of [...new Set(candidates)]) {
    try {
      const r = await fetch(base + '/api/status', { headers: settings.token ? { authorization: 'Bearer ' + settings.token } : {}, signal: AbortSignal.timeout(2500) });
      const json = (r.headers.get('content-type') || '').includes('json');
      if (r.status === 401 && json) { const j = await r.json().catch(() => ({})); paired ||= { ...agentClient(base), needsPairing: true, base, pairUrl: j.pairUrl || null }; continue; }
      if (r.ok && json) { demo.chosen = false; return { ...agentClient(base), base }; }
    } catch {}
  }
  if (paired) return paired;
  if (demo.chosen) return demoClient();
  return { mode: 'none', candidates: LOCAL_AGENTS };
}
