import { DataBroker, ScanResult, UserProfile } from '../types';
import { getBrokerRecordSearchUrl } from './scanEngine';

export type OptOutChannelStrategy =
  | 'web_form_required'
  | 'dual_channel_recommended'
  | 'email_primary'
  | 'written_or_phone';

export type AntiBotGateType =
  | 'none'
  | 'recaptcha'
  | 'hcaptcha'
  | 'turnstile'
  | 'cloudflare_challenge'
  | 'email_verification'
  | 'spa_dynamic';

export type SemanticConsumerFieldRole =
  | 'full_name'
  | 'first_name'
  | 'last_name'
  | 'middle_name'
  | 'email'
  | 'confirm_email'
  | 'phone'
  | 'city'
  | 'state'
  | 'zip'
  | 'street_address'
  | 'birth_year'
  | 'age'
  | 'record_url'
  | 'request_type'
  | 'statute'
  | 'reason_message'
  | 'consent_checkbox'
  | 'authorized_agent'
  | 'csrf_or_hidden'
  | 'unknown';

export interface DiscoveredOptOutCandidate {
  url: string;
  anchorText: string;
  pageTitle?: string;
  headingText?: string;
  httpStatus?: number;
  score: number;
  signals: string[];
  isThirdPartyPortal: boolean;
  thirdPartyVendor?: string;
  formCount?: number;
  mappedFieldCount?: number;
  antiBotGate?: AntiBotGateType;
  sourcePage?: string;
}

export interface ParsedFormFieldOption {
  value: string;
  label: string;
}

export interface ParsedOptOutFormField {
  key: string;
  name: string;
  id: string;
  tag: 'input' | 'select' | 'textarea';
  inputType: string;
  label: string;
  placeholder: string;
  required: boolean;
  options: ParsedFormFieldOption[];
  semanticRole: SemanticConsumerFieldRole;
  suggestedValue: string;
  defaultRawValue: string;
}

export interface ParsedOptOutForm {
  formIndex: number;
  formId?: string;
  formName?: string;
  actionUrl: string;
  method: 'GET' | 'POST';
  enctype: string;
  submitButtonLabel: string;
  isLikelyOptOutForm: boolean;
  relevanceScore: number;
  fields: ParsedOptOutFormField[];
}

export interface OptOutPageInspection {
  url: string;
  finalUrl: string;
  httpStatus: number;
  pageTitle: string;
  primaryHeading: string;
  metaDescription: string;
  antiBotGate: AntiBotGateType;
  antiBotSummary: string;
  gpcSupportedHint: boolean;
  forms: ParsedOptOutForm[];
  embeddedLinks: DiscoveredOptOutCandidate[];
  directRelayEligible: boolean;
}

export interface OptOutDiscoveryReport {
  queriedDomain: string;
  normalizedStartUrl: string;
  scannedAtIso: string;
  bestCandidate: DiscoveredOptOutCandidate | null;
  bestInspection: OptOutPageInspection | null;
  candidates: DiscoveredOptOutCandidate[];
  probedUrlsCount: number;
  fallbackReason?: string;
}

export interface DisguisedOptOutSearchDork {
  id: string;
  label: string;
  description: string;
  query: string;
  googleUrl: string;
  duckDuckGoUrl: string;
  bingUrl: string;
  braveUrl: string;
}

export const US_STATE_NAMES: Record<string, string> = {
  AL: 'Alabama',
  AK: 'Alaska',
  AZ: 'Arizona',
  AR: 'Arkansas',
  CA: 'California',
  CO: 'Colorado',
  CT: 'Connecticut',
  DE: 'Delaware',
  DC: 'District of Columbia',
  FL: 'Florida',
  GA: 'Georgia',
  HI: 'Hawaii',
  ID: 'Idaho',
  IL: 'Illinois',
  IN: 'Indiana',
  IA: 'Iowa',
  KS: 'Kansas',
  KY: 'Kentucky',
  LA: 'Louisiana',
  ME: 'Maine',
  MD: 'Maryland',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  MS: 'Mississippi',
  MO: 'Missouri',
  MT: 'Montana',
  NE: 'Nebraska',
  NV: 'Nevada',
  NH: 'New Hampshire',
  NJ: 'New Jersey',
  NM: 'New Mexico',
  NY: 'New York',
  NC: 'North Carolina',
  ND: 'North Dakota',
  OH: 'Ohio',
  OK: 'Oklahoma',
  OR: 'Oregon',
  PA: 'Pennsylvania',
  RI: 'Rhode Island',
  SC: 'South Carolina',
  SD: 'South Dakota',
  TN: 'Tennessee',
  TX: 'Texas',
  UT: 'Utah',
  VT: 'Vermont',
  VA: 'Virginia',
  WA: 'Washington',
  WV: 'West Virginia',
  WI: 'Wisconsin',
  WY: 'Wyoming',
};

const THIRD_PARTY_PRIVACY_VENDORS: Array<{ pattern: RegExp; vendor: string }> = [
  { pattern: /onetrust\.com|privacyportal(-cdn)?\.onetrust/i, vendor: 'OneTrust Privacy Portal' },
  { pattern: /truste\.com|trustarc\.com/i, vendor: 'TrustArc DSAR Portal' },
  { pattern: /securiti\.ai/i, vendor: 'Securiti Privacy Center' },
  { pattern: /transcend\.io/i, vendor: 'Transcend Privacy Center' },
  { pattern: /wirewheel\.io/i, vendor: 'WireWheel Privacy Portal' },
  { pattern: /osano\.com/i, vendor: 'Osano DSAR Form' },
  { pattern: /datagrail\.io/i, vendor: 'DataGrail Request Form' },
  { pattern: /ketch\.com/i, vendor: 'Ketch Rights Portal' },
  { pattern: /bigid\.com/i, vendor: 'BigID Privacy Portal' },
  { pattern: /mineos\.ai|saymine\.com/i, vendor: 'MineOS DSAR Portal' },
];

/**
 * Common paths brokers use for arbitrarily-titled opt-out, suppression, and CCPA portals.
 */
export const COMMON_OPTOUT_PATHS: string[] = [
  '/optout',
  '/opt-out',
  '/remove',
  '/removal',
  '/do-not-sell',
  '/do-not-sell-my-info',
  '/do-not-sell-or-share',
  '/privacy-choices',
  '/your-privacy-choices',
  '/suppression',
  '/control',
  '/control/privacy',
  '/privacy-request',
  '/dsar',
  '/ccpa',
  '/ccpa-opt-out',
  '/privacy-center',
  '/remove-my-info',
  '/record-removal',
  '/delete-my-info',
  '/privacy',
  '/privacy-policy',
];

/**
 * SSRF guard for any URL crawled or submitted by server or client helpers.
 * Rejects loopback, private RFC1918 subnets, link-local / cloud metadata IPs, and non-HTTP(S) schemes.
 */
export function isSafePublicOptOutUrl(rawUrl: string): {
  valid: boolean;
  normalizedUrl: string;
  hostname: string;
  reason?: string;
} {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) {
    return { valid: false, normalizedUrl: '', hostname: '', reason: 'URL cannot be empty.' };
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    return { valid: false, normalizedUrl: '', hostname: '', reason: 'Malformed URL syntax.' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      valid: false,
      normalizedUrl: '',
      hostname: '',
      reason: 'Only http:// and https:// URLs are permitted.',
    };
  }

  if (parsed.username || parsed.password) {
    return {
      valid: false,
      normalizedUrl: '',
      hostname: '',
      reason: 'Embedded credentials in URLs are prohibited.',
    };
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    !host ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.arpa') ||
    !host.includes('.')
  ) {
    return {
      valid: false,
      normalizedUrl: '',
      hostname: host,
      reason: 'Local, internal, or unqualified hostnames are blocked.',
    };
  }

  // IPv6 loopback / unique-local / link-local block
  if (
    host === '::1' ||
    host === '0:0:0:0:0:0:0:1' ||
    host.startsWith('fc') ||
    host.startsWith('fd') ||
    host.startsWith('fe80') ||
    host.includes(':')
  ) {
    return {
      valid: false,
      normalizedUrl: '',
      hostname: host,
      reason: 'IPv6 literal targets are blocked for SSRF safety.',
    };
  }

  // IPv4 literal check
  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const octets = ipv4Match.slice(1).map((n) => parseInt(n, 10));
    if (octets.some((n) => n > 255)) {
      return { valid: false, normalizedUrl: '', hostname: host, reason: 'Invalid IPv4 address.' };
    }
    const [a, b] = octets;
    if (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    ) {
      return {
        valid: false,
        normalizedUrl: '',
        hostname: host,
        reason: 'Private, loopback, multicast, or cloud-metadata IPv4 ranges are blocked.',
      };
    }
  }

  parsed.hash = '';
  return {
    valid: true,
    normalizedUrl: parsed.toString(),
    hostname: host,
  };
}

export function extractRegistrableDomain(hostnameOrUrl: string): string {
  const check = isSafePublicOptOutUrl(hostnameOrUrl);
  const host = (check.valid ? check.hostname : hostnameOrUrl.trim().toLowerCase()).replace(/^www\./, '');
  const parts = host.split('.').filter(Boolean);
  if (parts.length <= 2) return parts.join('.');
  return parts.slice(-2).join('.');
}

function decodeHtmlEntities(input: string): string {
  if (!input) return '';
  return input
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_m, dec) => {
      const code = parseInt(dec, 10);
      return Number.isFinite(code) && code > 0 && code < 1114111 ? String.fromCodePoint(code) : '';
    });
}

function stripHtmlTags(raw: string): string {
  if (!raw) return '';
  return decodeHtmlEntities(
    raw
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function parseAttributes(tagOpen: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match: RegExpExecArray | null;
  let skippedTagName = false;
  while ((match = attrRegex.exec(tagOpen)) !== null) {
    const rawKey = match[1].toLowerCase();
    if (!skippedTagName && tagOpen.trimStart().toLowerCase().startsWith(`<${rawKey}`)) {
      skippedTagName = true;
      continue;
    }
    const rawVal = match[2] ?? match[3] ?? match[4] ?? '';
    attrs[rawKey] = decodeHtmlEntities(rawVal).trim();
  }
  return attrs;
}

/**
 * Scores any candidate URL + visible link text / page title against 60+ disguised
 * broker opt-out naming conventions ("Do Not Sell", "Your Privacy Choices",
 * "Control Center", "Suppression", "DSAR", "Remove My Listing", OneTrust, etc.).
 */
export function scoreOptOutLinkCandidate(params: {
  url: string;
  anchorText?: string;
  pageTitle?: string;
  headingText?: string;
  baseDomain?: string;
}): {
  score: number;
  signals: string[];
  isThirdPartyPortal: boolean;
  thirdPartyVendor?: string;
} {
  const check = isSafePublicOptOutUrl(params.url);
  if (!check.valid) {
    return { score: -100, signals: [], isThirdPartyPortal: false };
  }

  const lowerUrl = check.normalizedUrl.toLowerCase();
  let pathAndQuery = '';
  try {
    const u = new URL(check.normalizedUrl);
    pathAndQuery = `${u.pathname}${u.search}`.toLowerCase();
  } catch {
    pathAndQuery = lowerUrl;
  }

  // Reject static media, login-only, blog, or irrelevant commercial routes
  if (/\.(jpg|jpeg|png|gif|svg|webp|css|js|woff2?|ttf|ico|mp4|zip)(\?|$)/i.test(pathAndQuery)) {
    return { score: -100, signals: [], isThirdPartyPortal: false };
  }
  if (/\/(login|signin|sign-in|signup|register|cart|checkout|pricing|careers|jobs|press|affiliate)(\/|$)/i.test(pathAndQuery)) {
    return { score: -40, signals: [], isThirdPartyPortal: false };
  }

  let isThirdPartyPortal = false;
  let thirdPartyVendor: string | undefined;
  for (const v of THIRD_PARTY_PRIVACY_VENDORS) {
    if (v.pattern.test(lowerUrl)) {
      isThirdPartyPortal = true;
      thirdPartyVendor = v.vendor;
      break;
    }
  }

  // If off-domain and NOT a recognized third-party privacy/DSAR vendor or parent compliance domain, penalize
  if (params.baseDomain && !isThirdPartyPortal) {
    const candidateRoot = extractRegistrableDomain(check.hostname);
    const targetRoot = extractRegistrableDomain(params.baseDomain);
    if (
      candidateRoot !== targetRoot &&
      !/peopleconnect\.us|beenverified\.com|lexisnexis\.com|spokeo\.com|intelius\.com|radaris\.com|acxiom\.com/i.test(
        candidateRoot
      )
    ) {
      return { score: -50, signals: [], isThirdPartyPortal: false };
    }
  }

  const combinedText = `${params.anchorText || ''} ${params.pageTitle || ''} ${params.headingText || ''}`
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

  let score = 0;
  const signals: string[] = [];

  if (isThirdPartyPortal && thirdPartyVendor) {
    score += 78;
    signals.push(thirdPartyVendor);
  }

  // High-confidence URL slug patterns
  const highUrlPatterns: Array<[RegExp, number, string]> = [
    [/(opt-out|optout|opt_out)/i, 65, 'Opt-Out URL Slug'],
    [/(do-not-sell|donotsell|dnsmpi|do_not_sell)/i, 68, 'Do-Not-Sell URL'],
    [/(privacy-choices|your-privacy-choices|privacychoices)/i, 64, 'Privacy Choices URL'],
    [/(remove-my-info|record-removal|remove-info|profile-removal|removal-request|remove)/i, 58, 'Removal URL Slug'],
    [/(suppression|suppress|data-suppression)/i, 62, 'Suppression Tool URL'],
    [/(dsar|data-subject|privacy-request|consumer-request|delete-request|ccpa-request)/i, 64, 'DSAR Request URL'],
    [/(\/control\/privacy|\/control-center|\/manage-profile|\/claim-opt-out)/i, 56, 'Control Center URL'],
    [/(\/ccpa|\/cpra|\/gdpr|\/privacy-rights|\/california-privacy)/i, 45, 'Statutory Rights URL'],
  ];

  for (const [regex, pts, label] of highUrlPatterns) {
    if (regex.test(pathAndQuery)) {
      score += pts;
      signals.push(label);
    }
  }

  // High-confidence visible title / link anchor patterns (catches ANY page title!)
  const textPatterns: Array<[RegExp, number, string]> = [
    [/do not sell(\s+or\s+share)?(\s+my)?(\s+personal)?(\s+info|\s+information)?/i, 72, '"Do Not Sell/Share" Link'],
    [/your privacy choices|california privacy choices/i, 68, '"Your Privacy Choices" Title'],
    [/opt[\s-]?out/i, 64, '"Opt-Out" Title/Link'],
    [/(remove|delete|hide|suppress|expunge)\s+(my\s+)?(info|information|record|records|listing|profile|data|name)/i, 70, '"Remove/Delete My Data" Title'],
    [/(record|profile|data|public\s+record)\s+(removal|suppression|erasure|deletion)/i, 64, '"Record Suppression/Removal"'],
    [/(data\s+subject|dsar|consumer\s+rights|privacy\s+rights)\s*(request|form|portal|center)?/i, 56, '"Data Subject / Rights Portal"'],
    [/(control\s+center|suppression\s+center|privacy\s+center|preference\s+center)/i, 48, '"Privacy/Suppression Center"'],
    [/limit\s+the\s+use\s+of\s+my\s+sensitive\s+personal\s+information/i, 58, '"Limit Sensitive Data" Link'],
    [/(ccpa|cpra|tdpsa|delete\s+act)\s+(opt[\s-]?out|request|form|deletion)/i, 60, 'Statutory Deletion Form'],
  ];

  for (const [regex, pts, label] of textPatterns) {
    if (regex.test(combinedText)) {
      score += pts;
      if (!signals.includes(label)) {
        signals.push(label);
      }
    }
  }

  // Secondary crawlable policy pages (useful hop if primary opt-out link is buried inside Privacy Policy)
  if (score === 0) {
    if (/privacy[\s-]?policy|privacy[\s-]?notice|legal[\s-]?privacy/i.test(`${pathAndQuery} ${combinedText}`)) {
      score = 22;
      signals.push('Privacy Policy (Contains Opt-Out Instructions)');
    } else if (/\/privacy(\/|$)/i.test(pathAndQuery)) {
      score = 25;
      signals.push('Privacy Hub');
    }
  }

  return {
    score: Math.min(score, 100),
    signals,
    isThirdPartyPortal,
    thirdPartyVendor,
  };
}

/**
 * Extracts and ranks all candidate opt-out / privacy links from an HTML document.
 */
export function extractOptOutLinksFromHtml(
  html: string,
  pageBaseUrl: string,
  targetBrokerDomain?: string
): DiscoveredOptOutCandidate[] {
  const baseCheck = isSafePublicOptOutUrl(pageBaseUrl);
  if (!baseCheck.valid || !html) return [];

  const effectiveDomain = targetBrokerDomain || baseCheck.hostname;
  const byUrl = new Map<string, DiscoveredOptOutCandidate>();

  const anchorRegex = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchorRegex.exec(html)) !== null) {
    const attrs = parseAttributes(`<a ${match[1]}>`);
    const rawHref = attrs.href || '';
    if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('javascript:') || rawHref.startsWith('mailto:') || rawHref.startsWith('tel:')) {
      continue;
    }

    let resolvedUrl: string;
    try {
      resolvedUrl = new URL(rawHref, baseCheck.normalizedUrl).toString();
    } catch {
      continue;
    }

    const safeResolved = isSafePublicOptOutUrl(resolvedUrl);
    if (!safeResolved.valid) continue;

    const visibleText = stripHtmlTags(match[2]);
    const ariaOrTitle = [attrs['aria-label'], attrs.title].filter(Boolean).join(' ');
    const anchorLabel = (visibleText || ariaOrTitle || safeResolved.normalizedUrl).slice(0, 140);

    const scored = scoreOptOutLinkCandidate({
      url: safeResolved.normalizedUrl,
      anchorText: `${visibleText} ${ariaOrTitle}`.trim(),
      baseDomain: effectiveDomain,
    });

    if (scored.score < 20) continue;

    const existing = byUrl.get(safeResolved.normalizedUrl);
    if (!existing || scored.score > existing.score) {
      byUrl.set(safeResolved.normalizedUrl, {
        url: safeResolved.normalizedUrl,
        anchorText: anchorLabel,
        score: scored.score,
        signals: scored.signals,
        isThirdPartyPortal: scored.isThirdPartyPortal,
        thirdPartyVendor: scored.thirdPartyVendor,
        sourcePage: baseCheck.normalizedUrl,
      });
    }
  }

  // Also scan embedded iframe src URLs for OneTrust / TrustArc / Securiti privacy forms
  const iframeRegex = /<iframe\b([^>]*)>/gi;
  while ((match = iframeRegex.exec(html)) !== null) {
    const attrs = parseAttributes(`<iframe ${match[1]}>`);
    const rawSrc = attrs.src || '';
    if (!rawSrc) continue;
    let resolvedSrc = '';
    try {
      resolvedSrc = new URL(rawSrc, baseCheck.normalizedUrl).toString();
    } catch {
      continue;
    }
    const safeSrc = isSafePublicOptOutUrl(resolvedSrc);
    if (!safeSrc.valid) continue;

    const scored = scoreOptOutLinkCandidate({
      url: safeSrc.normalizedUrl,
      anchorText: `${attrs.title || ''} ${attrs['aria-label'] || ''}`,
      baseDomain: effectiveDomain,
    });

    if (scored.score >= 45 && !byUrl.has(safeSrc.normalizedUrl)) {
      byUrl.set(safeSrc.normalizedUrl, {
        url: safeSrc.normalizedUrl,
        anchorText: attrs.title || scored.thirdPartyVendor || 'Embedded Privacy Form',
        score: scored.score,
        signals: [...scored.signals, 'Embedded Form Iframe'],
        isThirdPartyPortal: scored.isThirdPartyPortal,
        thirdPartyVendor: scored.thirdPartyVendor,
        sourcePage: baseCheck.normalizedUrl,
      });
    }
  }

  return Array.from(byUrl.values()).sort((a, b) => b.score - a.score);
}

/**
 * Extracts opt-out / privacy URLs listed in sitemap.xml or robots.txt files.
 */
export function extractSitemapAndRobotsOptOutUrls(
  rawText: string,
  baseDomainUrl: string
): DiscoveredOptOutCandidate[] {
  const baseCheck = isSafePublicOptOutUrl(baseDomainUrl);
  if (!baseCheck.valid || !rawText) return [];

  const found = new Map<string, DiscoveredOptOutCandidate>();

  // 1. XML <loc>https://...</loc> entries
  const locRegex = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = locRegex.exec(rawText)) !== null) {
    const candidateCheck = isSafePublicOptOutUrl(decodeHtmlEntities(m[1]));
    if (!candidateCheck.valid) continue;
    const scored = scoreOptOutLinkCandidate({
      url: candidateCheck.normalizedUrl,
      baseDomain: baseCheck.hostname,
    });
    if (scored.score >= 35 && !found.has(candidateCheck.normalizedUrl)) {
      found.set(candidateCheck.normalizedUrl, {
        url: candidateCheck.normalizedUrl,
        anchorText: 'Sitemap Indexed Opt-Out URL',
        score: scored.score,
        signals: [...scored.signals, 'Sitemap XML'],
        isThirdPartyPortal: scored.isThirdPartyPortal,
        thirdPartyVendor: scored.thirdPartyVendor,
      });
    }
  }

  // 2. robots.txt Allow / Disallow paths (brokers very frequently Disallow: /optout or /suppression in robots.txt!)
  const lines = rawText.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    const allowOrDisallow = trimmed.match(/^(?:Allow|Disallow):\s*(\/[a-zA-Z0-9/_-]{3,80})/i);
    if (allowOrDisallow) {
      const cleanPath = allowOrDisallow[1].replace(/\*.*$/, '');
      if (!cleanPath || cleanPath === '/') continue;
      let resolved: string;
      try {
        resolved = new URL(cleanPath, baseCheck.normalizedUrl).toString();
      } catch {
        continue;
      }
      const safe = isSafePublicOptOutUrl(resolved);
      if (!safe.valid) continue;
      const scored = scoreOptOutLinkCandidate({
        url: safe.normalizedUrl,
        baseDomain: baseCheck.hostname,
      });
      if (scored.score >= 45 && !found.has(safe.normalizedUrl)) {
        found.set(safe.normalizedUrl, {
          url: safe.normalizedUrl,
          anchorText: `robots.txt Hidden Route (${cleanPath})`,
          score: scored.score,
          signals: [...scored.signals, 'Hidden in robots.txt'],
          isThirdPartyPortal: false,
        });
      }
    }
  }

  return Array.from(found.values()).sort((a, b) => b.score - a.score);
}

/**
 * Infers semantic consumer role for any arbitrary HTML input/select/textarea field.
 */
export function inferSemanticFieldRole(params: {
  name: string;
  id: string;
  inputType: string;
  label: string;
  placeholder: string;
  tag: 'input' | 'select' | 'textarea';
}): SemanticConsumerFieldRole {
  const inputType = (params.inputType || 'text').toLowerCase();
  if (inputType === 'hidden') return 'csrf_or_hidden';

  const haystack = `${params.name} ${params.id} ${params.label} ${params.placeholder}`
    .toLowerCase()
    .replace(/[_-]+/g, ' ');

  if (inputType === 'checkbox') {
    if (/agent|attorney|authorized|behalf/i.test(haystack)) {
      return 'authorized_agent';
    }
    return 'consent_checkbox';
  }

  if (inputType === 'email' || /\b(e[\s-]?mail|reply[\s-]?to|consumer[\s-]?email)\b/i.test(haystack)) {
    if (/\b(confirm|verify|repeat|retype)\b/i.test(haystack)) {
      return 'confirm_email';
    }
    return 'email';
  }

  if (
    inputType === 'url' ||
    /\b(profile[\s-]?url|record[\s-]?url|listing[\s-]?url|page[\s-]?url|link[\s-]?to[\s-]?profile|optout[\s-]?url|url)\b/i.test(
      haystack
    )
  ) {
    return 'record_url';
  }

  if (inputType === 'tel' || /\b(phone|telephone|mobile|cell|tel)\b/i.test(haystack)) {
    return 'phone';
  }

  if (/\b(first[\s-]?name|fname|given[\s-]?name|forename)\b/i.test(haystack)) {
    return 'first_name';
  }
  if (/\b(last[\s-]?name|lname|surname|family[\s-]?name)\b/i.test(haystack)) {
    return 'last_name';
  }
  if (/\b(middle[\s-]?name|mname|middle[\s-]?initial)\b/i.test(haystack)) {
    return 'middle_name';
  }
  if (/\b(full[\s-]?name|your[\s-]?name|consumer[\s-]?name|legal[\s-]?name|\bname\b)\b/i.test(haystack)) {
    return 'full_name';
  }

  if (/\b(zip|postal|postcode|zip[\s-]?code)\b/i.test(haystack)) {
    return 'zip';
  }
  if (/\b(street|address[\s-]?1|address[\s-]?line|mailing[\s-]?address|home[\s-]?address)\b/i.test(haystack)) {
    return 'street_address';
  }
  if (/\b(city|town|municipality)\b/i.test(haystack)) {
    return 'city';
  }
  if (/\b(state|province|region|jurisdiction)\b/i.test(haystack)) {
    return 'state';
  }

  if (/\b(birth[\s-]?year|year[\s-]?of[\s-]?birth|dob[\s-]?year|yob|dob|birth[\s-]?date)\b/i.test(haystack)) {
    return 'birth_year';
  }
  if (/\b(age|approx[\s-]?age)\b/i.test(haystack)) {
    return 'age';
  }

  if (/\b(request[\s-]?type|right[\s-]?type|action[\s-]?type|privacy[\s-]?choice|opt[\s-]?out[\s-]?type)\b/i.test(haystack)) {
    return 'request_type';
  }
  if (/\b(statute|law|regulation)\b/i.test(haystack)) {
    return 'statute';
  }

  if (
    params.tag === 'textarea' ||
    /\b(reason|message|details|comments|additional[\s-]?info|description|statement)\b/i.test(haystack)
  ) {
    return 'reason_message';
  }

  return 'unknown';
}

/**
 * Computes the exact suggested value from the user's profile for a semantic field role,
 * including intelligent `<select>` `<option>` matching (e.g. "CA" <-> "California").
 */
export function resolveProfileValueForField(
  role: SemanticConsumerFieldRole,
  options: ParsedFormFieldOption[],
  defaultRawValue: string,
  profile: UserProfile,
  senderEmail?: string,
  broker?: DataBroker
): string {
  const email = (senderEmail || profile.emails[0] || '').trim();
  const phone = (profile.phoneNumbers[0] || '').trim();
  const fullName = [profile.firstName, profile.middleName, profile.lastName]
    .filter(Boolean)
    .join(' ')
    .trim();
  const stateCode = (profile.currentState || 'CA').trim().toUpperCase();
  const stateFullName = US_STATE_NAMES[stateCode] || stateCode;
  const birthYear = (profile.birthYear || '').trim();
  const computedAge =
    birthYear && /^\d{4}$/.test(birthYear)
      ? String(Math.max(18, new Date().getFullYear() - parseInt(birthYear, 10)))
      : '';
  const recordUrl = broker
    ? getBrokerRecordSearchUrl(broker, profile)
    : `https://example.com/${encodeURIComponent(fullName)}`;

  if (role === 'csrf_or_hidden') {
    return defaultRawValue;
  }

  // Handle <select> option matching
  if (options.length > 0) {
    if (role === 'state') {
      const exactCode = options.find((o) => o.value.toUpperCase() === stateCode);
      if (exactCode) return exactCode.value;
      const byName = options.find(
        (o) =>
          o.label.toLowerCase().includes(stateFullName.toLowerCase()) ||
          o.value.toLowerCase() === stateFullName.toLowerCase()
      );
      if (byName) return byName.value;
    }

    if (role === 'request_type') {
      const deleteOpt = options.find((o) =>
        /delete|remove|erase|opt[\s-]?out|do\s+not\s+sell|suppress/i.test(`${o.label} ${o.value}`)
      );
      if (deleteOpt) return deleteOpt.value;
    }

    if (role === 'statute') {
      const ccpaOpt = options.find((o) => /ccpa|cpra|california|tdpsa|privacy/i.test(`${o.label} ${o.value}`));
      if (ccpaOpt) return ccpaOpt.value;
    }
  }

  switch (role) {
    case 'first_name':
      return profile.firstName || '';
    case 'last_name':
      return profile.lastName || '';
    case 'middle_name':
      return profile.middleName || '';
    case 'full_name':
      return fullName;
    case 'email':
    case 'confirm_email':
      return email;
    case 'phone':
      return phone;
    case 'city':
      return profile.currentCity || '';
    case 'state':
      return stateCode;
    case 'zip':
      return profile.currentZip || '';
    case 'street_address':
      return (
        profile.currentStreet ||
        [profile.currentCity, stateCode, profile.currentZip].filter(Boolean).join(', ')
      );
    case 'birth_year':
      return birthYear;
    case 'age':
      return computedAge;
    case 'record_url':
      return recordUrl;
    case 'request_type':
      return 'Delete My Personal Information & Opt Out of Sale/Sharing';
    case 'statute':
      return 'CCPA / CPRA (Cal. Civ. Code § 1798.105 & § 1798.120)';
    case 'reason_message':
      return `Pursuant to CCPA/CPRA (Cal. Civ. Code § 1798.105 & § 1798.120) and applicable state privacy statutes, please permanently delete all personal records and opt out of the sale or sharing of data associated with ${fullName} (${profile.currentCity}, ${stateCode}).`;
    case 'consent_checkbox':
      return 'true';
    case 'authorized_agent':
      return profile.powerOfAttorney?.isSigned ? 'true' : 'false';
    default:
      return defaultRawValue;
  }
}

export function detectAntiBotGate(html: string, httpStatus = 200): {
  gate: AntiBotGateType;
  summary: string;
} {
  const lower = (html || '').toLowerCase();

  if (
    httpStatus === 403 ||
    httpStatus === 503 ||
    /cf-browser-verification|cf-chl-bypass|just a moment\.\.\.|attention required! \| cloudflare|__cf_chl_opt/i.test(
      html
    )
  ) {
    return {
      gate: 'cloudflare_challenge',
      summary:
        'Protected by Cloudflare / WAF challenge against datacenter IPs. Open in your browser and run the 1-Click synOUT Auto-Fill Bookmarklet.',
    };
  }

  if (/cf-turnstile|challenges\.cloudflare\.com\/turnstile/i.test(lower)) {
    return {
      gate: 'turnstile',
      summary:
        'Form includes a Cloudflare Turnstile widget. Use the 1-Click Auto-Fill Bookmarklet in your browser, check Turnstile, and click Submit.',
    };
  }

  if (/g-recaptcha|google\.com\/recaptcha|recaptcha\/api\.js/i.test(lower)) {
    return {
      gate: 'recaptcha',
      summary:
        'Form includes Google reCAPTCHA. Use the 1-Click Auto-Fill Bookmarklet to populate all fields instantly, then complete the CAPTCHA.',
    };
  }

  if (/h-captcha|hcaptcha\.com\/1\/api\.js/i.test(lower)) {
    return {
      gate: 'hcaptcha',
      summary:
        'Form includes hCaptcha verification. Use the 1-Click Auto-Fill Bookmarklet to populate all fields, then check hCaptcha.',
    };
  }

  if (/verification\s+link|confirm\s+your\s+email|click\s+the\s+link\s+in\s+the\s+email/i.test(lower)) {
    return {
      gate: 'email_verification',
      summary:
        'Broker sends a confirmation link to your email after form submission. After submitting, paste their email into Reply Triage to strip trackers safely.',
    };
  }

  if (
    !/<form\b/i.test(lower) &&
    (/id="__next"|id="root"|id="app"|data-reactroot|ng-version/i.test(lower))
  ) {
    return {
      gate: 'spa_dynamic',
      summary:
        'Client-rendered JavaScript app (React/Next/SPA). Open the page and click the synOUT Auto-Fill Bookmarklet to populate dynamic inputs.',
    };
  }

  return {
    gate: 'none',
    summary: 'Standard HTML form detected with no interactive CAPTCHA blocker.',
  };
}

function extractLabelsMap(html: string): Map<string, string> {
  const labelsByFor = new Map<string, string>();
  const labelRegex = /<label\b([^>]*)>([\s\S]*?)<\/label>/gi;
  let m: RegExpExecArray | null;
  while ((m = labelRegex.exec(html)) !== null) {
    const attrs = parseAttributes(`<label ${m[1]}>`);
    const forId = attrs.for || '';
    const text = stripHtmlTags(m[2]);
    if (forId && text) {
      labelsByFor.set(forId, text.slice(0, 120));
    }
  }
  return labelsByFor;
}

function parseFieldsInsideFragment(
  fragmentHtml: string,
  labelsByFor: Map<string, string>,
  profile?: UserProfile,
  senderEmail?: string,
  broker?: DataBroker
): { fields: ParsedOptOutFormField[]; submitButtonLabel: string } {
  const fields: ParsedOptOutFormField[] = [];
  let submitButtonLabel = 'Submit Opt-Out Request';

  // Extract submit button label if present
  const buttonRegex = /<button\b([^>]*)>([\s\S]*?)<\/button>/gi;
  let btnMatch: RegExpExecArray | null;
  while ((btnMatch = buttonRegex.exec(fragmentHtml)) !== null) {
    const attrs = parseAttributes(`<button ${btnMatch[1]}>`);
    const type = (attrs.type || 'submit').toLowerCase();
    const label = stripHtmlTags(btnMatch[2]);
    if (type === 'submit' && label) {
      submitButtonLabel = label.slice(0, 60);
      break;
    }
  }

  const controlRegex =
    /<(input|textarea|select)\b([^>]*)(?:>([\s\S]*?)<\/\1>|\/?>)/gi;
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = controlRegex.exec(fragmentHtml)) !== null) {
    const tag = match[1].toLowerCase() as 'input' | 'select' | 'textarea';
    const attrs = parseAttributes(`<${tag} ${match[2]}>`);
    const innerHtml = match[3] || '';
    const inputType = tag === 'input' ? (attrs.type || 'text').toLowerCase() : tag;

    if (inputType === 'submit' || inputType === 'button' || inputType === 'reset' || inputType === 'image') {
      if (inputType === 'submit' && attrs.value) {
        submitButtonLabel = attrs.value.slice(0, 60);
      }
      continue;
    }

    const name = attrs.name || '';
    const id = attrs.id || '';
    if (!name && !id && inputType === 'hidden') continue;

    // Ignore sitewide header search bars
    if (
      inputType === 'search' ||
      (/^(q|s|search|query)$/i.test(name) && !/opt|remove|record|person/i.test(`${id} ${attrs.placeholder || ''}`))
    ) {
      continue;
    }

    const label =
      (id && labelsByFor.get(id)) ||
      attrs['aria-label'] ||
      attrs.placeholder ||
      name ||
      id ||
      `Field ${idx + 1}`;
    const placeholder = attrs.placeholder || '';
    const required = 'required' in attrs || attrs['aria-required'] === 'true';

    const options: ParsedFormFieldOption[] = [];
    if (tag === 'select' && innerHtml) {
      const optRegex = /<option\b([^>]*)>([\s\S]*?)<\/option>/gi;
      let optMatch: RegExpExecArray | null;
      while ((optMatch = optRegex.exec(innerHtml)) !== null) {
        const optAttrs = parseAttributes(`<option ${optMatch[1]}>`);
        const optLabel = stripHtmlTags(optMatch[2]);
        const optVal = optAttrs.value !== undefined ? optAttrs.value : optLabel;
        if (optVal || optLabel) {
          options.push({
            value: optVal.slice(0, 120),
            label: (optLabel || optVal).slice(0, 120),
          });
        }
      }
    }

    const defaultRawValue =
      tag === 'textarea' ? stripHtmlTags(innerHtml) : attrs.value || '';

    const semanticRole = inferSemanticFieldRole({
      name,
      id,
      inputType,
      label,
      placeholder,
      tag,
    });

    const suggestedValue = profile
      ? resolveProfileValueForField(
          semanticRole,
          options,
          defaultRawValue,
          profile,
          senderEmail,
          broker
        )
      : defaultRawValue;

    fields.push({
      key: `${name || id || 'field'}_${idx}`,
      name: name || id || `field_${idx}`,
      id,
      tag,
      inputType,
      label: label.slice(0, 100),
      placeholder: placeholder.slice(0, 100),
      required,
      options,
      semanticRole,
      suggestedValue,
      defaultRawValue,
    });

    idx++;
  }

  return { fields, submitButtonLabel };
}

/**
 * Inspects raw HTML from any opt-out page (fetched server-side OR pasted client-side),
 * extracting page title, headings, anti-bot gates, HTML forms, SPA input groups, and embedded links.
 */
export function inspectRawOptOutHtml(params: {
  html: string;
  pageUrl: string;
  finalUrl?: string;
  httpStatus?: number;
  profile?: UserProfile;
  senderEmail?: string;
  broker?: DataBroker;
}): OptOutPageInspection {
  const safeBase = isSafePublicOptOutUrl(params.finalUrl || params.pageUrl);
  const resolvedPageUrl = safeBase.valid ? safeBase.normalizedUrl : params.pageUrl;
  const html = params.html || '';
  const httpStatus = params.httpStatus ?? 200;

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
  const metaDescMatch = html.match(
    /<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i
  );

  const pageTitle = titleMatch ? stripHtmlTags(titleMatch[1]).slice(0, 160) : '';
  const primaryHeading = h1Match ? stripHtmlTags(h1Match[1]).slice(0, 160) : '';
  const metaDescription = metaDescMatch ? decodeHtmlEntities(metaDescMatch[1]).trim().slice(0, 220) : '';

  const antiBot = detectAntiBotGate(html, httpStatus);
  const gpcSupportedHint = /global\s+privacy\s+control|sec-gpc|gpc\s+signal/i.test(html);
  const labelsByFor = extractLabelsMap(html);

  const forms: ParsedOptOutForm[] = [];
  const formRegex = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
  let formMatch: RegExpExecArray | null;
  let formIndex = 0;

  while ((formMatch = formRegex.exec(html)) !== null) {
    const attrs = parseAttributes(`<form ${formMatch[1]}>`);
    const innerHtml = formMatch[2] || '';
    const rawAction = attrs.action || resolvedPageUrl;
    let actionUrl = resolvedPageUrl;
    try {
      actionUrl = new URL(rawAction, resolvedPageUrl).toString();
    } catch {
      actionUrl = resolvedPageUrl;
    }

    const method = (attrs.method || 'POST').toUpperCase() === 'GET' ? 'GET' : 'POST';
    const enctype = attrs.enctype || 'application/x-www-form-urlencoded';
    const { fields, submitButtonLabel } = parseFieldsInsideFragment(
      innerHtml,
      labelsByFor,
      params.profile,
      params.senderEmail,
      params.broker
    );

    if (fields.length === 0) continue;

    const visibleConsumerFields = fields.filter(
      (f) => f.semanticRole !== 'csrf_or_hidden' && f.semanticRole !== 'unknown'
    );
    const formContextText = `${attrs.id || ''} ${attrs.name || ''} ${attrs.action || ''} ${submitButtonLabel} ${stripHtmlTags(innerHtml).slice(0, 500)}`;

    let relevanceScore = visibleConsumerFields.length * 16;
    if (/opt[\s-]?out|remove|delete|suppress|privacy|ccpa|dsar|do[\s-]?not[\s-]?sell/i.test(formContextText)) {
      relevanceScore += 45;
    }
    if (/login|signin|newsletter|subscribe/i.test(`${attrs.id || ''} ${attrs.action || ''} ${submitButtonLabel}`)) {
      relevanceScore -= 35;
    }

    forms.push({
      formIndex,
      formId: attrs.id || undefined,
      formName: attrs.name || undefined,
      actionUrl,
      method,
      enctype,
      submitButtonLabel,
      isLikelyOptOutForm: relevanceScore >= 25 || visibleConsumerFields.length >= 2,
      relevanceScore: Math.max(0, Math.min(100, relevanceScore)),
      fields,
    });

    formIndex++;
  }

  // Fallback for SPA / custom web components where <input>/<select>/<textarea> exist outside <form>
  if (forms.length === 0) {
    const spaParsed = parseFieldsInsideFragment(
      html,
      labelsByFor,
      params.profile,
      params.senderEmail,
      params.broker
    );
    const visibleFields = spaParsed.fields.filter((f) => f.semanticRole !== 'csrf_or_hidden');
    if (visibleFields.length > 0) {
      forms.push({
        formIndex: 0,
        actionUrl: resolvedPageUrl,
        method: 'POST',
        enctype: 'application/x-www-form-urlencoded',
        submitButtonLabel: spaParsed.submitButtonLabel,
        isLikelyOptOutForm: true,
        relevanceScore: Math.min(95, visibleFields.length * 18 + 25),
        fields: spaParsed.fields,
      });
    }
  }

  forms.sort((a, b) => b.relevanceScore - a.relevanceScore);

  const embeddedLinks = extractOptOutLinksFromHtml(
    html,
    resolvedPageUrl,
    params.broker?.domain
  );

  const primaryForm = forms[0];
  const directRelayEligible = Boolean(
    httpStatus >= 200 &&
      httpStatus < 400 &&
      primaryForm &&
      primaryForm.isLikelyOptOutForm &&
      isSafePublicOptOutUrl(primaryForm.actionUrl).valid &&
      (antiBot.gate === 'none' || antiBot.gate === 'email_verification')
  );

  return {
    url: params.pageUrl,
    finalUrl: resolvedPageUrl,
    httpStatus,
    pageTitle: pageTitle || primaryHeading || resolvedPageUrl,
    primaryHeading,
    metaDescription,
    antiBotGate: antiBot.gate,
    antiBotSummary: antiBot.summary,
    gpcSupportedHint,
    forms,
    embeddedLinks,
    directRelayEligible,
  };
}

/**
 * Classifies how a broker handles removals so the UI can guide the user clearly:
 * - Web Form Primary (Online Form / portal_primary)
 * - Dual-Channel Recommended (both Form + Statutory Email)
 * - Email CCPA Demand Primary
 * - Written / Phone
 */
export function classifyBrokerChannelStrategy(broker: DataBroker): {
  strategy: OptOutChannelStrategy;
  shortBadge: string;
  explanation: string;
} {
  if (broker.removalMethod === 'Mail-In' || broker.removalMethod === 'Phone') {
    return {
      strategy: 'written_or_phone',
      shortBadge: broker.removalMethod,
      explanation: `${broker.name} requires ${broker.removalMethod.toLowerCase()} verification alongside written statutory notice.`,
    };
  }

  if (
    broker.removalMethod === 'Online Form' ||
    broker.emailDeliverability === 'portal_primary' ||
    !broker.privacyEmail
  ) {
    if (broker.privacyEmail) {
      return {
        strategy: 'dual_channel_recommended',
        shortBadge: 'Web Form + Email',
        explanation: `${broker.name} uses an online opt-out form for automated database suppression while accepting statutory CCPA/CPRA emails (${broker.privacyEmail}) to start the 45-day legal clock.`,
      };
    }
    return {
      strategy: 'web_form_required',
      shortBadge: 'Web Form Required',
      explanation: `${broker.name} processes removals exclusively through its web opt-out form.`,
    };
  }

  if (broker.optOutUrl && broker.privacyEmail) {
    return {
      strategy: 'dual_channel_recommended',
      shortBadge: 'Email + Web Portal',
      explanation: `Supports direct CCPA/CPRA email deletion demands and hosts an online privacy portal.`,
    };
  }

  return {
    strategy: 'email_primary',
    shortBadge: 'Email Demand',
    explanation: `Processes statutory deletion demands via compliance email (${broker.privacyEmail}).`,
  };
}

/**
 * Checks whether a ScanResult has a recorded web-form opt-out submission.
 */
export function hasWebFormSubmission(result: ScanResult): boolean {
  if (result.webFormSubmittedAtIso || result.webFormConfirmationCode) {
    return true;
  }
  const code = result.optOutConfirmationCode || '';
  return code.startsWith('DIY-FORM-') || code.startsWith('WEBFORM-') || code.startsWith('SUBMIT-');
}

/**
 * Builds targeted search-engine discovery dorks to uncover hidden or arbitrarily-titled
 * opt-out pages on any broker domain (even when WAF/Cloudflare blocks automated spiders).
 */
export function buildDisguisedOptOutSearchQueries(domainOrUrl: string): DisguisedOptOutSearchDork[] {
  const safe = isSafePublicOptOutUrl(domainOrUrl);
  const cleanDomain = (safe.valid ? safe.hostname : domainOrUrl.trim().toLowerCase()).replace(
    /^www\./,
    ''
  );

  const rawDorks = [
    {
      id: 'disguised-titles',
      label: 'Any-Title Opt-Out & "Privacy Choices" Finder',
      description:
        'Finds pages titled "Do Not Sell", "Your Privacy Choices", "Remove My Info", "Suppression", or "Opt Out".',
      query: `site:${cleanDomain} ("opt out" OR "opt-out" OR "do not sell" OR "privacy choices" OR "remove my" OR "suppression")`,
    },
    {
      id: 'url-slug-hunter',
      label: 'Hidden Opt-Out Form URL Slug Hunter',
      description:
        'Locates live form routes (/optout, /remove, /suppression, /dsar, /privacy-choices, /control) indexed by search engines.',
      query: `site:${cleanDomain} (inurl:optout OR inurl:opt-out OR inurl:remove OR inurl:suppression OR inurl:dsar OR inurl:privacy-choices)`,
    },
    {
      id: 'third-party-dsar',
      label: 'External OneTrust / TrustArc / Securiti Portal Finder',
      description:
        'Discovers off-domain DSAR forms hosted for this broker on OneTrust, TrustArc, Securiti, Transcend, or DataGrail.',
      query: `"${cleanDomain}" (site:onetrust.com OR site:truste.com OR site:securiti.ai OR site:transcend.io OR site:datagrail.io)`,
    },
    {
      id: 'policy-anchor',
      label: 'Privacy Policy Section § CCPA Deletion Clause',
      description:
        'Jumps straight to the paragraph inside their Privacy Policy where they disclose their mandatory CCPA deletion link.',
      query: `site:${cleanDomain} ("1798.105" OR "California residents" OR "right to delete" OR "deletion request")`,
    },
  ];

  return rawDorks.map((d) => {
    const enc = encodeURIComponent(d.query);
    return {
      ...d,
      googleUrl: `https://www.google.com/search?q=${enc}`,
      duckDuckGoUrl: `https://duckduckgo.com/?q=${enc}`,
      bingUrl: `https://www.bing.com/search?q=${enc}`,
      braveUrl: `https://search.brave.com/search?q=${enc}`,
    };
  });
}

/**
 * Generates a self-contained Universal Browser Auto-Fill JavaScript snippet (and bookmarklet)
 * that fills arbitrary HTML, React, Vue, Angular, OneTrust, and TrustArc opt-out forms on ANY page.
 */
export function buildUniversalAutoFillScript(
  profile: UserProfile,
  senderEmail?: string,
  broker?: DataBroker
): string {
  const email = (senderEmail || profile.emails[0] || '').trim();
  const phone = (profile.phoneNumbers[0] || '').trim();
  const firstName = (profile.firstName || '').trim();
  const lastName = (profile.lastName || '').trim();
  const middleName = (profile.middleName || '').trim();
  const fullName = [firstName, middleName, lastName].filter(Boolean).join(' ').trim();
  const city = (profile.currentCity || '').trim();
  const stateCode = (profile.currentState || 'CA').trim().toUpperCase();
  const stateName = US_STATE_NAMES[stateCode] || stateCode;
  const zip = (profile.currentZip || '').trim();
  const street =
    (profile.currentStreet || '').trim() ||
    [city, stateCode, zip].filter(Boolean).join(', ');
  const birthYear = (profile.birthYear || '').trim();
  const age =
    birthYear && /^\d{4}$/.test(birthYear)
      ? String(Math.max(18, new Date().getFullYear() - parseInt(birthYear, 10)))
      : '';
  const recordUrl = broker ? getBrokerRecordSearchUrl(broker, profile) : '';
  const reason = `Statutory CCPA/CPRA deletion & opt-out of sale/sharing demand for ${fullName} (${city}, ${stateCode}) pursuant to Cal. Civ. Code § 1798.105 & § 1798.120.`;

  const payloadJson = JSON.stringify({
    firstName,
    lastName,
    middleName,
    fullName,
    email,
    phone,
    city,
    stateCode,
    stateName,
    zip,
    street,
    birthYear,
    age,
    recordUrl,
    reason,
  });

  // Clean, compact, dependency-free DOM + React native-value-setter auto-filler
  return `(function(){
  const d = ${payloadJson};
  const setVal = (el, val) => {
    if (!val && val !== '') return false;
    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) { desc.set.call(el, val); } else { el.value = val; }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
    el.style.outline = '2px solid #10b981';
    return true;
  };
  const labelFor = (el) => {
    if (el.id) {
      const lb = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if (lb) return lb.innerText || '';
    }
    const parentLb = el.closest('label');
    return parentLb ? (parentLb.innerText || '') : '';
  };
  let filled = 0;
  document.querySelectorAll('input, textarea, select').forEach((el) => {
    if (el.disabled || el.readOnly) return;
    const t = (el.type || '').toLowerCase();
    if (['hidden','submit','button','reset','file','image','search'].includes(t)) return;
    const h = [el.name, el.id, el.placeholder, el.getAttribute('aria-label'), labelFor(el)].filter(Boolean).join(' ').toLowerCase().replace(/[_-]+/g,' ');
    if (el.tagName === 'SELECT') {
      const opts = Array.from(el.options || []);
      let pick = null;
      if (/\\b(state|province|region|jurisdiction)\\b/.test(h)) {
        pick = opts.find(o => o.value.toUpperCase() === d.stateCode || o.text.toLowerCase().includes(d.stateName.toLowerCase()));
      } else if (/\\b(request|type|right|action|topic)\\b/.test(h)) {
        pick = opts.find(o => /delete|remove|erase|opt[\\s-]?out|do not sell|suppress/i.test(o.text + ' ' + o.value));
      }
      if (pick) {
        el.value = pick.value;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.style.outline = '2px solid #10b981';
        filled++;
      }
      return;
    }
    if (t === 'checkbox') {
      if (/confirm|agree|certify|declare|accurate|perjury|privacy|resident|delete|opt[\\s-]?out/i.test(h) && !/subscribe|marketing|newsletter|promo/i.test(h)) {
        if (!el.checked) { el.click(); el.style.outline = '2px solid #10b981'; filled++; }
      }
      return;
    }
    if (t === 'radio') {
      if (/delete|remove|opt[\\s-]?out|do not sell|suppress|consumer/i.test(h + ' ' + el.value) && !/agent/i.test(h)) {
        if (!el.checked) { el.click(); filled++; }
      }
      return;
    }
    if (t === 'email' || /\\b(e?mail)\\b/.test(h)) { if (d.email && setVal(el, d.email)) filled++; return; }
    if (t === 'tel' || /\\b(phone|mobile|cell|tel)\\b/.test(h)) { if (d.phone && setVal(el, d.phone)) filled++; return; }
    if (t === 'url' || /\\b(url|link|listing|profile)\\b/.test(h)) { if (d.recordUrl && setVal(el, d.recordUrl)) filled++; return; }
    if (/\\b(first\\s*name|fname|given)\\b/.test(h)) { if (d.firstName && setVal(el, d.firstName)) filled++; return; }
    if (/\\b(last\\s*name|lname|surname|family)\\b/.test(h)) { if (d.lastName && setVal(el, d.lastName)) filled++; return; }
    if (/\\b(middle\\s*name|mname)\\b/.test(h)) { if (d.middleName && setVal(el, d.middleName)) filled++; return; }
    if (/\\b(full\\s*name|your\\s*name|consumer\\s*name|\\bname\\b)\\b/.test(h)) { if (d.fullName && setVal(el, d.fullName)) filled++; return; }
    if (/\\b(zip|postal)\\b/.test(h)) { if (d.zip && setVal(el, d.zip)) filled++; return; }
    if (/\\b(street|mailing\\s*address|home\\s*address|address)\\b/.test(h) && !/email/.test(h)) { if (d.street && setVal(el, d.street)) filled++; return; }
    if (/\\b(city|town)\\b/.test(h)) { if (d.city && setVal(el, d.city)) filled++; return; }
    if (/\\b(state|region)\\b/.test(h)) { if (d.stateCode && setVal(el, d.stateCode)) filled++; return; }
    if (/\\b(birth\\s*year|yob|dob)\\b/.test(h)) { if (d.birthYear && setVal(el, d.birthYear)) filled++; return; }
    if (/\\b(age)\\b/.test(h)) { if (d.age && setVal(el, d.age)) filled++; return; }
    if (el.tagName === 'TEXTAREA' || /\\b(reason|message|details|comment|request)\\b/.test(h)) { if (setVal(el, d.reason)) filled++; return; }
  });
  const badge = document.createElement('div');
  badge.textContent = 'synOUT Auto-Filled ' + filled + ' Opt-Out Field(s) — Review & Submit';
  badge.style.cssText = 'position:fixed;bottom:18px;right:18px;z-index:2147483647;background:#022c22;color:#6ee7b7;border:1px solid #10b981;padding:10px 16px;border-radius:10px;font:600 13px/1.4 monospace;box-shadow:0 10px 25px rgba(0,0,0,.45)';
  document.body.appendChild(badge);
  setTimeout(() => badge.remove(), 6500);
})();`;
}

export function buildAutoFillBookmarkletHref(
  profile: UserProfile,
  senderEmail?: string,
  broker?: DataBroker
): string {
  const script = buildUniversalAutoFillScript(profile, senderEmail, broker)
    .replace(/\r?\n\s*/g, ' ')
    .trim();
  return `javascript:${encodeURIComponent(script)}`;
}
