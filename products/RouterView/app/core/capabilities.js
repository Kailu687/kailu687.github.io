// The capability contract every router adapter reports. The UI reads this and
// hides or explains features the connected router cannot provide, instead of
// showing a button that does nothing.

export const CAPABILITIES = {
  deviceDiscovery: 'See connected devices',
  macLookup: 'Read MAC addresses',
  wirelessInfo: 'Wi-Fi band and signal strength',
  trafficCounters: 'Per-device data usage',
  liveBandwidth: 'Live upload and download speed',
  dnsHistory: 'DNS lookups per device',
  deviceBlocking: 'Pause or block a device',
  domainBlocking: 'Block domains network-wide',
  encryptedDns: 'Encrypted DNS for the whole home',
  vpnGateway: 'Route the home through a VPN',
  firewall: 'Kill switch and leak protection',
  ipv6Control: 'Control IPv6 routing',
  configSnapshot: 'Back up and restore settings',
};

export function emptyCapabilities() {
  return Object.fromEntries(Object.keys(CAPABILITIES).map(k => [k, false]));
}

/** What each protection level needs from the router. */
export const LEVEL_REQUIREMENTS = {
  1: ['encryptedDns', 'configSnapshot'],
  2: ['encryptedDns', 'vpnGateway', 'firewall', 'configSnapshot'],
  3: ['encryptedDns', 'vpnGateway', 'firewall', 'ipv6Control', 'configSnapshot'],
};

export function missingFor(level, caps) {
  return (LEVEL_REQUIREMENTS[level] || []).filter(k => !caps[k]);
}
