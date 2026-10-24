import { DataBroker, UserProfile } from '../types';
import {
  COMMON_OPTOUT_PATHS,
  type DiscoveredOptOutCandidate,
  type OptOutDiscoveryReport,
  type OptOutPageInspection,
  inspectRawOptOutHtml,
  isSafePublicOptOutUrl,
  scoreOptOutLinkCandidate,
} from '../utils/optOutFormEngine';

export interface ClientWebFormRelayResponse {
  success: boolean;
  httpStatus: number;
  finalUrl: string;
  confirmationTicket: string;
  requiresBrowserCaptcha: boolean;
  antiBotGate: string;
  responseExcerpt: string;
  error?: string;
}

/**
 * Builds deterministic client-side opt-out candidates when running on a static host (e.g. GitHub Pages)
 * where the server-side HTML spider is unavailable.
 */
export function buildStaticFallbackDiscoveryReport(params: {
  domainOrUrl: string;
  knownOptOutUrl?: string;
  broker?: DataBroker;
}): OptOutDiscoveryReport {
  const safe = isSafePublicOptOutUrl(params.domainOrUrl);
  if (!safe.valid) {
    throw new Error(safe.reason || 'Enter a valid public website domain or URL.');
  }

  const origin = new URL(safe.normalizedUrl).origin;
  const candidates: DiscoveredOptOutCandidate[] = [];

  if (params.knownOptOutUrl && isSafePublicOptOutUrl(params.knownOptOutUrl).valid) {
    const cleanKnown = isSafePublicOptOutUrl(params.knownOptOutUrl).normalizedUrl;
    candidates.push({
      url: cleanKnown,
      anchorText: params.broker
        ? `${params.broker.name} Official Opt-Out Portal`
        : 'Known Opt-Out Endpoint',
      score: 90,
      signals: ['Verified Catalog Endpoint'],
      isThirdPartyPortal: false,
    });
  }

  for (const pathSlug of COMMON_OPTOUT_PATHS.slice(0, 10)) {
    const candidateUrl = `${origin}${pathSlug}`;
    if (candidates.some((c) => c.url === candidateUrl)) continue;
    const scored = scoreOptOutLinkCandidate({
      url: candidateUrl,
      baseDomain: safe.hostname,
    });
    candidates.push({
      url: candidateUrl,
      anchorText: `Common Broker Route: ${pathSlug}`,
      score: Math.max(30, scored.score),
      signals: scored.signals.length > 0 ? scored.signals : ['Heuristic Path Candidate'],
      isThirdPartyPortal: false,
    });
  }

  return {
    queriedDomain: safe.hostname,
    normalizedStartUrl: origin,
    scannedAtIso: new Date().toISOString(),
    bestCandidate: candidates[0] || null,
    bestInspection: null,
    candidates,
    probedUrlsCount: 0,
    fallbackReason:
      'Running in static browser-only mode: use the 1-Click Search Engine Opt-Out Finders, paste page HTML to inspect fields, or drag the Universal Auto-Fill Bookmarklet.',
  };
}

/**
 * Discovers arbitrarily-titled opt-out pages on any broker domain via backend spider,
 * gracefully falling back to heuristic + search-dork candidates on static hosts.
 */
export async function discoverOptOutPagesClient(params: {
  domainOrUrl: string;
  knownOptOutUrl?: string;
  profile?: UserProfile;
  senderEmail?: string;
  broker?: DataBroker;
}): Promise<OptOutDiscoveryReport> {
  const safe = isSafePublicOptOutUrl(params.domainOrUrl);
  if (!safe.valid) {
    throw new Error(safe.reason || 'Enter a valid domain or https:// URL.');
  }

  try {
    const res = await fetch('/api/optout/discover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        domainOrUrl: safe.normalizedUrl,
        knownOptOutUrl: params.knownOptOutUrl,
        profile: params.profile,
        senderEmail: params.senderEmail,
        broker: params.broker,
      }),
    });

    const contentType = res.headers.get('content-type') || '';
    if (res.status === 404 || res.status === 405 || !contentType.includes('application/json')) {
      return buildStaticFallbackDiscoveryReport(params);
    }

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Opt-out discovery scan failed.');
    }
    return data as OptOutDiscoveryReport;
  } catch (err) {
    if (err instanceof Error && /Invalid|Blocked|Malformed/i.test(err.message)) {
      throw err;
    }
    return buildStaticFallbackDiscoveryReport(params);
  }
}

/**
 * Inspects a specific opt-out URL's HTML forms and maps fields to the user's profile.
 */
export async function inspectOptOutUrlClient(params: {
  url: string;
  profile?: UserProfile;
  senderEmail?: string;
  broker?: DataBroker;
}): Promise<OptOutPageInspection> {
  const safe = isSafePublicOptOutUrl(params.url);
  if (!safe.valid) {
    throw new Error(safe.reason || 'Enter a valid opt-out page URL.');
  }

  const res = await fetch('/api/optout/inspect-form', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: safe.normalizedUrl,
      profile: params.profile,
      senderEmail: params.senderEmail,
      broker: params.broker,
    }),
  });

  const contentType = res.headers.get('content-type') || '';
  if (res.status === 404 || res.status === 405 || !contentType.includes('application/json')) {
    throw new Error(
      'Live server form fetch is unavailable on static hosting. Open the page in a tab and use the 1-Click Auto-Fill Bookmarklet, or paste the page HTML source below.'
    );
  }

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Could not inspect opt-out page HTML.');
  }
  return data as OptOutPageInspection;
}

/**
 * Parses user-pasted raw HTML source directly in the browser (works 100% offline / behind Cloudflare).
 */
export function inspectPastedHtmlClient(params: {
  rawHtml: string;
  pageUrl: string;
  profile?: UserProfile;
  senderEmail?: string;
  broker?: DataBroker;
}): OptOutPageInspection {
  if (!params.rawHtml || params.rawHtml.trim().length < 15) {
    throw new Error('Paste the HTML source from the broker opt-out page to analyze its form fields.');
  }
  return inspectRawOptOutHtml({
    html: params.rawHtml,
    pageUrl: params.pageUrl || 'https://broker-optout.example/optout',
    httpStatus: 200,
    profile: params.profile,
    senderEmail: params.senderEmail,
    broker: params.broker,
  });
}

/**
 * Submits mapped opt-out form fields via backend HTTP relay (with Sec-GPC: 1).
 */
export async function submitOptOutWebFormClient(params: {
  actionUrl: string;
  method: 'GET' | 'POST';
  fields: Record<string, string>;
  refererUrl?: string;
  brokerId?: string;
  brokerName?: string;
  brokerDomain?: string;
}): Promise<ClientWebFormRelayResponse> {
  const res = await fetch('/api/optout/submit-web-form', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const contentType = res.headers.get('content-type') || '';
  if (res.status === 404 || res.status === 405 || !contentType.includes('application/json')) {
    throw new Error(
      'Direct server form relay is unavailable on static hosting. Open the opt-out page and run the synOUT 1-Click Auto-Fill Bookmarklet.'
    );
  }

  const data = await res.json();
  if (!res.ok && !data.confirmationTicket) {
    throw new Error(data.error || 'Web form relay failed.');
  }
  return data as ClientWebFormRelayResponse;
}
