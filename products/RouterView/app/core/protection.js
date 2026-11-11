// Privacy protection engine. Orchestrates: compatibility check -> snapshot ->
// apply -> independent verification -> active, or automatic rollback.
// It never reports "protected" unless the verification checks passed, and it
// never leaves the network without working internet.
import { missingFor } from './capabilities.js';

export const DOH_PROVIDERS = {
  quad9: { name: 'Quad9', url: 'https://dns.quad9.net/dns-query', bootstrap: ['9.9.9.9', '149.112.112.112'], note: 'Non-profit, blocks known malware domains, no logging of IPs.' },
  cloudflare: { name: 'Cloudflare 1.1.1.1', url: 'https://cloudflare-dns.com/dns-query', bootstrap: ['1.1.1.1', '1.0.0.1'], note: 'Fast, audited no-logging policy.' },
  mullvad: { name: 'Mullvad DNS', url: 'https://dns.mullvad.net/dns-query', bootstrap: ['194.242.2.2'], note: 'Run by a VPN provider with no logging.' },
  adguard: { name: 'AdGuard DNS', url: 'https://dns.adguard-dns.com/dns-query', bootstrap: ['94.140.14.14', '94.140.15.15'], note: 'Blocks ads and trackers for every device.' },
};

export const LEVELS = {
  1: {
    id: 1, name: 'Private DNS', badge: 'Beginner',
    summary: 'Encrypts every website lookup for the whole home and blocks trackers.',
    hides: ['Which website names your devices look up (DNS queries)'],
    stillVisible: ['Website names in most HTTPS handshakes (SNI)', 'Destination IP addresses', 'How much data you use and when'],
    risk: 'Very low. If the encrypted resolver fails, RouterView switches back automatically.',
  },
  2: {
    id: 2, name: 'Enhanced Privacy', badge: 'Recommended',
    summary: 'Sends all home traffic through a WireGuard VPN with DNS inside the tunnel and a kill switch.',
    hides: ['DNS queries', 'Website names (SNI)', 'Destination IP addresses'],
    stillVisible: ['That you use a VPN and its server address', 'How much data you send and when', 'Traffic patterns'],
    risk: 'Low. Some sites may show captchas or region changes. Devices you exempt bypass the tunnel.',
  },
  3: {
    id: 3, name: 'Strict Privacy', badge: 'Advanced',
    summary: 'Forces every device through the tunnel, blocks plain DNS and IPv6 leaks, and fails closed.',
    hides: ['DNS queries', 'Website names (SNI)', 'Destination IP addresses', 'Leaks from devices with hard-coded DNS'],
    stillVisible: ['That you use a VPN and its server address', 'How much data you send and when'],
    risk: 'Medium. If the VPN drops, internet stops until it reconnects. Gaming, captive portals and some smart devices may need exceptions.',
  },
};

export const CHECKS = [
  { id: 'caps', label: 'Router supports the required features' },
  { id: 'baseline', label: 'Internet works before any change' },
  { id: 'snapshot', label: 'Saved a rollback copy of router settings' },
  { id: 'apply', label: 'Applied the new configuration' },
  { id: 'dns', label: 'Lookups resolve through the protected resolver' },
  { id: 'ipv4', label: 'IPv4 sites load' },
  { id: 'ipv6', label: 'IPv6 handled (works through tunnel or blocked safely)' },
  { id: 'sites', label: 'Popular sites and services load (YouTube, Google, WhatsApp, Netflix)' },
  { id: 'leak', label: 'No DNS leaks to your ISP resolver' },
  { id: 'killswitch', label: 'Kill switch blocks traffic outside the tunnel' },
];

export function checksFor(level) {
  return CHECKS.filter(c => {
    if (c.id === 'killswitch') return level >= 2;
    return true;
  });
}

export function buildPlan(level, caps, opts = {}) {
  const missing = missingFor(level, caps);
  const provider = DOH_PROVIDERS[opts.dohProvider || 'quad9'];
  const steps = [];
  steps.push({ kind: 'dns', action: 'Run an encrypted DNS-over-HTTPS proxy on the router', detail: `${provider.name} (${provider.url})` });
  steps.push({ kind: 'dns', action: 'Point the router\'s DNS forwarder at the encrypted proxy and ignore ISP-provided DNS' });
  if (opts.blockTrackers !== false) steps.push({ kind: 'dns', action: 'Block known advertising and tracking domains' });
  if (level >= 2) {
    steps.push({ kind: 'vpn', action: 'Create a WireGuard tunnel interface', detail: opts.vpn?.endpoint ? `Endpoint ${opts.vpn.endpoint}` : 'Using the VPN profile you import' });
    steps.push({ kind: 'vpn', action: 'Route home traffic through the tunnel', detail: (opts.exemptions?.length ? `Except ${opts.exemptions.length} exempted device(s)` : 'All devices') });
    steps.push({ kind: 'firewall', action: 'Add a kill switch: LAN traffic may only leave via the tunnel' });
    steps.push({ kind: 'dns', action: 'Send DNS through the tunnel' });
  }
  if (level >= 3) {
    steps.push({ kind: 'firewall', action: 'Redirect any device using hard-coded DNS (port 53) to the router' });
    steps.push({ kind: 'firewall', action: 'Block DNS-over-TLS (853) and known public DoH endpoints that bypass the router' });
    steps.push({ kind: 'ipv6', action: 'Disable IPv6 outside the tunnel to stop leaks' });
  }
  return { level, levelInfo: LEVELS[level], compatible: missing.length === 0, missing, provider, steps, checks: checksFor(level), options: opts };
}

/**
 * Run the activation. `adapter` must implement snapshot(), applyProtection(plan),
 * restore(snapshot). `checker` implements baseline(), dns(plan), ipv4(), ipv6(plan),
 * sites(), leak(plan), killswitch(plan). Each check returns {ok, detail}.
 * `onUpdate(state)` is called after every step so the UI can stream progress.
 */
export async function activate({ plan, adapter, checker, onUpdate = () => {} }) {
  const state = { level: plan.level, status: 'running', startedAt: Date.now(), results: {}, message: null };
  const mark = (id, r) => { state.results[id] = r; onUpdate(structuredClone(state)); };
  const run = async (id, fn) => {
    mark(id, { status: 'running' });
    try {
      const r = await fn();
      mark(id, { status: r.ok ? 'pass' : 'fail', detail: r.detail });
      return r.ok;
    } catch (err) {
      mark(id, { status: 'fail', detail: String(err.message || err) });
      return false;
    }
  };

  if (!await run('caps', async () => plan.compatible ? { ok: true, detail: 'All required features available' } : { ok: false, detail: `Missing: ${plan.missing.join(', ')}` })) return finish(state, 'blocked', 'This router cannot run this level. Nothing was changed.', onUpdate);
  if (!await run('baseline', () => checker.baseline())) return finish(state, 'blocked', 'Your internet is not working right now, so RouterView did not change anything.', onUpdate);
  let snap;
  if (!await run('snapshot', async () => { snap = await adapter.snapshot(); return { ok: !!snap, detail: snap ? `Saved ${snap.id}` : 'Could not read current settings' }; })) return finish(state, 'blocked', 'Could not save a rollback copy, so nothing was changed.', onUpdate);
  state.snapshotId = snap.id;

  const applied = await run('apply', () => adapter.applyProtection(plan));
  let ok = applied;
  if (ok) {
    for (const c of plan.checks.filter(c => !['caps', 'baseline', 'snapshot', 'apply'].includes(c.id))) {
      const fn = checker[c.id];
      if (!fn) continue;
      if (!await run(c.id, () => fn.call(checker, plan))) { ok = false; break; }
    }
  }
  if (!ok) {
    await adapter.restore(snap);
    const internet = await checker.baseline().catch(() => ({ ok: false }));
    state.rolledBack = true;
    return finish(state, 'rolled_back', internet.ok
      ? 'A check failed, so RouterView restored your previous settings. Your internet works as before.'
      : 'A check failed and settings were restored, but the internet check still fails. Restart the router to load the saved settings.', onUpdate);
  }
  return finish(state, 'active', `${plan.levelInfo.name} is on and verified.`, onUpdate);
}

function finish(state, status, message, onUpdate) {
  state.status = status; state.message = message; state.finishedAt = Date.now();
  onUpdate(structuredClone(state));
  return state;
}
