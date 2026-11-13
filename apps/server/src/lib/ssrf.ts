import dns from 'node:dns/promises';
import net from 'node:net';
import type { SsrfPolicy } from '../db/index.js';

export class SsrfValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsrfValidationError';
  }
}

function normalizeHost(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, '').toLowerCase();
}

function ipToNumber(ip: string): number {
  const parts = ip.split('.').map(Number);
  return (
    (((parts[0] ?? 0) << 24) |
      ((parts[1] ?? 0) << 16) |
      ((parts[2] ?? 0) << 8) |
      (parts[3] ?? 0)) >>>
    0
  );
}

function isIpv4InCidr(ip: string, cidr: string): boolean {
  const [range, bitsStr] = cidr.split('/');
  if (!range || !net.isIPv4(ip) || !net.isIPv4(range)) return false;
  const bits = Number(bitsStr ?? 32);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipToNumber(ip) & mask) === (ipToNumber(range) & mask);
}

function isMetadataIp(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (net.isIPv4(lower)) {
    return (
      isIpv4InCidr(lower, '169.254.0.0/16') ||
      lower === '0.0.0.0'
    );
  }
  if (net.isIPv6(lower)) {
    return lower === '::' || lower.startsWith('fe80:');
  }
  return false;
}

function isPrivateOrLoopbackIp(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (net.isIPv4(lower)) {
    return (
      isIpv4InCidr(lower, '127.0.0.0/8') ||
      isIpv4InCidr(lower, '10.0.0.0/8') ||
      isIpv4InCidr(lower, '172.16.0.0/12') ||
      isIpv4InCidr(lower, '192.168.0.0/16') ||
      isIpv4InCidr(lower, '100.64.0.0/10') ||
      isIpv4InCidr(lower, '169.254.0.0/16') ||
      lower === '0.0.0.0'
    );
  }
  if (net.isIPv6(lower)) {
    if (lower === '::1' || lower === '::') return true;
    if (lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80:')) {
      return true;
    }
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped?.[1]) {
      return isPrivateOrLoopbackIp(mapped[1]);
    }
  }
  return false;
}

function matchesRule(host: string, resolvedIps: string[], ruleRaw: string): boolean {
  const rule = ruleRaw.trim().toLowerCase();
  if (!rule) return false;

  if (rule.includes('/')) {
    return resolvedIps.some((ip) => isIpv4InCidr(ip, rule));
  }
  if (rule.startsWith('*.')) {
    const suffix = rule.slice(1);
    return host.endsWith(suffix) && host.length > suffix.length;
  }
  return host === rule || resolvedIps.includes(rule);
}

export async function validateConnectionUrl(
  rawUrl: string,
  policy: SsrfPolicy,
  options: { skipDns?: boolean } = {}
): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new SsrfValidationError('Invalid URL format');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SsrfValidationError('Only http:// and https:// connection URLs are allowed');
  }

  if (parsed.username || parsed.password) {
    throw new SsrfValidationError('Connection URL must not include embedded credentials');
  }

  const host = normalizeHost(parsed.hostname);
  if (!host) {
    throw new SsrfValidationError('Connection URL must include a hostname');
  }

  let resolvedIps: string[] = [];
  if (net.isIP(host)) {
    resolvedIps = [host];
  } else if (!options.skipDns) {
    try {
      const records = await dns.lookup(host, { all: true });
      resolvedIps = records.map((r) => r.address);
    } catch {
      // Allow DNS failures to be surfaced as connection test errors unless hostname is in denylist
      resolvedIps = [];
    }
  }

  if (policy.denylist.some((rule) => matchesRule(host, resolvedIps, rule))) {
    throw new SsrfValidationError(`Host "${host}" is blocked by the SSRF denylist`);
  }

  const isExplicitlyAllowed = policy.allowlist.some((rule) =>
    matchesRule(host, resolvedIps, rule)
  );
  if (isExplicitlyAllowed) {
    return parsed;
  }

  if (resolvedIps.some((ip) => isMetadataIp(ip))) {
    throw new SsrfValidationError('Link-local / cloud metadata addresses are blocked');
  }

  if (!policy.allowPrivateNetworks) {
    if (host === 'localhost' || host.endsWith('.localhost')) {
      throw new SsrfValidationError('Private/loopback hosts are blocked by SSRF policy');
    }
    if (resolvedIps.some((ip) => isPrivateOrLoopbackIp(ip))) {
      throw new SsrfValidationError('Private network IP addresses are blocked by SSRF policy');
    }
  }

  return parsed;
}
