import dns from 'node:dns/promises';
import { isSyntheticDomain } from '../utils/scanEngine.ts';

export interface MxRecordEntry {
  exchange: string;
  priority: number;
}

export interface DnsLookupAdapter {
  resolveMx: (hostname: string) => Promise<MxRecordEntry[]>;
  resolve4: (hostname: string) => Promise<string[]>;
}

export interface DomainDeliverabilityCheck {
  email: string;
  domain: string;
  mxValid: boolean;
  mxHosts: string[];
  reason?: string;
}

export interface MultiCandidateDeliverabilityResult {
  valid: boolean;
  mxVerified: boolean;
  originalEmail: string;
  recommendedEmail: string | null;
  usedFallback: boolean;
  mxHosts: string[];
  reason?: string;
  candidateResults: DomainDeliverabilityCheck[];
}

const defaultDnsAdapter: DnsLookupAdapter = {
  resolveMx: (hostname: string) => dns.resolveMx(hostname),
  resolve4: (hostname: string) => dns.resolve4(hostname),
};

interface CachedDomainEntry {
  mxValid: boolean;
  mxHosts: string[];
  reason?: string;
  expiresAt: number;
}

const domainMxCache = new Map<string, CachedDomainEntry>();
const DNS_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const DNS_LOOKUP_TIMEOUT_MS = 3500;

export function clearDnsMxCache(): void {
  domainMxCache.clear();
}

function isBasicValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim();
  if (trimmed.length > 254) return false;
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(trimmed);
}

function extractSafeDomain(email: string): { ok: boolean; domain: string; reason?: string } {
  if (!isBasicValidEmail(email)) {
    return { ok: false, domain: '', reason: 'Invalid email address syntax.' };
  }
  const atIndex = email.lastIndexOf('@');
  const domain = email.slice(atIndex + 1).trim().toLowerCase();

  if (!domain || domain.length > 253 || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
    return { ok: false, domain, reason: 'Invalid recipient domain name.' };
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(domain)) {
    return { ok: false, domain, reason: 'Direct IP-literal email recipients are blocked.' };
  }
  if (
    domain === 'localhost' ||
    domain.endsWith('.local') ||
    domain.endsWith('.internal') ||
    domain.endsWith('.invalid') ||
    domain.endsWith('.example') ||
    domain.endsWith('.test') ||
    domain.endsWith('.onion')
  ) {
    return {
      ok: false,
      domain,
      reason: `Reserved or non-routable domain (${domain}) cannot accept internet email.`,
    };
  }
  if (isSyntheticDomain(domain)) {
    return {
      ok: false,
      domain,
      reason: `Template/synthetic domain (${domain}) has no real compliance mail server.`,
    };
  }

  return { ok: true, domain };
}

function withDnsTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('DNS_TIMEOUT'));
    }, timeoutMs);
    timer.unref?.();

    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

export async function checkEmailDomainDeliverability(
  email: string,
  adapter: DnsLookupAdapter = defaultDnsAdapter
): Promise<DomainDeliverabilityCheck> {
  const cleanEmail = (email || '').trim().toLowerCase();
  const parsed = extractSafeDomain(cleanEmail);
  if (!parsed.ok) {
    return {
      email: cleanEmail,
      domain: parsed.domain,
      mxValid: false,
      mxHosts: [],
      reason: parsed.reason,
    };
  }

  const { domain } = parsed;
  const useCache = adapter === defaultDnsAdapter;
  const now = Date.now();

  if (useCache) {
    const cached = domainMxCache.get(domain);
    if (cached && cached.expiresAt > now) {
      return {
        email: cleanEmail,
        domain,
        mxValid: cached.mxValid,
        mxHosts: cached.mxHosts,
        reason: cached.reason,
      };
    }
  }

  try {
    const mxRecords = await withDnsTimeout(adapter.resolveMx(domain), DNS_LOOKUP_TIMEOUT_MS);

    // RFC 7505 Null MX check: `0 .` explicitly declares domain accepts zero inbound mail
    const nonEmptyMx = (mxRecords || [])
      .filter((r) => r && typeof r.exchange === 'string' && r.exchange.trim() !== '' && r.exchange.trim() !== '.')
      .sort((a, b) => a.priority - b.priority);

    if (nonEmptyMx.length === 0) {
      const result: DomainDeliverabilityCheck = {
        email: cleanEmail,
        domain,
        mxValid: false,
        mxHosts: [],
        reason: `Domain ${domain} publishes a Null MX record (RFC 7505) and rejects all inbound email.`,
      };
      if (useCache) {
        domainMxCache.set(domain, {
          mxValid: false,
          mxHosts: [],
          reason: result.reason,
          expiresAt: now + DNS_CACHE_TTL_MS,
        });
      }
      return result;
    }

    const mxHosts = nonEmptyMx.map((r) => r.exchange.replace(/\.$/, '').toLowerCase());
    if (useCache) {
      domainMxCache.set(domain, {
        mxValid: true,
        mxHosts,
        expiresAt: now + DNS_CACHE_TTL_MS,
      });
    }
    return {
      email: cleanEmail,
      domain,
      mxValid: true,
      mxHosts,
    };
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code || '';
    const msg = err instanceof Error ? err.message : '';

    // RFC 5321 Section 5.1: If no MX RR exists (ENODATA), check if host A record exists
    if (code === 'ENODATA') {
      try {
        const ipv4 = await withDnsTimeout(adapter.resolve4(domain), DNS_LOOKUP_TIMEOUT_MS);
        if (Array.isArray(ipv4) && ipv4.length > 0) {
          const reason = `No explicit MX record on ${domain}; using implicit A-record host fallback.`;
          if (useCache) {
            domainMxCache.set(domain, {
              mxValid: true,
              mxHosts: [domain],
              reason,
              expiresAt: now + DNS_CACHE_TTL_MS,
            });
          }
          return {
            email: cleanEmail,
            domain,
            mxValid: true,
            mxHosts: [domain],
            reason,
          };
        }
      } catch {
        // Fall through to unresolvable
      }
    }

    const friendlyReason =
      code === 'ENOTFOUND'
        ? `Domain ${domain} does not exist in DNS (NXDOMAIN).`
        : msg === 'DNS_TIMEOUT'
        ? `DNS MX lookup timed out for ${domain}.`
        : `Domain ${domain} has no active mail exchanger (${code || 'NO_MX'}).`;

    if (useCache && msg !== 'DNS_TIMEOUT') {
      domainMxCache.set(domain, {
        mxValid: false,
        mxHosts: [],
        reason: friendlyReason,
        expiresAt: now + DNS_CACHE_TTL_MS,
      });
    }

    return {
      email: cleanEmail,
      domain,
      mxValid: false,
      mxHosts: [],
      reason: friendlyReason,
    };
  }
}

export async function verifyRecipientCandidatesDns(
  primaryEmail: string,
  fallbackEmails: string[] = [],
  adapter: DnsLookupAdapter = defaultDnsAdapter
): Promise<MultiCandidateDeliverabilityResult> {
  const cleanPrimary = (primaryEmail || '').trim().toLowerCase();
  const candidates: string[] = [];
  const seen = new Set<string>();

  for (const raw of [cleanPrimary, ...(fallbackEmails || [])]) {
    const trimmed = (raw || '').trim().toLowerCase();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      candidates.push(trimmed);
    }
    if (candidates.length >= 6) break;
  }

  if (candidates.length === 0) {
    return {
      valid: false,
      mxVerified: false,
      originalEmail: cleanPrimary,
      recommendedEmail: null,
      usedFallback: false,
      mxHosts: [],
      reason: 'No recipient email address provided.',
      candidateResults: [],
    };
  }

  const candidateResults = await Promise.all(
    candidates.map((addr) => checkEmailDomainDeliverability(addr, adapter))
  );

  const winner = candidateResults.find((c) => c.mxValid);
  if (!winner) {
    return {
      valid: false,
      mxVerified: false,
      originalEmail: cleanPrimary,
      recommendedEmail: null,
      usedFallback: false,
      mxHosts: [],
      reason:
        candidateResults[0]?.reason ||
        'Neither primary nor fallback broker compliance domains publish valid MX mail servers.',
      candidateResults,
    };
  }

  const usedFallback = winner.email.toLowerCase() !== cleanPrimary;

  return {
    valid: true,
    mxVerified: true,
    originalEmail: cleanPrimary,
    recommendedEmail: winner.email,
    usedFallback,
    mxHosts: winner.mxHosts,
    reason: usedFallback
      ? `Primary address (${cleanPrimary}) failed DNS MX validation; automatically routed to verified compliance desk (${winner.email}).`
      : winner.reason,
    candidateResults,
  };
}

export function isRecipientRejectionSmtpError(err: unknown): boolean {
  const raw = err instanceof Error ? err.message : String(err || '');
  return /\b(?:550|551|552|553|554|5\.1\.1|5\.1\.2|5\.1\.10|5\.4\.4|5\.7\.1)\b|user\s+unknown|address\s+rejected|recipient\s+rejected|no\s+such\s+user|does\s+not\s+exist|mailbox\s+unavailable|invalid\s+recipient/i.test(
    raw
  );
}
