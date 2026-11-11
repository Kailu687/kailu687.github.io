// Builds the JSON that the dashboard and device screens render. Shared by the
// local agent (real data from the store) and the browser demo (simulated data).
import { summariseDevice, exposureAudit } from './interpret.js';
import { inferDevice, vendorOf, isRandomisedMac } from './devices.js';

const HOUR = 3600_000;

export function resolveRange(range = 'today', now = Date.now()) {
  const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
  const sod = startOfDay.getTime();
  if (typeof range === 'object' && range.from) return { from: +range.from, to: +range.to || now, label: 'Custom range' };
  switch (range) {
    case 'yesterday': return { from: sod - 86400_000, to: sod, label: 'Yesterday' };
    case '7d': return { from: sod - 6 * 86400_000, to: now, label: 'Last 7 days' };
    case '24h': return { from: now - 86400_000, to: now, label: 'Last 24 hours' };
    default: return { from: sod, to: now, label: 'Today' };
  }
}

function sumBuckets(list = [], from, to) {
  let rx = 0, tx = 0;
  for (const b of list) if (b.t + HOUR > from && b.t < to) { rx += b.rx; tx += b.tx; }
  return { rx, tx, total: rx + tx };
}

function series(list = [], from, to) {
  const span = to - from;
  const step = span > 2 * 86400_000 ? 86400_000 : HOUR;
  const out = new Map();
  for (const b of list) {
    if (b.t + HOUR <= from || b.t >= to) continue;
    const key = step === HOUR ? b.t : startOfLocalDay(b.t);
    const cur = out.get(key) || { t: key, rx: 0, tx: 0 };
    cur.rx += b.rx; cur.tx += b.tx;
    out.set(key, cur);
  }
  return { step, points: [...out.values()].sort((a, b) => a.t - b.t) };
}
function startOfLocalDay(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }

function mergeSeries(all) {
  const m = new Map();
  for (const s of all) for (const p of s.points) {
    const c = m.get(p.t) || { t: p.t, rx: 0, tx: 0 };
    c.rx += p.rx; c.tx += p.tx; m.set(p.t, c);
  }
  return [...m.values()].sort((a, b) => a.t - b.t);
}

export function displayName(d, inferred) {
  return d.name || (d.hostname && !/^(android-|unknown|\*)/i.test(d.hostname) ? d.hostname : null)
    || (inferred?.vendor ? `${inferred.vendor} device` : 'Unknown device');
}

function enrich(d, dnsEvents) {
  const names = dnsEvents.filter(e => e.mac === d.mac).map(e => e.name);
  const inferred = inferDevice({ mac: d.mac, hostname: d.hostname, dnsNames: names });
  return { ...d, displayName: displayName(d, inferred), type: inferred.type, typeLabel: inferred.label,
    typeConfidence: inferred.confidence, typeEvidence: inferred.evidence, vendor: inferred.vendor,
    privateMac: isRandomisedMac(d.mac) };
}

export function buildOverview({ router, devices, buckets, dnsEvents = [], live = null, protection = {}, capabilities = {}, range = 'today', filters = {}, now = Date.now() }) {
  const r = resolveRange(range, now);
  const evInRange = dnsEvents.filter(e => e.ts >= r.from && e.ts <= r.to);
  let list = devices.map(d => {
    const e = enrich(d, dnsEvents);
    const u = sumBuckets(buckets[d.mac], r.from, r.to);
    const top = capabilities.dnsHistory ? summariseDevice(evInRange.filter(x => x.mac === d.mac), { totalBytes: u.total }).services.find(s => s.category !== 'cdn' && s.category !== 'analytics' && s.category !== 'ads' && s.category !== 'os') : null;
    const rate = live?.perDevice?.[d.mac] || null;
    return { ...e, usage: u, topService: top ? top.service : null, live: rate,
      status: d.blocked ? 'paused' : !d.online ? 'offline' : rate && rate.down + rate.up > 0.2 ? 'active' : 'idle' };
  });

  if (filters.connection === 'wired') list = list.filter(d => d.connection === 'wired');
  if (filters.connection === 'wireless') list = list.filter(d => d.connection !== 'wired');
  if (filters.status === 'active') list = list.filter(d => d.status === 'active');
  if (filters.status === 'inactive') list = list.filter(d => d.status !== 'active');
  const sortKey = filters.direction === 'upload' ? 'tx' : filters.direction === 'download' ? 'rx' : 'total';
  list.sort((a, b) => b.usage[sortKey] - a.usage[sortKey]);

  const totals = list.reduce((t, d) => ({ rx: t.rx + d.usage.rx, tx: t.tx + d.usage.tx }), { rx: 0, tx: 0 });
  const allSeries = devices.map(d => series(buckets[d.mac], r.from, r.to));
  const audit = exposureAudit({ devices, dnsEvents: evInRange, protection });
  return {
    router, capabilities, range: r, generatedAt: now,
    counts: {
      total: devices.length,
      online: devices.filter(d => d.online).length,
      wired: devices.filter(d => d.connection === 'wired').length,
      wireless: devices.filter(d => d.connection !== 'wired').length,
    },
    totals: { ...totals, total: totals.rx + totals.tx },
    live: live ? { down: live.down, up: live.up, source: live.source || 'Router interface counters' } : null,
    usageSeries: { step: allSeries[0]?.step || HOUR, points: mergeSeries(allSeries) },
    devices: list,
    protection: { level: protection.level || 0, status: protection.status || 'off', summary: audit },
  };
}

export function buildDeviceDetail({ device, buckets, dnsEvents = [], live = null, capabilities = {}, range = 'today', now = Date.now() }) {
  const r = resolveRange(range, now);
  const mine = dnsEvents.filter(e => e.mac === device.mac);
  const e = enrich(device, mine);
  const usage = sumBuckets(buckets[device.mac], r.from, r.to);
  const timeline = series(buckets[device.mac], r.from, r.to);
  const inRange = mine.filter(x => x.ts >= r.from && x.ts <= r.to);
  const intel = capabilities.dnsHistory ? summariseDevice(inRange, { totalBytes: usage.total }) : null;
  const recent = capabilities.dnsHistory ? inRange.slice(-200).reverse() : [];
  return {
    device: { ...e, vendorSource: vendorOf(device.mac) ? 'MAC address prefix (OUI)' : null },
    range: r, usage, timeline, live: live?.perDevice?.[device.mac] || null,
    activity: intel ? {
      services: intel.services, trackers: intel.trackers.map(t => t.service),
      totalQueries: intel.totalQueries, unknownCount: intel.unknownCount,
      note: 'Network activity time is how long this device exchanged traffic with a service. It is not screen time: apps sync, prefetch and play in the background.',
    } : null,
    recentDns: recent,
    capabilities,
  };
}
