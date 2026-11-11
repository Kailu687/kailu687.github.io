// Device intelligence: vendor from MAC OUI, device type from hostname,
// vendor and DNS behaviour. Every guess carries the evidence behind it.
import { classify } from './interpret.js';

// A small built-in OUI table. The agent can load the full IEEE list later.
export const OUI = {
  '00:1A:11': 'Google', 'F4:F5:D8': 'Google', '3C:5A:B4': 'Google', 'D8:EB:46': 'Google',
  'F0:18:98': 'Apple', 'AC:BC:32': 'Apple', '3C:22:FB': 'Apple', 'A4:83:E7': 'Apple', '8C:85:90': 'Apple',
  '5C:F9:38': 'Apple', 'BC:D0:74': 'Apple', '14:7D:DA': 'Apple',
  '8C:79:F5': 'Samsung', 'FC:A1:3E': 'Samsung', '64:1C:AE': 'Samsung', 'CC:6E:A4': 'Samsung', '50:32:75': 'Samsung',
  '54:E1:AD': 'Lenovo', '98:FA:9B': 'Lenovo', 'E8:6A:64': 'Lenovo', '8C:16:45': 'Lenovo',
  '3C:A9:F4': 'Intel', 'A4:C3:F0': 'Intel', '7C:B2:7D': 'Intel', 'DC:41:A9': 'Intel',
  '00:15:5D': 'Microsoft', '28:18:78': 'Microsoft', '7C:1E:52': 'Microsoft',
  '44:65:0D': 'Amazon', 'FC:65:DE': 'Amazon', '74:C2:46': 'Amazon', '68:54:FD': 'Amazon',
  'A8:23:FE': 'LG Electronics', '64:BC:0C': 'LG Electronics', 'C8:08:E9': 'LG Electronics',
  '28:6C:07': 'Xiaomi', '64:CC:2E': 'Xiaomi', '78:11:DC': 'Xiaomi', '50:EC:50': 'Xiaomi',
  'D8:1F:12': 'Tuya', '10:D5:61': 'Tuya', '68:57:2D': 'Tuya',
  '00:17:88': 'Philips Hue', 'EC:B5:FA': 'Philips Hue',
  'B8:27:EB': 'Raspberry Pi', 'DC:A6:32': 'Raspberry Pi', 'E4:5F:01': 'Raspberry Pi',
  '00:04:4B': 'Nvidia', '48:B0:2D': 'Nvidia',
  '70:9E:29': 'Sony', 'FC:0F:E6': 'Sony', '00:D9:D1': 'Sony',
  '00:0D:B9': 'PC Engines', '94:83:C4': 'GL.iNet', 'E4:95:6E': 'GL.iNet',
  'C4:E9:84': 'TP-Link', '50:C7:BF': 'TP-Link', '14:EB:B6': 'TP-Link',
  '2C:FD:A1': 'ASUSTek', '04:D9:F5': 'ASUSTek', '48:8F:5A': 'MikroTik', 'B8:69:F4': 'MikroTik',
  '24:A4:3C': 'Ubiquiti', '78:8A:20': 'Ubiquiti', 'F0:9F:C2': 'Ubiquiti',
  '00:09:DF': 'Vestel', '40:4E:36': 'HTC', '30:07:4D': 'Samsung', 'E0:D5:5E': 'Giga-Byte',
  'AC:67:B2': 'Espressif', '24:6F:28': 'Espressif', '84:F3:EB': 'Espressif', 'C8:2B:96': 'Espressif',
  'A0:CE:C8': 'OnePlus', '94:65:2D': 'OnePlus', '64:A2:F9': 'OnePlus',
  '00:E0:4C': 'Realtek', '18:C0:4D': 'Giga-Byte', '30:9C:23': 'Micro-Star (MSI)',
  'F8:FF:C2': 'Apple', 'E0:B5:5F': 'Apple',
};

export function normaliseMac(mac) {
  const hex = String(mac || '').replace(/[^0-9a-f]/gi, '').toUpperCase();
  if (hex.length !== 12) return String(mac || '').toUpperCase();
  return hex.match(/.{2}/g).join(':');
}

/** Locally administered (randomised) MACs, used by modern phones per network. */
export function isRandomisedMac(mac) {
  const first = parseInt(normaliseMac(mac).slice(0, 2), 16);
  return !Number.isNaN(first) && (first & 0x02) === 0x02;
}

export function vendorOf(mac) {
  const m = normaliseMac(mac);
  if (isRandomisedMac(m)) return null;
  return OUI[m.slice(0, 8)] || null;
}

export const DEVICE_TYPES = {
  laptop: 'Laptop / PC', phone: 'Phone', tablet: 'Tablet', tv: 'Smart TV', speaker: 'Smart speaker',
  console: 'Game console', iot: 'Smart home device', camera: 'Camera', router: 'Network equipment',
  server: 'Computer / server', watch: 'Wearable', unknown: 'Unidentified',
};

const HOST_HINTS = [
  [/iphone|android|galaxy|pixel|oneplus|redmi|realme|oppo|vivo|phone|sm-[a-z]\d/i, 'phone'],
  [/ipad|tab|kindle/i, 'tablet'],
  [/macbook|laptop|desktop|-pc\b|^pc-|thinkpad|surface|win(dows)?-|imac|mac-?mini|ideapad|legion|dell|hp-/i, 'laptop'],
  [/tv|bravia|roku|firetv|fire-tv|chromecast|shield|webos|tizen/i, 'tv'],
  [/echo|alexa|homepod|nest-?(mini|audio|hub)|google-?home|sonos/i, 'speaker'],
  [/playstation|ps[45]|xbox|switch|steamdeck/i, 'console'],
  [/cam|doorbell|ring-/i, 'camera'],
  [/plug|bulb|light|hue|tuya|esp|shelly|tasmota|sensor|thermostat/i, 'iot'],
  [/watch/i, 'watch'],
  [/raspberrypi|nas|server|synology|ubuntu|debian/i, 'server'],
  [/ap-|switch-|router|mesh|extender|deco|eero/i, 'router'],
];

const VENDOR_HINTS = {
  'Raspberry Pi': 'server', 'Tuya': 'iot', 'Philips Hue': 'iot', 'Espressif': 'iot', 'Amazon': 'speaker',
  'LG Electronics': 'tv', 'Vestel': 'tv', 'Sony': 'console', 'Nvidia': 'tv', 'Intel': 'laptop', 'Lenovo': 'laptop',
  'Micro-Star (MSI)': 'laptop', 'Giga-Byte': 'laptop', 'Realtek': 'laptop', 'OnePlus': 'phone',
  'TP-Link': 'router', 'Ubiquiti': 'router', 'MikroTik': 'router', 'GL.iNet': 'router',
};

const DNS_HINTS = {
  'Windows Update': 'laptop', 'Windows': 'laptop', 'Windows telemetry': 'laptop',
  'Android system': 'phone', 'Samsung Smart TV': 'tv', 'LG Smart TV': 'tv', 'Roku': 'tv',
  'Amazon Alexa': 'speaker', 'Tuya smart devices': 'iot', 'Philips Hue': 'iot',
  'PlayStation Network': 'console', 'Xbox Live': 'console', 'Ring': 'camera', 'Google Nest': 'speaker',
};

/**
 * Infer a device type. Returns { type, label, confidence, evidence[] }.
 * Sources are weighed: hostname > DNS behaviour > vendor.
 */
export function inferDevice({ mac, hostname, dnsNames = [] }) {
  const evidence = [];
  const votes = {};
  const vote = (t, w, why) => { votes[t] = (votes[t] || 0) + w; evidence.push(why); };

  const vendor = vendorOf(mac);
  if (isRandomisedMac(mac)) evidence.push('Uses a private (randomised) MAC address, typical of modern phones');
  if (hostname) for (const [re, t] of HOST_HINTS) if (re.test(hostname)) { vote(t, 3, `Hostname "${hostname}" looks like a ${DEVICE_TYPES[t].toLowerCase()}`); break; }
  const seen = new Set();
  for (const n of dnsNames) {
    const svc = classify(n).service;
    if (DNS_HINTS[svc] && !seen.has(svc)) { seen.add(svc); vote(DNS_HINTS[svc], 2, `Contacts ${svc}`); }
  }
  if (vendor && VENDOR_HINTS[vendor]) vote(VENDOR_HINTS[vendor], 1, `Network card made by ${vendor}`);
  if (isRandomisedMac(mac) && !Object.keys(votes).length) vote('phone', 1, 'Private MAC suggests a phone or tablet');

  const best = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
  if (!best) return { type: 'unknown', label: DEVICE_TYPES.unknown, vendor, confidence: 'low', evidence: evidence.length ? evidence : ['No hostname, vendor or DNS clues yet'] };
  const [type, score] = best;
  return { type, label: DEVICE_TYPES[type], vendor, confidence: score >= 4 ? 'high' : score >= 2 ? 'medium' : 'low', evidence };
}
