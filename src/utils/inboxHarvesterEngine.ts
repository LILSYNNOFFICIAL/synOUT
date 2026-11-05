import { DataBroker } from '../types';
import { getExhaustiveBrokerRegistry } from './dynamicBrokerRegistry';
import { analyzeBrokerReplyEmail, sanitizeTrackingUrl } from './replyTriageEngine';

export type HarvestedItemClassification =
  | 'verification_link_ready'
  | 'removal_confirmed'
  | 'ticket_acknowledged'
  | 'more_info_requested'
  | 'delivery_bounce';

export interface SafeHarvestedLink {
  originalUrl: string;
  sanitizedUrl: string;
  host: string;
  trustedReason: 'exact_broker_domain' | 'broker_parent_network' | 'trusted_privacy_processor';
}

export interface HarvestedBrokerInboxItem {
  id: string;
  messageId: string;
  threadId?: string;
  broker: DataBroker | null;
  matchedDomain: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
  classification: HarvestedItemClassification;
  extractedTicketId: string | null;
  safeVerificationLinks: SafeHarvestedLink[];
  rejectedLinksCount: number;
  bouncedAddresses: string[];
  recommendedActionLabel: string;
}

const TRUSTED_PRIVACY_PROCESSORS = [
  'privacyportal.onetrust.com',
  'onetrust.com',
  'osano.com',
  'trustarc.com',
  'wirewheel.io',
  'ketch.com',
  'transcend.io',
  'datagrail.io',
  'securiti.ai',
  'mineportal.io',
  'suppression.peopleconnect.us',
  'peopleconnect.us',
  'beenverified.com',
];

function extractRegistrableHost(rawHostOrUrl: string): string {
  const cleaned = (rawHostOrUrl || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .split(':')[0];
  const parts = cleaned.split('.').filter(Boolean);
  if (parts.length <= 2) return cleaned;
  return parts.slice(-2).join('.');
}

function isPrivateOrLocalHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (
    h === 'localhost' ||
    h.endsWith('.local') ||
    h.endsWith('.internal') ||
    h === '127.0.0.1' ||
    h === '0.0.0.0' ||
    h === '::1'
  ) {
    return true;
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    const octets = h.split('.').map((n) => parseInt(n, 10));
    if (
      octets[0] === 10 ||
      octets[0] === 127 ||
      (octets[0] === 169 && octets[1] === 254) ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Validates that an extracted email link is a legitimate HTTPS opt-out confirmation URL
 * belonging to the broker, its parent network, or an accredited privacy DSAR processor,
 * and never a marketing newsletter unsubscribe link or private IP.
 */
export function verifyHarvesterLinkSafety(
  rawUrl: string,
  broker: DataBroker | null,
  senderDomainHint?: string
): SafeHarvestedLink | null {
  try {
    const cleaned = rawUrl.replace(/[),.;>'"]+$/g, '').trim();
    const sanitized = sanitizeTrackingUrl(cleaned).sanitizedUrl;
    const parsed = new URL(sanitized);

    if (parsed.protocol !== 'https:') return null;
    if (parsed.username || parsed.password) return null;
    if (isPrivateOrLocalHostname(parsed.hostname)) return null;

    const fullLower = sanitized.toLowerCase();

    // Reject generic social/footer/unsubscribe-newsletter links
    if (
      /\b(facebook\.com|twitter\.com|x\.com|linkedin\.com|instagram\.com|youtube\.com|google\.com\/maps|apple\.com)\b/i.test(
        parsed.hostname
      )
    ) {
      return null;
    }
    if (
      /\b(newsletter|promotional|email-preferences|manage-subscriptions)\b/i.test(fullLower) &&
      !/\b(optout|opt-out|suppress|dsar|privacy|delete|removal|verify|confirm)\b/i.test(fullLower)
    ) {
      return null;
    }

    // Require confirmation/verification/opt-out intent in path or query
    const hasVerificationIntent =
      /\b(confirm|verify|token|optout|opt-out|opt_out|removal|remove|suppress|delete|dsar|request|activate|privacy)\b/i.test(
        `${parsed.pathname}${parsed.search}`
      );
    if (!hasVerificationIntent) return null;

    const hostReg = extractRegistrableHost(parsed.hostname);
    const brokerReg = broker ? extractRegistrableHost(broker.domain) : '';
    const optOutReg = broker?.optOutUrl ? extractRegistrableHost(broker.optOutUrl) : '';
    const senderReg = senderDomainHint ? extractRegistrableHost(senderDomainHint) : '';

    if (brokerReg && (hostReg === brokerReg || parsed.hostname.endsWith(`.${brokerReg}`))) {
      return {
        originalUrl: cleaned,
        sanitizedUrl: sanitized,
        host: parsed.hostname,
        trustedReason: 'exact_broker_domain',
      };
    }

    if (optOutReg && (hostReg === optOutReg || parsed.hostname.endsWith(`.${optOutReg}`))) {
      return {
        originalUrl: cleaned,
        sanitizedUrl: sanitized,
        host: parsed.hostname,
        trustedReason: 'broker_parent_network',
      };
    }

    if (
      TRUSTED_PRIVACY_PROCESSORS.some(
        (tp) => parsed.hostname === tp || parsed.hostname.endsWith(`.${tp}`) || hostReg === tp
      )
    ) {
      return {
        originalUrl: cleaned,
        sanitizedUrl: sanitized,
        host: parsed.hostname,
        trustedReason: 'trusted_privacy_processor',
      };
    }

    if (!broker && senderReg && hostReg === senderReg) {
      return {
        originalUrl: cleaned,
        sanitizedUrl: sanitized,
        host: parsed.hostname,
        trustedReason: 'exact_broker_domain',
      };
    }

    return null;
  } catch {
    return null;
  }
}

export function matchBrokerFromEmailHeaders(
  fromHeader: string,
  subjectHeader: string,
  bodyText: string,
  brokersPool?: DataBroker[]
): { broker: DataBroker | null; matchedDomain: string } {
  const pool = brokersPool || getExhaustiveBrokerRegistry();
  const emailMatch = fromHeader.match(/@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/);
  const senderDomain = emailMatch ? extractRegistrableHost(emailMatch[1]) : '';
  const combinedLower = `${fromHeader} ${subjectHeader} ${bodyText.slice(0, 2000)}`.toLowerCase();

  if (senderDomain && !['gmail.com', 'googlemail.com', 'outlook.com', 'yahoo.com'].includes(senderDomain)) {
    const direct = pool.find(
      (b) =>
        extractRegistrableHost(b.domain) === senderDomain ||
        extractRegistrableHost(b.optOutUrl) === senderDomain ||
        extractRegistrableHost(b.privacyEmail.split('@')[1] || '') === senderDomain
    );
    if (direct) {
      return { broker: direct, matchedDomain: direct.domain };
    }
  }

  // Secondary match (e.g., Mailer-Daemon bounce or OneTrust notification mentioning the broker domain/name)
  for (const b of pool) {
    const dom = b.domain.toLowerCase();
    if (combinedLower.includes(dom) || combinedLower.includes(b.privacyEmail.toLowerCase())) {
      return { broker: b, matchedDomain: b.domain };
    }
  }

  return { broker: null, matchedDomain: senderDomain || 'unknown-sender' };
}

export function harvestBrokerEmailPayload(params: {
  id: string;
  messageId: string;
  threadId?: string;
  from: string;
  subject: string;
  date: string;
  bodyText: string;
  snippet?: string;
  brokersPool?: DataBroker[];
}): HarvestedBrokerInboxItem {
  const pool = params.brokersPool || getExhaustiveBrokerRegistry();
  const { broker, matchedDomain } = matchBrokerFromEmailHeaders(
    params.from,
    params.subject,
    params.bodyText,
    pool
  );

  const rawCombined = `From: ${params.from}\nSubject: ${params.subject}\n\n${params.bodyText}`;
  const triage = analyzeBrokerReplyEmail(rawCombined, broker || undefined);

  const urlMatches = params.bodyText.match(/https?:\/\/[^\s"'<>)\]]+/gi) || [];
  const uniqueUrls = Array.from(new Set(urlMatches));

  const safeLinks: SafeHarvestedLink[] = [];
  const seenSanitized = new Set<string>();
  let rejectedLinksCount = 0;

  for (const rawUrl of uniqueUrls) {
    const safe = verifyHarvesterLinkSafety(rawUrl, broker, matchedDomain);
    if (safe) {
      if (!seenSanitized.has(safe.sanitizedUrl)) {
        seenSanitized.add(safe.sanitizedUrl);
        safeLinks.push(safe);
      }
    } else {
      rejectedLinksCount++;
    }
  }

  let classification: HarvestedItemClassification = 'ticket_acknowledged';
  let recommendedActionLabel = 'Log Ticket Reference to SLA Tracker';

  if (triage.category === 'DELIVERY_BOUNCE_NDR') {
    classification = 'delivery_bounce';
    recommendedActionLabel = 'Switch to Fallback DPO or Web-Form Runner';
  } else if (triage.category === 'DELETION_CONFIRMED' && safeLinks.length === 0) {
    classification = 'removal_confirmed';
    recommendedActionLabel = 'Mark Broker Record Verified Purged';
  } else if (safeLinks.length > 0) {
    classification = 'verification_link_ready';
    recommendedActionLabel = 'Execute Confirmation Link in Headless Browser';
  } else if (
    triage.category === 'EXCESSIVE_ID_DEMAND' ||
    triage.category === 'EXEMPTION_CLAIM_OR_REFUSAL' ||
    triage.category === 'CONFIRMATION_LINK_REQUIRED'
  ) {
    classification = 'more_info_requested';
    recommendedActionLabel = 'Open Reply Triage & Counter-Notice';
  }

  return {
    id: params.id,
    messageId: params.messageId,
    threadId: params.threadId,
    broker,
    matchedDomain,
    from: params.from,
    subject: params.subject,
    date: params.date,
    snippet: (params.snippet || params.bodyText.replace(/\s+/g, ' ').trim()).slice(0, 220),
    classification,
    extractedTicketId: triage.extractedTicketIds[0] || null,
    safeVerificationLinks: safeLinks,
    rejectedLinksCount,
    bouncedAddresses: triage.bouncedAddresses,
    recommendedActionLabel,
  };
}
