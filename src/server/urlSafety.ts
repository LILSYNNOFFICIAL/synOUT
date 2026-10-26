import dns from 'node:dns/promises';
import net from 'node:net';

export interface UrlValidationOptions {
  /**
   * Strictly for automated integration tests against a local ephemeral mock server.
   * NEVER enabled by production or development Express routes.
   */
  allowLoopbackForTests?: boolean;
  allowedPorts?: number[];
}

export interface UrlValidationResult {
  valid: boolean;
  normalizedUrl: string;
  hostname: string;
  port: number | null;
  reason?: string;
}

export interface DnsLookupRecord {
  address: string;
  family: number;
}

export type CustomDnsLookupFn = (hostname: string) => Promise<DnsLookupRecord[]>;

const DEFAULT_ALLOWED_PORTS = new Set([80, 443, 8080, 8443]);

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'metadata',
  'metadata.google.internal',
  'metadata.goog',
  'instance-data',
  'kubernetes.default',
  'kubernetes.default.svc',
]);

const BLOCKED_HOSTNAME_SUFFIXES = [
  '.localhost',
  '.local',
  '.internal',
  '.arpa',
  '.home.arpa',
  '.corp',
  '.lan',
  '.intranet',
  '.svc.cluster.local',
];

/**
 * Checks whether a hostname attempts to use non-canonical IPv4 encodings such as:
 * - Pure integer IPv4 (e.g. 2130706433)
 * - Hexadecimal IPv4 or hex octets (e.g. 0x7f000001, 0x7f.0.0.1)
 * - Octal octets (e.g. 0177.0.0.1, 012.0.0.1)
 * - Shorthand <4-part numeric IPv4 (e.g. 127.1, 10.0.1, 192.168.257)
 */
export function hasAlternateNumericIpEncoding(hostname: string): string | null {
  const clean = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!clean) return 'Empty hostname.';

  // Pure decimal integer host (e.g. http://2130706433)
  if (/^\d+$/.test(clean)) {
    return 'Integer-encoded IPv4 hostnames are blocked for SSRF protection.';
  }

  // Hex integer host (e.g. http://0x7f000001)
  if (/^0x[0-9a-f]+$/i.test(clean)) {
    return 'Hexadecimal-encoded IPv4 hostnames are blocked for SSRF protection.';
  }

  const labels = clean.split('.');
  const allNumericOrHexLabels = labels.every(
    (part) => part.length > 0 && (/^\d+$/.test(part) || /^0x[0-9a-f]+$/i.test(part))
  );

  if (allNumericOrHexLabels) {
    if (labels.some((part) => /^0x/i.test(part))) {
      return 'Hexadecimal IPv4 octets are blocked for SSRF protection.';
    }
    if (labels.some((part) => part.length > 1 && part.startsWith('0'))) {
      return 'Octal-prefixed IPv4 octets are blocked for SSRF protection.';
    }
    if (labels.length !== 4) {
      return 'Shorthand multi-part numeric IPv4 addresses are blocked for SSRF protection.';
    }
    for (const part of labels) {
      const val = Number(part);
      if (!Number.isInteger(val) || val < 0 || val > 255) {
        return 'Out-of-range IPv4 octet.';
      }
    }
  }

  return null;
}

function parseCanonicalIpv4ToUint32(ip: string): number | null {
  const match = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return null;
  const octets = match.slice(1).map((x) => Number(x));
  if (octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) {
    return null;
  }
  return (
    ((octets[0] << 24) >>> 0) +
    ((octets[1] << 16) >>> 0) +
    ((octets[2] << 8) >>> 0) +
    octets[3]
  ) >>> 0;
}

function inCidr4(ipUint32: number, baseIp: string, prefixBits: number): boolean {
  const base = parseCanonicalIpv4ToUint32(baseIp);
  if (base === null) return false;
  if (prefixBits === 0) return true;
  const mask = prefixBits === 32 ? 0xffffffff : (~((1 << (32 - prefixBits)) - 1)) >>> 0;
  return (ipUint32 & mask) >>> 0 === (base & mask) >>> 0;
}

export function isLoopbackIp(ip: string): boolean {
  const clean = ip.trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  if (clean === '::1' || clean === '0:0:0:0:0:0:0:1') return true;
  const v4 = parseCanonicalIpv4ToUint32(clean);
  if (v4 !== null) {
    return inCidr4(v4, '127.0.0.0', 8);
  }
  if (clean.startsWith('::ffff:')) {
    const tail = clean.slice('::ffff:'.length);
    const tailV4 = parseCanonicalIpv4ToUint32(tail);
    if (tailV4 !== null) return inCidr4(tailV4, '127.0.0.0', 8);
    if (tail === '7f00:1' || tail.startsWith('7f')) return true;
  }
  return false;
}

/**
 * Expands a valid IPv6 literal into 8 16-bit words for exact CIDR range inspection.
 */
function expandIpv6Words(rawIp: string): number[] | null {
  let ip = rawIp.trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  if (!ip || net.isIPv6(ip) === false) return null;

  // Handle dotted-quad tail in IPv4-mapped / IPv4-compatible IPv6 (e.g. ::ffff:192.168.1.1)
  const lastColon = ip.lastIndexOf(':');
  if (lastColon !== -1 && ip.slice(lastColon + 1).includes('.')) {
    const v4Part = ip.slice(lastColon + 1);
    const v4Uint = parseCanonicalIpv4ToUint32(v4Part);
    if (v4Uint === null) return null;
    const hi = ((v4Uint >>> 16) & 0xffff).toString(16);
    const lo = (v4Uint & 0xffff).toString(16);
    ip = `${ip.slice(0, lastColon)}:${hi}:${lo}`;
  }

  const doubleColonParts = ip.split('::');
  if (doubleColonParts.length > 2) return null;

  const left = doubleColonParts[0] ? doubleColonParts[0].split(':') : [];
  const right =
    doubleColonParts.length === 2 && doubleColonParts[1] ? doubleColonParts[1].split(':') : [];

  const missing = 8 - (left.length + right.length);
  if (doubleColonParts.length === 1 && missing !== 0) return null;
  if (doubleColonParts.length === 2 && missing < 1) return null;

  const fullHex = [
    ...left,
    ...(doubleColonParts.length === 2 ? Array(missing).fill('0') : []),
    ...right,
  ];
  if (fullHex.length !== 8) return null;

  const words: number[] = [];
  for (const group of fullHex) {
    if (!/^[0-9a-f]{1,4}$/i.test(group)) return null;
    words.push(parseInt(group, 16));
  }
  return words;
}

/**
 * Returns a human-readable block reason if an IPv4 or IPv6 address belongs to any
 * loopback, RFC1918 private, CGNAT, link-local, cloud-metadata, documentation,
 * benchmarking, multicast, NAT64-private, or reserved address space.
 */
export function classifyNonPublicIpAddress(
  rawIp: string,
  options?: { allowLoopbackForTests?: boolean }
): string | null {
  const clean = rawIp.trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  if (!clean) return 'Empty IP address.';

  if (options?.allowLoopbackForTests && isLoopbackIp(clean)) {
    return null;
  }

  if (net.isIPv4(clean)) {
    const u32 = parseCanonicalIpv4ToUint32(clean);
    if (u32 === null) return 'Malformed IPv4 address.';

    if (inCidr4(u32, '0.0.0.0', 8)) return 'Unspecified 0.0.0.0/8 network is blocked.';
    if (inCidr4(u32, '10.0.0.0', 8)) return 'Private RFC1918 10.0.0.0/8 network is blocked.';
    if (inCidr4(u32, '100.64.0.0', 10))
      return 'Shared CGNAT / Alibaba metadata 100.64.0.0/10 network is blocked.';
    if (inCidr4(u32, '127.0.0.0', 8)) return 'Loopback 127.0.0.0/8 network is blocked.';
    if (inCidr4(u32, '169.254.0.0', 16))
      return 'Link-local & cloud metadata 169.254.0.0/16 network is blocked.';
    if (inCidr4(u32, '172.16.0.0', 12)) return 'Private RFC1918 172.16.0.0/12 network is blocked.';
    if (inCidr4(u32, '192.0.0.0', 24)) return 'IETF protocol assignment 192.0.0.0/24 is blocked.';
    if (inCidr4(u32, '192.0.2.0', 24)) return 'Documentation TEST-NET-1 192.0.2.0/24 is blocked.';
    if (inCidr4(u32, '192.88.99.0', 24)) return '6to4 relay anycast 192.88.99.0/24 is blocked.';
    if (inCidr4(u32, '192.168.0.0', 16))
      return 'Private RFC1918 192.168.0.0/16 network is blocked.';
    if (inCidr4(u32, '198.18.0.0', 15))
      return 'Benchmarking 198.18.0.0/15 network is blocked.';
    if (inCidr4(u32, '198.51.100.0', 24))
      return 'Documentation TEST-NET-2 198.51.100.0/24 is blocked.';
    if (inCidr4(u32, '203.0.113.0', 24))
      return 'Documentation TEST-NET-3 203.0.113.0/24 is blocked.';
    if (inCidr4(u32, '224.0.0.0', 4)) return 'Multicast 224.0.0.0/4 network is blocked.';
    if (inCidr4(u32, '240.0.0.0', 4)) return 'Reserved 240.0.0.0/4 network is blocked.';

    return null;
  }

  if (net.isIPv6(clean)) {
    const words = expandIpv6Words(clean);
    if (!words) return 'Malformed IPv6 address.';

    const allZeroExceptLast = words.slice(0, 7).every((w) => w === 0);
    if (allZeroExceptLast && words[7] === 0) return 'Unspecified ::/128 IPv6 address is blocked.';
    if (allZeroExceptLast && words[7] === 1) return 'Loopback ::1/128 IPv6 address is blocked.';

    // IPv4-mapped ::ffff:0:0/96 or IPv4-compatible ::/96
    const isIpv4Mapped =
      words.slice(0, 5).every((w) => w === 0) && (words[5] === 0xffff || words[5] === 0x0000);
    // NAT64 well-known prefix 64:ff9b::/96
    const isNat64 =
      words[0] === 0x0064 &&
      words[1] === 0xff9b &&
      words[2] === 0 &&
      words[3] === 0 &&
      words[4] === 0 &&
      words[5] === 0;

    if (isIpv4Mapped || isNat64) {
      const a = (words[6] >>> 8) & 0xff;
      const b = words[6] & 0xff;
      const c = (words[7] >>> 8) & 0xff;
      const d = words[7] & 0xff;
      const embeddedV4 = `${a}.${b}.${c}.${d}`;
      const embeddedCheck = classifyNonPublicIpAddress(embeddedV4, options);
      if (embeddedCheck) {
        return `Embedded IPv4 in IPv6 (${embeddedV4}) blocked: ${embeddedCheck}`;
      }
      return null;
    }

    // Discard-only 100::/64
    if (words[0] === 0x0100 && words[1] === 0 && words[2] === 0 && words[3] === 0) {
      return 'Discard-only 100::/64 IPv6 prefix is blocked.';
    }

    // Documentation 2001:db8::/32
    if (words[0] === 0x2001 && words[1] === 0x0db8) {
      return 'Documentation 2001:db8::/32 IPv6 prefix is blocked.';
    }

    // AWS EC2 IPv6 metadata fd00:ec2::254 & Unique Local fc00::/7
    if ((words[0] & 0xfe00) === 0xfc00) {
      return 'Unique-local fc00::/7 IPv6 network is blocked.';
    }

    // Link-local fe80::/10
    if ((words[0] & 0xffc0) === 0xfe80) {
      return 'Link-local fe80::/10 IPv6 network is blocked.';
    }

    // Multicast ff00::/8
    if ((words[0] & 0xff00) === 0xff00) {
      return 'Multicast ff00::/8 IPv6 network is blocked.';
    }

    return null;
  }

  return 'Unrecognized IP literal format.';
}

/**
 * Synchronous URL syntax, scheme, port, hostname, and alternate-IP literal validator.
 */
export function validatePublicOptOutUrlSyntax(
  rawUrl: string,
  options?: UrlValidationOptions
): UrlValidationResult {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) {
    return { valid: false, normalizedUrl: '', hostname: '', port: null, reason: 'URL cannot be empty.' };
  }

  if (/^(javascript|data|file|ftp|blob|ws|wss|gopher|dict|ldap|mailto|tel|about|chrome):/i.test(trimmed)) {
    return {
      valid: false,
      normalizedUrl: '',
      hostname: '',
      port: null,
      reason: 'Only http:// and https:// URLs are permitted.',
    };
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    return {
      valid: false,
      normalizedUrl: '',
      hostname: '',
      port: null,
      reason: 'Malformed URL syntax.',
    };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      valid: false,
      normalizedUrl: '',
      hostname: '',
      port: null,
      reason: 'Only http:// and https:// URLs are permitted.',
    };
  }

  if (parsed.username || parsed.password) {
    return {
      valid: false,
      normalizedUrl: '',
      hostname: '',
      port: null,
      reason: 'Embedded credentials in URLs are prohibited.',
    };
  }

  const rawHost = parsed.hostname.toLowerCase().replace(/\.$/, '');
  const unbracketedHost = rawHost.replace(/^\[|\]$/g, '');

  if (!unbracketedHost) {
    return {
      valid: false,
      normalizedUrl: '',
      hostname: '',
      port: null,
      reason: 'URL hostname is missing.',
    };
  }

  const explicitPort = parsed.port ? parseInt(parsed.port, 10) : null;
  if (explicitPort !== null) {
    if (!Number.isInteger(explicitPort) || explicitPort < 1 || explicitPort > 65535) {
      return {
        valid: false,
        normalizedUrl: '',
        hostname: unbracketedHost,
        port: explicitPort,
        reason: 'Invalid TCP port in URL.',
      };
    }
    const allowedSet = options?.allowedPorts
      ? new Set(options.allowedPorts)
      : DEFAULT_ALLOWED_PORTS;
    if (!options?.allowLoopbackForTests && !allowedSet.has(explicitPort)) {
      return {
        valid: false,
        normalizedUrl: '',
        hostname: unbracketedHost,
        port: explicitPort,
        reason: `Port ${explicitPort} is blocked for outbound privacy requests.`,
      };
    }
  }

  // Test-only loopback exception strictly for local mock broker test fixtures
  if (
    options?.allowLoopbackForTests &&
    (unbracketedHost === '127.0.0.1' || unbracketedHost === 'localhost' || unbracketedHost === '::1')
  ) {
    parsed.hash = '';
    return {
      valid: true,
      normalizedUrl: parsed.toString(),
      hostname: unbracketedHost,
      port: explicitPort,
    };
  }

  // Block alternate IPv4 encodings (decimal integer, hex, octal, shorthand)
  const altIpError = hasAlternateNumericIpEncoding(unbracketedHost);
  if (altIpError) {
    return {
      valid: false,
      normalizedUrl: '',
      hostname: unbracketedHost,
      port: explicitPort,
      reason: altIpError,
    };
  }

  if (
    BLOCKED_HOSTNAMES.has(unbracketedHost) ||
    BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => unbracketedHost.endsWith(suffix))
  ) {
    return {
      valid: false,
      normalizedUrl: '',
      hostname: unbracketedHost,
      port: explicitPort,
      reason: 'Local, internal, or cloud-metadata hostnames are blocked.',
    };
  }

  // Check IPv6 literal
  if (unbracketedHost.includes(':')) {
    const ipReason = classifyNonPublicIpAddress(unbracketedHost, options);
    if (ipReason) {
      return {
        valid: false,
        normalizedUrl: '',
        hostname: unbracketedHost,
        port: explicitPort,
        reason: ipReason,
      };
    }
    parsed.hash = '';
    return {
      valid: true,
      normalizedUrl: parsed.toString(),
      hostname: unbracketedHost,
      port: explicitPort,
    };
  }

  // Check IPv4 literal
  if (net.isIPv4(unbracketedHost)) {
    const ipReason = classifyNonPublicIpAddress(unbracketedHost, options);
    if (ipReason) {
      return {
        valid: false,
        normalizedUrl: '',
        hostname: unbracketedHost,
        port: explicitPort,
        reason: ipReason,
      };
    }
    parsed.hash = '';
    return {
      valid: true,
      normalizedUrl: parsed.toString(),
      hostname: unbracketedHost,
      port: explicitPort,
    };
  }

  // Require a multi-label DNS domain
  if (!unbracketedHost.includes('.')) {
    return {
      valid: false,
      normalizedUrl: '',
      hostname: unbracketedHost,
      port: explicitPort,
      reason: 'Unqualified single-label hostnames are blocked.',
    };
  }

  parsed.hash = '';
  return {
    valid: true,
    normalizedUrl: parsed.toString(),
    hostname: unbracketedHost,
    port: explicitPort,
  };
}

/**
 * Validates URL syntax AND resolves all DNS A/AAAA records to prevent DNS-rebinding SSRF.
 */
export async function assertSafeOutboundUrl(
  rawUrl: string,
  options?: UrlValidationOptions & { dnsLookup?: CustomDnsLookupFn }
): Promise<UrlValidationResult & { resolvedAddresses: string[] }> {
  const syntax = validatePublicOptOutUrlSyntax(rawUrl, options);
  if (!syntax.valid) {
    throw new Error(syntax.reason || 'Blocked unsafe outbound URL.');
  }

  const host = syntax.hostname;

  if (
    options?.allowLoopbackForTests &&
    (host === '127.0.0.1' || host === 'localhost' || host === '::1')
  ) {
    return { ...syntax, resolvedAddresses: ['127.0.0.1'] };
  }

  // Direct IP literal already validated above
  if (net.isIP(host) !== 0) {
    const ipBlock = classifyNonPublicIpAddress(host, options);
    if (ipBlock) {
      throw new Error(ipBlock);
    }
    return { ...syntax, resolvedAddresses: [host] };
  }

  const lookupFn: CustomDnsLookupFn =
    options?.dnsLookup ||
    ((h: string) => dns.lookup(h, { all: true, verbatim: true }));

  let records: DnsLookupRecord[];
  try {
    records = await lookupFn(host);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (/Blocked/i.test(msg)) throw err;
    throw new Error(`Could not resolve public DNS for ${host}.`);
  }

  if (!records || records.length === 0) {
    throw new Error(`Hostname ${host} did not resolve to any public IP address.`);
  }

  const resolvedAddresses: string[] = [];
  for (const rec of records) {
    const ipBlock = classifyNonPublicIpAddress(rec.address, options);
    if (ipBlock) {
      throw new Error(`Blocked private or non-public DNS resolution for ${host}: ${ipBlock}`);
    }
    resolvedAddresses.push(rec.address);
  }

  return {
    ...syntax,
    resolvedAddresses,
  };
}

/**
 * Redacts personal identifiers, passwords, and bearer tokens before emitting diagnostic text.
 */
export function redactPiiForLogs(input: string): string {
  if (!input) return '';
  return input
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED_TOKEN]')
    .replace(/\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g, '[REDACTED_SSN]')
    .replace(/\b([a-zA-Z0-9._%+-])[a-zA-Z0-9._%+-]*@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g, '$1***@$2')
    .replace(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '***-***-REDACTED');
}

export function maskFieldValuePreview(role: string, rawValue: string): string {
  const val = (rawValue || '').trim();
  if (!val) return '(empty)';
  if (role === 'csrf_or_hidden') return `[preserved token: ${val.length} chars]`;
  if (role === 'state' || role === 'request_type' || role === 'statute' || role === 'consent_checkbox' || role === 'authorized_agent') {
    return val.slice(0, 60);
  }
  if (role === 'email' || role === 'confirm_email') {
    const at = val.indexOf('@');
    if (at > 0) return `${val[0]}***${val.slice(at)}`;
  }
  if (role === 'phone') {
    const digits = val.replace(/\D/g, '');
    return digits.length >= 4 ? `***-***-${digits.slice(-4)}` : '***';
  }
  if (val.length <= 2) return '*'.repeat(val.length);
  return `${val.slice(0, 1)}***${val.slice(-1)} (${val.length} chars)`;
}
