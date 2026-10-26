import crypto from 'node:crypto';
import { DataBroker, UserProfile } from '../types/index.ts';
import {
  COMMON_OPTOUT_PATHS,
  type DiscoveredOptOutCandidate,
  type OptOutDiscoveryReport,
  type OptOutPageInspection,
  detectAntiBotGate,
  extractOptOutLinksFromHtml,
  extractSitemapAndRobotsOptOutUrls,
  inspectRawOptOutHtml,
  scoreOptOutLinkCandidate,
} from '../utils/optOutFormEngine.ts';
import {
  assertSafeOutboundUrl,
  type CustomDnsLookupFn,
  validatePublicOptOutUrlSyntax,
} from './urlSafety.ts';
import {
  classifyPostSubmitOutcome,
} from './browserAutomation/VerificationDetector.ts';

const MAX_RESPONSE_BYTES = 512 * 1024;
const DEFAULT_FETCH_TIMEOUT_MS = 4500;
const MAX_REDIRECT_HOPS = 4;

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

/**
 * Resolves DNS A/AAAA records prior to outbound HTTP requests to block DNS-rebinding SSRF.
 */
export async function assertSafeResolvedHostname(
  hostname: string,
  options?: { allowLoopbackForTests?: boolean; dnsLookup?: CustomDnsLookupFn }
): Promise<void> {
  await assertSafeOutboundUrl(`https://${hostname}`, {
    allowLoopbackForTests: options?.allowLoopbackForTests,
    dnsLookup: options?.dnsLookup,
  });
}

export interface SafeHttpFetchResult {
  ok: boolean;
  status: number;
  finalUrl: string;
  contentType: string;
  bodyText: string;
}

/**
 * Performs an SSRF-guarded HTTP GET/POST with manual redirect hop validation and size caps.
 */
export async function safePublicFetch(
  targetUrl: string,
  options?: {
    method?: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: string;
    timeoutMs?: number;
    allowLoopbackForTests?: boolean;
    dnsLookupForTests?: CustomDnsLookupFn;
  }
): Promise<SafeHttpFetchResult> {
  let currentUrl = targetUrl;
  let currentMethod: 'GET' | 'POST' = options?.method || 'GET';
  let currentBody = options?.body;

  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    const safeCheck = await assertSafeOutboundUrl(currentUrl, {
      allowLoopbackForTests: options?.allowLoopbackForTests,
      dnsLookup: options?.dnsLookupForTests,
    });

    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      options?.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS
    );

    let res: Response;
    try {
      res = await fetch(safeCheck.normalizedUrl, {
        method: currentMethod,
        headers: {
          'User-Agent': BROWSER_USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Sec-GPC': '1',
          DNT: '1',
          ...(options?.headers || {}),
        },
        body: currentMethod === 'POST' ? currentBody : undefined,
        redirect: 'manual',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) {
        return {
          ok: false,
          status: res.status,
          finalUrl: safeCheck.normalizedUrl,
          contentType: '',
          bodyText: '',
        };
      }
      currentUrl = new URL(loc, safeCheck.normalizedUrl).toString();
      if (res.status === 301 || res.status === 302 || res.status === 303) {
        currentMethod = 'GET';
        currentBody = undefined;
      }
      continue;
    }

    const contentType = res.headers.get('content-type') || '';
    const reader = res.body?.getReader();
    let received = 0;
    const chunks: Uint8Array[] = [];

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          received += value.byteLength;
          if (received <= MAX_RESPONSE_BYTES) {
            chunks.push(value);
          } else {
            const allowedSlice = value.slice(0, Math.max(0, MAX_RESPONSE_BYTES - (received - value.byteLength)));
            if (allowedSlice.byteLength > 0) chunks.push(allowedSlice);
            await reader.cancel().catch(() => null);
            break;
          }
        }
      }
    }

    const merged = new Uint8Array(chunks.reduce((sum, c) => sum + c.byteLength, 0));
    let offset = 0;
    for (const c of chunks) {
      merged.set(c, offset);
      offset += c.byteLength;
    }

    const bodyText = new TextDecoder('utf-8', { fatal: false }).decode(merged);
    return {
      ok: res.ok,
      status: res.status,
      finalUrl: safeCheck.normalizedUrl,
      contentType,
      bodyText,
    };
  }

  throw new Error('Too many HTTP redirects while inspecting opt-out portal.');
}

/**
 * Fetches a single opt-out URL and parses its title, anti-bot gate, HTML forms, and mapped fields.
 */
export async function inspectSingleOptOutUrl(params: {
  url: string;
  profile?: UserProfile;
  senderEmail?: string;
  broker?: DataBroker;
  allowLoopbackForTests?: boolean;
  dnsLookupForTests?: CustomDnsLookupFn;
}): Promise<OptOutPageInspection> {
  const safeCheck = validatePublicOptOutUrlSyntax(params.url, {
    allowLoopbackForTests: params.allowLoopbackForTests,
  });
  if (!safeCheck.valid) {
    throw new Error(safeCheck.reason || 'Invalid opt-out URL.');
  }

  const fetched = await safePublicFetch(safeCheck.normalizedUrl, {
    timeoutMs: 5500,
    allowLoopbackForTests: params.allowLoopbackForTests,
    dnsLookupForTests: params.dnsLookupForTests,
  });
  return inspectRawOptOutHtml({
    html: fetched.bodyText,
    pageUrl: safeCheck.normalizedUrl,
    finalUrl: fetched.finalUrl,
    httpStatus: fetched.status,
    profile: params.profile,
    senderEmail: params.senderEmail,
    broker: params.broker,
  });
}

/**
 * Crawls a broker domain's homepage, known opt-out URL, privacy policy, robots.txt, and top
 * disguised opt-out routes to uncover the true removal page—even if titled "Your Privacy Choices",
 * "Do Not Sell My Info", "Suppression Center", or hosted on OneTrust/TrustArc.
 */
export async function crawlDomainForOptOutPages(params: {
  domainOrUrl: string;
  knownOptOutUrl?: string;
  profile?: UserProfile;
  senderEmail?: string;
  broker?: DataBroker;
  allowLoopbackForTests?: boolean;
  dnsLookupForTests?: CustomDnsLookupFn;
}): Promise<OptOutDiscoveryReport> {
  const safeStart = validatePublicOptOutUrlSyntax(params.domainOrUrl, {
    allowLoopbackForTests: params.allowLoopbackForTests,
  });
  if (!safeStart.valid) {
    throw new Error(safeStart.reason || 'Enter a valid public website domain or URL.');
  }

  const startOrigin = new URL(safeStart.normalizedUrl).origin;
  const candidateMap = new Map<string, DiscoveredOptOutCandidate>();
  const inspectionsByUrl = new Map<string, OptOutPageInspection>();
  let probedUrlsCount = 0;

  const upsertCandidate = (cand: DiscoveredOptOutCandidate) => {
    const existing = candidateMap.get(cand.url);
    if (!existing || cand.score > existing.score) {
      candidateMap.set(cand.url, {
        ...existing,
        ...cand,
        signals: Array.from(new Set([...(existing?.signals || []), ...cand.signals])),
      });
    }
  };

  // Seed known catalog optOutUrl if valid
  if (params.knownOptOutUrl) {
    const safeKnown = validatePublicOptOutUrlSyntax(params.knownOptOutUrl, {
      allowLoopbackForTests: params.allowLoopbackForTests,
    });
    if (safeKnown.valid) {
      upsertCandidate({
        url: safeKnown.normalizedUrl,
        anchorText: 'Catalog Opt-Out Endpoint',
        score: 72,
        signals: ['Catalog Opt-Out URL'],
        isThirdPartyPortal: false,
      });
    }
  }

  // Phase 1: Parallel fetch of Homepage + robots.txt + /privacy + knownOptOutUrl (if distinct)
  const knownNormalized =
    params.knownOptOutUrl &&
    validatePublicOptOutUrlSyntax(params.knownOptOutUrl, {
      allowLoopbackForTests: params.allowLoopbackForTests,
    }).valid
      ? validatePublicOptOutUrlSyntax(params.knownOptOutUrl, {
          allowLoopbackForTests: params.allowLoopbackForTests,
        }).normalizedUrl
      : '';

  const phase1Seeds = Array.from(
    new Set(
      [
        startOrigin + '/',
        `${startOrigin}/robots.txt`,
        `${startOrigin}/privacy`,
        knownNormalized,
      ].filter(Boolean)
    )
  );

  const phase1Results = await Promise.allSettled(
    phase1Seeds.map(async (seedUrl) => {
      probedUrlsCount++;
      const res = await safePublicFetch(seedUrl, {
        timeoutMs: 4200,
        allowLoopbackForTests: params.allowLoopbackForTests,
        dnsLookupForTests: params.dnsLookupForTests,
      });
      return { seedUrl, res };
    })
  );

  let homepageReachable = false;

  for (const settled of phase1Results) {
    if (settled.status !== 'fulfilled') continue;
    const { seedUrl, res } = settled.value;
    if (res.status >= 200 && res.status < 500) {
      homepageReachable = true;
    }

    if (seedUrl.endsWith('/robots.txt')) {
      if (res.status === 200 && res.bodyText) {
        const robotsLinks = extractSitemapAndRobotsOptOutUrls(res.bodyText, startOrigin, {
          allowLoopbackForTests: params.allowLoopbackForTests,
        });
        robotsLinks.forEach(upsertCandidate);
      }
      continue;
    }

    if (res.bodyText && (res.status < 400 || res.status === 403)) {
      const links = extractOptOutLinksFromHtml(res.bodyText, res.finalUrl, safeStart.hostname, {
        allowLoopbackForTests: params.allowLoopbackForTests,
      });
      links.forEach(upsertCandidate);

      const inspected = inspectRawOptOutHtml({
        html: res.bodyText,
        pageUrl: seedUrl,
        finalUrl: res.finalUrl,
        httpStatus: res.status,
        profile: params.profile,
        senderEmail: params.senderEmail,
        broker: params.broker,
        allowLoopbackForTests: params.allowLoopbackForTests,
      });
      inspectionsByUrl.set(inspected.finalUrl, inspected);

      const pageScored = scoreOptOutLinkCandidate({
        url: inspected.finalUrl,
        pageTitle: inspected.pageTitle,
        headingText: inspected.primaryHeading,
        baseDomain: safeStart.hostname,
        allowLoopbackForTests: params.allowLoopbackForTests,
      });

      if (pageScored.score >= 35 || seedUrl === params.knownOptOutUrl) {
        const formBonus = inspected.forms.some((f) => f.isLikelyOptOutForm) ? 20 : 0;
        const statusPenalty = res.status >= 400 ? -25 : 0;
        upsertCandidate({
          url: inspected.finalUrl,
          anchorText: inspected.pageTitle || inspected.primaryHeading || seedUrl,
          pageTitle: inspected.pageTitle,
          headingText: inspected.primaryHeading,
          httpStatus: res.status,
          score: Math.max(10, Math.min(100, pageScored.score + formBonus + statusPenalty)),
          signals: [
            ...pageScored.signals,
            ...(inspected.forms.length > 0 ? [`${inspected.forms.length} Form(s) Detected`] : []),
          ],
          isThirdPartyPortal: pageScored.isThirdPartyPortal,
          thirdPartyVendor: pageScored.thirdPartyVendor,
          formCount: inspected.forms.length,
          mappedFieldCount:
            inspected.forms[0]?.fields.filter((f) => f.semanticRole !== 'csrf_or_hidden').length ||
            0,
          antiBotGate: inspected.antiBotGate,
        });
      }
    }
  }

  // Phase 2: Probe top discovered links + high-probability disguised opt-out slugs not yet inspected
  const heuristicUrls = COMMON_OPTOUT_PATHS.slice(0, 8).map((slug) => `${startOrigin}${slug}`);
  for (const hUrl of heuristicUrls) {
    if (!candidateMap.has(hUrl)) {
      const s = scoreOptOutLinkCandidate({
        url: hUrl,
        baseDomain: safeStart.hostname,
        allowLoopbackForTests: params.allowLoopbackForTests,
      });
      upsertCandidate({
        url: hUrl,
        anchorText: `Candidate Route (${new URL(hUrl).pathname})`,
        score: Math.max(30, s.score - 12),
        signals: s.signals,
        isThirdPartyPortal: false,
      });
    }
  }

  const unprobedCandidates = Array.from(candidateMap.values())
    .filter((c) => !inspectionsByUrl.has(c.url) && c.httpStatus === undefined)
    .sort((a, b) => b.score - a.score)
    .slice(0, 7);

  const phase2Results = await Promise.allSettled(
    unprobedCandidates.map(async (cand) => {
      probedUrlsCount++;
      const res = await safePublicFetch(cand.url, {
        timeoutMs: 3800,
        allowLoopbackForTests: params.allowLoopbackForTests,
        dnsLookupForTests: params.dnsLookupForTests,
      });
      return { cand, res };
    })
  );

  for (const settled of phase2Results) {
    if (settled.status !== 'fulfilled') continue;
    const { cand, res } = settled.value;

    // Drop 404 / 410 / 500 dead routes from candidate list unless it was explicitly linked on homepage
    if (res.status === 404 || res.status === 410 || res.status >= 500) {
      if (!cand.sourcePage) {
        candidateMap.delete(cand.url);
      } else {
        upsertCandidate({ ...cand, httpStatus: res.status, score: Math.max(5, cand.score - 55) });
      }
      continue;
    }

    const inspected = inspectRawOptOutHtml({
      html: res.bodyText,
      pageUrl: cand.url,
      finalUrl: res.finalUrl,
      httpStatus: res.status,
      profile: params.profile,
      senderEmail: params.senderEmail,
      broker: params.broker,
      allowLoopbackForTests: params.allowLoopbackForTests,
    });
    inspectionsByUrl.set(inspected.finalUrl, inspected);

    // Also harvest any deeper links inside Privacy Policy / Help hubs
    const deeperLinks = extractOptOutLinksFromHtml(
      res.bodyText,
      inspected.finalUrl,
      safeStart.hostname,
      { allowLoopbackForTests: params.allowLoopbackForTests }
    );
    for (const dl of deeperLinks.slice(0, 4)) {
      if (dl.score >= 55) {
        upsertCandidate(dl);
      }
    }

    const rescored = scoreOptOutLinkCandidate({
      url: inspected.finalUrl,
      anchorText: cand.anchorText,
      pageTitle: inspected.pageTitle,
      headingText: inspected.primaryHeading,
      baseDomain: safeStart.hostname,
      allowLoopbackForTests: params.allowLoopbackForTests,
    });

    const hasOptOutForm = inspected.forms.some((f) => f.isLikelyOptOutForm);
    const visibleMappedCount =
      inspected.forms[0]?.fields.filter((f) => f.semanticRole !== 'csrf_or_hidden').length || 0;

    let finalScore = Math.max(cand.score, rescored.score);
    if (res.status >= 200 && res.status < 300) finalScore += 10;
    if (hasOptOutForm) finalScore += 22;
    if (res.status === 403) finalScore -= 8; // Live route behind Cloudflare WAF — still valuable for browser Auto-Fill!

    // Remove candidate alias if redirected to homepage root with no opt-out form
    const finalPath = new URL(inspected.finalUrl).pathname;
    if ((finalPath === '/' || finalPath === '') && !hasOptOutForm && cand.url !== startOrigin + '/') {
      candidateMap.delete(cand.url);
      continue;
    }

    if (cand.url !== inspected.finalUrl) {
      candidateMap.delete(cand.url);
    }

    upsertCandidate({
      url: inspected.finalUrl,
      anchorText: inspected.pageTitle || cand.anchorText,
      pageTitle: inspected.pageTitle,
      headingText: inspected.primaryHeading,
      httpStatus: res.status,
      score: Math.max(15, Math.min(100, finalScore)),
      signals: [
        ...cand.signals,
        ...rescored.signals,
        ...(hasOptOutForm ? [`Opt-Out Form (${visibleMappedCount} Fields)`] : []),
        ...(res.status === 403 ? ['WAF Protected (Use Browser Auto-Fill)'] : []),
      ],
      isThirdPartyPortal: rescored.isThirdPartyPortal,
      thirdPartyVendor: rescored.thirdPartyVendor,
      formCount: inspected.forms.length,
      mappedFieldCount: visibleMappedCount,
      antiBotGate: inspected.antiBotGate,
      sourcePage: cand.sourcePage,
    });
  }

  const sortedCandidates = Array.from(candidateMap.values())
    .filter((c) => c.url !== startOrigin + '/' || (c.formCount || 0) > 0)
    .sort((a, b) => {
      const aLive = a.httpStatus && a.httpStatus >= 200 && a.httpStatus < 400 ? 1 : 0;
      const bLive = b.httpStatus && b.httpStatus >= 200 && b.httpStatus < 400 ? 1 : 0;
      if (aLive !== bLive) return bLive - aLive;
      return b.score - a.score;
    })
    .slice(0, 12);

  const bestCandidate = sortedCandidates[0] || null;
  let bestInspection: OptOutPageInspection | null = null;

  if (bestCandidate) {
    bestInspection = inspectionsByUrl.get(bestCandidate.url) || null;
    if (!bestInspection) {
      try {
        probedUrlsCount++;
        bestInspection = await inspectSingleOptOutUrl({
          url: bestCandidate.url,
          profile: params.profile,
          senderEmail: params.senderEmail,
          broker: params.broker,
          allowLoopbackForTests: params.allowLoopbackForTests,
          dnsLookupForTests: params.dnsLookupForTests,
        });
      } catch {
        bestInspection = null;
      }
    }
  }

  return {
    queriedDomain: safeStart.hostname,
    normalizedStartUrl: startOrigin,
    scannedAtIso: new Date().toISOString(),
    bestCandidate,
    bestInspection,
    candidates: sortedCandidates,
    probedUrlsCount,
    fallbackReason: !homepageReachable
      ? 'Target host blocked automated crawler connections or timed out. Use the Search Engine Opt-Out Finders or Browser Auto-Fill Bookmarklet below.'
      : undefined,
  };
}

export interface WebFormRelaySubmissionResult {
  success: boolean;
  httpStatus: number;
  finalUrl: string;
  internalSubmissionId: string;
  brokerConfirmationCode: string | null;
  confirmationTicket: string;
  outcomeClassification: string;
  outcomeSummary: string;
  requiresBrowserCaptcha: boolean;
  antiBotGate: string;
  responseExcerpt: string;
}

/**
 * Submits mapped consumer opt-out form fields directly to a public HTML form action URL
 * (when not gated by interactive CAPTCHA), sending Sec-GPC: 1 and strictly separating
 * synOUT's internalSubmissionId from any genuine brokerConfirmationCode (`null` when none issued).
 */
export async function submitWebFormViaRelay(params: {
  actionUrl: string;
  method: 'GET' | 'POST';
  fields: Record<string, string>;
  refererUrl?: string;
  allowLoopbackForTests?: boolean;
  dnsLookupForTests?: CustomDnsLookupFn;
}): Promise<WebFormRelaySubmissionResult> {
  const safeAction = validatePublicOptOutUrlSyntax(params.actionUrl, {
    allowLoopbackForTests: params.allowLoopbackForTests,
  });
  if (!safeAction.valid) {
    throw new Error(safeAction.reason || 'Invalid form action URL.');
  }

  const encodedParams = new URLSearchParams();
  for (const [k, v] of Object.entries(params.fields || {})) {
    const cleanKey = String(k || '').trim().slice(0, 120);
    if (!cleanKey) continue;
    encodedParams.append(cleanKey, String(v ?? '').slice(0, 2000));
  }

  let requestUrl = safeAction.normalizedUrl;
  let body: string | undefined = undefined;
  const headers: Record<string, string> = {};

  if (params.refererUrl) {
    const safeReferer = validatePublicOptOutUrlSyntax(params.refererUrl, {
      allowLoopbackForTests: params.allowLoopbackForTests,
    });
    if (safeReferer.valid) {
      headers.Referer = safeReferer.normalizedUrl;
      headers.Origin = new URL(headers.Referer).origin;
    }
  }

  if (params.method === 'GET') {
    const u = new URL(requestUrl);
    encodedParams.forEach((val, key) => u.searchParams.set(key, val));
    requestUrl = u.toString();
  } else {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = encodedParams.toString();
  }

  const res = await safePublicFetch(requestUrl, {
    method: params.method,
    headers,
    body,
    timeoutMs: 8000,
    allowLoopbackForTests: params.allowLoopbackForTests,
    dnsLookupForTests: params.dnsLookupForTests,
  });

  const antiBot = detectAntiBotGate(res.bodyText, res.status);
  const plainText = res.bodyText
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const hasInvalidHtmlAttr = /aria-invalid=["']true["']|class=["'][^"']*(?:field-error|error-message)/i.test(
    res.bodyText
  );

  const classified = classifyPostSubmitOutcome({
    beforeUrl: safeAction.normalizedUrl,
    afterUrl: res.finalUrl,
    httpStatus: res.status,
    visibleText: plainText,
    html: res.bodyText,
    hasValidationInvalidAttributes: hasInvalidHtmlAttr,
  });

  const internalSubmissionId = `JOB-RELAY-${Date.now().toString(36).toUpperCase()}-${crypto
    .randomBytes(3)
    .toString('hex')
    .toUpperCase()}`;

  const requiresBrowserCaptcha =
    classified.outcome === 'blocked' ||
    res.status === 403 ||
    res.status === 429 ||
    antiBot.gate === 'cloudflare_challenge' ||
    antiBot.gate === 'recaptcha' ||
    antiBot.gate === 'hcaptcha' ||
    antiBot.gate === 'turnstile';

  const success =
    !requiresBrowserCaptcha &&
    classified.outcome !== 'validation_error' &&
    classified.outcome !== 'rejected' &&
    res.status >= 200 &&
    res.status < 400;

  return {
    success,
    httpStatus: res.status,
    finalUrl: res.finalUrl,
    internalSubmissionId,
    brokerConfirmationCode: classified.brokerConfirmationCode,
    confirmationTicket: classified.brokerConfirmationCode || '',
    outcomeClassification: classified.outcome,
    outcomeSummary: classified.summary,
    requiresBrowserCaptcha,
    antiBotGate: antiBot.gate,
    responseExcerpt: plainText.slice(0, 260),
  };
}
