import { useSyncExternalStore } from 'react';
import { DataBroker, EmailDeliverabilityTier } from '../types';

export interface BrokerContactOverride {
  customEmail?: string;
  ccEmails?: string[];
  bouncedEmails?: string[];
  note?: string;
  updatedAtIso: string;
}

export interface ResolvedBrokerContactProfile {
  brokerId: string;
  effectivePrimaryEmail: string;
  defaultCatalogEmail: string;
  fallbackEmails: string[];
  allValidCandidates: string[];
  recommendedCcEmails: string[];
  bouncedEmails: string[];
  hasCustomOverride: boolean;
  reroutedFromBounced: boolean;
  parentEntity?: string;
  deliverabilityTier: EmailDeliverabilityTier;
  deliverabilityLabel: string;
  requiresPortalWarning: boolean;
  optOutUrl: string;
}

export interface CandidateMxCheckResult {
  email: string;
  domain: string;
  mxValid: boolean;
  mxHosts: string[];
  reason?: string;
}

export interface RecipientDeliverabilityVerification {
  valid: boolean;
  mxVerified: boolean;
  originalEmail: string;
  recommendedEmail: string | null;
  usedFallback: boolean;
  mxHosts: string[];
  reason?: string;
  candidateResults: CandidateMxCheckResult[];
}

const CONTACT_OVERRIDES_STORAGE_KEY = 'synout_broker_contact_overrides_v1';

export function isValidEmailSyntax(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim();
  if (trimmed.length > 254) return false;
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(trimmed);
}

export function loadBrokerContactOverrides(): Record<string, BrokerContactOverride> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(CONTACT_OVERRIDES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function persistOverridesToStorage(map: Record<string, BrokerContactOverride>): void {
  if (typeof window === 'undefined') return;
  try {
    if (Object.keys(map).length === 0) {
      window.localStorage.removeItem(CONTACT_OVERRIDES_STORAGE_KEY);
    } else {
      window.localStorage.setItem(CONTACT_OVERRIDES_STORAGE_KEY, JSON.stringify(map));
    }
  } catch {
    // Ignore storage quota errors in restricted environments
  }
}

let overridesState: Record<string, BrokerContactOverride> = loadBrokerContactOverrides();
const listeners = new Set<() => void>();

function emitOverridesChange(): void {
  listeners.forEach((fn) => fn());
}

export function getBrokerContactOverrides(): Record<string, BrokerContactOverride> {
  return overridesState;
}

export function subscribeBrokerContactOverrides(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useBrokerContactOverrides(): Record<string, BrokerContactOverride> {
  return useSyncExternalStore(
    subscribeBrokerContactOverrides,
    getBrokerContactOverrides,
    getBrokerContactOverrides
  );
}

export function setBrokerCustomEmail(
  brokerId: string,
  customEmail: string,
  ccEmails?: string[],
  note?: string
): void {
  const cleanPrimary = customEmail.trim().toLowerCase();
  if (!brokerId || !isValidEmailSyntax(cleanPrimary)) {
    throw new Error('Enter a valid compliance email address (e.g. privacy@domain.com).');
  }

  const existing = overridesState[brokerId];
  const updatedBounced = (existing?.bouncedEmails || []).filter(
    (b) => b.toLowerCase() !== cleanPrimary
  );
  const cleanCc = (ccEmails ?? existing?.ccEmails ?? [])
    .map((c) => c.trim().toLowerCase())
    .filter((c) => isValidEmailSyntax(c) && c !== cleanPrimary);

  overridesState = {
    ...overridesState,
    [brokerId]: {
      ...existing,
      customEmail: cleanPrimary,
      ccEmails: Array.from(new Set(cleanCc)),
      bouncedEmails: updatedBounced,
      note: note ?? existing?.note,
      updatedAtIso: new Date().toISOString(),
    },
  };
  persistOverridesToStorage(overridesState);
  emitOverridesChange();
}

export function markBrokerEmailBounced(brokerId: string, bouncedEmail: string): void {
  const cleanBounced = bouncedEmail.trim().toLowerCase();
  if (!brokerId || !cleanBounced) return;

  const existing = overridesState[brokerId];
  const bouncedSet = new Set((existing?.bouncedEmails || []).map((e) => e.toLowerCase()));
  bouncedSet.add(cleanBounced);

  const nextCustom =
    existing?.customEmail && existing.customEmail.toLowerCase() === cleanBounced
      ? undefined
      : existing?.customEmail;

  overridesState = {
    ...overridesState,
    [brokerId]: {
      ...existing,
      customEmail: nextCustom,
      bouncedEmails: Array.from(bouncedSet),
      updatedAtIso: new Date().toISOString(),
    },
  };
  persistOverridesToStorage(overridesState);
  emitOverridesChange();
}

export function resetBrokerContactOverride(brokerId: string): void {
  if (!brokerId || !overridesState[brokerId]) return;
  const copy = { ...overridesState };
  delete copy[brokerId];
  overridesState = copy;
  persistOverridesToStorage(overridesState);
  emitOverridesChange();
}

export function restoreBrokerContactOverrides(
  incoming: Record<string, BrokerContactOverride> | undefined
): void {
  overridesState = incoming && typeof incoming === 'object' ? { ...incoming } : {};
  persistOverridesToStorage(overridesState);
  emitOverridesChange();
}

export function clearBrokerContactOverrides(): void {
  overridesState = {};
  persistOverridesToStorage({});
  emitOverridesChange();
}

/**
 * Resolves the highest-confidence, bounce-mitigated compliance email profile for a broker,
 * honoring user custom overrides, bounced-address exclusions, and parent-entity DPO desks.
 */
export function resolveBrokerContactProfile(
  broker: DataBroker,
  overridesSnapshot?: Record<string, BrokerContactOverride>
): ResolvedBrokerContactProfile {
  const map = overridesSnapshot ?? overridesState;
  const override = map[broker.id];
  const bouncedEmails = (override?.bouncedEmails || []).map((e) => e.trim().toLowerCase());
  const bouncedSet = new Set(bouncedEmails);

  const rawPool: string[] = [];
  if (override?.customEmail && isValidEmailSyntax(override.customEmail)) {
    rawPool.push(override.customEmail.trim().toLowerCase());
  }
  if (broker.privacyEmail && isValidEmailSyntax(broker.privacyEmail)) {
    rawPool.push(broker.privacyEmail.trim().toLowerCase());
  }
  for (const fb of broker.fallbackEmails || []) {
    if (isValidEmailSyntax(fb)) {
      rawPool.push(fb.trim().toLowerCase());
    }
  }

  // Deduplicate while preserving priority order
  const uniquePool: string[] = [];
  const seen = new Set<string>();
  for (const addr of rawPool) {
    if (!seen.has(addr)) {
      seen.add(addr);
      uniquePool.push(addr);
    }
  }

  // Filter out addresses known to have bounced
  const nonBouncedPool = uniquePool.filter((addr) => !bouncedSet.has(addr));
  const effectiveCandidates = nonBouncedPool.length > 0 ? nonBouncedPool : uniquePool;

  const effectivePrimaryEmail = effectiveCandidates[0] || broker.privacyEmail || '';
  const fallbackEmails = effectiveCandidates.slice(1);

  const hasCustomOverride = Boolean(
    override?.customEmail &&
      !bouncedSet.has(override.customEmail.toLowerCase()) &&
      effectivePrimaryEmail.toLowerCase() === override.customEmail.toLowerCase()
  );

  const defaultCatalogLower = (broker.privacyEmail || '').trim().toLowerCase();
  const reroutedFromBounced = Boolean(
    !hasCustomOverride &&
      defaultCatalogLower &&
      bouncedSet.has(defaultCatalogLower) &&
      effectivePrimaryEmail.toLowerCase() !== defaultCatalogLower
  );

  const explicitCc = (override?.ccEmails || []).filter(
    (c) => isValidEmailSyntax(c) && !bouncedSet.has(c.toLowerCase()) && c.toLowerCase() !== effectivePrimaryEmail
  );
  const recommendedCcEmails =
    explicitCc.length > 0 ? explicitCc : fallbackEmails.slice(0, 1);

  const deliverabilityTier: EmailDeliverabilityTier =
    broker.emailDeliverability || 'verified_dpo';

  let deliverabilityLabel = 'Verified Compliance Desk';
  if (hasCustomOverride) {
    deliverabilityLabel = 'Custom DPO Override';
  } else if (reroutedFromBounced) {
    deliverabilityLabel = 'Auto-Rerouted Backup DPO';
  } else if (deliverabilityTier === 'parent_dpo') {
    deliverabilityLabel = broker.parentEntity
      ? `Parent DPO · ${broker.parentEntity}`
      : 'Parent Network DPO';
  } else if (deliverabilityTier === 'portal_primary') {
    deliverabilityLabel = 'Web-Portal Primary · Hybrid';
  }

  return {
    brokerId: broker.id,
    effectivePrimaryEmail,
    defaultCatalogEmail: broker.privacyEmail,
    fallbackEmails,
    allValidCandidates: effectiveCandidates,
    recommendedCcEmails,
    bouncedEmails,
    hasCustomOverride,
    reroutedFromBounced,
    parentEntity: broker.parentEntity,
    deliverabilityTier,
    deliverabilityLabel,
    requiresPortalWarning: deliverabilityTier === 'portal_primary',
    optOutUrl: broker.optOutUrl,
  };
}

// Client-side session cache for DNS MX verification results (avoids duplicate lookups)
const clientMxCache = new Map<string, RecipientDeliverabilityVerification>();

export function clearClientMxCache(): void {
  clientMxCache.clear();
}

interface DohAnswerRecord {
  name?: string;
  type?: number;
  data?: string;
}

interface DohJsonResponse {
  Status?: number;
  Answer?: DohAnswerRecord[];
}

async function checkDomainMxViaDoh(domain: string): Promise<{
  mxValid: boolean;
  mxHosts: string[];
  reason?: string;
}> {
  const cleanDomain = domain.trim().toLowerCase();
  const mxRes = await fetch(
    `https://dns.google/resolve?name=${encodeURIComponent(cleanDomain)}&type=MX`
  );
  if (!mxRes.ok) {
    throw new Error('DoH query failed.');
  }
  const mxJson = (await mxRes.json()) as DohJsonResponse;

  // DNS RCODE 3 === NXDOMAIN
  if (mxJson.Status === 3) {
    return {
      mxValid: false,
      mxHosts: [],
      reason: `Domain "${cleanDomain}" does not exist in public DNS (NXDOMAIN).`,
    };
  }

  const mxAnswers = (mxJson.Answer || []).filter((a) => a.type === 15 && typeof a.data === 'string');
  if (mxAnswers.length > 0) {
    const parsedHosts: string[] = [];
    for (const ans of mxAnswers) {
      const parts = (ans.data || '').trim().split(/\s+/);
      const exchange = (parts[parts.length - 1] || '').replace(/\.$/, '').toLowerCase();
      // RFC 7505 Null MX ("0 .") explicitly rejects all incoming email
      if (!exchange || exchange === '.') {
        return {
          mxValid: false,
          mxHosts: [],
          reason: `Domain "${cleanDomain}" publishes an RFC 7505 Null MX record and rejects all incoming email.`,
        };
      }
      parsedHosts.push(exchange);
    }
    if (parsedHosts.length > 0) {
      return { mxValid: true, mxHosts: parsedHosts };
    }
  }

  // RFC 5321 Section 5.1 implicit A-record fallback if no MX records exist
  const aRes = await fetch(
    `https://dns.google/resolve?name=${encodeURIComponent(cleanDomain)}&type=A`
  );
  if (aRes.ok) {
    const aJson = (await aRes.json()) as DohJsonResponse;
    const aAnswers = (aJson.Answer || []).filter((a) => a.type === 1 && a.data);
    if (aAnswers.length > 0) {
      return {
        mxValid: true,
        mxHosts: [cleanDomain],
      };
    }
  }

  return {
    mxValid: false,
    mxHosts: [],
    reason: `Domain "${cleanDomain}" has no active DNS Mail Exchange (MX) server.`,
  };
}

async function verifyCandidatesViaDohFallback(
  cleanPrimary: string,
  cleanFallbacks: string[]
): Promise<RecipientDeliverabilityVerification> {
  const allCandidates = [cleanPrimary, ...cleanFallbacks];
  const candidateResults: RecipientDeliverabilityVerification['candidateResults'] = [];

  for (const candidate of allCandidates) {
    const atIdx = candidate.lastIndexOf('@');
    const domain = atIdx !== -1 ? candidate.slice(atIdx + 1) : '';
    if (!domain || !isValidEmailSyntax(candidate)) {
      candidateResults.push({
        email: candidate,
        domain,
        mxValid: false,
        mxHosts: [],
        reason: 'Invalid email address syntax.',
      });
      continue;
    }

    const doh = await checkDomainMxViaDoh(domain);
    candidateResults.push({
      email: candidate,
      domain,
      mxValid: doh.mxValid,
      mxHosts: doh.mxHosts,
      reason: doh.reason,
    });
  }

  const firstValid = candidateResults.find((c) => c.mxValid);
  if (firstValid) {
    const usedFallback = firstValid.email.toLowerCase() !== cleanPrimary.toLowerCase();
    return {
      valid: true,
      mxVerified: true,
      originalEmail: cleanPrimary,
      recommendedEmail: firstValid.email,
      usedFallback,
      mxHosts: firstValid.mxHosts,
      reason: usedFallback
        ? `Primary address (${cleanPrimary}) failed DNS MX check; automatically rerouted to verified DPO (${firstValid.email}).`
        : undefined,
      candidateResults,
    };
  }

  return {
    valid: false,
    mxVerified: false,
    originalEmail: cleanPrimary,
    recommendedEmail: null,
    usedFallback: false,
    mxHosts: [],
    reason:
      candidateResults[0]?.reason ||
      `No active mail exchange (MX) server found for ${cleanPrimary}.`,
    candidateResults,
  };
}

export async function verifyRecipientDeliverabilityClient(
  recipientEmail: string,
  fallbackEmails: string[] = []
): Promise<RecipientDeliverabilityVerification> {
  const cleanPrimary = recipientEmail.trim().toLowerCase();
  const cleanFallbacks = fallbackEmails
    .map((e) => e.trim().toLowerCase())
    .filter((e) => isValidEmailSyntax(e) && e !== cleanPrimary);

  const cacheKey = [cleanPrimary, ...cleanFallbacks].join('|');
  const cached = clientMxCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const res = await fetch('/api/email/verify-recipient', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipientEmail: cleanPrimary,
        fallbackEmails: cleanFallbacks,
      }),
    });

    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      const result: RecipientDeliverabilityVerification = {
        valid: Boolean(data.valid),
        mxVerified: Boolean(data.mxVerified),
        originalEmail: String(data.originalEmail || cleanPrimary),
        recommendedEmail: data.recommendedEmail ? String(data.recommendedEmail) : null,
        usedFallback: Boolean(data.usedFallback),
        mxHosts: Array.isArray(data.mxHosts) ? data.mxHosts.map(String) : [],
        reason: data.reason ? String(data.reason) : undefined,
        candidateResults: Array.isArray(data.candidateResults) ? data.candidateResults : [],
      };
      clientMxCache.set(cacheKey, result);
      return result;
    }

    // If static host returns 404/405 or HTML instead of JSON, fall back to client-side DoH
    if (res.status === 404 || res.status === 405 || !contentType.includes('application/json')) {
      const dohResult = await verifyCandidatesViaDohFallback(cleanPrimary, cleanFallbacks);
      clientMxCache.set(cacheKey, dohResult);
      return dohResult;
    }

    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Could not verify recipient mail server DNS records.');
  } catch (err) {
    // Attempt client-side DNS-over-HTTPS fallback when backend server is unreachable
    try {
      const dohResult = await verifyCandidatesViaDohFallback(cleanPrimary, cleanFallbacks);
      clientMxCache.set(cacheKey, dohResult);
      return dohResult;
    } catch {
      throw err instanceof Error
        ? err
        : new Error('Could not verify recipient mail server DNS records.');
    }
  }
}
