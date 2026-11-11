// Parse a WireGuard .conf exported by a VPN provider.
export function parseWireGuard(text) {
  const get = (k) => text.match(new RegExp('^\\s*' + k + '\\s*=\\s*(.+)$', 'mi'))?.[1].trim();
  const privateKey = get('PrivateKey'), publicKey = get('PublicKey'), endpoint = get('Endpoint'), address = get('Address');
  if (!privateKey || !publicKey || !endpoint || !address) return null;
  return { privateKey, publicKey, endpoint, address, dns: get('DNS')?.split(',')[0].trim(), presharedKey: get('PresharedKey'), ipv6: /::\/0/.test(get('AllowedIPs') || '') };
}

