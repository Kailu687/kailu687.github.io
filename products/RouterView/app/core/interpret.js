// DNS interpretation engine: turns raw DNS queries into services a person
// recognises, with an honest confidence level and "network activity time".
import { matchDomain, baseDomain, normaliseName, CATEGORIES } from './domains.js';

export const CONFIDENCE = {
  high: 'Directly identified domain or known app endpoint',
  medium: 'Inferred from supporting domains or traffic patterns',
  low: 'Shared infrastructure or ambiguous destination',
};

// Two queries for the same service closer than this are one activity session.
export const SESSION_GAP_MS = 5 * 60 * 1000;
// A single isolated query counts as this much activity.
export const MIN_SESSION_MS = 60 * 1000;

// Relative bandwidth weight per category, used only when the router cannot
// attribute bytes to destinations and we have to estimate.
const CATEGORY_WEIGHT = {
  video: 40, gaming: 12, music: 6, social: 10, os: 8, messaging: 4, productivity: 3,
  shopping: 3, news: 2, search: 1, dev: 3, ai: 2, smarthome: 1, finance: 1,
  ads: 0.5, analytics: 0.2, cdn: 4,
};

/** Classify one DNS name. */
export function classify(name) {
  const n = normaliseName(name);
  const rule = matchDomain(n);
  if (!rule) {
    return {
      name: n, service: baseDomain(n), category: 'unknown', categoryLabel: 'Unrecognised',
      confidence: 'low', tracker: false, known: false, reason: 'Not in the app database yet',
    };
  }
  const confidence = rule.strength === 'direct' ? 'high' : rule.strength === 'support' ? 'medium' : 'low';
  return {
    name: n, service: rule.service, category: rule.category,
    categoryLabel: CATEGORIES[rule.category] || rule.category,
    role: rule.role || null, confidence, tracker: !!rule.tracker, known: true,
    matched: rule.matched,
    reason: rule.strength === 'direct' ? `${rule.matched} belongs to ${rule.service}`
      : rule.strength === 'support' ? `${rule.matched} is mostly used by ${rule.service}`
      : `${rule.matched} is shared by many services`,
  };
}

/**
 * Summarise DNS events for one device.
 * @param {Array<{ts:number,name:string,bytes?:number}>} events
 * @param {{totalBytes?:number}} opts  device byte total for the window, used to estimate per-service bytes
 */
export function summariseDevice(events, opts = {}) {
  const sorted = [...events].sort((a, b) => a.ts - b.ts);
  const services = new Map();

  for (const ev of sorted) {
    const c = classify(ev.name);
    const key = c.service;
    let s = services.get(key);
    if (!s) {
      s = {
        service: c.service, category: c.category, categoryLabel: c.categoryLabel,
        tracker: c.tracker, known: c.known, domains: new Map(), queries: 0,
        bytes: 0, bytesMeasured: false, sessions: [], best: c.confidence, firstSeen: ev.ts, lastSeen: ev.ts,
      };
      services.set(key, s);
    }
    s.queries++;
    s.lastSeen = ev.ts;
    if (typeof ev.bytes === 'number') { s.bytes += ev.bytes; s.bytesMeasured = true; }
    const d = s.domains.get(c.name) || { name: c.name, count: 0, confidence: c.confidence, role: c.role, reason: c.reason, lastSeen: 0 };
    d.count++; d.lastSeen = ev.ts;
    s.domains.set(c.name, d);
    s.best = rank(c.confidence) > rank(s.best) ? c.confidence : s.best;

    const last = s.sessions[s.sessions.length - 1];
    if (last && ev.ts - last.end <= SESSION_GAP_MS) last.end = ev.ts;
    else s.sessions.push({ start: ev.ts, end: ev.ts });
  }

  const list = [...services.values()].map(s => {
    // Support domains seen alongside a direct one corroborate each other.
    const hasDirect = [...s.domains.values()].some(d => d.confidence === 'high');
    const hasSupport = [...s.domains.values()].some(d => d.confidence === 'medium');
    let confidence = s.best;
    if (hasDirect && hasSupport) confidence = 'high';
    const activeMs = s.sessions.reduce((t, x) => t + Math.max(MIN_SESSION_MS, x.end - x.start), 0);
    return {
      service: s.service, category: s.category, categoryLabel: s.categoryLabel, tracker: s.tracker,
      known: s.known, confidence, queries: s.queries, activeMs, sessions: s.sessions.length,
      firstSeen: s.firstSeen, lastSeen: s.lastSeen, bytes: s.bytes, bytesMeasured: s.bytesMeasured,
      domains: [...s.domains.values()].sort((a, b) => b.count - a.count),
    };
  });

  // Estimate bytes for services the router could not measure directly.
  const total = opts.totalBytes || 0;
  const measured = list.reduce((t, s) => t + (s.bytesMeasured ? s.bytes : 0), 0);
  const remaining = Math.max(0, total - measured);
  const unmeasured = list.filter(s => !s.bytesMeasured);
  const weightSum = unmeasured.reduce((t, s) => t + weightOf(s), 0);
  if (remaining > 0 && weightSum > 0) {
    for (const s of unmeasured) { s.bytes = Math.round(remaining * weightOf(s) / weightSum); s.bytesEstimated = true; }
  }

  list.sort((a, b) => b.bytes - a.bytes || b.activeMs - a.activeMs);
  return {
    services: list,
    trackers: list.filter(s => s.tracker),
    unknownCount: list.filter(s => !s.known).length,
    totalQueries: sorted.length,
  };
}

function weightOf(s) {
  return (CATEGORY_WEIGHT[s.category] ?? 1) * Math.log2(1 + s.activeMs / 60000) * (s.tracker ? 0.1 : 1);
}
function rank(c) { return c === 'high' ? 3 : c === 'medium' ? 2 : 1; }

/** Household-wide privacy exposure: what an ISP could observe today. */
export function exposureAudit({ devices, dnsEvents, protection }) {
  const names = new Set(dnsEvents.map(e => normaliseName(e.name)));
  const services = new Set(dnsEvents.map(e => classify(e.name).service));
  const trackers = new Set(dnsEvents.map(e => classify(e.name)).filter(c => c.tracker).map(c => c.service));
  const dnsPlain = !protection?.dnsEncrypted;
  const tunnel = !!protection?.vpnActive;
  return {
    observableDomains: dnsPlain && !tunnel ? names.size : 0,
    observableServices: dnsPlain && !tunnel ? services.size : (tunnel ? 0 : services.size),
    trackerServices: trackers.size,
    devices: devices.length,
    findings: [
      dnsPlain && !tunnel && { id: 'plain-dns', severity: 'high', title: 'DNS lookups are unencrypted',
        detail: `Every website lookup (${names.size} distinct names in this window) travels in plain text through your ISP's network.` },
      !tunnel && { id: 'sni', severity: 'medium', title: 'Website names leak in the TLS handshake',
        detail: 'Even with encrypted DNS, most HTTPS connections still reveal the site name (SNI) and the destination IP address to your ISP.' },
      !tunnel && { id: 'ip', severity: 'medium', title: 'Destination IP addresses are visible',
        detail: 'Your ISP routes every packet, so it always sees which servers you talk to unless traffic goes through a tunnel.' },
      tunnel && { id: 'vpn-visible', severity: 'info', title: 'Your ISP can see you use a VPN',
        detail: 'It sees the VPN server address, how much data you send and when. It does not normally see the sites inside the tunnel.' },
      { id: 'devices', severity: 'info', title: 'Your individual devices and MAC addresses stay hidden',
        detail: 'Your router puts every device behind one public address (NAT), so your ISP normally sees one home connection, not each phone or laptop. Exception: an ISP-supplied router with remote management (TR-069) can report its device list to the ISP. Turning that off, where your ISP allows it, closes this gap.' },
      trackers.size > 0 && { id: 'trackers', severity: 'low', title: `${trackers.size} advertising or analytics services contacted`,
        detail: 'These are not ISP risks, but blocking them at the router reduces data leaving your home.' },
    ].filter(Boolean),
  };
}
