// Demo adapter: a simulated OpenWrt-class router with a realistic household.
// Implements the full adapter contract so every screen works end to end.
import { simulate, liveRates } from './simulator.js';
import { emptyCapabilities } from './capabilities.js';

export const meta = {
  id: 'demo', name: 'Demo router (simulated)', family: 'Demo',
  description: 'A simulated home network with 10 devices. Nothing on your real network is touched.',
  needsCredentials: false,
};

export function create() {
  let config = { dns: 'isp', vpn: false, killSwitch: false, ipv6Leak: true, blocked: new Set(), blockedDomains: new Set() };
  const snapshots = new Map();
  return {
    meta,
    async connect() { return true; },
    async info() {
      return { vendor: 'OpenWrt (simulated)', model: 'Demo Router AX3000', firmware: 'OpenWrt 24.10.4', host: '192.168.1.1', wan: 'ISP fibre, 100/30 Mbps' };
    },
    async capabilities() {
      return Object.fromEntries(Object.keys(emptyCapabilities()).map(k => [k, true]));
    },
    dataset(now = Date.now()) {
      const data = simulate(now);
      for (const d of data.devices) if (config.blocked.has(d.mac)) { d.blocked = true; }
      data.dnsEvents = data.dnsEvents.filter(e => !config.blocked.has(e.mac) || e.ts < now - 3600_000);
      return data;
    },
    async live() {
      const l = liveRates();
      for (const mac of config.blocked) if (l.perDevice[mac]) { l.down -= l.perDevice[mac].down; l.up -= l.perDevice[mac].up; l.perDevice[mac] = { down: 0, up: 0 }; }
      l.down = +Math.max(0, l.down).toFixed(1); l.up = +Math.max(0, l.up).toFixed(1);
      return { ...l, source: 'Router WAN interface counters' };
    },
    async setDevicePaused(mac, paused) { paused ? config.blocked.add(mac) : config.blocked.delete(mac); return true; },
    async blockDomain(name) { config.blockedDomains.add(name); return true; },
    async snapshot() {
      const id = 'snap-' + Date.now().toString(36);
      snapshots.set(id, structuredClone({ ...config, blocked: [...config.blocked], blockedDomains: [...config.blockedDomains] }));
      return { id, createdAt: Date.now(), files: ['network', 'dhcp', 'firewall'] };
    },
    async restore(snap) {
      const s = snapshots.get(snap.id);
      if (!s) return { ok: false, detail: 'Snapshot not found' };
      config = { ...s, blocked: new Set(s.blocked), blockedDomains: new Set(s.blockedDomains) };
      return { ok: true, detail: 'Previous settings restored' };
    },
    async applyProtection(plan) {
      await sleep(600);
      config.dns = 'doh';
      if (plan.level >= 2) { config.vpn = true; config.killSwitch = true; }
      if (plan.level >= 3) config.ipv6Leak = false;
      return { ok: true, detail: `${plan.steps.length} changes applied` };
    },
    async protectionState() { return { dnsEncrypted: config.dns === 'doh', vpnActive: config.vpn, killSwitch: config.killSwitch }; },
    // Used by the demo checker
    _config: () => config,
  };
}

/** Simulated checks. Set failAt to a check id to rehearse a rollback. */
export function demoChecker(adapter, { failAt = null } = {}) {
  const step = (id, ok, detail) => async () => { await sleep(350 + Math.random() * 400); return id === failAt ? { ok: false, detail: 'Simulated failure for rollback rehearsal' } : { ok, detail }; };
  return {
    baseline: step('baseline', true, 'google.com reachable in 18 ms'),
    dns: step('dns', true, 'Answers came from the encrypted resolver (DoH)'),
    ipv4: step('ipv4', true, 'IPv4 sites load'),
    ipv6: async (plan) => step('ipv6', true, plan.level >= 3 ? 'IPv6 blocked outside the tunnel, no leak' : 'IPv6 sites load')(),
    sites: step('sites', true, 'youtube.com, google.com, whatsapp.com and netflix.com all load'),
    leak: async (plan) => step('leak', true, plan.level >= 2 ? 'Resolver seen by websites belongs to the VPN, not your ISP' : 'Resolver seen by websites is Quad9, not your ISP')(),
    killswitch: step('killswitch', true, 'With the tunnel down, traffic was blocked as expected. Tunnel restored.'),
  };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
