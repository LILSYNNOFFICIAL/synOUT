import type { Page } from 'playwright-core';
import type { UserProfile } from '../../types/index.ts';
import { extractRegistrableDomain } from '../../utils/optOutFormEngine.ts';
import { sanitizeTrackingUrl } from '../../utils/replyTriageEngine.ts';
import { getUserJurisdictionStates, normalizeStateCode } from '../../utils/scanEngine.ts';
import { assertSafeOutboundUrl, type CustomDnsLookupFn } from '../urlSafety.ts';
import type {
  CandidateRecordMatch,
  PostSubmitOutcomeKind,
  WorkflowBlockerInfo,
} from './types.ts';

/**
 * Inspects rendered page HTML, visible text, and HTTP status for CAPTCHAs, WAF challenges,
 * login walls, SMS OTP gates, or unlawful government ID upload demands.
 * Never solves or bypasses CAPTCHAs — cleanly classifies them for human handoff.
 */
export function detectLivePageBlocker(params: {
  html: string;
  visibleText: string;
  url: string;
  httpStatus: number;
}): WorkflowBlockerInfo | null {
  const htmlLower = (params.html || '').toLowerCase();
  const textLower = (params.visibleText || '').toLowerCase();

  // 1. Cloudflare / DataDome / PerimeterX WAF challenge
  if (
    params.httpStatus === 403 ||
    params.httpStatus === 503 ||
    params.httpStatus === 429 ||
    /cf-browser-verification|cf-chl-bypass|__cf_chl_opt|just a moment\.\.\.|attention required! \| cloudflare|perimeterx|datadome/i.test(
      params.html
    )
  ) {
    return {
      kind: 'cloudflare_waf',
      summary:
        'Portal presented an anti-bot WAF / Cloudflare challenge (HTTP ' +
        params.httpStatus +
        '). Automation paused cleanly without evasion; open the handoff URL in your browser and run the synOUT Auto-Fill Bookmarklet.',
      handoffUrl: params.url,
      requiresHumanAction: true,
    };
  }

  // 2. Cloudflare Turnstile widget
  if (
    /cf-turnstile|challenges\.cloudflare\.com\/turnstile/i.test(htmlLower)
  ) {
    return {
      kind: 'turnstile',
      summary:
        'Form requires interactive Cloudflare Turnstile verification. Open the handoff URL, run the Auto-Fill Bookmarklet, complete Turnstile, and click Submit.',
      handoffUrl: params.url,
      requiresHumanAction: true,
    };
  }

  // 3. Google reCAPTCHA widget
  if (
    /class=["'][^"']*g-recaptcha|google\.com\/recaptcha\/api|iframe[^>]+src=["'][^"']*recaptcha/i.test(
      htmlLower
    )
  ) {
    return {
      kind: 'recaptcha',
      summary:
        'Form includes an interactive Google reCAPTCHA challenge. Automation paused cleanly; open the handoff URL, auto-fill fields with the synOUT Bookmarklet, complete reCAPTCHA, and submit.',
      handoffUrl: params.url,
      requiresHumanAction: true,
    };
  }

  // 4. hCaptcha widget
  if (
    /class=["'][^"']*h-captcha|hcaptcha\.com\/1\/api|iframe[^>]+src=["'][^"']*hcaptcha/i.test(
      htmlLower
    )
  ) {
    return {
      kind: 'hcaptcha',
      summary:
        'Form includes an interactive hCaptcha challenge. Open the handoff URL, run the Auto-Fill Bookmarklet, complete hCaptcha, and submit.',
      handoffUrl: params.url,
      requiresHumanAction: true,
    };
  }

  // 5. Mandatory login wall without guest opt-out form
  if (
    /type=["']password["']/i.test(htmlLower) &&
    /\b(sign\s+in|log\s+in|account\s+password)\b/i.test(textLower) &&
    !/\b(opt[\s-]?out\s+without\s+account|guest\s+opt[\s-]?out|do\s+not\s+sell\s+form)\b/i.test(
      textLower
    )
  ) {
    return {
      kind: 'login_required',
      summary:
        'Portal requires authenticated account sign-in before displaying suppression controls. Complete login manually or dispatch a statutory CCPA deletion demand email (11 CCR § 7060 prohibits forcing account creation).',
      handoffUrl: params.url,
      requiresHumanAction: true,
    };
  }

  // 6. Mandatory SMS / telephone OTP verification step
  if (
    /\b(enter\s+the\s+(?:6-digit|verification|sms)\s+code\s+sent\s+to\s+your\s+phone|call\s+to\s+verify\s+your\s+opt-out)\b/i.test(
      textLower
    )
  ) {
    return {
      kind: 'phone_otp_required',
      summary:
        'Portal requires live SMS/telephone PIN verification. Complete the phone code in your browser or send a statutory CCPA email notice.',
      handoffUrl: params.url,
      requiresHumanAction: true,
    };
  }

  return null;
}

/**
 * Extracts person listing candidate cards from a broker search results DOM and scores them
 * against the user's profile with strict multi-anchor homonym disqualification.
 */
export async function extractAndScoreCandidateRecords(
  page: Page,
  profile: UserProfile
): Promise<CandidateRecordMatch[]> {
  const rawCards = await page.evaluate(() => {
    const containers = Array.from(
      document.querySelectorAll(
        '[data-record-id], .record-card, .person-card, .search-result, .listing-row, .optout-record, article, tr, li'
      )
    ) as HTMLElement[];

    const results: Array<{
      candidateId: string;
      selector: string;
      actionType: 'click_button' | 'click_link' | 'check_radio' | 'navigate_url';
      targetUrl?: string;
      text: string;
    }> = [];

    let idx = 0;
    for (const el of containers) {
      const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
      if (text.length < 12 || text.length > 900) continue;

      // Avoid matching outer layout wrappers that contain other candidate cards
      if (
        el.querySelectorAll('[data-record-id], .record-card, .person-card, .search-result').length > 0
      ) {
        continue;
      }

      const actionBtn = el.querySelector(
        'button, input[type="button"], input[type="submit"], a, input[type="radio"]'
      ) as HTMLElement | null;
      if (!actionBtn) continue;

      const btnLabel =
        actionBtn.tagName === 'INPUT'
          ? (actionBtn as HTMLInputElement).value || actionBtn.getAttribute('aria-label') || ''
          : actionBtn.innerText || actionBtn.textContent || '';

      const isRadio =
        actionBtn.tagName === 'INPUT' &&
        (actionBtn as HTMLInputElement).type.toLowerCase() === 'radio';
      const isOptOutAction =
        isRadio ||
        /\b(remove|opt[\s-]?out|select|this\s+is\s+me|delete|suppress|control|view\s+profile|claim)\b/i.test(
          `${btnLabel} ${actionBtn.getAttribute('href') || ''}`
        );

      if (!isOptOutAction) continue;

      const attrId = el.getAttribute('data-record-id') || `cand_${idx}`;
      actionBtn.setAttribute('data-synout-cand', attrId);
      const selector = `[data-synout-cand="${attrId.replace(/"/g, '\\"')}"]`;

      let actionType: 'click_button' | 'click_link' | 'check_radio' | 'navigate_url' =
        'click_button';
      let targetUrl: string | undefined;

      if (isRadio) {
        actionType = 'check_radio';
      } else if (actionBtn.tagName === 'A') {
        const href = (actionBtn as HTMLAnchorElement).href;
        if (href && /^https?:\/\//i.test(href)) {
          actionType = 'click_link';
          targetUrl = href;
        }
      }

      results.push({
        candidateId: attrId,
        selector,
        actionType,
        targetUrl,
        text,
      });
      idx++;
      if (results.length >= 25) break;
    }

    return results;
  });

  const userFirst = (profile.firstName || '').trim().toLowerCase();
  const userLast = (profile.lastName || '').trim().toLowerCase();
  const userCity = (profile.currentCity || '').trim().toLowerCase();
  const userStates = getUserJurisdictionStates(profile);
  const currentState = normalizeStateCode(profile.currentState);
  const expectedAge =
    profile.birthYear && /^\d{4}$/.test(profile.birthYear)
      ? new Date().getFullYear() - parseInt(profile.birthYear, 10)
      : null;

  const candidates: CandidateRecordMatch[] = [];

  for (const raw of rawCards) {
    const lower = raw.text.toLowerCase();
    const hasFirst = userFirst ? lower.includes(userFirst) : false;
    const hasLast = userLast ? lower.includes(userLast) : false;
    if (!hasFirst || !hasLast) {
      continue;
    }

    let score = 0.45;
    const signals: string[] = ['Exact first & last name match'];
    let disqualifiedHomonym = false;
    let disqualifiedReason: string | undefined;

    // Extract 2-letter US state tokens in card (e.g. ", CA", " TX ", "Austin, TX")
    const stateMatches = Array.from(
      raw.text.matchAll(/(?:,\s*|\b)(AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/g)
    ).map((m) => m[1].toUpperCase());

    const uniqueCardStates = Array.from(new Set(stateMatches));
    if (uniqueCardStates.length > 0 && userStates.size > 0) {
      const hasMatchingState = uniqueCardStates.some((st) => userStates.has(st));
      if (hasMatchingState) {
        score += 0.25;
        signals.push(`Jurisdiction state match (${uniqueCardStates.filter((st) => userStates.has(st)).join(', ')})`);
      } else {
        disqualifiedHomonym = true;
        disqualifiedReason = `Jurisdiction Conflict: Listing states (${uniqueCardStates.join(
          ', '
        )}) do not match user residency history (${Array.from(userStates).join(', ') || currentState}).`;
        score = 0.1;
      }
    }

    if (!disqualifiedHomonym && userCity && lower.includes(userCity)) {
      score += 0.18;
      signals.push(`City match (${profile.currentCity})`);
    } else if (!disqualifiedHomonym && profile.previousLocations?.length) {
      const matchedPrev = profile.previousLocations.find((loc) => {
        const cityPart = loc.split(',')[0]?.trim().toLowerCase();
        return cityPart && cityPart.length >= 3 && lower.includes(cityPart);
      });
      if (matchedPrev) {
        score += 0.15;
        signals.push(`Prior city match (${matchedPrev})`);
      }
    }

    // Age / birth year check
    const ageMatch = raw.text.match(/\b(?:age\s*:?\s*|aged\s+)(\d{2,3})\b/i) || raw.text.match(/,\s*(\d{2})\b/);
    const extractedAge = ageMatch ? parseInt(ageMatch[1], 10) : null;
    if (extractedAge && expectedAge !== null) {
      const diff = Math.abs(extractedAge - expectedAge);
      if (diff <= 2) {
        score += 0.12;
        signals.push(`Age match (${extractedAge})`);
      } else if (diff >= 6) {
        disqualifiedHomonym = true;
        disqualifiedReason = `Age Conflict: Listing age (${extractedAge}) differs substantially from profile age (${expectedAge}).`;
        score = 0.12;
      }
    }

    // Relative anchor bonus
    if (!disqualifiedHomonym && profile.relatives?.length) {
      const matchedRel = profile.relatives.find((r) => {
        const clean = r.trim().toLowerCase();
        return clean.length >= 3 && lower.includes(clean);
      });
      if (matchedRel) {
        score += 0.1;
        signals.push('Associated relative match');
      }
    }

    candidates.push({
      candidateId: raw.candidateId,
      selector: raw.selector,
      actionType: raw.actionType,
      targetUrl: raw.targetUrl,
      fullName: `${profile.firstName} ${profile.lastName}`.trim(),
      age: extractedAge ? String(extractedAge) : undefined,
      locations: uniqueCardStates,
      relatives: [],
      rawSnippet: raw.text.slice(0, 220),
      confidenceScore: Math.min(0.99, Number(score.toFixed(2))),
      disqualifiedHomonym,
      disqualifiedReason,
      matchSignals: signals,
    });
  }

  return candidates.sort((a, b) => b.confidenceScore - a.confidenceScore);
}

const FALSE_POSITIVE_TICKET_WORDS = new Set([
  'NUMBER',
  'RECEIVED',
  'SUBMITTED',
  'PENDING',
  'SUCCESS',
  'REQUEST',
  'COMPLETE',
  'COMPLETED',
  'CONFIRMED',
  'CONFIRMATION',
  'PRIVACY',
  'SUPPORT',
  'REMOVAL',
  'OPTOUT',
  'DELETED',
  'STATUS',
  'DETAILS',
]);

/**
 * Strictly extracts a real broker-issued confirmation/reference/ticket ID if and only if
 * one appears in the response text alongside alphanumeric digits/hyphens. Never invents IDs.
 */
export function extractGenuineBrokerConfirmationCode(text: string): string | null {
  if (!text) return null;
  const patterns = [
    /(?:confirmation|reference|ticket|request|case|tracking)\s*(?:id|number|code|no\.?|#)\s*[:#-]?\s*([A-Z0-9][A-Z0-9-]{4,30})/i,
    /(?:reference|ticket|case|confirmation)\s*#\s*([A-Z0-9][A-Z0-9-]{4,30})/i,
  ];

  for (const regex of patterns) {
    const m = text.match(regex);
    if (m && m[1]) {
      const candidate = m[1].trim();
      // Must contain at least one digit so ordinary prose words are never mistaken for IDs
      if (/\d/.test(candidate) && !FALSE_POSITIVE_TICKET_WORDS.has(candidate.toUpperCase())) {
        return candidate;
      }
    }
  }
  return null;
}

/**
 * Evaluates the live post-submit DOM & HTTP response to distinguish genuine broker receipts,
 * email-verification pending states, unconfirmed HTTP 200 completions, validation errors,
 * explicit rejections, and CAPTCHA blocks.
 */
export function classifyPostSubmitOutcome(params: {
  beforeUrl: string;
  afterUrl: string;
  httpStatus: number;
  visibleText: string;
  html: string;
  hasValidationInvalidAttributes: boolean;
}): {
  outcome: PostSubmitOutcomeKind;
  brokerConfirmationCode: string | null;
  summary: string;
} {
  const blocker = detectLivePageBlocker({
    html: params.html,
    visibleText: params.visibleText,
    url: params.afterUrl,
    httpStatus: params.httpStatus,
  });

  if (blocker) {
    return {
      outcome: 'blocked',
      brokerConfirmationCode: null,
      summary: blocker.summary,
    };
  }

  const text = (params.visibleText || '').replace(/\s+/g, ' ').trim();
  const brokerConfirmationCode = extractGenuineBrokerConfirmationCode(text);

  // 1. Check explicit form validation errors (even when broker returned HTTP 200!)
  if (
    params.httpStatus === 400 ||
    params.httpStatus === 422 ||
    params.hasValidationInvalidAttributes ||
    /\b(field\s+is\s+required|please\s+enter\s+a\s+valid|please\s+complete\s+all\s+required|invalid\s+csrf|csrf\s+token\s+mismatch|validation\s+failed|missing\s+required\s+field|email\s+address\s+is\s+invalid)\b/i.test(
      text
    )
  ) {
    return {
      outcome: 'validation_error',
      brokerConfirmationCode: null,
      summary:
        'Broker portal returned a form validation error; request was NOT accepted by the broker.',
    };
  }

  if (params.httpStatus >= 500) {
    return {
      outcome: 'validation_error',
      brokerConfirmationCode: null,
      summary: `Broker portal returned server error HTTP ${params.httpStatus}.`,
    };
  }

  // 2. Check explicit refusal / statutory exemption denial
  if (
    /\b(request\s+(?:has\s+been\s+)?denied|cannot\s+process\s+your\s+(?:opt-out|deletion)|ineligible\s+for\s+removal|exempt\s+public\s+record)\b/i.test(
      text
    )
  ) {
    return {
      outcome: 'rejected',
      brokerConfirmationCode,
      summary:
        'Broker portal explicitly refused or claimed an exemption on the deletion request.',
    };
  }

  // 3. Check email confirmation link requirement
  if (
    /\b(check\s+your\s+(?:email|inbox)|verification\s+(?:email|link)\s+(?:has\s+been\s+)?sent|click\s+the\s+(?:confirmation|verification|activation)\s+link|confirm\s+your\s+email\s+address\s+to\s+complete)\b/i.test(
      text
    )
  ) {
    return {
      outcome: 'awaiting_email_verification',
      brokerConfirmationCode,
      summary:
        'Form submitted; broker sent a verification link to your email that must be confirmed to finalize removal.',
    };
  }

  // 4. Check explicit confirmation / receipt message
  if (
    brokerConfirmationCode !== null ||
    /\b(opt[\s-]?out\s+request\s+(?:has\s+been\s+)?(?:received|submitted|confirmed)|removal\s+request\s+(?:has\s+been\s+)?(?:received|submitted|accepted)|we\s+have\s+received\s+your\s+(?:privacy|deletion|removal|opt-out)\s+request|your\s+(?:record|listing|information)\s+will\s+be\s+removed|suppression\s+request\s+confirmed|thank\s+you\s+for\s+submitting\s+your\s+privacy\s+request)\b/i.test(
      text
    )
  ) {
    return {
      outcome: 'awaiting_broker_processing',
      brokerConfirmationCode,
      summary: brokerConfirmationCode
        ? `Broker accepted opt-out form and issued confirmation code ${brokerConfirmationCode}.`
        : 'Broker portal acknowledged receipt of opt-out submission (no confirmation code issued by broker).',
    };
  }

  // 5. Honest fallback for HTTP 2xx without explicit receipt text
  return {
    outcome: 'submitted_unconfirmed',
    brokerConfirmationCode: null,
    summary:
      'Form POST completed with HTTP ' +
      params.httpStatus +
      ', but no explicit broker confirmation receipt was detected on the resulting page.',
  };
}

const TRUSTED_VERIFICATION_VENDOR_DOMAINS = [
  'peopleconnect.us',
  'beenverified.com',
  'onetrust.com',
  'truste.com',
  'trustarc.com',
  'securiti.ai',
  'transcend.io',
  'datagrail.io',
];

/**
 * Validates an inbound email verification link prior to headless navigation:
 * 1) Strips ad/email tracking parameters (`utm_*`, `fbclid`, `mc_eid`, etc.)
 * 2) Enforces full SSRF / DNS-rebinding protection via `assertSafeOutboundUrl`
 * 3) Verifies domain alignment against the broker's registrable domain or trusted DSAR parent network
 */
export async function validateInboundVerificationLink(params: {
  verificationUrl: string;
  expectedBrokerDomain: string;
  rawEmailText?: string;
  allowLoopbackForTests?: boolean;
  dnsLookupForTests?: CustomDnsLookupFn;
}): Promise<{
  sanitizedUrl: string;
  strippedParams: string[];
}> {
  const sanitized = sanitizeTrackingUrl(params.verificationUrl, params.expectedBrokerDomain);
  const safeUrl = await assertSafeOutboundUrl(sanitized.sanitizedUrl, {
    allowLoopbackForTests: params.allowLoopbackForTests,
    dnsLookup: params.dnsLookupForTests,
  });

  if (
    !params.allowLoopbackForTests ||
    (safeUrl.hostname !== '127.0.0.1' && safeUrl.hostname !== 'localhost')
  ) {
    const linkRoot = extractRegistrableDomain(safeUrl.hostname);
    const brokerRoot = extractRegistrableDomain(params.expectedBrokerDomain);
    const matchesTrustedVendor = TRUSTED_VERIFICATION_VENDOR_DOMAINS.some(
      (v) => linkRoot === v || safeUrl.hostname.endsWith(`.${v}`)
    );

    if (linkRoot !== brokerRoot && !matchesTrustedVendor) {
      throw new Error(
        `Domain Mismatch Blocked: Verification link host (${safeUrl.hostname}) does not match broker domain (${brokerRoot}) or a verified privacy portal.`
      );
    }
  }

  if (params.rawEmailText) {
    const authFail = /Authentication-Results:[^\r\n]*(?:spf=fail|dkim=fail|dmarc=fail)/i.test(
      params.rawEmailText
    );
    if (authFail) {
      throw new Error(
        'Email authentication header failed SPF/DKIM/DMARC verification; blocked untrusted link.'
      );
    }
  }

  return {
    sanitizedUrl: safeUrl.normalizedUrl,
    strippedParams: sanitized.strippedParams,
  };
}
