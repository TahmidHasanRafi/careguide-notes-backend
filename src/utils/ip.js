import net from 'node:net';

/** "::ffff:1.2.3.4" -> "1.2.3.4", "::1" -> "127.0.0.1" so whitelists can use plain IPv4. */
export function normalizeIp(ip = '') {
  const s = String(ip).trim();
  if (s === '::1') return '127.0.0.1';
  return s.startsWith('::ffff:') ? s.slice(7) : s;
}

/** Accepts an IPv4/IPv6 address or an IPv4 CIDR range such as 103.10.0.0/16. */
export function isValidIpRule(rule) {
  const [addr, bits, extra] = String(rule).split('/');
  if (extra !== undefined) return false;
  if (bits === undefined) return net.isIP(addr) !== 0;
  return net.isIPv4(addr) && /^\d{1,2}$/.test(bits) && Number(bits) <= 32;
}

const toInt = (ip) => ip.split('.').reduce((n, part) => (n << 8) + Number(part), 0) >>> 0;

function matches(ip, rule) {
  const [addr, bits] = rule.split('/');
  if (bits === undefined) return normalizeIp(addr) === ip;
  if (!net.isIPv4(ip)) return false;
  const mask = Number(bits) === 0 ? 0 : (~0 << (32 - Number(bits))) >>> 0;
  return (toInt(ip) & mask) === (toInt(addr) & mask);
}

/** Empty list = no restriction. */
export function ipAllowed(clientIp, allowedIps = []) {
  if (!allowedIps.length) return true;
  const ip = normalizeIp(clientIp);
  return allowedIps.some((rule) => matches(ip, rule));
}
