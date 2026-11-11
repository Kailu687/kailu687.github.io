// Deterministic simulated household. Powers the demo adapter so every screen
// works end to end without a real router. Same inputs give the same output,
// and the data moves forward with the clock.

const HOUR = 3600_000;

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1_000_000) / 1_000_000; };
}

// Activity curves by hour of day (0..23), 0..1.
const CURVES = {
  worker: [0,0,0,0,0,0,.1,.3,.5,.8,.9,.9,.6,.8,.9,.9,.7,.5,.4,.6,.7,.6,.3,.1],
  phone: [.1,.05,0,0,0,.05,.3,.5,.4,.3,.3,.4,.6,.4,.3,.3,.4,.6,.8,.9,.9,.8,.6,.3],
  tv: [0,0,0,0,0,0,0,.1,.1,0,0,0,.1,.1,0,0,.1,.3,.6,.9,1,.9,.6,.2],
  iot: Array(24).fill(.25),
  console: [.2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,.2,.5,.7,.8,.9,.9,.8,.6,.4],
  tablet: [0,0,0,0,0,0,.1,.2,.1,0,0,0,0,0,.2,.5,.7,.6,.5,.3,.2,.1,0,0],
};

// Service mixes: [weight, domains...]
const MIX = {
  laptop: [
    [5, 'www.youtube.com', 'youtubei.googleapis.com', 'rr3---sn-4g5ednsl.googlevideo.com', 'i.ytimg.com', 'yt3.ggpht.com'],
    [3, 'www.google.com', 'fonts.gstatic.com', 'www.googleapis.com'],
    [3, 'github.com', 'avatars.githubusercontent.com', 'api.github.com'],
    [2, 'claude.ai', 'api.anthropic.com'],
    [2, 'outlook.office365.com', 'teams.microsoft.com', 'login.live.com'],
    [2, 'settings-win.data.microsoft.com', 'v10.events.data.microsoft.com', 'tlu.dl.delivery.mp.microsoft.com'],
    [1, 'stackoverflow.com', 'cdn.sstatic.net'],
    [1, 'googleads.g.doubleclick.net', 'www.google-analytics.com', 'www.googletagmanager.com'],
    [1, 'open.spotify.com', 'audio-ak-spotify-com.akamaized.net', 'i.scdn.co'],
    [1, 'd1x9kq3h7c2b.cloudfront.net'],
  ],
  phone: [
    [5, 'i.instagram.com', 'scontent.cdninstagram.com', 'graph.instagram.com', 'static.xx.fbcdn.net'],
    [4, 'g.whatsapp.net', 'mmg.whatsapp.net', 'web.whatsapp.com'],
    [3, 'youtubei.googleapis.com', 'rr5---sn-cvh7knek.googlevideo.com', 'i.ytimg.com'],
    [2, 'spclient.wg.spotify.com', 'audio4-fa.scdn.co'],
    [2, 'android.clients.google.com', 'connectivitycheck.gstatic.com', 'play.googleapis.com'],
    [2, 'app-measurement.com', 'firebase-settings.crashlytics.com', 'graph.facebook.com', 't.appsflyer.com'],
    [1, 'www.swiggy.com', 'media-assets.swiggy.com'],
    [1, 'www.amazon.in', 'm.media-amazon.com', 'aax-eu.amazon-adsystem.com'],
    [1, 'x7rmq2.edge-cdn-node.net'],
  ],
  iphone: [
    [4, 'www.tiktok.com', 'v16m.tiktokcdn.com', 'api16-normal-c-useast1a.tiktokv.com'],
    [3, 'i.instagram.com', 'scontent.cdninstagram.com'],
    [3, 'gateway.icloud.com', 'p52-caldav.icloud.com', 'api.push.apple.com'],
    [2, 'open.spotify.com', 'audio4-fa.scdn.co'],
    [1, 'xp.apple.com', 'app-measurement.com'],
    [1, 'captive.apple.com'],
  ],
  tv: [
    [6, 'www.netflix.com', 'ipv4-c071-bom001-ix.1.oca.nflxvideo.net', 'occ-0-2042-3647.1.nflxso.net', 'assets.nflxext.com'],
    [3, 'www.youtube.com', 'rr1---sn-4g5e6nsz.googlevideo.com', 'i.ytimg.com'],
    [2, 'www.hotstar.com', 'hses.akamaized.net', 'img1.hotstarext.com'],
    [2, 'lgtvsdp.com', 'us.info.lgsmartad.com', 'ngfts.lge.com'],
  ],
  speaker: [
    [5, 'avs-alexa-na.amazon.com', 'api.amazonalexa.com'],
    [2, 'device-metrics-us.amazon.com'],
    [2, 'audio-ak-spotify-com.akamaized.net', 'spclient.wg.spotify.com'],
    [1, 'pool.ntp.org'],
  ],
  plug: [
    [5, 'a1.tuyaeu.com', 'm1.tuyaeu.com'],
    [1, 'pool.ntp.org'],
  ],
  console: [
    [5, 'store.playstation.net', 'gs2.ww.prod.dl.playstation.net', 'np.community.playstation.net'],
    [2, 'www.youtube.com', 'rr2---sn-4g5edns7.googlevideo.com'],
    [1, 'www.twitch.tv', 'video-weaver.bom01.hls.ttvnw.net'],
  ],
  tablet: [
    [5, 'www.youtube.com', 'youtubei.googleapis.com', 'rr4---sn-4g5e6nzl.googlevideo.com', 'i.ytimg.com'],
    [3, 'www.roblox.com', 'tr.rbxcdn.com', 'apis.roblox.com'],
    [2, 'unityads.unity3d.com', 'ms.applovin.com'],
  ],
  unknown: [
    [3, 'k4fz8.qq-cdn-edge.com'],
    [2, 'pool.ntp.org'],
    [2, 'iot-telemetry.unknownvendor.cn'],
  ],
};

export const HOUSEHOLD = [
  { mac: '54:E1:AD:12:34:56', ip: '192.168.1.105', hostname: 'Kailash-Laptop', name: "Kailash's Laptop", connection: 'wifi', band: '5 GHz', signal: -48, curve: 'worker', mix: 'laptop', peakMbps: 60, ageDays: 210 },
  { mac: '8C:79:F5:AA:10:22', ip: '192.168.1.112', hostname: 'Galaxy-S24', name: 'Galaxy Phone', connection: 'wifi', band: '5 GHz', signal: -55, curve: 'phone', mix: 'phone', peakMbps: 18, ageDays: 120 },
  { mac: '3A:2F:91:C4:77:01', ip: '192.168.1.118', hostname: 'iPhone', name: null, connection: 'wifi', band: '5 GHz', signal: -61, curve: 'phone', mix: 'iphone', peakMbps: 14, ageDays: 40 },
  { mac: 'A8:23:FE:56:9C:10', ip: '192.168.1.120', hostname: 'LGwebOSTV', name: 'Living Room TV', connection: 'wifi', band: '5 GHz', signal: -58, curve: 'tv', mix: 'tv', peakMbps: 25, ageDays: 400 },
  { mac: '18:C0:4D:3B:22:EE', ip: '192.168.1.10', hostname: 'DESKTOP-7QF2', name: 'Study PC', connection: 'wired', band: null, signal: null, curve: 'worker', mix: 'laptop', peakMbps: 40, ageDays: 300 },
  { mac: '74:C2:46:01:9A:3C', ip: '192.168.1.130', hostname: 'echo-dot', name: 'Kitchen Echo', connection: 'wifi', band: '2.4 GHz', signal: -63, curve: 'iot', mix: 'speaker', peakMbps: 1, ageDays: 500 },
  { mac: 'D8:1F:12:6E:44:90', ip: '192.168.1.141', hostname: 'smartplug-04', name: 'Smart Plug', connection: 'wifi', band: '2.4 GHz', signal: -70, curve: 'iot', mix: 'plug', peakMbps: 0.05, ageDays: 260 },
  { mac: '70:9E:29:88:1D:4B', ip: '192.168.1.11', hostname: 'PS5', name: 'PlayStation 5', connection: 'wired', band: null, signal: null, curve: 'console', mix: 'console', peakMbps: 45, ageDays: 180 },
  { mac: '9E:4B:20:D1:3F:72', ip: '192.168.1.150', hostname: '', name: null, connection: 'wifi', band: '2.4 GHz', signal: -74, curve: 'iot', mix: 'unknown', peakMbps: 0.4, ageDays: 2 },
  { mac: 'E0:B5:5F:21:6A:0D', ip: '192.168.1.126', hostname: 'iPad', name: "Kids' iPad", connection: 'wifi', band: '5 GHz', signal: -59, curve: 'tablet', mix: 'tablet', peakMbps: 12, ageDays: 90 },
];

function activity(d, hourStart) {
  const h = new Date(hourStart).getHours();
  const r = rng(hash(d.mac + ':' + hourStart))();
  const base = CURVES[d.curve][h];
  return Math.max(0, base * (0.55 + 0.9 * r) - 0.05);
}

/** Bytes moved by a device in one hour bucket. */
export function hourBytes(d, hourStart) {
  const a = activity(d, hourStart);
  const avgMbps = d.peakMbps * a * 0.09;
  const rx = Math.round(avgMbps * 1e6 / 8 * 3600);
  const upRatio = d.mix === 'laptop' ? 0.18 : d.mix === 'console' ? 0.06 : d.mix === 'tv' ? 0.02 : 0.12;
  return { rx, tx: Math.round(rx * upRatio + 2e5 * a) };
}

export function simulate(now = Date.now(), { hours = 24 * 7 } = {}) {
  const currentHour = Math.floor(now / HOUR) * HOUR;
  const devices = [];
  const buckets = {};
  const dnsEvents = [];
  const dayAgo = now - 24 * HOUR;

  for (const d of HOUSEHOLD) {
    const list = [];
    let lastActive = null;
    for (let t = currentHour - (hours - 1) * HOUR; t <= currentHour; t += HOUR) {
      const frac = t === currentHour ? (now - t) / HOUR : 1;
      const b = hourBytes(d, t);
      const rx = Math.round(b.rx * frac), tx = Math.round(b.tx * frac);
      list.push({ t, rx, tx });
      if (rx > 2e6) lastActive = t + Math.round(frac * HOUR * 0.9);
      if (t >= dayAgo - HOUR) emitDns(d, t, frac, now, dnsEvents);
    }
    buckets[d.mac] = list;
    const liveAct = activity(d, currentHour);
    const online = d.curve === 'iot' || liveAct > 0.05;
    devices.push({
      mac: d.mac, ip: d.ip, hostname: d.hostname, name: d.name, connection: d.connection, band: d.band,
      signal: d.signal == null ? null : d.signal + Math.round(rng(hash(d.mac + now.toString().slice(0, -4)))() * 6 - 3),
      online, firstSeen: now - d.ageDays * 86400_000, lastActive: online && liveAct > 0.05 ? now - 20_000 : lastActive,
      blocked: false,
    });
  }
  return { devices, buckets, dnsEvents: dnsEvents.sort((a, b) => a.ts - b.ts) };
}

function emitDns(d, hourStart, frac, now, out) {
  const a = activity(d, hourStart);
  if (a <= 0.02) return;
  const r = rng(hash('dns' + d.mac + hourStart));
  const mix = MIX[d.mix];
  const totalW = mix.reduce((t, m) => t + m[0], 0);
  const sessions = Math.max(1, Math.round(a * 4));
  for (let s = 0; s < sessions; s++) {
    let pick = r() * totalW, group = mix[0];
    for (const m of mix) { pick -= m[0]; if (pick <= 0) { group = m; break; } }
    const start = hourStart + Math.floor(r() * 50) * 60_000;
    const length = Math.round((5 + r() * 40) * a) * 60_000;
    for (let ts = start; ts <= start + length; ts += (2 + Math.floor(r() * 4)) * 60_000) {
      if (ts > now || ts > hourStart + frac * HOUR) break;
      const domains = group.slice(1);
      out.push({ ts, mac: d.mac, name: domains[Math.floor(r() * domains.length)] });
    }
  }
}

/** Live throughput per device in Mbps, smoothly varying second to second. */
export function liveRates(now = Date.now()) {
  const currentHour = Math.floor(now / HOUR) * HOUR;
  const per = {};
  let down = 0, up = 0;
  for (const d of HOUSEHOLD) {
    const a = activity(d, currentHour);
    const wobble = 0.6 + 0.4 * Math.sin(now / 7000 + hash(d.mac) % 10) + 0.2 * Math.sin(now / 1900 + hash(d.mac) % 7);
    const dn = Math.max(0, d.peakMbps * a * wobble);
    const upm = dn * (d.mix === 'laptop' ? 0.25 : 0.08);
    per[d.mac] = { down: +dn.toFixed(2), up: +upm.toFixed(2) };
    down += dn; up += upm;
  }
  return { down: +down.toFixed(1), up: +up.toFixed(1), perDevice: per };
}
